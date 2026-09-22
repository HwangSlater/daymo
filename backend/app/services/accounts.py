import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import passwords
from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.core.tokens import hash_refresh_token, new_one_time_token
from app.models import (
    DevicePlatform,
    EmailVerificationToken,
    PasswordResetToken,
    RevokeReason,
    ThrottleScope,
    User,
    UserStatus,
)
from app.services import throttle
from app.services.auth_sessions import Session, revoke_all_for_user, start_session
from app.services.mailer import Letter, get_outbox

logger = logging.getLogger("daymo.accounts")

# 1회용 링크는 30분이다(docs/development/03-api-specification.md 2장).
ONE_TIME_TTL = timedelta(minutes=30)


def _link(path: str) -> str:
    """메일 속 링크. 확인·재설정 페이지는 API 서버가 직접 보여 준다."""
    return get_settings().auth_link_base.rstrip("/") + path


# 로그인 실패 문구는 하나로 통일한다. 이메일이 있는지, 어떤 방식으로
# 가입했는지, 잠겼는지를 문구로 드러내지 않는다.
_LOGIN_FAILED = "이메일 또는 비밀번호를 확인해 주세요."


def normalize_email(raw: str) -> str:
    """
    대소문자를 구분하지 않고 하나로 본다.

    `Sky@example.com` 과 `sky@example.com` 으로 두 계정이 생기면, 사용자는
    자기가 어느 쪽으로 가입했는지 알 수 없다.
    """
    return passwords.normalize(raw).strip().lower()


async def _find_by_email(session: AsyncSession, email: str) -> User | None:
    return await session.scalar(select(User).where(User.email == normalize_email(email)))


# ---------------------------------------------------------------------------
# 가입과 이메일 확인
# ---------------------------------------------------------------------------


# 지금 게시한 이용약관·개인정보 처리방침의 판. site/src/terms.html·privacy.html 의 시행일과 같다.
# 약관을 바꾸면 여기와 앱(mobile/src/auth.ts 의 TERMS_VERSION)을 함께 올린다.
TERMS_VERSION = "2026-09-15"


def check_consent(agreed_terms_version: str | None, age_confirmed: bool) -> None:
    """가입 전에 지금 판의 약관·처리방침에 동의하고 만 14세 이상임을 확인했는지 본다."""
    if agreed_terms_version != TERMS_VERSION:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            message="이용약관과 개인정보 처리방침에 동의해 주세요. 앱을 업데이트해야 할 수도 있어요.",
            fields={"agreedTermsVersion": "지금 약관에 동의해야 가입할 수 있어요."},
        )
    if not age_confirmed:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            message="만 14세 이상만 가입할 수 있어요.",
            fields={"ageConfirmed": "만 14세 이상만 가입할 수 있어요."},
        )


async def sign_up(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    display_name: str,
    agreed_terms_version: str | None = None,
    age_confirmed: bool = False,
    ip: str = "",
) -> None:
    """
    이메일로 가입한다.

    **이미 있는 이메일이어도 같은 응답을 준다.** 여기서 오류를 내면 누구나
    이메일만 넣어 보면서 어떤 사람이 이 서비스를 쓰는지 알아낼 수 있다.
    대신 그 주소로 "누군가 이 주소로 가입을 시도했다" 는 메일을 보낸다.
    실제 주인은 상황을 알게 되고, 주인이 아닌 쪽은 아무것도 알 수 없다.

    돌려주는 값이 없는 것도 같은 이유다. 새로 만든 계정의 id 를 주면 그
    자체가 "이 이메일은 없었다" 는 뜻이 된다.
    """
    정규화된_이메일 = normalize_email(email)
    check_consent(agreed_terms_version, age_confirmed)
    # 한 IP 에서 계정을 찍어 내는 것을 막는다. 이메일 기준으로는 세지 않는다.
    # 이미 있는 이메일로 계속 시도하는 것이 곧 계정 확인이 되기 때문이다.
    await throttle.check(ThrottleScope.SIGNUP, (throttle.IP, throttle.key_for("ip", ip)))
    await throttle.record(ThrottleScope.SIGNUP, (throttle.IP, throttle.key_for("ip", ip)))

    # 비밀번호 검사를 먼저 한다. 이메일이 이미 있든 없든 같은 일을 해야
    # 응답 시간으로 구분되지 않는다.
    검사된_비밀번호 = passwords.validate(password, email=정규화된_이메일)

    이름 = (display_name or "").strip()
    if not 이름 or len(이름) > 20:
        raise AppError(
            ErrorCode.VALIDATION_ERROR, fields={"displayName": "이름을 1~20자로 적어 주세요."}
        )

    기존 = await _find_by_email(session, 정규화된_이메일)
    if 기존 is not None:
        await _가입_메일(
            Letter(
                to=정규화된_이메일,
                subject="이미 Daymo에 가입한 이메일이에요",
                # 1회용 링크가 아니라서 link 칸에 넣지 않는다. 넣으면 "30분 동안 한 번만"
                # 안내가 붙는다.
                body=(
                    "이 이메일로 가입한 Daymo 계정이 이미 있어요. 비밀번호가 기억나지 않으면 "
                    f"아래에서 비밀번호를 재설정할 수 있어요.\n{_link('/auth/forgot-password')}\n\n"
                    "직접 시도하지 않았다면 이 메일은 무시해도 괜찮아요."
                ),
            )
        )
        return

    user = User(
        email=정규화된_이메일,
        password_hash=passwords.hash_password(검사된_비밀번호),
        display_name=이름,
        terms_version=TERMS_VERSION,
        terms_agreed_at=datetime.now(UTC),
    )
    session.add(user)
    await session.flush()

    try:
        await send_email_verification(session, email=정규화된_이메일, ip=ip)
    except OSError:
        # 메일 서버에 닿지 못해도 계정은 만든다. 확인 전에도 로그인은 되고, 확인
        # 메일은 앱에서 다시 보낼 수 있다. 여기서 실패로 끝내면 가입이 통째로
        # 되돌려지는데, 곧바로 다시 누르면 재전송 간격(60초)에 걸려 429 까지
        # 난다(2026-09-22 운영에서 DNS 조회가 한 번 실패해 겪었다).
        logger.exception("가입 확인 메일을 보내지 못했다")


