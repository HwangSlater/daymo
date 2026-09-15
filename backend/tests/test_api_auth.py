import pytest
from sqlalchemy import func, select

from app.models import Device, RefreshToken, User
from app.services.mailer import get_outbox

pytestmark = pytest.mark.anyio

# example.com 은 RFC 2606 이 문서용으로 예약한 도메인이라 실제로 닿지 않는다.
# `.test` 는 email-validator 가 특수 용도 도메인이라 거부해서 쓸 수 없다.
이메일 = "sky@example.com"
비밀번호 = "산책하는 오후 7시"
기기 = {"installationId": "설치-1", "platform": "ios", "deviceName": "내 폰"}


def 링크_토큰() -> str:
    편지 = get_outbox().last
    assert 편지 is not None
    return 편지.link.split("token=", 1)[1]


async def 가입(api, email=이메일, password=비밀번호, name="하늘"):
    return await api.post(
        "/v1/auth/signup", json={"email": email, "password": password, "displayName": name}
    )


async def 확인된_계정(api, email=이메일, password=비밀번호):
    await 가입(api, email, password)
    await api.post("/v1/auth/email-verifications/confirm", json={"token": 링크_토큰()})


async def 로그인(api, email=이메일, password=비밀번호, 기기정보=None):
    return await api.post(
        "/v1/auth/login",
        json={"email": email, "password": password, "device": 기기정보 or 기기},
    )


# ---------------------------------------------------------------------------
# 가입
# ---------------------------------------------------------------------------


async def test_가입하면_확인_메일이_나간다(api, db):
    응답 = await 가입(api)

    assert 응답.status_code == 202
    assert 응답.json()["data"]["status"] == "accepted"
    assert get_outbox().last.to == 이메일
    assert "verify-email?token=" in get_outbox().last.link


async def test_이미_있는_이메일도_같은_응답이다(api, db):
    """
    여기서 오류를 내면 누구나 이메일만 넣어 보면서 어떤 사람이 이 서비스를
    쓰는지 알아낼 수 있다.
    """
    첫_응답 = await 가입(api)
    get_outbox().clear()

    둘째_응답 = await 가입(api, name="다른사람")

    assert 둘째_응답.status_code == 첫_응답.status_code
    assert 둘째_응답.json() == 첫_응답.json() or 둘째_응답.json()["data"] == 첫_응답.json()["data"]
    # 계정이 덮어써지지 않아야 한다.
    assert await db.scalar(select(User.display_name).where(User.email == 이메일)) == "하늘"


async def test_이미_있는_이메일이면_주인에게_알린다(api, db):
    """실제 주인은 상황을 알게 되고, 주인이 아닌 쪽은 아무것도 알 수 없다."""
    await 가입(api)
    get_outbox().clear()

    await 가입(api)

    assert "가입을 시도" in get_outbox().last.subject


async def test_흔한_비밀번호는_전용_코드로_거부한다(api, db):
    응답 = await 가입(api, password="password123")

    assert 응답.status_code == 422
    assert 응답.json()["error"]["code"] == "PASSWORD_TOO_COMMON"


async def test_이메일_모양이_아니면_거부한다(api, db):
    응답 = await 가입(api, email="이건 이메일이 아니다")

    assert 응답.status_code == 422


async def test_모르는_칸을_보내면_거부한다(api, db):
    """앱이 잘못된 이름으로 보내는 것을 조용히 무시하지 않는다."""
    응답 = await api.post(
        "/v1/auth/signup",
        json={
            "email": 이메일,
            "password": 비밀번호,
            "displayName": "하늘",
            "isAdmin": True,
        },
    )

    assert 응답.status_code == 422


# ---------------------------------------------------------------------------
# 이메일 확인
# ---------------------------------------------------------------------------


async def test_링크로_이메일을_확인한다(api, db):
    await 가입(api)

    응답 = await api.post("/v1/auth/email-verifications/confirm", json={"token": 링크_토큰()})

    assert 응답.status_code == 200
    assert await db.scalar(select(User.email_verified_at).where(User.email == 이메일))


