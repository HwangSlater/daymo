import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

/**
 * 여행에서 쓴 돈.
 *
 * 낸 사람과 누구 몫인지를 따로 둔다. 둘이 함께 쓰는 수첩이라 대개는 한 사람이
 * 내고 반씩 나누지만, 혼자 산 기념품처럼 낸 사람과 몫이 다른 경우가 늘 있다.
 * 하나로 합치면 그런 지출이 정산에서 어긋난다.
 */
export type ExpenseCategory = "식비" | "교통" | "숙박" | "입장료" | "쇼핑" | "기타";
export type ExpensePayer = "하늘" | "여울";
/** 누구 몫인가. `함께` 는 반씩 나눈다. */
export type ExpenseShare = "함께" | "하늘" | "여울";

export type Expense = {
  id: string;
  /** 여행 날짜 선택지와 같은 형식. "22일(토)" */
  day: string;
  title: string;
  /** 원 단위 정수. */
  amount: number;
  category: ExpenseCategory;
  payer: ExpensePayer;
  share: ExpenseShare;
  memo: string;
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["식비", "교통", "숙박", "입장료", "쇼핑", "기타"];
export const EXPENSE_PAYERS: ExpensePayer[] = ["하늘", "여울"];
export const EXPENSE_SHARES: ExpenseShare[] = ["함께", "하늘", "여울"];

/** 1234567 → "1,234,567". 돈은 세 자리마다 끊어야 한눈에 자릿수가 읽힌다. */
export function won(amount: number): string {
  return Math.round(amount).toLocaleString("ko-KR");
}

/**
 * 입력한 글자에서 금액을 읽는다. "12,000원" 도 "12000" 도 12000 이 된다.
 * 숫자가 없으면 0 이다. 쉼표나 원 을 지우라고 시키지 않으려고 둔다.
 */
export function parseAmount(text: string): number {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export type Settlement = {
  total: number;
  /** 각자 실제로 낸 돈. */
  paid: Record<ExpensePayer, number>;
  /** 각자 내야 했던 몫. */
  owed: Record<ExpensePayer, number>;
  /** 주는 사람. 정산할 게 없으면 null. */
  from: ExpensePayer | null;
  to: ExpensePayer | null;
  /** 주고받을 금액. 원 단위로 반올림한다. */
  amount: number;
};

/**
 * 낸 돈과 몫을 견줘 누가 누구에게 얼마를 줘야 하는지 낸다.
 *
 * 반씩 나눈 지출에서 홀수 원이 나오면 소수점이 생긴다. 계산은 소수로 하고
 * 마지막에 한 번만 반올림한다. 중간마다 반올림하면 건수가 쌓일수록 어긋난다.
 */
export function settle(expenses: Expense[]): Settlement {
  const paid: Record<ExpensePayer, number> = { 하늘: 0, 여울: 0 };
  const owed: Record<ExpensePayer, number> = { 하늘: 0, 여울: 0 };
  let total = 0;
  for (const item of expenses) {
    total += item.amount;
    paid[item.payer] += item.amount;
    if (item.share === "함께") {
      owed.하늘 += item.amount / 2;
      owed.여울 += item.amount / 2;
    } else {
      owed[item.share] += item.amount;
    }
  }
  // 더 낸 쪽이 받는다. 0 에 가까우면 정산할 게 없다.
  const balance = paid.하늘 - owed.하늘;
  const amount = Math.round(Math.abs(balance));
  if (amount === 0) return { total, paid, owed, from: null, to: null, amount: 0 };
  return balance > 0
    ? { total, paid, owed, from: "여울", to: "하늘", amount }
    : { total, paid, owed, from: "하늘", to: "여울", amount };
}

/** 분류별 합계. 쓴 게 있는 분류만, 많이 쓴 차례로 낸다. */
export function totalsByCategory(expenses: Expense[]): { category: ExpenseCategory; amount: number }[] {
  const sums = new Map<ExpenseCategory, number>();
  for (const item of expenses) {
    sums.set(item.category, (sums.get(item.category) ?? 0) + item.amount);
  }
  return EXPENSE_CATEGORIES.filter((category) => sums.has(category))
    .map((category) => ({ category, amount: sums.get(category) as number }))
    .sort((a, b) => b.amount - a.amount);
}

/** 날짜별 합계. 여행 날짜 차례를 그대로 따른다. */
export function totalsByDay(expenses: Expense[], days: string[]): { day: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const item of expenses) {
    sums.set(item.day, (sums.get(item.day) ?? 0) + item.amount);
  }
  const known = days.filter((day) => sums.has(day));
  // 여행 날짜에서 벗어난 지출도 잃어버리지 않는다.
  const extra = [...sums.keys()].filter((day) => !days.includes(day)).sort();
  return [...known, ...extra].map((day) => ({ day, amount: sums.get(day) as number }));
}

/** 스프레드시트 한 칸. 쉼표와 따옴표, 줄바꿈이 든 값만 따옴표로 감싼다. */
function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * 엑셀에서 바로 열리는 표를 만든다.
 *
 * 금액은 숫자 그대로 적어야 엑셀이 더할 수 있다. 쉼표나 원 을 붙이면 글자가
 * 된다. 맨 앞의 BOM 은 엑셀이 UTF-8 로 읽게 하는 표시다. 없으면 한글이 깨진다.
 */
export function expensesToCsv(tripName: string, expenses: Expense[]): string {
  const settlement = settle(expenses);
  const rows: string[] = [];
  rows.push(["날짜", "항목", "분류", "금액", "낸 사람", "누구 몫", "메모"].join(","));
  for (const item of expenses) {
    rows.push([item.day, item.title, item.category, item.amount, item.payer, item.share, item.memo].map(cell).join(","));
  }
  rows.push("");
  rows.push(["구분", "값"].join(","));
  rows.push([cell(`${tripName} 총 지출`), settlement.total].join(","));
  for (const person of EXPENSE_PAYERS) {
    rows.push([cell(`${person}이 낸 돈`), settlement.paid[person]].join(","));
    rows.push([cell(`${person} 몫`), Math.round(settlement.owed[person])].join(","));
  }
  rows.push([
    "정산",
    cell(settlement.from ? `${settlement.from}이 ${settlement.to}에게 ${won(settlement.amount)}원` : "정산할 게 없어요"),
  ].join(","));
  return `﻿${rows.join("\r\n")}\r\n`;
}

/** 파일 이름에 못 쓰는 글자를 지운다. 비면 기본 이름을 준다. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || "여행 비용";
}

/**
 * CSV 를 기기에 맞는 방법으로 내보낸다.
 *
 * 휴대폰은 파일로 만들어 공유 시트에 넘긴다. 웹은 공유 시트가 없어서 브라우저가
 * 그냥 내려받게 한다. 웹에도 navigator.share 가 있긴 하지만 로컬 파일 주소는
 * 받지 못해서, 쓰면 창이 뜨지 않고 그대로 멈춘다.
 *
 * 둘 다 안 되는 곳에서는 `unavailable` 을 돌려준다. 부르는 쪽에서 클립보드로
 * 대신 내보내라는 뜻이다.
 */
export async function shareExpenseCsv(fileName: string, csv: string): Promise<"shared" | "unavailable"> {
  const name = `${safeFileName(fileName)}.csv`;
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return "unavailable";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return "shared";
  }
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
    dialogTitle: `${fileName} 비용 내보내기`,
  });
  return "shared";
}
