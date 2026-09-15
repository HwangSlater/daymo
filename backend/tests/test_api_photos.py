import hashlib
import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from PIL import Image
from sqlalchemy import select

from app.core.config import get_settings
from app.models import Membership, MembershipRole, Photo, PhotoStatus, Trip
from app.services.photos import purge_photos
from app.services.trips import purge_deleted_trips
from tests.test_api_places import 멤버로_넣는다, 여행_하나
from tests.test_api_trips import 로그인한_사람

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def 사진_폴더(tmp_path, monkeypatch):
    """테스트마다 빈 폴더에 올린다. 운영 경로나 다른 테스트의 파일을 건드리지 않는다."""
    monkeypatch.setattr(get_settings(), "upload_root", str(tmp_path))
    return tmp_path


def jpeg(width=3000, height=2000, *, orientation=None, taken="2026:10:02 09:30:00", gps=True) -> bytes:
    image = Image.new("RGB", (width, height), (200, 120, 90))
    exif = Image.Exif()
    exif[0x0110] = "테스트 기기"  # Model
    if orientation:
        exif[0x0112] = orientation
    if taken:
        exif.get_ifd(0x8769)[0x9003] = taken
    if gps:
        exif.get_ifd(0x8825)[2] = (37.0, 30.0, 0.0)
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif, quality=90)
    return buffer.getvalue()


def png_with_alpha() -> bytes:
    image = Image.new("RGBA", (800, 600), (0, 0, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


async def 사진을_올린다(api, headers, trip_id, content: bytes, **값):
    본문 = {"bytes": len(content), "checksum": hashlib.sha256(content).hexdigest(), **값}
    만듦 = await api.post(f"/v1/trips/{trip_id}/photos", json=본문, headers=headers)
    assert 만듦.status_code in (200, 201), 만듦.text
    photo_id = 만듦.json()["data"]["id"]
    올림 = await api.put(f"/v1/photos/{photo_id}/content", content=content, headers={**headers, "Content-Type": "image/jpeg"})
    return 만듦, 올림


async def test_사진을_올리면_방향을_바로잡은_표시본과_썸네일이_생기고_위치정보가_빠진다(api, db, 사진_폴더):
    headers, _, trip = await 여행_하나(api)
    원본 = jpeg(orientation=6)

    만듦, 올림 = await 사진을_올린다(api, headers, trip["id"], 원본, caption=" 전주 한옥마을 ", date="2026-10-02")

    assert 만듦.json()["data"]["status"] == "uploading"
    사진 = 올림.json()["data"]
    assert 올림.status_code == 200, 올림.text
    assert (사진["status"], 사진["caption"], 사진["date"], 사진["width"], 사진["height"]) == ("ready", "전주 한옥마을", "2026-10-02", 2000, 3000)
    assert 사진["takenAt"] == "2026-10-02T00:30:00Z"

    표시본 = await api.get(f"/v1/photos/{사진['id']}/content?variant=display", headers=headers)
    썸네일 = await api.get(f"/v1/photos/{사진['id']}/content?variant=thumbnail", headers=headers)
    받은_원본 = await api.get(f"/v1/photos/{사진['id']}/content?variant=original", headers=headers)
    assert 표시본.headers["cache-control"].startswith("private")
    with Image.open(io.BytesIO(표시본.content)) as 그림:
        assert 그림.size == (960, 1440)
        assert not 그림.getexif()
    with Image.open(io.BytesIO(썸네일.content)) as 그림:
        assert max(그림.size) == 480
    # 원본은 그림 데이터가 같고, 위치·기기 정보는 빠지고, 방향과 찍은 시각은 남는다.
    with Image.open(io.BytesIO(받은_원본.content)) as 받음, Image.open(io.BytesIO(원본)) as 보냄:
        assert 받음.tobytes() == 보냄.tobytes()
        exif = 받음.getexif()
        assert exif.get(0x0112) == 6 and 0x0110 not in exif
        assert not exif.get_ifd(0x8825)
        assert exif.get_ifd(0x8769).get(0x9003) == "2026:10:02 09:30:00"
    assert list((사진_폴더 / "tmp").iterdir()) == []


async def test_투명한_PNG도_받고_목록에는_영수증과_올리는_중인_사진이_없다(api, db):
    headers, _, trip = await 여행_하나(api)

    _, png = await 사진을_올린다(api, headers, trip["id"], png_with_alpha())
    await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300), isReceipt=True)
    내용 = jpeg(400, 300, taken=None)
    await api.post(
        f"/v1/trips/{trip['id']}/photos",
        json={"bytes": len(내용), "checksum": hashlib.sha256(내용).hexdigest()},
        headers=headers,
    )
    목록 = (await api.get(f"/v1/trips/{trip['id']}/photos", headers=headers)).json()["data"]

    assert png.status_code == 200 and png.json()["data"]["takenAt"] is None
    assert [item["id"] for item in 목록] == [png.json()["data"]["id"]]


