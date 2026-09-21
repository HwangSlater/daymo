import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk

# 앱 안에서 보내는 의견(docs/development/02-architecture-and-data-model.md 3장).
#
# 초기라 쓰는 사람의 목소리를 쉽게 받으려고 둔다. 메일을 쓰게 하면 거기서 그만두는
# 사람이 많다. 답장은 하지 않고 운영자가 읽기만 한다(`python -m app.jobs.feedback`).

FEEDBACK_BODY_MAX = 2000
# 불편해요 / 이런 기능이 있으면 / 기타.
FEEDBACK_KINDS = ("problem", "idea", "other")


class Feedback(Base):
    """
    의견 한 건.

    보낸 사람의 계정이 지워지면 누가 보냈는지만 비우고 글은 남긴다(신고와 같다).
    """

    __tablename__ = "feedback"
    __table_args__ = (
        CheckConstraint(f"char_length(body) BETWEEN 1 AND {FEEDBACK_BODY_MAX}", name="body_length"),
        CheckConstraint("kind IN ('problem', 'idea', 'other')", name="kind_known"),
        # 한 사람이 최근에 몇 건을 냈는지 센다.
        Index("ix_feedback_user_time", "user_id", "created_at"),
        # 운영자는 새것부터 읽는다.
        Index("ix_feedback_time", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # ios / android / web 과 앱 버전. 같은 불편이 어느 기기에서만 나는지 가른다.
    platform: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    app_version: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Feedback {self.id}>"
