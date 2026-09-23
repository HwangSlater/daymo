/**
 * 여행에서 쓴 돈.
 *
 * 낸 사람과 누구 몫인지를 따로 둔다. 대개는 한 사람이 내고 참가자끼리 나누지만,
 * 혼자 산 기념품처럼 낸 사람과 몫이 다른 경우가 늘 있다. 하나로 합치면 그런
 * 지출이 정산에서 어긋난다.
 *
 * 참가자는 여행마다 다르다. 한 공간에 멤버가 여럿이어도 이번 여행에는 일부만
 * 가는 일이 흔해서, 몫은 공간 멤버가 아니라 이번 여행 참가자를 기준으로 나눈다.
 */
export type ExpenseCategory = "식비" | "교통" | "숙박" | "입장료" | "쇼핑" | "기타";

/** 참가자 이름. 공간 멤버 가운데 이번 여행에 가는 사람이다. */
export type Participant = string;

/**
 * 몫을 나누는 방식.
 *
 *   본인  낸 사람이 혼자 다 부담. 남에게 청구하지 않는다.
 *   균등  참가자 전원이 똑같이. 가장 흔해서 기본이다.
 *   일부  고른 사람끼리만 똑같이.
 *   금액  사람마다 얼마씩인지 직접.
 *
 * 사람은 비율보다 금액으로 생각한다. "7 대 3" 이 아니라 "얘는 만오천, 나머지
 * 나눠" 가 실제로 오가는 말이다.
 *
 * 「본인」은 서버에 따로 없다. 낸 사람 혼자 몫인 「일부」와 같은 모양으로 보내고,
 * 다시 열 때 `splitModeOf` 가 모양을 보고 되살린다. 정산은 어느 쪽이든 같다.
 */
export type SplitMode = "본인" | "균등" | "일부" | "금액";

export type Expense = {
  id: string;
  /** 여행 날짜 선택지와 같은 형식. "22일(토)" */
  day: string;
  title: string;
  /** 여행에 정한 통화 기준 금액. 원 환산은 보여줄 때만 한다. */
  amount: number;
  category: ExpenseCategory;
  payer: Participant;
  /**
   * 몫을 지는 사람과 그 비중.
   *
   * 없으면 참가자 전원이 똑같이 나눈다. 사람이 늘고 줄어도 따로 고칠 게 없어서
   * 가장 흔한 경우를 비워 두는 쪽으로 잡았다.
   * `{ 하늘: 1 }` 이면 하늘 혼자, `{ 하늘: 7, 여울: 3 }` 이면 7 대 3 이다.
   * 값은 비율이 아니라 비중이라 합이 얼마든 상관없다.
   */
  shares?: Record<Participant, number>;
  /**
   * 몫을 어떤 방식으로 정했는지.
   *
   * 계산에는 안 쓰고 화면에만 쓴다. 고칠 때 고른 방식 그대로 다시 열리게 하고,
   * 목록에 "여울·가람" 이라고 적을지 "여울 30,000" 이라고 적을지도 이걸로 가른다.
   * 없으면 shares 모양에서 짐작한다.
   */
  splitMode?: SplitMode;
  memo: string;
  /** 영수증 사진 자리. 없으면 안 찍었다는 뜻이다. */
  receiptUri?: string;
  /** 서버에 올라간 영수증 사진 id. 올린 뒤에 생긴다. */
  receiptPhotoId?: string;
  /**
   * 정산과 합계에서 뺀 지출. 목록에는 흐리게 남는다.
   *
   * 회사에 청구할 영수증이나 한 사람이 선물로 낸 것처럼, 적어는 두되 나누지는
   * 않을 돈이 있다. 삭제하면 얼마를 썼는지 흔적이 사라진다.
   */
  excluded?: boolean;
  /** 교통편에서 만든 지출이면 그 교통편의 id. 같은 교통편의 지출을 두 번 만들지 않는 근거다. */
  transportId?: string;
};

/**
 * 여행에 쓸 수 있는 통화.
 *
 * `fraction` 은 소수 자릿수다. 원과 엔은 0, 달러와 유로는 2 다. 이 값이
 * 있어야 24 달러와 24.50 달러를 구별해 적을 수 있다.
 * `rate` 는 1 단위가 몇 원인지의 기본값이다. 환율은 매일 바뀌므로 여행마다
 * 고쳐 쓰라고 두는 출발점일 뿐이고, 실제 값은 사용자가 적는다.
 */
