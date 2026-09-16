"""
소셜 로그인의 서버 쪽 흐름. 제공자와 상관없이 같다.

    start      로그인 창을 연다. 앱의 state·PKCE challenge·돌아갈 주소를 적어 둔다.
    callback   제공자가 확인해 준 사람을 1분짜리 loginCode 에 묶어 앱으로 돌려보낸다.
    exchange   앱이 loginCode 와 code_verifier 로 세션을 받는다. 계정은 여기서 만든다.
    link       같은 이메일의 계정이 이미 있을 때, 그 계정 비밀번호로 확인하고 붙인다.
    reauth     로그인한 사람이 연결된 제공자로 다시 로그인해 민감한 작업의 증표를 받는다.
               비밀번호가 없는 계정이 계정 삭제·삭제 취소를 할 수 있게 한다.

docs/development/03-api-specification.md 2장이 원본이다.
"""

import base64
import hashlib
import hmac
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import passwords
from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.core.tokens import hash_refresh_token
from app.models import (
    DevicePlatform,
    OAuthAccount,
    OAuthPendingLogin,
    OAuthProvider,
    OAuthState,
    SensitiveAction,
    ThrottleScope,
    User,
    UserStatus,
)
from app.services import reauth, throttle
from app.services import accounts
from app.services.accounts import normalize_email
from app.services.auth_sessions import Session, start_session
from app.services.oauth.providers import Identity, Provider, ProviderError, get_provider

logger = logging.getLogger("daymo.oauth")

# 로그인 창을 열어 두고 제공자 화면에서 머무는 시간. 비밀번호를 찾거나 2단계
# 인증을 거쳐도 넉넉하다.
STATE_TTL = timedelta(minutes=10)
# 앱으로 돌아온 뒤 곧바로 바꾼다. 주소에 실려 다니는 값이라 짧게 산다.
LOGIN_CODE_TTL = timedelta(minutes=1)
# 비밀번호를 떠올려 입력하는 시간.
LINK_TTL = timedelta(minutes=10)

# RFC 7636 4.1. code_verifier 는 43~128자, challenge 는 S256 이면 43자다.
_VERIFIER = re.compile(r"^[A-Za-z0-9\-._~]{43,128}$")
_CHALLENGE = re.compile(r"^[A-Za-z0-9\-_]{43}$")
_APP_STATE = re.compile(r"^[A-Za-z0-9\-._~]{16,128}$")

# 표시 이름은 가입 화면과 같은 20자다.
MAX_NAME = 20
DEFAULT_NAME = "여행자"

_LINK_FAILED = "비밀번호를 확인해 주세요."
_CODE_FAILED = "로그인을 완료하지 못했어요. 처음부터 다시 시도해 주세요."


def _hash(raw: str) -> str:
    return hash_refresh_token(raw)


def _s256(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


def _provider(name: OAuthProvider) -> Provider:
    provider = get_provider(name, get_settings())
    if provider is None:
        # 켜지 않은 제공자는 없는 경로와 같다.
        raise AppError(ErrorCode.NOT_FOUND)
    return provider


# ---------------------------------------------------------------------------
# start
# ---------------------------------------------------------------------------


async def start(
    session: AsyncSession,
    *,
    provider_name: OAuthProvider,
    app_redirect_uri: str,
    app_state: str,
    code_challenge: str,
    code_challenge_method: str,
) -> str:
    """로그인 창 주소를 돌려준다. 앱은 이 주소를 시스템 브라우저로 연다."""
    provider = _provider(provider_name)

    if app_redirect_uri not in get_settings().app_redirect_uris:
        # 아무 주소나 받으면 남의 사이트가 loginCode 를 받아 간다. PKCE 가 있어
        # 그것만으로 세션을 뺏기지는 않지만, 막을 수 있는 것은 입구에서 막는다.
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"redirectUri": "허용되지 않은 주소예요."})
    if code_challenge_method != "S256" or not _CHALLENGE.match(code_challenge):
        # plain 은 받지 않는다. 주소에 실린 challenge 가 곧 verifier 가 된다.
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"codeChallenge": "S256 challenge 가 필요해요."})
    if not _APP_STATE.match(app_state):
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"state": "state 모양이 맞지 않아요."})

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(24)
    session.add(
        OAuthState(
            provider=provider_name,
            state_hash=_hash(state),
            nonce=nonce,
            app_redirect_uri=app_redirect_uri,
            app_state=app_state,
            code_challenge=code_challenge,
            expires_at=datetime.now(UTC) + STATE_TTL,
        )
    )
    await session.flush()
    return provider.authorize_url(state=state, nonce=nonce)


