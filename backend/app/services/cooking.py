"""
준비물과 요리.

앱의 준비물은 여행마다 목록 하나다. 서버에는 목록(`checklists`)을 여럿 둘 수 있어서,
여행의 준비물 목록을 처음 쓸 때 하나 만들어 쓴다.

담당은 같은 공간의 membership 만 받는다. 나간 멤버도 받는다. 그 사람이 맡았던
준비물을 고칠 때 막히면 안 된다.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.models import (
    Checklist,
    ChecklistItem,
    ChecklistKind,
    Ingredient,
    Membership,
    Procurement,
    Recipe,
    TagScope,
    Tagging,
    Trip,
)
from app.services.places import check_map_url, normalize_tags, replace_tags, tags_by_target

PACKING_LIST_TITLE = "준비물"


def _blank(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


async def _check_owner(session: AsyncSession, trip: Trip, membership_id: uuid.UUID | None, field: str) -> None:
    if membership_id is None:
        return
    같은_공간 = await session.scalar(
        select(Membership.id).where(Membership.id == membership_id, Membership.space_id == trip.space_id)
    )
    if 같은_공간 is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={field: "이 공간의 멤버가 아니에요."})


async def _check_source_ingredient(session: AsyncSession, trip: Trip, ingredient_id: uuid.UUID | None) -> None:
    """준비물이 가리키는 재료는 같은 여행 요리의 것이어야 한다. 없어진 재료도 받지 않는다."""
    if ingredient_id is None:
        return
    같은_여행 = await session.scalar(
        select(Ingredient.id)
        .join(Recipe, Recipe.id == Ingredient.recipe_id)
        .where(Ingredient.id == ingredient_id, Recipe.trip_id == trip.id)
    )
    if 같은_여행 is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"sourceIngredientId": "이 여행의 요리 재료가 아니에요."})


async def packing_list(session: AsyncSession, trip: Trip, actor: Membership | None = None) -> Checklist | None:
    """여행의 준비물 목록. `actor` 를 주면 없을 때 만든다."""
    found = await session.scalar(
        select(Checklist)
        .where(Checklist.trip_id == trip.id, Checklist.kind == ChecklistKind.PACKING)
        .order_by(Checklist.created_at)
        .limit(1)
    )
    if found is None and actor is not None:
        found = Checklist(trip_id=trip.id, title=PACKING_LIST_TITLE, kind=ChecklistKind.PACKING, created_by=actor.user_id)
        session.add(found)
        await session.flush()
    return found


# ---------------------------------------------------------------------------
# 준비물
# ---------------------------------------------------------------------------


async def list_items(session: AsyncSession, trip: Trip) -> list[tuple[ChecklistItem, list[str]]]:
    checklist = await packing_list(session, trip)
    if checklist is None:
        return []
    items = (
        await session.execute(
            select(ChecklistItem)
            .where(ChecklistItem.checklist_id == checklist.id)
            .order_by(ChecklistItem.sort_order, ChecklistItem.created_at, ChecklistItem.id)
        )
    ).scalars().all()
    tags = await tags_by_target(session, TagScope.PACKING, [item.id for item in items])
    return [(item, tags.get(item.id, [])) for item in items]


async def item_view(session: AsyncSession, item: ChecklistItem) -> tuple[ChecklistItem, list[str]]:
    tags = await tags_by_target(session, TagScope.PACKING, [item.id])
    return item, tags.get(item.id, [])


def _apply_owner(item: ChecklistItem, owner_id: uuid.UUID | None, shared: bool) -> None:
    if shared and owner_id is not None:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"isShared": "공용이면 담당자를 둘 수 없어요."})
    item.owner_membership_id = owner_id
    item.is_shared = shared


def _apply_completed(item: ChecklistItem, completed: bool, actor: Membership) -> None:
    """체크를 켤 때만 시각과 사람을 적는다. 이미 켜진 것을 다시 켜도 처음 체크를 지킨다."""
    if completed and item.completed_at is None:
        item.completed_at = datetime.now(UTC)
        item.completed_by = actor.id
    elif not completed:
        item.completed_at = None
        item.completed_by = None


async def create_item(
    session: AsyncSession, *, trip: Trip, actor: Membership, item_id: uuid.UUID | None, values: dict
) -> tuple[ChecklistItem, bool]:
    if item_id is not None:
        기존 = await session.get(ChecklistItem, item_id)
        if 기존 is not None:
            checklist = await session.get(Checklist, 기존.checklist_id)
            if checklist is None or checklist.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False
    tags = normalize_tags(values.get("tags") or [])
    await _check_owner(session, trip, values.get("owner_membership_id"), "ownerMembershipId")
    await _check_source_ingredient(session, trip, values.get("source_ingredient_id"))
    checklist = await packing_list(session, trip, actor)
    # 한 transaction 안에서 만든 줄은 created_at 이 같다. 넣은 순서는 sort_order 로 지킨다.
    끝 = await session.scalar(select(func.max(ChecklistItem.sort_order)).where(ChecklistItem.checklist_id == checklist.id))
    item = ChecklistItem(
        id=item_id or uuid.uuid4(),
        checklist_id=checklist.id,
        sort_order=(끝 if 끝 is not None else -1) + 1,
        name=values["name"].strip(),
        quantity=_blank(values.get("quantity")),
        source_ingredient_id=values.get("source_ingredient_id"),
        created_by=actor.user_id,
    )
    _apply_owner(item, values.get("owner_membership_id"), values.get("is_shared", False))
    _apply_completed(item, values.get("completed", False), actor)
    session.add(item)
    await session.flush()
    await replace_tags(session, space_id=trip.space_id, scope=TagScope.PACKING, target_id=item.id, names=tags, actor=actor)
    return item, True


async def update_item(
    session: AsyncSession, *, trip: Trip, item: ChecklistItem, actor: Membership, version: int, changes: dict
) -> ChecklistItem:
    if version != item.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    if "name" in changes:
        if not (changes["name"] or "").strip():
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"name": "준비물 이름을 적어 주세요."})
        item.name = changes["name"].strip()
    if "quantity" in changes:
        item.quantity = _blank(changes["quantity"])
    if "owner_membership_id" in changes or changes.get("is_shared") is not None:
        # 한쪽만 보내면 다른 쪽은 그에 맞춰 비운다. 담당자를 정하면 공용이 아니고,
        # 공용으로 바꾸면 담당자가 없다.
        owner = changes.get("owner_membership_id")
        shared = changes.get("is_shared")
        if "owner_membership_id" not in changes:
            owner = None if shared else item.owner_membership_id
        if shared is None:
            shared = False if owner is not None else item.is_shared
        await _check_owner(session, trip, owner, "ownerMembershipId")
        _apply_owner(item, owner, shared)
    if changes.get("completed") is not None:
        # 재료의 준비 완료는 건드리지 않는다. 함께 바꿀지는 앱이 사용자에게 묻고 따로 보낸다.
        _apply_completed(item, changes["completed"], actor)
    if "source_ingredient_id" in changes:
        await _check_source_ingredient(session, trip, changes["source_ingredient_id"])
        item.source_ingredient_id = changes["source_ingredient_id"]
    if "tags" in changes:
        await replace_tags(
            session, space_id=trip.space_id, scope=TagScope.PACKING, target_id=item.id,
            names=normalize_tags(changes["tags"] or []), actor=actor,
        )
    item.version += 1
    await session.flush()
    return item


async def remove_item(session: AsyncSession, item: ChecklistItem) -> None:
    await session.execute(delete(Tagging).where(Tagging.target_type == TagScope.PACKING, Tagging.target_id == item.id))
    await session.delete(item)
    await session.flush()


# ---------------------------------------------------------------------------
# 요리와 재료
# ---------------------------------------------------------------------------


async def list_recipes(session: AsyncSession, trip: Trip) -> list[tuple[Recipe, list[Ingredient]]]:
    recipes = (
        await session.execute(
            select(Recipe).where(Recipe.trip_id == trip.id).order_by(Recipe.sort_order, Recipe.created_at, Recipe.id)
        )
    ).scalars().all()
    by_recipe = await _ingredients_of(session, [recipe.id for recipe in recipes])
    return [(recipe, by_recipe.get(recipe.id, [])) for recipe in recipes]


async def recipe_view(session: AsyncSession, recipe: Recipe) -> tuple[Recipe, list[Ingredient]]:
    return recipe, (await _ingredients_of(session, [recipe.id])).get(recipe.id, [])


async def _ingredients_of(session: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, list[Ingredient]]:
    if not ids:
        return {}
    result: dict[uuid.UUID, list[Ingredient]] = {}
    for ingredient in (
        await session.execute(
            select(Ingredient)
            .where(Ingredient.recipe_id.in_(ids))
            .order_by(Ingredient.sort_order, Ingredient.created_at, Ingredient.id)
        )
    ).scalars():
        result.setdefault(ingredient.recipe_id, []).append(ingredient)
    return result


def _source_url(value: str | None) -> str | None:
    try:
        link = check_map_url(value)
    except AppError as error:
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"sourceUrl": "http나 https로 시작하는 링크만 저장할 수 있어요."}) from error
    return link[0] if link else None


async def _replace_ingredients(
    session: AsyncSession, trip: Trip, recipe: Recipe, ingredients: list[dict], actor: Membership
) -> None:
    """
    재료를 보낸 목록대로 맞춘다. id 가 같은 재료는 고치고, 없는 id 는 만들고, 빠진 재료는 지운다.

    지우지 않고 고치는 이유는 준비물의 `source_ingredient_id` 가 재료를 가리키기 때문이다.
    통째로 지우고 다시 만들면 그 연결이 모두 끊긴다.
    """
    ids = [value["id"] for value in ingredients if value.get("id")]
    if len(ids) != len(set(ids)):
        raise AppError(ErrorCode.VALIDATION_ERROR, fields={"ingredients": "같은 재료가 두 번 들어 있어요."})
    기존 = {item.id: item for item in (await _ingredients_of(session, [recipe.id])).get(recipe.id, [])}
    if ids:
        남의_재료 = (
            await session.execute(select(Ingredient.id).where(Ingredient.id.in_(ids), Ingredient.recipe_id != recipe.id))
        ).scalars().first()
        if 남의_재료 is not None:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"ingredients": "쓸 수 없는 재료 id가 있어요."})

    for 순서, value in enumerate(ingredients):
        # 고칠 때는 보낸 칸만 들어온다. 재료는 통째로 보내는 것이라 빠진 칸은 기본값이다.
        procurement = value.get("procurement") or Procurement.UNDECIDED
        owner = value.get("owner_membership_id")
        if procurement != Procurement.BRING and owner is not None:
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"ingredients": "챙겨 가는 재료만 챙길 사람을 정할 수 있어요."})
        await _check_owner(session, trip, owner, "ingredients")
        item = 기존.pop(value["id"], None) if value.get("id") else None
        if item is None:
            item = Ingredient(id=value.get("id") or uuid.uuid4(), recipe_id=recipe.id, created_by=actor.user_id, name="")
            session.add(item)
        item.name = value["name"].strip()
        item.quantity = _blank(value.get("quantity"))
        item.category = _blank(value.get("category"))
        item.procurement = procurement
        item.owner_membership_id = owner
        item.sort_order = 순서
        if value.get("ready") and item.completed_at is None:
            item.completed_at = datetime.now(UTC)
        elif not value.get("ready"):
            item.completed_at = None

    for 빠진 in 기존.values():
        await session.delete(빠진)
    await session.flush()


async def create_recipe(
    session: AsyncSession, *, trip: Trip, actor: Membership, recipe_id: uuid.UUID | None, values: dict
) -> tuple[Recipe, bool]:
    if recipe_id is not None:
        기존 = await session.get(Recipe, recipe_id)
        if 기존 is not None:
            if 기존.trip_id != trip.id:
                raise AppError(ErrorCode.VALIDATION_ERROR, fields={"id": "쓸 수 없는 id예요."})
            return 기존, False
    끝 = await session.scalar(select(func.max(Recipe.sort_order)).where(Recipe.trip_id == trip.id))
    recipe = Recipe(
        id=recipe_id or uuid.uuid4(),
        trip_id=trip.id,
        sort_order=(끝 if 끝 is not None else -1) + 1,
        name=values["name"].strip(),
        memo=_blank(values.get("memo")),
        source_url=_source_url(values.get("source_url")),
        created_by=actor.user_id,
    )
    session.add(recipe)
    await session.flush()
    await _replace_ingredients(session, trip, recipe, values.get("ingredients") or [], actor)
    return recipe, True


async def update_recipe(
    session: AsyncSession, *, trip: Trip, recipe: Recipe, actor: Membership, version: int, changes: dict
) -> Recipe:
    if version != recipe.version:
        raise AppError(ErrorCode.VERSION_CONFLICT)
    if "name" in changes:
        if not (changes["name"] or "").strip():
            raise AppError(ErrorCode.VALIDATION_ERROR, fields={"name": "요리 이름을 적어 주세요."})
        recipe.name = changes["name"].strip()
    if "memo" in changes:
        recipe.memo = _blank(changes["memo"])
    if "source_url" in changes:
        recipe.source_url = _source_url(changes["source_url"])
    if "ingredients" in changes:
        await _replace_ingredients(session, trip, recipe, changes["ingredients"] or [], actor)
    recipe.version += 1
    await session.flush()
    return recipe


async def remove_recipe(session: AsyncSession, recipe: Recipe) -> None:
    # 재료는 CASCADE 로 지워지고, 그 재료에서 가져온 준비물은 연결만 비워진다(SET NULL).
    await session.delete(recipe)
    await session.flush()
