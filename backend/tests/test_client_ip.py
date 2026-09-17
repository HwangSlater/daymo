from fastapi import Request

from app.api.deps import client_ip


def 요청(머리: dict[str, str], 연결된_주소: str | None = "203.0.113.7") -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(이름.lower().encode(), 값.encode()) for 이름, 값 in 머리.items()],
            "client": (연결된_주소, 40000) if 연결된_주소 else None,
        }
    )


def test_X_Forwarded_For_를_위조해도_X_Real_IP_가_이긴다():
    """
    운영 Nginx 는 `$proxy_add_x_forwarded_for` 로 바깥 값 뒤에 진짜 주소를
    덧붙인다. 그래서 X-Forwarded-For 맨 앞은 클라이언트가 적어 넣은 값이고,
    그것을 열쇠로 쓰면 요청마다 다른 값을 넣어 IP 한도를 비켜 갈 수 있다.
    """
    주소 = client_ip(
        요청(
            {
                "X-Forwarded-For": "198.51.100.1, 203.0.113.7",
                "X-Real-IP": "203.0.113.7",
            }
        )
    )

    assert 주소 == "203.0.113.7"


def test_X_Real_IP_가_없으면_연결된_주소를_쓴다():
    """X-Forwarded-For 만 있으면 아예 읽지 않는다. 읽으면 구멍이 그대로 남는다."""
    주소 = client_ip(요청({"X-Forwarded-For": "198.51.100.1"}))

    assert 주소 == "203.0.113.7"


def test_X_Real_IP_가_비어_있으면_연결된_주소를_쓴다():
    주소 = client_ip(요청({"X-Real-IP": "   ", "X-Forwarded-For": "198.51.100.1"}))

    assert 주소 == "203.0.113.7"


def test_머리도_연결도_없으면_unknown_이다():
    assert client_ip(요청({}, 연결된_주소=None)) == "unknown"
