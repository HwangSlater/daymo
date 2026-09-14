from app.core.config import Settings


def test_접속_URL을_조각에서_조립한다():
    settings = Settings(db_host="db", db_port=5433, db_name="daymo", db_username="daymo", db_password="비밀")

    assert settings.database_url == "postgresql+psycopg://daymo:%EB%B9%84%EB%B0%80@db:5433/daymo"


def test_비밀번호가_없으면_붙이지_않는다():
    # 호스트를 직접 준다. 환경 변수가 있는 자리(CI)에서는 기본값이 덮여서,
    # 값을 주지 않으면 이 테스트가 환경에 따라 다른 것을 보게 된다.
    settings = Settings(db_host="db.example", db_name="daymo", db_password="")

    assert "@db.example:5432/daymo" in settings.database_url
    assert ":@" not in settings.database_url


def test_기본_호스트는_localhost가_아니다():
    """
    윈도우는 localhost 를 ::1 로 먼저 풀어서, 연결이 실패하지 않고 멈춘다.

    `Settings()` 를 만들어 보지 않고 선언된 기본값을 직접 본다. 환경 변수가
    있으면 그것이 이겨서, 만들어 본 값으로는 기본값을 시험할 수 없다.
    """
    assert Settings.model_fields["db_host"].default == "127.0.0.1"


def test_특수문자가_든_비밀번호를_escape한다():
    """@ 나 / 가 든 비밀번호를 그대로 넣으면 URL 이 다른 호스트를 가리킨다."""
    settings = Settings(db_password="a@b/c")

    assert "a%40b%2Fc" in settings.database_url
    assert settings.database_url.count("@") == 1


def test_운영에서는_문서_경로를_열지_않는다():
    운영 = Settings(
        app_env="production", jwt_signing_key="키1" + "a" * 40, refresh_token_pepper="키2" + "b" * 40, db_password="x"
    )
    베타 = Settings(
        app_env="beta", jwt_signing_key="키1" + "a" * 40, refresh_token_pepper="키2" + "b" * 40, db_password="x"
    )

    assert 운영.docs_enabled is False
    assert Settings(app_env="local").docs_enabled is True
    # 베타는 연다. 앱의 typed client 를 만들 때 스키마가 필요하다.
    assert 베타.docs_enabled is True
