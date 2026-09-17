/**
 * 웹 뒤로 가기에서 겹쳐 열린 것 중 누가 닫혀야 하는지 가린다.
 *
 * 창을 겹쳐 열면 방문 기록 칸도 겹쳐 쌓인다(`useWebBackClose`). 뒤로 가기 한 번에
 * 칸 하나가 걷히므로 닫혀야 할 것도 하나뿐인데, `popstate` 는 열려 있는 모든 겹에
 * 똑같이 전해진다. 그래서 각자가 「내가 걷혔나」를 스스로 판단해야 한다.
 *
 * 예전에는 「내 표가 아직 맨 위에 있으면 내 칸이 아니다」만 봤다. 맨 위 겹에는
 * 맞지만 아래 겹에는 틀린다. 사진 크게 보기(3번 칸) 위에 고치기(4번 칸)를 열고
 * 「취소」를 누르면 4번 칸이 걷히면서 맨 위는 3번, 곧 크게 보기의 표가 된다.
 * 그때 여행 상세(2번 칸)가 보기에도 「내 표가 맨 위가 아니다」라서, 자기가 걷힌
 * 줄 알고 함께 닫혔다. 사진 고치기를 취소했을 뿐인데 홈으로 떨어진 까닭이다.
 *
 * 그래서 하나를 더 본다. **지금 열려 있는 것 중 맨 위 겹만** `popstate` 에
 * 답한다. 아래 겹은 자기 위에 아직 누가 있으면 남의 일로 보고 가만히 있는다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/**
 * @param myTag 이 겹이 방문 기록 칸에 넣어 둔 표.
 * @param layers 지금 열려 있는 겹들의 표. 칸을 쌓은 차례대로고 맨 뒤가 가장 위다.
 * @param topStateTag 지금 맨 위 방문 기록 칸에 적힌 표. 우리 것이 아니면 `undefined`.
 */
export function backClosesMe(
  myTag: string,
  layers: readonly string[],
  topStateTag: string | undefined,
): boolean {
  // 내 위에 아직 누가 열려 있으면 그쪽 일이다.
  if (layers[layers.length - 1] !== myTag) return false;
  // 내 칸이 아직 맨 위에 남아 있으면 걷힌 것은 내 칸이 아니다.
  return topStateTag !== myTag;
}

/** 표를 겹 목록 맨 위로 올린다. 칸을 다시 쌓을 때 쓴다. */
export function raiseLayer(layers: readonly string[], myTag: string): string[] {
  return [...layers.filter((하나) => 하나 !== myTag), myTag];
}

/** 닫힌 겹을 목록에서 뺀다. */
export function dropLayer(layers: readonly string[], myTag: string): string[] {
  return layers.filter((하나) => 하나 !== myTag);
}
