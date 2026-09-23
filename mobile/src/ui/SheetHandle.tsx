import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { 모서리 } from "../theme/controls";

/**
 * 아래에서 올라온 창 맨 위의 손잡이.
 *
 * 세 곳에 따로 있었고 폭이 54·40·34, 높이 5·5·4 로 갈려 있었다. 40×5 로 맞춘다.
 * 끌어서 닫는 손 영역은 이 막대가 아니라 부르는 쪽이 정한다(`useSheetDrag`).
 */
export function SheetHandle({ color, style }: { color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.handle, color ? { backgroundColor: color } : null, style]} />;
}

const styles = StyleSheet.create({
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 모서리.원, backgroundColor: "#C7C7C3" },
});
