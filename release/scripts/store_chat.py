"""
스토어 스크린샷을 말풍선판으로 만든다. 위에 멤버끼리 나누는 대화, 아래 휴대폰 모형.

    python store_chat.py iphone <다듬은폴더> <나갈폴더>     # 1290x2796, App Store 10장
    python store_chat.py galaxy <다듬은폴더> <나갈폴더>     # 1080x2160, Play 8장
    python store_chat.py galaxy-916 <다듬은폴더> <나갈폴더> # 1080x1920, Play 추천 노출 규격

<다듬은폴더> 는 `store_prepare.py` 가 만든 것(`01-홈.png` …). 대화 문구와 짚을 자리는 아래 SHOTS 에 있다.
- 답이 작은 글자·숫자라 폰 안에서 안 읽히는 화면은 그 부분을 테두리로 짚고 크게 꺼내 폰 위에 얹는다.
- 사진처럼 폰 안에서도 잘 보이거나, 꺼내면 다른 내용을 가리는 화면은 테두리만 친다(RING_ONLY).
- 화면 전체가 답인 것(꾸민 카드)은 짚지 않는다(PLAIN).
짚을 자리는 화면 속 카드 가장자리를 픽셀로 잰 값이라, 화면을 다시 찍으면 다시 잰다.
대화는 실제 친구끼리 카톡하듯 쓴다. 답은 화면에 보이는 값과 맞아야 한다.

HTML 로 그려 Chromium(playwright)으로 찍는다. 글꼴은 앱 글꼴(CookieRun).
"""

import asyncio
import os
import sys
import tempfile

from PIL import Image
from playwright.async_api import async_playwright

from store_compose import BOLD, REGULAR
from store_mockup import phone

AVATAR = {"여울": "#4E9F6F", "가람": "#C4574F"}
RING_ONLY = {"02-일정", "06-기록"}
PLAIN = {"07-추억카드"}

# 화면: (묻는 사람, 질문, 시각, 답, 시각, 짚을 자리(아이폰 1290 폭 화면), 그 자리의 모서리 둥글기)
# 묻는 사람이 None 이면 내 말만 있다.
SHOTS = {
    "01-홈": ("여울", "우리 체크인 몇 시더라?", "오후 2:14", "15일 오후 3시!", "오후 2:15", (806, 1800, 1162, 1930), 30),
    "02-일정": ("가람", "올라오는 버스 몇 시였지?", "오전 10:20", "2시 버스. 4시 40분 도착", "오전 10:21", (66, 2030, 622, 2418), 40),
    "03-준비": ("여울", "나 뭐 챙기면 돼?", "오후 8:47", "네 거 하나 적어 놨어", "오후 8:48", (76, 1212, 1101, 1351), 30),
    "04-요리": ("가람", "마트 들러야 돼?", "오후 6:05", "응 세 개만 사면 돼", "오후 6:06", (66, 1076, 1226, 1318), 36),
    "05-비용": ("여울", "정산 어떻게 됐어?", "오후 9:02", "내가 86,600원 보내면 끝!", "오후 9:03", (118, 1512, 1173, 1706), 46),
    "06-기록": ("여울", "강릉 사진 좀 보내 줘", "오후 11:12", "데이모에 다 저장해 둘게", "오후 11:13", (64, 1322, 1198, 1688), 30),
    "07-추억카드": ("가람", "우리 찍은 사진 너무 밋밋해. 좀 꾸며 줘", "오후 10:31", "이렇게 하면 어때?", "오후 10:40", None, 0),
    "08-캘린더": ("여울", "이번 주 다들 바빠?", "오전 11:40", "24일은 좀 어렵겠다", "오전 11:41", (80, 1642, 1170, 1785), 30),
    "09-찾기": ("가람", "전주에서 간 찻집 이름 뭐였지?", "오후 3:26", "한옥 골목 찻집!", "오후 3:27", (66, 1836, 1226, 2240), 36),
    "10-우리": (None, "", "", "여기서 같이 정리하자. 초대 보낼게!", "오후 7:59", (66, 1000, 1226, 1314), 36),
}
# 갤럭시 S21(1080 폭) 화면에서 잰 자리. 준비의 칩 줄은 「공용」이 화면 끝에서 잘려 「가람」까지만. 찾기·우리는 Play 에서 뺐다.
GALAXY_BOX = {
    "01-홈": ((628, 1505, 958, 1625), 26),
    "02-일정": ((62, 1787, 518, 2156), 36),
    "03-준비": ((72, 1022, 841, 1154), 26),
    "04-요리": ((62, 883, 1018, 1112), 30),
    "05-비용": ((112, 1304, 968, 1484), 36),
    "06-기록": ((60, 1136, 1000, 1436), 26),
    "07-추억카드": (None, 0),
    "08-캘린더": ((70, 1434, 1000, 1580), 24),
}

# 기기별: 폰 그림에서 화면이 시작하는 자리·폰 전체 폭(store_mockup.phone 이 정한다), 그리는 높이, 나갈 크기.
# 갤럭시는 1290 폭에 같은 1:2 비율로 그린 뒤 1080x2160 으로 줄인다.
DEVICE = {
    "iphone": {"screen_x": 59, "screen_y": 44, "phone_w": 1408, "page_h": 2796, "size": (1290, 2796)},
    "galaxy": {"screen_x": 50, "screen_y": 37, "phone_w": 1180, "page_h": 2580, "size": (1080, 2160)},
    # Play 추천 노출은 세로 9:16(1080x1920 이상)만 받는다. 1:2 보다 짧아 폰을 조금 줄인다.
    "galaxy-916": {"screen_x": 50, "screen_y": 37, "phone_w": 1180, "page_h": 2293, "size": (1080, 1920),
                   "phone": (295, 740, 700)},
}


