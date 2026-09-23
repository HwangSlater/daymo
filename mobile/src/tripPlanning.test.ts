import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PACKING_SHARED,
  PACKING_UNASSIGNED,
  collapsedGroupsFor,
  cookingOwnerOptions,
  initialMemoryData,
  mergeStayDateTime,
  normalizePackingOwner,
  orderedScheduleItems,
  packingOwnerOptions,
  packingTags,
  parseAiRecipes,
  photosByTarget,
  placeAreaFromAddress,
  reservationScheduleRow,
  stayMomentOf,
  transportScheduleRow,
  일정종류_읽기,
  일정종류인가,
  요리메모_보이기,
  요리메모_읽기,
  자리에_넣기,
  type CookingItem,
  type MemoryPhoto,
  type PackingItem,
  type Recipe,
  type ReservationInfo,
  type ScheduleItem,
  type Transportation,
} from "./tripPlanning.ts";

let 번호 = 0;
const 새_id = () => `id-${++번호}`;

const 일정 = (extra: Partial<ScheduleItem> = {}): ScheduleItem => ({
  time: "10:00",
  title: "아침",
  note: "",
  mapUrl: "",
  ...extra,
});

test("일정은 날짜 차례로, 같은 날은 시각 차례로 선다", () => {
  const 날짜들 = ["2026-09-22", "2026-09-23"];
  const 줄들 = [
    일정({ title: "둘째 날 아침", date: "2026-09-23", time: "수 · 08:00" }),
    일정({ title: "날짜 없음", time: "09:00" }),
    일정({ title: "첫날 저녁", date: "2026-09-22", time: "화 · 19:00" }),
    일정({ title: "첫날 점심", date: "2026-09-22", time: "화 · 12:30" }),
  ];

  assert.deepEqual(
    orderedScheduleItems(줄들, 날짜들).map((줄) => 줄.title),
    ["첫날 점심", "첫날 저녁", "둘째 날 아침", "날짜 없음"],
  );
});

test("달을 넘겨도 날짜 차례가 맞는다", () => {
  // 이름표(`31일(수)`·`1일(목)`)를 그대로 비교하던 때는 달이 바뀌면 차례가 뒤집혔다.
  // 날짜 키는 칸 순서가 곧 달력 순서다.
  const 날짜들 = ["2026-09-30", "2026-10-01"];
  const 줄들 = [
    일정({ title: "10월 아침", date: "2026-10-01", time: "목 · 08:00" }),
    일정({ title: "9월 저녁", date: "2026-09-30", time: "수 · 19:00" }),
  ];

  assert.deepEqual(orderedScheduleItems(줄들, 날짜들).map((줄) => 줄.title), ["9월 저녁", "10월 아침"]);
});

test("시각을 못 읽는 줄은 그 날의 맨 뒤로 간다", () => {
  const 날짜들 = ["2026-09-22"];
  const 줄들 = [
    일정({ title: "시간 미정", date: "2026-09-22", time: "화 · 시간 미정" }),
    일정({ title: "아침", date: "2026-09-22", time: "화 · 08:00" }),
  ];

  assert.deepEqual(orderedScheduleItems(줄들, 날짜들).map((줄) => 줄.title), ["아침", "시간 미정"]);
});

test("교통편과 예약은 늘 같은 모양의 일정 줄이 된다", () => {
  const 교통: Transportation = {
    id: "t1",
    owner: "하늘",
    direction: "가는 편",
    method: "KTX",
    date: "2026-09-22",
    departure: "대전",
    departureTime: "08:10",
    arrival: "전주",
    arrivalTime: "09:36",
    status: "예매 완료",
    showInSchedule: true,
  };
  assert.deepEqual(transportScheduleRow(교통), {
    time: "화 · 08:10",
    date: "2026-09-22",
    title: "KTX 대전 출발",
    note: "전주 09:36 도착 · 하늘 · 가는 편",
    mapUrl: "",
    transportationId: "t1",
  });

  const 예약: ReservationInfo = {
    id: "r1",
    name: "소나기식당",
    date: "2026-09-23",
    time: "",
    people: "2명",
    status: "확인 필요",
    place: "완산",
    showInSchedule: true,
  };
  assert.deepEqual(reservationScheduleRow(예약), {
    time: "수 · 시간 미정",
    date: "2026-09-23",
    title: "소나기식당",
    note: "예약 · 확인 필요",
    mapUrl: "",
    reservationId: "r1",
  });
});

