/**
 * 기념 카드 꾸미기 도구 — 카드를 크게 띄우고, 아래 막대의 도구를 시트로 올려 고친다.
 *
 * 창을 스스로 열지 않는다. 사진을 크게 보는 창(`PhotoViewer.tsx`)이 「꾸미기」를
 * 누르면 그 자리에서 이것을 펼친다. 사진과 카드가 다른 창이면 한 장을 카드로
 * 만들다 말고 나갔다 들어오게 된다. 보던 사진이 그대로 카드가 되어야 한다.
 *
 * 도구는 아래 막대의 다섯이다(2026-09-22, 인스타그램·캔바와 같은 틀). 누른 것만 시트로
 * 올라오고, 시트는 끌어 올려 크게·내려서 닫는다. 아무것도 안 열면 카드가 화면을 크게 쓴다.
 *   프레임 — 프레임·비율·프레임 색·날짜 도장·사진 설명
 *   사진 — 어떤 사진을 몇 번째 칸에 넣을지(카드에서 꾹 누르면 자리 바꾸기, 차례 줄 `CardOrderStrip.tsx`)
 *   글자 — 카드에 글자 붙이기, 제목·한 줄 설명·넣을 항목·통계
 *   스티커 — 갈래별 오려 붙인 스티커(`stickers/`)
 *   바탕 — 종이 무늬·종이 색
 * 되돌리기·다시하기는 머리줄 가운데(`PhotoViewer` 의 history), 복제는 스티커 손잡이 ⧉ 다.
 * 글자를 고치는 창은 `CardTextEditor.tsx` 에 있다.
 *
 * 부르는 말은 「프레임」으로 맞췄다. 「틀」은 뜻은 맞지만 이 자리에서 무엇을
 * 가리키는지 바로 오지 않고, 네컷 사진을 찍어 본 사람이 실제로 쓰는 말은 프레임이다.
 *
 * 지키는 것 셋.
 *   1. 어느 도구를 열어도 카드가 통째로 보인다. 남는 칸을 재서 카드를 그만큼 줄인다
 *      (`fitScaleOf`).
 *   2. 끄는 동안 다시 그리지 않는다. 움직이는 스티커만 `Animated` 로 밀고
 *      (`KeepsakeCardView` 의 `DecorItem`), 손을 뗄 때 한 번 상태로 올린다.
 *   3. 자리는 카드 크기에 대한 비율로만 들고 있는다. 줄여 보여 줘도 내보낸
 *      그림에서 같은 자리에 찍힌다.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { Text } from "./AppText";
import { useOnceTip } from "./onceTip";
import { COVER_FOCUS_DEFAULT, sameFocus } from "./coverCrop";
import { CoverFocusScreen } from "./ui/CoverFocusScreen";
import { Glyph, type GlyphName } from "./Glyph";
import { KeepsakeCardView, ScaledCard, type CardPhoto } from "./KeepsakeCardView";
import { CardOrderStrip, pickStyles } from "./CardOrderStrip";
import { CardTextEditor } from "./CardTextEditor";
import { ACCENT, CHIP, CHIP_EDGE, INK, INK_FAINT, INK_SOFT, PANEL } from "./cardToolColors";
import { STICKER_CATEGORIES, stickerAspect } from "./stickers/catalog";
import { StickerArt } from "./stickers/StickerArt";
import {
  addDecor,
  fitScaleOf,
  moveDecor,
  removeDecor,
  duplicateDecor,
  setDecorStyle,
  setDecorSize,
  setDecorText,
  DECOR_MAX,
  type CardDecor,
  type KeepsakeSticker,
} from "./cardDecor";
import { Chip, ChipRow as SharedChipRow } from "./ui/Chip";
import type { AppTheme } from "./theme";
import { onAccent } from "./theme/colors";
import { 높이, 모서리, 여백 } from "./theme/controls";
import { typo } from "./theme/typography";
import {
  isCutStyle,
  keepsakePhotoFullReason,
  keepsakeShotScale,
  keepsakeSizeOf,
  KEEPSAKE_PAPER_COLORS,
  KEEPSAKE_PAPER_PATTERNS,
  type KeepsakePaperColor,
  type KeepsakePaperPattern,
  moveKeepsakePhoto,
  placeKeepsakePhoto,
  swapKeepsakePhotos,
  toggleKeepsakePhoto,
  keepsakeFrameColorLabel,
  keepsakeRatioLabel,
  keepsakeStyleLabel,
  KEEPSAKE_MAX_PHOTOS,
  KEEPSAKE_FRAME_COLORS,
  KEEPSAKE_PARTS,
  KEEPSAKE_PART_LABELS,
  KEEPSAKE_RATIOS,
  KEEPSAKE_STAT_KINDS,
  KEEPSAKE_STAT_LABELS,
  KEEPSAKE_STYLES,
  type KeepsakeCard,
  type KeepsakeFrameColor,
  type KeepsakePart,
  type KeepsakeRatio,
  type KeepsakeStatKind,
  type KeepsakeStyle,
} from "./tripCard";
import { josa } from "./tripExpenses";

/** 카드를 띄울 칸의 안쪽 여백. 카드가 화면 끝에 붙지 않게 한다. */
const STAGE_PAD = 16;

/**
 * 아래 막대의 도구(2026-09-22, 인스타그램·캔바와 같은 틀). 누른 것만 시트로 올라온다.
 * 「글자」는 예전 「텍스트」 갈래(카드 제목·설명)에 글자 스티커 붙이기를 더한 것이다.
 */
const CARD_TOOL_TABS = ["프레임", "사진", "글자", "스티커", "바탕"] as const;
type CardToolTab = (typeof CARD_TOOL_TABS)[number];
const TOOL_GLYPH: Record<CardToolTab, GlyphName> = {
  프레임: "cardFrame", 사진: "photo", 글자: "textT", 스티커: "sticker", 바탕: "paper",
};
const STICKER_CATEGORY_NAMES = STICKER_CATEGORIES.map((갈래) => 갈래.name);
/** 가로로 긴 스티커(글씨 띠·테이프)는 고르는 판에서 두 칸을 쓴다. */
const 넓은_스티커 = (sticker: string) => stickerAspect(sticker) > 1.5;

/** 목록에 있으면 빼고 없으면 넣는다. 「카드에 넣을 것」·「통계」 칩이 쓴다. */
const 넣고_빼기 = <T extends string>(고른_목록: readonly T[], 값: T): T[] =>
  고른_목록.includes(값) ? 고른_목록.filter((하나) => 하나 !== 값) : [...고른_목록, 값];

/**
 * 칸의 크기를 잰다. 카드를 그 칸에 맞춰 얼마나 줄일지(`fitScaleOf`) 정하는 데 쓴다.
 * 같은 크기면 상태를 그대로 두어 다시 그리지 않는다.
 */
function useBoxSize() {
  const [칸, 칸재기] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    칸재기((지금) => (지금.width === width && 지금.height === height ? 지금 : { width, height }));
  }, []);
  return [칸, onLayout] as const;
}

/** 갈래 안의 작은 제목. 무엇을 고르는 줄인지만 알린다. */
function PanelLabel({ text }: { text: string }) {
  return <Text style={styles.panelLabel}>{text}</Text>;
}

