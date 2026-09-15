"""
스토어 심사용 데모 계정을 만들거나 새로 채운다.

    DEMO_PASSWORD=... python -m app.jobs.seed_demo --email review@example.com
    python -m app.jobs.seed_demo --email review@example.com --password-file /run/secrets/demo

App Store·Google Play 심사자가 로그인해서 볼 계정이다(release/shared/demo-account.md).
확인된 이메일 계정 하나, 가짜 멤버 둘, 공간 "주말 여행 메이트" 와 여행 셋(다가오는 여행,
지금 여행 중, 지난 여행)을 넣는다. 날짜는 실행한 날을 기준으로 잡아서 언제 돌려도
"2주 뒤 여행" 이 2주 뒤에 있다.

**다시 돌리면 처음 상태로 되돌린다.** 심사자가 지우거나 고친 내용을 지우고 새로 채운다.
비밀번호도 새로 정한다.

**데모 계정이 아닌 계정은 건드리지 않는다.** 표시 칸을 새로 만들지 않고 이렇게 알아본다.

- 데모 멤버(`DEMO_MEMBERS` 의 example.com 주소)가 들어 있는 공간을 가진 계정이다.
  example.com 은 메일을 받을 수 없는 예약 도메인이라 그 주소로 이메일 확인을 끝낼 수
  없고, 확인하지 않은 계정은 초대를 받을 수 없다(app/services/members.py). 그래서 이
  작업 말고는 그런 공간이 생기지 않는다.
- 그리고 그 계정이 들어가 있는 모든 공간에 계정 자신과 데모 멤버 말고는 아무도 없다
  (나간 사람도 포함). 한 명이라도 다른 사람이 있으면 지우면 안 되는 기록이 있다.

둘 중 하나라도 아니면 아무것도 바꾸지 않고 멈춘다.

비밀번호는 명령행 인자로 받지 않는다. 셸 기록과 `ps` 에 남는다. 환경 변수나 파일로만
받고 어디에도 찍지 않는다. DB 에는 가입과 같은 Argon2id 해시만 들어간다.
"""

import argparse
import asyncio
import colorsys
import hashlib
import logging
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw
from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import passwords
from app.core.db import get_engine, get_session_factory
from app.core.errors import AppError
from app.core.logging import configure_logging
from app.core.runtime import use_selector_event_loop_on_windows
from app.models import (
    BookingStatus,
    ExpenseCategory,
    Membership,
    MembershipRole,
    OAuthAccount,
    Photo,
    PhotoStatus,
    Place,
    PlaceProvider,
    Procurement,
    RelationshipType,
    ReservationStatus,
    RevokeReason,
    ScheduleItemType,
    Space,
    SplitMode,
    ThrottleScope,
    TransportDirection,
    TransportMethod,
    Trip,
    TripPlace,
    TripPlaceStatus,
    TripStatus,
    User,
    UserStatus,
)
from app.services import (
    bookings,
    cooking,
    expenses,
    memories,
    photo_files,
    photos,
    places,
    schedule,
    throttle,
    trips,
)
from app.services.accounts import TERMS_VERSION, normalize_email
from app.services.auth_sessions import revoke_all_for_user
from app.services.space_purge import purge_space

logger = logging.getLogger("daymo.jobs.seed_demo")

ZONE = ZoneInfo("Asia/Seoul")

DEMO_DISPLAY_NAME = "하늘"
DEMO_SPACE_NAME = "주말 여행 메이트"

# 공간을 함께 쓰는 것처럼 보이게 하는 가짜 멤버. 로그인하지 않는다(비밀번호 없음).
# example.com 은 RFC 2606 예약 도메인이라 실제로 메일을 받는 사람이 없다.
DEMO_MEMBERS: tuple[tuple[str, str], ...] = (
    ("demo-yeoul@example.com", "여울"),
    ("demo-garam@example.com", "가람"),
)
DEMO_MEMBER_EMAILS = frozenset(email for email, _ in DEMO_MEMBERS)


class NotADemoAccount(Exception):
    """이 이메일은 데모 계정이 아닌 계정이 쓰고 있다. 아무것도 바꾸지 않았다."""


@dataclass
class SeedResult:
    user_id: uuid.UUID
    space_id: uuid.UUID
    trip_count: int
    photo_count: int
    reset: bool


# ---------------------------------------------------------------------------
# 계정
# ---------------------------------------------------------------------------


