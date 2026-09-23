from typing import Any, Generic, TypeVar

from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.core.context import get_request_id
from app.core.errors import MESSAGE_BY_CODE, STATUS_BY_CODE, ErrorCode

# API 명세서 1장의 봉투. 모든 응답이 같은 모양이어야 앱이 한 곳에서 푼다.
#
#   성공  { "data": ..., "meta": { "requestId": "uuid" } }
#   목록  { "data": [...], "meta": { "nextCursor": null, "hasMore": false, "requestId": ... } }
#   오류  { "error": { "code": ..., "message": ..., "fields": ..., "details": ..., "requestId": ... } }

T = TypeVar("T")


class _Meta(BaseModel):
    """
    봉투의 `meta`.

    `ok(값, 무엇=...)` 처럼 뒤에 붙이는 칸이 생겨도 버리지 않고 그대로 내보낸다
    (`extra="allow"`). 칸 차례는 지금 나가는 모양 그대로 둔다 — 앱은 차례를 보지
    않지만, 이 파일이 「지금 나가는 글자」의 원본이라 눈으로 견줄 수 있어야 한다.
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    request_id: str | None = Field(default=None, alias="requestId")


class _PageMeta(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    next_cursor: str | None = Field(default=None, alias="nextCursor")
    has_more: bool = Field(default=False, alias="hasMore")
    request_id: str | None = Field(default=None, alias="requestId")


class Envelope(BaseModel, Generic[T]):
    """
    `ok()` 가 만드는 모양에 이름을 붙인 것.

    라우터에 `response_model=Envelope[TripOut]` 을 달면 OpenAPI 에 응답 스키마가
    생긴다. 앱이 그 스키마로 타입을 만들면 서버와 앱의 계약이 한 벌이 된다.
    **`ok()` 가 돌려주는 값을 바꾸지는 않는다.** 여기 있는 것은 그 dict 를 다시
    읽어 같은 글자로 내보내는 틀뿐이다(`tests/test_response_contract.py` 가 지킨다).
    """

    data: T
    meta: _Meta


class Page(BaseModel, Generic[T]):
    """`page()` 가 만드는 모양. `data` 가 목록이고 `meta` 에 이어 받을 자리가 붙는다."""

    data: list[T]
    meta: _PageMeta


def ok(data: Any, **meta: Any) -> dict[str, Any]:
    return {"data": data, "meta": {"requestId": get_request_id(), **meta}}


def page(items: list[Any], *, next_cursor: str | None = None, **meta: Any) -> dict[str, Any]:
    return {
        "data": items,
        "meta": {
            "nextCursor": next_cursor,
            "hasMore": next_cursor is not None,
            "requestId": get_request_id(),
            **meta,
        },
    }


def error_response(
    code: ErrorCode,
    *,
    message: str | None = None,
    fields: dict[str, str] | None = None,
    details: dict[str, str] | None = None,
    status_code: int | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "code": code.value,
        "message": message or MESSAGE_BY_CODE[code],
        "requestId": get_request_id(),
    }
    if fields:
        body["fields"] = fields
    if details:
        body["details"] = details
    return JSONResponse(
        status_code=status_code or STATUS_BY_CODE[code],
        content={"error": body},
    )