type Currency = {
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

/**
 * 이 지출을 사람별 몫으로 쪼갠다.
 *
 * 비중이 없으면 참가자 전원이 똑같이 나눈다. 비중이 있어도 0 이하만 적혀 있으면
 * 나눌 수가 없으니 전원 균등으로 돌아간다. 참가자가 아무도 없으면 빈 값이다.
 */
export function splitAmounts(item: Expense, participants: Participant[]): Record<Participant, number> {
  const named = Object.entries(item.shares ?? {}).filter(([, weight]) => weight > 0);
  const weightTotal = named.reduce((sum, [, weight]) => sum + weight, 0);
  const result: Record<Participant, number> = {};
  if (weightTotal > 0) {
    for (const [person, weight] of named) result[person] = (item.amount * weight) / weightTotal;
    return result;
  }
  if (!participants.length) return result;
  for (const person of participants) result[person] = item.amount / participants.length;
  return result;
}

/**
 * 저장된 지출이 어느 방식으로 적힌 것인지.
 *
 * 낸 사람 혼자 몫이면 어떻게 적었든 「본인」이다. 서버가 「본인」을 모르니 「일부」로
 * 돌아오는데, 그걸 그대로 열면 「일부만」에 낸 사람 하나만 켜진 채로 보여 헷갈린다.
 * 옛 데이터는 방식이 안 적혀 있어서 비중 모양에서 짐작한다. 비중이 전부 같으면 고른
 * 사람끼리 균등이고, 다르면 금액을 적은 것이다.
 */
export function splitModeOf(item: Expense): SplitMode {
  const shares = item.shares ?? {};
  const picked = Object.keys(shares).filter((person) => shares[person] > 0);
  if (!picked.length) return "균등";
  if (picked.length === 1 && picked[0] === item.payer) return "본인";
  if (item.splitMode === "일부" || item.splitMode === "금액") return item.splitMode;
  return picked.every((person) => shares[person] === shares[picked[0]]) ? "일부" : "금액";
}

/** 정산과 합계에 드는 지출만. 「정산에서 빼기」 한 줄은 목록에만 남는다. */
function counted<T extends { excluded?: boolean }>(expenses: readonly T[]): T[] {
  return expenses.filter((item) => !item.excluded);
}

/** 총 지출. 정산에서 뺀 것은 세지 않는다. */
export function spentTotal(expenses: readonly { amount: number; excluded?: boolean }[]): number {
  return counted(expenses).reduce((sum, item) => sum + item.amount, 0);
}

/** 교통편 가운데 지출로 옮기는 데 필요한 것. `Transportation` 이 이 모양을 만족한다. */
type TransportLeg = {
  id: string;
  date: string;
  departure: string;
  arrival: string;
  method: string;
  owner: string;
};

/** 이 교통편에서 만든 지출. 없으면 아직 비용에 안 넣은 것이다. */
export function transportExpenseOf(expenses: readonly Expense[], transportId: string): Expense | undefined {
  return expenses.find((item) => item.transportId === transportId);
}

/**
 * 교통편 한 편을 지출로 옮긴다.
 *
 * 낸 사람은 타는 사람이고 몫도 그 사람 혼자다(본인 부담). 표는 대개 각자 끊으니
 * 남에게 청구하지 않는 것이 기본이고, 함께 나눌 거면 비용 탭에서 몫을 고치면 된다.
 * 타는 사람이 참가자가 아니면(미정, 나간 멤버) 첫 참가자가 낸 것으로 둔다.
 */
export function expenseFromTransport(leg: TransportLeg, amount: number, participants: Participant[], id: string): Expense {
  const payer = participants.includes(leg.owner) ? leg.owner : participants[0] ?? leg.owner;
  return {
    id,
    day: leg.date,
    title: `${leg.departure}→${leg.arrival} ${leg.method}`,
    amount,
    category: "교통",
    payer,
    shares: { [payer]: 1 },
    splitMode: "본인",
    memo: "",
    transportId: leg.id,
  };
}

/** 몫을 지는 사람들. 비중이 없으면 참가자 전원이다. */
export function shareMembers(item: Expense, participants: Participant[]): Participant[] {
  const named = Object.entries(item.shares ?? {}).filter(([, weight]) => weight > 0);
  return named.length ? named.map(([person]) => person) : participants;
}

/**
 * 누구 몫인지 읽을 수 있게 적는다.
 *
 * 참가자 전원이 똑같이 지면 `함께`, 낸 사람 혼자면 `본인 부담`, 다른 한 사람이면
 * 이름만, 나눠 졌으면 비중까지 적는다.
 */
export function shareLabel(item: Expense, participants: Participant[]): string {
  const named = Object.entries(item.shares ?? {}).filter(([, weight]) => weight > 0);
  if (!named.length) return "함께";
  if (named.length === 1 && named[0][0] === item.payer) return "본인 부담";
  if (named.length === 1) return named[0][0];
  const even = named.every(([, weight]) => weight === named[0][1]);
  if (even && named.length === participants.length) return "함께";
  if (even) return `${named.map(([person]) => person).join(" · ")} 균등`;
  return named.map(([person, weight]) => `${person} ${weight}`).join(" · ");
}

/**
 * 이름 뒤에 붙는 조사를 고른다.
 *
 * "여울이 하늘에게" 는 읽히는데 "지수이 하늘에게" 는 곧장 어색하다. 모음으로
 * 끝나는 이름은 아주 흔해서, 조사를 글자에 박아 두면 앱이 대충 만든 것처럼
 * 읽힌다. 마지막 글자의 받침 유무로 고른다.
 *
 * 한글 음절이 아닌 글자(영문 이름, 숫자, 이모지)는 받침을 알 방법이 없다.
 * 그때는 모음 뒤 형태를 쓴다. 을/를 처럼 ㄹ 받침 예외가 없는 짝만 쓴다.
 */
export function josa(word: string, afterJong: string, afterVowel: string): string {
  const last = word.trim().slice(-1);
  if (!last) return afterVowel;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return afterVowel;
  return (code - 0xac00) % 28 ? afterJong : afterVowel;
}

export type Transfer = { from: Participant; to: Participant; amount: number };

/**
 * 주고받았다고 적어 둔 기록.
 *
 * 앱은 계좌이체를 알 수 없다. 그래서 "정산하기" 는 돈을 보내는 일이 아니라
 * 보냈다고 적는 일이다. 이 기록이 없으면 목록이 줄지 않아서, 지출을 적을수록
 * 끝나지 않는 할 일만 쌓인다.
 */
export type Payment = {
  id: string;
  from: Participant;
  to: Participant;
  /** 일부만 보냈으면 보낸 만큼. 한 번에 다 갚지 않는 일이 흔하다. */
  amount: number;
  at: number;
};

type Settlement = {
  total: number;
  /** 각자 실제로 낸 돈. */
  paid: Record<Participant, number>;
  /** 각자 내야 했던 몫. 반올림 전이라 소수가 섞일 수 있다. */
  owed: Record<Participant, number>;
  /**
   * 주고받은 것까지 반영한 잔액. 양수면 받을 돈, 음수면 보낼 돈이다.
   * 화면이 "나" 기준으로 말하려면 이 값이 필요하다.
   */
  balances: Record<Participant, number>;
  /**
   * 묶기 전, 사람 대 사람으로 직접 생긴 빚.
   *
   * 묶은 줄이 왜 나왔는지 펼쳐 보일 때 쓴다. 2~6명이면 사슬이 짧아서
   * "네 몫 22,500원인데 하늘이 대신 냈다" 까지 보여 줄 수 있다.
   */
  direct: Transfer[];
  /** 실제로 보여 줄 주고받을 목록. 비면 정산 끝이다. */
  transfers: Transfer[];
};

type SettleOptions = {
  /** 이미 주고받았다고 적어 둔 것. 잔액에서 뺀다. */
  payments?: Payment[];
  /**
   * 오갈 횟수를 줄일지.
   *
   * 켜면 더 받을 사람과 더 낼 사람을 큰 쪽부터 짝지어 없앤다. 송금 횟수는
   * 줄지만 내가 직접 빌린 적 없는 사람에게 보내라고 할 수 있다. 끄면 누가
   * 누구에게 진 빚인지 그대로 나온다.
   */
  simplify?: boolean;
};

/** 1원 미만은 주고받을 것이 없다고 본다. */
const SETTLED = 0.5;

/**
 * 낸 돈과 몫을 견줘 누가 누구에게 얼마를 줘야 하는지 낸다.
 *
 * 나눈 금액에 소수가 생기므로 계산은 소수로 끝까지 하고 주고받을 금액만
 * 반올림한다. 중간마다 반올림하면 건수가 쌓일수록 어긋난다.
 */
export function settle(
  expenses: Expense[],
  participants: Participant[],
  { payments = [], simplify = true }: SettleOptions = {},
): Settlement {
  const paid: Record<Participant, number> = {};
  const owed: Record<Participant, number> = {};
  for (const person of participants) {
    paid[person] = 0;
    owed[person] = 0;
  }
  // 사람 대 사람으로 직접 생긴 빚. owes[갚을 사람][받을 사람]
  const owes: Record<Participant, Record<Participant, number>> = {};
  const add = (from: Participant, to: Participant, amount: number) => {
    if (from === to) return;
    owes[from] = owes[from] ?? {};
    owes[from][to] = (owes[from][to] ?? 0) + amount;
  };
  let total = 0;
  // 정산에서 뺀 지출은 합계에도 빚에도 안 든다.
  for (const item of counted(expenses)) {
    total += item.amount;
    // 참가자에서 빠진 사람이 낸 지출도 잃어버리지 않는다.
    paid[item.payer] = (paid[item.payer] ?? 0) + item.amount;
    for (const [person, share] of Object.entries(splitAmounts(item, participants))) {
      owed[person] = (owed[person] ?? 0) + share;
      // 낸 사람이 대신 내 준 만큼이 곧 빚이다.
      add(person, item.payer, share);
    }
  }
  // 보냈다고 적어 둔 것은 빚을 줄인다.
  for (const payment of payments) add(payment.from, payment.to, -payment.amount);

  const everyone = [...new Set([
    ...participants,
    ...Object.keys(paid),
    ...Object.keys(owed),
    ...payments.flatMap((payment) => [payment.from, payment.to]),
  ])];

  // 서로 주고받을 게 있으면 상계한다. A 가 B 에게 만, B 가 A 에게 사천이면
  // A 가 B 에게 육천이다. 양쪽으로 보내라고 하면 아무도 안 그런다.
  const direct: Transfer[] = [];
  for (let i = 0; i < everyone.length; i += 1) {
    for (let j = i + 1; j < everyone.length; j += 1) {
      const a = everyone[i];
      const b = everyone[j];
      const net = (owes[a]?.[b] ?? 0) - (owes[b]?.[a] ?? 0);
      if (Math.abs(net) < SETTLED) continue;
      direct.push(net > 0
        ? { from: a, to: b, amount: Math.round(net) }
        : { from: b, to: a, amount: Math.round(-net) });
    }
  }

  const sent: Record<Participant, number> = {};
  const got: Record<Participant, number> = {};
  for (const payment of payments) {
    sent[payment.from] = (sent[payment.from] ?? 0) + payment.amount;
    got[payment.to] = (got[payment.to] ?? 0) + payment.amount;
  }
  const balances: Record<Participant, number> = {};
  for (const person of everyone) {
    balances[person] = (paid[person] ?? 0) - (owed[person] ?? 0)
      + (sent[person] ?? 0) - (got[person] ?? 0);
  }

  if (!simplify) {
    return { total, paid, owed, balances, direct, transfers: sortTransfers(direct) };
  }

  const remaining = everyone
    .map((person) => ({ person, value: balances[person] }))
    .filter((entry) => Math.abs(entry.value) >= SETTLED);
  const creditors = remaining.filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value);
  const debtors = remaining.filter((entry) => entry.value < 0).sort((a, b) => a.value - b.value);
  const transfers: Transfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.value, -debtor.value);
    const rounded = Math.round(amount);
    if (rounded > 0) transfers.push({ from: debtor.person, to: creditor.person, amount: rounded });
    creditor.value -= amount;
    debtor.value += amount;
    if (creditor.value < SETTLED) creditorIndex += 1;
    if (-debtor.value < SETTLED) debtorIndex += 1;
  }
  return { total, paid, owed, balances, direct, transfers: sortTransfers(transfers) };
}

