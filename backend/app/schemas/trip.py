from datetime import date, datetime
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
    """
    참가자 목록을 통째로 바꾼다.

    `version` 이 필수다. 두 사람이 동시에 참가자를 고치면 나중에 저장한 쪽이
    앞사람이 넣은 사람을 조용히 빼 버린다. 참가자는 지출의 몫과 준비물 담당이
    걸려 있어서 사라지면 정산이 틀어진다.
    """

    version: int
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
    # 지운 여행일 때만 있다. 이 시각이 지나면 되돌릴 수 없다.
    deletion_scheduled_at: str | None = None
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
    # 나간 멤버일 때만 채워진다. `includeLeft` 로 물었을 때만 나온다.
    left_at: datetime | None = None


class SpaceOut(_Camel):
    id: str
    name: str
    relationship_type: str
    timezone: str
    started_on: date | None = None
    # 내 권한. 앱이 무엇을 보여 줄지 정하는 데 쓴다.
    my_role: str
