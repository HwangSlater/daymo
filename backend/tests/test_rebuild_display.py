"""
옛 크기(1440px)로 만든 표시본을 원본에서 다시 만드는 작업.

옛 표시본은 올릴 때 `DISPLAY_EDGE` 를 1440 으로 바꿔 두고 만든다. 지금 크기로만
올리면 "이미 새 크기" 로 빠져서 다시 만드는 길을 지나지 않는다.
"""

import stat
import sys
from datetime import UTC, datetime, timedelta

import pytest
from PIL import Image

from app.core.config import get_settings
from app.jobs import rebuild_display
from app.services import photo_files
from app.services.photos import ORIGINAL_DAYS, purge_originals
from tests.test_api_photos import jpeg, 사진을_올린다
from tests.test_api_places import 여행_하나

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def 사진_폴더(tmp_path, monkeypatch):
    """test_api_photos 와 같다. 테스트마다 빈 폴더에 올린다."""
    monkeypatch.setattr(get_settings(), "upload_root", str(tmp_path))
    return tmp_path


async def 옛_크기로_올린다(api, monkeypatch, content: bytes, *, 여행=None):
    """`여행` 은 (headers, trip). 없으면 새로 만든다. 한 테스트에서 가입은 한 번만 된다."""
    headers, trip = 여행 or (await 여행_하나(api))[::2]
    with monkeypatch.context() as 잠깐:
        잠깐.setattr(photo_files, "DISPLAY_EDGE", 1440)
        _, 올림 = await 사진을_올린다(api, headers, trip["id"], content)
    assert 올림.status_code == 200, 올림.text
    사진 = 올림.json()["data"]
    return trip["id"], 사진["id"], (headers, trip)


def 표시본(폴더, trip_id, photo_id):
    return 폴더 / "trips" / trip_id / photo_id / "display.jpg"


def 긴_변(path) -> int:
    with Image.open(path) as 그림:
        return max(그림.size)


async def test_원본이_있으면_표시본을_새_긴_변으로_다시_만든다(api, db, monkeypatch, 사진_폴더):
    trip_id, photo_id, _ = await 옛_크기로_올린다(api, monkeypatch, jpeg(3000, 2000, orientation=6))
    파일 = 표시본(사진_폴더, trip_id, photo_id)
    assert 긴_변(파일) == 1440

    셈 = rebuild_display.process(await rebuild_display.targets(db), apply=True)

    assert 셈["rebuild"] == 1 and 셈["failed"] == 0 and 셈["added-bytes"] > 0
    with Image.open(파일) as 그림:
        # 방향을 바로잡은 세로 사진이고 EXIF 가 없다.
        assert 그림.size == (1365, 2048)
        assert not 그림.getexif()
    assert not 파일.with_name("display.jpg.rebuilding").exists()
    # 두 번째로 돌리면 할 일이 없다.
    다시 = rebuild_display.process(await rebuild_display.targets(db), apply=False)
    assert (다시["rebuild"], 다시["up-to-date"]) == (0, 1)
    if sys.platform != "win32":  # Windows 의 chmod 는 읽기 전용 표시만 바꾼다.
        assert oct(stat.S_IMODE(파일.stat().st_mode)) == oct(0o640)


async def test_원본이_없으면_건너뛰고_표시본은_그대로다(api, db, monkeypatch, 사진_폴더):
    trip_id, photo_id, _ = await 옛_크기로_올린다(api, monkeypatch, jpeg(3000, 2000))
    await purge_originals(db, now=datetime.now(UTC) + timedelta(days=ORIGINAL_DAYS, minutes=1))
    파일 = 표시본(사진_폴더, trip_id, photo_id)
    전 = 파일.read_bytes()

    셈 = rebuild_display.process(await rebuild_display.targets(db), apply=True)

    assert (셈["rebuild"], 셈["no-original"]) == (0, 1)
    assert 파일.read_bytes() == 전


async def test_원본이_옛_표시본보다_작으면_이미_새_크기로_친다(api, db, monkeypatch, 사진_폴더):
    await 옛_크기로_올린다(api, monkeypatch, jpeg(1200, 900))

    셈 = rebuild_display.process(await rebuild_display.targets(db), apply=False)

    assert (셈["rebuild"], 셈["up-to-date"]) == (0, 1)


async def test_세기만_하면_파일을_바꾸지_않는다(api, db, monkeypatch, 사진_폴더):
    trip_id, photo_id, _ = await 옛_크기로_올린다(api, monkeypatch, jpeg(3000, 2000))
    폴더 = 사진_폴더 / "trips" / trip_id / photo_id
    전 = {path.name: (path.read_bytes(), path.stat().st_mtime_ns) for path in 폴더.iterdir()}

    셈 = rebuild_display.process(await rebuild_display.targets(db), apply=False)

    assert 셈["rebuild"] == 1
    assert {path.name: (path.read_bytes(), path.stat().st_mtime_ns) for path in 폴더.iterdir()} == 전
    assert rebuild_display.summary(셈, apply=False).startswith("다시 만들 것: 1")


async def test_한_장이_실패해도_다음_사진으로_넘어간다(api, db, monkeypatch, 사진_폴더):
    trip_id, 깨질_id, 여행 = await 옛_크기로_올린다(api, monkeypatch, jpeg(3000, 2000))
    _, 멀쩡한_id, _ = await 옛_크기로_올린다(api, monkeypatch, jpeg(2800, 2100), 여행=여행)
    # 원본 자리에 사진이 아닌 것을 둔다. 머리 읽기에서 막히지 않도록 확인은 통과시킨다.
    (사진_폴더 / "trips" / trip_id / 깨질_id / "original.jpg").write_bytes(b"not a photo")
    monkeypatch.setattr(photo_files, "display_state", lambda *_: photo_files.DisplayState.REBUILD)

    셈 = rebuild_display.process(await rebuild_display.targets(db), apply=True)

    assert (셈["rebuild"], 셈["failed"]) == (1, 1)
    assert 긴_변(표시본(사진_폴더, trip_id, 멀쩡한_id)) == 2048
    assert 긴_변(표시본(사진_폴더, trip_id, 깨질_id)) == 1440
