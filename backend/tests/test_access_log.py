import json
import logging

import pytest
from fastapi import APIRouter

from app.core.access_log import UNMATCHED, actor_hash, endpoint_of
from app.core.logging import JsonFormatter

pytestmark = pytest.mark.anyio


class 모아두는_handler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.setFormatter(JsonFormatter())
        self.줄 = []

    def emit(self, record):
        self.줄.append(json.loads(self.format(record)))


@pytest.fixture
def 로그():
    handler = 모아두는_handler()
    logger = logging.getLogger("daymo.access")
    logger.addHandler(handler)
    try:
        yield handler
    finally:
        logger.removeHandler(handler)


async def test_요청마다_한_줄을_남긴다(client, 로그):
    await client.get("/health")

    (줄,) = [줄 for 줄 in 로그.줄 if 줄["message"] == "request"]
    assert 줄["method"] == "GET"
    assert 줄["endpoint"] == "/health"
    assert 줄["status"] == 200
    assert isinstance(줄["durationMs"], float)
    assert 줄["requestId"]


async def test_접두사가_붙은_경로를_구분한다(client, 로그):
    """
    scope["route"].path 를 그대로 쓰면 /health 와 /v1/health 가 로그에서
    한 줄로 합쳐진다. 둘은 다른 API 다.
    """
    await client.get("/health")
    await client.get("/v1/health")

    경로들 = [줄["endpoint"] for 줄 in 로그.줄 if 줄["message"] == "request"]
    assert 경로들 == ["/health", "/v1/health"]


async def test_라우팅이_안_잡히면_경로를_남기지_않는다(client, 로그):
    """바깥에서 아무 문자열이나 로그에 넣을 수 있으면 안 된다."""
    await client.get("/v1/아무거나-<script>")

    (줄,) = [줄 for 줄 in 로그.줄 if 줄["message"] == "request"]
    assert 줄["endpoint"] == UNMATCHED
    assert 줄["status"] == 404


async def test_로그인하지_않은_요청에는_actor가_없다(client, 로그):
    await client.get("/health")

    (줄,) = [줄 for 줄 in 로그.줄 if 줄["message"] == "request"]
    assert "actor" not in 줄


async def test_사용자가_쓴_글은_로그에_남지_않는다(client, 로그):
    """
    질의 문자열에 검색어가 들어간다. 문서가 허용한 것은 request ID,
    actor hash, endpoint, status, latency 다섯 가지뿐이다.
    """
    await client.get("/health?q=제주도 맛집&secret=abc")

    (줄,) = [줄 for 줄 in 로그.줄 if 줄["message"] == "request"]
    전체 = json.dumps(줄, ensure_ascii=False)
    assert "제주도" not in 전체
    assert "secret" not in 전체
    assert set(줄) <= {
        "at", "level", "logger", "message",
        "requestId", "method", "endpoint", "status", "durationMs", "actor",
    }


# ---------------------------------------------------------------------------
# 단위
# ---------------------------------------------------------------------------


def test_actor는_계정_ID를_그대로_남기지_않는다():
    계정 = "9f3cabcd-0000-0000-0000-000000000000"

    결과 = actor_hash(계정, "후추")

    assert 결과 is not None
    assert 계정 not in 결과
    assert len(결과) == 16


def test_같은_사람은_같은_값이_된다():
    """같은 사람의 요청을 이어 볼 수 있어야 장애를 되짚는다."""
    assert actor_hash("같은-계정", "후추") == actor_hash("같은-계정", "후추")


def test_pepper가_다르면_값도_다르다():
    """로그만 들고 가도 거꾸로 찾을 수 없어야 한다."""
    assert actor_hash("계정", "후추1") != actor_hash("계정", "후추2")


def test_로그인하지_않았으면_None이다():
    assert actor_hash(None, "후추") is None


def test_path_파라미터를_틀로_되돌린다(app):
    """
    /v1/trips/9f3c.../expenses 를 그대로 남기면 같은 API 요청을 셀 수 없다.
    """
    router = APIRouter()

    @router.get("/trips/{trip_id}/expenses")
    def _(trip_id: str):  # pragma: no cover - 경로만 쓴다
        return {}

    app.include_router(router, prefix="/v1")

    class 가짜요청:
        scope = {
            "route": object(),
            "path": "/v1/trips/9f3cabcd-0000-0000-0000-000000000000/expenses",
            "path_params": {"trip_id": "9f3cabcd-0000-0000-0000-000000000000"},
        }

    assert endpoint_of(가짜요청) == "/v1/trips/{trip_id}/expenses"
