"""
여행 기념 카드 목록.

카드 그림은 기기가 그린다(docs/development/03-api-specification.md 10장). 서버는 꾸민
값 한 덩어리를 들고 있을 뿐이고, 무엇을 어떻게 그릴지는 앱의 `mobile/src/tripCard.ts`
가 정한다. 여기서는 그 덩어리를 여행에 매달아 두고, 고른 사진이 그 여행의 사진인지만 본다.

한 여행에 여러 장이다. 예전에는 `trips.card_settings` 한 칸이라 새로 만들면 앞서
만든 카드가 조용히 덮였다.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import Membership, MembershipRole, Trip, TripCard
from app.services.trips import check_card_photos

# 한 여행에 모아 둘 수 있는 카드 수.
#
# 카드마다 사진 넷이라 스무 장이면 사진 여든 장이다. 그보다 쌓이면 목록을 넘기는
# 것부터 느려진다. 앱도 같은 수로 막는다(`mobile/src/tripCard.KEEPSAKE_MAX_CARDS`).
MAX_CARDS_PER_TRIP = 20


def can_manage(membership: Membership, card: TripCard) -> bool:
    """
    이 카드를 고치고 지울 수 있는지.

    만든 사람과 owner 만이다. 사진과 같은 규칙으로 둔다(`services/photos.can_manage`).
    카드는 남이 고른 사진으로 만든 그림이라, editor 라고 해서 남이 만든 카드를
    말없이 바꾸거나 지울 수 있으면 곤란하다. 메모·일기보다 한 칸 좁은 쪽을 골랐다.
    """
    return membership.role == MembershipRole.OWNER or card.created_by_membership_id == membership.id


async def list_cards(session: AsyncSession, trip: Trip) -> list[TripCard]:
    """만든 차례대로. 앱도 같은 차례로 줄을 세운다(`keepsakeListOf`)."""
    return list(
        (
            await session.execute(
                select(TripCard)
                .where(TripCard.trip_id == trip.id)
                .order_by(TripCard.sort_order, TripCard.created_at, TripCard.id)
            )
        )
        .scalars()
        .all()
    )


async def create_card(
    session: AsyncSession,
    *,
    trip: Trip,
    actor: Membership,
    card_id: uuid.UUID | None,
    settings: dict,
) -> tuple[TripCard, bool]:
    """
    카드 한 장을 만든다.

    `card_id` 를 앱이 보내면 같은 요청이 두 번 닿아도 카드가 두 장이 되지 않는다
    (메모·일기와 같은 규칙이다).
    """
    if card_id is not None:
        기존 = await session.get(TripCard, card_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False

    몇_장인가 = (
        await session.execute(
            select(func.count()).select_from(TripCard).where(TripCard.trip_id == trip.id)
        )
    ).scalar_one()
    if 몇_장인가 >= MAX_CARDS_PER_TRIP:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            message=f"카드는 여행마다 {MAX_CARDS_PER_TRIP}장까지 모아 둘 수 있어요.",
            fields={"cards": f"이 여행에는 이미 {MAX_CARDS_PER_TRIP}장이 있어요."},
        )

    await check_card_photos(session, trip, settings.get("photoIds") or [])
    # 뒤에 붙인다. 지운 자리를 다시 쓰지 않으려고 개수가 아니라 마지막 값에서 센다.
    마지막 = (
        await session.execute(
            select(func.max(TripCard.sort_order)).where(TripCard.trip_id == trip.id)
        )
    ).scalar_one()
    card = TripCard(
        id=card_id or uuid.uuid4(),
        trip_id=trip.id,
        created_by_membership_id=actor.id,
        created_by=actor.user_id,
        settings=settings,
        sort_order=(마지막 or 0) + 1,
    )
    session.add(card)
    await session.flush()
    return card, True


async def update_card(
    session: AsyncSession,
    *,
    trip: Trip,
    card: TripCard,
    actor: Membership,
    version: int,
    settings: dict,
) -> TripCard:
    if not can_manage(actor, card):
        raise AppError(ErrorCode.FORBIDDEN)
    if version != card.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    await check_card_photos(session, trip, settings.get("photoIds") or [])
    card.settings = settings
    card.version += 1
    card.updated_at = datetime.now(UTC)
    await session.flush()
    return card


async def remove_card(session: AsyncSession, *, card: TripCard, actor: Membership) -> None:
    """
    카드는 되살리지 않는다. 그림 자체가 아니라 무엇으로 그릴지 고른 값이라,
    사진이 남아 있으면 같은 카드를 다시 만들 수 있다. 휴지통에 넣지 않는 까닭이다.
    """
    if not can_manage(actor, card):
        raise AppError(ErrorCode.FORBIDDEN)
    await session.delete(card)
    await session.flush()
