import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk
from app.models.enums import ThrottleScope, enum_column


class ThrottleCounter(Base):
    """
    가입·로그인·재전송을 얼마나 시도했는지.

    Redis 를 두지 않기로 했으므로 PostgreSQL 에 둔다
    (docs/development/01-development-environment.md). 2GB 서버에 상주
    프로세스를 하나 더 올리는 값보다, 이 표에 쓰는 값이 싸다. 닫힌 알파와
    초기 공개 가입 규모에서는 충분하다.

    **`key_hash` 에 이메일이나 IP 원문을 넣지 않는다.** 둘 다 개인정보이고,
    이 표는 실패한 시도까지 남기는 곳이라 원문을 두면 가입하지 않은 사람의
    이메일까지 쌓인다. pepper 를 섞은 해시만 남기므로 이 표만 보고는 누구인지
    알 수 없다.

    오래된 줄은 `purge_expired` 로 지운다. 계속 쌓아 둘 이유가 없다.
    """

    __tablename__ = "throttle_counters"
    __table_args__ = (
        Index("uq_throttle_scope_key", "scope", "key_hash", unique=True),
        # 창을 지난 줄을 쓸어 내는 질의가 기본이다.
        Index("ix_throttle_window", "window_started_at"),
        CheckConstraint("attempts >= 0", name="attempts_not_negative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    scope: Mapped[ThrottleScope] = mapped_column(enum_column(ThrottleScope), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    window_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 이 시각까지는 받지 않는다. 값이 없으면 막혀 있지 않다.
    blocked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<ThrottleCounter {self.scope}>"
