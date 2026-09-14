from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.db import check_database
from app.core.errors import ErrorCode
from app.core.responses import error_response, ok

router = APIRouter(tags=["health"])


# response_model=None: 성공과 실패의 본문 모양이 달라 하나의 스키마로 못 묶는다.
@router.get("/health", summary="내부 health check", response_model=None)
async def health() -> JSONResponse | dict:
    """
    프로세스와 DB 연결 상태를 함께 본다.

    이 경로는 Nginx 에서 외부에 열지 않는다. 바깥에 공개하는 것은 DB 를 보지
    않는 `/health` 쪽이다(docs/development/06-vps-deployment.md 2장·9장).

    DB 가 죽었을 때 200을 돌려주면 배포 후 자동 복귀가 동작하지 않으므로
    503으로 내린다.
    """
    database_ok = await check_database()
    if not database_ok:
        return error_response(
            ErrorCode.SERVICE_UNAVAILABLE,
            message="데이터베이스에 연결할 수 없어요.",
        )
    return ok({"status": "ok", "database": "ok"})
