from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models import Device, Membership, MembershipRole, RefreshToken, Space, Trip, User, UserStatus
from app.services.account_deletion import DELETED_DISPLAY_NAME, GRACE, purge_deleted_accounts
from app.services.mailer import get_outbox

# 가입 화면의 약관 동의와 만 14세 이상 확인.
동의 = {"agreedTermsVersion": "2026-09-15", "ageConfirmed": True}

pytestmark = pytest.mark.anyio

비밀번호 = "산책하는 오후 7시"


async def 로그인한_사람(api, email: str, name: str = "하늘") -> dict:
    """가입하고 이메일을 확인한 뒤 로그인까지 마친 사람의 세션."""
    await api.post(
        "/v1/auth/signup", json={"email": email, "password": 비밀번호, "displayName": name, **동의}
    )
    토큰 = get_outbox().last.link.split("token=", 1)[1]
    await api.post("/v1/auth/email-verifications/confirm", json={"token": 토큰})
    return await 로그인(api, email)


async def 로그인(api, email: str, 설치: str | None = None) -> dict:
    응답 = await api.post(
        "/v1/auth/login",
        json={
            "email": email,
            "password": 비밀번호,
            "device": {"installationId": 설치 or f"설치-{email}", "platform": "ios"},
        },
    )
    assert 응답.status_code == 200, 응답.text
    세션 = 응답.json()["data"]
    return {**세션, "headers": {"Authorization": f"Bearer {세션['accessToken']}"}}


async def 증표(api, 세션, action="delete_account") -> str:
    응답 = await api.post(
        "/v1/auth/reauth",
        json={"action": action, "password": 비밀번호},
        headers=세션["headers"],
    )
    assert 응답.status_code == 201, 응답.text
    return 응답.json()["data"]["proof"]


async def 삭제_요청(api, 세션, proof):
    return await api.request(
        "DELETE", "/v1/me", json={"reauthProof": proof}, headers=세션["headers"]
    )


async def 공간을_만든다(api, 세션, 이름="우리의 여행 공간") -> str:
    응답 = await api.post("/v1/spaces", json={"name": 이름}, headers=세션["headers"])
    assert 응답.status_code == 201, 응답.text
    return 응답.json()["data"]["id"]


async def 멤버로_넣는다(db, space_id, email, role=MembershipRole.EDITOR):
    user_id = await db.scalar(select(User.id).where(User.email == email))
    db.add(Membership(space_id=space_id, user_id=user_id, role=role))
    await db.flush()


async def 기한을_넘긴다(db, email):
    """정리 작업을 시험하려고 삭제 기한을 방금 지난 시각으로 당긴다."""
    user = await db.scalar(select(User).where(User.email == email))
    user.deletion_scheduled_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.flush()


# ---------------------------------------------------------------------------
# 요청
# ---------------------------------------------------------------------------


async def test_증표_없이는_삭제를_요청할_수_없다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")

    응답 = await 삭제_요청(api, 세션, None)

    assert 응답.status_code == 403
    user = await db.scalar(select(User).where(User.email == "sky@example.com"))
    assert user.deletion_scheduled_at is None


async def test_다른_작업의_증표로는_삭제할_수_없다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    이메일_변경용 = await 증표(api, 세션, action="change_email")

    응답 = await 삭제_요청(api, 세션, 이메일_변경용)

    assert 응답.status_code == 403


async def test_삭제를_요청하면_7일_뒤로_잡힌다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")

    응답 = await 삭제_요청(api, 세션, await 증표(api, 세션))

    assert 응답.status_code == 202, 응답.text
    본문 = 응답.json()["data"]
    요청 = datetime.fromisoformat(본문["requestedAt"])
    기한 = datetime.fromisoformat(본문["scheduledAt"])
    assert 기한 - 요청 == GRACE


