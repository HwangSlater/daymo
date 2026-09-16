import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNotice } from "./noticeImport.ts";
import type { NoticeDraft } from "./noticeImport.ts";
import {
  duplicateKeys,
  noticeCounts,
  noticeImportReport,
  runNoticeImport,
  transportKeyOf,
} from "./noticeImportPlan.ts";
import type { NoticeImportApi } from "./noticeImportPlan.ts";

/**
 * 공지 본문은 `docs/02-raw-travel-data.md` 에서 가져왔다. 서식을 그대로 두고
 * 길이만 줄였다. 내용은 그 문서와 마찬가지로 전부 가상이다.
 */
const 공지 = `# 제목: 9월 22일 ~ 9월 24일 전주 한옥마을

댓글
—————— 먹고 싶은 것 리스트 ——————

[담에 가용]
구름국수 덕진점
[https://map.naver.com/p/search/구름국수](https://map.naver.com/p/search/구름국수)
,
❤️ 버섯전골 준비물

[기본]
소고기 250
숙주 200
,
————————— 숙소 정보 —————————

[https://example.com/stay/000000](https://example.com/stay/000000)

달빛한옥
전주 완산구 은행로 12 달빛한옥
[https://map.naver.com/p/search/달빛한옥](https://map.naver.com/p/search/달빛한옥)
,
————————— 예약 정보 —————————

체크인 15:00
체크아웃 12:00
,
—————— 챙길 것 ——————

[하늘]
보조배터리 1개

[공용]
돗자리
,
————————— 교통편 —————————

가는 편
- 하늘 : KTX 대전 08:10 → 전주 09:36 (예매 완료)
,
[수요일]

- 점심 : 온기식탁
,
알 수 없는 줄 하나
`;

const 초안 = parseNotice(공지, { today: "2026-09-16" });
const 사람표 = [{ id: "m-하늘", name: "하늘" }, { id: "m-여울", name: "여울" }];
/** 채워 넣을 여행의 기간. 공지의 기간과 같을 필요는 없다. */
const 여행날짜 = ["2026-09-22", "2026-09-23", "2026-09-24"];

type Call = { kind: string; tripId: string; id: string; body: unknown };

/** 서버 대신 부른 것을 적어 두는 가짜 API. */
function spyApi(fail: (kind: string, calls: Call[]) => boolean = () => false) {
  const calls: Call[] = [];
  let serial = 0;
  const record = (kind: string) => async (tripId: string, id: string, body: unknown) => {
    if (fail(kind, calls)) throw new Error(`${kind} 를 넣지 못했어요`);
    calls.push({ kind, tripId, id, body });
    return {};
  };
  const api: NoticeImportApi = {
    newId: () => `id-${++serial}`,
    createPlace: record("place"),
    createStay: record("stay"),
    createTransport: record("transport"),
    createScheduleItem: record("schedule"),
    createRecipe: record("recipe"),
    createChecklistItem: record("checklist"),
    createMemo: record("memo"),
  };
  return { api, calls, of: (kind: string) => calls.filter((call) => call.kind === kind) };
}

const 기본옵션 = { tripId: "trip-1", tripDates: 여행날짜, roster: 사람표, keepLeftovers: true };

test("미리 보기 개수는 비어 있는 종류를 빼고 센다", () => {
  assert.deepEqual(noticeCounts(초안), [
    { label: "장소", count: 1 },
    { label: "숙소", count: 1 },
    { label: "교통편", count: 1 },
    { label: "일정", count: 1 },
    { label: "요리", count: 1 },
    { label: "재료", count: 2 },
    { label: "준비물", count: 2 },
    { label: "읽지 못한 줄", count: 1 },
  ]);
});

// ---------------------------------------------------------------------------
// 이미 있는 것 가려내기
// ---------------------------------------------------------------------------

test("이미 여행에 있는 이름은 겹친 줄로 가려낸다", () => {
  assert.deepEqual(
    duplicateKeys(초안, {
      places: ["구름국수 덕진점"],
      recipes: ["버섯전골"],
      packing: ["돗자리"],
    }),
    ["장소:0", "요리:0", "준비:1"],
  );
});

test("띄어쓰기와 대소문자가 달라도 같은 것으로 본다", () => {
  assert.deepEqual(duplicateKeys(초안, { places: ["구름국수덕진점"] }), ["장소:0"]);
  assert.deepEqual(duplicateKeys(초안, { packing: [" 보조배터리 "] }), ["준비:0"]);
});

