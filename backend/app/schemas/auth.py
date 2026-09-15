from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import DevicePlatform, MembershipRole, RelationshipType, SensitiveAction

# 요청 본문은 앱이 쓰는 camelCase 를 그대로 받는다. API 명세서가 그렇게
# 적혀 있고, 앱은 OpenAPI 로 타입을 생성하므로 여기가 원본이다.


class _Camel(BaseModel):
    model_config = ConfigDict(
        alias_generator=lambda 이름: "".join(
            조각.capitalize() if i else 조각 for i, 조각 in enumerate(이름.split("_"))
        ),
        populate_by_name=True,
        extra="forbid",
    )


class DeviceInfo(_Camel):
    """
    어느 기기에서 왔는지.

    `installation_id` 는 앱이 설치될 때 만드는 값이다. 같은 기기에서 다시
    로그인하면 기기 줄이 쌓이지 않고 되살아난다.
    """

    installation_id: str = Field(min_length=1, max_length=64)
    platform: DevicePlatform = DevicePlatform.UNKNOWN
    app_version: str | None = Field(default=None, max_length=20)
    # 사용자가 세션 목록에서 어느 기기인지 알아보는 데 쓴다.
    device_name: str | None = Field(default=None, max_length=40)


class SignUpRequest(_Camel):
    email: EmailStr
    # 길이 검사는 여기서 하지 않는다. NFC 정규화 뒤에 세야 하고, 거부 사유를
    # 한 곳(app.core.passwords)에서만 정하기 위해서다.
    password: str
    display_name: str = Field(min_length=1, max_length=20)
    # 가입 화면에서 동의한 약관 판(시행일)과 만 14세 이상 확인. 지금 판과 다르면 422.
    agreed_terms_version: str | None = Field(default=None, max_length=20)
    age_confirmed: bool = False


class EmailRequest(_Camel):
    email: EmailStr


class TokenRequest(_Camel):
    token: str = Field(min_length=1, max_length=200)


class PasswordResetRequest(_Camel):
    token: str = Field(min_length=1, max_length=200)
    new_password: str


class LoginRequest(_Camel):
    email: EmailStr
    password: str
    device: DeviceInfo


class OAuthExchangeRequest(_Camel):
    """소셜 로그인에서 돌아온 앱이 세션을 받는다. PKCE 비밀을 함께 보낸다."""

    login_code: str = Field(min_length=1, max_length=200)
    code_verifier: str = Field(min_length=43, max_length=128)
    device: DeviceInfo
    # 이 로그인으로 계정이 새로 생길 때만 본다. 앱은 소셜 버튼 아래에 동의 문구를 보여 주고 늘 보낸다.
    agreed_terms_version: str | None = Field(default=None, max_length=20)
    age_confirmed: bool = False


class OAuthReauthRequest(_Camel):
    """연결된 제공자로 다시 로그인해 민감한 작업의 증표를 받는다."""

    action: SensitiveAction
    login_code: str = Field(min_length=1, max_length=200)
    code_verifier: str = Field(min_length=43, max_length=128)


class OAuthLinkRequest(_Camel):
    """같은 이메일의 기존 계정에 제공자를 붙인다. 그 계정의 비밀번호로 확인한다."""

    link_token: str = Field(min_length=1, max_length=200)
    password: str = Field(max_length=1024)
    device: DeviceInfo


class RefreshRequest(_Camel):
    refresh_token: str = Field(min_length=1, max_length=200)


class EndedDeviceOut(_Camel):
    """
    한도를 넘겨 끊긴 기기. 민감한 것은 넣지 않는다.

    앱은 이것을 보고 `오래 사용하지 않은 기기에서 로그아웃했어요` 를 띄운다.
    """

    display_name: str | None
    last_seen_at: datetime


class SessionOut(_Camel):
    access_token: str
    refresh_token: str
    # 초 단위. 앱이 만료 시각을 직접 계산하지 않게 한다.
    expires_in: int
    device_id: str
    ended_devices: list[EndedDeviceOut] = Field(default_factory=list)


class DeviceOut(_Camel):
    """세션 목록의 한 줄."""

    id: str
    display_name: str | None
    platform: DevicePlatform
    app_version: str | None
    last_seen_at: datetime
    # 지금 이 요청을 보낸 기기인지. 사용자가 자기 기기를 끊지 않게 한다.
    current: bool


class ReauthRequest(_Camel):
    """
    민감한 작업 전에 다시 확인한다.

    `action` 을 함께 받는 것이 핵심이다. 증표는 그 작업에만 묶이고 한 번
    쓰면 끝난다.
    """

    action: SensitiveAction
    # 비밀번호가 없는(소셜 로그인으로만 가입한) 계정은 `/auth/oauth/reauth` 로 받는다.
    password: str | None = None


class MeSpaceOut(_Camel):
    id: str
    name: str
    relationship_type: RelationshipType
    role: MembershipRole


class MeOut(_Camel):
    id: str
    email: EmailStr
    display_name: str
    avatar_url: str | None = None
    spaces: list[MeSpaceOut] = Field(default_factory=list)
    # 삭제를 요청해 둔 계정이면 지워질 시각. 앱은 이 값이 있으면 다른 화면
    # 대신 삭제 취소 화면을 먼저 보여 준다.
    deletion_scheduled_at: datetime | None = None
    # 재인증을 비밀번호로 할지 소셜 로그인으로 할지 앱이 고른다.
    has_password: bool = True
    linked_providers: list[str] = Field(default_factory=list)


class ReauthProofRequest(_Camel):
    """`POST /auth/reauth` 로 받은 증표를 싣는다. 작업마다 새로 받아야 한다."""

    reauth_proof: str | None = None


class DeletionOut(_Camel):
    requested_at: datetime | None
    scheduled_at: datetime | None