test("숙소 칸은 한쪽만 바꾸고 나머지는 적힌 것을 지킨다", () => {
  assert.equal(mergeStayDateTime("9월 22일 14:00", "time", "15:30", "9월 22일", "14:00"), "9월 22일 15:30");
  assert.equal(mergeStayDateTime("9월 22일 14:00", "date", "9월 23일", "9월 22일", "14:00"), "9월 23일 14:00");
  // 적힌 것이 없으면 기본값으로 채운다.
  assert.equal(mergeStayDateTime("", "date", "9월 22일", "9월 22일", "14:00"), "9월 22일 14:00");
  assert.equal(mergeStayDateTime("", "time", "11:00", "9월 24일", "11:00"), "9월 24일 11:00");
});

test("체크인·체크아웃은 첫날 0시부터의 분이 된다", () => {
  const 날짜들 = ["9월 22일", "9월 23일", "9월 24일"];
  assert.equal(stayMomentOf("9월 22일 14:00", 날짜들), 840);
  assert.equal(stayMomentOf("9월 24일 11:00", 날짜들), 2 * 1440 + 660);
  assert.equal(stayMomentOf("9월 30일 11:00", 날짜들), -1);
  assert.equal(stayMomentOf("9월 22일", 날짜들), -1);
});

test("GPT 가 돌려준 줄에서 요리와 재료만 읽는다", () => {
  번호 = 0;
  const 읽음 = parseAiRecipes(
    [
      "안녕하세요 이렇게 정리했어요",
      "요리 | 버섯전골 | 첫날 저녁 | https://example.com",
      "재료 | 배추 | 1/4통 | 기본 | 하늘",
      "재료 | 표고버섯",
      "재료 | 국간장 | | | ",
      "요리 | 김밥",
      "쓸모없는 줄",
    ].join("\n"),
    새_id,
  );

  assert.equal(읽음.length, 2);
  assert.deepEqual(읽음[0], {
    id: "id-1",
    name: "버섯전골",
    note: "첫날 저녁",
    url: "https://example.com",
    ingredients: [
      { id: "id-2", name: "배추", quantity: "1/4통", group: "기본", owner: "하늘" },
      { id: "id-3", name: "표고버섯", quantity: "미정", group: "기본", owner: "미정" },
      { id: "id-4", name: "국간장", quantity: "미정", group: "기본", owner: "미정" },
    ],
  });
  assert.equal(읽음[1].name, "김밥");
  assert.deepEqual(읽음[1].ingredients, []);
});

test("요리 줄보다 먼저 나온 재료는 버린다", () => {
  번호 = 0;
  assert.deepEqual(parseAiRecipes("재료 | 배추 | 1통 | 기본 | 하늘", 새_id), []);
});

test("재료가 많고 묶음이 셋 넘을 때만 접는다", () => {
  const 재료 = (group: string, index: number): CookingItem => ({
    id: `c${index}`,
    name: `재료 ${index}`,
    quantity: "1",
    group,
    owner: "미정",
  });
  const 짧은: Recipe = { id: "r", name: "국", note: "", ingredients: [재료("기본", 1), 재료("육수", 2)] };
  assert.deepEqual(collapsedGroupsFor(짧은), []);

  const 긴: Recipe = {
    id: "r",
    name: "전골",
    note: "",
    ingredients: Array.from({ length: 10 }, (_, index) => 재료(["기본", "육수", "양념"][index % 3], index)),
  };
  assert.deepEqual(collapsedGroupsFor(긴), ["기본", "육수", "양념"]);
  assert.deepEqual(collapsedGroupsFor(undefined), []);
});

test("담당 고르기는 참가자 뒤에 공용·미정, 재료는 미정 먼저 구매 끝", () => {
  assert.deepEqual(packingOwnerOptions(["하늘", "여울"]), ["하늘", "여울", PACKING_SHARED, PACKING_UNASSIGNED]);
  assert.deepEqual(cookingOwnerOptions(["하늘", "여울"]), ["미정", "하늘", "여울", "구매"]);
});

