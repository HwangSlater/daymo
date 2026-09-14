import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedByMixin, TimestampMixin, uuid_pk
from app.models.enums import TripStatus, enum_column


class Trip(Base, TimestampMixin, CreatedByMixin):
    """
    여행 하나.

    `cover_photo_id` 는 사진이 지워져도 여행이 남도록 SET NULL 이다. 대표
    사진 한 장이 사라진다고 여행 전체가 사라지면 안 된다.
    """

    __tablename__ = "trips"
    __table_args__ = (
        # 끝나는 날이 시작하는 날보다 앞설 수 없다. 앱에서도 막지만 앱만
        # 막으면 API 를 직접 부르는 쪽에서 뚫린다.
        CheckConstraint("end_date >= start_date", name="dates_in_order"),
        # 환율은 적었다면 양수다. 0이나 음수면 원 환산이 무의미해진다.
        CheckConstraint("exchange_rate IS NULL OR exchange_rate > 0", name="exchange_rate_positive"),
        CheckConstraint("budget IS NULL OR budget >= 0", name="budget_not_negative"),
        # 목록은 공간별로 날짜 역순으로 읽는다.
        Index("ix_trips_space_start_date", "space_id", "start_date"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()

    space_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(60), nullable=False)
    # 지역은 코드와 이름을 함께 둔다. 행정구역 이름이 바뀌어도 예전 여행에
    # 그때의 이름이 그대로 남아야 한다.
    region_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    region_name: Mapped[str | None] = mapped_column(String(40), nullable=True)

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    status: Mapped[TripStatus] = mapped_column(
        enum_column(TripStatus), nullable=False, default=TripStatus.PLANNING
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 요리 탭을 띄울지의 최종 원본이다. 숙소의 has_kitchen 은 사실 정보일
    # 뿐이고 이 값을 자동으로 바꾸지 않는다.
    cooking_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 비용은 이 통화 기준으로 저장하고 원 환산은 보여줄 때만 한다. 환율은
    # 매일 바뀌므로 서버가 외부에서 가져오지 않고 사용자가 여행마다 적는다.
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="KRW")
    exchange_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    # 주고받을 횟수를 줄여 보여줄지. 기본은 켜짐이고 여행마다 저장한다.
    # 송금 기록이 하나라도 있으면 바꿀 수 없는데, 그 검증은 payments 를
    # 세어야 해서 DB 제약이 아니라 서버가 한다.
    simplify_settlement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 함께 고치는 대상이라 문서가 version 을 요구한다. 수정 API 가 이 값을
    # 받고 어긋나면 409 VERSION_CONFLICT 다.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    cover_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("photos.id", ondelete="SET NULL"), nullable=True
    )

    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deletion_scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Trip {self.id}>"


class TripDay(Base, TimestampMixin):
    """
    여행의 하루.

    날짜를 행으로 만들어 두는 이유는 일정이 날짜가 아니라 이 행을 가리키기
    때문이다. 여행 기간을 하루 앞당기면 일정이 통째로 떨어져 나가는 대신
    해당 날의 일정만 어떻게 할지 물을 수 있다.
    """

    __tablename__ = "trip_days"
    __table_args__ = (
        Index("uq_trip_days_date", "trip_id", "date", unique=True),
        Index("uq_trip_days_index", "trip_id", "day_index", unique=True),
        CheckConstraint("day_index >= 1", name="day_index_positive"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # 화면의 "1일차". 날짜에서 계산할 수도 있지만 저장해 두면 정렬과 표시가
    # 날짜 계산 없이 끝난다.
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<TripDay {self.id}>"


class TripParticipant(Base, TimestampMixin, CreatedByMixin):
    """
    이번 여행에 함께 가는 사람.

    참가자는 공간이 아니라 여행에 붙는다. 한 공간에 멤버가 여럿이어도 이번
    여행에는 일부만 가는 일이 흔하다. 준비물 담당, 재료 담당, 교통편
    이용자, 지출의 몫이 모두 이 목록을 후보로 쓴다.

    **이 목록이 비어 있으면 그 공간의 활성 멤버 전원으로 본다.** 가장 흔한
    경우를 비워 두면 사람이 늘거나 줄어도 고칠 것이 없다.

    빼도 그 사람 이름으로 적어 둔 담당과 지출을 서버가 지우지 않는다.
    그래서 행을 지우지 않고 `removed_at` 을 채운다.
    """

    __tablename__ = "trip_participants"
    __table_args__ = (
        # 뺐다 다시 넣는 경우가 있으므로 뺀 행은 제외한다.
        Index(
            "uq_trip_participants_active",
            "trip_id",
            "membership_id",
            unique=True,
            postgresql_where=("removed_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    # membership 이 지워지면 안 되는 것과 같은 이유로 RESTRICT 다. 지난
    # 여행의 담당과 지출이 이 줄을 거쳐 사람을 가리킨다.
    #
    # 이 membership 이 여행과 같은 공간에 속하는지는 외래키로 표현할 수
    # 없다. 넣는 쪽에서 확인한다.
    membership_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<TripParticipant {self.id}>"
