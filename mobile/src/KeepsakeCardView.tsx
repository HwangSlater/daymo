/**
 * 기념 카드 그림 그 자체.
 *
 * 미리보기·내보내기·꾸미기 화면이 이 하나를 같이 쓴다. 보이는 그대로 저장돼야
 * 해서다. 꾸미기 화면은 `edit` 을 넘겨서 스티커를 끌 수 있게만 바꾼다. 자리를
 * 재는 셈은 `cardDecor.ts` 한 곳에 있다.
 *
 * 무엇을 어떻게 그릴지 정하는 계산은 전부 `tripCard.ts`·`cardDecor.ts` 에 있다.
 * 여기서는 그것이 돌려준 값을 그린다.
 */

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { Animated, Image, PanResponder, Pressable, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "./AppText";
import { Glyph } from "./Glyph";
import {
  clampDecorSpot,
  decorBoxOf,
  decorInkOf,
  isDarkColor,
  isShapeBack,
  DECOR_SHAPE_STICKER,
  type CardDecor,
  type DecorShapeBack,
} from "./cardDecor";
import { typo } from "./theme/typography";
import { StickerArt } from "./stickers/StickerArt";
import { STICKER_ART } from "./stickers/art";
import { fitStickerText } from "./stickers/textFit";
import { scaleStyles } from "./scaleStyle";
import { COVER_FOCUS_DEFAULT, coverLayout, sameFocus, type Box, type CoverFocus } from "./coverCrop";
import {
  isBareStyle,
  isCutStyle,
  keepsakeFrameOf,
  keepsakeRowSlots,
  keepsakeSizeOf,
  keepsakeSlotCaption,
  type KeepsakeCard,
  type KeepsakeFrameColor,
  type KeepsakePaperColor,
  type KeepsakePaperPattern,
} from "./tripCard";
import Svg, { Circle, Defs, Line, LinearGradient, Pattern, Rect, Stop } from "react-native-svg";
import { DECOR_FONT_FAMILY, useDecorFonts } from "./decorFonts";

/** 카드에 올릴 수 있는 사진 한 장. 기록 탭의 사진에서 필요한 것만 가려 받는다. */
export type CardPhoto = {
  id: string;
  color: string;
  caption: string;
  uri?: string;
  /** 서버에 원본이 아직 남아 있는지(올린 지 30일 안쪽). 내보낼 때만 본다. */
  hasOriginal?: boolean;
};

type KeepsakeLook = { paper: string; ink: string; sub: string; accent: string; frame: string };

/** 카드 스타일마다의 색. 사진 위에 글씨가 얹힐 수 있어 어느 스타일이든 대비가 세야 한다. */
const KEEPSAKE_LOOK: Record<"없음" | "필름" | "엽서" | "스크랩북", KeepsakeLook> = {
  // 종이가 없다. 글은 사진 위에 얹히므로 밝은 글자와 옅은 그늘만 쓴다. `paper` 는
  // 사진이 아직 안 왔을 때만 잠깐 보이는 바탕이다.
  없음: { paper: "#17161C", ink: "#F8F5F0", sub: "#E7DFD2", accent: "#F0C27A", frame: "#2A2933" },
  필름: { paper: "#171615", ink: "#F6F1E7", sub: "#B5AB9E", accent: "#E7B4A6", frame: "#33302C" },
  엽서: { paper: "#FFFFFF", ink: "#2C2A28", sub: "#7C7266", accent: "#3F4C8F", frame: "#E7DFD2" },
  스크랩북: { paper: "#F1E9DA", ink: "#33302B", sub: "#7E756A", accent: "#C0693F", frame: "#E0D1B8" },
};

/**
 * 네컷 틀의 색. 테두리와 사진 사이 좁은 간격, 아래 여백이 모두 `paper` 색이다.
 *
 * 앞의 셋은 사진관에서 뽑는 색이고, 뒤의 셋은 앱에서 쓰는 색을 가져왔다.
 */
const KEEPSAKE_FRAME_LOOK: Record<KeepsakeFrameColor, KeepsakeLook> = {
  검정: { paper: "#111110", ink: "#F7F3EA", sub: "#A79D90", accent: "#E7B4A6", frame: "#2A2724" },
  흰색: { paper: "#FFFFFF", ink: "#23211F", sub: "#8C8378", accent: "#3F4C8F", frame: "#EDE8E0" },
  크림: { paper: "#F3EADA", ink: "#33302B", sub: "#847A6D", accent: "#C0693F", frame: "#E4D7C0" },
  노을: { paper: "#7A3B2E", ink: "#FDF3EA", sub: "#E0BBA9", accent: "#F0C27A", frame: "#93503F" },
  바다: { paper: "#26405E", ink: "#F0F5FA", sub: "#AEC1D4", accent: "#8FC8D8", frame: "#35536F" },
  숲: { paper: "#2C4433", ink: "#F0F5EE", sub: "#AFC2B1", accent: "#C7D493", frame: "#3B5743" },
};

/**
 * 사진 위에 글을 얹을 때 까는 아래쪽 그늘.
 *
 * 한 겹짜리 판으로 깔면 그 윗변이 사진을 가로지르는 금으로 보인다. 세로로 긴
 * 카드에서 특히 눈에 띈다. 옅은 띠를 높이만 달리해 여러 겹 포개 아래로 갈수록
 * 짙어지게 한다. 그림(SVG)이 아니라 판이라 내보낼 때 찍히는 모습이 화면과 같다.
 */
/**
 * 사진 위에 얹는 글 밑의 그늘. 아래로 갈수록 짙어진다.
 *
 * 전에는 반투명 띠 일곱 장을 겹쳐 계단처럼 만들었는데, 띠의 경계가 사진 위에 가로줄로
 * 보였다(2026-09-23, 「기본」 프레임에서 줄이 그어져 있다고 했다). 진짜 그러데이션으로 그린다.
 */
function Scrim() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg style={styles.scrim} pointerEvents="none">
      <Defs>
        <LinearGradient id={`scrim-${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0C0B0A" stopOpacity="0" />
          <Stop offset="1" stopColor="#0C0B0A" stopOpacity="0.58" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#scrim-${id})`} />
    </Svg>
  );
}

/**
 * 종이 색(2026-09-22). 필름·엽서·스크랩북의 종이를 바꾼다. 「기본」은 틀마다의 원래 색이다.
 * 먹색처럼 어두운 종이는 글자를 밝게 한다.
 */
const PAPER_LOOK: Record<Exclude<KeepsakePaperColor, "기본">, KeepsakeLook> = {
  크림: { paper: "#F6E7D2", ink: "#33302B", sub: "#847A6D", accent: "#C0693F", frame: "#E4D7C0" },
  민트: { paper: "#E6EEE6", ink: "#2E3A33", sub: "#6E7F74", accent: "#3E8A6E", frame: "#D2DED3" },
  하늘: { paper: "#E5EAF5", ink: "#2A3140", sub: "#6F7890", accent: "#3F4C8F", frame: "#D0D8EA" },
  분홍: { paper: "#F5E3E6", ink: "#3A2C30", sub: "#8A7278", accent: "#C4586C", frame: "#E8CFD4" },
  먹색: { paper: "#2B2A30", ink: "#F4F1EC", sub: "#ABA4A0", accent: "#E7B4A6", frame: "#3A3940" },
};
/** 크라프트는 종이 색 대신 갈색 재생지다. 네컷 틀에서도 틀 색을 덮는다. */
const KRAFT_LOOK: KeepsakeLook = { paper: "#C9A57A", ink: "#3B2A18", sub: "#5A4430", accent: "#7A3B2E", frame: "#B8936A" };