async def _existing_members(session: AsyncSession) -> dict[str, User]:
    """
    이미 있는 가짜 멤버 계정.

    누가 이 주소로 가입해 비밀번호나 소셜 로그인을 붙여 두었다면 그 사람의 계정이다.
    가져다 쓰지 않고 멈춘다. 무엇이든 지우기 전에 부른다.
    """
    있는_것: dict[str, User] = {}
    for email, _ in DEMO_MEMBERS:
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            continue
        소셜_연결 = await session.scalar(select(exists().where(OAuthAccount.user_id == user.id)))
        if user.password_hash is not None or 소셜_연결:
            raise NotADemoAccount(f"데모 멤버 주소({email})로 로그인할 수 있는 계정이 이미 있어요.")
        있는_것[email] = user
    return 있는_것


async def _spaces_of(session: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    """이 계정이 들어가 있었던 모든 공간. 나간 공간과 지우는 중인 공간도 넣는다."""
    return list(
        (
            await session.execute(select(Membership.space_id).where(Membership.user_id == user_id).distinct())
        ).scalars()
    )


async def _demo_spaces_or_refuse(session: AsyncSession, user: User, demo_member_ids: set[uuid.UUID]) -> list[uuid.UUID]:
    """
    이미 있는 계정이 데모 계정인지 보고, 맞으면 비울 공간을 돌려준다.

    모듈 설명의 두 조건을 본다. 아니면 NotADemoAccount.
    """
    공간_ids = await _spaces_of(session, user.id)
    데모_멤버가_있는_공간 = False
    for space_id in 공간_ids:
        사람들 = set(
            (
                await session.execute(select(Membership.user_id).where(Membership.space_id == space_id))
            ).scalars()
        )
        if 사람들 - {user.id} - demo_member_ids:
            raise NotADemoAccount("이 이메일은 다른 사람과 함께 쓰는 공간이 있는 계정이에요.")
        owner_id = await session.scalar(select(Space.owner_id).where(Space.id == space_id))
        if owner_id == user.id and 사람들 & demo_member_ids:
            데모_멤버가_있는_공간 = True
    # 다른 사람이 가진 공간이 이 계정을 막는 일은 없지만(owner 는 RESTRICT), 혼자 쓰는
    # 공간만 있는 보통 계정을 데모 계정으로 잘못 읽지 않게 데모 공간이 꼭 있어야 한다.
    if not 데모_멤버가_있는_공간:
        raise NotADemoAccount("이 이메일은 데모 계정이 아닌 계정이 쓰고 있어요.")
    return 공간_ids


async def _purge_demo_spaces(session: AsyncSession, space_ids: list[uuid.UUID]) -> None:
    """
    데모 공간을 통째로 지운다.

    손으로 적은 장소 실체(`places`)는 공간을 지워도 남는다. 정리 작업이 하루 한 번
    지우지만, 이 작업을 여러 번 돌리면 그만큼 쌓이므로 이 공간이 쓰던 것만 바로 지운다.
    """
    for space_id in space_ids:
        장소_ids = list(
            (
                await session.execute(
                    select(TripPlace.place_id)
                    .join(Trip, Trip.id == TripPlace.trip_id)
                    .where(Trip.space_id == space_id)
                    .distinct()
                )
            ).scalars()
        )
        await purge_space(session, space_id)
        if 장소_ids:
            await session.execute(
                delete(Place).where(
                    Place.id.in_(장소_ids),
                    Place.provider == PlaceProvider.MANUAL,
                    ~exists().where(TripPlace.place_id == Place.id),
                )
            )
    await session.flush()


async def _prepare_account(session: AsyncSession, *, email: str, password: str) -> tuple[User, list[User], bool]:
    """`(데모 계정, 가짜 멤버들, 원래 있던 계정인지)`. 비밀번호 검사는 부르는 쪽이 끝냈다."""
    지금 = datetime.now(UTC)
    기존 = await session.scalar(select(User).where(User.email == email))

    # 멈출 거라면 아무것도 쓰기 전에 멈춘다. purge_space 는 사진 파일을 바로 지워서
    # transaction 을 되돌려도 돌아오지 않는다.
    있는_멤버 = await _existing_members(session)
    if 기존 is not None:
        비울_공간 = await _demo_spaces_or_refuse(session, 기존, {user.id for user in 있는_멤버.values()})
        await _purge_demo_spaces(session, 비울_공간)

    멤버들: list[User] = []
    for 멤버_이메일, 이름 in DEMO_MEMBERS:
        멤버 = 있는_멤버.get(멤버_이메일)
        if 멤버 is None:
            멤버 = User(email=멤버_이메일, display_name=이름, password_hash=None)
            session.add(멤버)
        멤버.display_name = 이름
        멤버들.append(멤버)
    await session.flush()

    if 기존 is None:
        user = User(
            email=email,
            password_hash=passwords.hash_password(password),
            display_name=DEMO_DISPLAY_NAME,
            email_verified_at=지금,
            terms_version=TERMS_VERSION,
            terms_agreed_at=지금,
        )
        session.add(user)
        await session.flush()
        return user, 멤버들, False

    user = 기존
    비밀번호가_바뀐다 = not (user.password_hash and passwords.verify(user.password_hash, password))
    user.password_hash = passwords.hash_password(password)
    user.display_name = DEMO_DISPLAY_NAME
    user.email_verified_at = user.email_verified_at or 지금
    user.terms_version = TERMS_VERSION
    user.terms_agreed_at = 지금
    user.status = UserStatus.ACTIVE
    # 심사자가 계정 삭제를 눌러 두었으면 되돌린다. 다음 심사에서도 같은 계정을 쓴다.
    user.deletion_requested_at = None
    user.deletion_scheduled_at = None
    user.deleted_at = None
    await session.flush()
    if 비밀번호가_바뀐다:
        # 예전 비밀번호로 들어와 있던 기기를 끊는다. 비밀번호 재설정과 같다.
        await revoke_all_for_user(session, user.id, reason=RevokeReason.ADMIN)
    return user, 멤버들, True


# ---------------------------------------------------------------------------
# 사진
# ---------------------------------------------------------------------------


def _gradient_jpeg(path: Path, hue: float, *, width: int = 1200, height: int = 900) -> None:
    """
    위에서 아래로 색이 번지는 단색 사진. 사람도 글자도 없다.

    실제 사진을 저장소에 넣지 않으려고 그때그때 만든다. 초상권과 저작권을 따질 것이 없다.
    """
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / (height - 1)
        r, g, b = colorsys.hls_to_rgb((hue + 0.08 * t) % 1.0, 0.78 - 0.30 * t, 0.55)
        draw.line([(0, y), (width, y)], fill=(round(r * 255), round(g * 255), round(b * 255)))
    # 수평선처럼 보이는 옅은 띠 하나.
    띠 = round(height * 0.62)
    draw.rectangle([(0, 띠), (width, 띠 + 6)], fill=(250, 246, 238))
    image.save(path, "JPEG", quality=85)


async def _add_photo(
    session: AsyncSession, *, trip: Trip, actor: Membership, taken_on: date, caption: str, hue: float
) -> Photo:
    """
    앱이 올리는 두 단계(줄 만들기 → 파일 받기)를 서버 안에서 그대로 밟는다.

    파일 저장은 `photo_files.store` 가 한다. 표시본·썸네일을 만들고 경로를 정하는 규칙이
    API 로 올린 사진과 같아야 정리 작업과 여행 삭제가 이 사진도 똑같이 지운다.
    """
    임시 = photo_files.temp_path()
    try:
        _gradient_jpeg(임시, hue)
        내용 = 임시.read_bytes()
        photo, _ = await photos.create_photo(
            session,
            trip=trip,
            actor=actor,
            photo_id=None,
            values={
                "bytes": len(내용),
                "checksum": hashlib.sha256(내용).hexdigest(),
                "caption": caption,
                "date": taken_on,
            },
        )
        저장 = photo_files.store(임시, trip.id, photo.id, ZONE)
    finally:
        photo_files.discard(임시)

    photo.original_path = 저장.original_path
    photo.display_path = 저장.display_path
    photo.thumbnail_path = 저장.thumbnail_path
    photo.original_mime = 저장.mime
    photo.stored_bytes = 저장.stored_bytes
    photo.width = 저장.width
    photo.height = 저장.height
    photo.taken_at = 저장.taken_at
    photo.status = PhotoStatus.READY
    await session.flush()
    return photo


# ---------------------------------------------------------------------------
# 여행 내용
# ---------------------------------------------------------------------------


@dataclass
class People:
    하늘: Membership
    여울: Membership
    가람: Membership

    @property
    def all(self) -> list[Membership]:
        return [self.하늘, self.여울, self.가람]


def _shares(*members: Membership) -> list[dict]:
    return [{"membership_id": member.id, "weight": Decimal(1)} for member in members]


def _clock(day: date, hhmm: str) -> str:
    return f"{day.isoformat()}T{hhmm}"


async def _place(session, trip, actor, name, *, area, category, status=TripPlaceStatus.SCHEDULED, memo=None, tags=(), address=None):
    trip_place, _ = await places.create(
        session,
        trip=trip,
        actor=actor,
        trip_place_id=None,
        name=name,
        area=area,
        address=address,
        category=category,
        status=status,
        memo=memo,
        tags=list(tags),
        map_url=f"https://map.naver.com/p/search/{quote(name)}",
    )
    return trip_place


async def _item(session, trip, actor, day: date, clock: str | None, title: str, kind: ScheduleItemType, *, place=None, note=None):
    await schedule.create_item(
        session,
        trip=trip,
        actor=actor,
        item_id=None,
        values={
            "date": day,
            "time": clock,
            "title": title,
            "type": kind,
            "note": note,
            "trip_place_id": place.id if place else None,
        },
    )


async def _expense(session, trip, actor, day: date, title, amount: int, category, payer: Membership, shares, memo=None):
    await expenses.create_expense(
        session,
        trip=trip,
        actor=actor,
        expense_id=None,
        values={
            "date": day,
            "title": title,
            "amount": Decimal(amount),
            "category": category,
            "payer_membership_id": payer.id,
            "split_mode": SplitMode.EVEN if len(shares) > 1 else SplitMode.SUBSET,
            "memo": memo,
            "shares": shares,
        },
    )


async def _packing(session, trip, actor, name, *, owner: Membership | None = None, shared=False, done=False, quantity=None, tags=()):
    await cooking.create_item(
        session,
        trip=trip,
        actor=actor,
        item_id=None,
        values={
            "name": name,
            "quantity": quantity,
            "owner_membership_id": owner.id if owner else None,
            "is_shared": shared,
            "completed": done,
            "tags": list(tags),
        },
    )


async def _new_trip(session, space: Space, people: People, *, title, region, start: date, days: int, status: TripStatus, summary, cooking_enabled=False) -> Trip:
    trip = await trips.create_trip(
        session,
        space_id=space.id,
        actor=people.하늘,
        title=title,
        start_date=start,
        end_date=start + timedelta(days=days - 1),
        region_name=region,
        summary=summary,
        cooking_enabled=cooking_enabled,
        participant_membership_ids=[member.id for member in people.all],
    )
    # 서버는 날짜로 상태를 옮기지 않는다(TripStatus). 앱에서 사람이 고르는 값을 날짜에 맞춰 둔다.
    trip.status = status
    await session.flush()
    return trip


async def _upcoming_trip(session, space, p: People, today: date) -> Trip:
    """2주 뒤의 1박 2일. 계획 중이라 예약·준비물이 중심이다."""
    d1 = today + timedelta(days=14)
    d2 = d1 + timedelta(days=1)
    trip = await _new_trip(
        session, space, p, title="전주 한옥마을", region="전북", start=d1, days=2,
        status=TripStatus.PLANNING, summary="숙소에서 수다와 버섯전골",
    )
    한옥마을 = await _place(session, trip, p.하늘, "전주 한옥마을", area="전주 완산구", category="구경", tags=["산책"])
    경기전 = await _place(session, trip, p.여울, "경기전", area="전주 완산구", category="구경", memo="입장 마감 시간 확인하기")
    await _place(session, trip, p.가람, "남부시장 야시장", area="전주 완산구", category="식당", status=TripPlaceStatus.SAVED, memo="금·토 저녁에만 열어요", tags=["야식"])
    카페 = await _place(session, trip, p.여울, "한옥 골목 찻집", area="전주 완산구", category="카페", status=TripPlaceStatus.SAVED, tags=["디저트"])
    숙소 = await _place(session, trip, p.하늘, "달빛한옥", area="전주 완산구", category="숙소", memo="예약금 입금 완료")

    await _item(session, trip, p.하늘, d1, "11:30", "전주역 도착, 택시로 이동", ScheduleItemType.MOVE)
    await _item(session, trip, p.하늘, d1, "12:30", "한옥마을 골목 산책", ScheduleItemType.PLACE, place=한옥마을)
    await _item(session, trip, p.여울, d1, "14:00", "경기전 둘러보기", ScheduleItemType.PLACE, place=경기전)
    await _item(session, trip, p.여울, d1, "16:00", "찻집에서 쉬기", ScheduleItemType.MEAL, place=카페)
    await _item(session, trip, p.가람, d1, "19:00", "숙소에서 버섯전골", ScheduleItemType.MEAL, place=숙소, note="장은 가람이 봐 오기로")
    await _item(session, trip, p.하늘, d2, None, "늦잠 자고 체크아웃", ScheduleItemType.REST)
    await schedule.create_stay(
        session, trip=trip, actor=p.하늘, stay_id=None,
        values={"trip_place_id": 숙소.id, "check_in_at": _clock(d1, "15:00"), "check_out_at": _clock(d2, "11:00"), "note": "마당 있는 방"},
    )

    await bookings.create_transport(
        session, trip=trip, actor=p.하늘, transport_id=None,
        values={
            "direction": TransportDirection.OUTBOUND, "method": TransportMethod.KTX, "date": d1,
            "departure_name": "용산", "departure_time": "09:18", "arrival_name": "전주", "arrival_time": "11:05",
            "booking_status": BookingStatus.BOOKED, "note": "3명 나란히", "show_in_schedule": True,
        },
    )
    await bookings.create_transport(
        session, trip=trip, actor=p.하늘, transport_id=None,
        values={
            "direction": TransportDirection.RETURN, "method": TransportMethod.KTX, "date": d2,
            "departure_name": "전주", "departure_time": "17:40", "arrival_name": "용산",
            "booking_status": BookingStatus.NOT_BOOKED, "note": "출발 2주 전에 열리면 예매",
        },
    )
    await bookings.create_reservation(
        session, trip=trip, actor=p.여울, reservation_id=None,
        values={
            "title": "한정식 점심", "date": d2, "time": "12:00", "party_size": 3,
            "status": ReservationStatus.NEEDS_CHECK, "note": "전날 전화로 확인",
        },
    )

    await _packing(session, trip, p.하늘, "보조배터리", owner=p.하늘, tags=["전자기기"])
    await _packing(session, trip, p.여울, "상비약", owner=p.여울, done=True)
    await _packing(session, trip, p.가람, "보드게임", owner=p.가람, quantity="2개")
    await _packing(session, trip, p.하늘, "우산", shared=True, quantity="3개")

    await _expense(session, trip, p.하늘, d1, "KTX 왕복 예매", 141600, ExpenseCategory.TRANSPORT, p.하늘, _shares(*p.all))
    await _expense(session, trip, p.하늘, d1, "달빛한옥 예약금", 90000, ExpenseCategory.LODGING, p.하늘, _shares(*p.all))
    await expenses.update_settings(session, trip=trip, version=trip.version, changes={"budget": Decimal(450000)})

    await memories.create_memo(session, trip=trip, actor=p.여울, memo_id=None, body="한복 대여는 현장에서 해도 된대요. 두 시간이면 충분!")
    await memories.create_memo(session, trip=trip, actor=p.가람, memo_id=None, body="버섯전골 재료는 제가 챙길게요.")
    return trip


async def _ongoing_trip(session, space, p: People, today: date) -> tuple[Trip, int]:
    """어제 떠나 내일 돌아오는 2박 3일. 숙소에서 요리하고 지출이 쌓이는 중이다."""
    d1 = today - timedelta(days=1)
    d2, d3 = today, today + timedelta(days=1)
    trip = await _new_trip(
        session, space, p, title="강릉 안목", region="강원", start=d1, days=3,
        status=TripStatus.ONGOING, summary="보드게임과 야식 장보기", cooking_enabled=True,
    )
    커피거리 = await _place(session, trip, p.하늘, "안목해변 커피거리", area="강릉", category="카페", tags=["바다", "커피"])
    경포호 = await _place(session, trip, p.여울, "경포호", area="강릉", category="구경", tags=["산책"])
    중앙시장 = await _place(session, trip, p.가람, "강릉 중앙시장", area="강릉", category="쇼핑", memo="닭강정 줄이 길어요")
    숙소 = await _place(session, trip, p.여울, "바다뷰 숙소", area="강릉", category="숙소", memo="주방 있음")
    await _place(session, trip, p.가람, "주문진 수산시장", area="강릉", category="쇼핑", status=TripPlaceStatus.SAVED)

    await _item(session, trip, p.여울, d1, "10:00", "강릉 시외버스터미널 도착", ScheduleItemType.MOVE)
    await _item(session, trip, p.하늘, d1, "13:00", "커피거리에서 바다 보며 커피", ScheduleItemType.MEAL, place=커피거리)
    await _item(session, trip, p.여울, d1, "19:00", "숙소에서 삼겹살 구이", ScheduleItemType.MEAL, place=숙소)
    await _item(session, trip, p.하늘, d2, "10:30", "경포호 한 바퀴", ScheduleItemType.PLACE, place=경포호)
    await _item(session, trip, p.가람, d2, "15:00", "중앙시장 장보기", ScheduleItemType.PLACE, place=중앙시장)
    await _item(session, trip, p.하늘, d2, "21:00", "보드게임", ScheduleItemType.REST)
    await _item(session, trip, p.여울, d3, "14:00", "버스 타고 집으로", ScheduleItemType.MOVE)
    await schedule.create_stay(
        session, trip=trip, actor=p.여울, stay_id=None,
        values={"trip_place_id": 숙소.id, "check_in_at": _clock(d1, "15:00"), "check_out_at": _clock(d3, "11:00")},
    )
    await bookings.create_transport(
        session, trip=trip, actor=p.여울, transport_id=None,
        values={
            "direction": TransportDirection.OUTBOUND, "method": TransportMethod.BUS, "date": d1,
            "departure_name": "동서울", "departure_time": "07:30", "arrival_name": "강릉", "arrival_time": "10:00",
            "booking_status": BookingStatus.BOOKED, "owner_membership_id": p.여울.id,
        },
    )
    await bookings.create_transport(
        session, trip=trip, actor=p.여울, transport_id=None,
        values={
            "direction": TransportDirection.RETURN, "method": TransportMethod.BUS, "date": d3,
            "departure_name": "강릉", "departure_time": "14:00", "arrival_name": "동서울", "arrival_time": "16:40",
            "booking_status": BookingStatus.BOOKED,
        },
    )

    await cooking.create_recipe(
        session, trip=trip, actor=p.여울, recipe_id=None,
        values={
            "name": "삼겹살 구이",
            "memo": "첫날 저녁. 불판은 숙소에 있어요.",
            "ingredients": [
                {"name": "삼겹살", "quantity": "900g", "category": "고기", "procurement": Procurement.BUY, "ready": True},
                {"name": "쌈채소", "quantity": "1봉", "category": "채소", "procurement": Procurement.BUY, "ready": True},
                {"name": "쌈장", "quantity": "1통", "category": "양념", "procurement": Procurement.BRING, "owner_membership_id": p.가람.id, "ready": True},
            ],
        },
    )
    await cooking.create_recipe(
        session, trip=trip, actor=p.가람, recipe_id=None,
        values={
            "name": "해물 라면",
            "memo": "둘째 날 야식",
            "ingredients": [
                {"name": "라면", "quantity": "3개", "procurement": Procurement.BRING, "owner_membership_id": p.하늘.id},
                {"name": "오징어", "quantity": "1마리", "category": "해산물", "procurement": Procurement.BUY},
                {"name": "대파", "quantity": "1대", "category": "채소", "procurement": Procurement.UNDECIDED},
            ],
        },
    )
    await _packing(session, trip, p.하늘, "보드게임", owner=p.하늘, done=True)
    await _packing(session, trip, p.여울, "선크림", shared=True, done=True)
    await _packing(session, trip, p.가람, "돗자리", owner=p.가람, done=True)

    await _expense(session, trip, p.여울, d1, "시외버스 왕복", 84000, ExpenseCategory.TRANSPORT, p.여울, _shares(*p.all))
    await _expense(session, trip, p.하늘, d1, "안목 카페 거리", 39000, ExpenseCategory.MEAL, p.하늘, _shares(*p.all))
    await _expense(session, trip, p.여울, d1, "바다뷰 숙소 2박", 240000, ExpenseCategory.LODGING, p.여울, _shares(*p.all))
    await _expense(session, trip, p.가람, d1, "삼겹살 장보기", 46800, ExpenseCategory.MEAL, p.가람, _shares(*p.all))
    await _expense(session, trip, p.하늘, d2, "중앙시장 닭강정", 22000, ExpenseCategory.MEAL, p.하늘, _shares(p.하늘, p.가람), memo="여울은 안 먹었어요")
    await expenses.create_payment(
        session, trip=trip, actor=p.가람, payment_id=None,
        values={"from_membership_id": p.가람.id, "to_membership_id": p.여울.id, "amount": Decimal(50000)},
    )

    await memories.create_memo(session, trip=trip, actor=p.하늘, memo_id=None, body="내일 체크아웃 11시! 짐은 전날 밤에 싸 두기")
    await memories.create_diary(
        session, trip=trip, actor=p.여울, diary_id=None,
        values={"title": "바다 앞 첫날", "body": "버스에서 내리자마자 바다 냄새가 났다. 커피거리 창가 자리에서 한참 파도만 봤다.", "written_on": d1},
    )

    사진 = [
        await _add_photo(session, trip=trip, actor=p.하늘, taken_on=d1, caption="안목해변 오후", hue=0.55),
        await _add_photo(session, trip=trip, actor=p.여울, taken_on=d2, caption="경포호 산책길", hue=0.33),
    ]
    trip.cover_photo_id = 사진[0].id
    await session.flush()
    return trip, len(사진)


async def _past_trip(session, space, p: People, today: date) -> tuple[Trip, int]:
    """한 달 반 전에 다녀온 여행. 정산이 끝났고 일기와 사진이 남아 있다."""
    d1 = today - timedelta(days=45)
    d2, d3 = d1 + timedelta(days=1), d1 + timedelta(days=2)
    trip = await _new_trip(
        session, space, p, title="여수 밤바다", region="전남", start=d1, days=3,
        status=TripStatus.COMPLETED, summary="바다 산책과 단체 사진",
    )
    해상케이블카 = await _place(session, trip, p.여울, "여수 해상케이블카", area="여수", category="구경", status=TripPlaceStatus.VISITED)
    낭만포차 = await _place(session, trip, p.가람, "낭만포차 거리", area="여수", category="식당", status=TripPlaceStatus.VISITED, tags=["야경"])
    오동도 = await _place(session, trip, p.하늘, "오동도", area="여수", category="구경", status=TripPlaceStatus.VISITED, tags=["산책"])
    숙소 = await _place(session, trip, p.하늘, "바닷가 게스트하우스", area="여수", category="숙소", status=TripPlaceStatus.VISITED)

    await _item(session, trip, p.하늘, d1, "12:10", "여수엑스포역 도착", ScheduleItemType.MOVE)
    await _item(session, trip, p.하늘, d1, "15:00", "오동도 동백길", ScheduleItemType.PLACE, place=오동도)
    await _item(session, trip, p.가람, d1, "20:00", "낭만포차에서 저녁", ScheduleItemType.MEAL, place=낭만포차)
    await _item(session, trip, p.여울, d2, "11:00", "해상케이블카", ScheduleItemType.PLACE, place=해상케이블카)
    await _item(session, trip, p.하늘, d3, "13:00", "기념품 사고 기차역으로", ScheduleItemType.MOVE)
    await schedule.create_stay(
        session, trip=trip, actor=p.하늘, stay_id=None,
        values={"trip_place_id": 숙소.id, "check_in_at": _clock(d1, "16:00"), "check_out_at": _clock(d3, "11:00")},
    )
    await bookings.create_transport(
        session, trip=trip, actor=p.하늘, transport_id=None,
        values={
            "direction": TransportDirection.OUTBOUND, "method": TransportMethod.KTX, "date": d1,
            "departure_name": "용산", "departure_time": "09:05", "arrival_name": "여수엑스포", "arrival_time": "12:10",
            "booking_status": BookingStatus.BOOKED,
        },
    )
    await bookings.create_reservation(
        session, trip=trip, actor=p.여울, reservation_id=None,
        values={"title": "해상케이블카 크리스탈캐빈", "date": d2, "time": "11:00", "party_size": 3, "status": ReservationStatus.CONFIRMED},
    )

    await _expense(session, trip, p.하늘, d1, "KTX 왕복", 144000, ExpenseCategory.TRANSPORT, p.하늘, _shares(*p.all))
    await _expense(session, trip, p.여울, d1, "회 정식 저녁", 87000, ExpenseCategory.MEAL, p.여울, _shares(*p.all))
    await _expense(session, trip, p.하늘, d1, "게스트하우스 2박", 135000, ExpenseCategory.LODGING, p.하늘, _shares(*p.all))
    await _expense(session, trip, p.여울, d2, "해상 케이블카", 45000, ExpenseCategory.ADMISSION, p.여울, _shares(*p.all))
    await _expense(session, trip, p.가람, d3, "기념품 수제 엽서", 15000, ExpenseCategory.SHOPPING, p.가람, _shares(p.가람))
    # 셋이 나눌 것이 411,000 이라 한 사람 몫은 137,000. 하늘이 279,000, 여울이 132,000 을
    # 냈으므로 가람과 여울이 하늘에게 보내 정산을 끝냈다(엽서는 가람 혼자 몫).
    await expenses.create_payment(
        session, trip=trip, actor=p.가람, payment_id=None,
        values={"from_membership_id": p.가람.id, "to_membership_id": p.하늘.id, "amount": Decimal(137000), "paid_at": datetime.combine(d3, time(18, 0), ZONE)},
    )
    await expenses.create_payment(
        session, trip=trip, actor=p.여울, payment_id=None,
        values={"from_membership_id": p.여울.id, "to_membership_id": p.하늘.id, "amount": Decimal(5000), "paid_at": datetime.combine(d3, time(18, 0), ZONE)},
    )

    await memories.create_diary(
        session, trip=trip, actor=p.하늘, diary_id=None,
        values={"title": "여수 밤바다", "body": "포차 거리 불빛이 바다에 비쳐서 노래 제목이 왜 그런지 알 것 같았다. 다음엔 겨울에 동백 보러 다시 오기로.", "written_on": d1},
    )
    await memories.create_diary(
        session, trip=trip, actor=p.가람, diary_id=None,
        values={"body": "케이블카 바닥이 투명해서 처음엔 무서웠는데 내려올 땐 한 번 더 타고 싶었다.", "written_on": d2},
    )
    await memories.create_memo(session, trip=trip, actor=p.여울, memo_id=None, body="단체 사진 원본은 앨범에 올려 뒀어요.")

    사진 = [
        await _add_photo(session, trip=trip, actor=p.하늘, taken_on=d1, caption="오동도 가는 길", hue=0.45),
        await _add_photo(session, trip=trip, actor=p.가람, taken_on=d1, caption="낭만포차 거리의 밤", hue=0.68),
        await _add_photo(session, trip=trip, actor=p.여울, taken_on=d2, caption="케이블카에서 본 바다", hue=0.52),
    ]
    trip.cover_photo_id = 사진[2].id
    await session.flush()
    return trip, len(사진)


# ---------------------------------------------------------------------------
# 전체
# ---------------------------------------------------------------------------


async def seed(session: AsyncSession, *, email: str, password: str, today: date | None = None) -> SeedResult:
    """
    데모 계정과 내용을 채운다. commit 하지 않는다. 부르는 쪽이 한 transaction 으로 끝낸다.

    중간에 실패하면 전부 되돌아가야 한다. 계정만 있고 공간이 없으면 다음 실행이 그 계정을
    데모 계정으로 알아보지 못한다.
    """
    email = normalize_email(email)
    if email in DEMO_MEMBER_EMAILS:
        raise NotADemoAccount("데모 멤버 주소는 로그인 계정으로 쓸 수 없어요.")
    검사된_비밀번호 = passwords.validate(password, email=email)
    today = today or datetime.now(ZONE).date()

    user, (여울_계정, 가람_계정), 다시_채움 = await _prepare_account(session, email=email, password=검사된_비밀번호)

    space = Space(
        name=DEMO_SPACE_NAME,
        relationship_type=RelationshipType.FRIENDS,
        owner_id=user.id,
        timezone=ZONE.key,
        created_by=user.id,
    )
    session.add(space)
    await session.flush()
    하늘 = Membership(space_id=space.id, user_id=user.id, role=MembershipRole.OWNER, created_by=user.id)
    여울 = Membership(space_id=space.id, user_id=여울_계정.id, role=MembershipRole.EDITOR, created_by=user.id)
    가람 = Membership(space_id=space.id, user_id=가람_계정.id, role=MembershipRole.EDITOR, created_by=user.id)
    session.add_all([하늘, 여울, 가람])
    await session.flush()
    people = People(하늘, 여울, 가람)

    만든_여행: list[uuid.UUID] = []
    사진_수 = 0
    try:
        # 목록에서 위에 오도록 지난 여행부터 만든다. 앱은 날짜로 다시 정렬한다.
        지난, 수 = await _past_trip(session, space, people, today)
        만든_여행.append(지난.id)
        사진_수 += 수
        지금, 수 = await _ongoing_trip(session, space, people, today)
        만든_여행.append(지금.id)
        사진_수 += 수
        다가올 = await _upcoming_trip(session, space, people, today)
        만든_여행.append(다가올.id)
    except BaseException:
        # 사진 파일은 transaction 이 되돌려 주지 않는다. 이번에 만든 여행 폴더를 지운다.
        photo_files.remove_trips(만든_여행)
        raise

    return SeedResult(
        user_id=user.id, space_id=space.id, trip_count=len(만든_여행), photo_count=사진_수, reset=다시_채움
    )


def read_password(password_file: str | None) -> str:
    """파일이 있으면 파일에서, 없으면 DEMO_PASSWORD 에서. 파일 끝의 줄바꿈 하나는 뗀다."""
    if password_file:
        값 = Path(password_file).read_text(encoding="utf-8")
        return 값[:-1] if 값.endswith("\n") else 값
    return os.environ.get("DEMO_PASSWORD", "")


async def run(email: str, password: str) -> int:
    try:
        async with get_session_factory()() as session:
            try:
                결과 = await seed(session, email=email, password=password)
                await session.commit()
            except BaseException:
                await session.rollback()
                raise
        # 심사자가 비밀번호를 여러 번 틀려 막혀 있었으면 풀어 준다. 자기 연결로 commit 한다.
        await throttle.reset(ThrottleScope.LOGIN, throttle.key_for("email", normalize_email(email)))
    except NotADemoAccount as 이유:
        logger.error("데모 계정을 만들지 않았다: %s", 이유)
        return 1
    except AppError as 오류:
        # 비밀번호 규칙 위반. 문구에 비밀번호 값은 들어 있지 않다.
        logger.error("데모 계정을 만들지 않았다: %s %s", 오류.detail, 오류.fields or "")
        return 1
    finally:
        await get_engine().dispose()

    logger.info(
        "데모 계정 %s: 공간 1개, 여행 %d개, 사진 %d장",
        "다시 채움" if 결과.reset else "새로 만듦",
        결과.trip_count,
        결과.photo_count,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.jobs.seed_demo", description="스토어 심사용 데모 계정")
    parser.add_argument("--email", required=True, help="심사자에게 건넬 로그인 이메일")
    parser.add_argument("--password-file", help="비밀번호 한 줄이 든 파일. 없으면 DEMO_PASSWORD 환경 변수")
    args = parser.parse_args(argv)

    configure_logging()
    password = read_password(args.password_file)
    if not password:
        logger.error("비밀번호가 없다. DEMO_PASSWORD 나 --password-file 로 넘겨라.")
        return 2
    use_selector_event_loop_on_windows()
    return asyncio.run(run(args.email, password))


if __name__ == "__main__":
    sys.exit(main())
