import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import Membership, MembershipRole, Photo, PhotoStatus, Report, SpaceInvite, User, UserBlock
from app.services.account_deletion import purge_deleted_accounts
from app.services.mailer import OPERATOR_ADDRESS, get_outbox
from app.services.moderation import REPORTS_PER_HOUR
from tests.test_api_expenses import membership_of
from tests.test_api_members import 초대를_만든다, token_of
from tests.test_api_places import 멤버로_넣는다, 여행_하나
from tests.test_api_trips import 공간을_만든다, 로그인한_사람

pytestmark = pytest.mark.anyio


def 운영자_메일():
    return [편지 for 편지 in get_outbox().letters if 편지.to == OPERATOR_ADDRESS]


async def 함께_쓰는_여행(api, db):
    """하늘이 만든 공간과 여행에 여울이 editor 로 들어와 있다."""
    하늘, space_id, trip = await 여행_하나(api)
    여울 = await 멤버로_넣는다(api, db, space_id, "yeoul@example.com", MembershipRole.EDITOR)
    return 하늘, 여울, space_id, trip


async def 신고(api, headers, space_id, target_type, target_id=None, **값):
    본문 = {"spaceId": space_id, "targetType": target_type, "reason": "harassment", **값}
    if target_id is not None:
        본문["targetId"] = target_id
    return await api.post("/v1/reports", json=본문, headers=headers)


# ---------------------------------------------------------------------------
# 신고
# ---------------------------------------------------------------------------


async def test_메모를_신고하면_접수_번호를_주고_운영자에게는_내용_없이_알린다(api, db):
    하늘, 여울, space_id, trip = await 함께_쓰는_여행(api, db)
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "다온이 싫다"}, headers=하늘)).json()["data"]

    응답 = await 신고(api, 여울, space_id, "memo", 메모["id"], detail="계속 이런 말을 적어요")

    assert 응답.status_code == 201, 응답.text
    접수 = 응답.json()["data"]
    assert set(접수) == {"id", "receivedAt", "reviewDueAt"}
    줄 = await db.get(Report, uuid.UUID(접수["id"]))
    assert (줄.target_type, 줄.reason, 줄.status, 줄.detail) == ("memo", "harassment", "open", "계속 이런 말을 적어요")
    assert 줄.reporter_user_id == await db.scalar(select(User.id).where(User.email == "yeoul@example.com"))
    [편지] = 운영자_메일()
    assert 접수["id"] in 편지.body and "memo" in 편지.body and "harassment" in 편지.body
    for 드러나면_안_되는 in ("다온이 싫다", "계속 이런 말을", "yeoul@example.com", "sky@example.com"):
        assert 드러나면_안_되는 not in 편지.subject + 편지.body


async def test_같은_대상을_다시_신고하면_처음_접수_번호를_주고_메일을_또_보내지_않는다(api, db):
    하늘, 여울, space_id, trip = await 함께_쓰는_여행(api, db)
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "광고"}, headers=하늘)).json()["data"]

    첫번째 = await 신고(api, 여울, space_id, "memo", 메모["id"], reason="spam")
    두번째 = await 신고(api, 여울, space_id, "memo", 메모["id"], reason="other")

    assert (첫번째.status_code, 두번째.status_code) == (201, 200)
    assert 첫번째.json()["data"]["id"] == 두번째.json()["data"]["id"]
    assert len(운영자_메일()) == 1


async def test_일기_사진_여행_멤버도_신고할_수_있다(api, db):
    하늘, 여울, space_id, trip = await 함께_쓰는_여행(api, db)
    일기 = (await api.post(f"/v1/trips/{trip['id']}/diaries", json={"body": "첫날"}, headers=하늘)).json()["data"]
    사진 = Photo(trip_id=uuid.UUID(trip["id"]), status=PhotoStatus.READY)
    db.add(사진)
    await db.flush()
    하늘_membership = await membership_of(db, space_id, "sky@example.com")

    응답들 = [
        await 신고(api, 여울, space_id, "diary", 일기["id"]),
        await 신고(api, 여울, space_id, "photo", str(사진.id), reason="privacy"),
        await 신고(api, 여울, space_id, "trip", trip["id"]),
        await 신고(api, 여울, space_id, "member", 하늘_membership),
        await 신고(api, 여울, space_id, "other", detail="앱 밖에서 연락이 와요"),
    ]

    assert [응답.status_code for 응답 in 응답들] == [201] * 5
    assert len(운영자_메일()) == 5


