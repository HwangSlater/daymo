from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import (
    AuditLog,
    Diary,
    Memo,
    Photo,
    PhotoLink,
    PhotoStatus,
    PhotoTargetType,
    Trip,
)
from app.services.links import detach_all
from tests.factories import (
    공간과_멤버_하나,
    여행_장소를_넣는다,
    여행을_넣는다,
    장소를_넣는다,
)

pytestmark = pytest.mark.anyio


async def 사진을_넣는다(db, trip, membership=None, **값) -> Photo:
    photo = Photo(
        trip_id=trip.id,
        uploader_membership_id=membership.id if membership else None,
        status=PhotoStatus.READY,
        **값,
    )
    db.add(photo)
    await db.flush()
    return photo


# ---------------------------------------------------------------------------
# 메모와 일기
# ---------------------------------------------------------------------------


async def test_작성자를_잃어도_글은_남는다(db):
    """
    계정을 최종 삭제하면 공동 기록은 남기되 작성자 연결만 끊는다. 화면에는
    `탈퇴한 멤버` 로 보여 준다. 정산 쪽이 RESTRICT 인 것과 일부러 다르다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    memo = Memo(trip_id=trip.id, author_membership_id=membership.id, body="주차는 뒤쪽이 편해요")
    db.add(memo)
    await db.flush()

    await db.execute(text("DELETE FROM memberships WHERE id = :id"), {"id": membership.id})
    await db.refresh(memo)

    assert memo.author_membership_id is None
    assert memo.body == "주차는 뒤쪽이 편해요"


async def test_지운_메모도_누가_언제_지웠는지_남는다(db):
    """함께 쓰는 공간이라 말이 갈리지 않으려면 남아야 한다."""
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    memo = Memo(trip_id=trip.id, author_membership_id=membership.id, body="지울 것")
    db.add(memo)
    await db.flush()

    memo.deleted_at = datetime.now(UTC)
    memo.deleted_by = membership.id
    await db.flush()
    await db.refresh(memo)

    assert memo.body == "지울 것"
    assert memo.deleted_by == membership.id


async def test_지우지_않았는데_지운_사람만_있을_수_없다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(Memo(trip_id=trip.id, body="쪽지", deleted_by=membership.id))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_일기의_날짜는_쓴_날이_아니라_다루는_날이다(db):
    """여행이 끝나고 한참 뒤에 쓴 일기도 그날 자리에 놓여야 한다."""
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    diary = Diary(
        trip_id=trip.id,
        author_membership_id=membership.id,
        body="비가 왔지만 좋았다",
        written_on=date(2026, 10, 1),
    )
    db.add(diary)
    await db.flush()
    await db.refresh(diary)

    assert diary.written_on == date(2026, 10, 1)
    assert diary.created_at.date() != date(2026, 10, 1)


# ---------------------------------------------------------------------------
# 사진
# ---------------------------------------------------------------------------


async def test_올라오는_중에는_경로가_없다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    photo = Photo(trip_id=trip.id, uploader_membership_id=membership.id)
    db.add(photo)
    await db.flush()
    await db.refresh(photo)

    assert photo.status is PhotoStatus.UPLOADING
    assert photo.original_path is None


async def test_같은_사진을_다른_여행에_올릴_수_있다(db):
    """checksum 이 같다고 막으면 안 된다. 잘못이 아니다."""
    space, membership = await 공간과_멤버_하나(db)
    첫_여행 = await 여행을_넣는다(db, space, 제목="작년")
    올해_여행 = await 여행을_넣는다(db, space, 제목="올해")
    같은_해시 = "a" * 64

    await 사진을_넣는다(db, 첫_여행, membership, checksum=같은_해시)
    await 사진을_넣는다(db, 올해_여행, membership, checksum=같은_해시)

    수 = await db.scalar(
        select(func.count()).select_from(Photo).where(Photo.checksum == 같은_해시)
    )
    assert 수 == 2


@pytest.mark.parametrize(("칼럼", "값"), [("width", 0), ("height", 0), ("original_bytes", 0)])
async def test_크기가_0인_사진은_없다(db, 칼럼, 값):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(Photo(trip_id=trip.id, uploader_membership_id=membership.id, **{칼럼: 값}))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_올린_사람을_잃어도_사진은_남는다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    photo = await 사진을_넣는다(db, trip, membership, original_path="/srv/daymo/uploads/a.jpg")

    await db.execute(text("DELETE FROM memberships WHERE id = :id"), {"id": membership.id})
    await db.refresh(photo)

    assert photo.uploader_membership_id is None
    assert photo.original_path == "/srv/daymo/uploads/a.jpg"


async def test_한_사진이_여러_곳에_붙는다(db):
    """숙소 사진이 그 날의 사진이기도 한 경우가 흔하다."""
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    photo = await 사진을_넣는다(db, trip, membership)
    담긴_장소 = await 여행_장소를_넣는다(db, trip, await 장소를_넣는다(db))

    db.add(PhotoLink(photo_id=photo.id, target_type=PhotoTargetType.TRIP, target_id=trip.id))
    db.add(
        PhotoLink(photo_id=photo.id, target_type=PhotoTargetType.PLACE, target_id=담긴_장소.id)
    )
    await db.flush()

    수 = await db.scalar(
        select(func.count()).select_from(PhotoLink).where(PhotoLink.photo_id == photo.id)
    )
    assert 수 == 2


async def test_같은_곳에_두_번_붙일_수_없다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    photo = await 사진을_넣는다(db, trip, membership)
    db.add(PhotoLink(photo_id=photo.id, target_type=PhotoTargetType.TRIP, target_id=trip.id))
    await db.flush()

    db.add(PhotoLink(photo_id=photo.id, target_type=PhotoTargetType.TRIP, target_id=trip.id))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_장소를_빼도_사진_자체는_남는다(db):
    """
    같은 사진이 다른 곳에도 붙어 있을 수 있고, 장소 하나를 뺐다고 그 사진이
    여행 앨범에서 사라지면 안 된다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    photo = await 사진을_넣는다(db, trip, membership)
    담긴_장소 = await 여행_장소를_넣는다(db, trip, await 장소를_넣는다(db))
    db.add(PhotoLink(photo_id=photo.id, target_type=PhotoTargetType.TRIP, target_id=trip.id))
    db.add(
        PhotoLink(photo_id=photo.id, target_type=PhotoTargetType.PLACE, target_id=담긴_장소.id)
    )
    await db.flush()

    await detach_all(db, photo_target=PhotoTargetType.PLACE, target_id=담긴_장소.id)
    await db.flush()

    남은 = (
        await db.execute(select(PhotoLink.target_type).where(PhotoLink.photo_id == photo.id))
    ).scalars().all()
    assert 남은 == [PhotoTargetType.TRIP]
    assert await db.get(Photo, photo.id) is not None


