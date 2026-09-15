"""웹 버전(www.daymo.xyz/app)이 브라우저에서 API 를 부를 수 있는지."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app

pytestmark = pytest.mark.anyio


async def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test")


async def test_웹_주소의_사전_요청을_받는다() -> None:
    async with await _client() as client:
        응답 = await client.options(
            "/v1/auth/login",
            headers={
                "Origin": "https://www.daymo.xyz",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
    assert 응답.status_code == 200
    assert 응답.headers["access-control-allow-origin"] == "https://www.daymo.xyz"
    assert "access-control-allow-credentials" not in 응답.headers


async def test_오류_응답에도_헤더가_붙는다() -> None:
    async with await _client() as client:
        응답 = await client.get("/v1/me", headers={"Origin": "https://www.daymo.xyz"})
    assert 응답.status_code == 401
    assert 응답.headers["access-control-allow-origin"] == "https://www.daymo.xyz"


async def test_모르는_주소에는_열지_않는다() -> None:
    async with await _client() as client:
        응답 = await client.options(
            "/v1/auth/login",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )
    assert "access-control-allow-origin" not in 응답.headers
