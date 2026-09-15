// 소셜 로그인에서 화면과 네트워크를 뺀 부분. node --test 로 돌릴 수 있게
// react-native 를 들이지 않는다. 흐름은 src/auth.ts 의 socialLogin 이 쓴다.
//
// 서버가 정한 흐름(docs/development/03-api-specification.md 2장):
//   1. 앱이 state 와 PKCE verifier 를 만들고, challenge 만 서버에 준다.
//   2. 서버가 제공자 로그인을 마치면 daymo://oauth?loginCode=...&state=... 로 돌려보낸다.
//   3. 앱은 state 가 자기가 만든 것인지 보고, loginCode 와 verifier 로 세션을 받는다.
// 토큰은 주소에 실리지 않는다. 주소를 가로챈 쪽은 verifier 가 없어 loginCode 를 쓸 수 없다.

export type SocialProvider = "kakao" | "naver" | "google" | "apple";

/** 버튼을 늘어놓는 순서. 서버가 켠 것만 이 순서로 보여 준다. */
export const socialProviderOrder: readonly SocialProvider[] = ["kakao", "naver", "google", "apple"];

export const socialProviderName: Record<SocialProvider, string> = {
  kakao: "카카오",
  naver: "네이버",
  google: "Google",
  apple: "Apple",
};

// RFC 7636 이 허락하는 글자 중 64자. 256 을 64 로 나누면 딱 떨어져서 바이트를
// 그대로 한 글자로 옮겨도 어느 글자가 더 자주 나오지 않는다.
const urlSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 난수 바이트를 PKCE verifier·state 에 쓸 글자로 옮긴다. */
export function randomToken(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += urlSafe[byte % 64];
  return out;
}

/** 표준 base64 를 주소에 실을 수 있는 base64url 로 바꾼다. challenge 에 쓴다. */
export function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function socialStartPath(
  provider: SocialProvider,
  params: { redirectUri: string; state: string; codeChallenge: string },
): string {
  const query = new URLSearchParams({
    redirectUri: params.redirectUri,
    state: params.state,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: "S256",
  });
  return `/v1/auth/oauth/${provider}/start?${query.toString()}`;
}

/** 앱을 어느 경로에서 열었든 같은 출처의 OAuth 복귀 페이지를 쓴다. */
export function webSocialRedirectUri(pageUrl: string): string {
  return new URL("/oauth", pageUrl).href;
}

export type SocialReturn =
  | { kind: "code"; loginCode: string }
  | { kind: "cancelled" }
  | { kind: "failed"; message: string };

const failedMessage = "소셜 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * 로그인 창에서 돌아온 주소를 읽는다.
 *
 * state 가 우리가 만든 것과 다르면 버린다. 다른 앱이나 페이지가 daymo:// 주소를
 * 열어 남의 loginCode 를 밀어 넣는 것을 막는다.
 */
export function parseSocialReturn(url: string, expectedState: string): SocialReturn {
  const queryStart = url.indexOf("?");
  const params = new URLSearchParams(queryStart >= 0 ? url.slice(queryStart + 1).split("#")[0] : "");
  if (params.get("state") !== expectedState) return { kind: "failed", message: failedMessage };
  const error = params.get("error");
  if (error === "cancelled") return { kind: "cancelled" };
  if (error) return { kind: "failed", message: failedMessage };
  const loginCode = params.get("loginCode");
  if (!loginCode) return { kind: "failed", message: failedMessage };
  return { kind: "code", loginCode };
}

/** 서버가 준 목록에서 아는 제공자만 정해진 순서로 남긴다. */
export function orderedProviders(fromServer: unknown): SocialProvider[] {
  if (!Array.isArray(fromServer)) return [];
  return socialProviderOrder.filter((provider) => fromServer.includes(provider));
}
