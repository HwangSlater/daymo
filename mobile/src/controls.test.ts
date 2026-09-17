import assert from "node:assert/strict";
import { test } from "node:test";

import { 높이, 모서리, 여백, 누름여유 } from "./theme/controls.ts";

// 순수 값 모듈이라 확인할 것은 하나다. 단계가 통째로 빠지거나 말없이 바뀌면
// 화면 네 군데가 같이 흔들린다. 값을 고치려면 이 시험도 같이 고치게 둔다.

test("높이는 네 단계뿐이고 작은 것부터 커진다", () => {
  assert.deepEqual(Object.keys(높이), ["칩", "버튼", "입력", "저장"]);
  assert.deepEqual([높이.칩, 높이.버튼, 높이.입력, 높이.저장], [36, 44, 52, 56]);
});

test("모서리 세 가지가 모두 있다", () => {
  assert.deepEqual(모서리, { 버튼: 10, 구역: 16, 원: 999 });
});

test("여백은 세로 둘 가로 둘이다", () => {
  assert.deepEqual(여백, { 세로좁게: 8, 세로: 12, 가로좁게: 12, 가로: 16 });
});

test("작게 그린 것은 눌리는 넓이가 44 를 채운다", () => {
  for (const 그린높이 of [28, 30, 32, 34, 36, 40]) {
    const 넓힌_높이 = 그린높이 + 누름여유(그린높이) * 2;

    assert.equal(넓힌_높이 >= 높이.버튼, true, `${그린높이}px 이 44 를 못 채운다`);
  }
});

test("이미 충분히 큰 것에는 여유를 주지 않는다", () => {
  assert.equal(누름여유(높이.버튼), 0);
  assert.equal(누름여유(높이.저장), 0);
});
