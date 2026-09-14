import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, uuid_pk
from app.models.enums import SensitiveAction, enum_column


class ReauthProof(Base, TimestampMixin):
    """
    민감한 작업 하나를 위한 1회용 재인증 증표.

    계정 삭제, 이메일·비밀번호 변경, 로그인 방식 연결·해제는 access token
    만으로 할 수 없다. 남이 잠깐 열린 화면을 잡아도 계정을 통째로 가져갈 수
    없게 하려는 것이다.

    **작업 종류와 사용자와 nonce 에 함께 묶는다.** 직전에 다른 민감 작업을
    인증했더라도 새 작업에는 새 증표가 필요하다. 하나를 받아 두고 여러 곳에
    돌려 쓰면 재인증을 요구한 의미가 없다
    (docs/development/03-api-specification.md 2장).

    토큰 원문은 저장하지 않는다. 다른 1회용 토큰과 같다.
    """

    __tablename__ = "reauth_proofs"
    __table_args__ = (
        Index("uq_reauth_proofs_hash", "token_hash", unique=True),
        Index("ix_reauth_proofs_user", "user_id", "action"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[SensitiveAction] = mapped_column(
        enum_column(SensitiveAction), nullable=False
    )
    # 같은 작업을 두 번 요청해도 서로 다른 증표가 되게 한다.
    nonce: Mapped[str] = mapped_column(String(64), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<ReauthProof {self.id}>"
