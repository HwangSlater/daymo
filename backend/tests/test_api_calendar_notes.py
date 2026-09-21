import uuid

import pytest
from sqlalchemy import func, select

from app.models import CalendarNote, Membership, MembershipRole, User
from app.services.space_purge import purge_space
from tests.test_api_members import token_of, 초대를_만든다
from tests.test_api_trips import 공간을_만든다, 로그인한_사람

pytestmark = pytest.mark.anyio


async def 멤버_id(api, headers, space_id: str, 이름: str) -> str:
    응답 = await api.get(f"/v1/spaces/{space_id}/members", headers=headers)
    return next(줄["id"] for 줄 in 응답.json()["data"] if 줄["displayName"] == 이름)


async def 둘이_쓰는_공간(api) -> tuple[dict, dict, str]:
    """owner 하늘과 초대로 들어온 editor 여울."""
    하늘 = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, 하늘)
    초대 = await 초대를_만든다(api, 하늘, space_id)
    여울 = await 로그인한_사람(api, "sea@example.com", "여울")
    await api.post("/v1/invites/accept", json={"token": token_of(초대)}, headers=여울)
    return 하늘, 여울, space_id


async def 적는다(api, headers, space_id: str, **값) -> dict:
    본문 = {"kind": "memo", "title": "전주 숙소 결제 마감", "startDate": "2026-09-25", "endDate": "2026-09-25", **값}
    응답 = await api.post(f"/v1/spaces/{space_id}/calendar-notes", json=본문, headers=headers)
    assert 응답.status_code == 201, 응답.text
    return 응답.json()["data"]


async def 읽는다(api, headers, space_id: str, 부터: str, 까지: str):
    return await api.get(
        f"/v1/spaces/{space_id}/calendar-notes", params={"from": 부터, "to": 까지}, headers=headers
    )


# ---------------------------------------------------------------------------
# 만들기와 읽기
# ---------------------------------------------------------------------------


async def test_일정과_메모를_적으면_같은_공간_멤버가_함께_본다(api, db):
    하늘, 여울, space_id = await 둘이_쓰는_공간(api)
    여울_id = await 멤버_id(api, 하늘, space_id, "여울")

    출장 = await 적는다(
        api, 여울, space_id,
        kind="schedule", membershipId=여울_id, title="  부산 출장  ",
        startDate="2026-09-22", endDate="2026-09-24",
    )
    야근 = await 적는다(
        api, 하늘, space_id,
        kind="schedule", membershipId=await 멤버_id(api, 하늘, space_id, "하늘"),
        title="야근", startDate="2026-09-22", endDate="2026-09-22", time="19:00",
    )
    메모 = await 적는다(api, 하늘, space_id)

    assert 출장["kind"] == "schedule"
    assert 출장["membershipId"] == 여울_id
    assert 출장["title"] == "부산 출장"  # 앞뒤 공백은 뺀다.
    assert 출장["time"] is None
    assert 출장["spaceId"] == space_id
    assert 출장["version"] == 1
    assert 출장["createdByMembershipId"] == 여울_id
    assert 출장["createdAt"]
    assert 야근["time"] == "19:00"
    assert 메모["membershipId"] is None

    목록 = (await 읽는다(api, 하늘, space_id, "2026-09-01", "2026-09-30")).json()["data"]
    # 날짜 순, 같은 날에서는 하루 종일인 것(시각 없음)이 먼저다.
    assert [줄["id"] for 줄 in 목록] == [출장["id"], 야근["id"], 메모["id"]]
    assert (await 읽는다(api, 여울, space_id, "2026-09-01", "2026-09-30")).json()["data"] == 목록


async def test_기간과_겹치는_것만_읽는다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    걸친_것 = await 적는다(api, 하늘, space_id, title="걸친 것", startDate="2026-09-28", endDate="2026-10-02")
    안쪽 = await 적는다(api, 하늘, space_id, title="안쪽", startDate="2026-10-10", endDate="2026-10-10")
    끝나는_날 = await 적는다(api, 하늘, space_id, title="끝나는 날", startDate="2026-10-31", endDate="2026-11-03")
    await 적는다(api, 하늘, space_id, title="앞", startDate="2026-09-20", endDate="2026-09-30")
    await 적는다(api, 하늘, space_id, title="뒤", startDate="2026-11-01", endDate="2026-11-02")

    목록 = (await 읽는다(api, 하늘, space_id, "2026-10-01", "2026-10-31")).json()["data"]

    assert [줄["id"] for 줄 in 목록] == [걸친_것["id"], 안쪽["id"], 끝나는_날["id"]]


