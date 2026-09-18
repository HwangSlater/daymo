import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Expense,
  type Participant,
  amountText,
  currencyOf,
  expenseFromTransport,
  expensesToCsv,
  josa,
  money,
  normalizeExpense,
  parseAmount,
  settle,
  shareLabel,
  spentTotal,
  splitAmounts,
  splitModeOf,
  toWon,
  totalsByCategory,
  totalsByDay,
  transportExpenseOf,
  won,
} from "./tripExpenses.ts";

const 둘 = ["하늘", "여울"];
const 넷 = ["하늘", "여울", "가람", "새봄"];

const 지출 = (
  amount: number,
  payer: Participant,
  shares?: Record<Participant, number>,
  extra: Partial<Expense> = {},
): Expense => ({
  id: `e${amount}${payer}`,
  day: "22일(토)",
  title: "항목",
  amount,
  category: "식비",
  payer,
  shares,
  memo: "",
  ...extra,
});

test("금액은 세 자리마다 끊는다", () => {
  assert.equal(won(1234567), "1,234,567");
  assert.equal(won(0), "0");
});

test("입력한 글자에서 숫자만 읽는다", () => {
  assert.equal(parseAmount("12,000원"), 12000);
  assert.equal(parseAmount("없음"), 0);
  assert.equal(parseAmount(""), 0);
});

test("통화마다 자릿수와 기호가 다르다", () => {
  assert.equal(money(32000), "32,000원");
  assert.equal(money(3200, "JPY"), "¥3,200");
  assert.equal(money(24.5, "USD"), "$24.50");
  // 모르는 통화는 원으로 본다.
  assert.equal(money(100, "XXX"), "100원");
});

test("소수를 받는 통화는 점 하나를 남긴다", () => {
  assert.equal(parseAmount("24.50", 2), 24.5);
  assert.equal(parseAmount("24.567", 2), 24.56);
  assert.equal(parseAmount("2.4.5", 2), 2.45);
  // 소수를 안 받는 통화는 점을 무시한다.
  assert.equal(parseAmount("24.50", 0), 2450);
});

test("환율로 원을 환산한다", () => {
  assert.equal(toWon(100, 9.3), 930);
  assert.equal(toWon(1000, 0), 1000);
});

test("통화 목록에서 코드로 찾는다", () => {
  assert.equal(currencyOf("USD").fraction, 2);
  assert.equal(currencyOf("없는코드").code, "KRW");
});

test("입력란 숫자는 기호 없이 자릿수만 끊는다", () => {
  assert.equal(amountText(32000), "32,000");
  assert.equal(amountText(24.5, 2), "24.5");
});

// --- 나누기 ---------------------------------------------------------------

test("비중이 없으면 참가자 전원이 똑같이 나눈다", () => {
  assert.deepEqual(splitAmounts(지출(40000, "하늘"), 넷), {
    하늘: 10000, 여울: 10000, 가람: 10000, 새봄: 10000,
  });
});

test("참가자가 바뀌면 같은 지출도 다르게 나뉜다", () => {
  // 비중을 안 적어 뒀기 때문에 사람이 빠져도 고칠 게 없다.
  assert.deepEqual(splitAmounts(지출(40000, "하늘"), 둘), { 하늘: 20000, 여울: 20000 });
});

test("적어 둔 사람만 몫을 진다", () => {
  assert.deepEqual(splitAmounts(지출(30000, "하늘", { 가람: 1, 새봄: 1 }), 넷), {
    가람: 15000, 새봄: 15000,
  });
});

test("비중은 비율이 아니라 무게라 합이 얼마든 된다", () => {
  assert.deepEqual(splitAmounts(지출(100000, "하늘", { 하늘: 7, 여울: 3 }), 둘), {
    하늘: 70000, 여울: 30000,
  });
  assert.deepEqual(splitAmounts(지출(100000, "하늘", { 하늘: 70, 여울: 30 }), 둘), {
    하늘: 70000, 여울: 30000,
  });
});

