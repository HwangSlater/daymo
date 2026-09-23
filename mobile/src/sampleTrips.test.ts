import assert from "node:assert/strict";
import { test } from "node:test";

import { dateKey, shiftDateKey, tripDateKeys } from "./dates.ts";
import { sampleTripPlanning, sampleTrips } from "./sampleTrips.ts";

test("예시 여행의 내용은 여행의 실제 날짜 칸을 쓴다", () => {
  const 기록 = sampleTripPlanning("전주 한옥마을", "2026-09-22", "2026-09-24", ["하늘", "여울"]);
  const 날짜칸 = tripDateKeys("2026-09-22", "2026-09-24");

  for (const 줄 of 기록.schedule ?? []) {
    assert.ok(!줄.date || 날짜칸.includes(줄.date), `일정 날짜가 칸 밖이다: ${줄.date}`);
  }
  for (const 사진 of 기록.memories?.photos ?? []) {
    assert.ok(날짜칸.includes(사진.date), `사진 날짜가 칸 밖이다: ${사진.date}`);
  }
  for (const 편 of 기록.transportations ?? []) {
    assert.ok(날짜칸.includes(편.date), `교통편 날짜가 칸 밖이다: ${편.date}`);
  }
  assert.deepEqual(기록.reservations?.map((예약) => 예약.date), ["2026-09-23"]);
});

test("예시 여행의 담당은 넘긴 참가자 이름으로 바뀐다", () => {
  const 기록 = sampleTripPlanning("전주 한옥마을", "2026-09-22", "2026-09-24", ["가람", "새봄"]);
  const 담당 = new Set((기록.packingItems ?? []).map((item) => item.owner));

  assert.equal(담당.has("나"), false);
  assert.equal(담당.has("동행"), false);
  for (const 이름 of 담당) {
    assert.ok(["가람", "새봄", "공용", "미정"].includes(이름), `모르는 담당: ${이름}`);
  }

  const 재료담당 = new Set((기록.recipes ?? []).flatMap((recipe) => recipe.ingredients.map((item) => item.owner)));
  assert.equal(재료담당.has("하늘"), false);
  assert.equal(재료담당.has("여울"), false);
});

test("기간이 비었으면 오늘부터 사흘을 날짜 칸으로 쓴다", () => {
  const 기록 = sampleTripPlanning("어디든", "", "", ["하늘"]);

  assert.equal(기록.schedule?.[0].date, shiftDateKey(dateKey(new Date()), 0));
  assert.equal(기록.stay?.checkin, "8월 21일 14:00");
  // 참가자가 한 명이면 둘째 자리도 그 사람이다.
  assert.ok((기록.transportations ?? []).every((편) => 편.owner === "하늘"));
});

test("예시 여행 셋은 모두 예시 표시를 달고 기록이 붙어 있다", () => {
  assert.equal(sampleTrips.length, 3);
  for (const 여행 of sampleTrips) {
    assert.equal(여행.sample, true);
    // 서버 여행이 아니다. id 가 있으면 진짜 여행으로 오해해 서버에 올린다.
    assert.equal(여행.id, undefined);
    assert.ok((여행.planning?.expenses ?? []).length > 0);
    assert.ok(여행.start <= 여행.end);
  }
});

test("예시 지출의 날짜는 그 여행 기간 안이다", () => {
  for (const 여행 of sampleTrips) {
    const 날짜칸 = tripDateKeys(여행.start, 여행.end);
    for (const 지출 of 여행.planning?.expenses ?? []) {
      assert.ok(날짜칸.includes(지출.day), `${여행.name} 의 지출 날짜가 칸 밖이다: ${지출.day}`);
    }
  }
});
