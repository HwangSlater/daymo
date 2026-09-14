import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.errors import AppError, ErrorCode
from app.core.tokens import decode_access_token, hash_refresh_token
from app.models import Device, DevicePlatform, RefreshToken, RevokeReason
from app.services.auth_sessions import (
    MAX_DEVICES,
    end_session,
    revoke_all_for_user,
    rotate_session,
    start_session,
)
from tests.factories import 사람을_넣는다

pytestmark = pytest.mark.anyio


async def 로그인(db, user, 설치_id="설치-1", 이름=None):
    return await start_session(
        db,
        user_id=user.id,
        installation_id=설치_id,
        platform=DevicePlatform.IOS,
        display_name=이름 or f"기기 {설치_id}",
    )


async def 살아있는_토큰_수(db, user) -> int:
    return await db.scalar(
        select(func.count())
        .select_from(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    )


# ---------------------------------------------------------------------------
# 발급
# ---------------------------------------------------------------------------


async def test_로그인하면_두_토큰이_나온다(db):
    user = await 사람을_넣는다(db)

    세션 = await 로그인(db, user)

    assert 세션.access_token and 세션.refresh_token
    claims = decode_access_token(세션.access_token)
    assert claims["sub"] == str(user.id)
    assert claims["sid"] == str(세션.device_id)


async def test_access_token에_이름과_이메일을_넣지_않는다(db):
    """
    토큰은 앱 안에 남고 로그에도 실릴 수 있다. 권한도 넣지 않는다. 요청
    시점의 DB 가 원본이라, 박아 두면 빼앗은 권한이 15분 동안 살아 있게 된다.
    """
    user = await 사람을_넣는다(db, "하늘")
    세션 = await 로그인(db, user)

    claims = decode_access_token(세션.access_token)

    assert set(claims) == {"iss", "sub", "iat", "exp", "jti", "typ", "sid"}
    assert "하늘" not in str(claims)
    assert user.email not in str(claims)


async def test_갱신_토큰_원문은_저장되지_않는다(db):
    user = await 사람을_넣는다(db)

    세션 = await 로그인(db, user)

    저장된 = await db.scalar(
        select(RefreshToken.token_hash).where(RefreshToken.user_id == user.id)
    )
    assert 저장된 != 세션.refresh_token
    assert 저장된 == hash_refresh_token(세션.refresh_token)


async def test_같은_기기로_다시_로그인하면_기기가_쌓이지_않는다(db):
    """목록에 같은 기기가 쌓이면 사용자가 무엇을 끊어야 할지 알 수 없다."""
    user = await 사람을_넣는다(db)
    첫_세션 = await 로그인(db, user, "설치-1")

    둘째_세션 = await 로그인(db, user, "설치-1")

    assert 첫_세션.device_id == 둘째_세션.device_id
    assert await db.scalar(
        select(func.count()).select_from(Device).where(Device.user_id == user.id)
    ) == 1
    # 예전 세션은 끊긴다. 같은 기기에 두 벌이 살아 있을 이유가 없다.
    assert await 살아있는_토큰_수(db, user) == 1


# ---------------------------------------------------------------------------
# 회전
# ---------------------------------------------------------------------------


async def test_갱신하면_토큰이_바뀐다(db):
    user = await 사람을_넣는다(db)
    첫_세션 = await 로그인(db, user)

    새_세션 = await rotate_session(db, 첫_세션.refresh_token)

    assert 새_세션.refresh_token != 첫_세션.refresh_token
    assert await 살아있는_토큰_수(db, user) == 1


async def test_갈아_끼운_토큰은_바로_못_쓴다(db):
    user = await 사람을_넣는다(db)
    첫_세션 = await 로그인(db, user)
    await rotate_session(db, 첫_세션.refresh_token)

    with pytest.raises(AppError) as 잡힌_것:
        await rotate_session(db, 첫_세션.refresh_token)

    assert 잡힌_것.value.code is ErrorCode.UNAUTHENTICATED


async def test_재사용이_보이면_그_가족을_전부_끊는다(db):
    """
    훔친 쪽과 원래 쪽 중 누가 지금 들고 있는지 알 수 없다. 둘 다 끊고 다시
    로그인하게 하는 것이 유일하게 안전한 선택이다.
    """
    user = await 사람을_넣는다(db)
    첫_세션 = await 로그인(db, user)
    현재_세션 = await rotate_session(db, 첫_세션.refresh_token)

    # 훔쳐 간 예전 토큰이 다시 온다.
    with pytest.raises(AppError):
        await rotate_session(db, 첫_세션.refresh_token)

    # 지금 쓰던 토큰까지 죽어야 한다.
    assert await 살아있는_토큰_수(db, user) == 0
    with pytest.raises(AppError):
        await rotate_session(db, 현재_세션.refresh_token)


async def test_재사용으로_끊긴_이유가_남는다(db):
    """나중에 무슨 일이었는지 되짚으려면 이유가 있어야 한다."""
    user = await 사람을_넣는다(db)
    첫_세션 = await 로그인(db, user)
    await rotate_session(db, 첫_세션.refresh_token)
    with pytest.raises(AppError):
        await rotate_session(db, 첫_세션.refresh_token)

    이유들 = (
        await db.execute(select(RefreshToken.revoke_reason).where(RefreshToken.user_id == user.id))
    ).scalars().all()

    assert RevokeReason.REUSE_DETECTED in 이유들


async def test_처음_끊은_이유를_덮어쓰지_않는다(db):
    """
    갈아 끼운 토큰은 ROTATED 로 남아야 한다. 나중 사건이 앞선 기록을
    덮으면 사슬을 되짚을 수 없다.
    """
    user = await 사람을_넣는다(db)
    첫_세션 = await 로그인(db, user)
    await rotate_session(db, 첫_세션.refresh_token)
    첫_토큰_해시 = hash_refresh_token(첫_세션.refresh_token)

    with pytest.raises(AppError):
        await rotate_session(db, 첫_세션.refresh_token)

    첫_토큰 = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == 첫_토큰_해시)
    )
    assert 첫_토큰.revoke_reason is RevokeReason.ROTATED


