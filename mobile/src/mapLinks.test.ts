import assert from "node:assert/strict";
import { test } from "node:test";

import { kakaoMapSearchUrl, mapProviderOf, naverMapSearchUrl } from "./mapLinks.ts";

test("호스트로 지도 제공사를 가른다", () => {
  assert.equal(mapProviderOf("https://map.naver.com/p/search/달빛한옥"), "naver");
  assert.equal(mapProviderOf("https://m.map.naver.com/x"), "naver");
  assert.equal(mapProviderOf("https://naver.me/abc"), "naver");
  assert.equal(mapProviderOf("https://place.map.kakao.com/12345"), "kakao");
  assert.equal(mapProviderOf("https://map.kakao.com/link/map/12345"), "kakao");
  assert.equal(mapProviderOf("https://kko.kakao.com/AbC"), "kakao");
  assert.equal(mapProviderOf("HTTPS://KKO.TO/abc"), "kakao");
});

test("비슷하게 생긴 다른 주소는 제공사로 치지 않는다", () => {
  assert.equal(mapProviderOf("https://map.kakao.com.example.com/x"), "other");
  assert.equal(mapProviderOf("https://notnaver.me/x"), "other");
  assert.equal(mapProviderOf("https://example.com/?u=map.naver.com"), "other");
  assert.equal(mapProviderOf("map.naver.com/x"), "other");
  assert.equal(mapProviderOf(""), "other");
});

test("검색 링크는 검색어가 없으면 지도 첫 화면으로 간다", () => {
  assert.equal(naverMapSearchUrl(" 전주 한옥마을 "), "https://map.naver.com/p/search/%EC%A0%84%EC%A3%BC%20%ED%95%9C%EC%98%A5%EB%A7%88%EC%9D%84");
  assert.equal(kakaoMapSearchUrl("소나기식당"), `https://map.kakao.com/?q=${encodeURIComponent("소나기식당")}`);
  assert.equal(naverMapSearchUrl("  "), "https://map.naver.com/");
  assert.equal(kakaoMapSearchUrl(""), "https://map.kakao.com/");
});
