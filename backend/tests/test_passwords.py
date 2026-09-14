import unicodedata

import pytest

from app.core.errors import AppError, ErrorCode
from app.core.passwords import (
    MAX_LENGTH,
    MIN_LENGTH,
    hash_password,
    needs_rehash,
    normalize,
    validate,
    verify,
)

# 실제 비밀번호처럼 보이는 값을 쓰지 않는다. 공개 저장소다.
쓸_만한_값 = "산책하는 오후 7시"


def 거부_사유(값: str, **kw) -> str:
    with pytest.raises(AppError) as 잡힌_것:
        validate(값, **kw)
    assert 잡힌_것.value.code is ErrorCode.VALIDATION_ERROR
    return 잡힌_것.value.fields["password"]


# ---------------------------------------------------------------------------
# 길이
# ---------------------------------------------------------------------------


def test_여덟_자_미만은_거부한다():
    일곱_자 = "산책하는 오후"

    assert len(일곱_자) == MIN_LENGTH - 1
    assert "8자" in 거부_사유(일곱_자)


def test_여덟_자는_통과한다():
    """경계값이다. 미만만 막아야 한다."""
    assert len(validate("a" + "가" * (MIN_LENGTH - 1))) == MIN_LENGTH


def test_백이십팔_자는_통과하고_한_자_더는_거부한다():
    값 = "가" + "나" * (MAX_LENGTH - 1)

    assert len(validate(값)) == MAX_LENGTH
    assert "128자" in 거부_사유(값 + "다")


def test_길이는_정규화한_뒤에_센다():
    """
    자모가 풀린 형태로 오면 글자 수가 달라 보인다. 정규화 전에 세면 같은
    글자를 친 사용자가 어떤 키보드로 쳤느냐에 따라 통과와 거부가 갈린다.
    """
    일곱_자 = "산책하는 오후"
    풀린_일곱_자 = unicodedata.normalize("NFD", 일곱_자)

    # 풀어 놓으면 글자 수가 8을 넘어 통과할 것처럼 보인다.
    assert len(풀린_일곱_자) > MIN_LENGTH
    # 그래도 거부해야 한다. 세는 것은 정규화한 뒤의 길이다.
    assert "8자" in 거부_사유(풀린_일곱_자)


def test_풀린_형태의_여덟_자는_통과한다():
    여덟_자 = "산책하는 오후에"
    풀린_값 = unicodedata.normalize("NFD", 여덟_자)

    assert validate(풀린_값) == 여덟_자


# ---------------------------------------------------------------------------
# 무엇을 막는가
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("값", ["password", "PASSWORD", "Qwerty123", "12345678", "1q2w3e4r"])
def test_흔한_비밀번호는_대소문자와_무관하게_거부한다(값):
    assert "흔한" in 거부_사유(값)


def test_한_글자_반복은_거부한다():
    assert "반복" in 거부_사유("ㅁ" * 20)


def test_이메일과_같은_값은_거부한다():
    assert "이메일" in 거부_사유("hello@example.test", email="hello@example.test")


def test_이메일_앞부분과_같은_값도_거부한다():
    assert "이메일" in 거부_사유("sunnyday", email="SunnyDay@example.test")


def test_이메일을_모르면_그_검사만_건너뛴다():
    """가입이 아닌 자리에서는 이메일을 모를 수 있다."""
    assert validate("sunnyday123!") == "sunnyday123!"


def test_문자_종류를_강제하지_않는다():
    """
    조합 규칙은 실제로는 뻔한 값을 만들어 낸다. 길이를 주고 흔한 값을
    막는 쪽을 골랐다.
    """
    assert validate("산책하는 오후에 걷기")


def test_공백을_지우지_않는다():
    """
    붙여넣기와 비밀번호 관리자를 허용하기로 했다. 양 끝 공백을 말없이
    지우면 관리자가 넣어 준 값과 어긋난다.
    """
    값 = "  두 칸 들여쓴 문장  "

    assert validate(값) == 값


def test_빈_값은_거부한다():
    assert 거부_사유("")


# ---------------------------------------------------------------------------
# 해시
# ---------------------------------------------------------------------------


def test_같은_비밀번호도_해시가_매번_다르다():
    """salt 가 매번 달라야 한다. 같으면 같은 비밀번호를 쓰는 계정이 드러난다."""
    assert hash_password(쓸_만한_값) != hash_password(쓸_만한_값)


def test_해시에_원문이_들어_있지_않다():
    저장값 = hash_password(쓸_만한_값)

    assert 쓸_만한_값 not in 저장값
    assert "산책" not in 저장값


def test_Argon2id로_저장한다():
    """
    argon2i 나 argon2d 가 아니라 id 여야 한다. 문서가 지정한 값이다.
    """
    assert hash_password(쓸_만한_값).startswith("$argon2id$")


def test_맞는_비밀번호를_받아들인다():
    assert verify(hash_password(쓸_만한_값), 쓸_만한_값) is True


def test_틀린_비밀번호를_거부한다():
    assert verify(hash_password(쓸_만한_값), "다른 문장이다 이것은") is False


def test_정규화가_다른_같은_글자를_받아들인다():
    """
    macOS 파일 이름과 일부 키보드가 자모를 풀어서 보낸다. 맞추지 않으면
    같은 글자를 친 사용자가 로그인에 실패한다.
    """
    모아진_값 = unicodedata.normalize("NFC", "산책하는 오후")
    풀린_값 = unicodedata.normalize("NFD", "산책하는 오후")

    assert 모아진_값 != 풀린_값
    assert verify(hash_password(모아진_값), 풀린_값) is True


def test_망가진_해시는_예외가_아니라_실패다():
    """
    예외가 나면 부르는 쪽이 실패 경로만 다르게 처리하기 쉽고, 그러면
    응답이 갈려서 계정 존재 여부가 드러난다.
    """
    assert verify("이건 해시가 아니다", 쓸_만한_값) is False
    assert verify("", 쓸_만한_값) is False


def test_지금_기준으로_만든_해시는_다시_만들_필요가_없다():
    assert needs_rehash(hash_password(쓸_만한_값)) is False


def test_비용이_낮은_해시는_다시_만들어야_한다():
    """비용을 올린 뒤 로그인에 성공한 김에 다시 해시해 둔다."""
    from argon2 import PasswordHasher
    from argon2.low_level import Type

    약한_해시 = PasswordHasher(
        time_cost=1, memory_cost=8, parallelism=1, hash_len=16, salt_len=8, type=Type.ID
    ).hash(쓸_만한_값)

    assert needs_rehash(약한_해시) is True


def test_normalize는_NFC다():
    assert normalize(unicodedata.normalize("NFD", "한글")) == "한글"
