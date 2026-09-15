import uuid
from datetime import datetime

from fastapi import APIRouter, Query, Response, status
from pydantic import Field

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import membership_in_space
from app.core.responses import ok
from app.models import REPORT_DETAIL_MAX, ReportReason, ReportTargetType
from app.schemas.auth import _Camel
from app.services import moderation as moderation_service

router = APIRouter(tags=["reports and blocks"])


class ReportRequest(_Camel):
    space_id: uuid.UUID
    target_type: ReportTargetType
    # `other` 일 때만 비운다. `member` 면 그 공간의 membership id 다.
    target_id: uuid.UUID | None = None
    reason: ReportReason
    detail: str | None = Field(default=None, max_length=REPORT_DETAIL_MAX)


class ReportOut(_Camel):
    """접수 번호와 언제까지 보겠다는 약속만 준다. 처리 결과는 아직 앱에 없다."""

    id: str
    received_at: datetime
    review_due_at: datetime


class BlockRequest(_Camel):
    user_membership_id: uuid.UUID


class BlockOut(_Camel):
    """`membershipId` 는 차단한 공간이 지워졌으면 비고, 그때는 `id` 로 푼다."""

    id: str
    membership_id: str | None
    display_name: str
    blocked_at: datetime


@router.post("/reports", status_code=status.HTTP_201_CREATED)
async def create_report(body: ReportRequest, caller: CurrentCaller, db: DbSession, response: Response) -> dict:
    """
    공간 안의 메모·일기·사진·여행·멤버를 신고한다.

    같은 대상을 다시 신고하면 200 과 처음 접수 번호를 준다.
    """
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=body.space_id)
    report, 만들었다 = await moderation_service.create_report(
        db,
        reporter=membership,
        target_type=body.target_type,
        target_id=body.target_id,
        reason=body.reason,
        detail=body.detail,
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(
        ReportOut(
            id=str(report.id),
            received_at=report.created_at,
            review_due_at=report.created_at + moderation_service.REVIEW_WITHIN,
        ).model_dump(by_alias=True, mode="json")
    )


@router.post("/blocks", status_code=status.HTTP_201_CREATED)
async def block_member(body: BlockRequest, caller: CurrentCaller, db: DbSession, response: Response) -> dict:
    """함께 있는 공간의 멤버를 차단한다. 이미 차단했으면 200 이다."""
    차단, 이름, 만들었다 = await moderation_service.block(db, user=caller.user, membership_id=body.user_membership_id)
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(
        BlockOut(
            id=str(차단.id),
            membership_id=str(body.user_membership_id),
            display_name=이름,
            blocked_at=차단.created_at,
        ).model_dump(by_alias=True, mode="json")
    )


@router.get("/blocks")
async def list_blocks(
    caller: CurrentCaller,
    db: DbSession,
    space_id: uuid.UUID | None = Query(default=None, alias="spaceId"),
) -> dict:
    """
    내가 차단한 사람.

    `spaceId` 를 주면 그 공간에 있는 사람은 그 공간의 membership id 로 준다. 멤버 목록과
    바로 맞춰 보라는 것이다. 내가 있는 공간만 받는다.
    """
    if space_id is not None:
        await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    return ok(
        [
            BlockOut(
                id=str(차단.id),
                membership_id=str(membership_id) if membership_id else None,
                display_name=이름,
                blocked_at=차단.created_at,
            ).model_dump(by_alias=True, mode="json")
            for 차단, membership_id, 이름 in await moderation_service.list_blocks(db, user=caller.user, space_id=space_id)
        ]
    )


@router.delete("/blocks/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_member(membership_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    await moderation_service.unblock(db, user=caller.user, ref_id=membership_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
