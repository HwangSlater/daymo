import logging
from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

logger = logging.getLogger("daymo.db")

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """
    비동기 엔진 하나를 프로세스 안에서 재사용한다.

    pool 값은 docs/development/06-vps-deployment.md 3장에서 온다. 워커 하나가
    최대 10개, 워커 2개로 20개이고 PostgreSQL max_connections = 30 아래라
    관리·백업 연결 몫이 남는다. 워커 수나 pool 을 올릴 때는 이 계산을 다시 한다.
    """
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,
            # 없으면 호스트를 잘못 적었을 때 실패하지 않고 멈춰 있는다.
            connect_args={"connect_timeout": 5},
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI 의존성. 요청 하나에 세션 하나."""
    async with get_session_factory()() as session:
        yield session


async def check_database() -> bool:
    """DB가 실제로 응답하는지 본다. 연결 풀이 살아 있는 것과 다른 이야기다."""
    try:
        async with get_engine().connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except Exception:
        # 조용히 False 를 돌려주면 health check 가 왜 실패하는지 알 수 없다.
        # 응답 본문에는 내용을 싣지 않고 로그에만 남긴다.
        logger.warning("database check failed", exc_info=True)
        return False


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
