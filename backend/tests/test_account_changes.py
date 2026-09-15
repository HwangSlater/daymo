import uuid

import pytest
from sqlalchemy import func, select

from app.models import Device, EmailChangeToken, RefreshToken, RevokeReason, User
from app.services.mailer import get_outbox

# 가입 화면의 약관 동의와 만 14세 이상 확인.
동의 = {"agreedTermsVersion": "2026-09-15", "ageConfirmed": True}

pytestmark = pytest.mark.anyio

이메일 = "sky@example.com"
새_이메일 = "river@example.com"
비밀번호 = "산책하는 오후 7시"
새_비밀번호 = "바다가 보이는 창가"
폼 = {"Content-Type": "application/x-www-form-urlencoded"}


async def 로그인(api, email=이메일, password=비밀번호, 설치="설치-폰"):
    return await api.post(
        "/v1/auth/login",
        json={"email": email, "password": password, "device": {"installationId": 설치, "platform": "ios"}},
    )


async def 로그인한_사람(api, email=이메일, 설치="설치-폰") -> dict:
    """가입하고 이메일을 확인한 뒤 로그인까지 마친 사람의 세션."""
    await api.post(
        "/v1/auth/signup", json={"email": email, "password": 비밀번호, "displayName": "하늘", **동의}
    )
    토큰 = get_outbox().last.link.split("token=", 1)[1]
    await api.post("/v1/auth/email-verifications/confirm", json={"token": 토큰})
    return await 세션(api, email, 설치=설치)


async def 세션(api, email=이메일, password=비밀번호, 설치="설치-폰") -> dict:
    응답 = await 로그인(api, email, password, 설치)
    assert 응답.status_code == 200, 응답.text
    값 = 응답.json()["data"]
    return {**값, "headers": {"Authorization": f"Bearer {값['accessToken']}"}}


async def 증표(api, 사람, action) -> str:
    응답 = await api.post(
        "/v1/auth/reauth", json={"action": action, "password": 비밀번호}, headers=사람["headers"]
    )
    assert 응답.status_code == 201, 응답.text
    return 응답.json()["data"]["proof"]


async def 비밀번호_변경(api, 사람, proof, new_password=새_비밀번호):
    return await api.post(
        "/v1/me/password",
        json={"reauthProof": proof, "newPassword": new_password},
        headers=사람["headers"],
    )


async def 이메일_변경(api, 사람, proof, new_email=새_이메일):
    return await api.post(
        "/v1/me/email", json={"reauthProof": proof, "newEmail": new_email}, headers=사람["headers"]
    )


def 받은_편지(to: str):
    return [편지 for 편지 in get_outbox().letters if 편지.to == to]


def 변경_링크_token(to=새_이메일) -> str:
    [편지] = [편지 for 편지 in 받은_편지(to) if 편지.link]
    assert "/auth/confirm-email-change?token=" in 편지.link
    return 편지.link.split("token=", 1)[1]


# ---------------------------------------------------------------------------
# 비밀번호 바꾸기
# ---------------------------------------------------------------------------


async def test_증표_없이는_비밀번호를_바꿀_수_없다(api, db):
    사람 = await 로그인한_사람(api)

    응답 = await 비밀번호_변경(api, 사람, None)

    assert 응답.status_code == 403
    assert (await 로그인(api, password=비밀번호)).status_code == 200


async def test_다른_작업의_증표로는_비밀번호를_바꿀_수_없다(api, db):
    사람 = await 로그인한_사람(api)

    응답 = await 비밀번호_변경(api, 사람, await 증표(api, 사람, "change_email"))

    assert 응답.status_code == 403


async def test_비밀번호를_바꾸면_새_비밀번호로만_로그인된다(api, db):
    사람 = await 로그인한_사람(api)

    응답 = await 비밀번호_변경(api, 사람, await 증표(api, 사람, "change_password"))

    assert 응답.status_code == 200, 응답.text
    assert 응답.json()["data"]["status"] == "changed"
    assert (await 로그인(api, password=비밀번호, 설치="설치-다른")).status_code == 401
    assert (await 로그인(api, password=새_비밀번호, 설치="설치-다른")).status_code == 200


async def test_비밀번호를_바꾸면_이_기기만_남고_다른_기기는_끊긴다(api, db):
    폰 = await 로그인한_사람(api)
    태블릿 = await 세션(api, 설치="설치-태블릿")

    await 비밀번호_변경(api, 폰, await 증표(api, 폰, "change_password"))

    # 바꾼 기기는 그대로 쓴다. 갱신도 된다.
    assert (await api.get("/v1/me", headers=폰["headers"])).status_code == 200
    assert (await api.post("/v1/auth/refresh", json={"refreshToken": 폰["refreshToken"]})).status_code == 200
    # 다른 기기는 access token 이 남아 있어도 바로 막힌다.
    assert (await api.get("/v1/me", headers=태블릿["headers"])).status_code == 401
    assert (await api.post("/v1/auth/refresh", json={"refreshToken": 태블릿["refreshToken"]})).status_code == 401

    이유 = await db.scalar(
        select(RefreshToken.revoke_reason).where(RefreshToken.device_id == uuid.UUID(태블릿["deviceId"]))
    )
    assert 이유 is RevokeReason.PASSWORD_CHANGE
    살아_있는_기기 = await db.scalar(
        select(func.count()).select_from(Device).where(Device.revoked_at.is_(None))
    )
    assert 살아_있는_기기 == 1


