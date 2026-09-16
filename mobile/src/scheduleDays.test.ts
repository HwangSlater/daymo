import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALL_DAYS,
  UNDATED_DAY,
  defaultScheduleDay,
  groupScheduleByDay,
  highlightedGroupIndex,
  scheduleDayCounts,
  scheduleOfDay,
} from "./scheduleDays.ts";

const days = ["28일(월)", "29일(화)", "30일(수)"];

const items = [
  { date: "28일(월)", title: "KTX 서울 → 강릉" },
  { date: "28일(월)", title: "안목해변" },
  { date: "30일(수)", title: "카페" },
  { title: "언제 갈지 못 정한 곳" },
];

test("여행의 모든 날이 개수와 함께 나온다", () => {
  assert.deepEqual(scheduleDayCounts(items, days), [
    { day: "28일(월)", count: 2 },
    // 일정이 없는 날도 고를 수 있다.
    { day: "29일(화)", count: 0 },
    { day: "30일(수)", count: 1 },
    { day: UNDATED_DAY, count: 1 },
  ]);
});

test("날짜를 안 적은 줄이 없으면 미정 칸도 없다", () => {
  assert.deepEqual(scheduleDayCounts([{ date: "29일(화)" }], days), [
    { day: "28일(월)", count: 0 },
    { day: "29일(화)", count: 1 },
    { day: "30일(수)", count: 0 },
  ]);
});

test("여행 기간 밖의 날짜는 뒤에 붙고 미정이 맨 끝이다", () => {
  assert.deepEqual(scheduleDayCounts([{}, { date: "3일(금)" }], days), [
    { day: "28일(월)", count: 0 },
    { day: "29일(화)", count: 0 },
    { day: "30일(수)", count: 0 },
    { day: "3일(금)", count: 1 },
    { day: UNDATED_DAY, count: 1 },
  ]);
});

test("고른 날의 일정만 남는다", () => {
  assert.deepEqual(
    scheduleOfDay(items, "28일(월)").map((item) => item.title),
    ["KTX 서울 → 강릉", "안목해변"],
  );
  assert.deepEqual(scheduleOfDay(items, "29일(화)"), []);
  assert.deepEqual(
    scheduleOfDay(items, UNDATED_DAY).map((item) => item.title),
    ["언제 갈지 못 정한 곳"],
  );
  assert.equal(scheduleOfDay(items, ALL_DAYS).length, items.length);
});

test("날짜별로 묶는다", () => {
  assert.deepEqual(
    groupScheduleByDay(items).map((group) => [group.date, group.items.length]),
    [["28일(월)", 2], ["30일(수)", 1], [UNDATED_DAY, 1]],
  );
  // 고른 날만 남기면 묶음도 하나다.
  assert.deepEqual(
    groupScheduleByDay(scheduleOfDay(items, "30일(수)")).map((group) => group.date),
    ["30일(수)"],
  );
});

test("여행 중이면 오늘이 기본, 아니면 전체다", () => {
  assert.equal(defaultScheduleDay(days, "29일(화)"), "29일(화)");
  assert.equal(defaultScheduleDay(days, ""), ALL_DAYS);
  // 여행 기간이 바뀌어 오늘이 목록에서 빠진 경우다.
  assert.equal(defaultScheduleDay(days, "5일(일)"), ALL_DAYS);
});

test("요약 카드는 오늘 묶음부터 보여 준다", () => {
  const groups = [{ date: "28일(월)" }, { date: "30일(수)" }];

  assert.equal(highlightedGroupIndex(groups, days, "28일(월)"), 0);
  // 오늘은 일정이 없다. 다음으로 오는 날을 잡는다.
  assert.equal(highlightedGroupIndex(groups, days, "29일(화)"), 1);
  // 여행 중이 아니면 지금처럼 가장 빠른 날이다.
  assert.equal(highlightedGroupIndex(groups, days, ""), 0);
  // 남은 날이 없으면 가장 빠른 날로 돌아간다.
  assert.equal(highlightedGroupIndex([{ date: "28일(월)" }], days, "30일(수)"), 0);
  assert.equal(highlightedGroupIndex([], days, "29일(화)"), -1);
});