async def _가입_메일(letter: Letter) -> None:
    """
    가입 자리에서 보내는 알림 메일. 못 보내도 가입 응답은 그대로 둔다.

    이미 있는 이메일일 때만 오류가 나면 그 차이로 계정이 있는지 알 수 있다.
    """
    try:
        await get_outbox().send(letter)
    except OSError:
        logger.exception("가입 알림 메일을 보내지 못했다")


async def send_email_verification(
    session: AsyncSession, *, email: str, ip: str = ""
) -> None:
    """
    이메일 확인 링크를 보낸다. 재전송도 같은 함수다.

    계정이 없어도 조용히 넘어간다. 이미 확인된 계정도 마찬가지다. 응답이
    갈리면 그것으로 계정 존재와 확인 상태를 알 수 있다.

    보내기 전에 그 계정의 쓰지 않은 링크를 모두 폐기한다. 예전 링크가 계속
    살아 있으면 메일함을 한 번 본 사람이 오래된 링크로 들어올 수 있다.
    """
    # 세는 것을 먼저 한다. 계정이 없을 때만 빠르게 돌아가면 그 차이로
    # 계정 존재를 알 수 있다.
    계정_열쇠 = (throttle.ACCOUNT, throttle.key_for("email", normalize_email(email)))
    ip_열쇠 = (throttle.IP, throttle.key_for("ip", ip))
    await throttle.check(ThrottleScope.EMAIL_VERIFICATION, 계정_열쇠, ip_열쇠)
    await throttle.record(ThrottleScope.EMAIL_VERIFICATION, 계정_열쇠, ip_열쇠)

    user = await _find_by_email(session, email)
    if user is None or user.email_verified_at is not None:
        return

    지금 = datetime.now(UTC)
    await session.execute(
        update(EmailVerificationToken)
        .where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.revoked_at.is_(None),
        )
        .values(revoked_at=지금)
    )

    원문, 해시 = new_one_time_token()
    session.add(
        EmailVerificationToken(
            user_id=user.id, token_hash=해시, expires_at=지금 + ONE_TIME_TTL
        )
    )
    await session.flush()

    await get_outbox().send(
        Letter(
            to=user.email,
            subject="이메일을 확인해 주세요",
            link=_link(f"/auth/verify-email?token={원문}"),
            action="이메일 확인하기",
        )
    )


async def confirm_email(session: AsyncSession, *, token: str) -> None:
    """
    링크의 토큰으로 이메일 확인을 끝낸다.

    만료·이미 사용·교체된 토큰을 구분해 알려 주지 않는다. 앱은 어느
    경우에나 같은 화면을 보여 주고 재전송을 제공한다.
    """
    지금 = datetime.now(UTC)
    줄 = await session.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == hash_refresh_token(token)
        )
    )
    if (
        줄 is None
        or 줄.used_at is not None
        or 줄.revoked_at is not None
        or 줄.expires_at <= 지금
    ):
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            message="이미 사용했거나 만료된 링크예요. 다시 받아 주세요.",
        )

    줄.used_at = 지금
    await session.execute(
        update(User)
        .where(User.id == 줄.user_id, User.email_verified_at.is_(None))
        .values(email_verified_at=지금)
    )
    await session.flush()


# ---------------------------------------------------------------------------
# 로그인
# ---------------------------------------------------------------------------


