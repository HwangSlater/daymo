import hashlib
import uuid
from datetime import UTC, date as Date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_trip, membership_for_trip_row, require
from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.core.responses import Envelope, Page, ok, page
from app.models import Photo, PhotoStatus, PhotoTargetType
from app.schemas.photo import (
    PhotoCreateRequest,
    PhotoLinkOut,
    PhotoLinkTarget,
    PhotoOut,
    PhotoUpdateRequest,
)
from app.services import audit, photo_files
from app.services import photos as photo_service
from app.services.memories import author_names, name_of
from app.services.schedule import zone_of

router = APIRouter(tags=["photos"])

# 워커 하나에서 그림 변환은 한 번에 하나만. 카드 이미지와 함께 쓴다(`photo_files.convert_turn`).
_변환_차례 = photo_files.convert_turn

# 사진이 붙어 있는 곳. 사진 id 마다 목록이고, 없으면 빈 목록이다.
Links = dict[uuid.UUID, list[tuple[PhotoTargetType, uuid.UUID]]]


def _사진_응답(photo: Photo, names: dict, links: Links) -> dict:
    return PhotoOut(
        id=str(photo.id),
        trip_id=str(photo.trip_id),
        status=photo.status,
        caption=photo.caption,
        date=photo.taken_on,
        taken_at=photo.taken_at,
        width=photo.width,
        height=photo.height,
        bytes=photo.stored_bytes,
        original_until=photo.original_expires_at if photo.original_path else None,
        is_receipt=photo.is_receipt,
        uploader_membership_id=str(photo.uploader_membership_id) if photo.uploader_membership_id else None,
        uploader_name=name_of(names, photo.uploader_membership_id),
        created_at=photo.created_at,
        version=photo.version,
        links=[
            PhotoLinkOut(target_type=target_type, target_id=str(target_id))
            for target_type, target_id in links.get(photo.id, [])
        ],
    ).model_dump(by_alias=True, mode="json")


def _붙일_곳(links) -> list[tuple[PhotoTargetType, uuid.UUID]]:
    return [(PhotoTargetType(link.target_type), link.target_id) for link in links]


async def _한_장(db, photo: Photo) -> dict:
    return _사진_응답(
        photo,
        await author_names(db, [photo.uploader_membership_id]),
        await photo_service.links_of(db, [photo.id]),
    )


async def _살아_있는_사진(db, caller, photo_id: uuid.UUID):
    membership, trip, photo = await membership_for_trip_row(db, user_id=caller.user.id, model=Photo, row_id=photo_id)
    if photo.deleted_at is not None or photo.status not in (PhotoStatus.UPLOADING, PhotoStatus.READY):
        raise AppError(ErrorCode.NOT_FOUND)
    return membership, trip, photo


@router.get("/trips/{trip_id}/photos", response_model=Page[PhotoOut])
async def list_photos(
    trip_id: uuid.UUID,
    caller: CurrentCaller,
    db: DbSession,
    target_type: PhotoLinkTarget | None = Query(default=None, alias="targetType"),
    target_id: uuid.UUID | None = Query(default=None, alias="targetId"),
    date: Date | None = Query(default=None),
) -> dict:
    """
    다 올라온 여행 사진. 영수증은 지출이 가리키므로 여기 없다.

    `targetType`·`targetId` 를 함께 주면 그곳에 붙은 사진만, `date` 를 주면 그날로 고른
    사진만 준다. 숙소 카드가 `targetType=stay` 로 한 번, `date` 로 한 번 물어서
    "그 숙소 사진" 과 "그날 사진" 을 함께 보여 준다.
    """
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    if (target_type is None) != (target_id is None):
        raise AppError(
            ErrorCode.VALIDATION_ERROR, fields={"targetId": "붙은 곳으로 찾으려면 종류와 id 를 함께 주세요."}
        )
    target = (PhotoTargetType(target_type), target_id) if target_type and target_id else None
    photos = await photo_service.list_photos(db, trip, target=target, on=date)
    names = await author_names(db, [photo.uploader_membership_id for photo in photos])
    links = await photo_service.links_of(db, [photo.id for photo in photos])
    return page([_사진_응답(photo, names, links) for photo in photos])


