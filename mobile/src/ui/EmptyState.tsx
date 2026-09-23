import { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { Text } from "../AppText";
import { Glyph } from "../Glyph";
import { AppTheme } from "../theme";
import { onAccent } from "../theme/colors";
import { 불투명도, 아이콘, 높이, 모서리, 여백 } from "../theme/controls";
import { typo } from "../theme/typography";

/**
 * 아무것도 없을 때 보여 주는 상자.
 *
 * 같은 자리가 다섯 모양이었다. 가로 하나, 세로 넷인데 세로 넷은 테두리가
 * 실선·점선으로 갈리고 설명 글자가 12 와 14 로 갈렸으며 버튼 높이가 33 과 44 로
 * 갈렸다. 두 변형으로 모은다.
 *
 * - **가로** — 목록 안에 끼워 넣는 한 줄짜리. 탭 안의 빈 목록에 쓴다.
 * - **세로** — 화면 한복판이 통째로 빌 때. 그림 자리(`mark`)가 있다.
 *
 * 테두리는 둘 다 점선이다. 실선 상자는 「내용이 든 카드」와 모양이 같아,
 * 비어 있다는 것이 눈보다 글자를 읽어야 전해졌다.
 */
export function EmptyState({
  theme,
  모양 = "가로",
  title,
  description,
  action,
  onPress,
  /** 강조색으로 채운 버튼. 홈처럼 이 자리가 그 화면의 주된 할 일일 때만. */
  강조 = false,
  mark,
  style,
}: {
  theme?: AppTheme;
  모양?: "가로" | "세로";
  title: string;
  description: string;
  /** 없으면 버튼을 내지 않는다. 보기만 하는 멤버에게 추가 버튼을 감출 때 쓴다. */
  action?: string;
  onPress?: () => void;
  강조?: boolean;
  /** 세로 변형의 그림. 주지 않으면 종이 모양 표식을 그린다. */
  mark?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const 세로 = 모양 === "세로";
  const 버튼색 = 강조 ? theme?.primary : theme?.primarySoft;
  const 버튼글자 = 강조 ? (theme ? onAccent(theme.dark) : "#FFFFFF") : theme?.primary ?? "#3F4C8F";
  return (
    <View
      style={[
        세로 ? styles.세로 : styles.가로,
        theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
        style,
      ]}
    >
      {세로
        ? mark ?? <종이표식 theme={theme} />
        : <종이표식 theme={theme} />}
      <View style={세로 ? styles.세로글 : styles.가로글}>
        <Text style={[styles.title, 세로 && styles.가운데, theme && { color: theme.text }]}>{title}</Text>
        <Text style={[styles.description, 세로 && styles.가운데, theme && { color: theme.muted }]}>
          {description}
        </Text>
      </View>
      {action && onPress && (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={({ pressed }) => [
            styles.action,
            세로 && styles.세로버튼,
            버튼색 ? { backgroundColor: 버튼색 } : null,
            pressed && styles.pressed,
          ]}
        >
          <Glyph name="plus" size={아이콘.작게} color={버튼글자} weight={2.4} />
          <Text style={[styles.actionText, { color: 버튼글자 }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** 줄 두 개를 그린 종이. 살짝 기울여 둔다. */
function 종이표식({ theme }: { theme?: AppTheme }) {
  return (
    <View style={[styles.mark, theme && { backgroundColor: theme.primarySoft }]}>
      <View style={[styles.markLine, theme && { backgroundColor: theme.primary }]} />
      <View style={[styles.markLine, styles.markLineShort, theme && { backgroundColor: theme.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  가로: {
    minHeight: 76,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 모서리.행,
    paddingHorizontal: 여백.가로좁게,
    paddingVertical: 여백.세로좁게,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  세로: {
    minHeight: 190,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 모서리.구역,
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  가로글: { flex: 1, minWidth: 0 },
  세로글: { alignItems: "center" },
  가운데: { textAlign: "center" },
  title: { fontSize: 18, lineHeight: typo.title.line, fontFamily: typo.title.family },
  description: { fontSize: 14, lineHeight: 20, fontFamily: typo.body.family, marginTop: 2, maxWidth: 270 },
  mark: {
    width: 34,
    height: 38,
    borderRadius: 모서리.상자,
    paddingHorizontal: 6,
    justifyContent: "center",
    gap: 4,
    transform: [{ rotate: "-2deg" }],
  },
  markLine: { height: 2, borderRadius: 모서리.원, opacity: 불투명도.흐림 },
  markLineShort: { width: "65%" },
  action: {
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  세로버튼: { paddingHorizontal: 여백.가로 },
  actionText: { fontSize: 14, fontFamily: typo.label.family },
  pressed: { opacity: 불투명도.눌림 },
});
