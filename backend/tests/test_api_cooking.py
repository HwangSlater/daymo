import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models import Checklist, ChecklistItem, Ingredient, MembershipRole, Tagging, TagScope, Trip
from app.services.trips import purge_deleted_trips
from tests.test_api_expenses import 두_사람_여행, membership_of
from tests.test_api_places import 멤버로_넣는다
from tests.test_api_trips import 로그인한_사람

pytestmark = pytest.mark.anyio


async def 준비물을_넣는다(api, headers, trip_id, **값):
    응답 = await api.post(f"/v1/trips/{trip_id}/checklist-items", json={"name": "보조배터리", **값}, headers=headers)
    assert 응답.status_code in (200, 201), 응답.text
    return 응답


async def 요리를_넣는다(api, headers, trip_id, **값):
    본문 = {"name": "된장찌개", "ingredients": [{"name": "된장", "quantity": "한 숟갈", "category": "양념"}], **값}
    응답 = await api.post(f"/v1/trips/{trip_id}/recipes", json=본문, headers=headers)
    assert 응답.status_code in (200, 201), 응답.text
    return 응답


# ---------------------------------------------------------------------------
# 준비물
# ---------------------------------------------------------------------------


async def test_준비물을_처음_넣으면_여행의_준비물_목록이_하나_생긴다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)

    빈_목록 = (await api.get(f"/v1/trips/{trip['id']}/checklist-items", headers=headers)).json()["data"]
    첫째 = (await 준비물을_넣는다(api, headers, trip["id"], quantity="2개", ownerMembershipId=나, tags=["전자기기"])).json()["data"]
    await 준비물을_넣는다(api, headers, trip["id"], name="선크림", isShared=True)
    목록 = (await api.get(f"/v1/trips/{trip['id']}/checklist-items", headers=headers)).json()["data"]

    assert 빈_목록 == []
    assert (첫째["quantity"], 첫째["ownerMembershipId"], 첫째["isShared"], 첫째["completed"], 첫째["tags"], 첫째["version"]) == (
        "2개", 나, False, False, ["전자기기"], 1,
    )
    assert [item["name"] for item in 목록] == ["보조배터리", "선크림"]
    assert await db.scalar(select(func.count()).select_from(Checklist)) == 1


async def test_체크하면_누가_했는지_남고_끄면_지운다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)
    item = (await 준비물을_넣는다(api, headers, trip["id"])).json()["data"]

    켬 = await api.patch(f"/v1/checklist-items/{item['id']}", json={"version": 1, "completed": True}, headers=headers)
    줄 = await db.get(ChecklistItem, uuid.UUID(item["id"]))
    await db.refresh(줄)
    완료한_사람 = str(줄.completed_by)
    끔 = await api.patch(f"/v1/checklist-items/{item['id']}", json={"version": 2, "completed": False}, headers=headers)
    await db.refresh(줄)

    assert 켬.json()["data"]["completed"] is True and 완료한_사람 == 나
    assert 끔.json()["data"]["completed"] is False and 줄.completed_by is None


async def test_공용으로_바꾸면_담당자가_비고_담당자를_정하면_공용이_아니다(api, db):
    headers, _, trip, 나, 여울 = await 두_사람_여행(api, db)
    item = (await 준비물을_넣는다(api, headers, trip["id"], ownerMembershipId=나)).json()["data"]

    공용 = (await api.patch(f"/v1/checklist-items/{item['id']}", json={"version": 1, "isShared": True}, headers=headers)).json()["data"]
    담당 = (await api.patch(f"/v1/checklist-items/{item['id']}", json={"version": 2, "ownerMembershipId": 여울}, headers=headers)).json()["data"]
    둘다 = await api.patch(f"/v1/checklist-items/{item['id']}", json={"version": 3, "ownerMembershipId": 나, "isShared": True}, headers=headers)

    assert (공용["isShared"], 공용["ownerMembershipId"]) == (True, None)
    assert (담당["isShared"], 담당["ownerMembershipId"]) == (False, 여울)
    assert 둘다.status_code == 422


