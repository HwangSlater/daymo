import assert from "node:assert/strict";
import { test } from "node:test";

import { orderedProviders, parseSocialReturn, randomToken, socialStartPath, toBase64Url } from "./socialLogin.ts";

test("난수 바이트를 PKCE 가 허락하는 글자로만 옮긴다", () => {
  const token = randomToken(new Uint8Array([0, 63, 64, 255, 128, 62]));

  assert.equal(token, "A_A_A-");
  assert.ok(/^[A-Za-z0-9\-_]{64}$/.test(randomToken(new Uint8Array(64).map((_, i) => i * 7))));
});

test("challenge 는 = 없는 base64url 이다", () => {
  assert.equal(toBase64Url("ab+/cd=="), "ab-_cd");
});

test("시작 주소에 challenge 와 S256 을 싣는다", () => {
  const path = socialStartPath("kakao", { redirectUri: "daymo://oauth", state: "s".repeat(32), codeChallenge: "c".repeat(43) });

  assert.ok(path.startsWith("/v1/auth/oauth/kakao/start?"));
  const params = new URLSearchParams(path.split("?")[1]);
  assert.equal(params.get("redirectUri"), "daymo://oauth");
  assert.equal(params.get("codeChallengeMethod"), "S256");
});

test("돌아온 주소에서 loginCode 를 꺼낸다", () => {
  assert.deepEqual(parseSocialReturn("daymo://oauth?loginCode=abc&state=mine", "mine"), { kind: "code", loginCode: "abc" });
});

test("내가 연 로그인이 아니면 loginCode 가 있어도 쓰지 않는다", () => {
  assert.equal(parseSocialReturn("daymo://oauth?loginCode=abc&state=someone-else", "mine").kind, "failed");
  assert.equal(parseSocialReturn("daymo://oauth?loginCode=abc", "mine").kind, "failed");
});

test("취소와 실패를 가른다", () => {
  assert.deepEqual(parseSocialReturn("daymo://oauth?error=cancelled&state=mine", "mine"), { kind: "cancelled" });
  assert.equal(parseSocialReturn("daymo://oauth?error=failed&state=mine", "mine").kind, "failed");
});

test("서버가 켠 제공자만 정해진 순서로 보여 준다", () => {
  assert.deepEqual(orderedProviders(["apple", "kakao", "모르는-곳"]), ["kakao", "apple"]);
  assert.deepEqual(orderedProviders(null), []);
});
