import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Expense,
  type ExpensePayer,
  type ExpenseShare,
  expensesToCsv,
  parseAmount,
  settle,
  totalsByCategory,
  totalsByDay,
  currencyOf,
  money,
  toWon,
  won,
} from "./tripExpenses.ts";

const 지출 = (
  amount: number,
  payer: ExpensePayer,
  share: ExpenseShare,
  extra: Partial<Expense> = {},
): Expense => ({
  id: `e${amount}${payer}${share}`,
  day: "22일(토)",
  title: "항목",
  amount,
  category: "식비",
  payer,
  share,
  memo: "",
  ...extra,
});

test("금액은 세 자리마다 끊는다", () => {
  assert.equal(won(1234567), "1,234,567");
  assert.equal(won(0), "0");
  assert.equal(won(999), "999");
});

test("입력한 글자에서 숫자만 읽는다", () => {
  assert.equal(parseAmount("12,000원"), 12000);
  assert.equal(parseAmount("32000"), 32000);
  assert.equal(parseAmount("없음"), 0);
  assert.equal(parseAmount(""), 0);
});

test("지출이 없으면 정산할 것도 없다", () => {
  const result = settle([]);
  assert.equal(result.total, 0);
  assert.equal(result.amount, 0);
  assert.equal(result.from, null);
});

test("한 사람이 내고 반씩 나누면 절반을 받는다", () => {
  const result = settle([지출(10000, "하늘", "함께")]);
  assert.equal(result.amount, 5000);
  assert.equal(result.from, "여울");
  assert.equal(result.to, "하늘");
});

test("똑같이 내면 주고받을 게 없다", () => {
  const result = settle([지출(10000, "하늘", "함께"), 지출(10000, "여울", "함께")]);
  assert.equal(result.amount, 0);
  assert.equal(result.from, null);
});

test("낸 사람과 몫이 다르면 전액을 준다", () => {
  assert.equal(settle([지출(10000, "하늘", "여울")]).amount, 10000);
});

test("자기가 내고 자기 몫이면 0이다", () => {
  assert.equal(settle([지출(10000, "하늘", "하늘")]).amount, 0);
});

test("반올림은 건마다가 아니라 마지막에 한 번만 한다", () => {
  // 3원짜리 셋을 반씩 나누면 각자 4.5원이다. 건마다 반올림하면 6원이 된다.
  const result = settle([지출(3, "하늘", "함께"), 지출(3, "하늘", "함께"), 지출(3, "하늘", "함께")]);
  assert.equal(result.amount, 5);
});

test("각자 몫을 더하면 총액이 된다", () => {
  const result = settle([
    지출(32000, "하늘", "함께"),
    지출(47200, "하늘", "하늘"),
    지출(18000, "여울", "여울"),
  ]);
  assert.equal(result.owed.하늘 + result.owed.여울, result.total);
});

test("분류별 합계는 많이 쓴 차례로 나오고 안 쓴 분류는 빠진다", () => {
  const rows = totalsByCategory([
    지출(6000, "하늘", "함께", { category: "입장료" }),
    지출(180000, "하늘", "함께", { category: "숙박" }),
    지출(32000, "여울", "함께", { category: "식비" }),
  ]);
  assert.deepEqual(rows.map((row) => row.category), ["숙박", "식비", "입장료"]);
  assert.equal(rows[0].amount, 180000);
});

test("날짜별 합계는 여행 날짜 차례를 따르고, 벗어난 날도 잃지 않는다", () => {
  const days = ["22일(토)", "23일(일)"];
  const rows = totalsByDay([
    지출(1000, "하늘", "함께", { day: "23일(일)" }),
    지출(2000, "하늘", "함께", { day: "22일(토)" }),
    지출(500, "하늘", "함께", { day: "30일(일)" }),
  ], days);
  assert.deepEqual(rows, [
    { day: "22일(토)", amount: 2000 },
    { day: "23일(일)", amount: 1000 },
    { day: "30일(일)", amount: 500 },
  ]);
});

test("표는 BOM 으로 시작하고 금액을 숫자 그대로 적는다", () => {
  const csv = expensesToCsv("전주", [지출(32000, "하늘", "함께", { title: "점심" })]);
  assert.ok(csv.startsWith("﻿"), "엑셀이 UTF-8 로 읽으려면 BOM 이 필요하다");
  assert.ok(csv.includes(",32000,"), "쉼표나 원 을 붙이면 엑셀이 글자로 본다");
  assert.ok(csv.includes("전주 총 지출,32000"));
});

test("쉼표와 따옴표가 든 값은 따옴표로 감싼다", () => {
  const csv = expensesToCsv("여행", [
    지출(1000, "하늘", "함께", { title: "저녁, 마트", memo: '버섯전골 "재료"' }),
  ]);
  assert.ok(csv.includes('"저녁, 마트"'));
  assert.ok(csv.includes('"버섯전골 ""재료"""'));
});

test("정산할 게 없으면 표에도 그렇게 적는다", () => {
  const csv = expensesToCsv("여행", [지출(10000, "하늘", "하늘")]);
  assert.ok(csv.includes("정산,정산할 게 없어요"));
});

test("통화마다 자릿수와 기호가 다르다", () => {
  assert.equal(money(32000), "32,000원");
  assert.equal(money(32000, "KRW"), "32,000원");
  assert.equal(money(3200, "JPY"), "¥3,200");
  assert.equal(money(24.5, "USD"), "$24.50");
  assert.equal(money(24, "USD"), "$24.00");
  // 모르는 통화는 원으로 본다.
  assert.equal(money(100, "XXX"), "100원");
});

test("소수를 받는 통화는 점 하나를 남긴다", () => {
  assert.equal(parseAmount("24.50", 2), 24.5);
  assert.equal(parseAmount("$24.5", 2), 24.5);
  // 자릿수를 넘겨 적은 소수는 버린다.
  assert.equal(parseAmount("24.567", 2), 24.56);
  // 점이 여러 개면 첫 번째만 소수점으로 본다.
  assert.equal(parseAmount("2.4.5", 2), 2.45);
  assert.equal(parseAmount(".5", 2), 0.5);
  // 소수를 안 받는 통화는 점을 무시한다.
  assert.equal(parseAmount("24.50", 0), 2450);
});

test("환율로 원을 환산한다", () => {
  assert.equal(toWon(100, 9.3), 930);
  assert.equal(toWon(24.5, 1380), 33810);
  // 환율이 없거나 0 이면 그대로 둔다.
  assert.equal(toWon(1000, 0), 1000);
});

test("원이 아닌 여행은 표에 원 환산 칸이 붙는다", () => {
  const csv = expensesToCsv("오사카", [지출(3200, "하늘", "함께")], "JPY", 9.3);
  assert.ok(csv.includes("금액(JPY)"));
  assert.ok(csv.includes("원 환산"));
  assert.ok(csv.includes(",29760,"), "3200엔 × 9.3 = 29760원");
  assert.ok(csv.includes("1 JPY = 9.3원"), "환율의 소수가 살아 있어야 한다");
});

test("원 여행은 환산 칸 없이 그대로 간다", () => {
  const csv = expensesToCsv("전주", [지출(32000, "하늘", "함께")]);
  assert.ok(csv.includes("금액(KRW)"));
  assert.ok(!csv.includes("원 환산"));
  assert.ok(!csv.includes("환율"));
});

test("통화 목록에서 코드로 찾는다", () => {
  assert.equal(currencyOf("USD").fraction, 2);
  assert.equal(currencyOf("JPY").fraction, 0);
  assert.equal(currencyOf("없는코드").code, "KRW");
});
