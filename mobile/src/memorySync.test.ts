import assert from "node:assert/strict";
import { test } from "node:test";

import { bodyKey, hasWork, planListSync, type Confirmed } from "./listSync.ts";
import { diaryCodec, memoCodec, memoStamp } from "./memorySync.ts";

const A = "11111111-1111-4111-8111-111111111111";
const roster = [{ id: "m-me", name: "하늘" }, { id: "m-yeoul", name: "여울 2" }];
const now = new Date(2026, 8, 15, 21, 0);

test("메모 시각은 오늘·어제·날짜로 줄여 쓴다", () => {
  assert.equal(memoStamp(new Date(2026, 8, 15, 10, 42).toISOString(), now), "오늘 10:42");
  assert.equal(memoStamp(new Date(2026, 8, 14, 22, 15).toISOString(), now), "어제 22:15");
  assert.equal(memoStamp(new Date(2026, 8, 12, 9, 0).toISOString(), now), "9월 12일");
});

test("서버 메모는 표의 이름과 시각, 수정됨으로 작성자 줄을 만들고 본문만 보낸다", () => {
  const codec = memoCodec(roster, () => now);
  const row = {
    id: A, body: "우산 챙기기", authorMembershipId: "m-yeoul", authorName: "여울", version: 2,
    createdAt: new Date(2026, 8, 15, 10, 42).toISOString(), editedAt: new Date(2026, 8, 15, 11, 0).toISOString(),
  };
  const back = codec.fromServer(row);

  assert.deepEqual(back, { id: A, body: "우산 챙기기", author: "여울 2 · 오늘 10:42 · 수정됨" });
  assert.equal(codec.fromServer({ ...row, authorMembershipId: null, authorName: "탈퇴한 멤버", editedAt: null }).author, "탈퇴한 멤버 · 오늘 10:42");
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(codec.toBody(back)), version: 2 }]]);
  assert.equal(hasWork(planListSync([{ ...back, author: "여울 2 · 방금 수정" }], codec, confirmed)), false);
  assert.equal(codec.syncable({ id: "memo-1", author: "", body: "x" }), false);
});

test("일기는 제목을 비우면 null, 다루는 날이 없으면 쓴 날로 날짜 줄을 만든다", () => {
  assert.deepEqual(diaryCodec.toBody({ id: A, title: "  ", body: " 첫날 ", date: "방금" }), { title: null, body: "첫날", writtenOn: null });
  const dated = diaryCodec.fromServer({
    id: A, title: "비 온 날", body: "우산", writtenOn: "2026-10-02", authorMembershipId: "m-me", authorName: "하늘", createdAt: "2026-10-05T01:00:00Z", version: 1,
  });
  assert.deepEqual(dated, { id: A, title: "비 온 날", body: "우산", date: "10월 2일", writtenOn: "2026-10-02" });
  const undated = diaryCodec.fromServer({ ...dated, title: null, writtenOn: null, authorMembershipId: null, authorName: "", createdAt: new Date(2026, 9, 5, 12).toISOString(), version: 1 });
  assert.deepEqual(undated, { id: A, title: "", body: "우산", date: "10월 5일" });
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(diaryCodec.toBody(dated)), version: 1 }]]);
  assert.equal(hasWork(planListSync([dated], diaryCodec, confirmed)), false);
});