async def test_다른_공간_사람에게_준비물을_맡길_수_없다(api, db):
    headers, _, trip, _, _ = await 두_사람_여행(api, db)
    남_headers = await 로그인한_사람(api, "stranger@example.com", "낯선이")
    남의_공간 = (await api.post("/v1/spaces", json={"name": "남의 공간"}, headers=남_headers)).json()["data"]["id"]
    남 = await membership_of(db, 남의_공간, "stranger@example.com")

    응답 = await api.post(f"/v1/trips/{trip['id']}/checklist-items", json={"name": "x", "ownerMembershipId": 남}, headers=headers)

    assert 응답.status_code == 422


async def test_같은_id로_다시_보내도_하나이고_낡은_버전은_409다(api, db):
    headers, _, trip, _, _ = await 두_사람_여행(api, db)
    id = str(uuid.uuid4())

    첫번째 = await 준비물을_넣는다(api, headers, trip["id"], id=id)
    두번째 = await 준비물을_넣는다(api, headers, trip["id"], id=id, name="다른 이름")
    await api.patch(f"/v1/checklist-items/{id}", json={"version": 1, "name": "충전기"}, headers=headers)
    낡음 = await api.patch(f"/v1/checklist-items/{id}", json={"version": 1, "name": "케이블"}, headers=headers)

    assert (첫번째.status_code, 두번째.status_code) == (201, 200)
    assert 두번째.json()["data"]["name"] == "보조배터리"
    assert 낡음.status_code == 409


async def test_준비물을_지우면_태그_연결도_뗀다(api, db):
    headers, _, trip, _, _ = await 두_사람_여행(api, db)
    item = (await 준비물을_넣는다(api, headers, trip["id"], tags=["전자기기", "필수"])).json()["data"]

    응답 = await api.delete(f"/v1/checklist-items/{item['id']}", headers=headers)

    assert 응답.status_code == 204
    assert await db.scalar(select(func.count()).select_from(Tagging).where(Tagging.target_id == uuid.UUID(item["id"]))) == 0


async def test_남의_준비물은_없는_것으로_보고_보기만_하는_멤버는_못_고친다(api, db):
    headers, space_id, trip, _, _ = await 두_사람_여행(api, db)
    item = (await 준비물을_넣는다(api, headers, trip["id"])).json()["data"]
    viewer = await 멤버로_넣는다(api, db, space_id, "viewer@example.com", MembershipRole.VIEWER)
    남_headers = await 로그인한_사람(api, "stranger@example.com", "낯선이")

    남 = await api.patch(f"/v1/checklist-items/{item['id']}", json={"version": 1, "name": "x"}, headers=남_headers)
    보기만 = await api.patch(f"/v1/checklist-items/{item['id']}", json={"version": 1, "name": "x"}, headers=viewer)

    assert (남.status_code, 보기만.status_code) == (404, 403)


async def test_기한이_지난_여행을_지우면_준비물_태그_연결도_지운다(api, db):
    headers, _, trip, _, _ = await 두_사람_여행(api, db)
    item = (await 준비물을_넣는다(api, headers, trip["id"], tags=["전자기기"])).json()["data"]
    여행 = await db.get(Trip, uuid.UUID(trip["id"]))
    여행.deleted_at = datetime.now(UTC) - timedelta(days=8)
    여행.deletion_scheduled_at = datetime.now(UTC) - timedelta(days=1)
    await db.flush()

    assert await purge_deleted_trips(db) == 1
    assert await db.scalar(
        select(func.count()).select_from(Tagging).where(Tagging.target_type == TagScope.PACKING, Tagging.target_id == uuid.UUID(item["id"]))
    ) == 0


# ---------------------------------------------------------------------------
# 요리
# ---------------------------------------------------------------------------


async def test_요리를_재료와_함께_넣는다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)

    응답 = await 요리를_넣는다(
        api, headers, trip["id"], memo="물 500ml", sourceUrl="https://example.com/recipe",
        ingredients=[
            {"name": "된장", "quantity": "한 숟갈", "category": "양념", "procurement": "bring", "ownerMembershipId": 나, "ready": True},
            {"name": "두부", "procurement": "buy"},
        ],
    )

    요리 = 응답.json()["data"]
    assert 응답.status_code == 201
    assert (요리["memo"], 요리["sourceUrl"], 요리["version"]) == ("물 500ml", "https://example.com/recipe", 1)
    assert [(i["name"], i["procurement"], i["ownerMembershipId"], i["ready"]) for i in 요리["ingredients"]] == [
        ("된장", "bring", 나, True),
        ("두부", "buy", None, False),
    ]


