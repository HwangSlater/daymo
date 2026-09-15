import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models import (
    ExternalLink,
    Membership,
    MembershipRole,
    Place,
    ScheduleItem,
    Tag,
    Tagging,
    Trip,
    TripPlace,
    User,
)
from app.services.places import purge_orphan_manual_places
from app.services.trips import purge_deleted_trips
from tests.test_api_trips import 공간을_만든다, 로그인한_사람, 여행을_만든다

pytestmark = pytest.mark.anyio


async def 여행_하나(api, email="sky@example.com"):
    headers = await 로그인한_사람(api, email)
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    return headers, space_id, trip


async def 장소를_담는다(api, headers, trip_id, **값):
    본문 = {"name": "달빛한옥", "area": "전북", "category": "숙소", **값}
    응답 = await api.post(f"/v1/trips/{trip_id}/places", json=본문, headers=headers)
    assert 응답.status_code in (200, 201), 응답.text
    return 응답


async def 멤버로_넣는다(api, db, space_id, email, role):
    headers = await 로그인한_사람(api, email, "다온")
    user_id = await db.scalar(select(User.id).where(User.email == email))
    db.add(Membership(space_id=space_id, user_id=user_id, role=role))
    await db.flush()
    return headers


# ---------------------------------------------------------------------------
# 담기와 조회
# ---------------------------------------------------------------------------


async def test_장소를_담으면_목록에_태그와_링크까지_보인다(api, db):
    headers, _, trip = await 여행_하나(api)

    응답 = await 장소를_담는다(
        api,
        headers,
        trip["id"],
        address="전주 완산구 은행로 12",
        tags=["숙소 근처", "  예약  ", "숙소 근처"],
        mapUrl="https://map.naver.com/p/search/달빛한옥",
    )

    assert 응답.status_code == 201
    목록 = (await api.get(f"/v1/trips/{trip['id']}/places", headers=headers)).json()["data"]
    assert len(목록) == 1
    장소 = 목록[0]
    assert 장소["name"] == "달빛한옥" and 장소["address"] == "전주 완산구 은행로 12"
    assert 장소["tags"] == ["숙소 근처", "예약"]
    assert 장소["mapUrl"] == "https://map.naver.com/p/search/달빛한옥"
    assert 장소["status"] == "saved" and 장소["version"] == 1
    링크 = await db.scalar(select(ExternalLink).where(ExternalLink.target_id == uuid.UUID(장소["id"])))
    assert 링크.provider.value == "naver_map"


async def 앱이_만든_id(api, headers, trip_id):
    id = str(uuid.uuid4())
    return id, await 장소를_담는다(api, headers, trip_id, id=id)


async def test_앱이_만든_id를_그대로_쓰고_같은_요청을_다시_보내도_하나만_생긴다(api, db):
    headers, _, trip = await 여행_하나(api)
    id, 첫번째 = await 앱이_만든_id(api, headers, trip["id"])

    두번째 = await 장소를_담는다(api, headers, trip["id"], id=id)

    assert 첫번째.json()["data"]["id"] == id
    assert 두번째.status_code == 200 and 두번째.json()["data"]["id"] == id
    assert await db.scalar(select(func.count()).select_from(TripPlace).where(TripPlace.trip_id == trip["id"])) == 1


async def test_다른_여행의_장소_id로는_담을_수_없다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    id, _ = await 앱이_만든_id(api, headers, trip["id"])
    다른_여행 = await 여행을_만든다(api, headers, space_id, title="다른 여행")

    응답 = await api.post(
        f"/v1/trips/{다른_여행['id']}/places", json={"id": id, "name": "끌어오기"}, headers=headers
    )

    assert 응답.status_code == 422


