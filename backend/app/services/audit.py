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
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


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
