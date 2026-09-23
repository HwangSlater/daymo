import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TRIP_DATA_BACKUP_KEY,
  TRIP_DATA_BACKUP_V2,
  TRIP_DATA_KEY,
  TRIP_ENTRY_PREFIX,
  TRIP_INDEX_KEY,
  TRIP_DATA_KEY_V1,
  isStoredPlanning,
  isStoredTrip,
  migrateTripDaysToKeys,
  parseStoredTripData,
  readTripData,
  storableTrips,
  tripDataKeys,
  tripDataText,
  writeTripData,
} from "./tripStorage.ts";
import type { Trip } from "./tripPlanning.ts";

const 여행 = (extra: Partial<Trip> = {}): Trip => ({
  name: "전주 한옥마을",
  date: "9월 22일 — 24일",
  note: "",
  tone: 0,
  mark: "09",
  region: "전북",
  start: "2026-09-22",
  end: "2026-09-24",
  ...extra,
});

const 적힌_글 = (value: unknown) => JSON.stringify(value);

test("적어 둔 여행을 공간별로 읽는다", () => {
  const 읽음 = parseStoredTripData(적힌_글({ tripsByGroup: { ours: [여행()] }, done: ["charger"] }));

  assert.equal(읽음?.tripsByGroup.ours.length, 1);
});

test("읽을 것이 없으면 null 이다", () => {
  assert.equal(parseStoredTripData(null), null);
  assert.equal(parseStoredTripData(""), null);
  assert.equal(parseStoredTripData("{"), null);
  assert.equal(parseStoredTripData(적힌_글({ done: [] })), null);
  // 공간이 하나도 안 남으면 적어 둔 것이 없는 것과 같다.
  assert.equal(parseStoredTripData(적힌_글({ tripsByGroup: {} })), null);
});

test("모양이 어긋난 여행 한 건만 버리고 나머지는 지킨다", () => {
  const 읽음 = parseStoredTripData(적힌_글({
    tripsByGroup: { ours: [여행({ name: "강릉 안목" }), { name: "반쪽" }, null, "글자"] },
  }));

  assert.deepEqual(읽음?.tripsByGroup.ours.map((trip) => trip.name), ["강릉 안목"]);
});

test("공간 이름이 비었거나 너무 길면 그 공간을 읽지 않는다", () => {
  const 긴_이름 = "x".repeat(65);
  const 읽음 = parseStoredTripData(적힌_글({
    tripsByGroup: { "": [여행()], [긴_이름]: [여행()], ours: [여행()] },
  }));

  assert.deepEqual(Object.keys(읽음?.tripsByGroup ?? {}), ["ours"]);
});

test("옛 판이 적어 둔 모르는 칸은 버리지 않고 그대로 들고 온다", () => {
  const 옛_기록 = {
    tripsByGroup: {
      ours: [{
        ...여행(),
        // 이 앱이 아직 모르는 칸. 다음 판이 쓰거나 다른 기기가 읽는다.
        미래의_칸: "그대로 두어야 한다",
        planning: {
          schedule: [{ time: "10:00", title: "아침", note: "", mapUrl: "", 미래의_줄칸: 1 }],
          expenses: [],
          미래의_기록칸: { a: 1 },
        },
      }],
    },
  };

  const 읽음 = parseStoredTripData(적힌_글(옛_기록));
  const 읽은_여행 = 읽음?.tripsByGroup.ours[0] as Record<string, unknown>;

  assert.equal(읽은_여행.미래의_칸, "그대로 두어야 한다");
  const 계획 = 읽은_여행.planning as Record<string, unknown>;
  assert.deepEqual(계획.미래의_기록칸, { a: 1 });
  assert.equal((계획.schedule as Record<string, unknown>[])[0].미래의_줄칸, 1);
});

test("계획만 어긋나면 계획을 버리고 여행은 살린다", () => {
  const 읽음 = parseStoredTripData(적힌_글({
    tripsByGroup: { ours: [{ ...여행(), planning: { schedule: "일정이 아니다" } }] },
  }));

  assert.equal(읽음?.tripsByGroup.ours.length, 1);
  assert.equal(읽음?.tripsByGroup.ours[0].name, "전주 한옥마을");
  assert.equal(읽음?.tripsByGroup.ours[0].planning, undefined);
});

test("지출만 심어 둔 옛 계획도 통째로 버리지 않는다", () => {
  assert.equal(isStoredPlanning({ expenses: [] }), true);
  assert.equal(isStoredPlanning({}), true);
  assert.equal(isStoredPlanning({ stay: { name: "달빛한옥" } }), true);
  assert.equal(isStoredPlanning({ places: "장소가 아니다" }), false);
  assert.equal(isStoredPlanning(null), false);
});

