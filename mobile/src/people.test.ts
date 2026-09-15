import assert from "node:assert/strict";
import { test } from "node:test";

import { rebindPeople, uniqueNames } from "./people.ts";

test("겹치는 이름과 사람이 아닌 담당 이름에는 번호를 붙인다", () => {
  assert.deepEqual(uniqueNames(["하늘", "하늘", " ", "공용", "하늘 2"]), ["하늘", "하늘 2", "이름 없는 멤버", "공용 2", "하늘 2 2"]);
});

const planning = () => ({
  participants: ["하늘", "여울"],
  packingItems: [{ id: "p", owner: "여울" }, { id: "q", owner: "공용" }],
  recipes: [{ id: "r", ingredients: [{ id: "i", owner: "여울" }, { id: "j", owner: "구매" }] }],
  transportations: [{ id: "t", owner: "하늘" }],
  expenses: [{ id: "e", payer: "여울", shares: { 여울: 1, 하늘: 2 } }],
  payments: [{ id: "x", from: "여울", to: "하늘" }],
  personNames: { "m-me": "하늘", "m-yeoul": "여울" },
  budget: 1000,
});

test("처음 여는 여행은 이름을 바꾸지 않고 지금 표를 적어 둔다", () => {
  const fresh = { ...planning(), personNames: undefined };
  const next = rebindPeople(fresh, [{ id: "m-me", name: "하늘" }, { id: "m-yeoul", name: "여울" }]);

  assert.deepEqual(next?.personNames, { "m-me": "하늘", "m-yeoul": "여울" });
  assert.deepEqual(next?.expenses, fresh.expenses);
});

test("이름을 바꾼 멤버는 기록 곳곳에서 따라 바뀐다", () => {
  const next = rebindPeople(planning(), [{ id: "m-me", name: "하늘" }, { id: "m-yeoul", name: "여울이" }]);

  assert.deepEqual(next?.participants, ["하늘", "여울이"]);
  assert.deepEqual(next?.packingItems.map((item) => item.owner), ["여울이", "공용"]);
  assert.deepEqual(next?.recipes[0].ingredients.map((item) => item.owner), ["여울이", "구매"]);
  assert.deepEqual(next?.transportations[0].owner, "하늘");
  assert.deepEqual(next?.expenses[0], { id: "e", payer: "여울이", shares: { 여울이: 1, 하늘: 2 } });
  assert.deepEqual(next?.payments[0], { id: "x", from: "여울이", to: "하늘" });
  assert.deepEqual(next?.personNames, { "m-me": "하늘", "m-yeoul": "여울이" });
  assert.equal(next?.budget, 1000);
});

test("두 사람이 이름을 맞바꿔도 섞이지 않고, 서버에서 온 참가자는 다시 바꾸지 않는다", () => {
  const next = rebindPeople(planning(), [{ id: "m-me", name: "여울" }, { id: "m-yeoul", name: "하늘" }]);

  assert.deepEqual(next?.expenses[0], { id: "e", payer: "하늘", shares: { 하늘: 1, 여울: 2 } });
  assert.deepEqual(next?.participants, ["하늘", "여울"]);
});

test("표에 아직 없는 사람은 저장해 둔 이름을 남긴다", () => {
  const next = rebindPeople(planning(), [{ id: "m-me", name: "하늘" }]);

  assert.deepEqual(next?.personNames, { "m-me": "하늘", "m-yeoul": "여울" });
  assert.equal(next?.expenses[0].payer, "여울");
});
