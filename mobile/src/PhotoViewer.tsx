/**
 * 여행 사진을 크게 보는 화면과 고치는 화면.
 *
 * 둘 다 시트가 아니라 화면을 통째로 덮는다. 시트로 열면 사진이 카드 안에 갇혀
 * 「사진 앱 같지 않다」는 말을 듣는다. 사진첩을 넘겨 보는 자리는 사진이 주인공이라야
 * 한다. 그래서 바탕을 검게 깔고 위아래에 옅은 그늘만 얹어 그 위에 아이콘을 놓았다.
 * 기념 카드 꾸미기 화면(`CardDecorEditor.tsx`)과 같은 결이다.
 *
 * 지키는 것 셋.
 *   1. 사진은 `contain` 이다. 어떤 비율이어도 잘리지 않는다. 사진첩에서 잘려 보이는
 *      것만큼 화나는 일이 없다.
 *   2. 검은 바탕 위라 글자와 아이콘 색은 테마 토큰이 아니라 흰색을 직접 쓴다. 테마의
 *      `text`·`muted` 는 밝은 바탕에서 읽히게 맞춰 둔 값이라 여기서는 묻힌다.
 *      강조가 필요한 곳(고치기 화면의 저장·고른 칩)에만 테마의 `primary` 를 쓴다.
 *   3. 저장은 묻지 않는다. 누르면 바로 받고 한 줄만 떴다 사라진다. 원본을 받을지
 *      표시본을 받을지는 기한을 보고 부르는 쪽이 정한다(`photoSave.ts`).
 */

import { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Text } from "./AppText";
import { Glyph, type GlyphName } from "./Glyph";
import { showAlert } from "./showAlert";
import type { AppTheme } from "./theme";
import { onAccent } from "./theme/colors";
import { typo } from "./theme/typography";
import { useWebBackClose } from "./useWebBackClose";
import { useWebKeyboardInset } from "./useWebKeyboardInset";

/**
 * 크게 볼 사진 한 장.
 *
 * 기록 탭의 `MemoryPhoto` 를 그대로 받을 수 있게 칸 이름을 맞췄다. 이 화면이 쓰는
 * 것만 적어 둬서 기록 탭을 들여오지 않는다(서로 부르면 고리가 생긴다).
 */
export type ViewerPhoto = {
  id: string;
  color: string;
  uri?: string;
  caption: string;
  date: string;
  /** 올린 사람. 서버에서 받은 사진에만 있다. */
  uploaderName?: string;
};

/** 검은 바탕 위의 흰 글자. 테마를 타지 않는 값이라 한곳에 모아 둔다. */
const INK = "#FFFFFF";
const INK_SOFT = "rgba(255,255,255,0.62)";
const INK_FAINT = "rgba(255,255,255,0.34)";
/** 고치기 화면의 강조색과 위험색. 어두운 바탕에서 읽히는 값으로 따로 둔다. */
const EDIT_ACCENT = "#A7B3EE";
const DANGER_INK = "#F08A82";

/**
 * 위아래에 까는 그늘.
 *
 * 밝은 하늘 사진에서는 흰 아이콘이 통째로 사라진다. 사진을 어둡게 덮지 않으면서
 * 아이콘만 살리려면 끝에서만 짙고 가운데로 가며 사라지는 그늘이 있어야 한다.
 * `expo-linear-gradient` 를 새로 들이지 않고 이미 쓰는 `react-native-svg` 로 그린다.
 */
function Scrim({ place }: { place: "top" | "bottom" }) {
  const id = `photoScrim-${place}`;
  return (
    <View style={place === "top" ? styles.scrimTop : styles.scrimBottom} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1={place === "top" ? "0" : "1"} x2="0" y2={place === "top" ? "1" : "0"}>
            <Stop offset="0" stopColor="#000000" stopOpacity={place === "top" ? 0.62 : 0.74} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** 사진 위의 아이콘 단추 하나. 누르는 자리를 42px 로 넉넉히 잡는다. */
function BarButton({
  glyph,
  label,
  on = false,
  disabled = false,
  onPress,
}: {
  glyph: GlyphName;
  label: string;
  /** 눌러 둔 상태(저장하는 중, 메뉴 열림). 동그란 바탕이 깔린다. */
  on?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.barButton,
        on && styles.barButtonOn,
        disabled && styles.faded,
        pressed && styles.pressed,
      ]}
    >
      <Glyph name={glyph} size={23} color={INK} weight={2.1} />
    </Pressable>
  );
}

