/**
 * 추억 카드 꾸미기 도구의 색. 도구 칸은 늘 어두워서 테마 색을 그대로 쓰지 않는다.
 * 꾸미기 도구(`CardDecorEditor.tsx`)와 글자 창(`CardTextEditor.tsx`)이 같이 쓴다.
 */

/** 어두운 바탕 위의 글자. 사진 창과 같은 값을 쓴다. */
export const INK = "#F6F4F1";
export const INK_SOFT = "rgba(255,255,255,0.80)";
/**
 * 흐린 글자. 작은 제목·설명·글자 수처럼 **읽어야 하는** 글에 쓴다.
 *
 * 0.42 였을 때 도구 칸 바탕(#17161C) 위에서 대비가 3.6:1 로 WCAG AA(4.5:1)에 못 미쳤다
 * (2026-09-23 검토 #30). 0.60 이면 6:1 이 넘으면서 INK(1.0)·INK_SOFT(0.80) 와의 층은
 * 그대로 남는다.
 */
export const INK_FAINT = "rgba(255,255,255,0.60)";
export const PANEL = "#17161C";
export const CHIP = "#26252E";
/** 꺼진 칩의 테두리. 채움만으로는 어두운 바탕에서 칩인지 바탕인지 알 수 없다. */
export const CHIP_EDGE = "#3C3A47";
export const ACCENT = "#A7B3EE";
