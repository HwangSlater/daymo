import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import Membership, Photo, PhotoStatus, Trip, TripDay, TripParticipant, TripStatus
from app.services import photo_files
from app.services.space_purge import detach_trip_children, link_targets_of_trips

# 여행 기간의 상한. 문서가 초기 60일로 정해 뒀다.
#
# 기간마다 `trip_days` 를 한 줄씩 만들기 때문에 상한이 없으면 요청 하나로
# 수만 줄을 넣을 수 있다. 제품 규칙이자 서버를 지키는 선이기도 하다.
MAX_TRIP_DAYS = 60

# 지운 뒤 되돌릴 수 있는 기간.
RESTORE_WINDOW = timedelta(days=7)


async def check_card_photos(
    session: AsyncSession, trip: Trip, photo_ids: list[str], *, field: str = "photoIds"
) -> None:
    """
    기념 카드나 홈 카드에 쓸 사진. 그 여행에 올라온 살아 있는 사진이어야 한다.

    남의 여행 사진 id 를 보내면 그 공간 사람이 아닌데도 카드에 걸리므로 막는다.
    """
    안_된다 = AppError(ErrorCode.VALIDATION_ERROR, fields={field: "이 여행의 사진이 아니에요."})
    try:
        고른_것 = [uuid.UUID(값) for 값 in photo_ids]
    except ValueError as 원인:
        raise 안_된다 from 원인
    if not 고른_것:
        return
    있는_것 = set(
        (
            await session.execute(
                select(Photo.id).where(
                    Photo.id.in_(고른_것),
                    Photo.trip_id == trip.id,
                    Photo.deleted_at.is_(None),
                    Photo.status == PhotoStatus.READY,
                )
            )
        ).scalars().all()
    )
    if any(값 not in 있는_것 for 값 in 고른_것):
        raise 안_된다


def _기간을_본다(start: date, end: date) -> int:
    if end < start:
        raise AppError(
            ErrorCode.VALIDATION_ERROR, fields={"endDate": "종료일이 시작일보다 빠를 수 없어요."}
        )
    날_수 = (end - start).days + 1
    if 날_수 > MAX_TRIP_DAYS:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            fields={"endDate": f"한 여행은 {MAX_TRIP_DAYS}일까지 만들 수 있어요."},
        )
    return 날_수


async def create_trip(
    session: AsyncSession,
    *,
    space_id: uuid.UUID,
    actor: Membership,
    title: str,
    start_date: date,
    end_date: date,
    region_code: str | None = None,
    region_name: str | None = None,
    summary: str | None = None,
    cooking_enabled: bool = False,
    participant_membership_ids: list[uuid.UUID] | None = None,
) -> Trip:
    """
    여행과 기간 안의 날들을 **한 transaction 에서** 만든다.

    날을 따로 만들면 여행만 있고 날이 없는 상태가 생긴다. 그 여행은 일정을
    담을 곳이 없어서 화면에서 아무것도 할 수 없다.
    """
    날_수 = _기간을_본다(start_date, end_date)

    trip = Trip(
        space_id=space_id,
        title=title,
        start_date=start_date,
        end_date=end_date,
        region_code=region_code,
        region_name=region_name,
        summary=summary,
        cooking_enabled=cooking_enabled,
        created_by=actor.user_id,
    )
    session.add(trip)
    await session.flush()

    session.add_all(
        [
            TripDay(trip_id=trip.id, date=start_date + timedelta(days=i), day_index=i + 1)
            for i in range(날_수)
        ]
    )
    if participant_membership_ids:
        await set_participants(
            session, trip=trip, membership_ids=participant_membership_ids, actor=actor
        )
    await session.flush()
    return trip


async def set_participants(
    session: AsyncSession,
    *,
    trip: Trip,
    membership_ids: list[uuid.UUID],
    actor: Membership,
) -> list[TripParticipant]:
    """
    이번 여행에 가는 사람을 정한다.

    **같은 공간의 살아 있는 멤버만 넣을 수 있다.** 이 검사는 외래키로
    표현할 수 없어서 여기서 한다. 빠지면 남의 공간 멤버를 내 여행 참가자로
    넣을 수 있고, 그 사람 이름이 내 여행 화면에 뜬다. 다만 이미 참가자인
    사람은 공간을 나갔어도 남길 수 있다. 지난 여행의 참가자를 고칠 때마다
    나간 사람이 빠지면 그 사람의 몫이 정산에서 사라진다.

    뺀 사람의 줄은 지우지 않고 `removed_at` 을 채운다. 그 사람이 맡았던
    준비물과 낸 지출이 이 줄을 거쳐 사람을 가리킨다.
    """
    고른_것 = list(dict.fromkeys(membership_ids))  # 순서를 지키며 중복 제거

    유효한_것 = set(
        (
            await session.execute(
                select(Membership.id).where(
                    Membership.id.in_(고른_것),
                    Membership.space_id == trip.space_id,
                    or_(
                        Membership.left_at.is_(None),
                        Membership.id.in_(
                            select(TripParticipant.membership_id).where(
                                TripParticipant.trip_id == trip.id,
                                TripParticipant.removed_at.is_(None),
                            )
                        ),
                    ),
                )
            )
        ).scalars().all()
    )
    낯선_것 = [값 for 값 in 고른_것 if 값 not in 유효한_것]
    if 낯선_것:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            fields={"participantMembershipIds": "이 공간의 멤버가 아닌 사람이 있어요."},
        )

    지금 = datetime.now(UTC)
    기존 = (
        await session.execute(select(TripParticipant).where(TripParticipant.trip_id == trip.id))
    ).scalars().all()
    기존_지도 = {줄.membership_id: 줄 for 줄 in 기존 if 줄.removed_at is None}

    for 순서, membership_id in enumerate(고른_것):
        줄 = 기존_지도.pop(membership_id, None)
        if 줄 is None:
            session.add(
                TripParticipant(
                    trip_id=trip.id,
                    membership_id=membership_id,
                    sort_order=순서,
                    created_by=actor.user_id,
                )
            )
        else:
            줄.sort_order = 순서

    # 목록에서 빠진 사람은 뺀 것으로 표시한다.
    for 줄 in 기존_지도.values():
        줄.removed_at = 지금

    await session.flush()
    return (
        await session.execute(
            select(TripParticipant)
            .where(TripParticipant.trip_id == trip.id, TripParticipant.removed_at.is_(None))
            .order_by(TripParticipant.sort_order)
        )
    ).scalars().all()


