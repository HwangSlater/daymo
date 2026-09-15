import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentCaller, DbSession
from app.api.permissions import (
    WRITERS,
    membership_for_checklist_item,
    membership_for_trip,
    membership_for_trip_row,
    require,
)
from app.core.responses import ok, page
from app.models import Recipe
from app.schemas.cooking import (
    ChecklistItemCreateRequest,
    ChecklistItemOut,
    ChecklistItemUpdateRequest,
    IngredientOut,
    RecipeCreateRequest,
    RecipeOut,
    RecipeUpdateRequest,
)
from app.services import cooking as cooking_service

router = APIRouter(tags=["packing and cooking"])


def _준비물_응답(trip_id: uuid.UUID, view) -> dict:
    item, tags = view
    return ChecklistItemOut(
        id=str(item.id),
        trip_id=str(trip_id),
        name=item.name,
        quantity=item.quantity,
        owner_membership_id=str(item.owner_membership_id) if item.owner_membership_id else None,
        is_shared=item.is_shared,
        completed=item.completed_at is not None,
        tags=tags,
        version=item.version,
    ).model_dump(by_alias=True, mode="json")


def _요리_응답(view) -> dict:
    recipe, ingredients = view
    return RecipeOut(
        id=str(recipe.id),
        trip_id=str(recipe.trip_id),
        name=recipe.name,
        memo=recipe.memo,
        source_url=recipe.source_url,
        ingredients=[
            IngredientOut(
                id=str(ingredient.id),
                name=ingredient.name,
                quantity=ingredient.quantity,
                category=ingredient.category,
                procurement=ingredient.procurement,
                owner_membership_id=str(ingredient.owner_membership_id) if ingredient.owner_membership_id else None,
                ready=ingredient.completed_at is not None,
            )
            for ingredient in ingredients
        ],
        version=recipe.version,
    ).model_dump(by_alias=True, mode="json")


# ---------------------------------------------------------------------------
# 준비물
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/checklist-items")
async def list_checklist_items(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([_준비물_응답(trip.id, view) for view in await cooking_service.list_items(db, trip)])


@router.post("/trips/{trip_id}/checklist-items", status_code=status.HTTP_201_CREATED)
async def create_checklist_item(
    trip_id: uuid.UUID, body: ChecklistItemCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    item, 만들었다 = await cooking_service.create_item(
        db, trip=trip, actor=membership, item_id=body.id, values=body.model_dump(exclude={"id"})
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_준비물_응답(trip.id, await cooking_service.item_view(db, item)))


@router.patch("/checklist-items/{item_id}")
async def update_checklist_item(
    item_id: uuid.UUID, body: ChecklistItemUpdateRequest, caller: CurrentCaller, db: DbSession
) -> dict:
    membership, trip, item = await membership_for_checklist_item(db, user_id=caller.user.id, item_id=item_id)
    require(membership, *WRITERS)
    await cooking_service.update_item(
        db, trip=trip, item=item, actor=membership, version=body.version,
        changes=body.model_dump(exclude_unset=True, exclude={"version"}),
    )
    return ok(_준비물_응답(trip.id, await cooking_service.item_view(db, item)))


@router.delete("/checklist-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist_item(item_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    membership, _, item = await membership_for_checklist_item(db, user_id=caller.user.id, item_id=item_id)
    require(membership, *WRITERS)
    await cooking_service.remove_item(db, item)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# 요리
# ---------------------------------------------------------------------------


@router.get("/trips/{trip_id}/recipes")
async def list_recipes(trip_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> dict:
    _, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    return page([_요리_응답(view) for view in await cooking_service.list_recipes(db, trip)])


@router.post("/trips/{trip_id}/recipes", status_code=status.HTTP_201_CREATED)
async def create_recipe(
    trip_id: uuid.UUID, body: RecipeCreateRequest, caller: CurrentCaller, db: DbSession, response: Response
) -> dict:
    membership, trip = await membership_for_trip(db, user_id=caller.user.id, trip_id=trip_id)
    require(membership, *WRITERS)
    recipe, 만들었다 = await cooking_service.create_recipe(
        db, trip=trip, actor=membership, recipe_id=body.id, values=body.model_dump(exclude={"id"})
    )
    if not 만들었다:
        response.status_code = status.HTTP_200_OK
    return ok(_요리_응답(await cooking_service.recipe_view(db, recipe)))


@router.patch("/recipes/{recipe_id}")
async def update_recipe(recipe_id: uuid.UUID, body: RecipeUpdateRequest, caller: CurrentCaller, db: DbSession) -> dict:
    membership, trip, recipe = await membership_for_trip_row(db, user_id=caller.user.id, model=Recipe, row_id=recipe_id)
    require(membership, *WRITERS)
    await cooking_service.update_recipe(
        db, trip=trip, recipe=recipe, actor=membership, version=body.version,
        changes=body.model_dump(exclude_unset=True, exclude={"version"}),
    )
    return ok(_요리_응답(await cooking_service.recipe_view(db, recipe)))


@router.delete("/recipes/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recipe(recipe_id: uuid.UUID, caller: CurrentCaller, db: DbSession) -> Response:
    membership, _, recipe = await membership_for_trip_row(db, user_id=caller.user.id, model=Recipe, row_id=recipe_id)
    require(membership, *WRITERS)
    await cooking_service.remove_recipe(db, recipe)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
