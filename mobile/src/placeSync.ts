/**
 * 여행 장소를 서버와 맞추는 계산. 무엇을 만들고 고치고 지울지만 정한다.
 *
 * 화면은 장소 목록을 지금처럼 자유롭게 바꾼다. 바뀔 때마다 이 파일이 "마지막으로
 * 서버와 맞춘 모습" 과 비교해 할 일을 뽑고, `usePlaceSync` 가 그 일을 서버에 보낸다.
 * 화면 곳곳의 장소 수정 코드에 서버 호출을 하나씩 심지 않으려는 구조다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

export type AppPlaceStatus = "후보" | "일정";
export type ServerPlaceStatus = "saved" | "scheduled" | "visited";

/** 앱의 장소(WarmTripDetail 의 PlaceItem)와 같은 모양. */
export type AppPlace = {
  id: string;
  name: string;
  area: string;
  address?: string;
  category: string;
  mapUrl: string;
  tags: string[];
  status: AppPlaceStatus;
};

export type ServerPlace = {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  category: string | null;
  status: ServerPlaceStatus;
  memo: string | null;
  tags: string[];
  mapUrl: string | null;
  version: number;
};

/** 서버로 보내는 칸. 서버가 받는 한도에 맞춰 둔다. */
export type PlaceBody = {
  name: string;
  area: string | null;
  address: string | null;
  category: string | null;
  status: ServerPlaceStatus;
  tags: string[];
  mapUrl: string | null;
};

/**
 * 앱이 지역을 모를 때 적는 말. 서버에는 "모름" 을 빈 값으로 둔다. 둘을 서로 바꿔
 * 읽어야 다른 기기에서 지역 없이 담은 장소가 "카페 · " 처럼 보이지 않고, 앱이
 * 이 말을 서버에 지역인 것처럼 써 넣지도 않는다.
 */
export const UNKNOWN_AREA = "위치 미정";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isServerId = (id: string) => UUID.test(id);

const blank = (value: string | null | undefined, max: number) => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/**
 * 앱 장소를 서버가 받는 모양으로.
 *
 * 서버가 거부할 값은 여기서 미리 고친다. http 가 아닌 지도 링크는 보내지 않고,
 * 긴 글자는 한도에서 자른다. 서버에서 422 가 나면 그 장소는 영영 올라가지 못한다.
 */
export function placeBody(place: AppPlace): PlaceBody {
  const url = place.mapUrl.trim();
  const tags: string[] = [];
  for (const raw of place.tags) {
    const tag = raw.split(/\s+/).filter(Boolean).join(" ").slice(0, 20);
    if (tag && !tags.includes(tag) && tags.length < 20) tags.push(tag);
  }
  return {
    name: place.name.trim().slice(0, 100) || "이름 없는 장소",
    area: place.area.trim() === UNKNOWN_AREA ? null : blank(place.area, 30),
    address: blank(place.address, 300),
    category: blank(place.category, 30),
    status: place.status === "일정" ? "scheduled" : "saved",
    tags,
    mapUrl: /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 2048) : null,
  };
}

export function placeFromServer(place: ServerPlace): AppPlace {
  return {
    id: place.id,
    name: place.name,
    area: place.area ?? UNKNOWN_AREA,
    address: place.address ?? "",
    category: place.category ?? "",
    mapUrl: place.mapUrl ?? "",
    tags: [...place.tags],
    // 앱에는 다녀옴이 없다. 다녀온 곳도 일정에 담긴 곳으로 보인다.
    status: place.status === "saved" ? "후보" : "일정",
  };
}

/**
 * 비교용 한 줄. 태그는 순서 없이 본다. 서버가 가나다순으로 돌려주므로 순서까지
 * 비교하면 저장할 때마다 바뀐 것으로 보여 끝없이 다시 보낸다.
 */
export function bodyKey(body: PlaceBody): string {
  return JSON.stringify({ ...body, tags: [...body.tags].sort() });
}

/** 서버가 알고 있는 장소 하나의 마지막 모습. */
export type Confirmed = { key: string; version: number };

export type PlacePlan = {
  creates: { id: string; body: PlaceBody }[];
  updates: { id: string; body: PlaceBody; version: number }[];
  deletes: { id: string; version: number }[];
};

/**
 * 지금 목록과 마지막으로 맞춘 모습을 비교해 할 일을 뽑는다.
 *
 * `failed` 는 서버가 거부한 장소의 비교용 한 줄이다. 같은 모습으로 다시 보내면
 * 또 거부되므로 사용자가 고칠 때까지 건너뛴다.
 */
export function planPlaceSync(
  places: readonly AppPlace[],
  confirmed: ReadonlyMap<string, Confirmed>,
  failed: ReadonlyMap<string, string> = new Map(),
): PlacePlan {
  const plan: PlacePlan = { creates: [], updates: [], deletes: [] };
  const present = new Set<string>();
  for (const place of places) {
    if (!isServerId(place.id)) continue;
    present.add(place.id);
    const body = placeBody(place);
    const key = bodyKey(body);
    if (failed.get(place.id) === key) continue;
    const known = confirmed.get(place.id);
    if (!known) plan.creates.push({ id: place.id, body });
    else if (known.key !== key) plan.updates.push({ id: place.id, body, version: known.version });
  }
  for (const [id, known] of confirmed) {
    if (!present.has(id)) plan.deletes.push({ id, version: known.version });
  }
  return plan;
}

/** 할 일이 있는지. */
export const hasWork = (plan: PlacePlan) =>
  plan.creates.length + plan.updates.length + plan.deletes.length > 0;

/**
 * 화면을 처음 열 때 서버 목록과 기기 목록을 합친다.
 *
 * - 서버에 있는 장소는 서버 모습을 쓴다. 다른 기기에서 고친 것이 보여야 한다.
 * - 기기에만 있고 예전에 서버와 맞춘 적이 있으면(`syncedIds`) 다른 곳에서 지운
 *   것이라 버린다.
 * - 기기에만 있고 맞춘 적이 없으면 아직 못 올린 장소라 남긴다. 다음 동기화가 올린다.
 *
 * 순서는 서버 목록 뒤에 남긴 기기 장소를 붙인다.
 */
export function mergeOnOpen(
  local: readonly AppPlace[],
  server: readonly ServerPlace[],
  syncedIds: ReadonlySet<string>,
): AppPlace[] {
  const serverIds = new Set(server.map((place) => place.id));
  const pending = local.filter((place) => !serverIds.has(place.id) && !syncedIds.has(place.id));
  return [...server.map(placeFromServer), ...pending];
}

/**
 * 서버 id 가 아닌 옛 장소 id 를 새 id 로 바꿀 표를 만든다.
 *
 * 이 기능이 생기기 전에 기기에서 만든 장소는 `place-123` 같은 id 를 쓴다. 서버는
 * UUID 만 받는다. 일정·숙소가 이 id 로 장소를 가리키므로 표를 만들어 함께 바꾼다.
 */
export function legacyIdMap(places: readonly AppPlace[], newId: () => string): Map<string, string> {
  const map = new Map<string, string>();
  for (const place of places) {
    if (!isServerId(place.id) && !map.has(place.id)) map.set(place.id, newId());
  }
  return map;
}
