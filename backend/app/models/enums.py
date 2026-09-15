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


class ScheduleItemType(StrEnum):
    """
    일정 한 줄이 무엇인지.

    문서는 `type` 이라고만 적고 값을 열거하지 않는다. 앱은 어떤 id 가
    채워졌는지로 종류를 가르고 있는데(`placeId`, `stayId`, ...), 서버에서는
    그것을 값 하나로 드러낸다.
    """

    PLACE = "place"
    MEAL = "meal"
    MOVE = "move"
    REST = "rest"
    OTHER = "other"


class TransportDirection(StrEnum):
    OUTBOUND = "outbound"
    RETURN = "return"


class TransportMethod(StrEnum):
    """
    앱의 교통수단 목록 그대로다(`KTX`·`SRT`·`버스`·`항공`·`기타`).

    KTX 와 SRT 를 `train` 하나로 합치지 않는다. 예매처가 다르고 사용자가
    화면에서 둘을 구분해 고르고 있다.
    """

    KTX = "ktx"
    SRT = "srt"
    BUS = "bus"
    FLIGHT = "flight"
    OTHER = "other"


class BookingStatus(StrEnum):
    """앱의 `예매 완료`·`예매 전`."""

    BOOKED = "booked"
    NOT_BOOKED = "not_booked"


class ReservationStatus(StrEnum):
    """앱의 `예약 확정`·`확인 필요`·`취소`."""

    CONFIRMED = "confirmed"
    NEEDS_CHECK = "needs_check"
    CANCELLED = "cancelled"


class ReservationTargetType(StrEnum):
    """
    예약이 무엇에 붙는지.

    가게 예약이면 장소, 숙소 예약이면 숙소다. 어디에도 안 붙는 예약이 있어
    `target_id` 는 비어 있을 수 있다.
    """

    PLACE = "place"
    STAY = "stay"
    OTHER = "other"


class ExpenseCategory(StrEnum):
    """앱의 분류 여섯 개 그대로다(식비·교통·숙박·입장료·쇼핑·기타)."""

    MEAL = "meal"
    TRANSPORT = "transport"
    LODGING = "lodging"
    ADMISSION = "admission"
    SHOPPING = "shopping"
    OTHER = "other"


class SplitMode(StrEnum):
    """
    화면에서 고른 나누기 방식. 앱의 `똑같이`·`일부만`·`금액 직접`이다.

    **계산에 쓰지 않는다.** 몫은 `expense_shares` 만 보고 정한다. 이 값은
    지출을 다시 열 때 고른 방식 그대로 열어 주고, 목록에 사람 이름만 적을지
    금액까지 적을지를 가르는 데만 쓴다. 값이 없으면 shares 모양에서 짐작한다
    (docs/development/02-architecture-and-data-model.md 3장).
    """

    EVEN = "even"
    SUBSET = "subset"
    AMOUNT = "amount"


class ChecklistKind(StrEnum):
    """준비물 목록인지 장 볼 목록인지."""

    PACKING = "packing"
    SHOPPING = "shopping"


class Procurement(StrEnum):
    """
    재료를 어떻게 마련하는지.

    앱에서 고르는 자리는 하나이고 후보는 `미정 / 참가자들 / 구매` 다. 사람을
    고르면 그 사람이 가져오는 것(`bring`)이고, `구매` 는 현지에서 사 오는
    것이라 담당이 없다. 사람이 아닌 값은 참가자 목록 밖에 둔다는 문서 규칙이
    여기 적용된다.
    """

    BRING = "bring"
    BUY = "buy"
    UNDECIDED = "undecided"


class PhotoStatus(StrEnum):
    """
    사진 한 장이 지금 어떤 상태인지.

    `restricted` 는 다른 멤버가 올린 사진에 등장한 사람이 삭제·처리정지를
    요청했을 때 쓴다. 일반 조회와 다운로드에서 임시로 숨기고, 검토 결과에
    따라 7일 삭제 절차로 가거나 `ready` 로 되돌린다
    (docs/development/02-architecture-and-data-model.md 4장).
    """

    UPLOADING = "uploading"
    READY = "ready"
    RESTRICTED = "restricted"
    DELETED = "deleted"
    FAILED = "failed"


class PhotoTargetType(StrEnum):
    """사진이 무엇에 붙는지."""

    TRIP = "trip"
    DAY = "day"
    PLACE = "place"
    SCHEDULE = "schedule"
    STAY = "stay"


class OAuthProvider(StrEnum):
    GOOGLE = "google"
    APPLE = "apple"
    KAKAO = "kakao"
    NAVER = "naver"


class DevicePlatform(StrEnum):
    IOS = "ios"
    ANDROID = "android"
    WEB = "web"
    UNKNOWN = "unknown"


class RevokeReason(StrEnum):
    """
    갱신 토큰을 왜 끊었는지.

    `REUSE_DETECTED` 가 가장 중요하다. 이미 갈아 끼운 토큰이 다시 쓰이면
    훔쳐 간 것으로 보고 같은 가족을 통째로 끊는데, 나중에 무슨 일이었는지
    되짚으려면 이유가 남아 있어야 한다.
    """

    ROTATED = "rotated"
    REUSE_DETECTED = "reuse_detected"
    LOGOUT = "logout"
    PASSWORD_RESET = "password_reset"
    DEVICE_LIMIT = "device_limit"
    ADMIN = "admin"
    ACCOUNT_DELETION = "account_deletion"


class ThrottleScope(StrEnum):
    """무엇을 세고 있는지. 종류마다 한도와 창 길이가 다르다."""

    LOGIN = "login"
    # 로그인한 채로 비밀번호를 다시 확인하는 것. 따로 센다. 훔친 access token
    # 으로 비밀번호를 맞혀 보는 길을 로그인과 같은 한도로 막는다.
    REAUTH = "reauth"
    SIGNUP = "signup"
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"


class SensitiveAction(StrEnum):
    """
    재인증 증표가 필요한 작업.

    공간 삭제는 여기 없다. 재인증 대신 공간 이름을 정확히 입력하는 별도의
    이중 확인을 쓴다(docs/development/03-api-specification.md 2장).
    """

    DELETE_ACCOUNT = "delete_account"
    # 삭제 취소도 따로 받는다. 기기를 잠깐 빌린 사람이 남의 삭제 요청을
    # 되돌리지 못하게 한다.
    CANCEL_DELETION = "cancel_deletion"
    CHANGE_EMAIL = "change_email"
    CHANGE_PASSWORD = "change_password"
    LINK_PROVIDER = "link_provider"
    UNLINK_PROVIDER = "unlink_provider"


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
