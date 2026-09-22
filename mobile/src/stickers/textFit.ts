/**
 * 「글씨」 스티커 모양에 사람이 적은 말을 넣는 셈. 글자 바탕(리본·태그 등)이 쓴다.
 *
 * 스티커 그림은 그대로 두고 글자만 바꿔 끼운다(2026-09-22, 사용자가 「스티커에 있는 걸
 * 그대로」라고 했다). 적은 말이 원래 말보다 길면:
 *   - 띠 모양(가로가 세로의 1.3 배 넘는 것)은 그림을 옆으로 늘려 글자 크기를 지킨다.
 *   - 동그란 것(도장·하트)은 늘리면 찌그러지니 글자를 줄인다.
 * 글자 폭은 잴 수 없어 어림한다. 쿠키런 Bold 기준 한글 한 자가 글자 크기만큼, 영문·숫자는
 * 0.6, 띄어쓰기는 0.32 배다.
 *
 * react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import type { StickerDrawing } from "./art.ts";

/** 글자가 차지할 폭 어림(글자 크기 1 기준 배). */
export function textWidthOf(text: string, size: number): number {
  let 폭 = 0;
  for (const 글자 of text) {
    if (글자 === " ") 폭 += 0.32;
    else if (/[ㄱ-ㆎ가-힣一-鿿]/.test(글자)) 폭 += 1;
    else 폭 += 0.6;
  }
  return 폭 * size;
}

export type FittedStickerText = {
  /** 늘린 뒤 그림의 viewBox 너비. 높이는 그대로다. */
  w: number;
  h: number;
  /** 모양에 줄 가로 배(1 이면 그대로). 글자에는 주지 않는다. */
  stretchX: number;
  /** 글자 자리와 크기, 색(그림 단위). */
  x: number;
  y: number;
  size: number;
  color: string;
};

/** 가장 작게 줄이는 배. 이보다 작으면 읽히지 않는다. */
const 최소_배 = 0.45;
/** 띠 모양을 옆으로 늘리는 한계. 이보다 늘리면 끝(리본 홈·둥근 끝·화살촉)까지 일그러져 보인다. */
export const MAX_STRETCH = 1.6;

/**
 * @param measured 적은 말의 실제 폭(그림 단위, 원래 글자 크기로 쟀을 때). 화면이 재서 넘긴다.
 *   없으면 어림한다(`textWidthOf`).
 */
export function fitStickerText(drawing: StickerDrawing, text: string, measured?: number): FittedStickerText | undefined {
  const 글 = drawing.shapes.find((모양): 모양 is Extract<typeof 모양, { text: string }> => "text" in 모양);
  if (!글) return undefined;
  const 원래_폭 = textWidthOf(글.text, 글.size);
  const 필요한_폭 = measured && measured > 0 ? measured : textWidthOf(text || " ", 글.size);
  const 띠 = drawing.w / drawing.h > 1.3;
  // 늘릴 수 있는 만큼(띠 모양만, 1.6 배까지) 늘리고, 그래도 모자라면 글자를 줄인다.
  const 늘림_폭 = 띠 ? Math.min(Math.max(0, 필요한_폭 - 원래_폭), drawing.w * (MAX_STRETCH - 1)) : 0;
  const w = drawing.w + 늘림_폭;
  const stretchX = w / drawing.w;
  const 담는_폭 = 원래_폭 + 늘림_폭;
  const 배 = 필요한_폭 <= 담는_폭 ? 1 : Math.max(최소_배, 담는_폭 / 필요한_폭);
  // 줄인 글자는 원래 자리의 세로 가운데에 오게 기준선을 조금 올린다.
  return { w, h: drawing.h, stretchX, x: 글.x * stretchX, y: 글.y - (글.size * (1 - 배)) / 2.6, size: 글.size * 배, color: 글.f };
}
