import assert from "node:assert/strict";
import { test } from "node:test";

import type { ServerSpace, ServerTrip } from "./serverData.ts";
import {
  expenseSettingsFrom,
  latestTripFrom,
  rosterOfSpace,
  spaceFromServer,
  tripForSummary,
  tripFromServer,
} from "./serverTrips.ts";

const 하늘 = "11111111-1111-4111-8111-111111111111";
const 여울 = "22222222-2222-4222-8222-222222222222";

const 서버_공간 = (extra: Partial<ServerSpace> = {}): ServerSpace => ({
  id: "space-1",
  name: "우리 공간",
  relationshipType: "couple",
  timezone: "Asia/Seoul",
  startedOn: "2023-10-20",
  myRole: "owner",
  ...extra,
});

const 서버_여행 = (extra: Partial<ServerTrip> = {}): ServerTrip => ({
  id: "trip-1",
  spaceId: "space-1",
  title: "전주 한옥마을",
  regionCode: "45",
  regionName: "전북",
  startDate: "2026-09-22",
  endDate: "2026-09-24",
  status: "planning",
  summary: "숙소에서 수다",
  version: 3,
  participantMembershipIds: [],
  ...extra,
});

const 멤버들 = [
  { id: 하늘, displayName: "하늘", role: "owner" as const, isMe: true, status: "active" as const },
  { id: 여울, displayName: "여울", role: "editor" as const, isMe: false, status: "active" as const },
];

test("함께한 날을 적지 않았으면 비워 둔다", () => {
  assert.equal(spaceFromServer(서버_공간({ startedOn: null })).since, "");
  assert.equal(spaceFromServer(서버_공간()).since, "2023-10-20");
});

test("공간의 나는 내 membership id 로 가린다", () => {
  const 공간 = spaceFromServer(서버_공간(), 멤버들);

  assert.equal(공간.myMembershipId, 하늘);
  assert.equal(공간.relationship, "연인");
  // 멤버 목록에 나는 없다. 나는 `myMembershipId` 로만 들고 있는다.
  assert.deepEqual(공간.members.map((사람) => 사람.name), ["여울"]);
});

test("이름과 membership id 표는 나를 앱이 쓰는 이름으로 넣는다", () => {
  const 공간 = spaceFromServer(서버_공간(), 멤버들);
  const 표 = rosterOfSpace(공간, "내가 정한 이름");

  assert.equal(표[0]?.name, "내가 정한 이름");
  assert.equal(표.find((사람) => 사람.id === 여울)?.name, "여울");
});

test("서버 여행의 이름·날짜·지역을 그대로 옮긴다", () => {
  const 여행 = tripFromServer(서버_여행());

  assert.equal(여행.id, "trip-1");
  assert.equal(여행.version, 3);
  assert.equal(여행.name, "전주 한옥마을");
  assert.equal(여행.date, "9월 22일 — 24일");
  assert.equal(여행.mark, "09");
  assert.equal(여행.region, "전북");
  assert.equal(여행.archived, false);
  // 지역·요약이 비어 있어도 화면이 빈칸을 그리지 않게 채운다.
  assert.equal(tripFromServer(서버_여행({ regionName: null, summary: null })).region, "지역 미정");
  assert.equal(tripFromServer(서버_여행({ regionName: null, summary: null })).note, "");
});

test("같은 여행 id 는 늘 같은 색이다", () => {
  assert.equal(tripFromServer(서버_여행()).tone, tripFromServer(서버_여행({ title: "다른 이름" })).tone);
});

test("참가자가 정해져 있으면 이름으로 바꿔 기록에 둔다", () => {
  const 표 = rosterOfSpace(spaceFromServer(서버_공간(), 멤버들), "하늘");

  assert.deepEqual(tripFromServer(서버_여행({ participantMembershipIds: [여울] }), 표).planning?.participants, ["여울"]);
  // 비어 있으면 「공간 멤버 전원」이라 칸을 만들지 않는다.
  assert.equal(tripFromServer(서버_여행(), 표).planning, undefined);
});

test("홈에 깐 것을 해제한 것도 실어 보낸다", () => {
  const 여행 = tripFromServer(서버_여행({ coverPhotoId: null, coverCardId: null }));

  assert.ok("coverPhotoId" in 여행);
  assert.equal(여행.coverPhotoId, undefined);
  assert.deepEqual(여행.coverPhotoIds, []);
});

test("지운 여행일 때만 되돌릴 수 있는 시각을 싣는다", () => {
  assert.equal(tripFromServer(서버_여행()).deletionScheduledAt, undefined);
  assert.equal(
    tripFromServer(서버_여행({ deletionScheduledAt: "2026-10-01T00:00:00Z" })).deletionScheduledAt,
    "2026-10-01T00:00:00Z",
  );
  assert.equal(tripFromServer(서버_여행({ status: "archived" })).archived, true);
});

test("돈 설정은 서버가 문자열로 줘도 수로 읽는다", () => {
  assert.deepEqual(expenseSettingsFrom(서버_여행({ currencyCode: "USD", exchangeRate: "1350.5", budget: "500000" })), {
    currency: "USD",
    exchangeRate: 1350.5,
    budget: 500000,
    simplifySettlement: true,
  });
  // 적지 않았으면 원, 환율 1, 예산 없음, 정산은 묶는다.
  assert.deepEqual(expenseSettingsFrom(서버_여행()), {
    currency: "KRW",
    exchangeRate: 1,
    budget: 0,
    simplifySettlement: true,
  });
  assert.equal(expenseSettingsFrom(서버_여행({ simplifySettlement: false })).simplifySettlement, false);
});

test("홈 카드에 넘기는 칸은 요약·기록·통화뿐이다", () => {
  const 여행 = tripFromServer(서버_여행({ currencyCode: "JPY" }));

  assert.deepEqual(Object.keys(tripForSummary(여행)).sort(), ["overview", "planning", "serverCurrency"]);
  assert.equal(tripForSummary(여행).serverCurrency, "JPY");
});

test("새 여행 칸을 미리 채우는 값은 마지막 여행에서 온다", () => {
  const 표 = rosterOfSpace(spaceFromServer(서버_공간(), 멤버들), "하늘");

  assert.deepEqual(latestTripFrom(서버_여행({ participantMembershipIds: [하늘] }), 표), {
    name: "전주 한옥마을",
    start: "2026-09-22",
    end: "2026-09-24",
    region: "전북",
    note: "숙소에서 수다",
    participants: ["하늘"],
  });
  assert.equal("participants" in latestTripFrom(서버_여행(), 표), false);
});
