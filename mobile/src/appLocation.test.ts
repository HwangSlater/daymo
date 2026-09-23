import assert from "node:assert/strict";
import { test } from "node:test";

import {
  locationToPath,
  pathToLocation,
  여행_닫기,
  여행_열기,
  탭_고르기,
  type 앱위치,
} from "./appLocation.ts";

/** 주소로 적을 수 있는 위치들. 이 목록은 위치 → 글 → 위치 가 그대로여야 한다. */
const 왕복할_위치: 앱위치[] = [
  { 탭: "홈", 여행: null },
  { 탭: "여행", 여행: null },
  { 탭: "찾기", 여행: null },
  { 탭: "우리", 여행: null },
  { 탭: "여행", 여행: { id: "6f1d", 자리: "overview" } },
  { 탭: "여행", 여행: { id: "6f1d", 자리: "expenses" } },
  { 탭: "여행", 여행: { id: "6f1d", 자리: "schedule-add" } },
  { 탭: "여행", 여행: { id: "6f1d", 자리: "places" } },
  { 탭: "여행", 여행: { id: "6f1d", 자리: "preparation" } },
  { 탭: "여행", 여행: { id: "6f1d", 자리: "cooking" } },
  { 탭: "여행", 여행: { id: "6f1d", 자리: "memories" } },
];

test("위치를 글로 적었다 다시 읽으면 그대로다", () => {
  for (const 위치 of 왕복할_위치) {
    assert.deepEqual(pathToLocation(locationToPath(위치)), 위치, locationToPath(위치));
  }
});

test("탭마다 주소가 다르다", () => {
  assert.equal(locationToPath({ 탭: "홈", 여행: null }), "/");
  assert.equal(locationToPath({ 탭: "여행", 여행: null }), "/trips");
  assert.equal(locationToPath({ 탭: "찾기", 여행: null }), "/search");
  assert.equal(locationToPath({ 탭: "우리", 여행: null }), "/us");
});

test("여행 상세 주소에는 자리가 붙고, 처음 자리는 생략한다", () => {
  assert.equal(locationToPath({ 탭: "홈", 여행: { id: "6f1d", 자리: "overview" } }), "/trips/6f1d");
  assert.equal(locationToPath({ 탭: "홈", 여행: { id: "6f1d", 자리: "expenses" } }), "/trips/6f1d/expenses");
});

test("여행을 열어 두면 깔린 탭은 주소에 안 들어가고, 읽을 때는 「여행」 탭이 깔린다", () => {
  const 우리탭에서_연_여행: 앱위치 = { 탭: "우리", 여행: { id: "6f1d", 자리: "memories" } };
  assert.equal(locationToPath(우리탭에서_연_여행), "/trips/6f1d/memories");
  assert.deepEqual(pathToLocation("/trips/6f1d/memories"), {
    탭: "여행",
    여행: { id: "6f1d", 자리: "memories" },
  });
});

test("아직 서버에 없는 여행은 보낼 주소가 없어 탭 주소로 내려간다", () => {
  assert.equal(locationToPath({ 탭: "여행", 여행: { id: "", 자리: "places" } }), "/trips");
  assert.equal(locationToPath({ 탭: "홈", 여행: { id: "", 자리: "places" } }), "/");
});

test("모르는 주소는 null 이다", () => {
  assert.equal(pathToLocation("/없는곳"), null);
  assert.equal(pathToLocation("/trips/6f1d/없는자리"), null);
  assert.equal(pathToLocation("/trips/6f1d/expenses/더"), null);
  assert.equal(pathToLocation("/search/더"), null);
  assert.equal(pathToLocation("/%"), null);
  // 탭 이름은 주소 마디가 아니다. 사람이 읽는 말과 주소를 섞지 않는다.
  assert.equal(pathToLocation("/홈"), null);
});

test("빈 주소와 군더더기는 홈으로 읽는다", () => {
  const 홈: 앱위치 = { 탭: "홈", 여행: null };
  assert.deepEqual(pathToLocation("/"), 홈);
  assert.deepEqual(pathToLocation(""), 홈);
  assert.deepEqual(pathToLocation("/?token=abc"), 홈);
  assert.deepEqual(pathToLocation("/#anchor"), 홈);
});

test("꼬리 빗금과 물음표는 읽을 때 버린다", () => {
  assert.deepEqual(pathToLocation("/trips/"), { 탭: "여행", 여행: null });
  assert.deepEqual(pathToLocation("/trips/6f1d/expenses?from=kakao"), {
    탭: "여행",
    여행: { id: "6f1d", 자리: "expenses" },
  });
});

test("주소에 못 쓰는 글자가 든 id 도 그대로 오간다", () => {
  const 위치: 앱위치 = { 탭: "여행", 여행: { id: "제주 #1/봄", 자리: "places" } };
  const 글 = locationToPath(위치);
  assert.equal(글.includes(" "), false);
  assert.deepEqual(pathToLocation(글), 위치);
});

test("탭을 옮겨도 열어 둔 여행은 그대로다", () => {
  const 위치: 앱위치 = { 탭: "홈", 여행: { id: "6f1d", 자리: "places" } };
  assert.deepEqual(탭_고르기(위치, "우리"), { 탭: "우리", 여행: { id: "6f1d", 자리: "places" } });
  // 같은 탭을 다시 고르면 쓰던 것을 그대로 돌려준다(괜히 다시 그리지 않는다).
  assert.equal(탭_고르기(위치, "홈"), 위치);
});

test("여행을 열고 닫아도 깔린 탭은 남는다", () => {
  const 시작: 앱위치 = { 탭: "우리", 여행: null };
  const 열림 = 여행_열기(시작, "6f1d", "expenses");
  assert.deepEqual(열림, { 탭: "우리", 여행: { id: "6f1d", 자리: "expenses" } });
  assert.deepEqual(여행_닫기(열림), 시작);
  assert.equal(여행_닫기(시작), 시작);
});
