/**
 * 앱이 처음부터 들고 있는 예시 여행.
 *
 * 화면 모양을 보여 주기만 하는 가짜 데이터다. **사용자가 만든 여행에는 절대 붙지
 * 않는다** — 내가 적지 않은 일정·준비물·지출이 들어 있으면 그건 내 여행이 아니다.
 * 여행 목록을 아직 못 받았을 때 홈이 기댈 자리로만 남겨 둔다(`WarmAppShell` 의
 * `trips[0]`). 기기에 적어 두지도 않는다(`initialTripsByGroup` 은 비어 있다).
 *
 * 예전에는 상세 화면이 열릴 때 이 값들을 채웠다. 그러면 화면 밖에서는 이 여행에
 * 무엇이 들어 있는지 알 수 없어서, 홈 카드는 개수를 못 세고 찾기는 아무것도
 * 못 찾았다. 여행에 미리 붙여 두면 모든 화면이 같은 것을 본다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import {
  buildTripDates,
  dateKey,
  dateLabel,
  dateRangeLabel,
  dayLabel,
  dayLabelOf,
  matchTripDay,
  shiftDateKey,
  weekdayOf,
} from "./dates.ts";
import {
  initialMemoryData,
  normalizePackingOwner,
  기본_체크인_시각,
  type PackingItem,
  type PlaceItem,
  type Recipe,
  type ReservationInfo,
  type ScheduleItem,
  type Trip,
  type TripPlanningData,
} from "./tripPlanning.ts";
import type { Expense } from "./tripExpenses.ts";

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
      time: `${weekdayOf(dayOptions[0])} · ${기본_체크인_시각}`,
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
      checkin: `${first} ${기본_체크인_시각}`,
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
      const seed = initialMemoryData(`${first} — ${last}`, true);
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

/** 오늘에서 며칠 앞뒤의 날짜 키. 예시 여행의 날짜를 오늘 기준으로 만든다. */
const sampleDate = (daysFromToday: number) => shiftDateKey(dateKey(new Date()), daysFromToday);

/**
 * 여행 며칠째의 날짜 이름. 상세 화면의 날짜 선택지와 같은 "22일(토)" 형식이다.
 *
 * 예시 여행의 날짜는 오늘을 기준으로 만들어지므로 지출의 날짜도 같은 규칙으로
 * 계산해야 한다. 글자로 박아 두면 날이 지날수록 어긋난다.
 */
const sampleTripDay = (startKey: string, offset: number) => dayLabelOf(shiftDateKey(startKey, offset));

/** 예시 지출 한 건. 여행마다 다른 목록을 만들려고 짧게 쓴다. */
const sampleExpense = (
  id: string,
  startKey: string,
  offset: number,
  title: string,
  amount: number,
  category: Expense["category"],
  payer: string,
  /** 몫을 지는 사람과 비중. 없으면 참가자 전원이 똑같이 나눈다. */
  shares?: Record<string, number>,
  memo = "",
): Expense => ({
  id,
  day: sampleTripDay(startKey, offset),
  title,
  amount,
  category,
  payer,
  shares,
  memo,
});

const upcomingSampleStart = sampleDate(12);
const upcomingSampleEnd = sampleDate(14);
const recentSampleStart = sampleDate(-23);
const recentSampleEnd = sampleDate(-22);
const archiveSampleStart = sampleDate(-45);
const archiveSampleEnd = sampleDate(-43);

/**
 * 예시 여행 하나를 만든다.
 *
 * 일정·장소·준비물 같은 처음 내용을 여행에 바로 붙인다. 상세 화면이 열릴 때
 * 채우면 홈 카드도 찾기도 이 여행에 무엇이 들어 있는지 알 수 없다.
 * 지출은 여행마다 달라서 부르는 쪽에서 넘긴다.
 */
const sampleTrip = (trip: Omit<Trip, "sample" | "planning"> & { expenses: Expense[] }): Trip => {
  const { expenses, ...rest } = trip;
  return {
    ...rest,
    sample: true,
    planning: { ...sampleTripPlanning(rest.name, rest.start, rest.end, ["하늘", "여울"]), expenses },
  };
};

export const sampleTrips: Trip[] = [
  sampleTrip({
    name: "전주 한옥마을",
    date: dateRangeLabel(upcomingSampleStart, upcomingSampleEnd),
    note: "숙소에서 수다와 버섯전골",
    tone: 0,
    mark: upcomingSampleStart.slice(5, 7),
    region: "전북",
    start: upcomingSampleStart,
    end: upcomingSampleEnd,
    // 아직 안 떠난 여행이라 미리 낸 것만 있다.
    expenses: [
      sampleExpense("jj-1", upcomingSampleStart, 0, "KTX 왕복 예매", 47200, "교통", "하늘", { 하늘: 1 }),
      sampleExpense("jj-2", upcomingSampleStart, 0, "달빛한옥 예약금", 90000, "숙박", "하늘"),
    ],
  }),
  sampleTrip({
    name: "강릉 안목",
    date: dateRangeLabel(recentSampleStart, recentSampleEnd),
    note: "보드게임과 야식 장보기",
    tone: 5,
    mark: recentSampleStart.slice(5, 7),
    region: "강원",
    start: recentSampleStart,
    end: recentSampleEnd,
    expenses: [
      sampleExpense("gn-1", recentSampleStart, 0, "시외버스 왕복", 28000, "교통", "여울", { 여울: 1 }),
      sampleExpense("gn-2", recentSampleStart, 0, "안목 카페 거리", 39000, "식비", "하늘"),
      sampleExpense("gn-3", recentSampleStart, 0, "바다뷰 숙소 1박", 120000, "숙박", "여울"),
      sampleExpense("gn-4", recentSampleStart, 1, "보드게임 카페", 24000, "기타", "하늘"),
      sampleExpense("gn-5", recentSampleStart, 1, "야식 장보기", 31800, "식비", "여울", undefined, "치킨과 맥주"),
    ],
  }),
  sampleTrip({
    name: "여수",
    date: dateRangeLabel(archiveSampleStart, archiveSampleEnd),
    note: "바다 산책과 단체 사진",
    tone: 3,
    mark: archiveSampleStart.slice(5, 7),
    region: "전남",
    start: archiveSampleStart,
    end: archiveSampleEnd,
    expenses: [
      sampleExpense("ys-1", archiveSampleStart, 0, "KTX 왕복", 96000, "교통", "하늘"),
      sampleExpense("ys-2", archiveSampleStart, 0, "회 정식 저녁", 58000, "식비", "여울"),
      sampleExpense("ys-3", archiveSampleStart, 0, "게스트하우스 2박", 90000, "숙박", "하늘"),
      sampleExpense("ys-4", archiveSampleStart, 1, "해상 케이블카", 30000, "입장료", "여울"),
      sampleExpense("ys-5", archiveSampleStart, 1, "택시", 12000, "교통", "하늘"),
      sampleExpense("ys-6", archiveSampleStart, 2, "기념품 수제 엽서", 15000, "쇼핑", "여울", { 여울: 1 }),
    ],
  }),
];
