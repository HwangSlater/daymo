import logging
from collections.abc import AsyncIterator, Callable, Mapping
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.auth_pages import router as auth_pages_router
from app.api.v1.router import api_router
from app.core.access_log import log_request
from app.core.config import get_settings
from app.core.context import get_request_id, sanitize_request_id, set_request_id
from app.core.db import dispose_engine
from app.core.errors import AppError, ErrorCode, code_for_status
from app.core.logging import configure_logging
from app.core.observability import capture_error, init_error_tracking
from app.core.runtime import use_selector_event_loop_on_windows
from app.core.responses import error_response, ok

logger = logging.getLogger("daymo")

# 루프가 만들어지기 전에 불러야 해서 import 시점에 둔다.
use_selector_event_loop_on_windows()


# 입력이 틀렸을 때 사용자에게 보일 한국어 문구.
#
# Pydantic 이 붙이는 `msg` 는 영어다("String should have at most 60 characters").
# 그대로 내보내면 앱에서 이 한 줄만 영어로 뜬다. type 별로 여기서 한국어를 고르고,
# 길이·개수 같은 숫자는 `ctx` 에서 꺼내 문구에 넣는다. 인자는 그 오류의 `ctx` 다.
#
# 여기 없는 type 은 아래 기본 문구로 떨어지고, 영어 원문은 로그에만 남는다.
# 문구 규칙은 docs/development/13-copy-glossary.md 를 따른다.
VALIDATION_FALLBACK = "입력한 값을 확인해 주세요."

_날짜_문구 = "날짜 형식이 맞지 않아요. 예: 2026-09-17"
_시각_문구 = "날짜와 시각 형식이 맞지 않아요. 다시 입력해 주세요."
_숫자_문구 = "숫자로 입력해 주세요."
_고를_수_없음 = "고를 수 없는 값이에요. 목록에서 골라 주세요."
_앱이_보낸_값 = "잘못된 값이에요. 다시 시도해 주세요."

VALIDATION_MESSAGES: dict[str, Callable[[Mapping[str, Any]], str]] = {
    "missing": lambda ctx: "꼭 입력해야 하는 값이에요.",
    "extra_forbidden": lambda ctx: "여기에는 보낼 수 없는 값이에요.",
    "json_invalid": lambda ctx: "보낸 내용을 읽을 수 없어요. 다시 시도해 주세요.",
    # 글자
    "string_too_long": lambda ctx: f"{ctx['max_length']}자까지 쓸 수 있어요.",
    "string_too_short": lambda ctx: (
        "한 글자 이상 입력해 주세요."
        if int(ctx["min_length"]) <= 1
        else f"{ctx['min_length']}자 이상 입력해 주세요."
    ),
    "string_type": lambda ctx: "글자로 입력해 주세요.",
    "string_pattern_mismatch": lambda ctx: "형식이 맞지 않아요. 다시 입력해 주세요.",
    # 수
    "int_type": lambda ctx: _숫자_문구,
    "int_parsing": lambda ctx: _숫자_문구,
    "int_from_float": lambda ctx: "소수점 없는 숫자로 입력해 주세요.",
    "float_type": lambda ctx: _숫자_문구,
    "float_parsing": lambda ctx: _숫자_문구,
    "decimal_type": lambda ctx: _숫자_문구,
    "decimal_parsing": lambda ctx: _숫자_문구,
    "greater_than": lambda ctx: f"{ctx['gt']}보다 커야 해요.",
    "greater_than_equal": lambda ctx: f"{ctx['ge']} 이상이어야 해요.",
    "less_than": lambda ctx: f"{ctx['lt']}보다 작아야 해요.",
    "less_than_equal": lambda ctx: f"{ctx['le']} 이하여야 해요.",
    # 참·거짓
    "bool_type": lambda ctx: "켜짐이나 꺼짐 중 하나여야 해요.",
    "bool_parsing": lambda ctx: "켜짐이나 꺼짐 중 하나여야 해요.",
    # 날짜·시각
    "date_type": lambda ctx: _날짜_문구,
    "date_parsing": lambda ctx: _날짜_문구,
    "date_from_datetime_parsing": lambda ctx: _날짜_문구,
    "date_from_datetime_inexact": lambda ctx: _날짜_문구,
    "datetime_type": lambda ctx: _시각_문구,
    "datetime_parsing": lambda ctx: _시각_문구,
    "datetime_from_date_parsing": lambda ctx: _시각_문구,
    "time_type": lambda ctx: "시각 형식이 맞지 않아요. 예: 14:30",
    "time_parsing": lambda ctx: "시각 형식이 맞지 않아요. 예: 14:30",
    # 고르는 값
    "enum": lambda ctx: _고를_수_없음,
    "literal_error": lambda ctx: _고를_수_없음,
    # 목록
    "list_type": lambda ctx: "여러 개를 담는 칸이에요. 값을 확인해 주세요.",
    "too_long": lambda ctx: f"{ctx['max_length']}개까지 담을 수 있어요.",
    "too_short": lambda ctx: f"{ctx['min_length']}개 이상 담아 주세요.",
    # 앱이 만들어 보내는 값이라 사용자가 고칠 것이 없다. 무엇인지는 알리지 않는다.
    "uuid_type": lambda ctx: _앱이_보낸_값,
    "uuid_parsing": lambda ctx: _앱이_보낸_값,
    # 스키마의 검사기가 낸 것. 지금 요청 스키마에는 이메일뿐이고, 그것은 아래에서 따로 본다.
    "value_error": lambda ctx: VALIDATION_FALLBACK,
}


