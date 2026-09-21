import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import Field, field_validator

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
# 뒤의 넷은 사진관에서 뽑는 네컷 프레임이다. 비율 대신 프레임이 크기를 정한다.
# 맨 앞의 `없음` 은 종이를 끼우지 않고 사진만 쓰는 것이다. 스티커와 글자만 얹고
# 싶은 사람에게 필름도 엽서도 거추장스러운 테두리라, 아무것도 안 고를 길을 둔다.
KeepsakeStyle = Literal["없음", "필름", "엽서", "스크랩북", "네컷", "네컷 격자", "네컷 가로", "세컷"]
KeepsakeRatio = Literal["세로", "정사각", "가로"]
# 카드에 넣을 줄. 끄면 그 줄이 안 나온다.
KeepsakePart = Literal["이름", "기간", "지역", "사람", "문구", "통계"]
# 통계 줄에 넣을 숫자. `지출` 은 남에게 보여 주는 그림이라 앱이 기본으로 끈다.
KeepsakeStat = Literal["장소", "사진", "날", "지출"]
# 네컷 틀의 테두리 색. 앞의 셋은 사진관 색이고 뒤의 셋은 앱에서 쓰는 색이다.
KeepsakeFrameColor = Literal["검정", "흰색", "크림", "노을", "바다", "숲"]
# 카드에 붙이는 작은 그림.
KeepsakeSticker = Literal[
    "하트", "별", "비행기", "필름", "말풍선", "체크", "꽃", "구름", "반짝"
]
# 카드에 얹는 것. 스티커 이름이거나 글자다.
KeepsakeDecorKind = Literal[
    "하트", "별", "비행기", "필름", "말풍선", "체크", "꽃", "구름", "반짝", "글자"
]


class KeepsakeDecorIn(_Camel):
    """
    카드 위에 손으로 얹은 것 하나.

    자리와 크기는 픽셀이 아니라 **카드 크기에 대한 비율(0~1)** 이다. 같은 카드를
    폰에서 보든 웹에서 보든 내보낸 그림에서든 같은 자리에 찍혀야 해서다. 서버는
    이 값으로 아무것도 계산하지 않고 그대로 돌려준다.
    """

    # 앱이 만드는 이름(`d1`). 한 카드 안에서만 쓴다.
    id: str = Field(default="d1", min_length=1, max_length=20)
    kind: KeepsakeDecorKind = "하트"
    # 글자일 때만 채운다.
    text: str | None = Field(default=None, max_length=24)
    # 가운데 자리. 카드 너비·높이에 대한 비율이다.
    x: float = Field(default=0.5, ge=0, le=1)
    y: float = Field(default=0.5, ge=0, le=1)
    # 카드의 짧은 변에 대한 크기. 비율이 달라도 같은 크기로 보인다.
    size: float = Field(default=0.16, ge=0.01, le=1)
    angle: float = Field(default=0, ge=-180, le=180)
    # 겹침 순서. 클수록 위에 있다.
    z: int = Field(default=0, ge=0, le=99)


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
    # 옛 앱이 보내던 정해진 자리 스티커 목록. 새 앱은 늘 빈 목록을 보내고 대신
    # `decor` 를 채운다. 옛 앱이 아직 이 칸으로 보낼 수 있어 받기만 한다.
    stickers: list[KeepsakeSticker] = Field(default_factory=list, max_length=9)
    # 손으로 얹은 스티커와 글자. 어느 스타일에서든 그려진다.
    decor: list[KeepsakeDecorIn] = Field(default_factory=list, max_length=30)
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

    `version` 이 필수다. 함께 쓰는 공간이라 두 사람이 같은 여행을 동시에
    고칠 수 있고, 마지막에 저장한 쪽이 앞사람의 수정을 조용히 덮어쓰면
    무엇이 사라졌는지 아무도 모른다. 선택으로 두면 안 보내는 것만으로
    검사를 건너뛸 수 있어, 장소·일정·지출·사진·카드와 같이 필수로 받는다.

    `None` 과 "안 보냈다" 를 구분해야 해서 지우기는 별도 규칙이 필요하다.
    지금은 보낸 칸만 덮어쓴다.
    """

    version: int
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
    # 홈 화면의 여행 카드에 깔 사진. 그 여행의 사진이어야 하고, null 이면 해제다.
    cover_photo_id: str | None = None
    # 홈 화면의 여행 카드에 통째로 깔 기념 카드. 그 여행의 카드여야 하고, null 이면 해제다.
    # 사진 한 장과 함께 보낼 수는 없다. 홈 카드는 여행마다 하나다.
    cover_card_id: str | None = None
    # 대표 사진의 어디를 홈 카드 틀(가로로 긴 1.62:1)에 보여 줄지.
    # `coverFocusX`·`coverFocusY` 는 사진에서 틀 한가운데에 놓을 점의 비율
    # 좌표고(왼쪽 위가 0,0), `coverZoom` 은 틀을 꽉 채우는 최소 크기를 1 로 본
    # 확대 배수다. 0.5/0.5/1.0 이 가운데를 그대로 자른 모습이다.
    #
    # 대표 사진이나 카드를 다른 것으로 바꾸면서 이 셋을 하나도 안 보내면
    # 서버가 기본값으로 되돌린다. 앞 사진에 맞춰 둔 자리를 새 사진에 그대로
    # 쓰면 엉뚱한 데가 보인다.
    cover_focus_x: float | None = Field(default=None, ge=0, le=1)
    cover_focus_y: float | None = Field(default=None, ge=0, le=1)
    cover_zoom: float | None = Field(default=None, ge=1, le=4)

    @field_validator("cover_focus_x", "cover_focus_y", "cover_zoom")
    @classmethod
    def _넷째_자리까지(cls, 값: float | None) -> float | None:
        # 손가락으로 맞춘 자리라 그보다 잘게 들고 있을 까닭이 없다.
        return None if 값 is None else round(값, 4)


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
    cover_card_id: str | None = None
    # 홈 화면의 여행 카드에 그릴 사진들. 카드를 골랐으면 그 카드의 사진이 고른
    # 차례대로, 사진 한 장을 골랐으면 그 한 장, 아무것도 고르지 않았으면 비어 있다.
    cover_photo_ids: list[str] = Field(default_factory=list)
    # 그 카드의 틀 이름. 사진을 어떻게 놓을지 앱이 이 값으로 정한다(카드 그림은 기기가 그린다).
    cover_card_style: str | None = None
    # 대표 사진에서 홈 카드 틀 한가운데에 놓을 점의 비율 좌표(왼쪽 위가 0,0)와,
    # 틀을 꽉 채우는 최소 크기를 1 로 본 확대 배수. 맞춘 적이 없으면
    # 0.5/0.5/1.0 이고 그것이 가운데를 그대로 자른 모습이다.
    cover_focus_x: float = 0.5
    cover_focus_y: float = 0.5
    cover_zoom: float = 1.0
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
