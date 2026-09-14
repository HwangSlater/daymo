import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, MetaData, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# 제약에 이름을 짓는 규칙. 없으면 PostgreSQL 이 자동으로 붙인 이름이
# migration 에 박혀서, 나중에 그 제약을 지우거나 고칠 때 이름을 손으로 찾아야
# 한다. 특히 CHECK 와 FK 가 그렇다.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """
    모든 테이블의 바탕.

    도메인 모델은 docs/development/02-architecture-and-data-model.md 3장에
    적혀 있다. 문서에 없는 테이블을 여기서 먼저 만들지 않는다.
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def uuid_pk() -> Mapped[uuid.UUID]:
    """
    기본키는 UUID 다. 값은 파이썬에서 만든다.

    DB 기본값(`gen_random_uuid()`)에 맡기지 않는 이유는, 넣기 전에 id 를
    알 수 있어야 한 transaction 안에서 여러 행을 서로 가리키게 만들 수 있기
    때문이다. 공간을 만들면서 owner membership 을 같이 넣는 것이 그 경우다.
    """
    return mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    """
    문서가 모든 주요 테이블에 요구하는 `created_at`, `updated_at`.

    시각은 DB 가 찍는다. 앱 서버 여러 대의 시계가 어긋나도 한 곳에서 나온
    값이라 순서가 흐트러지지 않는다.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class CreatedByMixin:
    """
    문서가 요구하는 `created_by`.

    `users` 자신에게는 붙이지 않는다. 첫 사용자를 만든 사람이 없어서
    자기 자신을 가리키는 빈칸이 될 뿐이다.

    사용자를 지워도 이 값 때문에 삭제가 막히면 안 되므로 SET NULL 로 둔다.
    누가 만들었는지는 잃지만 만들어진 것 자체는 공간에 남아 있어야 한다.
    """

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