@router.post("/trips/{trip_id}/photos", status_code=status.HTTP_201_CREATED, response_model=Envelope[PhotoOut])
async def create_photo(
    trip_id: uuid.UUID, body: PhotoCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    값 = body.model_dump(exclude={"id"})
    값["links"] = _붙일_곳(body.links)
    photo, 만들었다 = await photo_service.create_photo(
        db, trip=trip, actor=membership, photo_id=body.id, values=값
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(await _한_장(db, photo))


@router.put("/photos/{photo_id}/content", response_model=Envelope[PhotoOut])
async def upload_photo_content(photo_id: uuid.UUID, request: Request, caller: CurrentCaller, db: DbSession) -> dict:
    """
    파일을 그대로 보낸다(multipart 가 아니다). 이미 다 올라온 사진이면 받지 않고 그대로 답한다.

    받으면서 크기를 세서 한도를 넘는 순간 끊는다. 서버 메모리에 파일을 모으지 않는다.
    """
    membership, trip, photo = await _살아_있는_사진(db, caller, photo_id)
    require(membership, *WRITERS)
    if photo.uploader_membership_id != membership.id:
        raise AppError(ErrorCode.FORBIDDEN)
    if photo.status == PhotoStatus.READY:
        return ok(await _한_장(db, photo))

    한도 = get_settings().photo_max_bytes
    선언 = request.headers.get("content-length")
    if 선언 and 선언.isdigit() and int(선언) > 한도:
        raise AppError(ErrorCode.PHOTO_TOO_LARGE)

    임시 = photo_files.temp_path()
    hasher = hashlib.sha256()
    받은_크기 = 0
    try:
        with 임시.open("wb") as file:
            async for chunk in request.stream():
                받은_크기 += len(chunk)
                if 받은_크기 > 한도:
                    raise AppError(ErrorCode.PHOTO_TOO_LARGE)
                hasher.update(chunk)
                file.write(chunk)
        if 받은_크기 == 0:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"content": "사진 파일이 비어 있어요."})
        if hasher.hexdigest() != photo.checksum:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"checksum": "받은 파일이 보낸다고 한 파일과 달라요. 다시 올려 주세요."})
        # 앱이 말한 크기보다 커졌으면 그만큼 한도를 다시 본다.
        if 받은_크기 > (photo.original_bytes or 0):
            await photo_service.check_quota(db, trip, 받은_크기 - (photo.original_bytes or 0))

        zone = await zone_of(db, trip)
        async with _변환_차례:
            try:
                저장 = await run_in_threadpool(photo_files.store, 임시, trip.id, photo.id, zone)
            except photo_files.NotAPhoto as error:
                raise AppError(
                    ErrorCode.VALIDATION_ERROR, fields={"content": "JPEG, PNG, WebP 사진만 올릴 수 있어요."}
                ) from error
    finally:
        photo_files.discard(임시)

    photo.original_path = 저장.original_path
    photo.display_path = 저장.display_path
    photo.thumbnail_path = 저장.thumbnail_path
    photo.original_mime = 저장.mime
    photo.original_bytes = 받은_크기
    photo.stored_bytes = 저장.stored_bytes
    photo.width = 저장.width
    photo.height = 저장.height
    photo.taken_at = 저장.taken_at
    # 원본을 받아 갈 수 있는 기한. 지나면 정리 작업이 원본만 지운다.
    photo.original_expires_at = datetime.now(UTC) + timedelta(days=photo_service.ORIGINAL_DAYS)
    photo.status = PhotoStatus.READY
    await db.flush()
    return ok(await _한_장(db, photo))


@router.get("/photos/{photo_id}/content")
async def photo_content(
    photo_id: uuid.UUID,
    caller: CurrentCaller,
    db: DbSession,
    variant: Literal["thumbnail", "display", "original"] = Query(default="display"),
) -> Response:
    """
    공간 멤버에게만 파일을 준다. 주소를 알아도 멤버가 아니면 404 다.

    같은 id 의 파일은 바뀌지 않으므로 기기가 오래 캐시해도 된다. 공유 캐시에는 두지 않는다.

    `photo_accel_prefix` 가 있으면 본문 없이 `X-Accel-Redirect` 만 답하고 파일은 nginx 가 보낸다.
    nginx 는 이 응답의 Content-Type 과 Cache-Control 을 그대로 쓴다.
    """
    _, _, photo = await _살아_있는_사진(db, caller, photo_id)
    if photo.status != PhotoStatus.READY:
        raise AppError(ErrorCode.NOT_FOUND)
    경로 = {"thumbnail": photo.thumbnail_path, "display": photo.display_path, "original": photo.original_path}[variant]
    if not 경로:
        # 표시본이 있는데 원본만 없으면 기한이 지나 지운 것이다. 사진이 없는 것과
        # 다르므로 앱이 "화면 크기로 저장" 으로 넘어갈 수 있게 따로 답한다.
        if variant == "original" and photo.display_path:
            raise AppError(
                ErrorCode.GONE,
                message=f"원본은 올린 지 {photo_service.ORIGINAL_DAYS}일까지만 받을 수 있어요.",
            )
        raise AppError(ErrorCode.NOT_FOUND)
    파일 = photo_files.absolute(경로)
    if not 파일.is_file():
        raise AppError(ErrorCode.NOT_FOUND)
    형식 = photo.original_mime if variant == "original" and photo.original_mime else "image/jpeg"
    머리 = {
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
    }
    접두 = get_settings().photo_accel_prefix
    if 접두:
        머리["X-Accel-Redirect"] = photo_files.accel_uri(접두, 경로)
        return Response(status_code=status.HTTP_200_OK, media_type=형식, headers=머리)
    return FileResponse(파일, media_type=형식, headers=머리)


@router.patch("/photos/{photo_id}", response_model=Envelope[PhotoOut])
async def update_photo(photo_id: uuid.UUID, body: PhotoUpdateRequest, caller: CurrentCaller, db: DbSession) -> dict:
    """설명·날짜와 붙은 곳. 올린 사람과 owner 만 고친다."""
    membership, _, photo = await _살아_있는_사진(db, caller, photo_id)
    require(membership, *WRITERS)
    바꿀_것 = body.model_dump(exclude_unset=True, exclude={"version"})
    if "links" in 바꿀_것:
        바꿀_것["links"] = _붙일_곳(body.links or [])
    await photo_service.update_photo(
        db, photo=photo, actor=membership, version=body.version, changes=바꿀_것
    )
    return ok(await _한_장(db, photo))


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(photo_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """올린 사람과 owner 만. 7일 뒤 정리 작업이 파일까지 지운다."""
    membership, trip, photo = await _살아_있는_사진(db, caller, photo_id)
    require(membership, *WRITERS)
    await photo_service.remove_photo(db, photo=photo, actor=membership)
    await audit.record(db, space_id=trip.space_id, actor_membership_id=membership.id, action="photo.delete", target_type="photo", target_id=photo.id, summary_fields={"tripId": str(trip.id)})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
