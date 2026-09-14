from typing import Any

from fastapi.responses import JSONResponse

from app.core.context import get_request_id
from app.core.errors import MESSAGE_BY_CODE, STATUS_BY_CODE, ErrorCode

# API 명세서 1장의 봉투. 모든 응답이 같은 모양이어야 앱이 한 곳에서 푼다.
#
#   성공  { "data": ..., "meta": { "requestId": "uuid" } }
#   목록  { "data": [...], "meta": { "nextCursor": null, "hasMore": false, "requestId": ... } }
#   오류  { "error": { "code": ..., "message": ..., "fields": ..., "requestId": ... } }


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
    status_code: int | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "code": code.value,
        "message": message or MESSAGE_BY_CODE[code],
        "requestId": get_request_id(),
    }
    if fields:
        body["fields"] = fields
    return JSONResponse(
        status_code=status_code or STATUS_BY_CODE[code],
        content={"error": body},
    )
