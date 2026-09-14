from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import Trip, TripDay, TripParticipant, TripStatus
from tests.factories import (
    공간과_멤버_하나,
    멤버를_넣는다,
    사람을_넣는다,
    여행을_넣는다,
    참가자를_넣는다,
)

pytestmark = pytest.mark.anyio


async def test_여행의_기본값(db):
    """
    비워 두고 만들었을 때 무엇이 되는지가 곧 제품 결정이다.
    정산 묶기가 기본 켜짐인 것과 요리 탭이 기본 꺼짐인 것이 특히 그렇다.
    """
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    await db.refresh(trip)

    assert trip.status is TripStatus.PLANNING
    assert trip.simplify_settlement is True
    assert trip.cooking_enabled is False
    assert trip.currency_code == "KRW"
    assert trip.version == 1
    assert trip.exchange_rate is None
    assert trip.budget is None


async def test_끝나는_날이_앞설_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)

    with pytest.raises(IntegrityError):
        await 여행을_넣는다(db, space, 시작=date(2026, 10, 3), 끝=date(2026, 10, 1))


async def test_하루짜리_여행은_된다(db):
    """같은 날 시작하고 끝나는 당일치기는 막으면 안 된다."""
    space, _ = await 공간과_멤버_하나(db)

    trip = await 여행을_넣는다(db, space, 시작=date(2026, 10, 1), 끝=date(2026, 10, 1))

    assert trip.id is not None


@pytest.mark.parametrize("환율", [Decimal("0"), Decimal("-1.5")])
async def test_환율은_양수여야_한다(db, 환율):
    space, _ = await 공간과_멤버_하나(db)
    trip = Trip(
        space_id=space.id,
        title="도쿄",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
        currency_code="JPY",
        exchange_rate=환율,
    )
    db.add(trip)

    with pytest.raises(IntegrityError):
        await db.flush()


async def test_예산은_음수일_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = Trip(
        space_id=space.id,
        title="제주",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
        budget=Decimal("-1"),
    )
    db.add(trip)

    with pytest.raises(IntegrityError):
        await db.flush()


async def test_금액은_소수점이_살아_있어야_한다(db):
    """
    나눈 금액에 소수가 생기므로 계산은 소수로 끝까지 한다. 정수로 저장하면
    여기서 이미 깎인다.
    """
    space, _ = await 공간과_멤버_하나(db)
    trip = Trip(
        space_id=space.id,
        title="도쿄",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
        currency_code="JPY",
        exchange_rate=Decimal("9.123456"),
        budget=Decimal("12345.67"),
    )
    db.add(trip)
    await db.flush()
    await db.refresh(trip)

    assert trip.exchange_rate == Decimal("9.123456")
    assert trip.budget == Decimal("12345.67")


async def test_공간을_지우면_여행도_사라진다(db):
    space, _ = await 공간과_멤버_하나(db)
    await 여행을_넣는다(db, space)

    await db.execute(text("DELETE FROM spaces WHERE id = :id"), {"id": space.id})

    남은 = await db.scalar(select(func.count()).select_from(Trip).where(Trip.space_id == space.id))
    assert 남은 == 0


# ---------------------------------------------------------------------------
# 여행의 하루
# ---------------------------------------------------------------------------


async def test_같은_날짜를_두_번_넣을_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    db.add(TripDay(trip_id=trip.id, date=date(2026, 10, 1), day_index=1))
    await db.flush()

    db.add(TripDay(trip_id=trip.id, date=date(2026, 10, 1), day_index=2))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_같은_일차를_두_번_넣을_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    db.add(TripDay(trip_id=trip.id, date=date(2026, 10, 1), day_index=1))
    await db.flush()

    db.add(TripDay(trip_id=trip.id, date=date(2026, 10, 2), day_index=1))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_일차는_1부터다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(TripDay(trip_id=trip.id, date=date(2026, 10, 1), day_index=0))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_다른_여행이면_같은_날짜여도_된다(db):
    space, _ = await 공간과_멤버_하나(db)
    첫_여행 = await 여행을_넣는다(db, space, 제목="첫 여행")
    둘째_여행 = await 여행을_넣는다(db, space, 제목="둘째 여행")

    db.add(TripDay(trip_id=첫_여행.id, date=date(2026, 10, 1), day_index=1))
    db.add(TripDay(trip_id=둘째_여행.id, date=date(2026, 10, 1), day_index=1))
    await db.flush()  # 터지지 않아야 한다


