import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { Text } from "../AppText";
import { Glyph } from "../Glyph";
import { AppTheme } from "../theme";
import { 그림자, 불투명도, 아이콘, 모서리, 여백 } from "../theme/controls";
import { typo } from "../theme/typography";

/**
 * 떴다 사라지는 한 줄.
 *
 * 같은 줄이 세 파일에 따로 있었다(`PhotoGallery`·`WarmTripDetail`·`PhotoViewer`).
 * 앞의 둘은 사실상 복사본이었고, 세 번째만 알약 모양에 다른 자리였다. 되돌리기
 * 단추가 밑줄이 있기도 없기도 했고, 사라지는 데 걸리는 시간도 2400 과 2200 으로
 * 달랐다. 모양은 여기로 모으고, **어디에 띄울지는 부르는 쪽이 `style` 로 정한다** —
 * 사진첩은 아래 줄 높이만큼 띄우고, 크게 보기는 도구 칸 위에 둬야 해서다.
 *
 *     <Toast theme={theme} style={{ left: 20, right: 20, bottom: 18 }}
 *       text="지웠어요" action="되돌리기" onAction={되돌리기} />
 */
export function Toast({
  theme,
  text,
  action,
  onAction,
  mark = "점",
  markColor,
  colors,
  style,
  pointerEvents,
}: {
  theme?: AppTheme;
  text: string;
  /** 되돌리기처럼 이 줄에서 바로 하는 일. 글은 부르는 쪽이 정한다. */
  action?: string;
  onAction?: () => void;
  /** 왼쪽 표식. 끝난 일을 알릴 때는 체크, 그 밖에는 점, 필요 없으면 없음. */
  mark?: "점" | "완료" | "없음";
  markColor?: string;
  /**
   * 테마를 따르지 않는 자리에서만.
   *
   * 사진 위에 얹히는 줄은 폰이 밝은 모드여도 늘 어둡다.
   */
  colors?: { background: string; text: string };
  style?: StyleProp<ViewStyle>;
  /** 되돌리기가 없는 줄이 사진을 덮고 있으면 그 자리를 누를 수 없다. */
  pointerEvents?: "none" | "box-none" | "auto";
}) {
  const 바탕 = colors ? colors.background : theme?.text ?? "#17233D";
  const 글자 = colors ? colors.text : theme?.dark ? theme.background : "#FFFFFF";
  const 표식색 = markColor ?? (colors ? colors.text : theme?.primary ?? "#FF6B63");
  return (
    <View
      accessibilityLiveRegion="polite"
      pointerEvents={pointerEvents}
      style={[styles.toast, { backgroundColor: 바탕 }, style]}
    >
      {mark === "점" && <View style={[styles.mark, { backgroundColor: 표식색 }]} />}
      {mark === "완료" && <Glyph name="check" size={아이콘.보통} color={표식색} weight={2.4} />}
      <Text style={[styles.text, { color: 글자 }]}>{text}</Text>
      {action && onAction && (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
          hitSlop={10}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={[styles.actionText, { color: 글자 }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    minHeight: 46,
    borderRadius: 모서리.구역,
    paddingHorizontal: 여백.가로,
    paddingVertical: 여백.세로좁게,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...그림자.뜬것,
  },
  mark: { width: 7, height: 7, borderRadius: 모서리.원 },
  text: { flex: 1, fontSize: 14, fontFamily: typo.label.family },
  action: { marginLeft: 4, paddingVertical: 6 },
  actionText: { fontSize: 14, fontFamily: typo.title.family, textDecorationLine: "underline" },
  pressed: { opacity: 불투명도.눌림 },
});
