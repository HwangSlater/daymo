"""
여행 사진과 영수증 사진.

올리기는 두 번에 나눈다.

1. `POST /trips/{id}/photos` 로 사진 줄을 만든다. 앱이 정한 id, 크기, SHA-256 을 받고
   한도를 먼저 본다. 이 줄은 `uploading` 이다.
2. `PUT /photos/{id}/content` 로 파일을 그대로 보낸다. 서버는 받으면서 크기를 세고,
   다 받으면 SHA-256 을 맞춰 본 뒤 열어서 표시본·썸네일을 만들고 `ready` 로 바꾼다.

1번이 끝나고 2번이 끊기면 앱은 2번만 다시 보낸다. 하루 넘게 `uploading` 인 줄은
정리 작업이 지운다.

권한: 올리기는 owner·editor. 설명·날짜 고치기와 지우기는 올린 사람과 owner 만
(docs/development/03-api-specification.md 10장). 보기는 공간 멤버 전원.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.models import Membership, MembershipRole, Photo, PhotoStatus, Trip
from app.services import photo_files

# 지운 사진을 되살릴 수 있는 기간. 지나면 파일과 줄을 함께 지운다.
TRASH_DAYS = 7
# 이만큼 지나도 파일이 오지 않은 줄은 버린다.
STALE_UPLOAD = timedelta(days=1)

_차지하는_상태 = (PhotoStatus.UPLOADING, PhotoStatus.READY, PhotoStatus.RESTRICTED)


async def used_bytes(session: AsyncSession, *, space_id: uuid.UUID | None = None) -> int:
    """
    디스크를 차지하는 크기. 지운 사진도 7일 동안은 파일이 남아 있어 센다.

    아직 파일이 오지 않은 줄은 앱이 말한 원본 크기로 센다. 동시에 여러 장을 올려
    한도를 넘기는 일을 막는다.
    """
    query = select(func.coalesce(func.sum(func.coalesce(Photo.stored_bytes, Photo.original_bytes)), 0)).where(
        Photo.status.in_(_차지하는_상태)
    )
    if space_id is not None:
        query = query.join(Trip, Trip.id == Photo.trip_id).where(Trip.space_id == space_id)
    return int(await session.scalar(query) or 0)


async def check_quota(session: AsyncSession, trip: Trip, more_bytes: int) -> None:
    settings = get_settings()
    if await used_bytes(session, space_id=trip.space_id) + more_bytes > settings.photo_space_quota_bytes:
        raise AppError(ErrorCode.STORAGE_QUOTA_EXCEEDED)
    if await used_bytes(session) + more_bytes > settings.photo_total_quota_bytes:
        raise AppError(ErrorCode.STORAGE_QUOTA_EXCEEDED)


async def list_photos(session: AsyncSession, trip: Trip) -> list[Photo]:
    """다 올라온 여행 사진. 영수증과 지운 사진은 뺀다. 고른 날, 올린 순서다."""
    return list(
        (
            await session.execute(
                select(Photo)
                .where(
                    Photo.trip_id == trip.id,
                    Photo.status == PhotoStatus.READY,
                    Photo.deleted_at.is_(None),
                    Photo.is_receipt.is_(False),
                )
                .order_by(Photo.taken_on.is_(None), Photo.taken_on, Photo.created_at, Photo.id)
            )
        ).scalars()
    )


async def create_photo(
    session: AsyncSession, *, trip: Trip, actor: Membership, photo_id: uuid.UUID | None, values: dict
) -> tuple[Photo, bool]:
    if photo_id is not None:
        기존 = await session.get(Photo, photo_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id or 기존.deleted_at is not None:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False
    크기 = values["bytes"]
    if 크기 > get_settings().photo_max_bytes:
        raise AppError(ErrorCode.PHOTO_TOO_LARGE)
    await check_quota(session, trip, 크기)
    photo = Photo(
        id=photo_id or uuid.uuid4(),
        trip_id=trip.id,
        uploader_membership_id=actor.id,
        caption=_caption(values.get("caption")),
        taken_on=values.get("date"),
        original_bytes=크기,
        checksum=values["checksum"].lower(),
        is_receipt=values.get("is_receipt", False),
        status=PhotoStatus.UPLOADING,
    )
    session.add(photo)
    await session.flush()
    return photo, True


def _caption(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


def can_manage(membership: Membership, photo: Photo) -> bool:
    return membership.role == MembershipRole.OWNER or photo.uploader_membership_id == membership.id


async def update_photo(session: AsyncSession, *, photo: Photo, actor: Membership, version: int, changes: dict) -> Photo:
    if not can_manage(actor, photo):
        raise AppError(ErrorCode.FORBIDDEN)
    if version != photo.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    if "caption" in changes:
        photo.caption = _caption(changes["caption"])
    if "date" in changes:
        photo.taken_on = changes["date"]
    photo.version += 1
    await session.flush()
    return photo


async def remove_photo(session: AsyncSession, *, photo: Photo, actor: Membership) -> None:
    if not can_manage(actor, photo):
        raise AppError(ErrorCode.FORBIDDEN)
    photo.deleted_at = datetime.now(UTC)
    photo.deleted_by = actor.id
    photo.version += 1
    await session.flush()


async def purge_photos(session: AsyncSession, *, now: datetime | None = None) -> int:
    """
    지운 지 7일이 지난 사진과, 하루 넘게 파일이 오지 않은 줄을 지운다. 정기 작업에서 부른다.

    파일을 먼저 지우고 줄을 지운다. 줄만 남으면 다음 날 다시 지우면 되지만,
    줄을 먼저 지우고 파일이 남으면 어디에도 기록이 없는 사진이 디스크에 남는다.
    """
    지금 = now or datetime.now(UTC)
    대상 = (
        await session.execute(
            select(Photo).where(
                (Photo.deleted_at.is_not(None) & (Photo.deleted_at <= 지금 - timedelta(days=TRASH_DAYS)))
                | ((Photo.status == PhotoStatus.UPLOADING) & (Photo.created_at <= 지금 - STALE_UPLOAD))
            )
        )
    ).scalars().all()
    for photo in 대상:
        photo_files.remove_photo(photo.trip_id, photo.id)
        await session.delete(photo)
    await session.flush()
    return len(대상)
