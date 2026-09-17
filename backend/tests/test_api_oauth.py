import base64
import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sqlalchemy import func, select

from app.core import passwords
from app.core.config import get_settings
from app.models import OAuthAccount, OAuthPendingLogin, OAuthProvider, OAuthState, User
from app.services.oauth import flow, providers

pytestmark = pytest.mark.anyio

# 카카오로 흐름 전체를 돌린다. 제공자 서버는 httpx 의 가짜 transport 가 대신한다.
# 제공자마다 다른 부분은 test_oauth_providers.py 에서 따로 본다.

앱_주소 = "daymo://oauth"
기기 = {"installationId": "설치-oauth", "platform": "android", "deviceName": "내 폰"}
비밀번호 = "산책하는 오후 7시"


@pytest.fixture(autouse=True)
def 카카오를_켠다(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "kakao_rest_api_key", "test-kakao-key")
    monkeypatch.setattr(settings, "oauth_app_redirect_uris", 앱_주소)
    yield
    providers.http_transport = None


def 카카오_서버(*, 번호=4242, 이메일="sky@example.com", 확인됨=True, 토큰_실패=False, 부른_주소=None):
    def 응답(request: httpx.Request) -> httpx.Response:
        if 부른_주소 is not None:
            부른_주소.append(request)
        if request.url.host == "kauth.kakao.com":
            if 토큰_실패:
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"access_token": "kakao-access-token", "token_type": "bearer"})
        if request.url.host == "kapi.kakao.com":
            assert request.headers["Authorization"] == "Bearer kakao-access-token"
            return httpx.Response(
                200,
                json={
                    "id": 번호,
                    "kakao_account": {
                        "email": 이메일,
                        "is_email_valid": 확인됨,
                        "is_email_verified": 확인됨,
                        "profile": {"nickname": "하늘"},
                    },
                },
            )
        return httpx.Response(404)

    providers.http_transport = httpx.MockTransport(응답)


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


async def 시작(api, challenge, *, 제공자="kakao", 주소=앱_주소, 앱_state="app-made-state-0123456789"):
    return await api.get(
        f"/v1/auth/oauth/{제공자}/start",
        params={"redirectUri": 주소, "state": 앱_state, "codeChallenge": challenge},
    )


async def 로그인_코드(api, challenge, **서버) -> dict[str, str]:
    """start 부터 callback 까지 돌리고 앱 주소에 실린 값을 돌려준다."""
    카카오_서버(**서버)
    응답 = await 시작(api, challenge)
    assert 응답.status_code == 302
    state = parse_qs(urlsplit(응답.headers["location"]).query)["state"][0]
    돌아옴 = await api.get("/v1/auth/oauth/kakao/callback", params={"code": "제공자-코드", "state": state})
    assert 돌아옴.status_code == 303
    위치 = 돌아옴.headers["location"]
    assert 위치.startswith(앱_주소 + "?")
    return {k: v[0] for k, v in parse_qs(urlsplit(위치).query).items()}


async def 교환(api, code, verifier):
    return await api.post(
        "/v1/auth/oauth/exchange",
        json={"loginCode": code, "codeVerifier": verifier, "device": 기기, "agreedTermsVersion": "2026-09-15", "ageConfirmed": True},
    )


# ---------------------------------------------------------------------------
# 켜진 제공자와 start
# ---------------------------------------------------------------------------


async def test_키를_넣은_제공자만_목록에_나온다(api, monkeypatch):
    응답 = await api.get("/v1/auth/oauth/providers")
    assert 응답.json()["data"]["providers"] == ["kakao"]

    monkeypatch.setattr(get_settings(), "kakao_rest_api_key", "")
    assert (await api.get("/v1/auth/oauth/providers")).json()["data"]["providers"] == []


async def test_켜지_않은_제공자는_없는_경로다(api):
    _, challenge = pkce()
    응답 = await 시작(api, challenge, 제공자="google")
    assert 응답.status_code == 404


