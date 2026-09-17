/**
 * 기념 카드 꾸미기 도구 — 카드를 크게 띄우고 그 아래에서 네 갈래로 고친다.
 *
 * 창을 스스로 열지 않는다. 사진을 크게 보는 창(`PhotoViewer.tsx`)이 「꾸미기」를
 * 누르면 그 자리에서 이것을 펼친다. 사진과 카드가 다른 창이면 한 장을 카드로
 * 만들다 말고 나갔다 들어오게 된다. 보던 사진이 그대로 카드가 되어야 한다.
 *
 * 갈래는 넷이다. 예전에는 「카드 설정 고치기」 시트에 틀·사진·글이 있고 스티커만
 * 전용 화면에 있었다. 같은 카드를 두 군데서 고치는 셈이라 무엇이 어디 있는지
 * 외워야 했다. 카드를 보면서 고치는 것이 전부 여기 있다.
 *   모양 — 프레임·비율·프레임 색·날짜 도장·사진 설명
 *   사진 — 어떤 사진을 몇 번째 칸에 넣을지
 *   글 — 제목·한 줄 설명·넣을 항목·통계
 *   스티커 — 붙이기·크기·회전·순서·삭제·글자
 *
 * 부르는 말은 「프레임」으로 맞췄다. 「틀」은 뜻은 맞지만 이 자리에서 무엇을
 * 가리키는지 바로 오지 않고, 네컷 사진을 찍어 본 사람이 실제로 쓰는 말은
 * 프레임이다. 다만 갈래 이름까지 「프레임」으로 하면 그 안에 비율·프레임 색이
 * 같이 있는 것이 어색해서, 갈래는 그것들을 다 덮는 「모양」으로 둔다.
 *
 * 지키는 것 셋.
 *   1. 어느 갈래에서도 카드가 통째로 보인다. 남는 칸을 재서 카드를 그만큼 줄인다
 *      (`fitScaleOf`). 도구 칸은 높이를 고정해서 갈래를 바꿔도 카드가 튀지 않는다.
 *   2. 끄는 동안 다시 그리지 않는다. 움직이는 스티커만 `Animated` 로 밀고
 *      (`KeepsakeCardView` 의 `DecorItem`), 손을 뗄 때 한 번 상태로 올린다.
 *   3. 자리는 카드 크기에 대한 비율로만 들고 있는다. 줄여 보여 줘도 내보낸
 *      그림에서 같은 자리에 찍힌다.
 */

