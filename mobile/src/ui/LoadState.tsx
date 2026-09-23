import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { Text } from "../AppText";
import { useAnnounce } from "../announce";
import { Glyph } from "../Glyph";
import { AppTheme } from "../theme";
import { status as statusColor } from "../theme/colors";
import { 불투명도, 아이콘, 높이, 모서리, 여백 } from "../theme/controls";
import { typo } from "../theme/typography";

/**
 * 「불러오는 중」과 「못 불러왔어요 + 다시 시도」를 한 벌로 다루는 자리.
 *
 * 그전에는 기다리는 것도 실패한 것도 **글자 한 줄**이었고, 실패한 뒤에 다시 받을
 * 길이 없었다. 화면을 닫았다 열거나 앱을 새로 고쳐야 했다(2026-09-23 검토 #26).
 * 돌아가는 표시 · 무엇이 잘못됐는지 · 다시 받는 버튼, 이 셋을 한곳에 둔다.
 *
 * **`EmptyState` 와 다르다.** 빈 것은 정상이고(아직 아무것도 안 넣었다), 못 불러온
 * 것은 실패다(넣은 것이 있는데 안 보인다). 빈 자리에 「다시 시도」를 두면 눌러도
 * 아무것도 안 나오고, 실패한 자리에 「추가」를 두면 있던 것을 지운 줄 안다.
 * 그래서 점선 테두리(빈 상자의 표식)를 여기서는 쓰지 않는다.
 *
 *     <LoadState theme={theme} loading={!items && !error} error={error} onRetry={다시} />
 *
 * 둘 다 아니면 아무것도 그리지 않으므로 조건 없이 한 줄 놓아도 된다.
 */
export function LoadState({
  theme,
  loading = false,
  error = "",
  onRetry,
  모양 = "가로",
  loadingText = "불러오는 중이에요",
  retryLabel = "다시 시도",
  colors,
  style,
  pointerEvents,
}: {
  theme?: AppTheme;
  loading?: boolean;
  /** 못 불러온 까닭. 비어 있으면 실패가 아니다. 실패는 기다림보다 앞선다. */
  error?: string;
  /** 없으면 「다시 시도」를 내지 않는다. 다시 받을 길이 정말 없는 자리에서만 비운다. */
  onRetry?: () => void;
  /** 목록 안에 끼우면 `가로`, 화면이나 사진이 통째로 비면 `세로`. */
  모양?: "가로" | "세로";
  /** 「사진을 불러오는 중이에요」처럼 무엇을 기다리는지 밝힐 때. */
  loadingText?: string;
  retryLabel?: string;
  /**
   * 테마를 따르지 않는 자리에서만. `Toast` 와 같은 뜻이다.
   *
   * 사진 위에 얹히는 것은 폰이 밝은 모드여도 늘 어둡다.
   */
  colors?: { text: string; muted: string; button: string };
  style?: StyleProp<ViewStyle>;
  /** 사진 위에 띄워 놓고 그 둘레는 그대로 밀리게 할 때 `box-none`. */
  pointerEvents?: "none" | "box-none" | "auto";
}) {
  const 실패 = Boolean(error);
  // 안드로이드는 아래 `accessibilityLiveRegion` 이, iOS VoiceOver 는 이것이 읽는다.
  // 둘이 보는 것이 달라 한쪽만으로는 절반의 기기가 조용하다(announce.ts 참고).
  useAnnounce(실패 ? error : loading ? loadingText : "");
  if (!실패 && !loading) return null;

  const 세로 = 모양 === "세로";
  const 글자색 = colors?.text ?? (실패 ? (theme?.dark ? statusColor.danger.dark : statusColor.danger.light) : theme?.muted ?? "#7A716A");
  const 돌아가는색 = colors?.muted ?? theme?.primary ?? "#3F4C8F";
  const 버튼바탕 = colors?.button ?? theme?.primarySoft ?? "#F0EDFF";
  const 버튼글자 = colors?.text ?? theme?.primary ?? "#3F4C8F";

  return (
    <View
      accessibilityLiveRegion={실패 ? "assertive" : "polite"}
      pointerEvents={pointerEvents}
      style={[세로 ? styles.세로 : styles.가로, style]}
    >
      {!실패 && <ActivityIndicator color={돌아가는색} />}
      <Text style={[styles.말, 세로 && styles.가운데, !세로 && styles.늘림, { color: 글자색 }]}>
        {실패 ? error : loadingText}
      </Text>
      {실패 && onRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          style={({ pressed }) => [styles.버튼, { backgroundColor: 버튼바탕 }, pressed && styles.눌림]}
        >
          <Glyph name="retry" size={아이콘.작게} color={버튼글자} weight={2.2} />
          <Text style={[styles.버튼글, { color: 버튼글자 }]}>{retryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  가로: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 여백.세로,
  },
  세로: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 여백.가로,
    paddingHorizontal: 여백.가로,
  },
  // 가로일 때만 늘린다. 세로에서 늘리면 글이 왼쪽 끝에 붙어 가운데가 어긋난다.
  늘림: { flex: 1, minWidth: 0 },
  가운데: { textAlign: "center" },
  말: { fontSize: typo.body.size, lineHeight: typo.body.line, fontFamily: typo.body.family },
  버튼: {
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 여백.가로좁게,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  버튼글: { fontSize: typo.body.size, fontFamily: typo.label.family },
  눌림: { opacity: 불투명도.눌림 },
});
