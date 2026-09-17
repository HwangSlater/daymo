import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import passwords
from app.services import throttle
from app.core.errors import AppError, ErrorCode
from app.core.tokens import hash_refresh_token, new_one_time_token
from app.models import ReauthProof, SensitiveAction, ThrottleScope, User

# 증표는 짧게 산다. 화면을 열어 두고 자리를 비운 사이에 쓰이지 않게 한다.
PROOF_TTL = timedelta(minutes=5)

# 증표가 없거나 못 쓰게 됐을 때. 어느 쪽인지는 나눠 말하지 않는다.
_PROOF_REQUIRED = "본인 확인이 만료됐어요. 비밀번호(또는 소셜 계정)로 다시 확인해 주세요."


async def issue_proof(
    session: AsyncSession,
    *,
    user: User,
    action: SensitiveAction,
    password: str | None,
    ip: str = "",
) -> str:
    """
    민감한 작업 하나에 쓸 증표를 발급한다.

    이메일 계정은 현재 비밀번호로 확인한다. 비밀번호가 없는(소셜 로그인으로만 가입한)
    계정은 여기서 증표를 주지 않고, 연결된 제공자로 다시 로그인해 받는다
    (`app.services.oauth.flow.reauth_with_provider`). 조용히 통과시키면 그 계정만
    재인증 없이 계정 삭제까지 가능해진다.
    """
    if not user.password_hash:
        raise AppError(
            ErrorCode.FORBIDDEN,
            message="이 계정은 비밀번호가 없어요. 가입할 때 쓴 소셜 계정으로 본인 확인을 해 주세요.",
        )

    # 로그인과 같은 한도로 센다. 없으면 access token 하나만 손에 넣어도
    # 비밀번호를 끝없이 맞혀 볼 수 있다.
    계정_열쇠 = (throttle.ACCOUNT, throttle.key_for("user", str(user.id)))
    ip_열쇠 = (throttle.IP, throttle.key_for("ip", ip))
    await throttle.check(ThrottleScope.REAUTH, 계정_열쇠, ip_열쇠)

    if not password or not passwords.verify(user.password_hash, password):
        await throttle.record(ThrottleScope.REAUTH, 계정_열쇠, ip_열쇠)
        # 401 이 아니라 403 이다. 로그인은 멀쩡하고 이 작업만 못 하는 것이다.
        # 401 로 답하면 앱은 토큰이 만료된 줄 알고 갱신을 시도하다 로그아웃한다.
        raise AppError(ErrorCode.FORBIDDEN, message="비밀번호를 확인해 주세요.")

    await throttle.reset(ThrottleScope.REAUTH, 계정_열쇠[1])
    return await new_proof(session, user=user, action=action)


async def new_proof(session: AsyncSession, *, user: User, action: SensitiveAction) -> str:
    """확인을 마친 사람에게 증표를 만든다. 확인은 부르는 쪽이 한다."""
    원문, 해시 = new_one_time_token()
    session.add(
        ReauthProof(
            user_id=user.id,
            action=action,
            nonce=secrets.token_urlsafe(16),
            token_hash=해시,
            expires_at=datetime.now(UTC) + PROOF_TTL,
        )
    )
    await session.flush()
    return 원문


async def consume_proof(
    session: AsyncSession, *, user_id: uuid.UUID, action: SensitiveAction, proof: str | None
) -> None:
    """
    증표를 쓴다. 한 번 쓰면 끝이다.

    **작업 종류와 사용자가 모두 맞아야 한다.** 계정 삭제용으로 받은 증표로
    이메일을 바꿀 수 없고, 남의 증표로 내 작업을 할 수 없다. 하나를 받아
    여러 곳에 돌려 쓸 수 있으면 재인증을 요구한 의미가 없다.
    """
    if not proof:
        raise AppError(ErrorCode.FORBIDDEN, message=_PROOF_REQUIRED)

    지금 = datetime.now(UTC)
    줄 = await session.scalar(
        select(ReauthProof).where(ReauthProof.token_hash == hash_refresh_token(proof))
    )
    if (
        줄 is None
        or 줄.used_at is not None
        or 줄.expires_at <= 지금
        or 줄.user_id != user_id
        or 줄.action is not action
    ):
        # 어느 조건에 걸렸는지 나눠 말하지 않는다. 만료인지 종류가 다른지
        # 알려 주면 증표를 맞춰 보는 데 힌트가 된다.
        raise AppError(ErrorCode.FORBIDDEN, message=_PROOF_REQUIRED)

    줄.used_at = 지금
    await session.flush()
