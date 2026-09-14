import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.core.tokens import (
    REFRESH_TTL,
    create_access_token,
    hash_refresh_token,
    new_refresh_token,
)
from app.models import Device, DevicePlatform, RefreshToken, RevokeReason

# 사용자당 활성 기기 세션은 최대 5개다
# (docs/development/02-architecture-and-data-model.md 3장).
MAX_DEVICES = 5


@dataclass(frozen=True)
class EndedDevice:
    """한도를 넘겨 끊긴 기기. 로그인 응답에 실어 사용자에게 알린다."""

    display_name: str | None
    last_seen_at: datetime


@dataclass(frozen=True)
class Session:
    access_token: str
    refresh_token: str
    device_id: uuid.UUID
    # 이번 로그인 때문에 끊긴 기기들. 비어 있는 것이 보통이다.
    ended_devices: list[EndedDevice] = field(default_factory=list)


async def start_session(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    installation_id: str,
    platform: DevicePlatform = DevicePlatform.UNKNOWN,
    app_version: str | None = None,
    display_name: str | None = None,
) -> Session:
    """
    로그인에 성공한 뒤 세션을 연다.

    같은 설치 id 로 다시 로그인하면 기기 줄을 새로 만들지 않고 되살린다.
    다시 로그인할 때마다 목록에 같은 기기가 쌓이면 사용자가 무엇을 끊어야
    할지 알 수 없다.
    """
    지금 = datetime.now(UTC)
    device = await _upsert_device(
        session,
        user_id=user_id,
        installation_id=installation_id,
        platform=platform,
        app_version=app_version,
        display_name=display_name,
        지금=지금,
    )

    # 이 기기의 예전 세션은 끊는다. 같은 기기에 두 벌이 살아 있을 이유가 없다.
    await _revoke_where(
        session, RefreshToken.device_id == device.id, reason=RevokeReason.LOGOUT, 지금=지금
    )

    끊긴_기기 = await _enforce_device_limit(session, user_id=user_id, 지금_쓰는_기기=device.id, 지금=지금)

    원문, 해시 = new_refresh_token()
    토큰 = RefreshToken(
        user_id=user_id,
        device_id=device.id,
        # 새 로그인은 새 가족으로 시작한다. 예전 가족이 털렸더라도 이번
        # 로그인이 함께 끊기지 않는다.
        token_family_id=uuid.uuid4(),
        token_hash=해시,
        expires_at=지금 + REFRESH_TTL,
        last_used_at=지금,
    )
    session.add(토큰)
    await session.flush()

    return Session(
        access_token=create_access_token(user_id=user_id, device_id=device.id, now=지금),
        refresh_token=원문,
        device_id=device.id,
        ended_devices=끊긴_기기,
    )


async def rotate_session(session: AsyncSession, raw_refresh: str) -> Session:
    """
    갱신 토큰을 새것으로 갈아 끼운다.

    **이미 갈아 끼운 토큰이 다시 오면 훔쳐 간 것으로 본다.** 정상적인 앱은
    교체된 토큰을 들고 있을 이유가 없다. 그때는 그 토큰 하나가 아니라 같은
    `token_family_id` 를 전부 끊는다. 훔친 쪽과 원래 쪽 중 누가 지금 들고
    있는지 알 수 없어서, 둘 다 끊고 다시 로그인하게 하는 것이 유일하게
    안전한 선택이다.

    거부 사유를 응답에 나눠 적지 않는다. 만료인지 재사용인지 알려 주면
    공격하는 쪽에 힌트가 된다.
    """
    지금 = datetime.now(UTC)
    해시 = hash_refresh_token(raw_refresh)
    기존 = await session.scalar(select(RefreshToken).where(RefreshToken.token_hash == 해시))

    if 기존 is None:
        raise AppError(ErrorCode.UNAUTHENTICATED)

    if 기존.revoked_at is not None:
        # 재사용이다. 가족 전체를 끊는다.
        await revoke_family(
            session, 기존.token_family_id, reason=RevokeReason.REUSE_DETECTED, 지금=지금
        )
        raise AppError(ErrorCode.UNAUTHENTICATED)

    if 기존.expires_at <= 지금:
        await _revoke_where(
            session, RefreshToken.id == 기존.id, reason=RevokeReason.LOGOUT, 지금=지금
        )
        raise AppError(ErrorCode.UNAUTHENTICATED)

    원문, 새_해시 = new_refresh_token()
    새_토큰 = RefreshToken(
        user_id=기존.user_id,
        device_id=기존.device_id,
        # 가족은 이어진다. 이 사슬 어디에서 재사용이 나오든 전부 끊긴다.
        token_family_id=기존.token_family_id,
        token_hash=새_해시,
        # 90일은 마지막 정상 사용 시점부터다. 쓰는 동안 계속 늘어난다.
        expires_at=지금 + REFRESH_TTL,
        last_used_at=지금,
    )
    session.add(새_토큰)
    await session.flush()

    기존.revoked_at = 지금
    기존.revoke_reason = RevokeReason.ROTATED
    기존.replaced_by = 새_토큰.id
    기존.last_used_at = 지금

    if 기존.device_id:
        await session.execute(
            update(Device).where(Device.id == 기존.device_id).values(last_seen_at=지금)
        )
    await session.flush()

    return Session(
        access_token=create_access_token(
            user_id=기존.user_id, device_id=기존.device_id, now=지금
        ),
        refresh_token=원문,
        device_id=기존.device_id,
    )