async def test_보낸다고_한_파일과_다르거나_사진이_아니면_받지_않는다(api, db):
    headers, _, trip = await 여행_하나(api)
    진짜 = jpeg(400, 300)
    만듦 = await api.post(
        f"/v1/trips/{trip['id']}/photos", json={"bytes": len(진짜), "checksum": hashlib.sha256(진짜).hexdigest()}, headers=headers
    )
    photo_id = 만듦.json()["data"]["id"]

    다른_파일 = await api.put(f"/v1/photos/{photo_id}/content", content=jpeg(401, 300), headers=headers)
    가짜 = b"<html>not a photo</html>"
    가짜_줄 = await api.post(
        f"/v1/trips/{trip['id']}/photos", json={"bytes": len(가짜), "checksum": hashlib.sha256(가짜).hexdigest()}, headers=headers
    )
    사진_아님 = await api.put(f"/v1/photos/{가짜_줄.json()['data']['id']}/content", content=가짜, headers=headers)
    다시 = await api.put(f"/v1/photos/{photo_id}/content", content=진짜, headers=headers)

    assert 다른_파일.status_code == 422 and "checksum" in 다른_파일.text
    assert 사진_아님.status_code == 422 and "JPEG" in 사진_아님.text
    assert 다시.status_code == 200 and 다시.json()["data"]["status"] == "ready"


async def test_한_장_한도와_공간_한도를_넘기면_413이다(api, db, monkeypatch):
    headers, _, trip = await 여행_하나(api)
    내용 = jpeg(400, 300)
    monkeypatch.setattr(get_settings(), "photo_max_bytes", len(내용) - 1)

    한_장 = await api.post(
        f"/v1/trips/{trip['id']}/photos", json={"bytes": len(내용), "checksum": hashlib.sha256(내용).hexdigest()}, headers=headers
    )
    monkeypatch.setattr(get_settings(), "photo_max_bytes", 20 * 1024 * 1024)
    monkeypatch.setattr(get_settings(), "photo_space_quota_bytes", len(내용) * 2)
    await 사진을_올린다(api, headers, trip["id"], 내용)
    공간 = await api.post(
        f"/v1/trips/{trip['id']}/photos", json={"bytes": len(내용) * 2, "checksum": "a" * 64}, headers=headers
    )

    assert 한_장.status_code == 413 and 한_장.json()["error"]["code"] == "PHOTO_TOO_LARGE"
    assert 공간.status_code == 413 and 공간.json()["error"]["code"] == "STORAGE_QUOTA_EXCEEDED"


async def test_받는_중에_한도를_넘기면_끊고_임시_파일을_남기지_않는다(api, db, monkeypatch, 사진_폴더):
    headers, _, trip = await 여행_하나(api)
    내용 = jpeg(400, 300)
    만듦 = await api.post(
        f"/v1/trips/{trip['id']}/photos", json={"bytes": 10, "checksum": hashlib.sha256(내용).hexdigest()}, headers=headers
    )
    monkeypatch.setattr(get_settings(), "photo_max_bytes", 100)

    async def 조금씩():
        for 시작 in range(0, len(내용), 64):
            yield 내용[시작 : 시작 + 64]

    응답 = await api.put(f"/v1/photos/{만듦.json()['data']['id']}/content", content=조금씩(), headers=headers)

    assert 응답.status_code == 413
    assert list((사진_폴더 / "tmp").iterdir()) == []


async def test_설명과_날짜는_올린_사람과_owner만_고치고_지운다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    editor = await 멤버로_넣는다(api, db, space_id, "editor@example.com", MembershipRole.EDITOR)
    _, 내_사진 = await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300))
    _, 남의_사진 = await 사진을_올린다(api, editor, trip["id"], jpeg(410, 300))
    내_id, 남의_id = 내_사진.json()["data"]["id"], 남의_사진.json()["data"]["id"]

    editor가_고침 = await api.patch(f"/v1/photos/{내_id}", json={"version": 1, "caption": "x"}, headers=editor)
    editor가_지움 = await api.delete(f"/v1/photos/{내_id}", headers=editor)
    editor가_올림 = await api.put(f"/v1/photos/{내_id}/content", content=b"x", headers=editor)
    owner가_고침 = await api.patch(f"/v1/photos/{남의_id}", json={"version": 1, "caption": "여울이 찍은 사진", "date": "2026-10-01"}, headers=headers)
    낡음 = await api.patch(f"/v1/photos/{남의_id}", json={"version": 1, "caption": "y"}, headers=headers)
    owner가_지움 = await api.delete(f"/v1/photos/{남의_id}", headers=headers)
    지운_뒤_내용 = await api.get(f"/v1/photos/{남의_id}/content", headers=headers)

    assert (editor가_고침.status_code, editor가_지움.status_code, editor가_올림.status_code) == (403, 403, 403)
    assert owner가_고침.json()["data"]["caption"] == "여울이 찍은 사진" and owner가_고침.json()["data"]["date"] == "2026-10-01"
    assert 낡음.status_code == 409
    assert owner가_지움.status_code == 204
    assert 지운_뒤_내용.status_code == 404


