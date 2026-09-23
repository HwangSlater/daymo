/**
 * 여행에 딸린 목록(장소·일정·숙소 …)을 서버와 맞추는 일반 계산.
 *
 * 화면은 목록을 기기에서 자유롭게 바꾼다. 바뀔 때마다 "마지막으로 서버와 맞춘
 * 모습" 과 비교해 만들기·고치기·지우기를 뽑는다. 목록마다 다른 것은 서버와 오가는
 * 모양뿐이라 그것만 `Codec` 으로 받는다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

export type Confirmed = { key: string; version: number };

export type ServerRow = { id: string; version: number };

export type Codec<L, B, S extends ServerRow> = {
  /** 서버와 맞출 줄인지. 서버 id 가 없거나 다른 줄에서 만들어진 파생 줄은 아니다. */
  syncable: (local: L) => boolean;
  /**
   * `syncable` 이 false 일 때 왜 못 올리는지 한 줄로. 값이 있으면 "올려야 하는데 지금은
   * 못 올린다" 는 뜻이라 화면에 저장 안 됨으로 알린다. 파생 줄처럼 애초에 안 올리는
   * 줄은 undefined 로 둔다.
   */
  blockReason?: (local: L) => string | undefined;
  idOf: (local: L) => string;
  toBody: (local: L) => B;
  fromServer: (server: S) => L;
  /**
   * 처음 열 때 서버 줄을 쓰되 기기에만 있는 값을 살릴 때(예: 숙소 이름은 서버에 없다).
   * 없으면 서버 줄 그대로.
   */
  keepLocal?: (fromServer: L, local: L) => L;
};

/** 서버가 거부한 줄. 같은 모습이면 다시 보내지 않고, 까닭은 그대로 화면에 쓴다. */
export type Failed = { key: string; reason: string };

export type ListPlan<B> = {
  creates: { id: string; body: B }[];
  updates: { id: string; body: B; version: number }[];
  deletes: { id: string; version: number }[];
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isServerId = (id: string | undefined): id is string => Boolean(id && UUID.test(id));

/** 비교용 한 줄. 배열 칸은 순서 없이 본다(서버가 태그를 가나다순으로 돌려준다). */
export function bodyKey(body: object): string {
  return JSON.stringify(body, (_, value) =>
    Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value].sort() : value);
}

export function planListSync<L, B, S extends ServerRow>(
  items: readonly L[],
  codec: Codec<L, B, S>,
  confirmed: ReadonlyMap<string, Confirmed>,
  failed: ReadonlyMap<string, Failed> = new Map(),
): ListPlan<B> {
  const plan: ListPlan<B> = { creates: [], updates: [], deletes: [] };
  const present = new Set<string>();
  for (const item of items) {
    const id = codec.idOf(item);
    // 지금은 올릴 수 없는 줄(예: 나간 멤버가 낸 지출)도 목록에 있으면 지우지 않는다.
    // 없는 것으로 치면 서버에 있는 기록을 지워 버린다.
    if (id) present.add(id);
    if (!codec.syncable(item)) continue;
    const body = codec.toBody(item);
    const key = bodyKey(body as object);
    if (failed.get(id)?.key === key) continue;
    const known = confirmed.get(id);
    if (!known) plan.creates.push({ id, body });
    else if (known.key !== key) plan.updates.push({ id, body, version: known.version });
  }
  for (const [id, known] of confirmed) {
    if (!present.has(id)) plan.deletes.push({ id, version: known.version });
  }
  return plan;
}

export const hasWork = (plan: ListPlan<unknown>) =>
  plan.creates.length + plan.updates.length + plan.deletes.length > 0;

/**
 * 보내다 만난 오류를 어떻게 다룰지(2026-09-23).
 *
 * 예전에는 아는 갈래(409·403·0·5xx)만 다루고 나머지는 그대로 던져서, 로그아웃 직후의
 * 401 이나 400 이 처리되지 않은 거부로 끝났다. 그러면 저장이 조용히 멈추는데 화면에는
 * 「대기」 배지조차 없어 저장된 것처럼 보였다. 이제 모든 갈래에 갈 곳이 있다.
 *
 * - `충돌`   다른 곳에서 먼저 고쳤다. 목록을 다시 받아 맞춘다.
 * - `권한없음` 보기 전용이라 못 고친다. 한 번만 알린다.
 * - `재시도`  연결·과부하처럼 그대로 다시 보내면 되는 것. 쉬었다 다시 보낸다.
 * - `다시로그인` 로그인이 풀렸다. 다시 보내 봐야 또 401 이라 멈추고 알린다.
 * - `거부`   같은 모습으로 다시 보내도 같은 답이 오는 것. 멈추고 알린다.
 */
export type SyncFailure = "충돌" | "권한없음" | "재시도" | "다시로그인" | "거부";

/**
 * 오류 하나를 갈래로 나눈다. 앱의 오류 타입을 들이지 않으려고 status·code 만 받는다.
 *
 * 앱 오류가 아니면(`undefined`) 연결이 끊긴 것으로 본다 — 어디서 끊겼는지 모르는 것은
 * 다시 해 보면 되는 쪽이 낫다.
 */
export function syncFailureOf(trouble: { status?: number; code?: string } | undefined): SyncFailure {
  if (!trouble) return "재시도";
  if (trouble.code === "VERSION_CONFLICT") return "충돌";
  const status = trouble.status ?? 0;
  if (status === 403) return "권한없음";
  if (status === 401) return "다시로그인";
  if (status === 0 || status === 429 || status >= 500) return "재시도";
  return "거부";
}

/**
 * 갈래마다 화면에 적을 한 줄. `까닭` 은 서버가 준 문구다.
 *
 * 「저장하지 못했어요」로 끝맺고 다음에 할 일을 붙인다(문구 사전의 오류 규칙).
 */
