"""
응답 JSON 이 글자 그대로 그대로인지 지키는 시험.

`response_model` 을 붙이면 FastAPI 가 되돌려주는 값을 스키마로 한 번 더 거쳐
내보낸다. 칸이 하나 늘거나 `null` 이 하나 되살아나거나 숫자 표기가 달라져도
1.0.0 앱이 그것을 본다. 그래서 여기서는 값을 하나씩 보지 않고 **본문 전체를
글자로** 견준다. id 와 시각만 자리표로 바꾼다.

새 칸을 일부러 더했으면 아래 골든도 함께 고친다. 고칠 때는 「무엇이 늘었는지」를
커밋 메시지에 적는다 — 이 시험이 실패했다는 것은 앱이 받는 모양이 바뀌었다는 뜻이다.
"""

import re

import pytest

from tests.test_api_auth import 가입, 로그인, 링크_토큰, 비밀번호, 이메일
from tests.test_api_bookings import 교통편을_넣는다
from tests.test_api_calendar_notes import 둘이_쓰는_공간
from tests.test_api_cooking import 요리를_넣는다, 준비물을_넣는다
from tests.test_api_expenses import 지출을_넣는다
from tests.test_api_members import token_of, 초대를_만든다
from tests.test_api_places import 여행_하나, 장소를_담는다
from tests.test_api_reports import 신고, 함께_쓰는_여행
from tests.test_api_schedule import 일정을_넣는다
from tests.test_api_trips import 공간을_만든다, 로그인한_사람, 여행을_만든다

pytestmark = pytest.mark.anyio

_TOKEN = re.compile(r"token=[A-Za-z0-9_-]+")

_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_시각 = re.compile(r"\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})")


def 자리표로(본문: str) -> str:
    """id·시각·초대 토큰은 실행마다 다르다. 그것만 자리표로 바꾸고 나머지는 글자 그대로 본다."""
    return _TOKEN.sub("token=<token>", _UUID.sub("<id>", _시각.sub("<시각>", 본문)))


