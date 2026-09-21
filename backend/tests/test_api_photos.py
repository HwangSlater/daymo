import hashlib
import io
import stat
import sys
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from PIL import Image
from sqlalchemy import func, select

from app.core.config import get_settings
from app.models import Membership, MembershipRole, Photo, PhotoLink, PhotoStatus, Trip
from app.services import photo_files
from app.services.photos import ORIGINAL_DAYS, purge_originals, purge_photos
from app.services.trips import purge_deleted_trips
from tests.test_api_places import 멤버로_넣는다, 여행_하나, 장소를_담는다
from tests.test_api_schedule import 일정을_넣는다
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


def png(width: int, height: int) -> bytes:
    """한 가지 색으로 칠한 PNG. 커도 파일은 작아서 한 장 한도(20MB)에 걸리지 않는다."""
    image = Image.new("RGB", (width, height), (30, 90, 160))
    # 왼쪽 위 귀퉁이만 다른 색이다. 줄인 그림이 제 모습인지 볼 자리다.
    image.paste((240, 220, 60), (0, 0, width // 4, height // 4))
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
        assert 그림.size == (1365, 2048)
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


async def test_큰_PNG는_원본만_그대로_두고_표시본은_줄여서_만든다(api, db, 사진_폴더):
    """
    PNG 는 JPEG 과 달리 작게 풀 수 없어 픽셀이 다 메모리에 올라온다. 상한 바로 아래
    크기를 넣어, 표시본을 만드는 동안 원래 크기의 그림을 여러 벌 들지 않는지 본다.
    작은 PNG 를 표시본 크기까지 늘려 버리지 않는 것도 같이 본다.
    """
    headers, _, trip = await 여행_하나(api)
    # 8M 픽셀 상한 바로 아래.
    큰 = png(3000, 2600)
    assert len(큰) < get_settings().photo_max_bytes

    _, 올림 = await 사진을_올린다(api, headers, trip["id"], 큰)
    _, 작은_올림 = await 사진을_올린다(api, headers, trip["id"], png(400, 300))

    assert 올림.status_code == 200, 올림.text
    사진 = 올림.json()["data"]
    # DB 에 남는 크기는 줄이기 전 원래 크기다.
    assert (사진["width"], 사진["height"]) == (3000, 2600)

    표시본 = await api.get(f"/v1/photos/{사진['id']}/content?variant=display", headers=headers)
    썸네일 = await api.get(f"/v1/photos/{사진['id']}/content?variant=thumbnail", headers=headers)
    받은_원본 = await api.get(f"/v1/photos/{사진['id']}/content?variant=original", headers=headers)
    with Image.open(io.BytesIO(표시본.content)) as 그림:
        assert 그림.size == (2048, 1775)
        # 귀퉁이 색이 그대로면 줄이는 차례가 어긋나지 않은 것이다.
        assert 그림.getpixel((100, 100))[0] > 200 and 그림.getpixel((2000, 1700))[2] > 100
    with Image.open(io.BytesIO(썸네일.content)) as 그림:
        assert max(그림.size) == 480
    # **원본은 그대로 둔다.** 30일 동안 받아 갈 수 있어야 한다.
    with Image.open(io.BytesIO(받은_원본.content)) as 그림:
        assert 그림.size == (3000, 2600)

    작은_사진 = 작은_올림.json()["data"]
    작은_표시본 = await api.get(f"/v1/photos/{작은_사진['id']}/content?variant=display", headers=headers)
    with Image.open(io.BytesIO(작은_표시본.content)) as 그림:
        assert 그림.size == (400, 300)


async def test_픽셀이_너무_많은_PNG는_형식_탓이_아니라_너무_크다고_답한다(api, db, 사진_폴더):
    """
    형식은 받는 것인데 그림만 큰 경우다. "JPEG, PNG, WebP 만 올릴 수 있어요" 라고
    답하면 PNG 를 올린 사람이 PNG 를 다시 고르게 된다.
    """
    headers, _, trip = await 여행_하나(api)

    _, 올림 = await 사진을_올린다(api, headers, trip["id"], png(4000, 2400))

    assert 올림.status_code == 413, 올림.text
    assert 올림.json()["error"]["code"] == "PHOTO_TOO_LARGE"
    assert "너무 커요" in 올림.json()["error"]["message"]
    # 반쯤 만든 폴더나 임시 파일이 남지 않는다.
    assert list((사진_폴더 / "tmp").iterdir()) == []
    assert not list(사진_폴더.glob("trips/*/*"))


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


async def test_accel_접두가_있으면_본문_없이_nginx_내부_주소와_형식만_답한다(api, db, monkeypatch):
    headers, _, trip = await 여행_하나(api)
    _, 올림 = await 사진을_올린다(api, headers, trip["id"], png_with_alpha())
    photo_id = 올림.json()["data"]["id"]
    남 = await 로그인한_사람(api, "stranger@example.com", "낯선이")
    monkeypatch.setattr(get_settings(), "photo_accel_prefix", "/_protected_uploads/")

    표시본 = await api.get(f"/v1/photos/{photo_id}/content?variant=display", headers=headers)
    원본 = await api.get(f"/v1/photos/{photo_id}/content?variant=original", headers=headers)
    남이_봄 = await api.get(f"/v1/photos/{photo_id}/content?variant=original", headers=남)

    내부 = f"/_protected_uploads/trips/{trip['id']}/{photo_id}"
    assert 표시본.status_code == 200 and 표시본.content == b""
    assert 표시본.headers["x-accel-redirect"] == f"{내부}/display.jpg"
    assert 표시본.headers["content-type"] == "image/jpeg"
    assert 표시본.headers["cache-control"] == "private, max-age=31536000, immutable"
    assert 표시본.headers["x-content-type-options"] == "nosniff"
    assert 원본.headers["x-accel-redirect"] == f"{내부}/original.png"
    assert 원본.headers["content-type"] == "image/png" and 원본.content == b""
    assert 남이_봄.status_code == 404 and "x-accel-redirect" not in 남이_봄.headers


def test_accel_주소는_조각마다_인코딩하고_업로드_폴더_밖은_거부한다(사진_폴더):
    assert photo_files.accel_uri("/_protected_uploads", "trips/a b/%3F.jpg") == "/_protected_uploads/trips/a%20b/%253F.jpg"
    assert photo_files.accel_uri("/_protected_uploads/", "trips/./x/../y.jpg") == "/_protected_uploads/trips/y.jpg"
    with pytest.raises(ValueError):
        photo_files.accel_uri("/_protected_uploads/", "../secret")


def test_사진_폴더는_그룹만_읽고_그_밖에는_못_읽는다(사진_폴더):
    """nginx(그룹 101)가 읽을 수 있어야 한다. setgid 는 호스트 폴더에서 물려받으므로 여기서 보지 않는다."""
    받은 = 사진_폴더 / "받은.jpg"
    받은.write_bytes(jpeg(400, 300))
    trip_id, photo_id = uuid.uuid4(), uuid.uuid4()

    photo_files.store(받은, trip_id, photo_id, ZoneInfo("Asia/Seoul"))

    폴더들 = [사진_폴더 / "trips", photo_files.trip_dir(trip_id), photo_files.photo_dir(trip_id, photo_id)]
    파일들 = list(photo_files.photo_dir(trip_id, photo_id).iterdir())
    assert all(폴더.is_dir() for 폴더 in 폴더들) and len(파일들) == 3
    if sys.platform == "win32":
        return  # Windows 의 chmod 는 읽기 전용 표시만 바꾼다.
    assert [oct(stat.S_IMODE(폴더.stat().st_mode) & 0o777) for 폴더 in 폴더들] == [oct(0o750)] * 3
    assert {oct(stat.S_IMODE(파일.stat().st_mode)) for 파일 in 파일들} == {oct(0o640)}


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


async def test_원본은_30일_뒤_사라지고_표시본과_썸네일은_남는다(api, db, 사진_폴더):
    headers, _, trip = await 여행_하나(api)
    _, 올림 = await 사진을_올린다(api, headers, trip["id"], jpeg(1200, 900))
    사진 = 올림.json()["data"]
    # 앱은 이 값으로 "언제까지 받을 수 있는지" 를 보여 준다.
    기한 = datetime.fromisoformat(사진["originalUntil"].replace("Z", "+00:00"))
    assert timedelta(days=ORIGINAL_DAYS) - timedelta(minutes=1) < 기한 - datetime.now(UTC)
    폴더 = 사진_폴더 / "trips" / trip["id"] / 사진["id"]
    잰_크기 = (await db.get(Photo, uuid.UUID(사진["id"]))).stored_bytes

    수 = await purge_originals(db, now=datetime.now(UTC) + timedelta(days=ORIGINAL_DAYS, minutes=1))

    assert 수 == 1
    assert not (폴더 / "original.jpg").exists()
    assert (폴더 / "display.jpg").is_file() and (폴더 / "thumbnail.jpg").is_file()
    # 공간 한도가 실제 디스크와 어긋나면 안 된다.
    줄 = await db.get(Photo, uuid.UUID(사진["id"]))
    assert 줄.original_path is None
    assert 줄.stored_bytes == (폴더 / "display.jpg").stat().st_size + (폴더 / "thumbnail.jpg").stat().st_size < 잰_크기

    목록 = await api.get(f"/v1/trips/{trip['id']}/photos", headers=headers)
    assert 목록.json()["data"][0]["originalUntil"] is None
    # 사진이 없는 것이 아니라 원본만 지난 것이다. 앱은 이걸 보고 표시본을 저장한다.
    받음 = await api.get(f"/v1/photos/{사진['id']}/content?variant=original", headers=headers)
    assert (받음.status_code, 받음.json()["error"]["code"]) == (410, "GONE")
    assert (await api.get(f"/v1/photos/{사진['id']}/content?variant=display", headers=headers)).status_code == 200


async def test_기한이_지나지_않은_원본은_그대로_둔다(api, db, 사진_폴더):
    headers, _, trip = await 여행_하나(api)
    _, 올림 = await 사진을_올린다(api, headers, trip["id"], jpeg(1200, 900))
    사진 = 올림.json()["data"]

    assert await purge_originals(db, now=datetime.now(UTC) + timedelta(days=ORIGINAL_DAYS - 1)) == 0
    assert (사진_폴더 / "trips" / trip["id"] / 사진["id"] / "original.jpg").is_file()
    assert (await api.get(f"/v1/photos/{사진['id']}/content?variant=original", headers=headers)).status_code == 200


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


# ---------------------------------------------------------------------------
# 붙은 곳(장소·일정·숙소)과 날짜로 찾기
# ---------------------------------------------------------------------------


async def 붙일_곳_셋(api, headers, trip_id):
    """장소 하나, 그 장소를 쓰는 숙소 하나, 일정 하나."""
    장소 = (await 장소를_담는다(api, headers, trip_id)).json()["data"]
    숙소 = (
        await api.post(
            f"/v1/trips/{trip_id}/stays",
            json={"tripPlaceId": 장소["id"], "checkInAt": "2026-10-01T15:00", "checkOutAt": "2026-10-03T11:00"},
            headers=headers,
        )
    ).json()["data"]
    일정 = (await 일정을_넣는다(api, headers, trip_id)).json()["data"]
    return 장소, 숙소, 일정


async def test_사진을_장소_일정_숙소에_붙이고_그곳으로_찾는다(api, db):
    headers, _, trip = await 여행_하나(api)
    장소, 숙소, 일정 = await 붙일_곳_셋(api, headers, trip["id"])

    만듦, 올림 = await 사진을_올린다(
        api, headers, trip["id"], jpeg(400, 300), date="2026-10-02",
        links=[{"targetType": "place", "targetId": 장소["id"]}, {"targetType": "stay", "targetId": 숙소["id"]}],
    )
    붙은_곳 = {(link["targetType"], link["targetId"]) for link in 올림.json()["data"]["links"]}
    숙소로 = await api.get(f"/v1/trips/{trip['id']}/photos?targetType=stay&targetId={숙소['id']}", headers=headers)
    일정으로 = await api.get(f"/v1/trips/{trip['id']}/photos?targetType=schedule&targetId={일정['id']}", headers=headers)
    날짜로 = await api.get(f"/v1/trips/{trip['id']}/photos?date=2026-10-02", headers=headers)
    다른_날짜로 = await api.get(f"/v1/trips/{trip['id']}/photos?date=2026-10-03", headers=headers)

    assert 붙은_곳 == {("place", 장소["id"]), ("stay", 숙소["id"])}
    assert [사진["id"] for 사진 in 숙소로.json()["data"]] == [만듦.json()["data"]["id"]]
    assert 일정으로.json()["data"] == []
    assert len(날짜로.json()["data"]) == 1
    assert 다른_날짜로.json()["data"] == []


async def test_붙은_곳은_보낸_목록으로_통째로_바뀌고_빈_목록이면_다_떨어진다(api, db):
    headers, _, trip = await 여행_하나(api)
    장소, 숙소, 일정 = await 붙일_곳_셋(api, headers, trip["id"])
    만듦, _ = await 사진을_올린다(
        api, headers, trip["id"], jpeg(400, 300), links=[{"targetType": "place", "targetId": 장소["id"]}]
    )
    사진_id = 만듦.json()["data"]["id"]

    바꿈 = await api.patch(
        f"/v1/photos/{사진_id}",
        json={"version": 1, "links": [{"targetType": "schedule", "targetId": 일정["id"]}]},
        headers=headers,
    )
    뗌 = await api.patch(f"/v1/photos/{사진_id}", json={"version": 2, "links": []}, headers=headers)
    설명만 = await api.patch(f"/v1/photos/{사진_id}", json={"version": 3, "caption": "노을"}, headers=headers)

    assert [(link["targetType"], link["targetId"]) for link in 바꿈.json()["data"]["links"]] == [("schedule", 일정["id"])]
    assert 뗌.json()["data"]["links"] == []
    # 연결을 보내지 않은 수정은 붙은 곳을 건드리지 않는다.
    assert 설명만.json()["data"]["links"] == []
    assert await db.scalar(select(func.count()).select_from(PhotoLink).where(PhotoLink.photo_id == uuid.UUID(사진_id))) == 0


async def test_다른_여행의_장소나_없는_곳에는_붙지_않고_날짜는_연결이_아니다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    다른_여행 = (
        await api.post(
            f"/v1/spaces/{space_id}/trips",
            json={"title": "다른 여행", "startDate": "2026-11-01", "endDate": "2026-11-02"},
            headers=headers,
        )
    ).json()["data"]
    남의_장소 = (await 장소를_담는다(api, headers, 다른_여행["id"], name="남의집")).json()["data"]
    만듦, _ = await 사진을_올린다(api, headers, trip["id"], jpeg(400, 300))
    사진_id = 만듦.json()["data"]["id"]

    남의_것 = await api.patch(
        f"/v1/photos/{사진_id}",
        json={"version": 1, "links": [{"targetType": "place", "targetId": 남의_장소["id"]}]},
        headers=headers,
    )
    없는_것 = await api.patch(
        f"/v1/photos/{사진_id}",
        json={"version": 1, "links": [{"targetType": "place", "targetId": str(uuid.uuid4())}]},
        headers=headers,
    )
    날짜로 = await api.patch(
        f"/v1/photos/{사진_id}",
        json={"version": 1, "links": [{"targetType": "day", "targetId": str(uuid.uuid4())}]},
        headers=headers,
    )
    반쪽_질의 = await api.get(f"/v1/trips/{trip['id']}/photos?targetType=stay", headers=headers)

    assert (남의_것.status_code, 없는_것.status_code, 날짜로.status_code) == (422, 422, 422)
    assert 반쪽_질의.status_code == 422
    # 막힌 요청은 version 을 올리지 않는다.
    assert (await db.get(Photo, uuid.UUID(사진_id))).version == 1


async def test_붙은_곳도_올린_사람과_owner만_고치고_장소를_빼면_연결이_떨어진다(api, db):
    headers, space_id, trip = await 여행_하나(api)
    장소, _, _ = await 붙일_곳_셋(api, headers, trip["id"])
    만듦, _ = await 사진을_올린다(
        api, headers, trip["id"], jpeg(400, 300), links=[{"targetType": "place", "targetId": 장소["id"]}]
    )
    사진_id = 만듦.json()["data"]["id"]
    남 = await 멤버로_넣는다(api, db, space_id, "editor@example.com", MembershipRole.EDITOR)

    남의_수정 = await api.patch(f"/v1/photos/{사진_id}", json={"version": 1, "links": []}, headers=남)
    뺌 = await api.delete(f"/v1/trip-places/{장소['id']}", headers=headers)
    남은_사진 = await api.get(f"/v1/trips/{trip['id']}/photos", headers=headers)

    assert 남의_수정.status_code == 403
    assert 뺌.status_code == 204
    # 장소를 빼도 사진은 남고 연결만 떨어진다.
    assert [사진["id"] for 사진 in 남은_사진.json()["data"]] == [사진_id]
    assert 남은_사진.json()["data"][0]["links"] == []
