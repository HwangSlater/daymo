"""
사진 파일을 디스크에 두고 꺼내는 일.

    {upload_root}/trips/{trip_id}/{photo_id}/original.jpg
                                            display.jpg     긴 변 1440px
                                            thumbnail.jpg   긴 변 480px
    {upload_root}/tmp/                      받는 중인 파일

DB 에는 `upload_root` 아래의 상대 경로만 적는다. 운영에서 사진 폴더를 NAS 로 옮겨도
경로가 그대로다(docs/development/06-vps-deployment.md 6장).

**원본은 받은 byte 그대로 둔다.** 표시본과 썸네일은 방향을 바로잡고 EXIF 를 모두 뺀
JPEG 이다. 원본에는 위치 정보가 남아 있을 수 있어서 `original` 은 올린 사람의 공간
멤버에게만 준다(권한 검사는 API 가 한다).

**권한.** 운영에서 nginx(gid 101)가 `X-Accel-Redirect` 로 파일을 직접 읽는다. 호스트의
사진 폴더는 `10001:101`, `2750`(setgid)이라 새 폴더와 파일이 그룹 101 을 물려받는다.
폴더는 `0750`, 파일은 `0640` 으로 만들어 그룹만 읽고 그 밖에는 못 읽게 한다
(docs/development/06-vps-deployment.md 6장).

여기 함수는 모두 동기다. 이미지 변환은 CPU 를 쓰므로 API 는 스레드에서 부른다.
"""

import os
import shutil
import uuid
from urllib.parse import quote
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError

from app.core.config import get_settings

DISPLAY_EDGE = 1440
THUMBNAIL_EDGE = 480
JPEG_QUALITY = 82

# 받는 형식. HEIC 는 서버에서 열 수 없어 앱이 JPEG 로 바꿔 보낸다.
FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}

# 풀어 놓은 크기의 상한. API 컨테이너 메모리가 400MB 라 큰 PNG 하나로 워커가 죽으면 안 된다.
# JPEG 은 줄여서 풀 수 있어(draft) 훨씬 커도 괜찮다.
MAX_PIXELS = {"JPEG": 120_000_000, "PNG": 30_000_000, "WEBP": 30_000_000}


class NotAPhoto(Exception):
    """열 수 없거나 받지 않는 형식이다."""


def root() -> Path:
    return Path(get_settings().upload_root).resolve()


def absolute(relative: str) -> Path:
    """DB 에 적힌 상대 경로를 실제 경로로. `upload_root` 밖을 가리키면 거부한다."""
    base = root()
    path = (base / relative).resolve()
    if base != path and base not in path.parents:
        raise ValueError("업로드 폴더 밖의 경로")
    return path


def accel_uri(prefix: str, relative: str) -> str:
    """
    nginx 내부 location 으로 넘길 주소. `upload_root` 안인지 먼저 확인하고 경로 조각마다 퍼센트 인코딩한다.

    nginx 는 이 값을 디코딩한 뒤 `..` 를 다시 검사하므로 조각 안의 `/`·`?`·`%` 도 모두 인코딩한다.
    """
    parts = absolute(relative).relative_to(root()).parts
    return prefix.rstrip("/") + "/" + "/".join(quote(part, safe="") for part in parts)


def _make_dir(path: Path) -> None:
    """
    없는 단계마다 `0750` 으로 만든다. `mkdir(parents=True)` 는 중간 폴더를 기본 권한(0755)으로 만든다.

    일부러 chmod 하지 않는다. 부모의 setgid 와 그룹은 mkdir 때 커널이 물려준다. 그런데
    API(uid 10001)는 그룹 101 의 구성원이 아니어서 chmod 하면 커널이 setgid 를 지우고,
    그 아래에 생기는 폴더가 그룹 101 을 못 물려받아 nginx 가 읽지 못한다.
    """
    if path.is_dir():
        return
    _make_dir(path.parent)
    path.mkdir(mode=0o750, exist_ok=True)


def trip_dir(trip_id: uuid.UUID) -> Path:
    return root() / "trips" / str(trip_id)


def photo_dir(trip_id: uuid.UUID, photo_id: uuid.UUID) -> Path:
    return trip_dir(trip_id) / str(photo_id)


def temp_path() -> Path:
    folder = root() / "tmp"
    _make_dir(folder)
    return folder / f"{uuid.uuid4()}.part"


@dataclass
class Stored:
    mime: str
    width: int
    height: int
    taken_at: datetime | None
    stored_bytes: int
    original_path: str
    display_path: str
    thumbnail_path: str


