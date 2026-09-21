import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MEMO_COLOR,
  PERSON_COLORS,
  dotColors,
  draftBody,
  draftProblem,
  monthCells,
  noteMeta,
  notesOnDay,
  personColor,
  tripBars,
  visibleRange,
  type CalendarNote,
} from "./calendarNotes.ts";

const 표 = [{ id: "m-하늘" }, { id: "m-여울" }, { id: "m-가람" }];

const 적음 = (extra: Partial<CalendarNote>): CalendarNote => ({
  id: "n",
  kind: "schedule",
  membershipId: "m-여울",
  title: "부산 출장",
  startDate: "2026-09-22",
  endDate: "2026-09-24",
  time: null,
  createdByMembershipId: "m-여울",
  version: 1,
  ...extra,
});

test("달 칸은 앞뒤 달 날짜로 주를 채운다", () => {
  // 2026년 9월 1일은 화요일이다.
  const 칸 = monthCells(2026, 9);
  assert.equal(칸.length, 35);
  assert.deepEqual(칸[0], { key: "2026-08-30", day: 30, inMonth: false });
  assert.deepEqual(칸[2], { key: "2026-09-01", day: 1, inMonth: true });
  assert.deepEqual(칸[34], { key: "2026-10-03", day: 3, inMonth: false });
  assert.deepEqual(visibleRange(2026, 9), { from: "2026-08-30", to: "2026-10-03" });
});

test("여행 막대는 주마다 한 토막이고, 달을 넘겨도 보이는 칸까지 잇는다", () => {
  const 막대 = tripBars([
    { name: "강릉 안목", start: "2026-09-15", end: "2026-09-17" },
    { name: "전주 한옥마을", start: "2026-09-30", end: "2026-10-01" },
  ], 2026, 9);

  const 강릉 = 막대.find((하나) => 하나.trip.name === "강릉 안목")!;
  assert.deepEqual([강릉.week, 강릉.startCol, 강릉.endCol, 강릉.startsHere, 강릉.endsHere], [2, 2, 4, true, true]);
  const 전주 = 막대.find((하나) => 하나.trip.name === "전주 한옥마을")!;
  assert.deepEqual([전주.week, 전주.startCol, 전주.endCol], [4, 3, 4]);
});

test("주를 넘는 여행은 줄마다 나뉘고 가운데 끝은 둥글지 않다", () => {
  const 막대 = tripBars([{ name: "제주", start: "2026-09-18", end: "2026-09-22" }], 2026, 9);
  assert.equal(막대.length, 2);
  assert.deepEqual([막대[0].startCol, 막대[0].endCol, 막대[0].startsHere, 막대[0].endsHere], [5, 6, true, false]);
  assert.deepEqual([막대[1].startCol, 막대[1].endCol, 막대[1].startsHere, 막대[1].endsHere], [0, 2, false, true]);
});

test("같은 주에 겹치는 여행은 층을 나누고, 둘을 넘으면 막대를 그리지 않는다", () => {
  const 막대 = tripBars([
    { name: "가", start: "2026-09-14", end: "2026-09-18" },
    { name: "나", start: "2026-09-15", end: "2026-09-16" },
    { name: "다", start: "2026-09-16", end: "2026-09-17" },
    { name: "라", start: "2026-09-19", end: "2026-09-19" },
  ], 2026, 9);
  const 층 = Object.fromEntries(막대.map((하나) => [하나.trip.name, 하나.lane]));
  assert.deepEqual(층, { 가: 0, 나: 1, 라: 0 });
});

test("사람 색은 표의 차례대로, 모르는 사람은 메모처럼 회색", () => {
  assert.equal(personColor("m-하늘", 표), PERSON_COLORS[0]);
  assert.equal(personColor("m-가람", 표), PERSON_COLORS[2]);
  assert.equal(personColor("m-나감", 표), MEMO_COLOR);
  assert.equal(personColor(null, 표), MEMO_COLOR);
});

test("그날의 점은 사람마다 하나, 메모는 회색 하나, 셋까지", () => {
  const 적은_것 = [
    적음({ id: "1" }),
    적음({ id: "2", title: "회의", startDate: "2026-09-24", endDate: "2026-09-24", time: "10:00" }),
    적음({ id: "3", membershipId: "m-하늘", title: "야근", startDate: "2026-09-24", endDate: "2026-09-24", time: "19:00" }),
    적음({ id: "4", kind: "memo", membershipId: null, title: "숙소 결제 마감", startDate: "2026-09-24", endDate: "2026-09-24" }),
    적음({ id: "5", membershipId: "m-가람", title: "치과", startDate: "2026-09-24", endDate: "2026-09-24" }),
  ];
  assert.deepEqual(dotColors(적은_것, "2026-09-24", 표), [PERSON_COLORS[1], PERSON_COLORS[0], PERSON_COLORS[2]]);
  assert.deepEqual(dotColors(적은_것, "2026-09-25", 표), []);
  // 목록은 일정이 먼저, 시각 순, 시각 없는 것은 뒤, 메모는 끝.
  assert.deepEqual(notesOnDay(적은_것, "2026-09-24").map((하나) => 하나.id), ["2", "3", "1", "5", "4"]);
});

test("저장하지 못하는 까닭을 먼저 알린다", () => {
  const 초안 = { kind: "schedule" as const, membershipId: "m-여울", title: "부산 출장", startDate: "2026-09-22", endDate: "2026-09-24", time: null };
  assert.equal(draftProblem(초안), "");
  assert.equal(draftProblem({ ...초안, title: "  " }), "일정 내용을 입력해 주세요");
  assert.equal(draftProblem({ ...초안, kind: "memo", title: "" }), "메모 내용을 입력해 주세요");
  assert.equal(draftProblem({ ...초안, membershipId: null }), "누구의 일정인지 골라 주세요");
  assert.equal(draftProblem({ ...초안, endDate: "2026-09-21" }), "끝나는 날이 시작하는 날보다 빨라요");
  assert.equal(draftProblem({ ...초안, endDate: "2026-11-30" }), "60일까지 이어서 적을 수 있어요");
  // 메모는 사람을 비워 보낸다.
  assert.equal(draftBody({ ...초안, kind: "memo" }).membershipId, null);
  assert.equal(draftBody({ ...초안, title: "  부산 출장 " }).title, "부산 출장");
});

test("목록 둘째 줄은 기간·시각, 없으면 하루 종일이나 메모", () => {
  assert.equal(noteMeta(적음({})), "9월 22일 — 9월 24일");
  assert.equal(noteMeta(적음({ startDate: "2026-09-24", endDate: "2026-09-24", time: "19:00" })), "19:00");
  assert.equal(noteMeta(적음({ startDate: "2026-09-24", endDate: "2026-09-24" })), "하루 종일");
  assert.equal(noteMeta(적음({ kind: "memo", startDate: "2026-09-24", endDate: "2026-09-24" })), "메모");
});
