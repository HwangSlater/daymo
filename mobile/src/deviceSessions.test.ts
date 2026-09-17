import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_DEVICES,
  deviceLimitNotice,
  deviceLine,
  deviceName,
  lastSeenLabel,
  revokePrompt,
  type ServerDevice,
} from "./deviceSessions.ts";

const 기기 = (patch: Partial<ServerDevice> = {}): ServerDevice => ({
  id: "d1",
  displayName: "웹 브라우저",
  platform: "unknown",
  appVersion: "0.1.0",
  lastSeenAt: new Date(2026, 8, 16, 10, 42).toISOString(),
  current: false,
  ...patch,
});

test("이름이 없으면 어떤 판인지로 부른다", () => {
  assert.equal(deviceName({ displayName: null, platform: "ios" }), "iPhone 또는 iPad");
  assert.equal(deviceName({ displayName: "  ", platform: "android" }), "Android 기기");
  assert.equal(deviceName({ displayName: null, platform: "unknown" }), "웹 브라우저");
  assert.equal(deviceName({ displayName: "하늘의 노트북", platform: "unknown" }), "하늘의 노트북");
});

test("마지막 사용 시각을 오늘·어제·날짜로 적는다", () => {
  const now = new Date(2026, 8, 16, 18, 0);
  assert.equal(lastSeenLabel(new Date(2026, 8, 16, 10, 42).toISOString(), now), "오늘 10:42");
  assert.equal(lastSeenLabel(new Date(2026, 8, 15, 22, 5).toISOString(), now), "어제 22:05");
  assert.equal(lastSeenLabel(new Date(2026, 8, 12, 9, 0).toISOString(), now), "9월 12일");
});

test("읽을 수 없는 시각은 빈 글자다", () => {
  assert.equal(lastSeenLabel("언제인지 모름"), "");
  assert.equal(deviceLine(기기({ lastSeenAt: "언제인지 모름" })), "웹 브라우저");
});

test("지금 쓰는 기기에는 표시가 붙는다", () => {
  const now = new Date(2026, 8, 16, 18, 0);
  assert.equal(deviceLine(기기({ current: true }), now), "웹 브라우저 · 오늘 10:42 · 지금 이 기기");
  assert.equal(deviceLine(기기(), now), "웹 브라우저 · 오늘 10:42");
});

test("한도에 가까울 때만 미리 알린다", () => {
  assert.equal(deviceLimitNotice(1), "");
  assert.equal(deviceLimitNotice(3), "");
  assert.ok(/4대를 쓰고 있어요/.test(deviceLimitNotice(4)));
  assert.ok(/모두 쓰고 있어요/.test(deviceLimitNotice(5)));
  // 서버가 말없이 끊은 뒤라 목록이 한도보다 길 일은 없지만, 넘어도 같은 안내를 준다.
  assert.ok(/모두 쓰고 있어요/.test(deviceLimitNotice(6)));
  assert.equal(MAX_DEVICES, 5);
});

test("지금 이 기기를 해지하면 로그아웃이라고 묻는다", () => {
  const 지금 = revokePrompt(기기({ current: true }));
  assert.ok(/지금 이 기기/.test(지금.title));
  assert.ok(/로그아웃/.test(지금.message));
  assert.equal(지금.confirm, "로그아웃");

  const 다른 = revokePrompt(기기({ displayName: "Android 기기", platform: "android" }));
  assert.equal(다른.title, "Android 기기에서 로그아웃할까요?");
  assert.equal(다른.confirm, "로그아웃");
});