async def test_삭제를_요청하면_모든_기기에서_바로_로그아웃된다(api, db):
    폰 = await 로그인한_사람(api, "sky@example.com")
    태블릿 = await 로그인(api, "sky@example.com", 설치="설치-태블릿")

    await 삭제_요청(api, 폰, await 증표(api, 폰))

    # access token 은 아직 만료 전이지만 기기가 끊겨 바로 막힌다.
    assert (await api.get("/v1/me", headers=폰["headers"])).status_code == 401
    assert (await api.get("/v1/me", headers=태블릿["headers"])).status_code == 401
    갱신 = await api.post("/v1/auth/refresh", json={"refreshToken": 태블릿["refreshToken"]})
    assert 갱신.status_code == 401

    user_id = await db.scalar(select(User.id).where(User.email == "sky@example.com"))
    살아_있는_기기 = await db.scalar(
        select(func.count()).select_from(Device).where(
            Device.user_id == user_id, Device.revoked_at.is_(None)
        )
    )
    assert 살아_있는_기기 == 0


async def test_삭제를_요청하면_안내_메일이_나가고_링크는_없다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")

    await 삭제_요청(api, 세션, await 증표(api, 세션))

    편지 = get_outbox().last
    assert 편지.to == "sky@example.com"
    assert "삭제" in 편지.subject
    assert 편지.link is None
    assert "취소" in 편지.body


async def test_다른_멤버가_있는_공간의_관리자는_삭제할_수_없다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 세션, "주말 여행 메이트")
    await 로그인한_사람(api, "daon@example.com", "다온")
    await 멤버로_넣는다(db, space_id, "daon@example.com")
    proof = await 증표(api, 세션)

    응답 = await 삭제_요청(api, 세션, proof)

    assert 응답.status_code == 409
    assert 응답.json()["error"]["code"] == "OWNER_TRANSFER_REQUIRED"
    assert "주말 여행 메이트" in 응답.json()["error"]["message"]

    # 막힌 요청은 증표를 쓰지 않는다. 멤버가 나가면 같은 증표로 다시 할 수 있다.
    멤버 = await db.scalar(
        select(Membership).join(User, User.id == Membership.user_id).where(
            User.email == "daon@example.com"
        )
    )
    멤버.left_at = datetime.now(UTC)
    await db.flush()
    assert (await 삭제_요청(api, 세션, proof)).status_code == 202


async def test_혼자_쓰는_공간은_삭제를_막지_않는다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    await 공간을_만든다(api, 세션)

    assert (await 삭제_요청(api, 세션, await 증표(api, 세션))).status_code == 202


# ---------------------------------------------------------------------------
# 유예 중
# ---------------------------------------------------------------------------


async def test_유예_중에_다시_로그인하면_삭제_예정일이_보인다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    await 삭제_요청(api, 세션, await 증표(api, 세션))

    다시 = await 로그인(api, "sky@example.com")
    나 = (await api.get("/v1/me", headers=다시["headers"])).json()["data"]
    상태 = (await api.get("/v1/me/deletion", headers=다시["headers"])).json()["data"]

    assert 나["deletionScheduledAt"] is not None
    assert 상태["scheduledAt"] == 나["deletionScheduledAt"]


async def test_삭제하지_않은_계정은_예정일이_비어_있다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")

    나 = (await api.get("/v1/me", headers=세션["headers"])).json()["data"]

    assert 나["deletionScheduledAt"] is None


async def test_다시_요청해도_기한이_밀리지_않는다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    처음 = (await 삭제_요청(api, 세션, await 증표(api, 세션))).json()["data"]

    다시 = await 로그인(api, "sky@example.com")
    두번째 = (await 삭제_요청(api, 다시, await 증표(api, 다시))).json()["data"]

    assert 두번째["scheduledAt"] == 처음["scheduledAt"]


async def test_재인증하면_삭제를_취소할_수_있다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    await 삭제_요청(api, 세션, await 증표(api, 세션))
    다시 = await 로그인(api, "sky@example.com")

    응답 = await api.post(
        "/v1/me/deletion/cancel",
        json={"reauthProof": await 증표(api, 다시, action="cancel_deletion")},
        headers=다시["headers"],
    )

    assert 응답.status_code == 200, 응답.text
    assert 응답.json()["data"] == {"requestedAt": None, "scheduledAt": None}
    # 취소한 계정은 기한이 한참 지나도 정리 작업이 건드리지 않는다.
    assert await purge_deleted_accounts(db, now=datetime.now(UTC) + GRACE * 2) == 0