test("자리로 적힌 옛 담당은 참가자 이름으로 읽는다", () => {
  assert.equal(normalizePackingOwner("나", ["하늘", "여울"]), "하늘");
  assert.equal(normalizePackingOwner("동행", ["하늘", "여울"]), "여울");
  assert.equal(normalizePackingOwner("함께", ["하늘", "여울"]), PACKING_SHARED);
  assert.equal(normalizePackingOwner("하늘", ["하늘", "여울"]), "하늘");
  // 참가자가 모자라면 미정으로 둔다. 없는 사람 이름을 지어내지 않는다.
  assert.equal(normalizePackingOwner("동행", ["하늘"]), PACKING_UNASSIGNED);
});

test("옛 준비물의 source·timing 은 이름표로 읽는다", () => {
  const 새것: PackingItem = { id: "a", name: "충전기", quantity: "1개", owner: "하늘", tags: ["집에서"] };
  assert.deepEqual(packingTags(새것), ["집에서"]);

  const 옛것 = { id: "b", name: "우산", quantity: "1개", owner: "하늘", source: "집에서", timing: "출발 아침" };
  assert.deepEqual(packingTags(옛것 as unknown as PackingItem), ["집에서", "출발 아침"]);
});

test("일정 종류의 옛 값 「장소」는 「방문」으로 읽는다", () => {
  assert.equal(일정종류_읽기("장소"), "방문");
  assert.equal(일정종류_읽기("식사"), "식사");
  assert.equal(일정종류인가("장소"), true);
  assert.equal(일정종류인가("행사"), true);
  assert.equal(일정종류인가("완산"), false);
});

test("요리 메모의 옛 값 「메모 없음」은 빈 것으로 읽는다", () => {
  assert.equal(요리메모_읽기("메모 없음"), "");
  assert.equal(요리메모_읽기("  국물 넉넉히  "), "국물 넉넉히");
  assert.equal(요리메모_보이기(""), "메모 없음");
  assert.equal(요리메모_보이기("국물 넉넉히"), "국물 넉넉히");
});

test("주소 앞 두 마디를 지역으로 쓰고 없으면 자리만 지킨다", () => {
  assert.equal(placeAreaFromAddress("전주 완산구 은행로 12"), "전주 완산구");
  assert.equal(placeAreaFromAddress("  "), "위치 미정");
  assert.equal(placeAreaFromAddress("", "완산"), "완산");
});

test("지운 줄은 있던 자리에 도로 들어간다", () => {
  assert.deepEqual(자리에_넣기(["가", "다"], "나", 1), ["가", "나", "다"]);
  assert.deepEqual(자리에_넣기(["가", "나"], "다", 9), ["가", "나", "다"]);
  assert.deepEqual(자리에_넣기(["나", "다"], "가", -3), ["가", "나", "다"]);
});

test("사진은 붙인 곳별로 한 번에 묶인다", () => {
  const 사진 = (id: string, links: MemoryPhoto["links"]): MemoryPhoto => ({
    id,
    color: "#fff",
    date: "2026-09-22",
    caption: "",
    links,
  });
  const 표 = photosByTarget(
    [
      사진("p1", [{ targetType: "place", targetId: "place-1" }]),
      사진("p2", [{ targetType: "place", targetId: "place-1" }, { targetType: "stay", targetId: "stay-1" }]),
      사진("p3", undefined),
    ],
    "place",
  );

  assert.deepEqual(표.get("place-1")?.map((photo) => photo.id), ["p1", "p2"]);
  assert.equal(표.get("stay-1"), undefined);
});

test("기록 탭의 처음 모습은 예시 여행에만 사진과 일기를 넣는다", () => {
  assert.deepEqual(initialMemoryData(), { photos: [], diaries: [] });

  const 예시 = initialMemoryData("8월 21일 — 8월 23일", true);
  assert.equal(예시.photos.length, 6);
  assert.equal(예시.diaries.length, 1);
  assert.equal(예시.diaries[0].date, "8월 21일 — 8월 23일");
});
