"""
찍은 화면을 스토어 규격으로 맞추고 캡션을 얹는다.

    python store_compose.py <찍은폴더> <나갈폴더> [가로x세로]

크기를 안 주면 1080x1920(플레이). 앱스토어 6.9형은 1290x2796 을 준다.
찍은 파일 이름이 `01-홈.png` 처럼 번호로 시작하면 그 번호로 캡션을 찾는다. 폰에서
찍은 그대로(IMG_1234 같은 이름)면 찍은 시각 차례로 01 부터 붙인다.
앱 글꼴(CookieRun)과 앱 색을 쓴다. 화면은 잘리지 않게 폭에 맞춰 줄이고 위에서 자른다.
글자와 여백은 1080 폭을 기준으로 잡고 크기에 맞춰 키운다.
"""

import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
PAPER = (247, 245, 240)
INK = (23, 35, 61)
ACCENT = (63, 76, 143)
SHADOW = (23, 35, 61, 40)

# 앱 글꼴을 그대로 쓴다.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BOLD = os.path.join(ROOT, "mobile", "assets", "fonts", "CookieRun-Bold.ttf")
REGULAR = os.path.join(ROOT, "mobile", "assets", "fonts", "CookieRun-Regular.ttf")

# 캡션은 화면 이름으로 찾는다(파일 이름 `01-홈.png` 의 「홈」). 장수가 스토어마다
# 달라 번호가 밀려도(플레이는 「찾기」를 뺐다) 캡션이 화면을 따라간다.
CAPTIONS = {
    "홈": ("다음 여행이 한 장에", "숙소·일정·준비물·쓴 돈까지 한눈에"),
    "일정": ("일정과 교통편을 날짜별로", "가는 편, 숙소, 예약까지 한자리에"),
    "준비": ("누가 무엇을 챙길지 나눠요", "같은 걸 둘이 챙기는 일이 없게"),
    "요리": ("해 먹을 요리와 장볼 것까지", "현지에서 살 것과 집에서 챙길 것"),
    "비용": ("누가 누구에게 얼마를 보낼지", "나 기준으로 정산을 정리해요"),
    "기록": ("사진과 일기로 오래 남겨요", "여행이 끝나도 지우지 않아요"),
    "캘린더": ("누가 언제 바쁜지 한 달력에", "여행과 서로의 일정을 함께 봐요"),
    "찾기": ("지난 여행도 바로 찾아요", "장소·음식·준비물 모두 검색"),
    "우리": ("둘이든 셋이든 함께 쓰는 공간", "링크 하나로 초대해요"),
    "추억카드": ("여행을 한 장으로 만들어요", "사진을 골라 네컷으로 꾸미기"),
    "초대": ("링크 하나로 함께 시작해요", "받은 사람은 바로 참여해요"),
}


def compose(shot_path: str, title: str, subtitle: str, out_path: str, W: int = W, H: int = H) -> None:
    k = W / 1080
    n = lambda 값: round(값 * k)  # noqa: E731
    canvas = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(canvas)

    title_font = ImageFont.truetype(BOLD, n(62))
    sub_font = ImageFont.truetype(REGULAR, n(34))
    draw.text((W // 2, n(118)), title, font=title_font, fill=INK, anchor="mm")
    draw.text((W // 2, n(186)), subtitle, font=sub_font, fill=ACCENT, anchor="mm")

    shot = Image.open(shot_path).convert("RGB")
    frame_w = W - n(120)
    scale = frame_w / shot.width
    shot = shot.resize((frame_w, round(shot.height * scale)), Image.LANCZOS)
    top = n(260)
    frame_h = H - top - n(60)
    if shot.height > frame_h:
        shot = shot.crop((0, 0, shot.width, frame_h))

    rounded = Image.new("L", shot.size, 0)
    ImageDraw.Draw(rounded).rounded_rectangle([(0, 0), shot.size], radius=n(36), fill=255)
    shadow = Image.new("RGBA", (shot.width + n(40), shot.height + n(40)), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [(n(20), n(26)), (shot.width + n(20), shot.height + n(26))], radius=n(40), fill=SHADOW
    )
    canvas.paste(Image.alpha_composite(
        Image.new("RGBA", shadow.size, PAPER + (255,)), shadow
    ).convert("RGB"), (n(40), top - n(26)))
    canvas.paste(shot, (n(60), top), rounded)

    canvas.save(out_path, "PNG")


def main(src: str, dst: str, size: str = f"{W}x{H}") -> int:
    w, h = (int(값) for 값 in size.lower().split("x"))
    os.makedirs(dst, exist_ok=True)
    그림들 = [name for name in os.listdir(src) if name.lower().endswith((".png", ".jpg", ".jpeg"))]
    번호_붙음 = all(re.match(r"\d{2}", name) for name in 그림들)
    # 폰에서 찍은 그대로면 찍은 시각 차례가 곧 화면 차례다.
    차례 = sorted(그림들) if 번호_붙음 else sorted(그림들, key=lambda name: os.path.getmtime(os.path.join(src, name)))
    made = 0
    for 순번, name in enumerate(차례, start=1):
        number = name[:2] if 번호_붙음 else f"{순번:02d}"
        화면 = os.path.splitext(name)[0].split("-", 1)[-1]
        title, subtitle = CAPTIONS.get(화면, ("", ""))
        out = os.path.join(dst, f"{number}.png" if not 번호_붙음 else os.path.splitext(name)[0] + ".png")
        compose(os.path.join(src, name), title, subtitle, out, w, h)
        made += 1
        print("만듦:", name, "→", os.path.basename(out), title)
    print(f"{made}장, {w}x{h}")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
