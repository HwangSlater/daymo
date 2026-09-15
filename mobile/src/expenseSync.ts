/**
 * 지출과 주고받은 기록을 서버와 오가는 모양. 맞추는 계산은 `listSync.ts` 가 한다.
 *
 * 앱 안에서 낸 사람·몫·보낸 사람·받은 사람은 이름이다. 서버는 membership id 로
 * 받는다. 공간 사람 표에 없는 이름(나간 멤버, 옛 기록의 이름)이 섞인 지출은 서버로
 * 올리지 않는다. 이름 하나를 빼고 올리면 몫이 달라져 정산이 틀어진다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { dayLabelOf, isServerId, type Codec } from "./listSync.ts";
import { blank } from "./placeSync.ts";
import type { Expense, ExpenseCategory, Payment, SplitMode } from "./tripExpenses.ts";
import type { RosterEntry } from "./tripSync.ts";

type ServerCategory = "meal" | "transport" | "lodging" | "admission" | "shopping" | "other";
type ServerSplit = "even" | "subset" | "amount";

export type ServerExpense = {
  id: string;
  date: string | null;
  title: string;
  amount: number;
  category: ServerCategory;
  payerMembershipId: string;
  splitMode: ServerSplit | null;
  shares: { membershipId: string; weight: number }[];
  memo: string | null;
  version: number;
};

export type ExpenseBody = Omit<ServerExpense, "id" | "version">;

const CATEGORY_TO_SERVER: Record<ExpenseCategory, ServerCategory> = {
  식비: "meal", 교통: "transport", 숙박: "lodging", 입장료: "admission", 쇼핑: "shopping", 기타: "other",
};
const CATEGORY_TO_APP: Record<ServerCategory, ExpenseCategory> = {
  meal: "식비", transport: "교통", lodging: "숙박", admission: "입장료", shopping: "쇼핑", other: "기타",
};
const SPLIT_TO_SERVER: Record<SplitMode, ServerSplit> = { 균등: "even", 일부: "subset", 금액: "amount" };
const SPLIT_TO_APP: Record<ServerSplit, SplitMode> = { even: "균등", subset: "일부", amount: "금액" };

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** 서버가 알 수 없는 사람의 자리. 목록에서 사라지지 않게 이름으로 남긴다. */
export const UNKNOWN_PERSON = "나간 멤버";

export function expenseCodec(
  tripDates: readonly string[],
  roster: readonly RosterEntry[],
): Codec<Expense, ExpenseBody, ServerExpense> {
  const keyByDayLabel = new Map(tripDates.map((key) => [dayLabelOf(key), key]));
  const idOfName = (name: string) => roster.find((entry) => entry.name === name)?.id;
  const nameOfId = (id: string) => roster.find((entry) => entry.id === id)?.name ?? UNKNOWN_PERSON;
  return {
    syncable: (item) =>
      isServerId(item.id)
      && item.amount > 0
      && Boolean(idOfName(item.payer))
      && Object.keys(item.shares ?? {}).every((name) => Boolean(idOfName(name))),
    idOf: (item) => item.id,
    toBody: (item) => ({
      date: keyByDayLabel.get(item.day) ?? null,
      title: item.title.trim().slice(0, 60) || "이름 없는 지출",
      amount: round(item.amount, 2),
      category: CATEGORY_TO_SERVER[item.category] ?? "other",
      payerMembershipId: idOfName(item.payer) ?? "",
      splitMode: item.splitMode ? SPLIT_TO_SERVER[item.splitMode] ?? null : null,
      // 순서가 달라도 같은 몫이다. 비교가 흔들리지 않게 id 순으로 둔다.
      shares: Object.entries(item.shares ?? {})
        .map(([name, weight]) => ({ membershipId: idOfName(name) ?? "", weight: round(weight, 4) }))
        .sort((a, b) => a.membershipId.localeCompare(b.membershipId)),
      memo: blank(item.memo, 2000),
    }),
    fromServer: (row) => {
      const shares: Record<string, number> = {};
      for (const share of row.shares) shares[nameOfId(share.membershipId)] = share.weight;
      return {
        id: row.id,
        day: row.date && tripDates.includes(row.date) ? dayLabelOf(row.date) : "",
        title: row.title,
        amount: row.amount,
        category: CATEGORY_TO_APP[row.category] ?? "기타",
        payer: nameOfId(row.payerMembershipId),
        ...(row.shares.length ? { shares } : {}),
        ...(row.splitMode ? { splitMode: SPLIT_TO_APP[row.splitMode] } : {}),
        memo: row.memo ?? "",
      };
    },
    // 영수증 사진은 아직 기기에만 있다. 서버 줄로 바꿔도 사진 자리는 지킨다.
    keepLocal: (fromServer, local) => (local.receiptUri ? { ...fromServer, receiptUri: local.receiptUri } : fromServer),
  };
}

// ---------------------------------------------------------------------------

export type ServerPayment = {
  id: string;
  fromMembershipId: string;
  toMembershipId: string;
  amount: number;
  paidAt: string | null;
  version: number;
};

export type PaymentBody = Omit<ServerPayment, "id" | "version">;

export function paymentCodec(roster: readonly RosterEntry[]): Codec<Payment, PaymentBody, ServerPayment> {
  const idOfName = (name: string) => roster.find((entry) => entry.name === name)?.id;
  const nameOfId = (id: string) => roster.find((entry) => entry.id === id)?.name ?? UNKNOWN_PERSON;
  return {
    syncable: (item) =>
      isServerId(item.id) && item.amount > 0 && item.from !== item.to && Boolean(idOfName(item.from) && idOfName(item.to)),
    idOf: (item) => item.id,
    toBody: (item) => ({
      fromMembershipId: idOfName(item.from) ?? "",
      toMembershipId: idOfName(item.to) ?? "",
      amount: round(item.amount, 2),
      paidAt: new Date(item.at).toISOString(),
    }),
    fromServer: (row) => ({
      id: row.id,
      from: nameOfId(row.fromMembershipId),
      to: nameOfId(row.toMembershipId),
      amount: row.amount,
      at: row.paidAt ? Date.parse(row.paidAt) : 0,
    }),
  };
}
