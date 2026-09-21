import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import CalendarNote, Checklist, ChecklistItem, Membership, MembershipRole, Space, Trip, TripPlace

# 권한 표는 docs/development/02-architecture-and-data-model.md 4장에 있다.
#
#   공간 수정/삭제, 멤버 내보내기   owner
#   여행과 하위 데이터 작성          owner, editor
#   여행 보관/보관 해제              owner, editor
#   여행 삭제/복구                   owner
#   조회                             전원
#
# **없는 것과 권한 없는 것을 같은 404 로 답한다.** 403 을 주면 그 id 가
# 존재한다는 뜻이 되어, 남의 공간과 여행 id 를 찍어 볼 수 있다. 멤버가 된
# 뒤에야 403 이 의미를 갖는다.

WRITERS = (MembershipRole.OWNER, MembershipRole.EDITOR)
OWNER_ONLY = (MembershipRole.OWNER,)


async def membership_in_space(
    session: AsyncSession, *, user_id: uuid.UUID, space_id: uuid.UUID
) -> Membership:
    """
    이 사람이 그 공간의 살아 있는 멤버인지 본다.

    나간 멤버(`left_at` 이 찬 행)는 멤버가 아니다. 기록으로 남아 있을 뿐이다.
    """
    membership = await session.scalar(
        select(Membership)
        .join(Space, Space.id == Membership.space_id)
        .where(
            Membership.space_id == space_id,
            Membership.user_id == user_id,
            Membership.left_at.is_(None),
            Space.deleted_at.is_(None),
        )
    )
    if membership is None:
        raise AppError(ErrorCode.NOT_FOUND)
    return membership


async def membership_for_trip(
    session: AsyncSession, *, user_id: uuid.UUID, trip_id: uuid.UUID, include_deleted: bool = False
) -> tuple[Membership, Trip]:
    """
    여행과 그 여행에 대한 내 자격을 함께 가져온다.

    여행을 먼저 찾고 권한을 나중에 보지 않는다. 한 질의에서 공간을 거쳐
    멤버십까지 확인해야 남의 여행 id 로 존재 여부를 알아낼 수 없다
    (문서의 IDOR 차단 원칙).

    `include_deleted` 는 복구 경로에서만 쓴다. 지워진 여행은 일반 조회에
    나오지 않아야 한다.
    """
    조건 = [
        Trip.id == trip_id,
        Membership.user_id == user_id,
        Membership.left_at.is_(None),
        Space.deleted_at.is_(None),
    ]
    if not include_deleted:
        조건.append(Trip.deleted_at.is_(None))

    줄 = (
        await session.execute(
            select(Membership, Trip)
            .join(Space, Space.id == Membership.space_id)
            .join(Trip, Trip.space_id == Space.id)
            .where(*조건)
        )
    ).first()
    if 줄 is None:
        raise AppError(ErrorCode.NOT_FOUND)
    return 줄[0], 줄[1]


async def membership_for_trip_row(session: AsyncSession, *, user_id: uuid.UUID, model, row_id: uuid.UUID):
    """
    여행에 딸린 줄(장소·일정·숙소 …)과 그 여행, 내 자격을 한 질의로 가져온다.

    `membership_for_trip` 과 같은 이유로 줄을 먼저 찾지 않는다. 지워진 여행의
    줄은 없는 것으로 본다. `model` 은 `trip_id` 칸이 있는 표다.
    """
    줄 = (
        await session.execute(
            select(Membership, Trip, model)
            .join(Space, Space.id == Membership.space_id)
            .join(Trip, Trip.space_id == Space.id)
            .join(model, model.trip_id == Trip.id)
            .where(
                model.id == row_id,
                Membership.user_id == user_id,
                Membership.left_at.is_(None),
                Space.deleted_at.is_(None),
                Trip.deleted_at.is_(None),
            )
        )
    ).first()
    if 줄 is None:
        raise AppError(ErrorCode.NOT_FOUND)
    return 줄[0], 줄[1], 줄[2]


async def membership_for_checklist_item(
    session: AsyncSession, *, user_id: uuid.UUID, item_id: uuid.UUID
) -> tuple[Membership, Trip, ChecklistItem]:
    """준비물은 여행이 아니라 목록에 딸려 있어서 목록을 한 번 더 거친다."""
    줄 = (
        await session.execute(
            select(Membership, Trip, ChecklistItem)
            .join(Space, Space.id == Membership.space_id)
            .join(Trip, Trip.space_id == Space.id)
            .join(Checklist, Checklist.trip_id == Trip.id)
            .join(ChecklistItem, ChecklistItem.checklist_id == Checklist.id)
            .where(
                ChecklistItem.id == item_id,
                Membership.user_id == user_id,
                Membership.left_at.is_(None),
                Space.deleted_at.is_(None),
                Trip.deleted_at.is_(None),
            )
        )
    ).first()
    if 줄 is None:
        raise AppError(ErrorCode.NOT_FOUND)
    return 줄[0], 줄[1], 줄[2]


async def membership_for_trip_place(
    session: AsyncSession, *, user_id: uuid.UUID, trip_place_id: uuid.UUID
) -> tuple[Membership, Trip, TripPlace]:
    return await membership_for_trip_row(session, user_id=user_id, model=TripPlace, row_id=trip_place_id)


def require(membership: Membership, *allowed: MembershipRole) -> None:
    """
    권한이 모자라면 막는다.

    여기까지 왔다는 것은 이미 멤버라는 뜻이므로 403 을 준다. 멤버에게는
    그 공간에 무엇이 있는지가 이미 보이니 숨길 것이 없다.
    """
    if membership.role not in allowed:
        raise AppError(ErrorCode.FORBIDDEN)


async def membership_for_calendar_note(
    session: AsyncSession, *, user_id: uuid.UUID, note_id: uuid.UUID
) -> tuple[Membership, CalendarNote]:
    """
    공간 캘린더의 한 줄과 그 공간에서의 내 자격을 한 질의로 가져온다.

    여행 줄과 같은 이유로 줄을 먼저 찾지 않는다. 남의 공간 것이면 없는 것과 같은 404 다.
    """
    줄 = (
        await session.execute(
            select(Membership, CalendarNote)
            .join(Space, Space.id == Membership.space_id)
            .join(CalendarNote, CalendarNote.space_id == Space.id)
            .where(
                CalendarNote.id == note_id,
                Membership.user_id == user_id,
                Membership.left_at.is_(None),
                Space.deleted_at.is_(None),
            )
        )
    ).first()
    if 줄 is None:
        raise AppError(ErrorCode.NOT_FOUND)
    return 줄[0], 줄[1]
