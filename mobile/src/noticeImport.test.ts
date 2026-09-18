import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseHeadline,
  parseNotice,
  regionOfTitle,
  splitNotices,
  splitQuantity,
  tripDates,
  urlOf,
} from "./noticeImport.ts";

/**
 * 시험 자료는 `docs/02-raw-travel-data.md` 에서 그대로 가져왔다. 그 문서가
 * "앱으로 옮길 때 파서가 마주칠 서식" 이라며 모아 둔 글이고, 내용은 전부
 * 가상이다. 서식을 고치지 않았으니 줄 하나라도 바꾸면 시험이 무의미해진다.
 */
const 전주공지 = `# 제목: 9월 22일 ~ 9월 24일 전주 한옥마을

댓글
—————— 먹고 싶은 것 리스트 ——————

소나기식당 본점
[https://map.naver.com/p/search/소나기식당](https://map.naver.com/p/search/소나기식당)

[담에 가용]
구름국수 덕진점
[https://map.naver.com/p/search/구름국수](https://map.naver.com/p/search/구름국수)

[9.23 토 디너 예약]
소나기식당 별관
[https://map.naver.com/p/search/소나기식당 별관](https://map.naver.com/p/search/소나기식당 별관)

온기식탁 완산점
[https://map.naver.com/p/search/온기식탁](https://map.naver.com/p/search/온기식탁)
,
—————— 해먹을 거! ——————

버섯전골

참치 김밥, 스팸계란 김밥
,
❤️ 버섯전골 준비물

[기본]
소고기 250
배추1/2 250(20-24장)
깻잎 2묶음(20장)
숙주 200
느타리버섯 한줌

[추가] 좋아하는 거
팽이버섯 청경채 새우 애호박 슬라이스 양배추 표고버섯 등등

[육수] - 동행이 제조해오기
물 600
코인육수 1정 (여유있게 2개)
국간장 2큰술
참치액 2큰술
맛술 2큰술
다진마늘 1큰술
후추 솔솔

- 여유있게 1.5배로 가져와서 남기기

[소스 - 간장베이스]
진간장 3큰술
식초 1큰술
설탕 0.7큰술
레몬청 0.7큰술
다진양파 1큰술
다진 홍고추 1큰술

[소스 - 고추냉이]
고추냉이 1/3큰술
진간장 3큰술
맛술 1큰술

- 여유있게 2배, 고추냉이 따로 챙기기

새우 넣을거면 식초 챙기기
,
————————— 숙소 정보 —————————

[https://example.com/stay/000000](https://example.com/stay/000000)

달빛한옥
전주 완산구 은행로 12 달빛한옥
[https://map.naver.com/p/search/달빛한옥](https://map.naver.com/p/search/달빛한옥)
,
————————— 예약 정보 —————————

[https://example.com/booking/0000000000](https://example.com/booking/0000000000)

체크인 15:00
체크아웃 12:00
,
[금요일]

- 점심 : 온기식탁
- 늦은 저녁 : 숙소에서 해먹기

[토요일]
메뉴

- 버섯전골
- 마파두부, 치즈떡볶이, 볶음밥

[일요일]

- 13:30 점심 : 소나기식당

마파두부 레시피 (1인분)

[재료]

- 연두부 1팩 (약 300g)
- 다진 돼지고기 100g
- 대파 1/3대
- 생강 1작은술 (다진 것)
- 식용유 1큰술
- 고춧가루 1큰술
- 두반장 1큰술
- 치킨스톡(큐브형) 1/2개
- 물 150mL
- 후추 약간
- 전분 1큰술
- 물 2큰술 (전분물용)

[조리 순서]

1. 대파와 생강을 잘게 다진다.
2. 팬에 식용유를 두르고 중약불에서 고춧가루를 10~15초 볶아 고추기름을 만든다.
3. 대파와 생강을 넣고 1분 정도 볶는다.
4. 다진 돼지고기를 넣고 익을 때까지 볶는다.
5. 두반장을 넣고 30초 정도 볶는다.
6. 물 150mL와 치킨스톡 1/2개를 넣고 끓인다.
7. 연두부를 큼직하게 떠 넣고 2~3분간 약불에서 끓인다.
8. 후추를 넣는다.
9. 전분 1큰술 + 물 2큰술을 섞은 전분물을 조금씩 넣어 농도를 맞춘다.
`;

