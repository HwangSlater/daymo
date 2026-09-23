import { useEffect, useRef, useSyncExternalStore } from "react";

import { DaymoApiError } from "./auth";
import {
  bodyKey,
  hasWork,
  isServerId,
  listTrouble,
  mergeListOnOpen,
  planListSync,
  syncFailureMessage,
  syncFailureOf,
  type Codec,
  type Confirmed,
  type Failed,
  type RowTrouble,
  type ServerRow,
  type SyncTrouble,
} from "./listSync";
import { onGiveUp } from "./requestQueue";

// 글자를 칠 때마다 보내지 않는다. 잠깐 모았다가 한 번에 맞춘다.
const SYNC_DELAY_MS = 800;
// 연결이 끊겼을 때 다시 해 보는 간격.
const RETRY_MS = 20_000;
/**
 * 화면을 오래 열어 뒀을 때 스스로 한 번 다시 받는 시각.
 *
 * 폴링은 하지 않는다. 앞으로 돌아올 때와 당겨서 새로고침이 평소의 길이고, 여행 상세를
 * 켠 채로 오래 앉아 이야기하는 경우만 이 한 번이 메운다. 한 번 울리고 끝이라 화면이
 * 열려 있는 동안 늘어나는 요청은 목록마다 딱 하나다.
 */
const STALE_MS = 10 * 60_000;

/**
 * 열려 있는 목록을 다시 받으라는 신호. 앱이 앞으로 오거나 당겨서 새로고침할 때 부른다.
 * 다 받을 때까지 기다릴 수 있어 새로고침 표시를 언제 내릴지 화면이 안다.
 */
const reloadListeners = new Set<() => Promise<void>>();
export function reloadOpenLists(): Promise<void> {
  return Promise.all([...reloadListeners].map((listen) => listen())).then(() => undefined);
}

/**
 * 막혀 있던 줄을 한 번 더 보내 본다. 화면의 「다시 시도」가 부른다.
 *
 * 서버가 거부한 줄은 같은 모습으로 다시 보내면 또 거부되므로 평소에는 건너뛴다
 * (`listSync` 의 failed). 사용자가 다시 시도를 누른 때만 그 기억을 지우고 보낸다.
 * 잠깐 넘친 용량처럼 사용자가 고치지 않아도 풀리는 까닭이 있어서다.
 */
const retryListeners = new Set<() => void>();
export function retryBlockedRows(): void {
  retryListeners.forEach((보낸다) => 보낸다());
}

// ── 아직 못 올린 줄을 화면에 알리는 자리 ───────────────────────────────
// 목록마다 훅이 하나씩이라 자리를 나눠 쓰고, 화면은 합친 모습 하나만 본다.
type Entry = { rows: Map<string, RowTrouble>; offline: boolean };
const entries = new Map<number, Entry>();
const troubleListeners = new Set<() => void>();
let slots = 0;
let snapshot: SyncTrouble = { rows: new Map(), blocked: 0, waiting: 0, offline: false, busy: false };
let stamp = "";

/**
 * 요청 줄이 끝내 못 보낸 것. 목록 하나의 일이 아니라 앱 전체의 일이라 자리를 따로 둔다.
 *
 * 사진 받기처럼 지금까지 조용히 넘기던 길도 이 자리를 지나 화면 위 한 줄까지 온다.
 */
let queueTrouble = { busy: false, unreachable: false };

function republish() {
  const rows = new Map<string, RowTrouble>();
  let offline = queueTrouble.unreachable;
  let blocked = 0;
  let waiting = 0;
  for (const entry of entries.values()) {
    if (entry.offline) offline = true;
    entry.rows.forEach((row, id) => rows.set(id, row));
  }
  const marks: string[] = [];
  rows.forEach((row, id) => {
    if (row.state === "막힘") blocked += 1;
    else waiting += 1;
    marks.push(`${id}:${row.state}:${row.reason ?? ""}`);
  });
  const busy = queueTrouble.busy;
  // 같은 모습이면 알리지 않는다. 목록이 바뀔 때마다 화면 전체가 다시 그려지면 안 된다.
  const next = `${offline}|${busy}|${marks.sort().join(",")}`;
  if (next === stamp) return;
  stamp = next;
  snapshot = { rows, blocked, waiting, offline, busy };
  troubleListeners.forEach((listen) => listen());
}

