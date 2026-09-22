import io
import uuid

import pytest
from PIL import Image

from app.core.config import get_settings
from app.services.trip_cards import MAX_CARDS_PER_TRIP
from tests.test_api_trips import 공간을_만든다, 로그인한_사람, 여행을_만든다

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def 사진_폴더(tmp_path, monkeypatch):
    """테스트마다 빈 폴더에 둔다. 카드 이미지와 카드에 넣을 사진이 여기에 쌓인다."""
    monkeypatch.setattr(get_settings(), "upload_root", str(tmp_path))
    return tmp_path


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


async def test_종이를_끼우지_않는_프레임도_저장된다(api, db):
    # 사진에 스티커와 글자만 얹고 싶은 사람이 있다. 그런 사람에게 필름도 엽서도
    # 거추장스러운 테두리라, 아무 프레임도 안 고를 길이 있어야 한다.
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)

    맨몸 = await 카드를_만든다(api, headers, trip["id"], style="없음", ratio="정사각")

    assert 맨몸["settings"]["style"] == "없음"
    # 종이가 없어도 비율은 살아 있다. 사진을 어떤 비율로 담을지는 여전히 고를 일이다.
    assert 맨몸["settings"]["ratio"] == "정사각"


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


async def test_카드에_든_사진을_지워도_그_카드를_계속_고칠_수_있다(api, db):
    """
    앱은 카드를 고칠 때 꾸민 값을 통째로 되돌려 보낸다. 보낸 사진을 전부 검사하면
    사진 한 장을 지운 날부터 그 카드는 글자 한 줄도 못 고치고 빠져나갈 길이 없다.
    """
    headers = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, headers)
    trip = await 여행을_만든다(api, headers, space_id)
    사진 = await 사진_하나(api, headers, trip["id"])
    남은_사진 = await 사진_하나(api, headers, trip["id"])
    카드 = await 카드를_만든다(api, headers, trip["id"], style="네컷", photoIds=[사진, 남은_사진])

    assert (await api.delete(f"/v1/photos/{사진}", headers=headers)).status_code == 204

    고침 = await api.patch(
        f"/v1/trip-cards/{카드['id']}",
        json={
            "version": 카드["version"],
            "settings": {
                "style": "네컷 격자",
                "caption": "그날 비가 왔다",
                "photoIds": [사진, 남은_사진],
            },
        },
        headers=headers,
    )

    assert 고침.status_code == 200, 고침.text
    assert 고침.json()["data"]["settings"]["caption"] == "그날 비가 왔다"
    # 죽은 id 는 카드에 남는다. 사람이 그 자리를 새 사진으로 바꾸면 사라진다.
    assert 고침.json()["data"]["settings"]["photoIds"] == [사진, 남은_사진]


async def test_카드를_고치며_남의_사진을_새로_끼울_수는_없다(api, db):
    """이미 들어 있던 id 만 지나간다. 새로 고른 사진은 그대로 그 여행 것인지 본다."""
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
    카드 = await 카드를_만든다(api, headers, trip["id"], style="네컷")

    응답 = await api.patch(
        f"/v1/trip-cards/{카드['id']}",
        json={"version": 카드["version"], "settings": {"style": "네컷", "photoIds": [남의_사진]}},
        headers=headers,
    )

    assert 응답.status_code == 422