# ---------------------------------------------------------------------------
# 참가자
# ---------------------------------------------------------------------------


async def test_참가자_목록은_비어_있는_것이_기본이다(db):
    """
    비어 있으면 그 공간의 활성 멤버 전원으로 본다. 가장 흔한 경우를 비워
    두면 사람이 늘거나 줄어도 고칠 것이 없다.
    """
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    수 = await db.scalar(
        select(func.count()).select_from(TripParticipant).where(TripParticipant.trip_id == trip.id)
    )
    assert 수 == 0


async def test_같은_사람을_참가자로_두_번_넣을_수_없다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    await 참가자를_넣는다(db, trip, membership)

    db.add(TripParticipant(trip_id=trip.id, membership_id=membership.id))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_뺐던_사람을_다시_넣을_수_있다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    뺀_사람 = await 참가자를_넣는다(db, trip, membership)
    뺀_사람.removed_at = datetime.now(UTC)
    await db.flush()

    await 참가자를_넣는다(db, trip, membership)

    전체 = await db.scalar(
        select(func.count()).select_from(TripParticipant).where(TripParticipant.trip_id == trip.id)
    )
    assert 전체 == 2


async def test_참가자로_쓰이는_멤버는_지울_수_없다(db):
    """
    RESTRICT 다. 지난 여행의 담당과 지출이 이 줄을 거쳐 사람을 가리키므로
    멤버 행이 사라지면 기록이 무너진다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    await 참가자를_넣는다(db, trip, membership)

    with pytest.raises(IntegrityError):
        await db.execute(
            text("DELETE FROM memberships WHERE id = :id"), {"id": membership.id}
        )


async def test_여행을_지우면_참가자_줄은_사라진다(db):
    """
    멤버는 남기되 이 여행에 누가 갔는지는 여행과 함께 사라진다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    await 참가자를_넣는다(db, trip, membership)

    await db.execute(text("DELETE FROM trips WHERE id = :id"), {"id": trip.id})

    남은 = await db.scalar(
        select(func.count()).select_from(TripParticipant).where(TripParticipant.trip_id == trip.id)
    )
    assert 남은 == 0


async def test_여행마다_참가자를_따로_고른다(db):
    """
    한 공간에 멤버가 여럿이어도 이번 여행에는 일부만 가는 일이 흔하다.
    """
    space, owner_membership = await 공간과_멤버_하나(db)
    동행 = await 사람을_넣는다(db, "다온")
    동행_멤버 = await 멤버를_넣는다(db, space, 동행)

    둘이_가는_여행 = await 여행을_넣는다(db, space, 제목="둘이")
    혼자_가는_여행 = await 여행을_넣는다(db, space, 제목="혼자")
    await 참가자를_넣는다(db, 둘이_가는_여행, owner_membership, 순서=0)
    await 참가자를_넣는다(db, 둘이_가는_여행, 동행_멤버, 순서=1)
    await 참가자를_넣는다(db, 혼자_가는_여행, owner_membership)

    둘이 = await db.scalar(
        select(func.count()).select_from(TripParticipant).where(
            TripParticipant.trip_id == 둘이_가는_여행.id
        )
    )
    혼자 = await db.scalar(
        select(func.count()).select_from(TripParticipant).where(
            TripParticipant.trip_id == 혼자_가는_여행.id
        )
    )
    assert (둘이, 혼자) == (2, 1)
