/**
 * 일정 줄과 숙소를 서버와 오가는 모양. 맞추는 계산은 `listSync.ts` 가 한다.
 *
 * 앱은 날짜와 시각을 화면 글자로 들고 있다(일정 `2일(금)`·`금 · 12:30`, 숙소
 * `10월 1일 15:00`). 서버는 공간 시간대의 `YYYY-MM-DD` 와 `HH:MM` 을 받는다.
 * 글자와 날짜를 오가려면 여행 기간이 필요해서 코덱을 기간마다 만든다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { blank, safeUrl } from "./placeSync.ts";
import { isServerId, type Codec } from "./listSync.ts";
import { dateLabelOf, dayLabelOf } from "./dates.ts";

// ---------------------------------------------------------------------------
// 일정
// ---------------------------------------------------------------------------

/** 앱의 일정 줄(WarmTripDetail 의 ScheduleItem)과 같은 모양. */
export type AppScheduleItem = {
  id?: string;
  time: string;
  date?: string;
  title: string;
  note: string;
  mapUrl: string;
  placeId?: string;
  stayId?: string;
  reservationId?: string;
  transportationId?: string;
};

export type ScheduleType = "place" | "meal" | "move" | "rest" | "other";

export type ServerScheduleItem = {
  id: string;
  date: string | null;
  time: string | null;
  title: string;
  type: ScheduleType;
  note: string | null;
  tripPlaceId: string | null;
  mapUrl: string | null;
  version: number;
};

export type ScheduleBody = {
  date: string | null;
  time: string | null;
  title: string;
  type: ScheduleType;
  note: string | null;
  tripPlaceId: string | null;
  mapUrl: string | null;
};

export const NO_TIME = "시간 미정";

/** 앱은 종류를 메모 앞머리에 적는다(`식사 · 전주`). 서버에는 값으로 따로 준다. */
const TYPE_BY_LABEL: Record<string, ScheduleType> = { 장소: "place", 식사: "meal", 이동: "move" };

/**
 * 숙소·예약·교통편에서 만들어진 줄은 서버에 따로 두지 않는다. 그쪽의
 * `showInSchedule` 로 다시 만들어진다. 따로 올리면 두 번 보인다.
 */
export const isDerivedScheduleItem = (item: AppScheduleItem) =>
  Boolean(item.stayId || item.reservationId || item.transportationId);

export function scheduleCodec(
  tripDates: readonly string[],
  /** 서버와 맞춘 장소 id. 아직 안 올라간 장소를 가리키면 서버가 거부하므로 그때는 연결을 비워 보낸다. */
  serverPlaceIds: ReadonlySet<string>,
): Codec<AppScheduleItem, ScheduleBody, ServerScheduleItem> {
  const keyByDayLabel = new Map(tripDates.map((key) => [dayLabelOf(key), key]));
  return {
    syncable: (item) => isServerId(item.id) && !isDerivedScheduleItem(item),
    idOf: (item) => item.id ?? "",
    toBody: (item) => {
      const date = item.date ? keyByDayLabel.get(item.date) ?? null : null;
      const clock = item.time.match(/(\d{1,2}):(\d{2})/);
      const time = date && clock ? `${clock[1].padStart(2, "0")}:${clock[2]}` : null;
      const label = item.note.split(" · ")[0]?.trim() ?? "";
      return {
        date,
        time,
        title: item.title.trim().slice(0, 60) || "이름 없는 일정",
        type: TYPE_BY_LABEL[label] ?? "other",
        note: blank(item.note, 2000),
        tripPlaceId: item.placeId && serverPlaceIds.has(item.placeId) ? item.placeId : null,
        mapUrl: safeUrl(item.mapUrl),
      };
    },
    fromServer: (row) => {
      const dayLabel = row.date && tripDates.includes(row.date) ? dayLabelOf(row.date) : undefined;
      const weekday = dayLabel?.match(/\(([^)]+)\)/)?.[1] ?? "";
      return {
        id: row.id,
        date: dayLabel,
        time: `${weekday} · ${row.time ?? NO_TIME}`,
        title: row.title,
        note: row.note ?? "",
        mapUrl: row.mapUrl ?? "",
        ...(row.tripPlaceId ? { placeId: row.tripPlaceId } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 숙소
// ---------------------------------------------------------------------------

/** 앱의 대표 숙소(WarmTripDetail 의 StayInfo)와 같은 모양. */
export type AppStay = {
  id?: string;
  name: string;
  checkin: string;
  checkout: string;
  address: string;
  placeId?: string;
  showInSchedule?: boolean;
};

export type ServerStay = {
  id: string;
  tripPlaceId: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  note: string | null;
  showInSchedule: boolean;
  version: number;
};

export type StayBody = {
  tripPlaceId: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  showInSchedule: boolean;
};

export function stayCodec(
  tripDates: readonly string[],
  serverPlaceIds: ReadonlySet<string>,
  /** 서버 숙소에는 이름·주소가 없다. 연결한 장소에서 가져온다. */
  placeById: (id: string) => { name: string; address?: string } | undefined,
): Codec<AppStay, StayBody, ServerStay> {
  const keyByDateLabel = new Map(tripDates.map((key) => [dateLabelOf(key), key]));
  const toLocal = (value: string) => {
    const match = value.match(/^(.*\S)\s+(\d{1,2}):(\d{2})$/);
    const key = match ? keyByDateLabel.get(match[1]) : undefined;
    return match && key ? `${key}T${match[2].padStart(2, "0")}:${match[3]}` : null;
  };
  const toLabel = (value: string | null) => {
    if (!value) return "";
    const [key, clock] = value.split("T");
    return `${dateLabelOf(key)} ${clock}`;
  };
  return {
    syncable: (stay) => isServerId(stay.id) && Boolean(stay.name.trim()),
    blockReason: (stay) =>
      isServerId(stay.id) && !stay.name.trim() ? "숙소 이름을 적어야 저장돼요" : undefined,
    idOf: (stay) => stay.id ?? "",
    toBody: (stay) => ({
      tripPlaceId: stay.placeId && serverPlaceIds.has(stay.placeId) ? stay.placeId : null,
      checkInAt: toLocal(stay.checkin),
      checkOutAt: toLocal(stay.checkout),
      showInSchedule: stay.showInSchedule ?? true,
    }),
    fromServer: (row) => {
      const place = row.tripPlaceId ? placeById(row.tripPlaceId) : undefined;
      return {
        id: row.id,
        name: place?.name ?? "숙소",
        address: place?.address ?? "",
        checkin: toLabel(row.checkInAt),
        checkout: toLabel(row.checkOutAt),
        ...(row.tripPlaceId ? { placeId: row.tripPlaceId } : {}),
        showInSchedule: row.showInSchedule,
      };
    },
    // 장소가 아직 안 올라가 이름을 못 찾을 때 기기의 이름·주소를 살린다.
    keepLocal: (fromServer, local) => ({
      ...fromServer,
      name: fromServer.placeId && placeById(fromServer.placeId) ? fromServer.name : local.name,
      address: fromServer.placeId && placeById(fromServer.placeId) ? fromServer.address : local.address,
    }),
  };
}
