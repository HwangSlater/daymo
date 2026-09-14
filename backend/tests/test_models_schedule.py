from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import (
    BookingStatus,
    Reservation,
    ReservationStatus,
    ScheduleItem,
    ScheduleItemType,
    Stay,
    Transport,
    TransportDirection,
    TransportMethod,
    TripDay,
)
from tests.factories import (
    공간과_멤버_하나,
    여행_장소를_넣는다,
    여행을_넣는다,
    장소를_넣는다,
)

pytestmark = pytest.mark.anyio


def 시각(시: int, 분: int = 0) -> datetime:
    return datetime(2026, 10, 1, 시, 분, tzinfo=UTC)


# ---------------------------------------------------------------------------
# 일정
# ---------------------------------------------------------------------------


async def test_시각_없는_일정을_넣을_수_있다(db):
    """점심 어딘가처럼 시간을 안 정한 줄이 있다."""
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    item = ScheduleItem(trip_id=trip.id, title="점심 어딘가")
    db.add(item)
    await db.flush()
    await db.refresh(item)

    assert item.start_at is None
    assert item.type is ScheduleItemType.OTHER


async def test_끝나는_시각이_앞설_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(ScheduleItem(trip_id=trip.id, title="거꾸로", start_at=시각(14), end_at=시각(12)))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_시작만_있고_끝이_없어도_된다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(ScheduleItem(trip_id=trip.id, title="언제 끝날지 모름", start_at=시각(12)))
    await db.flush()


async def test_장소를_빼도_일정_줄은_남는다(db):
    """제목과 메모는 사용자가 쓴 것이라 장소가 빠졌다고 사라지면 안 된다."""
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    담긴_장소 = await 여행_장소를_넣는다(db, trip, await 장소를_넣는다(db))
    item = ScheduleItem(trip_id=trip.id, title="소나기식당 점심", trip_place_id=담긴_장소.id)
    db.add(item)
    await db.flush()

    await db.execute(text("DELETE FROM trip_places WHERE id = :id"), {"id": 담긴_장소.id})
    await db.refresh(item)

    assert item.trip_place_id is None
    assert item.title == "소나기식당 점심"


async def test_날을_지워도_일정은_남는다(db):
    """여행 기간을 줄였다고 적어 둔 일정이 통째로 사라지면 안 된다."""
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    day = TripDay(trip_id=trip.id, date=trip.start_date, day_index=1)
    db.add(day)
    await db.flush()
    item = ScheduleItem(trip_id=trip.id, title="첫날 저녁", trip_day_id=day.id)
    db.add(item)
    await db.flush()

    await db.execute(text("DELETE FROM trip_days WHERE id = :id"), {"id": day.id})
    await db.refresh(item)

    assert item.trip_day_id is None
    assert item.title == "첫날 저녁"


# ---------------------------------------------------------------------------
# 숙소
# ---------------------------------------------------------------------------


async def test_퇴실이_입실보다_늦어야_한다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(Stay(trip_id=trip.id, check_in_at=시각(15), check_out_at=시각(11)))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_주방_여부는_모름이_기본이다(db):
    """
    모르는 것과 없는 것은 다르다. 모르면 요리 탭을 켜자고 제안할 수 없다.
    """
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    stay = Stay(trip_id=trip.id)
    db.add(stay)
    await db.flush()
    await db.refresh(stay)

    assert stay.has_kitchen is None


async def test_주방이_있어도_요리_탭이_자동으로_켜지지_않는다(db):
    """
    has_kitchen 은 사실 정보일 뿐이고 탭 표시의 원본은 trips.cooking_enabled 다.
    """
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    db.add(Stay(trip_id=trip.id, has_kitchen=True))
    await db.flush()
    await db.refresh(trip)

    assert trip.cooking_enabled is False


# ---------------------------------------------------------------------------
# 교통편
# ---------------------------------------------------------------------------


async def test_타는_사람이_정해지지_않을_수_있다(db):
    """앱의 미정이 이 상태다."""
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    transport = Transport(trip_id=trip.id, direction=TransportDirection.OUTBOUND)
    db.add(transport)
    await db.flush()
    await db.refresh(transport)

    assert transport.owner_membership_id is None
    assert transport.method is TransportMethod.OTHER
    assert transport.booking_status is BookingStatus.NOT_BOOKED


async def test_교통편을_잡고_있는_멤버는_지울_수_없다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    db.add(
        Transport(
            trip_id=trip.id,
            direction=TransportDirection.RETURN,
            owner_membership_id=membership.id,
        )
    )
    await db.flush()

    with pytest.raises(IntegrityError):
        await db.execute(text("DELETE FROM memberships WHERE id = :id"), {"id": membership.id})


async def test_도착이_출발보다_앞설_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(
        Transport(
            trip_id=trip.id,
            direction=TransportDirection.OUTBOUND,
            departure_at=시각(10),
            arrival_at=시각(8),
        )
    )
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_KTX와_SRT는_따로_남는다(db):
    """예매처가 다르고 사용자가 화면에서 둘을 구분해 고른다."""
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    db.add(
        Transport(
            trip_id=trip.id, direction=TransportDirection.OUTBOUND, method=TransportMethod.KTX
        )
    )
    db.add(
        Transport(
            trip_id=trip.id, direction=TransportDirection.RETURN, method=TransportMethod.SRT
        )
    )
    await db.flush()

    방법들 = (
        await db.execute(select(Transport.method).where(Transport.trip_id == trip.id))
    ).scalars().all()
    assert sorted(방법들) == [TransportMethod.KTX, TransportMethod.SRT]


# ---------------------------------------------------------------------------
# 예약
# ---------------------------------------------------------------------------


async def test_예약의_기본_상태는_확인_필요다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    reservation = Reservation(trip_id=trip.id, title="소나기식당 저녁")
    db.add(reservation)
    await db.flush()
    await db.refresh(reservation)

    assert reservation.status is ReservationStatus.NEEDS_CHECK
    assert reservation.target_id is None


async def test_인원은_0명일_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(Reservation(trip_id=trip.id, title="0명 예약", party_size=0))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_여행을_지우면_일정_숙소_교통편_예약이_모두_사라진다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    db.add(ScheduleItem(trip_id=trip.id, title="일정"))
    db.add(Stay(trip_id=trip.id))
    db.add(Transport(trip_id=trip.id, direction=TransportDirection.OUTBOUND))
    db.add(Reservation(trip_id=trip.id, title="예약"))
    await db.flush()

    await db.execute(text("DELETE FROM trips WHERE id = :id"), {"id": trip.id})

    for model in (ScheduleItem, Stay, Transport, Reservation):
        남은 = await db.scalar(
            select(func.count()).select_from(model).where(model.trip_id == trip.id)
        )
        assert 남은 == 0, model.__name__
