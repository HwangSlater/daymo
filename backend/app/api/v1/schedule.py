import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_trip, membership_for_trip_row, require
from app.core.responses import Envelope, Page, ok, page
from app.models import ScheduleItem, Stay
from app.schemas.schedule import (
    ScheduleItemCreateRequest,
    ScheduleItemOut,
    ScheduleItemUpdateRequest,
    StayCreateRequest,
    StayOut,
    StayUpdateRequest,
)
from app.services import schedule as schedule_service

router = APIRouter(tags=["schedule"])


async def _일정_응답(db, trip, view) -> dict:
    item, day, map_url = view
    zone = await schedule_service.zone_of(db, trip)
    return ScheduleItemOut(
        id=str(item.id),
        trip_id=str(item.trip_id),
        date=day,
        time=schedule_service.local_clock(item.start_at, zone),
        title=item.title,
        type=item.type,
        note=item.note,
        trip_place_id=str(item.trip_place_id) if item.trip_place_id else None,
        map_url=map_url,
        version=item.version,
    ).model_dump(by_alias=True, mode="json")


async def _숙소_응답(db, trip, stay: Stay) -> dict:
    zone = await schedule_service.zone_of(db, trip)
    return StayOut(
        id=str(stay.id),
        trip_id=str(stay.trip_id),
        trip_place_id=str(stay.trip_place_id) if stay.trip_place_id else None,
        check_in_at=schedule_service.format_local(stay.check_in_at, zone),
        check_out_at=schedule_service.format_local(stay.check_out_at, zone),
        note=stay.note,
        show_in_schedule=stay.show_in_schedule,
        version=stay.version,
    ).model_dump(by_alias=True)


# ---------------------------------------------------------------------------
# 일정
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/schedule-items", response_model=Page[ScheduleItemOut])
async def list_schedule_items(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([await _일정_응답(db, trip, view) for view in await schedule_service.list_items(db, trip)])


@router.post("/trips/{trip_id}/schedule-items", status_code=status.HTTP_201_CREATED, response_model=Envelope[ScheduleItemOut])
async def create_schedule_item(
    trip_id: uuid.UUID, body: ScheduleItemCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    """앱이 만든 `id` 로 이미 있으면 새로 만들지 않고 `200` 으로 돌려준다."""
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    item, 만들었다 = await schedule_service.create_item(
        db, trip=trip, actor=membership, item_id=body.id, values=body.model_dump(exclude={"id"})
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(await _일정_응답(db, trip, await schedule_service.item_view(db, item)))


@router.patch("/schedule-items/{item_id}", response_model=Envelope[ScheduleItemOut])
async def update_schedule_item(
    item_id: uuid.UUID, body: ScheduleItemUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership, trip, item = await membership_for_trip_row(db, user_id=caller.user.id, model=ScheduleItem, row_id=item_id)
    require(membership, *WRITERS)
    await schedule_service.update_item(
        db,
        trip=trip,
        item=item,
        actor=membership,
        version=body.version,
        changes=body.model_dump(exclude_unset=True, exclude={"version"}),
    )
    return ok(await _일정_응답(db, trip, await schedule_service.item_view(db, item)))


@router.delete("/schedule-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule_item(item_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    membership, _, item = await membership_for_trip_row(db, user_id=caller.user.id, model=ScheduleItem, row_id=item_id)
    require(membership, *WRITERS)
    await schedule_service.remove_item(db, item)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# 숙소
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/stays", response_model=Page[StayOut])
async def list_stays(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([await _숙소_응답(db, trip, stay) for stay in await schedule_service.list_stays(db, trip)])


@router.post("/trips/{trip_id}/stays", status_code=status.HTTP_201_CREATED, response_model=Envelope[StayOut])
async def create_stay(
    trip_id: uuid.UUID, body: StayCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    stay, 만들었다 = await schedule_service.create_stay(
        db, trip=trip, actor=membership, stay_id=body.id, values=body.model_dump(exclude={"id"})
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(await _숙소_응답(db, trip, stay))


@router.patch("/stays/{stay_id}", response_model=Envelope[StayOut])
async def update_stay(stay_id: uuid.UUID, body: StayUpdateRequest, caller: CurrentCaller, db: DbSession) -> dict:
    membership, trip, stay = await membership_for_trip_row(db, user_id=caller.user.id, model=Stay, row_id=stay_id)
    require(membership, *WRITERS)
    await schedule_service.update_stay(
        db, trip=trip, stay=stay, version=body.version, changes=body.model_dump(exclude_unset=True, exclude={"version"})
    )
    return ok(await _숙소_응답(db, trip, stay))


@router.delete("/stays/{stay_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stay(stay_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    membership, _, stay = await membership_for_trip_row(db, user_id=caller.user.id, model=Stay, row_id=stay_id)
    require(membership, *WRITERS)
    await schedule_service.remove_stay(db, stay)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
