/**
 * 여행 기념 카드 — 목록과 만들기 시트, 그리고 카드 그림 그 자체.
 *
 * `WarmTripDetail.tsx` 가 이미 아주 커서 여기로 뺐다. 시트·칩 모양은 그 파일의
 * 것을 그대로 가져다 쓴다(새 디자인 언어를 들이지 않는다).
 *
 * 무엇을 어떻게 그릴지 정하는 계산은 전부 `tripCard.ts` 에 있다. 여기서는 그것이
 * 돌려준 값을 그린다. 미리보기와 내보내기가 같은 컴포넌트(`KeepsakeCardView`)를
 * 쓴다. 보이는 그대로 저장돼야 해서다.
 *
 * 무거워지기 쉬운 화면이라 몇 가지를 지킨다.
 * - 미리보기는 썸네일(480px)을 쓰고 내보낼 때만 표시본(1440px)으로 바꿔 찍는다.
 * - 칩 하나를 눌러도 시트 전체가 다시 그려지지 않게 미리보기와 꾸미기를 갈라 두고
 *   둘 다 `memo` 로 감쌌다. 넘기는 값은 `useMemo`·`useCallback` 으로 붙들어 둔다.
 * - 목록은 카드마다 대표 사진 한 장만 받는다. 나머지는 그 카드를 열 때 받는다.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as Crypto from "expo-crypto";
import { captureRef, releaseCapture } from "react-native-view-shot";

import { Text } from "./AppText";
import { Glyph, type GlyphName } from "./Glyph";
import { DaymoApiError } from "./auth";
import { downloadPhoto, isLivePhotoUri } from "./photoTransfer";
import {
  createTripCard,
  deleteTripCard,
  listTripCards,
  updateTripCard,
  type ServerTripCard,
} from "./serverData";
import { showAlert } from "./showAlert";
import type { AppTheme } from "./theme";
import { typo } from "./theme/typography";
import { COVER_BADGE, COVER_FAIL, coverToggleOf } from "./coverPhoto";
import {
  homeCardBlockedReason,
  isCutStyle,
  keepsakeAddBlockedReason,
  keepsakeBodyOf,
  keepsakeCardOf,
  keepsakeDateStamp,
  keepsakeFileName,
  keepsakeFrameOf,
  keepsakeListOf,
  keepsakeRowSlots,
  keepsakeSizeOf,
  keepsakeSlotCaption,
  keepsakeStatLines,
  keepsakeStickerSpots,
  keepsakeTextOf,
  suggestedStyleOf,
  toggleKeepsakePhoto,
  KEEPSAKE_FRAME_COLORS,
  KEEPSAKE_PARTS,
  KEEPSAKE_RATIOS,
  KEEPSAKE_STAT_KINDS,
  KEEPSAKE_STICKERS,
  KEEPSAKE_STYLES,
  type KeepsakeCard,
  type KeepsakeCorner,
  type KeepsakeFrameColor,
  type KeepsakePart,
  type KeepsakeRatio,
  type KeepsakeStatKind,
  type KeepsakeSticker,
  type KeepsakeStyle,
} from "./tripCard";
import { shareTripCard } from "./tripCardExport";

/** 카드에 올릴 수 있는 사진 한 장. 기록 탭의 사진에서 필요한 것만 가려 받는다. */
export type CardPhoto = {
  id: string;
  color: string;
  caption: string;
  uri?: string;
};

/** 카드에 실을 숫자. 기록 탭이 세어 넘긴다. */
export type CardCounts = {
  places: number;
  photos: number;
  days: number;
  /** 통화까지 붙인 지출 합. */
  spent: string;
};

type KeepsakeLook = { paper: string; ink: string; sub: string; accent: string; frame: string };

