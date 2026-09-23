import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_trip, membership_for_trip_row, require
from app.core.errors import AppError, ErrorCode
from app.core.responses import Envelope, Page, ok, page
from app.models import Diary, Memo
from app.schemas.memory import (
    DiaryCreateRequest,
    DiaryOut,
    DiaryUpdateRequest,
    MemoCreateRequest,
    MemoOut,
    MemoUpdateRequest,
)
from app.services import audit
from app.services import memories as memory_service

router = APIRouter(tags=["memos and diaries"])


def _메모_응답(memo: Memo, names: dict) -> dict:
    return MemoOut(
        id=str(memo.id),
        trip_id=str(memo.trip_id),
        body=memo.body,
        author_membership_id=str(memo.author_membership_id) if memo.author_membership_id else None,
        author_name=memory_service.name_of(names, memo.author_membership_id),
        created_at=memo.created_at,
        edited_at=memo.edited_at,
        version=memo.version,
    ).model_dump(by_alias=True, mode="json")


def _일기_응답(diary: Diary, names: dict) -> dict:
    return DiaryOut(
        id=str(diary.id),
        trip_id=str(diary.trip_id),
        title=diary.title,
        body=diary.body,
        written_on=diary.written_on,
        author_membership_id=str(diary.author_membership_id) if diary.author_membership_id else None,
        author_name=memory_service.name_of(names, diary.author_membership_id),
        created_at=diary.created_at,
        version=diary.version,
    ).model_dump(by_alias=True, mode="json")


async def _살아_있는_메모(db, caller, memo_id: uuid.UUID):
    membership, trip, memo = await membership_for_trip_row(db, user_id=caller.user.id, model=Memo, row_id=memo_id)
    if memo.deleted_at is not None:
        raise AppError(ErrorCode.NOT_FOUND)
    return membership, trip, memo


# ---------------------------------------------------------------------------
# 메모
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/memos", response_model=Page[MemoOut])
async def list_memos(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    """지우지 않은 메모만, 새것부터."""
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    memos = await memory_service.list_memos(db, trip)
    names = await memory_service.author_names(db, [memo.author_membership_id for memo in memos])
    return page([_메모_응답(memo, names) for memo in memos])


@router.post("/trips/{trip_id}/memos", status_code=status.HTTP_201_CREATED, response_model=Envelope[MemoOut])
async def create_memo(
    trip_id: uuid.UUID, body: MemoCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    memo, 만들었다 = await memory_service.create_memo(db, trip=trip, actor=membership, memo_id=body.id, body=body.body)
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_메모_응답(memo, await memory_service.author_names(db, [memo.author_membership_id])))


@router.patch("/memos/{memo_id}", response_model=Envelope[MemoOut])
async def update_memo(memo_id: uuid.UUID, body: MemoUpdateRequest, caller: CurrentCaller, db: DbSession) -> dict:
    membership, _, memo = await _살아_있는_메모(db, caller, memo_id)
    require(membership, *WRITERS)
    await memory_service.update_memo(db, memo=memo, version=body.version, body=body.body)
    return ok(_메모_응답(memo, await memory_service.author_names(db, [memo.author_membership_id])))


@router.delete("/memos/{memo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memo(memo_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """남이 쓴 메모도 owner·editor 는 지울 수 있다. 행은 남고 누가 지웠는지 적힌다."""
    membership, trip, memo = await _살아_있는_메모(db, caller, memo_id)
    require(membership, *WRITERS)
    await memory_service.remove_memo(db, memo=memo, actor=membership)
    await audit.record(db, space_id=trip.space_id, actor_membership_id=membership.id, action="memo.delete", target_type="memo", target_id=memo.id, summary_fields={"tripId": str(trip.id)})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# 일기
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/diaries", response_model=Page[DiaryOut])
async def list_diaries(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    diaries = await memory_service.list_diaries(db, trip)
    names = await memory_service.author_names(db, [diary.author_membership_id for diary in diaries])
    return page([_일기_응답(diary, names) for diary in diaries])


@router.post("/trips/{trip_id}/diaries", status_code=status.HTTP_201_CREATED, response_model=Envelope[DiaryOut])
async def create_diary(
    trip_id: uuid.UUID, body: DiaryCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    diary, 만들었다 = await memory_service.create_diary(
        db, trip=trip, actor=membership, diary_id=body.id, values=body.model_dump(exclude={"id"})
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_일기_응답(diary, await memory_service.author_names(db, [diary.author_membership_id])))


@router.patch("/diaries/{diary_id}", response_model=Envelope[DiaryOut])
async def update_diary(diary_id: uuid.UUID, body: DiaryUpdateRequest, caller: CurrentCaller, db: DbSession) -> dict:
    membership, _, diary = await membership_for_trip_row(db, user_id=caller.user.id, model=Diary, row_id=diary_id)
    require(membership, *WRITERS)
    await memory_service.update_diary(
        db, diary=diary, version=body.version, changes=body.model_dump(exclude_unset=True, exclude={"version"})
    )
    return ok(_일기_응답(diary, await memory_service.author_names(db, [diary.author_membership_id])))


@router.delete("/diaries/{diary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diary(diary_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    membership, _, diary = await membership_for_trip_row(db, user_id=caller.user.id, model=Diary, row_id=diary_id)
    require(membership, *WRITERS)
    await memory_service.remove_diary(db, diary)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
