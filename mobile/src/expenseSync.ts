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
  receiptPhotoId?: string | null;
  /** 정산에서 뺀 지출. 옛 서버 응답에는 없을 수 있어 없으면 거짓으로 본다. */
  excluded?: boolean;
  /** 교통편에서 만든 지출이면 그 교통편 id. */
  transportId?: string | null;
  version: number;
};

export type ExpenseBody = Omit<ServerExpense, "id" | "version">;

const CATEGORY_TO_SERVER: Record<ExpenseCategory, ServerCategory> = {
  식비: "meal", 교통: "transport", 숙박: "lodging", 입장료: "admission", 쇼핑: "shopping", 기타: "other",
};
const CATEGORY_TO_APP: Record<ServerCategory, ExpenseCategory> = {
  meal: "식비", transport: "교통", lodging: "숙박", admission: "입장료", shopping: "쇼핑", other: "기타",
};
// 「본인」은 서버에 없다. 낸 사람 혼자 몫인 「일부」로 보내고 다시 열 때 모양으로 되살린다(`splitModeOf`).
const SPLIT_TO_SERVER: Record<SplitMode, ServerSplit> = { 본인: "subset", 균등: "even", 일부: "subset", 금액: "amount" };
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
  /**
   * 적어 둔 날짜 이름표를 이번 기간에서 못 찾는지.
   *
   * 여행 기간을 옮기면 「3일(금)」 같은 옛 이름표가 새 기간에 없어진다. 그대로 보내면
   * `date: null` 이 서버에 올라가 날짜가 지워졌다(2026-09-23). 화면이 이름표를 옮기기
   * 전에 맞추기가 돌 수도 있어서, 못 찾는 이름표는 아예 올리지 않는다. 날짜를 아직
   * 고르지 않은 지출(빈 이름표)은 여기 해당하지 않는다.
   */
  const 날짜를_잃음 = (day: string) => Boolean(day) && !keyByDayLabel.has(day);
  return {
    syncable: (item) =>
      isServerId(item.id)
      && item.amount > 0
      && !날짜를_잃음(item.day)
      && Boolean(idOfName(item.payer))
      && Object.keys(item.shares ?? {}).every((name) => Boolean(idOfName(name))),
    blockReason: (item) => {
      if (!isServerId(item.id)) return undefined;
      if (item.amount <= 0) return "금액이 0원이에요";
      if (날짜를_잃음(item.day)) return "여행 기간 밖의 날짜예요";
      const names = [item.payer, ...Object.keys(item.shares ?? {})];
      return names.some((name) => !idOfName(name)) ? "이 여행에 없는 사람이 들어 있어요" : undefined;
    },
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
      receiptPhotoId: item.receiptPhotoId ?? null,
      excluded: Boolean(item.excluded),
      transportId: item.transportId ?? null,
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
        ...(row.receiptPhotoId ? { receiptPhotoId: row.receiptPhotoId } : {}),
        ...(row.excluded ? { excluded: true } : {}),
        ...(row.transportId ? { transportId: row.transportId } : {}),
      };
    },
    // 영수증 파일은 기기에 있다. 아직 올리지 않았거나 같은 사진이면 파일 자리를 지킨다.
    // 다른 기기에서 영수증을 바꾸거나 뗐으면 기기의 파일을 따르지 않는다.
    keepLocal: (fromServer, local) =>
      local.receiptUri && (!local.receiptPhotoId || local.receiptPhotoId === fromServer.receiptPhotoId)
        ? { ...fromServer, receiptUri: local.receiptUri }
        : fromServer,
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
    blockReason: (item) => {
      if (!isServerId(item.id)) return undefined;
      if (item.amount <= 0) return "금액이 0원이에요";
      if (item.from === item.to) return "보낸 사람과 받은 사람이 같아요";
      return idOfName(item.from) && idOfName(item.to) ? undefined : "이 여행에 없는 사람이 들어 있어요";
    },
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