# ---------------------------------------------------------------------------
# callback
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CallbackResult:
    """
    callback 이 끝난 뒤 브라우저를 어디로 보낼지.

    `app_url` 이 없으면 우리가 시작한 로그인이 아니거나 이미 끝난 것이다. 그때는
    어느 앱 주소로도 보내지 않고 안내 페이지를 보여 준다.
    """

    app_url: str | None


def _app_url(state: OAuthState, **params: str) -> str:
    구분 = "&" if "?" in state.app_redirect_uri else "?"
    return state.app_redirect_uri + 구분 + urlencode({**params, "state": state.app_state})


async def callback(
    session: AsyncSession, *, provider_name: OAuthProvider, params: dict[str, str]
) -> CallbackResult:
    """
    제공자에서 돌아온 브라우저를 받는다.

    state 는 한 번만 쓴다. 같은 callback 주소를 다시 열어도(뒤로 가기, 새로고침,
    주소를 훔쳐 간 사람) 두 번째부터는 아무것도 하지 않는다.
    """
    provider = _provider(provider_name)
    지금 = datetime.now(UTC)

    raw_state = params.get("state") or ""
    state = (
        await session.scalar(select(OAuthState).where(OAuthState.state_hash == _hash(raw_state)))
        if raw_state
        else None
    )
    if (
        state is None
        or state.provider is not provider_name
        or state.used_at is not None
        or state.expires_at <= 지금
    ):
        return CallbackResult(app_url=None)
    state.used_at = 지금
    await session.flush()

    if params.get("error"):
        # 사용자가 동의 화면에서 취소하면 여기로 온다. 제공자마다 값이 다르다
        # (access_denied, user_cancelled_authorize ...). 앱에는 취소 하나로 알린다.
        오류 = params["error"]
        이유 = "cancelled" if ("denied" in 오류 or "cancel" in 오류) else "failed"
        logger.info("oauth %s callback error=%s", provider_name.value, 오류[:40])
        return CallbackResult(app_url=_app_url(state, error=이유))

    code = params.get("code") or ""
    if not code:
        return CallbackResult(app_url=_app_url(state, error="failed"))

    try:
        identity = await provider.fetch_identity(code=code, nonce=state.nonce, form=params)
    except ProviderError as 오류:
        logger.warning("oauth %s 확인 실패: %s", provider_name.value, 오류)
        return CallbackResult(app_url=_app_url(state, error=오류.reason))
    except Exception:
        # 제공자 서버가 죽었거나 응답 모양이 바뀌었다. 브라우저에 500 을 보여 주는
        # 대신 앱으로 돌려보내 다시 시도하게 한다.
        logger.exception("oauth %s 확인 중 예외", provider_name.value)
        return CallbackResult(app_url=_app_url(state, error="failed"))

    login_code = secrets.token_urlsafe(32)
    session.add(_pending(provider_name, identity, code_hash=_hash(login_code), state=state, 지금=지금))
    await session.flush()
    return CallbackResult(app_url=_app_url(state, loginCode=login_code))


def _pending(
    provider_name: OAuthProvider, identity: Identity, *, code_hash: str, state: OAuthState, 지금: datetime
) -> OAuthPendingLogin:
    이메일 = normalize_email(identity.email) if identity.email else None
    if 이메일 is not None and (len(이메일) > 320 or "@" not in 이메일):
        이메일 = None
    return OAuthPendingLogin(
        provider=provider_name,
        provider_subject=identity.subject[:255],
        provider_email=이메일,
        email_verified=identity.email_verified and 이메일 is not None,
        display_name=_display_name(identity.name, 이메일),
        code_hash=code_hash,
        code_challenge=state.code_challenge,
        expires_at=지금 + LOGIN_CODE_TTL,
    )


def _display_name(name: str | None, email: str | None) -> str:
    이름 = (name or "").strip()
    if not 이름 and email:
        이름 = email.split("@", 1)[0]
    return 이름[:MAX_NAME] or DEFAULT_NAME


# ---------------------------------------------------------------------------
# exchange
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DeviceArgs:
    installation_id: str
    platform: DevicePlatform = DevicePlatform.UNKNOWN
    app_version: str | None = None
    device_name: str | None = None


async def _start(session: AsyncSession, user: User, device: DeviceArgs) -> Session:
    return await start_session(
        session,
        user_id=user.id,
        installation_id=device.installation_id,
        platform=device.platform,
        app_version=device.app_version,
        display_name=device.device_name,
    )


