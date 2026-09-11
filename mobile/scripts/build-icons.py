"""앱 아이콘을 그린다.

배치는 종이비행기와 점선 궤적 아래에 워드마크를 두는 안, 색은 잉크 남색이다.
좌표는 1024 격자 기준이고, 실제로는 4배로 그린 뒤 줄여서 가장자리를 매끈하게
만든다. PIL의 다각형과 타원은 안티에일리어싱을 하지 않기 때문이다.

    python scripts/build-icons.py

만드는 파일
  assets/daymo-icon.png          1024  스토어와 iOS. 배경까지 채운 정사각형.
  assets/daymo-icon-adaptive.png 1024  안드로이드 적응형 아이콘의 앞면.
                                       배경은 app.json 의 backgroundColor 가 깐다.
                                       바깥 3분의 1은 기기에 따라 잘리므로
                                       그림을 가운데 안전 영역 안으로 줄인다.
  assets/daymo-icon-login.png     512  로그인 화면에 얹는 작은 아이콘.
  assets/daymo-splash.png        1024  실행 화면. 배경 없이 그림만, 잉크 남색.
  assets/daymo-splash-dark.png   1024  같은 그림, 어두운 모드용 흰색.
  assets/daymo-favicon.png         64  브라우저 탭. 종이비행기만 크게 넣는다.

실행 화면은 배경을 app.json 이 깔고 그림만 얹는다. 배경을 앱 배경색과 같게
두면 실행 화면에서 앱으로 넘어갈 때 색이 튀지 않는다. 그래서 그림 색이
모드마다 달라야 하고 파일이 두 장이다.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "assets" / "fonts" / "CookieRun-Bold.ttf"
OUT = ROOT / "assets"

SIZE = 1024
SCALE = 4  # 4배로 그린 뒤 줄인다.

BACKGROUND = (46, 52, 87)  # #2E3457 잉크 남색
MARK = (255, 255, 255)

# 실행 화면은 앱 배경 위에 그림만 얹는다. 색은 모드별 본문 색을 따른다.
SPLASH_INK_LIGHT = (46, 52, 87)
SPLASH_INK_DARK = (255, 255, 255)
# 그림이 화면 폭에서 차지할 비율. 아이콘보다 여유를 준다.
SPLASH_FIT = 0.86

# 안드로이드 적응형 아이콘에서 반드시 보이는 영역은 가운데 3분의 2다.
ADAPTIVE_SAFE = 0.66

# 파비콘. 탭에서는 16px 남짓으로 그려지므로 워드마크와 점선 궤적을 빼고
# 종이비행기만 남긴다. 셋을 다 넣으면 글자가 뭉개지고 비행기도 몇 픽셀로
# 줄어든다. 64는 탭의 16과 2배 화면의 32를 정수로 반씩 나눠 담는 크기다.
FAVICON_SIZE = 64
FAVICON_FIT = 0.76

WORDMARK = "Daymo"
WORDMARK_SIZE = 190
WORDMARK_BASELINE = 800

# 종이비행기. 0..100 상자 안에서 오른쪽 위를 향한다.
PLANE_UPPER = [(91.7, 8.3), (8.3, 37.5), (45.8, 54.2)]
PLANE_LOWER = [(91.7, 8.3), (45.8, 54.2), (62.5, 91.7)]
PLANE_AT = (590, 214)
PLANE_SIZE = 268

# 점선 궤적. 2차 베지에 위에 원을 찍는다. 점선 대신 원을 쓰는 이유는
# 개수와 크기를 정해야 작게 줄여도 몇 개가 남기 때문이다.
TRAIL_CURVE = ((180, 470), (360, 300), (566, 336))
TRAIL_COUNT = 4
TRAIL_RADIUS = 30

PLANE_UPPER_ALPHA = 0.58
PLANE_LOWER_ALPHA = 1.0
TRAIL_ALPHA = 0.48


def rgba(color, alpha):
    return color + (round(alpha * 255),)


def trail_points():
    (x0, y0), (x1, y1), (x2, y2) = TRAIL_CURVE
    last = TRAIL_COUNT - 1
    for i in range(TRAIL_COUNT):
        t = 0.12 + 0.78 * (i / last)
        k = 1 - t
        x = k * k * x0 + 2 * k * t * x1 + t * t * x2
        y = k * k * y0 + 2 * k * t * y1 + t * t * y2
        # 진행 방향으로 조금씩 키워야 어디로 가는 길인지 읽힌다.
        yield x, y, TRAIL_RADIUS * (0.62 + 0.38 * (i / last))


def plane_polygon(points):
    return [
        (PLANE_AT[0] + x * PLANE_SIZE / 100, PLANE_AT[1] + y * PLANE_SIZE / 100)
        for x, y in points
    ]


def draw_mark(draw, font, ink, offset=(0.0, 0.0), scale=1.0, trail=True, wordmark=True):
    """그림과 이름을 그린다. 좌표는 1024 격자, 단위는 이미 SCALE 이 곱해져 있다.

    작게 쓰는 파비콘은 궤적과 이름을 빼고 비행기만 그린다."""

    def at(x, y):
        return ((x * scale + offset[0]) * SCALE, (y * scale + offset[1]) * SCALE)

    if trail:
        for x, y, r in trail_points():
            cx, cy = at(x, y)
            rr = r * scale * SCALE
            draw.ellipse(
                [cx - rr, cy - rr, cx + rr, cy + rr],
                fill=rgba(ink, TRAIL_ALPHA),
            )
    draw.polygon(
        [at(x, y) for x, y in plane_polygon(PLANE_UPPER)],
        fill=rgba(ink, PLANE_UPPER_ALPHA),
    )
    draw.polygon(
        [at(x, y) for x, y in plane_polygon(PLANE_LOWER)],
        fill=rgba(ink, PLANE_LOWER_ALPHA),
    )
    if wordmark:
        draw.text(
            at(512, WORDMARK_BASELINE), WORDMARK, font=font, fill=rgba(ink, 1.0), anchor="ms"
        )


def font_at(scale):
    return ImageFont.truetype(str(FONT), round(WORDMARK_SIZE * scale * SCALE))


def render(
    background,
    ink,
    offset=(0.0, 0.0),
    scale=1.0,
    transparent=False,
    trail=True,
    wordmark=True,
):
    """그림은 늘 투명한 층에 알파 그대로 칠하고, 필요할 때만 배경 위에 얹는다.

    반투명 색을 배경색과 미리 섞어버리면 적응형 아이콘의 투명한 앞면에서
    점이 회색 덩어리가 된다."""
    canvas = SIZE * SCALE
    layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    font = font_at(scale) if wordmark else None
    draw_mark(ImageDraw.Draw(layer), font, ink, offset, scale, trail, wordmark)
    if not transparent:
        base = Image.new("RGBA", (canvas, canvas), background + (255,))
        base.alpha_composite(layer)
        layer = base
    return layer.resize((SIZE, SIZE), Image.LANCZOS)


def mark_bounds(trail=True, wordmark=True):
    """그림과 이름을 합친 테두리 상자를 1024 격자에서 잰다."""
    xs, ys = [], []
    if trail:
        for x, y, r in trail_points():
            xs += [x - r, x + r]
            ys += [y - r, y + r]
    for points in (PLANE_UPPER, PLANE_LOWER):
        for x, y in plane_polygon(points):
            xs.append(x)
            ys.append(y)
    if wordmark:
        font = ImageFont.truetype(str(FONT), WORDMARK_SIZE)
        left, top, right, bottom = font.getbbox(WORDMARK, anchor="ms")
        xs += [512 + left, 512 + right]
        ys += [WORDMARK_BASELINE + top, WORDMARK_BASELINE + bottom]
    return min(xs), min(ys), max(xs), max(ys)


def fit_center(bounds, ratio):
    """테두리 상자를 정사각형의 ratio 만큼으로 줄이고 한가운데로 옮긴다."""
    left, top, right, bottom = bounds
    scale = SIZE * ratio / max(right - left, bottom - top)
    offset = (
        SIZE / 2 - (left + right) / 2 * scale,
        SIZE / 2 - (top + bottom) / 2 * scale,
    )
    return offset, scale


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    render(BACKGROUND, MARK).convert("RGB").save(OUT / "daymo-icon.png")

    # 적응형 앞면은 안전 영역 안으로 줄이고 한가운데로 옮긴다.
    bounds = mark_bounds()
    adaptive_offset, adaptive_fit = fit_center(bounds, ADAPTIVE_SAFE)
    adaptive = render(
        BACKGROUND,
        MARK,
        offset=adaptive_offset,
        scale=adaptive_fit,
        transparent=True,
    )
    adaptive.save(OUT / "daymo-icon-adaptive.png")

    render(BACKGROUND, MARK).resize((512, 512), Image.LANCZOS).save(
        OUT / "daymo-icon-login.png"
    )

    # 실행 화면. 테두리 상자를 재서 한가운데로 맞추는 것은 적응형과 같다.
    splash_offset, splash_fit = fit_center(bounds, SPLASH_FIT)
    for ink, name in (
        (SPLASH_INK_LIGHT, "daymo-splash.png"),
        (SPLASH_INK_DARK, "daymo-splash-dark.png"),
    ):
        render(
            BACKGROUND, ink, offset=splash_offset, scale=splash_fit, transparent=True
        ).save(OUT / name)

    # 파비콘. 비행기만 재서 키우고, 1024로 그린 뒤 마지막에 줄인다.
    # 탭 배경이 밝을지 어두울지 알 수 없으니 아이콘처럼 배경까지 채운다.
    favicon_offset, favicon_fit = fit_center(
        mark_bounds(trail=False, wordmark=False), FAVICON_FIT
    )
    render(
        BACKGROUND,
        MARK,
        offset=favicon_offset,
        scale=favicon_fit,
        trail=False,
        wordmark=False,
    ).resize((FAVICON_SIZE, FAVICON_SIZE), Image.LANCZOS).convert("RGB").save(
        OUT / "daymo-favicon.png"
    )

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
