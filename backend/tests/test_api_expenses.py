import uuid

import pytest
from sqlalchemy import func, select

from app.models import ExpenseShare, Membership, MembershipRole, Payment, User
from tests.test_api_places import 멤버로_넣는다, 여행_하나
from tests.test_api_trips import 로그인한_사람

pytestmark = pytest.mark.anyio

# tests.test_api_trips 의 여행은 2026-10-01 ~ 2026-10-03 이다.


async def membership_of(db, space_id, email):
    return str(
        await db.scalar(
            select(Membership.id)
            .join(User, User.id == Membership.user_id)
            .where(Membership.space_id == uuid.UUID(space_id), User.email == email)
        )
    )


async def 두_사람_여행(api, db):
    headers, space_id, trip = await 여행_하나(api)
    await 멤버로_넣는다(api, db, space_id, "yeoul@example.com", MembershipRole.EDITOR)
    나 = await membership_of(db, space_id, "sky@example.com")
    여울 = await membership_of(db, space_id, "yeoul@example.com")
    return headers, space_id, trip, 나, 여울


async def 지출을_넣는다(api, headers, trip_id, payer, **값):
    본문 = {"title": "소나기식당 점심", "amount": 48000, "category": "meal", "payerMembershipId": payer, "date": "2026-10-02", **값}
    응답 = await api.post(f"/v1/trips/{trip_id}/expenses", json=본문, headers=headers)
    assert 응답.status_code in (200, 201), 응답.text
    return 응답


# ---------------------------------------------------------------------------
# 지출
# ---------------------------------------------------------------------------


async def test_지출을_몫과_함께_적는다(api, db):
    headers, _, trip, 나, 여울 = await 두_사람_여행(api, db)

    응답 = await 지출을_넣는다(
        api, headers, trip["id"], 나, splitMode="amount",
        shares=[{"membershipId": 나, "weight": 30000}, {"membershipId": 여울, "weight": 18000}], memo="영수증 있음",
    )

    지출 = 응답.json()["data"]
    assert 응답.status_code == 201
    assert (지출["amount"], 지출["date"], 지출["splitMode"], 지출["memo"], 지출["version"]) == (48000.0, "2026-10-02", "amount", "영수증 있음", 1)
    assert {share["membershipId"]: share["weight"] for share in 지출["shares"]} == {나: 30000.0, 여울: 18000.0}


async def test_몫을_비우면_전원_균등이고_소수_둘째_자리까지_받는다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)

    지출 = (await 지출을_넣는다(api, headers, trip["id"], 나, amount=24.5)).json()["data"]
    너무_작음 = await api.post(
        f"/v1/trips/{trip['id']}/expenses",
        json={"title": "x", "amount": 1.234, "payerMembershipId": 나},
        headers=headers,
    )

    assert 지출["shares"] == [] and 지출["amount"] == 24.5
    assert 너무_작음.status_code == 422


async def test_다른_공간_사람은_낸_사람도_몫도_될_수_없다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)
    남_headers = await 로그인한_사람(api, "stranger@example.com", "낯선이")
    남의_공간 = (await api.post("/v1/spaces", json={"name": "남의 공간"}, headers=남_headers)).json()["data"]["id"]
    남 = await membership_of(db, 남의_공간, "stranger@example.com")

    낸_사람 = await api.post(f"/v1/trips/{trip['id']}/expenses", json={"title": "x", "amount": 1000, "payerMembershipId": 남}, headers=headers)
    몫 = await api.post(
        f"/v1/trips/{trip['id']}/expenses",
        json={"title": "x", "amount": 1000, "payerMembershipId": 나, "shares": [{"membershipId": 남, "weight": 1}]},
        headers=headers,
    )

    assert (낸_사람.status_code, 몫.status_code) == (422, 422)


async def test_나간_멤버가_낸_지출도_고칠_수_있다(api, db):
    headers, space_id, trip, 나, 여울 = await 두_사람_여행(api, db)
    지출 = (await 지출을_넣는다(api, headers, trip["id"], 여울)).json()["data"]
    줄 = await db.get(Membership, uuid.UUID(여울))
    from datetime import UTC, datetime

    줄.left_at = datetime.now(UTC)
    await db.flush()

    응답 = await api.patch(f"/v1/expenses/{지출['id']}", json={"version": 1, "title": "여울이 낸 점심"}, headers=headers)

    assert 응답.status_code == 200 and 응답.json()["data"]["payerMembershipId"] == 여울


async def test_몫을_바꾸면_통째로_바뀌고_낡은_버전은_409다(api, db):
    headers, _, trip, 나, 여울 = await 두_사람_여행(api, db)
    지출 = (await 지출을_넣는다(api, headers, trip["id"], 나, shares=[{"membershipId": 나, "weight": 1}, {"membershipId": 여울, "weight": 1}])).json()["data"]

    고침 = await api.patch(f"/v1/expenses/{지출['id']}", json={"version": 1, "shares": [{"membershipId": 여울, "weight": 1}], "splitMode": "subset"}, headers=headers)
    낡음 = await api.patch(f"/v1/expenses/{지출['id']}", json={"version": 1, "amount": 1}, headers=headers)

    assert [share["membershipId"] for share in 고침.json()["data"]["shares"]] == [여울]
    assert 고침.json()["data"]["version"] == 2
    assert 낡음.status_code == 409
    assert await db.scalar(select(func.count()).select_from(ExpenseShare)) == 1


