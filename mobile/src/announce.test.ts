import assert from "node:assert/strict";
import { test } from "node:test";

import { announce, resetAnnounce, setAnnouncer, type Announcer } from "./announce.ts";

/** 읽어 준 말을 모아 두는 가짜 낭독기. */
function 가짜(켜짐 = true): Announcer & { 읽은것: string[] } {
  const 읽은것: string[] = [];
  return {
    읽은것,
    isScreenReaderEnabled: async () => 켜짐,
    announceForAccessibility: (message) => {
      읽은것.push(message);
    },
  };
}

/** `announce` 는 기다리지 않으므로 마이크로태스크가 다 돌 때까지 한 박자 쉰다. */
const 한박자 = () => new Promise((resolve) => setTimeout(resolve, 0));

test("읽기 기능이 켜져 있으면 그대로 읽어 준다", async () => {
  const 낭독기 = 가짜();
  setAnnouncer(낭독기);

  announce("사진을 불러오지 못했어요");
  await 한박자();

  assert.deepEqual(낭독기.읽은것, ["사진을 불러오지 못했어요"]);
});

test("읽기 기능이 꺼져 있으면 아무 일도 하지 않는다", async () => {
  const 낭독기 = 가짜(false);
  setAnnouncer(낭독기);

  announce("사진을 불러오지 못했어요");
  await 한박자();

  assert.deepEqual(낭독기.읽은것, []);
});

test("빈 글과 공백뿐인 글은 읽지 않는다", async () => {
  const 낭독기 = 가짜();
  setAnnouncer(낭독기);

  announce("");
  announce("   ");
  announce(null);
  announce(undefined);
  await 한박자();

  assert.deepEqual(낭독기.읽은것, []);
});

test("같은 말이 연달아 오면 한 번만 읽는다", async () => {
  const 낭독기 = 가짜();
  setAnnouncer(낭독기);

  announce("불러오지 못했어요");
  announce("불러오지 못했어요");
  await 한박자();
  announce("불러오지 못했어요");
  await 한박자();

  assert.deepEqual(낭독기.읽은것, ["불러오지 못했어요"]);
});

test("사이에 다른 말이 오면 같은 말도 다시 읽는다", async () => {
  const 낭독기 = 가짜();
  setAnnouncer(낭독기);

  announce("불러오지 못했어요");
  announce("불러오는 중이에요");
  announce("불러오지 못했어요");
  await 한박자();

  assert.deepEqual(낭독기.읽은것, ["불러오지 못했어요", "불러오는 중이에요", "불러오지 못했어요"]);
});

test("resetAnnounce 뒤에는 같은 말을 다시 읽는다", async () => {
  const 낭독기 = 가짜();
  setAnnouncer(낭독기);

  announce("불러오지 못했어요");
  await 한박자();
  resetAnnounce();
  announce("불러오지 못했어요");
  await 한박자();

  assert.deepEqual(낭독기.읽은것, ["불러오지 못했어요", "불러오지 못했어요"]);
});

test("낭독기가 던져도 부른 쪽으로 새지 않는다", async () => {
  setAnnouncer({
    isScreenReaderEnabled: async () => {
      throw new Error("읽기 기능을 물어볼 수 없는 기기");
    },
    announceForAccessibility: () => {},
  });

  announce("불러오지 못했어요");
  await 한박자();
});

test("낭독기를 세우지 않으면(웹·순수 node) 조용히 넘어간다", async () => {
  // 마지막 시험이다. 여기서 세운 것을 물리면 뒤에 오는 시험이 진짜 react-native 를 찾는다.
  setAnnouncer(null);

  announce("불러오지 못했어요");
  await 한박자();
});
