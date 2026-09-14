import pytest
from pydantic import ValidationError

from app.core.config import Settings

# 실제 값처럼 보이지 않게 짧고 뻔한 문자열만 쓴다. 공개 저장소다.
키_하나 = "테스트용-키-1"
키_둘 = "테스트용-키-2"


@pytest.mark.parametrize("환경", ["beta", "production"])
def test_운영에서_서명키가_비면_뜨지_않는다(환경):
    """빈 서명 키로 조용히 뜨면 누구나 토큰을 위조할 수 있다."""
    with pytest.raises(ValidationError):
        Settings(app_env=환경, jwt_signing_key="", refresh_token_pepper=키_둘, db_password="x")


@pytest.mark.parametrize("환경", ["beta", "production"])
def test_운영에서_DB_비밀번호가_비면_뜨지_않는다(환경):
    with pytest.raises(ValidationError):
        Settings(app_env=환경, jwt_signing_key=키_하나, refresh_token_pepper=키_둘, db_password="")


def test_두_키가_같으면_뜨지_않는다():
    """refresh token pepper 가 서명 키와 같으면 분리해 둔 의미가 없다."""
    with pytest.raises(ValidationError):
        Settings(app_env="production", jwt_signing_key=키_하나, refresh_token_pepper=키_하나, db_password="x")


def test_로컬은_비어_있어도_뜬다():
    """로컬에서까지 막으면 아무도 처음 실행을 못 한다."""
    assert Settings(app_env="local", jwt_signing_key="", refresh_token_pepper="").app_env == "local"


def test_운영에_값이_다_있으면_뜬다():
    settings = Settings(
        app_env="production", jwt_signing_key=키_하나, refresh_token_pepper=키_둘, db_password="x"
    )
    assert settings.docs_enabled is False