/**
 * 고르는 칩 한 줄.
 *
 * 모양은 공통 부품(`ui/Chip`)을 그대로 쓰고 색만 이 화면 것을 준다. 도구 칸은
 * 늘 어두워서 테마 색을 그대로 쓰면 글자가 묻힌다.
 *
 * 꺼진 칩에도 테두리를 준다. 채움만으로 가르면 어두운 바탕에서 꺼진 칩이 바탕에
 * 녹아 「고를 수 있는 것」으로 보이지 않는다. 「카드에 넣을 것」처럼 켜고 끄는
 * 줄에서 특히 그렇다.
 */
const ChipRow = memo(function ChipRow({
  options,
  chosen,
  accent,
  accentInk,
  onPress,
  labelOf,
}: {
  options: readonly string[];
  chosen: (option: string) => boolean;
  accent: string;
  /** 고른 칩의 글자색. 강조색 위에서 읽히는 값이라 테마가 정한다. */
  accentInk: string;
  onPress: (option: string) => void;
  /** 칩에 적을 이름. 저장되는 값과 보이는 말이 다른 줄만 준다. */
  labelOf?: (option: string) => string;
}) {
  return (
    <SharedChipRow>
      {options.map((option) => {
        const on = chosen(option);
        return (
          <Chip
            key={option}
            label={labelOf ? labelOf(option) : option}
            on={on}
            onPress={() => onPress(option)}
            colors={on
              ? { background: accent, border: accent, text: accentInk }
              : { background: CHIP, border: CHIP_EDGE, text: INK_SOFT }}
          />
        );
      })}
    </SharedChipRow>
  );
});

/** 켜고 끄는 한 줄. 칩으로 두면 켠 것인지 고른 것인지 헷갈린다. */
function Toggle({
  label,
  on,
  accent,
  onPress,
}: {
  label: string;
  on: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggleTrack, on && { backgroundColor: accent }]}>
        <View style={[styles.toggleKnob, on && styles.toggleKnobOn]} />
      </View>
    </Pressable>
  );
}

/**
 * 찍는 동안의 배치. 폰은 카드를 목표 픽셀(가로 2160)이 되는 크기로 **처음부터 크게 배치**해
 * 바깥 상자를 찍는다(`unit`, `keepsakeShotScale`). transform 으로 키우지 않는다 — iOS 가 둥글게
 * 자르는 층을 작게 먼저 그려 사진이 흐려졌다. 웹의 캡처는 화면에 그려진 크기 그대로 찍으므로
 * 예전처럼 제 크기(1)로 두고 카드 자신을 찍는다.
 */
function shotLayoutOf(size: { width: number; exportWidth: number }, exporting: boolean) {
  const native = Platform.OS !== "web";
  const unit = exporting && native ? keepsakeShotScale(size, PixelRatio.get()) : 1;
  return { native, unit };
}

/**
 * 도구 없이 카드만 크게 보여 준다.
 *
 * 격자에서 카드를 누르면 사진과 같은 결로 먼저 이것이 뜬다. 고치는 것은 아래
 * 「꾸미기」를 한 번 더 눌렀을 때다. 꾸미기와 같은 셈(`fitScaleOf`)으로 줄여서,
 * 「꾸미기」를 눌러도 카드 크기가 크게 달라지지 않는다.
 */
export function CardPreview({
  card,
  photos,
  text,
  stats,
  stamp,
  onPhotoReady,
  shotRef,
  exporting = false,
}: {
  card: KeepsakeCard;
  photos: CardPhoto[];
  text: { title: string; meta: string; caption: string; people: string };
  stats: { label: string; value: string }[];
  stamp: string;
  /** 사진이 다 그려졌다고 알린다. 이것이 없으면 「카드 저장」이 사진을 영영 기다린다. */
  onPhotoReady?: (key: string) => void;
  /**
   * 찍을 자리. 보기에서 「카드 공유」를 눌렀는데 서버에 저장된 그림이 없거나 옛것이면
   * 여기서 찍는다. 옆 칸에 미리 그려 두는 카드에는 주지 않는다.
   */
  shotRef?: React.RefObject<View | null>;
  /** 찍는 중. 꾸미기와 같이 카드를 제 크기로 되돌린다(부르는 쪽이 덮개로 가린다). */
  exporting?: boolean;
}) {
  const [칸, onLayout] = useBoxSize();
  const size = keepsakeSizeOf(card.ratio, card.style);
  const 찍기 = shotLayoutOf(size, exporting);
  const scale = exporting
    ? 1
    : fitScaleOf(size.width, size.height, 칸.width - STAGE_PAD * 2, 칸.height - STAGE_PAD * 2);
  return (
    <View style={styles.stage} onLayout={onLayout} accessibilityLabel={`${text.title || "추억 카드"} 크게 보기`}>
      {칸.width > 0 && (
        <ScaledCard scale={scale} width={size.width * 찍기.unit} height={size.height * 찍기.unit} shotRef={찍기.native ? shotRef : undefined}>
          <KeepsakeCardView
            shotRef={찍기.native ? undefined : shotRef}
            unit={찍기.unit}
            card={card}
            photos={photos}
            text={text}
            stats={stats}
            stamp={stamp}
            big={exporting}
            onPhotoReady={onPhotoReady}
          />
        </ScaledCard>
      )}
    </View>
  );
}

/**
 * 기록 탭 격자 한 칸에 들어가는 작은 카드. 크게 볼 때와 같은 그림을 칸에 맞게 줄인다.
 *
 * 예전에는 첫 사진 한 장에 「카드」 표시만 붙여, 두 장짜리 카드도 한 장처럼 보였다.
 * 글자는 거의 읽히지 않지만 틀 모양과 사진 배치로 어떤 카드인지 알아본다.
 */
export function CardThumb({
  card,
  photos,
  text,
  stats,
  stamp,
}: {
  card: KeepsakeCard;
  photos: CardPhoto[];
  text: { title: string; meta: string; caption: string; people: string };
  stats: { label: string; value: string }[];
  stamp: string;
}) {
  const [칸, onLayout] = useBoxSize();
  const size = keepsakeSizeOf(card.ratio, card.style);
  return (
    <View style={styles.thumbStage} onLayout={onLayout} pointerEvents="none">
      {칸.width > 0 && (
        <ScaledCard scale={fitScaleOf(size.width, size.height, 칸.width - 4, 칸.height - 4)} width={size.width} height={size.height}>
          <KeepsakeCardView card={card} photos={photos} text={text} stats={stats} stamp={stamp} big={false} />
        </ScaledCard>
      )}
    </View>
  );
}