async def test_대표_사진을_지워도_여행은_남는다(db):
    """대표 사진 한 장이 사라진다고 여행 전체가 사라지면 안 된다."""
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    photo = await 사진을_넣는다(db, trip, membership)
    trip.cover_photo_id = photo.id
    await db.flush()

    await db.execute(text("DELETE FROM photos WHERE id = :id"), {"id": photo.id})
    await db.refresh(trip)

    assert trip.cover_photo_id is None
    assert await db.get(Trip, trip.id) is not None


# ---------------------------------------------------------------------------
# 감사 기록
# ---------------------------------------------------------------------------


async def test_공간을_지워도_감사_기록은_남는다(db):
    """
    공간을 지우면 감사 기록까지 사라지면, 공간을 지우는 것으로 흔적을 지울
    수 있게 된다.
    """
    space, membership = await 공간과_멤버_하나(db)
    로그 = AuditLog(
        space_id=space.id,
        actor_membership_id=membership.id,
        action="space.rename",
        log_metadata={"from": "이전 이름", "to": "새 이름"},
    )
    db.add(로그)
    await db.flush()

    await db.execute(text("DELETE FROM memberships WHERE space_id = :id"), {"id": space.id})
    await db.execute(text("DELETE FROM spaces WHERE id = :id"), {"id": space.id})
    await db.refresh(로그)

    assert 로그.space_id is None
    assert 로그.actor_membership_id is None
    assert 로그.action == "space.rename"
    assert 로그.log_metadata == {"from": "이전 이름", "to": "새 이름"}


async def test_감사_기록에는_수정_시각이_없다(db):
    """고쳐지지 않는 기록이라, 있으면 고쳐도 되는 것처럼 읽힌다."""
    assert not hasattr(AuditLog, "updated_at")
    assert hasattr(AuditLog, "created_at")
