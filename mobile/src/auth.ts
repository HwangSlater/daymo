import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import {
  orderedProviders,
  parseSocialReturn,
  randomToken,
  type SocialProvider,
  type SocialPurpose,
  socialStartPath,
  socialWindowBlockedMessage,
  toBase64Url,
  webSocialRedirectUri,
} from "./socialLogin";

// 웹 OAuth 복귀 창에서 원래 창에 결과를 전달한다. 서체·세션 복구를 기다리지 않는다.
if (Platform.OS === "web" && typeof window !== "undefined" && window.location.pathname === "/oauth") {
  WebBrowser.maybeCompleteAuthSession();
}

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  /** 삭제를 요청해 둔 계정이면 지워질 시각(ISO). 앱은 이때 삭제 취소 화면부터 보여 준다. */
  deletionScheduledAt?: string | null;
  /** 비밀번호가 있는지. 없으면 계정 삭제 같은 확인을 연결된 소셜 로그인으로 한다. 모르면 있는 것으로 본다. */
  hasPassword?: boolean;
  linkedProviders?: SocialProvider[];
};

/** 민감한 작업 전의 확인. 비밀번호, 또는 연결된 제공자로 다시 로그인. */
export type Reconfirm = { password: string } | { provider: SocialProvider };

/** `DELETE /v1/me` 와 삭제 취소가 돌려주는 값. */
export type AccountDeletionState = {
  requestedAt: string | null;
  scheduledAt: string | null;
};

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  deviceId: string;
  user: AuthUser;
};

type SessionResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  deviceId: string;
  endedDevices: { displayName: string | null; lastSeenAt: string }[];
};

type ApiEnvelope<T> = { data: T; meta?: ApiMeta };
/** 목록 봉투의 meta. `nextCursor` 가 있으면 그 값으로 다음 쪽을 이어 받는다. */
type ApiMeta = { nextCursor?: string | null };

/** 목록 한 쪽. 서버가 준 줄과, 더 있으면 다음 쪽을 가리키는 cursor. */
export type ServerPage<T> = { items: T[]; nextCursor: string | null };
type ApiErrorEnvelope = {
  error?: { code?: string; message?: string; fields?: Record<string, string>; details?: Record<string, string> };
};

const sessionKey = "daymo.auth.session.v1";
const installationKey = "daymo.auth.installation.v1";
const defaultApiUrl = "https://api.daymo.xyz";

const apiUrl = (process.env.EXPO_PUBLIC_DAYMO_API_URL || defaultApiUrl).replace(/\/$/, "");

export class DaymoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "NETWORK_ERROR",
    readonly fields?: Record<string, string>,
    /** 다음 단계에 필요한 값. 지금은 ACCOUNT_LINK_REQUIRED 의 linkToken 뿐이다. */
    readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

const storage = {
  async get(key: string) {
    return Platform.OS === "web"
      ? AsyncStorage.getItem(key)
      : SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === "web") return AsyncStorage.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};

async function requestEnvelope<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      signal: controller.signal,
    });
    if (response.status === 204) return { data: undefined as T };
    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & ApiErrorEnvelope;
    if (!response.ok) {
      throw new DaymoApiError(
        body.error?.message || "서버 요청을 처리하지 못했어요.",
        response.status,
        body.error?.code,
        body.error?.fields,
        body.error?.details,
      );
    }
    return body;
  } catch (error) {
    if (error instanceof DaymoApiError) throw error;
    throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await requestEnvelope<T>(path, init)).data;
}

async function installationId() {
  const saved = await storage.get(installationKey);
  if (saved) return saved;
  const created = Crypto.randomUUID();
  await storage.set(installationKey, created);
  return created;
}

async function getMe(accessToken: string): Promise<AuthUser> {
  const me = await request<{
    id: string;
    email: string;
    displayName: string;
    deletionScheduledAt?: string | null;
    hasPassword?: boolean;
    linkedProviders?: string[];
  }>("/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return {
    id: me.id,
    name: me.displayName,
    email: me.email,
    deletionScheduledAt: me.deletionScheduledAt ?? null,
    hasPassword: me.hasPassword ?? true,
    linkedProviders: orderedProviders(me.linkedProviders ?? []),
  };
}

async function saveSession(tokens: SessionResponse, user: AuthUser) {
  const session: SessionTokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
    deviceId: tokens.deviceId,
    user,
  };
  await storage.set(sessionKey, JSON.stringify(session));
  return session;
}

let refreshInFlight: Promise<SessionTokens> | null = null;

