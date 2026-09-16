"""
오류 수집.

`SENTRY_DSN` 이 비어 있으면 **아무 일도 하지 않는다**. import 도 하지 않고 이벤트도
만들지 않는다. 운영자가 값을 넣으면 그때부터 켜진다. 기본은 꺼짐이다.

보내는 것은 오류 하나를 고치는 데 필요한 최소한이다. 서버 로그를 요청 id·actor
hash·endpoint·status·지연으로 제한해 둔 것과 같은 선을 여기에도 긋는다
(docs/development/05-quality-and-operations.md 5장). 그래서 이벤트가 나가기 전에
`scrub_event` 가 한 번 훑고 지운다.

지우는 것
  - 사람: `user`(이메일·이름·IP·계정 id) 통째로.
  - 요청 본문: `request.data` 통째로. 여행·메모·일기·사진 설명이 여기 실린다.
  - 요청 주소의 물음표 뒤: `?token=...` 같은 것이 초대 링크와 확인 링크다.
  - 헤더: 정해 둔 몇 개(`X-Request-Id`·`User-Agent`·`Content-Type`)만 남기고 버린다.
  - 쿠키와 환경값(`REMOTE_ADDR` 등).
  - 글자 안에 섞인 이메일·`Bearer` 토큰·JWT·초대 주소·32자 이상의 임의 문자열.

남기는 것
  - 예외 종류와 자리(파일·줄·함수), endpoint 틀(`/v1/trips/{trip_id}`), 상태 코드,
    요청 id, UUID. UUID 는 어느 줄에서 났는지 찾는 유일한 실마리라 남긴다. 그 자체로는
    사람을 가리키지 않는다.
"""

import logging
import re
from typing import Any

logger = logging.getLogger("daymo")

# main.py 의 FastAPI(version=...) 과 같아야 한다. 어느 판에서 난 오류인지 세는 값이다.
APP_VERSION = "0.1.0"

지움 = "[지움]"

# 헤더는 지울 것을 고르지 않고 남길 것을 고른다. 새 헤더가 생겼을 때 기본이
# "보낸다" 이면 언젠가 한 번은 새는 쪽으로 틀린다.
남기는_헤더 = frozenset({"x-request-id", "user-agent", "content-type", "content-length"})

_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"

_규칙: tuple[tuple[re.Pattern[str], str], ...] = (
    # 이메일. 오류 메시지나 SQL 문에 그대로 실릴 수 있다.
    (re.compile(r"[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+"), "[이메일 지움]"),
    # Authorization 헤더 값과 그 비슷한 것.
    (re.compile(r"(?i)\bbearer\s+\S+"), "Bearer [지움]"),
    # JWT. access token 과 소셜 로그인의 id_token.
    (re.compile(r"\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*"), "[토큰 지움]"),
    # 초대·확인 링크. 물음표 뒤에 token 이 붙어 오고, 그 값이 곧 초대장이다.
    (re.compile(r"(?i)(https?://\S+?)\?\S*"), r"\1?[지움]"),
    # key=value 로 적힌 비밀값.
    (
        re.compile(r"(?i)\b(token|code|proof|secret|password|pepper|dsn|signature)\s*[=:]\s*\S+"),
        r"\1=[지움]",
    ),
    # 사진 파일 이름. 확장자가 붙은 것은 이름째로 뺀다.
    (
        re.compile(r"(?i)(?<![\w가-힣.-])[\w가-힣 .-]{1,80}\.(?:jpe?g|png|heic|heif|webp|gif|mov|mp4)\b"),
        "[파일 지움]",
    ),
    # 그 밖의 긴 임의 문자열. 초대 토큰(token_urlsafe)·해시·base64 가 여기 걸린다.
    # UUID 는 남겨야 해서 먼저 빼 둔다.
    (re.compile(rf"(?<![\w-])(?!{_UUID})[A-Za-z0-9_-]{{32,}}(?![\w-])"), "[값 지움]"),
)


def scrub_text(값: str) -> str:
    """글자 하나에서 사람을 가리키는 것과 비밀값을 지운다."""
    for 규칙, 바꿀_것 in _규칙:
        값 = 규칙.sub(바꿀_것, 값)
    return 값


def _훑는다(값: Any, 깊이: int = 0) -> Any:
    """중첩된 dict·list 안의 모든 글자에 `scrub_text` 를 건다."""
    # 너무 깊이 파고들면 이벤트 하나에 시간을 다 쓴다. 이 정도면 Sentry 의 이벤트
    # 모양(exception.values[].stacktrace.frames[].vars)을 다 덮는다.
    if 깊이 > 8:
        return 지움
    if isinstance(값, str):
        return scrub_text(값)
    if isinstance(값, dict):
        return {키: _훑는다(안, 깊이 + 1) for 키, 안 in 값.items()}
    if isinstance(값, (list, tuple)):
        return [_훑는다(안, 깊이 + 1) for 안 in 값]
    return 값


