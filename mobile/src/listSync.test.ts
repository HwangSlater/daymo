import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bodyKey,
  listTrouble,
  shouldRefetch,
  troubleHeadline,
  type Codec,
  type Confirmed,
  type Failed,
} from "./listSync.ts";

type Row = { id: string; name: string; owner: string };
type Body = { name: string; owner: string };

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const roster = ["하늘", "여울"];

const codec: Codec<Row, Body, { id: string; version: number }> = {
  syncable: (row) => Boolean(row.name) && roster.includes(row.owner),
  blockReason: (row) => (roster.includes(row.owner) ? undefined : "이 여행에 없는 사람이 들어 있어요"),
  idOf: (row) => row.id,
  toBody: (row) => ({ name: row.name, owner: row.owner }),
  fromServer: () => ({ id: "", name: "", owner: "" }),
};

const confirmedOf = (row: Row): Map<string, Confirmed> =>
  new Map([[row.id, { key: bodyKey(codec.toBody(row)), version: 1 }]]);

test("까닭을 아는 줄은 연결이 있어도 막힘으로 알린다", () => {
  const rows = listTrouble([{ id: A, name: "저녁", owner: "이웃" }], codec, new Map(), new Map(), false);

  assert.deepEqual(rows.get(A), { state: "막힘", reason: "이 여행에 없는 사람이 들어 있어요" });
});

test("올릴 줄이 아니면(까닭 없음) 아무것도 알리지 않는다", () => {
  const derived: Codec<Row, Body, { id: string; version: number }> = { ...codec, blockReason: undefined };
  const rows = listTrouble([{ id: A, name: "", owner: "하늘" }], derived, new Map(), new Map(), true);

  assert.equal(rows.size, 0);
});

test("서버가 거부한 줄은 서버가 알려 준 까닭을 그대로 쓴다", () => {
  const row: Row = { id: A, name: "저녁", owner: "하늘" };
  const failed: Map<string, Failed> = new Map([[A, { key: bodyKey(codec.toBody(row)), reason: "이름이 너무 길어요." }]]);

  assert.deepEqual(listTrouble([row], codec, new Map(), failed, false).get(A), {
    state: "막힘",
    reason: "이름이 너무 길어요.",
  });
  // 사람이 고치면 배지가 걷힌다.
  assert.equal(listTrouble([{ ...row, name: "점심" }], codec, new Map(), failed, false).size, 0);
});

test("연결이 있을 때는 보내는 중인 줄에 대기를 붙이지 않는다", () => {
  const row: Row = { id: A, name: "저녁", owner: "하늘" };

  assert.equal(listTrouble([row], codec, new Map(), new Map(), false).size, 0);
  assert.deepEqual(listTrouble([row], codec, new Map(), new Map(), true).get(A), { state: "대기" });
});

test("연결이 끊겨도 이미 서버와 같은 줄은 대기가 아니다", () => {
  const row: Row = { id: A, name: "저녁", owner: "하늘" };

  assert.equal(listTrouble([row], codec, confirmedOf(row), new Map(), true).size, 0);
  assert.deepEqual(listTrouble([{ ...row, name: "점심" }], codec, confirmedOf(row), new Map(), true).get(A), {
    state: "대기",
  });
});

test("id 가 없는 줄은 세지 않는다", () => {
  const noId: Codec<Row, Body, { id: string; version: number }> = { ...codec, idOf: () => "" };

  assert.equal(listTrouble([{ id: B, name: "저녁", owner: "이웃" }], noId, new Map(), new Map(), true).size, 0);
});

test("위쪽 한 줄은 못 올린 개수를 세고, 아무 일도 없으면 비어 있다", () => {
  assert.equal(troubleHeadline({ blocked: 0, waiting: 0, offline: false, busy: false }), "");
  assert.equal(troubleHeadline({ blocked: 2, waiting: 1, offline: false, busy: false }), "아직 저장하지 못한 3개");
  assert.equal(
    troubleHeadline({ blocked: 0, waiting: 2, offline: true, busy: false }),
    "아직 저장하지 못한 2개 · 연결되면 다시 저장할게요",
  );
  assert.equal(
    troubleHeadline({ blocked: 0, waiting: 0, offline: true, busy: false }),
    "연결이 끊겨 새 내용을 받지 못했어요",
  );
});

test("일부를 못 불러온 것은 못 올린 줄과 연결 다음에 알린다", () => {
  assert.equal(
    troubleHeadline({ blocked: 0, waiting: 0, offline: false, busy: true }),
    "일부를 불러오지 못했어요 · 잠시 뒤 다시 불러와 주세요",
  );
  // 적은 것이 걸려 있거나 연결이 끊겼으면 그쪽이 먼저다.
  assert.equal(troubleHeadline({ blocked: 1, waiting: 0, offline: false, busy: true }), "아직 저장하지 못한 1개");
  assert.equal(
    troubleHeadline({ blocked: 0, waiting: 0, offline: true, busy: true }),
    "연결이 끊겨 새 내용을 받지 못했어요",
  );
});

test("앞으로 돌아와도 방금 받았으면 다시 받지 않는다", () => {
  assert.equal(shouldRefetch(1_000, 5_000, 15_000), false);
  assert.equal(shouldRefetch(1_000, 16_000, 15_000), true);
  // 한 번도 받은 적이 없으면(0) 바로 받는다.
  assert.equal(shouldRefetch(0, Date.now()), true);
});
