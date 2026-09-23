import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SEARCH_CHIPS,
  SEARCH_KIND_LABEL,
  SEARCH_TYPES,
  deviceSearchRows,
  filterByChip,
  filterSearchRows,
  mergeSearchRows,
  searchChipCounts,
  searchPath,
  searchRowFromHit,
  searchRowsFromHits,
  tripOfRow,
  type SearchHit,
  type SearchRow,
} from "./searchResults.ts";
import type { Trip } from "./tripPlanning.ts";

/** 이름마다 하나씩 주는 서버 id. 서버는 UUID 만 준다. */
const uuids = new Map<string, string>();
const ID = (name: string) => {
  const 만든 = uuids.get(name) ?? `00000000-0000-4000-8000-${String(uuids.size + 1).padStart(12, "0")}`;
  uuids.set(name, 만든);
  return 만든;
};

const 여행 = (name: string, planning?: Trip["planning"]): Trip => ({
  id: ID(name),
  name,
  date: "10월 1일 – 10월 3일",
  note: "가을 바다",
  tone: 0,
  mark: "🌊",
  region: "제주",
  start: "2026-10-01",
  end: "2026-10-03",
  planning,
});

const 서버줄 = (over: Partial<SearchHit> = {}): SearchHit => ({
  type: "place",
  id: ID("소나기식당"),
  tripId: ID("가을 제주"),
  tripTitle: "가을 제주",
  title: "소나기식당",
  detail: "식당 · 완산구",
  destination: "places",
  ...over,
});

test("칩과 서버 갈래가 서로를 빠짐없이 덮는다", () => {
  // 갈래마다 적을 말이 있어야 한다. 없으면 목록에 이름 없는 줄이 뜬다.
  for (const type of SEARCH_TYPES) {
    assert.ok(SEARCH_KIND_LABEL[type], `${type} 에 적을 말이 없다`);
    assert.ok(SEARCH_CHIPS.includes(SEARCH_KIND_LABEL[type] as (typeof SEARCH_CHIPS)[number]));
  }
  // 「전체」 말고는 모든 칩이 갈래 하나 이상을 덮는다.
  for (const chip of SEARCH_CHIPS) {
    if (chip === "전체") continue;
    assert.ok(SEARCH_TYPES.some((type) => SEARCH_KIND_LABEL[type] === chip), `${chip} 칩이 덮는 갈래가 없다`);
  }
});

test("두 글자보다 짧으면 서버에 보내지 않는다", () => {
  assert.equal(searchPath(ID("공간"), "소"), null);
  assert.equal(searchPath(ID("공간"), " 소 "), null);
  assert.equal(searchPath(ID("공간"), ""), null);
  assert.ok(searchPath(ID("공간"), "소나")?.includes("q=%EC%86%8C%EB%82%98"));
});

test("아주 긴 말은 앞머리만 보낸다", () => {
  const 주소 = searchPath(ID("공간"), "가".repeat(200));
  assert.ok(주소);
  const q = new URL(`https://x${주소}`).searchParams.get("q") ?? "";
  assert.equal(q.length, 60);
});

test("전체는 types 를 붙이지 않고, 칩은 그 갈래만 고른다", () => {
  assert.ok(!searchPath(ID("공간"), "소나기")?.includes("types="));
  assert.ok(searchPath(ID("공간"), "소나기", "장소")?.includes("types=place"));
  // 메모와 일기는 화면에서 한 가지다. 칩 하나가 갈래 둘을 고른다.
  assert.ok(searchPath(ID("공간"), "소나기", "기록")?.includes("types=memo,diary"));
});

test("`%` 는 글자 그대로 실어 보낸다", () => {
  const 주소 = searchPath(ID("공간"), "50%");
  assert.ok(주소?.includes("q=50%25"));
});