async def test_남의_공간_사진은_내용도_404다(api, db):
    headers, _, trip = await 여행_하나(api)
    _, 올림 = await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300))
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")

    응답 = await api.get(f"/v1/photos/{올림.json()['data']['id']}/content?variant=original", headers=남)

    assert 응답.status_code == 404


async def test_정리_작업은_지운_지_7일_지난_사진과_오래_멈춘_올리기를_파일째_지운다(api, db, 사진_폴더):
    headers, _, trip = await 여행_하나(api)
    _, 지울_것 = await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300))
    _, 남길_것 = await 사진을_올린다(api, headers, trip["id"], jpeg(410, 300))
    멈춘 = await api.post(f"/v1/trips/{trip['id']}/photos", json={"bytes": 10, "checksum": "b" * 64}, headers=headers)
    await api.delete(f"/v1/photos/{지울_것.json()['data']['id']}", headers=headers)
    지난_주 = datetime.now(UTC) + timedelta(days=8)

    수 = await purge_photos(db, now=지난_주)

    남은_id = set((await db.execute(select(Photo.id))).scalars())
    assert 수 == 2
    assert uuid.UUID(남길_것.json()["data"]["id"]) in 남은_id
    assert uuid.UUID(지울_것.json()["data"]["id"]) not in 남은_id
    assert uuid.UUID(멈춘.json()["data"]["id"]) not in 남은_id
    assert not (사진_폴더 / "trips" / trip["id"] / 지울_것.json()["data"]["id"]).exists()
    assert (사진_폴더 / "trips" / trip["id"] / 남길_것.json()["data"]["id"] / "display.jpg").is_file()


async def test_기한이_지난_여행을_지우면_사진_폴더도_지운다(api, db, 사진_폴더):
    headers, _, trip = await 여행_하나(api)
    await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300))
    여행 = await db.get(Trip, uuid.UUID(trip["id"]))
    여행.deleted_at = datetime.now(UTC) - timedelta(days=8)
    여행.deletion_scheduled_at = datetime.now(UTC) - timedelta(days=1)
    await db.flush()

    assert await purge_deleted_trips(db) == 1
    assert not (사진_폴더 / "trips" / trip["id"]).exists()
    assert (await db.execute(select(Photo).where(Photo.status == PhotoStatus.READY))).first() is None


async def test_지출에_같은_여행의_영수증_사진만_붙인다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    나 = await db.scalar(select(Membership.id).where(Membership.space_id == uuid.UUID(space_id)))
    만듦, _ = await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300), isReceipt=True)
    영수증 = 만듦.json()["data"]["id"]
    다른_여행 = (await api.post(f"/v1/spaces/{space_id}/trips", json={"title": "다른 여행", "startDate": "2026-11-01", "endDate": "2026-11-02"}, headers=headers)).json()["data"]

    지출 = await api.post(
        f"/v1/trips/{trip['id']}/expenses",
        json={"title": "점심", "amount": 12000, "payerMembershipId": str(나), "receiptPhotoId": 영수증},
        headers=headers,
    )
    뗌 = await api.patch(f"/v1/expenses/{지출.json()['data']['id']}", json={"version": 1, "receiptPhotoId": None}, headers=headers)
    다른_여행_지출 = await api.post(
        f"/v1/trips/{다른_여행['id']}/expenses",
        json={"title": "x", "amount": 1, "payerMembershipId": str(나), "receiptPhotoId": 영수증},
        headers=headers,
    )

    assert 지출.status_code == 201, 지출.text
    assert 지출.json()["data"]["receiptPhotoId"] == 영수증
    assert 뗌.json()["data"]["receiptPhotoId"] is None
    assert 다른_여행_지출.status_code == 422


def test_PNG과_WebP의_메타데이터_조각도_뺀다(tmp_path):
    from app.services.photo_metadata import strip_location

    그림 = Image.new("RGB", (40, 30), (10, 120, 200))
    exif = Image.Exif()
    exif.get_ifd(0x8825)[2] = (37.0, 30.0, 0.0)
    png = tmp_path / "a.png"
    그림.save(png, "PNG", exif=exif)
    webp = tmp_path / "a.webp"
    그림.save(webp, "WEBP", exif=exif, lossless=True)

    strip_location(png, "PNG")
    strip_location(webp, "WEBP")

    for 파일 in (png, webp):
        with Image.open(파일) as 열림:
            assert 열림.tobytes() == 그림.tobytes()
            assert not 열림.getexif().get_ifd(0x8825)