async function refreshStoredSession(saved: SessionTokens) {
  if (!refreshInFlight) {
    refreshInFlight = request<SessionResponse>("/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: saved.refreshToken }),
    })
      .then((tokens) => saveSession(tokens, saved.user))
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function parseSession(raw: string | null): SessionTokens | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SessionTokens>;
    if (
      typeof value.accessToken !== "string" ||
      typeof value.refreshToken !== "string" ||
      typeof value.deviceId !== "string" ||
      typeof value.user?.id !== "string" ||
      typeof value.user.name !== "string" ||
      typeof value.user.email !== "string"
    ) return null;
    return value as SessionTokens;
  } catch {
    return null;
  }
}

/**
 * 지금 게시한 이용약관·개인정보 처리방침의 판(시행일). 서버(backend/app/services/accounts.py 의
 * TERMS_VERSION)와 같아야 가입된다. 약관을 바꾸면 사이트·서버·앱을 함께 올린다.
 */
export const TERMS_VERSION = "2026-09-15";
export const TERMS_URL = "https://www.daymo.xyz/terms";
export const PRIVACY_URL = "https://www.daymo.xyz/privacy";

/** 가입 화면에서 약관·처리방침에 동의하고 만 14세 이상임을 확인했다는 표시. */
const consent = { agreedTermsVersion: TERMS_VERSION, ageConfirmed: true };

export async function signUp(email: string, password: string, displayName: string) {
  await request<{ status: "accepted" }>("/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName, ...consent }),
  });
}

/**
 * 비밀번호 재설정 메일을 요청한다. 계정이 없어도 서버는 같은 답을 준다.
 * 메일의 링크는 브라우저에서 새 비밀번호를 정하는 페이지를 연다.
 */
