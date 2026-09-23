/**
 * 서버에서 받은 여행 목록에 기기에 있던 기록을 붙인다.
 *
 * 여행의 이름·날짜·지역은 서버가 원본이다. 그런데 일정·장소·준비물·비용·
 * 기록(`planning`)은 아직 서버에 없고 기기에만 있다. 서버 목록으로 통째로
 * 바꾸면 그 기록이 사라진다. 예전에는 그렇게 해서, 앱을 켤 때마다 적어 둔
 * 것이 지워지고 지워진 채로 저장됐다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

type WithPlanning = { id?: string; planning?: object; start?: string };

/**
 * 서버 목록을 기준으로 삼고, id 가 같은 여행에는 기기의 기록을 옮겨 붙인다.
 *
 * - 서버에 있고 기기에도 있으면: 서버 값 + 기기의 기록
 * - 서버에만 있으면(다른 기기에서 만든 여행): 서버 값 그대로, 기록 없음
 * - 기기에만 있으면: 버린다. 여행 목록의 원본은 서버다. 다른 기기에서 지운
 *   여행이 되살아나면 안 된다.
 *
 * 서버가 기록 일부를 들고 오면(지금은 참가자뿐이다) 그 칸만 서버 값으로 바꾸고
 * 나머지 기록은 기기 것을 둔다. 통째로 바꾸면 참가자를 받는 순간 일정·비용이
 * 사라진다.
 */
export function mergeServerTrips<T extends WithPlanning>(serverTrips: T[], localTrips: T[]): T[] {
  const localById = new Map<string, T>();
  for (const trip of localTrips) {
    if (trip.id) localById.set(trip.id, trip);
  }
  return serverTrips.map((trip) => {
    if (!trip.id) return trip;
    const local = localById.get(trip.id);
    if (local?.planning === undefined) return trip;
    const planning = trip.planning === undefined ? local.planning : { ...local.planning, ...trip.planning };
    return { ...trip, planning };
  });
}

/**
 * 이미 가지고 있는 목록 뒤에 서버가 준 다음 쪽을 이어 붙인다.
 *
 * 목록을 쪽으로 나눠 받으면 `mergeServerTrips` 로 통째로 바꿀 수 없다. 그 함수는
 * 받은 목록에 없는 여행을 버리므로, 두 번째 쪽만 넣는 순간 첫 쪽의 여행이 기기에만
 * 있던 기록과 함께 사라진다.
 *
 * 이미 있던 여행은 서버 값으로 바꾸되 있던 자리에 그대로 두고(차례가 흔들리면 보던
 * 곳이 튄다), 처음 보는 여행만 뒤에 붙인다. 서버가 같은 여행을 두 쪽에 걸쳐 주더라도
 * 목록에는 한 번만 남는다.
 */
export function appendServerTrips<T extends WithPlanning>(
  current: T[],
  nextPage: T[],
  localTrips: T[],
): T[] {
  const 이어받은 = mergeServerTrips(nextPage, [...localTrips, ...current]);
  const 새_값 = new Map<string, T>();
  for (const trip of 이어받은) {
    if (trip.id) 새_값.set(trip.id, trip);
  }
  const 이미_있던 = new Set(current.map((trip) => trip.id).filter((id): id is string => !!id));
  return [
    ...current.map((trip) => (trip.id && 새_값.has(trip.id) ? (새_값.get(trip.id) as T) : trip)),
    ...이어받은.filter((trip) => !trip.id || !이미_있던.has(trip.id)),
  ];
}

/**
 * 첫 쪽에 오지 않았을 뿐인 여행을 골라 낸다.
 *
 * 목록은 시작일 내림차순이라, 받은 쪽의 마지막 여행보다 이른 여행은 아직 안 온
 * 것이다. 그 앞에 서야 하는데 오지 않은 여행만 서버에서 지워진 것으로 본다.
 */
function 아직_안_온_여행<T extends WithPlanning>(받은: T[], 기기_목록: T[]): T[] {
  const 경계 = 받은[받은.length - 1]?.start;
  if (!경계) return [];
  const 받은_ids = new Set(받은.map((trip) => trip.id).filter((id): id is string => !!id));
  return 기기_목록.filter((trip) => !!trip.id && !받은_ids.has(trip.id) && (trip.start ?? "") < 경계);
}

/**
 * 공간마다 나뉜 목록에 같은 규칙을 적용한다. 여행이 다른 공간으로 옮겨 가도 기록을 잃지 않게 전부 모아 찾는다.
 *
 * `hasMoreByGroup` 이 그 공간에 대해 참이면 받은 것이 목록의 첫 쪽일 뿐이다. 그때는
 * 아직 안 온 뒤쪽 여행을 버리지 않고 남긴다. 버리면 아래로 내려 받아 둔 여행이
 * 당겨서 새로고침 한 번에 기기에만 있던 기록과 함께 사라진다.
 */
export function mergeServerTripsByGroup<T extends WithPlanning>(
  serverByGroup: Record<string, T[]>,
  localByGroup: Record<string, T[]>,
  hasMoreByGroup: Record<string, boolean> = {},
): Record<string, T[]> {
  // 지금 계정이 속한 공간에 있던 기록만 본다. 한 기기를 두 계정이 번갈아 쓰면 앞사람의
  // 공간이 기기 목록에 남는데, 그것까지 훑으면 앞사람이 아직 못 올린 일정·비용이 뒷사람
  // 여행에 붙어 뒷사람 이름으로 올라간다(2026-09-23). 여행이 공간 사이를 옮겨 다녀도
  // 기록을 잃지 않는 것은 그대로다 — 내 공간들 안에서는 여전히 모아 찾는다.
  const allLocal = Object.keys(serverByGroup).flatMap((group) => localByGroup[group] ?? []);
  const merged: Record<string, T[]> = {};
  for (const [group, trips] of Object.entries(serverByGroup)) {
    const 받은 = mergeServerTrips(trips, allLocal);
    merged[group] = hasMoreByGroup[group]
      ? [...받은, ...아직_안_온_여행(받은, localByGroup[group] ?? [])]
      : 받은;
  }
  return merged;
}
