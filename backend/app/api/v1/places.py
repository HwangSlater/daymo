import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_trip, membership_for_trip_place, require
from app.core.responses import Envelope, Page, ok, page
from app.schemas.place import TripPlaceCreateRequest, TripPlaceOut, TripPlaceUpdateRequest
from app.services import places as place_service
from app.services.places import PlaceView

router = APIRouter(tags=["places"])


def _응답(view: PlaceView) -> dict:
    return TripPlaceOut(
        id=str(view.trip_place.id),
        trip_id=str(view.trip_place.trip_id),
        name=view.place.name,
        area=view.trip_place.area,
        address=view.place.address,
        category=view.trip_place.category,
        status=view.trip_place.status,
        memo=view.trip_place.memo,
        tags=view.tags,
        map_url=view.map_url,
        version=view.trip_place.version,
    ).model_dump(by_alias=True)


@router.get("/trips/{trip_id}/places", response_model=Page[TripPlaceOut])
async def list_places(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    """여행에 담은 장소 전부. 한 여행에 담는 장소는 많아야 수십 개라 나눠 주지 않는다."""
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([_응답(view) for view in await place_service.list_for_trip(db, trip)])


@router.post("/trips/{trip_id}/places", status_code=status.HTTP_201_CREATED, response_model=Envelope[TripPlaceOut])
async def create_place(
    trip_id: uuid.UUID,
    body: TripPlaceCreateRequest,
    caller: CurrentCaller,
    db: DbSession,
    response: Response,
) -> dict:
    """
    장소를 담는다.

    앱이 만든 `id` 로 이미 담겨 있으면 새로 만들지 않고 `200` 으로 그 장소를
    돌려준다. 네트워크가 끊겨 앱이 같은 요청을 다시 보내는 경우다.
    """
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    trip_place, 만들었다 = await place_service.create(
        db,
        trip=trip,
        actor=membership,
        trip_place_id=body.id,
        name=body.name,
        area=body.area,
        address=body.address,
        category=body.category,
        status=body.status,
        memo=body.memo,
        tags=body.tags,
        map_url=body.map_url,
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_응답(await place_service.view_of(db, trip_place)))


@router.patch("/trip-places/{trip_place_id}", response_model=Envelope[TripPlaceOut])
async def update_place(
    trip_place_id: uuid.UUID, body: TripPlaceUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership, trip, trip_place = await membership_for_trip_place(
        db, user_id=caller.user.id, trip_place_id=trip_place_id
    )
    require(membership, *WRITERS)
    await place_service.update(
        db,
        trip=trip,
        trip_place=trip_place,
        actor=membership,
        version=body.version,
        changes=body.model_dump(exclude_unset=True, exclude={"version"}),
    )
    return ok(_응답(await place_service.view_of(db, trip_place)))


@router.delete("/trip-places/{trip_place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_place(trip_place_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """
    장소를 뺀다. 되돌리기 기간을 두지 않는다.

    여행·공간과 달리 장소 하나는 다시 담으면 되고, 일정은 장소가 빠져도 남는다.
    """
    membership, _, trip_place = await membership_for_trip_place(
        db, user_id=caller.user.id, trip_place_id=trip_place_id
    )
    require(membership, *WRITERS)
    await place_service.remove(db, trip_place)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
