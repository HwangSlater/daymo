import assert from "node:assert/strict";
import { test } from "node:test";

import { CHUNK_FIRST, CHUNK_STEP, chunkGroups, countRows, nextChunk } from "./listChunks.ts";

const 묶음 = (day: string, 개수: number) => ({
  day,
  items: Array.from({ length: 개수 }, (_, 차례) => `${day}-${차례}`),
});

test("줄을 다 세고, 다 들어가면 받은 것을 그대로 돌려준다", () => {
  const 전부 = [묶음("1일", 3), 묶음("2일", 2)];
  assert.equal(countRows(전부), 5);
  assert.equal(chunkGroups(전부, 5), 전부);
  assert.equal(chunkGroups(전부, 99), 전부);
});

test("앞에서부터 자르고 차례는 그대로다", () => {
  const 전부 = [묶음("1일", 3), 묶음("2일", 3)];
  const 자른_것 = chunkGroups(전부, 4);
  // 자른 묶음도 머리에 붙은 값(날짜·그날 합계)을 그대로 들고 있어야 한다.
  assert.deepEqual(자른_것.map((하나) => 하나.day), ["1일", "2일"]);
  assert.deepEqual(자른_것[0].items, ["1일-0", "1일-1", "1일-2"]);
  assert.deepEqual(자른_것[1].items, ["2일-0"]);
});

test("한 줄도 안 남는 묶음은 머리만 남지 않고 통째로 빠진다", () => {
  const 전부 = [묶음("1일", 3), 묶음("2일", 3), 묶음("3일", 3)];
  const 자른_것 = chunkGroups(전부, 3);
  assert.equal(자른_것.length, 1);
  assert.deepEqual(자른_것[0].items, ["1일-0", "1일-1", "1일-2"]);
});

test("0 줄이나 음수를 받아도 깨지지 않는다", () => {
  const 전부 = [묶음("1일", 2)];
  assert.deepEqual(chunkGroups(전부, 0), []);
  assert.deepEqual(chunkGroups(전부, -5), []);
  assert.deepEqual(chunkGroups([], 10), []);
});

test("다음 판은 전체를 넘지 않는다", () => {
  assert.equal(nextChunk(CHUNK_FIRST, 1000), CHUNK_FIRST + CHUNK_STEP);
  assert.equal(nextChunk(980, 1000), 1000);
  assert.equal(nextChunk(1000, 1000), 1000);
  assert.equal(nextChunk(10, 1000, 5), 15);
});
