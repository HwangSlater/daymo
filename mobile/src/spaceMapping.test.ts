import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canEditSpace,
  membersFromServer,
  relationshipFromServer,
  relationshipToServer,
  roleFromServer,
  spacePatchFrom,
} from "./spaceMapping.ts";

test("서버 권한을 화면 이름표로 옮긴다", () => {
  assert.equal(roleFromServer("owner"), "관리자");
  assert.equal(roleFromServer("editor"), "편집 가능");
  assert.equal(roleFromServer("viewer"), "보기만");
});

test("모르는 권한은 가장 좁게 읽는다", () => {
  // 넓게 읽으면 못 하는 일을 할 수 있는 것처럼 보인다.
  assert.equal(roleFromServer("admin"), "보기만");
  assert.equal(roleFromServer(undefined), "보기만");
});

test("연인만 연인이고 나머지는 친구로 보인다", () => {
  assert.equal(relationshipFromServer("couple"), "연인");
  assert.equal(relationshipFromServer("friends"), "친구");
  assert.equal(relationshipFromServer("family"), "친구");
  assert.equal(relationshipFromServer("other"), "친구");
});

test("보이는 관계가 그대로면 서버 값을 덮어쓰지 않는다", () => {
  // 가족으로 저장된 공간에서 친구를 다시 눌렀다고 friends 로 바꾸면
  // 다른 기기에서 고른 가족이 말없이 사라진다.
  assert.equal(relationshipToServer("친구", "family"), "family");
  assert.equal(relationshipToServer("친구", "other"), "other");
  assert.equal(relationshipToServer("연인", "couple"), "couple");
});

test("관계를 실제로 바꾸면 서버 값도 바뀐다", () => {
  assert.equal(relationshipToServer("연인", "family"), "couple");
  assert.equal(relationshipToServer("친구", "couple"), "friends");
  assert.equal(relationshipToServer("친구", undefined), "friends");
});

test("멤버 목록에서 나를 뺀다", () => {
  const members = membersFromServer([
    { id: "m1", displayName: "하늘", role: "owner", isMe: true },
    { id: "m2", displayName: "다온", role: "editor", isMe: false },
    { id: "m3", displayName: "새봄", role: "viewer", isMe: false },
  ]);

  assert.deepEqual(members, [
    { id: "m2", name: "다온", role: "편집 가능" },
    { id: "m3", name: "새봄", role: "보기만" },
  ]);
});

test("공간 정보는 관리자만 바꿀 수 있다", () => {
  assert.equal(canEditSpace("관리자"), true);
  assert.equal(canEditSpace("편집 가능"), false);
  assert.equal(canEditSpace("보기만"), false);
  // 서버에서 권한을 아직 못 받았으면 바꾸지 못하게 둔다.
  assert.equal(canEditSpace(undefined), false);
});

test("바꾼 것만 서버에 보낸다", () => {
  assert.deepEqual(spacePatchFrom({ name: "둘의 여행" }), { name: "둘의 여행" });
  assert.deepEqual(spacePatchFrom({ relationship: "연인" }, "friends"), { relationshipType: "couple" });
});

test("이름을 지우는 도중에는 보내지 않는다", () => {
  // 빈 이름을 보내면 서버가 거부하고 사용자에게는 저장 실패로 보인다.
  assert.equal(spacePatchFrom({ name: "   " }), null);
});

test("함께한 날은 날짜 모양일 때만 보내고 빈 값은 지운 것으로 본다", () => {
  assert.deepEqual(spacePatchFrom({ since: "2024-05-18" }), { startedOn: "2024-05-18" });
  assert.deepEqual(spacePatchFrom({ since: "" }), { startedOn: null });
  assert.equal(spacePatchFrom({ since: "2024.5" }), null);
});

test("공간 이름은 서버 한도를 넘지 않게 자른다", () => {
  const patch = spacePatchFrom({ name: "가".repeat(60) });
  assert.equal(patch?.name?.length, 40);
});
