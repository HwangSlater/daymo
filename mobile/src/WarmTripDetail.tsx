import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TripDateRangePicker } from "./TripDateRangePicker";
import { TripRegionPicker } from "./TripRegionPicker";
import { ParticipantPicker } from "./ParticipantPicker";
import { DaymoApiError } from "./auth";
import { TripConflictError } from "./tripSync";
import { reloadOpenLists, useListSync } from "./useListSync";
import { SyncNotice } from "./SyncMarks";
import { isServerId } from "./listSync";
import {
  UNDATED,
  initialMemoryData,
  normalizePackingOwner,
  packingTags,
  reservationScheduleRow,
  transportScheduleRow,
  기본_체크인_시각,
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
  DEFAULT_CURRENCY,
  type Expense,
  type Participant,
  type Payment,
  money,
  normalizeExpense,
  spentTotal,
} from "./tripExpenses";
import { BackHandler, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTheme } from "./theme";
import { Text } from "./AppText";
import { Toast } from "./ui/Toast";
import { Glyph } from "./Glyph";
import { showAlert } from "./showAlert";
import { useWebBackClose } from "./useWebBackClose";
import { 높이, 모서리, 불투명도, 아이콘, 글자누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";
import { memoPaper, onAccent, status as statusColor } from "./theme/colors";
import { type CoverFocus } from "./coverCrop";
import { 공용스타일 } from "./trip/styles";
import {
  DetailEditableContext,
  DetailFeedbackContext,
  DetailField,
  DetailSheet,
  DetailThemeContext,
  FeedbackAction,
  NO_IDS,
  OptionField,
  OptionalFormSection,
  ReportForm,
  ViewMode,
  newPlaceId,
} from "./trip/parts";
import { TripOverview } from "./trip/TripOverview";
import { TripPlaces } from "./trip/TripPlaces";
import { TripPreparation } from "./trip/TripPreparation";
import { TripCooking } from "./trip/TripCooking";
import { Memories } from "./trip/TripMemories";
import { Money } from "./trip/TripMoney";

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
  const [mode, 모드_적기] = useState<ViewMode>(() =>
    destinationMode(initialDestination),
  );
  /**
   * 한 번이라도 연 탭. 여행을 열면 목록 열두 개가 탭과 상관없이 전부 서버를 불렀다
   * (2026-09-23 검토 #59). 여는 탭의 것만 부르고 나머지는 그 탭을 열 때 깨운다.
   * **닫아도 다시 잠들지 않는다** — 다른 탭으로 옮겨도 올릴 것은 올라가야 한다.
   */
  const [깨운_탭, set깨운_탭] = useState<ViewMode[]>(() => [destinationMode(initialDestination)]);
  const setMode = (nextMode: ViewMode) => {
    모드_적기(nextMode);
    set깨운_탭((현재) => (현재.includes(nextMode) ? 현재 : [...현재, nextMode]));
  };
  /**
   * 탭 하나가 쓰는 목록들.
   *
   * 한 탭이 제 목록만 쓰는 것은 아니다. 일정은 장소가 서버에 올라가야 장소를 잇고,
   * 요리의 「재료 불러오기」는 준비물에 넣는다. 그런 것을 함께 깨운다.
   */
  const 탭이_쓰는_목록: Record<ViewMode, readonly string[]> = {
    여행: ["일정", "장소", "숙소", "교통편", "예약"],
    장소: ["장소", "숙소"],
    준비: ["준비물"],
    요리: ["요리", "준비물"],
    비용: ["지출", "주고받은 기록"],
    기록: ["사진", "메모", "일기"],
  };
  const 깨어난_목록 = useMemo(() => {
    const 모인_것 = new Set<string>();
    깨운_탭.forEach((탭) => 탭이_쓰는_목록[탭]?.forEach((이름) => 모인_것.add(이름)));
    return 모인_것;
    // 탭 목록은 고정된 표다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [깨운_탭]);
  /**
   * 이 목록을 아직 안 깨워도 되는지.
   *
   * 아직 안 연 탭이어도 **올릴 것이 있으면 깨운다** — 공지에서 일정을 들여오는 것처럼
   * 그 탭을 열지 않고도 줄이 생기는 길이 있다. 맞춰 둔 id 보다 줄이 많으면 올릴 것이
   * 있다고 본다.
   */
  const 잠든_목록 = (이름: string, items: readonly unknown[], syncedIds: readonly string[]) =>
    !깨어난_목록.has(이름) && items.length <= syncedIds.length;
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
    잠듦: 잠든_목록("장소", places, placeSyncIds),
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
    잠듦: 잠든_목록("일정", schedule, scheduleSyncIds),
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
    잠듦: 잠든_목록("숙소", stayList, staySyncIds),
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
    잠듦: 잠든_목록("교통편", transportations, transportSyncIds),
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
    잠듦: 잠든_목록("예약", reservations, reservationSyncIds),
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
    잠듦: 잠든_목록("지출", expenses, expenseSyncIds),
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
    잠듦: 잠든_목록("주고받은 기록", payments, paymentSyncIds),
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
    잠듦: 잠든_목록("준비물", packingRows, packingSyncIds),
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
    잠듦: 잠든_목록("요리", recipeRows, recipeSyncIds),
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
    잠듦: 잠든_목록("메모", tripNotes, memoSyncIds),
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
    잠듦: 잠든_목록("일기", memories.diaries, diarySyncIds),
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
    잠듦: 잠든_목록("사진", memories.photos, photoSyncIds),
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
            <TripPlaces
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
            <TripPreparation
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
            <TripCooking
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
  tripPeopleLine: { marginTop: 2 },
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
