import datetime as dt
import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Integer, String, Time
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedByMixin, TimestampMixin, uuid_pk
from app.models.enums import CalendarNoteKind, enum_column


class CalendarNote(Base, TimestampMixin, CreatedByMixin):
    """
    공간 캘린더에 적은 일정과 메모.

    여행이 아니라 **공간**에 붙는다. 여행 날짜를 잡기 전에 누가 언제 바쁜지
    보려고 적는 것이라, 여행이 생기기 전부터 있고 여행을 지워도 남아야 한다.

    `time` 은 그날의 시:분만 적는다(시간대 없음). 「야근 19:00」 처럼 벽시계
    시각이라, 기기 시간대에 따라 옮겨지면 오히려 틀린다. 없으면 하루 종일이다.

    `membership_id` 와 `created_by_membership_id` 는 SET NULL 이다. 공간을
    정리할 때 멤버 줄이 먼저 지워지는데(`purge_space`), 그때 이 줄이 막으면
    안 된다. 메모와 일기의 작성자와 같은 규칙이다.
    """

    __tablename__ = "calendar_notes"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="dates_in_order"),
        # 메모는 누구의 것도 아니다. 일정은 멤버가 지워지면 비어 있을 수 있다.
        CheckConstraint("kind <> 'memo' OR membership_id IS NULL", name="memo_has_no_member"),
        CheckConstraint("char_length(title) BETWEEN 1 AND 60", name="title_length"),
        Index("ix_calendar_notes_space_start", "space_id", "start_date"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    space_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[CalendarNoteKind] = mapped_column(enum_column(CalendarNoteKind), nullable=False)
    membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(60), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    time: Mapped[dt.time | None] = mapped_column(Time, nullable=True)
    created_by_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<CalendarNote {self.id}>"
