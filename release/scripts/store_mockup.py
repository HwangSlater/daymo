"""
찍은 화면을 휴대폰 모형에 넣고 캡션을 얹어 스토어 규격으로 만든다.

    python store_mockup.py <화면폴더> <나갈폴더> <가로x세로> <iphone|galaxy>

화면 파일 이름은 `01-홈.png` 처럼 번호-화면이름이고, 캡션은 화면 이름으로 찾는다
(`store_compose.CAPTIONS`). 모형은 그림으로 그린다(남의 기기 사진을 쓰지 않는다).

- iphone: 둥근 네모 몸통, 가운데 위에 섬(다이내믹 아일랜드), 왼쪽 음량·동작 버튼, 오른쪽 전원.
- galaxy: 조금 더 각진 몸통, 가운데 위에 카메라 구멍, 오른쪽 음량·전원.
"""

import os
import re
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from store_compose import ACCENT, BOLD, CAPTIONS, INK, PAPER, REGULAR

BODY = (24, 26, 31)
RIM = (58, 62, 70)
BUTTON = (44, 47, 54)


def phone(screen: Image.Image, kind: str) -> Image.Image:
    """화면을 모형에 넣은 그림(투명 바탕)."""
    sw, sh = screen.size
    bezel = round(sw * 0.034)
    body_r = round(sw * (0.155 if kind == "iphone" else 0.11))
    screen_r = body_r - bezel
    side = round(sw * 0.012)  # 옆면 버튼이 몸통 밖으로 나온 두께
    W, H = sw + bezel * 2 + side * 2, sh + bezel * 2
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # 옆면 버튼. 몸통 뒤에 먼저 그려 가장자리만 보이게 한다.
    def 버튼(x, y, h):
        d.rounded_rectangle([x, y, x + side * 2, y + h], radius=side, fill=BUTTON)
    if kind == "iphone":
        버튼(0, round(H * 0.17), round(H * 0.035))   # 동작 버튼
        버튼(0, round(H * 0.235), round(H * 0.065))  # 음량 위
        버튼(0, round(H * 0.31), round(H * 0.065))   # 음량 아래
        버튼(W - side * 2, round(H * 0.25), round(H * 0.1))  # 전원
    else:
        버튼(W - side * 2, round(H * 0.2), round(H * 0.11))   # 음량
        버튼(W - side * 2, round(H * 0.34), round(H * 0.06))  # 전원

    # 몸통과 테두리 빛.
    d.rounded_rectangle([side, 0, W - side - 1, H - 1], radius=body_r, fill=RIM)
    d.rounded_rectangle([side + 3, 3, W - side - 4, H - 4], radius=body_r - 3, fill=BODY)

    # 화면. 모서리를 둥글게 잘라 넣는다.
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw - 1, sh - 1], radius=screen_r, fill=255)
    im.paste(screen.convert("RGB"), (side + bezel, bezel), mask)

    # 섬 또는 카메라 구멍.
    cx = side + bezel + sw // 2
    if kind == "iphone":
        iw, ih = round(sw * 0.29), round(sw * 0.085)
        top = bezel + round(sw * 0.028)
        d.rounded_rectangle([cx - iw // 2, top, cx + iw // 2, top + ih], radius=ih // 2, fill=(0, 0, 0))
    else:
        r = round(sw * 0.021)
        top = bezel + round(sw * 0.03)
        d.ellipse([cx - r, top, cx + r, top + r * 2], fill=(0, 0, 0))
    return im


def compose(shot_path, title, subtitle, out_path, W, H, kind):
    k = W / 1080
    n = lambda 값: round(값 * k)  # noqa: E731
    canvas = Image.new("RGBA", (W, H), PAPER + (255,))
    draw = ImageDraw.Draw(canvas)
    draw.text((W // 2, n(118)), title, font=ImageFont.truetype(BOLD, n(62)), fill=INK, anchor="mm")
    draw.text((W // 2, n(186)), subtitle, font=ImageFont.truetype(REGULAR, n(34)), fill=ACCENT, anchor="mm")

    shot = Image.open(shot_path).convert("RGB")
    ph = phone(shot, kind)
    top = n(250)
    room_h = H - top - n(50)
    room_w = W - n(110)
    scale = min(room_h / ph.height, room_w / ph.width)
    ph = ph.resize((round(ph.width * scale), round(ph.height * scale)), Image.LANCZOS)
    x = (W - ph.width) // 2

    # 그림자. 모형 모양을 흐려 아래로 조금 내린다.
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    alpha = ph.split()[3].point(lambda a: 70 if a else 0)
    shadow.paste((23, 35, 61, 255), (x, top + n(18)), alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(n(22)))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(ph, (x, top))
    canvas.convert("RGB").save(out_path, "PNG")


def main(src, dst, size, kind):
    w, h = (int(값) for 값 in size.lower().split("x"))
    os.makedirs(dst, exist_ok=True)
    for name in sorted(os.listdir(src)):
        if not re.match(r"\d{2}-", name) or not name.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        화면 = os.path.splitext(name)[0].split("-", 1)[1]
        title, subtitle = CAPTIONS.get(화면, ("", ""))
        compose(os.path.join(src, name), title, subtitle, os.path.join(dst, os.path.splitext(name)[0] + ".png"), w, h, kind)
        print("만듦:", name)
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:5]))
