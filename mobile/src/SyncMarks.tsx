/**
 * 아직 서버에 못 올린 것을 알리는 두 조각.
 *
 * - `SyncNotice` 는 화면 위쪽에 늘 있는 한 줄이다. 토스트와 달리 사라지지 않는다.
 * - `SyncMark` 는 줄 하나에 붙는 흐린 글씨다. 어느 줄이 문제인지 여기서만 알 수 있다.
 *
 * 무엇을 알릴지는 `listSync.ts` 가 정한다. 여기서는 그리기만 한다.
 */

import { Platform, Pressable, StyleSheet, View } from "react-native";

import { useAnnounce } from "./announce";
import { Text } from "./AppText";
import { troubleHeadline } from "./listSync";
import { 글자누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";
import type { AppTheme } from "./theme";
import { useSyncTrouble } from "./useListSync";

/**
 * 위쪽 한 줄과 새로고침 버튼.
 *
 * 웹의 `RefreshControl` 은 아무 일도 하지 않는 빈 칸이라(react-native-web) 당겨서
 * 새로고침이 되지 않는다. 그래서 웹에서만 작은 버튼을 같이 둔다.
 */
export function SyncNotice({ theme, refreshing, onRefresh }: {
  theme?: AppTheme;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const trouble = useSyncTrouble();
  const message = troubleHeadline(trouble);
  // 안드로이드는 아래 줄의 `accessibilityLiveRegion` 이, iOS VoiceOver 는 이것이 읽는다.
  // live region 은 안드로이드만 듣기 때문에 둘을 같이 둔다(`announce.ts`).
  useAnnounce(message);
  const web = Platform.OS === "web" && Boolean(onRefresh);
  if (!message && !web) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, { borderBottomColor: theme?.border ?? "#E5E3DD" }, message && {
        backgroundColor: theme?.primarySoft ?? "#FFEEFF",
      }]}
    >
      <Text numberOfLines={2} style={[styles.noticeText, { color: theme?.text ?? "#17233D" }]}>
        {message}
      </Text>
      {web && (
        <Pressable
          onPress={onRefresh}
          disabled={refreshing}
          hitSlop={글자누름여유}
          accessibilityRole="button"
          accessibilityLabel="새로고침"
        >
          <Text style={[styles.noticeAction, { color: theme?.primary ?? "#835C93" }]}>
            {refreshing ? "불러오는 중…" : "새로고침"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** 줄 하나에 붙는 표시. 아무 일도 없으면 아무것도 그리지 않는다. */
export function SyncMark({ id, color }: { id?: string; color?: string }) {
  const trouble = useSyncTrouble();
  const row = id ? trouble.rows.get(id) : undefined;
  if (!row) return null;
  const label = row.state === "대기"
    ? "저장 대기 중"
    : row.reason ? `저장 안 됨 · ${row.reason}` : "저장 안 됨";
  return (
    <Text numberOfLines={2} style={[styles.mark, color ? { color } : null]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  noticeText: { flex: 1, fontSize: typo.caption.size, fontFamily: typo.caption.family },
  noticeAction: { fontSize: typo.label.size, fontFamily: typo.label.family },
  mark: { fontSize: typo.caption.size, fontFamily: typo.caption.family, color: "#A1563D", marginTop: 2 },
});
