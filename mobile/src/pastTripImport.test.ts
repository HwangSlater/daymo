import assert from "node:assert/strict";
import { test } from "node:test";

import type { PackingRow, RecipeRow } from "./cookingSync.ts";
import {
  importMessage,
  keepOwner,
  pastTripChoices,
  planPackingImport,
  planRecipeImport,
} from "./pastTripImport.ts";

const participants = ["하늘", "여울"];

let counter = 0;
const newId = () => `new-${++counter}`;
const freshId = () => {
  counter = 0;
  return newId;
};

const packing = (extra: Partial<PackingRow> = {}): PackingRow => ({
  id: "old-1", name: "충전기", quantity: "1개", owner: "하늘", tags: ["집에서"], done: true, ...extra,
});

const recipe = (extra: Partial<RecipeRow> = {}): RecipeRow => ({
  id: "old-r1",
  name: "버섯전골",
  note: "첫날 저녁",
  url: "https://example.com/1",
  ingredients: [
    { id: "old-i1", name: "배추", quantity: "1/4통", group: "채소", owner: "구매", ready: true },
    { id: "old-i2", name: "팽이버섯", quantity: "1봉", group: "채소", owner: "하늘", ready: false },
  ],
  ...extra,
});

test("고를 수 있는 여행은 지금 여행을 빼고 최근 것부터 온다", () => {
  const trips = [
    { id: "a", title: "속초", startDate: "2026-03-01" },
    { id: "b", title: "지금", startDate: "2026-09-01" },
    { id: "c", title: "제주", startDate: "2026-07-05" },
  ];

  assert.deepEqual(pastTripChoices(trips, "b").map((trip) => trip.id), ["c", "a"]);
  assert.deepEqual(pastTripChoices(trips, undefined).map((trip) => trip.id), ["b", "c", "a"]);
});

test("담당은 이번 여행 참가자만 남고 사람이 아닌 표시는 그대로다", () => {
  assert.equal(keepOwner("하늘", participants, ["공용"], "미정"), "하늘");
  assert.equal(keepOwner("바다", participants, ["공용"], "미정"), "미정");
  assert.equal(keepOwner("나간 멤버", participants, ["공용"], "미정"), "미정");
  assert.equal(keepOwner("공용", participants, ["공용"], "미정"), "공용");
  assert.equal(keepOwner("구매", participants, ["구매"], "미정"), "구매");
  assert.equal(keepOwner(" ", participants, ["공용"], "미정"), "미정");
});

test("가져온 준비물은 완료가 꺼지고 재료 연결도 끊긴다", () => {
  const plan = planPackingImport(
    [packing({ sourceIngredientId: "old-i1", quantity: " 1개 " })],
    [],
    participants,
    freshId(),
  );

  assert.deepEqual(plan.taken, [
    { id: "new-1", name: "충전기", quantity: "1개", owner: "하늘", tags: ["집에서"] },
  ]);
  assert.equal("done" in plan.taken[0], false);
  assert.equal("sourceIngredientId" in plan.taken[0], false);
});

test("준비물 담당이 이번 여행에 없으면 비우고 공용은 남긴다", () => {
  const plan = planPackingImport(
    [packing({ name: "상비약", owner: "바다" }), packing({ name: "돗자리", owner: "공용" })],
    [],
    participants,
    freshId(),
  );

  assert.deepEqual(plan.taken.map((item) => [item.name, item.owner]), [["상비약", "미정"], ["돗자리", "공용"]]);
});

test("이미 있는 이름은 담당이 달라도 건너뛰고 무엇을 뺐는지 알린다", () => {
  const plan = planPackingImport(
    [packing({ name: " 충전기 ", owner: "여울" }), packing({ name: "세면도구" }), packing({ name: "세면도구" })],
    ["충전기"],
    participants,
    freshId(),
  );

  assert.deepEqual(plan.taken.map((item) => item.name), ["세면도구"]);
  assert.deepEqual(plan.skipped, ["충전기", "세면도구"]);
  assert.equal(importMessage("준비물", plan), "준비물 1개를 가져왔어요. 2개는 이미 있어 건너뛰었어요");
});

test("요리는 재료까지 오고 현지 구매 표시는 유지된다", () => {
  const plan = planRecipeImport([recipe()], [], participants, freshId());

  assert.deepEqual(plan.taken, [
    {
      id: "new-1",
      name: "버섯전골",
      note: "첫날 저녁",
      url: "https://example.com/1",
      ingredients: [
        { id: "new-2", name: "배추", quantity: "1/4통", group: "채소", owner: "구매" },
        { id: "new-3", name: "팽이버섯", quantity: "1봉", group: "채소", owner: "하늘" },
      ],
    },
  ]);
});

test("재료 담당도 이번 여행 참가자만 남는다", () => {
  const plan = planRecipeImport(
    [recipe({ ingredients: [{ id: "i", name: "두부", quantity: "1모", group: "", owner: "바다", ready: true }] })],
    [],
    participants,
    freshId(),
  );

  assert.deepEqual(plan.taken[0].ingredients, [
    { id: "new-2", name: "두부", quantity: "1모", group: "기본", owner: "미정" },
  ]);
});

test("이미 있는 요리는 건너뛰고 한 요리 안에서 겹치는 재료는 하나만 둔다", () => {
  const plan = planRecipeImport(
    [
      recipe(),
      recipe({
        name: "김밥",
        ingredients: [
          { id: "a", name: "단무지", quantity: "1", group: "기본", owner: "미정", ready: false },
          { id: "b", name: " 단무지 ", quantity: "2", group: "기본", owner: "미정", ready: false },
        ],
      }),
    ],
    ["버섯전골"],
    participants,
    freshId(),
  );

  assert.deepEqual(plan.taken.map((item) => item.name), ["김밥"]);
  assert.deepEqual(plan.taken[0].ingredients.map((item) => item.name), ["단무지"]);
  assert.deepEqual(plan.skipped, ["버섯전골"]);
});

test("가져올 것이 하나도 없을 때의 말", () => {
  assert.equal(importMessage("요리", { taken: [], skipped: ["버섯전골"] }), "이미 있는 요리뿐이에요");
  assert.equal(importMessage("요리", { taken: [], skipped: [] }), "가져올 요리가 없어요");
  assert.equal(importMessage("요리", { taken: [1], skipped: [] }), "요리 1개를 가져왔어요");
});
