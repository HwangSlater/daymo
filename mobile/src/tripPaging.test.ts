import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldLoadMore } from "./tripPaging.ts";

const 긴_목록 = { offsetY: 0, viewportHeight: 800, contentHeight: 4000 };
const 더_있다 = { hasMore: true, loading: false };

test("위쪽을 보고 있으면 아직 받지 않는다", () => {
  assert.equal(shouldLoadMore(긴_목록, 더_있다), false);
});

test("바닥에서 한 화면쯤 남으면 미리 받는다", () => {
  assert.equal(shouldLoadMore({ ...긴_목록, offsetY: 2400 }, 더_있다), true);
});

test("바닥에 닿아도 받는다", () => {
  assert.equal(shouldLoadMore({ ...긴_목록, offsetY: 3200 }, 더_있다), true);
});

test("더 받을 것이 없으면 받지 않는다", () => {
  assert.equal(
    shouldLoadMore({ ...긴_목록, offsetY: 3200 }, { hasMore: false, loading: false }),
    false,
  );
});

test("이미 받는 중이면 또 받지 않는다", () => {
  // 손가락 한 번에도 스크롤은 여러 번 불린다. 막지 않으면 같은 쪽을 몇 번씩 받는다.
  assert.equal(
    shouldLoadMore({ ...긴_목록, offsetY: 3200 }, { hasMore: true, loading: true }),
    false,
  );
});

test("높이를 아직 재지 못했으면 가만히 둔다", () => {
  assert.equal(
    shouldLoadMore({ offsetY: 0, viewportHeight: 0, contentHeight: 0 }, 더_있다),
    false,
  );
});
