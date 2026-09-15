"""
메모와 사진의 휴지통.

지운 뒤 7일 안이면 되살린다(docs/development/03-api-specification.md 10장). 기한은
지운 시각에서 센다. 사진은 기한이 지나면 정리 작업이 줄과 파일을 지우지만, 정리가
돌기 전이라도 기한이 지났으면 되살리지 않고 `410` 이다. 정리 작업이 언제 도느냐에
따라 되살아나기도 하고 아니기도 하면 7일이라는 안내가 거짓이 된다(여행 복구와 같다).

권한은 지울 때와 같다.

- 메모: owner·editor 면 누가 쓰고 누가 지웠든 되살린다.
- 사진: 올린 사람과 owner 만.
- 휴지통 보기: owner·editor. 보기만 하는 멤버에게는 되살릴 것이 없어서 보여 주지 않는다.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import Membership, Memo, Photo, PhotoStatus, Trip
from app.services.photos import TRASH_DAYS, can_manage

TRASH_WINDOW = timedelta(days=TRASH_DAYS)
PREVIEW_CHARS = 40


def restore_deadline(deleted_at: datetime) -> datetime:
    return deleted_at + TRASH_WINDOW


def memo_preview(body: str) -> str:
    """줄바꿈과 겹친 공백을 한 칸으로 줄이고 앞 40자만."""
    return " ".join(body.split())[:PREVIEW_CHARS].rstrip()


async def list_trash(session: AsyncSession, trip: Trip, *, now: datetime | None = None) -> tuple[list[Memo], list[Photo]]:
    """
    아직 되살릴 수 있는 메모와 사진. 둘 다 최근에 지운 것부터.

    다 올라온 여행 사진만 넣는다. 영수증은 기록 목록에 없던 것이라 여기에도 없고,
    올리다 만 줄과 운영자가 제한한 사진은 앱에서 되살릴 것이 아니다.
    """
    기준 = (now or datetime.now(UTC)) - TRASH_WINDOW
    memos = (
        await session.execute(
            select(Memo)
            .where(Memo.trip_id == trip.id, Memo.deleted_at.is_not(None), Memo.deleted_at > 기준)
            .order_by(Memo.deleted_at.desc(), Memo.id)
        )
    ).scalars()
    photos = (
        await session.execute(
            select(Photo)
            .where(
                Photo.trip_id == trip.id,
                Photo.deleted_at.is_not(None),
                Photo.deleted_at > 기준,
                Photo.status == PhotoStatus.READY,
                Photo.is_receipt.is_(False),
            )
            .order_by(Photo.deleted_at.desc(), Photo.id)
        )
    ).scalars()
    return list(memos), list(photos)


def _기한을_본다(deleted_at: datetime, now: datetime | None) -> None:
    if restore_deadline(deleted_at) <= (now or datetime.now(UTC)):
        raise AppError(ErrorCode.GONE)


async def restore_memo(session: AsyncSession, memo: Memo, *, now: datetime | None = None) -> bool:
    """되살렸으면 True. 지우지 않은 메모면 아무것도 하지 않고 False 다(같은 요청이 두 번 와도 된다)."""
    if memo.deleted_at is None:
        return False
    _기한을_본다(memo.deleted_at, now)
    memo.deleted_at = None
    memo.deleted_by = None
    memo.version += 1
    await session.flush()
    return True


async def restore_photo(session: AsyncSession, photo: Photo, *, actor: Membership, now: datetime | None = None) -> bool:
    if photo.status not in (PhotoStatus.UPLOADING, PhotoStatus.READY):
        raise AppError(ErrorCode.NOT_FOUND)
    if not can_manage(actor, photo):
        raise AppError(ErrorCode.FORBIDDEN)
    if photo.deleted_at is None:
        return False
    _기한을_본다(photo.deleted_at, now)
    photo.deleted_at = None
    photo.deleted_by = None
    photo.version += 1
    await session.flush()
    return True
