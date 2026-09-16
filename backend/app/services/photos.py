"""
여행 사진과 영수증 사진.

올리기는 두 번에 나눈다.

1. `POST /trips/{id}/photos` 로 사진 줄을 만든다. 앱이 정한 id, 크기, SHA-256 을 받고
   한도를 먼저 본다. 이 줄은 `uploading` 이다.
2. `PUT /photos/{id}/content` 로 파일을 그대로 보낸다. 서버는 받으면서 크기를 세고,
   다 받으면 SHA-256 을 맞춰 본 뒤 열어서 표시본·썸네일을 만들고 `ready` 로 바꾼다.

1번이 끝나고 2번이 끊기면 앱은 2번만 다시 보낸다. 하루 넘게 `uploading` 인 줄은
정리 작업이 지운다.

사진은 장소·일정·숙소에 붙을 수 있다(`photo_links`). 붙은 곳은 사진 줄의 `links` 로
오간다. 따로 붙이고 떼는 주소를 두지 않는 이유는 앱이 목록 하나를 통째로 맞추는
방식이라(`mobile/src/listSync.ts`) 사진 줄과 연결이 따로 오면 두 값이 어긋나서다.
날짜는 연결이 아니라 사진 자신의 `taken_on` 이다. 여행 기간이 바뀌어도 사진이
놓인 날은 그대로여야 해서 `trip_days` 를 가리키지 않는다.

권한: 올리기는 owner·editor. 설명·날짜·연결 고치기와 지우기는 올린 사람과 owner 만
(docs/development/03-api-specification.md 10장). 보기는 공간 멤버 전원.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.models import (
    Membership,
    MembershipRole,
    Photo,
    PhotoLink,
    PhotoStatus,
    PhotoTargetType,
    ScheduleItem,
    Stay,
    Trip,
    TripPlace,
)
from app.services import photo_files

# 지운 사진을 되살릴 수 있는 기간. 지나면 파일과 줄을 함께 지운다.
TRASH_DAYS = 7
# 원본을 내려받을 수 있는 기간.
#
# 원본은 기록이 아니라 "함께 간 사람이 받아 갈 파일" 이다. 찍은 사람 폰에는 이미 있고,
# 없는 사람은 같이 간 사람뿐이다. 화면에는 표시본(긴 변 1440px)만 쓰므로 원본이 사라져도
# 여행 기록은 그대로 남는다. 한 장에 원본이 표시본의 열 배가 넘어서, 계속 두면 공간
# 한도의 대부분을 아무도 열지 않는 파일이 차지한다(2026-09-16 결정).
#
# 앱은 `originalUntil` 로 남은 기간을 보여 주고, 기한이 지난 뒤 저장하면 표시본을 준다.
ORIGINAL_DAYS = 30
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


async def list_photos(
    session: AsyncSession,
    trip: Trip,
    *,
    target: tuple[PhotoTargetType, uuid.UUID] | None = None,
    on: date | None = None,
) -> list[Photo]:
    """
    다 올라온 여행 사진. 영수증과 지운 사진은 뺀다. 고른 날, 올린 순서다.

    `target` 은 그곳에 붙은 사진만, `on` 은 그날로 고른 사진만 고른다. 숙소 글을
    눌렀을 때 그 숙소 사진과 그날 사진을 함께 보여 주려고 둘을 따로 뒀다.
    """
    query = select(Photo).where(
        Photo.trip_id == trip.id,
        Photo.status == PhotoStatus.READY,
        Photo.deleted_at.is_(None),
        Photo.is_receipt.is_(False),
    )
    if target is not None:
        query = query.join(PhotoLink, PhotoLink.photo_id == Photo.id).where(
            PhotoLink.target_type == target[0], PhotoLink.target_id == target[1]
        )
    if on is not None:
        query = query.where(Photo.taken_on == on)
    query = query.order_by(Photo.taken_on.is_(None), Photo.taken_on, Photo.created_at, Photo.id)
    return list((await session.execute(query)).scalars())


# 사진을 붙일 수 있는 곳과 그 표. 날짜는 사진 자신의 `taken_on` 이라 여기 없고,
# 여행 전체는 사진의 `trip_id` 라 따로 붙일 것이 없다.
LINKABLE: dict[PhotoTargetType, type] = {
    PhotoTargetType.PLACE: TripPlace,
    PhotoTargetType.SCHEDULE: ScheduleItem,
    PhotoTargetType.STAY: Stay,
}


async def links_of(
    session: AsyncSession, photo_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[tuple[PhotoTargetType, uuid.UUID]]]:
    """사진마다 붙은 곳. 목록을 한 번에 그리려고 사진 여러 장을 한 질의로 읽는다."""
    붙은_곳: dict[uuid.UUID, list[tuple[PhotoTargetType, uuid.UUID]]] = {}
    if not photo_ids:
        return 붙은_곳
    rows = (
        await session.execute(
            select(PhotoLink)
            .where(PhotoLink.photo_id.in_(photo_ids))
            .order_by(PhotoLink.target_type, PhotoLink.created_at, PhotoLink.id)
        )
    ).scalars()
    for row in rows:
        붙은_곳.setdefault(row.photo_id, []).append((row.target_type, row.target_id))
    return 붙은_곳


async def set_links(
    session: AsyncSession, *, photo: Photo, targets: list[tuple[PhotoTargetType, uuid.UUID]]
) -> None:
    """
    사진이 붙을 곳을 통째로 다시 정한다. 없어진 것은 떼고 새로 온 것만 붙인다.

    같은 여행의 장소·일정·숙소만 받는다. 남의 여행 id 를 보내면 그 여행 사람이
    아닌데도 사진이 그쪽에 걸리므로 막는다.
    """
    원하는: list[tuple[PhotoTargetType, uuid.UUID]] = []
    for target_type, target_id in targets:
        model = LINKABLE.get(target_type)
        if model is None:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                fields={"links": "사진은 장소·일정·숙소에만 붙일 수 있어요. 날짜는 date 로 정해요."},
            )
        대상 = await session.get(model, target_id)
        if 대상 is None or 대상.trip_id != photo.trip_id:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"links": "이 여행에 없는 곳이에요."})
        if (target_type, target_id) not in 원하는:
            원하는.append((target_type, target_id))

    지금 = {
        (link.target_type, link.target_id): link
        for link in (
            await session.execute(select(PhotoLink).where(PhotoLink.photo_id == photo.id))
        ).scalars()
    }
    for key, link in 지금.items():
        if key not in 원하는:
            await session.delete(link)
    for target_type, target_id in 원하는:
        if (target_type, target_id) not in 지금:
            session.add(PhotoLink(photo_id=photo.id, target_type=target_type, target_id=target_id))
    await session.flush()


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
    await set_links(session, photo=photo, targets=values.get("links") or [])
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
    if "links" in changes:
        await set_links(session, photo=photo, targets=changes["links"] or [])
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


async def purge_originals(session: AsyncSession, *, now: datetime | None = None) -> int:
    """
    기한이 지난 원본 파일을 지운다. 표시본과 썸네일은 남는다. 정기 작업에서 부른다.

    파일을 먼저 지우고 경로를 비운다. 반대로 하면 아무 줄도 가리키지 않는 파일이 남는다.
    비운 만큼 `stored_bytes` 를 줄여야 공간 한도가 실제 디스크와 맞는다.
    """
    지금 = now or datetime.now(UTC)
    대상 = (
        await session.execute(
            select(Photo).where(
                Photo.original_path.is_not(None),
                Photo.original_expires_at.is_not(None),
                Photo.original_expires_at <= 지금,
            )
        )
    ).scalars().all()
    for photo in 대상:
        비운_크기 = photo_files.remove_original(photo.original_path or "")
        photo.original_path = None
        if photo.stored_bytes:
            photo.stored_bytes = max(photo.stored_bytes - 비운_크기, 0)
    await session.flush()
    return len(대상)


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
