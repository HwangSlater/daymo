import assert from "node:assert/strict";
import { test } from "node:test";

import {
  homeCardBlockedReason,
  homeCoverRows,
  keepsakeBodyOf,
  keepsakeCardOf,
  keepsakeDateStamp,
  keepsakeAddBlockedReason,
  keepsakeFileName,
  keepsakeFrameOf,
  keepsakeLayoutOf,
  keepsakeListOf,
  keepsakeRowSlots,
  keepsakeSizeOf,
  keepsakeSlotCaption,
  keepsakeStatLines,
  keepsakeTextOf,
  keepsakePhotoFullReason,
  moveKeepsakePhoto,
  peopleLineOf,
  sameKeepsakeCard,
  suggestedStyleOf,
  toggleKeepsakePhoto,
} from "./tripCard.ts";

const 사진들 = ["a", "b", "c", "d", "e"];

test("아무것도 고르지 않아도 카드 한 장이 나온다", () => {
  const card = keepsakeCardOf(undefined, "가을 제주", 사진들);

  assert.equal(card.style, "필름");
  assert.equal(card.ratio, "세로");
  assert.equal(card.title, "가을 제주");
  // 가장 최근 사진 한 장으로 시작한다. 쓴 돈과 함께 간 사람은 꺼져 있다.
  assert.deepEqual(card.photoIds, ["a"]);
  assert.deepEqual(card.parts, ["이름", "기간", "지역", "문구"]);
  assert.deepEqual(card.stats, []);
  // 꾸미기는 다 꺼진 채로 시작한다. 틀 색만 사진관 기본인 검정이다.
  assert.equal(card.frameColor, "검정");
  assert.deepEqual(card.decor, []);
  assert.equal(card.dateStamp, false);
  assert.equal(card.photoCaptions, false);
});

test("모르는 값이 저장돼 있어도 기본으로 돌아가고 지운 사진은 빠진다", () => {
  const card = keepsakeCardOf(
    {
      style: "폴라로이드", ratio: "대각선", photoIds: ["c", "없는것", 7],
      parts: ["이름", "달력"], stats: ["지출", "온도"],
      // 켜고 끄기에 엉뚱한 값이 들어와도 꺼진 것으로 읽는다.
      frameColor: "형광", stickers: ["하트", "무지개"],
      dateStamp: "켬" as unknown as boolean, photoCaptions: 1 as unknown as boolean,
    },
    "가을 제주",
    사진들,
  );

  assert.equal(card.style, "필름");
  assert.equal(card.ratio, "세로");
  assert.deepEqual(card.photoIds, ["c"]);
  assert.deepEqual(card.parts, ["이름"]);
  assert.deepEqual(card.stats, ["지출"]);
  assert.equal(card.frameColor, "검정");
  // 옛 스티커 목록은 새 형식으로 옮겨진다. 모르는 값은 빠진다.
  assert.deepEqual(card.decor.map((하나) => 하나.kind), ["하트"]);
  // 켜고 끄기는 true 만 켠 것으로 읽는다.
  assert.equal(card.dateStamp, false);
  assert.equal(card.photoCaptions, false);
});

test("네컷 틀은 고른 값을 그대로 들고 온다", () => {
  const card = keepsakeCardOf(
    { style: "네컷 격자", stickers: ["체크", "별"], frameColor: "크림", dateStamp: true, photoCaptions: true },
    "가을 제주",
    사진들,
  );

  assert.equal(card.style, "네컷 격자");
  assert.equal(card.frameColor, "크림");
  // 켠 차례가 아니라 정해진 차례로 옮겨진다.
  assert.deepEqual(card.decor.map((하나) => 하나.kind), ["별", "체크"]);
  assert.equal(card.dateStamp, true);
  assert.equal(card.photoCaptions, true);
});

