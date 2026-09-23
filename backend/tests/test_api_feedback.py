import pytest
from sqlalchemy import select

from app.models import Feedback, User
from app.services.feedback import FEEDBACK_PER_HOUR
from tests.test_api_trips import 로그인한_사람

pytestmark = pytest.mark.anyio


async def 보낸다(api, headers, **값):
    본문 = {"kind": "idea", "body": "사진 순서를 바꾸고 싶어요", "platform": "ios", "appVersion": "0.1.0", **값}
    return await api.post("/v1/feedback", json=본문, headers=headers)


async def test_의견을_보내면_보낸_사람과_기기가_함께_남는다(api, db):
    하늘 = await 로그인한_사람(api, "sky@example.com")

    응답 = await 보낸다(api, 하늘, body="  사진 순서를 바꾸고 싶어요  ")

    assert 응답.status_code == 201, 응답.text
    assert set(응답.json()["data"]) == {"id", "receivedAt"}
    [의견] = (await db.scalars(select(Feedback))).all()
    assert (의견.kind, 의견.body, 의견.platform, 의견.app_version) == ("idea", "사진 순서를 바꾸고 싶어요", "ios", "0.1.0")
    assert 의견.user_id == await db.scalar(select(User.id).where(User.email == "sky@example.com"))


async def test_로그인하지_않으면_보낼_수_없다(api):
    응답 = await 보낸다(api, {})
    assert 응답.status_code == 401


@pytest.mark.parametrize("값", [{"body": "   "}, {"body": ""}, {"kind": "spam"}, {"body": "가" * 2001}])
async def test_빈_글이나_모르는_종류는_받지_않는다(api, db, 값):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    응답 = await 보낸다(api, 하늘, **값)
    assert 응답.status_code == 422
    assert (await db.scalars(select(Feedback))).all() == []


async def test_한_시간에_너무_많이_보내면_막는다(api):
    하늘 = await 로그인한_사람(api, "sky@example.com")
    for _ in range(FEEDBACK_PER_HOUR):
        assert (await 보낸다(api, 하늘)).status_code == 201
    응답 = await 보낸다(api, 하늘)
    assert 응답.status_code == 429


async def test_받은_지_1년이_지난_의견은_정리_작업이_지운다(api, db):
    from datetime import UTC, datetime, timedelta

    from app.services.feedback import purge_expired

    하늘 = await 로그인한_사람(api, "sky@example.com")
    await 보낸다(api, 하늘, body="오래된 의견")
    await 보낸다(api, 하늘, body="새 의견")
    [오래된] = (await db.scalars(select(Feedback).where(Feedback.body == "오래된 의견"))).all()
    오래된.created_at = datetime.now(UTC) - timedelta(days=366)
    await db.commit()

    assert await purge_expired(db) == 1
    await db.commit()
    assert [의견.body for 의견 in (await db.scalars(select(Feedback))).all()] == ["새 의견"]
