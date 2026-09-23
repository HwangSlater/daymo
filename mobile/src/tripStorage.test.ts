import assert from "node:assert/strict";
import { test } from "node:test";

import { isStoredPlanning, isStoredTrip, parseStoredTripData, storableTrips } from "./tripStorage.ts";
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
  assert.deepEqual(읽음?.done, ["charger"]);
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

test("적어 둔 준비물 완료가 없으면 예시 여행의 기본값으로 읽는다", () => {
  const 읽음 = parseStoredTripData(적힌_글({ tripsByGroup: { ours: [여행()] } }));

  assert.deepEqual(읽음?.done, ["charger", "toiletries"]);
});

test("완료 목록에서 글자가 아닌 것은 걸러 낸다", () => {
  const 읽음 = parseStoredTripData(적힌_글({ tripsByGroup: { ours: [여행()] }, done: ["charger", 3, null] }));

  assert.deepEqual(읽음?.done, ["charger"]);
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
