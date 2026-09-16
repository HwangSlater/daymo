"""
앱이 겪은 오류 한 줄을 받는 곳.

앱에는 오류 수집 SDK 를 넣지 않았다. Sentry 의 React Native SDK 는 네이티브 묶음이라
새로 빌드해야 켜지고, 앱 안에서 무엇을 가져가는지 우리가 고를 수 없다. 대신 앱이
스스로 거른 한 줄(`mobile/src/errorReport.ts`)을 여기로 보내고, 서버가 한 번 더 거른
뒤 로그에 남기거나 Sentry 로 올린다. 그래서 앱에 드는 제3자 SDK 는 늘지 않는다
(release/shared/data-inventory.md 2장).

로그인하지 않아도 보낼 수 있다. 로그인 화면에서 난 오류가 가장 알고 싶은 것이라
토큰을 요구하면 정작 필요한 것을 못 받는다. 대신 누가 보냈는지는 적지 않고, 프로세스
하나가 1분에 받는 수를 막아 둔다.
"""

import logging
import time

from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.observability import capture_client_error, scrub_text
from app.core.responses import ok

router = APIRouter(prefix="/client-errors", tags=["client-errors"])

logger = logging.getLogger("daymo.client")

# 1분에 이만큼만 받는다. 넘으면 200 을 주면서 버린다. 오류 하나가 되풀이돼 터질 때
# 로그와 Sentry 할당량이 그것만으로 차는 것을 막는다.
분당_한도 = 60

_창 = 0
_센_것 = 0


def _받아도_되나(지금: float) -> bool:
    global _창, _센_것

    이번_분 = int(지금 // 60)
    if 이번_분 != _창:
        _창 = 이번_분
        _센_것 = 0
    if _센_것 >= 분당_한도:
        return False
    _센_것 += 1
    return True


class ClientErrorIn(BaseModel):
    """
    앱이 보내는 한 줄.

    **본문·사진·이메일이 들어올 자리가 없어야 한다.** 그래서 자유 입력 칸을 늘리지
    않고, 길이도 짧게 끊는다. 그래도 섞여 들어올 수 있어서 서버가 `scrub_text` 로
    한 번 더 훑는다.
    """

    model_config = ConfigDict(
        alias_generator=lambda 이름: "".join(
            조각.capitalize() if i else 조각 for i, 조각 in enumerate(이름.split("_"))
        ),
        populate_by_name=True,
        extra="forbid",
    )

    # ios / android / web. 모르는 값이 와도 막지 않는다. 길이만 끊는다.
    platform: str = Field(default="unknown", max_length=16)
    app_version: str = Field(default="unknown", max_length=32)
    # crash(앱이 멈춤) / unhandled(처리되지 않은 promise) / api(서버 호출 실패).
    kind: str = Field(default="crash", max_length=16)
    name: str = Field(default="Error", max_length=120)
    message: str = Field(default="", max_length=500)
    # 어느 화면에서 났는지. 앱이 고른 말(`우리/내 프로필`)이지 URL 이 아니다.
    where: str = Field(default="", max_length=120)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def receive_client_error(body: ClientErrorIn) -> dict:
    """
    앱 오류 한 줄을 받는다. 무엇을 받았든 같은 응답을 준다.

    한도를 넘겨 버렸는지도 알려 주지 않는다. 앱이 그것을 알아서 할 일이 없고,
    바깥에서 한도를 재 볼 수 있게 할 이유도 없다.
    """
    if _받아도_되나(time.monotonic()):
        name = scrub_text(body.name)
        message = scrub_text(body.message)
        where = scrub_text(body.where)
        logger.warning(
            "app error platform=%s version=%s kind=%s where=%s %s: %s",
            body.platform,
            body.app_version,
            body.kind,
            where,
            name,
            message,
        )
        capture_client_error(
            platform=body.platform,
            app_version=body.app_version,
            kind=body.kind,
            name=name,
            message=message,
            where=where,
        )
    return ok({"status": "accepted"})
