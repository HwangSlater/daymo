from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import (
    Expense,
    ExpenseCategory,
    ExpenseShare,
    Payment,
    SplitMode,
    TripDay,
)
from tests.factories import (
    공간과_멤버_하나,
    멤버를_넣는다,
    사람을_넣는다,
    여행을_넣는다,
)

pytestmark = pytest.mark.anyio


async def 지출을_넣는다(db, trip, payer, **값):
    값.setdefault("title", "소나기식당 저녁")
    값.setdefault("amount", Decimal("48000"))
    expense = Expense(trip_id=trip.id, payer_membership_id=payer.id, **값)
    db.add(expense)
    await db.flush()
    return expense


async def test_지출의_기본값(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    expense = await 지출을_넣는다(db, trip, membership)
    await db.refresh(expense)

    assert expense.category is ExpenseCategory.OTHER
    # 값이 없으면 shares 모양에서 짐작한다. 기본값을 박아 두면 그럴 수 없다.
    assert expense.split_mode is None


async def test_0원_지출은_적을_수_없다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    with pytest.raises(IntegrityError):
        await 지출을_넣는다(db, trip, membership, amount=Decimal("0"))


async def test_금액의_소수점이_살아_있다(db):
    """
    나눈 금액에 소수가 생긴다. 계산은 소수로 끝까지 하고 주고받을 금액만
    반올림한다. 정수로 저장하면 여기서 이미 깎인다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    expense = await 지출을_넣는다(db, trip, membership, amount=Decimal("48000.33"))
    await db.refresh(expense)

    assert expense.amount == Decimal("48000.33")


async def test_몫은_없는_것이_기본이다(db):
    """
    줄이 하나도 없으면 참가자 전원이 똑같이 나눈 것으로 본다. 가장 흔한
    경우를 비워 두면 사람이 늘거나 줄어도 고칠 것이 없다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    expense = await 지출을_넣는다(db, trip, membership)

    몫 = await db.scalar(
        select(func.count()).select_from(ExpenseShare).where(ExpenseShare.expense_id == expense.id)
    )
    assert 몫 == 0


async def test_같은_사람에게_몫을_두_번_줄_수_없다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    expense = await 지출을_넣는다(db, trip, membership)
    db.add(ExpenseShare(expense_id=expense.id, membership_id=membership.id, weight=Decimal("1")))
    await db.flush()

    db.add(ExpenseShare(expense_id=expense.id, membership_id=membership.id, weight=Decimal("2")))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_비중은_음수일_수_없다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    expense = await 지출을_넣는다(db, trip, membership)

    db.add(ExpenseShare(expense_id=expense.id, membership_id=membership.id, weight=Decimal("-1")))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_비중_0은_넣을_수_있다(db):
    """앱이 이 사람은 빼기를 0 으로 보내올 수 있다."""
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    expense = await 지출을_넣는다(db, trip, membership)

    db.add(ExpenseShare(expense_id=expense.id, membership_id=membership.id, weight=Decimal("0")))
    await db.flush()


async def test_비중은_합이_얼마든_상관없다(db):
    """비율이 아니라 비중이다. 각자의 몫은 금액 x 내 비중 / 비중 합이다."""
    space, 내_멤버 = await 공간과_멤버_하나(db)
    동행 = await 멤버를_넣는다(db, space, await 사람을_넣는다(db, "다온"))
    trip = await 여행을_넣는다(db, space)
    expense = await 지출을_넣는다(db, trip, 내_멤버, amount=Decimal("30000"))
    db.add(ExpenseShare(expense_id=expense.id, membership_id=내_멤버.id, weight=Decimal("7")))
    db.add(ExpenseShare(expense_id=expense.id, membership_id=동행.id, weight=Decimal("3")))
    await db.flush()

    비중들 = (
        await db.execute(select(ExpenseShare.weight).where(ExpenseShare.expense_id == expense.id))
    ).scalars().all()
    assert sum(비중들) == Decimal("10")


async def test_지출을_지우면_몫도_사라진다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    expense = await 지출을_넣는다(db, trip, membership)
    db.add(ExpenseShare(expense_id=expense.id, membership_id=membership.id, weight=Decimal("1")))
    await db.flush()

    await db.execute(text("DELETE FROM expenses WHERE id = :id"), {"id": expense.id})

    남은 = await db.scalar(
        select(func.count()).select_from(ExpenseShare).where(ExpenseShare.expense_id == expense.id)
    )
    assert 남은 == 0


async def test_지출이_걸린_멤버는_지울_수_없다(db):
    """지난 여행의 정산이 이 사람을 가리키고 있다."""
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    await 지출을_넣는다(db, trip, membership)

    with pytest.raises(IntegrityError):
        await db.execute(text("DELETE FROM memberships WHERE id = :id"), {"id": membership.id})


async def test_날을_지워도_지출은_남는다(db):
    """얼마를 썼는지는 어느 날이었는지와 무관하게 합계에 들어가야 한다."""
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    day = TripDay(trip_id=trip.id, date=trip.start_date, day_index=1)
    db.add(day)
    await db.flush()
    expense = await 지출을_넣는다(db, trip, membership, trip_day_id=day.id)

    await db.execute(text("DELETE FROM trip_days WHERE id = :id"), {"id": day.id})
    await db.refresh(expense)

    assert expense.trip_day_id is None
    assert expense.amount == Decimal("48000")


async def test_나누기_방식은_저장만_하고_계산에_쓰지_않는다(db):
    """
    화면이 지출을 다시 열 때 고른 방식 그대로 열어 주기 위한 값이다.
    몫은 expense_shares 만 보고 정한다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    expense = await 지출을_넣는다(db, trip, membership, split_mode=SplitMode.AMOUNT)
    await db.refresh(expense)

    assert expense.split_mode is SplitMode.AMOUNT
    # 방식을 골랐다고 몫이 생기지는 않는다.
    assert await db.scalar(
        select(func.count()).select_from(ExpenseShare).where(ExpenseShare.expense_id == expense.id)
    ) == 0


# ---------------------------------------------------------------------------
# 주고받은 기록
# ---------------------------------------------------------------------------


async def test_자기_자신에게_보냈다고_적을_수_없다(db):
    """잔액은 그대로인데 목록만 줄어든다."""
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(
        Payment(
            trip_id=trip.id,
            from_membership_id=membership.id,
            to_membership_id=membership.id,
            amount=Decimal("10000"),
        )
    )
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_0원을_보냈다고_적을_수_없다(db):
    space, 내_멤버 = await 공간과_멤버_하나(db)
    동행 = await 멤버를_넣는다(db, space, await 사람을_넣는다(db, "다온"))
    trip = await 여행을_넣는다(db, space)

    db.add(
        Payment(
            trip_id=trip.id,
            from_membership_id=내_멤버.id,
            to_membership_id=동행.id,
            amount=Decimal("0"),
        )
    )
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_부분_정산을_적을_수_있다(db):
    """일부만 보냈다고 적을 수 있어야 목록이 조금씩 줄어든다."""
    space, 내_멤버 = await 공간과_멤버_하나(db)
    동행 = await 멤버를_넣는다(db, space, await 사람을_넣는다(db, "다온"))
    trip = await 여행을_넣는다(db, space)

    for 금액 in (Decimal("10000"), Decimal("14000")):
        db.add(
            Payment(
                trip_id=trip.id,
                from_membership_id=내_멤버.id,
                to_membership_id=동행.id,
                amount=금액,
            )
        )
    await db.flush()

    합 = await db.scalar(
        select(func.sum(Payment.amount)).where(Payment.trip_id == trip.id)
    )
    assert 합 == Decimal("24000")
