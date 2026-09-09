import os, subprocess, sys

# 넣을 문자 범위. 한글 음절 전체를 넣어 사용자가 무슨 글자를 쓰든 두부가 안 뜨게 한다.
# 빠지는 것은 한자(CJK 표의문자)이고, 이게 용량의 대부분이다.
RANGES = ",".join([
    "U+0020-007E",   # ASCII
    "U+00A0-00FF",   # 라틴 확장
    "U+2000-206F",   # 문장부호 (· — ' " ‹ › …)
    "U+20A9,U+20AC", # ₩ €
    "U+2190-21FF",   # 화살표 (→ ↗ ←)
    "U+2022,U+2026",
    "U+25A0-25FF",   # 도형 (● ■ ▲)
    "U+2605,U+2606,U+2660-2667",
    "U+2713,U+2714,U+2716,U+2717",  # ✓ ✔ ✖
    "U+3000-303F",   # CJK 문장부호
    "U+3130-318F",   # 한글 호환 자모
    "U+1100-11FF",   # 한글 자모
    "U+A960-A97F,U+D7B0-D7FF",
    "U+AC00-D7A3",   # 한글 음절 11,172자 전체
    "U+FF01-FF60",   # 전각 (＋ ％ ：)
    "U+FE0F",
])
LATIN_ONLY = ",".join(["U+0020-007E", "U+00A0-00FF", "U+2000-206F"])

JOBS = [
    ("node_modules/pretendard/dist/public/static/alternative/Pretendard-Regular.ttf",
     "assets/fonts/Pretendard-Regular.ttf", RANGES),
    ("node_modules/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf",
     "assets/fonts/Pretendard-SemiBold.ttf", RANGES),
    ("node_modules/pretendard/dist/public/static/alternative/Pretendard-Bold.ttf",
     "assets/fonts/Pretendard-Bold.ttf", RANGES),
    # 워드마크 전용이라 라틴만 있으면 된다
    ("node_modules/pretendard/dist/public/static/alternative/Pretendard-ExtraBold.ttf",
     "assets/fonts/Pretendard-ExtraBold.ttf", LATIN_ONLY),
    ("node_modules/@expo-google-fonts/noto-serif-kr/600SemiBold/NotoSerifKR_600SemiBold.ttf",
     "assets/fonts/NotoSerifKR-SemiBold.ttf", RANGES),
]

total_in = total_out = 0
for src, dst, ranges in JOBS:
    if not os.path.exists(src):
        print(f"  없음: {src}"); continue
    subprocess.run([sys.executable, "-m", "fontTools.subset", src,
                    f"--unicodes={ranges}", f"--output-file={dst}",
                    "--layout-features=*", "--no-hinting", "--desubroutinize",
                    "--drop-tables+=DSIG"], check=True)
    a, b = os.path.getsize(src), os.path.getsize(dst)
    total_in += a; total_out += b
    print(f"  {os.path.basename(dst):32} {a/1048576:6.1f}MB -> {b/1048576:5.2f}MB")
print(f"\n합계 {total_in/1048576:.1f}MB -> {total_out/1048576:.2f}MB")
