/**
 * 추억 카드 — 꾸미는 중인 카드(초안)의 목록과, 사진 창 안에서 카드를 꾸미고 완료하는 일.
 *
 * `WarmTripDetail.tsx` 가 이미 아주 커서 여기로 뺐다.
 *
 * 카드 만들기는 **사진 몇 장을 꾸며 새 사진 한 장을 만드는 일**이다(2026-09-23).
 * - 꾸미는 중인 카드(초안)는 기기에만 있다(`cardDraftStorage.ts`). 서버에 보내지 않고,
 *   앱을 껐다 켜도 남는다. 예시 여행(`tripId` 없음)은 적을 곳이 없어 이 화면에서만 산다.
 * - 「완료」를 누르면 한 번 묻고, 카드를 원본 화질로 찍어 그 그림을 여행 기록의 **보통
 *   사진 한 장**으로 넣는다(`onFinish`, 기기에서 고른 사진과 같은 길). 사진이 된 뒤
 *   초안은 지운다. 카드라는 물건은 어디에도 남지 않는다.
 * - 꾸미다 「취소」하면 초안은 그대로 남는다. 없애는 길은 도구 안 「삭제」뿐이다.
 *
 * 카드는 **사진을 크게 보는 창과 한 창**에서 꾸민다(`PhotoViewer.tsx`). 사진을 보다가
 * 「카드 만들기」를 누르면 그 자리에서 사진이 카드가 된다. 그래서 이 화면은 초안 목록과
 * 꾸미는 상태만 들고 있고, 그리는 일은 사진 창과 도구(`CardDecorEditor.tsx`)에 맡긴다.
 *
 * 무엇을 어떻게 그릴지 정하는 계산은 전부 `tripCard.ts`·`cardDecor.ts` 에 있다.
 * 카드 그림 자체는 `KeepsakeCardView.tsx` 에 있고, 격자의 작은 카드·꾸미기·찍기가 그
 * 하나를 같이 쓴다. 보이는 그대로 저장돼야 해서다.
 *
 * 무거워지기 쉬운 화면이라 몇 가지를 지킨다.
 * - 꾸밀 때는 표시본을 쓰고 찍을 때만 원본으로 바꿔 찍는다.
 * - 목록(격자의 작은 카드)은 썸네일만 받는다. 한 번에 셋까지, 받은 것은 다시 받지 않는다.
 * - 기록 탭으로 올려 보내는 손잡이(`onInline`)는 붙들어 둔 것만 넘긴다. 매 렌더마다
 *   새로 만들면 위에서 상태를 고치고 그 때문에 다시 렌더되는 고리가 생긴다.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import * as Crypto from "expo-crypto";
import { captureRef, releaseCapture } from "react-native-view-shot";

import { CardDecorTools, CardThumb, shotLayoutOf } from "./CardDecorEditor";
import { type CardPhoto } from "./KeepsakeCardView";
import { PhotoViewerScreen, type ViewerDecor, type ViewerPhoto } from "./PhotoViewer";
import type { CardDecor } from "./cardDecor";
import { draftListOf, finishedCaptionOf, removeDraft, upsertDraft, type StoredCardDraft } from "./cardDrafts";
import { readCardDrafts, writeCardDrafts } from "./cardDraftStorage";
import { isLivePhotoUri, downloadPhoto, downloadPhotoToSave, releaseDownloadedPhoto } from "./photoTransfer";
import { isOriginalQualityUri } from "./photoSync";
import { showAlert } from "./showAlert";
import type { AppTheme } from "./theme";
import {
  keepsakeAddBlockedReason,
  keepsakeCardOf,
  keepsakeDateStamp,
  keepsakeFrameOf,
  keepsakeSizeOf,
  keepsakeStatLines,
  keepsakeTextOf,
  sameKeepsakeCard,
  suggestedStyleOf,
  KEEPSAKE_MAX_PHOTOS,
  type KeepsakeCard,
} from "./tripCard";
import { emptyHistory, recordChange, redoOnce, undoOnce, type UndoHistory } from "./undoHistory";

export type { CardPhoto };

/**
 * 기록 탭의 사진 격자에 함께 놓을 초안 한 장.
 *
 * 초안은 사진과 같은 줄에 「꾸미는 중」 표를 달고 선다. 이 화면은 목록만 넘기고,
 * 칸을 그리는 것은 기록 탭이 한다(사진 칸과 모양이 같아야 한다).
 */
