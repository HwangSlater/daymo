import { useEffect } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";

import { Text } from "./AppText";
import { Glyph } from "./Glyph";
import { CheckBox } from "./ui/CheckBox";
import type { PastTripGroup } from "./pastTripImport";
import { AppTheme } from "./theme";
import { 높이, 모서리, 아이콘, 누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";

/**
 * 추가 시트 안에서 내용을 갈아 끼우는 「지난 여행에서 가져오기」 목록.
 *
 * 따로 창을 띄우지 않는다. iOS 는 창 위에 창을 못 쌓아서, 요리·준비물 추가 시트가
 * 열린 채로 그 안의 내용만 이 목록으로 바꾼다. 여행별로 묶어 놓고 줄마다 이름과
 * 한 줄 설명(재료 개수, 수량·담당)을 적는다.
 *
 * 하나만 고르는 자리(요리)는 누르는 순간 가져가고, 여럿 고르는 자리(준비물)는
 * 체크해 두었다가 시트 아래 버튼으로 담는다.
 */
export function PastTripList<T extends { id: string; name: string }>({
  theme,
  label,
  groups,
  loading,
  error,
  onRetry,
  onBack,
  mode,
  selected,
  onPress,
  onToggleAll,
  meta,
  footnote,
}: {
  theme?: AppTheme;
  /** 「요리」·「준비물」. 빈 목록 문장에 쓴다. */
  label: string;
  groups: PastTripGroup<T>[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  /** 「직접 입력」으로 돌아간다. */
  onBack: () => void;
  mode: "하나" | "여럿";
  /** 여럿 고르는 자리에서 체크된 줄의 `key`. */
  selected?: readonly string[];
  onPress: (row: T, key: string) => void;
  onToggleAll?: () => void;
  /** 줄 아래 한 줄 설명. */
  meta: (row: T) => string;
  footnote?: string;
}) {
  // 입력 칸에 커서가 있던 채로 넘어오면 키보드가 목록 절반을 가린다.
  useEffect(() => {
    Keyboard.dismiss();
  }, []);

  const pickable = groups.flatMap((group) => group.rows).filter((row) => !row.mine);
  const allChecked = pickable.length > 0 && pickable.every((row) => selected?.includes(row.key));
  const muted = theme?.muted ?? "#646C7A";
  const primary = theme?.primary ?? "#3F4C8F";

  return (
    <View>
      <View style={styles.head}>
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={누름여유(높이.칩)} style={styles.headLink}>
          <Glyph name="chevronLeft" size={아이콘.작게} color={primary} />
          <Text style={[styles.headLinkText, { color: primary }]}>직접 입력</Text>
        </Pressable>
        {mode === "여럿" && pickable.length > 0 && onToggleAll ? (
          <Pressable onPress={onToggleAll} accessibilityRole="button" hitSlop={누름여유(높이.칩)}>
            <Text style={[styles.headLinkText, { color: primary }]}>{allChecked ? "전체 해제" : "전체 선택"}</Text>
          </Pressable>
        ) : null}
      </View>
      {loading ? <Text style={[styles.hint, { color: muted }]}>불러오는 중이에요</Text> : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={[styles.hint, { color: theme?.accent ?? "#B4453B" }]}>{error}</Text>
          <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={누름여유(높이.칩)}>
            <Text style={[styles.headLinkText, { color: primary }]}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
      {!loading && !error && groups.length === 0 ? (
        <Text style={[styles.hint, { color: muted }]}>지난 여행에 적어 둔 {label}{label === "요리" ? "가" : "이"} 없어요</Text>
      ) : null}
      {groups.map((group) => (
        <View
          key={group.tripId}
          style={[styles.group, { backgroundColor: theme?.surface ?? "#FFFFFF", borderColor: theme?.border ?? "#E5E3DD" }]}
        >
          <View style={styles.groupHead}>
            <Text numberOfLines={1} style={[styles.groupTitle, { color: theme?.text ?? "#1F2430" }]}>{group.title}</Text>
            <Text numberOfLines={1} style={[styles.groupPeriod, { color: muted }]}>{group.period}</Text>
          </View>
          {group.rows.map(({ key, row, mine }) => {
            const checked = mode === "여럿" && Boolean(selected?.includes(key));
            const note = [meta(row), mine ? "이미 있어요" : ""].filter(Boolean).join(" · ");
            return (
              <Pressable
                key={key}
                disabled={mine}
                onPress={() => onPress(row, key)}
                accessibilityRole={mode === "여럿" ? "checkbox" : "button"}
                accessibilityState={mode === "여럿" ? { checked, disabled: mine } : { disabled: mine }}
                accessibilityLabel={`${group.title} · ${row.name}${mine ? " 이미 있음" : ""}`}
                style={({ pressed }) => [
                  styles.row,
                  { borderTopColor: theme?.border ?? "#EEEAE5" },
                  (checked || (pressed && !mine)) && { backgroundColor: theme?.primarySoft ?? "#F0EDFF" },
                ]}
              >
                {mode === "여럿" ? (
                  <CheckBox theme={theme} on={checked} style={styles.check} />
                ) : null}
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={[styles.rowName, { color: mine ? muted : theme?.text ?? "#1F2430" }]}>
                    {row.name}
                  </Text>
                  {note ? (
                    <Text numberOfLines={1} style={[styles.rowMeta, { color: muted }]}>{note}</Text>
                  ) : null}
                </View>
                {mode === "하나" && !mine ? <Glyph name="plus" size={아이콘.작게} color={primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      {footnote && !loading && groups.length > 0 ? (
        <Text style={[styles.hint, { color: muted }]}>{footnote}</Text>
      ) : null}
    </View>
  );
}

/**
 * 추가 시트의 맨 위에 두는 진입 줄. 「지난 여행에서 가져오기」 제목과 버튼 하나.
 * 요리 시트의 「여러 요리를 한 번에 추가」 상자와 같은 꼴이라 나란히 놓여도 어색하지 않다.
 */
export function PastTripEntry({ theme, hint, onPress }: { theme?: AppTheme; hint: string; onPress: () => void }) {
  return (
    <View style={[styles.entry, { backgroundColor: theme?.surfaceAlt ?? "#F6F2ED", borderColor: theme?.border ?? "#E5DED6" }]}>
      <View style={styles.entryCopy}>
        <Text style={[styles.entryTitle, { color: theme?.text ?? "#1F2430" }]}>지난 여행에서 가져오기</Text>
        <Text style={[styles.entryHint, { color: theme?.muted ?? "#646C7A" }]}>{hint}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="지난 여행에서 가져오기"
        onPress={onPress}
        hitSlop={누름여유(높이.칩)}
        style={[styles.entryButton, { backgroundColor: theme?.primarySoft ?? "#F0EDFF" }]}
      >
        <Text style={[styles.entryButtonText, { color: theme?.primary ?? "#3F4C8F" }]}>가져오기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    minHeight: 높이.칩,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headLink: { flexDirection: "row", alignItems: "center", gap: 3 },
  headLinkText: { fontSize: 14, fontFamily: typo.label.family },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  errorBox: { gap: 4, marginBottom: 8 },
  group: {
    borderRadius: 모서리.구역,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  groupHead: {
    minHeight: 높이.버튼,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  groupTitle: { flexShrink: 1, fontSize: 14, fontFamily: typo.title.family },
  groupPeriod: { flexShrink: 0, fontSize: 12, fontFamily: typo.caption.family },
  row: {
    minHeight: 높이.버튼,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  /** 체크 칸을 줄에서 띄우는 여백. 칸 자체는 `ui/CheckBox` 가 그린다. */
  check: { marginRight: 8 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontFamily: typo.title.family },
  rowMeta: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  entry: {
    borderRadius: 모서리.구역,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  entryCopy: { flex: 1, paddingRight: 8 },
  entryTitle: { fontSize: 14, fontFamily: typo.title.family },
  entryHint: { fontSize: 12, fontFamily: typo.label.family, lineHeight: 15, marginTop: 2 },
  entryButton: {
    minHeight: 높이.칩,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  entryButtonText: { fontSize: 14, fontFamily: typo.label.family },
});
