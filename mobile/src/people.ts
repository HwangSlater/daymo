/**
 * 여행 기록 안의 사람을 membership 에 묶어 둔다.
 *
 * 앱 화면은 사람을 이름으로 들고 있다(참가자, 준비물·재료 담당, 교통편의 탈 사람,
 * 지출의 낸 사람과 몫, 주고받은 기록). 서버로 보낼 때 공간 사람 표에서 이름으로
 * id 를 찾는다. 그러려면 두 가지가 지켜져야 한다.
 *
 * 1. 표 안의 이름이 겹치지 않는다. 같은 이름이면 뒤 사람에게 번호를 붙인다.
 * 2. 멤버가 이름을 바꾸면 기록 안의 옛 이름도 따라 바뀐다. 여행마다 마지막으로
 *    쓴 `id → 이름` 을 저장해 두고, 열 때 표와 다르면 기록을 고친다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import type { RosterEntry } from "./tripSync.ts";

/** 사람이 아닌 담당 이름. 멤버 이름이 이것과 같으면 구분하지 못해 번호를 붙인다. */
export const NOT_PEOPLE = ["공용", "미정", "구매", "나간 멤버"] as const;

/**
 * 표에 넣을 이름을 겹치지 않게 고른다. 앞사람이 원래 이름을 갖는다.
 *
 * 나 → 지금 멤버 → 나간 멤버 순으로 부르면, 지금 멤버가 나간 멤버에게 이름을 뺏기지 않는다.
 */
export function uniqueNames(names: readonly string[]): string[] {
  const taken = new Set<string>(NOT_PEOPLE);
  return names.map((raw) => {
    const base = raw.trim() || "이름 없는 멤버";
    let name = base;
    for (let n = 2; taken.has(name); n += 1) name = `${base} ${n}`;
    taken.add(name);
    return name;
  });
}

/** 여행에 저장해 두는 `membership id → 이름`. */
export type PeopleNames = Record<string, string>;

/** 기록이 쓰는 사람 칸만 본다. 나머지 칸은 그대로 지나간다. */
export type PeoplePlanning = {
  participants?: string[];
  packingItems?: { owner: string }[];
  recipes?: { ingredients: { owner: string }[] }[];
  transportations?: { owner: string }[];
  expenses?: { payer: string; shares?: Record<string, number> }[];
  payments?: { from: string; to: string }[];
  personNames?: PeopleNames;
};

/**
 * 기록의 이름을 지금 사람 표에 맞춘다.
 *
 * 저장해 둔 이름과 표의 이름이 다른 사람만 바꾼다. 여러 사람을 한꺼번에 바꾸므로
 * 두 사람이 이름을 맞바꿔도 섞이지 않는다. 표에 없는 사람(아직 받지 못한 멤버)은
 * 건드리지 않고 저장해 둔 이름을 그대로 남긴다.
 *
 * 참가자는 서버에서 받을 때 이미 지금 이름으로 온다. 그래서 참가자에서는 옛 이름이
 * 지금 누군가의 이름이면 바꾸지 않는다. 바꾸면 이미 맞는 이름을 한 번 더 바꾼다.
 */
export function rebindPeople<P extends PeoplePlanning>(planning: P | undefined, roster: readonly RosterEntry[]): P | undefined {
  if (!planning) return planning;
  const saved = planning.personNames ?? {};
  const renames = new Map<string, string>();
  for (const entry of roster) {
    const before = saved[entry.id];
    if (before !== undefined && before !== entry.name) renames.set(before, entry.name);
  }
  const personNames: PeopleNames = { ...saved };
  for (const entry of roster) personNames[entry.id] = entry.name;
  if (!renames.size) return { ...planning, personNames };

  const rename = (name: string) => renames.get(name) ?? name;
  const current = new Set(roster.map((entry) => entry.name));
  const next: P = { ...planning, personNames };
  if (planning.participants) {
    next.participants = planning.participants.map((name) => (current.has(name) ? name : rename(name)));
  }
  if (planning.packingItems) next.packingItems = planning.packingItems.map((item) => ({ ...item, owner: rename(item.owner) }));
  if (planning.recipes) {
    next.recipes = planning.recipes.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((item) => ({ ...item, owner: rename(item.owner) })),
    }));
  }
  if (planning.transportations) {
    next.transportations = planning.transportations.map((item) => ({ ...item, owner: rename(item.owner) }));
  }
  if (planning.expenses) {
    next.expenses = planning.expenses.map((item) => ({
      ...item,
      payer: rename(item.payer),
      ...(item.shares
        ? { shares: Object.fromEntries(Object.entries(item.shares).map(([name, weight]) => [rename(name), weight])) }
        : {}),
    }));
  }
  if (planning.payments) {
    next.payments = planning.payments.map((item) => ({ ...item, from: rename(item.from), to: rename(item.to) }));
  }
  return next;
}
