"""
여행 메모와 일기.

메모는 지워도 행을 남긴다(`deleted_at`, `deleted_by`). 함께 쓰는 공간이라 누가 언제
지웠는지가 남아야 한다. 휴지통 복원과 audit log 는 아직 없다.

일기는 행을 지운다. 일기에는 사진이 붙지 않아 뗄 연결이 없다.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import Diary, Membership, Memo, Trip, User
from app.services.account_deletion import DELETED_DISPLAY_NAME


async def author_names(session: AsyncSession, ids: list[uuid.UUID | None]) -> dict[uuid.UUID, str]:
    """membership id 마다 지금 표시 이름. 공간 별명이 있으면 별명이다."""
    찾을_것 = {value for value in ids if value is not None}
    if not 찾을_것:
        return {}
    줄들 = await session.execute(
        select(Membership.id, Membership.nickname, User.display_name)
        .join(User, User.id == Membership.user_id)
        .where(Membership.id.in_(찾을_것))
    )
    return {membership_id: nickname or display_name for membership_id, nickname, display_name in 줄들}


def name_of(names: dict[uuid.UUID, str], membership_id: uuid.UUID | None) -> str:
    if membership_id is None:
        return DELETED_DISPLAY_NAME
    return names.get(membership_id, DELETED_DISPLAY_NAME)


def _body(value: str, field: str) -> str:
    본문 = value.strip()
    if not 본문:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={field: "내용을 적어 주세요."})
    return 본문


# ---------------------------------------------------------------------------
# 메모
# ---------------------------------------------------------------------------


async def list_memos(session: AsyncSession, trip: Trip) -> list[Memo]:
    return list(
        (
            await session.execute(
                select(Memo)
                .where(Memo.trip_id == trip.id, Memo.deleted_at.is_(None))
                .order_by(Memo.created_at.desc(), Memo.id)
            )
        ).scalars()
    )


async def create_memo(
    session: AsyncSession, *, trip: Trip, actor: Membership, memo_id: uuid.UUID | None, body: str
) -> tuple[Memo, bool]:
    if memo_id is not None:
        기존 = await session.get(Memo, memo_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            # 지운 메모를 같은 id 로 다시 만들지 않는다. 지운 기록이 되살아난 것처럼 보인다.
            if 기존.deleted_at is not None:
                raise AppError(ErrorCode.NOT_FOUND)
            return 기존, False
    memo = Memo(
        id=memo_id or uuid.uuid4(),
        trip_id=trip.id,
        author_membership_id=actor.id,
        body=_body(body, "body"),
        created_by=actor.user_id,
    )
    session.add(memo)
    await session.flush()
    return memo, True


async def update_memo(session: AsyncSession, *, memo: Memo, version: int, body: str) -> Memo:
    if version != memo.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    본문 = _body(body, "body")
    if 본문 != memo.body:
        memo.body = 본문
        memo.edited_at = datetime.now(UTC)
    memo.version += 1
    await session.flush()
    return memo


async def remove_memo(session: AsyncSession, *, memo: Memo, actor: Membership) -> None:
    memo.deleted_at = datetime.now(UTC)
    memo.deleted_by = actor.id
    memo.version += 1
    await session.flush()


# ---------------------------------------------------------------------------
# 일기
# ---------------------------------------------------------------------------


async def list_diaries(session: AsyncSession, trip: Trip) -> list[Diary]:
    # 다루는 날이 없는 일기는 뒤로 보낸다. 같은 날이면 먼저 쓴 것이 앞이다.
    return list(
        (
            await session.execute(
                select(Diary)
                .where(Diary.trip_id == trip.id)
                .order_by(Diary.written_on.is_(None), Diary.written_on, Diary.created_at, Diary.id)
            )
        ).scalars()
    )


def _title(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


async def create_diary(
    session: AsyncSession, *, trip: Trip, actor: Membership, diary_id: uuid.UUID | None, values: dict
) -> tuple[Diary, bool]:
    if diary_id is not None:
        기존 = await session.get(Diary, diary_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False
    diary = Diary(
        id=diary_id or uuid.uuid4(),
        trip_id=trip.id,
        author_membership_id=actor.id,
        title=_title(values.get("title")),
        body=_body(values["body"], "body"),
        written_on=values.get("written_on"),
        created_by=actor.user_id,
    )
    session.add(diary)
    await session.flush()
    return diary, True


async def update_diary(session: AsyncSession, *, diary: Diary, version: int, changes: dict) -> Diary:
    if version != diary.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    if "title" in changes:
        diary.title = _title(changes["title"])
    if changes.get("body") is not None:
        diary.body = _body(changes["body"], "body")
    if "written_on" in changes:
        diary.written_on = changes["written_on"]
    diary.version += 1
    await session.flush()
    return diary


async def remove_diary(session: AsyncSession, diary: Diary) -> None:
    await session.delete(diary)
    await session.flush()
