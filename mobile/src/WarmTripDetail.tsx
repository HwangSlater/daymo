import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSheetDrag } from "./sheetDrag";
import { keepTripPhoto } from "./tripPhotos";
import { TripDateRangePicker } from "./TripDateRangePicker";
import { TripRegionPicker } from "./TripRegionPicker";
import { ParticipantPicker } from "./ParticipantPicker";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type Participant,
  expensesToCsv,
  josa,
  parseAmount,
  settle,
  amountText,
  currencyOf,
  money,
  normalizeExpense,
  shareLabel,
  splitAmounts,
  toWon,
  totalsByCategory,
  totalsByDay,
  won,
} from "./tripExpenses";
import { shareExpenseCsv } from "./tripExpenseExport";
import {
  Alert,
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Keyboard,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { AppTheme } from "./theme";
import { Text, TextInput } from "./AppText";
import { Glyph } from "./Glyph";
import { typo } from "./theme/typography";
import { memoPaper, onAccent, status as statusColor } from "./theme/colors";
import { parseNaverPlaceShare, resolveNaverPlaceShare } from "./naverPlaceResolver";

const DetailThemeContext = createContext<AppTheme | undefined>(undefined);
const DetailFeedbackContext = createContext<(message: string) => void>(() => undefined);

type ViewMode = "여행" | "장소" | "준비" | "요리" | "비용" | "기록";
export type TripDetailDestination =
  "overview" | "schedule-add" | "places" | "preparation" | "cooking" | "expenses" | "memories";
const destinationMode = (destination: TripDetailDestination): ViewMode =>
  destination === "places"
    ? "장소"
    : destination === "preparation"
      ? "준비"
      : destination === "cooking"
        ? "요리"
        : destination === "expenses"
          ? "비용"
        : destination === "memories"
          ? "기록"
      : "여행";
export type ScheduleItem = {
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
};
export type PlaceItem = {
  id: string;
  name: string;
  area: string;
  address?: string;
  category: string;
  mapUrl: string;
  tags: string[];
  status: "후보" | "일정";
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
  budget?: number;
  /**
   * 이번 여행에 가는 사람들. 없으면 공간 멤버 전원으로 본다.
   *
   * 한 공간에 멤버가 여럿이어도 이번 여행에는 일부만 가는 일이 흔하다.
   * 지출의 몫은 공간 멤버가 아니라 이 목록을 기준으로 나눈다.
   */
  participants?: string[];
  /** 여행에서 쓰는 통화 코드. 없으면 원이다. */
  currency?: string;
  /** 1 단위가 몇 원인지. 통화가 원이면 1 이다. */
  exchangeRate?: number;
  tripNotes?: TripNote[];
  hasKitchen?: boolean;
};

export type MemoryPhoto = { id: string; color: string; date: string; caption: string; uri?: string };
export type TravelDiary = { id: string; title: string; body: string; date: string };
export type TripNote = { id: string; author: string; body: string };
export type TripMemoryData = {
  photos: MemoryPhoto[];
  diaries: TravelDiary[];
  cardStyle: string;
  cardTitle: string;
  cardCaption: string;
};

/**
 * 기록 탭의 처음 모습.
 *
 * `withSamples` 는 예시 여행에만 준다. 내가 만든 여행이 남의 사진과 일기로
 * 차 있으면 내 기록이 아니게 된다. 카드 제목과 말투는 빈 여행에도 쓸모가
 * 있어서 사진과 일기만 갈라 낸다.
 */
const initialMemoryData = (tripName: string, tripDate = "여행 기간", withSamples = false): TripMemoryData => ({
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
  cardStyle: "필름",
  cardTitle: `우리의 ${tripName} 여행`,
  cardCaption: "함께 남긴 여행의 순간",
});

const placeAreaFromAddress = (address: string, fallback = "위치 미정") =>
  address.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ") || fallback;

const orderedScheduleItems = (items: ScheduleItem[], dayOptions: string[]) =>
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

const initialPlaces: PlaceItem[] = [
  {
    id: "place-js-hotel",
    name: "달빛한옥",
    area: "전주 한옥마을",
    address: "전주 완산구 은행로 12 달빛한옥",
    category: "숙소",
    mapUrl: "https://map.naver.com/p/search/달빛한옥",
    tags: ["숙소", "예약"],
    status: "후보",
  },
  {
    id: "place-eunhaengol",
    name: "소나기식당",
    area: "완산",
    category: "식당",
    mapUrl: "https://map.naver.com/p/search/소나기식당",
    tags: ["초밥", "디너", "예약"],
    status: "일정",
  },
  {
    id: "place-usagi",
    name: "구름국수",
    area: "덕진",
    category: "식당",
    mapUrl: "https://map.naver.com/p/search/구름국수",
    tags: ["늦은 점심", "웨이팅"],
    status: "후보",
  },
  {
    id: "place-gocheok",
    name: "노을전망대",
    area: "완산",
    category: "구경",
    mapUrl: "https://map.naver.com/p/search/노을전망대",
    tags: ["숙소 근처", "비 오는 날"],
    status: "후보",
  },
];

export type Transportation = {
  id: string;
  /** 이 편을 타는 사람. 이번 여행 참가자 가운데 하나다. */
  owner: string;
  direction: "가는 편" | "오는 편";
  method: "KTX" | "SRT" | "버스" | "항공" | "기타";
  date: string;
  departure: string;
  departureTime: string;
  arrival: string;
  arrivalTime: string;
  status: "예매 완료" | "예매 전";
  showInSchedule: boolean;
};

type Props = {
  done: string[];
  onClose: () => void;
  initialDestination?: TripDetailDestination;
  appTheme?: AppTheme;
  tripName?: string;
  tripDate?: string;
  tripStart?: string;
  tripEnd?: string;
  tripRegion?: string;
  tripNote?: string;
  onUpdateTrip?: (trip: {
    name: string;
    date: string;
    start: string;
    end: string;
    region: string;
    note: string;
  }) => void;
  initialPlanning?: TripPlanningData;
  onSavePlanning?: (planning: TripPlanningData) => void;
  /** 이 여행이 속한 공간의 멤버 전원. 참가자를 고를 때의 후보다. */
  spaceMembers?: string[];
};

const parseTripDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildTripDates = (start?: string, end?: string) => {
  const first = parseTripDate(start);
  const last = parseTripDate(end);
  if (!first || !last || first > last) return [];
  const result: Date[] = [];
  const cursor = new Date(first);
  while (cursor <= last && result.length < 366) {
    result.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
};

const dayLabel = (date: Date) =>
  `${date.getDate()}일(${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]})`;

/**
 * 여행 날짜 가운데 오늘이 있으면 그 날을 준다. 없으면 빈 문자열이다.
 *
 * 여행 중에 적는 지출은 거의 오늘 것이다. 늘 첫날로 시작하면 둘째 날부터는
 * 매번 날짜를 고쳐야 한다.
 */
const todayAmong = (dates: Date[]): string => {
  const now = new Date();
  const match = dates.find(
    (date) =>
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate(),
  );
  return match ? dayLabel(match) : "";
};
/** "24일(목)" 형태의 날짜 옵션에서 요일만 꺼낸다. */
const weekdayOf = (dayOption: string) => dayOption.match(/\(([^)]+)\)/)?.[1] ?? dayOption.slice(0, 1);
// 날짜 선택지는 "9월 24일 (목)" 꼴이다. 미리보기 칸에는 일 숫자만 크게 쓴다.
const dayNumberOf = (dayOption: string) => dayOption.match(/(\d+)일/)?.[1] ?? dayOption;

/** 여행 날짜를 못 정했을 때. 날짜 칸에서 고를 수 있는 값이다. */
const UNDATED = "날짜 미정";

/**
 * 예전에 자유롭게 적어 둔 날짜를 이번 여행의 날짜 칸에 맞춘다.
 *
 * 기록 탭의 사진 날짜만 아무 글자나 받고 있었다. "1일차" 와 "8월 22일" 이
 * 섞이면 같은 날인데 다른 날로 세어 "N일의 기록" 이 엉뚱해진다.
 * 몇째 날로 적었으면 순서로, 날짜로 적었으면 일 숫자로 찾는다. 어느 쪽도
 * 아니면 적힌 그대로 둔다. 내가 적은 말을 앱이 말없이 버리면 안 된다.
 */
const matchTripDay = (value: string, dayOptions: string[]) => {
  const text = value.trim();
  if (!text || dayOptions.includes(text)) return text;
  const nth = text.match(/^(\d+)\s*일차$/);
  if (nth) return dayOptions[Number(nth[1]) - 1] ?? text;
  const day = text.match(/(\d+)\s*일/);
  const found = day && dayOptions.find((option) => dayNumberOf(option) === day[1]);
  return found || text;
};
const dateLabel = (date: Date) => `${date.getMonth() + 1}월 ${date.getDate()}일`;

const validDateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseTripDate(value);
  return Boolean(date && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` === value);
};

const formatTripPeriod = (start: string, end: string) => {
  const first = parseTripDate(start);
  const last = parseTripDate(end);
  if (!first || !last) return "기간을 확인해 주세요";
  return `${dateLabel(first)} — ${dateLabel(last)}`;
};

type PackingItem = {
  id: string;
  name: string;
  quantity: string;
  /** 챙길 사람 이름, 또는 둘 중 하나가 아닌 `공용`·`미정`. */
  owner: string;
  tags: string[];
};

/** 아무의 것도 아닌 담당. 참가자 목록 뒤에 늘 붙는다. */
const PACKING_SHARED = "공용";
const PACKING_UNASSIGNED = "미정";

/**
 * 옛 저장 데이터의 담당을 이름으로 옮긴다.
 *
 * 예전에는 사람이 둘로 박혀 있어서 담당이 `나`·`동행`·`함께` 였다. 여행마다
 * 가는 사람이 다르니 이제는 이름을 그대로 담는다. 자리로 적힌 옛 값은 참가자
 * 목록의 첫째와 둘째로 본다.
 */
const normalizePackingOwner = (owner: string, participants: string[]) => {
  if (owner === "나") return participants[0] ?? PACKING_UNASSIGNED;
  if (owner === "동행") return participants[1] ?? PACKING_UNASSIGNED;
  if (owner === "함께") return PACKING_SHARED;
  return owner;
};

/** 담당으로 고를 수 있는 것들. 참가자 전원 뒤에 공용과 미정을 둔다. */
const packingOwnerOptions = (participants: string[]) => [
  ...participants,
  PACKING_SHARED,
  PACKING_UNASSIGNED,
];

const packingTags = (item: PackingItem) => {
  const legacy = item as PackingItem & {
    source?: string;
    timing?: string;
    tags?: string[];
  };
  return (
    legacy.tags ?? ([legacy.source, legacy.timing].filter(Boolean) as string[])
  );
};

const packing: PackingItem[] = [
  {
    id: "charger",
    name: "충전기",
    quantity: "1개",
    owner: "나",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "power-bank",
    name: "보조배터리",
    quantity: "1개",
    owner: "나",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "wallet",
    name: "지갑과 신분증",
    quantity: "",
    owner: "나",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "camera",
    name: "카메라",
    quantity: "1대",
    owner: "나",
    tags: ["집에서", "미리"],
  },
  {
    id: "camera-battery",
    name: "카메라 여분 배터리",
    quantity: "2개",
    owner: "나",
    tags: ["집에서", "미리"],
  },
  {
    id: "personal-clothes",
    name: "갈아입을 옷",
    quantity: "2벌",
    owner: "나",
    tags: ["집에서", "미리"],
  },
  {
    id: "personal-socks",
    name: "양말과 속옷",
    quantity: "3세트",
    owner: "나",
    tags: ["집에서", "미리"],
  },
  {
    id: "earphones",
    name: "이어폰",
    quantity: "1개",
    owner: "나",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "glasses",
    name: "안경",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "companion-charger",
    name: "휴대폰 충전기",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "companion-clothes",
    name: "갈아입을 옷",
    quantity: "2벌",
    owner: "동행",
    tags: ["집에서", "미리"],
  },
  {
    id: "companion-cosmetics",
    name: "화장품 파우치",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "미리"],
  },
  {
    id: "companion-lens",
    name: "렌즈와 렌즈액",
    quantity: "",
    owner: "동행",
    tags: ["집에서", "미리"],
  },
  {
    id: "companion-hair",
    name: "고데기",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "companion-card",
    name: "예약 카드",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "toiletries",
    name: "세면도구",
    quantity: "1세트",
    owner: "함께",
    tags: ["집에서", "미리"],
  },
  {
    id: "umbrella",
    name: "우산",
    quantity: "2개",
    owner: "함께",
    tags: ["집에서", "미리"],
  },
  {
    id: "medicine",
    name: "상비약",
    quantity: "1봉",
    owner: "함께",
    tags: ["집에서", "미리"],
  },
  {
    id: "sunscreen",
    name: "선크림",
    quantity: "1개",
    owner: "함께",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "tissues",
    name: "물티슈와 휴지",
    quantity: "각 1개",
    owner: "함께",
    tags: ["미리 구매", "미리"],
  },
  {
    id: "water",
    name: "생수",
    quantity: "4병",
    owner: "함께",
    tags: ["미리 구매", "출발 아침"],
  },
  {
    id: "snacks",
    name: "차에서 먹을 간식",
    quantity: "",
    owner: "함께",
    tags: ["미리 구매", "출발 아침"],
  },
  {
    id: "plastic-bags",
    name: "비닐봉투",
    quantity: "3장",
    owner: "함께",
    tags: ["집에서", "미리"],
  },
  {
    id: "booking-check",
    name: "숙소 예약 내역 확인",
    quantity: "",
    owner: "미정",
    tags: ["집에서", "미리"],
  },
  {
    id: "train-tickets",
    name: "기차표 예매",
    quantity: "2매",
    owner: "미정",
    tags: ["미리 구매", "미리"],
  },
  {
    id: "breakfast",
    name: "숙소 아침거리",
    quantity: "2인분",
    owner: "미정",
    tags: ["현지 구매", "숙소에서"],
  },
  {
    id: "cooking-ingredients",
    name: "저녁 요리 재료",
    quantity: "2인분",
    owner: "미정",
    tags: ["현지 구매", "숙소에서"],
  },
  {
    id: "ice",
    name: "얼음과 음료",
    quantity: "",
    owner: "미정",
    tags: ["현지 구매", "숙소에서"],
  },
  {
    id: "beach-mat",
    name: "돗자리",
    quantity: "1개",
    owner: "미정",
    tags: ["집에서", "미리"],
  },
  {
    id: "slippers",
    name: "숙소용 슬리퍼",
    quantity: "2켤레",
    owner: "미정",
    tags: ["미리 구매", "미리"],
  },
];

/**
 * 예시 여행이 처음 들고 있는 예약과 일정.
 *
 * 상세 화면 안에서만 만들면 홈 카드가 개수를 미리 알 수 없어서, 여행을 열기
 * 전과 연 뒤의 숫자가 어긋난다. 밖에 두면 카드도 같은 것을 셀 수 있다.
 */
const sampleReservation = (dayOptions: string[]): ReservationInfo => ({
  id: "reservation-primary",
  name: "소나기식당",
  date: dayOptions[Math.min(1, dayOptions.length - 1)],
  time: "19:00",
  people: "2명",
  status: "예약 확정",
  place: "전주 한옥마을",
  showInSchedule: true,
});

const sampleSchedule = (dayOptions: string[], lastDate: string): ScheduleItem[] => {
  const reservation = sampleReservation(dayOptions);
  return [
    {
      time: `${weekdayOf(dayOptions[0])} · 12:30`,
      date: dayOptions[0],
      title: "소나기식당에서 점심",
      note: "식사 · 완산",
      mapUrl: "https://map.naver.com/p/search/소나기식당",
      placeId: "place-eunhaengol",
    },
    {
      time: `${weekdayOf(dayOptions[0])} · 15:00`,
      date: dayOptions[0],
      title: "달빛한옥 체크인",
      note: `${lastDate} 11:00 체크아웃`,
      mapUrl: "https://map.naver.com/p/search/달빛한옥",
      placeId: "place-js-hotel",
      stayId: "primary-stay",
    },
    {
      time: `${weekdayOf(dayOptions[0])} · 19:30`,
      date: dayOptions[0],
      title: "함께 저녁 만들기",
      note: "버섯전골과 김밥",
      mapUrl: "",
    },
    {
      time: `${weekdayOf(reservation.date)} · ${reservation.time}`,
      date: reservation.date,
      title: reservation.name,
      note: `예약 · ${reservation.status}`,
      mapUrl: "",
      reservationId: reservation.id,
    },
  ];
};

/**
 * 앱이 처음부터 들고 있는 예시 여행의 내용.
 *
 * 예전에는 상세 화면이 열릴 때 이 값들을 채웠다. 그러면 화면 밖에서는 이 여행에
 * 무엇이 들어 있는지 알 수 없어서, 홈 카드는 개수를 못 세고 찾기는 아무것도
 * 못 찾았다. 여행에 미리 붙여 두면 모든 화면이 같은 것을 본다.
 *
 * 사용자가 만든 여행은 이걸 받지 않는다. 내가 적지 않은 일정과 준비물이 들어
 * 있으면 그건 내 여행이 아니다.
 */
export function sampleTripPlanning(
  tripName: string,
  start: string,
  end: string,
  people: string[],
): TripPlanningData {
  const dates = buildTripDates(start, end);
  const dayOptions = dates.length ? dates.map(dayLabel) : ["21일(금)", "22일(토)", "23일(일)"];
  const dateOptions = dates.length ? dates.map(dateLabel) : ["8월 21일", "8월 22일", "8월 23일"];
  const first = dateOptions[0];
  const last = dateOptions[dateOptions.length - 1];
  const lastDay = dayOptions[dayOptions.length - 1];
  const [one = "하늘", two = one] = people;
  return {
    schedule: sampleSchedule(dayOptions, last),
    stay: {
      name: "달빛한옥",
      checkin: `${first} 15:00`,
      checkout: `${last} 11:00`,
      address: "전주 완산구 은행로 12 달빛한옥",
      placeId: "place-js-hotel",
      showInSchedule: true,
    },
    places: initialPlaces,
    reservations: [sampleReservation(dayOptions)],
    transportations: [
      { id: "sky-out", owner: one, direction: "가는 편", method: "KTX", date: dayOptions[0], departure: "대전", departureTime: "08:10", arrival: "전주", arrivalTime: "09:36", status: "예매 완료", showInSchedule: false },
      { id: "sky-back", owner: one, direction: "오는 편", method: "KTX", date: lastDay, departure: "전주", departureTime: "20:15", arrival: "대전", arrivalTime: "21:41", status: "예매 완료", showInSchedule: false },
      { id: "yeoul-out", owner: two, direction: "가는 편", method: "버스", date: dayOptions[0], departure: "청주", departureTime: "07:50", arrival: "전주", arrivalTime: "10:05", status: "예매 완료", showInSchedule: false },
      { id: "yeoul-back", owner: two, direction: "오는 편", method: "버스", date: lastDay, departure: "전주", departureTime: "21:30", arrival: "청주", arrivalTime: "23:45", status: "예매 완료", showInSchedule: false },
    ],
    packingItems: packing.map((item) => ({ ...item, owner: normalizePackingOwner(item.owner, people) })),
    packingDone: ["charger", "toiletries"],
    recipes: initialRecipes.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((item) => ({
        ...item,
        owner: item.owner === "하늘" ? one : item.owner === "여울" ? two : item.owner,
      })),
    })),
    memories: (() => {
      const seed = initialMemoryData(tripName, `${first} — ${last}`, true);
      // 예시 사진도 여행의 실제 날짜 칸을 쓴다. "1일차" 로 두면 날짜를 고르는
      // 자리에 없는 값이라 처음부터 목록 밖에 붙는다.
      return { ...seed, photos: seed.photos.map((photo) => ({ ...photo, date: matchTripDay(photo.date, dayOptions) })) };
    })(),
    tripNotes: [
      { id: "memo-meal", author: `${two} · 오늘 10:42`, body: "육수 재료는 미리 1.5배로 준비하기" },
      { id: "memo-booking", author: `${one} · 어제 22:15`, body: "소나기식당 수요일 19:00 예약 확인" },
    ],
    hasKitchen: true,
  };
}

export function WarmTripDetail({
  done,
  onClose,
  initialDestination = "overview",
  appTheme,
  tripName = "전주 한옥마을",
  tripDate = "8월 21일 — 23일",
  tripStart,
  tripEnd,
  tripRegion = "전북",
  tripNote = "함께 천천히 걷는 여행",
  onUpdateTrip,
  initialPlanning,
  onSavePlanning,
  spaceMembers = ["하늘", "여울"],
}: Props) {
  const memo = memoPaper(Boolean(appTheme?.dark));
  const [currentStart, setCurrentStart] = useState(tripStart ?? "");
  const [currentEnd, setCurrentEnd] = useState(tripEnd ?? "");
  const [region, setRegion] = useState(tripRegion);
  const [note, setNote] = useState(tripNote);
  const tripDates = buildTripDates(currentStart, currentEnd);
  const tripDayOptions = tripDates.length ? tripDates.map(dayLabel) : ["21일(금)", "22일(토)", "23일(일)"];
  const tripDateOptions = tripDates.length ? tripDates.map(dateLabel) : ["8월 21일", "8월 22일", "8월 23일"];
  const todayTripDay = todayAmong(tripDates);
  const firstTripDate = tripDateOptions[0];
  const lastTripDate = tripDateOptions[tripDateOptions.length - 1];
  const currentTripDate = tripDates.length ? formatTripPeriod(currentStart, currentEnd) : tripDate;
  const tripNights = Math.max(0, tripDates.length - 1);
  const tripDuration = tripDates.length
    ? tripNights
      ? `${tripNights}박 ${tripDates.length}일`
      : "당일 여행"
    : "여행 기간";
  const [mode, setMode] = useState<ViewMode>(() =>
    destinationMode(initialDestination),
  );
  const detailScrollRef = useRef<ScrollView>(null);
  const showMode = (nextMode: ViewMode) => {
    setMode(nextMode);
    detailScrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const [title, setTitle] = useState(tripName);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftStart, setDraftStart] = useState(currentStart);
  const [draftEnd, setDraftEnd] = useState(currentEnd);
  const [draftRegion, setDraftRegion] = useState(region);
  const [draftNote, setDraftNote] = useState(note);
  const [showAllEditRegions, setShowAllEditRegions] = useState(false);
  const [editingTrip, setEditingTrip] = useState(false);
  // 여행을 고칠 때도 참가자를 바꾼다. 비용 탭 안에만 두면 누가 가는지 정하는
  // 일이 돈 얘기처럼 보이는데, 실제로는 준비물과 교통편의 담당도 여기서 갈린다.
  const [draftTripPeople, setDraftTripPeople] = useState<Participant[]>([]);
  const [memoPanel, setMemoPanel] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoEditorOpen, setMemoEditorOpen] = useState(false);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [tripNotes, setTripNotes] = useState<TripNote[]>(initialPlanning?.tripNotes ?? []);
  const [hasKitchen, setHasKitchen] = useState(initialPlanning?.hasKitchen ?? true);
  const [feedback, setFeedback] = useState("");
  // 준비물 담당과 요리 재료 담당, 교통편 이용자, 지출의 몫이 모두 이 목록을 쓴다.
  // 한 군데서만 정하지 않으면 같은 여행 안에서 사람 목록이 서로 어긋난다.
  const [participants, setParticipants] = useState<Participant[]>(
    initialPlanning?.participants ?? spaceMembers,
  );
  const [packingItems, setPackingItems] = useState<PackingItem[]>(() =>
    (initialPlanning?.packingItems ?? []).map((item) => ({
      ...item,
      owner: normalizePackingOwner(item.owner, initialPlanning?.participants ?? spaceMembers),
    })),
  );
  const [packingDone, setPackingDone] = useState<string[]>(
    initialPlanning?.packingDone ?? [],
  );
  const togglePacking = (item: string) =>
    setPackingDone((items) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item]);
  const [recipes, setRecipes] = useState<Recipe[]>(() =>
    initialPlanning?.recipes ?? [],
  );
  const [cookingReadyIngredientIds, setCookingReadyIngredientIds] = useState<string[]>(
    initialPlanning?.cookingReadyIngredientIds ?? [],
  );
  const [expenses, setExpenses] = useState<Expense[]>(
    // 예시 지출은 여행마다 WarmAppShell 에서 심는다. 새로 만든 여행은 비어서 시작한다.
    // 옛 저장 데이터는 낸 사람과 몫이 두 사람으로 박혀 있어서 여기서 옮긴다.
    (initialPlanning?.expenses ?? []).map(normalizeExpense),
  );
  const [budget, setBudget] = useState(initialPlanning?.budget ?? 500000);
  const [currency, setCurrency] = useState(initialPlanning?.currency ?? DEFAULT_CURRENCY.code);
  const [exchangeRate, setExchangeRate] = useState(initialPlanning?.exchangeRate ?? 1);
  const [memories, setMemories] = useState<TripMemoryData>(() =>
    initialPlanning?.memories
      ? {
        ...initialPlanning.memories,
        photos: initialPlanning.memories.photos.map((photo) => ({
          ...photo,
          date: matchTripDay(photo.date, tripDayOptions),
        })),
      }
      : initialMemoryData(tripName, currentTripDate),
  );
  const [openCookingPicker, setOpenCookingPicker] = useState(false);
  const [registeredStay, setRegisteredStay] = useState<StayInfo>(() =>
    initialPlanning?.stay
      ? { ...initialPlanning.stay, showInSchedule: initialPlanning.stay.showInSchedule ?? true }
      : { name: "", checkin: "", checkout: "", address: "", showInSchedule: true },
  );
  const [places, setPlaces] = useState<PlaceItem[]>(() =>
    initialPlanning?.places ?? [],
  );
  const [reservations, setReservations] = useState<ReservationInfo[]>(() =>
    initialPlanning?.reservations ?? (
      initialPlanning?.reservation === undefined
        ? []
        : initialPlanning.reservation
          ? [initialPlanning.reservation]
          : []
    ),
  );
  const [transportations, setTransportations] = useState<Transportation[]>(
    initialPlanning?.transportations ?? [],
  );
  // 참가자에서 사람을 뺄 때, 그 이름으로 적어 둔 게 뭐가 있는지 한 줄로 적는다.
  // 담당은 이름으로 묶여 있어서 빼고 나면 어디에 남았는지 찾기 어렵다.
  const assignedSummary = useCallback(
    (person: string) => {
      const parts: string[] = [];
      const spent = expenses.filter((item) => item.payer === person).length;
      const packed = packingItems.filter((item) => item.owner === person).length;
      const cooked = recipes.reduce(
        (sum, recipe) => sum + recipe.ingredients.filter((item) => item.owner === person).length,
        0,
      );
      const rides = transportations.filter((item) => item.owner === person).length;
      if (spent) parts.push(`지출 ${spent}건`);
      if (packed) parts.push(`준비물 ${packed}개`);
      if (cooked) parts.push(`재료 ${cooked}개`);
      if (rides) parts.push(`교통편 ${rides}편`);
      return parts.join(" · ");
    },
    [expenses, packingItems, recipes, transportations],
  );
  const [schedule, setSchedule] = useState<ScheduleItem[]>(() =>
    initialPlanning?.schedule ?? [],
  );
  useEffect(() => {
    // 대표 숙소는 별도 편집 화면과 장소 탭에서도 바뀐다. 연결 일정은 이 한곳에서
    // 맞춰야 두 화면의 갱신 순서와 무관하게 같은 결과가 된다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSchedule((current) => {
      const linkedIndex = current.findIndex((item) =>
        item.stayId === "primary-stay" || (
          !item.stayId &&
          Boolean(registeredStay.placeId) &&
          item.placeId === registeredStay.placeId &&
          item.title.endsWith(" 체크인")
        ),
      );
      if (!registeredStay.name || registeredStay.showInSchedule === false) {
        return linkedIndex < 0 ? current : current.filter((_, index) => index !== linkedIndex);
      }
      const checkinDateIndex = tripDateOptions.findIndex((date) => registeredStay.checkin.startsWith(date));
      const date = tripDayOptions[Math.max(0, checkinDateIndex)];
      const time = registeredStay.checkin.match(/\d{1,2}:\d{2}$/)?.[0] ?? "시간 미정";
      const linked: ScheduleItem = {
        time: `${weekdayOf(date)} · ${time}`,
        date,
        title: `${registeredStay.name} 체크인`,
        note: registeredStay.checkout ? `${registeredStay.checkout} 체크아웃` : "숙소 체크인",
        mapUrl: places.find((place) => place.id === registeredStay.placeId)?.mapUrl ?? "",
        placeId: registeredStay.placeId,
        stayId: "primary-stay",
      };
      if (linkedIndex < 0) return [...current, linked];
      const saved = current[linkedIndex];
      if (JSON.stringify(saved) === JSON.stringify(linked)) return current;
      return current.map((item, index) => index === linkedIndex ? linked : item);
    });
  // 날짜 배열은 현재 여행 기간에서 함께 파생되며 문자열 키가 실제 변경을 대표한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, registeredStay, tripDateOptions.join("|"), tripDayOptions.join("|")]);
  const onSavePlanningRef = useRef(onSavePlanning);
  useEffect(() => {
    onSavePlanningRef.current = onSavePlanning;
  }, [onSavePlanning]);
  // 상세를 열기만 해도 저장하면 예시 일정과 지출이 그 여행에 박힌다. 여러
  // 여행이 똑같은 예시를 갖게 되고, 저장된 뒤로는 지워지지도 않는다.
  // 첫 실행은 화면을 처음 그린 것뿐이라 넘기고, 그 뒤부터가 진짜 바뀐 것이다.
  const firstPlanningRun = useRef(true);
  // 이미 저장된 계획이 있으면 처음부터 저장 대상으로 본다.
  const planningDirty = useRef(Boolean(initialPlanning));
  useEffect(() => {
    if (firstPlanningRun.current) {
      firstPlanningRun.current = false;
      return;
    }
    planningDirty.current = true;
    onSavePlanningRef.current?.({
      schedule,
      stay: registeredStay,
      places,
      reservations,
      transportations,
      memories,
      packingItems,
      packingDone,
      recipes,
      cookingReadyIngredientIds,
      expenses,
      budget,
      participants,
      currency,
      exchangeRate,
      tripNotes,
      hasKitchen,
    });
  }, [budget, cookingReadyIngredientIds, currency, exchangeRate, expenses, hasKitchen, memories, packingDone, packingItems, participants, places, recipes, registeredStay, reservations, schedule, transportations, tripNotes]);
  const closeDetail = useCallback(() => {
    // 열어만 보고 닫으면 아무것도 남기지 않는다.
    if (!planningDirty.current) {
      onClose();
      return;
    }
    onSavePlanning?.({
      schedule,
      stay: registeredStay,
      places,
      reservations,
      transportations,
      memories,
      packingItems,
      packingDone,
      recipes,
      cookingReadyIngredientIds,
      expenses,
      budget,
      participants,
      currency,
      exchangeRate,
      tripNotes,
      hasKitchen,
    });
    onClose();
  }, [budget, cookingReadyIngredientIds, currency, exchangeRate, expenses, hasKitchen, memories, onClose, onSavePlanning, packingDone, packingItems, participants, places, recipes, registeredStay, reservations, schedule, transportations, tripNotes]);

  useEffect(() => {
    // 홈의 바로가기 목적지가 바뀌면 이미 열린 상세 화면의 탭을 맞춘다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(destinationMode(initialDestination));
  }, [initialDestination]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeDetail();
      return true;
    });
    return () => subscription.remove();
  }, [closeDetail]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 2200);
    return () => clearTimeout(timer);
  }, [feedback]);

  const tripDraftValid = Boolean(
    draftTitle.trim()
    && draftRegion.trim()
    && validDateKey(draftStart)
    && validDateKey(draftEnd)
    && draftStart <= draftEnd
    // 아무도 안 가는 여행은 없다. 참가자가 비면 몫을 나눌 기준도 사라진다.
    && draftTripPeople.length,
  );
  return (
    <DetailThemeContext.Provider value={appTheme}>
      <DetailFeedbackContext.Provider value={setFeedback}>
      <SafeAreaView
        style={[
          styles.safe,
          appTheme && { backgroundColor: appTheme.background },
        ]}
      >
        <View
          style={[
            styles.header,
            appTheme && {
              backgroundColor: appTheme.background,
              borderColor: appTheme.border,
            },
          ]}
        >
          <Pressable
            onPress={closeDetail}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="여행 목록으로 돌아가기"
          >
            <Glyph name="chevronLeft" size={22} color={appTheme?.text ?? "#17233D"} />
          </Pressable>
          <Text
            style={[styles.headerName, appTheme && { color: appTheme.text }]}
          >
            Daymo
          </Text>
          <Pressable
            onPress={() => {
              setDraftTitle(title);
              setDraftStart(currentStart);
              setDraftEnd(currentEnd);
              setDraftRegion(region);
              setDraftNote(note);
              setDraftTripPeople(participants);
              setShowAllEditRegions(false);
              setEditingTrip(true);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="여행 정보 수정"
          >
            <Glyph name="more" size={20} color={appTheme?.text ?? "#17233D"} weight={2.6} />
          </Pressable>
        </View>
        <ScrollView
          ref={detailScrollRef}
          style={{ backgroundColor: "transparent" }}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.date, appTheme && { color: appTheme.primary }]}>
            {currentTripDate}
          </Text>
          <View style={styles.detailTitleRow}>
            <Text
              style={[
                styles.title,
                styles.detailTripTitle,
                appTheme && { color: appTheme.text },
              ]}
            >
              {title}
            </Text>
            <Pressable
              onPress={() => setMemoPanel(true)}
              accessibilityRole="button"
              accessibilityLabel={`여행 메모 ${tripNotes.length}개 보기`}
              style={[
                styles.tripMemoButton,
                { backgroundColor: memo.surface, borderColor: memo.border },
              ]}
            >
              <View style={[styles.tripMemoTape, { backgroundColor: memo.tape }]} />
              <Text style={[styles.tripMemoLabel, { color: memo.label }]}>확인할 것</Text>
              <Text numberOfLines={1} style={[styles.tripMemoPreview, { color: memo.text }]}>
                {tripNotes[0]?.body || "메모를 남겨보세요"}
              </Text>
              <View style={styles.tripMemoBottom}>
                <Text style={[styles.tripMemoButtonText, { color: memo.meta }]}>메모 {tripNotes.length}개</Text>
                <Glyph name="chevronRight" size={14} color={memo.label} />
              </View>
              <View style={[styles.tripMemoFold, { backgroundColor: memo.fold }]} />
            </Pressable>
          </View>
          <Text
            style={[styles.subtitle, appTheme && { color: appTheme.muted }]}
          >
            {region ? `${region} · ` : ""}{tripDuration}{note ? ` · ${note}` : ""}
          </Text>
          {/* 누가 가는지는 여행의 기본 정보다. 비용 탭 안에만 두면 이 여행이
              몇 명짜리인지 알려면 돈 얘기를 열어 봐야 한다. */}
          {participants.length > 1 && (
            <Text numberOfLines={1} style={[styles.subtitle, styles.tripPeopleLine, appTheme && { color: appTheme.muted }]}>
              함께 {participants.join(" · ")}
            </Text>
          )}

          <View
            style={[
              styles.modeSwitch,
              appTheme && { backgroundColor: appTheme.surface, borderColor: appTheme.border },
            ]}
          >
            {(
              [
                "여행",
                "장소",
                "준비",
                ...(hasKitchen ? ["요리" as ViewMode] : []),
                "비용",
                "기록",
              ] as ViewMode[]
            ).map((item) => (
              <Pressable
                key={item}
                onPress={() => showMode(item)}
                accessibilityRole="tab"
                accessibilityLabel={`${item} 탭`}
                accessibilityState={{ selected: mode === item }}
                style={[
                  styles.mode,
                  mode === item && styles.modeCurrent,
                  mode === item &&
                    appTheme && {
                      backgroundColor: appTheme.primarySoft,
                      borderColor: appTheme.primary,
                    },
                ]}
              >
                <Text
                  style={[
                    styles.modeText,
                    mode === item && styles.modeTextCurrent,
                    appTheme && {
                      color: mode === item ? appTheme.primary : appTheme.muted,
                    },
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "여행" && (
            <TripOverview
              key={initialDestination}
              setMode={showMode}
              schedule={schedule}
              setSchedule={setSchedule}
              places={places}
              setPlaces={setPlaces}
              hasKitchen={hasKitchen}
              registeredStay={registeredStay}
              setRegisteredStay={setRegisteredStay}
              reservations={reservations}
              setReservations={setReservations}
              transportations={transportations}
              setTransportations={setTransportations}
              participants={participants}
              recipes={recipes}
              packingRemaining={packingItems.filter((item) => !packingDone.includes(item.id)).length}
              dayOptions={tripDayOptions}
              dateOptions={tripDateOptions}
              openScheduleOnMount={initialDestination === "schedule-add"}
            />
          )}
          {mode === "장소" && (
            <Places
              schedule={schedule}
              setSchedule={setSchedule}
              places={places}
              setPlaces={setPlaces}
              registeredStayName={registeredStay.name}
              dayOptions={tripDayOptions}
              onRegisterStay={(place) => {
                setRegisteredStay({
                  name: place.name,
                  checkin: `${firstTripDate} 15:00`,
                  checkout: `${lastTripDate} 11:00`,
                  address: place.address || place.area,
                  placeId: place.id,
                  showInSchedule: true,
                });
                setFeedback(`${place.name}을(를) 이번 여행 숙소로 등록했어요`);
              }}
              onUpdateRegisteredStay={(place) => setRegisteredStay((current) => ({
                ...current,
                name: place.name,
                address: place.address || place.area,
              }))}
              onRemoveRegisteredStay={() => setRegisteredStay({ name: "", checkin: "", checkout: "", address: "", showInSchedule: false })}
            />
          )}
          {mode === "준비" && (
            <Preparation
              done={packingDone}
              toggle={togglePacking}
              participants={participants}
              items={packingItems}
              setItems={setPackingItems}
              recipes={recipes}
              openCookingPickerOnMount={openCookingPicker}
              onCookingPickerOpened={() => setOpenCookingPicker(false)}
            />
          )}
          {mode === "요리" && (
            <Cooking
              recipes={recipes}
              setRecipes={setRecipes}
              readyIngredientIds={cookingReadyIngredientIds}
              setReadyIngredientIds={setCookingReadyIngredientIds}
              currency={currency}
              participants={participants}
              onRecordShopping={(title, amount) => {
                setExpenses((current) => [
                  ...current,
                  {
                    id: `expense-${Date.now()}`,
                    day: todayTripDay || tripDayOptions[0] || "",
                    title,
                    amount,
                    category: "식비",
                    payer: participants[0] ?? "하늘",
                    memo: "요리 재료",
                  },
                ]);
                setMode("비용");
              }}
              openPreparationImport={() => {
                setOpenCookingPicker(true);
                showMode("준비");
              }}
            />
          )}
          {mode === "비용" && (
            <Money
              tripName={title}
              dayOptions={tripDayOptions}
              todayDay={todayTripDay}
              expenses={expenses}
              setExpenses={setExpenses}
              budget={budget}
              setBudget={setBudget}
              assignedSummary={assignedSummary}
              participants={participants}
              setParticipants={setParticipants}
              spaceMembers={spaceMembers}
              currency={currency}
              setCurrency={setCurrency}
              exchangeRate={exchangeRate}
              setExchangeRate={setExchangeRate}
            />
          )}
          {mode === "기록" && (
            <Memories
              tripDate={currentTripDate}
              dayOptions={tripDayOptions}
              todayDay={todayTripDay}
              memories={memories}
              setMemories={setMemories}
            />
          )}
        </ScrollView>
        <DetailSheet
          visible={memoPanel}
          title="여행 메모"
          subtitle="함께 확인할 짧은 내용을 남겨두세요"
          submit={memoEditorOpen ? (editingMemoId ? "변경 저장" : "메모 추가") : "닫기"}
          submitDisabled={memoEditorOpen && !memoDraft.trim()}
          disabledHint={memoEditorOpen && !memoDraft.trim() ? "메모 내용을 입력해 주세요" : undefined}
          onClose={() => {
            setMemoPanel(false);
            setMemoEditorOpen(false);
            setEditingMemoId(null);
            setMemoDraft("");
          }}
          onSubmit={() => {
            if (!memoEditorOpen) {
              setMemoPanel(false);
              return;
            }
            const body = memoDraft.trim();
            if (!body) return;
            if (editingMemoId) {
              setTripNotes((current) => current.map((note) =>
                note.id === editingMemoId ? { ...note, body, author: "하늘 · 방금 수정" } : note,
              ));
              setFeedback("여행 메모를 수정했어요");
            } else {
              setTripNotes((current) => [
                { id: `memo-${Date.now()}`, author: "하늘 · 방금", body },
                ...current,
              ]);
              setFeedback("여행 메모를 추가했어요");
            }
            setMemoDraft("");
            setEditingMemoId(null);
            setMemoEditorOpen(false);
          }}
        >
          {!memoEditorOpen && (
            <Pressable
              onPress={() => {
                setMemoDraft("");
                setEditingMemoId(null);
                setMemoEditorOpen(true);
              }}
              style={({ pressed }) => [
                styles.memoAddButton,
                appTheme && { backgroundColor: appTheme.primarySoft, borderColor: `${appTheme.primary}55` },
                pressed && styles.controlPressed,
              ]}
            >
              <Text style={[styles.memoAddPlus, appTheme && { color: appTheme.primary }]}>＋</Text>
              <View style={styles.memoAddCopy}>
                <Text style={[styles.memoAddTitle, appTheme && { color: appTheme.text }]}>새 메모 추가</Text>
                <Text style={[styles.memoAddHint, appTheme && { color: appTheme.muted }]}>필요한 내용을 짧게 남겨보세요</Text>
              </View>
            </Pressable>
          )}
          {memoEditorOpen && (
            <View style={[styles.memoEditor, appTheme && { backgroundColor: appTheme.surface, borderColor: appTheme.border }]}>
              <View style={styles.memoEditorHead}>
                <Text style={[styles.memoEditorTitle, appTheme && { color: appTheme.text }]}>
                  {editingMemoId ? "메모 수정" : "새 메모"}
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setMemoDraft("");
                    setEditingMemoId(null);
                    setMemoEditorOpen(false);
                  }}
                >
                  <Text style={[styles.memoEditorCancel, appTheme && { color: appTheme.muted }]}>취소</Text>
                </Pressable>
              </View>
              <DetailField
                label="메모 내용 · 필수"
                value={memoDraft}
                onChangeText={setMemoDraft}
                placeholder="예: 체크인 전에 장보기"
                multiline
              />
            </View>
          )}
          <View style={[styles.tripMemoList, appTheme && { backgroundColor: appTheme.surface }]}>
            {tripNotes.length === 0 && (
              <View style={styles.memoEmpty}>
                <Text style={[styles.memoEmptyTitle, appTheme && { color: appTheme.text }]}>아직 메모가 없어요</Text>
                <Text style={[styles.memoEmptyHint, appTheme && { color: appTheme.muted }]}>새 메모를 추가하면 함께 볼 수 있어요.</Text>
              </View>
            )}
            {tripNotes.map((note) => (
              <View
                key={note.id}
                style={[
                  styles.tripMemoRow,
                  { backgroundColor: memo.surface, borderColor: memo.border },
                ]}
              >
                <View style={styles.tripMemoRowHead}>
                  <Text style={[styles.tripMemoAuthor, { color: memo.meta }]}>{note.author}</Text>
                  <View style={styles.tripMemoActions}>
                    <Pressable onPress={() => {
                      setEditingMemoId(note.id);
                      setMemoDraft(note.body);
                      setMemoEditorOpen(true);
                    }}>
                      <Text style={[styles.tripMemoEdit, { color: memo.meta }]}>수정</Text>
                    </Pressable>
                    <Pressable onPress={() => Alert.alert(
                      "메모를 삭제할까요?",
                      note.body,
                      [
                        { text: "취소", style: "cancel" },
                        { text: "삭제", style: "destructive", onPress: () => {
                          setTripNotes((current) => current.filter((item) => item.id !== note.id));
                          if (editingMemoId === note.id) {
                            setMemoDraft("");
                            setEditingMemoId(null);
                            setMemoEditorOpen(false);
                          }
                          setFeedback("여행 메모를 삭제했어요");
                        } },
                      ],
                    )}>
                      <Text style={[styles.tripMemoDelete, { color: appTheme?.dark ? statusColor.danger.dark : statusColor.danger.light }]}>삭제</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={[styles.tripMemoBody, { color: memo.text }]}>{note.body}</Text>
              </View>
            ))}
          </View>
        </DetailSheet>
        <DetailSheet
          visible={editingTrip}
          title="여행 수정"
          subtitle="여행의 기본 정보와 사용할 기능을 관리해요"
          submit="변경 저장"
          disabledHint={
            !tripDraftValid
              ? (draftTripPeople.length ? "제목·여행지·기간을 확인해 주세요" : "함께 가는 사람을 한 명은 골라 주세요")
              : undefined
          }
          submitDisabled={!tripDraftValid}
          onClose={() => setEditingTrip(false)}
          onSubmit={() => {
            if (!tripDraftValid) return;
            const nextTitle = draftTitle.trim();
            const nextRegion = draftRegion.trim();
            const nextNote = draftNote.trim();
            const oldDays = tripDayOptions;
            const nextDates = buildTripDates(draftStart, draftEnd);
            const nextDays = nextDates.map(dayLabel);
            setSchedule((current) => current.map((item) => {
              const oldIndex = item.date ? oldDays.indexOf(item.date) : -1;
              if (oldIndex < 0 || !nextDays.length) return item;
              const date = nextDays[Math.min(oldIndex, nextDays.length - 1)];
              return { ...item, date, time: `${weekdayOf(date)}${item.time.includes(" · ") ? ` · ${item.time.split(" · ").slice(1).join(" · ")}` : ""}` };
            }));
            setReservations((current) => current.map((reservation) => {
              if (!nextDays.length) return reservation;
              const oldIndex = oldDays.indexOf(reservation.date);
              if (oldIndex < 0) return reservation;
              return { ...reservation, date: nextDays[Math.min(oldIndex, nextDays.length - 1)] };
            }));
            setTransportations((current) => current.map((item) => {
              if (!nextDays.length) return item;
              const oldIndex = oldDays.indexOf(item.date);
              if (oldIndex < 0) return item;
              return { ...item, date: nextDays[Math.min(oldIndex, nextDays.length - 1)] };
            }));
            setTitle(nextTitle);
            setParticipants(draftTripPeople);
            setCurrentStart(draftStart);
            setCurrentEnd(draftEnd);
            setRegion(nextRegion);
            setNote(nextNote);
            setRegisteredStay((current) => ({
              ...current,
              checkin: current.checkin ? `${dateLabel(nextDates[0])} ${current.checkin.split(" ").at(-1)}` : "",
              checkout: current.checkout ? `${dateLabel(nextDates[nextDates.length - 1])} ${current.checkout.split(" ").at(-1)}` : "",
            }));
            onUpdateTrip?.({
              name: nextTitle,
              date: formatTripPeriod(draftStart, draftEnd),
              start: draftStart,
              end: draftEnd,
              region: nextRegion,
              note: nextNote,
            });
            if (!hasKitchen && mode === "요리") showMode("여행");
            setEditingTrip(false);
            setFeedback("여행 정보를 저장했어요");
          }}
        >
          <DetailField
            label="여행지 · 필수"
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="예: 전주 한옥마을"
          />
          {appTheme && (
            <TripRegionPicker
              theme={appTheme}
              value={draftRegion}
              onChange={setDraftRegion}
              expanded={showAllEditRegions}
              setExpanded={setShowAllEditRegions}
            />
          )}
          <View style={[styles.tripEditSection, appTheme && { borderTopColor: appTheme.border }]}>
            <Text style={[styles.tripEditSectionTitle, appTheme && { color: appTheme.text }]}>언제 떠나나요?</Text>
            <Text style={[styles.tripEditSectionHint, appTheme && { color: appTheme.muted }]}>시작일을 고른 다음 마지막 날을 선택해 주세요.</Text>
            {appTheme && (
              <TripDateRangePicker
                key={`${editingTrip}-${currentStart}-${currentEnd}`}
                theme={appTheme}
                start={draftStart}
                end={draftEnd}
                setStart={setDraftStart}
                setEnd={setDraftEnd}
              />
            )}
          </View>
          <DetailField
            label="한 줄 메모 · 선택 사항"
            value={draftNote}
            onChangeText={setDraftNote}
            placeholder="예: 골목을 천천히 걷는 여행"
          />
          {appTheme && spaceMembers.length > 1 && (
            <View style={[styles.tripEditSection, appTheme && { borderTopColor: appTheme.border }]}>
              <Text style={[styles.tripEditSectionTitle, appTheme && { color: appTheme.text }]}>누가 함께 가나요?</Text>
              <Text style={[styles.tripEditSectionHint, appTheme && { color: appTheme.muted }]}>
                공간 멤버 {spaceMembers.length}명 중 이번에 같이 가는 사람만 골라요.
              </Text>
              <ParticipantPicker
                theme={appTheme}
                members={spaceMembers}
                value={draftTripPeople}
                onChange={setDraftTripPeople}
                noteFor={assignedSummary}
              />
            </View>
          )}
          <View style={[styles.tripEditSection, appTheme && { borderTopColor: appTheme.border }]}>
            <Text style={[styles.tripEditSectionTitle, appTheme && { color: appTheme.text }]}>여행 기능</Text>
            <Text style={[styles.tripEditSectionHint, appTheme && { color: appTheme.muted }]}>숙소 환경에 맞춰 필요한 탭만 보여줘요.</Text>
          <OptionField
            label="숙소에 주방이 있나요?"
            options={["있어요", "없어요"]}
            value={hasKitchen ? "있어요" : "없어요"}
            onChange={(value) => setHasKitchen(value === "있어요")}
          />
          <Text style={[styles.settingHint, appTheme && { color: appTheme.muted }]}>
            주방이 있을 때만 요리 탭을 표시해요. 언제든 다시 켜거나 숨길 수
            있어요.
          </Text>
          </View>
        </DetailSheet>
        {!!feedback && (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.feedbackToast,
              appTheme && { backgroundColor: appTheme.text },
            ]}
          >
            <View style={[styles.feedbackToastMark, appTheme && { backgroundColor: appTheme.primary }]} />
            <Text style={[styles.feedbackToastText, appTheme?.dark && { color: appTheme.background }]}>
              {feedback}
            </Text>
          </View>
        )}
      </SafeAreaView>
      </DetailFeedbackContext.Provider>
    </DetailThemeContext.Provider>
  );
}

function TripOverview({
  setMode,
  schedule,
  setSchedule,
  places,
  setPlaces,
  hasKitchen,
  registeredStay,
  setRegisteredStay,
  reservations,
  setReservations,
  transportations,
  setTransportations,
  participants,
  recipes,
  packingRemaining,
  dayOptions,
  dateOptions,
  openScheduleOnMount,
}: {
  setMode: (mode: ViewMode) => void;
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  places: PlaceItem[];
  setPlaces: React.Dispatch<React.SetStateAction<PlaceItem[]>>;
  hasKitchen: boolean;
  registeredStay: StayInfo;
  setRegisteredStay: React.Dispatch<React.SetStateAction<StayInfo>>;
  reservations: ReservationInfo[];
  setReservations: React.Dispatch<React.SetStateAction<ReservationInfo[]>>;
  transportations: Transportation[];
  setTransportations: React.Dispatch<React.SetStateAction<Transportation[]>>;
  /** 이번 여행에 가는 사람. 교통편 이용자를 여기서 고른다. */
  participants: string[];
  /** 요리 카드가 무엇을 가리킬지는 실제 메뉴에서 가져온다. */
  recipes: Recipe[];
  /** 아직 안 챙긴 준비물 수. 0 이면 재촉할 것이 없다. */
  packingRemaining: number;
  dayOptions: string[];
  dateOptions: string[];
  openScheduleOnMount?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const [sheet, setSheet] = useState<
    "schedule" | "reservation" | "stay" | "transport" | null
  >(openScheduleOnMount ? "schedule" : null);
  const [fullSchedule, setFullSchedule] = useState(false);
  const [editingScheduleIndex, setEditingScheduleIndex] = useState<number | null>(null);
  const defaultPlanDay = dayOptions[Math.min(1, dayOptions.length - 1)];
  const firstDay = dayOptions[0];
  const lastDay = dayOptions[dayOptions.length - 1];
  const firstDate = dateOptions[0];
  const lastDate = dateOptions[dateOptions.length - 1];
  const [planDay, setPlanDay] = useState(defaultPlanDay);
  const [planType, setPlanType] = useState("장소");
  const [planTime, setPlanTime] = useState("11:00");
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [planPlace, setPlanPlace] = useState("");
  const [planMapUrl, setPlanMapUrl] = useState("");
  const [selectedPlanPlaceId, setSelectedPlanPlaceId] = useState<string | null>(null);
  const [scheduleDetailsOpen, setScheduleDetailsOpen] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState<Transportation | null>(null);
  const [transportOwner, setTransportOwner] = useState(participants[0] ?? "");
  const [transportDirection, setTransportDirection] = useState<Transportation["direction"]>("가는 편");
  const [transportMethod, setTransportMethod] = useState<Transportation["method"]>("KTX");
  const [transportDate, setTransportDate] = useState(firstDay);
  const [transportDeparture, setTransportDeparture] = useState("");
  const [transportDepartureTime, setTransportDepartureTime] = useState("");
  const [transportArrival, setTransportArrival] = useState("");
  const [transportArrivalTime, setTransportArrivalTime] = useState("");
  const [transportStatus, setTransportStatus] = useState<Transportation["status"]>("예매 완료");
  const [transportShowInSchedule, setTransportShowInSchedule] = useState(true);
  const [transportDetailsOpen, setTransportDetailsOpen] = useState(false);
  const [editingTransportId, setEditingTransportId] = useState<string | null>(null);
  const transportDraft = {
    owner: transportOwner,
    direction: transportDirection,
    method: transportMethod,
    date: transportDate,
    departure: transportDeparture,
    departureTime: transportDepartureTime,
    arrival: transportArrival,
    arrivalTime: transportArrivalTime,
    status: transportStatus,
    showInSchedule: transportShowInSchedule,
  };
  const [transportDraftBaseline, setTransportDraftBaseline] = useState(() =>
    JSON.stringify(transportDraft),
  );
  const blankReservation = (id = `reservation-${Date.now()}`): ReservationInfo => ({
    id,
    name: "",
    date: defaultPlanDay,
    time: "19:00",
    people: "2명",
    status: "예약 확정",
    place: "",
    showInSchedule: true,
  });
  const [reservationDraft, setReservationDraft] = useState<ReservationInfo>(() =>
    reservations[0] ?? blankReservation("reservation-draft"),
  );
  const [reservationDraftBaseline, setReservationDraftBaseline] = useState(() =>
    JSON.stringify(reservations[0] ?? blankReservation("reservation-draft")),
  );
  const [editingReservationId, setEditingReservationId] = useState<string | null>(null);
  const editingReservation = editingReservationId !== null;
  const [stayDraft, setStayDraft] = useState(registeredStay);
  const hasStay = Boolean(registeredStay.name);
  const scheduleDraftKey = (
    day: string,
    type: string,
    time: string,
    title: string,
    place: string,
    mapUrl: string,
    placeId: string | null,
  ) => JSON.stringify([day, type, time, title, place, mapUrl, placeId]);
  const [scheduleDraftBaseline, setScheduleDraftBaseline] = useState(
    scheduleDraftKey(defaultPlanDay, "장소", "11:00", "", "", "", null),
  );
  const [stayDraftBaseline, setStayDraftBaseline] = useState(JSON.stringify(registeredStay));
  const scheduleDraftChanged = scheduleDraftKey(
    planDay,
    planType,
    planTime,
    newPlanTitle,
    planPlace,
    planMapUrl,
    selectedPlanPlaceId,
  ) !== scheduleDraftBaseline;
  const stayDraftChanged = JSON.stringify(stayDraft) !== stayDraftBaseline;
  const reservationDraftChanged = JSON.stringify(reservationDraft) !== reservationDraftBaseline;
  const transportDraftChanged = JSON.stringify(transportDraft) !== transportDraftBaseline;
  const orderedSchedule = useMemo(
    () => orderedScheduleItems(schedule, dayOptions),
    [dayOptions, schedule],
  );
  const scheduleGroups = useMemo(() => {
    const groups: { date: string; items: ScheduleItem[] }[] = [];
    orderedSchedule.forEach((item) => {
      const date = item.date ?? "날짜 미정";
      const current = groups.at(-1);
      if (current?.date === date) current.items.push(item);
      else groups.push({ date, items: [item] });
    });
    return groups;
  }, [orderedSchedule]);
  // 타임라인 카드가 실제로 그리는 개수. 첫 묶음의 앞 세 개다.
  const shownScheduleCount = Math.min(3, scheduleGroups[0]?.items.length ?? 0);
  // 일정이 있는 첫 묶음이 반드시 1일차는 아니다. 몇째 날인지 세어 적는다.
  const firstScheduleDayLabel = (() => {
    const index = scheduleGroups[0] ? dayOptions.indexOf(scheduleGroups[0].date) : -1;
    return index < 0 ? "가장 빠른 일정" : `${["첫", "둘", "셋", "넷", "다섯"][index] ?? `${index + 1}`}째 날`;
  })();
  const scheduleFormValid = Boolean(newPlanTitle.trim());
  const transportRouteValid = Boolean(
    transportDeparture.trim() &&
    transportArrival.trim() &&
    transportDeparture.trim() !== transportArrival.trim(),
  );
  const transportTimesValid = Boolean(transportDepartureTime.trim()) === Boolean(transportArrivalTime.trim());
  const transportFormValid = transportRouteValid && transportTimesValid;
  const transportSubmitLabel = editingTransportId ? "변경 저장" : "교통편 추가";
  const transportDisabledHint = transportFormValid
    ? undefined
    : !transportDeparture.trim() || !transportArrival.trim()
      ? "출발지와 도착지를 입력해 주세요"
      : transportDeparture.trim() === transportArrival.trim()
        ? "출발지와 도착지를 다르게 입력해 주세요"
        : "출발·도착 시간을 모두 입력해 주세요";
  const stayMoment = (value: string) => {
    const dateIndex = dateOptions.findIndex((date) => value.startsWith(date));
    const time = value.match(/(\d{1,2}):(\d{2})$/);
    return dateIndex < 0 || !time ? -1 : dateIndex * 1440 + Number(time[1]) * 60 + Number(time[2]);
  };
  const stayRangeValid = stayMoment(stayDraft.checkout) > stayMoment(stayDraft.checkin);
  const stayFormValid = Boolean(stayDraft.name.trim()) && stayRangeValid;
  const transportDirectionColor = transportDirection === "가는 편"
    ? theme?.primary ?? "#FF6B63"
    : theme?.secondary ?? "#55BFB4";
  const transportDirectionSoft = transportDirection === "가는 편"
    ? theme?.primarySoft ?? "#FFF0ED"
    : `${transportDirectionColor}18`;
  const switchTransportDirection = () => {
    const nextDirection = transportDirection === "가는 편" ? "오는 편" : "가는 편";
    setTransportDirection(nextDirection);
    setTransportDate(nextDirection === "가는 편" ? firstDay : lastDay);
    setTransportDeparture(transportArrival);
    setTransportArrival(transportDeparture);
    setTransportDepartureTime(transportArrivalTime);
    setTransportArrivalTime(transportDepartureTime);
  };
  const addSchedule = () => {
    if (!newPlanTitle.trim()) return;
    const wasEditing = editingScheduleIndex !== null;
    // 예약·교통편·숙소에서 만들어진 일정은 그 연결을 그대로 들고 가야 한다.
    // 하나라도 떨어뜨리면 동기화가 이 줄을 남남으로 보고 원래대로 되돌린다.
    const edited = editingScheduleIndex === null ? undefined : schedule[editingScheduleIndex];
    const next: ScheduleItem = {
        time: `${weekdayOf(planDay)} · ${planTime || "시간 미정"}`,
        date: planDay,
        title: newPlanTitle.trim(),
        note: [planType, planPlace.trim()].filter(Boolean).join(" · "),
        mapUrl: planMapUrl.trim(),
        placeId: selectedPlanPlaceId ?? undefined,
        reservationId: edited?.reservationId,
        transportationId: edited?.transportationId,
        stayId: edited?.stayId,
      };
    const nextSchedule = editingScheduleIndex === null
      ? [...schedule, next]
      : schedule.map((item, index) => index === editingScheduleIndex ? next : item);
    setSchedule(nextSchedule);
    setPlaces((current) => current.map((place) => ({
      ...place,
      status: nextSchedule.some((item) => item.placeId === place.id) ? "일정" : place.status,
    })));
    setNewPlanTitle("");
    setPlanPlace("");
    setPlanMapUrl("");
    setSelectedPlanPlaceId(null);
    setEditingScheduleIndex(null);
    setSheet(null);
    if (!wasEditing) setFullSchedule(true);
    notify(wasEditing ? "일정을 수정했어요" : "일정을 추가했어요");
  };
  const openScheduleCreate = () => {
    setScheduleDraftBaseline(scheduleDraftKey(
      defaultPlanDay,
      "장소",
      "11:00",
      "",
      "",
      "",
      null,
    ));
    setEditingScheduleIndex(null);
    setNewPlanTitle("");
    setPlanPlace("");
    setPlanMapUrl("");
    setSelectedPlanPlaceId(null);
    setPlanDay(defaultPlanDay);
    setPlanType("장소");
    setPlanTime("11:00");
    setScheduleDetailsOpen(false);
    setSheet("schedule");
  };
  const openScheduleEdit = (item: ScheduleItem, index: number) => {
    if (item.transportationId) {
      const linkedTransportation = transportations.find(
        (transportation) => transportation.id === item.transportationId,
      );
      if (linkedTransportation) {
        openTransportEdit(linkedTransportation);
        return;
      }
    }
    if (item.reservationId) {
      const linkedReservation = reservations.find((reservation) => reservation.id === item.reservationId);
      if (linkedReservation) {
        openReservation(linkedReservation);
        return;
      }
    }
    // 숙소 체크인 줄은 숙소에서 만들어진다. 일정으로 고치면 저장하자마자
    // 숙소 쪽 값으로 되돌아가니, 고칠 수 있는 자리로 보낸다.
    if (item.stayId) {
      openStay();
      return;
    }
    const [day = "토", time = "11:00"] = item.time.split("·").map((value) => value.trim());
    const [savedType = "장소", ...savedPlace] = item.note.split("·").map((value) => value.trim());
    const nextDay = item.date ?? dayOptions.find((value) => weekdayOf(value) === day) ?? defaultPlanDay;
    const nextType = ["장소", "식사", "이동", "예약", "행사"].includes(savedType) ? savedType : "장소";
    const nextPlace = savedPlace.length ? savedPlace.join(" · ") : (["장소", "식사", "이동", "예약", "행사"].includes(savedType) ? "" : item.note);
    setScheduleDraftBaseline(scheduleDraftKey(
      nextDay,
      nextType,
      time,
      item.title,
      nextPlace,
      item.mapUrl,
      item.placeId ?? null,
    ));
    setEditingScheduleIndex(index);
    setPlanDay(nextDay);
    setPlanTime(time);
    setPlanType(nextType);
    setNewPlanTitle(item.title);
    setPlanPlace(nextPlace);
    setPlanMapUrl(item.mapUrl);
    setSelectedPlanPlaceId(item.placeId ?? null);
    setScheduleDetailsOpen(Boolean(nextPlace || item.mapUrl));
    setSheet("schedule");
  };
  const chooseSavedPlace = (place: PlaceItem) => {
    setSelectedPlanPlaceId(place.id);
    setNewPlanTitle(place.name);
    setPlanPlace(place.address || place.area);
    setPlanMapUrl(place.mapUrl);
    setPlanType(place.category === "식당" || place.category === "카페" ? "식사" : "장소");
    setScheduleDetailsOpen(Boolean(place.address || place.area || place.mapUrl));
  };
  const deleteSchedule = () => {
    if (editingScheduleIndex === null) return;
    const target = schedule[editingScheduleIndex];
    const linkedReservationId = target?.reservationId;
    const linkedTransportationId = target?.transportationId;
    const linkedStayId = target?.stayId;
    setSchedule((current) => current.filter((_, index) => index !== editingScheduleIndex));
    if (target?.placeId) {
      setPlaces((current) => current.map((place) =>
        place.id === target.placeId ? { ...place, status: "후보" } : place,
      ));
    }
    if (linkedReservationId) {
      setReservations((current) => current.map((reservation) =>
        reservation.id === linkedReservationId
          ? { ...reservation, showInSchedule: false }
          : reservation,
      ));
    }
    if (linkedTransportationId) {
      setTransportations((current) => current.map((item) =>
        item.id === linkedTransportationId
          ? { ...item, showInSchedule: false }
          : item,
      ));
    }
    if (linkedStayId) {
      setRegisteredStay((current) => ({ ...current, showInSchedule: false }));
    }
    setEditingScheduleIndex(null);
    setSheet(null);
    notify("일정을 삭제했어요");
  };
  const syncTransportationSchedule = (transportation: Transportation) => {
    setSchedule((current) => {
      const linkedIndex = current.findIndex(
        (item) => item.transportationId === transportation.id,
      );
      if (!transportation.showInSchedule) {
        return linkedIndex < 0
          ? current
          : current.filter((item) => item.transportationId !== transportation.id);
      }
      const linked: ScheduleItem = {
        time: `${weekdayOf(transportation.date)} · ${transportation.departureTime}`,
        date: transportation.date,
        title: `${transportation.method} ${transportation.departure} 출발`,
        note: `${transportation.arrival} ${transportation.arrivalTime} 도착 · ${transportation.owner} · ${transportation.direction}`,
        mapUrl: "",
        transportationId: transportation.id,
      };
      if (linkedIndex < 0) return [...current, linked];
      return current.map((item, index) => index === linkedIndex ? linked : item);
    });
  };
  const addTransportation = () => {
    if (!transportFormValid) return;
    const next: Transportation = {
      id: editingTransportId ?? `transport-${Date.now()}`,
      owner: transportOwner,
      direction: transportDirection,
      method: transportMethod,
      date: transportDate,
      departure: transportDeparture.trim(),
      departureTime: transportDepartureTime.trim() || "시간 미정",
      arrival: transportArrival.trim(),
      arrivalTime: transportArrivalTime.trim() || "시간 미정",
      status: transportStatus,
      showInSchedule: transportShowInSchedule,
    };
    setTransportDraftBaseline(JSON.stringify(transportDraft));
    if (editingTransportId) {
      setTransportations((current) => current.map((item) => item.id === editingTransportId ? next : item));
      syncTransportationSchedule(next);
      setEditingTransportId(null);
      setTransportDeparture("");
      setTransportDepartureTime("");
      setTransportArrival("");
      setTransportArrivalTime("");
      setSheet(null);
      notify("교통편을 수정했어요");
      return;
    }
    setTransportations((current) => [...current, next]);
    syncTransportationSchedule(next);
    if (transportDirection === "가는 편") {
      Alert.alert(
        "가는 편을 저장했어요",
        "오는 편도 이어서 등록할까요?",
        [
          {
            text: "나중에",
            style: "cancel",
            onPress: () => {
              setTransportDeparture("");
              setTransportDepartureTime("");
              setTransportArrival("");
              setTransportArrivalTime("");
              setSheet(null);
            },
          },
          {
            text: "오는 편 등록",
            onPress: () => {
              setTransportDraftBaseline(JSON.stringify({
                owner: next.owner,
                direction: "오는 편",
                method: next.method,
                date: lastDay,
                departure: next.arrival,
                departureTime: "",
                arrival: next.departure,
                arrivalTime: "",
                status: next.status,
                showInSchedule: next.showInSchedule,
              }));
              setTransportDirection("오는 편");
              setTransportDate(lastDay);
              setTransportDeparture(next.arrival);
              setTransportArrival(next.departure);
              setTransportDepartureTime("");
              setTransportArrivalTime("");
              setSheet("transport");
            },
          },
        ],
      );
    } else {
      setTransportDeparture("");
      setTransportDepartureTime("");
      setTransportArrival("");
      setTransportArrivalTime("");
      setSheet(null);
      notify("오는 편을 저장했어요");
    }
  };
  // 교통편 카드는 사람마다 한 장이다. 참가자에서 빠진 사람이 예매해 둔 편도
  // 사라지면 안 되니, 실제로 적힌 이용자를 뒤에 붙인다.
  const transportOwners = useMemo(() => {
    const extra = transportations
      .map((item) => item.owner)
      .filter((owner) => owner && !participants.includes(owner));
    return [...participants, ...new Set(extra)];
  }, [participants, transportations]);
  const transportColors = [
    theme?.secondary ?? "#55BFB4",
    theme?.accent ?? "#8B7CF6",
    theme?.primary ?? "#3F4C8F",
  ];
  const openTransportCreate = () => {
    const nextDraft = {
      owner: participants[0] ?? "",
      direction: "가는 편" as const,
      method: "KTX" as const,
      date: firstDay,
      departure: "",
      departureTime: "",
      arrival: "",
      arrivalTime: "",
      status: "예매 완료" as const,
      showInSchedule: true,
    };
    setTransportDraftBaseline(JSON.stringify(nextDraft));
    setEditingTransportId(null);
    setTransportOwner(nextDraft.owner);
    setTransportDirection("가는 편");
    setTransportMethod(nextDraft.method);
    setTransportDate(firstDay);
    setTransportDeparture("");
    setTransportDepartureTime("");
    setTransportArrival("");
    setTransportArrivalTime("");
    setTransportStatus("예매 완료");
    setTransportShowInSchedule(true);
    setTransportDetailsOpen(false);
    setSheet("transport");
  };
  const openTransportEdit = (item: Transportation) => {
    const nextDraft = {
      owner: item.owner,
      direction: item.direction,
      method: item.method,
      date: item.date,
      departure: item.departure,
      departureTime: item.departureTime === "시간 미정" ? "" : item.departureTime,
      arrival: item.arrival,
      arrivalTime: item.arrivalTime === "시간 미정" ? "" : item.arrivalTime,
      status: item.status,
      showInSchedule: item.showInSchedule,
    };
    setTransportDraftBaseline(JSON.stringify(nextDraft));
    setSelectedTransport(null);
    setEditingTransportId(item.id);
    setTransportOwner(item.owner);
    setTransportDirection(item.direction);
    setTransportMethod(item.method);
    setTransportDate(item.date);
    setTransportDeparture(item.departure);
    setTransportDepartureTime(item.departureTime === "시간 미정" ? "" : item.departureTime);
    setTransportArrival(item.arrival);
    setTransportArrivalTime(item.arrivalTime === "시간 미정" ? "" : item.arrivalTime);
    setTransportStatus(item.status);
    setTransportShowInSchedule(item.showInSchedule);
    setTransportDetailsOpen(item.owner !== participants[0] || item.status !== "예매 완료" || !item.showInSchedule);
    setSheet("transport");
  };
  const deleteTransportation = () => {
    const target = transportations.find((item) => item.id === editingTransportId);
    if (!target) return;
    setTransportations((current) => current.filter((item) => item.id !== target.id));
    setSchedule((current) => current.filter((item) => item.transportationId !== target.id));
    setEditingTransportId(null);
    setSheet(null);
    notify("교통편을 삭제했어요");
  };
  const openReservation = (reservation?: ReservationInfo) => {
    const nextDraft = reservation ?? blankReservation();
    setEditingReservationId(reservation?.id ?? null);
    setReservationDraft(nextDraft);
    setReservationDraftBaseline(JSON.stringify(nextDraft));
    setSheet("reservation");
  };
  const saveReservation = () => {
    if (!reservationDraft.name.trim()) return;
    const next = { ...reservationDraft, name: reservationDraft.name.trim() };
    setReservations((current) => editingReservationId
      ? current.map((reservation) => reservation.id === editingReservationId ? next : reservation)
      : [...current, next]);
    setSchedule((current) => {
      const withoutLinked = current.filter((item) => item.reservationId !== next.id);
      if (!next.showInSchedule) return withoutLinked;
      const linked: ScheduleItem = {
        time: `${weekdayOf(next.date)} · ${next.time || "시간 미정"}`,
        date: next.date,
        title: next.name,
        note: ["예약", next.status].filter(Boolean).join(" · "),
        mapUrl: "",
        reservationId: next.id,
      };
      const previousIndex = current.findIndex((item) => item.reservationId === next.id);
      if (previousIndex < 0) return [...current, linked];
      return current.map((item, index) => index === previousIndex ? linked : item);
    });
    setEditingReservationId(null);
    setSheet(null);
    notify(next.showInSchedule ? "예약을 저장하고 일정에 반영했어요" : "예약 정보를 저장했어요");
  };
  const deleteReservation = () => {
    if (!editingReservationId) return;
    setSchedule((current) => current.filter((item) => item.reservationId !== editingReservationId));
    setReservations((current) => current.filter((reservation) => reservation.id !== editingReservationId));
    setEditingReservationId(null);
    setSheet(null);
    notify("예약 정보를 삭제했어요");
  };
  const openStay = (create = false) => {
    const nextDraft = create
      ? { name: "", checkin: `${firstDate} 15:00`, checkout: `${lastDate} 11:00`, address: "", showInSchedule: true }
      : registeredStay;
    setStayDraftBaseline(JSON.stringify(nextDraft));
    setStayDraft(nextDraft);
    setSheet("stay");
  };
  const updateStayDateTime = (
    field: "checkin" | "checkout",
    part: "date" | "time",
    value: string,
  ) => {
    setStayDraft((current) => {
      const saved = current[field];
      const savedTime = saved.match(/\d{1,2}:\d{2}$/)?.[0];
      const savedDate = saved.replace(/\s*\d{1,2}:\d{2}$/, "").trim();
      const fallbackDate = field === "checkin" ? firstDate : lastDate;
      const fallbackTime = field === "checkin" ? "15:00" : "11:00";
      const nextDate = part === "date" ? value : savedDate || fallbackDate;
      const nextTime = part === "time" ? value : savedTime || fallbackTime;
      return { ...current, [field]: `${nextDate} ${nextTime}` };
    });
  };
  const saveStay = () => {
    const previousName = registeredStay.name;
    const linkedPlace = places.find(
      (place) =>
        place.category === "숙소" &&
        (place.id === registeredStay.placeId || place.name === previousName || place.name === stayDraft.name),
    );
    const stayPlaceId = registeredStay.placeId ?? linkedPlace?.id ?? `place-stay-${Date.now()}`;
    setRegisteredStay({ ...stayDraft, placeId: stayPlaceId, showInSchedule: stayDraft.showInSchedule ?? true });
    setPlaces((current) => {
      const match = current.find(
        (place) =>
          place.category === "숙소" &&
          (place.id === stayPlaceId || place.name === previousName || place.name === stayDraft.name),
      );
      if (match) {
        return current.map((place) =>
          place.id === match.id
            ? {
                ...place,
                name: stayDraft.name,
                address: stayDraft.address,
                area: placeAreaFromAddress(stayDraft.address, place.area),
              }
            : place,
        );
      }
      return [
        ...current,
        {
          id: stayPlaceId,
          name: stayDraft.name,
          area: placeAreaFromAddress(stayDraft.address),
          address: stayDraft.address,
          category: "숙소",
          mapUrl: "",
          tags: ["숙소"],
          status: "후보",
        },
      ];
    });
    setSheet(null);
    notify("숙소 정보를 저장했어요");
  };
  const deleteStay = () => {
    setRegisteredStay({ name: "", checkin: "", checkout: "", address: "", showInSchedule: false });
    setSheet(null);
    notify("대표 숙소에서 해제했어요");
  };
  return (
    <View>
      <TabActionHeader
        label="여행 일정"
        count={`${schedule.length}개`}
        action="일정 추가"
        onPress={openScheduleCreate}
      />
      <View
        style={[
          styles.timelineCard,
          styles.travelTimelineCard,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        {scheduleGroups[0] && (
          <View style={[styles.travelTimelineHead, theme && { backgroundColor: theme.primarySoft }]}>
            <View>
              <Text style={[styles.travelTimelineEyebrow, theme && { color: theme.primary }]}>{firstScheduleDayLabel}</Text>
              <Text style={[styles.travelTimelineDate, theme && { color: theme.text }]}>{scheduleGroups[0].date}</Text>
            </View>
            <Text style={[styles.travelTimelineCount, theme && { color: theme.primary }]}>{scheduleGroups[0].items.length}개 일정</Text>
          </View>
        )}
        <View style={styles.travelTimelineItems}>
        {scheduleGroups[0]?.items.slice(0, 3).map((item, index) => (
          <Moment
            key={`${item.time}-${index}`}
            {...item}
            time={item.time.split("·").at(-1)?.trim() || item.time}
            last={index === Math.min(scheduleGroups[0].items.length, 3) - 1}
            compact
            onPress={() => openScheduleEdit(item, schedule.indexOf(item))}
          />
        ))}
        </View>
        {schedule.length === 0 && (
          <EmptyState
            title="아직 일정이 없어요"
            description="첫 일정을 추가해 여행의 흐름을 만들어 보세요."
            action="일정 추가"
            onPress={openScheduleCreate}
          />
        )}
        {/* 카드가 앞의 세 개를 이미 보여준다. 그 이하면 '전체'가 지금 보는
            것과 같은 말이라, 눌러야 하나 하고 한 번 멈추게 된다. 일정 수가 아니라
            실제로 그린 수와 견줘야, 첫날이 비고 이튿날에만 세 개가 있을 때
            나머지 날을 여는 길이 사라지지 않는다. */}
        {schedule.length > shownScheduleCount && (
          <Pressable
            onPress={() => setFullSchedule(true)}
            style={[
              styles.fullScheduleButton,
              theme && { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={[styles.fullScheduleText, theme && { color: theme.text }]}>일정 {schedule.length}개 모두 보기</Text>
            <Glyph name="arrowRight" size={16} color={theme?.primary ?? "#3F4C8F"} />
          </Pressable>
        )}
      </View>

      <SectionLabel
        label="교통편"
        count={`${transportations.length}편`}
        action="교통편 추가"
        onPress={openTransportCreate}
      />
      <View style={styles.transportGrid}>
        {transportOwners.map((owner, index) => {
          const outbound = transportations.find((item) => item.owner === owner && item.direction === "가는 편");
          const inbound = transportations.find((item) => item.owner === owner && item.direction === "오는 편");
          if (!outbound && !inbound) return null;
          return (
            <TransportCard
              key={owner}
              owner={owner}
              outbound={outbound}
              inbound={inbound}
              color={transportColors[index % transportColors.length]}
              onPress={() => setSelectedTransport(outbound ?? inbound ?? null)}
            />
          );
        })}
      </View>
      {transportations.length === 0 && (
        <EmptyState
          title="등록한 교통편이 없어요"
          description="타고 갈 편을 적어 두면 일정에도 같이 올릴 수 있어요."
          action="교통편 추가"
          onPress={openTransportCreate}
        />
      )}

      <SectionLabel
        label="여행 정보"
        count={`${reservations.length + Number(hasStay) + Number(hasKitchen)}개`}
        action="예약 추가"
        onPress={() => openReservation()}
      />
      <View style={styles.travelInfoList}>
        {reservations.map((reservation) => (
          <TravelInfoRow
            key={reservation.id}
            label="예약"
            mark={dayNumberOf(reservation.date)}
            title={reservation.name}
            meta={`${reservation.date} ${reservation.time || "시간 미정"} · ${reservation.people}`}
            badge={reservation.status}
            color={theme?.primary ?? "#FF6B63"}
            onPress={() => openReservation(reservation)}
          />
        ))}
        <View style={styles.travelInfoPair}>
          {hasStay && (
            <TravelMiniCard
              label="대표 숙소"
              mark={registeredStay.checkin.match(/(\d+)일/)?.[1] ?? "숙소"}
              title={registeredStay.name}
              meta={`${registeredStay.checkin} 체크인`}
              color={theme?.secondary ?? "#55BFB4"}
              onPress={() => openStay()}
              large
            />
          )}
          {hasKitchen && (
            <TravelMiniCard
              label="요리"
              mark="한 끼"
              title={recipes[0]?.name ?? "메뉴 정하기"}
              meta={
                recipes.length
                  ? `재료 ${recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)}개`
                  : "무엇을 해 먹을까요"
              }
              color={theme?.accent ?? "#8B7CF6"}
              onPress={() => setMode("요리")}
              large={!hasStay}
            />
          )}
        </View>
        {reservations.length === 0 && (
          <EmptyState title="예약 정보가 없어요" description="식당이나 행사 예약을 기록해 두세요." action="예약 추가" onPress={() => openReservation()} />
        )}
        {!hasStay && (
          <EmptyState title="대표 숙소가 없어요" description="체크인과 체크아웃 정보를 기록해 두세요." action="숙소 추가" onPress={() => openStay(true)} />
        )}
      </View>

      {/* 남은 게 없으면 재촉할 것도 없다. 숫자는 실제 목록에서 센다. */}
      {packingRemaining > 0 && (
      <Pressable
        onPress={() => setMode("준비")}
        style={[
          styles.readyNudge,
          theme && {
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
          },
        ]}
      >
        <View>
          <Text style={[styles.readyEyebrow, theme && { color: theme.primary }]}>출발 전 확인</Text>
          <Text style={[styles.readyText, theme && { color: theme.text }]}>
            준비물 {packingRemaining}개가 남아 있어요.
          </Text>
        </View>
        <Glyph name="arrowRight" size={16} color={theme?.primary ?? "#3F4C8F"} />
      </Pressable>
      )}
      <DetailSheet
        visible={sheet === "schedule"}
        title={editingScheduleIndex === null ? "일정 추가" : "일정 수정"}
        subtitle="일정 이름만 입력해도 추가할 수 있어요"
        submit={editingScheduleIndex === null ? "일정 추가" : "변경 저장"}
        disabledHint={!scheduleFormValid ? "일정 이름을 입력해 주세요" : undefined}
        destructiveLabel={editingScheduleIndex === null ? undefined : "일정 삭제"}
        destructiveMessage={newPlanTitle ? `${newPlanTitle} 일정을 삭제해요.` : undefined}
        submitDisabled={!scheduleFormValid}
        hasUnsavedChanges={scheduleDraftChanged}
        onClose={() => setSheet(null)}
        onSubmit={addSchedule}
        onDestructive={deleteSchedule}
      >
        <View style={[styles.planPreview, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.previewDate, theme && { backgroundColor: theme.primary }]}>
            <Text style={styles.previewDay}>{weekdayOf(planDay)}</Text>
            <Text style={styles.previewDateNo}>{dayNumberOf(planDay)}</Text>
          </View>
          <View style={styles.previewBody}>
            <Text style={[styles.previewType, theme && { color: theme.primary }]}>
              {planType} · {planTime || "시간 미정"}
            </Text>
            <Text numberOfLines={1} style={[styles.previewTitle, theme && { color: theme.text }]}>
              {newPlanTitle || "어떤 일정인가요?"}
            </Text>
            <Text numberOfLines={1} style={[styles.previewPlace, theme && { color: theme.muted }]}>
              {planPlace || "장소 미정"}
            </Text>
          </View>
        </View>
        {places.length > 0 && (
          <View style={styles.savedPlacePicker}>
            <View style={styles.savedPlacePickerHead}>
              <View>
                <Text style={[styles.detailFieldLabel, theme && { color: theme.muted }]}>저장한 장소에서 선택</Text>
                <Text style={[styles.savedPlacePickerHint, theme && { color: theme.muted }]}>고르면 이름과 위치를 바로 채워드려요</Text>
              </View>
              {selectedPlanPlaceId && (
                <Pressable
                  onPress={() => setSelectedPlanPlaceId(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="저장한 장소 선택 해제"
                >
                  <Text style={[styles.savedPlaceClear, theme && { color: theme.primary }]}>선택 해제</Text>
                </Pressable>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedPlacePickerRow}>
              {places.map((place) => {
                const selected = selectedPlanPlaceId === place.id;
                return (
                  <Pressable
                    key={place.id}
                    onPress={() => chooseSavedPlace(place)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${place.name}, ${place.category}`}
                    style={[
                      styles.savedPlaceChoice,
                      theme && { backgroundColor: theme.surface, borderColor: theme.border },
                      selected && theme && { backgroundColor: theme.primarySoft, borderColor: theme.primary },
                    ]}
                  >
                    <Text numberOfLines={1} style={[styles.savedPlaceChoiceName, theme && { color: theme.text }, selected && theme && { color: theme.primary }]}>{place.name}</Text>
                    <Text numberOfLines={1} style={[styles.savedPlaceChoiceMeta, theme && { color: theme.muted }]}>{place.category} · {place.area}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
        <DetailField
          label="일정 이름 · 필수"
          value={newPlanTitle}
          onChangeText={setNewPlanTitle}
          placeholder="예: 한옥마을 야행"
        />
        <OptionField
          label="날짜"
          options={dayOptions}
          value={planDay}
          onChange={setPlanDay}
        />
        <OptionField
          label="종류"
          options={["장소", "식사", "이동", "예약", "행사"]}
          value={planType}
          onChange={setPlanType}
        />
        <TimePickerField
          label="시간 · 선택 사항"
          value={planTime}
          onChange={setPlanTime}
          fallback="11:00"
          optional
        />
        <OptionalFormSection
          label="장소와 지도"
          summary={planPlace || planMapUrl ? "입력한 세부 정보가 있어요" : "필요할 때만 추가하세요"}
          open={scheduleDetailsOpen}
          onToggle={() => setScheduleDetailsOpen((current) => !current)}
        >
          <DetailField
            label="장소 · 선택 사항"
            value={planPlace}
            onChangeText={setPlanPlace}
            placeholder="예: 한옥마을 정문"
          />
          <View style={[styles.naverField, theme?.dark && { backgroundColor: "#16352C", borderColor: "#245544" }]}>
            <View style={styles.naverHead}>
              <View style={styles.naverLogo}>
                <Text style={styles.naverLogoText}>N</Text>
              </View>
              <View>
                <Text style={[styles.naverTitle, theme?.dark && { color: "#DDF7E9" }]}>네이버 지도 링크 · 선택</Text>
                <Text style={[styles.naverHint, theme?.dark && { color: "#96B7A8" }]}>
                  네이버 지도에서 공유한 링크를 붙여넣으세요
                </Text>
              </View>
            </View>
            <TextInput
              value={planMapUrl}
              onChangeText={setPlanMapUrl}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https://naver.me/..."
              placeholderTextColor={theme?.dark ? theme.muted : "#91A19B"}
              style={[styles.naverInput, theme?.dark && { backgroundColor: theme.surface, color: theme.text }]}
            />
            {planMapUrl.length > 0 && (
              <Text style={styles.linkState}>
                {planMapUrl.includes("naver.")
                  ? "네이버 지도 링크가 연결돼요"
                  : "네이버 지도 공유 링크인지 확인해 주세요"}
              </Text>
            )}
          </View>
        </OptionalFormSection>
      </DetailSheet>
      <DetailSheet
        visible={sheet === "transport"}
        title={editingTransportId ? "교통편 수정" : "교통편 추가"}
        subtitle="가는 편과 오는 편을 나누어 저장하고 한곳에서 확인하세요"
        submit={transportSubmitLabel}
        disabledHint={transportDisabledHint}
        destructiveLabel={editingTransportId ? "교통편 삭제" : undefined}
        destructiveMessage="연결된 일정에서도 함께 삭제돼요."
        submitDisabled={!transportFormValid}
        hasUnsavedChanges={transportDraftChanged}
        onClose={() => setSheet(null)}
        onSubmit={addTransportation}
        onDestructive={deleteTransportation}
      >
        <View
          style={[
            styles.transportFormPreview,
            { backgroundColor: transportDirectionSoft, borderColor: `${transportDirectionColor}66` },
          ]}
        >
          <Text style={[styles.transportFormOwner, { color: transportDirectionColor }]}>{transportOwner} · {transportDirection}</Text>
          <View style={styles.transportPreviewRouteRow}>
            <Text style={[styles.transportFormRoute, theme && { color: theme.text }]}>{transportDeparture || "출발지"} → {transportArrival || "도착지"}</Text>
          </View>
          <Text style={[styles.transportFormMeta, theme && { color: theme.muted }]}>{transportMethod} · {transportDepartureTime || "시간 미정"}</Text>
        </View>
        <OptionField
          label="방향"
          options={["가는 편", "오는 편"]}
          value={transportDirection}
          onChange={(value) => {
            if (value !== transportDirection) switchTransportDirection();
          }}
        />
        <OptionField label="교통수단" options={["KTX", "SRT", "버스", "항공", "기타"]} value={transportMethod} onChange={(value) => setTransportMethod(value as Transportation["method"])} />
        <OptionField label="날짜" options={dayOptions} value={transportDate} onChange={setTransportDate} />
        <PairedDetailField
          label="이동 경로 · 필수"
          leftValue={transportDeparture}
          rightValue={transportArrival}
          onChangeLeft={setTransportDeparture}
          onChangeRight={setTransportArrival}
          leftPlaceholder="출발지"
          rightPlaceholder="도착지"
          onSwap={switchTransportDirection}
          accentColor={transportDirectionColor}
          accentSoft={transportDirectionSoft}
        />
        <PairedTimePickerField
          label="출발·도착 시간 · 선택 사항"
          leftValue={transportDepartureTime}
          rightValue={transportArrivalTime}
          onChangeLeft={setTransportDepartureTime}
          onChangeRight={setTransportArrivalTime}
        />
        <OptionalFormSection
          label="이용자·예매 설정"
          summary={`${transportOwner} · ${transportStatus}${transportShowInSchedule ? " · 일정 표시" : ""}`}
          open={transportDetailsOpen}
          onToggle={() => setTransportDetailsOpen((current) => !current)}
        >
          <OptionField label="이용자" options={transportOwners} value={transportOwner} onChange={setTransportOwner} />
          <OptionField label="예매 상태" options={["예매 완료", "예매 전"]} value={transportStatus} onChange={(value) => setTransportStatus(value as Transportation["status"])} />
          <OptionField
            label="여행 일정 표시"
            options={["일정에도 표시", "교통 정보만 저장"]}
            value={transportShowInSchedule ? "일정에도 표시" : "교통 정보만 저장"}
            onChange={(value) => setTransportShowInSchedule(value === "일정에도 표시")}
          />
        </OptionalFormSection>
      </DetailSheet>
      <InfoPanel
        visible={selectedTransport !== null}
        title={`${selectedTransport?.owner ?? ""}의 교통편`}
        onClose={() => setSelectedTransport(null)}
      >
        {transportations
          .filter((item) => item.owner === selectedTransport?.owner)
          .map((item) => (
            <View key={item.id} style={[styles.transportDetailBlock, theme && { borderColor: theme.border }]}>
              <Text style={[styles.transportDetailDirection, theme && { color: theme.primary }]}>{item.direction} · {item.status}</Text>
              <InfoLine label="교통수단" value={item.method} />
              <InfoLine label="출발" value={`${item.date} · ${item.departure} ${item.departureTime}`} />
              <InfoLine label="도착" value={`${item.arrival} ${item.arrivalTime}`} />
              <InfoLine label="여행 일정" value={item.showInSchedule ? "일정에 표시 중" : "교통 정보만 저장"} />
              <Pressable onPress={() => openTransportEdit(item)} style={[styles.infoManageButton, theme && { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.infoManageButtonText, theme && { color: theme.primary }]}>이 교통편 수정</Text>
              </Pressable>
            </View>
          ))}
      </InfoPanel>
      <DetailSheet
        visible={sheet === "reservation"}
        title={editingReservation ? "예약 정보 수정" : "예약 정보 추가"}
        subtitle="예약 이름만 입력해도 저장할 수 있어요"
        submit={editingReservation ? "변경 저장" : "예약 추가"}
        disabledHint={!reservationDraft.name.trim() ? "예약 이름을 입력해 주세요" : undefined}
        submitDisabled={!reservationDraft.name.trim()}
        destructiveLabel={editingReservation ? "예약 정보 삭제" : undefined}
        destructiveMessage="연결된 일정에서도 함께 삭제돼요."
        hasUnsavedChanges={reservationDraftChanged}
        onClose={() => setSheet(null)}
        onSubmit={saveReservation}
        onDestructive={deleteReservation}
      >
        <DetailField label="예약 이름 · 필수" value={reservationDraft.name} onChangeText={(name) => setReservationDraft((current) => ({ ...current, name }))} placeholder="예: 소나기식당" />
        <OptionField label="예약 날짜" options={dayOptions} value={reservationDraft.date} onChange={(date) => setReservationDraft((current) => ({ ...current, date }))} />
        <TimePickerField label="예약 시간 · 선택 사항" value={reservationDraft.time} onChange={(time) => setReservationDraft((current) => ({ ...current, time }))} fallback="19:00" optional />
        <DetailField label="인원 · 선택 사항" value={reservationDraft.people} onChangeText={(people) => setReservationDraft((current) => ({ ...current, people }))} placeholder="예: 2명" />
        <OptionField label="예약 상태" options={["예약 확정", "확인 필요", "취소"]} value={reservationDraft.status} onChange={(status) => setReservationDraft((current) => ({ ...current, status: status as ReservationInfo["status"] }))} />
        <DetailField label="장소 · 선택 사항" value={reservationDraft.place} onChangeText={(place) => setReservationDraft((current) => ({ ...current, place }))} placeholder="예: 전주 한옥마을" />
        <OptionField
          label="여행 일정 표시"
          options={["일정에도 표시", "예약 정보만 저장"]}
          value={reservationDraft.showInSchedule ? "일정에도 표시" : "예약 정보만 저장"}
          onChange={(value) => setReservationDraft((current) => ({ ...current, showInSchedule: value === "일정에도 표시" }))}
        />
      </DetailSheet>
      <DetailSheet
        visible={sheet === "stay"}
        title={hasStay ? "대표 숙소 수정" : "대표 숙소 추가"}
        subtitle="이번 여행에서 머무를 대표 숙소와 이용 시간을 기록하세요"
        submit={hasStay ? "변경 저장" : "숙소 추가"}
        disabledHint={!stayDraft.name.trim() ? "숙소 이름을 입력해 주세요" : !stayFormValid ? "체크아웃 시간을 다시 확인해 주세요" : undefined}
        submitDisabled={!stayFormValid}
        destructiveLabel={hasStay ? "대표 숙소 해제" : undefined}
        destructiveMessage="저장한 장소는 남고 체크인 일정만 함께 사라져요."
        hasUnsavedChanges={stayDraftChanged}
        onClose={() => setSheet(null)}
        onSubmit={saveStay}
        onDestructive={deleteStay}
      >
        <DetailField label="숙소 이름 · 필수" value={stayDraft.name} onChangeText={(name) => setStayDraft((current) => ({ ...current, name }))} placeholder="예: 달빛한옥" />
        <StayDateTimePicker
          label="체크인"
          value={stayDraft.checkin}
          dates={dateOptions}
          onDateChange={(value) => updateStayDateTime("checkin", "date", value)}
          onTimeChange={(value) => updateStayDateTime("checkin", "time", value)}
        />
        <StayDateTimePicker
          label="체크아웃"
          value={stayDraft.checkout}
          dates={dateOptions}
          onDateChange={(value) => updateStayDateTime("checkout", "date", value)}
          onTimeChange={(value) => updateStayDateTime("checkout", "time", value)}
        />
        <DetailField label="주소 · 선택 사항" value={stayDraft.address} onChangeText={(address) => setStayDraft((current) => ({ ...current, address }))} placeholder="숙소 주소" />
        <OptionField
          label="여행 일정 표시"
          options={["체크인 일정 표시", "숙소 정보만 저장"]}
          value={stayDraft.showInSchedule === false ? "숙소 정보만 저장" : "체크인 일정 표시"}
          onChange={(value) => setStayDraft((current) => ({ ...current, showInSchedule: value === "체크인 일정 표시" }))}
        />
      </DetailSheet>
      <InfoPanel
        visible={fullSchedule}
        title={`전체 일정 · ${schedule.length}`}
        onClose={() => setFullSchedule(false)}
      >
        <View style={styles.fullScheduleList}>
          {scheduleGroups.map((group) => (
            <View
              key={group.date}
              style={[
                styles.scheduleDayGroup,
                theme && { backgroundColor: theme.surface, shadowColor: theme.dark ? "#000000" : theme.text },
              ]}
            >
              <View style={[styles.scheduleDayHead, theme && { backgroundColor: theme.primarySoft }]}>
                <View style={styles.scheduleDayHeadCopy}>
                  <Text style={[styles.scheduleDayLabel, theme && { color: theme.primary }]}>여행 날짜</Text>
                  <Text style={[styles.scheduleDayTitle, theme && { color: theme.text }]}>{group.date}</Text>
                </View>
                <View style={[styles.scheduleDayCountBadge, theme && { backgroundColor: theme.surface }]}>
                  <Text style={[styles.scheduleDayCount, theme && { color: theme.primary }]}>{group.items.length}개 일정</Text>
                </View>
              </View>
              {group.items.map((item, index) => (
                <View
                  key={`full-${item.time}-${schedule.indexOf(item)}`}
                  style={[
                    styles.scheduleDayItem,
                    index > 0 && styles.scheduleDayItemGap,
                  ]}
                >
                  <Moment
                    {...item}
                    time={item.time.split("·").at(-1)?.trim() || item.time}
                    last={index === group.items.length - 1}
                    onPress={() => {
                      setFullSchedule(false);
                      openScheduleEdit(item, schedule.indexOf(item));
                    }}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      </InfoPanel>
    </View>
  );
}

function Places({
  schedule,
  setSchedule,
  places,
  setPlaces,
  registeredStayName,
  onRegisterStay,
  onUpdateRegisteredStay,
  onRemoveRegisteredStay,
  dayOptions,
}: {
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  places: PlaceItem[];
  setPlaces: React.Dispatch<React.SetStateAction<PlaceItem[]>>;
  registeredStayName: string;
  onRegisterStay: (place: PlaceItem) => void;
  onUpdateRegisteredStay: (place: PlaceItem) => void;
  onRemoveRegisteredStay: () => void;
  dayOptions: string[];
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const [filter, setFilter] = useState<"전체" | "후보" | "일정" | "숙소">("전체");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [placeFiltersOpen, setPlaceFiltersOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [planningPlace, setPlanningPlace] = useState<PlaceItem | null>(null);
  const [planningDay, setPlanningDay] = useState(dayOptions[Math.min(1, dayOptions.length - 1)]);
  const [planningTime, setPlanningTime] = useState("11:00");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("식당");
  const [mapUrl, setMapUrl] = useState("");
  const [resolvingNaver, setResolvingNaver] = useState(false);
  const [tagText, setTagText] = useState("");
  const [placeDetailsOpen, setPlaceDetailsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  // 교체는 저장해 둔 것을 통째로 지운다. 되돌릴 수 없으니 기본은 추가로 둔다.
  const [importMode, setImportMode] = useState<"교체" | "추가">("추가");
  const [showAllPlaces, setShowAllPlaces] = useState(false);
  const placeDraftKey = (
    draftName: string,
    draftAddress: string,
    draftCategory: string,
    draftMapUrl: string,
    draftTagText: string,
  ) => JSON.stringify([
    draftName,
    draftAddress,
    draftCategory,
    draftMapUrl,
    draftTagText,
  ]);
  const [placeDraftBaseline, setPlaceDraftBaseline] = useState(
    placeDraftKey("", "", "식당", "", ""),
  );
  const placeDraftChanged = placeDraftKey(
    name,
    address,
    category,
    mapUrl,
    tagText,
  ) !== placeDraftBaseline;
  const allTags = useMemo(
    () => Array.from(new Set(places.flatMap((place) => place.tags))),
    [places],
  );
  useEffect(() => {
    // 목록 교체로 사라진 태그가 필터에 남지 않게 한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tagFilter && !allTags.includes(tagFilter)) setTagFilter(null);
  }, [allTags, tagFilter]);
  const statusPlaces = filter === "전체"
    ? places
    : filter === "숙소"
      // 대표로 고른 한 곳만 남기면 후보 숙소를 견줄 수가 없다. 숙소를 다 보여
      // 주고 대표인 곳은 카드에서 따로 표시한다.
      ? places.filter((place) => place.category === "숙소" || place.name === registeredStayName)
      : places.filter((place) => place.status === filter);
  const taggedPlaces = tagFilter
    ? statusPlaces.filter((place) => place.tags.includes(tagFilter))
    : statusPlaces;
  const visible = taggedPlaces.filter((place) =>
    `${place.name} ${place.area} ${place.address ?? ""} ${place.category} ${place.tags.join(" ")}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const displayedPlaces = showAllPlaces ? visible : visible.slice(0, 6);
  const draftTags = tagText
    .split(/[,#\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
  const duplicatePlace = places.some(
    (place) => place.id !== editingId && place.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const placeFormValid = Boolean(name.trim()) && !duplicatePlace;
  const addTag = (tag: string) => {
    if (!draftTags.includes(tag))
      setTagText((value) => (value.trim() ? `${value}, ${tag}` : tag));
  };
  const pasteNaverShare = async () => {
    const clipboard = await Clipboard.getStringAsync();
    if (!clipboard.trim()) {
      notify("복사한 네이버 지도 정보가 없어요");
      return;
    }
    const parsed = parseNaverPlaceShare(clipboard);
    if (!parsed) {
      notify("네이버 지도 공유 텍스트나 링크를 확인해 주세요");
      return;
    }
    if (parsed.name) setName(parsed.name);
    if (parsed.address) setAddress(parsed.address);
    setMapUrl(parsed.url);
    setPlaceDetailsOpen(true);
    setResolvingNaver(true);
    const resolved = await resolveNaverPlaceShare(clipboard);
    setResolvingNaver(false);
    if (!resolved) return;
    if (resolved.name) setName(resolved.name);
    if (resolved.address) setAddress(resolved.address);
    if (resolved.category && ["식당", "카페", "구경", "쇼핑", "숙소"].includes(resolved.category)) {
      setCategory(resolved.category);
    }
    setMapUrl(resolved.url);
    notify(resolved.name || resolved.address ? "장소 정보를 자동으로 채웠어요" : "네이버 지도 링크를 연결했어요");
  };
  const resetForm = () => {
    setName("");
    setAddress("");
    setCategory("식당");
    setMapUrl("");
    setTagText("");
    setPlaceDetailsOpen(false);
    setEditingId(null);
  };
  const openCreate = () => {
    setPlaceDraftBaseline(placeDraftKey("", "", "식당", "", ""));
    resetForm();
    setAdding(true);
  };
  const openEdit = (place: PlaceItem) => {
    setPlaceDraftBaseline(placeDraftKey(
      place.name,
      place.address ?? "",
      place.category,
      place.mapUrl,
      place.tags.join(", "),
    ));
    setEditingId(place.id);
    setName(place.name);
    setAddress(place.address ?? "");
    setCategory(place.category);
    setMapUrl(place.mapUrl);
    setTagText(place.tags.join(", "));
    setPlaceDetailsOpen(Boolean(place.address || place.mapUrl || place.tags.length));
    setAdding(true);
  };
  const savePlace = () => {
    if (!name.trim()) return;
    const wasEditing = Boolean(editingId);
    const previousPlace = places.find((place) => place.id === editingId);
    const next = {
      // 사용자 저장 이벤트 안에서만 만드는 로컬 식별자다.
      // eslint-disable-next-line react-hooks/purity
      id: editingId ?? `place-${Date.now()}`,
      name: name.trim(),
      area: placeAreaFromAddress(address, previousPlace?.area),
      address: address.trim(),
      category,
      mapUrl: mapUrl.trim(),
      tags: draftTags,
      status: editingId
        ? places.find((place) => place.id === editingId)?.status || "후보"
        : "후보",
    } as PlaceItem;
    setPlaces((current) =>
      editingId
        ? current.map((place) => (place.id === editingId ? next : place))
        : [...current, next],
    );
    if (editingId) {
      setSchedule((current) => current.map((item) =>
        item.placeId === editingId
          ? {
              ...item,
              title: previousPlace && item.title === `${previousPlace.name} 체크인`
                ? `${next.name} 체크인`
                : next.name,
              note: previousPlace && item.title === `${previousPlace.name} 체크인`
                ? item.note
                : `${next.category} · ${next.area}`,
              mapUrl: next.mapUrl,
            }
          : item,
      ));
    }
    const editedRepresentative = previousPlace?.name === registeredStayName;
    if (editedRepresentative) {
      if (next.category === "숙소") onUpdateRegisteredStay(next);
      else onRemoveRegisteredStay();
    }
    resetForm();
    setAdding(false);
    notify(wasEditing ? "장소 정보를 수정했어요" : "장소를 저장했어요");
  };
  const deletePlace = () => {
    if (!editingId) return;
    const target = places.find((place) => place.id === editingId);
    if (!target) return;
    const linkedScheduleCount = schedule.filter(
      (item) => item.placeId === target.id,
    ).length;
    setPlaces((current) => current.filter((place) => place.id !== editingId));
    if (linkedScheduleCount) {
      setSchedule((current) => current.filter((item) => item.placeId !== target.id));
    }
    if (target.name === registeredStayName) onRemoveRegisteredStay();
    setAdding(false);
    resetForm();
    notify("장소를 삭제했어요");
  };
  const choose = (index: number) => {
    const target = visible[index];
    if (target.status === "일정") return;
    setPlanningPlace(target);
  };
  const confirmPlan = () => {
    if (!planningPlace) return;
    setSchedule((current) => [...current, {
      time: `${weekdayOf(planningDay)} · ${planningTime || "시간 미정"}`,
      date: planningDay,
      title: planningPlace.name,
      note: `${planningPlace.category} · ${planningPlace.area}`,
      mapUrl: planningPlace.mapUrl,
      placeId: planningPlace.id,
    }]);
    setPlaces((current) =>
      current.map((place) =>
        place.id === planningPlace.id
          ? { ...place, status: "일정" }
          : place,
      ),
    );
    setPlanningPlace(null);
    notify("여행 일정에 담았어요");
  };
  const copyPlaces = async () => {
    await Clipboard.setStringAsync(
      places
        .map(
          (place) =>
            `${place.name} | ${place.area} | ${place.address ?? ""} | ${place.category} | ${place.tags.map((tag) => `#${tag}`).join(" ")} | ${place.mapUrl}`,
        )
        .join("\n"),
    );
    notify("장소 목록을 복사했어요");
  };
  const openImport = async () => {
    setImportText(await Clipboard.getStringAsync());
    setImporting(true);
  };
  const importPlaces = () => {
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const fields = line.split("|").map((value) => value.trim());
        const [rawName, rawArea = "지역 미정"] = fields;
        const isNewFormat = fields.length >= 6;
        const rawAddress = isNewFormat ? fields[2] : "";
        const rawCategory = fields[isNewFormat ? 3 : 2] || "장소";
        const rawTags = fields[isNewFormat ? 4 : 3] || "";
        const rawUrl = fields[isNewFormat ? 5 : 4] || "";
        return {
          id: `place-import-${Date.now()}-${index}`,
          name: rawName,
          area: rawArea,
          address: rawAddress,
          category: rawCategory,
          tags: rawTags.split(/[# ,]+/).filter(Boolean),
          mapUrl: rawUrl,
          status: "후보" as const,
        };
      })
      .filter((place, index, items) =>
        Boolean(place.name) &&
        items.findIndex((item) => item.name.toLowerCase() === place.name.toLowerCase()) === index,
      );
    if (!parsed.length) return;
    const existingNames = new Set(places.map((place) => place.name.toLowerCase()));
    const additions = importMode === "교체"
      ? parsed
      : parsed.filter((place) => !existingNames.has(place.name.toLowerCase()));
    setPlaces((current) => importMode === "교체" ? additions : [...current, ...additions]);
    if (importMode === "교체" && registeredStayName && !additions.some((place) => place.name === registeredStayName)) {
      onRemoveRegisteredStay();
    }
    setImporting(false);
    notify(additions.length ? `장소 ${additions.length}개를 반영했어요` : "이미 저장한 장소뿐이에요");
  };

  return (
    <View>
      <TabActionHeader
        label="저장한 장소"
        count={`${places.length}개`}
        action="장소 추가"
        onPress={openCreate}
      />
      <View style={[styles.placeControlPanel, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.placeToolbar}>
        <View style={styles.placeFilters}>
          {(["전체", "후보", "일정", "숙소"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              accessibilityRole="button"
              accessibilityLabel={item === "후보" ? "저장한 후보 장소" : item}
              accessibilityState={{ selected: filter === item }}
              style={[
                styles.placeFilter,
                theme && { borderColor: theme.border },
                filter === item &&
                  theme && { backgroundColor: theme.primarySoft },
              ]}
            >
              <Text
                style={[
                  styles.placeFilterText,
                  filter === item && styles.placeFilterTextActive,
                  filter === item && theme && { color: theme.primary },
                ]}
              >
                  {item === "후보" ? "저장" : item}
              </Text>
            </Pressable>
          ))}
        </View>
        {(places.length > 5 || allTags.length > 0) && (
          <Pressable
            onPress={() => setPlaceFiltersOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: placeFiltersOpen }}
            accessibilityLabel="장소 검색과 태그 필터"
            style={[styles.placeFilterMoreButton, theme && { backgroundColor: theme.surfaceAlt }]}
          >
            <Glyph name={placeFiltersOpen ? "chevronDown" : "search"} size={15} color={theme?.primary ?? "#3F4C8F"} weight={2.2} />
            <Text style={[styles.placeFilterMoreText, theme && { color: theme.primary }]}>찾기</Text>
          </Pressable>
        )}
      </View>
      {/* 다섯 곳 이하면 목록이 한눈에 들어온다. 찾을 게 없는데 검색창이
          먼저 나오면 목록이 그만큼 밀린다. 찾는 중이면 남긴다. */}
      {(placeFiltersOpen || query.length > 0 || tagFilter !== null) && (
      <>
      <View
        style={[
          styles.placeSearch,
          theme && {
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
          },
        ]}
      >
        <Glyph name="search" size={18} color={theme?.muted ?? "#646C7A"} weight={1.8} />
        <TextInput
          accessibilityLabel="저장한 장소 검색"
          value={query}
          onChangeText={setQuery}
          placeholder="장소, 지역, 태그 검색"
          placeholderTextColor={theme?.muted ?? "#9AA1AE"}
          style={[styles.placeSearchInput, theme && { color: theme.text }]}
        />
        {/* 걸러진 상태에서만 센다. 전체일 때는 위 머리글의 개수와 같은 말이 된다. */}
        {visible.length !== places.length && (
          <View style={[styles.resultCount, theme && { backgroundColor: theme.primarySoft }]}>
            <Text style={[styles.resultCountText, theme && { color: theme.primary }]}>{visible.length}</Text>
          </View>
        )}
      </View>
      <View style={styles.tagFilterRow}>
        <Pressable
          onPress={() => setTagFilter(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: tagFilter === null }}
          style={[
            styles.tagFilterChip,
            tagFilter === null && styles.tagFilterChipActive,
            tagFilter === null &&
              theme && { backgroundColor: theme.primarySoft },
          ]}
        >
          <Text
            style={[
              styles.tagFilterLabel,
              tagFilter === null && styles.tagFilterLabelActive,
              tagFilter === null && theme && { color: theme.primary },
            ]}
          >
            # 모든 태그
          </Text>
        </Pressable>
        {allTags.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => setTagFilter(tagFilter === tag ? null : tag)}
            accessibilityRole="button"
            accessibilityState={{ selected: tagFilter === tag }}
            style={[
              styles.tagFilterChip,
              tagFilter === tag && styles.tagFilterChipActive,
              tagFilter === tag &&
                theme && { backgroundColor: theme.primarySoft },
            ]}
          >
            <Text
              style={[
                styles.tagFilterLabel,
                tagFilter === tag && styles.tagFilterLabelActive,
                tagFilter === tag && theme && { color: theme.primary },
              ]}
            >
              # {tag}
            </Text>
          </Pressable>
        ))}
      </View>
      </>
      )}
      </View>
      <View style={styles.placeList}>
        {displayedPlaces.map((place, index) => {
          // 색은 순서가 아니라 상태를 뜻해야 한다. 예전에는 index % 3으로 돌려서
          // 아무 뜻 없이 카드마다 색이 달라졌다.
          const isStay = place.name === registeredStayName;
          const inPlan = place.status === "일정";
          const statusTone = (isStay ? theme?.secondary : inPlan ? theme?.accent : theme?.primary) ?? "#3F4C8F";
          const statusLabel = isStay ? "대표 숙소" : inPlan ? "일정에 담김" : "저장";
          // 이미 그 상태면 오른쪽 위 배지가 말해준다. 같은 말을 하는 비활성
          // 버튼은 내지 않는다.
          const settled = place.category === "숙소" ? isStay : inPlan;
          return (
          // 준비물 카드처럼 카드를 누르면 열린다. 카드마다 '수정' 버튼을
          // 따로 두면 같은 일을 하는 단추가 장소 수만큼 늘어난다.
          <Pressable
            key={place.id}
            onPress={() => openEdit(place)}
            accessibilityRole="button"
            accessibilityLabel={`${place.name} 수정`}
            style={({ pressed }) => [
              styles.placeMiniCard,
              { backgroundColor: theme?.surface ?? "#FFFFFF", borderColor: theme?.border ?? "#E5E3DD" },
              pressed && styles.packingCardPressed,
            ]}
          >
            <View style={styles.placeMiniTop}>
              <View style={styles.placeMiniInfo}>
                <View style={styles.placeMiniTitleRow}>
                  <Text numberOfLines={1} style={[styles.placeMiniName, { color: theme?.text ?? "#17233D" }]}>{place.name}</Text>
                  <View style={[styles.placeMiniStatus, { backgroundColor: `${statusTone}1E` }]}>
                    <Text style={[styles.placeMiniStatusText, { color: statusTone }]}>{statusLabel}</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[styles.placeMiniMeta, { color: theme?.muted ?? "#727C8D" }]}>{place.category} · {place.area}</Text>
              </View>
            </View>
            <View style={styles.placeMiniActions}>
              <Pressable onPress={(event) => { event.stopPropagation(); if (place.mapUrl) void Linking.openURL(place.mapUrl); else openEdit(place); }} style={[styles.placeMiniMapButton, { backgroundColor: place.mapUrl ? (theme?.dark ? "#16352C" : "#E6F5ED") : theme?.surfaceAlt }]}>
                <Text style={[styles.placeMiniMapText, { color: place.mapUrl ? (theme?.dark ? "#7ED9A7" : "#16844E") : theme?.muted }]}>{place.mapUrl ? "N 지도" : "＋ 링크"}</Text>
              </Pressable>
              {settled ? null : place.category === "숙소" ? (
                <Pressable
                  onPress={(event) => { event.stopPropagation(); onRegisterStay(place); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${place.name}을 이번 여행 숙소로 등록`}
                  style={[styles.placeMiniPlanButton, { backgroundColor: theme?.secondary }]}
                >
                  <Text style={styles.placeMiniPlanText}>대표 숙소로 등록</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => choose(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${place.name} 일정에 담기`}
                  style={[styles.placeMiniPlanButton, { backgroundColor: theme?.primary }]}
                >
                  <Text style={styles.placeMiniPlanText}>일정에 담기</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
          );
        })}
        {visible.length === 0 && (
          <EmptyState
            title="조건에 맞는 장소가 없어요"
            description="검색어나 선택한 상태·태그를 초기화해 보세요."
            action="필터 초기화"
            onPress={() => {
              setQuery("");
              setFilter("전체");
              setTagFilter(null);
            }}
          />
        )}
      </View>
      {visible.length > 6 && (
        <ListMoreButton
          expanded={showAllPlaces}
          hiddenCount={visible.length - 6}
          onPress={() => setShowAllPlaces((value) => !value)}
        />
      )}
      <View
        style={[
          styles.packingListTools,
          theme && { borderTopColor: theme.border },
        ]}
      >
        <View style={styles.packingListToolsCopy}>
          <Text
            style={[
              styles.packingListToolsTitle,
              theme && { color: theme.text },
            ]}
          >
            목록 한꺼번에 수정
          </Text>
          <Text
            style={[
              styles.packingListToolsHint,
              theme && { color: theme.muted },
            ]}
          >
            복사해 수정한 뒤 다시 붙여넣을 수 있어요
          </Text>
        </View>
        <Pressable
          onPress={copyPlaces}
          style={[
            styles.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            복사
          </Text>
        </Pressable>
        <Pressable
          onPress={openImport}
          style={[
            styles.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            붙여넣기
          </Text>
        </Pressable>
      </View>
      <DetailSheet
        visible={planningPlace !== null}
        title="일정에 담기"
        subtitle={
          planningPlace ? `${planningPlace.name}을(를) 언제 갈까요?` : undefined
        }
        submit="일정에 담기"
        onClose={() => setPlanningPlace(null)}
        onSubmit={confirmPlan}
      >
        <View style={[styles.planPlaceSummary, theme && { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.planPlaceName, theme && { color: theme.text }]}>{planningPlace?.name}</Text>
          <Text style={[styles.planPlaceMeta, theme && { color: theme.muted }]}>
            {planningPlace?.area} · {planningPlace?.category}
          </Text>
          <View style={styles.placeTags}>
            {planningPlace?.tags.map((tag) => (
              <View key={tag} style={[styles.placeTag, theme && { backgroundColor: theme.surface }]}>
                <Text style={[styles.placeTagText, theme && { color: theme.primary }]}># {tag}</Text>
              </View>
            ))}
          </View>
        </View>
        <OptionField
          label="날짜"
          options={dayOptions}
          value={planningDay}
          onChange={setPlanningDay}
        />
        <TimePickerField
          label="시간 · 선택 사항"
          value={planningTime}
          onChange={setPlanningTime}
          fallback="11:00"
          optional
        />
      </DetailSheet>
      <DetailSheet
        visible={adding}
        title={editingId ? "장소 수정" : "장소 추가"}
        subtitle="이름만 입력해도 저장할 수 있어요"
        submit={editingId ? "변경 저장" : "장소 추가"}
        disabledHint={!placeFormValid ? (duplicatePlace ? "이미 저장한 장소예요" : "장소 이름을 입력해 주세요") : undefined}
        destructiveLabel={editingId ? "장소 삭제" : undefined}
        destructiveMessage={editingId ? "연결된 일정과 대표 숙소 설정도 함께 정리돼요." : undefined}
        submitDisabled={!placeFormValid}
        hasUnsavedChanges={placeDraftChanged}
        onDestructive={deletePlace}
        onClose={() => setAdding(false)}
        onSubmit={savePlace}
      >
        {!editingId && !mapUrl && (
          <Pressable
            onPress={pasteNaverShare}
            disabled={resolvingNaver}
            accessibilityRole="button"
            accessibilityLabel="복사한 네이버 지도 장소 정보 붙여넣기"
            style={[
              styles.naverAutoFill,
              theme && { backgroundColor: theme.dark ? "#16352C" : "#EAF7F0", borderColor: theme.dark ? "#245544" : "#BFE8D1" },
            ]}
          >
            <View style={styles.naverLogo}>
              <Text style={styles.naverLogoText}>N</Text>
            </View>
            <View style={styles.naverAutoFillCopy}>
              <Text style={[styles.naverAutoFillTitle, theme && { color: theme.dark ? "#DDF7E9" : "#184D36" }]}>{resolvingNaver ? "장소 정보 가져오는 중…" : "네이버 지도 링크 붙여넣기"}</Text>
              <Text style={[styles.naverAutoFillText, theme && { color: theme.dark ? "#96B7A8" : "#648476" }]}>{resolvingNaver ? "이름과 주소를 확인하고 있어요" : "공유 링크를 복사했다면 여기만 탭하세요"}</Text>
            </View>
            <Glyph name="chevronRight" size={16} color={theme?.dark ? "#96B7A8" : "#16844E"} />
          </Pressable>
        )}
        <View style={styles.placeFormIntro}>
          <View style={[styles.placeRequiredBadge, theme && { backgroundColor: theme.primarySoft }]}>
            <Text style={[styles.placeRequiredBadgeText, theme && { color: theme.primary }]}>필수 1개</Text>
          </View>
          <Text style={[styles.placeFormText, theme && { color: theme.muted }]}>장소 이름만 있으면 저장할 수 있어요</Text>
        </View>
        <DetailField
          label="장소 이름 · 필수"
          value={name}
          onChangeText={setName}
          placeholder="예: 소나기식당"
        />
        <OptionField
          label="종류"
          options={["식당", "카페", "구경", "쇼핑", "숙소"]}
          value={category}
          onChange={setCategory}
        />
        <OptionalFormSection
          label="주소·태그·지도"
          summary={
            [address && "주소", draftTags.length && `태그 ${draftTags.length}개`, mapUrl && "지도"]
              .filter(Boolean)
              .join(" · ") || "필요할 때만 추가하세요"
          }
          open={placeDetailsOpen}
          onToggle={() => setPlaceDetailsOpen((current) => !current)}
        >
          <View
            style={[
              styles.naverLinkGuide,
              theme && {
                backgroundColor: theme.dark ? "#16352C" : "#EAF7F0",
                borderColor: theme.dark ? "#245544" : "#BFE8D1",
              },
            ]}
          >
            <View style={styles.naverHead}>
              <View style={styles.naverLogo}>
                <Text style={styles.naverLogoText}>N</Text>
              </View>
              <View style={styles.naverCopy}>
                <Text style={[styles.naverTitle, theme?.dark && { color: "#DDF7E9" }]}>네이버 지도로 장소 연결</Text>
                <Text style={[styles.naverHint, theme?.dark && { color: "#96B7A8" }]}>지도에서 공유 링크를 복사한 다음 붙여넣으세요</Text>
              </View>
            </View>
            <View style={styles.naverLinkActions}>
              <Pressable
                onPress={() => void Linking.openURL("https://map.naver.com/")}
                accessibilityRole="link"
                accessibilityLabel="네이버 지도 열기"
                style={[styles.naverLinkButton, theme && { backgroundColor: theme.surface }]}
              >
                <Text style={[styles.naverLinkButtonText, theme?.dark && { color: "#7ED9A7" }]}>지도 열기</Text>
              </Pressable>
              <Pressable
                onPress={pasteNaverShare}
                disabled={resolvingNaver}
                accessibilityRole="button"
                accessibilityLabel="복사한 네이버 지도 링크 붙여넣기"
                style={[styles.naverLinkButton, styles.naverLinkButtonPrimary]}
              >
                <Text style={[styles.naverLinkButtonText, styles.naverLinkButtonPrimaryText]}>{resolvingNaver ? "가져오는 중…" : "링크 붙여넣기"}</Text>
              </Pressable>
            </View>
            {mapUrl && (
              <View style={[styles.naverConnected, theme && { backgroundColor: theme.surface }]}>
                <View style={styles.naverConnectedCopy}>
                  <Glyph name="check" size={15} color="#16844E" />
                  <Text style={[styles.naverConnectedText, theme?.dark && { color: "#7ED9A7" }]}>네이버 지도 연결됨</Text>
                </View>
                <Pressable onPress={() => setMapUrl("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="네이버 지도 연결 해제">
                  <Text style={[styles.naverDisconnectText, theme && { color: theme.muted }]}>연결 해제</Text>
                </Pressable>
              </View>
            )}
          </View>
          <DetailField
            label="주소 직접 입력 · 선택 사항"
            value={address}
            onChangeText={setAddress}
            placeholder="링크에 주소가 없을 때만 입력하세요"
          />
          <View style={styles.tagEditor}>
            <Text style={[styles.detailFieldLabel, styles.selectorLabel]}>태그</Text>
            <Text style={[styles.placeRecommendLabel, theme && { color: theme.muted }]}>추천 태그</Text>
            <View style={styles.tagSuggestions}>
              {["숙소 근처", "웨이팅", "예약", "가성비", "비 오는 날"].map(
                (tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => addTag(tag)}
                    style={[
                      styles.tagSuggestion,
                      draftTags.includes(tag) && styles.tagSuggestionActive,
                      draftTags.includes(tag) &&
                        theme && {
                          backgroundColor: theme.primarySoft,
                          borderColor: theme.primary,
                        },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagSuggestionText,
                        draftTags.includes(tag) && styles.tagSuggestionTextActive,
                        draftTags.includes(tag) &&
                          theme && { color: theme.primary },
                      ]}
                    >
                      # {tag}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <TextInput
              value={tagText}
              onChangeText={setTagText}
              placeholder="쉼표로 구분 · 예: 초밥, 디너, 조용한 곳"
              placeholderTextColor={theme?.muted ?? "#9AA1AE"}
              style={[styles.tagInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            />
            <View style={styles.draftTags}>
              {draftTags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() =>
                    setTagText(
                      draftTags.filter((item) => item !== tag).join(", "),
                    )
                  }
                  style={[styles.draftTag, theme && { backgroundColor: theme.primarySoft }]}
                >
                  <Text style={[styles.draftTagText, theme && { color: theme.primary }]}># {tag} ×</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </OptionalFormSection>
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="장소 목록 붙여넣기"
        subtitle="복사한 내용을 메모에서 고친 뒤 한 번에 반영하세요"
        submit={importMode === "교체" ? "목록 교체" : "목록에 추가"}
        confirmSubmit={
          importMode === "교체" && places.length
            ? `저장한 장소 ${places.length}곳을 지우고 붙여넣은 것으로 바꿔요. 되돌릴 수 없어요.`
            : undefined
        }
        disabledHint={!importText.trim() ? "장소 목록을 입력해 주세요" : undefined}
        submitDisabled={!importText.trim()}
        onClose={() => setImporting(false)}
        onSubmit={importPlaces}
      >
        <OptionField
          label="목록 반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
        <DetailField
          label="붙여넣을 장소 목록 · 필수"
          value={importText}
          onChangeText={setImportText}
          multiline
          placeholder="장소마다 한 줄씩 붙여넣으세요"
        />
        <Text style={[styles.settingHint, theme && { color: theme.muted }]}>
          ‘교체’는 현재 목록을 지우고 새 목록으로 바꿔요. 붙여넣은 장소는 저장한
          장소로 추가됩니다.
        </Text>
      </DetailSheet>
    </View>
  );
}

function Preparation({
  done,
  toggle,
  participants,
  items,
  setItems,
  recipes,
  openCookingPickerOnMount,
  onCookingPickerOpened,
}: {
  done: string[];
  toggle: (item: string) => void;
  /** 이번 여행에 가는 사람. 담당으로 고를 수 있는 이름이 여기서 온다. */
  participants: string[];
  items: PackingItem[];
  setItems: React.Dispatch<React.SetStateAction<PackingItem[]>>;
  recipes: Recipe[];
  openCookingPickerOnMount?: boolean;
  onCookingPickerOpened?: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [names, setNames] = useState("");
  const [quantity, setQuantity] = useState("");
  const [owner, setOwner] = useState(PACKING_UNASSIGNED);
  const [tagText, setTagText] = useState("");
  const [filter, setFilter] = useState<"전체" | "남은 준비" | "완료">("남은 준비");
  const [ownerFilter, setOwnerFilter] = useState("전체");
  const [tagFilter, setTagFilter] = useState("전체 태그");
  const [tagPicker, setTagPicker] = useState(false);
  // 사람이 둘 이상이면 담당 칩을 펴 둔다. 누가 뭘 챙기는지가 이 탭의 절반인데
  // 접힌 버튼 뒤에 있으면 그런 게 있는 줄도 모른다.
  const [packingFiltersOpen, setPackingFiltersOpen] = useState(participants.length > 1);
  const [assigningItem, setAssigningItem] = useState<PackingItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  // 교체는 저장해 둔 것을 통째로 지운다. 되돌릴 수 없으니 기본은 추가로 둔다.
  const [importMode, setImportMode] = useState<"교체" | "추가">("추가");
  const [cookingPicker, setCookingPicker] = useState(Boolean(openCookingPickerOnMount));
  const [selectedCookingItems, setSelectedCookingItems] = useState<string[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  // 처음에는 분류와 남은 개수만 보여준다. 30개 항목을 한꺼번에 펼치면 사용자가
  // 무엇부터 봐야 하는지 알기 어렵고 다른 분류가 화면 아래로 밀린다.
  const [collapsedPackingTags, setCollapsedPackingTags] = useState<string[]>(() =>
    Array.from(new Set(items.map((item) => packingTags(item)[0] || "태그 없음"))),
  );
  useEffect(() => {
    if (openCookingPickerOnMount) {
      // 요리 탭에서 전달된 한 번성 열기 요청을 로컬 시트 상태에 반영한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCookingPicker(true);
      onCookingPickerOpened?.();
    }
  }, [onCookingPickerOpened, openCookingPickerOnMount]);
  const completedCount = items.filter((item) => done.includes(item.id)).length;
  const selectedCookingUniqueCount = new Set(
    recipes.flatMap((recipe) => recipe.ingredients)
      .filter((ingredient) => selectedCookingItems.includes(ingredient.id))
      .map((ingredient) => ingredient.name.trim().toLowerCase()),
  ).size;
  const percentage = items.length
    ? Math.round((completedCount / items.length) * 100)
    : 0;
  const visibleItems = items.filter((item) => {
    const matchesFilter =
      filter === "전체" ||
      (filter === "남은 준비" && !done.includes(item.id)) ||
      (filter === "완료" && done.includes(item.id));
    const matchesOwner = ownerFilter === "전체" || item.owner === ownerFilter;
    const matchesTag =
      tagFilter === "전체 태그" || packingTags(item).includes(tagFilter);
    return matchesFilter && matchesOwner && matchesTag;
  });
  // 참가자가 바뀌어도 그 사람 이름으로 적어 둔 준비물이 걸러지지 않으면 안 되니,
  // 목록에 실제로 적힌 담당을 뒤에 붙인다.
  const ownerSections = useMemo(() => {
    const known = packingOwnerOptions(participants);
    const extra = Array.from(new Set(items.map((item) => item.owner)))
      .filter((owner) => owner && !known.includes(owner));
    return [...known, ...extra];
  }, [items, participants]);
  const managementTags = useMemo(
    () => [
      "전체 태그",
      ...Array.from(new Set(items.flatMap((item) => packingTags(item)))),
    ],
    [items],
  );
  useEffect(() => {
    if (tagFilter !== "전체 태그" && !managementTags.includes(tagFilter)) {
      // 목록 교체로 사라진 태그를 계속 선택한 상태로 두지 않는다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTagFilter("전체 태그");
    }
  }, [managementTags, tagFilter]);
  const draftPackingTags = tagText
    .split(/[,#\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
  const parsedPackingNames = names
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, values) => values.findIndex((value) => value.toLowerCase() === name.toLowerCase()) === index);
  const duplicateEditedPacking = Boolean(editingId) && items.some(
    (item) => item.id !== editingId && item.owner === owner && item.name.trim().toLowerCase() === parsedPackingNames[0]?.toLowerCase(),
  );
  const newPackingNames = parsedPackingNames.filter((name) =>
    !items.some((item) => item.owner === owner && item.name.trim().toLowerCase() === name.toLowerCase()),
  );
  const newPackingCount = editingId ? Number(Boolean(parsedPackingNames[0]) && !duplicateEditedPacking) : newPackingNames.length;
  const availableTags = managementTags.slice(1);
  const quickTags = Array.from(
    new Set([
      ...(tagFilter !== "전체 태그" ? [tagFilter] : []),
      ...availableTags,
    ]),
  ).slice(0, 4);
  const groupByPrimaryTag = (source: PackingItem[]) =>
    Array.from(
      source.reduce((groups, item) => {
        const tag = packingTags(item)[0] || "태그 없음";
        groups.set(tag, [...(groups.get(tag) ?? []), item]);
        return groups;
      }, new Map<string, PackingItem[]>()),
    );
  const remainingGroups = groupByPrimaryTag(
    visibleItems.filter((item) => !done.includes(item.id)),
  );
  const completedGroups = groupByPrimaryTag(
    visibleItems.filter((item) => done.includes(item.id)),
  );
  const countForOwner = (target: string) =>
    items.filter((item) => {
      const matchesOwner = target === "전체" || item.owner === target;
      const matchesStatus = filter === "전체" || (filter === "완료" ? done.includes(item.id) : !done.includes(item.id));
      const matchesTag = tagFilter === "전체 태그" || packingTags(item).includes(tagFilter);
      return matchesOwner && matchesStatus && matchesTag;
    }).length;
  const openPackingCreate = () => {
    setEditingId(null);
    setNames("");
    setQuantity("");
    setOwner(PACKING_UNASSIGNED);
    setTagText("");
    setAdding(true);
  };
  const submit = () => {
    if (!newPackingCount) return;
    // 사용자가 저장을 누른 시점에 여러 로컬 항목의 공통 식별자를 만든다.
    // eslint-disable-next-line react-hooks/purity
    const stamp = Date.now();
    if (editingId) {
      const nextName = parsedPackingNames[0];
      setItems((current) => current.map((item) => item.id === editingId
        ? { ...item, name: nextName, quantity: quantity.trim(), owner, tags: draftPackingTags }
        : item));
    } else {
      setItems((current) => [
        ...current,
        ...newPackingNames.map((name, index) => ({ id: `${stamp}-${index}`, name, quantity: quantity.trim(), owner, tags: draftPackingTags })),
      ]);
    }
    setNames("");
    setQuantity("");
    setTagText("");
    setEditingId(null);
    setAdding(false);
    notify(editingId ? "준비물 정보를 수정했어요" : `준비물 ${newPackingNames.length}개를 추가했어요`);
  };
  const assignOwner = (item: PackingItem, nextOwner: string) => {
    const duplicate = items.some(
      (value) => value.id !== item.id && value.owner === nextOwner && value.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
    );
    if (duplicate) {
      notify(`${nextOwner}의 목록에 같은 준비물이 있어요`);
      return;
    }
    setItems((current) =>
      current.map((value) =>
        value.id === item.id ? { ...value, owner: nextOwner } : value,
      ),
    );
    setAssigningItem(null);
    notify(`${item.name} 담당을 ${nextOwner}(으)로 변경했어요`);
  };
  const complete = (item: PackingItem) => {
    toggle(item.id);
  };
  const openPackingEdit = (item: PackingItem) => {
    setAssigningItem(null);
    setEditingId(item.id);
    setNames(item.name);
    setQuantity(item.quantity);
    setOwner(item.owner);
    setTagText(packingTags(item).join(", "));
    setAdding(true);
  };
  const closePackingForm = () => {
    setAdding(false);
    setEditingId(null);
    setNames("");
    setQuantity("");
    setTagText("");
    setOwner(PACKING_UNASSIGNED);
  };
  const deletePacking = () => {
    const target = items.find((item) => item.id === editingId);
    if (!target) return;
    setItems((current) => current.filter((item) => item.id !== target.id));
    closePackingForm();
    notify("준비물을 삭제했어요");
  };
  const copyPacking = async () => {
    await Clipboard.setStringAsync(
      items
        .map(
          (item) =>
            `${item.name} | ${item.quantity} | ${item.owner} | ${packingTags(
              item,
            )
              .map((tag) => `#${tag}`)
              .join(" ")}`,
        )
        .join("\n"),
    );
    notify("준비물 목록을 복사했어요");
  };
  const openImport = async () => {
    setImportText(await Clipboard.getStringAsync());
    setImporting(true);
  };
  const importPacking = () => {
    // 참가자 이름은 그대로 받고, 옛 목록에서 복사해 온 자리 이름만 옮긴다.
    const readOwner = (raw: string) => {
      const moved = normalizePackingOwner(raw, participants);
      return ownerSections.includes(moved) ? moved : PACKING_UNASSIGNED;
    };
    const stamp = Date.now();
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [name, quantity = "", rawOwner = "미정", rawTags = ""] = line
          .split("|")
          .map((value) => value.trim());
        return {
          id: `${stamp}-${index}`,
          name,
          quantity,
          owner: readOwner(rawOwner),
          tags: rawTags.split(/[# ,]+/).filter(Boolean),
        };
      })
      .filter((item, index, values) =>
        Boolean(item.name) &&
        values.findIndex((value) => value.owner === item.owner && value.name.toLowerCase() === item.name.toLowerCase()) === index,
      );
    if (!parsed.length) return;
    const existing = new Set(items.map((item) => `${item.owner}:${item.name.toLowerCase()}`));
    const additions = importMode === "교체"
      ? parsed
      : parsed.filter((item) => !existing.has(`${item.owner}:${item.name.toLowerCase()}`));
    setItems((current) => importMode === "교체" ? additions : [...current, ...additions]);
    setImporting(false);
    notify(additions.length ? `준비물 ${additions.length}개를 반영했어요` : "이미 있는 준비물뿐이에요");
  };
  const toggleCookingItem = (id: string) =>
    setSelectedCookingItems((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id],
    );
  const importCookingItems = () => {
    const existingNames = new Set(items.map((item) => item.name));
    const selected = recipes.flatMap((recipe) =>
      recipe.ingredients
        .filter(
          (ingredient) =>
            selectedCookingItems.includes(ingredient.id) &&
            !existingNames.has(ingredient.name),
        )
        .map((ingredient) => ({ recipe, ingredient })),
    );
    const uniqueSelected = selected.filter(({ ingredient }, index, values) =>
      values.findIndex(({ ingredient: value }) => value.name.trim().toLowerCase() === ingredient.name.trim().toLowerCase()) === index,
    );
    if (!uniqueSelected.length) {
      setCookingPicker(false);
      return;
    }
    const stamp = Date.now();
    setItems((current) => [
      ...current,
      ...uniqueSelected.map(({ recipe, ingredient }, index) => ({
        id: `cooking-${stamp}-${index}`,
        name: ingredient.name,
        quantity: ingredient.quantity,
        // 재료의 담당도 같은 참가자 목록을 쓰므로 이름이 맞으면 그대로 가져온다.
        // 현지에서 산다는 표시는 담당이 아니라 태그라 여기서는 미정이 된다.
        owner: participants.includes(ingredient.owner) ? ingredient.owner : PACKING_UNASSIGNED,
        tags: Array.from(new Set(["요리 재료", recipe.name, ingredient.group, ...(ingredient.owner === "구매" ? ["구매"] : [])])),
      })),
    ]);
    setSelectedCookingItems([]);
    setCookingPicker(false);
    notify(`요리 재료 ${uniqueSelected.length}개를 준비에 추가했어요`);
  };
  const renderPackingRow = (item: PackingItem, index: number) => {
    const completed = done.includes(item.id);
    return (
      <Pressable
        key={item.id}
        onPress={() => complete(item)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`${item.name} ${completed ? "완료 해제" : "완료"}`}
        style={({ pressed }) => [
          styles.packingV2Row,
          index > 0 && styles.packingV2RowBorder,
          index > 0 && theme && { borderTopColor: theme.border },
          pressed && styles.packingCardPressed,
        ]}
      >
        <View
          style={[
            styles.packingV2Check,
            theme && {
              borderColor: completed ? theme.primary : theme.border,
              backgroundColor: completed ? theme.primary : theme.surface,
            },
          ]}
        >
          {completed && (
            <Glyph name="check" size={14} color="#FFFFFF" weight={2.6} />
          )}
        </View>
        <View style={styles.packingV2Body}>
          <View style={styles.packingV2TitleRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.checkName,
                styles.packingV2Name,
                theme && { color: completed ? theme.muted : theme.text },
                completed && styles.checkNameDone,
              ]}
            >
              {item.name}
            </Text>
            {item.quantity ? (
              <Text style={[styles.packingV2Quantity, theme && { color: theme.muted }]}>{item.quantity}</Text>
            ) : null}
          </View>
          {packingTags(item).slice(1).length > 0 && (
            <Text numberOfLines={1} style={[styles.packingV2SubTags, theme && { color: theme.muted }]}>
              {packingTags(item).slice(1).map((tag) => `# ${tag}`).join("  ")}
            </Text>
          )}
        </View>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            setAssigningItem(item);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} 담당 및 정보 관리`}
          style={[styles.packingV2Assignee, theme && { backgroundColor: theme.primarySoft }]}
        >
          <Text style={[styles.packingOwnerChangeText, theme && { color: theme.primary }]}>
            {item.owner}
          </Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View>
      <TabActionHeader
        label="준비물"
        count={`${items.length}개`}
        action="준비물 추가"
        onPress={openPackingCreate}
      />
      <View
        style={[
          styles.packingJourney,
          theme && { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={[styles.packingJourneyStamp, theme && { backgroundColor: theme.primarySoft }]}>
          <View style={[styles.packingSuitcaseHandle, theme && { borderColor: theme.primary }]} />
          <View style={[styles.packingSuitcaseBody, theme && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
            <View style={styles.packingSuitcaseStrap} />
            <View style={styles.packingSuitcaseSticker}>
              <Text style={[styles.packingSuitcaseStickerText, theme && { color: theme.primary }]}>D</Text>
            </View>
          </View>
          <View style={styles.packingSuitcaseFeet}>
            <View style={[styles.packingSuitcaseFoot, theme && { backgroundColor: theme.primary }]} />
            <View style={[styles.packingSuitcaseFoot, theme && { backgroundColor: theme.primary }]} />
          </View>
        </View>
        <View style={styles.packingJourneyBody}>
          <View style={styles.packingJourneyCopy}>
            <View>
              <Text style={[styles.packingJourneyEyebrow, theme && { color: theme.primary }]}>출발 준비</Text>
              <Text style={[styles.packingJourneyTitle, theme && { color: theme.text }]}>
                {percentage === 100
                  ? "짐 꾸리기 완료!"
                  : percentage >= 60
                    ? "거의 다 챙겼어요"
                    : percentage > 0
                      ? "하나씩 챙기는 중"
                      : "이제 짐을 꾸려볼까요?"}
              </Text>
            </View>
          </View>
          <View style={styles.packingJourneyProgressRow}>
            <View style={[styles.packingJourneyTrack, theme && { backgroundColor: theme.primarySoft }]}>
              <View style={[styles.packingJourneyFill, { width: `${percentage}%` }, theme && { backgroundColor: theme.primary }]} />
            </View>
            <Text style={[styles.packingJourneyPercent, theme && { color: theme.primary }]}>{percentage}%</Text>
          </View>
        </View>
      </View>
      {/* 다섯 개 이하면 한눈에 다 보인다. 거르는 도구가 목록보다 커지지
          않도록 접어 둔다. 이미 거르고 있으면 끄는 길이 필요하니 남긴다. */}
      {(items.length > 5 || filter !== "전체" || ownerFilter !== "전체" || tagFilter !== "전체 태그") && (
      <View
        style={[
          styles.packingV2Controls,
          theme && { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.packingV2StatusRow}>
          <View style={styles.packingV2StatusTabs}>
            {(["전체", "남은 준비", "완료"] as const).map((item) => {
              const active = filter === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setFilter(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.packingV2StatusChip,
                    active && theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <Text style={[styles.packingFilterChipText, theme && { color: active ? theme.primary : theme.muted }]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => setPackingFiltersOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: packingFiltersOpen }}
            accessibilityLabel="담당과 태그 필터"
            style={[styles.packingV2TagButton, theme && { borderColor: theme.border }]}
          >
            <Text style={[styles.packingV2TagButtonText, theme && { color: theme.primary }]}>
              {ownerFilter === "전체" && tagFilter === "전체 태그" ? "필터" : "필터 적용 중"}
            </Text>
            <Glyph name={packingFiltersOpen ? "chevronDown" : "chevronRight"} size={14} color={theme?.muted ?? "#646C7A"} />
          </Pressable>
        </View>
        {packingFiltersOpen && (
        <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packingV2Owners}>
          {["전체", ...ownerSections].map((ownerName) => {
            const active = ownerFilter === ownerName;
            const matchingCount = countForOwner(ownerName);
            return (
              <Pressable
                key={ownerName}
                onPress={() => setOwnerFilter(ownerName)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.packingV2OwnerChip,
                  theme && { borderColor: active ? theme.primary : theme.border },
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text style={[styles.packingV2OwnerName, theme && { color: active ? theme.primary : theme.text }]}>
                  {ownerName}
                </Text>
                <Text style={[styles.packingV2OwnerCount, theme && { color: active ? theme.primary : theme.muted }]}>{matchingCount}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          onPress={() => setTagPicker(true)}
          accessibilityRole="button"
          accessibilityLabel="준비물 태그 선택"
          style={[styles.packingV2TagChoice, theme && { backgroundColor: theme.surfaceAlt }]}
        >
          <Text style={[styles.packingV2TagChoiceLabel, theme && { color: theme.muted }]}>태그</Text>
          <Text style={[styles.packingV2TagChoiceValue, theme && { color: theme.text }]}>
            {tagFilter === "전체 태그" ? `전체 ${availableTags.length}개` : `# ${tagFilter}`}
          </Text>
          <Glyph name="chevronRight" size={14} color={theme?.muted ?? "#646C7A"} />
        </Pressable>
        </>
        )}
      </View>
      )}
      <View style={[styles.packingManageHead, styles.packingV2Hidden]}>
        <View>
          <Text
            style={[styles.packingManageTitle, theme && { color: theme.text }]}
          >
            담당별 준비물
          </Text>
          <Text
            style={[styles.packingManageHint, theme && { color: theme.muted }]}
          >
            이름을 누르면 해당 준비물만 보여요
          </Text>
        </View>
        <Pressable
          onPress={() => setOwnerFilter("전체")}
          style={[
            styles.packingShowAll,
            theme && {
              backgroundColor:
                ownerFilter === "전체" ? theme.primarySoft : theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text
            style={[
              styles.packingShowAllText,
              theme && {
                color: ownerFilter === "전체" ? theme.primary : theme.muted,
              },
            ]}
          >
            전체 {items.length}
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.ownerStats,
          styles.packingV2Hidden,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        {ownerSections.map((ownerName, index) => {
          const remaining = items.filter(
            (item) => item.owner === ownerName && !done.includes(item.id),
          ).length;
          const active = ownerFilter === ownerName;
          return (
            <View key={ownerName} style={styles.ownerStatSlot}>
              {index > 0 && (
                <View
                  style={[
                    styles.ownerDivider,
                    theme && { backgroundColor: theme.border },
                  ]}
                />
              )}
              <Pressable
                onPress={() => setOwnerFilter(active ? "전체" : ownerName)}
                style={[
                  styles.ownerStat,
                  active && styles.ownerStatActive,
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text
                  style={[
                    styles.ownerStatName,
                    theme && { color: active ? theme.primary : theme.text },
                  ]}
                >
                  {ownerName}
                </Text>
                <Text
                  style={[
                    styles.ownerStatCount,
                    ownerName === "미정" && styles.unassignedText,
                    theme && ownerName !== "미정" && { color: theme.muted },
                  ]}
                >
                  {remaining}개 남음
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      <View
        style={[
          styles.packingFilterBoard,
          styles.packingV2Hidden,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.packingFilterLine}>
          <Text
            style={[styles.packingFilterLabel, theme && { color: theme.muted }]}
          >
            태그
          </Text>
          <ScrollView
            style={styles.packingFilterScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.packingFilters}
          >
            {["전체 태그", ...quickTags.slice(0, 2)].map((tag) => {
              const active = tagFilter === tag;
              return (
                <Pressable
                  key={tag}
                  onPress={() => setTagFilter(tag)}
                  style={[
                    styles.packingFilterChip,
                    active && theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.packingFilterChipText,
                      theme && { color: active ? theme.primary : theme.muted },
                    ]}
                  >
                    {tag === "전체 태그" ? "모든 태그" : `# ${tag}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {availableTags.length > 2 && (
            <Pressable
              onPress={() => setTagPicker(true)}
              style={[
                styles.packingFilterMore,
                theme && { borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  styles.packingFilterMoreText,
                  theme && { color: theme.text },
                ]}
              >
                전체 {availableTags.length}
              </Text>
            </Pressable>
          )}
        </View>
        <View
          style={[
            styles.packingFilterRule,
            theme && { backgroundColor: theme.border },
          ]}
        />
        <View style={styles.packingFilterLine}>
          <Text
            style={[styles.packingFilterLabel, theme && { color: theme.muted }]}
          >
            상태
          </Text>
          <View style={styles.packingFilters}>
            {(["전체", "남은 준비", "완료"] as const).map((item) => {
              const active = filter === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[
                    styles.packingFilterChip,
                    active && theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.packingFilterChipText,
                      theme && { color: active ? theme.primary : theme.muted },
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.packingList}>
        {remainingGroups.map(([sourceTag, taggedItems], groupIndex) => {
          const collapsed = collapsedPackingTags.includes(sourceTag);
          const groupAccent = theme
            ? [theme.primary, theme.secondary, theme.accent][groupIndex % 3]
            : ["#FF6B63", "#55BFB4", "#8B7CF6"][groupIndex % 3];
          // 두 숫자가 같은 기준을 봐야 한다. 하나는 전체를, 하나는 걸러진 것을
          // 세면 "1/5 완료 · 1개 남음" 처럼 서로 안 맞는 말이 나란히 놓인다.
          const allInGroup = visibleItems.filter(
            (item) => (packingTags(item)[0] || "태그 없음") === sourceTag,
          );
          const doneInGroup = allInGroup.filter((item) =>
            done.includes(item.id),
          ).length;
          return (
            <View
              key={sourceTag}
              style={[
                styles.packingV2Group,
                theme && {
                  backgroundColor: theme.surface,
                  borderColor: `${groupAccent}55`,
                },
              ]}
            >
              <Pressable
                onPress={() =>
                  setCollapsedPackingTags((current) =>
                    current.includes(sourceTag)
                      ? current.filter((tag) => tag !== sourceTag)
                      : [...current, sourceTag],
                  )
                }
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                accessibilityLabel={`${sourceTag} 준비물 ${collapsed ? "펼치기" : "접기"}`}
                style={({ pressed }) => [
                  styles.packingV2GroupHead,
                  { backgroundColor: `${groupAccent}0D` },
                  pressed && styles.packingV2GroupHeadPressed,
                ]}
              >
                <View>
                  <View style={styles.packingV2GroupTitleRow}>
                    <View style={[styles.packingV2GroupSticker, { backgroundColor: `${groupAccent}20` }]}>
                      <Text style={[styles.packingV2GroupStickerText, { color: groupAccent }]}>{String(groupIndex + 1).padStart(2, "0")}</Text>
                    </View>
                    <Text style={[styles.packingV2GroupTitle, theme && { color: theme.text }]}>{sourceTag}</Text>
                  </View>
                  <Text style={[styles.packingV2GroupProgress, theme && { color: theme.muted }]}>
                    {doneInGroup}/{allInGroup.length} 완료
                  </Text>
                </View>
                <View style={styles.packingV2GroupActions}>
                  <View style={[styles.packingV2GroupCount, { backgroundColor: `${groupAccent}18` }]}>
                    <Text style={[styles.packingV2GroupCountText, { color: groupAccent }]}>
                      {taggedItems.length}개 남음
                    </Text>
                  </View>
                  <Glyph
                    name={collapsed ? "chevronRight" : "chevronDown"}
                    size={16}
                    color={theme?.muted ?? "#646C7A"}
                    weight={2.2}
                  />
                </View>
              </Pressable>
              {!collapsed && taggedItems.map(renderPackingRow)}
            </View>
          );
        })}
        {completedGroups.length > 0 && (
          <View
            style={[
              styles.packingV2Completed,
              theme && {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
              },
            ]}
          >
            <Pressable
              onPress={() => {
                // 상태를 "완료" 로 걸러 둔 동안에는 이 목록이 화면 전부다.
                // 그때 접으라는 말은 걸러 둔 것을 푸는 뜻이어야 한다.
                if (filter === "완료") {
                  setFilter("전체");
                  setShowCompleted(false);
                  return;
                }
                setShowCompleted((value) => !value);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: filter === "완료" || showCompleted }}
              style={styles.packingV2CompletedHead}
            >
              <Text style={[styles.packingV2CompletedTitle, theme && { color: theme.text }]}>
                완료한 준비물 {completedGroups.reduce((sum, [, groupItems]) => sum + groupItems.length, 0)}개
              </Text>
              <Text style={[styles.packingV2CompletedToggle, theme && { color: theme.primary }]}>
                {filter === "완료" || showCompleted ? "접기" : "보기"}
              </Text>
            </Pressable>
            {(filter === "완료" || showCompleted) &&
              completedGroups.flatMap(([, groupItems]) => groupItems).map(renderPackingRow)}
          </View>
        )}
      </View>
      {visibleItems.length === 0 && (
        <EmptyState
          title={items.length === 0 ? "아직 준비물이 없어요" : "조건에 맞는 준비물이 없어요"}
          description={items.length === 0 ? "여행에 필요한 준비물을 추가해 보세요." : "상태·담당·태그 필터를 초기화해 보세요."}
          action={items.length === 0 ? "준비물 추가" : "필터 초기화"}
          onPress={() => {
            if (items.length === 0) openPackingCreate();
            else {
              setFilter("전체");
              setOwnerFilter("전체");
              setTagFilter("전체 태그");
            }
          }}
        />
      )}
      <View
        style={[
          styles.packingListTools,
          theme && { borderTopColor: theme.border },
        ]}
      >
        <View style={styles.packingListToolsCopy}>
          <Text
            style={[
              styles.packingListToolsTitle,
              theme && { color: theme.text },
            ]}
          >
            목록 한꺼번에 수정
          </Text>
          <Text
            style={[
              styles.packingListToolsHint,
              theme && { color: theme.muted },
            ]}
          >
            복사해 수정한 뒤 다시 붙여넣을 수 있어요
          </Text>
        </View>
        <Pressable
          onPress={copyPacking}
          style={[
            styles.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            복사
          </Text>
        </Pressable>
        <Pressable
          onPress={openImport}
          style={[
            styles.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            붙여넣기
          </Text>
        </Pressable>
      </View>
      <DetailSheet
        visible={tagPicker}
        title="태그 선택"
        subtitle="보고 싶은 준비물의 태그를 선택하세요"
        submit="닫기"
        onClose={() => setTagPicker(false)}
        onSubmit={() => setTagPicker(false)}
      >
        <View style={styles.tagPickerGrid}>
          {["전체 태그", ...availableTags].map((tag) => {
            const active = tagFilter === tag;
            const count =
              tag === "전체 태그"
                ? items.length
                : items.filter((item) => packingTags(item).includes(tag))
                    .length;
            return (
              <Pressable
                key={tag}
                onPress={() => {
                  setTagFilter(tag);
                  setTagPicker(false);
                }}
                style={[
                  styles.tagPickerItem,
                  theme && {
                    backgroundColor: active ? theme.primarySoft : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tagPickerName,
                    theme && { color: active ? theme.primary : theme.text },
                  ]}
                >
                  {tag === "전체 태그" ? tag : `# ${tag}`}
                </Text>
                <Text
                  style={[
                    styles.tagPickerCount,
                    theme && { color: theme.muted },
                  ]}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </DetailSheet>
      <DetailSheet
        visible={Boolean(assigningItem)}
        title="준비물 관리"
        subtitle={
          assigningItem
            ? `‘${assigningItem.name}’을(를) 누가 챙길지 선택하세요`
            : undefined
        }
        submit="닫기"
        onClose={() => setAssigningItem(null)}
        onSubmit={() => setAssigningItem(null)}
      >
        <View style={styles.assignmentOptions}>
          {ownerSections.map((ownerName) => {
            const selected = assigningItem?.owner === ownerName;
            const description =
              ownerName === PACKING_SHARED
                ? "같이 쓰는 준비물로 이동"
                : ownerName === PACKING_UNASSIGNED
                  ? "나중에 담당 정하기"
                  : `${ownerName}의 준비물로 이동`;
            return (
              <Pressable
                key={ownerName}
                onPress={() =>
                  assigningItem && assignOwner(assigningItem, ownerName)
                }
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[
                  styles.assignmentOption,
                  theme && {
                    backgroundColor: selected
                      ? theme.primarySoft
                      : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.assignmentAvatar,
                    theme && {
                      backgroundColor: selected
                        ? theme.primary
                        : theme.surfaceAlt,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.assignmentAvatarText,
                      theme && {
                        color: selected ? "#FFFFFF" : theme.text,
                      },
                    ]}
                  >
                    {ownerName === PACKING_UNASSIGNED ? "?" : ownerName.slice(0, 1)}
                  </Text>
                </View>
                <View style={styles.assignmentCopy}>
                  <Text
                    style={[
                      styles.assignmentName,
                      theme && { color: theme.text },
                    ]}
                  >
                    {ownerName}
                  </Text>
                  <Text
                    style={[
                      styles.assignmentDescription,
                      theme && { color: theme.muted },
                    ]}
                  >
                    {description}
                  </Text>
                </View>
                <View
                  style={[
                    styles.assignmentRadio,
                    theme && {
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  {selected && (
                    <View
                      style={[
                        styles.assignmentRadioDot,
                        theme && { backgroundColor: theme.primary },
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
        {assigningItem && (
          <Pressable
            onPress={() => openPackingEdit(assigningItem)}
            accessibilityRole="button"
            style={[styles.infoManageButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[styles.infoManageButtonText, theme && { color: theme.primary }]}>이 준비물 정보 수정</Text>
          </Pressable>
        )}
      </DetailSheet>
      <DetailSheet
        visible={adding}
        title={editingId ? "준비물 수정" : "준비물 추가"}
        subtitle={editingId ? "이름, 수량, 담당과 태그를 바꿀 수 있어요" : "한 줄에 하나씩 적으면 여러 개를 한 번에 추가할 수 있어요"}
        submit={newPackingCount && !editingId ? `${newPackingCount}개 추가` : editingId ? "변경 저장" : "준비물 추가"}
        disabledHint={!newPackingCount ? (duplicateEditedPacking ? "같은 담당자에게 이미 있는 준비물이에요" : "준비물을 입력해 주세요") : undefined}
        submitDisabled={!newPackingCount}
        destructiveLabel={editingId ? "준비물 삭제" : undefined}
        destructiveMessage={editingId ? `${names || "이 준비물"}을 목록에서 삭제해요.` : undefined}
        onDestructive={deletePacking}
        onClose={closePackingForm}
        onSubmit={submit}
      >
        <DetailField
          label="준비물 이름 · 필수"
          value={names}
          onChangeText={setNames}
          placeholder={"충전기, 안경, 갈아입을 옷"}
          multiline={!editingId}
        />
        <DetailField
          label="수량 · 선택 사항"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="예: 각 2개, 250g"
        />
        <View style={styles.detailField}>
          <Text
            style={[
              styles.detailFieldLabel,
              styles.selectorLabel,
              theme && { color: theme.muted },
            ]}
          >
            담당 · 선택 사항
          </Text>
          <View style={styles.packingAssigneeOptions}>
            {ownerSections.map((ownerName) => (
              <Pressable
                key={ownerName}
                onPress={() => setOwner(ownerName)}
                style={[
                  styles.packingAssigneeOption,
                  theme && {
                    backgroundColor:
                      owner === ownerName
                        ? theme.primarySoft
                        : `${theme.primary}10`,
                    borderColor:
                      owner === ownerName
                        ? theme.primary
                        : `${theme.primary}45`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.packingAssigneeOptionText,
                    theme && {
                      color: owner === ownerName ? theme.primary : theme.text,
                    },
                  ]}
                >
                  {ownerName}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.tagEditor}>
          <Text
            style={[
              styles.detailFieldLabel,
              styles.selectorLabel,
              theme && { color: theme.muted },
            ]}
          >
            태그
          </Text>
          <Text style={[styles.placeRecommendLabel, theme && { color: theme.muted }]}>추천 태그</Text>
          <View style={styles.tagSuggestions}>
            {["전자기기", "세면", "의류", "숙소", "출발 전"].map((tag) => {
              const selected = draftPackingTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() =>
                    setTagText(
                      selected
                        ? draftPackingTags
                            .filter((item) => item !== tag)
                            .join(", ")
                        : [...draftPackingTags, tag].join(", "),
                    )
                  }
                  style={[
                    styles.tagSuggestion,
                    selected && styles.tagSuggestionActive,
                    selected &&
                      theme && {
                        backgroundColor: theme.primarySoft,
                        borderColor: theme.primary,
                      },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagSuggestionText,
                      selected && styles.tagSuggestionTextActive,
                      selected && theme && { color: theme.primary },
                    ]}
                  >
                    # {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={tagText}
            onChangeText={setTagText}
            placeholder="쉼표로 구분 · 예: 전자기기, 출발 전, 숙소"
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[
              styles.tagInput,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />
          <View style={styles.draftTags}>
            {draftPackingTags.map((tag) => (
              <Pressable
                key={tag}
                onPress={() =>
                  setTagText(
                    draftPackingTags
                      .filter((currentTag) => currentTag !== tag)
                      .join(", "),
                  )
                }
                style={[
                  styles.draftTag,
                  theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text
                  style={[
                    styles.draftTagText,
                    theme && { color: theme.primary },
                  ]}
                >
                  # {tag} ×
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {recipes.some((recipe) => recipe.ingredients.length > 0) && (
          <View style={[styles.cookingImportCallout, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <View style={styles.cookingImportCopy}>
              <Text style={[styles.cookingImportTitle, theme && { color: theme.text }]}>요리 재료에서 가져오기</Text>
              <Text style={[styles.cookingImportText, theme && { color: theme.muted }]}>직접 입력하지 않고 등록된 재료를 선택할 수 있어요.</Text>
            </View>
            <Pressable
              onPress={() => {
                setAdding(false);
                setCookingPicker(true);
              }}
              style={[styles.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
            >
              <Text style={[styles.aiRecipeButtonText, theme && { color: theme.primary }]}>재료 선택</Text>
            </Pressable>
          </View>
        )}
      </DetailSheet>
      <DetailSheet
        visible={cookingPicker}
        title="요리 재료 불러오기"
        subtitle="준비물에 추가할 재료를 선택하세요"
        submit={
          selectedCookingUniqueCount
            ? `${selectedCookingUniqueCount}개 준비물에 추가`
            : "준비물에 추가"
        }
        disabledHint={!selectedCookingUniqueCount ? "재료를 선택해 주세요" : undefined}
        submitDisabled={!selectedCookingUniqueCount}
        onClose={() => {
          setCookingPicker(false);
          setSelectedCookingItems([]);
        }}
        onSubmit={importCookingItems}
      >
        {recipes.map((recipe) => (
          <View
            key={recipe.id}
            style={[
              styles.cookingImportGroup,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.cookingImportGroupHead}>
              <Text
                style={[
                  styles.cookingImportGroupTitle,
                  theme && { color: theme.text },
                ]}
              >
                {recipe.name}
              </Text>
              <Text
                style={[
                  styles.cookingImportGroupCount,
                  theme && { color: theme.muted },
                ]}
              >
                {recipe.ingredients.length}개
              </Text>
            </View>
            {recipe.ingredients.map((ingredient) => {
              const selected = selectedCookingItems.includes(ingredient.id);
              const alreadyAdded = items.some(
                (item) => item.name === ingredient.name,
              );
              return (
                <Pressable
                  key={ingredient.id}
                  disabled={alreadyAdded}
                  onPress={() => toggleCookingItem(ingredient.id)}
                  style={[
                    styles.cookingImportRow,
                    theme && { borderTopColor: theme.border },
                    selected &&
                      theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <View
                    style={[
                      styles.cookingImportCheck,
                      theme && {
                        borderColor: selected ? theme.primary : theme.border,
                      },
                      selected &&
                        theme && { backgroundColor: theme.primary },
                    ]}
                  >
                    {selected && (
                      <Glyph name="check" size={12} color="#FFFFFF" weight={2.6} />
                    )}
                  </View>
                  <View style={styles.cookingImportItemCopy}>
                    <Text
                      style={[
                        styles.cookingImportItemName,
                        theme && {
                          color: alreadyAdded ? theme.muted : theme.text,
                        },
                      ]}
                    >
                      {ingredient.name}
                    </Text>
                    <Text
                      style={[
                        styles.cookingImportItemMeta,
                        theme && { color: theme.muted },
                      ]}
                    >
                      {ingredient.quantity} · {ingredient.owner}
                      {alreadyAdded ? " · 이미 추가됨" : ""}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="준비물 목록 붙여넣기"
        subtitle="메모에서 여러 줄을 고쳐 한 번에 반영하세요"
        submit={importMode === "교체" ? "목록 교체" : "목록에 추가"}
        confirmSubmit={
          importMode === "교체" && items.length
            ? `저장한 준비물 ${items.length}개를 지우고 붙여넣은 것으로 바꿔요. 되돌릴 수 없어요.`
            : undefined
        }
        disabledHint={!importText.trim() ? "목록을 입력해 주세요" : undefined}
        submitDisabled={!importText.trim()}
        onClose={() => setImporting(false)}
        onSubmit={importPacking}
      >
        <OptionField
          label="목록 반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
        <DetailField
          label="붙여넣을 준비물 목록 · 필수"
          value={importText}
          onChangeText={setImportText}
          multiline
          placeholder="준비물마다 한 줄씩 붙여넣으세요"
        />
        <Text style={[styles.settingHint, theme && { color: theme.muted }]}>
          담당: {ownerSections.join("·")} / 태그는 #으로 여러 개 적을 수 있어요
        </Text>
      </DetailSheet>
    </View>
  );
}

type CookingItem = {
  id: string;
  name: string;
  quantity: string;
  group: string;
  owner: string;
};
type Recipe = {
  id: string;
  name: string;
  note: string;
  url?: string;
  ingredients: CookingItem[];
};

/** 현지에서 사 온다는 표시. 사람이 아니라서 참가자 목록 밖에 둔다. */
const COOKING_BUY = "구매";
const COOKING_UNASSIGNED = "미정";

/** 재료를 누가 챙기는지 고를 수 있는 것들. */
const cookingOwnerOptions = (participants: string[]) => [
  COOKING_UNASSIGNED,
  ...participants,
  COOKING_BUY,
];

/**
 * GPT 가 돌려준 줄을 요리와 재료로 읽는다.
 *
 * "요리 | 이름 | 메모 | 링크" 와 "재료 | 이름 | 양 | 묶음 | 담당" 두 가지만 읽고
 * 나머지 줄은 버린다. 넣기 전에 몇 개가 읽혔는지 미리 세어 보여주려고 컴포넌트
 * 밖으로 꺼냈다. 같은 함수가 미리 읽기와 실제 추가에 함께 쓰인다.
 */
function parseAiRecipes(text: string, stamp: number): Recipe[] {
  const parsed: Recipe[] = [];
  let currentRecipe: Recipe | null = null;
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const [type, ...values] = line.split("|").map((value) => value.trim());
      if (type === "요리" && values[0]) {
        currentRecipe = {
          id: `ai-recipe-${stamp}-${index}`,
          name: values[0],
          note: values[1] || "메모 없음",
          url: values[2] || "",
          ingredients: [],
        };
        parsed.push(currentRecipe);
        return;
      }
      if (type === "재료" && values[0] && currentRecipe) {
        currentRecipe.ingredients.push({
          id: `ai-ingredient-${stamp}-${index}`,
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

const initialRecipes: Recipe[] = [
    {
      id: "mille",
      name: "버섯전골",
      note: "첫날 저녁 · 숙소에서",
      url: "https://www.youtube.com/results?search_query=버섯전골+레시피",
      ingredients: [
        {
          id: "c1",
          name: "배추",
          quantity: "1/4통",
          group: "기본",
          owner: "구매",
        },
        {
          id: "c2",
          name: "깻잎",
          quantity: "20장",
          group: "기본",
          owner: "여울",
        },
        {
          id: "c3",
          name: "소고기",
          quantity: "250g",
          group: "기본",
          owner: "구매",
        },
        {
          id: "c4",
          name: "코인육수",
          quantity: "2개",
          group: "육수",
          owner: "여울",
        },
        {
          id: "c5",
          name: "양파",
          quantity: "1/2개",
          group: "소스",
          owner: "하늘",
        },
        {
          id: "c6",
          name: "고추냉이",
          quantity: "조금",
          group: "소스",
          owner: "미정",
        },
      ],
    },
    {
      id: "clam",
      name: "바지락 술찜",
      note: "둘째 날 저녁 · 간단한 안주",
      url: "https://www.youtube.com/results?search_query=바지락+술찜+레시피",
      ingredients: [
        {
          id: "clam-1",
          name: "바지락",
          quantity: "500g",
          group: "기본",
          owner: "구매",
        },
        {
          id: "clam-2",
          name: "마늘",
          quantity: "6알",
          group: "기본",
          owner: "하늘",
        },
        {
          id: "clam-3",
          name: "버터",
          quantity: "20g",
          group: "소스",
          owner: "여울",
        },
        {
          id: "clam-4",
          name: "화이트와인",
          quantity: "100ml",
          group: "소스",
          owner: "구매",
        },
        {
          id: "clam-5",
          name: "페페론치노",
          quantity: "3개",
          group: "양념",
          owner: "하늘",
        },
      ],
    },
    {
      id: "toast",
      name: "프렌치토스트",
      note: "마지막 날 아침 · 체크아웃 전에",
      url: "https://www.youtube.com/results?search_query=프렌치토스트+레시피",
      ingredients: [
        {
          id: "toast-1",
          name: "식빵",
          quantity: "4장",
          group: "기본",
          owner: "구매",
        },
        {
          id: "toast-2",
          name: "달걀",
          quantity: "2개",
          group: "반죽",
          owner: "구매",
        },
        {
          id: "toast-3",
          name: "우유",
          quantity: "150ml",
          group: "반죽",
          owner: "여울",
        },
        {
          id: "toast-4",
          name: "메이플 시럽",
          quantity: "1병",
          group: "토핑",
          owner: "하늘",
        },
        {
          id: "toast-5",
          name: "딸기",
          quantity: "1팩",
          group: "토핑",
          owner: "구매",
        },
      ],
    },
];

function Cooking({
  recipes,
  setRecipes,
  readyIngredientIds,
  setReadyIngredientIds,
  openPreparationImport,
  onRecordShopping,
  currency,
  participants,
}: {
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  readyIngredientIds: string[];
  setReadyIngredientIds: React.Dispatch<React.SetStateAction<string[]>>;
  openPreparationImport: () => void;
  /** 장 본 금액을 비용 탭에 적는다. 부르면 지출 한 건이 생긴다. */
  onRecordShopping: (title: string, amount: number) => void;
  currency: string;
  /** 이번 여행에 가는 사람. 재료를 누가 챙기는지도 이 목록에서 고른다. */
  participants: string[];
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const [activeId, setActiveId] = useState("mille");
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<CookingItem | null>(null);
  const [editingRecipe, setEditingRecipe] = useState(false);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [showMyIngredients, setShowMyIngredients] = useState(false);
  // 장을 보고 나면 그 금액을 비용 탭에 또 손으로 옮겨 적게 된다. 목록을 보는
  // 자리에서 바로 적을 수 있게 한다.
  const [shoppingCost, setShoppingCost] = useState("");
  const [ingredientOwnerFilter, setIngredientOwnerFilter] = useState("전체");
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [importing, setImporting] = useState(false);
  // 교체는 저장해 둔 것을 통째로 지운다. 되돌릴 수 없으니 기본은 추가로 둔다.
  const [importMode, setImportMode] = useState<"교체" | "추가">("추가");
  const [importText, setImportText] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [group, setGroup] = useState("기본");
  const [owner, setOwner] = useState(COOKING_UNASSIGNED);
  const [recipeName, setRecipeName] = useState("");
  const [recipeNote, setRecipeNote] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [collapsedCookingGroups, setCollapsedCookingGroups] = useState<string[]>(() =>
    Array.from(new Set((recipes.find((recipe) => recipe.id === "mille") ?? recipes[0])?.ingredients.map((item) => item.group) ?? [])),
  );
  const activeRecipe =
    recipes.find((recipe) => recipe.id === activeId) || recipes[0];
  const menuRecipes = recipes.length > 4 && activeRecipe
    ? [activeRecipe, ...recipes.filter((recipe) => recipe.id !== activeRecipe.id)].slice(0, 4)
    : recipes;
  const ingredients = activeRecipe?.ingredients || [];
  const readyIngredientCount = ingredients.filter((item) =>
    readyIngredientIds.includes(item.id),
  ).length;
  const ingredientProgress = ingredients.length
    ? Math.round((readyIngredientCount / ingredients.length) * 100)
    : 0;
  const groups = Array.from(new Set(ingredients.map((item) => item.group)));
  const selectRecipe = (id: string) => {
    const selected = recipes.find((recipe) => recipe.id === id);
    setCollapsedCookingGroups(Array.from(new Set(selected?.ingredients.map((item) => item.group) ?? [])));
    setActiveId(id);
  };
  const allCookingIngredients = recipes.flatMap((recipe) =>
    recipe.ingredients.map((item) => ({ ...item, recipeId: recipe.id, recipe: recipe.name })),
  );
  // 목록에 이미 적힌 담당 가운데 참가자에서 빠진 이름도 거를 수 있게 남긴다.
  // 여행 도중 참가자가 바뀌어도 예전에 적어 둔 재료가 안 보이면 곤란하다.
  const shoppingOwnerOptions = useMemo(() => {
    const known = cookingOwnerOptions(participants);
    const extra = Array.from(new Set(allCookingIngredients.map((item) => item.owner)))
      .filter((owner) => owner && !known.includes(owner));
    return ["전체", ...known, ...extra];
  }, [allCookingIngredients, participants]);
  const filteredShoppingCount = ingredientOwnerFilter === "전체"
    ? allCookingIngredients.length
    : allCookingIngredients.filter((item) => item.owner === ingredientOwnerFilter).length;
  const duplicateIngredient = Boolean(activeRecipe) && activeRecipe.ingredients.some(
    (item) => item.id !== editingIngredient?.id && item.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const ingredientFormValid = Boolean(name.trim()) && !duplicateIngredient;
  const duplicateRecipe = recipes.some(
    (recipe) => recipe.id !== (editingRecipe ? activeRecipe?.id : undefined) && recipe.name.trim().toLowerCase() === recipeName.trim().toLowerCase(),
  );
  const recipeUrlValid = !recipeUrl.trim() || /^(https?:\/\/)?[^\s]+\.[^\s]+/i.test(recipeUrl.trim());
  const recipeFormValid = Boolean(recipeName.trim()) && !duplicateRecipe && recipeUrlValid;
  const cookingPrompt = `아래 메모를 Daymo 요리 목록 형식으로 변환하라.
규칙:
1. 설명, 인사, 번호, 마크다운을 절대 쓰지 않는다.
2. 각 요리의 첫 줄은 반드시: 요리 | 이름 | 메모 | 참고 링크
3. 이어지는 재료는 반드시: 재료 | 이름 | 수량 | 분류 | 준비
4. 준비 값은 ${cookingOwnerOptions(participants).join(", ")} 중 하나만 쓴다.
5. 참고 링크는 메모에 URL이 있을 때만 쓰고, 없으면 비워둔다.
6. 모르는 값은 미정으로 쓰고, 구분자는 반드시 | 만 사용한다.
7. 결과만 출력한다.

[내 메모]
여기에 만들 요리와 재료 메모를 붙여넣으세요.`;
  const addIngredient = () => {
    if (!ingredientFormValid || !activeRecipe) return;
    const wasEditing = Boolean(editingIngredient);
    const next = {
      id: `${Date.now()}`,
      name: name.trim(),
      quantity: quantity.trim(),
      group,
      owner,
    };
    setRecipes((current) =>
      current.map((recipe) => {
        if (recipe.id !== activeRecipe.id) return recipe;
        return {
          ...recipe,
          ingredients: editingIngredient
            ? recipe.ingredients.map((item) =>
                item.id === editingIngredient.id ? { ...next, id: item.id } : item,
              )
            : [...recipe.ingredients, next],
        };
      }),
    );
    setName("");
    setQuantity("");
    setGroup("기본");
    setOwner(COOKING_UNASSIGNED);
    setEditingIngredient(null);
    setAddingIngredient(false);
    notify(wasEditing ? "재료를 수정했어요" : "재료를 추가했어요");
  };
  const openIngredientEdit = (item: CookingItem) => {
    setEditingIngredient(item);
    setName(item.name);
    setQuantity(item.quantity);
    setGroup(item.group);
    setOwner(item.owner);
    setAddingIngredient(true);
  };
  const closeIngredientSheet = () => {
    setAddingIngredient(false);
    setEditingIngredient(null);
    setName("");
    setQuantity("");
    setGroup("기본");
    setOwner(COOKING_UNASSIGNED);
  };
  const addRecipe = () => {
    if (!recipeFormValid) return;
    if (editingRecipe && activeRecipe) {
      setRecipes((current) =>
        current.map((recipe) =>
          recipe.id === activeRecipe.id
            ? {
                ...recipe,
                name: recipeName.trim(),
                note: recipeNote.trim() || "메모 없음",
                url: recipeUrl.trim(),
              }
            : recipe,
        ),
      );
      setRecipeName("");
      setRecipeNote("");
      setRecipeUrl("");
      setEditingRecipe(false);
      setAddingRecipe(false);
      notify("요리 정보를 수정했어요");
      return;
    }
    const id = `recipe-${Date.now()}`;
    setRecipes((current) => [
      ...current,
      {
        id,
        name: recipeName.trim(),
        note: recipeNote.trim() || "언제 먹을지 정해보세요",
        url: recipeUrl.trim(),
        ingredients: [],
      },
    ]);
    setCollapsedCookingGroups([]);
    setActiveId(id);
    setRecipeName("");
    setRecipeNote("");
    setRecipeUrl("");
    setAddingRecipe(false);
    notify("요리를 추가했어요");
  };
  // 요리 카드의 ... 도 여기로 온다. 전에는 경고창을 띄워 수정과 삭제를 고르게
  // 했는데, 경고창은 되돌릴 수 없는 일에 쓰는 것이라 수정하러 갈 때마다 한 번씩
  // 긴장하게 됐다. 다른 탭처럼 바로 수정 창을 열고 삭제는 그 창 아래에 둔다.
  const openRecipeEdit = () => {
    if (!activeRecipe) return;
    setRecipeName(activeRecipe.name);
    setRecipeNote(activeRecipe.note);
    setRecipeUrl(activeRecipe.url || "");
    setEditingRecipe(true);
    setAddingRecipe(true);
  };
  const closeRecipeSheet = () => {
    setAddingRecipe(false);
    setEditingRecipe(false);
    setRecipeName("");
    setRecipeNote("");
    setRecipeUrl("");
  };
  // 넣기 전에 몇 개가 읽혔는지 센다. 붙여넣고 나서 무엇이 들어갈지 모른 채
  // 버튼을 누르던 것이 이 흐름에서 가장 불안한 대목이었다.
  const aiParsed: Recipe[] = useMemo(() => parseAiRecipes(aiResult, 0), [aiResult]);
  const aiIngredientCount = aiParsed.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
  const copyCookingPrompt = async () => {
    await Clipboard.setStringAsync(cookingPrompt);
    notify("프롬프트를 복사했어요");
  };
  // 복사한 뒤 브라우저까지 열어 준다. 앱을 나갔다 오는 건 그대로지만 사용자가
  // 직접 찾아 들어가는 한 단계가 줄고, 무엇을 하러 나가는지도 분명해진다.
  const copyPromptAndOpenGpt = async () => {
    await Clipboard.setStringAsync(cookingPrompt);
    const opened = await Linking.openURL("https://chatgpt.com/").then(
      () => true,
      () => false,
    );
    notify(opened ? "프롬프트를 복사했어요. 붙여넣고 결과를 다시 가져오세요" : "프롬프트를 복사했어요");
  };
  const pasteAiResult = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text.trim()) {
      notify("복사한 내용이 없어요");
      return;
    }
    setAiResult(text);
  };
  const importAiRecipes = () => {
    const parsed = parseAiRecipes(aiResult, Date.now());
    if (!parsed.length) {
      notify("요리 줄을 못 찾았어요. 형식이 맞는지 봐 주세요");
      return;
    }
    const existingRecipeNames = new Set(recipes.map((recipe) => recipe.name.trim().toLowerCase()));
    const uniqueParsed = parsed
      .filter((recipe, index, values) =>
        !existingRecipeNames.has(recipe.name.trim().toLowerCase()) &&
        values.findIndex((value) => value.name.trim().toLowerCase() === recipe.name.trim().toLowerCase()) === index,
      )
      .map((recipe) => ({
        ...recipe,
        ingredients: recipe.ingredients.filter((item, index, values) =>
          values.findIndex((value) => value.name.trim().toLowerCase() === item.name.trim().toLowerCase()) === index,
        ),
      }));
    if (!uniqueParsed.length) {
      notify("이미 등록한 요리뿐이에요");
      return;
    }
    setRecipes((current) => [...current, ...uniqueParsed]);
    setCollapsedCookingGroups(Array.from(new Set(uniqueParsed[0].ingredients.map((item) => item.group))));
    setActiveId(uniqueParsed[0].id);
    setAiResult("");
    setAiImporting(false);
    notify(`요리 ${uniqueParsed.length}개를 추가했어요`);
  };
  const deleteRecipe = () => {
    if (!activeRecipe) return;
    const remaining = recipes.filter((recipe) => recipe.id !== activeRecipe.id);
    setRecipes(remaining);
    setCollapsedCookingGroups(Array.from(new Set(remaining[0]?.ingredients.map((item) => item.group) ?? [])));
    setActiveId(remaining[0]?.id || "");
    closeRecipeSheet();
    notify("요리와 재료 목록을 삭제했어요");
  };
  const openRecipeLink = () => {
    if (!activeRecipe?.url) return;
    const target = /^https?:\/\//i.test(activeRecipe.url)
      ? activeRecipe.url
      : `https://${activeRecipe.url}`;
    Linking.openURL(encodeURI(target));
  };
  const removeIngredient = (item: CookingItem) =>
    Alert.alert("재료를 삭제할까요?", item.name, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          setRecipes((current) =>
            current.map((recipe) =>
              recipe.id === activeId
                ? {
                    ...recipe,
                    ingredients: recipe.ingredients.filter(
                      (value) => value.id !== item.id,
                    ),
                  }
                : recipe,
            ),
          );
          notify("재료를 삭제했어요");
        },
      },
    ]);
  const copyCooking = async () => {
    await Clipboard.setStringAsync(
      ingredients
        .map(
          (item) =>
            `${item.name} | ${item.quantity} | ${item.group} | ${item.owner}`,
        )
        .join("\n"),
    );
    notify("요리 재료 목록을 복사했어요");
  };
  const openImport = async () => {
    setImportText(await Clipboard.getStringAsync());
    setImporting(true);
  };
  const importCooking = () => {
    const stamp = Date.now();
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [
          itemName,
          itemQuantity = "",
          itemGroup = "기본",
          itemOwner = "미정",
        ] = line.split("|").map((value) => value.trim());
        return {
          id: `${stamp}-${index}`,
          name: itemName,
          quantity: itemQuantity,
          group: itemGroup,
          owner: itemOwner,
        };
      })
      .filter((item, index, values) =>
        Boolean(item.name) &&
        values.findIndex((value) => value.name.trim().toLowerCase() === item.name.trim().toLowerCase()) === index,
      );
    if (!parsed.length) return;
    const existingNames = new Set(ingredients.map((item) => item.name.trim().toLowerCase()));
    const additions = importMode === "교체"
      ? parsed
      : parsed.filter((item) => !existingNames.has(item.name.trim().toLowerCase()));
    setRecipes((current) =>
      current.map((recipe) =>
        recipe.id === activeId
          ? {
              ...recipe,
              ingredients:
                importMode === "교체"
                  ? additions
                  : [...recipe.ingredients, ...additions],
            }
          : recipe,
      ),
    );
    setImporting(false);
    notify(additions.length ? `요리 재료 ${additions.length}개를 반영했어요` : "이미 등록한 재료뿐이에요");
  };
  return (
    <View>
      <TabActionHeader
        label="요리 메뉴"
        count={`${recipes.length}개`}
        action="요리 추가"
        onPress={() => setAddingRecipe(true)}
      />
      {recipes.length > 0 && (
        <View style={styles.recipeSelector}>
          <View style={styles.recipeSelectorHead}>
            <Text style={[styles.recipeSelectorTitle, theme && { color: theme.muted }]}>메뉴</Text>
            <View style={styles.recipeSelectorActions}>
              {/* 개수는 바로 위 탭 머리글이 이미 보여준다. 넘칠 때만 더 보기를 낸다. */}
              {recipes.length > 4 && (
                <Pressable onPress={() => setShowAllRecipes(true)}>
                  <View style={styles.inlineMore}>
                    <Text style={[styles.recipeSelectorMore, theme && { color: theme.primary }]}>전체 {recipes.length}개</Text>
                    <Glyph name="chevronRight" size={13} color={theme?.primary ?? "#3F4C8F"} />
                  </View>
                </Pressable>
              )}
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cookV2MenuList}
          >
            {menuRecipes.map((recipe) => {
              const index = recipes.findIndex((item) => item.id === recipe.id);
              const selected = recipe.id === activeId;
              return (
                <Pressable
                  key={recipe.id}
                  onPress={() => selectRecipe(recipe.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${recipe.name} 메뉴, 재료 ${recipe.ingredients.length}개`}
                  style={[
                    styles.cookV2MenuCard,
                    theme && {
                      backgroundColor: selected ? theme.primarySoft : theme.surface,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <View style={styles.cookV2MenuTop}>
                    <Text style={[styles.cookV2MenuNumber, theme && { color: selected ? theme.primary : theme.muted }]}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text style={[styles.cookV2MenuCount, theme && { color: selected ? theme.primary : theme.muted }]}>{recipe.ingredients.length}개</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.cookV2MenuName, theme && { color: theme.text }]}>{recipe.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
      {allCookingIngredients.length > 0 && (
        <View
          style={[
            styles.myCookingBox,
            theme && {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Pressable
            onPress={() => setShowMyIngredients(true)}
            accessibilityRole="button"
            accessibilityLabel={`통합 장보기 목록, 전체 재료 ${allCookingIngredients.length}개`}
            style={styles.myCookingCompact}
          >
            <View style={[styles.myCookingIcon, theme && { backgroundColor: theme.primarySoft }]}>
              {[0, 1, 2].map((line) => (
                <View key={line} style={styles.cookV2MemoLine}>
                  <View style={[styles.cookV2MemoDot, theme && { backgroundColor: theme.primary }]} />
                  <View
                    style={[
                      styles.cookV2MemoRule,
                      line === 2 && styles.cookV2MemoRuleShort,
                      theme && { backgroundColor: theme.primary },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.myCookingCopy}>
              <Text style={[styles.cookV2MyEyebrow, theme && { color: theme.primary }]}>통합 장보기</Text>
              <Text style={[styles.myCookingTitle, theme && { color: theme.text }]}>전체 재료 {allCookingIngredients.length}개</Text>
              <Text numberOfLines={1} style={[styles.myCookingSummary, theme && { color: theme.muted }]}>현지 구매 {allCookingIngredients.filter((item) => item.owner === "구매").length}개 · 집에서 {allCookingIngredients.filter((item) => item.owner !== "구매").length}개</Text>
            </View>
            <Glyph name="chevronRight" size={16} color={theme?.primary ?? "#3F4C8F"} />
          </Pressable>
        </View>
      )}
      {!activeRecipe ? (
        <View
          style={[
            styles.emptyCooking,
            theme && {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text
            style={[styles.emptyCookingTitle, theme && { color: theme.text }]}
          >
            만들 요리를 추가해 보세요.
          </Text>
          <Text
            style={[styles.emptyCookingText, theme && { color: theme.muted }]}
          >
            요리별로 재료와 준비 방법을 나눌 수 있어요.
          </Text>
          <Pressable
            onPress={() => setAddingRecipe(true)}
            style={[styles.emptyCookingAction, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[styles.emptyCookingActionText, theme && { color: theme.primary }]}>첫 요리 추가</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.cookingHero,
              styles.cookV2Hero,
              theme && { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.cookingHeroCopy}>
              <Text style={[styles.cookingEyebrow, theme && { color: theme.primary }]}>{ingredientProgress === 100 ? "재료 준비 완료" : "이번 여행의 한 끼"}</Text>
              <Text
                style={[styles.cookingTitle, theme && { color: theme.text }]}
              >
                {activeRecipe.name}
              </Text>
              <Text
                style={[styles.cookingNote, theme && { color: theme.muted }]}
              >
                {activeRecipe.note}
              </Text>
              {activeRecipe.url ? (
                <Pressable
                  onPress={openRecipeLink}
                  accessibilityRole="link"
                  style={styles.recipeLink}
                >
                  <Glyph name="play" size={13} color={theme?.primary ?? "#3F4C8F"} />
                  <Text style={[styles.recipeLinkText, theme && { color: theme.primary }]}>레시피 영상 보기</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.cookingHeroActions}>
              <Pressable
                onPress={openRecipeEdit}
                accessibilityRole="button"
                accessibilityLabel={activeRecipe ? `${activeRecipe.name} 수정` : "요리 수정"}
                style={[
                  styles.cookingMoreButton,
                  theme && { backgroundColor: theme.surface },
                ]}
              >
                <Glyph name="more" size={18} color={theme?.muted ?? "#646C7A"} weight={2.6} />
              </Pressable>
              <View style={[styles.cookV2ProgressBadge, theme && { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.cookV2ProgressBadgeValue, theme && { color: theme.primary }]}>{ingredientProgress}%</Text>
                <Text style={[styles.cookV2ProgressBadgeLabel, theme && { color: theme.muted }]}>재료 준비</Text>
              </View>
            </View>
          </View>
          <View style={styles.cookingToolbar}>
            <Text style={[styles.cookingTip, theme && { color: theme.muted }]}>
              필요한 재료
            </Text>
            <Pressable
              onPress={() => setAddingIngredient(true)}
              style={[styles.placeAdd, theme && { backgroundColor: theme.primarySoft }]}
            >
              <Text style={[styles.placeAddText, theme && { color: theme.primary }]}>＋ 재료 추가</Text>
            </Pressable>
          </View>
          {ingredients.length === 0 && (
            <EmptyState
              title="아직 재료가 없어요"
              description="첫 재료를 추가하거나 목록을 붙여넣어 요리를 준비해 보세요."
              action="첫 재료 추가"
              onPress={() => setAddingIngredient(true)}
            />
          )}
          {groups.map((section, groupIndex) => {
            const sectionItems = ingredients.filter((item) => item.group === section);
            const sectionReadyCount = sectionItems.filter((item) => readyIngredientIds.includes(item.id)).length;
            const collapsed = collapsedCookingGroups.includes(section);
            const groupAccent = theme
              ? [theme.primary, theme.secondary, theme.accent][groupIndex % 3]
              : ["#E89B58", "#55BFB4", "#8B7CF6"][groupIndex % 3];
            return (
              <View
              key={section}
              style={[
                styles.cookingSection,
                theme && {
                  backgroundColor: theme.surface,
                  borderColor: `${groupAccent}55`,
                  transform: [
                    {
                      rotate: groups.indexOf(section) % 2 ? ".2deg" : "-.2deg",
                    },
                  ],
                },
              ]}
              >
              <Pressable
                onPress={() =>
                  setCollapsedCookingGroups((current) =>
                    current.includes(section)
                      ? current.filter((groupName) => groupName !== section)
                      : [...current, section],
                  )
                }
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                style={[styles.cookV2SectionHead, { backgroundColor: `${groupAccent}0D` }]}
              >
                <View style={styles.cookV2SectionTitleRow}>
                  <View style={[styles.cookV2SectionLabel, { backgroundColor: `${groupAccent}20` }]}>
                    <Text style={[styles.cookV2SectionLabelText, { color: groupAccent }]}>{String(groupIndex + 1).padStart(2, "0")}</Text>
                  </View>
                  <Text style={[styles.cookingSectionTitle, styles.cookV2SectionTitle, theme && { color: theme.text }]}>{section}</Text>
                </View>
                <View style={styles.cookV2SectionActions}>
                  <Text style={[styles.cookV2SectionCount, theme && { color: theme.muted }]}>{sectionReadyCount}/{sectionItems.length} 준비</Text>
                  <Glyph name={collapsed ? "chevronRight" : "chevronDown"} size={16} color={theme?.muted ?? "#646C7A"} weight={2.2} />
                </View>
              </Pressable>
              {!collapsed && sectionItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openIngredientEdit(item)}
                    onLongPress={() => removeIngredient(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, ${item.quantity}, ${item.owner}, 수정`}
                    style={[
                      styles.ingredientRow,
                      readyIngredientIds.includes(item.id) && styles.cookV2IngredientDone,
                    ]}
                  >
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setReadyIngredientIds((current) =>
                          current.includes(item.id)
                            ? current.filter((id) => id !== item.id)
                            : [...current, item.id],
                        );
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: readyIngredientIds.includes(item.id) }}
                      accessibilityLabel={`${item.name} ${readyIngredientIds.includes(item.id) ? "준비 완료 해제" : "준비 완료"}`}
                      hitSlop={11}
                      style={[
                        styles.cookV2IngredientCheck,
                        theme && {
                          borderColor: readyIngredientIds.includes(item.id) ? theme.primary : theme.border,
                          backgroundColor: readyIngredientIds.includes(item.id) ? theme.primary : theme.surface,
                        },
                      ]}
                    >
                      {readyIngredientIds.includes(item.id) && (
                        <Glyph name="check" size={12} color="#FFFFFF" weight={2.6} />
                      )}
                    </Pressable>
                    <View style={styles.ingredientBody}>
                      <Text
                        style={[
                          styles.ingredientName,
                          theme && { color: theme.text },
                          readyIngredientIds.includes(item.id) && styles.cookV2IngredientNameDone,
                        ]}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.ingredientOwner,
                          theme && { color: theme.muted },
                        ]}
                      >
                        {item.owner}
                      </Text>
                    </View>
                    <Text style={[styles.ingredientQuantity, theme && { color: theme.muted }]}>
                      {item.quantity}
                    </Text>
                  </Pressable>
                ))}
            </View>
            );
          })}
          <Text style={[styles.longPressHint, theme && { color: theme.muted }]}>
            왼쪽 원을 눌러 준비 여부를 체크하고, 재료 이름을 누르면 수정할 수 있어요.
          </Text>
          <View
            style={[
              styles.packingListTools,
              theme && { borderTopColor: theme.border },
            ]}
          >
            <View style={styles.packingListToolsCopy}>
              <Text
                style={[
                  styles.packingListToolsTitle,
                  theme && { color: theme.text },
                ]}
              >
                목록 한꺼번에 수정
              </Text>
              <Text
                style={[
                  styles.packingListToolsHint,
                  theme && { color: theme.muted },
                ]}
              >
                복사해 수정한 뒤 다시 붙여넣을 수 있어요
              </Text>
            </View>
            <Pressable
              onPress={copyCooking}
              style={[
                styles.packingToolButton,
                theme && { borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  styles.packingToolButtonText,
                  theme && { color: theme.text },
                ]}
              >
                복사
              </Text>
            </Pressable>
            <Pressable
              onPress={openImport}
              style={[
                styles.packingToolButton,
                theme && { borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  styles.packingToolButtonText,
                  theme && { color: theme.text },
                ]}
              >
                붙여넣기
              </Text>
            </Pressable>
          </View>
        </>
      )}
      <DetailSheet
        visible={showAllRecipes}
        title="전체 요리 메뉴"
        subtitle={`${recipes.length}개 요리 중 확인할 메뉴를 고르면 돼요`}
        submit="닫기"
        onClose={() => setShowAllRecipes(false)}
        onSubmit={() => setShowAllRecipes(false)}
      >
        <View style={[styles.recipeList, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {recipes.map((recipe, index) => (
            <Pressable
              key={recipe.id}
              onPress={() => {
                selectRecipe(recipe.id);
                setShowAllRecipes(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: recipe.id === activeId }}
              style={[
                styles.recipeListRow,
                index > 0 && styles.recipeListRowBorder,
                theme && index > 0 && { borderTopColor: theme.border },
                recipe.id === activeId && theme && { backgroundColor: theme.primarySoft },
              ]}
            >
              <View style={[styles.recipeListNumber, theme && { backgroundColor: recipe.id === activeId ? theme.primary : theme.surfaceAlt }]}>
                <Text style={[styles.recipeListNumberText, theme && { color: recipe.id === activeId ? "#FFFFFF" : theme.muted }]}>{index + 1}</Text>
              </View>
              <View style={styles.recipeListCopy}>
                <Text numberOfLines={1} style={[styles.recipeListName, theme && { color: theme.text }]}>{recipe.name}</Text>
                <Text numberOfLines={1} style={[styles.recipeListNote, theme && { color: theme.muted }]}>{recipe.note}</Text>
              </View>
              <Text style={[styles.recipeListCount, theme && { color: theme.muted }]}>{recipe.ingredients.length}개</Text>
            </Pressable>
          ))}
        </View>
      </DetailSheet>
      <DetailSheet
        visible={showMyIngredients}
        title="통합 장보기 목록"
        subtitle={`요리 ${recipes.length}개의 재료를 준비 방법별로 확인하세요`}
        submit="준비 탭에서 가져오기"
        onClose={() => {
          setShoppingCost("");
          setShowMyIngredients(false);
        }}
        onSubmit={() => {
          setShoppingCost("");
          setShowMyIngredients(false);
          openPreparationImport();
        }}
      >
        <View style={[styles.shoppingCost, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <View style={styles.shoppingCostCopy}>
            <Text style={[styles.shoppingCostTitle, theme && { color: theme.text }]}>장 본 금액 적기</Text>
            <Text style={[styles.shoppingCostHint, theme && { color: theme.muted }]}>
              비용 탭에 식비로 한 건 들어가요
            </Text>
          </View>
          <TextInput
            accessibilityLabel="장 본 금액"
            value={shoppingCost}
            onChangeText={(text) => {
              const amount = parseAmount(text, currencyOf(currency).fraction);
              setShoppingCost(amount ? amountText(amount, currencyOf(currency).fraction) : "");
            }}
            keyboardType="numeric"
            placeholder="예: 41,500"
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[styles.shoppingCostInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
          <Pressable
            onPress={() => {
              const amount = parseAmount(shoppingCost, currencyOf(currency).fraction);
              if (!amount) {
                notify("금액을 입력해 주세요");
                return;
              }
              onRecordShopping("장보기", amount);
              setShoppingCost("");
              setShowMyIngredients(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="장 본 금액을 비용에 적기"
            style={[styles.shoppingCostButton, theme && { backgroundColor: theme.primary }]}
          >
            <Text style={styles.shoppingCostButtonText}>적기</Text>
          </Pressable>
        </View>
        <OptionField
          label={`담당 · ${filteredShoppingCount}개`}
          options={shoppingOwnerOptions}
          value={ingredientOwnerFilter}
          onChange={setIngredientOwnerFilter}
        />
        {recipes.map((recipe) => {
          const matching = ingredientOwnerFilter === "전체"
            ? recipe.ingredients
            : recipe.ingredients.filter((item) => item.owner === ingredientOwnerFilter);
          if (!matching.length) return null;
          return (
            <View key={recipe.id} style={[styles.myIngredientGroup, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Pressable
                onPress={() => {
                  selectRecipe(recipe.id);
                  setShowMyIngredients(false);
                }}
                style={styles.myIngredientGroupHead}
              >
                <Text numberOfLines={1} style={[styles.myIngredientGroupTitle, theme && { color: theme.text }]}>{recipe.name}</Text>
                <View style={styles.inlineMore}>
                  <Text style={[styles.myIngredientGroupCount, theme && { color: theme.primary }]}>{matching.length}개</Text>
                  <Glyph name="chevronRight" size={13} color={theme?.primary ?? "#3F4C8F"} />
                </View>
              </Pressable>
              {matching.map((item) => (
                <View key={item.id} style={[styles.myIngredientRow, theme && { borderTopColor: theme.border }]}>
                  <Text numberOfLines={1} style={[styles.myIngredientName, theme && { color: theme.text }]}>{item.name}</Text>
                  <Text numberOfLines={1} style={[styles.myIngredientQuantity, theme && { color: theme.muted }]}>{item.quantity} · {item.owner}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </DetailSheet>
      <DetailSheet
        visible={addingIngredient}
        title={editingIngredient ? "요리 재료 수정" : "요리 재료 추가"}
        subtitle="분류와 담당은 저장한 뒤에도 바꿀 수 있어요"
        submit={editingIngredient ? "변경 저장" : "재료 추가"}
        disabledHint={!ingredientFormValid ? (duplicateIngredient ? "이 요리에 이미 있는 재료예요" : "재료 이름을 입력해 주세요") : undefined}
        submitDisabled={!ingredientFormValid}
        destructiveLabel={editingIngredient ? "재료 삭제" : undefined}
        destructiveMessage="이 요리에서 재료를 빼요."
        onDestructive={() => {
          if (!editingIngredient) return;
          removeIngredient(editingIngredient);
          closeIngredientSheet();
        }}
        onClose={closeIngredientSheet}
        onSubmit={addIngredient}
      >
        <DetailField
          label="재료 이름 · 필수"
          value={name}
          onChangeText={setName}
          placeholder="예: 팽이버섯"
        />
        <DetailField
          label="수량 · 선택 사항"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="예: 1봉"
        />
        <View style={styles.tagEditor}>
          <Text
            style={[
              styles.detailFieldLabel,
              styles.selectorLabel,
              theme && { color: theme.muted },
            ]}
          >
            분류 · 선택 사항
          </Text>
          <View style={styles.tagSuggestions}>
            {["채소", "고기", "해산물", "양념", "소스", "토핑"].map(
              (category) => {
                const selected = group === category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => setGroup(category)}
                    style={[
                      styles.tagSuggestion,
                      selected && styles.tagSuggestionActive,
                      selected &&
                        theme && {
                          backgroundColor: theme.primarySoft,
                          borderColor: theme.primary,
                        },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagSuggestionText,
                        selected && styles.tagSuggestionTextActive,
                        selected && theme && { color: theme.primary },
                      ]}
                    >
                      {category}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
          <TextInput
            value={group}
            onChangeText={setGroup}
            placeholder="직접 입력 · 예: 유제품"
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[
              styles.tagInput,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />
        </View>
        <OptionField
          label="담당 · 선택 사항"
          options={cookingOwnerOptions(participants)}
          value={owner}
          onChange={setOwner}
        />
      </DetailSheet>
      <DetailSheet
        visible={addingRecipe}
        title={editingRecipe ? "요리 수정" : "요리 추가"}
        subtitle="이름만 먼저 저장하고 재료는 메뉴 안에서 추가할 수 있어요"
        submit={editingRecipe ? "변경 저장" : "요리 추가"}
        disabledHint={!recipeFormValid
          ? duplicateRecipe
            ? "이미 등록한 요리예요"
            : !recipeUrlValid
              ? "레시피 링크를 확인해 주세요"
              : "요리 이름을 입력해 주세요"
          : undefined}
        submitDisabled={!recipeFormValid}
        destructiveLabel={editingRecipe ? "요리 삭제" : undefined}
        destructiveMessage={editingRecipe ? `${recipeName || "이 요리"}와 재료 목록을 함께 삭제해요.` : undefined}
        onClose={closeRecipeSheet}
        onSubmit={addRecipe}
        onDestructive={deleteRecipe}
      >
        {!editingRecipe && <View
          style={[
            styles.aiRecipeCallout,
            theme && {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.aiRecipeCopy}>
            <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>여러 요리를 한 번에 추가</Text>
            <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>GPT가 정리한 요리와 재료를 붙여넣을 수 있어요.</Text>
          </View>
          <Pressable
            onPress={() => {
              setAddingRecipe(false);
              setAiImporting(true);
            }}
            style={[styles.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[styles.aiRecipeButtonText, theme && { color: theme.primary }]}>한꺼번에 추가</Text>
          </Pressable>
        </View>}
        <DetailField
          label="요리 이름 · 필수"
          value={recipeName}
          onChangeText={setRecipeName}
          placeholder="예: 김치볶음밥"
        />
        <DetailField
          label="메모 · 선택 사항"
          value={recipeNote}
          onChangeText={setRecipeNote}
          placeholder="예: 둘째 날 아침 · 남은 재료 활용"
        />
        <DetailField
          label="레시피 링크 · 선택 사항"
          value={recipeUrl}
          onChangeText={setRecipeUrl}
          placeholder="유튜브 또는 레시피 링크를 붙여넣으세요"
        />
      </DetailSheet>
      <DetailSheet
        visible={aiImporting}
        title="GPT로 여러 요리 추가"
        subtitle="프롬프트를 복사해 GPT에 요청하고 돌아와 결과를 붙여넣으면 돼요"
        submit={
          aiParsed.length
            ? `요리 ${aiParsed.length}개 추가`
            : "요리 추가"
        }
        disabledHint={!aiParsed.length ? (aiResult.trim() ? "읽을 수 있는 줄이 없어요" : "GPT 결과를 붙여넣어 주세요") : undefined}
        submitDisabled={!aiParsed.length}
        onClose={() => setAiImporting(false)}
        onSubmit={importAiRecipes}
      >
        <View
          style={[
            styles.aiPromptBox,
            theme && {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.aiPromptHead}>
            <View style={styles.aiRecipeCopy}>
              <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>1. 프롬프트 복사하고 GPT 열기</Text>
              <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>GPT 에 붙여넣고 그 아래에 요리와 재료 메모를 적으세요.</Text>
            </View>
            <Pressable
              onPress={copyPromptAndOpenGpt}
              accessibilityRole="button"
              accessibilityLabel="프롬프트를 복사하고 GPT 열기"
              style={styles.aiPromptCopyButton}
            >
              <Text style={styles.aiPromptCopyText}>복사하고 열기</Text>
            </Pressable>
          </View>
          <Text numberOfLines={4} style={[styles.aiPromptPreview, theme && { color: theme.muted }]}>{cookingPrompt}</Text>
          {/* 브라우저가 안 열리는 기기도 있다. 복사만 하는 길을 남긴다. */}
          <Pressable
            onPress={copyCookingPrompt}
            accessibilityRole="button"
            style={styles.aiPromptCopyOnly}
          >
            <Text style={[styles.aiRecipeText, theme && { color: theme.primary }]}>복사만 하기</Text>
          </Pressable>
        </View>
        <View style={styles.aiPasteRow}>
          <View>
            <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>2. 돌아와서 결과 붙여넣기</Text>
            <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>GPT 답을 복사해 두고 이 단추를 누르세요.</Text>
          </View>
          <Pressable
            onPress={pasteAiResult}
            style={[styles.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[styles.aiRecipeButtonText, theme && { color: theme.primary }]}>붙여넣기</Text>
          </Pressable>
        </View>
        <DetailField
          label="붙여넣은 결과"
          value={aiResult}
          onChangeText={setAiResult}
          multiline
          placeholder={"요리 | 김치볶음밥 | 둘째 날 아침 | https://youtu.be/...\n재료 | 김치 | 1컵 | 기본 | 구매"}
        />
        {/* 읽힌 결과를 넣기 전에 보여준다. 형식이 어긋나면 여기서 바로 안다. */}
        <Text style={[styles.settingHint, theme && { color: aiResult.trim() && !aiParsed.length ? theme.accent : theme.muted }]}>
          {!aiResult.trim()
            ? "여러 요리와 각 재료가 한 번에 추가돼요."
            : aiParsed.length
              ? `요리 ${aiParsed.length}개와 재료 ${aiIngredientCount}개를 읽었어요. ${aiParsed.map((recipe) => recipe.name).join(", ")}`
              : "요리 줄을 못 찾았어요. 각 줄이 '요리 |' 나 '재료 |' 로 시작하는지 봐 주세요."}
        </Text>
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="요리 목록 붙여넣기"
        subtitle="메모에서 수정한 재료를 한 번에 반영하세요"
        submit={importMode === "교체" ? "목록 교체" : "목록에 추가"}
        confirmSubmit={
          importMode === "교체" && recipes.length
            ? `저장한 요리 ${recipes.length}개를 지우고 붙여넣은 것으로 바꿔요. 되돌릴 수 없어요.`
            : undefined
        }
        disabledHint={!importText.trim() ? "목록을 입력해 주세요" : undefined}
        submitDisabled={!importText.trim()}
        onClose={() => setImporting(false)}
        onSubmit={importCooking}
      >
        <OptionField
          label="목록 반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
        <DetailField
          label="붙여넣을 재료 목록 · 필수"
          value={importText}
          onChangeText={setImportText}
          multiline
          placeholder="재료마다 한 줄씩 붙여넣으세요"
        />
      </DetailSheet>
    </View>
  );
}

function Memories({
  tripDate,
  dayOptions,
  todayDay,
  memories,
  setMemories,
}: {
  tripDate: string;
  /** 여행 날짜 칸. 비용 탭과 같은 목록에서 고르게 해야 손놀림이 같다. */
  dayOptions: string[];
  /** 여행 중이면 오늘. 사진은 대개 찍은 날에 넣는다. */
  todayDay: string;
  memories: TripMemoryData;
  setMemories: React.Dispatch<React.SetStateAction<TripMemoryData>>;
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const { photos, diaries, cardStyle, cardTitle, cardCaption } = memories;
  const setPhotos: React.Dispatch<React.SetStateAction<MemoryPhoto[]>> = (update) =>
    setMemories((current) => ({
      ...current,
      photos: typeof update === "function" ? update(current.photos) : update,
    }));
  const setDiaries: React.Dispatch<React.SetStateAction<TravelDiary[]>> = (update) =>
    setMemories((current) => ({
      ...current,
      diaries: typeof update === "function" ? update(current.diaries) : update,
    }));
  const setCardStyle = (value: string) => setMemories((current) => ({ ...current, cardStyle: value }));
  const setCardTitle = (value: string) => setMemories((current) => ({ ...current, cardTitle: value }));
  const setCardCaption = (value: string) => setMemories((current) => ({ ...current, cardCaption: value }));
  const [photoEditing, setPhotoEditing] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [photoSelected, setPhotoSelected] = useState(false);
  const [photoColor, setPhotoColor] = useState("#E7B4A6");
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoDate, setPhotoDate] = useState(todayDay || dayOptions[0] || UNDATED);
  const photoDayOptions = useMemo(() => {
    const known = [...dayOptions, UNDATED];
    const extra = Array.from(new Set(photos.map((photo) => photo.date)))
      .filter((date) => date && !known.includes(date));
    return [...known, ...extra];
  }, [dayOptions, photos]);
  const [photoCaption, setPhotoCaption] = useState("");
  const [diaryWriting, setDiaryWriting] = useState(false);
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryBody, setDiaryBody] = useState("");
  const [editingDiaryId, setEditingDiaryId] = useState<string | null>(null);
  const [makingCard, setMakingCard] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showAllDiaries, setShowAllDiaries] = useState(false);
  const photoPalette = ["#E7B4A6", "#DFC98A", "#AFC9C3", "#D4BDD4", "#C7D493", "#9CBBC6"];
  const openPhotoCreate = () => {
    setEditingPhotoId(null);
    setPhotoSelected(false);
    setPhotoColor(photoPalette[photos.length % photoPalette.length]);
    setPhotoUri(undefined);
    setPhotoDate(todayDay || dayOptions[0] || UNDATED);
    setPhotoCaption("");
    setPhotoEditing(true);
  };
  const openPhotoEdit = (photo: MemoryPhoto) => {
    setEditingPhotoId(photo.id);
    setPhotoSelected(true);
    setPhotoColor(photo.color);
    setPhotoUri(photo.uri);
    setPhotoDate(matchTripDay(photo.date, dayOptions));
    setPhotoCaption(photo.caption);
    setPhotoEditing(true);
  };
  const choosePhoto = async () => {
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        notify("사진을 추가하려면 사진 접근을 허용해 주세요");
        return;
      }
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        base64: Platform.OS === "web",
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const picked = Platform.OS === "web" && asset.base64
        ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`
        : asset.uri;
      // 고르기가 준 자리는 캐시 폴더라 OS 가 비울 수 있다. 남는 자리로 옮긴다.
      const uri = await keepTripPhoto(picked);
      setPhotoUri(uri);
      setPhotoSelected(true);
    } catch {
      notify("사진을 불러오지 못했어요");
    }
  };
  const copyPhotoIntoApp = async (uri: string) => {
    if (Platform.OS === "web" || uri.startsWith("data:") || uri.startsWith(FileSystem.documentDirectory ?? "__none__")) return uri;
    if (!FileSystem.documentDirectory) return uri;
    const directory = `${FileSystem.documentDirectory}trip-photos/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const rawExtension = uri.split("?")[0].match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
    const extension = rawExtension && rawExtension.length <= 5 ? rawExtension : "jpg";
    const target = `${directory}photo-${Date.now()}.${extension}`;
    await FileSystem.copyAsync({ from: uri, to: target });
    return target;
  };
  const removeStoredPhoto = (uri?: string) => {
    if (!uri || !FileSystem.documentDirectory || !uri.startsWith(FileSystem.documentDirectory)) return;
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  };
  const savePhoto = async () => {
    if (!photoSelected) return;
    const previous = photos.find((photo) => photo.id === editingPhotoId);
    let savedUri = photoUri;
    try {
      if (photoUri && photoUri !== previous?.uri) savedUri = await copyPhotoIntoApp(photoUri);
    } catch {
      notify("사진을 저장하지 못했어요. 다시 선택해 주세요");
      return;
    }
    const next = { id: editingPhotoId ?? `photo-${Date.now()}`, color: photoColor, date: photoDate.trim() || UNDATED, caption: photoCaption.trim(), uri: savedUri };
    setPhotos((current) => editingPhotoId
      ? current.map((photo) => photo.id === editingPhotoId ? next : photo)
      : [next, ...current]);
    if (previous?.uri && previous.uri !== savedUri) removeStoredPhoto(previous.uri);
    setPhotoEditing(false);
    notify(editingPhotoId ? "사진 정보를 수정했어요" : "사진을 기록에 추가했어요");
  };
  const deletePhoto = () => {
    const target = photos.find((photo) => photo.id === editingPhotoId);
    if (!target) return;
    setPhotos((current) => current.filter((photo) => photo.id !== target.id));
    removeStoredPhoto(target.uri);
    setPhotoEditing(false);
    notify("사진을 삭제했어요");
  };
  const openDiaryCreate = () => {
    setEditingDiaryId(null);
    setDiaryTitle("");
    setDiaryBody("");
    setDiaryWriting(true);
  };
  const openDiaryEdit = (diary: TravelDiary) => {
    setEditingDiaryId(diary.id);
    setDiaryTitle(diary.title);
    setDiaryBody(diary.body);
    setDiaryWriting(true);
  };
  const saveDiary = () => {
    if (!diaryBody.trim()) return;
    const next = { id: editingDiaryId ?? `diary-${Date.now()}`, title: diaryTitle.trim() || "이번 여행 이야기", body: diaryBody.trim(), date: editingDiaryId ? diaries.find((diary) => diary.id === editingDiaryId)?.date ?? "방금" : "방금" };
    setDiaries((current) => editingDiaryId
      ? current.map((diary) => diary.id === editingDiaryId ? next : diary)
      : [next, ...current]);
    setDiaryTitle("");
    setDiaryBody("");
    setDiaryWriting(false);
    notify(editingDiaryId ? "여행 일기를 수정했어요" : "여행 일기를 저장했어요");
  };
  const deleteDiary = () => {
    const target = diaries.find((diary) => diary.id === editingDiaryId);
    if (!target) return;
    setDiaries((current) => current.filter((diary) => diary.id !== target.id));
    setDiaryWriting(false);
    notify("여행 일기를 삭제했어요");
  };
  return (
    <View>
      <TabActionHeader
        label="여행 기록"
        count={`${photos.length + diaries.length}개`}
        action="사진 추가"
        onPress={openPhotoCreate}
      />
      <View style={styles.memorySummaryLine}>
        <Text style={[styles.memorySummaryText, theme && { color: theme.muted }]}>사진 {photos.length}장 · 일기 {diaries.length}편</Text>
        <Text style={[styles.memorySummaryText, theme && { color: theme.primary }]}>{new Set(photos.map((photo) => photo.date).filter((date) => date && date !== UNDATED)).size}일의 기록</Text>
      </View>
      <SectionLabel label="여행 사진" count={`${photos.length}장`} />
      <View style={styles.memoryGrid}>
        {(showAllPhotos ? photos : photos.slice(0, 6)).map((photo, index) => (
          <Pressable
            key={photo.id}
            onPress={() => openPhotoEdit(photo)}
            accessibilityRole="button"
            accessibilityLabel={`${photo.caption || photo.date} 사진 수정`}
            style={[styles.memoryTile, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <View style={[styles.memoryTilePhoto, { backgroundColor: photo.color }]}>
              {photo.uri && <Image source={{ uri: photo.uri }} resizeMode="cover" style={styles.memoryPhotoImage} />}
              <View style={styles.memoryTileGlow} />
            </View>
            <View style={styles.memoryTileCaption}>
              <Text numberOfLines={1} style={[styles.tileNumber, theme && { color: theme.text }]}>{photo.caption || `사진 ${index + 1}`}</Text>
              <Text style={[styles.memoryTileDate, theme && { color: theme.muted }]}>{photo.date}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      {photos.length === 0 && <EmptyState title="아직 추가한 사진이 없어요" description="여행의 첫 장면을 기록에 추가해 보세요." action="사진 추가" onPress={openPhotoCreate} />}
      {photos.length > 6 && <ListMoreButton expanded={showAllPhotos} hiddenCount={photos.length - 6} onPress={() => setShowAllPhotos((value) => !value)} />}
      <SectionLabel
        label="여행 일기"
        action="일기 쓰기"
        onPress={openDiaryCreate}
      />
      {(showAllDiaries ? diaries : diaries.slice(0, 3)).map((diary, index) => (
        <Pressable
          key={diary.id}
          onPress={() => openDiaryEdit(diary)}
          accessibilityRole="button"
          accessibilityLabel={`${diary.title} 일기 수정`}
          style={[
            styles.diaryCard,
            theme && { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={[styles.diaryRuleSide, theme && { backgroundColor: theme.primary }]} />
          <View style={styles.diaryPaperRules} pointerEvents="none">
            {[0, 1, 2].map((rule) => (
              <View key={rule} style={[styles.diaryPaperRule, theme && { backgroundColor: theme.border }]} />
            ))}
          </View>
          <Text style={[styles.diaryDate, theme && { color: theme.primary }]}>{diary.date}</Text>
          <Text style={[styles.diaryTitle, theme && { color: theme.text }]}>{diary.title}</Text>
          <Text numberOfLines={3} style={[styles.diaryBody, theme && { color: theme.muted }]}>{diary.body}</Text>
        </Pressable>
      ))}
      {diaries.length === 0 && (
        <EmptyState
          title="아직 작성한 일기가 없어요"
          description="여행에서 기억하고 싶은 순간을 글로 남겨보세요."
          action="일기 쓰기"
          onPress={openDiaryCreate}
        />
      )}
      {diaries.length > 3 && (
        <ListMoreButton
          expanded={showAllDiaries}
          hiddenCount={diaries.length - 3}
          onPress={() => setShowAllDiaries((value) => !value)}
        />
      )}
      <SectionLabel label="여행 기념 카드" />
      <Pressable
        onPress={() => setMakingCard(true)}
        accessibilityRole="button"
        accessibilityLabel="여행 기념 카드 꾸미기"
        style={[styles.keepsakeCompact, theme && { backgroundColor: theme.surfaceAlt }]}
      >
        <View style={styles.keepsakeStrip}>
          {photos.slice(0, 3).map((photo) => (
            <View key={`${photo.id}-strip`} style={[styles.keepsakeThumb, { backgroundColor: photo.color }]}>
              {photo.uri && <Image source={{ uri: photo.uri }} resizeMode="cover" style={styles.memoryPhotoImage} />}
            </View>
          ))}
        </View>
        <View style={styles.keepsakeCopy}>
          <Text style={[styles.keepsakeStyle, theme && { color: theme.primary }]}>{cardStyle} · {tripDate}</Text>
          <Text numberOfLines={1} style={[styles.keepsakeCompactTitle, theme && { color: theme.text }]}>{cardTitle}</Text>
          <Text style={[styles.keepsakeCompactAction, theme && { color: theme.primary }]}>한 장으로 꾸미기</Text>
        </View>
        <Glyph name="chevronRight" size={16} color={theme?.primary ?? "#3F4C8F"} />
      </Pressable>
      <DetailSheet
        visible={makingCard}
        title="여행 기념 카드 꾸미기"
        subtitle="사진과 문구를 골라 여행을 한 장으로 간직하세요"
        submit="변경 저장"
        onClose={() => setMakingCard(false)}
        onSubmit={() => {
          setMakingCard(false);
          notify("여행 기념 카드를 저장했어요");
        }}
      >
        <OptionField
          label="카드 스타일"
          options={["필름", "엽서", "스크랩북"]}
          value={cardStyle}
          onChange={setCardStyle}
        />
        <View style={styles.cardMiniPreview}>
          {photos.slice(0, 3).map((photo) => (
            <View key={`${photo.id}-preview`} style={[styles.cardMiniPhoto, { backgroundColor: photo.color }]}>
              {photo.uri && <Image source={{ uri: photo.uri }} resizeMode="cover" style={styles.memoryPhotoImage} />}
            </View>
          ))}
        </View>
        <DetailField label="카드 제목 · 선택 사항" value={cardTitle} onChangeText={setCardTitle} placeholder="예: 우리의 서울 주말" />
        <DetailField label="짧은 문구 · 선택 사항" value={cardCaption} onChangeText={setCardCaption} placeholder="사진과 함께 남길 말을 적어보세요" multiline />
        <Text style={[styles.settingHint, theme && { color: theme.muted }]}>현재 여행 기록에 저장되며 언제든 다시 꾸밀 수 있어요.</Text>
      </DetailSheet>
      <DetailSheet
        visible={photoEditing}
        title={editingPhotoId ? "사진 기록 수정" : "사진 추가"}
        subtitle="사진을 고르고 날짜와 짧은 설명을 함께 남겨보세요"
        submit={editingPhotoId ? "변경 저장" : "사진 추가"}
        disabledHint={!photoSelected ? "사진을 선택해 주세요" : undefined}
        submitDisabled={!photoSelected}
        destructiveLabel={editingPhotoId ? "사진 삭제" : undefined}
        destructiveMessage="사진을 여행 기록에서 삭제해요."
        onDestructive={deletePhoto}
        onClose={() => setPhotoEditing(false)}
        onSubmit={savePhoto}
      >
        <Pressable
          onPress={choosePhoto}
          accessibilityRole="button"
          accessibilityLabel={photoSelected ? "사진 다시 선택" : "기기에서 사진 선택"}
          style={[styles.photoPickerPreview, { backgroundColor: photoSelected ? photoColor : theme?.surfaceAlt ?? "#F2EFEA", borderColor: theme?.border ?? "#E5E1DC" }]}
        >
          {photoUri && <Image source={{ uri: photoUri }} resizeMode="cover" style={styles.memoryPhotoImage} />}
          <View style={[styles.photoPickerMark, theme && { backgroundColor: theme.surface }]}>
            <Text style={[styles.photoPickerMarkText, theme && { color: theme.primary }]}>{photoSelected ? "사진 다시 선택" : "기기에서 사진 선택"}</Text>
          </View>
        </Pressable>
        <Text style={[styles.settingHint, theme && { color: theme.muted }]}>사진을 선택하면 이곳에서 미리 확인할 수 있어요.</Text>
        <OptionField label="여행 날짜" options={photoDayOptions} value={photoDate} onChange={setPhotoDate} />
        <DetailField label="사진 설명 · 선택 사항" value={photoCaption} onChangeText={setPhotoCaption} placeholder="예: 도착하자마자 먹은 점심" />
      </DetailSheet>
      <DetailSheet
        visible={diaryWriting}
        title={editingDiaryId ? "여행 일기 수정" : "여행 일기 쓰기"}
        subtitle="그날의 기분과 오래 기억하고 싶은 이야기를 남겨보세요"
        submit={editingDiaryId ? "변경 저장" : "일기 추가"}
        disabledHint={!diaryBody.trim() ? "내용을 입력해 주세요" : undefined}
        submitDisabled={!diaryBody.trim()}
        destructiveLabel={editingDiaryId ? "일기 삭제" : undefined}
        destructiveMessage={editingDiaryId ? `${diaryTitle || "이 일기"}를 여행 기록에서 삭제해요.` : undefined}
        onDestructive={deleteDiary}
        onClose={() => {
          setDiaryWriting(false);
          setEditingDiaryId(null);
        }}
        onSubmit={saveDiary}
      >
        <DetailField label="일기 제목 · 선택 사항" value={diaryTitle} onChangeText={setDiaryTitle} placeholder="예: 비가 와서 더 좋았던 날" />
        <DetailField label="여행 이야기 · 필수" value={diaryBody} onChangeText={setDiaryBody} placeholder="오늘 가장 기억에 남는 순간은..." multiline />
      </DetailSheet>
    </View>
  );
}

function SectionLabel({
  label,
  count,
  action,
  onPress,
}: {
  label: string;
  count?: string;
  action?: string;
  onPress?: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.sectionLabel}>
      <View style={styles.tabActionTitleRow}>
        <Text style={[styles.sectionTitle, theme && { color: theme.text }]}>
          {label}
        </Text>
        {count && (
          <Text style={[styles.tabActionCount, theme && { color: theme.muted, backgroundColor: theme.surfaceAlt }]}>
            {count}
          </Text>
        )}
      </View>
      {action && (
        <Pressable
          onPress={onPress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={action}
        >
          <View style={styles.sectionActionRow}>
            <Text
              style={[styles.sectionAction, theme && { color: theme.primary }]}
            >
              {action}
            </Text>
            <Glyph name="arrowRight" size={14} color={theme?.primary ?? "#3F4C8F"} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

function Money({
  tripName,
  dayOptions,
  todayDay,
  expenses,
  setExpenses,
  budget,
  setBudget,
  assignedSummary,
  participants,
  setParticipants,
  spaceMembers,
  currency,
  setCurrency,
  exchangeRate,
  setExchangeRate,
}: {
  tripName: string;
  dayOptions: string[];
  /** 여행 날짜 가운데 오늘. 여행 기간이 아니면 빈 문자열. */
  todayDay: string;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  budget: number;
  setBudget: React.Dispatch<React.SetStateAction<number>>;
  /** 이 사람 이름으로 여행에 적어 둔 것들. 참가자에서 빼기 전에 보여 준다. */
  assignedSummary: (person: string) => string;
  /** 이번 여행에 가는 사람. 몫은 이 목록을 기준으로 나눈다. */
  participants: Participant[];
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  /** 공간 멤버 전원. 참가자를 고를 때의 후보다. */
  spaceMembers: Participant[];
  currency: string;
  setCurrency: React.Dispatch<React.SetStateAction<string>>;
  exchangeRate: number;
  setExchangeRate: React.Dispatch<React.SetStateAction<number>>;
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const [dayFilter, setDayFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState<"전체" | ExpenseCategory>("전체");
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [draftBudget, setDraftBudget] = useState("500,000");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftCategory, setDraftCategory] = useState<ExpenseCategory>("식비");
  const [draftPayer, setDraftPayer] = useState<Participant>(participants[0] ?? "");
  // 몫을 지는 사람과 비중. 비어 있으면 참가자 전원이 똑같이 나눈다.
  const [draftShares, setDraftShares] = useState<Record<Participant, number>>({});
  // 마지막에 적은 분류와 낸 사람. 여행 중에는 같은 사람이 같은 종류를 이어서
  // 적는 일이 많아서, 매번 처음 값으로 돌아가면 지출마다 두 번씩 고치게 된다.
  const [lastCategory, setLastCategory] = useState<ExpenseCategory>("식비");
  const [lastPayer, setLastPayer] = useState<Participant>(participants[0] ?? "");
  const [peopleSheetOpen, setPeopleSheetOpen] = useState(false);
  // 참가자도 저장을 눌러야 바뀐다. 누구였는지 확인만 하려고 체크를 껐다가
  // 바깥을 눌러 닫으면 그 사람이 빠진 채로 정산이 다시 계산돼 버렸다.
  const [draftParticipants, setDraftParticipants] = useState<Participant[]>(participants);
  const [draftDay, setDraftDay] = useState(dayOptions[0] ?? "");
  const [draftMemo, setDraftMemo] = useState("");
  const [draftReceipt, setDraftReceipt] = useState("");
  // 누가 내고 누구 몫인지, 그리고 영수증과 메모는 대개 기본값 그대로 둔다.
  // 늘 펼쳐 두면 식당 앞에서 적을 때 제출 단추까지 다섯 줄을 지나야 한다.
  const [payerOpen, setPayerOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  // 시트 안에서 고른 것은 저장을 눌러야 여행에 들어간다. 고르는 즉시 바꾸면
  // 환율을 안 적고 닫았을 때 통화만 달러로 남아 합계가 "약 24원" 이 된다.
  const [draftCurrency, setDraftCurrency] = useState(DEFAULT_CURRENCY.code);
  const [draftRate, setDraftRate] = useState("");
  // 빠르게 적기. 금액만 치고 단추 한 번이면 한 건이 들어간다. 평소 가계부를
  // 안 쓰던 사람이 여행 중에 쓰려면 이 정도로 짧아야 한다.
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCategory, setQuickCategory] = useState<ExpenseCategory>("식비");
  const previousDays = useRef(dayOptions);
  const dayOptionsKey = dayOptions.join("|");

  useEffect(() => {
    const before = previousDays.current;
    if (before.join("|") === dayOptionsKey) return;
    setExpenses((current) => current.map((item) => {
      const index = before.indexOf(item.day);
      if (index < 0 || !dayOptions.length) return item;
      return { ...item, day: dayOptions[Math.min(index, dayOptions.length - 1)] };
    }));
    setDayFilter("전체");
    setDraftDay(dayOptions[0] ?? "");
    previousDays.current = dayOptions;
  }, [dayOptions, dayOptionsKey, setExpenses]);

  // 목록은 늘 여행 날짜 차례로 본다. 넣은 차례로 두면 나중에 끼워 넣은 지출이
  // 엉뚱한 자리에 남는다.
  const sorted = useMemo(() => {
    const order = (day: string) => {
      const index = dayOptions.indexOf(day);
      return index === -1 ? dayOptions.length : index;
    };
    return [...expenses].sort((a, b) => order(a.day) - order(b.day));
  }, [expenses, dayOptions]);
  const settlement = useMemo(() => settle(expenses, participants), [expenses, participants]);
  // 참가자에서 뺀 사람이 낸 지출은 정산에 남는다. 그 사람이 표에 없으면 정산
  // 줄의 이름이 어디서 왔는지 알 길이 없어서, 뒤에 붙여 같이 보여 준다.
  const paidRows = useMemo(() => {
    const extra = Object.keys(settlement.paid).filter((person) => !participants.includes(person));
    return [...participants, ...extra].map((person) => ({
      person,
      joined: participants.includes(person),
      paid: settlement.paid[person] ?? 0,
      owed: settlement.owed[person] ?? 0,
    }));
  }, [participants, settlement]);
  const byCategory = useMemo(() => totalsByCategory(expenses), [expenses]);
  const byDay = useMemo(() => totalsByDay(expenses, dayOptions), [expenses, dayOptions]);
  const averagePerSpendingDay = byDay.length ? Math.round(settlement.total / byDay.length) : 0;
  const topDay = byDay.reduce<{ day: string; amount: number } | null>(
    (top, row) => (!top || row.amount > top.amount ? row : top),
    null,
  );
  const usedDays = useMemo(
    () => dayOptions.filter((day) => expenses.some((item) => item.day === day)),
    [dayOptions, expenses],
  );
  const visible = sorted.filter(
    (item) =>
      (dayFilter === "전체" || item.day === dayFilter)
      && (categoryFilter === "전체" || item.category === categoryFilter),
  );
  // 날짜로 묶고 소제목에 그날 합계를 단다. 여행 중에 가장 자주 하는 질문이
  // "어제 얼마 썼지" 인데, 한 줄로 늘어놓으면 그걸 셀 수가 없다.
  const grouped = useMemo(
    () =>
      totalsByDay(visible, dayOptions).map(({ day, amount }) => ({
        day,
        amount,
        items: visible.filter((item) => item.day === day),
      })),
    [visible, dayOptions],
  );
  const unit = currencyOf(currency);
  // 금액 칸에서 눌러 더하는 단위. 통화가 원이면 천 단위, 소수를 쓰는 통화면 한 자리 작게 잡는다.
  const quickSteps = unit.fraction > 0 ? [1, 5, 10] : [1000, 5000, 10000];
  // 이 탭 안에서는 늘 여행 통화로 적는다. 원 환산은 합계 옆에만 덧붙인다.
  const show = (amount: number) => money(amount, unit.code);
  const inWon = (amount: number) => toWon(amount, exchangeRate);
  const foreign = unit.code !== DEFAULT_CURRENCY.code;
  const amountNumber = parseAmount(draftAmount, unit.fraction);
  const budgetNumber = parseAmount(draftBudget, unit.fraction);
  // 이름은 안 적어도 된다. 안 적으면 분류가 이름이 된다. "식비 12,000원" 만으로도
  // 나중에 표를 볼 때 뜻이 통하고, 필수 글자 입력이 하나 줄어든다.
  const formValid = amountNumber > 0;
  const budgetRemaining = budget - settlement.total;
  const budgetProgress = budget > 0 ? settlement.total / budget : 0;
  // 치는 동안 세 자리마다 끊는다. 32,000 과 320,000 은 자릿수가 안 끊기면
  // 눈으로 구별이 안 되고, 돈에서 제일 흔한 실수가 여기서 난다.
  const changeAmount = (text: string) => {
    // 소수를 받는 통화는 점을 치는 도중이라 아직 숫자가 안 되는 상태가 있다.
    // "24." 를 지우지 않아야 뒤에 자릿수를 이어 칠 수 있다.
    if (unit.fraction > 0 && /[.]\d{0,1}$/.test(text)) {
      setDraftAmount(text.replace(/[^\d.]/g, ""));
      return;
    }
    const amount = parseAmount(text, unit.fraction);
    setDraftAmount(amount ? amountText(amount, unit.fraction) : "");
  };
  const openBudget = () => {
    setDraftBudget(budget ? amountText(budget, unit.fraction) : "");
    setBudgetSheetOpen(true);
  };
  const saveBudget = () => {
    if (!budgetNumber) return;
    setBudget(budgetNumber);
    setBudgetSheetOpen(false);
    notify("여행 예산을 저장했어요");
  };

  const quickNumber = parseAmount(quickAmount, unit.fraction);
  const quickPayer = participants.includes(lastPayer) ? lastPayer : participants[0] ?? "";
  // 지금 적고 있는 지출을 사람별로 미리 쪼개 본다. 비중이 숫자로만 있으면
  // 얼마씩인지 감이 안 온다.
  const draftSplit = splitAmounts(
    { id: "draft", day: draftDay, title: "", amount: amountNumber, category: draftCategory, payer: draftPayer, shares: Object.keys(draftShares).length ? draftShares : undefined, memo: "" },
    participants,
  );
  const draftShareSummary = (() => {
    const paid = `${draftPayer}${josa(draftPayer, "이", "가")}`;
    const picked = Object.keys(draftShares);
    if (!picked.length) {
      return participants.length > 1
        ? `${paid} 내고 ${participants.length}명이 똑같이 나눠요`
        : `${paid} 냈어요`;
    }
    if (picked.length === 1) return `${paid} 내고 ${picked[0]} 몫이에요`;
    const even = picked.every((person) => draftShares[person] === draftShares[picked[0]]);
    const last = picked[picked.length - 1];
    return even
      ? `${paid} 내고 ${picked.join(" · ")}${josa(last, "이", "가")} 똑같이 나눠요`
      : `${paid} 내고 ${picked.map((person) => `${person} ${draftShares[person]}`).join(" · ")}`;
  })();
  const draftPayerHint = participants.length > 1
    ? `${quickPayer}${josa(quickPayer, "이", "가")} 내고 ${participants.length}명이 똑같이 나눠요`
    : `${quickPayer}${josa(quickPayer, "이", "가")} 냈어요`;
  const addQuickExpense = () => {
    if (!quickNumber) return;
    setExpenses((current) => [
      ...current,
      {
        id: `expense-${Date.now()}`,
        // 빠르게 적는 건 지금 쓴 돈이다. 여행 중이면 오늘, 아니면 첫날이다.
        day: todayDay || dayOptions[0] || "",
        title: quickCategory,
        amount: quickNumber,
        category: quickCategory,
        payer: participants.includes(lastPayer) ? lastPayer : participants[0] ?? "",
        memo: "",
      },
    ]);
    setQuickAmount("");
    setLastCategory(quickCategory);
    notify(`${quickCategory} ${money(quickNumber, unit.code)}을 적었어요`);
  };
  const openCreate = () => {
    setEditingId(null);
    setDraftTitle("");
    setDraftAmount("");
    setDraftCategory(lastCategory);
    setDraftPayer(participants.includes(lastPayer) ? lastPayer : participants[0] ?? "");
    setDraftShares({});
    // 날짜를 거르고 있으면 그 날, 아니면 오늘, 여행 기간이 아니면 첫날이다.
    setDraftDay(dayFilter === "전체" ? todayDay || dayOptions[0] || "" : dayFilter);
    setDraftMemo("");
    setDraftReceipt("");
    setPayerOpen(false);
    setExtrasOpen(false);
    setSheetOpen(true);
  };
  const openEdit = (item: Expense) => {
    setEditingId(item.id);
    setDraftTitle(item.title);
    setDraftAmount(amountText(item.amount, unit.fraction));
    setDraftCategory(item.category);
    setDraftPayer(item.payer);
    setDraftShares(item.shares ?? {});
    setDraftDay(item.day);
    setDraftMemo(item.memo);
    setDraftReceipt(item.receiptUri ?? "");
    // 기본값과 다른 지출을 고칠 때는 그 자리를 바로 보여준다.
    setPayerOpen(Object.keys(item.shares ?? {}).length > 0);
    setExtrasOpen(Boolean(item.memo || item.receiptUri));
    setSheetOpen(true);
  };
  const saveExpense = () => {
    if (!formValid) return;
    setExpenses((current) => {
      // 새 번호는 값을 바꾸는 이 안에서 만든다. 그려지는 중에 시계를 읽으면
      // 같은 그림이 두 번 그려질 때 번호가 달라진다.
      const next: Expense = {
        id: editingId ?? `expense-${Date.now()}`,
        day: draftDay,
        title: draftTitle.trim() || draftCategory,
        amount: amountNumber,
        category: draftCategory,
        payer: draftPayer,
        shares: Object.keys(draftShares).length ? draftShares : undefined,
        memo: draftMemo.trim(),
        receiptUri: draftReceipt || undefined,
      };
      return editingId
        ? current.map((item) => (item.id === editingId ? next : item))
        : [...current, next];
    });
    setLastCategory(draftCategory);
    setLastPayer(draftPayer);
    setSheetOpen(false);
    notify(editingId ? "지출을 수정했어요" : "지출을 추가했어요");
  };
  const deleteExpense = () => {
    const target = expenses.find((item) => item.id === editingId);
    if (!target) return;
    setExpenses((current) => current.filter((item) => item.id !== target.id));
    setSheetOpen(false);
    notify("지출을 삭제했어요");
  };
  const chooseReceipt = async () => {
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        notify("영수증을 넣으려면 사진 접근을 허용해 주세요");
        return;
      }
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: Platform.OS === "web",
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const picked = Platform.OS === "web" && asset.base64
        ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`
        : asset.uri;
      setDraftReceipt(await keepTripPhoto(picked));
    } catch {
      notify("영수증을 불러오지 못했어요");
    }
  };
  const openPeople = () => {
    setDraftParticipants(participants);
    setPeopleSheetOpen(true);
  };
  const savePeople = () => {
    // 공간 멤버 순서를 지킨다. 뺐다 다시 넣었다고 목록 맨 뒤로 가면 화면마다
    // 사람 순서가 달라진다.
    const ordered = spaceMembers.filter((person) => draftParticipants.includes(person));
    const extra = draftParticipants.filter((person) => !spaceMembers.includes(person));
    const next = [...ordered, ...extra];
    setParticipants(next);
    setPeopleSheetOpen(false);
    notify(`참가자 ${next.length}명으로 저장했어요`);
  };
  const openCurrency = () => {
    setDraftCurrency(currency);
    setDraftRate(exchangeRate === 1 ? "" : amountText(exchangeRate, 2));
    setCurrencySheetOpen(true);
  };
  const saveCurrency = () => {
    // 원으로 돌아오면 환율은 늘 1 이다. 따로 적게 하면 틀릴 자리만 는다.
    const nextRate = draftCurrency === DEFAULT_CURRENCY.code
      ? 1
      : Math.max(0.0001, parseAmount(draftRate, 2) || 1);
    // 예산은 여행 통화로 적은 값이다. 통화만 바꾸고 숫자를 그대로 두면
    // 50만 원 예산이 50만 달러가 된다. 원을 거쳐 옮긴다.
    if (draftCurrency !== currency) {
      setBudget((current) => Math.max(0, Math.round((current * exchangeRate) / nextRate)));
    }
    setCurrency(draftCurrency);
    setExchangeRate(nextRate);
    setCurrencySheetOpen(false);
    notify("여행 통화를 저장했어요");
  };
  const exportCsv = async () => {
    if (!expenses.length) {
      notify("내보낼 지출이 없어요");
      return;
    }
    const csv = expensesToCsv(tripName, sorted, participants, unit.code, exchangeRate);
    try {
      // 공유를 못 하는 곳에서는 표를 클립보드에 담는다. 스프레드시트에 그대로
      // 붙여넣으면 같은 표가 된다.
      if ((await shareExpenseCsv(`${tripName} 비용`, csv)) === "unavailable") {
        await Clipboard.setStringAsync(csv);
        notify("표를 복사했어요. 스프레드시트에 붙여넣으세요");
      }
    } catch {
      notify("내보내기를 마치지 못했어요");
    }
  };

  return (
    <View>
      <TabActionHeader
        label="지출"
        count={`${expenses.length}건`}
        action="지출 추가"
        onPress={openCreate}
      />
      <View style={[styles.moneySummary, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.moneySummaryLabel, theme && { color: theme.muted }]}>이번 여행에서 쓴 돈</Text>
        <Text style={[styles.moneyTotal, theme && { color: theme.text }]}>
          {show(settlement.total)}
        </Text>
        <View style={styles.moneyCurrencyRow}>
          {/* 글자만 두면 누를 수 있는 줄 모른다. 테두리와 화살표를 줘서 고르는
              칸이라는 걸 보이게 한다. 자리는 늘 왼쪽으로 고정한다. */}
          <Pressable
            onPress={openCurrency}
            accessibilityRole="button"
            accessibilityLabel={`여행 통화 ${unit.code} ${unit.label}, 눌러서 바꾸기`}
            style={({ pressed }) => [
              styles.moneyCurrencyChip,
              theme && { borderColor: theme.primary, backgroundColor: theme.primarySoft },
              pressed && styles.controlPressed,
            ]}
          >
            <Text style={[styles.moneyCurrencyLabel, theme && { color: theme.muted }]}>통화</Text>
            <Text style={[styles.moneyCurrencyValue, theme && { color: theme.primary }]}>
              {unit.code === DEFAULT_CURRENCY.code
                ? `${unit.code} 원`
                : `${unit.code} · ${amountText(exchangeRate, 2)}원`}
            </Text>
            <Glyph name="chevronDown" size={14} color={theme?.primary ?? "#3F4C8F"} />
          </Pressable>
          {/* 누구끼리 나누는지가 정산의 전제다. 공간 멤버가 여럿이면 이번
              여행에 누가 갔는지부터 맞아야 아래 숫자가 뜻을 갖는다. */}
          <Pressable
            onPress={openPeople}
            accessibilityRole="button"
            accessibilityLabel={`이번 여행 참가자 ${participants.length}명, 눌러서 바꾸기`}
            style={({ pressed }) => [
              styles.moneyCurrencyChip,
              theme && { borderColor: theme.primary, backgroundColor: theme.primarySoft },
              pressed && styles.controlPressed,
            ]}
          >
            <Text style={[styles.moneyCurrencyLabel, theme && { color: theme.muted }]}>참가자</Text>
            <Text numberOfLines={1} style={[styles.moneyCurrencyValue, theme && { color: theme.primary }]}>
              {participants.length}명
            </Text>
            <Glyph name="chevronDown" size={14} color={theme?.primary ?? "#3F4C8F"} />
          </Pressable>
          {/* 원이 아닐 때만 환산을 낸다. 원이면 같은 숫자를 두 번 보여줄 뿐이다. */}
          {foreign && (
            <Text style={[styles.moneyConverted, theme && { color: theme.muted }]}>
              약 {won(inWon(settlement.total))}원
            </Text>
          )}
        </View>
        {/* 결국 이걸 보려고 들어온다. 합계 바로 다음에 두고, 예산과 사람별
            숫자는 그 뒤로 미룬다. 셋 이상이면 오갈 줄이 여러 개다. */}
        <View style={styles.moneySettleBlock}>
          <Text style={[styles.moneySettleLabel, theme && { color: theme.muted }]}>정산</Text>
          {settlement.transfers.length ? (
            settlement.transfers.map((transfer) => (
              <View
                key={`${transfer.from}-${transfer.to}`}
                style={[styles.moneySettle, theme && { backgroundColor: theme.primarySoft }]}
              >
                <Text numberOfLines={1} style={[styles.moneySettleText, theme && { color: theme.primary }]}>
                  {transfer.from}{josa(transfer.from, "이", "가")} {transfer.to}에게
                </Text>
                <Text style={[styles.moneySettleAmount, theme && { color: theme.primary }]}>{show(transfer.amount)}</Text>
              </View>
            ))
          ) : (
            <View style={[styles.moneySettle, theme && { backgroundColor: theme.primarySoft }]}>
              <Text style={[styles.moneySettleText, theme && { color: theme.primary }]}>
                {expenses.length ? "서로 줄 것도 받을 것도 없어요" : "지출을 적으면 여기서 정산해 드려요"}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.moneyBudgetHead}>
          <Text style={[styles.moneyBudgetLabel, theme && { color: theme.muted }]}>예산 {show(budget)}</Text>
          <Pressable onPress={openBudget} hitSlop={10} accessibilityRole="button" accessibilityLabel="여행 예산 수정">
            <Text style={[styles.moneyBudgetAction, theme && { color: theme.primary }]}>예산 수정</Text>
          </Pressable>
        </View>
        <View style={[styles.moneyBudgetTrack, theme && { backgroundColor: theme.surfaceAlt }]}>
          <View
            style={[
              styles.moneyBudgetFill,
              { width: `${Math.min(100, budgetProgress * 100)}%` },
              theme && { backgroundColor: budgetRemaining < 0 ? (theme.dark ? statusColor.danger.dark : statusColor.danger.light) : theme.primary },
            ]}
          />
        </View>
        <View style={styles.moneyBudgetFoot}>
          <Text style={[styles.moneyBudgetStatus, theme && { color: budgetRemaining < 0 ? (theme.dark ? statusColor.danger.dark : statusColor.danger.light) : theme.muted }]}>
            {budgetRemaining < 0 ? `${show(Math.abs(budgetRemaining))} 초과` : `${show(budgetRemaining)} 남음`}
          </Text>
          <Text style={[styles.moneyBudgetPercent, theme && { color: theme.muted }]}>{Math.round(budgetProgress * 100)}%</Text>
        </View>
        {/* 낸 돈과 내야 할 돈. 사람 수만큼 가로로 나누면 넷만 돼도 숫자가
            잘려서 아무것도 못 읽는다. 세로로 쌓고 머리글을 한 번만 단다. */}
        <View style={styles.moneyPaidTable}>
          <View style={styles.moneyPaidHead}>
            <Text style={[styles.moneyPaidHeadName, theme && { color: theme.muted }]}>참가자</Text>
            <Text style={[styles.moneyPaidHeadCell, theme && { color: theme.muted }]}>낸 돈</Text>
            <Text style={[styles.moneyPaidHeadCell, theme && { color: theme.muted }]}>내야 할 돈</Text>
          </View>
          {paidRows.map((row) => (
            <View
              key={row.person}
              style={[styles.moneyPaidRow, theme && { borderTopColor: theme.border }]}
            >
              <View style={styles.moneyPaidNameBox}>
                <Text numberOfLines={1} style={[styles.moneyPaidName, theme && { color: theme.text }]}>{row.person}</Text>
                {/* 참가자에서 뺐는데 낸 돈이 남아 있으면 아래 정산에 이름만
                    튀어나온다. 어디서 나온 금액인지 알아볼 수 있게 표시한다. */}
                {!row.joined && (
                  <Text style={[styles.moneyPaidGuest, theme && { color: theme.muted }]}>참가자 아님</Text>
                )}
              </View>
              <Text numberOfLines={1} style={[styles.moneyPaidCell, theme && { color: theme.text }]}>{show(row.paid)}</Text>
              <Text numberOfLines={1} style={[styles.moneyPaidCell, theme && { color: theme.muted }]}>{show(row.owed)}</Text>
            </View>
          ))}
        </View>
      </View>
      {/* 요약 바로 아래에 둔다. 탭을 열자마자 손이 닿는 자리다. */}
      <View style={[styles.quickAdd, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.quickAddTitle, theme && { color: theme.muted }]}>빠르게 적기</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAddChips}>
          {EXPENSE_CATEGORIES.map((item) => {
            const active = quickCategory === item;
            return (
              <Pressable
                key={item}
                onPress={() => setQuickCategory(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.quickAddChip,
                  theme && { borderColor: active ? theme.primary : theme.border },
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text style={[styles.quickAddChipText, theme && { color: active ? theme.primary : theme.muted }]}>{item}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.quickAddRow}>
          <TextInput
            accessibilityLabel={`${quickCategory} 금액`}
            value={quickAmount}
            onChangeText={(text) => {
              const amount = parseAmount(text, unit.fraction);
              setQuickAmount(amount ? amountText(amount, unit.fraction) : "");
            }}
            keyboardType="numeric"
            placeholder={`${quickCategory} 얼마 썼나요`}
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[styles.quickAddInput, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
          />
          <Pressable
            onPress={addQuickExpense}
            disabled={!quickNumber}
            accessibilityRole="button"
            accessibilityLabel={`${quickCategory} 지출 적기`}
            accessibilityState={{ disabled: !quickNumber }}
            style={({ pressed }) => [
              styles.quickAddButton,
              theme && { backgroundColor: quickNumber ? theme.primary : theme.surfaceAlt },
              pressed && quickNumber > 0 && styles.controlPressed,
            ]}
          >
            <Glyph name="plus" size={16} color={quickNumber ? "#FFFFFF" : theme?.muted ?? "#9AA1AE"} weight={2.6} />
            <Text style={[styles.quickAddButtonText, { color: quickNumber ? "#FFFFFF" : theme?.muted ?? "#9AA1AE" }]}>적기</Text>
          </Pressable>
        </View>
        <Text style={[styles.quickAddHint, theme && { color: theme.muted }]}>
          {draftPayerHint} · 자세히 적으려면 위의 지출 추가를 누르세요
        </Text>
      </View>
      {expenses.length > 0 && (
        <View style={[styles.moneyInsightCard, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <View style={styles.moneyInsightHeading}>
            <View>
              <Text style={[styles.moneyInsightEyebrow, theme && { color: theme.primary }]}>여행 비용 분석</Text>
              <Text style={[styles.moneyInsightTitle, theme && { color: theme.text }]}>이번 여행의 소비 흐름</Text>
            </View>
            <Text style={[styles.moneyInsightCount, theme && { color: theme.muted }]}>{byDay.length}일 기록</Text>
          </View>
          <View style={styles.moneyInsightGrid}>
            <View style={styles.moneyInsightItem}>
              <Text style={[styles.moneyInsightLabel, theme && { color: theme.muted }]}>쓴 날 하루 평균</Text>
              <Text style={[styles.moneyInsightValue, theme && { color: theme.text }]}>{show(averagePerSpendingDay)}</Text>
            </View>
            <View style={[styles.moneyInsightItem, styles.moneyInsightDivider, theme && { borderLeftColor: theme.border }]}>
              <Text style={[styles.moneyInsightLabel, theme && { color: theme.muted }]}>가장 많이 쓴 날</Text>
              <Text numberOfLines={1} style={[styles.moneyInsightValue, theme && { color: theme.text }]}>{topDay?.day ?? "-"}</Text>
              <Text style={[styles.moneyInsightMeta, theme && { color: theme.muted }]}>{topDay ? `${show(topDay.amount)}` : ""}</Text>
            </View>
            <View style={[styles.moneyInsightItem, styles.moneyInsightDivider, theme && { borderLeftColor: theme.border }]}>
              <Text style={[styles.moneyInsightLabel, theme && { color: theme.muted }]}>가장 큰 지출</Text>
              <Text numberOfLines={1} style={[styles.moneyInsightValue, theme && { color: theme.text }]}>{byCategory[0]?.category ?? "-"}</Text>
              <Text style={[styles.moneyInsightMeta, theme && { color: theme.muted }]}>{byCategory[0] ? `${show(byCategory[0].amount)}` : ""}</Text>
            </View>
          </View>
        </View>
      )}
      {byCategory.length > 0 && (
        <>
          <SectionLabel label="어디에 썼나" count={`${byCategory.length}가지`} />
          <View style={[styles.moneyCategoryCard, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {byCategory.map((row) => {
              const active = categoryFilter === row.category;
              return (
              <Pressable
                key={row.category}
                onPress={() => setCategoryFilter(active ? "전체" : row.category)}
                accessibilityRole="button"
                accessibilityLabel={`${row.category} 지출 ${show(row.amount)} 내역 보기`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.moneyCategoryRow,
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text style={[styles.moneyCategoryName, theme && { color: theme.text }]}>{row.category}</Text>
                {/* 막대는 전체 대비다. 1등 대비로 그리면 가장 많이 쓴 분류가
                    늘 꽉 차서 전부 쓴 것처럼 보인다. */}
                <View style={[styles.moneyBarTrack, theme && { backgroundColor: theme.surfaceAlt }]}>
                  <View
                    style={[
                      styles.moneyBarFill,
                      { width: `${settlement.total ? Math.max(2, (row.amount / settlement.total) * 100) : 0}%` },
                      theme && { backgroundColor: theme.primary },
                    ]}
                  />
                </View>
                <Text style={[styles.moneyCategoryAmount, theme && { color: theme.muted }]}>{show(row.amount)}</Text>
                <Text style={[styles.moneyCategoryPercent, theme && { color: theme.muted }]}>
                  {settlement.total ? Math.round((row.amount / settlement.total) * 100) : 0}%
                </Text>
              </Pressable>
            );})}
            <Text style={[styles.moneyCategoryHint, theme && { color: theme.muted }]}>분류를 누르면 해당 내역만 볼 수 있어요</Text>
          </View>
        </>
      )}
      <SectionLabel
        label={categoryFilter === "전체" ? "지출 내역" : `${categoryFilter} 지출`}
        count={dayFilter === "전체" && categoryFilter === "전체" ? `${sorted.length}건` : `${visible.length}건`}
        action={categoryFilter === "전체" ? undefined : "전체 보기"}
        onPress={categoryFilter === "전체" ? undefined : () => setCategoryFilter("전체")}
      />
      {/* 며칠 치가 쌓였을 때만 날짜로 거른다. 몇 건 안 되면 칩이 목록보다 크다. */}
      {expenses.length > 5 && usedDays.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moneyDayRow}>
          {["전체", ...usedDays].map((day) => {
            const active = dayFilter === day;
            return (
              <Pressable
                key={day}
                onPress={() => setDayFilter(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.moneyDayChip,
                  theme && { borderColor: active ? theme.primary : theme.border },
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text style={[styles.moneyDayChipText, theme && { color: active ? theme.primary : theme.muted }]}>{day}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={styles.moneyList}>
        {grouped.map((group) => (
          <View key={group.day} style={styles.moneyGroup}>
            <View style={styles.moneyGroupHead}>
              <Text style={[styles.moneyGroupDay, theme && { color: theme.text }]}>{group.day}</Text>
              <Text style={[styles.moneyGroupTotal, theme && { color: theme.muted }]}>{show(group.amount)}</Text>
            </View>
            {group.items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => openEdit(item)}
                accessibilityRole="button"
                accessibilityLabel={`${group.day} ${item.title} ${show(item.amount)} 수정`}
                style={({ pressed }) => [
                  styles.moneyRow,
                  theme && { backgroundColor: theme.surface, borderColor: theme.border },
                  pressed && styles.packingCardPressed,
                ]}
              >
                <View style={styles.moneyRowBody}>
                  <Text numberOfLines={1} style={[styles.moneyRowTitle, theme && { color: theme.text }]}>{item.title}</Text>
                  <Text numberOfLines={1} style={[styles.moneyRowMeta, theme && { color: theme.muted }]}>
                    {/* 빠르게 적은 지출은 이름이 분류와 같다. 같은 낱말을 두 번
                        보여 줄 이유가 없다. */}
                    {item.title === item.category ? "" : `${item.category} · `}
                    {item.payer}{josa(item.payer, "이", "가")} 냄
                    {item.shares ? ` · ${shareLabel(item, participants)} 몫` : ""}
                    {item.receiptUri ? " · 영수증" : ""}
                  </Text>
                </View>
                <Text style={[styles.moneyRowAmount, theme && { color: theme.text }]}>{show(item.amount)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      {visible.length === 0 && (
        <EmptyState
          title={expenses.length === 0 ? "아직 적은 지출이 없어요" : "이 날은 쓴 게 없어요"}
          description={
            expenses.length === 0
              ? "쓴 돈을 적어 두면 여행이 끝나고 한 번에 정산할 수 있어요."
              : "다른 날을 보거나 전체로 돌아가 보세요."
          }
          action={expenses.length === 0 ? "지출 추가" : "전체 보기"}
          onPress={() => {
            if (expenses.length === 0) openCreate();
            else { setDayFilter("전체"); setCategoryFilter("전체"); }
          }}
        />
      )}
      {expenses.length > 0 && (
        <Pressable
          onPress={exportCsv}
          accessibilityRole="button"
          accessibilityLabel="지출 내역을 엑셀 파일로 내보내기"
          style={[styles.moneyExport, theme && { borderColor: theme.border, backgroundColor: theme.surface }]}
        >
          <View>
            <Text style={[styles.moneyExportTitle, theme && { color: theme.text }]}>엑셀로 내보내기</Text>
            <Text style={[styles.moneyExportHint, theme && { color: theme.muted }]}>
              지출 {expenses.length}건과 정산을 표로 만들어 보내요
            </Text>
          </View>
          <Glyph name="arrowRight" size={16} color={theme?.primary ?? "#3F4C8F"} />
        </Pressable>
      )}
      <DetailSheet
        visible={sheetOpen}
        title={editingId ? "지출 수정" : "지출 추가"}
        subtitle="항목과 금액만 적어도 저장돼요"
        submit={editingId ? "변경 저장" : "지출 추가"}
        disabledHint={!formValid ? "금액을 입력해 주세요" : undefined}
        submitDisabled={!formValid}
        destructiveLabel={editingId ? "지출 삭제" : undefined}
        destructiveMessage={editingId ? `${draftTitle || "이 지출"} 내역을 삭제해요.` : undefined}
        onClose={() => setSheetOpen(false)}
        onSubmit={saveExpense}
        onDestructive={deleteExpense}
      >
        <DetailField
          label="항목"
          value={draftTitle}
          onChangeText={setDraftTitle}
          placeholder={`안 적으면 ${draftCategory}`}
        />
        <DetailField
          label="금액 · 필수"
          value={draftAmount}
          onChangeText={changeAmount}
          placeholder="예: 32,000"
          keyboardType="numeric"
        />
        {/* 0 을 여러 번 치는 대신 눌러서 더한다. 엄지로 적을 때 훨씬 빠르다. */}
        <View style={styles.amountSteps}>
          {quickSteps.map((step) => (
            <Pressable
              key={step}
              // 지금 값에서 더한다. 빠르게 두 번 누르면 앞의 결과가 아직 화면에
              // 반영되기 전이라, 밖에서 읽은 값으로 더하면 첫 번째가 사라진다.
              onPress={() => setDraftAmount((current) => amountText(parseAmount(current, unit.fraction) + step, unit.fraction))}
              accessibilityRole="button"
              accessibilityLabel={`${amountText(step, 0)} 더하기`}
              style={({ pressed }) => [
                styles.amountStep,
                theme && { borderColor: theme.border, backgroundColor: theme.surface },
                pressed && styles.controlPressed,
              ]}
            >
              <Text style={[styles.amountStepText, theme && { color: theme.primary }]}>+{amountText(step, 0)}</Text>
            </Pressable>
          ))}
          {amountNumber > 0 && (
            <Pressable
              onPress={() => setDraftAmount("")}
              accessibilityRole="button"
              accessibilityLabel="금액 지우기"
              style={({ pressed }) => [styles.amountStep, pressed && styles.controlPressed]}
            >
              <Text style={[styles.amountStepText, theme && { color: theme.muted }]}>지우기</Text>
            </Pressable>
          )}
        </View>
        <OptionField
          label="분류"
          options={EXPENSE_CATEGORIES}
          value={draftCategory}
          onChange={(value) => setDraftCategory(value as ExpenseCategory)}
        />
        <OptionField label="날짜" options={dayOptions} value={draftDay} onChange={setDraftDay} />
        <OptionalFormSection
          label="누가 내고 누구 몫인지"
          summary={draftShareSummary}
          open={payerOpen}
          onToggle={() => setPayerOpen((current) => !current)}
        >
          <OptionField
            label="낸 사람"
            options={participants}
            value={draftPayer}
            onChange={setDraftPayer}
          />
          <View style={styles.shareField}>
            <View style={styles.fieldLabelRow}>
              <View style={[styles.fieldLabelDot, theme && { backgroundColor: theme.primary }]} />
              <Text style={[styles.detailFieldLabel, theme && { color: theme.text }]}>누구 몫</Text>
            </View>
            {/* 아무도 안 고르면 참가자 전원이 똑같이 나눈다. 가장 흔한 경우라
                따로 고를 것을 없앴다. 한 명만 고르면 그 사람 몫이고, 여럿을
                고른 뒤 옆의 숫자를 바꾸면 그 비중대로 갈린다. */}
            <View style={styles.shareRows}>
              {participants.map((person) => {
                const picked = draftShares[person] !== undefined;
                return (
                  <View key={person} style={styles.shareRow}>
                    <Pressable
                      onPress={() => setDraftShares((current) => {
                        const next = { ...current };
                        if (picked) delete next[person];
                        else next[person] = 1;
                        return next;
                      })}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: picked }}
                      accessibilityLabel={`${person} 몫`}
                      style={({ pressed }) => [
                        styles.shareName,
                        theme && { borderColor: picked ? theme.primary : theme.border },
                        picked && theme && { backgroundColor: theme.primarySoft },
                        pressed && styles.controlPressed,
                      ]}
                    >
                      <Text style={[styles.shareNameText, theme && { color: picked ? theme.primary : theme.muted }]}>
                        {person}
                      </Text>
                    </Pressable>
                    {picked && (
                      <View style={styles.shareWeight}>
                        <Pressable
                          onPress={() => setDraftShares((current) => ({
                            ...current,
                            [person]: Math.max(1, (current[person] ?? 1) - 1),
                          }))}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`${person} 비중 줄이기`}
                        >
                          <Glyph name="minus" size={14} color={theme?.muted ?? "#646C7A"} weight={2.4} />
                        </Pressable>
                        <Text style={[styles.shareWeightValue, theme && { color: theme.text }]}>
                          {draftShares[person]}
                        </Text>
                        <Pressable
                          onPress={() => setDraftShares((current) => ({
                            ...current,
                            [person]: Math.min(99, (current[person] ?? 1) + 1),
                          }))}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`${person} 비중 늘리기`}
                        >
                          <Glyph name="plus" size={14} color={theme?.primary ?? "#3F4C8F"} weight={2.4} />
                        </Pressable>
                      </View>
                    )}
                    {picked && amountNumber > 0 && (
                      <Text style={[styles.shareAmount, theme && { color: theme.muted }]}>
                        {show(draftSplit[person] ?? 0)}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={[styles.settingHint, theme && { color: theme.muted }]}>{draftShareSummary}</Text>
          </View>
        </OptionalFormSection>
        <OptionalFormSection
          label="영수증과 메모"
          summary={
            draftReceipt && draftMemo.trim()
              ? "영수증과 메모가 있어요"
              : draftReceipt
                ? "영수증이 있어요"
                : draftMemo.trim()
                  ? "메모가 있어요"
                  : "필요할 때만 추가하세요"
          }
          open={extrasOpen}
          onToggle={() => setExtrasOpen((current) => !current)}
        >
          <View style={styles.receiptRow}>
            {draftReceipt ? (
              <Image source={{ uri: draftReceipt }} style={styles.receiptThumb} accessibilityLabel="넣은 영수증" />
            ) : (
              <View style={[styles.receiptThumb, styles.receiptEmpty, theme && { borderColor: theme.border }]}>
                <Text style={[styles.receiptEmptyText, theme && { color: theme.muted }]}>없음</Text>
              </View>
            )}
            <View style={styles.receiptActions}>
              <Pressable
                onPress={chooseReceipt}
                accessibilityRole="button"
                style={[styles.receiptButton, theme && { backgroundColor: theme.primarySoft }]}
              >
                <Text style={[styles.receiptButtonText, theme && { color: theme.primary }]}>
                  {draftReceipt ? "다시 고르기" : "영수증 넣기"}
                </Text>
              </Pressable>
              {Boolean(draftReceipt) && (
                <Pressable onPress={() => setDraftReceipt("")} accessibilityRole="button" hitSlop={8}>
                  <Text style={[styles.receiptRemove, theme && { color: theme.muted }]}>빼기</Text>
                </Pressable>
              )}
            </View>
          </View>
          <DetailField
            label="메모"
            value={draftMemo}
            onChangeText={setDraftMemo}
            placeholder="예: 둘 다 학생 할인"
          />
        </OptionalFormSection>
      </DetailSheet>
      <DetailSheet
        visible={peopleSheetOpen}
        title="이번 여행 참가자"
        subtitle="공간 멤버 중에 이번에 같이 가는 사람만 골라요"
        submit="변경 저장"
        disabledHint={!draftParticipants.length ? "한 명은 있어야 해요" : undefined}
        submitDisabled={!draftParticipants.length}
        onClose={() => setPeopleSheetOpen(false)}
        onSubmit={savePeople}
      >
        {theme && (
          <ParticipantPicker
            theme={theme}
            members={spaceMembers}
            value={draftParticipants}
            onChange={setDraftParticipants}
            noteFor={assignedSummary}
            hint="몫을 따로 안 적은 지출은 여기 고른 사람들이 똑같이 나눠요. 사람을 바꾸면 정산도 다시 계산돼요."
          />
        )}
      </DetailSheet>
      <DetailSheet
        visible={currencySheetOpen}
        title="여행 통화"
        subtitle="현지 금액으로 적고 합계에서 원으로 환산해 봐요"
        submit="변경 저장"
        onClose={() => setCurrencySheetOpen(false)}
        onSubmit={saveCurrency}
      >
        <OptionField
          label="통화"
          options={CURRENCIES.map((item) => `${item.code} ${item.label}`)}
          value={`${draftCurrency} ${currencyOf(draftCurrency).label}`}
          onChange={(value) => {
            const picked = currencyOf(value.split(" ")[0]);
            setDraftCurrency(picked.code);
            setDraftRate(picked.code === DEFAULT_CURRENCY.code ? "" : amountText(picked.rate, 2));
          }}
        />
        {draftCurrency !== DEFAULT_CURRENCY.code && (
          <DetailField
            label={`1 ${draftCurrency} 는 몇 원인가요`}
            value={draftRate}
            onChangeText={setDraftRate}
            placeholder={`예: ${amountText(currencyOf(draftCurrency).rate, 2)}`}
            keyboardType="numeric"
          />
        )}
        <Text style={[styles.settingHint, theme && { color: theme.muted }]}>
          {draftCurrency === DEFAULT_CURRENCY.code
            ? "원으로 적으면 환산 없이 그대로 보여요."
            : "환율은 여행 때 한 번 적어 두면 돼요. 적어 둔 금액은 바뀌지 않고 환산만 다시 계산해요."}
        </Text>
      </DetailSheet>
      <DetailSheet
        visible={budgetSheetOpen}
        title="여행 예산"
        subtitle="예산 대비 얼마나 썼는지 비용 탭에서 바로 확인해요"
        submit="변경 저장"
        disabledHint={!budgetNumber ? "예산을 입력해 주세요" : undefined}
        submitDisabled={!budgetNumber}
        onClose={() => setBudgetSheetOpen(false)}
        onSubmit={saveBudget}
      >
        <DetailField
          label={`전체 예산 · 필수 (${unit.code})`}
          value={draftBudget}
          onChangeText={(text) => {
            const amount = parseAmount(text, unit.fraction);
            setDraftBudget(amount ? amountText(amount, unit.fraction) : "");
          }}
          placeholder="예: 500,000"
          keyboardType="numeric"
        />
      </DetailSheet>
    </View>
  );
}

function TabActionHeader({
  label,
  count,
  action,
  onPress,
}: {
  label: string;
  count: string;
  action: string;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.tabActionHeader}>
      <View style={styles.tabActionTitleRow}>
        <Text style={[styles.tabActionTitle, theme && { color: theme.text }]}>{label}</Text>
        <Text style={[styles.tabActionCount, theme && { color: theme.muted, backgroundColor: theme.surfaceAlt }]}>{count}</Text>
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action}
        style={({ pressed }) => [
          styles.tabActionButton,
          theme && { backgroundColor: theme.primary },
          pressed && styles.packingCardPressed,
        ]}
      >
        <Text style={[styles.tabActionButtonText, theme && { color: onAccent(theme.dark) }]}>＋ {action}</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({
  title,
  description,
  action,
  onPress,
}: {
  title: string;
  description: string;
  action: string;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={[styles.emptyState, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      <View style={[styles.emptyStateMark, theme && { backgroundColor: theme.primarySoft }]}>
        <View style={[styles.emptyStateLine, theme && { backgroundColor: theme.primary }]} />
        <View style={[styles.emptyStateLine, styles.emptyStateLineShort, theme && { backgroundColor: theme.primary }]} />
      </View>
      <View style={styles.emptyStateCopy}>
        <Text style={[styles.emptyStateTitle, theme && { color: theme.text }]}>{title}</Text>
        <Text style={[styles.emptyStateDescription, theme && { color: theme.muted }]}>{description}</Text>
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action}
        style={[styles.emptyStateAction, theme && { backgroundColor: theme.primarySoft }]}
      >
        <Text style={[styles.emptyStateActionText, theme && { color: theme.primary }]}>＋ {action}</Text>
      </Pressable>
    </View>
  );
}

function ListMoreButton({
  expanded,
  hiddenCount,
  onPress,
}: {
  expanded: boolean;
  hiddenCount: number;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={expanded ? "목록 간단히 보기" : `${hiddenCount}개 더 보기`}
      accessibilityState={{ expanded }}
      style={[styles.listMoreButton, theme && { borderColor: theme.border }]}
    >
      <Text style={[styles.listMoreText, theme && { color: theme.text }]}>
        {expanded ? "간단히 보기" : `${hiddenCount}개 더 보기`}
      </Text>
      <Text style={[styles.listMoreChevron, theme && { color: theme.primary }]}>{expanded ? "↑" : "↓"}</Text>
    </Pressable>
  );
}

function TravelInfoRow({
  label,
  mark,
  title,
  meta,
  badge,
  color,
  onPress,
}: {
  label: string;
  mark: string;
  title: string;
  meta: string;
  /** 예약 상태처럼 한눈에 봐야 하는 말. 메타 줄 끝에 묻히면 안 읽힌다. */
  badge?: string;
  color: string;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.travelInfoRow,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.packingCardPressed,
      ]}
    >
      <View style={[styles.travelInfoAccent, { backgroundColor: color }]} />
      <View style={[styles.travelInfoTape, { backgroundColor: `${color}55` }]} />
      <View style={[styles.travelInfoLabel, { backgroundColor: `${color}18` }]}>
        <Text style={[styles.travelInfoMark, { color }]}>{mark}</Text>
        <Text style={[styles.travelInfoLabelText, { color }]}>{label}</Text>
      </View>
      <View style={styles.travelInfoCopy}>
        <View style={styles.travelInfoTitleRow}>
          <Text numberOfLines={1} style={[styles.travelInfoTitle, theme && { color: theme.text }]}>{title}</Text>
          {Boolean(badge) && (
            <View style={[styles.travelInfoBadge, { backgroundColor: `${color}1C` }]}>
              <Text style={[styles.travelInfoBadgeText, { color }]}>{badge}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={[styles.travelInfoMeta, theme && { color: theme.muted }]}>{meta}</Text>
      </View>
      <View style={[styles.travelInfoArrowBox, { backgroundColor: `${color}18` }]}>
        <Glyph name="chevronRight" size={16} color={color} />
      </View>
    </Pressable>
  );
}

function TransportCard({
  owner,
  outbound,
  inbound,
  color,
  onPress,
}: {
  owner: string;
  outbound?: Transportation;
  inbound?: Transportation;
  color: string;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  const primary = outbound ?? inbound;
  if (!primary) return null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.transportCard,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.packingCardPressed,
      ]}
    >
      <View style={[styles.transportCardRail, { backgroundColor: color }]} />
      <View style={styles.transportCardHead}>
        <Text style={[styles.transportOwner, { color }]}>{owner}</Text>
        {/* 다 예매했으면 할 일이 없다. 아직인 것만 눈에 띄게 남긴다. */}
        {primary.status === "예매 전" && (
          <Text style={[styles.transportStatus, { color: theme?.accent ?? "#B4453C" }]}>
            {primary.status}
          </Text>
        )}
      </View>
      <Text style={[styles.transportMethod, theme && { color: theme.text }]}>{primary.direction} · {primary.method}</Text>
      <View style={styles.transportRoute}>
        <View style={styles.transportStop}>
          <Text numberOfLines={1} style={[styles.transportPlace, theme && { color: theme.text }]}>{primary.departure}</Text>
          <Text style={[styles.transportTime, { color }]}>{primary.departureTime}</Text>
        </View>
        <View style={styles.transportRouteLine}>
          <View style={[styles.transportRouteDot, { backgroundColor: color }]} />
          <View style={[styles.transportRouteRule, theme && { backgroundColor: theme.border }]} />
          <Glyph name="chevronRight" size={14} color={color} />
        </View>
        <View style={[styles.transportStop, styles.transportStopEnd]}>
          <Text numberOfLines={1} style={[styles.transportPlace, theme && { color: theme.text }]}>{primary.arrival}</Text>
          <Text style={[styles.transportTime, { color }]}>{primary.arrivalTime}</Text>
        </View>
      </View>
      {inbound && (
        <Text numberOfLines={1} style={[styles.transportReturn, theme && { color: theme.muted }]}>오는 편 · {inbound.date} {inbound.departureTime}</Text>
      )}
    </Pressable>
  );
}

function TravelMiniCard({
  label,
  mark,
  title,
  meta,
  color,
  onPress,
  large,
}: {
  label: string;
  mark: string;
  title: string;
  meta: string;
  color: string;
  onPress: () => void;
  large?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.travelMiniCard,
        large ? styles.travelMiniCardLarge : styles.travelMiniCardSmall,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        { transform: [{ rotate: large ? "-.35deg" : ".45deg" }] },
        pressed && styles.packingCardPressed,
      ]}
    >
      <View style={[styles.travelMiniTape, { backgroundColor: `${color}55` }]} />
      <View style={styles.travelMiniTop}>
        <View style={[styles.travelMiniMark, { backgroundColor: `${color}18` }]}>
          <Text style={[styles.travelMiniMarkText, { color }]}>{mark}</Text>
        </View>
        <Text style={[styles.travelMiniLabel, { color }]}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.travelMiniTitle, theme && { color: theme.text }]}>{title}</Text>
      <View style={styles.travelMiniBottom}>
        <Text numberOfLines={1} style={[styles.travelMiniMeta, theme && { color: theme.muted }]}>{meta}</Text>
        <Glyph name="chevronRight" size={16} color={color} />
      </View>
    </Pressable>
  );
}

function Moment({
  time,
  title,
  note,
  mapUrl,
  last,
  compact,
  onPress,
}: {
  time: string;
  title: string;
  note: string;
  mapUrl?: string;
  last?: boolean;
  compact?: boolean;
  onPress?: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `${title} 일정 수정` : undefined}
      style={[
        styles.moment,
        compact && styles.travelMomentCompact,
        theme && { borderColor: theme.border },
        last && styles.lastMoment,
      ]}
    >
      <View style={[styles.momentTime, compact && styles.travelMomentTimeCompact]}>
        <Text style={[styles.momentDay, compact && styles.travelMomentDayCompact, theme && { color: theme.primary }]}>
          {time}
        </Text>
        <View style={styles.dotLine}>
          <View
            style={[styles.dot, theme && { backgroundColor: theme.primary }]}
          />
          {!last && (
            <View
              style={[styles.line, theme && { backgroundColor: theme.border }]}
            />
          )}
        </View>
      </View>
      <View style={[styles.momentContent, compact && styles.travelMomentContentCompact]}>
        <Text style={[styles.momentTitle, theme && { color: theme.text }]}>
          {title}
        </Text>
        <Text style={[styles.momentNote, theme && { color: theme.muted }]}>
          {note}
        </Text>
        {mapUrl ? (
          <Pressable
            onPress={() => Linking.openURL(mapUrl)}
            hitSlop={10}
            accessibilityRole="link"
            accessibilityLabel={`${title} 네이버 지도에서 보기`}
            style={[
              styles.mapLink,
              compact && styles.travelMapLinkCompact,
              theme && { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <View style={styles.mapLinkIcon}>
              <Text style={styles.mapLinkIconText}>N</Text>
            </View>
            <Text style={styles.mapLinkText}>{compact ? "지도" : "네이버 지도"}</Text>
            {!compact && <Text style={styles.mapLinkArrow}>↗</Text>}
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function PairedDetailField({
  label,
  leftValue,
  rightValue,
  onChangeLeft,
  onChangeRight,
  leftPlaceholder,
  rightPlaceholder,
  onSwap,
  accentColor,
  accentSoft,
}: {
  label: string;
  leftValue: string;
  rightValue: string;
  onChangeLeft: (text: string) => void;
  onChangeRight: (text: string) => void;
  leftPlaceholder: string;
  rightPlaceholder: string;
  onSwap?: () => void;
  accentColor?: string;
  accentSoft?: string;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.detailField}>
      <View style={styles.fieldLabelRow}>
        <View style={[styles.fieldLabelDot, theme && { backgroundColor: theme.primary }]} />
        <Text style={[styles.detailFieldLabel, theme && { color: theme.text }]}>{label}</Text>
      </View>
      <View style={styles.pairedFieldRow}>
        <TextInput
          accessibilityLabel={`${label} ${leftPlaceholder}`}
          value={leftValue}
          onChangeText={onChangeLeft}
          placeholder={leftPlaceholder}
          placeholderTextColor={theme?.muted ?? "#9AA1AE"}
          style={[styles.pairedFieldInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        />
        <Pressable
          disabled={!onSwap}
          onPress={onSwap}
          accessibilityRole={onSwap ? "button" : undefined}
          accessibilityLabel={onSwap ? "출발지와 도착지 바꾸기" : undefined}
          hitSlop={{ top: 9, bottom: 9, left: 7, right: 7 }}
          style={[styles.pairedFieldArrow, { backgroundColor: accentSoft ?? theme?.primarySoft ?? "#FFF0ED" }]}
        >
          <Glyph name="arrowRight" size={15} color={accentColor ?? theme?.primary ?? "#FF6B63"} />
        </Pressable>
        <TextInput
          accessibilityLabel={`${label} ${rightPlaceholder}`}
          value={rightValue}
          onChangeText={onChangeRight}
          placeholder={rightPlaceholder}
          placeholderTextColor={theme?.muted ?? "#9AA1AE"}
          style={[styles.pairedFieldInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        />
      </View>
    </View>
  );
}

function DetailField({
  label,
  multiline,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.detailField}>
      <View style={styles.fieldLabelRow}>
        <View
          style={[
            styles.fieldLabelDot,
            theme && { backgroundColor: theme.primary },
          ]}
        />
        <Text style={[styles.detailFieldLabel, theme && { color: theme.text }]}>
          {label}
        </Text>
      </View>
      <TextInput
        {...props}
        accessibilityLabel={label}
        multiline={multiline}
        placeholderTextColor={theme?.muted ?? "#9AA1AE"}
        style={[
          styles.detailFieldInput,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          },
          multiline && styles.detailFieldMultiline,
        ]}
      />
    </View>
  );
}

function OptionalFormSection({
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View
      style={[
        styles.optionalSection,
        theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
      ]}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label} ${open ? "접기" : "펼치기"}`}
        style={({ pressed }) => [
          styles.optionalSectionHead,
          pressed && styles.controlPressed,
        ]}
      >
        <View style={styles.optionalSectionCopy}>
          <Text style={[styles.optionalSectionLabel, theme && { color: theme.text }]}>{label}</Text>
          <Text numberOfLines={1} style={[styles.optionalSectionSummary, theme && { color: theme.muted }]}>{summary}</Text>
        </View>
        <View style={[styles.optionalSectionAction, theme && { backgroundColor: theme.surface }]}>
          <Glyph name={open ? "minus" : "plus"} size={16} color={theme?.primary ?? "#6556D8"} />
        </View>
      </Pressable>
      {open && (
        <View style={[styles.optionalSectionBody, theme && { borderTopColor: theme.border }]}>
          {children}
        </View>
      )}
    </View>
  );
}

const timeAsDate = (value: string, fallback: string) => {
  const [hours, minutes] = (value || fallback).split(":").map(Number);
  const date = new Date(2000, 0, 1, Number.isFinite(hours) ? hours : 12, Number.isFinite(minutes) ? minutes : 0);
  return date;
};

const formatClockTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

function TimePickerControl({
  value,
  onChange,
  fallback,
  optional = false,
  accessibilityLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  fallback: string;
  optional?: boolean;
  accessibilityLabel: string;
}) {
  const theme = useContext(DetailThemeContext);
  const openPicker = () => {
    if (Platform.OS !== "android") return;
    DateTimePickerAndroid.open({
      value: timeAsDate(value, fallback),
      mode: "time",
      display: "spinner",
      is24Hour: true,
      title: accessibilityLabel,
      positiveButton: { label: "확인" },
      negativeButton: { label: "취소" },
      neutralButton: optional ? { label: "시간 미정" } : undefined,
      onValueChange: (_, date) => onChange(formatClockTime(date)),
      onNeutralButtonPress: optional ? () => onChange("") : undefined,
    });
  };

  if (Platform.OS !== "android") {
    return (
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChange}
        placeholder={optional ? "시간 미정" : fallback}
        placeholderTextColor={theme?.muted ?? "#9AA1AE"}
        keyboardType="numeric"
        style={[
          styles.timePickerFallback,
          theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
        ]}
      />
    );
  }

  return (
    <Pressable
      onPress={openPicker}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}, ${value || "시간 미정"}`}
      accessibilityHint="시와 분 숫자를 위아래로 돌려 선택합니다"
      style={({ pressed }) => [
        styles.timePickerButton,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.controlPressed,
      ]}
    >
      <View style={[styles.timePickerIcon, theme && { backgroundColor: theme.primarySoft }]}>
        <Glyph name="clock" size={18} color={theme?.primary ?? "#6556D8"} />
      </View>
      <View style={styles.timePickerCopy}>
        <Text style={[styles.timePickerValue, theme && { color: value ? theme.text : theme.muted }]}>
          {value || "시간 미정"}
        </Text>
        <Text style={[styles.timePickerHint, theme && { color: theme.muted }]}>시·분 숫자를 돌려서 선택</Text>
      </View>
      <Glyph name="chevronRight" size={16} color={theme?.muted ?? "#9AA1AE"} />
    </Pressable>
  );
}

function TimePickerField({
  label,
  value,
  onChange,
  fallback = "12:00",
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fallback?: string;
  optional?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.detailField}>
      <View style={styles.fieldLabelRow}>
        <View style={[styles.fieldLabelDot, theme && { backgroundColor: theme.primary }]} />
        <Text style={[styles.detailFieldLabel, theme && { color: theme.text }]}>{label}</Text>
      </View>
      <TimePickerControl
        value={value}
        onChange={onChange}
        fallback={fallback}
        optional={optional}
        accessibilityLabel={label}
      />
    </View>
  );
}

function PairedTimePickerField({
  label,
  leftValue,
  rightValue,
  onChangeLeft,
  onChangeRight,
}: {
  label: string;
  leftValue: string;
  rightValue: string;
  onChangeLeft: (value: string) => void;
  onChangeRight: (value: string) => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.detailField}>
      <View style={styles.fieldLabelRow}>
        <View style={[styles.fieldLabelDot, theme && { backgroundColor: theme.primary }]} />
        <Text style={[styles.detailFieldLabel, theme && { color: theme.text }]}>{label}</Text>
      </View>
      <View style={styles.pairedTimeRow}>
        <View style={styles.pairedTimeItem}>
          <Text style={[styles.pairedTimeLabel, theme && { color: theme.muted }]}>출발</Text>
          <TimePickerControl value={leftValue} onChange={onChangeLeft} fallback="09:00" optional accessibilityLabel="출발 시간" />
        </View>
        <Glyph name="arrowRight" size={17} color={theme?.primary ?? "#6556D8"} />
        <View style={styles.pairedTimeItem}>
          <Text style={[styles.pairedTimeLabel, theme && { color: theme.muted }]}>도착</Text>
          <TimePickerControl value={rightValue} onChange={onChangeRight} fallback="10:00" optional accessibilityLabel="도착 시간" />
        </View>
      </View>
    </View>
  );
}

function StayDateTimePicker({
  label,
  value,
  dates,
  onDateChange,
  onTimeChange,
}: {
  label: string;
  value: string;
  dates: string[];
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  const theme = useContext(DetailThemeContext);
  const time = value.match(/\d{1,2}:\d{2}$/)?.[0] ?? "12:00";
  const date = value.replace(/\s*\d{1,2}:\d{2}$/, "").trim() || dates[0];
  return (
    <View style={[styles.stayPicker, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      <View style={styles.stayPickerHead}>
        <Text style={[styles.stayPickerLabel, theme && { color: theme.text }]}>{label}</Text>
        <Text style={[styles.stayPickerValue, theme && { color: theme.primary }]}>{value}</Text>
      </View>
      <OptionField label="날짜" options={dates} value={date} onChange={onDateChange} />
      <TimePickerField label="시간" value={time} onChange={onTimeChange} fallback={time} />
    </View>
  );
}

function DetailSheet({
  visible,
  title,
  subtitle,
  submit,
  disabledHint,
  destructiveLabel,
  destructiveMessage,
  confirmSubmit,
  submitDisabled = false,
  hasUnsavedChanges = false,
  onClose,
  onSubmit,
  onDestructive,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  submit: string;
  disabledHint?: string;
  destructiveLabel?: string;
  destructiveMessage?: string;
  /**
   * 저장 자체가 되돌릴 수 없을 때 한 번 더 묻는 말.
   *
   * 지우는 버튼이 따로 있는 경우와 달리, 목록 교체처럼 저장 버튼이 곧 삭제인
   * 자리가 있다. 그때는 저장을 눌러도 바로 하지 않고 이 문장을 보여 준다.
   */
  confirmSubmit?: string;
  submitDisabled?: boolean;
  hasUnsavedChanges?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onDestructive?: () => void;
  children: React.ReactNode;
}) {
  const theme = useContext(DetailThemeContext);
  // 되돌릴 수 없는 것을 확정하는 버튼인데 글자가 가장 흐리면 안 된다.
  // 색값을 따로 박지 말고 라이트/다크 AA 를 맞춰 둔 토큰을 쓴다.
  const danger = theme?.dark ? statusColor.danger.dark : statusColor.danger.light;
  const [confirmingDestructive, setConfirmingDestructive] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const submitLocked = useRef(false);
  useEffect(() => {
    if (visible) submitLocked.current = false;
  }, [visible]);
  const closeAndReset = () => {
    setConfirmingDestructive(false);
    setConfirmingSubmit(false);
    onClose();
  };
  const requestClose = () => {
    if (!hasUnsavedChanges) {
      closeAndReset();
      return;
    }
    Alert.alert(
      "저장하지 않고 닫을까요?",
      "변경한 내용은 저장되지 않아요.",
      [
        { text: "취소", style: "cancel" },
        { text: "저장 안 함", style: "destructive", onPress: closeAndReset },
      ],
    );
  };
  const drag = useSheetDrag(requestClose, visible, hasUnsavedChanges);
  const sheetKind = title.includes("일정")
    ? "일정"
    : title.includes("장소")
      ? "장소"
      : title.includes("준비") || title.includes("담당")
        ? "준비"
        : title.includes("요리") || title.includes("재료")
          ? "요리"
          : title.includes("붙여넣기") || title.includes("태그 선택")
            ? "목록"
          : title.includes("교통")
            ? "교통"
            : title.includes("숙소")
              ? "숙소"
              : title.includes("예약")
                ? "예약"
          : title.includes("기록") || title.includes("사진") || title.includes("일기") || title.includes("카드") || title.includes("메모")
            ? "기록"
            : "Daymo";
  const sheetAccent = theme
    ? sheetKind === "장소"
      ? theme.secondary
      : sheetKind === "준비"
        ? theme.accent
        : sheetKind === "요리"
          ? theme.secondary
        : sheetKind === "숙소"
          ? theme.secondary
        : sheetKind === "예약"
          ? theme.accent
        : sheetKind === "기록"
          ? theme.secondary
          : theme.primary
    : "#FF6B63";
  const sheetAction = title.includes("수정")
    ? "수정"
    : title.includes("추가")
      ? "추가"
      : title.includes("선택")
        ? "선택"
        : title.includes("관리")
          ? "관리"
          : title.includes("담기")
            ? "일정"
            : "확인";
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBack}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.modalDismiss}
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel={`${title} 바깥 영역 닫기`}
        />
        <Animated.View
          onLayout={drag.onLayout}
          style={[styles.sheet, theme && { backgroundColor: theme.background }, drag.sheetStyle]}
        >
          <View {...drag.panHandlers} style={styles.sheetDragHandleArea}>
            <View style={styles.sheetHandle} />
          </View>
          <View
            style={[
              styles.sheetHead,
              styles.sheetHeadDecorated,
              { backgroundColor: `${sheetAccent}0B`, borderColor: `${sheetAccent}30` },
            ]}
          >
            <View {...drag.panHandlers} style={styles.sheetHeadMain}>
              <View style={styles.sheetHeadCopy}>
                <View style={styles.sheetKindRow}>
                  <View style={[styles.sheetKindDot, { backgroundColor: sheetAccent }]} />
                  <Text style={[styles.sheetKindText, { color: sheetAccent }]}>{sheetKind} · {sheetAction}</Text>
                </View>
                <Text
                  style={[styles.sheetTitle, theme && { color: theme.text }]}
                >
                  {title}
                </Text>
                {subtitle && (
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.sheetSubtitle,
                      theme && { color: theme.muted },
                    ]}
                  >
                    {subtitle}
                  </Text>
                )}
              </View>
            </View>
            <Pressable
              onPress={requestClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${title} 닫기`}
              style={[
                styles.sheetCloseButton,
                theme && { backgroundColor: theme.surfaceAlt },
              ]}
            >
              <Text
                style={[styles.sheetClose, theme && { color: theme.primary }]}
              >
                ×
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.sheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
            <View style={styles.sheetFormBody}>
              {children}
            </View>
          </ScrollView>
          {submitDisabled && disabledHint && (
            <Text accessibilityLiveRegion="polite" style={[styles.sheetDisabledHint, theme && { color: theme.muted }]}>
              {disabledHint}
            </Text>
          )}
          <Pressable
            onPress={() => {
              if (submitLocked.current) return;
              Keyboard.dismiss();
              setConfirmingDestructive(false);
              // 저장이 곧 삭제인 자리에서는 한 번 더 묻는다.
              if (confirmSubmit && !confirmingSubmit) {
                setConfirmingSubmit(true);
                return;
              }
              submitLocked.current = true;
              setConfirmingSubmit(false);
              onSubmit();
              setTimeout(() => {
                submitLocked.current = false;
              }, 800);
            }}
            disabled={submitDisabled}
            accessibilityRole="button"
            accessibilityLabel={submit}
            accessibilityState={{ disabled: submitDisabled }}
            style={({ pressed }) => [
              styles.sheetSubmit,
              theme && { backgroundColor: theme.primary },
              submitDisabled && styles.sheetSubmitDisabled,
              pressed && !submitDisabled && styles.controlPressed,
            ]}
          >
            <Text style={[styles.sheetSubmitText, theme && { color: onAccent(theme.dark) }]}>{submit}</Text>
            <View style={styles.sheetSubmitArrow}>
              <Glyph name="arrowRight" size={15} color={onAccent(Boolean(theme?.dark))} />
            </View>
          </Pressable>
          {confirmSubmit && confirmingSubmit && (
            <View
              accessibilityLiveRegion="polite"
              style={[styles.deleteConfirm, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
            >
              <View style={styles.deleteConfirmCopy}>
                <Text style={[styles.deleteConfirmTitle, theme && { color: theme.text }]}>{submit}할까요?</Text>
                <Text style={[styles.deleteConfirmMessage, theme && { color: theme.muted }]}>{confirmSubmit}</Text>
              </View>
              <View style={styles.deleteConfirmActions}>
                <Pressable
                  onPress={() => setConfirmingSubmit(false)}
                  accessibilityRole="button"
                  style={[styles.deleteConfirmButton, theme && { borderColor: theme.border }]}
                >
                  <Text style={[styles.deleteConfirmCancel, theme && { color: theme.text }]}>취소</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setConfirmingSubmit(false);
                    onSubmit();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${submit} 확인`}
                  style={[styles.deleteConfirmButton, { backgroundColor: danger, borderColor: danger }]}
                >
                  <Text style={[styles.deleteConfirmDanger, { color: onAccent(Boolean(theme?.dark)) }]}>확인</Text>
                </Pressable>
              </View>
            </View>
          )}
          {destructiveLabel && confirmingDestructive && (
            <View
              accessibilityLiveRegion="polite"
              style={[styles.deleteConfirm, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
            >
              <View style={styles.deleteConfirmCopy}>
                <Text style={[styles.deleteConfirmTitle, theme && { color: theme.text }]}>{destructiveLabel}할까요?</Text>
                <Text style={[styles.deleteConfirmMessage, theme && { color: theme.muted }]}>
                  {destructiveMessage ?? "삭제한 내용은 되돌릴 수 없어요."}
                </Text>
              </View>
              <View style={styles.deleteConfirmActions}>
                <Pressable
                  onPress={() => setConfirmingDestructive(false)}
                  accessibilityRole="button"
                  style={[styles.deleteConfirmButton, theme && { borderColor: theme.border }]}
                >
                  <Text style={[styles.deleteConfirmCancel, theme && { color: theme.text }]}>취소</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setConfirmingDestructive(false);
                    onDestructive?.();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${destructiveLabel} 확인`}
                  style={[styles.deleteConfirmButton, { backgroundColor: danger, borderColor: danger }]}
                >
                  <Text style={[styles.deleteConfirmDanger, { color: onAccent(Boolean(theme?.dark)) }]}>확인</Text>
                </Pressable>
              </View>
            </View>
          )}
          {destructiveLabel && !confirmingDestructive && (
            <Pressable
              onPress={() => setConfirmingDestructive(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={destructiveLabel}
              style={styles.deletePlace}
            >
              <Text style={[styles.deletePlaceText, { color: danger }]}>{destructiveLabel}</Text>
            </Pressable>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function InfoPanel({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const theme = useContext(DetailThemeContext);
  const drag = useSheetDrag(onClose, visible);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBack}>
        <Pressable
          style={styles.modalDismiss}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`${title} 바깥 영역 닫기`}
        />
        <Animated.View
          onLayout={drag.onLayout}
          style={[styles.sheet, theme && { backgroundColor: theme.background }, drag.sheetStyle]}
        >
          <View {...drag.panHandlers} style={styles.sheetDragHandleArea}>
            <View style={styles.sheetHandle} />
          </View>
          <View style={styles.sheetHead}>
            <View {...drag.panHandlers} style={styles.sheetHeadCopy}>
              <Text style={[styles.sheetTitle, theme && { color: theme.text }]}>
                {title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${title} 닫기`}
              style={[styles.infoPanelCloseButton, theme && { backgroundColor: theme.primarySoft }]}
            >
              <Text
                style={[styles.infoPanelCloseText, theme && { color: theme.primary }]}
              >
                완료
              </Text>
            </Pressable>
          </View>
          {/* 시트는 91% 높이에서 멈춘다. 감싸지 않으면 개수 제한 없이 그리는
              패널의 아래쪽이 잘려 아예 볼 수 없다. */}
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
function InfoLine({ label, value }: { label: string; value: string }) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={[styles.infoLine, theme && { borderColor: theme.border }]}>
      <Text style={[styles.infoLineLabel, theme && { color: theme.muted }]}>
        {label}
      </Text>
      <Text style={[styles.infoLineValue, theme && { color: theme.text }]}>
        {value}
      </Text>
    </View>
  );
}
function OptionField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.optionField}>
      <View style={styles.fieldLabelRow}>
        <View
          style={[
            styles.fieldLabelDot,
            theme && { backgroundColor: theme.primary },
          ]}
        />
        <Text style={[styles.detailFieldLabel, theme && { color: theme.text }]}>
          {label}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionRow}
      >
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            hitSlop={{ top: 3, bottom: 3, left: 1, right: 1 }}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option }}
            style={({ pressed }) => [
              styles.optionChip,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              value === option && styles.optionChipActive,
              value === option &&
                theme && {
                  backgroundColor: theme.primarySoft,
                  borderColor: theme.primary,
                },
              pressed && styles.controlPressed,
            ]}
          >
            <Text
              style={[
                styles.optionText,
                theme && { color: theme.muted },
                value === option && styles.optionTextActive,
                value === option && theme && { color: theme.primary },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  feedbackToast: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 18,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: "#17233D",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#17233D",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  feedbackToastMark: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#FF6B63", marginRight: 8 },
  feedbackToastText: { flex: 1, color: "#FFFFFF", fontSize: 14, fontFamily: typo.label.family },
  controlPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },

  detailTitleRow: {
    position: "relative",
  },
  detailTripTitle: { maxWidth: "68%" },
  tripMemoButton: {
    width: 102,
    minHeight: 72,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E6D38C",
    backgroundColor: "#FFF3B8",
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
    justifyContent: "space-between",
    position: "absolute",
    right: 0,
    bottom: -12,
    transform: [{ rotate: "-1.5deg" }],
    shadowColor: "#6E5B32",
    shadowOpacity: 0.14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  tripMemoTape: {
    position: "absolute",
    width: 34,
    height: 8,
    top: -5,
    left: 34,
    backgroundColor: "rgba(238, 178, 160, .58)",
    transform: [{ rotate: "2deg" }],
  },
  tripMemoLabel: {
    color: "#A17F32",
    fontSize: 12,
    fontFamily: typo.label.family,
    letterSpacing: 0.5,
  },
  tripMemoPreview: {
    color: "#5F4B23",
    fontSize: 11,
    fontFamily: typo.caption.family,
    marginTop: 2,
  },
  tripMemoBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(154, 121, 48, .2)",
    paddingTop: 4,
  },
  tripMemoButtonText: {
    color: "#806727",
    fontSize: 14,
    fontFamily: typo.label.family,
  },
  tripMemoFold: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    backgroundColor: "#E8D681",
    borderTopLeftRadius: 8,
  },
  tripMemoList: {
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 8,
    marginBottom: 16,
    gap: 8,
  },
  tripMemoRow: { padding: 12, borderWidth: 1, borderColor: "#EEEAE5", borderRadius: 12 },
  tripMemoRowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  tripMemoActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  tripMemoEdit: { color: "#746F6A", fontSize: 12, fontFamily: typo.label.family },
  tripMemoDelete: { color: "#D05E58", fontSize: 12, fontFamily: typo.label.family },
  tripMemoAuthor: { color: "#B76A59", fontSize: 12, fontFamily: typo.label.family },
  tripMemoBody: { color: "#35333A", fontSize: 14, lineHeight: 21, marginTop: 6 },
  memoAddButton: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  memoAddPlus: { fontSize: 24, lineHeight: 26, fontWeight: "500", marginRight: 8 },
  memoAddCopy: { flex: 1 },
  memoAddTitle: { fontSize: 14, fontFamily: typo.title.family },
  memoAddHint: { fontSize: 11, marginTop: 2 },
  memoEditor: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  memoEditorHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  memoEditorTitle: { fontSize: 18, fontFamily: typo.title.family },
  memoEditorCancel: { fontSize: 12, fontFamily: typo.label.family },
  memoEmpty: { alignItems: "center", paddingVertical: 20 },
  memoEmptyTitle: { fontSize: 18, fontFamily: typo.title.family },
  memoEmptyHint: { fontSize: 11, marginTop: 4 },
  travelTimelineCard: { padding: 0, marginBottom: 22, overflow: "hidden" },
  travelTimelineHead: {
    minHeight: 55,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  travelTimelineEyebrow: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.4 },
  travelTimelineDate: { fontSize: 15, fontFamily: typo.title.family, marginTop: 1 },
  travelTimelineCount: { fontSize: 11, fontFamily: typo.label.family },
  travelTimelineItems: { paddingHorizontal: 12, paddingTop: 8 },
  travelTimelineTape: {
    position: "absolute",
    top: -5,
    left: 28,
    width: 42,
    height: 10,
    borderRadius: 2,
    opacity: 0.22,
    transform: [{ rotate: "-2deg" }],
  },
  travelMomentCompact: { minHeight: 57 },
  travelMomentTimeCompact: { width: 84 },
  travelMomentDayCompact: { width: 62, fontSize: 12 },
  travelMomentContentCompact: { paddingLeft: 4 },
  travelMapLinkCompact: { height: 23, marginTop: 4, paddingHorizontal: 6 },
  travelInfoList: {
    gap: 8,
    marginBottom: 18,
  },
  transportGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  transportCard: { flexGrow: 1, flexBasis: "46%", minWidth: 0, minHeight: 119, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, overflow: "hidden", position: "relative" },
  transportCardRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  transportCardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  transportOwner: { fontSize: 12, fontFamily: typo.label.family },
  transportStatus: { fontSize: 12, fontFamily: typo.label.family },
  transportMethod: { fontSize: 12, fontFamily: typo.label.family, marginTop: 6 },
  transportRoute: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  transportStop: { flex: 1, minWidth: 0 },
  transportStopEnd: { alignItems: "flex-end" },
  transportPlace: { fontSize: 12, fontFamily: typo.label.family },
  transportTime: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  transportRouteLine: { width: 31, flexDirection: "row", alignItems: "center", marginHorizontal: 2 },
  transportRouteDot: { width: 4, height: 4, borderRadius: 999 },
  transportRouteRule: { flex: 1, height: 1 },
  transportRouteArrow: { fontSize: 12, lineHeight: 13, fontFamily: typo.label.family },
  transportReturn: { fontSize: 12, fontFamily: typo.label.family, marginTop: 8 },
  transportFormPreview: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  transportFormOwner: { fontSize: 12, fontFamily: typo.label.family },
  transportPreviewRouteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  transportFormRoute: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: typo.label.family },
  transportFormMeta: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 4 },
  transportSwitchHint: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  transportSwitchHintText: { fontSize: 11, lineHeight: 13, fontFamily: typo.caption.family },
  transportSwitchHintArrow: { fontSize: 14, lineHeight: 16, fontFamily: typo.label.family },
  pairedFieldRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pairedFieldInput: { flex: 1, minWidth: 0, height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, textAlign: "center" },
  pairedFieldArrow: { width: 27, height: 27, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pairedFieldArrowText: { fontSize: 14, lineHeight: 16, fontFamily: typo.label.family },
  transportDetailBlock: { borderBottomWidth: 1, paddingBottom: 8, marginBottom: 8 },
  transportDetailDirection: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 2 },
  infoManageButton: { minHeight: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 6 },
  infoManageButtonText: { fontSize: 14, fontFamily: typo.label.family },
  travelInfoPair: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  travelMiniCard: {
    minHeight: 86,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    position: "relative",
    overflow: "hidden",
  },
  travelMiniCardLarge: { flex: 1.18 },
  travelMiniCardSmall: { flex: 0.82 },
  travelMiniTape: {
    position: "absolute",
    top: -2,
    left: "38%",
    width: 27,
    height: 8,
    borderRadius: 2,
    transform: [{ rotate: "-4deg" }],
  },
  travelMiniTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  travelMiniMark: {
    minWidth: 27,
    height: 24,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  travelMiniMarkText: { fontSize: 12, fontFamily: typo.label.family },
  travelMiniLabel: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.5 },
  travelMiniTitle: { fontSize: 14, fontFamily: typo.title.family, marginTop: 6 },
  travelMiniBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  travelMiniMeta: { flex: 1, fontSize: 11, fontFamily: typo.caption.family },
  travelMiniArrow: { fontSize: 16, lineHeight: 17, fontFamily: typo.label.family, marginLeft: 4 },
  travelInfoRow: {
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  travelInfoAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  travelInfoTape: {
    position: "absolute",
    top: -2,
    left: 22,
    width: 24,
    height: 7,
    borderRadius: 2,
    transform: [{ rotate: "-4deg" }],
  },
  travelInfoLabel: {
    width: 48,
    height: 45,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    transform: [{ rotate: "-2deg" }],
  },
  travelInfoMark: { fontSize: 12, lineHeight: 15, fontFamily: typo.label.family },
  travelInfoLabelText: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  travelInfoCopy: { flex: 1, minWidth: 0 },
  travelInfoTitle: { fontSize: 14, fontFamily: typo.title.family },
  travelInfoTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  travelInfoBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  travelInfoBadgeText: { fontSize: 12, fontFamily: typo.label.family },
  travelInfoMeta: { fontSize: 13, fontFamily: typo.caption.family, marginTop: 2 },
  travelInfoArrowBox: {
    width: 27,
    height: 27,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  travelInfoArrow: { fontSize: 18, lineHeight: 20, fontFamily: typo.label.family },
  moment: { flexDirection: "row", minHeight: 67 },
  lastMoment: { minHeight: 46 },
  momentTime: { width: 82, flexDirection: "row" },
  momentDay: {
    color: "#B1776B",
    fontSize: 14,
    fontFamily: typo.data.family,
    width: 57,
    paddingTop: 2,
  },
  dotLine: { alignItems: "center", width: 15 },
  line: { flex: 1, width: 1, backgroundColor: "#F0DCD2", marginTop: 4 },
  momentContent: { flex: 1, paddingLeft: 6 },
  momentTitle: { color: "#5A3531", fontSize: 14, fontFamily: typo.title.family },
  momentNote: { color: "#A18980", fontSize: 14, marginTop: 4 },
  readyText: {
    color: "#FFF8F3",
    fontSize: 14,
    fontFamily: typo.label.family,
    marginTop: 4,
  },
  checkName: { color: "#593934", fontSize: 14, fontFamily: typo.title.family },
  checkNameDone: { color: "#B29B92", textDecorationLine: "line-through" },
  keepsakeCopy: { flex: 1, minWidth: 0 },
  keepsakeStyle: { color: "#B06C5E", fontSize: 12, fontFamily: typo.label.family },
  keepsakeCompact: {
    minHeight: 76,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  keepsakeStrip: { width: 82, height: 52, flexDirection: "row", gap: 2, marginRight: 10 },
  keepsakeThumb: { flex: 1, borderRadius: 5, overflow: "hidden" },
  keepsakeCompactTitle: { fontSize: 13, fontFamily: typo.title.family, marginTop: 2 },
  keepsakeCompactAction: { fontSize: 11, fontFamily: typo.label.family, marginTop: 3 },
  diaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8E2DA",
    backgroundColor: "#FFFFFF",
    padding: 16,
    paddingLeft: 20,
    marginBottom: 8,
    position: "relative",
    overflow: "hidden",
  },
  diaryRuleSide: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 7,
    width: 2,
    opacity: 0.45,
  },
  diaryPaperRules: {
    position: "absolute",
    left: 19,
    right: 13,
    top: 48,
    gap: 16,
  },
  diaryPaperRule: { height: StyleSheet.hairlineWidth, opacity: 0.55 },
  diaryDate: { color: "#B06C5E", fontSize: 11, fontFamily: typo.caption.family },
  diaryTitle: { color: "#35333A", fontSize: 14, fontFamily: typo.title.family, marginTop: 6 },
  diaryBody: { color: "#8C8580", fontSize: 14, lineHeight: 20, marginTop: 6 },
  cardMiniPreview: {
    height: 105,
    borderRadius: 12,
    backgroundColor: "#F4EFE8",
    padding: 8,
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
  },
  cardMiniPhoto: { flex: 1, borderRadius: 8, overflow: "hidden" },
  memoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  memoryTilePhoto: { flex: 1, borderRadius: 4, overflow: "hidden" },
  memoryPhotoImage: { position: "absolute", inset: 0, width: "100%", height: "100%" },
  memoryTileGlow: {
    width: "70%",
    height: "120%",
    marginLeft: -12,
    marginTop: -10,
    backgroundColor: "rgba(255,255,255,0.13)",
    transform: [{ rotate: "18deg" }],
  },
  memoryTileCaption: {
    minHeight: 23,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileNumber: {
    flex: 1,
    minWidth: 0,
    color: "rgba(83, 54, 48, .65)",
    fontSize: 12,
    fontFamily: typo.data.family,
  },
  memoryTileDate: { flexShrink: 0, fontSize: 11, fontFamily: typo.caption.family, marginLeft: 3 },
  modalBack: {
    flex: 1,
    backgroundColor: "rgba(10,18,35,.42)",
    justifyContent: "flex-end",
  },
  modalDismiss: { flex: 1 },
  sheetHandle: {
    width: 54,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C7C7C3",
  },
  sheetDragHandleArea: {
    height: 40,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  sheetHeadDecorated: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 2,
    position: "relative",
  },
  sheetFormBody: {
    paddingHorizontal: 2,
  },
  sheetHeadMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  sheetHeadCopy: { flex: 1 },
  sheetKindRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  sheetKindDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  sheetKindText: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 1 },
  sheetRouteLine: { width: 27, height: 1, marginLeft: 8, marginRight: 4 },
  sheetRouteDot: { width: 6, height: 6, borderRadius: 999, borderWidth: 1.5 },
  sheetTitle: {
    color: "#17233D",
    fontSize: 24,
    fontFamily: typo.title.family,
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    color: "#818A99",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  sheetDisabledHint: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: typo.caption.family,
    textAlign: "center",
    marginTop: 4,
  },
  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sheetClose: {
    color: "#6556D8",
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "500",
  },
  infoPanelCloseButton: {
    minWidth: 52,
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  infoPanelCloseText: { fontSize: 16, lineHeight: 20, fontFamily: typo.label.family },
  detailField: { marginBottom: 12 },
  formGuideText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#756F6B",
    marginBottom: 12,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  fieldLabelDot: { width: 5, height: 5, borderRadius: 2, marginRight: 6 },
  detailFieldLabel: {
    color: "#6F7888",
    fontSize: 12,
    fontFamily: typo.label.family,
    marginBottom: 0,
  },
  detailFieldMultiline: {
    height: 104,
    paddingTop: 16,
    textAlignVertical: "top",
  },
  optionalSection: {
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: "#F6F4F0",
    marginBottom: 16,
    overflow: "hidden",
  },
  optionalSectionHead: {
    minHeight: 62,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionalSectionCopy: { flex: 1, minWidth: 0 },
  optionalSectionLabel: { fontSize: 14, fontFamily: typo.label.family },
  optionalSectionSummary: { fontSize: 11, lineHeight: 15, fontFamily: typo.caption.family, marginTop: 3 },
  optionalSectionAction: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  optionalSectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#DDD9D1",
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  timePickerButton: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timePickerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timePickerCopy: { flex: 1, minWidth: 0 },
  timePickerValue: { fontSize: 16, fontFamily: typo.data.family },
  timePickerHint: { fontSize: 11, lineHeight: 16, fontFamily: typo.caption.family, marginTop: 1 },
  timePickerFallback: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  pairedTimeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pairedTimeItem: { flex: 1, minWidth: 0, gap: 5 },
  pairedTimeLabel: { fontSize: 11, fontFamily: typo.label.family, paddingLeft: 2 },
  stayPicker: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 2,
    marginBottom: 12,
  },
  stayPickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  stayPickerLabel: { fontSize: 14, fontFamily: typo.label.family },
  stayPickerValue: { fontSize: 14, fontFamily: typo.data.family },
  sheetSubmit: {
    height: 50,
    borderRadius: 16,
    backgroundColor: "#17233D",
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    paddingLeft: 16,
    paddingRight: 6,
    marginTop: 6,
  },
  sheetSubmitText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.label.family },
  sheetSubmitDisabled: { opacity: 0.38 },
  sheetSubmitArrow: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoLine: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E0DA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoLineLabel: { color: "#858D9A", fontSize: 12, fontFamily: typo.label.family },
  infoLineValue: {
    color: "#17233D",
    fontSize: 14,
    fontFamily: typo.data.family,
    maxWidth: "70%",
    textAlign: "right",
  },
  tripMetaBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  tripMetaLabel: { color: "#6F7888", fontSize: 12, fontFamily: typo.label.family },
  tripMetaValue: {
    color: "#17233D",
    fontSize: 14,
    fontFamily: typo.data.family,
    marginTop: 6,
  },
  tripEditSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E0DA",
    paddingTop: 16,
    marginTop: 2,
  },
  tripEditSectionTitle: { fontSize: 16, fontFamily: typo.title.family },
  tripEditSectionHint: { fontSize: 11, lineHeight: 16, fontFamily: typo.caption.family, marginTop: 3, marginBottom: 14 },
  optionField: { marginBottom: 16 },
  optionRow: { gap: 8, paddingRight: 6 },
  optionChipActive: { backgroundColor: "#17233D", borderColor: "#17233D" },
  optionText: { color: "#747D8D", fontSize: 12, fontFamily: typo.label.family },
  optionTextActive: { color: "#FFFFFF" },
  inlineFields: { flexDirection: "row", gap: 8 },
  titleField: { flex: 1 },
  // 시트 머리와 같은 종이 카드. 머리(16)와 모서리 반지름을 맞춰 위아래가 한
  // 덩어리로 읽힌다. 전에는 남색 바탕에 반지름 20 이라 머리 밑에 목처럼 걸렸다.
  planPreview: {
    minHeight: 86,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E3DD",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  previewDate: {
    width: 58,
    height: 62,
    borderRadius: 12,
    backgroundColor: "#3F4C8F",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  previewDay: { color: "#E6E9F7", fontSize: 14, fontFamily: typo.data.family },
  previewDateNo: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 27,
    fontFamily: typo.data.family,
  },
  previewBody: { flex: 1 },
  previewType: {
    color: "#3F4C8F",
    fontSize: 12,
    letterSpacing: 0.5,
    fontFamily: typo.label.family,
  },
  previewTitle: {
    color: "#17233D",
    fontSize: 16,
    fontFamily: typo.title.family,
    marginTop: 6,
  },
  previewPlace: { color: "#646C7A", fontSize: 12, marginTop: 4 },
  savedPlacePicker: { marginBottom: 18 },
  savedPlacePickerHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  savedPlacePickerHint: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  savedPlaceClear: { fontSize: 12, fontFamily: typo.label.family },
  savedPlacePickerRow: { gap: 8, paddingRight: 10 },
  savedPlaceChoice: {
    width: 152,
    minHeight: 58,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },
  savedPlaceChoiceName: { fontSize: 13, fontFamily: typo.label.family },
  savedPlaceChoiceMeta: { fontSize: 12, marginTop: 4 },
  naverField: {
    backgroundColor: "#E6F5ED",
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#CDEADB",
  },
  naverHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  naverCopy: { flex: 1, minWidth: 0 },
  naverAutoFill: {
    minHeight: 62,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  naverAutoFillCopy: { flex: 1, minWidth: 0 },
  naverAutoFillTitle: { fontSize: 14, fontFamily: typo.title.family },
  naverAutoFillText: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  naverLinkGuide: {
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: "#EAF7F0",
    padding: 12,
    marginBottom: 14,
  },
  naverLinkActions: { flexDirection: "row", gap: 8 },
  naverLinkButton: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  naverLinkButtonPrimary: { backgroundColor: "#03C75A" },
  naverLinkButtonText: { color: "#16844E", fontSize: 13, fontFamily: typo.label.family },
  naverLinkButtonPrimaryText: { color: "#FFFFFF" },
  naverConnected: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  naverConnectedCopy: { flexDirection: "row", alignItems: "center", gap: 6 },
  naverConnectedText: { color: "#16844E", fontSize: 12, fontFamily: typo.label.family },
  naverDisconnectText: { color: "#7C8390", fontSize: 11, fontFamily: typo.caption.family },
  naverLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#03C75A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  naverLogoText: { color: "#FFFFFF", fontSize: 16, fontFamily: typo.label.family },
  naverTitle: { color: "#184D36", fontSize: 14, fontFamily: typo.title.family },
  naverHint: { color: "#648172", fontSize: 11, marginTop: 2 },
  naverInput: {
    height: 45,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    color: "#184D36",
    fontSize: 12,
  },
  linkState: { color: "#278153", fontSize: 14, fontFamily: typo.label.family, marginTop: 8 },
  mapLink: {
    alignSelf: "flex-start",
    height: 25,
    borderRadius: 8,
    backgroundColor: "#E6F5ED",
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  mapLinkIcon: {
    width: 15,
    height: 15,
    borderRadius: 4,
    backgroundColor: "#03C75A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  mapLinkIconText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.label.family },
  mapLinkText: { color: "#23714B", fontSize: 14, fontFamily: typo.label.family },
  mapLinkArrow: { color: "#23714B", fontSize: 14, marginLeft: 4 },
  placeFilterText: { color: "#7C8390", fontSize: 12, fontFamily: typo.label.family },
  placeFilterTextActive: { color: "#FFFFFF" },
  placeAddText: { color: "#6556D8", fontSize: 12, fontFamily: typo.label.family },
  placeList: { gap: 8 },
  placeFormIntro: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  placeRequiredBadge: { height: 25, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", marginRight: 8 },
  placeRequiredBadgeText: { fontSize: 12, fontFamily: typo.label.family },
  placeFormText: {
    color: "#61598C",
    fontSize: 12,
    fontFamily: typo.label.family,
  },
  placeSearchInput: { flex: 1, color: "#17233D", fontSize: 12 },
  resultCount: {
    minWidth: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: "#F0EDFF",
    alignItems: "center",
    justifyContent: "center",
  },
  resultCountText: { color: "#6556D8", fontSize: 14, fontFamily: typo.data.family },
  tagFilterChipActive: { backgroundColor: "#8B7CF6" },
  tagFilterLabel: { color: "#777F8C", fontSize: 12, fontFamily: typo.label.family },
  tagFilterLabelActive: { color: "#FFFFFF" },
  placeTags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 },
  placeTagText: { color: "#6556D8", fontSize: 12, fontFamily: typo.label.family },
  tagEditor: { marginBottom: 16 },
  selectorLabel: { marginBottom: 8 },
  placeRecommendLabel: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 6 },
  tagSuggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  tagSuggestion: {
    borderRadius: 8,
    backgroundColor: "#ECEAE5",
    borderWidth: 1,
    borderColor: "#DAD6CD",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tagSuggestionActive: { backgroundColor: "#8B7CF6" },
  tagSuggestionText: { color: "#747C88", fontSize: 12, fontFamily: typo.label.family },
  tagSuggestionTextActive: { color: "#FFFFFF" },
  tagInput: {
    minHeight: 47,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E0DA",
    color: "#17233D",
    fontSize: 12,
    paddingHorizontal: 12,
  },
  draftTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  draftTag: {
    borderRadius: 8,
    backgroundColor: "#E9E5FF",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  draftTagText: { color: "#6556D8", fontSize: 12, fontFamily: typo.label.family },
  deletePlace: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  deletePlaceText: { fontSize: 13, fontFamily: typo.label.family },
  deleteConfirm: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    gap: 10,
  },
  deleteConfirmCopy: { paddingHorizontal: 2 },
  deleteConfirmTitle: { fontSize: 14, fontFamily: typo.title.family },
  deleteConfirmMessage: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  deleteConfirmActions: { flexDirection: "row", gap: 8 },
  deleteConfirmButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteConfirmCancel: { fontSize: 12, fontFamily: typo.label.family },
  deleteConfirmDanger: { fontSize: 13, fontFamily: typo.label.family },
  fullScheduleText: { color: "#6556D8", fontSize: 12, fontFamily: typo.label.family },
  moneySummary: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 8 },
  moneySummaryLabel: { fontSize: 12, fontFamily: typo.label.family },
  moneyTotal: { fontSize: 32, marginTop: 2, fontFamily: typo.data.family, letterSpacing: -0.5 },
  moneyTotalUnit: { fontSize: 16, fontFamily: typo.body.family },
  quickAdd: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, marginBottom: 10 },
  quickAddTitle: { fontSize: 12, fontFamily: typo.label.family },
  quickAddChips: { gap: 6, paddingVertical: 9, paddingRight: 4 },
  quickAddChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  quickAddChipText: { fontSize: 12.5, fontFamily: typo.label.family },
  quickAddRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  quickAddInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, fontFamily: typo.data.family },
  quickAddButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, paddingLeft: 12, paddingRight: 14, paddingVertical: 11 },
  quickAddButtonText: { fontSize: 14, fontFamily: typo.label.family },
  quickAddHint: { fontSize: 11, marginTop: 8, fontFamily: typo.caption.family },
  participantRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  participantName: { flex: 1, fontSize: 14, fontFamily: typo.title.family },
  participantWarn: { fontSize: 11, fontFamily: typo.caption.family },
  shareField: { marginBottom: 20 },
  shareRows: { gap: 8, marginTop: 10 },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  shareName: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 44, minWidth: 72, alignItems: "center", justifyContent: "center" },
  shareNameText: { fontSize: 13, fontFamily: typo.label.family },
  shareWeight: { flexDirection: "row", alignItems: "center", gap: 10 },
  shareWeightValue: { minWidth: 18, textAlign: "center", fontSize: 14, fontFamily: typo.data.family },
  shareAmount: { flex: 1, textAlign: "right", fontSize: 12, fontFamily: typo.data.family },
  amountSteps: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -10, marginBottom: 18 },
  amountStep: { borderWidth: 1, borderColor: "transparent", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  amountStepText: { fontSize: 12, fontFamily: typo.label.family },
  moneyCurrencyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  moneyCurrencyChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, borderWidth: 1, borderRadius: 999, paddingLeft: 12, paddingRight: 9 },
  moneyCurrencyLabel: { fontSize: 11, fontFamily: typo.caption.family },
  moneyCurrencyValue: { fontSize: 12.5, fontFamily: typo.label.family },
  moneyConverted: { flex: 1, textAlign: "right", fontSize: 12, fontFamily: typo.data.family },
  shoppingCost: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  shoppingCostCopy: { flex: 1, minWidth: 0 },
  shoppingCostTitle: { fontSize: 13, fontFamily: typo.title.family },
  shoppingCostHint: { fontSize: 11, marginTop: 2, fontFamily: typo.caption.family },
  shoppingCostInput: { width: 92, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlign: "right", fontFamily: typo.data.family },
  shoppingCostButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  shoppingCostButtonText: { color: "#FFFFFF", fontSize: 13, fontFamily: typo.label.family },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  receiptThumb: { width: 62, height: 62, borderRadius: 10, overflow: "hidden" },
  receiptEmpty: { borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  receiptEmptyText: { fontSize: 11, fontFamily: typo.caption.family },
  receiptActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  receiptButton: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  receiptButtonText: { fontSize: 12, fontFamily: typo.label.family },
  receiptRemove: { fontSize: 12, fontFamily: typo.label.family },
  moneyBudgetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
  moneyBudgetLabel: { fontSize: 11, fontFamily: typo.label.family },
  moneyBudgetAction: { fontSize: 11, fontFamily: typo.label.family },
  moneyBudgetTrack: { height: 7, borderRadius: 4, overflow: "hidden", marginTop: 7 },
  moneyBudgetFill: { height: 7, borderRadius: 4 },
  moneyBudgetFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  moneyBudgetStatus: { fontSize: 11, fontFamily: typo.caption.family },
  moneyBudgetPercent: { fontSize: 11, fontFamily: typo.data.family },
  tripPeopleLine: { marginTop: 2 },
  moneyPaidTable: { marginTop: 16 },
  moneyPaidHead: { flexDirection: "row", alignItems: "center", paddingBottom: 6 },
  moneyPaidHeadName: { flex: 1, fontSize: 12, fontFamily: typo.caption.family },
  moneyPaidHeadCell: { width: 104, textAlign: "right", fontSize: 12, fontFamily: typo.caption.family },
  moneyPaidRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingVertical: 9 },
  moneyPaidNameBox: { flex: 1, paddingRight: 8 },
  moneyPaidName: { fontSize: 14, fontFamily: typo.label.family },
  moneyPaidGuest: { fontSize: 12, marginTop: 1, fontFamily: typo.caption.family },
  moneyPaidCell: { width: 104, textAlign: "right", fontSize: 14, fontFamily: typo.data.family },
  moneySettleBlock: { marginTop: 16, gap: 6 },
  moneySettleLabel: { fontSize: 12, fontFamily: typo.caption.family },
  moneySettle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  moneySettleText: { flex: 1, fontSize: 14, fontFamily: typo.label.family },
  moneySettleAmount: { fontSize: 20, fontFamily: typo.data.family },
  moneyInsightCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8 },
  moneyInsightHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 },
  moneyInsightEyebrow: { fontSize: 11, fontFamily: typo.label.family, marginBottom: 3 },
  moneyInsightTitle: { fontSize: 16, fontFamily: typo.title.family },
  moneyInsightCount: { fontSize: 11, fontFamily: typo.caption.family },
  moneyInsightGrid: { flexDirection: "row" },
  moneyInsightItem: { flex: 1, minWidth: 0, paddingRight: 8 },
  moneyInsightDivider: { borderLeftWidth: 1, paddingLeft: 10, paddingRight: 4 },
  moneyInsightLabel: { fontSize: 11, fontFamily: typo.caption.family },
  moneyInsightValue: { fontSize: 15, marginTop: 4, fontFamily: typo.data.family },
  moneyInsightMeta: { fontSize: 12, marginTop: 1, fontFamily: typo.caption.family },
  moneyCategoryCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 8 },
  moneyCategoryRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 6, borderRadius: 8 },
  moneyCategoryName: { width: 44, fontSize: 12, fontFamily: typo.label.family },
  moneyBarTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  moneyBarFill: { height: 6, borderRadius: 3 },
  moneyCategoryAmount: { minWidth: 58, textAlign: "right", fontSize: 12, fontFamily: typo.data.family },
  moneyCategoryPercent: { minWidth: 30, textAlign: "right", fontSize: 11, fontFamily: typo.caption.family },
  moneyCategoryHint: { fontSize: 12, fontFamily: typo.caption.family, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 7 },
  moneyDayRow: { gap: 6, paddingVertical: 2, paddingRight: 4 },
  moneyDayChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 40, justifyContent: "center" },
  moneyDayChipText: { fontSize: 12, fontFamily: typo.label.family },
  moneyList: { gap: 14, marginTop: 8 },
  moneyGroup: { gap: 6 },
  moneyGroupHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 2 },
  moneyGroupDay: { fontSize: 13, fontFamily: typo.title.family },
  moneyGroupTotal: { fontSize: 12, fontFamily: typo.data.family },
  moneyRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  moneyRowBody: { flex: 1, minWidth: 0 },
  moneyRowTitle: { fontSize: 14, fontFamily: typo.title.family },
  moneyRowMeta: { fontSize: 11, marginTop: 2, fontFamily: typo.caption.family },
  moneyRowAmount: { fontSize: 14, fontFamily: typo.data.family },
  moneyExport: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 },
  moneyExportTitle: { fontSize: 13, fontFamily: typo.title.family },
  moneyExportHint: { fontSize: 11, marginTop: 2, fontFamily: typo.caption.family },
  fullScheduleList: { maxHeight: 520 },
  scheduleDayGroup: {
    marginBottom: 18,
    borderRadius: 16,
    overflow: "hidden",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  scheduleDayHead: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  scheduleDayHeadCopy: { gap: 2 },
  scheduleDayLabel: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.5 },
  scheduleDayTitle: { fontSize: 16, fontFamily: typo.title.family },
  scheduleDayCountBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  scheduleDayCount: { fontSize: 11, fontFamily: typo.label.family },
  scheduleDayItem: { marginHorizontal: 12, paddingTop: 14, paddingBottom: 6 },
  scheduleDayItemGap: { marginTop: 8 },
  planPlaceSummary: {
    borderRadius: 20,
    backgroundColor: "#E9E5FF",
    padding: 16,
    marginBottom: 20,
  },
  planPlaceName: { color: "#17233D", fontSize: 18, fontFamily: typo.title.family },
  planPlaceMeta: {
    color: "#7167A7",
    fontSize: 11,
    fontFamily: typo.caption.family,
    marginTop: 4,
  },
  packingManageHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  packingManageTitle: { fontSize: 18, fontFamily: typo.title.family },
  packingManageHint: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  packingShowAll: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  packingShowAllText: { fontSize: 12, fontFamily: typo.label.family },
  ownerStatSlot: { flex: 1, flexDirection: "row", alignItems: "center" },
  ownerStat: { flex: 1, alignItems: "center" },
  ownerStatActive: { borderRadius: 8, paddingVertical: 8 },
  ownerStatName: { color: "#17233D", fontSize: 14, fontFamily: typo.title.family },
  ownerStatCount: {
    color: "#89909C",
    fontSize: 14,
    fontFamily: typo.data.family,
    marginTop: 4,
  },
  unassignedText: { color: "#D25A50" },
  ownerDivider: { width: 1, height: 26, backgroundColor: "#ECEAE5" },
  packingFilterBoard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 20,
  },
  packingFilterLine: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
  },
  packingFilterLabel: { width: 38, fontSize: 12, fontFamily: typo.label.family },
  packingFilterScroll: { flex: 1 },
  packingFilterRule: { height: StyleSheet.hairlineWidth },
  packingFilterChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  packingFilterChipText: { fontSize: 12, fontFamily: typo.label.family },
  packingFilterMore: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  packingFilterMoreText: { fontSize: 14, fontFamily: typo.label.family },
  packingFilters: { flexDirection: "row", gap: 6 },
  packingList: { gap: 8 },
  packingOwnerSection: {
    gap: 6,
    marginBottom: 2,
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  packingOwnerHead: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34,
  },
  packingOwnerAvatar: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  packingOwnerAvatarText: { fontSize: 12, fontFamily: typo.label.family },
  packingOwnerCopy: { flex: 1 },
  packingOwnerName: { fontSize: 16, fontFamily: typo.title.family },
  packingOwnerProgress: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  packingCollapseIcon: {
    fontSize: 16,
    fontFamily: typo.label.family,
    paddingHorizontal: 4,
  },
  packingTagGroup: { gap: 4, marginTop: 2 },
  packingTagHead: { flexDirection: "row", alignItems: "center", minHeight: 18 },
  packingTagHeadText: { fontSize: 12, fontFamily: typo.label.family },
  packingTagLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
  },
  packingTagCount: { fontSize: 14, fontFamily: typo.data.family },
  packingCardDone: { backgroundColor: "#F1F0EC", opacity: 0.76 },
  packingCardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  completionMark: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    marginRight: 12,
  },
  inlineMore: { flexDirection: "row", alignItems: "center", gap: 3 },
  completionTick: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.label.family },
  packingBody: { flex: 1 },
  packingTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  packingMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  packingTiming: { fontSize: 12, fontFamily: typo.label.family },
  packingOwnerChange: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  packingOwnerChangeText: { fontSize: 12, fontFamily: typo.label.family },
  packingV2Hidden: { display: "none" },
  packingJourney: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 16,
    marginTop: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  packingJourneyStamp: {
    width: 49,
    height: 54,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    transform: [{ rotate: "-3deg" }],
  },
  packingSuitcaseHandle: {
    width: 18,
    height: 7,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    marginBottom: -1,
  },
  packingSuitcaseBody: {
    width: 31,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
    flexDirection: "row",
    justifyContent: "center",
  },
  packingSuitcaseStrap: {
    width: 4,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  packingSuitcaseSticker: {
    position: "absolute",
    right: 4,
    top: 5,
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  packingSuitcaseStickerText: { fontSize: 12, fontFamily: typo.label.family },
  packingSuitcaseFeet: {
    width: 24,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  packingSuitcaseFoot: { width: 4, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  packingJourneyBody: { flex: 1 },
  packingJourneyCopy: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  packingJourneyEyebrow: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: typo.label.family,
    letterSpacing: 0.5,
  },
  packingJourneyTitle: { fontSize: 14, lineHeight: 20, fontFamily: typo.title.family, marginTop: 2 },
  packingJourneyPercent: { width: 34, fontSize: 12, lineHeight: 16, fontFamily: typo.label.family, textAlign: "right" },
  packingJourneyTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    position: "relative",
    marginHorizontal: 6,
  },
  packingJourneyProgressRow: { flexDirection: "row", alignItems: "center" },
  packingJourneyFill: { height: 6, borderRadius: 999 },
  packingV2Controls: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 12,
    padding: 8,
    gap: 8,
  },
  packingV2StatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  packingV2StatusTabs: { flexDirection: "row", alignItems: "center", gap: 2 },
  packingV2StatusChip: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: "center",
  },
  packingV2TagButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  packingV2TagButtonText: { fontSize: 14, fontFamily: typo.label.family },
  packingV2TagChevron: { fontSize: 12, fontFamily: typo.label.family, marginTop: -2 },
  packingV2Owners: { flexDirection: "row", gap: 6, paddingRight: 16 },
  packingV2TagChoice: {
    minHeight: 40,
    borderRadius: 9,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
  },
  packingV2TagChoiceLabel: { width: 42, fontSize: 11, fontFamily: typo.caption.family },
  packingV2TagChoiceValue: { flex: 1, fontSize: 12, fontFamily: typo.label.family },
  packingV2OwnerChip: {
    minWidth: 57,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  packingV2OwnerName: { fontSize: 14, fontFamily: typo.title.family },
  packingV2OwnerCount: { fontSize: 14, fontFamily: typo.data.family },
  packingV2Group: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  packingV2GroupHead: {
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packingV2GroupHeadPressed: { opacity: 0.72 },
  packingV2GroupTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  packingV2GroupSticker: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    transform: [{ rotate: "-2deg" }],
  },
  packingV2GroupStickerText: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: typo.label.family,
    letterSpacing: 0.5,
  },
  packingV2GroupActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  packingV2GroupToggle: {
    width: 17,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 19,
    fontFamily: typo.label.family,
  },
  packingV2GroupTitle: { fontSize: 14, fontFamily: typo.title.family },
  packingV2GroupProgress: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  packingV2GroupCount: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  packingV2GroupCountText: { fontSize: 14, fontFamily: typo.data.family },
  packingV2Row: {
    minHeight: 49,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  packingV2RowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  packingV2Check: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  packingV2Body: { flex: 1, minWidth: 0 },
  packingV2TitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  packingV2Name: { flexShrink: 1, fontSize: 14 },
  packingV2Quantity: { fontSize: 14, fontFamily: typo.data.family },
  packingV2SubTags: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  packingV2Assignee: {
    minWidth: 38,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
    marginLeft: 8,
  },
  packingV2Completed: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  packingV2CompletedHead: {
    minHeight: 48,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packingV2CompletedTitle: { fontSize: 14, fontFamily: typo.title.family },
  packingV2CompletedToggle: { fontSize: 12, fontFamily: typo.label.family },
  packingListTools: {
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  packingListToolsCopy: { flex: 1 },
  packingListToolsTitle: { fontSize: 14, fontFamily: typo.title.family },
  packingListToolsHint: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  packingToolButton: {
    minWidth: 48,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  packingToolButtonText: { fontSize: 14, fontFamily: typo.label.family },
  tagPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  tagPickerItem: {
    width: "48.7%",
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagPickerName: { fontSize: 14, fontFamily: typo.title.family, flex: 1 },
  tagPickerCount: { fontSize: 14, fontFamily: typo.data.family },
  assignmentOptions: { gap: 8, paddingBottom: 8 },
  assignmentOption: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  assignmentAvatar: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  assignmentAvatarText: { fontSize: 12, fontFamily: typo.label.family },
  assignmentCopy: { flex: 1 },
  assignmentName: { fontSize: 14, fontFamily: typo.title.family },
  assignmentDescription: { fontSize: 14, fontFamily: typo.body.family, marginTop: 2 },
  assignmentRadio: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  assignmentRadioDot: { width: 10, height: 10, borderRadius: 999 },
  packingAssigneeOptions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  packingAssigneeOption: {
    minWidth: "22%",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  packingAssigneeOptionText: { fontSize: 12, fontFamily: typo.label.family },
  cookingImportCallout: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E3DD",
    backgroundColor: "#F6F2ED",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cookingImportCopy: { flex: 1, paddingRight: 8 },
  cookingImportTitle: { color: "#35333A", fontSize: 14, fontFamily: typo.title.family },
  cookingImportText: { color: "#8C8580", fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  cookingImportGroup: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E3DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  cookingImportGroupHead: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cookingImportGroupTitle: { color: "#35333A", fontSize: 14, fontFamily: typo.title.family },
  cookingImportGroupCount: { color: "#8C8580", fontSize: 14, fontFamily: typo.data.family },
  cookingImportRow: {
    minHeight: 45,
    borderTopWidth: 1,
    borderTopColor: "#EEEAE5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  cookingImportCheck: {
    width: 21,
    height: 21,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#D7D4CE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  cookingImportCheckText: { color: "#FFFFFF", fontSize: 12, fontFamily: typo.label.family },
  cookingImportItemCopy: { flex: 1 },
  cookingImportItemName: { color: "#35333A", fontSize: 14, fontFamily: typo.title.family },
  cookingImportItemMeta: { color: "#8C8580", fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  packingQuantity: { color: "#858D99", fontSize: 14, fontFamily: typo.data.family },
  settingHint: {
    color: "#646C7A",
    fontSize: 13,
    lineHeight: 19,
    marginTop: -6,
    marginBottom: 16,
  },
  cookV2Hero: { borderWidth: 1, overflow: "hidden" },
  cookV2ProgressBadge: {
    width: 64,
    minHeight: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  cookV2ProgressBadgeValue: { fontSize: 18, lineHeight: 22, fontFamily: typo.data.family },
  cookV2ProgressBadgeLabel: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  recipeSelector: { marginBottom: 12 },
  recipeSelectorHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  recipeSelectorTitle: { color: "#777F8C", fontSize: 14, fontFamily: typo.title.family },
  recipeSelectorActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  recipeSelectorMore: { color: "#D9685F", fontSize: 14, fontFamily: typo.label.family },
  cookV2MenuList: { gap: 8, paddingRight: 12 },
  cookV2MenuCard: {
    width: 124,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cookV2MenuTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cookV2MenuNumber: { fontSize: 14, fontFamily: typo.data.family, letterSpacing: 0.5 },
  cookV2MenuCount: { fontSize: 14, fontFamily: typo.data.family },
  cookV2MenuName: { fontSize: 14, fontFamily: typo.title.family },
  cookV2MenuNote: { fontSize: 14, fontFamily: typo.body.family, marginTop: 4 },
  recipeList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  recipeListRow: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  recipeListRowBorder: { borderTopWidth: 1, borderTopColor: "#EEEAE5" },
  recipeListNumber: {
    width: 27,
    height: 27,
    borderRadius: 8,
    backgroundColor: "#F6F2ED",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  recipeListNumberText: { color: "#8C8580", fontSize: 14, fontFamily: typo.data.family },
  recipeListCopy: { flex: 1, minWidth: 0 },
  recipeListName: { color: "#35333A", fontSize: 14, fontFamily: typo.title.family },
  recipeListNote: { color: "#8C8580", fontSize: 14, fontFamily: typo.body.family, marginTop: 2 },
  recipeListCount: { color: "#8C8580", fontSize: 14, fontFamily: typo.data.family, marginLeft: 8 },
  recipeListArrow: { color: "#8C8580", fontSize: 18, fontFamily: typo.label.family, marginLeft: 6 },
  myCookingBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  myCookingTitle: { color: "#35333A", fontSize: 14, fontFamily: typo.title.family },
  myCookingSummary: { color: "#8C8580", fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  myCookingCompact: { flexDirection: "row", alignItems: "center" },
  myCookingIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "#F0EDFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  cookV2MemoLine: {
    height: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cookV2MemoDot: { width: 3, height: 3, borderRadius: 2 },
  cookV2MemoRule: { width: 15, height: 1.5, borderRadius: 2, opacity: 0.5 },
  cookV2MemoRuleShort: { width: 10 },
  cookV2MyEyebrow: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.5, marginBottom: 2 },
  myCookingCopy: { flex: 1, minWidth: 0 },
  myIngredientGroup: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  myIngredientGroupHead: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myIngredientGroupTitle: { color: "#35333A", fontSize: 14, fontFamily: typo.title.family },
  myIngredientGroupCount: { color: "#D9685F", fontSize: 14, fontFamily: typo.data.family },
  myIngredientRow: {
    minHeight: 38,
    borderTopWidth: 1,
    borderTopColor: "#EEEAE5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myIngredientName: { color: "#35333A", fontSize: 14, fontFamily: typo.title.family },
  myIngredientQuantity: { color: "#8C8580", fontSize: 14, fontFamily: typo.data.family },
  aiRecipeCallout: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#F6F2ED",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  aiRecipeCopy: { flex: 1, paddingRight: 8 },
  aiRecipeTitle: { color: "#35333A", fontSize: 14, fontFamily: typo.title.family },
  aiRecipeText: { color: "#8C8580", fontSize: 12, fontFamily: typo.label.family, lineHeight: 15, marginTop: 2 },
  aiRecipeButton: {
    borderRadius: 8,
    backgroundColor: "#F0EDFF",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  aiRecipeButtonText: { color: "#6556D8", fontSize: 14, fontFamily: typo.label.family },
  aiPromptBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#F6F2ED",
    padding: 12,
    marginBottom: 16,
  },
  aiPromptHead: { flexDirection: "row", alignItems: "center" },
  aiPromptCopyButton: {
    borderRadius: 8,
    backgroundColor: "#17233D",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiPromptCopyOnly: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 4 },
  aiPromptCopyText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.body.family },
  aiPromptPreview: {
    color: "#777F8C",
    fontSize: 11,
    fontFamily: typo.caption.family,
    lineHeight: 13,
    marginTop: 8,
  },
  aiPasteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cookingNote: { color: "#9B7555", fontSize: 14, marginTop: 4 },
  recipeLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
  },
  recipeLinkText: { color: "#D9685F", fontSize: 14, fontFamily: typo.label.family },
  emptyCooking: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ECE7E1",
  },
  emptyCookingTitle: { color: "#4B4745", fontSize: 18, fontFamily: typo.title.family },
  emptyCookingText: { color: "#99928D", fontSize: 12, marginTop: 6 },
  emptyCookingAction: {
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  emptyCookingActionText: { fontSize: 14, fontFamily: typo.label.family },
  cookingEyebrow: {
    color: "#A16E35",
    fontSize: 12,
    fontFamily: typo.label.family,
    marginBottom: 4,
  },
  cookingHeroCopy: { flex: 1, paddingRight: 12 },
  cookingHeroActions: { alignItems: "center", gap: 6 },
  cookingMoreButton: {
    width: 30,
    height: 24,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cookingTitle: {
    color: "#5C4030",
    fontSize: 24,
    fontFamily: typo.title.family,
    letterSpacing: -0.5,
  },
  cookingToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cookingTip: { color: "#77706A", fontSize: 12 },
  cookingSectionTitle: {
    color: "#A16E35",
    fontSize: 14,
    fontFamily: typo.title.family,
    marginBottom: 6,
  },
  cookV2SectionHead: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cookV2SectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cookV2SectionTitle: { marginBottom: 0 },
  cookV2SectionLabel: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 4 },
  cookV2SectionLabelText: { fontSize: 12, fontFamily: typo.label.family },
  cookV2SectionActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  cookV2SectionCount: { fontSize: 14, fontFamily: typo.data.family },
  cookV2SectionToggle: { width: 16, fontSize: 14, fontFamily: typo.label.family, textAlign: "center" },
  ingredientRow: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F2EEE9",
  },
  cookV2IngredientDone: { opacity: 0.68 },
  cookV2IngredientCheck: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  cookV2IngredientTick: { color: "#FFFFFF", fontSize: 12, fontFamily: typo.label.family },
  cookV2IngredientNameDone: { textDecorationLine: "line-through" },
  ingredientBody: { flex: 1 },
  ingredientName: { color: "#383534", fontSize: 14, fontFamily: typo.title.family },
  ingredientOwner: { color: "#96908A", fontSize: 12, marginTop: 2 },
  ingredientQuantity: { color: "#765D49", fontSize: 14, fontFamily: typo.data.family },
  emptyState: { minHeight: 76, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center" },
  emptyStateMark: { width: 34, height: 38, borderRadius: 8, paddingHorizontal: 6, justifyContent: "center", gap: 4, marginRight: 8, transform: [{ rotate: "-2deg" }] },
  emptyStateLine: { height: 2, borderRadius: 2, opacity: 0.55 },
  emptyStateLineShort: { width: "65%" },
  emptyStateCopy: { flex: 1, minWidth: 0 },
  emptyStateTitle: { fontSize: 18, fontFamily: typo.title.family },
  emptyStateDescription: { fontSize: 14, lineHeight: 20, fontFamily: typo.body.family, marginTop: 2 },
  emptyStateAction: { minHeight: 44, borderRadius: 8, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  emptyStateActionText: { fontSize: 14, fontFamily: typo.label.family },
  listMoreButton: { minHeight: 39, borderWidth: 1, borderRadius: 8, marginTop: 8, marginBottom: 4, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  listMoreText: { fontSize: 14, fontFamily: typo.label.family },
  listMoreChevron: { fontSize: 14, fontFamily: typo.label.family, marginLeft: 6 },
  longPressHint: {
    color: "#646C7A",
    fontSize: 13,
    textAlign: "center",
    marginTop: 2,
    marginBottom: 20,
  },
  safe: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    backgroundColor: "#F7F5F0",
    shadowColor: "#17233D",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  header: {
    height: 57,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E7E4DD",
  },
  close: { color: "#17233D", fontSize: 34, lineHeight: 36, fontWeight: "300" },
  headerName: {
    color: "#17233D",
    fontSize: 16,
    letterSpacing: 1,
    fontFamily: typo.title.family,
  },
  modeText: { color: "#7C8492", fontSize: 14, fontFamily: typo.label.family },
  modeTextCurrent: { color: "#FFFFFF" },
  sectionAction: { color: "#6556D8", fontSize: 14, fontFamily: typo.label.family },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#19B6A3",
    marginTop: 2,
  },
  readyEyebrow: {
    color: "#6AD6C8",
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: typo.label.family,
  },
  page: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 88 },
  date: { fontSize: 11, fontFamily: typo.caption.family, letterSpacing: 0, marginBottom: 6 },
  title: { fontSize: 28, fontFamily: typo.title.family, letterSpacing: -0.5 },
  subtitle: { fontSize: 11, marginTop: 6 },
  modeSwitch: {
    flexDirection: "row",
    marginTop: 18,
    marginBottom: 12,
    padding: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DEDCD5",
  },
  mode: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  modeCurrent: {
    borderRadius: 9,
    borderWidth: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
  sectionActionRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sectionLabel: {
    minHeight: 42,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  tabActionHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 8,
  },
  tabActionTitleRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  tabActionTitle: { fontSize: 18, lineHeight: 23, fontFamily: typo.title.family, letterSpacing: -0.5 },
  tabActionCount: {
    fontSize: 12,
    fontFamily: typo.data.family,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  tabActionButton: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActionButtonText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.label.family },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontFamily: typo.title.family, letterSpacing: -0.5 },
  timelineCard: { borderRadius: 12, padding: 12, borderWidth: 1 },
  fullScheduleButton: {
    height: 43,
    borderRadius: 8,
    marginTop: 6,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  readyNudge: {
    minHeight: 67,
    borderRadius: 8,
    marginTop: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  placeControlPanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    marginBottom: 12,
  },
  // 옆의 가로 스크롤이 자리를 다 가져가지 않도록 줄어들지 않게 둔다.
  placeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 6,
  },
  placeFilters: { flex: 1, flexDirection: "row", gap: 4 },
  placeFilter: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  placeFilterMoreButton: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  placeFilterMoreText: { fontSize: 12, fontFamily: typo.label.family },
  placeAdd: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  placeSearch: {
    height: 39,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  tagFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tagFilterChip: {
    height: 30,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  placeTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 4 },
  ownerStats: {
    minHeight: 61,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  packingCard: {
    minHeight: 58,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  cookingHero: {
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cookingSection: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  memorySummaryLine: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginTop: -4,
    marginBottom: 4,
  },
  memorySummaryText: { fontSize: 11, fontFamily: typo.label.family },
  photoPickerPreview: {
    height: 176,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  photoPickerMark: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  photoPickerMarkText: { fontSize: 12, fontFamily: typo.label.family },
  memoryTile: {
    width: "31.4%",
    aspectRatio: 1,
    borderRadius: 8,
    padding: 8,
    justifyContent: "flex-end",
    transform: [{ rotate: "-.5deg" }],
  },
  detailFieldInput: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  optionChip: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: "91%",
  },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  placeMiniCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    overflow: "hidden",
    position: "relative",
  },
  placeMiniTape: { position: "absolute", width: 38, height: 8, top: -4, left: 18, borderRadius: 2, transform: [{ rotate: "-3deg" }] },
  placeMiniTop: { flexDirection: "row", alignItems: "center" },
  placeMiniStamp: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-2deg" }] },
  placeMiniNumber: { fontSize: 14, fontFamily: typo.data.family },
  placeMiniInfo: { flex: 1, minWidth: 0 },
  placeMiniTitleRow: { flexDirection: "row", alignItems: "center" },
  placeMiniName: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: typo.title.family },
  placeMiniStatus: { height: 21, borderRadius: 8, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", marginLeft: 6 },
  placeMiniStatusText: { fontSize: 12, fontFamily: typo.label.family },
  placeMiniMeta: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  placeMiniTags: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  placeMiniTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 4 },
  placeMiniTagText: { fontSize: 12, fontFamily: typo.label.family },
  placeMiniMore: { fontSize: 14, fontFamily: typo.label.family, marginLeft: 2 },
  placeMiniActions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  placeMiniIconButton: { minWidth: 47, height: 36, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  placeMiniEditText: { fontSize: 12, fontFamily: typo.label.family },
  placeMiniMapButton: { minWidth: 63, height: 36, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  placeMiniMapText: { fontSize: 12, fontFamily: typo.label.family },
  placeMiniPlanButton: { flex: 1, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  placeMiniPlanText: { color: "#FFFFFF", fontSize: 12, fontFamily: typo.label.family },
});
