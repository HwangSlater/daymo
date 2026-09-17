import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedByMixin, TimestampMixin, uuid_pk
from app.models.enums import ChecklistKind, Procurement, enum_column

# 준비물과 재료의 담당은 같은 공간의 membership 이다. 외래키로는 공간까지
# 묶을 수 없어서 넣는 쪽에서 검사한다. 지출과 같이 나간 멤버도 받는다.
#
# `quantity` 는 숫자가 아니라 글자다. "2개" 도 있고 "한 봉지" 도 있다.
# 숫자와 단위로 쪼개면 사용자가 적고 싶은 대로 적을 수 없다.


class Checklist(Base, TimestampMixin, CreatedByMixin):
    """준비물 목록 또는 장 볼 목록."""

    __tablename__ = "checklists"
    __table_args__ = (Index("ix_checklists_trip", "trip_id", "kind"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(40), nullable=False)
    kind: Mapped[ChecklistKind] = mapped_column(
        enum_column(ChecklistKind), nullable=False, default=ChecklistKind.PACKING
    )

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Checklist {self.id}>"


class ChecklistItem(Base, TimestampMixin, CreatedByMixin):
    """
    챙길 것 하나.

    담당은 세 가지 중 하나다. 특정 사람(`owner_membership_id`), 공용
    (`is_shared`), 그리고 아직 안 정함(둘 다 비어 있음). 앱에서 고르는 자리가
    하나이므로 사람과 공용이 동시에 서는 일은 없다. 제약으로 막아 둔다.

    `source_ingredient_id` 는 어느 재료에서 가져왔는지만 가리킨다. 이쪽을
    고쳐도 레시피 원문은 바뀌지 않는다. 예상치 못한 동기화를 막으려는 것이라
    이 연결은 한 방향이다.

    완료 상태도 재료와 따로 유지한다. 한쪽을 완료해도 다른 쪽이 자동으로
    바뀌지 않는다. 여러 요리에서 같은 재료를 하나로 합친 경우가 있어서, 한쪽을
    껐다고 나머지를 일괄로 바꾸면 사용자가 하지 않은 변경이 생긴다.
    """

    __tablename__ = "checklist_items"
    __table_args__ = (
        # 공용이면 담당자가 없다. 앱에서 고르는 자리가 하나라 둘이 동시에
        # 설 수 없고, 동시에 서면 화면이 무엇을 보여 줘야 할지 정해지지 않는다.
        CheckConstraint(
            "NOT is_shared OR owner_membership_id IS NULL", name="shared_has_no_owner"
        ),
        # 누가 완료했는지는 완료된 뒤에만 있다.
        CheckConstraint(
            "completed_at IS NOT NULL OR completed_by IS NULL", name="completed_by_needs_time"
        ),
        Index("ix_checklist_items_list", "checklist_id", "sort_order"),
        # 재료를 지울 때 거기서 가져온 준비물을 찾는 길.
        Index("ix_checklist_items_source_ingredient_id", "source_ingredient_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    checklist_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    quantity: Mapped[str | None] = mapped_column(String(60), nullable=True)

    owner_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=True
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="SET NULL"), nullable=True
    )

    # 레시피를 지워도 가져온 준비물은 남는다. 이미 챙기기로 한 것이
    # 원문을 지웠다고 사라지면 안 된다.
    source_ingredient_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="SET NULL"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<ChecklistItem {self.id}>"


class Recipe(Base, TimestampMixin, CreatedByMixin):
    """해 먹을 것 하나."""

    __tablename__ = "recipes"
    __table_args__ = (
        CheckConstraint("servings IS NULL OR servings > 0", name="servings_positive"),
        Index("ix_recipes_trip", "trip_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    servings: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 재료는 요리와 함께 오간다. 재료를 고쳐도 요리의 version 이 오른다.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Recipe {self.id}>"


class Ingredient(Base, TimestampMixin, CreatedByMixin):
    """
    재료 하나.

    `procurement` 가 `bring` 일 때만 담당자가 있다. `buy` 는 현지에서 사 오는
    것이고 `undecided` 는 아직 안 정한 것이라 둘 다 사람이 아니다.
    """

    __tablename__ = "ingredients"
    __table_args__ = (
        CheckConstraint(
            "procurement = 'bring' OR owner_membership_id IS NULL",
            name="owner_only_when_bringing",
        ),
        Index("ix_ingredients_recipe", "recipe_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    quantity: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # 앱의 묶음. GPT 가 읽어 온 값이 그대로 들어와서 목록이 정해져 있지 않다.
    category: Mapped[str | None] = mapped_column(String(30), nullable=True)

    procurement: Mapped[Procurement] = mapped_column(
        enum_column(Procurement), nullable=False, default=Procurement.UNDECIDED
    )
    owner_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=True
    )

    # 준비물 쪽 완료와 따로 둔다.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<Ingredient {self.id}>"
