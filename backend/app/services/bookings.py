"""
교통편과 예약.

날짜(`travel_on`·`reserved_on`)와 시각(`*_at`)을 따로 둔다. 날짜만 정하고 시각은
아직 모르는 교통편·예약이 흔한데, timestamptz 하나로는 "날짜는 있고 시각은 모름" 을
적을 수 없다. 시각은 공간 시간대로 계산한다(app/services/schedule.py).
"""

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import (
    Membership,
    Reservation,
    ReservationTargetType,
    Stay,
    Transport,
    Trip,
    TripPlace,
)
from app.services.places import check_map_url
from app.services.schedule import local_clock, to_instant, zone_of


def _blank(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


def _in_trip(trip: Trip, day: date | None) -> date | None:
    if day is not None and not (trip.start_date <= day <= trip.end_date):
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"date": "여행 기간 안의 날짜를 골라 주세요."})
    return day


# ---------------------------------------------------------------------------
# 교통편
# ---------------------------------------------------------------------------


def _갈아타는_곳(값: list[dict] | None) -> list[dict]:
    """
    갈아타는 곳을 저장할 꼴로 만든다.

    꼴 검사(이름 길이, `HH:MM`, 개수)는 스키마가 한다. 여기서는 시각이 없는
    칸의 `time` 을 `null` 로 맞춰, 키가 있고 없고로 값이 갈리지 않게 한다.
    """
    return [{"name": 칸["name"], "time": 칸.get("time")} for 칸 in (값 or [])]


async def _owner_for(session: AsyncSession, trip: Trip, membership_id: uuid.UUID | None) -> uuid.UUID | None:
    """같은 공간의 살아 있는 멤버만 탈 사람으로 정한다. 외래키로는 "같은 공간" 을 막을 수 없다."""
    if membership_id is None:
        return None
    같은_공간 = await session.scalar(
        select(Membership.id).where(
            Membership.id == membership_id,
            Membership.space_id == trip.space_id,
            Membership.left_at.is_(None),
        )
    )
    if 같은_공간 is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"ownerMembershipId": "이 공간의 멤버가 아니에요."})
    return 같은_공간


def _times(day: date | None, departure: str | None, arrival: str | None, zone) -> tuple[datetime | None, datetime | None]:
    """
    출발·도착 시각. 날짜가 없으면 둘 다 둘 곳이 없다.

    도착 시각이 출발보다 이르면 다음 날 도착으로 본다. 앱은 날짜를 하나만 받는데
    밤 비행기는 자정을 넘긴다. 같은 날로 두면 DB 가 "도착이 출발보다 빠르다" 고 막는다.
    """
    if day is None:
        return None, None
    출발 = to_instant(day, departure, zone) if departure else None
    도착 = to_instant(day, arrival, zone) if arrival else None
    if 출발 and 도착 and 도착 < 출발:
        도착 += timedelta(days=1)
    return 출발, 도착


async def list_transports(session: AsyncSession, trip: Trip) -> list[Transport]:
    return list(
        (
            await session.execute(
                select(Transport)
                .where(Transport.trip_id == trip.id)
                .order_by(Transport.travel_on.nulls_last(), Transport.departure_at.nulls_last(), Transport.created_at)
            )
        ).scalars().all()
    )


async def transport_fields(session: AsyncSession, trip: Trip, transport: Transport) -> dict:
    zone = await zone_of(session, trip)
    return {
        "date": transport.travel_on,
        "departure_time": local_clock(transport.departure_at, zone),
        "arrival_time": local_clock(transport.arrival_at, zone),
    }


