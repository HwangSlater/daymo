import uuid

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import (
    OWNER_ONLY,
    WRITERS,
    membership_for_trip,
    membership_in_space,
    require,
)
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
    ParticipantsRequest,
    SpaceCreateRequest,
    SpaceMemberOut,
    SpaceOut,
    SpaceUpdateRequest,
    TripCreateRequest,
    TripOut,
    TripUpdateRequest,
)
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


async def _여행_응답(db, trip: Trip) -> dict:
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
        participant_membership_ids=await _참가자_ids(db, trip),
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


@router.get("/spaces/{space_id}/members")
async def list_space_members(
    space_id: uuid.UUID, caller: CurrentCaller, db: DbSession
) -> dict:
    await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    줄들 = (
        await db.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.space_id == space_id, Membership.left_at.is_(None))
            .order_by(Membership.joined_at, Membership.id)
        )
    ).all()
    return ok(
        [
            SpaceMemberOut(
                id=str(membership.id),
                display_name=membership.nickname or user.display_name,
                role=membership.role,
                is_me=membership.user_id == caller.user.id,
            ).model_dump(by_alias=True)
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
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    """
    여행 목록.

    지운 여행은 나오지 않는다. 관리 화면에서만 따로 본다.
    """
    await membership_in_space(db, user_id=caller.user.id, space_id=space_id)

    질의 = (
        select(Trip)
        .where(Trip.space_id == space_id, Trip.deleted_at.is_(None))
        .order_by(Trip.start_date.desc())
        .limit(limit)
    )
    if status_filter is not None:
        질의 = 질의.where(Trip.status == status_filter)

    여행들 = (await db.execute(질의)).scalars().all()
    return page([await _여행_응답(db, trip) for trip in 여행들])


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

    # 날짜를 건드렸으면 기간 규칙을 다시 본다.
    if "start_date" in 보낸_것 or "end_date" in 보낸_것:
        trip_service._기간을_본다(trip.start_date, trip.end_date)

    trip.version += 1
    await db.flush()
    return ok(await _여행_응답(db, trip))


@router.put("/trips/{trip_id}/participants")
async def set_participants(
    trip_id: uuid.UUID, body: ParticipantsRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)

    await trip_service.set_participants(
        db,
        trip=trip,
        membership_ids=[uuid.UUID(값) for 값 in body.membership_ids],
        actor=membership,
    )
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
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/trips/{trip_id}/restore")
async def restore(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    membership, trip = await membership_for_trip(
        db, user_id=caller.user.id, trip_id=trip_id, include_deleted=True
    )
    require(membership, *OWNER_ONLY)
    await trip_service.restore_trip(db, trip)
    return ok(await _여행_응답(db, trip))
