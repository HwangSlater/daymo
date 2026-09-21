"""
공간 캘린더의 일정과 메모.

여행 날짜를 잡을 때 누가 언제 바쁜지 보려고 적는다. 여행이 아니라 공간에 붙는다.

- 일정(`schedule`)은 그 공간 멤버 한 사람의 것이다. 메모(`memo`)는 누구의 것도 아니다.
- 고치고 지우는 것은 만든 사람과 owner 만이다. 남의 출장 일정을 editor 가 말없이
  옮기면 곤란하다. 기념 카드·사진과 같은 규칙이다.
- 지우면 행을 지운다. 휴지통에 넣지 않는다. 짧은 한 줄이라 다시 적는 편이 빠르다.
"""

import uuid
from datetime import UTC, date, datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import CalendarNote, CalendarNoteKind, Membership, MembershipRole

# 한 줄이 덮는 날 수. 여행 하나의 상한과 같다(app/services/trips.MAX_TRIP_DAYS).
MAX_NOTE_DAYS = 60
# 한 번에 읽는 기간. 앱은 달력 한두 달을 읽는다. 넉넉히 1년 남짓이다.
MAX_RANGE_DAYS = 400


def can_manage(membership: Membership, note: CalendarNote) -> bool:
    return membership.role == MembershipRole.OWNER or note.created_by_membership_id == membership.id


def time_text(value: time | None) -> str | None:
    return value.strftime("%H:%M") if value is not None else None


def _시각(value: str | None) -> time | None:
    if value is None:
        return None
    시, 분 = value.split(":")
    return time(int(시), int(분))


def check_range(start: date, end: date) -> None:
    if start > end:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"to": "끝나는 날이 시작하는 날보다 빠를 수 없어요."})
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"to": f"한 번에 {MAX_RANGE_DAYS}일까지 볼 수 있어요."})


def _기간을_본다(start: date, end: date) -> None:
    if end < start:
        raise AppError(
            ErrorCode.VALIDATION_ERROR, fields={"endDate": "종료일이 시작일보다 빠를 수 없어요."}
        )
    if (end - start).days + 1 > MAX_NOTE_DAYS:
        raise AppError(
            ErrorCode.VALIDATION_ERROR, fields={"endDate": f"{MAX_NOTE_DAYS}일까지 적을 수 있어요."}
        )


async def _멤버를_본다(session: AsyncSession, space_id: uuid.UUID, membership_id: uuid.UUID | None) -> None:
    """일정의 주인은 지금 그 공간에 있는 멤버여야 한다. 나간 사람에게 새 일정을 달 수 없다."""
    if membership_id is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"membershipId": "누구의 일정인지 골라 주세요."})
    있다 = await session.scalar(
        select(Membership.id).where(
            Membership.id == membership_id,
            Membership.space_id == space_id,
            Membership.left_at.is_(None),
        )
    )
    if 있다 is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"membershipId": "이 공간 멤버가 아니에요."})


async def list_notes(session: AsyncSession, space_id: uuid.UUID, start: date, end: date) -> list[CalendarNote]:
    """
    기간과 겹치는 것 전부.

    같은 날 안에서는 하루 종일인 것(시각 없음)이 먼저다. 달력 앱들이 그렇게 놓는다.
    """
    check_range(start, end)
    return list(
        (
            await session.execute(
                select(CalendarNote)
                .where(
                    CalendarNote.space_id == space_id,
                    CalendarNote.end_date >= start,
                    CalendarNote.start_date <= end,
                )
                .order_by(
                    CalendarNote.start_date,
                    CalendarNote.time.asc().nulls_first(),
                    CalendarNote.created_at,
                    CalendarNote.id,
                )
            )
        )
        .scalars()
        .all()
    )


async def create_note(
    session: AsyncSession,
    *,
    space_id: uuid.UUID,
    actor: Membership,
    note_id: uuid.UUID | None,
    kind: CalendarNoteKind,
    membership_id: uuid.UUID | None,
    title: str,
    start_date: date,
    end_date: date,
    time_value: str | None,
) -> tuple[CalendarNote, bool]:
    """
    `note_id` 를 앱이 보내면 같은 요청이 두 번 닿아도 하나만 생긴다. 이미 있으면
    그것을 돌려준다(기념 카드·메모와 같은 규칙). 다른 공간의 id 면 받지 않는다.
    """
    if note_id is not None:
        기존 = await session.get(CalendarNote, note_id)
        if 기존 is not None:
            if 기존.space_id != space_id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False

    _기간을_본다(start_date, end_date)
    if kind == CalendarNoteKind.SCHEDULE:
        await _멤버를_본다(session, space_id, membership_id)
    else:
        membership_id = None

    note = CalendarNote(
        id=note_id or uuid.uuid4(),
        space_id=space_id,
        kind=kind,
        membership_id=membership_id,
        title=title,
        start_date=start_date,
        end_date=end_date,
        time=_시각(time_value),
        created_by_membership_id=actor.id,
        created_by=actor.user_id,
    )
    session.add(note)
    await session.flush()
    await session.refresh(note)
    return note, True


# 비울 수 없는 칸. PATCH 에 null 로 오면 422 다.
_필수 = {"kind": "kind", "title": "title", "start_date": "startDate", "end_date": "endDate"}


async def update_note(
    session: AsyncSession, *, note: CalendarNote, actor: Membership, version: int, changes: dict
) -> CalendarNote:
    if not can_manage(actor, note):
        raise AppError(ErrorCode.FORBIDDEN)
    if version != note.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    for 칸, 이름 in _필수.items():
        if 칸 in changes and changes[칸] is None:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={이름: "비워 둘 수 없어요."})

    kind = changes.get("kind", note.kind)
    start = changes.get("start_date", note.start_date)
    end = changes.get("end_date", note.end_date)
    _기간을_본다(start, end)

    if kind == CalendarNoteKind.SCHEDULE:
        membership_id = changes.get("membership_id", note.membership_id)
        # 사람을 바꾸거나 메모를 일정으로 바꿀 때만 본다. 앱은 고칠 때 값을 통째로
        # 보내므로, 같은 사람을 다시 보낸 것까지 보면 주인이 나간 지난 일정은 제목
        # 한 글자도 고칠 길이 없어진다.
        if membership_id != note.membership_id or note.kind != CalendarNoteKind.SCHEDULE:
            await _멤버를_본다(session, note.space_id, membership_id)
    else:
        membership_id = None

    note.kind = kind
    note.membership_id = membership_id
    note.start_date = start
    note.end_date = end
    if "title" in changes:
        note.title = changes["title"]
    if "time" in changes:
        note.time = _시각(changes["time"])
    note.version += 1
    note.updated_at = datetime.now(UTC)
    await session.flush()
    return note


async def remove_note(session: AsyncSession, *, note: CalendarNote, actor: Membership) -> None:
    if not can_manage(actor, note):
        raise AppError(ErrorCode.FORBIDDEN)
    await session.delete(note)
    await session.flush()