async def test_허용하지_않은_앱_주소로는_시작하지_않는다(api, db):
    _, challenge = pkce()
    응답 = await 시작(api, challenge, 주소="https://evil.example.com/steal")
    assert 응답.status_code == 422
    assert await db.scalar(select(func.count()).select_from(OAuthState)) == 0


async def test_S256_challenge_가_아니면_시작하지_않는다(api):
    응답 = await api.get(
        "/v1/auth/oauth/kakao/start",
        params={
            "redirectUri": 앱_주소,
            "state": "app-made-state-0123456789",
            "codeChallenge": "a" * 43,
            "codeChallengeMethod": "plain",
        },
    )
    assert 응답.status_code == 422


async def test_시작하면_제공자_로그인_창으로_보낸다(api, db):
    _, challenge = pkce()
    응답 = await 시작(api, challenge)

    assert 응답.status_code == 302
    주소 = urlsplit(응답.headers["location"])
    assert 주소.netloc == "kauth.kakao.com"
    값 = parse_qs(주소.query)
    assert 값["redirect_uri"] == ["https://api.daymo.xyz/v1/auth/oauth/kakao/callback"]
    # 앱의 state 를 제공자에게 넘기지 않는다. 서버가 따로 만든다.
    assert 값["state"][0] != "app-made-state-0123456789"
    줄 = await db.scalar(select(OAuthState))
    assert 줄.code_challenge == challenge
    assert 줄.state_hash != 값["state"][0]


# ---------------------------------------------------------------------------
# callback 과 exchange
# ---------------------------------------------------------------------------


async def test_처음_로그인하면_계정을_만들고_세션을_준다(api, db):
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)
    assert 값["state"] == "app-made-state-0123456789"
    # 토큰을 주소에 싣지 않는다.
    assert set(값) == {"loginCode", "state"}

    응답 = await 교환(api, 값["loginCode"], verifier)

    assert 응답.status_code == 200, 응답.text
    세션 = 응답.json()["data"]
    assert 세션["accessToken"] and 세션["refreshToken"]
    user = await db.scalar(select(User).where(User.email == "sky@example.com"))
    assert user.display_name == "하늘"
    assert user.password_hash is None
    assert user.email_verified_at is not None
    연결 = await db.scalar(select(OAuthAccount).where(OAuthAccount.user_id == user.id))
    assert (연결.provider, 연결.provider_subject) == (OAuthProvider.KAKAO, "4242")

    me = await api.get("/v1/me", headers={"Authorization": f"Bearer {세션['accessToken']}"})
    assert me.json()["data"]["email"] == "sky@example.com"


async def test_다시_로그인하면_같은_계정이다(api, db):
    for _ in range(2):
        verifier, challenge = pkce()
        값 = await 로그인_코드(api, challenge)
        assert (await 교환(api, 값["loginCode"], verifier)).status_code == 200

    assert await db.scalar(select(func.count()).select_from(User).where(User.email == "sky@example.com")) == 1


async def test_verifier_가_틀리면_loginCode_를_버린다(api):
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)
    다른_verifier, _ = pkce()

    assert (await 교환(api, 값["loginCode"], 다른_verifier)).status_code == 401
    # 한 번 틀린 뒤에는 맞는 verifier 로도 안 된다.
    assert (await 교환(api, 값["loginCode"], verifier)).status_code == 401


async def test_loginCode_는_한_번만_쓴다(api):
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)

    assert (await 교환(api, 값["loginCode"], verifier)).status_code == 200
    assert (await 교환(api, 값["loginCode"], verifier)).status_code == 401


async def test_1분이_지난_loginCode_는_쓸_수_없다(api, db):
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)
    줄 = await db.scalar(select(OAuthPendingLogin))
    줄.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.flush()

    assert (await 교환(api, 값["loginCode"], verifier)).status_code == 401