/** 못 보낸 요청 한 줄을 얼마나 띄워 둘지. 이 시간이 지나면 스스로 걷힌다. */
const GIVE_UP_NOTICE_MS = 8_000;
let giveUpTimer: ReturnType<typeof setTimeout> | null = null;

// 줄이 포기한 요청을 화면 위 한 줄로 옮긴다. 앱이 켜져 있는 동안 계속 듣는다.
onGiveUp(({ kind }) => {
  queueTrouble = {
    busy: queueTrouble.busy || kind === "congested",
    unreachable: queueTrouble.unreachable || kind === "unreachable",
  };
  republish();
  if (giveUpTimer) clearTimeout(giveUpTimer);
  giveUpTimer = setTimeout(() => {
    giveUpTimer = null;
    queueTrouble = { busy: false, unreachable: false };
    republish();
  }, GIVE_UP_NOTICE_MS);
});

/** 열려 있는 모든 목록에서 아직 못 올린 줄. 배지와 위쪽 한 줄이 이것만 본다. */
export function useSyncTrouble(): SyncTrouble {
  return useSyncExternalStore(
    (listen) => {
      troubleListeners.add(listen);
      return () => {
        troubleListeners.delete(listen);
      };
    },
    () => snapshot,
    () => snapshot,
  );
}