def scrub_event(event: dict, hint: Any = None) -> dict | None:
    """
    이벤트가 나가기 전에 거른다. `sentry_sdk.init(before_send=...)` 에 그대로 넣는다.

    `None` 을 돌려주면 그 이벤트는 보내지 않는다. 지금은 버리는 종류가 없어서
    항상 이벤트를 돌려주지만, 자리는 남겨 둔다.
    """
    # 사람은 통째로 뺀다. 누가 겪었는지는 요청 id 와 actor hash 로 서버 로그에서 잇는다.
    event.pop("user", None)

    request = event.get("request")
    if isinstance(request, dict):
        # 본문에 여행·메모·일기·사진 설명이 실린다. 한 줄도 보내지 않는다.
        request.pop("data", None)
        request.pop("cookies", None)
        # env 에는 REMOTE_ADDR 처럼 접속한 곳이 들어간다.
        request.pop("env", None)
        # 물음표 뒤가 초대 링크와 확인 링크의 알맹이다.
        request.pop("query_string", None)
        주소 = request.get("url")
        if isinstance(주소, str):
            request["url"] = 주소.split("?", 1)[0]
        헤더 = request.get("headers")
        if isinstance(헤더, dict):
            request["headers"] = {
                이름: 값 for 이름, 값 in 헤더.items() if 이름.lower() in 남기는_헤더
            }

    return _훑는다(event)


def scrub_breadcrumb(crumb: dict, hint: Any = None) -> dict | None:
    """
    빵부스러기(직전에 일어난 일)도 같은 선으로 거른다.

    SQL 한 줄과 로그 한 줄이 여기로 들어온다. 값이 묶음 변수로 나가서 본문이 실리는
    일은 드물지만, 드물다는 것은 언젠가 실린다는 뜻이다.
    """
    return _훑는다(crumb)


_켜졌나 = False


def error_tracking_enabled() -> bool:
    return _켜졌나


def init_error_tracking(settings) -> bool:
    """
    DSN 이 있으면 Sentry 를 켠다. 없으면 아무것도 하지 않고 `False` 를 돌려준다.

    한 프로세스에서 여러 번 불려도 된다(시험이 `create_app()` 을 여러 번 부른다).
    """
    global _켜졌나

    dsn = (getattr(settings, "sentry_dsn", "") or "").strip()
    if not dsn:
        _켜졌나 = False
        return False

    # DSN 이 있을 때만 들인다. 꺼져 있을 때는 이 묶음이 아예 불러와지지 않는다.
    import sentry_sdk
    from sentry_sdk.integrations.logging import LoggingIntegration

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.app_env,
        release=f"daymo-backend@{APP_VERSION}",
        # 이 한 줄이 IP·쿠키·요청 본문을 붙이지 않게 하는 스위치다. 아래 before_send 와
        # 겹쳐서 두 번 막는다. 한쪽이 판올림으로 바뀌어도 다른 쪽이 남는다.
        send_default_pii=False,
        max_request_body_size="never",
        # 성능 추적은 켜지 않는다. 2GB 서버에 얹을 것이 아니고, 무엇보다 모든 요청이
        # 이벤트가 되면 거를 것이 그만큼 늘어난다.
        traces_sample_rate=0.0,
        before_send=scrub_event,
        before_breadcrumb=scrub_breadcrumb,
        # 로그 한 줄이 그대로 이벤트가 되면 같은 오류가 두세 번 올라간다. 로그는
        # 빵부스러기로만 쓰고, 이벤트는 main.py 가 한 번만 만든다.
        integrations=[LoggingIntegration(level=logging.INFO, event_level=None)],
        default_integrations=True,
    )
    _켜졌나 = True
    logger.info("error tracking enabled environment=%s", settings.app_env)
    return True


def capture_error(exc: BaseException) -> None:
    """예상 못 한 예외 하나를 보낸다. 꺼져 있으면 아무 일도 하지 않는다."""
    if not _켜졌나:
        return
    import sentry_sdk

    sentry_sdk.capture_exception(exc)


def capture_client_error(
    *, platform: str, app_version: str, kind: str, name: str, message: str, where: str
) -> None:
    """
    앱이 보낸 오류 한 줄을 보낸다. 꺼져 있으면 아무 일도 하지 않는다.

    앱에는 Sentry SDK 를 넣지 않았다. 앱은 거른 한 줄을 서버로 보내고, 그것을 서버가
    여기서 한 번 더 거른 뒤 올린다(docs/development/05-quality-and-operations.md 5장).
    """
    if not _켜졌나:
        return
    import sentry_sdk

    with sentry_sdk.new_scope() as scope:
        scope.set_tag("source", "app")
        scope.set_tag("app.platform", platform)
        scope.set_tag("app.version", app_version)
        scope.set_tag("app.kind", kind)
        scope.set_context("app", {"where": where})
        sentry_sdk.capture_message(f"{name}: {message}", level="error")
