import pytest

from app.services.trip_cards import MAX_CARDS_PER_TRIP
from tests.test_api_trips import 공간을_만든다, 로그인한_사람, 여행을_만든다

pytestmark = pytest.mark.anyio


async def 사진_하나(api, headers, trip_id: str) -> str:
    from tests.test_api_photos import jpeg, 사진을_올린다

    return (await 사진을_올린다(api, headers, trip_id, jpeg(400, 300)))[0].json()["data"]["id"]


async def 카드를_만든다(api, headers, trip_id: str, **settings) -> dict:
    응답 = await api.post(
        f"/v1/trips/{trip_id}/cards", json={"settings": settings}, headers=headers
    )
    assert 응답.status_code == 201, 응답.text
    return 응답.json()["data"]


async def test_한_여행에_카드를_여러_장_모아_두고_상대에게도_같은_카드가_보인다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    사진 = await 사진_하나(api, headers, trip["id"])

    네컷 = await 카드를_만든다(
        api, headers, trip["id"],
        style="네컷", photoIds=[사진], frameColor="크림", stickers=["하트", "별"],
        dateStamp=True, photoCaptions=True, parts=["이름", "기간"],
    )
    엽서 = await 카드를_만든다(api, headers, trip["id"], style="엽서", caption="또 가자")
    목록 = await api.get(f"/v1/trips/{trip['id']}/cards", headers=headers)

    # 새로 만들어도 앞서 만든 카드가 덮이지 않는다. 만든 차례 그대로다.
    줄 = 목록.json()["data"]
    assert [카드["id"] for 카드 in 줄] == [네컷["id"], 엽서["id"]]
    assert 줄[0]["settings"]["style"] == "네컷"
    assert 줄[0]["settings"]["stickers"] == ["하트", "별"]
    assert 줄[0]["settings"]["frameColor"] == "크림"
    assert 줄[0]["settings"]["dateStamp"] is True
    assert 줄[1]["settings"]["caption"] == "또 가자"
    # 고르지 않은 것은 기본값으로 채워져 저장된다. 앱이 무엇을 그릴지 늘 알 수 있다.
    assert 줄[1]["settings"]["frameColor"] == "검정"
    assert 줄[1]["settings"]["stickers"] == []
    assert 줄[1]["settings"]["decor"] == []


async def test_손으로_얹은_스티커는_비율_그대로_오간다(api, db):
    """자리와 크기는 카드 크기에 대한 비율이다. 서버는 그대로 돌려주기만 한다."""
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    카드 = await 카드를_만든다(
        api, headers, trip["id"],
        style="네컷",
        decor=[
            {"id": "d1", "kind": "꽃", "x": 0.25, "y": 0.8, "size": 0.2, "angle": -15, "z": 0},
            {"id": "d2", "kind": "글자", "text": "좋았다", "x": 0.5, "y": 0.1, "size": 0.1, "z": 1},
        ],
    )

    assert 카드["settings"]["decor"][0] == {
        "id": "d1", "kind": "꽃", "text": None,
        "x": 0.25, "y": 0.8, "size": 0.2, "angle": -15.0, "z": 0,
    }
    assert 카드["settings"]["decor"][1]["text"] == "좋았다"

    # 카드 밖으로 나간 자리, 모르는 스티커, 뒤집힌 각도는 받지 않는다.
    for 나쁜_것 in (
        {"kind": "하트", "x": 1.4, "y": 0.5},
        {"kind": "무지개", "x": 0.5, "y": 0.5},
        {"kind": "하트", "x": 0.5, "y": 0.5, "angle": 400},
    ):
        응답 = await api.post(
            f"/v1/trips/{trip['id']}/cards", json={"settings": {"decor": [나쁜_것]}}, headers=headers
        )
        assert 응답.status_code == 422, 응답.text