def 카드_그림(width=1200, height=1600, *, 투명=False) -> bytes:
    """앱이 그려 올리는 카드 한 장. 투명이면 왼쪽 위만 칠하고 나머지는 비운다."""
    if 투명:
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        image.paste((20, 60, 140, 255), (0, 0, width // 2, height // 2))
        형식 = "PNG"
    else:
        image = Image.new("RGB", (width, height), (230, 200, 160))
        형식 = "JPEG"
    buffer = io.BytesIO()
    image.save(buffer, 형식)
    return buffer.getvalue()


async def 이미지를_올린다(api, headers, card_id: str, version: int, content: bytes, 형식="image/png"):
    return await api.put(
        f"/v1/trip-cards/{card_id}/image?version={version}",
        content=content,
        headers={**headers, "Content-Type": 형식},
    )


async def 둘이_쓰는_여행(api):
    """주인(owner)과 초대로 들어온 손님(editor)이 함께 쓰는 공간의 여행 하나."""
    from tests.test_api_members import token_of, 초대를_만든다

    주인 = await 로그인한_사람(api, "sky@example.com")
    space_id = await 공간을_만든다(api, 주인)
    초대 = await 초대를_만든다(api, 주인, space_id)
    손님 = await 로그인한_사람(api, "sea@example.com", "여울")
    await api.post("/v1/invites/accept", json={"token": token_of(초대)}, headers=손님)
    trip = await 여행을_만든다(api, 주인, space_id)
    return 주인, 손님, space_id, trip


async def test_완성_이미지를_올리면_줄이지_않은_JPEG_로_두고_imageVersion_이_채워진다(api, db, 사진_폴더):
    from app.services.photos import used_bytes

    주인, 손님, space_id, trip = await 둘이_쓰는_여행(api)
    카드 = await 카드를_만든다(api, 주인, trip["id"], style="네컷")
    assert 카드["imageVersion"] is None

    올림 = await 이미지를_올린다(api, 주인, 카드["id"], 카드["version"], 카드_그림(2400, 3200, 투명=True))

    assert 올림.status_code == 200, 올림.text
    assert 올림.json()["data"]["imageVersion"] == 카드["version"] == 올림.json()["data"]["version"]
    파일 = 사진_폴더 / "trips" / trip["id"] / "cards" / f"{카드['id']}-v{카드['version']}.jpg"
    assert 파일.is_file()
    with Image.open(파일) as 그림:
        assert 그림.format == "JPEG" and 그림.mode == "RGB"
        # 긴 변을 줄이지 않는다. 원본 화질로 그린 그림을 남기려는 것이다.
        assert 그림.size == (2400, 3200)
        # 투명한 자리는 흰 바탕이다.
        assert all(값 >= 250 for 값 in 그림.getpixel((2000, 3000)))
        assert 그림.getpixel((10, 10))[2] > 100
    # 공간 저장 한도에 사진과 함께 센다.
    assert await used_bytes(db, space_id=uuid.UUID(space_id)) == 파일.stat().st_size

    # 상대도 목록에서 같은 값을 보고 이미지를 받는다.
    목록 = (await api.get(f"/v1/trips/{trip['id']}/cards", headers=손님)).json()["data"]
    받음 = await api.get(f"/v1/trip-cards/{카드['id']}/image", headers=손님)
    assert 목록[0]["imageVersion"] == 카드["version"]
    assert 받음.status_code == 200
    assert 받음.headers["content-type"] == "image/jpeg"
    assert 받음.headers["cache-control"] == "private, no-cache"
    assert 받음.content == 파일.read_bytes()


async def test_그사이_카드가_바뀌었으면_옛_그림이라_409(api, db, 사진_폴더):
    주인, _, _, trip = await 둘이_쓰는_여행(api)
    카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")
    await api.patch(
        f"/v1/trip-cards/{카드['id']}",
        json={"version": 카드["version"], "settings": {"style": "엽서"}},
        headers=주인,
    )

    묵은_그림 = await 이미지를_올린다(api, 주인, 카드["id"], 카드["version"], 카드_그림())

    assert 묵은_그림.status_code == 409, 묵은_그림.text
    assert not (사진_폴더 / "trips" / trip["id"] / "cards").exists()


async def test_카드를_고칠_수_없는_사람은_이미지도_못_올린다(api, db):
    주인, 손님, _, trip = await 둘이_쓰는_여행(api)
    주인_카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")
    손님_카드 = await 카드를_만든다(api, 손님, trip["id"], style="엽서")

    손님이_주인_것에 = await 이미지를_올린다(api, 손님, 주인_카드["id"], 1, 카드_그림())
    손님이_자기_것에 = await 이미지를_올린다(api, 손님, 손님_카드["id"], 1, 카드_그림(), "image/jpeg")
    # owner 는 남이 만든 카드도 고치므로 이미지도 올린다.
    주인이_손님_것에 = await 이미지를_올린다(api, 주인, 손님_카드["id"], 1, 카드_그림())

    assert 손님이_주인_것에.status_code == 403, 손님이_주인_것에.text
    assert 손님이_자기_것에.status_code == 200, 손님이_자기_것에.text
    assert 주인이_손님_것에.status_code == 200, 주인이_손님_것에.text


async def test_이미지가_아니거나_비었거나_너무_크면_받지_않는다(api, db, monkeypatch):
    주인, _, _, trip = await 둘이_쓰는_여행(api)
    카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")
    gif = io.BytesIO()
    Image.new("RGB", (10, 10)).save(gif, "GIF")

    글자 = await 이미지를_올린다(api, 주인, 카드["id"], 1, b"not an image at all")
    움짤 = await 이미지를_올린다(api, 주인, 카드["id"], 1, gif.getvalue(), "image/gif")
    빈_것 = await 이미지를_올린다(api, 주인, 카드["id"], 1, b"")
    버전_없음 = await api.put(f"/v1/trip-cards/{카드['id']}/image", content=카드_그림(), headers=주인)
    monkeypatch.setattr(get_settings(), "trip_card_image_max_bytes", 100)
    큰_것 = await 이미지를_올린다(api, 주인, 카드["id"], 1, 카드_그림())

    assert 글자.status_code == 422, 글자.text
    assert 움짤.status_code == 422, 움짤.text
    assert 빈_것.status_code == 422, 빈_것.text
    assert 버전_없음.status_code == 422, 버전_없음.text
    assert 큰_것.status_code == 413, 큰_것.text
    다시_봄 = (await api.get(f"/v1/trips/{trip['id']}/cards", headers=주인)).json()["data"][0]
    assert 다시_봄["imageVersion"] is None


async def test_이미지는_공간_멤버만_받고_없으면_404(api, db):
    주인, _, _, trip = await 둘이_쓰는_여행(api)
    카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")

    아직_없음 = await api.get(f"/v1/trip-cards/{카드['id']}/image", headers=주인)
    await 이미지를_올린다(api, 주인, 카드["id"], 1, 카드_그림())
    남이_받음 = await api.get(f"/v1/trip-cards/{카드['id']}/image", headers=남)
    남이_올림 = await 이미지를_올린다(api, 남, 카드["id"], 1, 카드_그림())

    assert 아직_없음.status_code == 404
    assert 남이_받음.status_code == 404
    assert 남이_올림.status_code == 404


async def test_accel_접두가_있으면_카드_이미지도_nginx_가_보낸다(api, db, monkeypatch):
    주인, _, _, trip = await 둘이_쓰는_여행(api)
    카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")
    await 이미지를_올린다(api, 주인, 카드["id"], 1, 카드_그림())
    monkeypatch.setattr(get_settings(), "photo_accel_prefix", "/_protected_uploads/")

    받음 = await api.get(f"/v1/trip-cards/{카드['id']}/image", headers=주인)

    assert 받음.status_code == 200 and 받음.content == b""
    assert 받음.headers["x-accel-redirect"] == f"/_protected_uploads/trips/{trip['id']}/cards/{카드['id']}-v1.jpg"
    assert 받음.headers["content-type"] == "image/jpeg"


async def test_카드를_고치면_이미지가_옛것이_되고_다시_올리면_옛_파일을_지운다(api, db, 사진_폴더):
    주인, _, _, trip = await 둘이_쓰는_여행(api)
    카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")
    await 이미지를_올린다(api, 주인, 카드["id"], 1, 카드_그림())
    폴더 = 사진_폴더 / "trips" / trip["id"] / "cards"

    고침 = (
        await api.patch(
            f"/v1/trip-cards/{카드['id']}",
            json={"version": 1, "settings": {"style": "엽서"}},
            headers=주인,
        )
    ).json()["data"]
    # 고친 뒤에는 옛 그림이다. 파일은 다음에 올릴 때까지 둔다.
    assert (고침["version"], 고침["imageVersion"]) == (2, 1)
    assert (폴더 / f"{카드['id']}-v1.jpg").is_file()
    assert (await api.get(f"/v1/trip-cards/{카드['id']}/image", headers=주인)).status_code == 200

    다시 = await 이미지를_올린다(api, 주인, 카드["id"], 2, 카드_그림(900, 900))

    assert 다시.status_code == 200, 다시.text
    assert 다시.json()["data"]["imageVersion"] == 2
    assert sorted(파일.name for 파일 in 폴더.iterdir()) == [f"{카드['id']}-v2.jpg"]
    받음 = await api.get(f"/v1/trip-cards/{카드['id']}/image", headers=주인)
    with Image.open(io.BytesIO(받음.content)) as 그림:
        assert 그림.size == (900, 900)


async def test_같은_버전을_두_번_올려도_파일은_하나다(api, db, 사진_폴더):
    주인, _, _, trip = await 둘이_쓰는_여행(api)
    카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")

    await 이미지를_올린다(api, 주인, 카드["id"], 1, 카드_그림(800, 800))
    다시 = await 이미지를_올린다(api, 주인, 카드["id"], 1, 카드_그림(600, 600))

    assert 다시.status_code == 200
    폴더 = 사진_폴더 / "trips" / trip["id"] / "cards"
    assert [파일.name for 파일 in 폴더.iterdir()] == [f"{카드['id']}-v1.jpg"]
    with Image.open(폴더 / f"{카드['id']}-v1.jpg") as 그림:
        assert 그림.size == (600, 600)


async def test_카드를_지우면_이미지_파일도_지운다(api, db, 사진_폴더):
    주인, _, _, trip = await 둘이_쓰는_여행(api)
    카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")
    남는_카드 = await 카드를_만든다(api, 주인, trip["id"], style="엽서")
    await 이미지를_올린다(api, 주인, 카드["id"], 1, 카드_그림())
    await 이미지를_올린다(api, 주인, 남는_카드["id"], 1, 카드_그림())
    폴더 = 사진_폴더 / "trips" / trip["id"] / "cards"

    지움 = await api.delete(f"/v1/trip-cards/{카드['id']}", headers=주인)

    assert 지움.status_code == 204
    assert [파일.name for 파일 in 폴더.iterdir()] == [f"{남는_카드['id']}-v1.jpg"]


async def test_여행을_완전히_지우면_카드_이미지도_여행_폴더째_사라진다(api, db, 사진_폴더):
    from datetime import UTC, datetime, timedelta

    from app.models import Trip
    from app.services.trips import purge_deleted_trips

    주인, _, _, trip = await 둘이_쓰는_여행(api)
    카드 = await 카드를_만든다(api, 주인, trip["id"], style="필름")
    await 이미지를_올린다(api, 주인, 카드["id"], 1, 카드_그림())
    assert (사진_폴더 / "trips" / trip["id"] / "cards").is_dir()

    여행 = await db.get(Trip, uuid.UUID(trip["id"]))
    여행.deleted_at = datetime.now(UTC) - timedelta(days=40)
    여행.deletion_scheduled_at = datetime.now(UTC) - timedelta(days=1)
    await db.flush()
    await purge_deleted_trips(db)

    assert not (사진_폴더 / "trips" / trip["id"]).exists()
