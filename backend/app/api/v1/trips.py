import uuid

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import func, select

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
from app.models import (
    Membership,
    MembershipRole,
    RelationshipProfile,
    Space,
    Trip,
    TripParticipant,
    TripStatus,
    User,
)
from app.schemas.trip import (
    DeletedSpaceOut,
    ParticipantsRequest,
    SpaceCreateRequest,
    SpaceDeleteRequest,
    SpaceMemberOut,
    SpaceOut,
    SpaceUpdateRequest,
    TripCreateRequest,
    TripOut,
    TripOverviewOut,
    TripOverviewStayOut,
    TripUpdateRequest,
)
from app.services import audit
from app.services import schedule as schedule_service
from app.services import space_deletion
from app.services import trip_overview
from app.services import trips as trip_service

router = APIRouter(tags=["trips"])


async def _공간_응답(db, space: Space, membership: Membership) -> dict:
    started_on = (
        await db.execute(
            select(RelationshipProfile.started_on).where(RelationshipProfile.space_id == space.id)
        )
    ).scalar_one_or_none()
    return SpaceOut(
        id=str(space.id),
        name=space.name,
        relationship_type=space.relationship_type,
        timezone=space.timezone,
        started_on=started_on,
        my_role=membership.role,
    ).model_dump(by_alias=True)


async def _참가자_ids(db, trip: Trip) -> list[str]:
    줄들 = (
        await db.execute(
            select(TripParticipant.membership_id)
            .where(TripParticipant.trip_id == trip.id, TripParticipant.removed_at.is_(None))
            .order_by(TripParticipant.sort_order)
        )
    ).scalars().all()
    return [str(값) for 값 in 줄들]


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
        version=trip.version,
        archived_at=trip.archived_at.isoformat() if trip.archived_at else None,
        deletion_scheduled_at=trip.deletion_scheduled_at.isoformat() if trip.deleted_at and trip.deletion_scheduled_at else None,
        participant_membership_ids=await _참가자_ids(db, trip),
        overview=_요약_응답(overview),
    ).model_dump(by_alias=True)


# ---------------------------------------------------------------------------
# 공간
# ---------------------------------------------------------------------------


@router.post("/spaces", status_code=status.HTTP_201_CREATED)
async def create_space(body: SpaceCreateRequest, caller: CurrentCaller, db: DbSession) -> dict:
    """
    공간을 만든다. 만든 사람이 owner 가 된다.

    공간과 owner membership 을 한 transaction 에서 만든다. 따로 만들면
    주인 없는 공간이 생길 수 있고, 그러면 아무도 그 공간을 지울 수 없다.
    """
    space = Space(
        name=body.name,
        relationship_type=body.relationship_type,
        owner_id=caller.user.id,
        timezone=body.timezone,
        created_by=caller.user.id,
    )
    db.add(space)
    await db.flush()

    db.add(
        Membership(
            space_id=space.id,
            user_id=caller.user.id,
            role=MembershipRole.OWNER,
            created_by=caller.user.id,
        )
    )
    if body.started_on:
        db.add(RelationshipProfile(space_id=space.id, started_on=body.started_on))
    await db.flush()

    membership = (
        await db.execute(
            select(Membership).where(
                Membership.space_id == space.id,
                Membership.user_id == caller.user.id,
                Membership.left_at.is_(None),
            )
        )
    ).scalar_one()
    return ok(await _공간_응답(db, space, membership))


@router.get("/spaces")
async def list_spaces(caller: CurrentCaller, db: DbSession) -> dict:
    """내가 들어가 있는 공간 목록. 앱이 처음 여는 화면이 이것으로 시작한다."""
    줄들 = (
        await db.execute(
            select(Space, Membership)
            .join(Membership, Membership.space_id == Space.id)
            .where(
                Membership.user_id == caller.user.id,
                Membership.left_at.is_(None),
                Space.deleted_at.is_(None),
            )
            .order_by(Space.created_at)
        )
    ).all()

    return ok(
        [
            await _공간_응답(db, space, membership)
            for space, membership in 줄들
        ]
    )


@router.get("/spaces/deleted")
async def list_deleted_spaces(caller: CurrentCaller, db: DbSession) -> dict:
    """내가 관리자인, 아직 되돌릴 수 있는 지운 공간."""
    return ok(
        [
            DeletedSpaceOut(
                id=str(space.id),
                name=space.name,
                deletion_scheduled_at=space.deletion_scheduled_at.isoformat(),
            ).model_dump(by_alias=True)
            for space in await space_deletion.deleted_spaces_owned_by(db, caller.user.id)
        ]
    )


