import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allChosen,
  cardFromSelection,
  CARD_GROUP,
  deleteConfirmText,
  deletedText,
  dragSelect,
  galleryOrder,
  galleryRows,
  groupByDate,
  keepExisting,
  memoryPreview,
  reinsertAt,
  rowOffsets,
  savedText,
  splitManageable,
  tileAt,
  tileSizeOf,
  toggleDay,
  toggleOne,
  type GalleryMetrics,
} from "./gallerySelection.ts";

const 사진 = (id: string, date: string) => ({ id, date });

test("날짜로 묶되 묶음 차례는 탭 격자에서 처음 나온 차례를 따른다", () => {
  const 묶음 = groupByDate([사진("a", "10월 2일"), 사진("b", "10월 1일"), 사진("c", "10월 2일"), 사진("d", "")], "날짜 미정");

  assert.deepEqual(묶음.map((하나) => 하나.date), ["10월 2일", "10월 1일", "날짜 미정"]);
  assert.deepEqual(묶음[0].photos.map((하나) => 하나.id), ["a", "c"]);
  assert.deepEqual(galleryOrder(묶음), ["a", "c", "b", "d"]);
});

test("날짜마다 머리 한 줄, 그 아래로 네 장씩 줄을 세운다", () => {
  const 묶음 = groupByDate(
    ["a", "b", "c", "d", "e"].map((id) => 사진(id, "첫날")).concat([사진("f", "둘째 날")]),
    "날짜 미정",
  );
  const 줄 = galleryRows(묶음, 4);

  assert.deepEqual(줄.map((하나) => 하나.kind), ["머리", "줄", "줄", "머리", "줄"]);
  assert.deepEqual(줄[0].kind === "머리" && 줄[0].ids, ["a", "b", "c", "d", "e"]);
  assert.equal(줄[2].kind === "줄" && 줄[2].first, 4);
  assert.equal(줄[4].kind === "줄" && 줄[4].first, 5);
});

const 칸: GalleryMetrics = { columns: 4, width: 398, gap: 2, header: 40 };

test("칸은 가장자리까지 채우고 사이에만 틈을 둔다", () => {
  assert.equal(tileSizeOf(칸), 98);
});

test("손가락이 놓인 자리로 몇 번째 사진인지 셈으로 찾는다", () => {
  const 줄 = galleryRows(groupByDate(
    ["a", "b", "c", "d", "e"].map((id) => 사진(id, "첫날")).concat([사진("f", "둘째 날")]),
    "날짜 미정",
  ), 4);
  const 자리 = rowOffsets(줄, 칸);

  assert.deepEqual(자리, [0, 40, 140, 240, 280, 380]);
  // 머리 위는 사진이 아니다.
  assert.equal(tileAt(줄, 자리, 칸, 10, 20), -1);
  assert.equal(tileAt(줄, 자리, 칸, 10, 50), 0);
  assert.equal(tileAt(줄, 자리, 칸, 250, 50), 2);
  // 한 장뿐인 줄의 빈 칸을 지나가면 그 줄의 마지막 사진이다.
  assert.equal(tileAt(줄, 자리, 칸, 390, 150), 4);
  assert.equal(tileAt(줄, 자리, 칸, 10, 300), 5);
  // 목록 밖.
  assert.equal(tileAt(줄, 자리, 칸, 10, 380), -1);
  assert.equal(tileAt(줄, 자리, 칸, 10, -1), -1);
});

test("끌어서 고르면 짚은 사진부터 지금 사진까지 더하고, 되돌아오면 지나친 것은 끌기 전으로 돌아온다", () => {
  const 차례 = ["a", "b", "c", "d", "e"];

  assert.deepEqual(dragSelect(["e"], 차례, 1, 3, true), ["e", "b", "c", "d"]);
  // 3까지 갔다가 2로 돌아오면 d 는 다시 빠진다(끌기 전에 없었다).
  assert.deepEqual(dragSelect(["e"], 차례, 1, 2, true), ["e", "b", "c"]);
  // 거꾸로 끌면 짚은 쪽에서 가까운 것부터 붙는다.
  assert.deepEqual(dragSelect([], 차례, 3, 1, true), ["d", "c", "b"]);
  // 고른 사진에서 시작하면 뺀다.
  assert.deepEqual(dragSelect(["a", "b", "c", "d"], 차례, 1, 2, false), ["a", "d"]);
  // 자리를 못 찾으면 그대로다.
  assert.deepEqual(dragSelect(["a"], 차례, -1, 2, true), ["a"]);
});

test("누르면 넣고 빼며, 고른 차례를 남긴다", () => {
  assert.deepEqual(toggleOne(["a"], "c"), ["a", "c"]);
  assert.deepEqual(toggleOne(["a", "c"], "a"), ["c"]);
});

test("날짜 머리는 다 골랐으면 모두 빼고, 아니면 빠진 것만 더한다", () => {
  assert.equal(allChosen(["a", "b"], ["a", "b"]), true);
  assert.equal(allChosen(["a"], ["a", "b"]), false);
  assert.equal(allChosen(["a"], []), false);
  assert.deepEqual(toggleDay(["x", "a"], ["a", "b"]), ["x", "a", "b"]);
  assert.deepEqual(toggleDay(["x", "a", "b"], ["a", "b"]), ["x"]);
});

test("지워진 사진은 고른 목록에서 빠진다", () => {
  const 고른_것 = ["a", "b"];
  assert.equal(keepExisting(고른_것, ["a", "b", "c"]), 고른_것);
  assert.deepEqual(keepExisting(고른_것, ["b"]), ["b"]);
});

