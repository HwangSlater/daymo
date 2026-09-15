"""
여행에 담은 장소.

장소 실체(`places`)와 여행에서의 쓰임(`trip_places`)이 나뉘어 있다. 지금 앱이
만드는 장소는 전부 손으로 적은 것(`manual`)이라, 여행 장소 하나에 장소 실체
하나가 딸린다. 그래서 이름·주소를 고치면 실체를 함께 고친다. 네이버처럼 제공자
id 가 붙어 여러 여행이 같은 실체를 나눠 쓰게 되는 날에는 이 규칙을 다시 본다.
"""

import re
import uuid
from dataclasses import dataclass
from urllib.parse import urlsplit

from sqlalchemy import delete, exists, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import (
    ExternalLink,
    LinkProvider,
    LinkTargetType,
    Membership,
    PhotoTargetType,
    Place,
    PlaceProvider,
    Tag,
    TagScope,
    Tagging,
    Trip,
    TripPlace,
    TripPlaceStatus,
)
from app.services.links import detach_all

MAX_TAG_LENGTH = 20


@dataclass
class PlaceView:
    trip_place: TripPlace
    place: Place
    tags: list[str]
    map_url: str | None


# ---------------------------------------------------------------------------
# 입력 정리
# ---------------------------------------------------------------------------


def normalize_tags(raw: list[str]) -> list[str]:
    """
    공백을 한 칸으로 줄이고, 비면 버리고, 겹치면 하나만 둔다. 순서는 지킨다.

    20자를 넘으면 자르지 않고 거부한다. 잘라서 저장하면 사용자가 적은 것과 다른
    태그가 조용히 생긴다.
    """
    결과: list[str] = []
    for 값 in raw:
        이름 = " ".join(값.split())
        if not 이름:
            continue
        if len(이름) > MAX_TAG_LENGTH:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"tags": f"태그는 {MAX_TAG_LENGTH}자까지 쓸 수 있어요."})
        if 이름 not in 결과:
            결과.append(이름)
    return 결과


_PROVIDER_HOSTS: list[tuple[re.Pattern[str], LinkProvider]] = [
    (re.compile(r"(^|\.)(map\.naver\.com|naver\.me)$"), LinkProvider.NAVER_MAP),
    (re.compile(r"(^|\.)(map\.kakao\.com|place\.map\.kakao\.com|kko\.to)$"), LinkProvider.KAKAO_MAP),
    (re.compile(r"(^|\.)(youtube\.com|youtu\.be)$"), LinkProvider.YOUTUBE),
]


def check_map_url(raw: str | None) -> tuple[str, LinkProvider] | None:
    """
    지도 링크를 받아도 되는지 본다. 비었으면 None.

    **http/https 만 받는다.** `javascript:` 같은 주소가 저장되면 다른 멤버가
    눌렀을 때 그 기기에서 실행된다(docs/development/05-quality-and-operations.md).
    """
    if raw is None or not raw.strip():
        return None
    주소 = raw.strip()
    try:
        조각 = urlsplit(주소)
    except ValueError:
        조각 = None
    if 조각 is None or 조각.scheme not in ("http", "https") or not 조각.hostname:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"mapUrl": "http나 https로 시작하는 링크만 저장할 수 있어요."})
    host = 조각.hostname.lower()
    for 모양, provider in _PROVIDER_HOSTS:
        if 모양.search(host):
            return 주소, provider
    return 주소, LinkProvider.OTHER


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    정리 = value.strip()
    return 정리 or None


# ---------------------------------------------------------------------------
# 조회
# ---------------------------------------------------------------------------


async def list_for_trip(session: AsyncSession, trip: Trip) -> list[PlaceView]:
    줄들 = (
        await session.execute(
            select(TripPlace, Place)
            .join(Place, Place.id == TripPlace.place_id)
            .where(TripPlace.trip_id == trip.id)
            .order_by(TripPlace.created_at, TripPlace.id)
        )
    ).all()
    ids = [trip_place.id for trip_place, _ in 줄들]
    태그 = await _tags_by_target(session, ids)
    링크 = await _links_by_target(session, ids)
    return [
        PlaceView(trip_place, place, 태그.get(trip_place.id, []), 링크.get(trip_place.id))
        for trip_place, place in 줄들
    ]


