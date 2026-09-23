/**
 * 여행 한 건이 기기에 들고 있는 것의 모양과, 그 위에서 도는 순수한 셈.
 *
 * 예전에는 이 타입들이 `WarmTripDetail.tsx` 안에 있어서 홈 화면(`WarmAppShell.tsx`)이
 * 여행 상세 화면을 가져와야 여행 한 건의 모양을 알 수 있었다. 두 화면이 서로를 아는
 * 셈이라 어느 쪽도 혼자 열어 볼 수 없었다. 모양과 셈만 여기로 내렸다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import type { TransportStop } from "./bookingSync.ts";
import type { CoverFocus } from "./coverCrop.ts";
import { weekdayOf } from "./dates.ts";
import type { PeopleNames } from "./people.ts";
import type { AppPlaceStatus } from "./placeSync.ts";
import type { PhotoLink, PhotoLinkTarget } from "./photoSync.ts";
import type { ExpenseSettings } from "./serverData.ts";
import type { Expense, Payment } from "./tripExpenses.ts";
import type { ServerTripOverview } from "./tripOverview.ts";

/** 여행 상세를 열 때 곧장 가는 자리. */
export type TripDetailDestination =
  "overview" | "schedule-add" | "places" | "preparation" | "cooking" | "expenses" | "memories";

export type ScheduleItem = {
  /** 서버와 맞출 때 쓰는 UUID. 숙소·예약·교통편에서 만들어진 줄에는 없다. */
  id?: string;
  time: string;
  date?: string;
  title: string;
  note: string;
  mapUrl: string;
  placeId?: string;
  stayId?: string;
  reservationId?: string;
  transportationId?: string;
};

export type StayInfo = {
  /** 서버와 맞출 때 쓰는 UUID. */
  id?: string;
  name: string;
  checkin: string;
  checkout: string;
  address: string;
  placeId?: string;
  showInSchedule?: boolean;
};

export type ReservationInfo = {
  id: string;
  name: string;
  date: string;
  time: string;
  people: string;
  status: "예약 확정" | "확인 필요" | "취소";
  place: string;
  showInSchedule: boolean;
  /** 예약한 곳으로 바로 가는 링크. 옛 기기 기록에는 없다. */
  bookingUrl?: string;
  /**
   * 이 예약이 붙은 장소. 장소 시트의 예약 칸에서 함께 적은 것이다.
   *
   * 없으면 장소에 붙지 않은 예약이다. 예약 시트에서만 적던 옛 기록이 그렇고,
   * 그대로 목록에 남아 눌러서 고칠 수 있어야 한다.
   */
  placeId?: string;
  /** 숙소에 붙은 예약. 앱은 만들지 않지만 서버에서 오면 그대로 들고 있는다. */
  stayId?: string;
};

