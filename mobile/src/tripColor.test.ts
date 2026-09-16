import assert from "node:assert/strict";
import { test } from "node:test";

import { TRIP_TONE_COUNT, toneOfTripId } from "./tripColor.ts";

test("같은 여행은 언제 물어도 같은 색이다", () => {
  const id = "3f2a6c5e-8d71-4b0a-9c3e-1a2b3c4d5e6f";

  assert.equal(toneOfTripId(id), toneOfTripId(id));
});

test("여행마다 색이 다르게 갈린다", () => {
  const 색들 = [
    "3f2a6c5e-8d71-4b0a-9c3e-1a2b3c4d5e6f",
    "9b1d4e77-2c33-4a15-8f60-77c0a9d1e222",
    "0a5c8b12-91ee-4d33-a77b-5c2e9f014455",
  ].map((id) => toneOfTripId(id));

  assert.equal(new Set(색들).size > 1, true);
});

test("색은 팔레트 안에만 있다", () => {
  for (let 번호 = 0; 번호 < 500; 번호 += 1) {
    const tone = toneOfTripId(`여행-${번호}`);
    assert.equal(Number.isInteger(tone), true);
    assert.equal(tone >= 0 && tone < TRIP_TONE_COUNT, true);
  }
});

test("여섯 색이 고루 나온다", () => {
  // 한 색만 계속 나오면 목록이 온통 같은 색이 된다. 팔레트 자리마다 적어도 한 번은 나와야 한다.
  const 셈 = new Array(TRIP_TONE_COUNT).fill(0);
  for (let 번호 = 0; 번호 < 600; 번호 += 1) {
    셈[toneOfTripId(`3f2a6c5e-8d71-4b0a-9c3e-${String(번호).padStart(12, "0")}`)] += 1;
  }

  assert.equal(셈.every((수) => 수 > 30), true, `치우쳤다: ${셈.join(",")}`);
});

test("id 가 없으면 첫 색이다", () => {
  assert.equal(toneOfTripId(""), 0);
});
