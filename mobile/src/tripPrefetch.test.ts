import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergePrefetchedLists,
  neverFetched,
  pickTripsToPrefetch,
  runWithLimit,
  type CachedTripLists,
  type FetchedTripLists,
} from "./tripPrefetch.ts";

// 이름마다 하나씩 주는 서버 id. 서버는 UUID 만 받아서 모양을 맞춰 둔다.
const uuids = new Map<string, string>();
const ID = (name: string) => {
  const made = uuids.get(name)
    ?? `00000000-0000-4000-8000-${String(uuids.size + 1).padStart(12, "0")}`;
  uuids.set(name, made);
  return made;
};

const roster = [{ id: ID("a1"), name: "하늘" }, { id: ID("a2"), name: "여울" }];
const tripDates = ["2026-10-01", "2026-10-02"];

const empty: FetchedTripLists = {
  places: [],
  schedule: [],
  stays: [],
  packing: [],
  recipes: [],
  expenses: [],
  memos: [],
  diaries: [],
  photos: [],
};

test("한 번도 받아 본 적 없는 서버 여행만 고른다", () => {
  const picked = pickTripsToPrefetch([
    { id: ID("1") },
    // 예시 여행은 서버에 없다.
    { id: ID("2"), sample: true },
    // 서버 id 가 아닌 옛 여행.
    { id: "trip-3" },
    // 이 기기에서 이미 받은 여행. 아직 못 올린 변경이 있을 수 있어 건드리지 않는다.
    { id: ID("4"), planning: { placeSyncIds: [ID("9")] } },
    { id: ID("5"), planning: { expenses: [{ id: ID("8"), day: "", title: "점심", amount: 1000, category: "식비", payer: "하늘", memo: "" }] } },
    // 빈 기록만 남은 여행은 아직 받아 본 적 없는 것으로 본다.
    { id: ID("6"), planning: { places: [], placeSyncIds: [] } },
  ]);

  assert.deepEqual(picked, [ID("1"), ID("6")]);
});

test("지금 열려 있는 여행과 이미 받은 여행은 빼고, 한 번에 고르는 수를 지킨다", () => {
  const trips = [{ id: ID("1") }, { id: ID("2") }, { id: ID("3") }, { id: ID("4") }];

  assert.deepEqual(
    pickTripsToPrefetch(trips, { skipId: ID("2"), done: new Set([ID("1")]), limit: 1 }),
    [ID("3")],
  );
});

test("미리 받기가 손대지 않는 목록만 있어도 받아 본 여행으로 본다", () => {
  // 교통편·예약·주고받은 기록은 여기서 받지 않는다. 있다는 것은 이 기기에서 이미 연
  // 여행이라는 뜻이라, 아직 못 올린 변경을 품고 있을 수 있어 건드리지 않는다.
  assert.equal(neverFetched({ transportations: [{}] }), false);
  assert.equal(neverFetched({ paymentSyncIds: [ID("pay")] }), false);
});

test("숙소만 적어 둔 여행도 받아 본 여행으로 본다", () => {
  assert.equal(neverFetched({ stay: { name: "달빛한옥", checkin: "", checkout: "", address: "" } }), false);
  assert.equal(neverFetched({ stay: { name: " ", checkin: "", checkout: "", address: "" } }), true);
  assert.equal(neverFetched(undefined), true);
});

