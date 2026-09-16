"""
하루 한 번 도는 정리 작업.

    python -m app.jobs.cleanup

운영에서는 `daymo-cleanup.timer` 가 api 이미지로 한 번 실행하고 끝낸다
(backend/infra/production/daymo-cleanup). 요청을 받는 워커 안에서 돌리지 않는다.
워커가 둘이면 두 번 돌고, 재시작하면 건너뛴다.

일마다 transaction 을 따로 쓴다. 계정 정리가 실패해도 여행 정리와 시도
횟수 정리는 끝까지 간다.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_engine, get_session_factory
from app.core.logging import configure_logging
from app.core.runtime import use_selector_event_loop_on_windows
from app.services import (
    account_deletion,
    audit,
    memories,
    photos,
    places,
    space_deletion,
    throttle,
    trips,
)
from app.services.oauth import flow as oauth_flow

logger = logging.getLogger("daymo.jobs.cleanup")

Job = Callable[[AsyncSession], Awaitable[int]]

JOBS: list[tuple[str, Job]] = [
    ("accounts", lambda session: account_deletion.purge_deleted_accounts(session)),
    ("spaces", lambda session: space_deletion.purge_deleted_spaces(session)),
    ("trips", lambda session: trips.purge_deleted_trips(session)),
    # 여행 정리 뒤에 둔다. 여행이 지워져야 그 여행만 쓰던 손 장소가 남는다.
    ("places", lambda session: places.purge_orphan_manual_places(session)),
    ("photos", lambda session: photos.purge_photos(session)),
    # 기한이 지난 원본 파일. 사진 줄과 표시본은 그대로 남는다. 사진 정리 뒤에 둔다.
    # 어차피 통째로 지워질 사진의 원본을 먼저 지우느라 일하지 않는다.
    ("photo-originals", lambda session: photos.purge_originals(session)),
    # 휴지통 기한이 지난 메모. 사진과 같은 자리에 둔다.
    ("memos", lambda session: memories.purge_memos(session)),
    ("throttle", lambda session: throttle.purge_expired(session)),
    # 소셜 로그인 도중의 줄. 제공자가 준 이메일·이름이 들어 있어 오래 두지 않는다.
    ("oauth", lambda session: oauth_flow.purge_expired(session)),
    # 보유기간(6개월)이 지난 감사 기록. 앞의 일들과 순서를 다투지 않는다.
    # 여기서 지우는 것은 오늘 생긴 줄이 아니라 반년 전 줄이다.
    ("audit", lambda session: audit.purge_expired(session)),
]


async def run() -> bool:
    """모든 일을 돌린다. 하나라도 실패하면 False. timer 가 실패로 기록하게 한다."""
    모두_성공 = True
    # 감사 기록 조회 API 가 없어서, 운영자가 무엇이 몇 건 파기됐는지 보는 곳은
    # 이 로그뿐이다. 한 줄로도 모아 둬야 `journalctl -u daymo-cleanup` 에서
    # 하루치를 한눈에 본다.
    센_것: list[str] = []
    for 이름, 일 in JOBS:
        async with get_session_factory()() as session:
            try:
                수 = await 일(session)
                await session.commit()
                logger.info("정리 %s: %d", 이름, 수)
                센_것.append(f"{이름}={수}")
            except Exception:
                await session.rollback()
                모두_성공 = False
                센_것.append(f"{이름}=실패")
                logger.exception("정리 %s 실패", 이름)
    logger.info("정리 끝: %s", " ".join(센_것))
    await get_engine().dispose()
    return 모두_성공


def main() -> int:
    configure_logging()
    use_selector_event_loop_on_windows()
    return 0 if asyncio.run(run()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