test("숙소는 장소로 들어가 있어도 겹친 것으로 본다", () => {
  // 숙소를 넣을 때 장소를 먼저 만든다. 그래서 장소 목록에 이름이 남는다.
  assert.deepEqual(duplicateKeys(초안, { places: ["달빛한옥"] }), ["숙소:0"]);
  assert.deepEqual(duplicateKeys(초안, { stays: ["달빛한옥"] }), ["숙소:0"]);
});

test("교통편은 이름이 없어 방향과 구간으로 견준다", () => {
  const 열쇠 = transportKeyOf(초안.transports[0]);
  assert.deepEqual(duplicateKeys(초안, { transports: [열쇠] }), ["교통:0"]);
  assert.deepEqual(duplicateKeys(초안, { transports: ["오는편대전전주"] }), []);
});

test("겹치는 것이 없으면 빈 목록이다", () => {
  assert.deepEqual(duplicateKeys(초안, {}), []);
});

// ---------------------------------------------------------------------------
// 넣기
// ---------------------------------------------------------------------------

test("여행을 새로 만들지 않고 고른 여행에 붙인다", async () => {
  const spy = spyApi();
  const result = await runNoticeImport(초안, 기본옵션, spy.api);
  assert.ok(spy.calls.length > 0);
  assert.ok(spy.calls.every((call) => call.tripId === "trip-1"));
  assert.deepEqual(result.failed, []);
});

test("장소는 지도 링크를 그대로 두고 대괄호 상태는 태그가 된다", async () => {
  const spy = spyApi();
  await runNoticeImport(초안, 기본옵션, spy.api);
  assert.deepEqual(spy.of("place")[0].body, {
    name: "구름국수 덕진점",
    area: null,
    address: null,
    category: "장소",
    status: "saved",
    tags: ["담에 가용"],
    memo: null,
    mapUrl: "https://map.naver.com/p/search/구름국수",
  });
});

test("숙소는 장소를 먼저 만들고 여행의 첫날·마지막 날로 체크인·체크아웃을 붙인다", async () => {
  // 서버 숙소에는 이름·주소 칸이 없다. 붙일 장소가 없으면 이름이 사라진다.
  const spy = spyApi();
  await runNoticeImport(초안, 기본옵션, spy.api);
  const 숙소장소 = spy.of("place")[1];
  assert.equal((숙소장소.body as { name: string }).name, "달빛한옥");
  assert.equal((숙소장소.body as { address: string }).address, "전주 완산구 은행로 12 달빛한옥");
  assert.deepEqual(spy.of("stay")[0].body, {
    tripPlaceId: 숙소장소.id,
    checkInAt: "2026-09-22T15:00",
    checkOutAt: "2026-09-24T12:00",
    showInSchedule: true,
  });
});

test("교통편은 가는 편이면 첫날, 오는 편이면 마지막 날로 둔다", async () => {
  const spy = spyApi();
  await runNoticeImport(초안, 기본옵션, spy.api);
  assert.deepEqual(spy.of("transport")[0].body, {
    direction: "outbound",
    method: "ktx",
    date: "2026-09-22",
    departureName: "대전",
    departureTime: "08:10",
    arrivalName: "전주",
    arrivalTime: "09:36",
    ownerMembershipId: "m-하늘",
    bookingStatus: "booked",
    note: null,
    showInSchedule: true,
  });
});

test("여행 기간 밖의 날짜는 지어내지 않고 날짜 없이 넣는다", async () => {
  // 서버가 기간 밖 날짜를 거부한다. 거부당하면 그 줄은 영영 들어가지 못한다.
  const spy = spyApi();
  await runNoticeImport(초안, { ...기본옵션, tripDates: ["2026-10-01", "2026-10-02"] }, spy.api);
  const 일정 = spy.of("schedule")[0].body as { date: string | null; time: string | null; title: string };
  assert.equal(일정.title, "온기식탁");
  assert.equal(일정.date, null);
  assert.equal(일정.time, null);
});

test("여행 기간 안의 날짜면 그대로 넣는다", async () => {
  const spy = spyApi();
  await runNoticeImport(초안, 기본옵션, spy.api);
  assert.deepEqual(spy.of("schedule")[0].body, {
    date: "2026-09-23",
    time: null,
    title: "온기식탁",
    type: "meal",
    note: "점심",
    tripPlaceId: null,
    mapUrl: null,
  });
});