async def test_멤버가_아니거나_다른_공간의_대상이면_404이고_모양이_틀리면_422다(api, db):
    하늘, 여울, space_id, trip = await 함께_쓰는_여행(api, db)
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "a"}, headers=하늘)).json()["data"]
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")
    남의_공간 = await 공간을_만든다(api, 남)
    남의_여행 = (
        await api.post(
            f"/v1/spaces/{남의_공간}/trips", json={"title": "x", "startDate": "2026-10-01", "endDate": "2026-10-01"}, headers=남
        )
    ).json()["data"]
    남의_메모 = (await api.post(f"/v1/trips/{남의_여행['id']}/memos", json={"body": "b"}, headers=남)).json()["data"]
    여울_membership = await membership_of(db, space_id, "yeoul@example.com")

    멤버가_아님 = await 신고(api, 남, space_id, "memo", 메모["id"])
    다른_공간_메모 = await 신고(api, 여울, space_id, "memo", 남의_메모["id"])
    종류가_다름 = await 신고(api, 여울, space_id, "diary", 메모["id"])
    대상_없음 = await 신고(api, 여울, space_id, "memo")
    기타에_대상 = await 신고(api, 여울, space_id, "other", 메모["id"])
    나를_신고 = await 신고(api, 여울, space_id, "member", 여울_membership)
    너무_긴_설명 = await 신고(api, 여울, space_id, "memo", 메모["id"], detail="가" * 1001)
    모르는_사유 = await 신고(api, 여울, space_id, "memo", 메모["id"], reason="boring")

    assert (멤버가_아님.status_code, 다른_공간_메모.status_code, 종류가_다름.status_code) == (404, 404, 404)
    assert [응답.status_code for 응답 in (대상_없음, 기타에_대상, 나를_신고, 너무_긴_설명, 모르는_사유)] == [422] * 5
    assert await db.scalar(select(Report.id)) is None
    assert 운영자_메일() == []


async def test_지운_메모는_신고할_수_없다(api, db):
    하늘, 여울, space_id, trip = await 함께_쓰는_여행(api, db)
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "a"}, headers=하늘)).json()["data"]
    await api.delete(f"/v1/memos/{메모['id']}", headers=하늘)

    응답 = await 신고(api, 여울, space_id, "memo", 메모["id"])

    assert 응답.status_code == 404


async def test_한_시간에_너무_많이_신고하면_429다(api, db):
    _, 여울, space_id, _ = await 함께_쓰는_여행(api, db)
    for _ in range(REPORTS_PER_HOUR):
        assert (await 신고(api, 여울, space_id, "other")).status_code == 201

    넘침 = await 신고(api, 여울, space_id, "other")
    한_시간_전으로 = (await db.scalars(select(Report))).all()
    for 줄 in 한_시간_전으로:
        줄.created_at = datetime.now(UTC) - timedelta(hours=1, minutes=1)
    await db.flush()
    다시 = await 신고(api, 여울, space_id, "other")

    assert 넘침.status_code == 429 and 넘침.json()["error"]["code"] == "RATE_LIMITED"
    assert 다시.status_code == 201


# ---------------------------------------------------------------------------
# 차단
# ---------------------------------------------------------------------------


async def test_함께_있는_멤버를_차단하고_목록에서_보고_풀_수_있다(api, db):
    하늘, _, space_id, _ = await 함께_쓰는_여행(api, db)
    여울 = await membership_of(db, space_id, "yeoul@example.com")

    차단 = await api.post("/v1/blocks", json={"userMembershipId": 여울}, headers=하늘)
    또_차단 = await api.post("/v1/blocks", json={"userMembershipId": 여울}, headers=하늘)
    목록 = (await api.get("/v1/blocks", headers=하늘)).json()["data"]
    이_공간_목록 = (await api.get(f"/v1/blocks?spaceId={space_id}", headers=하늘)).json()["data"]
    풀기 = await api.delete(f"/v1/blocks/{여울}", headers=하늘)
    다시_풀기 = await api.delete(f"/v1/blocks/{여울}", headers=하늘)

    assert (차단.status_code, 또_차단.status_code) == (201, 200)
    assert 차단.json()["data"]["membershipId"] == 여울 and 차단.json()["data"]["displayName"] == "다온"
    assert [(줄["membershipId"], 줄["displayName"]) for 줄 in 목록] == [(여울, "다온")]
    assert [줄["membershipId"] for 줄 in 이_공간_목록] == [여울]
    assert (풀기.status_code, 다시_풀기.status_code) == (204, 404)
    assert await db.scalar(select(UserBlock.id)) is None


