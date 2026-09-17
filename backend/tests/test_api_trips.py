from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models import MembershipRole, Trip, TripDay, TripParticipant
from app.services.trips import MAX_TRIP_DAYS, purge_deleted_trips

# 가입 화면의 약관 동의와 만 14세 이상 확인.
동의 = {"agreedTermsVersion": "2026-09-15", "ageConfirmed": True}

pytestmark = pytest.mark.anyio

비밀번호 = "산책하는 오후 7시"


async def 로그인한_사람(api, email: str, name: str = "하늘") -> dict:
    """가입하고 이메일을 확인한 뒤 로그인까지 마친 사람의 토큰."""
    from app.services.mailer import get_outbox

    await api.post(
        "/v1/auth/signup",
        json={"email": email, "password": 비밀번호, "displayName": name, **동의},
    )
    토큰 = get_outbox().last.link.split("token=", 1)[1]
    await api.post("/v1/auth/email-verifications/confirm", json={"token": 토큰})
    응답 = await api.post(
        "/v1/auth/login",
        json={
            "email": email,
            "password": 비밀번호,
            "device": {"installationId": f"설치-{email}", "platform": "ios"},
        },
    )
    세션 = 응답.json()["data"]
    return {"Authorization": f"Bearer {세션['accessToken']}"}


async def 공간을_만든다(api, headers, 이름="우리의 여행 공간") -> str:
    응답 = await api.post("/v1/spaces", json={"name": 이름}, headers=headers)
    assert 응답.status_code == 201, 응답.text
    return 응답.json()["data"]["id"]


async def 여행을_만든다(api, headers, space_id, **값) -> dict:
    본문 = {
        "title": "가을 제주",
        "startDate": "2026-10-01",
        "endDate": "2026-10-03",
        **값,
    }
    응답 = await api.post(f"/v1/spaces/{space_id}/trips", json=본문, headers=headers)
    assert 응답.status_code == 201, 응답.text
    return 응답.json()["data"]


# ---------------------------------------------------------------------------
# 공간
# ---------------------------------------------------------------------------


async def test_공간을_만들면_내가_owner가_된다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")

    응답 = await api.post("/v1/spaces", json={"name": "우리의 여행 공간"}, headers=headers)

    assert 응답.json()["data"]["myRole"] == "owner"


async def test_내_공간만_보인다(api, db):
    내_headers = await 로그인한_사람(api, "sky@example.com")
    남_headers = await 로그인한_사람(api, "other@example.com", "다온")
    await 공간을_만든다(api, 내_headers, "내 공간")
    await 공간을_만든다(api, 남_headers, "남의 공간")

    응답 = await api.get("/v1/spaces", headers=내_headers)

    이름들 = [줄["name"] for 줄 in 응답.json()["data"]]
    assert 이름들 == ["내 공간"]


async def test_로그인하지_않으면_공간을_만들_수_없다(api, db):
    응답 = await api.post("/v1/spaces", json={"name": "공간"})

    assert 응답.status_code == 401


async def test_공간_관계와_시작일을_수정하고_목록에서_다시_본다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)

    수정 = await api.patch(
        f"/v1/spaces/{space_id}",
        json={"name": "둘의 여행", "relationshipType": "couple", "startedOn": "2024-05-18"},
        headers=headers,
    )
    목록 = await api.get("/v1/spaces", headers=headers)

    assert 수정.status_code == 200
    assert 수정.json()["data"]["startedOn"] == "2024-05-18"
    assert 목록.json()["data"][0]["name"] == "둘의 여행"
    assert 목록.json()["data"][0]["relationshipType"] == "couple"
    assert 목록.json()["data"][0]["startedOn"] == "2024-05-18"


async def test_공간_멤버는_표시_이름과_내_여부를_돌려준다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, headers)

    응답 = await api.get(f"/v1/spaces/{space_id}/members", headers=headers)

    assert 응답.status_code == 200
    assert 응답.json()["data"] == [
        {
            "id": 응답.json()["data"][0]["id"],
            "displayName": "하늘",
            "role": "owner",
            "isMe": True,
        }
    ]


async def test_앱이_보내는_모양으로_공간을_고친다(api, db):
    """
    앱은 바꾼 칸만 보낸다. 이름만 고치면 관계와 함께한 날을 보내지 않고,
    그 둘은 그대로 남아야 한다. 함께한 날을 지우면 null 을 보낸다.
    """
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    await api.patch(
        f"/v1/spaces/{space_id}",
        json={"relationshipType": "family", "startedOn": "2024-05-18"},
        headers=headers,
    )

    이름만 = await api.patch(f"/v1/spaces/{space_id}", json={"name": "가족 나들이"}, headers=headers)

    assert 이름만.json()["data"]["relationshipType"] == "family"
    assert 이름만.json()["data"]["startedOn"] == "2024-05-18"

    지움 = await api.patch(f"/v1/spaces/{space_id}", json={"startedOn": None}, headers=headers)

    assert 지움.status_code == 200
    assert 지움.json()["data"]["startedOn"] is None
    assert 지움.json()["data"]["name"] == "가족 나들이"


