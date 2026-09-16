import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dedupePackingNames,
  duplicateLines,
  findSimilarPacking,
  ingredientOriginLabel,
  packingKey,
} from "./packingNames.ts";

const item = (id: string, name: string, owner = "미정") => ({ id, name, owner });

test("띄어쓰기·대소문자·문장부호는 견줄 때 지운다", () => {
  assert.equal(packingKey("보조 배터리"), packingKey("보조배터리"));
  assert.equal(packingKey("  보조·배터리 "), packingKey("보조배터리"));
  assert.equal(packingKey("USB 케이블"), packingKey("usb케이블"));
  assert.equal(packingKey("ＵＳＢ"), packingKey("usb"));
});

test("수량과 단위는 빼고 견준다", () => {
  assert.equal(packingKey("생수 2L"), packingKey("생수"));
  assert.equal(packingKey("물티슈 3개"), packingKey("물티슈"));
  assert.equal(packingKey("배추 1/4통"), packingKey("배추"));
  assert.equal(packingKey("충전기 x2"), packingKey("충전기"));
  // 수량만 적었으면 뺄 것이 없으니 그대로 둔다.
  assert.equal(packingKey("2개"), "2개");
});

test("수량이 아닌 말은 남겨 다른 것으로 본다", () => {
  assert.notEqual(packingKey("충전기 C타입"), packingKey("충전기"));
  assert.notEqual(packingKey("수건"), packingKey("수건걸이"));
  assert.notEqual(packingKey("AA 건전지"), packingKey("AAA 건전지"));
  assert.equal(packingKey(" · "), "");
});

test("한 번에 여러 줄을 적으면 같은 것은 하나만 남는다", () => {
  assert.deepEqual(dedupePackingNames(["보조 배터리", "보조배터리", "충전기", ""]), ["보조 배터리", "충전기"]);
});

test("담당이 달라도 비슷한 준비물을 찾는다", () => {
  const items = [item("a", "보조배터리", "하늘"), item("b", "충전기", "공용")];

  assert.deepEqual(
    findSimilarPacking(["보조 배터리 1개"], items).map((hit) => hit.matches.map((match) => match.id)),
    [["a"]],
  );
  assert.deepEqual(findSimilarPacking(["우산"], items), []);
  // 고치는 중인 줄은 자기 자신과 겹친다고 알리지 않는다.
  assert.deepEqual(findSimilarPacking(["보조배터리"], items, "a"), []);
});

test("안내 본문은 이미 있는 줄을 담당과 함께 보여 준다", () => {
  const items = [item("a", "보조배터리", "하늘"), item("b", "보조 배터리", "여울")];

  assert.deepEqual(duplicateLines(findSimilarPacking(["보조배터리"], items)), [
    "보조배터리 · 하늘",
    "보조배터리 → 보조 배터리 · 여울",
  ]);
});

test("가져온 준비물의 출처는 이름이 달라졌을 때만 재료까지 보여 준다", () => {
  assert.equal(ingredientOriginLabel("버섯전골", "알배추", "알배추 1통"), "버섯전골 재료");
  assert.equal(ingredientOriginLabel("버섯전골", "알배추", "배추"), "버섯전골 · 알배추");
});
