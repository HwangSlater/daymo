import hashlib
import hmac
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.errors import AppError, ErrorCode
from app.models import ThrottleCounter, ThrottleScope


# **세는 일은 요청 transaction 바깥에서 한다.**
#
# 로그인 실패는 요청이 401 로 끝나는데, 그 요청의 transaction 은 되돌려진다.
# 같은 세션에 실패를 적으면 그 기록도 함께 사라져서 횟수가 영영 쌓이지
# 않는다. 그러면 제한이 있는 것처럼 보이지만 실제로는 아무것도 막지 못한다.
#
# 그래서 이 모듈만 자기 연결을 따로 열고 바로 commit 한다. Redis 를 쓰지
# 않기로 한 대신 치러야 하는 값이다.


@asynccontextmanager
async def _own_session():
    async with get_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@dataclass(frozen=True)
class Rule:
    """
    한 종류를 어떻게 세는지.

    `window` 안에서 `allowance` 번까지는 그냥 통과한다. 그 뒤부터 지연이
    붙고, 지연은 실패가 쌓일수록 두 배씩 늘어 `max_block` 에서 멈춘다.
    """

    window: timedelta
    # 계정 하나 기준으로 봐주는 횟수.
    allowance: int
    # IP 하나 기준으로 봐주는 횟수. **계정 기준보다 훨씬 커야 한다.**
    # 통신사 NAT 와 사무실 회선 뒤에서는 수백 명이 같은 IP 로 나온다.
    # 계정과 같은 값을 쓰면 남이 다섯 번 틀린 것 때문에 내가 못 들어간다.
    # 이 값은 한 곳에서 여러 계정을 찍어 보는 것만 잡을 만큼만 크다.
    ip_allowance: int
    first_delay: timedelta
    max_block: timedelta
    # 요청 사이 최소 간격. 재전송처럼 연타를 막아야 하는 곳에만 쓴다.
    # **계정 기준에만 건다.** IP 에 걸면 같은 와이파이나 통신사 NAT 뒤의
    # 서로 다른 두 사람이 1분 안에 가입할 때 두 번째 사람이 막힌다.
    min_interval: timedelta | None = None


# 로그인 실패는 계정 hash 와 IP 를 함께 기준으로 15분 동안 5회부터 지연을
# 붙이고 최대 15분까지 막는다(docs/development/03-api-specification.md 2장).
#
# 지연을 응답을 늦추는 방식으로 하지 않는다. 그러면 워커가 그동안 묶여서,
# 2 vCPU 서버에서는 느리게 만드는 것이 곧 서비스를 멈추는 방법이 된다.
# 대신 429 와 다시 시도할 수 있는 시각을 돌려준다.
RULES: dict[ThrottleScope, Rule] = {
    ThrottleScope.LOGIN: Rule(
        window=timedelta(minutes=15),
        allowance=5,
        ip_allowance=50,
        first_delay=timedelta(seconds=1),
        max_block=timedelta(minutes=15),
    ),
    ThrottleScope.REAUTH: Rule(
        window=timedelta(minutes=15),
        allowance=5,
        ip_allowance=50,
        first_delay=timedelta(seconds=1),
        max_block=timedelta(minutes=15),
    ),
    ThrottleScope.SIGNUP: Rule(
        window=timedelta(hours=1),
        allowance=5,
        ip_allowance=20,
        first_delay=timedelta(seconds=30),
        max_block=timedelta(minutes=30),
    ),
    # 재전송은 요청 사이 60초, 하루 5회다.
    ThrottleScope.EMAIL_VERIFICATION: Rule(
        window=timedelta(days=1),
        allowance=5,
        ip_allowance=50,
        first_delay=timedelta(minutes=10),
        max_block=timedelta(hours=6),
        min_interval=timedelta(seconds=60),
    ),
    ThrottleScope.PASSWORD_RESET: Rule(
        window=timedelta(days=1),
        allowance=5,
        ip_allowance=50,
        first_delay=timedelta(minutes=10),
        max_block=timedelta(hours=6),
        min_interval=timedelta(seconds=60),
    ),
    # 이메일 변경 확인 메일도 재전송과 같다. 계정 기준과 받는 주소 기준을 함께 센다.
    ThrottleScope.EMAIL_CHANGE: Rule(
        window=timedelta(days=1),
        allowance=5,
        ip_allowance=50,
        first_delay=timedelta(minutes=10),
        max_block=timedelta(hours=6),
        min_interval=timedelta(seconds=60),
    ),
}

# 한 열쇠가 계정 기준인지 IP 기준인지. 봐주는 횟수가 다르다.
ACCOUNT = "account"
IP = "ip"


def key_for(*parts: str | None) -> str:
    """
    세는 기준을 해시로 바꾼다.

    이메일과 IP 원문을 표에 넣지 않는다. 둘 다 개인정보이고 이 표는 실패한
    시도까지 남기는 곳이라, 원문을 두면 가입하지도 않은 사람의 이메일이 쌓인다.
    pepper 를 섞으므로 DB 만 봐서는 되돌릴 수 없다.
    """
    pepper = get_settings().refresh_token_pepper
    재료 = "\x1f".join(조각 or "" for 조각 in parts)
    return hmac.new(pepper.encode(), 재료.encode(), hashlib.sha256).hexdigest()


def _봐주는_횟수(rule: Rule, 종류: str) -> int:
    return rule.ip_allowance if 종류 == IP else rule.allowance