import { memo, useCallback, useMemo, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
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
  removeDecor,
  setDecorSize,
  setDecorText,
  DECOR_MAX,
  DECOR_TEXT_MAX,
  KEEPSAKE_PALETTE,
  type CardDecor,
  type KeepsakeSticker,
} from "./cardDecor";
import { Chip, ChipRow as SharedChipRow } from "./ui/Chip";
import type { AppTheme } from "./theme";
import { onAccent } from "./theme/colors";
import { 높이, 모서리, 여백, 누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";
import {
  isCutStyle,
  keepsakePhotoFullReason,
  keepsakeSizeOf,
  moveKeepsakePhoto,
  toggleKeepsakePhoto,
  KEEPSAKE_MAX_PHOTOS,
  KEEPSAKE_FRAME_COLORS,
  KEEPSAKE_PARTS,
  KEEPSAKE_RATIOS,
  KEEPSAKE_STAT_KINDS,
  KEEPSAKE_STYLES,
  type KeepsakeCard,
  type KeepsakeFrameColor,
  type KeepsakePart,
  type KeepsakeRatio,
  type KeepsakeStatKind,
  type KeepsakeStyle,
} from "./tripCard";

/** 카드를 띄울 칸의 안쪽 여백. 카드가 화면 끝에 붙지 않게 한다. */
const STAGE_PAD = 16;

/** 어두운 바탕 위의 글자. 사진 창과 같은 값을 쓴다. */
const INK = "#F6F4F1";
const INK_SOFT = "rgba(255,255,255,0.80)";
const INK_FAINT = "rgba(255,255,255,0.42)";
const PANEL = "#17161C";
const CHIP = "#26252E";
/** 꺼진 칩의 테두리. 채움만으로는 어두운 바탕에서 칩인지 바탕인지 알 수 없다. */
const CHIP_EDGE = "#3C3A47";
const ACCENT = "#A7B3EE";

/** 도구의 네 갈래. 값이 곧 탭에 적히는 말이다. */
export const CARD_TOOL_TABS = ["모양", "사진", "글", "스티커"] as const;
export type CardToolTab = (typeof CARD_TOOL_TABS)[number];

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
}: {
  options: readonly string[];
  chosen: (option: string) => boolean;
  accent: string;
  /** 고른 칩의 글자색. 강조색 위에서 읽히는 값이라 테마가 정한다. */
  accentInk: string;
  onPress: (option: string) => void;
}) {
  return (
    <SharedChipRow>
      {options.map((option) => {
        const on = chosen(option);
        return (
          <Chip
            key={option}
            label={option}
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
}: {
  card: KeepsakeCard;
  photos: CardPhoto[];
  text: { title: string; meta: string; caption: string; people: string };
  stats: { label: string; value: string }[];
  stamp: string;
}) {
  const [칸, 칸재기] = useState({ width: 0, height: 0 });
  const size = keepsakeSizeOf(card.ratio, card.style);
  const scale = fitScaleOf(size.width, size.height, 칸.width - STAGE_PAD * 2, 칸.height - STAGE_PAD * 2);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    칸재기((지금) => (지금.width === width && 지금.height === height ? 지금 : { width, height }));
  }, []);
  return (
    <View style={styles.stage} onLayout={onLayout} accessibilityLabel={`${text.title || "기념 카드"} 크게 보기`}>
      {칸.width > 0 && (
        <ScaledCard scale={scale} width={size.width} height={size.height}>
          <KeepsakeCardView
            card={card}
            photos={photos}
            text={text}
            stats={stats}
            stamp={stamp}
            big={false}
          />
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
  const [tab, setTab] = useState<CardToolTab>("모양");
  const [고른_것, 고르기] = useState("");
  /** 차례를 옮기려고 고른 사진. 「사진」 갈래에서만 쓴다. */
  const [옮길_사진, 옮길_사진_고르기] = useState("");
  const [칸, 칸재기] = useState({ width: 0, height: 0 });

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
  const scale = exporting
    ? 1
    : fitScaleOf(size.width, size.height, 칸.width - STAGE_PAD * 2, 칸.height - STAGE_PAD * 2);
  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    칸재기((지금) => (지금.width === width && 지금.height === height ? 지금 : { width, height }));
  }, []);

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
  const edit = useMemo(
    () => (readOnly ? undefined : { selectedId: 고른_것, scale, onSelect: 고르기, onMove, onResize, onRemove }),
    [readOnly, 고른_것, scale, onMove, onResize, onRemove],
  );
  const 고른_줄 = card.decor.find((하나) => 하나.id === 고른_것);
  const 네컷 = isCutStyle(card.style);
  const 꽉_참 = keepsakePhotoFullReason(card.photoIds);
  const 스티커_꽉_참 = card.decor.length >= DECOR_MAX;

  const 붙이기 = (kind: KeepsakeSticker | "글자") => {
    if (card.decor.length >= DECOR_MAX) return;
    // 새 목록을 먼저 만들고 그것을 넘긴다. 상태를 고치는 함수 안에서 고르면
    // React 가 그 함수를 두 번 부를 때 엉뚱한 것이 골라진다.
    const 다음 = addDecor(card.decor, kind, kind === "글자" ? "여기에 적기" : "");
    onDecor(() => 다음);
    고르기(다음[다음.length - 1].id);
  };
  const 고친다 = (바꿈: (list: CardDecor[], id: string) => CardDecor[]) => {
    if (!고른_것) return;
    onDecor((지금) => 바꿈(지금, 고른_것));
  };
  const 넣고_빼기 = <T extends string>(고른_목록: readonly T[], 값: T): T[] =>
    고른_목록.includes(값) ? 고른_목록.filter((하나) => 하나 !== 값) : [...고른_목록, 값];

  return (
    <>
      <View style={styles.stage} onLayout={onStageLayout} accessibilityLabel="꾸미는 카드">
        {칸.width > 0 && (
          <ScaledCard scale={scale} width={size.width} height={size.height}>
            <KeepsakeCardView
              shotRef={shotRef}
              card={card}
              photos={drawPhotos}
              text={text}
              stats={stats}
              stamp={stamp}
              big={exporting}
              edit={edit}
              // 내보내는 동안에는 끈다. 빈 칸이 그림으로 찍히면 고장 난 카드가 된다.
              showEmptySlots={!exporting && !readOnly}
              onPickSlot={() => setTab("사진")}
              onPhotoReady={onPhotoReady}
            />
          </ScaledCard>
        )}
      </View>

      {readOnly ? (
        <View style={styles.readOnly}>
          <Text style={styles.readOnlyText}>{readOnlyHint || "만든 사람과 관리자만 이 카드를 고칠 수 있어요"}</Text>
        </View>
      ) : (
        <>
          <View style={styles.tabs}>
            {CARD_TOOL_TABS.map((하나) => {
              const on = tab === 하나;
              return (
                <Pressable
                  key={하나}
                  onPress={() => setTab(하나)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${하나} 고치기`}
                  hitSlop={누름여유(높이.칩)}
                  style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}
                >
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{하나}</Text>
                </Pressable>
              );
            })}
          </View>

          {/*
            도구 칸의 높이를 고정한다. 갈래마다 줄 수가 달라 칸이 늘었다 줄면 그때마다
            카드가 다시 맞춰져 위아래로 튄다. 넘치는 갈래는 이 안에서 밀어 본다.
          */}
          <View style={styles.panel}>
            <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelPad} keyboardShouldPersistTaps="handled">
              {tab === "모양" && (
                <>
                  <PanelLabel text="프레임" />
                  <ChipRow
                    options={KEEPSAKE_STYLES}
                    chosen={(option) => option === card.style}
                    accent={accent}
                    accentInk={accentInk}
                    onPress={(option) => tune({ style: option as KeepsakeStyle })}
                  />
                  {Boolean(suggest) && (
                    <Pressable onPress={() => tune({ style: suggest as KeepsakeStyle })} style={styles.suggest}>
                      <Text style={styles.suggestText}>
                        사진 {card.photoIds.length}장이면 「{suggest}」 프레임이 어울려요 · 누르면 바꿔요
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
                        onPress={(option) => tune({ ratio: option as KeepsakeRatio })}
                      />
                    </>
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
                      />
                      <Toggle
                        label="날짜 도장"
                        on={card.dateStamp}
                        accent={accent}
                        onPress={() => tune({ dateStamp: !card.dateStamp })}
                      />
                      <Toggle
                        label="사진 설명 넣기"
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
                              ? `${photo.caption || "사진"}을 카드에서 빼기`
                              : `${photo.caption || "사진"}을 카드에 넣기`}
                            style={[
                              styles.pick,
                              { backgroundColor: photo.color },
                              차례 >= 0 && { borderColor: accent },
                              막힘 && styles.pickBlocked,
                            ]}
                          >
                            {Boolean(uri) && <Image source={{ uri }} resizeMode="cover" style={styles.fill} />}
                            {차례 >= 0 && card.photoIds.length > 1 && (
                              <View style={styles.pickOrder}>
                                <Text style={styles.pickOrderText}>{차례 + 1}</Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                  {/* 고른 차례가 곧 카드에 놓이는 차례다. 바꾸려고 전부 뺐다가 다시
                      고르게 하지 않는다. 스티커의 「앞으로·뒤로」와 같은 결이다. */}
                  {card.photoIds.length > 1 && (
                    <>
                      <PanelLabel text="카드에 놓이는 차례" />
                      <View style={styles.chipRow}>
                        {card.photoIds.map((id, 차례) => {
                          const photo = allPhotos.find((하나) => 하나.id === id);
                          const uri = thumbs[id] ?? photo?.uri;
                          const on = id === 옮길_사진;
                          return (
                            <Pressable
                              key={`order-${id}`}
                              onPress={() => 옮길_사진_고르기(on ? "" : id)}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={`${차례 + 1}번째 사진 고르기`}
                              style={[
                                styles.pick,
                                { backgroundColor: photo?.color ?? CHIP },
                                on && { borderColor: accent },
                              ]}
                            >
                              {Boolean(uri) && <Image source={{ uri }} resizeMode="cover" style={styles.fill} />}
                              <View style={styles.pickOrder}>
                                <Text style={styles.pickOrderText}>{차례 + 1}</Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                      {Boolean(옮길_사진) && (
                        <View style={[styles.chipRow, styles.orderTools]}>
                          <Tool
                            label="앞으로"
                            onPress={() => tune({ photoIds: moveKeepsakePhoto(card.photoIds, 옮길_사진, true) })}
                          />
                          <Tool
                            label="뒤로"
                            onPress={() => tune({ photoIds: moveKeepsakePhoto(card.photoIds, 옮길_사진, false) })}
                          />
                        </View>
                      )}
                    </>
                  )}
                  <Text style={styles.panelHint}>
                    {꽉_참
                      || notice
                      || (card.photoIds.length > 1
                        ? "차례를 바꾸려면 위에서 사진을 누르고 앞뒤로 옮겨요"
                        : "누른 차례가 카드에 놓이는 차례예요")}
                  </Text>
                </>
              )}

              {tab === "글" && (
                <>
                  {/* 켜고 끄는 줄을 제목보다 위에 둔다. 아래에 있으면 제목을 다 적고
                      저장할 때까지 지나치고, 「적었는데 왜 카드에 없지」가 된다. */}
                  <PanelLabel text="카드에 넣을 것" />
                  <ChipRow
                    options={KEEPSAKE_PARTS}
                    chosen={(option) => card.parts.includes(option as KeepsakePart)}
                    accent={accent}
                    accentInk={accentInk}
                    onPress={(option) => tune({ parts: 넣고_빼기(card.parts, option as KeepsakePart) })}
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
                    <Text style={styles.panelWarn}>위 「카드에 넣을 것」에서 이름을 켜야 카드에 보여요</Text>
                  )}
                  <PanelLabel text="한 줄 설명" />
                  <TextInput
                    value={card.caption}
                    onChangeText={(값) => tune({ caption: 값 })}
                    placeholder="사진과 함께 남길 말을 적어보세요"
                    placeholderTextColor={INK_FAINT}
                    maxLength={200}
                    accessibilityLabel="카드에 적을 한 줄 설명"
                    style={styles.field}
                  />
                  {!card.parts.includes("문구") && (
                    <Text style={styles.panelWarn}>위 「카드에 넣을 것」에서 문구를 켜야 카드에 보여요</Text>
                  )}
                </>
              )}

              {tab === "스티커" && (
                <>
                  {/* 서른 개까지다. 예전에는 꽉 찬 뒤 눌러도 아무 일이 없어서
                      고장인지 한도인지 알 수 없었다. */}
                  <PanelLabel text={`붙일 것 · ${card.decor.length} / ${DECOR_MAX}`} />
                  <View style={styles.paletteRow}>
                    {KEEPSAKE_PALETTE.map((sticker) => (
                      <Pressable
                        key={sticker}
                        onPress={() => 붙이기(sticker)}
                        disabled={스티커_꽉_참}
                        accessibilityRole="button"
                        accessibilityLabel={`${sticker} 스티커 붙이기`}
                        accessibilityState={{ disabled: 스티커_꽉_참 }}
                        style={({ pressed }) => [styles.palette, 스티커_꽉_참 && styles.pickBlocked, pressed && styles.pressed]}
                      >
                        <Glyph name={STICKER_LOOK[sticker].glyph} size={22} color={STICKER_LOOK[sticker].color} />
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => 붙이기("글자")}
                      disabled={스티커_꽉_참}
                      accessibilityRole="button"
                      accessibilityLabel="글자 붙이기"
                      accessibilityState={{ disabled: 스티커_꽉_참 }}
                      style={({ pressed }) => [
                        styles.palette,
                        styles.paletteWide,
                        스티커_꽉_참 && styles.pickBlocked,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.paletteText}>글자</Text>
                    </Pressable>
                  </View>
                  {/* 크기·각도·떼기는 전부 스티커 위 손잡이로 옮겼다(`KeepsakeCardView`).
                      버튼 줄이 화면 맨 아래에 있으면 눈이 카드와 줄 사이를 오가야 하고,
                      각도를 15도씩 눌러 맞추는 것은 「기울인다」는 일과 손놀림이 달랐다.
                      여기 남는 것은 무엇을 하면 되는지 알려 주는 한 줄과 글자 고치기뿐이다. */}
                  <PanelLabel
                    text={스티커_꽉_참
                      ? `${DECOR_MAX}개를 다 붙였어요. 빼려면 카드에서 눌러 고르고 ✕ 를 누르세요`
                      : 고른_줄
                        ? "끌어서 옮기고, 오른쪽 아래 ⤢ 를 끌어 크기와 각도를 바꿔요 · ✕ 로 떼요"
                        : card.decor.length
                          ? "카드에서 스티커를 눌러 고르거나 끌어서 옮겨요"
                          : "위에서 눌러 카드에 붙이고, 붙인 것은 끌어서 옮겨요"}
                  />
                  {고른_줄?.kind === "글자" && (
                    <TextInput
                      value={고른_줄.text}
                      onChangeText={(값) => 고친다((l, id) => setDecorText(l, id, 값))}
                      placeholder="카드에 적을 짧은 말"
                      placeholderTextColor={INK_FAINT}
                      maxLength={DECOR_TEXT_MAX}
                      accessibilityLabel="카드에 적을 글"
                      style={styles.field}
                    />
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </>
      )}
    </>
  );
}

/** 고른 것을 만지는 단추. 위험한 것(삭제)만 다른 색이다. */
function Tool({ label, tone, onPress }: { label: string; tone?: "위험"; onPress: () => void }) {
  return (
    <Chip
      label={label}
      on={false}
      onPress={onPress}
      colors={tone === "위험"
        ? { background: "#4A2320", border: "#6A3430", text: "#E7A79F" }
        : { background: CHIP, border: CHIP_EDGE, text: INK }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  pressed: { opacity: 0.65 },
  // 남는 칸을 다 쓴다. 이 칸의 크기로 카드를 얼마나 줄일지 정한다.
  stage: { flex: 1, alignItems: "center", justifyContent: "center", padding: STAGE_PAD },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingBottom: 9 },
  tab: {
    flex: 1,
    height: 높이.칩,
    justifyContent: "center",
    borderRadius: 모서리.버튼,
    alignItems: "center",
    backgroundColor: "#1C1B22",
  },
  tabOn: { backgroundColor: "#2E2D3A" },
  tabText: { fontSize: 12.5, color: INK_FAINT, fontFamily: typo.label.family },
  tabTextOn: { color: ACCENT, fontFamily: typo.title.family },
  // 갈래를 바꿔도 카드가 튀지 않게 높이를 잡아 둔다.
  panel: {
    minHeight: 196,
    backgroundColor: PANEL,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#26252D",
  },
  panelScroll: { maxHeight: 196 },
  panelPad: { paddingHorizontal: 14, paddingBottom: 16 },
  panelLabel: { fontSize: 11.5, color: INK_FAINT, marginBottom: 8, marginTop: 13, fontFamily: typo.label.family },
  panelHint: { fontSize: 11.5, color: INK_FAINT, marginTop: 9, lineHeight: 16, fontFamily: typo.caption.family },
  // 「지금 카드에 안 나오고 있다」는 말. 흐린 설명과 같은 색이면 설명으로 읽혀 지나친다.
  panelWarn: { fontSize: 11.5, color: "#F0C27A", marginTop: 8, lineHeight: 16, fontFamily: typo.label.family },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
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
  // 사진 칸은 누르는 것이기 전에 그림이다. 44 로 줄이면 무엇이 찍혔는지 안 보여서
  // 토큰 높이를 따르지 않는다. 모서리만 버튼과 맞춘다.
  pick: { width: 54, height: 54, borderRadius: 모서리.버튼, borderWidth: 2, borderColor: "transparent", overflow: "hidden" },
  // 꽉 차서 더 못 고르는 사진. 눌리지 않는다는 것이 눈에 보여야 한다.
  pickBlocked: { opacity: 0.35 },
  orderTools: { marginTop: 8 },
  // 고른 차례. 두 장 이상일 때만 보인다.
  pickOrder: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,16,15,0.7)",
  },
  pickOrderText: { fontSize: 10, color: "#FFFFFF", fontFamily: typo.label.family },
  paletteRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  palette: {
    width: 높이.버튼,
    height: 높이.버튼,
    borderRadius: 모서리.버튼,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHIP,
  },
  paletteWide: { width: 높이.버튼 + 12 },
  paletteText: { fontSize: 13, color: INK, fontFamily: typo.label.family },
  // 남이 만든 카드. 도구 자리에 왜 못 고치는지만 적는다.
  readOnly: { minHeight: 64, justifyContent: "center", paddingHorizontal: 20, paddingBottom: 12 },
  readOnlyText: { fontSize: 12, color: INK_FAINT, textAlign: "center", fontFamily: typo.caption.family },
});
