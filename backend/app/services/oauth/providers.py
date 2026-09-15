"""
소셜 로그인 제공자 넷. 누구인지 확인하는 데까지만 한다.

제공자마다 하는 일은 같다.

1. 로그인 창 주소를 만든다(`authorize_url`).
2. callback 으로 받은 code 를 토큰으로 바꾸고, 그 토큰으로 사람을 확인한다
   (`fetch_identity`).

계정을 만들고 세션을 여는 것은 여기서 하지 않는다(app/services/oauth/flow.py).

제공자가 준 access token 은 저장하지 않는다. 사람을 확인한 뒤로는 쓸 데가 없고,
들고 있으면 새어 나갈 것만 늘어난다. 탈퇴할 때 연결을 끊는 일(Apple token
revoke, 카카오 unlink)은 아직 없다. 붙일 때 그때 필요한 토큰만 따로 받는다.
"""

import json
import time
from dataclasses import dataclass
from typing import Any, ClassVar
from urllib.parse import urlencode

import httpx
import jwt

from app.core.config import Settings
from app.models import OAuthProvider

# 제공자 서버가 느리면 요청 하나가 워커를 오래 붙잡는다. 로그인 한 번에 두 번
# 부르므로 넉넉하되 짧게 둔다.
HTTP_TIMEOUT = httpx.Timeout(10.0)

# 테스트가 제공자 서버 대신 응답을 꽂는 자리. 운영에서는 비어 있다.
http_transport: httpx.AsyncBaseTransport | None = None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=HTTP_TIMEOUT, transport=http_transport)


