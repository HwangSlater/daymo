/**
 * 기념 카드 꾸미기 — 카드를 크게 띄우고 그 위에서 직접 꾸미는 화면.
 *
 * 시트 안에서 칩으로 켜고 끄던 스티커를, 인생네컷처럼 손으로 끌어 옮기고 키우고
 * 돌린다. 앱의 다른 화면과 모양이 다르다. 사진이 주인공이라 바탕을 어둡게 깔고
 * 도구를 아래로 몰았다. 글꼴과 강조색은 앱 것을 그대로 쓴다.
 *
 * 지키는 것 셋.
 *   1. 꾸미는 동안 카드가 통째로 보인다. 화면에서 남는 칸을 재서 카드를 그만큼
 *      줄인다(`fitScaleOf`). 세로로 긴 네컷 스트립도 스크롤 없이 한눈에 든다.
 *      도구는 카드 아래 제 칸에 있어서 카드를 가리지 않는다.
 *   2. 끄는 동안 다시 그리지 않는다. 움직이는 스티커만 `Animated` 로 밀고
 *      (`KeepsakeCardView` 의 `DecorItem`), 손을 뗄 때 한 번 상태로 올린다.
 *   3. 자리는 카드 크기에 대한 비율로만 들고 있는다. 줄여 보여 줘도 내보낸
 *      그림에서 같은 자리에 찍힌다.
 */

