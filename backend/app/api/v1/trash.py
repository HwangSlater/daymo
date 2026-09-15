import uuid
from typing import Literal

from fastapi import APIRouter

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import WRITERS, membership_for_trip, membership_for_trip_row, require
from app.api.v1.memories import _메모_응답
from app.api.v1.photos import _한_장
from app.core.responses import ok, page
from app.models import Memo, Photo
from app.schemas.memory import TrashItemOut
from app.services import audit
from app.services import trash as trash_service
from app.services.memories import author_names, name_of
from app.services.photos import can_manage

router = APIRouter(tags=["trash"])


def _휴지통_줄(item: Memo | Photo, names: dict, *, can_restore: bool) -> dict:
    메모다 = isinstance(item, Memo)
    return TrashItemOut(
        id=str(item.id),
        type="memo" if 메모다 else "photo",
        trip_id=str(item.trip_id),
        preview=trash_service.memo_preview(item.body) if 메모다 else item.caption,
        deleted_at=item.deleted_at,
        deleted_by_membership_id=str(item.deleted_by) if item.deleted_by else None,
        deleted_by_name=name_of(names, item.deleted_by),
        restore_deadline=trash_service.restore_deadline(item.deleted_at),
        can_restore=can_restore,
    ).model_dump(by_alias=True, mode="json")


@router.get("/trips/{trip_id}/trash")
async def list_trash(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    """7일 안에 지운 메모와 사진. 최근에 지운 것부터. owner·editor 만."""
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    memos, photos = await trash_service.list_trash(db, trip)
    names = await author_names(db, [item.deleted_by for item in [*memos, *photos]])
    줄들 = [(memo.deleted_at, _휴지통_줄(memo, names, can_restore=True)) for memo in memos] + [
        (photo.deleted_at, _휴지통_줄(photo, names, can_restore=can_manage(membership, photo))) for photo in photos
    ]
    줄들.sort(key=lambda 짝: 짝[0], reverse=True)
    return page([줄 for _, 줄 in 줄들])


@router.post("/trash/{target_type}/{target_id}/restore")
async def restore(
    target_type: Literal["memo", "photo"], target_id: uuid.UUID, caller: CurrentCaller, db: DbSession
) -> dict:
    """
    되살린 메모나 사진을 목록과 같은 모양으로 돌려준다.

    권한은 지울 때와 같다. 지운 지 7일이 지났으면 `410 GONE`, 지우지 않은 것이면 그대로 답한다.
    """
    model = Memo if target_type == "memo" else Photo
    membership, trip, item = await membership_for_trip_row(db, user_id=caller.user.id, model=model, row_id=target_id)
    require(membership, *WRITERS)
    if isinstance(item, Memo):
        되살렸다 = await trash_service.restore_memo(db, item)
    else:
        되살렸다 = await trash_service.restore_photo(db, item, actor=membership)
    if 되살렸다:
        await audit.record(db, space_id=trip.space_id, actor_membership_id=membership.id, action=f"{target_type}.restore", target_type=target_type, target_id=item.id, summary_fields={"tripId": str(trip.id)})
    if isinstance(item, Memo):
        return ok(_메모_응답(item, await author_names(db, [item.author_membership_id])))
    return ok(await _한_장(db, item))