export function PhotoViewerScreen({
  visible,
  photos,
  index,
  onMove,
  onClose,
  onSave,
  saving,
  saveBlocked,
  onEdit,
  onReport,
  report,
  hint,
  hintSoon,
  toast,
  waitingText,
}: {
  visible: boolean;
  photos: ViewerPhoto[];
  /** 지금 보는 사진의 차례. 목록에서 사라지면 부르는 쪽이 창을 닫는다. */
  index: number;
  onMove: (photoId: string) => void;
  onClose: () => void;
  /** ↓. 묻지 않고 바로 받는다. */
  onSave: () => void;
  saving: boolean;
  /** 아직 서버에 올라가는 중이라 받을 것이 없을 때. */
  saveBlocked: boolean;
  /** ✎. 고칠 수 없는 사람에게는 주지 않는다. */
  onEdit?: () => void;
  /** ⋮ 안의 「신고」. 서버 사진에만 있다. */
  onReport?: () => void;
  /** 신고 폼. 열려 있을 때만 온다. */
  report?: React.ReactNode;
  /** 원본을 언제까지 받을 수 있는지 한 줄. */
  hint?: string;
  hintSoon?: boolean;
  /** 저장하고 나서 떴다 사라지는 한 줄. */
  toast?: string;
  /** 사진 파일이 아직 없을 때 사진 자리에 적을 말. */
  waitingText?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const strip = useRef<ScrollView>(null);
  const photo = photos[index];
  // 창을 닫거나 사진을 넘기면 열어 둔 메뉴도 함께 닫는다. 다음 사진에 그대로 얹혀
  // 있으면 무엇에 대한 메뉴인지 알 수 없다.
  const move = (photoId: string) => {
    setMenuOpen(false);
    onMove(photoId);
  };
  const close = () => {
    setMenuOpen(false);
    onClose();
  };
  useWebBackClose(visible, close);
  // 필름 스트립이 지금 보는 사진을 늘 화면에 두게 한다. 스무 장쯤 되면 화살표로
  // 넘길수록 지금 사진이 줄 밖으로 밀려나 어디쯤인지 알 수 없다.
  useEffect(() => {
    if (!visible || index < 0) return;
    const timer = setTimeout(() => {
      strip.current?.scrollTo({ x: Math.max(0, index * (STRIP_THUMB + STRIP_GAP) - STRIP_THUMB * 2), animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [index, visible]);

  if (!photo) return null;
  const meta = [photo.date, photo.uploaderName ? `${photo.uploaderName} 올림` : ""].filter(Boolean).join(" · ");
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.stage}>
          {photo.uri
            ? <Image source={{ uri: photo.uri }} resizeMode="contain" style={styles.fill} accessibilityLabel={photo.caption || "여행 사진"} />
            : <Text style={styles.waiting}>{waitingText ?? "사진을 받는 중이에요"}</Text>}
        </View>
        <Scrim place="top" />
        <Scrim place="bottom" />

        <View style={styles.bar}>
          <BarButton glyph="close" label="크게 보기 닫기" onPress={close} />
          <Text style={styles.count}>{photos.length > 1 ? `${index + 1} / ${photos.length}` : ""}</Text>
          <BarButton
            glyph="download"
            label="이 사진 저장"
            on={saving}
            disabled={saving || saveBlocked}
            onPress={onSave}
          />
          {Boolean(onEdit) && <BarButton glyph="pencil" label="사진 고치기" onPress={() => onEdit?.()} />}
          {Boolean(onReport) && (
            <BarButton glyph="moreVertical" label="더 보기" on={menuOpen} onPress={() => setMenuOpen((열림) => !열림)} />
          )}
        </View>

        {/* ⋮ 안에는 신고만 둔다. 삭제는 고치기 화면에 있다. 지우는 것과 신고하는 것이
            같은 메뉴에 있으면 남의 사진에서 잘못 누르기 쉽다. */}
        {menuOpen && (
          <View style={styles.menu}>
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                onReport?.();
              }}
              accessibilityRole="button"
              accessibilityLabel="이 사진 신고하기"
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
            >
              <Text style={styles.menuText}>신고</Text>
            </Pressable>
          </View>
        )}

        {photos.length > 1 && (
          <>
            <Pressable
              onPress={() => move(photos[(index + photos.length - 1) % photos.length].id)}
              accessibilityRole="button"
              accessibilityLabel="이전 사진"
              style={({ pressed }) => [styles.step, styles.stepLeft, pressed && styles.pressed]}
            >
              <Glyph name="chevronLeft" size={20} color={INK} />
            </Pressable>
            <Pressable
              onPress={() => move(photos[(index + 1) % photos.length].id)}
              accessibilityRole="button"
              accessibilityLabel="다음 사진"
              style={({ pressed }) => [styles.step, styles.stepRight, pressed && styles.pressed]}
            >
              <Glyph name="chevronRight" size={20} color={INK} />
            </Pressable>
          </>
        )}

        <View style={styles.foot} pointerEvents="box-none">
          <Text numberOfLines={2} style={styles.caption}>{photo.caption || "설명 없이 남긴 사진"}</Text>
          <Text style={styles.meta}>{meta}</Text>
          {Boolean(hint) && <Text style={[styles.meta, hintSoon && styles.metaSoon]}>{hint}</Text>}
          {photos.length > 1 && (
            <ScrollView
              ref={strip}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.strip}
              accessibilityLabel={`여행 사진 ${photos.length}장`}
            >
              {photos.map((하나, 차례) => (
                <Pressable
                  key={하나.id}
                  onPress={() => move(하나.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: 차례 === index }}
                  accessibilityLabel={`${하나.caption || `사진 ${차례 + 1}`} 보기`}
                  style={[styles.stripThumb, { backgroundColor: 하나.color }, 차례 === index && styles.stripThumbOn]}
                >
                  {Boolean(하나.uri) && <Image source={{ uri: 하나.uri }} resizeMode="cover" style={styles.fill} />}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {Boolean(toast) && (
          <View style={styles.toast} accessibilityLiveRegion="polite" pointerEvents="none">
            <Glyph name="check" size={17} color="#7FD8A6" weight={2.4} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
        {Boolean(report) && <View style={styles.reportPanel}>{report}</View>}
      </View>
    </Modal>
  );
}

/** 고치기 화면 아래의 도구 한 칸. 고른 것만 칸이 열린다. */
type EditTool = "설명" | "날짜" | "붙이기";

/** 고치기 화면의 아이콘 줄에 놓을 것. 홈 화면과 삭제는 칸이 없고 누르면 바로 한다. */
const EDIT_TOOLS: { key: EditTool | "홈 화면" | "삭제"; glyph: GlyphName }[] = [
  { key: "설명", glyph: "lines" },
  { key: "날짜", glyph: "calendar" },
  { key: "붙이기", glyph: "link" },
  { key: "홈 화면", glyph: "home" },
  { key: "삭제", glyph: "trash" },
];

export function PhotoEditScreen({
  visible,
  uri,
  color,
  caption,
  onCaption,
  date,
  dateOptions,
  onDate,
  linkLabels,
  linkChosen,
  onToggleLink,
  cover,
  onCover,
  onRepick,
  onDelete,
  onClose,
  onSubmit,
  toast,
  readOnly,
  readOnlyHint,
  theme,
}: {
  visible: boolean;
  uri?: string;
  /** 사진 파일이 아직 없을 때 깔 색. */
  color: string;
  caption: string;
  onCaption: (text: string) => void;
  date: string;
  dateOptions: string[];
  onDate: (value: string) => void;
  /** 사진을 붙일 수 있는 곳의 이름. 고른 것은 `linkChosen` 에 같은 차례로 들어 있다. */
  linkLabels: string[];
  linkChosen: boolean[];
  onToggleLink: (index: number) => void;
  /** 홈 화면 도구. 누를 수 없으면 `undefined` 다(아직 올라가는 중인 사진). */
  cover?: { on: boolean; label: string };
  onCover?: () => void;
  /** 사진 자체를 다른 것으로 바꾼다. */
  onRepick?: () => void;
  onDelete: () => void;
  onClose: () => void;
  onSubmit: () => void;
  /** 홈 화면에 깔았다는 것처럼 이 화면 안에서 알릴 한 줄. 떴다 사라진다. */
  toast?: string;
  readOnly?: boolean;
  readOnlyHint?: string;
  theme?: AppTheme;
}) {
  /**
   * 열려 있는 도구 칸.
   *
   * 설명 칸에는 날짜 칩도 같이 둔다. 사진을 고칠 때 손대는 것은 거의 늘 이 둘이라
   * 도구를 두 번 눌러 오가게 하면 손이 는다. 날짜 칸은 여행이 길어 칩이 한 줄에
   * 안 들어갈 때 여러 줄로 펴서 보여 주는 자리다.
   */
  const [tool, setTool] = useState<EditTool>("설명");
  const captionInput = useRef<TextInput>(null);
  const keyboardInset = useWebKeyboardInset(visible);
  // 나갈 때 도구 칸을 처음 자리로 되돌린다. 다음에 다른 사진을 열었는데 지난번에
  // 보던 「붙이기」 칸이 그대로 떠 있으면 설명을 고치러 온 사람이 헤맨다.
  const leave = (go: () => void) => {
    setTool("설명");
    go();
  };
  useWebBackClose(visible, () => leave(onClose));
  /**
   * 닫혀 있을 때는 아무것도 그리지 않는다.
   *
   * 크게 보는 화면 위에 이 화면이 겹친다. 웹에서 `Modal` 은 붙는 차례대로 쌓이므로,
   * 닫혀 있을 때도 자리를 잡고 있으면 나중에 열린 크게 보기가 이 위를 덮어 버린다.
   * 열 때 비로소 붙어야 위에 온다. 크게 보는 화면도 같은 이유로 볼 사진이 없으면
   * 아무것도 그리지 않는다.
   */
  if (!visible) return null;

  const primary = theme?.primary ?? "#3F4C8F";
  // 어두운 바탕(#141318) 위의 강조색. 라이트 테마의 `primary`(#3F4C8F)는 여기서
  // 거의 검게 묻혀서, 이 화면에서만 같은 계열의 밝은 값을 쓴다.
  const 눌렀을_때 = (key: (typeof EDIT_TOOLS)[number]["key"]) => {
    if (key === "홈 화면") {
      onCover?.();
      return;
    }
    if (key === "삭제") {
      onDelete();
      return;
    }
    setTool(key);
    if (key === "설명") captionInput.current?.focus();
  };
  /** 도구 아이콘에 불이 들어와 있는지. 무엇이 열려 있는지와 홈에 깔렸는지를 함께 보여 준다. */
  const 켜졌나 = (key: (typeof EDIT_TOOLS)[number]["key"]) =>
    key === "홈 화면" ? Boolean(cover?.on) : key === "삭제" ? false : tool === key;
  const 쓸_수_있나 = (key: (typeof EDIT_TOOLS)[number]["key"]) =>
    key === "홈 화면" ? Boolean(onCover) : key === "삭제" ? !readOnly : true;

  /**
   * 고를 것을 칩으로 늘어놓는다.
   *
   * @param wrap 여러 줄로 펴서 한눈에 보여 줄지. 아니면 한 줄로 두고 옆으로 민다.
   *   설명 칸에서는 한 줄이라야 아래 아이콘 줄이 밀리지 않는다.
   */
  const chips = (options: string[], chosen: (option: string, index: number) => boolean, press: (index: number) => void, wrap: boolean) => {
    const 칩들 = options.map((option, 차례) => {
        const on = chosen(option, 차례);
        return (
          <Pressable
            key={`${option}:${차례}`}
            onPress={() => press(차례)}
            disabled={readOnly}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              styles.chip,
              on && { backgroundColor: primary },
              pressed && styles.pressed,
            ]}
          >
            <Text numberOfLines={1} style={[styles.chipText, on && { color: onAccent(Boolean(theme?.dark)) }]}>{option}</Text>
          </Pressable>
        );
    });
    if (wrap) return <View style={[styles.chipRow, styles.chipRowWrap]}>{칩들}</View>;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {칩들}
      </ScrollView>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => leave(onClose)} statusBarTranslucent>
      <KeyboardAvoidingView
        style={[styles.editScreen, keyboardInset]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.editHead}>
          <Pressable
            onPress={() => leave(onClose)}
            accessibilityRole="button"
            accessibilityLabel="고치기 취소"
            style={({ pressed }) => [styles.editHeadSide, pressed && styles.pressed]}
          >
            <Text style={styles.editCancel}>취소</Text>
          </Pressable>
          <Text style={styles.editTitle}>사진 고치기</Text>
          <Pressable
            onPress={() => leave(readOnly ? onClose : onSubmit)}
            accessibilityRole="button"
            accessibilityLabel={readOnly ? "닫기" : "고친 사진 저장"}
            style={({ pressed }) => [styles.editHeadSide, styles.editHeadRight, pressed && styles.pressed]}
          >
            <Text style={[styles.editSave, { color: EDIT_ACCENT }]}>{readOnly ? "닫기" : "저장"}</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => onRepick?.()}
          disabled={!onRepick || readOnly}
          accessibilityRole={onRepick && !readOnly ? "button" : "image"}
          accessibilityLabel={onRepick && !readOnly ? "이 사진 다시 고르기" : "고치는 중인 사진"}
          style={styles.editStage}
        >
          <View style={[styles.editShot, !uri && { backgroundColor: color }]}>
            {Boolean(uri) && <Image source={{ uri }} resizeMode="contain" style={styles.fill} />}
          </View>
        </Pressable>
        {Boolean(onRepick) && !readOnly && <Text style={styles.editStageHint}>사진을 누르면 다른 사진으로 바꿔요</Text>}
        {Boolean(readOnly && readOnlyHint) && <Text style={styles.editStageHint}>{readOnlyHint}</Text>}

        <View style={styles.editTools}>
          {tool === "설명" && (
            <>
              <TextInput
                ref={captionInput}
                value={caption}
                onChangeText={onCaption}
                editable={!readOnly}
                placeholder="예: 숙소에서 삼겹살"
                placeholderTextColor={INK_FAINT}
                maxLength={200}
                accessibilityLabel="사진 설명"
                style={styles.editField}
              />
              {chips(dateOptions, (option) => option === date, (차례) => onDate(dateOptions[차례]), false)}
            </>
          )}
          {tool === "날짜" && (
            <ScrollView style={styles.editPanelScroll} contentContainerStyle={styles.editPanelPad}>
              {chips(dateOptions, (option) => option === date, (차례) => onDate(dateOptions[차례]), true)}
            </ScrollView>
          )}
          {tool === "붙이기" && (
            <ScrollView style={styles.editPanelScroll} contentContainerStyle={styles.editPanelPad}>
              {linkLabels.length
                ? chips(linkLabels, (_option, 차례) => linkChosen[차례], onToggleLink, true)
                : <Text style={styles.editStageHint}>아직 사진을 붙일 장소나 일정이 없어요</Text>}
            </ScrollView>
          )}

          <View style={styles.editToolRow}>
            {EDIT_TOOLS.map(({ key, glyph }) => {
              const on = 켜졌나(key);
              const 쓸 = 쓸_수_있나(key);
              const 위험 = key === "삭제";
              const 색 = !쓸 ? INK_FAINT : 위험 ? DANGER_INK : on ? EDIT_ACCENT : INK_SOFT;
              return (
                <Pressable
                  key={key}
                  onPress={() => 눌렀을_때(key)}
                  disabled={!쓸}
                  accessibilityRole="button"
                  accessibilityLabel={key === "홈 화면" ? cover?.label ?? "홈 화면에 이 사진 쓰기" : key}
                  accessibilityState={{ selected: on, disabled: !쓸 }}
                  style={({ pressed }) => [styles.editTool, pressed && styles.pressed]}
                >
                  <Glyph name={glyph} size={22} color={색} />
                  <Text style={[styles.editToolText, { color: 색 }]}>{key}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {Boolean(toast) && (
          <View style={[styles.toast, styles.editToast]} accessibilityLiveRegion="polite" pointerEvents="none">
            <Glyph name="check" size={17} color="#7FD8A6" weight={2.4} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 지우기 전에 한 번 묻는다. 웹에서도 물으려고 `showAlert` 를 쓴다. */
export function confirmPhotoDelete(onDelete: () => void) {
  showAlert("이 사진을 지울까요?", "사진을 여행 기록에서 삭제해요.", [
    { text: "취소", style: "cancel" },
    { text: "삭제", style: "destructive", onPress: onDelete },
  ]);
}

const STRIP_THUMB = 44;
const STRIP_GAP = 7;

const styles = StyleSheet.create({
  // 사진이 주인공이라 바탕이 검다. 앱의 다른 화면과 일부러 다르다.
  screen: { flex: 1, backgroundColor: "#000000" },
  fill: { position: "absolute", inset: 0, width: "100%", height: "100%" },
  pressed: { opacity: 0.65 },
  faded: { opacity: 0.4 },
  // 사진은 화면을 다 쓰되 `contain` 이라 절대 잘리지 않는다.
  stage: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" },
  waiting: { fontSize: 13, color: INK_SOFT, fontFamily: typo.label.family },
  scrimTop: { position: "absolute", top: 0, left: 0, right: 0, height: 150 },
  scrimBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 230 },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: Platform.OS === "ios" ? 52 : 18,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 4,
  },
  count: { flex: 1, textAlign: "center", fontSize: 14, color: INK, opacity: 0.92, fontFamily: typo.label.family },
  barButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  barButtonOn: { backgroundColor: "rgba(255,255,255,0.18)" },
  // ⋮ 바로 아래에 붙는 작은 메뉴. 한 줄뿐이라 시트를 열지 않는다.
  menu: {
    position: "absolute",
    right: 12,
    top: Platform.OS === "ios" ? 98 : 64,
    minWidth: 120,
    borderRadius: 12,
    backgroundColor: "rgba(28,27,34,0.96)",
    paddingVertical: 4,
  },
  menuRow: { paddingVertical: 11, paddingHorizontal: 16 },
  menuText: { fontSize: 14, color: INK, fontFamily: typo.label.family },
  step: {
    position: "absolute",
    top: "50%",
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  stepLeft: { left: 8 },
  stepRight: { right: 8 },
  foot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
  },
  caption: { fontSize: 16, color: INK, fontFamily: typo.title.family },
  meta: { fontSize: 12.5, color: INK_SOFT, marginTop: 3, fontFamily: typo.caption.family },
  // 기한이 얼마 안 남았을 때. 검은 바탕이라 라이트·다크 토큰 대신 밝은 주황을 쓴다.
  metaSoon: { color: "#F0B27F" },
  strip: { gap: STRIP_GAP, marginTop: 15, paddingRight: 18 },
  stripThumb: {
    width: STRIP_THUMB,
    height: STRIP_THUMB,
    borderRadius: 7,
    overflow: "hidden",
    opacity: 0.5,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  stripThumbOn: { opacity: 1, borderColor: INK },
  // 저장하고 나서 떴다 사라지는 한 줄. 묻는 창을 띄우지 않으려고 둔 자리다.
  toast: {
    position: "absolute",
    alignSelf: "center",
    bottom: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: "rgba(20,20,22,0.92)",
  },
  toastText: { fontSize: 13.5, color: INK, fontFamily: typo.label.family },
  // 고치기 화면은 도구 칸이 아래를 차지해서 조금 더 위에 띄운다.
  editToast: { bottom: 210 },
  // 신고 폼은 앱의 밝은 판을 그대로 쓴다. 검은 바탕 위에 떠서 오히려 잘 보인다.
  reportPanel: { position: "absolute", left: 16, right: 16, bottom: 40 },

  // 고치기 화면. 사진이 위에 크게 놓이고 도구는 아래에 몰아 둔다.
  editScreen: { flex: 1, backgroundColor: "#141318" },
  editHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 52 : 18,
    paddingBottom: 10,
  },
  editHeadSide: { minWidth: 56, paddingVertical: 6 },
  editHeadRight: { alignItems: "flex-end" },
  editCancel: { fontSize: 14, color: INK_SOFT, fontFamily: typo.label.family },
  editTitle: { flex: 1, textAlign: "center", fontSize: 15, color: INK, fontFamily: typo.title.family },
  editSave: { fontSize: 14, fontFamily: typo.label.family },
  editStage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10 },
  editShot: { width: "100%", height: "100%", borderRadius: 6, overflow: "hidden" },
  editStageHint: { fontSize: 12, color: INK_FAINT, textAlign: "center", paddingBottom: 8, fontFamily: typo.caption.family },
  // 도구 칸의 높이를 고정한다. 도구를 바꿀 때마다 칸이 늘었다 줄면 위의 사진이
  // 따라 움직여 눈이 어지럽다(`CardDecorEditor` 와 같은 요령이다).
  editTools: {
    minHeight: 178,
    justifyContent: "flex-end",
    backgroundColor: "#1C1B22",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2A2933",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    gap: 10,
  },
  editPanelScroll: { maxHeight: 96 },
  editPanelPad: { paddingBottom: 2 },
  editField: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 13,
    backgroundColor: "#26252E",
    color: INK,
    fontSize: 14,
    fontFamily: typo.body.family,
  },
  chipRow: { flexDirection: "row", gap: 7 },
  chipRowWrap: { flexWrap: "wrap" },
  chip: {
    maxWidth: "100%",
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#26252E",
  },
  chipText: { fontSize: 12.5, color: "rgba(255,255,255,0.8)", fontFamily: typo.label.family },
  editToolRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, marginTop: 4 },
  editTool: { alignItems: "center", gap: 6, minWidth: 54, paddingVertical: 2 },
  editToolText: { fontSize: 11.5, fontFamily: typo.label.family },
});
