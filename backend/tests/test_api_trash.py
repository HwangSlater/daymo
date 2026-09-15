import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.models import AuditLog, MembershipRole, Memo, Photo
from tests.test_api_expenses import membership_of
from tests.test_api_photos import jpeg, 사진을_올린다
from tests.test_api_places import 멤버로_넣는다, 여행_하나
from tests.test_api_trips import 로그인한_사람

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def 사진_폴더(tmp_path, monkeypatch):
    """test_api_photos.py 와 같다. 테스트마다 빈 폴더에 올린다."""
    monkeypatch.setattr(get_settings(), "upload_root", str(tmp_path))
    return tmp_path


async def 감사_기록(db, space_id) -> list[tuple[str, str | None, dict | None]]:
    """
    테스트는 한 transaction 안에서 돌아 `created_at` 이 모두 같다. 그래서 순서 대신
    행동 이름과 대상으로 정렬해 비교한다.
    """
    줄들 = await db.execute(
        select(AuditLog.action, AuditLog.target_id, AuditLog.log_metadata).where(
            AuditLog.space_id == uuid.UUID(str(space_id))
        )
    )
    return sorted(
        ((action, str(target_id) if target_id else None, metadata) for action, target_id, metadata in 줄들),
        key=lambda 줄: (줄[0], 줄[1] or ""),
    )


def _시각(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


# ---------------------------------------------------------------------------
# 메모
# ---------------------------------------------------------------------------


async def test_지운_메모는_휴지통에_미리보기와_기한이_보이고_editor가_되살린다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    editor = await 멤버로_넣는다(api, db, space_id, "yeoul@example.com", MembershipRole.EDITOR)
    여울 = await membership_of(db, space_id, "yeoul@example.com")
    본문 = "체크인 전에 장보기\n  그리고 우산도 챙기고 버스 시간표도 한 번 더 보고 가자 꼭"
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": 본문}, headers=headers)).json()["data"]
    await api.delete(f"/v1/memos/{메모['id']}", headers=editor)

    휴지통 = await api.get(f"/v1/trips/{trip['id']}/trash", headers=headers)
    되살림 = await api.post(f"/v1/trash/memo/{메모['id']}/restore", headers=editor)
    목록 = (await api.get(f"/v1/trips/{trip['id']}/memos", headers=headers)).json()["data"]
    빈_휴지통 = (await api.get(f"/v1/trips/{trip['id']}/trash", headers=headers)).json()["data"]
    다시 = await api.post(f"/v1/trash/memo/{메모['id']}/restore", headers=editor)

    assert 휴지통.status_code == 200, 휴지통.text
    [줄] = 휴지통.json()["data"]
    assert (줄["id"], 줄["type"], 줄["deletedByMembershipId"], 줄["deletedByName"], 줄["canRestore"]) == (
        메모["id"], "memo", 여울, "다온", True,
    )
    # 줄바꿈과 겹친 공백은 한 칸이 되고 40자에서 자른 뒤 끝 공백을 뗀다.
    assert 줄["preview"] == "체크인 전에 장보기 그리고 우산도 챙기고 버스 시간표도 한 번 더 보고"
    assert _시각(줄["restoreDeadline"]) - _시각(줄["deletedAt"]) == timedelta(days=7)

    assert 되살림.status_code == 200, 되살림.text
    assert (되살림.json()["data"]["body"], 되살림.json()["data"]["version"]) == (본문.strip(), 3)
    assert [item["id"] for item in 목록] == [메모["id"]]
    assert 빈_휴지통 == []
    assert 다시.status_code == 200 and 다시.json()["data"]["version"] == 3

    줄 = await db.get(Memo, uuid.UUID(메모["id"]))
    await db.refresh(줄)
    assert (줄.deleted_at, 줄.deleted_by) == (None, None)
    기록 = await 감사_기록(db, space_id)
    assert [(action, target) for action, target, _ in 기록] == [("memo.delete", 메모["id"]), ("memo.restore", 메모["id"])]
    # 감사 기록에는 글을 남기지 않는다.
    assert all("장보기" not in str(metadata) for _, _, metadata in 기록)


async def test_지운_지_7일이_지난_메모는_휴지통에_없고_되살리면_410이다(api, db):
    headers, _, trip = await 여행_하나(api)
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "오래된 메모"}, headers=headers)).json()["data"]
    await api.delete(f"/v1/memos/{메모['id']}", headers=headers)
    줄 = await db.get(Memo, uuid.UUID(메모["id"]))
    줄.deleted_at = datetime.now(UTC) - timedelta(days=7, minutes=1)
    await db.flush()

    휴지통 = (await api.get(f"/v1/trips/{trip['id']}/trash", headers=headers)).json()["data"]
    되살림 = await api.post(f"/v1/trash/memo/{메모['id']}/restore", headers=headers)

    assert 휴지통 == []
    assert 되살림.status_code == 410


