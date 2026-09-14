import uuid

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedByMixin, TimestampMixin, uuid_pk
from app.models.enums import LinkProvider, LinkTargetType, TagScope, enum_column


class Tag(Base, TimestampMixin, CreatedByMixin):
    """
    공간이 쓰는 꼬리표.

    `scope` 로 갈라 둔 이유는 쓰임이 다르면 같은 이름이라도 다른 태그이기
    때문이다. 준비물의 `겨울` 과 장소의 `겨울` 은 섞이면 안 된다.

    태그에는 삭제 버튼을 두지 않는다. 마지막 연결이 사라진 태그는 서버
    정리 작업이 치운다(docs/development/02-architecture-and-data-model.md 3장).
    """

    __tablename__ = "tags"
    __table_args__ = (
        # 이름은 공백을 정리한 뒤 공간·scope 안에서 중복되지 않는다.
        # 정리는 넣는 쪽에서 하고, 여기서는 결과가 겹치지 않는 것만 막는다.
        Index("uq_tags_space_scope_name", "space_id", "scope", "name", unique=True),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    space_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    scope: Mapped[TagScope] = mapped_column(enum_column(TagScope), nullable=False)
    name: Mapped[str] = mapped_column(String(20), nullable=False)
    # 화면에서 고르는 색. 값이 없으면 앱이 기본색을 쓴다.
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Tag {self.id}>"


class Tagging(Base, TimestampMixin):
    """
    태그 하나가 무엇에 붙어 있는지.

    `target_id` 에는 외래키를 걸 수 없다. 가리키는 곳이 장소일 수도 준비물일
    수도 재료일 수도 있어서다. 그래서 **대상을 지울 때 이 줄이 같이 사라지지
    않는다.** 지우는 쪽에서 `app.services.links.detach_all` 을 불러야 한다.

    태그 쪽은 외래키가 있어서 태그를 지우면 연결도 따라 사라진다. 한쪽만
    되는 것이 이 설계의 값이다.
    """

    __tablename__ = "taggings"
    __table_args__ = (
        Index("uq_taggings_target", "tag_id", "target_type", "target_id", unique=True),
        # 대상에서 붙은 태그를 찾는 방향으로 읽는다.
        Index("ix_taggings_target", "target_type", "target_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    tag_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), nullable=False
    )
    # 태그의 scope 와 같은 말을 쓴다. 장소 태그가 준비물에 붙는 일이 없도록
    # 넣는 쪽에서 tag.scope 와 맞는지 확인한다. 외래키로는 표현할 수 없다.
    target_type: Mapped[TagScope] = mapped_column(enum_column(TagScope), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Tagging {self.id}>"


class ExternalLink(Base, TimestampMixin, CreatedByMixin):
    """
    바깥으로 나가는 링크.

    `taggings` 와 같은 이유로 `target_id` 에 외래키가 없다. 대상을 지울 때
    `app.services.links.detach_all` 을 불러야 한다.
    """

    __tablename__ = "external_links"
    __table_args__ = (Index("ix_external_links_target", "target_type", "target_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    target_type: Mapped[LinkTargetType] = mapped_column(
        enum_column(LinkTargetType), nullable=False
    )
    target_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    provider: Mapped[LinkProvider] = mapped_column(
        enum_column(LinkProvider), nullable=False, default=LinkProvider.OTHER
    )
    # 길이를 열어 두지 않는다. 지도 공유 링크에 질의 문자열이 길게 붙는
    # 경우가 있어 2048 로 잡았다. 사용자 입력이라 검사는 넣는 쪽에서 한다
    # (위험한 scheme 거부는 docs/development/05-quality-and-operations.md).
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    label: Mapped[str | None] = mapped_column(String(40), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<ExternalLink {self.id}>"