async def test_같은_링크를_두_번_쓸_수_없다(api, db):
    await 가입(api)
    토큰 = 링크_토큰()
    await api.post("/v1/auth/email-verifications/confirm", json={"token": 토큰})

    응답 = await api.post("/v1/auth/email-verifications/confirm", json={"token": 토큰})

    assert 응답.status_code == 422


async def test_바로_재전송하면_막힌다(api, db):
    """재전송은 요청 사이 60초다. 연타로 메일을 퍼붓게 두지 않는다."""
    await 가입(api)

    응답 = await api.post("/v1/auth/email-verifications", json={"email": 이메일})

    assert 응답.status_code == 429
    assert 응답.json()["error"]["code"] == "RATE_LIMITED"
    assert "retryAfterSeconds" in 응답.json()["error"]["fields"]


async def test_재전송하면_예전_링크가_죽는다(api, db, 시도_시각을_되돌린다):
    """메일함을 한 번 본 사람이 오래된 링크로 들어올 수 있으면 안 된다."""
    await 가입(api)
    옛_토큰 = 링크_토큰()
    await 시도_시각을_되돌린다(61)

    await api.post("/v1/auth/email-verifications", json={"email": 이메일})
    새_토큰 = 링크_토큰()

    assert 새_토큰 != 옛_토큰
    assert (
        await api.post("/v1/auth/email-verifications/confirm", json={"token": 옛_토큰})
    ).status_code == 422
    assert (
        await api.post("/v1/auth/email-verifications/confirm", json={"token": 새_토큰})
    ).status_code == 200


async def test_없는_계정에_재전송해도_같은_응답이다(api, db):
    응답 = await api.post("/v1/auth/email-verifications", json={"email": "nobody@example.com"})

    assert 응답.status_code == 202
    assert get_outbox().last is None


# ---------------------------------------------------------------------------
# 로그인
# ---------------------------------------------------------------------------


async def test_로그인하면_토큰_두_개가_나온다(api, db):
    await 확인된_계정(api)

    응답 = await 로그인(api)

    본문 = 응답.json()["data"]
    assert 응답.status_code == 200
    assert 본문["accessToken"] and 본문["refreshToken"]
    assert 본문["expiresIn"] == 900
    assert 본문["endedDevices"] == []


async def test_내_프로필과_참여_공간을_조회한다(api, db):
    await 확인된_계정(api)
    access_token = (await 로그인(api)).json()["data"]["accessToken"]

    응답 = await api.get("/v1/me", headers={"Authorization": f"Bearer {access_token}"})

    assert 응답.status_code == 200
    assert 응답.json()["data"] == {
        "id": 응답.json()["data"]["id"],
        "email": 이메일,
        "displayName": "하늘",
        "avatarUrl": None,
        "spaces": [],
        "deletionScheduledAt": None,
    }


async def test_내_프로필은_로그인해야_조회할_수_있다(api, db):
    응답 = await api.get("/v1/me")

    assert 응답.status_code == 401
    assert 응답.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.parametrize(
    ("email", "password"),
    [
        (이메일, "틀린 비밀번호입니다"),
        ("nobody@example.com", 비밀번호),
    ],
)
async def test_없는_계정과_틀린_비밀번호가_같은_오류다(api, db, email, password):
    """
    문구가 갈리면 그것만으로 어떤 이메일이 가입돼 있는지 알 수 있다.
    """
    await 확인된_계정(api)

    응답 = await 로그인(api, email, password)

    assert 응답.status_code == 401
    assert 응답.json()["error"]["message"] == "이메일 또는 비밀번호를 확인해 주세요."


async def test_비밀번호가_응답_어디에도_없다(api, db):
    await 확인된_계정(api)

    응답 = await 로그인(api)

    assert 비밀번호 not in 응답.text


# ---------------------------------------------------------------------------
# 갱신과 로그아웃
# ---------------------------------------------------------------------------


async def test_갱신하면_토큰이_바뀐다(api, db):
    await 확인된_계정(api)
    첫_토큰 = (await 로그인(api)).json()["data"]["refreshToken"]

    응답 = await api.post("/v1/auth/refresh", json={"refreshToken": 첫_토큰})

    assert 응답.status_code == 200
    assert 응답.json()["data"]["refreshToken"] != 첫_토큰