export type PlaceItem = {
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

export type Transportation = {
  id: string;
  /** 이 편을 타는 사람. 이번 여행 참가자 가운데 하나다. */
  owner: string;
  direction: "가는 편" | "오는 편";
  // 「버스」는 고속·시외를 나누기 전부터 있던 값이다. 그때 적은 교통편이 남아 있어 그대로 둔다.
  method: "KTX" | "SRT" | "무궁화호" | "고속버스" | "시외버스" | "버스" | "항공" | "기타";
  date: string;
  departure: string;
  departureTime: string;
  arrival: string;
  arrivalTime: string;
  status: "예매 완료" | "예매 전";
  showInSchedule: boolean;
  /** 예매번호·좌석·정류장 안내 같은 것. 옛 기기 기록에는 없다. */
  note?: string;
  /**
   * 한 번의 이동에서 갈아타는 곳. 순서대로 담는다. 곧장 가면 비어 있다.
   * 가는 편·오는 편 둘 다 가질 수 있다. 옛 기기 기록에는 없다.
   */
  stops?: TransportStop[];
};

export type PackingItem = {
  id: string;
  name: string;
  quantity: string;
  /** 챙길 사람 이름, 또는 둘 중 하나가 아닌 `공용`·`미정`. */
  owner: string;
  tags: string[];
  /** 요리 재료에서 가져왔으면 그 재료 id. 완료 상태는 재료와 따로 간다. */
  sourceIngredientId?: string;
};

export type CookingItem = {
  id: string;
  name: string;
  quantity: string;
  group: string;
  owner: string;
};

export type Recipe = {
  id: string;
  name: string;
  note: string;
  url?: string;
  ingredients: CookingItem[];
};

export type MemoryPhoto = {
  id: string;
  color: string;
  date: string;
  caption: string;
  uri?: string;
  /** 이 사진을 붙인 장소·일정·숙소. 날짜는 연결이 아니라 위의 `date` 다. */
  links?: PhotoLink[];
  /** 올린 사람. 서버에서 받은 사진에만 있다. 비어 있으면 이 기기에서 올린 내 사진이다. */
  uploaderMembershipId?: string | null;
  /** 올린 사람의 이름. 크게 보는 화면의 `하늘이 올림` 줄에 쓴다. */
  uploaderName?: string;
  /** 원본을 받을 수 있는 기한. 지났으면 null, 서버가 말해 주지 않으면 없다(`photoSync`). */
  originalUntil?: string | null;
};

export type TravelDiary = {
  id: string;
  title: string;
  body: string;
  /** 화면에 보이는 날짜 줄. */
  date: string;
  /** 그 일기가 다루는 날(YYYY-MM-DD). 여행 중에 쓰면 오늘이고, 비어 있을 수 있다. */
  writtenOn?: string;
};

export type TripNote = { id: string; author: string; body: string };

/**
 * 기록 탭이 기기에 들고 있는 것.
 *
 * 꾸미는 중인 추억 카드(초안)는 여기 없다. 사진과 일기처럼 서버와 맞추는 것이 아니라
 * 기기에만 두는 것이라 따로 적는다(`cardDraftStorage.ts`). 완료한 카드는 사진이 되어
 * `photos` 에 들어온다.
 */
export type TripMemoryData = {
  photos: MemoryPhoto[];
  diaries: TravelDiary[];
};

export type TripPlanningData = {
  // 셋 다 없을 수 있다. 예시 여행처럼 지출만 미리 심어 둔 경우가 있어서다.
  // 상세 화면을 한 번 열고 닫으면 그때 기본값으로 채워져 저장된다.
  schedule?: ScheduleItem[];
  stay?: StayInfo;
  places?: PlaceItem[];
  reservations?: ReservationInfo[];
  /** 이전 저장 데이터에서 reservations로 옮기기 위한 호환 필드 */
  reservation?: ReservationInfo | null;
  transportations?: Transportation[];
  memories?: TripMemoryData;
  packingItems?: PackingItem[];
  packingDone?: string[];
  recipes?: Recipe[];
  cookingReadyIngredientIds?: string[];
  expenses?: Expense[];
  /** 주고받았다고 적어 둔 것. 지출과 같은 급의 기록이라 나란히 둔다. */
  payments?: Payment[];
  /**
   * 정산을 묶어서 볼지.
   *
   * 묶으면 송금 횟수는 줄지만 내가 직접 빌린 적 없는 사람에게 보내라고 할 수
   * 있다. 없으면 묶는다. 대부분은 그게 편하다.
   */
  simplifySettlement?: boolean;
  budget?: number;
  /**
   * 이번 여행에 가는 사람들. 없으면 공간 멤버 전원으로 본다.
   *
   * 한 공간에 멤버가 여럿이어도 이번 여행에는 일부만 가는 일이 흔하다.
   * 지출의 몫은 공간 멤버가 아니라 이 목록을 기준으로 나눈다.
   */
  participants?: string[];
  /**
   * 서버와 맞춘 적이 있는 장소 id. 앱을 다시 열었을 때 서버에 없는 장소가
   * "아직 못 올린 것" 인지 "다른 곳에서 지운 것" 인지 가르는 데 쓴다.
   */
  placeSyncIds?: string[];
  /** 서버와 맞춘 적이 있는 일정 줄 id. `placeSyncIds` 와 같은 쓰임이다. */
  scheduleSyncIds?: string[];
  /** 서버와 맞춘 적이 있는 숙소 id. */
  staySyncIds?: string[];
  /** 서버와 맞춘 적이 있는 교통편 id. */
  transportSyncIds?: string[];
  /** 서버와 맞춘 적이 있는 예약 id. */
  reservationSyncIds?: string[];
  /** 서버와 맞춘 적이 있는 지출 id. */
  expenseSyncIds?: string[];
  /** 서버와 맞춘 적이 있는 주고받은 기록 id. */
  paymentSyncIds?: string[];
  /** 서버와 맞춘 적이 있는 준비물 id. */
  packingSyncIds?: string[];
  /** 마지막으로 쓴 `membership id → 이름`. 멤버가 이름을 바꾸면 기록의 이름을 따라 바꾼다. */
  personNames?: PeopleNames;
  /** 서버와 맞춘 적이 있는 요리 id. 재료는 요리와 함께 오간다. */
  recipeSyncIds?: string[];
  /** 서버와 맞춘 적이 있는 메모 id. */
  memoSyncIds?: string[];
  /** 서버와 맞춘 적이 있는 일기 id. */
  diarySyncIds?: string[];
  /** 서버와 맞춘 적이 있는 사진 id. */
  photoSyncIds?: string[];
  /**
   * 통화·환율·예산·정산 묶기를 서버와 한 번이라도 맞췄는지. 맞춘 적이 없으면 기기 값을
   * 서버에 올리고, 맞춘 적이 있으면 서버 값으로 연다.
   */
  expenseSettingsSynced?: boolean;
  /** 여행에서 쓰는 통화 코드. 없으면 원이다. */
  currency?: string;
  /** 1 단위가 몇 원인지. 통화가 원이면 1 이다. */
  exchangeRate?: number;
  tripNotes?: TripNote[];
  hasKitchen?: boolean;
};

/** 목록과 홈이 들고 다니는 여행 한 건. 기록(`planning`)은 이 안에 붙는다. */
export type Trip = {
  id?: string;
  version?: number;
  name: string;
  date: string;
  note: string;
  /**
   * tripTone 팔레트의 자리. 색값이 아니라 자리를 저장한다.
   *
   * 서버에서 온 여행은 id 로 정한다(`tripColor.ts`). 그래야 기기가 달라도, 목록을
   * 다시 받아도 그 여행은 늘 같은 색이다.
   */
  tone: number;
  mark: string;
  region: string;
  start: string;
  end: string;
  planning?: TripPlanningData;
  /**
   * 서버가 센 홈 카드 숫자. 있으면 홈이 기록(`planning`) 대신 이것을 쓴다.
   * 기록은 상세를 이 기기에서 열어야 채워져서, 다른 멤버가 채운 여행이 비어 보인다.
   */
  overview?: ServerTripOverview;
  /** 서버에 저장된 통화·환율·예산·정산 묶기. 상세 화면이 기기 값과 견줘 쓴다. */
  serverExpenseSettings?: ExpenseSettings;
  /** 홈 화면의 여행 카드에 깐 사진 한 장. */
  coverPhotoId?: string;
  /** 홈 화면의 여행 카드에 통째로 깐 기념 카드. 사진 한 장과 둘 중 하나만 있다. */
  coverCardId?: string;
  /** 홈에 그릴 사진들. 카드를 깔았으면 그 카드의 사진이 고른 차례대로다. */
  coverPhotoIds?: string[];
  /** 그 카드의 틀 이름. 사진을 어떻게 놓을지 이 값으로 정한다(`homeCoverRows`). */
  coverCardStyle?: string;
  /** 대표 사진에서 홈 카드 틀에 보여 줄 부분(`coverCrop.ts`). 없으면 가운데다. */
  coverFocus?: CoverFocus;
  /** 받아 둔 바탕 사진 자리(사진 id → 자리). 못 받은 사진은 없고, 그러면 카드는 종이 그대로다. */
  coverUris?: Record<string, string>;
  /**
   * 앱이 처음부터 들고 있는 예시 여행.
   *
   * 예시 여행만 일정·장소·준비물이 채워진 채로 열린다. 사용자가 만든 여행은
   * 빈 채로 시작한다. 내가 만들지 않은 내용이 들어 있으면 그건 내 여행이 아니다.
   */
  sample?: boolean;
  /** 보관한 여행. 여행 목록의 ‘보관’에만 보인다. */
  archived?: boolean;
  /** 지운 여행이면 되돌릴 수 있는 마지막 시각. 보관 목록의 ‘지운 여행’에만 쓴다. */
  deletionScheduledAt?: string;
};

/** 여행 날짜를 못 정했을 때. 날짜 칸에서 고를 수 있는 값이다. */
export const UNDATED = "날짜 미정";

/** 제목 없이 쓴 일기의 이름. 저장하지 않고 보여줄 때만 쓴다. */
export const DIARY_UNTITLED = "이번 여행 이야기";

/**
 * 숙소를 처음 적을 때 잡아 두는 시각. 실제로 자주 쓰는 값이라 그대로 저장해도
 * 맞는 경우가 많다. 바꾸고 싶으면 체크인·체크아웃 칸에서 고친다.
 */
export const 기본_체크인_시각 = "14:00";
export const 기본_체크아웃_시각 = "11:00";

/**
 * 일정의 「종류」.
 *
 * 예전에는 첫 칸이 「장소」였는데, 장소는 종류가 아니라 대상이라 무엇을 고르는
 * 칸인지 흐렸다(트리플도 「관광·식당·카페」처럼 한 일로 적는다). 저장된 일정에는
 * 「장소」로 적혀 있어서, 읽을 때만 「방문」으로 바꿔 받는다. 이 값은 일정 줄의
 * `note` 앞칸에 들어가고 목록에는 그려지지 않는다 — 양식 안에서만 보인다.
 */
export const PLAN_TYPES = ["방문", "식사", "이동", "예약", "행사"];

/**
 * 「장소」는 예전 이름이다. 저장된 것을 읽을 때만 「방문」으로 바꾼다. 화면에 쓰는 값은
 * 늘 `PLAN_TYPES` 안의 것이어야 한다 — 「장소」를 그대로 쓰면 종류 줄에서 아무것도
 * 골라지지 않은 것처럼 보인다.
 */
export const 일정종류_읽기 = (적힌: string) => (적힌 === "장소" ? "방문" : 적힌);
export const 일정종류인가 = (적힌: string) => 적힌 === "장소" || PLAN_TYPES.includes(적힌);

/**
 * 요리 메모.
 *
 * 예전에는 비어 있으면 「메모 없음」이라는 글자를 저장했다. 그러면 고치기를 열었을 때
 * 그 글자가 입력칸에 들어앉아, 지우고 써야 했다. 저장은 빈 글자로 하고 보일 때만 채운다.
 * 예전에 저장된 「메모 없음」도 빈 것으로 읽는다.
 */
export const 요리메모_읽기 = (적힌: string) => (적힌.trim() === "메모 없음" ? "" : 적힌.trim());
export const 요리메모_보이기 = (적힌: string) => 요리메모_읽기(적힌) || "메모 없음";

/** 아무의 것도 아닌 담당. 참가자 목록 뒤에 늘 붙는다. */
export const PACKING_SHARED = "공용";
export const PACKING_UNASSIGNED = "미정";

/** 현지에서 사 온다는 표시. 사람이 아니라서 참가자 목록 밖에 둔다. */
export const COOKING_BUY = "구매";
export const COOKING_UNASSIGNED = "미정";

/**
 * 옛 저장 데이터의 담당을 이름으로 옮긴다.
 *
 * 예전에는 사람이 둘로 박혀 있어서 담당이 `나`·`동행`·`함께` 였다. 여행마다
 * 가는 사람이 다르니 이제는 이름을 그대로 담는다. 자리로 적힌 옛 값은 참가자
 * 목록의 첫째와 둘째로 본다.
 */
export const normalizePackingOwner = (owner: string, participants: string[]) => {
  if (owner === "나") return participants[0] ?? PACKING_UNASSIGNED;
  if (owner === "동행") return participants[1] ?? PACKING_UNASSIGNED;
  if (owner === "함께") return PACKING_SHARED;
  return owner;
};

/** 담당으로 고를 수 있는 것들. 참가자 전원 뒤에 공용과 미정을 둔다. */
export const packingOwnerOptions = (participants: string[]) => [
  ...participants,
  PACKING_SHARED,
  PACKING_UNASSIGNED,
];

/** 준비물에 붙은 이름표. 옛 기록은 `source`·`timing` 두 칸으로 적혀 있다. */
export const packingTags = (item: PackingItem) => {
  const legacy = item as PackingItem & {
    source?: string;
    timing?: string;
    tags?: string[];
  };
  return (
    legacy.tags ?? ([legacy.source, legacy.timing].filter(Boolean) as string[])
  );
};

/** 재료를 누가 챙기는지 고를 수 있는 것들. */
export const cookingOwnerOptions = (participants: string[]) => [
  COOKING_UNASSIGNED,
  ...participants,
  COOKING_BUY,
];

/**
 * 요리를 골랐을 때 접어 둘 재료 묶음.
 *
 * 예전에는 늘 전부 접어서, 메뉴 카드를 누른 직후 화면에 재료가 하나도 없었다.
 * 뭘 눌렀는지 알 수 없고 묶음이 셋이면 매번 세 번을 더 눌러야 한다.
 * 한 화면에 들어갈 만큼 짧으면 펴 두고, 길 때만 접는다.
 */
export const collapsedGroupsFor = (recipe?: Recipe) => {
  const items = recipe?.ingredients ?? [];
  const groups = Array.from(new Set(items.map((item) => item.group)));
  return groups.length > 2 && items.length > 9 ? groups : [];
};

/**
 * GPT 가 돌려준 줄을 요리와 재료로 읽는다.
 *
 * "요리 | 이름 | 메모 | 링크" 와 "재료 | 이름 | 양 | 묶음 | 담당" 두 가지만 읽고
 * 나머지 줄은 버린다. 넣기 전에 몇 개가 읽혔는지 미리 세어 보여주려고 컴포넌트
 * 밖으로 꺼냈다. 같은 함수가 미리 읽기와 실제 추가에 함께 쓰인다.
 */
export function parseAiRecipes(text: string, newId: () => string): Recipe[] {
  const parsed: Recipe[] = [];
  let currentRecipe: Recipe | null = null;
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [type, ...values] = line.split("|").map((value) => value.trim());
      if (type === "요리" && values[0]) {
        currentRecipe = {
          id: newId(),
          name: values[0],
          note: values[1]?.trim() ?? "",
          url: values[2] || "",
          ingredients: [],
        };
        parsed.push(currentRecipe);
        return;
      }
      if (type === "재료" && values[0] && currentRecipe) {
        currentRecipe.ingredients.push({
          id: newId(),
          name: values[0],
          quantity: values[1] || "미정",
          group: values[2] || "기본",
          // 담당은 참가자 이름이거나 구매다. 모르는 값이면 미정으로 둔다.
          owner: values[3] || COOKING_UNASSIGNED,
        });
      }
    });
  return parsed;
}

