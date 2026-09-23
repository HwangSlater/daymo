import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { keepTripPhoto } from "../tripPhotos";
import { DaymoApiError } from "../auth";
import { retryBlockedRows, useSyncTrouble } from "../useListSync";
import { isServerId } from "../listSync";
import {
  DIARY_UNTITLED,
  UNDATED,
  자리에_넣기,
  type MemoryPhoto,
  type PlaceItem,
  type ScheduleItem,
  type StayInfo,
  type TravelDiary,
  type TripMemoryData,
} from "../tripPlanning";
import { dateKey, dateLabelOf, dayTextOf } from "../dates";
import { memoryDayCount, memoryFilterChips, memoryHeadCount, type MemoryFilter } from "../memoryFilter";
import { originalSaveHint, photoTakenDate, tidyLinks, type PhotoLink, type PhotoLinkTarget } from "../photoSync";
import { PhotoEditScreen, confirmPhotoDelete } from "../PhotoViewer";
import { photoUploadHeadline, photoUploads, usePhotoUploads } from "../photoUploads";
import { usePhotoThumb, usePhotoThumbs } from "../photoThumbnails";
import { TripCardsSection, type CardPhoto, type CardTile, type FinishedCard } from "../TripCards";
import { PhotoGallery, type GalleryToast } from "../PhotoGallery";
import { deletedText, memoryPreview, reinsertAt, savedText, uploadStateText } from "../gallerySelection";
import { KEEPSAKE_MAX_PHOTOS } from "../tripCard";
import { downloadPhotoToSave, isLivePhotoUri } from "../photoTransfer";
import { savePhotoFile } from "../photoSave";
import type { HomeCoverChoice } from "../serverData";
import { listTrash, restoreFromTrash } from "../serverData";
import { josa } from "../tripExpenses";
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Text } from "../AppText";
import { Glyph } from "../Glyph";
import { showAlert } from "../showAlert";
import { shrinkForWeb } from "../webImage";
import { 높이, 모서리, 아이콘, 누름여유, 글자누름여유 } from "../theme/controls";
import { typo } from "../theme/typography";
import { COVER_FAIL, COVER_UNDO, coverNowOf, coverPickable, coverToggleOf, coverUndoBody } from "../coverPhoto";
import { COVER_FOCUS_DEFAULT, focusBody, type CoverFocus } from "../coverCrop";
import { CoverFocusScreen } from "../ui/CoverFocusScreen";
import { 공용스타일 } from "./styles";
import { CoverBadge, DetailEditableContext, DetailFeedbackContext, DetailField, DetailSheet, DetailThemeContext, EmptyState, FeedbackAction, ListMoreButton, NO_IDS, OptionField, OptionalFormSection, ReportForm, ReportLink, SectionLabel, TabActionHeader, newPlaceId, requiredDot, useDraftChanged } from "./parts";

/** 여행 상세의 「기록」 탭. 사진·일기·메모와 추억 카드를 본다. */

/**
 * 한 번에 고를 수 있는 사진 수.
 *
 * 여행이 끝나면 한 번에 수십 장을 넣는다. 한 장씩 고르게 하면 그만큼 창을 연다.
 * 올리기는 줄을 서서 뒤 순위로 나가므로(`photoTransfer`) 고른 수가 많아도 보고 있는
 * 화면이 밀리지 않는다.
 */
const PHOTO_PICK_LIMIT = 50;
/**
 * 올라가는 사진 위에 적을 한 줄. 진행을 모르면 수는 적지 않는다.
 *
 * 말은 문구 사전을 따른다(`docs/development/13-copy-glossary.md`): 업로드 중·업로드 실패.
 * 사진첩(`PhotoGallery.tsx`)도 같은 말을 써서 `gallerySelection.ts` 로 옮겼다.
 */
const 업로드_말 = uploadStateText;
/** 기기에서 막 고른 사진 한 장. 아직 기록에 들어가기 전이다. */
type PickedPhoto = {
  uri: string;
  /** 사진에 적힌 촬영 날짜(`YYYY-MM-DD`). 없으면 빈 글자다. */
  takenOn: string;
};
const NO_CARDS: CardTile[] = [];
/** 올라간 사진이 아직 없을 때. 사진첩에 렌더마다 새 집합을 넘기지 않으려고 둔다. */
const NO_PHOTO_IDS: ReadonlySet<string> = new Set();
/** 카드 쪽(`TripCardsSection`)이 기록 탭으로 올려 보내는 초안 목록과 손잡이. */
type CardHandles = {
  tiles: CardTile[];
  open: (id: string) => void;
  create: (photoIds?: readonly string[]) => void;
  /** 격자 칸의 ✕. 한 번 묻고 초안을 지운다. */
  remove: (id: string) => void;
};
/**
 * 사진첩에서 한꺼번에 지운 뒤 기기의 파일을 남겨 두는 시간(ms). 알림의 「되돌리기」가
 * 떠 있는 동안(5.2초)보다 조금 길게 잡는다.
 */
const 사진_되돌리기_여유 = 8000;

/** 격자에 놓이는 칸 하나. 사진이거나 꾸미는 중인 카드다. */
type MemoryTile =
  | { kind: "photo"; key: string; photo: MemoryPhoto; index: number }
  | { kind: "card"; key: string; card: CardTile };

