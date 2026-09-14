import assert from "node:assert/strict";
import { test } from "node:test";

import { maskClockTime, settleClockTime } from "./clock.ts";

test("치는 동안은 네 자리가 차기 전까지 그대로 둔다", () => {
  assert.equal(maskClockTime(""), "");
  assert.equal(maskClockTime("0"), "0");
  assert.equal(maskClockTime("09"), "09");
  // 세 자리에서 콜론을 넣으면 글자가 손가락 아래에서 튀어 지우기가 어려워진다.
  assert.equal(maskClockTime("093"), "093");
});

test("네 자리가 차면 콜론을 넣는다", () => {
  assert.equal(maskClockTime("0930"), "09:30");
  assert.equal(maskClockTime("1945"), "19:45");
});

test("시와 분을 넘겨 적으면 눌러 담는다", () => {
  assert.equal(maskClockTime("2599"), "23:59");
  assert.equal(maskClockTime("9999"), "23:59");
  assert.equal(maskClockTime("0075"), "00:59");
});

test("숫자가 아닌 글자는 버리고 다섯 자리째부터는 무시한다", () => {
  assert.equal(maskClockTime("09:30"), "09:30");
  assert.equal(maskClockTime("093012"), "09:30");
  assert.equal(maskClockTime("오전 9시"), "9");
});

test("손을 떼면 덜 친 자리를 사람이 읽는 대로 채운다", () => {
  assert.equal(settleClockTime("9"), "09:00");
  assert.equal(settleClockTime("19"), "19:00");
  assert.equal(settleClockTime("930"), "09:30");
  assert.equal(settleClockTime("09:30"), "09:30");
  assert.equal(settleClockTime("오전 9시 30분"), "09:30");
});

test("손을 떼도 넘겨 적은 값은 눌러 담는다", () => {
  assert.equal(settleClockTime("99"), "23:00");
  assert.equal(settleClockTime("2599"), "23:59");
});

test("비워 둔 시간은 비운 채로 둔다", () => {
  assert.equal(settleClockTime(""), "");
  assert.equal(settleClockTime("   "), "");
  assert.equal(settleClockTime("시간 미정"), "");
});
