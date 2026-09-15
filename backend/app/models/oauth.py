import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, uuid_pk
from app.models.enums import OAuthProvider, enum_column

# 소셜 로그인이 오가는 동안만 쓰는 표 둘. 로그인이 끝나면 쓸모가 없고, 정리
# 작업이 기한이 지난 줄을 지운다(app/services/oauth/flow.py 의 purge_expired).
#
# 흐름은 이렇다(docs/development/03-api-specification.md 2장).
#
#   앱 ──start──▶ 서버 ──302──▶ 제공자 로그인 ──callback──▶ 서버 ──302──▶ 앱(loginCode)
#   앱 ──exchange(loginCode + code_verifier)──▶ 서버 ──▶ 세션
#
# 토큰을 주소에 싣지 않는다. 주소는 브라우저 기록·로그·다른 앱에 새기 쉽다.
# 주소에는 1분짜리 1회용 loginCode 만 싣고, 그것도 앱이 처음에 만든 PKCE
# 비밀(code_verifier)이 없으면 쓸 수 없다.


class OAuthState(Base, TimestampMixin):
    """
    로그인 창을 하나 열 때마다 생기는 줄.

    제공자에게 넘기는 `state` 의 해시로 찾는다. callback 이 이 줄 없이 오면
    우리가 시작한 로그인이 아니다. 남이 자기 계정으로 받은 code 를 내 브라우저에
    밀어 넣어 내가 그 사람 계정으로 로그인하게 만드는 것(login CSRF)을 막는다.
    """

    __tablename__ = "oauth_states"
    __table_args__ = (
        Index("uq_oauth_states_hash", "state_hash", unique=True),
        Index("ix_oauth_states_expires", "expires_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    provider: Mapped[OAuthProvider] = mapped_column(enum_column(OAuthProvider), nullable=False)
    state_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    # OIDC 제공자(Google·Apple)의 id_token 에 되돌아와야 하는 값. 다른 로그인에서
    # 받은 id_token 을 끼워 넣는 것을 막는다. 제공자에게 원문으로 넘기는 값이라
    # 해시하지 않는다.
    nonce: Mapped[str] = mapped_column(String(64), nullable=False)
    # 로그인이 끝나면 돌아갈 앱 주소. 설정의 허용 목록에 있는 것만 들어온다.
    app_redirect_uri: Mapped[str] = mapped_column(String(200), nullable=False)
    # 앱이 만든 state. 우리는 검사하지 않고 그대로 돌려준다. 앱이 자기가 연
    # 로그인 창에서 돌아온 것인지 확인하는 데 쓴다.
    app_state: Mapped[str] = mapped_column(String(128), nullable=False)
    # 앱이 만든 PKCE code_challenge(S256). exchange 때 code_verifier 로 맞춰 본다.
    code_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<OAuthState {self.id}>"


class OAuthPendingLogin(Base, TimestampMixin):
    """
    제공자가 누구인지 확인해 준 뒤, 앱이 세션으로 바꾸기 전까지의 줄.

    계정을 callback 에서 만들지 않고 exchange 에서 만든다. callback 은 브라우저가
    부르는 주소라 누가 불렀는지 알 수 없고, exchange 는 PKCE 비밀을 가진 앱만
    부를 수 있다.

    같은 이메일의 계정이 이미 있으면 여기서 멈추고 연결 토큰을 발급한다. 그
    계정의 비밀번호로 다시 확인해야 제공자를 붙인다. 이메일이 같다고 자동으로
    합치면, 남의 이메일로 제공자 계정을 만든 사람이 남의 계정에 들어온다.
    """

    __tablename__ = "oauth_pending_logins"
    __table_args__ = (
        Index("uq_oauth_pending_logins_code", "code_hash", unique=True),
        Index(
            "uq_oauth_pending_logins_link",
            "link_token_hash",
            unique=True,
            postgresql_where="link_token_hash IS NOT NULL",
        ),
        Index("ix_oauth_pending_logins_expires", "expires_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    provider: Mapped[OAuthProvider] = mapped_column(enum_column(OAuthProvider), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    # 제공자가 준 이메일과 이름. 계정을 만들거나 연결할 때만 쓰고, 이 줄과 함께 지운다.
    provider_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_name: Mapped[str | None] = mapped_column(String(50), nullable=True)

    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    code_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    # loginCode 는 1분만 산다.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ACCOUNT_LINK_REQUIRED 를 돌려줄 때만 채운다.
    link_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    link_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - 디버깅용
        return f"<OAuthPendingLogin {self.id}>"