async def test_재사용하면_거부하고_사유를_알려_주지_않는다(api, db):
    await 확인된_계정(api)
    첫_토큰 = (await 로그인(api)).json()["data"]["refreshToken"]
    await api.post("/v1/auth/refresh", json={"refreshToken": 첫_토큰})

    응답 = await api.post("/v1/auth/refresh", json={"refreshToken": 첫_토큰})

    assert 응답.status_code == 401
    본문 = 응답.text
    assert "재사용" not in 본문 and "만료" not in 본문


async def test_로그아웃은_모르는_토큰에도_204다(api, db):
    """오류를 내면 어떤 토큰이 살아 있는지 알려 주는 셈이다."""
    응답 = await api.post("/v1/auth/logout", json={"refreshToken": "이런 토큰은 없다"})

    assert 응답.status_code == 204


# ---------------------------------------------------------------------------
# 비밀번호 재설정
# ---------------------------------------------------------------------------


async def test_재설정하면_모든_세션이_끊긴다(api, db):
    """새 비밀번호만 주고 기존 세션을 두면 침입자가 그대로 남는다."""
    await 확인된_계정(api)
    세션 = (await 로그인(api)).json()["data"]
    get_outbox().clear()
    await api.post("/v1/auth/password/forgot", json={"email": 이메일})

    새_비밀번호 = "다시 정한 문장이다"
    응답 = await api.post(
        "/v1/auth/password/reset", json={"token": 링크_토큰(), "newPassword": 새_비밀번호}
    )

    assert 응답.status_code == 200
    끊긴_뒤 = await api.post("/v1/auth/refresh", json={"refreshToken": 세션["refreshToken"]})
    assert 끊긴_뒤.status_code == 401
    assert (await 로그인(api, password=새_비밀번호)).status_code == 200


async def test_없는_계정에_재설정을_요청해도_같은_응답이다(api, db):
    응답 = await api.post("/v1/auth/password/forgot", json={"email": "nobody@example.com"})

    assert 응답.status_code == 202
    assert get_outbox().last is None


async def test_재설정에도_같은_비밀번호_규칙이_걸린다(api, db):
    await 확인된_계정(api)
    get_outbox().clear()
    await api.post("/v1/auth/password/forgot", json={"email": 이메일})

    응답 = await api.post(
        "/v1/auth/password/reset", json={"token": 링크_토큰(), "newPassword": "qwerty123"}
    )

    assert 응답.status_code == 422
    assert 응답.json()["error"]["code"] == "PASSWORD_TOO_COMMON"


# ---------------------------------------------------------------------------
# 세션 목록
# ---------------------------------------------------------------------------


async def test_토큰_없이는_세션_목록을_볼_수_없다(api, db):
    응답 = await api.get("/v1/auth/sessions")

    assert 응답.status_code == 401


async def test_지금_쓰는_기기에_표시가_붙는다(api, db):
    """사용자가 자기가 들고 있는 기기를 실수로 끊지 않게 한다."""
    await 확인된_계정(api)
    세션 = (await 로그인(api)).json()["data"]

    응답 = await api.get(
        "/v1/auth/sessions", headers={"Authorization": f"Bearer {세션['accessToken']}"}
    )

    (줄,) = 응답.json()["data"]
    assert 줄["current"] is True
    assert 줄["displayName"] == "내 폰"


async def test_다른_기기를_끊을_수_있다(api, db):
    await 확인된_계정(api)
    다른_기기 = await 로그인(api, 기기정보={"installationId": "설치-2", "platform": "android"})
    내_세션 = (await 로그인(api)).json()["data"]
    다른_기기_id = 다른_기기.json()["data"]["deviceId"]

    응답 = await api.delete(
        f"/v1/auth/sessions/{다른_기기_id}",
        headers={"Authorization": f"Bearer {내_세션['accessToken']}"},
    )

    assert 응답.status_code == 204
    살아있는 = await db.scalar(
        select(func.count()).select_from(Device).where(Device.revoked_at.is_(None))
    )
    assert 살아있는 == 1


