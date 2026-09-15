import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedByMixin, TimestampMixin, uuid_pk
from app.models.enums import (
    BookingStatus,
    ReservationStatus,
    ReservationTargetType,
    ScheduleItemType,
    TransportDirection,
    TransportMethod,
    enum_column,
)

# 시각은 전부 timestamptz 로 저장한다. 화면에 보일 때만 공간의 timezone 으로
# 옮긴다. 앱은 날짜와 시:분을 따로 들고 있지만 그건 입력 방식일 뿐이고,
# 저장까지 쪼개 두면 시차가 있는 여행에서 순서가 뒤집힌다.
#
# `trip_day_id` 와 `trip_place_id` 가 같은 여행에 속하는지는 외래키로
# 표현할 수 없다. 넣는 쪽에서 확인한다. 이 검사가 빠지면 다른 여행의 날에
# 일정이 붙는다.


class ScheduleItem(Base, TimestampMixin, CreatedByMixin):
    """일정표의 한 줄."""

    __tablename__ = "schedule_items"
    __table_args__ = (
        CheckConstraint(
            "end_at IS NULL OR start_at IS NULL OR end_at >= start_at",
            name="times_in_order",
        ),
        Index("ix_schedule_items_day", "trip_day_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    # 날이 정해지지 않은 일정이 있다. 어느 날 갈지 아직 안 정한 것들이다.
    trip_day_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trip_days.id", ondelete="SET NULL"), nullable=True
    )
    # 장소를 여행에서 빼도 일정 줄은 남는다. 제목과 메모는 사용자가 쓴 것이라
    # 장소가 빠졌다고 사라지면 안 된다.
    trip_place_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trip_places.id", ondelete="SET NULL"), nullable=True
    )

    # 시각은 없을 수 있다. 점심 어딘가처럼 시간을 안 정한 줄이 있다.
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    title: Mapped[str] = mapped_column(String(60), nullable=False)
    type: Mapped[ScheduleItemType] = mapped_column(
        enum_column(ScheduleItemType), nullable=False, default=ScheduleItemType.OTHER
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 고칠 때마다 올린다. 어긋나면 409(여행·장소와 같은 규칙).
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<ScheduleItem {self.id}>"


class Stay(Base, TimestampMixin, CreatedByMixin):
    """
    묵는 곳.

    `has_kitchen` 은 참/거짓/모름 셋이라 nullable 이다. 모르는 것과 없는
    것은 다르고, 모르면 요리 탭을 켜자고 제안할 수 없다.

    이 값은 사실 정보일 뿐이고 요리 탭을 띄울지는 `trips.cooking_enabled`
    가 정한다. 숙소를 고칠 때 탭을 켜자고 제안하는 데만 쓴다
    (docs/development/02-architecture-and-data-model.md 3장).
    """

    __tablename__ = "stays"
    __table_args__ = (
        CheckConstraint(
            "check_out_at IS NULL OR check_in_at IS NULL OR check_out_at > check_in_at",
            name="checkout_after_checkin",
        ),
        Index("ix_stays_trip", "trip_id", "check_in_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    trip_place_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trip_places.id", ondelete="SET NULL"), nullable=True
    )

    check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    has_kitchen: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    booking_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 앱의 일정에 띄우기. 일정표 줄을 따로 만들지 않고 이 값으로 보여 준다.
    show_in_schedule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 고칠 때마다 올린다. 어긋나면 409(여행·장소와 같은 규칙).
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Stay {self.id}>"


class Transport(Base, TimestampMixin, CreatedByMixin):
    """
    가는 편과 오는 편.

    `owner_membership_id` 가 비어 있으면 아직 누가 탈지 안 정한 것이다.
    앱의 미정이 이 상태다. 사람이 아닌 값은 참가자 목록 밖에 둔다는 문서
    규칙이 여기 적용된다.
    """

    __tablename__ = "transports"
    __table_args__ = (
        CheckConstraint(
            "arrival_at IS NULL OR departure_at IS NULL OR arrival_at >= departure_at",
            name="arrival_after_departure",
        ),
        Index("ix_transports_trip", "trip_id", "departure_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    # 참가자에서 빼도 교통편은 남아야 한다. 문서가 자동으로 지우지 않는다고
    # 못 박아 둔 부분이라 membership 을 RESTRICT 로 잡는다.
    owner_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=True
    )

    direction: Mapped[TransportDirection] = mapped_column(
        enum_column(TransportDirection), nullable=False
    )
    method: Mapped[TransportMethod] = mapped_column(
        enum_column(TransportMethod), nullable=False, default=TransportMethod.OTHER
    )

    departure_name: Mapped[str | None] = mapped_column(String(40), nullable=True)
    departure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    arrival_name: Mapped[str | None] = mapped_column(String(40), nullable=True)
    arrival_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    booking_status: Mapped[BookingStatus] = mapped_column(
        enum_column(BookingStatus), nullable=False, default=BookingStatus.NOT_BOOKED
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    show_in_schedule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Transport {self.id}>"


class Reservation(Base, TimestampMixin, CreatedByMixin):
    """
    예약 하나.

    `target_id` 에는 외래키가 없다. 장소일 수도 숙소일 수도 있어서다.
    `taggings` 와 같은 문제이고 대응도 같다. 대상을 지울 때 이 줄을 함께
    정리해야 한다.

    `title` 과 `party_size` 는 문서의 칼럼 목록에 없지만 앱 화면이 이미
    보여 주는 값이라 함께 둔다(예약 이름과 인원).
    """

    __tablename__ = "reservations"
    __table_args__ = (
        CheckConstraint("party_size IS NULL OR party_size > 0", name="party_size_positive"),
        Index("ix_reservations_trip", "trip_id", "reserved_at"),
        Index("ix_reservations_target", "target_type", "target_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    target_type: Mapped[ReservationTargetType] = mapped_column(
        enum_column(ReservationTargetType), nullable=False, default=ReservationTargetType.OTHER
    )
    target_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)

    title: Mapped[str] = mapped_column(String(60), nullable=False)
    party_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reserved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[ReservationStatus] = mapped_column(
        enum_column(ReservationStatus), nullable=False, default=ReservationStatus.NEEDS_CHECK
    )
    booking_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    show_in_schedule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Reservation {self.id}>"
