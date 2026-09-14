from enum import StrEnum

from sqlalchemy import Enum as SAEnum

# PostgreSQL 고유 enum 타입을 쓰지 않고 VARCHAR + CHECK 로 저장한다
# (SQLAlchemy 의 native_enum=False). 값을 하나 더하는 것이 PostgreSQL enum
# 에서는 타입 변경이라 migration 이 무겁고 되돌리기 까다롭다. 여기 값은
# 앞으로 늘어날 것이 확실해서 가벼운 쪽을 골랐다.
#
# 화면에 보이는 한국어 이름표는 앱이 가지고 있고 서버는 영문 값만 다룬다.


class UserStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"


class RelationshipType(StrEnum):
    COUPLE = "couple"
    FRIENDS = "friends"
    FAMILY = "family"
    OTHER = "other"


class TripStatus(StrEnum):
    """
    여행의 진행 상태.

    `archived` 는 보관함이다. 종료일이 지났다고 서버가 자동으로 옮기지
    않는다(docs/development/02-architecture-and-data-model.md 4장).
    """

    PLANNING = "planning"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class PlaceProvider(StrEnum):
    """
    장소 정보를 어디서 가져왔는지.

    문서는 `provider` 라고만 적고 값을 열거하지 않는다. 지금 코드가 읽는
    것은 네이버뿐이고(`mobile/src/naverPlaceResolver.ts`) 요구사항에 카카오가
    함께 있어서 둘을 넣었다. 손으로 적은 장소는 `manual` 이다.
    """

    NAVER = "naver"
    KAKAO = "kakao"
    MANUAL = "manual"


class TripPlaceStatus(StrEnum):
    """
    여행 안에서 그 장소가 어디까지 왔는지.

    앱 화면은 아직 `후보`·`일정` 둘만 쓴다. `visited` 는 문서에 있고 화면이
    아직 따라오지 않은 값이다.
    """

    SAVED = "saved"
    SCHEDULED = "scheduled"
    VISITED = "visited"


class TagScope(StrEnum):
    """태그가 어디에 붙는 것인지. 같은 이름이라도 쓰임이 다르면 다른 태그다."""

    PLACE = "place"
    PACKING = "packing"
    INGREDIENT = "ingredient"


class LinkProvider(StrEnum):
    NAVER_MAP = "naver_map"
    KAKAO_MAP = "kakao_map"
    YOUTUBE = "youtube"
    BOOKING = "booking"
    OTHER = "other"


class LinkTargetType(StrEnum):
    """
    바깥 링크가 무엇에 붙는지.

    문서는 `external_links.target_type` 의 값을 열거하지 않는다.
    `photo_links` 가 쓰는 말(`trip`·`day`·`place`·`schedule`·`stay`)을 그대로
    따랐다. 새 대상이 생기면 여기에 더한다.
    """

    TRIP = "trip"
    PLACE = "place"
    SCHEDULE = "schedule"
    STAY = "stay"


class MembershipRole(StrEnum):
    """
    화면의 `관리자`·`편집 가능`·`보기만` 이 각각 이것이다.

    앱에서는 아직 이름표일 뿐이고 실제 차단은 서버에서만 이뤄진다
    (docs/development/02-architecture-and-data-model.md 4장).
    """

    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


def enum_column(enum_type: type[StrEnum]) -> SAEnum:
    """
    StrEnum 을 VARCHAR + CHECK 로 저장한다.

    `create_constraint=True` 가 핵심이다. SQLAlchemy 1.4부터 기본값이 False 라
    빼먹으면 CHECK 없이 그냥 VARCHAR 가 되고, 아무 문자열이나 들어간다.
    타입 이름을 넘기는 것은 제약 이름(`ck_<테이블>_<이름>`)을 짓기 위해서다.
    """
    return SAEnum(
        enum_type,
        native_enum=False,
        create_constraint=True,
        length=20,
        name=enum_type.__name__.lower(),
        values_callable=lambda e: [v.value for v in e],
    )