async def log_in(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    installation_id: str,
    platform: DevicePlatform = DevicePlatform.UNKNOWN,
    app_version: str | None = None,
    device_name: str | None = None,
    ip: str = "",
) -> Session:
    """
    이메일로 로그인한다.

    없는 계정과 틀린 비밀번호를 같은 오류로 돌려준다. 없는 계정일 때도
    비밀번호를 한 번 검증한다. 그러지 않으면 응답이 돌아오는 시간만으로
    그 이메일이 있는지 알 수 있다.
    """
    계정_열쇠 = (throttle.ACCOUNT, throttle.key_for("email", normalize_email(email)))
    ip_열쇠 = (throttle.IP, throttle.key_for("ip", ip))
    await throttle.check(ThrottleScope.LOGIN, 계정_열쇠, ip_열쇠)

    user = await _find_by_email(session, email)

    if user is None or not user.password_hash:
        await throttle.record(ThrottleScope.LOGIN, 계정_열쇠, ip_열쇠)
        # 시간을 맞추기 위한 검증이다. 결과는 쓰지 않는다.
        passwords.verify(_DUMMY_HASH, password)
        raise AppError(ErrorCode.UNAUTHENTICATED, message=_LOGIN_FAILED)

    if not passwords.verify(user.password_hash, password):
        await throttle.record(ThrottleScope.LOGIN, 계정_열쇠, ip_열쇠)
        raise AppError(ErrorCode.UNAUTHENTICATED, message=_LOGIN_FAILED)

    if user.status is not UserStatus.ACTIVE:
        # 정지·삭제된 계정도 같은 문구다. 상태를 알려 줄 이유가 없다.
        await throttle.record(ThrottleScope.LOGIN, 계정_열쇠, ip_열쇠)
        raise AppError(ErrorCode.UNAUTHENTICATED, message=_LOGIN_FAILED)

    # 성공했으니 계정 기준 실패 기록을 지운다. IP 기준은 남긴다. 한 IP 에서
    # 여러 계정을 찍어 보는 공격은 그중 하나가 맞았다고 멈출 이유가 없다.
    await throttle.reset(ThrottleScope.LOGIN, 계정_열쇠[1])

    # 비용 기준을 올린 뒤라면 로그인에 성공한 김에 다시 해시해 둔다.
    if passwords.needs_rehash(user.password_hash):
        user.password_hash = passwords.hash_password(password)
        await session.flush()

    return await start_session(
        session,
        user_id=user.id,
        installation_id=installation_id,
        platform=platform,
        app_version=app_version,
        display_name=device_name,
    )


# 없는 계정일 때도 같은 시간을 쓰기 위한 값. 아무도 이 비밀번호를 모른다.
_DUMMY_HASH = passwords.hash_password(str(uuid.uuid4()))


# ---------------------------------------------------------------------------
# 비밀번호 재설정
# ---------------------------------------------------------------------------


async def request_password_reset(
    session: AsyncSession, *, email: str, ip: str = ""
) -> None:
    """
    재설정 링크를 보낸다.

    계정이 없어도 조용히 넘어간다. 새 링크를 발급하면서 쓰지 않은 예전
    링크를 모두 폐기한다.
    """
    계정_열쇠 = (throttle.ACCOUNT, throttle.key_for("email", normalize_email(email)))
    ip_열쇠 = (throttle.IP, throttle.key_for("ip", ip))
    await throttle.check(ThrottleScope.PASSWORD_RESET, 계정_열쇠, ip_열쇠)
    await throttle.record(ThrottleScope.PASSWORD_RESET, 계정_열쇠, ip_열쇠)

    user = await _find_by_email(session, email)
    if user is None or user.status is not UserStatus.ACTIVE:
        return

    지금 = datetime.now(UTC)
    await session.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.revoked_at.is_(None),
        )
        .values(revoked_at=지금)
    )

    원문, 해시 = new_one_time_token()
    session.add(
        PasswordResetToken(user_id=user.id, token_hash=해시, expires_at=지금 + ONE_TIME_TTL)
    )
    await session.flush()

    await get_outbox().send(
        Letter(
            to=user.email,
            subject="Daymo 비밀번호 재설정",
            link=_link(f"/auth/reset-password?token={원문}"),
            action="새 비밀번호 정하기",
        )
    )


async def reset_password(session: AsyncSession, *, token: str, new_password: str) -> None:
    """
    링크의 토큰으로 비밀번호를 바꾸고 **그 계정의 모든 세션을 끊는다.**

    비밀번호를 다시 정하는 상황은 대개 남이 들어와 있을 수 있다고 의심하는
    상황이다. 새 비밀번호만 주고 기존 세션을 두면 침입자가 그대로 남는다.
    """
    지금 = datetime.now(UTC)
    줄 = await session.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_refresh_token(token)
        )
    )
    if (
        줄 is None
        or 줄.used_at is not None
        or 줄.revoked_at is not None
        or 줄.expires_at <= 지금
    ):
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            message="이미 사용했거나 만료된 링크예요. 다시 받아 주세요.",
        )

    user = await session.get(User, 줄.user_id)
    if user is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, message="이미 사용했거나 만료된 링크예요. 다시 받아 주세요.")

    검사된 = passwords.validate(new_password, email=user.email)
    user.password_hash = passwords.hash_password(검사된)
    줄.used_at = 지금
    await session.flush()

    await revoke_all_for_user(session, user.id, reason=RevokeReason.PASSWORD_RESET)


async def count_active_users(session: AsyncSession) -> int:
    """운영에서 세는 값. 화면이 아니라 SQL 로 보는 통계의 첫 줄이다."""
    return await session.scalar(
        select(func.count()).select_from(User).where(User.status == UserStatus.ACTIVE)
    ) or 0