async def test_같은_id로_다시_보내도_하나이고_지우면_몫도_사라진다(api, db):
    headers, _, trip, 나, 여울 = await 두_사람_여행(api, db)
    id = str(uuid.uuid4())
    첫번째 = await 지출을_넣는다(api, headers, trip["id"], 나, id=id, shares=[{"membershipId": 여울, "weight": 1}])
    두번째 = await 지출을_넣는다(api, headers, trip["id"], 나, id=id)

    지움 = await api.delete(f"/v1/expenses/{id}", headers=headers)

    assert (첫번째.status_code, 두번째.status_code, 지움.status_code) == (201, 200, 204)
    assert await db.scalar(select(func.count()).select_from(ExpenseShare)) == 0


async def test_정산에서_뺀_지출은_남고_교통편_id를_그대로_돌려준다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)
    교통편 = str(uuid.uuid4())

    기본 = (await 지출을_넣는다(api, headers, trip["id"], 나)).json()["data"]
    뺀_것 = (await 지출을_넣는다(api, headers, trip["id"], 나, title="KTX", excluded=True, transportId=교통편)).json()["data"]
    되돌림 = await api.patch(f"/v1/expenses/{뺀_것['id']}", json={"version": 1, "excluded": False}, headers=headers)
    목록 = (await api.get(f"/v1/trips/{trip['id']}/expenses", headers=headers)).json()["data"]

    assert (기본["excluded"], 기본["transportId"]) == (False, None)
    assert (뺀_것["excluded"], 뺀_것["transportId"]) == (True, 교통편)
    assert 되돌림.status_code == 200 and 되돌림.json()["data"]["excluded"] is False
    # 뺀 지출도 목록에는 그대로 있고, 교통편 연결은 고쳐도 남는다.
    assert {row["id"]: row["transportId"] for row in 목록} == {기본["id"]: None, 뺀_것["id"]: 교통편}


async def test_보기만_하는_멤버는_지출을_적을_수_없다(api, db):
    headers, space_id, trip, 나, _ = await 두_사람_여행(api, db)
    viewer = await 멤버로_넣는다(api, db, space_id, "viewer@example.com", MembershipRole.VIEWER)

    응답 = await api.post(f"/v1/trips/{trip['id']}/expenses", json={"title": "x", "amount": 1000, "payerMembershipId": 나}, headers=viewer)

    assert 응답.status_code == 403


# ---------------------------------------------------------------------------
# 주고받은 기록과 정산 설정
# ---------------------------------------------------------------------------


async def test_보냈다고_적고_되돌리면_목록에서_빠지고_행은_남는다(api, db):
    headers, _, trip, 나, 여울 = await 두_사람_여행(api, db)

    기록 = (await api.post(f"/v1/trips/{trip['id']}/payments", json={"fromMembershipId": 여울, "toMembershipId": 나, "amount": 22500}, headers=headers)).json()["data"]
    되돌림 = await api.delete(f"/v1/payments/{기록['id']}", headers=headers)
    목록 = (await api.get(f"/v1/trips/{trip['id']}/payments", headers=headers)).json()["data"]

    assert 되돌림.status_code == 204 and 목록 == []
    남은_행 = await db.get(Payment, uuid.UUID(기록["id"]))
    await db.refresh(남은_행)
    assert 남은_행.deleted_at is not None and 남은_행.deleted_by is not None


async def test_자기_자신에게_보냈다고_적을_수_없다(api, db):
    headers, _, trip, 나, _ = await 두_사람_여행(api, db)

    응답 = await api.post(f"/v1/trips/{trip['id']}/payments", json={"fromMembershipId": 나, "toMembershipId": 나, "amount": 1000}, headers=headers)

    assert 응답.status_code == 422


async def test_통화와_예산을_바꾸면_여행_버전이_오르고_기록이_있으면_묶기를_못_바꾼다(api, db):
    headers, _, trip, 나, 여울 = await 두_사람_여행(api, db)

    설정 = await api.patch(
        f"/v1/trips/{trip['id']}/expense-settings",
        json={"version": trip["version"], "currency": "JPY", "exchangeRate": 9.3, "budget": 80000},
        headers=headers,
    )
    assert 설정.status_code == 200, 설정.text
    바뀐 = 설정.json()["data"]
    assert (바뀐["currencyCode"], float(바뀐["exchangeRate"]), float(바뀐["budget"]), 바뀐["version"]) == ("JPY", 9.3, 80000.0, trip["version"] + 1)

    await api.post(f"/v1/trips/{trip['id']}/payments", json={"fromMembershipId": 여울, "toMembershipId": 나, "amount": 1000}, headers=headers)
    묶기 = await api.patch(
        f"/v1/trips/{trip['id']}/expense-settings",
        json={"version": 바뀐["version"], "simplifySettlement": False},
        headers=headers,
    )
    낡음 = await api.patch(f"/v1/trips/{trip['id']}/expense-settings", json={"version": trip["version"], "budget": 1}, headers=headers)

    assert 묶기.status_code == 409 and 묶기.json()["error"]["code"] == "SETTLEMENT_IN_PROGRESS"
    assert 낡음.status_code == 409 and 낡음.json()["error"]["code"] == "VERSION_CONFLICT"