async def test_editor는_공간_정보를_수정할_수_없다(api, db):
    """앱은 관리자에게만 칸을 연다. 서버도 같은 선을 지켜야 앱을 우회해도 막힌다."""
    owner_headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner_headers)
    editor_headers = await 로그인한_사람(api, "editor@example.com", "다온")

    from app.models import Membership, User

    user_id = await db.scalar(select(User.id).where(User.email == "editor@example.com"))
    db.add(Membership(space_id=space_id, user_id=user_id, role=MembershipRole.EDITOR))
    await db.flush()

    응답 = await api.patch(
        f"/v1/spaces/{space_id}", json={"name": "마음대로"}, headers=editor_headers
    )

    assert 응답.status_code == 403


async def test_멤버_목록에_editor와_viewer가_권한과_함께_나온다(api, db):
    owner_headers = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, owner_headers)
    await 로그인한_사람(api, "editor@example.com", "다온")

    from app.models import Membership, User

    user_id = await db.scalar(select(User.id).where(User.email == "editor@example.com"))
    db.add(Membership(space_id=space_id, user_id=user_id, role=MembershipRole.EDITOR))
    await db.flush()

    응답 = await api.get(f"/v1/spaces/{space_id}/members", headers=owner_headers)

    줄들 = {줄["displayName"]: 줄 for 줄 in 응답.json()["data"]}
    assert 줄들["하늘"]["role"] == "owner" and 줄들["하늘"]["isMe"] is True
    assert 줄들["다온"]["role"] == "editor" and 줄들["다온"]["isMe"] is False


async def test_viewer는_공간_정보를_수정할_수_없다(api, db):
    owner_headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner_headers)
    viewer_headers = await 로그인한_사람(api, "viewer@example.com", "새봄")

    from app.models import Membership, User

    user_id = await db.scalar(select(User.id).where(User.email == "viewer@example.com"))
    db.add(Membership(space_id=space_id, user_id=user_id, role=MembershipRole.VIEWER))
    await db.flush()

    응답 = await api.patch(
        f"/v1/spaces/{space_id}", json={"name": "마음대로"}, headers=viewer_headers
    )

    assert 응답.status_code == 403


# ---------------------------------------------------------------------------
# 여행 만들기
# ---------------------------------------------------------------------------


async def test_여행을_만들면_날도_함께_생긴다(api, db):
    """
    날을 따로 만들면 여행만 있고 날이 없는 상태가 생긴다. 그 여행은 일정을
    담을 곳이 없어서 화면에서 아무것도 할 수 없다.
    """
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)

    trip = await 여행을_만든다(api, headers, space_id)

    날_수 = await db.scalar(
        select(func.count()).select_from(TripDay).where(TripDay.trip_id == trip["id"])
    )
    assert 날_수 == 3
    일차들 = (
        await db.execute(
            select(TripDay.day_index).where(TripDay.trip_id == trip["id"]).order_by(TripDay.day_index)
        )
    ).scalars().all()
    assert 일차들 == [1, 2, 3]


async def test_당일치기도_만들_수_있다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)

    trip = await 여행을_만든다(api, headers, space_id, endDate="2026-10-01")

    assert await db.scalar(
        select(func.count()).select_from(TripDay).where(TripDay.trip_id == trip["id"])
    ) == 1


async def test_끝나는_날이_앞서면_거부한다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)

    응답 = await api.post(
        f"/v1/spaces/{space_id}/trips",
        json={"title": "거꾸로", "startDate": "2026-10-03", "endDate": "2026-10-01"},
        headers=headers,
    )

    assert 응답.status_code == 422


async def test_너무_긴_여행은_거부한다(api, db):
    """
    기간마다 날을 한 줄씩 만든다. 상한이 없으면 요청 하나로 수만 줄이 들어간다.
    """
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    시작 = date(2026, 10, 1)

    응답 = await api.post(
        f"/v1/spaces/{space_id}/trips",
        json={
            "title": "너무 긴 여행",
            "startDate": 시작.isoformat(),
            "endDate": (시작 + timedelta(days=MAX_TRIP_DAYS)).isoformat(),
        },
        headers=headers,
    )

    assert 응답.status_code == 422
    assert "60일" in 응답.text