async def test_사슬이_이어진다(db):
    """replaced_by 를 따라가면 언제 갈렸는지 보인다."""
    user = await 사람을_넣는다(db)
    첫_세션 = await 로그인(db, user)
    await rotate_session(db, 첫_세션.refresh_token)

    첫_토큰 = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(첫_세션.refresh_token)
        )
    )
    assert 첫_토큰.replaced_by is not None


async def test_가족은_회전해도_그대로다(db):
    user = await 사람을_넣는다(db)
    첫_세션 = await 로그인(db, user)
    await rotate_session(db, 첫_세션.refresh_token)

    가족들 = set(
        (
            await db.execute(
                select(RefreshToken.token_family_id).where(RefreshToken.user_id == user.id)
            )
        ).scalars().all()
    )
    assert len(가족들) == 1


async def test_새_로그인은_새_가족으로_시작한다(db):
    """예전 가족이 털렸더라도 이번 로그인이 함께 끊기지 않는다."""
    user = await 사람을_넣는다(db)
    await 로그인(db, user, "설치-1")
    await 로그인(db, user, "설치-2")

    가족들 = set(
        (
            await db.execute(
                select(RefreshToken.token_family_id).where(RefreshToken.user_id == user.id)
            )
        ).scalars().all()
    )
    assert len(가족들) == 2


async def test_만료된_토큰은_거부한다(db):
    user = await 사람을_넣는다(db)
    세션 = await 로그인(db, user)
    토큰 = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(세션.refresh_token))
    )
    토큰.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.flush()

    with pytest.raises(AppError):
        await rotate_session(db, 세션.refresh_token)


async def test_쓰는_동안_기한이_늘어난다(db):
    """90일은 마지막 정상 사용 시점부터다."""
    user = await 사람을_넣는다(db)
    세션 = await 로그인(db, user)
    첫_기한 = await db.scalar(
        select(RefreshToken.expires_at).where(
            RefreshToken.token_hash == hash_refresh_token(세션.refresh_token)
        )
    )

    새_세션 = await rotate_session(db, 세션.refresh_token)

    새_기한 = await db.scalar(
        select(RefreshToken.expires_at).where(
            RefreshToken.token_hash == hash_refresh_token(새_세션.refresh_token)
        )
    )
    assert 새_기한 > 첫_기한


async def test_모르는_토큰은_거부한다(db):
    with pytest.raises(AppError):
        await rotate_session(db, "이런 토큰은 없다")


# ---------------------------------------------------------------------------
# 기기 한도
# ---------------------------------------------------------------------------