/** 큰 금액부터. 같으면 이름 순으로 고정해 화면이 흔들리지 않게 한다. */
function sortTransfers(transfers: Transfer[]): Transfer[] {
  return [...transfers].sort((a, b) =>
    b.amount - a.amount || a.from.localeCompare(b.from, "ko-KR") || a.to.localeCompare(b.to, "ko-KR"));
}

/**
 * 옛 저장 데이터를 지금 모양으로 옮긴다.
 *
 * 예전에는 사람이 하늘과 여울 둘로 박혀 있어서 `share` 가 `함께`·`하늘`·`여울`·
 * `직접` 이었고, 직접일 때의 비율은 `splitSky` 에 퍼센트로 들어 있었다. 그 값을
 * 사람별 비중으로 옮긴다. 옮길 게 없으면 그대로 돌려준다.
 */
export function normalizeExpense(value: Expense & { share?: string; splitSky?: number }): Expense {
  const { share, splitSky, ...rest } = value;
  if (!share) return rest;
  if (share === "하늘" || share === "여울") return { ...rest, shares: { [share]: 1 } };
  if (share === "직접") {
    const sky = Math.min(100, Math.max(0, splitSky ?? 50));
    return { ...rest, shares: { 하늘: sky, 여울: 100 - sky } };
  }
  return rest;
}

