from datetime import date
from decimal import Decimal

from pydantic import Field

from app.models import RelationshipType, TripStatus
from app.schemas.auth import _Camel


class TripCreateRequest(_Camel):
    title: str = Field(min_length=1, max_length=60)
    start_date: date
    end_date: date
    region_code: str | None = Field(default=None, max_length=20)
    region_name: str | None = Field(default=None, max_length=40)
    summary: str | None = Field(default=None, max_length=2000)
    cooking_enabled: bool = False
    # 생략하면 빈 목록이다. 앱이 그것을 공간 멤버 전원으로 읽는다.
    participant_membership_ids: list[str] = Field(default_factory=list, max_length=10)


class TripUpdateRequest(_Camel):
    """
    고칠 것만 보낸다.

    `version` 을 함께 받는다. 함께 쓰는 공간이라 두 사람이 같은 여행을
    동시에 고칠 수 있고, 마지막에 저장한 쪽이 앞사람의 수정을 조용히
    덮어쓰면 무엇이 사라졌는지 아무도 모른다.

    `None` 과 "안 보냈다" 를 구분해야 해서 지우기는 별도 규칙이 필요하다.
    지금은 보낸 칸만 덮어쓴다.
    """

    version: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=60)
    start_date: date | None = None
    end_date: date | None = None
    region_code: str | None = Field(default=None, max_length=20)
    region_name: str | None = Field(default=None, max_length=40)
    summary: str | None = Field(default=None, max_length=2000)
    cooking_enabled: bool | None = None
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = None
    budget: Decimal | None = None


class ParticipantsRequest(_Camel):
    membership_ids: list[str] = Field(default_factory=list, max_length=10)


class TripOut(_Camel):
    id: str
    space_id: str
    title: str
    region_code: str | None
    region_name: str | None
    start_date: date
    end_date: date
    status: TripStatus
    summary: str | None
    cooking_enabled: bool
    currency_code: str
    exchange_rate: Decimal | None
    budget: Decimal | None
    simplify_settlement: bool
    version: int
    archived_at: str | None = None
    participant_membership_ids: list[str] = Field(default_factory=list)


class SpaceCreateRequest(_Camel):
    name: str = Field(min_length=1, max_length=40)
    relationship_type: RelationshipType = RelationshipType.OTHER
    started_on: date | None = None
    timezone: str = Field(default="Asia/Seoul", max_length=64)


class SpaceUpdateRequest(_Camel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    relationship_type: RelationshipType | None = None
    started_on: date | None = None


class SpaceMemberOut(_Camel):
    id: str
    display_name: str
    role: str
    is_me: bool


class SpaceOut(_Camel):
    id: str
    name: str
    relationship_type: str
    timezone: str
    started_on: date | None = None
    # 내 권한. 앱이 무엇을 보여 줄지 정하는 데 쓴다.
    my_role: str
