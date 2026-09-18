"""
로그인한 사람이 자기 계정의 비밀번호와 이메일을 바꾼다.

둘 다 access token 만으로는 할 수 없다. 작업마다 새로 받은 재인증 증표가 있어야 한다
(docs/development/03-api-specification.md 2장). 잠깐 열린 화면을 잡은 사람이 비밀번호나
이메일을 바꿔 계정을 통째로 가져가지 못하게 한다.

비밀번호를 잊어 로그인하지 못하는 경우는 여기가 아니라 `accounts.request_password_reset` 이다.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import passwords
from app.core.errors import AppError, ErrorCode
from app.core.tokens import hash_refresh_token, new_one_time_token
from app.models import (
    Device,
    EmailChangeToken,
    EmailVerificationToken,
    PasswordResetToken,
    RefreshToken,
    RevokeReason,
    SensitiveAction,
    ThrottleScope,
    User,
    UserStatus,
)
from app.services import throttle
from app.services.accounts import ONE_TIME_TTL, _find_by_email, _link, normalize_email
from app.services.mailer import Letter, get_outbox
from app.services.reauth import consume_proof

# 만료·이미 사용·주소가 그새 다른 계정에 쓰인 경우를 나눠 말하지 않는다. 나누면 링크를
# 가진 사람이 그 주소에 계정이 생겼는지 알 수 있다.
_LINK_FAILED = "이미 사용했거나 만료된 링크예요. 앱에서 다시 요청해 주세요."


# ---------------------------------------------------------------------------
# 비밀번호 바꾸기
# ---------------------------------------------------------------------------


async def change_password(
    session: AsyncSession,
    *,
    user: User,
    current_device_id: uuid.UUID | None,
    new_password: str,
    proof: str | None,
) -> None:
    """
    비밀번호를 바꾸고 **지금 이 기기만 남기고** 다른 기기의 세션을 끊는다.

    재설정(`accounts.reset_password`)과 달리 바꾼 기기는 남긴다. 방금 비밀번호나 소셜
    로그인으로 본인임을 다시 확인한 기기라서 끊을 이유가 없고, 끊으면 바꾸자마자 로그인
    화면으로 튕긴다.

    비밀번호가 없는(소셜 로그인으로만 가입한) 계정도 여기서 처음 비밀번호를 정할 수 있다.
    증표는 `POST /auth/oauth/reauth` 로 받는다. 증표를 어떻게 받았는지는 여기서 가리지 않는다.

    규칙 검사를 증표보다 먼저 한다. 너무 짧은 비밀번호 때문에 증표를 날리고 다시 확인하게
    할 이유가 없다.
    """
    검사된 = passwords.validate(new_password, email=user.email)
    await consume_proof(
        session, user_id=user.id, action=SensitiveAction.CHANGE_PASSWORD, proof=proof
    )

    지금 = datetime.now(UTC)
    user.password_hash = passwords.hash_password(검사된)

    다른_기기 = Device.user_id == user.id
    다른_토큰 = RefreshToken.user_id == user.id
    if current_device_id is not None:
        다른_기기 = 다른_기기 & (Device.id != current_device_id)
        다른_토큰 = 다른_토큰 & or_(
            RefreshToken.device_id.is_(None), RefreshToken.device_id != current_device_id
        )
    # 갱신 토큰만 끊으면 이미 받은 access token 이 15분 동안 살아 있다. 기기를 끊어야
    # 요청마다 하는 기기 확인에서 바로 막힌다.
    await session.execute(
        update(Device).where(다른_기기, Device.revoked_at.is_(None)).values(revoked_at=지금)
    )
    await session.execute(
        update(RefreshToken)
        .where(다른_토큰, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=지금, revoke_reason=RevokeReason.PASSWORD_CHANGE)
    )
    # 전에 받아 둔 재설정 링크로 방금 정한 비밀번호를 덮어쓰지 못하게 한다.
    await session.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.revoked_at.is_(None),
        )
        .values(revoked_at=지금)
    )
    await session.flush()

    await get_outbox().send(
        Letter(
            to=user.email,
            subject="비밀번호가 바뀌었어요",
            # 링크를 넣지 않는다. 알림 메일에 링크가 있으면 같은 모양의 피싱 메일을 흉내 내기 쉽다.
            body=(
                "Daymo 계정의 비밀번호가 바뀌었어요. 바꾼 기기 말고는 모두 로그아웃됐어요.\n\n"
                "직접 바꾸지 않았다면 Daymo 앱의 로그인 화면에서 '비밀번호를 잊으셨나요?'를 눌러 "
                "바로 비밀번호를 재설정해 주세요."
            ),
        )
    )


# ---------------------------------------------------------------------------
# 이메일 바꾸기
# ---------------------------------------------------------------------------


def _가린_주소(email: str) -> str:
    """알림 메일에 쓰는 새 주소. 앞 한 글자와 도메인만 보인다."""
    앞, _, 도메인 = email.partition("@")
    return f"{앞[:1]}***@{도메인}"


async def request_email_change(
    session: AsyncSession,
    *,
    user: User,
    new_email: str,
    proof: str | None,
    ip: str = "",
) -> None:
    """
    새 주소로 확인 링크를 보낸다. **링크를 누르기 전에는 아무것도 바뀌지 않는다.**

    - 새 주소에 이미 계정이 있어도 같은 응답이다. 링크 대신 "누군가 이 주소로 바꾸려고 했다" 는
      메일이 그 주소로 간다. 가입(`accounts.sign_up`)과 같은 이유다. 응답이 갈리면 로그인한
      사람 누구나 남의 주소를 넣어 보며 가입 여부를 알아낼 수 있다.
    - 지금 주소에는 변경 요청이 있었다고 알린다. 남이 들어와 주소를 바꾸려 하면 주인이 알 수 있다.
    - 새 링크를 보내면서 쓰지 않은 예전 변경 링크를 모두 폐기한다.
    """
    새_주소 = normalize_email(new_email)
    if 새_주소 == user.email:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            message="지금 쓰는 이메일과 같아요.",
            fields={"newEmail": "지금 쓰는 이메일과 같아요."},
        )

    # 아무 주소로나 메일을 보내게 되는 길이다. 계정 기준, 받는 주소 기준, IP 기준으로 센다.
    계정_열쇠 = (throttle.ACCOUNT, throttle.key_for("user", str(user.id)))
    주소_열쇠 = (throttle.ACCOUNT, throttle.key_for("email", 새_주소))
    ip_열쇠 = (throttle.IP, throttle.key_for("ip", ip))
    await throttle.check(ThrottleScope.EMAIL_CHANGE, 계정_열쇠, 주소_열쇠, ip_열쇠)

    await consume_proof(
        session, user_id=user.id, action=SensitiveAction.CHANGE_EMAIL, proof=proof
    )
    await throttle.record(ThrottleScope.EMAIL_CHANGE, 계정_열쇠, 주소_열쇠, ip_열쇠)

    지금 = datetime.now(UTC)
    await session.execute(
        update(EmailChangeToken)
        .where(
            EmailChangeToken.user_id == user.id,
            EmailChangeToken.used_at.is_(None),
            EmailChangeToken.revoked_at.is_(None),
        )
        .values(revoked_at=지금)
    )

    기존 = await _find_by_email(session, 새_주소)
    if 기존 is not None:
        await get_outbox().send(
            Letter(
                to=새_주소,
                subject="누군가 이 주소로 계정 이메일을 바꾸려고 했어요",
                body=(
                    "이미 Daymo 계정이 있는 주소라서 바꾸지 않았어요. "
                    "직접 시도하지 않았다면 이 메일은 무시해도 괜찮아요."
                ),
            )
        )
    else:
        원문, 해시 = new_one_time_token()
        session.add(
            EmailChangeToken(
                user_id=user.id,
                new_email=새_주소,
                token_hash=해시,
                expires_at=지금 + ONE_TIME_TTL,
            )
        )
        await session.flush()
        await get_outbox().send(
            Letter(
                to=새_주소,
                subject="이 주소로 이메일을 바꿀까요?",
                body="Daymo 계정의 이메일을 이 주소로 바꾸려면 아래 링크를 눌러 주세요.",
                link=_link(f"/auth/confirm-email-change?token={원문}"),
                action="이 주소로 바꾸기",
            )
        )

    # 어느 쪽이든 지금 주소에는 같은 알림이 간다. 알림이 갈리면 그것으로 새 주소의 가입 여부를 안다.
    await get_outbox().send(
        Letter(
            to=user.email,
            subject="이메일 변경을 요청했어요",
            body=(
                f"Daymo 계정의 이메일을 {_가린_주소(새_주소)} 로 바꾸는 요청이 있었어요. "
                "새 주소로 보낸 링크를 누르기 전에는 바뀌지 않아요.\n\n"
                "직접 요청하지 않았다면 Daymo 앱에서 비밀번호를 바꿔 주세요."
            ),
        )
    )


async def confirm_email_change(session: AsyncSession, *, token: str) -> None:
    """
    링크의 토큰으로 이메일을 바꾼다. 새 주소를 받을 수 있음을 확인했으니 확인된 주소로 둔다.

    그새 그 주소로 다른 계정이 생겼으면 바꾸지 않는다. 만료와 같은 문구로 답한다.
    """
    지금 = datetime.now(UTC)
    줄 = await session.scalar(
        select(EmailChangeToken)
        .where(EmailChangeToken.token_hash == hash_refresh_token(token))
        .with_for_update()
    )
    if (
        줄 is None
        or 줄.used_at is not None
        or 줄.revoked_at is not None
        or 줄.expires_at <= 지금
    ):
        raise AppError(ErrorCode.VALIDATION_ERROR, message=_LINK_FAILED)

    user = await session.get(User, 줄.user_id)
    if user is None or user.status is not UserStatus.ACTIVE or user.deletion_scheduled_at is not None:
        raise AppError(ErrorCode.VALIDATION_ERROR, message=_LINK_FAILED)

    if await _find_by_email(session, 줄.new_email) is not None:
        raise AppError(ErrorCode.VALIDATION_ERROR, message=_LINK_FAILED)

    예전_주소 = user.email
    try:
        # 확인과 바꾸기 사이에 같은 주소로 가입이 끼어들 수 있다. 그때는 users.email 의
        # 유니크 제약이 막는다. savepoint 안에서 해야 요청 전체가 500 으로 깨지지 않는다.
        async with session.begin_nested():
            user.email = 줄.new_email
            user.email_verified_at = 지금
            await session.flush()
    except IntegrityError:
        raise AppError(ErrorCode.VALIDATION_ERROR, message=_LINK_FAILED) from None

    줄.used_at = 지금
    # 남은 변경 링크와, 예전 주소로 보낸 확인·재설정 링크는 더 쓰지 않는다.
    for 표 in (EmailChangeToken, EmailVerificationToken, PasswordResetToken):
        await session.execute(
            update(표)
            .where(표.user_id == user.id, 표.used_at.is_(None), 표.revoked_at.is_(None))
            .values(revoked_at=지금)
        )
    await session.flush()

    await get_outbox().send(
        Letter(
            to=예전_주소,
            subject="이메일이 바뀌었어요",
            body=(
                f"Daymo 계정의 이메일이 {_가린_주소(user.email)} 로 바뀌었어요. "
                "이제 이 주소로는 로그인할 수 없어요.\n\n"
                "직접 바꾸지 않았다면 support@daymo.xyz 로 알려 주세요."
            ),
        )
    )
