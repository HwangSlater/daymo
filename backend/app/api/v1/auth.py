import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import select, update

from app.api.deps import ClientIp, CurrentCaller, DbSession
from app.core.errors import AppError, ErrorCode
from app.core.responses import ok
from app.core.tokens import ACCESS_TTL
from app.models import Device, RefreshToken, RevokeReason
from app.schemas.auth import (
    DeviceOut,
    EmailRequest,
    LoginRequest,
    PasswordResetRequest,
    RefreshRequest,
    SessionOut,
    ReauthRequest,
    SignUpRequest,
    TokenRequest,
)
from app.services import accounts
from app.services.reauth import PROOF_TTL, issue_proof
from app.services.auth_sessions import Session, end_session, rotate_session

router = APIRouter(prefix="/auth", tags=["auth"])

# 이 장의 응답은 대부분 계정이 있는지 없는지를 드러내지 않는다. 그래서 여러
# 경로가 무엇을 했든 같은 안내를 돌려준다. 실수로 갈라지지 않게 한 곳에 둔다.
_같은_안내 = {"status": "accepted"}

# 아직 없는 것을 적어 둔다. 명세서에는 있고 코드에는 없다.
#
# - bot challenge. 위험 신호가 쌓였을 때 요구하는 것인데, 검증할 공급자를
#   아직 고르지 않았다(개인정보 처리 국가·SDK·비용을 다시 승인해야 한다).
#   지금은 throttle 이 그 자리를 대신 막고 있다.
# - OAuth (사업자 키가 있어야 실제로 돌려 볼 수 있다)


def _세션_응답(세션: Session) -> dict:
    return SessionOut(
        access_token=세션.access_token,
        refresh_token=세션.refresh_token,
        expires_in=int(ACCESS_TTL.total_seconds()),
        device_id=str(세션.device_id),
        ended_devices=[
            {"displayName": d.display_name, "lastSeenAt": d.last_seen_at}
            for d in 세션.ended_devices
        ],
    ).model_dump(by_alias=True)


@router.post("/signup", status_code=status.HTTP_202_ACCEPTED)
async def sign_up(body: SignUpRequest, db: DbSession, ip: ClientIp) -> dict:
    """
    이메일로 가입한다.

    이미 있는 이메일이어도 같은 응답을 준다. 여기서 오류를 내면 누구나
    이메일만 넣어 보면서 어떤 사람이 이 서비스를 쓰는지 알아낼 수 있다.
    """
    await accounts.sign_up(
        db,
        email=body.email,
        password=body.password,
        display_name=body.display_name,
        ip=ip,
    )
    return ok(_같은_안내)


@router.post("/email-verifications", status_code=status.HTTP_202_ACCEPTED)
async def send_email_verification(body: EmailRequest, db: DbSession, ip: ClientIp) -> dict:
    """확인 링크를 보내거나 다시 보낸다. 계정이 없어도 같은 응답이다."""
    await accounts.send_email_verification(db, email=body.email, ip=ip)
    return ok(_같은_안내)


@router.post("/email-verifications/confirm")
async def confirm_email(body: TokenRequest, db: DbSession) -> dict:
    await accounts.confirm_email(db, token=body.token)
    return ok({"status": "verified"})


@router.post("/login")
async def log_in(body: LoginRequest, db: DbSession, ip: ClientIp) -> dict:
    세션 = await accounts.log_in(
        db,
        email=body.email,
        password=body.password,
        installation_id=body.device.installation_id,
        platform=body.device.platform,
        app_version=body.device.app_version,
        device_name=body.device.device_name,
        ip=ip,
    )
    return ok(_세션_응답(세션))


@router.post("/refresh")
async def refresh(body: RefreshRequest, db: DbSession) -> dict:
    """
    세션을 갱신한다.

    거부 사유를 나눠 적지 않는다. 만료인지 재사용인지 알려 주면 공격하는
    쪽에 힌트가 된다.
    """
    세션 = await rotate_session(db, body.refresh_token)
    return ok(_세션_응답(세션))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def log_out(body: RefreshRequest, db: DbSession) -> Response:
    """
    현재 세션을 끝낸다.

    모르는 토큰이어도 204 다. 오류를 내면 어떤 토큰이 살아 있는지 알려
    주는 셈이 된다.
    """
    await end_session(db, body.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/password/forgot", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(body: EmailRequest, db: DbSession, ip: ClientIp) -> dict:
    await accounts.request_password_reset(db, email=body.email, ip=ip)
    return ok(_같은_안내)


@router.post("/password/reset")
async def reset_password(body: PasswordResetRequest, db: DbSession) -> dict:
    """비밀번호를 바꾸고 그 계정의 모든 세션을 끊는다."""
    await accounts.reset_password(db, token=body.token, new_password=body.new_password)
    return ok({"status": "reset"})


@router.get("/sessions")
async def list_sessions(caller: CurrentCaller, db: DbSession) -> dict:
    """
    로그인된 기기 목록.

    지금 쓰는 기기에 `current` 를 붙여 준다. 사용자가 자기가 들고 있는
    기기를 실수로 끊지 않게 하려는 것이다.
    """
    기기들 = (
        await db.execute(
            select(Device)
            .where(Device.user_id == caller.user.id, Device.revoked_at.is_(None))
            .order_by(Device.last_seen_at.desc())
        )
    ).scalars().all()

    return ok(
        [
            DeviceOut(
                id=str(d.id),
                display_name=d.display_name,
                platform=d.platform,
                app_version=d.app_version,
                last_seen_at=d.last_seen_at,
                current=d.id == caller.device_id,
            ).model_dump(by_alias=True)
            for d in 기기들
        ]
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def end_other_session(session_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """
    다른 기기의 세션을 끊는다.

    남의 기기는 끊을 수 없다. 없는 기기와 남의 기기를 같은 404 로 돌려준다.
    다르게 답하면 어떤 id 가 존재하는지 알 수 있다.
    """
    device = await db.scalar(
        select(Device).where(
            Device.id == session_id,
            Device.user_id == caller.user.id,
            Device.revoked_at.is_(None),
        )
    )
    if device is None:
        raise AppError(ErrorCode.NOT_FOUND)

    from datetime import UTC, datetime

    지금 = datetime.now(UTC)
    device.revoked_at = 지금
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.device_id == device.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=지금, revoke_reason=RevokeReason.LOGOUT)
    )
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reauth", status_code=status.HTTP_201_CREATED)
async def issue_reauth_proof(
    body: ReauthRequest, caller: CurrentCaller, db: DbSession, ip: ClientIp
) -> dict:
    """
    민감한 작업 하나에 쓸 증표를 발급한다.

    작업 종류를 함께 받는다. 계정 삭제용으로 받은 증표로 이메일을 바꿀 수
    없다. 하나를 받아 여러 곳에 돌려 쓸 수 있으면 재인증을 요구한 의미가 없다.
    """
    증표 = await issue_proof(
        db, user=caller.user, action=body.action, password=body.password, ip=ip
    )
    return ok({"proof": 증표, "expiresIn": int(PROOF_TTL.total_seconds())})