export type CardTile = {
  id: string;
  label: string;
  /** 대표 사진이 아직 없을 때 깔 색. */
  color: string;
  uri?: string;
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

/** 완료한 카드를 찍은 그림. 기록 탭이 이것을 사진 한 장으로 넣는다. */
export type FinishedCard = {
  /** 찍힌 자리. 폰은 임시 파일, 웹은 data: 주소다. 받은 쪽이 제 자리로 옮긴다. */
  uri: string;
  /** 사진에 붙일 설명. 카드 제목을 직접 적었으면 그것, 아니면 빈 글자다. */
  caption: string;
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
  /** 그 줄 옆의 되돌리기 버튼. */
  toastAction?: { label: string; onPress: () => void };
  waitingText?: string;
  /** 「사진 정보」 화면. 창 안의 한 겹으로 얹힌다. */
  editPanel?: React.ReactNode;
  /** 「홈에 보일 부분」 화면. 같은 자리에 한 겹으로 얹힌다. */
  coverPanel?: React.ReactNode;
  /** 그 겹을 닫는다. */
  onCloseEditPanel?: () => void;
  /**
   * 보고 있는 사진을 대표 사진으로 설정하거나 해제한다. 할 수 없는 사진이면 없다.
   *
   * 지금 보고 있는 것에 대한 일이라 크게 보는 자리에 있어야 한다. 고치러 들어가야
   * 보이면 고칠 생각이 없는 사람은 찾지 못한다.
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

/** 초안을 적을 때 잠깐 모으는 시간(ms). 글자를 칠 때마다 쓰지 않는다. */
const WRITE_DELAY = 400;

/**
 * 기록 탭의 추억 카드 몫.
 *
 * 초안을 목록으로 위에 넘기고(`onInline`), 카드를 꾸미는 창을 그린다. 완료한 카드는
 * `onFinish` 로 기록 탭에 넘겨 사진이 되게 한다.
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
  onInline,
  onFinish,
  canEdit,
  theme,
  notify,
  viewer,
}: {
  /** 서버 여행 id. 초안을 적어 두는 열쇠다. 없으면 예시 여행이라 초안이 이 화면에서만 산다. */
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
  /**
   * 초안 목록과 손잡이를 기록 탭으로 올려 보낸다.
   *
   * 초안은 사진 격자에 함께 놓인다. 목록과 열기·만들기만 위로 넘기고 카드를
   * 꾸미는 일은 전부 이 파일에 남는다.
   */
  onInline: (것: { tiles: CardTile[]; open: (id: string) => void; create: (photoIds?: readonly string[]) => void }) => void;
  /**
   * 완료한 카드를 사진 한 장으로 넣는다. 넣었으면 참을 돌려준다. 알림도 받는 쪽이
   * 띄운다(어디에 생겼는지 보여 주려고). 거짓이면 초안을 그대로 둔다.
   */
  onFinish: (finished: FinishedCard) => Promise<boolean>;
  canEdit: boolean;
  theme?: AppTheme;
  notify: (message: string) => void;
  /** 사진을 크게 보는 창의 사진 쪽 몫. */
  viewer: CardViewer;
}) {
  // 카드에 쓸 수 있는 사진은 파일이 기기에 있는 것뿐이다. 웹의 blob: 주소는 탭을
  // 새로 열면 죽어서, 그 사진을 고르면 빈 칸이 찍힌다.
  const cardPhotos = useMemo(() => photos.filter((photo) => isLivePhotoUri(photo.uri)), [photos]);
  const photoIds = useMemo(() => cardPhotos.map((photo) => photo.id), [cardPhotos]);

  /**
   * 초안 목록. 저장 형식 그대로 들고 있다가 그릴 때 카드로 읽는다(`draftListOf`).
   * 사진이 지워지면 읽을 때 빠진다.
   *
   * 어느 여행의 것인지(`for`)를 함께 든다. 다른 여행의 목록을 이 여행 것으로 보이거나,
   * 읽기 전에 적어 둔 것을 빈 목록으로 덮으면 안 된다. 예시 여행(`tripId` 없음)은
   * 읽을 것이 없어 처음부터 읽은 셈이다.
   */
  const [stored, setStored] = useState<{ for: string | undefined; list: StoredCardDraft[] }>({ for: undefined, list: [] });
  const loaded = !tripId || stored.for === tripId;
  const drafts = useMemo(() => (stored.for === tripId ? stored.list : []), [stored, tripId]);
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  /**
   * 지금 창에서 꾸미는 초안의 id. 비어 있으면 사진을 보는 중이다.
   *
   * 초안은 누르면 바로 도구가 펴진다. 따로 크게 보는 단계는 없다 — 완성된 카드는
   * 사진이 되어 사진처럼 보이고, 아직 완성이 아닌 것은 꾸밀 것만 남아서다.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  /** 꾸미는 초안을 만든 시각. 적을 때 그대로 넘겨 차례가 흔들리지 않게 한다. */
  const [openedAt, setOpenedAt] = useState("");
  /** 사진을 보다가 카드를 시작했으면 그 사진. 취소하면 그 사진 앞으로 돌아간다. */
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  const [draft, setDraft] = useState<KeepsakeCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  /**
   * 찍을 때만 쓰는 원본 자리(사진 id → 파일).
   *
   * 꾸밀 때는 표시본이면 충분하지만, 찍는 순간에는 카드가 1080px 넘게 커진다.
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

  // 여행이 바뀌면 그 여행의 초안을 읽는다. 예시 여행은 적어 둔 것이 없다.
  useEffect(() => {
    if (!tripId) return;
    let 살아있다 = true;
    readCardDrafts(tripId).then((읽은_것) => {
      if (살아있다) setStored({ for: tripId, list: 읽은_것 });
    });
    return () => {
      살아있다 = false;
    };
  }, [tripId]);
  /**
   * 초안 목록을 바꾸고 기기에 적는다. 예시 여행은 화면에만 둔다.
   *
   * 적기는 기다리지 않는다. 못 적어도 이 화면에는 있으니 꾸미는 일이 막히지 않는다.
   */
  const persist = useCallback((list: StoredCardDraft[]) => {
    setStored({ for: tripId, list });
    if (tripId && loaded) writeCardDrafts(tripId, list).catch(() => undefined);
  }, [loaded, tripId]);

  const list = useMemo(() => draftListOf(drafts, tripName, photoIds), [drafts, tripName, photoIds]);
  // 격자 칸마다 카드를 작게 그리므로 카드에 든 사진의 썸네일을 모두 받는다.
  const listPhotoIds = useMemo(
    () => [...new Set(list.flatMap((줄) => 줄.card.photoIds))],
    [list],
  );
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
   * 꾸밀 때는 기기에 있는 표시본(긴 변 2048px)으로 그리고, 찍을 때는 원본으로 그린다.
   * 썸네일(480px)은 표시본이 없을 때만 쓴다. 예전에는 썸네일부터 써서 꾸미는 동안 사진이 흐렸고,
   * 확대해 꾸미면 더 눈에 띄었다(2026-09-22). 카드 한 장에 사진은 넷까지라 부담이 적다.
   * 격자의 작은 카드는 그대로 썸네일을 쓴다.
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
  /** 초안 한 장을 격자 칸에 작게 그릴 것. 받아 둔 썸네일이 없으면 기기에 있는 사진으로 그린다. */
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
   * 카드를 새로 열면 비운다.
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

  /**
   * 꾸미는 동안 초안을 기기에 적어 둔다. 앱이 꺼져도 남게.
   *
   * 아직 사진이 없는 새 카드는 적지 않는다. 「카드 만들기」를 눌렀다 바로 나간 자리에
   * 빈 초안이 격자에 남으면 안 된다. 이미 적어 둔 초안은 사진을 다 빼도 그대로 적는다.
   * 목록 상태는 여기서 건드리지 않는다 — 글자를 칠 때마다 격자의 작은 카드가 다시
   * 그려질 까닭이 없다. 목록은 창을 닫을 때 맞춘다(`closeAll`).
   */
  useEffect(() => {
    if (!openId || !draft || !tripId || !loaded) return;
    const 적어_둔_것 = draftsRef.current.some((줄) => 줄.id === openId);
    if (!적어_둔_것 && draft.photoIds.length === 0) return;
    const 지금 = draft;
    const timer = setTimeout(() => {
      writeCardDrafts(tripId, upsertDraft(draftsRef.current, { id: openId, card: 지금, createdAt: openedAt }, tripName))
        .catch(() => undefined);
    }, WRITE_DELAY);
    return () => clearTimeout(timer);
  }, [draft, loaded, openId, openedAt, tripId, tripName]);

  /** 초안을 창에 올리고 도구를 편다. */
  const openCard = useCallback((id: string, start: KeepsakeCard, createdAt: string, from: string | null) => {
    drawn.current = new Set();
    setDrawnKeys([]);
    setDraft(start);
    역사_바꾸기(emptyHistory());
    setOpenId(id);
    setOpenedAt(createdAt);
    setStartedFrom(from);
    setExporting(false);
  }, []);
  const makeCard = useCallback((고른_사진?: readonly string[]) => {
    if (blocked) {
      notify(blocked);
      return;
    }
    // 「카드 만들기」는 만들러 온 것이라 곧바로 도구를 편다. 사진은 비워 두고 직접 고르게 한다.
    // 예전에는 가장 최근 사진이 먼저 들어가 있어, 넣을 사진을 고르려면 그것부터 빼야 했다.
    // 사진을 보다가 만드는 길(`startDecor`)은 보던 사진이 들어간다.
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
    openCard(Crypto.randomUUID(), 시작, new Date().toISOString(), null);
    viewerRef.current.onMove(null);
    if (쓸_것.length < 고른_것.length) viewerRef.current.onNotice("업로드 중인 사진은 빼고 넣었어요");
  }, [blocked, notify, openCard, photoIds, tripName]);
  // 사진 격자에 함께 놓을 칸. 최신 초안이 먼저다(`draftListOf`).
  const tiles = useMemo<CardTile[]>(
    () =>
      list.map((줄) => {
        const 대표 = 줄.card.photoIds[0] ?? "";
        return {
          id: 줄.id,
          label: 줄.label,
          color: cardPhotos.find((photo) => photo.id === 대표)?.color ?? "#E7DFD2",
          uri: thumbs[대표] ?? cardPhotos.find((photo) => photo.id === 대표)?.uri,
          preview: <CardThumb {...faceOf(줄.card)} />,
        };
      }),
    [cardPhotos, faceOf, list, thumbs],
  );
  /** 격자에서 초안을 누르면 바로 꾸미기다. 보던 사진은 놓는다. */
  const openTile = useCallback(
    (id: string) => {
      const 줄 = list.find((하나) => 하나.id === id);
      if (!줄) return;
      openCard(줄.id, 줄.card, 줄.createdAt, null);
      viewerRef.current.onMove(null);
    },
    [list, openCard],
  );
  useEffect(() => {
    onInline({ tiles, open: openTile, create: makeCard });
  }, [makeCard, onInline, openTile, tiles]);

  /**
   * 창을 통째로 닫는다. 꾸미던 초안은 목록에 맞춰 두고(사진이 있거나 이미 적어 둔 것만),
   * 사진을 보다가 시작한 카드면 그 사진 앞으로 돌아간다.
   */
  const closeAll = (돌아갈_사진: string | null = startedFrom) => {
    if (openId && draft) {
      const 적어_둔_것 = drafts.some((줄) => 줄.id === openId);
      if (적어_둔_것 || draft.photoIds.length > 0) {
        persist(upsertDraft(drafts, { id: openId, card: draft, createdAt: openedAt }, tripName));
      }
    }
    setOpenId(null);
    setDraft(null);
    setExporting(false);
    setStartedFrom(null);
    const 지금 = viewerRef.current;
    if (돌아갈_사진 && 지금.photos.some((하나) => 하나.id === 돌아갈_사진)) 지금.onMove(돌아갈_사진);
    else 지금.onMove(null);
  };
  /** 머리줄의 「취소」. 초안은 그대로 남기고 묻지 않는다. */
  const leaveDecor = () => {
    if (busy) return;
    closeAll();
  };
  /** ✕. 창을 통째로 닫는다. */
  const closeWindow = () => {
    if (busy) return;
    closeAll(null);
  };

  /**
   * 아래 「카드 만들기」 한 줄. 보던 사진 한 장으로 새 카드를 시작한다.
   */
  const startDecor = () => {
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
    openCard(
      Crypto.randomUUID(),
      { ...keepsakeCardOf(undefined, tripName, photoIds), photoIds: [보던_사진] },
      new Date().toISOString(),
      보던_사진,
    );
  };

  /** 도구 안 「삭제」. 초안을 없애는 길은 이것뿐이다. */
  const removeCard = () => {
    const 지울_것 = openId;
    if (!지울_것 || busy) return;
    showAlert("이 카드를 삭제할까요?", "카드만 삭제되고 사진은 그대로 남아요.", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          const 돌아갈_사진 = startedFrom;
          // 목록에서 먼저 빼야 `closeAll` 이 도로 적지 않는다.
          setOpenId(null);
          setDraft(null);
          setExporting(false);
          setStartedFrom(null);
          persist(removeDraft(drafts, 지울_것));
          const 지금 = viewerRef.current;
          if (돌아갈_사진 && 지금.photos.some((하나) => 하나.id === 돌아갈_사진)) 지금.onMove(돌아갈_사진);
          else 지금.onMove(null);
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
   * 꾸미는 내내 큰 사진을 들고 있지 않고 찍는 순간에만 원본으로 바꾼다. 기기에서 고른
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
    // 기다리지 않고 찍어, 화면에 있던 썸네일이 카드에 들어간다. 글자 재기도 마찬가지다.
    drawn.current = new Set([...drawn.current].filter((key) => !key.endsWith(":d") && !key.startsWith("글자:")));
    setOriginals(받은_것);
    setExporting(true);
    const 잰다 = Date.now();
    // 글자는 찍을 배율로 다시 잰 뒤에 찍는다(`KeepsakeCardView` 의 `onDrawn`). 그 전에 찍으면
    // 옛 상자 높이에 글자가 잘려 들어갔다(2026-09-23, 「또 가자」의 아래 절반이 없었다).
    const 찍는_배 = shotLayoutOf(keepsakeSizeOf(card.ratio, card.style), true).unit;
    const 글자_열쇠 = card.decor.filter((하나) => 하나.kind === "글자").map((하나) => `글자:${하나.id}:${찍는_배}`);
    try {
      const 다_그림 = await 그려질_때까지(() =>
        drawPhotos.every((photo) => !photo.uri || drawn.current.has(`${photo.id}:d`))
        && 글자_열쇠.every((열쇠) => drawn.current.has(열쇠)));
      if (__DEV__ && !다_그림) console.log("추억 카드: 사진을 다 기다리지 못하고 찍었다");
      const size = keepsakeSizeOf(card.ratio, card.style);
      // 폰은 카드를 이미 찍힐 크기로 키워 두었으니(`keepsakeShotScale`) 크기를 넘기지 않는다.
      // 넘기면 iOS 는 그 값을 포인트로 읽어 기기 배율만큼 또 키운다. 네컷 2160x6480 을
      // PNG 로 찍으면 20MB 가까이 되어 JPEG(95)로 찍는다. 웹은 PNG data: 주소로 찍히고,
      // 받는 쪽(`WarmTripDetail`)이 JPEG 로 바꿔 넣는다.
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

  const finishCard = async (id: string, 지금: KeepsakeCard) => {
    // 그리는 동안은 창을 닫지 않는다. 찍을 카드가 이 창에 떠 있어야 한다.
    setBusy(true);
    let 찍음: { 찍은_것: string; 원본_못_받음: boolean } | undefined;
    let 넣었다 = false;
    try {
      찍음 = await 원본으로_찍기();
      넣었다 = await onFinish({ uri: 찍음.찍은_것, caption: finishedCaptionOf(지금, tripName) });
    } catch {
      viewerRef.current.onNotice("저장할 이미지를 만들지 못했어요");
    } finally {
      if (찍음) releaseCapture(찍음.찍은_것);
      setBusy(false);
    }
    if (!넣었다) return;
    // 사진이 됐으니 초안은 지운다. 목록에서 먼저 빼야 `closeAll` 이 도로 적지 않는다.
    setOpenId(null);
    setDraft(null);
    setExporting(false);
    setStartedFrom(null);
    persist(removeDraft(drafts, id));
    viewerRef.current.onMove(null);
  };

  /**
   * 머리줄의 「완료」. 한 번 묻고, 카드를 찍어 사진으로 넣고, 초안을 지운다.
   *
   * 되돌릴 수 없는 일이라 묻는다. 완료한 뒤에는 카드가 아니라 사진이라 더 고칠 수 없다.
   * 웹에서도 물으려고 `showAlert` 를 쓴다(`Alert.alert` 은 웹에서 아무 일도 하지 않는다).
   */
  const saveCard = () => {
    const 지금 = draft;
    if (!지금 || !openId || busy) return;
    // 사진 없이 시작한 새 카드. 빈 카드는 사진이 되지 않는다.
    if (지금.photoIds.length === 0) {
      viewerRef.current.onNotice("카드에 넣을 사진을 골라 주세요");
      return;
    }
    if (!ready) {
      viewerRef.current.onNotice("사진을 불러오는 중이에요. 잠시 뒤에 다시 시도해 주세요");
      return;
    }
    showAlert("카드를 완료할까요?", "완료하면 더 고칠 수 없어요. 여행 기록에 사진으로 저장돼요.", [
      { text: "취소", style: "cancel" },
      { text: "완료", onPress: () => void finishCard(openId, 지금) },
    ]);
  };
  /**
   * 꾸미기의 ⋮.
   *
   * 삭제 하나만 남는다. 자주 쓰는 것을 메뉴 안에 두면 있는 줄도 모르고, 되돌릴 수 없는
   * 삭제를 줄에 내놓으면 잘못 눌린다. 남는 것이 삭제뿐인 까닭이다.
   */
  const cardMenu: ViewerDecor["menu"] = openId
    ? [{ label: "카드 삭제", tone: "위험" as const, onPress: removeCard }]
    : [];

  /**
   * 보기의 ⋮. 사진을 보고 있을 때의 사진 정보와 신고다.
   */
  const viewMenu: ViewerDecor["viewMenu"] = [
    ...(viewer.onAdjustCover ? [{ label: "홈에 보일 부분", onPress: viewer.onAdjustCover }] : []),
    ...(viewer.onReport ? [{ label: "신고", onPress: viewer.onReport }] : []),
  ];

  // 꾸밀 수 없는 사람에게는 「카드 만들기」 한 줄도 주지 않는다.
  const decor: ViewerDecor | undefined = canEdit
    ? {
        open: Boolean(openId),
        onOpen: startDecor,
        onBack: leaveDecor,
        onSave: saveCard,
        saveLabel: "완료",
        history: draft
          ? {
              canUndo: 역사.past.length > 0,
              canRedo: 역사.future.length > 0,
              onUndo: () => 옮겨_가기(draft ? undoOnce(역사, draft) : undefined),
              onRedo: () => 옮겨_가기(draft ? redoOnce(역사, draft) : undefined),
            }
          : undefined,
        menu: cardMenu,
        viewMenu,
        busyText: busy ? "사진으로 저장하는 중이에요" : undefined,
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
      onMove={viewer.onMove}
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