/** 주소 앞 두 마디를 지역 이름으로 쓴다. 주소가 없으면 자리만 지킨다. */
export const placeAreaFromAddress = (address: string, fallback = "위치 미정") =>
  address.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ") || fallback;

/** 일정 줄을 날짜 차례로, 같은 날은 시각 차례로 세운다. 날짜가 없는 줄은 맨 뒤다. */
export const orderedScheduleItems = (items: ScheduleItem[], dayOptions: string[]) =>
  [...items].sort((left, right) => {
    const leftDay = left.date ? dayOptions.indexOf(left.date) : -1;
    const rightDay = right.date ? dayOptions.indexOf(right.date) : -1;
    const normalizedLeftDay = leftDay < 0 ? dayOptions.length : leftDay;
    const normalizedRightDay = rightDay < 0 ? dayOptions.length : rightDay;
    if (normalizedLeftDay !== normalizedRightDay) return normalizedLeftDay - normalizedRightDay;
    const clockMinutes = (value: string) => {
      const match = value.match(/(\d{1,2}):(\d{2})/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : 24 * 60;
    };
    return clockMinutes(left.time) - clockMinutes(right.time);
  });

/** 교통편에서 만들어지는 일정 줄. 저장할 때와 목록을 다시 맞출 때 같은 모양이어야 한다. */
export const transportScheduleRow = (transportation: Transportation): ScheduleItem => ({
  time: `${weekdayOf(transportation.date)} · ${transportation.departureTime}`,
  date: transportation.date,
  title: `${transportation.method} ${transportation.departure} 출발`,
  note: `${transportation.arrival} ${transportation.arrivalTime} 도착 · ${transportation.owner} · ${transportation.direction}`,
  mapUrl: "",
  transportationId: transportation.id,
});

/** 예약에서 만들어지는 일정 줄. */
export const reservationScheduleRow = (reservation: ReservationInfo): ScheduleItem => ({
  time: `${weekdayOf(reservation.date)} · ${reservation.time || "시간 미정"}`,
  date: reservation.date,
  title: reservation.name,
  note: ["예약", reservation.status].filter(Boolean).join(" · "),
  mapUrl: "",
  reservationId: reservation.id,
});

/**
 * 숙소 칸의 `날짜 시각` 가운데 한쪽만 바꾼다.
 *
 * 적혀 있던 값에서 날짜와 시각을 갈라, 바꾸지 않는 쪽은 그대로 두고 비어 있으면
 * 기본값으로 채운다.
 */
export function mergeStayDateTime(
  saved: string,
  part: "date" | "time",
  value: string,
  fallbackDate: string,
  fallbackTime: string,
): string {
  const savedTime = saved.match(/\d{1,2}:\d{2}$/)?.[0];
  const savedDate = saved.replace(/\s*\d{1,2}:\d{2}$/, "").trim();
  const nextDate = part === "date" ? value : savedDate || fallbackDate;
  const nextTime = part === "time" ? value : savedTime || fallbackTime;
  return `${nextDate} ${nextTime}`;
}

/** 체크인·체크아웃 문자열을 여행 첫날 0시부터의 분으로 바꾼다. 못 읽으면 -1 이다. */
export function stayMomentOf(value: string, dates: string[]): number {
  const dateIndex = dates.findIndex((date) => value.startsWith(date));
  const time = value.match(/(\d{1,2}):(\d{2})$/);
  return dateIndex < 0 || !time ? -1 : dateIndex * 1440 + Number(time[1]) * 60 + Number(time[2]);
}

/**
 * 지운 줄을 있던 자리에 도로 끼운다. 삭제 되돌리기가 쓴다.
 *
 * 맨 뒤에 붙이면 되돌린 줄이 목록 끝으로 가서, 되돌린 것이 맞는지 눈으로 못 찾는다.
 * 사진은 id 로 겹침을 거르는 `gallerySelection.reinsertAt` 을 쓰고, 여기는 id 가 없는
 * 줄(숙소·예약에서 만들어진 일정)도 있어 자리만 본다.
 */
export function 자리에_넣기<T>(list: readonly T[], item: T, index: number): T[] {
  const 결과 = [...list];
  결과.splice(Math.min(Math.max(0, index), 결과.length), 0, item);
  return 결과;
}

/**
 * 사진을 붙인 곳별로 한 번에 묶는다(2026-09-23 검토 #13).
 *
 * 예전에는 목록을 그릴 때마다 장소·일정마다 `photosLinkedTo` 로 사진 전체를 훑었다.
 * 장소 30개 × 사진 500장이면 한 번 그릴 때 15,000번이다. 같은 파일의 `reservationByPlace`
 * 처럼 표를 한 번 만들어 쓴다.
 */
export function photosByTarget(
  photos: readonly MemoryPhoto[],
  targetType: PhotoLinkTarget,
): Map<string, MemoryPhoto[]> {
  const 표 = new Map<string, MemoryPhoto[]>();
  for (const photo of photos) {
    for (const link of photo.links ?? []) {
      if (link.targetType !== targetType) continue;
      const 줄 = 표.get(link.targetId);
      if (줄) 줄.push(photo);
      else 표.set(link.targetId, [photo]);
    }
  }
  return 표;
}

/**
 * 기록 탭의 처음 모습.
 *
 * `withSamples` 는 예시 여행에만 준다. 내가 만든 여행이 남의 사진과 일기로
 * 차 있으면 내 기록이 아니게 된다.
 */
export const initialMemoryData = (tripDate = "여행 기간", withSamples = false): TripMemoryData => ({
  photos: withSamples ? [
    { id: "photo-1", color: "#E7B4A6", date: "1일차", caption: "도착한 날" },
    { id: "photo-2", color: "#DFC98A", date: "1일차", caption: "느린 점심" },
    { id: "photo-3", color: "#AFC9C3", date: "2일차", caption: "함께 걷기" },
    { id: "photo-4", color: "#D4BDD4", date: "2일차", caption: "저녁 준비" },
    { id: "photo-5", color: "#C7D493", date: "3일차", caption: "마지막 아침" },
    { id: "photo-6", color: "#9CBBC6", date: "3일차", caption: "돌아오는 길" },
  ] : [],
  diaries: withSamples ? [{
    id: "diary-1",
    title: "느리게 걸어서 더 좋았던 날",
    body: "계획대로 되지 않은 순간도 있었지만, 그래서 더 오래 기억할 여행이 된 것 같다.",
    date: tripDate,
  }] : [],
});
