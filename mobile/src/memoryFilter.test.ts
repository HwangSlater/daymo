import assert from "node:assert/strict";
import { test } from "node:test";

import { memoryDayCount, memoryFilterChips, memoryHeadCount, MEMORY_FILTERS } from "./memoryFilter.ts";

test("칩이 개수를 들고 있어서 위에서 다시 셀 것이 없다", () => {
  const 칩 = memoryFilterChips(8, 2);

  assert.deepEqual(칩.map((하나) => 하나.label), ["전체 10", "사진 8", "카드 2"]);
  assert.deepEqual(칩.map((하나) => 하나.key), [...MEMORY_FILTERS]);
});

test("전체는 늘 사진과 카드의 합이다", () => {
  assert.equal(memoryFilterChips(0, 0)[0].count, 0);
  assert.equal(memoryFilterChips(3, 4)[0].count, 7);
});

test("날짜 미정 사진은 하루로 세지 않는다", () => {
  const 날짜 = ["1일차", "1일차", "2일차", "날짜 미정", ""];

  assert.equal(memoryDayCount(날짜, "날짜 미정"), 2);
});

test("아직 날짜가 없으면 0일이 아니라 첫 기록이라 적는다", () => {
  assert.equal(memoryHeadCount(3), "3일의 기록");
  assert.equal(memoryHeadCount(0), "첫 기록");
});
