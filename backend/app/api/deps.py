import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import AppError, ErrorCode
from app.core.tokens import decode_access_token
from app.models import Device, User, UserStatus


@dataclass(frozen=True)
class Caller:
    """요청을 보낸 사람과 기기."""

    user: User
    device_id: uuid.UUID | None


# 요청 transaction 은 **응답을 보내기 전에** 끝낸다.
#
# FastAPI 는 yield 의존성의 뒷부분(`get_session` 의 commit)을 기본으로 응답을 보낸
# 뒤에 돌린다. 그러면 앱은 200 을 받았는데 commit 이 아직이거나 실패했을 수 있다.
# 곧바로 다시 읽으면 방금 만든 것이 없고, commit 이 실패하면 저장되지 않은 것을
# 저장됐다고 믿는다. scope="function" 이면 handler 가 끝나고 응답을 보내기 전에
# commit 하고, 실패하면 500 이 나간다.
#
# 한 요청 안의 모든 자리가 같은 scope 로 `get_session` 을 불러야 한다. FastAPI 는
# scope 가 다르면 다른 의존성으로 보고 세션을 하나 더 연다. 그래서 세션을 쓰는
# `current_caller` 도 같은 scope 로 둔다.
SessionDepends = Depends(get_session, scope="function")


async def current_caller(
    request: Request, session: Annotated[AsyncSession, SessionDepends]
) -> Caller:
    """
    access token 을 풀어 누가 보냈는지 정한다.

    토큰만 보고 끝내지 않고 DB 를 한 번 본다. 두 가지 때문이다.

    하나, 토큰에 권한을 담지 않았다. 권한은 요청 시점의 DB 가 원본이라,
    빼앗은 권한이 토큰 유효기간 동안 살아 있으면 안 된다.

    둘, 기기가 끊겼는지 확인한다. access token 자체는 폐기할 수 없지만
    기기 줄을 보면 끊긴 기기의 요청을 바로 막을 수 있다. 이것이 없으면
    한도를 넘겨 끊은 기기가 최대 15분 동안 계속 쓴다.
    """
    헤더 = request.headers.get("Authorization") or ""
    조각 = 헤더.split(" ", 1)
    if len(조각) != 2 or 조각[0].lower() != "bearer" or not 조각[1].strip():
        raise AppError(ErrorCode.UNAUTHENTICATED)

    claims = decode_access_token(조각[1].strip())

    try:
        user_id = uuid.UUID(claims["sub"])
        device_id = uuid.UUID(claims["sid"]) if claims.get("sid") else None
    except (KeyError, ValueError) as 원인:
        raise AppError(ErrorCode.UNAUTHENTICATED) from 원인

    user = await session.get(User, user_id)
    if user is None or user.status is not UserStatus.ACTIVE:
        raise AppError(ErrorCode.UNAUTHENTICATED)

    if device_id is not None:
        살아_있는_기기 = await session.scalar(
            select(Device.id).where(
                Device.id == device_id,
                Device.user_id == user.id,
                Device.revoked_at.is_(None),
            )
        )
        if 살아_있는_기기 is None:
            raise AppError(ErrorCode.UNAUTHENTICATED)

    # 접근 로그가 누구의 요청인지 적을 수 있게 남긴다. 로그에는 계정 id 가
    # 아니라 해시가 들어간다(app/core/access_log.py).
    request.state.user_id = str(user.id)
    return Caller(user=user, device_id=device_id)


CurrentCaller = Annotated[Caller, Depends(current_caller, scope="function")]
DbSession = Annotated[AsyncSession, SessionDepends]


def client_ip(request: Request) -> str:
    """
    요청을 보낸 쪽의 주소.

    운영에서는 Nginx 뒤에 있어서 `X-Real-IP` 를 본다. Nginx 가 이 머리에
    `$remote_addr` 를 **덮어써서** 보내므로(infra/production/nginx.conf) 바깥에서
    적어 넣은 값은 남지 않는다. 머리가 없으면(로컬·시험) 연결된 주소로 떨어진다.

    `X-Forwarded-For` 는 읽지 않는다. Nginx 가 `$proxy_add_x_forwarded_for` 로
    **바깥 값 뒤에 진짜 주소를 덧붙이는** 탓에 맨 앞은 클라이언트가 마음대로 적은
    값이다. 그것을 열쇠로 쓰면 요청마다 다른 값을 넣어 IP 한도를 비켜 갈 수 있다.

    지금은 세는 데만 쓰고 권한 판단에 쓰지 않는다. 원문은 저장하지 않고 세는
    표에는 pepper 를 섞은 해시만 들어간다.
    """
    실제_주소 = (request.headers.get("X-Real-IP") or "").strip()
    if 실제_주소:
        return 실제_주소
    return request.client.host if request.client else "unknown"


ClientIp = Annotated[str, Depends(client_ip)]
