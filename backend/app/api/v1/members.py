import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import Field

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_in_space, require
from app.core.responses import ok
from app.models import MembershipRole, SpaceInvite
from app.schemas.auth import _Camel
from app.services import members as member_service

router = APIRouter(tags=["members and invites"])


class InviteOut(_Camel):
    """`inviteUrl` 은 만들 때만 있다. 목록에서는 원문을 다시 줄 수 없다."""

    id: str
    invite_url: str | None = None
    expires_at: datetime
    max_uses: int
    used_count: int
    created_by_membership_id: str | None


class AcceptOut(_Camel):
    space_id: str
    membership_id: str
    already_member: bool


class RoleRequest(_Camel):
    role: Literal["owner", "editor", "viewer"]


class AcceptRequest(_Camel):
    token: str = Field(min_length=10, max_length=200)


def _초대_응답(invite: SpaceInvite, token: str | None = None) -> dict:
    return InviteOut(
        id=str(invite.id),
        invite_url=member_service.invite_url(token) if token else None,
        expires_at=invite.expires_at,
        max_uses=invite.max_uses,
        used_count=invite.used_count,
        created_by_membership_id=str(invite.created_by_membership_id) if invite.created_by_membership_id else None,
    ).model_dump(by_alias=True, mode="json", exclude_none=True)


@router.post("/spaces/{space_id}/invites", status_code=status.HTTP_201_CREATED)
async def create_invite(space_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    """owner·editor 가 만든다. 권한은 받지 않고 들어오는 사람은 늘 editor 다."""
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    require(membership, *WRITERS)
    invite, token = await member_service.create_invite(db, space_id=space_id, actor=membership)
    return ok(_초대_응답(invite, token))


@router.get("/spaces/{space_id}/invites")
async def list_invites(space_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    """아직 쓸 수 있는 초대. 보기만 하는 멤버에게는 보이지 않는다."""
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    require(membership, *WRITERS)
    return ok([_초대_응답(invite) for invite in await member_service.active_invites(db, space_id)])


@router.delete("/spaces/{space_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(space_id: uuid.UUID, invite_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """owner 는 모든 초대를, editor 는 자기가 만든 초대만 폐기한다."""
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    require(membership, *WRITERS)
    await member_service.revoke_invite(db, space_id=space_id, invite_id=invite_id, actor=membership)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/invites/accept")
async def accept_invite(body: AcceptRequest, caller: CurrentCaller, db: DbSession) -> dict:
    """
    token 을 본문으로 받는다. 주소에 두면 접속 기록에 남는다.

    문서의 `POST /invites/{token}/accept` 와 같은 일이다.
    """
    membership, 이미 = await member_service.accept_invite(db, token=body.token.strip(), user=caller.user)
    return ok(
        AcceptOut(space_id=str(membership.space_id), membership_id=str(membership.id), already_member=이미).model_dump(
            by_alias=True
        )
    )


@router.patch("/spaces/{space_id}/members/{membership_id}")
async def change_member_role(
    space_id: uuid.UUID, membership_id: uuid.UUID, body: RoleRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    """owner 만. `owner` 로 바꾸면 관리자를 넘기고 나는 editor 가 된다."""
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    target = await member_service.change_role(
        db, space_id=space_id, membership_id=membership_id, role=MembershipRole(body.role), actor=membership
    )
    return ok({"id": str(target.id), "role": target.role, "myRole": membership.role})


@router.delete("/spaces/{space_id}/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(space_id: uuid.UUID, membership_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """내 membership 이면 나가기, 남의 것이면 내보내기(owner 만)."""
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    await member_service.remove_member(db, space_id=space_id, membership_id=membership_id, actor=membership)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
