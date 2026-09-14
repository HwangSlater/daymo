from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import (
    Checklist,
    ChecklistItem,
    ChecklistKind,
    Ingredient,
    Procurement,
    Recipe,
)
from tests.factories import (
    공간과_멤버_하나,
    멤버를_넣는다,
    사람을_넣는다,
    여행을_넣는다,
)

pytestmark = pytest.mark.anyio


async def 준비물_목록을_넣는다(db, trip, kind=ChecklistKind.PACKING) -> Checklist:
    checklist = Checklist(trip_id=trip.id, title="챙길 것", kind=kind)
    db.add(checklist)
    await db.flush()
    return checklist


async def 요리를_넣는다(db, trip, 이름="김치찌개") -> Recipe:
    recipe = Recipe(trip_id=trip.id, name=이름)
    db.add(recipe)
    await db.flush()
    return recipe


async def 준비물_한_줄(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    checklist = await 준비물_목록을_넣는다(db, trip)
    return space, membership, trip, checklist


# ---------------------------------------------------------------------------
# 준비물
# ---------------------------------------------------------------------------


async def test_담당은_세_가지_중_하나다(db):
    """특정 사람, 공용, 아직 안 정함. 앱에서 고르는 자리가 하나다."""
    _, membership, _, checklist = await 준비물_한_줄(db)

    db.add(ChecklistItem(checklist_id=checklist.id, name="충전기", owner_membership_id=membership.id))
    db.add(ChecklistItem(checklist_id=checklist.id, name="돗자리", is_shared=True))
    db.add(ChecklistItem(checklist_id=checklist.id, name="우산"))
    await db.flush()

    수 = await db.scalar(
        select(func.count()).select_from(ChecklistItem).where(ChecklistItem.checklist_id == checklist.id)
    )
    assert 수 == 3


async def test_공용인데_담당자가_있을_수_없다(db):
    """동시에 서면 화면이 무엇을 보여 줘야 할지 정해지지 않는다."""
    _, membership, _, checklist = await 준비물_한_줄(db)

    db.add(
        ChecklistItem(
            checklist_id=checklist.id,
            name="돗자리",
            is_shared=True,
            owner_membership_id=membership.id,
        )
    )
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_완료하지_않았는데_완료한_사람만_있을_수_없다(db):
    _, membership, _, checklist = await 준비물_한_줄(db)

    db.add(ChecklistItem(checklist_id=checklist.id, name="충전기", completed_by=membership.id))
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_준비물을_맡은_멤버는_지울_수_없다(db):
    _, membership, _, checklist = await 준비물_한_줄(db)
    db.add(ChecklistItem(checklist_id=checklist.id, name="충전기", owner_membership_id=membership.id))
    await db.flush()

    with pytest.raises(IntegrityError):
        await db.execute(text("DELETE FROM memberships WHERE id = :id"), {"id": membership.id})


async def test_수량은_글자다(db):
    """2개도 있고 한 봉지도 있다. 숫자와 단위로 쪼개면 적고 싶은 대로 못 적는다."""
    _, _, _, checklist = await 준비물_한_줄(db)

    item = ChecklistItem(checklist_id=checklist.id, name="삼겹살", quantity="한 근 반")
    db.add(item)
    await db.flush()

    assert item.quantity == "한 근 반"


# ---------------------------------------------------------------------------
# 재료
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("마련", [Procurement.BUY, Procurement.UNDECIDED])
async def test_구매와_미정에는_담당자가_없다(db, 마련):
    """사람이 아닌 값은 참가자 목록 밖에 둔다."""
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    recipe = await 요리를_넣는다(db, trip)

    db.add(
        Ingredient(
            recipe_id=recipe.id,
            name="두부",
            procurement=마련,
            owner_membership_id=membership.id,
        )
    )
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_가져올_때만_담당자를_붙인다(db):
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    recipe = await 요리를_넣는다(db, trip)

    재료 = Ingredient(
        recipe_id=recipe.id,
        name="김치",
        procurement=Procurement.BRING,
        owner_membership_id=membership.id,
    )
    db.add(재료)
    await db.flush()
    await db.refresh(재료)

    assert 재료.owner_membership_id == membership.id


async def test_재료의_기본은_미정이다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    recipe = await 요리를_넣는다(db, trip)

    재료 = Ingredient(recipe_id=recipe.id, name="대파")
    db.add(재료)
    await db.flush()
    await db.refresh(재료)

    assert 재료.procurement is Procurement.UNDECIDED
    assert 재료.owner_membership_id is None


async def test_인분은_0일_수_없다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)

    db.add(Recipe(trip_id=trip.id, name="김치찌개", servings=0))
    with pytest.raises(IntegrityError):
        await db.flush()


