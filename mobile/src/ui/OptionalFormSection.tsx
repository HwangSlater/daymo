import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "../AppText";
import { Glyph } from "../Glyph";
import { AppTheme } from "../theme";
import { 높이, 모서리, 불투명도, 아이콘 } from "../theme/controls";
import { typo } from "../theme/typography";

/**
 * 매번 쓰지는 않는 칸들을 한 줄 아래로 접는다.
 *
 * 닫혀 있으면 「＋ 장소 · 메모 더 적기」 한 줄뿐이다. 시트가 열릴 때 그 칸에 값이
 * 있으면(고치는 중) 부르는 쪽이 `open` 을 켜서 연다. 필수 칸은 여기 넣지 않는다.
 * 예약처럼 펴는 것이 곧 「있어요」 인 칸은 `switchLabel` 을 주면 상자 모양 그대로다.
 *
 *     <OptionalFormSection theme={theme} label="한 줄 메모"
 *       summary={note.trim() || undefined}
 *       open={noteOpen} onToggle={() => setNoteOpen((열림) => !열림)}>
 *       {칸들}
 *     </OptionalFormSection>
 */
export function OptionalFormSection({
  theme,
  label,
  summary,
  open: openProp,
  onToggle,
  editable = true,
  switchLabel,
  children,
}: {
  theme?: AppTheme;
  /** 안에 든 칸 이름을 「장소 · 메모」처럼 가운뎃점으로 잇는다. 「더 적기」는 여기서 붙인다. */
  label: string;
  /** 접힌 채로 값이 있을 때 줄 끝에 흐리게 보이는 요약. 없으면 비운다. */
  summary?: string;
  open: boolean;
  onToggle: () => void;
  /** 고칠 수 없는 화면. 펼칠 수 없으니 처음부터 펼쳐 둔다. */
  editable?: boolean;
  /**
   * 켜고 끄는 뜻이 담긴 칸일 때 오른쪽 버튼에 함께 적는 말.
   *
   * 접었다 펴기만 하는 칸은 ＋/－ 만으로 충분하다. 그런데 예약처럼 펴는 것이
   * 곧 "있어요" 인 칸은 그 기호만 보고는 무엇이 생기는지 알 수 없다.
   */
  switchLabel?: (open: boolean) => string;
  children: React.ReactNode;
}) {
  // 보기만 하는 시트에서는 펼칠 수 없으니 처음부터 펼쳐 둔다.
  const open = editable ? openProp : true;
  if (!switchLabel) {
    return (
      <View style={styles.fold}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${label} ${open ? "접기" : "더 적기"}`}
          style={({ pressed }) => [styles.foldRow, pressed && styles.controlPressed]}
        >
          <Glyph name={open ? "minus" : "plus"} size={아이콘.작게} color={theme?.primary ?? "#6556D8"} />
          <Text style={[styles.foldText, theme && { color: theme.primary }]}>
            {open ? `${label} 접기` : `${label} 더 적기`}
          </Text>
          {!open && summary ? (
            <Text numberOfLines={1} style={[styles.foldSummary, theme && { color: theme.muted }]}>{summary}</Text>
          ) : null}
        </Pressable>
        {open && <View style={styles.foldBody}>{children}</View>}
      </View>
    );
  }
  return (
    <View
      style={[
        styles.optionalSection,
        theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
      ]}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={switchLabel ? switchLabel(open) : `${label} ${open ? "접기" : "펼치기"}`}
        style={({ pressed }) => [
          styles.optionalSectionHead,
          pressed && styles.controlPressed,
        ]}
      >
        <View style={styles.optionalSectionCopy}>
          <Text style={[styles.optionalSectionLabel, theme && { color: theme.text }]}>{label}</Text>
          {summary ? (
            <Text numberOfLines={1} style={[styles.optionalSectionSummary, theme && { color: theme.muted }]}>{summary}</Text>
          ) : null}
        </View>
        <View style={[styles.optionalSectionSwitch, theme && { backgroundColor: theme.surface }]}>
          <Text numberOfLines={1} style={[styles.optionalSectionSwitchText, theme && { color: theme.primary }]}>
            {switchLabel(open)}
          </Text>
          <Glyph name={open ? "minus" : "plus"} size={아이콘.보통} color={theme?.primary ?? "#6556D8"} />
        </View>
      </Pressable>
      {open && (
        <View style={[styles.optionalSectionBody, theme && { borderTopColor: theme.border }]}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  optionalSection: {
    borderWidth: 1,
    borderRadius: 모서리.구역,
    backgroundColor: "#F6F4F0",
    marginBottom: 16,
    overflow: "hidden",
  },
  optionalSectionHead: {
    minHeight: 62,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionalSectionCopy: { flex: 1, minWidth: 0 },
  optionalSectionLabel: { fontSize: 14, fontFamily: typo.label.family },
  optionalSectionSummary: { fontSize: 11, lineHeight: 15, fontFamily: typo.caption.family, marginTop: 3 },
  // 말이 붙은 스위치는 네모 버튼보다 넓다. 너비를 글자가 정하도록 자리를 따로 만든다.
  // 높이 32 와 모서리 12 는 상자 안에 들어앉는 작은 단추라 네 단계에 들어가지 않는다.
  optionalSectionSwitch: {
    height: 32,
    borderRadius: 모서리.행,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    // 왼쪽 설명이 flex:1 이라 이쪽을 눌러 줄인다. 줄어들면 글자가 세로로 쌓인다.
    flexShrink: 0,
  },
  optionalSectionSwitchText: { fontSize: 12, fontFamily: typo.label.family },
  optionalSectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#DDD9D1",
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  // 「＋ 장소 · 메모 더 적기」 한 줄과 펼쳤을 때 그 아래 칸들.
  fold: { marginBottom: 12 },
  foldRow: { minHeight: 높이.버튼, flexDirection: "row", alignItems: "center", gap: 6 },
  foldText: { fontSize: 14, fontFamily: typo.label.family },
  foldSummary: { flex: 1, minWidth: 0, textAlign: "right", fontSize: 11, fontFamily: typo.caption.family },
  foldBody: { paddingTop: 4 },
  controlPressed: { opacity: 불투명도.눌림, transform: [{ scale: 0.99 }] },
});
