import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_session
from tests.test_api_trips import 로그인한_사람

pytestmark = pytest.mark.anyio


async def test_commit이_실패하면_앱은_200이_아니라_실패를_받는다(app, api, db):
    """
    요청 transaction 은 응답을 보내기 전에 끝난다(app/api/deps.py 의 SessionDepends).

    예전에는 응답을 보낸 뒤에 commit 해서, commit 이 실패해도 앱은 이미 200 을 받았다.
    """
    headers = await 로그인한_사람(api, "sky@example.com", "하늘")
    commit_ran = []

    async def 커밋에서_실패하는_세션():
        yield db
        commit_ran.append(True)
        raise RuntimeError("commit failed")

    app.dependency_overrides[get_session] = 커밋에서_실패하는_세션
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        응답 = await client.patch("/v1/me", json={"displayName": "바다"}, headers=headers)

    assert commit_ran == [True]
    assert 응답.status_code == 500


async def test_한_요청은_세션을_하나만_연다(app, api, db):
    """로그인한 사람을 찾는 자리와 handler 가 같은 세션을 써야 사용자 변경이 저장된다."""
    headers = await 로그인한_사람(api, "sky@example.com", "하늘")
    열린_수 = []

    async def 세는_세션():
        열린_수.append(True)
        yield db

    app.dependency_overrides[get_session] = 세는_세션
    응답 = await api.patch("/v1/me", json={"displayName": "바다"}, headers=headers)

    assert 응답.status_code == 200
    assert len(열린_수) == 1
