"""앱 아이콘과 실행 화면을 그린다.

비행기가 휜 궤적을 따라 이름을 지나간다. 아이콘, 실행 화면, 파비콘이
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
  assets/daymo-splash-android.png      1024  안드로이드 실행 화면. 원 안에 맞춘 정사각형.
  assets/daymo-splash-android-dark.png 1024  같은 그림, 어두운 모드용 흰색.
  assets/daymo-favicon.png         64      브라우저 탭. 아이콘과 같은 그림, 이름만 키운다.

  ../docs/design/logos/                    소셜 로그인 콘솔에 올리는 로고. 앱에 들어가지 않는다.
    daymo-logo-google-120.png     120      Google Auth Platform 브랜딩. 정사각 120px, 1MB 이하.
    daymo-logo-naver-140.png      140      네이버 로그인 애플리케이션 로고. 140px.
    daymo-logo-kakao-128.png      128      카카오 앱 아이콘. 128px 이하 권장, 250KB 미만.

실행 화면은 배경을 app.json 이 깔고 그림만 얹는다. 배경을 앱 배경색과 같게
두면 실행 화면에서 앱으로 넘어갈 때 색이 튀지 않는다. 그래서 그림 색이
모드마다 달라야 하고 파일이 두 장이다.

바탕에 모눈을 깔지 않는다. 예전에는 아이콘과 실행 화면에 수첩 모눈을
깔았는데, 작은 크기에서는 그림 뒤의 잡음이 되어 비행기와 이름을 흐렸다.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "assets" / "fonts" / "CookieRun-Bold.ttf"
OUT = ROOT / "assets"
LOGO_OUT = ROOT.parent / "docs" / "design" / "logos"
# 콘솔마다 요구하는 크기. 동의 화면이 로고를 원이나 둥근 사각형으로 자르므로 앱
# 아이콘과 같이 원 안에 맞춘 그림을 그 크기로 새로 그린다. 1024 를 줄이는 것보다
# 글자 가장자리가 또렷하다.
LOGOS = (
    ("daymo-logo-google-120.png", 120),
    ("daymo-logo-naver-140.png", 140),
    ("daymo-logo-kakao-128.png", 128),
)

SCALE = 4  # 4배로 그린 뒤 줄인다.

BACKGROUND = (63, 76, 143)  # #3F4C8F 만년필 잉크. 앱의 기본색과 같다.
MARK = (255, 255, 255)

# 실행 화면은 앱 배경 위에 그림만 얹는다. 색은 모드별 본문 색을 따른다.
SPLASH_INK_LIGHT = (63, 76, 143)
SPLASH_PAPER_LIGHT = (247, 245, 240)  # #F7F5F0 앱 배경
SPLASH_INK_DARK = (255, 255, 255)
SPLASH_PAPER_DARK = (13, 17, 26)  # #0D111A 앱 배경

# --- 그림 좌표. 320 x 620 짜리 화면 하나를 기준으로 잡는다. -----------------

# 궤적. 이름 왼쪽 아래에서 올라와 이름 뒤를 지나 오른쪽 위의 비행기로 이어진다.
# 가운데 점이 두 끝을 잇는 선보다 위에 있어서 솟았다가 눕는다.
#
# 모서리에 닿지 않게 그림 전체를 가운데 원 안에 맞춘다(fit_circle). 기기는 아이콘
# 모서리를 둥글게(iOS) 또는 원으로(Android) 자른다. 이 대각선 그림을 처음 썼을 때는
# 그림을 감싸는 상자로 맞춰서, 실제 기기에서 오른쪽 위 비행기와 왼쪽 D 가 잘렸다.
#
# 이름 위를 넘는 궤적, 위로 솟는 비행기도 써 봤지만 이 대각선으로 돌아왔다
# (2026-09-15). 예전 그림은 docs/design/icon-archive 에 있다.
CURVE = ((46, 486), (160, 313), (274, 296))
TRAIL_COUNT = 7
TRAIL_FROM, TRAIL_TO = 0.16, 0.68
TRAIL_RADIUS = 9.0
TRAIL_ALPHA = 0.36

def _arc(cx, cy, r, start, end, steps=8):
    """원의 한 토막을 점으로 늘어놓는다. 각도는 도 단위."""
    return [
        (cx + r * math.cos(math.radians(start + (end - start) * i / steps)),
         cy + r * math.sin(math.radians(start + (end - start) * i / steps)))
        for i in range(steps + 1)
    ]


def _capsule(p1, p2, r):
    """두 점을 잇는 끝이 둥근 막대."""
    (x1, y1), (x2, y2) = p1, p2
    a = math.degrees(math.atan2(y2 - y1, x2 - x1))
    return _arc(x2, y2, r, a - 90, a + 90) + _arc(x1, y1, r, a + 90, a + 270)


# 비행기. 위에서 본 둥근 만화풍이다. 0..100 상자 안에서 오른쪽을 본다.
#
# 몸통을 굵게, 날개 끝을 둥글게, 뒤로 덜 젖혔다. 이름을 쓰는 쿠키런 글씨가
# 둥글고 도톰해서 날카로운 제트기보다 결이 맞고, 홈 화면의 29px 까지 줄여도
# 비행기 모양이 남는다. 예전의 종이비행기(삼각형 둘)는 마우스 커서처럼 읽혔다.
#
# 조각이 겹치는 자리는 같은 색이라 한 덩어리로 보인다.
PLANE_SHAPES = [
    (_capsule((12, 50), (84, 50), 10), 1.0),   # 몸통
    (_capsule((56, 50), (42, 10), 7.5), 1.0),  # 주날개
    (_capsule((56, 50), (42, 90), 7.5), 1.0),
    (_capsule((20, 50), (12, 30), 5.5), 1.0),  # 꼬리날개
    (_capsule((20, 50), (12, 70), 5.5), 1.0),
]
# 궤적 위에 얹히는 점. 꼬리 쪽에 둔다. 몸통 한가운데를 얹으면 꼬리가 궤적의
# 마지막 점을 덮어서 뒤쪽이 지저분해진다.
PLANE_PIVOT = (12.0, 50.0)
PLANE_HEADING = 0.0  # 상자 안의 그림이 보는 방향. 궤적의 진행 방향으로 돌린다.
PLANE_AT = 0.80  # 궤적 위의 자리
PLANE_SIZE = 74.0

WORDMARK = "Daymo"
WORDMARK_SIZE = 56
WORDMARK_AT = (160, 392)
# 궤적이 글자 뒤로 지나가도록 글자 둘레를 배경색으로 한 번 두른다.
WORDMARK_HALO = 3.5

TAGLINE = "우리의 여행 수첩"
TAGLINE_SIZE = 12.5
TAGLINE_AT = (160, 418)
TAGLINE_ALPHA = 0.55

# 실행 화면이 담는 범위. app.json 의 imageWidth 와 비율이 맞아야 해서 예전
# 모눈을 깔던 때의 크기(320 x 220)를 그대로 둔다.
SPLASH_BOX = (0, 240, 320, 460)
SPLASH_PIXEL_WIDTH = 1024

# 안드로이드 12 부터는 실행 화면 그림을 288dp 정사각형 가운데 지름 192dp 원으로
# 자른다(배경 없는 아이콘 규칙). iOS 용 가로 그림을 그대로 주면 오른쪽 위 비행기와
# 이름 양 끝이 잘려서, 안드로이드에는 원 안에 맞춘 정사각형을 따로 준다.
# app.json 의 android.imageWidth 를 288 로 두어야 그림 한 변이 캔버스와 맞는다.
# 원 반지름은 한 변의 1/3 이고, 조금 안쪽으로 맞춘다.
ANDROID_SPLASH_SIDE = 1024
ANDROID_SPLASH_RADIUS = 0.31

# 안드로이드 적응형 아이콘은 108dp 중 가운데 지름 66dp 원이 어떤 런처에서도
# 보인다. 그림의 모든 점이 그 원 안에 들도록 맞춘다(반지름 비율). 상자로 맞추면
# 상자 모서리가 원 밖으로 나가 잘린다.
ADAPTIVE_SAFE_RADIUS = 0.30
# 정사각 아이콘에서 그림이 들어갈 원의 반지름 비율. iOS 둥근 사각형(모서리 반지름
# 22%)은 대각선으로 가운데에서 61% 까지 보이므로 44% 원이면 넉넉하다.
ICON_RADIUS = 0.44
# 파비콘. 아이콘과 같은 그림을 쓰되 이름을 1.3배 키우고 궤적을 넷으로 줄인다.
# 32px 에서는 아이콘의 축소판으로 읽히고, 16px 에서는 이름이 막대가 되지만
# 색과 비행기 자리가 같아 같은 앱으로 이어진다.
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
    for points, alpha in PLANE_SHAPES:
        canvas.draw.polygon([canvas.at(x, y) for x, y in plane_polygon(points)],
                            fill=rgba(ink, alpha))


def scene_bounds(trail=TRAIL_COUNT, trail_to=TRAIL_TO, wordmark=True,
                 trail_from=TRAIL_FROM):
    """그림을 감싸는 상자를 장면 좌표에서 잰다."""
    xs, ys = [], []
    for x, y, r in trail_points(trail, trail_to, trail_from):
        xs += [x - r, x + r]
        ys += [y - r, y + r]
    for points, _ in PLANE_SHAPES:
        for x, y in plane_polygon(points):
            xs.append(x)
            ys.append(y)
    if wordmark:
        font = ImageFont.truetype(str(FONT), WORDMARK_SIZE)
        left, top, right, bottom = font.getbbox(WORDMARK, anchor="ms")
        xs += [WORDMARK_AT[0] + left, WORDMARK_AT[0] + right]
        ys += [WORDMARK_AT[1] + top, WORDMARK_AT[1] + bottom]
    return min(xs), min(ys), max(xs), max(ys)


def scene_points(trail=TRAIL_COUNT, trail_to=TRAIL_TO, trail_from=TRAIL_FROM,
                 tagline=False):
    """그림의 가장자리 점들. 원 안에 맞출 때 쓴다."""
    points = []
    for x, y, r in trail_points(trail, trail_to, trail_from):
        points += [(x + r * math.cos(a * math.pi / 8), y + r * math.sin(a * math.pi / 8)) for a in range(16)]
    for shape, _ in PLANE_SHAPES:
        points += plane_polygon(shape)
    font = ImageFont.truetype(str(FONT), WORDMARK_SIZE)
    left, top, right, bottom = font.getbbox(WORDMARK, anchor="ms")
    x0, y0 = WORDMARK_AT
    points += [(x0 + left, y0 + top), (x0 + right, y0 + top), (x0 + left, y0 + bottom), (x0 + right, y0 + bottom)]
    if tagline:
        font = ImageFont.truetype(str(FONT), TAGLINE_SIZE)
        left, top, right, bottom = font.getbbox(TAGLINE, anchor="ms")
        x0, y0 = TAGLINE_AT
        points += [(x0 + left, y0 + top), (x0 + right, y0 + top), (x0 + left, y0 + bottom), (x0 + right, y0 + bottom)]
    return points


def enclosing_circle(points):
    """
    모든 점을 담는 가장 작은 원을 어림한다. (중심 x, 중심 y, 반지름)

    상자 가운데를 중심으로 잡지 않는다. 대각선 그림은 그러면 비행기 쪽 끝이 원에
    먼저 닿아서 그림 전체가 쓸데없이 작아진다. 가장 먼 점까지의 거리가 줄어드는
    쪽으로 중심을 옮기고, 더 줄지 않으면 걸음을 반으로 줄인다.
    """
    xs, ys = [x for x, _ in points], [y for _, y in points]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    step = max(max(xs) - min(xs), max(ys) - min(ys)) / 4

    def far(x, y):
        return max(math.hypot(px - x, py - y) for px, py in points)

    best = far(cx, cy)
    while step > 0.01:
        moved = False
        for dx, dy in ((step, 0), (-step, 0), (0, step), (0, -step)):
            value = far(cx + dx, cy + dy)
            if value < best:
                best, cx, cy, moved = value, cx + dx, cy + dy, True
        if not moved:
            step /= 2
    return cx, cy, best


def fit_circle(side, radius_ratio, tagline=False):
    """모든 점이 가운데 원 안에 들어오게 줄이고 옮긴다. 원형으로 잘라도 안 잘린다."""
    cx, cy, far = enclosing_circle(scene_points(tagline=tagline))
    scale = side * radius_ratio / far
    return (side / 2 - cx * scale, side / 2 - cy * scale), scale


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


def icon(side, ratio, background, transparent=False, radius=None):
    if radius is None:
        offset, scale = fit_center(scene_bounds(), side, ratio)
    else:
        offset, scale = fit_circle(side, radius)
    canvas = Canvas((side, side), scale, offset)
    draw_scene(canvas, MARK, halo=None if transparent else background)
    return finish(canvas, (side, side), None if transparent else background)


def splash(ink, paper):
    left, top, right, bottom = SPLASH_BOX
    scale = SPLASH_PIXEL_WIDTH / (right - left)
    height = round((bottom - top) * scale)
    # 자리 옮김은 크기를 키운 뒤의 값이다. 장면 좌표로 주면 안 된다.
    canvas = Canvas((SPLASH_PIXEL_WIDTH, height), scale, (-left * scale, -top * scale))
    draw_scene(canvas, ink, halo=paper, tagline=True)
    return finish(canvas, (SPLASH_PIXEL_WIDTH, height))


def android_splash(ink, paper):
    side = ANDROID_SPLASH_SIDE
    offset, scale = fit_circle(side, ANDROID_SPLASH_RADIUS, tagline=True)
    canvas = Canvas((side, side), scale, offset)
    draw_scene(canvas, ink, halo=paper, tagline=True)
    return finish(canvas, (side, side))


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

    icon(1024, None, BACKGROUND, radius=ICON_RADIUS).convert("RGB").save(OUT / "daymo-icon.png")
    # 적응형 앞면은 안전 영역 안으로 줄인다. 배경은 app.json 이 깐다.
    icon(1024, None, BACKGROUND, transparent=True, radius=ADAPTIVE_SAFE_RADIUS).save(OUT / "daymo-icon-adaptive.png")
    icon(512, None, BACKGROUND, radius=ICON_RADIUS).convert("RGB").save(OUT / "daymo-icon-login.png")

    splash(SPLASH_INK_LIGHT, SPLASH_PAPER_LIGHT).save(OUT / "daymo-splash.png")
    splash(SPLASH_INK_DARK, SPLASH_PAPER_DARK).save(OUT / "daymo-splash-dark.png")
    android_splash(SPLASH_INK_LIGHT, SPLASH_PAPER_LIGHT).save(OUT / "daymo-splash-android.png")
    android_splash(SPLASH_INK_DARK, SPLASH_PAPER_DARK).save(OUT / "daymo-splash-android-dark.png")

    # 탭 배경이 밝을지 어두울지 알 수 없으니 아이콘처럼 배경까지 채운다.
    favicon().convert("RGB").save(OUT / "daymo-favicon.png")

    LOGO_OUT.mkdir(parents=True, exist_ok=True)
    for name, side in LOGOS:
        icon(side, None, BACKGROUND, radius=ICON_RADIUS).convert("RGB").save(LOGO_OUT / name, optimize=True)
        print(f"logos/{name}  {side}x{side}  {(LOGO_OUT / name).stat().st_size} bytes")

    for name in (
        "daymo-icon.png",
        "daymo-icon-adaptive.png",
        "daymo-icon-login.png",
        "daymo-splash.png",
        "daymo-splash-dark.png",
        "daymo-splash-android.png",
        "daymo-splash-android-dark.png",
        "daymo-favicon.png",
    ):
        image = Image.open(OUT / name)
        print(f"{name}  {image.size[0]}x{image.size[1]}  {image.mode}")


if __name__ == "__main__":
    main()
