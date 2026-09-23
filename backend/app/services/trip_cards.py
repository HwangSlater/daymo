"""
여행 기념 카드 목록.

카드 그림은 기기가 그린다(docs/development/03-api-specification.md 10장). 서버는 꾸민
값 한 덩어리를 들고 있을 뿐이고, 무엇을 어떻게 그릴지는 앱의 `mobile/src/tripCard.ts`
가 정한다. 여기서는 그 덩어리를 여행에 매달아 두고, 고른 사진이 그 여행의 사진인지만 본다.

앱이 카드를 완료할 때 원본 화질로 그린 완성 이미지를 올리면 그것도 둔다
(`PUT /trip-cards/{id}/image`). 사진 원본은 30일 뒤 지워져 그 뒤로는 기기가 원본
화질로 다시 그릴 수 없어서다. 이미지는 그린 카드 버전(`image_version`)과 함께 둔다.

한 여행에 여러 장이다. 예전에는 `trips.card_settings` 한 칸이라 새로 만들면 앞서
만든 카드가 조용히 덮였다.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import Membership, MembershipRole, Trip, TripCard
from app.services import photo_files
from app.services.trips import check_card_photos

# 한 여행에 모아 둘 수 있는 카드 수.
#
# 카드마다 사진 넷이라 스무 장이면 사진 여든 장이다. 그보다 쌓이면 목록을 넘기는
# 것부터 느려진다. 앱도 같은 수로 막는다(`mobile/src/tripCard.KEEPSAKE_MAX_CARDS`).
MAX_CARDS_PER_TRIP = 20

# 이 앱이 카드의 모르는 값을 버리지 않고 돌려보낸다는 표시(`mobile/src/serverData.ts`).
KEEPS_UNKNOWN_HEADER = "X-Daymo-Card-Keeps-Unknown"

# ── 옛 앱(1.0.0, 빌드 3)이 아는 것 ──────────────────────────────────────────
#
# 이 판은 App Store 심사에 이미 들어가 고칠 수 없다. 카드를 열어 저장할 때 모르는
# 스티커·칸·값을 버리고 보낸다. 그래서 그 앱이 보낸 수정(`KEEPS_UNKNOWN_HEADER` 가
# 없는 요청)에는 지금 저장된 값에서 그 앱이 버렸을 것을 되살려 합친다
# (`merge_old_app_settings`).
#
# 아래 목록은 **그 빌드가 아는 것**을 적은 것이다. 새 스티커·칸이 생겨도 절대 고치지
# 않는다. 여기에 더하면 그 이름을 옛 앱이 아는 것으로 보게 되어, 옛 앱이 버린 것을
# 더는 되살리지 못한다.
OLD_APP_DECOR_KINDS = frozenset(
    {"하트", "별", "비행기", "필름", "말풍선", "체크", "꽃", "구름", "반짝", "글자"}
)
OLD_APP_KEYS = frozenset(
    {
        "style", "ratio", "photoIds", "title", "caption", "parts", "stats", "frameColor",
        "stickers", "decor", "dateStamp", "photoCaptions",
    }
)
OLD_APP_DECOR_KEYS = frozenset({"id", "kind", "text", "x", "y", "size", "angle", "z"})
OLD_APP_STYLES = frozenset({"없음", "필름", "엽서", "스크랩북", "네컷", "네컷 격자", "네컷 가로", "세컷"})
OLD_APP_RATIOS = frozenset({"세로", "정사각", "가로"})
OLD_APP_FRAME_COLORS = frozenset({"검정", "흰색", "크림", "노을", "바다", "숲"})
OLD_APP_PARTS = frozenset({"이름", "기간", "지역", "사람", "문구", "통계"})
OLD_APP_STATS = frozenset({"장소", "사진", "날", "지출"})
# 모르는 값을 만났을 때 옛 앱이 대신 쓰는 값. 이 값이 왔으면 사람이 고른 것인지
# 옛 앱이 바꿔 놓은 것인지 알 수 없어, 저장된 값이 모르는 값이면 그쪽을 남긴다.
OLD_APP_FALLBACKS = {
    "style": (OLD_APP_STYLES, "필름"),
    "ratio": (OLD_APP_RATIOS, "세로"),
    "frameColor": (OLD_APP_FRAME_COLORS, "검정"),
}
OLD_APP_LISTS = {"parts": OLD_APP_PARTS, "stats": OLD_APP_STATS}
DECOR_MAX = 30


def can_manage(membership: Membership, card: TripCard) -> bool:
    """
    이 카드를 고치고 지울 수 있는지.

    만든 사람과 owner 만이다. 사진과 같은 규칙으로 둔다(`services/photos.can_manage`).
    카드는 남이 고른 사진으로 만든 그림이라, editor 라고 해서 남이 만든 카드를
    말없이 바꾸거나 지울 수 있으면 곤란하다. 메모·일기보다 한 칸 좁은 쪽을 골랐다.
    """
    return membership.role == MembershipRole.OWNER or card.created_by_membership_id == membership.id


async def list_cards(session: AsyncSession, trip: Trip) -> list[TripCard]:
    """만든 차례대로. 앱도 같은 차례로 줄을 세운다(`keepsakeListOf`)."""
    return list(
        (
            await session.execute(
                select(TripCard)
                .where(TripCard.trip_id == trip.id)
                .order_by(TripCard.sort_order, TripCard.created_at, TripCard.id)
            )
        )
        .scalars()
        .all()
    )


async def create_card(
    session: AsyncSession,
    *,
    trip: Trip,
    actor: Membership,
    card_id: uuid.UUID | None,
    settings: dict,
) -> tuple[TripCard, bool]:
    """
    카드 한 장을 만든다.

    `card_id` 를 앱이 보내면 같은 요청이 두 번 닿아도 카드가 두 장이 되지 않는다
    (메모·일기와 같은 규칙이다).
    """
    if card_id is not None:
        기존 = await session.get(TripCard, card_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False

    몇_장인가 = (
        await session.execute(
            select(func.count()).select_from(TripCard).where(TripCard.trip_id == trip.id)
        )
    ).scalar_one()
    if 몇_장인가 >= MAX_CARDS_PER_TRIP:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            message=f"카드는 여행마다 {MAX_CARDS_PER_TRIP}장까지 모아 둘 수 있어요.",
            fields={"cards": f"이 여행에는 이미 {MAX_CARDS_PER_TRIP}장이 있어요."},
        )

    await check_card_photos(session, trip, settings.get("photoIds") or [])
    # 뒤에 붙인다. 지운 자리를 다시 쓰지 않으려고 개수가 아니라 마지막 값에서 센다.
    마지막 = (
        await session.execute(
            select(func.max(TripCard.sort_order)).where(TripCard.trip_id == trip.id)
        )
    ).scalar_one()
    card = TripCard(
        id=card_id or uuid.uuid4(),
        trip_id=trip.id,
        created_by_membership_id=actor.id,
        created_by=actor.user_id,
        settings=settings,
        sort_order=(마지막 or 0) + 1,
    )
    session.add(card)
    await session.flush()
    return card, True


def _새로_고른_사진(card: TripCard, settings: dict) -> list[str]:
    """
    이번에 새로 끼운 사진 id 만 고른다.

    앱은 카드를 고칠 때 꾸민 값을 통째로 되돌려 보낸다. 그래서 보낸 것을 전부
    검사하면, 카드에 든 사진 한 장을 지운 날부터 그 카드는 글자 한 줄도 못 고친다
    (늘 422 가 나고 앱에서 빠져나갈 길이 없다). 이미 들어 있던 id 는 그냥 지나가고,
    새로 끼우는 사진만 그 여행의 것인지 본다. 남의 사진을 끼워 넣는 것은 그대로 막힌다.

    죽은 id 는 카드에 남지만 앱이 그리지 못하는 자리로 비워 둔다. 사람이 그 자리를
    새 사진으로 바꾸면 그때 사라진다.
    """
    이미_있던 = {값 for 값 in ((card.settings or {}).get("photoIds") or []) if isinstance(값, str)}
    return [값 for 값 in (settings.get("photoIds") or []) if 값 not in 이미_있던]


def merge_old_app_settings(stored: dict | None, incoming: dict) -> dict:
    """
    옛 앱(1.0.0)이 보낸 꾸민 값에, 그 앱이 몰라서 버렸을 것을 저장된 값에서 되살린다.

    1. 모르는 이름의 스티커 줄(`decor`)은 저장된 그대로 뒤에 다시 붙인다. 옛 앱이 같은
       이름(`id`)을 새로 썼으면 되살린 줄에 새 이름을 준다. 합쳐서 30개를 넘으면 넘는
       만큼은 되살리지 못한다(옛 앱에서 사람이 붙인 것을 먼저 둔다).
    2. 옛 앱이 모르는 칸(`settings` 바로 아래)은 저장된 값을 다시 넣는다.
    3. 옛 앱이 아는 스티커 줄에 붙어 있던 모르는 칸은 같은 이름·같은 종류의 줄에 다시 넣는다.
    4. 틀·비율·틀 색이 옛 앱의 기본값으로 왔는데 저장된 값이 옛 앱이 모르는 값이면
       저장된 값을 남긴다. 목록 칸(parts·stats)에 섞여 있던 모르는 값도 다시 붙인다.

    옛 앱에서 사람이 고친 것(아는 칸의 아는 값)은 그대로 들어간다. 서버는 이 값들을
    풀어 보지 않고 옮기기만 한다.
    """
    if not isinstance(stored, dict):
        return incoming
    결과 = dict(incoming)

    for key, 값 in stored.items():
        if key not in OLD_APP_KEYS and key not in 결과:
            결과[key] = 값

    for key, (아는_값, 기본) in OLD_APP_FALLBACKS.items():
        저장된_값 = stored.get(key)
        if 결과.get(key) == 기본 and isinstance(저장된_값, str) and 저장된_값 not in 아는_값:
            결과[key] = 저장된_값

    for key, 아는_값 in OLD_APP_LISTS.items():
        저장된_목록 = stored.get(key)
        if not isinstance(저장된_목록, list):
            continue
        지금_목록 = list(결과.get(key) or [])
        for 값 in 저장된_목록:
            if isinstance(값, str) and 값 not in 아는_값 and 값 not in 지금_목록:
                지금_목록.append(값)
        결과[key] = 지금_목록

    저장된_줄 = [줄 for 줄 in (stored.get("decor") or []) if isinstance(줄, dict)]
    if 저장된_줄:
        결과["decor"] = _옛_앱_줄에_되살린다(저장된_줄, list(결과.get("decor") or []))
    return 결과


def _옛_앱_줄에_되살린다(저장된_줄: list[dict], 온_줄: list[dict]) -> list[dict]:
    """`merge_old_app_settings` 의 스티커 줄 몫(1·3)."""
    이름으로 = {줄.get("id"): 줄 for 줄 in 저장된_줄 if 줄.get("kind") in OLD_APP_DECOR_KINDS}
    합친_줄 = []
    for 줄 in 온_줄:
        예전 = 이름으로.get(줄.get("id"))
        if 예전 is not None and 예전.get("kind") == 줄.get("kind"):
            줄 = {
                **{k: v for k, v in 예전.items() if k not in OLD_APP_DECOR_KEYS},
                **줄,
            }
        합친_줄.append(줄)

    쓴_이름 = {줄.get("id") for 줄 in 합친_줄}
    for 줄 in 저장된_줄:
        if 줄.get("kind") in OLD_APP_DECOR_KINDS or len(합친_줄) >= DECOR_MAX:
            continue
        if 줄.get("id") in 쓴_이름:
            수 = 1
            while f"d{수}" in 쓴_이름:
                수 += 1
            줄 = {**줄, "id": f"d{수}"}
        쓴_이름.add(줄.get("id"))
        합친_줄.append(줄)
    return 합친_줄


async def update_card(
    session: AsyncSession,
    *,
    trip: Trip,
    card: TripCard,
    actor: Membership,
    version: int,
    settings: dict,
    keeps_unknown: bool = True,
) -> TripCard:
    """
    `keeps_unknown` 이 거짓이면 옛 앱이 보낸 것이라 버렸을 값을 되살려 합친다
    (`merge_old_app_settings`).
    """
    if not can_manage(actor, card):
        raise AppError(ErrorCode.FORBIDDEN)
    if version != card.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    await check_card_photos(session, trip, _새로_고른_사진(card, settings))
    if not keeps_unknown:
        settings = merge_old_app_settings(card.settings, settings)
    card.settings = settings
    card.version += 1
    card.updated_at = datetime.now(UTC)
    await session.flush()
    return card


def check_image_upload(actor: Membership, card: TripCard, version: int) -> None:
    """
    완성 이미지를 받기 전에 본다. 권한은 카드 고치기와 같다.

    `version` 은 앱이 이 그림을 그린 카드 버전이다. 그사이 누가 카드를 고쳤으면 옛 그림이라
    409 로 돌려보낸다. 파일을 다 받기 전에 먼저 봐서 헛되이 받지 않는다.
    """
    if not can_manage(actor, card):
        raise AppError(ErrorCode.FORBIDDEN)
    if version != card.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)


async def set_image(
    session: AsyncSession, *, card: TripCard, version: int, path: str, size: int
) -> str | None:
    """
    저장한 완성 이미지를 카드에 적는다. 지워야 할 옛 파일의 경로를 돌려준다(없으면 None).

    `version` 과 `updated_at` 은 올리지 않는다. 이미지는 카드를 고친 것이 아니라 그 버전의
    그림을 붙인 것이라, 올릴 때마다 버전이 오르면 상대 기기의 수정이 늘 409 로 막힌다.
    """
    옛_경로 = card.image_path
    card.image_path = path
    card.image_version = version
    card.image_bytes = size
    await session.flush()
    return 옛_경로 if 옛_경로 and 옛_경로 != path else None


async def remove_card(session: AsyncSession, *, card: TripCard, actor: Membership) -> None:
    """
    카드는 되살리지 않는다. 그림 자체가 아니라 무엇으로 그릴지 고른 값이라,
    사진이 남아 있으면 같은 카드를 다시 만들 수 있다. 휴지통에 넣지 않는 까닭이다.

    완성 이미지 파일도 함께 지운다. 여행·공간이 통째로 지워질 때는 여행 폴더째
    지워지므로(`photo_files.remove_trips`) 따로 할 일이 없다.
    """
    if not can_manage(actor, card):
        raise AppError(ErrorCode.FORBIDDEN)
    이미지 = card.image_path
    await session.delete(card)
    await session.flush()
    photo_files.remove_card_image(이미지)
