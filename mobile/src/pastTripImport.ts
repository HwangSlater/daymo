/**
 * 지난 여행에서 준비물과 요리를 가져올 때의 계산.
 *
 * 네 가지를 여기서 정한다.
 * 1. 어느 여행이 「지난 여행」인지. 같은 공간에서 지금 여행을 뺀, 이미 끝난 여행
 *    (마지막 날이 오늘보다 앞선 것)을 최근 것부터 놓는다.
 * 2. 여러 여행의 목록을 한 줄로 편다. 여행을 먼저 고르는 단계 없이 요리·준비물만
 *    바로 보이게 하려는 것이다. 이번 여행에 이미 있는 이름은 표시만 하고 못 고르게 둔다.
 * 3. 담당을 어떻게 옮길지. 이번 여행 참가자에 있는 이름만 남기고 없으면 비운다.
 *    서버가 이 공간 사람이 아닌 담당을 거부한다(`cookingSync.ts`).
 *    `공용`·`구매` 는 사람이 아니라 그대로 둔다. 「현지 구매/집에서」 구분이 여기 달려 있다.
 * 4. 이미 있는 이름은 빼고, 무엇을 뺐는지 돌려준다. 화면이 그대로 알린다.
 *
 * 완료 표시는 목록 밖(`packingDone`, `cookingReadyIngredientIds`)에 있어 여기서
 * 만드는 줄에는 아예 없다. 가져온 것은 늘 체크가 꺼진 채로 들어간다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import {
  COOKING_BUY,
  COOKING_UNASSIGNED,
  PACKING_SHARED,
  PACKING_UNASSIGNED,
  type PackingRow,
  type RecipeRow,
} from "./cookingSync.ts";
import { josa } from "./tripExpenses.ts";

/** 가져올 준비물 한 줄. 화면의 `PackingItem` 과 같은 모양이다. */
export type PackingDraft = {
  id: string;
  name: string;
  quantity: string;
  owner: string;
  tags: string[];
};

/** 가져올 요리 한 그릇. 화면의 `Recipe` 와 같은 모양이다. */
export type RecipeDraft = {
  id: string;
  name: string;
  note: string;
  url: string;
  ingredients: { id: string; name: string; quantity: string; group: string; owner: string }[];
};

/** 가져온 것과, 이미 있어 건너뛴 이름. */
export type ImportPlan<T> = { taken: T[]; skipped: string[] };

/** 지난 여행 하나의 목록. 화면은 여행별로 묶어 그린다. */
export type PastTripGroup<T> = {
  tripId: string;
  title: string;
  /** 「2026년 3월 1일 — 3월 3일」. 같은 이름의 여행이 둘일 때 가른다. */
  period: string;
  rows: PastRow<T>[];
};

/** 지난 여행의 줄 하나. `key` 는 여행이 달라도 겹치지 않는다. */
export type PastRow<T> = {
  key: string;
  tripId: string;
  row: T;
  /** 이번 여행에 같은 이름이 이미 있다. 고를 수 없게 흐리게 그린다. */
  mine: boolean;
};

/** 기기 시각 기준 오늘(`YYYY-MM-DD`). 여행 날짜가 이 꼴이라 문자열로 바로 견준다. */
export function localDateKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * 고를 수 있는 여행. 같은 공간에서 지금 여행을 빼고, 마지막 날이 오늘보다 앞선
 * 것만 최근에 떠난 것부터 놓는다. 다가오는 여행이나 여행 중인 것은 「지난 여행」이 아니다.
 */
export function pastTripChoices<T extends { id: string; title: string; startDate: string; endDate: string }>(
  trips: readonly T[],
  currentTripId: string | undefined,
  today: string,
): T[] {
  return trips
    .filter((trip) => trip.id !== currentTripId && trip.endDate < today)
    .slice()
    .sort((a, b) => (a.startDate === b.startDate ? a.title.localeCompare(b.title) : a.startDate < b.startDate ? 1 : -1));
}

/** 「2026년 3월 1일 — 3월 3일」. 날짜가 어긋난 여행이면 그냥 비운다. */
export function tripPeriodLabel(start: string, end: string): string {
  const parse = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return y && m && d ? { y, m, d } : null;
  };
  const first = parse(start);
  const last = parse(end);
  if (!first || !last) return "";
  const day = (v: { m: number; d: number }) => `${v.m}월 ${v.d}일`;
  return `${first.y}년 ${day(first)} — ${day(last)}`;
}

/**
 * 여행마다 받은 목록을 화면에 그릴 묶음으로 만든다.
 *
 * 여행 차례는 `pastTripChoices` 가 정한 대로 두고, 이름이 빈 줄과 아무것도 없는
 * 여행은 뺀다. 이번 여행에 이미 있는 이름(대소문자·앞뒤 공백 무시)은 `mine` 으로
 * 표시만 한다. 같은 요리를 두 번 두면 목록에서 헷갈리니 고르지는 못하게 한다.
 */
