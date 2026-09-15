import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
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
from app.core.runtime import use_selector_event_loop_on_windows
from app.core.responses import error_response, ok

logger = logging.getLogger("daymo")

# 루프가 만들어지기 전에 불러야 해서 import 시점에 둔다.
use_selector_event_loop_on_windows()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
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
        """
        fields: dict[str, str] = {}
        for detail in exc.errors():
            # ("body", "startDate") 처럼 오는 위치에서 body/query 앞자리를 뗀다.
            parts = [str(part) for part in detail["loc"][1:]] or [str(part) for part in detail["loc"]]
            fields.setdefault(".".join(parts), detail["msg"])
        return error_response(ErrorCode.VALIDATION_ERROR, fields=fields)

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        """
        예상 못 한 것은 내용을 밖으로 내보내지 않는다.

        사용자에게는 requestId 만 주고, 원인은 서버 로그에서 그 id 로 찾는다.
        """
        logger.exception("unhandled error requestId=%s path=%s", get_request_id(), request.url.path)
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