# ---------------------------------------------------------------------------
# 재료에서 가져온 준비물
# ---------------------------------------------------------------------------


async def test_출처만_연결하고_원문은_건드리지_않는다(db):
    """
    준비물 수정이 레시피 원문을 자동으로 바꾸면 예상치 못한 동기화가 생긴다.
    연결은 한 방향이다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    recipe = await 요리를_넣는다(db, trip)
    재료 = Ingredient(recipe_id=recipe.id, name="삼겹살", quantity="600g")
    db.add(재료)
    await db.flush()
    checklist = await 준비물_목록을_넣는다(db, trip)
    가져온_준비물 = ChecklistItem(
        checklist_id=checklist.id,
        name="삼겹살",
        quantity="600g",
        source_ingredient_id=재료.id,
    )
    db.add(가져온_준비물)
    await db.flush()

    가져온_준비물.quantity = "한 근"
    await db.flush()
    await db.refresh(재료)

    assert 재료.quantity == "600g"


async def test_완료_상태는_따로_유지된다(db):
    """
    여러 요리에서 같은 재료를 하나로 합친 경우가 있다. 한쪽을 껐다고
    나머지를 일괄로 바꾸면 사용자가 하지 않은 변경이 생긴다.
    """
    space, membership = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    recipe = await 요리를_넣는다(db, trip)
    재료 = Ingredient(recipe_id=recipe.id, name="두부")
    db.add(재료)
    await db.flush()
    checklist = await 준비물_목록을_넣는다(db, trip)
    준비물 = ChecklistItem(
        checklist_id=checklist.id, name="두부", source_ingredient_id=재료.id
    )
    db.add(준비물)
    await db.flush()

    준비물.completed_at = datetime.now(UTC)
    준비물.completed_by = membership.id
    await db.flush()
    await db.refresh(재료)

    assert 재료.completed_at is None


async def test_레시피를_지워도_가져온_준비물은_남는다(db):
    """이미 챙기기로 한 것이 원문을 지웠다고 사라지면 안 된다."""
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    recipe = await 요리를_넣는다(db, trip)
    재료 = Ingredient(recipe_id=recipe.id, name="김치")
    db.add(재료)
    await db.flush()
    checklist = await 준비물_목록을_넣는다(db, trip)
    준비물 = ChecklistItem(
        checklist_id=checklist.id, name="김치", source_ingredient_id=재료.id
    )
    db.add(준비물)
    await db.flush()

    await db.execute(text("DELETE FROM recipes WHERE id = :id"), {"id": recipe.id})
    await db.refresh(준비물)

    assert 준비물.source_ingredient_id is None
    assert 준비물.name == "김치"


async def test_여행을_지우면_준비물과_요리가_모두_사라진다(db):
    space, _ = await 공간과_멤버_하나(db)
    trip = await 여행을_넣는다(db, space)
    checklist = await 준비물_목록을_넣는다(db, trip)
    db.add(ChecklistItem(checklist_id=checklist.id, name="충전기"))
    recipe = await 요리를_넣는다(db, trip)
    db.add(Ingredient(recipe_id=recipe.id, name="두부"))
    await db.flush()

    await db.execute(text("DELETE FROM trips WHERE id = :id"), {"id": trip.id})

    for model, 조건 in (
        (Checklist, Checklist.trip_id == trip.id),
        (Recipe, Recipe.trip_id == trip.id),
        (ChecklistItem, ChecklistItem.checklist_id == checklist.id),
        (Ingredient, Ingredient.recipe_id == recipe.id),
    ):
        assert await db.scalar(select(func.count()).select_from(model).where(조건)) == 0, model.__name__