test("0 이하만 적힌 비중은 무시하고 전원 균등으로 돌아간다", () => {
  assert.deepEqual(splitAmounts(지출(10000, "하늘", { 하늘: 0, 여울: 0 }), 둘), {
    하늘: 5000, 여울: 5000,
  });
});

test("참가자가 아무도 없으면 나눌 것이 없다", () => {
  assert.deepEqual(splitAmounts(지출(10000, "하늘"), []), {});
});

test("누구 몫인지 읽을 수 있게 적는다", () => {
  assert.equal(shareLabel(지출(1, "하늘"), 넷), "함께");
  assert.equal(shareLabel(지출(1, "하늘", { 가람: 1 }), 넷), "가람");
  // 낸 사람 혼자 몫이면 이름 대신 본인 부담이라고 적는다.
  assert.equal(shareLabel(지출(1, "하늘", { 하늘: 1 }), 넷), "본인 부담");
  assert.equal(shareLabel(지출(1, "하늘", { 하늘: 7, 여울: 3 }), 둘), "하늘 7 · 여울 3");
  assert.equal(shareLabel(지출(1, "하늘", { 가람: 1, 새봄: 1 }), 넷), "가람 · 새봄 균등");
  // 전원에게 같은 무게를 적어 둔 것도 결국 함께다.
  assert.equal(shareLabel(지출(1, "하늘", { 하늘: 1, 여울: 1 }), 둘), "함께");
});

test("저장된 지출의 나누기 방식을 모양에서 되살린다", () => {
  assert.equal(splitModeOf(지출(1, "하늘")), "균등");
  // 낸 사람 혼자 몫이면 서버가 「일부」로 돌려줘도 본인 부담이다.
  assert.equal(splitModeOf(지출(1, "하늘", { 하늘: 1 }, { splitMode: "일부" })), "본인");
  assert.equal(splitModeOf(지출(1, "하늘", { 하늘: 1 })), "본인");
  // 다른 한 사람 몫은 본인 부담이 아니다.
  assert.equal(splitModeOf(지출(1, "하늘", { 여울: 1 })), "일부");
  assert.equal(splitModeOf(지출(1, "하늘", { 하늘: 1, 여울: 1 })), "일부");
  assert.equal(splitModeOf(지출(1, "하늘", { 하늘: 7, 여울: 3 })), "금액");
  // 적어 둔 방식이 있으면 그걸 따른다. 같은 금액을 둘에게 직접 적었을 수도 있다.
  assert.equal(splitModeOf(지출(1, "하늘", { 하늘: 5000, 여울: 5000 }, { splitMode: "금액" })), "금액");
  // 0 만 적힌 비중은 없는 것과 같다.
  assert.equal(splitModeOf(지출(1, "하늘", { 하늘: 0 })), "균등");
});

// --- 정산 -----------------------------------------------------------------

test("지출이 없으면 주고받을 것도 없다", () => {
  const result = settle([], 넷);
  assert.equal(result.total, 0);
  assert.deepEqual(result.transfers, []);
});

test("한 사람이 내고 둘이 나누면 절반을 돌려받는다", () => {
  const result = settle([지출(10000, "하늘")], 둘);
  assert.deepEqual(result.transfers, [{ from: "여울", to: "하늘", amount: 5000 }]);
});

test("똑같이 내면 주고받을 게 없다", () => {
  assert.deepEqual(settle([지출(10000, "하늘"), 지출(10000, "여울")], 둘).transfers, []);
});

test("자기가 내고 자기 몫이면 정산이 없다", () => {
  assert.deepEqual(settle([지출(10000, "하늘", { 하늘: 1 })], 둘).transfers, []);
});

