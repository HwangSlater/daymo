import assert from "node:assert/strict";
import { test } from "node:test";

import { isOnLand, nearestRegion, regionAt, regionContaining } from "./koreaHitTest.ts";
import { tripRegions } from "./tripRegions.ts";

// 좌표는 지도 격자(300 x 420) 기준이다. 이름표 자리는 tripRegions 에서 가져오고,
// 이웃 시도 쪽 점은 두 경계에서 2칸 넘게 떨어져 있어 반올림에 흔들리지 않는다.
const pin = (name: string) => {
  const found = tripRegions.find((region) => region.name === name);
  assert.ok(found, name);
  return found;
};

test("모든 이름표 자리는 자기 시도 안에 있다", () => {
  for (const region of tripRegions) {
    assert.equal(regionContaining(region.x, region.y), region.name);
  }
});

test("서울 한가운데는 서울, 서울 바로 바깥은 경기다", () => {
  assert.equal(regionAt(pin("서울").x, pin("서울").y), "서울");
  // 서울 이름표에 경기 이름표보다 훨씬 가깝지만 서울 경계 밖이다.
  assert.equal(nearestRegion(94.5, 86.5, tripRegions), "서울");
  assert.equal(regionAt(94.5, 86.5), "경기");
});

test("인천은 인천, 인천 옆 경기는 경기다", () => {
  assert.equal(regionAt(pin("인천").x, pin("인천").y), "인천");
  assert.equal(nearestRegion(94, 101.5, tripRegions), "인천");
  assert.equal(regionAt(94, 101.5), "경기");
});

test("세종·대전과 둘러싼 충남을 가른다", () => {
  assert.equal(regionAt(pin("세종").x, pin("세종").y), "세종");
  assert.equal(nearestRegion(104.5, 161, tripRegions), "세종");
  assert.equal(regionAt(104.5, 161), "충남");

  assert.equal(regionAt(pin("대전").x, pin("대전").y), "대전");
  assert.equal(nearestRegion(108, 175, tripRegions), "대전");
  assert.equal(regionAt(108, 175), "충남");
});

test("부산과 경남을 가른다", () => {
  assert.equal(regionAt(pin("부산").x, pin("부산").y), "부산");
  assert.equal(nearestRegion(172, 251, tripRegions), "부산");
  assert.equal(regionAt(172, 251), "경남");
});

test("전남에 완전히 둘러싸인 광주는 전남의 구멍으로 가른다", () => {
  assert.equal(regionAt(pin("광주").x, pin("광주").y), "광주");
  assert.equal(regionAt(88.5, 264.5), "전남");
});

test("바다는 육지가 아니고 어느 시도에도 들지 않는다", () => {
  assert.equal(isOnLand(20, 20), false);
  assert.equal(regionContaining(20, 20), null);
  assert.equal(isOnLand(pin("제주").x, pin("제주").y), true);
});

test("이름표가 없는 섬 조각에서는 가장 가까운 중심점으로 고른다", () => {
  // 인천 앞바다의 섬 조각. 육지지만 이름표가 든 다각형이 아니다.
  assert.equal(isOnLand(80, 84), true);
  assert.equal(regionContaining(80, 84), null);
  assert.equal(regionAt(80, 84), "인천");
  assert.equal(nearestRegion(0, 0, tripRegions), null);
});