@router.delete("/spaces/{space_id}", status_code=status.HTTP_202_ACCEPTED)
async def delete_space(space_id: uuid.UUID, body: SpaceDeleteRequest, caller: CurrentCaller, db: DbSession) -> dict:
    """
    공간을 지운다. 관리자만. 모든 멤버에게서 곧바로 사라지고 7일 뒤 여행·사진까지 지워진다.

    본문이 있는 DELETE 라 이름 확인을 빼먹은 요청은 422 로 막힌다.
    """
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    space = await db.get(Space, space_id)
    assert space is not None
    await space_deletion.request_deletion(
        db,
        space=space,
        actor=membership,
        confirmation_name=body.confirmation_name,
        impact_acknowledged=body.impact_acknowledged,
    )
    return ok({"id": str(space.id), "deletionScheduledAt": space.deletion_scheduled_at.isoformat()})


@router.post("/spaces/{space_id}/restore")
async def restore_space(space_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    """지운 공간을 되돌린다. 관리자만, 7일 안에만."""
    space, membership = await space_deletion.restore(db, space_id=space_id, user_id=caller.user.id)
    return ok(await _공간_응답(db, space, membership))


@router.get("/spaces/{space_id}/members")
async def list_space_members(
    space_id: uuid.UUID,
    caller: CurrentCaller,
    db: DbSession,
    include_left: bool = Query(default=False, alias="includeLeft"),
) -> dict:
    """
    공간 멤버. `includeLeft=true` 면 나간 멤버도 `leftAt` 과 함께 뒤에 붙인다.

    지난 여행의 지출·준비물·교통편은 나간 사람을 가리킨다. 앱이 그 이름을 알아야
    `나간 멤버` 로 뭉개지 않고 누구의 것인지 보여 줄 수 있다. 공간에 함께 있던
    사람의 표시 이름이라 지금 멤버에게 새로 드러나는 것은 없다.
    """
    await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    조건 = [Membership.space_id == space_id]
    if not include_left:
        조건.append(Membership.left_at.is_(None))
    줄들 = (
        await db.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(*조건)
            .order_by(Membership.left_at.is_not(None), Membership.joined_at, Membership.id)
        )
    ).all()
    return ok(
        [
            SpaceMemberOut(
                id=str(membership.id),
                display_name=membership.nickname or user.display_name,
                role=membership.role,
                is_me=membership.user_id == caller.user.id,
                left_at=membership.left_at,
            ).model_dump(by_alias=True, mode="json", exclude_none=not include_left)
            for membership, user in 줄들
        ]
    )


@router.patch("/spaces/{space_id}")
async def update_space(
    space_id: uuid.UUID, body: SpaceUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    require(membership, *OWNER_ONLY)
    space = await db.get(Space, space_id)
    assert space is not None

    if body.name is not None:
        space.name = body.name
    if body.relationship_type is not None:
        space.relationship_type = body.relationship_type
    if "started_on" in body.model_fields_set:
        profile = (
            await db.execute(
                select(RelationshipProfile).where(RelationshipProfile.space_id == space_id)
            )
        ).scalar_one_or_none()
        if profile is None:
            db.add(RelationshipProfile(space_id=space_id, started_on=body.started_on))
        else:
            profile.started_on = body.started_on
    await db.flush()
    return ok(await _공간_응답(db, space, membership))


# ---------------------------------------------------------------------------
# 여행
# ---------------------------------------------------------------------------


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
) -> dict:
    """
    여행 목록.

    지운 여행은 나오지 않는다. `trash=true` 면 아직 되돌릴 수 있는 지운 여행만 준다.
    지우고 되돌리는 것이 owner 만이라 이 목록도 owner 만 본다.

    여행마다 홈 카드가 보여 줄 요약(`overview`)이 붙는다(`services/trip_overview.py`).
    """
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)

    if trash:
        require(membership, *OWNER_ONLY)
        질의 = (
            select(Trip)
            .where(
                Trip.space_id == space_id,
                Trip.deleted_at.is_not(None),
                Trip.deletion_scheduled_at > func.now(),
            )
            .order_by(Trip.deleted_at.desc())
            .limit(limit)
        )
        return page(await _여행들_응답(db, list((await db.execute(질의)).scalars().all())))

    질의 = (
        select(Trip)
        .where(Trip.space_id == space_id, Trip.deleted_at.is_(None))
        .order_by(Trip.start_date.desc())
        .limit(limit)
    )
    if status_filter is not None:
        질의 = 질의.where(Trip.status == status_filter)

    여행들 = list((await db.execute(질의)).scalars().all())
    return page(await _여행들_응답(db, 여행들))


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
