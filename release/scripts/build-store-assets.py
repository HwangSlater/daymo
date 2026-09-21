"""
Google Play 에 올리는 아이콘(512×512)을 만든다.

    cd backend && uv run python ../release/scripts/build-store-assets.py

그림은 앱 아이콘(mobile/assets/daymo-icon.png)을 그대로 쓴다. 아이콘을 바꾸면 다시 돌린다.

그래픽 이미지(1024×500, `play-feature-graphic.png`)는 여기서 만들지 않는다. 2026-09-21 에
아이콘만 있던 배너를 실제 앱 화면 세 장을 휴대폰 모형에 넣은 배너로 바꿨다. 그 그림은
기기에서 찍은 스크린샷으로 만들어서 이 스크립트가 다시 만들 수 없다. 예전 배너를 그리던
`feature_graphic()` 은 남겨 두되, 기본으로는 부르지 않는다(`--old-banner` 를 줄 때만).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ICON = ROOT / "mobile/assets/daymo-icon.png"
FONT_BOLD = ROOT / "mobile/assets/fonts/CookieRun-Bold.ttf"
FONT_REGULAR = ROOT / "mobile/assets/fonts/CookieRun-Regular.ttf"
OUT = ROOT / "release/assets"

INK = (63, 76, 143)  # #3F4C8F 앱의 기본색
PAPER = (247, 245, 240)  # #F7F5F0 앱 배경
SCALE = 2


def play_icon() -> Path:
    # Play 는 512×512 32비트 PNG 를 받고 모서리를 스스로 둥글린다. 투명 없이 꽉 채운 원본 아이콘을 줄인다.
    icon = Image.open(ICON).convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
    path = OUT / "play-icon-512.png"
    icon.save(path, optimize=True)
    return path


def feature_graphic() -> Path:
    width, height = 1024 * SCALE, 500 * SCALE
    canvas = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(canvas)

    side = 300 * SCALE
    icon = Image.open(ICON).convert("RGBA").resize((side, side), Image.Resampling.LANCZOS)
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, side, side), radius=68 * SCALE, fill=255)
    left = 110 * SCALE
    top = (height - side) // 2
    canvas.paste(icon, (left, top), mask)

    title = ImageFont.truetype(str(FONT_BOLD), 92 * SCALE)
    line = ImageFont.truetype(str(FONT_REGULAR), 40 * SCALE)
    text_left = left + side + 64 * SCALE
    draw.text((text_left, 170 * SCALE), "Daymo", font=title, fill=INK, anchor="ls")
    draw.text((text_left, 262 * SCALE), "함께 떠나고,", font=line, fill=(23, 35, 61), anchor="ls")
    draw.text((text_left, 322 * SCALE), "오래 기억하는 여행", font=line, fill=(23, 35, 61), anchor="ls")
    draw.text((text_left, 392 * SCALE), "일정 · 준비물 · 비용 · 사진", font=ImageFont.truetype(str(FONT_REGULAR), 28 * SCALE), fill=(91, 100, 116), anchor="ls")

    path = OUT / "play-feature-graphic.png"
    canvas.resize((1024, 500), Image.Resampling.LANCZOS).save(path, optimize=True)
    return path


if __name__ == "__main__":
    import sys

    OUT.mkdir(parents=True, exist_ok=True)
    # 지금 배너를 덮어쓰지 않게, 예전 배너는 달라고 할 때만 만든다.
    for made in (play_icon(), *([feature_graphic()] if "--old-banner" in sys.argv else [])):
        with Image.open(made) as image:
            print(made.relative_to(ROOT), image.size, made.stat().st_size, "bytes")
