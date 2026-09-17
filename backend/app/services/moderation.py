"""
신고와 차단.

신고(docs/development/03-api-specification.md):

- 신고하는 사람은 그 공간의 멤버여야 하고, 대상도 그 공간의 것이어야 한다. 남의 공간
  id 로 무엇이 있는지 찍어 볼 수 없게 둘 다 404 로 답한다.
- 같은 사람이 같은 대상을 다시 신고하면 새로 만들지 않고 처음 접수 번호를 돌려준다.
- 한 사람이 한 시간에 낼 수 있는 신고 수를 둔다. 운영자 메일함을 채우는 길이 되면 안 된다.
- 운영자에게 메일로 알린다. 접수 번호·대상 종류·사유만 넣는다. 신고 설명과 대상 내용,
  신고한 사람의 이메일은 넣지 않는다. 메일은 서버 밖으로 나간다.

차단:

- 사람 사이의 것이다. 앱은 남의 사용자 id 를 모르므로 함께 있는 공간의 membership id 로
  가리킨다.
- 차단하면 둘이 새로 같은 공간에 들어가지 못한다(`blocked_between`). 이미 함께 있는 공간은
  그대로 둔다. 앱이 나가기나 내보내기를 안내한다.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import AppError, ErrorCode
from app.models import (
    Diary,
    Membership,
    Memo,
    Photo,
    PhotoStatus,
    Report,
    ReportReason,
    ReportStatus,
    ReportTargetType,
    Space,
    Trip,
    User,
    UserBlock,
)
from app.services.mailer import OPERATOR_ADDRESS, Letter, get_outbox

logger = logging.getLogger("daymo.moderation")

# 한 사람이 한 시간에 낼 수 있는 신고 수. 같은 대상을 다시 누른 것은 세지 않는다.
REPORTS_PER_HOUR = 10
# 첫 검토 목표(docs/development/08-privacy-and-release-compliance.md 10장).
REVIEW_WITHIN = timedelta(hours=24)


# ---------------------------------------------------------------------------
# 신고
# ---------------------------------------------------------------------------


async def _대상이_공간에_있다(
    session: AsyncSession, *, space_id: uuid.UUID, target_type: ReportTargetType, target_id: uuid.UUID
) -> Membership | None:
    """
    대상이 그 공간의 것인지 본다. 없으면 404 다.

    멤버 신고일 때는 그 membership 을 돌려준다. 나를 신고하는 것을 막는 데 쓴다.
    나간 멤버도 신고할 수 있다. 나가기 전에 남긴 것이 문제일 수 있다.
    """
    if target_type is ReportTargetType.MEMBER:
        target = await session.scalar(
            select(Membership).where(Membership.id == target_id, Membership.space_id == space_id)
        )
        if target is None:
            raise AppError(ErrorCode.NOT_FOUND)
        return target

    if target_type is ReportTargetType.TRIP:
        질의 = select(Trip.id).where(Trip.id == target_id, Trip.space_id == space_id, Trip.deleted_at.is_(None))
    elif target_type is ReportTargetType.MEMO:
        질의 = (
            select(Memo.id)
            .join(Trip, Trip.id == Memo.trip_id)
            .where(Memo.id == target_id, Memo.deleted_at.is_(None))
        )
    elif target_type is ReportTargetType.DIARY:
        질의 = select(Diary.id).join(Trip, Trip.id == Diary.trip_id).where(Diary.id == target_id)
    else:
        질의 = (
            select(Photo.id)
            .join(Trip, Trip.id == Photo.trip_id)
            .where(Photo.id == target_id, Photo.deleted_at.is_(None), Photo.status != PhotoStatus.DELETED)
        )
    if await session.scalar(질의.where(Trip.space_id == space_id, Trip.deleted_at.is_(None))) is None:
        raise AppError(ErrorCode.NOT_FOUND)
    return None


async def create_report(
    session: AsyncSession,
    *,
    reporter: Membership,
    target_type: ReportTargetType,
    target_id: uuid.UUID | None,
    reason: ReportReason,
    detail: str | None,
) -> tuple[Report, bool]:
    """`(신고, 새로_만들었다)`. `reporter` 는 신고하는 사람의 그 공간 membership 이다."""
    if target_type is ReportTargetType.OTHER:
        if target_id is not None:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"targetId": "기타 신고에는 대상을 적지 않아요."})
    elif target_id is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"targetId": "무엇을 신고하는지 알려 주세요."})
    else:
        멤버 = await _대상이_공간에_있다(
            session, space_id=reporter.space_id, target_type=target_type, target_id=target_id
        )
        if 멤버 is not None and 멤버.user_id == reporter.user_id:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"targetId": "나를 신고할 수는 없어요."})

    if target_id is not None:
        # 같은 대상을 다시 누른 것. 운영자에게 한 번 더 알리지 않는다.
        이미 = await session.scalar(
            select(Report).where(
                Report.reporter_user_id == reporter.user_id,
                Report.space_id == reporter.space_id,
                Report.target_type == target_type,
                Report.target_id == target_id,
                Report.status == ReportStatus.OPEN,
            )
        )
        if 이미 is not None:
            return 이미, False

    최근 = await session.scalar(
        select(func.count())
        .select_from(Report)
        .where(
            Report.reporter_user_id == reporter.user_id,
            Report.created_at > datetime.now(UTC) - timedelta(hours=1),
        )
    )
    if (최근 or 0) >= REPORTS_PER_HOUR:
        raise AppError(ErrorCode.RATE_LIMITED, message="신고를 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요.")

    report = Report(
        reporter_user_id=reporter.user_id,
        space_id=reporter.space_id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        detail=(detail or "").strip() or None,
        status=ReportStatus.OPEN,
    )
    session.add(report)
    await session.flush()
    await session.refresh(report, ["created_at"])
    await _운영자에게_알린다(report)
    return report, True


async def _운영자에게_알린다(report: Report) -> None:
    """
    새 신고를 운영자 메일함으로 보낸다.

    메일이 나가지 않았다고 신고를 되돌리지 않는다. 신고는 DB 에 남아 있고, 운영자는
    열린 신고를 DB 에서 다시 본다.
    """
    기한 = (report.created_at + REVIEW_WITHIN).strftime("%Y-%m-%d %H:%M UTC")
    try:
        await get_outbox().send(
            Letter(
                to=OPERATOR_ADDRESS,
                subject=f"[Daymo 신고] {report.target_type.value} · {report.reason.value}",
                body=(
                    f"접수 번호: {report.id}\n"
                    f"대상 종류: {report.target_type.value}\n"
                    f"사유: {report.reason.value}\n"
                    f"검토 기한: {기한}\n\n"
                    "신고 설명과 대상 내용은 메일에 넣지 않았어요. 서버에서 접수 번호로 확인해 주세요."
                ),
            )
        )
    except Exception as 원인:  # noqa: BLE001 - 위 설명대로 삼킨다
        logger.warning("신고 알림 메일을 보내지 못했다: %s", type(원인).__name__)


# ---------------------------------------------------------------------------
# 차단
# ---------------------------------------------------------------------------


async def block(session: AsyncSession, *, user: User, membership_id: uuid.UUID) -> tuple[UserBlock, str, bool]:
    """
    지금 함께 있는 공간의 멤버를 차단한다. `(차단, 표시_이름, 새로_만들었다)`.

    함께 있지 않은 membership 은 없는 것으로 답한다. 남의 공간 멤버 id 를 알아도
    차단으로 그 사람이 있는지 알아낼 수 없다.
    """
    나 = aliased(Membership)
    target = await session.scalar(
        select(Membership)
        .join(나, 나.space_id == Membership.space_id)
        .join(Space, Space.id == Membership.space_id)
        .where(
            Membership.id == membership_id,
            Membership.left_at.is_(None),
            나.user_id == user.id,
            나.left_at.is_(None),
            Space.deleted_at.is_(None),
        )
    )
    if target is None:
        raise AppError(ErrorCode.NOT_FOUND)
    if target.user_id == user.id:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"membershipId": "나를 차단할 수는 없어요."})

    사람 = await session.get(User, target.user_id)
    이름 = target.nickname or (사람.display_name if 사람 else "")

    이미 = await session.scalar(
        select(UserBlock).where(UserBlock.blocker_user_id == user.id, UserBlock.blocked_user_id == target.user_id)
    )
    if 이미 is not None:
        if 이미.blocked_membership_id is None:
            이미.blocked_membership_id = target.id
            await session.flush()
        return 이미, 이름, False

    차단 = UserBlock(blocker_user_id=user.id, blocked_user_id=target.user_id, blocked_membership_id=target.id)
    session.add(차단)
    await session.flush()
    await session.refresh(차단, ["created_at"])
    return 차단, 이름, True


async def unblock(session: AsyncSession, *, user: User, ref_id: uuid.UUID) -> None:
    """
    차단을 푼다. `ref_id` 는 그 사람의 membership id 다.

    어느 공간의 membership 이든 같은 사람이면 풀린다. 차단한 공간이 지워져 membership 이
    없어졌으면 목록이 주는 차단 줄 id 로도 풀 수 있다.
    """
    그_사람 = select(Membership.user_id).where(Membership.id == ref_id).scalar_subquery()
    지운_것 = await session.execute(
        delete(UserBlock).where(
            UserBlock.blocker_user_id == user.id,
            or_(UserBlock.id == ref_id, UserBlock.blocked_user_id == 그_사람),
        )
    )
    if not 지운_것.rowcount:
        raise AppError(ErrorCode.NOT_FOUND)


async def list_blocks(
    session: AsyncSession, *, user: User, space_id: uuid.UUID | None = None
) -> list[tuple[UserBlock, uuid.UUID | None, str]]:
    """
    내가 차단한 사람. `(차단, membership id, 표시 이름)` 을 최근 것부터.

    `space_id` 를 주면 그 공간에 지금 있는 사람은 그 공간의 membership id 로 준다. 앱이
    멤버 목록에서 누가 차단됐는지 바로 맞춰 볼 수 있다. 없으면 차단한 공간의 것이다.
    """
    차단한_곳 = aliased(Membership)
    이_공간 = aliased(Membership)
    # 공간을 주지 않으면 이 조건이 늘 거짓이라 이_공간 칸은 비어 온다.
    이_공간_조건 = (
        (이_공간.user_id == UserBlock.blocked_user_id) & (이_공간.space_id == space_id) & 이_공간.left_at.is_(None)
        if space_id is not None
        else false()
    )
    줄들 = (
        await session.execute(
            select(UserBlock, 차단한_곳, 이_공간, User)
            .join(User, User.id == UserBlock.blocked_user_id)
            .outerjoin(차단한_곳, 차단한_곳.id == UserBlock.blocked_membership_id)
            .outerjoin(이_공간, 이_공간_조건)
            .where(UserBlock.blocker_user_id == user.id)
            .order_by(UserBlock.created_at.desc(), UserBlock.id)
        )
    ).all()

    결과 = []
    for 차단, 차단한_membership, 이_공간_membership, 사람 in 줄들:
        membership = 이_공간_membership or 차단한_membership
        이름 = (membership.nickname if membership else None) or 사람.display_name
        결과.append((차단, membership.id if membership else None, 이름))
    return 결과


async def blocked_between(session: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID) -> bool:
    """이 사람이 그 공간의 지금 멤버 누구와든 어느 한쪽으로 차단돼 있는지."""
    멤버 = select(Membership.user_id).where(Membership.space_id == space_id, Membership.left_at.is_(None))
    return (
        await session.scalar(
            select(UserBlock.id)
            .where(
                or_(
                    (UserBlock.blocker_user_id == user_id) & UserBlock.blocked_user_id.in_(멤버),
                    (UserBlock.blocked_user_id == user_id) & UserBlock.blocker_user_id.in_(멤버),
                )
            )
            .limit(1)
        )
    ) is not None
