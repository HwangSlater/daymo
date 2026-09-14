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


async def current_caller(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
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


CurrentCaller = Annotated[Caller, Depends(current_caller)]
DbSession = Annotated[AsyncSession, Depends(get_session)]
