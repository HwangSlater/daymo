import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * 웹에서 브라우저 뒤로 가기로 시트와 여행 상세를 닫는다.
 *
 * 안드로이드의 하드웨어 뒤로 가기는 `BackHandler` 가 받아서 열린 것을 먼저 닫는다.
 * 웹에는 그런 게 없어서, 여행 상세나 시트를 열어 둔 채 사파리에서 뒤로 가기
 * 제스처를 하면 앱이 아니라 페이지 자체를 벗어난다. 쓰던 것이 통째로 사라진다.
 *
 * 그래서 열릴 때 방문 기록을 한 칸 쌓아 두고, 뒤로 가기가 그 칸을 걷어내면 닫는다.
 * 쌓은 칸에는 우리가 만든 표를 넣어 둔다. `popstate` 는 열려 있는 모든 겹에
 * 전해지므로, 표가 아직 맨 위에 남아 있으면 내 칸이 아닌 것이고 가만히 둔다.
 * 시트 위에 시트가 겹쳐도 맨 위의 것 하나만 닫힌다.
 *
 * 닫기 버튼이나 바깥 누르기로 닫을 때는 쌓아 둔 칸을 직접 걷어낸다. 안 그러면
 * 쓸모없는 칸이 쌓여 뒤로 가기를 몇 번씩 눌러야 페이지를 벗어난다.
 *
 * 로그인 화면이나 첫 화면에서는 이 훅을 쓰지 않는다. 거기서는 지금처럼 뒤로 가기가
 * 페이지를 벗어나는 게 맞다. 기기에서는 아무것도 하지 않는다.
 */

const isWeb = Platform.OS === "web";

/** 겹칠 때 서로를 구분하려고 붙이는 번호. */
let 순번 = 0;

/**
 * 닫기가 정말 닫았는지 확인하기까지 기다리는 시간(ms).
 *
 * 작성 중인 시트는 닫기를 눌러도 바로 닫지 않고 "저장하지 않고 닫을까요?" 를 먼저
 * 묻는다. 거기서 「취소」를 고르면 시트는 그대로 열려 있는데 방문 기록 칸만 사라진
 * 꼴이 된다. 그래서 잠깐 뒤에 아직 열려 있는지 보고, 열려 있으면 칸을 도로 쌓는다.
 * 웹의 확인창은 `window.confirm` 이라 답할 때까지 멈춰 있고, 답한 뒤 이 시간이 흐른다.
 */
const 확인_대기 = 250;

type BackState = { daymoBack?: string } | null;

export function useWebBackClose(active: boolean, onClose: () => void) {
  // 닫기 함수는 화면을 그릴 때마다 새로 만들어진다. 그때마다 방문 기록을 다시
  // 쌓으면 안 되므로 최신 것만 따로 들고 있는다. 열려 있는지도 같이 본다.
  const onCloseRef = useRef(onClose);
  const activeRef = useRef(active);
  useEffect(() => {
    onCloseRef.current = onClose;
    activeRef.current = active;
  }, [active, onClose]);
  useEffect(() => {
    if (!isWeb || !active) return;
    if (typeof window === "undefined" || !window.history) return;
    순번 += 1;
    const 표 = `daymo-${순번}`;
    const push = () =>
      window.history.pushState({ ...(window.history.state as object | null), daymoBack: 표 }, "");
    const 내칸이_맨위 = () => (window.history.state as BackState)?.daymoBack === 표;
    push();
    let 살아있다 = true;
    let 걷혔다 = false;
    let 재확인: ReturnType<typeof setTimeout> | undefined;
    const onPopState = () => {
      // 내 칸이 아직 맨 위면 다른 겹이 닫힌 것이다. 가만히 둔다.
      if (내칸이_맨위()) return;
      걷혔다 = true;
      onCloseRef.current();
      재확인 = setTimeout(() => {
        if (!살아있다 || !activeRef.current) return;
        push();
        걷혔다 = false;
      }, 확인_대기);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      살아있다 = false;
      clearTimeout(재확인);
      window.removeEventListener("popstate", onPopState);
      // 뒤로 가기로 닫힌 게 아니라면 쌓아 둔 칸은 아직 남아 있다. 직접 걷어낸다.
      if (!걷혔다) window.history.back();
    };
  }, [active]);
}