async def test_보기만_하는_멤버는_휴지통을_못_보고_남은_404다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    viewer = await 멤버로_넣는다(api, db, space_id, "viewer@example.com", MembershipRole.VIEWER)
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "x"}, headers=headers)).json()["data"]
    await api.delete(f"/v1/memos/{메모['id']}", headers=headers)

    보기만_목록 = await api.get(f"/v1/trips/{trip['id']}/trash", headers=viewer)
    보기만_되살림 = await api.post(f"/v1/trash/memo/{메모['id']}/restore", headers=viewer)
    남의_목록 = await api.get(f"/v1/trips/{trip['id']}/trash", headers=남)
    남의_되살림 = await api.post(f"/v1/trash/memo/{메모['id']}/restore", headers=남)
    모르는_종류 = await api.post(f"/v1/trash/diary/{메모['id']}/restore", headers=headers)
    엉뚱한_종류 = await api.post(f"/v1/trash/photo/{메모['id']}/restore", headers=headers)

    assert (보기만_목록.status_code, 보기만_되살림.status_code) == (403, 403)
    assert (남의_목록.status_code, 남의_되살림.status_code) == (404, 404)
    assert 모르는_종류.status_code == 422
    assert 엉뚱한_종류.status_code == 404


# ---------------------------------------------------------------------------
# 사진
# ---------------------------------------------------------------------------


async def test_지운_사진은_올린_사람과_owner만_되살린다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    editor = await 멤버로_넣는다(api, db, space_id, "editor@example.com", MembershipRole.EDITOR)
    _, 내_사진 = await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300), caption="전주 한옥마을")
    _, 남의_사진 = await 사진을_올린다(api, editor, trip["id"], jpeg(410, 300))
    내_id, 남의_id = 내_사진.json()["data"]["id"], 남의_사진.json()["data"]["id"]
    await api.delete(f"/v1/photos/{내_id}", headers=headers)
    await api.delete(f"/v1/photos/{남의_id}", headers=editor)

    editor의_휴지통 = (await api.get(f"/v1/trips/{trip['id']}/trash", headers=editor)).json()["data"]
    editor가_남의_것 = await api.post(f"/v1/trash/photo/{내_id}/restore", headers=editor)
    editor가_자기_것 = await api.post(f"/v1/trash/photo/{남의_id}/restore", headers=editor)
    owner가_되살림 = await api.post(f"/v1/trash/photo/{내_id}/restore", headers=headers)
    목록 = (await api.get(f"/v1/trips/{trip['id']}/photos", headers=headers)).json()["data"]
    내용 = await api.get(f"/v1/photos/{내_id}/content?variant=thumbnail", headers=headers)

    줄들 = {줄["id"]: 줄 for 줄 in editor의_휴지통}
    assert (줄들[내_id]["type"], 줄들[내_id]["preview"], 줄들[내_id]["canRestore"]) == ("photo", "전주 한옥마을", False)
    assert 줄들[남의_id]["canRestore"] is True
    assert editor가_남의_것.status_code == 403
    assert editor가_자기_것.status_code == 200 and editor가_자기_것.json()["data"]["version"] == 3
    assert owner가_되살림.status_code == 200
    assert {item["id"] for item in 목록} == {내_id, 남의_id}
    assert 내용.status_code == 200

    기록 = [(action, target) for action, target, _ in await 감사_기록(db, space_id)]
    assert 기록 == sorted([("photo.delete", 내_id), ("photo.delete", 남의_id), ("photo.restore", 남의_id), ("photo.restore", 내_id)])