async def test_만들기에_실패하면_날도_남지_않는다(api, db):
    """한 요청이 절반만 반영되면 안 된다."""
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)

    await api.post(
        f"/v1/spaces/{space_id}/trips",
        json={"title": "거꾸로", "startDate": "2026-10-03", "endDate": "2026-10-01"},
        headers=headers,
    )

    assert await db.scalar(select(func.count()).select_from(Trip)) == 0
    assert await db.scalar(select(func.count()).select_from(TripDay)) == 0


# ---------------------------------------------------------------------------
# 권한
# ---------------------------------------------------------------------------


async def test_남의_공간에는_여행을_만들_수_없고_404다(api, db):
    """
    403 을 주면 그 id 가 존재한다는 뜻이 된다. 남의 공간 id 를 찍어 볼 수 있다.
    """
    남_headers = await 로그인한_사람(api, "other@example.com", "다온")
    남의_공간 = await 공간을_만든다(api, 남_headers)
    내_headers = await 로그인한_사람(api, "sky@example.com")

    응답 = await api.post(
        f"/v1/spaces/{남의_공간}/trips",
        json={"title": "몰래", "startDate": "2026-10-01", "endDate": "2026-10-02"},
        headers=내_headers,
    )

    assert 응답.status_code == 404


async def test_남의_여행은_보이지_않고_404다(api, db):
    남_headers = await 로그인한_사람(api, "other@example.com", "다온")
    남의_공간 = await 공간을_만든다(api, 남_headers)
    남의_여행 = await 여행을_만든다(api, 남_headers, 남의_공간)
    내_headers = await 로그인한_사람(api, "sky@example.com")

    응답 = await api.get(f"/v1/trips/{남의_여행['id']}", headers=내_headers)

    assert 응답.status_code == 404


async def test_viewer는_여행을_만들_수_없다(api, db):
    """멤버이므로 403 이다. 그 공간에 무엇이 있는지는 이미 보인다."""
    owner_headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner_headers)
    보는_사람_headers = await 로그인한_사람(api, "viewer@example.com", "새봄")

    # 멤버로 넣되 보기만 권한을 준다.
    from app.models import Membership, User

    user_id = await db.scalar(select(User.id).where(User.email == "viewer@example.com"))
    db.add(
        Membership(space_id=space_id, user_id=user_id, role=MembershipRole.VIEWER)
    )
    await db.flush()

    응답 = await api.post(
        f"/v1/spaces/{space_id}/trips",
        json={"title": "몰래", "startDate": "2026-10-01", "endDate": "2026-10-02"},
        headers=보는_사람_headers,
    )

    assert 응답.status_code == 403


async def test_viewer도_볼_수는_있다(api, db):
    owner_headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner_headers)
    trip = await 여행을_만든다(api, owner_headers, space_id)
    보는_사람_headers = await 로그인한_사람(api, "viewer@example.com", "새봄")

    from app.models import Membership, User

    user_id = await db.scalar(select(User.id).where(User.email == "viewer@example.com"))
    db.add(Membership(space_id=space_id, user_id=user_id, role=MembershipRole.VIEWER))
    await db.flush()

    응답 = await api.get(f"/v1/trips/{trip['id']}", headers=보는_사람_headers)

    assert 응답.status_code == 200


# ---------------------------------------------------------------------------
# 수정과 동시 편집
# ---------------------------------------------------------------------------


async def test_수정하면_version이_오른다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    응답 = await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": trip["version"], "title": "고친 제목"},
        headers=headers,
    )

    assert 응답.json()["data"]["title"] == "고친 제목"
    assert 응답.json()["data"]["version"] == trip["version"] + 1


async def test_홈_카드_대표_사진은_그_여행의_사진만_되고_해제도_된다(api, db):
    from tests.test_api_photos import jpeg, 사진을_올린다

    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    다른_여행 = (
        await api.post(
            f"/v1/spaces/{space_id}/trips",
            json={"title": "다른 여행", "startDate": "2026-11-01", "endDate": "2026-11-02"},
            headers=headers,
        )
    ).json()["data"]
    사진 = (await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300)))[0].json()["data"]["id"]
    남의_사진 = (await 사진을_올린다(api, headers, 다른_여행["id"], jpeg(400, 300)))[0].json()["data"]["id"]
    assert trip["coverPhotoId"] is None

    고름 = await api.patch(
        f"/v1/trips/{trip['id']}", json={"version": trip["version"], "coverPhotoId": 사진}, headers=headers
    )
    남의_것 = await api.patch(
        f"/v1/trips/{trip['id']}", json={"version": 고름.json()["data"]["version"], "coverPhotoId": 남의_사진}, headers=headers
    )
    해제 = await api.patch(
        f"/v1/trips/{trip['id']}", json={"version": 고름.json()["data"]["version"], "coverPhotoId": None}, headers=headers
    )

    assert 고름.json()["data"]["coverPhotoId"] == 사진
    assert 고름.json()["data"]["coverPhotoIds"] == [사진]
    assert 남의_것.status_code == 422
    assert 해제.json()["data"]["coverPhotoId"] is None
    assert 해제.json()["data"]["coverPhotoIds"] == []


