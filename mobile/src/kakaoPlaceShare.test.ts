import assert from "node:assert/strict";
import { test } from "node:test";

import { parseKakaoPlaceShare, resolveKakaoPlaceShare } from "./kakaoPlaceShare.ts";

test("카카오맵 링크가 없으면 아무것도 읽지 않는다", () => {
  assert.equal(parseKakaoPlaceShare("그냥 메모"), null);
  assert.equal(parseKakaoPlaceShare("https://naver.me/abc"), null);
  assert.equal(parseKakaoPlaceShare("https://kakao.com/abc"), null);
  assert.equal(parseKakaoPlaceShare("https://map.kakao.com.example.com/abc"), null);
});

test("머리말과 같은 줄에 온 이름, 주소, 짧은 링크를 갈라 읽는다", () => {
  const shared = ["[카카오맵] 옹기식탁", "전북 전주시 완산구 은행로 12", "https://kko.kakao.com/AbCdEf"].join("\n");
  assert.deepEqual(parseKakaoPlaceShare(shared), {
    name: "옹기식탁",
    address: "전북 전주시 완산구 은행로 12",
    url: "https://kko.kakao.com/AbCdEf",
  });
});

test("머리말이 따로 한 줄이어도 읽는다", () => {
  const shared = ["[카카오맵]", "옹기식탁", "전북 전주시 완산구 은행로 12", "https://kko.to/xYz12"].join("\r\n");
  assert.deepEqual(parseKakaoPlaceShare(shared), {
    name: "옹기식탁",
    address: "전북 전주시 완산구 은행로 12",
    url: "https://kko.to/xYz12",
  });
});

test("이름과 링크가 한 줄에 붙어 와도 이름을 살린다", () => {
  const result = parseKakaoPlaceShare("[카카오맵] 옹기식탁 https://place.map.kakao.com/12345");
  assert.equal(result?.name, "옹기식탁");
  assert.equal(result?.url, "https://place.map.kakao.com/12345");
});

test("장소 번호 링크만 있으면 이름과 주소가 빈다", () => {
  assert.deepEqual(parseKakaoPlaceShare("https://place.map.kakao.com/12345"), {
    name: "",
    address: "",
    url: "https://place.map.kakao.com/12345",
  });
  assert.equal(parseKakaoPlaceShare("https://map.kakao.com/link/map/12345")?.name, "");
});

test("링크 안에 이름이 있으면 꺼내 쓴다", () => {
  assert.equal(
    parseKakaoPlaceShare("https://map.kakao.com/link/map/전주%20한옥마을,35.8151,127.1530")?.name,
    "전주 한옥마을",
  );
  assert.equal(parseKakaoPlaceShare("https://map.kakao.com/link/search/소나기식당")?.name, "소나기식당");
  assert.equal(parseKakaoPlaceShare("https://m.map.kakao.com/link/to/달빛한옥,35.8,127.1")?.name, "달빛한옥");
  assert.equal(parseKakaoPlaceShare("https://map.kakao.com/?q=%EA%B5%AC%EB%A6%84%EA%B5%AD%EC%88%98")?.name, "구름국수");
});

// 서버에 물어보는 쪽. 그물에 나가지 않도록 fetch 를 갈아 끼운다.
const ENDPOINT = "https://daymo.test/api/naver-place";

const withServer = async (
  answer: () => unknown,
  run: (asked: { url?: string; hint?: string }[]) => Promise<void>,
) => {
  const original = globalThis.fetch;
  const before = process.env.EXPO_PUBLIC_DAYMO_PLACE_RESOLVER_URL;
  process.env.EXPO_PUBLIC_DAYMO_PLACE_RESOLVER_URL = ENDPOINT;
  const asked: { url?: string; hint?: string }[] = [];
  globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
    asked.push(JSON.parse(init?.body ?? "{}"));
    return answer();
  }) as typeof globalThis.fetch;
  try {
    await run(asked);
  } finally {
    globalThis.fetch = original;
    if (before === undefined) delete process.env.EXPO_PUBLIC_DAYMO_PLACE_RESOLVER_URL;
    else process.env.EXPO_PUBLIC_DAYMO_PLACE_RESOLVER_URL = before;
  }
};

const ok = (body: unknown) => ({ ok: true, json: async () => body });

test("짧은 링크만 있으면 서버가 채운 값을 쓴다", async () => {
  await withServer(() => ok({
    name: "옹기식탁",
    address: "전북 전주시 완산구 은행로 12",
    category: "식당",
    url: "https://place.map.kakao.com/27546229",
  }), async (asked) => {
    assert.deepEqual(await resolveKakaoPlaceShare("https://kko.kakao.com/AbCdEf"), {
      name: "옹기식탁",
      address: "전북 전주시 완산구 은행로 12",
      category: "식당",
      url: "https://place.map.kakao.com/27546229",
    });
    assert.deepEqual(asked, [{ url: "https://kko.kakao.com/AbCdEf", hint: "" }]);
  });
});

test("공유 문구에 이름과 주소가 다 있으면 서버에 묻지 않는다", async () => {
  await withServer(() => ok({}), async (asked) => {
    const shared = ["[카카오맵] 옹기식탁", "전북 전주시 완산구 은행로 12", "https://kko.to/xYz12"].join("\n");
    assert.equal((await resolveKakaoPlaceShare(shared))?.name, "옹기식탁");
    assert.deepEqual(asked, []);
  });
});

test("서버가 못 풀면 공유 문구에서 읽은 만큼만 쓴다", async () => {
  await withServer(() => ({ ok: false, json: async () => ({}) }), async () => {
    const shared = "[카카오맵] 옹기식탁\nhttps://kko.kakao.com/AbCdEf";
    assert.deepEqual(await resolveKakaoPlaceShare(shared), {
      name: "옹기식탁",
      address: "",
      url: "https://kko.kakao.com/AbCdEf",
    });
  });
  await withServer(() => { throw new Error("그물 끊김"); }, async () => {
    assert.equal((await resolveKakaoPlaceShare("https://kko.kakao.com/AbCdEf"))?.name, "");
  });
});

test("카카오 링크가 아니면 서버에 묻지 않는다", async () => {
  await withServer(() => ok({}), async (asked) => {
    assert.equal(await resolveKakaoPlaceShare("https://naver.me/abc"), null);
    assert.deepEqual(asked, []);
  });
});
