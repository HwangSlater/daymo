import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text, TextInput } from "./AppText";
import { DaymoApiError } from "./auth";
import { FEEDBACK_KINDS, FEEDBACK_MAX, feedbackReady, sendFeedback, type FeedbackKind } from "./feedback";
import { Glyph } from "./Glyph";
import { showAlert } from "./showAlert";
import type { AppTheme } from "./theme";
import { 모서리, 누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";
import { Chip, ChipRow } from "./ui/Chip";
import { SheetShell } from "./ui/SheetShell";

/**
 * 의견을 적어 보내는 창. 우리 탭 맨 위 카드와 설정의 「의견 보내기」가 연다.
 *
 * 종류를 하나 고르고 글을 적는다. 앱 버전과 기기 종류가 함께 간다. 답장은 없다.
 */
export function FeedbackSheet({ theme, onClose }: { theme: AppTheme; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("problem");
  const [body, setBody] = useState("");
  const send = async () => {
    try {
      await sendFeedback(kind, body);
      onClose();
      showAlert("의견을 보냈어요", "보내 주셔서 고마워요. 하나하나 읽어 볼게요.");
    } catch (caught) {
      showAlert(
        "의견을 보내지 못했어요",
        caught instanceof DaymoApiError && caught.status === 429 ? caught.message : "잠시 후 다시 시도해 주세요.",
      );
    }
  };
  return (
    <SheetShell
      theme={theme}
      visible
      title="의견 보내기"
      submit="보내기"
      onSubmit={send}
      submitDisabled={!feedbackReady(body)}
      disabledHint="내용을 적어 주세요"
      hasUnsavedChanges={Boolean(body.trim())}
      onClose={onClose}
    >
      <Text style={[styles.lead, { color: theme.muted }]}>
        불편했던 점이나 있었으면 하는 기능을 적어 주세요. 보내 주신 의견은 모두 읽어요.
      </Text>
      <ChipRow>
        {FEEDBACK_KINDS.map((하나) => (
          <Chip key={하나.value} theme={theme} label={하나.label} on={kind === 하나.value} onPress={() => setKind(하나.value)} />
        ))}
      </ChipRow>
      <TextInput
        accessibilityLabel="의견 내용"
        value={body}
        onChangeText={(text) => setBody(text.slice(0, FEEDBACK_MAX))}
        placeholder={kind === "problem" ? "예: 사진을 올릴 때 순서를 바꿀 수 없어요" : kind === "idea" ? "예: 여행 일정을 달력 앱으로 보내고 싶어요" : "자유롭게 적어 주세요"}
        placeholderTextColor={theme.muted}
        multiline
        textAlignVertical="top"
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
      />
      <Text style={[styles.foot, { color: theme.muted }]}>앱 버전과 기기 종류가 함께 보내져요</Text>
    </SheetShell>
  );
}

/**
 * 우리 탭 맨 위 카드. ✕ 로 닫으면 이 기기에서는 다시 뜨지 않는다.
 */
export function FeedbackCard({ theme, onOpen, onHide }: { theme: AppTheme; onOpen: () => void; onHide: () => void }) {
  return (
    <View style={[styles.card, { backgroundColor: theme.primarySoft }]}>
      <View style={styles.cardCopy}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Daymo를 같이 만들어 주세요</Text>
        <Text style={[styles.cardBody, { color: theme.muted }]}>불편한 점, 있었으면 하는 기능을 알려 주세요</Text>
      </View>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="의견 보내기"
        style={({ pressed }) => [styles.cardButton, { backgroundColor: theme.primary }, pressed && styles.pressed]}
      >
        <Text style={styles.cardButtonText}>의견 보내기</Text>
      </Pressable>
      <Pressable
        onPress={onHide}
        accessibilityRole="button"
        accessibilityLabel="의견 보내기 안내 닫기"
        hitSlop={누름여유(28)}
        style={({ pressed }) => [styles.cardClose, pressed && styles.pressed]}
      >
        <Glyph name="close" size={13} color={theme.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 13.5, lineHeight: 20, fontFamily: typo.body.family, marginBottom: 14 },
  input: {
    marginTop: 14,
    minHeight: 150,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typo.body.family,
  },
  foot: { fontSize: 12, fontFamily: typo.body.family, marginTop: 10, textAlign: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 모서리.구역,
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 30,
    marginBottom: 12,
  },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 14.5, fontFamily: typo.title.family },
  cardBody: { fontSize: 12.5, lineHeight: 18, fontFamily: typo.body.family },
  cardButton: { borderRadius: 모서리.원, paddingHorizontal: 14, paddingVertical: 9 },
  cardButtonText: { color: "#FFFFFF", fontSize: 13, fontFamily: typo.title.family },
  cardClose: { position: "absolute", top: 8, right: 10, padding: 4 },
  pressed: { opacity: 0.7 },
});
