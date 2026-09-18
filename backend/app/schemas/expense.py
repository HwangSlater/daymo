import uuid
from datetime import date as Date
from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models import ExpenseCategory, SplitMode
from app.schemas.auth import _Camel

# 금액은 여행 통화 기준이고 소수 둘째 자리까지다(달러·유로의 센트).
_AMOUNT = dict(gt=0, le=Decimal("999999999999.99"), decimal_places=2)


class ShareIn(_Camel):
    membership_id: uuid.UUID
    weight: Decimal = Field(ge=0, le=Decimal("9999999999"), decimal_places=4)


class ExpenseCreateRequest(_Camel):
    """
    지출 한 건. `shares` 가 비면 참가자 전원이 똑같이 나눈 것으로 본다.

    `id` 는 앱이 만든 UUID. 같은 id 로 다시 보내면 하나만 생긴다.
    """

    id: uuid.UUID | None = None
    date: Date | None = None
    title: str = Field(min_length=1, max_length=60)
    amount: Decimal = Field(**_AMOUNT)
    category: ExpenseCategory = ExpenseCategory.OTHER
    payer_membership_id: uuid.UUID
    split_mode: SplitMode | None = None
    shares: list[ShareIn] = Field(default_factory=list, max_length=50)
    memo: str | None = Field(default=None, max_length=2000)
    # 같은 여행에 올린 사진. 영수증 사진을 먼저 만들고(`POST /trips/{id}/photos`) 그 id 를 넣는다.
    receipt_photo_id: uuid.UUID | None = None
    # 정산과 합계에서 뺀 지출. 목록에는 남는다.
    excluded: bool = False
    # 교통편에서 만든 지출이면 그 교통편의 id. 서버는 확인하지 않고 그대로 돌려준다.
    transport_id: uuid.UUID | None = None


class ExpenseUpdateRequest(_Camel):
    version: int
    date: Date | None = None
    title: str | None = Field(default=None, min_length=1, max_length=60)
    amount: Decimal | None = Field(default=None, **_AMOUNT)
    category: ExpenseCategory | None = None
    payer_membership_id: uuid.UUID | None = None
    split_mode: SplitMode | None = None
    shares: list[ShareIn] | None = Field(default=None, max_length=50)
    memo: str | None = Field(default=None, max_length=2000)
    receipt_photo_id: uuid.UUID | None = None
    excluded: bool | None = None
    transport_id: uuid.UUID | None = None


class ShareOut(_Camel):
    membership_id: str
    weight: float


class ExpenseOut(_Camel):
    id: str
    trip_id: str
    date: Date | None
    title: str
    # 앱이 숫자로 바로 쓰게 문자열이 아닌 수로 준다. 소수 둘째 자리까지라 어긋나지 않는다.
    amount: float
    category: ExpenseCategory
    payer_membership_id: str
    split_mode: SplitMode | None
    shares: list[ShareOut]
    memo: str | None
    receipt_photo_id: str | None
    excluded: bool
    transport_id: str | None
    version: int


class PaymentCreateRequest(_Camel):
    """주고받았다고 적는 기록. 실제 송금이 아니다."""

    id: uuid.UUID | None = None
    from_membership_id: uuid.UUID
    to_membership_id: uuid.UUID
    amount: Decimal = Field(**_AMOUNT)
    paid_at: datetime | None = None


class PaymentOut(_Camel):
    id: str
    trip_id: str
    from_membership_id: str
    to_membership_id: str
    amount: float
    paid_at: datetime | None
    version: int = 1


class ExpenseSettingsRequest(_Camel):
    """여행 통화·환율·예산과 정산 묶기. 여행의 `version` 을 함께 받는다."""

    version: int
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    exchange_rate: Decimal | None = Field(default=None, gt=0, le=Decimal("999999999"))
    budget: Decimal | None = Field(default=None, ge=0, le=Decimal("999999999999.99"))
    simplify_settlement: bool | None = None