async def test_사_오는_재료에는_챙길_사람을_둘_수_없고_링크는_http만_받는다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)

    사람 = await api.post(
        f"/v1/trips/{trip['id']}/recipes",
        json={"name": "x", "ingredients": [{"name": "두부", "procurement": "buy", "ownerMembershipId": 나}]},
        headers=headers,
    )
    링크 = await api.post(f"/v1/trips/{trip['id']}/recipes", json={"name": "x", "sourceUrl": "javascript:alert(1)"}, headers=headers)

    assert 사람.status_code == 422
    assert 링크.status_code == 422 and "sourceUrl" in 링크.text


async def test_재료를_고치면_id가_같은_재료는_남고_빠진_재료는_지운다(api, db):
    headers, _, trip, _, _ = await 두_사람_여행(api, db)
    요리 = (await 요리를_넣는다(api, headers, trip["id"], ingredients=[{"name": "된장"}, {"name": "두부"}])).json()["data"]
    된장, 두부 = 요리["ingredients"]
    # 준비물의 source_ingredient_id 가 재료를 가리키면 재료를 고쳐도 연결이 남아야 한다.
    item = (await 준비물을_넣는다(api, headers, trip["id"], name="된장")).json()["data"]
    줄 = await db.get(ChecklistItem, uuid.UUID(item["id"]))
    줄.source_ingredient_id = uuid.UUID(된장["id"])
    await db.flush()

    고침 = await api.patch(
        f"/v1/recipes/{요리['id']}",
        json={"version": 1, "ingredients": [{"id": 된장["id"], "name": "쌈장", "ready": True}, {"name": "애호박"}]},
        headers=headers,
    )

    재료 = 고침.json()["data"]["ingredients"]
    assert 고침.status_code == 200 and 고침.json()["data"]["version"] == 2
    assert [(i["id"] == 된장["id"], i["name"], i["ready"]) for i in 재료] == [(True, "쌈장", True), (False, "애호박", False)]
    assert await db.get(Ingredient, uuid.UUID(두부["id"])) is None
    await db.refresh(줄)
    assert str(줄.source_ingredient_id) == 된장["id"]


async def test_다른_요리의_재료_id는_쓸_수_없고_낡은_버전은_409다(api, db):
    headers, _, trip, _, _ = await 두_사람_여행(api, db)
    첫째 = (await 요리를_넣는다(api, headers, trip["id"])).json()["data"]
    둘째 = (await 요리를_넣는다(api, headers, trip["id"], name="카레")).json()["data"]

    남의_재료 = await api.patch(
        f"/v1/recipes/{둘째['id']}",
        json={"version": 1, "ingredients": [{"id": 첫째["ingredients"][0]["id"], "name": "된장"}]},
        headers=headers,
    )
    await api.patch(f"/v1/recipes/{둘째['id']}", json={"version": 1, "name": "짜장"}, headers=headers)
    낡음 = await api.patch(f"/v1/recipes/{둘째['id']}", json={"version": 1, "name": "짬뽕"}, headers=headers)

    assert 남의_재료.status_code == 422
    assert 낡음.status_code == 409


async def test_같은_id로_다시_보내도_하나이고_지우면_재료도_사라진다(api, db):
    headers, _, trip, _, _ = await 두_사람_여행(api, db)
    id = str(uuid.uuid4())

    첫번째 = await 요리를_넣는다(api, headers, trip["id"], id=id)
    두번째 = await 요리를_넣는다(api, headers, trip["id"], id=id)
    지움 = await api.delete(f"/v1/recipes/{id}", headers=headers)
    목록 = (await api.get(f"/v1/trips/{trip['id']}/recipes", headers=headers)).json()["data"]

    assert (첫번째.status_code, 두번째.status_code, 지움.status_code) == (201, 200, 204)
    assert 목록 == []
    assert await db.scalar(select(func.count()).select_from(Ingredient)) == 0