export function CardDecorTools({
  card,
  tune,
  onDecor,
  allPhotos,
  drawPhotos,
  thumbs,
  text,
  stats,
  stamp,
  notice,
  suggest,
  exporting,
  shotRef,
  onPhotoReady,
  readOnly,
  readOnlyHint,
  theme,
}: {
  card: KeepsakeCard;
  /** 카드 한 칸을 고친다. 고친 것은 바로 카드에 보인다. */
  tune: (change: Partial<KeepsakeCard>) => void;
  /** 얹은 것 목록을 고친다. 지금 목록을 받아 새 목록을 돌려준다. */
  onDecor: (change: (list: CardDecor[]) => CardDecor[]) => void;
  /** 이 여행에서 카드에 쓸 수 있는 사진 전부. 「사진」 갈래가 늘어놓는다. */
  allPhotos: CardPhoto[];
  /** 지금 카드에 그릴 사진. 고른 차례대로다. */
  drawPhotos: CardPhoto[];
  thumbs: Record<string, string>;
  text: { title: string; meta: string; caption: string; people: string };
  stats: { label: string; value: string }[];
  stamp: string;
  /** 틀이 바라는 사진 수가 모자랄 때 알릴 말. */
  notice: string;
  /** 고른 사진 수에 어울리는 틀. 없으면 빈 글자다. */
  suggest: string;
  /** 내보내는 중인지. 그때만 카드를 줄이지 않고 표시본 그대로 그린다. */
  exporting: boolean;
  /** 내보낼 때 찍을 곳. */
  shotRef?: React.RefObject<View | null>;
  onPhotoReady?: (key: string) => void;
  /** 남이 만든 카드. 보기만 하고 도구는 나오지 않는다. */
  readOnly?: boolean;
  readOnlyHint?: string;
  theme?: AppTheme;
}) {
  // 아무것도 안 열면 카드가 화면을 크게 쓴다. 사진 없이 시작한 새 카드만 「사진」부터 연다.
  const [tab, setTab] = useState<CardToolTab | null>(card.photoIds.length ? null : "사진");
  /** 시트를 끌어 올려 크게 봤는지. 스티커를 고를 때처럼 칸이 많이 필요할 때 쓴다. */
  const [시트_크게, 시트_크게_하기] = useState(false);
  const { height: 창_높이 } = useWindowDimensions();
  const 보통_높이 = 250;
  const 큰_높이 = Math.max(보통_높이 + 80, Math.round(창_높이 * 0.56));
  const 시트_높이 = 시트_크게 ? 큰_높이 : 보통_높이;
  /**
   * 끄는 동안 더해진 높이. 손가락을 그대로 따라온다(2026-09-22 요청). 끄는 동안에는 시트만
   * 카드 위로 겹쳐 올라가고 자리(레이아웃)는 그대로라, 카드가 매 순간 다시 맞춰지지 않는다.
   * 손을 떼면 가까운 높이(닫기·보통·크게)로 붙은 뒤에 자리를 한 번 바꾼다.
   */
  const [끌림] = useState(() => new Animated.Value(0));
  const 보이는_높이 = useMemo(() => Animated.add(new Animated.Value(시트_높이), 끌림), [시트_높이, 끌림]);
  const 시트_손 = useRef({ 높이: 시트_높이, 보통: 보통_높이, 크게: 큰_높이 });
  useEffect(() => {
    시트_손.current = { 높이: 시트_높이, 보통: 보통_높이, 크게: 큰_높이 };
  }, [시트_높이, 보통_높이, 큰_높이]);
  const 손잡이 = useMemo(
    () => {
      /** 이 높이로 붙인다. 0 이면 닫는다. */
      const 붙이기 = (목표: number) => {
        const { 높이 } = 시트_손.current;
        Animated.spring(끌림, { toValue: 목표 - 높이, useNativeDriver: false, friction: 9, tension: 80 }).start(() => {
          if (목표 === 0) setTab(null);
          else 시트_크게_하기(목표 > 시트_손.current.보통);
          끌림.setValue(0);
        });
      };
      // 손가락 이벤트 때만 ref 를 읽는다.
      // eslint-disable-next-line react-hooks/refs
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => {
          const { 높이, 크게 } = 시트_손.current;
          // 위로는 큰 높이 조금 너머까지, 아래로는 닫힐 만큼만 따라간다.
          끌림.setValue(Math.max(-높이, Math.min(크게 + 40 - 높이, -g.dy)));
        },
        onPanResponderRelease: (_, g) => {
          const { 높이, 보통, 크게 } = 시트_손.current;
          if (Math.abs(g.dy) < 6) {
            // 톡 누르면 크기만 바꾼다.
            붙이기(높이 === 크게 ? 보통 : 크게);
            return;
          }
          // 빠르게 튕기면 그 방향으로, 아니면 놓은 자리에서 가까운 높이로.
          const 놓은_높이 = 높이 - g.dy - g.vy * 120;
          const 후보 = [0, 보통, 크게];
          const 목표 = 후보.reduce((가까운, 하나) => (Math.abs(하나 - 놓은_높이) < Math.abs(가까운 - 놓은_높이) ? 하나 : 가까운));
          붙이기(목표 === 0 && 높이 - g.dy > 보통 * 0.55 && g.vy < 1 ? 보통 : 목표);
        },
        onPanResponderTerminate: () => 붙이기(시트_손.current.높이),
      });
    },
    [끌림],
  );
  const [고른_것, 고르기] = useState("");
  const [칸, onStageLayout] = useBoxSize();

  const accent = theme?.primary ?? "#3F4C8F";
  const accentInk = onAccent(Boolean(theme?.dark));
  const size = keepsakeSizeOf(card.ratio, card.style);
  /**
   * 내보낼 때는 줄이지 않는다.
   *
   * 웹의 캡처(html2canvas)는 화면에 그려진 크기 그대로 찍는다. 줄여 둔 카드를
   * 찍으면 1080px 로 늘릴 때 뭉개진다. 내보내는 동안에는 카드를 제 크기로 되돌리고
   * 부르는 쪽이 「만드는 중」 덮개로 가린다.
   */
  const 찍기 = shotLayoutOf(size, exporting);
  /**
   * 확대(2026-09-22 요청). 두 손가락으로 벌려 카드를 키우고 끌어 옮기며 꾸민다. 스티커를 옮기는
   * 셈은 `edit.scale` 을 나누므로 여기 배수가 들어간 값을 넘기면 확대한 채로도 손가락을 따라온다.
   */
  const [확대, 확대하기] = useState({ 배: 1, x: 0, y: 0 });
  const 맞춘_배 = fitScaleOf(size.width, size.height, 칸.width - STAGE_PAD * 2, 칸.height - STAGE_PAD * 2);
  const scale = exporting ? 1 : 맞춘_배 * 확대.배;
  // 손가락 이벤트에서 읽는 값. 렌더 중에는 읽지 않는다.
  const 확대_지금 = useRef(확대);
  /**
   * 벌리는 동안의 확대. 매 순간 상태를 고치면 화면 전체를 다시 그려 굼떴다. 손가락을 따라서는
   * 이 값만 움직이고(겉에 덧씌우는 배와 옮김), 손을 떼면 한 번만 상태(`확대`)로 옮긴다.
   */
  const [핀치] = useState(() => ({ 배: new Animated.Value(1), x: new Animated.Value(0), y: new Animated.Value(0) }));
  useEffect(() => {
    확대_지금.current = 확대;
    // 상태로 옮긴 뒤에 덧씌운 값을 푼다. 먼저 풀면 한 번 원래 크기로 튀어 보인다.
    핀치.배.setValue(1);
    핀치.x.setValue(0);
    핀치.y.setValue(0);
  }, [확대, 핀치]);
  const 두_손가락 = useMemo(() => {
    const 처음 = { 거리: 0, 가운데x: 0, 가운데y: 0, 배: 1, x: 0, y: 0 };
    /** 손을 뗄 때 상태로 옮길 값. */
    const 끝 = { 배: 1, x: 0, y: 0, 움직임: false };
    /** 손을 떼거나 빼앗겼을 때. 벌린 것이 있으면 한 번만 상태로 옮긴다. */
    const 놓기 = () => {
      처음.거리 = 0;
      if (끝.움직임) 확대하기({ 배: 끝.배, x: 끝.x, y: 끝.y });
      끝.움직임 = false;
    };
    const 재기 = (터치: readonly { pageX: number; pageY: number }[]) => ({
      거리: Math.hypot(터치[0].pageX - 터치[1].pageX, 터치[0].pageY - 터치[1].pageY),
      가운데x: (터치[0].pageX + 터치[1].pageX) / 2,
      가운데y: (터치[0].pageY + 터치[1].pageY) / 2,
    });
    // 손가락 이벤트 때만 ref 를 읽는다.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      // 두 손가락일 때만 가져온다. 한 손가락은 스티커 끌기·사진 꾹 누르기에 그대로 간다.
      onStartShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length >= 2,
      onPanResponderGrant: (event) => {
        const 터치 = event.nativeEvent.touches;
        if (터치.length < 2) return;
        Object.assign(처음, 재기(터치), 확대_지금.current);
      },
      onPanResponderMove: (event) => {
        const 터치 = event.nativeEvent.touches;
        if (터치.length < 2) return;
        const 지금 = 재기(터치);
        if (!처음.거리) {
          Object.assign(처음, 지금, 확대_지금.current);
          return;
        }
        const 배 = Math.min(4, Math.max(1, 처음.배 * (지금.거리 / 처음.거리)));
        const x = 배 === 1 ? 0 : 처음.x + (지금.가운데x - 처음.가운데x);
        const y = 배 === 1 ? 0 : 처음.y + (지금.가운데y - 처음.가운데y);
        // 상태는 그대로 두고 덧씌운 값만 움직인다.
        핀치.배.setValue(배 / 처음.배);
        핀치.x.setValue(x - 처음.x);
        핀치.y.setValue(y - 처음.y);
        Object.assign(끝, { 배, x, y, 움직임: true });
      },
      onPanResponderRelease: 놓기,
      onPanResponderTerminate: 놓기,
      onPanResponderTerminationRequest: () => false,
    });
  }, [확대하기, 핀치]);

  const onMove = useCallback(
    (id: string, x: number, y: number) => onDecor((지금) => moveDecor(지금, id, x, y)),
    [onDecor],
  );
  const onResize = useCallback(
    (id: string, size: number, angle: number) => onDecor((지금) => setDecorSize(지금, id, size, angle)),
    [onDecor],
  );
  const onRemove = useCallback(
    (id: string) => {
      onDecor((지금) => removeDecor(지금, id));
      고르기("");
    },
    [onDecor],
  );
  /** 카드 위 사진에서 하는 일을 처음 한 번 알리는 말풍선. */
  const [사진_안내_봄, 사진_안내_닫기] = useOnceTip("daymo.card-photo-tip.v3");
  const [스티커_갈래, 스티커_갈래_고르기] = useState(STICKER_CATEGORIES[0].name);
  /**
   * 사진 칸마다의 가로:세로(사진 id → 비율). 카드가 그려질 때 재 둔다. 보일 부분을 맞추는
   * 틀이 그 칸 모양이어야 해서다.
   */
  const 칸_비율 = useRef(new Map<string, number>());
  const 칸_비율_적기 = useCallback((photoId: string, ratio: number) => {
    칸_비율.current.set(photoId, ratio);
  }, []);
  /**
   * 보일 부분 맞추기 차례. 「프레임」의 비율 칩(네컷은 단추)을 누르면 카드의 사진을 차례로
   * 맞춘다(1/3 → 2/3 → 3/3). 카드에서 칸을 눌러 열던 길은 잘못 눌려서 없앴다(2026-09-22).
   */
  const [맞추기_차례, 맞추기_차례_두기] = useState<{ ids: string[]; ratios: number[]; at: number } | null>(null);
  const 맞추는 = 맞추기_차례
    ? { photoId: 맞추기_차례.ids[맞추기_차례.at], ratio: 맞추기_차례.ratios[맞추기_차례.at] ?? 1 }
    : null;
  /** 비율을 바꾸면 칸 모양이 달라지니, 다시 그려져 칸을 잰 뒤에 연다. */
  const 보일_부분_맞추기 = (비율?: KeepsakeRatio) => {
    if (비율 && 비율 !== card.ratio) tune({ ratio: 비율 });
    if (card.photoIds.length === 0) return;
    const ids = [...card.photoIds];
    // 칸 비율은 다시 그려진 뒤에 읽는다(타이머 안이라 렌더와 상관없다).
    setTimeout(() => {
      맞추기_차례_두기({ ids, ratios: ids.map((id) => 칸_비율.current.get(id) ?? 1), at: 0 });
    }, 비율 && 비율 !== card.ratio ? 160 : 0);
  };
  const onDuplicate = useCallback(
    (id: string) => {
      // 복제한 것을 곧바로 고르게 한다. 새 목록에서 고르면 React 가 두 번 불러도 같다.
      const 다음 = duplicateDecor(card.decor, id);
      onDecor(() => 다음);
      if (다음.length > card.decor.length) 고르기(다음[다음.length - 1].id);
    },
    [card.decor, onDecor],
  );
  /** 글자를 고치는 창에 띄운 글자 스티커. */
  const [글자_고치는, 글자_고치기] = useState("");
  /**
   * 글자 창을 연 순간의 그 글자. 「취소」가 이것으로 되돌린다. 새로 붙인 글자면 null 이라
   * 취소하면 뗀다.
   */
  const 글자_처음 = useRef<CardDecor | null>(null);
  const onEdit = useCallback((id: string) => {
    글자_처음.current = card.decor.find((하나) => 하나.id === id) ?? null;
    고르기(id);
    글자_고치기(id);
  }, [card.decor]);
  const edit = useMemo(
    () => (readOnly ? undefined : { selectedId: 고른_것, scale, onSelect: 고르기, onMove, onResize, onRemove, onEdit, onDuplicate }),
    [readOnly, 고른_것, scale, onMove, onResize, onRemove, onEdit, onDuplicate],
  );
  const 고른_줄 = card.decor.find((하나) => 하나.id === 고른_것);
  const 네컷 = isCutStyle(card.style);
  const 꽉_참 = keepsakePhotoFullReason(card.photoIds);
  const 스티커_꽉_참 = card.decor.length >= DECOR_MAX;

  const 붙이기 = (kind: KeepsakeSticker | "글자") => {
    if (card.decor.length >= DECOR_MAX) return;
    // 새 목록을 먼저 만들고 그것을 넘긴다. 상태를 고치는 함수 안에서 고르면
    // React 가 그 함수를 두 번 부를 때 엉뚱한 것이 골라진다.
    // 글자는 비운 채 붙이고 곧바로 고치는 창을 연다. 예전에는 「텍스트 입력」이 실제 글자로
    // 들어가, 도구 칸 맨 아래 입력칸을 찾아 그것부터 지워야 했다.
    const 다음 = addDecor(card.decor, kind, "");
    onDecor(() => 다음);
    const 새것 = 다음[다음.length - 1].id;
    고르기(새것);
    if (kind === "글자") {
      글자_처음.current = null;
      글자_고치기(새것);
    }
  };
  const 고치는_글자 = 글자_고치는 ? card.decor.find((하나) => 하나.id === 글자_고치는) : undefined;
  /** 「취소」. 창을 열기 전 모습으로 되돌린다. 새로 붙인 글자였으면 뗀다. */
  const 글자_취소 = () => {
    const 처음 = 글자_처음.current;
    const id = 글자_고치는;
    onDecor((지금) => (처음 ? 지금.map((하나) => (하나.id === id ? 처음 : 하나)) : removeDecor(지금, id)));
    if (!처음) 고르기("");
    글자_고치기("");
  };
  /** 글자 고치는 창을 닫는다. 비워 두었으면 그 글자는 뗀다. */
  const 글자_마치기 = () => {
    const 고친_것 = 고치는_글자;
    if (고친_것 && !고친_것.text.trim()) {
      onDecor((지금) => removeDecor(지금, 고친_것.id));
      고르기("");
    }
    글자_고치기("");
  };
  // 카드 그림은 memo 라서, 넘기는 손잡이를 붙들어 두면 탭·시트만 바뀔 때 다시 그리지 않는다.
  const onPickSlot = useCallback(() => setTab("사진"), []);
  const onSwapPhotos = useCallback(
    (from: number, to: number) => tune({ photoIds: swapKeepsakePhotos(card.photoIds, from, to) }),
    [card.photoIds, tune],
  );

  return (
    <>
      <View
        style={[styles.stage, !exporting && styles.stageEdit]}
        onLayout={onStageLayout}
        accessibilityLabel="꾸미는 카드"
        {...(exporting ? {} : 두_손가락.panHandlers)}
      >
        {칸.width > 0 && (
          <Animated.View
            style={[
              !exporting && styles.cardShadow,
              !exporting && {
                transform: [
                  { translateX: 확대.x },
                  { translateY: 확대.y },
                  { translateX: 핀치.x },
                  { translateY: 핀치.y },
                  { scale: 핀치.배 },
                ],
              },
            ]}
          >
          <ScaledCard scale={scale} width={size.width * 찍기.unit} height={size.height * 찍기.unit} shotRef={찍기.native ? shotRef : undefined}>
            <KeepsakeCardView
              shotRef={찍기.native ? undefined : shotRef}
              unit={찍기.unit}
              card={card}
              photos={drawPhotos}
              text={text}
              stats={stats}
              stamp={stamp}
              big={exporting}
              // 찍는 동안에는 고른 테두리와 손잡이가 그림에 들어가지 않게 편집을 끈다.
              edit={exporting ? undefined : edit}
              // 내보내는 동안에는 끈다. 빈 칸이 그림으로 찍히면 고장 난 카드가 된다.
              showEmptySlots={!exporting && !readOnly}
              onPickSlot={onPickSlot}
              // 사진을 꾹 눌러 다른 사진 위에 놓으면 자리를 바꾼다. 남의 카드와 찍는 중에는 끈다.
              onSwapPhotos={readOnly || exporting ? undefined : onSwapPhotos}
              onCellRatio={칸_비율_적기}
              onPhotoReady={onPhotoReady}
            />
          </ScaledCard>
          </Animated.View>
        )}
        {/* 확대 중에는 원래 크기로 돌아가는 단추를 띄운다. */}
        {!exporting && 확대.배 > 1.01 && (
          <Pressable
            onPress={() => 확대하기({ 배: 1, x: 0, y: 0 })}
            accessibilityRole="button"
            accessibilityLabel="원래 크기로 보기"
            style={({ pressed }) => [styles.zoomReset, pressed && styles.pressed]}
          >
            <Text style={styles.zoomResetText}>{`${Math.round(확대.배 * 100)}% · 원래대로`}</Text>
          </Pressable>
        )}
        {!readOnly && !exporting && !사진_안내_봄 && card.photoIds.length > 0 && (
          <View style={styles.tip} accessibilityLiveRegion="polite">
            <Text style={styles.tipText}>{"사진을 꾹 누르면 자리를 바꿔요\n보일 부분은 「프레임」의 비율에서 맞춰요"}</Text>
            <Pressable onPress={사진_안내_닫기} accessibilityRole="button" accessibilityLabel="안내 닫기" hitSlop={10} style={styles.tipClose}>
              <Glyph name="close" size={12} color="#FFFFFF" weight={2.4} />
            </Pressable>
          </View>
        )}
      </View>

      {readOnly ? (
        <View style={styles.readOnly}>
          <Text style={styles.readOnlyText}>{readOnlyHint || "만든 사람과 관리자만 이 카드를 수정할 수 있어요"}</Text>
        </View>
      ) : (
        <>
          {/*
            누른 도구만 아래 막대 위로 올라온다. 카드는 남은 자리에 맞춰 줄었다 커진다
            (`fitScaleOf`). 손잡이를 끌어 올리면 크게, 내리면 작게, 한 번 더 내리면 닫힌다.
          */}
          {tab && (
            <View style={[styles.sheetSlot, { height: 시트_높이 }]}>
            <Animated.View style={[styles.sheet, styles.sheetFloat, { height: 보이는_높이 }]}>
              <View {...손잡이.panHandlers} style={styles.sheetGrip} accessibilityRole="adjustable" accessibilityLabel={`${tab} 도구 칸 크기`}>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHead}>
                  <Text style={styles.sheetTitle}>{tab}</Text>
                  <Pressable onPress={() => setTab(null)} accessibilityRole="button" accessibilityLabel="도구 닫기" hitSlop={10}>
                    <Glyph name="chevronDown" size={18} color={INK_FAINT} weight={2.2} />
                  </Pressable>
                </View>
              </View>
              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.panelPad} keyboardShouldPersistTaps="handled">
              {tab === "프레임" && (
                <>
                  <PanelLabel text="프레임" />
                  <ChipRow
                    options={KEEPSAKE_STYLES}
                    chosen={(option) => option === card.style}
                    accent={accent}
                    accentInk={accentInk}
                    onPress={(option) => tune({ style: option as KeepsakeStyle })}
                    labelOf={(option) => keepsakeStyleLabel(option as KeepsakeStyle)}
                  />
                  {Boolean(suggest) && (
                    <Pressable onPress={() => tune({ style: suggest as KeepsakeStyle })} style={styles.suggest}>
                      <Text style={styles.suggestText}>
                        사진 {card.photoIds.length}장에는 「{suggest}」 프레임이 어울려요 · 눌러서 바꾸기
                      </Text>
                    </Pressable>
                  )}
                  {/* 네컷 프레임은 스트립 모양이 크기를 정한다. 비율을 고를 것이 없다. */}
                  {!네컷 && (
                    <>
                      <PanelLabel text="비율" />
                      <ChipRow
                        options={KEEPSAKE_RATIOS}
                        chosen={(option) => option === card.ratio}
                        accent={accent}
                        accentInk={accentInk}
                        // 비율을 고르면 칸 모양이 바뀌어 잘리는 곳이 달라진다. 곧바로 사진마다 보일
                        // 부분을 맞추게 한다. 지금 비율을 다시 눌러도 맞추기로 들어간다.
                        onPress={(option) => 보일_부분_맞추기(option as KeepsakeRatio)}
                        labelOf={(option) => keepsakeRatioLabel(option as KeepsakeRatio)}
                      />
                      {card.photoIds.length > 0 && (
                        <Text style={styles.panelHint}>비율을 누르면 사진마다 카드에 보일 부분을 맞춰요</Text>
                      )}
                    </>
                  )}
                  {/* 네컷 계열은 틀이 크기를 정해 비율 칩이 없다. 맞추는 길을 단추로 둔다. */}
                  {네컷 && card.photoIds.length > 0 && (
                    <Pressable
                      onPress={() => 보일_부분_맞추기()}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.focusRow, pressed && styles.pressed]}
                    >
                      <Glyph name="cardFrame" size={16} color={INK_SOFT} weight={2} />
                      <Text style={styles.focusRowText}>사진 보일 부분 맞추기</Text>
                    </Pressable>
                  )}
                  {/* 프레임 색·날짜 도장·사진 설명은 네컷 프레임만 그린다
                      (`KeepsakeCardView`). 다른 프레임에서 켜면 아무 일도 일어나지
                      않아 고장으로 읽힌다. */}
                  {네컷 && (
                    <>
                      <PanelLabel text="프레임 색" />
                      <ChipRow
                        options={KEEPSAKE_FRAME_COLORS}
                        chosen={(option) => option === card.frameColor}
                        accent={accent}
                        accentInk={accentInk}
                        onPress={(option) => tune({ frameColor: option as KeepsakeFrameColor })}
                        labelOf={(option) => keepsakeFrameColorLabel(option as KeepsakeFrameColor)}
                      />
                      <Toggle
                        label="날짜 표시"
                        on={card.dateStamp}
                        accent={accent}
                        onPress={() => tune({ dateStamp: !card.dateStamp })}
                      />
                      <Toggle
                        label="사진 설명 표시"
                        on={card.photoCaptions}
                        accent={accent}
                        onPress={() => tune({ photoCaptions: !card.photoCaptions })}
                      />
                    </>
                  )}
                </>
              )}

              {tab === "사진" && (
                <>
                  {/* 몇 장까지 넣을 수 있는지를 늘 적어 둔다. 예전에는 다섯 번째를
                      눌러 봐야 알았고, 그때 가장 먼저 고른 것이 말없이 빠졌다. */}
                  <PanelLabel text={`카드에 넣을 사진 · ${card.photoIds.length} / ${KEEPSAKE_MAX_PHOTOS}`} />
                  {allPhotos.length === 0 ? (
                    <Text style={styles.panelHint}>카드에 넣을 수 있는 사진이 아직 없어요</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
                      {allPhotos.map((photo) => {
                        const 차례 = card.photoIds.indexOf(photo.id);
                        const uri = thumbs[photo.id] ?? photo.uri;
                        // 꽉 찼으면 안 고른 사진은 흐리게 두고 누를 수 없게 한다.
                        const 막힘 = 차례 < 0 && Boolean(꽉_참);
                        return (
                          <Pressable
                            key={photo.id}
                            onPress={() => tune({ photoIds: toggleKeepsakePhoto(card.photoIds, photo.id) })}
                            disabled={막힘}
                            accessibilityRole="button"
                            accessibilityState={{ selected: 차례 >= 0, disabled: 막힘 }}
                            accessibilityLabel={차례 >= 0
                              ? `${photo.caption || "사진"}${josa(photo.caption || "사진", "을", "를")} 카드에서 빼기`
                              : `${photo.caption || "사진"}${josa(photo.caption || "사진", "을", "를")} 카드에 넣기`}
                            style={[
                              pickStyles.pick,
                              { backgroundColor: photo.color },
                              차례 >= 0 && { borderColor: accent },
                              막힘 && styles.pickBlocked,
                            ]}
                          >
                            {Boolean(uri) && <Image source={{ uri }} resizeMode="cover" style={styles.fill} />}
                            {차례 >= 0 && (
                              <View style={pickStyles.pickOrder}>
                                <Text style={pickStyles.pickOrderText}>{차례 + 1}</Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                  {/* 고른 차례가 곧 카드에 놓이는 차례다. 바꾸려고 전부 뺐다가 다시 고르게 하지 않고
                      옆으로 끌어 옮긴다(갤러리·인스타그램과 같다). 예전에는 눌러 고른 뒤 아래
                      「앞으로·뒤로」로 옮겼는데, 단추가 화면 밑에 생겨 눌러도 테두리만 바뀌는 것처럼
                      보였다. 한 장이어도 둔다. 몇 장이 어디에 놓이는지가 늘 같은 자리에 보여야 한다. */}
                  {card.photoIds.length > 0 && (
                    <>
                      <PanelLabel text="카드에 놓이는 차례" />
                      <CardOrderStrip
                        ids={card.photoIds}
                        accent={accent}
                        onPlace={(from, to) => tune({ photoIds: placeKeepsakePhoto(card.photoIds, from, to) })}
                        onStep={(id, 앞으로) => tune({ photoIds: moveKeepsakePhoto(card.photoIds, id, 앞으로) })}
                        renderPhoto={(id) => {
                          const photo = allPhotos.find((하나) => 하나.id === id);
                          const uri = thumbs[id] ?? photo?.uri;
                          return (
                            <View style={[styles.fill, { backgroundColor: photo?.color ?? CHIP }]}>
                              {Boolean(uri) && <Image source={{ uri }} resizeMode="cover" style={styles.fill} />}
                            </View>
                          );
                        }}
                      />
                    </>
                  )}
                  {/* 카드 위 사진에서 하는 일은 화면에 드러나지 않아, 눌러 보기 전에는 몰랐다.
                      처음 한 번은 카드 위 말풍선으로, 그 뒤로는 여기서 늘 찾을 수 있게 둔다. */}
                  {card.photoIds.length > 0 && (
                    <Text style={styles.panelHint}>카드의 사진을 꾹 누르면 자리를 바꿔요 · 보일 부분은 「프레임」의 비율에서 맞춰요</Text>
                  )}
                  <Text style={styles.panelHint}>
                    {꽉_참
                      || notice
                      || (card.photoIds.length > 1
                        ? "차례 줄에서도 사진을 꾹 눌러 옆으로 끌면 차례가 바뀌어요"
                        : "누른 차례가 카드에 놓이는 차례예요")}
                  </Text>
                </>
              )}

              {tab === "글자" && (
                <>
                  {/* 카드 위에 얹는 글자. 누르면 곧바로 적는 화면이 뜬다(인스타그램 스토리와 같다). */}
                  <Pressable
                    onPress={() => 붙이기("글자")}
                    disabled={스티커_꽉_참}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: 스티커_꽉_참 }}
                    style={({ pressed }) => [styles.addText, { backgroundColor: accent }, 스티커_꽉_참 && styles.pickBlocked, pressed && styles.pressed]}
                  >
                    <Glyph name="textT" size={18} color={accentInk} weight={2.2} />
                    <Text style={[styles.addTextLabel, { color: accentInk }]}>카드에 글자 붙이기</Text>
                  </Pressable>
                  {/* 켜고 끄는 줄을 제목보다 위에 둔다. 아래에 있으면 제목을 다 적고
                      저장할 때까지 지나치고, 「적었는데 왜 카드에 없지」가 된다. */}
                  <PanelLabel text="카드에 넣을 것" />
                  <ChipRow
                    options={KEEPSAKE_PARTS}
                    chosen={(option) => card.parts.includes(option as KeepsakePart)}
                    accent={accent}
                    accentInk={accentInk}
                    onPress={(option) => tune({ parts: 넣고_빼기(card.parts, option as KeepsakePart) })}
                    labelOf={(option) => KEEPSAKE_PART_LABELS[option as KeepsakePart]}
                  />
                  {/* 「통계」를 켜면 고를 것이 하나 더 생긴다. 그 줄은 누른 칩 바로
                      아래에 편다. 맨 밑에 두면 무엇을 눌러서 생긴 줄인지 알 수 없고,
                      도구 칸을 끝까지 밀어야 보인다. */}
                  {card.parts.includes("통계") && (
                    <>
                      <PanelLabel text="어떤 숫자를 넣을까요" />
                      <ChipRow
                        options={KEEPSAKE_STAT_KINDS}
                        chosen={(option) => card.stats.includes(option as KeepsakeStatKind)}
                        accent={accent}
                        accentInk={accentInk}
                        onPress={(option) => tune({ stats: 넣고_빼기(card.stats, option as KeepsakeStatKind) })}
                        labelOf={(option) => KEEPSAKE_STAT_LABELS[option as KeepsakeStatKind]}
                      />
                    </>
                  )}
                  <PanelLabel text="제목" />
                  <TextInput
                    value={card.title}
                    onChangeText={(값) => tune({ title: 값 })}
                    placeholder="예: 우리의 서울 주말"
                    placeholderTextColor={INK_FAINT}
                    maxLength={60}
                    accessibilityLabel="카드 제목"
                    style={styles.field}
                  />
                  {/* 적어 두었는데 그 줄을 꺼 두면 카드에 안 나온다. 왜 안 보이는지
                      알 길이 없어서, 껐을 때만 알린다. 흐린 설명 색이 아니라 눈에
                      드는 색을 쓴다. 이건 안내가 아니라 「지금 안 나오고 있다」는 말이다. */}
                  {!card.parts.includes("이름") && (
                    <Text style={styles.panelWarn}>위 「카드에 넣을 것」에서 제목을 켜야 카드에 보여요</Text>
                  )}
                  <PanelLabel text="한 줄 설명" />
                  <TextInput
                    value={card.caption}
                    onChangeText={(값) => tune({ caption: 값 })}
                    placeholder="사진과 함께 남길 말을 적어 보세요"
                    placeholderTextColor={INK_FAINT}
                    maxLength={200}
                    accessibilityLabel="카드에 적을 한 줄 설명"
                    style={styles.field}
                  />
                  {!card.parts.includes("문구") && (
                    <Text style={styles.panelWarn}>위 「카드에 넣을 것」에서 한 줄 설명을 켜야 카드에 보여요</Text>
                  )}
                </>
              )}

              {tab === "바탕" && (
                <>
                  <PanelLabel text="종이 무늬" />
                  <ChipRow
                    options={KEEPSAKE_PAPER_PATTERNS}
                    chosen={(option) => option === card.paperPattern}
                    accent={accent}
                    accentInk={accentInk}
                    onPress={(option) => tune({ paperPattern: option as KeepsakePaperPattern })}
                  />
                  {/* 종이 색은 종이가 있는 틀만 바꾼다. 네컷 계열은 「프레임」의 프레임 색이 바탕이다. */}
                  {card.style !== "없음" && !네컷 && card.paperPattern !== "크라프트" && (
                    <>
                      <PanelLabel text="종이 색" />
                      <View style={styles.swatchRow}>
                        {KEEPSAKE_PAPER_COLORS.map((색) => (
                          <Pressable
                            key={색}
                            onPress={() => tune({ paperColor: 색 })}
                            accessibilityRole="button"
                            accessibilityLabel={`종이 색 ${색}`}
                            accessibilityState={{ selected: card.paperColor === 색 }}
                            style={({ pressed }) => [
                              styles.swatch,
                              { backgroundColor: PAPER_SWATCH[색] },
                              card.paperColor === 색 && { borderColor: accent, borderWidth: 3 },
                              pressed && styles.pressed,
                            ]}
                          />
                        ))}
                      </View>
                    </>
                  )}
                  <Text style={styles.panelHint}>
                    {card.style === "없음"
                      ? "기본 프레임은 사진이 카드 전체라 종이 색이 없어요 · 무늬는 다른 프레임에서 보여요"
                      : 네컷
                        ? "네컷 프레임의 바탕 색은 「프레임」에서 골라요"
                        : card.paperPattern === "크라프트"
                          ? "크라프트는 갈색 재생지라 종이 색 대신 쓰여요"
                          : "무늬와 색은 필름·엽서·스크랩북 프레임의 종이에 들어가요"}
                  </Text>
                </>
              )}

              {tab === "스티커" && (
                <>
                  {/* 서른 개까지다. 예전에는 꽉 찬 뒤 눌러도 아무 일이 없어서
                      고장인지 한도인지 알 수 없었다. */}
                  <PanelLabel text={`스티커 · ${card.decor.length}/${DECOR_MAX}`} />
                  {/* 갈래로 나눈다. 마흔 개가 넘어 한 판에 늘어놓으면 찾을 수가 없다. */}
                  <ChipRow
                    options={STICKER_CATEGORY_NAMES}
                    chosen={(option) => option === 스티커_갈래}
                    accent={accent}
                    accentInk={accentInk}
                    onPress={스티커_갈래_고르기}
                  />
                  <View style={styles.stickerGrid}>
                    {(STICKER_CATEGORIES.find((갈래) => 갈래.name === 스티커_갈래)?.stickers ?? []).map((sticker) => (
                      <Pressable
                        key={sticker}
                        onPress={() => 붙이기(sticker)}
                        disabled={스티커_꽉_참}
                        accessibilityRole="button"
                        accessibilityLabel={`${sticker} 스티커 붙이기`}
                        accessibilityState={{ disabled: 스티커_꽉_참 }}
                        style={({ pressed }) => [
                          styles.stickerCell,
                          넓은_스티커(sticker) && styles.stickerCellWide,
                          스티커_꽉_참 && styles.pickBlocked,
                          pressed && styles.pressed,
                        ]}
                      >
                        <StickerArt name={sticker} size={넓은_스티커(sticker) ? 76 : 40} shadow={false} />
                      </Pressable>
                    ))}
                  </View>
                  {/* 크기·각도·떼기는 전부 스티커 위 손잡이로 옮겼다(`KeepsakeCardView`).
                      버튼 줄이 화면 맨 아래에 있으면 눈이 카드와 줄 사이를 오가야 하고,
                      각도를 15도씩 눌러 맞추는 것은 「기울인다」는 일과 손놀림이 달랐다.
                      여기 남는 것은 무엇을 하면 되는지 알려 주는 한 줄과 글자 고치기뿐이다. */}
                  <PanelLabel
                    text={스티커_꽉_참
                      ? `스티커는 ${DECOR_MAX}개까지 붙일 수 있어요 · 삭제하려면 스티커를 고르고 ✕를 누르면 돼요`
                      : 고른_줄
                        ? "끌어서 옮기고, ⤢로 크기와 회전을 바꿔요 · ✕로 삭제해요"
                        : card.decor.length
                          ? "카드에서 스티커를 눌러 고르거나 끌어서 옮겨요"
                          : "위에서 눌러 카드에 붙이고, 붙인 것은 끌어서 옮겨요"}
                  />
                  {고른_줄?.kind === "글자" && (
                    <Text style={styles.panelHint}>글자를 누르고 ✎로 고쳐요</Text>
                  )}
                </>
              )}
              </ScrollView>
            </Animated.View>
            </View>
          )}
          <View style={styles.toolBar}>
            {CARD_TOOL_TABS.map((하나) => {
              const on = tab === 하나;
              return (
                <Pressable
                  key={하나}
                  onPress={() => setTab(on ? null : 하나)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${하나} 편집`}
                  style={({ pressed }) => [styles.toolBarItem, pressed && styles.pressed]}
                >
                  <Glyph name={TOOL_GLYPH[하나]} size={22} color={on ? ACCENT : INK_SOFT} weight={1.9} />
                  <Text style={[styles.toolBarText, on && styles.toolBarTextOn]}>{하나}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      {/* 칸에 보여 줄 부분 맞추기. 가로 카드처럼 칸이 넓으면 세로 사진의 위아래가 잘려서,
          어디를 남길지 사람이 정한다. 칸마다 비율이 달라 그 칸의 비율로 틀을 그린다. */}
      <Modal visible={Boolean(맞추는)} transparent animationType="fade" onRequestClose={() => 맞추기_차례_두기(null)}>
        {맞추는 && (
          <CoverFocusScreen
            uri={drawPhotos.find((사진) => 사진.id === 맞추는.photoId)?.uri}
            initial={card.photoFocus[맞추는.photoId]}
            ratio={맞추는.ratio}
            key={맞추는.photoId}
            title={맞추기_차례 && 맞추기_차례.ids.length > 1 ? `카드에 보일 부분 · ${맞추기_차례.at + 1}/${맞추기_차례.ids.length}` : "카드에 보일 부분"}
            hint="밝은 부분이 카드 칸에 들어가요"
            onCancel={() => 맞추기_차례_두기(null)}
            onDone={(자리) => {
              const { [맞추는.photoId]: _옛_자리, ...나머지 } = card.photoFocus;
              tune({ photoFocus: sameFocus(자리, COVER_FOCUS_DEFAULT) ? 나머지 : { ...나머지, [맞추는.photoId]: 자리 } });
              // 다음 사진으로. 마지막이면 닫는다.
              맞추기_차례_두기((지금) => (지금 && 지금.at + 1 < 지금.ids.length ? { ...지금, at: 지금.at + 1 } : null));
            }}
          />
        )}
      </Modal>
      {/* 글자 전용 창. 붙인 글자의 ✎ 나 「카드에 글자 붙이기」로 연다. */}
      <CardTextEditor
        visible={Boolean(글자_고치는)}
        decor={고치는_글자}
        onText={(값) => onDecor((지금) => setDecorText(지금, 글자_고치는, 값))}
        onStyle={(change) => onDecor((지금) => setDecorStyle(지금, 글자_고치는, change))}
        onCancel={글자_취소}
        onDone={글자_마치기}
      />
    </>
  );
}

/** 종이 색 견본. 카드가 쓰는 색(`KeepsakeCardView` 의 PAPER_LOOK)과 같다. 「기본」은 엽서 종이다. */
const PAPER_SWATCH: Record<KeepsakePaperColor, string> = {
  기본: "#FFFFFF", 크림: "#F6E7D2", 민트: "#E6EEE6", 하늘: "#E5EAF5", 분홍: "#F5E3E6", 먹색: "#2B2A30",
};

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  pressed: { opacity: 0.65 },
  // 남는 칸을 다 쓴다. 이 칸의 크기로 카드를 얼마나 줄일지 정한다.
  stage: { flex: 1, alignItems: "center", justifyContent: "center", padding: STAGE_PAD },
  // 꾸미는 자리. 카드 뒤만 한 단계 밝혀 검은 카드의 가장자리도 보이게 한다(2026-09-22 시안 ①).
  stageEdit: { backgroundColor: "#35343B", overflow: "hidden" },
  cardShadow: {
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  focusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: CHIP,
    alignSelf: "flex-start",
  },
  focusRowText: { fontSize: 13.5, color: INK, fontFamily: typo.label.family },
  zoomReset: {
    position: "absolute",
    right: 12,
    bottom: 12,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(20,19,26,0.85)",
    justifyContent: "center",
  },
  zoomResetText: { fontSize: 12.5, color: "#FFFFFF", fontFamily: typo.label.family },
  // 처음 한 번 뜨는 안내. 카드 위쪽 가운데에 얹고, 카드를 가리는 폭은 짧게 둔다.
  tip: {
    position: "absolute",
    top: STAGE_PAD,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 14,
    backgroundColor: "rgba(20,19,26,0.92)",
  },
  tipText: { color: "#FFFFFF", fontSize: 13, lineHeight: 19, fontFamily: typo.label.family },
  tipClose: { padding: 4 },
  thumbStage: { flex: 1, alignItems: "center", justifyContent: "center" },
  panelPad: { paddingHorizontal: 14, paddingBottom: 16 },
  panelLabel: { fontSize: 11.5, color: INK_FAINT, marginBottom: 8, marginTop: 13, fontFamily: typo.label.family },
  panelHint: { fontSize: 11.5, color: INK_FAINT, marginTop: 9, lineHeight: 16, fontFamily: typo.caption.family },
  // 「지금 카드에 안 나오고 있다」는 말. 흐린 설명과 같은 색이면 설명으로 읽혀 지나친다.
  panelWarn: { fontSize: 11.5, color: "#F0C27A", marginTop: 8, lineHeight: 16, fontFamily: typo.label.family },
  suggest: { paddingVertical: 8 },
  suggestText: { fontSize: 11.5, color: ACCENT, fontFamily: typo.label.family },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 13,
    minHeight: 높이.버튼,
  },
  toggleLabel: { fontSize: 12.5, color: INK_SOFT, fontFamily: typo.label.family },
  toggleTrack: { width: 38, height: 22, borderRadius: 11, backgroundColor: CHIP, justifyContent: "center" },
  toggleKnob: { width: 16, height: 16, borderRadius: 8, marginLeft: 3, backgroundColor: INK_FAINT },
  toggleKnobOn: { marginLeft: 19, backgroundColor: "#FFFFFF" },
  field: {
    height: 높이.입력,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 여백.가로좁게,
    backgroundColor: CHIP,
    color: INK,
    fontSize: 14,
    fontFamily: typo.body.family,
  },
  pickRow: { gap: 8, paddingRight: 6, paddingVertical: 2 },
  // 꽉 차서 더 못 고르는 사진. 눌리지 않는다는 것이 눈에 보여야 한다.
  pickBlocked: { opacity: 0.35 },
  // 시트의 자리. 끄는 동안에는 이 자리를 두고 안의 시트만 위로 겹쳐 올라간다.
  sheetSlot: { zIndex: 5 },
  sheetFloat: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: PANEL,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  sheetGrip: { paddingTop: 8, paddingBottom: 4 },
  sheetHandle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#4A4953" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 6 },
  sheetTitle: { fontSize: 15, color: INK, fontFamily: typo.title.family },
  sheetScroll: { flex: 1 },
  toolBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHIP_EDGE,
  },
  toolBarItem: { alignItems: "center", gap: 3, minWidth: 56, minHeight: 44, justifyContent: "center" },
  toolBarText: { fontSize: 11, color: INK_SOFT, fontFamily: typo.label.family },
  toolBarTextOn: { color: ACCENT, fontFamily: typo.title.family },
  addText: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 높이.버튼,
    borderRadius: 모서리.버튼,
    marginTop: 12,
  },
  addTextLabel: { fontSize: 14, fontFamily: typo.title.family },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  stickerCell: { width: 60, height: 60, borderRadius: 12, backgroundColor: CHIP, alignItems: "center", justifyContent: "center" },
  // 글씨 띠·테이프는 옆으로 길어 두 칸을 쓴다.
  stickerCellWide: { width: 128 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  // 남이 만든 카드. 도구 자리에 왜 못 고치는지만 적는다.
  readOnly: { minHeight: 64, justifyContent: "center", paddingHorizontal: 20, paddingBottom: 12 },
  readOnlyText: { fontSize: 12, color: INK_FAINT, textAlign: "center", fontFamily: typo.caption.family },
});
