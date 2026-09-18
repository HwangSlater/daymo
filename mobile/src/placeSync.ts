/**
 * 여행 장소를 서버와 오가는 모양. 맞추는 계산은 `listSync.ts` 가 한다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import {
  bodyKey,
  hasWork,
  isServerId,
  mergeListOnOpen,
  planListSync,
  type Codec,
  type Confirmed,
  type Failed,
  type ListPlan,
} from "./listSync.ts";

export { bodyKey, hasWork, isServerId, type Confirmed };

/**
 * 장소가 이 여행에서 어디까지 왔는지. 서버의 `saved`·`scheduled`·`visited` 와 하나씩 맞는다.
 *
 * 서버도 한 장소에 상태 한 칸이라 「일정에 담김」과 「다녀옴」이 함께 켜지지
 * 않는다. 둘 다인 곳은 다녀옴으로 둔다. 다녀왔다는 것이 나중에 일어난 일이고,
 * 일정에 있었는지는 일정 탭이 그대로 보여 준다.
 */
export type AppPlaceStatus = "후보" | "일정" | "다녀옴";
export type ServerPlaceStatus = "saved" | "scheduled" | "visited";

/** 일정에 담겼을 때의 상태. 다녀온 곳은 그대로 둔다. */
export const planned = (status: AppPlaceStatus): AppPlaceStatus =>
  status === "다녀옴" ? "다녀옴" : "일정";

/** 일정에서 빠졌을 때의 상태. 다녀온 기록까지 지우지는 않는다. */
export const unplanned = (status: AppPlaceStatus): AppPlaceStatus =>
  status === "일정" ? "후보" : status;

// 「다녀옴」을 손으로 켜고 끄던 길(toggleVisited·visitScheduled·scheduledCount)은
// 2026-09-18에 없앴다. 여행이 끝났는지와 일정에 담겼는지는 앱이 이미 아니까,
// 지난 여행의 일정에 담긴 곳은 화면에서 다녀온 곳으로 보여 준다. 설정에서 끈다.
// 예전 자료에 남아 있는 「다녀옴」 상태는 그대로 읽는다.

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
  /** 그 자리에서 적어 두는 한 줄. `웨이팅 30분`, `숙소 근처`. 옛 기기 기록에는 없다. */
  memo?: string;
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
  memo: string | null;
};

/**
 * 앱이 지역을 모를 때 적는 말. 서버에는 "모름" 을 빈 값으로 둔다. 둘을 서로 바꿔
 * 읽어야 다른 기기에서 지역 없이 담은 장소가 "카페 · " 처럼 보이지 않고, 앱이
 * 이 말을 서버에 지역인 것처럼 써 넣지도 않는다.
 */
export const UNKNOWN_AREA = "위치 미정";

export const blank = (value: string | null | undefined, max: number) => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** http/https 링크만 보낸다. 서버도 그것만 받는다. */
export const safeUrl = (value: string | undefined) => {
  const url = (value ?? "").trim();
  return /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 2048) : null;
};

/**
 * 앱 장소를 서버가 받는 모양으로.
 *
 * 서버가 거부할 값은 여기서 미리 고친다. http 가 아닌 지도 링크는 보내지 않고,
 * 긴 글자는 한도에서 자른다. 서버에서 422 가 나면 그 장소는 영영 올라가지 못한다.
 */
export function placeBody(place: AppPlace): PlaceBody {
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
    status: place.status === "다녀옴" ? "visited" : place.status === "일정" ? "scheduled" : "saved",
    tags,
    mapUrl: safeUrl(place.mapUrl),
    memo: blank(place.memo, 2000),
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
    memo: place.memo ?? "",
    status: place.status === "visited" ? "다녀옴" : place.status === "scheduled" ? "일정" : "후보",
  };
}

export const placeCodec: Codec<AppPlace, PlaceBody, ServerPlace> = {
  syncable: (place) => isServerId(place.id),
  idOf: (place) => place.id,
  toBody: placeBody,
  fromServer: placeFromServer,
};

export type PlacePlan = ListPlan<PlaceBody>;

export const planPlaceSync = (
  places: readonly AppPlace[],
  confirmed: ReadonlyMap<string, Confirmed>,
  failed: ReadonlyMap<string, Failed> = new Map(),
) => planListSync(places, placeCodec, confirmed, failed);

export const mergeOnOpen = (local: readonly AppPlace[], server: readonly ServerPlace[], syncedIds: ReadonlySet<string>) =>
  mergeListOnOpen(local, server, syncedIds, placeCodec);

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
