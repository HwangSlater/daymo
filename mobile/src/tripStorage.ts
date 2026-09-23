/**
 * 기기에 적어 둔 여행 기록(`daymo.trip-data.v2`)을 읽고 쓰는 모양.
 *
 * 이미 나간 판이 적어 둔 것을 읽는 관문이다. **모르는 값을 버리지 않는다** — 칸
 * 하나가 어긋났다고 여행을 통째로 지우면 사용자가 적어 둔 이름과 날짜까지 사라진다.
 * 계획만 버리고 여행은 살린다.
 *
 * v1 은 날짜를 `3일(금)` 같은 **이름표**로 적어 두었다. v2 는 `2026-09-23` 같은
 * 날짜 키로 적는다. v1 을 만나면 한 번 옮겨 v2 로 적고 v1 은 지운다(`readTripData`).
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 * 웹인지 아닌지는 부르는 쪽이 넘긴다(`Platform.OS === "web"`).
 */

import { buildTripDates, dayLabel, matchTripDay, tripDateKeys, validDateKey } from "./dates.ts";
import type { Trip, TripPlanningData } from "./tripPlanning.ts";

/** 지금 쓰는 저장 열쇠. 날짜를 키로 적는다. */
export const TRIP_DATA_KEY = "daymo.trip-data.v2";
/** 날짜를 이름표로 적던 옛 열쇠. 읽어서 옮기고 나면 지운다. */
export const TRIP_DATA_KEY_V1 = "daymo.trip-data.v1";
/**
 * 옮기기 전의 v1 원본. 되돌릴 자리다.
 *
 * 옮긴 다음 실행에서 v2 가 제대로 읽히면 지운다. 옮기다 잘못돼도 이 사본이 남아
 * 있으면 손으로 v1 자리에 되돌려 놓을 수 있다.
 */
export const TRIP_DATA_BACKUP_KEY = "daymo.trip-data.v1.bak";

/** 로그아웃·계정 전환에서 함께 걷어 내는 여행 기록 열쇠 전부. */
export const TRIP_DATA_KEYS = [TRIP_DATA_KEY, TRIP_DATA_KEY_V1, TRIP_DATA_BACKUP_KEY];

/**
 * 기기에 적어 둘 모양.
 *
 * 웹에서는 아직 못 올린 사진을 적지 않는다. 웹은 고른 사진을 `data:` 로 들고 있는데,
 * 여행이 끝나고 수십 장을 한꺼번에 올리는 동안 그것까지 적으면 브라우저 저장소(몇 MB)가
 * 금방 차서 기록 전체가 저장되지 않는다. 어차피 탭을 새로 열면 그 자리는 죽어 있어
 * 적어 두어도 쓸 수 없다. 올라간 사진은 파일 자리가 비어 있어 그대로 적힌다.
 */
export const storableTrips = (groups: Record<string, Trip[]>, 웹인가: boolean): Record<string, Trip[]> => {
  if (!웹인가) return groups;
  const 덜어낸다 = (trip: Trip): Trip => {
    const photos = trip.planning?.memories?.photos;
    if (!photos?.some((photo) => photo.uri)) return trip;
    return {
      ...trip,
      planning: {
        ...trip.planning,
        memories: { ...trip.planning!.memories!, photos: photos.filter((photo) => !photo.uri) },
      },
    };
  };
  return Object.fromEntries(Object.entries(groups).map(([id, trips]) => [id, trips.map(덜어낸다)]));
};

/** 여행 한 건으로 읽을 수 있는 모양인지. 이름·날짜 같은 뼈대만 본다. */
export const isStoredTrip = (value: unknown): value is Trip => {
  if (!value || typeof value !== "object") return false;
  const trip = value as Partial<Trip>;
  return typeof trip.name === "string"
    && typeof trip.date === "string"
    && typeof trip.note === "string"
    && typeof trip.tone === "number"
    && typeof trip.mark === "string"
    && typeof trip.region === "string"
    && typeof trip.start === "string"
    && typeof trip.end === "string";
};

/**
 * 저장된 계획 데이터의 모양을 본다.
 *
 * 여행 자체는 통과시키고 계획만 버리는 쪽이 낫다. 필드 하나가 어긋났다고
 * 여행을 통째로 지우면 사용자가 적어 둔 이름과 날짜까지 사라진다.
 */
export const isStoredPlanning = (value: unknown): value is TripPlanningData => {
  if (!value || typeof value !== "object") return false;
  const planning = value as Partial<TripPlanningData>;
  // 있으면 모양이 맞아야 하고, 없는 건 없는 대로 둔다. 예시 여행처럼 지출만
  // 심어 둔 계획도 있어서 셋을 다 요구하면 그런 데이터가 통째로 버려진다.
  const listShape = (list: unknown) => list === undefined || Array.isArray(list);
  return listShape(planning.schedule)
    && listShape(planning.places)
    && listShape(planning.expenses)
    && (planning.stay === undefined || typeof planning.stay === "object");
};

