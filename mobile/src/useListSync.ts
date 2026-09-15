import { useEffect, useRef } from "react";

import { DaymoApiError } from "./auth";
import {
  bodyKey,
  hasWork,
  isServerId,
  mergeListOnOpen,
  planListSync,
  type Codec,
  type Confirmed,
  type ServerRow,
} from "./listSync";

// 글자를 칠 때마다 보내지 않는다. 잠깐 모았다가 한 번에 맞춘다.
const SYNC_DELAY_MS = 800;
// 연결이 끊겼을 때 다시 해 보는 간격.
const RETRY_MS = 20_000;

export type ListApi<B, S extends ServerRow> = {
  list: (tripId: string) => Promise<S[]>;
  create: (tripId: string, id: string, body: B) => Promise<S>;
  update: (id: string, version: number, body: B) => Promise<S>;
  remove: (id: string) => Promise<void>;
};

type Options<L, B, S extends ServerRow> = {
  /** 서버 여행 id. 없거나 서버 id 가 아니면(예시 여행) 아무것도 하지 않는다. */
  tripId?: string;
  /** 화면에 보이는 이름. 안내 문구에 쓴다. `장소`, `일정`, `숙소`. */
  label: string;
  items: L[];
  setItems: (updater: (current: L[]) => L[]) => void;
  codec: Codec<L, B, S>;
  api: ListApi<B, S>;
  /** 예전에 서버와 맞춘 id. 기기에 함께 저장해 둔다. */
  syncedIds: readonly string[];
  setSyncedIds: (ids: string[]) => void;
  /**
   * 코덱이 기대는 바깥 값(여행 기간, 서버에 올라간 장소 id …)을 한 줄로. 바뀌면
   * 목록이 그대로여도 다시 비교한다. 장소가 올라간 뒤에야 일정에 장소를 이을 수 있다.
   */
  refreshKey?: string;
  notify: (message: string) => void;
};

/**
 * 여행 상세가 열려 있는 동안 목록 하나를 서버와 맞춘다.
 *
 * 1. 열 때 서버 목록을 받아 기기 목록과 합친다(`mergeListOnOpen`). 서버 id 가 없는 옛
 *    줄은 합치기 전에 화면 쪽에서 새 id 를 받아 둬야 한다.
 * 2. 그 뒤로 목록이 바뀌면 잠깐 기다렸다가 만들기·고치기·지우기를 보낸다.
 * 3. 다른 곳에서 먼저 고쳤으면(409) 서버 목록을 다시 받아 보여 준다.
 *
 * 연결이 없으면 기기에서는 계속 쓰고, 연결되면 다시 보낸다. 앱을 닫았다 열면
 * 1번에서 아직 못 올린 줄을 찾아 다시 올린다.
 */
export function useListSync<L, B, S extends ServerRow>(options: Options<L, B, S>) {
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

  const remember = (row: S) => {
    const { codec } = latest.current;
    confirmed.current.set(row.id, { key: bodyKey(codec.toBody(codec.fromServer(row)) as object), version: row.version });
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

  /** 서버 목록으로 화면을 다시 맞춘다. 아직 못 올린 줄은 남긴다. */
  const reload = async (id: string, syncedIds: ReadonlySet<string>) => {
    const server = await latest.current.api.list(id);
    confirmed.current = new Map();
    server.forEach(remember);
    const { codec } = latest.current;
    latest.current.setItems((current) => mergeListOnOpen(current, server, syncedIds, codec));
    publishSyncedIds();
  };

  const attempt = async (id: string, body: B, send: () => Promise<void>) => {
    try {
      await send();
      failed.current.delete(id);
    } catch (caught) {
      if (caught instanceof DaymoApiError && caught.status === 422) {
        // 같은 모습으로 다시 보내면 또 거부된다. 사용자가 고칠 때까지 건너뛴다.
        failed.current.set(id, bodyKey(body as object));
        latest.current.notify(`${latest.current.label} 저장에 실패했어요. ${caught.message}`);
        return;
      }
      if (caught instanceof DaymoApiError && caught.status === 404) {
        // 고치려던 줄을 다른 곳에서 지웠다. 다음 차례에 새로 만든다.
        confirmed.current.delete(id);
        return;
      }
      throw caught;
    }
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
      const { codec, api, label } = latest.current;
      const plan = planListSync(latest.current.items, codec, confirmed.current, failed.current);
      if (!hasWork(plan)) return;
      try {
        for (const item of plan.creates) {
          await attempt(item.id, item.body, async () => remember(await api.create(id, item.id, item.body)));
        }
        for (const item of plan.updates) {
          await attempt(item.id, item.body, async () => remember(await api.update(item.id, item.version, item.body)));
        }
        for (const item of plan.deletes) {
          try {
            await api.remove(item.id);
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
          latest.current.notify(`다른 곳에서 먼저 바뀐 내용이 있어 ${label} 목록을 최신으로 바꿨어요`);
        } else if (caught instanceof DaymoApiError && caught.status === 403) {
          if (!warnedForbidden.current) {
            warnedForbidden.current = true;
            latest.current.notify(`이 공간에서는 보기만 할 수 있어 ${label} 변경이 저장되지 않아요`);
          }
        } else if (!(caught instanceof DaymoApiError) || caught.status === 0 || caught.status >= 500) {
          if (!warnedOffline.current) {
            warnedOffline.current = true;
            latest.current.notify(`${label} 변경을 아직 저장하지 못했어요. 연결되면 다시 저장할게요`);
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

  // 열 때 한 번 서버 목록을 받는다.
  useEffect(() => {
    if (!tripId) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = async () => {
      try {
        const server = await latest.current.api.list(tripId);
        if (!active) return;
        const current = latest.current;
        confirmed.current = new Map();
        server.forEach(remember);
        const syncedIds = new Set(current.syncedIds);
        // 받는 동안 화면에서 바뀐 것까지 합치도록 그때의 목록에 합친다.
        current.setItems((now) => mergeListOnOpen(now, server, syncedIds, current.codec));
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
  }, [options.items, options.refreshKey, tripId]);

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
