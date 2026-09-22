import assert from "node:assert/strict";
import { test } from "node:test";

import { ART_KEYS, CUT, STICKER_ART } from "./art.ts";
import {
  HIDDEN_STICKERS,
  LEGACY_STICKERS,
  STICKER_CATEGORIES,
  STICKER_NAMES,
  categoryOf,
  isKnownSticker,
  stickerAspect,
} from "./catalog.ts";

const 갈래_이름들 = STICKER_CATEGORIES.flatMap((갈래) => 갈래.stickers);

test("갈래는 여행·음식·날씨·기분·글씨·테이프 차례다", () => {
  assert.deepEqual(
    STICKER_CATEGORIES.map((갈래) => 갈래.name),
    ["여행", "음식", "날씨", "기분", "글씨", "테이프"],
  );
});

test("이름은 겹치지 않고 20자를 넘지 않는다", () => {
  const 전부 = [...갈래_이름들, ...HIDDEN_STICKERS];
  assert.equal(new Set(전부).size, 전부.length);
  for (const 이름 of 전부) {
    assert.ok(이름.length > 0 && 이름.length <= 20, 이름);
    assert.equal(이름.trim(), 이름);
    assert.notEqual(이름, "글자", "「글자」는 글자 줄의 kind 라 스티커 이름으로 못 쓴다");
  }
});

test("예전 판의 스티커 아홉 개를 전부 그린다", () => {
  for (const 이름 of LEGACY_STICKERS) assert.ok(isKnownSticker(이름), 이름);
  // 비행기는 고르는 자리에는 없고 그리기만 한다.
  assert.equal(categoryOf("비행기"), undefined);
  for (const 이름 of LEGACY_STICKERS.filter((이름) => 이름 !== "비행기")) {
    assert.ok(categoryOf(이름), 이름);
  }
});

test("카탈로그의 이름과 그림이 하나하나 맞는다", () => {
  assert.deepEqual([...ART_KEYS].sort(), [...STICKER_NAMES].sort());
});

test("비율이 그림의 viewBox 와 같다", () => {
  for (const 이름 of STICKER_NAMES) {
    const 그림 = STICKER_ART[이름];
    assert.ok(Math.abs(stickerAspect(이름) - 그림.w / 그림.h) < 1e-9, 이름);
  }
  assert.equal(stickerAspect("캐리어"), 1);
  assert.equal(stickerAspect("줄무늬 테이프"), 4);
});

test("모르는 이름은 모른다고 한다", () => {
  assert.equal(isKnownSticker("없는 스티커"), false);
  assert.equal(isKnownSticker("toString"), false);
  assert.equal(stickerAspect("없는 스티커"), 1);
});

test("그림 자료가 비어 있지 않고 테두리를 두르는 것은 글자만으로 되어 있지 않다", () => {
  assert.ok(CUT > 0);
  for (const [이름, 그림] of Object.entries(STICKER_ART)) {
    assert.ok(그림.shapes.length > 0, 이름);
    for (const 모양 of 그림.shapes) {
      if ("text" in 모양) assert.ok(모양.text.length > 0, 이름);
      else assert.ok(모양.d.startsWith("M"), 이름);
    }
    if (그림.cut) assert.ok(그림.shapes.some((모양) => !("text" in 모양)), 이름);
  }
});
