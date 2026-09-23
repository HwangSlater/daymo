/**
 * 「찾기」가 여행을 열어 보지 않고도 훑을 수 있게, 하위 목록을 미리 받아 기기 기록에 채운다.
 *
 * 기기 기록(`trip.planning`)은 여행 상세를 이 기기에서 열어야 채워진다. 그래서 새 기기나
 * 웹으로 처음 들어온 사람은 찾기가 텅 비었다. 서버에는 검색 API 가 없으므로 목록을 그대로
 * 받아 와 채운다.
 *
 * 받은 것을 기기에 넣을 때 가장 위험한 것은 "아직 못 올린 기기의 변경" 을 덮는 일이다.
 * 여기서는 두 겹으로 막는다.
 *
 * 1. `pickTripsToPrefetch` 는 **이 기기가 한 번도 받아 본 적 없는 여행만** 고른다. 줄도
 *    없고 맞춘 적(`*SyncIds`)도 없는 여행이라, 덮어쓸 기기의 변경 자체가 없다.
 * 2. 그래도 합칠 때는 상세 화면과 똑같은 규칙(`mergeListOnOpen` + `syncedIds`)을 쓴다.
 *    받는 사이에 무언가 생겼더라도 아직 못 올린 줄은 남는다. 부르는 쪽은 넣기 직전에
 *    1번 조건을 한 번 더 본다(받는 동안 사용자가 그 여행을 열었을 수 있다).
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { isServerId, mergeListOnOpen } from "./listSync.ts";
import { placeCodec, type AppPlace, type ServerPlace } from "./placeSync.ts";
import {
  scheduleCodec,
  stayCodec,
  type AppScheduleItem,
  type AppStay,
  type ServerScheduleItem,
  type ServerStay,
} from "./scheduleSync.ts";
import {
  packingCodec,
  recipeCodec,
  type IngredientRow,
  type PackingRow,
  type RecipeRow,
  type ServerChecklistItem,
  type ServerRecipe,
} from "./cookingSync.ts";
import { expenseCodec, type ServerExpense } from "./expenseSync.ts";
import { diaryCodec, memoCodec, type DiaryRow, type MemoRow, type ServerDiary, type ServerMemo } from "./memorySync.ts";
import { photoCodec, type PhotoRow, type ServerPhoto } from "./photoSync.ts";
import type { Expense } from "./tripExpenses.ts";
import type { RosterEntry } from "./tripSync.ts";

/** 기기 기록의 요리(화면의 `Recipe`). 재료의 `준비 완료` 는 목록 밖에 따로 있다. */
type CachedRecipe = {
  id: string;
  name: string;
  note: string;
  url?: string;
  ingredients: Omit<IngredientRow, "ready">[];
};

/** 기기 기록에서 미리 받기가 읽고 쓰는 칸. 화면의 `TripPlanningData` 중 쓰는 것만. */
export type CachedTripLists = {
  places?: readonly AppPlace[];
  schedule?: readonly AppScheduleItem[];
  stay?: AppStay;
  packingItems?: readonly Omit<PackingRow, "done">[];
  packingDone?: readonly string[];
  recipes?: readonly CachedRecipe[];
  cookingReadyIngredientIds?: readonly string[];
  expenses?: readonly Expense[];
  tripNotes?: readonly MemoRow[];
  memories?: { diaries?: readonly DiaryRow[]; photos?: readonly PhotoRow[] };
  // 아래 셋은 미리 받기가 손대지 않는다. 있으면 이 기기에서 이미 연 여행이라는 표시로만 본다.
  payments?: readonly unknown[];
  transportations?: readonly unknown[];
  reservations?: readonly unknown[];
  placeSyncIds?: readonly string[];
  scheduleSyncIds?: readonly string[];
  staySyncIds?: readonly string[];
  packingSyncIds?: readonly string[];
  recipeSyncIds?: readonly string[];
  expenseSyncIds?: readonly string[];
  memoSyncIds?: readonly string[];
  diarySyncIds?: readonly string[];
  photoSyncIds?: readonly string[];
  paymentSyncIds?: readonly string[];
  transportSyncIds?: readonly string[];
  reservationSyncIds?: readonly string[];
};

type PrefetchTrip = {
  id?: string;
  /** 앱이 들고 있는 예시 여행. 서버에 없어 받을 것이 없다. */
  sample?: boolean;
  planning?: CachedTripLists;
};

