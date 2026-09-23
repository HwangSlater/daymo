import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_trip, membership_for_trip_row, require
from app.api.v1.trips import 여행_응답
from app.core.responses import Envelope, Page, ok, page
from app.models import Expense, Payment
from app.schemas.expense import (
    ExpenseCreateRequest,
    ExpenseOut,
    ExpenseSettingsRequest,
    ExpenseUpdateRequest,
    PaymentCreateRequest,
    PaymentOut,
    ShareOut,
)
from app.schemas.trip import TripOut
from app.services import audit
from app.services import expenses as expense_service

router = APIRouter(tags=["expenses"])


def _지출_응답(view) -> dict:
    expense, day, shares = view
    return ExpenseOut(
        id=str(expense.id),
        trip_id=str(expense.trip_id),
        date=day,
        title=expense.title,
        amount=float(expense.amount),
        category=expense.category,
        payer_membership_id=str(expense.payer_membership_id),
        split_mode=expense.split_mode,
        shares=[ShareOut(membership_id=str(share.membership_id), weight=float(share.weight)) for share in shares],
        memo=expense.memo,
        receipt_photo_id=str(expense.receipt_photo_id) if expense.receipt_photo_id else None,
        excluded=expense.excluded,
        transport_id=str(expense.transport_id) if expense.transport_id else None,
        version=expense.version,
    ).model_dump(by_alias=True, mode="json")


def _기록_응답(payment: Payment) -> dict:
    return PaymentOut(
        id=str(payment.id),
        trip_id=str(payment.trip_id),
        from_membership_id=str(payment.from_membership_id),
        to_membership_id=str(payment.to_membership_id),
        amount=float(payment.amount),
        paid_at=payment.paid_at,
    ).model_dump(by_alias=True, mode="json")


# ---------------------------------------------------------------------------
# 지출
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/expenses", response_model=Page[ExpenseOut])
async def list_expenses(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([_지출_응답(view) for view in await expense_service.list_expenses(db, trip)])


@router.post("/trips/{trip_id}/expenses", status_code=status.HTTP_201_CREATED, response_model=Envelope[ExpenseOut])
async def create_expense(
    trip_id: uuid.UUID, body: ExpenseCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    expense, 만들었다 = await expense_service.create_expense(
        db, trip=trip, actor=membership, expense_id=body.id, values=body.model_dump(exclude={"id"})
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_지출_응답(await expense_service.expense_view(db, expense)))


@router.patch("/expenses/{expense_id}", response_model=Envelope[ExpenseOut])
async def update_expense(expense_id: uuid.UUID, body: ExpenseUpdateRequest, caller: CurrentCaller, db: DbSession) -> dict:
    membership, trip, expense = await membership_for_trip_row(db, user_id=caller.user.id, model=Expense, row_id=expense_id)
    require(membership, *WRITERS)
    await expense_service.update_expense(
        db, trip=trip, expense=expense, version=body.version, changes=body.model_dump(exclude_unset=True, exclude={"version"})
    )
    return ok(_지출_응답(await expense_service.expense_view(db, expense)))


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(expense_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    membership, _, expense = await membership_for_trip_row(db, user_id=caller.user.id, model=Expense, row_id=expense_id)
    require(membership, *WRITERS)
    await expense_service.remove_expense(db, expense)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# 주고받은 기록
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/payments", response_model=Page[PaymentOut])
async def list_payments(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    """되돌리지 않은 기록만 준다."""
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([_기록_응답(payment) for payment in await expense_service.list_payments(db, trip)])


@router.post("/trips/{trip_id}/payments", status_code=status.HTTP_201_CREATED, response_model=Envelope[PaymentOut])
async def create_payment(
    trip_id: uuid.UUID, body: PaymentCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    payment, 만들었다 = await expense_service.create_payment(
        db, trip=trip, actor=membership, payment_id=body.id, values=body.model_dump(exclude={"id"})
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_기록_응답(payment))


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def undo_payment(payment_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """기록을 되돌린다. 행은 남는다."""
    membership, trip, payment = await membership_for_trip_row(db, user_id=caller.user.id, model=Payment, row_id=payment_id)
    require(membership, *WRITERS)
    if payment.deleted_at is None:  # 이미 되돌린 기록을 다시 보내면 적지 않는다.
        await audit.record(db, space_id=trip.space_id, actor_membership_id=membership.id, action="payment.undo", target_type="payment", target_id=payment.id, summary_fields={"tripId": str(trip.id)})
    await expense_service.undo_payment(db, payment, caller.user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# 비용 설정
# ---------------------------------------------------------------------------


@router.patch("/trips/{trip_id}/expense-settings", response_model=Envelope[TripOut])
async def update_expense_settings(
    trip_id: uuid.UUID, body: ExpenseSettingsRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    """통화·환율·예산·정산 묶기. 여행 응답을 그대로 돌려준다."""
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    await expense_service.update_settings(
        db, trip=trip, version=body.version, changes=body.model_dump(exclude_unset=True, exclude={"version"})
    )
    return ok(await 여행_응답(db, trip))
