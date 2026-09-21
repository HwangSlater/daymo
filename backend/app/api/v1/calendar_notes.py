import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_calendar_note, membership_in_space, require
from app.core.responses import ok, page
from app.models import CalendarNote
from app.schemas.calendar import CalendarNoteCreateRequest, CalendarNoteOut, CalendarNoteUpdateRequest
from app.services import calendar_notes as note_service

router = APIRouter(tags=["calendar notes"])


def _응답(note: CalendarNote) -> dict:
    return CalendarNoteOut(
        id=str(note.id),
        space_id=str(note.space_id),
        kind=note.kind,
        membership_id=str(note.membership_id) if note.membership_id else None,
        title=note.title,
        start_date=note.start_date,
        end_date=note.end_date,
        time=note_service.time_text(note.time),
        created_by_membership_id=(
            str(note.created_by_membership_id) if note.created_by_membership_id else None
        ),
        version=note.version,
        created_at=note.created_at,
    ).model_dump(by_alias=True, mode="json")


@router.get("/spaces/{space_id}/calendar-notes")
async def list_calendar_notes(
    space_id: uuid.UUID,
    caller: CurrentCaller,
    db: DbSession,
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
) -> dict:
    """기간과 겹치는 일정·메모. 공간 멤버면 누구나 본다."""
    await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    return page([_응답(note) for note in await note_service.list_notes(db, space_id, start, end)])


@router.post("/spaces/{space_id}/calendar-notes", status_code=status.HTTP_201_CREATED)
async def create_calendar_note(
    space_id: uuid.UUID,
    body: CalendarNoteCreateRequest,
    caller: CurrentCaller,
    db: DbSession,
    response: Response,
) -> dict:
    membership = await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    require(membership, *WRITERS)
    note, 만들었다 = await note_service.create_note(
        db,
        space_id=space_id,
        actor=membership,
        note_id=body.id,
        kind=body.kind,
        membership_id=body.membership_id,
        title=body.title,
        start_date=body.start_date,
        end_date=body.end_date,
        time_value=body.time,
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_응답(note))


@router.patch("/calendar-notes/{note_id}")
async def update_calendar_note(
    note_id: uuid.UUID, body: CalendarNoteUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    """만든 사람과 owner 만 고친다."""
    membership, note = await membership_for_calendar_note(db, user_id=caller.user.id, note_id=note_id)
    require(membership, *WRITERS)
    await note_service.update_note(
        db,
        note=note,
        actor=membership,
        version=body.version,
        changes=body.model_dump(exclude_unset=True, exclude={"version"}),
    )
    return ok(_응답(note))


@router.delete("/calendar-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar_note(note_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    """만든 사람과 owner 만 지운다."""
    membership, note = await membership_for_calendar_note(db, user_id=caller.user.id, note_id=note_id)
    require(membership, *WRITERS)
    await note_service.remove_note(db, note=note, actor=membership)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
