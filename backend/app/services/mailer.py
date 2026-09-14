import logging
from dataclasses import dataclass, field

from app.core.config import get_settings

logger = logging.getLogger("daymo.mail")

# 메일은 중계 서비스(Resend)로 보낸다. 가정용·클라우드 IP 에서 직접 SMTP 로
# 발송하면 차단되거나 스팸으로 분류된다
# (docs/development/06-vps-deployment.md 2장).
#
# **아직 키가 없어서 실제로 보내지 않는다.** 지금은 보낼 내용을 모아 두기만
# 한다. 키가 생기면 `send` 안쪽만 갈아 끼우면 되고 부르는 쪽은 그대로다.


@dataclass
class Letter:
    to: str
    subject: str
    # 링크에 실리는 1회용 토큰 원문. 저장하지 않는다.
    link: str


@dataclass
class Outbox:
    """
    보낼 메일을 모아 두는 곳.

    로컬과 테스트에서만 내용을 들고 있는다. 메일함을 볼 수 없는 자리에서
    가입과 재설정 흐름을 끝까지 돌려 보려면 링크를 어딘가에서 꺼내야 한다.
    """

    letters: list[Letter] = field(default_factory=list)

    def send(self, letter: Letter) -> None:
        환경 = get_settings().app_env

        if 환경 in ("local", "test"):
            self.letters.append(letter)
            # 링크에는 1회용 토큰 원문이 들어 있다. 운영 로그에 남으면
            # 로그를 읽을 수 있는 사람이 남의 계정을 가져갈 수 있으므로
            # 여기서만 찍는다.
            logger.info("mail(개발용): %s → %s", letter.subject, letter.link)
            return

        # 운영에서는 아직 보낼 수단이 없다. 조용히 삼키면 사용자가 오지 않는
        # 메일을 기다리게 되므로 크게 남긴다.
        logger.error(
            "메일 발송 수단이 아직 없다. 보내지 못했다: subject=%s", letter.subject
        )

    def clear(self) -> None:
        self.letters.clear()

    @property
    def last(self) -> Letter | None:
        return self.letters[-1] if self.letters else None


_outbox = Outbox()


def get_outbox() -> Outbox:
    return _outbox
