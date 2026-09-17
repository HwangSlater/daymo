import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Text } from "./AppText";
import { DaymoApiError } from "./auth";
import { trashLeftLabel, type ServerTrashItem } from "./memorySync";
import { listTrash, restoreFromTrash } from "./serverData";
import type { AppTheme } from "./theme";
import { typo } from "./theme/typography";

type Props = {
  /** 서버 여행 id. 예시 여행이면 부르지 않는다. */
  tripId: string;
  appTheme?: AppTheme;
  /** 되살렸다. 부른 쪽이 그 목록을 서버에서 다시 받는다. */
  onRestored: (item: ServerTrashItem) => void;
  notify: (message: string) => void;
};

/**
 * 여행 메모 시트 아래의 휴지통. 지운 뒤 7일 안의 메모와 사진을 보여 주고 되돌린다.
 *
 * 펼칠 때마다 서버에서 새로 받는다. 기기에 두지 않는다. 지운 것은 서버에만 남아 있고,
 * 연결이 없으면 되살릴 수도 없다. owner·editor 에게만 넘긴다(서버도 보기만 하면 403).
 */
export function TripTrash({ tripId, appTheme, onRestored, notify }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ServerTrashItem[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setError("");
    setItems(null);
    try {
      setItems(await listTrash(tripId));
    } catch (caught) {
      setError(caught instanceof DaymoApiError ? caught.message : "휴지통을 불러오지 못했어요.");
    }
  };

  const restore = async (item: ServerTrashItem) => {
    setBusyId(item.id);
    try {
      await restoreFromTrash(item.type, item.id);
      setItems((current) => current?.filter((row) => row.id !== item.id) ?? null);
      onRestored(item);
      notify(item.type === "memo" ? "메모를 되돌렸어요" : "사진을 되돌렸어요");
    } catch (caught) {
      if (caught instanceof DaymoApiError && caught.status === 410) {
        setItems((current) => current?.filter((row) => row.id !== item.id) ?? null);
      }
      notify(caught instanceof DaymoApiError ? caught.message : "되돌리지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusyId(null);
    }
  };

  const text = appTheme?.text ?? "#2B2622";
  const muted = appTheme?.muted ?? "#7A716A";
  const primary = appTheme?.primary ?? "#C0643F";

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        onPress={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
        style={styles.toggle}
      >
        <Text style={[styles.toggleText, { color: muted }]}>{open ? "휴지통 닫기" : "휴지통 · 삭제한 메모와 사진을 7일간 보관해요"}</Text>
      </Pressable>
      {open && (
        <View style={[styles.list, { borderColor: appTheme?.border ?? "#EEEAE5" }]}>
          {!items && !error && <ActivityIndicator color={primary} style={styles.loading} />}
          {!!error && <Text style={[styles.empty, { color: muted }]}>{error}</Text>}
          {items?.length === 0 && <Text style={[styles.empty, { color: muted }]}>삭제한 메모와 사진이 없어요</Text>}
          {items?.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={[styles.title, { color: text }]}>
                  {item.type === "memo" ? "메모" : "사진"} · {item.preview || (item.type === "memo" ? "내용 없음" : "설명 없는 사진")}
                </Text>
                <Text numberOfLines={1} style={[styles.meta, { color: muted }]}>
                  {item.deletedByName} 님이 삭제 · {trashLeftLabel(item.restoreDeadline)}
                </Text>
              </View>
              {item.canRestore ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.type === "memo" ? "메모" : "사진"} 되돌리기`}
                  disabled={busyId !== null}
                  hitSlop={8}
                  onPress={() => void restore(item)}
                >
                  <Text style={[styles.action, { color: primary }, busyId === item.id && { opacity: 0.5 }]}>되돌리기</Text>
                </Pressable>
              ) : (
                <Text style={[styles.meta, { color: muted }]}>올린 사람과 관리자만 되돌릴 수 있어요</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  toggle: { alignSelf: "flex-start", paddingVertical: 4 },
  toggleText: { fontSize: typo.label.size, fontFamily: typo.label.family },
  list: { marginTop: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  loading: { paddingVertical: 12 },
  empty: { fontSize: typo.caption.size, paddingVertical: 12, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  copy: { flex: 1 },
  title: { fontSize: typo.body.size },
  meta: { fontSize: typo.caption.size, marginTop: 2 },
  action: { fontSize: typo.label.size, fontFamily: typo.label.family },
});
