import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

/**
 * 웹에서 키보드가 가린 만큼 시트 바깥에 여백을 준다.
 *
 * 기기 앱은 `KeyboardAvoidingView` 가 알아서 밀어 준다. 그런데 react-native-web 의
 * `KeyboardAvoidingView` 는 아무 일도 하지 않는 빈 `View` 이고, 웹 `Modal` 은
 * `position: fixed` 라서 아이폰 사파리에서 키보드가 올라와도 시트가 제자리에 있다.
 * 입력칸과 저장 버튼이 키보드 아래로 들어가 아무것도 못 한다.
 *
 * 사파리는 키보드가 올라와도 레이아웃 뷰포트(= `position: fixed` 의 기준)를 줄이지
 * 않는다. 대신 실제로 보이는 영역을 `window.visualViewport` 가 알려 준다. 그래서
 * 레이아웃 뷰포트에서 보이는 영역을 뺀 위아래 띠만큼 여백을 주면, 시트를 감싼
 * 칸의 안쪽이 딱 보이는 영역과 겹친다. `justifyContent: "flex-end"` 인 덮개에
 * 그대로 붙이면 시트가 키보드 바로 위에 선다. 시트의 `maxHeight: "91%"` 도 줄어든
 * 안쪽 높이를 기준으로 다시 계산되므로 위쪽이 잘리지 않는다.
 *
 *   <View style={[s.modalBack, useWebKeyboardInset(visible)]}>
 *
 * 기기에서는 아무것도 구독하지 않고 늘 `null` 을 돌려준다. 스타일 배열에 그대로
 * 넣어도 되고, 지금 동작은 한 줄도 바뀌지 않는다.
 */

const isWeb = Platform.OS === "web";

export type WebKeyboardInset = { paddingTop: number; paddingBottom: number } | null;

export function useWebKeyboardInset(active: boolean): WebKeyboardInset {
  const [top, setTop] = useState(0);
  const [bottom, setBottom] = useState(0);
  useEffect(() => {
    if (!isWeb || !active) return;
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!viewport) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const nextTop = Math.max(0, Math.round(viewport.offsetTop));
      const nextBottom = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      );
      setTop(nextTop);
      setBottom(nextBottom);
    };
    // 첫 측정은 그리기 한 번 뒤로 미룬다. 효과 안에서 바로 상태를 바꾸지 않는다.
    const first = requestAnimationFrame(measure);
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      alive = false;
      cancelAnimationFrame(first);
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
      // 시트가 닫히면 여백도 같이 치운다. 남겨 두면 다음에 열 때 잠깐 떠 보인다.
      setTop(0);
      setBottom(0);
    };
  }, [active]);
  return useMemo(
    () => (top === 0 && bottom === 0 ? null : { paddingTop: top, paddingBottom: bottom }),
    [top, bottom],
  );
}
