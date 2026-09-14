import pytest

pytestmark = pytest.mark.anyio


async def test_공개_health는_DB_없이도_응답한다(client, monkeypatch):
    """
    UptimeRobot 이 5분마다 보는 경로다. DB 가 잠깐 끊겼다고 이 경로까지
    실패하면 외부 감시가 무엇이 죽었는지 구분하지 못한다.
    """
    async def 죽은_DB() -> bool:
        return False

    monkeypatch.setattr("app.core.db.check_database", 죽은_DB)

    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "ok"


async def test_내부_health는_DB가_죽으면_503을_낸다(client, monkeypatch):
    """
    200을 돌려주면 배포 후 smoke test 가 통과해 버려서 자동 복귀가 동작하지 않는다.
    """
    async def 죽은_DB() -> bool:
        return False

    monkeypatch.setattr("app.api.v1.health.check_database", 죽은_DB)

    response = await client.get("/v1/health")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"


async def test_내부_health는_DB가_살아_있으면_200이다(client, monkeypatch):
    async def 살아_있는_DB() -> bool:
        return True

    monkeypatch.setattr("app.api.v1.health.check_database", 살아_있는_DB)

    response = await client.get("/v1/health")

    assert response.status_code == 200
    assert response.json()["data"] == {"status": "ok", "database": "ok"}
