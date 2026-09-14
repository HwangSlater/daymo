import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import (
    ExternalLink,
    LinkProvider,
    LinkTargetType,
    Membership,
    RelationshipProfile,
    Space,
    Tag,
    TagScope,
    Tagging,
    Trip,
    TripParticipant,
    TripPlace,
)
from app.services.space_purge import purge_space
from tests.factories import (
    공간과_멤버_하나,
    여행_장소를_넣는다,
    여행을_넣는다,
    장소를_넣는다,
    참가자를_넣는다,
)

pytestmark = pytest.mark.anyio


async def 공간_하나에_여행과_참가자까지(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    await 참가자를_넣는다(db, trip, membership)
    db.add(RelationshipProfile(space_id=space.id))
    await db.flush()
    return space


async def test_참가자가_있으면_공간을_그냥_지울_수_없다(db):
    """
    이게 purge_space 가 있는 이유다. 공간 → 멤버 CASCADE 가 참가자의
    RESTRICT 에 막힌다. 제약을 나중에 손댈 때 이 테스트가 먼저 깨져야 한다.
    """
    space = await 공간_하나에_여행과_참가자까지(db)

    with pytest.raises(IntegrityError):
        await db.execute(text("DELETE FROM spaces WHERE id = :id"), {"id": space.id})


async def test_purge_space는_순서를_지켜_전부_지운다(db):
    space = await 공간_하나에_여행과_참가자까지(db)

    await purge_space(db, space.id)
    await db.flush()

    async def 남은(model, 조건):
        return await db.scalar(select(func.count()).select_from(model).where(조건))

    assert await 남은(Space, Space.id == space.id) == 0
    assert await 남은(Membership, Membership.space_id == space.id) == 0
    assert await 남은(Trip, Trip.space_id == space.id) == 0
    assert await 남은(RelationshipProfile, RelationshipProfile.space_id == space.id) == 0


async def test_참가자_줄도_남지_않는다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    await 참가자를_넣는다(db, trip, membership)

    await purge_space(db, space.id)
    await db.flush()

    남은 = await db.scalar(
        select(func.count()).select_from(TripParticipant).where(TripParticipant.trip_id == trip.id)
    )
    assert 남은 == 0


async def test_다른_공간은_건드리지_않는다(db):
    지울_공간 = await 공간_하나에_여행과_참가자까지(db)
    남길_공간 = await 공간_하나에_여행과_참가자까지(db)

    await purge_space(db, 지울_공간.id)
    await db.flush()

    assert await db.scalar(
        select(func.count()).select_from(Space).where(Space.id == 남길_공간.id)
    ) == 1
    assert await db.scalar(
        select(func.count()).select_from(Trip).where(Trip.space_id == 남길_공간.id)
    ) == 1


async def test_없는_공간을_지워도_터지지_않는다(db):
    import uuid

    await purge_space(db, uuid.uuid4())
    await db.flush()


async def test_외래키가_없는_줄도_남지_않는다(db):
    """
    external_links 에는 외래키가 아예 없다. purge_space 가 손으로 지우지
    않으면 공간을 없앤 뒤에도 이 줄이 영영 남고, 나중에 같은 UUID 가 다시
    쓰이면 남의 링크가 붙어 보인다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    담긴_장소 = await 여행_장소를_넣는다(db, trip, await 장소를_넣는다(db))
    await 참가자를_넣는다(db, trip, membership)

    tag = Tag(space_id=space.id, scope=TagScope.PLACE, name="겨울")
    db.add(tag)
    await db.flush()
    db.add(Tagging(tag_id=tag.id, target_type=TagScope.PLACE, target_id=담긴_장소.id))
    db.add(
        ExternalLink(
            target_type=LinkTargetType.PLACE,
            target_id=담긴_장소.id,
            provider=LinkProvider.NAVER_MAP,
            url="https://naver.me/xxxxxxx",
        )
    )
    db.add(
        ExternalLink(
            target_type=LinkTargetType.TRIP,
            target_id=trip.id,
            provider=LinkProvider.OTHER,
            url="https://example.test/여행",
        )
    )
    await db.flush()

    await purge_space(db, space.id)
    await db.flush()

    async def 남은(model, 조건):
        return await db.scalar(select(func.count()).select_from(model).where(조건))

    assert await 남은(TripPlace, TripPlace.trip_id == trip.id) == 0
    assert await 남은(Tag, Tag.space_id == space.id) == 0
    assert await 남은(Tagging, Tagging.target_id == 담긴_장소.id) == 0
    assert await 남은(ExternalLink, ExternalLink.target_id == 담긴_장소.id) == 0
    assert await 남은(ExternalLink, ExternalLink.target_id == trip.id) == 0


async def test_다른_공간의_링크는_지우지_않는다(db):
    남길_공간, _ = await 공간과_멤버_하나(db)
    남길_여행 = await 여행을_넣는다(db, 남길_공간)
    db.add(
        ExternalLink(
            target_type=LinkTargetType.TRIP,
            target_id=남길_여행.id,
            provider=LinkProvider.OTHER,
            url="https://example.test/남길것",
        )
    )
    지울_공간 = await 공간_하나에_여행과_참가자까지(db)
    await db.flush()

    await purge_space(db, 지울_공간.id)
    await db.flush()

    assert await db.scalar(
        select(func.count()).select_from(ExternalLink).where(ExternalLink.target_id == 남길_여행.id)
    ) == 1
