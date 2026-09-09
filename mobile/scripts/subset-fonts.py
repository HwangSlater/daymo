"""앱에 싣는 서체를 한글과 라틴만 남기고 잘라낸다.

한자(CJK 표의문자)가 용량의 대부분이고 앱에서는 쓰지 않는다.
한글 음절은 11,172자 전부 넣어, 사용자가 무슨 글자를 입력하든
글자 하나만 다른 서체로 떨어지는 일이 없게 한다.

    python scripts/subset-fonts.py
"""
import os, subprocess, sys

RANGES = ",".join([
    "U+0020-007E",   # ASCII
    "U+00A0-00FF",   # 라틴 확장
    "U+2000-206F",   # 문장부호 (· — ' " ‹ › …)
    "U+20A9,U+20AC", # ₩ €
    "U+2190-21FF",   # 화살표 (→ ↗ ←)
    "U+2022,U+2026",
    "U+25A0-25FF",   # 도형 (● ■ ▲)
    "U+2605,U+2606",
    "U+2713,U+2714,U+2716,U+2717",  # ✓ ✔ ✖
    "U+3000-303F",   # CJK 문장부호
    "U+3130-318F",   # 한글 호환 자모
    "U+1100-11FF",   # 한글 자모
    "U+A960-A97F,U+D7B0-D7FF",
    "U+AC00-D7A3",   # 한글 음절 11,172자
    "U+FF01-FF60",   # 전각 (＋ ％ ：)
])

JOBS = [
    ("node_modules/@expo-google-fonts/jua/400Regular/Jua_400Regular.ttf",
     "assets/fonts/Jua-Regular.ttf"),
    ("node_modules/@expo-google-fonts/gowun-dodum/400Regular/GowunDodum_400Regular.ttf",
     "assets/fonts/GowunDodum-Regular.ttf"),
]

total_in = total_out = 0
for src, dst in JOBS:
    if not os.path.exists(src):
        sys.exit(f"원본이 없다. npm install 후 다시 실행: {src}")
    subprocess.run([sys.executable, "-m", "fontTools.subset", src,
                    f"--unicodes={RANGES}", f"--output-file={dst}",
                    "--layout-features=*", "--no-hinting", "--desubroutinize",
                    "--drop-tables+=DSIG"], check=True)
    a, b = os.path.getsize(src), os.path.getsize(dst)
    total_in += a; total_out += b
    print(f"  {os.path.basename(dst):26} {a/1048576:6.2f}MB -> {b/1048576:5.2f}MB")
print(f"\n합계 {total_in/1048576:.2f}MB -> {total_out/1048576:.2f}MB")
