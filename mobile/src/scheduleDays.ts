/**
 * 일정 화면의 날짜 고르개.
 *
 * 일정은 여행 날짜를 `2026-09-29` 같은 날짜 키로 들고 있다(보이는 글자는 그릴 때
 * `dates.dayTextOf` 가 만든다). 교통편·숙소·예약에서 만들어진 줄도 같은 칸을 쓰니,
 * 날짜로 거르면 셋이 함께 걸러진다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 날짜를 고르지 않은 상태. 모든 날이 다 보인다. */
export const ALL_DAYS = "전체";
/** 날짜가 비어 있는 줄이 모이는 칸. 화면의 묶음 이름과 같다. 날짜 키가 아니라 이름 그대로 쓴다. */
export const UNDATED_DAY = "날짜 미정";

/** 날짜 칸만 본다. 일정 줄이든 숙소 줄이든 같다. */
type DatedItem = { date?: string };

type ScheduleDayCount = { day: string; count: number };

const dayOf = (item: DatedItem) => item.date || UNDATED_DAY;

/**
 * 칩에 쓸 날짜와 개수.
 *
 * 여행의 모든 날이 나온다. 일정이 없는 날도 골라서 비었다는 것을 볼 수 있어야
 * 한다. 여행 기간을 줄이기 전에 넣어 둔 날짜는 기간 밖으로 남아 뒤에 붙고,
 * 날짜를 안 적은 줄은 맨 끝이다.
 */
export function scheduleDayCounts(
  items: readonly DatedItem[],
  dayOptions: readonly string[],
): ScheduleDayCount[] {
  const counts = new Map<string, number>();
  dayOptions.forEach((day) => counts.set(day, 0));
  items.forEach((item) => {
    const day = dayOf(item);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  });
  const rows = [...counts].map(([day, count]) => ({ day, count }));
  return [
    ...rows.filter((row) => row.day !== UNDATED_DAY),
    ...rows.filter((row) => row.day === UNDATED_DAY),
  ];
}

/** 고른 날의 일정만. `전체` 면 그대로 준다. */
export function scheduleOfDay<T extends DatedItem>(items: readonly T[], day: string): T[] {
  if (day === ALL_DAYS) return [...items];
  return items.filter((item) => dayOf(item) === day);
}

/**
 * 날짜별 묶음. 날짜순으로 정렬한 일정을 받는다.
 *
 * 이어진 것만 묶는다. 정렬이 흐트러져 같은 날이 떨어져 있으면 묶음도 떨어져,
 * 화면이 실제 차례를 그대로 보여 준다.
 */
export function groupScheduleByDay<T extends DatedItem>(
  items: readonly T[],
): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  items.forEach((item) => {
    const date = dayOf(item);
    const current = groups.at(-1);
    if (current?.date === date) current.items.push(item);
    else groups.push({ date, items: [item] });
  });
  return groups;
}

/**
 * 화면을 열 때 골라 둘 날.
 *
 * 여행 중이면 오늘이다. 여행 중에 일정을 여는 건 거의 오늘 뭐 하는지 보려는
 * 것이다. 여행 기간이 아니면 `전체` 로, 지금까지 보던 것과 같다.
 */
export function defaultScheduleDay(dayOptions: readonly string[], todayDay: string): string {
  return todayDay && dayOptions.includes(todayDay) ? todayDay : ALL_DAYS;
}

/**
 * 요약 카드가 먼저 보여 줄 묶음의 자리. 묶음이 없으면 -1 이다.
 *
 * 여행 중이면 오늘, 오늘 일정이 없으면 다음으로 오는 날이다. 남은 날이 없거나
 * 여행 중이 아니면 가장 빠른 날로, 지금과 같다.
 */
export function highlightedGroupIndex(
  groups: readonly { date: string }[],
  dayOptions: readonly string[],
  todayDay: string,
): number {
  if (groups.length === 0) return -1;
  const today = todayDay ? dayOptions.indexOf(todayDay) : -1;
  if (today < 0) return 0;
  const found = groups.findIndex((group) => {
    const index = dayOptions.indexOf(group.date);
    return index >= today;
  });
  return found < 0 ? 0 : found;
}