test("본인 부담은 남에게 청구하지 않지만 총 지출에는 든다", () => {
  const result = settle([지출(40000, "하늘"), 지출(9000, "여울", { 여울: 1 }, { splitMode: "본인" })], 둘);
  assert.equal(result.total, 49000);
  assert.equal(result.owed.여울, 20000 + 9000);
  assert.equal(result.paid.여울, 9000);
  // 하늘이 낸 4만원의 절반만 오간다. 여울의 표값은 여울 몫이다.
  assert.deepEqual(result.transfers, [{ from: "여울", to: "하늘", amount: 20000 }]);
});

test("정산에서 뺀 지출은 합계에도 빚에도 안 들고 목록에만 남는다", () => {
  const 지출들 = [지출(40000, "하늘"), 지출(30000, "여울", undefined, { excluded: true, title: "회사 청구 택시" })];
  const result = settle(지출들, 둘);
  assert.equal(result.total, 40000);
  assert.equal(result.paid.여울, 0);
  assert.equal(result.owed.하늘, 20000);
  assert.deepEqual(result.transfers, [{ from: "여울", to: "하늘", amount: 20000 }]);
  assert.equal(spentTotal(지출들), 40000);
  assert.deepEqual(totalsByCategory(지출들), [{ category: "식비", amount: 40000 }]);
  // 뺀 지출만 있는 날은 날짜별 합계에서 빠진다.
  assert.deepEqual(totalsByDay([지출(1000, "하늘", undefined, { day: "23일(일)", excluded: true })], ["22일(토)", "23일(일)"]), []);
});

test("넷이 가고 한 사람이 다 냈으면 셋이 각각 준다", () => {
  const result = settle([지출(40000, "하늘")], 넷);
  assert.equal(result.transfers.length, 3);
  assert.ok(result.transfers.every((transfer) => transfer.to === "하늘" && transfer.amount === 10000));
});

test("여러 사람이 나눠 냈으면 오가는 횟수를 줄여 묶는다", () => {
  // 넷이 12만원을 썼으니 각자 3만원 몫이다.
  // 하늘과 여울이 6만원씩 냈고 가람과 새봄은 안 냈다.
  const result = settle([지출(60000, "하늘"), 지출(60000, "여울")], 넷);
  // 받을 사람 둘, 줄 사람 둘이라 두 번이면 끝난다.
  assert.equal(result.transfers.length, 2);
  assert.equal(result.transfers.reduce((sum, transfer) => sum + transfer.amount, 0), 60000);
});

test("참가자에서 빠진 사람이 낸 돈도 정산에 들어간다", () => {
  // 가람이 냈지만 참가자 목록에는 둘만 있다. 돈이 사라지면 안 된다.
  const result = settle([지출(20000, "가람")], 둘);
  assert.equal(result.paid.가람, 20000);
  assert.equal(result.transfers.reduce((sum, transfer) => sum + transfer.amount, 0), 20000);
  assert.ok(result.transfers.every((transfer) => transfer.to === "가람"));
});

test("반올림은 건마다가 아니라 주고받을 때 한 번만 한다", () => {
  // 셋이 10원씩 세 번, 한 사람이 다 냈다. 각자 몫은 10원이다.
  const result = settle([지출(10, "하늘"), 지출(10, "하늘"), 지출(10, "하늘")], ["하늘", "여울", "가람"]);
  assert.equal(result.total, 30);
  assert.equal(result.transfers.reduce((sum, transfer) => sum + transfer.amount, 0), 20);
});

test("각자 몫을 더하면 총액이 된다", () => {
  const result = settle([지출(32000, "하늘"), 지출(18000, "가람", { 가람: 1 })], 넷);
  const owedTotal = Object.values(result.owed).reduce((sum, value) => sum + value, 0);
  assert.equal(Math.round(owedTotal), result.total);
});

// --- 옛 데이터 옮기기 ------------------------------------------------------

test("옛 함께 지출은 비중 없이 그대로 둔다", () => {
  assert.equal(normalizeExpense({ ...지출(10000, "하늘"), share: "함께" }).shares, undefined);
});

test("옛 한 사람 몫은 그 사람 비중으로 옮긴다", () => {
  assert.deepEqual(normalizeExpense({ ...지출(1, "하늘"), share: "여울" }).shares, { 여울: 1 });
});