test("고른 사진이 모두 사라졌으면 남은 사진 한 장으로 돌아간다", () => {
  assert.deepEqual(keepsakeCardOf({ photoIds: ["없는것"] }, "여행", 사진들).photoIds, ["a"]);
  // 사진이 아예 없는 여행은 빈 목록이다. 화면이 이것으로 카드 만들기를 감춘다.
  assert.deepEqual(keepsakeCardOf({ photoIds: ["a"] }, "여행", []).photoIds, []);
});

test("제목이 여행 이름 그대로면 비워 보내 여행 이름을 따라간다", () => {
  const 그대로 = keepsakeBodyOf(keepsakeCardOf(undefined, "가을 제주", 사진들), "가을 제주");
  const 고침 = keepsakeBodyOf(
    { ...keepsakeCardOf(undefined, "가을 제주", 사진들), title: "우리의 가을", caption: " 또 가자 " },
    "가을 제주",
  );

  assert.equal(그대로.title, null);
  assert.equal(그대로.caption, null);
  assert.equal(고침.title, "우리의 가을");
  assert.equal(고침.caption, "또 가자");
});

test("사진은 넷까지 고르고 한 장은 남는다", () => {
  assert.deepEqual(toggleKeepsakePhoto(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleKeepsakePhoto(["a", "b"], "a"), ["b"]);
  // 마지막 한 장은 빼지 않는다. 사진 없는 카드는 빈 칸이다.
  assert.deepEqual(toggleKeepsakePhoto(["a"], "a"), ["a"]);
  // 꽉 찼으면 그대로 둔다. 말없이 밀어내면 무엇이 빠졌는지 알 수 없다.
  assert.deepEqual(toggleKeepsakePhoto(["a", "b", "c", "d"], "e"), ["a", "b", "c", "d"]);
  assert.equal(keepsakePhotoFullReason(["a", "b", "c"]), "");
  assert.ok(keepsakePhotoFullReason(["a", "b", "c", "d"]).includes("4장까지"));
});

test("종이 없는 프레임도 비율과 배치를 그대로 쓴다", () => {
  // 종이를 안 끼워도 사진을 어떤 비율로 담을지는 여전히 고를 일이다.
  assert.deepEqual(keepsakeSizeOf("정사각", "없음"), { width: 300, height: 300, exportWidth: 1080, exportHeight: 1080 });
  assert.deepEqual(keepsakeFrameOf("없음", 4).rows, [2, 2]);
  assert.equal(keepsakeFrameOf("없음", 4).notice, "");
  // 홈 화면에도 같은 배치로 담긴다.
  assert.deepEqual(homeCoverRows("없음", 3), [1, 2]);
  assert.equal(homeCardBlockedReason("없음", 4), "");
});

test("고른 사진의 차례를 한 칸씩 옮긴다", () => {
  assert.deepEqual(moveKeepsakePhoto(["a", "b", "c"], "b", true), ["b", "a", "c"]);
  assert.deepEqual(moveKeepsakePhoto(["a", "b", "c"], "b", false), ["a", "c", "b"]);
  // 끝에서 더 가면 그대로 둔다. 없는 사진도 그대로다.
  assert.deepEqual(moveKeepsakePhoto(["a", "b"], "a", true), ["a", "b"]);
  assert.deepEqual(moveKeepsakePhoto(["a", "b"], "b", false), ["a", "b"]);
  assert.deepEqual(moveKeepsakePhoto(["a", "b"], "z", true), ["a", "b"]);
});

test("꾸미는 중에는 틀의 칸을 다 펴 두고, 내보낼 때는 채운 만큼 줄인다", () => {
  const 펴둔_것 = keepsakeFrameOf("네컷", 1, true);
  assert.deepEqual(펴둔_것.rows, [1, 1, 1, 1]);
  assert.equal(펴둔_것.slots, 4);
  // 안내는 펴 두었는지와 상관없이 실제로 채운 수로 센다.
  assert.equal(펴둔_것.notice, "사진 3장을 더 고르면 4컷으로 꽉 차요");
  assert.equal(keepsakeFrameOf("네컷", 1).slots, 1);
  // 네컷 틀이 아니면 펴 둘 빈 칸이 없다.
  assert.deepEqual(keepsakeFrameOf("필름", 1, true).rows, [1]);
});

test("사진 수에 맞는 배치와 비율마다의 크기", () => {
  assert.deepEqual(keepsakeLayoutOf(1), [1]);
  assert.deepEqual(keepsakeLayoutOf(2), [2]);
  assert.deepEqual(keepsakeLayoutOf(3), [1, 2]);
  assert.deepEqual(keepsakeLayoutOf(4), [2, 2]);
  assert.deepEqual(keepsakeSizeOf("세로"), { width: 300, height: 375, exportWidth: 1080, exportHeight: 1350 });
  assert.deepEqual(keepsakeSizeOf("정사각"), { width: 300, height: 300, exportWidth: 1080, exportHeight: 1080 });
  assert.deepEqual(keepsakeSizeOf("가로"), { width: 300, height: 169, exportWidth: 1920, exportHeight: 1080 });
});

test("네컷 틀은 비율이 아니라 틀이 크기를 정한다", () => {
  // 스트립은 길쭉해야 스트립처럼 보인다. 비율 칸은 무시된다.
  assert.deepEqual(keepsakeSizeOf("가로", "네컷"), { width: 200, height: 600, exportWidth: 1080, exportHeight: 3240 });
  assert.deepEqual(keepsakeSizeOf("세로", "세컷"), { width: 200, height: 470, exportWidth: 1080, exportHeight: 2538 });
  assert.deepEqual(keepsakeSizeOf("가로", "네컷 격자"), { width: 300, height: 375, exportWidth: 1080, exportHeight: 1350 });
  assert.deepEqual(keepsakeSizeOf("세로", "네컷 가로"), { width: 300, height: 150, exportWidth: 1920, exportHeight: 960 });
});

test("네컷 틀의 칸 배치", () => {
  assert.deepEqual(keepsakeFrameOf("네컷", 4), { rows: [1, 1, 1, 1], slots: 4, want: 4, notice: "" });
  assert.deepEqual(keepsakeFrameOf("네컷 격자", 4), { rows: [2, 2], slots: 4, want: 4, notice: "" });
  assert.deepEqual(keepsakeFrameOf("네컷 가로", 4), { rows: [4], slots: 4, want: 4, notice: "" });
  assert.deepEqual(keepsakeFrameOf("세컷", 3), { rows: [1, 1, 1], slots: 3, want: 3, notice: "" });
  // 네컷이 아닌 스타일은 고른 수 그대로다.
  assert.deepEqual(keepsakeFrameOf("필름", 3), { rows: [1, 2], slots: 3, want: 3, notice: "" });
});

test("사진이 모자라면 칸을 비우지 않고 틀을 줄인 뒤 알린다", () => {
  const 둘 = keepsakeFrameOf("네컷", 2);
  assert.deepEqual(둘.rows, [1, 1]);
  assert.equal(둘.slots, 2);
  assert.equal(둘.notice, "사진 2장을 더 고르면 4컷으로 꽉 차요");
  // 격자도 빈 칸을 만들지 않는다. 셋이면 위 한 장 아래 두 장이다.
  assert.deepEqual(keepsakeFrameOf("네컷 격자", 3).rows, [1, 2]);
  assert.equal(keepsakeFrameOf("네컷 격자", 3).notice, "사진 1장을 더 고르면 4컷으로 꽉 차요");
  assert.deepEqual(keepsakeFrameOf("네컷 가로", 2).rows, [2]);
  assert.equal(keepsakeFrameOf("세컷", 4).notice, "");
  // 사진이 없다고 들어와도 한 칸은 그린다.
  assert.deepEqual(keepsakeFrameOf("네컷", 0).rows, [1]);
});

test("줄마다 몇 번째 사진부터인지 미리 나눈다", () => {
  // 한 사진이 두 칸에 들어가는 일이 없어야 한다.
  assert.deepEqual(keepsakeRowSlots([2, 2]), [
    { start: 0, count: 2 },
    { start: 2, count: 2 },
  ]);
  assert.deepEqual(keepsakeRowSlots([1, 1, 1, 1]).map((줄) => 줄.start), [0, 1, 2, 3]);
  assert.deepEqual(keepsakeRowSlots([1, 2]), [
    { start: 0, count: 1 },
    { start: 1, count: 2 },
  ]);
  assert.deepEqual(keepsakeRowSlots([4]), [{ start: 0, count: 4 }]);
});

test("날짜 도장과 칸 아래 설명", () => {
  assert.equal(keepsakeDateStamp("2026-09-15"), "2026.09.15");
  assert.equal(keepsakeDateStamp("날짜없음"), "");
  assert.equal(keepsakeDateStamp(undefined), "");
  assert.equal(keepsakeSlotCaption(" 안목 해변 ", true), "안목 해변");
  assert.equal(keepsakeSlotCaption("안목 해변", false), "");
  assert.equal(keepsakeSlotCaption("커피 거리에서 바다를 보며 마신 한 잔", true), "커피 거리에서 바다를 보며 마신…");
});

test("통계는 켰을 때만, 정해진 차례로 나온다", () => {
  const 켬 = { ...keepsakeCardOf(undefined, "여행", 사진들), parts: ["통계" as const], stats: ["지출" as const, "장소" as const] };
  const 셈 = { places: 7, photos: 12, days: 3, spent: "128,400원" };

  assert.deepEqual(keepsakeStatLines(켬, 셈), [
    { label: "다녀온 곳", value: "7곳" },
    { label: "쓴 돈", value: "128,400원" },
  ]);
  // 통계 줄 자체를 끄면 고른 숫자가 있어도 안 나온다.
  assert.deepEqual(keepsakeStatLines({ ...켬, parts: [] }, 셈), []);
});

test("끈 줄과 빈 줄은 카드에서 빠지고 사람 이름은 셋까지만 적는다", () => {
  const trip = { name: "가을 제주", period: "10월 1일 — 3일", region: "제주", people: ["하늘", "여울"] };
  const card = keepsakeCardOf(undefined, "가을 제주", 사진들);

  assert.deepEqual(keepsakeTextOf(card, trip), {
    title: "가을 제주", meta: "10월 1일 — 3일 · 제주", caption: "", people: "",
  });
  assert.deepEqual(keepsakeTextOf({ ...card, parts: ["사람"], caption: "또 가자" }, trip), {
    title: "", meta: "", caption: "", people: "하늘 · 여울",
  });
  assert.equal(peopleLineOf(["하늘", "여울", "새봄", "다온", "단비"]), "하늘 · 여울 · 새봄 외 2명");
  assert.equal(peopleLineOf([]), "");
});

test("파일 이름에서 못 쓰는 글자를 뺀다", () => {
  assert.equal(keepsakeFileName("제주/여행?"), "제주여행 기념카드");
  assert.equal(keepsakeFileName("   "), "여행 기념 카드 기념카드");
});

test("카드 목록은 정해진 차례로 읽히고 대표 사진 한 장을 알려 준다", () => {
  const 목록 = keepsakeListOf(
    [
      { id: "둘", settings: { style: "엽서", photoIds: ["b"] }, sortOrder: 2, createdAt: "2026-09-02T00:00:00Z" },
      { id: "하나", settings: { style: "네컷", photoIds: ["a", "b", "c", "d"] }, sortOrder: 1, createdAt: "2026-09-01T00:00:00Z" },
      // 차례가 같으면 만든 시각으로 가른다.
      { id: "셋", settings: { style: "세컷", photoIds: ["c", "d", "e"] }, sortOrder: 2, createdAt: "2026-09-03T00:00:00Z" },
    ],
    "가을 제주",
    사진들,
  );

  assert.deepEqual(목록.map((줄) => 줄.id), ["하나", "둘", "셋"]);
  assert.deepEqual(목록.map((줄) => 줄.label), ["네컷 · 사진 4장", "엽서 · 사진 1장", "세컷 · 사진 3장"]);
  assert.deepEqual(목록.map((줄) => 줄.coverPhotoId), ["a", "b", "c"]);
});

test("고른 사진 수에 어울리는 틀을 권한다", () => {
  assert.equal(suggestedStyleOf("필름", 4), "네컷");
  assert.equal(suggestedStyleOf("필름", 3), "세컷");
  assert.equal(suggestedStyleOf("필름", 2), "네컷 격자");
  // 이미 그 틀이면 권하지 않는다.
  assert.equal(suggestedStyleOf("네컷", 4), "");
  // 네컷 틀에 사진이 다 들어가면 그대로 둔다. 세컷에 두 장은 줄어들 뿐이라 권하지 않는다.
  assert.equal(suggestedStyleOf("세컷", 2), "");
  assert.equal(suggestedStyleOf("네컷", 3), "");
  // 한 장만 고르면 네컷 틀에서 한 장짜리 스타일로 되돌아오라고 권한다.
  assert.equal(suggestedStyleOf("네컷", 1), "필름");
  assert.equal(suggestedStyleOf("엽서", 1), "");
});

test("카드를 더 만들 수 없을 때만 까닭이 나온다", () => {
  assert.equal(keepsakeAddBlockedReason(0, 3), "");
  assert.equal(keepsakeAddBlockedReason(19, 3), "");
  assert.equal(keepsakeAddBlockedReason(20, 3), "카드는 여행마다 20장까지 모아 둘 수 있어요");
  assert.equal(keepsakeAddBlockedReason(0, 0), "사진을 한 장 추가하면 기념 카드를 만들 수 있어요");
});

test("세로로 쌓은 카드만 홈 화면에 담기지 않는다", () => {
  // 사진관 스트립은 줄이 칸보다 많다. 홈의 가로로 넓은 자리에 넣으면 손톱만 해진다.
  assert.ok(homeCardBlockedReason("네컷", 4).includes("세로로 길어서"));
  assert.ok(homeCardBlockedReason("세컷", 3).includes("세로로 길어서"));
  // 격자·가로 스트립과 한 장짜리 틀은 그대로 담긴다.
  assert.equal(homeCardBlockedReason("네컷 격자", 4), "");
  assert.equal(homeCardBlockedReason("네컷 가로", 4), "");
  assert.equal(homeCardBlockedReason("필름", 1), "");
  assert.equal(homeCardBlockedReason("엽서", 3), "");
  // 스트립이라도 한 장만 고르면 한 칸짜리라 담긴다.
  assert.equal(homeCardBlockedReason("네컷", 1), "");
});

test("홈 화면은 고른 카드와 같은 배치로 사진을 놓는다", () => {
  assert.deepEqual(homeCoverRows("네컷 격자", 4), [2, 2]);
  assert.deepEqual(homeCoverRows("네컷 가로", 4), [4]);
  assert.deepEqual(homeCoverRows("필름", 3), [1, 2]);
  // 카드 없이 사진 한 장만 골랐을 때와, 모르는 틀 이름이 왔을 때.
  assert.deepEqual(homeCoverRows(undefined, 1), [1]);
  assert.deepEqual(homeCoverRows("폴라로이드", 2), [2]);
  assert.deepEqual(homeCoverRows(null, 0), []);
});

test("손댄 것이 없으면 같은 카드로 본다", () => {
  const card = keepsakeCardOf(undefined, "가을 제주", 사진들);

  assert.equal(sameKeepsakeCard(card, { ...card }), true);
  assert.equal(sameKeepsakeCard(card, { ...card, style: "엽서" }), false);
  assert.equal(sameKeepsakeCard(card, { ...card, caption: "또 가자" }), false);
  assert.equal(
    sameKeepsakeCard(card, {
      ...card,
      decor: [{ id: "d1", kind: "하트", text: "", x: 0.5, y: 0.5, size: 0.16, angle: 0, z: 0 }],
    }),
    false,
  );
});
