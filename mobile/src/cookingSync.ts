/**
 * 준비물과 요리를 서버와 오가는 모양. 맞추는 계산은 `listSync.ts` 가 한다.
 *
 * 앱은 체크 상태를 목록 밖에 따로 둔다(`packingDone`, `cookingReadyIngredientIds`).
 * 서버에서는 줄 하나의 칸이라, 여기서는 체크를 붙인 줄(`done`, `ready`)로 다룬다.
 *
 * 요리 재료에서 가져온 준비물은 그 재료 id(`sourceIngredientId`)를 함께 둔다. 완료 상태는
 * 서로 따로 가고, 한쪽을 체크할 때 다른 쪽도 바꿀지는 화면이 사용자에게 묻는다.
 *
 * 담당은 앱에서 이름이고 서버에서는 membership id 다. 공간 사람 표에 없는 이름이
 * 담당인 줄은 올리지 않는다. 담당을 빼고 올리면 다른 기기에서 미정으로 보인다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { UNKNOWN_PERSON } from "./expenseSync.ts";
import { isServerId, type Codec } from "./listSync.ts";
import { blank, safeUrl } from "./placeSync.ts";
import type { RosterEntry } from "./tripSync.ts";

/** 앱의 준비물(WarmTripDetail 의 PackingItem)에 체크를 붙인 모양. */
export type PackingRow = {
  id: string;
  name: string;
  quantity: string;
  /** 사람 이름, 또는 `공용`·`미정`. */
  owner: string;
  tags: string[];
  /** 요리 재료에서 가져왔으면 그 재료 id. */
  sourceIngredientId?: string;
  done: boolean;
};

export const PACKING_SHARED = "공용";
export const PACKING_UNASSIGNED = "미정";

export type ServerChecklistItem = {
  id: string;
  name: string;
  quantity: string | null;
  ownerMembershipId: string | null;
  isShared: boolean;
  completed: boolean;
  tags: string[];
  sourceIngredientId: string | null;
  version: number;
};

export type ChecklistItemBody = Omit<ServerChecklistItem, "id" | "version">;

/** 서버와 같은 규칙으로 태그를 고른다. 비교가 흔들리지 않게 보내기 전에 맞춘다. */
export function tidyTags(raw: readonly string[]): string[] {
  const tags: string[] = [];
  for (const value of raw) {
    const tag = value.split(/\s+/).filter(Boolean).join(" ").slice(0, 20);
    if (tag && !tags.includes(tag) && tags.length < 20) tags.push(tag);
  }
  return tags;
}

const nameFinder = (roster: readonly RosterEntry[]) => ({
  idOfName: (name: string) => roster.find((entry) => entry.name === name)?.id,
  nameOfId: (id: string) => roster.find((entry) => entry.id === id)?.name ?? UNKNOWN_PERSON,
});

export function packingCodec(
  roster: readonly RosterEntry[],
  /** 서버에 올라간 재료 id. 아직 안 올라갔거나 지운 재료를 가리키면 서버가 거부하므로 그때는 연결을 비워 보낸다. */
  serverIngredientIds: ReadonlySet<string>,
): Codec<PackingRow, ChecklistItemBody, ServerChecklistItem> {
  const { idOfName, nameOfId } = nameFinder(roster);
  const isPerson = (owner: string) => owner !== PACKING_SHARED && owner !== PACKING_UNASSIGNED;
  return {
    syncable: (item) => isServerId(item.id) && (!isPerson(item.owner) || Boolean(idOfName(item.owner))),
    idOf: (item) => item.id,
    toBody: (item) => ({
      name: item.name.trim().slice(0, 60) || "이름 없는 준비물",
      quantity: blank(item.quantity, 60),
      ownerMembershipId: isPerson(item.owner) ? idOfName(item.owner) ?? null : null,
      isShared: item.owner === PACKING_SHARED,
      completed: item.done,
      tags: tidyTags(item.tags),
      sourceIngredientId: item.sourceIngredientId && serverIngredientIds.has(item.sourceIngredientId) ? item.sourceIngredientId : null,
    }),
    fromServer: (row) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity ?? "",
      owner: row.isShared ? PACKING_SHARED : row.ownerMembershipId ? nameOfId(row.ownerMembershipId) : PACKING_UNASSIGNED,
      tags: [...row.tags],
      ...(row.sourceIngredientId ? { sourceIngredientId: row.sourceIngredientId } : {}),
      done: row.completed,
    }),
    // 재료가 아직 안 올라가 연결을 비워 보냈으면 서버 줄에는 연결이 없다. 기기의 연결을
    // 살려 두었다가 재료가 올라가면 다시 보낸다.
    keepLocal: (fromServer, local) =>
      fromServer.sourceIngredientId || !local.sourceIngredientId
        ? fromServer
        : { ...fromServer, sourceIngredientId: local.sourceIngredientId },
  };
}