test("옛 판이 적어 둔 모르는 칸은 읽기를 막지 않는다", () => {
  // v1·v2 에는 아무도 안 쓰던 `done` 칸이 있었다. 그런 칸이 있어도 여행은 읽힌다.
  const 읽음 = parseStoredTripData(적힌_글({ tripsByGroup: { ours: [여행()] }, done: ["charger", 3, null] }));

  assert.equal(읽음?.tripsByGroup.ours.length, 1);
});

test("여행 뼈대가 맞는지 본다", () => {
  assert.equal(isStoredTrip(여행()), true);
  assert.equal(isStoredTrip({ ...여행(), tone: "0" }), false);
  assert.equal(isStoredTrip(undefined), false);
});

test("웹에서는 아직 못 올린 사진을 적어 두지 않는다", () => {
  const 사진 = (id: string, uri?: string) => ({ id, color: "#fff", date: "22일(화)", caption: "", ...(uri ? { uri } : {}) });
  const 기록 = {
    ours: [여행({ planning: { memories: { photos: [사진("p1", "data:image/jpeg;base64,x"), 사진("p2")], diaries: [] } } })],
  };

  const 웹 = storableTrips(기록, true);
  assert.deepEqual(웹.ours[0].planning?.memories?.photos.map((photo) => photo.id), ["p2"]);
  // 폰은 문서 폴더에 사본이 있어 그대로 적는다.
  const 폰 = storableTrips(기록, false);
  assert.deepEqual(폰.ours[0].planning?.memories?.photos.map((photo) => photo.id), ["p1", "p2"]);
});

test("올릴 사진이 없으면 웹에서도 여행을 그대로 둔다", () => {
  const 그대로 = 여행({ planning: { expenses: [] } });
  const 웹 = storableTrips({ ours: [그대로] }, true);

  assert.equal(웹.ours[0], 그대로);
});

// ---------------------------------------------------------------------------
// v1(날짜 이름표) → v2(날짜 키)
// ---------------------------------------------------------------------------

/** 이름표로 적혀 있던 옛 여행 한 건. 2026-09-22 ~ 24 라 칸은 22·23·24일이다. */
const 옛_여행 = () => 여행({
  planning: {
    schedule: [
      { id: "s1", time: "화 · 12:30", date: "22일(화)", title: "점심", note: "", mapUrl: "" },
      { id: "s2", time: "09:00", date: "", title: "날짜 없음", note: "", mapUrl: "" },
      { id: "s3", time: "목 · 08:00", date: "30일(수)", title: "기간 밖", note: "", mapUrl: "" },
    ],
    reservations: [{
      id: "r1", name: "소나기식당", date: "23일(수)", time: "19:00", people: "2명",
      status: "예약 확정" as const, place: "완산", showInSchedule: true,
    }],
    transportations: [{
      id: "t1", owner: "하늘", direction: "가는 편" as const, method: "KTX" as const, date: "24일(목)",
      departure: "대전", departureTime: "08:10", arrival: "전주", arrivalTime: "09:36",
      status: "예매 완료" as const, showInSchedule: true,
    }],
    expenses: [
      { id: "e1", day: "2일차", title: "점심", amount: 18000, category: "식비" as const, payer: "하늘", memo: "" },
      { id: "e2", day: "떠나기 전날", title: "짐 부치기", amount: 3000, category: "기타" as const, payer: "여울", memo: "" },
      { id: "e3", day: "", title: "미정", amount: 1000, category: "기타" as const, payer: "하늘", memo: "" },
    ],
    memories: {
      photos: [
        { id: "p1", color: "#fff", date: "9월 24일", caption: "마지막 아침" },
        { id: "p2", color: "#fff", date: "날짜 미정", caption: "언제였더라" },
        { id: "p3", color: "#fff", date: "1일차", caption: "도착" },
      ],
      diaries: [],
    },
  },
});

test("v1 의 날짜 이름표를 그 여행의 날짜 키로 옮긴다", () => {
  const 옮김 = migrateTripDaysToKeys(옛_여행());
  const plan = 옮김.planning!;

  assert.deepEqual(plan.schedule?.map((item) => item.date), ["2026-09-22", "", ""]);
  assert.deepEqual(plan.reservations?.map((item) => item.date), ["2026-09-23"]);
  assert.deepEqual(plan.transportations?.map((item) => item.date), ["2026-09-24"]);
  // 「2일차」는 둘째 칸, 「9월 24일」은 일 숫자로 찾아 셋째 칸이다.
  assert.deepEqual(plan.expenses?.map((item) => item.day), ["2026-09-23", "", ""]);
  assert.deepEqual(plan.memories?.photos.map((photo) => photo.date), ["2026-09-24", "날짜 미정", "2026-09-22"]);
});