export async function requestPasswordReset(email: string) {
  await request<{ status: "accepted" }>("/v1/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

async function deviceInfo() {
  return {
    installationId: await installationId(),
    platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown",
    appVersion: "0.1.0",
    deviceName: Platform.OS === "ios" ? "iPhone 또는 iPad" : Platform.OS === "android" ? "Android 기기" : "웹 브라우저",
  };
}

async function signIn(path: string, body: Record<string, unknown>) {
  const tokens = await request<SessionResponse>(path, {
    method: "POST",
    body: JSON.stringify({ ...body, device: await deviceInfo() }),
  });
  const user = await getMe(tokens.accessToken);
  await saveSession(tokens, user);
  return { user, endedDevices: tokens.endedDevices };
}

export async function login(email: string, password: string) {
  return signIn("/v1/auth/login", { email, password });
}

/**
 * 서버에 키가 들어가 켜진 소셜 로그인 제공자.
 *
 * 앱은 여기 있는 버튼만 보여 준다. 눌러도 되지 않는 버튼은 스토어 심사에서
 * 반려 사유다. 웹도 같은 서버 목록을 쓰고 웹 주소로 돌아온다.
 * 서버에 닿지 않으면 빈 목록이다. 이메일 로그인은 그대로 된다.
 */
export async function socialProviders(): Promise<SocialProvider[]> {
  try {
    const data = await request<{ providers: unknown }>("/v1/auth/oauth/providers");
    return orderedProviders(data.providers);
  } catch {
    return [];
  }
}

export type SocialLoginResult =
  | { kind: "signedIn"; user: AuthUser; endedDevices: SessionResponse["endedDevices"] }
  | { kind: "linkRequired"; linkToken: string }
  | { kind: "cancelled" };

/**
 * 시스템 브라우저로 제공자 로그인을 열고, 돌아오면 세션을 받는다.
 *
 * 같은 이메일로 가입한 계정이 이미 있으면 서버가 합치지 않고 연결 토큰을 준다.
 * 그 계정의 비밀번호를 받아 linkSocialAccount 로 넘긴다.
 */
export async function socialLogin(provider: SocialProvider): Promise<SocialLoginResult> {
  const back = await openSocialLogin(provider);
  if (back.kind === "cancelled") return back;

  try {
    // 처음이면 이 로그인으로 계정이 생긴다. 소셜 버튼 아래의 동의 문구를 보고 누른 것이다.
    const signedIn = await signIn("/v1/auth/oauth/exchange", { loginCode: back.loginCode, codeVerifier: back.verifier, ...consent });
    return { kind: "signedIn", ...signedIn };
  } catch (error) {
    if (error instanceof DaymoApiError && error.code === "ACCOUNT_LINK_REQUIRED" && error.details?.linkToken) {
      return { kind: "linkRequired", linkToken: error.details.linkToken };
    }
    throw error;
  }
}

/** 웹에서 제공자 창이 열리지 않았을 때. 팝업 차단 말고는 거의 이유가 없다. */
const popupBlocked = (purpose: SocialPurpose) =>
  new DaymoApiError(socialWindowBlockedMessage(purpose), 0, "OAUTH_POPUP_BLOCKED");

/**
 * 제공자 로그인 창을 열고 돌아온 loginCode 와 그 짝인 verifier 를 받는다. 세션은 받지 않는다.
 *
 * 로그인과 재확인(`reauthProof`)이 같은 길을 쓴다. 웹에서는 둘 다 팝업으로 열고
 * 같은 출처의 `/oauth` 로 돌아온다. `purpose` 는 막혔을 때의 안내 문구만 가른다.
 *
 * 브라우저는 사용자가 누른 직후에만 창을 열어 준다. 그래서 부르는 쪽은 누른 그 자리에서
 * 이 함수까지 기다리지 않고 내려와야 한다(중간에 await 를 끼우면 창이 막힌다).
 */
async function openSocialLogin(
  provider: SocialProvider,
  purpose: SocialPurpose = "login",
): Promise<{ kind: "code"; loginCode: string; verifier: string } | { kind: "cancelled" }> {
  // Expo Go 에서는 exp://.../--/oauth 가 된다. 서버의 OAUTH_APP_REDIRECT_URIS 에 있어야 한다.
  const redirectUri = Platform.OS === "web"
    ? webSocialRedirectUri(window.location.href)
    : AuthSession.makeRedirectUri({ scheme: "daymo", path: "oauth" });
  // 난수 해시를 await하기 전에 사용자 클릭으로 창을 확보한다. 모바일 Safari의
  // 팝업 차단을 피하고 Expo가 같은 이름의 창을 재사용하게 한다.
  const popupName = "daymo-oauth";
  const popup = Platform.OS === "web" ? window.open("about:blank", popupName, "popup,width=500,height=720") : null;
  if (Platform.OS === "web" && !popup) throw popupBlocked(purpose);
  try {
    const state = randomToken(Crypto.getRandomBytes(32));
    const verifier = randomToken(Crypto.getRandomBytes(64));
    const challenge = toBase64Url(
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: Crypto.CryptoEncoding.BASE64,
      }),
    );

    let result: WebBrowser.WebBrowserAuthSessionResult;
    try {
      result = await WebBrowser.openAuthSessionAsync(
        `${apiUrl}${socialStartPath(provider, { redirectUri, state, codeChallenge: challenge })}`,
        redirectUri,
        Platform.OS === "web" ? { windowName: popupName } : undefined,
      );
    } catch (error) {
      // 위에서 확보한 창을 사용자가 먼저 닫으면, Expo 가 클릭과 멀어진 자리에서
      // 창을 다시 열다 막힌다(ERR_WEB_BROWSER_BLOCKED). 같은 안내로 모은다.
      if (Platform.OS === "web") throw popupBlocked(purpose);
      throw error;
    }
    if (result.type !== "success") return { kind: "cancelled" };

    const back = parseSocialReturn(result.url, state);
    if (back.kind === "cancelled") return back;
    if (back.kind === "failed") throw new DaymoApiError(back.message, 0, "OAUTH_FAILED");
    return { kind: "code", loginCode: back.loginCode, verifier };
  } finally {
    popup?.close();
  }
}

class ReconfirmCancelled extends Error {}

/** 사용자가 제공자 창을 닫았는지. 이때는 오류 문구를 띄우지 않는다. */
export const isReconfirmCancelled = (error: unknown) => error instanceof ReconfirmCancelled;

/** 같은 이메일의 기존 계정 비밀번호로 확인하고, 소셜 로그인을 붙인 뒤 로그인한다. */
export async function linkSocialAccount(linkToken: string, password: string) {
  return signIn("/v1/auth/oauth/link", { linkToken, password });
}

export async function restoreSession(): Promise<{ user: AuthUser; offline: boolean } | null> {
  const saved = parseSession(await storage.get(sessionKey));
  if (!saved) return null;
  try {
    const tokens = await request<SessionResponse>("/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: saved.refreshToken }),
    });
    const user = await getMe(tokens.accessToken);
    await saveSession(tokens, user);
    return { user, offline: false };
  } catch (error) {
    if (error instanceof DaymoApiError && error.status === 0) {
      return { user: saved.user, offline: true };
    }
    await storage.remove(sessionKey);
    return null;
  }
}

