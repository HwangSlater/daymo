import asyncio
import logging
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger("daymo.mail")

# 메일은 중계 서비스(Resend)로 보낸다. 가정용·클라우드 IP 에서 직접 SMTP 로
# 발송하면 차단되거나 스팸으로 분류된다
# (docs/development/06-vps-deployment.md 2장).
#
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

    async def send(self, letter: Letter) -> None:
        settings = get_settings()
        환경 = settings.app_env

        if 환경 in ("local", "test"):
            self.letters.append(letter)
            # 링크에는 1회용 토큰 원문이 들어 있다. 운영 로그에 남으면
            # 로그를 읽을 수 있는 사람이 남의 계정을 가져갈 수 있으므로
            # 여기서만 찍는다.
            logger.info("mail(개발용): %s → %s", letter.subject, letter.link)
            return

        if not settings.smtp_password:
            raise RuntimeError("운영 메일 설정이 비어 있다")

        await asyncio.to_thread(self._send_smtp, letter)

    @staticmethod
    def _send_smtp(letter: Letter) -> None:
        settings = get_settings()
        message = EmailMessage()
        message["From"] = settings.mail_from
        message["To"] = letter.to
        message["Subject"] = letter.subject
        message.set_content(
            f"{letter.subject}\n\n아래 링크는 30분 동안 한 번만 사용할 수 있어요.\n{letter.link}\n"
        )

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)

    def clear(self) -> None:
        self.letters.clear()

    @property
    def last(self) -> Letter | None:
        return self.letters[-1] if self.letters else None


_outbox = Outbox()


def get_outbox() -> Outbox:
    return _outbox
