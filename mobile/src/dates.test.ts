import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTripDates,
  dateKey,
  dateLabel,
  dateLabelOf,
  dateRangeLabel,
  dayKeyOf,
  dayLabel,
  dayLabelOf,
  dayNumberOf,
  daysSince,
  formatTripPeriod,
  matchTripDay,
  shiftDateKey,
  todayAmong,
  todayKey,
  tripDateKeys,
  tripIsOver,
  validDateKey,
  weekdayOf,
  weekdayOfKey,
  시각을_분으로,
  두자리,
} from "./dates.ts";

test("날짜 키는 기기 시간대의 연·월·일을 두 자리로 적는다", () => {
  assert.equal(dateKey(new Date(2026, 8, 3, 23, 30)), "2026-09-03");
  assert.equal(dayKeyOf(2026, 9, 3), "2026-09-03");
  assert.equal(두자리(7), "07");
  assert.equal(todayKey(new Date(2026, 0, 1)), "2026-01-01");
});

test("날짜 키를 앞뒤로 옮겨도 달과 해를 넘긴다", () => {
  assert.equal(shiftDateKey("2026-09-30", 1), "2026-10-01");
  assert.equal(shiftDateKey("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDateKey("2024-02-28", 1), "2024-02-29");
});

test("여행 기간의 날짜 키를 차례대로 준다", () => {
  assert.deepEqual(tripDateKeys("2026-09-22", "2026-09-24"), ["2026-09-22", "2026-09-23", "2026-09-24"]);
  assert.deepEqual(tripDateKeys("2026-09-24", "2026-09-22"), []);
  assert.deepEqual(tripDateKeys("2026-9-22", "2026-09-24"), []);
  assert.deepEqual(tripDateKeys(undefined, "2026-09-24"), []);
});

test("날짜 이름표는 키로 만들든 Date 로 만들든 같다", () => {
  assert.equal(dayLabelOf("2026-09-23"), "23일(수)");
  assert.equal(dateLabelOf("2026-10-01"), "10월 1일");
  assert.equal(dayLabel(new Date(2026, 8, 23)), "23일(수)");
  assert.equal(dateLabel(new Date(2026, 9, 1)), "10월 1일");
  assert.equal(weekdayOfKey("2026-09-23"), "수");
});

test("날짜 선택지에서 요일과 일 숫자를 꺼낸다", () => {
  assert.equal(weekdayOf("23일(수)"), "수");
  assert.equal(weekdayOf("날짜 미정"), "날");
  assert.equal(dayNumberOf("23일(수)"), "23");
  assert.equal(dayNumberOf("날짜 미정"), "날짜 미정");
});

test("여행 카드의 기간은 같은 달이면 달을 한 번만 적는다", () => {
  assert.equal(dateRangeLabel("2026-09-12", "2026-09-14"), "9월 12일 — 14일");
  assert.equal(dateRangeLabel("2026-09-30", "2026-10-02"), "9월 30일 — 10월 2일");
});

test("여행 기간의 Date 목록은 시작이 끝보다 늦으면 비어 있다", () => {
  const dates = buildTripDates("2026-09-22", "2026-09-24");
  assert.equal(dates.length, 3);
  assert.equal(dateKey(dates[2]), "2026-09-24");
  assert.deepEqual(buildTripDates("2026-09-24", "2026-09-22"), []);
  assert.deepEqual(buildTripDates(undefined, undefined), []);
});

test("달력에 없는 날짜 키는 거른다", () => {
  assert.equal(validDateKey("2026-09-23"), true);
  assert.equal(validDateKey("2026-02-30"), false);
  assert.equal(validDateKey("2026-9-23"), false);
  assert.equal(validDateKey(""), false);
});

test("기간 한 줄은 읽을 수 없으면 고쳐 달라고 한다", () => {
  assert.equal(formatTripPeriod("2026-09-22", "2026-09-24"), "9월 22일 — 9월 24일");
  assert.equal(formatTripPeriod("", "2026-09-24"), "기간을 확인해 주세요");
});

test("자유롭게 적은 날짜를 여행 날짜 칸에 맞춘다", () => {
  const 선택지 = ["22일(화)", "23일(수)", "24일(목)"];
  assert.equal(matchTripDay("23일(수)", 선택지), "23일(수)");
  assert.equal(matchTripDay("2일차", 선택지), "23일(수)");
  assert.equal(matchTripDay("9월 24일", 선택지), "24일(목)");
  // 어느 쪽도 아니면 적힌 그대로 둔다. 적은 말을 말없이 버리지 않는다.
  assert.equal(matchTripDay("떠나기 전날", 선택지), "떠나기 전날");
  assert.equal(matchTripDay("9일차", 선택지), "9일차");
  assert.equal(matchTripDay("  ", 선택지), "");
});

test("여행 날짜 가운데 오늘이 있으면 그 이름표를 준다", () => {
  const dates = buildTripDates("2026-09-22", "2026-09-24");
  assert.equal(todayAmong(dates, new Date(2026, 8, 23, 9)), "23일(수)");
  assert.equal(todayAmong(dates, new Date(2026, 8, 30)), "");
  assert.equal(todayAmong([], new Date(2026, 8, 23)), "");
});

test("마지막 날이 지나야 지난 여행이다", () => {
  const dates = buildTripDates("2026-09-22", "2026-09-24");
  assert.equal(tripIsOver(dates, new Date(2026, 8, 24, 23)), false);
  assert.equal(tripIsOver(dates, new Date(2026, 8, 25)), true);
  assert.equal(tripIsOver([], new Date(2026, 8, 25)), false);
});

test("함께한 날은 시작한 날을 1일째로 센다", () => {
  assert.equal(daysSince("2026-09-23", "2026-09-23"), 1);
  assert.equal(daysSince("2026. 09. 20", "2026-09-23"), 4);
  // 앞으로의 날은 세지 않는다.
  assert.equal(daysSince("2026-09-24", "2026-09-23"), null);
  assert.equal(daysSince("", "2026-09-23"), null);
  assert.equal(daysSince("2026-13-01", "2026-09-23"), null);
});

test("시각을 자정부터의 분으로 바꾼다", () => {
  assert.equal(시각을_분으로("09:30"), 570);
  assert.equal(시각을_분으로(" 9:05 "), 545);
  assert.equal(시각을_분으로("24:00"), null);
  assert.equal(시각을_분으로("09:60"), null);
  assert.equal(시각을_분으로("아침"), null);
});