/** 적어 둔 글을 여행 목록으로 읽는다. 읽을 것이 없으면 `null`. */
export const parseStoredTripData = (raw: string | null) => {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as {
      tripsByGroup?: Record<string, unknown>;
      done?: unknown;
    };
    if (!saved.tripsByGroup) return null;
    const restored: Record<string, Trip[]> = {};
    Object.entries(saved.tripsByGroup).forEach(([groupId, groupTrips]) => {
      if (groupId.length > 0 && groupId.length <= 64 && Array.isArray(groupTrips)) {
        restored[groupId] = groupTrips.filter(isStoredTrip).map((trip) =>
          trip.planning && !isStoredPlanning(trip.planning)
            ? { ...trip, planning: undefined }
            : trip,
        );
      }
    });
    if (!Object.keys(restored).length) return null;
    return {
      tripsByGroup: restored,
      done: Array.isArray(saved.done)
        ? saved.done.filter((item): item is string => typeof item === "string")
        : ["charger", "toiletries"],
    };
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// v1 → v2: 날짜 이름표를 날짜 키로
// ---------------------------------------------------------------------------

/** 사진이 날짜를 안 고른 상태. `photoSync.PHOTO_UNDATED`·화면의 `UNDATED` 와 같다. */
const 사진_미정 = "날짜 미정";

/**
 * 옛 이름표 하나를 그 여행의 날짜 키로.
 *
 * 그 여행의 이름표 목록에서 **같은 자리**의 키를 준다. 「2일차」·「9월 24일」처럼
 * 다르게 적은 것은 `matchTripDay` 가 먼저 이름표로 맞춘다. 그래도 못 찾으면
 * **버리지 않고** 날짜 미정으로 내린다 — 날짜 하나 때문에 적어 둔 지출·사진이
 * 사라지면 안 된다.
 */
const 키로_옮긴다 = (
  value: string | undefined,
  labels: readonly string[],
  keys: readonly string[],
  미정: string,
): string | undefined => {
  if (value === undefined) return undefined;
  const 글 = value.trim();
  if (!글 || 글 === 미정) return value;
  if (validDateKey(글)) return 글;
  const 자리 = labels.indexOf(matchTripDay(글, [...labels]));
  return 자리 < 0 ? 미정 : keys[자리];
};

/** 여행 한 건이 들고 있는 날짜 칸을 전부 키로 옮긴다. 칸이 없으면 그대로 둔다. */
export function migrateTripDaysToKeys(trip: Trip): Trip {
  const keys = tripDateKeys(trip.start, trip.end);
  const labels = buildTripDates(trip.start, trip.end).map(dayLabel);
  const planning = trip.planning;
  if (!planning) return trip;
  const 날 = (value: string | undefined, 미정 = "") => 키로_옮긴다(value, labels, keys, 미정) ?? 미정;
  const memories = planning.memories;
  return {
    ...trip,
    planning: {
      ...planning,
      ...(planning.schedule
        ? {
          schedule: planning.schedule.map((item) =>
            item.date === undefined ? item : { ...item, date: 날(item.date) }),
        }
        : {}),
      ...(planning.reservations
        ? { reservations: planning.reservations.map((item) => ({ ...item, date: 날(item.date) })) }
        : {}),
      ...(planning.reservation
        ? { reservation: { ...planning.reservation, date: 날(planning.reservation.date) } }
        : {}),
      ...(planning.transportations
        ? { transportations: planning.transportations.map((item) => ({ ...item, date: 날(item.date) })) }
        : {}),
      ...(planning.expenses
        ? { expenses: planning.expenses.map((item) => ({ ...item, day: 날(item.day) })) }
        : {}),
      ...(memories
        ? {
          memories: {
            ...memories,
            photos: memories.photos.map((photo) => ({ ...photo, date: 날(photo.date, 사진_미정) })),
          },
        }
        : {}),
    },
  };
}

/** 적어 둘 글. 판 번호를 함께 적어 다음 판이 무엇을 읽는지 알 수 있게 한다. */
export const tripDataText = (tripsByGroup: Record<string, Trip[]>, done: readonly string[]) =>
  JSON.stringify({ version: 2, tripsByGroup, done });

/** `AsyncStorage` 가운데 여기서 쓰는 것만. 시험이 가짜 저장소를 넣는다. */
export type TripDataStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/**
 * 기기에 적어 둔 여행 기록을 읽는다. v1 이 남아 있으면 한 번 옮긴다.
 *
 * - v2 가 있으면 그것을 읽고, 옮기기 전 사본(`.bak`)이 남아 있으면 지운다.
 *   v2 를 제대로 읽었다는 것이 되돌릴 일이 없다는 뜻이다.
 * - v2 가 없고 v1 이 있으면 **먼저 원본을 사본으로 남기고** 옮겨 v2 로 적은 뒤
 *   v1 을 지운다. 옮긴 것이 읽히지 않으면 v1 을 건드리지 않는다.
 */
export async function readTripData(store: TripDataStore) {
  const 적힌_v2 = await store.getItem(TRIP_DATA_KEY);
  if (적힌_v2 !== null) {
    await store.removeItem(TRIP_DATA_BACKUP_KEY);
    return parseStoredTripData(적힌_v2);
  }
  const 적힌_v1 = await store.getItem(TRIP_DATA_KEY_V1);
  const 읽음 = parseStoredTripData(적힌_v1);
  if (!적힌_v1 || !읽음) return 읽음;
  await store.setItem(TRIP_DATA_BACKUP_KEY, 적힌_v1);
  const tripsByGroup = Object.fromEntries(
    Object.entries(읽음.tripsByGroup).map(([id, trips]) => [id, trips.map(migrateTripDaysToKeys)]),
  );
  await store.setItem(TRIP_DATA_KEY, tripDataText(tripsByGroup, 읽음.done));
  await store.removeItem(TRIP_DATA_KEY_V1);
  return { tripsByGroup, done: 읽음.done };
}
