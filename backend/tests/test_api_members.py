import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import MAX_MEMBERS_PER_SPACE, Membership, Space, SpaceInvite, User
from tests.test_api_trips import 공간을_만든다, 로그인한_사람

pytestmark = pytest.mark.anyio


async def 초대를_만든다(api, headers, space_id) -> dict:
    응답 = await api.post(f"/v1/spaces/{space_id}/invites", headers=headers)
    assert 응답.status_code == 201, 응답.text
    return 응답.json()["data"]


def token_of(invite: dict) -> str:
    return invite["inviteUrl"].split("token=", 1)[1]


async def 멤버_목록(api, headers, space_id) -> dict[str, dict]:
    응답 = await api.get(f"/v1/spaces/{space_id}/members", headers=headers)
    return {줄["displayName"]: 줄 for 줄 in 응답.json()["data"]}


async def test_초대_링크로_들어오면_editor가_되고_다시_눌러도_한_번만_센다(api, db):
    owner = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, owner)
    invite = await 초대를_만든다(api, owner, space_id)
    손님 = await 로그인한_사람(api, "yeoul@example.com", "여울")

    첫번째 = await api.post("/v1/invites/accept", json={"token": token_of(invite)}, headers=손님)
    두번째 = await api.post("/v1/invites/accept", json={"token": token_of(invite)}, headers=손님)
    목록 = (await api.get(f"/v1/spaces/{space_id}/invites", headers=owner)).json()["data"]

    assert invite["inviteUrl"].startswith("https://api.daymo.xyz/auth/invite?token=")
    assert (invite["maxUses"], invite["usedCount"]) == (10, 0)
    assert 첫번째.status_code == 200 and 첫번째.json()["data"]["alreadyMember"] is False
    assert 두번째.json()["data"]["alreadyMember"] is True
    assert 첫번째.json()["data"]["spaceId"] == space_id
    assert [(줄["usedCount"], "inviteUrl" in 줄) for 줄 in 목록] == [(1, False)]
    assert (await 멤버_목록(api, owner, space_id))["여울"]["role"] == "editor"
    stored = await db.scalar(select(SpaceInvite.token_hash))
    assert token_of(invite) not in stored


async def test_폐기했거나_만료된_링크와_모르는_링크는_들어올_수_없다(api, db):
    owner = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner)
    폐기할 = await 초대를_만든다(api, owner, space_id)
    만료될 = await 초대를_만든다(api, owner, space_id)
    손님 = await 로그인한_사람(api, "yeoul@example.com", "여울")

    await api.delete(f"/v1/spaces/{space_id}/invites/{폐기할['id']}", headers=owner)
    줄 = await db.scalar(select(SpaceInvite).where(SpaceInvite.id == uuid.UUID(만료될["id"])))
    줄.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.flush()

    폐기 = await api.post("/v1/invites/accept", json={"token": token_of(폐기할)}, headers=손님)
    만료 = await api.post("/v1/invites/accept", json={"token": token_of(만료될)}, headers=손님)
    모름 = await api.post("/v1/invites/accept", json={"token": "x" * 43}, headers=손님)

    assert (폐기.status_code, 만료.status_code, 모름.status_code) == (410, 410, 404)
    assert "우리의 여행 공간" not in 폐기.text + 모름.text


async def test_이메일을_확인하지_않았으면_들어올_수_없다(api, db):
    owner = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner)
    invite = await 초대를_만든다(api, owner, space_id)
    손님 = await 로그인한_사람(api, "yeoul@example.com", "여울")
    user = await db.scalar(select(User).where(User.email == "yeoul@example.com"))
    user.email_verified_at = None
    await db.flush()

    응답 = await api.post("/v1/invites/accept", json={"token": token_of(invite)}, headers=손님)

    assert 응답.status_code == 403 and 응답.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"
    assert (await db.get(SpaceInvite, uuid.UUID(invite["id"]))).used_count == 0


async def test_공간이_차면_409이고_사용_횟수를_올리지_않는다(api, db):
    owner = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner)
    invite = await 초대를_만든다(api, owner, space_id)
    for 번호 in range(MAX_MEMBERS_PER_SPACE - 1):
        사용자 = User(email=f"member{번호}@example.com", display_name=f"멤버{번호}", password_hash="x")
        db.add(사용자)
        await db.flush()
        db.add(Membership(space_id=space_id, user_id=사용자.id))
    await db.flush()
    손님 = await 로그인한_사람(api, "late@example.com", "새봄")

    응답 = await api.post("/v1/invites/accept", json={"token": token_of(invite)}, headers=손님)

    assert 응답.status_code == 409 and 응답.json()["error"]["code"] == "SPACE_MEMBER_LIMIT_REACHED"
    assert (await db.get(SpaceInvite, uuid.UUID(invite["id"]))).used_count == 0


