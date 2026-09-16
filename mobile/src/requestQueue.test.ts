import assert from "node:assert/strict";
import { test } from "node:test";

import {
  backoffMs,
  BASE_BACKOFF_MS,
  createRequestQueue,
  isCongested,
  MAX_BACKOFF_MS,
  onGiveUp,
  sendQueued,
  shouldRetry,
  statusOf,
  type GiveUp,
} from "./requestQueue.ts";

/** 손으로 풀어 주는 약속. 몇 개가 동시에 나가 있는지 붙잡아 두고 볼 수 있다. */
function 손잡이<T = void>() {
  let 풀기!: (value: T) => void;
  let 깨기!: (error: unknown) => void;
  const 약속 = new Promise<T>((resolve, reject) => {
    풀기 = resolve;
    깨기 = reject;
  });
  return { 약속, 풀기, 깨기 };
}

const 다음_틱 = () => new Promise<void>((resolve) => setImmediate(resolve));

test("동시에 나가는 요청은 정해진 수를 넘지 않는다", async () => {
  const queue = createRequestQueue(3);
  const 손잡이들 = Array.from({ length: 10 }, () => 손잡이());
  let 지금 = 0;
  let 가장_많았을_때 = 0;
  const 끝난_차례: number[] = [];

  const 모두 = 손잡이들.map((하나, 번호) =>
    queue.run(async () => {
      지금 += 1;
      가장_많았을_때 = Math.max(가장_많았을_때, 지금);
      await 하나.약속;
      지금 -= 1;
      끝난_차례.push(번호);
    }));

  await 다음_틱();
  assert.equal(지금, 3);
  assert.equal(queue.inFlight, 3);
  assert.equal(queue.waiting, 7);

  // 하나씩 풀어 주는 동안에도 셋을 넘지 않아야 한다.
  for (const 하나 of 손잡이들) {
    하나.풀기();
    await 다음_틱();
    assert.ok(지금 <= 3, `동시에 ${지금}개가 나갔다`);
  }
  await Promise.all(모두);
  assert.equal(가장_많았을_때, 3);
  assert.equal(끝난_차례.length, 10);
  assert.equal(queue.inFlight, 0);
  assert.equal(queue.waiting, 0);
});

test("화면이 기다리는 요청이 미리 받기보다 먼저 나간다", async () => {
  const queue = createRequestQueue(1);
  const 첫_손잡이 = 손잡이();
  const 나간_차례: string[] = [];

  const 첫_요청 = queue.run(async () => {
    나간_차례.push("먼저 잡은 자리");
    await 첫_손잡이.약속;
  });
  // 자리가 찬 뒤에 미리 받기 → 화면 차례로 세운다.
  const 미리 = queue.run(async () => {
    나간_차례.push("미리 받기");
  }, { background: true });
  const 화면 = queue.run(async () => {
    나간_차례.push("화면");
  });

  첫_손잡이.풀기();
  await Promise.all([첫_요청, 미리, 화면]);
  assert.deepEqual(나간_차례, ["먼저 잡은 자리", "화면", "미리 받기"]);
});

test("일꾼이 곧바로 던져도 자리를 돌려준다", async () => {
  const queue = createRequestQueue(1);
  await assert.rejects(() => queue.run(() => {
    throw new Error("바로 터짐");
  }));
  assert.equal(queue.inFlight, 0);
  assert.equal(await queue.run(async () => "다음 요청"), "다음 요청");
});

test("429 뒤 쉬는 시간은 차례마다 길어진다", () => {
  // 흔들기가 가장 크게 나온 앞 차례와 가장 작게 나온 다음 차례를 견줘도 늘어나야 한다.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.ok(backoffMs(attempt, 1) < backoffMs(attempt + 1, 0),
      `${attempt}번째(${backoffMs(attempt, 1)}ms)가 다음 차례(${backoffMs(attempt + 1, 0)}ms)보다 짧아야 한다`);
  }
  assert.equal(backoffMs(0, 0.5), BASE_BACKOFF_MS);
  assert.equal(backoffMs(99, 0.5), MAX_BACKOFF_MS);
  // 흔들기가 있어 같은 차례라도 값이 갈린다.
  assert.notEqual(backoffMs(1, 0), backoffMs(1, 1));
});

