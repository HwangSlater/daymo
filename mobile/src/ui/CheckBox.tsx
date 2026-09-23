import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { Glyph } from "../Glyph";
import { AppTheme } from "../theme";
import { onAccent } from "../theme/colors";
import { 아이콘, 모서리 } from "../theme/controls";

/**
 * 체크 칸.
 *
 * 같은 칸이 여덟 곳에 따로 있었고 크기가 21·22·23, 모서리가 7·8·11·12,
 * 테두리가 1·1.5·2, 체크 기호가 12·13·14 로 갈려 있었다. 한 칸으로 모은다.
 *
 * **누르는 것은 부르는 쪽이 갖는다.** 줄 전체가 눌리는 목록이 있고 칸만 눌리는
 * 목록이 있어서, 여기서 `Pressable` 을 쓰면 그 차이를 지우게 된다.
 *
 * - **네모** — 목록의 고르기. 동의 확인.
 * - **원** — 「했다/안 했다」를 표시하는 자리. 준비물과 재료.
 */
export function CheckBox({
  theme,
  on,
  모양 = "네모",
  tone,
  colors,
  style,
}: {
  theme?: AppTheme;
  on: boolean;
  모양?: "네모" | "원";
  /** 켜졌을 때 채울 색. 주지 않으면 테마의 강조색. 지우는 확인은 위험색을 넘긴다. */
  tone?: string;
  /** 테마를 따르지 않는 자리에서만. 사진 위에 얹는 고르기 표시. */
  colors?: { background: string; border: string; mark: string };
  style?: StyleProp<ViewStyle>;
}) {
  const 채움 = tone ?? theme?.primary ?? "#3F4C8F";
  const 바탕 = colors ? colors.background : on ? 채움 : theme?.surface;
  const 테두리 = colors ? colors.border : on ? 채움 : theme?.border;
  const 표식 = colors ? colors.mark : onAccent(Boolean(theme?.dark));
  return (
    <View
      style={[
        styles.box,
        모양 === "원" ? styles.원 : styles.네모,
        바탕 ? { backgroundColor: 바탕 } : null,
        테두리 ? { borderColor: 테두리 } : null,
        style,
      ]}
    >
      {on && <Glyph name="check" size={아이콘.작게} color={표식} weight={2.6} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  네모: { borderRadius: 모서리.상자 },
  원: { borderRadius: 모서리.원 },
});
