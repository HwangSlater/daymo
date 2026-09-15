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
  idOf: (local: L) => string;
  toBody: (local: L) => B;
  fromServer: (server: S) => L;
  /**
   * 처음 열 때 서버 줄을 쓰되 기기에만 있는 값을 살릴 때(예: 숙소 이름은 서버에 없다).
   * 없으면 서버 줄 그대로.
   */
  keepLocal?: (fromServer: L, local: L) => L;
};

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
  failed: ReadonlyMap<string, string> = new Map(),
): ListPlan<B> {
  const plan: ListPlan<B> = { creates: [], updates: [], deletes: [] };
  const present = new Set<string>();
  for (const item of items) {
    if (!codec.syncable(item)) continue;
    const id = codec.idOf(item);
    present.add(id);
    const body = codec.toBody(item);
    const key = bodyKey(body as object);
    if (failed.get(id) === key) continue;
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
    if (!codec.syncable(item)) return true;
    const id = codec.idOf(item);
    return !serverIds.has(id) && !syncedIds.has(id);
  });
  return [...fromServer, ...kept];
}

/** 로컬 날짜 키(YYYY-MM-DD). 기기 시간대 기준이다. */
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** 여행 기간의 날짜 키들. 시작이 끝보다 늦거나 모양이 틀리면 빈 목록. */
export function tripDateKeys(start: string | undefined, end: string | undefined): string[] {
  const parse = (value: string | undefined) => {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
  };
  const first = parse(start);
  const last = parse(end);
  if (!first || !last || first > last) return [];
  const keys: string[] = [];
  const cursor = new Date(first);
  while (cursor <= last && keys.length < 366) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const fromKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

/** 일정 탭의 날짜 이름표. 화면(WarmTripDetail 의 dayLabel)과 같은 모양이다. `2일(금)` */
export const dayLabelOf = (key: string) => {
  const date = fromKey(key);
  return `${date.getDate()}일(${WEEKDAYS[date.getDay()]})`;
};

/** 숙소 체크인·체크아웃의 날짜 이름표. 화면(dateLabel)과 같은 모양이다. `10월 1일` */
export const dateLabelOf = (key: string) => {
  const date = fromKey(key);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};
