/**
 * 여행 사진을 크게 보는 화면과 고치는 화면.
 *
 * 둘 다 시트가 아니라 화면을 통째로 덮는다. 시트로 열면 사진이 카드 안에 갇혀
 * 「사진 앱 같지 않다」는 말을 듣는다. 사진첩을 넘겨 보는 자리는 사진이 주인공이라야
 * 한다. 그래서 바탕을 검게 깔고 위아래에 옅은 그늘만 얹어 그 위에 아이콘을 놓았다.
 *
 * 크게 보기는 기념 카드 꾸미기와 **한 창**이다. 아래 「꾸미기」 한 줄을 누르면 창을
 * 새로 열지 않고 이 자리에서 사진이 카드가 되고 도구(`CardDecorEditor.tsx`)가
 * 올라온다. 창을 갈아 끼우면 보던 사진이 한 번 사라졌다 다시 나타나서, 이 사진으로
 * 카드를 만드는 중이라는 느낌이 끊긴다. 그냥 보기만 할 사람에게는 그 한 줄 말고는
 * 아무것도 늘지 않는다.
 *
 * 지키는 것 넷.
 *   1. 사진은 `contain` 이다. 어떤 비율이어도 잘리지 않는다. 사진첩에서 잘려 보이는
 *      것만큼 화나는 일이 없다.
 *   2. 검은 바탕 위라 글자와 아이콘 색은 테마 토큰이 아니라 흰색을 직접 쓴다. 테마의
 *      `text`·`muted` 는 밝은 바탕에서 읽히게 맞춰 둔 값이라 여기서는 묻힌다.
 *      강조가 필요한 곳(고치기 화면의 저장·고른 칩)에만 테마의 `primary` 를 쓴다.
 *   3. 저장은 묻지 않는다. 누르면 바로 받고 한 줄만 떴다 사라진다. 원본을 받을지
 *      표시본을 받을지는 기한을 보고 부르는 쪽이 정한다(`photoSave.ts`).
 *   4. 넘기는 길은 셋이다. 좌우로 밀기, 화살표, 필름 스트립. 미는 줄 모르는 사람이
 *      있고 마우스로는 누르는 편이 빠르다. 어느 하나만 두면 누군가는 못 넘긴다.
 */

import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Text } from "./AppText";
import { Glyph, type GlyphName } from "./Glyph";
import { swipeAxis, swipeCloses, swipeStep, type SwipeAxis } from "./photoSwipe";
import { showAlert } from "./showAlert";
import type { AppTheme } from "./theme";
import { onAccent } from "./theme/colors";
import { 높이, 모서리, 여백, 누름여유 } from "./theme/controls";
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

/**
 * 같은 창에서 펼치는 기념 카드 꾸미기.
 *
 * 없으면 「꾸미기」 한 줄이 나오지 않고 예전처럼 사진만 보는 창이다. 카드를 무엇으로
 * 어떻게 그릴지는 이 화면이 모른다. 부르는 쪽(`TripCards.tsx`)이 `body` 에 도구를
 * 통째로 넣어 준다.
 */
export type ViewerMenuRow = { label: string; tone?: "위험"; onPress: () => void };

