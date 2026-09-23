import uuid

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import (
    OWNER_ONLY,
    WRITERS,
    membership_for_trip,
    membership_in_space,
    require,
)
from app.core.errors import AppError, ErrorCode
from app.core.responses import ok, page
from app.models import Trip, TripStatus
from app.schemas.trip import (
    ParticipantsRequest,
    TripCreateRequest,
    TripOut,
    TripOverviewOut,
    TripOverviewStayOut,
    TripUpdateRequest,
)
from app.services import audit
from app.services import schedule as schedule_service
from app.services import trip_overview
from app.services import trips as trip_service

router = APIRouter(tags=["trips"])


def _요약_응답(overview: trip_overview.TripOverview) -> TripOverviewOut:
    return TripOverviewOut(
        stay=TripOverviewStayOut(name=overview.stay.name, check_in_at=overview.stay.check_in_at) if overview.stay else None,
        schedule_count=overview.schedule_count,
        place_count=overview.place_count,
        restaurant_count=overview.restaurant_count,
        cafe_count=overview.cafe_count,
        packing_total=overview.packing_total,
        packing_done=overview.packing_done,
        spent_total=float(overview.spent_total),
    )


async def _여행들_응답(db, trips: list[Trip]) -> list[dict]:
    """목록은 요약을 한꺼번에 센다. 여행마다 따로 세면 목록이 길수록 질의가 늘어난다."""
    요약 = await trip_overview.overviews_of(db, trips)
    return [await _여행_응답(db, trip, 요약[trip.id]) for trip in trips]


async def _여행_응답(db, trip: Trip, overview: trip_overview.TripOverview | None = None) -> dict:
    if overview is None:
        overview = (await trip_overview.overviews_of(db, [trip]))[trip.id]
    홈_사진들, 홈_틀 = await trip_service.home_cover(db, trip)
    return TripOut(
        id=str(trip.id),
        space_id=str(trip.space_id),
        title=trip.title,
        region_code=trip.region_code,
        region_name=trip.region_name,
        start_date=trip.start_date,
        end_date=trip.end_date,
        status=trip.status,
        summary=trip.summary,
        cooking_enabled=trip.cooking_enabled,
        currency_code=trip.currency_code,
        exchange_rate=trip.exchange_rate,
        budget=trip.budget,
        simplify_settlement=trip.simplify_settlement,
        cover_photo_id=str(trip.cover_photo_id) if trip.cover_photo_id else None,
        cover_card_id=str(trip.cover_card_id) if trip.cover_card_id else None,
        cover_photo_ids=홈_사진들,
        cover_card_style=홈_틀,
        cover_focus_x=trip.cover_focus_x,
        cover_focus_y=trip.cover_focus_y,
        cover_zoom=trip.cover_zoom,
        version=trip.version,
        archived_at=trip.archived_at.isoformat() if trip.archived_at else None,
        deletion_scheduled_at=trip.deletion_scheduled_at.isoformat() if trip.deleted_at and trip.deletion_scheduled_at else None,
        participant_membership_ids=await trip_service.participant_ids(db, trip),
        overview=_요약_응답(overview),
    ).model_dump(by_alias=True)


@router.post("/spaces/{space_id}/trips", status_code=status.HTTP_201_CREATED)
async def create_trip(
    space_id: uuid.UUID, body: TripCreateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    require(membership, *WRITERS)

    trip = await trip_service.create_trip(
        db,
        space_id=space_id,
        actor=membership,
        title=body.title,
        start_date=body.start_date,
        end_date=body.end_date,
        region_code=body.region_code,
        region_name=body.region_name,
        summary=body.summary,
        cooking_enabled=body.cooking_enabled,
        participant_membership_ids=[uuid.UUID(값) for 값 in body.participant_membership_ids],
    )
    return ok(await _여행_응답(db, trip))


@router.get("/spaces/{space_id}/trips")
async def list_trips(
    space_id: uuid.UUID,
    caller: CurrentCaller,
    db: DbSession,
    status_filter: TripStatus | None = Query(default=None, alias="status"),
    trash: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
) -> dict:
    """
    여행 목록.

    지운 여행은 나오지 않는다. `trash=true` 면 아직 되돌릴 수 있는 지운 여행만 준다.
    지우고 되돌리는 것이 owner 만이라 이 목록도 owner 만 본다.

    한 번에 `limit` 줄까지만 준다. 더 있으면 `meta.nextCursor` 가 오고, 그 값을
    `cursor` 로 다시 보내면 이어서 받는다. 여행이 100 개를 넘는 공간에서도 오래된
    여행이 목록에서 사라지지 않게 하려는 것이다. 보관한 여행도 지운 여행도 같다.

    여행마다 홈 카드가 보여 줄 요약(`overview`)이 붙는다(`services/trip_overview.py`).
    """
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)

    if trash:
        require(membership, *OWNER_ONLY)
        여행들, 다음 = await trip_service.deleted_trips_page(
            db, space_id=space_id, limit=limit, cursor=cursor
        )
    else:
        여행들, 다음 = await trip_service.trips_page(
            db, space_id=space_id, status=status_filter, limit=limit, cursor=cursor
        )
    return page(await _여행들_응답(db, 여행들), next_cursor=다음)