const 강릉공지 = `# 제목: 8월 18일 ~ 8월 19일 강릉 안목

댓글
—————— 먹고 싶은 것 리스트 ——————

[웨이팅 김]
구름국수 안목점
[https://map.naver.com/p/search/구름국수 안목점](https://map.naver.com/p/search/구름국수 안목점)
,
—————— 챙길 것 ——————

[하늘]
보조배터리 1개
지갑과 신분증
카메라 1대, 여분 배터리 2개

[여울]
멀미약
우산 2개

[공용]
돗자리
블루투스 스피커
,
————————— 교통편 —————————

가는 편
- 하늘 : KTX 대전 08:10 → 전주 09:36 (예매 완료)
- 여울 : 버스 청주 07:50 → 전주 10:05 (예매 완료)

오는 편
- 하늘 : KTX 전주 20:15 → 대전 21:41
- 여울 : 버스 전주 21:30 → 청주 23:45
,
————————— 기록 —————————

느리게 걸어서 더 좋았던 날

계획대로 되지 않은 순간도 있었지만, 그래서 더 오래 기억할 여행이 된 것 같다.
`;

/** 두 공지 모두 2026년 9월에 옮긴다고 본다. 연도 없는 날을 올해로 읽는다. */
const 오늘 = "2026-09-16";
const 전주 = parseNotice(전주공지, { today: 오늘 });
const 강릉 = parseNotice(강릉공지, { today: 오늘 });

// ---------------------------------------------------------------------------
// 머리글
// ---------------------------------------------------------------------------

test("머리글에서 여행 이름과 기간을 읽는다", () => {
  assert.equal(전주.title, "전주 한옥마을");
  assert.equal(전주.startDate, "2026-09-22");
  assert.equal(전주.endDate, "2026-09-24");
  assert.equal(강릉.title, "강릉 안목");
  assert.equal(강릉.startDate, "2026-08-18");
  assert.equal(강릉.endDate, "2026-08-19");
});

test("연도를 안 적었으면 석 달 넘게 앞선 날은 작년으로 읽는다", () => {
  // 공지는 대개 다녀온 뒤에 옮긴다. 1월에 옮긴 12월 여행이 11달 뒤로 가면 안 된다.
  assert.equal(parseHeadline("# 제목: 12월 30일 ~ 1월 1일 속초", "2026-01-05").startDate, "2025-12-30");
  assert.equal(parseHeadline("# 제목: 12월 30일 ~ 1월 1일 속초", "2026-01-05").endDate, "2026-01-01");
  assert.equal(parseHeadline("# 제목: 9월 22일 ~ 9월 24일 전주", "2026-09-16").startDate, "2026-09-22");
});

test("연도와 점 표기도 읽는다", () => {
  assert.deepEqual(parseHeadline("# 제목: 2024년 3월 2일 ~ 3월 5일 경주 여행", "2026-09-16"), {
    title: "경주 여행",
    startDate: "2024-03-02",
    endDate: "2024-03-05",
  });
  assert.deepEqual(parseHeadline("제목: 5.1 ~ 5.3 남해", "2026-09-16"), {
    title: "남해",
    startDate: "2026-05-01",
    endDate: "2026-05-03",
  });
});

test("기간이 없으면 전부 여행 이름이다", () => {
  assert.deepEqual(parseHeadline("# 제목: 🌊 여름 바다 모임", "2026-09-16"), {
    title: "여름 바다 모임",
    startDate: "",
    endDate: "",
  });
});

test("도시 이름을 앱이 쓰는 지역으로 옮긴다", () => {
  assert.equal(전주.regionName, "전북");
  assert.equal(강릉.regionName, "강원");
  assert.equal(regionOfTitle("서귀포 한 바퀴"), "제주");
  assert.equal(regionOfTitle("강원 인제 자작나무숲"), "강원");
  assert.equal(regionOfTitle("어딘가의 이름 없는 마을"), "");
});

test("여행 기간의 날짜를 차례대로 준다", () => {
  assert.deepEqual(tripDates("2026-09-22", "2026-09-24"), ["2026-09-22", "2026-09-23", "2026-09-24"]);
  assert.deepEqual(tripDates("", ""), []);
  // 끝이 앞서면 첫날 하나만 준다. 기간을 잘못 읽었을 때 화면이 멈추지 않게 한다.
  assert.deepEqual(tripDates("2026-09-24", "2026-09-22"), ["2026-09-24"]);
});

