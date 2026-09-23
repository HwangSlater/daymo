import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cardDraftsKeyOf,
  cardImportKeyOf,
  draftCreationOrder,
  draftListOf,
  finishedCaptionOf,
  importedDrafts,
  isCardDraftsKey,
  markFinishedDraft,
  parseStoredDrafts,
  removeDraft,
  sameSourceDraft,
  serializeDrafts,
  settledFinishedDrafts,
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

test("서버 카드 settings 를 초안으로 읽는다", () => {
  // 옛 앱(1.0.0)이 서버에 두고 간 카드. 저장 형식이 같아 그대로 옮겨 담는다.
  const 서버_카드 = [
    { id: "s1", settings: { style: "엽서", photoIds: ["p1"], title: "첫날" }, createdAt: "2026-09-01T00:00:00Z" },
    { id: "s2", settings: { style: "네컷", photoIds: ["p1", "p2"] }, createdAt: "2026-09-02T00:00:00Z" },
  ];
  const 결과 = importedDrafts([], 서버_카드, "2026-09-23T10:00:00Z");

  assert.deepEqual(결과.list.map((줄) => 줄.id), ["s1", "s2"]);
  assert.equal(결과.added.length, 2);
  assert.deepEqual(결과.list[0].settings, 서버_카드[0].settings);
  assert.equal(결과.list[0].createdAt, "2026-09-01T00:00:00Z");
  // 읽으면 카드 한 장이 나온다.
  const 보기 = draftListOf(결과.list, 여행, 사진);
  assert.deepEqual(보기.map((줄) => 줄.label), ["카드 2", "첫날"]);

  // 만든 시각을 주지 않으면 지금 시각으로 둔다. 모양이 틀린 줄은 버린다.
  const 섞임 = importedDrafts([], [
    { id: "s3", settings: { style: "필름" } },
    { id: "", settings: { style: "필름" } },
    { id: "s4", settings: null },
    { id: "s5", settings: [] },
  ], "2026-09-23T10:00:00Z");
  assert.deepEqual(섞임.list.map((줄) => 줄.id), ["s3"]);
  assert.equal(섞임.list[0].createdAt, "2026-09-23T10:00:00Z");
});

test("이미 있는 id 는 덮지 않는다", () => {
  // 한 번 들여온 뒤 기기에서 꾸민 것이 최신이다. 두 번 들여와도 카드가 둘이 되지 않는다.
  const 있던_것 = [{ id: "s1", settings: { style: "필름", photoIds: ["p3"] }, createdAt: "2026-09-10T00:00:00Z" }];
  const 결과 = importedDrafts(있던_것, [
    { id: "s1", settings: { style: "엽서", photoIds: ["p1"] }, createdAt: "2026-09-01T00:00:00Z" },
    { id: "s2", settings: { style: "네컷", photoIds: ["p2"] }, createdAt: "2026-09-02T00:00:00Z" },
  ], "2026-09-23T10:00:00Z");

  assert.deepEqual(결과.list.map((줄) => 줄.id), ["s1", "s2"]);
  assert.deepEqual(결과.added.map((줄) => 줄.id), ["s2"]);
  assert.deepEqual(결과.list[0], 있던_것[0]);
});

test("사진이 된 초안은 그 사진이 올라간 것을 확인한 뒤에 지운다", () => {
  const 목록 = markFinishedDraft([초안("a", "2026-09-23T01:00:00Z"), 초안("b", "2026-09-23T02:00:00Z")], "a", "새사진");
  assert.equal(목록[0].finishedPhotoId, "새사진");
  assert.equal(목록[1].finishedPhotoId, undefined);
  // 다시 꾸며 적으면 표시가 떨어진다.
  const 다시 = upsertDraft(목록, { id: "a", card: keepsakeCardOf(undefined, 여행, 사진), createdAt: "2026-09-23T01:00:00Z" }, 여행);
  assert.equal(다시[0].finishedPhotoId, undefined);

  // 이번에 완료한 것은 올라간 것까지 봐야 지운다.
  assert.deepEqual(settledFinishedDrafts(목록, ["새사진"], [], ["a"]), []);
  assert.deepEqual(settledFinishedDrafts(목록, ["새사진"], ["새사진"], ["a"]), ["a"]);
  // 앱을 다시 연 뒤에는 사진 목록에 있는 것만으로 올라간 것이다.
  assert.deepEqual(settledFinishedDrafts(목록, ["새사진"], [], []), ["a"]);
  // 사진이 사라졌으면(웹에서 올라가기 전에 새로 고침) 초안을 그대로 둔다.
  assert.deepEqual(settledFinishedDrafts(목록, [], [], []), []);
  // 표시가 없는 초안은 건드리지 않는다.
  assert.deepEqual(settledFinishedDrafts([초안("c", "2026-09-23T01:00:00Z")], ["새사진"], ["새사진"], []), []);
});

test("저장 열쇠는 여행마다 다르다", () => {
  assert.notEqual(cardDraftsKeyOf("t1"), cardDraftsKeyOf("t2"));
  assert.ok(cardDraftsKeyOf("t1").startsWith("daymo.card-drafts.v"));
  // 불러오기 표시는 초안과 다른 열쇠다. 초안을 다 지워도 남아야 한다.
  assert.notEqual(cardImportKeyOf("t1"), cardDraftsKeyOf("t1"));
  assert.notEqual(cardImportKeyOf("t1"), cardImportKeyOf("t2"));
});

test("초안 열쇠만 골라낸다", () => {
  // 계정이 바뀔 때 초안만 걷어 내고 설정·세션은 건드리지 않아야 한다.
  assert.ok(isCardDraftsKey(cardDraftsKeyOf("t1")));
  // 불러오기 표시도 함께 걷어 낸다. 남겨 두면 다음 사람이 그 여행의 옛 카드를 못 불러온다.
  assert.ok(isCardDraftsKey(cardImportKeyOf("t1")));
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