async def test_읽는_기간이_뒤집히거나_너무_길면_422다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)

    뒤집힘 = await 읽는다(api, 하늘, space_id, "2026-10-02", "2026-10-01")
    너무_김 = await 읽는다(api, 하늘, space_id, "2026-01-01", "2027-02-05")  # 401일
    딱_400일 = await 읽는다(api, 하늘, space_id, "2026-01-01", "2027-02-04")
    빠짐 = await api.get(f"/v1/spaces/{space_id}/calendar-notes", params={"from": "2026-10-01"}, headers=하늘)

    assert (뒤집힘.status_code, 너무_김.status_code, 딱_400일.status_code, 빠짐.status_code) == (
        422, 422, 200, 422,
    )


async def test_같은_id_로_두_번_보내도_하나만_생긴다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    본문 = {
        "id": "55555555-5555-5555-5555-555555555555",
        "kind": "memo", "title": "결제 마감", "startDate": "2026-09-25", "endDate": "2026-09-25",
    }

    처음 = await api.post(f"/v1/spaces/{space_id}/calendar-notes", json=본문, headers=하늘)
    다시 = await api.post(f"/v1/spaces/{space_id}/calendar-notes", json=본문, headers=하늘)
    다른_공간 = await 공간을_만든다(api, 하늘, "다른 공간")
    남의_자리 = await api.post(f"/v1/spaces/{다른_공간}/calendar-notes", json=본문, headers=하늘)

    assert (처음.status_code, 다시.status_code) == (201, 200)
    assert 처음.json()["data"]["id"] == 본문["id"]
    assert 다시.json()["data"] == 처음.json()["data"]
    # 다른 공간에서 같은 id 를 쓰면 받지 않는다.
    assert 남의_자리.status_code == 422
    assert len((await 읽는다(api, 하늘, space_id, "2026-09-01", "2026-09-30")).json()["data"]) == 1


# ---------------------------------------------------------------------------
# 검증
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "바꾼_값",
    [
        {"title": ""},
        {"title": "   "},
        {"title": "가" * 61},
        {"startDate": "2026-09-26", "endDate": "2026-09-25"},
        {"startDate": "2026-09-01", "endDate": "2026-10-31"},  # 61일이다.
        {"time": "24:00"},
        {"time": "9:00"},
        {"time": "19:60"},
        {"kind": "birthday"},
        {"startDate": "2026-09-31"},
    ],
)
async def test_잘못된_값은_422다(api, db, 바꾼_값):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    본문 = {"kind": "memo", "title": "메모", "startDate": "2026-09-25", "endDate": "2026-09-25", **바꾼_값}

    응답 = await api.post(f"/v1/spaces/{space_id}/calendar-notes", json=본문, headers=하늘)

    assert 응답.status_code == 422, 응답.text


async def test_60일과_60자까지는_적힌다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)

    긴_것 = await 적는다(api, 하늘, space_id, title="가" * 60, startDate="2026-09-01", endDate="2026-10-30")

    assert len(긴_것["title"]) == 60


async def test_메모는_사람을_보내도_비워서_저장한다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    하늘_id = await 멤버_id(api, 하늘, space_id, "하늘")

    메모 = await 적는다(api, 하늘, space_id, kind="memo", membershipId=하늘_id)
    저장된_것 = await db.get(CalendarNote, uuid.UUID(메모["id"]))

    assert 메모["membershipId"] is None
    assert 저장된_것.membership_id is None


async def test_일정은_그_공간_멤버의_것이어야_한다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    남 = await 로그인한_사람(api, "other@example.com", "새봄")
    남의_공간 = await 공간을_만든다(api, 남, "남의 공간")
    남의_멤버_id = await 멤버_id(api, 남, 남의_공간, "새봄")
    본문 = {"kind": "schedule", "title": "출장", "startDate": "2026-09-22", "endDate": "2026-09-24"}

    남의_멤버 = await api.post(
        f"/v1/spaces/{space_id}/calendar-notes", json={**본문, "membershipId": 남의_멤버_id}, headers=하늘
    )
    사람_없음 = await api.post(f"/v1/spaces/{space_id}/calendar-notes", json=본문, headers=하늘)

    assert 남의_멤버.status_code == 422, 남의_멤버.text
    assert "membershipId" in 남의_멤버.json()["error"]["fields"]
    assert 사람_없음.status_code == 422


async def test_나간_멤버에게는_새_일정을_달_수_없다(api, db):
    하늘, 여울, space_id = await 둘이_쓰는_공간(api)
    여울_id = await 멤버_id(api, 하늘, space_id, "여울")
    assert (await api.delete(f"/v1/spaces/{space_id}/members/{여울_id}", headers=여울)).status_code == 204

    응답 = await api.post(
        f"/v1/spaces/{space_id}/calendar-notes",
        json={"kind": "schedule", "membershipId": 여울_id, "title": "출장",
              "startDate": "2026-09-22", "endDate": "2026-09-24"},
        headers=하늘,
    )

    assert 응답.status_code == 422


