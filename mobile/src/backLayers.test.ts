import assert from "node:assert/strict";
import { test } from "node:test";

import { backClosesMe, dropLayer, raiseLayer } from "./backLayers.ts";

test("맨 위 겹만 뒤로 가기에 답한다", () => {
  const 겹 = ["여행상세", "크게보기", "고치기"];

  // 고치기 칸이 걷혀 맨 위 표가 크게보기가 됐다.
  assert.equal(backClosesMe("고치기", 겹, "크게보기"), true);
  // 아래 겹은 자기 위에 누가 있으므로 남의 일로 본다. 예전에는 여기서 여행 상세까지
  // 닫혀 홈으로 떨어졌다.
  assert.equal(backClosesMe("크게보기", 겹, "크게보기"), false);
  assert.equal(backClosesMe("여행상세", 겹, "크게보기"), false);
});

test("내 칸이 아직 맨 위면 걷힌 것은 내 칸이 아니다", () => {
  const 겹 = ["여행상세", "크게보기"];

  assert.equal(backClosesMe("크게보기", 겹, "크게보기"), false);
  assert.equal(backClosesMe("크게보기", 겹, "여행상세"), true);
  // 우리가 쌓지 않은 칸으로 나갔을 때도 맨 위 겹이 닫힌다.
  assert.equal(backClosesMe("크게보기", 겹, undefined), true);
});

test("겹 목록은 쌓은 차례를 지킨다", () => {
  assert.deepEqual(raiseLayer(["a", "b"], "c"), ["a", "b", "c"]);
  // 칸을 다시 쌓으면 맨 위로 올라간다.
  assert.deepEqual(raiseLayer(["a", "b", "c"], "b"), ["a", "c", "b"]);
  assert.deepEqual(dropLayer(["a", "b", "c"], "b"), ["a", "c"]);
  assert.deepEqual(dropLayer(["a"], "z"), ["a"]);
});
