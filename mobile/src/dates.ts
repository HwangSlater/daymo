/**
 * 날짜 키와 날짜 이름표를 만들고 읽는 한 자리.
 *
 * 앱은 날짜를 두 가지 모양으로 들고 다닌다. 서버와 오가는 것은 `2026-09-23` 같은
 * 날짜 키고, 화면에 그리는 것은 `23일(수)`·`9월 23일` 같은 이름표다. 이름표를 만드는
 * 셈이 화면 파일과 목록 모듈에 여섯 벌쯤 흩어져 있어서, 같은 날이 자리마다 다른
 * 글자가 될 수 있었다. 여기 하나만 둔다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 한 자리 숫자를 `09` 처럼 두 자리로. 날짜 키와 시각에 함께 쓴다. */
export const 두자리 = (값: number) => String(값).padStart(2, "0");

/** 로컬 날짜 키(YYYY-MM-DD). 기기 시간대 기준이다. */
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${두자리(date.getMonth() + 1)}-${두자리(date.getDate())}`;

/** 연·월·일 숫자로 날짜 키를 만든다. 달은 1 부터 센다. */
export const dayKeyOf = (year: number, month: number, day: number) =>
  `${year}-${두자리(month)}-${두자리(day)}`;

/** 오늘의 날짜 키. 시험에서 오늘을 갈아 끼울 수 있게 받는다. */
export const todayKey = (now: Date = new Date()) => dateKey(now);

/**
 * 날짜 키를 정오 기준으로 읽는다.
 *
 * 자정으로 읽으면 서머타임이 있는 지역에서 하루가 앞뒤로 밀린다. 한국은 안 쓰지만
 * 기기 시간대는 여행지를 따라갈 수 있다.
 */
const 키에서 = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

/** 날짜 키를 며칠 앞뒤로 옮긴다. */
export const shiftDateKey = (key: string, days: number) => {
  const date = 키에서(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};

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

/** 일정 탭의 날짜 이름표. `2일(금)` */
export const dayLabelOf = (key: string) => dayLabel(키에서(key));

/** 숙소 체크인·체크아웃의 날짜 이름표. `10월 1일` */
export const dateLabelOf = (key: string) => dateLabel(키에서(key));

/** `Date` 로 만드는 일정 탭 이름표. 날짜 키가 있으면 `dayLabelOf` 를 쓴다. */
export const dayLabel = (date: Date) => `${date.getDate()}일(${WEEKDAYS[date.getDay()]})`;

/** `Date` 로 만드는 월·일 이름표. 날짜 키가 있으면 `dateLabelOf` 를 쓴다. */
export const dateLabel = (date: Date) => `${date.getMonth() + 1}월 ${date.getDate()}일`;

/** 날짜 키의 요일 한 글자. `2026-09-23` → `수` */
export const weekdayOfKey = (key: string) => WEEKDAYS[키에서(key).getDay()];

/** `24일(목)` 형태의 날짜 선택지에서 요일만 꺼낸다. */
export const weekdayOf = (dayOption: string) =>
  dayOption.match(/\(([^)]+)\)/)?.[1] ?? dayOption.slice(0, 1);

/** `24일(목)` 형태의 날짜 선택지에서 일 숫자만 꺼낸다. */
export const dayNumberOf = (dayOption: string) => dayOption.match(/(\d+)일/)?.[1] ?? dayOption;

/** 여행 카드에 적는 기간. 같은 달이면 달을 한 번만 적는다. `9월 12일 — 14일` */
export const dateRangeLabel = (start: string, end: string) => {
  const startMonth = Number(start.slice(5, 7));
  const startDay = Number(start.slice(8, 10));
  const endMonth = Number(end.slice(5, 7));
  const endDay = Number(end.slice(8, 10));
  return startMonth === endMonth
    ? `${startMonth}월 ${startDay}일 — ${endDay}일`
    : `${startMonth}월 ${startDay}일 — ${endMonth}월 ${endDay}일`;
};

/** 날짜 키를 자정 기준 `Date` 로. 읽을 수 없으면 `null`. */
export const parseTripDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** 여행 첫날부터 마지막 날까지의 `Date` 목록. 모양이 틀리면 빈 목록. */
export const buildTripDates = (start?: string, end?: string) => {
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

/**
 * 여행 날짜 가운데 오늘이 있으면 그 날의 이름표를 준다. 없으면 빈 문자열이다.
 *
 * 여행 중에 적는 지출은 거의 오늘 것이다. 늘 첫날로 시작하면 둘째 날부터는
 * 매번 날짜를 고쳐야 한다.
 */
export const todayAmong = (dates: Date[], now: Date = new Date()): string => {
  const match = dates.find(
    (date) =>
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate(),
  );
  return match ? dayLabel(match) : "";
};

/**
 * 마지막 날이 지났으면 지난 여행이다.
 *
 * 오늘이 마지막 날이면 아직 여행 중이다. 장소 탭이 다녀옴을 한 번에 표시할지
 * 물을 때만 쓴다.
 */
export const tripIsOver = (dates: Date[], now: Date = new Date()): boolean => {
  const last = dates[dates.length - 1];
  if (!last) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return last < today;
};

/** 달력에 실제로 있는 날짜 키인지. `2026-02-30` 같은 것을 거른다. */
export const validDateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseTripDate(value);
  return Boolean(date && dateKey(date) === value);
};

/** 여행 기간 한 줄. 읽을 수 없으면 고쳐 달라고 한다. */
export const formatTripPeriod = (start: string, end: string) => {
  const first = parseTripDate(start);
  const last = parseTripDate(end);
  if (!first || !last) return "기간을 확인해 주세요";
  return `${dateLabel(first)} — ${dateLabel(last)}`;
};

/**
 * 예전에 자유롭게 적어 둔 날짜를 이번 여행의 날짜 칸에 맞춘다.
 *
 * 기록 탭의 사진 날짜만 아무 글자나 받고 있었다. "1일차" 와 "8월 22일" 이
 * 섞이면 같은 날인데 다른 날로 세어 "N일의 기록" 이 엉뚱해진다.
 * 몇째 날로 적었으면 순서로, 날짜로 적었으면 일 숫자로 찾는다. 어느 쪽도
 * 아니면 적힌 그대로 둔다. 내가 적은 말을 앱이 말없이 버리면 안 된다.
 */
export const matchTripDay = (value: string, dayOptions: string[]) => {
  const text = value.trim();
  if (!text || dayOptions.includes(text)) return text;
  const nth = text.match(/^(\d+)\s*일차$/);
  if (nth) return dayOptions[Number(nth[1]) - 1] ?? text;
  const day = text.match(/(\d+)\s*일/);
  const found = day && dayOptions.find((option) => dayNumberOf(option) === day[1]);
  return found || text;
};

/**
 * 함께한 시작일부터 오늘까지의 일수.
 *
 * 시작한 날을 1일째로 센다. 한국어 "사귄 지 N일째"가 그렇게 읽히고, 그래야
 * 시작한 날 화면에 0이 뜨지 않는다. 두 날짜 모두 정오 기준으로 맞춰
 * 서머타임이나 시간대 차이로 하루가 어긋나지 않게 한다.
 *
 * 입력은 "2023. 10. 20"이나 "2023-10-20" 어느 쪽이든 받는다.
 * 날짜로 읽을 수 없으면 null을 준다.
 */
export const daysSince = (from: string, today: string): number | null => {
  const digits = from.match(/\d+/g);
  if (!digits || digits.length < 3) return null;
  const [year, month, day] = digits.map(Number);
  const start = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || start.getMonth() !== month - 1) return null;
  const now = new Date(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
    12, 0, 0, 0,
  );
  const days = Math.round((now.getTime() - start.getTime()) / 86400000) + 1;
  return days > 0 ? days : null;
};

/** 「09:30」을 자정부터의 분으로. 읽을 수 없으면 `null`. */
export function 시각을_분으로(value: string): number | null {
  const 맞음 = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!맞음) return null;
  const 시 = Number(맞음[1]);
  const 분 = Number(맞음[2]);
  return 시 <= 23 && 분 <= 59 ? 시 * 60 + 분 : null;
}