async def _take_pending(
    session: AsyncSession, *, login_code: str, code_verifier: str
) -> OAuthPendingLogin | AppError:
    """
    loginCode 를 쓴다. verifier 가 틀려도 쓴 것으로 남긴다(한 번 틀린 뒤 다시 맞춰 볼 수 없게).

    코드가 없거나 이미 썼거나 지났으면 raise 한다. 남길 것이 없다.
    """
    지금 = datetime.now(UTC)
    대기 = await session.scalar(
        select(OAuthPendingLogin)
        .where(OAuthPendingLogin.code_hash == _hash(login_code))
        .with_for_update()
    )
    if 대기 is None or 대기.used_at is not None or 대기.expires_at <= 지금:
        raise AppError(ErrorCode.UNAUTHENTICATED, message=_CODE_FAILED)
    대기.used_at = 지금
    await session.flush()

    if not _VERIFIER.match(code_verifier) or not hmac.compare_digest(
        _s256(code_verifier), 대기.code_challenge
    ):
        return AppError(ErrorCode.UNAUTHENTICATED, message=_CODE_FAILED)
    return 대기


async def exchange(
    session: AsyncSession,
    *,
    login_code: str,
    code_verifier: str,
    device: DeviceArgs,
    agreed_terms_version: str | None = None,
    age_confirmed: bool = False,
) -> Session | AppError:
    """
    loginCode 를 세션으로 바꾼다.

    code_verifier 가 틀려도 loginCode 를 버린다. 한 번 틀린 뒤에 다시 맞춰 볼 수
    있으면 1분 동안 맞춰 보기를 허락하는 셈이다. 진짜 앱은 틀릴 일이 없다.

    **거절을 raise 하지 않고 돌려준다.** 거절하면서도 남겨야 하는 것이 있어서다
    (loginCode 를 쓴 표시, 연결 토큰). 예외로 끝나면 요청 transaction 이 되돌아가
    그것까지 사라진다. 라우터가 받은 오류를 그대로 응답으로 내보낸다.
    """
    지금 = datetime.now(UTC)
    대기 = await _take_pending(session, login_code=login_code, code_verifier=code_verifier)
    if isinstance(대기, AppError):
        return 대기

    # 1. 이 제공자 계정으로 들어온 적이 있다.
    연결 = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == 대기.provider,
            OAuthAccount.provider_subject == 대기.provider_subject,
        )
    )
    if 연결 is not None:
        user = await session.get(User, 연결.user_id)
        if user is None or user.status is not UserStatus.ACTIVE:
            return AppError(ErrorCode.UNAUTHENTICATED, message=_CODE_FAILED)
        # 참고로 들고 있는 이메일만 새로 적는다. 계정 이메일은 바꾸지 않는다.
        연결.provider_email = 대기.provider_email
        return await _start(session, user, device)

    # 2. 처음이다. 계정을 만들려면 이메일이 있어야 한다.
    if 대기.provider_email is None:
        return AppError(
            ErrorCode.VALIDATION_ERROR,
            message="이메일 제공에 동의해야 가입할 수 있어요. 다시 로그인하면서 이메일 항목에 동의해 주세요.",
        )

    기존 = await session.scalar(select(User).where(User.email == 대기.provider_email))
    if 기존 is not None:
        # 3. 같은 이메일의 계정이 있다.
        if 기존.status is not UserStatus.ACTIVE:
            return AppError(ErrorCode.UNAUTHENTICATED, message=_CODE_FAILED)

        # 3-1. 비밀번호가 없는 계정(소셜로만 가입)인데, 이번 제공자가 이메일 소유를
        #      확인해 줬다면 그대로 붙이고 들여보낸다.
        #
        #      비밀번호를 물어보면 답할 수 없어 길이 막힌다. 네이버로 가입한 사람이
        #      나중에 카카오를 누르면 아무것도 할 수 없었다.
        #
        #      확인해 준 이메일을 믿어도 되는 이유는, 그 이메일함을 여는 사람이 지금도
        #      비밀번호 재설정 링크로 이 계정을 가져갈 수 있어서다(`accounts.request_password_reset`).
        #      새로 열리는 문이 아니라 이미 열려 있는 문과 같은 강도다. 이메일을 확인해
        #      주지 않는 제공자(네이버)로는 이 길이 열리지 않는다.
        if 대기.email_verified and not 기존.password_hash:
            session.add(
                OAuthAccount(
                    user_id=기존.id,
                    provider=대기.provider,
                    provider_subject=대기.provider_subject,
                    provider_email=대기.provider_email,
                )
            )
            await session.flush()
            return await _start(session, 기존, device)

        # 3-2. 비밀번호가 있으면 그 비밀번호로 확인받는다. 무엇으로 가입한 계정인지는
        #      알려 주지 않는다.
        if 기존.password_hash:
            link_token = secrets.token_urlsafe(32)
            대기.link_token_hash = _hash(link_token)
            대기.link_expires_at = 지금 + LINK_TTL
            await session.flush()
            return AppError(
                ErrorCode.ACCOUNT_LINK_REQUIRED,
                details={"linkToken": link_token, "provider": 대기.provider.value},
            )

        # 3-3. 비밀번호도 없고 이메일도 확인해 주지 않는 제공자다. 물어볼 것이 없으니
        #      있지도 않은 비밀번호를 묻는 대신 원래 쓰던 방법으로 보낸다. 계정이 있다는
        #      것은 어차피 위에서도 알려 주는 사실이다.
        return AppError(
            ErrorCode.ACCOUNT_LINK_REQUIRED,
            message="이 이메일은 다른 방법으로 가입한 계정이에요. 전에 쓰던 로그인 방법으로 들어와 주세요.",
        )

    # 새 계정이 생기는 자리다. 이메일 가입과 같은 동의를 받았어야 한다.
    try:
        accounts.check_consent(agreed_terms_version, age_confirmed)
    except AppError as 동의_없음:
        return 동의_없음
    user = User(
        terms_version=accounts.TERMS_VERSION,
        terms_agreed_at=지금,
        email=대기.provider_email,
        # 제공자가 확인한 이메일만 확인된 것으로 친다.
        email_verified_at=지금 if 대기.email_verified else None,
        password_hash=None,
        display_name=대기.display_name or DEFAULT_NAME,
    )
    session.add(user)
    await session.flush()
    session.add(
        OAuthAccount(
            user_id=user.id,
            provider=대기.provider,
            provider_subject=대기.provider_subject,
            provider_email=대기.provider_email,
        )
    )
    await session.flush()
    return await _start(session, user, device)