/** 카드 스타일마다의 색. 사진 위에 글씨가 얹힐 수 있어 어느 스타일이든 대비가 세야 한다. */
const KEEPSAKE_LOOK: Record<"필름" | "엽서" | "스크랩북", KeepsakeLook> = {
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
const STICKER_LOOK: Record<KeepsakeSticker, { glyph: GlyphName; color: string }> = {
  하트: { glyph: "heart", color: "#E2665C" },
  별: { glyph: "star", color: "#F0B93F" },
  비행기: { glyph: "plane", color: "#F8F5F0" },
  필름: { glyph: "film", color: "#F8F5F0" },
  말풍선: { glyph: "speech", color: "#8FC8D8" },
  체크: { glyph: "checkSeal", color: "#7FBF6A" },
};

/** 스티커가 붙는 모서리. 사진 안쪽으로 살짝 들여 붙인다. */
const CORNER_SPOT: Record<KeepsakeCorner, { top?: number; bottom?: number; left?: number; right?: number }> = {
  좌상: { top: 4, left: 4 },
  우상: { top: 4, right: 4 },
  좌하: { bottom: 4, left: 4 },
  우하: { bottom: 4, right: 4 },
};

const lookOf = (card: KeepsakeCard): KeepsakeLook =>
  isCutStyle(card.style)
    ? KEEPSAKE_FRAME_LOOK[card.frameColor]
    : KEEPSAKE_LOOK[card.style as "필름" | "엽서" | "스크랩북"];

/**
 * 사진 썸네일을 받아 둔다.
 *
 * 한 번에 셋까지만 받고, 이미 받은 것은 다시 받지 않는다. 카드가 스무 장이면
 * 사진이 여든 장이라 한꺼번에 부르면 목록을 넘기는 것부터 걸린다.
 *
 * 서버에 없는 사진(이 기기에서 막 고른 것, 예시 여행)은 받지 못한다. 그때는
 * 부르는 쪽이 사진 자신의 주소를 그대로 쓴다.
 */
function usePhotoThumbs(ids: readonly string[]): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const 물어본_것 = useRef(new Set<string>());
  const 열쇠 = ids.join("|");
  useEffect(() => {
    let 살아있다 = true;
    const 남은_것 = 열쇠.split("|").filter((id) => id && !물어본_것.current.has(id));
    if (!남은_것.length) return;
    남은_것.forEach((id) => 물어본_것.current.add(id));
    const 일꾼 = async () => {
      for (let id = 남은_것.shift(); id; id = 남은_것.shift()) {
        const uri = await downloadPhoto(id, "thumbnail").catch(() => undefined);
        if (!살아있다) return;
        if (uri) setThumbs((current) => ({ ...current, [id as string]: uri }));
      }
    };
    void Promise.all([일꾼(), 일꾼(), 일꾼()]);
    return () => {
      살아있다 = false;
    };
  }, [열쇠]);
  return thumbs;
}

/**
 * 내보낼 카드 그 자체. 미리보기와 내보내기가 이 하나를 같이 쓴다. 보이는 대로 저장된다.
 *
 * 너비를 고정한다. 기기 폭에 따라 카드가 늘어나면 같은 여행이 기기마다 다른 그림이
 * 되고, 웹에서 찍은 것과 폰에서 찍은 것이 달라진다. 내보낼 때만 `captureRef` 가
 * 1080px 쪽으로 키운다.
 *
 * 가로 카드는 글을 사진 아래에 두면 사진이 띠처럼 얇아져서, 사진 위에 얹는다.
 * 네컷 틀은 사진관에서 뽑는 그것이라 아래 여백에 이름·날짜·`Daymo` 를 둔다.
 */
const KeepsakeCardView = memo(function KeepsakeCardView({
  shotRef,
  card,
  photos,
  text,
  stats,
  stamp,
  big,
  onPhotoReady,
}: {
  shotRef: React.RefObject<View | null>;
  card: KeepsakeCard;
  /** 고른 차례대로의 사진. 파일을 아직 못 받았으면 색만 깔린다. */
  photos: { id: string; color: string; caption: string; uri?: string }[];
  text: { title: string; meta: string; caption: string; people: string };
  stats: { label: string; value: string }[];
  /** 날짜 도장에 찍을 글. 껐으면 빈 글자다. */
  stamp: string;
  /** 내보내는 중인지. 그때만 표시본을 그린다. 미리보기는 썸네일이다. */
  big: boolean;
  /** 사진 한 장이 다 그려졌을 때. 웹의 blob: 주소는 다 받기 전에 찍으면 빈 칸이 찍힌다. */
  onPhotoReady?: (key: string) => void;
}) {
  const look = lookOf(card);
  const size = keepsakeSizeOf(card.ratio, card.style);
  const 네컷 = isCutStyle(card.style);
  const 위에_얹는다 = !네컷 && card.ratio === "가로";
  const frame = useMemo(() => keepsakeFrameOf(card.style, photos.length), [card.style, photos.length]);
  const spots = useMemo(
    () => (네컷 ? keepsakeStickerSpots(card.stickers, frame.slots) : []),
    [네컷, card.stickers, frame.slots],
  );
  const 좁은_띠 = card.style === "네컷 가로";
  // 줄마다 몇 번째 사진부터인지. 그리면서 세면 같은 사진이 두 칸에 들어간다.
  const 줄 = useMemo(() => keepsakeRowSlots(frame.rows), [frame.rows]);

  const 칸 = (photo: (typeof photos)[number] | undefined, 내_자리: number) => {
    const 설명 = 네컷 ? keepsakeSlotCaption(photo?.caption, card.photoCaptions) : "";
    const 마지막_칸 = 내_자리 === frame.slots - 1;
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
          {네컷 && spots.filter((자리표) => 자리표.slot === 내_자리).map((자리표) => (
            <View key={자리표.sticker} style={[styles.sticker, CORNER_SPOT[자리표.corner]]}>
              <Glyph name={STICKER_LOOK[자리표.sticker].glyph} size={좁은_띠 ? 12 : 16} color={STICKER_LOOK[자리표.sticker].color} />
            </View>
          ))}
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
    <View style={styles.stage}>
      <View
        ref={shotRef}
        collapsable={false}
        style={[
          styles.card,
          네컷 && styles.cardCut,
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
            { borderColor: look.frame },
          ]}
        >
          {줄.map((한_줄, index) => (
            <View key={`row-${index}`} style={[styles.photoRow, 네컷 && styles.photoRowCut]}>
              {Array.from({ length: 한_줄.count }, (_, slot) => 칸(photos[한_줄.start + slot], 한_줄.start + slot))}
            </View>
          ))}
          {card.style === "엽서" && (
            <View style={[styles.postStamp, { borderColor: look.frame, backgroundColor: look.paper }]}>
              <Text style={[styles.postStampText, { color: look.accent }]}>DAYMO</Text>
            </View>
          )}
          {card.style === "스크랩북" && <View style={styles.tape} />}
          {위에_얹는다 && <View style={styles.scrim} />}
          {위에_얹는다 && copy}
        </View>
        {!위에_얹는다 && copy}
      </View>
    </View>
  );
});

