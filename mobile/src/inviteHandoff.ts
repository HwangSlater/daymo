/**
 * 웹에서 받은 초대를 로그인·가입이 끝날 때까지 들고 간다.
 *
 * 초대 페이지의 「웹에서 열기」는 웹 앱을 `https://www.daymo.xyz/app?invite=<token>` 로
 * 연다. 앱은 주소에서 token 을 꺼내고 **곧바로 주소에서 지운다**. 브라우저 기록이나
 * 다시 공유한 주소에 token 이 남으면 링크를 받지 않은 사람이 공간에 들어올 수 있다.
 *
 * 로그인 전이면 sessionStorage 에 잠시 둔다. 탭을 닫으면 사라지고, 기한이 지나도
 * 버린다. 남의 기기나 공용 브라우저에 오래 남지 않게 하려는 것이다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { inviteTokenOf } from "./inviteLink.ts";

/** 웹 앱 주소에 붙는 이름. 서버의 app/api/auth_pages.py 와 같아야 한다. */
export const INVITE_PARAM = "invite";

export const INVITE_KEEP_KEY = "daymo.invite.pending.v1";

/** 보관 기한. 가입하고 메일을 확인하기에 넉넉하고, 잊고 지나가기에는 짧다. */
export const INVITE_KEEP_MS = 30 * 60 * 1000;

/** 주소에서 초대 token 과, token 을 지운 주소를 꺼낸다. 없으면 null. */
export function inviteFromPageUrl(href: string): { token: string; cleaned: string } | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const token = inviteTokenOf(url.searchParams.get(INVITE_PARAM));
  if (!token) return null;
  url.searchParams.delete(INVITE_PARAM);
  const query = url.searchParams.toString();
  return { token, cleaned: `${url.pathname}${query ? `?${query}` : ""}${url.hash}` };
}

/** 보관할 모양. 언제 받았는지 같이 적어 기한을 본다. */
export function packKeptInvite(token: string, now: number): string {
  return JSON.stringify({ token, keptAt: now });
}

/** 보관해 둔 것을 읽는다. 기한이 지났거나 모양이 이상하면 없는 것으로 본다. */
export function unpackKeptInvite(raw: string | null | undefined, now: number): string | null {
  if (!raw) return null;
  let kept: { token?: unknown; keptAt?: unknown };
  try {
    kept = JSON.parse(raw) as { token?: unknown; keptAt?: unknown };
  } catch {
    return null;
  }
  if (typeof kept.token !== "string" || typeof kept.keptAt !== "number") return null;
  // 기기 시계를 뒤로 돌려 기한을 늘리지 못하게 앞뒤로 다 막는다.
  if (now < kept.keptAt || now - kept.keptAt > INVITE_KEEP_MS) return null;
  return inviteTokenOf(kept.token);
}

/** 브라우저 저장소. 사생활 보호 모드처럼 막혀 있으면 없는 것으로 본다. */
function 보관함(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * 웹에서 초대 token 을 집는다. 주소에 있으면 꺼내 보관하고 주소를 지운다.
 * 주소에 없으면 아까 보관해 둔 것을 돌려준다. 네이티브 앱에서는 늘 null 이다.
 */
export function takePageInvite(now: number = Date.now()): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  const 찾음 = inviteFromPageUrl(window.location.href);
  const 통 = 보관함();
  if (!찾음) return unpackKeptInvite(통?.getItem(INVITE_KEEP_KEY), now);
  try {
    window.history?.replaceState?.(window.history.state, "", 찾음.cleaned);
  } catch {
    // 주소를 못 지우는 브라우저라도 참여는 되게 둔다.
  }
  try {
    통?.setItem(INVITE_KEEP_KEY, packKeptInvite(찾음.token, now));
  } catch {
    // 저장소가 꽉 차도 지금 화면에서는 참여할 수 있다.
  }
  return 찾음.token;
}

/** 다 쓴 초대를 지운다. 참여했거나 더 쓸 수 없는 링크일 때 부른다. */
export function forgetPageInvite(): void {
  try {
    보관함()?.removeItem(INVITE_KEEP_KEY);
  } catch {
    // 지우지 못해도 기한이 지나면 스스로 사라진다.
  }
}
