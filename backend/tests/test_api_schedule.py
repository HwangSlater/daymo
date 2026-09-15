import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from app.models import ExternalLink, MembershipRole, ScheduleItem, Stay, TripDay
from tests.test_api_places import 멤버로_넣는다, 여행_하나, 장소를_담는다
from tests.test_api_trips import 로그인한_사람

pytestmark = pytest.mark.anyio

# tests.test_api_trips 의 여행은 2026-10-01 ~ 2026-10-03 이다.


async def 일정을_넣는다(api, headers, trip_id, **값):
    본문 = {"title": "소나기식당에서 점심", "date": "2026-10-02", "time": "12:30", "type": "meal", **값}
    응답 = await api.post(f"/v1/trips/{trip_id}/schedule-items", json=본문, headers=headers)
    assert 응답.status_code in (200, 201), 응답.text
    return 응답


# ---------------------------------------------------------------------------
# 일정
# ---------------------------------------------------------------------------


async def test_일정은_공간_시간대의_날짜와_시각으로_주고받는다(api, db):
    headers, _, trip = await 여행_하나(api)

    응답 = await 일정을_넣는다(api, headers, trip["id"], note="식사 · 전주", mapUrl="https://map.naver.com/x")

    일정 = 응답.json()["data"]
    assert (일정["date"], 일정["time"], 일정["type"], 일정["mapUrl"]) == ("2026-10-02", "12:30", "meal", "https://map.naver.com/x")
    저장된 = await db.get(ScheduleItem, uuid.UUID(일정["id"]))
    # 서울 12:30 은 UTC 03:30 이다.
    assert 저장된.start_at.astimezone(UTC) == datetime(2026, 10, 2, 3, 30, tzinfo=UTC)


async def test_시각을_정하지_않은_일정도_날짜는_남는다(api, db):
    headers, _, trip = await 여행_하나(api)

    일정 = (await 일정을_넣는다(api, headers, trip["id"], time=None)).json()["data"]

    assert (일정["date"], 일정["time"]) == ("2026-10-02", None)


async def test_여행_기간_밖의_날짜와_이상한_시각은_거부한다(api, db):
    headers, _, trip = await 여행_하나(api)

    밖 = await api.post(f"/v1/trips/{trip['id']}/schedule-items", json={"title": "x", "date": "2026-10-09"}, headers=headers)
    시각 = await api.post(f"/v1/trips/{trip['id']}/schedule-items", json={"title": "x", "date": "2026-10-02", "time": "25:00"}, headers=headers)

    assert (밖.status_code, 시각.status_code) == (422, 422)


async def test_다른_여행의_장소는_일정에_붙일_수_없다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    from tests.test_api_trips import 여행을_만든다

    다른_여행 = await 여행을_만든다(api, headers, space_id, title="다른 여행")
    남의_장소 = (await 장소를_담는다(api, headers, 다른_여행["id"])).json()["data"]

    응답 = await api.post(
        f"/v1/trips/{trip['id']}/schedule-items",
        json={"title": "x", "tripPlaceId": 남의_장소["id"]},
        headers=headers,
    )

    assert 응답.status_code == 422


async def test_앱이_만든_id로_다시_보내도_하나만_생긴다(api, db):
    headers, _, trip = await 여행_하나(api)
    id = str(uuid.uuid4())

    첫번째 = await 일정을_넣는다(api, headers, trip["id"], id=id)
    두번째 = await 일정을_넣는다(api, headers, trip["id"], id=id)

    assert (첫번째.status_code, 두번째.status_code) == (201, 200)
    assert await db.scalar(select(func.count()).select_from(ScheduleItem)) == 1


async def test_날짜를_바꾸면_시각은_지키고_버전이_오른다(api, db):
    headers, _, trip = await 여행_하나(api)
    일정 = (await 일정을_넣는다(api, headers, trip["id"])).json()["data"]

    응답 = await api.patch(f"/v1/schedule-items/{일정['id']}", json={"version": 1, "date": "2026-10-03"}, headers=headers)
    낡음 = await api.patch(f"/v1/schedule-items/{일정['id']}", json={"version": 1, "title": "늦게"}, headers=headers)

    바뀐 = 응답.json()["data"]
    assert (바뀐["date"], 바뀐["time"], 바뀐["version"]) == ("2026-10-03", "12:30", 2)
    assert 낡음.status_code == 409


async def test_목록은_날짜와_시각_순이다(api, db):
    headers, _, trip = await 여행_하나(api)
    await 일정을_넣는다(api, headers, trip["id"], title="셋째 날 아침", date="2026-10-03", time="09:00")
    await 일정을_넣는다(api, headers, trip["id"], title="첫날 저녁", date="2026-10-01", time="18:00")
    await 일정을_넣는다(api, headers, trip["id"], title="첫날 점심", date="2026-10-01", time="12:00")

    목록 = (await api.get(f"/v1/trips/{trip['id']}/schedule-items", headers=headers)).json()["data"]

    assert [줄["title"] for 줄 in 목록] == ["첫날 점심", "첫날 저녁", "셋째 날 아침"]


