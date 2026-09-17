import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo

from sqlalchemy import delete, exists, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import (
    Device,
    EmailChangeToken,
    EmailVerificationToken,
    Membership,
    OAuthAccount,
    PasswordResetToken,
    ReauthProof,
    RefreshToken,
    Report,
    RevokeReason,
    SensitiveAction,
    Space,
    User,
    UserBlock,
    UserStatus,
)
from app.services.auth_sessions import revoke_all_for_user
from app.services.mailer import Letter, get_outbox
from app.services.reauth import consume_proof
from app.services.space_purge import purge_space

logger = logging.getLogger("daymo.account_deletion")

# 요청 후 7일 동안은 되돌릴 수 있다
# (docs/development/08-privacy-and-release-compliance.md 6장).
GRACE = timedelta(days=7)

# 정리한 계정이 공동 기록에 남기는 이름. 앱도 이 이름을 그대로 보여 준다.
DELETED_DISPLAY_NAME = "삭제된 계정"


@dataclass(frozen=True)
class DeletionState:
    requested_at: datetime | None
    scheduled_at: datetime | None


def state_of(user: User) -> DeletionState:
    return DeletionState(user.deletion_requested_at, user.deletion_scheduled_at)


async def request_deletion(
    session: AsyncSession, *, user: User, proof: str | None, now: datetime | None = None
) -> DeletionState:
    """
    계정 삭제를 요청한다. 바로 지우지 않고 7일 뒤로 잡는다.

    **다른 멤버가 있는 공간의 owner 는 막는다.** owner 가 사라지면 그
    공간을 관리할 사람이 없어진다. 혼자 쓰는 공간은 막지 않고, 기한이 지나
    계정을 정리할 때 함께 지운다. 앱이 요청 전에 그 사실을 보여 준다.

    막힐 때는 증표를 쓰지 않는다. 관리자를 넘기고 돌아와서 비밀번호를 한 번
    더 넣게 할 이유가 없다.

    요청하면 모든 기기에서 로그아웃된다. 유예 중에 다시 로그인하면 삭제를
    취소할 수 있다.
    """
    if user.deletion_scheduled_at is not None:
        # 이미 요청했다. 기한을 다시 7일 뒤로 밀지 않는다.
        await consume_proof(
            session, user_id=user.id, action=SensitiveAction.DELETE_ACCOUNT, proof=proof
        )
        return state_of(user)

    막힌_공간 = await _shared_spaces_owned_by(session, user.id)
    if 막힌_공간:
        raise AppError(
            ErrorCode.OWNER_TRANSFER_REQUIRED,
            message=(
                "다른 멤버가 있는 공간의 관리자예요. 관리자를 먼저 넘겨 주세요: "
                + ", ".join(막힌_공간)
            ),
        )

    await consume_proof(
        session, user_id=user.id, action=SensitiveAction.DELETE_ACCOUNT, proof=proof
    )

    지금 = now or datetime.now(UTC)
    user.deletion_requested_at = 지금
    user.deletion_scheduled_at = 지금 + GRACE

    # 갱신 토큰만 끊으면 이미 받은 access token 이 15분 동안 살아 있다.
    # 기기를 끊어야 요청마다 하는 기기 확인에서 바로 막힌다.
    await session.execute(
        update(Device)
        .where(Device.user_id == user.id, Device.revoked_at.is_(None))
        .values(revoked_at=지금)
    )
    await revoke_all_for_user(session, user.id, reason=RevokeReason.ACCOUNT_DELETION)
    await session.flush()

    await _알린다(user)
    return state_of(user)


async def cancel_deletion(
    session: AsyncSession, *, user: User, proof: str | None, now: datetime | None = None
) -> DeletionState:
    """유예 중인 삭제를 되돌린다. 기한이 지났으면 되돌릴 수 없다."""
    await consume_proof(
        session, user_id=user.id, action=SensitiveAction.CANCEL_DELETION, proof=proof
    )

    if user.deletion_scheduled_at is None:
        return state_of(user)

    지금 = now or datetime.now(UTC)
    if user.deletion_scheduled_at <= 지금:
        # 정리 작업이 아직 돌지 않았어도 약속한 기한은 지났다.
        raise AppError(ErrorCode.GONE)

    user.deletion_requested_at = None
    user.deletion_scheduled_at = None
    await session.flush()
    return state_of(user)


