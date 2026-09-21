"""
이미 올라간 사진의 표시본을 지금 크기로 다시 만드는 일회성 작업.

    python -m app.jobs.rebuild_display           # 세기만 한다. 아무것도 바꾸지 않는다.
    python -m app.jobs.rebuild_display --apply   # 실제로 다시 만든다.

2026-09-21에 표시본을 1440px/품질 82 에서 2048px/품질 88 로 올렸다
(`app.services.photo_files.DISPLAY_EDGE`). 새로 올리는 사진만 새 크기로 만들어지므로,
원본이 아직 남아 있는 사진(올린 지 30일 안쪽)을 원본에서 다시 만든다. 원본이 없는
사진은 건너뛴다.

DB 는 `stored_bytes` 만 고친다. 공간 한도가 사진마다의 이 값을 더해 세기 때문에,
표시본이 커진 만큼 더해 두지 않으면 한도가 실제 디스크보다 작게 잡힌다(원본 기한이
지나 원본을 지울 때 빼 주는 것과 같은 까닭이다, `services.photos`). 표시본 경로는
그대로이고, `photos.width`·`height` 는 원본(방향을 바로잡은) 크기라 표시본과 상관이 없다.

사진 id 와 경로 말고는 아무것도 출력하지 않는다. 설명·올린 사람은 읽지도 않는다.
"""

import argparse
import asyncio
import logging
import uuid
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_engine, get_session_factory
from app.core.logging import configure_logging
from app.core.runtime import use_selector_event_loop_on_windows
from app.models import Photo, PhotoStatus
from app.services import photo_files
from app.services.photo_files import DisplayState

logger = logging.getLogger("daymo.jobs.rebuild_display")


@dataclass(frozen=True)
class Target:
    photo_id: uuid.UUID
    original_path: str | None
    display_path: str


async def targets(session: AsyncSession) -> list[Target]:
    """
    표시본이 있는 사진 전부. 휴지통에 든 것도 넣는다. 되살리면 다시 보이기 때문이다.

    경로 세 칸만 읽는다. 목록을 다 읽은 뒤 세션을 닫고 파일 일을 하므로,
    한 장씩 오래 걸려도 DB 연결을 붙잡고 있지 않다.
    """
    rows = await session.execute(
        select(Photo.id, Photo.original_path, Photo.display_path)
        .where(Photo.display_path.is_not(None), Photo.status != PhotoStatus.UPLOADING)
        .order_by(Photo.created_at)
    )
    return [Target(row.id, row.original_path, row.display_path) for row in rows]


def process(items: list[Target], *, apply: bool, grown: dict[uuid.UUID, int] | None = None) -> Counter[str]:
    """
    한 장씩 보고 셈을 돌려준다. `apply` 가 아니면 파일을 건드리지 않는다.

    셈 이름: rebuild(다시 만들 것·만든 것), no-original, up-to-date, failed,
    그리고 `apply` 일 때 늘어난 바이트 합 added-bytes.
    """
    counts: Counter[str] = Counter()
    for item in items:
        try:
            state = photo_files.display_state(item.original_path, item.display_path)
        except Exception:
            counts["failed"] += 1
            logger.exception("표시본 확인 실패: %s", item.photo_id)
            continue
        if state != DisplayState.REBUILD:
            counts[state.value] += 1
            continue
        if not apply:
            counts[DisplayState.REBUILD.value] += 1
            continue
        try:
            before, after = photo_files.rebuild_display(item.original_path or "", item.display_path)
        except Exception:
            counts["failed"] += 1
            # 예외 내용에는 경로만 들어 있다. 사용자 정보는 여기까지 오지 않는다.
            logger.exception("표시본 다시 만들기 실패: %s", item.photo_id)
            continue
        counts[DisplayState.REBUILD.value] += 1
        counts["added-bytes"] += after - before
        if grown is not None:
            grown[item.photo_id] = after - before
        logger.info("표시본 다시 만듦: %s %s (%d → %d 바이트)", item.photo_id, item.display_path, before, after)
    return counts


def summary(counts: Counter[str], *, apply: bool) -> str:
    rebuild = counts[DisplayState.REBUILD.value]
    lines = [
        f"{'다시 만든 것' if apply else '다시 만들 것'}: {rebuild}",
        f"원본 없어 건너뜀: {counts[DisplayState.NO_ORIGINAL.value]}",
        f"이미 새 크기라 건너뜀: {counts[DisplayState.UP_TO_DATE.value]}",
        f"실패: {counts['failed']}",
    ]
    if apply:
        lines.append(f"늘어난 크기: {counts['added-bytes'] / 1024 / 1024:.1f}MB (공간 한도에 더했다)")
    else:
        lines.append("세기만 했다. 실제로 만들려면 --apply 를 붙인다.")
    return "\n".join(lines)


async def run(*, apply: bool) -> bool:
    """실패가 하나라도 있으면 False."""
    async with get_session_factory()() as session:
        items = await targets(session)
    await get_engine().dispose()
    # 이미지 변환은 CPU 를 쓰는 동기 일이다. 이 작업은 따로 도는 프로세스라 그대로 부른다.
    grown: dict[uuid.UUID, int] = {}
    counts = process(items, apply=apply, grown=grown)
    if apply and grown:
        async with get_session_factory()() as session:
            await add_grown_bytes(session, grown)
            await session.commit()
        await get_engine().dispose()
    print(summary(counts, apply=apply))
    return counts["failed"] == 0


async def add_grown_bytes(session: AsyncSession, grown: dict[uuid.UUID, int]) -> None:
    """
    다시 만든 만큼 `stored_bytes` 에 더한다. 부르는 쪽이 한 transaction 으로 commit 한다.

    파일을 다 만든 뒤에 한다. 도중에 멈추면 이미 만든 파일은 새 크기인데 DB 는 옛 값으로
    남는데, 다시 돌리면 그 사진은 「이미 새 크기」라 건너뛰어 끝내 더해지지 않는다.
    그 경우는 실패로 로그에 남긴다. 값이 비어 있는(옛) 줄은 원본 크기로 세고 있으므로
    건드리지 않는다.
    """
    for photo_id, delta in grown.items():
        await session.execute(
            update(Photo)
            .where(Photo.id == photo_id, Photo.stored_bytes.is_not(None))
            .values(stored_bytes=Photo.stored_bytes + delta)
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.jobs.rebuild_display")
    parser.add_argument("--apply", action="store_true", help="실제로 다시 만든다. 없으면 세기만 한다.")
    args = parser.parse_args(argv)
    configure_logging()
    use_selector_event_loop_on_windows()
    return 0 if asyncio.run(run(apply=args.apply)) else 1


if __name__ == "__main__":
    raise SystemExit(main())
