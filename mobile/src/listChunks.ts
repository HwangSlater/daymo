/**
 * 긴 목록을 한 번에 다 그리지 않고 몇 판에 나눠 그리기 위한 셈(2026-09-23 검토 #60).
 *
 * **왜 `FlatList` 가 아닌가.** 이 목록들은 이미 세로 `ScrollView` 안에 들어 있다.
 * 그 안에 `FlatList` 를 그대로 넣으면 스크롤이 겹친다는 경고가 나고 위에 붙은
 * 머리줄이 깨진다. 스크롤을 목록에 넘기려면 탭을 감싼 화면(`WarmTripDetail`)을
 * 통째로 바꿔야 하는데, 탭 넷이 한 스크롤을 같이 쓴다.
 *
 * **왜 「보이는 자리만 그리는 창」도 아닌가.** 필름 스트립(`PhotoViewer` 의
 * `STRIP_WINDOW`)은 스크롤하는 줄 자신이 자기 스크롤 자리를 알아서 그 길을 쓸 수
 * 있다. 탭 안의 목록은 스크롤 자리를 바깥이 들고 있어 여기서는 알 수 없다.
 *
 * 그래서 차례와 스크롤 자리를 그대로 둔 채 **첫 판만 바로 그리고 나머지를 뒤이어
 * 붙인다.** 첫 그림에 들어가는 줄이 1,000 개에서 `CHUNK_FIRST` 개로 줄고, 다 그리고
 * 난 목록의 내용·차례·「더 보기」는 전과 똑같다.
 */

/**
 * 첫 판에 그리는 줄 수.
 *
 * 작은 폰(667pt)에 지출 줄이 여남은 개 들어간다. 한 화면의 서너 배를 첫 판으로 잡아,
 * 손가락이 닿기 전에 다음 판이 이미 붙어 있게 한다.
 */
export const CHUNK_FIRST = 40;

/** 그다음부터 한 판에 붙이는 줄 수. */
export const CHUNK_STEP = 60;

/** 날짜처럼 무언가로 묶인 한 덩이. 줄은 `items` 에 들어 있다. */
type Grouped<줄> = { items: 줄[] };

/** 묶음들에 들어 있는 줄을 모두 센다. */
export function countRows<줄>(groups: readonly Grouped<줄>[]): number {
  return groups.reduce((합, 묶음) => 합 + 묶음.items.length, 0);
}

/**
 * 묶음 목록을 앞에서부터 `rows` 줄까지만 남긴다.
 *
 * 묶음 머리(날짜와 그날 합계)는 그 묶음의 줄이 한 줄이라도 남을 때만 따라온다.
 * 한 줄도 안 남는 묶음은 통째로 떨어져 나가서, 머리만 덩그러니 뜨는 일이 없다.
 * 다 들어가면 받은 것을 그대로 돌려준다 — 새 배열을 만들면 그것만으로 받는 쪽이
 * 다시 그린다.
 */
export function chunkGroups<줄, 묶음 extends Grouped<줄>>(
  groups: readonly 묶음[],
  rows: number,
): readonly 묶음[] {
  if (rows >= countRows(groups)) return groups;
  const 남은_것: 묶음[] = [];
  let 남은_줄 = Math.max(0, rows);
  for (const 묶음 of groups) {
    if (남은_줄 <= 0) break;
    남은_것.push(묶음.items.length <= 남은_줄 ? 묶음 : { ...묶음, items: 묶음.items.slice(0, 남은_줄) });
    남은_줄 -= 묶음.items.length;
  }
  return 남은_것;
}

/** 다음 판까지 그려 둘 줄 수. 전체를 넘지 않는다. */
export function nextChunk(drawn: number, total: number, step: number = CHUNK_STEP): number {
  return Math.min(total, drawn + step);
}