async def purge_deleted_accounts(
    session: AsyncSession, *, now: datetime | None = None, limit: int = 100
) -> int:
    """
    기한이 지난 계정을 정리한다. 정기 작업에서 부른다. 되돌릴 수 없다.

    **users 줄은 지우지 않는다.** 공동 여행의 참가자·지출·준비물 담당이
    membership 을 거쳐 이 줄을 가리킨다. 줄을 지우면 남은 사람들의 기록이
    무너진다. 대신 이 사람을 알아볼 수 있는 값을 전부 지우고 이름을
    `탈퇴한 멤버` 로 바꾼다
    (docs/development/02-architecture-and-data-model.md 공동 콘텐츠 비식별화).

    - 혼자 쓰던 공간은 여행과 함께 지운다.
    - 다른 사람 공간의 멤버십은 나간 것으로 둔다. 쓴 기록은 남는다.
    - 로그인 수단(비밀번호, 기기, 토큰, OAuth 연결)은 전부 지운다.
    - 이메일은 알아볼 수 없는 값으로 바꾼다. 같은 이메일로 다시 가입할 수 있다.

    다른 멤버가 있는 공간의 owner 로 남아 있으면 건너뛴다. 요청할 때 막았지만
    유예 중에 다시 로그인해 멤버를 들였을 수 있다. 조용히 공간을 지우거나
    관리자를 아무에게나 넘기는 것보다 기다리는 쪽이 안전하다.
    """
    지금 = now or datetime.now(UTC)
    대상 = (
        await session.scalars(
            select(User)
            .where(
                User.status == UserStatus.ACTIVE,
                User.deletion_scheduled_at.is_not(None),
                User.deletion_scheduled_at <= 지금,
            )
            .order_by(User.deletion_scheduled_at)
            .limit(limit)
        )
    ).all()

    정리한_수 = 0
    for user in 대상:
        if await _shared_spaces_owned_by(session, user.id):
            # 계정을 알아볼 값은 로그에 남기지 않는다.
            logger.warning("다른 멤버가 있는 공간의 owner 라 계정 정리를 미뤘다")
            continue
        await _scrub(session, user, 지금)
        정리한_수 += 1

    await session.flush()
    return 정리한_수


async def _scrub(session: AsyncSession, user: User, 지금: datetime) -> None:
    혼자_쓰던_공간 = (
        await session.scalars(select(Space.id).where(Space.owner_id == user.id))
    ).all()
    for space_id in 혼자_쓰던_공간:
        await purge_space(session, space_id)

    await session.execute(
        update(Membership)
        .where(Membership.user_id == user.id, Membership.left_at.is_(None))
        .values(left_at=지금)
    )
    # 공간마다 붙인 별명도 그 사람을 알아보게 한다.
    await session.execute(
        update(Membership).where(Membership.user_id == user.id).values(nickname=None)
    )

    # 차단은 이 사람이 한 것도 당한 것도 지운다. 남겨 두면 `탈퇴한 멤버` 가 목록에 남는다.
    # 신고는 검토가 끝날 때까지 남기되 누가 냈는지는 끊는다.
    await session.execute(
        delete(UserBlock).where(or_(UserBlock.blocker_user_id == user.id, UserBlock.blocked_user_id == user.id))
    )
    await session.execute(update(Report).where(Report.reporter_user_id == user.id).values(reporter_user_id=None))

    # 토큰이 기기를 가리키므로 토큰부터.
    for 표 in (RefreshToken, Device, EmailVerificationToken, EmailChangeToken, PasswordResetToken, ReauthProof, OAuthAccount):
        await session.execute(delete(표).where(표.user_id == user.id))

    user.email = f"deleted-{user.id.hex}@deleted.invalid"
    user.email_verified_at = None
    user.password_hash = None
    user.display_name = DELETED_DISPLAY_NAME
    user.avatar_path = None
    user.status = UserStatus.DELETED
    user.deleted_at = 지금


async def _shared_spaces_owned_by(session: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """내가 owner 이고 나 말고도 활성 멤버가 있는, 지워지지 않은 공간의 이름."""
    다른_멤버 = exists().where(
        Membership.space_id == Space.id,
        Membership.user_id != user_id,
        Membership.left_at.is_(None),
    )
    return list(
        (
            await session.scalars(
                select(Space.name)
                .where(Space.owner_id == user_id, Space.deleted_at.is_(None), 다른_멤버)
                .order_by(Space.created_at)
            )
        ).all()
    )


async def _알린다(user: User) -> None:
    """
    요청을 받았다고 메일로 알린다.

    본인이 모르게 요청됐을 때 알아차릴 유일한 길이다. 그래도 메일이 나가지
    않았다고 삭제 요청을 되돌리지는 않는다. 메일 서비스가 잠시 멈춘 사이에
    계정을 지울 수 없게 되는 쪽이 더 나쁘다.
    """
    try:
        지역: tzinfo = ZoneInfo(user.timezone)
    except Exception:  # noqa: BLE001 - 시간대 자료가 없거나 값이 잘못돼도 메일은 보낸다
        지역 = timezone(timedelta(hours=9), "KST")
    기한 = user.deletion_scheduled_at.astimezone(지역)

    try:
        await get_outbox().send(
            Letter(
                to=user.email,
                subject="Daymo 계정 삭제 요청을 받았어요",
                body=(
                    f"{기한.year}년 {기한.month}월 {기한.day}일 {기한:%H:%M}에 계정이 삭제돼요. 그 전까지 앱에 다시 "
                    "로그인하면 삭제를 취소할 수 있어요.\n\n"
                    "직접 요청하지 않았다면 바로 로그인해 삭제를 취소하고 비밀번호를 바꿔 주세요."
                ),
            )
        )
    except Exception as 원인:  # noqa: BLE001 - 위 설명대로 삼킨다
        # 예외 본문에는 받는 주소가 실릴 수 있어서 종류만 남긴다.
        logger.warning("계정 삭제 안내 메일을 보내지 못했다: %s", type(원인).__name__)
