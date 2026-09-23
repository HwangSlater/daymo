import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "./ui/Chip";
import { Segment } from "./ui/Segment";
import { keepTripPhoto } from "./tripPhotos";
import { TripDateRangePicker } from "./TripDateRangePicker";
import { TripRegionPicker } from "./TripRegionPicker";
import { ParticipantPicker } from "./ParticipantPicker";
import { DaymoApiError } from "./auth";
import { TripConflictError } from "./tripSync";
import { reloadOpenLists, retryBlockedRows, useListSync, useSyncTrouble } from "./useListSync";
import { SyncMark, SyncNotice } from "./SyncMarks";
import { isServerId } from "./listSync";
import {
  COOKING_UNASSIGNED,
  DIARY_UNTITLED,
  UNDATED,
  collapsedGroupsFor,
  cookingOwnerOptions,
  initialMemoryData,
  normalizePackingOwner,
  packingTags,
  parseAiRecipes,
  reservationScheduleRow,
  transportScheduleRow,
  기본_체크인_시각,
  요리메모_보이기,
  요리메모_읽기,
  자리에_넣기,
  type CookingItem,
  type MemoryPhoto,
  type PackingItem,
  type PlaceItem,
  type Recipe,
  type ReservationInfo,
  type ScheduleItem,
  type StayInfo,
  type TravelDiary,
  type Transportation,
  type TripDetailDestination,
  type TripMemoryData,
  type TripNote,
  type TripPlanningData,
} from "./tripPlanning";
import {
  buildTripDates,
  dateKey,
  dateLabel,
  dateLabelOf,
  dayTextOf,
  formatTripPeriod,
  shiftDateKey,
  tripDateKeys,
  tripIsOver,
  todayAmong,
  validDateKey,
  weekdayOfKey,
} from "./dates";
import { legacyIdMap, placeCodec } from "./placeSync";
import { isDerivedScheduleItem, scheduleCodec, stayCodec } from "./scheduleSync";
import { reservationCodec, transportCodec } from "./bookingSync";
import { expenseCodec, paymentCodec } from "./expenseSync";
import { packingCodec, recipeCodec, type PackingRow, type RecipeRow } from "./cookingSync";
import { importMessage, planRecipeImport } from "./pastTripImport";
import { PastTripEntry, PastTripList } from "./PastTripPicker";
import { usePastRecipes } from "./usePastTripRows";
import { rebindPeople } from "./people";
import { diaryCodec, memoCodec } from "./memorySync";
import { memoryDayCount, memoryFilterChips, memoryHeadCount, type MemoryFilter } from "./memoryFilter";
import {
  isStaleDisplayCopy,
  originalSaveHint,
  photoCodec,
  photoTakenDate,
  tidyLinks,
  type PhotoLink,
  type PhotoLinkTarget,
} from "./photoSync";
import { PhotoEditScreen, confirmPhotoDelete } from "./PhotoViewer";
import { photoUploadHeadline, photoUploads, usePhotoUploads, type PhotoUploadJob } from "./photoUploads";
import { usePhotoThumb, usePhotoThumbs } from "./photoThumbnails";
import { TripCardsSection, type CardPhoto, type CardTile, type FinishedCard } from "./TripCards";
import { PhotoGallery, type GalleryToast } from "./PhotoGallery";
import { deletedText, memoryPreview, reinsertAt, savedText, uploadStateText } from "./gallerySelection";
import { KEEPSAKE_MAX_PHOTOS } from "./tripCard";
import { TripTrash } from "./TripTrash";
import {
  downloadPhoto,
  downloadPhotoToSave,
  isLivePhotoUri,
  releaseDownloadedPhoto,
  uploadPhoto,
  type UploadNotice,
} from "./photoTransfer";
import { savePhotoFile } from "./photoSave";
import type { ExpenseSettings, HomeCoverChoice } from "./serverData";
import type { RosterEntry } from "./tripSync";
import {
  deletePhoto as deleteServerPhoto,
  listPhotos,
  listTrash,
  restoreFromTrash,
  updatePhoto,
  createDiary,
  createMemo,
  deleteDiary,
  deleteMemo,
  listDiaries,
  listMemos,
  updateDiary,
  updateMemo,
  createChecklistItem,
  createRecipe,
  deleteChecklistItem,
  deleteRecipe,
  listChecklistItems,
  listRecipes,
  updateChecklistItem,
  updateRecipe,
  createExpense,
  createPayment,
  deleteExpense,
  listExpenses,
  listPayments,
  undoPayment,
  updateExpense,
  createReservation,
  createScheduleItem,
  createStay,
  createTransport,
  deleteReservation,
  deleteTransport,
  listReservations,
  listTransports,
  updateReservation,
  updateTransport,
  createTripPlace,
  deleteScheduleItem,
  deleteStay,
  deleteTripPlace,
  listScheduleItems,
  listStays,
  listTripPlaces,
  updateScheduleItem,
  updateStay,
  updateTripPlace,
} from "./serverData";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type Participant,
  type Payment,
  type SplitMode,
  type Transfer,
  expensesToCsv,
  josa,
  parseAmount,
  settle,
  amountText,
  currencyOf,
  money,
  normalizeExpense,
  shareLabel,
  spentTotal,
  splitModeOf,
  toWon,
  totalsByCategory,
  totalsByDay,
  won,
} from "./tripExpenses";
import { shareExpenseCsv } from "./tripExpenseExport";
import {
  BackHandler,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { AppTheme } from "./theme";
import { Text, TextInput } from "./AppText";
import { Toast } from "./ui/Toast";
import { CheckBox } from "./ui/CheckBox";
import { EmptyState as SharedEmptyState } from "./ui/EmptyState";
import { Glyph } from "./Glyph";
import { showAlert } from "./showAlert";
import { shrinkForWeb } from "./webImage";
import { useWebBackClose } from "./useWebBackClose";
import { 높이, 모서리, 불투명도, 아이콘, 여백, 누름여유, 글자누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";
import { memoPaper, onAccent, status as statusColor } from "./theme/colors";
import { COVER_FAIL, COVER_UNDO, coverNowOf, coverPickable, coverToggleOf, coverUndoBody } from "./coverPhoto";
import { COVER_FOCUS_DEFAULT, focusBody, type CoverFocus } from "./coverCrop";
import { CoverFocusScreen } from "./ui/CoverFocusScreen";
import { 공용스타일 } from "./trip/styles";
import { CoverBadge, DetailEditableContext, DetailFeedbackContext, DetailField, DetailSheet, DetailThemeContext, EmptyState, FeedbackAction, ListMoreButton, MoneyBlock, NO_IDS, OptionField, OptionalFormSection, ReportForm, ReportLink, SectionLabel, TabActionHeader, ViewMode, newPlaceId, readClipboard, requiredDot, useDraftChanged, 금액_치기, 금액_키보드, 붙여넣기_한도 } from "./trip/parts";
import { TripOverview } from "./trip/TripOverview";
import { Places } from "./trip/TripPlaces";
import { Preparation } from "./trip/TripPreparation";



/** 탭에 찍히는 이름. 내부 값과 다른 것만 적는다. 첫 탭은 일정을 담고 있어 「일정」이라 부른다. */
const MODE_LABEL: Partial<Record<ViewMode, string>> = { 여행: "일정" };
const modeLabelOf = (mode: ViewMode) => MODE_LABEL[mode] ?? mode;
const destinationMode = (destination: TripDetailDestination): ViewMode =>
  destination === "places"
    ? "장소"
    : destination === "preparation"
      ? "준비"
      : destination === "cooking"
        ? "요리"
        : destination === "expenses"
          ? "비용"
        : destination === "memories"
          ? "기록"
      : "여행";

/** 저장 실패 안내. 서버가 준 문구(권한 없음 같은)는 사람이 읽을 수 있게 쓰여 있어 그대로 쓴다. */
const saveErrorMessage = (caught: unknown) =>
  caught instanceof DaymoApiError && caught.status !== 0
    ? caught.message
    : "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요";


type Props = {
  done: string[];
  onClose: () => void;
  initialDestination?: TripDetailDestination;
  appTheme?: AppTheme;
  /**
   * 마지막 날이 지난 여행에서 일정에 담은 장소를 다녀온 곳으로 보여 줄지.
   * 설정(우리 › 설정)에서 끄고 켠다.
   */
  visitedAfterTrip?: boolean;
  tripName?: string;
  tripDate?: string;
  tripStart?: string;
  tripEnd?: string;
  tripRegion?: string;
  tripNote?: string;
  onUpdateTrip?: (trip: {
    name: string;
    date: string;
    start: string;
    end: string;
    region: string;
    note: string;
    participants?: string[];
  }) => void | Promise<void>;
  /**
   * 참가자만 바꾼다. 서버가 받아 준 참가자를 돌려준다.
   *
   * 다른 곳에서 먼저 고쳤으면 `TripConflictError` 를 던진다.
   */
  onUpdateParticipants?: (participants: string[]) => Promise<string[]>;
  /** 당겨서 새로고침할 때 여행 자체(제목·기간·참가자)를 서버에서 다시 받는다. */
  onRefreshTrip?: () => Promise<void>;
  /** 보관한 여행인지. 보관은 목록 정리일 뿐이라 기록을 고치는 데는 영향이 없다. */
  archived?: boolean;
  /** 보관하거나 보관을 푼다. 서버 여행에만 있다. */
  onArchiveTrip?: (archived: boolean) => Promise<void>;
  /** 여행을 지운다(7일 뒤 삭제). 공간 관리자에게만 넘어온다. */
  onDeleteTrip?: () => Promise<void>;
  /** 서버 여행 id. 있으면 장소를 서버와 맞춘다. 예시 여행에는 없다. */
  tripId?: string;
  /** 서버 공간 id. 메모·일기·사진을 신고할 때 쓴다. 예시 공간에는 없다. */
  spaceId?: string;
  /** 관리자·편집 가능 멤버인지. 메모 시트의 휴지통을 이 사람에게만 보인다. */
  canEditRecords?: boolean;
  /** 공간 사람의 이름과 membership id. 교통편의 탈 사람을 서버에 보낼 때 쓴다. */
  spaceRoster?: RosterEntry[];
  /** 서버에 저장된 통화·환율·예산·정산 묶기. */
  serverExpenseSettings?: ExpenseSettings;
  /** 통화·환율·예산·정산 묶기를 서버에 저장한다. */
  onUpdateExpenseSettings?: (settings: ExpenseSettings) => Promise<void>;
  /** 홈 화면의 여행 카드에 깔린 사진 한 장. */
  coverPhotoId?: string;
  /** 대표 사진에서 홈 카드에 보여 주는 부분(`coverCrop.ts`). */
  coverFocus?: CoverFocus;
  /**
   * 홈 화면에 깔 것을 바꾼다. 사진 한 장이고, `null` 이면 해제다.
   *
   * `localUris` 는 이 기기가 들고 있는 그 사진들의 자리(사진 id → 자리)다. 넘기면
   * 홈이 서버에서 썸네일을 받기 전에 바로 바뀐다.
   */
  onUpdateHomeCover?: (
    고른_것: HomeCoverChoice,
    localUris?: Record<string, string | undefined>,
  ) => Promise<void>;
  initialPlanning?: TripPlanningData;
  onSavePlanning?: (planning: TripPlanningData) => void;
  /** 이 여행이 속한 공간의 멤버 전원. 참가자를 고를 때의 후보다. */
  spaceMembers?: string[];
  /** 이 여행을 고칠 수 있는지. 보기만 하는 멤버면 false 다. 예시 여행은 늘 고칠 수 있다. */
  canEdit?: boolean;
  /** 공간 관리자인지. 남이 올린 사진도 고치고 지울 수 있다. */
  isOwner?: boolean;
  /** 내 membership id. 내가 올린 사진인지 가릴 때 쓴다. */
  myMembershipId?: string;
  /**
   * 이 앱을 쓰는 사람이 누구인지.
   *
   * 정산은 결국 "내가 누구에게 보내고 누구에게 받나" 다. 이걸 모르면 화면이
   * 전체 조망밖에 못 해서, 세 줄 중 내 줄을 눈으로 찾게 된다.
   */
  me?: string;
};

// 날짜 선택지는 "9월 24일 (목)" 꼴이다. 미리보기 칸에는 일 숫자만 크게 쓴다.



/**
 * 여행 기간을 읽을 수 없을 때 날짜 고르개가 잠깐 쓰는 날.
 *
 * 기간이 비었거나 모양이 틀린 기록에서도 고르개가 텅 비어 보이지 않게 오늘부터 사흘을
 * 놓는다. 여기 적은 날은 코덱이 「여행 기간 밖」으로 보아 서버로 올리지 않는다.
 */
const 기간_없는_여행의_날짜 = [0, 1, 2].map((더할_날) => shiftDateKey(dateKey(new Date()), 더할_날));



/**
 * 사진 파일을 실제로 서버에 보내는 길. 앱 전역 대기열에 끼워 준다.
 *
 * 대기열(`photoUploads.ts`)은 expo 를 가져오지 않아야 `node --test` 로 바로 볼 수 있다.
 * 그래서 보내는 길만 여기서 넘긴다. React 를 붙들지 않는 함수라 화면이 사라져도 산다.
 */

const sendPhotoFile = (job: PhotoUploadJob, 알림?: UploadNotice) =>
  uploadPhoto(job.tripId, job.photoId, job.uri, job.body, 알림);


export function WarmTripDetail({
  done,
  onClose,
  initialDestination = "overview",
  appTheme,
  visitedAfterTrip = true,
  tripName = "전주 한옥마을",
  tripDate = "8월 21일 — 23일",
  tripStart,
  tripEnd,
  tripRegion = "전북",
  tripNote = "함께 천천히 걷는 여행",
  onUpdateTrip,
  onUpdateParticipants,
  onRefreshTrip,
  archived = false,
  onArchiveTrip,
  onDeleteTrip,
  tripId,
  spaceId,
  canEditRecords = false,
  spaceRoster = [],
  serverExpenseSettings,
  onUpdateExpenseSettings,
  coverPhotoId,
  coverFocus,
  onUpdateHomeCover,
  initialPlanning: savedPlanning,
  onSavePlanning,
  spaceMembers = ["하늘", "여울"],
  me = spaceMembers[0] ?? "",
  canEdit = true,
  isOwner = false,
  myMembershipId,
}: Props) {
  // 열 때 한 번, 기록 안의 이름을 지금 사람 표에 맞춘다. 아래 상태는 모두 이 값에서 시작한다.
  const [initialPlanning] = useState(() => rebindPeople(savedPlanning, spaceRoster));
  const personNames = initialPlanning?.personNames;
  const memo = memoPaper(Boolean(appTheme?.dark));
  const [currentStart, setCurrentStart] = useState(tripStart ?? "");
  const [currentEnd, setCurrentEnd] = useState(tripEnd ?? "");
  const [region, setRegion] = useState(tripRegion);
  const [note, setNote] = useState(tripNote);
  const tripDates = buildTripDates(currentStart, currentEnd);
  const tripDayOptions = tripDates.length ? tripDates.map(dateKey) : 기간_없는_여행의_날짜;
  const tripDateOptions = tripDates.length ? tripDates.map(dateLabel) : ["8월 21일", "8월 22일", "8월 23일"];
  const todayTripDay = todayAmong(tripDates);
  const tripEnded = tripIsOver(tripDates);
  const firstTripDate = tripDateOptions[0];
  const lastTripDate = tripDateOptions[tripDateOptions.length - 1];
  const currentTripDate = tripDates.length ? formatTripPeriod(currentStart, currentEnd) : tripDate;
  const tripNights = Math.max(0, tripDates.length - 1);
  const tripDuration = tripDates.length
    ? tripNights
      ? `${tripNights}박 ${tripDates.length}일`
      : "당일 여행"
    : "여행 기간";
  const [mode, setMode] = useState<ViewMode>(() =>
    destinationMode(initialDestination),
  );
  const detailScrollRef = useRef<ScrollView>(null);
  /** 떠 있는 ＋ 단추가 「지출 추가」를 여는 길. 비용 탭이 채운다. */
  const 지출_추가_열기 = useRef<(() => void) | null>(null);
  /**
   * 화면 아래 시스템 막대의 높이. 떠 있는 단추는 이만큼 위에 놓는다.
   *
   * 단추는 `position: absolute` 라 화면 맨 아래를 기준으로 놓인다. 아이폰은 그 자리가
   * 얇은 홈 막대라 티가 안 났지만, 안드로이드의 버튼 막대(Ⅲ ○ <)는 두께가 있어 단추가
   * 그 위에 걸쳤다(2026-09-21 갤럭시에서 봤다).
   */
  const 아래_여백 = useSafeAreaInsets().bottom;
  /** 화면 위에 붙어 있는 탭 줄의 높이. 어느 자리로 내려 보낼 때 그만큼 덜 내린다. */
  const 탭줄_높이 = useRef(0);
  /**
   * 탭 안의 한 자리로 내려 보낸다. `y` 는 스크롤 내용 맨 위에서 잰 자리다.
   *
   * 탭 줄이 화면 위에 붙어 있어서 그대로 보내면 그 줄에 가린다. 줄 높이만큼,
   * 그리고 숨 쉴 틈만큼 덜 내린다.
   */
  const 자리로_내리기 = useCallback((y: number) => {
    detailScrollRef.current?.scrollTo({ y: Math.max(0, y - 탭줄_높이.current - 8), animated: true });
  }, []);
  /**
   * 당겨서 새로고침. 열려 있는 목록을 전부 다시 받고, 여행 제목·기간도 서버 것으로 맞춘다.
   *
   * 웹의 RefreshControl 은 빈 칸이라 당겨도 불리지 않는다. 그래서 SyncNotice 가 웹에서만
   * 작은 새로고침 버튼을 같이 둔다.
   */
  const [refreshing, setRefreshing] = useState(false);
  const refreshLists = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([reloadOpenLists(), onRefreshTrip?.().catch(() => undefined)]);
    } finally {
      setRefreshing(false);
    }
  }, [onRefreshTrip]);
  const showMode = (nextMode: ViewMode) => {
    setMode(nextMode);
    detailScrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const [title, setTitle] = useState(tripName);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftStart, setDraftStart] = useState(currentStart);
  const [draftEnd, setDraftEnd] = useState(currentEnd);
  const [draftRegion, setDraftRegion] = useState(region);
  const [draftNote, setDraftNote] = useState(note);
  const [tripNoteOpen, setTripNoteOpen] = useState(false);
  const [showAllEditRegions, setShowAllEditRegions] = useState(false);
  const [editingTrip, setEditingTrip] = useState(false);
  // 여행을 고칠 때도 참가자를 바꾼다. 비용 탭 안에만 두면 누가 가는지 정하는
  // 일이 돈 얘기처럼 보이는데, 실제로는 준비물과 교통편의 담당도 여기서 갈린다.
  const [draftTripPeople, setDraftTripPeople] = useState<Participant[]>([]);
  const [memoPanel, setMemoPanel] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoEditorOpen, setMemoEditorOpen] = useState(false);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [reportingMemoId, setReportingMemoId] = useState<string | null>(null);
  const [tripNotes, setTripNotes] = useState<TripNote[]>(initialPlanning?.tripNotes ?? []);
  // 메모는 적던 글만 보면 된다. 고치는 중이면 원래 글과, 새로 적는 중이면 빈 글과 견준다.
  const memoDraftChanged = memoEditorOpen
    && memoDraft.trim() !== (editingMemoId ? tripNotes.find((note) => note.id === editingMemoId)?.body ?? "" : "");
  const [hasKitchen, setHasKitchen] = useState(initialPlanning?.hasKitchen ?? true);
  const [feedback, setFeedback] = useState("");
  /**
   * 알림에 붙은 단추. 어느 알림의 것인지 글과 함께 들고 있다. 다른 곳이 `setFeedback` 으로
   * 새 알림을 띄우면 글이 달라져 옛 단추가 따라붙지 않는다.
   */
  const [feedbackAction, setFeedbackAction] = useState<(FeedbackAction & { message: string }) | null>(null);
  const 알리기 = useCallback((message: string, action?: FeedbackAction) => {
    setFeedback(message);
    setFeedbackAction(action ? { ...action, message } : null);
  }, [setFeedback]);
  const 알림_단추 = feedbackAction && feedbackAction.message === feedback ? feedbackAction : null;
  /**
   * 다른 곳에서 먼저 고친 여행이면 최신 내용으로 화면을 되돌린다. 처리했으면 true.
   *
   * 고치던 값을 그대로 다시 저장하게 두면 남이 고친 것을 모른 채 덮어쓴다.
   */
  const showLatestTrip = (caught: unknown) => {
    if (!(caught instanceof TripConflictError)) return false;
    const { latest } = caught;
    setTitle(latest.name);
    setCurrentStart(latest.start);
    setCurrentEnd(latest.end);
    setRegion(latest.region);
    setNote(latest.note);
    if (latest.participants?.length) setParticipants(latest.participants);
    setFeedback(caught.message);
    return true;
  };
  /** 참가자를 바꾼다. 시트를 닫아도 되면 true(저장했거나 최신 내용으로 되돌렸다). */
  const saveParticipants = async (next: Participant[]) => {
    try {
      const confirmed = await onUpdateParticipants?.(next);
      setParticipants(confirmed ?? next);
      return true;
    } catch (caught) {
      if (showLatestTrip(caught)) return true;
      setFeedback(saveErrorMessage(caught));
      return false;
    }
  };
  // 준비물 담당과 요리 재료 담당, 교통편 이용자, 지출의 몫이 모두 이 목록을 쓴다.
  // 한 군데서만 정하지 않으면 같은 여행 안에서 사람 목록이 서로 어긋난다.
  const [participants, setParticipants] = useState<Participant[]>(
    initialPlanning?.participants ?? spaceMembers,
  );
  const [packingItems, setPackingItems] = useState<PackingItem[]>(() =>
    (initialPlanning?.packingItems ?? []).map((item) => ({
      ...item,
      owner: normalizePackingOwner(item.owner, initialPlanning?.participants ?? spaceMembers),
    })),
  );
  const [packingDone, setPackingDone] = useState<string[]>(
    initialPlanning?.packingDone ?? [],
  );
  const togglePacking = (item: string) =>
    setPackingDone((items) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item]);
  const [recipes, setRecipes] = useState<Recipe[]>(() =>
    initialPlanning?.recipes ?? [],
  );
  const [cookingReadyIngredientIds, setCookingReadyIngredientIds] = useState<string[]>(
    initialPlanning?.cookingReadyIngredientIds ?? [],
  );
  const [expenses, setExpenses] = useState<Expense[]>(
    // 예시 지출은 여행마다 WarmAppShell 에서 심는다. 새로 만든 여행은 비어서 시작한다.
    // 옛 저장 데이터는 낸 사람과 몫이 두 사람으로 박혀 있어서 여기서 옮긴다.
    (initialPlanning?.expenses ?? []).map(normalizeExpense),
  );
  const [payments, setPayments] = useState<Payment[]>(initialPlanning?.payments ?? []);
  // 서버와 맞춘 적이 있으면 서버 값으로 연다. 다른 기기에서 바꾼 통화가 보여야 한다.
  const settingsFromServer = initialPlanning?.expenseSettingsSynced ? serverExpenseSettings : undefined;
  const [simplifySettlement, setSimplifySettlement] = useState(
    settingsFromServer?.simplifySettlement ?? initialPlanning?.simplifySettlement ?? true,
  );
  // 예산은 정한 적이 없으면 0(예산 없음)이다. 예전에는 50만 원이 박혀 있어서, 예산을
  // 정한 적 없는 여행에도 「500,000원 남음 · 0%」 막대가 떴다(2026-09-23).
  const [budget, setBudget] = useState(settingsFromServer?.budget ?? initialPlanning?.budget ?? 0);
  const [currency, setCurrency] = useState(settingsFromServer?.currency ?? initialPlanning?.currency ?? DEFAULT_CURRENCY.code);
  const [exchangeRate, setExchangeRate] = useState(settingsFromServer?.exchangeRate ?? initialPlanning?.exchangeRate ?? 1);
  const [memories, setMemories] = useState<TripMemoryData>(() =>
    initialPlanning?.memories
      ? {
        ...initialPlanning.memories,
        // 날짜 칸이 날짜 키가 아니면(옛 기록이 덜 옮겨졌거나 망가졌으면) 날짜 미정으로
        // 내린다. 사진 자체는 버리지 않는다.
        photos: initialPlanning.memories.photos.map((photo) => ({
          ...photo,
          date: validDateKey(photo.date) ? photo.date : UNDATED,
        })),
      }
      : initialMemoryData(currentTripDate),
  );
  const [openCookingPicker, setOpenCookingPicker] = useState(false);
  /**
   * 장소 탭에 열어 달라고 부탁한 장소 시트.
   *
   * 예약은 장소 안에서 적는다. 여행 탭의 「예약 추가」가 장소를 먼저 고르게 하고,
   * 고른 장소의 시트를 예약 칸이 펼쳐진 채로 연다. 두 탭은 서로 다른 컴포넌트라
   * 화면 위에서 한 번 건네 준다. `placeId` 가 없으면 새 장소부터 만든다.
   */
  const [placeSheetRequest, setPlaceSheetRequest] = useState<{ placeId: string | null } | null>(null);
  const openPlaceForReservation = (placeId: string | null) => {
    setPlaceSheetRequest({ placeId });
    showMode("장소");
  };
  const [registeredStay, setRegisteredStay] = useState<StayInfo>(() =>
    initialPlanning?.stay
      ? { ...initialPlanning.stay, showInSchedule: initialPlanning.stay.showInSchedule ?? true }
      : { name: "", checkin: "", checkout: "", address: "", showInSchedule: true },
  );
  const [places, setPlaces] = useState<PlaceItem[]>(() =>
    initialPlanning?.places ?? [],
  );
  const [reservations, setReservations] = useState<ReservationInfo[]>(() =>
    initialPlanning?.reservations ?? (
      initialPlanning?.reservation === undefined
        ? []
        : initialPlanning.reservation
          ? [initialPlanning.reservation]
          : []
    ),
  );
  const [transportations, setTransportations] = useState<Transportation[]>(
    initialPlanning?.transportations ?? [],
  );
  // 참가자에서 사람을 뺄 때, 그 이름으로 적어 둔 게 뭐가 있는지 한 줄로 적는다.
  // 담당은 이름으로 묶여 있어서 빼고 나면 어디에 남았는지 찾기 어렵다.
  const assignedSummary = useCallback(
    (person: string) => {
      const parts: string[] = [];
      const spent = expenses.filter((item) => item.payer === person).length;
      const packed = packingItems.filter((item) => item.owner === person).length;
      const cooked = recipes.reduce(
        (sum, recipe) => sum + recipe.ingredients.filter((item) => item.owner === person).length,
        0,
      );
      const rides = transportations.filter((item) => item.owner === person).length;
      if (spent) parts.push(`지출 ${spent}건`);
      if (packed) parts.push(`준비물 ${packed}개`);
      if (cooked) parts.push(`재료 ${cooked}개`);
      if (rides) parts.push(`교통편 ${rides}편`);
      return parts.join(" · ");
    },
    [expenses, packingItems, recipes, transportations],
  );
  const [schedule, setSchedule] = useState<ScheduleItem[]>(() =>
    initialPlanning?.schedule ?? [],
  );
  useEffect(() => {
    // 대표 숙소는 별도 편집 화면과 장소 탭에서도 바뀐다. 연결 일정은 이 한곳에서
    // 맞춰야 두 화면의 갱신 순서와 무관하게 같은 결과가 된다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSchedule((current) => {
      const linkedIndex = current.findIndex((item) =>
        item.stayId === "primary-stay" || (
          !item.stayId &&
          // 서버에 있는 줄은 누가 직접 만든 일정이다. 흡수하면 이 기기가 남의 줄을 지운다.
          // 숙소가 만든 줄과 겹쳐 보이더라도 그대로 둔다.
          !isServerId(item.id ?? "") &&
          Boolean(registeredStay.placeId) &&
          item.placeId === registeredStay.placeId &&
          item.title.endsWith(" 체크인")
        ),
      );
      if (!registeredStay.name || registeredStay.showInSchedule === false) {
        return linkedIndex < 0 ? current : current.filter((_, index) => index !== linkedIndex);
      }
      const checkinDateIndex = tripDateOptions.findIndex((date) => registeredStay.checkin.startsWith(date));
      const date = tripDayOptions[Math.max(0, checkinDateIndex)];
      const time = registeredStay.checkin.match(/\d{1,2}:\d{2}$/)?.[0] ?? "시간 미정";
      const linked: ScheduleItem = {
        time: `${weekdayOfKey(date)} · ${time}`,
        date,
        title: `${registeredStay.name} 체크인`,
        note: registeredStay.checkout ? `${registeredStay.checkout} 체크아웃` : "숙소 체크인",
        mapUrl: places.find((place) => place.id === registeredStay.placeId)?.mapUrl ?? "",
        placeId: registeredStay.placeId,
        stayId: "primary-stay",
      };
      if (linkedIndex < 0) return [...current, linked];
      const saved = current[linkedIndex];
      if (JSON.stringify(saved) === JSON.stringify(linked)) return current;
      return current.map((item, index) => index === linkedIndex ? linked : item);
    });
  // 날짜 배열은 현재 여행 기간에서 함께 파생되며 문자열 키가 실제 변경을 대표한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, registeredStay, tripDateOptions.join("|"), tripDayOptions.join("|")]);
  const [placeSyncIds, setPlaceSyncIds] = useState<string[]>(() => initialPlanning?.placeSyncIds ?? []);
  const [scheduleSyncIds, setScheduleSyncIds] = useState<string[]>(() => initialPlanning?.scheduleSyncIds ?? []);
  const [staySyncIds, setStaySyncIds] = useState<string[]>(() => initialPlanning?.staySyncIds ?? []);
  const serverTrip = isServerId(tripId);
  // 신고는 서버에 있는 공간과 여행의 것만 받는다.
  const reportSpaceId = serverTrip && isServerId(spaceId) ? spaceId : undefined;
  useEffect(() => {
    // 서버와 맞추기 전에, 이 기능이 생기기 전의 기록에 서버가 받는 id 를 준다.
    // 장소 id 는 일정·숙소가 가리키므로 함께 바꾼다. 한 번 바꾸면 저장되어 다시 돌지 않는다.
    if (!serverTrip) return;
    const map = legacyIdMap(places, newPlaceId);
    const rename = (id: string | undefined) => (id && map.has(id) ? map.get(id) : id);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (map.size) setPlaces((current) => current.map((place) => ({ ...place, id: rename(place.id) ?? place.id })));
    setSchedule((current) => current.some((item) => (!isServerId(item.id) && !isDerivedScheduleItem(item)) || (item.placeId && map.has(item.placeId)))
      ? current.map((item) => ({
        ...item,
        ...(!isServerId(item.id) && !isDerivedScheduleItem(item) ? { id: newPlaceId() } : {}),
        ...(item.placeId ? { placeId: rename(item.placeId) } : {}),
      }))
      : current);
    setRegisteredStay((current) => current.name && (!isServerId(current.id) || (current.placeId && map.has(current.placeId)))
      ? { ...current, id: isServerId(current.id) ? current.id : newPlaceId(), placeId: rename(current.placeId) }
      : current);
    // 교통편·예약의 옛 id 도 바꾸고, 그 id 로 만들어진 일정 줄이 따라가게 한다.
    // 지출과 주고받은 기록은 다른 줄이 가리키지 않아 id 만 바꾼다.
    if (expenses.some((item) => !isServerId(item.id))) {
      setExpenses((current) => current.map((item) => (isServerId(item.id) ? item : { ...item, id: newPlaceId() })));
    }
    if (payments.some((item) => !isServerId(item.id))) {
      setPayments((current) => current.map((item) => (isServerId(item.id) ? item : { ...item, id: newPlaceId() })));
    }
    // 메모와 일기는 다른 줄이 가리키지 않아 id 만 바꾼다.
    if (tripNotes.some((item) => !isServerId(item.id))) {
      setTripNotes((current) => current.map((item) => (isServerId(item.id) ? item : { ...item, id: newPlaceId() })));
    }
    if (memories.diaries.some((item) => !isServerId(item.id)) || memories.photos.some((item) => !isServerId(item.id))) {
      setMemories((current) => ({
        ...current,
        diaries: current.diaries.map((item) => (isServerId(item.id) ? item : { ...item, id: newPlaceId() })),
        photos: current.photos.map((item) => (isServerId(item.id) ? item : { ...item, id: newPlaceId() })),
      }));
    }
    // 준비물·요리·재료의 옛 id 도 바꾸고, 체크해 둔 것이 따라가게 한다.
    const packingMap = new Map<string, string>();
    for (const item of packingItems) if (!isServerId(item.id)) packingMap.set(item.id, newPlaceId());
    if (packingMap.size) {
      setPackingItems((current) => current.map((item) => ({ ...item, id: packingMap.get(item.id) ?? item.id })));
      setPackingDone((current) => current.map((id) => packingMap.get(id) ?? id));
    }
    const recipeMap = new Map<string, string>();
    for (const recipe of recipes) {
      if (!isServerId(recipe.id)) recipeMap.set(recipe.id, newPlaceId());
      for (const item of recipe.ingredients) if (!isServerId(item.id)) recipeMap.set(item.id, newPlaceId());
    }
    if (recipeMap.size) {
      const renameCooking = (id: string) => recipeMap.get(id) ?? id;
      setRecipes((current) => current.map((recipe) => ({
        ...recipe,
        id: renameCooking(recipe.id),
        ingredients: recipe.ingredients.map((item) => ({ ...item, id: renameCooking(item.id) })),
      })));
      setCookingReadyIngredientIds((current) => current.map(renameCooking));
    }
    const bookingMap = new Map<string, string>();
    for (const item of [...transportations, ...reservations]) {
      if (!isServerId(item.id)) bookingMap.set(item.id, newPlaceId());
    }
    if (bookingMap.size) {
      const renameBooking = (id: string) => bookingMap.get(id) ?? id;
      setTransportations((current) => current.map((item) => ({ ...item, id: renameBooking(item.id) })));
      setReservations((current) => current.map((item) => ({ ...item, id: renameBooking(item.id) })));
      setSchedule((current) => current.map((item) => ({
        ...item,
        ...(item.transportationId ? { transportationId: renameBooking(item.transportationId) } : {}),
        ...(item.reservationId ? { reservationId: renameBooking(item.reservationId) } : {}),
      })));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // 여는 순간 한 번만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTrip]);
  const tripDateKeyList = useMemo(() => tripDateKeys(currentStart, currentEnd), [currentStart, currentEnd]);
  const serverPlaceIds = useMemo(() => new Set(placeSyncIds), [placeSyncIds]);
  useListSync({
    tripId,
    label: "장소",
    items: places,
    setItems: setPlaces,
    codec: placeCodec,
    api: { list: listTripPlaces, create: createTripPlace, update: updateTripPlace, remove: deleteTripPlace },
    syncedIds: placeSyncIds,
    setSyncedIds: setPlaceSyncIds,
    notify: setFeedback,
  });
  const scheduleSyncCodec = useMemo(
    () => scheduleCodec(tripDateKeyList, serverPlaceIds),
    [serverPlaceIds, tripDateKeyList],
  );
  useListSync({
    tripId,
    label: "일정",
    items: schedule,
    setItems: setSchedule,
    codec: scheduleSyncCodec,
    api: { list: listScheduleItems, create: createScheduleItem, update: updateScheduleItem, remove: deleteScheduleItem },
    syncedIds: scheduleSyncIds,
    setSyncedIds: setScheduleSyncIds,
    // 장소가 서버에 올라가야 일정에 장소를 이을 수 있다. 기간이 바뀌면 날짜도 다시 본다.
    refreshKey: `${placeSyncIds.join(",")}|${tripDateKeyList.join(",")}`,
    notify: setFeedback,
  });
  useEffect(() => {
    // 서버 숙소에는 이름·주소가 없어 이은 장소의 것을 쓴다. 다른 기기에서 받은 숙소는
    // 장소보다 먼저 도착해 이름을 모를 수 있어, 장소가 들어오면 그 이름으로 맞춘다.
    if (!registeredStay.placeId) return;
    const place = places.find((item) => item.id === registeredStay.placeId);
    if (!place || (place.name === registeredStay.name && (place.address ?? "") === registeredStay.address)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegisteredStay((current) => ({ ...current, name: place.name, address: place.address ?? current.address }));
  }, [places, registeredStay.placeId, registeredStay.name, registeredStay.address]);
  // 앱에는 대표 숙소가 하나다. 서버 목록과 맞추려고 0개나 1개짜리 목록으로 본다.
  const stayList = useMemo(() => (registeredStay.name ? [registeredStay] : []), [registeredStay]);
  const setStayList = (updater: (current: StayInfo[]) => StayInfo[]) => {
    setRegisteredStay((current) => {
      const next = updater(current.name ? [current] : [])[0];
      return next
        ? { ...next, showInSchedule: next.showInSchedule ?? true }
        : { name: "", checkin: "", checkout: "", address: "", showInSchedule: false };
    });
  };
  const staySyncCodec = useMemo(
    () => stayCodec(tripDateKeyList, serverPlaceIds, (id) => places.find((place) => place.id === id)),
    [places, serverPlaceIds, tripDateKeyList],
  );
  useListSync({
    tripId,
    label: "숙소",
    items: stayList,
    setItems: setStayList,
    codec: staySyncCodec,
    api: { list: listStays, create: createStay, update: updateStay, remove: deleteStay },
    syncedIds: staySyncIds,
    setSyncedIds: setStaySyncIds,
    refreshKey: `${placeSyncIds.join(",")}|${tripDateKeyList.join(",")}`,
    notify: setFeedback,
  });
  const [transportSyncIds, setTransportSyncIds] = useState<string[]>(() => initialPlanning?.transportSyncIds ?? []);
  const [reservationSyncIds, setReservationSyncIds] = useState<string[]>(() => initialPlanning?.reservationSyncIds ?? []);
  const rosterKey = spaceRoster.map((entry) => `${entry.id}:${entry.name}`).join(",");
  const transportSyncCodec = useMemo(
    () => transportCodec(tripDateKeyList, spaceRoster),
    // 사람 표는 렌더마다 새 배열이라 글자 키로 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterKey, tripDateKeyList],
  );
  useListSync({
    tripId,
    label: "교통편",
    items: transportations,
    setItems: setTransportations,
    codec: transportSyncCodec,
    api: { list: listTransports, create: createTransport, update: updateTransport, remove: deleteTransport },
    syncedIds: transportSyncIds,
    setSyncedIds: setTransportSyncIds,
    refreshKey: `${rosterKey}|${tripDateKeyList.join(",")}`,
    notify: setFeedback,
  });
  const reservationSyncCodec = useMemo(
    () => reservationCodec(tripDateKeyList, serverPlaceIds),
    [serverPlaceIds, tripDateKeyList],
  );
  useListSync({
    tripId,
    label: "예약",
    items: reservations,
    setItems: setReservations,
    codec: reservationSyncCodec,
    api: { list: listReservations, create: createReservation, update: updateReservation, remove: deleteReservation },
    syncedIds: reservationSyncIds,
    setSyncedIds: setReservationSyncIds,
    // 장소가 서버에 올라가야 예약을 그 장소에 붙일 수 있다. 일정 줄과 같은 규칙이다.
    refreshKey: `${placeSyncIds.join(",")}|${tripDateKeyList.join(",")}`,
    notify: setFeedback,
  });
  const [expenseSyncIds, setExpenseSyncIds] = useState<string[]>(() => initialPlanning?.expenseSyncIds ?? []);
  const [paymentSyncIds, setPaymentSyncIds] = useState<string[]>(() => initialPlanning?.paymentSyncIds ?? []);
  const expenseSyncCodec = useMemo(
    () => expenseCodec(tripDateKeyList, spaceRoster),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterKey, tripDateKeyList],
  );
  useListSync({
    tripId,
    label: "지출",
    items: expenses,
    setItems: setExpenses,
    codec: expenseSyncCodec,
    api: { list: listExpenses, create: createExpense, update: updateExpense, remove: deleteExpense },
    syncedIds: expenseSyncIds,
    setSyncedIds: setExpenseSyncIds,
    refreshKey: `${rosterKey}|${tripDateKeyList.join(",")}`,
    notify: setFeedback,
  });
  const paymentSyncCodec = useMemo(
    () => paymentCodec(spaceRoster),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterKey],
  );
  useListSync({
    tripId,
    label: "주고받은 기록",
    items: payments,
    setItems: setPayments,
    codec: paymentSyncCodec,
    api: {
      list: listPayments,
      create: createPayment,
      // 기록은 고치지 않는다. 앱도 새로 적거나 되돌리기만 한다.
      update: async () => {
        throw new DaymoApiError("주고받은 기록은 수정할 수 없어요.", 422, "VALIDATION_ERROR");
      },
      remove: undoPayment,
    },
    syncedIds: paymentSyncIds,
    setSyncedIds: setPaymentSyncIds,
    refreshKey: rosterKey,
    notify: setFeedback,
  });
  const [packingSyncIds, setPackingSyncIds] = useState<string[]>(() => initialPlanning?.packingSyncIds ?? []);
  const [recipeSyncIds, setRecipeSyncIds] = useState<string[]>(() => initialPlanning?.recipeSyncIds ?? []);
  // 서버에 올라간 요리마다 재료 id. 준비물의 재료 연결은 여기 있는 재료만 보낸다.
  // 요리 목록을 받기 전(null)에는 준비물도 맞추지 않는다. 먼저 맞추면 연결을 비운 모습을
  // 기준으로 삼아, 요리가 들어온 뒤 연결을 다시 보내는 고치기가 열 때마다 생긴다.
  const [serverIngredientsByRecipe, setServerIngredientsByRecipe] = useState<Record<string, string[]> | null>(null);
  const serverIngredientIds = useMemo(
    () => new Set(Object.values(serverIngredientsByRecipe ?? {}).flat()),
    [serverIngredientsByRecipe],
  );
  const serverIngredientKey = [...serverIngredientIds].sort().join(",");
  // 체크는 목록 밖에 따로 둔다. 서버와 맞출 때만 줄에 붙여 본다.
  const packingRows = useMemo<PackingRow[]>(
    () => packingItems.map((item) => ({ ...item, tags: packingTags(item), done: packingDone.includes(item.id) })),
    [packingDone, packingItems],
  );
  const packingRowsRef = useRef(packingRows);
  useEffect(() => {
    packingRowsRef.current = packingRows;
  }, [packingRows]);
  const setPackingRows = (updater: (current: PackingRow[]) => PackingRow[]) => {
    const next = updater(packingRowsRef.current);
    packingRowsRef.current = next;
    setPackingItems(next.map(({ id, name, quantity, owner, tags, sourceIngredientId }) => ({
      id, name, quantity, owner, tags, ...(sourceIngredientId ? { sourceIngredientId } : {}),
    })));
    setPackingDone(next.filter((row) => row.done).map((row) => row.id));
  };
  const packingSyncCodec = useMemo(
    () => packingCodec(spaceRoster, serverIngredientIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterKey, serverIngredientIds],
  );
  useListSync({
    tripId: serverIngredientsByRecipe ? tripId : undefined,
    label: "준비물",
    items: packingRows,
    setItems: setPackingRows,
    codec: packingSyncCodec,
    api: { list: listChecklistItems, create: createChecklistItem, update: updateChecklistItem, remove: deleteChecklistItem },
    syncedIds: packingSyncIds,
    setSyncedIds: setPackingSyncIds,
    // 재료가 서버에 올라가야 준비물에 재료를 이을 수 있다.
    refreshKey: `${rosterKey}|${serverIngredientKey}`,
    notify: setFeedback,
  });
  const recipeRows = useMemo<RecipeRow[]>(
    () => recipes.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((item) => ({ ...item, ready: cookingReadyIngredientIds.includes(item.id) })),
    })),
    [cookingReadyIngredientIds, recipes],
  );
  const recipeRowsRef = useRef(recipeRows);
  useEffect(() => {
    recipeRowsRef.current = recipeRows;
  }, [recipeRows]);
  const setRecipeRows = (updater: (current: RecipeRow[]) => RecipeRow[]) => {
    const next = updater(recipeRowsRef.current);
    recipeRowsRef.current = next;
    setRecipes(next.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      note: recipe.note,
      url: recipe.url,
      ingredients: recipe.ingredients.map(({ id, name, quantity, group, owner }) => ({ id, name, quantity, group, owner })),
    })));
    setCookingReadyIngredientIds(next.flatMap((recipe) => recipe.ingredients.filter((item) => item.ready).map((item) => item.id)));
  };
  const recipeSyncCodec = useMemo(
    () => recipeCodec(spaceRoster),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterKey],
  );
  useListSync({
    tripId,
    label: "요리",
    items: recipeRows,
    setItems: setRecipeRows,
    codec: recipeSyncCodec,
    api: {
      // 서버가 돌려준 요리로 재료 id 를 적어 둔다. 준비물의 재료 연결이 이것을 본다.
      list: async (serverTripId) => {
        const rows = await listRecipes(serverTripId);
        setServerIngredientsByRecipe(Object.fromEntries(rows.map((row) => [row.id, row.ingredients.map((item) => item.id)])));
        return rows;
      },
      create: async (serverTripId, id, body) => {
        const row = await createRecipe(serverTripId, id, body);
        setServerIngredientsByRecipe((current) => ({ ...current, [row.id]: row.ingredients.map((item) => item.id) }));
        return row;
      },
      update: async (id, version, body) => {
        const row = await updateRecipe(id, version, body);
        setServerIngredientsByRecipe((current) => ({ ...current, [row.id]: row.ingredients.map((item) => item.id) }));
        return row;
      },
      remove: async (id) => {
        try {
          await deleteRecipe(id);
        } catch (caught) {
          if (!(caught instanceof DaymoApiError) || caught.status !== 404) throw caught;
        }
        setServerIngredientsByRecipe((current) => {
          if (!current) return current;
          const { [id]: _removed, ...rest } = current;
          return rest;
        });
      },
    },
    syncedIds: recipeSyncIds,
    setSyncedIds: setRecipeSyncIds,
    refreshKey: rosterKey,
    notify: setFeedback,
  });
  const [memoSyncIds, setMemoSyncIds] = useState<string[]>(() => initialPlanning?.memoSyncIds ?? []);
  const [diarySyncIds, setDiarySyncIds] = useState<string[]>(() => initialPlanning?.diarySyncIds ?? []);
  const memoSyncCodec = useMemo(
    () => memoCodec(spaceRoster),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterKey],
  );
  // 휴지통에서 되살리면 올린다. 그 목록을 서버에서 다시 받는다.
  const [trashReload, setTrashReload] = useState({ memo: 0, photo: 0 });
  /**
   * 휴지통 하나. 여행 메모 시트와 기록 탭 두 곳에 같은 것을 놓는다.
   *
   * 메모 시트 맨 아래에만 있어서 사진을 지운 사람이 되찾는 길을 못 찾았다(2026-09-23).
   * 각자 펼침 상태를 따로 들고 있어야 해서 부품을 하나 만들어 두 곳에 건다.
   */
  const 휴지통 = () => (
    <TripTrash
      tripId={tripId ?? ""}
      appTheme={appTheme}
      notify={setFeedback}
      onRestored={(item) => {
        // 이 기기에서 받았던 사진이면 파일을 다시 받게 한다. 지울 때 기기 파일도 사라졌다.
        if (item.type === "photo") photoDownloads.current.delete(item.id);
        setTrashReload((current) => ({ ...current, [item.type]: current[item.type] + 1 }));
      }}
    />
  );
  useListSync({
    tripId,
    label: "메모",
    items: tripNotes,
    setItems: setTripNotes,
    codec: memoSyncCodec,
    api: { list: listMemos, create: createMemo, update: updateMemo, remove: deleteMemo },
    syncedIds: memoSyncIds,
    setSyncedIds: setMemoSyncIds,
    reloadKey: trashReload.memo,
    notify: setFeedback,
  });
  useListSync({
    tripId,
    label: "일기",
    items: memories.diaries,
    setItems: (updater) => setMemories((current) => ({ ...current, diaries: updater(current.diaries) })),
    codec: diaryCodec,
    api: { list: listDiaries, create: createDiary, update: updateDiary, remove: deleteDiary },
    syncedIds: diarySyncIds,
    setSyncedIds: setDiarySyncIds,
    notify: setFeedback,
  });
  const [photoSyncIds, setPhotoSyncIds] = useState<string[]>(() => initialPlanning?.photoSyncIds ?? []);
  const knownPhotoIds = useMemo(() => new Set(photoSyncIds), [photoSyncIds]);
  // 사진을 붙일 수 있는 곳은 서버에 올라간 장소·일정·숙소뿐이다. 아직 못 올린 곳에
  // 붙은 사진은 그곳이 올라간 뒤에 붙는다(일정이 장소를 잇는 것과 같은 규칙이다).
  const serverLinkTargetIds = useMemo(
    () => new Set([...placeSyncIds, ...scheduleSyncIds, ...staySyncIds]),
    [placeSyncIds, scheduleSyncIds, staySyncIds],
  );
  const photoSyncCodec = useMemo(
    () => photoCodec(tripDateKeyList, knownPhotoIds, serverLinkTargetIds),
    [knownPhotoIds, serverLinkTargetIds, tripDateKeyList],
  );
  // 새 사진을 올릴 때 파일 자리를 찾는다. 서버로 가는 칸(설명·날짜)에는 자리가 없다.
  const photosRef = useRef(memories.photos);
  useEffect(() => {
    photosRef.current = memories.photos;
  }, [memories.photos]);
  useListSync({
    tripId,
    label: "사진",
    items: memories.photos,
    setItems: (updater) => setMemories((current) => ({ ...current, photos: updater(current.photos) })),
    codec: photoSyncCodec,
    api: {
      list: listPhotos,
      // 파일은 이 훅이 아니라 앱 전역 대기열이 보낸다. 여기서는 그 한 장이 끝나기를
      // 기다렸다가 서버 줄을 받아 갈 뿐이다. 화면이 사라지면 기다리던 쪽만 없어지고
      // 대기열은 그대로 돈다(아래 「아직 못 올린 사진을 대기열에 넣는다」).
      create: async (serverTripId, id, body) => {
        const uri = photosRef.current.find((photo) => photo.id === id)?.uri;
        if (!uri) throw new DaymoApiError("사진 파일을 찾지 못했어요. 사진을 다시 골라 주세요.", 422, "VALIDATION_ERROR");
        const row = await photoUploads.join({ tripId: serverTripId, photoId: id, uri, body }, sendPhotoFile);
        // 웹은 사진을 브라우저 저장소에 넣지 않는다. 올린 뒤에는 비워 두고, 화면에 필요할 때
        // 서버에서 다시 받아 blob 으로만 들고 있는다(photoTransfer.downloadPhoto).
        if (Platform.OS === "web" && uri.startsWith("data:")) {
          setMemories((current) => ({
            ...current,
            photos: current.photos.map((photo) => (photo.id === id ? { ...photo, uri: undefined } : photo)),
          }));
        }
        return row;
      },
      update: updatePhoto,
      remove: deleteServerPhoto,
    },
    syncedIds: photoSyncIds,
    setSyncedIds: setPhotoSyncIds,
    // 여행이 끝나면 수십 장을 한 번에 넣는다. 세 장씩 보낸다.
    createBatch: 3,
    refreshKey: `${tripDateKeyList.join(",")}|${[...serverLinkTargetIds].join(",")}`,
    reloadKey: trashReload.photo,
    // 편집 멤버도 남이 올린 사진은 못 고친다. 보기만 하는 멤버에게는 기본 안내가 맞다.
    forbiddenMessage: canEdit ? "올린 사람과 관리자만 이 사진을 수정할 수 있어요" : undefined,
    notify: setFeedback,
  });
  /**
   * 아직 못 올린 사진을 앱 전역 대기열에 넣는다.
   *
   * 올리기를 이 화면이 끌면 시트를 닫거나 여행을 나가는 순간 멈춘다. 여행이 끝나고
   * 마흔 장을 넣어 둔 사람이 잠깐 다른 화면에 다녀왔다고 처음부터 기다리는 셈이라,
   * 줄을 React 바깥에 두고 여기서는 넣기만 한다(`photoUploads.ts`).
   *
   * 죽은 blob: 자리는 넣지 않는다. 웹에서 탭을 새로 열면 지난 탭이 만든 사진 자리는
   * 이미 없어서, 보내 봐야 파일을 못 찾았다는 답만 돌아온다.
   */
  useEffect(() => {
    if (!tripId) return;
    const 보낼_것 = memories.photos
      .filter((photo) => isServerId(photo.id) && isLivePhotoUri(photo.uri) && !knownPhotoIds.has(photo.id))
      .map((photo) => ({
        tripId,
        photoId: photo.id,
        uri: photo.uri as string,
        body: photoSyncCodec.toBody(photo),
      }));
    if (보낼_것.length) photoUploads.add(보낼_것, sendPhotoFile);
  }, [knownPhotoIds, memories.photos, photoSyncCodec, tripId]);
  /**
   * 올라간 사진의 `data:` 자리를 비운다(웹만).
   *
   * 브라우저 저장소는 몇 MB 뿐이라 고른 사진까지 적으면 기록 전체가 저장되지 않는다
   * (`WarmAppShell` 의 `storableTrips`). 화면이 있을 때는 만들기가 곧바로 비우지만,
   * 나가 있는 동안 올라간 것은 돌아와서 한 번에 비운다.
   */
  useEffect(() => {
    if (Platform.OS !== "web" || !tripId) return;
    const 비운다 = () => {
      const 올라간_것 = new Set(photoUploads.uploadedIds(tripId));
      if (!올라간_것.size) return;
      setMemories((current) => {
        if (!current.photos.some((photo) => 올라간_것.has(photo.id) && photo.uri?.startsWith("data:"))) return current;
        return {
          ...current,
          photos: current.photos.map((photo) =>
            올라간_것.has(photo.id) && photo.uri?.startsWith("data:") ? { ...photo, uri: undefined } : photo),
        };
      });
    };
    // 바뀐 것이 없으면 그대로 돌려주므로 다시 그리지 않는다.
    비운다();
    return photoUploads.subscribe(비운다);
  }, [tripId]);
  /**
   * 다른 기기에서 올린 사진의 **표시본**(긴 변 2048px)을 받는다.
   *
   * 2026-09-23 검토 #6(가) 전에는 여행을 열기만 하면 `knownPhotoIds` 의 사진을 전부
   * 순차로 받았다. 기록 탭을 보지 않아도 받고 문서 폴더에 영원히 남아서, 사진 1,000장이면
   * 500MB 가 쌓였다. 이제는 **달라는 것만** 받는다 — 크게 보기로 연 한 장과 그 앞뒤
   * 한 장, 카드에 넣으려고 고른 사진이다(`Memories` 의 `표시본_요청`).
   * 격자·사진첩·장소 줄의 작은 칸은 썸네일(480px)을 쓴다(`photoThumbnails.ts`).
   *
   * 서버가 표시본을 다시 만들어 판이 올라갔으면(`DISPLAY_REVISION`) 한 번 새로 받고
   * 옛 파일은 지운다. 그러지 않으면 이미 본 사진은 옛 크기 그대로 남는다.
   */
  const photoDownloads = useRef(new Set<string>());
  /** 이 화면이 표시본을 몇 장 받았는지. 고치기 전후를 숫자로 견주려고 센다(`__DEV__`). */
  const 표시본_받은_수 = useRef(0);
  const [표시본_요청, 표시본_요청_두기] = useState<readonly string[]>(NO_IDS);
  /**
   * 이 화면이 받아 둔 표시본(사진 id → 자리). 화면을 닫을 때 웹에서 풀어 준다
   * (2026-09-23 검토 #7).
   */
  const 받은_표시본 = useRef(new Map<string, string>());
  /** 홈 카드에 그대로 얹어 준 표시본. 홈이 쓰고 있으니 풀면 그 칸이 빈다. */
  const 홈에_준_표시본 = useRef(new Set<string>());
  useEffect(() => {
    if (!serverTrip || !표시본_요청.length) return;
    const 받을_것 = (uri: string | undefined, id: string) => !isLivePhotoUri(uri) || isStaleDisplayCopy(uri, id);
    const 지금_사진 = photosRef.current;
    const missing = 표시본_요청
      .map((id) => 지금_사진.find((photo) => photo.id === id))
      .filter((photo): photo is MemoryPhoto =>
        photo !== undefined && 받을_것(photo.uri, photo.id) && knownPhotoIds.has(photo.id)
        && !photoDownloads.current.has(photo.id));
    if (!missing.length) return;
    missing.forEach((photo) => photoDownloads.current.add(photo.id));
    void (async () => {
      for (const photo of missing) {
        try {
          // 표시본을 몇 장 받으러 갔는지 센다. 고치기 전에는 여행을 열기만 해도 남이 올린
          // 사진 수만큼 찍혔다. 지금은 크게 보기로 넘긴 수 언저리여야 한다.
          표시본_받은_수.current += 1;
          if (__DEV__) console.log(`[사진] 표시본 ${표시본_받은_수.current}장째 (${photo.id})`);
          const uri = await downloadPhoto(photo.id);
          if (!uri) continue;
          if (isStaleDisplayCopy(photo.uri, photo.id)) releaseDownloadedPhoto(photo.uri as string);
          받은_표시본.current.set(photo.id, uri);
          setMemories((current) => ({
            ...current,
            photos: current.photos.map((item) => (item.id === photo.id && 받을_것(item.uri, item.id) ? { ...item, uri } : item)),
          }));
        } catch {
          // 연결이 없으면 다음에 같은 사진을 달라고 할 때 다시 받는다.
          photoDownloads.current.delete(photo.id);
        }
      }
    })();
  }, [knownPhotoIds, serverTrip, 표시본_요청]);
  /**
   * 여행 상세를 닫을 때 받아 둔 표시본 blob 을 푼다(2026-09-23 검토 #7, 웹만).
   *
   * 웹은 표시본을 메모리에 blob 으로만 들고 있어서, 여행을 넘나들수록 한 장에 0.5MB 씩
   * 쌓이다 모바일 브라우저가 탭을 되살렸다. 폰의 파일은 그대로 둔다 — 지우면 다음에
   * 열 때 다시 받아야 하고, 데이터만 더 쓴다.
   *
   * 홈 카드가 쓰는 썸네일은 주소가 달라 건드리지 않는다. 다만 대표 사진으로 지정하면서
   * 홈에 그대로 넘긴 표시본은 홈이 그리고 있으니 남긴다.
   */
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const 받은_것 = 받은_표시본.current;
    const 홈_것 = 홈에_준_표시본.current;
    return () => {
      받은_것.forEach((uri, id) => {
        if (!홈_것.has(id)) releaseDownloadedPhoto(uri);
      });
      받은_것.clear();
    };
  }, []);
  /**
   * 홈 대표 사진을 저장한다. 넘긴 사진 자리를 적어 둔다.
   *
   * 홈 카드는 받은 표시본을 그대로 얹어 바로 그린다(`WarmAppShell` 의 `coverPhotoUris`).
   * 위의 뒤처리가 그것까지 풀면 홈 카드가 빈 종이로 돌아간다(2026-09-23 검토 #7).
   */
  const 홈_대표_저장 = useCallback(
    (고른_것: HomeCoverChoice, localUris?: Record<string, string | undefined>) => {
      Object.entries(localUris ?? {}).forEach(([id, uri]) => {
        if (uri) 홈에_준_표시본.current.add(id);
      });
      return onUpdateHomeCover?.(고른_것, localUris) ?? Promise.resolve();
    },
    [onUpdateHomeCover],
  );
  // 영수증은 지출과 따로 올린다. 올라가면 지출에 사진 id 를 붙여 지출 동기화가 서버에 알린다.
  const receiptUploads = useRef(new Set<string>());
  /** 올리다 실패한 영수증. 같은 영수증으로 같은 말을 되풀이하지 않으려고 적어 둔다. */
  const receiptWarned = useRef(new Set<string>());
  useEffect(() => {
    if (!serverTrip || !tripId) return;
    const pending = expenses.filter((item) =>
      item.receiptUri && !item.receiptPhotoId && isServerId(item.id) && !receiptUploads.current.has(`${item.id}:${item.receiptUri}`));
    for (const item of pending) {
      const key = `${item.id}:${item.receiptUri}`;
      const photoId = newPlaceId();
      receiptUploads.current.add(key);
      uploadPhoto(tripId, photoId, item.receiptUri as string, { caption: null, date: null, isReceipt: true })
        .then(() => {
          receiptWarned.current.delete(key);
          setExpenses((current) => current.map((expense) =>
            expense.id === item.id && expense.receiptUri === item.receiptUri
              ? { ...expense, receiptPhotoId: photoId, ...(Platform.OS === "web" ? { receiptUri: undefined } : {}) }
              : expense));
        })
        .catch((caught) => {
          // 지운 열쇠는 다음에 목록이 바뀔 때 다시 올리라는 뜻이다.
          receiptUploads.current.delete(key);
          // 실패해도 아무 말이 없어서 영수증이 안 붙은 줄을 몰랐다(2026-09-23).
          // 한 영수증에 한 번만 알린다.
          if (receiptWarned.current.has(key)) return;
          receiptWarned.current.add(key);
          setFeedback(caught instanceof DaymoApiError && caught.status !== 0
            ? `영수증 업로드 실패. ${caught.message}`
            : "영수증 업로드에 실패했어요. 잠시 후 다시 시도해 주세요");
        });
    }
  }, [expenses, serverTrip, tripId]);
  // 다른 기기에서 붙인 영수증은 받아 둔다.
  const receiptDownloads = useRef(new Set<string>());
  useEffect(() => {
    if (!serverTrip) return;
    const missing = expenses.filter((item) => item.receiptPhotoId && !isLivePhotoUri(item.receiptUri) && !receiptDownloads.current.has(item.receiptPhotoId));
    for (const item of missing) {
      const photoId = item.receiptPhotoId as string;
      receiptDownloads.current.add(photoId);
      downloadPhoto(photoId)
        .then((uri) => {
          if (!uri) return;
          setExpenses((current) => current.map((expense) =>
            expense.receiptPhotoId === photoId && !isLivePhotoUri(expense.receiptUri) ? { ...expense, receiptUri: uri } : expense));
        })
        .catch(() => receiptDownloads.current.delete(photoId));
    }
  }, [expenses, serverTrip]);
  const [expenseSettingsSynced, setExpenseSettingsSynced] = useState(Boolean(initialPlanning?.expenseSettingsSynced));
  const lastSentSettings = useRef<string | null>(
    initialPlanning?.expenseSettingsSynced && serverExpenseSettings ? JSON.stringify(serverExpenseSettings) : null,
  );
  /**
   * 비용 설정 보내기가 실패했을 때 스스로 다시 보내려고 올리는 번호.
   *
   * 실패해도 화면은 이미 새 값이라 서버와 어긋난 채 남는데, 설정을 또 바꿀 때까지
   * 아무 일도 일어나지 않아 다른 기기에는 옛 통화가 계속 보였다(2026-09-23).
   */
  const [settingsRetry, setSettingsRetry] = useState(0);
  const settingsTries = useRef({ key: "", count: 0 });
  const settingsRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // 통화·환율·예산·정산 묶기를 서버에 맞춘다. 처음 연 여행이면 기기 값을 올리고,
    // 그 뒤로는 바꿀 때마다 잠깐 기다렸다가 보낸다.
    // 보기만 하는 멤버는 서버가 받지 않는다. 기기에 남은 옛 값을 올리려다 안내만 뜬다.
    if (!serverTrip || !onUpdateExpenseSettings || !canEdit) return;
    const settings: ExpenseSettings = { currency, exchangeRate, budget, simplifySettlement };
    const key = JSON.stringify(settings);
    if (key === lastSentSettings.current) return;
    const timer = setTimeout(() => {
      onUpdateExpenseSettings(settings)
        .then(() => {
          lastSentSettings.current = key;
          settingsTries.current = { key, count: 0 };
          setExpenseSettingsSynced(true);
        })
        .catch((caught) => {
          const 묶기_거부 = caught instanceof DaymoApiError && caught.code === "SETTLEMENT_IN_PROGRESS";
          // 주고받은 기록이 있으면 묶기를 바꿀 수 없다. 화면을 되돌린다.
          if (묶기_거부) setSimplifySettlement(!simplifySettlement);
          setFeedback(caught instanceof DaymoApiError && caught.status !== 0 ? caught.message : "비용 설정을 아직 저장하지 못했어요");
          // 화면을 되돌린 경우가 아니면 잠깐 뒤 스스로 한 번 더 보낸다. 세 번까지만 하고
          // 그 뒤로는 사용자가 다시 바꿀 때 보낸다. 끝없이 두드리면 연결이 끊긴 동안
          // 같은 안내만 되풀이된다.
          if (묶기_거부) return;
          const 센_것 = settingsTries.current.key === key ? settingsTries.current.count : 0;
          if (센_것 >= 3) return;
          settingsTries.current = { key, count: 센_것 + 1 };
          settingsRetryTimer.current = setTimeout(() => setSettingsRetry((번) => 번 + 1), 4000 * (센_것 + 1));
        });
    }, 800);
    return () => {
      clearTimeout(timer);
      if (settingsRetryTimer.current) clearTimeout(settingsRetryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget, canEdit, currency, exchangeRate, serverTrip, settingsRetry, simplifySettlement]);
  useEffect(() => {
    // 교통편·예약의 "일정에 표시" 줄을 목록에서 다시 만든다. 저장 버튼에서만 만들면
    // 다른 기기에서 받은 교통편·예약은 일정에 보이지 않는다. 대표 숙소 줄과 같은 방식이다.
    const wanted = new Map<string, ScheduleItem>();
    for (const item of transportations) {
      if (item.showInSchedule) wanted.set(`t:${item.id}`, transportScheduleRow(item));
    }
    for (const item of reservations) {
      if (item.showInSchedule) wanted.set(`r:${item.id}`, reservationScheduleRow(item));
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSchedule((current) => {
      let changed = false;
      const seen = new Set<string>();
      const next: ScheduleItem[] = [];
      for (const item of current) {
        const key = item.transportationId ? `t:${item.transportationId}` : item.reservationId ? `r:${item.reservationId}` : null;
        if (!key) {
          next.push(item);
          continue;
        }
        const want = wanted.get(key);
        if (!want || seen.has(key)) {
          changed = true;
          continue;
        }
        seen.add(key);
        if (JSON.stringify(want) !== JSON.stringify(item)) changed = true;
        next.push(want);
      }
      for (const [key, row] of wanted) {
        if (!seen.has(key)) {
          next.push(row);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [reservations, transportations]);
  const onSavePlanningRef = useRef(onSavePlanning);
  useEffect(() => {
    onSavePlanningRef.current = onSavePlanning;
  }, [onSavePlanning]);
  // 상세를 열기만 해도 저장하면 예시 일정과 지출이 그 여행에 박힌다. 여러
  // 여행이 똑같은 예시를 갖게 되고, 저장된 뒤로는 지워지지도 않는다.
  // 첫 실행은 화면을 처음 그린 것뿐이라 넘기고, 그 뒤부터가 진짜 바뀐 것이다.
  const firstPlanningRun = useRef(true);
  // 이미 저장된 계획이 있으면 처음부터 저장 대상으로 본다.
  const planningDirty = useRef(Boolean(initialPlanning));
  useEffect(() => {
    if (firstPlanningRun.current) {
      firstPlanningRun.current = false;
      return;
    }
    planningDirty.current = true;
    onSavePlanningRef.current?.({
      schedule,
      stay: registeredStay,
      places,
      reservations,
      transportations,
      memories,
      packingItems,
      packingDone,
      recipes,
      cookingReadyIngredientIds,
      expenses,
      payments,
      simplifySettlement,
      budget,
      participants,
      currency,
      exchangeRate,
      tripNotes,
      hasKitchen,
      placeSyncIds,
      scheduleSyncIds,
      staySyncIds,
      transportSyncIds,
      reservationSyncIds,
      expenseSyncIds,
      paymentSyncIds,
      packingSyncIds,
      recipeSyncIds,
      memoSyncIds,
      diarySyncIds,
      photoSyncIds,
      personNames,
      expenseSettingsSynced,
    });
  }, [budget, cookingReadyIngredientIds, currency, exchangeRate, expenseSettingsSynced, expenseSyncIds, expenses, hasKitchen, memories, packingDone, packingItems, diarySyncIds, memoSyncIds, packingSyncIds, participants, paymentSyncIds, payments, personNames, photoSyncIds, placeSyncIds, places, recipeSyncIds, recipes, registeredStay, reservationSyncIds, reservations, schedule, scheduleSyncIds, simplifySettlement, staySyncIds, transportSyncIds, transportations, tripNotes]);
  const closeDetail = useCallback(() => {
    // 열어만 보고 닫으면 아무것도 남기지 않는다.
    if (!planningDirty.current) {
      onClose();
      return;
    }
    onSavePlanning?.({
      schedule,
      stay: registeredStay,
      places,
      reservations,
      transportations,
      memories,
      packingItems,
      packingDone,
      recipes,
      cookingReadyIngredientIds,
      expenses,
      payments,
      simplifySettlement,
      budget,
      participants,
      currency,
      exchangeRate,
      tripNotes,
      hasKitchen,
      placeSyncIds,
      scheduleSyncIds,
      staySyncIds,
      transportSyncIds,
      reservationSyncIds,
      expenseSyncIds,
      paymentSyncIds,
      packingSyncIds,
      recipeSyncIds,
      memoSyncIds,
      diarySyncIds,
      photoSyncIds,
      personNames,
      expenseSettingsSynced,
    });
    onClose();
  }, [budget, cookingReadyIngredientIds, currency, exchangeRate, expenseSettingsSynced, expenseSyncIds, expenses, hasKitchen, memories, onClose, onSavePlanning, packingDone, packingItems, diarySyncIds, memoSyncIds, packingSyncIds, participants, paymentSyncIds, payments, personNames, photoSyncIds, placeSyncIds, places, recipeSyncIds, recipes, registeredStay, reservationSyncIds, reservations, schedule, scheduleSyncIds, simplifySettlement, staySyncIds, transportSyncIds, transportations, tripNotes]);

  useEffect(() => {
    // 홈의 바로가기 목적지가 바뀌면 이미 열린 상세 화면의 탭을 맞춘다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(destinationMode(initialDestination));
  }, [initialDestination]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeDetail();
      return true;
    });
    return () => subscription.remove();
  }, [closeDetail]);

  // 웹에서 같은 자리. 이 화면은 열려 있을 때만 그려지므로 늘 켜 둔다.
  // 브라우저 뒤로 가기가 페이지가 아니라 여행 목록으로 돌아가게 한다.
  useWebBackClose(true, closeDetail);

  useEffect(() => {
    if (!feedback) return;
    // 단추가 붙은 알림은 조금 더 둔다. 읽고 손이 가기까지 시간이 든다(기록 탭의 되돌리기와 같다).
    const timer = setTimeout(() => setFeedback(""), 알림_단추 ? 5200 : 2200);
    return () => clearTimeout(timer);
  }, [feedback, 알림_단추]);

  // 여행 수정은 열 때 지금 여행 값으로 칸을 채운다. 그래서 기준선을 따로 들 것 없이
  // 지금 여행과 견주면 된다.
  const tripDraftChanged = editingTrip
    && JSON.stringify([draftTitle, draftStart, draftEnd, draftRegion, draftNote, draftTripPeople])
      !== JSON.stringify([title, currentStart, currentEnd, region, note, participants]);
  const tripDraftValid = Boolean(
    draftTitle.trim()
    && draftRegion.trim()
    && validDateKey(draftStart)
    && validDateKey(draftEnd)
    && draftStart <= draftEnd
    // 아무도 안 가는 여행은 없다. 참가자가 비면 몫을 나눌 기준도 사라진다.
    && draftTripPeople.length,
  );
  /**
   * 탭 이름 옆에 찍는 개수. 들어가 보지 않아도 어디에 뭐가 있는지 알게 한다.
   * 0 이면 아무것도 안 찍는다 — 빈 탭까지 「0」을 달면 줄이 시끄럽다.
   */
  const 탭_개수: Record<ViewMode, number> = {
    여행: schedule.length,
    장소: places.length,
    준비: packingItems.length,
    요리: recipes.length,
    비용: expenses.length,
    기록: memories.photos.length + memories.diaries.length,
  };
  return (
    <DetailThemeContext.Provider value={appTheme}>
      <DetailFeedbackContext.Provider value={알리기}>
      <DetailEditableContext.Provider value={canEdit}>
      <SafeAreaView
        style={[
          styles.safe,
          appTheme && { backgroundColor: appTheme.background },
        ]}
      >
        <View
          style={[
            styles.header,
            appTheme && {
              backgroundColor: appTheme.background,
              borderColor: appTheme.border,
            },
          ]}
        >
          <Pressable
            onPress={closeDetail}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="여행 목록으로 돌아가기"
          >
            <Glyph name="chevronLeft" size={아이콘.크게} color={appTheme?.text ?? "#17233D"} />
          </Pressable>
          <Text
            style={[styles.headerName, appTheme && { color: appTheme.text }]}
          >
            Daymo
          </Text>
          {canEdit ? (
          <Pressable
            onPress={() => {
              setDraftTitle(title);
              setDraftStart(currentStart);
              setDraftEnd(currentEnd);
              setDraftRegion(region);
              setDraftNote(note);
              setTripNoteOpen(Boolean(note.trim()));
              setDraftTripPeople(participants);
              setShowAllEditRegions(false);
              setEditingTrip(true);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="여행 정보 수정"
          >
            <Glyph name="more" size={아이콘.크게} color={appTheme?.text ?? "#17233D"} weight={2.6} />
          </Pressable>
          ) : (
            // 제목이 가운데에 머물도록 버튼 자리만 남긴다.
            <View style={styles.headerSpacer} />
          )}
        </View>
        <SyncNotice theme={appTheme} refreshing={refreshing} onRefresh={() => void refreshLists()} />
        <ScrollView
          ref={detailScrollRef}
          style={{ backgroundColor: "transparent" }}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
          // 탭 줄(두 번째 자식)을 화면에 붙인다. 여행 이름과 메모지가 화면 위쪽
          // 3분의 1을 차지해, 내리지 않으면 탭 내용이 몇 줄밖에 보이지 않았다.
          // 머리를 내려 보내고도 지금 무슨 탭인지는 남아야 해서 붙여 둔다.
          // 자리를 세는 값이라 머리는 조건과 상관없이 하나로 묶어 둔다.
          stickyHeaderIndices={[1]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshLists()} />}
        >
          <View style={styles.detailHead}>
          <Text style={[styles.date, appTheme && { color: appTheme.primary }]}>
            {currentTripDate}
          </Text>
          <View style={styles.detailTitleRow}>
            <Text
              style={[
                styles.title,
                styles.detailTripTitle,
                appTheme && { color: appTheme.text },
              ]}
            >
              {title}
            </Text>
            <Pressable
              onPress={() => setMemoPanel(true)}
              accessibilityRole="button"
              accessibilityLabel={`여행 메모 ${tripNotes.length}개 보기`}
              style={[
                styles.tripMemoButton,
                { backgroundColor: memo.surface, borderColor: memo.border },
              ]}
            >
              <View style={[styles.tripMemoTape, { backgroundColor: memo.tape }]} />
              <Text style={[styles.tripMemoLabel, { color: memo.label }]}>여행 메모</Text>
              <Text numberOfLines={1} style={[styles.tripMemoPreview, { color: memo.text }]}>
                {tripNotes[0]?.body || "함께 볼 메모를 남겨 보세요"}
              </Text>
              <View style={styles.tripMemoBottom}>
                <Text style={[styles.tripMemoButtonText, { color: memo.meta }]}>메모 {tripNotes.length}개</Text>
                <Glyph name="chevronRight" size={아이콘.작게} color={memo.label} />
              </View>
              <View style={[styles.tripMemoFold, { backgroundColor: memo.fold }]} />
            </Pressable>
          </View>
          <Text
            style={[styles.subtitle, appTheme && { color: appTheme.muted }]}
          >
            {region ? `${region} · ` : ""}{tripDuration}{note ? ` · ${note}` : ""}
          </Text>
          {/* 누가 가는지는 여행의 기본 정보다. 비용 탭 안에만 두면 이 여행이
              몇 명짜리인지 알려면 돈 얘기를 열어 봐야 한다. */}
          {participants.length > 1 && (
            <Text numberOfLines={1} style={[styles.subtitle, styles.tripPeopleLine, appTheme && { color: appTheme.muted }]}>
              함께 {participants.join(" · ")}
            </Text>
          )}
          </View>

          <View
            onLayout={(event) => {
              탭줄_높이.current = event.nativeEvent.layout.height;
            }}
            style={[
              styles.modeSwitch,
              styles.modeSwitchPinned,
              appTheme && { backgroundColor: appTheme.background, borderColor: appTheme.border },
            ]}
          >
            {/* 한 겹 더 감싼다. 기기(iOS·안드로이드)에서 화면에 붙는 줄은 리액트
                네이티브가 **바깥 View 의 스타일을 껍데기로 옮기고 이 자리에는
                `flex: 1` 만 남긴다.** 그래서 `flexDirection: "row"` 가 여기서
                사라지고 탭 여섯 개가 세로로 쌓였다. 웹은 그렇게 하지 않아
                브라우저에서는 멀쩡해 보였다. */}
            <View style={styles.modeSwitchRow}>
            {(
              [
                "여행",
                "장소",
                "준비",
                ...(hasKitchen ? ["요리" as ViewMode] : []),
                "비용",
                "기록",
              ] as ViewMode[]
            ).map((item) => (
              <Pressable
                key={item}
                onPress={() => showMode(item)}
                accessibilityRole="tab"
                accessibilityLabel={
                  탭_개수[item] > 0
                    ? `${modeLabelOf(item)} 탭, ${탭_개수[item]}개`
                    : `${modeLabelOf(item)} 탭`
                }
                accessibilityState={{ selected: mode === item }}
                style={[
                  styles.mode,
                  mode === item && styles.modeCurrent,
                  mode === item &&
                    appTheme && {
                      backgroundColor: appTheme.primarySoft,
                      borderColor: appTheme.primary,
                    },
                ]}
              >
                <Text
                  style={[
                    styles.modeText,
                    mode === item && styles.modeTextCurrent,
                    appTheme && {
                      color: mode === item ? appTheme.primary : appTheme.muted,
                    },
                  ]}
                >
                  {modeLabelOf(item)}
                </Text>
                {탭_개수[item] > 0 && (
                  <Text
                    style={[
                      styles.modeCount,
                      appTheme && {
                        color: mode === item ? appTheme.primary : appTheme.muted,
                      },
                    ]}
                  >
                    {탭_개수[item]}
                  </Text>
                )}
              </Pressable>
            ))}
            </View>
          </View>

          {mode === "여행" && (
            <TripOverview
              key={initialDestination}
              setMode={showMode}
              photos={memories.photos}
              schedule={schedule}
              setSchedule={setSchedule}
              places={places}
              setPlaces={setPlaces}
              hasKitchen={hasKitchen}
              registeredStay={registeredStay}
              setRegisteredStay={setRegisteredStay}
              reservations={reservations}
              setReservations={setReservations}
              transportations={transportations}
              setTransportations={setTransportations}
              expenses={expenses}
              setExpenses={setExpenses}
              currency={currency}
              participants={participants}
              recipes={recipes}
              packingRemaining={packingItems.filter((item) => !packingDone.includes(item.id)).length}
              dayOptions={tripDayOptions}
              dateOptions={tripDateOptions}
              todayDay={todayTripDay}
              openScheduleOnMount={canEdit && initialDestination === "schedule-add"}
              onOpenPlaceForReservation={openPlaceForReservation}
            />
          )}
          {mode === "장소" && (
            <Places
              photos={memories.photos}
              schedule={schedule}
              setSchedule={setSchedule}
              places={places}
              setPlaces={setPlaces}
              reservations={reservations}
              setReservations={setReservations}
              sheetRequest={placeSheetRequest}
              onSheetRequestHandled={() => setPlaceSheetRequest(null)}
              registeredStay={registeredStay}
              dayOptions={tripDayOptions}
              dateOptions={tripDateOptions}
              tripEnded={tripEnded}
              visitedAfterTrip={visitedAfterTrip}
              onRegisterStay={(place, times) => {
                // 장소 시트에서 적은 체크인·체크아웃이 있으면 그대로, 카드의 「대표 숙소로
                // 설정」처럼 없으면 첫날 14:00·마지막날 11:00 이다. 이미 대표 숙소인 장소를
                // 다시 저장하는 것이면 서버 id 와 일정 표시 여부는 그대로 두고 값만 고친다.
                setRegisteredStay((current) => {
                  const same = Boolean(current.name) && (current.placeId === place.id || current.name === place.name);
                  return {
                    id: current.id,
                    name: place.name,
                    checkin: times?.checkin ?? `${firstTripDate} ${기본_체크인_시각}`,
                    checkout: times?.checkout ?? `${lastTripDate} 11:00`,
                    address: place.address || place.area,
                    placeId: place.id,
                    showInSchedule: same ? current.showInSchedule ?? true : true,
                  };
                });
              }}
              onRemoveRegisteredStay={() => setRegisteredStay({ name: "", checkin: "", checkout: "", address: "", showInSchedule: false })}
            />
          )}
          {mode === "준비" && (
            <Preparation
              done={packingDone}
              toggle={togglePacking}
              participants={participants}
              items={packingItems}
              setItems={setPackingItems}
              recipes={recipes}
              readyIngredientIds={cookingReadyIngredientIds}
              onMarkIngredientReady={(id) =>
                setCookingReadyIngredientIds((current) => current.includes(id) ? current : [...current, id])}
              openCookingPickerOnMount={openCookingPicker}
              onCookingPickerOpened={() => setOpenCookingPicker(false)}
              spaceId={spaceId}
              tripId={tripId}
              roster={spaceRoster}
            />
          )}
          {mode === "요리" && (
            <Cooking
              recipes={recipes}
              setRecipes={setRecipes}
              readyIngredientIds={cookingReadyIngredientIds}
              setReadyIngredientIds={setCookingReadyIngredientIds}
              currency={currency}
              participants={participants}
              spaceId={spaceId}
              tripId={tripId}
              roster={spaceRoster}
              onRecordShopping={(title, amount) => {
                setExpenses((current) => [
                  ...current,
                  {
                    id: newPlaceId(),
                    day: todayTripDay || tripDayOptions[0] || "",
                    title,
                    amount,
                    category: "식비",
                    payer: participants[0] ?? "하늘",
                    memo: "요리 재료",
                  },
                ]);
                setMode("비용");
              }}
              openPreparationImport={() => {
                setOpenCookingPicker(true);
                showMode("준비");
              }}
            />
          )}
          {mode === "비용" && (
            <Money
              addRef={지출_추가_열기}
              scrollToY={자리로_내리기}
              tripName={title}
              dayOptions={tripDayOptions}
              todayDay={todayTripDay}
              expenses={expenses}
              setExpenses={setExpenses}
              budget={budget}
              setBudget={setBudget}
              me={me}
              payments={payments}
              setPayments={setPayments}
              simplify={simplifySettlement}
              setSimplify={setSimplifySettlement}
              assignedSummary={assignedSummary}
              participants={participants}
              saveParticipants={saveParticipants}
              spaceMembers={spaceMembers}
              currency={currency}
              setCurrency={setCurrency}
              exchangeRate={exchangeRate}
              setExchangeRate={setExchangeRate}
            />
          )}
          {mode === "기록" && (
            <Memories
              tripName={title}
              tripDate={currentTripDate}
              tripRegion={region}
              tripDateKeys={tripDateKeyList}
              dayOptions={tripDayOptions}
              todayDay={todayTripDay}
              memories={memories}
              setMemories={setMemories}
              places={places}
              schedule={schedule}
              stay={registeredStay}
              participants={participants}
              spentTotal={money(spentTotal(expenses), currency)}
              cardTripId={serverTrip ? tripId : undefined}
              coverPhotoId={coverPhotoId}
              coverFocus={coverFocus}
              onSaveHomeCover={onUpdateHomeCover ? 홈_대표_저장 : undefined}
              onNeedDisplayPhotos={표시본_요청_두기}
              uploadedPhotoIds={knownPhotoIds}
              reportSpaceId={reportSpaceId}
              isOwner={isOwner}
              myMembershipId={myMembershipId}
              scrollToY={자리로_내리기}
              onPhotosRestored={(ids) => {
                // 휴지통 시트의 되돌리기와 같다. 지울 때 기기 파일도 사라져 다시 받게 한다.
                ids.forEach((id) => photoDownloads.current.delete(id));
                setTrashReload((current) => ({ ...current, photo: current.photo + 1 }));
              }}
              trash={serverTrip && tripId && canEditRecords ? 휴지통() : undefined}
            />
          )}
        </ScrollView>
        {/* 비용 탭에서만 떠 있는 ＋ 단추. 목록을 한참 내려간 자리에서도 한 번에
            닿는다. 가계부 앱들이 쓰는 자리다. */}
        {mode === "비용" && canEdit && (
          <Pressable
            onPress={() => 지출_추가_열기.current?.()}
            accessibilityRole="button"
            accessibilityLabel="지출 추가"
            style={({ pressed }) => [
              styles.moneyFab,
              { bottom: Math.max(38, 아래_여백 + 12) },
              appTheme && { backgroundColor: appTheme.primary },
              pressed && styles.moneyFabPressed,
            ]}
          >
            <Glyph name="plus" size={아이콘.보통} color={onAccent(appTheme?.dark ?? false)} weight={2.8} />
            <Text style={[styles.moneyFabText, { color: onAccent(appTheme?.dark ?? false) }]}>지출 추가</Text>
          </Pressable>
        )}
        <DetailSheet
          visible={memoPanel}
          title="여행 메모"
          subtitle="함께 볼 메모를 남겨 보세요"
          submit={memoEditorOpen ? (editingMemoId ? "저장" : "메모 추가") : "닫기"}
          submitDisabled={memoEditorOpen && !memoDraft.trim()}
          disabledHint={memoEditorOpen && !memoDraft.trim() ? "메모 내용을 입력해 주세요" : undefined}
          hasUnsavedChanges={memoDraftChanged}
          onClose={() => {
            setMemoPanel(false);
            setMemoEditorOpen(false);
            setEditingMemoId(null);
            setReportingMemoId(null);
            setMemoDraft("");
          }}
          onSubmit={() => {
            if (!memoEditorOpen) {
              setMemoPanel(false);
              return;
            }
            const body = memoDraft.trim();
            if (!body) return;
            if (editingMemoId) {
              // 남이 쓴 메모를 고쳐도 작성자는 그대로다. 시각만 방금으로 바꿔 보인다.
              setTripNotes((current) => current.map((note) =>
                note.id === editingMemoId ? { ...note, body, author: `${note.author.split(" · ")[0]} · 방금 수정` } : note,
              ));
              setFeedback("여행 메모를 수정했어요");
            } else {
              setTripNotes((current) => [
                { id: newPlaceId(), author: `${me} · 방금`, body },
                ...current,
              ]);
              setFeedback("여행 메모를 추가했어요");
            }
            setMemoDraft("");
            setEditingMemoId(null);
            setMemoEditorOpen(false);
          }}
        >
          {canEdit && !memoEditorOpen && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMemoDraft("");
                setEditingMemoId(null);
                setMemoEditorOpen(true);
              }}
              style={({ pressed }) => [
                styles.memoAddButton,
                appTheme && { backgroundColor: appTheme.primarySoft, borderColor: `${appTheme.primary}55` },
                pressed && 공용스타일.controlPressed,
              ]}
            >
              <View style={styles.memoAddPlus}>
                <Glyph name="plus" size={아이콘.크게} color={appTheme?.primary ?? "#3F4C8F"} weight={2.2} />
              </View>
              <View style={styles.memoAddCopy}>
                <Text style={[styles.memoAddTitle, appTheme && { color: appTheme.text }]}>새 메모 추가</Text>
                <Text style={[styles.memoAddHint, appTheme && { color: appTheme.muted }]}>함께 볼 메모를 남겨 보세요</Text>
              </View>
            </Pressable>
          )}
          {memoEditorOpen && (
            <View style={[styles.memoEditor, appTheme && { backgroundColor: appTheme.surface, borderColor: appTheme.border }]}>
              <View style={styles.memoEditorHead}>
                <Text style={[styles.memoEditorTitle, appTheme && { color: appTheme.text }]}>
                  {editingMemoId ? "메모 수정" : "새 메모"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={글자누름여유}
                  onPress={() => {
                    setMemoDraft("");
                    setEditingMemoId(null);
                    setMemoEditorOpen(false);
                  }}
                >
                  <Text style={[styles.memoEditorCancel, appTheme && { color: appTheme.muted }]}>취소</Text>
                </Pressable>
              </View>
              <DetailField
                label="메모 내용"
                required
                value={memoDraft}
                onChangeText={setMemoDraft}
                placeholder="예: 체크인 전에 장보기"
                multiline
              />
            </View>
          )}
          <View style={[styles.tripMemoList, appTheme && { backgroundColor: appTheme.surface }]}>
            {tripNotes.length === 0 && (
              <View style={styles.memoEmpty}>
                <Text style={[styles.memoEmptyTitle, appTheme && { color: appTheme.text }]}>아직 메모가 없어요</Text>
                <Text style={[styles.memoEmptyHint, appTheme && { color: appTheme.muted }]}>새 메모를 추가하면 함께 볼 수 있어요.</Text>
              </View>
            )}
            {tripNotes.map((note) => (
              <View
                key={note.id}
                style={[
                  styles.tripMemoRow,
                  { backgroundColor: memo.surface, borderColor: memo.border },
                ]}
              >
                <View style={styles.tripMemoRowHead}>
                  <Text style={[styles.tripMemoAuthor, { color: memo.meta }]}>{note.author}</Text>
                  <View style={styles.tripMemoActions}>
                    {/* 남이 쓴 메모에만 둔다. 보기만 하는 멤버도 신고는 한다. 작성자 줄의 앞부분이 이름이다. */}
                    {reportSpaceId && isServerId(note.id) && note.author.split(" · ")[0] !== me && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="이 메모 신고"
                        style={styles.tripMemoAction}
                        onPress={() => setReportingMemoId((current) => current === note.id ? null : note.id)}
                      >
                        <Text style={[styles.tripMemoEdit, { color: memo.meta }]}>신고</Text>
                      </Pressable>
                    )}
                    {canEdit && (
                    <>
                    <Pressable
                      style={styles.tripMemoAction}
                      accessibilityRole="button" onPress={() => {
                      setEditingMemoId(note.id);
                      setMemoDraft(note.body);
                      setMemoEditorOpen(true);
                    }}>
                      <Text style={[styles.tripMemoEdit, { color: memo.meta }]}>수정</Text>
                    </Pressable>
                    <Pressable
                      style={styles.tripMemoAction}
                      accessibilityRole="button" onPress={() => showAlert(
                      "메모를 삭제할까요?",
                      note.body,
                      [
                        { text: "취소", style: "cancel" },
                        { text: "삭제", style: "destructive", onPress: () => {
                          setTripNotes((current) => current.filter((item) => item.id !== note.id));
                          if (editingMemoId === note.id) {
                            setMemoDraft("");
                            setEditingMemoId(null);
                            setMemoEditorOpen(false);
                          }
                          setFeedback("여행 메모를 삭제했어요");
                        } },
                      ],
                    )}>
                      <Text style={[styles.tripMemoDelete, { color: appTheme?.dark ? statusColor.danger.dark : statusColor.danger.light }]}>삭제</Text>
                    </Pressable>
                    </>
                    )}
                  </View>
                </View>
                <Text style={[styles.tripMemoBody, { color: memo.text }]}>{note.body}</Text>
                {reportSpaceId && reportingMemoId === note.id && (
                  <ReportForm
                    spaceId={reportSpaceId}
                    targetType="memo"
                    targetId={note.id}
                    onClose={() => setReportingMemoId(null)}
                  />
                )}
              </View>
            ))}
          </View>
          {serverTrip && tripId && canEditRecords && !memoEditorOpen && 휴지통()}
        </DetailSheet>
        <DetailSheet
          visible={editingTrip}
          title="여행 수정"
          subtitle="여행지·기간·함께 가는 사람을 바꿀 수 있어요"
          submit="저장"
          disabledHint={
            !tripDraftValid
              ? (draftTripPeople.length ? "제목·여행지·기간을 확인해 주세요" : "함께 가는 사람을 한 명은 골라 주세요")
              : undefined
          }
          submitDisabled={!tripDraftValid}
          hasUnsavedChanges={tripDraftChanged}
          destructiveLabel={onDeleteTrip ? "여행 삭제" : undefined}
          destructiveMessage="일정·비용·기록까지 이 여행의 모든 내용이 멤버 모두에게서 사라져요. 7일 안에는 여행 목록의 ‘휴지통’에서 되돌릴 수 있어요."
          onDestructive={() => {
            onDeleteTrip?.().catch((caught) => setFeedback(saveErrorMessage(caught)));
          }}
          onClose={() => setEditingTrip(false)}
          onSubmit={async () => {
            if (!tripDraftValid) return;
            const nextTitle = draftTitle.trim();
            const nextRegion = draftRegion.trim();
            const nextNote = draftNote.trim();
            const oldDays = tripDayOptions;
            const nextDates = buildTripDates(draftStart, draftEnd);
            const nextDays = nextDates.map(dateKey);
            try {
              await onUpdateTrip?.({
                name: nextTitle,
                date: formatTripPeriod(draftStart, draftEnd),
                start: draftStart,
                end: draftEnd,
                region: nextRegion,
                note: nextNote,
                participants: draftTripPeople,
              });
            } catch (caught) {
              if (showLatestTrip(caught)) {
                setEditingTrip(false);
                return;
              }
              setFeedback(saveErrorMessage(caught));
              return;
            }
            setSchedule((current) => current.map((item) => {
              const oldIndex = item.date ? oldDays.indexOf(item.date) : -1;
              if (oldIndex < 0 || !nextDays.length) return item;
              const date = nextDays[Math.min(oldIndex, nextDays.length - 1)];
              return { ...item, date, time: `${weekdayOfKey(date)}${item.time.includes(" · ") ? ` · ${item.time.split(" · ").slice(1).join(" · ")}` : ""}` };
            }));
            setReservations((current) => current.map((reservation) => {
              if (!nextDays.length) return reservation;
              const oldIndex = oldDays.indexOf(reservation.date);
              if (oldIndex < 0) return reservation;
              return { ...reservation, date: nextDays[Math.min(oldIndex, nextDays.length - 1)] };
            }));
            setTransportations((current) => current.map((item) => {
              if (!nextDays.length) return item;
              const oldIndex = oldDays.indexOf(item.date);
              if (oldIndex < 0) return item;
              return { ...item, date: nextDays[Math.min(oldIndex, nextDays.length - 1)] };
            }));
            // 지출과 사진도 같은 규칙으로 옮긴다. 2026-09-23 까지는 지출을 비용 탭 안
            // effect 가 옮겨서, 탭을 열지 않으면 옛 이름표 그대로 맞추기가 돌아 서버의
            // 날짜가 지워졌다. 사진은 옮기는 코드가 아예 없었다. 두 번 밀리지 않게
            // 옮기는 자리는 여기 한 곳뿐이다.
            const 옮긴_날 = (day: string) => {
              const oldIndex = oldDays.indexOf(day);
              return oldIndex < 0 || !nextDays.length ? day : nextDays[Math.min(oldIndex, nextDays.length - 1)];
            };
            setExpenses((current) => current.map((item) => {
              const day = 옮긴_날(item.day);
              return day === item.day ? item : { ...item, day };
            }));
            setMemories((current) => ({
              ...current,
              photos: current.photos.map((photo) => {
                const date = 옮긴_날(photo.date);
                return date === photo.date ? photo : { ...photo, date };
              }),
            }));
            setTitle(nextTitle);
            setParticipants(draftTripPeople);
            setCurrentStart(draftStart);
            setCurrentEnd(draftEnd);
            setRegion(nextRegion);
            setNote(nextNote);
            setRegisteredStay((current) => ({
              ...current,
              checkin: current.checkin ? `${dateLabel(nextDates[0])} ${current.checkin.split(" ").at(-1)}` : "",
              checkout: current.checkout ? `${dateLabel(nextDates[nextDates.length - 1])} ${current.checkout.split(" ").at(-1)}` : "",
            }));
            if (!hasKitchen && mode === "요리") showMode("여행");
            setEditingTrip(false);
            setFeedback("여행 정보를 저장했어요");
          }}
        >
          <DetailField
            label="여행지"
            required
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="예: 제주 애월"
          />
          {appTheme && (
            <TripRegionPicker
              theme={appTheme}
              value={draftRegion}
              onChange={setDraftRegion}
              expanded={showAllEditRegions}
              setExpanded={setShowAllEditRegions}
            />
          )}
          <View style={[styles.tripEditSection, appTheme && { borderTopColor: appTheme.border }]}>
            <Text style={[styles.tripEditSectionTitle, appTheme && { color: appTheme.text }]}>언제 떠나나요?</Text>
            <Text style={[styles.tripEditSectionHint, appTheme && { color: appTheme.muted }]}>시작일을 고른 다음 마지막 날을 골라 주세요.</Text>
            {appTheme && (
              <TripDateRangePicker
                key={`${editingTrip}-${currentStart}-${currentEnd}`}
                theme={appTheme}
                start={draftStart}
                end={draftEnd}
                setStart={setDraftStart}
                setEnd={setDraftEnd}
              />
            )}
          </View>
          <OptionalFormSection
            label="한 줄 메모"
            summary={draftNote.trim() || undefined}
            open={tripNoteOpen}
            onToggle={() => setTripNoteOpen((current) => !current)}
          >
            <DetailField
              label="한 줄 메모 (선택)"
              value={draftNote}
              onChangeText={setDraftNote}
              placeholder="예: 골목을 천천히 걷는 여행"
              maxLength={2000}
            />
          </OptionalFormSection>
          {appTheme && spaceMembers.length > 1 && (
            <View style={[styles.tripEditSection, appTheme && { borderTopColor: appTheme.border }]}>
              <Text style={[styles.tripEditSectionTitle, appTheme && { color: appTheme.text }]}>누가 함께 가나요?</Text>
              <Text style={[styles.tripEditSectionHint, appTheme && { color: appTheme.muted }]}>
                이번 여행에 가는 사람만 골라 주세요. 정산과 준비물 담당에 쓰여요.
              </Text>
              <ParticipantPicker
                theme={appTheme}
                members={spaceMembers}
                value={draftTripPeople}
                onChange={setDraftTripPeople}
                noteFor={assignedSummary}
              />
            </View>
          )}
          <View style={[styles.tripEditSection, appTheme && { borderTopColor: appTheme.border }]}>
            <Text style={[styles.tripEditSectionTitle, appTheme && { color: appTheme.text }]}>요리 탭</Text>
            <Text style={[styles.tripEditSectionHint, appTheme && { color: appTheme.muted }]}>숙소에 주방이 있으면 켜 주세요.</Text>
          <OptionField
            label="숙소에 주방이 있나요?"
            options={["있어요", "없어요"]}
            value={hasKitchen ? "있어요" : "없어요"}
            onChange={(value) => setHasKitchen(value === "있어요")}
          />
          <Text style={[공용스타일.settingHint, appTheme && { color: appTheme.muted }]}>
            주방이 있을 때만 요리 탭을 표시해요. 언제든 다시 켜거나 숨길 수
            있어요.
          </Text>
          </View>
          {onArchiveTrip && (
            <View style={[styles.tripEditSection, appTheme && { borderTopColor: appTheme.border }]}>
              <Text style={[styles.tripEditSectionTitle, appTheme && { color: appTheme.text }]}>보관</Text>
              <Text style={[styles.tripEditSectionHint, appTheme && { color: appTheme.muted }]}>
                {archived
                  ? "보관한 여행이에요. 여행 목록의 ‘보관’에만 보여요."
                  : "끝난 여행을 보관함으로 옮겨요. 기록은 그대로예요."}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onArchiveTrip(!archived)
                    .then(() => {
                      setEditingTrip(false);
                      setFeedback(archived ? "보관을 해제했어요" : "여행을 보관했어요");
                    })
                    .catch((caught) => setFeedback(saveErrorMessage(caught)));
                }}
                style={[styles.tripArchiveButton, appTheme && { borderColor: appTheme.border }]}
              >
                <Text style={[styles.tripEditSectionTitle, appTheme && { color: appTheme.text }]}>
                  {archived ? "보관 해제" : "보관하기"}
                </Text>
              </Pressable>
            </View>
          )}
        </DetailSheet>
        {!!feedback && (
          <Toast
            theme={appTheme}
            style={styles.feedbackToast}
            text={feedback}
            action={알림_단추?.label}
            onAction={알림_단추 ? () => { 알림_단추.onPress(); setFeedback(""); } : undefined}
          />
        )}
      </SafeAreaView>
      </DetailEditableContext.Provider>
      </DetailFeedbackContext.Provider>
    </DetailThemeContext.Provider>
  );
}


