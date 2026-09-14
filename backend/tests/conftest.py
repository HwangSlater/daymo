import os

import pytest

# 설정을 읽기 전에 넣어야 한다. get_settings 가 캐시되므로 앱을 import 한 뒤에
# 바꾸면 반영되지 않는다.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DB_NAME", "daymo_test")
# 실제 키처럼 보이지 않게 뻔한 값을 쓴다. 공개 저장소다.
os.environ.setdefault("JWT_SIGNING_KEY", "테스트-서명-키-" + "0" * 40)
os.environ.setdefault("REFRESH_TOKEN_PEPPER", "테스트-후추-" + "9" * 40)

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.db import get_session  # noqa: E402
from app.core.runtime import use_selector_event_loop_on_windows  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402

# 루프가 만들어지기 전에 불러야 한다. 윈도우에서 psycopg 비동기가 기본
# 이벤트 루프 위에서 동작하지 않는다.
use_selector_event_loop_on_windows()


# session 범위 비동기 fixture(db_engine)를 쓰려면 이것도 session 이어야 한다.
# function 범위면 anyio 가 fixture 정리 순서를 맞추지 못해 전부 깨진다.
@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ---------------------------------------------------------------------------
# DB 를 실제로 쓰는 테스트
#
# 제약은 SQLAlchemy 가 아니라 PostgreSQL 이 거는 것이라 모형으로는 시험할 수
# 없다. 부분 유니크 인덱스, CASCADE, RESTRICT 는 진짜 DB 에서만 드러난다.
# ---------------------------------------------------------------------------

_스킵_사유 = (
    "테스트용 PostgreSQL 에 연결할 수 없다. `docker compose up -d postgres` 를 먼저 실행해라. "
    "CI 에서는 DAYMO_REQUIRE_DB=1 이라 건너뛰지 않고 실패한다."
)


@pytest.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(get_settings().database_url, poolclass=None)
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as 원인:
        await engine.dispose()
        # CI 에서 DB 가 안 뜬 것을 "통과" 로 읽으면 제약이 깨져도 모른다.
        if os.environ.get("DAYMO_REQUIRE_DB"):
            raise RuntimeError(_스킵_사유) from 원인
        pytest.skip(_스킵_사유, allow_module_level=True)

    # 스키마는 migration 이 만든 것을 그대로 쓴다. 여기서 create_all 을 하면
    # migration 이 틀려도 테스트는 통과해 버린다.
    async with engine.connect() as connection:
        있는_테이블 = await connection.execute(
            text("SELECT to_regclass('public.users')")
        )
        if 있는_테이블.scalar() is None:
            await engine.dispose()
            raise RuntimeError(
                "테이블이 없다. `uv run alembic upgrade head` 를 먼저 실행해라."
            )

    yield engine
    await engine.dispose()


@pytest.fixture
async def db(db_engine) -> AsyncSession:
    """
    테스트 하나가 쓰는 세션.

    바깥 transaction 을 열고 끝나면 되돌린다. 테스트가 서로의 행을 보지
    않게 하면서 TRUNCATE 없이 빠르게 돈다.
    """
    # 시도 횟수 표를 먼저 비운다. throttle 은 요청 transaction 바깥에서 자기
    # 연결로 commit 하므로(그래야 실패한 요청의 횟수가 롤백되지 않는다)
    # 테스트의 롤백에 딸려 사라지지 않는다. 비우지 않으면 앞 테스트의 실패가
    # 다음 테스트를 막는다.
    async with db_engine.begin() as 정리용:
        await 정리용.execute(text("TRUNCATE throttle_counters"))

    async with db_engine.connect() as connection:
        transaction = await connection.begin()
        # join_transaction_mode="create_savepoint" 가 없으면 세션이 바깥
        # transaction 을 자기 것으로 삼아서, 정리할 때 이미 끊긴 것을 다시
        # 되돌리려다 경고가 난다. savepoint 로 들어가면 서로 건드리지 않는다.
        session = AsyncSession(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        try:
            yield session
        finally:
            await session.close()
            if transaction.is_active:
                await transaction.rollback()


__all__ = ["Base"]


@pytest.fixture
async def api(app, db):
    """
    HTTP 로 두드리는 테스트용 client.

    앱이 쓰는 세션을 테스트 세션으로 갈아 끼운다. 그래야 요청이 남긴 것을
    같은 자리에서 확인할 수 있고, 테스트가 끝나면 함께 되돌아간다.
    """
    from app.services.mailer import get_outbox

    async def 테스트_세션():
        yield db

    app.dependency_overrides[get_session] = 테스트_세션
    get_outbox().clear()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
    get_outbox().clear()


@pytest.fixture
async def 시도_시각을_되돌린다(db_engine):
    """
    시도 기록을 과거로 민다.

    재전송 간격 같은 것을 시험하려면 실제로 60초를 기다릴 수는 없다.
    throttle 은 자기 연결로 commit 하므로 여기서도 commit 해야 보인다.
    """

    async def 되돌린다(초: int):
        async with db_engine.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE throttle_counters SET last_attempt_at = last_attempt_at - "
                    "make_interval(secs => :초), window_started_at = window_started_at - "
                    "make_interval(secs => :초)"
                ),
                {"초": 초},
            )

    return 되돌린다