async def test_홈_카드는_사진_한_장이거나_기념_카드_하나고_둘이_서로_해제된다(api, db):
    """홈 화면의 여행 카드는 여행마다 하나다. 사진과 카드가 함께 깔리면 무엇이 보일지 알 수 없다."""
    from tests.test_api_photos import jpeg, 사진을_올린다
    from tests.test_api_trip_cards import 카드를_만든다

    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    다른_여행 = (
        await api.post(
            f"/v1/spaces/{space_id}/trips",
            json={"title": "다른 여행", "startDate": "2026-11-01", "endDate": "2026-11-02"},
            headers=headers,
        )
    ).json()["data"]
    사진들 = [
        (await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300)))[0].json()["data"]["id"]
        for _ in range(2)
    ]
    카드 = await 카드를_만든다(api, headers, trip["id"], style="네컷 격자", photoIds=사진들)
    남의_카드 = await 카드를_만든다(api, headers, 다른_여행["id"], style="필름")

    사진_먼저 = await api.patch(
        f"/v1/trips/{trip['id']}", json={"version": trip["version"], "coverPhotoId": 사진들[0]}, headers=headers
    )
    카드로 = await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": 사진_먼저.json()["data"]["version"], "coverCardId": 카드["id"]},
        headers=headers,
    )
    남의_것 = await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": 카드로.json()["data"]["version"], "coverCardId": 남의_카드["id"]},
        headers=headers,
    )
    둘_다 = await api.patch(
        f"/v1/trips/{trip['id']}",
        json={
            "version": 카드로.json()["data"]["version"],
            "coverCardId": 카드["id"],
            "coverPhotoId": 사진들[0],
        },
        headers=headers,
    )
    다시_사진 = await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": 카드로.json()["data"]["version"], "coverPhotoId": 사진들[1]},
        headers=headers,
    )

    # 카드를 고르면 그 카드의 사진이 고른 차례대로, 틀 이름과 함께 나온다.
    assert 카드로.json()["data"]["coverCardId"] == 카드["id"]
    assert 카드로.json()["data"]["coverPhotoId"] is None
    assert 카드로.json()["data"]["coverPhotoIds"] == 사진들
    assert 카드로.json()["data"]["coverCardStyle"] == "네컷 격자"
    assert 남의_것.status_code == 422
    assert 둘_다.status_code == 422
    # 사진 한 장을 고르면 카드 쪽이 풀린다.
    assert 다시_사진.json()["data"]["coverCardId"] is None
    assert 다시_사진.json()["data"]["coverPhotoIds"] == [사진들[1]]


async def test_홈에_깐_카드를_지우면_여행은_남고_홈만_비워진다(api, db):
    from tests.test_api_photos import jpeg, 사진을_올린다
    from tests.test_api_trip_cards import 카드를_만든다

    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    사진 = (await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300)))[0].json()["data"]["id"]
    카드 = await 카드를_만든다(api, headers, trip["id"], style="필름", photoIds=[사진])
    깔았다 = await api.patch(
        f"/v1/trips/{trip['id']}", json={"version": trip["version"], "coverCardId": 카드["id"]}, headers=headers
    )
    assert 깔았다.json()["data"]["coverCardId"] == 카드["id"]

    await api.delete(f"/v1/trip-cards/{카드['id']}", headers=headers)
    남은_것 = await api.get(f"/v1/trips/{trip['id']}", headers=headers)

    assert 남은_것.status_code == 200
    assert 남은_것.json()["data"]["coverCardId"] is None
    assert 남은_것.json()["data"]["coverPhotoIds"] == []


async def test_먼저_고친_사람이_있으면_막는다(api, db):
    """
    마지막에 저장한 쪽이 앞사람의 수정을 조용히 덮어쓰면, 무엇이 사라졌는지
    아무도 모른다.
    """
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": trip["version"], "title": "먼저 고침"},
        headers=headers,
    )

    응답 = await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": trip["version"], "title": "나중에 고침"},
        headers=headers,
    )

    assert 응답.status_code == 409
    assert 응답.json()["error"]["code"] == "VERSION_CONFLICT"