def _taken_at(image: Image.Image, zone: ZoneInfo) -> datetime | None:
    """EXIF 의 찍은 시각. 시간대가 없으면 공간 시간대의 시각으로 읽는다."""
    try:
        exif = image.getexif().get_ifd(ExifTags.IFD.Exif)
        raw = exif.get(ExifTags.Base.DateTimeOriginal)
        if not raw:
            return None
        when = datetime.strptime(str(raw).strip()[:19], "%Y:%m:%d %H:%M:%S")
        offset = exif.get(ExifTags.Base.OffsetTimeOriginal)
        if offset:
            return datetime.strptime(f"{when:%Y-%m-%d %H:%M:%S}{offset}", "%Y-%m-%d %H:%M:%S%z").astimezone(UTC)
        return when.replace(tzinfo=zone).astimezone(UTC)
    except (ValueError, TypeError, KeyError):
        return None


def _flatten(image: Image.Image) -> Image.Image:
    """투명한 부분은 흰 바탕에 올린다. JPEG 에는 투명이 없다."""
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        paper = Image.new("RGB", rgba.size, (255, 255, 255))
        paper.paste(rgba, mask=rgba.getchannel("A"))
        return paper
    return image.convert("RGB")


def _save_jpeg(image: Image.Image, edge: int, path: Path) -> int:
    copy = image.copy()
    copy.thumbnail((edge, edge), Image.Resampling.LANCZOS)
    # exif 를 넘기지 않으면 아무 메타데이터도 쓰지 않는다. 위치와 기기 정보가 빠진다.
    copy.save(path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    os.chmod(path, 0o640)
    return path.stat().st_size


def store(upload: Path, trip_id: uuid.UUID, photo_id: uuid.UUID, zone: ZoneInfo) -> Stored:
    """
    받은 파일을 열어 보고 원본·표시본·썸네일로 둔다.

    먼저 다른 이름의 폴더에 모두 만든 뒤 한 번에 이름을 바꾼다. 도중에 실패하면
    반쯤 만든 폴더가 남지 않는다.
    """
    try:
        with Image.open(upload) as image:
            kind = image.format or ""
            if kind not in FORMATS:
                raise NotAPhoto(kind)
            width, height = image.size
            if width * height > MAX_PIXELS[kind]:
                raise NotAPhoto("too many pixels")
            taken_at = _taken_at(image, zone)
            orientation = image.getexif().get(ExifTags.Base.Orientation, 1)
            if orientation in (5, 6, 7, 8):
                width, height = height, width
            if kind == "JPEG":
                # 표시본보다 크게만 풀면 된다. 12MP 사진도 메모리를 몇십 MB 만 쓴다.
                image.draft("RGB", (DISPLAY_EDGE, DISPLAY_EDGE))
            upright = _flatten(ImageOps.exif_transpose(image) or image)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise NotAPhoto(str(error)) from error

    mime, extension = FORMATS[kind]
    final = photo_dir(trip_id, photo_id)
    building = final.with_name(f"{final.name}.building")
    shutil.rmtree(building, ignore_errors=True)
    _make_dir(building.parent)
    building.mkdir(mode=0o750)
    try:
        original = building / f"original.{extension}"
        shutil.move(str(upload), original)
        os.chmod(original, 0o640)
        total = original.stat().st_size
        total += _save_jpeg(upright, DISPLAY_EDGE, building / "display.jpg")
        total += _save_jpeg(upright, THUMBNAIL_EDGE, building / "thumbnail.jpg")
        shutil.rmtree(final, ignore_errors=True)
        building.rename(final)
    except Exception:
        shutil.rmtree(building, ignore_errors=True)
        raise

    base = f"trips/{trip_id}/{photo_id}"
    return Stored(
        mime=mime,
        width=width,
        height=height,
        taken_at=taken_at,
        stored_bytes=total,
        original_path=f"{base}/original.{extension}",
        display_path=f"{base}/display.jpg",
        thumbnail_path=f"{base}/thumbnail.jpg",
    )


def remove_photo(trip_id: uuid.UUID, photo_id: uuid.UUID) -> None:
    shutil.rmtree(photo_dir(trip_id, photo_id), ignore_errors=True)


def remove_trips(trip_ids: list[uuid.UUID]) -> None:
    for trip_id in trip_ids:
        shutil.rmtree(trip_dir(trip_id), ignore_errors=True)


def discard(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass
