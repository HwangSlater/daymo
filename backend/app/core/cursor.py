"""
목록을 이어 받는 cursor.

명세서 1장의 목록 봉투에는 `meta.nextCursor` 자리가 이미 있다. 여기서는 그 자리에
무엇을 담을지를 정한다. 마지막으로 준 줄의 정렬 값과 id 를 담고, 다음 요청은 그 줄
바로 다음부터 읽는다.

몇 번째 줄부터(offset) 가 아니라 어느 줄 다음부터(keyset) 인 이유는, 목록을 넘기는
사이에 여행이 새로 생기거나 지워져도 같은 줄을 두 번 주거나 건너뛰지 않기 때문이다.

정렬 값만으로는 모자란다. 여행은 시작일이 같을 수 있어서, 같은 날짜끼리의 차례가
질의마다 흔들리면 쪽을 넘길 때 줄이 새거나 겹친다. 그래서 어느 목록이든 id 를 마지막
차례로 붙여 두고, cursor 에도 id 를 함께 담는다.

base64url 로 감싸는 것은 비밀로 하려는 게 아니라 앱이 안을 들여다보고 직접 만들지
않게 하려는 것이다. 안에 담긴 것은 이미 앱이 받은 줄의 값이다.
"""

import base64
import binascii
import uuid

from app.core.errors import AppError, ErrorCode

# 정렬 값과 id 를 가르는 글자. 날짜·시각 문자열에는 나오지 않는다.
_사이 = "|"


def encode_cursor(sort_value: str, row_id: uuid.UUID) -> str:
    """마지막으로 준 줄의 정렬 값과 id 를 cursor 로 만든다."""
    원문 = f"{sort_value}{_사이}{row_id}".encode()
    return base64.urlsafe_b64encode(원문).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[str, uuid.UUID]:
    """cursor 를 정렬 값과 id 로 되돌린다. 우리가 준 것이 아니면 422 다."""
    try:
        채움 = "=" * (-len(cursor) % 4)
        원문 = base64.urlsafe_b64decode(cursor + 채움).decode()
        정렬_값, id_글자 = 원문.rsplit(_사이, 1)
        return 정렬_값, uuid.UUID(id_글자)
    except (ValueError, binascii.Error, UnicodeDecodeError) as 원인:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            fields={"cursor": "목록을 이어 받을 수 없어요. 처음부터 다시 받아 주세요."},
        ) from 원인