async def test_지운_지_7일이_지난_사진은_정리_전이라도_410이다(api, db):
    headers, _, trip = await 여행_하나(api)
    _, 올림 = await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300))
    photo_id = 올림.json()["data"]["id"]
    await api.delete(f"/v1/photos/{photo_id}", headers=headers)
    줄 = await db.get(Photo, uuid.UUID(photo_id))
    줄.deleted_at = datetime.now(UTC) - timedelta(days=8)
    await db.flush()

    휴지통 = (await api.get(f"/v1/trips/{trip['id']}/trash", headers=headers)).json()["data"]
    되살림 = await api.post(f"/v1/trash/photo/{photo_id}/restore", headers=headers)

    assert 휴지통 == []
    assert 되살림.status_code == 410


# ---------------------------------------------------------------------------
# 다른 감사 기록
# ---------------------------------------------------------------------------


async def test_되돌린_정산_기록과_멤버_초대_여행_변경이_감사_기록에_남는다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    여울_headers = await 멤버로_넣는다(api, db, space_id, "yeoul@example.com", MembershipRole.EDITOR)
    await 멤버로_넣는다(api, db, space_id, "saebom@example.com", MembershipRole.EDITOR)
    나 = await membership_of(db, space_id, "sky@example.com")
    여울 = await membership_of(db, space_id, "yeoul@example.com")
    새봄 = await membership_of(db, space_id, "saebom@example.com")

    기록 = (
        await api.post(f"/v1/trips/{trip['id']}/payments", json={"fromMembershipId": 여울, "toMembershipId": 나, "amount": 22500}, headers=headers)
    ).json()["data"]
    await api.delete(f"/v1/payments/{기록['id']}", headers=headers)
    await api.delete(f"/v1/payments/{기록['id']}", headers=headers)
    초대 = (await api.post(f"/v1/spaces/{space_id}/invites", headers=headers)).json()["data"]
    await api.delete(f"/v1/spaces/{space_id}/invites/{초대['id']}", headers=headers)
    await api.delete(f"/v1/spaces/{space_id}/invites/{초대['id']}", headers=headers)
    await api.patch(f"/v1/spaces/{space_id}/members/{새봄}", json={"role": "viewer"}, headers=headers)
    await api.delete(f"/v1/spaces/{space_id}/members/{새봄}", headers=headers)
    await api.delete(f"/v1/spaces/{space_id}/members/{여울}", headers=여울_headers)
    await api.delete(f"/v1/trips/{trip['id']}", headers=headers)
    await api.post(f"/v1/trips/{trip['id']}/restore", headers=headers)
    await api.post(f"/v1/trips/{trip['id']}/restore", headers=headers)

    남은_것 = await 감사_기록(db, space_id)
    # 이미 되돌린 기록·폐기한 초대·지우지 않은 여행을 다시 보내면 적지 않는다.
    assert [(action, target) for action, target, _ in 남은_것] == sorted([
        ("payment.undo", 기록["id"]),
        ("invite.revoke", 초대["id"]),
        ("member.role_change", 새봄),
        ("member.remove", 새봄),
        ("member.leave", 여울),
        ("trip.delete", trip["id"]),
        ("trip.restore", trip["id"]),
    ])
    assert {action: metadata for action, _, metadata in 남은_것}["member.role_change"] == {"role": "viewer"}
