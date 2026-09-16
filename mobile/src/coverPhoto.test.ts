import assert from "node:assert/strict";
import { test } from "node:test";

import { COVER_ON_LABEL, coverPickable, coverToggleOf } from "./coverPhoto.ts";

test("홈 화면에 깔린 사진이면 켜진 것으로 보고 누르면 해제한다", () => {
  const 켜짐 = coverToggleOf("사진1", "사진1", "photo");

  assert.equal(켜짐.on, true);
  assert.equal(켜짐.next, null);
  assert.equal(켜짐.label, COVER_ON_LABEL);
  assert.equal(켜짐.done, "홈 화면에서 이 사진을 내렸어요");
});

test("다른 사진이 깔려 있으면 꺼진 것으로 보고 누르면 이 사진을 보낸다", () => {
  const 꺼짐 = coverToggleOf("사진1", "사진2", "photo");

  assert.equal(꺼짐.on, false);
  assert.equal(꺼짐.next, "사진1");
  assert.equal(꺼짐.label, "홈 화면에 이 사진 쓰기");
});

test("자리에 따라 꺼졌을 때의 말만 달라지고 켜진 말은 같다", () => {
  assert.equal(coverToggleOf("사진1", undefined, "card").label, "이 카드의 사진을 홈 화면에 쓰기");
  assert.equal(coverToggleOf("사진1", "사진1", "card").label, COVER_ON_LABEL);
});

test("고를 사진이 없으면 켜지지 않고 보낼 값도 없다", () => {
  const 빈칸 = coverToggleOf(undefined, undefined, "card");

  assert.equal(빈칸.on, false);
  assert.equal(빈칸.next, null);
});

test("서버에 올라간 사진만 홈 화면에 깔 수 있다", () => {
  const 올라간_것 = new Set(["사진1"]);

  assert.equal(coverPickable("사진1", 올라간_것), true);
  assert.equal(coverPickable("사진2", 올라간_것), false);
  assert.equal(coverPickable(null, 올라간_것), false);
  assert.equal(coverPickable(undefined, 올라간_것), false);
});