async def test_비밀번호를_바꾸면_링크_없는_알림_메일이_간다(api, db):
    사람 = await 로그인한_사람(api)
    get_outbox().clear()

    await 비밀번호_변경(api, 사람, await 증표(api, 사람, "change_password"))

    [편지] = get_outbox().letters
    assert (편지.to, 편지.subject, 편지.link) == (이메일, "비밀번호가 바뀌었어요", None)
    assert "http" not in (편지.body or "")


async def test_규칙에_맞지_않는_비밀번호는_거부하고_증표는_남는다(api, db):
    사람 = await 로그인한_사람(api)
    proof = await 증표(api, 사람, "change_password")

    짧음 = await 비밀번호_변경(api, 사람, proof, new_password="짧아")
    흔함 = await 비밀번호_변경(api, 사람, proof, new_password="password123")
    다시 = await 비밀번호_변경(api, 사람, proof)

    assert 짧음.status_code == 422 and "password" in 짧음.json()["error"]["fields"]
    assert 흔함.json()["error"]["code"] == "PASSWORD_TOO_COMMON"
    assert 다시.status_code == 200


async def test_비밀번호_증표는_한_번만_쓴다(api, db):
    사람 = await 로그인한_사람(api)
    proof = await 증표(api, 사람, "change_password")

    await 비밀번호_변경(api, 사람, proof)
    두번째 = await 비밀번호_변경(api, 사람, proof, new_password="세번째 비밀번호예요")

    assert 두번째.status_code == 403


async def test_비밀번호를_바꾸면_받아_둔_재설정_링크는_쓸_수_없다(api, db):
    사람 = await 로그인한_사람(api)
    await api.post("/v1/auth/password/forgot", json={"email": 이메일})
    재설정_token = get_outbox().last.link.split("token=", 1)[1]

    await 비밀번호_변경(api, 사람, await 증표(api, 사람, "change_password"))
    응답 = await api.post(
        "/v1/auth/password/reset", json={"token": 재설정_token, "newPassword": "누군가 정한 비밀번호"}
    )

    assert 응답.status_code == 422
    assert (await 로그인(api, password=새_비밀번호, 설치="설치-다른")).status_code == 200


# ---------------------------------------------------------------------------
# 이메일 바꾸기
# ---------------------------------------------------------------------------


async def test_증표_없이는_이메일을_바꿀_수_없다(api, db):
    사람 = await 로그인한_사람(api)
    get_outbox().clear()

    없음 = await 이메일_변경(api, 사람, None)
    다른_작업 = await 이메일_변경(api, 사람, await 증표(api, 사람, "change_password"))

    assert (없음.status_code, 다른_작업.status_code) == (403, 403)
    assert get_outbox().letters == []


async def test_이메일_변경을_요청하면_새_주소로_링크가_가고_아직_바뀌지_않는다(api, db):
    사람 = await 로그인한_사람(api)
    get_outbox().clear()

    응답 = await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"))

    assert 응답.status_code == 202, 응답.text
    assert 응답.json()["data"]["status"] == "accepted"
    assert 변경_링크_token().isascii()
    # 지금 주소에는 링크 없는 알림이 간다. 새 주소는 가려서 쓴다.
    [알림] = 받은_편지(이메일)
    assert 알림.link is None and "r***@example.com" in 알림.body
    user = await db.scalar(select(User).where(User.id == (await 사용자_id(db, 이메일))))
    assert user.email == 이메일
    # 토큰 원문은 저장하지 않는다.
    줄 = await db.scalar(select(EmailChangeToken))
    assert 줄.new_email == 새_이메일 and 줄.token_hash != 변경_링크_token()


async def 사용자_id(db, email):
    return await db.scalar(select(User.id).where(User.email == email))


async def test_링크를_열기만_해서는_바뀌지_않는다(api, db):
    사람 = await 로그인한_사람(api)
    await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"))

    응답 = await api.get("/auth/confirm-email-change", params={"token": 변경_링크_token()})

    assert 응답.status_code == 200 and "이메일 바꾸기" in 응답.text
    assert 응답.headers["referrer-policy"] == "no-referrer"
    assert 응답.headers["cache-control"] == "no-store"
    assert "default-src 'none'" in 응답.headers["content-security-policy"]
    assert await 사용자_id(db, 이메일) is not None


