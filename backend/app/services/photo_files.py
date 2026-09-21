"""
사진 파일을 디스크에 두고 꺼내는 일.

    {upload_root}/trips/{trip_id}/{photo_id}/original.jpg   올린 지 30일까지만
                                            display.jpg     긴 변 2048px
                                            thumbnail.jpg   긴 변 480px
    {upload_root}/tmp/                      받는 중인 파일

DB 에는 `upload_root` 아래의 상대 경로만 적는다. 운영에서 사진 폴더를 NAS 로 옮겨도
경로가 그대로다(docs/development/06-vps-deployment.md 6장).

**원본은 그림 데이터를 그대로 두고 위치가 들어갈 수 있는 메타데이터만 뺀다**(`photo_metadata.py`).
표시본과 썸네일은 방향을 바로잡고 EXIF 를 모두 뺀 JPEG 이다. 파일은 공간 멤버에게만 준다
(권한 검사는 API 가 한다).

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
from enum import StrEnum
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.services.photo_metadata import strip_location

# 표시본의 긴 변. 화면에서 사진을 크게 볼 때 쓰는 크기다.
#
# 1440 이었는데 요즘 폰 화면이 그보다 촘촘하다. 6.1형만 해도 1170x2532 라, 세로 사진을
# 꽉 채우면 1440 을 2532 까지 1.7배 늘려 그려서 뿌옇게 보였다(2026-09-21에 고쳤다).
# 2048 이면 늘릴 일이 거의 없다. 파일은 두 배쯤 커지지만 한 번 받아 두고 계속 쓴다.
DISPLAY_EDGE = 2048
THUMBNAIL_EDGE = 480
# 82 에서 올렸다. 앱이 고른 사진을 한 번 줄여 올리고 여기서 또 줄여서 두 번 눌렸다.
JPEG_QUALITY = 88

# 받는 형식. HEIC 는 서버에서 열 수 없어 앱이 JPEG 로 바꿔 보낸다.
FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}

# 풀어 놓은 크기의 상한. API 컨테이너가 400MB 인데 놀 때 이미 240MB 를 쓰고 워커가 둘이라,
# 한 장을 푸는 데 쓸 수 있는 몫은 80MB 쯤이다.
#
# PNG·WebP 는 draft 가 없어 파일에 적힌 크기 그대로 다 풀린다(투명이 있으면 픽셀당 4바이트).
# 8M 픽셀짜리 투명 PNG 한 장이 여기 함수를 지나는 동안 쓰는 최대치를 재 보면 70MB 다.
# 예전 상한(30M 픽셀)으로는 같은 재기가 510MB 였다. 한 장으로 컨테이너가 죽던 값이다.
# 요즘 폰 화면 갈무리가 4M 픽셀 언저리라 실제로 올리는 PNG 는 8M 에 걸리지 않는다.
#
# JPEG 은 줄여서 풀 수 있어(draft) 훨씬 커도 괜찮다.
MAX_PIXELS = {"JPEG": 120_000_000, "PNG": 8_000_000, "WEBP": 8_000_000}


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
        # 이미 RGBA 면 convert 가 같은 크기를 한 벌 더 만들 뿐이다.
        rgba = image if image.mode == "RGBA" else image.convert("RGBA")
        paper = Image.new("RGB", rgba.size, (255, 255, 255))
        paper.paste(rgba, mask=rgba.getchannel("A"))
        return paper
    return image.convert("RGB")


def _upright_rgb(image: Image.Image, kind: str) -> Image.Image:
    """
    방향을 바로잡고 투명을 흰 바탕에 올린 RGB 사본. 크기는 아직 받은 그대로다.

    **줄이기 전에 RGB 로 만든다.** RGBA 를 그대로 줄이면 Pillow 가 알파를 미리 곱해 둔
    사본(RGBa)을 한 벌 더 만들어, 줄이는 동안 같은 그림을 세 벌 들고 있게 된다. 먼저
    펴 놓으면 알파가 빠져 4분의 1 작아지기까지 한다.

    돌릴 것이 없을 때 `exif_transpose` 를 부르지 않는 것도 같은 까닭이다. 그 함수는
    돌릴 방향이 없어도 사본을 하나 만들어 돌려준다.
    """
    if kind == "JPEG":
        # 표시본보다 크게만 풀면 된다. 12MP 사진도 메모리를 몇십 MB 만 쓴다.
        image.draft("RGB", (DISPLAY_EDGE, DISPLAY_EDGE))
    if image.getexif().get(ExifTags.Base.Orientation, 1) != 1:
        image = ImageOps.exif_transpose(image) or image
    return _flatten(image)


def _shrink(image: Image.Image, edge: int) -> None:
    """긴 변이 `edge` 를 넘으면 그 자리에서 줄인다. 사본을 만들지 않는다."""
    if max(image.size) > edge:
        image.thumbnail((edge, edge), Image.Resampling.LANCZOS)


def _resized(image: Image.Image, edge: int) -> Image.Image:
    """긴 변을 `edge` 에 맞춘 사본."""
    copy = image.copy()
    copy.thumbnail((edge, edge), Image.Resampling.LANCZOS)
    return copy


def _save_jpeg(image: Image.Image, path: Path) -> int:
    # exif 를 넘기지 않으면 아무 메타데이터도 쓰지 않는다. 위치와 기기 정보가 빠진다.
    image.save(path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
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
                # 형식은 받는 것인데 그림이 너무 크다. NotAPhoto 로 던지면 API 가
                # "JPEG, PNG, WebP 사진만 올릴 수 있어요" 라고 답해서, PNG 를 올린
                # 사람이 PNG 를 다시 고르게 된다. 있는 그대로 "사진이 너무 커요" 다.
                raise AppError(ErrorCode.PHOTO_TOO_LARGE)
            taken_at = _taken_at(image, zone)
            orientation = image.getexif().get(ExifTags.Base.Orientation, 1)
            if orientation in (5, 6, 7, 8):
                width, height = height, width
            upright = _upright_rgb(image, kind)
            # 받은 크기의 그림 데이터는 여기서 놓는다. 줄이는 동안까지 들고 있으면
            # 큰 PNG 에서 그만큼이 그대로 최대치에 얹힌다. 아래로는 `upright` 만 쓴다.
            image.close()
        # **원본 파일은 받은 그대로 둔다.** 줄이는 것은 표시본과 썸네일뿐이다.
        _shrink(upright, DISPLAY_EDGE)
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
        strip_location(original, kind)
        os.chmod(original, 0o640)
        total = original.stat().st_size
        # `upright` 는 이미 표시본 크기다(_shrink 가 줄여 놓았다).
        total += _save_jpeg(upright, building / "display.jpg")
        # 썸네일은 원본이 아니라 표시본에서 뽑는다. 이미 줄어든 그림에서 줄이므로
        # 큰 그림을 한 벌 덜 만든다.
        total += _save_jpeg(_resized(upright, THUMBNAIL_EDGE), building / "thumbnail.jpg")
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


class DisplayState(StrEnum):
    """이미 올라간 사진의 표시본을 지금 크기로 다시 만들 수 있는지."""

    REBUILD = "rebuild"
    NO_ORIGINAL = "no-original"
    UP_TO_DATE = "up-to-date"


def _long_edge(path: Path) -> int | None:
    """그림의 긴 변. 머리만 읽고 풀지 않는다. 열 수 없으면 None."""
    try:
        with Image.open(path) as image:
            return max(image.size)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        return None


def display_state(original_relative: str | None, display_relative: str) -> DisplayState:
    """
    표시본을 다시 만들 일이 있는지 본다. 파일은 머리만 읽는다.

    다시 만들지 않는 경우:
    - 원본 경로가 비었거나 파일이 없다. 표시본을 다시 줄여 봐야 더 나아지지 않는다.
    - 표시본의 긴 변이 이미 `DISPLAY_EDGE` 이상이다. 새 크기로 만든 것이다.
    - 원본의 긴 변이 지금 표시본의 긴 변 이하다. 옛 크기일 때도 줄이지 않고 원본
      크기 그대로 만들었으니 다시 만들어도 같은 그림이 나온다. 긴 변은 방향과
      상관없어서 EXIF 방향을 따지지 않고 비교한다.

    표시본 파일이 없거나 열리지 않으면 원본이 있는 한 다시 만든다.
    """
    if not original_relative:
        return DisplayState.NO_ORIGINAL
    original = absolute(original_relative)
    original_edge = _long_edge(original) if original.is_file() else None
    if original_edge is None:
        return DisplayState.NO_ORIGINAL
    display = absolute(display_relative)
    display_edge = _long_edge(display) if display.is_file() else None
    if display_edge is not None and (display_edge >= DISPLAY_EDGE or original_edge <= display_edge):
        return DisplayState.UP_TO_DATE
    return DisplayState.REBUILD


def rebuild_display(original_relative: str, display_relative: str) -> tuple[int, int]:
    """
    원본에서 표시본만 지금 크기(`DISPLAY_EDGE`, `JPEG_QUALITY`)로 다시 만든다.
    (예전 크기, 새 크기) 바이트를 돌려준다. 표시본이 없었으면 예전 크기는 0 이다.

    `store()` 와 같은 길로 만든다(방향 바로잡기, 줄이기, EXIF 없는 JPEG, 0640).
    썸네일은 그대로 둔다. 480px 이라 표시본 크기와 상관이 없다.

    같은 폴더에 다른 이름으로 다 쓴 뒤 `os.replace` 로 바꿔 끼운다. 도중에 죽어도
    반쯤 쓴 표시본을 내주는 일이 없다. 남은 임시 파일은 다음 실행이 덮어쓰고,
    사진을 지우면 폴더째 사라진다.

    다시 만들 일이 있는지는 부르는 쪽이 `display_state()` 로 먼저 본다.
    """
    original = absolute(original_relative)
    display = absolute(display_relative)
    try:
        with Image.open(original) as image:
            kind = image.format or ""
            if kind not in FORMATS:
                raise NotAPhoto(kind)
            width, height = image.size
            if width * height > MAX_PIXELS[kind]:
                raise NotAPhoto("픽셀이 너무 많다")
            upright = _upright_rgb(image, kind)
            image.close()
        _shrink(upright, DISPLAY_EDGE)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise NotAPhoto(str(error)) from error

    try:
        before = display.stat().st_size
    except FileNotFoundError:
        before = 0
    building = display.with_name(f"{display.name}.rebuilding")
    try:
        after = _save_jpeg(upright, building)
        os.replace(building, display)
    except Exception:
        building.unlink(missing_ok=True)
        raise
    return before, after


def remove_original(relative: str) -> int:
    """
    원본 파일만 지우고 비운 크기를 돌려준다. 표시본과 썸네일은 그대로 둔다.

    원본은 받은 사람이 내려받아 갈 동안만 두는 파일이라 기한이 지나면 사라진다
    (`app.services.photos.ORIGINAL_DAYS`). 기록으로 남는 것은 표시본이다.
    """
    path = absolute(relative)
    try:
        size = path.stat().st_size
    except FileNotFoundError:
        return 0
    path.unlink(missing_ok=True)
    return size


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