async def test_삭제_증표로는_취소할_수_없다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    await 삭제_요청(api, 세션, await 증표(api, 세션))
    다시 = await 로그인(api, "sky@example.com")

    응답 = await api.post(
        "/v1/me/deletion/cancel",
        json={"reauthProof": await 증표(api, 다시, action="delete_account")},
        headers=다시["headers"],
    )

    assert 응답.status_code == 403


async def test_기한이_지나면_취소할_수_없다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    await 삭제_요청(api, 세션, await 증표(api, 세션))
    다시 = await 로그인(api, "sky@example.com")
    proof = await 증표(api, 다시, action="cancel_deletion")
    await 기한을_넘긴다(db, "sky@example.com")

    응답 = await api.post(
        "/v1/me/deletion/cancel", json={"reauthProof": proof}, headers=다시["headers"]
    )

    assert 응답.status_code == 410


# ---------------------------------------------------------------------------
# 정리 작업
# ---------------------------------------------------------------------------


async def test_기한_전에는_정리하지_않는다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    await 삭제_요청(api, 세션, await 증표(api, 세션))

    assert await purge_deleted_accounts(db) == 0
    user = await db.scalar(select(User).where(User.email == "sky@example.com"))
    assert user.status is UserStatus.ACTIVE


async def test_기한이_지나면_알아볼_수_있는_값을_모두_지운다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    user_id = await db.scalar(select(User.id).where(User.email == "sky@example.com"))
    await 삭제_요청(api, 세션, await 증표(api, 세션))
    await 기한을_넘긴다(db, "sky@example.com")

    assert await purge_deleted_accounts(db) == 1

    user = await db.get(User, user_id)
    await db.refresh(user)
    assert user.status is UserStatus.DELETED
    assert user.deleted_at is not None
    assert "sky" not in user.email
    assert user.password_hash is None
    assert user.display_name == DELETED_DISPLAY_NAME
    for 표 in (Device, RefreshToken):
        assert await db.scalar(select(func.count()).select_from(표).where(표.user_id == user_id)) == 0

    # 로그인할 수 없다. 이메일 자리가 비어 같은 이메일로 새로 가입할 수 있다.
    # (가입을 실제로 다시 해 보면 재전송 간격 제한에 걸린다. 그건 다른 시험의 몫이다.)
    실패 = await api.post(
        "/v1/auth/login",
        json={"email": "sky@example.com", "password": 비밀번호, "device": {"installationId": "새-설치", "platform": "ios"}},
    )
    assert 실패.status_code == 401
    assert await db.scalar(select(func.count()).select_from(User).where(User.email == "sky@example.com")) == 0


async def test_혼자_쓰던_공간과_여행은_함께_지운다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 세션)
    여행 = await api.post(
        f"/v1/spaces/{space_id}/trips",
        json={"title": "가을 제주", "startDate": "2026-10-01", "endDate": "2026-10-03"},
        headers=세션["headers"],
    )
    assert 여행.status_code == 201
    await 삭제_요청(api, 세션, await 증표(api, 세션))
    await 기한을_넘긴다(db, "sky@example.com")

    await purge_deleted_accounts(db)

    assert await db.scalar(select(func.count()).select_from(Space).where(Space.id == space_id)) == 0
    assert await db.scalar(select(func.count()).select_from(Trip).where(Trip.space_id == space_id)) == 0


