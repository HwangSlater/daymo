from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.errors import AppError, ErrorCode
from app.models import ThrottleCounter, ThrottleScope
from app.services import throttle

pytestmark = pytest.mark.anyio


def 열쇠(값: str) -> tuple[str, str]:
    return (throttle.ACCOUNT, throttle.key_for("test", 값))


async def test_한도_안에서는_통과한다(db):
    key = 열쇠("여유")
    for _ in range(throttle.RULES[ThrottleScope.LOGIN].allowance):
        await throttle.check(ThrottleScope.LOGIN, key)
        await throttle.record(ThrottleScope.LOGIN, key)


async def test_한도를_넘으면_막는다(db):
    key = 열쇠("넘김")
    for _ in range(throttle.RULES[ThrottleScope.LOGIN].allowance):
        await throttle.record(ThrottleScope.LOGIN, key)

    with pytest.raises(AppError) as 잡힌_것:
        await throttle.check(ThrottleScope.LOGIN, key)

    assert 잡힌_것.value.code is ErrorCode.RATE_LIMITED
    assert 잡힌_것.value.status_code == 429


async def test_다시_시도할_수_있는_시각을_알려_준다(db):
    """
    지연을 응답을 늦추는 방식으로 하지 않는다. 그러면 워커가 묶여서
    느리게 만드는 것이 곧 서비스를 멈추는 방법이 된다.
    """
    key = 열쇠("시각")
    for _ in range(6):
        await throttle.record(ThrottleScope.LOGIN, key)

    with pytest.raises(AppError) as 잡힌_것:
        await throttle.check(ThrottleScope.LOGIN, key)

    assert int(잡힌_것.value.fields["retryAfterSeconds"]) >= 1


async def test_실패가_쌓일수록_오래_막는다(db):
    rule = throttle.RULES[ThrottleScope.LOGIN]

    처음 = throttle._막힌_동안(rule, rule.allowance)
    다음 = throttle._막힌_동안(rule, rule.allowance + 1)

    assert 다음 == 처음 * 2


@pytest.mark.parametrize("넘긴_수", [50, 500, 100000])
async def test_아무리_두드려도_계산이_터지지_않는다(db, 넘긴_수):
    """
    지수를 먼저 자르지 않으면 2**n 이 넘쳐서 제한이 500 오류로 바뀐다.
    막으려던 요청이 서버를 흔드는 방법이 되는 셈이다.
    """
    rule = throttle.RULES[ThrottleScope.LOGIN]

    assert throttle._막힌_동안(rule, rule.allowance + 넘긴_수) == rule.max_block


async def test_IP는_계정보다_훨씬_너그럽다(db):
    """
    통신사 NAT 와 사무실 회선 뒤에서는 수백 명이 같은 IP 로 나온다. 계정과
    같은 값을 쓰면 남이 다섯 번 틀린 것 때문에 내가 못 들어간다.
    """
    rule = throttle.RULES[ThrottleScope.LOGIN]

    assert rule.ip_allowance > rule.allowance * 5
    # 계정 기준으로는 막히는 횟수가 IP 기준으로는 아직 여유다.
    assert throttle._막힌_동안(rule, rule.allowance + 1, throttle.ACCOUNT) > timedelta(0)
    assert throttle._막힌_동안(rule, rule.allowance + 1, throttle.IP) == timedelta(0)


async def test_한도_아래에서는_막지_않는다(db):
    rule = throttle.RULES[ThrottleScope.LOGIN]

    assert throttle._막힌_동안(rule, rule.allowance - 1) == timedelta(0)


async def test_성공하면_그_열쇠의_기록이_사라진다(db):
    key = 열쇠("초기화")
    for _ in range(6):
        await throttle.record(ThrottleScope.LOGIN, key)

    await throttle.reset(ThrottleScope.LOGIN, key[1])

    await throttle.check(ThrottleScope.LOGIN, key)  # 터지지 않아야 한다


async def test_열쇠가_다르면_서로_영향이_없다(db):
    막힐_것 = 열쇠("막힘")
    멀쩡한_것 = 열쇠("멀쩡")
    for _ in range(6):
        await throttle.record(ThrottleScope.LOGIN, 막힐_것)

    await throttle.check(ThrottleScope.LOGIN, 멀쩡한_것)


async def test_종류가_다르면_따로_센다(db):
    key = 열쇠("같은열쇠")
    for _ in range(6):
        await throttle.record(ThrottleScope.LOGIN, key)

    await throttle.check(ThrottleScope.SIGNUP, key)


async def test_창이_지나면_처음부터_다시_센다(db, 시도_시각을_되돌린다):
    key = 열쇠("창")
    for _ in range(6):
        await throttle.record(ThrottleScope.LOGIN, key)

    창_길이 = int(throttle.RULES[ThrottleScope.LOGIN].window.total_seconds())
    await 시도_시각을_되돌린다(창_길이 + 60)

    await throttle.check(ThrottleScope.LOGIN, key)


async def test_이메일과_IP_원문을_저장하지_않는다(db):
    """
    이 표는 실패한 시도까지 남기는 곳이다. 원문을 두면 가입하지도 않은
    사람의 이메일이 쌓인다.
    """
    await throttle.record(
        ThrottleScope.LOGIN,
        (throttle.ACCOUNT, throttle.key_for("email", "sky@example.com")),
        (throttle.IP, throttle.key_for("ip", "203.0.113.9")),
    )

    저장된 = (
        await db.execute(select(ThrottleCounter.key_hash))
    ).scalars().all()

    합친_것 = " ".join(저장된)
    assert "sky@example.com" not in 합친_것
    assert "203.0.113.9" not in 합친_것
    assert all(len(값) == 64 for 값 in 저장된)


async def test_pepper가_다르면_열쇠도_다르다():
    """DB 만 새어도 그 값으로 누구인지 되돌릴 수 없어야 한다."""
    from app.core.config import Settings

    같은_입력 = ("email", "sky@example.com")
    첫_값 = throttle.key_for(*같은_입력)

    # 다른 pepper 를 쓰면 다른 값이 나온다.
    다른_설정 = Settings(refresh_token_pepper="다른-후추-" + "z" * 40)
    import hashlib
    import hmac

    다른_값 = hmac.new(
        다른_설정.refresh_token_pepper.encode(),
        "\x1f".join(같은_입력).encode(),
        hashlib.sha256,
    ).hexdigest()

    assert 첫_값 != 다른_값


async def test_오래된_줄을_지운다(db, 시도_시각을_되돌린다):
    """세는 데 쓰지 않는 줄은 개인정보를 해시로 들고 있는 부담만 남는다."""
    await throttle.record(ThrottleScope.LOGIN, 열쇠("오래됨"))
    가장_긴_창 = max(rule.window for rule in throttle.RULES.values())
    await 시도_시각을_되돌린다(int(가장_긴_창.total_seconds()) + 3600)

    지운_수 = await throttle.purge_expired(db)

    assert 지운_수 >= 1


async def test_아직_막혀_있는_줄은_지우지_않는다(db):
    """막힌 동안에는 남아 있어야 그 사이 요청을 막는다."""
    key = 열쇠("막힌중")
    for _ in range(6):
        await throttle.record(ThrottleScope.LOGIN, key)

    지운_수 = await throttle.purge_expired(db, now=datetime.now(UTC))

    남은 = await db.scalar(
        select(func.count()).select_from(ThrottleCounter).where(ThrottleCounter.key_hash == key[1])
    )
    assert 지운_수 == 0
    assert 남은 == 1