test("429 는 무엇을 보내던 요청이든 다시 보내고, 연결 끊김은 안전한 요청만 다시 보낸다", () => {
  assert.equal(shouldRetry(429, { attempt: 0, safe: false }), true);
  assert.equal(shouldRetry(503, { attempt: 0, safe: false }), true);
  assert.equal(shouldRetry(0, { attempt: 0, safe: false }), false);
  assert.equal(shouldRetry(0, { attempt: 0, safe: true }), true);
  // 사용자가 고쳐야 하는 오류는 다시 보내지 않는다.
  assert.equal(shouldRetry(422, { attempt: 0, safe: true }), false);
  assert.equal(shouldRetry(404, { attempt: 0, safe: true }), false);
  assert.equal(shouldRetry(409, { attempt: 0, safe: true }), false);
  // 정해진 횟수를 다 쓰면 그만한다.
  assert.equal(shouldRetry(429, { attempt: 2, retries: 2, safe: true }), false);
  assert.ok(isCongested(503) && !isCongested(404));
  assert.equal(statusOf({ status: 429 }), 429);
  assert.equal(statusOf(new Error("모름")), -1);
});

test("429 를 만나면 쉬었다 다시 보내고 갈수록 오래 쉰다", async () => {
  const 쉰_시간: number[] = [];
  let 부른_횟수 = 0;
  const 값 = await sendQueued(async () => {
    부른_횟수 += 1;
    if (부른_횟수 < 3) throw Object.assign(new Error("앞단이 막았다"), { status: 429 });
    return "받았다";
  }, {
    queue: createRequestQueue(2),
    sleep: async (ms) => {
      쉰_시간.push(ms);
    },
    jitter: () => 0.5,
  });

  assert.equal(값, "받았다");
  assert.equal(부른_횟수, 3);
  assert.deepEqual(쉰_시간, [BASE_BACKOFF_MS, BASE_BACKOFF_MS * 2]);
});

test("쉬는 동안에는 자리를 내준다", async () => {
  const queue = createRequestQueue(1);
  const 나간_차례: string[] = [];
  let 막힌_횟수 = 0;
  const 쉬기 = 손잡이();

  const 막힌_요청 = sendQueued(async () => {
    나간_차례.push(`막힌 요청 ${막힌_횟수}`);
    막힌_횟수 += 1;
    if (막힌_횟수 < 2) throw Object.assign(new Error("앞단이 막았다"), { status: 429 });
    return "마침내";
  }, { queue, sleep: () => 쉬기.약속, jitter: () => 0.5 });

  await 다음_틱();
  // 한 자리뿐인 줄이지만 쉬는 사이에 뒤에 선 요청이 지나간다.
  const 뒷_요청 = queue.run(async () => {
    나간_차례.push("뒤에 선 요청");
  });
  await 뒷_요청;
  assert.deepEqual(나간_차례, ["막힌 요청 0", "뒤에 선 요청"]);

  쉬기.풀기();
  assert.equal(await 막힌_요청, "마침내");
  assert.deepEqual(나간_차례, ["막힌 요청 0", "뒤에 선 요청", "막힌 요청 1"]);
});

test("다 해 보고도 막히면 오류를 그대로 올린다", async () => {
  let 부른_횟수 = 0;
  const 터진_것 = await sendQueued(async () => {
    부른_횟수 += 1;
    throw Object.assign(new Error("앞단이 막았다"), { status: 503 });
  }, { queue: createRequestQueue(2), sleep: async () => {}, retries: 2 }).catch((error: unknown) => error);

  assert.equal((터진_것 as Error).message, "앞단이 막았다");
  // 처음 한 번 + 다시 두 번.
  assert.equal(부른_횟수, 3);
});

test("끝내 못 보낸 요청은 조용히 넘기지 않고 알린다", async () => {
  const 들은_것: GiveUp[] = [];
  const 그만_듣기 = onGiveUp((giveUp) => 들은_것.push(giveUp));
  const 줄 = { queue: createRequestQueue(2), sleep: async () => {} };
  try {
    await assert.rejects(() => sendQueued(async () => {
      throw Object.assign(new Error("앞단이 막았다"), { status: 429 });
    }, 줄));
    await assert.rejects(() => sendQueued(async () => {
      throw Object.assign(new Error("연결이 끊겼다"), { status: 0 });
    }, { ...줄, safe: true }));
    // 사용자가 고쳐야 하는 오류는 화면 위 한 줄까지 올리지 않는다.
    await assert.rejects(() => sendQueued(async () => {
      throw Object.assign(new Error("값이 틀렸다"), { status: 422 });
    }, 줄));
    // 다시 보내 보지도 못한(= 한 번 만에 끝난) 실패도 알리지 않는다. 잠깐 끊긴 것마다
    // 한 줄이 뜨면 시끄럽다. 보내는 쪽이 제 자리에서 안내한다.
    await assert.rejects(() => sendQueued(async () => {
      throw Object.assign(new Error("연결이 끊겼다"), { status: 0 });
    }, { ...줄, safe: false }));
  } finally {
    그만_듣기();
  }
  assert.deepEqual(들은_것, [
    { kind: "congested", status: 429 },
    { kind: "unreachable", status: 0 },
  ]);
});