def check_version(trip: Trip, expected: int | None) -> None:
    """
    다른 곳에서 먼저 고쳤는지 본다.

    함께 쓰는 공간이라 두 사람이 같은 여행을 동시에 고칠 수 있다. 마지막에
    저장한 쪽이 앞사람의 수정을 조용히 덮어쓰면, 무엇이 사라졌는지 아무도
    모른다. 어긋나면 `409` 로 돌려주고 앱이 새로 받아 다시 시도한다.
    """
    if expected is not None and expected != trip.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)


async def archive_trip(session: AsyncSession, trip: Trip, *, archived: bool) -> Trip:
    """
    보관하거나 보관을 푼다.

    보관은 목록 정리 상태일 뿐이라 **하위 데이터 쓰기를 막지 않는다.**
    여행이 끝난 뒤에 사진을 올리고 일기를 쓰는 것이 오히려 흔하다.
    """
    지금 = datetime.now(UTC)
    trip.archived_at = 지금 if archived else None
    if archived:
        trip.status = TripStatus.ARCHIVED
    elif trip.status is TripStatus.ARCHIVED:
        # 보관을 풀 때 어떤 상태로 돌아갈지는 날짜가 정한다.
        오늘 = 지금.date()
        trip.status = (
            TripStatus.COMPLETED
            if trip.end_date < 오늘
            else TripStatus.ONGOING
            if trip.start_date <= 오늘
            else TripStatus.PLANNING
        )
    trip.version += 1
    await session.flush()
    return trip


async def request_delete(session: AsyncSession, trip: Trip) -> Trip:
    """
    여행을 지운다. 바로 없애지 않고 7일 동안 되돌릴 수 있게 둔다.

    일반 목록·검색·지도·캘린더에서는 즉시 빠지고 관리 조회에만 남는다.
    """
    지금 = datetime.now(UTC)
    trip.deleted_at = 지금
    trip.deletion_scheduled_at = 지금 + RESTORE_WINDOW
    trip.version += 1
    await session.flush()
    return trip


async def restore_trip(session: AsyncSession, trip: Trip) -> Trip:
    """
    지운 여행을 되살린다.

    기한이 지났으면 `410` 이다. 아직 행이 남아 있어도 되살리지 않는다.
    정리 작업이 언제 도느냐에 따라 되살아나기도 하고 아니기도 하면,
    사용자에게 7일이라고 안내한 것이 거짓이 된다.
    """
    if trip.deleted_at is None:
        return trip
    if trip.deletion_scheduled_at and trip.deletion_scheduled_at <= datetime.now(UTC):
        raise AppError(ErrorCode.GONE)

    trip.deleted_at = None
    trip.deletion_scheduled_at = None
    trip.version += 1
    await session.flush()
    return trip


async def purge_deleted_trips(session: AsyncSession, *, now: datetime | None = None) -> int:
    """
    기한이 지난 여행을 실제로 지운다. 정기 작업에서 부른다.

    지우기 전에 외래키가 없는 링크·태그 연결을 뗀다. 빠뜨리면 여행은 사라지고
    그 여행 장소에 붙은 지도 링크와 태그 연결만 남는다.
    """
    지금 = now or datetime.now(UTC)
    기한 = [
        Trip.deleted_at.is_not(None),
        Trip.deletion_scheduled_at.is_not(None),
        Trip.deletion_scheduled_at <= 지금,
    ]
    여행_ids = (await session.execute(select(Trip.id).where(*기한))).scalars().all()
    if not 여행_ids:
        return 0
    await detach_trip_children(session, await link_targets_of_trips(session, 여행_ids))
    지운_것 = await session.execute(delete(Trip).where(Trip.id.in_(여행_ids)))
    await session.flush()
    # 사진 줄은 CASCADE 로 사라지지만 파일은 남는다. 여행 폴더째 지운다.
    photo_files.remove_trips(list(여행_ids))
    return 지운_것.rowcount or 0
