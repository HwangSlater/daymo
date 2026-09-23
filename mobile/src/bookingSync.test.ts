import assert from "node:assert/strict";
import { test } from "node:test";

import { reservationCodec, transportCodec, type AppReservation, type AppTransport } from "./bookingSync.ts";
import { bodyKey, hasWork, planListSync, type Confirmed } from "./listSync.ts";
import { tripDateKeys } from "./dates.ts";

const A = "11111111-1111-4111-8111-111111111111";
// 2026-10-01 은 목요일이다.
const dates = tripDateKeys("2026-10-01", "2026-10-03");
const roster = [{ id: "m-me", name: "하늘" }, { id: "m-yeoul", name: "여울" }];

const transport = (extra: Partial<AppTransport> = {}): AppTransport => ({
  id: A,
  owner: "여울",
  direction: "가는 편",
  method: "KTX",
  date: "1일(목)",
  departure: "서울역",
  departureTime: "08:00",
  arrival: "전주역",
  arrivalTime: "시간 미정",
  status: "예매 완료",
  showInSchedule: true,
  ...extra,
});

const stable = <L, B, S extends { id: string; version: number }>(
  codec: { toBody: (l: L) => B; fromServer: (s: S) => L; syncable: (l: L) => boolean; idOf: (l: L) => string },
  local: L,
) => {
  const confirmed = new Map<string, Confirmed>([[codec.idOf(local), { key: bodyKey(codec.toBody(local) as object), version: 1 }]]);
  return !hasWork(planListSync([local], codec, confirmed));
};

test("교통편을 서버 모양으로 바꾸고 탈 사람은 membership id 로 보낸다", () => {
  assert.deepEqual(transportCodec(dates, roster).toBody(transport()), {
    direction: "outbound",
    method: "ktx",
    date: "2026-10-01",
    departureName: "서울역",
    departureTime: "08:00",
    arrivalName: "전주역",
    arrivalTime: null,
    ownerMembershipId: "m-yeoul",
    bookingStatus: "booked",
    note: null,
    stops: [],
    showInSchedule: true,
  });
});

test("갈아타는 곳은 이름이 있는 것만 다섯 개까지 보낸다", () => {
  const codec = transportCodec(dates, roster);
  const 보낸것 = codec.toBody(transport({
    stops: [
      { name: "  동대구  ", time: "8:55" },
      { name: "   " },
      { name: "대전", time: "25:00" },
      { name: "가".repeat(50) },
      { name: "a" }, { name: "b" }, { name: "c" }, { name: "d" },
    ],
  })).stops;

  assert.equal(보낸것.length, 5);
  assert.deepEqual(보낸것[0], { name: "동대구", time: "08:55" });
  // 읽을 수 없는 시각은 버리고 곳만 남긴다.
  assert.deepEqual(보낸것[1], { name: "대전", time: null });
  assert.equal(보낸것[2].name.length, 40);
});

test("교통편 메모를 적으면 서버로 가고, 서버 메모는 돌아와 그대로 남는다", () => {
  const codec = transportCodec(dates, roster);
  assert.equal(codec.toBody(transport({ note: "  예매번호 1234, 3호차 12A  " })).note, "예매번호 1234, 3호차 12A");
  assert.equal(codec.toBody(transport({ note: "가".repeat(2100) })).note?.length, 2000);

  const back = codec.fromServer({
    id: A, direction: "outbound", method: "ktx", date: "2026-10-01", departureName: "서울역", departureTime: "08:00",
    arrivalName: "전주역", arrivalTime: null, ownerMembershipId: "m-yeoul", bookingStatus: "booked",
    note: "3호차 12A", stops: [{ name: "동대구", time: "08:55" }], showInSchedule: true, version: 1,
  });

  assert.equal(back.note, "3호차 12A");
  // 앱이 메모를 들고 있으니 다음 저장에서 지워지지 않는다.
  assert.equal(codec.toBody(back).note, "3호차 12A");
  assert.equal(stable(codec, back), true);
});

test("공간에 없는 이름은 탈 사람을 비워 보내고, 서버에서 돌아와도 다시 보내지 않는다", () => {
  const codec = transportCodec(dates, roster);
  const body = codec.toBody(transport({ owner: "동행" }));
  const back = codec.fromServer({ id: A, version: 1, ...body });

  assert.equal(body.ownerMembershipId, null);
  assert.equal(back.owner, "");
  assert.equal(stable(codec, back), true);
});

test("서버 교통편은 화면 글자로 돌아온다", () => {
  const back = transportCodec(dates, roster).fromServer({
    id: A, direction: "return", method: "flight", date: "2026-10-03", departureName: "제주", departureTime: "21:40",
    arrivalName: "김포", arrivalTime: null, ownerMembershipId: "m-me", bookingStatus: "not_booked", note: null, stops: [], showInSchedule: false, version: 2,
  });

  assert.deepEqual(back, {
    id: A, owner: "하늘", direction: "오는 편", method: "항공", date: "3일(토)", departure: "제주", departureTime: "21:40",
    arrival: "김포", arrivalTime: "시간 미정", status: "예매 전", note: "", stops: [], showInSchedule: false,
  });
});

