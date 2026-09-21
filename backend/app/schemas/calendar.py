import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import Field, StringConstraints

from app.models import CalendarNoteKind
from app.schemas.auth import _Camel

# 그날의 시:분. 일정 시각과 같은 모양이다(app/schemas/schedule.py).
_HH_MM = r"^([01]\d|2[0-3]):[0-5]\d$"

# 앞뒤 공백을 빼고 센다. 공백만 적은 제목은 빈 제목이다.
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class CalendarNoteCreateRequest(_Camel):
    """
    `id` 는 앱이 만들어 보낸다. 같은 요청이 두 번 닿아도 하나만 생긴다.

    메모(`memo`)에 `membershipId` 를 보내면 버린다. 일정(`schedule`)은 그 공간
    멤버여야 한다.
    """

    id: uuid.UUID | None = None
    kind: CalendarNoteKind
    membership_id: uuid.UUID | None = None
    title: Title
    start_date: date
    end_date: date
    time: str | None = Field(default=None, pattern=_HH_MM)


class CalendarNoteUpdateRequest(_Camel):
    """고칠 것만 보낸다. `time` 에 null 을 보내면 하루 종일로 바뀐다."""

    version: int
    kind: CalendarNoteKind | None = None
    membership_id: uuid.UUID | None = None
    title: Title | None = None
    start_date: date | None = None
    end_date: date | None = None
    time: str | None = Field(default=None, pattern=_HH_MM)


class CalendarNoteOut(_Camel):
    id: str
    space_id: str
    kind: CalendarNoteKind
    membership_id: str | None
    title: str
    start_date: date
    end_date: date
    time: str | None
    created_by_membership_id: str | None
    version: int
    created_at: datetime
