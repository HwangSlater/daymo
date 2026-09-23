import uuid

from fastapi import APIRouter, Query

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import membership_in_space
from app.core.responses import Page, page
from app.schemas.search import SearchHitOut
from app.services import search as search_service

router = APIRouter(tags=["search"])


@router.get("/spaces/{space_id}/search", response_model=Page[SearchHitOut])
async def search_space(
    space_id: uuid.UUID,
    caller: CurrentCaller,
    db: DbSession,
    q: str = Query(default="", max_length=search_service.MAX_QUERY),
    types: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=search_service.MAX_RESULTS),
) -> dict:
    """
    이 공간의 여행·일정·장소·준비물·요리·지출·메모·일기에서 찾는다.

    `q` 가 두 글자보다 짧으면 빈 목록이다. 한 글자는 거의 모든 줄에 걸려서
    「찾았다」가 아니고, 그때마다 표를 여덟 번 읽는다.

    `types` 로 종류를 골라 받을 수 있다(`place,expense` 처럼 쉼표로 잇는다).
    모르는 이름은 그냥 빠진다 — 새 종류가 생겨도 옛 앱의 요청이 422 로 막히지
    않게 하려는 것이다.

    지운 여행·지운 메모는 나오지 않는다. 멤버가 아니면 공간이 없는 것과 같은 404 다.
    """
    await membership_in_space(db, user_id=caller.user.id, space_id=space_id)
    고른_종류 = (
        tuple(값.strip() for 값 in types.split(",") if 값.strip())
        if types
        else search_service.SEARCH_TYPES
    )
    찾은_것 = await search_service.search_space(
        db, space_id=space_id, query=q, types=고른_종류, limit=limit
    )
    return page(
        [
            SearchHitOut(
                type=hit.type,
                id=str(hit.id),
                trip_id=str(hit.trip_id),
                trip_title=hit.trip_title,
                title=hit.title,
                detail=hit.detail,
                destination=search_service.DESTINATION_BY_TYPE[hit.type],
            ).model_dump(by_alias=True)
            for hit in 찾은_것
        ]
    )