async def 준비(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(
        api,
        headers,
        space_id,
        regionCode="jeju",
        regionName="제주",
        summary="둘이서 사흘",
        cookingEnabled=True,
    )
    멤버 = (await api.get(f"/v1/spaces/{space_id}/members", headers=headers)).json()["data"]
    return headers, space_id, trip, 멤버[0]["id"]


async def test_공간_응답의_모양(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")

    만든_것 = await api.post(
        "/v1/spaces",
        json={"name": "우리의 여행 공간", "relationshipType": "couple", "startedOn": "2024-03-01"},
        headers=headers,
    )
    목록 = await api.get("/v1/spaces", headers=headers)

    assert 자리표로(만든_것.text) == (
        '{"data":{"id":"<id>","name":"우리의 여행 공간","relationshipType":"couple",'
        '"timezone":"Asia/Seoul","startedOn":"2024-03-01","myRole":"owner"},'
        '"meta":{"requestId":"<id>"}}'
    )
    assert 자리표로(목록.text) == (
        '{"data":[{"id":"<id>","name":"우리의 여행 공간","relationshipType":"couple",'
        '"timezone":"Asia/Seoul","startedOn":"2024-03-01","myRole":"owner"}],'
        '"meta":{"requestId":"<id>"}}'
    )


async def test_멤버_목록은_나가지_않은_사람의_leftAt를_아예_안_보낸다(api, db):
    """
    `leftAt` 은 나간 멤버에게만 붙는다. `includeLeft` 없이 물었을 때 `null` 이라도
    붙으면 앱이 「나간 사람」으로 읽을 자리가 생긴다.
    """
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)

    응답 = await api.get(f"/v1/spaces/{space_id}/members", headers=headers)

    assert 자리표로(응답.text) == (
        '{"data":[{"id":"<id>","displayName":"하늘","role":"owner","isMe":true}],'
        '"meta":{"requestId":"<id>"}}'
    )


async def test_여행_응답의_모양(api, db):
    headers, space_id, _, _ = await 준비(api, db)

    하나 = await api.get(f"/v1/spaces/{space_id}/trips", headers=headers)

    assert 자리표로(하나.text) == (
        '{"data":[{"id":"<id>","spaceId":"<id>","title":"가을 제주","regionCode":"jeju",'
        '"regionName":"제주","startDate":"2026-10-01","endDate":"2026-10-03","status":"planning",'
        '"summary":"둘이서 사흘","cookingEnabled":true,"currencyCode":"KRW","exchangeRate":null,'
        '"budget":null,"simplifySettlement":true,"coverPhotoId":null,"coverCardId":null,'
        '"coverPhotoIds":[],"coverCardStyle":null,"coverFocusX":0.5,"coverFocusY":0.5,'
        '"coverZoom":1.0,"version":1,"archivedAt":null,"deletionScheduledAt":null,'
        '"participantMembershipIds":[],"overview":{"stay":null,"scheduleCount":0,"placeCount":0,'
        '"restaurantCount":0,"cafeCount":0,"packingTotal":0,"packingDone":0,"spentTotal":0.0}}],'
        '"meta":{"nextCursor":null,"hasMore":false,"requestId":"<id>"}}'
    )


async def test_지출_응답의_모양(api, db):
    headers, space_id, trip, 나 = await 준비(api, db)
    await 지출을_넣는다(api, headers, trip["id"], 나, memo="비 와서 실내로")

    목록 = await api.get(f"/v1/trips/{trip['id']}/expenses", headers=headers)

    assert 자리표로(목록.text) == (
        '{"data":[{"id":"<id>","tripId":"<id>","date":"2026-10-02","title":"소나기식당 점심",'
        '"amount":48000.0,"category":"meal","payerMembershipId":"<id>","splitMode":null,'
        '"shares":[],"memo":"비 와서 실내로","receiptPhotoId":null,"excluded":false,'
        '"transportId":null,"version":1}],'
        '"meta":{"nextCursor":null,"hasMore":false,"requestId":"<id>"}}'
    )


async def test_사진_응답의_모양(api, db):
    headers, space_id, trip, 나 = await 준비(api, db)

    만든_것 = await api.post(
        f"/v1/trips/{trip['id']}/photos",
        json={"checksum": "a" * 64, "bytes": 1024, "caption": "첫날 바다", "date": "2026-10-01"},
        headers=headers,
    )

    assert 자리표로(만든_것.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","status":"uploading","caption":"첫날 바다",'
        '"date":"2026-10-01","takenAt":null,"width":null,"height":null,"bytes":null,'
        '"originalUntil":null,"isReceipt":false,"uploaderMembershipId":"<id>",'
        '"uploaderName":"하늘","createdAt":"<시각>","version":1,"links":[]},'
        '"meta":{"requestId":"<id>"}}'
    )


# ---------------------------------------------------------------------------
# 아래는 이번에 `response_model` 을 붙인 경로들의 골든이다. 파일마다 하나씩,
# 값이 똑같은 함수로 만들어지는 경로(만들기·고치기처럼)는 대표로 하나만 본다.
# ---------------------------------------------------------------------------


async def test_인증_응답의_모양(api, db):
    """상태만 담은 응답(`accepted`·`verified`·`reset`)은 값만 다르고 모양은 같다."""
    가입_응답 = await 가입(api)
    확인_응답 = await api.post("/v1/auth/email-verifications/confirm", json={"token": 링크_토큰()})
    로그인_응답 = await 로그인(api)
    잊음_응답 = await api.post("/v1/auth/password/forgot", json={"email": 이메일})

    assert 자리표로(가입_응답.text) == '{"data":{"status":"accepted"},"meta":{"requestId":"<id>"}}'
    assert 자리표로(확인_응답.text) == '{"data":{"status":"verified"},"meta":{"requestId":"<id>"}}'
    assert 자리표로(잊음_응답.text) == '{"data":{"status":"accepted"},"meta":{"requestId":"<id>"}}'
    세션 = 로그인_응답.json()["data"]
    assert 자리표로(로그인_응답.text) == (
        '{"data":{"accessToken":"' + 세션["accessToken"] + '","refreshToken":"' + 세션["refreshToken"] + '",'
        '"expiresIn":900,"deviceId":"<id>","endedDevices":[]},"meta":{"requestId":"<id>"}}'
    )

    재설정_응답 = await api.post(
        "/v1/auth/password/reset", json={"token": 링크_토큰(), "newPassword": "새 산책 시간 저녁 8시"}
    )
    assert 자리표로(재설정_응답.text) == '{"data":{"status":"reset"},"meta":{"requestId":"<id>"}}'

    다시_로그인 = await 로그인(api, password="새 산책 시간 저녁 8시")
    헤더 = {"Authorization": f"Bearer {다시_로그인.json()['data']['accessToken']}"}
    세션_목록 = await api.get("/v1/auth/sessions", headers=헤더)
    assert 자리표로(세션_목록.text) == (
        '{"data":[{"id":"<id>","displayName":"내 폰","platform":"ios","appVersion":null,'
        '"lastSeenAt":"<시각>","current":true}],"meta":{"requestId":"<id>"}}'
    )

    증표_응답 = await api.post(
        "/v1/auth/reauth", json={"action": "change_password", "password": "새 산책 시간 저녁 8시"}, headers=헤더
    )
    증표 = 증표_응답.json()["data"]["proof"]
    assert 자리표로(증표_응답.text) == (
        '{"data":{"proof":"' + 증표 + '","expiresIn":300},"meta":{"requestId":"<id>"}}'
    )


async def test_me_응답의_모양(api, db):
    헤더 = await 로그인한_사람(api, "sky@example.com")

    나 = await api.get("/v1/me", headers=헤더)
    assert 자리표로(나.text) == (
        '{"data":{"id":"<id>","email":"sky@example.com","displayName":"하늘","avatarUrl":null,'
        '"spaces":[],"deletionScheduledAt":null,"hasPassword":true,"linkedProviders":[]},'
        '"meta":{"requestId":"<id>"}}'
    )

    증표 = (
        await api.post("/v1/auth/reauth", json={"action": "change_password", "password": 비밀번호}, headers=헤더)
    ).json()["data"]["proof"]
    비번_변경 = await api.post(
        "/v1/me/password", json={"newPassword": "새 비밀 산책 9시", "reauthProof": 증표}, headers=헤더
    )
    assert 자리표로(비번_변경.text) == '{"data":{"status":"changed"},"meta":{"requestId":"<id>"}}'

    증표2 = (
        await api.post(
            "/v1/auth/reauth", json={"action": "change_email", "password": "새 비밀 산책 9시"}, headers=헤더
        )
    ).json()["data"]["proof"]
    이메일_변경 = await api.post(
        "/v1/me/email", json={"newEmail": "sky2@example.com", "reauthProof": 증표2}, headers=헤더
    )
    assert 자리표로(이메일_변경.text) == '{"data":{"status":"accepted"},"meta":{"requestId":"<id>"}}'

    삭제_조회 = await api.get("/v1/me/deletion", headers=헤더)
    assert 자리표로(삭제_조회.text) == '{"data":{"requestedAt":null,"scheduledAt":null},"meta":{"requestId":"<id>"}}'


async def test_oauth_제공자_목록의_모양(api, db):
    """키를 넣은 제공자가 없는 시험 설정에서는 빈 목록이다."""
    응답 = await api.get("/v1/auth/oauth/providers")
    assert 자리표로(응답.text) == '{"data":{"providers":[]},"meta":{"requestId":"<id>"}}'


async def test_초대와_역할_응답의_모양(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)

    초대 = await api.post(f"/v1/spaces/{space_id}/invites", headers=headers)
    assert 자리표로(초대.text) == (
        '{"data":{"id":"<id>","inviteUrl":"https://api.daymo.xyz/auth/invite?token=<token>",'
        '"expiresAt":"<시각>","maxUses":10,"usedCount":0,"createdByMembershipId":"<id>"},'
        '"meta":{"requestId":"<id>"}}'
    )

    여울 = await 로그인한_사람(api, "sea@example.com", "여울")
    수락 = await api.post("/v1/invites/accept", json={"token": token_of(초대.json()["data"])}, headers=여울)
    assert 자리표로(수락.text) == (
        '{"data":{"spaceId":"<id>","membershipId":"<id>","alreadyMember":false},"meta":{"requestId":"<id>"}}'
    )

    멤버_목록 = (await api.get(f"/v1/spaces/{space_id}/members", headers=headers)).json()["data"]
    대상 = next(줄["id"] for 줄 in 멤버_목록 if 줄["displayName"] == "여울")
    역할_변경 = await api.patch(f"/v1/spaces/{space_id}/members/{대상}", json={"role": "viewer"}, headers=headers)
    assert 자리표로(역할_변경.text) == '{"data":{"id":"<id>","role":"viewer","myRole":"owner"},"meta":{"requestId":"<id>"}}'


async def test_교통편과_예약_응답의_모양(api, db):
    headers, _, trip = await 여행_하나(api)

    교통편 = await 교통편을_넣는다(api, headers, trip["id"])
    assert 자리표로(교통편.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","direction":"outbound","method":"ktx",'
        '"date":"2026-10-01","departureName":"서울역","departureTime":"08:00",'
        '"arrivalName":"전주역","arrivalTime":"09:50","stops":[],"ownerMembershipId":null,'
        '"bookingStatus":"booked","note":null,"showInSchedule":true,"version":1},'
        '"meta":{"requestId":"<id>"}}'
    )

    예약 = await api.post(
        f"/v1/trips/{trip['id']}/reservations", json={"title": "소나기식당", "date": "2026-10-02"}, headers=headers
    )
    assert 자리표로(예약.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","title":"소나기식당","targetType":"other",'
        '"targetId":null,"date":"2026-10-02","time":null,"partySize":null,"partyLabel":null,'
        '"status":"needs_check","note":null,"bookingUrl":null,"showInSchedule":false,"version":1},'
        '"meta":{"requestId":"<id>"}}'
    )


async def test_준비물과_요리_응답의_모양(api, db):
    headers, _, trip = await 여행_하나(api)

    준비물 = await 준비물을_넣는다(api, headers, trip["id"])
    assert 자리표로(준비물.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","name":"보조배터리","quantity":null,'
        '"ownerMembershipId":null,"isShared":false,"completed":false,"tags":[],'
        '"sourceIngredientId":null,"version":1},"meta":{"requestId":"<id>"}}'
    )

    요리 = await 요리를_넣는다(api, headers, trip["id"])
    assert 자리표로(요리.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","name":"된장찌개","memo":null,"sourceUrl":null,'
        '"ingredients":[{"id":"<id>","name":"된장","quantity":"한 숟갈","category":"양념",'
        '"procurement":"undecided","ownerMembershipId":null,"ready":false}],"version":1},'
        '"meta":{"requestId":"<id>"}}'
    )


async def test_일정과_숙소_응답의_모양(api, db):
    headers, _, trip = await 여행_하나(api)

    일정 = await 일정을_넣는다(api, headers, trip["id"])
    assert 자리표로(일정.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","date":"2026-10-02","time":"12:30",'
        '"title":"소나기식당에서 점심","type":"meal","note":null,"tripPlaceId":null,'
        '"mapUrl":null,"version":1},"meta":{"requestId":"<id>"}}'
    )

    숙소 = await api.post(
        f"/v1/trips/{trip['id']}/stays",
        json={"checkInAt": "2026-10-01T15:00", "checkOutAt": "2026-10-03T11:00"},
        headers=headers,
    )
    assert 자리표로(숙소.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","tripPlaceId":null,"checkInAt":"2026-10-01T15:00",'
        '"checkOutAt":"2026-10-03T11:00","note":null,"showInSchedule":true,"version":1},'
        '"meta":{"requestId":"<id>"}}'
    )


async def test_장소_응답의_모양(api, db):
    headers, _, trip = await 여행_하나(api)

    장소 = await 장소를_담는다(api, headers, trip["id"])
    assert 자리표로(장소.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","name":"달빛한옥","area":"전북","address":null,'
        '"category":"숙소","status":"saved","memo":null,"tags":[],"mapUrl":null,"version":1},'
        '"meta":{"requestId":"<id>"}}'
    )


async def test_달력_메모_응답의_모양(api, db):
    하늘, _, space_id = await 둘이_쓰는_공간(api)

    응답 = await api.post(
        f"/v1/spaces/{space_id}/calendar-notes",
        json={"kind": "memo", "title": "전주 숙소 결제 마감", "startDate": "2026-09-25", "endDate": "2026-09-25"},
        headers=하늘,
    )
    assert 자리표로(응답.text) == (
        '{"data":{"id":"<id>","spaceId":"<id>","kind":"memo","membershipId":null,'
        '"title":"전주 숙소 결제 마감","startDate":"2026-09-25","endDate":"2026-09-25",'
        '"time":null,"createdByMembershipId":"<id>","version":1,"createdAt":"<시각>"},'
        '"meta":{"requestId":"<id>"}}'
    )


async def test_신고와_차단_응답의_모양(api, db):
    하늘, 여울, space_id, trip = await 함께_쓰는_여행(api, db)
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "장보기"}, headers=하늘)).json()["data"]

    신고_응답 = await 신고(api, 하늘, space_id, "memo", target_id=메모["id"])
    assert 자리표로(신고_응답.text) == (
        '{"data":{"id":"<id>","receivedAt":"<시각>","reviewDueAt":"<시각>"},"meta":{"requestId":"<id>"}}'
    )

    멤버_목록 = (await api.get(f"/v1/spaces/{space_id}/members", headers=하늘)).json()["data"]
    대상 = next(줄["id"] for 줄 in 멤버_목록 if not 줄["isMe"])
    차단_응답 = await api.post("/v1/blocks", json={"userMembershipId": 대상}, headers=하늘)
    assert 자리표로(차단_응답.text) == (
        '{"data":{"id":"<id>","membershipId":"<id>","displayName":"다온","blockedAt":"<시각>"},'
        '"meta":{"requestId":"<id>"}}'
    )

    목록_응답 = await api.get("/v1/blocks", headers=하늘)
    assert 자리표로(목록_응답.text) == (
        '{"data":[{"id":"<id>","membershipId":"<id>","displayName":"다온","blockedAt":"<시각>"}],'
        '"meta":{"requestId":"<id>"}}'
    )


