import uuid

import pytest

from app.models import Membership, MembershipRole, Memo
from tests.test_api_expenses import 두_사람_여행, membership_of
from tests.test_api_places import 멤버로_넣는다, 여행_하나
from tests.test_api_trips import 로그인한_사람

pytestmark = pytest.mark.anyio


async def test_메모를_쓰면_작성자와_함께_새것부터_보인다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)

    첫째 = await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "  체크인 전에 장보기 "}, headers=headers)
    await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "우산 챙기기"}, headers=headers)
    목록 = (await api.get(f"/v1/trips/{trip['id']}/memos", headers=headers)).json()["data"]

    메모 = 첫째.json()["data"]
    assert 첫째.status_code == 201
    assert (메모["body"], 메모["authorMembershipId"], 메모["authorName"], 메모["editedAt"], 메모["version"]) == (
        "체크인 전에 장보기", 나, "하늘", None, 1,
    )
    assert {item["body"] for item in 목록} == {"체크인 전에 장보기", "우산 챙기기"}


async def test_메모를_고치면_수정됨이_남고_낡은_버전은_409다(api, db):
    headers, _, trip, _, _ = await 두_사람_여행(api, db)
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "a"}, headers=headers)).json()["data"]

    고침 = await api.patch(f"/v1/memos/{메모['id']}", json={"version": 1, "body": "b"}, headers=headers)
    낡음 = await api.patch(f"/v1/memos/{메모['id']}", json={"version": 1, "body": "c"}, headers=headers)
    빈칸 = await api.patch(f"/v1/memos/{메모['id']}", json={"version": 2, "body": "   "}, headers=headers)

    assert 고침.json()["data"]["editedAt"] is not None and 고침.json()["data"]["version"] == 2
    assert 낡음.status_code == 409
    assert 빈칸.status_code == 422


async def test_남이_쓴_메모도_editor는_지우고_행에_누가_지웠는지_남는다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    여울_headers = await 멤버로_넣는다(api, db, space_id, "yeoul@example.com", MembershipRole.EDITOR)
    여울 = await membership_of(db, space_id, "yeoul@example.com")
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "하늘이 쓴 메모"}, headers=headers)).json()["data"]

    지움 = await api.delete(f"/v1/memos/{메모['id']}", headers=여울_headers)
    목록 = (await api.get(f"/v1/trips/{trip['id']}/memos", headers=headers)).json()["data"]
    다시_지움 = await api.delete(f"/v1/memos/{메모['id']}", headers=headers)
    같은_id로_다시 = await api.post(f"/v1/trips/{trip['id']}/memos", json={"id": 메모["id"], "body": "x"}, headers=headers)

    assert 지움.status_code == 204 and 목록 == []
    줄 = await db.get(Memo, uuid.UUID(메모["id"]))
    await db.refresh(줄)
    assert str(줄.deleted_by) == 여울 and 줄.deleted_at is not None
    assert 다시_지움.status_code == 404
    assert 같은_id로_다시.status_code == 404


async def test_보기만_하는_멤버는_메모를_못_쓰고_남은_못_본다(api, db):
    headers, space_id, trip, _, _ = await 두_사람_여행(api, db)
    viewer = await 멤버로_넣는다(api, db, space_id, "viewer@example.com", MembershipRole.VIEWER)
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")

    보기만 = await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "x"}, headers=viewer)
    남의_목록 = await api.get(f"/v1/trips/{trip['id']}/memos", headers=남)

    assert (보기만.status_code, 남의_목록.status_code) == (403, 404)


async def test_일기는_다루는_날_순서이고_날이_없으면_뒤다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)

    await api.post(f"/v1/trips/{trip['id']}/diaries", json={"body": "돌아와서 쓴 이야기"}, headers=headers)
    둘째날 = await api.post(
        f"/v1/trips/{trip['id']}/diaries", json={"title": " 비 온 날 ", "body": "우산 하나로 걸었다", "writtenOn": "2026-10-02"}, headers=headers
    )
    await api.post(f"/v1/trips/{trip['id']}/diaries", json={"title": "", "body": "첫날", "writtenOn": "2026-10-01"}, headers=headers)
    목록 = (await api.get(f"/v1/trips/{trip['id']}/diaries", headers=headers)).json()["data"]

    일기 = 둘째날.json()["data"]
    assert (일기["title"], 일기["writtenOn"], 일기["authorMembershipId"], 일기["version"]) == ("비 온 날", "2026-10-02", 나, 1)
    assert [item["body"] for item in 목록] == ["첫날", "우산 하나로 걸었다", "돌아와서 쓴 이야기"]
    assert 목록[0]["title"] is None


async def test_일기를_고치고_지우며_같은_id로_다시_보내도_하나다(api, db):
    headers, _, trip, _, _ = await 두_사람_여행(api, db)
    id = str(uuid.uuid4())

    첫번째 = await api.post(f"/v1/trips/{trip['id']}/diaries", json={"id": id, "body": "a"}, headers=headers)
    두번째 = await api.post(f"/v1/trips/{trip['id']}/diaries", json={"id": id, "body": "b"}, headers=headers)
    고침 = await api.patch(f"/v1/diaries/{id}", json={"version": 1, "writtenOn": "2026-10-03", "title": "마지막 날"}, headers=headers)
    낡음 = await api.patch(f"/v1/diaries/{id}", json={"version": 1, "body": "c"}, headers=headers)
    지움 = await api.delete(f"/v1/diaries/{id}", headers=headers)

    assert (첫번째.status_code, 두번째.status_code) == (201, 200)
    assert (고침.json()["data"]["writtenOn"], 고침.json()["data"]["body"], 고침.json()["data"]["version"]) == ("2026-10-03", "a", 2)
    assert 낡음.status_code == 409
    assert 지움.status_code == 204
    assert (await api.get(f"/v1/trips/{trip['id']}/diaries", headers=headers)).json()["data"] == []


async def test_계정을_지운_사람의_메모는_탈퇴한_멤버로_보인다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "a"}, headers=headers)).json()["data"]
    줄 = await db.get(Memo, uuid.UUID(메모["id"]))
    줄.author_membership_id = None
    await db.flush()

    목록 = (await api.get(f"/v1/trips/{trip['id']}/memos", headers=headers)).json()["data"]

    assert (목록[0]["authorMembershipId"], 목록[0]["authorName"]) == (None, "삭제된 계정")
    assert await db.get(Membership, uuid.UUID(나)) is not None