export type ViewerDecor = {
  /** 도구가 펼쳐져 있는지. 펼쳐지면 무대에 도구가 딸린 카드가 온다. */
  open: boolean;
  /** 「꾸미기」. 카드를 보는 중이면 그 카드를, 사진을 보는 중이면 새 카드를 편다. */
  onOpen: () => void;
  /** 「나가기」. 도구만 접고 보기로 돌아간다. */
  onBack: () => void;
  /** 「저장」. 보기만 하는 카드면 그냥 닫는다. */
  onSave: () => void;
  /** 오른쪽 위에 적을 말. 보통 `저장`, 남의 카드면 `닫기`. */
  saveLabel: string;
  /** 꾸미기의 ⋮. 내보내기·삭제처럼 다 꾸민 뒤에 한 번 쓰는 것만 들어간다. */
  menu: ViewerMenuRow[];
  /** 보기의 ⋮. 홈 화면에 쓰기와 신고가 들어간다. */
  viewMenu: ViewerMenuRow[];
  /** 카드와 도구. 펼쳤을 때만 그린다. */
  body: React.ReactNode;
  /** 무언가 하는 중이라 화면을 통째로 덮어야 할 때 적을 말. */
  busyText?: string;
  /**
   * 보기에서 사진 대신 무대에 놓을 카드 그림. 카드를 보는 중일 때만 온다.
   *
   * 격자에서 카드를 눌렀을 때 곧바로 도구를 펴지 않는다. 격자는 누르면 크게 보는
   * 자리라, 카드만 도구부터 열리면 「눌렀더니 갑자기 고치는 화면」이 된다. 사진과
   * 같은 결로 먼저 크게 보여 주고, 고치는 것은 아래 「꾸미기」 한 번 더다.
   */
  preview?: React.ReactNode;
  /** 카드를 보는 중일 때 아래에 적을 이름과 한 줄. */
  previewTitle?: string;
  previewMeta?: string;
  /**
   * 필름 스트립 끝에 세울 카드들.
   *
   * 한 창 안에서 사진과 카드를 오가는 길이다. 창을 닫고 격자로 돌아갔다 다시
   * 들어오게 하면 「같은 창」이라고 한 뜻이 없다.
   */
  cards: { id: string; label: string; color: string; uri?: string; on: boolean }[];
  onViewCard: (id: string) => void;
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
function Scrim({ place, tall = false }: { place: "top" | "bottom"; tall?: boolean }) {
  const id = `photoScrim-${place}`;
  return (
    <View
      style={place === "top" ? styles.scrimTop : tall ? styles.scrimBottomTall : styles.scrimBottom}
      pointerEvents="none"
    >
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
  decor,
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
  /** 같은 창에서 펼치는 기념 카드 꾸미기. 없으면 사진만 보는 창이다. */
  decor?: ViewerDecor;
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
  /** 지금 도구가 펼쳐져 있는지. 펼쳐져 있으면 무대에 도구가 딸린 카드가 온다. */
  const decorating = Boolean(decor?.open);
  /** 도구는 접힌 채로 카드를 크게 보는 중인지. */
  const previewing = !decorating && Boolean(decor?.preview);
  const back = () => {
    setMenuOpen(false);
    decor?.onBack();
  };
  // 웹의 뒤로 가기는 창을 닫기 전에 도구부터 접는다. 꾸미다 뒤로 가면 여행 화면까지
  // 한 번에 튕겨 나가는 것이 아니라 보던 사진으로 돌아와야 한다.
  useWebBackClose(visible, () => (decorating ? back() : close()));
  const keyboardInset = useWebKeyboardInset(visible && decorating);

  /**
   * 좌우로 밀어 앞뒤 사진으로 넘기고, 아래로 끌어 닫는다.
   *
   * 시트로 열던 시절에는 창을 끌어내려 닫는 동작과 부딪혀 좌우를 넣지 못했다. 이제는
   * 전체 화면이라 이 화면이 두 방향을 모두 가진다. 처음 크게 움직인 쪽으로 축을 잠가
   * 가르고(`photoSwipe.ts`), 한 번 가로로 잡았으면 손가락이 떨어질 때까지 가로다.
   * 매 순간 다시 판단하면 넘기던 도중에 창이 닫힌다.
   *
   * 판은 사진 위에만 깔린다. 위쪽 아이콘 줄과 화살표, 필름 스트립은 이 위에 놓여
   * 누름을 먼저 가져가므로 밀기를 넣어도 그대로 눌린다.
   */
  const { width } = useWindowDimensions();
  const [slide] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const axis = useRef<SwipeAxis>(null);
  // 손가락이 움직일 때 필요한 값. PanResponder 를 다시 만들지 않으려고 여기로 읽는다.
  const latest = useRef({ photos, index, width, move, close, previewing });
  useEffect(() => {
    latest.current = { photos, index, width, move, close, previewing };
  });
  // 판은 한 번만 만든다. 끄는 도중에 다시 만들면 여태 끈 거리를 잊어버린다. 안에서
  // 쓰는 값은 모두 위의 `latest` 에서 읽으므로 다시 만들 까닭도 없다.
  //
  // 아래 콜백들은 PanResponder 가 손가락 이벤트 때만 부른다. ref 는 렌더 중에 읽지 않는다.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const 제자리로 = () => {
      Animated.spring(slide, { toValue: { x: 0, y: 0 }, bounciness: 2, useNativeDriver: true }).start();
    };
    const 잡을까 = (_: unknown, gesture: { dx: number; dy: number }) => {
      if (axis.current) return true;
      const 잡은_축 = swipeAxis(gesture.dx, gesture.dy);
      // 사진이 한 장뿐이면 좌우로 밀어도 갈 곳이 없다. 닫기만 받는다. 카드를 보는
      // 중에도 좌우는 받지 않는다. 카드는 사진 줄의 한 칸이 아니라서, 밀어 넘기면
      // 어디로 가는 것인지 알 수 없다. 오갈 길은 아래 스트립이다.
      const 가로_막힘 = latest.current.photos.length < 2 || latest.current.previewing;
      axis.current = 잡은_축 === "가로" && 가로_막힘 ? null : 잡은_축;
      return axis.current !== null;
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: 잡을까,
      onPanResponderMove: (_, gesture) => {
        if (axis.current === "가로") slide.setValue({ x: gesture.dx, y: 0 });
        // 아래로 끄는 만큼만 따라간다. 위로 끌어도 사진은 꿈쩍하지 않는다.
        else if (axis.current === "세로") slide.setValue({ x: 0, y: Math.max(0, gesture.dy) });
      },
      onPanResponderRelease: (_, gesture) => {
        const 축 = axis.current;
        axis.current = null;
        const { photos: 목록, index: 지금, width: 폭, move: 옮긴다, close: 닫는다 } = latest.current;
        if (축 === "세로") {
          if (!swipeCloses(gesture.dy, gesture.vy)) return 제자리로();
          slide.setValue({ x: 0, y: 0 });
          닫는다();
          return;
        }
        const 걸음 = 축 === "가로" ? swipeStep(gesture.dx, gesture.vx, 폭) : 0;
        if (!걸음) return 제자리로();
        // 민 쪽으로 마저 빠져나간 뒤 다음 사진이 제자리에 나타난다. 손이 놓은 방향을
        // 눈이 따라갈 수 있어야 앞으로 갔는지 뒤로 갔는지 안다.
        Animated.timing(slide, {
          toValue: { x: 걸음 > 0 ? -폭 : 폭, y: 0 },
          duration: 130,
          useNativeDriver: true,
        }).start(() => {
          slide.setValue({ x: 0, y: 0 });
          옮긴다(목록[(지금 + 걸음 + 목록.length) % 목록.length].id);
        });
      },
      onPanResponderTerminate: () => {
        axis.current = null;
        제자리로();
      },
      onPanResponderTerminationRequest: () => false,
    });
  });
  // 창을 새로 열 때는 늘 제자리에서 시작한다. 밀다 만 자리가 남아 있으면 안 된다.
  useEffect(() => {
    if (visible) slide.setValue({ x: 0, y: 0 });
  }, [slide, visible]);

  // 필름 스트립이 지금 보는 사진을 늘 화면에 두게 한다. 스무 장쯤 되면 화살표로
  // 넘길수록 지금 사진이 줄 밖으로 밀려나 어디쯤인지 알 수 없다.
  useEffect(() => {
    if (!visible || index < 0) return;
    const timer = setTimeout(() => {
      strip.current?.scrollTo({ x: Math.max(0, index * (STRIP_THUMB + STRIP_GAP) - STRIP_THUMB * 2), animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [index, visible]);

  // 도구를 펼쳐 둔 동안에는 볼 사진이 없어도 창이 남아 있어야 한다. 카드에 넣은
  // 사진을 다 빼도 카드는 그대로 꾸미는 중이다.
  if (!photo && !decorating && !previewing) return null;
  const meta = photo
    ? [photo.date, photo.uploaderName ? `${photo.uploaderName} 올림` : ""].filter(Boolean).join(" · ")
    : "";
  /**
   * ⋮ 안에 들어갈 것.
   *
   * 보기와 꾸미기가 서로 다른 것을 담는다. 홈 화면에 쓰는 것은 보기 쪽이다. 지금
   * 크게 보고 있는 것을 홈에 까는 일이라, 고치러 들어가야 보이면 고칠 생각이 없는
   * 사람은 찾지 못한다. 내보내기·삭제는 다 꾸민 뒤에 한 번 쓰는 것이라 꾸미기 쪽이다.
   */
  const menuRows: ViewerMenuRow[] = decorating
    ? decor?.menu ?? []
    : decor
      ? decor.viewMenu
      : onReport
        ? [{ label: "신고", onPress: () => onReport() }]
        : [];
  /** 스트립 끝에 세울 카드. 꾸미는 동안에는 스트립 자체가 없다. */
  const 카드칸 = decor?.cards ?? [];
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
      {/* 보기와 꾸미기가 이 한 창을 나눠 쓴다. 창을 갈아 끼우지 않아 「꾸미기」를
          눌러도 화면이 한 번 깜빡이지 않는다. */}
      <KeyboardAvoidingView
        style={[styles.screen, keyboardInset]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {decorating && decor ? (
        <>
          <View style={styles.decorHead}>
            <Pressable
              onPress={back}
              accessibilityRole="button"
              accessibilityLabel="꾸미기 접고 사진으로 돌아가기"
              style={({ pressed }) => [styles.decorHeadSide, pressed && styles.pressed]}
            >
              <Text style={styles.decorBack}>나가기</Text>
            </Pressable>
            <Text style={styles.decorTitle}>카드 꾸미기</Text>
            {menuRows.length > 0 && (
              <BarButton
                glyph="moreVertical"
                label="카드 더 보기"
                on={menuOpen}
                onPress={() => setMenuOpen((열림) => !열림)}
              />
            )}
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                decor.onSave();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${decor.saveLabel} 하기`}
              style={({ pressed }) => [styles.decorHeadSide, styles.decorHeadRight, pressed && styles.pressed]}
            >
              <Text style={[styles.decorSave, { color: EDIT_ACCENT }]}>{decor.saveLabel}</Text>
            </Pressable>
          </View>
          {decor.body}
        </>
        ) : (
        <>
        <Animated.View
          {...pan.panHandlers}
          style={[styles.stage, { transform: slide.getTranslateTransform() }]}
        >
          {previewing
            ? null
            : photo?.uri
              ? <Image source={{ uri: photo.uri }} resizeMode="contain" style={styles.fill} accessibilityLabel={photo.caption || "여행 사진"} />
              : <Text style={styles.waiting}>{waitingText ?? "사진을 받는 중이에요"}</Text>}
        </Animated.View>
        {/* 카드는 위 아이콘 줄과 아래 설명·스트립을 비운 칸에 통째로 담는다. 사진처럼
            화면을 꽉 채우면 틀 아래의 글이 스트립에 가린다. */}
        {previewing && (
          <View style={styles.previewBox} pointerEvents="none">{decor?.preview}</View>
        )}
        <Scrim place="top" />
        {/* 「꾸미기」 한 줄이 붙으면 아래가 한 줄 길어진다. 그늘도 그만큼 더 깐다. */}
        <Scrim place="bottom" tall={Boolean(decor)} />

        <View style={styles.bar}>
          <BarButton glyph="close" label="크게 보기 닫기" onPress={close} />
          <Text style={styles.count}>{!previewing && photos.length > 1 ? `${index + 1} / ${photos.length}` : ""}</Text>
          {/* ↓ 와 ✎ 는 사진에만 있는 것이다. 카드는 내려받을 원본도, 설명·날짜를
              고칠 곳도 없다(카드를 고치는 것은 아래 「꾸미기」다). */}
          {!previewing && (
            <BarButton
              glyph="download"
              label="이 사진 저장"
              on={saving}
              disabled={saving || saveBlocked}
              onPress={onSave}
            />
          )}
          {Boolean(onEdit) && !previewing && <BarButton glyph="pencil" label="사진 고치기" onPress={() => onEdit?.()} />}
          {menuRows.length > 0 && (
            <BarButton glyph="moreVertical" label="더 보기" on={menuOpen} onPress={() => setMenuOpen((열림) => !열림)} />
          )}
        </View>

        {photos.length > 1 && !previewing && (
          <>
            <Pressable
              onPress={() => move(photos[(index + photos.length - 1) % photos.length].id)}
              accessibilityRole="button"
              accessibilityLabel="이전 사진"
              hitSlop={누름여유(높이.칩)}
              style={({ pressed }) => [styles.step, styles.stepLeft, pressed && styles.pressed]}
            >
              <Glyph name="chevronLeft" size={20} color={INK} />
            </Pressable>
            <Pressable
              onPress={() => move(photos[(index + 1) % photos.length].id)}
              accessibilityRole="button"
              accessibilityLabel="다음 사진"
              hitSlop={누름여유(높이.칩)}
              style={({ pressed }) => [styles.step, styles.stepRight, pressed && styles.pressed]}
            >
              <Glyph name="chevronRight" size={20} color={INK} />
            </Pressable>
          </>
        )}

        <View style={styles.foot} pointerEvents="box-none">
          <Text numberOfLines={2} style={styles.caption}>
            {previewing ? decor?.previewTitle || "기념 카드" : photo?.caption || "설명 없이 남긴 사진"}
          </Text>
          <Text style={styles.meta}>{previewing ? decor?.previewMeta ?? "" : meta}</Text>
          {Boolean(hint) && !previewing && <Text style={[styles.meta, hintSoon && styles.metaSoon]}>{hint}</Text>}
          {(photos.length > 1 || 카드칸.length > 0) && (
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
                  accessibilityState={{ selected: !previewing && 차례 === index }}
                  accessibilityLabel={`${하나.caption || `사진 ${차례 + 1}`} 보기`}
                  style={[
                    styles.stripThumb,
                    { backgroundColor: 하나.color },
                    !previewing && 차례 === index && styles.stripThumbOn,
                  ]}
                >
                  {Boolean(하나.uri) && <Image source={{ uri: 하나.uri }} resizeMode="cover" style={styles.fill} />}
                </Pressable>
              ))}
              {/* 스트립 끝에 만들어 둔 카드를 세운다. 사진과 카드를 오가는 길이 이
                  한 줄이라, 카드를 보다 사진으로 가려고 창을 닫을 일이 없다. */}
              {카드칸.map((하나) => (
                <Pressable
                  key={`card:${하나.id}`}
                  onPress={() => decor?.onViewCard(하나.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: 하나.on }}
                  accessibilityLabel={`${하나.label} 기념 카드 보기`}
                  style={[styles.stripThumb, { backgroundColor: 하나.color }, 하나.on && styles.stripThumbOn]}
                >
                  {Boolean(하나.uri) && <Image source={{ uri: 하나.uri }} resizeMode="cover" style={styles.fill} />}
                  <View style={styles.stripCardMark} pointerEvents="none">
                    <Text style={styles.stripCardMarkText}>카드</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {/* 그냥 보기만 할 사람에게 늘어나는 것은 이 두 줄뿐이다. 도구는 접혀 있다.
              「꾸미기」 넉 자만으로는 눌러 봐야 무엇이 열리는지 알 수 있어서, 무엇이
              되는 자리인지 작은 글씨로 한 줄 붙인다. */}
          {Boolean(decor) && (
            <>
              <Pressable
                onPress={() => decor?.onOpen()}
                accessibilityRole="button"
                accessibilityLabel={previewing ? "이 카드 꾸미기" : "이 사진으로 기념 카드 만들기"}
                style={({ pressed }) => [styles.decorate, pressed && styles.pressed]}
              >
                <Glyph name="pencil" size={17} color={INK} weight={2} />
                <Text style={styles.decorateText}>{previewing ? "이 카드 꾸미기" : "꾸미기"}</Text>
              </Pressable>
              <Text style={styles.decorateHint}>
                {previewing
                  ? "프레임·사진·글·스티커를 고쳐요"
                  : "이 사진으로 기념 카드를 만들 수 있어요"}
              </Text>
            </>
          )}
        </View>
        </>
        )}

        {/* ⋮ 메뉴는 두 모습이 같이 쓴다. 보기에서는 신고 하나, 꾸미기에서는 내보내기·
            홈 화면·삭제처럼 가끔 쓰는 것이 들어간다. 자주 쓰는 것은 메뉴에 두지 않는다. */}
        {menuOpen && menuRows.length > 0 && (
          <View style={styles.menu}>
            {menuRows.map((하나) => (
              <Pressable
                key={하나.label}
                onPress={() => {
                  setMenuOpen(false);
                  하나.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={하나.label}
                style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              >
                <Text style={[styles.menuText, 하나.tone === "위험" && styles.menuTextDanger]}>{하나.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {Boolean(toast) && (
          <View style={styles.toast} accessibilityLiveRegion="polite" pointerEvents="none">
            <Glyph name="check" size={17} color="#7FD8A6" weight={2.4} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
        {Boolean(report) && <View style={styles.reportPanel}>{report}</View>}
        {/* 카드를 찍는 동안 카드를 제 크기로 되돌린다(`CardDecorTools`). 화면 밖으로
            넘치는 그 모습을 보일 까닭이 없어 통째로 덮고 무엇을 하는 중인지만 적는다. */}
        {Boolean(decorating && decor?.busyText) && (
          <View style={styles.busy} accessibilityLiveRegion="polite">
            <Text style={styles.busyText}>{decor?.busyText}</Text>
          </View>
        )}
      </KeyboardAvoidingView>
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
            hitSlop={누름여유(높이.칩)}
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
  // 웹에서 마우스로 밀 때 사진이 선택되거나 브라우저의 그림 끌기가 먼저 잡지 않게 막는다.
  stage: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", userSelect: "none" },
  waiting: { fontSize: 13, color: INK_SOFT, fontFamily: typo.label.family },
  scrimTop: { position: "absolute", top: 0, left: 0, right: 0, height: 150 },
  scrimBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 230 },
  scrimBottomTall: { position: "absolute", bottom: 0, left: 0, right: 0, height: 330 },
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
  barButton: { width: 높이.버튼, height: 높이.버튼, borderRadius: 모서리.원, alignItems: "center", justifyContent: "center" },
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
  menuTextDanger: { color: DANGER_INK },
  // 사진 위에 떠 있는 넘기기 화살표. 사진을 가리지 않게 칩 크기로 두고
  // hitSlop 으로 누르는 넓이만 채운다.
  step: {
    position: "absolute",
    top: "50%",
    marginTop: -높이.칩 / 2,
    width: 높이.칩,
    height: 높이.칩,
    borderRadius: 모서리.원,
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
  // 스트립 안에서 카드와 사진을 가르는 표. 기록 탭 격자의 「카드」 배지와 같은 말이다.
  stripCardMark: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    backgroundColor: "rgba(17,16,15,0.72)",
  },
  stripCardMarkText: { fontSize: 8, color: INK, fontFamily: typo.label.family },
  // 카드를 크게 보는 자리. 아이콘 줄과 아래 설명·스트립·꾸미기 줄을 비워 둔다.
  previewBox: { position: "absolute", left: 0, right: 0, top: 92, bottom: 280 },
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
  // 「꾸미기」 한 줄. 사진 아래에 놓여 눈에는 들되 사진을 가리지 않는다.
  decorate: {
    marginTop: 15,
    height: 높이.버튼,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  decorateText: { fontSize: 14, color: INK, fontFamily: typo.title.family },
  decorateHint: { fontSize: 11.5, color: INK_SOFT, textAlign: "center", marginTop: 7, fontFamily: typo.caption.family },
  // 꾸미기 머리줄. 보기의 아이콘 줄과 달리 흐르는 자리에 놓여 아래 카드를 밀어 준다.
  decorHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "ios" ? 52 : 18,
    paddingBottom: 8,
    gap: 4,
  },
  decorHeadSide: { minWidth: 56, paddingVertical: 8, paddingHorizontal: 4 },
  decorHeadRight: { alignItems: "flex-end" },
  decorBack: { fontSize: 13.5, color: INK_SOFT, fontFamily: typo.label.family },
  decorTitle: { flex: 1, textAlign: "center", fontSize: 15, color: INK, fontFamily: typo.title.family },
  decorSave: { fontSize: 14, fontFamily: typo.label.family },
  // 카드를 찍는 동안 덮는 판. 화면 밖으로 넘친 카드를 가린다.
  busy: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,12,0.92)",
  },
  busyText: { fontSize: 14, color: INK, fontFamily: typo.label.family },
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
    height: 높이.입력,
    borderRadius: 모서리.버튼,
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
    height: 높이.칩,
    borderRadius: 모서리.원,
    paddingHorizontal: 여백.가로좁게,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#26252E",
  },
  chipText: { fontSize: 12.5, color: "rgba(255,255,255,0.8)", fontFamily: typo.label.family },
  editToolRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, marginTop: 4 },
  editTool: { alignItems: "center", gap: 6, minWidth: 54, paddingVertical: 2 },
  editToolText: { fontSize: 11.5, fontFamily: typo.label.family },
});
