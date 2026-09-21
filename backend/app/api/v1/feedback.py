"""
앱 안에서 보내는 의견.

로그인한 사람만 보낸다. 답장은 하지 않고 운영자가 모아서 읽는다(`python -m app.jobs.feedback`).
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, status
from pydantic import Field
from sqlalchemy import func, select

from app.api.deps import CurrentCaller, DbSession
from app.core.errors import AppError, ErrorCode
from app.core.responses import ok
from app.models import FEEDBACK_BODY_MAX, Feedback
from app.schemas.auth import _Camel

router = APIRouter(tags=["feedback"])

# 한 사람이 한 시간에 보낼 수 있는 수. 손으로 쓰는 글이라 넉넉하다. 막는 것은 되풀이다.
FEEDBACK_PER_HOUR = 10


class FeedbackRequest(_Camel):
    kind: str = Field(pattern="^(problem|idea|other)$")
    body: str = Field(min_length=1, max_length=FEEDBACK_BODY_MAX)
    platform: str = Field(default="unknown", max_length=16)
    app_version: str = Field(default="unknown", max_length=32)


class FeedbackOut(_Camel):
    id: str
    received_at: datetime


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
async def send_feedback(body: FeedbackRequest, caller: CurrentCaller, db: DbSession) -> dict:
    글 = body.body.strip()
    if not 글:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"body": "내용을 적어 주세요."})
    최근 = await db.scalar(
        select(func.count())
        .select_from(Feedback)
        .where(Feedback.user_id == caller.user.id, Feedback.created_at > datetime.now(UTC) - timedelta(hours=1))
    )
    if (최근 or 0) >= FEEDBACK_PER_HOUR:
        raise AppError(ErrorCode.RATE_LIMITED, message="의견을 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요.")
    의견 = Feedback(
        user_id=caller.user.id,
        kind=body.kind,
        body=글,
        platform=body.platform or "unknown",
        app_version=body.app_version or "unknown",
    )
    db.add(의견)
    await db.flush()
    await db.refresh(의견, ["created_at"])
    return ok(FeedbackOut(id=str(의견.id), received_at=의견.created_at).model_dump(by_alias=True, mode="json"))
