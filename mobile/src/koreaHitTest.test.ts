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

// 이름표가 없는 섬 조각도 영역으로 가른다. 자리는 koreaOutlinePath 의 조각
// 안에서 테두리와 한 칸 넘게 떨어진 곳으로 골랐다.
const islands: [string, number, number, string][] = [
  ["거제도", 161.4, 279.4, "경남"],
  ["남해도", 132.3, 281.5, "경남"],
  ["창선도", 136.7, 276.7, "경남"],
  ["한산도", 152.2, 284.5, "경남"],
  ["가덕도", 168.6, 267.5, "부산"],
  ["울릉도", 243.6, 94.7, "경북"],
  ["강화도", 78.8, 78.8, "인천"],
  ["교동도", 71.9, 75.9, "인천"],
  ["영종도", 79.6, 98.3, "인천"],
  ["백령도", 13.5, 65.0, "인천"],
  ["대청도", 14.6, 72.8, "인천"],
  ["연평도", 51.3, 84.5, "인천"],
  ["덕적도", 66.7, 113.8, "인천"],
  ["안면도", 75.3, 162.5, "충남"],
  ["진도", 71.4, 308.0, "전남"],
  ["완도", 88.4, 313.9, "전남"],
  ["보길도", 82.7, 328.8, "전남"],
  ["흑산도", 40.9, 291.9, "전남"],
  ["임자도", 67.7, 261.5, "전남"],
];

test("이름표가 없는 섬 조각도 제 시도로 간다", () => {
  for (const [name, x, y, region] of islands) {
    assert.equal(isOnLand(x, y), true, name);
    assert.equal(regionContaining(x, y), region, name);
    assert.equal(regionAt(x, y), region, name);
  }
});

test("바다 건너 가까운 이름표에 끌려가지 않는다", () => {
  // 예전에는 가장 가까운 이름표로 어림해 이 자리들이 다 틀렸다.
  assert.equal(nearestRegion(161.4, 279.4, tripRegions), "부산");
  assert.equal(regionAt(161.4, 279.4), "경남");
  assert.equal(nearestRegion(132.3, 281.5, tripRegions), "전남");
  assert.equal(regionAt(132.3, 281.5), "경남");
  assert.equal(nearestRegion(82.7, 328.8, tripRegions), "제주");
  assert.equal(regionAt(82.7, 328.8), "전남");
  assert.equal(nearestRegion(67.7, 261.5, tripRegions), "광주");
  assert.equal(regionAt(67.7, 261.5), "전남");
  // 울릉도는 어느 이름표에서도 90칸 넘게 떨어져 아무 답도 못 냈다.
  assert.equal(nearestRegion(243.6, 94.7, tripRegions), null);
  assert.equal(regionAt(243.6, 94.7), "경북");
});

test("경로가 점으로 줄여 놓은 섬은 가장 가까운 중심점으로 고른다", () => {
  // 우도·마라도 같은 제주 부속 섬은 경로에 넓이 없는 조각으로만 남아 있다.
  // 영역으로는 못 고르지만 제주 이름표가 가까워 제주가 된다.
  for (const [x, y] of [[96.6, 372.3], [73.1, 399.8]]) {
    assert.equal(isOnLand(x, y), false);
    assert.equal(regionContaining(x, y), null);
    assert.equal(regionAt(x, y), "제주");
  }
  assert.equal(nearestRegion(0, 0, tripRegions), null);
});
