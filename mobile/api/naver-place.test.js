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

// 여기서부터는 카카오맵 짧은 링크다. 그물에 나가지 않도록 fetch 를 갈아 끼운다.
const reply = (body, { status = 200 } = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => null },
  text: async () => body,
  json: async () => JSON.parse(body),
});

const moved = (location) => ({
  status: 301,
  ok: false,
  headers: { get: (key) => (key.toLowerCase() === "location" ? location : null) },
  text: async () => "",
});

const withFetch = async (routes, run) => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    seen.push({ url, headers: init?.headers ?? {} });
    const route = routes.find((item) => url.startsWith(item[0]));
    if (!route) throw new Error("모르는 주소");
    return typeof route[1] === "function" ? route[1]() : route[1];
  };
  try {
    return await run(seen);
  } finally {
    globalThis.fetch = original;
  }
};

const kakaoPage = (title, description, image = "") => [
  "<html><head>",
  `<meta property="og:site_name" content="카카오맵">`,
  `<meta property="og:title" content="${title}">`,
  `<meta property="og:description" content="${description}">`,
  image ? `<meta property="og:image" content="${image}">` : "",
  "</head></html>",
].join("");

const 짧은링크 = "https://kko.kakao.com/AbCdEf";
const 넘어간주소 = "https://map.kakao.com/?map_type=TYPE_MAP&itemId=27546229&urlLevel=3";
const 장소쪽 = "https://place.map.kakao.com/27546229";
const 장소쪽글 = kakaoPage(
  "옹기식탁",
  "전북 전주시 완산구 은행로 12 2층",
  "http://staticmap.kakao.com/staticmap/og?srs=wgs84&m=127.1530%2C35.8151",
);

test("카카오 짧은 링크를 따라가 이름과 주소를 채운다", async () => {
  const result = await withFetch([
    [짧은링크, moved(넘어간주소)],
    ["https://map.kakao.com/", reply(kakaoPage("옹기식탁", "전북 전주시 완산구 은행로 12"))],
    [장소쪽, reply(장소쪽글)],
  ], () => call({ url: 짧은링크 }, { ip: "10.1.0.1" }));
  assert.equal(result.code, 200);
  // 장소 쪽 주소에는 층수까지 들어 있어 넘어간 쪽보다 낫다.
  assert.deepEqual(result.body, {
    name: "옹기식탁",
    address: "전북 전주시 완산구 은행로 12 2층",
    url: 장소쪽,
  });
});

test("키가 있으면 도로명 주소와 종류까지 채운다", async () => {
  process.env.KAKAO_REST_API_KEY = "test-key";
  const found = JSON.stringify({
    documents: [{
      place_name: "옹기식탁",
      road_address_name: "전북특별자치도 전주시 완산구 은행로 12",
      address_name: "전북 전주시 완산구 풍남동3가 1",
      category_group_code: "FD6",
      category_name: "음식점 > 한식",
    }],
  });
  const seen = [];
  const result = await withFetch([
    ["https://kko.kakao.com/Key123", moved("https://map.kakao.com/?itemId=27546229")],
    ["https://map.kakao.com/", reply(kakaoPage("옹기식탁", "전북 전주시"))],
    [장소쪽, reply(장소쪽글)],
    ["https://dapi.kakao.com/v2/local/search/keyword.json", reply(found)],
  ], async (calls) => {
    const out = await call({ url: "https://kko.kakao.com/Key123" }, { ip: "10.1.0.2" });
    seen.push(...calls);
    return out;
  });
  delete process.env.KAKAO_REST_API_KEY;
  assert.equal(result.code, 200);
  assert.equal(result.body.address, "전북특별자치도 전주시 완산구 은행로 12");
  assert.equal(result.body.category, "식당");
  const search = seen.find((item) => item.url.startsWith("https://dapi.kakao.com"));
  assert.ok(search, "장소 검색을 불렀다");
  assert.equal(search.headers.Authorization, "KakaoAK test-key");
  // 좌표를 알면 그 자리 가까운 것부터 본다.
  assert.match(search.url, /x=127\.1530&y=35\.8151/);
  // 키는 앱으로 돌아가는 답에 섞이지 않는다.
  assert.ok(!JSON.stringify(result.body).includes("test-key"));
});

