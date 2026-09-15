import json
import time
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from app.core.config import Settings
from app.services.oauth import providers
from app.services.oauth.providers import Apple, Google, Naver, ProviderError

pytestmark = pytest.mark.anyio

# 제공자마다 다른 부분만 본다. 계정과 세션은 test_api_oauth.py 가 본다.
# 제공자 서버는 가짜 transport 가 대신하고, id_token 은 테스트에서 만든 키로 서명한다.

NONCE = "nonce-from-state-row"


@pytest.fixture(autouse=True)
def 제공자_서버를_비운다():
    yield
    providers.http_transport = None
    providers._GOOGLE_JWKS._keys = {}
    providers._APPLE_JWKS._keys = {}


def _설정(**값) -> Settings:
    return Settings(jwt_signing_key="x" * 40, refresh_token_pepper="y" * 40, **값)


@pytest.fixture(scope="module")
def rsa_키():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _jwks(키, kid="kid-1") -> dict:
    공개 = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(키.public_key()))
    return {"keys": [{**공개, "kid": kid, "alg": "RS256", "use": "sig"}]}


def _id_token(키, *, iss, aud, nonce=NONCE, kid="kid-1", **claims) -> str:
    지금 = int(time.time())
    return jwt.encode(
        {"iss": iss, "aud": aud, "sub": "subject-1", "iat": 지금, "exp": 지금 + 600, "nonce": nonce, **claims},
        키,
        algorithm="RS256",
        headers={"kid": kid},
    )


def _서버(경로별: dict[str, httpx.Response], 받은: list | None = None):
    def 응답(request: httpx.Request) -> httpx.Response:
        if 받은 is not None:
            받은.append(request)
        return 경로별.get(f"{request.url.host}{request.url.path}", httpx.Response(404))

    providers.http_transport = httpx.MockTransport(응답)


# ---------------------------------------------------------------------------
# Google
# ---------------------------------------------------------------------------

GOOGLE = {"google_client_id": "google-client.apps.googleusercontent.com", "google_client_secret": "secret"}


def test_google_로그인_창은_nonce_와_계정_선택을_단다():
    주소 = urlsplit(Google(_설정(**GOOGLE)).authorize_url(state="s", nonce=NONCE))
    값 = parse_qs(주소.query)
    assert 주소.netloc == "accounts.google.com"
    assert 값["nonce"] == [NONCE]
    assert 값["scope"] == ["openid email profile"]
    assert 값["prompt"] == ["select_account"]


async def test_google_id_token_으로_사람을_확인한다(rsa_키):
    받은: list[httpx.Request] = []
    토큰 = _id_token(
        rsa_키,
        iss="https://accounts.google.com",
        aud=GOOGLE["google_client_id"],
        email="sky@example.com",
        email_verified=True,
        name="하늘",
    )
    _서버(
        {
            "oauth2.googleapis.com/token": httpx.Response(200, json={"id_token": 토큰, "access_token": "a"}),
            "www.googleapis.com/oauth2/v3/certs": httpx.Response(200, json=_jwks(rsa_키)),
        },
        받은,
    )

    나 = await Google(_설정(**GOOGLE)).fetch_identity(code="c", nonce=NONCE, form={})

    assert (나.subject, 나.email, 나.email_verified, 나.name) == ("subject-1", "sky@example.com", True, "하늘")
    토큰_요청 = parse_qs(받은[0].content.decode())
    assert 토큰_요청["redirect_uri"] == ["https://api.daymo.xyz/v1/auth/oauth/google/callback"]


@pytest.mark.parametrize(
    "바꿀_것",
    [
        {"nonce": "다른-로그인의-nonce"},
        {"aud": "someone-else.apps.googleusercontent.com"},
        {"iss": "https://evil.example.com"},
    ],
)
async def test_google_id_token_이_이_로그인의_것이_아니면_거절한다(rsa_키, 바꿀_것):
    값 = {"iss": "https://accounts.google.com", "aud": GOOGLE["google_client_id"], **바꿀_것}
    _서버(
        {
            "oauth2.googleapis.com/token": httpx.Response(200, json={"id_token": _id_token(rsa_키, **값)}),
            "www.googleapis.com/oauth2/v3/certs": httpx.Response(200, json=_jwks(rsa_키)),
        }
    )
    with pytest.raises(ProviderError):
        await Google(_설정(**GOOGLE)).fetch_identity(code="c", nonce=NONCE, form={})


