import pytest

from app.models import MembershipRole
from tests.test_api_cooking import 요리를_넣는다, 준비물을_넣는다
from tests.test_api_expenses import 두_사람_여행, 지출을_넣는다
from tests.test_api_places import 멤버로_넣는다, 장소를_담는다
from tests.test_api_schedule import 일정을_넣는다
from tests.test_api_trips import 공간을_만든다, 로그인한_사람, 여행을_만든다

pytestmark = pytest.mark.anyio


async def 찾는다(api, headers, space_id, q, **값):
    응답 = await api.get(
        f"/v1/spaces/{space_id}/search", params={"q": q, **값}, headers=headers
    )
    assert 응답.status_code == 200, 응답.text
    return 응답.json()["data"]


async def 여덟_가지가_있는_공간(api, db):
    """찾을 수 있는 여덟 종류를 한 여행에 하나씩 넣어 둔다."""
    headers, space_id, trip, 나, _ = await 두_사람_여행(api, db)
    await 장소를_담는다(api, headers, trip["id"], name="소나기식당", category="식당", area="완산구")
    await 일정을_넣는다(api, headers, trip["id"], title="소나기식당에서 점심")
    await 준비물을_넣는다(api, headers, trip["id"], name="소나기 우산")
    await 요리를_넣는다(
        api,
        headers,
        trip["id"],
        name="소나기 된장찌개",
        ingredients=[{"name": "대파", "quantity": "한 대"}],
    )
    await 지출을_넣는다(api, headers, trip["id"], 나, title="소나기식당 점심")
    await api.post(
        f"/v1/trips/{trip['id']}/memos", json={"body": "소나기 오면 실내로"}, headers=headers
    )
    await api.post(
        f"/v1/trips/{trip['id']}/diaries",
        json={"title": "소나기 내린 날", "body": "우산 하나로 걸었다", "writtenOn": "2026-10-02"},
        headers=headers,
    )
    return headers, space_id, trip


# ---------------------------------------------------------------------------
# 찾기
# ---------------------------------------------------------------------------


async def test_여덟_종류를_한_번에_찾는다(api, db):
    headers, space_id, trip = await 여덟_가지가_있는_공간(api, db)
    await api.patch(
        f"/v1/trips/{trip['id']}",
        json={"version": trip["version"], "title": "소나기 제주"},
        headers=headers,
    )

    결과 = await 찾는다(api, headers, space_id, "소나기")

    assert {줄["type"] for 줄 in 결과} == {
        "trip", "place", "schedule", "packing", "recipe", "expense", "memo", "diary",
    }
    장소 = next(줄 for 줄 in 결과 if 줄["type"] == "place")
    assert (장소["title"], 장소["detail"], 장소["destination"]) == ("소나기식당", "식당 · 완산구", "places")
    assert 장소["tripId"] == trip["id"] and 장소["tripTitle"] == "소나기 제주"


async def test_재료_이름으로도_요리가_나온다(api, db):
    headers, space_id, _ = await 여덟_가지가_있는_공간(api, db)

    결과 = await 찾는다(api, headers, space_id, "대파")

    assert [(줄["type"], 줄["title"]) for 줄 in 결과] == [("recipe", "소나기 된장찌개")]


async def test_종류를_골라_받는다(api, db):
    headers, space_id, _ = await 여덟_가지가_있는_공간(api, db)

    결과 = await 찾는다(api, headers, space_id, "소나기", types="expense,memo")

    assert {줄["type"] for 줄 in 결과} == {"expense", "memo"}


async def test_모르는_종류_이름은_그냥_빠진다(api, db):
    """새 종류가 생겨도 옛 앱의 요청이 422 로 막히면 안 된다."""
    headers, space_id, _ = await 여덟_가지가_있는_공간(api, db)

    결과 = await 찾는다(api, headers, space_id, "소나기", types="place,아직없는것")

    assert {줄["type"] for 줄 in 결과} == {"place"}


async def test_두_글자보다_짧으면_빈_결과다(api, db):
    headers, space_id, _ = await 여덟_가지가_있는_공간(api, db)

    assert await 찾는다(api, headers, space_id, "소") == []
    assert await 찾는다(api, headers, space_id, " ") == []
    assert await 찾는다(api, headers, space_id, "") == []


async def test_너무_긴_말은_422다(api, db):
    headers, space_id, _ = await 여덟_가지가_있는_공간(api, db)

    응답 = await api.get(
        f"/v1/spaces/{space_id}/search", params={"q": "소" * 61}, headers=headers
    )

    assert 응답.status_code == 422


async def test_퍼센트를_쳐도_모든_줄이_나오지_않는다(api, db):
    """`%` 와 `_` 는 SQL 쪽에서 뜻이 있는 글자다. 그대로 나가면 전부가 걸린다."""
    headers, space_id, _ = await 여덟_가지가_있는_공간(api, db)

    assert await 찾는다(api, headers, space_id, "%%") == []
    assert await 찾는다(api, headers, space_id, "__") == []


async def test_결과_수에_상한이_있다(api, db):
    headers, space_id, trip = await 여덟_가지가_있는_공간(api, db)
    for 번호 in range(12):
        await 준비물을_넣는다(api, headers, trip["id"], name=f"소나기 우산 {번호}")

    결과 = await 찾는다(api, headers, space_id, "소나기", limit=5)

    assert len(결과) == 5


async def test_지운_여행과_지운_메모는_안_나온다(api, db):
    headers, space_id, trip = await 여덟_가지가_있는_공간(api, db)
    메모 = (
        await api.post(
            f"/v1/trips/{trip['id']}/memos", json={"body": "소나기 메모 하나 더"}, headers=headers
        )
    ).json()["data"]
    await api.delete(f"/v1/memos/{메모['id']}", headers=headers)

    남은_메모 = [줄 for 줄 in await 찾는다(api, headers, space_id, "소나기") if 줄["type"] == "memo"]
    assert [줄["title"] for 줄 in 남은_메모] == ["소나기 오면 실내로"]

    await api.delete(f"/v1/trips/{trip['id']}", headers=headers)

    assert await 찾는다(api, headers, space_id, "소나기") == []


async def test_다른_공간의_기록은_섞이지_않는다(api, db):
    headers, space_id, _ = await 여덟_가지가_있는_공간(api, db)
    다른_공간 = await 공간을_만든다(api, headers, "다른 공간")
    다른_여행 = await 여행을_만든다(api, headers, 다른_공간, title="소나기 겨울")

    결과 = await 찾는다(api, headers, space_id, "소나기")

    assert 다른_여행["id"] not in {줄["tripId"] for 줄 in 결과}
    assert {줄["tripId"] for 줄 in await 찾는다(api, headers, 다른_공간, "소나기")} == {다른_여행["id"]}


async def test_멤버가_아니면_공간이_없는_것과_같다(api, db):
    _, space_id, _ = await 여덟_가지가_있는_공간(api, db)
    남 = await 로그인한_사람(api, "other@example.com", "가람")

    응답 = await api.get(f"/v1/spaces/{space_id}/search", params={"q": "소나기"}, headers=남)

    assert 응답.status_code == 404


async def test_보기만_하는_멤버도_찾을_수_있다(api, db):
    headers, space_id, _ = await 여덟_가지가_있는_공간(api, db)
    보기만 = await 멤버로_넣는다(api, db, space_id, "viewer@example.com", MembershipRole.VIEWER)

    결과 = await 찾는다(api, 보기만, space_id, "소나기")

    assert 결과