async def test_같은_callback_을_다시_열면_아무것도_하지_않는다(api, db):
    _, challenge = pkce()
    카카오_서버()
    state = parse_qs(urlsplit((await 시작(api, challenge)).headers["location"]).query)["state"][0]
    첫 = await api.get("/v1/auth/oauth/kakao/callback", params={"code": "c", "state": state})
    둘 = await api.get("/v1/auth/oauth/kakao/callback", params={"code": "c", "state": state})

    assert 첫.status_code == 303
    assert 둘.status_code == 400
    assert "location" not in 둘.headers
    assert await db.scalar(select(func.count()).select_from(OAuthPendingLogin)) == 1


async def test_모르는_state_로는_앱으로_보내지_않는다(api):
    응답 = await api.get("/v1/auth/oauth/kakao/callback", params={"code": "c", "state": "지어낸-state"})
    assert 응답.status_code == 400
    assert "location" not in 응답.headers


async def test_동의_화면에서_취소하면_앱에_취소로_알린다(api):
    _, challenge = pkce()
    state = parse_qs(urlsplit((await 시작(api, challenge)).headers["location"]).query)["state"][0]
    응답 = await api.get(
        "/v1/auth/oauth/kakao/callback", params={"error": "access_denied", "state": state}
    )
    assert 응답.status_code == 303
    assert parse_qs(urlsplit(응답.headers["location"]).query)["error"] == ["cancelled"]


async def test_제공자가_코드를_거절하면_앱에_실패로_알린다(api):
    _, challenge = pkce()
    카카오_서버(토큰_실패=True)
    state = parse_qs(urlsplit((await 시작(api, challenge)).headers["location"]).query)["state"][0]
    응답 = await api.get("/v1/auth/oauth/kakao/callback", params={"code": "c", "state": state})
    값 = parse_qs(urlsplit(응답.headers["location"]).query)
    assert 값["error"] == ["failed"]
    assert "loginCode" not in 값


async def test_이메일을_주지_않으면_가입하지_않는다(api, db):
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge, 확인됨=False)

    응답 = await 교환(api, 값["loginCode"], verifier)

    assert 응답.status_code == 422
    assert "이메일" in 응답.json()["error"]["message"]
    assert await db.scalar(select(func.count()).select_from(OAuthAccount)) == 0


# ---------------------------------------------------------------------------
# 같은 이메일의 계정이 이미 있을 때
# ---------------------------------------------------------------------------


async def _비밀번호_계정(db, 이메일="sky@example.com", 확인됨=False) -> User:
    user = User(
        email=이메일,
        display_name="원래",
        password_hash=passwords.hash_password(비밀번호),
        email_verified_at=datetime.now(UTC) if 확인됨 else None,
    )
    db.add(user)
    await db.flush()
    return user


async def _연결_토큰(api, db) -> tuple[str, dict]:
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)
    응답 = await 교환(api, 값["loginCode"], verifier)
    assert 응답.status_code == 409, 응답.text
    오류 = 응답.json()["error"]
    assert 오류["code"] == "ACCOUNT_LINK_REQUIRED"
    return 오류["details"]["linkToken"], 오류


async def _소셜_계정(db, 이메일="sky@example.com", provider=OAuthProvider.NAVER) -> User:
    """다른 제공자로만 가입해 비밀번호가 없는 계정."""
    user = User(email=이메일, display_name="원래", password_hash=None)
    db.add(user)
    await db.flush()
    db.add(OAuthAccount(user_id=user.id, provider=provider, provider_subject="n-1", provider_email=이메일))
    await db.flush()
    return user


async def test_비밀번호가_없는_계정은_이메일을_확인해_준_제공자면_그대로_붙인다(api, db):
    기존 = await _소셜_계정(db)

    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)
    응답 = await 교환(api, 값["loginCode"], verifier)

    # 비밀번호를 물어보면 답할 수 없어 길이 막힌다. 카카오가 이메일 주인임을 확인해 줬고,
    # 그 이메일함을 여는 사람은 재설정 링크로 이미 이 계정을 가져갈 수 있다.
    assert 응답.status_code == 200, 응답.text
    붙은 = await db.scalar(select(OAuthAccount).where(OAuthAccount.provider == OAuthProvider.KAKAO))
    assert 붙은.user_id == 기존.id
    # 계정이 새로 생기지 않는다.
    assert await db.scalar(select(func.count()).select_from(User).where(User.email == 기존.email)) == 1


