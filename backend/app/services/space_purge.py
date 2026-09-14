import uuid

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Membership, Space, Trip


async def purge_space(session: AsyncSession, space_id: uuid.UUID) -> None:
    """
    공간을 실제로 지운다. 되돌릴 수 없다.

    사용자가 누르는 삭제는 이것이 아니다. 화면에서 지우면 `deleted_at` 만
    채워 두고 유예 기간이 지난 뒤 정리 작업이 이 함수를 부른다
    (docs/development/02-architecture-and-data-model.md 3장).

    **순서가 중요하다.** `DELETE FROM spaces` 한 줄로는 지워지지 않는다.
    공간을 지우면 멤버가 CASCADE 로 따라 지워지는데, 그 멤버를
    `trip_participants` 가 RESTRICT 로 잡고 있어서 외래키 위반이 난다.
    PostgreSQL 은 여행을 먼저 정리해 주지 않는다.

    RESTRICT 를 CASCADE 로 바꾸면 이 함수는 필요 없어지지만, 그러면 멤버
    한 명을 지우는 실수가 지난 여행의 참가자 기록을 조용히 함께 지운다.
    한 곳에서 순서를 지키는 쪽이 낫다고 봤다.
    """
    # 여행을 먼저 지운다. trip_days 와 trip_participants 가 여기에 딸려 간다.
    await session.execute(delete(Trip).where(Trip.space_id == space_id))
    # 이제 멤버를 잡고 있는 것이 없다.
    await session.execute(delete(Membership).where(Membership.space_id == space_id))
    # 마지막으로 공간. relationship_profiles 가 딸려 간다.
    await session.execute(delete(Space).where(Space.id == space_id))
