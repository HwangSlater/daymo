"""앱 아이콘과 실행 화면을 그린다.

종이비행기가 휜 궤적을 따라 이름을 지나간다. 아이콘, 실행 화면, 파비콘이
모두 같은 그림을 쓴다. 그래야 홈 화면에서 누른 아이콘과 뜨는 화면이 한
그림으로 이어진다.

좌표는 320 x 620 짜리 화면 하나를 기준으로 잡았다. 실제로 만들 때는 이
좌표를 쓰임에 맞게 늘리거나 줄인다. 그리고 늘 4배로 그린 뒤 줄여서
가장자리를 매끈하게 만든다. PIL 의 다각형과 타원은 안티에일리어싱을 하지
않기 때문이다.

    python scripts/build-icons.py

만드는 파일
  assets/daymo-icon.png          1024      스토어와 iOS. 배경까지 채운 정사각형.
  assets/daymo-icon-adaptive.png 1024      안드로이드 적응형 아이콘의 앞면.
                                           배경은 app.json 의 backgroundColor 가 깐다.
                                           바깥 3분의 1은 기기에 따라 잘리므로
                                           그림을 가운데 안전 영역 안으로 줄인다.
  assets/daymo-icon-login.png     512      로그인 화면에 얹는 작은 아이콘.
  assets/daymo-splash.png        1024x704  실행 화면. 배경 없이 그림만, 잉크 남색.
  assets/daymo-splash-dark.png   1024x704  같은 그림, 어두운 모드용 흰색.
  assets/daymo-favicon.png         64      브라우저 탭. 아이콘과 같은 그림, 이름만 키운다.

실행 화면은 배경을 app.json 이 깔고 그림만 얹는다. 배경을 앱 배경색과 같게
두면 실행 화면에서 앱으로 넘어갈 때 색이 튀지 않는다. 그래서 그림 색이
모드마다 달라야 하고 파일이 두 장이다.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "assets" / "fonts" / "CookieRun-Bold.ttf"
OUT = ROOT / "assets"

SCALE = 4  # 4배로 그린 뒤 줄인다.

BACKGROUND = (63, 76, 143)  # #3F4C8F 만년필 잉크. 앱의 기본색과 같다.
MARK = (255, 255, 255)

# 실행 화면은 앱 배경 위에 그림만 얹는다. 색은 모드별 본문 색을 따른다.
SPLASH_INK_LIGHT = (63, 76, 143)
SPLASH_PAPER_LIGHT = (247, 245, 240)  # #F7F5F0 앱 배경
SPLASH_INK_DARK = (255, 255, 255)
SPLASH_PAPER_DARK = (13, 17, 26)  # #0D111A 앱 배경

# --- 그림 좌표. 320 x 620 짜리 화면 하나를 기준으로 잡는다. -----------------

# 궤적. 가운데 점이 두 끝을 잇는 선보다 위에 있어서 솟았다가 눕는다.
CURVE = ((46, 486), (160, 313), (274, 296))
TRAIL_COUNT = 7
TRAIL_FROM, TRAIL_TO = 0.16, 0.68
TRAIL_RADIUS = 9.0
TRAIL_ALPHA = 0.36

# 종이비행기. 0..100 상자 안에서 오른쪽 위 45도를 본다. 그만큼 되돌린 뒤
# 궤적의 진행 방향으로 돌려야 코가 선을 따라간다.
PLANE_UPPER = [(91.7, 8.3), (8.3, 37.5), (45.8, 54.2)]
PLANE_LOWER = [(91.7, 8.3), (45.8, 54.2), (62.5, 91.7)]
PLANE_PIVOT = (52.0, 48.0)  # 무게중심. 이 점이 궤적 위에 얹힌다.
PLANE_HEADING = -45.0
PLANE_AT = 0.80  # 궤적 위의 자리
PLANE_SIZE = 76.0
PLANE_UPPER_ALPHA = 0.58
PLANE_LOWER_ALPHA = 1.0

WORDMARK = "Daymo"
WORDMARK_SIZE = 56
WORDMARK_AT = (160, 392)
# 궤적이 글자 뒤로 지나가도록 글자 둘레를 배경색으로 한 번 두른다.
WORDMARK_HALO = 3.5

TAGLINE = "우리의 여행 수첩"
TAGLINE_SIZE = 12.5
TAGLINE_AT = (160, 418)
TAGLINE_ALPHA = 0.55

# 모눈. 실행 화면에만 깐다. 가장자리로 갈수록 흐려져서 종이를 오려 붙인
# 것처럼 보이지 않는다.
GRID_STEP = 13.0
GRID_ALPHA = 0.11
GRID_WIDTH = 1.0

# 실행 화면이 담는 범위. 모눈이 흐려져 사라지는 데까지 넉넉히 잡는다.
SPLASH_BOX = (0, 240, 320, 460)
SPLASH_PIXEL_WIDTH = 1024

# 안드로이드 적응형 아이콘에서 반드시 보이는 영역은 가운데 3분의 2다.
ADAPTIVE_SAFE = 0.66
# 정사각 아이콘에서 그림이 차지할 비율.
ICON_FIT = 0.78
# 아이콘 바탕의 모눈. 한 변을 이만큼 나누고 이 진하기로 긋는다. 실행 화면의
# 모눈과 같은 결이라 둘이 한 짝으로 읽힌다.
ICON_GRID = (12, 0.14)

# 파비콘. 아이콘과 같은 그림을 쓰되 이름을 1.3배 키우고 궤적을 넷으로 줄인다.
# 32px 에서는 아이콘의 축소판으로 읽히고, 16px 에서는 이름이 막대가 되지만
# 색과 비행기 자리가 같아 같은 앱으로 이어진다. 모눈은 작아지면 얼룩이라 뺀다.
# 64 는 탭의 16 과 2배 화면의 32 를 정수로 반씩 나눠 담는 크기다.
FAVICON_SIZE = 64
FAVICON_FIT = 0.92
FAVICON_TRAIL = 4
FAVICON_WORDMARK_SCALE = 1.3


def rgba(color, alpha):
    return color + (round(alpha * 255),)


def bezier(t):
    """궤적 위의 점."""
    (x0, y0), (x1, y1), (x2, y2) = CURVE
    k = 1 - t
    return (k * k * x0 + 2 * k * t * x1 + t * t * x2,
            k * k * y0 + 2 * k * t * y1 + t * t * y2)


def heading(t):
    """궤적 위의 진행 방향. 도 단위, 화면 좌표라 아래가 양수다."""
    (x0, y0), (x1, y1), (x2, y2) = CURVE
    k = 1 - t
    return math.degrees(math.atan2(2 * k * (y1 - y0) + 2 * t * (y2 - y1),
                                   2 * k * (x1 - x0) + 2 * t * (x2 - x1)))


def trail_points(count=TRAIL_COUNT, to=TRAIL_TO, frm=TRAIL_FROM):
    last = count - 1
    for i in range(count):
        t = frm + (to - frm) * (i / last)
        x, y = bezier(t)
        # 진행 방향으로 조금씩 키워야 어디로 가는 길인지 읽힌다.
        yield x, y, TRAIL_RADIUS * (0.44 + 0.56 * (i / last))


def plane_polygon(points, at=PLANE_AT, size=PLANE_SIZE):
    """비행기 한 조각을 궤적 위에 얹어 진행 방향으로 돌린다."""
    cx, cy = bezier(at)
    angle = math.radians(heading(at) - PLANE_HEADING)
    cos, sin = math.cos(angle), math.sin(angle)
    out = []
    for x, y in points:
        qx = (x - PLANE_PIVOT[0]) * size / 100
        qy = (y - PLANE_PIVOT[1]) * size / 100
        out.append((cx + qx * cos - qy * sin, cy + qx * sin + qy * cos))
    return out


class Canvas:
    """장면 좌표를 그림 좌표로 옮겨 주는 도화지.

    `scale` 과 `offset` 만 갈아 끼우면 같은 그림을 아이콘에도 실행 화면에도
    쓸 수 있다. 단위에는 이미 SCALE 이 곱해져 있다."""

    def __init__(self, size, scale, offset):
        self.image = Image.new("RGBA", (size[0] * SCALE, size[1] * SCALE), (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.image)
        self.scale = scale
        self.offset = offset

    def at(self, x, y):
        return ((x * self.scale + self.offset[0]) * SCALE,
                (y * self.scale + self.offset[1]) * SCALE)

    def size(self, value):
        return value * self.scale * SCALE

    def font(self, points):
        return ImageFont.truetype(str(FONT), max(1, round(self.size(points))))


def draw_grid(canvas, ink):
    """모눈을 깔고 가장자리를 흐린다.

    선을 그린 층을 따로 두고 둥근 알파 마스크를 씌운다. 선마다 투명도를
    바꿔 그리면 교차점이 두 번 칠해져 격자무늬가 얼룩덜룩해진다."""
    layer = Image.new("RGBA", canvas.image.size, (0, 0, 0, 0))
    pen = ImageDraw.Draw(layer)
    width = max(1, round(canvas.size(GRID_WIDTH)))
    color = rgba(ink, GRID_ALPHA)
    left, top = SPLASH_BOX[0], SPLASH_BOX[1]
    right, bottom = SPLASH_BOX[2], SPLASH_BOX[3]
    x = left
    while x <= right:
        pen.line([canvas.at(x, top), canvas.at(x, bottom)], fill=color, width=width)
        x += GRID_STEP
    y = top
    while y <= bottom:
        pen.line([canvas.at(left, y), canvas.at(right, y)], fill=color, width=width)
        y += GRID_STEP
    # 가운데는 그대로 두고 가장자리로 갈수록 지운다. 제곱을 씌워 가운데
    # 평평한 부분을 넓혀야 마크 뒤에서 모눈이 끊기지 않는다.
    fade = ImageOps.invert(Image.radial_gradient("L"))
    fade = fade.point(lambda v: round(255 * (v / 255) ** 0.55))
    layer.putalpha(Image.composite(
        layer.getchannel("A"),
        Image.new("L", layer.size, 0),
        fade.resize(layer.size, Image.BILINEAR),
    ))
    canvas.image.alpha_composite(layer)


def draw_scene(canvas, ink, halo=None, trail=TRAIL_COUNT, trail_to=TRAIL_TO,
               wordmark=True, tagline=False, trail_from=TRAIL_FROM):
    """궤적과 비행기와 이름을 그린다.

    작게 쓰는 파비콘은 이름을 빼고 궤적과 비행기만 그린다."""
    for x, y, r in trail_points(trail, trail_to, trail_from):
        cx, cy = canvas.at(x, y)
        rr = canvas.size(r)
        canvas.draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                            fill=rgba(ink, TRAIL_ALPHA))
    if wordmark:
        font = canvas.font(WORDMARK_SIZE)
        canvas.draw.text(
            canvas.at(*WORDMARK_AT), WORDMARK, font=font, fill=rgba(ink, 1.0),
            anchor="ms",
            stroke_width=round(canvas.size(WORDMARK_HALO)) if halo else 0,
            stroke_fill=rgba(halo, 1.0) if halo else None,
        )
    if tagline:
        canvas.draw.text(
            canvas.at(*TAGLINE_AT), TAGLINE, font=canvas.font(TAGLINE_SIZE),
            fill=rgba(ink, TAGLINE_ALPHA), anchor="ms",
        )
    # 비행기는 이름 위를 지나간다. 마지막에 그려야 위로 온다.
    for points, alpha in ((PLANE_UPPER, PLANE_UPPER_ALPHA), (PLANE_LOWER, PLANE_LOWER_ALPHA)):
        canvas.draw.polygon([canvas.at(x, y) for x, y in plane_polygon(points)],
                            fill=rgba(ink, alpha))


def scene_bounds(trail=TRAIL_COUNT, trail_to=TRAIL_TO, wordmark=True,
                 trail_from=TRAIL_FROM):
    """그림을 감싸는 상자를 장면 좌표에서 잰다."""
    xs, ys = [], []
    for x, y, r in trail_points(trail, trail_to, trail_from):
        xs += [x - r, x + r]
        ys += [y - r, y + r]
    for points in (PLANE_UPPER, PLANE_LOWER):
        for x, y in plane_polygon(points):
            xs.append(x)
            ys.append(y)
    if wordmark:
        font = ImageFont.truetype(str(FONT), WORDMARK_SIZE)
        left, top, right, bottom = font.getbbox(WORDMARK, anchor="ms")
        xs += [WORDMARK_AT[0] + left, WORDMARK_AT[0] + right]
        ys += [WORDMARK_AT[1] + top, WORDMARK_AT[1] + bottom]
    return min(xs), min(ys), max(xs), max(ys)


def fit_center(bounds, side, ratio):
    """상자를 정사각형의 ratio 만큼으로 줄이고 한가운데로 옮긴다."""
    left, top, right, bottom = bounds
    scale = side * ratio / max(right - left, bottom - top)
    return (side / 2 - (left + right) / 2 * scale,
            side / 2 - (top + bottom) / 2 * scale), scale


def finish(canvas, size, background=None):
    image = canvas.image
    if background is not None:
        base = Image.new("RGBA", image.size, background + (255,))
        base.alpha_composite(image)
        image = base
    return image.resize(size, Image.LANCZOS)


def draw_icon_grid(canvas, ink, cells, alpha, width=1.0):
    """아이콘 바탕에 모눈을 깐다. 한 변을 cells 칸으로 나눈다."""
    side = canvas.image.width
    step = side / cells
    pen = canvas.draw
    line = max(1, round(width * SCALE))
    for i in range(1, cells):
        pen.line([(step * i, 0), (step * i, side)], fill=rgba(ink, alpha), width=line)
        pen.line([(0, step * i), (side, step * i)], fill=rgba(ink, alpha), width=line)


def icon(side, ratio, background, transparent=False, grid=None):
    """grid 는 (칸 수, 투명도) 다. 없으면 민무늬."""
    bounds = scene_bounds()
    offset, scale = fit_center(bounds, side, ratio)
    canvas = Canvas((side, side), scale, offset)
    if grid:
        draw_icon_grid(canvas, MARK, grid[0], grid[1], width=side / 256)
    draw_scene(canvas, MARK, halo=None if transparent else background)
    return finish(canvas, (side, side), None if transparent else background)


def splash(ink, paper):
    left, top, right, bottom = SPLASH_BOX
    scale = SPLASH_PIXEL_WIDTH / (right - left)
    height = round((bottom - top) * scale)
    # 자리 옮김은 크기를 키운 뒤의 값이다. 장면 좌표로 주면 안 된다.
    canvas = Canvas((SPLASH_PIXEL_WIDTH, height), scale, (-left * scale, -top * scale))
    draw_grid(canvas, ink)
    draw_scene(canvas, ink, halo=paper, tagline=True)
    return finish(canvas, (SPLASH_PIXEL_WIDTH, height))


def favicon():
    global WORDMARK_SIZE
    # 이름만 키운 채로 상자를 재고 그린다. 재기 전에 키워야 잘리지 않는다.
    normal, WORDMARK_SIZE = WORDMARK_SIZE, round(WORDMARK_SIZE * FAVICON_WORDMARK_SCALE)
    try:
        bounds = scene_bounds(trail=FAVICON_TRAIL)
        offset, scale = fit_center(bounds, FAVICON_SIZE, FAVICON_FIT)
        canvas = Canvas((FAVICON_SIZE, FAVICON_SIZE), scale, offset)
        draw_scene(canvas, MARK, halo=BACKGROUND, trail=FAVICON_TRAIL)
    finally:
        WORDMARK_SIZE = normal
    return finish(canvas, (FAVICON_SIZE, FAVICON_SIZE), BACKGROUND)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    icon(1024, ICON_FIT, BACKGROUND, grid=ICON_GRID).convert("RGB").save(OUT / "daymo-icon.png")
    # 적응형 앞면은 안전 영역 안으로 줄인다. 배경은 app.json 이 깐다. 모눈은
    # 앞면에 그려야 바탕색 위에 얹히고, 런처가 어떤 모양으로 잘라도 끝까지 간다.
    icon(1024, ADAPTIVE_SAFE, BACKGROUND, transparent=True, grid=ICON_GRID).save(OUT / "daymo-icon-adaptive.png")
    icon(512, ICON_FIT, BACKGROUND, grid=ICON_GRID).convert("RGB").save(OUT / "daymo-icon-login.png")

    splash(SPLASH_INK_LIGHT, SPLASH_PAPER_LIGHT).save(OUT / "daymo-splash.png")
    splash(SPLASH_INK_DARK, SPLASH_PAPER_DARK).save(OUT / "daymo-splash-dark.png")

    # 탭 배경이 밝을지 어두울지 알 수 없으니 아이콘처럼 배경까지 채운다.
    favicon().convert("RGB").save(OUT / "daymo-favicon.png")

    for name in (
        "daymo-icon.png",
        "daymo-icon-adaptive.png",
        "daymo-icon-login.png",
        "daymo-splash.png",
        "daymo-splash-dark.png",
        "daymo-favicon.png",
    ):
        image = Image.open(OUT / name)
        print(f"{name}  {image.size[0]}x{image.size[1]}  {image.mode}")


if __name__ == "__main__":
    main()
