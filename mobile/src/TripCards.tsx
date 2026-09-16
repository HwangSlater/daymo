/**
 * 여행 기념 카드 — 목록과 만들기 시트, 그리고 카드 그림 그 자체.
 *
 * `WarmTripDetail.tsx` 가 이미 아주 커서 여기로 뺐다. 시트·칩 모양은 그 파일의
 * 것을 그대로 가져다 쓴다(새 디자인 언어를 들이지 않는다).
 *
 * 무엇을 어떻게 그릴지 정하는 계산은 전부 `tripCard.ts`·`cardDecor.ts` 에 있다.
 * 카드 그림 자체는 `KeepsakeCardView.tsx` 에 있고, 미리보기·내보내기·꾸미기 화면이
 * 그 하나를 같이 쓴다. 보이는 그대로 저장돼야 해서다.
 *
 * 스티커와 글자를 손으로 얹는 것은 전용 화면(`CardDecorEditor.tsx`)에서 한다.
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
import { CardDecorEditor } from "./CardDecorEditor";
import {
  CardStage,
  KeepsakeCardView,
  type CardPhoto,
} from "./KeepsakeCardView";
import { DaymoApiError } from "./auth";
import type { CardDecor } from "./cardDecor";
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
import {
  isCutStyle,
  keepsakeAddBlockedReason,
  keepsakeBodyOf,
  keepsakeCardOf,
  keepsakeDateStamp,
  keepsakeFileName,
  keepsakeFrameOf,
  keepsakeListOf,
  keepsakeSizeOf,
  keepsakeStatLines,
  keepsakeTextOf,
  suggestedStyleOf,
  toggleKeepsakePhoto,
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
import { shareTripCard } from "./tripCardExport";

export type { CardPhoto };

/** 카드에 실을 숫자. 기록 탭이 세어 넘긴다. */
export type CardCounts = {
  places: number;
  photos: number;
  days: number;
  /** 통화까지 붙인 지출 합. */
  spent: string;
};

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
  theme,
  onPress,
}: {
  label: string;
  color: string;
  uri?: string;
  theme?: AppTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} 카드 열기`}
      style={[styles.listRow, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
    >
      <View style={[styles.listThumb, { backgroundColor: color }]}>
        {Boolean(uri) && <Image source={{ uri }} resizeMode="cover" style={styles.fill} />}
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
  coverPhotoId,
  onSaveCoverPhoto,
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
  coverPhotoId?: string;
  onSaveCoverPhoto?: (photoId: string | null) => Promise<void>;
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
  // 전용 꾸미기 화면이 떠 있는지. 시트 위에 창을 하나 더 띄우는 대신 시트는 그대로 두고
  // 그 위를 덮는다. 나가면 시트가 다시 보인다.
  const [decorOpen, setDecorOpen] = useState(false);
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
    setDecorOpen(false);
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
    setDecorOpen(false);
  };

  /** 꾸민 값을 서버에 올린다. 시트의 저장과 꾸미기 화면의 저장이 같이 쓴다. */
  const persist = async (지금: KeepsakeCard | null) => {
    const 고칠_수_있다 = canManage && canEdit;
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

  const saveCard = async () => {
    const 지금 = draft;
    closeCard();
    await persist(지금);
  };

  /** 꾸미기 화면에서 저장. 시트는 그대로 두고 꾸민 카드가 미리보기에 바로 보인다. */
  const saveDecor = async (decor: CardDecor[]) => {
    const 지금 = draft ? { ...draft, decor } : null;
    setDraft(지금);
    setDecorOpen(false);
    await persist(지금);
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

  // 홈 카드 바탕은 한 장이다. 카드에 여러 장을 골랐으면 맨 앞 사진을 쓴다.
  const coverCandidate = card?.photoIds[0] ?? "";
  const coverOn = Boolean(coverCandidate) && coverCandidate === coverPhotoId;
  const toggleCover = async () => {
    if (!onSaveCoverPhoto || !coverCandidate) return;
    try {
      await onSaveCoverPhoto(coverOn ? null : coverCandidate);
      notify(coverOn ? "홈 카드를 원래 모습으로 되돌렸어요" : "이 사진을 홈 카드에 깔았어요");
    } catch {
      notify("홈 카드 사진을 바꾸지 못했어요. 잠시 뒤에 다시 시도해 주세요");
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
        subtitle="이대로 저장해도 되고, 스티커를 손으로 얹어도 돼요"
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
            <CardStage>
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
            </CardStage>
            {Boolean(frame?.notice) && (
              <Text style={[styles.notice, theme && { color: theme.muted }]}>{frame?.notice}</Text>
            )}
            {!readOnly && (
              <Pressable
                onPress={() => setDecorOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="스티커와 글자로 카드 꾸미기"
                style={[
                  styles.export,
                  theme && { backgroundColor: theme.primarySoft, borderColor: theme.primary },
                ]}
              >
                <Text style={[styles.exportText, theme && { color: theme.primary }]}>
                  {card.decor.length ? `스티커 꾸미기 · ${card.decor.length}개` : "스티커로 꾸미기"}
                </Text>
              </Pressable>
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
            {Boolean(onSaveCoverPhoto && coverCandidate) && (
              <Pressable
                onPress={toggleCover}
                accessibilityRole="switch"
                accessibilityState={{ checked: coverOn }}
                accessibilityLabel="이 카드의 사진을 홈 카드에 쓰기"
                style={[
                  styles.export,
                  theme && { borderColor: theme.border, backgroundColor: theme.surface },
                  coverOn && theme && { backgroundColor: theme.primarySoft, borderColor: theme.primary },
                ]}
              >
                <Text style={[styles.exportText, theme && { color: coverOn ? theme.primary : theme.muted }]}>
                  {coverOn ? "홈 카드에 쓰는 중 · 누르면 해제" : "이 카드의 사진을 홈 카드에 쓰기"}
                </Text>
              </Pressable>
            )}
            {!readOnly && (
              <Pressable
                onPress={() => setTuning((value) => !value)}
                accessibilityRole="button"
                accessibilityLabel={tuning ? "카드 설정 접기" : "카드 설정 고치기"}
                accessibilityState={{ expanded: tuning }}
                style={styles.more}
              >
                <Text style={[styles.moreText, theme && { color: theme.primary }]}>
                  {tuning ? "카드 설정 접기" : "카드 설정 고치기"}
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
      {/* 열 때만 만든다. 나가면 사라져서, 다시 열면 저장된 카드에서 다시 시작한다. */}
      {card && decorOpen && !readOnly && (
        <CardDecorEditor
          visible
          card={card}
          photos={drawPhotos}
          text={text}
          stats={stats}
          stamp={stamp}
          theme={theme}
          onClose={() => setDecorOpen(false)}
          onSave={saveDecor}
        />
      )}
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
