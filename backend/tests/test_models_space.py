import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models import Membership, MembershipRole, RelationshipProfile, User
from tests.factories import 공간을_넣는다, 사람을_넣는다

pytestmark = pytest.mark.anyio


async def test_공간과_멤버를_만들_수_있다(db):
    owner = await 사람을_넣는다(db)
    space = await 공간을_넣는다(db, owner)
    db.add(Membership(space_id=space.id, user_id=owner.id, role=MembershipRole.OWNER))
    await db.flush()

    멤버들 = (await db.execute(select(Membership).where(Membership.space_id == space.id))).scalars().all()

    assert len(멤버들) == 1
    assert 멤버들[0].role is MembershipRole.OWNER
    # 기본값은 DB 가 채운다.
    assert 멤버들[0].joined_at is not None


async def test_같은_사람이_같은_공간에_두_번_들어올_수_없다(db):
    owner = await 사람을_넣는다(db)
    space = await 공간을_넣는다(db, owner)
    db.add(Membership(space_id=space.id, user_id=owner.id, role=MembershipRole.OWNER))
    await db.flush()

    db.add(Membership(space_id=space.id, user_id=owner.id, role=MembershipRole.EDITOR))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_나갔던_사람은_다시_들어올_수_있다(db):
    """
    부분 유니크 인덱스라 left_at 이 찬 행은 막지 않는다. 일반 UNIQUE 였다면
    한 번 나간 사람이 영영 못 돌아온다.
    """
    owner = await 사람을_넣는다(db)
    space = await 공간을_넣는다(db, owner)
    나간_멤버 = Membership(
        space_id=space.id,
        user_id=owner.id,
        role=MembershipRole.EDITOR,
        left_at=datetime.now(UTC),
    )
    db.add(나간_멤버)
    await db.flush()

    db.add(Membership(space_id=space.id, user_id=owner.id, role=MembershipRole.EDITOR))
    await db.flush()  # 터지지 않아야 한다

    전체 = (await db.execute(select(Membership).where(Membership.space_id == space.id))).scalars().all()
    assert len(전체) == 2


async def test_같은_이메일로_두_계정을_만들_수_없다(db):
    첫번째 = await 사람을_넣는다(db)

    db.add(User(email=첫번째.email, display_name="다른사람"))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_모르는_권한_값은_DB가_막는다(db):
    """
    native enum 대신 VARCHAR + CHECK 를 쓰기로 했으므로, CHECK 가 실제로
    걸려 있는지 확인한다. 없으면 아무 문자열이나 들어간다.
    """
    owner = await 사람을_넣는다(db)
    space = await 공간을_넣는다(db, owner)

    with pytest.raises(DBAPIError):
        await db.execute(
            text(
                "INSERT INTO memberships (id, space_id, user_id, role)"
                " VALUES (:id, :space_id, :user_id, '사장님')"
            ),
            {"id": uuid.uuid4(), "space_id": space.id, "user_id": owner.id},
        )


async def test_공간을_지우면_멤버도_함께_사라진다(db):
    owner = await 사람을_넣는다(db)
    space = await 공간을_넣는다(db, owner)
    db.add(Membership(space_id=space.id, user_id=owner.id, role=MembershipRole.OWNER))
    db.add(RelationshipProfile(space_id=space.id))
    await db.flush()

    await db.delete(space)
    await db.flush()

    남은_멤버 = (await db.execute(select(Membership).where(Membership.space_id == space.id))).scalars().all()
    남은_프로필 = (
        await db.execute(select(RelationshipProfile).where(RelationshipProfile.space_id == space.id))
    ).scalars().all()
    assert 남은_멤버 == []
    assert 남은_프로필 == []


async def test_공간을_가진_사람은_지울_수_없다(db):
    """
    RESTRICT 다. 계정을 지우기 전에 owner 를 넘기거나 공간을 먼저 정리해야
    한다. 조용히 사라지면 공간이 주인 없는 상태가 된다.
    """
    owner = await 사람을_넣는다(db)
    await 공간을_넣는다(db, owner)

    await db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    with pytest.raises(IntegrityError):
        await db.execute(text("DELETE FROM users WHERE id = :id"), {"id": owner.id})


async def test_한_공간에_관계_프로필은_하나뿐이다(db):
    owner = await 사람을_넣는다(db)
    space = await 공간을_넣는다(db, owner)
    db.add(RelationshipProfile(space_id=space.id))
    await db.flush()

    db.add(RelationshipProfile(space_id=space.id))
    with pytest.raises(IntegrityError):
        await db.flush()
