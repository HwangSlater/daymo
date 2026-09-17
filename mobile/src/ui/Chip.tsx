import { Pressable, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { Text } from "../AppText";
import { AppTheme } from "../theme";
import { 높이, 모서리, 누름여유 } from "../theme/controls";
import { typo } from "../theme/typography";

/**
 * 고르는 칩 하나. **여러 개 중 하나를 고르는 자리는 이걸 쓴다.**
 *
 * 칩은 `chip`·`chipRow`·`chipText` 라는 같은 이름으로 세 파일에 따로 있었다
 * (`CardDecorEditor`·`NoticeImportSheet`·`PhotoViewer`). 높이가 32·36 으로
 * 갈렸고, 그중 32 짜리는 손가락으로 누르기에 모자랐다. 여기서는 `높이.칩` 에
 * 맞추고 모자란 만큼을 `누름여유` 로 채운다.
 *
 *     <ChipRow>
 *       {여행들.map((t) => <Chip key={t.id} theme={theme} label={t.name}
 *         on={t.id === 고른} onPress={() => 고르기(t.id)} />)}
 *     </ChipRow>
 */
export function Chip({
  theme,
  label,
  on,
  onPress,
  colors,
  maxLines,
}: {
  theme?: AppTheme;
  label: string;
  /** 켜져 있는지. 접근성에도 그대로 전한다. */
  on: boolean;
  onPress: () => void;
  /**
   * 테마를 따르지 않는 자리에서만.
   *
   * 사진 위에 얹는 칩처럼 바탕이 늘 어두운 자리가 있다. 테두리를 주지 않으면
   * 테두리 없이 꽉 채운 칩이 된다.
   */
  colors?: { background: string; border?: string; text: string };
  /** 긴 이름을 몇 줄까지 보일지. 주지 않으면 줄 수를 막지 않는다. */
  maxLines?: number;
}) {
  const background = colors
    ? colors.background
    : on
      ? theme?.primarySoft
      : theme?.surface;
  const border = colors ? colors.border : on ? theme?.primary : theme?.border;
  const ink = colors ? colors.text : on ? theme?.primary : theme?.muted;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={누름여유(높이.칩)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        chipStyles.chip,
        // 테두리 색을 주지 않으면 테두리 자체를 없앤다. 색 없는 1px 은 기기마다
        // 검은 줄로 보인다.
        border ? { borderColor: border } : chipStyles.noBorder,
        background ? { backgroundColor: background } : null,
        pressed && chipStyles.pressed,
      ]}
    >
      <Text numberOfLines={maxLines} style={[chipStyles.text, ink ? { color: ink } : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * 칩을 늘어놓는 줄.
 *
 * 기본은 넘치면 아랫줄로 내려간다. `scroll` 을 주면 한 줄에 두고 옆으로 민다.
 * 날짜처럼 개수가 정해져 있고 순서가 뜻을 갖는 것은 옆으로 미는 쪽이 낫다.
 */
export function ChipRow({
  scroll = false,
  style,
  children,
}: {
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[chipStyles.row, style]}>
        {children}
      </ScrollView>
    );
  }
  return <View style={[chipStyles.row, style]}>{children}</View>;
}

export const chipStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingRight: 6 },
  // 좌우 여백은 `여백.가로좁게`(12) 가 아니라 10 이다. 칩은 글자가 두세 자라
  // 12 를 주면 알약이 동그래져 무엇을 고르는 줄인지보다 모양이 먼저 보인다.
  chip: {
    minHeight: 높이.칩,
    borderRadius: 모서리.원,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  noBorder: { borderWidth: 0 },
  text: { fontSize: 12, fontFamily: typo.label.family },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