async def test_version을_안_보내면_거절한다(api, db):
    """
    version 이 없으면 먼저 고친 사람이 있는지 볼 수가 없다. 그대로 받아 주면
    안 보내는 것만으로 남의 수정을 덮을 수 있다. 장소·일정·지출과 같이 필수다.
    """
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    응답 = await api.patch(
        f"/v1/trips/{trip['id']}", json={"title": "그냥 고침"}, headers=headers
    )

    assert 응답.status_code == 422
    assert 응답.json()["error"]["fields"]["version"] == "꼭 입력해야 하는 값이에요."

    그대로 = await api.get(f"/v1/trips/{trip['id']}", headers=headers)
    assert 그대로.json()["data"]["title"] == trip["title"]


async def test_기간을_늘려도_규칙이_걸린다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    응답 = await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": trip["version"], "endDate": "2026-09-01"},
        headers=headers,
    )

    assert 응답.status_code == 422


# ---------------------------------------------------------------------------
# 참가자
# ---------------------------------------------------------------------------


async def test_참가자를_정할_수_있다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    from app.models import Membership

    내_membership = await db.scalar(
        select(Membership.id).where(Membership.space_id == space_id)
    )
    응답 = await api.put(
        f"/v1/trips/{trip['id']}/participants",
        json={"version": trip["version"], "membershipIds": [str(내_membership)]},
        headers=headers,
    )

    assert 응답.json()["data"]["participantMembershipIds"] == [str(내_membership)]
    assert 응답.json()["data"]["version"] == trip["version"] + 1


async def test_낡은_버전으로는_참가자를_바꿀_수_없다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    from app.models import Membership

    내_membership = await db.scalar(
        select(Membership.id).where(Membership.space_id == space_id)
    )
    # 다른 기기가 먼저 제목을 고쳤다.
    await api.patch(
        f"/v1/trips/{trip['id']}", json={"version": trip["version"], "title": "먼저 고친 제목"}, headers=headers
    )

    응답 = await api.put(
        f"/v1/trips/{trip['id']}/participants",
        json={"version": trip["version"], "membershipIds": [str(내_membership)]},
        headers=headers,
    )

    assert 응답.status_code == 409
    assert 응답.json()["error"]["code"] == "VERSION_CONFLICT"


async def test_버전_없이는_참가자를_바꿀_수_없다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    응답 = await api.put(
        f"/v1/trips/{trip['id']}/participants", json={"membershipIds": []}, headers=headers
    )

    assert 응답.status_code == 422


async def test_id_모양이_아닌_참가자는_422다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    응답 = await api.put(
        f"/v1/trips/{trip['id']}/participants",
        json={"version": trip["version"], "membershipIds": ["하늘"]},
        headers=headers,
    )

    assert 응답.status_code == 422


async def test_남의_공간_멤버를_참가자로_넣을_수_없다(api, db):
    """
    외래키로 표현할 수 없는 검사다. 빠지면 남의 공간 멤버 이름이 내 여행
    화면에 뜬다.
    """
    남_headers = await 로그인한_사람(api, "other@example.com", "다온")
    남의_공간 = await 공간을_만든다(api, 남_headers)
    내_headers = await 로그인한_사람(api, "sky@example.com")
    내_공간 = await 공간을_만든다(api, 내_headers)
    trip = await 여행을_만든다(api, 내_headers, 내_공간)

    from app.models import Membership

    남의_membership = await db.scalar(
        select(Membership.id).where(Membership.space_id == 남의_공간)
    )
    응답 = await api.put(
        f"/v1/trips/{trip['id']}/participants",
        json={"version": trip["version"], "membershipIds": [str(남의_membership)]},
        headers=내_headers,
    )

    assert 응답.status_code == 422


async def test_참가자에서_빼도_줄은_남는다(api, db):
    """그 사람이 맡았던 준비물과 낸 지출이 이 줄을 거쳐 사람을 가리킨다."""
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    from app.models import Membership

    내_membership = await db.scalar(
        select(Membership.id).where(Membership.space_id == space_id)
    )
    첫번째 = await api.put(
        f"/v1/trips/{trip['id']}/participants",
        json={"version": trip["version"], "membershipIds": [str(내_membership)]},
        headers=headers,
    )
    응답 = await api.put(
        f"/v1/trips/{trip['id']}/participants",
        json={"version": 첫번째.json()["data"]["version"], "membershipIds": []},
        headers=headers,
    )

    assert 응답.json()["data"]["participantMembershipIds"] == []
    전체_줄 = await db.scalar(
        select(func.count()).select_from(TripParticipant).where(TripParticipant.trip_id == trip["id"])
    )
    assert 전체_줄 == 1


# ---------------------------------------------------------------------------
# 보관과 삭제
# ---------------------------------------------------------------------------