# ---------------------------------------------------------------------------
# reauth
# ---------------------------------------------------------------------------


_REAUTH_FAILED = "로그인한 계정과 같은 소셜 계정으로 확인해 주세요."


async def reauth_with_provider(
    session: AsyncSession,
    *,
    user: User,
    action: SensitiveAction,
    login_code: str,
    code_verifier: str,
    ip: str = "",
) -> str | AppError:
    """
    제공자 로그인으로 본인을 다시 확인하고 그 작업 하나에 쓸 증표를 준다.

    - 새 세션을 만들지 않는다. 확인만 한다.
    - 제공자 계정이 **지금 로그인한 계정에 연결된 것**이어야 한다. 다른 사람의 카카오로
      로그인해 내 계정을 지울 수 없어야 한다.
    - 비밀번호가 있는 계정도 쓸 수 있다. 연결된 제공자로 들어오는 것은 로그인과 같은 확인이다.
    - 실패도 raise 하지 않고 돌려준다. 쓴 loginCode 와 시도 횟수가 남아야 한다.
    """
    계정_열쇠 = (throttle.ACCOUNT, throttle.key_for("user", str(user.id)))
    ip_열쇠 = (throttle.IP, throttle.key_for("ip", ip))
    await throttle.check(ThrottleScope.REAUTH, 계정_열쇠, ip_열쇠)

    대기 = await _take_pending(session, login_code=login_code, code_verifier=code_verifier)
    if isinstance(대기, AppError):
        await throttle.record(ThrottleScope.REAUTH, 계정_열쇠, ip_열쇠)
        return AppError(ErrorCode.FORBIDDEN, message=_REAUTH_FAILED)

    연결 = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == 대기.provider,
            OAuthAccount.provider_subject == 대기.provider_subject,
            OAuthAccount.user_id == user.id,
        )
    )
    if 연결 is None:
        await throttle.record(ThrottleScope.REAUTH, 계정_열쇠, ip_열쇠)
        # 401 이 아니다. 앱은 401 을 받으면 토큰을 갱신하다 로그아웃한다.
        return AppError(ErrorCode.FORBIDDEN, message=_REAUTH_FAILED)

    await throttle.reset(ThrottleScope.REAUTH, 계정_열쇠[1])
    return await reauth.new_proof(session, user=user, action=action)