test("한 번에 정해진 수만 돌고, 하나가 늦어도 나머지가 끝난다", async () => {
  let running = 0;
  let peak = 0;
  const finished: number[] = [];
  await runWithLimit([1, 2, 3, 4, 5], 2, async (item) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, item === 1 ? 20 : 1));
    running -= 1;
    finished.push(item);
  });

  assert.equal(peak, 2);
  assert.deepEqual([...finished].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("서버 목록을 기기 기록으로 옮긴다", () => {
  const merged = mergePrefetchedLists(undefined, {
    ...empty,
    places: [{
      id: ID("p1"),
      name: "첨성대",
      area: "황리단길",
      address: "경주시",
      category: "구경",
      status: "saved",
      memo: null,
      tags: ["야경"],
      mapUrl: null,
      version: 1,
    }],
    schedule: [{
      id: ID("s1"),
      date: "2026-10-01",
      time: "12:30",
      title: "황리단길 점심",
      type: "meal",
      note: null,
      tripPlaceId: ID("p1"),
      mapUrl: null,
      version: 1,
    }],
    packing: [{
      id: ID("k1"),
      name: "우산",
      quantity: "2개",
      ownerMembershipId: roster[0].id,
      isShared: false,
      completed: true,
      tags: [],
      sourceIngredientId: null,
      version: 1,
    }],
    recipes: [{
      id: ID("r1"),
      name: "김치찌개",
      memo: null,
      sourceUrl: null,
      ingredients: [{
        id: ID("r2"),
        name: "돼지고기",
        quantity: "300g",
        category: null,
        procurement: "bring",
        ownerMembershipId: roster[0].id,
        ready: true,
      }],
      version: 1,
    }],
    expenses: [{
      id: ID("e1"),
      date: "2026-10-01",
      title: "KTX",
      amount: 96000,
      category: "transport",
      payerMembershipId: roster[0].id,
      splitMode: null,
      shares: [],
      memo: null,
      version: 1,
    }],
  }, { tripDates, roster });

  assert.deepEqual(merged.places.map((place) => place.name), ["첨성대"]);
  assert.deepEqual(merged.placeSyncIds, [ID("p1")]);
  assert.equal(merged.schedule[0].date, "2026-10-01");
  assert.deepEqual(merged.packingItems.map((item) => item.owner), ["하늘"]);
  assert.deepEqual(merged.packingDone, [ID("k1")]);
  assert.deepEqual(merged.cookingReadyIngredientIds, [ID("r2")]);
  // 재료의 `준비 완료` 는 목록 밖에 두고, 요리 줄에는 남기지 않는다.
  assert.equal("ready" in merged.recipes[0].ingredients[0], false);
  assert.equal(merged.expenses[0].payer, "하늘");
  assert.equal(merged.expenses[0].day, "2026-10-01");
});

test("아직 못 올린 기기의 줄은 서버 목록으로 덮이지 않는다", () => {
  // 연결이 없을 때 이 기기에서 적은 장소. 서버에는 아직 없다.
  const planning: CachedTripLists = {
    places: [
      { id: ID("mine"), name: "동네 빵집", area: "", address: "", category: "카페", mapUrl: "", tags: [], status: "후보" },
      // 예전에 맞췄는데 서버에 없다. 다른 곳에서 지운 것이다.
      { id: ID("gone"), name: "지운 곳", area: "", address: "", category: "", mapUrl: "", tags: [], status: "후보" },
    ],
    placeSyncIds: [ID("gone")],
  };

  const merged = mergePrefetchedLists(planning, {
    ...empty,
    places: [{
      id: ID("srv"),
      name: "서버 장소",
      area: null,
      address: null,
      category: null,
      status: "saved",
      memo: null,
      tags: [],
      mapUrl: null,
      version: 1,
    }],
  }, { tripDates, roster });

  assert.deepEqual(merged.places.map((place) => place.name), ["서버 장소", "동네 빵집"]);
  assert.deepEqual(merged.placeSyncIds, [ID("srv")]);
});

test("서버에 목록이 없으면 기기 기록을 비우지 않는다", () => {
  const planning: CachedTripLists = {
    tripNotes: [{ id: ID("m1"), author: "하늘", body: "아직 못 올린 메모" }],
  };

  const merged = mergePrefetchedLists(planning, empty, { tripDates, roster });

  assert.deepEqual(merged.tripNotes.map((note) => note.body), ["아직 못 올린 메모"]);
  assert.deepEqual(merged.memoSyncIds, []);
});