/**
 * 서버에 있는 내 정보를 다시 받아 화면과 저장해 둔 세션을 맞춘다.
 *
 * 이메일은 새 주소로 간 링크를 눌러야 바뀐다. 그 링크는 메일함이 있는 다른 기기에서
 * 눌릴 수도 있어서, 열어 둔 앱은 스스로 알아차리지 못하고 옛 주소를 계속 보여 준다.
 * 계정 화면을 열 때처럼 알맞은 때에 불러 준다.
 *
 * 값을 읽기만 하므로 실패는 그냥 넘긴다(연결이 없거나 로그인이 풀린 때). 그때는
 * null 이고, 부르는 쪽은 지금 보고 있는 것을 그대로 둔다.
 */
export async function refreshMe(): Promise<AuthUser | null> {
  try {
    const user = await withAccessToken(getMe);
    const saved = parseSession(await storage.get(sessionKey));
    if (saved) await storage.set(sessionKey, JSON.stringify({ ...saved, user }));
    return user;
  } catch {
    return null;
  }
}

export async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return withAccessToken((accessToken) => request<T>(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  }));
}

/**
 * 목록을 쪽 단위로 받는다. 줄과 함께 다음 쪽 cursor 도 돌려준다.
 *
 * 보통의 `authenticatedRequest` 는 봉투의 `data` 만 꺼내고 `meta` 를 버린다. 목록을
 * 이어 받으려면 `meta.nextCursor` 가 필요해서 이 길을 따로 둔다.
 */
export async function authenticatedPage<T>(path: string, init: RequestInit = {}): Promise<ServerPage<T>> {
  const 봉투 = await withAccessToken((accessToken) => requestEnvelope<T[]>(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  }));
  return { items: 봉투.data ?? [], nextCursor: 봉투.meta?.nextCursor ?? null };
}

/** API 주소 앞부분. 사진 파일처럼 JSON 이 아닌 요청이 쓴다. */
export const apiUrlOf = (path: string) => `${apiUrl}${path}`;

/**
 * 저장된 세션의 access token 으로 `send` 를 부른다. 401 이면 한 번 갱신하고 다시 부른다.
 *
 * 사진 올리기·받기처럼 `fetch` 가 아닌 길로 보내는 요청도 같은 갱신 규칙을 쓰게 꺼냈다.
 * `send` 는 401 을 `DaymoApiError` 로 던져야 한다.
 */
export async function withAccessToken<T>(send: (accessToken: string) => Promise<T>): Promise<T> {
  const saved = parseSession(await storage.get(sessionKey));
  if (!saved) throw new DaymoApiError("다시 로그인해 주세요.", 401, "UNAUTHENTICATED");

  try {
    return await send(saved.accessToken);
  } catch (error) {
    if (!(error instanceof DaymoApiError) || error.status !== 401) throw error;
  }

  // 갱신이 거절됐을 때만 로그인을 푼다. 갱신 뒤 요청이 422 같은 이유로 실패한 것은
  // 세션 문제가 아니다. 예전에는 그때도 로그인이 풀렸다.
  let refreshed: SessionTokens;
  try {
    refreshed = await refreshStoredSession(saved);
  } catch (error) {
    if (!(error instanceof DaymoApiError) || error.status !== 0) {
      await storage.remove(sessionKey);
    }
    throw error;
  }
  return send(refreshed.accessToken);
}

/**
 * 민감한 작업 하나에 쓸 증표를 받는다. 작업마다 비밀번호를 다시 받는다.
 *
 * 비밀번호가 틀리면 서버는 403 을 준다. 401 이 아니라서 위의 토큰 갱신이
 * 끼어들지 않고, 로그인도 풀리지 않는다.
 *
 * 제공자로 확인할 때는 창부터 연다. 웹에서는 이 첫 줄이 사용자가 누른 그 순간에
 * 돌아야 팝업이 열리므로, 부르는 쪽도 그 앞에 await 를 두지 않는다.
 */
async function reauthProof(
  action: "delete_account" | "cancel_deletion" | "change_password" | "change_email",
  confirm: Reconfirm,
) {
  if ("provider" in confirm) {
    // 비밀번호가 없는 계정. 연결된 제공자로 다시 로그인한 결과로 확인받는다.
    // 웹도 같다. 같은 출처의 /oauth 로 돌아온 loginCode 를 그대로 서버에 낸다.
    const back = await openSocialLogin(confirm.provider, "reauth");
    if (back.kind === "cancelled") throw new ReconfirmCancelled();
    const { proof } = await authenticatedRequest<{ proof: string }>("/v1/auth/oauth/reauth", {
      method: "POST",
      body: JSON.stringify({ action, loginCode: back.loginCode, codeVerifier: back.verifier }),
    });
    return proof;
  }
  const { proof } = await authenticatedRequest<{ proof: string }>("/v1/auth/reauth", {
    method: "POST",
    body: JSON.stringify({ action, password: confirm.password }),
  });
  return proof;
}

