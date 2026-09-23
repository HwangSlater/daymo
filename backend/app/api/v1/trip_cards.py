import uuid
from typing import Literal

from fastapi import APIRouter, Header, Query, Request, Response, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_trip, membership_for_trip_row, require
from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.core.responses import ok, page
from app.models import Membership, TripCard
from app.schemas.trip import TripCardCreateRequest, TripCardOut, TripCardUpdateRequest
from app.services import photo_files
from app.services import photos as photo_service
from app.services import trip_cards as card_service

router = APIRouter(tags=["trip cards"])


def _응답(card: TripCard, membership: Membership) -> dict:
    return TripCardOut(
        id=str(card.id),
        trip_id=str(card.trip_id),
        settings=card.settings or {},
        sort_order=card.sort_order,
        created_by_membership_id=(
            str(card.created_by_membership_id) if card.created_by_membership_id else None
        ),
        can_manage=card_service.can_manage(membership, card),
        created_at=card.created_at,
        version=card.version,
        image_version=card.image_version if card.image_path else None,
    ).model_dump(by_alias=True, mode="json")


@router.get("/trips/{trip_id}/cards")
async def list_trip_cards(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    """만든 차례대로. 공간 멤버면 남이 만든 카드도 본다."""
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([_응답(card, membership) for card in await card_service.list_cards(db, trip)])


@router.post("/trips/{trip_id}/cards", status_code=status.HTTP_201_CREATED)
async def create_trip_card(
    trip_id: uuid.UUID,
    body: TripCardCreateRequest,
    caller: CurrentCaller,
    db: DbSession,
    response: Response,
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    card, 만들었다 = await card_service.create_card(
        db,
        trip=trip,
        actor=membership,
        card_id=body.id,
        settings=body.settings.stored(),
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_응답(card, membership))


@router.patch("/trip-cards/{card_id}")
async def update_trip_card(
    card_id: uuid.UUID,
    body: TripCardUpdateRequest,
    caller: CurrentCaller,
    db: DbSession,
    keeps_unknown: str | None = Header(default=None, alias=card_service.KEEPS_UNKNOWN_HEADER),
) -> dict:
    """
    꾸민 값을 통째로 바꾼다.

    `X-Daymo-Card-Keeps-Unknown` 이 없으면 모르는 값을 버리는 옛 앱(1.0.0)이 보낸 것으로
    보고, 그 앱이 버렸을 값을 지금 저장된 카드에서 되살려 합친다
    (`card_service.merge_old_app_settings`).
    """
    membership, trip, card = await membership_for_trip_row(
        db, user_id=caller.user.id, model=TripCard, row_id=card_id
    )
    require(membership, *WRITERS)
    await card_service.update_card(
        db,
        trip=trip,
        card=card,
        actor=membership,
        version=body.version,
        settings=body.settings.stored(),
        keeps_unknown=keeps_unknown == "1",
    )
    return ok(_응답(card, membership))


@router.delete("/trip-cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip_card(card_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """만든 사람과 owner 만 지운다. 사진과 같은 규칙이다."""
    membership, _, card = await membership_for_trip_row(
        db, user_id=caller.user.id, model=TripCard, row_id=card_id
    )
    require(membership, *WRITERS)
    await card_service.remove_card(db, card=card, actor=membership)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/trip-cards/{card_id}/image")
async def upload_trip_card_image(
    card_id: uuid.UUID,
    request: Request,
    caller: CurrentCaller,
    db: DbSession,
    version: int = Query(...),
) -> dict:
    """
    앱이 카드를 완료할 때 원본 화질로 그린 완성 이미지. 파일을 그대로 보낸다(multipart 가 아니다).

    `version` 은 이 그림을 그린 카드 버전이다. 지금 카드 버전과 다르면 409 로, 앱은 카드를
    다시 받아 그린 뒤 올린다. 받으면서 크기를 세서 한도를 넘는 순간 끊는다(사진 올리기와 같다).
    PNG·JPEG 를 받아 품질 92 의 JPEG 로 다시 쓴다. 긴 변은 줄이지 않는다.
    """
    membership, trip, card = await membership_for_trip_row(
        db, user_id=caller.user.id, model=TripCard, row_id=card_id
    )
    require(membership, *WRITERS)
    card_service.check_image_upload(membership, card, version)

    한도 = get_settings().trip_card_image_max_bytes
    선언 = request.headers.get("content-length")
    if 선언 and 선언.isdigit() and int(선언) > 한도:
        raise AppError(ErrorCode.PHOTO_TOO_LARGE, message="카드 이미지가 너무 커요.")

    임시 = photo_files.temp_path()
    받은_크기 = 0
    try:
        with 임시.open("wb") as file:
            async for chunk in request.stream():
                받은_크기 += len(chunk)
                if 받은_크기 > 한도:
                    raise AppError(ErrorCode.PHOTO_TOO_LARGE, message="카드 이미지가 너무 커요.")
                file.write(chunk)
        if 받은_크기 == 0:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"content": "이미지 파일이 비어 있어요."})
        # 다시 쓴 JPEG 크기는 변환 뒤에야 안다. 받은 크기로 미리 본다(사진과 같다).
        await photo_service.check_quota(db, trip, 받은_크기 - (card.image_bytes or 0))
        async with photo_files.convert_turn:
            try:
                경로, 크기 = await run_in_threadpool(
                    photo_files.store_card_image, 임시, trip.id, card.id, version
                )
            except photo_files.NotAPhoto as error:
                raise AppError(
                    ErrorCode.VALIDATION_ERROR, fields={"content": "PNG, JPEG 이미지만 올릴 수 있어요."}
                ) from error
    finally:
        photo_files.discard(임시)

    옛_파일 = await card_service.set_image(db, card=card, version=version, path=경로, size=크기)
    photo_files.remove_card_image(옛_파일)
    return ok(_응답(card, membership))


@router.get("/trip-cards/{card_id}/image")
async def trip_card_image(
    card_id: uuid.UUID,
    caller: CurrentCaller,
    db: DbSession,
    size: Literal["full", "small"] = "full",
) -> Response:
    """
    공간 멤버에게만 준다. 이미지가 없으면 404 다.

    `size=small` 은 긴 변 1080 의 작은 사본이다. 앱이 격자를 띄울 때 미리 받아 두는 것이라
    작아야 한다(2026-09-23). 작은 사본이 생기기 전에 올린 카드는 여기서 완성본으로 만든다.

    같은 주소에서 카드 버전이 바뀌면 다른 파일이 나가므로 사진처럼 오래 캐시하지 않는다.
    어느 버전의 그림인지는 카드의 `imageVersion` 으로 안다.

    `photo_accel_prefix` 가 있으면 본문 없이 `X-Accel-Redirect` 만 답하고 파일은 nginx 가 보낸다.
    """
    _, _, card = await membership_for_trip_row(
        db, user_id=caller.user.id, model=TripCard, row_id=card_id
    )
    if not card.image_path:
        raise AppError(ErrorCode.NOT_FOUND)
    상대 = card.image_path
    if size == "small":
        async with photo_files.convert_turn:
            상대 = await run_in_threadpool(photo_files.ensure_card_small, card.image_path)
        if not 상대:
            raise AppError(ErrorCode.NOT_FOUND)
    파일 = photo_files.absolute(상대)
    if not 파일.is_file():
        raise AppError(ErrorCode.NOT_FOUND)
    머리 = {"Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff"}
    접두 = get_settings().photo_accel_prefix
    if 접두:
        머리["X-Accel-Redirect"] = photo_files.accel_uri(접두, 상대)
        return Response(status_code=status.HTTP_200_OK, media_type="image/jpeg", headers=머리)
    return FileResponse(파일, media_type="image/jpeg", headers=머리)
