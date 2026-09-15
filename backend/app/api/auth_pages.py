"""
메일 속 링크가 여는 페이지. 이메일 확인, 비밀번호 재설정, 비밀번호 찾기, 이메일 변경 확인.

앱 API(`/v1`)가 아니라 사람이 브라우저로 여는 화면이라 JSON 대신 HTML 을
돌려준다. 웹 앱을 따로 배포하지 않아도 링크가 동작하도록 API 서버가 직접
보여 준다. 앱 바로 열기(Universal Link)는 daymo.xyz 에서 나중에 한다.

지키는 것:

- **GET 은 아무것도 바꾸지 않는다.** 메일 보안 검사기가 링크를 미리 열어 본다.
  GET 에서 확인해 버리면 사람이 누르기도 전에 1회용 링크가 쓰인다. 버튼을
  눌러 POST 할 때만 바꾼다.
- **링크의 token 이 새지 않게 한다.** `Referrer-Policy: no-referrer`, 캐시 금지,
  외부 자원을 하나도 불러오지 않는다(CSP `default-src 'none'`). 접속 기록은
  주소를 경로만 적는다(app/core/access_log.py, nginx 의 `/auth/` 로그 형식).
- **계정이 있는지 드러내지 않는다.** 재전송과 비밀번호 찾기는 늘 같은 문구다.
- 쿠키와 세션을 쓰지 않는다. 폼이 들고 가는 비밀은 링크의 token 뿐이라, 다른
  사이트가 이 폼을 대신 보내도 token 을 모르면 할 수 있는 일이 없다.
"""

from html import escape
from urllib.parse import parse_qs

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.api.deps import ClientIp, DbSession
from app.core.errors import AppError
from app.services import account_changes, accounts

router = APIRouter(prefix="/auth", include_in_schema=False)

# 폼 하나에 이보다 큰 본문이 올 이유가 없다. 비밀번호 128자와 token 을 넉넉히 넘는다.
MAX_FORM_BYTES = 4096

_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
        "frame-ancestors 'none'; base-uri 'none'"
    ),
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}

_STYLE = """
:root { color-scheme: light dark; --bg:#F7F5F0; --card:#FFFFFF; --text:#17233D; --muted:#5B6474;
  --line:#E2DED6; --accent:#3F4C8F; --on-accent:#FFFFFF; --danger:#C0392F; }
@media (prefers-color-scheme: dark) { :root { --bg:#0D111A; --card:#161C28; --text:#EEF1F6;
  --muted:#A3ABB9; --line:#2A3242; --accent:#9FAEF0; --on-accent:#0D111A; --danger:#F08A82; } }
* { box-sizing: border-box; }
body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
  padding:24px 16px; background:var(--bg); color:var(--text);
  font:15px/1.6 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif; }
main { width:100%; max-width:400px; background:var(--card); border:1px solid var(--line);
  border-radius:16px; padding:28px 24px; }
.brand { font-weight:800; letter-spacing:-0.5px; color:var(--accent); margin:0 0 18px; }
h1 { font-size:21px; line-height:1.35; margin:0 0 8px; letter-spacing:-0.4px; }
p { margin:0 0 14px; color:var(--muted); }
label { display:block; font-size:13px; font-weight:600; margin:14px 0 6px; color:var(--text); }
input { width:100%; height:48px; border-radius:10px; border:1px solid var(--line); padding:0 14px;
  font:inherit; background:var(--bg); color:var(--text); }
button { width:100%; height:50px; margin-top:18px; border:0; border-radius:12px; background:var(--accent);
  color:var(--on-accent); font:inherit; font-weight:700; cursor:pointer; }
.error { color:var(--danger); font-weight:600; }
"""


def _page(title: str, body: str, status: int = 200) -> HTMLResponse:
    html = (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex">'
        f"<title>{escape(title)} · Daymo</title><style>{_STYLE}</style></head>"
        f'<body><main><p class="brand">Daymo</p>{body}</main></body></html>'
    )
    return HTMLResponse(html, status_code=status, headers=_HEADERS)


def _message(title: str, text: str, status: int = 200) -> HTMLResponse:
    return _page(title, f"<h1>{escape(title)}</h1><p>{escape(text)}</p>", status)


def _error(text: str | None) -> str:
    return f'<p class="error" role="alert">{escape(text)}</p>' if text else ""


def _usable_token(token: str | None) -> str | None:
    """링크에서 온 token 모양인지만 본다. 맞는지는 서비스가 해시로 확인한다."""
    if not token or len(token) > 200:
        return None
    if not all((c.isascii() and c.isalnum()) or c in "-_" for c in token):
        return None
    return token


async def _form(request: Request) -> dict[str, str]:
    """
    폼 본문을 읽는다. python-multipart 를 들이지 않으려고 직접 푼다.
    너무 크면 비어 있는 것으로 본다.
    """
    본문 = await request.body()
    if len(본문) > MAX_FORM_BYTES:
        return {}
    값들 = parse_qs(본문.decode("utf-8", errors="replace"), keep_blank_values=True)
    return {이름: 목록[0] for 이름, 목록 in 값들.items() if 목록}