/** 분류별 합계. 쓴 게 있는 분류만, 많이 쓴 차례로 낸다. 정산에서 뺀 지출은 세지 않는다. */
export function totalsByCategory(expenses: Expense[]): { category: ExpenseCategory; amount: number }[] {
  const sums = new Map<ExpenseCategory, number>();
  for (const item of counted(expenses)) {
    sums.set(item.category, (sums.get(item.category) ?? 0) + item.amount);
  }
  return EXPENSE_CATEGORIES.filter((category) => sums.has(category))
    .map((category) => ({ category, amount: sums.get(category) as number }))
    .sort((a, b) => b.amount - a.amount);
}

/** 날짜별 합계. 여행 날짜 차례를 그대로 따른다. 정산에서 뺀 지출만 있는 날은 빠진다. */
export function totalsByDay(expenses: Expense[], days: string[]): { day: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const item of counted(expenses)) {
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
  participants: Participant[],
  code: string = DEFAULT_CURRENCY.code,
  rate = 1,
): string {
  const settlement = settle(expenses, participants);
  const currency = currencyOf(code);
  // 원이 아니면 원 환산을 한 칸 더 낸다. 원이면 같은 숫자가 두 번 나올 뿐이라 뺀다.
  const converted = currency.code !== "KRW";
  const head = ["날짜", "항목", "분류", `금액(${currency.code})`, "낸 사람", "누구 몫", "메모"];
  if (converted) head.splice(4, 0, "원 환산");
  const rows: string[] = [head.join(",")];
  for (const item of expenses) {
    // 정산에서 뺀 줄도 표에는 남긴다. 얼마를 썼는지는 남아야 하고, 아래 합계에만 안 든다.
    const line: (string | number)[] = [item.day, item.title, item.category, item.amount, item.payer, item.excluded ? "정산 제외" : shareLabel(item, participants), item.memo];
    if (converted) line.splice(4, 0, toWon(item.amount, rate));
    rows.push(line.map(cell).join(","));
  }
  rows.push("");
  rows.push(["구분", `값(${currency.code})`, ...(converted ? ["원 환산"] : [])].join(","));
  const summary = (label: string, amount: number) => {
    rows.push([cell(label), amount, ...(converted ? [toWon(amount, rate)] : [])].join(","));
  };
  summary(`${tripName} 총 지출`, settlement.total);
  // 참가자에서 빠진 사람이 낸 지출이 있으면 그 사람도 표에 남긴다.
  const people = [...new Set([...participants, ...Object.keys(settlement.paid)])];
  for (const person of people) {
    summary(`${person}${josa(person, "이", "가")} 낸 돈`, settlement.paid[person] ?? 0);
    summary(`${person} 몫`, Math.round(settlement.owed[person] ?? 0));
  }
  if (converted) rows.push([cell("환율"), cell(`1 ${currency.code} = ${amountText(rate, 2)}원`)].join(","));
  if (!settlement.transfers.length) {
    rows.push(["정산", cell("정산할 게 없어요")].join(","));
  } else {
    for (const transfer of settlement.transfers) {
      rows.push([
        "정산",
        cell(`${transfer.from}${josa(transfer.from, "이", "가")} ${transfer.to}에게 ${money(transfer.amount, currency.code)}`),
      ].join(","));
    }
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