export function Memories({
  tripName,
  tripDate,
  tripRegion,
  tripDateKeys: tripKeys,
  dayOptions,
  todayDay,
  memories,
  setMemories,
  places,
  schedule,
  stay,
  participants,
  spentTotal,
  cardTripId,
  coverPhotoId,
  coverFocus,
  onSaveHomeCover,
  onNeedDisplayPhotos,
  uploadedPhotoIds,
  reportSpaceId,
  isOwner = false,
  myMembershipId,
  scrollToY,
  onPhotosRestored,
  trash,
}: {
  /** 스크롤 내용 맨 위에서 잰 자리로 내려 보낸다. 카드를 완료한 알림의 「보기」가 쓴다. */
  scrollToY?: (y: number) => void;
  /** 사진 격자 아래에 놓을 휴지통(`TripTrash`). 서버 여행이고 고칠 수 있을 때만 온다. */
  trash?: React.ReactNode;
  /**
   * 휴지통에서 사진을 되살렸을 때. 사진첩의 「되돌리기」가 부른다. 부르는 쪽이 사진
   * 목록을 서버에서 다시 받는다(휴지통 시트의 되돌리기와 같은 길이다).
   */
  onPhotosRestored?: (ids: string[]) => void;
  tripName: string;
  tripDate: string;
  tripRegion: string;
  /** 여행 날짜 키(YYYY-MM-DD). 여행 중에 쓴 일기를 그날에 둔다. */
  tripDateKeys: string[];
  /** 여행 날짜 칸. 비용 탭과 같은 목록에서 고르게 해야 손놀림이 같다. */
  dayOptions: string[];
  /** 여행 중이면 오늘. 사진은 대개 찍은 날에 넣는다. */
  todayDay: string;
  memories: TripMemoryData;
  setMemories: React.Dispatch<React.SetStateAction<TripMemoryData>>;
  /** 사진을 붙일 수 있는 곳. 추억 카드의 숫자도 여기서 센다. */
  places: PlaceItem[];
  schedule: ScheduleItem[];
  stay: StayInfo;
  /** 이번 여행에 간 사람. 추억 카드의 `함께 간 사람` 줄에 쓴다. */
  participants: string[];
  /** 통화까지 붙인 지출 합. 추억 카드의 `쓴 돈` 통계에 쓴다. */
  spentTotal: string;
  /** 서버 여행 id. 카드 초안을 기기에 적는 열쇠다. 없으면 예시 여행이라 초안이 이 화면에서만 산다. */
  cardTripId?: string;
  /** 홈 화면의 여행 카드에 깔린 사진 한 장. */
  coverPhotoId?: string;
  onSaveHomeCover?: (
    고른_것: HomeCoverChoice,
    localUris?: Record<string, string | undefined>,
  ) => Promise<void>;
  /** 대표 사진에서 홈 카드에 보여 주는 부분. 다시 맞출 때 여기서 시작한다. */
  coverFocus?: CoverFocus;
  /**
   * 표시본(긴 변 2048px)이 필요한 사진을 알린다(2026-09-23 검토 #6가).
   *
   * 격자·장소 줄의 작은 칸은 썸네일로 그리니 여기에 담지 않는다. 크게 보기로 연 한 장과
   * 그 앞뒤 한 장, 카드에 넣을 사진만 담는다. 받는 일은 부르는 쪽이 한다.
   */
  onNeedDisplayPhotos?: (ids: readonly string[]) => void;
  /** 서버에 다 올라간 사진. 올라간 사진만 홈 화면에 깔 수 있다. */
  uploadedPhotoIds?: ReadonlySet<string>;
  /** 서버 여행일 때만. 있으면 사진과 일기 수정 시트에 신고가 보인다. */
  reportSpaceId?: string;
  /** 공간 관리자인지. 남이 올린 사진도 고칠 수 있다. */
  isOwner?: boolean;
  myMembershipId?: string;
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const canEdit = useContext(DetailEditableContext);
  /**
   * 사진첩(`PhotoGallery.tsx`)이 열려 있는지. 사진이 여섯 장을 넘으면 「모두 보기」가 연다.
   *
   * 사진첩은 여행 화면을 통째로 덮는 창이라 여행 화면 바닥의 알림이 가려진다. 열려
   * 있는 동안의 알림은 사진첩 바닥에 띄운다(`알림`).
   */
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryToast, setGalleryToast] = useState<GalleryToast | null>(null);
  const galleryOpenRef = useRef(false);
  useEffect(() => {
    galleryOpenRef.current = galleryOpen;
  }, [galleryOpen]);
  /** 알림을 지금 보이는 자리로 보낸다. */
  const 알림 = useCallback((message: string, action?: FeedbackAction) => {
    if (galleryOpenRef.current) setGalleryToast({ message, action });
    else notify(message, action);
  }, [notify]);
  const closeGallery = useCallback(() => {
    setGalleryOpen(false);
    setGalleryToast(null);
  }, []);
  /**
   * 이 사진을 고치고 지울 수 있는지. 서버는 올린 사람과 관리자만 받는다(photos.can_manage).
   *
   * 올린 사람이 비어 있으면 이 기기에서 막 고른 사진이라 내 것이다. 새로 올릴 때는 사진이 없다.
   */
  const canManagePhoto = (photo?: MemoryPhoto) =>
    canEdit && (!photo || isOwner || photo.uploaderMembershipId === undefined || photo.uploaderMembershipId === myMembershipId);
  const { photos, diaries } = memories;
  const setPhotos: React.Dispatch<React.SetStateAction<MemoryPhoto[]>> = (update) =>
    setMemories((current) => ({
      ...current,
      photos: typeof update === "function" ? update(current.photos) : update,
    }));
  const setDiaries: React.Dispatch<React.SetStateAction<TravelDiary[]>> = (update) =>
    setMemories((current) => ({
      ...current,
      diaries: typeof update === "function" ? update(current.diaries) : update,
    }));
  const [photoEditing, setPhotoEditing] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [photoSelected, setPhotoSelected] = useState(false);
  /** 방금 고른 새 사진들. 추가할 때만 차고, 고칠 때는 비어 있다. */
  const [photoDrafts, setPhotoDrafts] = useState<PickedPhoto[]>([]);
  /** 시스템 고르기 창이 열려 있는지. 두 번 열면 웹에서 앞의 창이 그대로 남는다. */
  const [picking, setPicking] = useState(false);
  /**
   * 크게 보고 있는 사진.
   *
   * 사진을 누르면 고치는 창이 아니라 이 창이 먼저 열린다. 사진첩을 넘겨 보는 자리라
   * 누를 때마다 입력 칸이 뜨면 훑어볼 수가 없다. 고치기는 여기서 한 번 더 눌러 들어간다.
   */
  const [viewingPhotoId, setViewingPhotoId] = useState<string | null>(null);
  /** 오늘. 원본을 며칠까지 받을 수 있는지 셀 때 쓴다. */
  const todayKey = dateKey(new Date());
  /** 사진 한 장을 기기에 저장하는 중인지. 「전부 저장」은 없앴다(아래 `saveOnePhoto`). */
  const [saving, setSaving] = useState(false);
  /**
   * 크게 보는 화면에 떴다 사라지는 한 줄.
   *
   * 저장했다고 알리는 자리다. 이 화면은 화면을 통째로 덮는 `Modal` 이라, 여행 화면
   * 바닥에 깔린 토스트(`DetailFeedbackContext`)가 뒤에 가려 보이지 않는다.
   *
   * 홈 화면을 바꿀 때는 옆에 되돌리기가 붙는다. 새로 깔면 전에 깔아 둔 것이
   * 내려가는데, 물을 때마다 걸리적거리므로 묻지 않고 되돌릴 길만 준다.
   */
  const [photoToast, setPhotoToast] = useState("");
  const [photoUndo, setPhotoUndo] = useState<{ label: string; onPress: () => void } | null>(null);
  /** 창 안에서 한 줄 알린다. 되돌릴 것이 있으면 단추까지 함께 띄운다. */
  const notifyInViewer = (text: string, undo?: { label: string; onPress: () => void }) => {
    setPhotoToast(text);
    // 상태에 함수를 넣을 때는 함수를 돌려주는 함수여야 한다. 그냥 넘기면 React 가
    // 값을 고치는 함수로 본다.
    setPhotoUndo(() => undo ?? null);
  };
  /** 크게 보는 화면의 ⋮ 에서 연 신고 폼. */
  const [reporting, setReporting] = useState(false);
  /** 홈에 보일 부분을 맞추는 중인 사진. 맞추고 나서야 홈에 깔린다. */
  const [focusing, setFocusing] = useState<{ photoId: string; uri?: string; initial: CoverFocus } | null>(null);
  /** 격자 위의 필터. 사진과 꾸미는 중인 카드를 한 격자에 놓고 여기서 갈라 본다. */
  const [photoFilter, setPhotoFilter] = useState<MemoryFilter>("전체");
  /** 카드 초안 목록과 손잡이. `TripCardsSection` 이 넘겨 준다. */
  const [cards, setCards] = useState<CardHandles>();
  const takeCards = useCallback((것: CardHandles) => setCards(것), []);
  const [photoColor, setPhotoColor] = useState("#E7B4A6");
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoDate, setPhotoDate] = useState(todayDay || dayOptions[0] || UNDATED);
  const photoDayOptions = useMemo(() => {
    const known = [...dayOptions, UNDATED];
    const extra = Array.from(new Set(photos.map((photo) => photo.date)))
      .filter((date) => date && !known.includes(date));
    return [...known, ...extra];
  }, [dayOptions, photos]);
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoLinks, setPhotoLinks] = useState<PhotoLink[]>([]);
  /**
   * 사진을 붙일 수 있는 곳.
   *
   * 일정은 고른 날의 것만 보인다. 사흘치 일정을 한 줄로 늘어놓으면 고를 수가 없고,
   * 사진의 날짜를 이미 고른 뒤라 그날 밖의 일정에 붙일 일이 드물다.
   */
  const photoLinkOptions = useMemo<PhotoLinkOption[]>(() => {
    const 숙소 = stay.id && stay.name
      ? [{ targetType: "stay" as const, targetId: stay.id, label: `숙소 · ${stay.name}` }]
      : [];
    const 일정 = schedule
      .filter((item) => item.id && (!item.date || item.date === photoDate))
      .map((item) => ({ targetType: "schedule" as const, targetId: item.id as string, label: `일정 · ${item.title}` }));
    const 장소 = places.map((place) => ({ targetType: "place" as const, targetId: place.id, label: place.name }));
    return [...숙소, ...일정, ...장소];
  }, [places, photoDate, schedule, stay.id, stay.name]);
  const [diaryWriting, setDiaryWriting] = useState(false);
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryBody, setDiaryBody] = useState("");
  const [diaryTitleOpen, setDiaryTitleOpen] = useState(false);
  const [editingDiaryId, setEditingDiaryId] = useState<string | null>(null);
  const diaryDraftChanged = useDraftChanged(diaryWriting, JSON.stringify([diaryTitle, diaryBody]));
  // 고른 사진 자체는 다시 고르면 되고, 적은 날짜·설명·연결만 지키면 된다.
  const photoDraftChanged = useDraftChanged(
    photoEditing && !editingPhotoId,
    JSON.stringify([photoDate, photoCaption, photoLinks]),
  );
  // 추억 카드에 올릴 사진. 색과 설명만 넘긴다(`TripCards.tsx` 가 나머지를 한다).
  const cardPhotos = useMemo<CardPhoto[]>(
    // 카드를 찍을 때 원본을 받을 수 있는지도 함께 넘긴다. 기한이 지난 사진은
    // 표시본밖에 없어서 받아 봐야 소용이 없다.
    () => photos.map(({ id, color, caption, uri, originalUntil }) => ({
      id, color, caption, uri, hasOriginal: originalSaveHint(originalUntil, todayKey).hasOriginal,
    })),
    [photos, todayKey],
  );
  const cardCounts = useMemo(
    () => ({ places: places.length, photos: photos.length, days: dayOptions.length, spent: spentTotal }),
    [dayOptions.length, photos.length, places.length, spentTotal],
  );
  /**
   * 아직 서버에 올라가지 않은 사진.
   *
   * 여러 장을 한꺼번에 고르면 한 장씩 올라간다. 그동안 아무 표시도 없으면 홈에 쓰려고
   * 열었을 때 줄이 없는 까닭을 알 수 없다. 예시 여행은 올릴 곳이 없어 세지 않는다.
   */
  const uploadingPhotoIds = useMemo(
    () => new Set(cardTripId ? photos.filter((photo) => !uploadedPhotoIds?.has(photo.id)).map((photo) => photo.id) : []),
    [cardTripId, photos, uploadedPhotoIds],
  );
  const syncTrouble = useSyncTrouble();
  /**
   * 올리기 진행. 수는 앱 전역 대기열이 센다(`photoUploads.ts`).
   *
   * 화면이 들고 있으면 여행을 나갔다 들어올 때마다 전체 수를 잊어버려 「남은 12장」
   * 밖에 못 쓴다. 대기열이 묶음 전체를 들고 있으니 「12/40」 으로 적을 수 있다.
   */
  const photoUploadState = usePhotoUploads(cardTripId);
  /**
   * 서버가 거부해 멈춘 사진. 까닭은 줄마다 배지로 붙고(`SyncMark`) 여기서는 수만 센다.
   *
   * 멈춘 사진은 두 곳에서 온다. 파일을 보내다 거부당한 것은 대기열이, 설명·날짜를
   * 고치다 거부당한 것은 목록 동기화가 안다. 같은 사진이 두 번 세지지 않게 합친다.
   */
  const blockedPhotoIds = useMemo(() => {
    const 멈춘_것 = new Set(photoUploadState.blocked);
    photos.forEach((photo) => {
      if (syncTrouble.rows.get(photo.id)?.state === "막힘") 멈춘_것.add(photo.id);
    });
    // 이미 지운 사진까지 세면 걷히지 않는 줄이 남는다.
    return new Set(photos.filter((photo) => 멈춘_것.has(photo.id)).map((photo) => photo.id));
  }, [photoUploadState.blocked, photos, syncTrouble]);
  const uploadHeadline = photoUploadHeadline({ ...photoUploadState, blocked: [...blockedPhotoIds] });
  /** 크게 보고 있는 사진과 그 차례. 지우면 목록에서 사라지므로 창도 닫힌다. */
  const viewIndex = photos.findIndex((photo) => photo.id === viewingPhotoId);
  const viewing = viewIndex < 0 ? undefined : photos[viewIndex];
  /**
   * 카드에 넣으려고 고른 사진. 카드 무대는 표시본으로 그리고 찍을 때 원본을 받는다
   * (`TripCards`). 썸네일만 있으면 흐린 채로 찍힌다.
   */
  const [카드에_쓸_사진, 카드에_쓸_사진_두기] = useState<readonly string[]>(NO_IDS);
  /**
   * 표시본을 받아야 할 사진(2026-09-23 검토 #6가).
   *
   * 크게 보기로 연 한 장과 그 앞뒤 한 장이다. 앞뒤를 미리 받아 둬야 넘길 때 빈 칸이
   * 스치지 않는다. 여기에 카드에 넣을 사진을 더한다.
   */
  const 표시본_필요 = useMemo(() => {
    const 것 = new Set(카드에_쓸_사진);
    if (viewIndex >= 0) {
      [viewIndex, viewIndex + 1, viewIndex - 1]
        .filter((차례) => 차례 >= 0 && 차례 < photos.length)
        .forEach((차례) => 것.add(photos[차례].id));
    }
    return [...것].join("|");
  }, [photos, viewIndex, 카드에_쓸_사진]);
  // 목록이 바뀔 때마다 같은 내용의 새 배열을 올려 보내면 그것만으로 받는 쪽이 다시 돈다.
  // 글자 하나로 견줘 내용이 정말 바뀐 때만 알린다.
  useEffect(() => {
    onNeedDisplayPhotos?.(표시본_필요 ? 표시본_필요.split("|") : NO_IDS);
  }, [onNeedDisplayPhotos, 표시본_필요]);
  /**
   * 크게 보기의 아래 줄(스트립)과 옆 칸에 깔 썸네일.
   *
   * 표시본은 보고 있는 한 장과 앞뒤만 받으므로(2026-09-23 검토 #6가) 나머지 칸은 색만
   * 남는다. 스트립은 어디로 넘길지 고르는 줄이라 그림이 없으면 쓸모가 없다. 지금 자리
   * 둘레만 썸네일로 채운다 — 줄은 지금 자리로 스스로 스크롤하니 보이는 곳이 거기다.
   * 넘기는 동안에도 흐린 그림이 먼저 뜨고 표시본이 오면 또렷해진다.
   */
  const 스트립_사진 = useMemo(() => {
    if (viewIndex < 0) return NO_IDS;
    return photos
      .slice(Math.max(0, viewIndex - 10), viewIndex + 11)
      .filter((photo) => !isLivePhotoUri(photo.uri) && (uploadedPhotoIds?.has(photo.id) ?? false))
      .map((photo) => photo.id);
  }, [photos, uploadedPhotoIds, viewIndex]);
  const 스트립_썸네일 = usePhotoThumbs(스트립_사진);
  /**
   * 크게 보기에 넘길 목록. 파일이 없는 칸만 썸네일로 바꿔 놓는다.
   *
   * 고치기·홈 대표는 이 목록이 아니라 원래 `photos` 를 쓴다. 썸네일 자리를 그쪽에 넘기면
   * 「사진을 바꿨다」로 읽혀 새 사진으로 다시 올라간다.
   */
  const viewerPhotos = useMemo(
    () => (viewIndex < 0 ? photos : photos.map((photo) => (
      isLivePhotoUri(photo.uri) || !스트립_썸네일[photo.id] ? photo : { ...photo, uri: 스트립_썸네일[photo.id] }
    ))),
    [photos, viewIndex, 스트립_썸네일],
  );
  /** 표시본을 다 받으면 열 카드. 사진첩에서 고른 사진으로 카드를 시작할 때만 찬다. */
  const 기다리는_카드 = useRef<readonly string[] | null>(null);
  const 파일이_있나 = useCallback(
    (id: string) => isLivePhotoUri(photos.find((photo) => photo.id === id)?.uri),
    [photos],
  );
  /** 초안이 여섯 장을 넘을 때 그 자리에서 다 폈는지. 사진은 펴지 않고 사진첩을 연다. */
  const [showAllCards, setShowAllCards] = useState(false);
  /**
   * 카드를 완료해 방금 생긴 사진. 잠깐 테두리를 둘러 어디 생겼는지 보여 준다.
   *
   * 완료하면 「사진」 칩으로 바꾸고(새 사진은 첫 칸이다), 알림의 「보기」로 격자까지
   * 내려 준다. 카드 창이 사진첩 안에 열려 있었으면 「보기」가 사진첩을 닫는다.
   */
  const [새_사진, 새_사진_표시] = useState<string | null>(null);
  const 기록_맨위 = useRef(0);
  const 격자_머리 = useRef(0);
  useEffect(() => {
    if (!새_사진) return;
    const timer = setTimeout(() => 새_사진_표시(null), 3000);
    return () => clearTimeout(timer);
  }, [새_사진]);
  const [showAllDiaries, setShowAllDiaries] = useState(false);
  const cardTiles = cards?.tiles ?? NO_CARDS;
  /**
   * 격자에 놓을 것. 사진이 먼저고 꾸미는 중인 카드가 뒤다.
   *
   * 한동안 카드를 앞에 세웠다. 「더 보기」 뒤로 숨지 않게 하려던 것인데, 이 격자는
   * 「여행 사진」 자리라 첫 칸을 사진으로 알고 누른다. 누르면 꾸미기가 열려서
   * 눌러 본 사람이 "사진을 눌렀는데 왜 카드가 뜨지" 로 읽었다. 초안은 바로 위
   * 「카드 N」 칩으로 한 번에 모아 볼 수 있으니 뒤로 보낸다.
   */
  const tiles = useMemo<MemoryTile[]>(() => {
    const 사진 = photoFilter === "카드"
      ? []
      : photos.map((photo, index): MemoryTile => ({ kind: "photo", key: `photo:${photo.id}`, photo, index }));
    const 카드 = photoFilter === "사진"
      ? []
      : cardTiles.map((card): MemoryTile => ({ kind: "card", key: `card:${card.id}`, card }));
    return [...사진, ...카드];
  }, [cardTiles, photoFilter, photos]);
  const 미리보기 = memoryPreview(photoFilter, photos.length, cardTiles.length, showAllCards);
  const shownTiles = useMemo(
    () => [
      ...tiles.filter((tile) => tile.kind === "photo").slice(0, 미리보기.photos),
      ...tiles.filter((tile) => tile.kind === "card").slice(0, 미리보기.cards),
    ],
    [tiles, 미리보기.cards, 미리보기.photos],
  );
  // 저장했다는 한 줄은 잠깐 뜨고 사라진다. 여행 화면 바닥의 토스트와 같은 시간을 쓴다.
  useEffect(() => {
    if (!photoToast) return;
    // 되돌리기가 붙은 줄은 조금 더 오래 둔다. 읽고 손이 가기까지 시간이 든다.
    const timer = setTimeout(() => {
      setPhotoToast("");
      setPhotoUndo(null);
    }, photoUndo ? 5200 : 2200);
    return () => clearTimeout(timer);
  }, [photoToast, photoUndo]);
  /** 사진을 넘기거나 창을 닫는다. 열어 둔 신고 폼도 함께 닫는다. */
  const moveViewing = (photoId: string | null) => {
    setReporting(false);
    setViewingPhotoId(photoId);
  };
  const photoPalette = ["#E7B4A6", "#DFC98A", "#AFC9C3", "#D4BDD4", "#C7D493", "#9CBBC6"];
  /**
   * 기기에서 사진을 고른다. 고른 자리를 남는 자리로 옮겨 돌려준다.
   *
   * 시스템 사진 선택 창은 권한 없이 고른 사진만 앱에 준다(iOS PHPicker, Android Photo
   * Picker). 사진 전체 접근을 묻지 않는다(docs/development/08-privacy-and-release-compliance.md 5장).
   */
  const pickPhotos = async (many: boolean): Promise<PickedPhoto[]> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        // 0.85 에서 올렸다. 여기서 한 번 줄이고 서버가 표시본을 만들며 또 줄여서
        // 두 번 눌렸고, 크게 보면 그것이 보였다(2026-09-21).
        quality: 0.92,
        // **아이폰 사진은 HEIC 다.** 그냥 두면 고르기가 HEIC 파일을 그대로 줘서
        // (expo-image-picker 의 iOS 구현은 HEIC 를 다시 담지 않는다) 서버가
        // "JPEG, PNG, WebP 사진만 올릴 수 있어요" 로 거절했다. 「호환되는 형식」을
        // 달라고 하면 iOS 가 JPEG 으로 바꿔 준다(2026-09-21에 폰에서 잡았다).
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        base64: Platform.OS === "web",
        // 사진에 적힌 촬영 날짜를 읽어 그날에 넣는다. 수십 장을 한 장씩 고르게 하지 않는다.
        exif: true,
        allowsMultipleSelection: many,
        selectionLimit: many ? PHOTO_PICK_LIMIT : 1,
      });
      if (result.canceled || !result.assets.length) return [];
      const 고른_것: PickedPhoto[] = [];
      // 한 장씩 차례로 줄인다. 수십 장을 한꺼번에 줄이면 웹에서 탭이 멈춘다.
      for (const asset of result.assets.slice(0, many ? PHOTO_PICK_LIMIT : 1)) {
        const picked = Platform.OS === "web" && asset.base64
          ? await shrinkForWeb(`data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`)
          : asset.uri;
        // 고르기가 준 자리는 캐시 폴더라 OS 가 비울 수 있다. 남는 자리로 옮긴다.
        고른_것.push({ uri: await keepTripPhoto(picked), takenOn: photoTakenDate(asset.exif) });
      }
      return 고른_것;
    } catch {
      notify("사진을 불러오지 못했어요");
      return [];
    }
  };
  /**
   * 사진 추가. 고르기를 먼저 열고, 고른 뒤에 날짜와 설명을 묻는다.
   *
   * 빈 창을 먼저 띄우고 그 안에서 또 고르게 하면 손이 한 번 더 간다. 여러 장을 한꺼번에
   * 고를 수 있고, 그때 날짜·설명·붙인 곳은 고른 사진 모두에 같이 붙는다.
   */
  const openPhotoCreate = async () => {
    if (!canEdit || picking) return;
    setPicking(true);
    const 고른_것 = await pickPhotos(true);
    setPicking(false);
    if (!고른_것.length) return;
    setEditingPhotoId(null);
    setPhotoDrafts(고른_것);
    setPhotoColor(photoPalette[photos.length % photoPalette.length]);
    setPhotoUri(고른_것[0].uri);
    setPhotoDate(todayDay || dayOptions[0] || UNDATED);
    setPhotoCaption("");
    setPhotoLinks([]);
    setPhotoEditing(true);
  };
  const openPhotoEdit = (photo: MemoryPhoto) => {
    setEditingPhotoId(photo.id);
    setPhotoDrafts([]);
    setPhotoSelected(true);
    setPhotoColor(photo.color);
    setPhotoUri(photo.uri);
    setPhotoDate(photoDayOptions.includes(photo.date) ? photo.date : UNDATED);
    setPhotoCaption(photo.caption);
    setPhotoLinks(tidyLinks(photo.links));
    setPhotoEditing(true);
  };
  /** 고치는 중인 사진을 다른 사진으로 바꾼다. 한 장만 고른다. */
  const choosePhoto = async () => {
    if (picking) return;
    setPicking(true);
    const 고른_것 = await pickPhotos(false);
    setPicking(false);
    if (!고른_것.length) return;
    setPhotoUri(고른_것[0].uri);
    setPhotoSelected(true);
  };
  const copyPhotoIntoApp = async (uri: string) => {
    if (Platform.OS === "web" || uri.startsWith("data:") || uri.startsWith(FileSystem.documentDirectory ?? "__none__")) return uri;
    if (!FileSystem.documentDirectory) return uri;
    const directory = `${FileSystem.documentDirectory}trip-photos/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const rawExtension = uri.split("?")[0].match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
    const extension = rawExtension && rawExtension.length <= 5 ? rawExtension : "jpg";
    const target = `${directory}photo-${Date.now()}.${extension}`;
    await FileSystem.copyAsync({ from: uri, to: target });
    return target;
  };
  const removeStoredPhoto = (uri?: string) => {
    if (!uri || !FileSystem.documentDirectory || !uri.startsWith(FileSystem.documentDirectory)) return;
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  };
  const savePhoto = async () => {
    if (!editingPhotoId) return savePickedPhotos();
    if (!photoSelected) return;
    const previous = photos.find((photo) => photo.id === editingPhotoId);
    let savedUri = photoUri;
    try {
      if (photoUri && photoUri !== previous?.uri) savedUri = await copyPhotoIntoApp(photoUri);
    } catch {
      notify("사진을 불러오지 못했어요. 다시 골라 주세요");
      return;
    }
    // 사진 자체를 바꾸면 새 사진으로 올린다. 서버는 올라온 파일을 바꾸지 않는다.
    const sameFile = Boolean(previous) && savedUri === previous?.uri;
    const next: MemoryPhoto = {
      id: sameFile && editingPhotoId ? editingPhotoId : newPlaceId(),
      color: photoColor,
      date: photoDate.trim() || UNDATED,
      caption: photoCaption.trim(),
      uri: savedUri,
      links: tidyLinks(photoLinks),
      // 같은 사진의 설명만 고치면 올린 사람은 그대로다. 사진을 바꾸면 내가 새로 올린다.
      ...(sameFile && previous?.uploaderMembershipId !== undefined ? { uploaderMembershipId: previous.uploaderMembershipId } : {}),
    };
    setPhotos((current) => current.map((photo) => photo.id === editingPhotoId ? next : photo));
    if (previous?.uri && previous.uri !== savedUri) removeStoredPhoto(previous.uri);
    // 사진을 바꾸면 줄의 id 가 바뀐다. 크게 보던 창이 새 사진을 이어서 보게 한다.
    if (viewingPhotoId === editingPhotoId) setViewingPhotoId(next.id);
    setPhotoEditing(false);
    notify("사진 정보를 수정했어요");
  };
  /**
   * 사진을 기기에 저장한다. 원본이 아직 있으면 원본을, 없으면 화면 크기로 받는다.
   *
   * 폰은 OS 공유 시트로 넘어가고(거기 「이미지 저장」이 있다) 웹은 브라우저가 내려받는다.
   */
  const savePhotoToDevice = async (photo: MemoryPhoto, 차례: number) => {
    const hint = originalSaveHint(photo.originalUntil, todayKey);
    const 받은_것 = await downloadPhotoToSave(photo.id, hint.hasOriginal);
    if (!받은_것) throw new DaymoApiError("사진을 불러오지 못했어요.", 0);
    const 이름 = `${tripName} ${photo.caption || `사진 ${차례 + 1}`}`;
    // 폰에서는 공유 창이 닫힌 것까지만 안다. 저장했다고 단정하지 않으려고 `shared` 를 받는다.
    return savePhotoFile(받은_것.uri, 이름, { 공유창까지만: true });
  };
  /**
   * ↓ 를 누르면 바로 저장한다.
   *
   * 원본이냐 표시본이냐를 묻지 않는다. 기한이 남았으면 원본, 지났으면 표시본이고
   * 그 판단은 `originalSaveHint` 가 이미 한다. 고르게 해 봐야 답이 하나뿐이라
   * 창만 하나 더 뜬다. 잘 끝나면 토스트 한 줄, 실패했을 때만 창으로 알린다.
   */
  const saveOnePhoto = async (photo: MemoryPhoto, 차례: number) => {
    if (saving) return;
    setSaving(true);
    try {
      const 결과 = await savePhotoToDevice(photo, 차례);
      /*
       * 웹은 브라우저가 파일을 다 내려받은 뒤라 「저장했어요」가 사실이다.
       * 폰은 OS 공유 창을 열어 준 것까지만 안다(`photoSave.ts`). 거기서 「이미지 저장」을
       * 골랐는지 취소했는지는 앱에 돌아오지 않는데도 「사진을 저장했어요」라고 단정했다
       * (2026-09-23 검토 #28). 취소해도 저장됐다고 말하느니 아무 말도 하지 않는다 —
       * 공유 창이 닫히는 것이 이미 사람이 본 결과다(삼성 갤러리·구글 포토도 같다).
       */
      if (결과 === "unavailable") showAlert("사진을 저장할 수 없어요", "이 기기에서는 사진 저장을 지원하지 않아요.");
      else if (결과 === "saved") setPhotoToast("사진을 저장했어요");
    } catch {
      showAlert("사진을 저장하지 못했어요", "잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };
  /** 사진에 적힌 촬영 날짜를 이번 여행의 날짜 칸으로. 여행 밖의 날이면 빈 글자다. */
  const photoDayOf = (takenOn: string) =>
    takenOn && tripKeys.includes(takenOn) && photoDayOptions.includes(takenOn) ? takenOn : "";
  /** 방금 고른 사진들을 기록에 넣는다. 날짜·설명·붙인 곳은 모두에 같이 붙는다. */
  const savePickedPhotos = async () => {
    if (!photoDrafts.length) return;
    const links = tidyLinks(photoLinks);
    const 새_사진: MemoryPhoto[] = [];
    for (const [차례, 고른_것] of photoDrafts.entries()) {
      let savedUri = 고른_것.uri;
      try {
        savedUri = await copyPhotoIntoApp(고른_것.uri);
      } catch {
        notify("사진을 불러오지 못했어요. 다시 골라 주세요");
        return;
      }
      새_사진.push({
        id: newPlaceId(),
        color: photoPalette[(photos.length + 차례) % photoPalette.length],
        // 사진에 찍힌 날이 이번 여행 안이면 그날에 넣고, 아니면 위에서 고른 날로 한다.
        date: photoDayOf(고른_것.takenOn) || photoDate.trim() || UNDATED,
        caption: photoCaption.trim(),
        uri: savedUri,
        links,
      });
    }
    setPhotos((current) => [...새_사진, ...current]);
    setPhotoEditing(false);
    setPhotoDrafts([]);
    notify(새_사진.length > 1 ? `사진 ${새_사진.length}장을 기록에 추가했어요` : "사진을 기록에 추가했어요");
  };
  /**
   * 지운 사진이 홈 카드의 대표 사진이면 대표도 함께 푼다.
   *
   * 지우기가 대표 여부를 안 봐서, 홈 카드가 사라진 사진을 계속 가리켰다(2026-09-23).
   * 서버가 답을 못 줘도 사진은 이미 지워졌으니 삭제를 막지 않는다. 다음에 다시 지우거나
   * 다른 사진을 깔면 정리된다.
   */
  const 대표_풀기 = (지운_id: readonly string[]) => {
    if (!coverPhotoId || !onSaveHomeCover || !지운_id.includes(coverPhotoId)) return;
    void onSaveHomeCover({ coverPhotoId: null }).catch(() => undefined);
  };
  /** 멈춘 사진 한 장만 다시 보낸다. 사진 위의 ↻ 가 부른다. */
  const retryOnePhoto = (photoId: string) => {
    if (cardTripId) photoUploads.retryOne(cardTripId, photoId);
    retryBlockedRows();
  };
  /**
   * 올리기를 취소한다. 줄에서 빼고 사진도 목록에서 뺀다.
   *
   * 올라가다 만 사진을 목록에 남겨 두면 영영 올라가지 않는 줄이 남는다. 서버에 줄만
   * 만들어 둔 것은 목록 맞추기가 뒤따라 지운다.
   */
  const cancelPhotoUpload = (photoId: string) => {
    if (cardTripId) photoUploads.drop(cardTripId, photoId);
    const 뺀_것 = photos.find((photo) => photo.id === photoId);
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    removeStoredPhoto(뺀_것?.uri);
    if (viewingPhotoId === photoId) setViewingPhotoId(null);
    notify("업로드를 취소했어요");
  };
  /**
   * 한 장을 지운다. 고치기 화면과 크게 보기의 🗑 이 함께 쓴다.
   *
   * 여러 장을 지울 때만 되돌리기가 있어서, 한 장을 잘못 지운 사람은 휴지통을 찾아야
   * 했다(2026-09-23). 같은 되돌리기를 붙인다. 되돌릴 수 있는 동안은 기기에 있는 파일을
   * 남겨 둔다 — 아직 못 올린 사진은 그 파일이 전부다.
   */
  const deletePhotoById = (photoId: string | null) => {
    const index = photos.findIndex((photo) => photo.id === photoId);
    if (index < 0) return;
    const target = photos[index];
    setPhotos((current) => current.filter((photo) => photo.id !== target.id));
    대표_풀기([target.id]);
    setPhotoEditing(false);
    setViewingPhotoId(null);
    let 되돌림 = false;
    const 파일_치우기 = setTimeout(() => {
      if (!되돌림) removeStoredPhoto(target.uri);
    }, 사진_되돌리기_여유);
    // 사진첩에서 연 사진이면 사진첩 바닥에 알린다.
    알림("사진을 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        되돌림 = true;
        clearTimeout(파일_치우기);
        void undoDeletePhotos([{ item: target, index }]);
      },
    });
  };
  /**
   * 사진첩에서 고른 사진을 한꺼번에 삭제한다. 한 장씩 지울 때처럼 7일 휴지통으로 간다.
   *
   * 여러 장을 한 번에 지우면 잘못 골랐을 때 잃는 것도 크다. 묻는 창은 한 번뿐이고, 대신
   * 알림에 「되돌리기」를 붙인다(삼성 갤러리·구글 포토도 그렇다). 되돌릴 수 있는 동안은
   * 기기에 있는 파일을 남겨 둔다. 아직 올리지 못한 사진은 그 파일이 전부다.
   */
  const deleteManyPhotos = (ids: string[], skipped: number) => {
    const 지울_것 = new Set(ids);
    const 뺀_것 = photos.flatMap((photo, index) => (지울_것.has(photo.id) ? [{ item: photo, index }] : []));
    if (!뺀_것.length) return;
    setPhotos((current) => current.filter((photo) => !지울_것.has(photo.id)));
    대표_풀기(ids);
    if (viewingPhotoId && 지울_것.has(viewingPhotoId)) setViewingPhotoId(null);
    let 되돌림 = false;
    const 파일_치우기 = setTimeout(() => {
      if (!되돌림) 뺀_것.forEach(({ item }) => removeStoredPhoto(item.uri));
    }, 사진_되돌리기_여유);
    알림(deletedText(뺀_것.length, skipped), {
      label: "되돌리기",
      onPress: () => {
        되돌림 = true;
        clearTimeout(파일_치우기);
        void undoDeletePhotos(뺀_것);
      },
    });
  };
  /**
   * 방금 한꺼번에 지운 사진을 되돌린다.
   *
   * 서버에 올라간 사진은 휴지통에서 되살린다. 목록에 도로 넣기만 하면 목록 맞추기가
   * 새 사진으로 보고 다시 올린다. 지우는 요청은 잠깐 뒤에 나가서(`useListSync`) 그 전에
   * 되살리면 서버는 할 일이 없다고 답하고, 뒤따라 온 삭제가 결국 지운다. 그래서 휴지통에
   * 들어온 것을 본 뒤에 되살린다. 아직 올리지 못한 사진은 휴지통에 없으니 원래 자리에 넣는다.
   */
  const undoDeletePhotos = async (뺀_것: { item: MemoryPhoto; index: number }[]) => {
    const 올라간_것 = 뺀_것.filter(({ item }) => Boolean(cardTripId) && Boolean(uploadedPhotoIds?.has(item.id)));
    const 기기의_것 = 뺀_것.filter((하나) => !올라간_것.includes(하나));
    if (기기의_것.length) setPhotos((current) => reinsertAt(current, 기기의_것));
    if (!올라간_것.length || !cardTripId) {
      알림("사진을 되돌렸어요");
      return;
    }
    알림("사진을 되돌리는 중이에요");
    const 남은_것 = new Set(올라간_것.map(({ item }) => item.id));
    const 되살린_것: string[] = [];
    for (let 번 = 0; 번 < 10 && 남은_것.size; 번 += 1) {
      if (번 > 0) await new Promise((멈춤) => setTimeout(멈춤, 1000));
      let 휴지통: Awaited<ReturnType<typeof listTrash>>;
      try {
        휴지통 = await listTrash(cardTripId);
      } catch {
        continue;
      }
      for (const 줄 of 휴지통) {
        if (줄.type !== "photo" || !남은_것.has(줄.id)) continue;
        try {
          await restoreFromTrash("photo", 줄.id);
          되살린_것.push(줄.id);
          남은_것.delete(줄.id);
        } catch {
          // 다음 차례에 한 번 더 해 본다.
        }
      }
    }
    if (되살린_것.length) onPhotosRestored?.(되살린_것);
    알림(남은_것.size
      ? "사진을 되돌리지 못했어요. 잠시 후 휴지통에서 다시 시도해 주세요"
      : "사진을 되돌렸어요");
  };
  /**
   * 사진첩에서 고른 사진을 기기에 저장한다. 한 장 저장하는 길(`savePhotoToDevice`)을 차례로 부른다.
   *
   * 폰은 한 장마다 공유 시트가 뜬다. 한꺼번에 넘기는 길은 사진첩 권한이 따로 필요해서
   * 들이지 않았다(`photoSave.ts`). 업로드 중인 사진은 아직 받을 곳이 없어 뺀다.
   */
  const saveManyPhotos = async (ids: string[], 진행: (지금: number, 모두: number) => void) => {
    const 고른_것 = ids
      .map((id) => photos.find((photo) => photo.id === id))
      .filter((photo): photo is MemoryPhoto => photo !== undefined);
    const 할_것 = 고른_것.filter((photo) => !uploadingPhotoIds.has(photo.id));
    let saved = 0;
    let failed = 0;
    for (const [차례, photo] of 할_것.entries()) {
      진행(차례 + 1, 할_것.length);
      try {
        const 결과 = await savePhotoToDevice(photo, photos.indexOf(photo));
        if (결과 === "unavailable") {
          showAlert("사진을 저장할 수 없어요", "이 기기에서는 사진 저장을 지원하지 않아요.");
          return;
        }
        saved += 1;
      } catch {
        failed += 1;
      }
    }
    // 폰은 공유 창까지만이라 잘된 장수를 세어 말하지 않는다. 빠진 것만 알린다.
    const 말 = savedText({
      saved,
      failed,
      skipped: ids.length - 할_것.length,
      result: Platform.OS === "web" ? "saved" : "shared",
    });
    if (말) 알림(말);
  };
  /**
   * 고른 사진으로 추억 카드를 시작한다.
   *
   * 카드는 기기에 파일이 있는 사진만 쓴다(`TripCards`). 남이 올린 사진은 크게 보기로
   * 열어야 표시본을 받으므로(2026-09-23 검토 #6가), 고른 것 가운데 아직 파일이 없는
   * 사진이 있으면 먼저 받아 두고 다 오면 연다.
   */
  const 카드_시작 = (ids: readonly string[]) => {
    if (!cards) return;
    const 없는_것 = ids.filter((id) => !파일이_있나(id));
    if (!없는_것.length) {
      cards.create(ids);
      return;
    }
    카드에_쓸_사진_두기((지금) => [...new Set([...지금, ...없는_것])]);
    기다리는_카드.current = ids;
    알림("사진을 불러오는 중이에요");
  };
  useEffect(() => {
    const 기다림 = 기다리는_카드.current;
    if (!기다림 || !cards) return;
    if (기다림.every(파일이_있나)) {
      기다리는_카드.current = null;
      cards.create(기다림);
      return;
    }
    // 연결이 없으면 영영 기다린다. 한참 기다려도 안 오면 그만두고 까닭을 알린다.
    const timer = setTimeout(() => {
      if (기다리는_카드.current !== 기다림) return;
      기다리는_카드.current = null;
      알림("사진을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요");
    }, 20000);
    return () => clearTimeout(timer);
    // 카드에_쓸_사진 이 바뀌는 순간이 기다리기 시작한 순간이다. 사진 목록이 바뀔 때마다
    // 파일이 다 왔는지 다시 본다.
  }, [cards, 알림, 카드에_쓸_사진, 파일이_있나]);
  // 고치는 화면의 삭제도 한 장 삭제와 같은 길로 보낸다. 되돌리기가 한쪽에만 붙어 있으면
  // 어디서 지웠느냐에 따라 되돌릴 수 있는지가 달라진다.
  const deletePhoto = () => deletePhotoById(editingPhotoId);
  /**
   * 이 사진을 홈 화면의 여행 카드에 깐다. 누르는 그 자리에서 서버에 보낸다.
   *
   * 고치기 화면의 「저장」을 기다리지 않는다. 사진 설명과 달리 홈에 깔 사진은
   * 여행에 붙는 값이라 저장 단추와 함께 보내면 무엇이 저장됐는지 흐려진다.
   */
  /**
   * 지금 홈에 깔린 것. 무엇이 내려가는지 이름을 대려면 종류와 이름이 함께 필요하다.
   *
   * 앱은 사진 한 장만 깐다. 카드를 통째로 까는 자리(`coverCardId`)는 서버에 남아 있지만
   * 이 앱은 쓰지 않는다(2026-09-23, 완성한 카드는 보통 사진이 된다).
   */
  const coverNow = coverNowOf(coverPhotoId, undefined, (_kind, id) =>
    photos.find((photo) => photo.id === id)?.caption);
  /** 되돌리기 한 번에 전으로 돌린다. 실패하면 같은 자리에 한 줄로 알린다. */
  const undoCover = (undo: Parameters<typeof coverUndoBody>[0]) => ({
    label: COVER_UNDO,
    onPress: () => {
      if (!onSaveHomeCover) return;
      void onSaveHomeCover(coverUndoBody(undo)).catch(() => notifyInViewer(COVER_FAIL));
    },
  });
  /**
   * 크게 보고 있는 사진을 홈 화면의 여행 카드에 깐다.
   *
   * 홈에 까는 길은 이 하나뿐이다. 「사진 정보」 화면에도 같은 도구가 있었는데,
   * 크게 보는 창의 위 줄에 ⌂ 가 생기면서 같은 일이 두 군데가 됐다. 홈에 까는 것은
   * 지금 보고 있는 것에 대한 일이라 크게 보는 자리에 둔다.
   */
  const viewCover = coverToggleOf(viewingPhotoId ?? undefined, coverNow, "photo");
  const canSetViewCover = canEdit && Boolean(onSaveHomeCover) && coverPickable(viewingPhotoId, uploadedPhotoIds ?? new Set());
  const toggleViewCover = async () => {
    if (!onSaveHomeCover || !viewingPhotoId) return;
    const uri = photos.find((photo) => photo.id === viewingPhotoId)?.uri;
    // 홈 카드의 사진 틀은 가로로 넓다. 깔기 전에 어디를 보여 줄지 먼저 맞춘다.
    // 내리는 것은 맞출 것이 없으니 바로 보낸다.
    if (viewCover.next) {
      setFocusing({ photoId: viewingPhotoId, uri, initial: COVER_FOCUS_DEFAULT });
      return;
    }
    try {
      await onSaveHomeCover({ coverPhotoId: viewCover.next }, { [viewingPhotoId]: uri });
      notifyInViewer(viewCover.done, undoCover(viewCover.undo));
    } catch {
      // 크게 보는 창이 여행 화면을 덮고 있어 바닥의 토스트는 가려진다.
      notifyInViewer(COVER_FAIL);
    }
  };

  /**
   * 맞춘 자리를 저장한다. 처음 깔 때도, 이미 깔린 것을 다시 맞출 때도 여기로 온다.
   *
   * 이미 깔려 있던 사진을 다시 맞춘 것뿐이면 무엇이 내려갔다고 말할 것이 없다.
   */
  const saveCoverFocus = async (focus: CoverFocus) => {
    const 맞춘_것 = focusing;
    setFocusing(null);
    if (!onSaveHomeCover || !맞춘_것) return;
    const 이미_깔린_것 = coverPhotoId === 맞춘_것.photoId;
    try {
      await onSaveHomeCover(
        { coverPhotoId: 맞춘_것.photoId, ...focusBody(focus) },
        { [맞춘_것.photoId]: 맞춘_것.uri },
      );
      if (이미_깔린_것) notifyInViewer("홈에 보일 부분을 바꿨어요");
      else notifyInViewer(viewCover.done, undoCover(viewCover.undo));
    } catch {
      notifyInViewer(COVER_FAIL);
    }
  };
  const openDiaryCreate = () => {
    setEditingDiaryId(null);
    setDiaryTitle("");
    setDiaryBody("");
    setDiaryTitleOpen(false);
    setDiaryWriting(true);
  };
  const openDiaryEdit = (diary: TravelDiary) => {
    setEditingDiaryId(diary.id);
    setDiaryTitle(diary.title);
    setDiaryBody(diary.body);
    setDiaryTitleOpen(Boolean(diary.title.trim()));
    setDiaryWriting(true);
  };
  const saveDiary = () => {
    if (!diaryBody.trim()) return;
    const previous = diaries.find((diary) => diary.id === editingDiaryId);
    // 여행 중에 쓰면 오늘 이야기로 둔다. 여행 밖에서 쓰면 다루는 날을 비운다.
    const today = dateKey(new Date());
    const writtenOn = previous ? previous.writtenOn : tripKeys.includes(today) ? today : undefined;
    const next: TravelDiary = {
      id: previous?.id ?? newPlaceId(),
      title: diaryTitle.trim(),
      body: diaryBody.trim(),
      date: previous?.date ?? (writtenOn ? dateLabelOf(writtenOn) : "방금"),
      ...(writtenOn ? { writtenOn } : {}),
    };
    setDiaries((current) => editingDiaryId
      ? current.map((diary) => diary.id === editingDiaryId ? next : diary)
      : [next, ...current]);
    setDiaryTitle("");
    setDiaryBody("");
    setDiaryWriting(false);
    notify(editingDiaryId ? "여행 일기를 수정했어요" : "여행 일기를 저장했어요");
  };
  const deleteDiary = () => {
    const 자리 = diaries.findIndex((diary) => diary.id === editingDiaryId);
    if (자리 < 0) return;
    const target = diaries[자리];
    setDiaries((current) => current.filter((diary) => diary.id !== target.id));
    setDiaryWriting(false);
    notify("여행 일기를 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        setDiaries((current) => 자리에_넣기(current, target, 자리));
        notify("여행 일기를 되돌렸어요");
      },
    });
  };
  /**
   * 완료한 카드를 여행 기록의 사진 한 장으로 넣는다.
   *
   * 기기에서 고른 사진을 넣는 것(`savePickedPhotos`)과 같은 길이다. 그래서 업로드·삭제·
   * 사진첩·크게 보기가 다른 사진과 똑같고, 사진에는 카드였다는 표시가 없다. 설명은 카드
   * 제목을 직접 적었을 때만 붙고, 날짜는 새 사진과 같다. 웹은 PNG data: 주소로 찍히는데
   * 네컷이면 20MB 에 가까워 폰처럼 JPEG 로 바꿔 넣는다(`shrinkForWeb`, 크기는 줄이지 않는다).
   */
  const saveCardPhoto = async ({ uri, caption }: FinishedCard): Promise<boolean> => {
    let savedUri: string;
    try {
      savedUri = await copyPhotoIntoApp(Platform.OS === "web" ? await shrinkForWeb(uri, Number.POSITIVE_INFINITY, 0.92) : uri);
    } catch {
      알림("사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요");
      return false;
    }
    const 새로: MemoryPhoto = {
      id: newPlaceId(),
      color: photoPalette[photos.length % photoPalette.length],
      // 새 사진을 넣을 때(`openPhotoCreate`)와 같은 기본 날짜다. 예전에는 사진 고치기
      // 시트가 쓰는 `photoDate` 를 그대로 써서, 3일차 사진 설명을 고친 뒤 카드를
      // 완료하면 카드가 3일차로 들어갔다(2026-09-23).
      date: todayDay || dayOptions[0] || UNDATED,
      caption,
      uri: savedUri,
      links: [],
    };
    setPhotos((current) => [새로, ...current]);
    setPhotoFilter("사진");
    새_사진_표시(새로.id);
    // 사진첩에서 만들었으면 알림이 사진첩 바닥에 뜬다. 「보기」는 사진첩을 닫고 탭의 격자로 간다.
    알림("사진으로 저장했어요", {
      label: "보기",
      onPress: () => {
        closeGallery();
        scrollToY?.(기록_맨위.current + 격자_머리.current);
      },
    });
    return true;
  };
  /** 사진을 크게 보는 창과 카드 창. 사진첩이 열렸는지에 따라 놓이는 자리가 다르다(아래). */
  const 카드_창 = (
      <TripCardsSection
        tripId={cardTripId}
        tripName={tripName}
        tripDate={tripDate}
        tripRegion={tripRegion}
        tripStartKey={tripKeys[0]}
        photos={cardPhotos}
        participants={participants}
        counts={cardCounts}
        onInline={takeCards}
        onFinish={saveCardPhoto}
        canEdit={canEdit}
        theme={theme}
        notify={알림}
        viewer={{
          photos: viewerPhotos,
          index: viewIndex,
          photoId: viewingPhotoId,
          onMove: moveViewing,
          onSave: () => {
            if (viewing) void saveOnePhoto(viewing, viewIndex);
          },
          saving,
          saveBlocked: Boolean(viewing && uploadingPhotoIds.has(viewing.id)),
          onEditPhoto: viewing && canManagePhoto(viewing) ? () => openPhotoEdit(viewing) : undefined,
          // 🗑 은 크게 보는 줄에 있다. 되돌릴 수 없어 누르면 확인 창이 한 번 더 뜬다.
          onDeletePhoto: viewing && canManagePhoto(viewing)
            ? () => confirmPhotoDelete(() => deletePhotoById(viewing.id))
            : undefined,
          // 이미 깔린 사진은 ⌂ 를 누르면 내려간다. 다시 맞추는 길은 여기 둔다.
          onAdjustCover:
            canEdit && onSaveHomeCover && viewing && viewing.id === coverPhotoId
              ? () => setFocusing({ photoId: viewing.id, uri: viewing.uri, initial: coverFocus ?? COVER_FOCUS_DEFAULT })
              : undefined,
          onReport: reportSpaceId && viewing && isServerId(viewing.id) ? () => setReporting(true) : undefined,
          report: reporting && reportSpaceId && viewing && isServerId(viewing.id)
            ? <ReportForm spaceId={reportSpaceId} targetType="photo" targetId={viewing.id} onClose={() => setReporting(false)} />
            : undefined,
          hint: viewing ? originalSaveHint(viewing.originalUntil, todayKey).text : undefined,
          hintSoon: viewing ? originalSaveHint(viewing.originalUntil, todayKey).soon : false,
          toast: photoToast,
          toastAction: photoUndo ?? undefined,
          waitingText: viewing && uploadingPhotoIds.has(viewing.id)
            ? (blockedPhotoIds.has(viewing.id) ? "아직 업로드되지 않은 사진이에요" : "업로드 중이에요")
            : undefined,
          cover: canSetViewCover || viewCover.on
            ? { on: viewCover.on, label: viewCover.label, onPress: () => void toggleViewCover() }
            : undefined,
          onNotice: notifyInViewer,
          // 홈에 보일 부분을 맞추는 겹. 사진 정보와 같은 자리에 얹힌다.
          coverPanel: focusing ? (
            <CoverFocusScreen
              uri={focusing.uri}
              initial={focusing.initial}
              onCancel={() => setFocusing(null)}
              onDone={(focus) => void saveCoverFocus(focus)}
            />
          ) : undefined,
          /*
           * 사진 정보는 크게 보는 창 **안의 한 겹**으로 얹는다.
           *
           * 예전에는 `Modal` 두 장을 형제로 띄웠다. iOS 는 이미 떠 있는 Modal 위에
           * 형제 Modal 을 바로 얹지 못해서, ⋮ → 「사진 정보」를 눌러도 아무 일이
           * 없다가 사진첩을 닫아야 그제서야 떴다.
           */
          editPanel: photoEditing && editingPhotoId ? (
            <PhotoEditScreen
              visible
              uri={photoUri}
              color={photoColor}
              caption={photoCaption}
              onCaption={setPhotoCaption}
              date={photoDate}
              dateOptions={photoDayOptions}
              onDate={setPhotoDate}
              linkLabels={photoLinkOptions.map((option) => option.label)}
              linkChosen={photoLinkOptions.map((option) => photoLinks.some((link) => sameLink(link, option)))}
              onToggleLink={(차례) => {
                const option = photoLinkOptions[차례];
                setPhotoLinks((지금) => 지금.some((link) => sameLink(link, option))
                  ? 지금.filter((link) => !sameLink(link, option))
                  : [...지금, { targetType: option.targetType, targetId: option.targetId }]);
              }}
              onRepick={choosePhoto}
              onDelete={() => confirmPhotoDelete(deletePhoto)}
              onClose={() => setPhotoEditing(false)}
              onSubmit={() => void savePhoto()}
              toast={photoToast}
              readOnly={!canManagePhoto(photos.find((photo) => photo.id === editingPhotoId))}
              readOnlyHint={canEdit ? "올린 사람과 관리자만 이 사진을 수정할 수 있어요" : undefined}
              theme={theme}
            />
          ) : undefined,
          onCloseEditPanel: () => setPhotoEditing(false),
        }}
      />
  );
  return (
    <View onLayout={(event) => { 기록_맨위.current = event.nativeEvent.layout.y; }}>
      {/* 탭 머리는 두 줄이다. 예전에는 제목 줄·요약 줄·섹션 제목 줄·필터 줄 네 줄이
          쌓인 뒤에야 사진이 나왔고, 「9개」「8장·1편」「10개」로 같은 것을 세 번 셌다.
          세는 일은 아래 필터 칩이 맡고, 여기서는 며칠에 걸친 기록인지만 알린다.
          「전부 저장」과 두 번째 추가 버튼은 예전에 없앴다. 한 번 눌러 수십 장을
          내려받는 버튼은 실수로 눌렀을 때 되돌릴 방법이 없고, 추가 버튼은 다른 탭과
          같이 탭 머리에 하나면 된다. */}
      <TabActionHeader
        label="여행 기록"
        count={memoryHeadCount(memoryDayCount(photos.map((photo) => photo.date), UNDATED))}
        action="사진 추가"
        onPress={openPhotoCreate}
      />
      <View style={styles.memoryFilterLine} onLayout={(event) => { 격자_머리.current = event.nativeEvent.layout.y; }}>
        <View style={styles.memoryFilterRow}>
          {memoryFilterChips(photos.length, cardTiles.length).map((칩) => {
            const on = photoFilter === 칩.key;
            return (
              <Pressable
                key={칩.key}
                onPress={() => setPhotoFilter(칩.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${칩.key} ${칩.count}개만 보기`}
                hitSlop={누름여유(높이.칩)}
                style={({ pressed }) => [
                  styles.photoLinkChip,
                  theme && { backgroundColor: theme.surface, borderColor: theme.border },
                  on && 공용스타일.optionChipActive,
                  on && theme && { backgroundColor: theme.primarySoft, borderColor: theme.primary },
                  pressed && 공용스타일.controlPressed,
                ]}
              >
                <Text style={[
                  공용스타일.optionText,
                  theme && { color: theme.muted },
                  on && 공용스타일.optionTextActive,
                  on && theme && { color: theme.primary },
                ]}>
                  {칩.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {/* 「카드 만들기」는 권하는 말이라 격자 아래 큰 버튼으로 두지 않는다. 큰 버튼은
            해야 할 일처럼 보인다. 필터 줄 끝의 작은 글씨면 눈에는 들되 떠밀지는 않는다. */}
        {Boolean(cards && canEdit) && (
          <Pressable
            onPress={() => cards?.create()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="추억 카드 만들기"
            style={styles.memoryFilterLink}
          >
            <Text style={[styles.photoRepickText, theme && { color: theme.primary }]}>카드 만들기</Text>
          </Pressable>
        )}
      </View>
      {Boolean(uploadHeadline) && (
        // 「다시 시도」를 화면 오른쪽 끝으로 보내면 두 글자만 멀찍이 떠서 왼쪽 글과
        // 짝이 안 맞아 보인다. 글 바로 뒤에 붙여 한 덩이로 읽히게 둔다. 글이 길면
        // 그대로 다음 줄로 내려간다.
        <View style={styles.uploadLine}>
          <Text accessibilityLiveRegion="polite" style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
            {uploadHeadline}
            {blockedPhotoIds.size > 0 ? " · " : ""}
          </Text>
          {blockedPhotoIds.size > 0 && (
            <Pressable
              onPress={() => {
                // 파일이 막힌 것과 설명·날짜가 막힌 것을 함께 푼다. 사용자에게는 한 가지 일이다.
                if (cardTripId) photoUploads.retry(cardTripId);
                retryBlockedRows();
              }}
              accessibilityRole="button"
              accessibilityLabel="올리지 못한 사진 다시 시도"
              hitSlop={글자누름여유}
            >
              <Text style={[styles.photoRepickText, theme && { color: theme.primary }]}>다시 시도</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={styles.memoryGrid}>
        {shownTiles.map((tile) => tile.kind === "photo" ? (
          <Pressable
            key={tile.key}
            onPress={() => setViewingPhotoId(tile.photo.id)}
            accessibilityRole="button"
            accessibilityLabel={`${tile.photo.caption || dayTextOf(tile.photo.date)} 사진 ${tile.photo.id === coverPhotoId ? "· 대표 사진으로 쓰는 중 " : ""}크게 보기`}
            style={[
              styles.memoryTile,
              theme && { backgroundColor: theme.surface, borderColor: theme.border },
              tile.photo.id === 새_사진 && [styles.memoryTileNew, theme && { borderColor: theme.primary }],
            ]}
          >
            <View style={[styles.memoryTilePhoto, { backgroundColor: tile.photo.color }]}>
              <MemoryTileImage
                photo={tile.photo}
                uploaded={uploadedPhotoIds?.has(tile.photo.id) ?? false}
                busy={uploadingPhotoIds.has(tile.photo.id)}
              />
              {tile.photo.id === coverPhotoId && <CoverBadge />}
              {/* 올라가는 중과 실패를 사진 위에 그대로 얹는다. 카카오톡에서 사진이
                  올라갈 때 보이는 그 자리다. 올라가는 중에는 얼마나 갔는지 띠로
                  보이고, 실패하면 가운데 ↻ 를 눌러 이 한 장만 다시 보낸다. 둘 다
                  오른쪽 위 ✕ 로 취소할 수 있다(사진도 목록에서 빠진다). */}
              {uploadingPhotoIds.has(tile.photo.id) && (
                <View style={styles.uploadCover}>
                  {blockedPhotoIds.has(tile.photo.id) ? (
                    <Pressable
                      onPress={() => retryOnePhoto(tile.photo.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${tile.photo.caption || "사진"} 다시 시도`}
                      style={({ pressed }) => [styles.uploadRound, pressed && 공용스타일.controlPressed]}
                    >
                      <Glyph name="retry" size={아이콘.크게} color="#FFFFFF" weight={2.2} />
                    </Pressable>
                  ) : (
                    <View style={styles.uploadBarTrack}>
                      <View
                        style={[
                          styles.uploadBarFill,
                          { width: `${Math.round((photoUploadState.progress[tile.photo.id] ?? 0) * 100)}%` },
                        ]}
                      />
                    </View>
                  )}
                  <Text style={styles.uploadCoverText}>
                    {업로드_말(blockedPhotoIds.has(tile.photo.id), photoUploadState.progress[tile.photo.id])}
                  </Text>
                  <Pressable
                    onPress={() => cancelPhotoUpload(tile.photo.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${tile.photo.caption || "사진"} 업로드 취소`}
                    hitSlop={글자누름여유}
                    style={({ pressed }) => [styles.uploadCancel, pressed && 공용스타일.controlPressed]}
                  >
                    <Glyph name="close" size={아이콘.작게} color="#FFFFFF" weight={2.6} />
                  </Pressable>
                </View>
              )}
            </View>
            <View style={styles.memoryTileCaption}>
              <Text numberOfLines={1} style={[styles.tileNumber, theme && { color: theme.text }]}>{tile.photo.caption || `사진 ${tile.index + 1}`}</Text>
              <Text style={[styles.memoryTileDate, theme && { color: theme.muted }]}>{dayTextOf(tile.photo.date)}</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            key={tile.key}
            onPress={() => cards?.open(tile.card.id)}
            accessibilityRole="button"
            accessibilityLabel={`${tile.card.label} 추억 카드 꾸미기`}
            style={[
              styles.memoryTile,
              theme && { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={[styles.memoryTilePhoto, { backgroundColor: tile.card.preview ? theme?.surfaceAlt ?? "#F1ECE3" : tile.card.color }]}>
              {/* 첫 사진 한 장이 아니라 카드를 작게 그대로 그린다. 두 장짜리 카드가 한 장처럼 보였다. */}
              {tile.card.preview ?? (Boolean(tile.card.uri) && <Image source={{ uri: tile.card.uri }} resizeMode="cover" style={공용스타일.memoryPhotoImage} />)}
              {!tile.card.preview && <View style={styles.memoryTileGlow} />}
              {/* 사진과 한 격자에 섞이니 아직 사진이 아닌 것이 한눈에 보여야 한다. 대표 표시와
                  같은 모양으로 반대쪽 모서리에 단다. 누르면 바로 꾸미기다. */}
              <View style={[공용스타일.coverBadge, styles.uploadBadge]} pointerEvents="none">
                <Text style={공용스타일.coverBadgeText}>꾸미는 중</Text>
              </View>
              {/* 꾸미는 창을 열지 않고도 지운다. 올라가는 사진의 취소 ✕ 와 같은 자리·같은 모양이다. */}
              {canEdit && (
                <Pressable
                  onPress={() => cards?.remove(tile.card.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${tile.card.label} 카드 삭제`}
                  hitSlop={글자누름여유}
                  style={({ pressed }) => [styles.uploadCancel, pressed && 공용스타일.controlPressed]}
                >
                  <Glyph name="close" size={아이콘.작게} color="#FFFFFF" weight={2.6} />
                </Pressable>
              )}
            </View>
            <View style={styles.memoryTileCaption}>
              <Text numberOfLines={1} style={[styles.tileNumber, theme && { color: theme.text }]}>{tile.card.label}</Text>
              <Text style={[styles.memoryTileDate, theme && { color: theme.muted }]}>카드</Text>
            </View>
          </Pressable>
        ))}
      </View>
      {tiles.length === 0 && (photoFilter === "카드" ? (
        <EmptyState
          title="꾸미는 중인 추억 카드가 없어요"
          description="여행 사진 몇 장을 골라 한 장으로 묶어 보세요. 완료한 카드는 사진이 돼요."
          action="카드 만들기"
          onPress={canEdit && cards ? () => cards.create() : undefined}
        />
      ) : (
        <EmptyState
          title="아직 추가한 사진이 없어요"
          description="여행의 첫 장면을 기록에 추가해 보세요."
          action="사진 추가"
          onPress={canEdit ? openPhotoCreate : undefined}
        />
      ))}
      {/* 사진은 탭 안에서 늘리지 않고 사진첩을 연다. 수십 장을 두 칸짜리 큰 칸으로
          늘리면 일기가 한참 아래로 밀리고 훑기도 어렵다. 카드는 그대로 그 자리에서 편다. */}
      {미리보기.gallery && (
        <ListMoreButton
          expanded={false}
          hiddenCount={photos.length - 미리보기.photos}
          label={`사진 ${photos.length}장 모두 보기`}
          opens
          onPress={() => setGalleryOpen(true)}
        />
      )}
      {미리보기.moreCards > 0 && (
        <ListMoreButton
          expanded={showAllCards}
          hiddenCount={미리보기.moreCards}
          onPress={() => setShowAllCards((value) => !value)}
        />
      )}
      {/* 휴지통은 여행 메모 시트 맨 아래에만 있어서, 사진을 지운 사람이 되찾는 길을
          못 찾았다(2026-09-23). 사진을 지우는 자리 바로 아래에도 같은 길을 둔다. */}
      {trash}
      <SectionLabel
        label="여행 일기"
        action={canEdit ? "일기 쓰기" : undefined}
        onPress={openDiaryCreate}
      />
      {(showAllDiaries ? diaries : diaries.slice(0, 3)).map((diary, index) => (
        <Pressable
          key={diary.id}
          onPress={() => openDiaryEdit(diary)}
          accessibilityRole="button"
          accessibilityLabel={`${diary.title || DIARY_UNTITLED} 일기 수정`}
          style={[
            styles.diaryCard,
            theme && { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={[styles.diaryRuleSide, theme && { backgroundColor: theme.primary }]} />
          <View style={styles.diaryPaperRules} pointerEvents="none">
            {[0, 1, 2].map((rule) => (
              <View key={rule} style={[styles.diaryPaperRule, theme && { backgroundColor: theme.border }]} />
            ))}
          </View>
          <Text style={[styles.diaryDate, theme && { color: theme.primary }]}>{diary.date}</Text>
          <Text style={[styles.diaryTitle, theme && { color: theme.text }]}>{diary.title || DIARY_UNTITLED}</Text>
          <Text numberOfLines={3} style={[styles.diaryBody, theme && { color: theme.muted }]}>{diary.body}</Text>
        </Pressable>
      ))}
      {diaries.length === 0 && (
        <EmptyState
          title="아직 작성한 일기가 없어요"
          description="여행에서 기억하고 싶은 순간을 글로 남겨 보세요."
          action="일기 쓰기"
          onPress={canEdit ? openDiaryCreate : undefined}
        />
      )}
      {diaries.length > 3 && (
        <ListMoreButton
          expanded={showAllDiaries}
          hiddenCount={diaries.length - 3}
          onPress={() => setShowAllDiaries((value) => !value)}
        />
      )}
      {/* 사진을 크게 보는 창과 추억 카드 꾸미기는 한 창이다. 창은 카드 쪽이 그린다
          (`TripCards.tsx`). 사진 쪽 몫만 여기서 내려 준다.

          사진첩이 열려 있으면 그 안에 들어간다. 사진첩도 화면을 덮는 Modal 이라, 옆에
          형제로 두면 iOS 가 사진첩 위에 크게 보기를 띄우지 못한다(사진 정보 겹과 같은
          까닭, `PhotoViewer.tsx`). 자리를 옮기면 카드 쪽이 새로 그려져 초안을 기기에서
          다시 읽는다. 사진첩을 열고 닫을 때 한 번씩이라 그대로 둔다. */}
      {!galleryOpen && 카드_창}
      <PhotoGallery
        visible={galleryOpen}
        title={tripName}
        photos={photos}
        undated={UNDATED}
        theme={theme}
        onClose={closeGallery}
        onOpen={moveViewing}
        uploaded={uploadedPhotoIds ?? NO_PHOTO_IDS}
        uploading={uploadingPhotoIds}
        blocked={blockedPhotoIds}
        progress={photoUploadState.progress}
        canEdit={canEdit}
        canManage={(id) => {
          const photo = photos.find((하나) => 하나.id === id);
          return Boolean(photo) && canManagePhoto(photo);
        }}
        onDelete={deleteManyPhotos}
        onSave={saveManyPhotos}
        onMakeCard={cards ? 카드_시작 : undefined}
        maxCardPhotos={KEEPSAKE_MAX_PHOTOS}
        toast={galleryToast}
        onToast={setGalleryToast}
      >
        {galleryOpen ? 카드_창 : null}
      </PhotoGallery>
      {/* 새로 고른 사진을 기록에 넣는 시트. 고치기와 달리 여기는 그대로 둔다. 여러 장을
          한꺼번에 고른 뒤 같은 날짜와 설명을 다는 자리라 사진 한 장이 주인공이 아니다. */}
      <DetailSheet
        visible={photoEditing && !editingPhotoId}
        title={photoDrafts.length > 1 ? `사진 ${photoDrafts.length}장 추가` : "사진 추가"}
        subtitle={photoDrafts.length > 1 ? "고른 사진에 같은 날짜와 설명이 붙어요" : "날짜와 짧은 설명을 함께 남겨 보세요"}
        submit={photoDrafts.length > 1 ? `${photoDrafts.length}장 추가` : "사진 추가"}
        disabledHint={!photoDrafts.length ? "사진을 골라 주세요" : undefined}
        submitDisabled={!photoDrafts.length}
        hasUnsavedChanges={photoDraftChanged}
        onClose={() => setPhotoEditing(false)}
        onSubmit={savePhoto}
      >
        {/* 고른 사진들을 한 줄로 늘어놓고 옆으로 밀어 본다. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoDraftRow}
        >
          {photoDrafts.map((고른_것, 차례) => (
            <View key={`${고른_것.uri}:${차례}`} style={[styles.photoDraft, { borderColor: theme?.border ?? "#E5E1DC" }]}>
              <Image source={{ uri: 고른_것.uri }} resizeMode="cover" style={공용스타일.memoryPhotoImage} />
            </View>
          ))}
        </ScrollView>
        <OptionField label="여행 날짜" options={photoDayOptions} labelOf={dayTextOf} value={photoDate} onChange={setPhotoDate} />
        <PhotoLinkField options={photoLinkOptions} value={photoLinks} onChange={setPhotoLinks} />
        <DetailField label="사진 설명 (선택)" value={photoCaption} onChangeText={setPhotoCaption} placeholder="예: 도착하자마자 먹은 점심" maxLength={200} />
      </DetailSheet>
      <DetailSheet
        visible={diaryWriting}
        title={editingDiaryId ? "여행 일기 수정" : "여행 일기 쓰기"}
        subtitle="그날의 기분과 오래 기억하고 싶은 이야기를 남겨 보세요"
        submit={editingDiaryId ? "저장" : "일기 추가"}
        disabledHint={!diaryBody.trim() ? "내용을 입력해 주세요" : undefined}
        submitDisabled={!diaryBody.trim()}
        destructiveLabel={editingDiaryId ? "일기 삭제" : undefined}
        destructiveMessage={editingDiaryId ? `${diaryTitle || "이 일기"}${josa(diaryTitle || "이 일기", "을", "를")} 여행 기록에서 삭제해요.` : undefined}
        onDestructive={deleteDiary}
        hasUnsavedChanges={diaryDraftChanged}
        onClose={() => {
          setDiaryWriting(false);
          setEditingDiaryId(null);
        }}
        onSubmit={saveDiary}
      >
        <DetailField label="여행 이야기" required value={diaryBody} onChangeText={setDiaryBody} placeholder="예: 오늘 가장 기억에 남는 순간은…" multiline maxLength={20000} />
        <OptionalFormSection
          label="제목"
          summary={diaryTitle.trim() || undefined}
          open={diaryTitleOpen}
          onToggle={() => setDiaryTitleOpen((current) => !current)}
        >
          <DetailField label="일기 제목 (선택)" value={diaryTitle} onChangeText={setDiaryTitle} placeholder="예: 비가 와서 더 좋았던 날" />
        </OptionalFormSection>
        {reportSpaceId && editingDiaryId && isServerId(editingDiaryId) && (
          <ReportLink key={editingDiaryId} spaceId={reportSpaceId} targetType="diary" targetId={editingDiaryId} label="이 일기 신고하기" />
        )}
      </DetailSheet>
    </View>
  );
}

/** 사진을 붙일 수 있는 곳 하나. 화면에 보일 이름과 무엇인지를 함께 들고 있다. */
type PhotoLinkOption = { targetType: PhotoLinkTarget; targetId: string; label: string };

const sameLink = (left: PhotoLink, right: { targetType: PhotoLinkTarget; targetId: string }) =>
  left.targetType === right.targetType && left.targetId === right.targetId;

/**
 * 이 사진을 어디에 붙일지. 여러 곳을 고를 수 있다.
 *
 * 숙소 사진이 그 날의 사진이기도 한 경우가 흔해서 하나만 고르게 하지 않는다.
 * 날짜는 여기서 고르지 않는다. 바로 위의 `여행 날짜` 가 그 몫이다.
 */
function PhotoLinkField({ options, value, onChange }: {
  options: PhotoLinkOption[];
  value: PhotoLink[];
  onChange: (next: PhotoLink[]) => void;
}) {
  const theme = useContext(DetailThemeContext);
  if (!options.length) return null;
  const label = "연결 (선택)";
  const toggle = (option: PhotoLinkOption) =>
    onChange(value.some((link) => sameLink(link, option))
      ? value.filter((link) => !sameLink(link, option))
      : [...value, { targetType: option.targetType, targetId: option.targetId }]);
  return (
    <View style={공용스타일.optionField}>
      <View style={공용스타일.fieldLabelRow}>
        <View style={[공용스타일.fieldLabelDot, requiredDot(false, theme)]} />
        <Text style={[공용스타일.detailFieldLabel, theme && { color: theme.text }]}>{label}</Text>
      </View>
      <View style={styles.photoLinkRow}>
        {options.map((option) => {
          const chosen = value.some((link) => sameLink(link, option));
          return (
            <Pressable
              key={`${option.targetType}:${option.targetId}`}
              onPress={() => toggle(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              hitSlop={누름여유(높이.칩)}
              style={({ pressed }) => [
                styles.photoLinkChip,
                theme && { backgroundColor: theme.surface, borderColor: theme.border },
                chosen && 공용스타일.optionChipActive,
                chosen && theme && { backgroundColor: theme.primarySoft, borderColor: theme.primary },
                pressed && 공용스타일.controlPressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  공용스타일.optionText,
                  theme && { color: theme.muted },
                  chosen && 공용스타일.optionTextActive,
                  chosen && theme && { color: theme.primary },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * 기록 탭 격자 칸의 사진 한 장.
 *
 * 기기에 표시본이 있으면 그것을 쓰고, 없으면 썸네일(480px)을 받는다. 예전에는 여행을
 * 열기만 해도 표시본을 전부 받아 두고 그것을 격자에 깔았다(2026-09-23 검토 #6가).
 * 못 받으면 색만 깔려 「아직 오는 중」과 구별이 안 됐던 것도 함께 고친다(#52) —
 * 사진첩 격자(`PhotoGallery`)와 같은 모양·같은 말이다.
 */
function MemoryTileImage({ photo, uploaded, busy }: { photo: MemoryPhoto; uploaded: boolean; busy: boolean }) {
  const 있는_것 = isLivePhotoUri(photo.uri) ? photo.uri : undefined;
  const { uri, failed, retry } = usePhotoThumb(photo.id, uploaded && !있는_것, 있는_것);
  const 이름 = photo.caption || `${dayTextOf(photo.date)} 사진`;
  return (
    <>
      {Boolean(uri) && <Image source={{ uri }} resizeMode="cover" style={공용스타일.memoryPhotoImage} />}
      {/* 비스듬한 빛줄기. 다시 시도 덮개보다 아래에 와야 덮개가 눌린다. */}
      <View style={styles.memoryTileGlow} />
      {/* 올라가는 중이면 그 덮개가 따로 얹힌다. 두 덮개가 겹치지 않게 한다. */}
      {failed && !busy && (
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel={`${이름} 다시 시도`}
          style={({ pressed }) => [styles.uploadCover, pressed && 공용스타일.controlPressed]}
        >
          <Glyph name="retry" size={아이콘.보통} color="#FFFFFF" weight={2.2} />
          <Text numberOfLines={2} style={styles.uploadCoverText}>불러오지 못했어요</Text>
        </Pressable>
      )}
    </>
  );
}

/** 어딘가에 붙은 사진 몇 장. 붙은 사진이 없으면 아무것도 그리지 않는다. */

const styles = StyleSheet.create({
  diaryCard: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E8E2DA",
    backgroundColor: "#FFFFFF",
    padding: 16,
    paddingLeft: 20,
    marginBottom: 8,
    position: "relative",
    overflow: "hidden",
  },
  diaryRuleSide: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 7,
    width: 2,
    opacity: 0.45,
  },
  diaryPaperRules: {
    position: "absolute",
    left: 19,
    right: 13,
    top: 48,
    gap: 16,
  },
  diaryPaperRule: { height: StyleSheet.hairlineWidth, opacity: 0.55 },
  diaryDate: { fontSize: 11, fontFamily: typo.caption.family },
  diaryTitle: { fontSize: 14, fontFamily: typo.title.family, marginTop: 6 },
  diaryBody: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  photoLinkRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // 격자 위의 필터 줄. 칩은 왼쪽에 모으고, 권하는 말은 오른쪽 끝에 작게 붙인다.
  memoryFilterLine: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  memoryFilterRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  memoryFilterLink: { paddingVertical: 4 },
  photoLinkChip: {
    height: 높이.칩,
    maxWidth: "100%",
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  memoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  memoryTilePhoto: { flex: 1, borderRadius: 모서리.표식, overflow: "hidden" },
  memoryTileGlow: {
    width: "70%",
    height: "120%",
    marginLeft: -12,
    marginTop: -10,
    backgroundColor: "rgba(255,255,255,0.13)",
    transform: [{ rotate: "18deg" }],
  },
  memoryTileCaption: {
    minHeight: 23,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileNumber: {
    flex: 1,
    minWidth: 0,
    color: "rgba(83, 54, 48, .65)",
    fontSize: 12,
    fontFamily: typo.data.family,
  },
  memoryTileDate: { flexShrink: 0, fontSize: 11, fontFamily: typo.caption.family, marginLeft: 3 },
  // 아직 올라가는 중인 사진. 홈 표시와 같은 자리에 붙지만 둘이 겹칠 일은 없다
  // (올라가지 않은 사진은 홈에 깔 수 없다).
  uploadBadge: { left: 4, right: undefined },
  // 올라가는 중·실패한 사진 위에 통째로 덮는 겹. 사진은 비쳐 보이되 무슨 일이
  // 벌어지는 중인지가 먼저 읽혀야 한다.
  uploadCover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(17,16,15,0.45)",
  },
  uploadRound: {
    width: 38,
    height: 38,
    borderRadius: 모서리.원,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,16,15,0.55)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.9)",
  },
  uploadBarTrack: {
    width: "78%",
    height: 4,
    borderRadius: 모서리.원,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  uploadBarFill: { height: "100%", borderRadius: 모서리.표식, backgroundColor: "#FFFFFF" },
  uploadCoverText: { fontSize: 11, color: "#FFFFFF", fontFamily: typo.label.family },
  uploadCancel: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 모서리.원,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,16,15,0.7)",
  },
  // 방금 고른 사진들. 한 줄로 늘어놓고 옆으로 밀어 본다.
  photoDraftRow: { gap: 8, paddingRight: 6, paddingVertical: 2, marginBottom: 14 },
  photoDraft: { width: 104, height: 104, borderRadius: 모서리.행, borderWidth: 1, overflow: "hidden" },
  uploadLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", rowGap: 2 },
  photoRepickText: { fontSize: 13, color: "#3F4C8F", fontFamily: typo.label.family },
  memoryTile: {
    width: "31.4%",
    aspectRatio: 1,
    borderRadius: 모서리.상자,
    padding: 8,
    justifyContent: "flex-end",
    transform: [{ rotate: "-.5deg" }],
  },
  // 방금 만든 카드. 잠깐 두르고 사라진다.
  memoryTileNew: { borderWidth: 2.5, borderColor: "#3F4C8F" },
});
