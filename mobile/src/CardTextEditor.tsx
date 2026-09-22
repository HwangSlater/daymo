/**
 * 카드에 붙인 글자를 고치는 창(2026-09-22 시안 ③). 꾸미기 도구(`CardDecorEditor.tsx`)가 띄운다.
 *
 * 위는 취소·완료, 가운데에 카드에 그려질 모습 그대로의 미리보기, 입력칸, 「글꼴·색 · 바탕」 탭과
 * 그 탭의 고를 것. 아래 막대·시트와 같은 결로 무엇을 고르는 줄인지 글로 적는다. 맨 아래에
 * 두었더니 키보드가 내려가면 너무 아래라 불편해서 가운데에 모은다. 고를 것은 여러 줄로 펼쳐
 * 넘기지 않아도 다 보인다.
 *
 * 무엇을 고칠지와 취소·완료 뒤의 일(되돌리기, 빈 글자 떼기)은 부르는 쪽이 정한다. 여기서는
 * 고른 값을 알리기만 한다.
 */

import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "./AppText";
import {
  decorTextMaxOf,
  isShapeBack,
  DECOR_BACKS,
  DECOR_COLORS,
  DECOR_COLOR_HEX,
  DECOR_FONTS,
  type CardDecor,
} from "./cardDecor";
import { INK, INK_FAINT, INK_SOFT } from "./cardToolColors";
import { DECOR_FONT_FAMILY, useDecorFonts } from "./decorFonts";
import { DecorBackSample, DecorTextPreview } from "./KeepsakeCardView";
import { typo } from "./theme/typography";

/** 글자 창의 도구 탭. 글꼴(넷)과 색(여덟)은 고를 것이 적어 한 탭에 두 줄로 둔다. */
const TEXT_TOOLS = ["글꼴·색", "바탕"] as const;

