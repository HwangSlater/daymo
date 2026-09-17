/**
 * 기록 탭 머리에 적는 말 — 필터 칩과 「N일의 기록」.
 *
 * 머리에 네 줄이 쌓여 있었다. 탭 제목의 `9개`, 요약 줄의 `사진 8장 · 일기 1편`,
 * 섹션 제목의 `10개`, 그리고 필터 줄. 같은 것을 세 번 세는 동안 사진은 화면
 * 밖으로 밀렸다. 세는 일은 필터 칩 하나에 맡긴다. 칩은 어차피 고르려고 읽는
 * 자리라, 거기 숫자가 붙으면 따로 세어 주는 줄이 필요 없다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 격자를 가르는 세 갈래. 값이 곧 칩에 적히는 말이다. */
export const MEMORY_FILTERS = ["전체", "사진", "카드"] as const;
export type MemoryFilter = (typeof MEMORY_FILTERS)[number];

/** 칩 하나. `label` 은 이미 수까지 붙인 말이라 그리는 쪽은 그대로 적으면 된다. */
export type MemoryFilterChip = {
  key: MemoryFilter;
  label: string;
  /** 이 갈래에 든 수. 0이면 눌러도 빈 격자라 흐리게 그린다. */
  count: number;
};

/**
 * 필터 칩 셋.
 *
 * 수를 칩에 붙여 `전체 10` `사진 8` `카드 2` 로 읽힌다. 「전체」가 나머지 둘의
 * 합이라 굳이 다른 줄에서 다시 셀 것이 없다.
 */
export function memoryFilterChips(photoCount: number, cardCount: number): MemoryFilterChip[] {
  const 수 = { 전체: photoCount + cardCount, 사진: photoCount, 카드: cardCount } as const;
  return MEMORY_FILTERS.map((key) => ({ key, label: `${key} ${수[key]}`, count: 수[key] }));
}

/**
 * 며칠에 걸친 기록인지.
 *
 * 날짜를 아직 안 정한 사진(`날짜 미정`)은 세지 않는다. 그것까지 하루로 세면
 * 사흘 여행이 나흘이 된다.
 */
export function memoryDayCount(dates: readonly string[], undated: string): number {
  return new Set(dates.filter((날짜) => 날짜 && 날짜 !== undated)).size;
}

/**
 * 탭 머리 제목 옆의 작은 말.
 *
 * 개수는 필터가 세니 여기서는 다른 것을 알려 준다. 아직 아무 날짜도 없으면
 * 「0일의 기록」이 아니라 첫 장을 권하는 말이 낫다.
 */
export function memoryHeadCount(dayCount: number): string {
  return dayCount > 0 ? `${dayCount}일의 기록` : "첫 기록";
}