def validation_message(detail: Mapping[str, Any], 칸: str) -> str:
    """
    Pydantic 오류 하나를 사용자에게 보일 한국어 한 줄로 바꾼다.

    모르는 type 이거나 `ctx` 에 기대한 값이 없으면 기본 문구로 떨어뜨리고,
    영어 원문은 로그에만 남긴다. 사용자 화면에 영어를 내보내지 않기 위해서다.
    """
    유형 = str(detail.get("type", ""))
    # 이메일은 사용자가 직접 치는 칸이라 무엇이 틀렸는지 알려 준다.
    if 유형 == "value_error" and 칸.lower().endswith("email"):
        return "이메일 주소 형식이 맞지 않아요."
    만든다 = VALIDATION_MESSAGES.get(유형)
    if 만든다 is not None:
        try:
            return 만든다(detail.get("ctx") or {})
        except (KeyError, TypeError, ValueError):
            pass
    logger.warning(
        "옮길 문구가 없는 입력 오류 requestId=%s type=%s loc=%s msg=%s",
        get_request_id(),
        유형,
        detail.get("loc"),
        detail.get("msg"),
    )
    return VALIDATION_FALLBACK


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    # DSN 이 비어 있으면 아무 일도 하지 않는다. 자세한 것은 app/core/observability.py.
    init_error_tracking(settings)
    app = FastAPI(
        title="Daymo API",
        version="0.1.0",
        lifespan=lifespan,
        # 운영에서는 스키마를 공개하지 않는다. config.docs_enabled 주석 참고.
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )

    @app.middleware("http")
    async def write_access_log(request: Request, call_next):
        """
        요청 하나에 로그 한 줄.

        request id 를 붙이는 미들웨어보다 **안쪽**에 있어야 한다. 바깥에
        두면 로그를 쓰는 시점에 아직 id 가 없다. FastAPI 는 나중에 등록한
        미들웨어가 바깥이라, 이것을 먼저 등록한다.
        """
        return await log_request(request, call_next, settings.refresh_token_pepper)

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        """
        요청마다 id 를 붙인다.

        앱이 보낸 `X-Request-Id` 가 UUID 모양이면 그대로 쓴다. 앱 로그와 서버
        로그를 같은 값으로 이을 수 있어야 사용자가 알려 준 화면 하나를 서버에서
        찾을 수 있다. 없거나 모양이 아니면 서버가 만든다.
        """
        request_id = sanitize_request_id(request.headers.get("X-Request-Id"))
        set_request_id(request_id)
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response

    # 웹 버전이 다른 주소(www.daymo.xyz)에서 API 를 부른다. 가장 바깥에 둬야 오류 응답에도
    # 헤더가 붙는다. 그래서 다른 미들웨어보다 나중에 등록한다.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        # `X-Daymo-Card-Keeps-Unknown` 은 카드의 모르는 값을 돌려보내는 앱이라는 표시다
        # (`services/trip_cards.KEEPS_UNKNOWN_HEADER`). 웹 앱도 붙여 보낸다.
        allow_headers=["Authorization", "Content-Type", "X-Request-Id", "X-Daymo-Card-Keeps-Unknown"],
        expose_headers=["X-Request-Id"],
        max_age=600,
    )

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.code, message=exc.detail, fields=exc.fields, details=exc.details)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        """
        프레임워크가 직접 내는 오류도 같은 봉투에 담는다.

        없는 경로에 대한 404 는 라우팅이 만들기 때문에 AppError 를 거치지
        않는다. 그대로 두면 앱이 오류 하나를 두 가지 모양으로 받게 된다.
        원래 상태 코드는 그대로 두고 코드와 문구만 명세서 쪽으로 옮긴다.
        """
        code = code_for_status(exc.status_code)
        return error_response(code, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """
        Pydantic 이 잡은 것을 명세서의 `fields` 모양으로 바꾼다.

        기본 FastAPI 응답은 봉투 모양이 다르고 내부 경로가 그대로 드러난다.
        문구도 영어라 그대로 쓰면 앱에서 이 한 줄만 영어로 뜬다. 옮기는 표는
        위의 `VALIDATION_MESSAGES` 다.
        """
        fields: dict[str, str] = {}
        for detail in exc.errors():
            # ("body", "startDate") 처럼 오는 위치에서 body/query 앞자리를 뗀다.
            parts = [str(part) for part in detail["loc"][1:]] or [str(part) for part in detail["loc"]]
            칸 = ".".join(parts)
            fields.setdefault(칸, validation_message(detail, 칸))
        return error_response(ErrorCode.VALIDATION_ERROR, fields=fields)

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        """
        예상 못 한 것은 내용을 밖으로 내보내지 않는다.

        사용자에게는 requestId 만 주고, 원인은 서버 로그에서 그 id 로 찾는다.

        오류 수집이 켜져 있으면 여기서 **한 번만** 올린다. 로그 한 줄이 그대로
        이벤트가 되게 두면 access log 가 같은 것을 또 올려 같은 오류가 두 번 쌓인다.
        """
        logger.exception("unhandled error requestId=%s path=%s", get_request_id(), request.url.path)
        capture_error(exc)
        return error_response(ErrorCode.INTERNAL_ERROR)

    @app.get("/health", include_in_schema=False)
    async def public_health() -> dict:
        """
        바깥에 공개하는 health check. UptimeRobot 이 5분마다 본다.

        일부러 DB 를 보지 않는다. 이 경로는 인증 없이 열려 있으므로, 응답이
        내부 상태를 알려 주는 창구가 되면 안 된다. DB 까지 보는 것은
        `/v1/health` 쪽이다.
        """
        return ok({"status": "ok"})

    app.include_router(api_router, prefix="/v1")
    # 메일 링크가 여는 HTML 페이지. /v1 밖에 둔다. JSON 봉투를 쓰지 않는다.
    app.include_router(auth_pages_router)
    return app


app = create_app()