test("옛 직접 비율은 두 사람 비중으로 옮긴다", () => {
  assert.deepEqual(
    normalizeExpense({ ...지출(1, "하늘"), share: "직접", splitSky: 70 }).shares,
    { 하늘: 70, 여울: 30 },
  );
  // 비율을 안 적었으면 반반이다.
  assert.deepEqual(normalizeExpense({ ...지출(1, "하늘"), share: "직접" }).shares, { 하늘: 50, 여울: 50 });
});

// --- 합계와 표 -------------------------------------------------------------

test("분류별 합계는 많이 쓴 차례로 나오고 안 쓴 분류는 빠진다", () => {
  const rows = totalsByCategory([
    지출(6000, "하늘", undefined, { category: "입장료" }),
    지출(180000, "하늘", undefined, { category: "숙박" }),
    지출(32000, "여울", undefined, { category: "식비" }),
  ]);
  assert.deepEqual(rows.map((row) => row.category), ["숙박", "식비", "입장료"]);
});

test("날짜별 합계는 여행 날짜 차례를 따르고, 벗어난 날도 잃지 않는다", () => {
  const rows = totalsByDay([
    지출(1000, "하늘", undefined, { day: "23일(일)" }),
    지출(2000, "하늘", undefined, { day: "22일(토)" }),
    지출(500, "하늘", undefined, { day: "30일(일)" }),
  ], ["22일(토)", "23일(일)"]);
  assert.deepEqual(rows, [
    { day: "22일(토)", amount: 2000 },
    { day: "23일(일)", amount: 1000 },
    { day: "30일(일)", amount: 500 },
  ]);
});

test("표는 BOM 으로 시작하고 금액을 숫자 그대로 적는다", () => {
  const csv = expensesToCsv("전주", [지출(32000, "하늘", undefined, { title: "점심" })], 둘);
  assert.ok(csv.startsWith("﻿"), "엑셀이 UTF-8 로 읽으려면 BOM 이 필요하다");
  assert.ok(csv.includes(",32000,"), "쉼표나 원 을 붙이면 엑셀이 글자로 본다");
  assert.ok(csv.includes("전주 총 지출,32000"));
});

test("쉼표와 따옴표가 든 값은 따옴표로 감싼다", () => {
  const csv = expensesToCsv("여행", [
    지출(1000, "하늘", undefined, { title: "저녁, 마트", memo: '버섯전골 "재료"' }),
  ], 둘);
  assert.ok(csv.includes('"저녁, 마트"'));
  assert.ok(csv.includes('"버섯전골 ""재료"""'));
});

test("표의 누구 몫 칸에 비중이 들어간다", () => {
  const csv = expensesToCsv("여행", [지출(50000, "여울", { 하늘: 3, 여울: 7 })], 둘);
  assert.ok(csv.includes("하늘 3 · 여울 7"));
});

test("표에 사람마다 낸 돈과 몫이 한 줄씩 들어간다", () => {
  const csv = expensesToCsv("여행", [지출(40000, "하늘")], 넷);
  for (const person of 넷) {
    assert.ok(csv.includes(`${person}이 낸 돈`), person);
    assert.ok(csv.includes(`${person} 몫`), person);
  }
});

test("정산이 여러 줄이면 표에도 여러 줄로 적는다", () => {
  const csv = expensesToCsv("여행", [지출(40000, "하늘")], 넷);
  assert.equal(csv.split("\r\n").filter((line) => line.startsWith("정산,")).length, 3);
});

test("표에서 본인 부담과 정산 제외를 알아볼 수 있고 합계는 뺀 것을 세지 않는다", () => {
  const csv = expensesToCsv("여행", [
    지출(10000, "하늘", { 하늘: 1 }, { title: "KTX" }),
    지출(5000, "여울", undefined, { title: "택시", excluded: true }),
  ], 둘);
  assert.ok(csv.includes("KTX,식비,10000,하늘,본인 부담"));
  assert.ok(csv.includes("택시,식비,5000,여울,정산 제외"));
  assert.ok(csv.includes("여행 총 지출,10000"));
});