export function CardTextEditor({
  visible,
  decor,
  onText,
  onStyle,
  onCancel,
  onDone,
}: {
  visible: boolean;
  /** 고치는 글자. 창이 떠 있는 동안 카드에 있는 그 글자 그대로다. */
  decor: CardDecor | undefined;
  onText: (text: string) => void;
  onStyle: (change: Partial<Pick<CardDecor, "font" | "color" | "back">>) => void;
  /** 「취소」. 창을 열기 전 모습으로 되돌린다. */
  onCancel: () => void;
  /** 「완료」·닫기·키보드의 완료. */
  onDone: () => void;
}) {
  const fontsReady = useDecorFonts();
  const [글자_도구, 글자_도구_고르기] = useState<(typeof TEXT_TOOLS)[number]>("글꼴·색");
  const 스티커_바탕 = isShapeBack(decor?.back);
  /** 스티커 모양 바탕은 글자 수가 더 짧다. 길면 모양이 일그러지거나 글자가 작아진다. */
  const 글자_한도 = decorTextMaxOf(decor?.back);
  const [글자_알림, 글자_알림_띄우기] = useState("");
  const 입력칸 = useRef<TextInput>(null);
  const 창_여백 = useSafeAreaInsets();
  useEffect(() => {
    if (!글자_알림) return;
    const 시계 = setTimeout(() => 글자_알림_띄우기(""), 2600);
    return () => clearTimeout(시계);
  }, [글자_알림]);
  /** 바탕을 고른다. 스티커 모양인데 이미 적은 말이 그 한도보다 길면 바꾸지 않고 알린다. */
  const 바탕_고르기 = (바탕: (typeof DECOR_BACKS)[number]) => {
    const 한도 = decorTextMaxOf(바탕);
    if ((decor?.text.length ?? 0) > 한도) {
      글자_알림_띄우기(`이 모양은 ${한도}자까지 들어가요 · 말을 줄이면 고를 수 있어요`);
      return;
    }
    onStyle({ back: 바탕 });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.textSheet, { paddingTop: 창_여백.top, paddingBottom: 창_여백.bottom }]}>
        <View style={styles.textSheetTop}>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="글자 고치기 취소" hitSlop={10} style={styles.textSheetSide}>
            <Text style={styles.textSheetCancelText}>취소</Text>
          </Pressable>
          <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="글자 고치기 완료" hitSlop={10} style={[styles.textSheetSide, styles.textSheetSideRight]}>
            <Text style={styles.textSheetDoneText}>완료</Text>
          </Pressable>
        </View>
        <View style={styles.textSheetBody}>
          {/* 따로 입력칸을 두지 않는다. 카드에 그려질 글자 그대로를 보여 주고, 그것을 누르면
              적는다(처음 만든 방식). 실제로 받는 입력칸은 보이지 않게 뒤에 둔다. */}
          <Pressable
            onPress={() => 입력칸.current?.focus()}
            accessibilityRole="button"
            accessibilityLabel="눌러서 글자 적기"
            style={styles.textPreview}
          >
            {decor && decor.text.trim()
              ? <DecorTextPreview decor={decor} side={30} />
              : <Text style={styles.textPreviewEmpty}>눌러서 적어 주세요</Text>}
          </Pressable>
          <TextInput
            ref={입력칸}
            autoFocus
            value={decor?.text ?? ""}
            onChangeText={onText}
            onSubmitEditing={onDone}
            returnKeyType="done"
            maxLength={글자_한도}
            accessibilityLabel="카드에 넣을 텍스트"
            caretHidden
            style={styles.textHiddenInput}
          />
          <Text style={[styles.textSheetCount, Boolean(글자_알림) && styles.textSheetWarn]}>
            {글자_알림 || `${(decor?.text ?? "").length} / ${글자_한도}`}
          </Text>
          <View style={styles.textToolTabs}>
            {TEXT_TOOLS.map((도구) => {
              const on = 글자_도구 === 도구;
              return (
                <Pressable
                  key={도구}
                  onPress={() => 글자_도구_고르기(도구)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[styles.textToolTab, on && styles.textToolTabOn]}
                >
                  <Text style={[styles.textToolTabText, on && styles.textToolTabTextOn]}>{도구}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.textToolRow}>
            {글자_도구 === "글꼴·색" && DECOR_FONTS.map((글꼴) => {
              const on = (decor?.font ?? "기본") === 글꼴;
              return (
                <Pressable
                  key={글꼴}
                  onPress={() => onStyle({ font: 글꼴 })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`글꼴 ${글꼴}`}
                  style={[styles.textPill, on && styles.textPillOn]}
                >
                  <Text style={[styles.textPillText, on && styles.textPillTextOn, fontsReady && 글꼴 !== "기본" && { fontFamily: DECOR_FONT_FAMILY[글꼴] }]}>
                    {글꼴}
                  </Text>
                </Pressable>
              );
            })}
            {글자_도구 === "글꼴·색" && (
              <>
                <View style={styles.textToolBreak} />
                {DECOR_COLORS.map((색) => {
                  const on = (decor?.color ?? "흰색") === 색;
                  return (
                    <Pressable
                      key={색}
                      onPress={() => onStyle({ color: 색 })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`글자 색 ${색}`}
                      hitSlop={4}
                      style={[styles.textColor, { backgroundColor: DECOR_COLOR_HEX[색] }, on && styles.textColorOn]}
                    />
                  );
                })}
                {스티커_바탕 && <Text style={styles.textToolHint}>스티커 모양 바탕은 스티커 색 그대로예요</Text>}
              </>
            )}
            {글자_도구 === "바탕" && DECOR_BACKS.map((바탕) => {
              const on = (decor?.back ?? "없음") === 바탕;
              return (
                <Pressable
                  key={바탕}
                  onPress={() => 바탕_고르기(바탕)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`글자 바탕 ${바탕}`}
                  style={[styles.backChip, on && styles.backChipOn]}
                >
                  {/* 이름 대신 그 모양을 그린다. 스티커 모양은 스티커를 문구까지 그대로 보여 준다. */}
                  <DecorBackSample back={바탕} color={decor?.color} font={decor?.font} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  textSheet: { flex: 1, backgroundColor: "rgba(10,10,14,0.86)" },
  textSheetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, paddingTop: 8 },
  textSheetSide: { minWidth: 64, minHeight: 44, justifyContent: "center", paddingHorizontal: 10 },
  textSheetSideRight: { alignItems: "flex-end" },
  textSheetCancelText: { fontSize: 15, color: INK_SOFT, fontFamily: typo.label.family },
  textSheetDoneText: { color: "#FFFFFF", fontSize: 16, fontFamily: typo.title.family },
  // 미리보기·입력칸·도구를 가운데에 모은다. 키보드가 올라오면 남은 자리의 가운데로 올라간다.
  textSheetBody: { flex: 1, justifyContent: "center", paddingHorizontal: 16, gap: 10 },
  textPreview: { minHeight: 84, alignItems: "center", justifyContent: "center" },
  textPreviewEmpty: { fontSize: 22, color: INK_FAINT, fontFamily: typo.title.family },
  // 실제로 글자를 받는 입력칸. 보이지 않게 두고, 보이는 글자를 누르면 여기로 간다.
  textHiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  textSheetCount: { color: INK_FAINT, fontSize: 12, textAlign: "center", marginTop: 6, fontFamily: typo.label.family },
  textSheetWarn: { color: "#F2C27A" },
  // 탭과 그 탭의 고를 것. 아래 막대처럼 무엇을 고르는지 글로 적는다.
  textToolTabs: { flexDirection: "row", gap: 6, paddingHorizontal: 12 },
  textToolTab: { flex: 1, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  textToolTabOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  textToolTabText: { fontSize: 14, color: INK_FAINT, fontFamily: typo.label.family },
  textToolTabTextOn: { color: INK, fontFamily: typo.title.family },
  // 넘기지 않아도 다 보이게 여러 줄로 편다. 한 줄 가로 스크롤은 넘길 수 있다는 것이 안 보였다.
  textToolRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center", minHeight: 48 },
  // 「글꼴·색」 탭에서 글꼴 줄과 색 줄을 나눈다.
  textToolBreak: { width: "100%", height: 2 },
  textToolHint: { width: "100%", fontSize: 12, color: INK_FAINT, fontFamily: typo.caption.family, marginTop: 2 },
  textPill: { height: 36, paddingHorizontal: 15, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "center" },
  textPillOn: { backgroundColor: "#F6F4F1" },
  textPillText: { fontSize: 15, color: "#F6F4F1", fontFamily: typo.label.family },
  textPillTextOn: { color: "#16151B" },
  // 바탕 견본 칩. 모양이 들어갈 만큼 넉넉하고, 고른 것은 흰 테두리로 가른다.
  backChip: {
    minWidth: 72,
    height: 52,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  backChipOn: { borderColor: "#F6F4F1", backgroundColor: "rgba(255,255,255,0.16)" },
  textColor: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)" },
  textColorOn: { borderWidth: 3, borderColor: "#FFFFFF", transform: [{ scale: 1.15 }] },
});
