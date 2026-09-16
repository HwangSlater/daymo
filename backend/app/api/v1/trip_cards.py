import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_trip, membership_for_trip_row, require
from app.core.responses import ok, page
from app.models import Membership, TripCard
from app.schemas.trip import TripCardCreateRequest, TripCardOut, TripCardUpdateRequest
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
        settings=body.settings.model_dump(by_alias=True),
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_응답(card, membership))


@router.patch("/trip-cards/{card_id}")
async def update_trip_card(
    card_id: uuid.UUID, body: TripCardUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
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
        settings=body.settings.model_dump(by_alias=True),
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
