import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "./AppText";
import { Glyph } from "./Glyph";
import {
  allChosen,
  cardFromSelection,
  deleteConfirmText,
  dragSelect,
  galleryOrder,
  galleryRows,
  groupByDate,
  keepExisting,
  rowHeightOf,
  rowOffsets,
  splitManageable,
  tileAt,
  tileSizeOf,
  toggleDay,
  toggleOne,
  uploadStateText,
  type GalleryMetrics,
  type GalleryRow,
} from "./gallerySelection";
import { downloadPhoto } from "./photoTransfer";
import { showAlert } from "./showAlert";
import type { AppTheme } from "./theme";
import { onAccent } from "./theme/colors";
import { 높이, 모서리, 여백, 누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";
import { useWebBackClose } from "./useWebBackClose";

/** 사진첩이 그리는 사진 한 장. 기록 탭의 `MemoryPhoto` 에서 필요한 몫만 받는다. */
export type GalleryItem = { id: string; date: string; color: string; caption: string; uri?: string };

/** 사진첩 바닥에 뜨는 한 줄. 되돌리기처럼 누를 것이 붙을 수 있다. */
export type GalleryToast = { message: string; action?: { label: string; onPress: () => void } };

/** 칸 사이 틈. 삼성 갤러리·구글 포토처럼 가늘게 둬서 사진이 한 판으로 읽힌다. */
const 틈 = 2;
/** 폰은 네 칸. 웹을 넓은 창으로 열면 한 칸이 손바닥만 해져서, 칸 폭이 이만큼을 넘지 않게 칸 수를 늘린다. */
const 칸_최대폭 = 180;
/** 끌면서 화면 위아래 끝에 이만큼 가까이 가면 목록이 저절로 흐른다. */
const 끝_가까이 = 64;
/** 저절로 흐를 때 한 번에 가는 거리와 간격(ms). */
const 흐름_걸음 = 14;
const 흐름_간격 = 30;

/**
 * 썸네일을 받아 둔 곳. 사진첩을 닫았다 열어도 다시 받지 않게 앱이 떠 있는 동안 남긴다.
 *
 * 격자에 표시본(긴 변 2048px)을 수십 장 깔면 폰이 버벅인다. 썸네일(480px)로 충분하다.
 */
const 받은_썸네일 = new Map<string, string>();
/** 받기를 기다리는 사진과, 받으면 알려 줄 칸들. 칸이 화면에서 사라지면 줄에서도 빠진다. */
const 기다림 = new Map<string, Set<(uri: string) => void>>();
const 줄: string[] = [];
let 일꾼 = 0;
/** 한꺼번에 받는 수. 요청 줄(`requestQueue`)이 다섯이라 그보다 적게 잡아 다른 요청이 밀리지 않게 한다. */
const 일꾼_최대 = 3;

function 썸네일_일하기() {
  while (일꾼 < 일꾼_최대 && 줄.length) {
    const id = 줄.shift() as string;
    // 그새 칸이 화면 밖으로 나가 기다리는 이가 없으면 받지 않는다. 빠르게 훑어 내리면
    // 지나친 수백 장을 다 받느라 지금 보는 칸이 한참 뒤에 뜬다.
    if (!기다림.get(id)?.size) {
      기다림.delete(id);
      continue;
    }
    일꾼 += 1;
    downloadPhoto(id, "thumbnail")
      .catch(() => undefined)
      .then((uri) => {
        const 칸들 = 기다림.get(id);
        기다림.delete(id);
        if (uri) {
          받은_썸네일.set(id, uri);
          칸들?.forEach((알림) => 알림(uri));
        }
      })
      .finally(() => {
        일꾼 -= 1;
        썸네일_일하기();
      });
  }
}

/** 썸네일을 부탁한다. 돌려주는 함수를 부르면 부탁을 거둔다. */
function 썸네일_부탁(id: string, 받음: (uri: string) => void): () => void {
  let 칸들 = 기다림.get(id);
  if (!칸들) {
    칸들 = new Set();
    기다림.set(id, 칸들);
    줄.push(id);
  }
  칸들.add(받음);
  썸네일_일하기();
  return () => {
    기다림.get(id)?.delete(받음);
  };
}

/**
 * 칸에 깔 사진 주소.
 *
 * 서버에 올라간 사진은 썸네일을 받아 쓴다. 아직 이 기기에만 있는 사진(막 고른 것, 예시
 * 여행)은 받을 곳이 없으니 가진 파일을 그대로 쓴다. 받는 동안은 사진의 색만 깔린다.
 */
function useThumb(id: string, uploaded: boolean, localUri: string | undefined): string | undefined {
  const [uri, setUri] = useState(() => 받은_썸네일.get(id));
  useEffect(() => {
    if (!uploaded || 받은_썸네일.has(id)) return;
    return 썸네일_부탁(id, setUri);
  }, [id, uploaded]);
  return uploaded ? uri ?? 받은_썸네일.get(id) : localUri;
}

type Props = {
  visible: boolean;
  /** 머리에 적을 여행 이름. */
  title: string;
  /** 기록 탭 격자와 같은 차례의 사진. */
  photos: readonly GalleryItem[];
  /** 날짜가 없는 사진을 묶을 이름. */
  undated: string;
  theme?: AppTheme;
  onClose: () => void;
  /** 사진 한 장을 크게 본다. 크게 보는 창은 `children` 으로 이 창 안에 들어온다. */
  onOpen: (id: string) => void;
  /** 서버에 다 올라간 사진. 이것만 썸네일을 받을 수 있다. */
  uploaded: ReadonlySet<string>;
  /** 아직 올라가는 중인 사진과 멈춘 사진, 올라간 정도. 기록 탭 격자와 같은 값이다. */
  uploading: ReadonlySet<string>;
  blocked: ReadonlySet<string>;
  progress: Readonly<Record<string, number | undefined>>;
  /** 편집할 수 있는 멤버인지. 아니면 삭제·카드 만들기가 없다. */
  canEdit: boolean;
  /** 이 사진을 삭제할 수 있는지(올린 사람과 관리자). */
  canManage: (id: string) => boolean;
  /** 확인까지 받은 뒤 부른다. `skipped` 는 남의 사진이라 뺀 수다. */
  onDelete: (ids: string[], skipped: number) => void;
  /** 한 장씩 차례로 저장한다. `진행` 으로 몇 번째인지 알려 준다. 알림은 부르는 쪽이 띄운다. */
  onSave: (ids: string[], 진행: (지금: number, 모두: number) => void) => Promise<void>;
  /** 고른 사진으로 카드를 시작한다. 없으면 버튼이 없다. */
  onMakeCard?: (ids: string[]) => void;
  /** 카드 한 장에 넣을 수 있는 사진 수(`KEEPSAKE_MAX_PHOTOS`). */
  maxCardPhotos: number;
  /** 바닥의 한 줄. 이 창이 여행 화면을 덮고 있어 여행 화면의 알림은 가려진다. */
  toast: GalleryToast | null;
  onToast: (toast: GalleryToast | null) => void;
  /** 크게 보는 창. iOS 는 떠 있는 Modal 옆에 형제 Modal 을 얹지 못해 이 창 안에 넣는다. */
  children?: ReactNode;
};

/**
 * 사진첩. 기록 탭의 사진이 여섯 장을 넘으면 「모두 보기」가 이 화면을 연다.
 *
 * 탭 안에서 격자를 늘리면 일기·카드가 한참 아래로 밀리고, 수십 장을 두 칸짜리 큰
 * 칸으로 훑기도 어렵다. 삼성 갤러리·구글 포토처럼 화면을 통째로 쓰고, 날짜별로 묶어
 * 네 칸씩 촘촘히 놓는다.
 *
 * 「선택」이나 사진을 길게 눌러 여러 장을 고른다. 고른 채로 손가락을 밀면 지나간
 * 사진이 한꺼번에 골라진다. 고른 것은 한꺼번에 삭제·저장하거나 카드로 만든다.
 */
export function PhotoGallery(props: Props) {
  const { visible, onClose } = props;
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const 고르기_끝 = useCallback(() => {
    setSelecting(false);
    setSelected([]);
  }, []);
  const 닫기 = useCallback(() => {
    고르기_끝();
    onClose();
  }, [onClose, 고르기_끝]);
  // 웹의 뒤로 가기도 안드로이드처럼 고르기부터 끝내고, 그다음에 사진첩을 닫는다.
  useWebBackClose(visible, 닫기);
  useWebBackClose(visible && selecting, 고르기_끝);
  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => (selecting ? 고르기_끝() : 닫기())}
    >
      {visible && (
        <GalleryBody
          {...props}
          onClose={닫기}
          selecting={selecting}
          setSelecting={setSelecting}
          selected={selected}
          setSelected={setSelected}
          endSelect={고르기_끝}
        />
      )}
    </Modal>
  );
}

