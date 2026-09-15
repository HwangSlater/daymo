import uuid
from datetime import date as Date
from datetime import datetime

from pydantic import Field

from app.schemas.auth import _Camel


class MemoCreateRequest(_Camel):
    id: uuid.UUID | None = None
    body: str = Field(min_length=1, max_length=2000)


class MemoUpdateRequest(_Camel):
    version: int
    body: str = Field(min_length=1, max_length=2000)


class MemoOut(_Camel):
    """
    `authorName` 은 지금 표시 이름이다. 계정을 지운 사람이면 `탈퇴한 멤버` 다.

    앱은 `authorMembershipId` 로 공간 사람 표에서 이름을 찾고, 없을 때 이 값을 쓴다.
    """

    id: str
    trip_id: str
    body: str
    author_membership_id: str | None
    author_name: str
    created_at: datetime
    edited_at: datetime | None
    version: int


class DiaryCreateRequest(_Camel):
    """`writtenOn` 은 쓴 날이 아니라 그 일기가 다루는 날이다. 비워도 된다."""

    id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=60)
    body: str = Field(min_length=1, max_length=20000)
    written_on: Date | None = None


class DiaryUpdateRequest(_Camel):
    version: int
    title: str | None = Field(default=None, max_length=60)
    body: str | None = Field(default=None, min_length=1, max_length=20000)
    written_on: Date | None = None


class DiaryOut(_Camel):
    id: str
    trip_id: str
    title: str | None
    body: str
    written_on: Date | None
    author_membership_id: str | None
    author_name: str
    created_at: datetime
    version: int
