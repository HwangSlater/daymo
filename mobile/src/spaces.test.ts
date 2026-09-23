import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSpaces } from "./spaces.ts";

/** 저장돼 있는 공간 한 칸. 시험마다 조금씩 바꿔 쓴다. */
const 저장된_공간 = {
  id: "ours",
  name: "우리의 여행 공간",
  members: [{ name: "다온", role: "편집 가능" }],
  relationship: "연인",
  since: "2023-10-20",
};

test("저장된 것이 없으면 빈 목록이다", () => {
  // 예시 공간으로 채우면 모르는 멤버와 남의 여행이 진짜처럼 보인다(2026-09-23).
  assert.deepEqual(parseSpaces(null), []);
  assert.deepEqual(parseSpaces(""), []);
});

test("망가진 값도 빈 목록으로 읽는다", () => {
  assert.deepEqual(parseSpaces("{"), []);
  assert.deepEqual(parseSpaces('"글자"'), []);
  assert.deepEqual(parseSpaces("[]"), []);
});

test("저장한 이름과 멤버를 그대로 읽는다", () => {
  const saved = JSON.stringify([{
    id: "ours",
    name: "제주 한 달",
    members: [{ name: "지수", role: "보기만" }],
    relationship: "연인",
    since: "2024-01-02",
  }]);
  assert.deepEqual(parseSpaces(saved), [{
    id: "ours",
    name: "제주 한 달",
    members: [{ name: "지수", role: "보기만" }],
    relationship: "연인",
    since: "2024-01-02",
  }]);
});

test("모르는 권한과 관계는 기본값으로 되돌린다", () => {
  const saved = JSON.stringify([{
    id: "ours",
    name: "공간",
    members: [{ name: "지수", role: "사장님" }],
    relationship: "동료",
    since: "2024-01-02",
  }]);
  const [space] = parseSpaces(saved);
  assert.equal(space.members[0].role, "편집 가능");
  assert.equal(space.relationship, "친구");
});

test("이름 없는 멤버는 버린다", () => {
  const saved = JSON.stringify([{
    id: "ours",
    name: "공간",
    members: [{ name: "지수", role: "편집 가능" }, { name: "  " }, { role: "관리자" }],
    relationship: "친구",
    since: "2024-01-02",
  }]);
  assert.deepEqual(parseSpaces(saved)[0].members, [{ name: "지수", role: "편집 가능" }]);
});

test("화면을 망가뜨릴 만큼 긴 이름은 자리를 지키는 이름으로 바꾼다", () => {
  const saved = JSON.stringify([{ ...저장된_공간, name: "가".repeat(41) }]);
  assert.equal(parseSpaces(saved)[0].name, "여행 공간");
});

test("서버에서 받은 멤버 id 와 내 권한을 캐시에 남긴다", () => {
  // 오프라인으로 열었을 때도 무엇을 바꿀 수 있는지 가르려면 권한이 남아 있어야 한다.
  const saved = JSON.stringify([{
    id: "space-1",
    name: "둘의 여행",
    members: [{ id: "membership-2", name: "다온", role: "편집 가능" }],
    relationship: "연인",
    since: "2024-05-18",
    myRole: "관리자",
    relationshipType: "couple",
  }]);

  const [space] = parseSpaces(saved);

  assert.equal(space.members[0].id, "membership-2");
  assert.equal(space.myRole, "관리자");
  assert.equal(space.relationshipType, "couple");
});

test("모르는 권한은 캐시에서 버린다", () => {
  const saved = JSON.stringify([{ ...저장된_공간, myRole: "사장님" }]);

  assert.equal(parseSpaces(saved)[0].myRole, undefined);
});

test("함께한 날을 적지 않은 공간은 빈 값 그대로 읽는다", () => {
  // 기본값으로 되돌리면 적지도 않은 날이 "함께한 지 N일째" 로 보인다.
  const saved = JSON.stringify([{ ...저장된_공간, since: "" }]);

  assert.equal(parseSpaces(saved)[0].since, "");
});