async def test_이메일을_확인해_주지_않는_제공자는_비밀번호가_없어도_붙이지_않는다(api, db):
    await _소셜_계정(db)

    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge, 확인됨=False, 이메일="sky@example.com")
    응답 = await 교환(api, 값["loginCode"], verifier)

    # 이메일을 안 주는 제공자라 가입도 연결도 못 한다.
    assert 응답.status_code == 422
    assert await db.scalar(select(func.count()).select_from(OAuthAccount)) == 1


async def test_비밀번호가_없는_계정에_이메일_미확인_제공자가_오면_원래_방법으로_보낸다(api, db, monkeypatch):
    await _소셜_계정(db)
    # 카카오 서버는 이메일을 주지만 제공자 쪽에서 확인된 것으로 치지 않는 경우
    # (네이버가 이렇다). 물어볼 비밀번호가 없으니 연결 토큰을 주지 않는다.
    monkeypatch.setattr(
        providers.Kakao, "fetch_identity",
        lambda self, **값: _확인되지_않은_신원(),
    )

    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)
    응답 = await 교환(api, 값["loginCode"], verifier)

    assert 응답.status_code == 409
    오류 = 응답.json()["error"]
    assert 오류["code"] == "ACCOUNT_LINK_REQUIRED"
    assert "처음 가입할 때 쓴 방법" in 오류["message"]
    # 있지도 않은 비밀번호를 묻지 않는다.
    assert not (오류.get("details") or {}).get("linkToken")


async def _확인되지_않은_신원():
    return providers.Identity(subject="4242", email="sky@example.com", email_verified=False, name="확인안됨")


async def test_같은_이메일이면_합치지_않고_연결을_요구한다(api, db):
    기존 = await _비밀번호_계정(db)

    _, 오류 = await _연결_토큰(api, db)

    assert 오류["details"]["provider"] == "kakao"
    # 무엇으로 가입한 계정인지는 싣지 않는다.
    assert set(오류["details"]) == {"linkToken", "provider"}
    assert await db.scalar(select(func.count()).select_from(OAuthAccount)) == 0
    assert await db.scalar(select(func.count()).select_from(User).where(User.email == 기존.email)) == 1


async def test_기존_계정_비밀번호로_연결하고_로그인한다(api, db):
    기존 = await _비밀번호_계정(db)
    link_token, _ = await _연결_토큰(api, db)

    응답 = await api.post(
        "/v1/auth/oauth/link", json={"linkToken": link_token, "password": 비밀번호, "device": 기기}
    )

    assert 응답.status_code == 200, 응답.text
    연결 = await db.scalar(select(OAuthAccount))
    assert 연결.user_id == 기존.id
    # 비밀번호로 계정 주인임을, 카카오로 이메일 주인임을 확인했다.
    await db.refresh(기존)
    assert 기존.email_verified_at is not None

    # 다음부터는 연결을 묻지 않는다.
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)
    assert (await 교환(api, 값["loginCode"], verifier)).status_code == 200


async def test_비밀번호가_틀리면_연결하지_않는다(api, db):
    await _비밀번호_계정(db)
    link_token, _ = await _연결_토큰(api, db)

    응답 = await api.post(
        "/v1/auth/oauth/link", json={"linkToken": link_token, "password": "틀린 비밀번호입니다", "device": 기기}
    )

    # 401 이면 앱이 토큰 만료로 알고 로그아웃한다.
    assert 응답.status_code == 403
    assert await db.scalar(select(func.count()).select_from(OAuthAccount)) == 0