test("키가 없으면 장소 검색을 부르지 않는다", async () => {
  delete process.env.KAKAO_REST_API_KEY;
  const seen = [];
  const result = await withFetch([
    ["https://kko.kakao.com/NoKey1", moved("https://map.kakao.com/?itemId=27546229")],
    ["https://map.kakao.com/", reply(kakaoPage("옹기식탁", "전북 전주시"))],
    [장소쪽, reply(장소쪽글)],
  ], async (calls) => {
    const out = await call({ url: "https://kko.kakao.com/NoKey1" }, { ip: "10.1.0.3" });
    seen.push(...calls);
    return out;
  });
  assert.equal(result.code, 200);
  assert.equal(result.body.name, "옹기식탁");
  assert.ok(!seen.some((item) => item.url.startsWith("https://dapi.kakao.com")));
});

test("검색어만 든 링크는 카카오맵 소개 문구를 이름으로 쓰지 않는다", async () => {
  const result = await withFetch([
    ["https://map.kakao.com/", reply(kakaoPage("카카오맵", "좋은 곳을 함께 찾아가는 지도, 카카오맵"))],
  ], () => call({ url: "https://map.kakao.com/?q=%EA%B5%AC%EB%A6%84%EA%B5%AD%EC%88%98" }, { ip: "10.1.0.4" }));
  assert.equal(result.code, 200);
  assert.equal(result.body.name, "구름국수");
  assert.equal(result.body.address, "");
});

test("장소 쪽이 없어도 넘어온 쪽에서 이름과 주소를 읽는다", async () => {
  const result = await withFetch([
    ["https://kko.kakao.com/Gone12", moved("https://map.kakao.com/?itemId=27546229")],
    ["https://map.kakao.com/", reply(kakaoPage("옹기식탁", "전북 전주시 완산구 은행로 12"))],
    [장소쪽, reply("", { status: 404 })],
  ], () => call({ url: "https://kko.kakao.com/Gone12" }, { ip: "10.1.0.10" }));
  assert.equal(result.code, 200);
  assert.equal(result.body.name, "옹기식탁");
  assert.equal(result.body.address, "전북 전주시 완산구 은행로 12");
});

test("카카오 밖으로 넘어가는 링크는 따라가지 않는다", async () => {
  const result = await withFetch([
    ["https://kko.kakao.com/Evil12", moved("https://evil.test/steal")],
  ], () => call({ url: "https://kko.kakao.com/Evil12" }, { ip: "10.1.0.5" }));
  assert.equal(result.code, 502);
  assert.deepEqual(result.body, { error: "place_lookup_failed" });
});

test("죽은 짧은 링크와 그물 오류는 502 다", async () => {
  const dead = await withFetch([
    ["https://kko.kakao.com/Dead12", reply("", { status: 404 })],
  ], () => call({ url: "https://kko.kakao.com/Dead12" }, { ip: "10.1.0.6" }));
  assert.equal(dead.code, 502);
  const timeout = await withFetch([
    ["https://kko.to/Slow12", () => { throw new Error("timeout"); }],
  ], () => call({ url: "https://kko.to/Slow12" }, { ip: "10.1.0.7" }));
  assert.equal(timeout.code, 502);
});

test("카카오를 사칭한 주소와 http 는 막는다", async () => {
  for (const url of [
    "https://map.kakao.com.evil.test/x",
    "https://evilkakao.com/x",
    "https://kko.to.evil.test/x",
    "http://kko.kakao.com/AbCdEf",
  ]) {
    const result = await call({ url }, { ip: "10.1.0.8" });
    assert.equal(result.code, 422, url);
  }
});

test("같은 링크를 다시 물으면 그물에 또 나가지 않는다", async () => {
  const calls = { count: 0 };
  const routes = [
    ["https://kko.kakao.com/Cache1", moved("https://map.kakao.com/?itemId=27546229")],
    ["https://map.kakao.com/", () => { calls.count += 1; return reply(kakaoPage("옹기식탁", "전북 전주시")); }],
    [장소쪽, reply(장소쪽글)],
  ];
  await withFetch(routes, () => call({ url: "https://kko.kakao.com/Cache1" }, { ip: "10.1.0.9" }));
  const again = await withFetch(routes, () => call({ url: "https://kko.kakao.com/Cache1" }, { ip: "10.1.0.9" }));
  assert.equal(calls.count, 1);
  assert.equal(again.body.name, "옹기식탁");
});
