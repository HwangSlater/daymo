/**
 * 로그인한 기기 목록의 글자를 만드는 곳.
 *
 * 서버는 `GET /v1/auth/sessions` 로 기기를 마지막 사용 시각 순으로 준다. 여기서는
 * 그 한 줄을 사람이 읽는 말로 바꾸기만 한다. 부르는 일은 `serverData.ts`, 그리는 일은
 * `WarmAppShell.tsx` 가 한다.
 *
 * 기기가 한도를 넘으면 서버가 가장 오래 쓰지 않은 기기를 말없이 끊는다. 끊긴 뒤에야
 * 알면 늦어서, 한도에 가까워지면 미리 알려 주는 글도 여기서 만든다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { dateKey, 두자리 } from "./dates.ts";

/** `GET /v1/auth/sessions` 한 줄. 서버의 `DeviceOut` 과 같은 모양이다. */
export type ServerDevice = {
  id: string;
  displayName: string | null;
  platform: "ios" | "android" | "unknown";
  appVersion: string | null;
  lastSeenAt: string;
  /** 지금 이 기기면 참. 끊으면 로그아웃과 같다. */
  current: boolean;
};

/**
 * 한 계정이 동시에 들고 있을 수 있는 기기 수.
 *
 * 서버의 `app/services/auth_sessions.py` 의 `MAX_DEVICES` 와 같아야 한다. 서버가 줄이면
 * 여기도 줄인다. 안내만 하는 값이라 어긋나도 로그인은 되지만 안내가 틀리게 된다.
 */
export const MAX_DEVICES = 5;

/** 기기 이름. 서버가 이름을 못 받았으면 어떤 판인지로 대신한다. */
export function deviceName(device: Pick<ServerDevice, "displayName" | "platform">): string {
  const 이름 = device.displayName?.trim();
  if (이름) return 이름;
  if (device.platform === "ios") return "iPhone 또는 iPad";
  if (device.platform === "android") return "Android 기기";
  return "웹 브라우저";
}


/**
 * 마지막으로 쓴 때. `오늘 10:42`, `어제 22:15`, 그보다 전이면 `9월 12일`.
 *
 * 메모의 `memoStamp` 와 같은 말투다. 읽을 수 없는 값이면 빈 글자를 준다.
 */
export function lastSeenLabel(at: string, now: Date = new Date()): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  const 오늘 = dateKey(now);
  const 어제 = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
  const 시각 = `${두자리(when.getHours())}:${두자리(when.getMinutes())}`;
  if (dateKey(when) === 오늘) return `오늘 ${시각}`;
  if (dateKey(when) === 어제) return `어제 ${시각}`;
  return `${when.getMonth() + 1}월 ${when.getDate()}일`;
}

/** 목록에 보일 한 줄. `웹 브라우저 · 오늘 10:42`, 지금 쓰는 기기면 `· 지금 이 기기` 가 붙는다. */
export function deviceLine(device: ServerDevice, now: Date = new Date()): string {
  const 조각 = [deviceName(device)];
  const 시각 = lastSeenLabel(device.lastSeenAt, now);
  if (시각) 조각.push(시각);
  if (device.current) 조각.push("지금 이 기기");
  return 조각.join(" · ");
}

/**
 * 한도에 가까울 때 보여 줄 안내. 여유가 있으면 빈 글자를 준다.
 *
 * 웹(사파리)·웹(크롬)·폰을 오가면 금방 차는데, 지금은 넘긴 뒤에야 한 번 알려 준다.
 * 차기 전에 쓰지 않는 기기를 스스로 끊을 수 있게 미리 적는다.
 */
export function deviceLimitNotice(count: number, max: number = MAX_DEVICES): string {
  if (count >= max) {
    return `기기 ${max}대를 모두 쓰고 있어요. 새 기기로 로그인하면 가장 오래 쓰지 않은 기기가 자동으로 로그아웃돼요.`;
  }
  if (count === max - 1) {
    return `기기 ${count}대를 쓰고 있어요. ${max}대를 넘기면 가장 오래 쓰지 않은 기기가 로그아웃돼요.`;
  }
  return "";
}

/** 해지를 물을 때의 제목과 설명. 지금 이 기기면 로그아웃과 같은 뜻이라 다르게 묻는다. */
export function revokePrompt(device: ServerDevice): { title: string; message: string; confirm: string } {
  if (device.current) {
    return {
      title: "지금 이 기기에서 로그아웃할까요?",
      message: "이 기기에서 로그아웃돼요. 아직 올라가지 않은 내용은 사라질 수 있어요.",
      confirm: "로그아웃",
    };
  }
  return {
    title: `${deviceName(device)}에서 로그아웃할까요?`,
    message: "그 기기는 바로 로그아웃되고, 다시 쓰려면 새로 로그인해야 해요.",
    confirm: "로그아웃",
  };
}
