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

/**
 * 지금 쓰는 저장 열쇠. **여행 목록**만 여기 적고 여행 하나하나는 따로 적는다.
 *
 * ```
 * daymo.trip-data.v3            { version, groups: { 공간: [열쇠…] }, done }
 * daymo.trip-data.v3.t:<여행id> 여행 한 건
 * ```
 *
 * 전에는 모든 여행을 한 글자로 이어 붙여 한 열쇠에 적었다. 여행이 쌓이면 안드로이드
 * AsyncStorage(6MB)·웹 localStorage(5MB) 상한에 걸려 **기록 전체가 저장되지 않고**,
 * 한 글자만 바뀌어도 전부 다시 직렬화해 적었다(2026-09-23 검토 #59).
 */
export const TRIP_INDEX_KEY = "daymo.trip-data.v3";
/** 여행 한 건을 적는 열쇠의 앞머리. 뒤에 `t:<id>` 나 `l:<공간>:<자리>` 가 붙는다. */
export const TRIP_ENTRY_PREFIX = "daymo.trip-data.v3.";
/** 여행을 한 열쇠에 몰아 적던 판. 읽어서 옮기고 나면 지운다. */
export const TRIP_DATA_KEY = "daymo.trip-data.v2";
/** 옮기기 전의 v2 원본. v3 가 제대로 읽히면 지운다. */
export const TRIP_DATA_BACKUP_V2 = "daymo.trip-data.v2.bak";
/** 날짜를 이름표로 적던 옛 열쇠. 읽어서 옮기고 나면 지운다. */
export const TRIP_DATA_KEY_V1 = "daymo.trip-data.v1";
/**
 * 옮기기 전의 v1 원본. 되돌릴 자리다.
 *
 * 옮긴 다음 실행에서 v2 가 제대로 읽히면 지운다. 옮기다 잘못돼도 이 사본이 남아
 * 있으면 손으로 v1 자리에 되돌려 놓을 수 있다.
 */
export const TRIP_DATA_BACKUP_KEY = "daymo.trip-data.v1.bak";

/**
 * 로그아웃·계정 전환에서 함께 걷어 내는 여행 기록 열쇠 가운데 **이름이 정해진 것**.
 *
 * 여행 하나하나의 열쇠는 이름이 그때그때 달라서 여기 적을 수 없다 — `tripDataKeys`
 * 로 훑어서 함께 넘긴다. 새 열쇠를 만들면 로그아웃·계정 전환·「이 기기 데이터 모두
 * 삭제」에서 어떻게 되는지 같은 자리에서 정한다(CLAUDE.md 데이터 절).
 */
export const TRIP_DATA_KEYS = [
  TRIP_INDEX_KEY, TRIP_DATA_KEY, TRIP_DATA_KEY_V1, TRIP_DATA_BACKUP_KEY, TRIP_DATA_BACKUP_V2,
];

/** 지금 기기에 있는 여행 기록 열쇠 전부(여행 하나하나까지). 로그아웃이 이걸로 지운다. */
export async function tripDataKeys(store: TripDataStore): Promise<string[]> {
  const 있는_것 = await store.getAllKeys().catch(() => [] as string[]);
  return [...TRIP_DATA_KEYS, ...있는_것.filter((key) => key.startsWith(TRIP_ENTRY_PREFIX))];
}

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

/** 여행을 한 열쇠에 몰아 적던 v2 의 글. 옮길 때만 쓴다. */
export const tripDataText = (tripsByGroup: Record<string, Trip[]>, done: readonly string[]) =>
  JSON.stringify({ version: 2, tripsByGroup, done });

/** `AsyncStorage` 가운데 여기서 쓰는 것만. 시험이 가짜 저장소를 넣는다. */
export type TripDataStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  getAllKeys: () => Promise<readonly string[]>;
  multiGet?: (keys: string[]) => Promise<readonly (readonly [string, string | null])[]>;
  multiSet?: (pairs: [string, string][]) => Promise<void>;
  multiRemove?: (keys: string[]) => Promise<void>;
};

