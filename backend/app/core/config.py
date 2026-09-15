from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AppEnv = Literal["local", "test", "beta", "production"]

# HS256 서명 키의 최소 길이. RFC 7518 3.2 가 해시 출력 크기(32바이트) 이상을
# 요구한다. 짧으면 그만큼 서명이 약해진다.
MIN_SECRET_BYTES = 32


class Settings(BaseSettings):
    """
    환경 변수로 받는 설정.

    DB 접속 URL을 통째로 받지 않고 조각으로 받아 여기서 조립한다. 비밀번호가
    들어간 완성 URL이 저장소나 로그, 오류 메시지에 그대로 실리는 일을 막기
    위해서다(docs/development/11-owner-setup-guide.md 6장).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: AppEnv = "local"

    # "localhost" 가 아니라 127.0.0.1 이다. 윈도우는 localhost 를 ::1 로 먼저
    # 풀고 개발용 컨테이너는 IPv4 에만 바인딩돼 있어서, localhost 로 두면
    # 연결이 실패하지 않고 그대로 멈춰 버린다. 원인을 찾기 어려운 종류다.
    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_name: str = "daymo"
    db_username: str = "daymo"
    db_password: str = ""

    # 워커 하나 기준. 워커 2개이므로 API가 쓰는 커넥션은 최대 20개이고
    # PostgreSQL max_connections = 30 아래다(docs/development/06-vps-deployment.md 3장).
    db_pool_size: int = 5
    db_max_overflow: int = 5

    jwt_signing_key: str = ""
    refresh_token_pepper: str = ""

    smtp_host: str = "smtp.resend.com"
    smtp_port: int = 587
    smtp_username: str = "resend"
    smtp_password: str = ""
    smtp_starttls: bool = True
    mail_from: str = "Daymo <no-reply@daymo.xyz>"
    # 메일 속 링크가 여는 페이지의 주소. API 서버가 직접 보여 준다(app/api/auth_pages.py).
    auth_link_base: str = "https://api.daymo.xyz"

    @property
    def database_url(self) -> str:
        from urllib.parse import quote

        auth = quote(self.db_username, safe="")
        if self.db_password:
            auth = f"{auth}:{quote(self.db_password, safe='')}"
        return f"postgresql+psycopg://{auth}@{self.db_host}:{self.db_port}/{self.db_name}"

    @model_validator(mode="after")
    def _운영에서는_시크릿이_비어_있으면_안_된다(self) -> "Settings":
        """
        서명 키가 빈 문자열이면 누구나 토큰을 위조할 수 있다.

        조용히 빈 값으로 뜨는 것이 가장 위험하다. 로컬과 테스트는 통과시키고
        실제 사용자가 들어오는 환경에서만 막는다.
        """
        if self.app_env not in ("beta", "production"):
            return self
        빈_것 = [
            이름
            for 이름, 값 in (
                ("JWT_SIGNING_KEY", self.jwt_signing_key),
                ("REFRESH_TOKEN_PEPPER", self.refresh_token_pepper),
                ("DB_PASSWORD", self.db_password),
            )
            if not 값
        ]
        if 빈_것:
            raise ValueError(
                f"APP_ENV={self.app_env} 에서는 다음 값이 비어 있으면 안 된다: {', '.join(빈_것)}"
            )

        # 비어 있지 않은 것만으로는 부족하다. HS256 서명 키가 해시 출력보다
        # 짧으면 그만큼 약해진다(RFC 7518 3.2 는 32바이트 이상을 요구한다).
        # 사람이 손으로 적은 짧은 값이 그대로 운영에 올라가는 것을 막는다.
        짧은_것 = [
            이름
            for 이름, 값 in (
                ("JWT_SIGNING_KEY", self.jwt_signing_key),
                ("REFRESH_TOKEN_PEPPER", self.refresh_token_pepper),
            )
            if len(값.encode()) < MIN_SECRET_BYTES
        ]
        if 짧은_것:
            raise ValueError(
                f"다음 값이 {MIN_SECRET_BYTES}바이트보다 짧다: {', '.join(짧은_것)}. "
                'python -c "import secrets; print(secrets.token_urlsafe(64))" 로 만들어라.'
            )

        if self.jwt_signing_key == self.refresh_token_pepper:
            raise ValueError("JWT_SIGNING_KEY 와 REFRESH_TOKEN_PEPPER 는 서로 달라야 한다.")
        return self

    @property
    def docs_enabled(self) -> bool:
        """
        FastAPI가 자동으로 만드는 문서 경로를 열지 말지.

        운영에서는 열지 않는다. 전체 endpoint와 요청·응답 스키마를 그대로
        보여 주는 것은 공격자에게 지도를 주는 일이고, 앱의 typed client는
        CI에서 만든 OpenAPI 산출물로 생성하므로 운영 서버가 이 경로를 열어
        둘 이유가 없다(docs/development/06-vps-deployment.md 2장).
        """
        return self.app_env in ("local", "test", "beta")


@lru_cache
def get_settings() -> Settings:
    return Settings()
