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
 * - 미리보기는 썸네일(480px)을 쓰고 내보낼 때만 표시본(1440px)으로 바꿔 찍는다.
 * - 목록은 카드마다 대표 사진 한 장만 받는다. 나머지는 그 카드를 열 때 받는다.
 * - 기록 탭으로 올려 보내는 손잡이(`onInline`)는 붙들어 둔 것만 넘긴다. 매 렌더마다
 *   새로 만들면 위에서 상태를 고치고 그 때문에 다시 렌더되는 고리가 생긴다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View } from "react-native";
import * as Crypto from "expo-crypto";
import { captureRef, releaseCapture } from "react-native-view-shot";

import { CardDecorTools, CardPreview } from "./CardDecorEditor";
import { type CardPhoto } from "./KeepsakeCardView";
import { PhotoViewerScreen, type ViewerDecor, type ViewerPhoto } from "./PhotoViewer";
import { DaymoApiError } from "./auth";
import type { CardDecor } from "./cardDecor";
import { isLivePhotoUri, downloadPhoto } from "./photoTransfer";
import {
  createTripCard,
  deleteTripCard,
  listTripCards,
  updateTripCard,
  type ServerTripCard,
} from "./serverData";
import { showAlert } from "./showAlert";
import type { AppTheme } from "./theme";
import { COVER_FAIL, coverToggleOf } from "./coverPhoto";
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
  KEEPSAKE_STYLES,
  type KeepsakeCard,
} from "./tripCard";
import { shareTripCard } from "./tripCardExport";

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
  /** ✎ 사진 고치기. 고칠 수 없는 사람에게는 주지 않는다. */
  onEditPhoto?: () => void;
  onReport?: () => void;
  report?: React.ReactNode;
  hint?: string;
  hintSoon?: boolean;
  toast?: string;
  waitingText?: string;
  /**
   * 보고 있는 사진을 홈 화면에 깔거나 내린다. 깔 수 없는 사진이면 없다.
   *
   * 홈에 까는 일은 크게 보는 자리에 있어야 한다. 지금 보고 있는 것을 홈에 까는
   * 일이라, 고치러 들어가야 보이면 고칠 생각이 없는 사람은 찾지 못한다.
   */
  cover?: { label: string; onPress: () => void };
  /**
   * 창 안에 떴다 사라지는 한 줄.
   *
   * 여행 화면 바닥의 토스트는 이 창에 가려 보이지 않는다. 창이 떠 있는 동안
   * 알릴 말은 이 길로 보낸다.
   */
  onNotice: (text: string) => void;
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
  onSaveHomeCover,
  onInline,
  canEdit,
  theme,
  notify,
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
  onInline: (것: { tiles: CardTile[]; open: (id: string) => void; create: () => void }) => void;
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
  const [exporting, setExporting] = useState(false);
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
  const onDecor = useCallback((change: (list: CardDecor[]) => CardDecor[]) => {
    setDraft((current) => (current ? { ...current, decor: change(current.decor) } : current));
  }, []);

  /** 카드를 창에 올린다. `tools` 면 도구까지 편다. */
  const openCard = useCallback((id: string, start: KeepsakeCard, tools: boolean) => {
    drawn.current = new Set();
    setDrawnKeys([]);
    setDraft(start);
    setBaseline(start);
    setOpenId(id);
    setToolsOpen(tools);
    setExporting(false);
  }, []);
  const makeCard = useCallback(() => {
    if (blocked) {
      notify(blocked);
      return;
    }
    // 「카드 만들기」는 만들러 온 것이라 곧바로 도구를 편다.
    const 시작 = keepsakeCardOf(undefined, tripName, photoIds);
    openCard("새 카드", 시작, true);
    viewerRef.current.onMove(시작.photoIds[0] ?? null);
  }, [blocked, notify, openCard, photoIds, tripName]);
  // 사진 격자에 함께 놓을 타일. 대표 사진 한 장의 색과 썸네일만 실어 보낸다.
  const tiles = useMemo<CardTile[]>(
    () =>
      list.map((줄) => ({
        id: 줄.id,
        label: 줄.label,
        color: cardPhotos.find((photo) => photo.id === 줄.coverPhotoId)?.color ?? "#E7DFD2",
        uri: thumbs[줄.coverPhotoId] ?? cardPhotos.find((photo) => photo.id === 줄.coverPhotoId)?.uri,
        onHome: 줄.id === coverCardId,
      })),
    [cardPhotos, coverCardId, list, thumbs],
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

  /** 꾸민 값을 서버에 올린다. */
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

  /** 머리줄의 「저장」. 카드를 만들거나 고치고 창을 닫는다. */
  const saveCard = async () => {
    const 지금 = draft;
    if (readOnly) {
      closeAll();
      return;
    }
    if (!tripId) {
      notify("예시 여행이라 기념 카드가 저장되지 않아요");
      closeAll();
      return;
    }
    closeAll();
    await persist(지금);
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
      showAlert("꾸미던 것을 버릴까요?", "저장하지 않은 꾸미기가 사라져요.", [
        { text: "계속 꾸미기", style: "cancel" },
        { text: "버리기", style: "destructive", onPress: 버린다 },
      ]);
      return;
    }
    버린다();
  };
  /** 머리줄의 「나가기」. 도구만 접는다. */
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
      return;
    }
    const 보던_사진 = viewerRef.current.photoId;
    const 쓸_수_있나 = 보던_사진 && cardPhotos.some((photo) => photo.id === 보던_사진);
    if (!쓸_수_있나) {
      viewerRef.current.onNotice("이 사진은 아직 카드에 넣을 수 없어요");
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
    showAlert("이 카드를 지울까요?", `${지울_것.label} 카드를 지워요. 사진은 그대로예요.`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          closeAll();
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
    if (!card || busy) return;
    if (!ready) {
      viewerRef.current.onNotice("사진을 불러오는 중이에요. 잠시 뒤에 다시 시도해 주세요");
      return;
    }
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
      // 창이 떠 있는 동안이라 여행 화면 바닥의 토스트는 가려진다. 창 안에서 알린다.
      if (결과 === "unavailable") viewerRef.current.onNotice("이 기기에서는 카드를 내보낼 수 없어요");
      else viewerRef.current.onNotice(Platform.OS === "web" ? "기념 카드를 내려받았어요" : "기념 카드를 공유했어요");
    } catch {
      viewerRef.current.onNotice("기념 카드를 만들지 못했어요");
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
  /** 도구는 접힌 채로 카드를 크게 보는 중인지. */
  const previewing = Boolean(openId) && !toolsOpen;
  /** 스트립 끝에 세울 카드. 지금 보는 카드에 표가 선다. */
  const cardStrip = useMemo(
    () => tiles.map((하나) => ({ ...하나, on: previewing && 하나.id === openId })),
    [openId, previewing, tiles],
  );

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
      // 버튼을 주지 않는다. 고를 것이 없는 안내라 확인창 대신 알림창이어야 한다.
      showAlert("홈 화면에 담기지 않아요", `${coverBlocked}.`);
      return;
    }
    try {
      await onSaveHomeCover(
        { coverCardId: cover.next },
        Object.fromEntries(chosen.map((photo) => [photo.id, thumbs[photo.id] ?? photo.uri])),
      );
      // 창이 떠 있는 동안이라 여행 화면 바닥의 토스트는 가려진다. 창 안에서 알린다.
      viewerRef.current.onNotice(cover.on ? "홈 화면에서 이 카드를 내렸어요" : "홈 화면에 이 카드를 깔았어요");
    } catch {
      viewerRef.current.onNotice(COVER_FAIL);
    }
  };

  /**
   * 꾸미기의 ⋮.
   *
   * 내보내기와 삭제는 다 꾸민 뒤에 한 번 쓰는 것이다. 네 갈래 도구에 섞어 두면
   * 매번 지나치게 되고, 머리줄에 늘어놓으면 「저장」이 묻힌다. 홈 화면에 쓰는 것은
   * 여기 있지 않다. 지금 크게 보고 있는 것을 홈에 까는 일이라 보기 쪽으로 옮겼다.
   */
  const cardMenu: ViewerDecor["menu"] = readOnly
    ? []
    : [
        {
          label: Platform.OS === "web" ? "이미지로 저장하기" : "이미지로 공유하기",
          onPress: () => void exportCard(),
        },
        ...(open && tripId ? [{ label: "카드 삭제", tone: "위험" as const, onPress: removeCard }] : []),
      ];

  /**
   * 보기의 ⋮.
   *
   * 카드를 보는 중이면 그 카드를, 사진을 보는 중이면 그 사진을 홈에 깐다. 사진 쪽
   * 몫은 기록 탭이 내려 준다(`viewer.cover`). 신고는 사진에만 있다.
   */
  const viewMenu: ViewerDecor["viewMenu"] = previewing
    ? onSaveHomeCover && open && canEdit
      ? [{ label: cover.label, onPress: () => void toggleCover() }]
      : []
    : [
        ...(viewer.cover ? [{ label: viewer.cover.label, onPress: viewer.cover.onPress }] : []),
        ...(viewer.onReport ? [{ label: "신고", onPress: viewer.onReport }] : []),
      ];

  // 꾸밀 수 없는 사람에게는 「꾸미기」 한 줄도 주지 않는다. 다만 남의 카드를 열어
  // 보는 중이면 그 창은 카드 모습이라야 한다.
  const decorReady = canEdit || Boolean(openId);
  const decor: ViewerDecor | undefined = decorReady
    ? {
        open: toolsOpen,
        onOpen: startDecor,
        onBack: leaveDecor,
        onSave: () => void saveCard(),
        saveLabel: readOnly || !tripId ? "닫기" : "저장",
        menu: cardMenu,
        viewMenu,
        preview: previewing && card
          ? <CardPreview card={card} photos={drawPhotos} text={text} stats={stats} stamp={stamp} />
          : undefined,
        // 기간과 지역은 카드 얼굴에 이미 적혀 있다. 아래에는 어떤 틀에 사진 몇 장인지만
        // 둔다. 두 줄이 되면 스트립이 밀린다.
        previewTitle: text.title || tripName,
        previewMeta: open?.label ?? "아직 저장하지 않은 카드",
        cards: cardStrip,
        onViewCard: openTile,
        busyText: busy ? "카드를 만드는 중이에요" : undefined,
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
            readOnlyHint={canEdit ? "만든 사람과 관리자만 이 카드를 고칠 수 있어요" : undefined}
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
      onReport={viewer.onReport}
      report={viewer.report}
      hint={viewer.hint}
      hintSoon={viewer.hintSoon}
      toast={viewer.toast}
      waitingText={viewer.waitingText}
      decor={decor}
    />
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
