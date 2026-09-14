import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode

# access token 은 15분, refresh token 은 마지막 정상 사용 시점부터 90일이다
# (docs/development/02-architecture-and-data-model.md 3장).
#
# access 를 짧게 두는 이유는 폐기할 방법이 없어서다. 서명만 맞으면 통하므로,
# 권한을 빼앗아도 만료될 때까지는 통한다. 그 창을 15분으로 줄이는 것이
# 서버가 할 수 있는 전부다.
ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=90)

_ALGORITHM = "HS256"
_ISSUER = "daymo"


def _signing_key() -> str:
    key = get_settings().jwt_signing_key
    if not key:
        # 빈 키로 서명하면 누구나 토큰을 만들 수 있다. beta/production 은
        # 설정에서 이미 막혀 있고, 여기서 한 번 더 막는다.
        raise RuntimeError("JWT_SIGNING_KEY 가 비어 있다. 토큰을 발급할 수 없다.")
    return key


def create_access_token(
    *, user_id: uuid.UUID, device_id: uuid.UUID | None, now: datetime | None = None
) -> str:
    """
    앱이 요청마다 들고 오는 토큰.

    담는 것은 누구인지와 어느 기기인지뿐이다. 이름·이메일·권한을 넣지 않는다.
    토큰은 앱 안에 남고 로그에도 실릴 수 있으며, 권한은 요청 시점의 DB 가
    원본이라 토큰에 박아 두면 빼앗은 권한이 15분 동안 살아 있게 된다.
    """
    시각 = now or datetime.now(UTC)
    claims: dict[str, Any] = {
        "iss": _ISSUER,
        "sub": str(user_id),
        "iat": int(시각.timestamp()),
        "exp": int((시각 + ACCESS_TTL).timestamp()),
        "jti": str(uuid.uuid4()),
        "typ": "access",
    }
    if device_id:
        claims["sid"] = str(device_id)
    return jwt.encode(claims, _signing_key(), algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    토큰을 푼다. 조금이라도 이상하면 `UNAUTHENTICATED` 다.

    왜 거부했는지를 응답에 적지 않는다. 만료인지 서명 오류인지 알려 주면
    공격하는 쪽에 힌트가 된다. 사용자는 어차피 다시 로그인하면 된다.
    """
    try:
        claims = jwt.decode(
            token,
            _signing_key(),
            algorithms=[_ALGORITHM],
            issuer=_ISSUER,
            options={"require": ["exp", "iat", "sub", "iss"]},
        )
    except jwt.PyJWTError as 원인:
        raise AppError(ErrorCode.UNAUTHENTICATED) from 원인

    # refresh token 을 access 자리에 넣어 쓰는 것을 막는다. 지금은 refresh 가
    # JWT 가 아니지만, 나중에 바뀌어도 이 검사가 남아 있어야 한다.
    if claims.get("typ") != "access":
        raise AppError(ErrorCode.UNAUTHENTICATED)
    return claims


def new_refresh_token() -> tuple[str, str]:
    """
    갱신 토큰 하나를 만든다. `(원문, 저장할 hash)` 를 돌려준다.

    원문은 이 순간에만 존재하고 앱에게 한 번 건네진 뒤 서버 어디에도 남지
    않는다. 앱은 이것만 OS 의 안전한 저장소에 둔다.
    """
    원문 = secrets.token_urlsafe(48)
    return 원문, hash_refresh_token(원문)


def hash_refresh_token(raw: str) -> str:
    """
    저장하고 찾을 때 쓰는 값.

    단순 SHA-256 이 아니라 pepper 를 열쇠로 쓰는 HMAC 이다. pepper 는 DB 가
    아니라 서버 환경에 있어서, DB 만 통째로 새어도 그 값으로 토큰을 찾아낼
    수 없다.

    비밀번호처럼 느린 해시를 쓰지 않는 이유는 토큰이 이미 충분히 긴
    난수여서다. 느리게 만들면 갱신 요청마다 그 비용을 낸다.
    """
    pepper = get_settings().refresh_token_pepper
    if not pepper:
        raise RuntimeError("REFRESH_TOKEN_PEPPER 가 비어 있다. 토큰을 다룰 수 없다.")
    return hmac.new(pepper.encode(), raw.encode(), hashlib.sha256).hexdigest()


def new_one_time_token() -> tuple[str, str]:
    """
    이메일 링크에 실을 1회용 토큰.

    갱신 토큰과 같은 방식이다. 메일 본문에 원문이 실리고 서버에는 hash 만
    남으므로, 메일함을 못 보는 사람은 DB 를 봐도 링크를 만들 수 없다.
    """
    원문 = secrets.token_urlsafe(32)
    return 원문, hash_refresh_token(원문)
