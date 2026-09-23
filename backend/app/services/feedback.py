"""앱 안에서 받은 의견의 보관."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import Feedback

# 받은 날부터 이만큼 둔다. 개인정보 처리방침(site/src/privacy.html)에 적은 기간과 같다.
FEEDBACK_KEEP = timedelta(days=365)

# 한 사람이 한 시간에 보낼 수 있는 수. 손으로 쓰는 글이라 넉넉하다. 막는 것은 되풀이다.
FEEDBACK_PER_HOUR = 10


async def record(
    session: AsyncSession,
    *,
    user_id,
    kind: str,
    body: str,
    platform: str,
    app_version: str,
) -> Feedback:
    """
    의견 한 줄을 적는다. 한 시간에 `FEEDBACK_PER_HOUR` 줄까지만.

    막는 것은 되풀이다. 손으로 쓰는 글이라 한도는 넉넉하다.
    """
    최근 = await session.scalar(
        select(func.count())
        .select_from(Feedback)
        .where(Feedback.user_id == user_id, Feedback.created_at > datetime.now(UTC) - timedelta(hours=1))
    )
    if (최근 or 0) >= FEEDBACK_PER_HOUR:
        raise AppError(
            ErrorCode.RATE_LIMITED, message="의견을 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요."
        )
    의견 = Feedback(
        user_id=user_id,
        kind=kind,
        body=body,
        platform=platform or "unknown",
        app_version=app_version or "unknown",
    )
    session.add(의견)
    await session.flush()
    await session.refresh(의견, ["created_at"])
    return 의견


async def purge_expired(session: AsyncSession, *, now: datetime | None = None) -> int:
    """보관 기간이 지난 의견을 지운다. 지운 수를 돌려준다."""
    기준 = (now or datetime.now(UTC)) - FEEDBACK_KEEP
    결과 = await session.execute(delete(Feedback).where(Feedback.created_at < 기준))
    return 결과.rowcount or 0