async def create_transport(
    session: AsyncSession, *, trip: Trip, actor: Membership, transport_id: uuid.UUID | None, values: dict
) -> tuple[Transport, bool]:
    if transport_id is not None:
        기존 = await session.get(Transport, transport_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False
    zone = await zone_of(session, trip)
    day = _in_trip(trip, values.get("date"))
    출발, 도착 = _times(day, values.get("departure_time"), values.get("arrival_time"), zone)
    transport = Transport(
        id=transport_id or uuid.uuid4(),
        trip_id=trip.id,
        owner_membership_id=await _owner_for(session, trip, values.get("owner_membership_id")),
        direction=values["direction"],
        method=values["method"],
        travel_on=day,
        departure_name=_blank(values.get("departure_name")),
        departure_at=출발,
        arrival_name=_blank(values.get("arrival_name")),
        arrival_at=도착,
        stops=_갈아타는_곳(values.get("stops")),
        booking_status=values["booking_status"],
        note=_blank(values.get("note")),
        show_in_schedule=values.get("show_in_schedule", False),
        created_by=actor.user_id,
    )
    session.add(transport)
    await session.flush()
    return transport, True


async def update_transport(
    session: AsyncSession, *, trip: Trip, transport: Transport, version: int, changes: dict
) -> Transport:
    if version != transport.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    zone = await zone_of(session, trip)
    if {"date", "departure_time", "arrival_time"} & changes.keys():
        지금 = await transport_fields(session, trip, transport)
        day = _in_trip(trip, changes["date"] if "date" in changes else 지금["date"])
        출발_시각 = changes["departure_time"] if "departure_time" in changes else 지금["departure_time"]
        도착_시각 = changes["arrival_time"] if "arrival_time" in changes else 지금["arrival_time"]
        transport.travel_on = day
        transport.departure_at, transport.arrival_at = _times(day, 출발_시각, 도착_시각, zone)
    for 칸 in ("departure_name", "arrival_name", "note"):
        if 칸 in changes:
            setattr(transport, 칸, _blank(changes[칸]))
    # 갈아타는 곳은 통째로 갈아 끼운다. 한 칸만 고치는 일이 드물고, 차례가
    # 있는 목록이라 부분 병합은 어느 칸을 가리키는지부터 정해야 한다.
    if "stops" in changes:
        transport.stops = _갈아타는_곳(changes["stops"])
    for 칸 in ("direction", "method", "booking_status", "show_in_schedule"):
        if 칸 in changes and changes[칸] is not None:
            setattr(transport, 칸, changes[칸])
    if "owner_membership_id" in changes:
        transport.owner_membership_id = await _owner_for(session, trip, changes["owner_membership_id"])
    transport.version += 1
    await session.flush()
    return transport


async def remove_transport(session: AsyncSession, transport: Transport) -> None:
    await session.delete(transport)
    await session.flush()


# ---------------------------------------------------------------------------
# 예약
# ---------------------------------------------------------------------------


async def list_reservations(session: AsyncSession, trip: Trip) -> list[Reservation]:
    return list(
        (
            await session.execute(
                select(Reservation)
                .where(Reservation.trip_id == trip.id)
                .order_by(Reservation.reserved_on.nulls_last(), Reservation.reserved_at.nulls_last(), Reservation.created_at)
            )
        ).scalars().all()
    )


async def reservation_time(session: AsyncSession, trip: Trip, reservation: Reservation) -> str | None:
    return local_clock(reservation.reserved_at, await zone_of(session, trip))


def _booking_url(value: str | None) -> str | None:
    링크 = check_map_url(value)
    return 링크[0] if 링크 else None


# 예약이 붙을 수 있는 곳과 그 표. 사진의 `links` 와 같은 구조다(app/services/photos.py).
_붙는_곳: dict[ReservationTargetType, tuple[type, str]] = {
    ReservationTargetType.PLACE: (TripPlace, "장소"),
    ReservationTargetType.STAY: (Stay, "숙소"),
}


async def _target_for(
    session: AsyncSession,
    trip: Trip,
    target_type: ReservationTargetType,
    target_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """
    예약이 붙은 곳을 확인한다. 같은 여행의 장소·숙소만 받는다.

    `reservations.target_id` 에는 외래키가 없다(장소일 수도 숙소일 수도 있다).
    DB 가 막아 주지 못하므로 남의 여행 id 를 보내면 그 여행 사람이 아닌데도
    예약이 그쪽 장소에 걸린다. 넣는 쪽에서 확인한다.
    """
    붙을_곳 = _붙는_곳.get(target_type)
    if 붙을_곳 is None:
        # other 는 어디에도 안 붙는 예약이다. 대상이 남아 있으면 지운 뒤에도
        # 그 id 를 다시 쓰는 줄에 남의 예약이 붙어 보인다.
        if target_id is not None:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                fields={"targetId": "어디에도 붙지 않는 예약이라 대상을 비워 주세요."},
            )
        return None
    model, 이름 = 붙을_곳
    같은_여행 = (
        await session.scalar(select(model.id).where(model.id == target_id, model.trip_id == trip.id))
        if target_id is not None
        else None
    )
    if 같은_여행 is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"targetId": f"이 여행의 {이름}가 아니에요."})
    return 같은_여행


