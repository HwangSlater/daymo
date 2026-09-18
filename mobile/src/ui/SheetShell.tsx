import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  GestureResponderHandlers,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextInput,
  View,
  ViewStyle,
} from "react-native";

import { Text } from "../AppText";
import { Glyph } from "../Glyph";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSheetDrag } from "../sheetDrag";
import { showAlert } from "../showAlert";
import { useWebKeyboardFocus, useWebKeyboardOpen } from "./webKeyboardFocus";
import { useWebBackClose } from "../useWebBackClose";
import { AppTheme } from "../theme";
import { onAccent, status as statusColor } from "../theme/colors";
import { 높이, 모서리, 여백, 누름여유 } from "../theme/controls";
import { typo } from "../theme/typography";
import { sheetHintOf, submitLabelOf } from "./sheetText";

/**
 * 아래에서 올라오는 창의 껍데기. **시트를 새로 만들 때는 이것부터 쓴다.**
 *
 * 덮개, 시트 상자, 끌어내려 닫는 손잡이, 제목 줄, 본문 스크롤, 맨 아래 저장
 * 버튼까지가 여기 있다. 쓰는 쪽은 안에 들어갈 것만 넘긴다.
 *
 * 왜 모았나. 같은 껍데기가 `WarmAppShell`·`WarmTripDetail`·`NoticeImportSheet`
 * 세 파일에 통째로 복사돼 있었다. 이름이 같은 스타일만 15개였다. 머리를 두 줄
 * 에서 한 줄로 줄이는 작은 변경에 세 군데를 따로 고쳐야 했고, 한 곳을 빠뜨려
 * 사용자가 "적용된 거야?" 라고 물었다. 한곳에서 고치면 세 곳이 같이 바뀐다.
 *
 *     <SheetShell theme={theme} visible={open} title="장소 추가"
 *       submit="저장" onSubmit={save} onClose={close}>
 *       {칸들}
 *     </SheetShell>
 *
 * 자세한 쓰임새와 함께 쓰는 다른 부품은
 * `docs/development/12-shared-ui-parts.md` 에 있다.
 */
