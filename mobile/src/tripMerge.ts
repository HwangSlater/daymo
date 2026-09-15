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

type WithPlanning = { id?: string; planning?: unknown };

/**
 * 서버 목록을 기준으로 삼고, id 가 같은 여행에는 기기의 기록을 옮겨 붙인다.
 *
 * - 서버에 있고 기기에도 있으면: 서버 값 + 기기의 기록
 * - 서버에만 있으면(다른 기기에서 만든 여행): 서버 값 그대로, 기록 없음
 * - 기기에만 있으면: 버린다. 여행 목록의 원본은 서버다. 다른 기기에서 지운
 *   여행이 되살아나면 안 된다.
 *
 * 서버가 기록을 들고 오는 날이 오면(할 일 3번) 서버 쪽 기록이 이긴다.
 */
export function mergeServerTrips<T extends WithPlanning>(serverTrips: T[], localTrips: T[]): T[] {
  const localById = new Map<string, T>();
  for (const trip of localTrips) {
    if (trip.id) localById.set(trip.id, trip);
  }
  return serverTrips.map((trip) => {
    if (trip.planning !== undefined || !trip.id) return trip;
    const local = localById.get(trip.id);
    return local?.planning === undefined ? trip : { ...trip, planning: local.planning };
  });
}

/** 공간마다 나뉜 목록에 같은 규칙을 적용한다. 여행이 다른 공간으로 옮겨 가도 기록을 잃지 않게 전부 모아 찾는다. */
export function mergeServerTripsByGroup<T extends WithPlanning>(
  serverByGroup: Record<string, T[]>,
  localByGroup: Record<string, T[]>,
): Record<string, T[]> {
  const allLocal = Object.values(localByGroup).flat();
  const merged: Record<string, T[]> = {};
  for (const [group, trips] of Object.entries(serverByGroup)) {
    merged[group] = mergeServerTrips(trips, allLocal);
  }
  return merged;
}