class ProviderError(Exception):
    """
    제공자가 사람을 확인해 주지 않았다.

    `reason` 은 앱으로 돌려보내는 짧은 값이다. 사용자가 창을 닫은 것
    (`cancelled`)과 나머지(`failed`)만 가른다. 제공자가 준 오류 문구는 로그에만
    남긴다. 화면에 그대로 띄우면 영어 문구와 내부 사정이 드러난다.
    """

    def __init__(self, reason: str = "failed", detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason


@dataclass(frozen=True)
class Identity:
    """제공자가 확인해 준 사람."""

    subject: str
    email: str | None
    # 제공자가 이 이메일의 주인임을 확인했는지. 확인하지 않은 이메일로는 계정의
    # 이메일 확인을 끝내지 않는다.
    email_verified: bool
    name: str | None


class Provider:
    name: ClassVar[OAuthProvider]
    # Apple 은 이메일·이름을 받으려면 callback 을 POST 폼으로 받아야 한다.
    uses_form_post: ClassVar[bool] = False

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def configured(self) -> bool:
        raise NotImplementedError

    @property
    def redirect_uri(self) -> str:
        """제공자 콘솔에 등록하는 주소. 한 글자라도 다르면 제공자가 거부한다."""
        return f"{self.settings.auth_link_base.rstrip('/')}/v1/auth/oauth/{self.name.value}/callback"

    def authorize_url(self, *, state: str, nonce: str) -> str:
        raise NotImplementedError

    async def fetch_identity(self, *, code: str, nonce: str, form: dict[str, str]) -> Identity:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# id_token 검증 (Google, Apple)
# ---------------------------------------------------------------------------


class _Jwks:
    """
    제공자의 공개 키 묶음을 잠깐 들고 있는다.

    PyJWKClient 를 쓰지 않는다. 그건 urllib 으로 동기 요청을 보내서 이벤트
    루프를 멈춘다. 키는 자주 바뀌지 않으니 한 시간 들고 있고, 모르는 kid 가
    오면 한 번 다시 받는다. 제공자가 키를 돌린 직후일 수 있다.
    """

    TTL_SECONDS = 3600

    def __init__(self, url: str) -> None:
        self.url = url
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = 0.0

    async def _refresh(self) -> None:
        async with _client() as client:
            응답 = await client.get(self.url)
        응답.raise_for_status()
        self._keys = {
            키["kid"]: jwt.PyJWK(키) for 키 in 응답.json().get("keys", []) if "kid" in 키
        }
        self._fetched_at = time.monotonic()

    async def key(self, kid: str) -> jwt.PyJWK:
        if not self._keys or time.monotonic() - self._fetched_at > self.TTL_SECONDS:
            await self._refresh()
        if kid not in self._keys:
            await self._refresh()
        if kid not in self._keys:
            raise ProviderError(detail="id_token 의 kid 를 제공자 키 목록에서 찾지 못했다")
        return self._keys[kid]


async def _verify_id_token(
    token: str, *, jwks: _Jwks, audience: str, issuers: tuple[str, ...], nonce: str
) -> dict[str, Any]:
    """
    서명·발급자·대상·만료·nonce 를 모두 본다.

    토큰 엔드포인트에서 TLS 로 직접 받은 것이라 서명 검증을 건너뛰어도 된다고
    OIDC 는 말하지만, 검증을 빼 두면 나중에 id_token 을 앱에서 받는 길(네이티브
    Apple 로그인)을 붙일 때 그대로 구멍이 된다.
    """
    try:
        머리 = jwt.get_unverified_header(token)
        키 = await jwks.key(머리.get("kid", ""))
        claims = jwt.decode(
            token,
            키,
            algorithms=["RS256"],
            audience=audience,
            options={"require": ["iss", "sub", "aud", "exp", "iat"]},
            leeway=60,
        )
    except jwt.PyJWTError as 원인:
        raise ProviderError(detail=f"id_token 검증 실패: {type(원인).__name__}") from 원인

    if claims.get("iss") not in issuers:
        raise ProviderError(detail="id_token 발급자가 다르다")
    if claims.get("nonce") != nonce:
        raise ProviderError(detail="id_token nonce 가 다르다")
    return claims


def _truthy(value: Any) -> bool:
    """Apple 은 참거짓을 문자열 "true" 로 줄 때가 있다."""
    return value is True or (isinstance(value, str) and value.lower() == "true")


async def _post_form(url: str, data: dict[str, str]) -> dict[str, Any]:
    async with _client() as client:
        응답 = await client.post(url, data=data, headers={"Accept": "application/json"})
    try:
        본문 = 응답.json()
    except ValueError as 원인:
        raise ProviderError(detail=f"토큰 응답이 JSON 이 아니다({응답.status_code})") from 원인
    # 네이버는 실패해도 200 에 error 칸을 채워 준다.
    if 응답.status_code >= 400 or "error" in 본문:
        raise ProviderError(detail=f"토큰 교환 실패({응답.status_code}): {본문.get('error')}")
    return 본문


async def _get_json(url: str, access_token: str) -> dict[str, Any]:
    async with _client() as client:
        응답 = await client.get(url, headers={"Authorization": f"Bearer {access_token}"})
    if 응답.status_code >= 400:
        raise ProviderError(detail=f"사용자 정보 조회 실패({응답.status_code})")
    try:
        return 응답.json()
    except ValueError as 원인:
        raise ProviderError(detail="사용자 정보 응답이 JSON 이 아니다") from 원인


def _access_token(tokens: dict[str, Any]) -> str:
    값 = tokens.get("access_token")
    if not isinstance(값, str) or not 값:
        raise ProviderError(detail="토큰 응답에 access_token 이 없다")
    return 값


# ---------------------------------------------------------------------------
# Google
# ---------------------------------------------------------------------------

_GOOGLE_JWKS = _Jwks("https://www.googleapis.com/oauth2/v3/certs")


class Google(Provider):
    name = OAuthProvider.GOOGLE

    @property
    def configured(self) -> bool:
        return bool(self.settings.google_client_id and self.settings.google_client_secret)

    def authorize_url(self, *, state: str, nonce: str) -> str:
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(
            {
                "client_id": self.settings.google_client_id,
                "redirect_uri": self.redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "nonce": nonce,
                # 기기에 구글 계정이 여럿이면 고르게 한다. 조용히 첫 계정으로 들어가면
                # 다른 계정으로 가입하고 싶은 사람이 빠져나갈 길이 없다.
                "prompt": "select_account",
            }
        )

    async def fetch_identity(self, *, code: str, nonce: str, form: dict[str, str]) -> Identity:
        tokens = await _post_form(
            "https://oauth2.googleapis.com/token",
            {
                "code": code,
                "client_id": self.settings.google_client_id,
                "client_secret": self.settings.google_client_secret,
                "redirect_uri": self.redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        id_token = tokens.get("id_token")
        if not isinstance(id_token, str):
            raise ProviderError(detail="Google 토큰 응답에 id_token 이 없다")
        claims = await _verify_id_token(
            id_token,
            jwks=_GOOGLE_JWKS,
            audience=self.settings.google_client_id,
            issuers=("https://accounts.google.com", "accounts.google.com"),
            nonce=nonce,
        )
        return Identity(
            subject=str(claims["sub"]),
            email=claims.get("email"),
            email_verified=_truthy(claims.get("email_verified")),
            name=claims.get("name"),
        )


# ---------------------------------------------------------------------------
# Apple
# ---------------------------------------------------------------------------

_APPLE_JWKS = _Jwks("https://appleid.apple.com/auth/keys")
_APPLE_ISSUER = "https://appleid.apple.com"


class Apple(Provider):
    """
    Sign in with Apple 웹 흐름.

    iOS 에서는 나중에 네이티브 버튼(expo-apple-authentication)으로 바꿀 수 있다.
    그때도 id_token 검증과 계정 처리는 이 모듈과 flow.py 를 그대로 쓴다.
    """

    name = OAuthProvider.APPLE
    uses_form_post = True

    @property
    def configured(self) -> bool:
        s = self.settings
        return bool(s.apple_client_id and s.apple_team_id and s.apple_key_id and s.apple_private_key)

    def authorize_url(self, *, state: str, nonce: str) -> str:
        return "https://appleid.apple.com/auth/authorize?" + urlencode(
            {
                "client_id": self.settings.apple_client_id,
                "redirect_uri": self.redirect_uri,
                "response_type": "code",
                "scope": "name email",
                # scope 를 달면 Apple 이 form_post 만 허락한다.
                "response_mode": "form_post",
                "state": state,
                "nonce": nonce,
            }
        )

    def client_secret(self, now: int | None = None) -> str:
        """
        Apple 은 고정된 secret 대신 우리 키로 서명한 JWT 를 받는다.

        최대 6개월까지 쓸 수 있지만 요청마다 5분짜리를 새로 만든다. 서명은 싸고,
        오래 사는 secret 을 들고 있을 이유가 없다.
        """
        지금 = now or int(time.time())
        키 = self.settings.apple_private_key.replace("\\n", "\n")
        return jwt.encode(
            {
                "iss": self.settings.apple_team_id,
                "iat": 지금,
                "exp": 지금 + 300,
                "aud": _APPLE_ISSUER,
                "sub": self.settings.apple_client_id,
            },
            키,
            algorithm="ES256",
            headers={"kid": self.settings.apple_key_id},
        )

    async def fetch_identity(self, *, code: str, nonce: str, form: dict[str, str]) -> Identity:
        tokens = await _post_form(
            f"{_APPLE_ISSUER}/auth/token",
            {
                "client_id": self.settings.apple_client_id,
                "client_secret": self.client_secret(),
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.redirect_uri,
            },
        )
        id_token = tokens.get("id_token")
        if not isinstance(id_token, str):
            raise ProviderError(detail="Apple 토큰 응답에 id_token 이 없다")
        claims = await _verify_id_token(
            id_token,
            jwks=_APPLE_JWKS,
            audience=self.settings.apple_client_id,
            issuers=(_APPLE_ISSUER,),
            nonce=nonce,
        )
        return Identity(
            subject=str(claims["sub"]),
            # 사용자가 이메일 가리기를 고르면 privaterelay.appleid.com 주소가 온다.
            # Apple 이 전달해 주는 진짜 주소라 그대로 계정 이메일로 쓴다.
            email=claims.get("email"),
            email_verified=_truthy(claims.get("email_verified")),
            name=_apple_name(form.get("user")),
        )


def _apple_name(raw: str | None) -> str | None:
    """
    이름은 id_token 에 없다. 처음 동의할 때 한 번만 폼의 `user` 칸에 실려 온다.

    이 값은 서명되지 않았다. 표시 이름으로만 쓰고, 이메일은 여기서 읽지 않는다.
    """
    if not raw:
        return None
    try:
        이름 = json.loads(raw).get("name") or {}
    except (ValueError, AttributeError):
        return None
    # 한국어 이름 순서로 성을 앞에 둔다.
    붙인 = f"{이름.get('lastName') or ''}{이름.get('firstName') or ''}".strip()
    return 붙인 or None


# ---------------------------------------------------------------------------
# Kakao
# ---------------------------------------------------------------------------


class Kakao(Provider):
    name = OAuthProvider.KAKAO

    @property
    def configured(self) -> bool:
        return bool(self.settings.kakao_rest_api_key)

    def authorize_url(self, *, state: str, nonce: str) -> str:
        return "https://kauth.kakao.com/oauth/authorize?" + urlencode(
            {
                "client_id": self.settings.kakao_rest_api_key,
                "redirect_uri": self.redirect_uri,
                "response_type": "code",
                "state": state,
                # 콘솔에서 켠 동의 항목 중 이것만 달라고 한다. 더 받지 않는다.
                "scope": "account_email profile_nickname",
            }
        )

    async def fetch_identity(self, *, code: str, nonce: str, form: dict[str, str]) -> Identity:
        요청 = {
            "grant_type": "authorization_code",
            "client_id": self.settings.kakao_rest_api_key,
            "redirect_uri": self.redirect_uri,
            "code": code,
        }
        if self.settings.kakao_client_secret:
            요청["client_secret"] = self.settings.kakao_client_secret
        tokens = await _post_form("https://kauth.kakao.com/oauth/token", 요청)
        나 = await _get_json("https://kapi.kakao.com/v2/user/me", _access_token(tokens))

        if "id" not in 나:
            raise ProviderError(detail="카카오 사용자 정보에 id 가 없다")
        계정 = 나.get("kakao_account") or {}
        # 카카오는 이메일이 있어도 쓸 수 없는 상태(만료·미인증)일 수 있다. 둘 다
        # 참일 때만 쓴다.
        쓸_수_있는_이메일 = _truthy(계정.get("is_email_valid")) and _truthy(
            계정.get("is_email_verified")
        )
        return Identity(
            subject=str(나["id"]),
            email=계정.get("email") if 쓸_수_있는_이메일 else None,
            email_verified=쓸_수_있는_이메일,
            name=(계정.get("profile") or {}).get("nickname"),
        )


# ---------------------------------------------------------------------------
# Naver
# ---------------------------------------------------------------------------


class Naver(Provider):
    name = OAuthProvider.NAVER

    @property
    def configured(self) -> bool:
        return bool(self.settings.naver_client_id and self.settings.naver_client_secret)

    def authorize_url(self, *, state: str, nonce: str) -> str:
        return "https://nid.naver.com/oauth2.0/authorize?" + urlencode(
            {
                "response_type": "code",
                "client_id": self.settings.naver_client_id,
                "redirect_uri": self.redirect_uri,
                "state": state,
            }
        )

    async def fetch_identity(self, *, code: str, nonce: str, form: dict[str, str]) -> Identity:
        tokens = await _post_form(
            "https://nid.naver.com/oauth2.0/token",
            {
                "grant_type": "authorization_code",
                "client_id": self.settings.naver_client_id,
                "client_secret": self.settings.naver_client_secret,
                "code": code,
                "state": form.get("state", ""),
            },
        )
        본문 = await _get_json("https://openapi.naver.com/v1/nid/me", _access_token(tokens))
        나 = 본문.get("response") or {}
        if 본문.get("resultcode") != "00" or "id" not in 나:
            raise ProviderError(detail=f"네이버 사용자 정보 조회 실패: {본문.get('resultcode')}")
        return Identity(
            subject=str(나["id"]),
            email=나.get("email"),
            # 네이버는 이메일을 확인했는지 알려 주지 않는다. 연락처 이메일로 바꿔 둔
            # 주소일 수도 있어서 확인된 것으로 치지 않는다.
            email_verified=False,
            name=나.get("name") or 나.get("nickname"),
        )


PROVIDERS: dict[OAuthProvider, type[Provider]] = {
    OAuthProvider.GOOGLE: Google,
    OAuthProvider.APPLE: Apple,
    OAuthProvider.KAKAO: Kakao,
    OAuthProvider.NAVER: Naver,
}


def get_provider(name: OAuthProvider, settings: Settings) -> Provider | None:
    """설정이 다 있는 제공자만 돌려준다. 빠진 값이 있으면 없는 것과 같다."""
    provider = PROVIDERS[name](settings)
    return provider if provider.configured else None


def configured_providers(settings: Settings) -> list[OAuthProvider]:
    return [name for name in PROVIDERS if PROVIDERS[name](settings).configured]