/**
 * 계정 삭제를 요청한다. 7일 뒤에 지워지고, 그 전에 다시 로그인하면 취소할 수 있다.
 *
 * 서버가 이 기기를 포함한 모든 기기를 로그아웃시키므로, 성공하면 저장해 둔
 * 토큰도 지운다. 남겨 두면 다음 실행에 갱신을 시도하다 실패할 뿐이다.
 */
export async function requestAccountDeletion(confirm: Reconfirm) {
  const proof = await reauthProof("delete_account", confirm);
  const state = await authenticatedRequest<AccountDeletionState>("/v1/me", {
    method: "DELETE",
    body: JSON.stringify({ reauthProof: proof }),
  });
  await storage.remove(sessionKey);
  return state;
}

/**
 * 표시 이름을 서버에 저장한다. 같은 공간 멤버에게 이 이름이 보인다.
 *
 * 저장해 둔 세션의 사용자 이름도 바꾼다. 연결 없이 앱을 다시 열어도 새 이름이다.
 */
export async function updateDisplayName(name: string) {
  const me = await authenticatedRequest<{ displayName: string }>("/v1/me", {
    method: "PATCH",
    body: JSON.stringify({ displayName: name }),
  });
  const saved = parseSession(await storage.get(sessionKey));
  if (saved) {
    await storage.set(sessionKey, JSON.stringify({ ...saved, user: { ...saved.user, name: me.displayName } }));
  }
  return me.displayName;
}

/**
 * 비밀번호를 바꾼다. 비밀번호가 없는(소셜 로그인으로만 가입한) 계정은 여기서 처음 정한다.
 *
 * 서버가 이 기기만 남기고 다른 기기를 모두 로그아웃시킨다. 이 기기의 세션은 그대로라
 * 저장한 토큰을 건드리지 않고, 이제 비밀번호가 있다는 것만 적어 둔다.
 */
export async function changePassword(confirm: Reconfirm, newPassword: string) {
  const proof = await reauthProof("change_password", confirm);
  await authenticatedRequest<{ status: "changed" }>("/v1/me/password", {
    method: "POST",
    body: JSON.stringify({ reauthProof: proof, newPassword }),
  });
  const saved = parseSession(await storage.get(sessionKey));
  if (saved) {
    await storage.set(sessionKey, JSON.stringify({ ...saved, user: { ...saved.user, hasPassword: true } }));
  }
}

/**
 * 새 주소로 이메일 변경 확인 메일을 보낸다. 링크를 누르기 전에는 바뀌지 않는다.
 *
 * 새 주소에 이미 계정이 있어도 서버는 같은 답을 준다. 바뀐 주소는 `refreshMe` 로 받는다.
 * 링크를 누른 뒤 앱이 다시 앞으로 오거나 계정 화면을 열면 화면도 새 주소가 된다.
 */
export async function requestEmailChange(confirm: Reconfirm, newEmail: string) {
  const proof = await reauthProof("change_email", confirm);
  await authenticatedRequest<{ status: "accepted" }>("/v1/me/email", {
    method: "POST",
    body: JSON.stringify({ reauthProof: proof, newEmail }),
  });
}

/** 유예 중인 계정 삭제를 취소한다. 삭제 요청과 따로 비밀번호를 다시 받는다. */
export async function cancelAccountDeletion(confirm: Reconfirm) {
  const proof = await reauthProof("cancel_deletion", confirm);
  const state = await authenticatedRequest<AccountDeletionState>("/v1/me/deletion/cancel", {
    method: "POST",
    body: JSON.stringify({ reauthProof: proof }),
  });
  const saved = parseSession(await storage.get(sessionKey));
  if (saved) {
    await storage.set(sessionKey, JSON.stringify({ ...saved, user: { ...saved.user, deletionScheduledAt: null } }));
  }
  return state;
}

export async function logout() {
  const saved = parseSession(await storage.get(sessionKey));
  if (saved) {
    await request<void>("/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: saved.refreshToken }),
    }).catch(() => {});
  }
  await storage.remove(sessionKey);
}