async def test_지우면_링크도_떼어진다(api, db):
    headers, _, trip = await 여행_하나(api)
    일정 = (await 일정을_넣는다(api, headers, trip["id"], mapUrl="https://example.com/a")).json()["data"]

    응답 = await api.delete(f"/v1/schedule-items/{일정['id']}", headers=headers)

    assert 응답.status_code == 204
    assert await db.scalar(select(func.count()).select_from(ExternalLink).where(ExternalLink.target_id == uuid.UUID(일정["id"]))) == 0


async def test_보기만_하는_멤버와_남은_일정을_바꿀_수_없다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    일정 = (await 일정을_넣는다(api, headers, trip["id"])).json()["data"]
    viewer = await 멤버로_넣는다(api, db, space_id, "viewer@example.com", MembershipRole.VIEWER)
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")

    assert (await api.patch(f"/v1/schedule-items/{일정['id']}", json={"version": 1, "title": "x"}, headers=viewer)).status_code == 403
    assert (await api.get(f"/v1/trips/{trip['id']}/schedule-items", headers=남)).status_code == 404
    assert (await api.delete(f"/v1/schedule-items/{일정['id']}", headers=남)).status_code == 404


# ---------------------------------------------------------------------------
# 여행 기간을 바꾸면
# ---------------------------------------------------------------------------


async def test_기간을_늘리면_새_날에도_일정을_붙일_수_있고_줄이면_빠진_날은_날짜_미정이_된다(api, db):
    headers, _, trip = await 여행_하나(api)
    마지막_날 = (await 일정을_넣는다(api, headers, trip["id"], date="2026-10-03")).json()["data"]

    늘림 = await api.patch(f"/v1/trips/{trip['id']}", json={"version": trip["version"], "endDate": "2026-10-05"}, headers=headers)
    assert 늘림.status_code == 200
    새_날 = await api.post(f"/v1/trips/{trip['id']}/schedule-items", json={"title": "넷째 날", "date": "2026-10-04"}, headers=headers)
    assert 새_날.status_code == 201

    줄임 = await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": 늘림.json()["data"]["version"], "startDate": "2026-10-04", "endDate": "2026-10-05"},
        headers=headers,
    )
    assert 줄임.status_code == 200
    날들 = (await db.execute(select(TripDay.date, TripDay.day_index).where(TripDay.trip_id == uuid.UUID(trip["id"])).order_by(TripDay.day_index))).all()
    assert [(str(d), i) for d, i in 날들] == [("2026-10-04", 1), ("2026-10-05", 2)]
    목록 = {줄["title"]: 줄["date"] for 줄 in (await api.get(f"/v1/trips/{trip['id']}/schedule-items", headers=headers)).json()["data"]}
    assert 목록 == {"넷째 날": "2026-10-04", 마지막_날["title"]: None}


# ---------------------------------------------------------------------------
# 숙소
# ---------------------------------------------------------------------------


async def test_숙소를_장소와_체크인_체크아웃으로_등록한다(api, db):
    headers, _, trip = await 여행_하나(api)
    장소 = (await 장소를_담는다(api, headers, trip["id"])).json()["data"]

    응답 = await api.post(
        f"/v1/trips/{trip['id']}/stays",
        json={"tripPlaceId": 장소["id"], "checkInAt": "2026-10-01T15:00", "checkOutAt": "2026-10-03T11:00"},
        headers=headers,
    )

    숙소 = 응답.json()["data"]
    assert 응답.status_code == 201
    assert (숙소["tripPlaceId"], 숙소["checkInAt"], 숙소["checkOutAt"], 숙소["showInSchedule"]) == (
        장소["id"], "2026-10-01T15:00", "2026-10-03T11:00", True
    )
    저장된 = await db.get(Stay, uuid.UUID(숙소["id"]))
    assert 저장된.check_in_at.astimezone(UTC) == datetime(2026, 10, 1, 6, 0, tzinfo=UTC)


async def test_체크아웃이_체크인보다_빠르거나_없는_날짜면_거부한다(api, db):
    headers, _, trip = await 여행_하나(api)

    거꾸로 = await api.post(
        f"/v1/trips/{trip['id']}/stays", json={"checkInAt": "2026-10-03T15:00", "checkOutAt": "2026-10-01T11:00"}, headers=headers
    )
    없는_날 = await api.post(f"/v1/trips/{trip['id']}/stays", json={"checkInAt": "2026-02-30T15:00"}, headers=headers)

    assert (거꾸로.status_code, 없는_날.status_code) == (422, 422)


async def test_숙소를_고치고_지운다(api, db):
    headers, _, trip = await 여행_하나(api)
    숙소 = (await api.post(f"/v1/trips/{trip['id']}/stays", json={"checkInAt": "2026-10-01T15:00"}, headers=headers)).json()["data"]

    고침 = await api.patch(f"/v1/stays/{숙소['id']}", json={"version": 1, "showInSchedule": False, "checkOutAt": "2026-10-02T10:00"}, headers=headers)
    낡음 = await api.patch(f"/v1/stays/{숙소['id']}", json={"version": 1, "note": "x"}, headers=headers)
    지움 = await api.delete(f"/v1/stays/{숙소['id']}", headers=headers)

    assert 고침.json()["data"]["showInSchedule"] is False and 고침.json()["data"]["version"] == 2
    assert 낡음.status_code == 409
    assert 지움.status_code == 204
    assert (await api.get(f"/v1/trips/{trip['id']}/stays", headers=headers)).json()["data"] == []
