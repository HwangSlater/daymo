import uuid

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExternalLink, LinkTargetType, TagScope, Tagging


async def detach_all(
    session: AsyncSession,
    *,
    tag_scope: TagScope | None = None,
    link_target: LinkTargetType | None = None,
    target_id: uuid.UUID,
) -> None:
    """
    어떤 대상에 매달려 있던 태그 연결과 바깥 링크를 떼어 낸다.

    `taggings.target_id` 와 `external_links.target_id` 에는 외래키가 없다.
    가리키는 곳이 장소일 수도 준비물일 수도 재료일 수도 있어서 한 칼럼으로는
    외래키를 걸 수 없다. 그래서 **대상을 지워도 이 줄들은 그대로 남는다.**

    남으면 두 가지가 나빠진다. 쓰이지 않는 줄이 계속 쌓이고, 나중에 같은
    UUID 가 다시 쓰이면 남의 태그가 붙어 보인다. 두 번째가 진짜 문제다.

    대상을 지우는 모든 자리에서 이것을 함께 불러야 한다. 잊기 쉬운 구조라,
    지우는 코드를 새로 쓸 때마다 여기를 확인해라.
    """
    if tag_scope is not None:
        await session.execute(
            delete(Tagging).where(
                Tagging.target_type == tag_scope, Tagging.target_id == target_id
            )
        )
    if link_target is not None:
        await session.execute(
            delete(ExternalLink).where(
                ExternalLink.target_type == link_target,
                ExternalLink.target_id == target_id,
            )
        )
