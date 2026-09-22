import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

/**
 * 처음 한 번만 보여 주는 안내. 닫으면 이 기기에서는 다시 뜨지 않는다.
 *
 * 우리 탭의 의견 카드(`feedback.ts`)와 같은 방식이다. 다 읽기 전에는 숨긴 것으로 두어,
 * 이미 닫은 안내가 한순간 보였다 사라지지 않게 한다. 저장이 안 되는 곳(사생활 보호
 * 창 등)에서는 매번 뜰 수 있지만 막는 일은 아니다.
 *
 * @param key 안내마다 다른 이름. 문구를 크게 바꿔 다시 알려야 하면 끝의 판(`.v1`)을 올린다.
 * @returns [숨겼는지, 닫기]
 */
export function useOnceTip(key: string): [boolean, () => void] {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key)
      .then((value) => {
        if (alive) setHidden(value === "1");
      })
      .catch(() => {
        if (alive) setHidden(false);
      });
    return () => {
      alive = false;
    };
  }, [key]);
  const hide = useCallback(() => {
    setHidden(true);
    AsyncStorage.setItem(key, "1").catch(() => {});
  }, [key]);
  return [hidden, hide];
}