function Cooking({
  recipes,
  setRecipes,
  readyIngredientIds,
  setReadyIngredientIds,
  openPreparationImport,
  onRecordShopping,
  currency,
  participants,
  spaceId,
  tripId,
  roster,
}: {
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  readyIngredientIds: string[];
  setReadyIngredientIds: React.Dispatch<React.SetStateAction<string[]>>;
  openPreparationImport: () => void;
  /** 장 본 금액을 비용 탭에 적는다. 부르면 지출 한 건이 생긴다. */
  onRecordShopping: (title: string, amount: number) => void;
  currency: string;
  /** 이번 여행에 가는 사람. 재료를 누가 챙기는지도 이 목록에서 고른다. */
  participants: string[];
  /** 지난 여행에서 가져오기에 쓴다. 서버에 올라간 여행일 때만 온다. */
  spaceId?: string;
  tripId?: string;
  roster: RosterEntry[];
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const canEdit = useContext(DetailEditableContext);
  const [activeId, setActiveId] = useState("mille");
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<CookingItem | null>(null);
  const [editingRecipe, setEditingRecipe] = useState(false);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [showMyIngredients, setShowMyIngredients] = useState(false);
  // 장을 보고 나면 그 금액을 비용 탭에 또 손으로 옮겨 적게 된다. 목록을 보는
  // 자리에서 바로 적을 수 있게 한다.
  const [shoppingCost, setShoppingCost] = useState("");
  const [ingredientOwnerFilter, setIngredientOwnerFilter] = useState("전체");
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [importing, setImporting] = useState(false);
  // 교체는 저장해 둔 것을 통째로 지운다. 되돌릴 수 없으니 기본은 추가로 둔다.
  const [importMode, setImportMode] = useState<"교체" | "추가">("추가");
  const [importText, setImportText] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [group, setGroup] = useState("기본");
  const [owner, setOwner] = useState(COOKING_UNASSIGNED);
  const [recipeName, setRecipeName] = useState("");
  const [recipeNote, setRecipeNote] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  // 재료·요리 시트의 「더 적기」가 펼쳐져 있는지. 고칠 때 값이 있으면 켜서 연다.
  const [ingredientGroupOpen, setIngredientGroupOpen] = useState(false);
  const [recipeExtrasOpen, setRecipeExtrasOpen] = useState(false);
  // 「요리 추가」 시트 안에서 내용을 갈아 끼우는 단계. iOS 는 창 위에 창을 못 쌓아서
  // 지난 여행 목록을 새 창이 아니라 이 시트 안에 보인다.
  const [recipeSheetStep, setRecipeSheetStep] = useState<"직접" | "지난 여행">("직접");
  const pastRecipes = usePastRecipes({
    spaceId,
    tripId,
    roster,
    active: addingRecipe && recipeSheetStep === "지난 여행",
    existingNames: recipes.map((recipe) => recipe.name),
  });
  const ingredientDraftChanged = useDraftChanged(addingIngredient, JSON.stringify([name, quantity, group, owner]));
  const recipeDraftChanged = useDraftChanged(addingRecipe, JSON.stringify([recipeName, recipeNote, recipeUrl]));
  const aiDraftChanged = useDraftChanged(aiImporting, aiResult);
  const cookingImportChanged = useDraftChanged(importing, JSON.stringify([importText, importMode]));
  const [collapsedCookingGroups, setCollapsedCookingGroups] = useState<string[]>(() =>
    collapsedGroupsFor(recipes.find((recipe) => recipe.id === "mille") ?? recipes[0]),
  );
  const activeRecipe =
    recipes.find((recipe) => recipe.id === activeId) || recipes[0];
  const menuRecipes = recipes.length > 4 && activeRecipe
    ? [activeRecipe, ...recipes.filter((recipe) => recipe.id !== activeRecipe.id)].slice(0, 4)
    : recipes;
  const ingredients = activeRecipe?.ingredients || [];
  const readyIngredientCount = ingredients.filter((item) =>
    readyIngredientIds.includes(item.id),
  ).length;
  const ingredientProgress = ingredients.length
    ? Math.round((readyIngredientCount / ingredients.length) * 100)
    : 0;
  const groups = Array.from(new Set(ingredients.map((item) => item.group)));
  const selectRecipe = (id: string) => {
    setCollapsedCookingGroups(collapsedGroupsFor(recipes.find((recipe) => recipe.id === id)));
    setActiveId(id);
  };
  const allCookingIngredients = recipes.flatMap((recipe) =>
    recipe.ingredients.map((item) => ({ ...item, recipeId: recipe.id, recipe: recipe.name })),
  );
  // 목록에 이미 적힌 담당 가운데 참가자에서 빠진 이름도 거를 수 있게 남긴다.
  // 여행 도중 참가자가 바뀌어도 예전에 적어 둔 재료가 안 보이면 곤란하다.
  const shoppingOwnerOptions = useMemo(() => {
    const known = cookingOwnerOptions(participants);
    const extra = Array.from(new Set(allCookingIngredients.map((item) => item.owner)))
      .filter((owner) => owner && !known.includes(owner));
    return ["전체", ...known, ...extra];
  }, [allCookingIngredients, participants]);
  const filteredShoppingCount = ingredientOwnerFilter === "전체"
    ? allCookingIngredients.length
    : allCookingIngredients.filter((item) => item.owner === ingredientOwnerFilter).length;
  const duplicateIngredient = Boolean(activeRecipe) && activeRecipe.ingredients.some(
    (item) => item.id !== editingIngredient?.id && item.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const ingredientFormValid = Boolean(name.trim()) && !duplicateIngredient;
  const duplicateRecipe = recipes.some(
    (recipe) => recipe.id !== (editingRecipe ? activeRecipe?.id : undefined) && recipe.name.trim().toLowerCase() === recipeName.trim().toLowerCase(),
  );
  const recipeUrlValid = !recipeUrl.trim() || /^(https?:\/\/)?[^\s]+\.[^\s]+/i.test(recipeUrl.trim());
  const recipeFormValid = Boolean(recipeName.trim()) && !duplicateRecipe && recipeUrlValid;
  const cookingPrompt = `아래 메모를 Daymo 요리 목록 형식으로 변환하라.
규칙:
1. 설명, 인사, 번호, 마크다운을 절대 쓰지 않는다.
2. 각 요리의 첫 줄은 반드시: 요리 | 이름 | 메모 | 참고 링크
3. 이어지는 재료는 반드시: 재료 | 이름 | 수량 | 분류 | 준비
4. 준비 값은 ${cookingOwnerOptions(participants).join(", ")} 중 하나만 쓴다.
5. 참고 링크는 메모에 URL이 있을 때만 쓰고, 없으면 비워둔다.
6. 모르는 값은 미정으로 쓰고, 구분자는 반드시 | 만 사용한다.
7. 결과만 출력한다.

[내 메모]
여기에 만들 요리와 재료 메모를 붙여넣어 주세요.`;
  const addIngredient = () => {
    if (!ingredientFormValid || !activeRecipe) return;
    const wasEditing = Boolean(editingIngredient);
    const next = {
      id: newPlaceId(),
      name: name.trim(),
      quantity: quantity.trim(),
      group,
      owner,
    };
    setRecipes((current) =>
      current.map((recipe) => {
        if (recipe.id !== activeRecipe.id) return recipe;
        return {
          ...recipe,
          ingredients: editingIngredient
            ? recipe.ingredients.map((item) =>
                item.id === editingIngredient.id ? { ...next, id: item.id } : item,
              )
            : [...recipe.ingredients, next],
        };
      }),
    );
    setName("");
    setQuantity("");
    setGroup("기본");
    setOwner(COOKING_UNASSIGNED);
    setEditingIngredient(null);
    setAddingIngredient(false);
    notify(wasEditing ? "재료를 수정했어요" : "재료를 추가했어요");
  };
  const openIngredientEdit = (item: CookingItem) => {
    setEditingIngredient(item);
    setName(item.name);
    setQuantity(item.quantity);
    setGroup(item.group);
    setOwner(item.owner);
    setIngredientGroupOpen(Boolean(item.group.trim()) && item.group !== "기본");
    setAddingIngredient(true);
  };
  const closeIngredientSheet = () => {
    setAddingIngredient(false);
    setEditingIngredient(null);
    setName("");
    setQuantity("");
    setGroup("기본");
    setOwner(COOKING_UNASSIGNED);
    setIngredientGroupOpen(false);
  };
  const addRecipe = () => {
    if (!recipeFormValid) return;
    if (editingRecipe && activeRecipe) {
      setRecipes((current) =>
        current.map((recipe) =>
          recipe.id === activeRecipe.id
            ? {
                ...recipe,
                name: recipeName.trim(),
                note: recipeNote.trim(),
                url: recipeUrl.trim(),
              }
            : recipe,
        ),
      );
      setRecipeName("");
      setRecipeNote("");
      setRecipeUrl("");
      setEditingRecipe(false);
      setAddingRecipe(false);
      notify("요리 정보를 수정했어요");
      return;
    }
    const id = newPlaceId();
    setRecipes((current) => [
      ...current,
      {
        id,
        name: recipeName.trim(),
        note: recipeNote.trim(),
        url: recipeUrl.trim(),
        ingredients: [],
      },
    ]);
    setCollapsedCookingGroups([]);
    setActiveId(id);
    setRecipeName("");
    setRecipeNote("");
    setRecipeUrl("");
    setAddingRecipe(false);
    notify("요리를 추가했어요");
  };
  // 요리 카드의 ... 도 여기로 온다. 전에는 경고창을 띄워 수정과 삭제를 고르게
  // 했는데, 경고창은 되돌릴 수 없는 일에 쓰는 것이라 수정하러 갈 때마다 한 번씩
  // 긴장하게 됐다. 다른 탭처럼 바로 수정 창을 열고 삭제는 그 창 아래에 둔다.
  const openRecipeEdit = () => {
    if (!activeRecipe) return;
    setRecipeName(activeRecipe.name);
    setRecipeNote(요리메모_읽기(activeRecipe.note));
    setRecipeUrl(activeRecipe.url || "");
    setRecipeExtrasOpen(Boolean(요리메모_읽기(activeRecipe.note) || activeRecipe.url));
    setEditingRecipe(true);
    setAddingRecipe(true);
  };
  const closeRecipeSheet = () => {
    setAddingRecipe(false);
    setEditingRecipe(false);
    setRecipeSheetStep("직접");
    setRecipeName("");
    setRecipeNote("");
    setRecipeUrl("");
    setRecipeExtrasOpen(false);
  };
  // 지난 여행의 요리 하나를 재료까지 그대로 복사한다. 재료의 준비 완료는 목록 밖에
  // 있어 저절로 풀리고, 담당은 이번 여행 참가자만 남는다(`planRecipeImport`).
  const takePastRecipe = (row: RecipeRow) => {
    const plan = planRecipeImport([row], recipes.map((recipe) => recipe.name), participants, newPlaceId);
    const taken = plan.taken[0];
    if (!taken) {
      notify(importMessage("요리", plan));
      return;
    }
    setRecipes((current) => [...current, taken]);
    setCollapsedCookingGroups([]);
    setActiveId(taken.id);
    closeRecipeSheet();
    notify(`${taken.name}${josa(taken.name, "을", "를")} 재료 ${taken.ingredients.length}개와 함께 가져왔어요`);
  };
  // 넣기 전에 몇 개가 읽혔는지 센다. 붙여넣고 나서 무엇이 들어갈지 모른 채
  // 버튼을 누르던 것이 이 흐름에서 가장 불안한 대목이었다.
  const aiParsed: Recipe[] = useMemo(() => parseAiRecipes(aiResult, () => ""), [aiResult]);
  const aiIngredientCount = aiParsed.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
  const copyCookingPrompt = async () => {
    await Clipboard.setStringAsync(cookingPrompt);
    notify("프롬프트를 복사했어요");
  };
  // 복사한 뒤 브라우저까지 열어 준다. 앱을 나갔다 오는 건 그대로지만 사용자가
  // 직접 찾아 들어가는 한 단계가 줄고, 무엇을 하러 나가는지도 분명해진다.
  const copyPromptAndOpenGpt = async () => {
    // 브라우저는 누른 직후에만 복사도 새 창도 허락한다. 둘 다 기다리지 말고 곧장 부른다.
    // 아이폰 웹에서는 await 뒤의 복사가 조용히 실패해 「복사했어요」가 거짓말이 됐다.
    const copying = Clipboard.setStringAsync(cookingPrompt).then(
      () => true,
      () => false,
    );
    const opening = Linking.openURL("https://chatgpt.com/").then(
      () => true,
      () => false,
    );
    const [copied, opened] = await Promise.all([copying, opening]);
    if (!copied) {
      notify("복사하지 못했어요. 아래 프롬프트를 길게 눌러 복사해 주세요");
      return;
    }
    notify(opened ? "프롬프트를 복사했어요. 붙여넣고 결과를 다시 가져와 주세요" : "프롬프트를 복사했어요. ChatGPT 를 열어 붙여넣어 주세요");
  };
  const pasteAiResult = async () => {
    // 아이폰 웹은 붙여넣기 읽기를 허락하지 않을 때가 많다. 그때 아무 일도 없으면 고장으로
    // 보이니, 손으로 붙여넣을 칸으로 안내한다.
    const text = await readClipboard();
    if (!text.trim()) {
      notify("붙여넣기가 막혀 있어요. 아래 「붙여넣은 결과」 칸을 길게 눌러 붙여넣어 주세요");
      return;
    }
    setAiResult(text);
  };
  const importAiRecipes = () => {
    const parsed = parseAiRecipes(aiResult, newPlaceId);
    if (!parsed.length) {
      notify("요리 줄을 못 찾았어요. 형식이 맞는지 봐 주세요");
      return;
    }
    const existingRecipeNames = new Set(recipes.map((recipe) => recipe.name.trim().toLowerCase()));
    const uniqueParsed = parsed
      .filter((recipe, index, values) =>
        !existingRecipeNames.has(recipe.name.trim().toLowerCase()) &&
        values.findIndex((value) => value.name.trim().toLowerCase() === recipe.name.trim().toLowerCase()) === index,
      )
      .map((recipe) => ({
        ...recipe,
        ingredients: recipe.ingredients.filter((item, index, values) =>
          values.findIndex((value) => value.name.trim().toLowerCase() === item.name.trim().toLowerCase()) === index,
        ),
      }));
    if (!uniqueParsed.length) {
      notify("이미 추가한 요리뿐이에요");
      return;
    }
    setRecipes((current) => [...current, ...uniqueParsed]);
    setCollapsedCookingGroups(Array.from(new Set(uniqueParsed[0].ingredients.map((item) => item.group))));
    setActiveId(uniqueParsed[0].id);
    setAiResult("");
    setAiImporting(false);
    notify(`요리 ${uniqueParsed.length}개를 추가했어요`);
  };
  const deleteRecipe = () => {
    if (!activeRecipe) return;
    const 자리 = recipes.findIndex((recipe) => recipe.id === activeRecipe.id);
    const target = activeRecipe;
    const remaining = recipes.filter((recipe) => recipe.id !== activeRecipe.id);
    setRecipes(remaining);
    setCollapsedCookingGroups(Array.from(new Set(remaining[0]?.ingredients.map((item) => item.group) ?? [])));
    setActiveId(remaining[0]?.id || "");
    closeRecipeSheet();
    // 재료까지 한꺼번에 사라지는 삭제라 되돌릴 길이 가장 필요하다.
    notify("요리와 재료 목록을 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        setRecipes((current) => 자리에_넣기(current, target, 자리));
        setActiveId(target.id);
        setCollapsedCookingGroups(collapsedGroupsFor(target));
        notify("요리를 되돌렸어요");
      },
    });
  };
  const openRecipeLink = () => {
    if (!activeRecipe?.url) return;
    const target = /^https?:\/\//i.test(activeRecipe.url)
      ? activeRecipe.url
      : `https://${activeRecipe.url}`;
    Linking.openURL(encodeURI(target));
  };
  const removeIngredient = (item: CookingItem) =>
    showAlert("재료를 삭제할까요?", item.name, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          const 자리 = (recipes.find((recipe) => recipe.id === activeId)?.ingredients ?? [])
            .findIndex((value) => value.id === item.id);
          setRecipes((current) =>
            current.map((recipe) =>
              recipe.id === activeId
                ? {
                    ...recipe,
                    ingredients: recipe.ingredients.filter(
                      (value) => value.id !== item.id,
                    ),
                  }
                : recipe,
            ),
          );
          notify("재료를 삭제했어요", {
            label: "되돌리기",
            onPress: () => {
              setRecipes((current) => current.map((recipe) =>
                recipe.id === activeId
                  ? { ...recipe, ingredients: 자리에_넣기(recipe.ingredients, item, 자리) }
                  : recipe));
              notify("재료를 되돌렸어요");
            },
          });
        },
      },
    ]);
  const copyCooking = async () => {
    await Clipboard.setStringAsync(
      ingredients
        .map(
          (item) =>
            `${item.name} | ${item.quantity} | ${item.group} | ${item.owner}`,
        )
        .join("\n"),
    );
    notify("요리 재료 목록을 복사했어요");
  };
  const openImport = async () => {
    const copied = await readClipboard();
    setImportText(copied);
    setImporting(true);
    if (!copied) notify("복사한 내용을 읽지 못했어요. 칸에 직접 붙여넣어 주세요");
  };
  const importCooking = () => {
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [
          itemName,
          itemQuantity = "",
          itemGroup = "기본",
          itemOwner = "미정",
        ] = line.split("|").map((value) => value.trim());
        return {
          id: newPlaceId(),
          name: itemName,
          quantity: itemQuantity,
          group: itemGroup,
          owner: itemOwner,
        };
      })
      .filter((item, index, values) =>
        Boolean(item.name) &&
        values.findIndex((value) => value.name.trim().toLowerCase() === item.name.trim().toLowerCase()) === index,
      );
    if (!parsed.length) return;
    const existingNames = new Set(ingredients.map((item) => item.name.trim().toLowerCase()));
    const additions = importMode === "교체"
      ? parsed
      : parsed.filter((item) => !existingNames.has(item.name.trim().toLowerCase()));
    setRecipes((current) =>
      current.map((recipe) =>
        recipe.id === activeId
          ? {
              ...recipe,
              ingredients:
                importMode === "교체"
                  ? additions
                  : [...recipe.ingredients, ...additions],
            }
          : recipe,
      ),
    );
    setImporting(false);
    notify(additions.length ? `요리 재료 ${additions.length}개를 반영했어요` : "이미 추가한 재료뿐이에요");
  };
  return (
    <View>
      <TabActionHeader
        label="요리"
        count={`${recipes.length}개`}
        action="요리 추가"
        onPress={() => setAddingRecipe(true)}
      />
      {recipes.length > 0 && (
        <View style={styles.recipeSelector}>
          <View style={styles.recipeSelectorHead}>
            <Text style={[styles.recipeSelectorTitle, theme && { color: theme.muted }]}>메뉴</Text>
            <View style={styles.recipeSelectorActions}>
              {/* 개수는 바로 위 탭 머리글이 이미 보여준다. 넘칠 때만 더 보기를 낸다. */}
              {recipes.length > 4 && (
                <Pressable
                  accessibilityRole="button" onPress={() => setShowAllRecipes(true)}>
                  <View style={styles.inlineMore}>
                    <Text style={[styles.recipeSelectorMore, theme && { color: theme.primary }]}>전체 {recipes.length}개</Text>
                    <Glyph name="chevronRight" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />
                  </View>
                </Pressable>
              )}
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cookV2MenuList}
          >
            {menuRecipes.map((recipe) => {
              const index = recipes.findIndex((item) => item.id === recipe.id);
              const selected = recipe.id === activeId;
              return (
                <Pressable
                  key={recipe.id}
                  onPress={() => selectRecipe(recipe.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${recipe.name} 메뉴, 재료 ${recipe.ingredients.length}개`}
                  style={[
                    styles.cookV2MenuCard,
                    theme && {
                      backgroundColor: selected ? theme.primarySoft : theme.surface,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <View style={styles.cookV2MenuTop}>
                    <Text style={[styles.cookV2MenuNumber, theme && { color: selected ? theme.primary : theme.muted }]}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text style={[styles.cookV2MenuCount, theme && { color: selected ? theme.primary : theme.muted }]}>{recipe.ingredients.length}개</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.cookV2MenuName, theme && { color: theme.text }]}>{recipe.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
      {allCookingIngredients.length > 0 && (
        <View
          style={[
            styles.myCookingBox,
            theme && {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Pressable
            onPress={() => setShowMyIngredients(true)}
            accessibilityRole="button"
            accessibilityLabel={`통합 장보기 목록, 전체 재료 ${allCookingIngredients.length}개`}
            style={styles.myCookingCompact}
          >
            <View style={[styles.myCookingIcon, theme && { backgroundColor: theme.primarySoft }]}>
              {[0, 1, 2].map((line) => (
                <View key={line} style={styles.cookV2MemoLine}>
                  <View style={[styles.cookV2MemoDot, theme && { backgroundColor: theme.primary }]} />
                  <View
                    style={[
                      styles.cookV2MemoRule,
                      line === 2 && styles.cookV2MemoRuleShort,
                      theme && { backgroundColor: theme.primary },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.myCookingCopy}>
              <Text style={[styles.cookV2MyEyebrow, theme && { color: theme.primary }]}>통합 장보기</Text>
              <Text style={[styles.myCookingTitle, theme && { color: theme.text }]}>전체 재료 {allCookingIngredients.length}개</Text>
              <Text numberOfLines={1} style={[styles.myCookingSummary, theme && { color: theme.muted }]}>현지 구매 {allCookingIngredients.filter((item) => item.owner === "구매").length}개 · 집에서 {allCookingIngredients.filter((item) => item.owner !== "구매").length}개</Text>
            </View>
            <Glyph name="chevronRight" size={아이콘.보통} color={theme?.primary ?? "#3F4C8F"} />
          </Pressable>
        </View>
      )}
      {!activeRecipe ? (
        <SharedEmptyState
          theme={theme ?? undefined}
          모양="세로"
          title="만들 요리를 추가해 보세요."
          description="요리별로 재료와 준비 방법을 나눌 수 있어요."
          action={canEdit ? "첫 요리 추가" : undefined}
          onPress={canEdit ? () => setAddingRecipe(true) : undefined}
        />
      ) : (
        <>
          <View
            style={[
              styles.cookingHero,
              styles.cookV2Hero,
              theme && { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.cookingHeroCopy}>
              <Text style={[styles.cookingEyebrow, theme && { color: theme.primary }]}>{ingredientProgress === 100 ? "재료 준비 완료" : "이번 여행의 한 끼"}</Text>
              <Text
                style={[styles.cookingTitle, theme && { color: theme.text }]}
              >
                {activeRecipe.name}
              </Text>
              <Text
                style={[styles.cookingNote, theme && { color: theme.muted }]}
              >
                {요리메모_보이기(activeRecipe.note)}
              </Text>
              {activeRecipe.url ? (
                <Pressable
                  onPress={openRecipeLink}
                  accessibilityRole="link"
                  style={styles.recipeLink}
                >
                  <Glyph name="play" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />
                  <Text style={[styles.recipeLinkText, theme && { color: theme.primary }]}>레시피 영상 보기</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.cookingHeroActions}>
              {canEdit && (
              <Pressable
                onPress={openRecipeEdit}
                accessibilityRole="button"
                accessibilityLabel={activeRecipe ? `${activeRecipe.name} 수정` : "요리 수정"}
                style={[
                  styles.cookingMoreButton,
                  theme && { backgroundColor: theme.surface },
                ]}
              >
                <Glyph name="more" size={아이콘.보통} color={theme?.muted ?? "#646C7A"} weight={2.6} />
              </Pressable>
              )}
              <View style={[styles.cookV2ProgressBadge, theme && { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.cookV2ProgressBadgeValue, theme && { color: theme.primary }]}>{ingredientProgress}%</Text>
                <Text style={[styles.cookV2ProgressBadgeLabel, theme && { color: theme.muted }]}>재료 준비</Text>
              </View>
            </View>
          </View>
          <View style={styles.cookingToolbar}>
            <Text style={[styles.cookingTip, theme && { color: theme.muted }]}>
              필요한 재료
            </Text>
            {canEdit && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAddingIngredient(true)}
              style={[styles.placeAdd, theme && { backgroundColor: theme.primarySoft }]}
            >
              <View style={공용스타일.더하기줄}>
                <Glyph name="plus" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} weight={2.4} />
                <Text style={[styles.placeAddText, theme && { color: theme.primary }]}>재료 추가</Text>
              </View>
            </Pressable>
            )}
          </View>
          {ingredients.length === 0 && (
            <EmptyState
              title="아직 재료가 없어요"
              description="첫 재료를 추가하거나 목록을 붙여넣어 요리를 준비해 보세요."
              action="첫 재료 추가"
              onPress={canEdit ? () => setAddingIngredient(true) : undefined}
            />
          )}
          {groups.map((section, groupIndex) => {
            const sectionItems = ingredients.filter((item) => item.group === section);
            const sectionReadyCount = sectionItems.filter((item) => readyIngredientIds.includes(item.id)).length;
            const collapsed = collapsedCookingGroups.includes(section);
            const groupAccent = theme
              ? [theme.primary, theme.secondary, theme.accent][groupIndex % 3]
              : ["#E89B58", "#55BFB4", "#8B7CF6"][groupIndex % 3];
            return (
              <View
              key={section}
              style={[
                styles.cookingSection,
                theme && {
                  backgroundColor: theme.surface,
                  borderColor: `${groupAccent}55`,
                  transform: [
                    {
                      rotate: groups.indexOf(section) % 2 ? ".2deg" : "-.2deg",
                    },
                  ],
                },
              ]}
              >
              <Pressable
                onPress={() =>
                  setCollapsedCookingGroups((current) =>
                    current.includes(section)
                      ? current.filter((groupName) => groupName !== section)
                      : [...current, section],
                  )
                }
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                style={[styles.cookV2SectionHead, { backgroundColor: `${groupAccent}0D` }]}
              >
                <View style={styles.cookV2SectionTitleRow}>
                  <View style={[styles.cookV2SectionLabel, { backgroundColor: `${groupAccent}20` }]}>
                    <Text style={[styles.cookV2SectionLabelText, { color: groupAccent }]}>{String(groupIndex + 1).padStart(2, "0")}</Text>
                  </View>
                  <Text style={[styles.cookingSectionTitle, styles.cookV2SectionTitle, theme && { color: theme.text }]}>{section}</Text>
                </View>
                <View style={styles.cookV2SectionActions}>
                  <Text style={[styles.cookV2SectionCount, theme && { color: theme.muted }]}>{sectionReadyCount}/{sectionItems.length} 준비</Text>
                  <Glyph name={collapsed ? "chevronRight" : "chevronDown"} size={아이콘.보통} color={theme?.muted ?? "#646C7A"} weight={2.2} />
                </View>
              </Pressable>
              {!collapsed && sectionItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openIngredientEdit(item)}
                    onLongPress={canEdit ? () => removeIngredient(item) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, ${item.quantity}, ${item.owner}, 수정`}
                    style={[
                      styles.ingredientRow,
                      readyIngredientIds.includes(item.id) && styles.cookV2IngredientDone,
                    ]}
                  >
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setReadyIngredientIds((current) =>
                          current.includes(item.id)
                            ? current.filter((id) => id !== item.id)
                            : [...current, item.id],
                        );
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: readyIngredientIds.includes(item.id) }}
                      accessibilityLabel={`${item.name} ${readyIngredientIds.includes(item.id) ? "준비 완료 해제" : "준비 완료"}`}
                      disabled={!canEdit}
                      hitSlop={11}
                      style={공용스타일.체크칸}
                    >
                      <CheckBox theme={theme ?? undefined} on={readyIngredientIds.includes(item.id)} 모양="원" />
                    </Pressable>
                    <View style={styles.ingredientBody}>
                      <Text
                        style={[
                          styles.ingredientName,
                          theme && { color: theme.text },
                          readyIngredientIds.includes(item.id) && styles.cookV2IngredientNameDone,
                        ]}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.ingredientOwner,
                          theme && { color: theme.muted },
                        ]}
                      >
                        {item.owner}
                      </Text>
                    </View>
                    <Text style={[styles.ingredientQuantity, theme && { color: theme.muted }]}>
                      {item.quantity}
                    </Text>
                  </Pressable>
                ))}
            </View>
            );
          })}
          {canEdit && (
          <Text style={[공용스타일.longPressHint, theme && { color: theme.muted }]}>
            왼쪽 원을 눌러 준비 여부를 체크하고, 재료 이름을 누르면 수정할 수 있어요. 길게 누르면 삭제할 수 있어요.
          </Text>
          )}
          {canEdit && (
          <View
            style={[
              공용스타일.packingListTools,
              theme && { borderTopColor: theme.border },
            ]}
          >
            <View style={공용스타일.packingListToolsCopy}>
              <Text
                style={[
                  공용스타일.packingListToolsTitle,
                  theme && { color: theme.text },
                ]}
              >
                목록 한꺼번에 수정
              </Text>
              <Text
                style={[
                  공용스타일.packingListToolsHint,
                  theme && { color: theme.muted },
                ]}
              >
                복사해 수정한 뒤 다시 붙여넣을 수 있어요
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={copyCooking}
              hitSlop={누름여유(높이.칩)}
              style={[
                공용스타일.packingToolButton,
                theme && { borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  공용스타일.packingToolButtonText,
                  theme && { color: theme.text },
                ]}
              >
                복사
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={openImport}
              hitSlop={누름여유(높이.칩)}
              style={[
                공용스타일.packingToolButton,
                theme && { borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  공용스타일.packingToolButtonText,
                  theme && { color: theme.text },
                ]}
              >
                붙여넣기
              </Text>
            </Pressable>
          </View>
          )}
        </>
      )}
      <DetailSheet
        visible={showAllRecipes}
        title="전체 요리 메뉴"
        subtitle={`${recipes.length}개 요리 중 확인할 메뉴를 고르면 돼요`}
        submit="닫기"
        onClose={() => setShowAllRecipes(false)}
        onSubmit={() => setShowAllRecipes(false)}
      >
        <View style={[styles.recipeList, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {recipes.map((recipe, index) => (
            <Pressable
              key={recipe.id}
              onPress={() => {
                selectRecipe(recipe.id);
                setShowAllRecipes(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: recipe.id === activeId }}
              style={[
                styles.recipeListRow,
                index > 0 && styles.recipeListRowBorder,
                theme && index > 0 && { borderTopColor: theme.border },
                recipe.id === activeId && theme && { backgroundColor: theme.primarySoft },
              ]}
            >
              <View style={[styles.recipeListNumber, theme && { backgroundColor: recipe.id === activeId ? theme.primary : theme.surfaceAlt }]}>
                <Text style={[styles.recipeListNumberText, theme && { color: recipe.id === activeId ? "#FFFFFF" : theme.muted }]}>{index + 1}</Text>
              </View>
              <View style={styles.recipeListCopy}>
                <Text numberOfLines={1} style={[styles.recipeListName, theme && { color: theme.text }]}>{recipe.name}</Text>
                <Text numberOfLines={1} style={[styles.recipeListNote, theme && { color: theme.muted }]}>{요리메모_보이기(recipe.note)}</Text>
              </View>
              <Text style={[styles.recipeListCount, theme && { color: theme.muted }]}>{recipe.ingredients.length}개</Text>
            </Pressable>
          ))}
        </View>
      </DetailSheet>
      <DetailSheet
        visible={showMyIngredients}
        title="통합 장보기 목록"
        subtitle={`요리 ${recipes.length}개에 들어가는 재료를 준비 방법별로 모아 봐요`}
        submit={canEdit ? "준비물에 추가" : "닫기"}
        onClose={() => {
          setShoppingCost("");
          setShowMyIngredients(false);
        }}
        onSubmit={() => {
          setShoppingCost("");
          setShowMyIngredients(false);
          if (canEdit) openPreparationImport();
        }}
      >
        {canEdit && (
        <View style={[styles.shoppingCost, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <View style={styles.shoppingCostCopy}>
            <Text style={[styles.shoppingCostTitle, theme && { color: theme.text }]}>장 본 금액 추가</Text>
            <Text style={[styles.shoppingCostHint, theme && { color: theme.muted }]}>
              비용 탭에 식비로 한 건 들어가요
            </Text>
          </View>
          <TextInput
            accessibilityLabel="장 본 금액"
            value={shoppingCost}
            onChangeText={(text) => setShoppingCost(금액_치기(text, currencyOf(currency).fraction))}
            keyboardType={금액_키보드(currencyOf(currency).fraction)}
            placeholder="예: 41,500"
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[styles.shoppingCostInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
          <Pressable
            onPress={() => {
              const amount = parseAmount(shoppingCost, currencyOf(currency).fraction);
              if (!amount) {
                notify("금액을 입력해 주세요");
                return;
              }
              onRecordShopping("장보기", amount);
              setShoppingCost("");
              setShowMyIngredients(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="장 본 금액을 비용에 추가"
            style={[styles.shoppingCostButton, theme && { backgroundColor: theme.primary }]}
          >
            <Text style={styles.shoppingCostButtonText}>추가</Text>
          </Pressable>
        </View>
        )}
        <OptionField
          label={`담당 · ${filteredShoppingCount}개`}
          options={shoppingOwnerOptions}
          value={ingredientOwnerFilter}
          onChange={setIngredientOwnerFilter}
        />
        {recipes.map((recipe) => {
          const matching = ingredientOwnerFilter === "전체"
            ? recipe.ingredients
            : recipe.ingredients.filter((item) => item.owner === ingredientOwnerFilter);
          if (!matching.length) return null;
          return (
            <View key={recipe.id} style={[styles.myIngredientGroup, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  selectRecipe(recipe.id);
                  setShowMyIngredients(false);
                }}
                style={styles.myIngredientGroupHead}
              >
                <Text numberOfLines={1} style={[styles.myIngredientGroupTitle, theme && { color: theme.text }]}>{recipe.name}</Text>
                <View style={styles.inlineMore}>
                  <Text style={[styles.myIngredientGroupCount, theme && { color: theme.primary }]}>{matching.length}개</Text>
                  <Glyph name="chevronRight" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />
                </View>
              </Pressable>
              {matching.map((item) => (
                <View key={item.id} style={[styles.myIngredientRow, theme && { borderTopColor: theme.border }]}>
                  <Text numberOfLines={1} style={[styles.myIngredientName, theme && { color: theme.text }]}>{item.name}</Text>
                  <Text numberOfLines={1} style={[styles.myIngredientQuantity, theme && { color: theme.muted }]}>{item.quantity} · {item.owner}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </DetailSheet>
      <DetailSheet
        visible={addingIngredient}
        title={editingIngredient ? "요리 재료 수정" : "요리 재료 추가"}
        subtitle="분류와 담당은 저장한 뒤에도 바꿀 수 있어요"
        submit={editingIngredient ? "저장" : "재료 추가"}
        disabledHint={!ingredientFormValid ? (duplicateIngredient ? "이 요리에 이미 있는 재료예요" : "재료 이름을 입력해 주세요") : undefined}
        submitDisabled={!ingredientFormValid}
        destructiveLabel={editingIngredient ? "재료 삭제" : undefined}
        destructiveMessage="이 요리에서 재료를 삭제해요."
        onDestructive={() => {
          if (!editingIngredient) return;
          removeIngredient(editingIngredient);
          closeIngredientSheet();
        }}
        hasUnsavedChanges={ingredientDraftChanged}
        onClose={closeIngredientSheet}
        onSubmit={addIngredient}
      >
        <DetailField
          label="재료 이름"
          required
          value={name}
          onChangeText={setName}
          placeholder="예: 팽이버섯"
        />
        <DetailField
          label="수량 (선택)"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="예: 1봉"
        />
        <OptionField
          label="담당 (선택)"
          options={cookingOwnerOptions(participants)}
          value={owner}
          onChange={setOwner}
        />
        <OptionalFormSection
          label="분류"
          summary={group.trim() && group !== "기본" ? group : undefined}
          open={ingredientGroupOpen}
          onToggle={() => setIngredientGroupOpen((current) => !current)}
        >
          <View style={공용스타일.tagEditor}>
            <Text
              style={[
                공용스타일.detailFieldLabel,
                공용스타일.selectorLabel,
                theme && { color: theme.muted },
              ]}
            >
              분류 (선택)
            </Text>
            <View style={공용스타일.tagSuggestions}>
              {["채소", "고기", "해산물", "양념", "소스", "토핑"].map(
                (category) => {
                  const selected = group === category;
                  return (
                    <Chip
                      key={category}
                      theme={theme ?? undefined}
                      label={category}
                      on={selected}
                      onPress={() => setGroup(category)}
                    />
                  );
                },
              )}
            </View>
            <TextInput
              value={group}
              onChangeText={setGroup}
              placeholder="직접 입력 · 예: 유제품"
              placeholderTextColor={theme?.muted ?? "#9AA1AE"}
              style={[
                공용스타일.tagInput,
                theme && {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
            />
          </View>
        </OptionalFormSection>
      </DetailSheet>
      <DetailSheet
        visible={addingRecipe}
        title={recipeSheetStep === "지난 여행" ? "지난 여행에서 요리 가져오기" : editingRecipe ? "요리 수정" : "요리 추가"}
        subtitle={recipeSheetStep === "지난 여행"
          ? "요리를 누르면 재료까지 함께 가져와요. 준비 완료 표시는 해제된 상태로 와요"
          : "이름만 먼저 저장하고 재료는 메뉴 안에서 추가할 수 있어요"}
        submit={recipeSheetStep === "지난 여행" ? "닫기" : editingRecipe ? "저장" : "요리 추가"}
        disabledHint={recipeSheetStep === "직접" && !recipeFormValid
          ? duplicateRecipe
            ? "이미 추가한 요리예요"
            : !recipeUrlValid
              ? "레시피 링크를 확인해 주세요"
              : "요리 이름을 입력해 주세요"
          : undefined}
        submitDisabled={recipeSheetStep === "직접" && !recipeFormValid}
        destructiveLabel={editingRecipe ? "요리 삭제" : undefined}
        destructiveMessage={editingRecipe ? `${recipeName || "이 요리"}${josa(recipeName || "이 요리", "과", "와")} 재료 목록을 함께 삭제해요.` : undefined}
        hasUnsavedChanges={recipeDraftChanged}
        onClose={closeRecipeSheet}
        onSubmit={recipeSheetStep === "지난 여행" ? closeRecipeSheet : addRecipe}
        onDestructive={deleteRecipe}
      >
        {recipeSheetStep === "지난 여행" ? (
          <PastTripList
            theme={theme}
            label="요리"
            mode="하나"
            groups={pastRecipes.groups}
            loading={pastRecipes.loading}
            error={pastRecipes.error}
            onRetry={pastRecipes.reload}
            onBack={() => setRecipeSheetStep("직접")}
            onPress={takePastRecipe}
            meta={(row) => [`재료 ${row.ingredients.length}개`, 요리메모_읽기(row.note)].filter(Boolean).join(" · ")}
            footnote="담당은 이번 여행 참가자만 유지되고 나머지는 ‘미정’이 돼요."
          />
        ) : (<>
        {!editingRecipe && spaceId && tripId && (
          <PastTripEntry
            theme={theme}
            hint="전에 해 먹은 요리를 재료까지 그대로 불러와요."
            onPress={() => setRecipeSheetStep("지난 여행")}
          />
        )}
        {!editingRecipe && <View
          style={[
            styles.aiRecipeCallout,
            theme && {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.aiRecipeCopy}>
            <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>여러 요리를 한 번에 추가</Text>
            <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>ChatGPT가 정리한 요리와 재료를 붙여넣을 수 있어요.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              // 요리 추가 시트와 ChatGPT 시트는 형제 Modal 이다. 같은 프레임에 하나를 닫고
              // 하나를 열면 iOS 가 뒤엣것을 세우지 못해 아무 일도 없는 것처럼 보였다.
              // 먼저 닫고, 내려가는 시간을 준 뒤 연다(교통편 수정과 같은 처방).
              setAddingRecipe(false);
              setTimeout(() => setAiImporting(true), Platform.OS === "ios" ? 380 : 0);
            }}
            style={[공용스타일.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[공용스타일.aiRecipeButtonText, theme && { color: theme.primary }]}>ChatGPT로 추가</Text>
          </Pressable>
        </View>}
        <DetailField
          label="요리 이름"
          required
          value={recipeName}
          onChangeText={setRecipeName}
          placeholder="예: 김치볶음밥"
        />
        <OptionalFormSection
          label="메모 · 레시피 링크"
          summary={[recipeNote.trim() && "메모", recipeUrl.trim() && "링크"].filter(Boolean).join(" · ") || undefined}
          open={recipeExtrasOpen}
          onToggle={() => setRecipeExtrasOpen((current) => !current)}
        >
          <DetailField
            label="메모 (선택)"
            value={recipeNote}
            onChangeText={setRecipeNote}
            placeholder="예: 둘째 날 아침 · 남은 재료 활용"
          />
          <DetailField
            label="레시피 링크 (선택)"
            value={recipeUrl}
            onChangeText={setRecipeUrl}
            placeholder="예: https://youtu.be/…"
            maxLength={2048}
          />
        </OptionalFormSection>
        </>)}
      </DetailSheet>
      <DetailSheet
        visible={aiImporting}
        title="ChatGPT로 여러 요리 추가"
        subtitle="프롬프트를 복사해 ChatGPT에 물어보고 돌아와 답을 붙여넣으면 돼요"
        submit={
          aiParsed.length
            ? `요리 ${aiParsed.length}개 추가`
            : "요리 추가"
        }
        disabledHint={!aiParsed.length ? (aiResult.trim() ? "읽을 수 있는 줄이 없어요" : "ChatGPT 답을 붙여넣어 주세요") : undefined}
        submitDisabled={!aiParsed.length}
        hasUnsavedChanges={aiDraftChanged}
        onClose={() => setAiImporting(false)}
        onSubmit={importAiRecipes}
      >
        <View
          style={[
            styles.aiPromptBox,
            theme && {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.aiPromptHead}>
            <View style={styles.aiRecipeCopy}>
              <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>1. 프롬프트 복사하고 ChatGPT 열기</Text>
              <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>ChatGPT에 붙여넣고 그 아래에 요리와 재료 메모를 적어 주세요.</Text>
            </View>
            <Pressable
              onPress={copyPromptAndOpenGpt}
              accessibilityRole="button"
              accessibilityLabel="프롬프트를 복사하고 ChatGPT 열기"
              style={styles.aiPromptCopyButton}
            >
              <Text style={styles.aiPromptCopyText}>복사하고 열기</Text>
            </Pressable>
          </View>
          <Text numberOfLines={4} style={[styles.aiPromptPreview, theme && { color: theme.muted }]}>{cookingPrompt}</Text>
          {/* 브라우저가 안 열리는 기기도 있다. 복사만 하는 길을 남긴다. */}
          <Pressable
            onPress={copyCookingPrompt}
            accessibilityRole="button"
            style={styles.aiPromptCopyOnly}
          >
            <Text style={[styles.aiRecipeText, theme && { color: theme.primary }]}>복사만 하기</Text>
          </Pressable>
        </View>
        <View style={styles.aiPasteRow}>
          <View>
            <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>2. 돌아와서 결과 붙여넣기</Text>
            <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>ChatGPT 답을 복사한 뒤 이 버튼을 눌러 주세요.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={pasteAiResult}
            style={[공용스타일.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[공용스타일.aiRecipeButtonText, theme && { color: theme.primary }]}>붙여넣기</Text>
          </Pressable>
        </View>
        <DetailField
          label="붙여넣은 결과"
          value={aiResult}
          onChangeText={setAiResult}
          multiline
          maxLength={붙여넣기_한도}
          placeholder={"요리 | 김치볶음밥 | 둘째 날 아침 | https://youtu.be/...\n재료 | 김치 | 1컵 | 기본 | 구매"}
        />
        {/* 읽힌 결과를 넣기 전에 보여준다. 형식이 어긋나면 여기서 바로 안다. */}
        <Text style={[공용스타일.settingHint, theme && { color: aiResult.trim() && !aiParsed.length ? theme.accent : theme.muted }]}>
          {!aiResult.trim()
            ? "여러 요리와 각 재료가 한 번에 추가돼요."
            : aiParsed.length
              ? `요리 ${aiParsed.length}개와 재료 ${aiIngredientCount}개를 읽었어요. ${aiParsed.map((recipe) => recipe.name).join(", ")}`
              : "요리 줄을 찾지 못했어요. 각 줄이 ‘요리 |’ 나 ‘재료 |’ 로 시작하는지 확인해 주세요."}
        </Text>
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="요리 목록 붙여넣기"
        subtitle="메모에서 고친 목록을 한 번에 반영해요"
        submit={importMode === "교체" ? "목록 교체" : "목록에 추가"}
        confirmSubmit={
          importMode === "교체" && recipes.length
            ? `저장한 요리 ${recipes.length}개를 삭제하고 붙여넣은 목록으로 바꿔요. 되돌릴 수 없어요.`
            : undefined
        }
        disabledHint={!importText.trim() ? "목록을 입력해 주세요" : undefined}
        submitDisabled={!importText.trim()}
        hasUnsavedChanges={cookingImportChanged}
        onClose={() => setImporting(false)}
        onSubmit={importCooking}
      >
        <DetailField
          label="붙여넣을 재료 목록"
          required
          value={importText}
          onChangeText={setImportText}
          multiline
          maxLength={붙여넣기_한도}
          placeholder="한 줄에 재료 하나씩"
        />
        <OptionField
          label="목록 반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
      </DetailSheet>
    </View>
  );
}

/**
 * 기록 탭 격자 위의 필터.
 *
 * 사진과 꾸미는 중인 추억 카드(초안)를 한 격자에 놓았다. 완성한 카드는 사진이 되어
 * 사진 칸에 섞이고, 아직 꾸미는 중인 것만 「꾸미는 중」 표를 달고 선다. 카드만 아래에
 * 따로 두면 같은 여행을 두 군데서 훑게 된다. 대신 종류별로 보고 싶을 때가 있어
 * 격자 위에 이 세 칩을 둔다. 「카드」 칩은 꾸미는 중인 것만 보여 준다.
 *
 * 개수는 이 칩들이 든다. 머리에 세 줄이나 더 얹어 같은 것을 세 번 세던 자리를
 * 없앴다(`memoryFilter.ts`).
 */

/** 초안이 아직 오지 않았을 때. 렌더마다 새 배열을 만들면 격자가 매번 다시 계산된다. */

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

function Memories({
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

function Money({
  addRef,
  scrollToY,
  tripName,
  dayOptions,
  todayDay,
  expenses,
  setExpenses,
  budget,
  setBudget,
  me,
  payments,
  setPayments,
  simplify,
  setSimplify,
  assignedSummary,
  participants,
  saveParticipants,
  spaceMembers,
  currency,
  setCurrency,
  exchangeRate,
  setExchangeRate,
}: {
  /**
   * 「지출 추가」를 여는 길. 떠 있는 ＋ 단추가 스크롤 바깥에 있어서 밖으로 내준다.
   *
   * 스크롤 안에 두면 단추도 함께 밀려 올라가 화면에 붙어 있지 못한다.
   */
  addRef?: React.RefObject<(() => void) | null>;
  /** 스크롤 내용 맨 위에서 잰 자리로 내려 보낸다. 「지출 내역」 바로 가기가 쓴다. */
  scrollToY?: (y: number) => void;
  tripName: string;
  dayOptions: string[];
  /** 여행 날짜 가운데 오늘. 여행 기간이 아니면 빈 문자열. */
  todayDay: string;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  budget: number;
  setBudget: React.Dispatch<React.SetStateAction<number>>;
  /** 이 앱을 쓰는 사람. 정산을 이 사람 기준으로 먼저 말한다. */
  me: string;
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  simplify: boolean;
  setSimplify: React.Dispatch<React.SetStateAction<boolean>>;
  /** 이 사람 이름으로 여행에 적어 둔 것들. 참가자에서 빼기 전에 보여 준다. */
  assignedSummary: (person: string) => string;
  /** 이번 여행에 가는 사람. 몫은 이 목록을 기준으로 나눈다. */
  participants: Participant[];
  /** 참가자를 서버까지 저장한다. 시트를 닫아도 되면 true. 실패 안내는 저장하는 쪽이 띄운다. */
  saveParticipants: (next: Participant[]) => Promise<boolean>;
  /** 공간 멤버 전원. 참가자를 고를 때의 후보다. */
  spaceMembers: Participant[];
  currency: string;
  setCurrency: React.Dispatch<React.SetStateAction<string>>;
  exchangeRate: number;
  setExchangeRate: React.Dispatch<React.SetStateAction<number>>;
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const canEdit = useContext(DetailEditableContext);
  const [dayFilter, setDayFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState<"전체" | ExpenseCategory>("전체");
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [draftBudget, setDraftBudget] = useState("500,000");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftCategory, setDraftCategory] = useState<ExpenseCategory>("식비");
  const [draftPayer, setDraftPayer] = useState<Participant>(participants[0] ?? "");
  // 몫을 지는 사람과 비중. 비어 있으면 참가자 전원이 똑같이 나눈다.
  // 나누는 방식을 눈에 보이게 고르게 한다. 예전에는 아무도 안 고른 상태가
  // 곧 전원 균등이었는데, 화면에는 "아무도 안 골랐다" 로 보여서 여기서 멈췄다.
  // 하나를 누르면 갑자기 그 사람만 몫이 되니 고를수록 늘어날 거라는 예상과도
  // 반대로 움직였다.
  const [draftSplitMode, setDraftSplitMode] = useState<SplitMode>("균등");
  /** "일부" 일 때 몫을 지는 사람. 처음에는 전원이 켜진 채로 시작한다. */
  const [draftPeople, setDraftPeople] = useState<Participant[]>([]);
  /** "금액" 일 때 사람마다 적은 금액. 치는 중이라 글자로 들고 있는다. */
  const [draftAmounts, setDraftAmounts] = useState<Record<Participant, string>>({});
  // 마지막에 적은 분류와 낸 사람. 여행 중에는 같은 사람이 같은 종류를 이어서
  // 적는 일이 많아서, 매번 처음 값으로 돌아가면 지출마다 두 번씩 고치게 된다.
  const [lastCategory, setLastCategory] = useState<ExpenseCategory>("식비");
  const [lastPayer, setLastPayer] = useState<Participant>(participants[0] ?? "");
  const [peopleSheetOpen, setPeopleSheetOpen] = useState(false);
  // 참가자도 저장을 눌러야 바뀐다. 누구였는지 확인만 하려고 체크를 껐다가
  // 바깥을 눌러 닫으면 그 사람이 빠진 채로 정산이 다시 계산돼 버렸다.
  const [draftParticipants, setDraftParticipants] = useState<Participant[]>(participants);
  const [draftDay, setDraftDay] = useState(dayOptions[0] ?? "");
  const [draftMemo, setDraftMemo] = useState("");
  const [draftReceipt, setDraftReceipt] = useState("");
  // 정산에서 빼기. 지우지 않고 셈에서만 뺀다. 회사에 청구할 영수증이나 선물로 낸 돈처럼
  // 적어는 두되 나누지 않을 지출이 있다.
  const [draftExcluded, setDraftExcluded] = useState(false);
  // 누가 내고 누구 몫인지, 그리고 영수증과 메모는 대개 기본값 그대로 둔다.
  // 늘 펼쳐 두면 식당 앞에서 적을 때 제출 단추까지 다섯 줄을 지나야 한다.
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  // 시트 안에서 고른 것은 저장을 눌러야 여행에 들어간다. 고르는 즉시 바꾸면
  // 환율을 안 적고 닫았을 때 통화만 달러로 남아 합계가 "약 24원" 이 된다.
  const [draftCurrency, setDraftCurrency] = useState(DEFAULT_CURRENCY.code);
  const [draftRate, setDraftRate] = useState("");
  // 빠르게 적기. 금액만 치고 단추 한 번이면 한 건이 들어간다. 평소 가계부를
  // 안 쓰던 사람이 여행 중에 쓰려면 이 정도로 짧아야 한다.
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCategory, setQuickCategory] = useState<ExpenseCategory>("식비");
  const budgetDraftChanged = useDraftChanged(budgetSheetOpen, draftBudget);
  const expenseDraftChanged = useDraftChanged(sheetOpen, JSON.stringify([
    draftTitle, draftAmount, draftCategory, draftPayer, draftSplitMode, draftPeople, draftAmounts,
    draftDay, draftMemo, draftReceipt, draftExcluded,
  ]));
  const previousDays = useRef(dayOptions);
  const dayOptionsKey = dayOptions.join("|");

  // 기간이 바뀌면 고르는 칸만 되돌린다. 지출의 날짜 이름표를 새 기간으로 옮기는 일은
  // 여행 수정 저장(부모)이 일정·예약·교통과 한자리에서 한다. 여기서도 옮기면 두 번
  // 밀리고, 비용 탭을 열지 않으면 아예 안 옮겨져 서버의 날짜가 지워졌다(2026-09-23).
  useEffect(() => {
    if (previousDays.current.join("|") === dayOptionsKey) return;
    setDayFilter("전체");
    setDraftDay(dayOptions[0] ?? "");
    previousDays.current = dayOptions;
  }, [dayOptions, dayOptionsKey]);

  // 목록은 늘 여행 날짜 차례로 본다. 넣은 차례로 두면 나중에 끼워 넣은 지출이
  // 엉뚱한 자리에 남는다.
  const sorted = useMemo(() => {
    const order = (day: string) => {
      const index = dayOptions.indexOf(day);
      return index === -1 ? dayOptions.length : index;
    };
    return [...expenses].sort((a, b) => order(a.day) - order(b.day));
  }, [expenses, dayOptions]);
  const settlement = useMemo(
    () => settle(expenses, participants, { payments, simplify }),
    [expenses, participants, payments, simplify],
  );
  // 참가자에서 뺀 사람이 낸 지출은 정산에 남는다. 그 사람이 표에 없으면 정산
  // 줄의 이름이 어디서 왔는지 알 길이 없어서, 뒤에 붙여 같이 보여 준다.
  const paidRows = useMemo(() => {
    const extra = Object.keys(settlement.paid).filter((person) => !participants.includes(person));
    return [...participants, ...extra].map((person) => ({
      person,
      joined: participants.includes(person),
      paid: settlement.paid[person] ?? 0,
      owed: settlement.owed[person] ?? 0,
    }));
  }, [participants, settlement]);
  const byCategory = useMemo(() => totalsByCategory(expenses), [expenses]);
  const byDay = useMemo(() => totalsByDay(expenses, dayOptions), [expenses, dayOptions]);
  const averagePerSpendingDay = byDay.length ? Math.round(settlement.total / byDay.length) : 0;
  const topDay = byDay.reduce<{ day: string; amount: number } | null>(
    (top, row) => (!top || row.amount > top.amount ? row : top),
    null,
  );
  const usedDays = useMemo(
    () => dayOptions.filter((day) => expenses.some((item) => item.day === day)),
    [dayOptions, expenses],
  );
  const visible = sorted.filter(
    (item) =>
      (dayFilter === "전체" || item.day === dayFilter)
      && (categoryFilter === "전체" || item.category === categoryFilter),
  );
  // 날짜로 묶고 소제목에 그날 합계를 단다. 여행 중에 가장 자주 하는 질문이
  // "어제 얼마 썼지" 인데, 한 줄로 늘어놓으면 그걸 셀 수가 없다.
  // 정산에서 뺀 지출만 있는 날도 목록에는 나와야 한다. 그날 합계는 뺀 것을 세지 않는다.
  const grouped = useMemo(
    () =>
      [...new Set(visible.map((item) => item.day))].map((day) => {
        const items = visible.filter((item) => item.day === day);
        return { day, amount: spentTotal(items), items };
      }),
    [visible],
  );
  const unit = currencyOf(currency);
  // 금액 칸에서 눌러 더하는 단위. 통화가 원이면 천 단위, 소수를 쓰는 통화면 한 자리 작게 잡는다.
  const quickSteps = unit.fraction > 0 ? [1, 5, 10] : [1000, 5000, 10000];
  // 이 탭 안에서는 늘 여행 통화로 적는다. 원 환산은 합계 옆에만 덧붙인다.
  const show = (amount: number) => money(amount, unit.code);
  /** 목록 한 줄의 몫 표시. "가람 몫" 인데 본인 부담은 그 말 자체가 몫이라 뒤에 붙이지 않는다. */
  const shareMeta = (item: Expense) => {
    const label = shareLabel(item, participants);
    return label === "본인 부담" ? label : `${label} 몫`;
  };
  // 내 줄을 먼저, 나머지는 접어서. 내가 참가자가 아니면 전부 남의 일이다.
  const myTransfers = settlement.transfers.filter(
    (transfer) => transfer.from === me || transfer.to === me,
  );
  const otherTransfers = settlement.transfers.filter(
    (transfer) => transfer.from !== me && transfer.to !== me,
  );
  const [othersOpen, setOthersOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);
  const [paying, setPaying] = useState<Transfer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const openPayment = (transfer: Transfer) => {
    setPaying(transfer);
    // 전액이 기본이다. 대개 한 번에 갚는다.
    setPayAmount(amountText(transfer.amount, unit.fraction));
  };
  const payNumber = parseAmount(payAmount, unit.fraction);
  /** 이 줄이 나온 근거. 낸 돈과 몫, 그리고 대신 받는 경우면 그 사실. */
  const payWhy = (() => {
    if (!paying) return [];
    const lines = [
      `${paying.from}: 낸 돈 ${show(settlement.paid[paying.from] ?? 0)} · 몫 ${show(settlement.owed[paying.from] ?? 0)}`,
      `${paying.to}: 낸 돈 ${show(settlement.paid[paying.to] ?? 0)} · 몫 ${show(settlement.owed[paying.to] ?? 0)}`,
    ];
    const owedDirectly = settlement.direct.some(
      (debt) => debt.from === paying.from && debt.to === paying.to,
    );
    if (!owedDirectly) {
      const real = settlement.direct
        .filter((debt) => debt.from === paying.from)
        .map((debt) => debt.to);
      lines.push(real.length
        ? `${paying.from}${josa(paying.from, "이", "가")} 빌린 건 ${real.join(" · ")}인데, 오갈 횟수를 줄이려고 ${paying.to}${josa(paying.to, "이", "가")} 대신 받아요.`
        : `오갈 횟수를 줄이려고 ${paying.to}${josa(paying.to, "이", "가")} 대신 받아요.`);
    }
    return lines;
  })();
  /**
   * 보낸 기록 한 줄을 적는다. 알림에 되돌리기를 붙인다.
   *
   * 「다 보냈어요」는 한 번 탭으로 확정돼서 잘못 누르면 표 아래 기록 줄을 찾아 들어가야
   * 했다(2026-09-23). 돈 기록이라 묻지 않고 적되, 무를 길을 그 자리에 둔다.
   */
  const 보낸_것_적기 = (from: Participant, to: Participant, amount: number) => {
    const id = newPlaceId();
    setPayments((current) => {
      // 시각은 값을 바꾸는 이 안에서 읽는다. 그리는 중에 시계를 읽으면
      // 같은 그림이 두 번 그려질 때 값이 달라진다.
      const at = Date.now();
      return [...current, { id, from, to, amount, at }];
    });
    notify(`${from}${josa(from, "이", "가")} ${to}에게 ${show(amount)} 보낸 걸로 적었어요`, {
      label: "되돌리기",
      onPress: () => {
        setPayments((current) => current.filter((item) => item.id !== id));
        notify("보낸 기록을 되돌렸어요");
      },
    });
  };
  const savePayment = () => {
    if (!paying || payNumber <= 0) return;
    보낸_것_적기(paying.from, paying.to, Math.min(payNumber, paying.amount));
    setPaying(null);
  };
  /** 한 번에 다 갚는 흔한 경우. 줄의 버튼이 바로 적는다. */
  const recordFull = (transfer: Transfer) => 보낸_것_적기(transfer.from, transfer.to, transfer.amount);
  const undoPayment = (payment: Payment) => {
    const 자리 = payments.findIndex((item) => item.id === payment.id);
    setPayments((current) => current.filter((item) => item.id !== payment.id));
    notify("주고받은 기록을 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        setPayments((current) => 자리에_넣기(current, payment, 자리 < 0 ? current.length : 자리));
        notify("주고받은 기록을 되돌렸어요");
      },
    });
  };
  const toggleSimplify = () => {
    // 묶은 화면이 시키는 대로 보낸 뒤에 방식을 바꾸면, 이미 보낸 돈이 엉뚱한
    // 곳으로 간 게 되고 끝난 일이 되살아난다. 기록을 다 지우면 다시 열린다.
    if (payments.length) {
      notify("주고받은 기록이 있어 바꿀 수 없어요. 기록을 되돌린 뒤 바꿔 주세요");
      return;
    }
    setSimplify((current) => !current);
  };
  /**
   * 단톡방에 그대로 붙일 글.
   *
   * 정산은 앱 안에서 안 끝난다. 결국 누가 단톡방에 옮겨 적어야 하는데, 그걸
   * 손으로 치면 숫자가 틀어진다.
   */
  const copySettlement = async () => {
    const lines = [
      `${tripName} 정산`,
      `총 ${show(settlement.total)} · ${participants.length}명`,
      "",
      ...settlement.transfers.map(
        (transfer) => `${transfer.from} → ${transfer.to} ${show(transfer.amount)}`,
      ),
    ];
    if (!settlement.transfers.length) lines.push("주고받을 게 없어요");
    if (payments.length) {
      lines.push("", `보낸 것 ${payments.length}건`);
      for (const payment of payments) {
        lines.push(`${payment.from} → ${payment.to} ${show(payment.amount)} 완료`);
      }
    }
    await Clipboard.setStringAsync(lines.join("\n"));
    notify("정산 내용을 복사했어요");
  };

  const inWon = (amount: number) => toWon(amount, exchangeRate);
  const foreign = unit.code !== DEFAULT_CURRENCY.code;
  const amountNumber = parseAmount(draftAmount, unit.fraction);
  const budgetNumber = parseAmount(draftBudget, unit.fraction);
  // 이름은 안 적어도 된다. 안 적으면 분류가 이름이 된다. "식비 12,000원" 만으로도
  // 나중에 표를 볼 때 뜻이 통하고, 필수 글자 입력이 하나 줄어든다.
  const formValid = amountNumber > 0;
  const budgetRemaining = budget - settlement.total;
  const budgetProgress = budget > 0 ? settlement.total / budget : 0;
  // 치는 동안 세 자리마다 끊는다. 32,000 과 320,000 은 자릿수가 안 끊기면
  // 눈으로 구별이 안 되고, 돈에서 제일 흔한 실수가 여기서 난다.
  const changeAmount = (text: string) => setDraftAmount(금액_치기(text, unit.fraction));
  const openBudget = () => {
    setDraftBudget(budget ? amountText(budget, unit.fraction) : "");
    setBudgetSheetOpen(true);
  };
  const saveBudget = () => {
    if (!budgetNumber) return;
    setBudget(budgetNumber);
    setBudgetSheetOpen(false);
    notify("여행 예산을 저장했어요");
  };
  /** 예산을 지워 「예산 없음」으로 되돌린다. 0 이면 막대를 아예 내지 않는다. */
  const clearBudget = () => {
    setBudget(0);
    setDraftBudget("");
    setBudgetSheetOpen(false);
    notify("여행 예산을 삭제했어요");
  };

  /**
   * 이 시트에서 고를 수 있는 사람. 참가자 + 이 지출에 이미 적혀 있던 사람.
   *
   * 참가자에서 뺀 사람이 낸 지출이나 그 사람 몫이 있으면 목록 어디에도 이름이 없어,
   * 열어도 고칠 수 없고 저장하면 그 사람 몫이 조용히 사라졌다(2026-09-23). 적혀 있던
   * 사람은 목록 뒤에 붙여 두고, 누가 참가자가 아닌지는 한 줄로 알린다.
   */
  const 시트_사람 = useMemo(() => {
    const 있던_것 = editingId ? expenses.find((item) => item.id === editingId) : undefined;
    const 적힌_사람 = 있던_것 ? [있던_것.payer, ...Object.keys(있던_것.shares ?? {})] : [];
    const 빠진_사람 = [...new Set(적힌_사람.filter((name) => name && !participants.includes(name)))];
    return { 모두: [...participants, ...빠진_사람], 빠진_사람 };
  }, [editingId, expenses, participants]);

  // 고른 방식을 저장 모양(비중)으로 옮긴다. 계산은 한 가지 방식만 알면 된다.
  const draftShares = ((): Record<Participant, number> | undefined => {
    if (draftSplitMode === "균등") return undefined;
    if (draftSplitMode === "본인") return { [draftPayer]: 1 };
    if (draftSplitMode === "일부") {
      if (!draftPeople.length) return undefined;
      return Object.fromEntries(draftPeople.map((person) => [person, 1]));
    }
    const entries = 시트_사람.모두
      .map((person) => [person, parseAmount(draftAmounts[person] ?? "", unit.fraction)] as const)
      .filter(([, value]) => value > 0);
    return entries.length ? Object.fromEntries(entries) : undefined;
  })();
  const quickNumber = parseAmount(quickAmount, unit.fraction);
  const quickPayer = participants.includes(lastPayer) ? lastPayer : participants[0] ?? "";
  // 금액을 직접 적을 때 아직 안 채운 돈. 0 이 돼야 저장할 수 있다.
  const draftAmountLeft = amountNumber - 시트_사람.모두.reduce(
    (sum, person) => sum + parseAmount(draftAmounts[person] ?? "", unit.fraction),
    0,
  );
  // 저장을 막는 이유를 하나만 고른다. 여러 줄을 한꺼번에 띄우면 뭘 고쳐야
  // 하는지 더 헷갈린다.
  const splitHint = !formValid
    ? "금액을 입력해 주세요"
    : draftSplitMode === "일부" && !draftPeople.length
      ? "몫을 질 사람을 한 명은 골라 주세요"
      : draftSplitMode === "금액" && draftAmountLeft !== 0
        ? (draftAmountLeft > 0 ? `아직 ${show(draftAmountLeft)} 남았어요` : `${show(-draftAmountLeft)} 넘었어요`)
        : undefined;
  const draftPayerHint = participants.length > 1
    ? `${quickPayer}${josa(quickPayer, "이", "가")} 내고 ${participants.length}명이 똑같이 나눠요`
    : `${quickPayer}${josa(quickPayer, "이", "가")} 냈어요`;
  const addQuickExpense = () => {
    if (!quickNumber) return;
    setExpenses((current) => [
      ...current,
      {
        id: newPlaceId(),
        // 빠르게 적는 건 지금 쓴 돈이다. 여행 중이면 오늘, 아니면 첫날이다.
        day: todayDay || dayOptions[0] || "",
        title: quickCategory,
        amount: quickNumber,
        category: quickCategory,
        payer: participants.includes(lastPayer) ? lastPayer : participants[0] ?? "",
        memo: "",
      },
    ]);
    setQuickAmount("");
    setLastCategory(quickCategory);
    notify(`지출을 추가했어요 · ${quickCategory} ${money(quickNumber, unit.code)}`);
  };
  /** 나누는 자리를 기본값으로. 전원이 똑같이 나누는 게 가장 흔하다. */
  const resetSplit = () => {
    setDraftSplitMode("균등");
    setDraftPeople(participants);
    setDraftAmounts({});
  };
  /**
   * 저장된 지출을 고칠 때, 적었던 방식 그대로 다시 연다.
   *
   * 방식은 `splitModeOf` 가 비중 모양까지 보고 정한다. 서버는 「본인 부담」을 모르고
   * 낸 사람 혼자 몫인 「일부」로 돌려주는데, 그걸 그대로 열면 헷갈린다.
   */
  const loadSplit = (item: Expense) => {
    const shares = item.shares ?? {};
    const picked = Object.keys(shares);
    const mode = splitModeOf(item);
    setDraftSplitMode(mode);
    setDraftPeople(picked.length ? picked : participants);
    setDraftAmounts(mode === "금액"
      ? Object.fromEntries(picked.map((person) => [person, amountText(shares[person], unit.fraction)]))
      : {});
  };
  const openCreate = () => {
    setEditingId(null);
    setDraftTitle("");
    setDraftAmount("");
    setDraftCategory(lastCategory);
    setDraftPayer(participants.includes(lastPayer) ? lastPayer : participants[0] ?? "");
    resetSplit();
    // 날짜를 거르고 있으면 그 날, 아니면 오늘, 여행 기간이 아니면 첫날이다.
    setDraftDay(dayFilter === "전체" ? todayDay || dayOptions[0] || "" : dayFilter);
    setDraftMemo("");
    setDraftReceipt("");
    setDraftExcluded(false);
    setExtrasOpen(false);
    setSheetOpen(true);
  };
  /** 비용 탭이 스크롤 내용에서 놓인 자리, 그리고 그 안에서 「지출 내역」이 놓인 자리. */
  const 비용_맨위 = useRef(0);
  const 내역_자리 = useRef(0);
  // 떠 있는 ＋ 단추는 스크롤 바깥(화면에 고정된 자리)에 있다. 여는 길만 밖으로 내준다.
  // 값이 아니라 함수라 렌더마다 다시 담아야 지금 상태를 보고 연다.
  useEffect(() => {
    if (!addRef) return;
    addRef.current = openCreate;
    return () => {
      addRef.current = null;
    };
  });
  const openEdit = (item: Expense) => {
    setEditingId(item.id);
    setDraftTitle(item.title);
    setDraftAmount(amountText(item.amount, unit.fraction));
    setDraftCategory(item.category);
    setDraftPayer(item.payer);
    loadSplit(item);
    setDraftDay(item.day);
    setDraftMemo(item.memo);
    setDraftReceipt(item.receiptUri ?? "");
    setDraftExcluded(Boolean(item.excluded));
    // 기본값과 다른 지출을 고칠 때는 그 자리를 바로 보여준다.
    setExtrasOpen(Boolean(item.memo || item.receiptUri));
    setSheetOpen(true);
  };
  const saveExpense = () => {
    if (!formValid) return;
    setExpenses((current) => {
      // 새 번호는 값을 바꾸는 이 안에서 만든다. 그려지는 중에 시계를 읽으면
      // 같은 그림이 두 번 그려질 때 번호가 달라진다.
      const next: Expense = {
        id: editingId ?? newPlaceId(),
        day: draftDay,
        title: draftTitle.trim() || draftCategory,
        amount: amountNumber,
        category: draftCategory,
        payer: draftPayer,
        shares: draftShares,
        splitMode: draftSplitMode,
        memo: draftMemo.trim(),
        receiptUri: draftReceipt || undefined,
        ...(draftExcluded ? { excluded: true } : {}),
        ...(() => {
          const before = current.find((item) => item.id === editingId);
          return {
            // 영수증을 그대로 두었으면 올린 사진 id 도 그대로다. 바꾸거나 떼면 새로 올린다.
            ...(draftReceipt && before?.receiptPhotoId && before.receiptUri === draftReceipt
              ? { receiptPhotoId: before.receiptPhotoId }
              : {}),
            // 교통편에서 만든 지출이라는 표시는 고쳐도 남는다. 없어지면 그 교통편을 다시
            // 저장할 때 지출이 하나 더 생긴다.
            ...(before?.transportId ? { transportId: before.transportId } : {}),
          };
        })(),
      };
      return editingId
        ? current.map((item) => (item.id === editingId ? next : item))
        : [...current, next];
    });
    setLastCategory(draftCategory);
    setLastPayer(draftPayer);
    setSheetOpen(false);
    notify(editingId ? "지출을 수정했어요" : "지출을 추가했어요");
  };
  const deleteExpense = () => {
    const 자리 = expenses.findIndex((item) => item.id === editingId);
    if (자리 < 0) return;
    const target = expenses[자리];
    setExpenses((current) => current.filter((item) => item.id !== target.id));
    setSheetOpen(false);
    notify("지출을 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        setExpenses((current) => 자리에_넣기(current, target, 자리));
        notify("지출을 되돌렸어요");
      },
    });
  };
  const chooseReceipt = async () => {
    // 시스템 사진 선택 창은 권한 없이 고른 사진만 앱에 준다(iOS PHPicker, Android Photo Picker).
    // 사진 전체 접근을 묻지 않는다(docs/development/08-privacy-and-release-compliance.md 5장).
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        // 사진과 같은 까닭으로 HEIC 를 JPEG 으로 받는다.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        base64: Platform.OS === "web",
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const picked = Platform.OS === "web" && asset.base64
        ? await shrinkForWeb(`data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`)
        : asset.uri;
      setDraftReceipt(await keepTripPhoto(picked));
    } catch {
      notify("영수증을 불러오지 못했어요");
    }
  };
  const openPeople = () => {
    setDraftParticipants(participants);
    setPeopleSheetOpen(true);
  };
  const savePeople = async () => {
    // 공간 멤버 순서를 지킨다. 뺐다 다시 넣었다고 목록 맨 뒤로 가면 화면마다
    // 사람 순서가 달라진다.
    const ordered = spaceMembers.filter((person) => draftParticipants.includes(person));
    const extra = draftParticipants.filter((person) => !spaceMembers.includes(person));
    const next = [...ordered, ...extra];
    if (!(await saveParticipants(next))) return;
    setPeopleSheetOpen(false);
    notify(`참가자 ${next.length}명으로 저장했어요`);
  };
  const openCurrency = () => {
    setDraftCurrency(currency);
    setDraftRate(exchangeRate === 1 ? "" : amountText(exchangeRate, 2));
    setCurrencySheetOpen(true);
  };
  const saveCurrency = () => {
    // 원으로 돌아오면 환율은 늘 1 이다. 따로 적게 하면 틀릴 자리만 는다.
    const nextRate = draftCurrency === DEFAULT_CURRENCY.code
      ? 1
      : Math.max(0.0001, parseAmount(draftRate, 2) || 1);
    const 통화가_바뀜 = draftCurrency !== currency;
    const 적용 = () => {
      // 예산은 여행 통화로 적은 값이다. 통화만 바꾸고 숫자를 그대로 두면
      // 50만 원 예산이 50만 달러가 된다. 원을 거쳐 옮긴다.
      if (통화가_바뀜) {
        setBudget((current) => Math.max(0, Math.round((current * exchangeRate) / nextRate)));
      }
      setCurrency(draftCurrency);
      setExchangeRate(nextRate);
      setCurrencySheetOpen(false);
      notify("여행 통화를 저장했어요");
    };
    // 이미 적어 둔 지출은 숫자가 그대로 남는다. 12,000 원이 12,000 달러가 되는 셈이라
    // 정산·표·홈 요약이 전부 틀리는데 조용히 지나갔다(2026-09-23). 한꺼번에 환산하는
    // 것은 되돌릴 수 없어 하지 않고, 무슨 일이 일어나는지만 분명히 묻는다.
    if (통화가_바뀜 && expenses.length) {
      showAlert(
        "통화를 바꿀까요?",
        `이미 적어 둔 지출 ${expenses.length}건은 숫자가 그대로 남고 단위만 바뀌어요.`
        + ` ${money(12000, currency)} 는 ${money(12000, draftCurrency)} 가 돼요.`
        + " 예산은 환율로 환산해요.",
        [{ text: "취소", style: "cancel" }, { text: "바꾸기", onPress: 적용 }],
      );
      return;
    }
    적용();
  };
  const exportCsv = async () => {
    if (!expenses.length) {
      notify("저장할 지출이 없어요");
      return;
    }
    const csv = expensesToCsv(tripName, sorted, participants, unit.code, exchangeRate);
    try {
      // 공유를 못 하는 곳에서는 표를 클립보드에 담는다. 스프레드시트에 그대로
      // 붙여넣으면 같은 표가 된다.
      if ((await shareExpenseCsv(`${tripName} 비용`, csv)) === "unavailable") {
        await Clipboard.setStringAsync(csv);
        notify("표를 복사했어요. 스프레드시트에 붙여넣어 주세요");
      }
    } catch {
      notify("지출 표를 저장하지 못했어요");
    }
  };

  return (
    <View
      onLayout={(event) => {
        비용_맨위.current = event.nativeEvent.layout.y;
      }}
    >
      {/* 맨 위 「지출 N건」 제목줄은 뺐다. 탭 이름이 이미 「비용」이고 탭 줄에
          건수까지 찍히는데, 같은 말을 한 번 더 하고 아래 「지출 내역」과도
          겹쳤다. 그 줄에 있던 지출 추가 버튼은 목록 제목 옆으로 내렸다. */}
      <MoneyBlock title="총 지출" action={canEdit ? (budget > 0 ? "예산 수정" : "예산 정하기") : undefined} onAction={openBudget}>
        <View style={styles.moneyTotalRow}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.moneyTotal, styles.moneyTotalShrink, theme && { color: theme.text }]}>
            {show(settlement.total)}
          </Text>
          {/* 지출 내역은 총 지출·정산·분류별 아래라 한참 내려가야 나온다. 쓴 돈을
              보다가 무엇에 썼는지 궁금해지는 자리가 여기라, 금액 바로 옆에 길을 낸다. */}
          {expenses.length > 0 && scrollToY && (
            <Pressable
              onPress={() => scrollToY(비용_맨위.current + 내역_자리.current)}
              accessibilityRole="button"
              accessibilityLabel={`지출 내역 ${expenses.length}건으로 바로 가기`}
              hitSlop={글자누름여유}
              style={({ pressed }) => [styles.moneyJump, pressed && 공용스타일.controlPressed]}
            >
              <Text style={[styles.moneyJumpText, theme && { color: theme.primary }]}>내역 {expenses.length}건</Text>
              <Glyph name="chevronDown" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} weight={2.4} />
            </Pressable>
          )}
        </View>
        <View style={styles.moneyCurrencyRow}>
          {/* 글자만 두면 누를 수 있는 줄 모른다. 테두리와 화살표를 줘서 고르는
              칸이라는 걸 보이게 한다. 자리는 늘 왼쪽으로 고정한다. */}
          <Pressable
            onPress={openCurrency}
            disabled={!canEdit}
            accessibilityRole="button"
            accessibilityLabel={`여행 통화 ${unit.code} ${unit.label}, 눌러서 바꾸기`}
            style={({ pressed }) => [
              styles.moneyCurrencyChip,
              theme && { borderColor: theme.primary, backgroundColor: theme.primarySoft },
              pressed && 공용스타일.controlPressed,
            ]}
          >
            <Text style={[styles.moneyCurrencyLabel, theme && { color: theme.muted }]}>통화</Text>
            <Text style={[styles.moneyCurrencyValue, theme && { color: theme.primary }]}>
              {unit.code === DEFAULT_CURRENCY.code
                ? "원"
                : `${unit.code} · ${amountText(exchangeRate, 2)}원`}
            </Text>
            {canEdit && <Glyph name="chevronDown" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />}
          </Pressable>
          {/* 누구끼리 나누는지가 정산의 전제다. 공간 멤버가 여럿이면 이번
              여행에 누가 갔는지부터 맞아야 아래 숫자가 뜻을 갖는다. */}
          <Pressable
            onPress={openPeople}
            disabled={!canEdit}
            accessibilityRole="button"
            accessibilityLabel={`이번 여행 참가자 ${participants.length}명, 눌러서 바꾸기`}
            style={({ pressed }) => [
              styles.moneyCurrencyChip,
              theme && { borderColor: theme.primary, backgroundColor: theme.primarySoft },
              pressed && 공용스타일.controlPressed,
            ]}
          >
            <Text style={[styles.moneyCurrencyLabel, theme && { color: theme.muted }]}>참가자</Text>
            <Text numberOfLines={1} style={[styles.moneyCurrencyValue, theme && { color: theme.primary }]}>
              {participants.length}명
            </Text>
            {canEdit && <Glyph name="chevronDown" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />}
          </Pressable>
          {/* 원이 아닐 때만 환산을 낸다. 원이면 같은 숫자를 두 번 보여줄 뿐이다. */}
          {foreign && (
            <Text style={[styles.moneyConverted, theme && { color: theme.muted }]}>
              약 {won(inWon(settlement.total))}원
            </Text>
          )}
        </View>
        {/* 예산을 정한 여행에만 막대를 낸다. 정하지 않았는데 막대가 뜨면 어디서 온
            숫자인지 알 수 없고, 0% 막대는 아직 아무것도 안 쓴 것처럼 읽힌다. */}
        {budget > 0 ? (<>
          <View style={[styles.moneyBudgetTrack, theme && { backgroundColor: theme.surfaceAlt }]}>
            <View
              style={[
                styles.moneyBudgetFill,
                { width: `${Math.min(100, budgetProgress * 100)}%` },
                theme && { backgroundColor: budgetRemaining < 0 ? (theme.dark ? statusColor.danger.dark : statusColor.danger.light) : theme.primary },
              ]}
            />
          </View>
          <View style={styles.moneyBudgetFoot}>
            <Text style={[styles.moneyBudgetStatus, theme && { color: budgetRemaining < 0 ? (theme.dark ? statusColor.danger.dark : statusColor.danger.light) : theme.muted }]}>
              {budgetRemaining < 0 ? `${show(Math.abs(budgetRemaining))} 초과` : `${show(budgetRemaining)} 남음`}
            </Text>
            <Text style={[styles.moneyBudgetPercent, theme && { color: theme.muted }]}>{Math.round(budgetProgress * 100)}%</Text>
          </View>
        </>) : canEdit ? (
          <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
            예산을 정하면 얼마나 썼는지 막대로 보여 줘요
          </Text>
        ) : null}
      </MoneyBlock>
      {/* 결국 이걸 보려고 들어온다. 합계 바로 다음에 두고, 예산과 사람별
          숫자는 그 뒤로 미룬다.

          "나" 로 먼저 말한다. 전체 조망만 있으면 여러 줄 중 내 줄을 눈으로
          찾아야 하고, 정작 내가 할 일이 뭔지는 맨 나중에 안다. */}
      <MoneyBlock
        title="정산"
        action={canEdit && settlement.transfers.length > 1 ? (simplify ? "원래대로" : "송금 줄이기") : undefined}
        onAction={toggleSimplify}
      >
        <View style={styles.moneySettleBlock}>
          {myTransfers.map((transfer) => {
            const iSend = transfer.from === me;
            const other = iSend ? transfer.to : transfer.from;
            return (
              <Pressable
                key={`${transfer.from}-${transfer.to}`}
                onPress={() => openPayment(transfer)}
                accessibilityRole="button"
                accessibilityLabel={`${other}에게 ${iSend ? "보낼" : "받을"} 돈 ${show(transfer.amount)}, 눌러서 왜 그런지 보거나 일부만 적기`}
                style={({ pressed }) => [
                  styles.moneySettle,
                  theme && { backgroundColor: theme.primarySoft },
                  pressed && 공용스타일.controlPressed,
                ]}
              >
                <View style={styles.moneySettleCopy}>
                  <Text style={[styles.moneySettleWho, theme && { color: theme.muted }]}>
                    {iSend ? "내가 보낼 돈" : "내가 받을 돈"}
                  </Text>
                  <Text numberOfLines={1} style={[styles.moneySettleText, theme && { color: theme.primary }]}>
                    {other}{iSend ? "에게" : "에게서"}
                  </Text>
                </View>
                <Text style={[styles.moneySettleAmount, theme && { color: theme.primary }]}>{show(transfer.amount)}</Text>
                {canEdit && (
                <Pressable
                  onPress={() => recordFull(transfer)}
                  accessibilityRole="button"
                  accessibilityLabel={`${other}에게 ${show(transfer.amount)} ${iSend ? "다 보냈어요" : "다 받았어요"}`}
                  hitSlop={누름여유(높이.칩)}
                  style={({ pressed }) => [
                    styles.moneySettleDone,
                    theme && { backgroundColor: theme.primary },
                    pressed && 공용스타일.controlPressed,
                  ]}
                >
                  <Text style={[styles.moneySettleDoneText, theme && { color: onAccent(theme.dark) }]}>
                    {iSend ? "보냈어요" : "받았어요"}
                  </Text>
                </Pressable>
                )}
              </Pressable>
            );
          })}
          {!myTransfers.length && (
            <View style={[styles.moneySettle, theme && { backgroundColor: theme.primarySoft }]}>
              <Text style={[styles.moneySettleText, theme && { color: theme.primary }]}>
                {!expenses.length
                  ? "지출을 적으면 여기서 정산해요"
                  : otherTransfers.length
                    ? "내가 주고받을 건 없어요"
                    : "서로 줄 것도 받을 것도 없어요"}
              </Text>
            </View>
          )}
          {/* 나머지는 남의 일이라 접어 둔다. 그래도 전체가 맞는지 보고 싶을
              때가 있어서 없애지는 않는다. */}
          {otherTransfers.length > 0 && (
            <Pressable
              onPress={() => setOthersOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityState={{ expanded: othersOpen }}
              style={styles.moneyOthersHead}
            >
              <Text style={[styles.moneyOthersLabel, theme && { color: theme.muted }]}>
                다른 사람들끼리 {otherTransfers.length}건
              </Text>
              <Glyph name={othersOpen ? "chevronDown" : "chevronRight"} size={아이콘.작게} color={theme?.muted ?? "#646C7A"} />
            </Pressable>
          )}
          {othersOpen && otherTransfers.map((transfer) => (
            <Pressable
              key={`${transfer.from}-${transfer.to}`}
              onPress={() => openPayment(transfer)}
              accessibilityRole="button"
              accessibilityLabel={`${transfer.from}${josa(transfer.from, "이", "가")} ${transfer.to}에게 ${show(transfer.amount)}, 눌러서 자세히`}
              style={({ pressed }) => [
                styles.moneyOtherRow,
                theme && { borderColor: theme.border },
                pressed && 공용스타일.controlPressed,
              ]}
            >
              <Text numberOfLines={1} style={[styles.moneyOtherText, theme && { color: theme.text }]}>
                {transfer.from}{josa(transfer.from, "이", "가")} {transfer.to}에게
              </Text>
              <Text style={[styles.moneyOtherAmount, theme && { color: theme.text }]}>{show(transfer.amount)}</Text>
            </Pressable>
          ))}
          {/* 보냈다고 적어 둔 것. 지우면 잔액이 되살아난다. */}
          {payments.length > 0 && (
            <Pressable
              onPress={() => setDoneOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityState={{ expanded: doneOpen }}
              style={styles.moneyOthersHead}
            >
              <Text style={[styles.moneyOthersLabel, theme && { color: theme.muted }]}>
                주고받은 것 {payments.length}건
              </Text>
              <Glyph name={doneOpen ? "chevronDown" : "chevronRight"} size={아이콘.작게} color={theme?.muted ?? "#646C7A"} />
            </Pressable>
          )}
          {doneOpen && [...payments].reverse().map((payment) => (
            <View key={payment.id} style={[styles.moneyOtherRow, theme && { borderColor: theme.border }]}>
              <Text numberOfLines={1} style={[styles.moneyOtherText, theme && { color: theme.muted }]}>
                {payment.from}{josa(payment.from, "이", "가")} {payment.to}에게 {show(payment.amount)}
              </Text>
              {canEdit && (
              <Pressable
                onPress={() => undoPayment(payment)}
                hitSlop={글자누름여유}
                accessibilityRole="button"
                accessibilityLabel={`${payment.from}에서 ${payment.to}에게 보낸 ${show(payment.amount)} 되돌리기`}
              >
                <Text style={[styles.moneyOtherUndo, theme && { color: theme.primary }]}>되돌리기</Text>
              </Pressable>
              )}
            </View>
          ))}
          {(settlement.transfers.length > 0 || payments.length > 0) && (
            <Pressable
              onPress={copySettlement}
              accessibilityRole="button"
              accessibilityLabel="정산 내용 복사"
              style={({ pressed }) => [
                styles.moneySettleCopyButton,
                theme && { borderColor: theme.border },
                pressed && 공용스타일.controlPressed,
              ]}
            >
              <Text style={[styles.moneySettleCopyText, theme && { color: theme.primary }]}>정산 내용 복사</Text>
            </Pressable>
          )}
          {/* 낸 돈과 내야 할 돈. 정산이 어디서 나왔는지의 근거라 여기 둔다.
              사람 수만큼 가로로 나누면 넷만 돼도 숫자가 잘려서 아무것도 못
              읽는다. 세로로 쌓고 머리글을 한 번만 단다. */}
          <Pressable
            onPress={() => setPaidOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: paidOpen }}
            style={styles.moneyOthersHead}
          >
            <Text style={[styles.moneyOthersLabel, theme && { color: theme.muted }]}>
              낸 돈 · {paidRows.length}명
            </Text>
            <Glyph name={paidOpen ? "chevronDown" : "chevronRight"} size={아이콘.작게} color={theme?.muted ?? "#646C7A"} />
          </Pressable>
        </View>
        {paidOpen && (
        <View style={styles.moneyPaidTable}>
          <View style={styles.moneyPaidHead}>
            <Text style={[styles.moneyPaidHeadName, theme && { color: theme.muted }]}>참가자</Text>
            <Text style={[styles.moneyPaidHeadCell, theme && { color: theme.muted }]}>낸 돈</Text>
            <Text style={[styles.moneyPaidHeadCell, theme && { color: theme.muted }]}>내야 할 돈</Text>
          </View>
          {paidRows.map((row) => (
            <View
              key={row.person}
              style={[styles.moneyPaidRow, theme && { borderTopColor: theme.border }]}
            >
              <View style={styles.moneyPaidNameBox}>
                <Text numberOfLines={1} style={[styles.moneyPaidName, theme && { color: theme.text }]}>{row.person}</Text>
                {/* 참가자에서 뺐는데 낸 돈이 남아 있으면 아래 정산에 이름만
                    튀어나온다. 어디서 나온 금액인지 알아볼 수 있게 표시한다. */}
                {!row.joined && (
                  <Text style={[styles.moneyPaidGuest, theme && { color: theme.muted }]}>참가자 아님</Text>
                )}
              </View>
              <Text numberOfLines={1} style={[styles.moneyPaidCell, theme && { color: theme.text }]}>{show(row.paid)}</Text>
              <Text numberOfLines={1} style={[styles.moneyPaidCell, theme && { color: theme.muted }]}>{show(row.owed)}</Text>
            </View>
          ))}
        </View>
        )}
      </MoneyBlock>
      {/* 요약 바로 아래에 둔다. 탭을 열자마자 손이 닿는 자리다. */}
      {canEdit && (
      <MoneyBlock title="빠른 추가">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAddChips}>
          {EXPENSE_CATEGORIES.map((item) => {
            const active = quickCategory === item;
            return (
              <Chip
                key={item}
                theme={theme ?? undefined}
                label={item}
                on={active}
                onPress={() => setQuickCategory(item)}
              />
            );
          })}
        </ScrollView>
        <View style={styles.quickAddRow}>
          <TextInput
            accessibilityLabel={`${quickCategory} 금액`}
            value={quickAmount}
            onChangeText={(text) => setQuickAmount(금액_치기(text, unit.fraction))}
            keyboardType={금액_키보드(unit.fraction)}
            placeholder={`${quickCategory} 얼마 썼나요`}
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[styles.quickAddInput, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
          />
          <Pressable
            onPress={addQuickExpense}
            disabled={!quickNumber}
            accessibilityRole="button"
            accessibilityLabel={`${quickCategory} 지출 추가`}
            accessibilityState={{ disabled: !quickNumber }}
            style={({ pressed }) => [
              styles.quickAddButton,
              theme && { backgroundColor: quickNumber ? theme.primary : theme.surfaceAlt },
              pressed && quickNumber > 0 && 공용스타일.controlPressed,
            ]}
          >
            <Glyph name="plus" size={아이콘.보통} color={quickNumber ? "#FFFFFF" : theme?.muted ?? "#9AA1AE"} weight={2.6} />
            <Text style={[styles.quickAddButtonText, { color: quickNumber ? "#FFFFFF" : theme?.muted ?? "#9AA1AE" }]}>추가</Text>
          </Pressable>
        </View>
        <Text style={[styles.quickAddHint, theme && { color: theme.muted }]}>
          {draftPayerHint} · 자세히 적으려면 ＋ 지출 추가를 눌러 주세요
        </Text>
      </MoneyBlock>
      )}
      {expenses.length > 0 && (
        <MoneyBlock title="분류별 지출" meta={`${byDay.length}일`}>
          <View style={styles.moneyInsightGrid}>
            <View style={styles.moneyInsightItem}>
              <Text style={[styles.moneyInsightLabel, theme && { color: theme.muted }]}>쓴 날 하루 평균</Text>
              <Text style={[styles.moneyInsightValue, theme && { color: theme.text }]}>{show(averagePerSpendingDay)}</Text>
            </View>
            <View style={[styles.moneyInsightItem, styles.moneyInsightDivider, theme && { borderLeftColor: theme.border }]}>
              <Text style={[styles.moneyInsightLabel, theme && { color: theme.muted }]}>가장 많이 쓴 날</Text>
              <Text numberOfLines={1} style={[styles.moneyInsightValue, theme && { color: theme.text }]}>{topDay ? dayTextOf(topDay.day) : "-"}</Text>
              <Text style={[styles.moneyInsightMeta, theme && { color: theme.muted }]}>{topDay ? `${show(topDay.amount)}` : ""}</Text>
            </View>
            <View style={[styles.moneyInsightItem, styles.moneyInsightDivider, theme && { borderLeftColor: theme.border }]}>
              <Text style={[styles.moneyInsightLabel, theme && { color: theme.muted }]}>가장 큰 지출</Text>
              <Text numberOfLines={1} style={[styles.moneyInsightValue, theme && { color: theme.text }]}>{byCategory[0]?.category ?? "-"}</Text>
              <Text style={[styles.moneyInsightMeta, theme && { color: theme.muted }]}>{byCategory[0] ? `${show(byCategory[0].amount)}` : ""}</Text>
            </View>
          </View>
          <View style={styles.moneyCategoryCard}>
            {byCategory.map((row) => {
              const active = categoryFilter === row.category;
              return (
              <Pressable
                key={row.category}
                onPress={() => setCategoryFilter(active ? "전체" : row.category)}
                accessibilityRole="button"
                accessibilityLabel={`${row.category} 지출 ${show(row.amount)} 내역 보기`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.moneyCategoryRow,
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text style={[styles.moneyCategoryName, theme && { color: theme.text }]}>{row.category}</Text>
                {/* 막대는 전체 대비다. 1등 대비로 그리면 가장 많이 쓴 분류가
                    늘 꽉 차서 전부 쓴 것처럼 보인다. */}
                <View style={[styles.moneyBarTrack, theme && { backgroundColor: theme.surfaceAlt }]}>
                  <View
                    style={[
                      styles.moneyBarFill,
                      { width: `${settlement.total ? Math.max(2, (row.amount / settlement.total) * 100) : 0}%` },
                      theme && { backgroundColor: theme.primary },
                    ]}
                  />
                </View>
                <Text style={[styles.moneyCategoryAmount, theme && { color: theme.muted }]}>{show(row.amount)}</Text>
                <Text style={[styles.moneyCategoryPercent, theme && { color: theme.muted }]}>
                  {settlement.total ? Math.round((row.amount / settlement.total) * 100) : 0}%
                </Text>
              </Pressable>
            );})}
            <Text style={[styles.moneyCategoryHint, theme && { color: theme.muted }]}>분류를 누르면 해당 내역만 볼 수 있어요</Text>
          </View>
        </MoneyBlock>
      )}
      {/* 지출을 더하는 자리는 목록 바로 위다. 제목·건수·버튼이 모두 이 목록
          하나를 가리킨다. */}
      <View
        style={공용스타일.tabActionHeader}
        onLayout={(event) => {
          내역_자리.current = event.nativeEvent.layout.y;
        }}
      >
        <View style={공용스타일.tabActionTitleRow}>
          <Text style={[공용스타일.sectionTitle, theme && { color: theme.text }]}>
            {categoryFilter === "전체" ? "지출 내역" : `${categoryFilter} 지출`}
          </Text>
          <Text style={[공용스타일.tabActionCount, theme && { color: theme.muted, backgroundColor: theme.surfaceAlt }]}>
            {dayFilter === "전체" && categoryFilter === "전체" ? `${sorted.length}건` : `${visible.length}건`}
          </Text>
        </View>
        <View style={styles.moneyListHeadActions}>
          {categoryFilter !== "전체" && (
            <Pressable
              onPress={() => setCategoryFilter("전체")}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="전체 보기"
              style={공용스타일.sectionActionHit}
            >
              <View style={공용스타일.sectionActionRow}>
                <Text style={[공용스타일.sectionAction, theme && { color: theme.primary }]}>전체 보기</Text>
                <Glyph name="arrowRight" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />
              </View>
            </Pressable>
          )}
          {/* 적는 길은 떠 있는 ＋ 단추 하나다. 이 자리에도 같은 단추를 두면 한
              화면에 「지출 추가」가 둘이라, 지출이 없을 때는 빈 화면의 단추까지
              셋이 됐다. 버튼이 없는 까닭은 여기서 한 줄로 알린다. */}
          {!canEdit && (
            <Text style={[공용스타일.tabActionReadOnly, theme && { color: theme.muted }]}>보기 전용 공간이에요</Text>
          )}
        </View>
      </View>
      {/* 며칠 치가 쌓였을 때만 날짜로 거른다. 몇 건 안 되면 칩이 목록보다 크다. */}
      {expenses.length > 5 && usedDays.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moneyDayRow}>
          {["전체", ...usedDays].map((day) => {
            const active = dayFilter === day;
            return (
              <Chip
                key={day}
                theme={theme ?? undefined}
                label={dayTextOf(day)}
                on={active}
                onPress={() => setDayFilter(day)}
              />
            );
          })}
        </ScrollView>
      )}
      <View style={styles.moneyList}>
        {grouped.map((group) => (
          <View key={group.day} style={styles.moneyGroup}>
            <View style={styles.moneyGroupHead}>
              <Text style={[styles.moneyGroupDay, theme && { color: theme.text }]}>{dayTextOf(group.day)}</Text>
              <Text style={[styles.moneyGroupTotal, theme && { color: theme.muted }]}>{show(group.amount)}</Text>
            </View>
            {group.items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => openEdit(item)}
                accessibilityRole="button"
                accessibilityLabel={`${dayTextOf(group.day)} ${item.title} ${show(item.amount)}${item.excluded ? " 정산 제외" : ""} 수정`}
                style={({ pressed }) => [
                  styles.moneyRow,
                  theme && { backgroundColor: theme.surface, borderColor: theme.border },
                  // 정산에서 뺀 줄은 흐리게. 지운 게 아니라 셈에서만 빠진 것이다.
                  item.excluded && styles.moneyRowExcluded,
                  pressed && 공용스타일.packingCardPressed,
                ]}
              >
                <View style={styles.moneyRowBody}>
                  <Text numberOfLines={1} style={[styles.moneyRowTitle, theme && { color: theme.text }]}>{item.title}</Text>
                  <Text numberOfLines={1} style={[styles.moneyRowMeta, theme && { color: theme.muted }]}>
                    {/* 빠르게 적은 지출은 이름이 분류와 같다. 같은 낱말을 두 번
                        보여 줄 이유가 없다. */}
                    {item.excluded ? "정산 제외 · " : ""}
                    {item.title === item.category ? "" : `${item.category} · `}
                    {item.payer}{josa(item.payer, "이", "가")} 냄
                    {item.shares ? ` · ${shareMeta(item)}` : ""}
                    {item.receiptUri ? " · 영수증" : ""}
                  </Text>
                  <SyncMark id={item.id} />
                </View>
                <Text style={[styles.moneyRowAmount, theme && { color: theme.text }]}>{show(item.amount)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      {visible.length === 0 && (
        <EmptyState
          title={expenses.length === 0 ? "아직 지출이 없어요" : "이날은 지출이 없어요"}
          description={
            expenses.length === 0
              ? "지출을 적어 두면 여행이 끝나고 한 번에 정산할 수 있어요."
              : "다른 날을 보거나 전체로 돌아가 보세요."
          }
          action={expenses.length === 0 ? "지출 추가" : "전체 보기"}
          onPress={expenses.length === 0 && !canEdit ? undefined : () => {
            if (expenses.length === 0) openCreate();
            else { setDayFilter("전체"); setCategoryFilter("전체"); }
          }}
        />
      )}
      {expenses.length > 0 && (
        <Pressable
          onPress={exportCsv}
          accessibilityRole="button"
          accessibilityLabel="지출 내역을 엑셀 파일로 저장"
          style={[styles.moneyExport, theme && { borderColor: theme.border, backgroundColor: theme.surface }]}
        >
          <View>
            <Text style={[styles.moneyExportTitle, theme && { color: theme.text }]}>엑셀 파일로 저장</Text>
            <Text style={[styles.moneyExportHint, theme && { color: theme.muted }]}>
              지출 {expenses.length}건과 정산을 표로 만들어 저장해요
            </Text>
          </View>
          <Glyph name="arrowRight" size={아이콘.보통} color={theme?.primary ?? "#3F4C8F"} />
        </Pressable>
      )}
      <DetailSheet
        visible={sheetOpen}
        title={editingId ? "지출 수정" : "지출 추가"}
        subtitle="항목과 금액만 적어도 저장돼요"
        submit={editingId ? "저장" : "지출 추가"}
        disabledHint={splitHint}
        submitDisabled={!formValid || Boolean(splitHint)}
        destructiveLabel={editingId ? "지출 삭제" : undefined}
        destructiveMessage={editingId ? `${draftTitle || "이 지출"} 내역을 삭제해요.` : undefined}
        hasUnsavedChanges={expenseDraftChanged}
        onClose={() => setSheetOpen(false)}
        onSubmit={saveExpense}
        onDestructive={deleteExpense}
      >
        <DetailField
          label="항목 (선택)"
          value={draftTitle}
          onChangeText={setDraftTitle}
          placeholder="예: 점심"
        />
        <DetailField
          label="금액"
          required
          value={draftAmount}
          onChangeText={changeAmount}
          placeholder="예: 32,000"
          keyboardType={금액_키보드(unit.fraction)}
        />
        {/* 0 을 여러 번 치는 대신 눌러서 더한다. 엄지로 적을 때 훨씬 빠르다. */}
        <View style={styles.amountSteps}>
          {quickSteps.map((step) => (
            <Pressable
              key={step}
              // 지금 값에서 더한다. 빠르게 두 번 누르면 앞의 결과가 아직 화면에
              // 반영되기 전이라, 밖에서 읽은 값으로 더하면 첫 번째가 사라진다.
              onPress={() => setDraftAmount((current) => amountText(parseAmount(current, unit.fraction) + step, unit.fraction))}
              accessibilityRole="button"
              accessibilityLabel={`${amountText(step, 0)} 더하기`}
              style={({ pressed }) => [
                styles.amountStep,
                theme && { borderColor: theme.border, backgroundColor: theme.surface },
                pressed && 공용스타일.controlPressed,
              ]}
            >
              <Text style={[styles.amountStepText, theme && { color: theme.primary }]}>+{amountText(step, 0)}</Text>
            </Pressable>
          ))}
          {amountNumber > 0 && (
            <Pressable
              onPress={() => setDraftAmount("")}
              accessibilityRole="button"
              accessibilityLabel="금액 비우기"
              style={({ pressed }) => [styles.amountStep, pressed && 공용스타일.controlPressed]}
            >
              <Text style={[styles.amountStepText, theme && { color: theme.muted }]}>비우기</Text>
            </Pressable>
          )}
        </View>
        <OptionField
          label="분류"
          options={EXPENSE_CATEGORIES}
          value={draftCategory}
          onChange={(value) => setDraftCategory(value as ExpenseCategory)}
        />
        <OptionField label="날짜" options={dayOptions} labelOf={dayTextOf} value={draftDay} onChange={setDraftDay} />
        <OptionField
          label="낸 사람"
          options={시트_사람.모두}
          value={draftPayer}
          onChange={setDraftPayer}
        />
        {시트_사람.빠진_사람.length > 0 && (
          <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
            {시트_사람.빠진_사람.join(" · ")} 님은 이번 여행 참가자가 아니에요. 그대로 두면 적어 둔 몫이 유지돼요
          </Text>
        )}
        <View style={styles.shareField}>
          <View style={공용스타일.fieldLabelRow}>
            <View style={[공용스타일.fieldLabelDot, requiredDot(false, theme)]} />
            <Text style={[공용스타일.detailFieldLabel, theme && { color: theme.text }]}>누구 몫</Text>
          </View>
          {/* 방식을 먼저 고르고 그 방식에 맞는 것만 보여 준다. 사람들이
              실제로 하는 말이 "내가 낼게", "똑같이 나눠", "쟤는 빼고", "얘는 얼마" 라서
              그 넷을 그대로 뒀다. 비율이 아니라 금액이다. 본인 부담이 없던 때는
              「금액 직접」에 자기 이름만 채워 넣어야 했다. */}
          <Segment
            theme={theme}
            label="누구 몫"
            options={[
              { value: "본인", label: "본인 부담" },
              { value: "균등", label: "똑같이" },
              { value: "일부", label: "일부만" },
              { value: "금액", label: "금액 직접" },
            ]}
            value={draftSplitMode}
            onChange={(mode) => setDraftSplitMode(mode as typeof draftSplitMode)}
            style={styles.splitModeSegment}
          />
          {draftSplitMode === "본인" && (
            <Text style={[styles.splitEven, theme && { color: theme.muted }]}>
              {draftPayer}{josa(draftPayer, "이", "가")} 혼자 부담해요. 다른 사람에게 청구하지 않아요
            </Text>
          )}
          {draftSplitMode === "균등" && (
            <Text style={[styles.splitEven, theme && { color: theme.muted }]}>
              {participants.length}명이 {amountNumber > 0 ? `${show(amountNumber / participants.length)}씩` : "똑같이"} 나눠요
            </Text>
          )}
          {draftSplitMode === "일부" && (
            <View style={styles.splitPeople}>
              {시트_사람.모두.map((person) => {
                const joined = draftPeople.includes(person);
                return (
                  <Pressable
                    key={person}
                    onPress={() => setDraftPeople((current) => (
                      current.includes(person)
                        ? current.filter((name) => name !== person)
                        : 시트_사람.모두.filter((name) => current.includes(name) || name === person)
                    ))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: joined }}
                    accessibilityLabel={`${person} 몫`}
                    style={({ pressed }) => [
                      styles.splitPerson,
                      theme && { borderColor: joined ? theme.primary : theme.border, backgroundColor: joined ? theme.primarySoft : theme.surface },
                      pressed && 공용스타일.controlPressed,
                    ]}
                  >
                    {joined && <Glyph name="check" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} weight={2.6} />}
                    <Text numberOfLines={1} style={[styles.splitPersonText, theme && { color: joined ? theme.primary : theme.muted }]}>
                      {person}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {draftSplitMode === "금액" && (
            <View style={styles.splitAmountRows}>
              {시트_사람.모두.map((person) => (
                <View key={person} style={styles.splitAmountRow}>
                  <Text numberOfLines={1} style={[styles.splitAmountName, theme && { color: theme.text }]}>{person}</Text>
                  <TextInput
                    value={draftAmounts[person] ?? ""}
                    onChangeText={(text) => setDraftAmounts((current) => ({
                      ...current,
                      [person]: 금액_치기(text, unit.fraction),
                    }))}
                    accessibilityLabel={`${person} 몫 금액`}
                    placeholder="0"
                    placeholderTextColor={theme?.muted ?? "#9AA1AE"}
                    keyboardType={금액_키보드(unit.fraction)}
                    style={[
                      styles.splitAmountInput,
                      theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                    ]}
                  />
                </View>
              ))}
              {/* 남은 돈이 0 이 아니면 저장을 막는다. 합이 안 맞으면 정산이 틀어진다. */}
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.splitLeft,
                  theme && { color: draftAmountLeft === 0 ? theme.muted : (theme.dark ? statusColor.danger.dark : statusColor.danger.light) },
                ]}
              >
                {draftAmountLeft === 0
                  ? "딱 맞아요"
                  : draftAmountLeft > 0
                    ? `${show(draftAmountLeft)} 남았어요`
                    : `${show(-draftAmountLeft)} 넘었어요`}
              </Text>
            </View>
          )}
        </View>
        <OptionalFormSection
          label="메모 · 영수증"
          summary={[draftMemo.trim() && "메모", draftReceipt && "영수증"].filter(Boolean).join(" · ") || undefined}
          open={extrasOpen}
          onToggle={() => setExtrasOpen((current) => !current)}
        >
          <View style={styles.receiptRow}>
            {draftReceipt ? (
              <Image source={{ uri: draftReceipt }} style={styles.receiptThumb} accessibilityLabel="추가한 영수증" />
            ) : (
              <View style={[styles.receiptThumb, styles.receiptEmpty, theme && { borderColor: theme.border }]}>
                <Text style={[styles.receiptEmptyText, theme && { color: theme.muted }]}>없음</Text>
              </View>
            )}
            <View style={styles.receiptActions}>
              <Pressable
                onPress={chooseReceipt}
                accessibilityRole="button"
                style={[styles.receiptButton, theme && { backgroundColor: theme.primarySoft }]}
              >
                <Text style={[styles.receiptButtonText, theme && { color: theme.primary }]}>
                  {draftReceipt ? "다시 고르기" : "영수증 추가"}
                </Text>
              </Pressable>
              {Boolean(draftReceipt) && (
                <Pressable onPress={() => setDraftReceipt("")} accessibilityRole="button" hitSlop={글자누름여유}>
                  <Text style={[styles.receiptRemove, theme && { color: theme.muted }]}>빼기</Text>
                </Pressable>
              )}
            </View>
          </View>
          <DetailField
            label="메모 (선택)"
            value={draftMemo}
            onChangeText={setDraftMemo}
            placeholder="예: 둘 다 학생 할인"
          />
        </OptionalFormSection>
        {/* 지우지 않고 셈에서만 빼는 자리. 새로 적을 때는 필요 없어서 고칠 때만 보인다. */}
        {editingId !== null && (
          <>
            <OptionField
              label="정산"
              options={["정산에 넣기", "정산에서 빼기"]}
              value={draftExcluded ? "정산에서 빼기" : "정산에 넣기"}
              onChange={(value) => setDraftExcluded(value === "정산에서 빼기")}
            />
            {draftExcluded && (
              <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
                총 지출과 정산에서 빠지고 목록에는 흐리게 남아요
              </Text>
            )}
          </>
        )}
      </DetailSheet>
      <DetailSheet
        visible={paying !== null}
        title={paying ? `${paying.from} → ${paying.to}` : "정산"}
        subtitle="보낸 만큼 적어 두면 남은 금액이 줄어요"
        submit={payNumber >= (paying?.amount ?? 0) ? "다 보냈어요" : "이만큼 보냈어요"}
        disabledHint={payNumber <= 0 ? "금액을 입력해 주세요" : undefined}
        submitDisabled={payNumber <= 0}
        onClose={() => setPaying(null)}
        onSubmit={savePayment}
      >
        {paying && (
          <>
            <DetailField
              label="보낸 금액"
              required
              value={payAmount}
              onChangeText={(text) => setPayAmount(금액_치기(text, unit.fraction))}
              placeholder={amountText(paying.amount, unit.fraction)}
              keyboardType={금액_키보드(unit.fraction)}
            />
            {/* 왜 이 줄이 나왔는지. 사람이 적어서 사슬이 짧으니 여기선 말할 수
                있다. 묶은 화면은 대개 "내가 왜 저 사람한테?" 에서 막힌다. */}
            <View style={[styles.payWhy, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              <Text style={[styles.payWhyLabel, theme && { color: theme.muted }]}>왜 이 금액인가요</Text>
              {payWhy.map((line) => (
                <Text key={line} style={[styles.payWhyLine, theme && { color: theme.text }]}>{line}</Text>
              ))}
            </View>
            <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
              실제로 돈을 보내는 건 은행이나 송금 앱에서 하고, 여기에는 보냈다고 적어만 둬요.
            </Text>
          </>
        )}
      </DetailSheet>
      <DetailSheet
        visible={peopleSheetOpen}
        title="이번 여행 참가자"
        subtitle="공간 멤버 중에 이번에 같이 가는 사람만 골라요"
        submit="저장"
        disabledHint={!draftParticipants.length ? "한 명은 있어야 해요" : undefined}
        submitDisabled={!draftParticipants.length}
        onClose={() => setPeopleSheetOpen(false)}
        onSubmit={savePeople}
      >
        {theme && (
          <ParticipantPicker
            theme={theme}
            members={spaceMembers}
            value={draftParticipants}
            onChange={setDraftParticipants}
            noteFor={assignedSummary}
            hint="이번 여행에 가는 사람만 골라 주세요. 정산과 준비물 담당에 쓰여요."
          />
        )}
      </DetailSheet>
      <DetailSheet
        visible={currencySheetOpen}
        title="여행 통화"
        subtitle="현지 금액으로 적고 합계에서 원으로 환산해 봐요"
        submit="저장"
        onClose={() => setCurrencySheetOpen(false)}
        onSubmit={saveCurrency}
      >
        <OptionField
          label="통화"
          options={CURRENCIES.map((item) => `${item.code} ${item.label}`)}
          value={`${draftCurrency} ${currencyOf(draftCurrency).label}`}
          onChange={(value) => {
            const picked = currencyOf(value.split(" ")[0]);
            setDraftCurrency(picked.code);
            setDraftRate(picked.code === DEFAULT_CURRENCY.code ? "" : amountText(picked.rate, 2));
          }}
        />
        {draftCurrency !== DEFAULT_CURRENCY.code && (
          <DetailField
            label={`1 ${draftCurrency} = 몇 원인가요`}
            value={draftRate}
            onChangeText={setDraftRate}
            placeholder={`예: ${amountText(currencyOf(draftCurrency).rate, 2)}`}
            // 환율은 통화와 상관없이 소수다(엔 9.3, 동 0.055).
            keyboardType="decimal-pad"
          />
        )}
        <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
          {draftCurrency === DEFAULT_CURRENCY.code
            ? "원으로 적으면 환산 없이 그대로 보여요."
            : "환율은 여행 때 한 번 적어 두면 돼요. 적어 둔 금액은 바뀌지 않고 환산만 다시 계산해요."}
        </Text>
      </DetailSheet>
      <DetailSheet
        visible={budgetSheetOpen}
        title="여행 예산"
        subtitle="예산 대비 얼마나 썼는지 비용 탭에서 바로 확인해요"
        submit="저장"
        disabledHint={!budgetNumber ? "예산을 입력해 주세요" : undefined}
        submitDisabled={!budgetNumber}
        hasUnsavedChanges={budgetDraftChanged}
        destructiveLabel={budget > 0 ? "예산 삭제" : undefined}
        destructiveMessage="예산 막대가 사라져요. 적어 둔 지출은 그대로 남아요."
        onDestructive={clearBudget}
        onClose={() => setBudgetSheetOpen(false)}
        onSubmit={saveBudget}
      >
        <DetailField
          label={`전체 예산 (${unit.code})`}
          required
          value={draftBudget}
          onChangeText={(text) => setDraftBudget(금액_치기(text, unit.fraction))}
          placeholder="예: 500,000"
          keyboardType={금액_키보드(unit.fraction)}
        />
      </DetailSheet>
    </View>
  );
}

/**
 * 비용 탭의 한 덩이.
 *
 * 예전에는 총액·정산·예산·사람별 넷이 한 카드 안에 들어 있었고 제목이 전부
 * 12px 보조 글씨라, 어디서 어디까지가 한 이야기인지 알 수 없었다. 테마색으로
 * 칠한 것끼리도 서로 비슷해서 덩어리가 더 안 갈렸다.
 *
 * 제목을 본문 제목 크기로 키우고 덩이마다 판을 따로 깐다. 색은 그 덩이에서
 * 실제로 눌러야 하는 것 하나에만 쓴다.
 */

const styles = StyleSheet.create({
  feedbackToast: { left: 20, right: 20, bottom: 18 },
  detailTitleRow: {
    position: "relative",
  },
  detailTripTitle: { maxWidth: "68%" },
  tripMemoButton: {
    width: 102,
    minHeight: 72,
    borderRadius: 모서리.표식,
    borderWidth: 1,
    borderColor: "#E6D38C",
    backgroundColor: "#FFF3B8",
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
    justifyContent: "space-between",
    position: "absolute",
    right: 0,
    bottom: -12,
    transform: [{ rotate: "-1.5deg" }],
    shadowColor: "#6E5B32",
    shadowOpacity: 0.14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  tripMemoTape: {
    position: "absolute",
    width: 34,
    height: 8,
    top: -5,
    left: 34,
    backgroundColor: "rgba(238, 178, 160, .58)",
    transform: [{ rotate: "2deg" }],
  },
  tripMemoLabel: {
    fontSize: 12,
    fontFamily: typo.label.family,
    letterSpacing: 0.5,
  },
  tripMemoPreview: {
    fontSize: 11,
    fontFamily: typo.caption.family,
    marginTop: 2,
  },
  tripMemoBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(154, 121, 48, .2)",
    paddingTop: 4,
  },
  tripMemoButtonText: {
    fontSize: 14,
    fontFamily: typo.label.family,
  },
  tripMemoFold: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    backgroundColor: "#E8D681",
    borderTopLeftRadius: 8,
  },
  tripMemoList: {
    borderRadius: 모서리.행,
    backgroundColor: "#FFFFFF",
    padding: 8,
    marginBottom: 16,
    gap: 8,
  },
  tripMemoRow: { padding: 12, borderWidth: 1, borderColor: "#EEEAE5", borderRadius: 모서리.행 },
  tripMemoRowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  tripMemoActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  /** 글자만 있는 작은 단추. 눌리는 넓이를 44 로 채운다. */
  tripMemoAction: { minHeight: 높이.버튼, justifyContent: "center", paddingHorizontal: 4 },
  tripMemoEdit: { fontSize: 12, fontFamily: typo.label.family },
  tripMemoDelete: { fontSize: 12, fontFamily: typo.label.family },
  tripMemoAuthor: { fontSize: 12, fontFamily: typo.label.family },
  tripMemoBody: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  memoAddButton: {
    minHeight: 높이.저장,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  memoAddPlus: { marginRight: 8 },
  memoAddCopy: { flex: 1 },
  memoAddTitle: { fontSize: 14, fontFamily: typo.title.family },
  memoAddHint: { fontSize: 11, marginTop: 2 },
  memoEditor: { borderWidth: 1, borderRadius: 모서리.행, padding: 12, marginBottom: 12 },
  memoEditorHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  memoEditorTitle: { fontSize: 18, lineHeight: 25, fontFamily: typo.title.family },
  memoEditorCancel: { fontSize: 12, fontFamily: typo.label.family },
  memoEmpty: { alignItems: "center", paddingVertical: 20 },
  memoEmptyTitle: { fontSize: 18, lineHeight: 25, fontFamily: typo.title.family },
  memoEmptyHint: { fontSize: 11, marginTop: 4 },
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
  tripEditSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E0DA",
    paddingTop: 16,
    marginTop: 2,
  },
  tripArchiveButton: { minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.버튼, alignItems: "center", justifyContent: "center", marginTop: 8 },
  tripEditSectionTitle: { fontSize: 16, fontFamily: typo.title.family },
  tripEditSectionHint: { fontSize: 11, lineHeight: 16, fontFamily: typo.caption.family, marginTop: 3, marginBottom: 14 },
  placeAddText: { fontSize: 12, fontFamily: typo.label.family },
  moneyTotal: { fontSize: 32, lineHeight: 45, marginTop: 2, fontFamily: typo.data.family, letterSpacing: -0.5 },
  quickAddChips: { gap: 6, paddingVertical: 9, paddingRight: 4 },
  quickAddRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  quickAddInput: { flex: 1, borderWidth: 1, borderRadius: 모서리.행, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, fontFamily: typo.data.family },
  quickAddButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 모서리.행, paddingLeft: 12, paddingRight: 14, paddingVertical: 11 },
  quickAddButtonText: { fontSize: 14, fontFamily: typo.label.family },
  quickAddHint: { fontSize: 11, marginTop: 8, fontFamily: typo.caption.family },
  splitModeSegment: { marginTop: 8 },
  splitEven: { fontSize: 13, marginTop: 10, fontFamily: typo.caption.family },
  splitPeople: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  splitPerson: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.원, paddingHorizontal: 14 },
  splitPersonText: { maxWidth: 86, fontSize: 13, fontFamily: typo.label.family },
  splitAmountRows: { gap: 8, marginTop: 10 },
  splitAmountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  splitAmountName: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: typo.label.family },
  // 같은 줄에 놓이는 사람 칩과 높이를 맞춰야 해서 입력 높이(52)를 쓰지 않는다.
  splitAmountInput: { width: 124, height: 높이.버튼, borderWidth: 1, borderRadius: 모서리.버튼, paddingHorizontal: 여백.가로좁게, fontSize: 14, textAlign: "right", fontFamily: typo.data.family },
  splitLeft: { fontSize: 13, textAlign: "right", fontFamily: typo.caption.family },
  shareField: { marginBottom: 20 },
  amountSteps: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: -4, marginBottom: 18 },
  amountStep: { minHeight: 높이.버튼, borderWidth: 1, borderColor: "transparent", borderRadius: 모서리.원, paddingHorizontal: 여백.가로, alignItems: "center", justifyContent: "center" },
  amountStepText: { fontSize: 14, fontFamily: typo.label.family },
  moneyCurrencyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  moneyCurrencyChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.원, paddingLeft: 여백.가로좁게, paddingRight: 9 },
  moneyCurrencyLabel: { fontSize: 11, fontFamily: typo.caption.family },
  moneyCurrencyValue: { fontSize: 13, fontFamily: typo.label.family },
  moneyConverted: { flex: 1, textAlign: "right", fontSize: 12, fontFamily: typo.data.family },
  shoppingCost: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 모서리.구역, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  shoppingCostCopy: { flex: 1, minWidth: 0 },
  shoppingCostTitle: { fontSize: 13, fontFamily: typo.title.family },
  shoppingCostHint: { fontSize: 11, marginTop: 2, fontFamily: typo.caption.family },
  shoppingCostInput: { width: 92, borderWidth: 1, borderRadius: 모서리.행, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlign: "right", fontFamily: typo.data.family },
  shoppingCostButton: { borderRadius: 모서리.행, paddingHorizontal: 14, paddingVertical: 9 },
  shoppingCostButtonText: { color: "#FFFFFF", fontSize: 13, fontFamily: typo.label.family },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  receiptThumb: { width: 62, height: 62, borderRadius: 모서리.행, overflow: "hidden" },
  receiptEmpty: { borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  receiptEmptyText: { fontSize: 11, fontFamily: typo.caption.family },
  receiptActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  receiptButton: { borderRadius: 모서리.원, paddingHorizontal: 14, paddingVertical: 8 },
  receiptButtonText: { fontSize: 12, fontFamily: typo.label.family },
  receiptRemove: { fontSize: 12, fontFamily: typo.label.family },
  moneyBudgetTrack: { height: 7, borderRadius: 모서리.원, overflow: "hidden", marginTop: 7 },
  moneyBudgetFill: { height: 7, borderRadius: 모서리.원 },
  moneyBudgetFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  moneyBudgetStatus: { fontSize: 11, fontFamily: typo.caption.family },
  moneyBudgetPercent: { fontSize: 11, fontFamily: typo.data.family },
  tripPeopleLine: { marginTop: 2 },
  moneyPaidTable: { marginTop: 16 },
  moneyPaidHead: { flexDirection: "row", alignItems: "center", paddingBottom: 6 },
  moneyPaidHeadName: { flex: 1, fontSize: 12, fontFamily: typo.caption.family },
  moneyPaidHeadCell: { width: 104, textAlign: "right", fontSize: 12, fontFamily: typo.caption.family },
  moneyPaidRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingVertical: 9 },
  moneyPaidNameBox: { flex: 1, paddingRight: 8 },
  moneyPaidName: { fontSize: 14, fontFamily: typo.label.family },
  moneyPaidGuest: { fontSize: 12, marginTop: 1, fontFamily: typo.caption.family },
  moneyPaidCell: { width: 104, textAlign: "right", fontSize: 14, fontFamily: typo.data.family },
  moneySettleBlock: { marginTop: 16, gap: 6 },
  moneySettleCopy: { flex: 1, minWidth: 0 },
  moneySettleWho: { fontSize: 12, fontFamily: typo.caption.family },
  moneySettleDone: { minHeight: 높이.칩, borderRadius: 모서리.원, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  moneySettleDoneText: { fontSize: 13, fontFamily: typo.label.family },
  moneyOthersHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
  moneyOthersLabel: { fontSize: 13, fontFamily: typo.caption.family },
  moneyOtherRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.버튼, paddingHorizontal: 14 },
  moneyOtherText: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: typo.label.family },
  moneyOtherAmount: { fontSize: 14, fontFamily: typo.data.family },
  moneyOtherUndo: { fontSize: 13, fontFamily: typo.label.family },
  moneySettleCopyButton: { minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.버튼, alignItems: "center", justifyContent: "center", marginTop: 4 },
  moneySettleCopyText: { fontSize: 13, fontFamily: typo.label.family },
  payWhy: { gap: 4, borderWidth: 1, borderRadius: 모서리.행, padding: 14, marginBottom: 16 },
  payWhyLabel: { fontSize: 12, fontFamily: typo.caption.family },
  payWhyLine: { fontSize: 13, lineHeight: 19, fontFamily: typo.label.family },
  moneySettle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 모서리.행, paddingHorizontal: 14, paddingVertical: 12 },
  moneySettleText: { flex: 1, fontSize: 14, fontFamily: typo.label.family },
  moneySettleAmount: { fontSize: 20, lineHeight: 28, fontFamily: typo.data.family },
  moneyInsightGrid: { flexDirection: "row" },
  moneyInsightItem: { flex: 1, minWidth: 0, paddingRight: 8 },
  moneyInsightDivider: { borderLeftWidth: 1, paddingLeft: 10, paddingRight: 4 },
  moneyInsightLabel: { fontSize: 11, fontFamily: typo.caption.family },
  moneyInsightValue: { fontSize: 15, marginTop: 4, fontFamily: typo.data.family },
  moneyInsightMeta: { fontSize: 12, marginTop: 1, fontFamily: typo.caption.family },
  moneyCategoryCard: { marginTop: 12 },
  moneyCategoryRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 높이.버튼, paddingHorizontal: 6, borderRadius: 모서리.버튼 },
  moneyCategoryName: { width: 44, fontSize: 12, fontFamily: typo.label.family },
  moneyBarTrack: { flex: 1, height: 6, borderRadius: 모서리.원, overflow: "hidden" },
  moneyBarFill: { height: 6, borderRadius: 모서리.원 },
  moneyCategoryAmount: { minWidth: 58, textAlign: "right", fontSize: 12, fontFamily: typo.data.family },
  moneyCategoryPercent: { minWidth: 30, textAlign: "right", fontSize: 11, fontFamily: typo.caption.family },
  moneyCategoryHint: { fontSize: 12, fontFamily: typo.caption.family, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 7 },
  moneyDayRow: { gap: 6, paddingVertical: 2, paddingRight: 4 },
  moneyList: { gap: 14, marginTop: 8 },
  // 목록 제목줄 오른쪽. 분류를 걸러 둔 동안에는 「전체 보기」와 추가 버튼이
  // 나란히 선다.
  moneyListHeadActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  moneyGroup: { gap: 6 },
  moneyGroupHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 2 },
  moneyGroupDay: { fontSize: 13, fontFamily: typo.title.family },
  moneyGroupTotal: { fontSize: 12, fontFamily: typo.data.family },
  moneyRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 모서리.행, paddingHorizontal: 12, paddingVertical: 11 },
  moneyRowExcluded: { opacity: 불투명도.흐림 },
  moneyRowBody: { flex: 1, minWidth: 0 },
  moneyRowTitle: { fontSize: 14, fontFamily: typo.title.family },
  moneyRowMeta: { fontSize: 11, marginTop: 2, fontFamily: typo.caption.family },
  moneyRowAmount: { fontSize: 14, fontFamily: typo.data.family },
  moneyExport: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 모서리.행, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 },
  moneyExportTitle: { fontSize: 13, fontFamily: typo.title.family },
  moneyExportHint: { fontSize: 11, marginTop: 2, fontFamily: typo.caption.family },
  inlineMore: { flexDirection: "row", alignItems: "center", gap: 3 },
  cookV2Hero: { borderWidth: 1, overflow: "hidden" },
  cookV2ProgressBadge: {
    width: 64,
    minHeight: 58,
    borderRadius: 모서리.구역,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  cookV2ProgressBadgeValue: { fontSize: 18, lineHeight: 22, fontFamily: typo.data.family },
  cookV2ProgressBadgeLabel: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  recipeSelector: { marginBottom: 12 },
  recipeSelectorHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  recipeSelectorTitle: { fontSize: 14, fontFamily: typo.title.family },
  recipeSelectorActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  recipeSelectorMore: { fontSize: 14, fontFamily: typo.label.family },
  cookV2MenuList: { gap: 8, paddingRight: 12 },
  cookV2MenuCard: {
    width: 124,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 모서리.행,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cookV2MenuTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cookV2MenuNumber: { fontSize: 14, fontFamily: typo.data.family, letterSpacing: 0.5 },
  cookV2MenuCount: { fontSize: 14, fontFamily: typo.data.family },
  cookV2MenuName: { fontSize: 14, fontFamily: typo.title.family },
  recipeList: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  recipeListRow: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  recipeListRowBorder: { borderTopWidth: 1, borderTopColor: "#EEEAE5" },
  recipeListNumber: {
    width: 27,
    height: 27,
    borderRadius: 모서리.상자,
    backgroundColor: "#F6F2ED",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  recipeListNumberText: { fontSize: 14, fontFamily: typo.data.family },
  recipeListCopy: { flex: 1, minWidth: 0 },
  recipeListName: { fontSize: 14, fontFamily: typo.title.family },
  recipeListNote: { fontSize: 14, fontFamily: typo.body.family, marginTop: 2 },
  recipeListCount: { fontSize: 14, fontFamily: typo.data.family, marginLeft: 8 },
  myCookingBox: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  myCookingTitle: { fontSize: 14, fontFamily: typo.title.family },
  myCookingSummary: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  myCookingCompact: { flexDirection: "row", alignItems: "center" },
  myCookingIcon: {
    width: 32,
    height: 32,
    borderRadius: 모서리.행,
    backgroundColor: "#F0EDFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  cookV2MemoLine: {
    height: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cookV2MemoDot: { width: 3, height: 3, borderRadius: 모서리.원 },
  cookV2MemoRule: { width: 15, height: 1.5, borderRadius: 모서리.원, opacity: 0.5 },
  cookV2MemoRuleShort: { width: 10 },
  cookV2MyEyebrow: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.5, marginBottom: 2 },
  myCookingCopy: { flex: 1, minWidth: 0 },
  myIngredientGroup: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  myIngredientGroupHead: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myIngredientGroupTitle: { fontSize: 14, fontFamily: typo.title.family },
  myIngredientGroupCount: { fontSize: 14, fontFamily: typo.data.family },
  myIngredientRow: {
    minHeight: 38,
    borderTopWidth: 1,
    borderTopColor: "#EEEAE5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myIngredientName: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: typo.title.family },
  myIngredientQuantity: { flexShrink: 0, marginLeft: 8, fontSize: 14, fontFamily: typo.data.family },
  aiRecipeCallout: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#F6F2ED",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  aiRecipeCopy: { flex: 1, paddingRight: 8 },
  aiRecipeTitle: { fontSize: 14, fontFamily: typo.title.family },
  aiRecipeText: { fontSize: 12, fontFamily: typo.label.family, lineHeight: 15, marginTop: 2 },
  aiPromptBox: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#F6F2ED",
    padding: 12,
    marginBottom: 16,
  },
  aiPromptHead: { flexDirection: "row", alignItems: "center" },
  aiPromptCopyButton: {
    borderRadius: 모서리.상자,
    backgroundColor: "#17233D",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiPromptCopyOnly: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 4 },
  aiPromptCopyText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.body.family },
  aiPromptPreview: {
    fontSize: 11,
    fontFamily: typo.caption.family,
    lineHeight: 13,
    marginTop: 8,
  },
  aiPasteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cookingNote: { fontSize: 14, marginTop: 4 },
  recipeLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
  },
  recipeLinkText: { fontSize: 14, fontFamily: typo.label.family },
  cookingEyebrow: {
    fontSize: 12,
    fontFamily: typo.label.family,
    marginBottom: 4,
  },
  cookingHeroCopy: { flex: 1, paddingRight: 12 },
  cookingHeroActions: { alignItems: "center", gap: 6 },
  cookingMoreButton: {
    width: 30,
    height: 24,
    borderRadius: 모서리.상자,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cookingTitle: {
    fontSize: 24,
    lineHeight: 34,
    fontFamily: typo.title.family,
    letterSpacing: -0.5,
  },
  cookingToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cookingTip: { fontSize: 12 },
  cookingSectionTitle: {
    color: "#A16E35",
    fontSize: 14,
    fontFamily: typo.title.family,
    marginBottom: 6,
  },
  cookV2SectionHead: {
    minHeight: 높이.버튼,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cookV2SectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cookV2SectionTitle: { marginBottom: 0 },
  cookV2SectionLabel: { borderRadius: 모서리.표식, paddingHorizontal: 6, paddingVertical: 4 },
  cookV2SectionLabelText: { fontSize: 12, fontFamily: typo.label.family },
  cookV2SectionActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  cookV2SectionCount: { fontSize: 14, fontFamily: typo.data.family },
  ingredientRow: {
    minHeight: 높이.버튼,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F2EEE9",
  },
  cookV2IngredientDone: { opacity: 불투명도.흐림 },
  cookV2IngredientNameDone: { textDecorationLine: "line-through" },
  ingredientBody: { flex: 1 },
  ingredientName: { fontSize: 14, fontFamily: typo.title.family },
  ingredientOwner: { fontSize: 12, marginTop: 2 },
  ingredientQuantity: { fontSize: 14, fontFamily: typo.data.family },
  safe: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    backgroundColor: "#F7F5F0",
    shadowColor: "#17233D",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  header: {
    height: 57,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E7E4DD",
  },
  headerName: {
    fontSize: 16,
    letterSpacing: 1,
    fontFamily: typo.title.family,
  },
  headerSpacer: { width: 20 },
  modeText: { color: "#7C8492", fontSize: 14, fontFamily: typo.label.family },
  /** 탭 이름 옆 개수. 들어가 보지 않아도 어디에 뭐가 있는지 알게 한다. */
  modeCount: { color: "#8B92A0", fontSize: 11, fontFamily: typo.data.family, marginTop: 1 },
  modeTextCurrent: { },
  page: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 88 },
  // 비용 탭에 떠 있는 ＋ 단추. 목록 마지막 줄을 가리지 않게 페이지 아래 여백(88)
  // 안쪽에 앉힌다.
  moneyFab: {
    position: "absolute",
    right: 18,
    // 실제 자리는 그리는 쪽이 시스템 막대 높이를 더해 정한다(`아래_여백`). 이 값은
    // 막대가 없는 화면(웹)에서만 쓴다.
    bottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 모서리.원,
    backgroundColor: "#3F4C8F",
    shadowColor: "#17233D",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  moneyFabPressed: { opacity: 불투명도.눌림 },
  // 금액이 길어져도 바로 가기가 밀려나지 않게 금액 쪽이 줄어든다.
  moneyTotalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  moneyJump: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 4, flexShrink: 0 },
  moneyTotalShrink: { flexShrink: 1 },
  moneyJumpText: { fontSize: 13, color: "#3F4C8F", fontFamily: typo.label.family },
  moneyFabText: { fontSize: 14, fontFamily: typo.title.family },
  date: { fontSize: 11, fontFamily: typo.caption.family, letterSpacing: 0, marginBottom: 6 },
  title: { fontSize: 28, lineHeight: 39, fontFamily: typo.title.family, letterSpacing: -0.5 },
  subtitle: { fontSize: 11, marginTop: 6 },
  // 여행 이름과 메모지 묶음. 위 여백을 여기 두어야 탭 줄이 화면에 붙었을 때
  // 그 위로 아래 내용이 비쳐 보이는 틈이 생기지 않는다.
  detailHead: { marginBottom: 18 },
  modeSwitch: {
    flexDirection: "row",
    marginBottom: 12,
    padding: 3,
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#DEDCD5",
  },
  // 화면에 붙어 있는 동안 아래 내용이 테두리 밖으로 비쳐 보이지 않게 한다.
  // 배경은 표면색이 아니라 화면 바탕색이다. 줄 바깥으로 삐져나온 여백까지
  // 같이 덮어야 글자가 줄을 뚫고 지나가는 것처럼 보이지 않는다.
  modeSwitchPinned: { zIndex: 2 },
  // 탭을 가로로 늘어놓는 줄. 위 주석의 까닭으로 바깥이 아니라 여기서 가로를 정한다.
  modeSwitchRow: { flex: 1, flexDirection: "row" },
  mode: {
    flex: 1,
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  modeCurrent: {
    borderRadius: 모서리.상자,
    borderWidth: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
  placeAdd: { borderRadius: 모서리.상자, paddingHorizontal: 12, paddingVertical: 8 },
  cookingHero: {
    borderRadius: 모서리.상자,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cookingSection: {
    borderRadius: 모서리.행,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginBottom: 8,
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