async def test_남의_기기는_끊을_수_없고_404다(api, db):
    """없는 기기와 남의 기기를 다르게 답하면 어떤 id 가 있는지 알 수 있다."""
    await 확인된_계정(api)
    남의_세션 = (await 로그인(api)).json()["data"]

    await 가입(api, email="other@example.com")
    await api.post("/v1/auth/email-verifications/confirm", json={"token": 링크_토큰()})
    내_세션 = (
        await 로그인(api, email="other@example.com", 기기정보={"installationId": "설치-9"})
    ).json()["data"]

    응답 = await api.delete(
        f"/v1/auth/sessions/{남의_세션['deviceId']}",
        headers={"Authorization": f"Bearer {내_세션['accessToken']}"},
    )

    assert 응답.status_code == 404


async def test_끊긴_기기의_access_token은_바로_막힌다(api, db):
    """
    access token 자체는 폐기할 수 없지만 기기 줄을 보면 바로 막을 수 있다.
    이것이 없으면 끊은 기기가 최대 15분 동안 계속 쓴다.
    """
    await 확인된_계정(api)
    끊길_기기 = (
        await 로그인(api, 기기정보={"installationId": "설치-2", "platform": "android"})
    ).json()["data"]
    내_세션 = (await 로그인(api)).json()["data"]

    await api.delete(
        f"/v1/auth/sessions/{끊길_기기['deviceId']}",
        headers={"Authorization": f"Bearer {내_세션['accessToken']}"},
    )

    응답 = await api.get(
        "/v1/auth/sessions", headers={"Authorization": f"Bearer {끊길_기기['accessToken']}"}
    )
    assert 응답.status_code == 401


async def test_망가진_토큰은_401이다(api, db):
    # 헤더는 latin-1 만 실을 수 있어서 한글을 쓰지 않는다.
    응답 = await api.get("/v1/auth/sessions", headers={"Authorization": "Bearer not-a-token"})

    assert 응답.status_code == 401
    assert 응답.json()["error"]["code"] == "UNAUTHENTICATED"


async def test_갱신_토큰을_access_자리에_넣을_수_없다(api, db):
    await 확인된_계정(api)
    세션 = (await 로그인(api)).json()["data"]

    응답 = await api.get(
        "/v1/auth/sessions", headers={"Authorization": f"Bearer {세션['refreshToken']}"}
    )

    assert 응답.status_code == 401


async def test_실패한_요청은_아무것도_남기지_않는다(api, db):
    """
    한 요청이 절반만 반영되면 안 된다. 비밀번호가 막히면 계정도 남지
    않아야 한다.
    """
    이전_수 = await db.scalar(select(func.count()).select_from(User))

    await 가입(api, email="fresh@example.com", password="password")

    assert await db.scalar(select(func.count()).select_from(User)) == 이전_수
    assert await db.scalar(select(func.count()).select_from(RefreshToken)) == 0


# ---------------------------------------------------------------------------
# 시도 제한
# ---------------------------------------------------------------------------


async def test_로그인_실패가_쌓이면_막힌다(api, db):
    """앱이 막는 것으로는 부족하다. API 를 직접 부르는 쪽에서 뚫린다."""
    await 확인된_계정(api)

    for _ in range(5):
        assert (await 로그인(api, password="틀린 비밀번호다")).status_code == 401

    응답 = await 로그인(api, password="틀린 비밀번호다")
    assert 응답.status_code == 429


async def test_막혔을_때_맞는_비밀번호도_막힌다(api, db):
    await 확인된_계정(api)
    for _ in range(5):
        await 로그인(api, password="틀린 비밀번호다")

    assert (await 로그인(api)).status_code == 429


async def test_막혀도_계정_존재를_드러내지_않는다(api, db):
    """어떤 기준에 걸렸는지도 알려 주지 않는다."""
    await 확인된_계정(api)
    for _ in range(5):
        await 로그인(api, password="틀린 비밀번호다")

    응답 = await 로그인(api, password="틀린 비밀번호다")

    본문 = 응답.text
    assert 이메일 not in 본문
    assert "계정" not in 본문


