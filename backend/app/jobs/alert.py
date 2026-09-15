"""
운영 작업이 실패했다고 메일로 알린다.

    python -m app.jobs.alert daymo-backup.service

systemd 의 `OnFailure=daymo-alert@%n.service` 가 부른다(backend/infra/production/
daymo-alert). 백업·정리·배포가 조용히 멈춰 있으면 며칠 뒤에야 알게 된다.

메일에는 어느 작업이 언제 실패했는지만 쓴다. 로그 본문은 넣지 않는다. 로그에는
요청한 사람의 해시나 오류 속 주소가 섞일 수 있고, 메일은 서버 밖으로 나간다.
"""

import asyncio
import re
import sys
from datetime import UTC, datetime

from app.core.logging import configure_logging
from app.services.mailer import OPERATOR_ADDRESS, Letter, get_outbox

ALERT_TO = OPERATOR_ADDRESS

# systemd 가 넘기는 unit 이름만 받는다. 제목에 아무 글자나 들어가지 않게 한다.
_UNIT = re.compile(r"^[A-Za-z0-9@._-]{1,80}$")


def letter_for(unit: str, now: datetime | None = None) -> Letter:
    if not _UNIT.match(unit):
        raise ValueError("unit 이름이 이상하다")
    지금 = (now or datetime.now(UTC)).strftime("%Y-%m-%d %H:%M UTC")
    return Letter(
        to=ALERT_TO,
        subject=f"[Daymo 운영] {unit} 실패",
        body=(
            f"{지금}에 {unit} 이 실패했어요.\n\n"
            f"서버에서 확인해 주세요: sudo journalctl -u {unit} -n 100 --no-pager"
        ),
    )


def main() -> int:
    configure_logging()
    if len(sys.argv) != 2:
        print("사용법: python -m app.jobs.alert <unit>", file=sys.stderr)
        return 2
    asyncio.run(get_outbox().send(letter_for(sys.argv[1])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
