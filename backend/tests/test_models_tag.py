import uuid

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import ExternalLink, LinkProvider, LinkTargetType, Tag, TagScope, Tagging
from app.services.links import detach_all
from tests.factories import (
    공간과_멤버_하나,
    여행_장소를_넣는다,
    여행을_넣는다,
    장소를_넣는다,
)

pytestmark = pytest.mark.anyio


async def 태그를_넣는다(db, space, 이름="겨울", scope=TagScope.PLACE):
    tag = Tag(space_id=space.id, scope=scope, name=이름)
    db.add(tag)
    await db.flush()
    return tag


async def test_같은_공간_같은_쓰임에_같은_이름은_하나뿐(db):
    space, _ = await 공간과_멤버_하나(db)
    await 태그를_넣는다(db, space, "겨울")

    db.add(Tag(space_id=space.id, scope=TagScope.PLACE, name="겨울"))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_쓰임이_다르면_같은_이름을_쓸_수_있다(db):
    """준비물의 `겨울` 과 장소의 `겨울` 은 섞이면 안 된다."""
    space, _ = await 공간과_멤버_하나(db)

    await 태그를_넣는다(db, space, "겨울", TagScope.PLACE)
    await 태그를_넣는다(db, space, "겨울", TagScope.PACKING)

    수 = await db.scalar(select(func.count()).select_from(Tag).where(Tag.space_id == space.id))
    assert 수 == 2


async def test_다른_공간이면_같은_이름을_쓸_수_있다(db):
    첫_공간, _ = await 공간과_멤버_하나(db)
    둘째_공간, _ = await 공간과_멤버_하나(db)

    await 태그를_넣는다(db, 첫_공간, "겨울")
    await 태그를_넣는다(db, 둘째_공간, "겨울")


async def test_같은_태그를_같은_대상에_두_번_붙일_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    tag = await 태그를_넣는다(db, space)
    대상 = uuid.uuid4()
    db.add(Tagging(tag_id=tag.id, target_type=TagScope.PLACE, target_id=대상))
    await db.flush()

    db.add(Tagging(tag_id=tag.id, target_type=TagScope.PLACE, target_id=대상))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_태그를_지우면_연결도_사라진다(db):
    space, _ = await 공간과_멤버_하나(db)
    tag = await 태그를_넣는다(db, space)
    db.add(Tagging(tag_id=tag.id, target_type=TagScope.PLACE, target_id=uuid.uuid4()))
    await db.flush()

    await db.execute(text("DELETE FROM tags WHERE id = :id"), {"id": tag.id})

    남은 = await db.scalar(
        select(func.count()).select_from(Tagging).where(Tagging.tag_id == tag.id)
    )
    assert 남은 == 0


async def test_공간을_지우면_태그도_사라진다(db):
    space, _ = await 공간과_멤버_하나(db)
    tag = await 태그를_넣는다(db, space)

    await db.execute(text("DELETE FROM spaces WHERE id = :id"), {"id": space.id})

    남은 = await db.scalar(select(func.count()).select_from(Tag).where(Tag.id == tag.id))
    assert 남은 == 0


# ---------------------------------------------------------------------------
# 외래키 없는 쪽
# ---------------------------------------------------------------------------


async def test_대상을_지워도_연결은_남는다(db):
    """
    이게 detach_all 이 있는 이유다. target_id 에는 외래키를 걸 수 없어서
    DB 가 치워 주지 않는다. 이 성질이 바뀌면 이 테스트가 먼저 깨진다.
    """
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    담긴_장소 = await 여행_장소를_넣는다(db, trip, await 장소를_넣는다(db))
    tag = await 태그를_넣는다(db, space)
    db.add(Tagging(tag_id=tag.id, target_type=TagScope.PLACE, target_id=담긴_장소.id))
    db.add(
        ExternalLink(
            target_type=LinkTargetType.PLACE,
            target_id=담긴_장소.id,
            provider=LinkProvider.NAVER_MAP,
            url="https://naver.me/xxxxxxx",
        )
    )
    await db.flush()

    await db.execute(text("DELETE FROM trip_places WHERE id = :id"), {"id": 담긴_장소.id})

    assert await db.scalar(
        select(func.count()).select_from(Tagging).where(Tagging.target_id == 담긴_장소.id)
    ) == 1
    assert await db.scalar(
        select(func.count()).select_from(ExternalLink).where(ExternalLink.target_id == 담긴_장소.id)
    ) == 1


async def test_detach_all이_둘_다_떼어_낸다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    담긴_장소 = await 여행_장소를_넣는다(db, trip, await 장소를_넣는다(db))
    tag = await 태그를_넣는다(db, space)
    db.add(Tagging(tag_id=tag.id, target_type=TagScope.PLACE, target_id=담긴_장소.id))
    db.add(
        ExternalLink(
            target_type=LinkTargetType.PLACE,
            target_id=담긴_장소.id,
            provider=LinkProvider.NAVER_MAP,
            url="https://naver.me/xxxxxxx",
        )
    )
    await db.flush()

    await detach_all(
        db, tag_scope=TagScope.PLACE, link_target=LinkTargetType.PLACE, target_id=담긴_장소.id
    )
    await db.flush()

    assert await db.scalar(
        select(func.count()).select_from(Tagging).where(Tagging.target_id == 담긴_장소.id)
    ) == 0
    assert await db.scalar(
        select(func.count()).select_from(ExternalLink).where(ExternalLink.target_id == 담긴_장소.id)
    ) == 0


async def test_detach_all은_다른_대상을_건드리지_않는다(db):
    space, _ = await 공간과_멤버_하나(db)
    tag = await 태그를_넣는다(db, space)
    지울_것 = uuid.uuid4()
    남길_것 = uuid.uuid4()
    db.add(Tagging(tag_id=tag.id, target_type=TagScope.PLACE, target_id=지울_것))
    db.add(Tagging(tag_id=tag.id, target_type=TagScope.PLACE, target_id=남길_것))
    await db.flush()

    await detach_all(db, tag_scope=TagScope.PLACE, target_id=지울_것)
    await db.flush()

    남은 = (await db.execute(select(Tagging.target_id).where(Tagging.tag_id == tag.id))).scalars().all()
    assert 남은 == [남길_것]


async def test_같은_ID라도_쓰임이_다르면_남는다(db):
    """
    장소 태그를 떼면서 준비물 태그까지 떼면 안 된다. UUID 가 겹칠 일은
    거의 없지만 조건이 빠져 있으면 언젠가 겹친다.
    """
    space, _ = await 공간과_멤버_하나(db)
    장소_태그 = await 태그를_넣는다(db, space, "겨울", TagScope.PLACE)
    준비물_태그 = await 태그를_넣는다(db, space, "겨울", TagScope.PACKING)
    같은_id = uuid.uuid4()
    db.add(Tagging(tag_id=장소_태그.id, target_type=TagScope.PLACE, target_id=같은_id))
    db.add(Tagging(tag_id=준비물_태그.id, target_type=TagScope.PACKING, target_id=같은_id))
    await db.flush()

    await detach_all(db, tag_scope=TagScope.PLACE, target_id=같은_id)
    await db.flush()

    남은 = (await db.execute(select(Tagging.target_type).where(Tagging.target_id == 같은_id))).scalars().all()
    assert 남은 == [TagScope.PACKING]