async def test_다른_사람_공간의_기록은_남고_나간_멤버가_된다(api, db):
    주인 = await 로그인한_사람(api, "daon@example.com", "다온")
    space_id = await 공간을_만든다(api, 주인)
    세션 = await 로그인한_사람(api, "sky@example.com")
    await 멤버로_넣는다(db, space_id, "sky@example.com")
    await 삭제_요청(api, 세션, await 증표(api, 세션))
    await 기한을_넘긴다(db, "sky@example.com")

    await purge_deleted_accounts(db)

    assert await db.scalar(select(func.count()).select_from(Space).where(Space.id == space_id)) == 1
    멤버들 = (await api.get(f"/v1/spaces/{space_id}/members", headers=주인["headers"])).json()["data"]
    assert [멤버["displayName"] for 멤버 in 멤버들] == ["다온"]
    남은_줄 = await db.scalar(
        select(Membership).where(Membership.space_id == space_id, Membership.role == MembershipRole.EDITOR)
    )
    assert 남은_줄 is not None and 남은_줄.left_at is not None


async def test_유예_중에_멤버를_들인_관리자는_정리를_미룬다(api, db):
    세션 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 세션)
    await 삭제_요청(api, 세션, await 증표(api, 세션))
    await 로그인한_사람(api, "daon@example.com", "다온")
    await 멤버로_넣는다(db, space_id, "daon@example.com")
    await 기한을_넘긴다(db, "sky@example.com")

    assert await purge_deleted_accounts(db) == 0
    assert await db.scalar(select(func.count()).select_from(Space).where(Space.id == space_id)) == 1


async def test_유예_중인_공간에_다른_멤버가_있으면_계정_정리가_그_공간을_지우지_않는다(api, db):
    """
    owner 가 공간을 지우고(7일) 바로 계정 삭제를 요청하면 계정 기한이 먼저 온다.
    그때 공간까지 함께 지우면 상대의 여행·사진이 약속한 7일을 다 채우기 전에 사라진다.
    공간은 제 기한에 `purge_deleted_spaces` 가 지운다.
    """
    세션 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 세션, "주말 여행 메이트")
    여행 = await api.post(
        f"/v1/spaces/{space_id}/trips",
        json={"title": "가을 제주", "startDate": "2026-10-01", "endDate": "2026-10-03"},
        headers=세션["headers"],
    )
    assert 여행.status_code == 201
    await 로그인한_사람(api, "daon@example.com", "다온")
    await 멤버로_넣는다(db, space_id, "daon@example.com")

    지움 = await api.request(
        "DELETE",
        f"/v1/spaces/{space_id}",
        json={"confirmationName": "주말 여행 메이트", "impactAcknowledged": True},
        headers=세션["headers"],
    )
    assert 지움.status_code == 202, 지움.text

    # 이미 지운 공간은 계정 삭제를 막지 않는다. 앱에서 사라진 공간을 들며 관리자를
    # 넘기라고 할 수는 없다.
    assert (await 삭제_요청(api, 세션, await 증표(api, 세션))).status_code == 202
    await 기한을_넘긴다(db, "sky@example.com")

    assert await purge_deleted_accounts(db) == 1

    남은_공간 = await db.scalar(select(Space).where(Space.id == space_id))
    assert 남은_공간 is not None and 남은_공간.deleted_at is not None
    assert 남은_공간.deletion_scheduled_at > datetime.now(UTC)
    assert await db.scalar(select(func.count()).select_from(Trip).where(Trip.space_id == space_id)) == 1


async def test_유예_중이고_혼자_쓰던_공간은_계정과_함께_지운다(api, db):
    """상대가 없으면 기다릴 이유가 없다. 지금까지처럼 계정과 함께 지운다."""
    세션 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 세션, "혼자 쓰는 공간")
    지움 = await api.request(
        "DELETE",
        f"/v1/spaces/{space_id}",
        json={"confirmationName": "혼자 쓰는 공간", "impactAcknowledged": True},
        headers=세션["headers"],
    )
    assert 지움.status_code == 202, 지움.text
    await 삭제_요청(api, 세션, await 증표(api, 세션))
    await 기한을_넘긴다(db, "sky@example.com")

    assert await purge_deleted_accounts(db) == 1
    assert await db.scalar(select(func.count()).select_from(Space).where(Space.id == space_id)) == 0