async def test_보관해도_하위_데이터는_막지_않는다(api, db):
    """여행이 끝난 뒤에 사진을 올리고 일기를 쓰는 것이 오히려 흔하다."""
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    보관 = await api.post(f"/v1/trips/{trip['id']}/archive", headers=headers)
    응답 = await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": 보관.json()["data"]["version"], "summary": "보관 뒤에도 적힌다"},
        headers=headers,
    )

    assert 응답.status_code == 200
    assert 응답.json()["data"]["status"] == "archived"


async def test_보관을_풀면_날짜에_맞는_상태로_돌아간다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    지난_여행 = await 여행을_만든다(
        api, headers, space_id, startDate="2020-01-01", endDate="2020-01-03"
    )
    await api.post(f"/v1/trips/{지난_여행['id']}/archive", headers=headers)

    응답 = await api.post(f"/v1/trips/{지난_여행['id']}/unarchive", headers=headers)

    assert 응답.json()["data"]["status"] == "completed"
    assert 응답.json()["data"]["archivedAt"] is None


async def test_editor도_보관할_수_있다(api, db):
    owner_headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner_headers)
    trip = await 여행을_만든다(api, owner_headers, space_id)
    편집자_headers = await 로그인한_사람(api, "editor@example.com", "다온")

    from app.models import Membership, User

    user_id = await db.scalar(select(User.id).where(User.email == "editor@example.com"))
    db.add(Membership(space_id=space_id, user_id=user_id, role=MembershipRole.EDITOR))
    await db.flush()

    assert (
        await api.post(f"/v1/trips/{trip['id']}/archive", headers=편집자_headers)
    ).status_code == 200


async def test_editor는_여행을_지울_수_없다(api, db):
    owner_headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, owner_headers)
    trip = await 여행을_만든다(api, owner_headers, space_id)
    편집자_headers = await 로그인한_사람(api, "editor@example.com", "다온")

    from app.models import Membership, User

    user_id = await db.scalar(select(User.id).where(User.email == "editor@example.com"))
    db.add(Membership(space_id=space_id, user_id=user_id, role=MembershipRole.EDITOR))
    await db.flush()

    응답 = await api.delete(f"/v1/trips/{trip['id']}", headers=편집자_headers)

    assert 응답.status_code == 403


async def test_지우면_목록에서_빠진다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    assert (await api.delete(f"/v1/trips/{trip['id']}", headers=headers)).status_code == 204

    목록 = await api.get(f"/v1/spaces/{space_id}/trips", headers=headers)
    assert 목록.json()["data"] == []
    assert (await api.get(f"/v1/trips/{trip['id']}", headers=headers)).status_code == 404


async def test_칠_일_안에는_되살릴_수_있다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    await api.delete(f"/v1/trips/{trip['id']}", headers=headers)

    응답 = await api.post(f"/v1/trips/{trip['id']}/restore", headers=headers)

    assert 응답.status_code == 200
    assert (await api.get(f"/v1/trips/{trip['id']}", headers=headers)).status_code == 200


async def test_기한이_지나면_되살릴_수_없다(api, db):
    """
    행이 아직 남아 있어도 되살리지 않는다. 정리 작업이 언제 도느냐에 따라
    되살아나기도 하고 아니기도 하면, 7일이라고 안내한 것이 거짓이 된다.
    """
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    await api.delete(f"/v1/trips/{trip['id']}", headers=headers)

    실제_여행 = await db.get(Trip, trip["id"])
    실제_여행.deletion_scheduled_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.flush()

    응답 = await api.post(f"/v1/trips/{trip['id']}/restore", headers=headers)

    assert 응답.status_code == 410
    assert 응답.json()["error"]["code"] == "GONE"


async def test_기한이_지난_여행을_정리한다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    await api.delete(f"/v1/trips/{trip['id']}", headers=headers)
    실제_여행 = await db.get(Trip, trip["id"])
    실제_여행.deletion_scheduled_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.flush()

    지운_수 = await purge_deleted_trips(db)

    assert 지운_수 == 1
    assert await db.scalar(select(func.count()).select_from(Trip)) == 0


async def test_아직_기한_안인_여행은_정리하지_않는다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    await api.delete(f"/v1/trips/{trip['id']}", headers=headers)

    지운_수 = await purge_deleted_trips(db)

    assert 지운_수 == 0


async def test_나간_멤버는_includeLeft로_물을_때만_뒤에_나온다(api, db):
    owner_headers = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, owner_headers)
    await 로그인한_사람(api, "editor@example.com", "다온")

    from app.models import Membership, User

    user_id = await db.scalar(select(User.id).where(User.email == "editor@example.com"))
    db.add(Membership(space_id=space_id, user_id=user_id, role=MembershipRole.EDITOR, left_at=datetime.now(UTC)))
    await db.flush()

    기본 = (await api.get(f"/v1/spaces/{space_id}/members", headers=owner_headers)).json()["data"]
    전체 = (await api.get(f"/v1/spaces/{space_id}/members?includeLeft=true", headers=owner_headers)).json()["data"]

    assert [줄["displayName"] for 줄 in 기본] == ["하늘"] and "leftAt" not in 기본[0]
    assert [(줄["displayName"], 줄["leftAt"] is None) for 줄 in 전체] == [("하늘", True), ("다온", False)]


