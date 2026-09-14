import hashlib
import logging
import time

from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("daymo.access")

# 로그에 남기는 것은 문서가 허용한 다섯 가지뿐이다.
# request ID, actor ID hash, endpoint, status, latency
# (docs/development/05-quality-and-operations.md).
#
# 남기지 않는 것: 요청 본문, 질의 문자열, 헤더, 이메일, 사진 경로.
# 본문에 여행 제목과 메모가 들어 있고 질의 문자열에 검색어가 들어 있다.
# 둘 다 사용자가 쓴 글이라 로그에 남을 이유가 없다.


def actor_hash(user_id: str | None, pepper: str) -> str | None:
    """
    누가 했는지는 남기되 누구인지는 남기지 않는다.

    같은 사람의 요청을 이어 볼 수 있어야 장애를 되짚을 수 있지만, 로그에
    계정 ID 를 그대로 두면 로그 파일 자체가 개인정보가 된다. pepper 를 섞어
    해시하면 로그만 가지고는 거꾸로 찾을 수 없다.
    """
    if not user_id:
        return None
    digest = hashlib.sha256(f"{pepper}:{user_id}".encode()).hexdigest()
    return digest[:16]


UNMATCHED = "<unmatched>"


def endpoint_of(request: Request) -> str:
    """
    실제 경로가 아니라 라우트 틀을 남긴다.

    `/v1/trips/9f3c.../expenses` 를 그대로 남기면 두 가지가 나빠진다. 여행
    ID 가 로그에 흩어지고, 같은 API 의 요청을 한 줄로 셀 수 없다. 틀로
    남기면 `/v1/trips/{trip_id}/expenses` 하나로 모인다.

    `scope["route"].path` 를 쓰지 않는다. FastAPI 가 라우터를 감싸면서 그
    값에는 `include_router` 의 접두사가 빠져 있어서, `/health` 와
    `/v1/health` 가 로그에서 한 줄로 합쳐진다.

    대신 실제 경로에서 path 파라미터 값만 되돌린다. 값이 우연히 다른 칸과
    같아도 바뀌지 않게 세그먼트 단위로만 본다. 여러 칸을 한꺼번에 받는
    `{rest:path}` 같은 것은 되돌리지 못하고 그대로 남는데, 지금 그런 경로는
    없고 생기면 여기를 손봐야 한다.
    """
    if request.scope.get("route") is None:
        # 라우팅이 안 잡힌 요청(404)은 틀이 없다. 경로를 그대로 남기면
        # 바깥에서 아무 문자열이나 로그에 넣을 수 있으므로 남기지 않는다.
        return UNMATCHED

    path = request.scope.get("path") or ""
    params = request.scope.get("path_params") or {}
    if not params:
        return path

    틀 = {str(값): "{" + 이름 + "}" for 이름, 값 in params.items()}
    return "/".join(틀.get(칸, 칸) for 칸 in path.split("/"))


async def log_request(request: Request, call_next, pepper: str) -> Response:
    시작 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        # 여기서 잡히는 것은 오류 핸들러도 못 막은 것이다. 로그는 남기고
        # 다시 던진다.
        logger.exception(
            "request failed",
            extra={
                "method": request.method,
                "endpoint": endpoint_of(request),
                "status": 500,
                "durationMs": round((time.perf_counter() - 시작) * 1000, 1),
            },
        )
        raise

    걸린_시간 = round((time.perf_counter() - 시작) * 1000, 1)
    사용자 = getattr(request.state, "user_id", None)
    logger.info(
        "request",
        extra={
            "method": request.method,
            "endpoint": endpoint_of(request),
            "status": response.status_code,
            "durationMs": 걸린_시간,
            "actor": actor_hash(사용자, pepper),
        },
    )
    return response
