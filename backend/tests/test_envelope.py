from uuid import UUID

import pytest

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
