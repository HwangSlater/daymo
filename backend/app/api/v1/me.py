from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentCaller, DbSession
from app.core.responses import ok
from app.models import Membership, Space
from app.schemas.auth import MeOut, MeSpaceOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def get_me(caller: CurrentCaller, db: DbSession) -> dict:
    """로그인한 사용자와 현재 참여 중인 공간을 앱 시작에 필요한 만큼 돌려준다."""
    spaces = (
        await db.execute(
            select(Space, Membership)
            .join(Membership, Membership.space_id == Space.id)
            .where(
                Membership.user_id == caller.user.id,
                Membership.left_at.is_(None),
                Space.deleted_at.is_(None),
            )
            .order_by(Space.created_at)
        )
    ).all()

    return ok(
        MeOut(
            id=str(caller.user.id),
            email=caller.user.email,
            display_name=caller.user.display_name,
            avatar_url=None,
            spaces=[
                MeSpaceOut(
                    id=str(space.id),
                    name=space.name,
                    relationship_type=space.relationship_type,
                    role=membership.role,
                )
                for space, membership in spaces
            ],
        ).model_dump(by_alias=True)
    )
