/**
 * 여행 기념 카드 — 목록과, 사진 창 안에서 카드를 만들고 고치는 일.
 *
 * `WarmTripDetail.tsx` 가 이미 아주 커서 여기로 뺐다.
 *
 * 카드는 **사진을 크게 보는 창과 한 창**에서 만든다(`PhotoViewer.tsx`). 예전에는
 * 사진 크게 보기, 카드 시트, 꾸미기 화면이 셋 다 다른 창이었다. 사진 한 장을
 * 카드로 만들려면 창을 두 번 갈아 끼워야 했고, 그때마다 보던 사진이 사라졌다.
 * 이제는 그 창에서 「꾸미기」를 누르면 그 자리에서 사진이 카드가 된다. 그래서 이
 * 화면은 목록과 카드 상태만 들고 있고, 그리는 일은 사진 창과 도구
 * (`CardDecorEditor.tsx`)에 맡긴다.
 *
 * 무엇을 어떻게 그릴지 정하는 계산은 전부 `tripCard.ts`·`cardDecor.ts` 에 있다.
 * 카드 그림 자체는 `KeepsakeCardView.tsx` 에 있고, 미리보기·내보내기·꾸미기가 그
 * 하나를 같이 쓴다. 보이는 그대로 저장돼야 해서다.
 *
 * 무거워지기 쉬운 화면이라 몇 가지를 지킨다.
 * - 미리보기는 썸네일(480px)을 쓰고 내보낼 때만 원본으로 바꿔 찍는다.
 * - 목록(격자의 작은 카드)은 썸네일만 받는다. 한 번에 셋까지, 받은 것은 다시 받지 않는다.
 * - 기록 탭으로 올려 보내는 손잡이(`onInline`)는 붙들어 둔 것만 넘긴다. 매 렌더마다
 *   새로 만들면 위에서 상태를 고치고 그 때문에 다시 렌더되는 고리가 생긴다.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import * as Crypto from "expo-crypto";
import { captureRef, releaseCapture } from "react-native-view-shot";

import { CardDecorTools, CardPreview, CardThumb } from "./CardDecorEditor";
import { downloadCardImage, hasFreshCardImage, releaseCardImage, uploadCardImage } from "./cardImage";
import { type CardPhoto } from "./KeepsakeCardView";
import { PhotoViewerScreen, type ViewerDecor, type ViewerPhoto } from "./PhotoViewer";
import { DaymoApiError } from "./auth";
import type { CardDecor } from "./cardDecor";
import { isLivePhotoUri, downloadPhoto, downloadPhotoToSave, releaseDownloadedPhoto } from "./photoTransfer";
import { isOriginalQualityUri } from "./photoSync";
import {
  createTripCard,
  deleteTripCard,
  listTripCards,
  updateTripCard,
  type ServerTripCard,
} from "./serverData";
import { showAlert } from "./showAlert";
import type { AppTheme } from "./theme";
import { COVER_FAIL, COVER_UNDO, coverNowOf, coverToggleOf, coverUndoBody } from "./coverPhoto";
import {
  homeCardBlockedReason,
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
  sameKeepsakeCard,
  suggestedStyleOf,
  KEEPSAKE_MAX_PHOTOS,
  KEEPSAKE_STYLES,
  type KeepsakeCard,
} from "./tripCard";
import { shareTripCard } from "./tripCardExport";
import { emptyHistory, recordChange, redoOnce, undoOnce, type UndoHistory } from "./undoHistory";

/** 기기가 찍은 카드의 파일 형식. 폰은 JPEG, 웹은 PNG 다. */
const CAPTURE_KIND = Platform.OS === "web" ? "png" : "jpg";

export type { CardPhoto };

/**
 * 기록 탭의 사진 격자에 함께 놓을 카드 한 장.
 *
 * 카드를 격자 아래 따로 둔 구역에서 꺼내 사진과 같은 줄에 세웠다. 여행의 기록은
 * 사진이든 카드든 한 덩어리라 두 군데를 훑게 할 까닭이 없다. 이 화면은 목록만
 * 넘기고, 타일을 그리는 것은 기록 탭이 한다(사진 타일과 모양이 같아야 한다).
 */
export type CardTile = {
  id: string;
  label: string;
  /** 대표 사진이 아직 없을 때 깔 색. */
  color: string;
  uri?: string;
  /** 지금 홈 화면에 깔려 있는 카드인지. */
  onHome: boolean;
  /** 칸에 맞게 줄여 그린 카드(`CardThumb`). 이것이 있으면 `uri` 사진 대신 그린다. */
  preview?: ReactNode;
};

/** 카드에 실을 숫자. 기록 탭이 세어 넘긴다. */
export type CardCounts = {
  places: number;
  photos: number;
  days: number;
  /** 통화까지 붙인 지출 합. */
  spent: string;
};

/**
 * 사진을 크게 보는 창에 넘길 것.
 *
 * 사진 쪽 일(넘기기·저장·신고·고치기)은 기록 탭이 안다. 카드 쪽 일은 이 화면이
 * 안다. 한 창이 둘을 같이 쓰므로, 기록 탭이 사진 몫을 여기로 내려 준다.
 */
