import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COVER_ON_LABEL,
  coverNowOf,
  coverPickable,
  coverToggleOf,
  coverUndoBody,
} from "./coverPhoto.ts";

test("홈 화면에 깔린 사진이면 켜진 것으로 보고 누르면 해제한다", () => {
  const 켜짐 = coverToggleOf("사진1", { kind: "photo", id: "사진1" }, "photo");

  assert.equal(켜짐.on, true);
  assert.equal(켜짐.next, null);
  assert.equal(켜짐.label, COVER_ON_LABEL);
  assert.equal(켜짐.done, "대표 사진을 해제했어요");
});

test("다른 사진이 깔려 있으면 꺼진 것으로 보고 누르면 이 사진을 보낸다", () => {
  const 꺼짐 = coverToggleOf("사진1", { kind: "photo", id: "사진2" }, "photo");

  assert.equal(꺼짐.on, false);
  assert.equal(꺼짐.next, "사진1");
  assert.equal(꺼짐.label, "대표 사진으로 설정");
});

test("무엇이 내려가는지 이름을 대고 알린다", () => {
  // 아무것도 없었으면 내려갈 것도 없다.
  assert.equal(
    coverToggleOf("사진1", undefined, "photo").done,
    "이 사진을 대표 사진으로 설정했어요",
  );
  // 공들여 꾸민 카드가 소리 없이 내려가면 안 된다. 이름을 댄다.
  assert.equal(
    coverToggleOf("사진1", { kind: "card", id: "카드1", name: "네컷 격자 · 사진 4장" }, "photo").done,
    "「네컷 격자 · 사진 4장」 카드 대신 이 사진을 대표 사진으로 설정했어요",
  );
  // 설명이 있으면 그 이름을, 없으면 종류로 부른다.
  assert.equal(
    coverToggleOf("사진1", { kind: "photo", id: "사진2", name: "커피거리 창가" }, "photo").done,
    "「커피거리 창가」 대신 이 사진을 대표 사진으로 설정했어요",
  );
  assert.equal(
    coverToggleOf("사진1", { kind: "photo", id: "사진2" }, "photo").done,
    "전에 설정한 사진 대신 이 사진을 대표 사진으로 설정했어요",
  );
  // 카드 자리에서도 같은 말투다.
  assert.equal(
    coverToggleOf("카드1", { kind: "photo", id: "사진2", name: "밤바다" }, "card").done,
    "「밤바다」 대신 이 카드를 대표 사진으로 설정했어요",
  );
});

test("되돌릴 것은 전에 깔려 있던 그것이다", () => {
  const 바꿈 = coverToggleOf("사진1", { kind: "card", id: "카드1" }, "photo");
  assert.deepEqual(바꿈.undo, { kind: "card", id: "카드1" });
  assert.deepEqual(coverUndoBody(바꿈.undo), { coverCardId: "카드1" });

  // 처음 까는 것이면 되돌리기는 해제다.
  assert.deepEqual(coverUndoBody(coverToggleOf("사진1", undefined, "photo").undo), { coverPhotoId: null });
  assert.deepEqual(coverUndoBody({ kind: "photo", id: "사진2" }), { coverPhotoId: "사진2" });
});

test("고를 사진이 없으면 켜지지 않고 보낼 값도 없다", () => {
  const 빈칸 = coverToggleOf(undefined, undefined, "card");

  assert.equal(빈칸.on, false);
  assert.equal(빈칸.next, null);
});

test("지금 깔린 것은 카드를 먼저 본다", () => {
  const 이름 = (kind: string, id: string) => `${kind}:${id}`;

  assert.deepEqual(coverNowOf("사진1", "카드1", 이름), { kind: "card", id: "카드1", name: "card:카드1" });
  assert.deepEqual(coverNowOf("사진1", undefined, 이름), { kind: "photo", id: "사진1", name: "photo:사진1" });
  assert.equal(coverNowOf(undefined, undefined, 이름), undefined);
});

test("서버에 올라간 사진만 홈 화면에 깔 수 있다", () => {
  const 올라간_것 = new Set(["사진1"]);

  assert.equal(coverPickable("사진1", 올라간_것), true);
  assert.equal(coverPickable("사진2", 올라간_것), false);
  assert.equal(coverPickable(null, 올라간_것), false);
  assert.equal(coverPickable(undefined, 올라간_것), false);
});
