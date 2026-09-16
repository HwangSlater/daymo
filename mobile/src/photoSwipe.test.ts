import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SWIPE_WAKE,
  swipeAxis,
  swipeCloses,
  swipeStep,
  swipeStepDistance,
} from "./photoSwipe.ts";

test("조금 움직인 손가락에는 축을 붙이지 않는다", () => {
  assert.equal(swipeAxis(0, 0), null);
  assert.equal(swipeAxis(SWIPE_WAKE - 1, 4), null);
  assert.equal(swipeAxis(SWIPE_WAKE, 0), "가로");
});

test("더 많이 간 쪽으로 축을 잠근다", () => {
  assert.equal(swipeAxis(60, 10), "가로");
  assert.equal(swipeAxis(-60, 10), "가로");
  assert.equal(swipeAxis(10, 60), "세로");
  assert.equal(swipeAxis(10, -60), "세로");
});

test("딱 대각선이면 아직 정하지 않는다", () => {
  // 넘기려던 건지 닫으려던 건지 알 수 없는 손가락에 아무 축이나 붙이면, 같은 동작이
  // 어떤 날은 넘기고 어떤 날은 닫는다.
  assert.equal(swipeAxis(40, 40), null);
  assert.equal(swipeAxis(40, 38), null);
  assert.equal(swipeAxis(48, 38), "가로");
});

test("넘길 거리는 화면 폭을 따라가되 너무 멀거나 가깝지 않다", () => {
  assert.equal(swipeStepDistance(320), 80);
  assert.equal(swipeStepDistance(1200), 96);
  assert.equal(swipeStepDistance(120), 48);
});

test("왼쪽으로 밀면 다음 사진, 오른쪽으로 밀면 앞 사진", () => {
  assert.equal(swipeStep(-120, 0, 390), 1);
  assert.equal(swipeStep(120, 0, 390), -1);
  assert.equal(swipeStep(-30, 0, 390), 0);
});

test("짧게 튕겨도 넘어간다", () => {
  assert.equal(swipeStep(-30, -0.6, 390), 1);
  assert.equal(swipeStep(30, 0.6, 390), -1);
  // 거의 제자리에서 떨린 것은 넘기지 않는다.
  assert.equal(swipeStep(-6, -1.5, 390), 0);
  // 천천히 조금만 민 것도 제자리다.
  assert.equal(swipeStep(-30, -0.1, 390), 0);
});

test("멀리 끌었으면 손을 떼며 되돌린 방향에 속지 않는다", () => {
  assert.equal(swipeStep(-140, 0.9, 390), 1);
});

test("아래로 충분히 끌었을 때만 닫는다", () => {
  assert.equal(swipeCloses(120, 0), true);
  assert.equal(swipeCloses(60, 1.2), true);
  assert.equal(swipeCloses(60, 0.2), false);
  // 위로 끄는 것은 닫지 않는다.
  assert.equal(swipeCloses(-200, -2), false);
});