test("못 찾는 이름표는 날짜 미정이 되고 항목은 그대로 남는다", () => {
  const plan = migrateTripDaysToKeys(옛_여행()).planning!;

  // 날짜 하나를 못 읽었다고 적어 둔 지출·사진·일정을 버리지 않는다.
  assert.deepEqual(plan.schedule?.map((item) => item.title), ["점심", "날짜 없음", "기간 밖"]);
  assert.deepEqual(plan.expenses?.map((item) => item.title), ["점심", "짐 부치기", "미정"]);
  assert.deepEqual(plan.memories?.photos.map((photo) => photo.id), ["p1", "p2", "p3"]);
  // 기간 밖 이름표는 빈 값(날짜 미정)으로 내린다. 사진만 「날짜 미정」이라는 글을 쓴다.
  assert.equal(plan.schedule?.[2].date, "");
  assert.equal(plan.expenses?.[1].day, "");
});

test("이미 날짜 키로 적힌 것은 건드리지 않는다", () => {
  const 이미_키 = 여행({
    planning: { expenses: [{ id: "e1", day: "2026-09-23", title: "점심", amount: 100, category: "식비", payer: "하늘", memo: "" }] },
  });

  assert.equal(migrateTripDaysToKeys(이미_키).planning?.expenses?.[0].day, "2026-09-23");
});

/** 열쇠 하나짜리 가짜 저장소. `AsyncStorage` 가운데 `readTripData` 가 쓰는 것만 흉내 낸다. */
const 가짜_저장소 = (처음: Record<string, string> = {}) => {
  const 칸 = new Map(Object.entries(처음));
  return {
    칸,
    getItem: async (key: string) => 칸.get(key) ?? null,
    setItem: async (key: string, value: string) => void 칸.set(key, value),
    removeItem: async (key: string) => void 칸.delete(key),
    getAllKeys: async () => [...칸.keys()],
  };
};

test("v1 을 읽으면 사본을 남기고 여행별로 옮겨 적은 뒤 v1 을 지운다", async () => {
  const 원본 = 적힌_글({ tripsByGroup: { ours: [옛_여행()] }, done: ["charger"] });
  const 저장소 = 가짜_저장소({ [TRIP_DATA_KEY_V1]: 원본 });

  const 읽음 = await readTripData(저장소);

  assert.equal(읽음?.tripsByGroup.ours[0].planning?.expenses?.[0].day, "2026-09-23");
  // 되돌릴 자리: 옮기기 전 원본이 글자 그대로 남는다.
  assert.equal(저장소.칸.get(TRIP_DATA_BACKUP_KEY), 원본);
  assert.equal(저장소.칸.has(TRIP_DATA_KEY_V1), false);
  // 여행은 제 열쇠에, 목록에는 그 열쇠 이름만 적힌다.
  const 여행_열쇠 = [...저장소.칸.keys()].filter((key) => key.startsWith(TRIP_ENTRY_PREFIX));
  assert.equal(여행_열쇠.length, 1);
  assert.ok(저장소.칸.get(여행_열쇠[0])?.includes("2026-09-23"));
  assert.ok(저장소.칸.get(TRIP_INDEX_KEY)?.includes(여행_열쇠[0].slice(TRIP_ENTRY_PREFIX.length)));
});

test("다음에 제대로 읽히면 되돌리기용 사본을 지운다", async () => {
  const 저장소 = 가짜_저장소({ [TRIP_DATA_KEY_V1]: 적힌_글({ tripsByGroup: { ours: [옛_여행()] } }) });
  await readTripData(저장소);
  const 옮긴_글 = 저장소.칸.get(TRIP_INDEX_KEY)!;

  const 다시 = await readTripData(저장소);

  assert.equal(저장소.칸.has(TRIP_DATA_BACKUP_KEY), false);
  // 두 번째로 읽어도 날짜가 또 바뀌지 않는다.
  assert.equal(저장소.칸.get(TRIP_INDEX_KEY), 옮긴_글);
  assert.deepEqual(
    다시?.tripsByGroup.ours[0].planning?.expenses?.map((item) => item.day),
    ["2026-09-23", "", ""],
  );
});

test("v1 을 읽을 수 없으면 지우지도 옮기지도 않는다", async () => {
  const 저장소 = 가짜_저장소({ [TRIP_DATA_KEY_V1]: "{" });

  assert.equal(await readTripData(저장소), null);
  assert.equal(저장소.칸.get(TRIP_DATA_KEY_V1), "{");
  assert.equal(저장소.칸.has(TRIP_DATA_BACKUP_KEY), false);
});

test("적어 둔 것이 아무것도 없으면 null 이다", async () => {
  assert.equal(await readTripData(가짜_저장소()), null);
});

