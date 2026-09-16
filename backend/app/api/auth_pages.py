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
from app.core.config import get_settings
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

# 앱과 같은 종이 노트 결. 밖에서 아무것도 불러오지 않으므로(CSP `default-src 'none'`)
# 글꼴도 그림도 쓰지 않는다. 종이·테이프·괘선은 모두 CSS 로 그린다.
_STYLE = """
:root { color-scheme: light dark; --bg:#F2EDE3; --paper:#FFFDF8; --text:#283046; --muted:#6F6758;
  --line:#E6DFD1; --rule:rgba(118,107,83,.14); --tape:rgba(214,189,146,.55);
  --accent:#3F4C8F; --on-accent:#FFFFFF; --danger:#B93A30; --shadow:rgba(60,48,30,.30); }
@media (prefers-color-scheme: dark) { :root { --bg:#111420; --paper:#1B202C; --text:#ECEEF4;
  --muted:#A2A899; --line:#2E3442; --rule:rgba(190,178,150,.12); --tape:rgba(214,189,146,.20);
  --accent:#A7B3EE; --on-accent:#131722; --danger:#F08A82; --shadow:rgba(0,0,0,.55); } }
* { box-sizing: border-box; }
/* 테이프가 종이 밖으로 나가 있어서 좁은 화면에서 가로 스크롤이 생긴다. */
html { overflow-x:hidden; }
body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
  padding:40px 18px; background:var(--bg); color:var(--text);
  font:15px/1.65 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
  -webkit-font-smoothing:antialiased; }
main { position:relative; width:100%; max-width:392px; background:var(--paper);
  border:1px solid var(--line); border-radius:6px; padding:30px 26px 26px 34px;
  transform:rotate(-0.5deg);
  box-shadow:0 1px 1px rgba(60,48,30,.05), 0 18px 34px -22px var(--shadow); }
/* 공책의 세로 여백선. 이 한 줄이 흰 판을 종이로 보이게 한다. */
main::after { content:""; position:absolute; top:0; bottom:0; left:18px; width:1px;
  background:var(--rule); }
/* 모서리에 붙인 테이프. 반쯤 종이 밖으로 나가 있어야 붙여 놓은 것처럼 보인다. */
.tape { position:absolute; width:84px; height:21px; background:var(--tape);
  border-left:1px dashed rgba(255,255,255,.4); border-right:1px dashed rgba(255,255,255,.4); }
.tape.l { top:13px; left:-27px; transform:rotate(-41deg); }
.tape.r { top:13px; right:-27px; transform:rotate(41deg); }
.brand { position:relative; margin:0 0 20px; font-size:17px; font-weight:800; letter-spacing:-0.4px;
  color:var(--accent); display:flex; align-items:center; gap:7px; }
.brand svg { display:block; overflow:visible; }
.brand::after { content:""; position:absolute; left:0; right:0; bottom:-10px; height:1px; background:var(--rule); }
h1 { font-size:22px; line-height:1.4; margin:0 0 10px; letter-spacing:-0.5px; font-weight:700; }
p { margin:0 0 14px; color:var(--muted); }
label { display:block; font-size:13px; font-weight:700; margin:16px 0 7px; color:var(--text); }
input { width:100%; height:48px; border-radius:8px; border:1px solid var(--line); padding:0 14px;
  font:inherit; background:var(--bg); color:var(--text); }
input:focus { outline:2px solid var(--accent); outline-offset:1px; border-color:transparent; }
button { width:100%; height:50px; margin-top:18px; border:0; border-radius:10px; background:var(--accent);
  color:var(--on-accent); font:inherit; font-size:15px; font-weight:700; letter-spacing:-0.2px; cursor:pointer; }
button:active { transform:translateY(1px); }
button.secondary { margin-top:10px; background:transparent; color:var(--accent); border:1px solid var(--line); }
a { color:var(--accent); }
a.plain { display:block; text-decoration:none; }
.note { margin:22px 0 0; padding-top:16px; border-top:1px dashed var(--line); font-size:13px; line-height:1.6; }
.error { color:var(--danger); font-weight:600; }
"""


# 앱 아이콘의 비행기와 지나온 자국. 파일을 불러오지 않고 문서 안에 그린다.
_MARK = (
    '<svg width="26" height="14" viewBox="0 0 26 14" fill="none" aria-hidden="true">'
    '<circle cx="2" cy="11.5" r="1.1" fill="currentColor" opacity=".35"/>'
    '<circle cx="6.4" cy="9.6" r="1.25" fill="currentColor" opacity=".55"/>'
    '<circle cx="11" cy="7.6" r="1.4" fill="currentColor" opacity=".75"/>'
    '<path d="M24.6 1.1 15.2 6.2a1 1 0 0 1-.9.03l-2.1-1 12.4-4.13Z" fill="currentColor"/>'
    '<path d="M24.6 1.1 17.4 9.9a1 1 0 0 1-.9.35l-2.3-.4L24.6 1.1Z" fill="currentColor" opacity=".8"/>'
    "</svg>"
)


def _page(title: str, body: str, status: int = 200) -> HTMLResponse:
    html = (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex">'
        f"<title>{escape(title)} · Daymo</title><style>{_STYLE}</style></head>"
        '<body><main><span class="tape l"></span><span class="tape r"></span>'
        f'<p class="brand">Daymo{_MARK}</p>{body}</main></body></html>'
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


def _web_invite_url(token: str) -> str:
    """웹 앱 주소에 초대 token 을 붙인다. 웹 앱이 읽자마자 주소에서 지운다."""
    기본 = get_settings().web_app_base.rstrip("/")
    구분 = "&" if "?" in 기본 else "?"
    return f"{기본}{구분}invite={token}"


@router.get("/invite")
async def invite_page(token: str | None = None) -> HTMLResponse:
    """
    초대 링크가 여는 페이지. 공간 이름도, 초대한 사람도 보여 주지 않는다.

    두 길을 준다. 앱이 있으면 앱으로(daymo://), 없으면 브라우저에서 웹 앱으로.
    어느 쪽이든 로그인·가입을 마치면 그 자리에서 참여한다. 링크를 복사해 붙여
    넣는 길은 둘 다 막혔을 때의 마지막 수단으로 남겨 둔다.
    """
    usable = _usable_token(token)
    if usable is None:
        return _message("초대 링크", "링크가 잘못되었어요. 초대한 사람에게 링크를 다시 받아 주세요.", 400)
    앱_주소 = f"daymo://invite?token={usable}"
    웹_주소 = _web_invite_url(usable)
    return _page(
        "공간 초대",
        "<h1>같이 가자고 초대했어요</h1>"
        "<p>일정도 준비물도 지출도 한곳에 모아 두는 여행 수첩이에요. "
        "아래에서 열면 로그인이나 가입을 마치는 대로 바로 들어가요.</p>"
        f'<a class="plain" href="{escape(웹_주소)}">'
        '<button type="button">웹에서 열기</button></a>'
        f'<a class="plain" href="{escape(앱_주소)}">'
        '<button type="button" class="secondary">앱에서 열기</button></a>'
        '<p class="note">이 링크는 받은 날부터 7일 동안 쓸 수 있어요. 둘 다 열리지 않으면 '
        "이 페이지 주소를 복사해 앱의 <strong>우리 → 초대 링크로 참여</strong>에 붙여 넣어 주세요.</p>",
    )