async def test_다른_공간의_membership으로도_같은_사람의_차단을_풀고_목록은_그_공간_기준으로_준다(api, db):
    하늘, _, space_id, _ = await 함께_쓰는_여행(api, db)
    둘째_공간 = await 공간을_만든다(api, 하늘, "두 번째 공간")
    여울_user = await db.scalar(select(User.id).where(User.email == "yeoul@example.com"))
    db.add(Membership(space_id=uuid.UUID(둘째_공간), user_id=여울_user, role=MembershipRole.EDITOR))
    await db.flush()
    첫째_여울 = await membership_of(db, space_id, "yeoul@example.com")
    둘째_여울 = await membership_of(db, 둘째_공간, "yeoul@example.com")
    await api.post("/v1/blocks", json={"userMembershipId": 첫째_여울}, headers=하늘)

    둘째_기준 = (await api.get(f"/v1/blocks?spaceId={둘째_공간}", headers=하늘)).json()["data"]
    풀기 = await api.delete(f"/v1/blocks/{둘째_여울}", headers=하늘)

    assert [줄["membershipId"] for 줄 in 둘째_기준] == [둘째_여울]
    assert 풀기.status_code == 204


async def test_함께_있지_않은_사람과_나는_차단할_수_없고_남의_공간_기준으로는_목록을_받을_수_없다(api, db):
    하늘, _, space_id, _ = await 함께_쓰는_여행(api, db)
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")
    남의_공간 = await 공간을_만든다(api, 남)
    남의_membership = await membership_of(db, 남의_공간, "stranger@example.com")
    내_membership = await membership_of(db, space_id, "sky@example.com")

    남을_차단 = await api.post("/v1/blocks", json={"userMembershipId": 남의_membership}, headers=하늘)
    나를_차단 = await api.post("/v1/blocks", json={"userMembershipId": 내_membership}, headers=하늘)
    남의_공간_목록 = await api.get(f"/v1/blocks?spaceId={남의_공간}", headers=하늘)

    assert (남을_차단.status_code, 나를_차단.status_code, 남의_공간_목록.status_code) == (404, 422, 404)


async def test_차단한_사람과_차단당한_사람은_서로의_공간에_초대로_들어올_수_없고_있던_공간은_그대로다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com", "하늘")
    함께_쓰던_공간 = await 공간을_만든다(api, 하늘)
    여울 = await 로그인한_사람(api, "yeoul@example.com", "여울")
    await api.post("/v1/invites/accept", json={"token": token_of(await 초대를_만든다(api, 하늘, 함께_쓰던_공간))}, headers=여울)
    await api.post(
        "/v1/blocks", json={"userMembershipId": await membership_of(db, 함께_쓰던_공간, "yeoul@example.com")}, headers=하늘
    )
    하늘의_새_공간 = await 공간을_만든다(api, 하늘, "하늘의 새 공간")
    여울의_새_공간 = await 공간을_만든다(api, 여울, "여울의 새 공간")
    하늘의_초대 = await 초대를_만든다(api, 하늘, 하늘의_새_공간)
    여울의_초대 = await 초대를_만든다(api, 여울, 여울의_새_공간)

    차단당한_사람이_들어옴 = await api.post("/v1/invites/accept", json={"token": token_of(하늘의_초대)}, headers=여울)
    차단한_사람이_들어감 = await api.post("/v1/invites/accept", json={"token": token_of(여울의_초대)}, headers=하늘)

    for 응답 in (차단당한_사람이_들어옴, 차단한_사람이_들어감):
        assert 응답.status_code == 403 and 응답.json()["error"]["code"] == "FORBIDDEN"
        assert "차단" not in 응답.json()["error"]["message"]
    assert (await db.get(SpaceInvite, uuid.UUID(하늘의_초대["id"]))).used_count == 0
    있던_공간 = (await api.get(f"/v1/spaces/{함께_쓰던_공간}/members", headers=여울)).json()["data"]
    assert {줄["displayName"] for 줄 in 있던_공간} == {"하늘", "여울"}

    await api.delete(f"/v1/blocks/{await membership_of(db, 함께_쓰던_공간, 'yeoul@example.com')}", headers=하늘)
    풀고_나서 = await api.post("/v1/invites/accept", json={"token": token_of(하늘의_초대)}, headers=여울)
    assert 풀고_나서.status_code == 200


async def test_계정을_정리하면_차단은_지우고_신고에서_신고자를_끊는다(api, db):
    하늘, 여울, space_id, _ = await 함께_쓰는_여행(api, db)
    await 신고(api, 여울, space_id, "member", await membership_of(db, space_id, "sky@example.com"))
    await api.post("/v1/blocks", json={"userMembershipId": await membership_of(db, space_id, "sky@example.com")}, headers=여울)
    사람 = await db.scalar(select(User).where(User.email == "yeoul@example.com"))
    사람.deletion_requested_at = datetime.now(UTC) - timedelta(days=8)
    사람.deletion_scheduled_at = datetime.now(UTC) - timedelta(days=1)
    await db.flush()

    assert await purge_deleted_accounts(db) == 1

    assert await db.scalar(select(UserBlock.id)) is None
    [줄] = (await db.scalars(select(Report))).all()
    assert 줄.reporter_user_id is None
