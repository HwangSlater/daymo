/**
 * [임시] 웹에서 키보드가 올라왔을 때 실제 치수를 화면에 찍는다.
 *
 * 아이폰에서 입력칸이 가려지는 것을 추측으로 못 잡아서 넣었다. 주소 끝에
 * `?키보드확인=1` 을 붙였을 때만 보이고, 그 밖에는 아무것도 그리지 않는다.
 * 원인을 잡으면 이 파일과 `SheetShell` 의 두 줄을 지운다.
 *
 * 읽는 법:
 *   창    레이아웃 뷰포트 높이. `position: fixed` 가 기준으로 삼는 값이고,
 *         아이폰은 키보드가 올라와도 이 값을 줄이지 않는다.
 *   보임  실제로 보이는 높이와 그 위쪽 여백(`visualViewport`). 키보드가 올라오면 줄어든다.
 *   칸    지금 입력 중인 칸의 위·아래 좌표(화면 기준).
 *         「칸아래」가 「보임」보다 크면 그만큼 키보드에 가려져 있다는 뜻이다.
 */
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

const 웹 = Platform.OS === "web";

/** 주소에 표시가 붙었을 때만 켠다. */
export function 계측을_켤까(): boolean {
  if (!웹 || typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("키보드확인");
  } catch {
    return false;
  }
}

type 잰값 = { 창: number; 보임: number; 위: number; 칸위: number; 칸아래: number; 가림: number };

export function KeyboardProbe() {
  const [값, 넣기] = useState<잰값 | null>(null);
  useEffect(() => {
    if (!웹 || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const 재기 = () => {
      const 상자 = (document.activeElement as HTMLElement | null)?.getBoundingClientRect?.();
      const 보임 = Math.round(vv?.height ?? window.innerHeight);
      const 칸아래 = 상자 ? Math.round(상자.bottom) : -1;
      넣기({
        창: Math.round(window.innerHeight),
        보임,
        위: Math.round(vv?.offsetTop ?? 0),
        칸위: 상자 ? Math.round(상자.top) : -1,
        칸아래,
        가림: 칸아래 < 0 ? 0 : Math.max(0, 칸아래 - 보임),
      });
    };
    const 타이머 = window.setInterval(재기, 400);
    vv?.addEventListener("resize", 재기);
    vv?.addEventListener("scroll", 재기);
    return () => {
      window.clearInterval(타이머);
      vv?.removeEventListener("resize", 재기);
      vv?.removeEventListener("scroll", 재기);
    };
  }, []);
  if (!값) return null;
  return (
    <View style={styles.판} pointerEvents="none">
      <Text style={styles.글}>
        창 {값.창} · 보임 {값.보임}(위 {값.위}) · 칸 {값.칸위}~{값.칸아래} · 가림 {값.가림}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  판: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "#111", paddingVertical: 4, zIndex: 9999 },
  글: { color: "#7FD8A6", fontSize: 11, textAlign: "center" },
});