_EXPIRED = "링크가 만료되었거나 이미 사용됐어요."


# ---------------------------------------------------------------------------
# 이메일 확인
# ---------------------------------------------------------------------------


def _resend_form(error: str | None = None) -> str:
    return (
        f"{_error(error)}"
        '<form method="post" action="/auth/verify-email/resend">'
        '<label for="email">가입한 이메일</label>'
        '<input id="email" name="email" type="email" autocomplete="email" required maxlength="320">'
        "<button>확인 메일 다시 받기</button></form>"
    )


@router.get("/verify-email")
async def verify_email_page(token: str | None = None) -> HTMLResponse:
    usable = _usable_token(token)
    if usable is None:
        return _page("이메일 확인", f"<h1>{_EXPIRED}</h1><p>확인 메일을 다시 받아 주세요.</p>{_resend_form()}", 400)
    return _page(
        "이메일 확인",
        "<h1>이메일을 확인할게요</h1>"
        "<p>아래 버튼을 누르면 이 주소가 확인돼요.</p>"
        '<form method="post" action="/auth/verify-email">'
        f'<input type="hidden" name="token" value="{escape(usable)}">'
        "<button>이메일 확인하기</button></form>",
    )


@router.post("/verify-email")
async def verify_email(request: Request, db: DbSession) -> HTMLResponse:
    usable = _usable_token((await _form(request)).get("token"))
    if usable is None:
        return _page("이메일 확인", f"<h1>{_EXPIRED}</h1><p>확인 메일을 다시 받아 주세요.</p>{_resend_form()}", 400)
    try:
        await accounts.confirm_email(db, token=usable)
    except AppError:
        return _page("이메일 확인", f"<h1>{_EXPIRED}</h1><p>확인 메일을 다시 받아 주세요.</p>{_resend_form()}", 400)
    return _message("이메일을 확인했어요", "이제 이 창을 닫고 Daymo 앱으로 돌아가 주세요.")


@router.post("/verify-email/resend")
async def resend_verification(request: Request, db: DbSession, ip: ClientIp) -> HTMLResponse:
    email = (await _form(request)).get("email", "").strip()
    if not email or "@" not in email or len(email) > 320:
        return _page("이메일 확인", _resend_form("이메일 주소를 확인해 주세요."), 400)
    try:
        await accounts.send_email_verification(db, email=email, ip=ip)
    except AppError as 오류:
        # 시도가 너무 잦으면 여기로 온다. 계정 유무와는 상관없는 문구다.
        return _page("이메일 확인", _resend_form(str(오류.detail)), 429)
    return _message("메일을 보냈어요", "가입한 주소라면 곧 확인 메일이 도착해요. 스팸함도 확인해 주세요.")


# ---------------------------------------------------------------------------
# 비밀번호 재설정
# ---------------------------------------------------------------------------


def _reset_form(token: str, error: str | None = None) -> str:
    return (
        "<h1>새 비밀번호를 정해 주세요</h1>"
        "<p>바꾸면 모든 기기에서 로그아웃돼요. 새 비밀번호로 다시 로그인해 주세요.</p>"
        f"{_error(error)}"
        '<form method="post" action="/auth/reset-password">'
        f'<input type="hidden" name="token" value="{escape(token)}">'
        '<label for="password">새 비밀번호 · 8자 이상</label>'
        '<input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128">'
        '<label for="confirm">한 번 더 입력</label>'
        '<input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128">'
        "<button>비밀번호 바꾸기</button></form>"
    )


def _forgot_form(error: str | None = None) -> str:
    return (
        f"{_error(error)}"
        '<form method="post" action="/auth/forgot-password">'
        '<label for="email">가입한 이메일</label>'
        '<input id="email" name="email" type="email" autocomplete="email" required maxlength="320">'
        "<button>재설정 메일 받기</button></form>"
    )


@router.get("/reset-password")
async def reset_password_page(token: str | None = None) -> HTMLResponse:
    usable = _usable_token(token)
    if usable is None:
        return _page("비밀번호 재설정", f"<h1>{_EXPIRED}</h1><p>재설정 메일을 다시 받아 주세요.</p>{_forgot_form()}", 400)
    return _page("비밀번호 재설정", _reset_form(usable))