async def create_reservation(
    session: AsyncSession, *, trip: Trip, actor: Membership, reservation_id: uuid.UUID | None, values: dict
) -> tuple[Reservation, bool]:
    if reservation_id is not None:
        기존 = await session.get(Reservation, reservation_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False
    zone = await zone_of(session, trip)
    day = _in_trip(trip, values.get("date"))
    붙는_종류 = values.get("target_type") or ReservationTargetType.OTHER
    reservation = Reservation(
        id=reservation_id or uuid.uuid4(),
        trip_id=trip.id,
        target_type=붙는_종류,
        target_id=await _target_for(session, trip, 붙는_종류, values.get("target_id")),
        title=values["title"].strip(),
        reserved_on=day,
        reserved_at=to_instant(day, values["time"], zone) if day and values.get("time") else None,
        party_size=values.get("party_size"),
        party_label=_blank(values.get("party_label")),
        status=values["status"],
        booking_url=_booking_url(values.get("booking_url")),
        note=_blank(values.get("note")),
        show_in_schedule=values.get("show_in_schedule", False),
        created_by=actor.user_id,
    )
    session.add(reservation)
    await session.flush()
    return reservation, True


async def update_reservation(
    session: AsyncSession, *, trip: Trip, reservation: Reservation, version: int, changes: dict
) -> Reservation:
    if version != reservation.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    zone = await zone_of(session, trip)
    if "date" in changes or "time" in changes:
        day = _in_trip(trip, changes["date"] if "date" in changes else reservation.reserved_on)
        시각 = changes["time"] if "time" in changes else local_clock(reservation.reserved_at, zone)
        reservation.reserved_on = day
        reservation.reserved_at = to_instant(day, 시각, zone) if day and 시각 else None
    if "title" in changes:
        if not (changes["title"] or "").strip():
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"title": "예약 이름을 적어 주세요."})
        reservation.title = changes["title"].strip()
    if {"target_type", "target_id"} & changes.keys():
        종류 = changes.get("target_type") or reservation.target_type
        # other 로 되돌리면 대상도 함께 지운다. 붙는 곳을 뗀 사람에게 대상까지
        # 따로 비워 보내라고 하면 잊는 쪽이 기본이 된다.
        대상 = (
            changes["target_id"]
            if "target_id" in changes
            else (None if 종류 is ReservationTargetType.OTHER else reservation.target_id)
        )
        reservation.target_id = await _target_for(session, trip, 종류, 대상)
        reservation.target_type = 종류
    if "party_size" in changes:
        reservation.party_size = changes["party_size"]
    for 칸 in ("party_label", "note"):
        if 칸 in changes:
            setattr(reservation, 칸, _blank(changes[칸]))
    if "booking_url" in changes:
        reservation.booking_url = _booking_url(changes["booking_url"])
    for 칸 in ("status", "show_in_schedule"):
        if 칸 in changes and changes[칸] is not None:
            setattr(reservation, 칸, changes[칸])
    reservation.version += 1
    await session.flush()
    return reservation


async def remove_reservation(session: AsyncSession, reservation: Reservation) -> None:
    await session.delete(reservation)
    await session.flush()