const 여럿_읽기 = async (store: TripDataStore, keys: string[]) => {
  if (store.multiGet) return store.multiGet(keys);
  return Promise.all(keys.map(async (key) => [key, await store.getItem(key)] as const));
};
const 여럿_쓰기 = async (store: TripDataStore, pairs: [string, string][]) => {
  if (!pairs.length) return;
  if (store.multiSet) return store.multiSet(pairs);
  await Promise.all(pairs.map(([key, value]) => store.setItem(key, value)));
};
const 여럿_지우기 = async (store: TripDataStore, keys: string[]) => {
  if (!keys.length) return;
  if (store.multiRemove) return store.multiRemove(keys);
  await Promise.all(keys.map((key) => store.removeItem(key)));
};

/** 여행 목록 열쇠에 적는 모양. 여행 자체는 여기 없고 열쇠 이름만 차례대로 있다. */
type TripIndex = { version?: number; groups?: Record<string, unknown>; done?: unknown };

/**
 * 여행 하나를 적을 열쇠 이름.
 *
 * 서버에 있는 여행은 id 로 짓는다 — 차례가 바뀌어도 같은 자리에 적힌다. id 가 없는
 * 여행(예시 여행, 아직 못 올린 것)은 공간과 자리로 짓는다. 자리가 바뀌면 열쇠도
 * 바뀌지만, 쓸 때 목록을 다시 적으므로 읽는 쪽은 늘 맞다.
 */
export const tripEntryName = (trip: Trip, groupId: string, 자리: number) =>
  trip.id ? `t:${trip.id}` : `l:${groupId}:${자리}`;

/** 여행 기록을 적는다. 바뀐 여행만 다시 적고, 없어진 여행의 열쇠는 지운다. */
export async function writeTripData(
  store: TripDataStore,
  tripsByGroup: Record<string, Trip[]>,
  done: readonly string[],
  /** 지난번에 적은 글. 있으면 바뀐 것만 적는다. 없으면 전부 적는다. */
   지난번?: Map<string, string>,
): Promise<Map<string, string>> {
  const groups: Record<string, string[]> = {};
  const 적을_것: [string, string][] = [];
  const 이번 = new Map<string, string>();
  Object.entries(tripsByGroup).forEach(([groupId, trips]) => {
    groups[groupId] = trips.map((trip, 자리) => {
      const 이름 = tripEntryName(trip, groupId, 자리);
      const 글 = JSON.stringify(trip);
      이번.set(이름, 글);
      if (지난번?.get(이름) !== 글) 적을_것.push([TRIP_ENTRY_PREFIX + 이름, 글]);
      return 이름;
    });
  });
  const 옛_이름 = 지난번
    ? [...지난번.keys()]
    : (await store.getAllKeys().catch(() => [] as string[]))
      .filter((key) => key.startsWith(TRIP_ENTRY_PREFIX))
      .map((key) => key.slice(TRIP_ENTRY_PREFIX.length));
  const 지울_것 = 옛_이름.filter((이름) => !이번.has(이름)).map((이름) => TRIP_ENTRY_PREFIX + 이름);
  await 여럿_쓰기(store, 적을_것);
  // 목록을 여행보다 나중에 적는다. 중간에 끊기면 목록이 가리키는 여행이 없는 것보다
  // 아직 목록에 없는 여행이 남는 편이 낫다 — 다음 쓰기에서 정리된다.
  await store.setItem(TRIP_INDEX_KEY, JSON.stringify({ version: 3, groups, done }));
  await 여럿_지우기(store, 지울_것);
  return 이번;
}

