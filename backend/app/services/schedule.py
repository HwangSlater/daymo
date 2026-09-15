"""
일정 줄과 숙소.

둘 다 "공간 시간대의 날짜와 시각" 을 주고받고 timestamptz 로 저장한다. 날짜만
있고 시각이 없는 일정은 `trip_day_id` 로 날을, `start_at` 을 비워 "시간 미정" 을
나타낸다.
"""

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import (
    ExternalLink,
    LinkTargetType,
    Membership,
    PhotoTargetType,
    ScheduleItem,
    Space,
    Stay,
    Trip,
    TripDay,
    TripPlace,
)
from app.services.links import detach_all
from app.services.places import check_map_url


# ---------------------------------------------------------------------------
# 시간대
# ---------------------------------------------------------------------------


async def zone_of(session: AsyncSession, trip: Trip) -> ZoneInfo:
    return zone_named(await session.scalar(select(Space.timezone).where(Space.id == trip.space_id)))


def zone_named(이름: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(이름 or "Asia/Seoul")
    except Exception:  # noqa: BLE001 - 잘못 저장된 시간대는 기본값으로 읽는다
        return ZoneInfo("Asia/Seoul")


def to_instant(day: date, clock: str, zone: ZoneInfo) -> datetime:
    시, 분 = (int(조각) for 조각 in clock.split(":"))
    return datetime.combine(day, time(시, 분), tzinfo=zone)


def local_clock(instant: datetime | None, zone: ZoneInfo) -> str | None:
    return instant.astimezone(zone).strftime("%H:%M") if instant else None


def parse_local(value: str | None, zone: ZoneInfo, field: str = "checkInAt") -> datetime | None:
    if value is None:
        return None
    날, 시각 = value.split("T")
    try:
        return to_instant(date.fromisoformat(날), 시각, zone)
    except ValueError as 원인:
        # 2월 30일처럼 모양만 맞는 날짜.
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={field: "날짜를 확인해 주세요."}) from 원인


def format_local(instant: datetime | None, zone: ZoneInfo) -> str | None:
    return instant.astimezone(zone).strftime("%Y-%m-%dT%H:%M") if instant else None


# ---------------------------------------------------------------------------
# 여행 날
# ---------------------------------------------------------------------------


async def sync_trip_days(session: AsyncSession, trip: Trip) -> None:
    """
    여행 기간이 바뀌면 `trip_days` 를 새 기간에 맞춘다.

    예전에는 만들 때만 날을 만들고 기간을 고쳐도 그대로 두었다. 늘린 날에는
    일정을 붙일 수 없었고, 줄인 날이 일정 목록에 남았다.

    남는 날은 그대로 둔다(일정이 그 날을 가리키고 있다). 빠진 날은 지운다.
    그 날을 가리키던 일정·지출은 외래키가 SET NULL 이라 "날짜 미정" 이 된다.
    앱은 기간을 고칠 때 일정 날짜를 새 기간으로 옮겨 다시 보낸다.
    """
    원하는_날 = [trip.start_date + timedelta(days=i) for i in range((trip.end_date - trip.start_date).days + 1)]
    기존 = (await session.execute(select(TripDay).where(TripDay.trip_id == trip.id))).scalars().all()
    남길_날 = {day.date: day for day in 기존 if day.date in set(원하는_날)}

    빠진_ids = [day.id for day in 기존 if day.date not in 남길_날]
    if 빠진_ids:
        await session.execute(delete(TripDay).where(TripDay.id.in_(빠진_ids)))

    # day_index 는 여행 안에서 유일하다. 순서를 바로 바꾸면 잠깐 겹쳐서 막히므로
    # 먼저 멀리 비켜 두었다가 제자리에 놓는다.
    if 남길_날:
        await session.execute(
            update(TripDay)
            .where(TripDay.id.in_([day.id for day in 남길_날.values()]))
            .values(day_index=TripDay.day_index + 100_000)
        )
        await session.flush()
    for 순서, 날 in enumerate(원하는_날, start=1):
        day = 남길_날.get(날)
        if day is None:
            session.add(TripDay(trip_id=trip.id, date=날, day_index=순서))
        else:
            await session.execute(update(TripDay).where(TripDay.id == day.id).values(day_index=순서))
    await session.flush()


