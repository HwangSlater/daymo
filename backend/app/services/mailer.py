import asyncio
import logging
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage

from app.core.config import get_settings
from app.services.mail_template import 편지_html, 편지_글

logger = logging.getLogger("daymo.mail")

# 메일은 중계 서비스(Resend)로 보낸다. 가정용·클라우드 IP 에서 직접 SMTP 로
# 발송하면 차단되거나 스팸으로 분류된다
# (docs/development/06-vps-deployment.md 2장).

# 운영자가 받는 주소. Cloudflare Email Routing 이 Daymo 전용 메일함으로 넘긴다.
# 작업 실패 알림과 신고 알림이 여기로 간다.
OPERATOR_ADDRESS = "support@daymo.xyz"

@dataclass
class Letter:
    to: str
    subject: str
    # 링크에 실리는 1회용 토큰 원문. 저장하지 않는다. 알리기만 하는 메일은
    # 링크가 없다.
    link: str | None = None
    # 링크 위에 붙는 설명. 비어 있으면 제목만 쓴다.
    body: str | None = None
    # 단추에 적는 말. 링크가 있는 메일만 쓴다. 무엇을 하는지 한눈에 보이는 말을
    # 보내는 자리에서 준다.
    action: str = "열어서 확인하기"


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
        # 글 판을 먼저 담고 그림 판을 덧붙인다. 순서가 뜻을 가진다 — 메일 앱은
        # 마지막 판을 먼저 고르고, 못 읽으면 앞의 것으로 내려온다. 답장할 곳이
        # 없다는 것과 문의처는 두 판 모두 꼬리에 한 번씩 적는다.
        message.set_content(편지_글(letter.subject, letter.body, letter.link, OPERATOR_ADDRESS))
        message.add_alternative(
            편지_html(letter.subject, letter.body, letter.link, OPERATOR_ADDRESS, letter.action),
            subtype="html",
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
