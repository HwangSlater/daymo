import logging
from uuid import UUID

import pytest

from app.main import validation_message

pytestmark = pytest.mark.anyio


async def test_성공_응답에_requestId가_들어간다(client):
    response = await client.get("/health")

    assert response.json()["meta"]["requestId"]


async def test_앱이_보낸_UUID는_그대로_쓴다(client):
    """앱 로그와 서버 로그를 같은 값으로 이을 수 있어야 한다."""
    보낸_id = "11111111-2222-3333-4444-555555555555"

    response = await client.get("/health", headers={"X-Request-Id": 보낸_id})

    assert response.headers["X-Request-Id"] == 보낸_id
    assert response.json()["meta"]["requestId"] == 보낸_id


@pytest.mark.parametrize(
    "보낸_값",
    [
        "not-a-uuid",
        "../../etc/passwd",
        "a" * 5000,
        "id" + chr(13) + chr(10) + "X-Injected: yes",
        "<script>alert(1)</script>",
    ],
)
async def test_이상한_requestId는_버리고_새로_만든다(client, 보낸_값):
    """
    이 값은 응답 헤더로 되돌아가고 로그에도 찍힌다. 검증 없이 받으면 로그를
    조작하거나 헤더에 임의의 내용을 실을 수 있다.
    """
    response = await client.get("/health", headers={"X-Request-Id": 보낸_값})

    돌아온_id = response.headers["X-Request-Id"]
    assert 돌아온_id != 보낸_값
    UUID(돌아온_id)  # UUID 가 아니면 여기서 터진다


async def test_요청마다_다른_id가_붙는다(client):
    첫번째 = await client.get("/health")
    두번째 = await client.get("/health")

    assert 첫번째.json()["meta"]["requestId"] != 두번째.json()["meta"]["requestId"]


async def test_없는_경로는_명세서_모양의_오류를_낸다(client):
    response = await client.get("/v1/없는것")

    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "NOT_FOUND"
    assert error["requestId"]


# ---------------------------------------------------------------------------
# 입력 오류 문구
# ---------------------------------------------------------------------------


async def test_입력_오류_문구가_한국어다(client):
    """
    Pydantic 의 영어 문구("String should have at most 16 characters")가 그대로
    나가면 앱에서 이 한 줄만 영어로 뜬다. 길이는 문구에 넣어 준다.
    """
    response = await client.post("/v1/client-errors", json={"platform": "안드로이드" * 10})

    assert response.status_code == 422
    assert response.json()["error"]["fields"]["platform"] == "16자까지 쓸 수 있어요."


async def test_모르는_칸_오류도_한국어다(client):
    response = await client.post("/v1/client-errors", json={"platform": "ios", "메모": "제주"})

    assert response.json()["error"]["fields"]["메모"] == "여기에는 보낼 수 없는 값이에요."


@pytest.mark.parametrize(
    ("오류", "칸", "기대"),
    [
        ({"type": "missing"}, "title", "꼭 입력해야 하는 값이에요."),
        ({"type": "extra_forbidden"}, "memo", "여기에는 보낼 수 없는 값이에요."),
        ({"type": "string_too_long", "ctx": {"max_length": 60}}, "title", "60자까지 쓸 수 있어요."),
        ({"type": "string_too_short", "ctx": {"min_length": 1}}, "title", "한 글자 이상 입력해 주세요."),
        ({"type": "string_too_short", "ctx": {"min_length": 3}}, "code", "3자 이상 입력해 주세요."),
        ({"type": "int_parsing"}, "version", "숫자로 입력해 주세요."),
        ({"type": "decimal_parsing"}, "amount", "숫자로 입력해 주세요."),
        ({"type": "greater_than_equal", "ctx": {"ge": 0}}, "budget", "0 이상이어야 해요."),
        ({"type": "less_than_equal", "ctx": {"le": 100}}, "limit", "100 이하여야 해요."),
        ({"type": "too_long", "ctx": {"max_length": 10}}, "ids", "10개까지 담을 수 있어요."),
        ({"type": "date_from_datetime_parsing"}, "startDate", "날짜 형식이 맞지 않아요. 예: 2026-09-17"),
        ({"type": "literal_error"}, "style", "고를 수 없는 값이에요. 목록에서 골라 주세요."),
        ({"type": "uuid_parsing"}, "coverPhotoId", "잘못된 값이에요. 다시 시도해 주세요."),
        ({"type": "value_error"}, "newEmail", "이메일 주소 형식이 맞지 않아요."),
    ],
)
def test_type마다_한국어_문구를_고른다(오류, 칸, 기대):
    assert validation_message(오류, 칸) == 기대


def test_모르는_type은_기본_문구로_떨어지고_영어는_로그에만_남는다(caplog):
    """사용자 화면에 영어를 내보내지 않는다. 원문은 서버 로그에서 본다."""
    오류 = {"type": "새로_생긴_type", "loc": ("body", "title"), "msg": "Something went wrong"}

    with caplog.at_level(logging.WARNING, logger="daymo"):
        문구 = validation_message(오류, "title")

    assert 문구 == "입력한 값을 확인해 주세요."
    남은_것 = "\n".join(기록.getMessage() for 기록 in caplog.records)
    assert "Something went wrong" in 남은_것
    assert "새로_생긴_type" in 남은_것


def test_ctx에_기대한_값이_없어도_영어를_내보내지_않는다():
    """Pydantic 이 ctx 모양을 바꿔도 화면에 영어가 새어 나가면 안 된다."""
    빈_ctx = {"type": "string_too_long", "ctx": {}}

    assert validation_message(빈_ctx, "title") == "입력한 값을 확인해 주세요."
