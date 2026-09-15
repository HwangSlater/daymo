import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.models import Membership, MembershipRole, Transport
from tests.test_api_places import 멤버로_넣는다, 여행_하나
from tests.test_api_trips import 로그인한_사람

pytestmark = pytest.mark.anyio

# tests.test_api_trips 의 여행은 2026-10-01 ~ 2026-10-03 이다.


async def 교통편을_넣는다(api, headers, trip_id, **값):
    본문 = {
        "direction": "outbound",
        "method": "ktx",
        "date": "2026-10-01",
        "departureName": "서울역",
        "departureTime": "08:00",
        "arrivalName": "전주역",
        "arrivalTime": "09:50",
        "bookingStatus": "booked",
        "showInSchedule": True,
        **값,
    }
    응답 = await api.post(f"/v1/trips/{trip_id}/transports", json=본문, headers=headers)
    assert 응답.status_code in (200, 201), 응답.text
    return 응답


async def 내_membership(db, space_id):
    return str(await db.scalar(select(Membership.id).where(Membership.space_id == uuid.UUID(space_id))))


# ---------------------------------------------------------------------------
# 교통편
# ---------------------------------------------------------------------------


async def test_교통편은_날짜와_시각을_공간_시간대로_주고받는다(api, db):
    headers, space_id, trip = await 여행_하나(api)

    응답 = await 교통편을_넣는다(api, headers, trip["id"], ownerMembershipId=await 내_membership(db, space_id))

    편 = 응답.json()["data"]
    assert (편["date"], 편["departureTime"], 편["arrivalTime"], 편["method"]) == ("2026-10-01", "08:00", "09:50", "ktx")
    저장된 = await db.get(Transport, uuid.UUID(편["id"]))
    assert 저장된.departure_at.astimezone(UTC) == datetime(2026, 9, 30, 23, 0, tzinfo=UTC)


async def test_시각을_모르는_교통편도_날짜는_남는다(api, db):
    headers, _, trip = await 여행_하나(api)

    편 = (await 교통편을_넣는다(api, headers, trip["id"], departureTime=None, arrivalTime=None)).json()["data"]

    assert (편["date"], 편["departureTime"], 편["arrivalTime"]) == ("2026-10-01", None, None)


async def test_자정을_넘겨_도착하면_다음_날_도착으로_본다(api, db):
    headers, _, trip = await 여행_하나(api)

    편 = (await 교통편을_넣는다(api, headers, trip["id"], departureTime="23:30", arrivalTime="01:10")).json()["data"]

    저장된 = await db.get(Transport, uuid.UUID(편["id"]))
    assert (저장된.arrival_at - 저장된.departure_at).total_seconds() == 100 * 60
    assert 편["arrivalTime"] == "01:10"


async def test_다른_공간_사람은_탈_사람으로_정할_수_없다(api, db):
    headers, _, trip = await 여행_하나(api)
    남_headers = await 로그인한_사람(api, "stranger@example.com", "낯선이")
    남의_공간 = (await api.post("/v1/spaces", json={"name": "남의 공간"}, headers=남_headers)).json()["data"]["id"]

    응답 = await api.post(
        f"/v1/trips/{trip['id']}/transports",
        json={"direction": "return", "ownerMembershipId": await 내_membership(db, 남의_공간)},
        headers=headers,
    )

    assert 응답.status_code == 422


async def test_여행_기간_밖_날짜는_거부한다(api, db):
    headers, _, trip = await 여행_하나(api)

    응답 = await api.post(f"/v1/trips/{trip['id']}/transports", json={"direction": "return", "date": "2026-10-09"}, headers=headers)

    assert 응답.status_code == 422


async def test_교통편을_고치고_버전이_어긋나면_409_지우면_사라진다(api, db):
    headers, _, trip = await 여행_하나(api)
    편 = (await 교통편을_넣는다(api, headers, trip["id"])).json()["data"]

    고침 = await api.patch(f"/v1/transports/{편['id']}", json={"version": 1, "departureTime": "10:00", "bookingStatus": "not_booked"}, headers=headers)
    낡음 = await api.patch(f"/v1/transports/{편['id']}", json={"version": 1, "method": "bus"}, headers=headers)
    지움 = await api.delete(f"/v1/transports/{편['id']}", headers=headers)

    assert (고침.json()["data"]["departureTime"], 고침.json()["data"]["arrivalTime"], 고침.json()["data"]["version"]) == ("10:00", "09:50", 2)
    assert 낡음.status_code == 409
    assert 지움.status_code == 204
    assert (await api.get(f"/v1/trips/{trip['id']}/transports", headers=headers)).json()["data"] == []


async def test_보기만_하는_멤버는_교통편을_넣을_수_없다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    viewer = await 멤버로_넣는다(api, db, space_id, "viewer@example.com", MembershipRole.VIEWER)

    응답 = await api.post(f"/v1/trips/{trip['id']}/transports", json={"direction": "outbound"}, headers=viewer)

    assert 응답.status_code == 403


# ---------------------------------------------------------------------------
# 예약
# ---------------------------------------------------------------------------


async def test_예약은_인원_글자를_그대로_남긴다(api, db):
    headers, _, trip = await 여행_하나(api)

    응답 = await api.post(
        f"/v1/trips/{trip['id']}/reservations",
        json={"title": "소나기식당", "date": "2026-10-02", "time": "19:00", "partySize": 2, "partyLabel": "2명 + 아이", "status": "confirmed", "note": "전주 완산구", "showInSchedule": True},
        headers=headers,
    )

    예약 = 응답.json()["data"]
    assert 응답.status_code == 201
    assert (예약["date"], 예약["time"], 예약["partySize"], 예약["partyLabel"], 예약["note"]) == ("2026-10-02", "19:00", 2, "2명 + 아이", "전주 완산구")


async def test_예약_시각을_지우면_날짜만_남고_버전이_오른다(api, db):
    headers, _, trip = await 여행_하나(api)
    예약 = (await api.post(f"/v1/trips/{trip['id']}/reservations", json={"title": "x", "date": "2026-10-02", "time": "19:00"}, headers=headers)).json()["data"]

    응답 = await api.patch(f"/v1/reservations/{예약['id']}", json={"version": 1, "time": None}, headers=headers)

    assert (응답.json()["data"]["date"], 응답.json()["data"]["time"], 응답.json()["data"]["version"]) == ("2026-10-02", None, 2)


async def test_예약_링크는_http만_받고_남의_예약은_404다(api, db):
    headers, _, trip = await 여행_하나(api)
    위험 = await api.post(f"/v1/trips/{trip['id']}/reservations", json={"title": "x", "bookingUrl": "javascript:alert(1)"}, headers=headers)
    예약 = (await api.post(f"/v1/trips/{trip['id']}/reservations", json={"title": "x"}, headers=headers)).json()["data"]
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")

    assert 위험.status_code == 422
    assert (await api.delete(f"/v1/reservations/{예약['id']}", headers=남)).status_code == 404
