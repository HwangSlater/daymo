"""
오류 이벤트에서 개인정보를 거르는 부분.

여기가 뚫리면 이메일과 초대 링크가 바깥 회사로 나간다. 기능이 아니라 방어라서
"이런 것도 지운다" 를 하나씩 못박아 둔다.
"""

from types import SimpleNamespace

import pytest

from app.core import observability as obs
from app.core.observability import scrub_breadcrumb, scrub_event, scrub_text


def test_이메일을_지운다():
    assert "@" not in scrub_text("하늘(sky.trip+2@example.test) 가 실패")
    assert "[이메일 지움]" in scrub_text("no-reply@daymo.xyz 로 보냈다")


def test_토큰을_지운다():
    지운_것 = scrub_text("Authorization: Bearer abc.def.ghi 로 불렀다")
    assert "abc.def.ghi" not in 지운_것

    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiLtlZjriJgifQ.c2lnbmF0dXJl"
    assert jwt not in scrub_text(f"id_token={jwt}")

    assert "s3cr3t" not in scrub_text("password=s3cr3t")
    assert "코드값" not in scrub_text("code: 코드값")


def test_초대_링크의_물음표_뒤를_지운다():
    지운_것 = scrub_text("https://www.daymo.xyz/invite?token=ABCdef123 를 눌렀다")
    assert "ABCdef123" not in 지운_것
    assert "https://www.daymo.xyz/invite" in 지운_것


def test_긴_임의_문자열을_지운다():
    초대_토큰 = "Zx9pQw2rTy8uIo1aSd4fGh7jKl0zXcVbNmQwErTyUi"
    assert 초대_토큰 not in scrub_text(f"초대 {초대_토큰} 가 없다")


def test_사진_파일_이름을_지운다():
    assert "IMG_0001" not in scrub_text("IMG_0001.HEIC 를 저장하지 못했다")
    assert "제주 첫날" not in scrub_text("제주 첫날.jpg 가 너무 크다")


def test_UUID_는_남긴다():
    """어느 줄에서 났는지 찾을 실마리다. 그 자체로 사람을 가리키지 않는다."""
    trip_id = "550e8400-e29b-41d4-a716-446655440000"
    assert trip_id in scrub_text(f"trip {trip_id} 를 찾지 못했다")


def test_사람과_본문과_쿠키를_통째로_뺀다():
    event = {
        "user": {"id": "1", "email": "하늘@example.test", "ip_address": "203.0.113.9"},
        "request": {
            "url": "https://api.daymo.xyz/v1/invites/accept?token=ABCdef123",
            "query_string": "token=ABCdef123",
            "data": {"body": "제주 3일차 숙소 바꿨어", "photo": "IMG_0001.jpg"},
            "cookies": {"session": "abc"},
            "env": {"REMOTE_ADDR": "203.0.113.9"},
            "headers": {
                "Authorization": "Bearer abc.def.ghi",
                "Cookie": "a=b",
                "X-Request-Id": "550e8400-e29b-41d4-a716-446655440000",
                "User-Agent": "Daymo/0.1.0",
            },
        },
    }

    거른_것 = scrub_event(event)

    assert "user" not in 거른_것
    request = 거른_것["request"]
    assert "data" not in request
    assert "cookies" not in request
    assert "env" not in request
    assert "query_string" not in request
    assert request["url"] == "https://api.daymo.xyz/v1/invites/accept"
    assert set(request["headers"]) == {"X-Request-Id", "User-Agent"}
    # 통째로 남은 글자에도 이메일·주소가 없다.
    assert "example.test" not in str(거른_것)
    assert "제주" not in str(거른_것)


def test_중첩된_값_안의_글자도_훑는다():
    event = {
        "exception": {
            "values": [
                {
                    "type": "ValueError",
                    "value": "하늘@example.test 의 초대가 없다",
                    "stacktrace": {"frames": [{"vars": {"email": "sky@example.test"}}]},
                }
            ]
        }
    }

    거른_것 = scrub_event(event)

    assert "example.test" not in str(거른_것)
    # 종류와 자리는 남아야 고칠 수 있다.
    assert 거른_것["exception"]["values"][0]["type"] == "ValueError"


def test_빵부스러기도_같은_선으로_거른다():
    crumb = scrub_breadcrumb({"message": "SELECT ... WHERE email = '하늘@example.test'"})
    assert "example.test" not in crumb["message"]


def test_너무_깊은_것은_버린다():
    깊은_것: dict = {"a": "sky@example.test"}
    for _ in range(12):
        깊은_것 = {"a": 깊은_것}

    assert "example.test" not in str(scrub_event(깊은_것))


def test_DSN_이_없으면_켜지지_않는다():
    """기본은 꺼짐이다. 값이 없거나 공백뿐이면 sentry_sdk 를 들이지도 않는다."""
    for 빈_값 in ("", "   ", None):
        assert obs.init_error_tracking(SimpleNamespace(sentry_dsn=빈_값, app_env="test")) is False
        assert obs.error_tracking_enabled() is False


@pytest.fixture
def 가짜_sentry():
    """
    진짜 DSN 없이 보내는 길을 시험한다.

    transport 를 바꿔 이벤트를 밖으로 보내지 않고 목록에 담는다. 끝나면 클라이언트를
    비워 다른 시험에 남지 않게 한다.
    """
    import sentry_sdk
    from sentry_sdk.transport import Transport

    잡은_것: list[dict] = []

    class 담아_두는_transport(Transport):
        def capture_envelope(self, envelope) -> None:
            for 조각 in envelope.items:
                if 조각.headers.get("type") == "event":
                    잡은_것.append(조각.payload.json)

        def flush(self, timeout, callback=None) -> None:
            pass

        def kill(self) -> None:
            pass

    원래 = sentry_sdk.init

    def 가짜_init(**kwargs):
        kwargs["transport"] = 담아_두는_transport(kwargs)
        return 원래(**kwargs)

    sentry_sdk.init = 가짜_init
    try:
        obs.init_error_tracking(
            SimpleNamespace(sentry_dsn="https://key@o0.ingest.sentry.io/1", app_env="test")
        )
        yield 잡은_것
    finally:
        sentry_sdk.init = 원래
        obs._켜졌나 = False
        sentry_sdk.init(dsn=None)


def test_보내는_이벤트에도_개인정보가_없다(가짜_sentry):
    import sentry_sdk

    assert obs.error_tracking_enabled() is True

    obs.capture_client_error(
        platform="web",
        app_version="0.1.0",
        kind="crash",
        name="TypeError",
        message="sky@example.test 가 실패",
        where="우리/내 프로필",
    )
    try:
        raise ValueError("하늘@example.test 의 초대 https://daymo.xyz/i?token=ABCdef1234567890")
    except ValueError as exc:
        obs.capture_error(exc)

    sentry_sdk.flush(timeout=2)

    assert len(가짜_sentry) == 2
    for event in 가짜_sentry:
        보낸_것 = str(event)
        assert "example.test" not in 보낸_것
        assert "ABCdef1234567890" not in 보낸_것
        # send_default_pii=False 라 사람 정보가 아예 붙지 않는다.
        assert "user" not in event

    # 앱에서 온 것은 어느 판·어느 화면인지가 남는다.
    assert 가짜_sentry[0]["tags"]["source"] == "app"
    assert 가짜_sentry[0]["contexts"]["app"]["where"] == "우리/내 프로필"
    # 서버 예외는 종류가 남아야 고칠 자리를 안다.
    assert 가짜_sentry[1]["exception"]["values"][0]["type"] == "ValueError"