export type CardViewer = {
  photos: ViewerPhoto[];
  /** 지금 보는 사진의 차례. 목록에 없으면 -1 이다. */
  index: number;
  /** 지금 보는 사진 id. 없으면 사진 없이 카드만 꾸미는 중이다. */
  photoId: string | null;
  /** 사진을 넘기거나(id) 창을 닫는다(null). */
  onMove: (photoId: string | null) => void;
  /** ↓. 묻지 않고 바로 받는다. */
  onSave: () => void;
  saving: boolean;
  saveBlocked: boolean;
  /** ⋮ 의 「홈에 보일 부분」. 지금 홈에 깔려 있는 사진일 때만 있다. */
  onAdjustCover?: () => void;
  /** ✎ 사진 고치기. 고칠 수 없는 사람에게는 주지 않는다. */
  onEditPhoto?: () => void;
  /** 🗑 사진 삭제. 지울 수 없는 사람에게는 주지 않는다. */
  onDeletePhoto?: () => void;
  onReport?: () => void;
  report?: React.ReactNode;
  hint?: string;
  hintSoon?: boolean;
  toast?: string;
  /** 그 줄 옆의 되돌리기 단추. */
  toastAction?: { label: string; onPress: () => void };
  waitingText?: string;
  /** 「사진 정보」 화면. 창 안의 한 겹으로 얹힌다. */
  editPanel?: React.ReactNode;
  /** 「홈에 보일 부분」 화면. 같은 자리에 한 겹으로 얹힌다. */
  coverPanel?: React.ReactNode;
  /** 그 겹을 닫는다. */
  onCloseEditPanel?: () => void;
  /**
   * 보고 있는 사진을 홈 화면에 깔거나 내린다. 깔 수 없는 사진이면 없다.
   *
   * 홈에 까는 일은 크게 보는 자리에 있어야 한다. 지금 보고 있는 것을 홈에 까는
   * 일이라, 고치러 들어가야 보이면 고칠 생각이 없는 사람은 찾지 못한다.
   */
  cover?: { on: boolean; label: string; onPress: () => void };
  /**
   * 창 안에 떴다 사라지는 한 줄.
   *
   * 여행 화면 바닥의 토스트는 이 창에 가려 보이지 않는다. 창이 떠 있는 동안
   * 알릴 말은 이 길로 보낸다. `undo` 를 주면 그 줄 옆에 되돌리기가 붙는다.
   */
  onNotice: (text: string, undo?: { label: string; onPress: () => void }) => void;
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
 * 기록 탭의 기념 카드 몫.
 *
 * 만든 카드를 목록으로 위에 넘기고(`onInline`), 카드를 열고 고치는 창을 그린다.
 * 서버 여행이면 카드가 `trip_cards` 에 남아 함께 보는 사람에게도 보인다. 예시
 * 여행은 서버에 보낼 곳이 없어 이 화면에서만 산다.
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
  coverPhotoId,
  onSaveHomeCover,
  onInline,
  canEdit,
  theme,
  notify,
  onCreated,
  viewer,
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
  /** 홈 화면에 깔린 사진 한 장. 카드를 깔 때 무엇이 내려가는지 말하려고 받는다. */
  coverPhotoId?: string;
  /** 홈 화면에 깔 것을 바꾼다. `localUris` 는 기기가 들고 있는 사진 자리(사진 id → 자리)다. */
  onSaveHomeCover?: (
    고른_것: { coverPhotoId: string | null } | { coverCardId: string | null },
    localUris?: Record<string, string | undefined>,
  ) => Promise<void>;
  /**
   * 카드 목록과 손잡이를 기록 탭으로 올려 보낸다.
   *
   * 카드는 사진 격자에 함께 놓인다. 목록과 열기·만들기만 위로 넘기고 카드를
   * 만들고 고치는 일은 전부 이 파일에 남는다.
   */
  onInline: (것: { tiles: CardTile[]; open: (id: string) => void; create: (photoIds?: readonly string[]) => void }) => void;
  canEdit: boolean;
  theme?: AppTheme;
  notify: (message: string) => void;
  /**
   * 새 카드를 저장했을 때. 넘기면 「저장했어요」 알림은 받는 쪽이 띄운다(어디에 생겼는지
   * 보여 주려고). 안 넘기면 여기서 알린다.
   */
  onCreated?: (cardId: string) => void;
  /** 사진을 크게 보는 창의 사진 쪽 몫. */
  viewer: CardViewer;
}) {
  // 카드에 쓸 수 있는 사진은 파일이 기기에 있는 것뿐이다. 웹의 blob: 주소는 탭을
  // 새로 열면 죽어서, 그 사진을 고르면 빈 칸이 찍힌다.
  const cardPhotos = useMemo(() => photos.filter((photo) => isLivePhotoUri(photo.uri)), [photos]);
  const photoIds = useMemo(() => cardPhotos.map((photo) => photo.id), [cardPhotos]);

  const [rows, setRows] = useState<ServerTripCard[]>([]);
  /**
   * 지금 창에 올라온 카드. `새 카드` 면 아직 저장 전이고, 비어 있으면 사진을 보는 중이다.
   *
   * 카드가 올라와 있다고 곧 꾸미는 것은 아니다. 격자에서 카드를 누르면 사진과 같은
   * 결로 먼저 크게 보여 주고, 도구는 「꾸미기」를 한 번 더 눌러야 펴진다.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  /** 도구가 펼쳐져 있는지. */
  const [toolsOpen, setToolsOpen] = useState(false);
  const [draft, setDraft] = useState<KeepsakeCard | null>(null);
  /** 꾸미기를 시작할 때의 카드. 「나가기」에서 손댄 것이 있는지 볼 때만 쓴다. */
  const [baseline, setBaseline] = useState<KeepsakeCard | null>(null);
  const [busy, setBusy] = useState(false);
  /** 덮개에 적을 말. 공유할 그림을 만들 때와 「완료」로 저장할 때가 다르다. */
  const [busyLabel, setBusyLabel] = useState("저장할 이미지를 만드는 중이에요");
  const [exporting, setExporting] = useState(false);
  /**
   * 내보낼 때만 쓰는 원본 자리(사진 id → 파일).
   *
   * 미리보기는 썸네일이면 충분하지만, 찍는 순간에는 카드가 1080px 넘게 커진다.
   * 표시본(긴 변 2048px)으로 찍어도 세로 카드에서는 늘려 그려 뭉갠다.
   */
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const shot = useRef<View>(null);
  // 다 그려진 사진. 화면에 알리는 것과 캡처 전에 기다리는 것 둘 다 쓴다.
  const [drawnKeys, setDrawnKeys] = useState<string[]>([]);
  const drawn = useRef(new Set<string>());
  /**
   * 사진 쪽 몫의 최신 값.
   *
   * 아래 손잡이들은 기록 탭으로 올려 보내는 것이라 렌더마다 새로 만들면 안 된다
   * (위에서 상태를 고치고 그 때문에 다시 렌더되는 고리가 생긴다). 그래서 매 렌더
   * 바뀌는 사진 쪽 값은 붙들지 않고 여기로 읽는다. 렌더 중에는 읽지 않는다.
   */
  const viewerRef = useRef(viewer);
  useEffect(() => {
    viewerRef.current = viewer;
  });

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
  // 격자 칸마다 카드를 작게 그리므로 카드에 든 사진의 썸네일을 모두 받는다.
  const listPhotoIds = useMemo(
    () => [...new Set(list.flatMap((줄) => [줄.coverPhotoId, ...줄.card.photoIds]).filter(Boolean))],
    [list],
  );
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
  /**
   * 꾸미기와 카드 보기는 기기에 있는 표시본(긴 변 2048px)으로 그리고, 내보낼 때는 원본으로 그린다.
   * 썸네일(480px)은 표시본이 없을 때만 쓴다. 예전에는 썸네일부터 써서 꾸미는 동안 사진이 흐렸고,
   * 확대해 꾸미면 더 눈에 띄었다(2026-09-22). 카드 한 장에 사진은 넷까지라 부담이 적다.
   * 격자의 작은 카드와 옆 칸 미리보기는 그대로 썸네일을 쓴다.
   */
  const drawPhotos = useMemo(
    () => chosen.map((photo) => ({
      ...photo,
      uri: exporting ? originals[photo.id] ?? photo.uri : photo.uri ?? thumbs[photo.id],
    })),
    [chosen, exporting, originals, thumbs],
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
  /**
   * 저장된 카드 한 장을 그릴 것. 격자의 작은 카드와 옆 칸 미리보기가 같이 쓴다. 받아 둔
   * 썸네일이 없으면 기기에 있는 사진으로 그린다.
   */
  const faceOf = useCallback(
    (saved: KeepsakeCard) => ({
      card: saved,
      photos: saved.photoIds
        .map((사진id) => cardPhotos.find((photo) => photo.id === 사진id))
        .filter((photo) => photo !== undefined)
        .map((photo) => ({ ...photo, uri: thumbs[photo.id] ?? photo.uri })),
      text: keepsakeTextOf(saved, { name: tripName, period: tripDate, region: tripRegion, people: participants }),
      stats: keepsakeStatLines(saved, counts),
      stamp: saved.dateStamp ? keepsakeDateStamp(tripStartKey) : "",
    }),
    [cardPhotos, counts, participants, thumbs, tripDate, tripName, tripRegion, tripStartKey],
  );

  const markDrawn = useCallback((key: string) => {
    if (drawn.current.has(key)) return;
    drawn.current.add(key);
    setDrawnKeys((current) => [...current, key]);
  }, []);
  /**
   * 되돌리기 기록(머리줄 ↶ ↷). 카드에 한 모든 일 — 사진·차례·위치·틀·글자·스티커 — 을
   * 바뀌기 전 모습으로 쌓는다. 잇달아 바뀌는 것은 한 단계로 묶는다(`undoHistory.ts`).
   * 카드를 새로 열거나 꾸미기를 다시 펴면 비운다.
   */
  const [역사, 역사_바꾸기] = useState(() => emptyHistory<KeepsakeCard>());
  // 바꾸는 순간의 모습. 상태를 고치는 함수 안에서 쌓으면 React 가 두 번 부를 때 두 번 쌓인다.
  const 지금_카드 = useRef<KeepsakeCard | null>(null);
  useEffect(() => {
    지금_카드.current = draft;
  }, [draft]);
  const 쌓기 = useCallback(() => {
    const 전 = 지금_카드.current;
    if (전) 역사_바꾸기((h) => recordChange(h, 전, Date.now(), sameKeepsakeCard));
  }, []);
  const tune = useCallback((change: Partial<KeepsakeCard>) => {
    // 사진이 바뀌면 다시 그려질 때까지 기다린다.
    if (change.photoIds) {
      drawn.current = new Set();
      setDrawnKeys([]);
    }
    쌓기();
    setDraft((current) => (current ? { ...current, ...change } : current));
  }, [쌓기]);
  const onDecor = useCallback((change: (list: CardDecor[]) => CardDecor[]) => {
    쌓기();
    setDraft((current) => (current ? { ...current, decor: change(current.decor) } : current));
  }, [쌓기]);
  /** ↶ ↷. 사진이 바뀌면 다시 그려질 때까지 기다리는 것도 `tune` 과 같다. */
  const 옮겨_가기 = (결과: { history: UndoHistory<KeepsakeCard>; value: KeepsakeCard } | undefined) => {
    if (!결과) return;
    if (draft && 결과.value.photoIds.join() !== draft.photoIds.join()) {
      drawn.current = new Set();
      setDrawnKeys([]);
    }
    역사_바꾸기(결과.history);
    setDraft(결과.value);
  };

  /** 카드를 창에 올린다. `tools` 면 도구까지 편다. */
  const openCard = useCallback((id: string, start: KeepsakeCard, tools: boolean) => {
    drawn.current = new Set();
    setDrawnKeys([]);
    setDraft(start);
    setBaseline(start);
    역사_바꾸기(emptyHistory());
    setOpenId(id);
    setToolsOpen(tools);
    setExporting(false);
  }, []);
  const makeCard = useCallback((고른_사진?: readonly string[]) => {
    if (blocked) {
      notify(blocked);
      return;
    }
    // 「카드 만들기」는 만들러 온 것이라 곧바로 도구를 편다. 사진은 비워 두고 직접 고르게 한다.
    // 예전에는 가장 최근 사진이 먼저 들어가 있어, 넣을 사진을 고르려면 그것부터 빼야 했다.
    // 사진을 보다가 만드는 길(아래)은 보던 사진이 들어간다.
    //
    // 사진첩에서 여러 장을 골라 만들면 그 사진이 고른 차례대로 들어간다. 파일이 아직 이
    // 기기에 없는 사진(업로드 중이거나 웹에서 아직 불러오지 않은 것)은 넣을 수 없어 뺀다.
    // 부르는 쪽이 넘기지 않으면(버튼의 누름 이벤트 같은 것) 빈 카드로 시작한다.
    const 고른_것 = Array.isArray(고른_사진) ? 고른_사진 : [];
    const 쓸_것 = 고른_것.filter((id) => photoIds.includes(id)).slice(0, KEEPSAKE_MAX_PHOTOS);
    if (고른_것.length && !쓸_것.length) {
      notify("업로드가 끝나면 카드에 넣을 수 있어요");
      return;
    }
    const 시작 = { ...keepsakeCardOf(undefined, tripName, photoIds), photoIds: 쓸_것 };
    openCard("새 카드", 시작, true);
    viewerRef.current.onMove(null);
    if (쓸_것.length < 고른_것.length) viewerRef.current.onNotice("업로드 중인 사진은 빼고 넣었어요");
  }, [blocked, notify, openCard, photoIds, tripName]);
  // 사진 격자에 함께 놓을 타일. 대표 사진 한 장의 색과 썸네일만 실어 보낸다.
  // 격자에는 최신 카드가 먼저 온다. 방금 만든 카드가 「더 보기」 뒤 맨 끝에 붙으면 어디 생겼는지
  // 찾기 어렵다. 사진 앱(갤러리·구글 포토)도 새것이 앞이다.
  const tiles = useMemo<CardTile[]>(
    () =>
      [...list].reverse().map((줄) => ({
        id: 줄.id,
        label: 줄.label,
        color: cardPhotos.find((photo) => photo.id === 줄.coverPhotoId)?.color ?? "#E7DFD2",
        uri: thumbs[줄.coverPhotoId] ?? cardPhotos.find((photo) => photo.id === 줄.coverPhotoId)?.uri,
        onHome: 줄.id === coverCardId,
        preview: <CardThumb {...faceOf(줄.card)} />,
      })),
    [cardPhotos, coverCardId, faceOf, list, thumbs],
  );
  /**
   * 카드를 크게 보는 자리를 연다. 격자에서 누를 때와 창 안 스트립에서 누를 때가 같다.
   *
   * 도구는 펴지 않는다. 격자는 누르면 크게 보는 자리인데 카드만 고치는 화면이 뜨면
   * 「사진을 눌렀는데 왜 고치는 게 뜨지」로 읽힌다. 보던 사진은 놓는다. 사진과 카드
   * 둘 다 고른 것처럼 보이면 스트립에서 어느 것을 보는 중인지 알 수 없다.
   */
  const openTile = useCallback(
    (id: string) => {
      const 줄 = list.find((하나) => 하나.id === id);
      if (!줄) return;
      openCard(줄.id, 줄.card, false);
      viewerRef.current.onMove(null);
    },
    [list, openCard],
  );
  useEffect(() => {
    onInline({ tiles, open: openTile, create: makeCard });
  }, [makeCard, onInline, openTile, tiles]);

  /**
   * 스트립에서 사진을 눌렀을 때.
   *
   * 카드를 보던 중이면 그 카드를 놓는다. 놓지 않으면 사진을 골랐는데 무대에는
   * 카드가 그대로 남아, 스트립에서 사진과 카드가 함께 골라진 것처럼 보인다.
   */
  const viewPhoto = (photoId: string | null) => {
    if (openId && !toolsOpen) {
      setOpenId(null);
      setDraft(null);
      setBaseline(null);
    }
    viewerRef.current.onMove(photoId);
  };

  /** 창을 통째로 닫는다. 카드도 사진도 놓는다. */
  const closeAll = () => {
    setOpenId(null);
    setToolsOpen(false);
    setDraft(null);
    setBaseline(null);
    setExporting(false);
    viewerRef.current.onMove(null);
  };
  /**
   * 도구만 접는다.
   *
   * 저장된 카드를 꾸미던 중이면 그 카드를 크게 보는 자리로 돌아간다. 고치기 전
   * 모습으로 되돌려야 「나가기」가 버린다는 뜻이 된다. 아직 저장 전인 새 카드는
   * 돌아갈 카드가 없으니 놓고, 그 카드를 시작한 사진 앞으로 돌아간다.
   */
  const collapse = () => {
    setToolsOpen(false);
    setExporting(false);
    if (open) {
      setDraft(open.card);
      setBaseline(open.card);
      return;
    }
    const 첫_사진 = draft?.photoIds[0];
    setOpenId(null);
    setDraft(null);
    setBaseline(null);
    const 지금 = viewerRef.current;
    if (첫_사진 && 지금.photos.some((하나) => 하나.id === 첫_사진)) 지금.onMove(첫_사진);
    else if (!지금.photoId) 지금.onMove(null);
  };

  /** 꾸민 값을 서버에 올린다. 저장된 줄을 돌려준다(못 올렸으면 null). */
  const persist = async (지금: KeepsakeCard | null): Promise<ServerTripCard | null> => {
    const 고칠_수_있다 = canManage && canEdit;
    if (!지금 || !tripId || !고칠_수_있다) return null;
    const body = keepsakeBodyOf(지금, tripName);
    try {
      let 저장된_것: ServerTripCard;
      if (open) {
        저장된_것 = await updateTripCard(open.id, rowVersionOf(rows, open.id), body);
        setRows((current) => current.map((줄) => (줄.id === 저장된_것.id ? 저장된_것 : 줄)));
      } else {
        저장된_것 = await createTripCard(tripId, Crypto.randomUUID(), body);
        setRows((current) => (current.some((줄) => 줄.id === 저장된_것.id) ? current : [...current, 저장된_것]));
        if (onCreated) {
          onCreated(저장된_것.id);
          return 저장된_것;
        }
      }
      notify("카드를 저장했어요");
      return 저장된_것;
    } catch (caught) {
      notify(
        caught instanceof DaymoApiError && caught.status === 422
          ? caught.message
          : "카드를 저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요",
      );
      return null;
    }
  };

  /**
   * 저장한 카드를 원본 화질로 그려 서버에 한 장 올려 둔다.
   *
   * 사진 원본은 올린 지 30일 뒤 지워진다. 그 뒤에도 카드는 원본 화질로 남아야 해서,
   * 원본이 있을 때(대개 카드를 만드는 지금) 그린 그림을 서버에 둔다. 못 올려도 카드
   * 저장은 끝난 것이라 알리지 않는다. 공유할 때 그 자리에서 다시 그린다.
   */
  const 그림_올리기 = async (줄: ServerTripCard) => {
    let 찍음: { 찍은_것: string; 원본_못_받음: boolean } | undefined;
    try {
      찍음 = await 원본으로_찍기();
      const 새_줄 = await uploadCardImage(줄.id, 줄.version, 찍음.찍은_것);
      setRows((current) => current.map((하나) => (하나.id === 새_줄.id ? 새_줄 : 하나)));
    } catch (caught) {
      if (__DEV__) console.log("카드 그림 올리기 실패", caught);
    } finally {
      if (찍음) releaseCapture(찍음.찍은_것);
    }
  };

  /** 머리줄의 「완료」. 카드를 만들거나 고치고 창을 닫는다. */
  const saveCard = async () => {
    const 지금 = draft;
    if (readOnly) {
      closeAll();
      return;
    }
    if (!tripId) {
      notify("예시 여행이라 카드가 저장되지 않아요");
      closeAll();
      return;
    }
    if (busy) return;
    // 사진 없이 시작한 새 카드. 빈 카드는 저장하지 않는다.
    if (지금 && 지금.photoIds.length === 0) {
      viewerRef.current.onNotice("카드에 넣을 사진을 골라 주세요");
      return;
    }
    const 저장된_줄 = open ? rows.find((줄) => 줄.id === open.id) : undefined;
    const 그대로다 = Boolean(open && baseline && 지금 && sameKeepsakeCard(baseline, 지금));
    // 손댄 것도 없고 서버의 그림도 지금 카드 그대로면 할 일이 없다.
    if (그대로다 && hasFreshCardImage(저장된_줄)) {
      closeAll();
      return;
    }
    // 그리는 동안은 창을 닫지 않는다. 찍을 카드가 이 창에 떠 있어야 한다.
    setBusyLabel("카드를 저장하는 중이에요");
    setBusy(true);
    try {
      const 저장됨 = 그대로다 ? 저장된_줄 ?? null : await persist(지금);
      if (저장됨) await 그림_올리기(저장됨);
    } finally {
      setBusy(false);
      setBusyLabel("저장할 이미지를 만드는 중이에요");
      closeAll();
    }
  };

  /**
   * 꾸미다 만 것이 사라지기 전에 한 번 묻는다.
   *
   * 되돌릴 길이 없는 일이라 말없이 버리면 안 된다. 손댄 것이 없으면 묻지 않는다.
   * 나가는 길이 두 번이 되면 그것대로 성가시다. 웹에서도 물으려고 `showAlert` 를
   * 쓴다(`Alert.alert` 은 웹에서 아무 일도 하지 않는다).
   */
  const 버려도_되나 = (버린다: () => void) => {
    if (toolsOpen && !readOnly && baseline && draft && !sameKeepsakeCard(baseline, draft)) {
      showAlert("저장하지 않고 나갈까요?", "저장하지 않은 내용은 사라져요.", [
        { text: "계속 편집", style: "cancel" },
        { text: "나가기", style: "destructive", onPress: 버린다 },
      ]);
      return;
    }
    버린다();
  };
  /** 머리줄의 「취소」. 도구만 접는다. */
  const leaveDecor = () => 버려도_되나(collapse);
  /** ✕. 창을 통째로 닫는다. 꾸미던 중이면 나가기와 같은 것을 묻는다. */
  const closeWindow = () => 버려도_되나(closeAll);

  /**
   * 아래 「꾸미기」 한 줄.
   *
   * 카드를 보는 중이면 **그 카드**의 도구를 편다. 사진을 보는 중이면 그 사진 한
   * 장으로 새 카드를 시작한다. 카드를 보다가 눌렀는데 엉뚱한 새 카드가 시작되면
   * 방금 본 카드를 어디서 고치는지 알 수 없다.
   */
  const startDecor = () => {
    if (openId) {
      setToolsOpen(true);
      setBaseline(draft);
      역사_바꾸기(emptyHistory());
      return;
    }
    const 보던_사진 = viewerRef.current.photoId;
    const 쓸_수_있나 = 보던_사진 && cardPhotos.some((photo) => photo.id === 보던_사진);
    if (!쓸_수_있나) {
      viewerRef.current.onNotice("업로드가 끝나면 카드에 넣을 수 있어요");
      return;
    }
    if (blocked) {
      viewerRef.current.onNotice(blocked);
      return;
    }
    openCard("새 카드", { ...keepsakeCardOf(undefined, tripName, photoIds), photoIds: [보던_사진] }, true);
  };

  const removeCard = () => {
    const 지울_것 = open;
    if (!지울_것) return;
    showAlert("이 카드를 삭제할까요?", "카드만 삭제되고 사진은 그대로 남아요.", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          closeAll();
          setRows((current) => current.filter((줄) => 줄.id !== 지울_것.id));
          deleteTripCard(지울_것.id).catch(() => notify("카드를 삭제하지 못했어요. 잠시 뒤에 다시 시도해 주세요"));
          notify("카드를 삭제했어요");
        },
      },
    ]);
  };

  // 고른 사진이 다 그려진 뒤에만 찍는다. 파일이 없는 사진은 색만 깔리므로 기다릴 것이 없다.
  const ready = useMemo(
    () => drawPhotos.every((photo) => !photo.uri || drawnKeys.includes(`${photo.id}:t`)),
    [drawPhotos, drawnKeys],
  );

  /**
   * 원본으로 바꿔 그린 카드를 찍는다. 찍은 그림은 부르는 쪽이 `releaseCapture` 한다.
   *
   * 미리보기 내내 큰 사진을 들고 있지 않고 찍는 순간에만 원본으로 바꾼다. 기기에서 고른
   * 사진은 파일이 이미 원본이라 그대로 쓴다. 남이 올린 사진만 받아 오고, 다 찍은 뒤에
   * 버린다. 원본 기한(30일)이 지났으면 서버가 표시본을 주는데 그것은 화면이 쓰고 있는
   * 파일과 같으니 버리지 않는다.
   */
  const 원본으로_찍기 = async (): Promise<{ 찍은_것: string; 원본_못_받음: boolean }> => {
    if (!card) throw new Error("카드가 없다");
    const 받은_것: Record<string, string> = {};
    const 버릴_것: string[] = [];
    let 원본_못_받음 = false;
    try {
      await Promise.all(chosen.map(async (photo) => {
        if (isOriginalQualityUri(photo.uri, photo.id)) return;
        try {
          const 받음 = await downloadPhotoToSave(photo.id, photo.hasOriginal ?? false);
          if (!받음) return;
          받은_것[photo.id] = 받음.uri;
          if (받음.original) 버릴_것.push(받음.uri);
          else 원본_못_받음 = true;
        } catch {
          // 못 받으면 기기에 있는 것으로 찍는다. 저장 자체를 막지는 않는다.
          원본_못_받음 = true;
        }
      }));
    } catch {
      원본_못_받음 = true;
    }
    // 앞서 찍을 때 남은 「다 그렸다」를 지운다. 남아 있으면 이번에 크게 불러올 사진을
    // 기다리지 않고 찍어, 화면에 있던 썸네일이 카드에 들어간다.
    drawn.current = new Set([...drawn.current].filter((key) => !key.endsWith(":d")));
    setOriginals(받은_것);
    setExporting(true);
    const 잰다 = Date.now();
    try {
      const 다_그림 = await 그려질_때까지(() =>
        drawPhotos.every((photo) => !photo.uri || drawn.current.has(`${photo.id}:d`)));
      if (__DEV__ && !다_그림) console.log("추억 카드: 사진을 다 기다리지 못하고 찍었다");
      const size = keepsakeSizeOf(card.ratio, card.style);
      // 폰은 카드를 이미 찍힐 크기로 키워 두었으니(`keepsakeShotScale`) 크기를 넘기지 않는다.
      // 넘기면 iOS 는 그 값을 포인트로 읽어 기기 배율만큼 또 키운다. 네컷 2160x6480 을
      // PNG 로 찍으면 20MB 가까이 되어 JPEG(95)로 찍는다. 서버는 받아서 다시 JPEG 로 쓴다.
      const 찍은_것 = Platform.OS === "web"
        ? await captureRef(shot, { format: "png", result: "data-uri", width: size.exportWidth, height: size.exportHeight })
        : await captureRef(shot, { format: "jpg", quality: 0.95, result: "tmpfile" });
      if (__DEV__) console.log(`추억 카드 캡처 ${card.style} ${Date.now() - 잰다}ms`);
      return { 찍은_것, 원본_못_받음 };
    } finally {
      // 화면이 아직 쓰는 사진 주소는 건드리지 않는다(`photoTransfer.ts` 의 liveBlobUris 규칙).
      버릴_것.forEach(releaseDownloadedPhoto);
      setOriginals({});
      setExporting(false);
    }
  };

  /**
   * ↓. 카드를 그림으로 내보낸다. 웹은 내려받고 폰은 공유 시트로 간다.
   *
   * 서버에 저장된 그림이 지금 카드 그대로면 그것을 받는다. 원본이 지워진 뒤에도 원본
   * 화질이고, 다시 그리지 않아 빠르다. 없거나 옛것이면 그 자리에서 그린다.
   */
  const exportCard = async () => {
    if (!card || busy) return;
    const name = keepsakeFileName(text.title || tripName);
    const 저장된_줄 = open ? rows.find((줄) => 줄.id === open.id) : undefined;
    const 손댄_것_없다 = !toolsOpen || Boolean(baseline && draft && sameKeepsakeCard(baseline, draft));
    // 창이 떠 있는 동안이라 여행 화면 바닥의 토스트는 가려진다. 창 안에서 알린다.
    // 폰은 공유 시트가 뜨는 것으로 끝이다. 시트만 열렸는데 「공유했어요」라고
    // 단정하지 않는다. 웹은 내려받기가 조용히 끝나서 한 줄 알린다.
    const 알린다 = (결과: "shared" | "unavailable", 원본_못_받음: boolean) => {
      if (결과 === "unavailable") viewerRef.current.onNotice("이 기기에서는 카드를 저장하거나 공유할 수 없어요");
      // 원본 보관 기간(30일)이 지난 사진은 줄인 사본밖에 없다. 저장은 되지만 화질이
      // 다르니 조용히 넘기지 않고 한 줄 남긴다.
      else if (원본_못_받음) viewerRef.current.onNotice("원본이 없는 사진은 줄인 화질로 들어갔어요");
      else if (Platform.OS === "web") viewerRef.current.onNotice("카드를 저장했어요");
    };
    if (open && 저장된_줄 && 손댄_것_없다 && hasFreshCardImage(저장된_줄)) {
      setBusy(true);
      try {
        const 받은 = await downloadCardImage(open.id, 저장된_줄.version).catch(() => undefined);
        if (받은) {
          try {
            알린다(await shareTripCard(name, 받은, "jpg"), false);
          } finally {
            releaseCardImage(받은);
          }
          return;
        }
      } finally {
        setBusy(false);
      }
    }
    if (!ready) {
      viewerRef.current.onNotice("사진을 불러오는 중이에요. 잠시 뒤에 다시 시도해 주세요");
      return;
    }
    setBusy(true);
    let 찍음: { 찍은_것: string; 원본_못_받음: boolean } | undefined;
    try {
      찍음 = await 원본으로_찍기();
      알린다(await shareTripCard(name, 찍음.찍은_것, CAPTURE_KIND), 찍음.원본_못_받음);
      // 서버 그림이 없던 카드(이 기능 전에 만든 것)를 원본으로 그렸으면 그 그림도 올려 둔다.
      // 원본이 하나라도 빠진 그림은 올리지 않는다. 나중에 원본이 없어도 이 화질은 남아야 한다.
      if (open && 저장된_줄 && 손댄_것_없다 && canManage && canEdit && !찍음.원본_못_받음) {
        const 새_줄 = await uploadCardImage(open.id, 저장된_줄.version, 찍음.찍은_것).catch(() => undefined);
        if (새_줄) setRows((current) => current.map((하나) => (하나.id === 새_줄.id ? 새_줄 : 하나)));
      }
    } catch {
      viewerRef.current.onNotice("저장할 이미지를 만들지 못했어요");
    } finally {
      if (찍음) releaseCapture(찍음.찍은_것);
      setBusy(false);
    }
  };

  /** 도구는 접힌 채로 카드를 크게 보는 중인지. */
  const previewing = Boolean(openId) && !toolsOpen;
  /**
   * 카드를 볼 때 띄울 완성 그림(2026-09-22, 「카드도 사진으로 보면 좋겠다」). 서버에 둔 그림이
   * 지금 카드 그대로면(`hasFreshCardImage`) 받아서 사진처럼 띄운다. 가로 2160px 이라 확대해도
   * 선명하다. 없거나 옛것이면 그 자리에서 그린 카드를 보여 준다.
   */
  const [카드_그림, 카드_그림_두기] = useState<{ id: string; version: number; uri: string } | null>(null);
  const 볼_줄 = previewing && open ? rows.find((줄) => 줄.id === open.id) : undefined;
  const 받을_그림 = 볼_줄 && hasFreshCardImage(볼_줄) ? { id: 볼_줄.id, version: 볼_줄.version } : null;
  useEffect(() => {
    if (!받을_그림) return;
    let 살아있다 = true;
    let 받은: string | undefined;
    downloadCardImage(받을_그림.id, 받을_그림.version)
      .then((uri) => {
        받은 = uri;
        if (살아있다 && uri) 카드_그림_두기({ ...받을_그림, uri });
        else if (uri) releaseCardImage(uri);
      })
      .catch(() => undefined);
    return () => {
      살아있다 = false;
      if (받은) releaseCardImage(받은);
      카드_그림_두기(null);
    };
    // 받을 그림이 바뀔 때만 다시 받는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [받을_그림?.id, 받을_그림?.version]);
  /** 스트립 끝에 세울 카드. 지금 보는 카드에 표가 선다. */
  const cardStrip = useMemo(
    () => tiles.map((하나) => ({ ...하나, on: previewing && 하나.id === openId })),
    [openId, previewing, tiles],
  );

  /*
   * 홈 화면에는 이 카드가 통째로 깔린다. 홈은 사진 배치만 따르고 틀 색·스티커·
   * 날짜 도장은 그리지 않는다(`WarmAppShell` 의 홈 카드).
   *
   * 저장한 카드만 깔 수 있다. 아직 저장하지 않은 카드는 서버에 없어서 다른 기기와
   * 상대에게 보일 것이 없다.
   */

  /**
   * 지금 홈에 깔린 것. 내려가는 것의 이름을 대려면 종류와 이름이 함께 필요하다.
   *
   * 사진 이름은 크게 보기 목록에서, 카드 이름은 이 화면의 목록에서 찾는다.
   */
  const coverNow = coverNowOf(coverPhotoId, coverCardId, (kind, id) =>
    kind === "card"
      ? list.find((줄) => 줄.id === id)?.label
      : viewer.photos.find((하나) => 하나.id === id)?.caption);
  const cover = coverToggleOf(open?.id, coverNow, "card");
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
      // 버튼을 주지 않는다. 고를 것이 없는 안내라 확인창 대신 알림창이어야 한다.
      showAlert("세로 카드는 대표 사진으로 쓸 수 없어요", `${coverBlocked}.`);
      return;
    }
    try {
      await onSaveHomeCover(
        { coverCardId: cover.next },
        Object.fromEntries(chosen.map((photo) => [photo.id, thumbs[photo.id] ?? photo.uri])),
      );
      // 창이 떠 있는 동안이라 여행 화면 바닥의 토스트는 가려진다. 창 안에서 알린다.
      // 무엇이 내려갔는지 적고 한 번에 되돌릴 길을 같은 줄에 둔다.
      viewerRef.current.onNotice(cover.done, {
        label: COVER_UNDO,
        onPress: () => {
          void onSaveHomeCover(coverUndoBody(cover.undo)).catch(() =>
            viewerRef.current.onNotice(COVER_FAIL));
        },
      });
    } catch {
      viewerRef.current.onNotice(COVER_FAIL);
    }
  };

  /**
   * 꾸미기의 ⋮.
   *
   * 삭제 하나만 남는다. 내보내기는 위 줄의 ↓ 로, 홈 화면은 보기의 ⌂ 로 올렸다.
   * 자주 쓰는 것을 메뉴 안에 두면 있는 줄도 모르고, 되돌릴 수 없는 삭제를 줄에
   * 내놓으면 잘못 눌린다. 남는 것이 삭제뿐인 까닭이다.
   */
  const cardMenu: ViewerDecor["menu"] =
    !readOnly && open && tripId
      ? [{ label: "카드 삭제", tone: "위험" as const, onPress: removeCard }]
      : [];
  /** ↓ 에 적을 말. 웹은 내려받고 폰은 공유 시트로 간다. */
  const exportLabel = Platform.OS === "web" ? "카드 저장" : "카드 공유";

  /**
   * 보기의 ⋮.
   *
   * ⌂ 와 ↓ 가 줄로 올라가서 여기 남는 것은 가끔 쓰는 것뿐이다. 사진을 보고
   * 있으면 사진 정보와 신고, 카드를 보고 있으면 남는 것이 없어 ⋮ 자체가 없다.
   */
  const viewMenu: ViewerDecor["viewMenu"] = previewing
    ? []
    : [
        ...(viewer.onAdjustCover ? [{ label: "홈에 보일 부분", onPress: viewer.onAdjustCover }] : []),
        ...(viewer.onReport ? [{ label: "신고", onPress: viewer.onReport }] : []),
      ];

  /**
   * 옆 칸에 미리 그려 둘 카드. 저장된 모습 그대로다.
   *
   * 사진과 카드를 밀어 넘길 때 옆 칸이 비어 있다가 손을 떼는 순간 카드가 튀어나오면
   * 넘기는 느낌이 끊긴다.
   */
  const renderCard = (id: string) => {
    const 줄 = list.find((하나) => 하나.id === id);
    return 줄 ? <CardPreview {...faceOf(줄.card)} /> : null;
  };

  // 꾸밀 수 없는 사람에게는 「꾸미기」 한 줄도 주지 않는다. 다만 남의 카드를 열어
  // 보는 중이면 그 창은 카드 모습이라야 한다.
  const decorReady = canEdit || Boolean(openId);
  const decor: ViewerDecor | undefined = decorReady
    ? {
        open: toolsOpen,
        onOpen: startDecor,
        onBack: leaveDecor,
        onSave: () => void saveCard(),
        saveLabel: readOnly || !tripId ? "닫기" : "완료",
        history: toolsOpen && !readOnly && draft
          ? {
              canUndo: 역사.past.length > 0,
              canRedo: 역사.future.length > 0,
              onUndo: () => 옮겨_가기(draft ? undoOnce(역사, draft) : undefined),
              onRedo: () => 옮겨_가기(draft ? redoOnce(역사, draft) : undefined),
            }
          : undefined,
        menu: cardMenu,
        viewMenu,
        onExport: () => void exportCard(),
        exportLabel,
        cover: onSaveHomeCover && open && canEdit
          ? { on: cover.on, label: cover.label, onPress: () => void toggleCover() }
          : undefined,
        preview: previewing && card
          // 찍는 중에는 그린 카드가 있어야 한다(공유할 그림을 그 자리에서 찍는 경우).
          ? 카드_그림 && 카드_그림.id === open?.id && !exporting
            ? <Image source={{ uri: 카드_그림.uri }} resizeMode="contain" style={styles.cardImage} accessibilityLabel={text.title || "추억 카드"} />
            : <CardPreview card={card} photos={drawPhotos} text={text} stats={stats} stamp={stamp} onPhotoReady={markDrawn} shotRef={shot} exporting={exporting} />
          : undefined,
        // 기간과 지역은 카드 얼굴에 이미 적혀 있다. 아래에는 어떤 틀에 사진 몇 장인지만
        // 둔다. 두 줄이 되면 스트립이 밀린다.
        previewTitle: text.title || tripName,
        previewMeta: open?.meta ?? "아직 저장하지 않은 카드",
        cards: cardStrip,
        onViewCard: openTile,
        renderCard,
        busyText: busy ? busyLabel : undefined,
        body: card ? (
          <CardDecorTools
            card={card}
            tune={tune}
            onDecor={onDecor}
            allPhotos={cardPhotos}
            drawPhotos={drawPhotos}
            thumbs={thumbs}
            text={text}
            stats={stats}
            stamp={stamp}
            notice={frame?.notice ?? ""}
            suggest={suggestedStyleOf(card.style, card.photoIds.length)}
            exporting={exporting}
            shotRef={shot}
            onPhotoReady={markDrawn}
            readOnly={readOnly}
            readOnlyHint={canEdit ? "만든 사람과 관리자만 이 카드를 수정할 수 있어요" : undefined}
            theme={theme}
          />
        ) : null,
      }
    : undefined;

  return (
    <PhotoViewerScreen
      visible={Boolean(viewer.photos[viewer.index]) || Boolean(openId)}
      photos={viewer.photos}
      index={viewer.index}
      onMove={viewPhoto}
      onClose={closeWindow}
      onSave={viewer.onSave}
      saving={viewer.saving}
      saveBlocked={viewer.saveBlocked}
      onEdit={viewer.onEditPhoto}
      onDeletePhoto={viewer.onDeletePhoto}
      onReport={viewer.onReport}
      cover={viewer.cover}
      report={viewer.report}
      hint={viewer.hint}
      hintSoon={viewer.hintSoon}
      toast={viewer.toast}
      toastAction={viewer.toastAction}
      editPanel={viewer.editPanel}
      coverPanel={viewer.coverPanel}
      onCloseEdit={viewer.onCloseEditPanel}
      waitingText={viewer.waitingText}
      decor={decor}
    />
  );
}

const rowVersionOf = (rows: readonly ServerTripCard[], id: string) =>
  rows.find((줄) => 줄.id === id)?.version ?? 1;

/**
 * 사진이 다 그려질 때까지 기다린다. 다 그렸으면 참이다.
 *
 * 웹의 blob: 주소는 다 받기 전에 찍으면 빈 칸이 찍힌다. 폰은 찍는 순간 썸네일을 원본으로 바꿔
 * 다시 불러오는데, 큰 사진 네 장이면 몇 초가 걸린다. 그전에 찍으면 썸네일이 들어가서 넉넉히
 * 15초까지 기다린다. 넘기면 그대로 찍는다(저장 자체를 막지 않는다).
 */
const 그려질_때까지 = async (다_그렸나: () => boolean): Promise<boolean> => {
  for (let 번 = 0; 번 < 300; 번 += 1) {
    if (다_그렸나()) return true;
    await new Promise((멈춤) => setTimeout(멈춤, 50));
  }
  return 다_그렸나();
};

const styles = StyleSheet.create({
  // 카드를 사진처럼 볼 때. 보기 창의 카드 자리를 꽉 채우고 비율은 지킨다.
  cardImage: { width: "100%", height: "100%" },
});