@pytest.mark.parametrize("url", ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com/a", "map.naver.com/x"])
async def test_http가_아닌_링크는_저장하지_않는다(api, db, url):
    headers, _, trip = await 여행_하나(api)

    응답 = await api.post(
        f"/v1/trips/{trip['id']}/places", json={"name": "위험한 곳", "mapUrl": url}, headers=headers
    )

    assert 응답.status_code == 422
    assert await db.scalar(select(func.count()).select_from(TripPlace)) == 0


async def test_너무_긴_태그는_자르지_않고_거부한다(api, db):
    headers, _, trip = await 여행_하나(api)

    응답 = await api.post(
        f"/v1/trips/{trip['id']}/places", json={"name": "곳", "tags": ["가" * 21]}, headers=headers
    )

    assert 응답.status_code == 422


async def test_같은_태그_이름은_공간에서_하나로_쓴다(api, db):
    headers, space_id, trip = await 여행_하나(api)

    await 장소를_담는다(api, headers, trip["id"], name="첫째", tags=["바다"])
    await 장소를_담는다(api, headers, trip["id"], name="둘째", tags=["바다"])

    assert await db.scalar(select(func.count()).select_from(Tag).where(Tag.space_id == space_id)) == 1


# ---------------------------------------------------------------------------
# 권한
# ---------------------------------------------------------------------------


async def test_남의_여행_장소는_404다(api, db):
    headers, _, trip = await 여행_하나(api)
    장소 = (await 장소를_담는다(api, headers, trip["id"])).json()["data"]
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")

    목록 = await api.get(f"/v1/trips/{trip['id']}/places", headers=남)
    수정 = await api.patch(f"/v1/trip-places/{장소['id']}", json={"version": 1, "name": "x"}, headers=남)
    삭제 = await api.delete(f"/v1/trip-places/{장소['id']}", headers=남)

    assert (목록.status_code, 수정.status_code, 삭제.status_code) == (404, 404, 404)


async def test_보기만_하는_멤버는_보기만_한다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    장소 = (await 장소를_담는다(api, headers, trip["id"])).json()["data"]
    viewer = await 멤버로_넣는다(api, db, space_id, "viewer@example.com", MembershipRole.VIEWER)

    assert (await api.get(f"/v1/trips/{trip['id']}/places", headers=viewer)).status_code == 200
    assert (await api.post(f"/v1/trips/{trip['id']}/places", json={"name": "몰래"}, headers=viewer)).status_code == 403
    assert (await api.patch(f"/v1/trip-places/{장소['id']}", json={"version": 1, "name": "x"}, headers=viewer)).status_code == 403
    assert (await api.delete(f"/v1/trip-places/{장소['id']}", headers=viewer)).status_code == 403


async def test_편집_멤버는_장소를_담을_수_있다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    editor = await 멤버로_넣는다(api, db, space_id, "editor@example.com", MembershipRole.EDITOR)

    응답 = await api.post(f"/v1/trips/{trip['id']}/places", json={"name": "함께 고른 곳"}, headers=editor)

    assert 응답.status_code == 201


# ---------------------------------------------------------------------------
# 수정과 삭제
# ---------------------------------------------------------------------------


async def test_보낸_칸만_바꾸고_버전을_올린다(api, db):
    headers, _, trip = await 여행_하나(api)
    장소 = (await 장소를_담는다(api, headers, trip["id"], tags=["예약"], mapUrl="https://map.kakao.com/x")).json()["data"]

    응답 = await api.patch(
        f"/v1/trip-places/{장소['id']}",
        json={"version": 1, "status": "scheduled", "tags": ["저녁", "예약"]},
        headers=headers,
    )

    바뀐 = 응답.json()["data"]
    assert 바뀐["status"] == "scheduled" and 바뀐["tags"] == ["예약", "저녁"]
    assert 바뀐["name"] == "달빛한옥" and 바뀐["mapUrl"] == "https://map.kakao.com/x"
    assert 바뀐["version"] == 2


async def test_낡은_버전으로_고치면_409다(api, db):
    headers, _, trip = await 여행_하나(api)
    장소 = (await 장소를_담는다(api, headers, trip["id"])).json()["data"]
    await api.patch(f"/v1/trip-places/{장소['id']}", json={"version": 1, "name": "먼저 고침"}, headers=headers)

    응답 = await api.patch(f"/v1/trip-places/{장소['id']}", json={"version": 1, "name": "늦게 고침"}, headers=headers)

    assert 응답.status_code == 409


async def test_이름을_비우거나_링크를_지울_수_있다(api, db):
    headers, _, trip = await 여행_하나(api)
    장소 = (await 장소를_담는다(api, headers, trip["id"], mapUrl="https://example.com/a")).json()["data"]

    빈_이름 = await api.patch(f"/v1/trip-places/{장소['id']}", json={"version": 1, "name": "   "}, headers=headers)
    링크_지움 = await api.patch(f"/v1/trip-places/{장소['id']}", json={"version": 1, "mapUrl": None}, headers=headers)

    assert 빈_이름.status_code == 422
    assert 링크_지움.json()["data"]["mapUrl"] is None


async def test_빼면_태그_연결과_링크와_장소_실체가_함께_사라지고_일정은_남는다(api, db):
    headers, _, trip = await 여행_하나(api)
    장소 = (await 장소를_담는다(api, headers, trip["id"], tags=["예약"], mapUrl="https://example.com/a")).json()["data"]
    trip_place = await db.get(TripPlace, uuid.UUID(장소["id"]))
    place_id = trip_place.place_id
    db.add(ScheduleItem(trip_id=trip_place.trip_id, trip_place_id=trip_place.id, title="체크인", sort_order=0))
    await db.flush()

    응답 = await api.delete(f"/v1/trip-places/{장소['id']}", headers=headers)

    assert 응답.status_code == 204
    대상 = uuid.UUID(장소["id"])
    assert await db.scalar(select(func.count()).select_from(Tagging).where(Tagging.target_id == 대상)) == 0
    assert await db.scalar(select(func.count()).select_from(ExternalLink).where(ExternalLink.target_id == 대상)) == 0
    assert await db.get(Place, place_id) is None
    일정 = await db.scalar(select(ScheduleItem).where(ScheduleItem.title == "체크인"))
    await db.refresh(일정)
    assert 일정.trip_place_id is None


# ---------------------------------------------------------------------------
# 정리 작업
# ---------------------------------------------------------------------------


async def test_기한이_지난_여행을_지우면_장소의_링크와_태그_연결도_지운다(api, db):
    headers, _, trip = await 여행_하나(api)
    장소 = (await 장소를_담는다(api, headers, trip["id"], tags=["예약"], mapUrl="https://example.com/a")).json()["data"]
    여행 = await db.get(Trip, uuid.UUID(trip["id"]))
    여행.deleted_at = datetime.now(UTC) - timedelta(days=8)
    여행.deletion_scheduled_at = datetime.now(UTC) - timedelta(days=1)
    await db.flush()

    assert await purge_deleted_trips(db) == 1

    대상 = uuid.UUID(장소["id"])
    assert await db.scalar(select(func.count()).select_from(Tagging).where(Tagging.target_id == 대상)) == 0
    assert await db.scalar(select(func.count()).select_from(ExternalLink).where(ExternalLink.target_id == 대상)) == 0
    # 여행 장소가 사라져 아무도 쓰지 않는 손 장소는 정리 작업이 치운다.
    assert await purge_orphan_manual_places(db) == 1