test("서버 한 줄을 화면 한 줄로 옮긴다", () => {
  const row = searchRowFromHit(서버줄());
  assert.deepEqual(row, {
    key: `place:${ID("소나기식당")}`,
    type: "place",
    id: ID("소나기식당"),
    title: "소나기식당",
    detail: "식당 · 완산구",
    tripId: ID("가을 제주"),
    tripTitle: "가을 제주",
    destination: "places",
    tags: [],
    onDevice: false,
  });
});

test("모르는 갈래는 빠지고, 모르는 자리는 갈래로 정한다", () => {
  // 서버가 나중에 갈래를 늘려도 옛 앱이 빈 줄을 그리지 않는다.
  assert.equal(searchRowFromHit(서버줄({ type: "photo" })), null);
  const 줄들 = searchRowsFromHits([서버줄({ type: "photo" }), 서버줄({ type: "memo", id: ID("메모1") })]);
  assert.deepEqual(줄들.map((row) => row.type), ["memo"]);
  // 자리만 모르는 것이면 버리지 않는다. 갈래로 열 자리를 정한다.
  assert.equal(searchRowFromHit(서버줄({ type: "packing", destination: "지하실" }))?.destination, "preparation");
});

test("결과가 없으면 빈 목록이다", () => {
  assert.deepEqual(searchRowsFromHits([]), []);
  assert.deepEqual(deviceSearchRows([]), []);
  assert.deepEqual(mergeSearchRows([], []), []);
  assert.deepEqual(searchChipCounts([]).map((칩) => 칩.count), SEARCH_CHIPS.map(() => 0));
});

test("기기 여행을 갈래별로 한 줄씩 펼친다", () => {
  const rows = deviceSearchRows([
    여행("가을 제주", {
      places: [{ id: ID("소나기식당"), name: "소나기식당", area: "완산구", category: "식당", mapUrl: "", tags: ["웨이팅"], status: "후보" }],
      recipes: [{ id: ID("김치찌개"), name: "김치찌개", note: "", ingredients: [{ id: ID("대파"), name: "대파", quantity: "1단", group: "채소", owner: "하늘" }] }],
      tripNotes: [{ id: ID("메모1"), author: "하늘", body: "우산 챙기기" }],
    }),
  ]);
  assert.deepEqual(rows.map((row) => row.type), ["trip", "place", "recipe", "memo"]);
  assert.equal(rows[0].detail, "제주 · 가을 바다");
  assert.equal(rows[1].destination, "places");
  // 재료 이름으로도 요리가 걸려야 한다.
  assert.deepEqual(rows[2].tags, ["대파"]);
  assert.ok(rows.every((row) => row.onDevice));
});

test("같은 것이 양쪽에서 나오면 한 줄로 합친다", () => {
  const 기기 = deviceSearchRows([
    여행("가을 제주", {
      places: [{ id: ID("소나기식당"), name: "소나기식당", area: "완산구", category: "식당", mapUrl: "", tags: ["웨이팅"], status: "후보" }],
    }),
  ]);
  const 서버 = searchRowsFromHits([
    서버줄(),
    서버줄({ type: "expense", id: ID("지출1"), title: "저녁값", detail: "2026-10-02", destination: "expenses" }),
  ]);
  const 합친 = mergeSearchRows(기기, 서버);
  // 소나기식당은 한 줄뿐이고, 태그가 붙은 기기 쪽이 남는다.
  assert.equal(합친.filter((row) => row.id === ID("소나기식당")).length, 1);
  assert.deepEqual(합친.find((row) => row.id === ID("소나기식당"))?.tags, ["웨이팅"]);
  // 기기 것이 먼저고 서버에만 있는 것이 뒤다. 늦게 온 답이 보던 줄을 밀지 않는다.
  assert.deepEqual(합친.map((row) => row.title), ["가을 제주", "소나기식당", "저녁값"]);
  assert.equal(합친[2].onDevice, false);
});

