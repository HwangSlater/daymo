import uuid

from pydantic import Field

from app.models import TripPlaceStatus
from app.schemas.auth import _Camel


class TripPlaceCreateRequest(_Camel):
    """
    여행에 장소 하나를 담는다.

    `id` 는 앱이 만든 UUID 다(docs/development/07-local-first-and-sync.md). 같은
    요청이 두 번 와도 장소가 둘 생기지 않는다. 앱이 이 id 로 일정·숙소를 먼저
    이어 둘 수 있어서, 서버 응답을 기다렸다가 id 를 갈아 끼울 필요도 없다.
    """

    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=100)
    area: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=300)
    category: str | None = Field(default=None, max_length=30)
    status: TripPlaceStatus = TripPlaceStatus.SAVED
    memo: str | None = Field(default=None, max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=20)
    map_url: str | None = Field(default=None, max_length=2048)


class TripPlaceUpdateRequest(_Camel):
    """보낸 칸만 바꾼다. `version` 이 어긋나면 409 다."""

    version: int
    name: str | None = Field(default=None, min_length=1, max_length=100)
    area: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=300)
    category: str | None = Field(default=None, max_length=30)
    status: TripPlaceStatus | None = None
    memo: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = Field(default=None, max_length=20)
    map_url: str | None = Field(default=None, max_length=2048)


class TripPlaceOut(_Camel):
    id: str
    trip_id: str
    name: str
    area: str | None
    address: str | None
    category: str | None
    status: TripPlaceStatus
    memo: str | None
    tags: list[str]
    map_url: str | None
    version: int