async def test_google_남의_키로_서명한_id_token_은_거절한다(rsa_키):
    남의_키 = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    토큰 = _id_token(남의_키, iss="https://accounts.google.com", aud=GOOGLE["google_client_id"])
    _서버(
        {
            "oauth2.googleapis.com/token": httpx.Response(200, json={"id_token": 토큰}),
            "www.googleapis.com/oauth2/v3/certs": httpx.Response(200, json=_jwks(rsa_키)),
        }
    )
    with pytest.raises(ProviderError):
        await Google(_설정(**GOOGLE)).fetch_identity(code="c", nonce=NONCE, form={})


# ---------------------------------------------------------------------------
# Apple
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def apple_키():
    return ec.generate_private_key(ec.SECP256R1())


def _apple_설정(apple_키) -> Settings:
    pem = apple_키.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    return _설정(
        apple_client_id="xyz.daymo.signin",
        apple_team_id="TEAM123456",
        apple_key_id="KEY1234567",
        # 환경 변수에 한 줄로 넣은 모양 그대로.
        apple_private_key=pem.replace("\n", "\\n"),
    )


def test_apple_은_폼으로_돌려받는다(apple_키):
    값 = parse_qs(urlsplit(Apple(_apple_설정(apple_키)).authorize_url(state="s", nonce=NONCE)).query)
    assert 값["response_mode"] == ["form_post"]
    assert 값["scope"] == ["name email"]


def test_apple_client_secret_은_우리_키로_서명한_짧은_JWT_다(apple_키):
    secret = Apple(_apple_설정(apple_키)).client_secret(now=1_700_000_000)

    assert jwt.get_unverified_header(secret)["kid"] == "KEY1234567"
    claims = jwt.decode(
        secret,
        apple_키.public_key(),
        algorithms=["ES256"],
        audience="https://appleid.apple.com",
        options={"verify_exp": False},
    )
    assert claims["iss"] == "TEAM123456"
    assert claims["sub"] == "xyz.daymo.signin"
    assert claims["exp"] - claims["iat"] == 300


async def test_apple_이름은_처음_폼에서_받는다(apple_키, rsa_키):
    토큰 = _id_token(
        rsa_키,
        iss="https://appleid.apple.com",
        aud="xyz.daymo.signin",
        email="abc@privaterelay.appleid.com",
        email_verified="true",
    )
    _서버(
        {
            "appleid.apple.com/auth/token": httpx.Response(200, json={"id_token": 토큰}),
            "appleid.apple.com/auth/keys": httpx.Response(200, json=_jwks(rsa_키)),
        }
    )
    폼 = {"user": json.dumps({"name": {"firstName": "하늘", "lastName": "김"}})}

    나 = await Apple(_apple_설정(apple_키)).fetch_identity(code="c", nonce=NONCE, form=폼)

    assert 나.email == "abc@privaterelay.appleid.com"
    assert 나.email_verified is True
    assert 나.name == "김하늘"


# ---------------------------------------------------------------------------
# Naver
# ---------------------------------------------------------------------------

NAVER = {"naver_client_id": "naver-id", "naver_client_secret": "naver-secret"}


async def test_naver_이메일은_확인된_것으로_치지_않는다():
    _서버(
        {
            "nid.naver.com/oauth2.0/token": httpx.Response(200, json={"access_token": "naver-token"}),
            "openapi.naver.com/v1/nid/me": httpx.Response(
                200,
                json={
                    "resultcode": "00",
                    "message": "success",
                    "response": {"id": "naver-subject", "email": "sky@example.com", "nickname": "하늘"},
                },
            ),
        }
    )

    나 = await Naver(_설정(**NAVER)).fetch_identity(code="c", nonce="", form={"state": "s"})

    assert (나.subject, 나.email, 나.email_verified, 나.name) == ("naver-subject", "sky@example.com", False, "하늘")


async def test_naver_는_실패도_200_으로_준다():
    _서버(
        {
            "nid.naver.com/oauth2.0/token": httpx.Response(
                200, json={"error": "invalid_request", "error_description": "no valid data in session"}
            ),
        }
    )
    with pytest.raises(ProviderError):
        await Naver(_설정(**NAVER)).fetch_identity(code="c", nonce="", form={"state": "s"})


def test_값이_빠진_제공자는_켜지지_않는다():
    설정 = _설정(google_client_id="only-id", naver_client_id="id", naver_client_secret="secret")
    assert providers.configured_providers(설정) == [providers.OAuthProvider.NAVER]
