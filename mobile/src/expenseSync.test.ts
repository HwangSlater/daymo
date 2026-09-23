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
    receiptPhotoId: null,
    excluded: false,
    transportId: null,
  });
});

test("본인 부담은 낸 사람 혼자 몫인 일부로 보내고, 정산 제외와 교통편 연결은 그대로 오간다", () => {
  const codec = expenseCodec(dates, roster);
  const body = codec.toBody(expense({ shares: { 하늘: 1 }, splitMode: "본인", excluded: true, transportId: "t-1" }));
  assert.equal(body.splitMode, "subset");
  assert.deepEqual(body.shares, [{ membershipId: "m-me", weight: 1 }]);
  assert.equal(body.excluded, true);
  assert.equal(body.transportId, "t-1");

  const back = codec.fromServer({ id: A, version: 1, ...body });
  assert.equal(back.excluded, true);
  assert.equal(back.transportId, "t-1");
  // 서버는 「본인」을 모른다. 되살리는 건 열 때 모양을 보고 한다(`splitModeOf`).
  assert.equal(back.splitMode, "일부");
  // 옛 서버 응답처럼 두 칸이 없으면 기본값으로 본다.
  const old = codec.fromServer({ id: A, version: 1, ...body, excluded: undefined, transportId: undefined });
  assert.equal(old.excluded, undefined);
  assert.equal(old.transportId, undefined);
});

test("영수증은 같은 사진이거나 아직 올리지 않았을 때만 기기 파일을 지킨다", () => {
  const codec = expenseCodec(dates, roster);
  const server = expense({ receiptPhotoId: "p-1" });

  assert.equal(codec.keepLocal?.(server, expense({ receiptUri: "file:///a.jpg" })).receiptUri, "file:///a.jpg");
  assert.equal(codec.keepLocal?.(server, expense({ receiptUri: "file:///a.jpg", receiptPhotoId: "p-1" })).receiptUri, "file:///a.jpg");
  assert.equal(codec.keepLocal?.(expense(), expense({ receiptUri: "file:///a.jpg", receiptPhotoId: "p-1" })).receiptUri, undefined);
  assert.equal(codec.toBody(server).receiptPhotoId, "p-1");
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

test("기간 밖 이름표는 올리지 않고, 날짜를 옮기면 새 이름표로 간다", () => {
  const codec = expenseCodec(dates, roster);
  // 여행 기간을 옮기면 옛 이름표가 기간에서 사라진다. 그때 date: null 로 올려 서버의
  // 날짜를 지우던 것을 막는다(2026-09-23).
  const 잃은_것 = expense({ day: "9일(금)" });
  assert.equal(codec.syncable(잃은_것), false);
  assert.equal(codec.blockReason?.(잃은_것), "여행 기간 밖의 날짜예요");
  assert.deepEqual(planListSync([잃은_것], codec, new Map()), { creates: [], updates: [], deletes: [] });
  // 날짜를 아직 고르지 않은 지출은 그대로 올린다.
  assert.equal(codec.syncable(expense({ day: "" })), true);
  assert.equal(codec.toBody(expense({ day: "" })).date, null);

  // 화면이 이름표를 새 기간으로 옮기고 나면 그 날짜로 올라간다.
  const 옮긴_뒤 = expenseCodec(tripDateKeys("2026-10-08", "2026-10-10"), roster);
  assert.equal(옮긴_뒤.syncable(잃은_것), true);
  assert.equal(옮긴_뒤.toBody(잃은_것).date, "2026-10-09");
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
