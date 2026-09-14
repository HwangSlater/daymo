import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { AppTheme } from "./theme";
import { brand, naverInk } from "./theme/colors";
import { typo } from "./theme/typography";

/**
 * 네이버 지도로 나가는 버튼.
 *
 * 세 군데(일정 줄, 장소 카드, 찾기 결과)에서 제각각 생겨서, 같은 일을 하는
 * 버튼이 화면마다 다르게 보였다. 어디는 N 배지가 있고 어디는 없고, 바탕색도
 * 하나는 테마를 안 타는 초록으로 박혀 있었다.
 *
 * 앱 밖으로 나가는 버튼이라 어디로 나가는지가 보여야 한다. N 배지가 그 일을
 * 하므로 모양이 달라도 배지는 늘 붙인다.
 *
 *   chip    칩 모양. 목록 줄과 카드 안에 쓴다.
 *   inline  바탕 없이 글자만. 다른 글자 버튼과 한 줄에 놓일 때 쓴다.
 */
export function NaverMapLink({ theme, url, label, shape = "chip", compact = false, accessibilityLabel }: {
  theme?: AppTheme;
  url: string;
  /** 없으면 좁을 때 "지도", 아니면 "네이버 지도". */
  label?: string;
  shape?: "chip" | "inline";
  compact?: boolean;
  accessibilityLabel: string;
}) {
  const ink = naverInk(Boolean(theme?.dark));
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      hitSlop={shape === "chip" ? 10 : 6}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        shape === "chip" && styles.chip,
        shape === "chip" && compact && styles.chipCompact,
        shape === "chip" && theme && { backgroundColor: theme.surfaceAlt },
        shape === "inline" && styles.inline,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.mark, compact && styles.markCompact]}>
        <Text style={[styles.markText, compact && styles.markTextCompact]}>N</Text>
      </View>
      <Text numberOfLines={1} style={[styles.label, compact && styles.labelCompact, { color: ink }]}>
        {label ?? (compact ? "지도" : "네이버 지도")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", gap: 4 },
  chip: { alignSelf: "flex-start", minHeight: 44, borderRadius: 8, paddingHorizontal: 10 },
  chipCompact: { minHeight: 36, paddingHorizontal: 8 },
  inline: { flex: 1, minHeight: 44, justifyContent: "center" },
  pressed: { opacity: 0.7 },
  mark: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: brand.naver.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  markCompact: { width: 14, height: 14 },
  markText: { color: brand.naver.text, fontSize: 12, lineHeight: 16, fontFamily: typo.label.family },
  markTextCompact: { fontSize: 11, lineHeight: 14 },
  label: { fontSize: 14, fontFamily: typo.label.family },
  labelCompact: { fontSize: 13 },
});