test("v2 를 읽으면 여행별로 옮겨 적고 내용은 그대로다", async () => {
  const 옮김 = migrateTripDaysToKeys(옛_여행());
  const 저장소 = 가짜_저장소({ [TRIP_DATA_KEY]: tripDataText({ ours: [옮김] }) });

  const 읽음 = await readTripData(저장소);

  assert.deepEqual(읽음?.tripsByGroup.ours[0], 옮김);
});

// ---------------------------------------------------------------------------
// 여행별 열쇠 (v3)
// ---------------------------------------------------------------------------

const 한_건 = (over: Partial<Trip> = {}): Trip => ({
  id: "t1",
  name: "가을 제주",
  date: "2026-09-23",
  note: "",
  tone: 0,
  mark: "✈",
  region: "제주",
  start: "2026-09-23",
  end: "2026-09-25",
  ...over,
});

test("여행마다 제 열쇠에 적고 목록에는 차례만 적는다", async () => {
  const 저장소 = 가짜_저장소();

  await writeTripData(저장소, { ours: [한_건(), 한_건({ id: "t2", name: "겨울 부산" })] });

  assert.deepEqual(JSON.parse(저장소.칸.get(TRIP_INDEX_KEY)!), {
    version: 3,
    groups: { ours: ["t:t1", "t:t2"] },
  });
  assert.ok(저장소.칸.get(`${TRIP_ENTRY_PREFIX}t:t1`)?.includes("가을 제주"));
  assert.ok(저장소.칸.get(`${TRIP_ENTRY_PREFIX}t:t2`)?.includes("겨울 부산"));
});

test("적고 다시 읽으면 여행이 그대로다", async () => {
  const 저장소 = 가짜_저장소();
  const 예시 = 한_건({ name: "예시" });
  delete 예시.id;
  const 것들 = { ours: [한_건()], theirs: [예시] };

  await writeTripData(저장소, 것들);
  const 읽음 = await readTripData(저장소);

  assert.deepEqual(읽음?.tripsByGroup, 것들);
});

test("없어진 여행의 열쇠는 지운다", async () => {
  const 저장소 = 가짜_저장소();
  const 적힌_것 = await writeTripData(저장소, { ours: [한_건(), 한_건({ id: "t2" })] });

  await writeTripData(저장소, { ours: [한_건()] }, 적힌_것);

  assert.equal(저장소.칸.has(`${TRIP_ENTRY_PREFIX}t:t2`), false);
  assert.equal(저장소.칸.has(`${TRIP_ENTRY_PREFIX}t:t1`), true);
});

test("안 바뀐 여행은 다시 적지 않는다", async () => {
  const 저장소 = 가짜_저장소();
  const 적힌_것 = await writeTripData(저장소, { ours: [한_건(), 한_건({ id: "t2" })] });
  const 적은_열쇠: string[] = [];
  const 세는_저장소 = {
    ...저장소,
    setItem: async (key: string, value: string) => {
      적은_열쇠.push(key);
      저장소.칸.set(key, value);
    },
  };

  await writeTripData(세는_저장소, { ours: [한_건(), 한_건({ id: "t2", note: "고침" })] }, 적힌_것);

  // 목록은 늘 다시 적고, 여행은 바뀐 한 건만.
  assert.deepEqual(적은_열쇠, [`${TRIP_ENTRY_PREFIX}t:t2`, TRIP_INDEX_KEY]);
});

test("여행 한 건이 깨져도 나머지는 살린다", async () => {
  const 저장소 = 가짜_저장소();
  await writeTripData(저장소, { ours: [한_건(), 한_건({ id: "t2" })] });
  저장소.칸.set(`${TRIP_ENTRY_PREFIX}t:t1`, "{");

  const 읽음 = await readTripData(저장소);

  assert.equal(읽음?.tripsByGroup.ours.length, 1);
  assert.equal(읽음?.tripsByGroup.ours[0].id, "t2");
});

test("v2 를 옮길 때 원본을 사본으로 남기고 다음에 제대로 읽히면 지운다", async () => {
  const 원본 = tripDataText({ ours: [한_건()] });
  const 저장소 = 가짜_저장소({ [TRIP_DATA_KEY]: 원본 });

  await readTripData(저장소);
  assert.equal(저장소.칸.get(TRIP_DATA_BACKUP_V2), 원본);
  assert.equal(저장소.칸.has(TRIP_DATA_KEY), false);

  await readTripData(저장소);
  assert.equal(저장소.칸.has(TRIP_DATA_BACKUP_V2), false);
});

test("로그아웃이 지울 열쇠에 여행 하나하나가 들어간다", async () => {
  const 저장소 = 가짜_저장소();
  await writeTripData(저장소, { ours: [한_건()] });

  const 열쇠들 = await tripDataKeys(저장소);

  assert.ok(열쇠들.includes(TRIP_INDEX_KEY));
  assert.ok(열쇠들.includes(`${TRIP_ENTRY_PREFIX}t:t1`));
});