async def test_이미_참가자인_사람은_공간을_나가도_참가자로_남길_수_있다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    await 로그인한_사람(api, "editor@example.com", "다온")
    await 로그인한_사람(api, "late@example.com", "새봄")

    from app.models import Membership, User

    나 = await db.scalar(select(Membership.id).where(Membership.space_id == space_id))
    다온 = Membership(space_id=space_id, user_id=await db.scalar(select(User.id).where(User.email == "editor@example.com")), role=MembershipRole.EDITOR)
    새봄 = Membership(space_id=space_id, user_id=await db.scalar(select(User.id).where(User.email == "late@example.com")), role=MembershipRole.EDITOR)
    db.add_all([다온, 새봄])
    await db.flush()
    첫번째 = await api.put(
        f"/v1/trips/{trip['id']}/participants",
        json={"version": trip["version"], "membershipIds": [str(나), str(다온.id)]},
        headers=headers,
    )
    다온.left_at = datetime.now(UTC)
    새봄.left_at = datetime.now(UTC)
    await db.flush()

    남김 = await api.put(
        f"/v1/trips/{trip['id']}/participants",
        json={"version": 첫번째.json()["data"]["version"], "membershipIds": [str(나), str(다온.id)]},
        headers=headers,
    )
    새로_넣음 = await api.put(
        f"/v1/trips/{trip['id']}/participants",
        json={"version": 남김.json()["data"]["version"], "membershipIds": [str(나), str(다온.id), str(새봄.id)]},
        headers=headers,
    )

    assert 남김.status_code == 200
    assert 새로_넣음.status_code == 422


async def test_표시_이름을_바꾸면_멤버_목록에도_보인다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, headers)

    바꿈 = await api.patch("/v1/me", json={"displayName": "  하늘   바다 "}, headers=headers)
    빈칸 = await api.patch("/v1/me", json={"displayName": "   "}, headers=headers)
    너무_김 = await api.patch("/v1/me", json={"displayName": "가" * 21}, headers=headers)
    목록 = (await api.get(f"/v1/spaces/{space_id}/members", headers=headers)).json()["data"]

    assert 바꿈.status_code == 200 and 바꿈.json()["data"]["displayName"] == "하늘 바다"
    assert (빈칸.status_code, 너무_김.status_code) == (422, 422)
    assert 목록[0]["displayName"] == "하늘 바다"


async def test_지운_여행은_owner만_trash로_보고_되돌리면_목록에_돌아온다(api, db):
    owner = await 로그인한_사람(api, "sky@example.com", "하늘")
    space_id = await 공간을_만든다(api, owner)
    trip = await 여행을_만든다(api, owner, space_id)
    await 로그인한_사람(api, "editor@example.com", "다온")

    from app.models import Membership, User

    user_id = await db.scalar(select(User.id).where(User.email == "editor@example.com"))
    db.add(Membership(space_id=space_id, user_id=user_id, role=MembershipRole.EDITOR))
    await db.flush()
    editor = await api.post(
        "/v1/auth/login",
        json={"email": "editor@example.com", "password": 비밀번호, "device": {"installationId": "설치-editor-trash", "platform": "ios"}},
    )
    editor_headers = {"Authorization": f"Bearer {editor.json()['data']['accessToken']}"}

    await api.delete(f"/v1/trips/{trip['id']}", headers=owner)
    목록 = (await api.get(f"/v1/spaces/{space_id}/trips", headers=owner)).json()["data"]
    휴지통 = (await api.get(f"/v1/spaces/{space_id}/trips?trash=true", headers=owner)).json()["data"]
    editor_휴지통 = await api.get(f"/v1/spaces/{space_id}/trips?trash=true", headers=editor_headers)
    되돌림 = await api.post(f"/v1/trips/{trip['id']}/restore", headers=owner)
    다시_목록 = (await api.get(f"/v1/spaces/{space_id}/trips", headers=owner)).json()["data"]

    assert 목록 == []
    assert [item["id"] for item in 휴지통] == [trip["id"]] and 휴지통[0]["deletionScheduledAt"]
    assert editor_휴지통.status_code == 403
    assert 되돌림.status_code == 200 and 되돌림.json()["data"]["deletionScheduledAt"] is None
    assert [item["id"] for item in 다시_목록] == [trip["id"]]


# ---------------------------------------------------------------------------
# 여행 목록 이어 받기
# ---------------------------------------------------------------------------


