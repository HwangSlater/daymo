/**
 * 화면에 새로 뜬 한 줄을 낭독기에게 말로 알린다.
 *
 * 앱 곳곳의 오류·안내 줄에는 `accessibilityLiveRegion="polite"` 가 붙어 있는데,
 * **이것은 안드로이드 접근성 서비스만 듣는다.** iOS VoiceOver 는 live region 을
 * 모르고, 화면에 글이 새로 생겨도 손가락이 그 자리에 닿기 전에는 읽지 않는다.
 * 그래서 눈으로 못 보는 사람에게는 저장이 실패했는지 성공했는지가 전해지지
 * 않았다(2026-09-23 검토 #29).
 *
 * 두 가지를 같이 둔다. **안드로이드는 live region, iOS 는 이 모듈의 `announce`.**
 * 안드로이드에서 둘 다 울리면 같은 말이 두 번 들릴 것 같지만, live region 은
 * 뷰가 붙을 때 한 번 읽고 `announceForAccessibility` 는 그와 별개로 큐에 들어가
 * 실제로는 이어 읽힌다. 한쪽만 지우면 다른 플랫폼이 통째로 조용해지므로 둘 다 둔다.
 *
 * 읽기 기능이 꺼져 있거나(대부분의 기기) 웹이면 아무 일도 하지 않는다.
 * 말을 거는 것 자체가 실패해도 삼킨다 — 이것은 개인 편의 값이고, 여기서 또
 * 오류를 띄우면 정작 알리려던 말이 묻힌다.
 */

import { useEffect } from "react";

/** 낭독기에 말을 건네는 쪽. 앱은 react-native 의 `AccessibilityInfo`, 시험은 가짜를 세운다. */
export type Announcer = {
  isScreenReaderEnabled: () => Promise<boolean>;
  announceForAccessibility: (message: string) => void;
};

/** 부르는 쪽이 세운 것. 세우지 않으면 첫 부름에서 react-native 것을 찾아 둔다. */
let 세운것: Announcer | null = null;
/** react-native 를 한 번 찾아봤는지. 없는 곳(`node --test`)에서 매번 다시 찾지 않는다. */
let 찾아봤다 = false;
/** 바로 앞에 읽어 준 말. 같은 것이 연달아 오면 건너뛴다. */
let 마지막 = "";

/**
 * 낭독기를 대신 세운다. 시험에서만 쓴다.
 *
 * `null` 을 넘기면 다시 react-native 것을 찾는다. 세울 때마다 「바로 앞에 읽은 말」도
 * 비워, 한 시험이 읽은 말이 다음 시험을 건너뛰게 하지 않는다.
 */
export function setAnnouncer(대신: Announcer | null): void {
  세운것 = 대신;
  찾아봤다 = 대신 !== null;
  마지막 = "";
}

/**
 * 「바로 앞에 읽은 말」을 잊는다.
 *
 * 같은 오류가 한 번 고쳐졌다가 다시 났을 때 두 번째를 읽어 주려면, 그사이에 다른
 * 말이 오거나 이것을 불러야 한다. 불러오기를 다시 시작하는 자리에서 부른다.
 */
export function resetAnnounce(): void {
  마지막 = "";
}

async function 낭독기찾기(): Promise<Announcer | null> {
  if (세운것) return 세운것;
  if (찾아봤다) return null;
  찾아봤다 = true;
  try {
    // `import()`가 만드는 모듈 namespace는 react-native의 export를 전부 훑는다.
    // 그러면 Expo Go에 들어 있지 않은 PushNotificationIOS 같은 오래된 native
    // module getter까지 실행되므로, CommonJS 객체에서 필요한 값만 바로 읽는다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AccessibilityInfo: info } = require("react-native") as typeof import("react-native");
    if (!info?.announceForAccessibility || !info?.isScreenReaderEnabled) return null;
    세운것 = {
      isScreenReaderEnabled: () => info.isScreenReaderEnabled(),
      announceForAccessibility: (message: string) => info.announceForAccessibility(message),
    };
    return 세운것;
  } catch {
    // react-native 가 없는 곳(순수 node 시험)에서는 말을 걸 상대가 없다.
    return null;
  }
}

/**
 * 한 줄을 낭독기에게 읽어 준다.
 *
 * 기다리지 않는다. 그리는 중에 불러도 화면이 늦어지지 않게 뒤에서 처리한다.
 * 빈 글과 바로 앞에 읽은 것과 똑같은 글은 건너뛴다.
 */
export function announce(message: string | null | undefined): void {
  const 말 = (message ?? "").trim();
  if (!말 || 말 === 마지막) return;
  마지막 = 말;
  void (async () => {
    const 낭독기 = await 낭독기찾기();
    if (!낭독기) return;
    try {
      if (!(await 낭독기.isScreenReaderEnabled())) return;
      낭독기.announceForAccessibility(말);
    } catch {
      // 위 주석 참고. 알리려다 실패한 것까지 알리지는 않는다.
    }
  })();
}

/**
 * 화면의 한 줄이 바뀔 때마다 읽어 준다.
 *
 * `accessibilityLiveRegion` 을 붙인 바로 그 자리에서 함께 부른다. 글이 비면
 * 아무 일도 하지 않는다.
 *
 *     useAnnounce(error);
 *     ...
 *     <Text accessibilityLiveRegion="assertive">{error}</Text>
 */
export function useAnnounce(message: string | null | undefined): void {
  useEffect(() => {
    announce(message);
  }, [message]);
}
