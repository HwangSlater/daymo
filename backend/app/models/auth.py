import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, uuid_pk
from app.models.enums import (
    DevicePlatform,
    OAuthProvider,
    RevokeReason,
    enum_column,
)

# 토큰은 원문을 저장하지 않는다. 어디에나 hash 만 남긴다.
#
# DB 를 통째로 읽을 수 있게 된 사람이 저장된 값으로 곧장 로그인할 수 있으면
# 안 된다. 비밀번호에 Argon2id 를 쓰는 것과 같은 이유인데, 토큰은 이미 충분히
# 긴 난수라 느린 해시가 필요 없어서 SHA-256 으로 충분하다. 느린 해시를 쓰면
# 요청마다 그 비용을 내야 한다.


class OAuthAccount(Base, TimestampMixin):
    """
    소셜 로그인 연결 하나.

    provider 의 이메일이 기존 계정과 같아도 자동으로 병합하지 않는다. 기존
    비밀번호나 이미 연결된 provider 로 다시 인증한 뒤에 연결한다. 남의
    이메일로 provider 계정을 만들어 남의 공간에 들어오는 것을 막는다
    (docs/development/02-architecture-and-data-model.md 3장).
    """

    __tablename__ = "oauth_accounts"
    __table_args__ = (
        # 같은 provider 의 같은 사람이 두 계정에 붙을 수 없다.
        Index("uq_oauth_accounts_subject", "provider", "provider_subject", unique=True),
        Index("ix_oauth_accounts_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[OAuthProvider] = mapped_column(enum_column(OAuthProvider), nullable=False)
    # provider 가 주는 고유 id. 이메일과 달리 바뀌지 않는다.
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    # 참고용이다. 이 값으로 계정을 찾지 않는다. provider 쪽에서 바뀔 수 있다.
    provider_email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<OAuthAccount {self.id}>"


class Device(Base, TimestampMixin):
    """
    로그인한 기기 하나.

    사용자당 활성 세션은 최대 5개다. 새 기기가 한도를 넘기면
    `last_seen_at` 이 가장 오래된 것을 끊는다. 지금 로그인 중인 기기와 새
    기기는 후보에서 뺀다. 쓰고 있는 기기가 끊기면 무슨 일이 벌어졌는지
    알 수 없다.
    """

    __tablename__ = "devices"
    __table_args__ = (
        Index("uq_devices_installation", "user_id", "installation_id", unique=True),
        Index("ix_devices_user_seen", "user_id", "last_seen_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # 앱이 설치될 때 만드는 값. 기기를 초기화하면 바뀐다.
    installation_id: Mapped[str] = mapped_column(String(64), nullable=False)
    platform: Mapped[DevicePlatform] = mapped_column(
        enum_column(DevicePlatform), nullable=False, default=DevicePlatform.UNKNOWN
    )
    app_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # 기기 이름은 사용자가 보고 어느 기기인지 알아야 해서 둔다. 모델명처럼
    # 기기가 알려 주는 값이고 개인정보를 담지 않는다.
    display_name: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Device {self.id}>"


class RefreshToken(Base, TimestampMixin):
    """
    갱신 토큰 하나.

    refresh 에 성공할 때마다 새 토큰으로 갈아 끼우고 이전 것을 바로 폐기한다.
    **이미 갈아 끼운 토큰이 다시 쓰이면 훔쳐 간 것으로 본다.** 정상적인
    사용자는 교체된 토큰을 들고 있을 이유가 없다. 그때는 그 토큰 하나가
    아니라 `token_family_id` 가 같은 것을 전부 끊는다. 훔친 쪽과 원래 쪽 중
    누가 지금 들고 있는지 알 수 없어서, 둘 다 끊고 다시 로그인하게 하는 것이
    유일하게 안전한 선택이다.

    유효기간은 마지막 정상 사용 시점부터 90일이다. 쓰는 동안은 계속 늘어난다.
    """

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        # 같은 토큰이 두 줄로 들어가면 재사용 탐지가 무너진다.
        Index("uq_refresh_tokens_hash", "token_hash", unique=True),
        # 재사용을 찾으면 이 열쇠로 한 가족을 통째로 끊는다.
        Index("ix_refresh_tokens_family", "token_family_id"),
        Index("ix_refresh_tokens_user_alive", "user_id", "revoked_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=True
    )
    # 한 번의 로그인에서 이어지는 토큰들이 같은 값을 갖는다.
    token_family_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    # SHA-256 hex. 원문은 발급할 때 한 번 보여 주고 저장하지 않는다.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # 이 토큰을 대신한 다음 토큰. 사슬을 따라가면 언제 갈렸는지 보인다.
    replaced_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("refresh_tokens.id", ondelete="SET NULL"), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoke_reason: Mapped[RevokeReason | None] = mapped_column(
        enum_column(RevokeReason), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<RefreshToken {self.id}>"


class _OneTimeToken(Base, TimestampMixin):
    """
    한 번만 쓰는 이메일 링크의 공통 모양.

    이메일 인증과 비밀번호 재설정이 같은 구조라 바탕을 나눠 쓴다. 표를
    합치지 않는 이유는 둘의 보유기간과 폐기 조건이 다르고, 한쪽 표의 실수가
    다른 쪽 로그인에 번지면 안 되기 때문이다.
    """

    __abstract__ = True

    id: Mapped[uuid.UUID] = uuid_pk()
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmailVerificationToken(_OneTimeToken):
    """이메일 소유를 확인하는 1회용 링크."""

    __tablename__ = "email_verification_tokens"
    __table_args__ = (
        Index("uq_email_verification_tokens_hash", "token_hash", unique=True),
        Index("ix_email_verification_tokens_user", "user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<EmailVerificationToken {self.id}>"


class PasswordResetToken(_OneTimeToken):
    """
    비밀번호를 다시 정하는 1회용 링크.

    30분 동안만 쓸 수 있고 한 번 쓰면 끝이다. 재설정에 성공하면 그 계정의
    기존 로그인 세션을 전부 끊는다. 비밀번호를 다시 정하는 상황은 대개
    남이 들어와 있을 수 있다고 의심하는 상황이다.
    """

    __tablename__ = "password_reset_tokens"
    __table_args__ = (
        Index("uq_password_reset_tokens_hash", "token_hash", unique=True),
        Index("ix_password_reset_tokens_user", "user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<PasswordResetToken {self.id}>"