test("요리 재료에도 앱이 id 를 붙여 보낸다", async () => {
  // id 없이 보내면 서버가 새 id 를 붙여 기기 모습과 영영 어긋난다.
  const spy = spyApi();
  await runNoticeImport(초안, 기본옵션, spy.api);
  const 요리 = spy.of("recipe")[0].body as { name: string; ingredients: { id: string; name: string; category: string }[] };
  assert.equal(요리.name, "버섯전골");
  assert.deepEqual(요리.ingredients.map((item) => item.name), ["소고기", "숙주"]);
  assert.ok(요리.ingredients.every((item) => item.id));
  assert.equal(요리.ingredients[0].category, "기본");
});

test("준비물 담당은 사람 표에 있으면 id 로, 없으면 태그로 간다", async () => {
  const spy = spyApi();
  await runNoticeImport(초안, { ...기본옵션, roster: [] }, spy.api);
  const [하늘것, 공용것] = spy.of("checklist").map((call) => call.body as {
    name: string; ownerMembershipId: string | null; isShared: boolean; tags: string[];
  });
  assert.equal(하늘것.name, "보조배터리");
  assert.equal(하늘것.ownerMembershipId, null);
  assert.deepEqual(하늘것.tags, ["하늘"]);
  assert.equal(공용것.isShared, true);
  assert.deepEqual(공용것.tags, []);

  const 있을때 = spyApi();
  await runNoticeImport(초안, 기본옵션, 있을때.api);
  const 담당 = 있을때.of("checklist")[0].body as { ownerMembershipId: string | null; tags: string[] };
  assert.equal(담당.ownerMembershipId, "m-하늘");
  assert.deepEqual(담당.tags, []);
});

test("숙소 예약 링크와 읽지 못한 줄은 메모로 남는다", async () => {
  const spy = spyApi();
  await runNoticeImport(초안, 기본옵션, spy.api);
  const 메모들 = spy.of("memo").map((call) => (call.body as { body: string }).body);
  assert.ok(메모들.some((body) => body.includes("달빛한옥 예약: https://example.com/stay/000000")));
  assert.ok(메모들.some((body) => body.startsWith("공지에서 읽지 못한 줄") && body.includes("- 알 수 없는 줄 하나")));
});

test("읽지 못한 줄을 남기지 않기로 하면 메모를 만들지 않는다", async () => {
  const spy = spyApi();
  await runNoticeImport(초안, { ...기본옵션, keepLeftovers: false }, spy.api);
  const 메모들 = spy.of("memo").map((call) => (call.body as { body: string }).body);
  assert.ok(!메모들.some((body) => body.startsWith("공지에서 읽지 못한 줄")));
});

test("하나가 실패해도 나머지를 계속 넣고 어디까지 넣었는지 알려 준다", async () => {
  const spy = spyApi((kind) => kind === "checklist");
  const result = await runNoticeImport(초안, 기본옵션, spy.api);
  assert.equal(result.failed.length, 2);
  assert.deepEqual(result.failed.map((row) => row.label), ["준비물 보조배터리", "준비물 돗자리"]);
  assert.ok(result.made.some((row) => row.label === "요리"));
  assert.ok(result.made.some((row) => row.label === "메모"));
  assert.ok(noticeImportReport(result).includes("2개는 넣지 못했어요 (준비물 보조배터리"));
});

test("숙소 장소를 못 만들면 그 숙소의 체크인은 보내지 않는다", async () => {
  // 붙일 장소가 없는 숙소는 이름 없는 빈 줄이 된다. 넣지 않는 편이 낫다.
  const spy = spyApi((kind, calls) => kind === "place" && calls.filter((call) => call.kind === "place").length === 1);
  const result = await runNoticeImport(초안, 기본옵션, spy.api);
  assert.equal(spy.of("stay").length, 0);
  assert.deepEqual(result.failed.map((row) => row.label), ["숙소 달빛한옥"]);
});

test("건너뛴 개수도 함께 알려 준다", () => {
  assert.equal(
    noticeImportReport({ made: [{ label: "장소", count: 3 }], skipped: 2, failed: [] }),
    "장소 3개 를 넣었어요. 이미 있던 2개는 건너뛰었어요.",
  );
  assert.equal(
    noticeImportReport({ made: [], skipped: 0, failed: [] }),
    "넣은 것이 없어요.",
  );
});

test("아무것도 켜지 않았으면 서버를 부르지 않는다", async () => {
  const spy = spyApi();
  const 빈초안: NoticeDraft = {
    title: "", startDate: "", endDate: "", regionName: "",
    places: [], stays: [], transports: [], recipes: [], packing: [], schedule: [], memos: [], leftovers: [],
  };
  const result = await runNoticeImport(빈초안, { ...기본옵션, skipped: 4 }, spy.api);
  assert.deepEqual(spy.calls, []);
  assert.deepEqual(result.made, []);
  assert.equal(result.skipped, 4);
});
