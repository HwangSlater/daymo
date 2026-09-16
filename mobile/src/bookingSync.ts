/**
 * 교통편과 예약을 서버와 오가는 모양. 맞추는 계산은 `listSync.ts` 가 한다.
 *
 * 둘 다 날짜를 일정 탭과 같은 이름표(`2일(금)`)로 들고 있다. 교통편의 탈 사람은
 * 앱에서는 이름이고 서버에서는 membership id 라, 공간 사람 표로 옮긴다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { dayLabelOf, isServerId, type Codec } from "./listSync.ts";
import { blank, safeUrl } from "./placeSync.ts";
import type { RosterEntry } from "./tripSync.ts";

const NO_TIME = "시간 미정";
const clockOf = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
};

// ---------------------------------------------------------------------------
// 교통편
// ---------------------------------------------------------------------------

export type AppTransport = {
  id: string;
  owner: string;
  direction: "가는 편" | "오는 편";
  method: "KTX" | "SRT" | "버스" | "항공" | "기타";
  date: string;
  departure: string;
  departureTime: string;
  arrival: string;
  arrivalTime: string;
  status: "예매 완료" | "예매 전";
  showInSchedule: boolean;
  /** 예매번호·좌석·정류장 안내 같은 것. 옛 기기 기록에는 없다. */
  note?: string;
};

type ServerMethod = "ktx" | "srt" | "bus" | "flight" | "other";

export type ServerTransport = {
  id: string;
  direction: "outbound" | "return";
  method: ServerMethod;
  date: string | null;
  departureName: string | null;
  departureTime: string | null;
  arrivalName: string | null;
  arrivalTime: string | null;
  ownerMembershipId: string | null;
  bookingStatus: "booked" | "not_booked";
  note: string | null;
  showInSchedule: boolean;
  version: number;
};

export type TransportBody = Omit<ServerTransport, "id" | "version">;

const METHOD_TO_SERVER: Record<AppTransport["method"], ServerMethod> = {
  KTX: "ktx", SRT: "srt", 버스: "bus", 항공: "flight", 기타: "other",
};
const METHOD_TO_APP: Record<ServerMethod, AppTransport["method"]> = {
  ktx: "KTX", srt: "SRT", bus: "버스", flight: "항공", other: "기타",
};

export function transportCodec(
  tripDates: readonly string[],
  roster: readonly RosterEntry[],
): Codec<AppTransport, TransportBody, ServerTransport> {
  const keyByDayLabel = new Map(tripDates.map((key) => [dayLabelOf(key), key]));
  return {
    syncable: (item) => isServerId(item.id),
    idOf: (item) => item.id,
    toBody: (item) => {
      const date = keyByDayLabel.get(item.date) ?? null;
      return {
        direction: item.direction === "오는 편" ? "return" : "outbound",
        method: METHOD_TO_SERVER[item.method] ?? "other",
        date,
        departureName: blank(item.departure, 40),
        departureTime: date ? clockOf(item.departureTime) : null,
        arrivalName: blank(item.arrival, 40),
        arrivalTime: date ? clockOf(item.arrivalTime) : null,
        // 공간에 없는 이름(나간 멤버, 옛 기록의 "동행")은 정하지 않은 것으로 보낸다.
        ownerMembershipId: roster.find((entry) => entry.name === item.owner)?.id ?? null,
        bookingStatus: item.status === "예매 완료" ? "booked" : "not_booked",
        note: blank(item.note, 2000),
        showInSchedule: item.showInSchedule,
      };
    },
    fromServer: (row) => ({
      id: row.id,
      owner: roster.find((entry) => entry.id === row.ownerMembershipId)?.name ?? "",
      direction: row.direction === "return" ? "오는 편" : "가는 편",
      method: METHOD_TO_APP[row.method] ?? "기타",
      date: row.date && tripDates.includes(row.date) ? dayLabelOf(row.date) : "",
      departure: row.departureName ?? "",
      departureTime: row.departureTime ?? NO_TIME,
      arrival: row.arrivalName ?? "",
      arrivalTime: row.arrivalTime ?? NO_TIME,
      status: row.bookingStatus === "booked" ? "예매 완료" : "예매 전",
      note: row.note ?? "",
      showInSchedule: row.showInSchedule,
    }),
  };
}

// ---------------------------------------------------------------------------
// 예약
// ---------------------------------------------------------------------------

export type AppReservation = {
  id: string;
  name: string;
  date: string;
  time: string;
  people: string;
  status: "예약 확정" | "확인 필요" | "취소";
  place: string;
  showInSchedule: boolean;
  /** 예약한 곳으로 바로 가는 링크. 옛 기기 기록에는 없다. */
  bookingUrl?: string;
};

type ServerReservationStatus = "confirmed" | "needs_check" | "cancelled";

export type ServerReservation = {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  partySize: number | null;
  partyLabel: string | null;
  status: ServerReservationStatus;
  note: string | null;
  bookingUrl: string | null;
  showInSchedule: boolean;
  version: number;
};

export type ReservationBody = Omit<ServerReservation, "id" | "version">;

const STATUS_TO_SERVER: Record<AppReservation["status"], ServerReservationStatus> = {
  "예약 확정": "confirmed", "확인 필요": "needs_check", 취소: "cancelled",
};
const STATUS_TO_APP: Record<ServerReservationStatus, AppReservation["status"]> = {
  confirmed: "예약 확정", needs_check: "확인 필요", cancelled: "취소",
};

export function reservationCodec(tripDates: readonly string[]): Codec<AppReservation, ReservationBody, ServerReservation> {
  const keyByDayLabel = new Map(tripDates.map((key) => [dayLabelOf(key), key]));
  return {
    syncable: (item) => isServerId(item.id),
    idOf: (item) => item.id,
    toBody: (item) => {
      const date = keyByDayLabel.get(item.date) ?? null;
      const count = Number(item.people.match(/\d+/)?.[0] ?? NaN);
      return {
        title: item.name.trim().slice(0, 60) || "이름 없는 예약",
        date,
        time: date ? clockOf(item.time.trim()) : null,
        partySize: Number.isInteger(count) && count > 0 && count <= 1000 ? count : null,
        // 적은 글자 그대로 둔다. 숫자만 남기면 "2명 + 아이" 가 "2명" 이 된다.
        partyLabel: blank(item.people, 20),
        status: STATUS_TO_SERVER[item.status] ?? "needs_check",
        // 앱의 예약 장소는 자유 글자다. 서버 메모 칸에 둔다.
        note: blank(item.place, 2000),
        bookingUrl: safeUrl(item.bookingUrl),
        showInSchedule: item.showInSchedule,
      };
    },
    fromServer: (row) => ({
      id: row.id,
      name: row.title,
      date: row.date && tripDates.includes(row.date) ? dayLabelOf(row.date) : "",
      time: row.time ?? "",
      people: row.partyLabel ?? (row.partySize ? `${row.partySize}명` : ""),
      status: STATUS_TO_APP[row.status] ?? "확인 필요",
      place: row.note ?? "",
      bookingUrl: row.bookingUrl ?? "",
      showInSchedule: row.showInSchedule,
    }),
  };
}
