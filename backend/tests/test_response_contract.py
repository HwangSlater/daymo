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

from tests.test_api_expenses import 지출을_넣는다
from tests.test_api_trips import 공간을_만든다, 로그인한_사람, 여행을_만든다

pytestmark = pytest.mark.anyio

_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_시각 = re.compile(r"\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})")


def 자리표로(본문: str) -> str:
    """id 와 시각은 실행마다 다르다. 그 둘만 자리표로 바꾸고 나머지는 글자 그대로 본다."""
    return _UUID.sub("<id>", _시각.sub("<시각>", 본문))


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
