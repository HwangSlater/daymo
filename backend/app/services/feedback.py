"""앱 안에서 받은 의견의 보관."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Feedback

# 받은 날부터 이만큼 둔다. 개인정보 처리방침(site/src/privacy.html)에 적은 기간과 같다.
FEEDBACK_KEEP = timedelta(days=365)


async def purge_expired(session: AsyncSession, *, now: datetime | None = None) -> int:
    """보관 기간이 지난 의견을 지운다. 지운 수를 돌려준다."""
    기준 = (now or datetime.now(UTC)) - FEEDBACK_KEEP
    결과 = await session.execute(delete(Feedback).where(Feedback.created_at < 기준))
    return 결과.rowcount or 0
