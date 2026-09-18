"""
메일 생김새.

앱의 종이 수첩 결을 그대로 가져온다. 크림색 종이에 테이프와 왼쪽 여백선을 두고,
그 위에 이름·제목·단추를 얹는다. 메일은 사용자가 앱 밖에서 만나는 유일한 화면이라
앱과 같은 얼굴이어야 어디서 온 것인지 바로 알고, 흉내 낸 메일과도 구별된다.

메일 HTML 은 웹과 규칙이 다르다. 여기서 지키는 것들:

- **표로 짠다.** 아웃룩은 flex 도 grid 도 모른다.
- **스타일은 태그 안에 적는다.** `<style>` 을 지우는 메일 앱이 있다.
- **바깥 그림을 쓰지 않는다.** 대부분의 메일 앱이 그림을 먼저 막아서, 그림으로
  만든 단추는 빈칸이 된다. 테이프도 색 칸으로 그린다.
- **글자체를 고르지 않는다.** 앱의 둥근 글씨는 메일에서 못 쓴다. 기기 기본 글씨로
  나오는 것이 정상이다.
- **글 판을 함께 보낸다.** 그림과 HTML 을 다 막아 둔 사람에게도 링크가 닿아야 한다.
"""

from html import escape

# 앱과 같은 색. 메일 앱은 CSS 변수를 모르니 값을 그대로 적는다.
_먹 = "#17233D"
_강조 = "#3F4C8F"
_흐린글 = "#6F6A62"
_종이 = "#FFFDF8"
_바탕 = "#F7F5F0"
_테두리 = "#E4DFD4"
_테이프 = "#E3D7B8"
_여백선 = "#DDE0EE"
_점선 = "#D9D3C6"

_글씨 = (
    "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',"
    "'맑은 고딕',Roboto,'Helvetica Neue',Arial,sans-serif"
)


def 편지_글(subject: str, body: str | None, link: str | None, 문의: str) -> str:
    """글 판. HTML 을 막아 둔 메일 앱이 이걸 보여 준다."""
    문단 = [subject]
    if body:
        문단.append(body)
    if link:
        문단.append(f"아래 링크는 30분 동안 한 번만 사용할 수 있어요.\n{link}")
    문단.append(f"이 메일은 발신 전용이에요. 문의: {문의}")
    return "\n\n".join(문단) + "\n"


def _단추(link: str, 이름: str) -> str:
    # 표 한 칸으로 만든 단추. `<a>` 에만 색을 깔면 아웃룩에서 글자만 파랗게 남는다.
    return f"""
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px">
          <tr>
            <td align="center" bgcolor="{_강조}" style="border-radius:10px">
              <a href="{escape(link, quote=True)}"
                 style="display:inline-block;padding:14px 28px;font-family:{_글씨};font-size:15px;
                        font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px">{escape(이름)}</a>
            </td>
          </tr>
        </table>"""


def 편지_html(subject: str, body: str | None, link: str | None, 문의: str, 단추_이름: str) -> str:
    """
    종이 한 장짜리 메일.

    `link` 가 있으면 단추와 「주소 그대로」 줄이 붙고, 없으면 알리기만 하는 메일이
    된다. 단추를 눌러 주지 않는 메일 앱이 있어서 주소 원문도 작게 함께 남긴다.
    """
    미리보기 = (body or subject).replace("\n", " ")[:90]
    본문 = ""
    if body:
        for 줄 in body.split("\n\n"):
            본문 += (
                f'<p style="margin:0 0 10px;font-family:{_글씨};font-size:15px;line-height:1.75;'
                f'color:#3D4657">{escape(줄).replace(chr(10), "<br>")}</p>'
            )
    if link:
        본문 += (
            f'<p style="margin:0;font-family:{_글씨};font-size:13.5px;line-height:1.7;'
            f'color:{_흐린글}">링크는 30분 동안 한 번만 쓸 수 있어요.</p>'
            + _단추(link, 단추_이름)
            + f'<p style="margin:10px 0 0;font-family:{_글씨};font-size:12px;line-height:1.6;'
            f'color:#8F8A82;word-break:break-all">단추가 안 눌리면 이 주소를 복사해 주세요<br>'
            f'{escape(link)}</p>'
        )
    꼬리 = "누른 적이 없다면 이 메일은 그냥 두셔도 돼요.<br>" if link else ""
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:{_바탕}">
<!-- 메일함 목록에서 제목 옆에 보이는 한 줄. 화면에는 안 나온다. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(미리보기)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:{_바탕}">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px">
        <tr>
          <td style="background-color:{_종이};border:1px solid {_테두리};border-radius:6px">
            <!-- 종이를 붙인 테이프. 그림을 막아 둔 메일 앱에서도 보이게 색 칸으로 그린다. -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding:0">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr><td width="86" height="14"
                            style="width:86px;height:14px;background-color:{_테이프};font-size:0;line-height:0">&nbsp;</td></tr>
                  </table>
                </td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <!-- 수첩의 왼쪽 여백선 -->
                <td width="28" style="width:28px;border-right:1px solid {_여백선};font-size:0;line-height:0">&nbsp;</td>
                <td style="padding:22px 24px 20px">
                  <div style="font-family:{_글씨};font-size:20px;font-weight:bold;color:{_강조};letter-spacing:0.5px">Daymo</div>
                  <h1 style="margin:14px 0 10px;font-family:{_글씨};font-size:23px;line-height:1.35;
                             font-weight:bold;color:{_먹}">{escape(subject)}</h1>
                  {본문}
                  <div style="border-top:1px dashed {_점선};margin:20px 0 12px;font-size:0;line-height:0">&nbsp;</div>
                  <div style="font-family:{_글씨};font-size:12px;line-height:1.7;color:#8F8A82">
                    {꼬리}이 메일은 발신 전용이에요. 문의: <a href="mailto:{escape(문의, quote=True)}"
                       style="color:{_강조};text-decoration:none">{escape(문의)}</a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:14px 8px 0;font-family:{_글씨};font-size:11.5px;color:#9A968F">
            둘이 쓰는 여행 수첩 · daymo.xyz
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""