async def 쪽마다_이어_받는다(api, headers, 주소: str, limit: int) -> list[str]:
    """nextCursor 가 없어질 때까지 이어 받고 받은 차례대로 id 를 모은다."""
    받은: list[str] = []
    cursor = None
    for _ in range(20):  # 끝나지 않으면 시험이 멈춰 서는 대신 여기서 끊는다.
        이번 = f"{주소}&limit={limit}" + (f"&cursor={cursor}" if cursor else "")
        응답 = await api.get(이번, headers=headers)
        assert 응답.status_code == 200, 응답.text
        봉투 = 응답.json()
        받은 += [item["id"] for item in 봉투["data"]]
        cursor = 봉투["meta"]["nextCursor"]
        if cursor is None:
            return 받은
    raise AssertionError("cursor 가 끝나지 않는다")


async def test_여행이_한_쪽보다_많으면_cursor로_이어_받는다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    만든 = [
        await 여행을_만든다(
            api,
            headers,
            space_id,
            title=f"여행 {번호}",
            startDate=f"2026-10-{번호:02d}",
            endDate=f"2026-10-{번호:02d}",
        )
        for 번호 in range(1, 8)
    ]

    받은 = await 쪽마다_이어_받는다(api, headers, f"/v1/spaces/{space_id}/trips?", limit=3)

    # 시작일 역순 그대로다. 겹치지도 빠지지도 않는다.
    assert 받은 == [trip["id"] for trip in reversed(만든)]


async def test_시작일이_같아도_겹치거나_빠지지_않는다(api, db):
    """
    시작일만으로 줄을 세우면 같은 날짜끼리의 차례가 질의마다 흔들린다. 그러면
    쪽을 넘길 때 어떤 여행은 두 번 오고 어떤 여행은 영영 오지 않는다.
    """
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    만든 = [await 여행을_만든다(api, headers, space_id, title=f"같은 날 {번호}") for 번호 in range(5)]

    받은 = await 쪽마다_이어_받는다(api, headers, f"/v1/spaces/{space_id}/trips?", limit=2)

    assert sorted(받은) == sorted(trip["id"] for trip in 만든)
    assert len(받은) == len(set(받은))


async def test_한_쪽에_다_들어가면_nextCursor가_없다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    await 여행을_만든다(api, headers, space_id)

    봉투 = (await api.get(f"/v1/spaces/{space_id}/trips?limit=20", headers=headers)).json()

    assert len(봉투["data"]) == 1
    assert 봉투["meta"]["nextCursor"] is None and 봉투["meta"]["hasMore"] is False


async def test_쪽을_넘기는_사이에_여행이_생겨도_받은_줄이_다시_오지_않는다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    for 번호 in range(1, 5):
        await 여행을_만든다(
            api,
            headers,
            space_id,
            title=f"여행 {번호}",
            startDate=f"2026-10-{번호:02d}",
            endDate=f"2026-10-{번호:02d}",
        )

    첫_쪽 = (await api.get(f"/v1/spaces/{space_id}/trips?limit=2", headers=headers)).json()
    # 첫 쪽보다 앞에 놓일 여행이 사이에 생긴다. 몇 번째 줄부터 세는 방식이면 이때
    # 첫 쪽의 마지막 여행이 다음 쪽에 한 번 더 온다.
    await 여행을_만든다(
        api, headers, space_id, title="갑자기", startDate="2026-11-01", endDate="2026-11-01"
    )
    다음_쪽 = (
        await api.get(
            f"/v1/spaces/{space_id}/trips?limit=2&cursor={첫_쪽['meta']['nextCursor']}",
            headers=headers,
        )
    ).json()

    첫_ids = {item["id"] for item in 첫_쪽["data"]}
    다음_ids = {item["id"] for item in 다음_쪽["data"]}
    assert 첫_ids & 다음_ids == set()


async def test_휴지통도_이어_받는다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    지운_것 = []
    for 번호 in range(1, 6):
        trip = await 여행을_만든다(api, headers, space_id, title=f"여행 {번호}")
        assert (await api.delete(f"/v1/trips/{trip['id']}", headers=headers)).status_code == 204
        지운_것.append(trip["id"])

    받은 = await 쪽마다_이어_받는다(api, headers, f"/v1/spaces/{space_id}/trips?trash=true", limit=2)

    assert sorted(받은) == sorted(지운_것)
    assert len(받은) == len(set(받은))


async def test_우리가_주지_않은_cursor는_422다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)

    응답 = await api.get(f"/v1/spaces/{space_id}/trips?cursor=아무거나", headers=headers)

    assert 응답.status_code == 422
    assert 응답.json()["error"]["code"] == "VALIDATION_ERROR"
