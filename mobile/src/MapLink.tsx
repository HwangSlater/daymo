import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { mapProviderName, mapProviderOf } from "./mapLinks";
import { AppTheme } from "./theme";
import { brand, kakaoInk, naverInk } from "./theme/colors";
import { 모서리, 불투명도 } from "./theme/controls";
import { typo } from "./theme/typography";

const badges = {
  naver: { letter: "N", ...brand.naver },
  kakao: { letter: "K", ...brand.kakao },
} as const;

/**
 * 지도 앱으로 나가는 버튼.
 *
 * 세 군데(일정 줄, 장소 카드, 찾기 결과)에서 제각각 생겨서, 같은 일을 하는
 * 버튼이 화면마다 다르게 보였다. 어디는 N 배지가 있고 어디는 없고, 바탕색도
 * 하나는 테마를 안 타는 초록으로 박혀 있었다.
 *
 * 앱 밖으로 나가는 버튼이라 어디로 나가는지가 보여야 한다. 링크 주소로
 * 네이버(N 초록)와 카카오(K 노랑)를 가려 배지를 붙이고, 둘 다 아니면
 * 배지 없이 "지도"라고만 적는다. 로고 대신 글자 배지를 쓴다.
 *
 *   chip    칩 모양. 목록 줄과 카드 안에 쓴다.
 *   inline  바탕 없이 글자만. 다른 글자 버튼과 한 줄에 놓일 때 쓴다.
 */
export function MapLink({ theme, url, label, shape = "chip", compact = false, small = false, subject }: {
  theme?: AppTheme;
  url: string;
  /** 없으면 좁을 때 "지도", 아니면 "네이버 지도"·"카카오맵". */
  label?: string;
  shape?: "chip" | "inline";
  compact?: boolean;
  /** 글 줄 옆에 붙는 가장 작은 판(28). 장소 카드의 분류·지역 줄에 쓴다. */
  small?: boolean;
  /** 무엇을 여는지. 읽어 주기에 "<subject> 카카오맵에서 보기"로 쓴다. */
  subject: string;
}) {
  const provider = mapProviderOf(url);
  const dark = Boolean(theme?.dark);
  const badge = provider === "other" ? null : badges[provider];
  const ink = provider === "naver" ? naverInk(dark) : provider === "kakao" ? kakaoInk(dark) : theme?.text ?? "#232B52";
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      hitSlop={shape === "chip" ? 10 : 6}
      accessibilityRole="link"
      accessibilityLabel={`${subject} ${mapProviderName[provider]}에서 보기`}
      style={({ pressed }) => [
        styles.base,
        shape === "chip" && styles.chip,
        shape === "chip" && compact && styles.chipCompact,
        shape === "chip" && small && styles.chipSmall,
        shape === "chip" && theme && { backgroundColor: theme.surfaceAlt },
        shape === "inline" && styles.inline,
        pressed && styles.pressed,
      ]}
    >
      {badge && (
        <View style={[styles.mark, (compact || small) && styles.markCompact, { backgroundColor: badge.fill }]}>
          <Text style={[styles.markText, (compact || small) && styles.markTextCompact, { color: badge.text }]}>{badge.letter}</Text>
        </View>
      )}
      <Text numberOfLines={1} style={[styles.label, (compact || small) && styles.labelCompact, small && styles.labelSmall, { color: ink }]}>
        {label ?? (compact || small ? "지도" : mapProviderName[provider])}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", gap: 4 },
  chip: { alignSelf: "flex-start", minHeight: 44, borderRadius: 모서리.상자, paddingHorizontal: 10 },
  chipCompact: { minHeight: 36, paddingHorizontal: 8 },
  chipSmall: { minHeight: 28, paddingHorizontal: 7, borderRadius: 모서리.상자 },
  inline: { flex: 1, minHeight: 44, justifyContent: "center" },
  pressed: { opacity: 불투명도.눌림 },
  mark: {
    width: 16,
    height: 16,
    borderRadius: 모서리.표식,
    alignItems: "center",
    justifyContent: "center",
  },
  markCompact: { width: 14, height: 14 },
  markText: { fontSize: 12, lineHeight: 16, fontFamily: typo.label.family },
  markTextCompact: { fontSize: 11, lineHeight: 14 },
  label: { fontSize: 14, fontFamily: typo.label.family },
  labelCompact: { fontSize: 13 },
  labelSmall: { fontSize: 12 },
});