const some = (list: readonly unknown[] | undefined) => Boolean(list?.length);

/**
 * 이 기기가 이 여행의 하위 목록을 아직 한 번도 받아 본 적이 없는지.
 *
 * 줄이 하나라도 있거나 서버와 맞춘 적이 있으면 아니다. 그런 여행은 아직 못 올린
 * 변경을 품고 있을 수 있어 미리 받기로 건드리지 않는다. 상세를 열면 그때 맞춰진다.
 */
export function neverFetched(planning: CachedTripLists | undefined): boolean {
  if (!planning) return true;
  const lists = [
    planning.places,
    planning.schedule,
    planning.packingItems,
    planning.packingDone,
    planning.recipes,
    planning.cookingReadyIngredientIds,
    planning.expenses,
    planning.tripNotes,
    planning.memories?.diaries,
    planning.memories?.photos,
    planning.payments,
    planning.transportations,
    planning.reservations,
    planning.placeSyncIds,
    planning.scheduleSyncIds,
    planning.staySyncIds,
    planning.packingSyncIds,
    planning.recipeSyncIds,
    planning.expenseSyncIds,
    planning.memoSyncIds,
    planning.diarySyncIds,
    planning.photoSyncIds,
    planning.paymentSyncIds,
    planning.transportSyncIds,
    planning.reservationSyncIds,
  ];
  return !lists.some(some) && !planning.stay?.name?.trim();
}

/**
 * 미리 받을 여행 id.
 *
 * @param done 이번에 이미 받아 둔(또는 받고 있는) 여행. 같은 것을 두 번 받지 않는다.
 * @param skipId 지금 열려 있는 여행. 상세 화면이 그 여행의 주인이라 손대지 않는다.
 * @param limit 한 번에 고르는 수. 여행이 많은 공간에서 한꺼번에 다 받지 않는다.
 */
export function pickTripsToPrefetch(
  trips: readonly PrefetchTrip[],
  { done = new Set<string>(), skipId, limit = 20 }: { done?: ReadonlySet<string>; skipId?: string; limit?: number } = {},
): string[] {
  const picked: string[] = [];
  for (const trip of trips) {
    if (picked.length >= limit) break;
    const id = trip.id;
    if (!id || trip.sample || !isServerId(id)) continue;
    if (id === skipId || done.has(id) || picked.includes(id)) continue;
    if (!neverFetched(trip.planning)) continue;
    picked.push(id);
  }
  return picked;
}

/**
 * 한 번에 `limit` 개씩만 돌린다. 여행이 많아도 서버에 한꺼번에 몰리지 않는다.
 *
 * 하나가 실패해도 나머지는 이어서 돈다. 실패는 `worker` 안에서 삼킨다.
 */
export async function runWithLimit<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const lanes = Math.max(1, Math.min(limit, queue.length));
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        await worker(next);
      }
    }),
  );
}

/** 서버에서 받아 온 여행 하나의 목록들. */
export type FetchedTripLists = {
  places: readonly ServerPlace[];
  schedule: readonly ServerScheduleItem[];
  stays: readonly ServerStay[];
  packing: readonly ServerChecklistItem[];
  recipes: readonly ServerRecipe[];
  expenses: readonly ServerExpense[];
  memos: readonly ServerMemo[];
  diaries: readonly ServerDiary[];
  photos: readonly ServerPhoto[];
};

/** 기기 기록에 덧씌울 칸들. 화면의 `TripPlanningData` 에 그대로 펼쳐 넣는다. */
type PrefetchedLists = {
  places: AppPlace[];
  placeSyncIds: string[];
  schedule: AppScheduleItem[];
  scheduleSyncIds: string[];
  stay?: AppStay;
  staySyncIds: string[];
  packingItems: Omit<PackingRow, "done">[];
  packingDone: string[];
  packingSyncIds: string[];
  recipes: CachedRecipe[];
  cookingReadyIngredientIds: string[];
  recipeSyncIds: string[];
  expenses: Expense[];
  expenseSyncIds: string[];
  tripNotes: MemoRow[];
  memoSyncIds: string[];
  diaries: DiaryRow[];
  diarySyncIds: string[];
  photos: PhotoRow[];
  photoSyncIds: string[];
};

const idsOf = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

