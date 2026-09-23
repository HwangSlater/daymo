import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cardDraftsKeyOf,
  draftCreationOrder,
  draftListOf,
  finishedCaptionOf,
  isCardDraftsKey,
  parseStoredDrafts,
  removeDraft,
  sameSourceDraft,
  serializeDrafts,
  type StoredCardDraft,
  upsertDraft,
} from "./cardDrafts.ts";
import { keepsakeCardOf } from "./tripCard.ts";

const 여행 = "우리의 서울 주말";
const 사진 = ["p1", "p2", "p3"];

const 초안 = (id: string, createdAt: string, title = ""): StoredCardDraft => ({
  id,
  createdAt,
  settings: { style: "필름", photoIds: ["p1", "p2"], title: title || null },
});

test("더하면 뒤에 붙고, 같은 id 면 그 자리에서 바뀐다", () => {
  const 카드 = keepsakeCardOf(undefined, 여행, 사진);
  const 하나 = upsertDraft([], { id: "a", card: 카드, createdAt: "2026-09-23T01:00:00Z" }, 여행);
  assert.equal(하나.length, 1);
  assert.equal(하나[0].id, "a");
  // 여행 이름 그대로인 제목은 비워 둔다. 읽을 때 여행 이름을 따라간다.
  assert.equal(하나[0].settings.title, null);

  const 둘 = upsertDraft(하나, { id: "b", card: 카드, createdAt: "2026-09-23T02:00:00Z" }, 여행);
  const 바꿈 = upsertDraft(둘, { id: "a", card: { ...카드, title: "첫날" }, createdAt: "2026-09-23T01:00:00Z" }, 여행);
  assert.deepEqual(바꿈.map((줄) => 줄.id), ["a", "b"]);
  assert.equal(바꿈[0].settings.title, "첫날");
  assert.equal(바꿈[1].settings.title, null);
});

test("지우면 그 id 만 빠진다", () => {
  const 목록 = [초안("a", "2026-09-23T01:00:00Z"), 초안("b", "2026-09-23T02:00:00Z")];
  assert.deepEqual(removeDraft(목록, "a").map((줄) => 줄.id), ["b"]);
  assert.deepEqual(removeDraft(목록, "없음").map((줄) => 줄.id), ["a", "b"]);
});

test("만든 차례는 시각, 같으면 id 로 가른다", () => {
  const 목록 = [
    초안("b", "2026-09-23T02:00:00Z"),
    초안("c", "2026-09-23T01:00:00Z"),
    초안("a", "2026-09-23T01:00:00Z"),
  ];
  assert.deepEqual(draftCreationOrder(목록).map((줄) => 줄.id), ["a", "c", "b"]);
});

test("격자 목록은 최신이 먼저고, 번호는 만든 차례를 따른다", () => {
  const 목록 = [
    초안("a", "2026-09-23T01:00:00Z"),
    초안("b", "2026-09-23T02:00:00Z", "둘째 날"),
    초안("c", "2026-09-23T03:00:00Z"),
  ];
  const 보기 = draftListOf(목록, 여행, 사진);
  assert.deepEqual(보기.map((줄) => 줄.id), ["c", "b", "a"]);
  assert.deepEqual(보기.map((줄) => 줄.label), ["카드 3", "둘째 날", "카드 1"]);
  assert.equal(보기[0].meta, "필름 · 사진 2장");
  // 제목을 적지 않은 카드는 여행 이름을 따라간다.
  assert.equal(보기[0].card.title, 여행);
});

test("지운 사진은 카드에서 빠진다", () => {
  const 보기 = draftListOf([초안("a", "2026-09-23T01:00:00Z")], 여행, ["p2", "p3"]);
  assert.deepEqual(보기[0].card.photoIds, ["p2"]);
});

test("완료한 사진의 설명은 직접 적은 제목뿐이다", () => {
  const 카드 = keepsakeCardOf(undefined, 여행, 사진);
  assert.equal(finishedCaptionOf(카드, 여행), "");
  assert.equal(finishedCaptionOf({ ...카드, title: "  " }, 여행), "");
  assert.equal(finishedCaptionOf({ ...카드, title: "첫날 저녁" }, 여행), "첫날 저녁");
});

test("적었다 읽으면 그대로고, 모양이 틀린 줄과 못 읽는 글은 버린다", () => {
  const 목록 = [초안("a", "2026-09-23T01:00:00Z", "첫날")];
  assert.deepEqual(parseStoredDrafts(serializeDrafts(목록)), 목록);

  assert.deepEqual(parseStoredDrafts(null), []);
  assert.deepEqual(parseStoredDrafts(""), []);
  assert.deepEqual(parseStoredDrafts("{깨진"), []);
  assert.deepEqual(parseStoredDrafts(JSON.stringify({ id: "a" })), []);
  const 섞임 = JSON.stringify([
    목록[0],
    null,
    { id: "", settings: {}, createdAt: "x" },
    { id: "b", settings: [], createdAt: "x" },
    { id: "c", settings: {} },
  ]);
  assert.deepEqual(parseStoredDrafts(섞임).map((줄) => 줄.id), ["a"]);
});

test("저장 열쇠는 여행마다 다르다", () => {
  assert.notEqual(cardDraftsKeyOf("t1"), cardDraftsKeyOf("t2"));
  assert.ok(cardDraftsKeyOf("t1").startsWith("daymo.card-drafts.v"));
});

test("초안 열쇠만 골라낸다", () => {
  // 계정이 바뀔 때 초안만 걷어 내고 설정·세션은 건드리지 않아야 한다.
  assert.ok(isCardDraftsKey(cardDraftsKeyOf("t1")));
  // 판이 올라가도 옛 판까지 함께 걷어 낸다.
  assert.ok(isCardDraftsKey("daymo.card-drafts.v9.t1"));
  assert.equal(isCardDraftsKey("daymo.trip-data.v1"), false);
  assert.equal(isCardDraftsKey("daymo.card-photo-tip.v3"), false);
  assert.equal(isCardDraftsKey("daymo.auth.session.v1"), false);
});

test("같은 사진으로 꾸미던 초안이 있으면 그것을 찾고, 없으면 못 찾는다", () => {
  const 목록 = draftListOf(
    [
      { id: "a", settings: { photoIds: ["p1"] }, createdAt: "2026-09-23T00:00:00.000Z" },
      { id: "b", settings: { photoIds: ["p1", "p2"] }, createdAt: "2026-09-23T01:00:00.000Z" },
    ],
    "가을 제주",
    ["p1", "p2", "p3"],
  );

  // 최신(b)이 먼저다. p1 로 시작하면 p1 이 든 것 가운데 최신인 b 를 잇는다.
  assert.equal(sameSourceDraft(목록, ["p1"]), "b");
  assert.equal(sameSourceDraft(목록, ["p1", "p2"]), "b");
  assert.equal(sameSourceDraft(목록, ["p3"]), undefined);
  assert.equal(sameSourceDraft(목록, []), undefined);
});
