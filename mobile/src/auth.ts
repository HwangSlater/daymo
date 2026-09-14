import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
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

type ApiEnvelope<T> = { data: T };
type ApiErrorEnvelope = { error?: { code?: string; message?: string; fields?: Record<string, string> } };

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & ApiErrorEnvelope;
    if (!response.ok) {
      throw new DaymoApiError(
        body.error?.message || "서버 요청을 처리하지 못했어요.",
        response.status,
        body.error?.code,
        body.error?.fields,
      );
    }
    return body.data;
  } catch (error) {
    if (error instanceof DaymoApiError) throw error;
    throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
  } finally {
    clearTimeout(timer);
  }
}

async function installationId() {
  const saved = await storage.get(installationKey);
  if (saved) return saved;
  const created = Crypto.randomUUID();
  await storage.set(installationKey, created);
  return created;
}

async function getMe(accessToken: string): Promise<AuthUser> {
  const me = await request<{ id: string; email: string; displayName: string }>("/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return { id: me.id, name: me.displayName, email: me.email };
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

export async function signUp(email: string, password: string, displayName: string) {
  await request<{ status: "accepted" }>("/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
}

export async function login(email: string, password: string) {
  const tokens = await request<SessionResponse>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      device: {
        installationId: await installationId(),
        platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown",
        appVersion: "0.1.0",
        deviceName: Platform.OS === "ios" ? "iPhone 또는 iPad" : Platform.OS === "android" ? "Android 기기" : "웹 브라우저",
      },
    }),
  });
  const user = await getMe(tokens.accessToken);
  await saveSession(tokens, user);
  return { user, endedDevices: tokens.endedDevices };
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
