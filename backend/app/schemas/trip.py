import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

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


# 기념 카드에서 고를 수 있는 것. 값은 앱 화면에 보이는 말 그대로다. 한국어만 쓰는
# 앱이고, 영어 코드를 따로 두면 화면과 저장된 값을 견주어 볼 때 표를 한 번 더 거쳐야 한다.
#
# 뒤의 넷은 사진관에서 뽑는 네컷 틀이다. 비율 대신 틀이 크기를 정한다.
KeepsakeStyle = Literal["필름", "엽서", "스크랩북", "네컷", "네컷 격자", "네컷 가로", "세컷"]
KeepsakeRatio = Literal["세로", "정사각", "가로"]
# 카드에 넣을 줄. 끄면 그 줄이 안 나온다.
KeepsakePart = Literal["이름", "기간", "지역", "사람", "문구", "통계"]
# 통계 줄에 넣을 숫자. `지출` 은 남에게 보여 주는 그림이라 앱이 기본으로 끈다.
KeepsakeStat = Literal["장소", "사진", "날", "지출"]
# 네컷 틀의 테두리 색. 앞의 셋은 사진관 색이고 뒤의 셋은 앱에서 쓰는 색이다.
KeepsakeFrameColor = Literal["검정", "흰색", "크림", "노을", "바다", "숲"]
# 사진 모서리에 붙이는 작은 그림. 자리는 앱이 미리 정해 둔다.
KeepsakeSticker = Literal["하트", "별", "비행기", "필름", "말풍선", "체크"]


class KeepsakeCardIn(_Camel):
    """
    기념 카드를 어떻게 꾸몄는지.

    서버는 이 값으로 아무것도 계산하지 않고 그대로 돌려준다. 카드 그림은 기기가
    그린다. `photoIds` 만 그 여행의 사진인지 따로 본다.
    """

    style: KeepsakeStyle = "필름"
    ratio: KeepsakeRatio = "세로"
    # 고른 차례가 카드에 놓이는 차례다. 비어 있으면 앱이 가장 최근 사진을 쓴다.
    photo_ids: list[str] = Field(default_factory=list, max_length=4)
    title: str | None = Field(default=None, max_length=60)
    caption: str | None = Field(default=None, max_length=200)
    parts: list[KeepsakePart] = Field(default_factory=list, max_length=6)
    stats: list[KeepsakeStat] = Field(default_factory=list, max_length=4)
    # 아래 넷은 네컷 틀에서만 그려진다. 다른 스타일에서는 저장만 된다.
    frame_color: KeepsakeFrameColor = "검정"
    stickers: list[KeepsakeSticker] = Field(default_factory=list, max_length=6)
    # 필름 카메라가 찍어 주던 날짜 도장(`2026.09.15`).
    date_stamp: bool = False
    # 사진에 적어 둔 짧은 설명을 칸 아래에 넣을지.
    photo_captions: bool = False


class TripCardCreateRequest(_Camel):
    """
    새 기념 카드 한 장.

    `id` 는 앱이 만들어 보낸다. 같은 요청이 두 번 닿아도 카드가 두 장이 되지 않는다
    (메모·일기와 같은 규칙이다).
    """

    id: uuid.UUID | None = None
    settings: KeepsakeCardIn = Field(default_factory=KeepsakeCardIn)


class TripCardUpdateRequest(_Camel):
    """꾸민 값을 통째로 바꾼다. 카드는 칸이 하나뿐이라 부분 수정이 없다."""

    version: int
    settings: KeepsakeCardIn


class TripCardOut(_Camel):
    """
    `canManage` 는 이 카드를 고치고 지울 수 있는지다. 사진과 같은 규칙으로
    만든 사람과 owner 만 참이다.
    """

    id: str
    trip_id: str
    settings: dict
    sort_order: int
    created_by_membership_id: str | None = None
    can_manage: bool = False
    created_at: datetime
    version: int


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
    # 홈의 여행 카드 바탕으로 쓸 사진. 그 여행의 사진이어야 하고, null 이면 해제다.
    cover_photo_id: str | None = None


class ParticipantsRequest(_Camel):
    """
    참가자 목록을 통째로 바꾼다.

    `version` 이 필수다. 두 사람이 동시에 참가자를 고치면 나중에 저장한 쪽이
    앞사람이 넣은 사람을 조용히 빼 버린다. 참가자는 지출의 몫과 준비물 담당이
    걸려 있어서 사라지면 정산이 틀어진다.
    """

    version: int
    membership_ids: list[str] = Field(default_factory=list, max_length=10)


class TripOverviewStayOut(_Camel):
    # 연결한 장소가 없으면 비어 있다.
    name: str | None
    # 공간 시간대의 `YYYY-MM-DDTHH:MM`. 숙소 API 와 같은 모양이다.
    check_in_at: str | None


class TripOverviewOut(_Camel):
    """
    홈의 여행 카드가 보여 주는 요약. 상세 화면을 열지 않아도 숫자가 맞게 나온다.

    `scheduleCount` 는 일정 탭의 줄 수다. 직접 적은 일정에 더해 "일정에 표시" 를 켠
    교통편·예약·대표 숙소의 줄도 센다. `spentTotal` 은 여행 통화 기준 지출 합이다.
    """

    stay: TripOverviewStayOut | None = None
    schedule_count: int = 0
    place_count: int = 0
    restaurant_count: int = 0
    cafe_count: int = 0
    packing_total: int = 0
    packing_done: int = 0
    spent_total: float = 0


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
    cover_photo_id: str | None = None
    version: int
    archived_at: str | None = None
    # 지운 여행일 때만 있다. 이 시각이 지나면 되돌릴 수 없다.
    deletion_scheduled_at: str | None = None
    participant_membership_ids: list[str] = Field(default_factory=list)
    overview: TripOverviewOut | None = None


class SpaceCreateRequest(_Camel):
    name: str = Field(min_length=1, max_length=40)
    relationship_type: RelationshipType = RelationshipType.OTHER
    started_on: date | None = None
    timezone: str = Field(default="Asia/Seoul", max_length=64)


class SpaceDeleteRequest(_Camel):
    """공간 이름을 정확히 다시 적고, 지워지는 범위를 확인했다는 표시를 보낸다."""

    confirmation_name: str = Field(min_length=1, max_length=40)
    impact_acknowledged: bool = False


class DeletedSpaceOut(_Camel):
    id: str
    name: str
    deletion_scheduled_at: str


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
