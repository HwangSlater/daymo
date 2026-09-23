"""
공간(space) 의 질의와 트랜잭션.

라우터는 요청을 받고 응답 모양을 고르는 데까지만 하고, 표를 읽고 쓰는 것은
여기서 한다. 이 파일은 FastAPI 를 들이지 않는다 — 서비스가 웹 틀을 모르면
작업(jobs)·스크립트에서도 같은 코드를 부를 수 있다.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Membership,
    MembershipRole,
    RelationshipProfile,
    RelationshipType,
    Space,
    User,
)


async def create_space(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    name: str,
    relationship_type: RelationshipType,
    timezone: str,
    started_on: date | None,
) -> tuple[Space, Membership]:
    """
    공간을 만든다. 만든 사람이 owner 가 된다.

    공간과 owner membership 을 한 transaction 에서 만든다. 따로 만들면
    주인 없는 공간이 생길 수 있고, 그러면 아무도 그 공간을 지울 수 없다.
    """
    space = Space(
        name=name,
        relationship_type=relationship_type,
        owner_id=owner_user_id,
        timezone=timezone,
        created_by=owner_user_id,
    )
    session.add(space)
    await session.flush()

    session.add(
        Membership(
            space_id=space.id,
            user_id=owner_user_id,
            role=MembershipRole.OWNER,
            created_by=owner_user_id,
        )
    )
    if started_on:
        session.add(RelationshipProfile(space_id=space.id, started_on=started_on))
    await session.flush()

    membership = (
        await session.execute(
            select(Membership).where(
                Membership.space_id == space.id,
                Membership.user_id == owner_user_id,
                Membership.left_at.is_(None),
            )
        )
    ).scalar_one()
    return space, membership


async def started_on_of(session: AsyncSession, space_id: uuid.UUID) -> date | None:
    """연인 공간의 처음 만난 날. 적은 적이 없으면 None."""
    return (
        await session.execute(
            select(RelationshipProfile.started_on).where(RelationshipProfile.space_id == space_id)
        )
    ).scalar_one_or_none()


async def spaces_of_user(session: AsyncSession, user_id: uuid.UUID) -> list[tuple[Space, Membership]]:
    """
    내가 들어가 있는 공간과 그 공간에서의 내 자격.

    나간 공간과 지운 공간은 빠진다. 앱이 처음 여는 화면이 이것으로 시작한다.
    """
    return list(
        (
            await session.execute(
                select(Space, Membership)
                .join(Membership, Membership.space_id == Space.id)
                .where(
                    Membership.user_id == user_id,
                    Membership.left_at.is_(None),
                    Space.deleted_at.is_(None),
                )
                .order_by(Space.created_at)
            )
        ).all()
    )


async def members_of(
    session: AsyncSession, space_id: uuid.UUID, *, include_left: bool = False
) -> list[tuple[Membership, User]]:
    """
    공간 멤버. `include_left` 면 나간 멤버도 뒤에 붙는다.

    지난 여행의 지출·준비물·교통편은 나간 사람을 가리킨다. 앱이 그 이름을 알아야
    `나간 멤버` 로 뭉개지 않고 누구의 것인지 보여 줄 수 있다.
    """
    조건 = [Membership.space_id == space_id]
    if not include_left:
        조건.append(Membership.left_at.is_(None))
    return list(
        (
            await session.execute(
                select(Membership, User)
                .join(User, User.id == Membership.user_id)
                .where(*조건)
                .order_by(Membership.left_at.is_not(None), Membership.joined_at, Membership.id)
            )
        ).all()
    )


async def update_space(
    session: AsyncSession,
    space: Space,
    *,
    name: str | None = None,
    relationship_type: RelationshipType | None = None,
    started_on: date | None = None,
    started_on_sent: bool = False,
) -> Space:
    """
    공간을 고친다. 보낸 칸만 덮어쓴다.

    `started_on` 은 비우는 것(null)과 안 보낸 것이 다르다. 그래서 값과 별개로
    `started_on_sent` 를 함께 받는다.
    """
    if name is not None:
        space.name = name
    if relationship_type is not None:
        space.relationship_type = relationship_type
    if started_on_sent:
        profile = (
            await session.execute(
                select(RelationshipProfile).where(RelationshipProfile.space_id == space.id)
            )
        ).scalar_one_or_none()
        if profile is None:
            session.add(RelationshipProfile(space_id=space.id, started_on=started_on))
        else:
            profile.started_on = started_on
    await session.flush()
    return space
