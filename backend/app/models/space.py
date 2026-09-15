import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedByMixin, TimestampMixin, uuid_pk
from app.models.enums import MembershipRole, RelationshipType, enum_column

# 공간 하나에 owner 를 포함해 최대 10명
# (docs/development/02-architecture-and-data-model.md 3장).
# 정원은 DB 제약으로 표현할 수 없어서 membership 을 만드는 쪽에서 센다.
# 여러 명이 동시에 들어와도 넘지 않도록 세는 것과 넣는 것을 한 transaction 에
# 둔다. 그 처리는 초대를 붙일 때 services 에서 한다.
MAX_MEMBERS_PER_SPACE = 10


class Space(Base, TimestampMixin, CreatedByMixin):
    """
    함께 쓰는 여행 공간.

    앱이 다루는 공간 한 덩이는 이름, 멤버 목록, 관계, 함께하기 시작한 날이다.
    앞의 셋이 여기와 `memberships` 에 있고, 마지막은 `relationship_profiles`
    에 따로 둔다.
    """

    __tablename__ = "spaces"

    id: Mapped[uuid.UUID] = uuid_pk()

    name: Mapped[str] = mapped_column(String(40), nullable=False)
    relationship_type: Mapped[RelationshipType] = mapped_column(
        enum_column(RelationshipType), nullable=False, default=RelationshipType.OTHER
    )
    # 공간을 지워도 owner 계정은 남으므로 RESTRICT 다. owner 를 먼저 다른
    # 사람에게 넘기거나 공간을 지운 뒤에야 계정을 지울 수 있다.
    owner_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Seoul")

    # 삭제는 즉시 지우지 않고 유예를 둔다. 요청 시각과 실제 삭제 예정 시각을
    # 따로 두는 이유는 사용자가 되돌릴 수 있는 창을 문서가 요구해서다.
    deletion_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deletion_scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Space {self.id}>"


class Membership(Base, TimestampMixin, CreatedByMixin):
    """
    누가 어느 공간에 어떤 권한으로 들어와 있는지.

    나간 사람의 행을 지우지 않고 `left_at` 을 채운다. 그 사람이 맡았던
    준비물이나 낸 지출이 `membership_id` 로 이 행을 가리키고 있어서,
    지우면 지난 여행의 기록이 통째로 무너진다.
    """

    __tablename__ = "memberships"
    __table_args__ = (
        # 같은 공간에 같은 사람이 두 번 활성으로 들어오지 못하게 한다.
        # 나갔다 다시 들어오는 경우가 있으므로 나간 행은 제외해야 해서
        # 일반 UNIQUE 가 아니라 부분 인덱스를 쓴다.
        Index(
            "uq_memberships_active",
            "space_id",
            "user_id",
            unique=True,
            postgresql_where=("left_at IS NULL"),
        ),
        Index("ix_memberships_space_active", "space_id", "left_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()

    space_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    # 계정을 지우려면 membership 을 먼저 정리해야 한다. 남은 기록이 가리키는
    # 대상이라 조용히 사라지면 안 된다.
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    role: Mapped[MembershipRole] = mapped_column(
        enum_column(MembershipRole), nullable=False, default=MembershipRole.EDITOR
    )
    # 공간마다 다르게 부를 수 있다. 비어 있으면 앱이 users.display_name 을 쓴다.
    nickname: Mapped[str | None] = mapped_column(String(20), nullable=True)

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    removed_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Membership {self.id}>"


class RelationshipProfile(Base, TimestampMixin):
    """
    함께하기 시작한 날.

    연인 공간에서 "함께한 지 N일째" 를 세는 데만 쓴다. `spaces` 에 칼럼을
    더하지 않고 따로 둔 이유는 대부분의 공간에 이 값이 없어서다.
    """

    __tablename__ = "relationship_profiles"
    __table_args__ = (UniqueConstraint("space_id", name="uq_relationship_profiles_space"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    space_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<RelationshipProfile {self.id}>"


# 초대 링크 하나로 들어올 수 있는 사람 수와 쓸 수 있는 기간
# (docs/development/03-api-specification.md 3장).
INVITE_MAX_USES = 10
INVITE_DAYS = 7


class SpaceInvite(Base, TimestampMixin):
    """
    공간 초대 링크.

    링크의 token 원문은 만들 때 한 번만 돌려주고 여기에는 hash 만 둔다. DB 가 새어도
    링크를 되살릴 수 없다. 폐기하면 `revoked_at` 을 채우고 행은 남긴다. 누가 언제
    초대했는지가 남아야 들어온 사람을 설명할 수 있다.
    """

    __tablename__ = "space_invites"
    __table_args__ = (
        CheckConstraint("used_count >= 0 AND used_count <= max_uses", name="uses_within_limit"),
        Index("ix_space_invites_space", "space_id", "revoked_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    space_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_by_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_uses: Mapped[int] = mapped_column(Integer, nullable=False, default=INVITE_MAX_USES)
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<SpaceInvite {self.id}>"
