"""
기기에서 찍은 스크린샷을 모형에 넣기 전의 모습으로 다듬는다.

    python release/scripts/store_prepare.py iphone <찍은폴더> <나갈폴더> <차례.txt>
    python release/scripts/store_prepare.py galaxy <찍은폴더> <나갈폴더> <차례.txt>

`차례.txt` 는 한 줄에 `01-홈 <파일이름>` 처럼 적는다. 나갈 파일은 `01-홈.png` 가 되고,
캡션은 화면 이름(「홈」)으로 찾는다(`store_compose.CAPTIONS`).

- iphone(아이폰 16 Pro 로 찍은 것 기준): 폭 1290 으로 줄이고 아래에서 몇 줄을 떼어
  1290x2796(App Store 6.9형)에 맞춘다. 상태 표시줄의 배터리를 가득 찬 모양으로 칠한다.
  배터리 자리는 16 Pro 의 상태 표시줄을 잰 값이라 다른 기기로 찍으면 다시 재야 한다.
  충전 중(초록·번개)으로 찍힌 장은 `--charging` 이름표를 붙이면 다른 장의 배터리를 옮겨 온다.
- galaxy(갤럭시 S21 로 찍은 것 기준): 아래 버튼 막대(2196px 아래)를 떼고, 위 상태 표시줄
  (84px 위, 알림 아이콘이 어수선하다)을 바탕색으로 덮는다. 카메라 구멍은 모형이 그린다.

화면 내용은 바꾸지 않는다. 떼거나 덮는 것은 기기의 막대와 상태 표시줄뿐이다.
"""

import os
import sys

from PIL import Image, ImageDraw

# 아이폰 16 Pro 를 1290 폭으로 줄였을 때 배터리 몸통 안쪽과, 가득 찬 칸.
BATTERY_INSIDE = (1092, 86, 1165, 121)
BATTERY_FULL = (1095, 89, 1162, 118)
# 갤럭시 S21(1080x2340)의 상태 표시줄 아래 끝과 버튼 막대 위 끝.
GALAXY_STATUS = 84
GALAXY_NAV = 2196


def 차례_읽기(path):
    rows = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, *rest = line.split()
        rows.append((name, " ".join(rest)))
    return rows


def iphone(src, dst, rows):
    ref = None
    for name, spec in rows:
        charging = spec.endswith("--charging")
        file = spec.replace("--charging", "").strip()
        im = Image.open(os.path.join(src, file)).convert("RGB")
        im = im.resize((1290, round(im.height * 1290 / im.width)), Image.LANCZOS).crop((0, 0, 1290, 2796))
        if charging and ref is not None:
            im.paste(ref.crop((1080, 74, 1180, 134)), (1080, 74))
        바탕 = im.getpixel((1070, 104))
        # 검은 바탕 화면(사진 크게 보기)은 상태 표시줄 글자가 안 보여 칠할 배터리가 없다.
        # 대신 카메라·마이크를 쓰는 중이면 초록 점이 찍혀 있어서 상태 표시줄 줄을 통째로 덮는다.
        if sum(바탕) <= 60:
            ImageDraw.Draw(im).rectangle((0, 0, 1290, 140), fill=바탕)
        else:
            d = ImageDraw.Draw(im)
            d.rounded_rectangle(BATTERY_INSIDE, radius=7, fill=바탕)
            d.rounded_rectangle(BATTERY_FULL, radius=5, fill=(0, 0, 0))
            ref = ref or im.copy()
        im.save(os.path.join(dst, name + ".png"))
        print("다듬음:", name, file)


def galaxy(src, dst, rows):
    for name, file in rows:
        im = Image.open(os.path.join(src, file)).convert("RGB").crop((0, 0, 1080, GALAXY_NAV))
        ImageDraw.Draw(im).rectangle((0, 0, im.width, GALAXY_STATUS), fill=im.getpixel((20, GALAXY_STATUS + 8)))
        im.save(os.path.join(dst, name + ".png"))
        print("다듬음:", name, file)


if __name__ == "__main__":
    kind, src, dst, order = sys.argv[1:5]
    os.makedirs(dst, exist_ok=True)
    {"iphone": iphone, "galaxy": galaxy}[kind](src, dst, 차례_읽기(order))