# ---------------------------------------------------------------------------
# 고치기와 지우기
# ---------------------------------------------------------------------------


async def test_고치면_version_이_오르고_묵은_version_은_409다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    메모 = await 적는다(api, 하늘, space_id)

    고침 = await api.patch(
        f"/v1/calendar-notes/{메모['id']}",
        json={"version": 메모["version"], "title": "숙소 잔금", "endDate": "2026-09-26", "time": "18:00"},
        headers=하늘,
    )
    묵은_값 = await api.patch(
        f"/v1/calendar-notes/{메모['id']}", json={"version": 메모["version"], "title": "덮기"}, headers=하늘
    )
    시각_지움 = await api.patch(
        f"/v1/calendar-notes/{메모['id']}", json={"version": 메모["version"] + 1, "time": None}, headers=하늘
    )

    assert 고침.status_code == 200, 고침.text
    assert 고침.json()["data"]["title"] == "숙소 잔금"
    assert 고침.json()["data"]["startDate"] == "2026-09-25"
    assert 고침.json()["data"]["endDate"] == "2026-09-26"
    assert 고침.json()["data"]["time"] == "18:00"
    assert 고침.json()["data"]["version"] == 메모["version"] + 1
    assert 묵은_값.status_code == 409
    assert 묵은_값.json()["error"]["code"] == "VERSION_CONFLICT"
    assert 시각_지움.json()["data"]["time"] is None


async def test_고칠_때도_같은_규칙이_걸린다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    메모 = await 적는다(api, 하늘, space_id)
    주소 = f"/v1/calendar-notes/{메모['id']}"

    for 바꾼_값 in (
        {"endDate": "2026-09-24"},
        {"title": None},
        {"title": "  "},
        {"startDate": None},
        {"kind": "schedule"},  # 누구의 일정인지 없다.
    ):
        응답 = await api.patch(주소, json={"version": 1, **바꾼_값}, headers=하늘)
        assert 응답.status_code == 422, (바꾼_값, 응답.text)

    # 일정을 메모로 바꾸면 사람이 비워진다.
    하늘_id = await 멤버_id(api, 하늘, space_id, "하늘")
    일정 = await api.patch(주소, json={"version": 1, "kind": "schedule", "membershipId": 하늘_id}, headers=하늘)
    다시_메모 = await api.patch(주소, json={"version": 2, "kind": "memo"}, headers=하늘)
    assert 일정.json()["data"]["membershipId"] == 하늘_id
    assert 다시_메모.json()["data"]["membershipId"] is None


async def test_지우면_목록에서_사라진다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    메모 = await 적는다(api, 하늘, space_id)

    지움 = await api.delete(f"/v1/calendar-notes/{메모['id']}", headers=하늘)
    다시 = await api.delete(f"/v1/calendar-notes/{메모['id']}", headers=하늘)

    assert 지움.status_code == 204
    assert 다시.status_code == 404
    assert (await 읽는다(api, 하늘, space_id, "2026-09-01", "2026-09-30")).json()["data"] == []


# ---------------------------------------------------------------------------
# 권한
# ---------------------------------------------------------------------------


async def test_멤버가_아니면_무엇이든_404다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    메모 = await 적는다(api, 하늘, space_id)
    남 = await 로그인한_사람(api, "other@example.com", "새봄")

    읽기 = await 읽는다(api, 남, space_id, "2026-09-01", "2026-09-30")
    만들기 = await api.post(
        f"/v1/spaces/{space_id}/calendar-notes",
        json={"kind": "memo", "title": "몰래", "startDate": "2026-09-25", "endDate": "2026-09-25"},
        headers=남,
    )
    고치기 = await api.patch(f"/v1/calendar-notes/{메모['id']}", json={"version": 1, "title": "몰래"}, headers=남)
    지우기 = await api.delete(f"/v1/calendar-notes/{메모['id']}", headers=남)

    assert [응답.status_code for 응답 in (읽기, 만들기, 고치기, 지우기)] == [404, 404, 404, 404]


async def test_viewer_는_보기만_한다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    메모 = await 적는다(api, 하늘, space_id)
    보는_사람 = await 로그인한_사람(api, "viewer@example.com", "새봄")
    user_id = await db.scalar(select(User.id).where(User.email == "viewer@example.com"))
    db.add(Membership(space_id=space_id, user_id=user_id, role=MembershipRole.VIEWER))
    await db.flush()

    읽기 = await 읽는다(api, 보는_사람, space_id, "2026-09-01", "2026-09-30")
    만들기 = await api.post(
        f"/v1/spaces/{space_id}/calendar-notes",
        json={"kind": "memo", "title": "몰래", "startDate": "2026-09-25", "endDate": "2026-09-25"},
        headers=보는_사람,
    )

    assert 읽기.status_code == 200
    assert [줄["id"] for 줄 in 읽기.json()["data"]] == [메모["id"]]
    assert 만들기.status_code == 403