/**
 * 받아 온 목록을 기기 기록과 합친다.
 *
 * 합치는 규칙은 상세 화면과 같다(`mergeListOnOpen`). 서버에 있는 줄은 서버 모습을 쓰고,
 * 맞춘 적이 있는데 서버에 없으면 다른 곳에서 지운 것이라 버리고, 맞춘 적이 없으면 아직
 * 못 올린 줄이라 남긴다. 맞춘 적(`*SyncIds`)은 서버가 준 id 로 다시 적는다.
 */
export function mergePrefetchedLists(
  planning: CachedTripLists | undefined,
  fetched: FetchedTripLists,
  { tripDates, roster }: { tripDates: readonly string[]; roster: readonly RosterEntry[] },
): PrefetchedLists {
  const synced = (ids: readonly string[] | undefined) => new Set(ids ?? []);
  const places = mergeListOnOpen(planning?.places ?? [], fetched.places, synced(planning?.placeSyncIds), placeCodec);
  const serverPlaceIds = new Set(idsOf(fetched.places));
  const placeById = (id: string) => places.find((place) => place.id === id);

  const schedule = mergeListOnOpen(
    planning?.schedule ?? [],
    fetched.schedule,
    synced(planning?.scheduleSyncIds),
    scheduleCodec(tripDates, serverPlaceIds),
  );
  // 앱에는 대표 숙소가 하나다. 상세 화면과 같이 0개나 1개짜리 목록으로 본다.
  const stays = mergeListOnOpen(
    planning?.stay?.name ? [planning.stay] : [],
    fetched.stays,
    synced(planning?.staySyncIds),
    stayCodec(tripDates, serverPlaceIds, placeById),
  );

  const serverIngredientIds = new Set(fetched.recipes.flatMap((recipe) => idsOf(recipe.ingredients)));
  const ready = new Set(planning?.cookingReadyIngredientIds ?? []);
  const localRecipes: RecipeRow[] = (planning?.recipes ?? []).map((recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map((item) => ({ ...item, ready: ready.has(item.id) })),
  }));
  const recipes = mergeListOnOpen(localRecipes, fetched.recipes, synced(planning?.recipeSyncIds), recipeCodec(roster));

  const doneIds = new Set(planning?.packingDone ?? []);
  const localPacking: PackingRow[] = (planning?.packingItems ?? []).map((item) => ({ ...item, done: doneIds.has(item.id) }));
  const packing = mergeListOnOpen(
    localPacking,
    fetched.packing,
    synced(planning?.packingSyncIds),
    packingCodec(roster, serverIngredientIds),
  );

  const expenses = mergeListOnOpen(
    planning?.expenses ?? [],
    fetched.expenses,
    synced(planning?.expenseSyncIds),
    expenseCodec(tripDates, roster),
  );
  const tripNotes = mergeListOnOpen(planning?.tripNotes ?? [], fetched.memos, synced(planning?.memoSyncIds), memoCodec(roster));
  const diaries = mergeListOnOpen(
    planning?.memories?.diaries ?? [],
    fetched.diaries,
    synced(planning?.diarySyncIds),
    diaryCodec,
  );
  const knownPhotoIds = synced(planning?.photoSyncIds);
  const photos = mergeListOnOpen(
    planning?.memories?.photos ?? [],
    fetched.photos,
    knownPhotoIds,
    photoCodec(tripDates, knownPhotoIds),
  );

  return {
    places,
    placeSyncIds: idsOf(fetched.places),
    schedule,
    scheduleSyncIds: idsOf(fetched.schedule),
    ...(stays[0] ? { stay: stays[0] } : {}),
    staySyncIds: idsOf(fetched.stays),
    packingItems: packing.map(({ done: _done, ...item }) => item),
    packingDone: packing.filter((item) => item.done).map((item) => item.id),
    packingSyncIds: idsOf(fetched.packing),
    recipes: recipes.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map(({ ready: _ready, ...item }) => item),
    })),
    cookingReadyIngredientIds: recipes.flatMap((recipe) =>
      recipe.ingredients.filter((item) => item.ready).map((item) => item.id)),
    recipeSyncIds: idsOf(fetched.recipes),
    expenses,
    expenseSyncIds: idsOf(fetched.expenses),
    tripNotes,
    memoSyncIds: idsOf(fetched.memos),
    diaries,
    diarySyncIds: idsOf(fetched.diaries),
    photos,
    photoSyncIds: idsOf(fetched.photos),
  };
}