test("남이 올린 사진은 빼고 되는 것만 삭제한다", () => {
  const 갈림 = splitManageable(["a", "b", "c"], (id) => id !== "b");

  assert.deepEqual(갈림, { allowed: ["a", "c"], skipped: 1 });
  assert.deepEqual(deleteConfirmText(2, 1), {
    title: "사진 2장을 삭제할까요?",
    body: "삭제한 사진은 휴지통에서 7일 안에 되돌릴 수 있어요. 다른 사람이 올린 사진 1장은 삭제되지 않아요.",
  });
  // 한 장이면 한 장 지울 때와 같은 말이다.
  assert.equal(deleteConfirmText(1, 0).title, "이 사진을 삭제할까요?");
  assert.equal(deletedText(3, 0), "사진 3장을 삭제했어요");
  assert.equal(deletedText(1, 2), "사진을 삭제했어요. 다른 사람 사진 2장은 그대로 뒀어요");
});

test("저장 결과는 실패와 업로드 중이라 뺀 것을 나눠 말한다", () => {
  assert.equal(savedText({ saved: 3, failed: 0, skipped: 0 }), "사진 3장을 저장했어요");
  assert.equal(savedText({ saved: 2, failed: 1, skipped: 1 }), "사진 2장을 저장했어요. 1장은 저장하지 못했어요, 업로드 중인 1장은 뺐어요");
  assert.equal(savedText({ saved: 0, failed: 2, skipped: 0 }), "사진을 저장하지 못했어요");
});

test("카드도 함께 고르면 사진과 카드를 나눠 말한다", () => {
  // 사진은 휴지통으로 가고 카드는 바로 없어진다. 섞여 있으면 둘 다 적는다.
  assert.deepEqual(deleteConfirmText(1, 0, 1), {
    title: "이 카드를 삭제할까요?",
    body: "삭제한 카드는 되돌릴 수 없어요. 카드만 없어지고 사진은 그대로 남아요.",
  });
  assert.equal(deleteConfirmText(3, 0, 1).title, "사진 2장과 카드 1장을 삭제할까요?");
  assert.equal(deletedText(2, 0, 1), "사진 2장과 카드 1장을 삭제했어요");
  assert.equal(deletedText(0, 0, 2), "카드 2장을 삭제했어요");
  assert.equal(
    savedText({ saved: 2, failed: 0, skipped: 0, cards: 1 }),
    "사진 2장과 카드 1장을 저장했어요",
  );
  // 아직 그림을 만들어 두지 않은 카드는 빼고, 몇 장을 뺐는지 알린다.
  assert.equal(
    savedText({ saved: 0, failed: 0, skipped: 0, cards: 1, cardsSkipped: 2 }),
    "카드 1장을 저장했어요. 아직 만들지 않은 카드 2장은 뺐어요",
  );
});

test("카드를 골라 두면 카드로 만들지 않는다", () => {
  const 카드다 = (id: string) => id === "card-1";
  const 결과 = cardFromSelection(["a", "card-1"], 4, 카드다);

  assert.equal(결과.ok, false);
  assert.equal(!결과.ok && 결과.reason, "카드에 넣을 사진만 골라 주세요");
  // 사진만 골랐으면 그대로 된다.
  assert.deepEqual(cardFromSelection(["a", "b"], 4, 카드다), { ok: true, ids: ["a", "b"] });
});

test("사진첩 맨 위 묶음은 카드다", () => {
  // 카드를 「카드」 날짜로 두고 앞에 세우면 날짜 묶기가 그대로 맨 위에 놓는다.
  const 묶음 = groupByDate(
    [{ id: "card-1", date: CARD_GROUP }, { id: "a", date: "9월 22일" }],
    "날짜 없음",
  );

  assert.deepEqual(묶음.map((하나) => 하나.date), [CARD_GROUP, "9월 22일"]);
});

test("카드는 1~4장일 때만 만들고, 고른 차례를 그대로 쓴다", () => {
  assert.deepEqual(cardFromSelection(["c", "a"], 4), { ok: true, ids: ["c", "a"] });
  assert.equal(cardFromSelection([], 4).ok, false);
  const 넘침 = cardFromSelection(["a", "b", "c", "d", "e"], 4);
  assert.equal(넘침.ok, false);
  assert.equal(!넘침.ok && 넘침.reason, "카드에는 사진을 4장까지 넣을 수 있어요");
});

test("되돌리기는 지운 사진을 원래 자리에 넣는다", () => {
  const 남은_것 = [{ id: "b" }, { id: "d" }];
  const 되돌림 = reinsertAt(남은_것, [{ item: { id: "c" }, index: 2 }, { item: { id: "a" }, index: 0 }]);

  assert.deepEqual(되돌림.map((하나) => 하나.id), ["a", "b", "c", "d"]);
  // 이미 다시 생긴 것은 두 번 넣지 않는다.
  assert.deepEqual(reinsertAt([{ id: "a" }], [{ item: { id: "a" }, index: 0 }]).map((하나) => 하나.id), ["a"]);
});

test("탭 격자는 사진을 여섯 장까지 놓고 넘치면 사진첩을 연다. 카드는 탭에 남는다", () => {
  assert.deepEqual(memoryPreview("전체", 10, 2, false), { photos: 6, cards: 2, gallery: true, moreCards: 0 });
  assert.deepEqual(memoryPreview("사진", 4, 2, false), { photos: 4, cards: 0, gallery: false, moreCards: 0 });
  assert.deepEqual(memoryPreview("카드", 10, 8, false), { photos: 0, cards: 6, gallery: false, moreCards: 2 });
  assert.deepEqual(memoryPreview("카드", 10, 8, true), { photos: 0, cards: 8, gallery: false, moreCards: 2 });
});
