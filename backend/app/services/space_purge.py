import uuid
from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Checklist,
    ChecklistItem,
    ExternalLink,
    LinkTargetType,
    Membership,
    ScheduleItem,
    Space,
    Stay,
    TagScope,
    Tagging,
    Trip,
    TripPlace,
)
from app.services import photo_files


async def purge_space(session: AsyncSession, space_id: uuid.UUID) -> None:
    """
    공간을 실제로 지운다. 되돌릴 수 없다.

    사용자가 누르는 삭제는 이것이 아니다. 화면에서 지우면 `deleted_at` 만
    채워 두고 유예 기간이 지난 뒤 정리 작업이 이 함수를 부른다
    (docs/development/02-architecture-and-data-model.md 3장).

    두 가지를 손으로 해야 해서 `DELETE FROM spaces` 한 줄로 끝나지 않는다.

    **하나, 순서.** 공간을 지우면 멤버가 CASCADE 로 따라 지워지는데, 그
    멤버를 `trip_participants` 와 `transports` 가 RESTRICT 로 잡고 있어서
    외래키 위반이 난다. PostgreSQL 은 여행을 먼저 정리해 주지 않는다.
    RESTRICT 를 CASCADE 로 바꾸면 이 순서는 필요 없어지지만, 그러면 멤버
    한 명을 지우는 실수가 지난 여행의 기록을 조용히 함께 지운다.

    **둘, 외래키가 없는 것.** `external_links` 와 `taggings` 는 `target_id`
    로 여러 종류를 가리켜서 외래키를 걸 수 없다. 아무것도 하지 않으면 공간을
    지운 뒤에도 이 줄들이 영영 남는다. 쌓이는 것보다, 나중에 같은 UUID 가
    다시 쓰였을 때 남의 링크가 붙어 보이는 쪽이 진짜 문제다.

    **`LinkTargetType` 에 값을 더하면 여기도 함께 고쳐야 한다.** 빠뜨려도
    아무 오류가 나지 않고 조용히 남는 종류의 실수다.
    """
    await detach_trip_children(session, await link_targets_of(session, space_id))

    # 여행을 먼저. trip_days, trip_participants, trip_places, schedule_items,
    # stays, transports, reservations 가 전부 딸려 간다.
    여행_ids = list((await session.execute(select(Trip.id).where(Trip.space_id == space_id))).scalars())
    await session.execute(delete(Trip).where(Trip.space_id == space_id))
    # 사진 파일은 DB 가 지워 주지 않는다.
    photo_files.remove_trips(여행_ids)
    # 이제 멤버를 잡고 있는 것이 없다.
    await session.execute(delete(Membership).where(Membership.space_id == space_id))
    # 마지막으로 공간. relationship_profiles 와 tags(그리고 그 taggings)가 딸려 간다.
    await session.execute(delete(Space).where(Space.id == space_id))


async def detach_trip_children(
    session: AsyncSession, 링크_대상: dict[LinkTargetType, Sequence[uuid.UUID]]
) -> None:
    """
    여행을 지우기 전에, 외래키가 없어 따라 지워지지 않는 링크와 태그 연결을 뗀다.

    공간 정리와 기한이 지난 여행 정리가 함께 쓴다.
    """
    for 종류, ids in 링크_대상.items():
        if ids:
            await session.execute(
                delete(ExternalLink).where(
                    ExternalLink.target_type == 종류, ExternalLink.target_id.in_(ids)
                )
            )

    여행_장소_ids = 링크_대상[LinkTargetType.PLACE]
    if 여행_장소_ids:
        # taggings 는 tag 를 거쳐 CASCADE 되지만, 다른 공간의 태그가 붙어
        # 있으면 남는다. 그런 일이 없어야 하나 DB 가 막지 못하므로 함께 지운다.
        await session.execute(
            delete(Tagging).where(
                Tagging.target_type == TagScope.PLACE, Tagging.target_id.in_(여행_장소_ids)
            )
        )

    여행_ids = 링크_대상[LinkTargetType.TRIP]
    if 여행_ids:
        # 준비물 태그도 같은 이유로 뗀다. 준비물은 목록을 거쳐 여행에 딸려 있다.
        await session.execute(
            delete(Tagging).where(
                Tagging.target_type == TagScope.PACKING,
                Tagging.target_id.in_(
                    select(ChecklistItem.id)
                    .join(Checklist, Checklist.id == ChecklistItem.checklist_id)
                    .where(Checklist.trip_id.in_(여행_ids))
                ),
            )
        )


async def link_targets_of_trips(
    session: AsyncSession, 여행_ids: Sequence[uuid.UUID]
) -> dict[LinkTargetType, Sequence[uuid.UUID]]:
    """이 여행들을 지울 때 함께 사라지는, 바깥 링크가 붙을 수 있는 모든 것."""
    if not 여행_ids:
        return {종류: [] for 종류 in LinkTargetType}

    return {
        LinkTargetType.TRIP: list(여행_ids),
        LinkTargetType.PLACE: await _ids(
            session, select(TripPlace.id).where(TripPlace.trip_id.in_(여행_ids))
        ),
        LinkTargetType.STAY: await _ids(
            session, select(Stay.id).where(Stay.trip_id.in_(여행_ids))
        ),
        LinkTargetType.SCHEDULE: await _ids(
            session, select(ScheduleItem.id).where(ScheduleItem.trip_id.in_(여행_ids))
        ),
    }


async def link_targets_of(
    session: AsyncSession, space_id: uuid.UUID
) -> dict[LinkTargetType, Sequence[uuid.UUID]]:
    """
    이 공간을 지울 때 함께 사라지는, 바깥 링크가 붙을 수 있는 모든 것.

    `LinkTargetType` 의 값마다 한 칸씩 있어야 한다. 빠진 값이 있으면 그
    종류의 링크가 공간을 지운 뒤에도 남는데, 오류가 나지 않아 알 수 없다.
    그래서 테스트가 이 dict 의 열쇠와 enum 을 맞춰 본다.
    """
    return await link_targets_of_trips(
        session, await _ids(session, select(Trip.id).where(Trip.space_id == space_id))
    )


async def _ids(session: AsyncSession, 질의) -> Sequence[uuid.UUID]:
    return (await session.execute(질의)).scalars().all()
