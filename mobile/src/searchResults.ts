/**
 * 「찾기」의 한 줄 — 기기에 받아 둔 기록과 서버가 찾아 준 것을 한 모양으로 놓는다.
 *
 * 찾기는 지금까지 이 기기가 받아 둔 여행만 훑었다. 초대받고 막 들어온 사람이나
 * 목록 뒤쪽의 여행은 어떤 말로도 안 나왔다(2026-09-23 검토 #61). 서버에 찾기가
 * 생겼으니(`GET /v1/spaces/{id}/search`) 두 곳에서 온 줄을 여기서 합친다.
 *
 * ## 값은 영어, 말은 그릴 때
 *
 * 줄의 갈래(`SearchType`)는 `place`·`expense` 같은 **영어로 들고 다닌다**. 화면의
 * 칩에 적히는 「장소」·「비용」은 `SEARCH_KIND_LABEL` 로 그릴 때만 만든다. 갈래를
 * 한글로 저장했다가는 말을 다듬거나 다른 말을 쓰게 될 때 저장해 둔 값을 옮겨야
 * 한다(검토 #58). 날짜를 `YYYY-MM-DD` 로 들고 다니고 「3일(금)」은 그릴 때 만드는
 * 것과 같은 까닭이다.
 *
 * ## 합치는 규칙
 *
 * 기기 것이 먼저, 서버에만 있는 것이 뒤다(`mergeSearchRows`). 기기 것은 연결이
 * 없어도 눌러서 바로 열리고, 늦게 온 서버 답이 이미 보고 있던 줄의 자리를 바꾸지
 * 않는다. 같은 줄이 양쪽에서 나오면 `갈래:id` 로 짝을 지어 기기 것만 남긴다 —
 * 기기 것에는 태그처럼 서버가 주지 않는 것이 붙어 있다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { money } from "./tripExpenses.ts";
import type { Trip, TripDetailDestination } from "./tripPlanning.ts";

/** 서버가 가르는 여덟 갈래. 요청·응답에 그대로 오가는 값이라 영어다. */
export const SEARCH_TYPES = [
  "trip",
  "place",
  "schedule",
  "packing",
  "recipe",
  "expense",
  "memo",
  "diary",
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** 갈래를 눌렀을 때 열 여행 상세의 자리. 서버의 `DESTINATION_BY_TYPE` 과 같다. */
const DESTINATION_BY_TYPE: Record<SearchType, TripDetailDestination> = {
  trip: "overview",
  place: "places",
  schedule: "overview",
  packing: "preparation",
  recipe: "cooking",
  expense: "expenses",
  memo: "memories",
  diary: "memories",
};

/**
 * 화면에 적는 말. 메모와 일기는 둘 다 「기록」이다 — 쓰는 사람에게는 한 가지다.
 *
 * 이 표는 그릴 때만 쓴다. 이 말로 저장하거나 서버에 보내지 않는다.
 */
export const SEARCH_KIND_LABEL: Record<SearchType, string> = {
  trip: "여행",
  place: "장소",
  schedule: "일정",
  packing: "준비",
  recipe: "요리",
  expense: "비용",
  memo: "기록",
  diary: "기록",
};

/** 분류 칩에 적히는 말. 맨 앞의 「전체」는 갈래를 고르지 않은 것이다. */
export const SEARCH_CHIPS = ["전체", "여행", "장소", "일정", "요리", "준비", "비용", "기록"] as const;
export type SearchChip = (typeof SEARCH_CHIPS)[number];

/**
 * 칩 하나가 고르는 서버 갈래들.
 *
 * 「기록」처럼 한 칩이 두 갈래를 덮는 자리가 있어서 표를 거꾸로 훑는다. 「전체」는
 * 여덟 가지 전부다.
 */
export function typesOfChip(chip: SearchChip): SearchType[] {
  if (chip === "전체") return [...SEARCH_TYPES];
  return SEARCH_TYPES.filter((type) => SEARCH_KIND_LABEL[type] === chip);
}

/** 서버가 보낸 한 줄. `backend/app/schemas/search.py` 의 `SearchHitOut` 과 같다. */
export type SearchHit = {
  type: string;
  id: string;
  tripId: string;
  tripTitle: string;
  title: string;
  detail: string;
  destination: string;
};

/** 찾기 목록의 한 줄. 기기에서 만든 것과 서버에서 온 것이 같은 모양이다. */
export type SearchRow = {
  /** 목록 열쇠이자 양쪽을 맞추는 짝. `갈래:id` 다. */
  key: string;
  type: SearchType;
  /** 이 줄이 가리키는 기록의 id. 기기에만 있는 줄은 서버 id 가 아닐 수 있다. */
  id: string;
  title: string;
  /** 한 줄로 보여 줄 짧은 맥락. 줄 것이 없으면 빈 글자다. */
  detail: string;
  /** 이 줄이 딸린 여행. 예시 여행처럼 서버에 없는 것은 비어 있다. */
  tripId: string;
  tripTitle: string;
  destination: TripDetailDestination;
  /** 함께 찾히는 곁말(장소 태그, 요리 재료, 지출 메모). 서버 줄에는 없다. */
  tags: string[];
  /** 이 기기에 기록이 있는지. 없으면 눌러서 여행을 열 때 받아진다. */
  onDevice: boolean;
};

/** 서버가 받는 찾을 말의 최소·최대 길이(`backend/app/services/search.py`). */
export const SEARCH_MIN_QUERY = 2;
export const SEARCH_MAX_QUERY = 60;
/** 한 번에 받는 줄 수. 서버 상한까지 받아 두면 칩을 눌러 볼 때 다시 묻지 않는다. */
export const SEARCH_LIMIT = 50;

/**
 * 서버에 보낼 주소. 무엇을 보낼지 정하는 것은 순수한 셈이라 여기서 시험한다.
 *
 * 찾을 말이 두 글자보다 짧으면 `null` 이다 — 서버도 빈 목록으로 답하니 오갈
 * 까닭이 없다. 60자를 넘으면 앞머리만 보낸다. 그보다 길면 서버가 422 를 주는데,
 * 긴 글을 붙여넣었을 때 오류를 띄울 일이 아니라 앞머리로 찾아 주면 되는 일이다.
 *
 * 여덟 갈래를 다 고르면 `types` 를 붙이지 않는다. 서버의 기본값과 같다.
 */
export function searchPath(
  spaceId: string,
  query: string,
  chip: SearchChip = "전체",
  limit: number = SEARCH_LIMIT,
): string | null {
  const 말 = query.trim().slice(0, SEARCH_MAX_QUERY);
  if (말.length < SEARCH_MIN_QUERY) return null;
  const 갈래 = typesOfChip(chip);
  return `/v1/spaces/${encodeURIComponent(spaceId)}/search`
    + `?q=${encodeURIComponent(말)}&limit=${limit}`
    + (갈래.length === SEARCH_TYPES.length ? "" : `&types=${갈래.join(",")}`);
}

/**
 * 서버에서 찾지 못했을 때 화면에 적는 한 줄.
 *
 * 기기 것은 그대로 보이므로 「못 찾았어요」가 아니라 **어디까지 찾았는지**를
 * 말한다. 찾기가 조용히 절반만 답하면 쓰는 사람은 없는 기록이라고 믿는다.
 */
export const SEARCH_OFFLINE_NOTICE = "아직 열어 보지 않은 여행은 찾지 못했어요. 인터넷 연결을 확인해 주세요";

const 이음 = (...조각: (string | number | false | null | undefined)[]) =>
  조각.filter(Boolean).join(" · ");

const 갈래인가 = (값: string): 값 is SearchType => (SEARCH_TYPES as readonly string[]).includes(값);

/**
 * 서버 한 줄을 화면 한 줄로 옮긴다. 모르는 갈래면 `null` 이다.
 *
 * 서버가 나중에 갈래를 늘리면(사진 같은 것) 옛 앱에는 적을 말도 열 자리도 없다.
 * 버리는 쪽이 「빈 이름의 알 수 없는 줄」보다 낫다. 저장 형식과 달리 이 줄은
 * 그리고 나면 끝이라, 모르는 값을 품고 되돌려 보낼 일이 없다.
 *
 * `destination` 은 서버가 보낸 것을 먼저 믿고, 모르는 값이면 갈래로 정한다.
 */
export function searchRowFromHit(hit: SearchHit): SearchRow | null {
  if (!갈래인가(hit.type)) return null;
  const 아는_자리 = Object.values(DESTINATION_BY_TYPE) as string[];
  return {
    key: `${hit.type}:${hit.id}`,
    type: hit.type,
    id: hit.id,
    title: hit.title,
    detail: hit.detail,
    tripId: hit.tripId,
    tripTitle: hit.tripTitle,
    destination: 아는_자리.includes(hit.destination)
      ? (hit.destination as TripDetailDestination)
      : DESTINATION_BY_TYPE[hit.type],
    tags: [],
    onDevice: false,
  };
}

/** 서버가 준 목록을 화면 줄로 옮긴다. 모르는 갈래는 빠진다. */
export function searchRowsFromHits(hits: readonly SearchHit[]): SearchRow[] {
  return hits.map(searchRowFromHit).filter((row): row is SearchRow => row !== null);
}

/**
 * 이 기기에 받아 둔 여행들을 한 줄씩 펼친다.
 *
 * 서버가 훑는 여덟 갈래와 같은 것을 같은 차례로 낸다. 두 곳의 모양이 어긋나면
 * 합친 목록에서 같은 기록이 두 줄로 보인다.
 */
export function deviceSearchRows(trips: readonly Trip[]): SearchRow[] {
  const rows: SearchRow[] = [];
  const 넣기 = (
    trip: Trip,
    type: SearchType,
    id: string,
    title: string,
    detail: string,
    tags: string[] = [],
  ) => {
    rows.push({
      key: `${type}:${id}`,
      type,
      id,
      title,
      detail,
      tripId: trip.id ?? "",
      tripTitle: trip.name,
      destination: DESTINATION_BY_TYPE[type],
      tags,
      onDevice: true,
    });
  };

  for (const trip of trips) {
    const plan = trip.planning;
    넣기(trip, "trip", trip.id ?? trip.name, trip.name, 이음(trip.region, trip.note));
    for (const place of plan?.places ?? []) {
      넣기(trip, "place", place.id, place.name, 이음(place.category, place.area), place.tags ?? []);
    }
    for (const item of plan?.schedule ?? []) {
      // 숙소·예약·교통편에서 만들어진 줄에는 id 가 없다. 그런 줄은 서버 찾기에도
      // 따로 나오지 않으므로 짝지을 일이 없고, 열쇠만 겹치지 않으면 된다.
      넣기(trip, "schedule", item.id ?? `${item.date ?? ""}-${item.title}`, item.title, 이음(item.date, item.time));
    }
    for (const item of plan?.packingItems ?? []) {
      넣기(trip, "packing", item.id, item.name, 이음(item.quantity, item.owner), item.tags ?? []);
    }
    for (const recipe of plan?.recipes ?? []) {
      // 재료는 모두 찾을 수 있어야 한다. 앞 3개만 넣던 때는 「돼지고기」로는 나오는데
      // 「대파」로는 안 나왔다.
      넣기(
        trip,
        "recipe",
        recipe.id,
        recipe.name,
        이음(`재료 ${recipe.ingredients.length}개`, recipe.note),
        recipe.ingredients.map((재료) => 재료.name),
      );
    }
    for (const item of plan?.expenses ?? []) {
      넣기(
        trip,
        "expense",
        item.id,
        item.title,
        이음(item.day, money(item.amount, plan?.currency), item.category, item.payer && `${item.payer} 냄`),
        item.memo ? [item.memo] : [],
      );
    }
    for (const note of plan?.tripNotes ?? []) {
      넣기(trip, "memo", note.id, note.body, note.author);
    }
    for (const diary of plan?.memories?.diaries ?? []) {
      넣기(trip, "diary", diary.id, diary.title, diary.date);
    }
  }
  return rows;
}

/**
 * 기기 줄과 서버 줄을 한 목록으로 합친다.
 *
 * 기기 것이 먼저다. 연결이 없어도 눌러서 바로 열리고, 늦게 온 서버 답이 이미
 * 보고 있던 줄을 밀어내지 않는다. 양쪽에 있는 줄은 기기 것만 남는다 — 태그처럼
 * 서버가 주지 않는 것이 붙어 있어서다.
 */
export function mergeSearchRows(
  device: readonly SearchRow[],
  server: readonly SearchRow[],
): SearchRow[] {
  const 이미 = new Set(device.map((row) => row.key));
  const 더할_것: SearchRow[] = [];
  for (const row of server) {
    if (이미.has(row.key)) continue;
    이미.add(row.key);
    더할_것.push(row);
  }
  return [...device, ...더할_것];
}

/**
 * 친 말로 기기 줄을 거른다. 서버 줄은 서버가 이미 걸러서 왔다.
 *
 * 제목뿐 아니라 여행 이름·맥락·곁말까지 본다. 「대파」로 요리가, 「제주」로 그
 * 여행의 모든 줄이 나오는 것이 여기서 온다.
 */
export function filterSearchRows(rows: readonly SearchRow[], query: string): SearchRow[] {
  const 말 = query.trim().toLocaleLowerCase("ko-KR");
  if (!말) return [...rows];
  return rows.filter((row) =>
    `${row.title} ${row.tripTitle} ${row.detail} ${row.tags.join(" ")}`
      .toLocaleLowerCase("ko-KR")
      .includes(말));
}

/** 고른 칩의 줄만 남긴다. 「전체」면 그대로다. */
export function filterByChip(rows: readonly SearchRow[], chip: SearchChip): SearchRow[] {
  if (chip === "전체") return [...rows];
  const 갈래 = new Set(typesOfChip(chip));
  return rows.filter((row) => 갈래.has(row.type));
}

/** 칩 하나에 적을 말과 수. `label` 은 그대로 칩에 적는다. */
export type SearchChipCount = { label: SearchChip; count: number };

/** 칩마다 몇 줄인지. 「전체」는 나머지의 합이다. */
export function searchChipCounts(rows: readonly SearchRow[]): SearchChipCount[] {
  return SEARCH_CHIPS.map((label) => ({ label, count: filterByChip(rows, label).length }));
}

/**
 * 이 줄이 딸린 여행을 목록에서 찾는다. 못 찾으면 `undefined` 다.
 *
 * id 로 먼저 맞추고, 없으면 이름으로 본다 — 예시 여행처럼 서버에 없는 여행은
 * id 가 없다. 부르는 쪽은 못 찾았을 때 여행을 열지 않는다. 엉뚱한 여행이 열리는
 * 것보다 아무 일도 안 일어나는 편이 낫다.
 */
export function tripOfRow(row: SearchRow, trips: readonly Trip[]): Trip | undefined {
  return trips.find((trip) => (row.tripId && trip.id === row.tripId) || trip.name === row.tripTitle);
}
