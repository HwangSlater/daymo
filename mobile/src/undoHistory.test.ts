import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyHistory, recordChange, redoOnce, undoOnce, UNDO_GROUP_MS, UNDO_MAX } from "./undoHistory.ts";

test("바뀌기 전 모습을 쌓고, 되돌리고, 다시 한다", () => {
  let h = emptyHistory<string>();
  h = recordChange(h, "처음", 0);
  h = recordChange(h, "둘째", 5000);
  const 한번 = undoOnce(h, "셋째");
  assert.equal(한번?.value, "둘째");
  const 두번 = undoOnce(한번!.history, "둘째");
  assert.equal(두번?.value, "처음");
  assert.equal(undoOnce(두번!.history, "처음"), undefined);
  const 다시 = redoOnce(두번!.history, "처음");
  assert.equal(다시?.value, "둘째");
  assert.equal(redoOnce(다시!.history, "둘째")?.value, "셋째");
});

test("잇달아 온 변경은 한 단계로 묶고, 새로 하면 다시 할 것은 사라진다", () => {
  let h = emptyHistory<number>();
  h = recordChange(h, 0, 1000);
  h = recordChange(h, 1, 1000 + UNDO_GROUP_MS - 1);
  h = recordChange(h, 2, 1000 + UNDO_GROUP_MS * 2 - 2);
  assert.deepEqual(h.past, [0]);
  const 되돌림 = undoOnce(h, 3)!;
  assert.equal(되돌림.value, 0);
  // 되돌린 바로 뒤의 변경은 묶지 않고 새로 쌓는다.
  const 새로 = recordChange(되돌림.history, 0, 1000 + UNDO_GROUP_MS * 2);
  assert.deepEqual(새로.past, [0]);
  assert.deepEqual(새로.future, []);
});

test("같은 모습은 두 번 쌓지 않고, 너무 많으면 오래된 것부터 버린다", () => {
  let h = emptyHistory<number>();
  h = recordChange(h, 1, 0);
  h = recordChange(h, 1, 10_000);
  assert.deepEqual(h.past, [1]);
  for (let i = 0; i < UNDO_MAX + 5; i += 1) h = recordChange(h, i + 2, 20_000 + i * 10_000);
  assert.equal(h.past.length, UNDO_MAX);
});
