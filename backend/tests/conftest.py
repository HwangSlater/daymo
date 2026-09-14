import os

import pytest

# 설정을 읽기 전에 넣어야 한다. get_settings 가 캐시되므로 앱을 import 한 뒤에
# 바꾸면 반영되지 않는다.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DB_NAME", "daymo_test")

from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import create_app  # noqa: E402


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def anyio_backend():
    return "asyncio"