test("서버가 준 갈아타는 곳은 순서대로 돌아오고, 시각이 없으면 곳만 남는다", () => {
  const back = transportCodec(dates, roster).fromServer({
    id: A, direction: "outbound", method: "ktx", date: "2026-10-01", departureName: "진주", departureTime: "07:10",
    arrivalName: "대전", arrivalTime: "10:02", ownerMembershipId: "m-me", bookingStatus: "booked", note: null,
    stops: [{ name: "동대구", time: "08:55" }, { name: "김천", time: null }],
    showInSchedule: true, version: 1,
  });

  assert.deepEqual(back.stops, [{ name: "동대구", time: "08:55" }, { name: "김천" }]);
});

test("무궁화호·고속버스·시외버스는 서버 값으로 갔다가 같은 글자로 돌아온다", () => {
  const codec = transportCodec(dates, roster);
  const 짝 = [
    ["무궁화호", "mugunghwa"],
    ["고속버스", "express_bus"],
    ["시외버스", "intercity_bus"],
    // 나누기 전에 적은 「버스」는 그대로 남는다.
    ["버스", "bus"],
  ] as const;
  for (const [앱, 서버] of 짝) {
    const body = codec.toBody(transport({ method: 앱 }));
    assert.equal(body.method, 서버);
    assert.equal(codec.fromServer({ id: A, version: 1, ...body }).method, 앱);
  }
});

const reservation = (extra: Partial<AppReservation> = {}): AppReservation => ({
  id: A,
  name: "소나기식당",
  date: "2일(금)",
  time: "19:00",
  people: "2명 + 아이",
  status: "예약 확정",
  place: "전주 완산구",
  bookingUrl: "",
  showInSchedule: true,
  ...extra,
});

test("예약 인원은 글자 그대로와 숫자를 함께 보낸다", () => {
  const body = reservationCodec(dates).toBody(reservation());

  assert.equal(body.partyLabel, "2명 + 아이");
  assert.equal(body.partySize, 2);
  assert.equal(body.note, "전주 완산구");
  assert.equal(body.date, "2026-10-02");
  assert.equal(body.status, "confirmed");
});

test("시각을 비운 예약과 인원 글자 없는 서버 예약도 되돌려 같은 모습이다", () => {
  const codec = reservationCodec(dates);
  assert.equal(codec.toBody(reservation({ time: "" })).time, null);

  const back = codec.fromServer({
    id: A, title: "x", date: "2026-10-02", time: null, partySize: 4, partyLabel: null, status: "needs_check", note: null, bookingUrl: null, showInSchedule: false, targetType: "other", targetId: null, version: 1,
  });
  assert.equal(back.people, "4명");
  assert.equal(back.time, "");
  assert.equal(stable(codec, back), true);
});

test("예약 링크는 http 링크만 보내고, 서버 링크는 돌아와 그대로 남는다", () => {
  const codec = reservationCodec(dates);
  assert.equal(codec.toBody(reservation({ bookingUrl: " https://example.com/r/1 " })).bookingUrl, "https://example.com/r/1");
  // 서버가 http·https 만 받는다. 보내기 전에 거른다.
  assert.equal(codec.toBody(reservation({ bookingUrl: "javascript:alert(1)" })).bookingUrl, null);
  assert.equal(codec.toBody(reservation({ bookingUrl: "" })).bookingUrl, null);

  const back = codec.fromServer({
    id: A, title: "소나기식당", date: null, time: null, partySize: null, partyLabel: null, status: "confirmed",
    note: null, bookingUrl: "https://example.com/r/1", showInSchedule: false, targetType: "other", targetId: null, version: 1,
  });

  assert.equal(back.bookingUrl, "https://example.com/r/1");
  // 앱이 링크를 들고 있으니 다음 저장에서 지워지지 않는다.
  assert.equal(codec.toBody(back).bookingUrl, "https://example.com/r/1");
  assert.equal(stable(codec, back), true);
});

test("장소에 붙은 예약은 그 장소가 서버에 올라간 뒤에야 연결을 보낸다", () => {
  const 아직 = reservationCodec(dates).toBody(reservation({ placeId: A }));
  const 올라간_뒤 = reservationCodec(dates, new Set([A])).toBody(reservation({ placeId: A }));

  // 서버에 없는 장소를 가리키면 거부당한다. 일정 줄과 같은 규칙이다.
  assert.equal(아직.targetType, "other");
  assert.equal(아직.targetId, null);
  assert.equal(올라간_뒤.targetType, "place");
  assert.equal(올라간_뒤.targetId, A);
});

test("서버가 준 붙은 곳은 되돌려도 그대로 남는다", () => {
  const codec = reservationCodec(dates, new Set([A]));
  const 장소_예약 = codec.fromServer({
    id: A, title: "소나기식당", date: null, time: null, partySize: null, partyLabel: null, status: "confirmed",
    note: null, bookingUrl: null, showInSchedule: true, targetType: "place", targetId: A, version: 1,
  });
  // 앱은 숙소 예약을 만들지 않는다. 그래도 서버에서 오면 연결을 끊지 않고 돌려보낸다.
  const 숙소_예약 = codec.fromServer({
    id: A, title: "달빛한옥", date: null, time: null, partySize: null, partyLabel: null, status: "confirmed",
    note: null, bookingUrl: null, showInSchedule: true, targetType: "stay", targetId: "stay-1", version: 1,
  });

  assert.equal(장소_예약.placeId, A);
  assert.equal(stable(codec, 장소_예약), true);
  assert.equal(codec.toBody(숙소_예약).targetType, "stay");
  assert.equal(codec.toBody(숙소_예약).targetId, "stay-1");
});
