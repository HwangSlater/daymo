import pytest
from sqlalchemy import select

from app.models import User
from app.services.mailer import get_outbox

# 가입 화면의 약관 동의와 만 14세 이상 확인.
동의 = {"agreedTermsVersion": "2026-09-15", "ageConfirmed": True}

pytestmark = pytest.mark.anyio

이메일 = "sky@example.com"
비밀번호 = "산책하는 오후 7시"
새_비밀번호 = "바다가 보이는 창가"
폼 = {"Content-Type": "application/x-www-form-urlencoded"}


def 링크_token() -> str:
    return get_outbox().last.link.split("token=", 1)[1]


async def 가입(api):
    응답 = await api.post(
        "/v1/auth/signup", json={"email": 이메일, "password": 비밀번호, "displayName": "하늘", **동의}
    )
    assert 응답.status_code == 202


async def 로그인(api, password):
    return await api.post(
        "/v1/auth/login",
        json={"email": 이메일, "password": password, "device": {"installationId": "설치-1", "platform": "ios"}},
    )


# ---------------------------------------------------------------------------
# 이메일 확인
# ---------------------------------------------------------------------------


async def test_확인_메일_링크는_API_서버의_페이지로_간다(api, db):
    await 가입(api)

    assert get_outbox().last.link.startswith("https://api.daymo.xyz/auth/verify-email?token=")


async def test_링크를_열기만_해서는_확인되지_않는다(api, db):
    """메일 보안 검사기가 링크를 미리 열어도 1회용 링크가 쓰이면 안 된다."""
    await 가입(api)
    token = 링크_token()

    응답 = await api.get("/auth/verify-email", params={"token": token})

    assert 응답.status_code == 200
    assert "이메일 확인하기" in 응답.text
    user = await db.scalar(select(User).where(User.email == 이메일))
    assert user.email_verified_at is None


async def test_페이지는_token_이_새지_않게_막는다(api, db):
    응답 = await api.get("/auth/verify-email", params={"token": "abc"})

    assert 응답.headers["referrer-policy"] == "no-referrer"
    assert 응답.headers["cache-control"] == "no-store"
    assert "default-src 'none'" in 응답.headers["content-security-policy"]
    assert 응답.headers["content-type"].startswith("text/html")


async def test_버튼을_누르면_확인되고_다시_쓸_수_없다(api, db):
    await 가입(api)
    token = 링크_token()

    첫번째 = await api.post("/auth/verify-email", content=f"token={token}", headers=폼)
    두번째 = await api.post("/auth/verify-email", content=f"token={token}", headers=폼)

    assert 첫번째.status_code == 200 and "이메일을 확인했어요" in 첫번째.text
    assert 두번째.status_code == 400 and "만료되었거나 이미 사용됐어요" in 두번째.text
    user = await db.scalar(select(User).where(User.email == 이메일))
    assert user.email_verified_at is not None


@pytest.mark.parametrize("token", ["", "a" * 201, "<script>", '"onfocus=x', "하늘"])
async def test_token_모양이_아니면_폼에_넣지_않는다(api, db, token):
    응답 = await api.get("/auth/verify-email", params={"token": token})

    assert 응답.status_code == 400
    assert "<script>" not in 응답.text and "onfocus" not in 응답.text


async def test_재전송은_계정이_없어도_같은_문구다(api, db):
    await 가입(api)
    get_outbox().clear()

    없는 = await api.post("/auth/verify-email/resend", content="email=nobody%40example.com", headers=폼)

    assert 없는.status_code == 200 and "가입한 주소라면" in 없는.text
    assert get_outbox().last is None


# ---------------------------------------------------------------------------
# 비밀번호 재설정
# ---------------------------------------------------------------------------


async def 재설정_token(api) -> str:
    await 가입(api)
    응답 = await api.post("/auth/forgot-password", content=f"email={이메일}", headers=폼)
    assert 응답.status_code == 200 and "가입한 주소라면" in 응답.text
    assert get_outbox().last.link.startswith("https://api.daymo.xyz/auth/reset-password?token=")
    return 링크_token()


async def test_재설정_페이지는_열기만_해서는_아무것도_바꾸지_않는다(api, db):
    token = await 재설정_token(api)

    응답 = await api.get("/auth/reset-password", params={"token": token})

    assert 응답.status_code == 200 and 'name="password"' in 응답.text
    assert (await 로그인(api, 비밀번호)).status_code == 200


async def test_두_비밀번호가_다르면_다시_입력하게_하고_token_은_남는다(api, db):
    token = await 재설정_token(api)

    다름 = await api.post(
        "/auth/reset-password", content=f"token={token}&password=a1b2c3d4e5&confirm=zzzzzzzzzz", headers=폼
    )
    assert 다름.status_code == 400 and "두 비밀번호가 달라요" in 다름.text

    흔함 = await api.post(
        "/auth/reset-password", content=f"token={token}&password=password123&confirm=password123", headers=폼
    )
    assert 흔함.status_code == 400 and "너무 흔한 비밀번호" in 흔함.text
    assert 'name="token"' in 흔함.text


async def test_새_비밀번호로_바꾸면_새_비밀번호로만_로그인된다(api, db):
    token = await 재설정_token(api)
    from urllib.parse import quote

    응답 = await api.post(
        "/auth/reset-password",
        content=f"token={token}&password={quote(새_비밀번호)}&confirm={quote(새_비밀번호)}",
        headers=폼,
    )

    assert 응답.status_code == 200 and "비밀번호를 바꿨어요" in 응답.text
    assert (await 로그인(api, 비밀번호)).status_code == 401
    assert (await 로그인(api, 새_비밀번호)).status_code == 200


async def test_이미_있는_이메일로_가입하면_비밀번호_찾기_주소를_알린다(api, db):
    await 가입(api)
    await api.post("/auth/verify-email", content=f"token={링크_token()}", headers=폼)
    get_outbox().clear()

    await 가입(api)

    편지 = get_outbox().last
    assert 편지.link is None
    assert "https://api.daymo.xyz/auth/forgot-password" in 편지.body


async def test_비밀번호_찾기_페이지가_열린다(api, db):
    응답 = await api.get("/auth/forgot-password")

    assert 응답.status_code == 200 and "재설정 메일 받기" in 응답.text


# ---------------------------------------------------------------------------
# 공간 초대
# ---------------------------------------------------------------------------

초대_token = "Ab3_-cdEFghIJklMNopQRstUVwxYZ0123456789ab"


async def test_초대_페이지는_웹과_앱_두_길을_준다(api, db):
    """앱이 없는 사람도 브라우저에서 이어 갈 수 있어야 한다."""
    응답 = await api.get("/auth/invite", params={"token": 초대_token})

    assert 응답.status_code == 200
    assert f"https://www.daymo.xyz/app?invite={초대_token}" in 응답.text
    assert f"daymo://invite?token={초대_token}" in 응답.text
    assert "웹에서 열기" in 응답.text
    # 공간 이름도 초대한 사람도 드러내지 않고, 주소도 새지 않는다.
    assert 응답.headers["referrer-policy"] == "no-referrer"
    assert 응답.headers["cache-control"] == "no-store"


async def test_초대_페이지는_이상한_token_을_그대로_막는다(api, db):
    응답 = await api.get("/auth/invite", params={"token": "<script>x</script>"})

    assert 응답.status_code == 400
    assert "daymo://" not in 응답.text
    assert "invite=" not in 응답.text
    assert "<script>" not in 응답.text
