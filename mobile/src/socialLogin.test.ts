import assert from "node:assert/strict";
import { test } from "node:test";

import { orderedProviders, parseSocialReturn, randomToken, socialStartPath, socialWindowBlockedMessage, toBase64Url, webSocialRedirectUri } from "./socialLogin.ts";

test("웹 복귀 주소는 앱 경로와 쿼리 대신 같은 출처의 고정 페이지를 쓴다", () => {
  assert.equal(webSocialRedirectUri("https://www.daymo.xyz/app/?next=trip#home"), "https://www.daymo.xyz/oauth");
  assert.equal(webSocialRedirectUri("http://localhost:8081/app"), "http://localhost:8081/oauth");
});

test("웹 복귀 주소는 서버가 허락한 주소 그대로다", () => {
  // 계정 삭제·비밀번호 정하기·이메일 바꾸기 앞의 재확인도 로그인과 같은 길을 쓴다.
  // 어느 화면에서 눌렀든 서버의 OAUTH_APP_REDIRECT_URIS 에 있는 주소여야 시작된다.
  const 허용 = ["daymo://oauth", "https://www.daymo.xyz/oauth", "https://daymo.xyz/oauth"];
  assert.ok(허용.includes(webSocialRedirectUri("https://www.daymo.xyz/app?panel=account")));
  assert.ok(허용.includes(webSocialRedirectUri("https://daymo.xyz/app#account")));
});

test("팝업이 막히면 무엇이 막혔는지 말해 준다", () => {
  assert.ok(socialWindowBlockedMessage("login").startsWith("로그인 창이 차단됐어요"));
  assert.ok(socialWindowBlockedMessage("reauth").startsWith("확인 창이 차단됐어요"));
  assert.ok(socialWindowBlockedMessage("reauth").includes("팝업을 허용"));
});

test("웹 복귀도 state가 맞아야 일회용 코드를 쓸 수 있다", () => {
  assert.deepEqual(parseSocialReturn("https://www.daymo.xyz/oauth?loginCode=abc&state=mine", "mine"), { kind: "code", loginCode: "abc" });
  assert.equal(parseSocialReturn("https://www.daymo.xyz/oauth?loginCode=abc&state=other", "mine").kind, "failed");
});

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
