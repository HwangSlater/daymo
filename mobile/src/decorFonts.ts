import * as Font from "expo-font";
import { useEffect, useState } from "react";

import type { DecorFont } from "./cardDecor";

/**
 * 추억 카드 글자의 글꼴. 「기본」은 앱 글꼴(쿠키런 Bold)이라 따로 받지 않는다.
 *
 * 앱을 켤 때(`App.tsx` 의 useFonts) 받지 않고 카드를 처음 그릴 때 받는다. 세 벌이 합쳐
 * 5MB 남짓이라 웹에서 첫 화면이 느려진다. 폰은 앱 안에 들어 있어 곧바로 끝난다.
 *
 * 파일은 자주 쓰는 한글 2,350자(KS X 1001)와 자모·영문·숫자만 남긴 판이다. 드문 글자는
 * 기기 기본 글꼴로 보인다. 나눔손글씨 펜은 OFL 의 예약된 이름 때문에 고친 판의 이름을
 * DaymoPen 으로 바꿨다(라이선스: assets/fonts/licenses, 앱의 오픈소스 라이선스 화면).
 */
export const DECOR_FONT_FAMILY: Record<DecorFont, string> = {
  기본: "CookieRun-Bold",
  손글씨: "DaymoPen-Regular",
  굵게: "BlackHanSans-Daymo",
  둥글게: "Gaegu-Bold-Daymo",
};

const 받을_것 = {
  "DaymoPen-Regular": require("../assets/fonts/DaymoPen-Regular.ttf"),
  "BlackHanSans-Daymo": require("../assets/fonts/BlackHanSans-Daymo.ttf"),
  "Gaegu-Bold-Daymo": require("../assets/fonts/Gaegu-Bold-Daymo.ttf"),
};

let 받는_중: Promise<void> | null = null;
let 다_받음 = false;

/** 한 번만 받는다. 실패해도 막지 않는다(기본 글꼴로 보인다). */
function 받기(): Promise<void> {
  if (!받는_중) {
    받는_중 = Font.loadAsync(받을_것)
      .then(() => {
        다_받음 = true;
      })
      .catch(() => undefined);
  }
  return 받는_중;
}

/** 카드 글꼴을 다 받았는지. 받기 전에는 기본 글꼴로 그린다. */
export function useDecorFonts(): boolean {
  const [ready, setReady] = useState(다_받음);
  useEffect(() => {
    if (다_받음) return;
    let 살아있다 = true;
    void 받기().then(() => {
      if (살아있다) setReady(true);
    });
    return () => {
      살아있다 = false;
    };
  }, []);
  return ready;
}
