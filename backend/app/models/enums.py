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