@router.get("/trips/{trip_id}")
async def get_trip(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return ok(await _여행_응답(db, trip))


@router.patch("/trips/{trip_id}")
async def update_trip(
    trip_id: uuid.UUID, body: TripUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    trip_service.check_version(trip, body.version)

    보낸_것 = body.model_dump(exclude_unset=True, exclude={"version"})
    # 홈 화면의 여행 카드는 여행마다 하나다. 사진 한 장을 고르면 카드 쪽이 풀리고,
    # 카드를 고르면 사진 쪽이 풀린다. 둘을 한 번에 보내면 무엇이 깔릴지 알 수 없어 막는다.
    고른_사진, 고른_카드 = 보낸_것.get("cover_photo_id"), 보낸_것.get("cover_card_id")
    if 고른_사진 and 고른_카드:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            fields={"coverCardId": "홈 화면에는 사진 한 장이나 카드 하나만 쓸 수 있어요."},
        )
    if 고른_사진:
        await trip_service.check_card_photos(db, trip, [고른_사진], field="coverPhotoId")
        보낸_것["cover_photo_id"] = uuid.UUID(고른_사진)
        보낸_것["cover_card_id"] = None
    if 고른_카드:
        보낸_것["cover_card_id"] = await trip_service.check_cover_card(db, trip, 고른_카드)
        보낸_것["cover_photo_id"] = None
    # 「대표 사진 설정 해제」(coverPhotoId: null)는 카드 쪽도 함께 푼다. 홈에 깔리는 것은
    # 여행마다 하나라 사진을 비웠는데 카드가 남으면 해제가 먹지 않은 것으로 보인다. 옛
    # 앱(1.0.0)이 깔아 둔 카드를 새 앱에서 풀 길이 이것뿐이다(2026-09-23 검토 #56).
    # 같은 요청에 카드를 함께 골랐으면 그쪽이 이긴다.
    if "cover_photo_id" in 보낸_것 and not 고른_사진 and not 고른_카드:
        보낸_것["cover_card_id"] = None
    # 보여 줄 부분은 비울 수 없는 값이다. null 로 보낸 것은 안 보낸 것으로 본다.
    for 이름 in trip_service.COVER_FOCUS_DEFAULTS:
        if 이름 in 보낸_것 and 보낸_것[이름] is None:
            del 보낸_것[이름]
    # 대표로 깐 것이 달라지는데 보여 줄 부분을 함께 보내지 않았으면 기본값으로
    # 되돌린다. 앞 사진에 맞춰 둔 자리가 남아 있으면 새 사진의 엉뚱한 데가 보인다.
    # 같은 것을 다시 고른 것뿐이면(값이 그대로면) 건드리지 않는다.
    대표가_바뀐다 = any(
        이름 in 보낸_것 and 보낸_것[이름] != getattr(trip, 이름)
        for 이름 in ("cover_photo_id", "cover_card_id")
    )
    if 대표가_바뀐다 and not any(이름 in 보낸_것 for 이름 in trip_service.COVER_FOCUS_DEFAULTS):
        보낸_것.update(trip_service.COVER_FOCUS_DEFAULTS)
    for 이름, 값 in 보낸_것.items():
        setattr(trip, 이름, 값)

    # 날짜를 건드렸으면 기간 규칙을 다시 보고, 일정이 붙는 날들도 새 기간에 맞춘다.
    if "start_date" in 보낸_것 or "end_date" in 보낸_것:
        trip_service._기간을_본다(trip.start_date, trip.end_date)
        await schedule_service.sync_trip_days(db, trip)

    trip.version += 1
    await db.flush()
    return ok(await _여행_응답(db, trip))


@router.put("/trips/{trip_id}/participants")
async def set_participants(
    trip_id: uuid.UUID, body: ParticipantsRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    trip_service.check_version(trip, body.version)

    try:
        고른_ids = [uuid.UUID(값) for 값 in body.membership_ids]
    except ValueError as 원인:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            fields={"membershipIds": "이 공간의 멤버가 아닌 사람이 있어요."},
        ) from 원인

    await trip_service.set_participants(db, trip=trip, membership_ids=고른_ids, actor=membership)
    # 참가자도 여행의 내용이다. 버전을 올려야 다른 기기가 낡은 목록으로 덮어쓰지 못한다.
    trip.version += 1
    await db.flush()
    return ok(await _여행_응답(db, trip))


@router.post("/trips/{trip_id}/archive")
async def archive(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    await trip_service.archive_trip(db, trip, archived=True)
    return ok(await _여행_응답(db, trip))


@router.post("/trips/{trip_id}/unarchive")
async def unarchive(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    await trip_service.archive_trip(db, trip, archived=False)
    return ok(await _여행_응답(db, trip))


@router.delete("/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """
    여행을 지운다. owner 만 할 수 있다.

    바로 없애지 않고 7일 동안 되돌릴 수 있게 둔다.
    """
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *OWNER_ONLY)
    await trip_service.request_delete(db, trip)
    await audit.record(db, space_id=trip.space_id, actor_membership_id=membership.id, action="trip.delete", target_type="trip", target_id=trip.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/trips/{trip_id}/restore")
async def restore(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    membership, trip = await membership_for_trip(
        db, user_id=caller.user.id, trip_id=trip_id, include_deleted=True
    )
    require(membership, *OWNER_ONLY)
    지웠었다 = trip.deleted_at is not None  # 지우지 않은 여행을 되살리라고 하면 적지 않는다.
    await trip_service.restore_trip(db, trip)
    if 지웠었다:
        await audit.record(db, space_id=trip.space_id, actor_membership_id=membership.id, action="trip.restore", target_type="trip", target_id=trip.id)
    return ok(await _여행_응답(db, trip))
