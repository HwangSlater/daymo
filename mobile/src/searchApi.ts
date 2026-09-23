import { useEffect, useRef, useState } from "react";

import { authenticatedRequest } from "./auth";
import {
  SEARCH_LIMIT,
  SEARCH_MIN_QUERY,
  searchPath,
  searchRowsFromHits,
  type SearchChip,
  type SearchHit,
  type SearchRow,
} from "./searchResults";

/**
 * 공간 하나를 가로질러 찾는 서버 길(`GET /v1/spaces/{spaceId}/search`).
 *
 * 기기에 받아 둔 여행만 훑던 찾기를 서버까지 넓힌다(2026-09-23 검토 #61). 줄을
 * 화면 모양으로 옮기고 합치는 일은 `searchResults.ts` 가 한다 — 여기는 언제
 * 보내고 무엇을 버릴지만 정한다.
 */

/**
 * 글자를 치고 나서 요청이 나가기까지 기다리는 시간.
 *
 * 250ms 다. 한글은 자모마다 `onChangeText` 가 튀어서(「소」를 치는 동안 ㅅ·소가
 * 따로 온다) 글자 하나에 두세 번 나갈 수 있다. 이어서 치는 사이가 보통
 * 100~200ms 이니 그보다 길게 두면 한 낱말에 한 번만 나간다. 사람이 「멈췄다」고
 * 느끼기 시작하는 300ms 보다는 짧게 둬서, 다 치고 나서 기다린다는 느낌은 주지
 * 않는다.
 */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * 서버에서 찾는다. 두 글자보다 짧으면 부르지 않고 빈 목록이다.
 *
 * `chip` 을 주면 그 갈래만 받는다. 기본은 여덟 가지 전부다 — 한 번 받아 두면
 * 칩을 눌러 볼 때마다 서버에 다시 묻지 않아도 되고, 칩에 적히는 수도 갈래마다
 * 따로 잘리지 않는다. 주소를 만드는 규칙은 `searchPath` 에 있다.
 */
export async function searchSpace(
  spaceId: string,
  query: string,
  { chip = "전체" as SearchChip, limit = SEARCH_LIMIT }: { chip?: SearchChip; limit?: number } = {},
): Promise<SearchHit[]> {
  const 주소 = searchPath(spaceId, query, chip, limit);
  if (!주소) return [];
  return authenticatedRequest<SearchHit[]>(주소);
}

/** 서버에서 찾은 결과. 화면은 이것을 기기 줄과 합쳐서 그린다. */
export type ServerSearch = {
  rows: SearchRow[];
  /** 서버에 물어보는 중인지. 글자를 치고 기다리는 동안은 아직 아니다. */
  loading: boolean;
  /** 서버에 닿지 못했는지. 기기 것은 그대로 보이므로 화면은 한 줄로만 알린다. */
  failed: boolean;
};

const 빈_결과: ServerSearch = { rows: [], loading: false, failed: false };

/**
 * 친 말로 서버를 찾아 둔다.
 *
 * **중복 요청 버리기.** 글자를 이어 치면 요청이 겹친다. 먼저 보낸 것이 늦게
 * 돌아와 나중 것을 덮으면 친 말과 목록이 어긋난다. 요청마다 번호를 붙여 두고
 * **마지막 번호의 답만** 화면에 넣는다. 이미 나간 요청을 끊지는 않는다 —
 * 끊으려면 `auth.ts` 의 문에 중단 신호를 내야 하는데, 찾기 요청은 작고 서버는
 * 대부분 이미 처리하고 있어 끊어도 줄어드는 일이 없다.
 *
 * 두 글자보다 짧으면 아예 보내지 않는다. 서버도 빈 목록으로 답하니 오갈 까닭이
 * 없다. 그동안에도 기기 것은 화면에서 그대로 걸러진다.
 *
 * `chip` 은 두지 않는 쪽을 권한다. 여덟 갈래를 한 번에 받아 두고 칩은 화면에서
 * `filterByChip` 으로 거르면, 칩을 눌러 볼 때마다 서버에 다시 묻지 않고 칩에
 * 적히는 수도 갈래마다 따로 잘리지 않는다.
 */
export function useSpaceSearch(
  spaceId: string | undefined,
  query: string,
  chip: SearchChip = "전체",
): ServerSearch {
  const [결과, set결과] = useState<ServerSearch>(빈_결과);
  // 지금 기다리는 요청의 번호. 뒤에 보낸 것이 있으면 앞의 답은 버린다.
  const 번호 = useRef(0);

  useEffect(() => {
    const 말 = query.trim();
    if (!spaceId || 말.length < SEARCH_MIN_QUERY) {
      번호.current += 1;
      // 친 말이 짧아지면 서버 줄은 바로 치운다. 남겨 두면 지운 글자로 찾은 것이 남는다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      set결과(빈_결과);
      return;
    }
    const 이번 = (번호.current += 1);
    const 타이머 = setTimeout(() => {
      // 기다리는 표시는 요청이 실제로 나갈 때 켠다. 글자를 칠 때마다 켜면
      // 「불러오는 중」이 깜빡이기만 한다.
      set결과((앞) => ({ ...앞, loading: true }));
      searchSpace(spaceId, 말, { chip })
        .then((hits) => {
          if (번호.current !== 이번) return;
          set결과({ rows: searchRowsFromHits(hits), loading: false, failed: false });
        })
        .catch(() => {
          if (번호.current !== 이번) return;
          // 연결이 없거나 로그인이 풀렸다. 기기 것은 그대로 보이고, 화면이 한 줄로 알린다.
          set결과({ rows: [], loading: false, failed: true });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(타이머);
  }, [spaceId, query, chip]);

  return 결과;
}