async def test_연결_토큰을_들고_와도_비밀번호가_없는_계정이면_같은_문구로_거절한다(api, db):
    # 비밀번호가 있는 계정으로 토큰을 받은 뒤 그 계정의 비밀번호를 지운 경우다.
    # 이제 이 길로 오는 계정은 모두 비밀번호가 있지만, 중간에 바뀌어도 새어 나갈 것이 없어야 한다.
    기존 = await _비밀번호_계정(db)
    link_token, _ = await _연결_토큰(api, db)
    기존.password_hash = None
    await db.flush()

    응답 = await api.post(
        "/v1/auth/oauth/link", json={"linkToken": link_token, "password": 비밀번호, "device": 기기}
    )

    assert 응답.status_code == 403
    assert 응답.json()["error"]["message"] == "비밀번호를 확인해 주세요."


async def test_연결_토큰은_한_번만_쓴다(api, db):
    await _비밀번호_계정(db)
    link_token, _ = await _연결_토큰(api, db)
    요청 = {"linkToken": link_token, "password": 비밀번호, "device": 기기}

    assert (await api.post("/v1/auth/oauth/link", json=요청)).status_code == 200
    assert (await api.post("/v1/auth/oauth/link", json=요청)).status_code == 401


# ---------------------------------------------------------------------------
# 정리
# ---------------------------------------------------------------------------


async def test_기한이_지난_줄을_지운다(api, db):
    verifier, challenge = pkce()
    await 로그인_코드(api, challenge)
    _, 두번째 = pkce()
    await 시작(api, 두번째)

    나중 = datetime.now(UTC) + timedelta(hours=1)
    지운_수 = await flow.purge_expired(db, now=나중)

    assert 지운_수 == 3
    assert await db.scalar(select(func.count()).select_from(OAuthState)) == 0
    assert await db.scalar(select(func.count()).select_from(OAuthPendingLogin)) == 0


async def test_연결을_기다리는_줄은_연결_기한까지_남긴다(api, db):
    await _비밀번호_계정(db)
    await _연결_토큰(api, db)

    await flow.purge_expired(db, now=datetime.now(UTC) + timedelta(minutes=5))

    assert await db.scalar(select(func.count()).select_from(OAuthPendingLogin)) == 1


def test_apple_이름_칸은_성을_앞에_붙인다():
    assert providers._apple_name(json.dumps({"name": {"firstName": "하늘", "lastName": "김"}})) == "김하늘"
    assert providers._apple_name("모양이 틀림") is None


async def test_폼으로_돌아오는_callback_도_같게_처리한다(api):
    """Apple 처럼 결과를 POST 폼으로 보내는 제공자를 위한 경로."""
    verifier, challenge = pkce()
    카카오_서버()
    state = parse_qs(urlsplit((await 시작(api, challenge)).headers["location"]).query)["state"][0]

    응답 = await api.post(
        "/v1/auth/oauth/kakao/callback",
        content=f"code=provider-code&state={state}",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert 응답.status_code == 303
    값 = parse_qs(urlsplit(응답.headers["location"]).query)
    assert (await 교환(api, 값["loginCode"][0], verifier)).status_code == 200


# ---------------------------------------------------------------------------
# reauth: 비밀번호가 없는 계정의 재확인
# ---------------------------------------------------------------------------


async def 카카오로_가입한다(api, **서버) -> dict:
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge, **서버)
    세션 = (await 교환(api, 값["loginCode"], verifier)).json()["data"]
    return {"Authorization": f"Bearer {세션['accessToken']}"}


async def 다시_확인(api, headers, action="delete_account", **서버):
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge, **서버)
    return await api.post(
        "/v1/auth/oauth/reauth",
        json={"action": action, "loginCode": 값["loginCode"], "codeVerifier": verifier},
        headers=headers,
    )