def css(page_h):
    return f"""<meta charset="utf-8"><style>
@font-face{{font-family:CR;src:url("{BOLD.replace(os.sep, '/')}");font-weight:700}}
@font-face{{font-family:CR;src:url("{REGULAR.replace(os.sep, '/')}");font-weight:400}}
*{{box-sizing:border-box;margin:0}}
body{{width:1290px;height:{page_h}px;overflow:hidden;font-family:CR,sans-serif;position:relative;background:#EEF0F7}}
.room{{position:absolute;left:0;right:0;top:110px;text-align:center;font-size:40px;color:#646C7A}}
.room b{{color:#17233D}}
.chat{{position:absolute;left:80px;right:80px;top:205px;display:flex;flex-direction:column;gap:34px}}
.q{{display:flex;gap:26px;align-items:flex-start}}
.av{{width:112px;height:112px;border-radius:50%;color:#fff;font-size:48px;font-weight:700;
 display:flex;align-items:center;justify-content:center;flex:none}}
.who{{font-size:38px;color:#646C7A;margin:6px 0 12px 8px}}
.line{{display:flex;gap:18px;align-items:flex-end}}
.b{{font-size:66px;font-weight:700;line-height:1.25;padding:30px 46px;border-radius:52px;max-width:820px;
 text-wrap:balance;word-break:keep-all}}
.q .b{{background:#fff;color:#17233D;border-top-left-radius:12px;box-shadow:0 10px 26px rgba(23,35,61,.08)}}
.me{{align-self:flex-end}}
.me .b{{background:#3F4C8F;color:#fff;border-top-right-radius:12px;box-shadow:0 10px 26px rgba(63,76,143,.28)}}
.tm{{font-size:32px;color:#8A90A0;white-space:nowrap;padding-bottom:6px}}
.ph{{position:absolute;filter:drop-shadow(0 40px 60px rgba(23,35,61,.26))}}
.ring{{position:absolute;border:5px solid #3F4C8F}}
.zoom{{position:absolute;overflow:hidden;background:#fff;box-shadow:0 30px 60px rgba(23,35,61,.30),0 0 0 5px #3F4C8F}}
.zoom img{{display:block;width:100%}}
</style>"""


def page(name, shot, dev, work, src):
    who, q, qt, a, at, box, r = shot
    L, T, W = dev.get("phone", (215, 790, 860))
    k = W / dev["phone_w"]
    marks = ""
    if box and name not in PLAIN:
        x1, y1, x2, y2 = box
        rx, ry = L + (dev["screen_x"] + x1) * k, T + (dev["screen_y"] + y1) * k
        rw, rh = (x2 - x1) * k, (y2 - y1) * k
        gap = 12  # 테두리와 짚은 자리 사이
        marks = (f'<div class="ring" style="left:{rx - gap}px;top:{ry - gap}px;width:{rw + gap * 2}px;'
                 f'height:{rh + gap * 2}px;border-radius:{r * k + gap}px"></div>')
        if name not in RING_ONLY:
            # 꺼낸 조각은 폭 1080, 높이 620 을 넘지 않게. 아래에 자리가 있으면 테두리 아래, 없으면 위.
            z = min(2.2, 1080 / rw, 620 / rh)
            zw, zh = rw * z, rh * z
            zx = max(70, min(1290 - 70 - zw, rx + rw / 2 - zw / 2))
            zy = ry + rh + 44 if ry + rh + 44 + zh < dev["page_h"] - 106 else ry - zh - 44
            cut = os.path.join(work, f"cut-{name}.png")
            Image.open(os.path.join(src, name + ".png")).crop(box).save(cut)
            marks += (f'<div class="zoom" style="left:{zx}px;top:{zy}px;width:{zw}px;border-radius:{r * z}px">'
                      f'<img src="{cut.replace(os.sep, "/")}"></div>')
    ask = "" if who is None else (
        f'<div class="q"><div class="av" style="background:{AVATAR[who]}">{who[0]}</div>'
        f'<div><div class="who">{who}</div><div class="line"><div class="b">{q}</div><div class="tm">{qt}</div></div></div></div>')
    ph = os.path.join(work, f"phone-{name}.png").replace(os.sep, "/")
    return css(dev["page_h"]) + f"""
<div class="room"><b>주말 여행 메이트</b> 3</div>
<div class="chat">{ask}<div class="me line"><div class="tm">읽음 · {at}</div><div class="b">{a}</div></div></div>
<img class="ph" style="left:{L}px;top:{T}px;width:{W}px" src="{ph}">
{marks}"""


async def main(kind, src, dst):
    dev = DEVICE[kind]
    shots = SHOTS if kind == "iphone" else {k: v[:5] + GALAXY_BOX[k] for k, v in SHOTS.items() if k in GALAXY_BOX}
    os.makedirs(dst, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            pg = await browser.new_page(viewport={"width": 1290, "height": dev["page_h"]}, device_scale_factor=1)
            for name, shot in shots.items():
                phone(Image.open(os.path.join(src, name + ".png")).convert("RGB"), kind.split("-")[0]).save(
                    os.path.join(work, f"phone-{name}.png"))
                html = os.path.join(work, f"{name}.html")
                with open(html, "w", encoding="utf-8") as f:
                    f.write(page(name, shot, dev, work, src))
                await pg.goto("file:///" + html.replace(os.sep, "/"))
                await pg.wait_for_timeout(500)
                shot_path = os.path.join(work, f"{name}-shot.png")
                await pg.screenshot(path=shot_path)
                # 스토어는 투명 채널이 있는 PNG 를 받지 않는다.
                Image.open(shot_path).convert("RGB").resize(dev["size"], Image.LANCZOS).save(os.path.join(dst, name + ".png"))
                print("만듦:", name)
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:4]))