def _막힌_동안(rule: Rule, attempts: int, 종류: str = ACCOUNT) -> timedelta:
    """
    넘긴 횟수만큼 두 배씩. 최대치에서 멈춘다.

    지수를 먼저 자른다. 수천 번 두드리면 `2**n` 이 넘쳐서 계산 자체가
    터지고, 그러면 제한이 500 오류로 바뀐다. 막으려던 요청이 서버를
    흔드는 방법이 되는 셈이다.
    """
    넘긴_수 = attempts - _봐주는_횟수(rule, 종류)
    if 넘긴_수 < 0:
        return timedelta(0)

    최대_배수 = rule.max_block / rule.first_delay
    if 넘긴_수 > 40 or 2**넘긴_수 >= 최대_배수:
        return rule.max_block
    return min(rule.first_delay * (2**넘긴_수), rule.max_block)


async def _줄(session: AsyncSession, scope: ThrottleScope, key: str) -> ThrottleCounter | None:
    return await session.scalar(
        select(ThrottleCounter).where(
            ThrottleCounter.scope == scope, ThrottleCounter.key_hash == key
        )
    )


async def check(scope: ThrottleScope, *keys: tuple[str, str]) -> None:
    """
    지금 받아도 되는지 본다. 안 되면 `429 RATE_LIMITED` 다.

    **계정이 있는지 없는지를 드러내지 않는다.** 어떤 기준에 걸렸는지도
    알려 주지 않는다. 다시 시도할 수 있는 시각만 준다.
    """
    rule = RULES[scope]
    지금 = datetime.now(UTC)

    async with _own_session() as session:
        for 종류, key in keys:
            await _한_열쇠를_본다(session, rule, scope, key, 지금, 종류)


async def _한_열쇠를_본다(
    session: AsyncSession,
    rule: Rule,
    scope: ThrottleScope,
    key: str,
    지금: datetime,
    종류: str,
) -> None:
    줄 = await _줄(session, scope, key)
    if 줄 is None:
        return
    if 지금 - 줄.window_started_at >= rule.window:
        return  # 창이 지났다. 곧 새로 시작된다.

    if 줄.blocked_until and 줄.blocked_until > 지금:
        _막는다(줄.blocked_until, 지금)

    if (
        종류 == ACCOUNT
        and rule.min_interval
        and 줄.last_attempt_at
        and 지금 - 줄.last_attempt_at < rule.min_interval
    ):
        _막는다(줄.last_attempt_at + rule.min_interval, 지금)


def _막는다(다시_되는_때: datetime, 지금: datetime) -> None:
    남은_초 = max(1, int((다시_되는_때 - 지금).total_seconds()))
    raise AppError(
        ErrorCode.RATE_LIMITED,
        message=f"너무 자주 시도했어요. {남은_초}초 뒤에 다시 시도해 주세요.",
        fields={"retryAfterSeconds": str(남은_초)},
    )


async def record(scope: ThrottleScope, *keys: tuple[str, str]) -> None:
    """
    시도 한 번을 적는다.

    실패만 세는 것이 아니라 `min_interval` 이 있는 종류는 성공도 센다.
    재전송은 성공했기 때문에 막아야 하는 것이다.
    """
    rule = RULES[scope]
    지금 = datetime.now(UTC)

    async with _own_session() as session:
        for 종류, key in keys:
            await _한_번_적는다(session, rule, scope, key, 지금, 종류)


async def _한_번_적는다(
    session: AsyncSession,
    rule: Rule,
    scope: ThrottleScope,
    key: str,
    지금: datetime,
    종류: str,
) -> None:
    줄 = await _줄(session, scope, key)
    if 줄 is None:
        # `attempts=0` 을 명시한다. 칼럼 기본값은 INSERT 할 때 채워지는 것이라
        # 그 전에 파이썬 쪽에서 더하면 None 에 1을 더하게 된다.
        줄 = ThrottleCounter(
            scope=scope, key_hash=key, window_started_at=지금, attempts=0
        )
        session.add(줄)
    elif 지금 - 줄.window_started_at >= rule.window:
        # 창이 지났으면 처음부터 다시 센다.
        줄.window_started_at = 지금
        줄.attempts = 0
        줄.blocked_until = None

    줄.attempts += 1
    줄.last_attempt_at = 지금
    막는_시간 = _막힌_동안(rule, 줄.attempts, 종류)
    if 막는_시간:
        줄.blocked_until = 지금 + 막는_시간

    await session.flush()


async def reset(scope: ThrottleScope, *keys: str) -> None:
    """
    성공했으니 이 기준의 실패 기록을 지운다.

    **계정 기준만 지우고 IP 기준은 남긴다.** 한 IP 에서 여러 계정을 찍어
    보는 공격은 그중 하나가 맞았다고 멈춰야 할 이유가 없다. 부르는 쪽이
    계정 열쇠만 넘긴다.
    """
    if not keys:
        return
    async with _own_session() as session:
        await session.execute(
            delete(ThrottleCounter).where(
                ThrottleCounter.scope == scope, ThrottleCounter.key_hash.in_(keys)
            )
        )


async def purge_expired(session: AsyncSession, *, now: datetime | None = None) -> int:
    """
    창이 지나고 막힘도 풀린 줄을 지운다. 정기 작업에서 부른다.

    쌓아 둘 이유가 없다. 세는 데 쓰지 않는 줄은 개인정보를 해시로 들고 있는
    부담만 남는다.
    """
    지금 = now or datetime.now(UTC)
    가장_긴_창 = max(rule.window for rule in RULES.values())
    지운_것 = await session.execute(
        delete(ThrottleCounter).where(
            ThrottleCounter.window_started_at < 지금 - 가장_긴_창,
            or_(
                ThrottleCounter.blocked_until.is_(None),
                ThrottleCounter.blocked_until <= 지금,
            ),
        )
    )
    await session.flush()
    return 지운_것.rowcount or 0
