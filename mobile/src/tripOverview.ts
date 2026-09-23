/**
 * 홈의 여행 카드와 "출발 전 확인할 것" 이 보여 줄 숫자.
 *
 * 숫자는 두 곳에서 온다. 서버 여행이면 여행 목록에 붙어 오는 요약(`overview`)을 쓴다.
 * 기기의 기록(`planning`)은 여행 상세를 이 기기에서 열어야 채워져서, 새로 로그인했거나
 * 다른 멤버가 채운 여행은 기록만 보면 전부 비어 보인다.
 *
 * 요약이 없으면(예시 여행, 서버에 없는 여행, 요약을 받기 전에 저장된 여행) 기록으로 센다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { dateLabelOf } from "./dates.ts";

/** 서버 여행 응답의 `overview`. */
export type ServerTripOverview = {
  /** 대표 숙소. 없으면 비어 있다. 이름은 연결한 장소가 없으면 비어 있다. */
  stay: { name: string | null; checkInAt: string | null } | null;
  scheduleCount: number;
  placeCount: number;
  restaurantCount: number;
  cafeCount: number;
  packingTotal: number;
  packingDone: number;
  /** 여행 통화 기준 지출 합. */
  spentTotal: number;
};

/** 홈이 읽는 기록의 칸. 화면의 `TripPlanningData` 중 쓰는 것만. */
type PlanningForHome = {
  stay?: { name: string; checkin: string };
  schedule?: readonly unknown[];
  places?: readonly { category: string }[];
  packingItems?: readonly { id: string }[];
  packingDone?: readonly string[];
  expenses?: readonly { amount: number; excluded?: boolean }[];
  currency?: string;
};

type HomeTripSummary = {
  /** 비어 있으면 숙소가 없다. */
  stayName: string;
  /** `10월 1일 15:00`. 비어 있으면 미정이다. */
  checkin: string;
  scheduleCount: number;
  placeCount: number;
  restaurantCount: number;
  cafeCount: number;
  packingTotal: number;
  packingDone: number;
  spent: number;
  currency?: string;
};

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);
const text = (value: unknown) => (typeof value === "string" ? value : null);

/** 모양이 틀리면 없는 것으로 본다. 기기에 저장된 옛 값도 이 길로 읽는다. */
export function parseTripOverview(value: unknown): ServerTripOverview | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const numbers = {
    scheduleCount: count(raw.scheduleCount),
    placeCount: count(raw.placeCount),
    restaurantCount: count(raw.restaurantCount),
    cafeCount: count(raw.cafeCount),
    packingTotal: count(raw.packingTotal),
    packingDone: count(raw.packingDone),
    // 서버는 소수를 문자열로 줄 수도 있다.
    spentTotal: count(typeof raw.spentTotal === "string" ? Number(raw.spentTotal) : raw.spentTotal),
  };
  if (Object.values(numbers).some((item) => item === null)) return undefined;
  let stay: ServerTripOverview["stay"] = null;
  if (raw.stay && typeof raw.stay === "object") {
    const rawStay = raw.stay as Record<string, unknown>;
    stay = { name: text(rawStay.name), checkInAt: text(rawStay.checkInAt) };
  }
  return { stay, ...(numbers as Omit<ServerTripOverview, "stay">) };
}

/** `2026-10-01T15:00` 을 숙소 화면과 같은 `10월 1일 15:00` 으로. */
export function checkinLabelOf(value: string | null): string {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${dateLabelOf(match[1])} ${match[2]}` : "";
}

export function homeSummaryOf(trip: {
  overview?: unknown;
  planning?: PlanningForHome;
  /** 서버에 저장된 여행 통화. 요약의 지출 합이 이 통화다. */
  serverCurrency?: string;
}): HomeTripSummary {
  const overview = parseTripOverview(trip.overview);
  if (overview) {
    return {
      // 상세 화면도 이름 없는 서버 숙소를 "숙소" 로 보여 준다.
      stayName: overview.stay ? overview.stay.name || "숙소" : "",
      checkin: overview.stay ? checkinLabelOf(overview.stay.checkInAt) : "",
      scheduleCount: overview.scheduleCount,
      placeCount: overview.placeCount,
      restaurantCount: overview.restaurantCount,
      cafeCount: overview.cafeCount,
      packingTotal: overview.packingTotal,
      packingDone: Math.min(overview.packingDone, overview.packingTotal),
      spent: overview.spentTotal,
      currency: trip.serverCurrency,
    };
  }
  const plan = trip.planning;
  const places = plan?.places ?? [];
  const packing = plan?.packingItems ?? [];
  const packingIds = new Set(packing.map((item) => item.id));
  return {
    stayName: plan?.stay?.name ?? "",
    checkin: plan?.stay?.name ? plan.stay.checkin : "",
    scheduleCount: plan?.schedule?.length ?? 0,
    placeCount: places.length,
    restaurantCount: places.filter((place) => place.category === "식당").length,
    cafeCount: places.filter((place) => place.category === "카페").length,
    packingTotal: packing.length,
    // 지운 준비물의 체크가 남아 있을 수 있다. 목록에 있는 것만 센다.
    packingDone: (plan?.packingDone ?? []).filter((id) => packingIds.has(id)).length,
    // 정산에서 뺀 지출은 비용 탭의 총 지출과 같은 규칙으로 세지 않는다.
    spent: (plan?.expenses ?? []).filter((item) => !item.excluded).reduce((sum, item) => sum + item.amount, 0),
    currency: plan?.currency,
  };
}
