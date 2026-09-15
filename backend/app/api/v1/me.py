from fastapi import APIRouter, status
from pydantic import Field
from sqlalchemy import select

from app.api.deps import CurrentCaller, DbSession
from app.core.errors import AppError, ErrorCode
from app.core.responses import ok
from app.models import Membership, OAuthAccount, Space
from app.schemas.auth import DeletionOut, MeOut, MeSpaceOut, ReauthProofRequest, _Camel
from app.services import account_deletion
from app.services.account_deletion import DeletionState

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
            deletion_scheduled_at=caller.user.deletion_scheduled_at,
            has_password=bool(caller.user.password_hash),
            linked_providers=sorted(
                (
                    await db.execute(select(OAuthAccount.provider).where(OAuthAccount.user_id == caller.user.id))
                ).scalars()
            ),
        ).model_dump(by_alias=True)
    )


class MeUpdateRequest(_Camel):
    # 가입할 때와 같은 한도다.
    display_name: str = Field(min_length=1, max_length=20)


@router.patch("")
async def update_me(body: MeUpdateRequest, caller: CurrentCaller, db: DbSession) -> dict:
    """
    표시 이름을 바꾼다. 공간마다 둔 별명(`memberships.nickname`)은 그대로다.

    같은 공간 멤버의 기기는 다음에 멤버 목록을 받을 때 새 이름을 보고, 여행 기록 안의
    옛 이름을 따라 바꾼다(mobile/src/people.ts).
    """
    name = " ".join(body.display_name.split())
    if not name:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"displayName": "이름을 적어 주세요."})
    caller.user.display_name = name
    await db.flush()
    return await get_me(caller, db)


def _삭제_상태(상태: DeletionState) -> dict:
    return ok(
        DeletionOut(
            requested_at=상태.requested_at, scheduled_at=상태.scheduled_at
        ).model_dump(by_alias=True)
    )


@router.delete("", status_code=status.HTTP_202_ACCEPTED)
async def request_account_deletion(
    body: ReauthProofRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    """
    계정 삭제를 요청한다. 7일 뒤에 지워지고, 그 전까지 취소할 수 있다.

    `POST /auth/reauth` 에서 `delete_account` 로 받은 증표가 있어야 한다.
    요청하면 이 기기를 포함한 모든 기기가 로그아웃된다.
    """
    상태 = await account_deletion.request_deletion(db, user=caller.user, proof=body.reauth_proof)
    return _삭제_상태(상태)


@router.get("/deletion")
async def get_account_deletion(caller: CurrentCaller) -> dict:
    """삭제를 요청해 뒀는지, 언제 지워지는지."""
    return _삭제_상태(account_deletion.state_of(caller.user))


@router.post("/deletion/cancel")
async def cancel_account_deletion(
    body: ReauthProofRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    """유예 중인 삭제를 취소한다. `cancel_deletion` 증표가 있어야 한다."""
    상태 = await account_deletion.cancel_deletion(db, user=caller.user, proof=body.reauth_proof)
    return _삭제_상태(상태)
