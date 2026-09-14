import asyncio
import sys


def use_selector_event_loop_on_windows() -> None:
    """
    윈도우에서 이벤트 루프를 Selector 쪽으로 바꾼다.

    파이썬 3.8부터 윈도우 기본값이 ProactorEventLoop 인데 psycopg 비동기가
    그 위에서 동작하지 않는다. 운영 서버는 리눅스라 아무 일도 하지 않지만,
    개발은 윈도우에서 하므로 이것이 없으면 DB 를 건드리는 순간 전부 실패한다.

    루프가 만들어지기 전에 불러야 한다. 이미 도는 루프는 바뀌지 않는다.
    """
    if sys.platform != "win32":
        return
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