function GalleryBody({
  title,
  photos,
  undated,
  theme,
  onClose,
  onOpen,
  uploaded,
  uploading,
  blocked,
  progress,
  canEdit,
  canManage,
  onDelete,
  onSave,
  onMakeCard,
  maxCardPhotos,
  toast,
  onToast,
  children,
  selecting,
  setSelecting,
  selected,
  setSelected,
  endSelect,
}: Props & {
  selecting: boolean;
  setSelecting: (on: boolean) => void;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  endSelect: () => void;
}) {
  const insets = useSafeAreaInsets();
  const bg = theme?.background ?? "#FBF8F3";
  const ink = theme?.text ?? "#2B2622";
  const muted = theme?.muted ?? "#7A716A";
  const primary = theme?.primary ?? "#C0643F";
  const border = theme?.border ?? "#E7DFD2";

  const [width, setWidth] = useState(0);
  const columns = width > 칸_최대폭 * 4 ? Math.ceil(width / 칸_최대폭) : 4;
  const metrics = useMemo<GalleryMetrics>(
    () => ({ columns, width, gap: 틈, header: 높이.버튼 }),
    [columns, width],
  );
  const sections = useMemo(() => groupByDate(photos, undated), [photos, undated]);
  const rows = useMemo(() => galleryRows(sections, columns), [sections, columns]);
  const order = useMemo(() => galleryOrder(sections), [sections]);
  const offsets = useMemo(() => rowOffsets(rows, metrics), [rows, metrics]);
  const size = tileSizeOf(metrics);
  const 고른_것 = useMemo(() => new Set(selected), [selected]);

  // 지워진 사진은 고른 목록에서도 뺀다. 다른 기기에서 지운 것이 섞여 들어올 수 있다.
  useEffect(() => {
    setSelected((지금) => keepExisting(지금, order));
  }, [order, setSelected]);

  // 바닥의 한 줄은 잠깐 뜨고 사라진다. 되돌리기가 붙으면 읽고 누를 시간을 더 준다.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => onToast(null), toast.action ? 5200 : 2400);
    return () => clearTimeout(timer);
  }, [onToast, toast]);

  /** 저장하는 중이면 몇 번째인지. 그동안은 다른 버튼을 막는다. */
  const [saving, setSaving] = useState<{ 지금: number; 모두: number } | null>(null);

  // ---- 끌어서 고르기 ----
  const list = useRef<FlatList<GalleryRow<GalleryItem>>>(null);
  const 판 = useRef<View>(null);
  /** 목록 판의 화면 위 자리. 손가락의 page 좌표에서 빼서 목록 안 자리로 바꾼다. */
  const 판_자리 = useRef({ x: 0, y: 0, h: 0 });
  const 스크롤 = useRef(0);
  const 내용_높이 = offsets[offsets.length - 1] ?? 0;
  /**
   * 길게 눌러 고른 사진. 손을 떼지 않고 밀면 여기서부터 고른다.
   *
   * 길게 누르는 동안에는 목록을 굴리지 않는다. 굴리기가 먼저 손가락을 가져가면
   * 끌어서 고르기가 시작도 못 한다(iOS 는 굴리기가 잡은 손가락을 JS 에 넘기지 않는다).
   */
  const 잡힘 = useRef<{ 차례: number; 더하기: boolean } | null>(null);
  /** 위의 것이 있는지. 목록 굴리기를 끄고 켜려고 화면 상태로도 든다. */
  const [잡는_중, set잡는_중] = useState(false);
  const [끄는_중, set끄는_중] = useState(false);
  const 끌기 = useRef<{ 시작: number; 더하기: boolean; 바탕: string[]; 마지막: number; 손: { x: number; y: number } } | null>(null);
  const 흐름 = useRef<ReturnType<typeof setInterval> | null>(null);
  const 처음_자리 = useRef({ x: 0, y: 0 });
  // 손가락이 움직일 때 읽는 값. PanResponder 는 한 번만 만들고 최신 값은 여기서 읽는다.
  const 최신 = useRef({ selecting, rows, offsets, metrics, order, selected, 내용_높이 });
  useEffect(() => {
    최신.current = { selecting, rows, offsets, metrics, order, selected, 내용_높이 };
  });

  const 판_재기 = useCallback(() => {
    판.current?.measure((_x, _y, w, h, pageX, pageY) => {
      판_자리.current = { x: pageX, y: pageY, h };
      setWidth((지금) => (Math.abs(지금 - w) < 0.5 ? 지금 : w));
    });
  }, []);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
    판_재기();
  }, [판_재기]);

  // 아래 콜백들은 PanResponder 가 손가락 이벤트 때만 부른다. ref 는 렌더 중에 읽지 않는다.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    /** 손가락 자리의 사진 차례. 머리나 목록 밖이면 -1. */
    const 손아래 = (pageX: number, pageY: number) => {
      const { rows: 줄들, offsets: 자리, metrics: 칸 } = 최신.current;
      return tileAt(줄들, 자리, 칸, pageX - 판_자리.current.x, pageY - 판_자리.current.y + 스크롤.current);
    };
    const 고르기_맞추기 = () => {
      const 지금 = 끌기.current;
      if (!지금) return;
      const 손_아래 = 손아래(지금.손.x, 지금.손.y);
      // 막 시작했는데 손가락이 날짜 머리 위면 짚은 사진만 먼저 고른다.
      const 차례 = 손_아래 < 0 && 지금.마지막 < 0 ? 지금.시작 : 손_아래;
      if (차례 < 0 || 차례 === 지금.마지막) return;
      지금.마지막 = 차례;
      setSelected(dragSelect(지금.바탕, 최신.current.order, 지금.시작, 차례, 지금.더하기));
    };
    const 흐름_멈춤 = () => {
      if (흐름.current) clearInterval(흐름.current);
      흐름.current = null;
    };
    /** 손가락이 위아래 끝에 가 있으면 목록을 저절로 굴린다. 긴 날을 한 번에 고를 수 있게. */
    const 흐름_보기 = () => {
      const 지금 = 끌기.current;
      if (!지금) return 흐름_멈춤();
      const { y, h } = 판_자리.current;
      const 방향 = 지금.손.y < y + 끝_가까이 ? -1 : 지금.손.y > y + h - 끝_가까이 ? 1 : 0;
      if (!방향) return 흐름_멈춤();
      if (흐름.current) return;
      흐름.current = setInterval(() => {
        const 끝 = Math.max(0, 최신.current.내용_높이 - 판_자리.current.h);
        const 다음 = Math.min(끝, Math.max(0, 스크롤.current + 방향 * 흐름_걸음));
        if (다음 === 스크롤.current) return;
        스크롤.current = 다음;
        list.current?.scrollToOffset({ offset: 다음, animated: false });
        고르기_맞추기();
      }, 흐름_간격);
    };
    const 끝내기 = () => {
      흐름_멈춤();
      끌기.current = null;
      set끄는_중(false);
      잡힘.current = null;
      set잡는_중(false);
    };
    return PanResponder.create({
      /**
       * 고르는 중에 옆으로 밀면 끌어서 고르기다. 위아래로 밀면 목록을 굴린다.
       *
       * 길게 눌러 잡은 뒤라면 방향을 가리지 않는다. 그때는 굴리기를 꺼 두었다.
       */
      onMoveShouldSetPanResponderCapture: (event, gesture) => {
        const 잡는다 = 잡힘.current
          ? Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4
          : 최신.current.selecting && Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;
        // 손가락이 처음 닿은 자리. 잡은 뒤의 `x0` 는 잡은 순간의 자리라 이미 옆 칸일 수 있다.
        if (잡는다) 처음_자리.current = { x: event.nativeEvent.pageX - gesture.dx, y: event.nativeEvent.pageY - gesture.dy };
        return 잡는다;
      },
      onPanResponderGrant: (event: GestureResponderEvent) => {
        const { selected: 지금_고른_것, order: 차례들 } = 최신.current;
        const 잡은_것 = 잡힘.current;
        // 손가락이 처음 닿은 자리에서 시작한다. 옆으로 10점 밀어야 잡히므로 지금 자리는 이미 옆 칸일 수 있다.
        const 시작 = 잡은_것?.차례 ?? 손아래(처음_자리.current.x, 처음_자리.current.y);
        if (시작 < 0) {
          끌기.current = null;
          return;
        }
        const 더하기 = 잡은_것 ? 잡은_것.더하기 : !지금_고른_것.includes(차례들[시작]);
        끌기.current = {
          시작,
          더하기,
          바탕: 지금_고른_것,
          마지막: -1,
          손: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY },
        };
        set끄는_중(true);
        고르기_맞추기();
      },
      onPanResponderMove: (event) => {
        const 지금 = 끌기.current;
        if (!지금) return;
        지금.손 = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        고르기_맞추기();
        흐름_보기();
      },
      onPanResponderRelease: 끝내기,
      onPanResponderTerminate: 끝내기,
      onPanResponderTerminationRequest: () => false,
    });
  });
  useEffect(() => () => {
    if (흐름.current) clearInterval(흐름.current);
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    스크롤.current = event.nativeEvent.contentOffset.y;
  }, []);

  // ---- 누르기 ----
  const 누름 = useCallback((id: string) => {
    if (최신.current.selecting) setSelected((지금) => toggleOne(지금, id));
    else onOpen(id);
  }, [onOpen, setSelected]);
  const 길게 = useCallback((id: string) => {
    const 차례 = 최신.current.order.indexOf(id);
    if (!최신.current.selecting) {
      setSelecting(true);
      setSelected([id]);
      잡힘.current = { 차례, 더하기: true };
    } else {
      잡힘.current = { 차례, 더하기: !최신.current.selected.includes(id) };
      setSelected((지금) => toggleOne(지금, id));
    }
    set잡는_중(true);
  }, [setSelected, setSelecting]);
  /**
   * 길게 누르고 밀지 않은 채 뗐을 때. 잡은 것을 놓아 목록이 다시 굴러가게 한다.
   *
   * 밀어서 끌기가 손가락을 가져갈 때도 칸의 누름이 끝나며 여기로 온다. 끌기는 그 바로
   * 뒤에 잡은 것을 읽으므로, 한 박자 미뤄서 끌기가 시작되지 않았을 때만 놓는다.
   */
  const 뗌 = useCallback(() => {
    if (!잡힘.current) return;
    setTimeout(() => {
      if (끌기.current) return;
      잡힘.current = null;
      set잡는_중(false);
    }, 0);
  }, []);
  const 날짜_고르기 = useCallback((ids: string[]) => setSelected((지금) => toggleDay(지금, ids)), [setSelected]);

  // ---- 아래 줄 ----
  const 수 = selected.length;
  const 바쁨 = Boolean(saving);
  const 삭제하기 = () => {
    if (!수 || 바쁨) return;
    const { allowed, skipped } = splitManageable(selected, canManage);
    if (!allowed.length) {
      onToast({ message: "올린 사람과 관리자만 사진을 삭제할 수 있어요" });
      return;
    }
    const 말 = deleteConfirmText(allowed.length, skipped);
    showAlert(말.title, 말.body, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          endSelect();
          onDelete(allowed, skipped);
        },
      },
    ]);
  };
  const 저장하기 = async () => {
    if (!수 || 바쁨) return;
    const 고른_차례 = [...selected];
    setSaving({ 지금: 0, 모두: 고른_차례.length });
    try {
      await onSave(고른_차례, (지금, 모두) => setSaving({ 지금, 모두 }));
      endSelect();
    } finally {
      setSaving(null);
    }
  };
  const 카드_되나 = cardFromSelection(selected, maxCardPhotos);
  const 카드로 = () => {
    if (!onMakeCard || 바쁨) return;
    if (!카드_되나.ok) {
      onToast({ message: 카드_되나.reason });
      return;
    }
    // 고르기를 여기서 끝내지 않는다. 웹에서는 고르기를 끝내면 방문 기록 칸을 걷어 내는데
    // (`useWebBackClose`), 걷기는 한 박자 늦게 일어나서 바로 뒤에 쌓이는 카드 창의 칸을 대신
    // 걷을 수 있다. 그러면 카드 창이 열리자마자 닫힌다. 카드 창을 닫고 돌아오면 고른 사진이
    // 그대로 남아 있어 이어서 고를 수도 있다.
    onMakeCard(카드_되나.ids);
  };

  const 아래_줄_높이 = selecting ? 높이.저장 + insets.bottom : insets.bottom;
  const renderItem = useCallback(
    ({ item }: { item: GalleryRow<GalleryItem> }) =>
      item.kind === "머리" ? (
        <DateHeader
          date={item.date}
          ids={item.ids}
          selecting={selecting}
          all={selecting && allChosen(selected, item.ids)}
          onToggle={날짜_고르기}
          ink={ink}
          primary={primary}
        />
      ) : (
        <View style={styles.row}>
          {item.photos.map((photo, 칸) => (
            <Tile
              key={photo.id}
              photo={photo}
              size={size}
              last={칸 === columns - 1}
              selecting={selecting}
              chosen={고른_것.has(photo.id)}
              uploaded={uploaded.has(photo.id)}
              uploadText={uploading.has(photo.id) ? uploadStateText(blocked.has(photo.id), progress[photo.id]) : ""}
              primary={primary}
              surface={theme?.surfaceAlt ?? "#F1ECE3"}
              onPress={누름}
              onLongPress={길게}
              onPressOut={뗌}
            />
          ))}
        </View>
      ),
    [blocked, columns, ink, primary, progress, selected, selecting, size, theme?.surfaceAlt, uploaded, uploading, 고른_것, 길게, 날짜_고르기, 누름, 뗌],
  );
  const getItemLayout = useCallback(
    (_data: ArrayLike<GalleryRow<GalleryItem>> | null | undefined, index: number) => ({
      length: rows[index] ? rowHeightOf(rows[index], metrics) : 0,
      offset: offsets[index] ?? 0,
      index,
    }),
    [metrics, offsets, rows],
  );

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <View style={[styles.head, { paddingTop: insets.top, borderBottomColor: border }]}>
        {selecting ? (
          <>
            {/* 아이폰 사진 앱처럼 몇 장 골랐는지는 가운데에 굵게, 「취소」는 「선택」이 있던 오른쪽
                자리에 강조색으로 둔다. 둘 다 왼쪽에 같은 모양으로 붙어 있어 구분이 안 됐다. */}
            <View style={styles.headSideSpacer} />
            <Text accessibilityLiveRegion="polite" numberOfLines={1} style={[styles.headTitle, styles.headTitleCenter, { color: ink }]}>
              {수 ? `${수}장 선택` : "사진 선택"}
            </Text>
            <Pressable
              onPress={endSelect}
              accessibilityRole="button"
              accessibilityLabel="선택 취소"
              hitSlop={누름여유(높이.칩)}
              style={({ pressed }) => [styles.headSide, styles.headSideFixed, pressed && styles.pressed]}
            >
              <Text style={[styles.headAction, { color: primary }]}>취소</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="사진 모두 보기 닫기"
              style={({ pressed }) => [styles.headBack, pressed && styles.pressed]}
            >
              <Glyph name="chevronLeft" size={22} color={ink} weight={2.2} />
              <Text numberOfLines={1} style={[styles.headTitle, { color: ink }]}>{title}</Text>
            </Pressable>
            {photos.length > 0 && (
              <Pressable
                onPress={() => setSelecting(true)}
                accessibilityRole="button"
                accessibilityLabel="여러 장 선택"
                hitSlop={누름여유(높이.칩)}
                style={({ pressed }) => [styles.headSide, pressed && styles.pressed]}
              >
                <Text style={[styles.headAction, { color: primary }]}>선택</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
      <View ref={판} collapsable={false} style={styles.body} onLayout={onLayout} {...pan.panHandlers}>
        {width > 0 && (
          <FlatList
            ref={list}
            data={rows}
            keyExtractor={(row) => row.key}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            extraData={selected}
            onScroll={onScroll}
            scrollEventThrottle={16}
            scrollEnabled={!끄는_중 && !잡는_중}
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews={Platform.OS === "android"}
            contentContainerStyle={{ paddingBottom: 아래_줄_높이 + 12 }}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: muted }]}>아직 추가한 사진이 없어요</Text>
            }
          />
        )}
      </View>
      {selecting && (
        <View style={[styles.bar, { paddingBottom: insets.bottom, backgroundColor: bg, borderTopColor: border }]}>
          {canEdit && (
            <BarAction glyph="trash" label="삭제" disabled={!수 || 바쁨} color={ink} onPress={삭제하기} />
          )}
          <BarAction
            glyph="download"
            label={saving ? `저장 중 ${saving.지금}/${saving.모두}` : "저장"}
            disabled={!수 || 바쁨}
            color={ink}
            onPress={() => void 저장하기()}
          />
          {canEdit && onMakeCard && (
            // 1~4장이 아니어도 눌리게 둔다. 흐리게만 보이고 눌러도 아무 일이 없으면 왜
            // 안 되는지 알 수 없다. 누르면 몇 장까지 되는지 한 줄로 말한다.
            <BarAction
              glyph="grid"
              label="카드로 만들기"
              disabled={바쁨}
              dim={!카드_되나.ok}
              color={ink}
              onPress={카드로}
            />
          )}
        </View>
      )}
      {toast && (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.toast, { bottom: 아래_줄_높이 + 14, backgroundColor: ink }]}
        >
          <View style={[styles.toastMark, { backgroundColor: primary }]} />
          <Text style={[styles.toastText, { color: bg }]}>{toast.message}</Text>
          {toast.action && (
            <Pressable
              onPress={() => {
                toast.action?.onPress();
                onToast(null);
              }}
              accessibilityRole="button"
              hitSlop={10}
              style={({ pressed }) => [styles.toastAction, pressed && styles.pressed]}
            >
              <Text style={[styles.toastActionText, { color: bg }]}>{toast.action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

/** 날짜 한 줄. 고르는 중이면 오른쪽에 그날 사진을 한꺼번에 고르는 버튼이 붙는다. */
const DateHeader = memo(function DateHeader({
  date,
  ids,
  selecting,
  all,
  onToggle,
  ink,
  primary,
}: {
  date: string;
  ids: string[];
  selecting: boolean;
  all: boolean;
  onToggle: (ids: string[]) => void;
  ink: string;
  primary: string;
}) {
  return (
    <View style={styles.dateRow}>
      <Text numberOfLines={1} style={[styles.dateText, { color: ink }]}>{date}</Text>
      {selecting && (
        <Pressable
          onPress={() => onToggle(ids)}
          accessibilityRole="button"
          accessibilityLabel={`${date} 사진 ${all ? "선택 해제" : "전체 선택"}`}
          hitSlop={누름여유(높이.칩)}
          style={({ pressed }) => [styles.dateAction, pressed && styles.pressed]}
        >
          <Text style={[styles.dateActionText, { color: primary }]}>{all ? "선택 해제" : "전체 선택"}</Text>
        </Pressable>
      )}
    </View>
  );
});

/** 사진 한 칸. 고르는 중이면 왼쪽 위에 동그라미가 붙고, 고른 사진은 안쪽으로 조금 줄어든다. */
const Tile = memo(function Tile({
  photo,
  size,
  last,
  selecting,
  chosen,
  uploaded,
  uploadText,
  primary,
  surface,
  onPress,
  onLongPress,
  onPressOut,
}: {
  photo: GalleryItem;
  size: number;
  last: boolean;
  selecting: boolean;
  chosen: boolean;
  uploaded: boolean;
  /** 올라가는 중이면 사진 위에 얹을 말. 다 올라갔으면 빈 글자다. */
  uploadText: string;
  primary: string;
  surface: string;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
  onPressOut: () => void;
}) {
  const uri = useThumb(photo.id, uploaded, photo.uri);
  const 이름 = photo.caption || `${photo.date} 사진`;
  return (
    <Pressable
      onPress={() => onPress(photo.id)}
      onLongPress={() => onLongPress(photo.id)}
      onPressOut={onPressOut}
      delayLongPress={350}
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityState={selecting ? { checked: chosen } : undefined}
      accessibilityLabel={selecting ? 이름 : `${이름} 크게 보기`}
      style={[styles.tile, { width: size, height: size, marginRight: last ? 0 : 틈, backgroundColor: surface }]}
    >
      <View style={[styles.tileInner, chosen && styles.tileChosen, { backgroundColor: photo.color }]}>
        {uri && <Image source={{ uri }} resizeMode="cover" style={styles.fill} />}
        {Boolean(uploadText) && (
          <View style={styles.uploadCover} pointerEvents="none">
            <Text style={styles.uploadText}>{uploadText}</Text>
          </View>
        )}
      </View>
      {selecting && (
        <View
          pointerEvents="none"
          style={[styles.check, chosen && { backgroundColor: primary, borderColor: primary }]}
        >
          {chosen && <Glyph name="check" size={13} color={onAccent(false)} weight={2.8} />}
        </View>
      )}
    </Pressable>
  );
});

/** 아래 줄의 버튼 하나. 그림 위, 이름 아래. */
function BarAction({
  glyph,
  label,
  disabled,
  dim,
  color,
  onPress,
}: {
  glyph: "trash" | "download" | "grid";
  label: string;
  disabled: boolean;
  /** 눌리기는 하지만 지금은 안 되는 것. 누르면 까닭을 말한다. */
  dim?: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || dim }}
      style={({ pressed }) => [styles.barAction, (disabled || dim) && styles.faded, pressed && styles.pressed]}
    >
      <Glyph name={glyph} size={20} color={color} weight={1.9} />
      <Text numberOfLines={1} style={[styles.barLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 여백.가로좁게,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headBack: { flex: 1, minHeight: 높이.버튼, flexDirection: "row", alignItems: "center", gap: 4 },
  headTitle: { flex: 1, fontSize: typo.title.size, fontFamily: typo.title.family },
  headSide: { minHeight: 높이.버튼, justifyContent: "center", paddingHorizontal: 여백.세로좁게 },
  headAction: { fontSize: 15, fontFamily: typo.title.family },
  // 선택 중 머리줄. 가운데 제목이 정말 가운데 오도록 양쪽 폭을 같게 잡는다.
  headTitleCenter: { textAlign: "center" },
  headSideFixed: { width: 64, alignItems: "flex-end" },
  headSideSpacer: { width: 64 },
  body: {
    flex: 1,
    // 웹에서 마우스로 끌 때 글자·사진이 파랗게 선택되지 않게 한다.
    ...(Platform.OS === "web" ? ({ userSelect: "none" } as object) : null),
  },
  dateRow: {
    height: 높이.버튼,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 여백.가로,
  },
  dateText: { flex: 1, fontSize: typo.body.size, fontFamily: typo.title.family },
  dateAction: { minHeight: 높이.칩, justifyContent: "center" },
  dateActionText: { fontSize: 13, fontFamily: typo.label.family },
  row: { flexDirection: "row", marginBottom: 틈 },
  tile: { overflow: "hidden" },
  tileInner: { flex: 1, overflow: "hidden" },
  // 고른 사진은 안쪽으로 줄어 테두리가 생긴다. 구글 포토가 쓰는 표시라 색을 못 가려 보는 사람도 알아본다.
  tileChosen: { margin: 8, borderRadius: 6 },
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  check: {
    position: "absolute",
    top: 5,
    left: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadCover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  uploadText: { fontSize: 11, color: "#FFFFFF", textAlign: "center", fontFamily: typo.label.family },
  empty: { textAlign: "center", marginTop: 48, fontSize: typo.body.size, fontFamily: typo.body.family },
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  barAction: { flex: 1, height: 높이.저장, alignItems: "center", justifyContent: "center", gap: 3 },
  barLabel: { fontSize: 12, fontFamily: typo.label.family },
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    minHeight: 46,
    borderRadius: 모서리.구역,
    paddingHorizontal: 여백.가로,
    paddingVertical: 여백.세로좁게,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#17233D",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  toastMark: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  toastText: { flex: 1, fontSize: 14, fontFamily: typo.label.family },
  toastAction: { marginLeft: 12, paddingVertical: 6 },
  toastActionText: { fontSize: 14, fontFamily: typo.title.family, textDecorationLine: "underline" },
  pressed: { opacity: 0.65 },
  faded: { opacity: 0.4 },
});