async def _day_for(session: AsyncSession, trip: Trip, day: date | None) -> TripDay | None:
    if day is None:
        return None
    trip_day = await session.scalar(select(TripDay).where(TripDay.trip_id == trip.id, TripDay.date == day))
    if trip_day is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"date": "여행 기간 안의 날짜를 골라 주세요."})
    return trip_day


async def _place_for(session: AsyncSession, trip: Trip, trip_place_id: uuid.UUID | None) -> uuid.UUID | None:
    """같은 여행의 장소만 붙인다. 외래키로는 "같은 여행" 을 막을 수 없다."""
    if trip_place_id is None:
        return None
    같은_여행 = await session.scalar(
        select(TripPlace.id).where(TripPlace.id == trip_place_id, TripPlace.trip_id == trip.id)
    )
    if 같은_여행 is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"tripPlaceId": "이 여행의 장소가 아니에요."})
    return 같은_여행


# ---------------------------------------------------------------------------
# 일정 줄
# ---------------------------------------------------------------------------


async def list_items(session: AsyncSession, trip: Trip) -> list[tuple[ScheduleItem, date | None, str | None]]:
    줄들 = (
        await session.execute(
            select(ScheduleItem, TripDay.date)
            .outerjoin(TripDay, TripDay.id == ScheduleItem.trip_day_id)
            .where(ScheduleItem.trip_id == trip.id)
            .order_by(TripDay.date.nulls_last(), ScheduleItem.start_at.nulls_last(), ScheduleItem.created_at)
        )
    ).all()
    링크 = await _links(session, LinkTargetType.SCHEDULE, [item.id for item, _ in 줄들])
    return [(item, day, 링크.get(item.id)) for item, day in 줄들]


async def item_view(session: AsyncSession, item: ScheduleItem) -> tuple[ScheduleItem, date | None, str | None]:
    day = await session.scalar(select(TripDay.date).where(TripDay.id == item.trip_day_id)) if item.trip_day_id else None
    링크 = await _links(session, LinkTargetType.SCHEDULE, [item.id])
    return item, day, 링크.get(item.id)


async def create_item(
    session: AsyncSession, *, trip: Trip, actor: Membership, item_id: uuid.UUID | None, values: dict
) -> tuple[ScheduleItem, bool]:
    if item_id is not None:
        기존 = await session.get(ScheduleItem, item_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False

    링크 = check_map_url(values.get("map_url"))
    zone = await zone_of(session, trip)
    trip_day = await _day_for(session, trip, values.get("date"))
    item = ScheduleItem(
        id=item_id or uuid.uuid4(),
        trip_id=trip.id,
        trip_day_id=trip_day.id if trip_day else None,
        trip_place_id=await _place_for(session, trip, values.get("trip_place_id")),
        start_at=to_instant(trip_day.date, values["time"], zone) if trip_day and values.get("time") else None,
        title=values["title"].strip(),
        type=values["type"],
        note=_blank(values.get("note")),
        created_by=actor.user_id,
    )
    session.add(item)
    await session.flush()
    await _replace_link(session, LinkTargetType.SCHEDULE, item.id, 링크, actor)
    return item, True


async def update_item(
    session: AsyncSession, *, trip: Trip, item: ScheduleItem, actor: Membership, version: int, changes: dict
) -> ScheduleItem:
    if version != item.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    zone = await zone_of(session, trip)

    지금_날 = await session.scalar(select(TripDay.date).where(TripDay.id == item.trip_day_id)) if item.trip_day_id else None
    지금_시각 = local_clock(item.start_at, zone)
    새_날 = changes["date"] if "date" in changes else 지금_날
    새_시각 = changes["time"] if "time" in changes else 지금_시각
    if "date" in changes or "time" in changes:
        trip_day = await _day_for(session, trip, 새_날)
        item.trip_day_id = trip_day.id if trip_day else None
        # 날이 없으면 시각도 둘 곳이 없다.
        item.start_at = to_instant(trip_day.date, 새_시각, zone) if trip_day and 새_시각 else None
        item.end_at = None

    if "title" in changes:
        if not (changes["title"] or "").strip():
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"title": "일정 이름을 적어 주세요."})
        item.title = changes["title"].strip()
    if "type" in changes and changes["type"] is not None:
        item.type = changes["type"]
    if "note" in changes:
        item.note = _blank(changes["note"])
    if "trip_place_id" in changes:
        item.trip_place_id = await _place_for(session, trip, changes["trip_place_id"])
    if "map_url" in changes:
        await _replace_link(session, LinkTargetType.SCHEDULE, item.id, check_map_url(changes["map_url"]), actor)

    item.version += 1
    await session.flush()
    return item


