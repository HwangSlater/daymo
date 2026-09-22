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

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, PanResponder, Pressable, StyleSheet, View } from "react-native";

import { Text } from "./AppText";
import { Glyph, type GlyphName } from "./Glyph";
import {
  clampDecorSpot,
  decorBoxOf,
  type CardDecor,
  type KeepsakeSticker,
} from "./cardDecor";
import { typo } from "./theme/typography";
import {
  isBareStyle,
  isCutStyle,
  keepsakeFrameOf,
  keepsakeRowSlots,
  keepsakeSizeOf,
  keepsakeSlotCaption,
  type KeepsakeCard,
  type KeepsakeFrameColor,
} from "./tripCard";

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

/** 스티커마다의 그림과 색. 사진 위에 찍히므로 색은 진하게 둔다. */
export const STICKER_LOOK: Record<KeepsakeSticker, { glyph: GlyphName; color: string }> = {
  하트: { glyph: "heart", color: "#E2665C" },
  별: { glyph: "star", color: "#F0B93F" },
  비행기: { glyph: "plane", color: "#F8F5F0" },
  필름: { glyph: "film", color: "#F8F5F0" },
  말풍선: { glyph: "speech", color: "#8FC8D8" },
  체크: { glyph: "checkSeal", color: "#7FBF6A" },
  꽃: { glyph: "flower", color: "#E9899B" },
  구름: { glyph: "cloud", color: "#D5E7F4" },
  반짝: { glyph: "sparkle", color: "#F2D479" },
};

/**
 * 사진 위에 글을 얹을 때 까는 아래쪽 그늘.
 *
 * 한 겹짜리 판으로 깔면 그 윗변이 사진을 가로지르는 금으로 보인다. 세로로 긴
 * 카드에서 특히 눈에 띈다. 옅은 띠를 높이만 달리해 여러 겹 포개 아래로 갈수록
 * 짙어지게 한다. 그림(SVG)이 아니라 판이라 내보낼 때 찍히는 모습이 화면과 같다.
 */
const SCRIM_BANDS = [56, 44, 34, 26, 19, 13, 8];

function Scrim() {
  return (
    <>
      {SCRIM_BANDS.map((높이) => (
        <View key={높이} style={[styles.scrimBand, { height: `${높이}%` }]} pointerEvents="none" />
      ))}
    </>
  );
}

export const lookOf = (card: KeepsakeCard): KeepsakeLook =>
  isCutStyle(card.style)
    ? KEEPSAKE_FRAME_LOOK[card.frameColor]
    : KEEPSAKE_LOOK[card.style as "없음" | "필름" | "엽서" | "스크랩북"];

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
};

