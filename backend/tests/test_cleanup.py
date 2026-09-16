"""
정리 작업이 오래된 것을 지우고 남길 것은 남기는지.

기한 하루 전과 하루 뒤를 함께 본다. 경계 한쪽만 보면 "아무것도 안 지운다" 와
"전부 지운다" 가 똑같이 통과한다.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models import (
    AuditLog,
    Diary,
    Memo,
    Report,
    ReportReason,
    ReportTargetType,
)
from app.services import audit, memories
from app.services.trash import TRASH_WINDOW
from tests.factories import 공간과_멤버_하나, 여행을_넣는다

pytestmark = pytest.mark.anyio

지금 = datetime(2026, 9, 16, 12, 0, tzinfo=UTC)


async def 지운_메모를_넣는다(db, trip, membership, *, 지운_때: datetime, 본문: str = "쪽지") -> Memo:
    memo = Memo(
        trip_id=trip.id,
        author_membership_id=membership.id,
        body=본문,
        deleted_at=지운_때,
        deleted_by=membership.id,
    )
    db.add(memo)
    await db.flush()
    return memo


async def 감사_기록을_넣는다(db, space, *, 적은_때: datetime, action: str = "memo.delete", target_id=None) -> AuditLog:
    log = AuditLog(
        space_id=space.id,
        action=action,
        target_type="memo",
        target_id=target_id,
        created_at=적은_때,
    )
    db.add(log)
    await db.flush()
    return log


async def 남은_수(db, model) -> int:
    return int(await db.scalar(select(func.count()).select_from(model)) or 0)


# ---------------------------------------------------------------------------
# 지운 메모 파기
# ---------------------------------------------------------------------------


async def test_기한_전의_지운_메모는_남고_기한이_지난_것만_사라진다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    아직 = await 지운_메모를_넣는다(db, trip, membership, 지운_때=지금 - TRASH_WINDOW + timedelta(hours=1))
    지났다 = await 지운_메모를_넣는다(db, trip, membership, 지운_때=지금 - TRASH_WINDOW - timedelta(hours=1))

    수 = await memories.purge_memos(db, now=지금)

    assert 수 == 1
    assert await db.get(Memo, 아직.id) is not None
    assert await db.get(Memo, 지났다.id) is None


async def test_지우지_않은_메모와_일기는_건드리지_않는다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    산_메모 = Memo(trip_id=trip.id, author_membership_id=membership.id, body="살아 있는 쪽지")
    일기 = Diary(trip_id=trip.id, author_membership_id=membership.id, body="일기")
    db.add_all([산_메모, 일기])
    await db.flush()
    await 지운_메모를_넣는다(db, trip, membership, 지운_때=지금 - TRASH_WINDOW - timedelta(days=30))

    assert await memories.purge_memos(db, now=지금) == 1
    assert await db.get(Memo, 산_메모.id) is not None
    assert await db.get(Diary, 일기.id) is not None


async def test_메모를_지워도_감사_기록과_신고는_남는다(db):
    """
    둘 다 `target_id` 에 외래키가 없어서 함께 지울지 고를 수 있다. 남기는 쪽이다.
    감사 기록을 함께 지우면 메모를 지우고 일주일만 기다리면 지운 흔적까지
    사라진다. 신고는 운영자가 검토를 끝내야 하는 줄이다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    memo = await 지운_메모를_넣는다(db, trip, membership, 지운_때=지금 - TRASH_WINDOW - timedelta(days=1))
    기록 = await 감사_기록을_넣는다(db, space, 적은_때=지금 - TRASH_WINDOW, target_id=memo.id)
    신고 = Report(
        reporter_user_id=membership.user_id,
        space_id=space.id,
        target_type=ReportTargetType.MEMO,
        target_id=memo.id,
        reason=ReportReason.SPAM,
    )
    db.add(신고)
    await db.flush()

    assert await memories.purge_memos(db, now=지금) == 1

    assert await db.get(AuditLog, 기록.id) is not None
    assert await db.get(Report, 신고.id) is not None


async def test_메모_파기는_한_번에_상한까지만_지운다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    오래된 = 지금 - TRASH_WINDOW - timedelta(days=1)
    for 번째 in range(5):
        await 지운_메모를_넣는다(db, trip, membership, 지운_때=오래된, 본문=f"쪽지 {번째}")

    assert await memories.purge_memos(db, now=지금, limit=2) == 2
    assert await 남은_수(db, Memo) == 3
    # 다음 날 또 돌면 나머지도 지운다.
    assert await memories.purge_memos(db, now=지금, limit=2) == 2
    assert await memories.purge_memos(db, now=지금, limit=2) == 1
    assert await 남은_수(db, Memo) == 0


# ---------------------------------------------------------------------------
# 감사 기록 파기
# ---------------------------------------------------------------------------


async def test_보유기간_전의_감사_기록은_남고_지난_것만_사라진다(db):
    space, _ = await 공간과_멤버_하나(db)
    아직 = await 감사_기록을_넣는다(db, space, 적은_때=지금 - audit.RETENTION + timedelta(hours=1))
    지났다 = await 감사_기록을_넣는다(db, space, 적은_때=지금 - audit.RETENTION - timedelta(hours=1))

    수 = await audit.purge_expired(db, now=지금)

    assert 수 == 1
    assert await db.get(AuditLog, 아직.id) is not None
    assert await db.get(AuditLog, 지났다.id) is None


async def test_감사_기록_보유기간은_6개월이다(db):
    """문서와 같은 값인지. 기간을 줄이려면 문서부터 고쳐야 한다."""
    assert audit.RETENTION == timedelta(days=180)


async def test_감사_기록_파기는_상한까지_오래된_것부터_지운다(db):
    space, _ = await 공간과_멤버_하나(db)
    줄들 = [
        await 감사_기록을_넣는다(db, space, 적은_때=지금 - audit.RETENTION - timedelta(days=하루))
        for 하루 in (1, 2, 3)
    ]

    assert await audit.purge_expired(db, now=지금, limit=2) == 2

    # 가장 오래된 둘(3일 전, 2일 전)이 먼저 간다.
    assert await db.get(AuditLog, 줄들[2].id) is None
    assert await db.get(AuditLog, 줄들[1].id) is None
    assert await db.get(AuditLog, 줄들[0].id) is not None


async def test_공간이_없는_감사_기록도_기간이_지나면_사라진다(db):
    """공간을 지워도 줄은 SET NULL 로 남는다. 그 줄까지 기간을 넘기면 지운다."""
    남은 = AuditLog(
        space_id=None,
        actor_membership_id=None,
        action="trip.delete",
        target_type="trip",
        target_id=uuid.uuid4(),
        created_at=지금 - audit.RETENTION - timedelta(days=1),
    )
    db.add(남은)
    await db.flush()

    assert await audit.purge_expired(db, now=지금) == 1
    assert await db.get(AuditLog, 남은.id) is None


async def test_정리_작업_목록에_메모와_감사_기록이_있다():
    """cleanup 에 넣지 않으면 서비스 함수만 있고 아무도 부르지 않는다."""
    from app.jobs.cleanup import JOBS

    assert {"memos", "audit"} <= {이름 for 이름, _ in JOBS}