async def view_of(session: AsyncSession, trip_place: TripPlace) -> PlaceView:
    place = await session.get(Place, trip_place.place_id)
    태그 = await _tags_by_target(session, [trip_place.id])
    링크 = await _links_by_target(session, [trip_place.id])
    return PlaceView(trip_place, place, 태그.get(trip_place.id, []), 링크.get(trip_place.id))


async def _tags_by_target(session: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    return await tags_by_target(session, TagScope.PLACE, ids)


async def tags_by_target(session: AsyncSession, scope: TagScope, ids: list[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    if not ids:
        return {}
    줄들 = (
        await session.execute(
            select(Tagging.target_id, Tag.name)
            .join(Tag, Tag.id == Tagging.tag_id)
            .where(Tagging.target_type == scope, Tagging.target_id.in_(ids))
        )
    ).all()
    # 태그 연결에는 순서 칸이 없다. 가나다순으로 고정해 돌려준다. 앱은 태그를
    # 순서 없는 묶음으로 비교해야 한다. 순서로 비교하면 저장할 때마다 바뀐 것으로 본다.
    결과: dict[uuid.UUID, list[str]] = {}
    for target_id, name in 줄들:
        결과.setdefault(target_id, []).append(name)
    return {target_id: sorted(names) for target_id, names in 결과.items()}


async def _links_by_target(session: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    줄들 = (
        await session.execute(
            select(ExternalLink.target_id, ExternalLink.url)
            .where(ExternalLink.target_type == LinkTargetType.PLACE, ExternalLink.target_id.in_(ids))
            .order_by(ExternalLink.created_at)
        )
    ).all()
    결과: dict[uuid.UUID, str] = {}
    for target_id, url in 줄들:
        결과.setdefault(target_id, url)
    return 결과


# ---------------------------------------------------------------------------
# 쓰기
# ---------------------------------------------------------------------------


async def create(
    session: AsyncSession,
    *,
    trip: Trip,
    actor: Membership,
    trip_place_id: uuid.UUID | None,
    name: str,
    area: str | None,
    address: str | None,
    category: str | None,
    status: TripPlaceStatus,
    memo: str | None,
    tags: list[str],
    map_url: str | None,
) -> tuple[TripPlace, bool]:
    """
    장소를 담는다. 만들었으면 `(장소, True)`, 같은 id 로 이미 있었으면 `(장소, False)`.

    같은 id 가 **다른 여행**에 있으면 거부한다. 남의 여행 장소 id 를 보내서 그
    장소를 내 여행으로 끌어오거나 존재 여부를 알아내면 안 된다. 어느 여행에
    있는지는 말하지 않는다.
    """
    정리된_태그 = normalize_tags(tags)
    링크 = check_map_url(map_url)

    if trip_place_id is not None:
        기존 = await session.get(TripPlace, trip_place_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False

    place = Place(
        name=name.strip(),
        address=_blank_to_none(address),
        provider=PlaceProvider.MANUAL,
    )
    session.add(place)
    await session.flush()

    trip_place = TripPlace(
        id=trip_place_id or uuid.uuid4(),
        trip_id=trip.id,
        place_id=place.id,
        category=_blank_to_none(category),
        status=status,
        area=_blank_to_none(area),
        memo=_blank_to_none(memo),
        created_by=actor.user_id,
    )
    session.add(trip_place)
    await session.flush()

    await _replace_tags(session, trip=trip, trip_place=trip_place, names=정리된_태그, actor=actor)
    await _replace_link(session, trip_place=trip_place, link=링크, actor=actor)
    return trip_place, True


async def update(
    session: AsyncSession,
    *,
    trip: Trip,
    trip_place: TripPlace,
    actor: Membership,
    version: int,
    changes: dict,
) -> TripPlace:
    """보낸 칸만 바꾸고 버전을 올린다."""
    if version != trip_place.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)

    place = await session.get(Place, trip_place.place_id)
    if "name" in changes:
        if changes["name"] is None or not changes["name"].strip():
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"name": "장소 이름을 적어 주세요."})
        place.name = changes["name"].strip()
    if "address" in changes:
        place.address = _blank_to_none(changes["address"])
    for 칸 in ("area", "category", "memo"):
        if 칸 in changes:
            setattr(trip_place, 칸, _blank_to_none(changes[칸]))
    if "status" in changes:
        if changes["status"] is None:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"status": "상태를 골라 주세요."})
        trip_place.status = changes["status"]
    if "tags" in changes:
        await _replace_tags(
            session, trip=trip, trip_place=trip_place, names=normalize_tags(changes["tags"] or []), actor=actor
        )
    if "map_url" in changes:
        await _replace_link(session, trip_place=trip_place, link=check_map_url(changes["map_url"]), actor=actor)

    trip_place.version += 1
    await session.flush()
    return trip_place


