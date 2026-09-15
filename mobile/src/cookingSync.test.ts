import assert from "node:assert/strict";
import { test } from "node:test";

import { packingCodec, recipeCodec, tidyTags, type PackingRow, type RecipeRow } from "./cookingSync.ts";
import { UNKNOWN_PERSON } from "./expenseSync.ts";
import { bodyKey, hasWork, planListSync, type Confirmed } from "./listSync.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const roster = [{ id: "m-me", name: "하늘" }, { id: "m-yeoul", name: "여울" }];

const packing = (extra: Partial<PackingRow> = {}): PackingRow => ({
  id: A, name: "충전기", quantity: "1개", owner: "하늘", tags: ["집에서", "출발 아침"], done: false, ...extra,
});

test("준비물 담당은 사람·공용·미정으로 나뉘어 간다", () => {
  const codec = packingCodec(roster);

  assert.deepEqual(codec.toBody(packing({ done: true })), {
    name: "충전기", quantity: "1개", ownerMembershipId: "m-me", isShared: false, completed: true, tags: ["집에서", "출발 아침"],
  });
  assert.deepEqual(
    [codec.toBody(packing({ owner: "공용" })), codec.toBody(packing({ owner: "미정", quantity: " " }))].map((body) => [body.ownerMembershipId, body.isShared, body.quantity]),
    [[null, true, "1개"], [null, false, null]],
  );
});

test("사람 표에 없는 담당이거나 옛 id 면 올리지 않는다", () => {
  const codec = packingCodec(roster);

  assert.equal(codec.syncable(packing({ owner: "동행" })), false);
  assert.equal(codec.syncable(packing({ id: "1726000000-0" })), false);
  assert.equal(codec.syncable(packing({ owner: "공용" })), true);
});

test("서버 준비물은 이름과 체크로 돌아오고 다시 보내도 같다", () => {
  const codec = packingCodec(roster);
  const back = codec.fromServer({
    id: A, name: "충전기", quantity: "1개", ownerMembershipId: "m-me", isShared: false, completed: false, tags: ["출발 아침", "집에서"], version: 3,
  });

  assert.equal(back.owner, "하늘");
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(codec.toBody(back)), version: 3 }]]);
  assert.equal(hasWork(planListSync([packing()], codec, confirmed)), false);
  assert.equal(hasWork(planListSync([packing({ done: true })], codec, confirmed)), true);
  assert.equal(codec.fromServer({ ...back, id: B, ownerMembershipId: "m-left", isShared: false, completed: true, quantity: null, name: "x", tags: [], version: 1 }).owner, UNKNOWN_PERSON);
});

test("태그는 서버처럼 공백을 줄이고 겹치면 하나만 둔다", () => {
  assert.deepEqual(tidyTags(["  출발   아침 ", "출발 아침", "", "가".repeat(25)]), ["출발 아침", "가".repeat(20)]);
});

const recipe = (extra: Partial<RecipeRow> = {}): RecipeRow => ({
  id: A,
  name: "버섯전골",
  note: "첫날 저녁",
  url: "https://example.com/recipe",
  ingredients: [
    { id: B, name: "배추", quantity: "1/4통", group: "기본", owner: "구매", ready: false },
    { id: C, name: "깻잎", quantity: "20장", group: "기본", owner: "여울", ready: true },
  ],
  ...extra,
});

test("요리는 재료와 함께 가고 구매·사람·미정이 마련 방식이 된다", () => {
  const body = recipeCodec(roster).toBody(recipe({ url: "javascript:alert(1)" }));

  assert.equal(body.sourceUrl, null);
  assert.deepEqual(body.ingredients.map((item) => [item.procurement, item.ownerMembershipId, item.ready]), [["buy", null, false], ["bring", "m-yeoul", true]]);
  assert.equal(recipeCodec(roster).toBody(recipe({ ingredients: [{ ...recipe().ingredients[0], owner: "미정" }] })).ingredients[0].procurement, "undecided");
});

test("재료 하나라도 옛 id 거나 모르는 담당이면 요리를 올리지 않는다", () => {
  const codec = recipeCodec(roster);
  const [first, second] = recipe().ingredients;

  assert.equal(codec.syncable(recipe()), true);
  assert.equal(codec.syncable(recipe({ ingredients: [first, { ...second, id: "c2" }] })), false);
  assert.equal(codec.syncable(recipe({ ingredients: [first, { ...second, owner: "가람" }] })), false);
});

test("서버 요리는 앱 모습으로 돌아오고 다시 보내도 같다", () => {
  const codec = recipeCodec(roster);
  const server = { id: A, version: 2, ...codec.toBody(recipe()) };
  const back = codec.fromServer(server);

  assert.deepEqual(back, recipe());
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(codec.toBody(back)), version: 2 }]]);
  assert.equal(hasWork(planListSync([recipe()], codec, confirmed)), false);
});
