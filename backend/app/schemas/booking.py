import uuid
from datetime import date as Date

from pydantic import Field

from app.models import BookingStatus, ReservationStatus, TransportDirection, TransportMethod
from app.schemas.auth import _Camel
from app.schemas.schedule import _HH_MM


class TransportCreateRequest(_Camel):
    """가는 편·오는 편. 날짜와 시각은 공간 시간대의 `YYYY-MM-DD`·`HH:MM` 이다."""

    id: uuid.UUID | None = None
    direction: TransportDirection
    method: TransportMethod = TransportMethod.OTHER
    date: Date | None = None
    departure_name: str | None = Field(default=None, max_length=40)
    departure_time: str | None = Field(default=None, pattern=_HH_MM)
    arrival_name: str | None = Field(default=None, max_length=40)
    arrival_time: str | None = Field(default=None, pattern=_HH_MM)
    owner_membership_id: uuid.UUID | None = None
    booking_status: BookingStatus = BookingStatus.NOT_BOOKED
    note: str | None = Field(default=None, max_length=2000)
    show_in_schedule: bool = False


class TransportUpdateRequest(_Camel):
    version: int
    direction: TransportDirection | None = None
    method: TransportMethod | None = None
    date: Date | None = None
    departure_name: str | None = Field(default=None, max_length=40)
    departure_time: str | None = Field(default=None, pattern=_HH_MM)
    arrival_name: str | None = Field(default=None, max_length=40)
    arrival_time: str | None = Field(default=None, pattern=_HH_MM)
    owner_membership_id: uuid.UUID | None = None
    booking_status: BookingStatus | None = None
    note: str | None = Field(default=None, max_length=2000)
    show_in_schedule: bool | None = None


class TransportOut(_Camel):
    id: str
    trip_id: str
    direction: TransportDirection
    method: TransportMethod
    date: Date | None
    departure_name: str | None
    departure_time: str | None
    arrival_name: str | None
    arrival_time: str | None
    owner_membership_id: str | None
    booking_status: BookingStatus
    note: str | None
    show_in_schedule: bool
    version: int


class ReservationCreateRequest(_Camel):
    """
    예약 하나.

    `partyLabel` 은 사람이 적은 인원 글자(`2명 + 아이`) 그대로다. 숫자로 셀 수
    있으면 `partySize` 에도 넣는다. 숫자만 남기면 적은 말이 잘린다.
    """

    id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=60)
    date: Date | None = None
    time: str | None = Field(default=None, pattern=_HH_MM)
    party_size: int | None = Field(default=None, gt=0, le=1000)
    party_label: str | None = Field(default=None, max_length=20)
    status: ReservationStatus = ReservationStatus.NEEDS_CHECK
    note: str | None = Field(default=None, max_length=2000)
    booking_url: str | None = Field(default=None, max_length=2048)
    show_in_schedule: bool = False


class ReservationUpdateRequest(_Camel):
    version: int
    title: str | None = Field(default=None, min_length=1, max_length=60)
    date: Date | None = None
    time: str | None = Field(default=None, pattern=_HH_MM)
    party_size: int | None = Field(default=None, gt=0, le=1000)
    party_label: str | None = Field(default=None, max_length=20)
    status: ReservationStatus | None = None
    note: str | None = Field(default=None, max_length=2000)
    booking_url: str | None = Field(default=None, max_length=2048)
    show_in_schedule: bool | None = None


class ReservationOut(_Camel):
    id: str
    trip_id: str
    title: str
    date: Date | None
    time: str | None
    party_size: int | None
    party_label: str | None
    status: ReservationStatus
    note: str | None
    booking_url: str | None
    show_in_schedule: bool
    version: int