export function syncFailureMessage(kind: SyncFailure, label: string, 까닭?: string): string {
  if (kind === "다시로그인") return `로그인이 풀려 ${label} 변경을 저장하지 못했어요. 다시 로그인해 주세요`;
  if (kind === "재시도") return `${label} 변경을 아직 저장하지 못했어요. 연결되면 다시 저장할게요`;
  return `${label} 변경을 저장하지 못했어요. ${까닭 || "잠시 후 다시 시도해 주세요."}`;
}

/** 아직 서버에 남지 않은 줄 하나. `막힘` 은 까닭이 있어 못 보내고, `대기` 는 연결을 기다린다. */
export type RowTrouble = { state: "막힘" | "대기"; reason?: string };

/** 열려 있는 목록 전부를 합친 모습. 화면은 이것만 보고 그린다. */
export type SyncTrouble = {
  /** 줄 id → 상태. 여기에 없는 줄은 서버에 남았거나 곧 올라간다. */
  rows: ReadonlyMap<string, RowTrouble>;
  blocked: number;
  waiting: number;
  /** 연결이 끊겨 보내지도 받지도 못하는 중. */
  offline: boolean;
  /** 앞단이 "지금 바쁘다" 로 막아서, 다시 보내 봤는데도 못 받은 것이 있다. */
  busy: boolean;
};

/**
 * 못 올린 줄을 찾는다. 화면에 배지를 붙일 자리를 정하는 순수 계산이다.
 *
 * `waiting` 은 지금 연결이 끊겨 보내기가 밀려 있을 때만 켠다. 평소에는 800ms 뒤면
 * 올라가는데, 그동안 모든 줄에 "대기 중" 을 띄우면 글자를 칠 때마다 깜빡인다.
 */
export function listTrouble<L, B, S extends ServerRow>(
  items: readonly L[],
  codec: Codec<L, B, S>,
  confirmed: ReadonlyMap<string, Confirmed>,
  failed: ReadonlyMap<string, Failed>,
  waiting: boolean,
): Map<string, RowTrouble> {
  const rows = new Map<string, RowTrouble>();
  for (const item of items) {
    const id = codec.idOf(item);
    if (!id) continue;
    if (!codec.syncable(item)) {
      const reason = codec.blockReason?.(item);
      if (reason) rows.set(id, { state: "막힘", reason });
      continue;
    }
    const key = bodyKey(codec.toBody(item) as object);
    const stopped = failed.get(id);
    if (stopped?.key === key) {
      rows.set(id, { state: "막힘", reason: stopped.reason });
      continue;
    }
    if (!waiting) continue;
    const known = confirmed.get(id);
    if (!known || known.key !== key) rows.set(id, { state: "대기" });
  }
  return rows;
}

/**
 * 화면 위쪽에 늘 두는 한 줄. 아무 일도 없으면 빈 글자라 자리도 차지하지 않는다.
 *
 * 못 올린 줄이 먼저다. 그다음이 연결, 마지막이 "서버가 바빴다" 다. 앞의 둘은 사용자가
 * 적은 것이 걸려 있고, 마지막은 못 받은 것뿐이라 다시 열면 채워진다.
 */
export function troubleHeadline(trouble: Pick<SyncTrouble, "blocked" | "waiting" | "offline" | "busy">): string {
  const total = trouble.blocked + trouble.waiting;
  if (total > 0) {
    return trouble.offline
      ? `아직 저장하지 못한 ${total}개 · 연결되면 다시 저장할게요`
      : `아직 저장하지 못한 ${total}개`;
  }
  if (trouble.offline) return "연결이 끊겨 새 내용을 받지 못했어요";
  return trouble.busy ? "일부를 불러오지 못했어요 · 잠시 후 다시 불러와 주세요" : "";
}

/**
 * 앞으로 돌아왔을 때 다시 받을지. 방금 받았으면 건너뛴다.
 *
 * 탭을 자주 오가는 사람이 옮길 때마다 목록을 통째로 받게 두면 폴링과 다를 게 없다.
 */
export const shouldRefetch = (lastAt: number, now: number, gapMs = 15_000) => now - lastAt >= gapMs;

/**
 * 처음 열 때 서버 목록과 기기 목록을 합친다.
 *
 * - 서버에 있는 줄은 서버 모습을 쓴다. 다른 기기에서 고친 것이 보여야 한다.
 * - 기기에만 있고 예전에 맞춘 적이 있으면(`syncedIds`) 다른 곳에서 지운 것이라 버린다.
 * - 기기에만 있고 맞춘 적이 없으면 아직 못 올린 줄이라 남긴다.
 * - 서버와 맞추지 않는 줄(파생 줄)은 그대로 남긴다.
 */
export function mergeListOnOpen<L, B, S extends ServerRow>(
  local: readonly L[],
  server: readonly S[],
  syncedIds: ReadonlySet<string>,
  codec: Codec<L, B, S>,
): L[] {
  const serverIds = new Set(server.map((row) => row.id));
  const localById = new Map<string, L>();
  for (const item of local) if (codec.syncable(item)) localById.set(codec.idOf(item), item);
  const fromServer = server.map((row) => {
    const item = codec.fromServer(row);
    const mine = localById.get(row.id);
    return mine && codec.keepLocal ? codec.keepLocal(item, mine) : item;
  });
  const kept = local.filter((item) => {
    const id = codec.idOf(item);
    // 서버에 같은 id 가 있으면 서버 줄을 쓴다. 올릴 수 없는 줄이어도 두 번 보이면 안 된다.
    if (id && serverIds.has(id)) return false;
    if (!codec.syncable(item)) return true;
    return !syncedIds.has(id);
  });
  return [...fromServer, ...kept];
}
