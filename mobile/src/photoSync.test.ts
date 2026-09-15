import assert from "node:assert/strict";
import { test } from "node:test";

import { bodyKey, hasWork, planListSync, tripDateKeys, type Confirmed } from "./listSync.ts";
import { colorOfId, PHOTO_PALETTE, PHOTO_UNDATED, photoCodec } from "./photoSync.ts";

const A = "11111111-1111-4111-8111-111111111111";
const dates = tripDateKeys("2026-10-01", "2026-10-03");

test("파일이 있거나 서버에 이미 있는 사진만 맞춘다", () => {
  const codec = photoCodec(dates, new Set([A]));
  const fresh = photoCodec(dates, new Set());

  assert.equal(fresh.syncable({ id: A, color: "#fff", date: "", caption: "" }), false);
  assert.equal(fresh.syncable({ id: A, color: "#fff", date: "", caption: "", uri: "file:///p.jpg" }), true);
  assert.equal(codec.syncable({ id: A, color: "#fff", date: "", caption: "" }), true);
  assert.equal(codec.syncable({ id: "photo-1", color: "#fff", date: "", caption: "", uri: "file:///p.jpg" }), false);
});

test("날짜 줄은 여행 날짜로 오가고 파일 자리와 색은 기기 것을 지킨다", () => {
  const codec = photoCodec(dates, new Set([A]));
  const local = { id: A, color: "#123456", date: "2일(금)", caption: " 느린 점심 ", uri: "file:///p.jpg" };

  assert.deepEqual(codec.toBody(local), { caption: "느린 점심", date: "2026-10-02" });
  const row = {
    id: A, status: "ready" as const, caption: "느린 점심", date: "2026-10-02", takenAt: null, width: 10, height: 10, bytes: 100,
    isReceipt: false, uploaderMembershipId: null, uploaderName: "하늘", createdAt: "2026-10-02T03:00:00Z", version: 1,
  };
  const back = codec.fromServer(row);
  assert.deepEqual(codec.keepLocal?.(back, local), { id: A, color: "#123456", date: "2일(금)", caption: "느린 점심", uri: "file:///p.jpg" });
  assert.equal(codec.fromServer({ ...row, date: "2026-12-25" }).date, PHOTO_UNDATED);
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(codec.toBody(back)), version: 1 }]]);
  assert.equal(hasWork(planListSync([local], codec, confirmed)), false);
});

test("색은 id 로 정해져 기기마다 같다", () => {
  assert.equal(colorOfId(A), colorOfId(A));
  assert.ok(PHOTO_PALETTE.includes(colorOfId("22222222-2222-4222-8222-222222222222")));
});
