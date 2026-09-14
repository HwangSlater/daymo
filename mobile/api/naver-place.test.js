import assert from "node:assert/strict";
import { test } from "node:test";

import handler from "./naver-place.js";

const makeResponse = () => {
  const captured = { code: 0, body: null, headers: {} };
  return {
    captured,
    setHeader(key, value) {
      captured.headers[key] = value;
    },
    status(code) {
      captured.code = code;
      return this;
    },
    json(body) {
      captured.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
};

const call = async (body, { headers = {}, method = "POST", ip = "1.2.3.4" } = {}) => {
  const response = makeResponse();
  await handler({ method, headers, body, socket: { remoteAddress: ip } }, response);
  return response.captured;
};

test("POST 가 아니면 받지 않는다", async () => {
  assert.equal((await call(null, { method: "GET" })).code, 405);
});

test("몸통이 깨졌으면 422 가 아니라 400 이다", async () => {
  // 주소가 잘못된 것과 몸통이 깨진 것은 앱에서 다르게 안내해야 한다.
  assert.equal((await call("{깨짐", { ip: "10.0.0.1" })).code, 400);
});

test("네이버가 아닌 주소는 막는다", async () => {
  for (const url of [
    "not a url",
    "https://example.com/x",
    // 이름 끝만 같은 사칭 주소
    "https://evilnaver.com/x",
    // 점 뒤 도메인을 바꾼 주소
    "https://naver.me.evil.test/x",
  ]) {
    const result = await call({ url }, { ip: "10.0.0.2" });
    assert.equal(result.code, 422, url);
  }
});

test("http 네이버 주소도 막는다", async () => {
  // 중간에서 내용을 갈아 끼울 수 있어 https 만 받는다.
  assert.equal((await call({ url: "http://naver.me/abc" }, { ip: "10.0.0.3" })).code, 422);
});

test("모르는 출처에는 CORS 머리글을 주지 않는다", async () => {
  const result = await call({ url: "not a url" }, {
    headers: { origin: "https://evil.test" },
    ip: "10.0.0.4",
  });
  assert.equal(result.headers["Access-Control-Allow-Origin"], undefined);
});

test("허용한 출처에만 CORS 머리글을 준다", async () => {
  process.env.ALLOWED_ORIGINS = "https://daymo.test, https://www.daymo.test";
  const result = await call({ url: "not a url" }, {
    headers: { origin: "https://www.daymo.test" },
    ip: "10.0.0.5",
  });
  assert.equal(result.headers["Access-Control-Allow-Origin"], "https://www.daymo.test");
  delete process.env.ALLOWED_ORIGINS;
});

test("한 주소가 너무 자주 부르면 막는다", async () => {
  let last;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    last = await call({ url: "not a url" }, { ip: "10.0.0.6" });
  }
  assert.equal(last.code, 429);
});

test("다른 주소는 앞사람 때문에 막히지 않는다", async () => {
  const result = await call({ url: "not a url" }, { ip: "10.0.0.7" });
  assert.equal(result.code, 422);
});
