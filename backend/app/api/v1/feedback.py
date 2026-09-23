"""
앱 안에서 보내는 의견.

로그인한 사람만 보낸다. 답장은 하지 않고 운영자가 모아서 읽는다(`python -m app.jobs.feedback`).
"""

from datetime import datetime

from fastapi import APIRouter, status
from pydantic import Field

from app.api.deps import CurrentCaller, DbSession
from app.core.errors import AppError, ErrorCode
from app.core.responses import ok
from app.models import FEEDBACK_BODY_MAX
from app.schemas.auth import _Camel
from app.services import feedback as feedback_service

router = APIRouter(tags=["feedback"])


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
    의견 = await feedback_service.record(
        db,
        user_id=caller.user.id,
        kind=body.kind,
        body=글,
        platform=body.platform,
        app_version=body.app_version,
    )
    return ok(FeedbackOut(id=str(의견.id), received_at=의견.created_at).model_dump(by_alias=True, mode="json"))
