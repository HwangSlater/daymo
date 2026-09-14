import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import AppError, ErrorCode
from app.models import Payment, Trip
from app.services.settlement import (
    alive_payment_count,
    set_simplify_settlement,
    undo_payment,
)
from tests.factories import 공간과_멤버_하나, 멤버를_넣는다, 사람을_넣는다, 여행을_넣는다

pytestmark = pytest.mark.anyio


async def 여행과_두_사람(db):
    space, 내_멤버 = await 공간과_멤버_하나(db)
    동행 = await 멤버를_넣는다(db, space, await 사람을_넣는다(db, "다온"))
    trip = await 여행을_넣는다(db, space)
    return space, trip, 내_멤버, 동행


async def 보냈다고_적는다(db, trip, 보낸이, 받는이, 금액=Decimal("10000")) -> Payment:
    payment = Payment(
        trip_id=trip.id,
        from_membership_id=보낸이.id,
        to_membership_id=받는이.id,
        amount=금액,
    )
    db.add(payment)
    await db.flush()
    return payment


async def 저장된_묶기(db, trip) -> bool:
    return await db.scalar(select(Trip.simplify_settlement).where(Trip.id == trip.id))


async def test_기록이_없으면_묶기를_바꿀_수_있다(db):
    _, trip, _, _ = await 여행과_두_사람(db)

    await set_simplify_settlement(db, trip.id, False)

    assert await 저장된_묶기(db, trip) is False


async def test_기록이_있으면_묶기를_바꿀_수_없다(db):
    """
    묶은 화면대로 보낸 뒤에 방식을 바꾸면 이미 보낸 돈이 엉뚱한 곳으로 간
    것이 된다. 앱이 토글을 잠그는 것만으로는 API 를 직접 부르는 쪽에서 뚫린다.
    """
    _, trip, 내_멤버, 동행 = await 여행과_두_사람(db)
    await 보냈다고_적는다(db, trip, 내_멤버, 동행)

    with pytest.raises(AppError) as 잡힌_것:
        await set_simplify_settlement(db, trip.id, False)

    assert 잡힌_것.value.code is ErrorCode.SETTLEMENT_IN_PROGRESS
    assert 잡힌_것.value.status_code == 409
    # 값이 바뀌지 않아야 한다.
    assert await 저장된_묶기(db, trip) is True


async def test_같은_값으로_다시_써도_막지_않는다(db):
    """
    바뀌는 것이 없으니 막을 이유가 없다. 화면이 받아 온 값을 그대로 저장하는
    흔한 경우를 오류로 만들면 쓸 수 없는 API 가 된다.
    """
    _, trip, 내_멤버, 동행 = await 여행과_두_사람(db)
    await 보냈다고_적는다(db, trip, 내_멤버, 동행)

    await set_simplify_settlement(db, trip.id, True)

    assert await 저장된_묶기(db, trip) is True


async def test_기록을_되돌리면_다시_바꿀_수_있다(db):
    _, trip, 내_멤버, 동행 = await 여행과_두_사람(db)
    payment = await 보냈다고_적는다(db, trip, 내_멤버, 동행)

    await undo_payment(db, payment.id)
    await set_simplify_settlement(db, trip.id, False)

    assert await 저장된_묶기(db, trip) is False


async def test_되돌린_기록은_세지_않는다(db):
    _, trip, 내_멤버, 동행 = await 여행과_두_사람(db)
    남길_것 = await 보냈다고_적는다(db, trip, 내_멤버, 동행)
    되돌릴_것 = await 보냈다고_적는다(db, trip, 동행, 내_멤버)

    await undo_payment(db, 되돌릴_것.id)

    assert await alive_payment_count(db, trip.id) == 1
    await db.refresh(남길_것)
    assert 남길_것.deleted_at is None


async def test_되돌린_기록은_지워지지_않는다(db):
    """되돌린 사실 자체가 정산에서 말이 갈릴 때 근거가 된다."""
    _, trip, 내_멤버, 동행 = await 여행과_두_사람(db)
    payment = await 보냈다고_적는다(db, trip, 내_멤버, 동행)

    await undo_payment(db, payment.id)
    await db.refresh(payment)

    assert payment.deleted_at is not None
    assert payment.amount == Decimal("10000")


async def test_두_번_되돌려도_시각을_덮어쓰지_않는다(db):
    """처음 되돌린 때가 기록으로 남아야 한다."""
    _, trip, 내_멤버, 동행 = await 여행과_두_사람(db)
    payment = await 보냈다고_적는다(db, trip, 내_멤버, 동행)
    await undo_payment(db, payment.id)
    await db.refresh(payment)
    처음_되돌린_때 = payment.deleted_at

    await undo_payment(db, payment.id)
    await db.refresh(payment)

    assert payment.deleted_at == 처음_되돌린_때


async def test_다른_여행의_기록은_잠그지_않는다(db):
    space, trip, 내_멤버, 동행 = await 여행과_두_사람(db)
    다른_여행 = await 여행을_넣는다(db, space, 제목="다른 여행")
    await 보냈다고_적는다(db, 다른_여행, 내_멤버, 동행)

    await set_simplify_settlement(db, trip.id, False)

    assert await 저장된_묶기(db, trip) is False


async def test_없는_여행이면_찾을_수_없다고_한다(db):
    with pytest.raises(AppError) as 잡힌_것:
        await set_simplify_settlement(db, uuid.uuid4(), False)

    assert 잡힌_것.value.code is ErrorCode.NOT_FOUND