async def test_다섯_대까지는_그대로_둔다(db):
    user = await 사람을_넣는다(db)

    세션들 = [await 로그인(db, user, f"설치-{i}") for i in range(MAX_DEVICES)]

    assert all(not s.ended_devices for s in 세션들)
    assert await 살아있는_토큰_수(db, user) == MAX_DEVICES


async def test_여섯_번째는_가장_오래된_기기를_끊는다(db):
    user = await 사람을_넣는다(db)
    for i in range(MAX_DEVICES):
        await 로그인(db, user, f"설치-{i}", 이름=f"기기 {i}")

    새_세션 = await 로그인(db, user, "설치-새것", 이름="새 기기")

    assert [d.display_name for d in 새_세션.ended_devices] == ["기기 0"]
    assert await 살아있는_토큰_수(db, user) == MAX_DEVICES


async def test_지금_로그인하는_기기는_끊지_않는다(db):
    """쓰고 있는 기기가 끊기면 사용자는 무슨 일인지 알 수 없다."""
    user = await 사람을_넣는다(db)
    for i in range(MAX_DEVICES):
        await 로그인(db, user, f"설치-{i}")

    새_세션 = await 로그인(db, user, "설치-새것")

    살아있는_기기 = await db.scalar(
        select(func.count())
        .select_from(Device)
        .where(Device.user_id == user.id, Device.revoked_at.is_(None), Device.id == 새_세션.device_id)
    )
    assert 살아있는_기기 == 1


async def test_한도를_넘겨_끊긴_기기의_마지막_사용_시각을_알려_준다(db):
    """로그인 응답에 실어 사용자가 무엇이 끊겼는지 알게 한다."""
    user = await 사람을_넣는다(db)
    for i in range(MAX_DEVICES):
        await 로그인(db, user, f"설치-{i}")

    새_세션 = await 로그인(db, user, "설치-새것")

    (끊긴,) = 새_세션.ended_devices
    assert isinstance(끊긴.last_seen_at, datetime)


async def test_한도를_넘겨_끊긴_이유가_남는다(db):
    user = await 사람을_넣는다(db)
    for i in range(MAX_DEVICES):
        await 로그인(db, user, f"설치-{i}")

    await 로그인(db, user, "설치-새것")

    이유들 = (
        await db.execute(select(RefreshToken.revoke_reason).where(RefreshToken.user_id == user.id))
    ).scalars().all()
    assert RevokeReason.DEVICE_LIMIT in 이유들


# ---------------------------------------------------------------------------
# 끊기
# ---------------------------------------------------------------------------


async def test_로그아웃하면_그_토큰만_끊긴다(db):
    user = await 사람을_넣는다(db)
    첫_세션 = await 로그인(db, user, "설치-1")
    둘째_세션 = await 로그인(db, user, "설치-2")

    await end_session(db, 첫_세션.refresh_token)

    assert await 살아있는_토큰_수(db, user) == 1
    await rotate_session(db, 둘째_세션.refresh_token)


async def test_모르는_토큰으로_로그아웃해도_조용하다(db):
    """
    여기서 오류를 내면 어떤 토큰이 살아 있는지 알려 주는 셈이 된다.
    """
    await end_session(db, "이런 토큰은 없다")


async def test_비밀번호_재설정은_모든_세션을_끊는다(db):
    """
    비밀번호를 다시 정하는 상황은 대개 남이 들어와 있을 수 있다고 의심하는
    상황이다. 새 비밀번호만 주고 기존 세션을 두면 침입자가 그대로 남는다.
    """
    user = await 사람을_넣는다(db)
    await 로그인(db, user, "설치-1")
    await 로그인(db, user, "설치-2")

    await revoke_all_for_user(db, user.id, reason=RevokeReason.PASSWORD_RESET)

    assert await 살아있는_토큰_수(db, user) == 0


async def test_다른_사람의_세션은_건드리지_않는다(db):
    나 = await 사람을_넣는다(db)
    남 = await 사람을_넣는다(db, "다온")
    await 로그인(db, 나)
    남의_세션 = await 로그인(db, 남)

    await revoke_all_for_user(db, 나.id, reason=RevokeReason.PASSWORD_RESET)

    assert await 살아있는_토큰_수(db, 남) == 1
    await rotate_session(db, 남의_세션.refresh_token)


async def test_없는_사용자를_끊어도_터지지_않는다(db):
    await revoke_all_for_user(db, uuid.uuid4(), reason=RevokeReason.ADMIN)
