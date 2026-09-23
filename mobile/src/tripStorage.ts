/**
 * 기기에 적어 둔 여행 기록(`daymo.trip-data.v1`)을 읽고 쓰는 모양.
 *
 * 이미 나간 판이 적어 둔 것을 읽는 관문이다. **모르는 값을 버리지 않는다** — 칸
 * 하나가 어긋났다고 여행을 통째로 지우면 사용자가 적어 둔 이름과 날짜까지 사라진다.
 * 계획만 버리고 여행은 살린다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 * 웹인지 아닌지는 부르는 쪽이 넘긴다(`Platform.OS === "web"`).
 */

import type { Trip, TripPlanningData } from "./tripPlanning.ts";

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
