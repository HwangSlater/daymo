import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedByMixin, TimestampMixin, uuid_pk
from app.models.enums import PhotoStatus, PhotoTargetType, enum_column

# 작성자는 RESTRICT 가 아니라 SET NULL 이다. 비용·준비물 쪽과 일부러 다르다.
#
# 계정을 최종 삭제하면 공동 기록은 남기되 작성자 연결을 끊고 화면에는
# `삭제된 계정` 로 보여 준다는 것이 문서의 규칙이다. 정산은 누가 냈는지를
# 잃으면 계산 자체가 무너지지만, 메모와 일기와 사진은 누가 썼는지를 잃어도
# 글은 그대로 읽힌다. 그래서 두 규칙이 다르다.


class Memo(Base, TimestampMixin, CreatedByMixin):
    """
    여행에 붙이는 쪽지.

    지울 때 행을 지우지 않고 `deleted_at` 과 `deleted_by` 를 채운다. 함께
    쓰는 공간이라 누가 언제 지웠는지가 남아야 말이 갈리지 않는다.
    """

    __tablename__ = "memos"
    __table_args__ = (
        CheckConstraint(
            "deleted_at IS NOT NULL OR deleted_by IS NULL", name="deleted_by_needs_time"
        ),
        Index("ix_memos_trip_alive", "trip_id", "deleted_at"),
        # 지운 지 7일 지난 것을 매일 찾는 파기 작업용. 위의 인덱스는 `trip_id` 가
        # 앞이라 여행을 가리지 않는 이 질의를 받지 못한다.
        Index("ix_memos_deleted_at", "deleted_at", postgresql_where="deleted_at IS NOT NULL"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    author_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # 고친 적이 있는지. 값이 있으면 화면에 `수정됨` 을 붙인다.
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Memo {self.id}>"


class Diary(Base, TimestampMixin, CreatedByMixin):
    """
    여행 일기.

    `written_on` 은 쓴 날이 아니라 **그 일기가 다루는 날**이다. 여행이 끝나고
    한참 뒤에 쓴 일기도 그날 자리에 놓여야 한다.
    """

    __tablename__ = "diaries"
    __table_args__ = (Index("ix_diaries_trip_day", "trip_id", "written_on"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    author_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String(60), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    written_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Diary {self.id}>"


class Photo(Base, TimestampMixin):
    """
    올린 사진 한 장.

    파일은 DB 가 아니라 `/srv/daymo/uploads` 아래에 두고 여기에는 경로만
    남는다. 원본·표시본·썸네일 셋을 따로 두는 이유는 목록에서 원본을
    내려받으면 전송량이 감당되지 않기 때문이다
    (docs/development/06-vps-deployment.md 6장).

    `checksum` 은 같은 파일을 두 번 올렸는지 보는 데 쓴다. unique 로 막지
    않는 이유는 서로 다른 여행에 같은 사진을 올리는 것이 잘못이 아니어서다.
    """

    __tablename__ = "photos"
    __table_args__ = (
        CheckConstraint("width IS NULL OR width > 0", name="width_positive"),
        CheckConstraint("height IS NULL OR height > 0", name="height_positive"),
        CheckConstraint(
            "original_bytes IS NULL OR original_bytes > 0", name="bytes_positive"
        ),
        CheckConstraint(
            "deleted_at IS NOT NULL OR deleted_by IS NULL", name="deleted_by_needs_time"
        ),
        Index("ix_photos_trip_status", "trip_id", "status"),
        Index("ix_photos_checksum", "checksum"),
        # 메모와 같은 이유. 파기 작업이 여행을 가리지 않고 지워진 줄만 찾는다.
        Index("ix_photos_deleted_at", "deleted_at", postgresql_where="deleted_at IS NOT NULL"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    uploader_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )

    # 아직 올라오는 중이면 경로가 없다.
    original_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    display_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    thumbnail_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 찍은 때. 올린 때가 아니라 사진 자체가 들고 있는 값이라 없을 수 있다.
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    caption: Mapped[str | None] = mapped_column(String(200), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 사진 한 장이 2GB 를 넘을 일은 없지만 Integer 는 한 번 정하면 바꾸기
    # 번거로워서 처음부터 BigInteger 로 둔다.
    original_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)

    status: Mapped[PhotoStatus] = mapped_column(
        enum_column(PhotoStatus), nullable=False, default=PhotoStatus.UPLOADING
    )

    # 앱에서 고른 날. 찍은 시각(`taken_at`)과 따로 둔다. 여행 기간이 바뀌어도
    # 사진이 놓인 날은 그대로여야 해서 trip_days 를 가리키지 않는다.
    taken_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 원본 MIME. 받은 byte 를 열어 본 결과이지 앱이 말한 값이 아니다.
    original_mime: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # 원본·표시본·썸네일을 합친 크기. 공간 한도를 셀 때 쓴다.
    stored_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # 원본을 내려받을 수 있는 마지막 때. 지나면 정리 작업이 원본 파일만 지우고
    # `original_path` 를 비운다(표시본과 썸네일은 그대로 남는다).
    original_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 영수증은 기록 탭의 사진 목록에 넣지 않는다. 지출의 `receipt_photo_id` 가 가리킨다.
    is_receipt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # 지워도 7일은 파일과 행을 남긴다. 그 뒤 정리 작업이 둘 다 지운다.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Photo {self.id}>"


class PhotoLink(Base, TimestampMixin):
    """
    사진이 무엇에 붙어 있는지.

    `taggings` 와 같은 이유로 `target_id` 에 외래키가 없다. 대상을 지울 때
    `app.services.links.detach_all` 을 불러야 한다.

    한 사진이 여러 곳에 붙을 수 있어서 사진 쪽에 칼럼을 두지 않고 표를
    따로 뒀다. 숙소 사진이 그 날의 사진이기도 한 경우가 흔하다.
    """

    __tablename__ = "photo_links"
    __table_args__ = (
        Index("uq_photo_links_target", "photo_id", "target_type", "target_id", unique=True),
        Index("ix_photo_links_target", "target_type", "target_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    photo_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("photos.id", ondelete="CASCADE"), nullable=False
    )
    target_type: Mapped[PhotoTargetType] = mapped_column(
        enum_column(PhotoTargetType), nullable=False
    )
    target_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<PhotoLink {self.id}>"


class AuditLog(Base):
    """
    공간 안에서 누가 무엇을 했는지.

    **공간이나 계정이 사라져도 이 줄은 남는다.** 둘 다 SET NULL 로 끊는다.
    공간을 지우면 감사 기록까지 사라지면, 공간을 지우는 것으로 흔적을 지울
    수 있게 된다. 남은 줄은 자체 보유기간(6개월)에 따라 정리 작업이 파기한다
    (`app.services.audit.purge_expired`,
    docs/development/08-privacy-and-release-compliance.md).

    `TimestampMixin` 을 쓰지 않는다. 감사 기록은 고쳐지지 않으므로
    `updated_at` 이 있을 이유가 없고, 있으면 고쳐도 되는 것처럼 읽힌다.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_space_time", "space_id", "created_at"),
        Index("ix_audit_logs_target", "target_type", "target_id"),
        # 보유기간 파기는 공간을 가리지 않고 오래된 것부터 찾는다. 위의
        # (space_id, created_at) 으로는 그 질의를 받을 수 없어서 따로 둔다.
        # 이 표는 계속 자라기만 하므로 매일 전부 훑게 두면 안 된다.
        Index("ix_audit_logs_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    space_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="SET NULL"), nullable=True
    )
    actor_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    # 행동마다 남길 것이 달라서 정해진 칼럼으로 만들 수 없다. 개인정보를
    # 여기 넣지 않는다. 무엇이 바뀌었는지만 남긴다.
    log_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<AuditLog {self.id}>"
