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
  /** 여행에 정한 통화 기준 금액. 원 환산은 보여줄 때만 한다. */
  amount: number;
  category: ExpenseCategory;
  payer: ExpensePayer;
  share: ExpenseShare;
  memo: string;
  /** 영수증 사진 자리. 없으면 안 찍었다는 뜻이다. */
  receiptUri?: string;
};

/**
 * 여행에 쓸 수 있는 통화.
 *
 * `fraction` 은 소수 자릿수다. 원과 엔은 0, 달러와 유로는 2 다. 이 값이
 * 있어야 24 달러와 24.50 달러를 구별해 적을 수 있다.
 * `rate` 는 1 단위가 몇 원인지의 기본값이다. 환율은 매일 바뀌므로 여행마다
 * 고쳐 쓰라고 두는 출발점일 뿐이고, 실제 값은 사용자가 적는다.
 */
export type Currency = {
  code: string;
  label: string;
  symbol: string;
  fraction: 0 | 2;
  rate: number;
};

export const CURRENCIES: Currency[] = [
  { code: "KRW", label: "원", symbol: "원", fraction: 0, rate: 1 },
  { code: "JPY", label: "엔", symbol: "¥", fraction: 0, rate: 9.3 },
  { code: "USD", label: "달러", symbol: "$", fraction: 2, rate: 1380 },
  { code: "EUR", label: "유로", symbol: "€", fraction: 2, rate: 1490 },
  { code: "CNY", label: "위안", symbol: "¥", fraction: 2, rate: 190 },
  { code: "TWD", label: "대만 달러", symbol: "NT$", fraction: 0, rate: 43 },
  { code: "THB", label: "바트", symbol: "฿", fraction: 2, rate: 40 },
  { code: "VND", label: "동", symbol: "₫", fraction: 0, rate: 0.055 },
];

export const DEFAULT_CURRENCY = CURRENCIES[0];

export function currencyOf(code: string): Currency {
  return CURRENCIES.find((item) => item.code === code) ?? DEFAULT_CURRENCY;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["식비", "교통", "숙박", "입장료", "쇼핑", "기타"];
export const EXPENSE_PAYERS: ExpensePayer[] = ["하늘", "여울"];
export const EXPENSE_SHARES: ExpenseShare[] = ["함께", "하늘", "여울"];

/** 1234567 → "1,234,567". 돈은 세 자리마다 끊어야 한눈에 자릿수가 읽힌다. */
export function won(amount: number): string {
  return Math.round(amount).toLocaleString("ko-KR");
}

/** 통화에 맞춰 자릿수를 끊는다. 기호는 원이면 뒤에, 나머지는 앞에 붙인다. */
export function money(amount: number, code: string = DEFAULT_CURRENCY.code): string {
  const currency = currencyOf(code);
  const digits = amount.toLocaleString("ko-KR", {
    minimumFractionDigits: currency.fraction,
    maximumFractionDigits: currency.fraction,
  });
  return currency.code === "KRW" ? `${digits}원` : `${currency.symbol}${digits}`;
}

/**
 * 입력란에 보여줄 숫자. 기호 없이 자릿수만 끊는다.
 *
 * 치는 동안 기호까지 붙이면 지우기가 어색해진다. 기호는 읽는 자리에서만 쓴다.
 */
export function amountText(amount: number, fraction: 0 | 2 = 0): string {
  return amount.toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fraction,
  });
}

/** 여행 통화 금액을 원으로 옮긴다. 환율이 없으면 그대로 둔다. */
export function toWon(amount: number, rate: number): number {
  return Math.round(amount * (rate > 0 ? rate : 1));
}

/**
 * 입력한 글자에서 금액을 읽는다. "12,000원" 도 "12000" 도 12000 이 된다.
 * 쉼표나 원 을 지우라고 시키지 않으려고 둔다.
 *
 * 소수 자릿수를 받는 통화면 점 하나를 남긴다. 점이 여러 개면 첫 번째만 쓴다.
 * 자릿수를 넘겨 적은 소수는 버린다. 24.567 달러 같은 건 적을 일이 없다.
 */
export function parseAmount(text: string, fraction: 0 | 2 = 0): number {
  if (fraction === 0) {
    const digits = text.replace(/[^\d]/g, "");
    return digits ? Number(digits) : 0;
  }
  const cleaned = text.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  const decimals = rest.join("").slice(0, fraction);
  const value = Number(rest.length ? `${whole || "0"}.${decimals}` : whole);
  return Number.isFinite(value) ? value : 0;
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
export function expensesToCsv(
  tripName: string,
  expenses: Expense[],
  code: string = DEFAULT_CURRENCY.code,
  rate = 1,
): string {
  const settlement = settle(expenses);
  const currency = currencyOf(code);
  // 원이 아니면 원 환산을 한 칸 더 낸다. 원이면 같은 숫자가 두 번 나올 뿐이라 뺀다.
  const converted = currency.code !== "KRW";
  const head = ["날짜", "항목", "분류", `금액(${currency.code})`, "낸 사람", "누구 몫", "메모"];
  if (converted) head.splice(4, 0, "원 환산");
  const rows: string[] = [head.join(",")];
  for (const item of expenses) {
    const line: (string | number)[] = [item.day, item.title, item.category, item.amount, item.payer, item.share, item.memo];
    if (converted) line.splice(4, 0, toWon(item.amount, rate));
    rows.push(line.map(cell).join(","));
  }
  rows.push("");
  rows.push(["구분", `값(${currency.code})`, ...(converted ? ["원 환산"] : [])].join(","));
  const summary = (label: string, amount: number) => {
    rows.push([cell(label), amount, ...(converted ? [toWon(amount, rate)] : [])].join(","));
  };
  summary(`${tripName} 총 지출`, settlement.total);
  for (const person of EXPENSE_PAYERS) {
    summary(`${person}이 낸 돈`, settlement.paid[person]);
    summary(`${person} 몫`, Math.round(settlement.owed[person]));
  }
  if (converted) rows.push([cell("환율"), cell(`1 ${currency.code} = ${amountText(rate, 2)}원`)].join(","));
  rows.push([
    "정산",
    cell(settlement.from
      ? `${settlement.from}이 ${settlement.to}에게 ${money(settlement.amount, currency.code)}`
      : "정산할 게 없어요"),
  ].join(","));
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
