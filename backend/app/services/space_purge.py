import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExternalLink,
    LinkTargetType,
    Membership,
    Space,
    TagScope,
    Tagging,
    Trip,
    TripPlace,
)


async def purge_space(session: AsyncSession, space_id: uuid.UUID) -> None:
    """
    공간을 실제로 지운다. 되돌릴 수 없다.

    사용자가 누르는 삭제는 이것이 아니다. 화면에서 지우면 `deleted_at` 만
    채워 두고 유예 기간이 지난 뒤 정리 작업이 이 함수를 부른다
    (docs/development/02-architecture-and-data-model.md 3장).

    두 가지를 손으로 해야 해서 `DELETE FROM spaces` 한 줄로 끝나지 않는다.

    **하나, 순서.** 공간을 지우면 멤버가 CASCADE 로 따라 지워지는데, 그
    멤버를 `trip_participants` 가 RESTRICT 로 잡고 있어서 외래키 위반이 난다.
    PostgreSQL 은 여행을 먼저 정리해 주지 않는다. RESTRICT 를 CASCADE 로
    바꾸면 이 순서는 필요 없어지지만, 그러면 멤버 한 명을 지우는 실수가
    지난 여행의 참가자 기록을 조용히 함께 지운다.

    **둘, 외래키가 없는 것.** `external_links` 와 `taggings` 는 `target_id`
    로 여러 종류를 가리켜서 외래키를 걸 수 없다. 아무것도 하지 않으면 공간을
    지운 뒤에도 이 줄들이 영영 남는다. 손으로 지운다.
    """
    # 1. 지울 대상의 id 를 먼저 모은다. 지우고 나면 찾을 수 없다.
    여행_ids = (
        await session.execute(select(Trip.id).where(Trip.space_id == space_id))
    ).scalars().all()
    여행_장소_ids = (
        await session.execute(select(TripPlace.id).where(TripPlace.trip_id.in_(여행_ids)))
    ).scalars().all() if 여행_ids else []

    # 2. 외래키가 없어 따라 지워지지 않는 것들.
    if 여행_ids:
        await session.execute(
            delete(ExternalLink).where(
                ExternalLink.target_type == LinkTargetType.TRIP,
                ExternalLink.target_id.in_(여행_ids),
            )
        )
    if 여행_장소_ids:
        await session.execute(
            delete(ExternalLink).where(
                ExternalLink.target_type == LinkTargetType.PLACE,
                ExternalLink.target_id.in_(여행_장소_ids),
            )
        )
        # taggings 는 tag 를 거쳐 CASCADE 되지만, 다른 공간의 태그가 붙어
        # 있으면 남는다. 그런 일이 없어야 하나 DB 가 막지 못하므로 함께 지운다.
        await session.execute(
            delete(Tagging).where(
                Tagging.target_type == TagScope.PLACE,
                Tagging.target_id.in_(여행_장소_ids),
            )
        )

    # 3. 여행을 먼저 지운다. trip_days, trip_participants, trip_places 가 딸려 간다.
    await session.execute(delete(Trip).where(Trip.space_id == space_id))
    # 4. 이제 멤버를 잡고 있는 것이 없다.
    await session.execute(delete(Membership).where(Membership.space_id == space_id))
    # 5. 마지막으로 공간. relationship_profiles 와 tags(그리고 그 taggings)가 딸려 간다.
    await session.execute(delete(Space).where(Space.id == space_id))
