import assert from "node:assert/strict";
import { test } from "node:test";

import {
  keepsakeBodyOf,
  keepsakeCardOf,
  keepsakeFileName,
  keepsakeLayoutOf,
  keepsakeSizeOf,
  keepsakeStatLines,
  keepsakeTextOf,
  peopleLineOf,
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
});

test("모르는 값이 저장돼 있어도 기본으로 돌아가고 지운 사진은 빠진다", () => {
  const card = keepsakeCardOf(
    { style: "네컷", ratio: "대각선", photoIds: ["c", "없는것", 7], parts: ["이름", "달력"], stats: ["지출", "온도"] },
    "가을 제주",
    사진들,
  );

  assert.equal(card.style, "필름");
  assert.equal(card.ratio, "세로");
  assert.deepEqual(card.photoIds, ["c"]);
  assert.deepEqual(card.parts, ["이름"]);
  assert.deepEqual(card.stats, ["지출"]);
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
  // 넘치면 가장 먼저 고른 것이 밀려난다.
  assert.deepEqual(toggleKeepsakePhoto(["a", "b", "c", "d"], "e"), ["b", "c", "d", "e"]);
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
