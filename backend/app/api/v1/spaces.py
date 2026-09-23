import uuid

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import OWNER_ONLY, membership_in_space, require
from app.core.responses import Envelope, ok
from app.models import Membership, Space
from app.schemas.trip import (
    DeletedSpaceOut,
    SpaceCreateRequest,
    SpaceDeleteRequest,
    SpaceDeletionOut,
    SpaceMemberOut,
    SpaceOut,
    SpaceUpdateRequest,
)
from app.services import space_deletion
from app.services import spaces as space_service

router = APIRouter(tags=["spaces"])


async def 공간_응답(db, space: Space, membership: Membership) -> dict:
    return SpaceOut(
        id=str(space.id),
        name=space.name,
        relationship_type=space.relationship_type,
        timezone=space.timezone,
        started_on=await space_service.started_on_of(db, space.id),
        my_role=membership.role,
    ).model_dump(by_alias=True)


@router.post("/spaces", status_code=status.HTTP_201_CREATED, response_model=Envelope[SpaceOut])
async def create_space(body: SpaceCreateRequest, caller: CurrentCaller, db: DbSession) -> dict:
    """공간을 만든다. 만든 사람이 owner 가 된다."""
    space, membership = await space_service.create_space(
        db,
        owner_user_id=caller.user.id,
        name=body.name,
        relationship_type=body.relationship_type,
        timezone=body.timezone,
        started_on=body.started_on,
    )
    return ok(await 공간_응답(db, space, membership))


@router.get("/spaces", response_model=Envelope[list[SpaceOut]])
async def list_spaces(caller: CurrentCaller, db: DbSession) -> dict:
    """내가 들어가 있는 공간 목록. 앱이 처음 여는 화면이 이것으로 시작한다."""
    return ok(
        [
            await 공간_응답(db, space, membership)
            for space, membership in await space_service.spaces_of_user(db, caller.user.id)
        ]
    )


@router.get("/spaces/deleted", response_model=Envelope[list[DeletedSpaceOut]])
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


@router.delete(
    "/spaces/{space_id}",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=Envelope[SpaceDeletionOut],
)
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


@router.post("/spaces/{space_id}/restore", response_model=Envelope[SpaceOut])
async def restore_space(space_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    """지운 공간을 되돌린다. 관리자만, 7일 안에만."""
    space, membership = await space_deletion.restore(db, space_id=space_id, user_id=caller.user.id)
    return ok(await 공간_응답(db, space, membership))


# 이 하나만 `response_model` 이 없다. `includeLeft` 없이 물었을 때 `leftAt` 을
# **칸째로 빼서** 답하는데, 스키마를 달면 FastAPI 가 `null` 을 되살려 넣는다.
# 나가지 않은 사람에게 `leftAt: null` 이 붙으면 앱이 볼 자리가 하나 늘어난다.
# 나중에 「나간 멤버 포함」을 따로 뗀 경로로 나누면 그때 붙인다.
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
    return ok(
        [
            SpaceMemberOut(
                id=str(membership.id),
                display_name=membership.nickname or user.display_name,
                role=membership.role,
                is_me=membership.user_id == caller.user.id,
                left_at=membership.left_at,
            ).model_dump(by_alias=True, mode="json", exclude_none=not include_left)
            for membership, user in await space_service.members_of(
                db, space_id, include_left=include_left
            )
        ]
    )


@router.patch("/spaces/{space_id}", response_model=Envelope[SpaceOut])
async def update_space(
    space_id: uuid.UUID, body: SpaceUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    require(membership, *OWNER_ONLY)
    space = await db.get(Space, space_id)
    assert space is not None
    await space_service.update_space(
        db,
        space,
        name=body.name,
        relationship_type=body.relationship_type,
        started_on=body.started_on,
        started_on_sent="started_on" in body.model_fields_set,
    )
    return ok(await 공간_응답(db, space, membership))
