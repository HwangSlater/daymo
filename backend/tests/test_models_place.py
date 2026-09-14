from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import Place, PlaceProvider, TripPlace, TripPlaceStatus
from tests.factories import (
    공간과_멤버_하나,
    여행_장소를_넣는다,
    여행을_넣는다,
    장소를_넣는다,
)

pytestmark = pytest.mark.anyio


async def test_같은_제공자의_같은_장소는_한_번만_들어간다(db):
    await 장소를_넣는다(db, 제공자=PlaceProvider.NAVER, 제공자_장소_id="1234")

    db.add(Place(name="다른 이름", provider=PlaceProvider.NAVER, provider_place_id="1234"))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_손으로_적은_장소는_이름이_같아도_된다(db):
    """
    제공자 ID 가 없으면 같은 이름의 다른 곳일 수 있다. 막으면 진짜로 다른
    두 곳을 하나로 합쳐 버린다.
    """
    await 장소를_넣는다(db, 이름="달빛한옥")
    await 장소를_넣는다(db, 이름="달빛한옥")

    수 = await db.scalar(select(func.count()).select_from(Place).where(Place.name == "달빛한옥"))
    assert 수 == 2


async def test_다른_제공자면_같은_ID여도_된다(db):
    await 장소를_넣는다(db, 제공자=PlaceProvider.NAVER, 제공자_장소_id="1234")
    await 장소를_넣는다(db, 제공자=PlaceProvider.KAKAO, 제공자_장소_id="1234")


@pytest.mark.parametrize(
    ("위도", "경도"),
    [
        (Decimal("91"), Decimal("127")),
        (Decimal("-91"), Decimal("127")),
        (Decimal("37"), Decimal("181")),
        (Decimal("37"), Decimal("-181")),
    ],
)
async def test_지구_밖_좌표는_막는다(db, 위도, 경도):
    db.add(Place(name="어딘가", latitude=위도, longitude=경도))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_좌표는_둘_다_있거나_둘_다_없다(db):
    """
    하나만 있으면 지도에 찍을 수 없는데 값이 있는 것처럼 보여서 더 나쁘다.
    """
    db.add(Place(name="반쪽", latitude=Decimal("37.5")))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_좌표가_아예_없어도_된다(db):
    """주소만 있고 좌표를 못 얻는 장소가 있다."""
    place = await 장소를_넣는다(db, 이름="주소만")

    assert place.latitude is None and place.longitude is None


async def test_좌표의_소수점이_살아_있다(db):
    """소수 여섯 자리면 약 10cm다. 정수로 깎이면 엉뚱한 곳을 가리킨다."""
    place = Place(name="정확한 곳", latitude=Decimal("33.489011"), longitude=Decimal("126.498302"))
    db.add(place)
    await db.flush()
    await db.refresh(place)

    assert place.latitude == Decimal("33.489011")
    assert place.longitude == Decimal("126.498302")


# ---------------------------------------------------------------------------
# 여행 안의 장소
# ---------------------------------------------------------------------------


async def test_한_여행에_같은_장소를_두_번_담을_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    place = await 장소를_넣는다(db)
    await 여행_장소를_넣는다(db, trip, place)

    db.add(TripPlace(trip_id=trip.id, place_id=place.id))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_다른_여행이면_같은_장소를_담을_수_있다(db):
    space, _ = await 공간과_멤버_하나(db)
    첫_여행 = await 여행을_넣는다(db, space, 제목="작년")
    올해_여행 = await 여행을_넣는다(db, space, 제목="올해")
    place = await 장소를_넣는다(db)

    await 여행_장소를_넣는다(db, 첫_여행, place, category="숙소")
    await 여행_장소를_넣는다(db, 올해_여행, place, category="구경")

    분류들 = (await db.execute(select(TripPlace.category).where(TripPlace.place_id == place.id))).scalars().all()
    assert sorted(분류들) == ["구경", "숙소"]


async def test_분류는_자유_문구다(db):
    """
    네이버가 주는 분류를 그대로 받는다. 우리가 고른 목록만 허용하면
    가져온 장소가 분류 없이 들어온다.
    """
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    place = await 장소를_넣는다(db)

    담긴_장소 = await 여행_장소를_넣는다(db, trip, place, category="한식>해물,생선요리")

    assert 담긴_장소.category == "한식>해물,생선요리"


async def test_여행_장소의_기본_상태는_저장이다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    place = await 장소를_넣는다(db)

    담긴_장소 = await 여행_장소를_넣는다(db, trip, place)
    await db.refresh(담긴_장소)

    assert 담긴_장소.status is TripPlaceStatus.SAVED


async def test_여행을_지우면_담긴_장소는_풀리고_장소_자체는_남는다(db):
    """
    장소 실체는 여러 여행이 함께 쓴다. 여행 하나를 지웠다고 사라지면
    다른 여행의 장소가 함께 없어진다.
    """
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    place = await 장소를_넣는다(db)
    await 여행_장소를_넣는다(db, trip, place)

    await db.execute(text("DELETE FROM trips WHERE id = :id"), {"id": trip.id})

    담긴_것 = await db.scalar(
        select(func.count()).select_from(TripPlace).where(TripPlace.trip_id == trip.id)
    )
    남은_장소 = await db.scalar(select(func.count()).select_from(Place).where(Place.id == place.id))
    assert (담긴_것, 남은_장소) == (0, 1)


async def test_여행에_담긴_장소는_지울_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    place = await 장소를_넣는다(db)
    await 여행_장소를_넣는다(db, trip, place)

    with pytest.raises(IntegrityError):
        await db.execute(text("DELETE FROM places WHERE id = :id"), {"id": place.id})
