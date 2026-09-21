"""
Google Play 그래픽 이미지(1024x500)를 만든다.

    python store_feature_graphic.py <다듬은아이폰폴더> [나갈파일]

`store_prepare.py iphone` 이 만든 폴더에서 캘린더·홈·추억카드 세 장을 아이폰 모형에 넣어
오른쪽에 부채꼴로 세우고, 왼쪽에 이름과 한 줄 소개를 적는다. 나갈 파일을 안 주면
`release/assets/play-feature-graphic.png` 에 쓴다. 플레이는 투명을 받지 않아 RGB 로 저장한다.
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from store_compose import ACCENT, BOLD, INK, PAPER, REGULAR, ROOT
from store_mockup import phone

W, H = 1024, 500
SUB = (100, 108, 122)

# (화면 파일, 폭, 가운데 x, 가운데 y, 기울기). 뒤에 적은 것이 위에 놓인다.
PHONES = [
    ("08-캘린더.png", 180, 622, 288, 8),
    ("07-추억카드.png", 180, 872, 288, -8),
    ("01-홈.png", 198, 749, 261, 0),
]


def 모형(path, width, angle):
    im = phone(Image.open(path).convert("RGB"), "iphone")
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    return im.rotate(angle, resample=Image.BICUBIC, expand=True)


def main(src, out=None):
    out = out or os.path.join(ROOT, "release", "assets", "play-feature-graphic.png")
    im = Image.new("RGBA", (W, H), PAPER + (255,))
    d = ImageDraw.Draw(im)
    d.text((72, 118), "Daymo", font=ImageFont.truetype(BOLD, 66), fill=ACCENT)
    d.multiline_text((72, 222), "연인·친구와 함께 쓰는\n여행 노트", font=ImageFont.truetype(BOLD, 32),
                     fill=INK, spacing=10)
    d.text((72, 330), "일정 · 준비물 · 비용 · 사진을 한 공간에", font=ImageFont.truetype(REGULAR, 18), fill=SUB)

    for name, width, cx, cy, angle in PHONES:
        p = 모형(os.path.join(src, name), width, angle)
        x, y = cx - p.width // 2, cy - p.height // 2
        # 그림자: 모형 모양 그대로 아래로 16px 내려 흐리게.
        shadow = Image.new("RGBA", p.size, (23, 35, 61, 0))
        shadow.putalpha(p.getchannel("A").point(lambda a: a * 56 // 255))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.paste(shadow, (x, y + 16), shadow)
        im = Image.alpha_composite(im, layer.filter(ImageFilter.GaussianBlur(11)))
        im.alpha_composite(p, (x, y))

    im.convert("RGB").save(out)
    print("만듦:", out)


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
