import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { AppearanceMode, ThemeId, themeOptions } from "./theme";

// 이 기기에만 남는 개인 설정이다. 여행, 준비물, 멤버처럼 함께 보는 값은 서버가
// 원본이므로 여기에 넣지 않는다. docs/development/07-local-first-and-sync.md 2장.

/** 여행 공간. 값 목록을 저장할 때도 확인해야 해서 저장소 쪽에 함께 둔다. */
export const groupIds = ["ours", "friends", "family"] as const;
export type GroupId = (typeof groupIds)[number];

export type DeviceSettings = {
  themeId: ThemeId;
  appearance: AppearanceMode;
  activeGroupId: GroupId;
  since: string;
};

/** 저장된 값이 없거나 쓸 수 없을 때의 값. 첫 실행 화면은 이 값으로 그린다. */
export const defaultDeviceSettings: DeviceSettings = {
  themeId: "indigo",
  appearance: "system",
  activeGroupId: "friends",
  since: "2023. 10. 20",
};

const storageKey = "daymo.device-settings.v1";
// 시작일은 글자를 칠 때마다 바뀐다. 잠깐 모았다가 한 번만 쓴다.
const writeDelay = 400;
const appearanceModes: readonly AppearanceMode[] = ["system", "light", "dark"];
const themeIds: readonly ThemeId[] = themeOptions.map((option) => option.id);

// 저장된 문자열을 그대로 믿지 않는다. 없어진 테마 이름이 남아 있거나 다른 버전이
// 쓴 값이 들어 있을 수 있으므로, 목록에 없으면 기본값으로 되돌린다.
const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

// 시작일은 사용자가 직접 쓰는 자유 문구라 목록으로 확인할 수 없다. 화면을 망가뜨리지
// 않을 길이의 문자열인지만 본다.
const shortText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 40
    ? value
    : fallback;

function parseSettings(raw: string | null): DeviceSettings {
  if (!raw) return defaultDeviceSettings;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return defaultDeviceSettings;
  }
  if (!saved || typeof saved !== "object") return defaultDeviceSettings;
  const record = saved as Record<string, unknown>;
  return {
    themeId: oneOf(record.themeId, themeIds, defaultDeviceSettings.themeId),
    appearance: oneOf(record.appearance, appearanceModes, defaultDeviceSettings.appearance),
    activeGroupId: oneOf(record.activeGroupId, groupIds, defaultDeviceSettings.activeGroupId),
    since: shortText(record.since, defaultDeviceSettings.since),
  };
}

/**
 * 저장된 설정을 한 번 읽는다. 다 읽기 전에는 `null`을 돌려주고 호출한 쪽은 그동안
 * 실행 화면을 그대로 둔다. 기본 테마로 먼저 그렸다가 저장된 테마로 바꾸면 화면이 튄다.
 * 저장소를 열지 못하면 조용히 기본값으로 간다.
 */
export function useStoredSettings(): DeviceSettings | null {
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  useEffect(() => {
    let alive = true;
    const done = (value: DeviceSettings) => {
      if (alive) setSettings(value);
    };
    AsyncStorage.getItem(storageKey)
      .then((raw) => done(parseSettings(raw)))
      .catch(() => done(defaultDeviceSettings));
    return () => {
      alive = false;
    };
  }, []);
  return settings;
}

/** 값이 바뀔 때만 저장한다. 실패해도 알리지 않고 다음 변경에서 다시 쓴다. */
export function useSaveSettings(settings: DeviceSettings) {
  const { themeId, appearance, activeGroupId, since } = settings;
  const written = useRef(false);
  useEffect(() => {
    // 첫 실행은 방금 읽어온 값을 그대로 되쓰는 것뿐이라 건너뛴다.
    if (!written.current) {
      written.current = true;
      return;
    }
    const timer = setTimeout(() => {
      const value = JSON.stringify({ themeId, appearance, activeGroupId, since });
      AsyncStorage.setItem(storageKey, value).catch(() => {});
    }, writeDelay);
    return () => clearTimeout(timer);
  }, [themeId, appearance, activeGroupId, since]);
}