type ListApi<B, S extends ServerRow> = {
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
  /**
   * 바뀌면 열 때처럼 서버 목록을 다시 받아 합친다. 휴지통에서 되살린 줄처럼 이 기기가
   * 만들지 않은 변화를 바로 보여 줄 때 올린다.
   */
  reloadKey?: number;
  /**
   * 서버가 403 으로 막았을 때의 안내. 없으면 보기만 하는 공간이라고 알린다.
   * 사진처럼 편집 멤버도 막히는 줄이 있어, 그때는 까닭을 따로 적는다.
   */
  forbiddenMessage?: string;
  /**
   * 새 줄을 한꺼번에 몇 개까지 보낼지. 기본은 하나씩이다.
   *
   * 사진만 올린다. 여행이 끝나면 수십 장을 한 번에 넣는데 한 장씩 보내면 그만큼 기다린다.
   * 글줄은 한 번에 몇 개 생기지 않아 하나씩으로 충분하고, 차례대로 보내야 화면과 같은
   * 차례로 서버에 쌓인다.
   */
  createBatch?: number;
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
 *
 * 여행 상세 하나에 이 훅이 열세 개 붙는다. 열 때 열세 개가 한꺼번에 목록을 부르지만,
 * 여기서 따로 묶지 않는다. 모든 요청이 `requestQueue` 를 지나며 다섯씩만 나가고,
 * 막히면 그 안에서 쉬었다 다시 간다. 여기서 또 묶으면 두 겹으로 기다리게 되고, 목록
 * 사이의 차례는 화면이 정할 일도 아니다(어느 탭을 먼저 여는지는 사용자가 정한다).
 */
export function useListSync<L, B, S extends ServerRow>(options: Options<L, B, S>) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const confirmed = useRef(new Map<string, Confirmed>());
  const failed = useRef(new Map<string, Failed>());
  const loaded = useRef(false);
  const running = useRef(false);
  const opening = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedOffline = useRef(false);
  const warnedForbidden = useRef(false);
  // 로그인이 풀렸다는 말은 한 번만 한다. 목록이 열세 개라 갈래마다 말하면 열세 줄이 뜬다.
  const warnedSignedOut = useRef(false);
  // 연결이 없어 보내지도 받지도 못하는 중.
  const offline = useRef(false);
  // 목록마다 자리를 하나씩 쓴다. 훅이 몇 번째로 불렸는지에 기대지 않으려고 번호를 붙인다.
  const slot = useRef<number | null>(null);
  if (slot.current == null) slot.current = ++slots;

  const tripId = options.tripId && isServerId(options.tripId) ? options.tripId : undefined;

  /** 지금 이 목록에서 못 올린 줄을 화면 쪽에 알린다. */
  const publishTrouble = () => {
    const { items, codec } = latest.current;
    entries.set(slot.current ?? 0, {
      // 첫 목록을 아직 못 받았으면 무엇이 서버에 있는지 모른다. 그때 대기로 세면
      // 이미 올라간 줄까지 저장 안 됨으로 보인다.
      rows: listTrouble(items, codec, confirmed.current, failed.current, offline.current && loaded.current),
      offline: offline.current,
    });
    republish();
  };

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

  /**
   * 보내기를 시작하되 거부를 남기지 않는다(2026-09-23).
   *
   * `run()` 은 안에서 모든 갈래를 알리고 끝나지만, 앞으로 더 늘어날 길에서 새 오류가
   * 새어 나가면 처리되지 않은 promise 거부가 된다. 부르는 자리마다 받아 둔다.
   */
  const 보내기 = () => {
    void run().catch(() => undefined);
  };

  const schedule = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      보내기();
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
      // 413 은 사진이 너무 크거나 저장 공간이 찼을 때다(`PHOTO_TOO_LARGE`,
      // `STORAGE_QUOTA_EXCEEDED`). 422 와 같이 다시 보내도 같은 답이 오는 거부라,
      // 조용히 다시 보내지 않고 까닭을 그대로 알린다. 「다시 시도」로 한 번 더 보낸다.
      if (caught instanceof DaymoApiError && (caught.status === 422 || caught.status === 413)) {
        // 같은 모습으로 다시 보내면 또 거부된다. 사용자가 고칠 때까지 건너뛴다.
        failed.current.set(id, { key: bodyKey(body as object), reason: caught.message });
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
        // 몇 개씩 묶어 보낸다(기본은 하나씩). 묶어도 요청 줄이 다시 다섯으로 묶고
        // 사진 올리기는 그 줄의 뒤 순위라, 보고 있는 화면이 밀리지는 않는다.
        const 한_번에 = Math.max(1, latest.current.createBatch ?? 1);
        for (let 앞 = 0; 앞 < plan.creates.length; 앞 += 한_번에) {
          await Promise.all(plan.creates.slice(앞, 앞 + 한_번에).map((item) =>
            attempt(item.id, item.body, async () => remember(await api.create(id, item.id, item.body)))));
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
        warnedSignedOut.current = false;
        offline.current = false;
      } catch (caught) {
        // 갈래를 가르는 판정은 순수 계산으로 빼 두었다(`listSync.syncFailureOf`). 여기서는
        // 갈래마다 무엇을 하는지만 적는다. 어느 갈래도 오류를 다시 던지지 않는다 — 던지면
        // 처리되지 않은 promise 거부로 끝나 저장이 조용히 멈춘다(2026-09-23).
        const 앱_오류 = caught instanceof DaymoApiError ? caught : undefined;
        const 갈래 = syncFailureOf(앱_오류 && { status: 앱_오류.status, code: 앱_오류.code });
        if (갈래 === "충돌") {
          try {
            await reload(id, new Set(confirmed.current.keys()));
            latest.current.notify(`다른 곳에서 먼저 바뀐 내용이 있어 ${label} 목록을 최신으로 바꿨어요`);
          } catch {
            // 다시 받는 길마저 막혔으면 연결이 끊긴 것으로 보고 쉬었다 다시 한다.
            offline.current = true;
            schedule(RETRY_MS);
          }
        } else if (갈래 === "권한없음") {
          if (!warnedForbidden.current) {
            warnedForbidden.current = true;
            latest.current.notify(
              latest.current.forbiddenMessage ?? `보기 전용 공간이라 ${label} 변경이 저장되지 않아요`,
            );
          }
        } else if (갈래 === "재시도") {
          offline.current = true;
          if (!warnedOffline.current) {
            warnedOffline.current = true;
            latest.current.notify(syncFailureMessage("재시도", label));
          }
          schedule(RETRY_MS);
        } else if (갈래 === "다시로그인") {
          // 다시 보내 봐야 또 401 이다. 쉬었다 다시 하지 않고 사람이 할 일만 알린다.
          if (!warnedSignedOut.current) {
            warnedSignedOut.current = true;
            latest.current.notify(syncFailureMessage("다시로그인", label));
          }
        } else {
          // 400 처럼 같은 모습으로 다시 보내도 같은 답이 오는 것. 그 줄을 막아 두고 알린다.
          // 「다시 시도」를 누르면 막아 둔 기억을 지우고 한 번 더 보낸다.
          const 막을_줄 = planListSync(latest.current.items, codec, confirmed.current, failed.current);
          const 까닭 = 앱_오류?.message;
          [...막을_줄.creates, ...막을_줄.updates].forEach((줄) => {
            failed.current.set(줄.id, { key: bodyKey(줄.body as object), reason: 까닭 || "잠시 후 다시 시도해 주세요." });
          });
          latest.current.notify(syncFailureMessage("거부", label, 까닭));
        }
      }
      publishSyncedIds();
    } finally {
      publishTrouble();
      running.current = false;
      if (again.current) {
        again.current = false;
        schedule(SYNC_DELAY_MS);
      }
    }
  };

  // 열 때 한 번 서버 목록을 받는다. 그 뒤로는 앞으로 돌아오거나 당겨서 새로고침할 때,
  // 그리고 오래 열어 뒀을 때 한 번 더 받는다.
  useEffect(() => {
    if (!tripId) {
      entries.delete(slot.current ?? 0);
      republish();
      return;
    }
    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = async () => {
      // 이미 받는 중이면 겹쳐 받지 않는다. 앞으로 오자마자 당겨서 새로고침하는 경우다.
      if (opening.current) return;
      opening.current = true;
      try {
        // 다시 받는 경우에는 기다리던 변경을 먼저 보낸다. 그러지 않으면 방금 지운 줄이 되살아나 보인다.
        if (loaded.current && timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
          await run();
        }
        const server = await latest.current.api.list(tripId);
        if (!active) return;
        const current = latest.current;
        confirmed.current = new Map();
        server.forEach(remember);
        const syncedIds = new Set(current.syncedIds);
        // 받는 동안 화면에서 바뀐 것까지 합치도록 그때의 목록에 합친다.
        current.setItems((now) => mergeListOnOpen(now, server, syncedIds, current.codec));
        loaded.current = true;
        offline.current = false;
        publishSyncedIds();
        publishTrouble();
        schedule(SYNC_DELAY_MS);
      } catch (caught) {
        if (!active) return;
        // 첫 목록도 못 받았으면 조용히 다시 해 보되, 못 받고 있다는 사실은 알린다.
        offline.current = true;
        publishTrouble();
        // 로그인이 풀린 것은 스무 초마다 다시 해 봐야 또 401 이다. 멈추고 할 일만 알린다.
        const 앱_오류 = caught instanceof DaymoApiError ? caught : undefined;
        if (syncFailureOf(앱_오류 && { status: 앱_오류.status, code: 앱_오류.code }) === "다시로그인") {
          if (!warnedSignedOut.current) {
            warnedSignedOut.current = true;
            latest.current.notify(syncFailureMessage("다시로그인", latest.current.label));
          }
          return;
        }
        retry = setTimeout(open, RETRY_MS);
      } finally {
        opening.current = false;
      }
    };
    void open();
    reloadListeners.add(open);
    // 「다시 시도」는 거부당한 기억만 지우고 곧바로 보낸다. 목록을 다시 받지는 않는다.
    const 다시_보낸다 = () => {
      if (!failed.current.size) return;
      failed.current.clear();
      publishTrouble();
      보내기();
    };
    retryListeners.add(다시_보낸다);
    const stale = setTimeout(() => void open(), STALE_MS);
    return () => {
      active = false;
      reloadListeners.delete(open);
      retryListeners.delete(다시_보낸다);
      clearTimeout(stale);
      if (retry) clearTimeout(retry);
    };
    // 여행이 바뀌거나 다시 받으라고 할 때만 받는다. 나머지 값은 latest 로 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, options.reloadKey]);

  // 목록이 바뀌면 잠깐 기다렸다가 맞춘다. 고친 줄의 배지는 보내기 전에 바로 걷힌다.
  useEffect(() => {
    if (!tripId) return;
    publishTrouble();
    if (!loaded.current) return;
    schedule(SYNC_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.items, options.refreshKey, tripId]);

  // 화면을 닫으면 이 목록의 배지도 거둔다.
  useEffect(() => () => {
    entries.delete(slot.current ?? 0);
    republish();
  }, []);

  // 화면을 닫을 때 기다리던 것이 있으면 바로 보낸다.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      보내기();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
