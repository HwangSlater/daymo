import assert from "node:assert/strict";
import { test } from "node:test";

import { expenseCodec, paymentCodec, UNKNOWN_PERSON } from "./expenseSync.ts";
import { bodyKey, hasWork, planListSync, tripDateKeys, type Confirmed } from "./listSync.ts";
import type { Expense } from "./tripExpenses.ts";

const A = "11111111-1111-4111-8111-111111111111";
const dates = tripDateKeys("2026-10-01", "2026-10-03");
const roster = [{ id: "m-me", name: "하늘" }, { id: "m-yeoul", name: "여울" }];

const expense = (extra: Partial<Expense> = {}): Expense => ({
  id: A,
  day: "2일(금)",
  title: "소나기식당 점심",
  amount: 48000,
  category: "식비",
  payer: "하늘",
  shares: { 여울: 18000, 하늘: 30000 },
  splitMode: "금액",
  memo: "",
  ...extra,
});

test("지출을 서버 모양으로 바꾸고 사람은 membership id 로 보낸다", () => {
  assert.deepEqual(expenseCodec(dates, roster).toBody(expense()), {
    date: "2026-10-02",
    title: "소나기식당 점심",
    amount: 48000,
    category: "meal",
    payerMembershipId: "m-me",
    splitMode: "amount",
    shares: [{ membershipId: "m-me", weight: 30000 }, { membershipId: "m-yeoul", weight: 18000 }],
    memo: null,
  });
});

test("공간에 없는 이름이 섞이거나 0원이면 올리지 않는다", () => {
  const codec = expenseCodec(dates, roster);

  assert.equal(codec.syncable(expense({ payer: "동행" })), false);
  assert.equal(codec.syncable(expense({ shares: { 하늘: 1, 가람: 1 } })), false);
  assert.equal(codec.syncable(expense({ amount: 0 })), false);
  assert.equal(codec.syncable(expense({ shares: undefined })), true);
});

test("서버 지출은 이름으로 돌아오고, 다시 보내도 같은 모습이며 영수증 자리는 지킨다", () => {
  const codec = expenseCodec(dates, roster);
  const back = codec.fromServer({
    id: A, date: "2026-10-02", title: "소나기식당 점심", amount: 48000, category: "meal", payerMembershipId: "m-me",
    splitMode: "amount", shares: [{ membershipId: "m-yeoul", weight: 18000 }, { membershipId: "m-me", weight: 30000 }], memo: null, version: 2,
  });

  assert.deepEqual(back, expense());
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(codec.toBody(back)), version: 2 }]]);
  assert.equal(hasWork(planListSync([back], codec, confirmed)), false);
  assert.equal(codec.keepLocal?.(back, expense({ receiptUri: "file:///r.jpg" })).receiptUri, "file:///r.jpg");
});

test("나간 멤버가 낸 서버 지출은 목록에 남고 서버에서 지우지 않는다", () => {
  const codec = expenseCodec(dates, roster);
  const back = codec.fromServer({
    id: A, date: null, title: "x", amount: 1000, category: "other", payerMembershipId: "m-left", splitMode: null, shares: [], memo: null, version: 1,
  });

  assert.equal(back.payer, UNKNOWN_PERSON);
  assert.equal(codec.syncable(back), false);
  assert.deepEqual(planListSync([back], codec, new Map([[A, { key: "x", version: 1 }]])).deletes, []);
});

test("주고받은 기록은 이름과 시각을 오간다", () => {
  const codec = paymentCodec(roster);
  const at = Date.UTC(2026, 9, 3, 1, 2, 3);
  const body = codec.toBody({ id: A, from: "여울", to: "하늘", amount: 22500, at });

  assert.deepEqual(body, { fromMembershipId: "m-yeoul", toMembershipId: "m-me", amount: 22500, paidAt: "2026-10-03T01:02:03.000Z" });
  const back = codec.fromServer({ id: A, version: 1, ...body, paidAt: "2026-10-03T01:02:03+00:00" });
  assert.deepEqual(back, { id: A, from: "여울", to: "하늘", amount: 22500, at });
  assert.equal(bodyKey(codec.toBody(back)), bodyKey(body));
});