async def test_버튼을_누르면_바뀌고_새_주소는_확인된_주소가_된다(api, db):
    사람 = await 로그인한_사람(api)
    user_id = await 사용자_id(db, 이메일)
    await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"))
    token = 변경_링크_token()
    get_outbox().clear()

    첫번째 = await api.post("/auth/confirm-email-change", content=f"token={token}", headers=폼)
    두번째 = await api.post("/auth/confirm-email-change", content=f"token={token}", headers=폼)

    assert 첫번째.status_code == 200 and "이메일을 바꿨어요" in 첫번째.text
    assert 두번째.status_code == 400 and "만료되었거나 이미 사용됐어요" in 두번째.text
    user = await db.get(User, user_id)
    await db.refresh(user)
    assert user.email == 새_이메일 and user.email_verified_at is not None
    assert (await 로그인(api, email=이메일, 설치="설치-다른")).status_code == 401
    assert (await 로그인(api, email=새_이메일, 설치="설치-다른")).status_code == 200
    # 예전 주소에 바뀌었다고 알린다.
    assert [편지.subject for 편지 in 받은_편지(이메일)] == ["이메일이 바뀌었어요"]
    # 지금 기기는 로그아웃되지 않는다.
    assert (await api.get("/v1/me", headers=사람["headers"])).json()["data"]["email"] == 새_이메일


async def test_새_주소는_대소문자를_하나로_본다(api, db):
    사람 = await 로그인한_사람(api)
    await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"), new_email="River@Example.com")

    assert await db.scalar(select(EmailChangeToken.new_email)) == 새_이메일
    assert 변경_링크_token(새_이메일)


async def test_지금_주소와_같으면_거부한다(api, db):
    사람 = await 로그인한_사람(api)

    응답 = await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"), new_email="SKY@example.com")

    assert 응답.status_code == 422 and "newEmail" in 응답.json()["error"]["fields"]


async def test_이미_계정이_있는_주소여도_같은_응답이고_링크는_없다(api, db, 시도_시각을_되돌린다):
    """응답이 갈리면 로그인한 사람 누구나 남의 주소로 가입 여부를 알아낼 수 있다."""
    await 로그인한_사람(api, email=새_이메일, 설치="설치-남")
    사람 = await 로그인한_사람(api)
    없는_주소 = await 이메일_변경(
        api, 사람, await 증표(api, 사람, "change_email"), new_email="nobody@example.com"
    )
    await 시도_시각을_되돌린다(61)
    get_outbox().clear()

    있는_주소 = await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"))

    assert 있는_주소.status_code == 없는_주소.status_code == 202
    assert 있는_주소.json()["data"] == 없는_주소.json()["data"]
    [새_주소_편지] = 받은_편지(새_이메일)
    assert 새_주소_편지.link is None and "바꾸려고" in 새_주소_편지.subject
    [알림] = 받은_편지(이메일)
    assert 알림.subject == "이메일 변경을 요청했어요"
    # 앞서 받은 nobody@ 링크도 새 요청에서 폐기된다.
    assert await db.scalar(
        select(func.count()).select_from(EmailChangeToken).where(EmailChangeToken.revoked_at.is_(None))
    ) == 0


async def test_그새_주소를_다른_계정이_쓰면_바꾸지_않는다(api, db):
    사람 = await 로그인한_사람(api)
    await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"))
    token = 변경_링크_token()
    await 로그인한_사람(api, email=새_이메일, 설치="설치-남")

    응답 = await api.post("/auth/confirm-email-change", content=f"token={token}", headers=폼)

    assert 응답.status_code == 400 and "만료되었거나 이미 사용됐어요" in 응답.text
    assert await 사용자_id(db, 이메일) is not None


async def test_새로_요청하면_예전_변경_링크는_쓸_수_없다(api, db, 시도_시각을_되돌린다):
    사람 = await 로그인한_사람(api)
    await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"))
    예전_token = 변경_링크_token()
    await 시도_시각을_되돌린다(61)
    get_outbox().clear()
    await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"), new_email="lake@example.com")

    응답 = await api.post("/auth/confirm-email-change", content=f"token={예전_token}", headers=폼)

    assert 응답.status_code == 400
    assert await 사용자_id(db, 이메일) is not None


async def test_이메일_변경은_연달아_요청할_수_없다(api, db):
    사람 = await 로그인한_사람(api)
    await 이메일_변경(api, 사람, await 증표(api, 사람, "change_email"))
    proof = await 증표(api, 사람, "change_email")

    응답 = await 이메일_변경(api, 사람, proof, new_email="lake@example.com")

    assert 응답.status_code == 429
    assert "retryAfterSeconds" in 응답.json()["error"]["fields"]


async def test_이상한_token_은_같은_오류_화면이다(api, db):
    열기 = await api.get("/auth/confirm-email-change", params={"token": "<script>"})
    보내기 = await api.post("/auth/confirm-email-change", content="token=없는토큰", headers=폼)

    assert 열기.status_code == 400 and "<script>" not in 열기.text
    assert 보내기.status_code == 400 and "만료되었거나 이미 사용됐어요" in 보내기.text
