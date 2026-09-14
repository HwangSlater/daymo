import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, uuid_pk
from app.models.enums import UserStatus, enum_column


class User(Base, TimestampMixin):
    """
    계정 하나.

    `created_by` 를 두지 않는다. 자기 자신을 가리키는 빈칸이 될 뿐이다.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()

    # 이메일은 대소문자를 구분하지 않고 하나로 본다. 저장 전에 소문자로
    # 맞추고 여기서는 단순 unique 로 둔다. 대문자로 가입해 두 계정이 생기는
    # 일을 막는 쪽이 DB 함수 인덱스보다 읽기 쉽다.
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # OAuth 로만 가입한 계정은 비밀번호가 없다. Argon2id 결과만 들어가며
    # 원문이나 복호화 가능한 값은 저장하지 않는다.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    avatar_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Seoul")

    status: Mapped[UserStatus] = mapped_column(
        enum_column(UserStatus),
        nullable=False,
        default=UserStatus.ACTIVE,
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        # 이메일을 찍지 않는다. repr 은 로그와 예외 메시지에 그대로 실린다.
        return f"<User {self.id}>"
