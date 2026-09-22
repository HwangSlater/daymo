import assert from "node:assert/strict";
import { test } from "node:test";

import { STICKER_ART } from "./art.ts";
import { fitStickerText, textWidthOf } from "./textFit.ts";

test("짧은 말은 그림을 그대로 두고 글자 크기도 그대로다", () => {
  const 그림 = STICKER_ART["최고의 하루"];
  const 맞춤 = fitStickerText(그림, "바다")!;
  assert.equal(맞춤.w, 그림.w);
  assert.equal(맞춤.stretchX, 1);
  assert.equal(맞춤.size, 13);
});

test("띠 모양은 긴 말만큼 옆으로 늘리고 글자는 줄이지 않는다", () => {
  const 그림 = STICKER_ART["최고의 하루"];
  const 맞춤 = fitStickerText(그림, "강릉 바다에서 보낸 밤")!;
  assert.ok(맞춤.w > 그림.w);
  assert.ok(맞춤.stretchX > 1);
  assert.equal(맞춤.size, 13);
  // 늘린 만큼 글자 가운데도 따라간다.
  assert.ok(Math.abs(맞춤.x - 맞춤.w / 2) < 1);
});

test("동그란 모양은 늘리지 않고 글자를 줄이되 너무 작게는 줄이지 않는다", () => {
  const 그림 = STICKER_ART["맛집"];
  const 맞춤 = fitStickerText(그림, "우리만 아는 맛집")!;
  assert.equal(맞춤.w, 그림.w);
  assert.ok(맞춤.size < 9 && 맞춤.size >= 9 * 0.45);
});

test("글자 폭 어림: 한글은 한 자, 영문은 0.6, 띄어쓰기는 0.32", () => {
  assert.equal(textWidthOf("가나", 10), 20);
  assert.equal(textWidthOf("ab", 10), 12);
  assert.ok(Math.abs(textWidthOf("가 나", 10) - 23.2) < 1e-9);
});

test("띠 모양도 1.6 배까지만 늘리고, 넘치는 말은 글자를 줄인다", async () => {
  const { MAX_STRETCH } = await import("./textFit.ts");
  const 그림 = STICKER_ART["여행 중"];
  const 맞춤 = fitStickerText(그림, "아주아주아주아주 긴 여행 이야기")!;
  assert.ok(Math.abs(맞춤.stretchX - MAX_STRETCH) < 1e-9);
  assert.ok(맞춤.size < 12.5);
  // 실제로 잰 폭을 넘기면 어림 대신 그것을 쓴다.
  const 잰 = fitStickerText(그림, "여행", 20)!;
  assert.equal(잰.stretchX, 1);
});
