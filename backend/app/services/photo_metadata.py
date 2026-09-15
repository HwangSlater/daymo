"""
사진 원본에서 위치 정보가 들어갈 수 있는 메타데이터를 뺀다. 그림 데이터는 건드리지 않는다.

폰으로 찍은 사진의 EXIF 에는 GPS 좌표가 들어 있을 수 있다. 원본을 받은 그대로 두면 사진을 받은
멤버가 찍은 자리를 알 수 있고, 스토어에도 "정확한 위치 수집"으로 신고해야 한다. 그래서 원본도
저장하기 전에 지운다(release/shared/data-inventory.md, 2026-09-15 결정).

다시 인코딩하면 화질이 떨어지고 큰 사진은 메모리가 모자라서, 파일을 조각 단위로 읽어 메타데이터
조각만 빼고 다시 붙인다.

- JPEG: APP1(EXIF·XMP)과 APP13(IPTC)을 버린다. 방향과 찍은 시각만 담은 새 EXIF 를 넣는다.
  방향이 빠지면 원본을 열었을 때 옆으로 누운다.
- PNG: eXIf 와 글 조각(tEXt·zTXt·iTXt, XMP 가 여기 들어간다)을 버린다.
- WebP: EXIF·XMP 조각을 버리고 VP8X 머리의 표시 비트를 끈다.

색 프로필(ICC) 같은 다른 조각은 남긴다. 빼면 색이 달라진다.
"""

import struct
from pathlib import Path

from PIL import ExifTags, Image


def _jpeg(data: bytes, exif_bytes: bytes | None) -> bytes:
    if data[:2] != b"\xff\xd8":
        raise ValueError("JPEG 가 아니다")
    out = bytearray(b"\xff\xd8")
    if exif_bytes:
        out += b"\xff\xe1" + struct.pack(">H", len(exif_bytes) + 2) + exif_bytes
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            raise ValueError("JPEG 조각 표시가 아니다")
        marker = data[i + 1]
        if marker == 0xFF:  # 채움 바이트
            i += 1
            continue
        if marker == 0xDA:  # 그림 데이터 시작. 나머지는 그대로 붙인다.
            out += data[i:]
            return bytes(out)
        if 0xD0 <= marker <= 0xD9 or marker == 0x01:  # 길이가 없는 표시
            out += data[i : i + 2]
            i += 2
            continue
        length = struct.unpack(">H", data[i + 2 : i + 4])[0]
        segment = data[i : i + 2 + length]
        if marker not in (0xE1, 0xED):  # APP1(EXIF·XMP), APP13(IPTC) 는 버린다
            out += segment
        i += 2 + length
    raise ValueError("그림 데이터가 없다")


_PNG_TEXT = {b"eXIf", b"tEXt", b"zTXt", b"iTXt"}


def _png(data: bytes) -> bytes:
    signature = b"\x89PNG\r\n\x1a\n"
    if not data.startswith(signature):
        raise ValueError("PNG 가 아니다")
    out = bytearray(signature)
    i = len(signature)
    while i < len(data):
        length = struct.unpack(">I", data[i : i + 4])[0]
        kind = data[i + 4 : i + 8]
        chunk = data[i : i + 12 + length]
        if kind not in _PNG_TEXT:
            out += chunk
        i += 12 + length
        if kind == b"IEND":
            break
    return bytes(out)


def _webp(data: bytes) -> bytes:
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("WebP 가 아니다")
    body = bytearray()
    i = 12
    while i + 8 <= len(data):
        kind = data[i : i + 4]
        length = struct.unpack("<I", data[i + 4 : i + 8])[0]
        padded = length + (length & 1)
        chunk = bytearray(data[i : i + 8 + padded])
        if kind == b"VP8X":
            chunk[8] &= ~(0x08 | 0x04) & 0xFF  # EXIF, XMP 표시를 끈다
        if kind not in (b"EXIF", b"XMP "):
            body += chunk
        i += 8 + padded
    return b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + bytes(body)


def _minimal_exif(image: Image.Image) -> bytes | None:
    """방향과 찍은 시각만 남긴 EXIF. 둘 다 없으면 None."""
    old = image.getexif()
    old_ifd = old.get_ifd(ExifTags.IFD.Exif)
    new = Image.Exif()
    orientation = old.get(ExifTags.Base.Orientation)
    if orientation and orientation != 1:
        new[ExifTags.Base.Orientation] = orientation
    for tag in (ExifTags.Base.DateTimeOriginal, ExifTags.Base.OffsetTimeOriginal):
        if old_ifd.get(tag):
            new.get_ifd(ExifTags.IFD.Exif)[tag] = old_ifd[tag]
    if not len(new) and not len(new.get_ifd(ExifTags.IFD.Exif)):
        return None
    return new.tobytes()


def strip_location(path: Path, kind: str) -> None:
    """`path` 의 파일을 메타데이터를 뺀 모습으로 바꿔 쓴다. kind 는 Pillow 형식 이름."""
    data = path.read_bytes()
    if kind == "JPEG":
        with Image.open(path) as image:
            exif_bytes = _minimal_exif(image)
        cleaned = _jpeg(data, exif_bytes)
    elif kind == "PNG":
        cleaned = _png(data)
    elif kind == "WEBP":
        cleaned = _webp(data)
    else:
        return
    path.write_bytes(cleaned)
