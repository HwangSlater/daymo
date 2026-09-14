"""
로컬 개발 서버.

`uvicorn app.main:app` 을 직접 부르지 않고 이 파일을 거치는 이유는 하나다.
윈도우에서 uvicorn 은 이벤트 루프를 만든 **뒤에** 앱을 import 하므로, 앱
안에서 루프 정책을 바꿔도 이미 늦다. psycopg 비동기는 윈도우 기본
ProactorEventLoop 위에서 동작하지 않아 DB 를 건드리는 순간 전부 실패한다.
그래서 루프가 만들어지기 전인 여기서 정책을 바꾼다.

리눅스에서는 아무 일도 하지 않으므로 운영 배포는 계속 uvicorn 을 직접 부른다.
"""

from app.core.runtime import use_selector_event_loop_on_windows

use_selector_event_loop_on_windows()

import uvicorn  # noqa: E402


def main() -> None:
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