async def test_실패_기록은_롤백되지_않는다(api, db):
    """
    로그인 실패는 401 로 끝나고 그 요청의 transaction 은 되돌려진다. 세는
    일을 같은 세션에서 하면 횟수가 영영 쌓이지 않아, 제한이 있는 것처럼
    보이지만 아무것도 막지 못한다.
    """
    from app.models import ThrottleCounter

    await 확인된_계정(api)

    await 로그인(api, password="틀린 비밀번호다")

    남은_줄 = await db.scalar(
        select(func.count()).select_from(ThrottleCounter)
    )
    assert 남은_줄 >= 1


async def test_성공하면_계정_기준_실패가_풀린다(api, db):
    """
    IP 기준은 남긴다. 한 IP 에서 여러 계정을 찍어 보는 공격은 그중 하나가
    맞았다고 멈출 이유가 없다.
    """
    await 확인된_계정(api)
    for _ in range(5):
        await 로그인(api, password="틀린 비밀번호다")
    assert (await 로그인(api)).status_code == 429

    # 계정 기준만 손으로 푼다(로그인 성공이 하는 일과 같다).
    from app.models import ThrottleScope
    from app.services import throttle

    await throttle.reset(
        ThrottleScope.LOGIN, throttle.key_for("email", 이메일)
    )

    assert (await 로그인(api)).status_code == 200


# ---------------------------------------------------------------------------
# 재인증 증표
# ---------------------------------------------------------------------------


async def test_비밀번호로_증표를_받는다(api, db):
    await 확인된_계정(api)
    세션 = (await 로그인(api)).json()["data"]

    응답 = await api.post(
        "/v1/auth/reauth",
        json={"action": "delete_account", "password": 비밀번호},
        headers={"Authorization": f"Bearer {세션['accessToken']}"},
    )

    assert 응답.status_code == 201
    assert 응답.json()["data"]["proof"]
    assert 응답.json()["data"]["expiresIn"] == 300


async def test_틀린_비밀번호로는_증표를_받지_못한다(api, db):
    await 확인된_계정(api)
    세션 = (await 로그인(api)).json()["data"]

    응답 = await api.post(
        "/v1/auth/reauth",
        json={"action": "delete_account", "password": "틀린 비밀번호다"},
        headers={"Authorization": f"Bearer {세션['accessToken']}"},
    )

    # 401 이면 앱이 토큰 만료로 읽고 로그아웃시킨다. 로그인은 그대로다.
    assert 응답.status_code == 403
    assert (await api.get("/v1/me", headers={"Authorization": f"Bearer {세션['accessToken']}"})).status_code == 200


async def test_재인증_비밀번호를_계속_틀리면_막힌다(api, db):
    await 확인된_계정(api)
    세션 = (await 로그인(api)).json()["data"]
    headers = {"Authorization": f"Bearer {세션['accessToken']}"}

    for _ in range(6):
        await api.post(
            "/v1/auth/reauth", json={"action": "delete_account", "password": "틀린 비밀번호다"}, headers=headers
        )
    응답 = await api.post(
        "/v1/auth/reauth", json={"action": "delete_account", "password": 비밀번호}, headers=headers
    )

    assert 응답.status_code == 429


async def test_로그인하지_않으면_증표를_받을_수_없다(api, db):
    응답 = await api.post(
        "/v1/auth/reauth", json={"action": "delete_account", "password": 비밀번호}
    )

    assert 응답.status_code == 401


async def test_모르는_작업_종류는_거부한다(api, db):
    await 확인된_계정(api)
    세션 = (await 로그인(api)).json()["data"]

    응답 = await api.post(
        "/v1/auth/reauth",
        json={"action": "공간_삭제", "password": 비밀번호},
        headers={"Authorization": f"Bearer {세션['accessToken']}"},
    )

    assert 응답.status_code == 422


async def test_같은_IP의_다른_사람은_잇달아_가입할_수_있다(api, db):
    """
    재전송 간격은 계정 기준이다. IP 에 걸면 같은 와이파이나 통신사 NAT 뒤의
    서로 다른 두 사람이 1분 안에 가입할 때 두 번째 사람이 막힌다.
    """
    첫째 = await 가입(api, email="first@example.com")
    둘째 = await 가입(api, email="second@example.com")

    assert 첫째.status_code == 202
    assert 둘째.status_code == 202
    assert get_outbox().last.to == "second@example.com"
