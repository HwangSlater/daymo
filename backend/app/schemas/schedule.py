import uuid
from datetime import date as Date

from pydantic import Field

from app.models import ScheduleItemType
from app.schemas.auth import _Camel

# 시각은 공간 시간대의 "그 날 몇 시" 로 주고받는다. 앱은 날짜와 시:분을 따로
# 고르고, 서버는 timestamptz 로 저장한다(app/models/schedule.py). 옮기는 일은
# 서버가 공간 시간대로 한다. 앱마다 시간대 계산을 하게 두면 기기 시간대가 다른
# 멤버끼리 일정이 한 시간씩 어긋난다.
_HH_MM = r"^([01]\d|2[0-3]):[0-5]\d$"
_LOCAL_DATETIME = r"^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$"


class ScheduleItemCreateRequest(_Camel):
    """`id` 는 앱이 만든 UUID. 같은 id 로 다시 보내면 하나만 생긴다."""

    id: uuid.UUID | None = None
    date: Date | None = None
    time: str | None = Field(default=None, pattern=_HH_MM)
    title: str = Field(min_length=1, max_length=60)
    type: ScheduleItemType = ScheduleItemType.OTHER
    note: str | None = Field(default=None, max_length=2000)
    trip_place_id: uuid.UUID | None = None
    map_url: str | None = Field(default=None, max_length=2048)


class ScheduleItemUpdateRequest(_Camel):
    version: int
    date: Date | None = None
    time: str | None = Field(default=None, pattern=_HH_MM)
    title: str | None = Field(default=None, min_length=1, max_length=60)
    type: ScheduleItemType | None = None
    note: str | None = Field(default=None, max_length=2000)
    trip_place_id: uuid.UUID | None = None
    map_url: str | None = Field(default=None, max_length=2048)


class ScheduleItemOut(_Camel):
    id: str
    trip_id: str
    date: Date | None
    time: str | None
    title: str
    type: ScheduleItemType
    note: str | None
    trip_place_id: str | None
    map_url: str | None
    version: int


class StayCreateRequest(_Camel):
    """
    숙소 하나. 이름과 주소는 연결한 여행 장소의 것이다.

    `checkInAt`·`checkOutAt` 은 공간 시간대의 `YYYY-MM-DDTHH:MM` 이다.
    """

    id: uuid.UUID | None = None
    trip_place_id: uuid.UUID | None = None
    check_in_at: str | None = Field(default=None, pattern=_LOCAL_DATETIME)
    check_out_at: str | None = Field(default=None, pattern=_LOCAL_DATETIME)
    note: str | None = Field(default=None, max_length=2000)
    show_in_schedule: bool = True


class StayUpdateRequest(_Camel):
    version: int
    trip_place_id: uuid.UUID | None = None
    check_in_at: str | None = Field(default=None, pattern=_LOCAL_DATETIME)
    check_out_at: str | None = Field(default=None, pattern=_LOCAL_DATETIME)
    note: str | None = Field(default=None, max_length=2000)
    show_in_schedule: bool | None = None


class StayOut(_Camel):
    id: str
    trip_id: str
    trip_place_id: str | None
    check_in_at: str | None
    check_out_at: str | None
    note: str | None
    show_in_schedule: bool
    version: int
