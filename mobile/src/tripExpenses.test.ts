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
