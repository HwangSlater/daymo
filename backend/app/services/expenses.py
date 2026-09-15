"""
지출과 주고받은 기록.

낸 사람·몫을 지는 사람·보낸 사람·받은 사람은 모두 **같은 공간의 membership** 이어야
한다. 나간 멤버도 받는다. 그 사람이 낸 지출을 고치거나 다시 저장할 때 막히면
지난 여행의 정산이 틀어진다(docs/development/03-api-specification.md 9장).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import Expense, ExpenseShare, Membership, Payment, Trip, TripDay, User
from app.services import settlement


async def _members_of_space(session: AsyncSession, trip: Trip, ids: set[uuid.UUID]) -> set[uuid.UUID]:
    if not ids:
        return set()
    return set(
        (
            await session.execute(
                select(Membership.id).where(Membership.id.in_(ids), Membership.space_id == trip.space_id)
            )
        ).scalars().all()
    )


async def _check_people(session: AsyncSession, trip: Trip, field: str, ids: set[uuid.UUID]) -> None:
    if ids - await _members_of_space(session, trip, ids):
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={field: "이 공간의 멤버가 아닌 사람이 있어요."})


async def _day_id(session: AsyncSession, trip: Trip, day) -> uuid.UUID | None:
    if day is None:
        return None
    found = await session.scalar(select(TripDay.id).where(TripDay.trip_id == trip.id, TripDay.date == day))
    if found is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"date": "여행 기간 안의 날짜를 골라 주세요."})
    return found


def _blank(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


# ---------------------------------------------------------------------------
# 지출
# ---------------------------------------------------------------------------


async def list_expenses(session: AsyncSession, trip: Trip) -> list[tuple[Expense, object, list[ExpenseShare]]]:
    rows = (
        await session.execute(
            select(Expense, TripDay.date)
            .outerjoin(TripDay, TripDay.id == Expense.trip_day_id)
            .where(Expense.trip_id == trip.id)
            .order_by(TripDay.date.nulls_last(), Expense.created_at, Expense.id)
        )
    ).all()
    shares = await _shares_by_expense(session, [expense.id for expense, _ in rows])
    return [(expense, day, shares.get(expense.id, [])) for expense, day in rows]


async def expense_view(session: AsyncSession, expense: Expense):
    day = await session.scalar(select(TripDay.date).where(TripDay.id == expense.trip_day_id)) if expense.trip_day_id else None
    shares = await _shares_by_expense(session, [expense.id])
    return expense, day, shares.get(expense.id, [])


async def _shares_by_expense(session: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, list[ExpenseShare]]:
    if not ids:
        return {}
    result: dict[uuid.UUID, list[ExpenseShare]] = {}
    for share in (
        await session.execute(
            select(ExpenseShare).where(ExpenseShare.expense_id.in_(ids)).order_by(ExpenseShare.created_at, ExpenseShare.id)
        )
    ).scalars():
        result.setdefault(share.expense_id, []).append(share)
    return result


async def _replace_shares(session: AsyncSession, trip: Trip, expense: Expense, shares: list[dict]) -> None:
    ids = [share["membership_id"] for share in shares]
    if len(ids) != len(set(ids)):
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"shares": "같은 사람이 두 번 들어 있어요."})
    await _check_people(session, trip, "shares", set(ids))
    await session.execute(delete(ExpenseShare).where(ExpenseShare.expense_id == expense.id))
    session.add_all(
        [ExpenseShare(expense_id=expense.id, membership_id=share["membership_id"], weight=share["weight"]) for share in shares]
    )
    await session.flush()


async def create_expense(
    session: AsyncSession, *, trip: Trip, actor: Membership, expense_id: uuid.UUID | None, values: dict
) -> tuple[Expense, bool]:
    if expense_id is not None:
        기존 = await session.get(Expense, expense_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False
    await _check_people(session, trip, "payerMembershipId", {values["payer_membership_id"]})
    expense = Expense(
        id=expense_id or uuid.uuid4(),
        trip_id=trip.id,
        trip_day_id=await _day_id(session, trip, values.get("date")),
        title=values["title"].strip(),
        amount=values["amount"],
        category=values["category"],
        payer_membership_id=values["payer_membership_id"],
        split_mode=values.get("split_mode"),
        memo=_blank(values.get("memo")),
        created_by=actor.user_id,
    )
    session.add(expense)
    await session.flush()
    await _replace_shares(session, trip, expense, values.get("shares") or [])
    return expense, True


async def update_expense(session: AsyncSession, *, trip: Trip, expense: Expense, version: int, changes: dict) -> Expense:
    if version != expense.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    if "date" in changes:
        expense.trip_day_id = await _day_id(session, trip, changes["date"])
    if "title" in changes:
        if not (changes["title"] or "").strip():
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"title": "무엇에 썼는지 적어 주세요."})
        expense.title = changes["title"].strip()
    for 칸 in ("amount", "category", "payer_membership_id"):
        if 칸 in changes and changes[칸] is None:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={칸: "비워 둘 수 없어요."})
    if "payer_membership_id" in changes:
        await _check_people(session, trip, "payerMembershipId", {changes["payer_membership_id"]})
        expense.payer_membership_id = changes["payer_membership_id"]
    for 칸 in ("amount", "category"):
        if 칸 in changes:
            setattr(expense, 칸, changes[칸])
    if "split_mode" in changes:
        expense.split_mode = changes["split_mode"]
    if "memo" in changes:
        expense.memo = _blank(changes["memo"])
    if "shares" in changes:
        await _replace_shares(session, trip, expense, changes["shares"] or [])
    expense.version += 1
    await session.flush()
    return expense


async def remove_expense(session: AsyncSession, expense: Expense) -> None:
    # 몫(expense_shares)은 외래키 CASCADE 로 함께 지워진다.
    await session.delete(expense)
    await session.flush()


# ---------------------------------------------------------------------------
# 주고받은 기록
# ---------------------------------------------------------------------------


async def list_payments(session: AsyncSession, trip: Trip) -> list[Payment]:
    return list(
        (
            await session.execute(
                select(Payment)
                .where(Payment.trip_id == trip.id, Payment.deleted_at.is_(None))
                .order_by(Payment.paid_at.nulls_last(), Payment.created_at)
            )
        ).scalars().all()
    )


async def create_payment(
    session: AsyncSession, *, trip: Trip, actor: Membership, payment_id: uuid.UUID | None, values: dict
) -> tuple[Payment, bool]:
    if payment_id is not None:
        기존 = await session.get(Payment, payment_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False
    보낸, 받은 = values["from_membership_id"], values["to_membership_id"]
    if 보낸 == 받은:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"toMembershipId": "보낸 사람과 받은 사람이 같아요."})
    await _check_people(session, trip, "fromMembershipId", {보낸, 받은})
    payment = Payment(
        id=payment_id or uuid.uuid4(),
        trip_id=trip.id,
        from_membership_id=보낸,
        to_membership_id=받은,
        amount=values["amount"],
        paid_at=values.get("paid_at") or datetime.now(UTC),
        created_by=actor.user_id,
    )
    session.add(payment)
    await session.flush()
    return payment, True


async def undo_payment(session: AsyncSession, payment: Payment, actor: User) -> None:
    """
    기록을 되돌린다. 행은 남기고 `deleted_at`·`deleted_by` 를 채운다.

    되돌린 사실이 정산 다툼의 근거가 된다. 이미 되돌린 기록을 다시 되돌려도 처음
    되돌린 시각과 사람을 지킨다.
    """
    if payment.deleted_at is None:
        payment.deleted_at = datetime.now(UTC)
        payment.deleted_by = actor.id
        await session.flush()


# ---------------------------------------------------------------------------
# 비용 설정
# ---------------------------------------------------------------------------


async def update_settings(session: AsyncSession, *, trip: Trip, version: int, changes: dict) -> Trip:
    if version != trip.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    if "simplify_settlement" in changes and changes["simplify_settlement"] is not None:
        await settlement.set_simplify_settlement(session, trip.id, changes["simplify_settlement"])
        await session.refresh(trip, ["simplify_settlement"])
    if "currency" in changes and changes["currency"] is not None:
        trip.currency_code = changes["currency"]
    if "exchange_rate" in changes:
        trip.exchange_rate = changes["exchange_rate"]
    if "budget" in changes:
        trip.budget = changes["budget"]
    trip.version += 1
    await session.flush()
    return trip