import { memo, useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { Text } from "./AppText";
import { Glyph } from "./Glyph";
import { KeepsakeCardView, ScaledCard, STICKER_LOOK, type CardPhoto } from "./KeepsakeCardView";
import {
  addDecor,
  fitScaleOf,
  moveDecor,
  raiseDecor,
  removeDecor,
  resizeDecor,
  setDecorText,
  turnDecor,
  DECOR_MAX,
  DECOR_TEXT_MAX,
  KEEPSAKE_STICKERS,
  type CardDecor,
  type KeepsakeSticker,
} from "./cardDecor";
import type { AppTheme } from "./theme";
import { onAccent } from "./theme/colors";
import { typo } from "./theme/typography";
import { keepsakeSizeOf, type KeepsakeCard } from "./tripCard";
import { useWebKeyboardInset } from "./useWebKeyboardInset";

/** 카드를 띄울 칸의 안쪽 여백. 카드가 화면 끝에 붙지 않게 한다. */
const STAGE_PAD = 20;

/** 도구 단추 하나. 누를 때마다 목록이 바뀌므로 `memo` 로 감싸 둔다. */
const Tool = memo(function Tool({
  label,
  tone,
  theme,
  onPress,
}: {
  label: string;
  /** 위험한 것(삭제)만 다른 색이다. */
  tone?: "위험";
  theme?: AppTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tool,
        tone === "위험" && styles.toolDanger,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.toolText, tone === "위험" && styles.toolDangerText, theme && tone !== "위험" && { color: theme.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
});

export function CardDecorEditor({
  visible,
  card,
  photos,
  text,
  stats,
  stamp,
  theme,
  onClose,
  onSave,
}: {
  visible: boolean;
  card: KeepsakeCard;
  photos: CardPhoto[];
  text: { title: string; meta: string; caption: string; people: string };
  stats: { label: string; value: string }[];
  stamp: string;
  theme?: AppTheme;
  /** 꾸민 것을 버리고 나간다. */
  onClose: () => void;
  /** 꾸민 것을 카드에 넣고 저장한다. */
  onSave: (decor: CardDecor[]) => void;
}) {
  // 열 때 지금 카드에서 시작한다. 부르는 쪽이 열 때만 이 화면을 만들기 때문에,
  // 나갔다 다시 열면 저장된 것에서 다시 시작한다.
  const [decor, setDecor] = useState<CardDecor[]>(card.decor);
  const [고른_것, 고르기] = useState("");
  const [칸, 칸재기] = useState({ width: 0, height: 0 });
  const keyboardInset = useWebKeyboardInset(visible);

  const size = keepsakeSizeOf(card.ratio, card.style);
  const scale = fitScaleOf(
    size.width,
    size.height,
    칸.width - STAGE_PAD * 2,
    칸.height - STAGE_PAD * 2,
  );
  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    칸재기((지금) => (지금.width === width && 지금.height === height ? 지금 : { width, height }));
  }, []);

  const onMove = useCallback((id: string, x: number, y: number) => {
    setDecor((지금) => moveDecor(지금, id, x, y));
  }, []);
  const edit = useMemo(
    () => ({ selectedId: 고른_것, scale, onSelect: 고르기, onMove }),
    [고른_것, scale, onMove],
  );
  const 보여줄_카드 = useMemo(() => ({ ...card, decor }), [card, decor]);
  const 고른_줄 = decor.find((하나) => 하나.id === 고른_것);

  const 붙이기 = (kind: KeepsakeSticker | "글자") => {
    if (decor.length >= DECOR_MAX) return;
    const 다음 = addDecor(decor, kind, kind === "글자" ? "여기에 적기" : "");
    setDecor(다음);
    고르기(다음[다음.length - 1].id);
  };
  const 고친다 = (바꿈: (list: CardDecor[], id: string) => CardDecor[]) => {
    if (!고른_것) return;
    setDecor((지금) => 바꿈(지금, 고른_것));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.screen, theme && { backgroundColor: theme.dark ? theme.background : "#1B1A18" }, keyboardInset]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.head}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="꾸미기 나가기"
            style={({ pressed }) => [styles.headButton, pressed && styles.pressed]}
          >
            <Text style={styles.headBack}>나가기</Text>
          </Pressable>
          <Text style={styles.headTitle}>카드 꾸미기</Text>
          <Pressable
            onPress={() => onSave(decor)}
            accessibilityRole="button"
            accessibilityLabel="꾸민 카드 저장"
            style={({ pressed }) => [
              styles.headSave,
              theme && { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.headSaveText, theme && { color: onAccent(theme.dark) }]}>저장</Text>
          </Pressable>
        </View>

        <View style={styles.stage} onLayout={onStageLayout} accessibilityLabel="꾸미는 카드">
          {칸.width > 0 && (
            <ScaledCard scale={scale} width={size.width} height={size.height}>
              <KeepsakeCardView
                card={보여줄_카드}
                photos={photos}
                text={text}
                stats={stats}
                stamp={stamp}
                big={false}
                edit={edit}
              />
            </ScaledCard>
          )}
        </View>

        <View style={styles.tools}>
          <Text style={styles.hint}>
            {고른_줄
              ? "끌어서 옮기고, 아래 단추로 크기와 각도를 바꿔요"
              : decor.length
                ? "스티커를 눌러 고르거나 끌어서 옮겨요"
                : "아래에서 스티커를 눌러 카드에 붙여요"}
          </Text>

          {Boolean(고른_줄) && (
            <View style={styles.toolRow}>
              <Tool label="작게" theme={theme} onPress={() => 고친다((l, id) => resizeDecor(l, id, false))} />
              <Tool label="크게" theme={theme} onPress={() => 고친다((l, id) => resizeDecor(l, id, true))} />
              <Tool label="왼쪽" theme={theme} onPress={() => 고친다((l, id) => turnDecor(l, id, false))} />
              <Tool label="오른쪽" theme={theme} onPress={() => 고친다((l, id) => turnDecor(l, id, true))} />
              <Tool label="뒤로" theme={theme} onPress={() => 고친다((l, id) => raiseDecor(l, id, false))} />
              <Tool label="앞으로" theme={theme} onPress={() => 고친다((l, id) => raiseDecor(l, id, true))} />
              <Tool
                label="삭제"
                tone="위험"
                theme={theme}
                onPress={() => {
                  고친다(removeDecor);
                  고르기("");
                }}
              />
            </View>
          )}

          {고른_줄?.kind === "글자" && (
            <TextInput
              value={고른_줄.text}
              onChangeText={(값) => 고친다((l, id) => setDecorText(l, id, 값))}
              placeholder="카드에 적을 짧은 말"
              placeholderTextColor="#8C8378"
              maxLength={DECOR_TEXT_MAX}
              accessibilityLabel="카드에 적을 글"
              style={styles.textInput}
            />
          )}

          <View style={styles.paletteRow}>
            {KEEPSAKE_STICKERS.map((sticker) => (
              <Pressable
                key={sticker}
                onPress={() => 붙이기(sticker)}
                accessibilityRole="button"
                accessibilityLabel={`${sticker} 스티커 붙이기`}
                style={({ pressed }) => [styles.palette, pressed && styles.pressed]}
              >
                <Glyph name={STICKER_LOOK[sticker].glyph} size={24} color={STICKER_LOOK[sticker].color} />
              </Pressable>
            ))}
            <Pressable
              onPress={() => 붙이기("글자")}
              accessibilityRole="button"
              accessibilityLabel="글자 붙이기"
              style={({ pressed }) => [styles.palette, styles.paletteWide, pressed && styles.pressed]}
            >
              <Text style={styles.paletteText}>글자</Text>
            </Pressable>
          </View>
          <Text style={styles.count}>
            {decor.length >= DECOR_MAX
              ? `카드 하나에 ${DECOR_MAX}개까지 붙일 수 있어요`
              : `${decor.length}개 붙였어요`}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // 사진이 주인공이라 바탕을 어둡게 깐다. 앱의 다른 화면과 일부러 다르다.
  screen: { flex: 1, backgroundColor: "#1B1A18" },
  pressed: { opacity: 0.65 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 52 : 18,
    paddingBottom: 10,
    gap: 10,
  },
  headButton: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 64 },
  headBack: { fontSize: 13, color: "#D8D2C8", fontFamily: typo.label.family },
  headTitle: { fontSize: 15, color: "#F6F1E7", fontFamily: typo.title.family },
  headSave: {
    minWidth: 64,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3F4C8F",
  },
  headSaveText: { fontSize: 13, color: "#FFFFFF", fontFamily: typo.label.family },
  // 남는 칸을 다 쓴다. 이 칸의 크기로 카드를 얼마나 줄일지 정한다.
  stage: { flex: 1, alignItems: "center", justifyContent: "center", padding: STAGE_PAD },
  // 도구 칸의 높이를 고정한다. 고른 것에 따라 줄이 늘었다 줄면 그때마다 카드가
  // 다시 맞춰져 위아래로 튄다. 다 편 높이로 잡아 두면 카드가 제자리에 있는다.
  tools: {
    minHeight: 246,
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 14,
    gap: 8,
  },
  hint: { fontSize: 12, color: "#B5AB9E", textAlign: "center", fontFamily: typo.label.family },
  toolRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  tool: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2C2A28",
  },
  toolText: { fontSize: 12, color: "#F6F1E7", fontFamily: typo.label.family },
  toolDanger: { backgroundColor: "#4A2320" },
  toolDangerText: { color: "#E7A79F" },
  textInput: {
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#2C2A28",
    color: "#F6F1E7",
    fontSize: 14,
    fontFamily: typo.body.family,
  },
  paletteRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  palette: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2C2A28",
  },
  paletteWide: { width: 54 },
  paletteText: { fontSize: 13, color: "#F6F1E7", fontFamily: typo.label.family },
  count: { fontSize: 11, color: "#8C8378", textAlign: "center", fontFamily: typo.label.family },
});