# ---------------------------------------------------------------------------
# link
# ---------------------------------------------------------------------------


async def link_with_password(
    session: AsyncSession, *, link_token: str, password: str, device: DeviceArgs, ip: str = ""
) -> Session:
    """
    같은 이메일의 기존 계정에 제공자를 붙이고 로그인한다.

    비밀번호 확인은 로그인과 같은 한도로 센다. 연결 토큰이 있다고 비밀번호를
    끝없이 맞혀 볼 수 있으면 로그인 한도를 우회하는 길이 된다.

    비밀번호가 없는 계정(다른 제공자로만 가입한 계정)은 여기서 붙일 수 없다.
    틀린 비밀번호와 같은 문구로 답한다. 그 계정이 무엇으로 가입했는지 드러내지
    않는다. 원래 쓰던 방식으로 로그인한 뒤 설정에서 연결하는 길은 아직 없다.
    """
    지금 = datetime.now(UTC)
    대기 = await session.scalar(
        select(OAuthPendingLogin)
        .where(OAuthPendingLogin.link_token_hash == _hash(link_token))
        .with_for_update()
    )
    if (
        대기 is None
        or 대기.linked_at is not None
        or 대기.link_expires_at is None
        or 대기.link_expires_at <= 지금
        or 대기.provider_email is None
    ):
        raise AppError(ErrorCode.UNAUTHENTICATED, message=_CODE_FAILED)

    계정_열쇠 = (throttle.ACCOUNT, throttle.key_for("email", 대기.provider_email))
    ip_열쇠 = (throttle.IP, throttle.key_for("ip", ip))
    await throttle.check(ThrottleScope.LOGIN, 계정_열쇠, ip_열쇠)

    user = await session.scalar(select(User).where(User.email == 대기.provider_email))
    if user is None or not user.password_hash:
        await throttle.record(ThrottleScope.LOGIN, 계정_열쇠, ip_열쇠)
        passwords.verify(_DUMMY_HASH, password)
        raise AppError(ErrorCode.FORBIDDEN, message=_LINK_FAILED)
    if not passwords.verify(user.password_hash, password) or user.status is not UserStatus.ACTIVE:
        await throttle.record(ThrottleScope.LOGIN, 계정_열쇠, ip_열쇠)
        # 401 이 아니라 403 이다. 앱이 토큰 만료로 알고 갱신하려 들지 않게 한다.
        raise AppError(ErrorCode.FORBIDDEN, message=_LINK_FAILED)
    await throttle.reset(ThrottleScope.LOGIN, 계정_열쇠[1])

    대기.linked_at = 지금
    이미 = await session.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == 대기.provider,
            OAuthAccount.provider_subject == 대기.provider_subject,
        )
    )
    if 이미 is None:
        session.add(
            OAuthAccount(
                user_id=user.id,
                provider=대기.provider,
                provider_subject=대기.provider_subject,
                provider_email=대기.provider_email,
            )
        )
    elif 이미.user_id != user.id:
        # 연결 토큰을 받은 사이에 같은 제공자 계정이 다른 계정에 붙었다.
        raise AppError(ErrorCode.UNAUTHENTICATED, message=_CODE_FAILED)

    # 비밀번호로 계정 주인임을, 제공자로 이메일 주인임을 확인했다.
    if user.email_verified_at is None and 대기.email_verified:
        user.email_verified_at = 지금
    await session.flush()
    return await _start(session, user, device)


_DUMMY_HASH = passwords.hash_password(secrets.token_urlsafe(16))


# ---------------------------------------------------------------------------
# 정리
# ---------------------------------------------------------------------------


async def purge_expired(session: AsyncSession, *, now: datetime | None = None) -> int:
    """
    기한이 지난 줄을 지운다. 이메일·이름이 들어 있어 오래 두지 않는다.

    하루 한 번 도는 정리 작업이 부른다(app/jobs/cleanup.py).
    """
    지금 = now or datetime.now(UTC)
    상태 = await session.execute(delete(OAuthState).where(OAuthState.expires_at <= 지금))
    대기 = await session.execute(
        delete(OAuthPendingLogin).where(
            OAuthPendingLogin.expires_at <= 지금,
            or_(
                OAuthPendingLogin.link_expires_at.is_(None),
                OAuthPendingLogin.link_expires_at <= 지금,
            ),
        )
    )
    return (상태.rowcount or 0) + (대기.rowcount or 0)
