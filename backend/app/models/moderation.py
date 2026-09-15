import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk
from app.models.enums import ReportReason, ReportStatus, ReportTargetType, enum_column

# 신고와 차단(docs/development/03-api-specification.md, 08-privacy-and-release-compliance.md 10장).
#
# 공간은 초대로만 들어오지만 그 안에서는 서로의 메모·일기·사진이 보인다. 스토어가
# 사용자 콘텐츠가 있는 앱에 요구하는 것이 신고와 차단이라 첫 출시부터 둔다.

# 신고 설명의 최대 길이. 앱 입력칸도 같은 값을 쓴다.
REPORT_DETAIL_MAX = 1000


class Report(Base):
    """
    신고 한 건.

    **신고한 사람은 신고당한 사람과 공간 멤버에게 드러나지 않는다.** 이 줄을
    읽는 곳은 운영자뿐이다. 운영자에게 가는 알림 메일에도 신고자 이메일과
    신고 설명은 넣지 않는다.

    신고한 사람의 계정이 지워져도 신고는 남아야 검토를 끝낼 수 있어서 SET NULL
    이다. 공간이 지워져도 같다.
    """

    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(f"detail IS NULL OR char_length(detail) <= {REPORT_DETAIL_MAX}", name="detail_length"),
        # 한 사람이 최근에 몇 건을 냈는지 센다.
        Index("ix_reports_reporter_time", "reporter_user_id", "created_at"),
        # 운영자가 아직 안 본 것부터 본다.
        Index("ix_reports_status_time", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    reporter_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    space_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="SET NULL"), nullable=True
    )
    target_type: Mapped[ReportTargetType] = mapped_column(enum_column(ReportTargetType), nullable=False)
    # 대상 표가 여럿이라 FK 를 걸 수 없다. 받을 때 그 공간의 것인지 확인한다.
    target_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    reason: Mapped[ReportReason] = mapped_column(enum_column(ReportReason), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ReportStatus] = mapped_column(
        enum_column(ReportStatus), nullable=False, default=ReportStatus.OPEN
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # 보관 기한(처리 후 1년)을 이 시각부터 센다.
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Report {self.id}>"


class UserBlock(Base):
    """
    한 사람이 다른 사람을 차단했다.

    공간이 아니라 사람 사이의 것이다. 차단하면 둘이 새로 같은 공간에 들어가지
    못한다. 이미 함께 있는 공간은 건드리지 않는다. 공동 기록을 한쪽 마음대로
    지우거나 일부만 가리면 남은 사람들의 여행이 어긋난다.

    `blocked_membership_id` 는 어느 공간에서 차단했는지다. 앱은 다른 사람의
    사용자 id 를 모르므로, 목록과 해제에서 이 값으로 사람을 가리킨다. 공간이
    완전히 지워지면 비는데 그때는 차단 줄 id 로 해제한다.
    """

    __tablename__ = "user_blocks"
    __table_args__ = (
        Index("uq_user_blocks_pair", "blocker_user_id", "blocked_user_id", unique=True),
        # 초대를 받을 때 "나를 차단한 사람" 쪽으로도 찾는다.
        Index("ix_user_blocks_blocked", "blocked_user_id"),
        CheckConstraint("blocker_user_id <> blocked_user_id", name="not_self"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    blocker_user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    blocked_user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    blocked_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<UserBlock {self.id}>"
