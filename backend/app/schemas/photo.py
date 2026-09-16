import uuid
from datetime import date as Date
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.auth import _Camel

# 사진을 붙일 수 있는 곳. 날짜는 연결이 아니라 사진의 `date` 다.
PhotoLinkTarget = Literal["place", "schedule", "stay"]

# 한 장에 붙일 수 있는 곳의 수. 장소 하나·일정 하나·숙소 하나면 넉넉하다.
LINKS_MAX = 20


class PhotoLinkOut(_Camel):
    """사진이 붙어 있는 곳 하나. `targetId` 는 장소면 여행 장소 id, 일정이면 일정 id 다."""

    target_type: PhotoLinkTarget
    target_id: str


class PhotoLinkIn(_Camel):
    target_type: PhotoLinkTarget
    target_id: uuid.UUID


class PhotoCreateRequest(_Camel):
    """
    사진 줄을 만든다. 파일은 `PUT /photos/{id}/content` 로 따로 보낸다.

    `bytes` 와 `checksum`(SHA-256, 16진수 소문자)은 보낼 파일의 것이다. 받은 파일과
    다르면 올리기가 실패한다. `date` 는 앱에서 고른 날이고, `links` 는 이 사진을
    붙일 장소·일정·숙소다. 같은 여행의 것만 받는다.
    """

    id: uuid.UUID | None = None
    bytes: int = Field(gt=0)
    checksum: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    caption: str | None = Field(default=None, max_length=200)
    date: Date | None = None
    is_receipt: bool = False
    links: list[PhotoLinkIn] = Field(default_factory=list, max_length=LINKS_MAX)


class PhotoUpdateRequest(_Camel):
    """`links` 는 보낸 목록으로 통째로 바꾼다. 빈 목록이면 붙어 있던 곳을 다 뗀다."""

    version: int
    caption: str | None = Field(default=None, max_length=200)
    date: Date | None = None
    links: list[PhotoLinkIn] | None = Field(default=None, max_length=LINKS_MAX)


class PhotoOut(_Camel):
    """`status` 가 `uploading` 이면 파일이 아직 오지 않았다. 내용 주소는 `ready` 일 때만 열린다."""

    id: str
    trip_id: str
    status: str
    caption: str | None
    date: Date | None
    taken_at: datetime | None
    width: int | None
    height: int | None
    bytes: int | None
    is_receipt: bool
    uploader_membership_id: str | None
    uploader_name: str
    created_at: datetime
    version: int
    links: list[PhotoLinkOut] = Field(default_factory=list)
