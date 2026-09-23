import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "./ui/Chip";
import { Segment } from "./ui/Segment";
import { keepTripPhoto } from "./tripPhotos";
import { TripDateRangePicker } from "./TripDateRangePicker";
import { TripRegionPicker } from "./TripRegionPicker";
import { ParticipantPicker } from "./ParticipantPicker";
import { DaymoApiError } from "./auth";
import { TripConflictError } from "./tripSync";
import { reloadOpenLists, useListSync } from "./useListSync";
import { SyncMark, SyncNotice } from "./SyncMarks";
import { isServerId } from "./listSync";
import {
  UNDATED,
  initialMemoryData,
  normalizePackingOwner,
  packingTags,
  reservationScheduleRow,
  transportScheduleRow,
  기본_체크인_시각,
  자리에_넣기,
  type MemoryPhoto,
  type PackingItem,
  type PlaceItem,
  type Recipe,
  type ReservationInfo,
  type ScheduleItem,
  type StayInfo,
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
import { rebindPeople } from "./people";
import { diaryCodec, memoCodec } from "./memorySync";
import { isStaleDisplayCopy, photoCodec } from "./photoSync";
import { photoUploads, type PhotoUploadJob } from "./photoUploads";
import { TripTrash } from "./TripTrash";
import { downloadPhoto, isLivePhotoUri, releaseDownloadedPhoto, uploadPhoto, type UploadNotice } from "./photoTransfer";
import type { ExpenseSettings, HomeCoverChoice } from "./serverData";
import type { RosterEntry } from "./tripSync";
import {
  deletePhoto as deleteServerPhoto,
  listPhotos,
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
import { BackHandler, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { AppTheme } from "./theme";
import { Text, TextInput } from "./AppText";
import { Toast } from "./ui/Toast";
import { Glyph } from "./Glyph";
import { showAlert } from "./showAlert";
import { shrinkForWeb } from "./webImage";
import { useWebBackClose } from "./useWebBackClose";
import { 높이, 모서리, 불투명도, 아이콘, 여백, 누름여유, 글자누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";
import { memoPaper, onAccent, status as statusColor } from "./theme/colors";
import { type CoverFocus } from "./coverCrop";
import { 공용스타일 } from "./trip/styles";
import { DetailEditableContext, DetailFeedbackContext, DetailField, DetailSheet, DetailThemeContext, EmptyState, FeedbackAction, MoneyBlock, NO_IDS, OptionField, OptionalFormSection, ReportForm, ViewMode, newPlaceId, requiredDot, useDraftChanged, 금액_치기, 금액_키보드 } from "./trip/parts";
import { TripOverview } from "./trip/TripOverview";
import { Places } from "./trip/TripPlaces";
import { Preparation } from "./trip/TripPreparation";
import { Cooking } from "./trip/TripCooking";
import { Memories } from "./trip/TripMemories";



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
  tripEditSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E0DA",
    paddingTop: 16,
    marginTop: 2,
  },
  tripArchiveButton: { minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.버튼, alignItems: "center", justifyContent: "center", marginTop: 8 },
  tripEditSectionTitle: { fontSize: 16, fontFamily: typo.title.family },
  tripEditSectionHint: { fontSize: 11, lineHeight: 16, fontFamily: typo.caption.family, marginTop: 3, marginBottom: 14 },
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
});