const lookOf = (card: KeepsakeCard): KeepsakeLook => {
  const 원래 = isCutStyle(card.style)
    ? KEEPSAKE_FRAME_LOOK[card.frameColor]
    : KEEPSAKE_LOOK[card.style as "없음" | "필름" | "엽서" | "스크랩북"];
  // 종이 없는 틀은 사진이 카드 전체라 바꿀 종이가 없다.
  if (card.style === "없음") return 원래;
  if (card.paperPattern === "크라프트") return KRAFT_LOOK;
  if (!isCutStyle(card.style) && card.paperColor !== "기본") return PAPER_LOOK[card.paperColor];
  return 원래;
};

/**
 * 종이 무늬. 카드 바탕 바로 위, 사진과 글 아래에 깐다. 그림 파일 없이 그려서 앱이 커지지
 * 않는다. 칸 크기는 카드 단위라 찍을 때 키운 배수(`unit`)만큼 함께 커진다.
 */
function PaperPattern({ pattern, paper, unit }: { pattern: KeepsakePaperPattern; paper: string; unit: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (pattern === "없음") return null;
  // 어두운 종이는 무늬 선을 밝게 그린다.
  const 선 = isDarkColor(paper) ? "rgba(255,255,255,0.13)" : "rgba(90,70,45,0.16)";
  const 칸 = (pattern === "줄" ? 16 : pattern === "크라프트" ? 7 : 12) * unit;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={id} width={칸} height={칸} patternUnits="userSpaceOnUse">
          {pattern === "모눈" && (
            <>
              <Line x1={0} y1={0.5 * unit} x2={칸} y2={0.5 * unit} stroke={선} strokeWidth={unit} />
              <Line x1={0.5 * unit} y1={0} x2={0.5 * unit} y2={칸} stroke={선} strokeWidth={unit} />
            </>
          )}
          {pattern === "줄" && <Line x1={0} y1={칸 - 0.5 * unit} x2={칸} y2={칸 - 0.5 * unit} stroke={선} strokeWidth={unit} />}
          {pattern === "점" && <Circle cx={칸 / 2} cy={칸 / 2} r={1.2 * unit} fill={선} />}
          {pattern === "크라프트" && (
            <>
              <Circle cx={1.5 * unit} cy={1.5 * unit} r={0.7 * unit} fill="rgba(90,60,30,0.2)" />
              <Circle cx={5 * unit} cy={4.5 * unit} r={0.6 * unit} fill="rgba(255,255,255,0.14)" />
            </>
          )}
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * 꾸미기 화면이 넘기는 것. 없으면 그냥 그리기만 한다(미리보기·내보내기).
 *
 * 스티커를 만지는 일은 전부 스티커 위에서 한다. 예전에는 화면 맨 아래에 작게·크게·
 * 왼쪽·오른쪽·뒤로·앞으로·삭제 일곱 개가 줄지어 있었다. 무엇을 고쳤는지 보려면
 * 눈이 카드와 버튼 줄 사이를 계속 오가야 했고, 각도를 15도씩 눌러 맞추는 것은
 * 「기울인다」는 일과 손놀림이 전혀 달랐다. 스토리 편집기들이 다 그렇듯 고른
 * 스티커에 테두리와 손잡이를 붙이고, 모서리를 끌어 크기와 각도를 함께 바꾼다.
 */
export type DecorEdit = {
  /** 고른 것. 테두리와 손잡이가 보인다. */
  selectedId: string;
  /** 카드를 화면에 맞추려고 줄인 배(`fitScaleOf`). 손가락이 움직인 거리를 이만큼 나눈다. */
  scale: number;
  onSelect: (id: string) => void;
  /** 손을 뗄 때 한 번만 부른다. 끄는 동안에는 부르지 않는다. */
  onMove: (id: string, x: number, y: number) => void;
  /**
   * 모서리 손잡이를 끄는 동안. 크기와 각도가 함께 바뀐다.
   *
   * 자리와 달리 크기는 글자 크기와 칸까지 바꾸므로 `Animated` 로 밀 수 없다.
   * 끄는 내내 상태를 고친다. 짧고 일부러 하는 동작이라 프레임이 아깝지 않다.
   */
  onResize: (id: string, size: number, angle: number) => void;
  /** ✕. 이 스티커를 뗀다. */
  onRemove: (id: string) => void;
  /** ✎. 글자를 고치는 창을 연다. 누르기만 해서는 열지 않는다(옮기려다 창이 뜨는 일이 잦았다). */
  onEdit?: (id: string) => void;
  /** ⧉. 같은 것을 하나 더 붙인다. 하트를 여러 개 붙일 때 하나씩 고르지 않아도 된다. */
  onDuplicate?: (id: string) => void;
};

/** 손잡이를 화면에서 몇 px 로 보이게 할지. 카드가 줄어든 만큼 되돌려 그린다. */
const HANDLE = 26;

/** 배수마다 한 번만 만든다. 찍을 때 쓰는 배수는 기기마다 하나라 몇 개 쌓이지 않는다. */
const 시트_캐시 = new Map<number, typeof styles>();
function sheetOf(unit: number): typeof styles {
  if (unit === 1) return styles;
  let 시트 = 시트_캐시.get(unit);
  if (!시트) {
    시트 = scaleStyles(styles, unit);
    시트_캐시.set(unit, 시트);
  }
  return 시트;
}

/** 얹은 것의 상자. 글자는 잰 폭·높이가 있으면(0 이 아니면) 그것으로 잡는다. */
const 상자_재기 = (
  decor: Pick<CardDecor, "kind" | "x" | "y" | "size">,
  cardWidth: number,
  cardHeight: number,
  글자폭: number,
  글자높이: number,
) => decorBoxOf(decor, cardWidth, cardHeight, 글자폭 || undefined, 글자높이 || undefined);

/**
 * 카드에 얹은 것 하나.
 *
 * 끄는 동안 다시 그리지 않는다. `Animated.ValueXY` 를 손가락 이벤트에서 바로
 * 밀기 때문에 React 는 한 번도 부르지 않는다. 손을 뗄 때만 위로 알린다.
 */
const DecorItem = memo(function DecorItem({
  decor,
  cardWidth,
  cardHeight,
  unit = 1,
  edit,
  onDrawn,
}: {
  decor: CardDecor;
  cardWidth: number;
  cardHeight: number;
  /** 카드를 키워 배치한 배(`KeepsakeCardView` 의 `unit`). 글자 그림자도 같이 키운다. */
  unit?: number;
  edit?: DecorEdit;
  /**
   * 글자를 이 배율로 다 쟀다고 알린다(`글자:<id>:<unit>`). 찍는 쪽이 이것을 기다린다.
   * 카드를 찍을 크기로 키우면 글자도 커지는데, 새로 재기 전에 찍으면 옛 상자 높이에 글자가
   * 잘려 들어갔다(2026-09-23, 「또 가자」의 아래 절반이 없었다).
   */
  onDrawn?: (key: string) => void;
}) {
  const s = sheetOf(unit);
  // 글자는 글이 차지하는 너비를 재서 그만큼만 상자로 잡는다. 카드 너비만큼
  // 잡아 두면 눈에 안 보이는 띠가 카드를 가로질러 다른 스티커를 못 잡는다.
  const [글자폭, 글자폭재기] = useState(0);
  // 글자 높이도 잰다. 바탕(띠·스티커 모양 등)마다 달라서, 테두리·손잡이·끌기 범위를 실제 모양에 맞춘다.
  const [글자높이, 글자높이재기] = useState(0);
  const 글자_재기 = (폭: number, 높이: number) => {
    글자폭재기(폭);
    글자높이재기(높이);
    onDrawn?.(`글자:${decor.id}:${unit}`);
  };
  const box = 상자_재기(decor, cardWidth, cardHeight, 글자폭, 글자높이);
  const left = box.cx - box.width / 2;
  const top = box.cy - box.height / 2;
  // 처음 한 번만 만든다. 이 뒤로는 손가락 이벤트가 직접 민다.
  const [spot] = useState(() => new Animated.ValueXY({ x: left, y: top }));
  // 손가락 이벤트에서 읽는 값. 렌더 중에는 읽지 않는다.
  const 지금 = useRef({ decor, cardWidth, cardHeight, left, top, edit, 글자폭, 글자높이 });
  const 잡은_곳 = useRef({ left, top });
  /** 끄는 동안 마지막으로 그린 가운데 자리(비율). 손을 뗄 때 이것을 올린다. */
  const 끈_자리 = useRef({ x: decor.x, y: decor.y });

  useEffect(() => {
    지금.current = { decor, cardWidth, cardHeight, left, top, edit, 글자폭, 글자높이 };
    spot.setValue({ x: left, y: top });
  }, [decor, cardWidth, cardHeight, left, top, edit, 글자폭, 글자높이, spot]);

  const pan = useMemo(() => {
    // PanResponder 가 이 콜백들을 손가락 이벤트 때만 부른다. ref 는 렌더 중에 읽지 않는다.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: (event) => Boolean(지금.current.edit) && event.nativeEvent.touches.length < 2,
      onMoveShouldSetPanResponder: (event) => Boolean(지금.current.edit) && event.nativeEvent.touches.length < 2,
      onPanResponderGrant: () => {
        잡은_곳.current = { left: 지금.current.left, top: 지금.current.top };
        끈_자리.current = { x: 지금.current.decor.x, y: 지금.current.decor.y };
        지금.current.edit?.onSelect(지금.current.decor.id);
      },
      onPanResponderMove: (event, gesture) => {
        if (두_손가락_이면_물러난다(event)) return;
        const 상태 = 지금.current;
        const 배 = 상태.edit?.scale || 1;
        // 글자는 잰 폭으로 상자를 잡는다. 빼먹으면 카드 전체 폭으로 셈해 가운데 점이 오른쪽
        // 끝으로 밀리고, 손을 떼면 그 자리에 저장된다(글자를 가운데로 옮겨도 오른쪽으로 돌아갔다).
        const 상자 = 상자_재기(상태.decor, 상태.cardWidth, 상태.cardHeight, 상태.글자폭, 상태.글자높이);
        const 자리 = clampDecorSpot(
          상태.decor,
          (잡은_곳.current.left + gesture.dx / 배 + 상자.width / 2) / 상태.cardWidth,
          (잡은_곳.current.top + gesture.dy / 배 + 상자.height / 2) / 상태.cardHeight,
          상태.cardWidth,
          상태.cardHeight,
          상태.decor.kind === "글자" && 상태.글자폭 ? { width: 상태.글자폭, height: 상태.글자높이 } : undefined,
        );
        끈_자리.current = 자리;
        spot.setValue({
          x: 자리.x * 상태.cardWidth - 상자.width / 2,
          y: 자리.y * 상태.cardHeight - 상자.height / 2,
        });
      },
      // 손을 뗄 때 한 번만 알린다. 화면에 이미 그려진 자리를 그대로 올린다.
      onPanResponderRelease: (_, gesture) => {
        const 상태 = 지금.current;
        // 거의 움직이지 않았으면 누른 것이다. 고르기만 한다(손을 댈 때 이미 골랐다). 글자를 고치는
        // 창은 손잡이 ✎ 로 연다 — 누르자마자 열리면 옮기려다 창이 뜨는 일이 잦았다.
        if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) return;
        상태.edit?.onMove(상태.decor.id, 끈_자리.current.x, 끈_자리.current.y);
      },
      // 두 번째 손가락이 닿으면 카드 확대(`CardDecorTools` 의 두_손가락)에 넘긴다.
      onPanResponderTerminationRequest: (event) => event.nativeEvent.touches.length >= 2,
    });
  }, [spot]);

  /**
   * 모서리 손잡이를 끄는 판.
   *
   * 가운데에서 손잡이로 뻗은 화살표를 기준으로 삼는다. 끄는 동안 그 화살표가
   * 얼마나 길어졌는지가 크기, 얼마나 돌았는지가 각도다. 손가락 하나로 둘이
   * 함께 바뀌는 것이 스티커를 「집어서 돌려 키우는」 손놀림과 같다.
   */
  const corner = useMemo(() => {
    /** 손잡이를 잡은 순간의 값. 끄는 동안 이것에 견준다. */
    const 처음 = { 길이: 1, 각: 0, size: 0, angle: 0 };
    // 아래 콜백들은 손가락 이벤트 때만 부른다. ref 는 렌더 중에 읽지 않는다.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // 이 손잡이를 잡았으면 스티커를 옮기는 판으로 넘기지 않는다.
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        const 상태 = 지금.current;
        const 배 = 상태.edit?.scale || 1;
        const 상자 = 상자_재기(상태.decor, 상태.cardWidth, 상태.cardHeight, 상태.글자폭, 상태.글자높이);
        // 손잡이는 기울어진 상자의 오른쪽 아래 모서리다. 각도만큼 돌려 둔 자리다.
        const 라디안 = (상태.decor.angle * Math.PI) / 180;
        const x = ((상자.width / 2) * Math.cos(라디안) - (상자.height / 2) * Math.sin(라디안)) * 배;
        const y = ((상자.width / 2) * Math.sin(라디안) + (상자.height / 2) * Math.cos(라디안)) * 배;
        처음.길이 = Math.max(1, Math.hypot(x, y));
        처음.각 = Math.atan2(y, x);
        처음.size = 상태.decor.size;
        처음.angle = 상태.decor.angle;
        상태.edit?.onSelect(상태.decor.id);
      },
      onPanResponderMove: (event, gesture) => {
        if (두_손가락_이면_물러난다(event)) return;
        const 상태 = 지금.current;
        const 배 = 상태.edit?.scale || 1;
        const 상자 = 상자_재기({ ...상태.decor, size: 처음.size }, 상태.cardWidth, 상태.cardHeight, 상태.글자폭, 상태.글자높이);
        const 라디안 = (처음.angle * Math.PI) / 180;
        const x = ((상자.width / 2) * Math.cos(라디안) - (상자.height / 2) * Math.sin(라디안)) * 배 + gesture.dx;
        const y = ((상자.width / 2) * Math.sin(라디안) + (상자.height / 2) * Math.cos(라디안)) * 배 + gesture.dy;
        const 길이 = Math.max(1, Math.hypot(x, y));
        상태.edit?.onResize(
          상태.decor.id,
          처음.size * (길이 / 처음.길이),
          처음.angle + ((Math.atan2(y, x) - 처음.각) * 180) / Math.PI,
        );
      },
      // 두 번째 손가락이 닿으면 카드 확대(`CardDecorTools` 의 두_손가락)에 넘긴다.
      onPanResponderTerminationRequest: (event) => event.nativeEvent.touches.length >= 2,
    });
  }, []);

  const 고른_것 = edit?.selectedId === decor.id;
  const 스티커 = decor.kind !== "글자";
  /**
   * 손잡이 크기.
   *
   * 카드는 화면에 맞추려고 `scale` 만큼 줄여 그린다. 손잡이를 카드 좌표로 그냥
   * 그리면 카드가 작을수록 손잡이도 작아져 누를 수가 없다. 줄인 만큼 되나눠
   * 화면에서는 늘 같은 크기로 보이게 한다. `theme/controls` 의 값은 화면 좌표용이라
   * 여기서는 쓰지 않는다.
   */
  const 손잡이 = HANDLE / (edit?.scale || 1);
  const 테두리 = Math.max(1, 1.5 / (edit?.scale || 1));
  /** 모서리 손잡이 알 하나. 가운데가 모서리에 오게 반만큼 밖으로 낸다. */
  const 알 = { width: 손잡이, height: 손잡이, borderRadius: 손잡이 / 2, borderWidth: 테두리 };
  const 밖 = -손잡이 / 2;
  return (
    <Animated.View
      {...(edit ? pan.panHandlers : {})}
      accessible={Boolean(edit)}
      accessibilityLabel={decor.kind === "글자" ? `텍스트 ${decor.text}` : `${decor.kind} 스티커`}
      style={[
        s.decor,
        {
          // 글자는 재기 전까지 너비를 비워 둔다. 그래야 글만큼만 차지한다. 높이도 글이 정한다 —
          // 잰 높이로 못 박으면 배율이 바뀌어 다시 재는 사이에 글자가 잘린다.
          width: decor.kind === "글자" ? undefined : box.width,
          maxWidth: cardWidth,
          height: decor.kind === "글자" ? undefined : box.height,
          opacity: decor.kind === "글자" && !글자폭 ? 0 : 1,
          transform: [
            { translateX: spot.x },
            { translateY: spot.y },
            { rotate: `${decor.angle}deg` },
          ],
        },
      ]}
    >
      {스티커
        ? <StickerArt name={decor.kind} size={box.side} />
        : <DecorText decor={decor} side={box.side} sheet={s} onSize={글자_재기} />}
      {고른_것 && edit && (
        <>
          <View pointerEvents="none" style={[s.decorRing, { borderWidth: 테두리 }]} />
          {/* 왼쪽 위는 떼기. 스티커를 끌어 옮기는 손과 부딪히지 않게 반대쪽 모서리에 둔다. */}
          <Pressable
            onPress={() => edit.onRemove(decor.id)}
            hitSlop={손잡이 / 2}
            accessibilityRole="button"
            accessibilityLabel="스티커 삭제"
            style={[s.decorHandle, 알, { left: 밖, top: 밖 }]}
          >
            <Text style={[s.decorHandleMark, { fontSize: 손잡이 * 0.55 }]}>✕</Text>
          </Pressable>
          {/* 오른쪽 위는 복제. 떼기와 멀리, 크기 손잡이와는 세로로 떨어뜨린다. */}
          {edit.onDuplicate && (
            <Pressable
              onPress={() => edit.onDuplicate?.(decor.id)}
              hitSlop={손잡이 / 2}
              accessibilityRole="button"
              accessibilityLabel="같은 것 하나 더 붙이기"
              style={[s.decorHandle, 알, { right: 밖, top: 밖 }]}
            >
              <Glyph name="copy" size={손잡이 * 0.52} color="#23211F" weight={2.2} />
            </Pressable>
          )}
          {/* 글자는 왼쪽 아래 ✎ 로 고치는 창을 연다. */}
          {decor.kind === "글자" && edit.onEdit && (
            <Pressable
              onPress={() => edit.onEdit?.(decor.id)}
              hitSlop={손잡이 / 2}
              accessibilityRole="button"
              accessibilityLabel="글자 고치기"
              style={[s.decorHandle, 알, { left: 밖, bottom: 밖 }]}
            >
              <Glyph name="pencil" size={손잡이 * 0.5} color="#23211F" weight={2.2} />
            </Pressable>
          )}
          {/* 오른쪽 아래는 크기와 각도. 한 손가락으로 되는 길을 먼저 둔다. */}
          <View
            {...corner.panHandlers}
            accessible
            accessibilityLabel="끌어서 크기와 회전 바꾸기"
            style={[s.decorHandle, 알, { right: 밖, bottom: 밖 }]}
          >
            <Text style={[s.decorHandleMark, { fontSize: 손잡이 * 0.5 }]}>⤢</Text>
          </View>
        </>
      )}
    </Animated.View>
  );
});

