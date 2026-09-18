import { useEffect, useMemo, useRef, useState } from "react";

import { packingCodec, recipeCodec, type PackingRow, type RecipeRow } from "./cookingSync";
import { localDateKey, pastTripChoices, pastTripGroups, type PastTripGroup } from "./pastTripImport";
import { listChecklistItems, listRecipes, listTrips } from "./serverData";
import type { RosterEntry } from "./tripSync";

/**
 * 지난 여행들의 준비물이나 요리를 한 번에 받아 둔다.
 *
 * 기기에는 지금 여행의 목록만 있다(`useListSync` 는 열어 둔 여행만 맞춘다). 그래서
 * 지난 여행 것은 그때 서버에서 받는다. 여행 목록을 먼저 받아 끝난 여행만 남기고,
 * 그 여행들의 목록을 함께 받아 여행별로 묶는다. 요청은 `apiQueue` 가 다섯 개씩
 * 줄 세우므로 여행이 많아도 앞단 제한에 걸리지 않는다.
 *
 * `active` 가 처음 켜질 때 한 번 받고 그 뒤로는 받은 것을 그대로 둔다. 가져오기
 * 단계를 열 때마다 여행 수만큼 다시 받을 까닭이 없다. 실패했으면 `reload` 로
 * 다시 받는다.
 */
type Loaded<T> = { trip: { id: string; title: string; startDate: string; endDate: string }; rows: T[] }[];

function usePastLists<T extends { id: string; name: string }>({
  spaceId,
  tripId,
  active,
  existingNames,
  fetchRows,
}: {
  spaceId: string | undefined;
  tripId: string | undefined;
  active: boolean;
  existingNames: readonly string[];
  fetchRows: (tripId: string) => Promise<T[]>;
}): { loading: boolean; error: string; groups: PastTripGroup<T>[]; reload: () => void } {
  // 받은 원본. 이번 여행 목록이 바뀌면 `mine` 표시만 다시 계산한다.
  const [lists, setLists] = useState<Loaded<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const fetchLatest = useRef(fetchRows);
  useEffect(() => {
    fetchLatest.current = fetchRows;
  });

  useEffect(() => {
    if (!active || !spaceId || lists) return;
    let cancelled = false;
    // 화면을 여는 순간에만 시작하는 받기라 effect 안에서 상태를 바꾼다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    (async () => {
      try {
        const trips = pastTripChoices(await listTrips(spaceId), tripId, localDateKey());
        const rows = await Promise.all(trips.map((trip) => fetchLatest.current(trip.id)));
        if (cancelled) return;
        setLists(trips.map((trip, index) => ({ trip, rows: rows[index] })));
      } catch {
        if (cancelled) return;
        setError("지난 여행을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, spaceId, tripId, lists, attempt]);

  // 부르는 쪽이 `items.map(...)` 을 그대로 넘겨도(그릴 때마다 새 배열) 다시 계산하지
  // 않도록 이름을 한 줄로 이어 붙여 견준다.
  const namesKey = existingNames.join("\n");
  const groups = useMemo(
    () => (lists ? pastTripGroups(lists, namesKey.split("\n")) : []),
    [lists, namesKey],
  );

  const reload = () => {
    setLists(null);
    setError("");
    setAttempt((value) => value + 1);
  };
  return { loading, error, groups, reload };
}

/** 지난 여행들의 준비물. */
export function usePastPacking(options: {
  spaceId: string | undefined;
  tripId: string | undefined;
  roster: RosterEntry[];
  active: boolean;
  existingNames: readonly string[];
}) {
  const roster = useRef(options.roster);
  useEffect(() => {
    roster.current = options.roster;
  });
  return usePastLists<PackingRow>({
    ...options,
    fetchRows: async (tripId) => {
      // 재료 연결은 지난 여행의 재료를 가리키니 여기서는 보지 않는다.
      const codec = packingCodec(roster.current, new Set());
      return (await listChecklistItems(tripId)).map(codec.fromServer);
    },
  });
}

/** 지난 여행들의 요리. 재료까지 함께 온다. */
export function usePastRecipes(options: {
  spaceId: string | undefined;
  tripId: string | undefined;
  roster: RosterEntry[];
  active: boolean;
  existingNames: readonly string[];
}) {
  const roster = useRef(options.roster);
  useEffect(() => {
    roster.current = options.roster;
  });
  return usePastLists<RecipeRow>({
    ...options,
    fetchRows: async (tripId) => {
      const codec = recipeCodec(roster.current);
      return (await listRecipes(tripId)).map(codec.fromServer);
    },
  });
}
