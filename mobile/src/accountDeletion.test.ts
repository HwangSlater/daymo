import assert from "node:assert/strict";
import { test } from "node:test";

import { deletionDateLabel, deletionRequestedNotice } from "./accountDeletion.ts";

test("삭제 예정 시각을 이 기기 시간으로 적는다", () => {
  // 이 기기 시간으로 만든 시각이라 어느 시간대에서 돌려도 같다.
  const at = new Date(2026, 8, 22, 9, 5).toISOString();

  assert.equal(deletionDateLabel(at), "2026년 9월 22일 09:05");
});

test("시각이 없거나 망가졌으면 적지 않는다", () => {
  assert.equal(deletionDateLabel(null), null);
  assert.equal(deletionDateLabel("언젠가"), null);
});

test("시각을 모르면 안내는 7일 뒤라고만 말한다", () => {
  assert.ok(deletionRequestedNotice(null).includes("7일 뒤에 삭제돼요"));
  assert.ok(deletionRequestedNotice(new Date(2026, 8, 22, 9, 5).toISOString()).includes("2026년 9월 22일 09:05에 삭제돼요"));
});
