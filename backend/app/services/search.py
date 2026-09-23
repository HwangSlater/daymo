"""
공간 하나를 가로질러 찾기.

앱의 「찾기」 탭은 지금까지 기기에 받아 둔 여행만 훑었다. 초대받고 막 들어온
사람이나 100개 밖의 여행은 어떤 말로도 나오지 않았다(2026-09-23 검토 #61).
여기서는 그 공간의 표를 직접 읽어 같은 모양의 결과를 만든다.

찾는 방식은 `ILIKE '%말%'` 이다. 여행 수첩 한 채의 크기라 이것으로 충분하고,
`trip_id` 색인으로 공간 밖은 처음부터 읽지 않는다. 사람이 늘어 느려지면 그때
`pg_trgm` 이나 전문 검색으로 옮긴다 — 지금 넣으면 확장을 깔아야 하고, 얼마나
느린지 재 보지도 않은 채 표가 늘어난다.

**지운 것은 나오지 않는다.** 지운 여행·지운 공간·지운 메모는 목록에서 빠지는
것과 같은 규칙으로 여기서도 빠진다.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Checklist,
    ChecklistItem,
    Diary,
    Expense,
    Ingredient,
    Memo,
    Place,
    Recipe,
    ScheduleItem,
    Trip,
    TripDay,
    TripPlace,
)
from app.services.memories import author_names, name_of

# 두 글자보다 짧으면 찾지 않는다. 한 글자는 거의 모든 줄에 걸려서 「찾았다」가 아니다.
MIN_QUERY = 2
# 찾는 말의 길이 상한. 이보다 긴 말은 앱이 보내지 않는다(요청 스키마가 막는다).
MAX_QUERY = 60
# 한 번에 돌려주는 줄 수의 상한. 종류마다도 이만큼만 읽어 질의 하나가 커지지 않게 한다.
MAX_RESULTS = 50

# 결과의 종류와, 앱이 그 줄을 눌렀을 때 열 여행 상세의 자리.
# 앱 쪽 이름은 `mobile/src/WarmTripDetail.tsx` 의 `TripDetailDestination` 이다.
DESTINATION_BY_TYPE = {
    "trip": "overview",
    "place": "places",
    "schedule": "overview",
    "packing": "preparation",
    "recipe": "cooking",
    "expense": "expenses",
    "memo": "memories",
    "diary": "memories",
}
SEARCH_TYPES = tuple(DESTINATION_BY_TYPE)


@dataclass(frozen=True)
class Hit:
    """찾은 줄 하나. 목록에 한 줄로 그릴 만큼만 담는다."""

    type: str
    id: uuid.UUID
    trip_id: uuid.UUID
    trip_title: str
    title: str
    detail: str


def 조각(말: str) -> str:
    """
    `ILIKE` 에 넣을 무늬.

    `%` 와 `_` 는 SQL 쪽에서 뜻이 있는 글자다. 그대로 보내면 「%」 한 글자를 친
    사람에게 모든 줄이 나온다. 역슬래시로 막고 `escape="\\\\"` 와 함께 쓴다.
    """
    return "%" + 말.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _이음(*조각들: str | None) -> str:
    """앱이 한 줄로 보여 줄 짧은 맥락. 빈 것은 뺀다."""
    return " · ".join(값.strip() for 값 in 조각들 if 값 and 값.strip())


def _줄임(본문: str, 길이: int = 60) -> str:
    """메모·일기처럼 긴 글은 앞머리만 제목 자리에 놓는다."""
    한_줄 = " ".join(본문.split())
    return 한_줄 if len(한_줄) <= 길이 else 한_줄[: 길이 - 1] + "…"


def _여행_안에서(질의: Select, space_id: uuid.UUID) -> Select:
    """이 공간의 살아 있는 여행에 딸린 줄만 본다. 권한은 라우터가 먼저 본다."""
    return 질의.where(Trip.space_id == space_id, Trip.deleted_at.is_(None))


async def search_space(
    session: AsyncSession,
    *,
    space_id: uuid.UUID,
    query: str,
    types: tuple[str, ...] = SEARCH_TYPES,
    limit: int = MAX_RESULTS,
) -> list[Hit]:
    """
    그 공간의 기록에서 찾는다. 두 글자보다 짧으면 빈 목록이다.

    종류마다 한 번씩 읽고 합친다. 여행이 최근인 것부터, 같은 여행 안에서는
    종류 차례로 놓는다. 상한을 넘으면 거기서 자른다.
    """
    말 = query.strip()
    if len(말) < MIN_QUERY:
        return []
    말 = 말[:MAX_QUERY]
    한도 = max(1, min(limit, MAX_RESULTS))
    무늬 = 조각(말)
    고른_종류 = [종류 for 종류 in SEARCH_TYPES if 종류 in types]

    찾은_것: list[Hit] = []
    for 종류 in 고른_종류:
        찾은_것 += await _종류별[종류](session, space_id, 무늬, 한도)

    차례 = {종류: 자리 for 자리, 종류 in enumerate(SEARCH_TYPES)}
    시작일 = await _여행_시작일(session, space_id)
    찾은_것.sort(
        key=lambda hit: (
            -(시작일.get(hit.trip_id) or 0),
            hit.trip_title,
            차례[hit.type],
            hit.title,
        )
    )
    return 찾은_것[:한도]


async def _여행_시작일(session: AsyncSession, space_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """여행 id 마다 시작일을 숫자로. 최근 여행부터 보여 주려고 쓴다."""
    줄들 = await session.execute(
        select(Trip.id, Trip.start_date).where(
            Trip.space_id == space_id, Trip.deleted_at.is_(None)
        )
    )
    return {trip_id: start.toordinal() for trip_id, start in 줄들}


# ---------------------------------------------------------------------------
# 종류마다 한 질의
# ---------------------------------------------------------------------------


async def _여행(session, space_id, 무늬, 한도) -> list[Hit]:
    줄들 = await session.execute(
        _여행_안에서(
            select(Trip.id, Trip.title, Trip.region_name, Trip.summary), space_id
        )
        .where(
            or_(
                Trip.title.ilike(무늬, escape="\\"),
                Trip.region_name.ilike(무늬, escape="\\"),
                Trip.summary.ilike(무늬, escape="\\"),
            )
        )
        .limit(한도)
    )
    return [
        Hit(
            type="trip",
            id=trip_id,
            trip_id=trip_id,
            trip_title=title,
            title=title,
            detail=_이음(region_name, _줄임(summary or "", 40)),
        )
        for trip_id, title, region_name, summary in 줄들
    ]


async def _장소(session, space_id, 무늬, 한도) -> list[Hit]:
    줄들 = await session.execute(
        _여행_안에서(
            select(
                TripPlace.id,
                Trip.id,
                Trip.title,
                Place.name,
                TripPlace.category,
                TripPlace.area,
                Place.address,
            )
            .join(Trip, Trip.id == TripPlace.trip_id)
            .join(Place, Place.id == TripPlace.place_id),
            space_id,
        )
        .where(
            or_(
                Place.name.ilike(무늬, escape="\\"),
                Place.address.ilike(무늬, escape="\\"),
                TripPlace.area.ilike(무늬, escape="\\"),
                TripPlace.category.ilike(무늬, escape="\\"),
                TripPlace.memo.ilike(무늬, escape="\\"),
            )
        )
        .limit(한도)
    )
    return [
        Hit(
            type="place",
            id=place_row_id,
            trip_id=trip_id,
            trip_title=trip_title,
            title=name,
            detail=_이음(category, area or address),
        )
        for place_row_id, trip_id, trip_title, name, category, area, address in 줄들
    ]


async def _일정(session, space_id, 무늬, 한도) -> list[Hit]:
    줄들 = await session.execute(
        _여행_안에서(
            select(ScheduleItem.id, Trip.id, Trip.title, ScheduleItem.title, TripDay.date, ScheduleItem.note)
            .join(Trip, Trip.id == ScheduleItem.trip_id)
            .join(TripDay, TripDay.id == ScheduleItem.trip_day_id, isouter=True),
            space_id,
        )
        .where(
            or_(
                ScheduleItem.title.ilike(무늬, escape="\\"),
                ScheduleItem.note.ilike(무늬, escape="\\"),
            )
        )
        .limit(한도)
    )
    return [
        Hit(
            type="schedule",
            id=item_id,
            trip_id=trip_id,
            trip_title=trip_title,
            title=title,
            detail=_이음(day.isoformat() if day else None, _줄임(note or "", 40)),
        )
        for item_id, trip_id, trip_title, title, day, note in 줄들
    ]


async def _준비물(session, space_id, 무늬, 한도) -> list[Hit]:
    줄들 = await session.execute(
        _여행_안에서(
            select(ChecklistItem.id, Trip.id, Trip.title, ChecklistItem.name, ChecklistItem.quantity)
            .join(Checklist, Checklist.id == ChecklistItem.checklist_id)
            .join(Trip, Trip.id == Checklist.trip_id),
            space_id,
        )
        .where(
            or_(
                ChecklistItem.name.ilike(무늬, escape="\\"),
                ChecklistItem.quantity.ilike(무늬, escape="\\"),
            )
        )
        .limit(한도)
    )
    return [
        Hit(
            type="packing",
            id=item_id,
            trip_id=trip_id,
            trip_title=trip_title,
            title=name,
            detail=_이음(quantity),
        )
        for item_id, trip_id, trip_title, name, quantity in 줄들
    ]


async def _요리(session, space_id, 무늬, 한도) -> list[Hit]:
    """재료로도 찾는다. 「대파」로 찾으면 그 재료가 들어간 요리가 나온다."""
    줄들 = await session.execute(
        _여행_안에서(
            select(Recipe.id, Trip.id, Trip.title, Recipe.name, Recipe.memo)
            .join(Trip, Trip.id == Recipe.trip_id),
            space_id,
        )
        .where(
            or_(
                Recipe.name.ilike(무늬, escape="\\"),
                Recipe.memo.ilike(무늬, escape="\\"),
                Recipe.id.in_(
                    select(Ingredient.recipe_id).where(Ingredient.name.ilike(무늬, escape="\\"))
                ),
            )
        )
        .limit(한도)
    )
    return [
        Hit(
            type="recipe",
            id=recipe_id,
            trip_id=trip_id,
            trip_title=trip_title,
            title=name,
            detail=_이음(_줄임(memo or "", 40)),
        )
        for recipe_id, trip_id, trip_title, name, memo in 줄들
    ]


async def _지출(session, space_id, 무늬, 한도) -> list[Hit]:
    줄들 = await session.execute(
        _여행_안에서(
            select(Expense.id, Trip.id, Trip.title, Expense.title, TripDay.date, Expense.memo)
            .join(Trip, Trip.id == Expense.trip_id)
            .join(TripDay, TripDay.id == Expense.trip_day_id, isouter=True),
            space_id,
        )
        .where(
            or_(
                Expense.title.ilike(무늬, escape="\\"),
                Expense.memo.ilike(무늬, escape="\\"),
            )
        )
        .limit(한도)
    )
    return [
        Hit(
            type="expense",
            id=expense_id,
            trip_id=trip_id,
            trip_title=trip_title,
            title=title,
            detail=_이음(day.isoformat() if day else None, _줄임(memo or "", 40)),
        )
        for expense_id, trip_id, trip_title, title, day, memo in 줄들
    ]


async def _메모(session, space_id, 무늬, 한도) -> list[Hit]:
    줄들 = list(
        await session.execute(
            _여행_안에서(
                select(Memo.id, Trip.id, Trip.title, Memo.body, Memo.author_membership_id)
                .join(Trip, Trip.id == Memo.trip_id),
                space_id,
            )
            .where(Memo.deleted_at.is_(None), Memo.body.ilike(무늬, escape="\\"))
            .limit(한도)
        )
    )
    이름들 = await author_names(session, [줄[4] for 줄 in 줄들])
    return [
        Hit(
            type="memo",
            id=memo_id,
            trip_id=trip_id,
            trip_title=trip_title,
            title=_줄임(body),
            detail=name_of(이름들, author),
        )
        for memo_id, trip_id, trip_title, body, author in 줄들
    ]


async def _일기(session, space_id, 무늬, 한도) -> list[Hit]:
    줄들 = list(
        await session.execute(
            _여행_안에서(
                select(Diary.id, Trip.id, Trip.title, Diary.title, Diary.body, Diary.written_on, Diary.author_membership_id)
                .join(Trip, Trip.id == Diary.trip_id),
                space_id,
            )
            .where(
                or_(
                    Diary.title.ilike(무늬, escape="\\"),
                    Diary.body.ilike(무늬, escape="\\"),
                )
            )
            .limit(한도)
        )
    )
    이름들 = await author_names(session, [줄[6] for 줄 in 줄들])
    return [
        Hit(
            type="diary",
            id=diary_id,
            trip_id=trip_id,
            trip_title=trip_title,
            title=title or _줄임(body),
            detail=_이음(written_on.isoformat() if written_on else None, name_of(이름들, author)),
        )
        for diary_id, trip_id, trip_title, title, body, written_on, author in 줄들
    ]


_종류별 = {
    "trip": _여행,
    "place": _장소,
    "schedule": _일정,
    "packing": _준비물,
    "recipe": _요리,
    "expense": _지출,
    "memo": _메모,
    "diary": _일기,
}