// ---------------------------------------------------------------------------
// 링크
// ---------------------------------------------------------------------------

test("두 번 적힌 링크에서 주소를 한 번만 꺼낸다", () => {
  assert.equal(
    urlOf("[https://map.naver.com/p/search/온기식탁](https://map.naver.com/p/search/온기식탁)"),
    "https://map.naver.com/p/search/온기식탁",
  );
  assert.equal(urlOf("https://example.com/stay/000000"), "https://example.com/stay/000000");
  assert.equal(urlOf("체크인 15:00"), "");
});

test("주소 안의 띄어쓰기는 %20 으로 바꾼다", () => {
  // 서버도 앱도 공백이 든 주소는 받지 않는다. 그대로 두면 지도 링크가 사라진다.
  assert.equal(
    urlOf("[https://map.naver.com/p/search/소나기식당 별관](https://map.naver.com/p/search/소나기식당 별관)"),
    "https://map.naver.com/p/search/소나기식당%20별관",
  );
  assert.equal(전주.places[2].mapUrl, "https://map.naver.com/p/search/소나기식당%20별관");
});

// ---------------------------------------------------------------------------
// 장소
// ---------------------------------------------------------------------------

test("장소는 이름과 지도 링크로 읽고 앞줄의 대괄호는 메모로 남긴다", () => {
  assert.equal(전주.places.length, 4);
  assert.deepEqual(전주.places[0], {
    name: "소나기식당 본점",
    address: "",
    mapUrl: "https://map.naver.com/p/search/소나기식당",
    note: "",
  });
  assert.equal(전주.places[1].name, "구름국수 덕진점");
  assert.equal(전주.places[1].note, "담에 가용");
  assert.equal(전주.places[2].note, "9.23 토 디너 예약");
  assert.equal(강릉.places[0].note, "웨이팅 김");
});

// ---------------------------------------------------------------------------
// 숙소와 예약
// ---------------------------------------------------------------------------

test("숙소는 이름·주소·지도 링크와 체크인·체크아웃까지 모은다", () => {
  assert.equal(전주.stays.length, 1);
  assert.deepEqual(전주.stays[0], {
    name: "달빛한옥",
    address: "전주 완산구 은행로 12 달빛한옥",
    mapUrl: "https://map.naver.com/p/search/달빛한옥",
    checkIn: "15:00",
    checkOut: "12:00",
    bookingUrl: "https://example.com/stay/000000",
  });
});

test("숙소에 붙일 자리가 없는 예약 링크는 읽지 못한 줄로 남는다", () => {
  // 서버 숙소에는 링크 칸이 하나뿐이다. 버리지 않고 사용자에게 보여 준다.
  assert.ok(전주.leftovers.includes("https://example.com/booking/0000000000"));
});

// ---------------------------------------------------------------------------
// 요리와 재료
// ---------------------------------------------------------------------------

test("이름만 적은 요리와 재료까지 적은 요리를 하나로 묶는다", () => {
  assert.deepEqual(
    전주.recipes.map((recipe) => recipe.name),
    ["버섯전골", "참치 김밥", "스팸계란 김밥", "마파두부", "치즈떡볶이", "볶음밥"],
  );
  assert.equal(전주.recipes[1].ingredients.length, 0);
});

test("단위 없는 수량도 이름과 갈라 읽는다", () => {
  const 전골 = 전주.recipes[0];
  assert.deepEqual(전골.ingredients[0], { name: "소고기", quantity: "250", group: "기본", buy: false });
  assert.deepEqual(전골.ingredients[1], { name: "배추1/2", quantity: "250(20-24장)", group: "기본", buy: false });
  assert.deepEqual(전골.ingredients[2], { name: "깻잎", quantity: "2묶음(20장)", group: "기본", buy: false });
});

