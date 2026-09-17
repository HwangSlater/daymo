from enum import StrEnum

from fastapi import HTTPException


class ErrorCode(StrEnum):
    """
    API 명세서 1장의 오류 코드. 여기 없는 코드를 응답에 쓰지 않는다.

    새 코드가 필요하면 docs/development/03-api-specification.md 를 먼저 고친다.
    앱이 코드를 보고 분기하므로 문자열을 임의로 바꾸면 앱이 조용히 깨진다.
    """

    UNAUTHENTICATED = "UNAUTHENTICATED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    VERSION_CONFLICT = "VERSION_CONFLICT"
    TAG_IN_USE = "TAG_IN_USE"
    SETTLEMENT_IN_PROGRESS = "SETTLEMENT_IN_PROGRESS"
    OWNER_TRANSFER_REQUIRED = "OWNER_TRANSFER_REQUIRED"
    SPACE_MEMBER_LIMIT_REACHED = "SPACE_MEMBER_LIMIT_REACHED"
    EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED"
    ACCOUNT_LINK_REQUIRED = "ACCOUNT_LINK_REQUIRED"
    SYNC_CURSOR_EXPIRED = "SYNC_CURSOR_EXPIRED"
    GONE = "GONE"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    PASSWORD_TOO_COMMON = "PASSWORD_TOO_COMMON"
    PHOTO_TOO_LARGE = "PHOTO_TOO_LARGE"
    STORAGE_QUOTA_EXCEEDED = "STORAGE_QUOTA_EXCEEDED"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"


STATUS_BY_CODE: dict[ErrorCode, int] = {
    ErrorCode.UNAUTHENTICATED: 401,
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.VERSION_CONFLICT: 409,
    ErrorCode.TAG_IN_USE: 409,
    ErrorCode.SETTLEMENT_IN_PROGRESS: 409,
    ErrorCode.OWNER_TRANSFER_REQUIRED: 409,
    ErrorCode.SPACE_MEMBER_LIMIT_REACHED: 409,
    ErrorCode.EMAIL_NOT_VERIFIED: 403,
    ErrorCode.ACCOUNT_LINK_REQUIRED: 409,
    ErrorCode.SYNC_CURSOR_EXPIRED: 410,
    ErrorCode.GONE: 410,
    ErrorCode.PHOTO_TOO_LARGE: 413,
    ErrorCode.STORAGE_QUOTA_EXCEEDED: 413,
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.PASSWORD_TOO_COMMON: 422,
    ErrorCode.RATE_LIMITED: 429,
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.SERVICE_UNAVAILABLE: 503,
}

# 사용자에게 그대로 보이는 문구다. 무엇을 하면 되는지 알 수 있게 쓴다.
MESSAGE_BY_CODE: dict[ErrorCode, str] = {
    ErrorCode.UNAUTHENTICATED: "로그인이 만료됐어요. 다시 로그인해 주세요.",
    ErrorCode.FORBIDDEN: "이 작업을 할 수 있는 권한이 없어요.",
    ErrorCode.NOT_FOUND: "요청한 내용을 찾을 수 없어요.",
    ErrorCode.VERSION_CONFLICT: "다른 기기에서 먼저 바뀌었어요. 최신 내용을 불러온 뒤 다시 시도해 주세요.",
    ErrorCode.TAG_IN_USE: "사용 중인 태그예요.",
    ErrorCode.SETTLEMENT_IN_PROGRESS: "이미 주고받은 기록이 있어 바꿀 수 없어요.",
    ErrorCode.OWNER_TRANSFER_REQUIRED: "다른 멤버가 있는 공간의 관리자예요. 관리자를 먼저 넘겨 주세요.",
    ErrorCode.SPACE_MEMBER_LIMIT_REACHED: "이 공간은 이미 10명이 다 찼어요. 더는 참여할 수 없어요.",
    ErrorCode.EMAIL_NOT_VERIFIED: "이메일 확인을 마친 뒤 참여할 수 있어요. 받은 메일의 링크를 눌러 주세요.",
    ErrorCode.ACCOUNT_LINK_REQUIRED: "이 이메일로 가입한 계정이 이미 있어요. 그 계정의 비밀번호를 입력하면 연결돼요.",
    ErrorCode.SYNC_CURSOR_EXPIRED: "오랜만이라 내용을 처음부터 다시 불러와요.",
    ErrorCode.GONE: "복구할 수 있는 기간이 지났어요.",
    ErrorCode.VALIDATION_ERROR: "입력 내용을 확인해 주세요.",
    ErrorCode.PASSWORD_TOO_COMMON: "너무 흔한 비밀번호예요. 다른 비밀번호를 정해 주세요.",
    ErrorCode.PHOTO_TOO_LARGE: "사진이 너무 커요.",
    ErrorCode.STORAGE_QUOTA_EXCEEDED: "저장 공간이 가득 찼어요.",
    ErrorCode.RATE_LIMITED: "잠시 후 다시 시도해 주세요.",
    ErrorCode.INTERNAL_ERROR: "문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
    ErrorCode.SERVICE_UNAVAILABLE: "지금은 연결할 수 없어요. 잠시 후 다시 시도해 주세요.",
}


# Starlette 가 직접 내는 오류(없는 경로, 허용되지 않은 메서드)를 명세서의
# 코드로 옮기는 표. 우리 코드가 던지는 것은 전부 AppError 를 거치므로 여기
# 들어오는 것은 프레임워크가 만든 것뿐이다.
CODE_BY_STATUS: dict[int, ErrorCode] = {
    401: ErrorCode.UNAUTHENTICATED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    # 405 는 앱 입장에서 "그 경로에 그 메서드는 없다" 와 같다.
    405: ErrorCode.NOT_FOUND,
    409: ErrorCode.VERSION_CONFLICT,
    413: ErrorCode.PHOTO_TOO_LARGE,
    422: ErrorCode.VALIDATION_ERROR,
    429: ErrorCode.RATE_LIMITED,
}


def code_for_status(status: int) -> ErrorCode:
    if status in CODE_BY_STATUS:
        return CODE_BY_STATUS[status]
    return ErrorCode.INTERNAL_ERROR if status >= 500 else ErrorCode.VALIDATION_ERROR


class AppError(HTTPException):
    """
    이 API가 던지는 오류.

    HTTPException 을 상속해 FastAPI 의 기존 처리 경로를 그대로 쓰되, 상태
    코드와 문구를 코드 하나에서 끌어온다. 같은 뜻의 오류가 자리마다 다른
    상태 코드로 나가는 것을 막으려는 것이다.
    """

    def __init__(
        self,
        code: ErrorCode,
        *,
        message: str | None = None,
        fields: dict[str, str] | None = None,
        details: dict[str, str] | None = None,
    ) -> None:
        self.code = code
        self.fields = fields
        # 앱이 다음 단계로 가는 데 필요한 값. 지금은 ACCOUNT_LINK_REQUIRED 의
        # 연결 토큰뿐이다. 계정이 있는지 없는지 말고는 드러내지 않는 값만 싣는다.
        self.details = details
        super().__init__(
            status_code=STATUS_BY_CODE[code],
            detail=message or MESSAGE_BY_CODE[code],
        )