async def remove(session: AsyncSession, trip_place: TripPlace) -> None:
    """
    여행에서 장소를 뺀다.

    일정·교통의 `trip_place_id` 는 외래키가 SET NULL 이라 일정은 남는다. 외래키가
    없는 태그 연결·링크·사진 연결은 손으로 뗀다. 아무 여행도 쓰지 않게 된 손
    장소 실체도 함께 지운다.
    """
    await detach_all(
        session,
        tag_scope=TagScope.PLACE,
        link_target=LinkTargetType.PLACE,
        photo_target=PhotoTargetType.PLACE,
        target_id=trip_place.id,
    )
    place_id = trip_place.place_id
    await session.delete(trip_place)
    await session.flush()
    await session.execute(
        delete(Place).where(
            Place.id == place_id,
            Place.provider == PlaceProvider.MANUAL,
            ~exists().where(TripPlace.place_id == Place.id),
        )
    )


async def purge_orphan_manual_places(session: AsyncSession) -> int:
    """
    어느 여행에도 담기지 않은 손 장소를 지운다. 정기 작업에서 부른다.

    여행이나 공간을 통째로 지우면 `trip_places` 는 따라 지워지지만 장소 실체는
    RESTRICT 라 남는다. 손으로 적은 장소는 그 여행만의 것이라 남길 이유가 없다.
    """
    지운_것 = await session.execute(
        delete(Place).where(
            Place.provider == PlaceProvider.MANUAL,
            ~exists().where(TripPlace.place_id == Place.id),
        )
    )
    await session.flush()
    return 지운_것.rowcount or 0


async def replace_tags(
    session: AsyncSession,
    *,
    space_id: uuid.UUID,
    scope: TagScope,
    target_id: uuid.UUID,
    names: list[str],
    actor: Membership,
) -> None:
    """
    한 대상의 태그를 통째로 바꾼다. 장소·준비물·재료가 같이 쓴다.

    태그는 공간과 scope 안에서 이름으로 하나다. 없는 이름은 만들고 있는 이름은 잇는다.
    """
    await session.execute(delete(Tagging).where(Tagging.target_type == scope, Tagging.target_id == target_id))
    if not names:
        return
    # 동시에 같은 새 태그를 만들어도 유니크 인덱스에 막혀 실패하지 않게 한다.
    await session.execute(
        insert(Tag)
        .values(
            [
                {"id": uuid.uuid4(), "space_id": space_id, "scope": scope, "name": 이름, "created_by": actor.user_id}
                for 이름 in names
            ]
        )
        .on_conflict_do_nothing(index_elements=["space_id", "scope", "name"])
    )
    태그_ids = dict(
        (
            await session.execute(
                select(Tag.name, Tag.id).where(Tag.space_id == space_id, Tag.scope == scope, Tag.name.in_(names))
            )
        ).all()
    )
    session.add_all([Tagging(tag_id=태그_ids[이름], target_type=scope, target_id=target_id) for 이름 in names])
    await session.flush()


async def _replace_tags(
    session: AsyncSession, *, trip: Trip, trip_place: TripPlace, names: list[str], actor: Membership
) -> None:
    await replace_tags(
        session, space_id=trip.space_id, scope=TagScope.PLACE, target_id=trip_place.id, names=names, actor=actor
    )


async def _replace_link(
    session: AsyncSession,
    *,
    trip_place: TripPlace,
    link: tuple[str, LinkProvider] | None,
    actor: Membership,
) -> None:
    await session.execute(
        delete(ExternalLink).where(
            ExternalLink.target_type == LinkTargetType.PLACE, ExternalLink.target_id == trip_place.id
        )
    )
    if link is None:
        return
    url, provider = link
    session.add(
        ExternalLink(
            target_type=LinkTargetType.PLACE,
            target_id=trip_place.id,
            provider=provider,
            url=url,
            created_by=actor.user_id,
        )
    )
    await session.flush()