test("숫자가 없는 수량 말도 읽는다", () => {
  assert.deepEqual(splitQuantity("느타리버섯 한줌"), { name: "느타리버섯", quantity: "한줌" });
  assert.deepEqual(splitQuantity("후추 솔솔"), { name: "후추", quantity: "솔솔" });
  assert.deepEqual(splitQuantity("- 후추 약간".replace("- ", "")), { name: "후추", quantity: "약간" });
  assert.deepEqual(splitQuantity("지갑과 신분증"), { name: "지갑과 신분증", quantity: "" });
  assert.deepEqual(splitQuantity("다진 홍고추 1큰술"), { name: "다진 홍고추", quantity: "1큰술" });
  assert.deepEqual(splitQuantity("코인육수 1정 (여유있게 2개)"), { name: "코인육수", quantity: "1정 (여유있게 2개)" });
});

test("대괄호는 재료의 분류가 된다", () => {
  const 묶음 = new Map(전주.recipes[0].ingredients.map((item) => [item.name, item.group]));
  assert.equal(묶음.get("소고기"), "기본");
  assert.equal(묶음.get("코인육수"), "육수");
  assert.equal(묶음.get("다진양파"), "소스 - 간장베이스");
  assert.equal(묶음.get("고추냉이"), "소스 - 고추냉이");
});

test("재료 줄에 `-` 가 붙는 요리는 `-` 를 표시로 읽는다", () => {
  // 버섯전골은 `-` 로 시작하는 줄이 곁글이고, 마파두부는 재료마다 `-` 가 붙는다.
  const 마파두부 = 전주.recipes.find((recipe) => recipe.name === "마파두부");
  assert.ok(마파두부);
  assert.equal(마파두부.ingredients.length, 12);
  assert.deepEqual(마파두부.ingredients[0], { name: "연두부", quantity: "1팩 (약 300g)", group: "", buy: false });
  const 전골곁글 = 전주.recipes[0].note;
  assert.ok(전골곁글.includes("여유있게 1.5배로 가져와서 남기기"));
  assert.ok(전골곁글.includes("새우 넣을거면 식초 챙기기"));
  assert.ok(!전주.recipes[0].ingredients.some((item) => item.name.includes("여유있게")));
});

test("번호 목록은 조리 순서로 메모에 남는다", () => {
  const 마파두부 = 전주.recipes.find((recipe) => recipe.name === "마파두부");
  assert.ok(마파두부);
  assert.ok(마파두부.note.startsWith("1. 대파와 생강을 잘게 다진다."));
  assert.ok(마파두부.note.includes("9. 전분 1큰술 + 물 2큰술을 섞은 전분물을 조금씩 넣어 농도를 맞춘다."));
});

test("이모지가 섞인 제목은 이모지를 떼고 요리 이름으로 쓴다", () => {
  assert.equal(전주.recipes[0].name, "버섯전골");
});

test("분류 뒤에 붙은 곁글은 메모로 옮긴다", () => {
  assert.ok(전주.recipes[0].note.includes("육수: 동행이 제조해오기"));
});

// ---------------------------------------------------------------------------
// 준비물
// ---------------------------------------------------------------------------

test("준비물은 대괄호를 담당으로, 쉼표를 줄 나누기로 읽는다", () => {
  assert.deepEqual(강릉.packing, [
    { name: "보조배터리", quantity: "1개", owner: "하늘" },
    { name: "지갑과 신분증", quantity: "", owner: "하늘" },
    { name: "카메라", quantity: "1대", owner: "하늘" },
    { name: "여분 배터리", quantity: "2개", owner: "하늘" },
    { name: "멀미약", quantity: "", owner: "여울" },
    { name: "우산", quantity: "2개", owner: "여울" },
    { name: "돗자리", quantity: "", owner: "공용" },
    { name: "블루투스 스피커", quantity: "", owner: "공용" },
  ]);
});

// ---------------------------------------------------------------------------
// 교통편
// ---------------------------------------------------------------------------

test("교통편은 가는 편·오는 편을 나눠 읽고 예매 여부까지 본다", () => {
  assert.equal(강릉.transports.length, 4);
  assert.deepEqual(강릉.transports[0], {
    owner: "하늘",
    direction: "가는 편",
    method: "KTX",
    departure: "대전",
    departureTime: "08:10",
    arrival: "전주",
    arrivalTime: "09:36",
    booked: true,
  });
  assert.equal(강릉.transports[1].method, "버스");
  assert.equal(강릉.transports[2].direction, "오는 편");
  assert.equal(강릉.transports[2].booked, false);
});