// ---------------------------------------------------------------------------

/** 앱의 재료(CookingItem)에 `준비 완료` 체크를 붙인 모양. */
export type IngredientRow = {
  id: string;
  name: string;
  quantity: string;
  group: string;
  /** 사람 이름, 또는 `미정`·`구매`. */
  owner: string;
  ready: boolean;
};

export type RecipeRow = {
  id: string;
  name: string;
  note: string;
  url?: string;
  ingredients: IngredientRow[];
};

export const COOKING_BUY = "구매";
export const COOKING_UNASSIGNED = "미정";

type Procurement = "bring" | "buy" | "undecided";

export type ServerIngredient = {
  id: string;
  name: string;
  quantity: string | null;
  category: string | null;
  procurement: Procurement;
  ownerMembershipId: string | null;
  ready: boolean;
};

export type ServerRecipe = {
  id: string;
  name: string;
  memo: string | null;
  sourceUrl: string | null;
  ingredients: ServerIngredient[];
  version: number;
};

export type RecipeBody = Omit<ServerRecipe, "id" | "version">;

export function recipeCodec(roster: readonly RosterEntry[]): Codec<RecipeRow, RecipeBody, ServerRecipe> {
  const { idOfName, nameOfId } = nameFinder(roster);
  const isPerson = (owner: string) => owner !== COOKING_BUY && owner !== COOKING_UNASSIGNED;
  return {
    // 재료도 서버 id 가 있어야 한다. 없이 보내면 서버가 새 id 를 붙여, 돌아온 모습과
    // 기기 모습이 늘 달라 고치기를 끝없이 보낸다.
    syncable: (recipe) =>
      isServerId(recipe.id)
      && recipe.ingredients.length <= 100
      && recipe.ingredients.every((item) => isServerId(item.id) && (!isPerson(item.owner) || Boolean(idOfName(item.owner)))),
    idOf: (recipe) => recipe.id,
    toBody: (recipe) => ({
      name: recipe.name.trim().slice(0, 60) || "이름 없는 요리",
      memo: blank(recipe.note, 2000),
      sourceUrl: safeUrl(recipe.url),
      ingredients: recipe.ingredients.map((item) => ({
        id: item.id,
        name: item.name.trim().slice(0, 60) || "이름 없는 재료",
        quantity: blank(item.quantity, 60),
        category: blank(item.group, 30),
        procurement: item.owner === COOKING_BUY ? "buy" : isPerson(item.owner) ? "bring" : "undecided",
        ownerMembershipId: isPerson(item.owner) ? idOfName(item.owner) ?? null : null,
        ready: item.ready,
      })),
    }),
    fromServer: (row) => ({
      id: row.id,
      name: row.name,
      note: row.memo ?? "",
      url: row.sourceUrl ?? "",
      ingredients: row.ingredients.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity ?? "",
        group: item.category ?? "",
        owner: item.procurement === "buy"
          ? COOKING_BUY
          : item.ownerMembershipId ? nameOfId(item.ownerMembershipId) : COOKING_UNASSIGNED,
        ready: item.ready,
      })),
    }),
  };
}