test("정산할 게 없으면 표에도 그렇게 적는다", () => {
  const csv = expensesToCsv("여행", [지출(10000, "하늘", { 하늘: 1 })], 둘);
  assert.ok(csv.includes("정산,정산할 게 없어요"));
});

test("원이 아닌 여행은 표에 원 환산 칸이 붙는다", () => {
  const csv = expensesToCsv("오사카", [지출(3200, "하늘")], 둘, "JPY", 9.3);
  assert.ok(csv.includes("금액(JPY)"));
  assert.ok(csv.includes("원 환산"));
  assert.ok(csv.includes(",29760,"), "3200엔 × 9.3 = 29760원");
  assert.ok(csv.includes("1 JPY = 9.3원"), "환율의 소수가 살아 있어야 한다");
});

test("원 여행은 환산 칸 없이 그대로 간다", () => {
  const csv = expensesToCsv("전주", [지출(32000, "하늘")], 둘);
  assert.ok(csv.includes("금액(KRW)"));
  assert.ok(!csv.includes("원 환산"));
});

test("조사는 받침 있는 이름 뒤에 이, 없는 이름 뒤에 가", () => {
  assert.equal(josa("여울", "이", "가"), "이");
  assert.equal(josa("하늘", "이", "가"), "이");
  assert.equal(josa("지수", "이", "가"), "가");
  assert.equal(josa("가람", "이", "가"), "이");
  assert.equal(josa("새봄", "이", "가"), "이");
  assert.equal(josa("미나", "이", "가"), "가");
});

test("조사는 한글이 아닌 이름과 빈 이름도 넘긴다", () => {
  assert.equal(josa("Alex", "이", "가"), "가");
  assert.equal(josa("", "은", "는"), "는");
  assert.equal(josa("  여울  ", "은", "는"), "은");
});

test("표에도 조사가 맞게 들어간다", () => {
  const rows = expensesToCsv("여행", [지출(20000, "지수")], ["하늘", "지수"]).split("\r\n");
  assert.ok(rows.some((row) => row.includes("지수가 낸 돈")));
  assert.ok(rows.some((row) => row.includes("하늘이 지수에게")));
});

test("보냈다고 적으면 잔액에서 빠진다", () => {
  const 지출들 = [지출(40000, "하늘")];
  const 전 = settle(지출들, 넷);
  assert.equal(전.balances["여울"], -10000);
  assert.equal(전.transfers.length, 3);

  const 후 = settle(지출들, 넷, {
    payments: [{ id: "p1", from: "여울", to: "하늘", amount: 10000, at: 1 }],
  });
  assert.equal(후.balances["여울"], 0);
  assert.equal(후.balances["하늘"], 20000);
  assert.deepEqual(후.transfers.map((t) => t.from).sort(), ["가람", "새봄"]);
});

test("일부만 보내도 보낸 만큼 줄어든다", () => {
  const 후 = settle([지출(40000, "하늘")], 넷, {
    payments: [{ id: "p1", from: "여울", to: "하늘", amount: 4000, at: 1 }],
  });
  assert.equal(후.balances["여울"], -6000);
  const 여울줄 = 후.transfers.find((t) => t.from === "여울");
  assert.equal(여울줄?.amount, 6000);
});

test("다 보내고 나면 정산할 게 없다", () => {
  const 후 = settle([지출(40000, "하늘")], 넷, {
    payments: [
      { id: "p1", from: "여울", to: "하늘", amount: 10000, at: 1 },
      { id: "p2", from: "가람", to: "하늘", amount: 10000, at: 2 },
      { id: "p3", from: "새봄", to: "하늘", amount: 10000, at: 3 },
    ],
  });
  assert.deepEqual(후.transfers, []);
  assert.equal(후.balances["하늘"], 0);
});

