import assert from "node:assert/strict";
import { test } from "node:test";

import { bodyKey, hasWork, mergeListOnOpen, planListSync, tripDateKeys, type Confirmed } from "./listSync.ts";
import { scheduleCodec, stayCodec, type AppScheduleItem, type AppStay } from "./scheduleSync.ts";

const A = "11111111-1111-4111-8111-111111111111";
const P = "99999999-9999-4999-8999-999999999999";
// 2026-10-01 은 목요일이다.
const dates = tripDateKeys("2026-10-01", "2026-10-03");

const item = (extra: Partial<AppScheduleItem> = {}): AppScheduleItem => ({
  id: A,
  time: "금 · 12:30",
  date: "2일(금)",
  title: "소나기식당에서 점심",
  note: "식사 · 전주",
  mapUrl: "",
  ...extra,
});

test("여행 기간의 날짜 키를 만든다", () => {
  assert.deepEqual(dates, ["2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.deepEqual(tripDateKeys("2026-10-03", "2026-10-01"), []);
});

test("일정 글자를 서버의 날짜와 시각으로 바꾼다", () => {
  const codec = scheduleCodec(dates, new Set([P]));

  assert.deepEqual(codec.toBody(item({ placeId: P, mapUrl: "javascript:x" })), {
    date: "2026-10-02",
    time: "12:30",
    title: "소나기식당에서 점심",
    type: "meal",
    note: "식사 · 전주",
    tripPlaceId: P,
    mapUrl: null,
  });
});

test("시간 미정이거나 날짜가 기간 밖이면 비워 보낸다", () => {
  const codec = scheduleCodec(dates, new Set());

  assert.equal(codec.toBody(item({ time: "금 · 시간 미정" })).time, null);
  const outside = codec.toBody(item({ date: "9일(금)" }));
  assert.equal(outside.date, null);
  assert.equal(outside.time, null);
});

test("아직 서버에 없는 장소는 연결을 비워 보내고, 올라가면 연결해 다시 보낸다", () => {
  const before = scheduleCodec(dates, new Set()).toBody(item({ placeId: P }));
  const after = scheduleCodec(dates, new Set([P])).toBody(item({ placeId: P }));

  assert.equal(before.tripPlaceId, null);
  assert.equal(after.tripPlaceId, P);
  assert.notEqual(bodyKey(before), bodyKey(after));
});

test("서버 일정은 화면 글자로 돌아오고 다시 보내도 같은 모습이다", () => {
  const codec = scheduleCodec(dates, new Set([P]));
  const local = codec.fromServer({
    id: A, date: "2026-10-03", time: null, title: "체크아웃", type: "other", note: null, tripPlaceId: P, mapUrl: null, version: 3,
  });

  assert.deepEqual(local, { id: A, date: "3일(토)", time: "토 · 시간 미정", title: "체크아웃", note: "", mapUrl: "", placeId: P });
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(codec.toBody(local)), version: 3 }]]);
  assert.equal(hasWork(planListSync([local], codec, confirmed)), false);
});

test("숙소·예약·교통편에서 만든 줄과 id 없는 줄은 올리지 않고, 열 때도 남긴다", () => {
  const codec = scheduleCodec(dates, new Set());
  const derived = item({ id: undefined, stayId: "primary-stay", title: "달빛한옥 체크인" });
  const legacy = item({ id: undefined });

  assert.equal(hasWork(planListSync([derived, legacy], codec, new Map())), false);
  assert.deepEqual(mergeListOnOpen([derived], [], new Set(), codec), [derived]);
});

// ---------------------------------------------------------------------------

const stay = (extra: Partial<AppStay> = {}): AppStay => ({
  id: A,
  name: "달빛한옥",
  checkin: "10월 1일 15:00",
  checkout: "10월 3일 11:00",
  address: "전주 완산구 은행로 12",
  placeId: P,
  showInSchedule: true,
  ...extra,
});

test("숙소 체크인·체크아웃 글자를 공간 시간대의 날짜 시각으로 바꾼다", () => {
  const codec = stayCodec(dates, new Set([P]), () => undefined);

  assert.deepEqual(codec.toBody(stay()), {
    tripPlaceId: P,
    checkInAt: "2026-10-01T15:00",
    checkOutAt: "2026-10-03T11:00",
    showInSchedule: true,
  });
  assert.equal(codec.toBody(stay({ checkin: "" })).checkInAt, null);
});

test("서버 숙소는 장소에서 이름을 가져오고, 장소를 못 찾으면 기기 이름을 살린다", () => {
  const row = { id: A, tripPlaceId: P, checkInAt: "2026-10-01T15:00", checkOutAt: null, note: null, showInSchedule: false, version: 1 };
  const withPlace = stayCodec(dates, new Set([P]), () => ({ name: "서버 장소 이름", address: "서버 주소" }));
  const withoutPlace = stayCodec(dates, new Set([P]), () => undefined);

  assert.deepEqual(withPlace.fromServer(row), {
    id: A, name: "서버 장소 이름", address: "서버 주소", checkin: "10월 1일 15:00", checkout: "", placeId: P, showInSchedule: false,
  });
  const merged = mergeListOnOpen([stay()], [row], new Set(), withoutPlace);
  assert.equal(merged[0].name, "달빛한옥");
  assert.equal(merged[0].checkin, "10월 1일 15:00");
});

test("이름 없는 숙소(대표 숙소 해제)는 서버에 두지 않는다", () => {
  const codec = stayCodec(dates, new Set(), () => undefined);
  const confirmed = new Map<string, Confirmed>([[A, { key: "x", version: 2 }]]);

  assert.deepEqual(planListSync([], codec, confirmed).deletes, [{ id: A, version: 2 }]);
  assert.equal(codec.syncable(stay({ name: "" })), false);
});

test("올릴 수 없는 줄이어도 목록에 있으면 서버에서 지우지 않고, 서버에 같은 id 가 있으면 두 번 보이지 않는다", () => {
  const codec = {
    syncable: (item: { id: string; ok: boolean }) => item.ok,
    idOf: (item: { id: string; ok: boolean }) => item.id,
    toBody: (item: { id: string; ok: boolean }) => ({ id: item.id }),
    fromServer: (row: { id: string; version: number }) => ({ id: row.id, ok: false }),
  };
  const confirmed = new Map<string, Confirmed>([[A, { key: "x", version: 1 }]]);

  assert.deepEqual(planListSync([{ id: A, ok: false }], codec, confirmed).deletes, []);
  assert.equal(mergeListOnOpen([{ id: A, ok: false }], [{ id: A, version: 1 }], new Set(), codec).length, 1);
});
