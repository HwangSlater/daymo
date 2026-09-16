"""앱이 보내는 오류 한 줄을 받는 곳."""

import logging

import pytest

from app.api.v1 import client_errors

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def _한도를_되돌린다():
    """세는 값이 모듈에 있어서 시험끼리 영향을 준다. 시험마다 0 부터 센다."""
    client_errors._창 = 0
    client_errors._센_것 = 0
    yield
    client_errors._창 = 0
    client_errors._센_것 = 0


async def test_로그인하지_않아도_보낼_수_있다(client):
    응답 = await client.post(
        "/v1/client-errors",
        json={"platform": "web", "appVersion": "0.1.0", "kind": "crash", "name": "TypeError"},
    )
    assert 응답.status_code == 202
    assert 응답.json()["data"]["status"] == "accepted"


async def test_로그에_남을_때_개인정보를_지운다(client, caplog):
    with caplog.at_level(logging.WARNING, logger="daymo.client"):
        응답 = await client.post(
            "/v1/client-errors",
            json={
                "platform": "ios",
                "appVersion": "0.1.0",
                "kind": "api",
                "name": "DaymoApiError",
                "message": "sky@example.test 로 https://www.daymo.xyz/invite?token=ABCdef123 를 열었다",
                "where": "우리/내 프로필",
            },
        )

    assert 응답.status_code == 202
    남은_것 = "\n".join(기록.getMessage() for 기록 in caplog.records)
    assert "example.test" not in 남은_것
    assert "ABCdef123" not in 남은_것
    # 어디서 무엇이 났는지는 남아야 고칠 수 있다.
    assert "우리/내 프로필" in 남은_것
    assert "DaymoApiError" in 남은_것


async def test_모르는_칸은_거절한다(client):
    """앱이 실수로 본문을 더 담아 보내는 길을 열어 두지 않는다."""
    응답 = await client.post(
        "/v1/client-errors",
        json={"platform": "ios", "memo": "제주 3일차 숙소 바꿨어"},
    )
    assert 응답.status_code == 422


async def test_너무_긴_것은_거절한다(client):
    응답 = await client.post("/v1/client-errors", json={"message": "가" * 501})
    assert 응답.status_code == 422


async def test_한도를_넘으면_버리지만_같은_응답을_준다(client, caplog):
    with caplog.at_level(logging.WARNING, logger="daymo.client"):
        for _ in range(client_errors.분당_한도 + 5):
            응답 = await client.post("/v1/client-errors", json={"name": "TypeError"})
            assert 응답.status_code == 202

    assert len(caplog.records) == client_errors.분당_한도


async def test_DSN_이_없으면_아무_데도_보내지_않는다():
    """기본은 꺼짐이다. 시험 환경에는 DSN 이 없다."""
    from app.core.observability import error_tracking_enabled

    assert error_tracking_enabled() is False
