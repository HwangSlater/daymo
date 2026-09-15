from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_pages import _form, _message
from app.api.deps import ClientIp, CurrentCaller, DbSession
from app.api.v1.auth import _세션_응답
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.responses import error_response, ok
from app.models import OAuthProvider
from app.schemas.auth import OAuthExchangeRequest, OAuthLinkRequest, OAuthReauthRequest
from app.services.oauth import flow
from app.services.reauth import PROOF_TTL
from app.services.oauth.providers import configured_providers

router = APIRouter(prefix="/auth/oauth", tags=["auth"])

# 이 장의 요청은 transaction 을 응답을 보내기 전에 끝내야 한다. callback 이 앱으로
# loginCode 를 보낸 순간 commit 전이면, 앱이 곧바로 exchange 를 부를 때 없는 코드가 된다.
# 이제 모든 요청이 그렇게 돈다(app/api/deps.py 의 SessionDepends).
OAuthDb = DbSession


def _device(body) -> flow.DeviceArgs:
    return flow.DeviceArgs(
        installation_id=body.device.installation_id,
        platform=body.device.platform,
        app_version=body.device.app_version,
        device_name=body.device.device_name,
    )


@router.get("/providers")
async def list_providers() -> dict:
    """
    지금 켜져 있는 제공자.

    앱은 여기 있는 버튼만 보여 준다. 키를 넣지 않은 제공자의 버튼이 보이면
    눌러도 되지 않는 버튼이 되고, 스토어 심사에서 반려 사유다.
    """
    return ok({"providers": [p.value for p in configured_providers(get_settings())]})


@router.get("/{provider}/start")
async def start(
    provider: OAuthProvider,
    db: OAuthDb,
    redirect_uri: Annotated[str, Query(alias="redirectUri", max_length=200)],
    state: Annotated[str, Query(max_length=128)],
    code_challenge: Annotated[str, Query(alias="codeChallenge", max_length=128)],
    code_challenge_method: Annotated[str, Query(alias="codeChallengeMethod", max_length=10)] = "S256",
) -> RedirectResponse:
    """
    로그인 창을 연다. 앱이 시스템 브라우저로 이 주소를 열면 제공자 화면으로 넘어간다.

    앱이 만든 `state` 와 PKCE `codeChallenge` 를 받아 둔다. 토큰은 끝까지 주소에
    싣지 않는다.
    """
    주소 = await flow.start(
        db,
        provider_name=provider,
        app_redirect_uri=redirect_uri,
        app_state=state,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
    )
    return RedirectResponse(주소, status_code=302, headers={"Cache-Control": "no-store"})


async def _callback(provider: OAuthProvider, db: AsyncSession, params: dict[str, str]) -> Response:
    결과 = await flow.callback(db, provider_name=provider, params=params)
    if 결과.app_url is None:
        return _message(
            "로그인을 이어 가지 못했어요",
            "시간이 지났거나 이미 끝난 로그인이에요. 이 창을 닫고 Daymo 앱에서 다시 시도해 주세요.",
            400,
        )
    # 폼 POST(Apple) 뒤에도 GET 으로 넘어가게 303 이다. 앱 주소라 브라우저가 아니라
    # 앱이 받는다.
    return RedirectResponse(
        결과.app_url,
        status_code=303,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@router.get("/{provider}/callback", include_in_schema=False)
async def callback(provider: OAuthProvider, request: Request, db: OAuthDb) -> Response:
    params = {이름: 값 for 이름, 값 in request.query_params.items()}
    return await _callback(provider, db, params)


@router.post("/{provider}/callback", include_in_schema=False)
async def callback_form_post(provider: OAuthProvider, request: Request, db: OAuthDb) -> Response:
    """
    Apple 은 이메일·이름을 달라고 하면 결과를 POST 폼으로 보낸다.

    Apple 서버가 아니라 사용자 브라우저가 appleid.apple.com 에서 이 주소로 폼을
    보낸다. 그래서 다른 사이트에서 오는 POST 를 막을 수 없고, 막을 필요도 없다.
    우리가 발급한 state 가 없으면 아무것도 하지 않는다.
    """
    return await _callback(provider, db, await _form(request))


@router.post("/exchange", response_model=None)
async def exchange(body: OAuthExchangeRequest, db: OAuthDb) -> Response | dict:
    """
    앱 주소로 받은 loginCode 를 세션으로 바꾼다.

    같은 이메일의 계정이 이미 있으면 `ACCOUNT_LINK_REQUIRED` 와 함께
    `details.linkToken` 을 준다. 앱은 비밀번호를 받아 `/auth/oauth/link` 로 보낸다.
    """
    결과 = await flow.exchange(
        db,
        login_code=body.login_code,
        code_verifier=body.code_verifier,
        device=_device(body),
        agreed_terms_version=body.agreed_terms_version,
        age_confirmed=body.age_confirmed,
    )
    if isinstance(결과, AppError):
        # raise 하지 않는다. 쓴 loginCode 와 연결 토큰이 commit 되어야 한다.
        return error_response(
            결과.code, message=결과.detail, fields=결과.fields, details=결과.details
        )
    return ok(_세션_응답(결과))


@router.post("/reauth", status_code=201, response_model=None)
async def reauth(body: OAuthReauthRequest, caller: CurrentCaller, db: OAuthDb, ip: ClientIp) -> Response | dict:
    """
    로그인한 사람이 연결된 제공자로 다시 로그인한 결과(loginCode)로 증표를 받는다.

    `POST /auth/reauth` 의 비밀번호 대신이다. 받은 증표는 `DELETE /me` 같은 곳에 싣는다.
    """
    결과 = await flow.reauth_with_provider(
        db,
        user=caller.user,
        action=body.action,
        login_code=body.login_code,
        code_verifier=body.code_verifier,
        ip=ip,
    )
    if isinstance(결과, AppError):
        return error_response(결과.code, message=결과.detail, fields=결과.fields, details=결과.details)
    return ok({"proof": 결과, "expiresIn": int(PROOF_TTL.total_seconds())})


@router.post("/link")
async def link(body: OAuthLinkRequest, db: OAuthDb, ip: ClientIp) -> dict:
    """같은 이메일의 기존 계정 비밀번호로 확인하고, 제공자를 붙인 뒤 로그인한다."""
    세션 = await flow.link_with_password(
        db, link_token=body.link_token, password=body.password, device=_device(body), ip=ip
    )
    return ok(_세션_응답(세션))