async def test_여행_카드_응답의_모양(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    카드 = await api.post(f"/v1/trips/{trip['id']}/cards", json={"settings": {}}, headers=headers)
    assert 자리표로(카드.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","settings":{"style":"필름","ratio":"세로",'
        '"photoIds":[],"title":null,"caption":null,"parts":[],"stats":[],"frameColor":"검정",'
        '"stickers":[],"decor":[],"dateStamp":false,"photoCaptions":false},"sortOrder":1,'
        '"createdByMembershipId":"<id>","canManage":true,"createdAt":"<시각>","version":1,'
        '"imageVersion":null},"meta":{"requestId":"<id>"}}'
    )


async def test_휴지통_응답의_모양(api, db):
    """
    되살리기(`POST /trash/{type}/{id}/restore`)는 메모면 `MemoOut`, 사진이면 `PhotoOut`
    모양이다. 둘 다 스키마로 확인되는지 여기서 본다(`response_model=Envelope[MemoOut | PhotoOut]`).
    """
    headers, _, trip = await 여행_하나(api)
    메모 = (await api.post(f"/v1/trips/{trip['id']}/memos", json={"body": "장보기"}, headers=headers)).json()["data"]
    await api.delete(f"/v1/memos/{메모['id']}", headers=headers)

    휴지통 = await api.get(f"/v1/trips/{trip['id']}/trash", headers=headers)
    assert 자리표로(휴지통.text) == (
        '{"data":[{"id":"<id>","type":"memo","tripId":"<id>","preview":"장보기",'
        '"deletedAt":"<시각>","deletedByMembershipId":"<id>","deletedByName":"하늘",'
        '"restoreDeadline":"<시각>","canRestore":true}],'
        '"meta":{"nextCursor":null,"hasMore":false,"requestId":"<id>"}}'
    )

    메모_되살림 = await api.post(f"/v1/trash/memo/{메모['id']}/restore", headers=headers)
    assert 자리표로(메모_되살림.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","body":"장보기","authorMembershipId":"<id>",'
        '"authorName":"하늘","createdAt":"<시각>","editedAt":null,"version":3},'
        '"meta":{"requestId":"<id>"}}'
    )

    from tests.test_api_photos import jpeg, 사진을_올린다

    사진_응답, _ = await 사진을_올린다(api, headers, trip["id"], jpeg(20, 20))
    사진 = 사진_응답.json()["data"]
    await api.delete(f"/v1/photos/{사진['id']}", headers=headers)
    사진_되살림 = await api.post(f"/v1/trash/photo/{사진['id']}/restore", headers=headers)
    assert 자리표로(사진_되살림.text) == (
        '{"data":{"id":"<id>","tripId":"<id>","status":"ready","caption":null,"date":null,'
        '"takenAt":"<시각>","width":20,"height":20,"bytes":1773,"originalUntil":"<시각>",'
        '"isReceipt":false,"uploaderMembershipId":"<id>","uploaderName":"하늘",'
        '"createdAt":"<시각>","version":3,"links":[]},"meta":{"requestId":"<id>"}}'
    )


async def test_의견_응답의_모양(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    응답 = await api.post("/v1/feedback", json={"kind": "idea", "body": "좋은 생각이 있어요"}, headers=headers)
    assert 자리표로(응답.text) == '{"data":{"id":"<id>","receivedAt":"<시각>"},"meta":{"requestId":"<id>"}}'


async def test_앱_오류_응답의_모양(client):
    응답 = await client.post("/v1/client-errors", json={})
    assert 자리표로(응답.text) == '{"data":{"status":"accepted"},"meta":{"requestId":"<id>"}}'


async def test_내부_health_응답의_모양(client):
    응답 = await client.get("/v1/health")
    assert 자리표로(응답.text) == '{"data":{"status":"ok","database":"ok"},"meta":{"requestId":"<id>"}}'
