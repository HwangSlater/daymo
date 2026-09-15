import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedByMixin, TimestampMixin, uuid_pk
from app.models.enums import ExpenseCategory, SplitMode, enum_column

# 금액은 여행 통화(`trips.currency_code`) 기준으로 저장한다. 원 환산은
# 보여줄 때만 하고, 환율은 서버가 외부에서 가져오지 않는다.
#
# Numeric 인 이유는 나눈 금액에 소수가 생기기 때문이다. 계산은 소수로 끝까지
# 하고 주고받을 금액만 반올림한다. 정수로 저장하면 여기서 이미 깎인다.


class Expense(Base, TimestampMixin, CreatedByMixin):
    """
    쓴 돈 한 건.

    낸 사람과 몫을 지는 사람을 따로 둔다. 대개는 한 사람이 내고 참가자끼리
    나누지만, 혼자 산 기념품처럼 둘이 어긋나는 지출이 늘 있다. 하나로 합치면
    그런 지출이 정산에서 틀어진다.

    `receipt_photo_id` 는 사진 업로드 절차를 그대로 쓰고 연결만 해 둔다.
    기록 탭의 여행 사진 목록에는 넣지 않는다. 영수증은 추억이 아니다.
    """

    __tablename__ = "expenses"
    __table_args__ = (
        # 0원 지출은 적을 이유가 없다. 환불과 할인은 아직 모델에 없고,
        # 필요해지면 음수를 허용하는 대신 별도 종류로 두는 쪽을 먼저 본다.
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_expenses_trip", "trip_id"),
        Index("ix_expenses_trip_day", "trip_day_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    # 날을 지워도 지출은 남는다. 얼마를 썼는지는 어느 날이었는지와 무관하게
    # 합계에 들어가야 한다.
    trip_day_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trip_days.id", ondelete="SET NULL"), nullable=True
    )

    title: Mapped[str] = mapped_column(String(60), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    category: Mapped[ExpenseCategory] = mapped_column(
        enum_column(ExpenseCategory), nullable=False, default=ExpenseCategory.OTHER
    )

    # 낸 사람은 참가자가 아니어도 된다. 참가자에서 빠진 사람이 낸 지출도
    # 합계와 잔액에 그대로 남는다는 것이 문서의 규칙이다.
    payer_membership_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=False
    )

    # 값이 없을 수 있다. 그때는 shares 모양에서 짐작한다.
    split_mode: Mapped[SplitMode | None] = mapped_column(enum_column(SplitMode), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    receipt_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("photos.id", ondelete="SET NULL"), nullable=True
    )
    # 고칠 때마다 올린다. 두 사람이 같은 지출을 동시에 고치면 409.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Expense {self.id}>"


class ExpenseShare(Base, TimestampMixin):
    """
    이 지출을 누가 얼마만큼 지는지.

    **없는 것이 기본이다.** 줄이 하나도 없으면 그 여행의 참가자 전원이
    똑같이 나눈 것으로 본다. 가장 흔한 경우를 비워 두면 사람이 늘거나 줄어도
    고칠 것이 없다.

    `weight` 는 비율이 아니라 비중이다. 합이 얼마든 상관없고 각자의 몫은
    `금액 x 내 비중 / 비중 합` 이다. `금액 직접` 으로 고른 경우에도 적은
    금액을 그대로 비중에 넣으면 결과가 같아서 칼럼을 따로 두지 않는다.

    0 을 허용하는 이유는 앱이 "이 사람은 빼기" 를 0 으로 보내올 수 있어서다.
    남은 값이 모두 0 이하면 전원 균등으로 돌아간다.
    """

    __tablename__ = "expense_shares"
    __table_args__ = (
        CheckConstraint("weight >= 0", name="weight_not_negative"),
        Index("uq_expense_shares_member", "expense_id", "membership_id", unique=True),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    expense_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False
    )
    membership_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=False
    )
    weight: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<ExpenseShare {self.id}>"


class Payment(Base, TimestampMixin, CreatedByMixin):
    """
    주고받았다고 적어 두는 기록.

    **실제 송금이 아니다.** 앱도 서버도 계좌이체를 알 수 없다. 이 기록이
    없으면 목록이 줄지 않아서, 지출을 적을수록 끝나지 않는 할 일만 쌓인다.

    일부만 보냈다고 적는 부분 정산이 가능하다. 잘못 적었으면 `deleted_at` 을
    채워 되돌린다. 행을 지우지 않는 이유는 되돌린 사실 자체가 정산 분쟁에서
    근거가 되기 때문이다.

    잔액은 `낸 돈 - 내야 할 돈 + 보낸 돈 - 받은 돈` 이다. 정산 결과는 따로
    저장하지 않는다. 지출·참가자·이 기록만 있으면 언제든 다시 낼 수 있다.
    """

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        # 자기 자신에게 보냈다고 적으면 잔액이 그대로인데 목록만 줄어든다.
        CheckConstraint("from_membership_id <> to_membership_id", name="from_is_not_to"),
        # 살아 있는 기록만 세는 질의가 기본이다.
        Index("ix_payments_trip_alive", "trip_id", "deleted_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    from_membership_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=False
    )
    to_membership_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 누가 되돌렸는지. 정산 다툼에서 되돌린 사실만큼 누가 되돌렸는지가 중요하다.
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Payment {self.id}>"
