import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool

from app.core.config import get_settings
from app.core.runtime import use_selector_event_loop_on_windows
from app.models import Base

# alembic.ini 는 일부러 ASCII 로만 쓴다. configparser 가 그 파일을 윈도우
# 기본 인코딩(cp949)으로 읽어서, 한글 주석을 넣으면 alembic 이 실행조차 되지
# 않는다. 설정 파일에 대한 설명은 그래서 여기 둔다.
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# URL은 ini 가 아니라 앱 설정에서 가져온다. 앱과 migration 이 서로 다른 DB 를
# 보는 사고를 막고, 비밀번호를 파일에 남기지 않는다.
config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    use_selector_event_loop_on_windows()
    asyncio.run(run_migrations_online())