export function SheetShell({
  theme,
  visible,
  title,
  subtitle,
  accent,
  renderHead,
  submit,
  onSubmit,
  submitDisabled = false,
  disabledHint,
  busyLabel,
  confirmSubmit,
  destructiveLabel,
  destructiveMessage,
  onDestructive,
  locked = false,
  lockedHint = "보기 전용 공간이에요",
  hasUnsavedChanges = false,
  padBody = true,
  scrollContentStyle,
  footer,
  onClose,
  children,
}: {
  /** 없으면 테마가 붙기 전의 기본색으로 그린다. 로그인 전 화면이 그렇다. */
  theme?: AppTheme;
  visible: boolean;
  title: string;
  /** 도움말. 머리가 아니라 본문의 첫 줄로 들어간다. */
  subtitle?: string;
  /** 왼쪽 색 막대. 종류마다 다른 색을 쓰는 시트가 있다. 기본은 강조색이다. */
  accent?: string;
  /**
   * 제목 줄을 통째로 갈아 끼울 때만.
   *
   * 기본 머리(색 막대 + 제목 + ×)가 대부분의 시트가 쓰는 모양이다. 「우리 설정」
   * 처럼 머리 자체가 다른 시트만 이걸로 직접 그린다. 끌어내려 닫기가 머리에서도
   * 되도록 받은 `panHandlers` 를 제목에 붙인다.
   */
  renderHead?: (panHandlers: GestureResponderHandlers) => React.ReactNode;
  /** 맨 아래 버튼 글. 없으면 버튼 자체를 내지 않는다(둘러보기만 하는 시트). */
  submit?: string;
  onSubmit?: () => void | Promise<void>;
  submitDisabled?: boolean;
  /** 저장을 막았을 때 버튼 위에 적는 모자란 것. */
  disabledHint?: string;
  /** 저장을 기다리는 동안 버튼에 대신 적을 글. 주지 않으면 글은 그대로 둔다. */
  busyLabel?: string;
  /**
   * 저장 자체가 되돌릴 수 없을 때 한 번 더 묻는 말.
   *
   * 지우는 버튼이 따로 있는 경우와 달리, 목록 교체처럼 저장 버튼이 곧 삭제인
   * 자리가 있다. 그때는 저장을 눌러도 바로 하지 않고 이 문장을 보여 준다.
   */
  confirmSubmit?: string;
  /** 시트 맨 아래 지우기. 누르면 바로 지우지 않고 확인 상자를 편다. */
  destructiveLabel?: string;
  destructiveMessage?: string;
  onDestructive?: () => void;
  /** 고칠 수 없는 사람에게 연 시트. 본문을 못 누르게 막고 버튼은 닫기가 된다. */
  locked?: boolean;
  /** 막았을 때 버튼 위에 보이는 말. */
  lockedHint?: string;
  /** 작성 중인 값이 있다. 닫으려 하면 먼저 묻는다. */
  hasUnsavedChanges?: boolean;
  /** 본문 좌우에 2px 을 준다. 스크롤 안에서 그림자가 잘리지 않게 두는 여백이다. */
  padBody?: boolean;
  /** 스크롤 안쪽에 더 줄 여백. */
  scrollContentStyle?: StyleProp<ViewStyle>;
  /** 저장 버튼 아래에 더 붙일 것. */
  footer?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // 되돌릴 수 없는 것을 확정하는 버튼인데 글자가 가장 흐리면 안 된다.
  // 색값을 따로 박지 말고 라이트/다크 AA 를 맞춰 둔 토큰을 쓴다.
  const danger = theme?.dark ? statusColor.danger.dark : statusColor.danger.light;
  const [confirmingDestructive, setConfirmingDestructive] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLocked = useRef(false);
  useEffect(() => {
    if (visible) submitLocked.current = false;
  }, [visible]);

  const dirty = hasUnsavedChanges && !locked;
  const closeAndReset = () => {
    setConfirmingDestructive(false);
    setConfirmingSubmit(false);
    onClose();
  };
  const requestClose = () => {
    if (!dirty) {
      closeAndReset();
      return;
    }
    showAlert(
      "저장하지 않고 나갈까요?",
      "저장하지 않은 내용은 사라져요.",
      [
        { text: "계속 편집", style: "cancel" },
        { text: "나가기", style: "destructive", onPress: closeAndReset },
      ],
    );
  };

  const drag = useSheetDrag(requestClose, visible, dirty);
  // 웹에서 키보드가 올라와 시트가 줄어든 뒤에도 입력 중인 칸이 보이게 한다.
  useWebKeyboardFocus(visible);
  // 키보드가 올라온 동안에는 손잡이·부제·힌트를 접고 시트를 화면 끝까지 쓴다. 보이는
  // 높이가 300px 남짓이라 그것들이 차지하던 자리가 곧 입력 영역이다.
  const 웹_키보드_열림 = useWebKeyboardOpen(visible);
  // 창을 화면 끝까지 쓸 때도 폰 위쪽의 시계·배터리 줄은 덮지 않는다.
  const 안전여백 = useSafeAreaInsets();
  /**
   * 기기에서 키보드가 올라오면 치고 있는 칸을 보이는 자리로 끌어온다.
   *
   * iOS 의 `automaticallyAdjustKeyboardInsets` 는 스크롤 칸의 아래 여백만 늘린다.
   * 시트가 길면 그것만으로는 칸이 화면 위로 밀려 올라간 채로 남아, 무엇을 치고
   * 있는지 안 보였다(2026-09-18 「새 여행」에서 여행지를 칠 때). 웹은 이미
   * `useWebKeyboardFocus` 가 같은 일을 한다.
   */
  const 스크롤칸 = useRef<ScrollView>(null);
  const 스크롤_자리 = useRef(0);
  /**
   * 치고 있는 칸이 스크롤 칸의 보이는 상자 안에 들게 딱 그만큼만 옮긴다.
   * 아래로 가려졌으면 내리고, 위로 밀려났으면 올린다. 안에 있으면 손대지 않는다.
   *
   * `measureLayout` 은 새 렌더러에서 「native component 의 ref 여야 한다」며
   * 터지므로 화면 기준 자리(`measureInWindow`)만 잰다.
   */
  const 칸_보이게 = (키보드_위: number) => {
    const 칸 = TextInput.State.currentlyFocusedInput();
    const 통 = 스크롤칸.current;
    const 통_본체 = 통?.getNativeScrollRef?.();
    if (!칸 || !통 || !통_본체 || typeof 칸.measureInWindow !== "function" || typeof 통_본체.measureInWindow !== "function") return;
    통_본체.measureInWindow((_tx: number, 통_위: number, _tw: number, 통_높이: number) => {
      칸.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        if (![통_위, 통_높이, y, h].every(Number.isFinite)) return;
        const 여유 = 16;
        // 스크롤 칸은 키보드 뒤까지 이어진다. 실제로 보이는 바닥은 둘 중 위쪽이다.
        const 통_아래 = Math.min(통_위 + 통_높이, 키보드_위 > 0 ? 키보드_위 : Number.MAX_SAFE_INTEGER);
        const 옮길_만큼 = y + h + 여유 > 통_아래
          ? y + h + 여유 - 통_아래
          : y < 통_위 + 여유
            ? y - (통_위 + 여유)
            : 0;
        if (Math.abs(옮길_만큼) < 4) return;
        통.scrollTo({ y: Math.max(0, 스크롤_자리.current + 옮길_만큼), animated: true });
      });
    });
  };
  /**
   * 기기에서 키보드가 올라올 때.
   *
   * 1. 창을 화면 끝까지 쓴다(아래 `키보드_열림`).
   * 2. 스크롤 안쪽 바닥에 키보드 높이만큼 여백을 준다. 이건 한 번의 배치 변경이라
   *    프레임마다 하는 일이 없다.
   * 3. 다 올라온 뒤에 치고 있는 칸이 키보드에 가리면 그만큼만 **스르륵 스크롤**한다.
   *    눈에 보이는 움직임은 이 스크롤 하나뿐이고, 그건 기기가 그린다.
   *
   * 스크롤 칸의 `automaticallyAdjustKeyboardInsets` 는 쓰지 않는다. 이 창은 Modal
   * 안이라 그 장치가 키보드를 보지 못해서 아무 일도 일어나지 않았다(2026-09-18).
   * 그 전에 쓰던 KeyboardAvoidingView 와 직접 만든 여백 애니메이션은 프레임마다
   * 자바스크립트가 밀어야 해서, 개발 모드에서 한 프레임에 200px 씩 튀며 끊겼다.
   *
   * 키보드가 올라온 동안 시트 바닥의 저장 단추는 키보드 밑에 있다. 키보드를 내리면
   * 나온다. 그래서 그동안은 바깥을 눌러도 창을 닫지 않고 키보드만 내린다.
   */
  const [키보드_높이, set키보드_높이] = useState(0);
  const 키보드_떠있음 = 키보드_높이 > 0;
  useEffect(() => {
    if (!visible || Platform.OS === "web") return;
    let 예약: ReturnType<typeof setTimeout> | null = null;
    // 크기를 바꾸는 것은 키보드가 **올라오기 시작할 때**다. 다 올라온 뒤에 바꾸면
    // 키보드가 멈춘 다음 창이 한 번 더 커져 두 번 움직이는 것처럼 보인다.
    const 시작 = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const 끝 = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const 올라옴 = Keyboard.addListener(시작, (사건) => set키보드_높이(사건.endCoordinates?.height ?? 0));
    const 내려감 = Keyboard.addListener(끝, () => set키보드_높이(0));
    // 칸 맞추기는 키보드가 다 올라온 뒤에 한다. 그 전에는 잴 자리가 아직 안 잡힌다.
    const 자리잡음 = Keyboard.addListener("keyboardDidShow", (사건) => {
      const 위 = 사건.endCoordinates?.screenY ?? 0;
      if (예약) clearTimeout(예약);
      예약 = setTimeout(() => 칸_보이게(위), 60);
    });
    return () => {
      if (예약) clearTimeout(예약);
      올라옴.remove();
      내려감.remove();
      자리잡음.remove();
      set키보드_높이(0);
    };
  }, [visible]);
  /**
   * 키보드가 올라온 동안에는 창을 화면 끝까지 쓴다.
   *
   * 창이 화면의 91% 까지만 열리면, 키보드가 올라올 때 남은 자리를 찾아 창이 움직여야
   * 한다. 그 움직임을 무엇으로 그리든(KeyboardAvoidingView, 우리 애니메이션) 개발
   * 모드에서 프레임이 뭉쳐 뚝뚝 끊겼다. 창이 이미 화면 끝까지 차 있으면 움직일 것이
   * 없고, 키보드가 만드는 안쪽 여백은 iOS 가 직접 그린다.
   */
  const 키보드_열림 = 웹_키보드_열림 || 키보드_떠있음;
  // 웹의 뒤로 가기는 페이지가 아니라 지금 열린 시트가 받는다.
  useWebBackClose(visible, requestClose);

  const submitLabel = submitLabelOf({ locked, submitting, submit: submit ?? "", busyLabel });
  const submitBlocked = !locked && (submitDisabled || submitting);
  const hint = sheetHintOf({ locked, lockedHint, disabledHint, submitDisabled });
  const kindBarColor = accent ?? theme?.primary ?? "#FF6B63";

  const press = async () => {
    if (locked) {
      closeAndReset();
      return;
    }
    if (submitLocked.current) return;
    Keyboard.dismiss();
    setConfirmingDestructive(false);
    // 저장이 곧 삭제인 자리에서는 한 번 더 묻는다.
    if (confirmSubmit && !confirmingSubmit) {
      setConfirmingSubmit(true);
      return;
    }
    submitLocked.current = true;
    setSubmitting(true);
    setConfirmingSubmit(false);
    try {
      await onSubmit?.();
    } finally {
      setSubmitting(false);
      // 두 번 눌러 두 줄이 생기는 것을 막는다. 저장이 끝나도 잠깐은 더 잠근다.
      setTimeout(() => {
        submitLocked.current = false;
      }, 800);
    }
  };

  // 확인 상자는 지우기와 저장 두 자리가 같은 모양이다. 한 번 더 묻는 자리가
  // 두 곳뿐이라 따로 부품으로 빼지 않고 여기서 그린다.
  const confirmBox = (
    ask: string,
    message: string,
    label: string,
    onCancel: () => void,
    onConfirm: () => void,
  ) => (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.confirm, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
    >
      <View style={styles.confirmCopy}>
        <Text style={[styles.confirmTitle, theme && { color: theme.text }]}>{ask}</Text>
        <Text style={[styles.confirmMessage, theme && { color: theme.muted }]}>{message}</Text>
      </View>
      <View style={styles.confirmActions}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          style={[styles.confirmButton, theme && { borderColor: theme.border }]}
        >
          <Text style={[styles.confirmCancel, theme && { color: theme.text }]}>취소</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          accessibilityRole="button"
          accessibilityLabel={`${label} 확인`}
          style={[styles.confirmButton, { backgroundColor: danger, borderColor: danger }]}
        >
          <Text style={[styles.confirmDanger, { color: onAccent(Boolean(theme?.dark)) }]}>확인</Text>
        </Pressable>
      </View>
    </View>
  );

  const inside = (
    <>
      <Pressable
        style={styles.modalDismiss}
        onPress={키보드_떠있음 ? Keyboard.dismiss : requestClose}
        accessibilityRole="button"
        accessibilityLabel={키보드_떠있음 ? "키보드 내리기" : `${title} 바깥 영역 닫기`}
      />
      <Animated.View
        onLayout={drag.onLayout}
        style={[
          styles.sheet,
          theme && { backgroundColor: theme.background },
          키보드_열림 && styles.sheetCompact,
          // 키보드가 차지하는 만큼 창 아래에 여백을 준다. 창 바닥의 저장 단추가
          // 키보드 위에 서고, 스크롤 칸의 보이는 바닥도 키보드 윗변이 된다.
          키보드_높이 > 0 && { paddingBottom: 키보드_높이 },
          drag.sheetStyle,
        ]}
      >
        <View {...drag.panHandlers} style={키보드_열림 ? styles.dragAreaCompact : styles.dragArea}>
          {!키보드_열림 && <View style={styles.handle} />}
        </View>
        {/* 머리는 제목과 닫기 한 줄이다. 예전에는 "장소 · 추가" 와 "장소 추가" 가
            위아래로 겹쳐 있었고 그 둘을 테두리 상자로 묶어, 내용이 시작되기도 전에
            화면 위쪽 98px 을 먹었다. 종류는 왼쪽 색 막대로만 남긴다. */}
        {renderHead ? renderHead(drag.panHandlers) : (
          <View style={sheetHeadStyles.head}>
            <View {...drag.panHandlers} style={styles.headMain}>
              <View style={[styles.kindBar, { backgroundColor: kindBarColor }]} />
              <Text numberOfLines={1} style={[sheetHeadStyles.title, theme && { color: theme.text }]}>
                {title}
              </Text>
            </View>
            <Pressable
              onPress={requestClose}
              hitSlop={누름여유(높이.칩)}
              accessibilityRole="button"
              accessibilityLabel={`${title} 닫기`}
              style={[styles.closeButton, theme && { backgroundColor: theme.surfaceAlt }]}
            >
              <Text style={[styles.close, theme && { color: theme.primary }]}>×</Text>
            </Pressable>
          </View>
        )}
        <ScrollView
          ref={스크롤칸}
          onScroll={(사건) => { 스크롤_자리.current = 사건.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // 웹에서는 끈다. react-native-web 은 "on-drag" 를 「스크롤이 나면 키보드를 내린다」로
          // 구현해서, 키보드가 올라온 뒤 입력 칸을 다시 보이게 스크롤하는 순간(webKeyboardFocus)
          // 키보드가 도로 내려갔다. 끌어서 키보드를 내리는 건 폰 앱의 동작이라 웹엔 필요 없다.
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : Platform.OS === "android" ? "on-drag" : "none"}
          // Modal 안에서는 이 장치가 키보드를 보지 못한다. 아래 여백은 우리가 준다.
          automaticallyAdjustKeyboardInsets={false}
          contentContainerStyle={scrollContentStyle}
        >
          <View style={padBody ? styles.body : undefined} pointerEvents={locked ? "none" : "auto"}>
            {/* 도움말은 머리에 박아 두지 않고 내용의 첫 줄로 둔다. 적기 시작하면
                같이 밀려 올라가, 다 읽은 안내가 입력 칸 자리를 계속 차지하지 않는다. */}
            {subtitle && !키보드_열림 ? (
              <Text style={[styles.subtitle, theme && { color: theme.muted }]}>{subtitle}</Text>
            ) : null}
            {children}
          </View>
        </ScrollView>
        {hint && !키보드_열림 ? (
          <Text accessibilityLiveRegion="polite" style={[styles.hint, theme && { color: theme.muted }]}>
            {hint}
          </Text>
        ) : null}
        {submit ? (
          <Pressable
            onPress={press}
            disabled={submitBlocked}
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
            accessibilityState={{ disabled: submitBlocked, busy: submitting }}
            style={({ pressed }) => [
              styles.submit,
              theme && { backgroundColor: theme.primary },
              submitBlocked && styles.submitDisabled,
              pressed && !submitBlocked && styles.pressed,
            ]}
          >
            <Text style={[styles.submitText, { color: onAccent(Boolean(theme?.dark)) }]}>{submitLabel}</Text>
            <View style={styles.submitArrow}>
              <Glyph name="arrowRight" size={15} color={onAccent(Boolean(theme?.dark))} />
            </View>
          </Pressable>
        ) : null}
        {confirmSubmit && confirmingSubmit && submit
          ? confirmBox(
            `${submit}할까요?`,
            confirmSubmit,
            submit,
            () => setConfirmingSubmit(false),
            () => {
              setConfirmingSubmit(false);
              void onSubmit?.();
            },
          )
          : null}
        {destructiveLabel && !locked && confirmingDestructive
          ? confirmBox(
            `${destructiveLabel}할까요?`,
            destructiveMessage ?? "삭제한 내용은 되돌릴 수 없어요.",
            destructiveLabel,
            () => setConfirmingDestructive(false),
            () => {
              setConfirmingDestructive(false);
              onDestructive?.();
            },
          )
          : null}
        {destructiveLabel && !locked && !confirmingDestructive ? (
          <Pressable
            onPress={() => setConfirmingDestructive(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={destructiveLabel}
            style={styles.destructive}
          >
            <Text style={[styles.destructiveText, { color: danger }]}>{destructiveLabel}</Text>
          </Pressable>
        ) : null}
        {footer}
      </Animated.View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={requestClose}>
      {/* 키보드가 올라와 창이 화면 끝까지 쓸 때, 폰 위쪽 시계·배터리 줄만큼은 비운다. */}
      <View style={[styles.modalBack, 키보드_열림 && { paddingTop: 안전여백.top }]}>{inside}</View>
    </Modal>
  );
}

/**
 * 머리를 직접 그리는 시트가 제목에 쓰는 스타일.
 *
 * 머리 전체를 갈아 끼우더라도 제목 글자까지 다시 정하면 시트마다 크기가
 * 어긋난다. 그 한 줄만 나눠 쓴다.
 */
export const sheetHeadStyles = StyleSheet.create({
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  /** 제목만 한 덩어리로 왼쪽에 둘 때. */
  copy: { flex: 1 },
  // 줄 높이를 적어 둔다. 적지 않으면 iOS 가 글꼴이 말하는 만큼만 칸을 잡아,
  // 「함께하는 멤버」처럼 받침이 있는 한글의 아래가 잘린다(기기에서 확인).
  title: { flex: 1, minWidth: 0, fontSize: 21, lineHeight: 29, fontFamily: typo.title.family, letterSpacing: -0.5 },
});

const styles = StyleSheet.create({
  modalBack: { flex: 1, backgroundColor: "rgba(10,18,35,.42)", justifyContent: "flex-end" },
  modalDismiss: { flex: 1 },
  // 시트 상자의 값은 누르는 것이 아니라 창 자체의 크기라 controls 의 네 단계에
  // 들어가지 않는다. 28 은 위 두 모서리만 둥근 종이 느낌이고, 430 은 태블릿과
  // 웹에서 시트가 화면 끝까지 늘어나지 않게 잡은 폭이다.
  sheet: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: "91%",
  },
  // 키보드가 올라온 동안. 위아래 여백을 줄이고 화면 끝까지 쓴다.
  sheetCompact: { maxHeight: "100%", paddingTop: 2, paddingBottom: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  dragAreaCompact: { height: 8, marginHorizontal: -20 },
  // 손잡이는 가늘어서, 실제로 끌 수 있는 자리는 시트 좌우 끝까지 넓혀 둔다.
  dragArea: {
    height: 40,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: { width: 54, height: 5, borderRadius: 3, backgroundColor: "#C7C7C3" },
  headMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  // 무슨 종류의 시트인지 남기는 색 막대. 제목 글자 높이에 맞춘다.
  kindBar: { width: 3, height: 19, borderRadius: 2 },
  // 내용의 첫 줄로 내려왔다. 머리에 있을 때보다 아래 입력 칸에 가깝다.
  subtitle: { fontSize: 12, lineHeight: 17, marginBottom: 14 },
  closeButton: {
    width: 높이.칩,
    height: 높이.칩,
    borderRadius: 모서리.원,
    alignItems: "center",
    justifyContent: "center",
  },
  close: { fontSize: 24, lineHeight: 26, fontWeight: "500" },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 2 },
  hint: { fontSize: 11, lineHeight: 15, textAlign: "center", marginTop: 4 },
  submit: {
    height: 높이.저장,
    borderRadius: 모서리.버튼,
    backgroundColor: "#17233D",
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    paddingLeft: 여백.가로,
    paddingRight: 6,
    marginTop: 6,
  },
  submitText: { fontSize: 14, fontFamily: typo.label.family },
  submitDisabled: { opacity: 0.38 },
  submitArrow: {
    width: 높이.버튼,
    height: 높이.버튼,
    borderRadius: 모서리.버튼,
    backgroundColor: "rgba(255,255,255,.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  destructive: { height: 높이.버튼, alignItems: "center", justifyContent: "center", marginTop: 4 },
  destructiveText: { fontSize: 13, fontFamily: typo.label.family },
  confirm: { borderWidth: 1, borderRadius: 모서리.구역, padding: 12, marginTop: 8, gap: 10 },
  confirmCopy: { paddingHorizontal: 2 },
  confirmTitle: { fontSize: 14, fontFamily: typo.title.family },
  confirmMessage: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  confirmActions: { flexDirection: "row", gap: 8 },
  confirmButton: {
    flex: 1,
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancel: { fontSize: 12, fontFamily: typo.label.family },
  confirmDanger: { fontSize: 13, fontFamily: typo.label.family },
});