test("무궁화호와 고속·시외버스를 「버스」와 구분해 읽는다", () => {
  const 읽힌것 = parseNotice(
    `# 제목: 8월 18일 ~ 8월 19일 강릉 안목

————————— 교통편 —————————

가는 편
- 하늘 : 무궁화호 대전 08:10 → 전주 09:36
- 여울 : 고속버스 청주 07:50 → 전주 10:05
- 바다 : 시외버스 청주 07:50 → 전주 10:05
- 산 : 버스 청주 07:50 → 전주 10:05
`,
    { today: 오늘 },
  );
  assert.deepEqual(
    읽힌것.transports.map((편) => 편.method),
    ["무궁화호", "고속버스", "시외버스", "버스"],
  );
});

// ---------------------------------------------------------------------------
// 요일별 계획과 기록
// ---------------------------------------------------------------------------

test("요일 묶음의 `점심 : 가게` 줄은 일정이 된다", () => {
  assert.deepEqual(전주.schedule, [
    { date: "", time: "", title: "온기식탁", note: "점심", type: "meal" },
    { date: "", time: "", title: "숙소에서 해먹기", note: "늦은 저녁", type: "meal" },
    { date: "", time: "13:30", title: "소나기식당", note: "점심", type: "meal" },
  ]);
  // 이 공지의 기간은 화~목인데 묶음은 금·토·일이다. 날짜를 지어내지 않고 비워 둔다.
});

test("기간 안에 있는 요일이면 날짜까지 맞춘다", () => {
  const 맞춘것 = parseNotice(
    ["# 제목: 9월 22일 ~ 9월 24일 전주", "", "[수요일]", "", "- 점심 : 온기식탁"].join("\n"),
    { today: 오늘 },
  );
  assert.deepEqual(맞춘것.schedule, [
    { date: "2026-09-23", time: "", title: "온기식탁", note: "점심", type: "meal" },
  ]);
});

test("`메뉴` 아래의 줄은 일정이 아니라 요리다", () => {
  const 이름들 = 전주.recipes.map((recipe) => recipe.name);
  assert.ok(이름들.includes("치즈떡볶이"));
  assert.ok(이름들.includes("볶음밥"));
  assert.ok(!전주.schedule.some((item) => item.title === "치즈떡볶이"));
});

test("기록 구획은 줄 바꿈을 지켜 메모 하나가 된다", () => {
  assert.deepEqual(강릉.memos, [
    "느리게 걸어서 더 좋았던 날\n\n계획대로 되지 않은 순간도 있었지만, 그래서 더 오래 기억할 여행이 된 것 같다.",
  ]);
});

// ---------------------------------------------------------------------------
// 공지 여러 편과 못 읽은 줄
// ---------------------------------------------------------------------------

test("공지 여러 편이 붙어 있으면 머리글마다 가른다", () => {
  const 붙인것 = `${전주공지}\n---\n\n${강릉공지}`;
  const 편들 = splitNotices(붙인것);
  assert.equal(편들.length, 2);
  assert.equal(parseNotice(편들[0], { today: 오늘 }).title, "전주 한옥마을");
  assert.equal(parseNotice(편들[1], { today: 오늘 }).title, "강릉 안목");
});

test("머리글이 없으면 통째로 한 편이다", () => {
  assert.deepEqual(splitNotices("소나기식당 본점"), ["소나기식당 본점"]);
  assert.deepEqual(splitNotices("   "), []);
});

test("공지에 늘 붙는 `댓글` 은 못 읽은 줄로 세지 않는다", () => {
  assert.ok(!전주.leftovers.includes("댓글"));
  assert.deepEqual(강릉.leftovers, []);
});

test("어디에도 못 넣은 줄은 버리지 않고 모은다", () => {
  const 읽힌것 = parseNotice(
    ["# 제목: 9월 22일 ~ 9월 24일 전주", "", "알 수 없는 줄", "또 다른 줄"].join("\n"),
    { today: 오늘 },
  );
  assert.deepEqual(읽힌것.leftovers, ["알 수 없는 줄", "또 다른 줄"]);
});

test("빈 글도 읽다가 멈추지 않는다", () => {
  const 빈것 = parseNotice("", { today: 오늘 });
  assert.equal(빈것.title, "");
  assert.deepEqual(빈것.places, []);
  assert.deepEqual(빈것.leftovers, []);
});
