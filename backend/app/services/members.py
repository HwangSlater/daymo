"""
공간 초대와 멤버 관리.

초대 링크(docs/development/03-api-specification.md 3장):

- 만든 뒤 7일, 10명까지. token 원문은 만들 때만 돌려주고 hash 만 둔다.
- 받는 사람은 로그인하고 이메일을 확인해야 한다. owner 승인 없이 바로 `editor` 로 들어온다.
- 이미 멤버면 들어온 것으로 답하고 사용 횟수를 올리지 않는다. 공간이 10명으로 차면
  409 이고 역시 올리지 않는다.
- 여러 명이 동시에 눌러도 정원과 횟수를 넘지 않게 초대 줄과 공간 줄을 잠그고 센다.

멤버:

- 권한 바꾸기와 내보내기는 owner 만. owner 를 넘기면 넘긴 사람은 editor 가 된다.
- 스스로 나가기는 누구나. 다른 멤버가 남는 공간의 owner 는 먼저 넘겨야 한다. 혼자 남은
  owner 는 나갈 수 없다(공간 삭제로 정리한다).
- 나가거나 내보내도 행은 지우지 않고 `left_at` 을 채운다. 지난 기록이 그 사람을 가리킨다.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.core.tokens import hash_refresh_token, new_one_time_token
from app.models import (
    INVITE_DAYS,
    INVITE_MAX_USES,
    MAX_MEMBERS_PER_SPACE,
    Membership,
    MembershipRole,
    Space,
    SpaceInvite,
    User,
)


def invite_url(token: str) -> str:
    """사람이 여는 주소. 앱이 있으면 이 페이지가 앱을 연다(app/api/auth_pages.py)."""
    return f"{get_settings().auth_link_base}/auth/invite?token={token}"


async def create_invite(session: AsyncSession, *, space_id: uuid.UUID, actor: Membership) -> tuple[SpaceInvite, str]:
    원문, 해시 = new_one_time_token()
    invite = SpaceInvite(
        space_id=space_id,
        token_hash=해시,
        created_by_membership_id=actor.id,
        expires_at=datetime.now(UTC) + timedelta(days=INVITE_DAYS),
        max_uses=INVITE_MAX_USES,
    )
    session.add(invite)
    await session.flush()
    return invite, 원문


async def active_invites(session: AsyncSession, space_id: uuid.UUID) -> list[SpaceInvite]:
    return list(
        (
            await session.execute(
                select(SpaceInvite)
                .where(
                    SpaceInvite.space_id == space_id,
                    SpaceInvite.revoked_at.is_(None),
                    SpaceInvite.expires_at > func.now(),
                    SpaceInvite.used_count < SpaceInvite.max_uses,
                )
                .order_by(SpaceInvite.created_at.desc())
            )
        ).scalars()
    )


async def revoke_invite(session: AsyncSession, *, space_id: uuid.UUID, invite_id: uuid.UUID, actor: Membership) -> None:
    invite = await session.get(SpaceInvite, invite_id)
    if invite is None or invite.space_id != space_id:
        raise AppError(ErrorCode.NOT_FOUND)
    if actor.role != MembershipRole.OWNER and invite.created_by_membership_id != actor.id:
        raise AppError(ErrorCode.FORBIDDEN)
    if invite.revoked_at is None:
        invite.revoked_at = datetime.now(UTC)
        await session.flush()


async def _active_count(session: AsyncSession, space_id: uuid.UUID) -> int:
    return int(
        await session.scalar(
            select(func.count()).select_from(Membership).where(Membership.space_id == space_id, Membership.left_at.is_(None))
        )
        or 0
    )


async def accept_invite(session: AsyncSession, *, token: str, user: User) -> tuple[Membership, bool]:
    """`(membership, 이미_멤버였다)`. 초대가 없거나 쓸 수 없으면 공간에 대해 아무것도 알려 주지 않는다."""
    invite = await session.scalar(
        select(SpaceInvite).where(SpaceInvite.token_hash == hash_refresh_token(token)).with_for_update()
    )
    if invite is None:
        raise AppError(ErrorCode.NOT_FOUND, message="초대 링크를 찾을 수 없어요. 링크를 다시 받아 주세요.")
    space = await session.scalar(select(Space).where(Space.id == invite.space_id).with_for_update())
    if space is None or space.deleted_at is not None:
        raise AppError(ErrorCode.NOT_FOUND, message="초대 링크를 찾을 수 없어요. 링크를 다시 받아 주세요.")

    기존 = await session.scalar(
        select(Membership).where(
            Membership.space_id == space.id, Membership.user_id == user.id, Membership.left_at.is_(None)
        )
    )
    if 기존 is not None:
        return 기존, True

    if invite.revoked_at is not None or invite.expires_at <= datetime.now(UTC) or invite.used_count >= invite.max_uses:
        raise AppError(ErrorCode.GONE, message="만료되었거나 더 쓸 수 없는 초대 링크예요. 새 링크를 받아 주세요.")
    if user.email_verified_at is None:
        raise AppError(ErrorCode.EMAIL_NOT_VERIFIED)
    if await _active_count(session, space.id) >= MAX_MEMBERS_PER_SPACE:
        raise AppError(ErrorCode.SPACE_MEMBER_LIMIT_REACHED)

    membership = Membership(space_id=space.id, user_id=user.id, role=MembershipRole.EDITOR, created_by=user.id)
    session.add(membership)
    invite.used_count += 1
    await session.flush()
    return membership, False


async def _target(session: AsyncSession, space_id: uuid.UUID, membership_id: uuid.UUID) -> Membership:
    target = await session.scalar(
        select(Membership).where(
            Membership.id == membership_id, Membership.space_id == space_id, Membership.left_at.is_(None)
        )
    )
    if target is None:
        raise AppError(ErrorCode.NOT_FOUND)
    return target


async def change_role(
    session: AsyncSession, *, space_id: uuid.UUID, membership_id: uuid.UUID, role: MembershipRole, actor: Membership
) -> Membership:
    if actor.role != MembershipRole.OWNER:
        raise AppError(ErrorCode.FORBIDDEN)
    target = await _target(session, space_id, membership_id)
    if target.id == actor.id:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"role": "내 권한은 다른 멤버에게 관리자를 넘겨서 바꿔요."})
    if role == MembershipRole.OWNER:
        # 관리자는 한 명이다. 넘기면 나는 편집할 수 있는 멤버가 된다.
        space = await session.get(Space, space_id)
        assert space is not None
        actor.role = MembershipRole.EDITOR
        space.owner_id = target.user_id
    target.role = role
    await session.flush()
    return target


async def remove_member(
    session: AsyncSession, *, space_id: uuid.UUID, membership_id: uuid.UUID, actor: Membership
) -> None:
    """내보내기(owner) 또는 나가기(본인)."""
    target = await _target(session, space_id, membership_id)
    if target.id != actor.id and actor.role != MembershipRole.OWNER:
        raise AppError(ErrorCode.FORBIDDEN)
    if target.role == MembershipRole.OWNER:
        if await _active_count(session, space_id) > 1:
            raise AppError(ErrorCode.OWNER_TRANSFER_REQUIRED)
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            message="혼자 있는 공간은 나갈 수 없어요. 공간을 지워 주세요.",
            fields={"membershipId": "혼자 있는 공간의 관리자예요."},
        )
    target.left_at = datetime.now(UTC)
    target.removed_by = actor.user_id if target.id != actor.id else None
    await session.flush()