async def test_소셜로만_가입한_계정은_제공자로_다시_로그인해_계정을_지운다(api, db):
    headers = await 카카오로_가입한다(api)
    me = (await api.get("/v1/me", headers=headers)).json()["data"]
    비밀번호로 = await api.post("/v1/auth/reauth", json={"action": "delete_account", "password": "x"}, headers=headers)

    확인 = await 다시_확인(api, headers)
    삭제 = await api.request("DELETE", "/v1/me", json={"reauthProof": 확인.json()["data"]["proof"]}, headers=headers)

    assert (me["hasPassword"], me["linkedProviders"]) == (False, ["kakao"])
    assert 비밀번호로.status_code == 403
    assert 확인.status_code == 201, 확인.text
    assert 삭제.status_code == 202, 삭제.text


async def test_소셜로만_가입한_계정은_제공자로_다시_확인하고_비밀번호를_정한다(api, db):
    headers = await 카카오로_가입한다(api)

    확인 = await 다시_확인(api, headers, action="change_password")
    정하기 = await api.post(
        "/v1/me/password",
        json={"reauthProof": 확인.json()["data"]["proof"], "newPassword": 비밀번호},
        headers=headers,
    )
    me = (await api.get("/v1/me", headers=headers)).json()["data"]
    이메일로 = await api.post(
        "/v1/auth/login",
        json={"email": "sky@example.com", "password": 비밀번호, "device": {**기기, "installationId": "설치-다른"}},
    )

    assert 정하기.status_code == 200, 정하기.text
    assert me["hasPassword"] is True
    assert 이메일로.status_code == 200


async def test_다른_사람의_소셜_계정으로는_다시_확인할_수_없다(api, db):
    headers = await 카카오로_가입한다(api)
    # 다른 카카오 계정(다른 번호·이메일)으로 로그인 코드를 받는다.
    남의_것 = await 다시_확인(api, headers, 번호=9999, 이메일="other@example.com")
    같은_코드_다시 = await 다시_확인(api, headers, action="cancel_deletion")

    assert 남의_것.status_code == 403
    assert 같은_코드_다시.status_code == 201
    assert await db.scalar(select(func.count()).select_from(User).where(User.email == "other@example.com")) == 0


async def test_다시_확인의_증표는_그_작업에만_쓴다(api, db):
    headers = await 카카오로_가입한다(api)
    취소용 = (await 다시_확인(api, headers, action="cancel_deletion")).json()["data"]["proof"]

    삭제 = await api.request("DELETE", "/v1/me", json={"reauthProof": 취소용}, headers=headers)

    assert 삭제.status_code == 403


async def test_verifier_가_틀린_다시_확인은_코드를_버린다(api, db):
    headers = await 카카오로_가입한다(api)
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)
    틀림 = await api.post(
        "/v1/auth/oauth/reauth",
        json={"action": "delete_account", "loginCode": 값["loginCode"], "codeVerifier": "x" * 43},
        headers=headers,
    )
    다시 = await api.post(
        "/v1/auth/oauth/reauth",
        json={"action": "delete_account", "loginCode": 값["loginCode"], "codeVerifier": verifier},
        headers=headers,
    )

    assert 틀림.status_code == 403
    assert 다시.status_code == 401


async def test_소셜로_처음_가입할_때도_약관_동의가_있어야_한다(api, db):
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)

    응답 = await api.post(
        "/v1/auth/oauth/exchange", json={"loginCode": 값["loginCode"], "codeVerifier": verifier, "device": 기기}
    )

    assert 응답.status_code == 422 and "agreedTermsVersion" in 응답.text
    assert await db.scalar(select(func.count()).select_from(User)) == 0


async def test_소셜로_가입하면_동의한_약관_판이_남는다(api, db):
    verifier, challenge = pkce()
    값 = await 로그인_코드(api, challenge)
    await 교환(api, 값["loginCode"], verifier)

    user = await db.scalar(select(User).where(User.email == "sky@example.com"))
    assert user.terms_version == "2026-09-15" and user.terms_agreed_at is not None