async def test_카드를_고치고_지운다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    카드 = await 카드를_만든다(api, headers, trip["id"], style="필름")

    고침 = await api.patch(
        f"/v1/trip-cards/{카드['id']}",
        json={"version": 카드["version"], "settings": {"style": "네컷 격자", "caption": "여기 또 오자"}},
        headers=headers,
    )
    묵은_값 = await api.patch(
        f"/v1/trip-cards/{카드['id']}",
        json={"version": 카드["version"], "settings": {"style": "엽서"}},
        headers=headers,
    )
    지움 = await api.delete(f"/v1/trip-cards/{카드['id']}", headers=headers)
    남은_것 = await api.get(f"/v1/trips/{trip['id']}/cards", headers=headers)

    assert 고침.json()["data"]["settings"]["style"] == "네컷 격자"
    assert 고침.json()["data"]["version"] == 카드["version"] + 1
    # 옆에서 먼저 고쳤으면 조용히 덮지 않는다.
    assert 묵은_값.status_code == 409, 묵은_값.text
    assert 지움.status_code == 204
    assert 남은_것.json()["data"] == []


async def test_같은_id_로_두_번_보내도_카드가_두_장이_되지_않는다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    본문 = {"id": "44444444-4444-4444-4444-444444444444", "settings": {"style": "엽서"}}

    처음 = await api.post(f"/v1/trips/{trip['id']}/cards", json=본문, headers=headers)
    다시 = await api.post(f"/v1/trips/{trip['id']}/cards", json=본문, headers=headers)

    assert (처음.status_code, 다시.status_code) == (201, 200)
    assert len((await api.get(f"/v1/trips/{trip['id']}/cards", headers=headers)).json()["data"]) == 1


async def test_카드_사진은_그_여행의_사진이어야_하고_모르는_값은_거부한다(api, db):
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
    남의_사진 = await 사진_하나(api, headers, 다른_여행["id"])

    남의_것 = await api.post(
        f"/v1/trips/{trip['id']}/cards", json={"settings": {"photoIds": [남의_사진]}}, headers=headers
    )
    모르는_스타일 = await api.post(
        f"/v1/trips/{trip['id']}/cards", json={"settings": {"style": "폴라로이드"}}, headers=headers
    )
    모르는_스티커 = await api.post(
        f"/v1/trips/{trip['id']}/cards", json={"settings": {"stickers": ["무지개"]}}, headers=headers
    )
    기본값 = await api.post(f"/v1/trips/{trip['id']}/cards", json={}, headers=headers)

    assert (남의_것.status_code, 모르는_스타일.status_code, 모르는_스티커.status_code) == (422, 422, 422)
    # 아무것도 고르지 않은 것도 저장된다. 기본값 그대로 쓰겠다는 뜻이다.
    assert 기본값.status_code == 201, 기본값.text
    assert 기본값.json()["data"]["settings"]["style"] == "필름"


async def test_카드는_여행마다_스무_장까지만_쌓인다(api, db):
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    for _ in range(MAX_CARDS_PER_TRIP):
        await 카드를_만든다(api, headers, trip["id"], style="필름")

    넘침 = await api.post(f"/v1/trips/{trip['id']}/cards", json={}, headers=headers)

    assert 넘침.status_code == 422, 넘침.text
    assert "20장" in 넘침.json()["error"]["message"]


async def test_남이_만든_카드는_만든_사람과_owner_만_고치고_지운다(api, db):
    from tests.test_api_members import token_of, 초대를_만든다

    주인 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 주인)
    초대 = await 초대를_만든다(api, 주인, space_id)
    손님 = await 로그인한_사람(api, "sea@example.com", "여울")
    # 초대 링크로 들어오면 editor 다.
    await api.post("/v1/invites/accept", json={"token": token_of(초대)}, headers=손님)
    trip = await 여행을_만든다(api, 주인, space_id)
    손님_카드 = await 카드를_만든다(api, 손님, trip["id"], style="엽서")
    주인_카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")

    # editor 는 남이 만든 카드를 보기만 한다.
    손님이_본_목록 = (await api.get(f"/v1/trips/{trip['id']}/cards", headers=손님)).json()["data"]
    손님이_주인_것을 = await api.delete(f"/v1/trip-cards/{주인_카드['id']}", headers=손님)
    # owner 는 남이 만든 카드도 지운다. 공간을 치우는 사람이라서다.
    주인이_손님_것을 = await api.delete(f"/v1/trip-cards/{손님_카드['id']}", headers=주인)

    assert {카드["id"]: 카드["canManage"] for 카드 in 손님이_본_목록} == {
        손님_카드["id"]: True, 주인_카드["id"]: False,
    }
    assert 손님이_주인_것을.status_code == 403, 손님이_주인_것을.text
    assert 주인이_손님_것을.status_code == 204
