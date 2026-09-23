/**
 * 목록을 아래로 내릴 때 다음 쪽을 받을지 정한다.
 *
 * 서버는 여행 목록을 한 쪽씩 준다. 화면이 바닥에 닿고 나서 받기 시작하면 빈 자리를
 * 보며 기다리게 되므로, 한 화면쯤 남았을 때 미리 부른다.
 *
 * 이미 받는 중이거나 더 받을 것이 없으면 부르지 않는다. 스크롤은 손가락 하나에도
 * 여러 번 불려서, 막지 않으면 같은 쪽을 몇 번씩 받는다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

type ScrollPosition = {
  /** 지금까지 내려온 거리. */
  offsetY: number;
  /** 화면에 보이는 높이. */
  viewportHeight: number;
  /** 목록 전체의 높이. */
  contentHeight: number;
};

export function shouldLoadMore(
  { offsetY, viewportHeight, contentHeight }: ScrollPosition,
  { hasMore, loading }: { hasMore: boolean; loading: boolean },
): boolean {
  if (!hasMore || loading) return false;
  // 아직 높이를 재지 못했다. 다음 번 스크롤에서 다시 본다.
  if (viewportHeight <= 0) return false;
  const 남은_거리 = contentHeight - (offsetY + viewportHeight);
  return 남은_거리 <= viewportHeight;
}
