import unicodedata

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from argon2.low_level import Type

from app.core.errors import AppError, ErrorCode

# 비밀번호 규칙은 docs/development/10-implementation-readiness.md 의 D-008L 에서
# 온다. 8~128자, 문자 종류 조합은 강제하지 않고, 흔하거나 유출된 비밀번호와
# 이메일과 같은 값만 거부한다.
#
# 조합을 강제하지 않는 이유는 그 규칙이 실제로는 `Password1!` 같은 뻔한 값을
# 만들어 내기 때문이다. 길이를 주고 흔한 값을 막는 쪽이 낫다.

MIN_LENGTH = 8
MAX_LENGTH = 128

# Argon2id 비용. OWASP 최소 기준(m=19MiB, t=2, p=1)이다.
# **이 값을 낮추지 않는다.** 운영 VPS 에서 부하 테스트한 뒤 올릴 수는 있다
# (docs/development/05-quality-and-operations.md).
_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=19456,
    parallelism=1,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)

# 흔한 비밀번호. 유출 목록 전체를 저장소에 넣을 수는 없어서 가장 자주 쓰이는
# 것들만 막는다. 제대로 된 유출 대조(HIBP 같은 것)는 바깥으로 요청을 보내는
# 일이라 개인정보 처리방침에 올린 뒤에 붙인다. 지금은 없는 것이 아니라
# 미룬 것이다.
_COMMON = frozenset(
    {
        "password", "password1", "password123", "passw0rd", "qwerty", "qwerty123",
        "abc123", "iloveyou", "admin", "welcome", "monkey", "dragon", "letmein",
        "football", "baseball", "sunshine", "princess", "superman", "trustno1",
        "123456", "1234567", "12345678", "123456789", "1234567890", "12345",
        "111111", "000000", "654321", "121212", "asdfgh", "zxcvbn", "qwertyuiop",
        "daymo", "daymo123", "korea123", "asdf1234", "qwer1234", "1q2w3e4r",
        "a1234567", "88888888", "11111111", "aaaaaaaa",
    }
)


def normalize(raw: str) -> str:
    """
    NFC 로 맞춘다.

    같은 한글이 자모가 풀린 형태(NFD)로도 들어올 수 있다. macOS 파일 이름이
    그렇고 일부 키보드도 그렇다. 맞추지 않으면 같은 글자를 친 사용자가
    로그인에 실패한다. 길이도 이 결과로 센다.
    """
    return unicodedata.normalize("NFC", raw)


def _거부(사유: str) -> None:
    raise AppError(ErrorCode.VALIDATION_ERROR, fields={"password": 사유})


def validate(raw: str, *, email: str | None = None) -> str:
    """
    쓸 수 있는 비밀번호인지 본다. 통과하면 정규화된 값을 돌려준다.

    공백을 지우지 않는다. 붙여넣기와 비밀번호 관리자를 허용하기로 했고,
    양 끝 공백을 말없이 지우면 관리자가 넣어 준 값과 어긋난다.
    """
    if not isinstance(raw, str) or not raw:
        _거부("비밀번호를 입력해 주세요.")

    값 = normalize(raw)

    if len(값) < MIN_LENGTH:
        _거부(f"{MIN_LENGTH}자 이상이어야 해요.")
    if len(값) > MAX_LENGTH:
        _거부(f"{MAX_LENGTH}자까지 쓸 수 있어요.")

    낮춘_값 = 값.lower()
    if 낮춘_값 in _COMMON:
        _거부("너무 흔한 비밀번호예요. 다른 걸로 정해 주세요.")

    # 한 글자만 반복하는 값은 길이만 채운 것이다.
    if len(set(값)) == 1:
        _거부("같은 글자만 반복할 수 없어요.")

    if email:
        낮춘_이메일 = normalize(email).lower()
        앞부분 = 낮춘_이메일.split("@", 1)[0]
        if 낮춘_값 in (낮춘_이메일, 앞부분):
            _거부("이메일과 같은 값은 쓸 수 없어요.")

    return 값


def hash_password(raw: str) -> str:
    """
    저장할 값을 만든다.

    돌려주는 문자열에 알고리즘과 비용과 salt 가 함께 들어 있다. 그래서
    나중에 비용을 올려도 예전 해시를 그대로 검증할 수 있다.
    """
    return _hasher.hash(normalize(raw))


def verify(stored: str, raw: str) -> bool:
    """
    맞는 비밀번호인지 본다.

    틀렸을 때 예외가 아니라 False 를 돌려준다. 부르는 쪽에서 맞고 틀림을
    같은 모양으로 다루게 해서, 실패 경로만 다르게 응답하는 실수를 줄인다.
    """
    try:
        return _hasher.verify(stored, normalize(raw))
    except (VerifyMismatchError, InvalidHashError):
        return False
    except Exception:
        # 손상된 해시 문자열 등. 로그인은 실패로 본다.
        return False


def needs_rehash(stored: str) -> bool:
    """
    저장된 해시가 지금 기준보다 약한지.

    비용을 올린 뒤에는 로그인에 성공한 김에 다시 해시해 둔다. 사용자가
    비밀번호를 바꾸지 않아도 기준이 따라 올라간다.
    """
    try:
        return _hasher.check_needs_rehash(stored)
    except (InvalidHashError, Exception):
        return False
