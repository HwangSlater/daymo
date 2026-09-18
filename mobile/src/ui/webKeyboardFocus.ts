/**
 * 웹에서 키보드가 올라왔을 때의 세 가지.
 *
 * 1. 입력 중인 칸이 계속 보이게 한다. 칸을 누른 순간에는 브라우저가 칸을 보이는 자리로
 *    옮겨 주지만, 그 뒤 키보드가 올라오며 창이 줄어들고(아이폰 크롬은
 *    `interactive-widget` 으로 창 자체를 줄인다) 시트 안 스크롤 칸이 함께 줄어들면서
 *    칸이 스크롤 아래로 밀려난다. 아무도 다시 스크롤해 주지 않아 글자를 치는데 칸이
 *    안 보였다(2026-09-18 아이폰 실측: 창 292, 입력칸 422~474). 창 크기가 바뀔 때마다
 *    지금 입력 중인 칸을 다시 보이는 자리로 스크롤한다.
 * 2. Enter 를 누르면 같은 시트의 다음 칸으로 간다. 다음이 글자 칸이면 포커스를 옮기고,
 *    칩·시간처럼 눌러 고르는 칸이면 키보드를 내리고 그 칸이 보이게 스크롤한다
 *    (여러 줄 칸에서는 줄바꿈 그대로).
 * 3. 키보드가 올라와 있는지 알려 준다(`useWebKeyboardOpen`). 시트가 손잡이·부제를 접어
 *    입력 영역을 넓히는 데 쓴다.
 *
 * 기기 앱에서는 아무것도 하지 않는다.
 */
import { useEffect, useState } from "react";
import { Platform } from "react-native";

const 웹 = Platform.OS === "web";

const 입력칸인가 = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");

/** 같은 스크롤 칸 안의 칸들을 위에서 아래 차례로. 글자 칸과 눌러 고르는 칸(칩·시간)을 함께 센다. */
function 같은_시트의_칸들(기준: HTMLElement): HTMLElement[] {
  // 시트 본문은 세로 스크롤 칸 하나다. 그 밖(머리의 닫기, 아래 저장 버튼)은 세지 않는다.
  let 범위: HTMLElement = document.body;
  for (let el = 기준.parentElement; el; el = el.parentElement) {
    const o = window.getComputedStyle(el).overflowY;
    if (o === "auto" || o === "scroll") {
      범위 = el;
      break;
    }
  }
  return Array.from(
    범위.querySelectorAll<HTMLElement>('input, textarea, [role="button"], [role="radio"], [role="checkbox"], [role="switch"]'),
  ).filter((el) => {
    if ((el as HTMLInputElement).type === "hidden" || (el as HTMLInputElement).disabled) return false;
    if (el.getAttribute("aria-disabled") === "true") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

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
    // Enter → 다음 칸. 여러 줄 칸(textarea)은 줄바꿈이 필요하니 건드리지 않는다.
    const 다음칸으로 = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const 칸 = document.activeElement;
      if (!입력칸인가(칸) || 칸.tagName === "TEXTAREA") return;
      const 칸들 = 같은_시트의_칸들(칸);
      // 한 줄에 칩이 여럿이면 다음 「묶음」의 첫째만 세면 된다. 같은 부모의 형제는 건너뛴다.
      let i = 칸들.indexOf(칸 as HTMLElement) + 1;
      const 다음 = 칸들[i];
      if (!다음) return;
      event.preventDefault();
      if (입력칸인가(다음)) {
        다음.focus();
        return;
      }
      // 눌러 고르는 칸. 키보드를 내리고 그 칸이 보이게 한다.
      칸.blur();
      다음.scrollIntoView({ block: "center", inline: "nearest" });
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", 다시_보이게);
    window.addEventListener("resize", 다시_보이게);
    // 칸을 옮겨 다닐 때도 한 번. 브라우저가 해 주긴 하지만 줄어든 스크롤 칸 기준으로 다시 맞춘다.
    document.addEventListener("focusin", 다시_보이게);
    document.addEventListener("keydown", 다음칸으로);
    return () => {
      if (예약 !== null) window.cancelAnimationFrame(예약);
      vv?.removeEventListener("resize", 다시_보이게);
      window.removeEventListener("resize", 다시_보이게);
      document.removeEventListener("focusin", 다시_보이게);
      document.removeEventListener("keydown", 다음칸으로);
    };
  }, [active]);
}

/**
 * 키보드가 올라와 있으면 참. 보이는 높이(`visualViewport`)가 창 높이의 3/4 아래로
 * 내려가면 키보드로 본다. 기기 앱에서는 늘 거짓이다.
 */
export function useWebKeyboardOpen(active: boolean): boolean {
  const [열림, 두기] = useState(false);
  useEffect(() => {
    if (!웹 || !active || typeof window === "undefined") return;
    const vv = window.visualViewport;
    // 여태 본 가장 큰 높이를 기준으로 삼는다. 키보드가 올라오면 아이폰 크롬은 innerHeight 까지
    // 줄이므로 그때그때의 innerHeight 를 기준으로 하면 기준이 같이 내려가 버린다.
    // (screen.height 는 쓰지 않는다 — PC 에서 브라우저 창을 작게 띄우면 늘 「열림」이 된다.)
    let 기준 = Math.max(window.innerHeight, vv?.height ?? 0);
    const 재기 = () => {
      const 지금 = vv?.height ?? window.innerHeight;
      기준 = Math.max(기준, 지금, window.innerHeight);
      두기(지금 < 기준 * 0.75);
    };
    재기();
    vv?.addEventListener("resize", 재기);
    window.addEventListener("resize", 재기);
    return () => {
      vv?.removeEventListener("resize", 재기);
      window.removeEventListener("resize", 재기);
    };
  }, [active]);
  return 웹 && 열림;
}