@router.post("/reset-password")
async def reset_password(request: Request, db: DbSession) -> HTMLResponse:
    폼 = await _form(request)
    usable = _usable_token(폼.get("token"))
    if usable is None:
        return _page("비밀번호 재설정", f"<h1>{_EXPIRED}</h1><p>재설정 메일을 다시 받아 주세요.</p>{_forgot_form()}", 400)

    password = 폼.get("password", "")
    if password != 폼.get("confirm", ""):
        return _page("비밀번호 재설정", _reset_form(usable, "두 비밀번호가 달라요."), 400)
    try:
        await accounts.reset_password(db, token=usable, new_password=password)
    except AppError as 오류:
        # 비밀번호 규칙에 걸리면 fields 에 password 가 있다. 없으면 링크 쪽 문제다.
        if "password" not in (오류.fields or {}):
            return _page("비밀번호 재설정", f"<h1>{_EXPIRED}</h1><p>재설정 메일을 다시 받아 주세요.</p>{_forgot_form()}", 400)
        # token 은 아직 쓰지 않았으니 다시 입력하게 한다.
        문구 = (오류.fields or {})["password"]
        return _page("비밀번호 재설정", _reset_form(usable, 문구), 400)
    return _message("비밀번호를 바꿨어요", "Daymo 앱에서 새 비밀번호로 다시 로그인해 주세요.")


@router.get("/forgot-password")
async def forgot_password_page() -> HTMLResponse:
    return _page(
        "비밀번호 찾기",
        "<h1>비밀번호를 잊으셨나요?</h1><p>가입한 이메일로 재설정 링크를 보내 드려요.</p>" + _forgot_form(),
    )


@router.post("/forgot-password")
async def forgot_password(request: Request, db: DbSession, ip: ClientIp) -> HTMLResponse:
    email = (await _form(request)).get("email", "").strip()
    if not email or "@" not in email or len(email) > 320:
        return _page("비밀번호 찾기", _forgot_form("이메일 주소를 확인해 주세요."), 400)
    try:
        await accounts.request_password_reset(db, email=email, ip=ip)
    except AppError as 오류:
        return _page("비밀번호 찾기", _forgot_form(str(오류.detail)), 429)
    return _message("메일을 보냈어요", "가입한 주소라면 곧 재설정 메일이 도착해요. 링크는 30분 동안 쓸 수 있어요.")


# ---------------------------------------------------------------------------
# 이메일 변경
# ---------------------------------------------------------------------------


def _email_change_failed() -> HTMLResponse:
    # 그새 그 주소로 다른 계정이 생긴 경우도 같은 문구다. 링크를 가진 사람에게 가입 여부를 알리지 않는다.
    return _page("이메일 변경", f"<h1>{_EXPIRED}</h1><p>Daymo 앱의 내 프로필에서 다시 요청해 주세요.</p>", 400)


@router.get("/confirm-email-change")
async def confirm_email_change_page(token: str | None = None) -> HTMLResponse:
    usable = _usable_token(token)
    if usable is None:
        return _email_change_failed()
    return _page(
        "이메일 변경",
        "<h1>이메일을 이 주소로 바꿀게요</h1>"
        "<p>아래 버튼을 누르면 Daymo 계정의 이메일이 이 주소로 바뀌어요. 다음 로그인부터 이 주소를 써 주세요.</p>"
        '<form method="post" action="/auth/confirm-email-change">'
        f'<input type="hidden" name="token" value="{escape(usable)}">'
        "<button>이메일 바꾸기</button></form>",
    )


@router.post("/confirm-email-change")
async def confirm_email_change(request: Request, db: DbSession) -> HTMLResponse:
    usable = _usable_token((await _form(request)).get("token"))
    if usable is None:
        return _email_change_failed()
    try:
        await account_changes.confirm_email_change(db, token=usable)
    except AppError:
        return _email_change_failed()
    return _message("이메일을 바꿨어요", "이제 이 창을 닫고 Daymo 앱으로 돌아가 주세요. 다음 로그인부터 새 주소를 써 주세요.")


# ---------------------------------------------------------------------------
# 공간 초대
# ---------------------------------------------------------------------------


@router.get("/invite")
async def invite_page(token: str | None = None) -> HTMLResponse:
    """
    초대 링크가 여는 페이지. 공간 이름도, 초대한 사람도 보여 주지 않는다.

    참여는 앱에서만 한다. 로그인과 이메일 확인이 필요해서다. 이 페이지는 앱을 열고,
    앱이 열리지 않으면 링크를 앱에 붙여 넣는 길을 알려 준다.
    """
    usable = _usable_token(token)
    if usable is None:
        return _message("초대 링크", "링크가 잘못되었어요. 초대한 사람에게 링크를 다시 받아 주세요.", 400)
    앱_주소 = f"daymo://invite?token={usable}"
    return _page(
        "공간 초대",
        "<h1>Daymo 여행 공간에 초대받았어요</h1>"
        "<p>앱에서 로그인하면 바로 함께할 수 있어요.</p>"
        f'<a href="{escape(앱_주소)}" style="display:block;text-decoration:none">'
        '<button type="button">Daymo 앱에서 열기</button></a>'
        '<p style="margin-top:18px">앱이 열리지 않으면 이 페이지 주소를 복사해 Daymo 앱의 '
        "<strong>우리 → 초대 링크로 참여</strong>에 붙여 넣어 주세요. 링크는 받은 날부터 7일 동안 쓸 수 있어요.</p>",
    )
