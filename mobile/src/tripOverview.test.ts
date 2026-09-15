import assert from "node:assert/strict";
import { test } from "node:test";

import { checkinLabelOf, homeSummaryOf, parseTripOverview } from "./tripOverview.ts";

const overview = {
  stay: { name: "달빛한옥", checkInAt: "2026-10-01T15:00" },
  scheduleCount: 5,
  placeCount: 4,
  restaurantCount: 1,
  cafeCount: 2,
  packingTotal: 3,
  packingDone: 1,
  spentTotal: 60000.5,
};

test("서버 요약이 있으면 기기에 기록이 없어도 숫자가 나온다", () => {
  // 새로 로그인한 기기다. 상세 화면을 연 적이 없어 기록에는 참가자뿐이다.
  const summary = homeSummaryOf({ overview, planning: {}, serverCurrency: "KRW" });

  assert.deepEqual(summary, {
    stayName: "달빛한옥",
    checkin: "10월 1일 15:00",
    scheduleCount: 5,
    placeCount: 4,
    restaurantCount: 1,
    cafeCount: 2,
    packingTotal: 3,
    packingDone: 1,
    spent: 60000.5,
    currency: "KRW",
  });
});

test("서버 요약이 있으면 기기에 남은 옛 기록보다 요약을 쓴다", () => {
  // 다른 멤버가 준비물을 더 넣었다. 기기 기록은 그 전 모습이다.
  const summary = homeSummaryOf({
    overview: { ...overview, packingTotal: 4 },
    planning: { packingItems: [{ id: "a" }], packingDone: [] },
  });

  assert.equal(summary.packingTotal, 4);
});

test("요약이 없으면 기기의 기록으로 센다", () => {
  const summary = homeSummaryOf({
    planning: {
      stay: { name: "바다집", checkin: "8월 21일 15:00" },
      schedule: [{}, {}],
      places: [{ category: "식당" }, { category: "카페" }, { category: "구경" }],
      packingItems: [{ id: "a" }, { id: "b" }],
      // 지운 준비물의 체크는 세지 않는다.
      packingDone: ["a", "gone"],
      expenses: [{ amount: 1000 }, { amount: 2500 }],
      currency: "JPY",
    },
  });

  assert.deepEqual(summary, {
    stayName: "바다집",
    checkin: "8월 21일 15:00",
    scheduleCount: 2,
    placeCount: 3,
    restaurantCount: 1,
    cafeCount: 1,
    packingTotal: 2,
    packingDone: 1,
    spent: 3500,
    currency: "JPY",
  });
});

test("기록도 요약도 없으면 전부 비어 있다", () => {
  const summary = homeSummaryOf({});

  assert.equal(summary.stayName, "");
  assert.equal(summary.checkin, "");
  assert.equal(summary.scheduleCount + summary.placeCount + summary.packingTotal + summary.spent, 0);
});

test("이름 없는 서버 숙소는 상세 화면처럼 숙소라고 적고, 체크인이 없으면 미정이다", () => {
  const summary = homeSummaryOf({ overview: { ...overview, stay: { name: null, checkInAt: null } } });

  assert.equal(summary.stayName, "숙소");
  assert.equal(summary.checkin, "");
});

test("숙소가 없는 요약이면 숙소 칸이 빈다", () => {
  const summary = homeSummaryOf({
    overview: { ...overview, stay: null },
    planning: { stay: { name: "옛 숙소", checkin: "8월 21일 15:00" } },
  });

  assert.equal(summary.stayName, "");
});

test("모양이 틀린 요약은 없는 것으로 보고 기록을 쓴다", () => {
  assert.equal(parseTripOverview({ ...overview, placeCount: "많음" }), undefined);
  assert.equal(parseTripOverview(null), undefined);
  assert.equal(homeSummaryOf({ overview: { scheduleCount: 1 }, planning: { schedule: [{}, {}] } }).scheduleCount, 2);
});

test("지출 합을 문자열로 받아도 읽는다", () => {
  assert.equal(parseTripOverview({ ...overview, spentTotal: "1200.50" })?.spentTotal, 1200.5);
});

test("체크인 시각을 숙소 화면의 글자로 바꾼다", () => {
  assert.equal(checkinLabelOf("2026-12-24T09:05"), "12월 24일 09:05");
  assert.equal(checkinLabelOf(null), "");
  assert.equal(checkinLabelOf("내일"), "");
});
