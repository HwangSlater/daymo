import assert from "node:assert/strict";
import { test } from "node:test";

import { reservationCodec, transportCodec, type AppReservation, type AppTransport } from "./bookingSync.ts";
import { bodyKey, hasWork, planListSync, tripDateKeys, type Confirmed } from "./listSync.ts";

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
    showInSchedule: true,
  });
});

test("공간에 없는 이름은 탈 사람을 비워 보내고, 서버에서 돌아와도 다시 보내지 않는다", () => {
  const codec = transportCodec(dates, roster);
  const body = codec.toBody(transport({ owner: "동행" }));
  const back = codec.fromServer({ id: A, version: 1, note: null, ...body });

  assert.equal(body.ownerMembershipId, null);
  assert.equal(back.owner, "");
  assert.equal(stable(codec, back), true);
});

test("서버 교통편은 화면 글자로 돌아온다", () => {
  const back = transportCodec(dates, roster).fromServer({
    id: A, direction: "return", method: "flight", date: "2026-10-03", departureName: "제주", departureTime: "21:40",
    arrivalName: "김포", arrivalTime: null, ownerMembershipId: "m-me", bookingStatus: "not_booked", note: null, showInSchedule: false, version: 2,
  });

  assert.deepEqual(back, {
    id: A, owner: "하늘", direction: "오는 편", method: "항공", date: "3일(토)", departure: "제주", departureTime: "21:40",
    arrival: "김포", arrivalTime: "시간 미정", status: "예매 전", showInSchedule: false,
  });
});

const reservation = (extra: Partial<AppReservation> = {}): AppReservation => ({
  id: A,
  name: "소나기식당",
  date: "2일(금)",
  time: "19:00",
  people: "2명 + 아이",
  status: "예약 확정",
  place: "전주 완산구",
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
    id: A, title: "x", date: "2026-10-02", time: null, partySize: 4, partyLabel: null, status: "needs_check", note: null, bookingUrl: null, showInSchedule: false, version: 1,
  });
  assert.equal(back.people, "4명");
  assert.equal(back.time, "");
  assert.equal(stable(codec, back), true);
});
