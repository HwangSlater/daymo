import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import Payment, Trip


async def alive_payment_count(session: AsyncSession, trip_id: uuid.UUID) -> int:
    """
    되돌리지 않은 송금 기록의 수.

    `deleted_at` 이 찬 것은 세지 않는다. 잘못 적어 되돌린 기록이라 잔액에도
    들어가지 않는다.
    """
    return await session.scalar(
        select(func.count())
        .select_from(Payment)
        .where(Payment.trip_id == trip_id, Payment.deleted_at.is_(None))
    ) or 0


async def set_simplify_settlement(
    session: AsyncSession, trip_id: uuid.UUID, simplify: bool
) -> None:
    """
    주고받을 횟수를 줄여 보여줄지를 바꾼다.

    **주고받은 기록이 하나라도 있으면 바꿀 수 없다.** 묶은 화면대로 보낸
    뒤에 방식을 바꾸면 이미 보낸 돈이 엉뚱한 곳으로 간 것이 되기 때문이다.
    기록을 모두 되돌리면 다시 바뀐다.

    이 검증은 앱의 안전장치가 아니라 서버가 해야 한다고 문서가 못 박아 둔
    부분이다(docs/development/02-architecture-and-data-model.md 3장). 앱이
    토글을 잠그는 것만으로는 API 를 직접 부르는 쪽에서 뚫린다.

    같은 값으로 다시 쓰는 것은 막지 않는다. 바뀌는 것이 없으니 위 이유가
    적용되지 않고, 화면이 되돌아온 값을 그대로 저장하는 흔한 경우를
    오류로 만들 이유가 없다.
    """
    현재 = await session.scalar(select(Trip.simplify_settlement).where(Trip.id == trip_id))
    if 현재 is None:
        raise AppError(ErrorCode.NOT_FOUND)
    if 현재 == simplify:
        return

    if await alive_payment_count(session, trip_id):
        raise AppError(
            ErrorCode.SETTLEMENT_IN_PROGRESS,
            message="이미 주고받은 기록이 있어 정산 방식을 바꿀 수 없어요. 기록을 되돌리면 다시 바꿀 수 있어요.",
        )

    await session.execute(
        update(Trip).where(Trip.id == trip_id).values(simplify_settlement=simplify)
    )


async def undo_payment(session: AsyncSession, payment_id: uuid.UUID) -> None:
    """
    잘못 적은 송금 기록을 되돌린다.

    행을 지우지 않고 `deleted_at` 을 채운다. 되돌린 사실 자체가 정산에서
    말이 갈릴 때 근거가 되기 때문이다.

    이미 되돌린 것을 다시 되돌려도 시각을 덮어쓰지 않는다. 처음 되돌린
    때가 기록으로 남아야 한다.
    """
    await session.execute(
        update(Payment)
        .where(Payment.id == payment_id, Payment.deleted_at.is_(None))
        .values(deleted_at=datetime.now(UTC))
    )