export function pastTripGroups<T extends { id: string; name: string }>(
  lists: readonly { trip: { id: string; title: string; startDate: string; endDate: string }; rows: readonly T[] }[],
  existingNames: readonly string[],
): PastTripGroup<T>[] {
  const already = new Set(existingNames.map(key));
  const groups: PastTripGroup<T>[] = [];
  for (const { trip, rows } of lists) {
    const kept = rows
      .filter((row) => row.name.trim())
      .map((row) => ({ key: `${trip.id}:${row.id}`, tripId: trip.id, row, mine: already.has(key(row.name)) }));
    if (!kept.length) continue;
    groups.push({ tripId: trip.id, title: trip.title, period: tripPeriodLabel(trip.startDate, trip.endDate), rows: kept });
  }
  return groups;
}

/**
 * 담당 한 사람을 이번 여행으로 옮긴다.
 *
 * 참가자에 있으면 그대로, 사람이 아닌 표시면 그대로, 나머지는 비운다.
 */
export function keepOwner(
  owner: string,
  participants: readonly string[],
  notPeople: readonly string[],
  fallback: string,
): string {
  const name = owner.trim();
  if (!name || name === fallback) return fallback;
  if (notPeople.includes(name)) return name;
  return participants.includes(name) ? name : fallback;
}

/**
 * 고른 준비물을 이번 여행의 줄로 만든다.
 *
 * 이름이 같으면(대소문자·앞뒤 공백 무시) 가져오지 않는다. 담당이 달라도 같은 이름을
 * 둘로 두면 목록에서 헷갈린다. 요리 재료에서 왔다는 표시(`sourceIngredientId`)는
 * 지난 여행의 재료를 가리켜서 버린다.
 */
export function planPackingImport(
  rows: readonly PackingRow[],
  existingNames: readonly string[],
  participants: readonly string[],
  newId: () => string,
): ImportPlan<PackingDraft> {
  const seen = new Set(existingNames.map(key));
  const taken: PackingDraft[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    if (seen.has(key(name))) {
      skipped.push(name);
      continue;
    }
    seen.add(key(name));
    taken.push({
      id: newId(),
      name,
      quantity: row.quantity.trim(),
      owner: keepOwner(row.owner, participants, [PACKING_SHARED], PACKING_UNASSIGNED),
      tags: [...row.tags],
    });
  }
  return { taken, skipped };
}

/**
 * 고른 요리를 재료까지 함께 이번 여행의 줄로 만든다.
 *
 * 이미 있는 이름의 요리는 건너뛴다. 한 요리 안에서 이름이 겹치는 재료도 하나만 둔다.
 */
export function planRecipeImport(
  recipes: readonly RecipeRow[],
  existingNames: readonly string[],
  participants: readonly string[],
  newId: () => string,
): ImportPlan<RecipeDraft> {
  const seen = new Set(existingNames.map(key));
  const taken: RecipeDraft[] = [];
  const skipped: string[] = [];
  for (const recipe of recipes) {
    const name = recipe.name.trim();
    if (!name) continue;
    if (seen.has(key(name))) {
      skipped.push(name);
      continue;
    }
    seen.add(key(name));
    const names = new Set<string>();
    taken.push({
      id: newId(),
      name,
      note: recipe.note.trim(),
      url: recipe.url?.trim() ?? "",
      ingredients: recipe.ingredients
        .filter((item) => {
          const ingredientName = key(item.name);
          if (!ingredientName || names.has(ingredientName)) return false;
          names.add(ingredientName);
          return true;
        })
        .map((item) => ({
          id: newId(),
          name: item.name.trim(),
          quantity: item.quantity.trim(),
          group: item.group.trim() || "기본",
          owner: keepOwner(item.owner, participants, [COOKING_BUY], COOKING_UNASSIGNED),
        })),
    });
  }
  return { taken, skipped };
}

/** 가져온 뒤 보여 줄 말. 건너뛴 것이 있으면 왜 안 들어갔는지 함께 알린다. */
export function importMessage(label: string, plan: ImportPlan<unknown>): string {
  if (!plan.taken.length) {
    return plan.skipped.length ? `이미 있는 ${label}뿐이에요` : `가져올 ${label}${josa(label, "이", "가")} 없어요`;
  }
  const took = `${label} ${plan.taken.length}개를 가져왔어요`;
  return plan.skipped.length ? `${took}. ${plan.skipped.length}개는 이미 있어 건너뛰었어요` : took;
}
