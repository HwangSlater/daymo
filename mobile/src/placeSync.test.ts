import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bodyKey,
  hasWork,
  legacyIdMap,
  mergeOnOpen,
  placeBody,
  placeFromServer,
  planPlaceSync,
  type AppPlace,
  type Confirmed,
  type ServerPlace,
} from "./placeSync.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const place = (id: string, extra: Partial<AppPlace> = {}): AppPlace => ({
  id,
  name: "달빛한옥",
  area: "전북",
  address: "",
  category: "숙소",
  mapUrl: "",
  tags: [],
  status: "후보",
  ...extra,
});

const server = (id: string, extra: Partial<ServerPlace> = {}): ServerPlace => ({
  id,
  name: "달빛한옥",
  area: "전북",
  address: null,
  category: "숙소",
  status: "saved",
  memo: null,
  tags: [],
  mapUrl: null,
  version: 1,
  ...extra,
});

const confirmedOf = (...places: AppPlace[]) =>
  new Map<string, Confirmed>(places.map((item) => [item.id, { key: bodyKey(placeBody(item)), version: 1 }]));

test("서버가 거부할 값은 보내기 전에 고친다", () => {
  const body = placeBody(place(A, {
    mapUrl: "javascript:alert(1)",
    tags: ["  바다  뷰 ", "바다 뷰", "가".repeat(25)],
    area: "",
    status: "일정",
  }));

  assert.equal(body.mapUrl, null);
  assert.deepEqual(body.tags, ["바다 뷰", "가".repeat(20)]);
  assert.equal(body.area, null);
  assert.equal(body.status, "scheduled");
});

test("서버에서 받은 장소는 앱의 말로 바뀌고 되돌려도 같은 모습이다", () => {
  const fromServer = placeFromServer(server(A, { status: "visited", tags: ["예약", "저녁"], mapUrl: "https://map.naver.com/x" }));

  assert.equal(fromServer.status, "일정");
  assert.equal(bodyKey(placeBody(fromServer)), bodyKey({
    name: "달빛한옥", area: "전북", address: null, category: "숙소", status: "scheduled", tags: ["저녁", "예약"], mapUrl: "https://map.naver.com/x",
  }));
});

test("새 장소는 만들고, 바뀐 장소는 고치고, 사라진 장소는 지운다", () => {
  const kept = place(A);
  const edited = place(B);
  const removed = place(C);
  const confirmed = confirmedOf(kept, edited, removed);

  const plan = planPlaceSync([kept, { ...edited, name: "새 이름" }, place("44444444-4444-4444-8444-444444444444")], confirmed);

  assert.deepEqual(plan.creates.map((item) => item.id), ["44444444-4444-4444-8444-444444444444"]);
  assert.deepEqual(plan.updates.map((item) => [item.id, item.body.name, item.version]), [[B, "새 이름", 1]]);
  assert.deepEqual(plan.deletes, [{ id: C, version: 1 }]);
});

test("태그 순서만 다르면 바뀐 것이 아니다", () => {
  const saved = place(A, { tags: ["예약", "저녁"] });

  assert.equal(hasWork(planPlaceSync([{ ...saved, tags: ["저녁", "예약"] }], confirmedOf(saved))), false);
});

test("옛 id 장소는 올리지 않는다. 먼저 id 를 바꿔야 한다", () => {
  assert.equal(hasWork(planPlaceSync([place("place-123")], new Map())), false);
});

test("서버가 거부한 모습 그대로면 다시 보내지 않고, 고치면 다시 보낸다", () => {
  const rejected = place(A, { name: "거부된 이름" });
  const failed = new Map([[A, { key: bodyKey(placeBody(rejected)), reason: "이름이 너무 길어요." }]]);

  assert.equal(hasWork(planPlaceSync([rejected], new Map(), failed)), false);
  assert.equal(planPlaceSync([{ ...rejected, name: "고친 이름" }], new Map(), failed).creates.length, 1);
});

test("처음 열 때 서버 장소를 쓰고, 못 올린 장소는 남기고, 다른 곳에서 지운 장소는 버린다", () => {
  const local = [place(A, { name: "기기 이름" }), place(B), place(C)];
  const merged = mergeOnOpen(local, [server(A, { name: "서버 이름" })], new Set([A, B]));

  assert.deepEqual(merged.map((item) => [item.id, item.name]), [[A, "서버 이름"], [C, "달빛한옥"]]);
});

test("지역을 모르는 장소는 서버에 빈 값으로 가고 돌아오면 위치 미정이다", () => {
  const fromServer = placeFromServer(server(A, { area: null }));

  assert.equal(fromServer.area, "위치 미정");
  assert.equal(placeBody(fromServer).area, null);
  assert.equal(hasWork(planPlaceSync([fromServer], new Map([[A, { key: bodyKey(placeBody(fromServer)), version: 1 }]]))), false);
});

test("옛 id 마다 새 id 를 하나씩 준다", () => {
  let n = 0;
  const map = legacyIdMap([place("place-1"), place(A), place("place-2"), place("place-1")], () => `new-${++n}`);

  assert.deepEqual([...map], [["place-1", "new-1"], ["place-2", "new-2"]]);
});