async def test_남이_적은_것은_만든_사람과_owner_만_고치고_지운다(api, db):
    하늘, 여울, space_id = await 둘이_쓰는_공간(api)
    하늘_것 = await 적는다(api, 하늘, space_id, title="하늘 메모")
    여울_것 = await 적는다(api, 여울, space_id, title="여울 메모")

    # editor 는 남(owner)이 적은 것을 못 고치고 못 지운다.
    여울이_고침 = await api.patch(
        f"/v1/calendar-notes/{하늘_것['id']}", json={"version": 1, "title": "바꿈"}, headers=여울
    )
    여울이_지움 = await api.delete(f"/v1/calendar-notes/{하늘_것['id']}", headers=여울)
    # 자기 것은 고친다.
    여울이_자기_것 = await api.patch(
        f"/v1/calendar-notes/{여울_것['id']}", json={"version": 1, "title": "여울 메모 2"}, headers=여울
    )
    # owner 는 남이 적은 것도 고치고 지운다.
    하늘이_고침 = await api.patch(
        f"/v1/calendar-notes/{여울_것['id']}", json={"version": 2, "title": "하늘이 고침"}, headers=하늘
    )
    하늘이_지움 = await api.delete(f"/v1/calendar-notes/{여울_것['id']}", headers=하늘)

    assert 여울이_고침.status_code == 403
    assert 여울이_지움.status_code == 403
    assert 여울이_자기_것.status_code == 200
    assert 하늘이_고침.status_code == 200, 하늘이_고침.text
    assert 하늘이_지움.status_code == 204


# ---------------------------------------------------------------------------
# 멤버가 나가고 공간이 지워질 때
# ---------------------------------------------------------------------------


async def test_주인이_나간_일정도_제목은_고칠_수_있다(api, db):
    """앱은 고칠 때 값을 통째로 보낸다. 같은 사람을 다시 보냈다고 막으면 안 된다."""
    하늘, 여울, space_id = await 둘이_쓰는_공간(api)
    여울_id = await 멤버_id(api, 하늘, space_id, "여울")
    출장 = await 적는다(
        api, 하늘, space_id, kind="schedule", membershipId=여울_id, title="출장",
        startDate="2026-09-22", endDate="2026-09-24",
    )
    await api.delete(f"/v1/spaces/{space_id}/members/{여울_id}", headers=여울)

    그대로 = await api.patch(
        f"/v1/calendar-notes/{출장['id']}",
        json={"version": 1, "kind": "schedule", "membershipId": 여울_id, "title": "부산 출장"},
        headers=하늘,
    )

    assert 그대로.status_code == 200, 그대로.text
    assert 그대로.json()["data"]["membershipId"] == 여울_id


async def test_공간을_지우면_함께_사라진다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 하늘)
    하늘_id = await 멤버_id(api, 하늘, space_id, "하늘")
    메모 = await 적는다(api, 하늘, space_id)
    await 적는다(api, 하늘, space_id, kind="schedule", membershipId=하늘_id, title="야근", time="19:00")
    남는_공간 = await 공간을_만든다(api, 하늘, "남는 공간")
    await 적는다(api, 하늘, 남는_공간)

    # 지우기를 누르면 곧바로 안 보인다.
    지움 = await api.request(
        "DELETE", f"/v1/spaces/{space_id}",
        json={"confirmationName": "우리의 여행 공간", "impactAcknowledged": True}, headers=하늘,
    )
    assert 지움.status_code == 202, 지움.text
    assert (await 읽는다(api, 하늘, space_id, "2026-09-01", "2026-09-30")).status_code == 404
    assert (await api.delete(f"/v1/calendar-notes/{메모['id']}", headers=하늘)).status_code == 404

    # 유예가 지나 정리되면 줄도 없다. 멤버 줄이 먼저 지워져도 막히지 않는다.
    await purge_space(db, uuid.UUID(space_id))
    남은_수 = await db.scalar(
        select(func.count()).select_from(CalendarNote).where(CalendarNote.space_id == uuid.UUID(space_id))
    )
    다른_공간_수 = await db.scalar(
        select(func.count()).select_from(CalendarNote).where(CalendarNote.space_id == uuid.UUID(남는_공간))
    )

    assert 남은_수 == 0
    assert 다른_공간_수 == 1