/** 목록과 여행들을 읽어 맞춘다. 목록이 가리키는 여행이 없으면 그 줄만 건너뛴다. */
async function readV3(store: TripDataStore, 적힌: string) {
  let index: TripIndex;
  try {
    index = JSON.parse(적힌) as TripIndex;
  } catch {
    return null;
  }
  if (!index.groups || typeof index.groups !== "object") return null;
  const 이름들: string[] = [];
  Object.values(index.groups).forEach((names) => {
    if (Array.isArray(names)) names.forEach((이름) => typeof 이름 === "string" && 이름들.push(이름));
  });
  const 읽은_것 = new Map<string, string | null>();
  if (이름들.length) {
    const 쌍 = await 여럿_읽기(store, 이름들.map((이름) => TRIP_ENTRY_PREFIX + 이름));
    쌍.forEach(([key, value]) => 읽은_것.set(key.slice(TRIP_ENTRY_PREFIX.length), value));
  }
  const tripsByGroup: Record<string, Trip[]> = {};
  const 캐시 = new Map<string, string>();
  Object.entries(index.groups).forEach(([groupId, names]) => {
    if (!Array.isArray(names) || groupId.length === 0 || groupId.length > 64) return;
    const trips: Trip[] = [];
    names.forEach((이름) => {
      const 글 = typeof 이름 === "string" ? 읽은_것.get(이름) : null;
      if (!글) return;
      try {
        const trip = JSON.parse(글) as unknown;
        if (!isStoredTrip(trip)) return;
        캐시.set(이름, 글);
        trips.push(trip.planning && !isStoredPlanning(trip.planning) ? { ...trip, planning: undefined } : trip);
      } catch {
        // 여행 한 건이 깨져도 나머지는 살린다.
      }
    });
    tripsByGroup[groupId] = trips;
  });
  if (!Object.keys(tripsByGroup).length) return null;
  return {
    tripsByGroup,
    done: Array.isArray(index.done)
      ? index.done.filter((item): item is string => typeof item === "string")
      : ["charger", "toiletries"],
    적힌_것: 캐시,
  };
}

/**
 * 기기에 적어 둔 여행 기록을 읽는다. 옛 판이 남아 있으면 한 번 옮긴다.
 *
 * - v3(목록 + 여행별)가 있으면 그것을 읽고, 옮기기 전 사본은 지운다. 제대로 읽혔다는
 *   것이 되돌릴 일이 없다는 뜻이다.
 * - v2(한 열쇠에 전부)나 v1(날짜가 이름표)이 있으면 **먼저 원본을 사본으로 남기고**
 *   옮겨 적은 뒤 옛 열쇠를 지운다. 옮긴 것이 읽히지 않으면 옛 열쇠를 건드리지 않는다.
 */
export async function readTripData(store: TripDataStore) {
  const 적힌_v3 = await store.getItem(TRIP_INDEX_KEY);
  if (적힌_v3 !== null) {
    const 읽음 = await readV3(store, 적힌_v3);
    if (읽음) {
      await 여럿_지우기(store, [TRIP_DATA_BACKUP_KEY, TRIP_DATA_BACKUP_V2]);
      return 읽음;
    }
  }
  const 적힌_v2 = await store.getItem(TRIP_DATA_KEY);
  const v2 = parseStoredTripData(적힌_v2);
  if (적힌_v2 && v2) {
    await store.setItem(TRIP_DATA_BACKUP_V2, 적힌_v2);
    const 적힌_것 = await writeTripData(store, v2.tripsByGroup, v2.done);
    await store.removeItem(TRIP_DATA_KEY);
    return { ...v2, 적힌_것 };
  }
  const 적힌_v1 = await store.getItem(TRIP_DATA_KEY_V1);
  const v1 = parseStoredTripData(적힌_v1);
  if (!적힌_v1 || !v1) return null;
  await store.setItem(TRIP_DATA_BACKUP_KEY, 적힌_v1);
  const tripsByGroup = Object.fromEntries(
    Object.entries(v1.tripsByGroup).map(([id, trips]) => [id, trips.map(migrateTripDaysToKeys)]),
  );
  const 적힌_것 = await writeTripData(store, tripsByGroup, v1.done);
  await store.removeItem(TRIP_DATA_KEY_V1);
  return { tripsByGroup, done: v1.done, 적힌_것 };
}