/**
 * 꾸미기 목록.
 *
 * 미리보기와 갈라 두고 `memo` 로 감쌌다. 칩 하나를 눌러도 카드를 다시 그릴 뿐
 * 이 목록 전체가 다시 그려지지는 않는다.
 */
const CardTuner = memo(function CardTuner({
  card,
  photos,
  thumbs,
  theme,
  tune,
  Field,
  Option,
  Chips,
  requiredDot,
}: {
  card: KeepsakeCard;
  photos: CardPhoto[];
  thumbs: Record<string, string>;
  theme?: AppTheme;
  tune: (change: Partial<KeepsakeCard>) => void;
  Field: DetailUi["Field"];
  Option: DetailUi["Option"];
  Chips: DetailUi["Chips"];
  requiredDot: DetailUi["requiredDot"];
}) {
  const 네컷 = isCutStyle(card.style);
  const 권함 = suggestedStyleOf(card.style, card.photoIds.length);
  const 켜고끄기 = useMemo(() => {
    const 켠_것: string[] = [];
    if (card.dateStamp) 켠_것.push("날짜 도장");
    if (card.photoCaptions) 켠_것.push("사진 설명");
    return 켠_것;
  }, [card.dateStamp, card.photoCaptions]);
  return (
    <>
      <View style={styles.pickField}>
        <View style={styles.pickLabelRow}>
          <View style={[styles.pickLabelDot, requiredDot("카드에 쓸 사진", theme)]} />
          <Text style={[styles.pickLabel, theme && { color: theme.text }]}>
            카드에 쓸 사진 · {card.photoIds.length}장
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
          {photos.map((photo) => {
            const 차례 = card.photoIds.indexOf(photo.id);
            const uri = thumbs[photo.id] ?? photo.uri;
            return (
              <Pressable
                key={`${photo.id}-pick`}
                onPress={() => tune({ photoIds: toggleKeepsakePhoto(card.photoIds, photo.id) })}
                accessibilityRole="button"
                accessibilityState={{ selected: 차례 >= 0 }}
                accessibilityLabel={`${photo.caption || "사진"}을 카드에 넣기`}
                style={[
                  styles.pick,
                  { backgroundColor: photo.color },
                  차례 >= 0 && styles.pickChosen,
                  차례 >= 0 && theme && { borderColor: theme.primary },
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
      </View>
      <Option
        label="카드 스타일"
        options={KEEPSAKE_STYLES}
        value={card.style}
        onChange={(value) => tune({ style: value as KeepsakeStyle })}
      />
      {Boolean(권함) && (
        <Pressable onPress={() => tune({ style: 권함 as KeepsakeStyle })} style={styles.suggest}>
          <Text style={[styles.suggestText, theme && { color: theme.primary }]}>
            사진 {card.photoIds.length}장이면 「{권함}」 이 어울려요 · 누르면 바꿔요
          </Text>
        </Pressable>
      )}
      {!네컷 && (
        <Option
          label="방향과 비율"
          options={KEEPSAKE_RATIOS}
          value={card.ratio}
          onChange={(value) => tune({ ratio: value as KeepsakeRatio })}
        />
      )}
      {네컷 && (
        <>
          <Option
            label="틀 색"
            options={KEEPSAKE_FRAME_COLORS}
            value={card.frameColor}
            onChange={(value) => tune({ frameColor: value as KeepsakeFrameColor })}
          />
          <Chips
            label="스티커"
            options={KEEPSAKE_STICKERS}
            chosen={card.stickers}
            onToggle={(value) =>
              tune({
                stickers: card.stickers.includes(value as KeepsakeSticker)
                  ? card.stickers.filter((item) => item !== value)
                  : [...card.stickers, value as KeepsakeSticker],
              })
            }
          />
          <Chips
            label="도장과 설명"
            options={["날짜 도장", "사진 설명"]}
            chosen={켜고끄기}
            onToggle={(value) =>
              tune(value === "날짜 도장" ? { dateStamp: !card.dateStamp } : { photoCaptions: !card.photoCaptions })
            }
          />
        </>
      )}
      <Chips
        label="카드에 넣을 것"
        options={KEEPSAKE_PARTS}
        chosen={card.parts}
        onToggle={(value) =>
          tune({
            parts: card.parts.includes(value as KeepsakePart)
              ? card.parts.filter((item) => item !== value)
              : [...card.parts, value as KeepsakePart],
          })
        }
      />
      {card.parts.includes("통계") && (
        <Chips
          label="어떤 숫자를 넣을까요"
          options={KEEPSAKE_STAT_KINDS}
          chosen={card.stats}
          onToggle={(value) =>
            tune({
              stats: card.stats.includes(value as KeepsakeStatKind)
                ? card.stats.filter((item) => item !== value)
                : [...card.stats, value as KeepsakeStatKind],
            })
          }
        />
      )}
      <Field
        label="카드 제목 · 선택 사항"
        value={card.title}
        onChangeText={(value) => tune({ title: value })}
        placeholder="예: 우리의 서울 주말"
      />
      <Field
        label="짧은 문구 · 선택 사항"
        value={card.caption}
        onChangeText={(value) => tune({ caption: value })}
        placeholder="사진과 함께 남길 말을 적어보세요"
        multiline
      />
    </>
  );
});

/** 목록의 카드 한 줄. 대표 사진 한 장만 받아 보여 준다. */
const CardRow = memo(function CardRow({
  label,
  color,
  uri,
  onHome,
  theme,
  onPress,
}: {
  label: string;
  color: string;
  uri?: string;
  /** 지금 홈 화면에 깔려 있는 카드인지. 목록에서 바로 보이게 표시를 단다. */
  onHome?: boolean;
  theme?: AppTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} 카드 ${onHome ? "· 홈 화면에 쓰는 중 " : ""}열기`}
      style={[styles.listRow, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
    >
      <View style={[styles.listThumb, { backgroundColor: color }]}>
        {Boolean(uri) && <Image source={{ uri }} resizeMode="cover" style={styles.fill} />}
        {onHome && (
          <View style={styles.homeBadge} pointerEvents="none">
            <Glyph name="home" size={9} color="#FFFFFF" />
            <Text style={styles.homeBadgeText}>{COVER_BADGE}</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[styles.listLabel, theme && { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
});

/** 부르는 쪽(`WarmTripDetail`)이 쓰는 시트·칩 모양. 여기서 새로 만들지 않는다. */
export type DetailUi = {
  Sheet: React.ComponentType<{
    visible: boolean;
    title: string;
    subtitle?: string;
    submit: string;
    destructiveLabel?: string;
    destructiveMessage?: string;
    readOnly?: boolean;
    readOnlyHint?: string;
    onDestructive?: () => void;
    onClose: () => void;
    onSubmit: () => void | Promise<void>;
    children: React.ReactNode;
  }>;
  Field: React.ComponentType<{
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    multiline?: boolean;
  }>;
  Option: React.ComponentType<{
    label: string;
    options: string[];
    value: string;
    onChange: (value: string) => void;
  }>;
  Chips: React.ComponentType<{
    label: string;
    options: readonly string[];
    chosen: readonly string[];
    onToggle: (value: string) => void;
  }>;
  Empty: React.ComponentType<{ title: string; description: string; action: string; onPress?: () => void }>;
  Label: React.ComponentType<{ label: string; count?: string }>;
  requiredDot: (label: string, theme?: AppTheme) => { backgroundColor: string } | undefined;
};

/**
 * 기록 탭의 「여행 기념 카드」 자리.
 *
 * 만든 카드를 목록으로 보여 주고, 누르면 그 카드로 시트를 연다. 서버 여행이면
 * 카드가 `trip_cards` 에 남아 함께 보는 사람에게도 보인다. 예시 여행은 서버에
 * 보낼 곳이 없어 이 화면에서만 산다.
 */
export function TripCardsSection({
  tripId,
  tripName,
  tripDate,
  tripRegion,
  tripStartKey,
  photos,
  participants,
  counts,
  coverCardId,
  onSaveHomeCover,
  onAddPhoto,
  canEdit,
  theme,
  notify,
  ui,
}: {
  /** 서버 여행 id. 없으면 예시 여행이라 카드가 이 화면에서만 산다. */
  tripId?: string;
  tripName: string;
  /** `10월 1일 — 3일` 같은 기간 글. 카드의 기간 줄에 쓴다. */
  tripDate: string;
  tripRegion: string;
  /** 여행 첫날(`YYYY-MM-DD`). 날짜 도장에 쓴다. */
  tripStartKey?: string;
  photos: CardPhoto[];
  participants: string[];
  counts: CardCounts;
  /** 홈 화면의 여행 카드에 통째로 깔린 카드. */
  coverCardId?: string;
  /** 홈 화면에 깔 것을 바꾼다. `localUris` 는 기기가 들고 있는 사진 자리(사진 id → 자리)다. */
  onSaveHomeCover?: (
    고른_것: { coverPhotoId: string | null } | { coverCardId: string | null },
    localUris?: Record<string, string | undefined>,
  ) => Promise<void>;
  onAddPhoto?: () => void;
  canEdit: boolean;
  theme?: AppTheme;
  notify: (message: string) => void;
  ui: DetailUi;
}) {
  const { Sheet, Empty, Label } = ui;
  // 카드에 쓸 수 있는 사진은 파일이 기기에 있는 것뿐이다. 웹의 blob: 주소는 탭을
  // 새로 열면 죽어서, 그 사진을 고르면 빈 칸이 찍힌다.
  const cardPhotos = useMemo(() => photos.filter((photo) => isLivePhotoUri(photo.uri)), [photos]);
  const photoIds = useMemo(() => cardPhotos.map((photo) => photo.id), [cardPhotos]);

  const [rows, setRows] = useState<ServerTripCard[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KeepsakeCard | null>(null);
  const [tuning, setTuning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const shot = useRef<View>(null);
  // 다 그려진 사진. 화면에 알리는 것과 캡처 전에 기다리는 것 둘 다 쓴다.
  const [drawnKeys, setDrawnKeys] = useState<string[]>([]);
  const drawn = useRef(new Set<string>());

  useEffect(() => {
    if (!tripId) return;
    let 살아있다 = true;
    listTripCards(tripId)
      .then((받은_것) => {
        if (살아있다) setRows(받은_것);
      })
      .catch(() => undefined);
    return () => {
      살아있다 = false;
    };
  }, [tripId]);

  const list = useMemo(() => keepsakeListOf(rows, tripName, photoIds), [rows, tripName, photoIds]);
  // 목록은 카드마다 대표 사진 한 장만 받는다. 나머지는 그 카드를 열 때 받는다.
  const listPhotoIds = useMemo(() => list.map((줄) => 줄.coverPhotoId).filter(Boolean), [list]);
  const open = useMemo(() => list.find((줄) => 줄.id === openId), [list, openId]);
  // 남이 만든 카드는 보기만 한다. 서버도 같은 규칙으로 막는다(사진과 같다).
  const canManage = !open || (rows.find((줄) => 줄.id === open.id)?.canManage ?? true);
  const readOnly = !canEdit || !canManage;
  const card = draft;
  const chosen = useMemo(
    () =>
      (card?.photoIds ?? [])
        .map((id) => cardPhotos.find((photo) => photo.id === id))
        .filter((photo) => photo !== undefined),
    [card?.photoIds, cardPhotos],
  );
  const 받을_사진 = useMemo(
    () => [...new Set([...listPhotoIds, ...chosen.map((photo) => photo.id)])],
    [listPhotoIds, chosen],
  );
  const thumbs = usePhotoThumbs(받을_사진);
  // 미리보기는 썸네일, 내보낼 때만 표시본. 둘 다 없으면 색만 깔린다.
  const drawPhotos = useMemo(
    () => chosen.map((photo) => ({ ...photo, uri: exporting ? photo.uri : thumbs[photo.id] ?? photo.uri })),
    [chosen, exporting, thumbs],
  );
  const text = useMemo(
    () =>
      card
        ? keepsakeTextOf(card, { name: tripName, period: tripDate, region: tripRegion, people: participants })
        : { title: "", meta: "", caption: "", people: "" },
    [card, participants, tripDate, tripName, tripRegion],
  );
  const stats = useMemo(() => (card ? keepsakeStatLines(card, counts) : []), [card, counts]);
  const stamp = useMemo(
    () => (card?.dateStamp ? keepsakeDateStamp(tripStartKey) : ""),
    [card?.dateStamp, tripStartKey],
  );
  const frame = useMemo(
    () => (card ? keepsakeFrameOf(card.style, chosen.length) : null),
    [card, chosen.length],
  );
  const blocked = keepsakeAddBlockedReason(list.length, cardPhotos.length);

  const markDrawn = useCallback((key: string) => {
    if (drawn.current.has(key)) return;
    drawn.current.add(key);
    setDrawnKeys((current) => [...current, key]);
  }, []);
  const tune = useCallback((change: Partial<KeepsakeCard>) => {
    // 사진이 바뀌면 다시 그려질 때까지 기다린다.
    if (change.photoIds) {
      drawn.current = new Set();
      setDrawnKeys([]);
    }
    setDraft((current) => (current ? { ...current, ...change } : current));
  }, []);

  const openCard = (id: string, start: KeepsakeCard) => {
    drawn.current = new Set();
    setDrawnKeys([]);
    setDraft(start);
    setOpenId(id);
    setTuning(false);
  };
  const makeCard = () => {
    if (blocked) {
      notify(blocked);
      return;
    }
    openCard("새 카드", keepsakeCardOf(undefined, tripName, photoIds));
  };
  const closeCard = () => {
    setOpenId(null);
    setDraft(null);
    setExporting(false);
  };

  const saveCard = async () => {
    const 지금 = draft;
    const 고칠_수_있다 = canManage && canEdit;
    closeCard();
    if (!지금 || !tripId || !고칠_수_있다) return;
    const body = keepsakeBodyOf(지금, tripName);
    try {
      if (open) {
        const 저장된_것 = await updateTripCard(open.id, rowVersionOf(rows, open.id), body);
        setRows((current) => current.map((줄) => (줄.id === 저장된_것.id ? 저장된_것 : 줄)));
      } else {
        const 만든_것 = await createTripCard(tripId, Crypto.randomUUID(), body);
        setRows((current) => (current.some((줄) => 줄.id === 만든_것.id) ? current : [...current, 만든_것]));
      }
      notify("기념 카드를 저장했어요");
    } catch (caught) {
      notify(
        caught instanceof DaymoApiError && caught.status === 422
          ? caught.message
          : "기념 카드를 저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요",
      );
    }
  };

  const removeCard = () => {
    const 지울_것 = open;
    if (!지울_것) return;
    showAlert("이 카드를 지울까요?", `${지울_것.label} 카드를 지워요. 사진은 그대로예요.`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          closeCard();
          setRows((current) => current.filter((줄) => 줄.id !== 지울_것.id));
          deleteTripCard(지울_것.id).catch(() => notify("카드를 지우지 못했어요. 잠시 뒤에 다시 시도해 주세요"));
          notify("기념 카드를 지웠어요");
        },
      },
    ]);
  };

  // 고른 사진이 다 그려진 뒤에만 찍는다. 파일이 없는 사진은 색만 깔리므로 기다릴 것이 없다.
  const ready = useMemo(
    () => drawPhotos.every((photo) => !photo.uri || drawnKeys.includes(`${photo.id}:t`)),
    [drawPhotos, drawnKeys],
  );

  /** 화면에 그려 둔 카드를 그대로 찍어 내보낸다. 웹은 내려받고 폰은 공유 시트로 간다. */
  const exportCard = async () => {
    if (!card || busy || !ready) return;
    setBusy(true);
    // 표시본으로 바꿔 그린 뒤에 찍는다. 미리보기 내내 1440px 사진을 들고 있지 않는다.
    setExporting(true);
    let 찍은_것: string | undefined;
    const 잰다 = Date.now();
    try {
      await 그려질_때까지(() =>
        drawPhotos.every((photo) => !photo.uri || drawn.current.has(`${photo.id}:d`)));
      const size = keepsakeSizeOf(card.ratio, card.style);
      찍은_것 = await captureRef(shot, {
        format: "png",
        result: Platform.OS === "web" ? "data-uri" : "tmpfile",
        width: size.exportWidth,
        height: size.exportHeight,
      });
      if (__DEV__) console.log(`기념 카드 캡처 ${card.style} ${Date.now() - 잰다}ms`);
      const 결과 = await shareTripCard(keepsakeFileName(text.title || tripName), 찍은_것);
      if (결과 === "unavailable") notify("이 기기에서는 카드를 내보낼 수 없어요");
      else notify(Platform.OS === "web" ? "기념 카드를 내려받았어요" : "기념 카드를 공유했어요");
    } catch {
      notify("기념 카드를 만들지 못했어요");
    } finally {
      // 찍은 그림은 여기서만 쓴다. 화면이 아직 쓰는 사진 주소는 건드리지 않는다
      // (`photoTransfer.ts` 의 liveBlobUris 규칙).
      if (찍은_것) releaseCapture(찍은_것);
      setExporting(false);
      setBusy(false);
    }
  };

  /**
   * 홈 화면에는 이 카드가 통째로 깔린다. 홈은 사진 배치만 따르고 틀 색·스티커·
   * 날짜 도장은 그리지 않는다(`WarmAppShell` 의 홈 카드).
   *
   * 저장한 카드만 깔 수 있다. 아직 저장하지 않은 카드는 서버에 없어서 다른 기기와
   * 상대에게 보일 것이 없다.
   */
  const cover = coverToggleOf(open?.id, coverCardId, "card");
  // 세로로 쌓은 카드는 홈의 가로로 넓은 자리에 담기지 않는다. 눕히거나 격자로 바꾸면
  // 만든 사람이 고른 모양과 달라지므로, 담기지 않는다고 알리고 막는다.
  //
  // 고치는 중인 값이 아니라 저장된 값으로 본다. 홈에 깔리는 것은 서버에 저장된 카드다.
  const savedSettings = open ? rows.find((줄) => 줄.id === open.id)?.settings : undefined;
  const coverBlocked = savedSettings
    ? homeCardBlockedReason(
        KEEPSAKE_STYLES.find((이름) => 이름 === savedSettings.style) ?? "필름",
        Array.isArray(savedSettings.photoIds) ? savedSettings.photoIds.length : 1,
      )
    : "";
  const toggleCover = async () => {
    if (!onSaveHomeCover || !open) return;
    if (coverBlocked && !cover.on) {
      showAlert("홈 화면에 담기지 않아요", `${coverBlocked}.`, [{ text: "알겠어요" }]);
      return;
    }
    try {
      await onSaveHomeCover(
        { coverCardId: cover.next },
        Object.fromEntries(chosen.map((photo) => [photo.id, thumbs[photo.id] ?? photo.uri])),
      );
      notify(cover.on ? "홈 화면에서 이 카드를 내렸어요" : "홈 화면에 이 카드를 깔았어요");
    } catch {
      notify(COVER_FAIL);
    }
  };

  return (
    <>
      <Label label="여행 기념 카드" count={list.length ? `${list.length}장` : undefined} />
      {cardPhotos.length === 0 ? (
        <Empty
          title="카드로 만들 사진이 없어요"
          description="사진을 한 장 추가하면 그 사진으로 기념 카드를 만들 수 있어요."
          action="사진 추가"
          onPress={canEdit ? onAddPhoto : undefined}
        />
      ) : (
        <>
          {list.length > 0 && (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={list}
              keyExtractor={(줄) => 줄.id}
              contentContainerStyle={styles.listRowGap}
              initialNumToRender={4}
              windowSize={3}
              removeClippedSubviews
              renderItem={({ item }) => (
                <CardRow
                  label={item.label}
                  color={cardPhotos.find((photo) => photo.id === item.coverPhotoId)?.color ?? "#E7DFD2"}
                  uri={thumbs[item.coverPhotoId] ?? cardPhotos.find((photo) => photo.id === item.coverPhotoId)?.uri}
                  onHome={item.id === coverCardId}
                  theme={theme}
                  onPress={() => openCard(item.id, item.card)}
                />
              )}
            />
          )}
          <Pressable
            onPress={makeCard}
            accessibilityRole="button"
            accessibilityLabel="새 기념 카드 만들기"
            style={[styles.add, theme && { borderColor: theme.primary, backgroundColor: theme.primarySoft }]}
          >
            <Text style={[styles.addText, theme && { color: theme.primary }]}>
              {list.length ? "새 카드 만들기" : "한 장으로 만들기"}
            </Text>
          </Pressable>
        </>
      )}
      <Sheet
        visible={Boolean(openId)}
        title="여행 기념 카드"
        subtitle="이대로 저장해도 되고, 아래에서 하나하나 고쳐도 돼요"
        submit={tripId && !readOnly ? "이 카드로 저장" : "닫기"}
        destructiveLabel={open && tripId && !readOnly ? "카드 삭제" : undefined}
        destructiveMessage="이 카드를 지워요. 사진은 그대로예요."
        readOnly={readOnly}
        readOnlyHint={canEdit ? "만든 사람과 관리자만 이 카드를 고칠 수 있어요" : undefined}
        onDestructive={removeCard}
        onClose={closeCard}
        onSubmit={saveCard}
      >
        {card && (
          <>
            <KeepsakeCardView
              shotRef={shot}
              card={card}
              photos={drawPhotos}
              text={text}
              stats={stats}
              stamp={stamp}
              big={exporting}
              onPhotoReady={markDrawn}
            />
            {Boolean(frame?.notice) && (
              <Text style={[styles.notice, theme && { color: theme.muted }]}>{frame?.notice}</Text>
            )}
            <Pressable
              onPress={exportCard}
              disabled={busy || !ready}
              accessibilityRole="button"
              accessibilityLabel="기념 카드를 이미지로 내보내기"
              style={[
                styles.export,
                theme && { backgroundColor: theme.primarySoft, borderColor: theme.primary },
                (busy || !ready) && styles.exportWaiting,
              ]}
            >
              <Text style={[styles.exportText, theme && { color: theme.primary }]}>
                {busy
                  ? "카드를 만드는 중이에요"
                  : !ready
                    ? "사진을 불러오는 중이에요"
                    : Platform.OS === "web" ? "이미지로 저장하기" : "이미지로 공유하기"}
              </Text>
            </Pressable>
            {Boolean(onSaveHomeCover && canEdit) && (open ? (
              <Pressable
                onPress={toggleCover}
                accessibilityRole="switch"
                accessibilityState={{ checked: cover.on, disabled: Boolean(coverBlocked) && !cover.on }}
                accessibilityLabel="이 카드를 홈 화면의 여행 카드에 쓰기"
                style={[
                  styles.cover,
                  theme && { borderColor: theme.border, backgroundColor: theme.surface },
                  cover.on && theme && { backgroundColor: theme.primarySoft, borderColor: theme.primary },
                  Boolean(coverBlocked) && !cover.on && styles.coverBlocked,
                ]}
              >
                <Glyph
                  name="home"
                  size={15}
                  color={cover.on ? theme?.primary ?? "#3F4C8F" : theme?.muted ?? "#8C8378"}
                />
                <Text style={[styles.coverText, theme && { color: cover.on ? theme.primary : theme.muted }]}>
                  {cover.label}
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.notice, theme && { color: theme.muted }]}>
                카드를 저장하면 홈 화면에 쓸 수 있어요
              </Text>
            ))}
            {!readOnly && (
              <Pressable
                onPress={() => setTuning((value) => !value)}
                accessibilityRole="button"
                accessibilityState={{ expanded: tuning }}
                style={styles.more}
              >
                <Text style={[styles.moreText, theme && { color: theme.primary }]}>
                  {tuning ? "꾸미기 접기" : "직접 꾸미기"}
                </Text>
              </Pressable>
            )}
            {tuning && !readOnly && (
              <CardTuner
                card={card}
                photos={cardPhotos}
                thumbs={thumbs}
                theme={theme}
                tune={tune}
                Field={ui.Field}
                Option={ui.Option}
                Chips={ui.Chips}
                requiredDot={ui.requiredDot}
              />
            )}
            <Text style={[styles.hint, theme && { color: theme.muted }]}>
              {tripId
                ? "꾸민 것은 여행에 저장돼 함께 보는 사람에게도 같은 카드가 보여요."
                : "예시 여행이라 꾸민 것이 저장되지 않아요. 카드는 지금 바로 내보낼 수 있어요."}
            </Text>
          </>
        )}
      </Sheet>
    </>
  );
}

const rowVersionOf = (rows: readonly ServerTripCard[], id: string) =>
  rows.find((줄) => 줄.id === id)?.version ?? 1;

/** 사진이 다 그려질 때까지 기다린다. 웹의 blob: 주소는 다 받기 전에 찍으면 빈 칸이 찍힌다. */
const 그려질_때까지 = async (다_그렸나: () => boolean) => {
  for (let 번 = 0; 번 < 60; 번 += 1) {
    if (다_그렸나()) return;
    await new Promise((멈춤) => setTimeout(멈춤, 50));
  }
};

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  // 카드는 기기 폭을 따르지 않는다. 같은 여행이 기기마다 다른 그림이 되면 안 된다.
  stage: { alignItems: "center", marginBottom: 12 },
  card: { borderRadius: 14, padding: 12, overflow: "hidden" },
  // 사진관에서 뽑는 네컷은 테두리가 얇고 모서리가 각지다.
  cardCut: { borderRadius: 6, padding: 8 },
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
  sticker: { position: "absolute" },
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
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "62%", backgroundColor: "rgba(12,11,10,0.55)" },
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
  notice: { fontSize: 12, textAlign: "center", marginBottom: 10, color: "#8C8378" },
  export: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF1FA",
    borderColor: "#3F4C8F",
    marginBottom: 16,
  },
  exportText: { fontSize: 13, color: "#3F4C8F", fontFamily: typo.label.family },
  exportWaiting: { opacity: 0.5 },
  // 홈 화면에 쓰는 줄. 켜지면 테두리·글자 색과 집 모양이 함께 바뀐다.
  cover: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E1DC",
  },
  // 담기지 않는 카드. 눌러도 되지만 왜 안 되는지 알려 줄 뿐이다.
  coverBlocked: { opacity: 0.55 },
  coverText: { flex: 1, fontSize: 13, color: "#8C8378", fontFamily: typo.label.family },
  // 목록에서 홈에 쓰는 카드에 다는 표시. 사진 위에 얹히니 어두운 바탕을 깐다.
  homeBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    height: 16,
    paddingHorizontal: 5,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(17,16,15,0.72)",
  },
  homeBadgeText: { fontSize: 9, color: "#FFFFFF", fontFamily: typo.label.family },
  more: { alignItems: "center", paddingVertical: 6, marginBottom: 8 },
  moreText: { fontSize: 13, color: "#3F4C8F", fontFamily: typo.label.family },
  hint: { fontSize: 12, lineHeight: 17, color: "#8C8378", marginTop: 4 },
  // 목록
  listRowGap: { gap: 8, paddingRight: 6, paddingVertical: 2 },
  listRow: { width: 116, borderRadius: 12, borderWidth: 1, padding: 8, backgroundColor: "#F2EFEA", borderColor: "#E5E1DC" },
  listThumb: { height: 66, borderRadius: 8, overflow: "hidden", backgroundColor: "#E7DFD2" },
  listLabel: { fontSize: 11, marginTop: 6, fontFamily: typo.label.family },
  add: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF1FA",
    borderColor: "#3F4C8F",
    marginTop: 10,
    marginBottom: 16,
  },
  addText: { fontSize: 13, color: "#3F4C8F", fontFamily: typo.label.family },
  // 꾸미기
  pickField: { marginBottom: 16 },
  pickLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  pickLabelDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#E5E1DC" },
  pickLabel: { fontSize: 13, color: "#2C2A28", fontFamily: typo.label.family },
  pickRow: { gap: 8, paddingRight: 6, paddingVertical: 2 },
  pick: { width: 56, height: 56, borderRadius: 10, borderWidth: 2, borderColor: "transparent", overflow: "hidden" },
  pickChosen: { borderColor: "#3F4C8F" },
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
  suggest: { paddingVertical: 4, marginTop: -8, marginBottom: 12 },
  suggestText: { fontSize: 12, color: "#3F4C8F", fontFamily: typo.label.family },
});