test("묶지 않으면 누구에게 진 빚인지 그대로 나온다", () => {
  // 하늘이 숙소를, 여울이 밥을 냈다. 가람은 둘 다에게 빚이 있다.
  const 지출들 = [지출(40000, "하늘"), 지출(20000, "여울")];
  const 묶음 = settle(지출들, 넷, { simplify: true });
  const 그대로 = settle(지출들, 넷, { simplify: false });
  // 잔액은 방식과 무관하게 같다.
  assert.deepEqual(묶음.balances, 그대로.balances);
  // 묶으면 오갈 횟수가 적거나 같다.
  assert.ok(묶음.transfers.length <= 그대로.transfers.length);
  // 안 묶으면 가람은 하늘과 여울 양쪽에 보낸다.
  assert.deepEqual(
    그대로.transfers.filter((t) => t.from === "가람").map((t) => t.to).sort(),
    ["여울", "하늘"],
  );
});

test("서로 주고받을 게 있으면 상계한다", () => {
  // 하늘이 만원짜리를 둘이 나눠 냈고, 여울이 사천원짜리를 둘이 나눠 냈다.
  const 그대로 = settle([지출(10000, "하늘"), 지출(4000, "여울")], 둘, { simplify: false });
  assert.deepEqual(그대로.transfers, [{ from: "여울", to: "하늘", amount: 3000 }]);
});

test("직접 진 빚은 묶어도 남아서 왜 그런지 보여 줄 수 있다", () => {
  const 묶음 = settle([지출(40000, "하늘"), 지출(20000, "여울")], 넷);
  const 가람이진빚 = 묶음.direct.filter((t) => t.from === "가람");
  assert.deepEqual(가람이진빚.map((t) => [t.to, t.amount]).sort(), [["여울", 5000], ["하늘", 10000]]);
});

test("주고받을 목록은 큰 금액부터 나온다", () => {
  const result = settle([지출(40000, "하늘"), 지출(20000, "여울", { 가람: 1 })], 넷);
  const amounts = result.transfers.map((t) => t.amount);
  assert.deepEqual(amounts, [...amounts].sort((a, b) => b - a));
});

// --- 교통편에서 온 지출 --------------------------------------------------------

const 교통편 = { id: "t1", date: "22일(토)", departure: "서울", arrival: "부산", method: "KTX", owner: "여울" };

test("교통편은 타는 사람이 내고 본인 부담인 교통 지출이 된다", () => {
  const expense = expenseFromTransport(교통편, 59800, 둘, "e1");
  assert.deepEqual(expense, {
    id: "e1",
    day: "22일(토)",
    title: "서울→부산 KTX",
    amount: 59800,
    category: "교통",
    payer: "여울",
    shares: { 여울: 1 },
    splitMode: "본인",
    memo: "",
    transportId: "t1",
  });
  assert.deepEqual(settle([expense], 둘).transfers, []);
});

test("타는 사람이 참가자가 아니면 첫 참가자가 낸 것으로 둔다", () => {
  assert.equal(expenseFromTransport({ ...교통편, owner: "" }, 1000, 둘, "e1").payer, "하늘");
  assert.equal(expenseFromTransport({ ...교통편, owner: "나간 멤버" }, 1000, 둘, "e1").payer, "하늘");
});

test("같은 교통편에서 만든 지출을 찾는다", () => {
  const made = expenseFromTransport(교통편, 1000, 둘, "e1");
  assert.equal(transportExpenseOf([지출(1, "하늘"), made], "t1"), made);
  assert.equal(transportExpenseOf([지출(1, "하늘")], "t1"), undefined);
});

test("참가자가 아닌 사람에게 보낸 것도 셈에 든다", () => {
  const 후 = settle([지출(20000, "민수")], 둘, {
    payments: [{ id: "p1", from: "하늘", to: "민수", amount: 10000, at: 1 }],
  });
  assert.equal(후.balances["하늘"], 0);
  assert.equal(후.balances["민수"], 10000);
});
