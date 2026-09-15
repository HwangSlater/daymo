"""
하루 한 번 도는 정리 작업.

    python -m app.jobs.cleanup

운영에서는 `daymo-cleanup.timer` 가 api 이미지로 한 번 실행하고 끝낸다
(backend/infra/production/daymo-cleanup). 요청을 받는 워커 안에서 돌리지 않는다.
워커가 둘이면 두 번 돌고, 재시작하면 건너뛴다.

일마다 transaction 을 따로 쓴다. 계정 정리가 실패해도 여행 정리와 시도
횟수 정리는 끝까지 간다.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_engine, get_session_factory
from app.core.logging import configure_logging
from app.core.runtime import use_selector_event_loop_on_windows
from app.services import account_deletion, throttle, trips

logger = logging.getLogger("daymo.jobs.cleanup")

Job = Callable[[AsyncSession], Awaitable[int]]

JOBS: list[tuple[str, Job]] = [
    ("accounts", lambda session: account_deletion.purge_deleted_accounts(session)),
    ("trips", lambda session: trips.purge_deleted_trips(session)),
    ("throttle", lambda session: throttle.purge_expired(session)),
]


async def run() -> bool:
    """모든 일을 돌린다. 하나라도 실패하면 False. timer 가 실패로 기록하게 한다."""
    모두_성공 = True
    for 이름, 일 in JOBS:
        async with get_session_factory()() as session:
            try:
                수 = await 일(session)
                await session.commit()
                logger.info("정리 %s: %d", 이름, 수)
            except Exception:
                await session.rollback()
                모두_성공 = False
                logger.exception("정리 %s 실패", 이름)
    await get_engine().dispose()
    return 모두_성공


def main() -> int:
    configure_logging()
    use_selector_event_loop_on_windows()
    return 0 if asyncio.run(run()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
