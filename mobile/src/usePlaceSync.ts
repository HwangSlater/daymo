import { useEffect, useRef } from "react";

import { DaymoApiError } from "./auth";
import {
  bodyKey,
  hasWork,
  isServerId,
  legacyIdMap,
  mergeOnOpen,
  placeBody,
  placeFromServer,
  planPlaceSync,
  type AppPlace,
  type Confirmed,
  type ServerPlace,
} from "./placeSync";
import { createTripPlace, deleteTripPlace, listTripPlaces, updateTripPlace } from "./serverData";

// 글자를 칠 때마다 보내지 않는다. 잠깐 모았다가 한 번에 맞춘다.
const SYNC_DELAY_MS = 800;
// 연결이 끊겼을 때 다시 해 보는 간격.
const RETRY_MS = 20_000;

type Options<T extends AppPlace> = {
  /** 서버 여행 id. 없거나 서버 id 가 아니면(예시 여행) 아무것도 하지 않는다. */
  tripId?: string;
  places: T[];
  setPlaces: (updater: (current: T[]) => T[]) => void;
  /** 예전에 서버와 맞춘 장소 id. 기기에 함께 저장해 둔다. */
  syncedIds: readonly string[];
  setSyncedIds: (ids: string[]) => void;
  /** 옛 장소 id 를 새 id 로 바꿔야 할 때. 일정·숙소가 가리키는 id 도 함께 바꾼다. */
  remapIds: (map: Map<string, string>) => void;
  newId: () => string;
  notify: (message: string) => void;
};

/**
 * 여행 상세가 열려 있는 동안 장소 목록을 서버와 맞춘다.
 *
 * 1. 열 때 서버 목록을 받아 기기 목록과 합친다(`mergeOnOpen`).
 * 2. 그 뒤로 목록이 바뀌면 잠깐 기다렸다가 만들기·고치기·지우기를 보낸다.
 * 3. 다른 곳에서 먼저 고쳤으면(409) 서버 목록을 다시 받아 보여 준다.
 *
 * 연결이 없으면 기기에서는 계속 쓰고, 연결되면 다시 보낸다. 앱을 닫았다 열면
 * 1번에서 아직 못 올린 장소를 찾아 다시 올린다.
 */
export function usePlaceSync<T extends AppPlace>(options: Options<T>) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const confirmed = useRef(new Map<string, Confirmed>());
  const failed = useRef(new Map<string, string>());
  const loaded = useRef(false);
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedOffline = useRef(false);
  const warnedForbidden = useRef(false);

  const tripId = options.tripId && isServerId(options.tripId) ? options.tripId : undefined;

  const remember = (place: ServerPlace) => {
    confirmed.current.set(place.id, { key: bodyKey(placeBody(placeFromServer(place))), version: place.version });
  };

  const publishSyncedIds = () => {
    const ids = [...confirmed.current.keys()];
    const before = latest.current.syncedIds;
    if (ids.length !== before.length || ids.some((id) => !before.includes(id))) {
      latest.current.setSyncedIds(ids);
    }
  };

  const schedule = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, delay);
  };

  /** 서버 목록으로 화면을 다시 맞춘다. 아직 못 올린 장소는 남긴다. */
  const reload = async (id: string, syncedIds: ReadonlySet<string>) => {
    const server = await listTripPlaces(id);
    confirmed.current = new Map();
    server.forEach(remember);
    latest.current.setPlaces((current) => mergeOnOpen(current, server, syncedIds) as T[]);
    publishSyncedIds();
  };

  const run = async (): Promise<void> => {
    const id = tripId;
    if (!id || !loaded.current) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      const plan = planPlaceSync(latest.current.places, confirmed.current, failed.current);
      if (!hasWork(plan)) return;
      try {
        for (const item of plan.creates) {
          await attempt(item.id, item.body, async () => remember(await createTripPlace(id, item.id, item.body)));
        }
        for (const item of plan.updates) {
          await attempt(item.id, item.body, async () =>
            remember(await updateTripPlace(item.id, item.version, item.body)));
        }
        for (const item of plan.deletes) {
          try {
            await deleteTripPlace(item.id);
          } catch (caught) {
            // 이미 없으면 지운 것과 같다.
            if (!(caught instanceof DaymoApiError) || caught.status !== 404) throw caught;
          }
          confirmed.current.delete(item.id);
        }
        warnedOffline.current = false;
      } catch (caught) {
        if (caught instanceof DaymoApiError && caught.code === "VERSION_CONFLICT") {
          await reload(id, new Set(confirmed.current.keys()));
          latest.current.notify("다른 곳에서 먼저 바뀐 장소가 있어 최신 목록으로 바꿨어요");
        } else if (caught instanceof DaymoApiError && caught.status === 403) {
          if (!warnedForbidden.current) {
            warnedForbidden.current = true;
            latest.current.notify("이 공간에서는 보기만 할 수 있어 장소가 저장되지 않아요");
          }
        } else if (!(caught instanceof DaymoApiError) || caught.status === 0 || caught.status >= 500) {
          if (!warnedOffline.current) {
            warnedOffline.current = true;
            latest.current.notify("장소를 아직 저장하지 못했어요. 연결되면 다시 저장할게요");
          }
          schedule(RETRY_MS);
        } else {
          throw caught;
        }
      }
      publishSyncedIds();
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        schedule(SYNC_DELAY_MS);
      }
    }
  };

  /**
   * 한 장소를 보낸다. 서버가 값을 거부하면(422) 그 모습은 다시 보내지 않고
   * 알린다. 다른 장소는 계속 보낸다.
   */
  const attempt = async (id: string, body: ReturnType<typeof placeBody>, send: () => Promise<void>) => {
    try {
      await send();
      failed.current.delete(id);
    } catch (caught) {
      if (caught instanceof DaymoApiError && caught.status === 422) {
        failed.current.set(id, bodyKey(body));
        latest.current.notify(`'${body.name}' 장소를 저장하지 못했어요. ${caught.message}`);
        return;
      }
      if (caught instanceof DaymoApiError && caught.status === 404) {
        // 고치려던 장소를 다른 곳에서 지웠다. 다음 차례에 새로 만든다.
        confirmed.current.delete(id);
        return;
      }
      throw caught;
    }
  };

  // 열 때 한 번 서버 목록을 받는다.
  useEffect(() => {
    if (!tripId) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = async () => {
      try {
        const server = await listTripPlaces(tripId);
        if (!active) return;
        const current = latest.current;
        const map = legacyIdMap(current.places, current.newId);
        if (map.size) current.remapIds(map);
        const local = current.places.map((place) => (map.has(place.id) ? { ...place, id: map.get(place.id)! } : place));
        confirmed.current = new Map();
        server.forEach(remember);
        const merged = mergeOnOpen(local, server, new Set(current.syncedIds)) as T[];
        current.setPlaces(() => merged);
        loaded.current = true;
        publishSyncedIds();
        schedule(SYNC_DELAY_MS);
      } catch {
        if (active) retry = setTimeout(open, RETRY_MS);
      }
    };
    void open();
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
    };
    // 여행이 바뀔 때만 다시 받는다. 나머지 값은 latest 로 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // 목록이 바뀌면 잠깐 기다렸다가 맞춘다.
  useEffect(() => {
    if (!tripId || !loaded.current) return;
    schedule(SYNC_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.places, tripId]);

  // 화면을 닫을 때 기다리던 것이 있으면 바로 보낸다.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
