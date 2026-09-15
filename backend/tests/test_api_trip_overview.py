"""
여행 목록의 요약(`overview`).

홈의 여행 카드가 이 숫자를 쓴다. 상세 화면을 이 기기에서 열지 않았어도, 다른 멤버가
채운 여행이어도 맞게 나와야 한다.
"""

import pytest

from app.models import MembershipRole
from tests.test_api_bookings import 교통편을_넣는다
from tests.test_api_expenses import membership_of, 지출을_넣는다
from tests.test_api_places import 멤버로_넣는다, 여행_하나, 장소를_담는다
from tests.test_api_schedule import 일정을_넣는다
from tests.test_api_trips import 여행을_만든다

pytestmark = pytest.mark.anyio

# tests.test_api_trips 의 여행은 2026-10-01 ~ 2026-10-03 이다.


async def 채운_여행(api, db):
    headers, space_id, trip = await 여행_하나(api)
    trip_id = trip["id"]
    한옥 = (await 장소를_담는다(api, headers, trip_id)).json()["data"]
    식당 = (await 장소를_담는다(api, headers, trip_id, name="소나기식당", category="식당")).json()["data"]
    await 장소를_담는다(api, headers, trip_id, name="느린카페", category="카페")
    await 장소를_담는다(api, headers, trip_id, name="바다카페", category="카페")

    # 체크인이 빠른 숙소가 대표 숙소다. 늦게 넣었어도 먼저 온다.
    await api.post(f"/v1/trips/{trip_id}/stays", json={"checkInAt": "2026-10-02T16:00"}, headers=headers)
    await api.post(
        f"/v1/trips/{trip_id}/stays",
        json={"tripPlaceId": 한옥["id"], "checkInAt": "2026-10-01T15:00", "checkOutAt": "2026-10-02T11:00"},
        headers=headers,
    )

    await 일정을_넣는다(api, headers, trip_id)
    await 일정을_넣는다(api, headers, trip_id, title="한옥마을 산책", time=None)
    await 교통편을_넣는다(api, headers, trip_id)
    await 교통편을_넣는다(api, headers, trip_id, direction="return", date="2026-10-03", showInSchedule=False)
    await api.post(
        f"/v1/trips/{trip_id}/reservations",
        json={"title": "소나기식당", "date": "2026-10-02", "time": "19:00", "showInSchedule": True},
        headers=headers,
    )

    for 이름, 챙김 in (("보조배터리", True), ("선크림", False), ("우산", False)):
        응답 = await api.post(f"/v1/trips/{trip_id}/checklist-items", json={"name": 이름, "completed": 챙김}, headers=headers)
        assert 응답.status_code == 201, 응답.text

    나 = await membership_of(db, space_id, "sky@example.com")
    await 지출을_넣는다(api, headers, trip_id, 나)
    await 지출을_넣는다(api, headers, trip_id, 나, title="카페", amount=12000.5)
    return headers, space_id, trip, 식당


async def test_목록의_여행마다_홈이_보여_줄_요약이_붙는다(api, db):
    headers, space_id, trip, _ = await 채운_여행(api, db)
    빈_여행 = await 여행을_만든다(api, headers, space_id, title="겨울 강릉", startDate="2026-12-01", endDate="2026-12-02")

    목록 = (await api.get(f"/v1/spaces/{space_id}/trips", headers=headers)).json()["data"]
    요약 = {item["id"]: item["overview"] for item in 목록}

    assert 요약[trip["id"]] == {
        "stay": {"name": "달빛한옥", "checkInAt": "2026-10-01T15:00"},
        # 일정 2 + 일정에 표시한 교통편 1 + 예약 1 + 대표 숙소 체크인 1
        "scheduleCount": 5,
        "placeCount": 4,
        "restaurantCount": 1,
        "cafeCount": 2,
        "packingTotal": 3,
        "packingDone": 1,
        "spentTotal": 60000.5,
    }
    assert 요약[빈_여행["id"]] == {
        "stay": None,
        "scheduleCount": 0,
        "placeCount": 0,
        "restaurantCount": 0,
        "cafeCount": 0,
        "packingTotal": 0,
        "packingDone": 0,
        "spentTotal": 0,
    }


async def test_여행_하나를_받아도_같은_요약이고_지운_것은_빠진다(api, db):
    headers, space_id, trip, 식당 = await 채운_여행(api, db)

    목록 = (await api.get(f"/v1/spaces/{space_id}/trips", headers=headers)).json()["data"]
    하나 = (await api.get(f"/v1/trips/{trip['id']}", headers=headers)).json()["data"]
    assert 하나["overview"] == 목록[0]["overview"]

    assert (await api.delete(f"/v1/trip-places/{식당['id']}", headers=headers)).status_code == 204
    db.expire_all()
    뒤 = (await api.get(f"/v1/trips/{trip['id']}", headers=headers)).json()["data"]["overview"]

    assert (뒤["placeCount"], 뒤["restaurantCount"], 뒤["cafeCount"]) == (3, 0, 2)


async def test_다른_멤버가_채운_여행도_요약이_보인다(api, db):
    _, space_id, trip, _ = await 채운_여행(api, db)
    보기만 = await 멤버로_넣는다(api, db, space_id, "viewer@example.com", MembershipRole.VIEWER)

    목록 = (await api.get(f"/v1/spaces/{space_id}/trips", headers=보기만)).json()["data"]

    assert 목록[0]["id"] == trip["id"]
    assert (목록[0]["overview"]["stay"]["name"], 목록[0]["overview"]["packingDone"]) == ("달빛한옥", 1)
