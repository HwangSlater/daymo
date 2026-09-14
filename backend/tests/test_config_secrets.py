import pytest
from pydantic import ValidationError

from app.core.config import MIN_SECRET_BYTES, Settings

# 실제 값처럼 보이지 않게 뻔한 문자열을 쓰되, 길이 기준은 넘긴다.
# 짧은 값으로 통과하면 길이 검사를 시험한 것이 아니다.
키_하나 = "테스트용-키-1-" + "a" * 40
키_둘 = "테스트용-키-2-" + "b" * 40


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


@pytest.mark.parametrize("환경", ["beta", "production"])
def test_서명키가_짧으면_뜨지_않는다(환경):
    """
    비어 있지 않은 것만으로는 부족하다. HS256 서명 키가 해시 출력보다
    짧으면 그만큼 약해진다(RFC 7518 3.2).
    """
    짧은_키 = "a" * (MIN_SECRET_BYTES - 1)

    with pytest.raises(ValidationError) as 잡힌_것:
        Settings(app_env=환경, jwt_signing_key=짧은_키, refresh_token_pepper=키_둘, db_password="x")

    assert "짧다" in str(잡힌_것.value)


def test_pepper가_짧아도_뜨지_않는다():
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            jwt_signing_key=키_하나,
            refresh_token_pepper="b" * (MIN_SECRET_BYTES - 1),
            db_password="x",
        )


def test_길이는_바이트로_센다():
    """
    한글은 한 글자가 3바이트다. 글자 수로 세면 11자짜리가 통과해 버린다.
    """
    한글_키 = "가" * 11

    assert len(한글_키) < MIN_SECRET_BYTES
    assert len(한글_키.encode()) >= MIN_SECRET_BYTES
    Settings(
        app_env="production",
        jwt_signing_key=한글_키,
        refresh_token_pepper=키_둘,
        db_password="x",
    )
