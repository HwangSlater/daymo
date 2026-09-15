"""
공간 삭제와 복구(docs/development/03-api-specification.md 3장).

- owner 만 지운다. 공간 이름을 정확히 다시 적고 영향을 확인했다는 표시를 보내야 한다.
- 지우면 곧바로 모든 멤버의 공간 목록·여행·초대에서 사라진다(`deleted_at`). 7일 뒤 정리 작업이
  공간과 그 안의 여행·사진 파일까지 실제로 지운다(`purge_deleted_spaces`).
- 7일 안에는 owner 가 되돌릴 수 있다. 되돌리면 멤버와 내용이 그대로 돌아온다.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import Membership, MembershipRole, Space
from app.services.space_purge import purge_space

GRACE = timedelta(days=7)


async def request_deletion(
    session: AsyncSession, *, space: Space, actor: Membership, confirmation_name: str, impact_acknowledged: bool
) -> Space:
    if actor.role != MembershipRole.OWNER:
        raise AppError(ErrorCode.FORBIDDEN)
    if confirmation_name.strip() != space.name.strip():
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            fields={"confirmationName": "공간 이름을 똑같이 적어 주세요."},
        )
    if not impact_acknowledged:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            fields={"impactAcknowledged": "삭제되는 범위를 확인해 주세요."},
        )
    지금 = datetime.now(UTC)
    space.deletion_requested_at = 지금
    space.deleted_at = 지금
    space.deletion_scheduled_at = 지금 + GRACE
    await session.flush()
    return space


async def deleted_spaces_owned_by(session: AsyncSession, user_id: uuid.UUID) -> list[Space]:
    """아직 되돌릴 수 있는, 내가 owner 인 지운 공간."""
    return list(
        (
            await session.execute(
                select(Space)
                .join(Membership, Membership.space_id == Space.id)
                .where(
                    Membership.user_id == user_id,
                    Membership.left_at.is_(None),
                    Membership.role == MembershipRole.OWNER,
                    Space.deleted_at.is_not(None),
                    Space.deletion_scheduled_at > datetime.now(UTC),
                )
                .order_by(Space.deleted_at.desc())
            )
        ).scalars()
    )


async def restore(session: AsyncSession, *, space_id: uuid.UUID, user_id: uuid.UUID) -> tuple[Space, Membership]:
    줄 = (
        await session.execute(
            select(Space, Membership)
            .join(Membership, Membership.space_id == Space.id)
            .where(Space.id == space_id, Membership.user_id == user_id, Membership.left_at.is_(None))
        )
    ).first()
    if 줄 is None:
        raise AppError(ErrorCode.NOT_FOUND)
    space, membership = 줄
    if membership.role != MembershipRole.OWNER:
        # 지운 공간의 존재를 멤버에게는 알리지 않는다.
        raise AppError(ErrorCode.NOT_FOUND)
    if space.deleted_at is None:
        return space, membership
    if space.deletion_scheduled_at and space.deletion_scheduled_at <= datetime.now(UTC):
        raise AppError(ErrorCode.GONE)
    space.deleted_at = None
    space.deletion_requested_at = None
    space.deletion_scheduled_at = None
    await session.flush()
    return space, membership


async def purge_deleted_spaces(session: AsyncSession, *, now: datetime | None = None) -> int:
    """기한이 지난 공간을 실제로 지운다. 정기 작업에서 부른다."""
    지금 = now or datetime.now(UTC)
    ids = list(
        (
            await session.execute(
                select(Space.id).where(
                    Space.deleted_at.is_not(None),
                    Space.deletion_scheduled_at.is_not(None),
                    Space.deletion_scheduled_at <= 지금,
                )
            )
        ).scalars()
    )
    for space_id in ids:
        await purge_space(session, space_id)
    return len(ids)