/**
 * 내보낼 카드 그 자체. 미리보기와 내보내기가 이 하나를 같이 쓴다. 보이는 대로 저장된다.
 *
 * 너비를 고정한다. 기기 폭에 따라 카드가 늘어나면 같은 여행이 기기마다 다른 그림이
 * 되고, 웹에서 찍은 것과 폰에서 찍은 것이 달라진다. 내보낼 때만 `captureRef` 가
 * 1080px 쪽으로 키우고, 꾸미기 화면은 겉을 `scale` 로 줄여 보여 준다. 어느 쪽이든
 * 이 안의 숫자는 그대로라서 스티커 자리가 흔들리지 않는다.
 *
 * 가로 카드는 글을 사진 아래에 두면 사진이 띠처럼 얇아져서, 사진 위에 얹는다.
 * 네컷 틀은 사진관에서 뽑는 그것이라 아래 여백에 이름·날짜·`Daymo` 를 둔다.
 */
export const KeepsakeCardView = memo(function KeepsakeCardView({
  shotRef,
  card,
  photos,
  text,
  stats,
  stamp,
  big,
  edit,
  showEmptySlots,
  onPickSlot,
  onPhotoReady,
  onSwapPhotos,
  onCellRatio,
  unit = 1,
}: {
  shotRef?: React.RefObject<View | null>;
  card: KeepsakeCard;
  /** 고른 차례대로의 사진. 파일을 아직 못 받았으면 색만 깔린다. */
  photos: CardPhoto[];
  text: { title: string; meta: string; caption: string; people: string };
  stats: { label: string; value: string }[];
  /** 날짜 도장에 찍을 글. 껐으면 빈 글자다. */
  stamp: string;
  /** 내보내는 중인지. 그때만 표시본을 그린다. 미리보기는 썸네일이다. */
  big: boolean;
  /** 꾸미기 화면에서만 넘긴다. 스티커를 끌 수 있게 된다. */
  edit?: DecorEdit;
  /**
   * 틀의 빈 칸까지 그릴지. 꾸미는 중에만 참이다.
   *
   * 「네컷」을 골랐는데 사진이 한 장이면 예전에는 틀을 한 칸으로 줄였다. 세로로 긴
   * 카드에 사진 한 장이 꽉 차 늘어난 것처럼 보였고, 무엇을 하면 네컷이 되는지도
   * 알 수 없었다. 꾸미는 동안에는 빈 칸을 점선으로 그리고 눌러 채우게 한다.
   * 내보낼 때와 미리보기에서는 끈다. 빈 칸이 그림으로 남으면 안 된다.
   */
  showEmptySlots?: boolean;
  /** 빈 칸을 눌렀을 때. 그 칸에 넣을 사진을 고르는 자리로 데려간다. */
  onPickSlot?: (index: number) => void;
  /** 사진 한 장이 다 그려졌을 때. 웹의 blob: 주소는 다 받기 전에 찍으면 빈 칸이 찍힌다. */
  onPhotoReady?: (key: string) => void;
  /**
   * 꾸미는 중에만 넘긴다. 사진을 꾹 눌러 다른 사진 위에 놓으면 두 자리를 부른다.
   * 넘기지 않으면 사진 칸은 손가락에 반응하지 않는다.
   */
  onSwapPhotos?: (from: number, to: number) => void;
  /**
   * 사진 칸마다의 가로:세로. 「프레임」의 비율 칩으로 보일 부분을 맞출 때 틀 모양으로 쓴다.
   * 카드에서 칸을 눌러 맞추게 했더니 잘못 눌려 할 일이 많아(2026-09-22), 비율에서만 연다.
   */
  onCellRatio?: (photoId: string, ratio: number) => void;
  /**
   * 카드를 몇 배 크기로 배치할지. 폰에서 찍을 때만 1 보다 크다(`keepsakeShotScale`).
   *
   * 화면 단위로 배치하고 transform 으로 키우면 iOS 가 사진을 작게 먼저 그려 흐려진다.
   * 크기 숫자에 배수를 곱한 스타일(`scaleStyles`)로 처음부터 큰 크기로 배치한다.
   */
  unit?: number;
}) {
  const s = sheetOf(unit);
  const look = lookOf(card);
  const 제_크기 = keepsakeSizeOf(card.ratio, card.style);
  const size = { width: 제_크기.width * unit, height: 제_크기.height * unit };
  const 네컷 = isCutStyle(card.style);
  // 종이가 없으면 사진이 칸을 다 쓴다. 글을 아래에 두면 놓을 종이가 없으므로
  // 가로 카드와 같이 사진 위에 옅은 그늘을 깔고 얹는다.
  const 종이없음 = isBareStyle(card.style);
  const 위에_얹는다 = 종이없음 || (!네컷 && card.ratio === "가로");
  const frame = useMemo(
    () => keepsakeFrameOf(card.style, photos.length, showEmptySlots),
    [card.style, photos.length, showEmptySlots],
  );
  const 좁은_띠 = card.style === "네컷 가로";
  // 줄마다 몇 번째 사진부터인지. 그리면서 세면 같은 사진이 두 칸에 들어간다.
  const 줄 = useMemo(() => keepsakeRowSlots(frame.rows), [frame.rows]);
  /** 꾹 눌러 옮기는 중. 어느 칸을 들었고 지금 어느 칸 위에 있는지. */
  const [옮김, 옮김_표시] = useState<{ from: number; to: number | null } | null>(null);
  /** 칸마다의 사진 자리. 들었을 때 화면 좌표를 재서 손가락이 어느 칸 위인지 가른다. */
  const 칸들 = useRef<(View | null)[]>([]);
  const 옮길_수_있다 = Boolean(onSwapPhotos) && photos.length > 1;
  const 칸_등록 = (index: number, view: View | null) => {
    칸들.current[index] = view;
  };
  const 칸_재기 = (each: (자리: { index: number; x: number; y: number; width: number; height: number }) => void) => {
    칸들.current.forEach((칸, index) => {
      칸?.measureInWindow((x, y, width, height) => each({ index, x, y, width, height }));
    });
  };

  const 칸 = (photo: CardPhoto | undefined, 내_자리: number) => {
    const 설명 = 네컷 ? keepsakeSlotCaption(photo?.caption, card.photoCaptions) : "";
    const 마지막_칸 = 내_자리 === frame.slots - 1;
    // 꾸미는 중의 빈 칸. 점선과 ＋ 로 「여기에 넣으세요」를 눈에 보이게 한다.
    if (!photo && showEmptySlots) {
      return (
        <Pressable
          key={`blank-${내_자리}`}
          onPress={() => onPickSlot?.(내_자리)}
          accessibilityRole="button"
          accessibilityLabel={`${내_자리 + 1}번째 칸에 사진 넣기`}
          style={s.cell}
        >
          <View style={[s.cellEmpty, { borderColor: look.sub }]}>
            <Text style={[s.cellEmptyMark, { color: look.sub }]}>＋</Text>
          </View>
        </Pressable>
      );
    }
    return (
      <View key={photo?.id ?? `blank-${내_자리}`} style={s.cell}>
        <SwapCell
          index={내_자리}
          enabled={옮길_수_있다 && Boolean(photo)}
          scale={edit?.scale || 1}
          onRef={칸_등록}
          measure={칸_재기}
          lifted={옮김?.from === 내_자리}
          onMeasure={photo && onCellRatio ? (ratio) => onCellRatio(photo.id, ratio) : undefined}
          onLift={() => 옮김_표시({ from: 내_자리, to: null })}
          onOver={(to) => 옮김_표시((지금) => (지금 && 지금.to !== to ? { ...지금, to } : 지금))}
          onDrop={(to) => {
            옮김_표시(null);
            if (to !== null && to !== 내_자리) onSwapPhotos?.(내_자리, to);
          }}
          style={[s.cellPhoto, { backgroundColor: photo?.color ?? look.frame }]}
        >
          {photo?.uri && (
            <FocusedPhoto
              key={photo.uri}
              uri={photo.uri}
              focus={card.photoFocus[photo.id]}
              onReady={() => onPhotoReady?.(`${photo.id}:${big ? "d" : "t"}`)}
            />
          )}
          {네컷 && Boolean(stamp) && 마지막_칸 && (
            <Text style={[s.stamp, 좁은_띠 && s.stampSmall]}>{stamp}</Text>
          )}
          {/* 들고 있는 사진을 놓을 칸. 여기서 손을 떼면 두 사진이 자리를 바꾼다. */}
          {옮김 && 옮김.to === 내_자리 && (
            <View pointerEvents="none" style={[s.swapTarget, { borderColor: look.accent }]} />
          )}
        </SwapCell>
        {Boolean(설명) && (
          <Text numberOfLines={1} style={[s.cellCaption, { color: look.sub }]}>{설명}</Text>
        )}
      </View>
    );
  };

  const copy = (
    <View style={[s.copy, 위에_얹는다 && s.copyOver, 네컷 && s.copyBand, 좁은_띠 && s.copyBandNarrow]}>
      <View style={좁은_띠 ? s.bandLine : undefined}>
        {Boolean(text.title) && (
          <Text
            numberOfLines={좁은_띠 ? 1 : 2}
            style={[s.title, 네컷 && s.titleCut, { color: 위에_얹는다 ? "#F8F5F0" : look.ink }]}
          >
            {text.title}
          </Text>
        )}
        {Boolean(text.meta) && (
          <Text numberOfLines={1} style={[s.meta, { color: 위에_얹는다 ? "#E7DFD2" : look.accent }]}>
            {text.meta}
          </Text>
        )}
      </View>
      {Boolean(text.people) && !좁은_띠 && (
        <Text numberOfLines={1} style={[s.meta, { color: 위에_얹는다 ? "#E7DFD2" : look.sub }]}>
          {text.people}
        </Text>
      )}
      {Boolean(text.caption) && (
        <Text
          numberOfLines={2}
          style={[
            s.caption,
            // 손글씨 느낌 한 줄. 스크랩북과 네컷 틀에서 기울여 적는다.
            (card.style === "스크랩북" || 네컷) && s.hand,
            { color: 위에_얹는다 ? "#E7DFD2" : look.sub },
          ]}
        >
          {text.caption}
        </Text>
      )}
      {stats.length > 0 && !좁은_띠 && (
        <View style={s.statRow}>
          {stats.map((stat) => (
            <View key={stat.label}>
              <Text style={[s.statValue, { color: 위에_얹는다 ? "#F8F5F0" : look.ink }]}>{stat.value}</Text>
              <Text style={[s.statLabel, { color: 위에_얹는다 ? "#E7DFD2" : look.sub }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}
      {네컷 && <Text style={[s.brand, { color: look.sub }]}>Daymo</Text>}
    </View>
  );

  return (
    <View
      ref={shotRef}
      collapsable={false}
      style={[
        s.card,
        네컷 && s.cardCut,
        종이없음 && s.cardBare,
        { width: size.width, height: size.height, backgroundColor: look.paper },
      ]}
    >
      <PaperPattern pattern={card.style === "없음" ? "없음" : card.paperPattern} paper={look.paper} unit={unit} />
      {card.style === "필름" && (
        <View style={s.filmHoles}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((hole) => (
            <View key={hole} style={[s.filmHole, { backgroundColor: look.frame }]} />
          ))}
        </View>
      )}
      <View
        style={[
          s.photoArea,
          card.style === "스크랩북" && s.photoAreaTilt,
          네컷 && s.photoAreaCut,
          종이없음 && s.photoAreaBare,
          { borderColor: look.frame },
        ]}
      >
        {줄.map((한_줄, index) => (
          <View
            key={`row-${index}`}
            style={[
              s.photoRow,
              네컷 && s.photoRowCut,
              종이없음 && s.photoRowBare,
              // 들고 있는 사진이 다른 줄 위로 지나갈 때 가리지 않게 그 줄을 위로 올린다.
              옮김 && 옮김.from >= 한_줄.start && 옮김.from < 한_줄.start + 한_줄.count && s.photoRowLifted,
            ]}
          >
            {Array.from({ length: 한_줄.count }, (_, slot) => 칸(photos[한_줄.start + slot], 한_줄.start + slot))}
          </View>
        ))}
        {card.style === "엽서" && (
          <View style={[s.postStamp, { borderColor: look.frame, backgroundColor: look.paper }]}>
            <Text style={[s.postStampText, { color: look.accent }]}>DAYMO</Text>
          </View>
        )}
        {card.style === "스크랩북" && <View style={s.tape} />}
        {위에_얹는다 && <Scrim />}
        {위에_얹는다 && copy}
      </View>
      {!위에_얹는다 && copy}
      {/* 얹은 것은 카드 맨 위에 그린다. 사진이든 글이든 그 위를 덮는다. */}
      <View style={StyleSheet.absoluteFill} pointerEvents={edit ? "box-none" : "none"}>
        {card.decor.map((하나) => (
          <DecorItem
            key={하나.id}
            decor={하나}
            cardWidth={size.width}
            cardHeight={size.height}
            unit={unit}
            edit={edit}
            onDrawn={onPhotoReady}
          />
        ))}
      </View>
    </View>
  );
});

/** 꾹 눌러야 드는 시간. 이보다 먼저 손가락이 움직이면 스크롤이나 스티커에 넘긴다. 차례 줄도 같이 쓴다. */
export const LIFT_DELAY = 300;
/** 들기 전에 손가락이 이만큼(px) 넘게 움직였으면 꾹 누른 것이 아니다. */
export const LIFT_SLOP = 8;
/**
 * 손가락이 둘이면 이 판은 물러난다. 카드를 벌려 키우는 것(`CardDecorEditor` 의 `두_손가락`)이
 * 손가락 이벤트를 직접 듣기 때문에, 여기서 같이 끌면 스티커·사진이 딸려 움직인다.
 */
const 두_손가락_이면_물러난다 = (event: GestureResponderEvent) => event.nativeEvent.touches.length >= 2;

/**
 * 꾹 눌러 든 칸을 띄우고 흔들기 시작한다. 카드의 사진 칸과 차례 줄(`CardOrderStrip`)이 같이 쓴다.
 * 흔들기를 돌려주니 놓을 때 멈춘다. 얼마나 키우고 기울일지는 쓰는 쪽이 `들림`·`흔들림` 을 이어 정한다.
 */
export function startLift(들림: Animated.Value, 흔들림: Animated.Value): Animated.CompositeAnimation {
  Animated.spring(들림, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  const 흔들기 = Animated.loop(
    Animated.sequence([
      Animated.timing(흔들림, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(흔들림, { toValue: -1, duration: 180, useNativeDriver: true }),
      Animated.timing(흔들림, { toValue: 0, duration: 90, useNativeDriver: true }),
    ]),
  );
  흔들기.start();
  return 흔들기;
}

/**
 * 카드의 사진 칸 하나. 꾹 누르면 들려 올라가 흔들리고, 끌면 따라온다.
 *
 * 다른 사진 위에서 놓으면 두 자리를 알리고, 다른 곳에서 놓으면 제자리로 돌아간다.
 * 끄는 동안 다시 그리지 않도록 자리는 `Animated` 로 민다. 어느 칸 위인지만 위로 알린다.
 */
function SwapCell({
  index,
  enabled,
  scale,
  onRef,
  measure,
  lifted,
  onMeasure,
  onLift,
  onOver,
  onDrop,
  style,
  children,
}: {
  index: number;
  enabled: boolean;
  /** 카드를 화면에 맞추려고 줄인 배. 손가락이 움직인 거리를 이만큼 나눈다. */
  scale: number;
  /** 이 칸의 자리를 부모에 맡긴다. 들었을 때 모든 칸의 화면 좌표를 잰다. */
  onRef: (index: number, view: View | null) => void;
  measure: (each: (자리: { index: number; x: number; y: number; width: number; height: number }) => void) => void;
  lifted: boolean;
  /** 칸의 가로:세로를 잴 때마다 알린다. */
  onMeasure?: (ratio: number) => void;
  onLift: () => void;
  onOver: (to: number | null) => void;
  onDrop: (to: number | null) => void;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  // 처음 한 번만 만든다. 이 뒤로는 손가락 이벤트가 직접 민다.
  const [자리] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [들림] = useState(() => new Animated.Value(0));
  const [흔들림] = useState(() => new Animated.Value(0));
  // 손가락 이벤트에서 읽는 값. 렌더 중에는 읽지 않는다.
  const 지금 = useRef({ index, enabled, scale, onLift, onOver, onDrop, measure });
  useEffect(() => {
    지금.current = { index, enabled, scale, onLift, onOver, onDrop, measure };
  }, [index, enabled, scale, onLift, onOver, onDrop, measure]);

  /** 한 번 누르는 동안의 값. 손가락 이벤트에서만 고친다. */
  const 손 = useRef<{
    타이머?: ReturnType<typeof setTimeout>;
    들었다: boolean;
    칸_자리: { index: number; x: number; y: number; width: number; height: number }[];
    놓을_칸: number | null;
    흔들기?: Animated.CompositeAnimation;
  }>({ 들었다: false, 칸_자리: [], 놓을_칸: null });

  const pan = useMemo(() => {
    const 이번 = 손.current;
    const 내려놓기 = (자리를_바꿨다: boolean) => {
      이번.흔들기?.stop();
      흔들림.setValue(0);
      if (자리를_바꿨다) {
        // 사진이 새 칸으로 옮겨 그려진다. 끌던 거리는 바로 지운다.
        자리.setValue({ x: 0, y: 0 });
        들림.setValue(0);
        return;
      }
      // 다른 사진 위가 아니면 제자리로 돌아간다.
      Animated.parallel([
        Animated.spring(자리, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 7 }),
        Animated.spring(들림, { toValue: 0, useNativeDriver: true, friction: 7 }),
      ]).start();
    };
    const 끝낸다 = () => {
      if (이번.타이머) clearTimeout(이번.타이머);
      이번.타이머 = undefined;
      if (!이번.들었다) return;
      이번.들었다 = false;
      const 바꿀_칸 = 이번.놓을_칸;
      이번.놓을_칸 = null;
      내려놓기(바꿀_칸 !== null);
      지금.current.onDrop(바꿀_칸);
    };
    // PanResponder 가 이 콜백들을 손가락 이벤트 때만 부른다. ref 는 렌더 중에 읽지 않는다.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => 지금.current.enabled,
      // 들기 전에는 스크롤이 가져가도 된다. 든 뒤에는 놓을 때까지 붙든다.
      onPanResponderTerminationRequest: (event) => !이번.들었다 || event.nativeEvent.touches.length >= 2,
      onPanResponderGrant: () => {
        이번.들었다 = false;
        이번.놓을_칸 = null;
        이번.타이머 = setTimeout(() => {
          이번.타이머 = undefined;
          이번.들었다 = true;
          이번.칸_자리 = [];
          지금.current.measure((자리_하나) => 이번.칸_자리.push(자리_하나));
          지금.current.onLift();
          이번.흔들기 = startLift(들림, 흔들림);
        }, LIFT_DELAY);
      },
      onPanResponderMove: (event, g) => {
        // 벌려 키우는 중이면 들지 않는다. 들고 있었으면 제자리로 돌려놓는다.
        if (두_손가락_이면_물러난다(event)) {
          if (이번.타이머) {
            clearTimeout(이번.타이머);
            이번.타이머 = undefined;
          }
          if (이번.들었다) 끝낸다();
          return;
        }
        if (!이번.들었다) {
          // 들기 전에 움직였으면 꾹 누른 것이 아니다.
          if (이번.타이머 && (Math.abs(g.dx) > LIFT_SLOP || Math.abs(g.dy) > LIFT_SLOP)) {
            clearTimeout(이번.타이머);
            이번.타이머 = undefined;
          }
          return;
        }
        const 배 = 지금.current.scale || 1;
        자리.setValue({ x: g.dx / 배, y: g.dy / 배 });
        const 위 = 이번.칸_자리.find(
          (칸) => 칸.index !== 지금.current.index
            && g.moveX >= 칸.x && g.moveX <= 칸.x + 칸.width
            && g.moveY >= 칸.y && g.moveY <= 칸.y + 칸.height,
        );
        const 다음 = 위 ? 위.index : null;
        if (다음 !== 이번.놓을_칸) {
          이번.놓을_칸 = 다음;
          지금.current.onOver(다음);
        }
      },
      onPanResponderRelease: 끝낸다,
      onPanResponderTerminate: 끝낸다,
    });
  }, [자리, 들림, 흔들림]);

  return (
    <Animated.View
      ref={(칸: View | null) => onRef(index, 칸)}
      {...(enabled ? pan.panHandlers : {})}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        onMeasure?.(width / Math.max(1, height));
      }}
      style={[
        style,
        lifted && styles.swapLifted,
        {
          transform: [
            { translateX: 자리.x },
            { translateY: 자리.y },
            { scale: 들림.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) },
            { rotate: 흔들림.interpolate({ inputRange: [-1, 1], outputRange: ["-2deg", "2deg"] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * 칸 안의 사진 한 장. 칸마다 맞춘 자리(`card.photoFocus`)가 있으면 그 자리대로 놓는다.
 *
 * 맞춘 자리가 없으면 예전처럼 가운데를 잘라 채운다. 있으면 홈 대표 사진과 같은 셈
 * (`coverLayout`)으로 사진 크기와 칸 크기를 재서 놓는다. 둘 다 재기 전에 찍으면 가운데가
 * 찍히므로, 다 놓은 뒤에야 `onReady` 를 부른다(찍기는 이것을 기다린다).
 */
function FocusedPhoto({ uri, focus, onReady }: { uri: string; focus?: CoverFocus; onReady?: () => void }) {
  const 맞춤 = Boolean(focus) && !sameFocus(focus!, COVER_FOCUS_DEFAULT);
  const [칸, 칸재기] = useState<Box>({ width: 0, height: 0 });
  const [사진, 사진재기] = useState<Box | undefined>(undefined);
  const 다_놓임 = !맞춤 ? Boolean(사진) : Boolean(사진) && 칸.width > 0 && 칸.height > 0;
  const 알렸다 = useRef(false);
  useEffect(() => {
    if (!다_놓임 || 알렸다.current) return;
    알렸다.current = true;
    onReady?.();
  }, [다_놓임, onReady]);
  const 자리 = 맞춤 && 사진 && 칸.width > 0 ? coverLayout(사진, 칸, focus!) : undefined;
  return (
    <View
      style={styles.fill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        칸재기((지금) => (지금.width === width && 지금.height === height ? 지금 : { width, height }));
      }}
    >
      <Image
        source={{ uri }}
        resizeMode="cover"
        style={자리 ? { position: "absolute", ...자리 } : styles.fill}
        onLoad={(event) => {
          const { width, height } = event.nativeEvent.source ?? {};
          사진재기(width && height ? { width, height } : { width: 1, height: 1 });
        }}
      />
    </View>
  );
}

/**
 * 스티커 모양 바탕의 글자. 「글씨」 스티커 그림을 그대로 쓰고 글자만 적은 말로 바꿔 끼운다
 * (`StickerArt` 의 text). 글자 폭은 보이지 않는 글자를 먼저 그려 실제로 잰다. 어림하면 좁은
 * 글꼴(손글씨)은 양옆이 휑하고 넓은 글꼴은 끝에 걸린다.
 */
function StickerTextBack({
  back,
  text,
  side,
  fontFamily,
  onSize,
}: {
  back: DecorShapeBack;
  text: string;
  side: number;
  fontFamily: string;
  onSize?: (width: number, height: number) => void;
}) {
  const 스티커 = DECOR_SHAPE_STICKER[back];
  const 그림 = STICKER_ART[스티커];
  const 원래_글 = 그림?.shapes.find((모양): 모양 is Extract<typeof 모양, { text: string }> => "text" in 모양);
  const [잰_폭, 재기] = useState(0);
  if (!그림 || !원래_글) return null;
  // 적은 말의 글자 크기가 `side` 가 되게 그림 한 단위를 몇 px 로 볼지 정한다.
  const 한_단위 = side / 원래_글.size;
  const 맞춤 = fitStickerText(그림, text, 잰_폭 > 0 ? 잰_폭 / 한_단위 : undefined);
  const 너비 = (맞춤?.w ?? 그림.w) * 한_단위;
  const 높이 = 그림.h * 한_단위;
  return (
    <View onLayout={(event) => onSize?.(event.nativeEvent.layout.width, event.nativeEvent.layout.height)} style={{ width: 너비, height: 높이 }}>
      {/* 폭을 재는 글자. 보이지 않고, 넓게 두어 줄이 바뀌지 않게 한다. */}
      <Text
        numberOfLines={1}
        onTextLayout={(event) => {
          const 폭 = event.nativeEvent.lines[0]?.width ?? 0;
          재기((지금) => (Math.abs(지금 - 폭) < 0.5 ? 지금 : 폭));
        }}
        style={[styles.measure, { fontSize: side, fontFamily }]}
      >
        {text}
      </Text>
      <StickerArt name={스티커} size={Math.max(너비, 높이)} text={text} fontFamily={fontFamily} measuredWidth={잰_폭 > 0 ? 잰_폭 / 한_단위 : undefined} />
    </View>
  );
}

/**
 * 카드 위 글자 하나. 글꼴·색·바탕을 입힌다.
 *
 * 인스타그램 스토리와 같게 「띠」는 고른 색을 바탕으로 깔고 글자를 대비되는 색으로,
 * 「형광펜」은 고른 색을 글자 아래쪽 반에 칠하고, 「말풍선」은 흰 풍선 안에 고른 색 글자다.
 * 리본·태그·도장·이름표·딱지·하트·풍선은 「글씨」 스티커 그림에 적은 말을 끼운다(`StickerTextBack`).
 * 바탕이 없으면 예전처럼 그림자만 준다. 너비는 바탕까지 재서 위로 알린다.
 */
function DecorText({
  decor,
  side,
  sheet,
  onSize,
}: {
  decor: Pick<CardDecor, "text" | "font" | "color" | "back">;
  side: number;
  sheet: typeof styles;
  /** 바탕까지 잰 크기. 카드의 글자 상자(테두리·손잡이·끌기 범위)가 이것을 쓴다. */
  onSize?: (width: number, height: number) => void;
}) {
  const fontsReady = useDecorFonts();
  const { ink: 글자색, paint: 색 } = decorInkOf(decor);
  const back = decor.back ?? "없음";
  const 글꼴 = decor.font && decor.font !== "기본" && fontsReady ? DECOR_FONT_FAMILY[decor.font] : typo.title.family;
  if (isShapeBack(back)) return <StickerTextBack back={back} text={decor.text} side={side} fontFamily={글꼴} onSize={onSize} />;
  const 글 = (
    <Text
      numberOfLines={1}
      style={[
        sheet.decorText,
        { fontSize: side, lineHeight: side * 1.35, fontFamily: 글꼴, color: 글자색 },
        back !== "없음" && styles.decorTextFlat,
      ]}
    >
      {decor.text}
    </Text>
  );
  return (
    <View
      onLayout={(event) => onSize?.(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
      style={[
        back === "띠" && { backgroundColor: 색, paddingHorizontal: side * 0.32, borderRadius: side * 0.18 },
        back === "말풍선" && { backgroundColor: "#FFFFFF", paddingHorizontal: side * 0.5, borderRadius: side * 0.7 },
        back === "형광펜" && { paddingHorizontal: side * 0.12 },
      ]}
    >
      {back === "형광펜" && (
        <View pointerEvents="none" style={[styles.highlight, { backgroundColor: 색, height: side * 0.62, bottom: side * 0.12 }]} />
      )}
      {글}
      {back === "말풍선" && (
        <View
          pointerEvents="none"
          style={[
            styles.bubbleTail,
            {
              left: side * 0.7,
              bottom: -side * 0.26,
              borderLeftWidth: side * 0.2,
              borderRightWidth: side * 0.2,
              borderTopWidth: side * 0.3,
            },
          ]}
        />
      )}
    </View>
  );
}

/** 글자 창 위쪽의 미리보기. 카드에 그려질 글자 그대로를 크게 보여 준다. */
export function DecorTextPreview({ decor, side }: { decor: Pick<CardDecor, "text" | "font" | "color" | "back">; side: number }) {
  return <DecorText decor={decor} side={side} sheet={styles} />;
}

/**
 * 글자 창 「바탕」 칩에 넣는 견본. 이름 대신 그 모양을 작게 그려, 고르기 전에 어떻게
 * 보일지 바로 보이게 한다. 카드에 그리는 것과 같은 부품이라 모양이 어긋나지 않는다.
 */
// 글자를 한 자 적을 때마다 글자 창이 다시 그려진다. 견본 열한 개는 색·글꼴이 바뀔 때만 다시 그린다.
export const DecorBackSample = memo(function DecorBackSample({ back, color, font }: Pick<CardDecor, "back" | "color" | "font">) {
  // 스티커 모양은 스티커를 문구까지 그대로 보여 준다. 칩은 어떤 바탕인지 보고 고르는 견본이다.
  if (isShapeBack(back)) {
    return <StickerArt name={DECOR_SHAPE_STICKER[back]} size={58} shadow={false} />;
  }
  return <DecorText decor={{ text: "가나다", back, color, font }} side={12} sheet={styles} />;
});

/** 카드를 화면에 맞춰 줄여 보여 준다. 줄여도 카드 안의 숫자는 그대로다. */
export function ScaledCard({
  scale,
  width,
  height,
  shotRef,
  children,
}: {
  scale: number;
  width: number;
  height: number;
  /** 폰에서 찍을 때 여기를 찍는다. 이 상자가 키운 뒤의 실제 크기라서다. */
  shotRef?: React.RefObject<View | null>;
  children: React.ReactNode;
}) {
  return (
    <View ref={shotRef} collapsable={false} style={[styles.scaleBox, { width: width * scale, height: height * scale }]}>
      <View style={{ width, height, transform: [{ scale }] }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  scaleBox: { alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 14, padding: 12, overflow: "hidden" },
  // 사진관에서 뽑는 네컷은 테두리가 얇고 모서리가 각지다.
  cardCut: { borderRadius: 6, padding: 8 },
  // 종이 없는 카드. 여백도 사진 사이 간격도 없이 사진이 칸을 다 쓴다.
  cardBare: { padding: 0 },
  photoAreaBare: { borderRadius: 0, gap: 0 },
  photoRowBare: { gap: 0 },
  filmHoles: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  filmHole: { width: 18, height: 7, borderRadius: 2 },
  photoArea: { flex: 1, borderRadius: 8, overflow: "hidden", gap: 3 },
  // 네컷은 사진 사이 간격이 좁고, 그 틈으로 틀 색이 보인다.
  photoAreaCut: { borderRadius: 0, overflow: "visible", gap: 4 },
  // 스크랩북은 사진을 살짝 기울여 붙인다. 붙인 종이처럼 보이게 하는 것이 전부다.
  photoAreaTilt: { transform: [{ rotate: "-1.2deg" }], borderWidth: 5, borderColor: "#FFFFFF" },
  photoRow: { flex: 1, flexDirection: "row", gap: 3 },
  photoRowCut: { gap: 4 },
  cell: { flex: 1, minWidth: 0 },
  cellPhoto: { flex: 1, overflow: "hidden" },
  photoRowLifted: { zIndex: 3 },
  swapTarget: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderWidth: 3, borderRadius: 4 },
  // 들고 있는 사진. 다른 칸 위에 떠 보이게 그림자를 준다.
  swapLifted: {
    zIndex: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  cellCaption: { fontSize: 7, lineHeight: 10, marginTop: 1, textAlign: "center" },
  // 꾸미는 중의 빈 칸. 점선이라 「아직 안 채운 자리」로 읽힌다.
  cellEmpty: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.7,
  },
  cellEmptyMark: { fontSize: 18 },
  // 얹은 것. 자리와 각도는 transform 으로만 준다. 끄는 동안 다시 그리지 않으려면
  // left/top 이 아니라 transform 이어야 한다.
  decor: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center" },
  decorText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontFamily: typo.title.family,
    textShadowColor: "rgba(17,16,15,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // 바탕을 깐 글자는 그림자를 빼야 바탕 위에서 번지지 않는다.
  decorTextFlat: { textShadowColor: "transparent", textShadowRadius: 0 },
  // 폭만 재는 보이지 않는 글자. 넓게 두어 줄이 바뀌지 않게 한다.
  measure: { position: "absolute", left: 0, top: 0, width: 4000, opacity: 0 },
  highlight: { position: "absolute", left: 0, right: 0, borderRadius: 2 },
  bubbleTail: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
  },
  decorRing: {
    position: "absolute",
    left: -3,
    top: -3,
    right: -3,
    bottom: -3,
    borderRadius: 4,
    borderColor: "#FFFFFF",
    borderStyle: "dashed",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  // 모서리 손잡이. 어떤 사진 위에 얹혀도 보이게 흰 알에 어두운 글자를 쓴다.
  decorHandle: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(17,16,15,0.35)",
  },
  decorHandleMark: { color: "#23211F", fontFamily: typo.label.family },
  // 필름 카메라가 찍어 주던 날짜. 마지막 칸 오른쪽 아래에 주황색으로.
  stamp: {
    position: "absolute",
    right: 5,
    bottom: 4,
    fontSize: 9,
    color: "#F2A03D",
    letterSpacing: 0.4,
    fontFamily: typo.label.family,
  },
  stampSmall: { fontSize: 6, right: 3, bottom: 2 },
  // 엽서의 우표 자리. 실제 우표가 아니라 엽서라는 것을 알려 주는 표시다.
  postStamp: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 34,
    height: 42,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  postStampText: { fontSize: 8, fontFamily: typo.label.family },
  // 마스킹 테이프. 사진 위쪽 가운데에 비스듬히.
  tape: {
    position: "absolute",
    top: -8,
    alignSelf: "center",
    width: 74,
    height: 20,
    backgroundColor: "rgba(226,206,160,0.75)",
    transform: [{ rotate: "-4deg" }],
  },
  // 가로 카드는 글이 사진 위에 얹힌다. 밝은 사진에서도 읽히도록 아래를 어둡게 깐다.
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "56%" },
  copy: { paddingTop: 10, gap: 2 },
  copyOver: { position: "absolute", left: 10, right: 10, bottom: 10, paddingTop: 0 },
  // 네컷의 아래 여백. 사진관에서 뽑은 것처럼 가운데로 모은다.
  copyBand: { paddingTop: 8, alignItems: "center", gap: 1 },
  copyBandNarrow: { paddingTop: 5 },
  bandLine: { alignItems: "center" },
  title: { fontSize: 17, lineHeight: 24, fontFamily: typo.title.family },
  titleCut: { fontSize: 12, lineHeight: 16 },
  meta: { fontSize: 11, lineHeight: 16, fontFamily: typo.label.family },
  caption: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  hand: { fontStyle: "italic" },
  brand: { fontSize: 7, letterSpacing: 1.6, marginTop: 2, fontFamily: typo.label.family },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 },
  statValue: { fontSize: 14, fontFamily: typo.title.family },
  statLabel: { fontSize: 10, fontFamily: typo.label.family },
});
