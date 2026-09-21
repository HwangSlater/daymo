"""
받은 의견을 새것부터 보여 준다. 운영자가 읽기만 한다.

    python -m app.jobs.feedback            # 최근 50건
    python -m app.jobs.feedback --days 7   # 최근 7일

보낸 사람은 표시 이름만 보인다. 이메일은 꺼내지 않는다.
"""

import argparse
import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.db import get_engine, get_session_factory
from app.core.runtime import use_selector_event_loop_on_windows
from app.models import Feedback, User

종류_말 = {"problem": "불편해요", "idea": "이런 기능이 있으면", "other": "기타"}


async def main(days: int | None, limit: int) -> None:
    async with get_session_factory()() as session:
        물음 = (
            select(Feedback, User.display_name)
            .outerjoin(User, User.id == Feedback.user_id)
            .order_by(Feedback.created_at.desc())
            .limit(limit)
        )
        if days is not None:
            물음 = 물음.where(Feedback.created_at > datetime.now(UTC) - timedelta(days=days))
        줄들 = (await session.execute(물음)).all()
    await get_engine().dispose()
    if not 줄들:
        print("받은 의견이 없어요.")
        return
    for 의견, 이름 in 줄들:
        시각 = 의견.created_at.astimezone(UTC) + timedelta(hours=9)
        print(f"── {시각:%Y-%m-%d %H:%M} · {종류_말.get(의견.kind, 의견.kind)} · {이름 or '삭제된 계정'} · {의견.platform} {의견.app_version}")
        print(의견.body)
        print()


if __name__ == "__main__":
    읽기 = argparse.ArgumentParser(description="받은 의견 보기")
    읽기.add_argument("--days", type=int, default=None)
    읽기.add_argument("--limit", type=int, default=50)
    인자 = 읽기.parse_args()
    use_selector_event_loop_on_windows()
    asyncio.run(main(인자.days, 인자.limit))
