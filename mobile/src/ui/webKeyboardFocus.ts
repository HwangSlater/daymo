/**
 * 웹에서 키보드가 올라온 뒤에도 입력 중인 칸이 보이게 한다.
 *
 * 칸을 누른 순간에는 브라우저가 칸을 보이는 자리로 옮겨 준다. 그런데 그 뒤에
 * 키보드가 올라오며 창이 줄어들고(아이폰 크롬은 `interactive-widget` 으로 창 자체를
 * 줄인다), 시트 안 스크롤 칸이 함께 줄어들면서 칸이 스크롤 아래로 밀려난다. 그
 * 뒤로는 아무도 다시 스크롤해 주지 않아, 사용자는 글자를 치는데 칸은 안 보인다
 * (2026-09-18 아이폰에서 잰 값: 창 292, 입력칸 422~474 — 130px 아래).
 *
 * 창 크기가 바뀔 때마다 지금 입력 중인 칸을 다시 보이는 자리로 스크롤한다.
 * 기기 앱에서는 아무것도 하지 않는다.
 */
import { useEffect } from "react";
import { Platform } from "react-native";

const 웹 = Platform.OS === "web";

const 입력칸인가 = (el: Element | null): el is HTMLElement =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");

export function useWebKeyboardFocus(active: boolean): void {
  useEffect(() => {
    if (!웹 || !active || typeof window === "undefined") return;
    let 예약: number | null = null;
    const 다시_보이게 = () => {
      if (예약 !== null) return;
      // 창이 줄어드는 프레임이 끝난 뒤에 재야 새 크기가 잡힌다.
      예약 = window.requestAnimationFrame(() => {
        예약 = null;
        const 칸 = document.activeElement;
        if (!입력칸인가(칸)) return;
        칸.scrollIntoView({ block: "center", inline: "nearest" });
      });
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", 다시_보이게);
    window.addEventListener("resize", 다시_보이게);
    // 칸을 옮겨 다닐 때도 한 번. 브라우저가 해 주긴 하지만 줄어든 스크롤 칸 기준으로 다시 맞춘다.
    document.addEventListener("focusin", 다시_보이게);
    return () => {
      if (예약 !== null) window.cancelAnimationFrame(예약);
      vv?.removeEventListener("resize", 다시_보이게);
      window.removeEventListener("resize", 다시_보이게);
      document.removeEventListener("focusin", 다시_보이게);
    };
  }, [active]);
}