async def end_session(session: AsyncSession, raw_refresh: str) -> None:
    """
    로그아웃.

    없는 토큰이어도 조용히 넘어간다. 이미 끝난 세션을 끝내려는 것이고,
    여기서 오류를 내면 어떤 토큰이 살아 있는지 알려 주는 셈이 된다.
    """
    지금 = datetime.now(UTC)
    await _revoke_where(
        session,
        RefreshToken.token_hash == hash_refresh_token(raw_refresh),
        reason=RevokeReason.LOGOUT,
        지금=지금,
    )


async def revoke_family(
    session: AsyncSession,
    family_id: uuid.UUID,
    *,
    reason: RevokeReason,
    지금: datetime | None = None,
) -> None:
    await _revoke_where(
        session,
        RefreshToken.token_family_id == family_id,
        reason=reason,
        지금=지금 or datetime.now(UTC),
    )


async def revoke_all_for_user(
    session: AsyncSession, user_id: uuid.UUID, *, reason: RevokeReason
) -> None:
    """
    그 계정의 모든 세션을 끊는다.

    비밀번호 재설정 뒤에 부른다. 비밀번호를 다시 정하는 상황은 대개 남이
    들어와 있을 수 있다고 의심하는 상황이라, 새 비밀번호만 주고 기존 세션을
    두면 침입자가 그대로 남는다.
    """
    await _revoke_where(
        session, RefreshToken.user_id == user_id, reason=reason, 지금=datetime.now(UTC)
    )


# ---------------------------------------------------------------------------


async def _revoke_where(session: AsyncSession, 조건, *, reason: RevokeReason, 지금: datetime) -> None:
    """이미 끊긴 줄은 건드리지 않는다. 처음 끊은 때와 이유가 남아야 한다."""
    await session.execute(
        update(RefreshToken)
        .where(조건, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=지금, revoke_reason=reason)
    )


async def _upsert_device(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    installation_id: str,
    platform: DevicePlatform,
    app_version: str | None,
    display_name: str | None,
    지금: datetime,
) -> Device:
    device = await session.scalar(
        select(Device).where(
            Device.user_id == user_id, Device.installation_id == installation_id
        )
    )
    if device is None:
        device = Device(
            user_id=user_id,
            installation_id=installation_id,
            platform=platform,
            app_version=app_version,
            display_name=display_name,
            last_seen_at=지금,
        )
        session.add(device)
    else:
        device.platform = platform
        device.app_version = app_version
        if display_name:
            device.display_name = display_name
        device.last_seen_at = 지금
        # 끊겼던 기기로 다시 로그인하는 것은 막지 않는다. 로그인 자체가
        # 이미 비밀번호나 provider 로 확인된 행동이다.
        device.revoked_at = None
    await session.flush()
    return device


async def _enforce_device_limit(
    session: AsyncSession, *, user_id: uuid.UUID, 지금_쓰는_기기: uuid.UUID, 지금: datetime
) -> list[EndedDevice]:
    """
    한도를 넘긴 만큼 오래된 기기를 끊는다.

    **지금 로그인하는 기기는 후보에서 뺀다.** 쓰고 있는 기기가 끊기면
    사용자는 무슨 일이 벌어졌는지 알 수 없다.
    """
    살아_있는 = (
        await session.execute(
            select(Device)
            .where(
                Device.user_id == user_id,
                Device.revoked_at.is_(None),
                Device.id != 지금_쓰는_기기,
            )
            .order_by(Device.last_seen_at.asc())
        )
    ).scalars().all()

    # 지금 기기를 뺀 나머지가 MAX_DEVICES - 1 개를 넘으면 그만큼 끊는다.
    넘친_수 = len(살아_있는) - (MAX_DEVICES - 1)
    if 넘친_수 <= 0:
        return []

    끊을_것 = 살아_있는[:넘친_수]
    for device in 끊을_것:
        device.revoked_at = 지금
        await _revoke_where(
            session,
            RefreshToken.device_id == device.id,
            reason=RevokeReason.DEVICE_LIMIT,
            지금=지금,
        )
    await session.flush()

    return [EndedDevice(display_name=d.display_name, last_seen_at=d.last_seen_at) for d in 끊을_것]
