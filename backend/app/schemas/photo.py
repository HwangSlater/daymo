import uuid
from datetime import date as Date
from datetime import datetime

from pydantic import Field

from app.schemas.auth import _Camel


class PhotoCreateRequest(_Camel):
    """
    사진 줄을 만든다. 파일은 `PUT /photos/{id}/content` 로 따로 보낸다.

    `bytes` 와 `checksum`(SHA-256, 16진수 소문자)은 보낼 파일의 것이다. 받은 파일과
    다르면 올리기가 실패한다. `date` 는 앱에서 고른 날이다.
    """

    id: uuid.UUID | None = None
    bytes: int = Field(gt=0)
    checksum: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    caption: str | None = Field(default=None, max_length=200)
    date: Date | None = None
    is_receipt: bool = False


class PhotoUpdateRequest(_Camel):
    version: int
    caption: str | None = Field(default=None, max_length=200)
    date: Date | None = None


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
