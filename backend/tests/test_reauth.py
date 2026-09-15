import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core import passwords
from app.core.errors import AppError, ErrorCode
from app.core.tokens import hash_refresh_token
from app.models import ReauthProof, SensitiveAction, User
from app.services.reauth import consume_proof, issue_proof
from tests.factories import 사람을_넣는다

pytestmark = pytest.mark.anyio

비밀번호 = "산책하는 오후 7시"


async def 비밀번호가_있는_사람(db) -> User:
    user = await 사람을_넣는다(db)
    user.password_hash = passwords.hash_password(비밀번호)
    await db.flush()
    return user


async def test_비밀번호가_맞으면_증표가_나온다(db):
    user = await 비밀번호가_있는_사람(db)

    증표 = await issue_proof(
        db, user=user, action=SensitiveAction.DELETE_ACCOUNT, password=비밀번호
    )

    await consume_proof(
        db, user_id=user.id, action=SensitiveAction.DELETE_ACCOUNT, proof=증표
    )


async def test_비밀번호가_틀리면_증표를_주지_않는다(db):
    user = await 비밀번호가_있는_사람(db)

    with pytest.raises(AppError) as 잡힌_것:
        await issue_proof(
            db, user=user, action=SensitiveAction.DELETE_ACCOUNT, password="틀린 비밀번호다"
        )

    assert 잡힌_것.value.code is ErrorCode.FORBIDDEN


async def test_비밀번호가_없는_계정은_증표를_받지_못한다(db):
    """
    OAuth 로만 가입한 계정은 provider 재로그인으로 확인해야 하는데 그 경로가
    아직 없다. 조용히 통과시키면 그 계정만 재인증 없이 계정 삭제까지 된다.
    """
    user = await 사람을_넣는다(db)

    with pytest.raises(AppError) as 잡힌_것:
        await issue_proof(
            db, user=user, action=SensitiveAction.DELETE_ACCOUNT, password=None
        )

    assert 잡힌_것.value.code is ErrorCode.FORBIDDEN


async def test_한_번_쓰면_끝이다(db):
    user = await 비밀번호가_있는_사람(db)
    증표 = await issue_proof(
        db, user=user, action=SensitiveAction.CHANGE_EMAIL, password=비밀번호
    )
    await consume_proof(db, user_id=user.id, action=SensitiveAction.CHANGE_EMAIL, proof=증표)

    with pytest.raises(AppError):
        await consume_proof(
            db, user_id=user.id, action=SensitiveAction.CHANGE_EMAIL, proof=증표
        )


async def test_다른_작업에는_쓸_수_없다(db):
    """
    계정 삭제용으로 받은 증표로 이메일을 바꿀 수 없다. 하나를 받아 여러
    곳에 돌려 쓸 수 있으면 재인증을 요구한 의미가 없다.
    """
    user = await 비밀번호가_있는_사람(db)
    증표 = await issue_proof(
        db, user=user, action=SensitiveAction.DELETE_ACCOUNT, password=비밀번호
    )

    with pytest.raises(AppError):
        await consume_proof(
            db, user_id=user.id, action=SensitiveAction.CHANGE_EMAIL, proof=증표
        )


async def test_남의_증표로_내_작업을_할_수_없다(db):
    남 = await 비밀번호가_있는_사람(db)
    나 = await 사람을_넣는다(db, "다온")
    남의_증표 = await issue_proof(
        db, user=남, action=SensitiveAction.DELETE_ACCOUNT, password=비밀번호
    )

    with pytest.raises(AppError):
        await consume_proof(
            db, user_id=나.id, action=SensitiveAction.DELETE_ACCOUNT, proof=남의_증표
        )


async def test_만료된_증표는_거부한다(db):
    """화면을 열어 두고 자리를 비운 사이에 쓰이지 않게 한다."""
    user = await 비밀번호가_있는_사람(db)
    증표 = await issue_proof(
        db, user=user, action=SensitiveAction.DELETE_ACCOUNT, password=비밀번호
    )
    줄 = await db.scalar(
        select(ReauthProof).where(ReauthProof.token_hash == hash_refresh_token(증표))
    )
    줄.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.flush()

    with pytest.raises(AppError):
        await consume_proof(
            db, user_id=user.id, action=SensitiveAction.DELETE_ACCOUNT, proof=증표
        )


async def test_증표_없이는_통과하지_못한다(db):
    with pytest.raises(AppError) as 잡힌_것:
        await consume_proof(
            db, user_id=uuid.uuid4(), action=SensitiveAction.DELETE_ACCOUNT, proof=None
        )

    assert 잡힌_것.value.code is ErrorCode.FORBIDDEN


async def test_거부_사유를_나눠_말하지_않는다(db):
    """만료인지 종류가 다른지 알려 주면 증표를 맞춰 보는 데 힌트가 된다."""
    user = await 비밀번호가_있는_사람(db)
    증표 = await issue_proof(
        db, user=user, action=SensitiveAction.DELETE_ACCOUNT, password=비밀번호
    )

    사유들 = set()
    for 잘못된_호출 in (
        dict(user_id=user.id, action=SensitiveAction.CHANGE_EMAIL, proof=증표),
        dict(user_id=uuid.uuid4(), action=SensitiveAction.DELETE_ACCOUNT, proof=증표),
        dict(user_id=user.id, action=SensitiveAction.DELETE_ACCOUNT, proof="없는 증표"),
    ):
        with pytest.raises(AppError) as 잡힌_것:
            await consume_proof(db, **잘못된_호출)
        사유들.add(잡힌_것.value.detail)

    assert len(사유들) == 1


async def test_증표_원문을_저장하지_않는다(db):
    user = await 비밀번호가_있는_사람(db)

    증표 = await issue_proof(
        db, user=user, action=SensitiveAction.DELETE_ACCOUNT, password=비밀번호
    )

    저장된 = await db.scalar(
        select(ReauthProof.token_hash).where(ReauthProof.user_id == user.id)
    )
    assert 저장된 != 증표
    assert 저장된 == hash_refresh_token(증표)


async def test_같은_작업을_두_번_요청하면_다른_증표다(db):
    """nonce 를 함께 묶는다. 같은 값이 두 번 나오면 안 된다."""
    user = await 비밀번호가_있는_사람(db)

    첫_증표 = await issue_proof(
        db, user=user, action=SensitiveAction.DELETE_ACCOUNT, password=비밀번호
    )
    둘째_증표 = await issue_proof(
        db, user=user, action=SensitiveAction.DELETE_ACCOUNT, password=비밀번호
    )

    assert 첫_증표 != 둘째_증표
