import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNaverPlaceShare } from "./naverPlaceResolver.ts";

test("네이버 링크가 없으면 아무것도 읽지 않는다", () => {
  assert.equal(parseNaverPlaceShare("그냥 메모"), null);
  assert.equal(parseNaverPlaceShare("https://example.com/abc"), null);
});

test("공유 문구에서 이름과 주소, 링크를 갈라 읽는다", () => {
  const shared = [
    "[네이버 지도]",
    "옹기식탁",
    "전북 전주시 완산구 은행로 12",
    "https://naver.me/xAbCdEf",
  ].join("\n");
  assert.deepEqual(parseNaverPlaceShare(shared), {
    name: "옹기식탁",
    address: "전북 전주시 완산구 은행로 12",
    url: "https://naver.me/xAbCdEf",
  });
});

test("링크만 있으면 주소 안의 검색어를 이름으로 쓴다", () => {
  const result = parseNaverPlaceShare("https://map.naver.com/p/search/전주%20한옥마을");
  assert.equal(result?.name, "전주 한옥마을");
  assert.equal(result?.address, "");
});

test("링크만 있고 검색어도 없으면 이름이 빈다", () => {
  const result = parseNaverPlaceShare("https://naver.me/abc123");
  assert.equal(result?.name, "");
  assert.equal(result?.url, "https://naver.me/abc123");
});