async def test_보기만_하는_멤버는_초대를_만들_수_없고_남의_초대는_editor가_못_지운다(api, db):
    owner = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner)
    invite = await 초대를_만든다(api, owner, space_id)
    editor = await 로그인한_사람(api, "yeoul@example.com", "여울")
    await api.post("/v1/invites/accept", json={"token": token_of(invite)}, headers=editor)
    viewer = await 로그인한_사람(api, "viewer@example.com", "새봄")
    await api.post("/v1/invites/accept", json={"token": token_of(invite)}, headers=viewer)
    목록 = await 멤버_목록(api, owner, space_id)
    await api.patch(f"/v1/spaces/{space_id}/members/{목록['새봄']['id']}", json={"role": "viewer"}, headers=owner)

    보기만 = await api.post(f"/v1/spaces/{space_id}/invites", headers=viewer)
    남의_초대 = await api.delete(f"/v1/spaces/{space_id}/invites/{invite['id']}", headers=editor)
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")
    남의_공간 = await api.post(f"/v1/spaces/{space_id}/invites", headers=남)

    assert (보기만.status_code, 남의_초대.status_code, 남의_공간.status_code) == (403, 403, 404)


async def test_owner는_권한을_바꾸고_관리자를_넘기면_editor가_된다(api, db):
    owner = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, owner)
    invite = await 초대를_만든다(api, owner, space_id)
    여울 = await 로그인한_사람(api, "yeoul@example.com", "여울")
    await api.post("/v1/invites/accept", json={"token": token_of(invite)}, headers=여울)
    목록 = await 멤버_목록(api, owner, space_id)

    editor가_바꿈 = await api.patch(f"/v1/spaces/{space_id}/members/{목록['하늘']['id']}", json={"role": "viewer"}, headers=여울)
    나를_바꿈 = await api.patch(f"/v1/spaces/{space_id}/members/{목록['하늘']['id']}", json={"role": "viewer"}, headers=owner)
    넘김 = await api.patch(f"/v1/spaces/{space_id}/members/{목록['여울']['id']}", json={"role": "owner"}, headers=owner)

    assert (editor가_바꿈.status_code, 나를_바꿈.status_code) == (403, 422)
    assert 넘김.json()["data"] == {"id": 목록["여울"]["id"], "role": "owner", "myRole": "editor"}
    새_목록 = await 멤버_목록(api, owner, space_id)
    assert (새_목록["하늘"]["role"], 새_목록["여울"]["role"]) == ("editor", "owner")
    space = await db.get(Space, uuid.UUID(space_id))
    await db.refresh(space)
    assert space.owner_id == await db.scalar(select(User.id).where(User.email == "yeoul@example.com"))


async def test_나가기와_내보내기는_행을_남기고_owner는_넘기기_전에는_못_나간다(api, db):
    owner = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, owner)
    혼자_나감 = await api.delete(
        f"/v1/spaces/{space_id}/members/{(await 멤버_목록(api, owner, space_id))['하늘']['id']}", headers=owner
    )
    invite = await 초대를_만든다(api, owner, space_id)
    여울 = await 로그인한_사람(api, "yeoul@example.com", "여울")
    가람 = await 로그인한_사람(api, "garam@example.com", "가람")
    for headers in (여울, 가람):
        await api.post("/v1/invites/accept", json={"token": token_of(invite)}, headers=headers)
    목록 = await 멤버_목록(api, owner, space_id)

    owner_나감 = await api.delete(f"/v1/spaces/{space_id}/members/{목록['하늘']['id']}", headers=owner)
    editor가_내보냄 = await api.delete(f"/v1/spaces/{space_id}/members/{목록['가람']['id']}", headers=여울)
    여울_나감 = await api.delete(f"/v1/spaces/{space_id}/members/{목록['여울']['id']}", headers=여울)
    가람_내보냄 = await api.delete(f"/v1/spaces/{space_id}/members/{목록['가람']['id']}", headers=owner)
    나간_뒤 = await api.get(f"/v1/spaces/{space_id}/trips", headers=여울)
    다시_들어옴 = await api.post("/v1/invites/accept", json={"token": token_of(invite)}, headers=여울)

    assert 혼자_나감.status_code == 422
    assert owner_나감.status_code == 409 and owner_나감.json()["error"]["code"] == "OWNER_TRANSFER_REQUIRED"
    assert (editor가_내보냄.status_code, 여울_나감.status_code, 가람_내보냄.status_code) == (403, 204, 204)
    assert 나간_뒤.status_code == 404
    assert 다시_들어옴.status_code == 200 and 다시_들어옴.json()["data"]["alreadyMember"] is False
    전체 = (await api.get(f"/v1/spaces/{space_id}/members?includeLeft=true", headers=owner)).json()["data"]
    assert sorted(줄["displayName"] for 줄 in 전체) == ["가람", "여울", "여울", "하늘"]


async def test_초대_페이지는_공간을_드러내지_않고_앱을_연다(client):
    응답 = await client.get("/auth/invite?token=abcDEF123_-abcDEF123")
    잘못 = await client.get("/auth/invite?token=<script>")

    assert 응답.status_code == 200
    assert 'href="daymo://invite?token=abcDEF123_-abcDEF123"' in 응답.text
    assert 응답.headers["referrer-policy"] == "no-referrer"
    assert 잘못.status_code == 400 and "<script>" not in 잘못.text
