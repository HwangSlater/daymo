import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultSpaces, parseSpaces } from "./spaces.ts";

test("저장된 것이 없으면 기본 공간으로 시작한다", () => {
  assert.deepEqual(parseSpaces(null), defaultSpaces);
  assert.deepEqual(parseSpaces(""), defaultSpaces);
});

test("망가진 값은 기본 공간으로 돌아간다", () => {
  assert.deepEqual(parseSpaces("{"), defaultSpaces);
  assert.deepEqual(parseSpaces('"글자"'), defaultSpaces);
  // 공간이 하나도 없는 앱은 아무것도 할 수 없다.
  assert.deepEqual(parseSpaces("[]"), defaultSpaces);
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
  assert.equal(space.relationship, "연인");
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

test("화면을 망가뜨릴 만큼 긴 이름은 기본값으로 되돌린다", () => {
  const saved = JSON.stringify([{ ...defaultSpaces[0], name: "가".repeat(41) }]);
  assert.equal(parseSpaces(saved)[0].name, defaultSpaces[0].name);
});
