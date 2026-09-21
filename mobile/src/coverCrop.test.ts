import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COVER_FOCUS_DEFAULT,
  coverLayout,
  dragFocus,
  focusBody,
  sameFocus,
  tidyFocus,
  zoomFocus,
} from "./coverCrop.ts";

/** 홈 카드의 사진 틀. 가로로 넓다. */
const 틀 = { width: 324, height: 200 };
/** 세로 사진 한 장(3:4). 위아래가 잘리는 쪽이다. */
const 세로_사진 = { width: 810, height: 1080 };
const 가로_사진 = { width: 1440, height: 1080 };
/** 옆으로 긴 사진. 틀보다 넓어서 좌우가 잘리는 쪽이다. */
const 파노라마 = { width: 2400, height: 1000 };

test("아무것도 맞추지 않으면 가운데를 자른다", () => {
  const 자리 = coverLayout(세로_사진, 틀, COVER_FOCUS_DEFAULT);

  // 틀 너비에 맞춰 늘어나고, 남는 높이는 위아래로 반씩 잘린다.
  assert.equal(Math.round(자리.width), 324);
  assert.equal(Math.round(자리.height), 432);
  assert.equal(Math.round(자리.left), 0);
  assert.equal(Math.round(자리.top), -116);
});

test("위로 끌면 사진 아래쪽이 보이고, 끝에서는 더 안 간다", () => {
  const 올린_것 = dragFocus(COVER_FOCUS_DEFAULT, 세로_사진, 틀, 0, -80);
  assert.equal(Math.round(coverLayout(세로_사진, 틀, 올린_것).top), -196);

  // 사진 끝까지 갔으면 더 끌어도 그 자리다. 틀에 빈 자리를 내지 않는다.
  const 끝 = dragFocus(올린_것, 세로_사진, 틀, 0, -500);
  const 끝_자리 = coverLayout(세로_사진, 틀, 끝);
  assert.equal(Math.round(끝_자리.top), -232);
  assert.equal(Math.round(끝_자리.top + 끝_자리.height), 200);
  assert.deepEqual(dragFocus(끝, 세로_사진, 틀, 0, -50), 끝);
});

test("세로 사진은 좌우로는 움직이지 않는다", () => {
  // 틀 너비에 이미 딱 맞아 옆으로 남는 것이 없다.
  const 옆으로 = dragFocus(COVER_FOCUS_DEFAULT, 세로_사진, 틀, 120, 0);
  assert.equal(Math.round(coverLayout(세로_사진, 틀, 옆으로).left), 0);
  assert.equal(옆으로.x, 0.5);
});

test("옆으로 긴 사진은 좌우로 움직인다", () => {
  const 왼쪽 = dragFocus(COVER_FOCUS_DEFAULT, 파노라마, 틀, 40, 0);
  const 자리 = coverLayout(파노라마, 틀, 왼쪽);

  // 높이는 틀에 딱 맞고 너비만 남아서, 남는 쪽으로만 움직인다.
  assert.equal(Math.round(자리.height), 200);
  assert.equal(Math.round(자리.left), -38);
  assert.ok(왼쪽.x < 0.5);
  // 4:3 사진은 이 틀에서 위아래가 남는 쪽이라 좌우로는 안 움직인다.
  assert.equal(dragFocus(COVER_FOCUS_DEFAULT, 가로_사진, 틀, 40, 0).x, 0.5);
});

test("벌려서 키우면 보던 곳이 가운데 남고, 배수는 1 과 4 사이다", () => {
  const 키운_것 = zoomFocus(COVER_FOCUS_DEFAULT, 세로_사진, 틀, 2);
  assert.equal(키운_것.zoom, 2);
  assert.equal(키운_것.x, 0.5);
  assert.equal(Math.round(coverLayout(세로_사진, 틀, 키운_것).width), 648);

  assert.equal(zoomFocus(COVER_FOCUS_DEFAULT, 세로_사진, 틀, 0.5).zoom, 1);
  assert.equal(zoomFocus(키운_것, 세로_사진, 틀, 8).zoom, 4);
});

test("끝을 보던 중에 키워도 보던 곳이 가운데 남고 틀은 다 덮는다", () => {
  const 맨_아래 = dragFocus(COVER_FOCUS_DEFAULT, 세로_사진, 틀, 0, -500);
  const 키운_것 = zoomFocus(맨_아래, 세로_사진, 틀, 2);
  const 자리 = coverLayout(세로_사진, 틀, 키운_것);

  // 키우는 것은 보던 곳을 가운데 두고 크게 보는 일이다. 자리는 그대로다.
  assert.equal(키운_것.y, 맨_아래.y);
  // 그래도 틀에 빈 자리는 없다.
  assert.ok(자리.top <= 0 && 자리.top + 자리.height >= 200);
});

test("사진 크기를 아직 모르면 틀만큼만 잡아 둔다", () => {
  assert.deepEqual(coverLayout(undefined, 틀, COVER_FOCUS_DEFAULT), {
    left: 0, top: 0, width: 324, height: 200,
  });
  // 크기를 모르는 동안 끈 것은 값을 흔들지 않는다.
  assert.deepEqual(dragFocus(COVER_FOCUS_DEFAULT, undefined, 틀, 0, -40), COVER_FOCUS_DEFAULT);
});

test("서버에서 온 값은 범위 안으로 들이고, 없으면 가운데로 본다", () => {
  assert.deepEqual(tidyFocus({ x: 0.3, y: 0.8, zoom: 1.5 }), { x: 0.3, y: 0.8, zoom: 1.5 });
  assert.deepEqual(tidyFocus({ x: -1, y: 9, zoom: 99 }), { x: 0, y: 1, zoom: 4 });
  assert.deepEqual(tidyFocus(undefined), COVER_FOCUS_DEFAULT);
  assert.deepEqual(tidyFocus({ x: Number.NaN }), COVER_FOCUS_DEFAULT);
});

test("보낼 때는 넷째 자리까지만, 같은 값이면 보내지 않는다", () => {
  assert.deepEqual(focusBody({ x: 0.123456, y: 0.5, zoom: 1.98765 }), {
    coverFocusX: 0.1235, coverFocusY: 0.5, coverZoom: 1.9877,
  });
  assert.equal(sameFocus(COVER_FOCUS_DEFAULT, { x: 0.5001, y: 0.5, zoom: 1 }), true);
  assert.equal(sameFocus(COVER_FOCUS_DEFAULT, { x: 0.52, y: 0.5, zoom: 1 }), false);
});