/** 손잡이를 화면에서 몇 px 로 보이게 할지. 카드가 줄어든 만큼 되돌려 그린다. */
const HANDLE = 26;

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
  edit,
}: {
  decor: CardDecor;
  cardWidth: number;
  cardHeight: number;
  edit?: DecorEdit;
}) {
  // 글자는 글이 차지하는 너비를 재서 그만큼만 상자로 잡는다. 카드 너비만큼
  // 잡아 두면 눈에 안 보이는 띠가 카드를 가로질러 다른 스티커를 못 잡는다.
  const [글자폭, 글자폭재기] = useState(0);
  const box = decorBoxOf(decor, cardWidth, cardHeight, 글자폭 || undefined);
  const left = box.cx - box.width / 2;
  const top = box.cy - box.height / 2;
  // 처음 한 번만 만든다. 이 뒤로는 손가락 이벤트가 직접 민다.
  const [spot] = useState(() => new Animated.ValueXY({ x: left, y: top }));
  // 손가락 이벤트에서 읽는 값. 렌더 중에는 읽지 않는다.
  const 지금 = useRef({ decor, cardWidth, cardHeight, left, top, edit, 글자폭 });
  const 잡은_곳 = useRef({ left, top });
  /** 끄는 동안 마지막으로 그린 가운데 자리(비율). 손을 뗄 때 이것을 올린다. */
  const 끈_자리 = useRef({ x: decor.x, y: decor.y });

  useEffect(() => {
    지금.current = { decor, cardWidth, cardHeight, left, top, edit, 글자폭 };
    spot.setValue({ x: left, y: top });
  }, [decor, cardWidth, cardHeight, left, top, edit, 글자폭, spot]);

  const pan = useMemo(() => {
    // PanResponder 가 이 콜백들을 손가락 이벤트 때만 부른다. ref 는 렌더 중에 읽지 않는다.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => Boolean(지금.current.edit),
      onMoveShouldSetPanResponder: () => Boolean(지금.current.edit),
      onPanResponderGrant: () => {
        잡은_곳.current = { left: 지금.current.left, top: 지금.current.top };
        끈_자리.current = { x: 지금.current.decor.x, y: 지금.current.decor.y };
        지금.current.edit?.onSelect(지금.current.decor.id);
      },
      onPanResponderMove: (_, gesture) => {
        const 상태 = 지금.current;
        const 배 = 상태.edit?.scale || 1;
        const 상자 = decorBoxOf(상태.decor, 상태.cardWidth, 상태.cardHeight);
        const 자리 = clampDecorSpot(
          상태.decor,
          (잡은_곳.current.left + gesture.dx / 배 + 상자.width / 2) / 상태.cardWidth,
          (잡은_곳.current.top + gesture.dy / 배 + 상자.height / 2) / 상태.cardHeight,
          상태.cardWidth,
          상태.cardHeight,
        );
        끈_자리.current = 자리;
        spot.setValue({
          x: 자리.x * 상태.cardWidth - 상자.width / 2,
          y: 자리.y * 상태.cardHeight - 상자.height / 2,
        });
      },
      // 손을 뗄 때 한 번만 알린다. 화면에 이미 그려진 자리를 그대로 올린다.
      onPanResponderRelease: () => {
        지금.current.edit?.onMove(지금.current.decor.id, 끈_자리.current.x, 끈_자리.current.y);
      },
      onPanResponderTerminationRequest: () => false,
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
        const 상자 = decorBoxOf(상태.decor, 상태.cardWidth, 상태.cardHeight, 상태.글자폭 || undefined);
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
      onPanResponderMove: (_, gesture) => {
        const 상태 = 지금.current;
        const 배 = 상태.edit?.scale || 1;
        const 상자 = decorBoxOf({ ...상태.decor, size: 처음.size }, 상태.cardWidth, 상태.cardHeight, 상태.글자폭 || undefined);
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
      onPanResponderTerminationRequest: () => false,
    });
  }, []);

  const 고른_것 = edit?.selectedId === decor.id;
  const look = decor.kind === "글자" ? undefined : STICKER_LOOK[decor.kind];
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
  return (
    <Animated.View
      {...(edit ? pan.panHandlers : {})}
      accessible={Boolean(edit)}
      accessibilityLabel={decor.kind === "글자" ? `텍스트 ${decor.text}` : `${decor.kind} 스티커`}
      style={[
        styles.decor,
        {
          // 글자는 재기 전까지 너비를 비워 둔다. 그래야 글만큼만 차지한다.
          width: decor.kind === "글자" ? undefined : box.width,
          maxWidth: cardWidth,
          height: box.height,
          opacity: decor.kind === "글자" && !글자폭 ? 0 : 1,
          transform: [
            { translateX: spot.x },
            { translateY: spot.y },
            { rotate: `${decor.angle}deg` },
          ],
        },
      ]}
    >
      {look
        ? <Glyph name={look.glyph} size={box.side} color={look.color} />
        : (
          <Text
            numberOfLines={1}
            onLayout={(event) => 글자폭재기(event.nativeEvent.layout.width)}
            style={[styles.decorText, { fontSize: box.side, lineHeight: box.side * 1.35 }]}
          >
            {decor.text}
          </Text>
        )}
      {고른_것 && edit && (
        <>
          <View pointerEvents="none" style={[styles.decorRing, { borderWidth: 테두리 }]} />
          {/* 왼쪽 위는 떼기. 스티커를 끌어 옮기는 손과 부딪히지 않게 반대쪽 모서리에 둔다. */}
          <Pressable
            onPress={() => edit.onRemove(decor.id)}
            hitSlop={손잡이 / 2}
            accessibilityRole="button"
            accessibilityLabel="스티커 삭제"
            style={[styles.decorHandle, { width: 손잡이, height: 손잡이, borderRadius: 손잡이 / 2, left: -손잡이 / 2, top: -손잡이 / 2, borderWidth: 테두리 }]}
          >
            <Text style={[styles.decorHandleMark, { fontSize: 손잡이 * 0.55 }]}>✕</Text>
          </Pressable>
          {/* 오른쪽 아래는 크기와 각도. 한 손가락으로 되는 길을 먼저 둔다. */}
          <View
            {...corner.panHandlers}
            accessible
            accessibilityLabel="끌어서 크기와 회전 바꾸기"
            style={[styles.decorHandle, { width: 손잡이, height: 손잡이, borderRadius: 손잡이 / 2, right: -손잡이 / 2, bottom: -손잡이 / 2, borderWidth: 테두리 }]}
          >
            <Text style={[styles.decorHandleMark, { fontSize: 손잡이 * 0.5 }]}>⤢</Text>
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
}) {
  const look = lookOf(card);
  const size = keepsakeSizeOf(card.ratio, card.style);
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
          style={styles.cell}
        >
          <View style={[styles.cellEmpty, { borderColor: look.sub }]}>
            <Text style={[styles.cellEmptyMark, { color: look.sub }]}>＋</Text>
          </View>
        </Pressable>
      );
    }
    return (
      <View key={photo?.id ?? `blank-${내_자리}`} style={styles.cell}>
        <View style={[styles.cellPhoto, { backgroundColor: photo?.color ?? look.frame }]}>
          {photo?.uri && (
            <Image
              source={{ uri: photo.uri }}
              resizeMode="cover"
              style={styles.fill}
              onLoad={() => onPhotoReady?.(`${photo.id}:${big ? "d" : "t"}`)}
            />
          )}
          {네컷 && Boolean(stamp) && 마지막_칸 && (
            <Text style={[styles.stamp, 좁은_띠 && styles.stampSmall]}>{stamp}</Text>
          )}
        </View>
        {Boolean(설명) && (
          <Text numberOfLines={1} style={[styles.cellCaption, { color: look.sub }]}>{설명}</Text>
        )}
      </View>
    );
  };

  const copy = (
    <View style={[styles.copy, 위에_얹는다 && styles.copyOver, 네컷 && styles.copyBand, 좁은_띠 && styles.copyBandNarrow]}>
      <View style={좁은_띠 ? styles.bandLine : undefined}>
        {Boolean(text.title) && (
          <Text
            numberOfLines={좁은_띠 ? 1 : 2}
            style={[styles.title, 네컷 && styles.titleCut, { color: 위에_얹는다 ? "#F8F5F0" : look.ink }]}
          >
            {text.title}
          </Text>
        )}
        {Boolean(text.meta) && (
          <Text numberOfLines={1} style={[styles.meta, { color: 위에_얹는다 ? "#E7DFD2" : look.accent }]}>
            {text.meta}
          </Text>
        )}
      </View>
      {Boolean(text.people) && !좁은_띠 && (
        <Text numberOfLines={1} style={[styles.meta, { color: 위에_얹는다 ? "#E7DFD2" : look.sub }]}>
          {text.people}
        </Text>
      )}
      {Boolean(text.caption) && (
        <Text
          numberOfLines={2}
          style={[
            styles.caption,
            // 손글씨 느낌 한 줄. 스크랩북과 네컷 틀에서 기울여 적는다.
            (card.style === "스크랩북" || 네컷) && styles.hand,
            { color: 위에_얹는다 ? "#E7DFD2" : look.sub },
          ]}
        >
          {text.caption}
        </Text>
      )}
      {stats.length > 0 && !좁은_띠 && (
        <View style={styles.statRow}>
          {stats.map((stat) => (
            <View key={stat.label}>
              <Text style={[styles.statValue, { color: 위에_얹는다 ? "#F8F5F0" : look.ink }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: 위에_얹는다 ? "#E7DFD2" : look.sub }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}
      {네컷 && <Text style={[styles.brand, { color: look.sub }]}>Daymo</Text>}
    </View>
  );

  return (
    <View
      ref={shotRef}
      collapsable={false}
      style={[
        styles.card,
        네컷 && styles.cardCut,
        종이없음 && styles.cardBare,
        { width: size.width, height: size.height, backgroundColor: look.paper },
      ]}
    >
      {card.style === "필름" && (
        <View style={styles.filmHoles}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((hole) => (
            <View key={hole} style={[styles.filmHole, { backgroundColor: look.frame }]} />
          ))}
        </View>
      )}
      <View
        style={[
          styles.photoArea,
          card.style === "스크랩북" && styles.photoAreaTilt,
          네컷 && styles.photoAreaCut,
          종이없음 && styles.photoAreaBare,
          { borderColor: look.frame },
        ]}
      >
        {줄.map((한_줄, index) => (
          <View key={`row-${index}`} style={[styles.photoRow, 네컷 && styles.photoRowCut, 종이없음 && styles.photoRowBare]}>
            {Array.from({ length: 한_줄.count }, (_, slot) => 칸(photos[한_줄.start + slot], 한_줄.start + slot))}
          </View>
        ))}
        {card.style === "엽서" && (
          <View style={[styles.postStamp, { borderColor: look.frame, backgroundColor: look.paper }]}>
            <Text style={[styles.postStampText, { color: look.accent }]}>DAYMO</Text>
          </View>
        )}
        {card.style === "스크랩북" && <View style={styles.tape} />}
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
            edit={edit}
          />
        ))}
      </View>
    </View>
  );
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

/** 카드 한 장을 가운데에 놓는다. 시트의 미리보기가 쓴다. */
export function CardStage({ children }: { children: React.ReactNode }) {
  return <View style={styles.stage}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  // 카드는 기기 폭을 따르지 않는다. 같은 여행이 기기마다 다른 그림이 되면 안 된다.
  stage: { alignItems: "center", marginBottom: 12 },
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
  scrimBand: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(12,11,10,0.11)" },
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
