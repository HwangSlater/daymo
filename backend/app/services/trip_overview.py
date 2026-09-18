"""
여행 목록에 붙는 짧은 요약.

앱 홈의 여행 카드와 "출발 전 확인할 것" 이 보여 주는 숫자만 센다. 대표 숙소,
일정 수, 저장한 장소(식당·카페), 준비물, 쓴 돈이다.

예전에는 앱이 이 숫자를 기기에 저장된 기록에서만 셌다. 기록은 여행 상세를 이
기기에서 한 번 열어야 채워져서, 새로 로그인했거나 다른 멤버가 채운 여행은 홈에서
전부 비어 보였다.

여행마다 따로 묻지 않는다. 목록의 여행을 한꺼번에 묶어 표마다 한 번씩 센다.
"""

import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Checklist,
    ChecklistItem,
    ChecklistKind,
    Expense,
    Place,
    Reservation,
    ScheduleItem,
    Space,
    Stay,
    Transport,
    Trip,
    TripPlace,
)
from app.services.schedule import format_local, zone_named

# 앱의 장소 분류 글자. 홈이 이 둘만 따로 센다.
식당 = "식당"
카페 = "카페"


@dataclass
class StaySummary:
    # 연결한 장소가 없으면 비어 있다. 앱은 그때 "숙소" 라고 적는다.
    name: str | None
    check_in_at: str | None


@dataclass
class TripOverview:
    stay: StaySummary | None = None
    schedule_count: int = 0
    place_count: int = 0
    restaurant_count: int = 0
    cafe_count: int = 0
    packing_total: int = 0
    packing_done: int = 0
    spent_total: Decimal = field(default_factory=lambda: Decimal(0))


async def overviews_of(session: AsyncSession, trips: list[Trip]) -> dict[uuid.UUID, TripOverview]:
    결과 = {trip.id: TripOverview() for trip in trips}
    if not trips:
        return 결과
    ids = list(결과)

    # 일정 수는 일정 탭에 보이는 줄 수다. 직접 적은 줄에 더해, "일정에 표시" 를 켠
    # 교통편·예약과 대표 숙소의 체크인 줄도 앱이 일정에 넣는다.
    for 표 in (ScheduleItem, Transport, Reservation):
        질의 = select(표.trip_id, func.count()).where(표.trip_id.in_(ids)).group_by(표.trip_id)
        if 표 is not ScheduleItem:
            질의 = 질의.where(표.show_in_schedule.is_(True))
        for trip_id, 수 in (await session.execute(질의)).all():
            결과[trip_id].schedule_count += 수

    장소 = select(
        TripPlace.trip_id,
        func.count(),
        func.count().filter(TripPlace.category == 식당),
        func.count().filter(TripPlace.category == 카페),
    ).where(TripPlace.trip_id.in_(ids)).group_by(TripPlace.trip_id)
    for trip_id, 전체, 식당_수, 카페_수 in (await session.execute(장소)).all():
        결과[trip_id].place_count = 전체
        결과[trip_id].restaurant_count = 식당_수
        결과[trip_id].cafe_count = 카페_수

    # 준비물 목록은 여행마다 먼저 만든 하나만 쓴다(`cooking.packing_list`).
    준비물_목록 = (
        select(Checklist.id)
        .where(Checklist.trip_id.in_(ids), Checklist.kind == ChecklistKind.PACKING)
        .distinct(Checklist.trip_id)
        .order_by(Checklist.trip_id, Checklist.created_at)
    )
    준비물 = (
        select(Checklist.trip_id, func.count(), func.count().filter(ChecklistItem.completed_at.is_not(None)))
        .join(ChecklistItem, ChecklistItem.checklist_id == Checklist.id)
        .where(Checklist.id.in_(준비물_목록.scalar_subquery()))
        .group_by(Checklist.trip_id)
    )
    for trip_id, 전체, 챙긴_수 in (await session.execute(준비물)).all():
        결과[trip_id].packing_total = 전체
        결과[trip_id].packing_done = 챙긴_수

    # 정산에서 뺀 지출은 앱의 총 지출과 같은 규칙으로 세지 않는다.
    지출 = (
        select(Expense.trip_id, func.sum(Expense.amount))
        .where(Expense.trip_id.in_(ids), Expense.excluded.is_(False))
        .group_by(Expense.trip_id)
    )
    for trip_id, 합 in (await session.execute(지출)).all():
        결과[trip_id].spent_total = 합 or Decimal(0)

    # 대표 숙소는 숙소 목록의 첫 줄이다. 목록과 같은 순서로 고른다(`schedule.list_stays`).
    시간대 = dict(
        (
            await session.execute(
                select(Space.id, Space.timezone).where(Space.id.in_({trip.space_id for trip in trips}))
            )
        ).all()
    )
    공간_of = {trip.id: trip.space_id for trip in trips}
    숙소 = (
        select(Stay.trip_id, Place.name, Stay.check_in_at, Stay.show_in_schedule)
        .outerjoin(TripPlace, TripPlace.id == Stay.trip_place_id)
        .outerjoin(Place, Place.id == TripPlace.place_id)
        .where(Stay.trip_id.in_(ids))
        .distinct(Stay.trip_id)
        .order_by(Stay.trip_id, Stay.check_in_at.nulls_last(), Stay.created_at)
    )
    for trip_id, 이름, 체크인, 일정에_표시 in (await session.execute(숙소)).all():
        zone = zone_named(시간대.get(공간_of[trip_id]))
        결과[trip_id].stay = StaySummary(name=이름, check_in_at=format_local(체크인, zone))
        if 일정에_표시:
            결과[trip_id].schedule_count += 1

    return 결과
