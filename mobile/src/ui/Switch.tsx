import { StyleSheet, View } from "react-native";

import { AppTheme } from "../theme";
import { 모서리 } from "../theme/controls";

/**
 * 켜고 끄는 막대.
 *
 * 두 곳에 따로 있었고 트랙이 44×26 과 38×22, 노브가 20 과 16 으로 갈려 있었다.
 * 큰 쪽(44×26)으로 맞춘다. 작은 쪽은 손가락에 모자랐다.
 *
 * **누르는 것은 부르는 쪽이 갖는다.** 설정은 줄 전체가 눌리고 카드 도구는
 * 막대만 눌려서, 여기서 `Pressable` 을 쓰면 그 차이를 지우게 된다.
 */
export function Switch({
  theme,
  on,
  tone,
  colors,
}: {
  theme?: AppTheme;
  on: boolean;
  /** 켜졌을 때 트랙 색. 주지 않으면 테마의 강조색. */
  tone?: string;
  /** 테마를 따르지 않는 자리에서만. 사진 위에 얹는 어두운 도구 칸. */
  colors?: { off: string; border?: string; knob: string };
}) {
  const 켜짐 = tone ?? theme?.primary ?? "#3F4C8F";
  const 트랙 = on ? 켜짐 : colors ? colors.off : theme?.surfaceAlt;
  const 테두리 = on ? undefined : colors ? colors.border : theme?.border;
  return (
    <View
      style={[
        styles.track,
        트랙 ? { backgroundColor: 트랙 } : null,
        테두리 ? { borderWidth: 1, borderColor: 테두리 } : null,
      ]}
    >
      <View style={[styles.knob, on && styles.knobOn, colors ? { backgroundColor: colors.knob } : null]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // 꺼졌을 때만 테두리가 붙어 트랙 실치수가 1px 달라지던 것을 padding 으로 막는다.
  track: { width: 44, height: 26, borderRadius: 모서리.원, padding: 3, justifyContent: "center" },
  knob: { width: 20, height: 20, borderRadius: 모서리.원, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
});