async def remove_item(session: AsyncSession, item: ScheduleItem) -> None:
    await detach_all(session, link_target=LinkTargetType.SCHEDULE, photo_target=PhotoTargetType.SCHEDULE, target_id=item.id)
    await session.delete(item)
    await session.flush()


# ---------------------------------------------------------------------------
# 숙소
# ---------------------------------------------------------------------------


async def list_stays(session: AsyncSession, trip: Trip) -> list[Stay]:
    return list(
        (
            await session.execute(
                select(Stay).where(Stay.trip_id == trip.id).order_by(Stay.check_in_at.nulls_last(), Stay.created_at)
            )
        ).scalars().all()
    )


def _check_order(check_in: datetime | None, check_out: datetime | None) -> None:
    if check_in and check_out and check_out <= check_in:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"checkOutAt": "체크아웃은 체크인 뒤여야 해요."})


async def create_stay(
    session: AsyncSession, *, trip: Trip, actor: Membership, stay_id: uuid.UUID | None, values: dict
) -> tuple[Stay, bool]:
    if stay_id is not None:
        기존 = await session.get(Stay, stay_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False
    zone = await zone_of(session, trip)
    check_in = parse_local(values.get("check_in_at"), zone)
    check_out = parse_local(values.get("check_out_at"), zone, "checkOutAt")
    _check_order(check_in, check_out)
    stay = Stay(
        id=stay_id or uuid.uuid4(),
        trip_id=trip.id,
        trip_place_id=await _place_for(session, trip, values.get("trip_place_id")),
        check_in_at=check_in,
        check_out_at=check_out,
        note=_blank(values.get("note")),
        show_in_schedule=values.get("show_in_schedule", True),
        created_by=actor.user_id,
    )
    session.add(stay)
    await session.flush()
    return stay, True


async def update_stay(
    session: AsyncSession, *, trip: Trip, stay: Stay, version: int, changes: dict
) -> Stay:
    if version != stay.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    zone = await zone_of(session, trip)
    if "check_in_at" in changes:
        stay.check_in_at = parse_local(changes["check_in_at"], zone)
    if "check_out_at" in changes:
        stay.check_out_at = parse_local(changes["check_out_at"], zone, "checkOutAt")
    _check_order(stay.check_in_at, stay.check_out_at)
    if "trip_place_id" in changes:
        stay.trip_place_id = await _place_for(session, trip, changes["trip_place_id"])
    if "note" in changes:
        stay.note = _blank(changes["note"])
    if "show_in_schedule" in changes and changes["show_in_schedule"] is not None:
        stay.show_in_schedule = changes["show_in_schedule"]
    stay.version += 1
    await session.flush()
    return stay


async def remove_stay(session: AsyncSession, stay: Stay) -> None:
    await detach_all(session, link_target=LinkTargetType.STAY, photo_target=PhotoTargetType.STAY, target_id=stay.id)
    await session.delete(stay)
    await session.flush()


# ---------------------------------------------------------------------------


def _blank(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


async def _links(session: AsyncSession, target: LinkTargetType, ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    줄들 = (
        await session.execute(
            select(ExternalLink.target_id, ExternalLink.url)
            .where(ExternalLink.target_type == target, ExternalLink.target_id.in_(ids))
            .order_by(ExternalLink.created_at)
        )
    ).all()
    결과: dict[uuid.UUID, str] = {}
    for target_id, url in 줄들:
        결과.setdefault(target_id, url)
    return 결과


async def _replace_link(session: AsyncSession, target: LinkTargetType, target_id: uuid.UUID, link, actor: Membership) -> None:
    await session.execute(
        delete(ExternalLink).where(ExternalLink.target_type == target, ExternalLink.target_id == target_id)
    )
    if link is None:
        return
    url, provider = link
    session.add(ExternalLink(target_type=target, target_id=target_id, provider=provider, url=url, created_by=actor.user_id))
    await session.flush()
