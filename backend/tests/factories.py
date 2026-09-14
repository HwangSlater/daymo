import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Membership,
    MembershipRole,
    Place,
    PlaceProvider,
    Space,
    Trip,
    TripParticipant,
    TripPlace,
    User,
)

# 테스트가 쓰는 최소한의 행 만들기.
#
# 실제 이름과 이메일을 쓰지 않는다. 공개 저장소이고, 시드 데이터가 그대로
# 화면이나 로그에 실리는 일이 반복해서 있었다.


async def 사람을_넣는다(db: AsyncSession, 이름: str = "하늘") -> User:
    # 이메일이 unique 라 테스트끼리 부딪히지 않게 매번 다른 값을 쓴다.
    user = User(email=f"{uuid.uuid4()}@example.test", display_name=이름)
    db.add(user)
    await db.flush()
    return user


async def 공간을_넣는다(db: AsyncSession, owner: User, 이름: str = "우리의 여행 공간") -> Space:
    space = Space(name=이름, owner_id=owner.id, created_by=owner.id)
    db.add(space)
    await db.flush()
    return space


async def 멤버를_넣는다(
    db: AsyncSession, space: Space, user: User, role: MembershipRole = MembershipRole.EDITOR
) -> Membership:
    membership = Membership(space_id=space.id, user_id=user.id, role=role)
    db.add(membership)
    await db.flush()
    return membership


async def 여행을_넣는다(
    db: AsyncSession,
    space: Space,
    *,
    제목: str = "가을 제주",
    시작: date = date(2026, 10, 1),
    끝: date = date(2026, 10, 3),
) -> Trip:
    trip = Trip(space_id=space.id, title=제목, start_date=시작, end_date=끝)
    db.add(trip)
    await db.flush()
    return trip


async def 참가자를_넣는다(
    db: AsyncSession, trip: Trip, membership: Membership, 순서: int = 0
) -> TripParticipant:
    participant = TripParticipant(
        trip_id=trip.id, membership_id=membership.id, sort_order=순서
    )
    db.add(participant)
    await db.flush()
    return participant


async def 공간과_멤버_하나(db: AsyncSession) -> tuple[Space, Membership]:
    """가장 흔한 준비. owner 한 명이 있는 공간."""
    owner = await 사람을_넣는다(db)
    space = await 공간을_넣는다(db, owner)
    membership = await 멤버를_넣는다(db, space, owner, MembershipRole.OWNER)
    return space, membership


async def 장소를_넣는다(
    db: AsyncSession,
    *,
    이름: str = "소나기식당",
    제공자: PlaceProvider = PlaceProvider.MANUAL,
    제공자_장소_id: str | None = None,
) -> Place:
    place = Place(name=이름, provider=제공자, provider_place_id=제공자_장소_id)
    db.add(place)
    await db.flush()
    return place


async def 여행_장소를_넣는다(db: AsyncSession, trip: Trip, place: Place, **값) -> TripPlace:
    trip_place = TripPlace(trip_id=trip.id, place_id=place.id, **값)
    db.add(trip_place)
    await db.flush()
    return trip_place