test("서버가 준 차례를 그대로 잇는다", () => {
  const 서버 = searchRowsFromHits([
    서버줄({ type: "trip", id: ID("여행줄"), title: "가을 제주", destination: "overview" }),
    서버줄({ type: "place", id: ID("장소줄"), title: "소나기식당" }),
    서버줄({ type: "expense", id: ID("지출줄"), title: "저녁값", destination: "expenses" }),
  ]);
  assert.deepEqual(mergeSearchRows([], 서버).map((row) => row.title), ["가을 제주", "소나기식당", "저녁값"]);
  // 서버가 같은 줄을 두 번 줘도 한 번만 놓는다.
  assert.equal(mergeSearchRows([], [...서버, 서버[1]]).length, 3);
});

test("서버에 닿지 못해도 기기 것은 그대로 보인다", () => {
  const 기기 = deviceSearchRows([
    여행("가을 제주", {
      packingItems: [{ id: ID("우산"), name: "우산", quantity: "2개", owner: "공용", tags: [] }],
    }),
  ]);
  // 서버 찾기가 실패하면 화면은 빈 목록을 합친다. 받아 둔 여행은 오프라인에서도 찾아진다.
  const 합친 = mergeSearchRows(기기, []);
  assert.deepEqual(합친.map((row) => row.title), ["가을 제주", "우산"]);
  assert.deepEqual(filterSearchRows(합친, "우산").map((row) => row.title), ["우산"]);
});

test("친 말은 제목·여행 이름·맥락·곁말에서 모두 찾는다", () => {
  const rows = deviceSearchRows([
    여행("가을 제주", {
      places: [{ id: ID("소나기식당"), name: "소나기식당", area: "완산구", category: "식당", mapUrl: "", tags: ["웨이팅"], status: "후보" }],
    }),
  ]);
  assert.equal(filterSearchRows(rows, "완산").length, 1);
  assert.equal(filterSearchRows(rows, "웨이팅").length, 1);
  // 여행 이름으로 찾으면 그 여행의 줄이 모두 나온다.
  assert.equal(filterSearchRows(rows, "제주").length, 2);
  assert.equal(filterSearchRows(rows, "없는말").length, 0);
  assert.equal(filterSearchRows(rows, "  ").length, rows.length);
});

test("칩으로 고르고 수를 센다", () => {
  const rows = searchRowsFromHits([
    서버줄({ type: "memo", id: ID("메모줄"), title: "우산 챙기기", destination: "memories" }),
    서버줄({ type: "diary", id: ID("일기줄"), title: "첫날", destination: "memories" }),
    서버줄({ type: "place", id: ID("장소줄2"), title: "소나기식당" }),
  ]);
  // 메모와 일기가 「기록」 한 칩에 함께 담긴다.
  assert.equal(filterByChip(rows, "기록").length, 2);
  assert.equal(filterByChip(rows, "장소").length, 1);
  assert.equal(filterByChip(rows, "전체").length, 3);
  const 수 = new Map(searchChipCounts(rows).map((칩) => [칩.label, 칩.count]));
  assert.equal(수.get("전체"), 3);
  assert.equal(수.get("기록"), 2);
  assert.equal(수.get("비용"), 0);
});

test("줄이 딸린 여행을 찾는다. 못 찾으면 열지 않는다", () => {
  const trip = 여행("가을 제주");
  const row = searchRowFromHit(서버줄()) as SearchRow;
  assert.equal(tripOfRow(row, [trip])?.name, "가을 제주");
  // 아직 목록에 없는 여행이면 undefined 다. 부르는 쪽은 엉뚱한 여행을 열지 않는다.
  assert.equal(tripOfRow(row, []), undefined);
  // 예시 여행처럼 id 가 없는 것은 이름으로 맞춘다.
  const 예시: Trip = { ...여행("예시 여행"), id: undefined };
  const 예시줄 = deviceSearchRows([예시])[0];
  assert.equal(tripOfRow(예시줄, [예시])?.name, "예시 여행");
});
