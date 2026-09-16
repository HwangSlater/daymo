"""
공간 안에서 누가 무엇을 했는지 남긴다(`audit_logs`).

지우기·되살리기·권한 바꾸기처럼 나중에 말이 갈릴 수 있는 일만 적는다. 부르는 쪽은
바뀐 것이 실제로 있을 때 한 줄로 부른다. 같은 요청이 두 번 와서 아무것도 바뀌지
않았으면 적지 않는다.

**본문을 넣지 않는다.** 메모·일기 글, 사진 파일과 설명, 이메일·이름 같은 개인정보는
`summary_fields` 에 넣지 않는다. 무엇이 어떻게 바뀌었는지(역할, 여행 id 같은 값)만 둔다.
공간이 지워져도 이 줄은 남기 때문에, 여기 넣은 글은 공간을 지워도 지워지지 않는다.

행동 이름은 `대상.동사` 로 쓴다.

    memo.delete  memo.restore  photo.delete  photo.restore  payment.undo
    member.remove  member.leave  member.role_change  invite.revoke
    trip.delete  trip.restore

보유기간이 지난 줄은 정리 작업이 지운다(`purge_expired`).
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog

logger = logging.getLogger("daymo.audit")

# 공간 감사 기록의 보유기간(docs/development/08-privacy-and-release-compliance.md 10장).
#
# 문서가 기간을 정해 둔 것은 신고 기록(처리 후 1년)과 관리자 웹의
# `admin_audit_logs`(2년)뿐이다. 이 표는 그 둘이 아니라 공간 안에서 누가
# 무엇을 지웠는지를 멤버들끼리 가리기 위한 것이라, 말이 갈릴 만한 기간만
# 두고 6개월로 정했다. 문서에도 같은 값을 적어 뒀다.
RETENTION = timedelta(days=180)

# 한 번에 지우는 줄 수의 상한.
#
# 없으면 정리 작업이 며칠 멈췄다 돌아왔을 때 한 transaction 이 표 전체를
# 훑고 잠근다. 남은 것은 내일 또 지우면 된다. 상한에 걸렸으면 경고를 남겨
# 운영자가 밀린 것을 알 수 있게 한다.
PURGE_BATCH = 2000


async def record(
    session: AsyncSession,
    *,
    space_id: uuid.UUID | None,
    actor_membership_id: uuid.UUID | None,
    action: str,
    target_type: str | None,
    target_id: uuid.UUID | None,
    summary_fields: dict | None = None,
) -> AuditLog:
    log = AuditLog(
        space_id=space_id,
        actor_membership_id=actor_membership_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        log_metadata=summary_fields or None,
    )
    session.add(log)
    await session.flush()
    return log


async def purge_expired(
    session: AsyncSession, *, now: datetime | None = None, limit: int = PURGE_BATCH
) -> int:
    """
    보유기간이 지난 감사 기록을 지운다. 정기 작업에서 부른다.

    가장 오래된 것부터 `limit` 줄까지만 지운다. 대상을 id 로 먼저 고르고
    지우는 이유는, 그래야 지우는 줄 수가 상한을 넘지 않기 때문이다.
    """
    기한 = (now or datetime.now(UTC)) - RETENTION
    오래된 = (
        select(AuditLog.id)
        .where(AuditLog.created_at <= 기한)
        .order_by(AuditLog.created_at)
        .limit(limit)
        .scalar_subquery()
    )
    지운_것 = await session.execute(delete(AuditLog).where(AuditLog.id.in_(오래된)))
    await session.flush()
    수 = 지운_것.rowcount or 0
    if 수 >= limit:
        logger.warning("감사 기록 파기가 상한(%d)에 걸렸다. 남은 것은 다음 정리에서 지운다.", limit)
    return 수
