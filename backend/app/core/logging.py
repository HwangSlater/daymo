import json
import logging
import sys
from typing import Any

from app.core.context import get_request_id


class JsonFormatter(logging.Formatter):
    """
    로그 한 줄을 JSON 하나로 찍는다.

    사람이 읽기에는 평문이 낫지만, 남는 것은 VPS 의 파일뿐이고 찾는 수단은
    `grep` 과 `jq` 다. 줄마다 모양이 다르면 셀 수가 없다.

    2GB 서버라 Loki 나 ELK 를 올리지 않는다. 미니PC 로 옮긴 뒤에 다시 본다
    (docs/development/06-vps-deployment.md 9장).
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "at": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = get_request_id()
        if request_id:
            payload["requestId"] = request_id
        # 미들웨어가 붙이는 값들. 없으면 넣지 않는다.
        for key in ("method", "endpoint", "status", "durationMs", "actor"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> None:
    """
    stdout 으로만 내보낸다.

    파일 경로를 앱이 정하지 않는다. 컨테이너가 stdout 을 받아 rotate 하게
    두면 로그 위치와 보관 기간이 배포 설정 한 곳에서 정해진다.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # uvicorn 이 자기 형식으로 따로 찍는 것을 막는다. 같은 요청이 두 줄로
    # 나오고 한 줄만 JSON 이면 세기가 어려워진다.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers = []
        logger.propagate = True
    logging.getLogger("uvicorn.access").disabled = True
