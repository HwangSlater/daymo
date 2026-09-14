from contextvars import ContextVar
from uuid import UUID, uuid4

# 요청 하나를 가로지르는 값. 오류 응답 본문과 로그에 같은 id 가 찍혀야
# 사용자가 알려 준 id 로 로그를 찾을 수 있다.
_request_id: ContextVar[str] = ContextVar("request_id", default="")


def new_request_id() -> str:
    return str(uuid4())


def set_request_id(value: str) -> None:
    _request_id.set(value)


def get_request_id() -> str:
    return _request_id.get()


def sanitize_request_id(value: str | None) -> str:
    """
    바깥에서 받은 request id 를 그대로 믿지 않는다.

    이 값은 응답 헤더로 되돌아가고 로그에도 찍힌다. 검증 없이 받으면 개행을
    넣어 로그를 조작하거나, 헤더에 임의의 내용을 실어 보내거나, 아주 긴
    문자열로 로그를 부풀릴 수 있다. UUID 모양일 때만 쓰고 아니면 새로 만든다.
    """
    if not value:
        return new_request_id()
    try:
        return str(UUID(value))
    except ValueError:
        return new_request_id()
