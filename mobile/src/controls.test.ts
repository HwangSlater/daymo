import assert from "node:assert/strict";
import { test } from "node:test";

import { 높이, 모서리, 불투명도, 아이콘, 그림자, 여백, 글자누름여유, 누름여유 } from "./theme/controls.ts";

// 순수 값 모듈이라 확인할 것은 하나다. 단계가 통째로 빠지거나 말없이 바뀌면
// 화면 네 군데가 같이 흔들린다. 값을 고치려면 이 시험도 같이 고치게 둔다.

test("높이는 네 단계뿐이고 작은 것부터 커진다", () => {
  assert.deepEqual(Object.keys(높이), ["칩", "버튼", "입력", "저장"]);
  assert.deepEqual([높이.칩, 높이.버튼, 높이.입력, 높이.저장], [36, 44, 52, 56]);
});

test("모서리는 작은 것부터 커지는 한 벌이다", () => {
  assert.deepEqual(모서리, { 표식: 4, 상자: 8, 버튼: 10, 행: 12, 구역: 16, 원: 999 });

  // 체계가 두 벌이 되지 않게 순서를 못 박는다. 사이 값을 끼워 넣으려면 이 줄을
  // 먼저 고쳐야 하고, 그때 정말 새 단계가 필요한지 한 번 더 묻게 된다.
  const 단계 = [모서리.표식, 모서리.상자, 모서리.버튼, 모서리.행, 모서리.구역];
  assert.deepEqual(단계, [...단계].sort((a, b) => a - b));
});

test("불투명도는 눌림이 가장 진하고 비활성이 가장 옅다", () => {
  assert.deepEqual(불투명도, { 눌림: 0.7, 흐림: 0.55, 비활성: 0.4 });
  assert.equal(불투명도.눌림 > 불투명도.흐림, true);
  assert.equal(불투명도.흐림 > 불투명도.비활성, true);
});

test("아이콘은 세 단계뿐이다", () => {
  assert.deepEqual(아이콘, { 작게: 14, 보통: 16, 크게: 20 });
});

test("그림자는 뜬 것이 카드보다 짙고 멀리 퍼진다", () => {
  assert.equal(그림자.뜬것.shadowOpacity > 그림자.카드.shadowOpacity, true);
  assert.equal(그림자.뜬것.shadowRadius > 그림자.카드.shadowRadius, true);
  assert.equal(그림자.뜬것.elevation > 그림자.카드.elevation, true);
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

test("글자 한 줄짜리 단추도 세로로는 44 를 채운다", () => {
  // 12pt 글자 한 줄이 17 남짓이다.
  assert.equal(17 + 글자누름여유.top + 글자누름여유.bottom >= 높이.버튼, true);
  // 좌우는 넓히지 않는다. 나란한 글자 단추가 서로 겹치면 어느 쪽이 눌렸는지 알 수 없다.
  assert.equal(글자누름여유.left < 글자누름여유.top, true);
});

test("이미 충분히 큰 것에는 여유를 주지 않는다", () => {
  assert.equal(누름여유(높이.버튼), 0);
  assert.equal(누름여유(높이.저장), 0);
});
