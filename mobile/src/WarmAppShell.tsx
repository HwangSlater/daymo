import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Image,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  TextInputProps,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { type Expense, money } from "./tripExpenses";
import { PaperPeel } from "./PaperPeel";
import { TripRegionPicker } from "./TripRegionPicker";
import { tripRegions } from "./tripRegions";
import { PEEL_CANCEL_MS, PEEL_FINISH_MS, peelDistance, peelDragProgress, shouldCompletePeel } from "./tripPeelMotion";
import { MapLink } from "./MapLink";
import { naverMapSearchUrl } from "./mapLinks";
import { ParticipantPicker } from "./ParticipantPicker";
import { NoticeImportSheet } from "./NoticeImportSheet";
import { NOTICE_IMPORT_ENABLED } from "./features";
import {
  clearDevice,
  defaultMe,
  defaultSpaces,
  type Me,
  type Space,
  useSaveMe,
  useSaveSpaces,
} from "./spaces";
import { TripDateRangePicker } from "./TripDateRangePicker";
import { sampleTripPlanning, type TripDetailDestination, type TripPlanningData, WarmTripDetail } from "./WarmTripDetail";
import { shouldRefetch, tripDateKeys } from "./listSync";
import { SyncNotice } from "./SyncMarks";
import { reloadOpenLists } from "./useListSync";
import { koreaAdminPath } from "./koreaAdminPath";
import { koreaLandPath, koreaOutlinePath } from "./koreaOutlinePath";
import { isOnLand, regionAt } from "./koreaHitTest";
import {
  AppTheme,
  AppearanceMode,
  resolveTheme,
  ThemeId,
  themeOptions,
} from "./theme";
import {
  defaultDeviceSettings,
  DeviceSettings,
  GroupId,
  useSaveSettings,
} from "./deviceSettings";
import { Text, TextInput } from "./AppText";
import { Glyph } from "./Glyph";
import { SheetShell } from "./ui/SheetShell";
import { showAlert } from "./showAlert";
import { 높이, 모서리, 여백, 누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";
import { domain, kindColor, onAccent, paperCard, status as statusColor, tripTone } from "./theme/colors";
import { cancelAccountDeletion, changePassword, DaymoApiError, isReconfirmCancelled, linkSocialAccount, PRIVACY_URL, TERMS_URL, login, logout, refreshMe, requestAccountDeletion, requestEmailChange, requestPasswordReset, restoreSession, signUp, socialLogin, socialProviders, updateDisplayName, type AuthUser, type Reconfirm, type RequestPace } from "./auth";
import { type SocialProvider, socialProviderName, socialProviderOrder } from "./socialLogin";
import { SocialLoginButton } from "./SocialLoginButton";
import { deletionDateLabel, deletionRequestedNotice } from "./accountDeletion";
import {
  deleteSpace,
  listDeletedSpaces,
  restoreSpace,
  archiveTrip,
  deleteTrip,
  listDeletedTripsPage,
  restoreTrip,
  acceptInvite,
  blockMember,
  changeMemberRole,
  createReport,
  listBlocks,
  type ReportReason,
  type ServerBlock,
  unblock,
  createInvite,
  endDeviceSession,
  listDevices,
  listInvites,
  removeMember,
  revokeInvite,
  type ServerInvite,
  createSpace,
  createTrip,
  getTrip,
  listChecklistItems,
  listDiaries,
  listExpenses,
  listMembers,
  listMemos,
  listPhotos,
  listRecipes,
  listScheduleItems,
  listSpaces,
  listStays,
  listTripPlaces,
  listTripsPage,
  setTripParticipants,
  updateExpenseSettings,
  updateHomeCover,
  updateSpace,
  updateTrip,
  type ExpenseSettings,
  type ServerSpace,
  type ServerTrip,
} from "./serverData";
import {
  canEditSpace,
  roleToServer,
  formerMembersFromServer,
  membersFromServer,
  relationshipFromServer,
  roleFromServer,
  spacePatchFrom,
  type ServerMemberInput,
  type SpaceChange,
} from "./spaceMapping";
import { appendServerTrips, mergeServerTripsByGroup } from "./tripMerge";
import { toneOfTripId } from "./tripColor";
import { shouldLoadMore } from "./tripPaging";
import { homeSummaryOf, parseTripOverview, type ServerTripOverview } from "./tripOverview";
import { downloadPhoto, isLivePhotoUri } from "./photoTransfer";
import { homeCoverRows, keepsakeRowSlots } from "./tripCard";
import { idsFromNames, namesFromIds, rosterOf, sameIds, TripConflictError, type LatestTrip, type RosterEntry } from "./tripSync";
import { uniqueNames } from "./people";
import { inviteTokenOf } from "./inviteLink";
import { tripsToMarkdown } from "./tripExportText";
import { shareTripArchive } from "./tripExpenseExport";
import { mergePrefetchedLists, neverFetched, pickTripsToPrefetch, runWithLimit, type FetchedTripLists } from "./tripPrefetch";
import { forgetPageInvite, takePageInvite } from "./inviteHandoff";
import {
  deviceLimitNotice,
  deviceLine,
  deviceName,
  MAX_DEVICES,
  revokePrompt,
  type ServerDevice,
} from "./deviceSessions";

type MainView = "홈" | "여행" | "찾기" | "우리";
/** 권한 이름표. 저장된 값은 「보기만」이지만 화면에는 「보기 전용」으로 적는다. */
const roleLabel = (role: string) => (role === "보기만" ? "보기 전용" : role);
type DaymoUser = Pick<AuthUser, "name" | "email" | "deletionScheduledAt" | "hasPassword" | "linkedProviders"> & { id?: string };

WebBrowser.maybeCompleteAuthSession();

type Trip = {
  id?: string;
  version?: number;
  name: string;
  date: string;
  note: string;
  /**
   * tripTone 팔레트의 자리. 색값이 아니라 자리를 저장한다.
   *
   * 서버에서 온 여행은 id 로 정한다(`tripColor.ts`). 그래야 기기가 달라도, 목록을
   * 다시 받아도 그 여행은 늘 같은 색이다.
   */
  tone: number;
  mark: string;
  region: string;
  start: string;
  end: string;
  planning?: TripPlanningData;
  /**
   * 서버가 센 홈 카드 숫자. 있으면 홈이 기록(`planning`) 대신 이것을 쓴다.
   * 기록은 상세를 이 기기에서 열어야 채워져서, 다른 멤버가 채운 여행이 비어 보인다.
   */
  overview?: ServerTripOverview;
  /** 서버에 저장된 통화·환율·예산·정산 묶기. 상세 화면이 기기 값과 견줘 쓴다. */
  serverExpenseSettings?: ExpenseSettings;
  /** 홈 화면의 여행 카드에 깐 사진 한 장. */
  coverPhotoId?: string;
  /** 홈 화면의 여행 카드에 통째로 깐 기념 카드. 사진 한 장과 둘 중 하나만 있다. */
  coverCardId?: string;
  /** 홈에 그릴 사진들. 카드를 깔았으면 그 카드의 사진이 고른 차례대로다. */
  coverPhotoIds?: string[];
  /** 그 카드의 틀 이름. 사진을 어떻게 놓을지 이 값으로 정한다(`homeCoverRows`). */
  coverCardStyle?: string;
  /** 받아 둔 바탕 사진 자리(사진 id → 자리). 못 받은 사진은 없고, 그러면 카드는 종이 그대로다. */
  coverUris?: Record<string, string>;
  /**
   * 앱이 처음부터 들고 있는 예시 여행.
   *
   * 예시 여행만 일정·장소·준비물이 채워진 채로 열린다. 사용자가 만든 여행은
   * 빈 채로 시작한다. 내가 만들지 않은 내용이 들어 있으면 그건 내 여행이 아니다.
   */
  sample?: boolean;
  /** 보관한 여행. 여행 목록의 ‘보관’에만 보인다. */
  archived?: boolean;
  /** 지운 여행이면 되돌릴 수 있는 마지막 시각. 보관 목록의 ‘지운 여행’에만 쓴다. */
  deletionScheduledAt?: string;
};

// 서버 공간을 앱의 공간으로 옮긴다. 멤버는 따로 받아 넘긴다.
//
// 함께한 날을 적지 않았으면 비워 둔다. 예전에는 오늘 날짜로 채웠는데, 그러면
// 적지도 않은 날이 "함께한 지 1일째" 로 보였다.
const spaceFromServer = (space: ServerSpace, members: ServerMemberInput[] = []): Space => ({
  id: space.id,
  name: space.name,
  members: membersFromServer(members),
  formerMembers: formerMembersFromServer(members),
  relationship: relationshipFromServer(space.relationshipType),
  relationshipType: space.relationshipType,
  since: space.startedOn ?? "",
  myRole: roleFromServer(space.myRole),
  myMembershipId: members.find((member) => member.isMe)?.id,
});

/** 이 공간에서 이름과 membership id 를 오가는 표. 나는 앱이 쓰는 이름으로 들어간다. */
const rosterOfSpace = (space: Space, myName: string): RosterEntry[] =>
  rosterOf({ name: myName, membershipId: space.myMembershipId }, space.members, space.formerMembers);

// 서버에 참가자가 정해져 있으면 이름으로 바꿔 기록(planning)의 참가자 칸에 둔다.
// 비어 있으면 서버 약속대로 "공간 멤버 전원" 이라 칸을 비워 둔다. 상세 화면이
// 비어 있는 칸을 멤버 전원으로 읽는다.
const tripFromServer = (trip: ServerTrip, roster: RosterEntry[] = []): Trip => {
  const participants = namesFromIds(trip.participantMembershipIds ?? [], roster);
  const overview = parseTripOverview(trip.overview);
  return {
    id: trip.id,
    version: trip.version,
    name: trip.title,
    date: sampleDateRange(trip.startDate, trip.endDate),
    note: trip.summary ?? "",
    // 색은 목록의 몇 번째인지가 아니라 여행 id 로 정한다. 목록 차례로 정하면
    // 기기마다, 목록을 다시 받을 때마다 같은 여행의 색이 달라진다.
    tone: toneOfTripId(trip.id),
    mark: trip.startDate.slice(5, 7),
    region: trip.regionName ?? "지역 미정",
    start: trip.startDate,
    end: trip.endDate,
    ...(participants.length ? { planning: { participants } } : {}),
    ...(overview ? { overview } : {}),
    serverExpenseSettings: expenseSettingsFrom(trip),
    // 해제한 것도 반영돼야 해서 없을 때도 싣는다(`...` 로 감추면 옛 값이 남는다).
    coverPhotoId: trip.coverPhotoId ?? undefined,
    coverCardId: trip.coverCardId ?? undefined,
    coverPhotoIds: trip.coverPhotoIds ?? [],
    coverCardStyle: trip.coverCardStyle ?? undefined,
    archived: trip.status === "archived",
    ...(trip.deletionScheduledAt ? { deletionScheduledAt: trip.deletionScheduledAt } : {}),
  };
};

/** 홈 카드 숫자를 셀 때 넘기는 칸. */
const tripForSummary = (trip: Trip) => ({
  overview: trip.overview,
  planning: trip.planning,
  serverCurrency: trip.serverExpenseSettings?.currency,
});

// 상세를 닫고 요약을 다시 받기까지 기다리는 시간. 닫으며 보낸 변경이 먼저 서버에 닿게 한다.
const OVERVIEW_REFRESH_MS = 2500;

const expenseSettingsFrom = (trip: ServerTrip): ExpenseSettings => ({
  currency: trip.currencyCode ?? "KRW",
  exchangeRate: trip.exchangeRate == null ? 1 : Number(trip.exchangeRate),
  budget: trip.budget == null ? 0 : Number(trip.budget),
  simplifySettlement: trip.simplifySettlement ?? true,
});

const latestTripFrom = (trip: ServerTrip, roster: RosterEntry[]): LatestTrip => {
  const participants = namesFromIds(trip.participantMembershipIds ?? [], roster);
  return {
    name: trip.title,
    start: trip.startDate,
    end: trip.endDate,
    region: trip.regionName ?? "지역 미정",
    note: trip.summary ?? "",
    ...(participants.length ? { participants } : {}),
  };
};

const sampleDate = (daysFromToday: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const sampleDateRange = (start: string, end: string) => {
  const startMonth = Number(start.slice(5, 7));
  const startDay = Number(start.slice(8, 10));
  const endMonth = Number(end.slice(5, 7));
  const endDay = Number(end.slice(8, 10));
  return startMonth === endMonth
    ? `${startMonth}월 ${startDay}일 — ${endDay}일`
    : `${startMonth}월 ${startDay}일 — ${endMonth}월 ${endDay}일`;
};

/**
 * 함께한 시작일부터 오늘까지의 일수.
 *
 * 시작한 날을 1일째로 센다. 한국어 "사귄 지 N일째"가 그렇게 읽히고, 그래야
 * 시작한 날 화면에 0이 뜨지 않는다. 두 날짜 모두 정오 기준으로 맞춰
 * 서머타임이나 시간대 차이로 하루가 어긋나지 않게 한다.
 *
 * 입력은 "2023. 10. 20"이나 "2023-10-20" 어느 쪽이든 받는다.
 * 날짜로 읽을 수 없으면 null을 준다.
 */
const daysSince = (from: string, todayKey: string): number | null => {
  const digits = from.match(/\d+/g);
  if (!digits || digits.length < 3) return null;
  const [year, month, day] = digits.map(Number);
  const start = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || start.getMonth() !== month - 1) return null;
  const today = new Date(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10)),
    12, 0, 0, 0,
  );
  const days = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
  return days > 0 ? days : null;
};

/**
 * 여행 며칠째의 날짜 이름. 상세 화면의 날짜 선택지와 같은 "22일(토)" 형식이다.
 *
 * 예시 여행의 날짜는 오늘을 기준으로 만들어지므로 지출의 날짜도 같은 규칙으로
 * 계산해야 한다. 글자로 박아 두면 날이 지날수록 어긋난다.
 */
const sampleTripDay = (startKey: string, offset: number) => {
  const [year, month, day] = startKey.split("-").map(Number);
  const date = new Date(year, month - 1, day + offset, 12, 0, 0, 0);
  return `${date.getDate()}일(${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]})`;
};

/** 예시 지출 한 건. 여행마다 다른 목록을 만들려고 짧게 쓴다. */
const sampleExpense = (
  id: string,
  startKey: string,
  offset: number,
  title: string,
  amount: number,
  category: Expense["category"],
  payer: string,
  /** 몫을 지는 사람과 비중. 없으면 참가자 전원이 똑같이 나눈다. */
  shares?: Record<string, number>,
  memo = "",
): Expense => ({
  id,
  day: sampleTripDay(startKey, offset),
  title,
  amount,
  category,
  payer,
  shares,
  memo,
});

const upcomingSampleStart = sampleDate(12);
const upcomingSampleEnd = sampleDate(14);
const recentSampleStart = sampleDate(-23);
const recentSampleEnd = sampleDate(-22);
const archiveSampleStart = sampleDate(-45);
const archiveSampleEnd = sampleDate(-43);

/**
 * 예시 여행 하나를 만든다.
 *
 * 일정·장소·준비물 같은 처음 내용을 여행에 바로 붙인다. 상세 화면이 열릴 때
 * 채우면 홈 카드도 찾기도 이 여행에 무엇이 들어 있는지 알 수 없다.
 * 지출은 여행마다 달라서 부르는 쪽에서 넘긴다.
 */
const sampleTrip = (trip: Omit<Trip, "sample" | "planning"> & { expenses: Expense[] }): Trip => {
  const { expenses, ...rest } = trip;
  return {
    ...rest,
    sample: true,
    planning: { ...sampleTripPlanning(rest.name, rest.start, rest.end, ["하늘", "여울"]), expenses },
  };
};

const trips: Trip[] = [
  sampleTrip({
    name: "전주 한옥마을",
    date: sampleDateRange(upcomingSampleStart, upcomingSampleEnd),
    note: "숙소에서 수다와 버섯전골",
    tone: 0,
    mark: upcomingSampleStart.slice(5, 7),
    region: "전북",
    start: upcomingSampleStart,
    end: upcomingSampleEnd,
    // 아직 안 떠난 여행이라 미리 낸 것만 있다.
    expenses: [
      sampleExpense("jj-1", upcomingSampleStart, 0, "KTX 왕복 예매", 47200, "교통", "하늘", { 하늘: 1 }),
      sampleExpense("jj-2", upcomingSampleStart, 0, "달빛한옥 예약금", 90000, "숙박", "하늘"),
    ],
  }),
  sampleTrip({
    name: "강릉 안목",
    date: sampleDateRange(recentSampleStart, recentSampleEnd),
    note: "보드게임과 야식 장보기",
    tone: 5,
    mark: recentSampleStart.slice(5, 7),
    region: "강원",
    start: recentSampleStart,
    end: recentSampleEnd,
    expenses: [
      sampleExpense("gn-1", recentSampleStart, 0, "시외버스 왕복", 28000, "교통", "여울", { 여울: 1 }),
      sampleExpense("gn-2", recentSampleStart, 0, "안목 카페 거리", 39000, "식비", "하늘"),
      sampleExpense("gn-3", recentSampleStart, 0, "바다뷰 숙소 1박", 120000, "숙박", "여울"),
      sampleExpense("gn-4", recentSampleStart, 1, "보드게임 카페", 24000, "기타", "하늘"),
      sampleExpense("gn-5", recentSampleStart, 1, "야식 장보기", 31800, "식비", "여울", undefined, "치킨과 맥주"),
    ],
  }),
  sampleTrip({
    name: "여수",
    date: sampleDateRange(archiveSampleStart, archiveSampleEnd),
    note: "바다 산책과 단체 사진",
    tone: 3,
    mark: archiveSampleStart.slice(5, 7),
    region: "전남",
    start: archiveSampleStart,
    end: archiveSampleEnd,
    expenses: [
      sampleExpense("ys-1", archiveSampleStart, 0, "KTX 왕복", 96000, "교통", "하늘"),
      sampleExpense("ys-2", archiveSampleStart, 0, "회 정식 저녁", 58000, "식비", "여울"),
      sampleExpense("ys-3", archiveSampleStart, 0, "게스트하우스 2박", 90000, "숙박", "하늘"),
      sampleExpense("ys-4", archiveSampleStart, 1, "해상 케이블카", 30000, "입장료", "여울"),
      sampleExpense("ys-5", archiveSampleStart, 1, "택시", 12000, "교통", "하늘"),
      sampleExpense("ys-6", archiveSampleStart, 2, "기념품 수제 엽서", 15000, "쇼핑", "여울", { 여울: 1 }),
    ],
  }),
];
const initialTripsByGroup: Record<GroupId, Trip[]> = {
  ours: [trips[0]],
  friends: trips,
  family: [
    sampleTrip({
      name: "속초",
      date: "10월 3일 — 4일",
      note: "가족과 천천히 걷는 가을 여행",
      tone: 1,
      mark: "10",
      region: "강원",
      start: "2026-10-03",
      end: "2026-10-04",
      expenses: [
        sampleExpense("sc-1", "2026-10-03", 0, "설악산 입장료", 16000, "입장료", "하늘"),
        sampleExpense("sc-2", "2026-10-03", 0, "물회 점심", 52000, "식비", "여울"),
        sampleExpense("sc-3", "2026-10-03", 0, "펜션 1박", 150000, "숙박", "하늘"),
      ],
    }),
  ],
};

const tripStorageKey = "daymo.trip-data.v1";

/**
 * 기기에 적어 둘 모양.
 *
 * 웹에서는 아직 못 올린 사진을 적지 않는다. 웹은 고른 사진을 `data:` 로 들고 있는데,
 * 여행이 끝나고 수십 장을 한꺼번에 올리는 동안 그것까지 적으면 브라우저 저장소(몇 MB)가
 * 금방 차서 기록 전체가 저장되지 않는다. 어차피 탭을 새로 열면 그 자리는 죽어 있어
 * 적어 두어도 쓸 수 없다. 올라간 사진은 파일 자리가 비어 있어 그대로 적힌다.
 */
const storableTrips = (groups: Record<string, Trip[]>): Record<string, Trip[]> => {
  if (Platform.OS !== "web") return groups;
  const 덜어낸다 = (trip: Trip): Trip => {
    const photos = trip.planning?.memories?.photos;
    if (!photos?.some((photo) => photo.uri)) return trip;
    return {
      ...trip,
      planning: {
        ...trip.planning,
        memories: { ...trip.planning!.memories!, photos: photos.filter((photo) => !photo.uri) },
      },
    };
  };
  return Object.fromEntries(Object.entries(groups).map(([id, trips]) => [id, trips.map(덜어낸다)]));
};

const isStoredTrip = (value: unknown): value is Trip => {
  if (!value || typeof value !== "object") return false;
  const trip = value as Partial<Trip>;
  return typeof trip.name === "string"
    && typeof trip.date === "string"
    && typeof trip.note === "string"
    && typeof trip.tone === "number"
    && typeof trip.mark === "string"
    && typeof trip.region === "string"
    && typeof trip.start === "string"
    && typeof trip.end === "string";
};

/**
 * 저장된 계획 데이터의 모양을 본다.
 *
 * 여행 자체는 통과시키고 계획만 버리는 쪽이 낫다. 필드 하나가 어긋났다고
 * 여행을 통째로 지우면 사용자가 적어 둔 이름과 날짜까지 사라진다.
 */
const isStoredPlanning = (value: unknown): value is TripPlanningData => {
  if (!value || typeof value !== "object") return false;
  const planning = value as Partial<TripPlanningData>;
  // 있으면 모양이 맞아야 하고, 없는 건 없는 대로 둔다. 예시 여행처럼 지출만
  // 심어 둔 계획도 있어서 셋을 다 요구하면 그런 데이터가 통째로 버려진다.
  const listShape = (list: unknown) => list === undefined || Array.isArray(list);
  return listShape(planning.schedule)
    && listShape(planning.places)
    && listShape(planning.expenses)
    && (planning.stay === undefined || typeof planning.stay === "object");
};

const parseStoredTripData = (raw: string | null) => {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as {
      tripsByGroup?: Partial<Record<GroupId, unknown>>;
      done?: unknown;
    };
    if (!saved.tripsByGroup) return null;
    const restored: Record<GroupId, Trip[]> = {};
    Object.entries(saved.tripsByGroup).forEach(([groupId, groupTrips]) => {
      if (groupId.length > 0 && groupId.length <= 64 && Array.isArray(groupTrips)) {
        restored[groupId] = groupTrips.filter(isStoredTrip).map((trip) =>
          trip.planning && !isStoredPlanning(trip.planning)
            ? { ...trip, planning: undefined }
            : trip,
        );
      }
    });
    if (!Object.keys(restored).length) return null;
    return {
      tripsByGroup: restored,
      done: Array.isArray(saved.done)
        ? saved.done.filter((item): item is string => typeof item === "string")
        : ["charger", "toiletries"],
    };
  } catch {
    return null;
  }
};

// 저장된 설정과 공간 목록은 App이 실행 화면 뒤에서 미리 읽어 넘겨준다. 여기서
// 읽으면 기본값으로 한 번 그린 뒤 바뀌어 화면이 튄다.
/**
 * 자주 묻는 것.
 *
 * 예전에는 "도움말" 을 눌러도 한 문장짜리 소개만 떠서, 답을 찾으러 들어온
 * 사람이 아무것도 못 얻고 닫았다. 지금 실제로 헷갈리는 것들만 적는다.
 */
/** 화면에 적는 버전. package.json 과 app.json 의 version 과 같이 올린다. */
const appVersion = "0.1.0";

/**
 * 이메일 바꾸기를 요청한 뒤 얼마 동안, 얼마마다 서버에 다시 물을지.
 *
 * 링크를 누르기 전에는 서버도 바뀌지 않아서 미리 물어봐야 할 것이 없다. 링크가 사는
 * 30분을 다 두드리는 대신 사람이 메일함을 다녀올 만한 10분만 본다. 그 뒤로는 앱이
 * 다시 앞으로 올 때와 계정 화면을 열 때 맞춰진다.
 */
const EMAIL_CHANGE_WATCH_MS = 10 * 60_000;
const EMAIL_CHANGE_CHECK_MS = 20_000;

const helpTopics = [
  {
    q: "적은 게 다른 사람에게도 보이나요?",
    a: "네, 같은 공간 멤버에게 보여요. 여행의 일정·장소·준비물·요리·비용·메모·일기·사진이 계정에 저장돼 멤버와 함께 보고 고쳐요. 여행 상세를 열어 둔 동안 저장되고, 연결이 끊기면 다시 연결될 때 저장해요.",
  },
  {
    q: "준비물 담당과 지출의 몫은 누구 중에서 고르나요?",
    a: "여행마다 정한 참가자예요. 여행을 만들거나 고칠 때 '누가 함께 가나요?' 에서 공간 멤버 중 이번에 가는 사람만 고르면 돼요.",
  },
  {
    q: "정산에서 '보냈어요' 를 누르면 돈이 가나요?",
    a: "아니요. 실제 송금은 은행이나 송금 앱에서 하고, 여기에는 보냈다고 적어만 둬요. 적으면 남은 금액이 줄어들고 되돌릴 수도 있어요.",
  },
  {
    q: "멤버는 어떻게 초대하나요?",
    a: "우리 → 멤버에서 초대 링크를 보내면 받은 사람이 로그인하고 이메일을 확인한 뒤 바로 함께해요. 권한 바꾸기와 내보내기는 관리자가 할 수 있어요.",
  },
];

/**
 * 「찾기」의 미리 받기가 한 번에 고르는 여행 수.
 *
 * 한 묶음이 끝나면 다음 묶음을 이어 부른다. 여행이 많은 공간에서 스무 개를 한 번에
 * 잡아 두면 요청 줄 맨 뒤가 길어져, 그동안 사용자가 연 화면이 그 뒤에 서게 된다.
 */
const PREFETCH_BATCH = 6;

export function WarmAppShell({
  settings = defaultDeviceSettings,
  spaces: storedSpaces = defaultSpaces,
  me: storedUser = defaultMe,
}: {
  settings?: DeviceSettings;
  spaces?: Space[];
  me?: Me | null;
}) {
  const systemScheme = useColorScheme();
  const [view, setView] = useState<MainView>("홈");
  const [isTripOpen, setTripOpen] = useState(false);
  const [openTripCreator, setOpenTripCreator] = useState(false);
  // 카카오톡 공지를 통째로 붙여넣어 지난 여행을 채우는 시트. 「여행」 탭에서 연다.
  const [openNoticeImport, setOpenNoticeImport] = useState(false);
  const [tripDestination, setTripDestination] =
    useState<TripDetailDestination>("overview");
  const [done, setDone] = useState<string[]>(["charger", "toiletries"]);
  // 공간과 멤버는 앱 전체가 같은 것을 봐야 한다. 예전에는 "우리" 탭 안의
  // state 와 모듈 상수 두 벌로 나뉘어 있어서, 멤버 이름을 고쳐도 여행의 참가자
  // 목록에는 옛 이름이 남았다.
  const [spaces, setSpaces] = useState<Space[]>(storedSpaces);
  const [serverDataReady, setServerDataReady] = useState(false);
  const [spacesReload, setSpacesReload] = useState(0);
  /**
   * 받아 둔 초대. `ask` 면 참여 전에 사람에게 한 번 더 묻는다(앱 링크로 열렸을 때).
   *
   * 웹에서 온 초대는 첫 렌더 전에 집는다. 주소에 token 이 있으면 꺼내면서 바로 지우고,
   * 로그인 전이라 못 쓰고 지나간 것이 있으면 보관함에서 되찾는다(inviteHandoff.ts).
   */
  const [pendingInvite, setPendingInvite] = useState<{ token: string; ask: boolean } | null>(() => {
    const token = takePageInvite();
    return token ? { token, ask: false } : null;
  });
  const [serverDataError, setServerDataError] = useState(false);
  useSaveSpaces(spaces);
  const [activeGroupId, setActiveGroupId] = useState<GroupId>(
    settings.activeGroupId,
  );
  const activeGroupRef = useRef(activeGroupId);
  useEffect(() => {
    activeGroupRef.current = activeGroupId;
  }, [activeGroupId]);
  const activeSpace = spaces.find((space) => space.id === activeGroupId) ?? spaces[0] ?? {
    id: "pending",
    name: "첫 여행 공간",
    members: [],
    relationship: "친구" as const,
    since: sampleDate(0),
  };
  // 공간 이름·관계·함께한 날을 서버에 저장한다.
  //
  // 화면은 바로 바꾸고 저장은 뒤에서 한다. 이름은 글자마다 바뀌어서 잠깐 모았다가
  // 한 번만 보낸다. 저장이 실패하면 조용히 넘기지 않고 화면에 알린다. 다음에
  // 서버에서 다시 받으면 되돌아가는데, 사용자는 그 사이 저장됐다고 믿고 있게 된다.
  const [spaceSaveState, setSpaceSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const pendingSpaceChange = useRef<{ spaceId: string; relationshipType?: string; change: SpaceChange } | null>(null);
  const spaceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceSaveSeq = useRef(0);
  useEffect(() => () => {
    if (spaceSaveTimer.current) clearTimeout(spaceSaveTimer.current);
  }, []);
  const flushSpaceSave = () => {
    if (spaceSaveTimer.current) {
      clearTimeout(spaceSaveTimer.current);
      spaceSaveTimer.current = null;
    }
    const pending = pendingSpaceChange.current;
    pendingSpaceChange.current = null;
    if (!pending) return;
    const patch = spacePatchFrom(pending.change, pending.relationshipType);
    if (!patch) return;
    // 늦게 끝난 앞 요청이 뒤 요청의 결과를 덮지 않게 번호를 붙인다.
    const seq = ++spaceSaveSeq.current;
    setSpaceSaveState("saving");
    updateSpace(pending.spaceId, patch)
      .then((saved) => {
        // 이름과 날짜는 받아 온 값으로 덮지 않는다. 그 사이 사용자가 더 쳤을 수 있다.
        // 서버만 아는 값(저장된 관계 원본, 내 권한)만 맞춘다.
        setSpaces((current) => current.map((space) => space.id === saved.id
          ? { ...space, relationshipType: saved.relationshipType, myRole: roleFromServer(saved.myRole) }
          : space));
        if (seq === spaceSaveSeq.current) setSpaceSaveState("saved");
      })
      .catch(() => {
        if (seq === spaceSaveSeq.current) setSpaceSaveState("failed");
      });
  };
  const updateActiveSpace = (change: Partial<Space>) => {
    setSpaces((current) => current.map((space) =>
      space.id === activeSpace.id ? { ...space, ...change } : space));

    const serverChange: SpaceChange = {};
    if (change.name !== undefined) serverChange.name = change.name;
    if (change.relationship !== undefined) serverChange.relationship = change.relationship;
    if (change.since !== undefined) serverChange.since = change.since;
    // 서버는 관리자만 받는다. 권한이 없는데 보내면 실패만 보인다.
    if (!Object.keys(serverChange).length || !canEditSpace(activeSpace.myRole)) return;

    // 다른 공간에 대한 저장이 기다리고 있으면 먼저 보낸다. 섞이면 엉뚱한 공간에 저장된다.
    if (pendingSpaceChange.current && pendingSpaceChange.current.spaceId !== activeSpace.id) {
      flushSpaceSave();
    }
    pendingSpaceChange.current = {
      spaceId: activeSpace.id,
      relationshipType: activeSpace.relationshipType,
      change: { ...(pendingSpaceChange.current?.change ?? {}), ...serverChange },
    };
    if (spaceSaveTimer.current) clearTimeout(spaceSaveTimer.current);
    spaceSaveTimer.current = setTimeout(flushSpaceSave, change.name !== undefined ? 700 : 0);
  };
  const [tripsByGroup, setTripsByGroup] = useState(initialTripsByGroup);
  const [tripStorageReady, setTripStorageReady] = useState(false);
  // 저장이 막히면 조용히 넘어가지 않는다. 사용자는 적은 게 남았다고 믿는데
  // 앱을 다시 열면 사라진다. 가장 흔한 원인은 용량 초과다.
  const [tripStorageFailed, setTripStorageFailed] = useState(false);
  // 공간마다 다음 쪽을 가리키는 cursor. 없으면 그 공간의 여행을 다 받았다는 뜻이다.
  const [tripCursors, setTripCursors] = useState<Record<string, string | null>>({});
  const tripItems = tripsByGroup[activeSpace.id as GroupId] ?? [];
  const setTripItems: React.Dispatch<React.SetStateAction<Trip[]>> = (update) =>
    setTripsByGroup((current) => ({
      ...current,
      [activeSpace.id]:
        typeof update === "function" ? update(current[activeSpace.id as GroupId] ?? []) : update,
    }));
  const [selectedTrip, setSelectedTrip] = useState<Trip>(trips[0]);
  const [themeId, setThemeId] = useState<ThemeId>(settings.themeId);

  const [appearance, setAppearance] = useState<AppearanceMode>(
    settings.appearance,
  );
  useSaveSettings({ themeId, appearance, activeGroupId, since: activeSpace.since });
  const [user, setUser] = useState<DaymoUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOffline, setAuthOffline] = useState(false);
  // 로그아웃된 뒤 로그인 화면에 한 번 띄울 안내. 계정 삭제를 요청한 직후에 쓴다.
  const [authNotice, setAuthNotice] = useState("");
  useSaveMe(user);
  useEffect(() => {
    let active = true;
    restoreSession()
      .then((session) => {
        if (!active) return;
        setUser(session?.user ?? null);
        setAuthOffline(session?.offline ?? false);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * 서버의 내 정보를 다시 받아 화면을 맞춘다.
   *
   * 이메일은 새 주소로 간 링크를 눌러야 바뀐다. 링크는 메일함이 있는 다른 기기나
   * 다른 탭에서 눌리기 때문에, 열어 둔 이 화면은 스스로 알아차리지 못한다.
   *
   * 이름은 서버 값으로 덮지 않는다. 계정 화면에서 고치는 중이면 조금 뒤에 저장되는데,
   * 그 사이에 덮으면 치던 글자가 눈앞에서 되돌아간다(저장된 세션에는 서버 값이 적힌다).
   */
  const syncMe = useCallback(async () => {
    const fresh = await refreshMe();
    if (!fresh) return null;
    setUser((current) => (current ? { ...current, ...fresh, name: current.name } : current));
    return fresh;
  }, []);
  /**
   * 서버에서 다시 받는다. 공간·여행 목록과, 열려 있는 여행 상세의 목록들까지.
   *
   * 폴링은 하지 않는다. 옆 사람이 넣은 일정은 이 세 순간에 들어온다.
   * 앞으로 돌아왔을 때 · 당겨서 새로고침(웹은 버튼) · 상세를 오래 열어 뒀을 때 한 번.
   */
  const [refreshing, setRefreshing] = useState(false);
  const refreshedAt = useRef(0);
  const refreshAll = useCallback(() => {
    refreshedAt.current = Date.now();
    setRefreshing(true);
    setSpacesReload((value) => value + 1);
    return reloadOpenLists();
  }, []);
  // 앱이 다시 앞으로 올 때. 웹에서는 탭으로 돌아올 때다. 메일의 링크를 누르고
  // 돌아오는 길이 대개 이쪽이라, 따로 두드리지 않아도 여기서 맞춰진다.
  useEffect(() => {
    if (!user?.id) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void syncMe();
      // 탭을 자주 오가는 사람이 옮길 때마다 다 받으면 폴링과 다를 게 없다.
      if (shouldRefetch(refreshedAt.current, Date.now())) void refreshAll();
    });
    return () => subscription?.remove();
  }, [refreshAll, syncMe, user?.id]);
  /**
   * 이메일 바꾸기를 요청한 직후에만 조금 더 자주 확인한다.
   *
   * 앞으로 오는 것만으로는 부족한 때가 있다. 링크를 옆 기기에서 누르고 이 화면은
   * 그대로 두는 경우다. 그렇다고 늘 두드리지는 않는다. 바뀌었거나 링크가 죽으면 멈춘다.
   */
  const [emailWatch, setEmailWatch] = useState<{ since: number; from: string } | null>(null);
  useEffect(() => {
    if (!emailWatch) return;
    const timer = setInterval(() => {
      if (Date.now() - emailWatch.since > EMAIL_CHANGE_WATCH_MS) {
        setEmailWatch(null);
        return;
      }
      void syncMe().then((fresh) => {
        if (fresh && fresh.email !== emailWatch.from) setEmailWatch(null);
      });
    }, EMAIL_CHANGE_CHECK_MS);
    return () => clearInterval(timer);
  }, [emailWatch, syncMe]);

  // 서버 참가자 id 를 이름으로 바꿀 때 내 이름이 필요하다. 이름을 칠 때마다 공간을
  // 새로 불러오면 안 되니 effect 의존성 대신 ref 로 읽는다.
  const userNameRef = useRef(user?.name ?? "");
  useEffect(() => {
    userNameRef.current = user?.name ?? "";
  }, [user?.name]);

  useEffect(() => {
    // 기기에 저장된 여행을 다 읽은 뒤에 서버 목록을 붙인다. 먼저 붙이면 뒤늦게
    // 읽힌 기기 목록이 서버 목록을 덮거나, 서버 목록이 아직 안 읽힌 기록을 버린다.
    if (!user?.id || !tripStorageReady) return;
    let active = true;
    listSpaces()
      .then(async (serverSpaces) => {
        const [tripPages, memberLists] = await Promise.all([
          Promise.all(serverSpaces.map((space) => listTripsPage(space.id))),
          Promise.all(serverSpaces.map((space) => listMembers(space.id))),
        ]);
        if (!active) return;
        const nextSpaces = serverSpaces.map((space, index) => spaceFromServer(space, memberLists[index]));
        const myName = userNameRef.current;
        const nextTrips: Record<string, Trip[]> = {};
        const nextCursors: Record<string, string | null> = {};
        serverSpaces.forEach((space, index) => {
          const roster = rosterOfSpace(nextSpaces[index], myName);
          nextTrips[space.id] = tripPages[index].items.map((trip) => tripFromServer(trip, roster));
          // 여행이 한 쪽에 다 들어가지 않았으면 여기서부터 이어 받는다.
          nextCursors[space.id] = tripPages[index].nextCursor;
        });
        setTripCursors(nextCursors);
        setSpaces(nextSpaces);
        // 서버 목록으로 통째로 바꾸지 않는다. 일정·장소·비용 같은 기록은 아직
        // 기기에만 있어서, 바꾸면 앱을 켤 때마다 적어 둔 것이 사라진다.
        // 첫 쪽만 받았으면 아직 안 온 뒤쪽 여행을 버리지 않는다. 버리면 아래로 내려
        // 받아 둔 여행이 새로고침 한 번에 기기 기록과 함께 사라진다.
        const 더_있는_공간 = Object.fromEntries(
          Object.entries(nextCursors).map(([space, cursor]) => [space, !!cursor]),
        );
        setTripsByGroup((current) =>
          mergeServerTripsByGroup(nextTrips, current, 더_있는_공간) as Record<GroupId, Trip[]>);
        // 지금 보고 있는 공간과 비교한다. 처음 읽은 설정 값과 비교하면, 초대로 들어간
        // 공간으로 옮겨 가자마자 첫 공간으로 되돌아간다.
        if (nextSpaces[0] && !nextSpaces.some((space) => space.id === activeGroupRef.current)) {
          setActiveGroupId(nextSpaces[0].id as GroupId);
        }
        setServerDataError(false);
      })
      .catch(() => {
        if (active) setServerDataError(true);
      })
      .finally(() => {
        if (!active) return;
        setServerDataReady(true);
        setRefreshing(false);
      });
    return () => {
      active = false;
    };
    // spacesReload 는 초대로 들어오거나 멤버가 바뀌었을 때 다시 받으려고 올린다.
  }, [settings.activeGroupId, spacesReload, tripStorageReady, user?.id]);
  /**
   * 초대 token 을 받아 둔다. 로그인 전이면 로그인·가입이 끝난 뒤에 이어서 참여한다.
   *
   * 두 갈래로 들어온다. 앱은 `daymo://invite?token=` 로 열리고, 이때는 링크를 연
   * 것만으로 들어가지 않게 사람에게 한 번 더 묻는다(`ask`). 웹은 주소의 `?invite=`
   * 로 오고, 이미 브라우저에서 링크를 누른 것이라 묻지 않고 바로 참여한다.
   */
  useEffect(() => {
    const take = (url: string | null) => {
      const token = inviteTokenOf(url);
      if (token) setPendingInvite({ token, ask: true });
    };
    Linking.getInitialURL().then(take).catch(() => undefined);
    const subscription = Linking.addEventListener("url", ({ url }) => take(url));
    return () => subscription.remove();
  }, []);
  const joinInvite = async (token: string) => {
    const joined = await acceptInvite(token);
    forgetPageInvite();
    activeGroupRef.current = joined.spaceId as GroupId;
    setActiveGroupId(joined.spaceId as GroupId);
    setSpacesReload((value) => value + 1);
    return joined;
  };
  /** 초대로 참여하고 결과를 알린다. 앱에서 온 초대도 웹에서 온 초대도 여기로 모인다. */
  const runInvite = (token: string) => {
    joinInvite(token)
      .then((joined) => showAlert(joined.alreadyMember ? "이미 함께하고 있는 공간이에요" : "공간에 참여했어요"))
      .catch((error) => {
        if (error instanceof DaymoApiError && error.code === "EMAIL_NOT_VERIFIED") {
          // token 은 그대로 둔다. 메일을 확인하고 다시 누르면 바로 참여한다.
          showAlert("메일을 확인하면 바로 참여해요", "받은 메일의 링크를 누른 뒤 아래 버튼을 눌러 주세요.", [
            { text: "나중에", style: "cancel" },
            { text: "확인했어요", onPress: () => setPendingInvite({ token, ask: false }) },
          ]);
          return;
        }
        // 만료·폐기된 링크는 다시 시도해도 같다. 연결이 끊긴 것뿐이면 남겨 둔다.
        if (!(error instanceof DaymoApiError) || error.status !== 0) forgetPageInvite();
        showAlert("참여하지 못했어요", error instanceof DaymoApiError ? error.message : "잠시 후 다시 시도해 주세요.");
      });
  };
  useEffect(() => {
    if (!pendingInvite || !user?.id || !serverDataReady) return;
    const { token, ask } = pendingInvite;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingInvite(null);
    if (!ask) {
      runInvite(token);
      return;
    }
    showAlert("여행 공간 초대", "초대받은 공간에 참여할까요? 참여하면 이 공간의 여행을 함께 보고 고칠 수 있어요.", [
      { text: "나중에", style: "cancel" },
      { text: "참여하기", onPress: () => runInvite(token) },
    ]);
    // 받아 둔 token 이 생기거나 로그인이 끝났을 때만 묻는다. runInvite 는 렌더마다
    // 새로 만들어져서 의존성에 넣으면 참여를 두 번 시도한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvite, serverDataReady, user?.id]);
  /**
   * 이 기기에 남은 것을 전부 지운다.
   *
   * 계정 삭제와 다르다. 서버의 계정·공간·여행은 그대로 두고 이 기기의
   * 기록만 지운다. 화면에도 그렇게 적는다. 계정 삭제는 `AccountDeletionPanel`.
   */
  const wipeDevice = () => {
    void logout();
    void clearDevice([tripStorageKey, "daymo.device-settings.v1"]);
    setSpaces(defaultSpaces);
    setTripsByGroup(initialTripsByGroup);
    setUser(null);
  };
  // 이 공간에 속한 사람들. 나를 앞에 두고 초대한 멤버가 뒤따른다. 여행 상세는
  // 이 목록에서 이번 여행 참가자를 고른다.
  // 렌더마다 새 배열을 만들면 이 목록을 의존성으로 쓰는 곳이 매번 다시 돈다.
  // 이름이 겹치면 사람 표(`rosterOfSpace`)와 같은 번호를 붙인다. 고른 이름으로 id 를 찾는다.
  const activeSpaceMembers = useMemo(
    () => uniqueNames([user?.name ?? "나", ...activeSpace.members.map((member) => member.name)]),
    [activeSpace.members, user?.name],
  );
  const activeRoster = rosterOfSpace(activeSpace, user?.name ?? "");
  /**
   * 여행 목록의 다음 쪽을 이어 받는다.
   *
   * 서버는 한 번에 100 개까지만 준다. 그보다 많은 공간에서는 목록 화면을 아래로
   * 내릴 때 이어 받는다. 예전에는 첫 100 개가 끝이어서 오래된 여행이 아예 없는
   * 것처럼 보였다.
   *
   * 받은 쪽을 목록에 통째로 덮지 않고 뒤에 붙인다(`appendServerTrips`). 덮으면
   * 먼저 받은 여행이 기기에만 있던 일정·비용 기록과 함께 사라진다.
   */
  const tripPageInFlight = useRef(false);
  const [loadingMoreTrips, setLoadingMoreTrips] = useState(false);
  const loadMoreTrips = async () => {
    const spaceId = activeSpace.id;
    const cursor = tripCursors[spaceId];
    if (!cursor || tripPageInFlight.current) return;
    tripPageInFlight.current = true;
    setLoadingMoreTrips(true);
    try {
      const 다음_쪽 = await listTripsPage(spaceId, cursor);
      const 더한_것 = 다음_쪽.items.map((trip) => tripFromServer(trip, activeRoster));
      setTripsByGroup((current) => ({
        ...current,
        [spaceId]: appendServerTrips(
          current[spaceId as GroupId] ?? [],
          더한_것,
          Object.values(current).flat(),
        ) as Trip[],
      }));
      setTripCursors((current) => ({ ...current, [spaceId]: 다음_쪽.nextCursor }));
    } catch {
      // 연결이 끊겼거나 서버가 막았다. 다시 아래로 내리면 이 쪽부터 또 시도한다.
    } finally {
      tripPageInFlight.current = false;
      setLoadingMoreTrips(false);
    }
  };
  /**
   * 「찾기」가 훑을 수 있게, 아직 받아 본 적 없는 여행의 하위 목록을 미리 받아 둔다.
   *
   * 기기 기록은 여행 상세를 이 기기에서 열어야 채워진다. 그래서 새 기기나 웹으로 처음
   * 들어온 사람은 찾기가 텅 비었다. 서버에는 검색 API 가 없어 목록을 그대로 받아 채운다.
   *
   * 아직 못 올린 기기의 변경을 덮지 않는 것이 가장 중요하다. 세 겹으로 막는다.
   *
   * 1. `pickTripsToPrefetch` 가 이 기기에서 한 번도 받아 본 적 없는 여행만 고른다.
   *    줄도 맞춘 적도 없는 여행이라 덮어쓸 것이 없다.
   * 2. 넣기 직전에 그 조건을 한 번 더 본다(`neverFetched`). 받는 사이에 사용자가 그
   *    여행을 열어 적었으면 받아 온 것을 버린다.
   * 3. 합칠 때는 상세 화면과 같은 규칙을 쓴다(`mergeListOnOpen` + `syncedIds`).
   *
   * 실패하면 조용히 넘기고 표시를 지운다. 다음에 찾기를 다시 열 때 그 여행부터 받는다.
   */
  const [searchPrefetching, setSearchPrefetching] = useState(false);
  // 이번에 받아 둔(또는 받고 있는) 여행. 같은 것을 두 번 받지 않는다.
  const prefetchedTripIds = useRef(new Set<string>());
  const prefetchAlive = useRef(true);
  useEffect(() => {
    prefetchAlive.current = true;
    return () => {
      prefetchAlive.current = false;
    };
  }, []);
  // 받아 온 것을 넣을 때 읽는 최신 값들. 미리 받기가 도는 동안 바뀐다.
  const prefetchInputs = useRef({
    trips: tripItems,
    roster: activeRoster,
    spaceId: activeSpace.id,
    openTripId: undefined as string | undefined,
  });
  // 미리 받기 효과보다 먼저 적어 둔다. 효과는 선언한 차례대로 돈다.
  useEffect(() => {
    prefetchInputs.current = {
      trips: tripItems,
      roster: activeRoster,
      spaceId: activeSpace.id,
      openTripId: isTripOpen ? selectedTrip.id : undefined,
    };
  });
  const storePrefetched = (spaceId: string, tripId: string, fetched: FetchedTripLists) => {
    const roster = prefetchInputs.current.roster;
    setTripsByGroup((current) => {
      const group = current[spaceId as GroupId];
      const index = group?.findIndex((trip) => trip.id === tripId) ?? -1;
      if (!group || index < 0) return current;
      const trip = group[index];
      // 상세 화면이 열려 있으면 그 여행의 주인은 상세다. 닫을 때 제 기록을 덮어쓴다.
      if (tripId === prefetchInputs.current.openTripId || !neverFetched(trip.planning)) return current;
      const { diaries, photos, ...lists } = mergePrefetchedLists(trip.planning, fetched, {
        tripDates: tripDateKeys(trip.start, trip.end),
        roster,
      });
      const planning: TripPlanningData = {
        ...trip.planning,
        ...lists,
        // 기념 카드는 서버(`trip_cards`)에 있다. 여기서는 사진과 일기만 채운다.
        ...(diaries.length || photos.length
          ? {
            memories: {
              ...trip.planning?.memories,
              diaries,
              photos,
            },
          }
          : {}),
      };
      const next = [...group];
      next[index] = { ...trip, planning };
      return { ...current, [spaceId]: next };
    });
  };
  /**
   * 여행 하나의 하위 목록 아홉 개를 받는다. 한꺼번에 부르지 않고 하나씩 이어 받는다.
   *
   * 예전에는 `Promise.all` 로 아홉 개를 한 번에 보냈다. 미리 받기가 여행 두셋을 동시에
   * 돌리므로 그것만으로 스무 건이 한 순간에 나갔고, 앞단의 초당 제한에 걸린 몇 개가
   * 브라우저에서는 CORS 오류로 보여 찾기가 조용히 비었다.
   *
   * `background` 로 줄 맨 뒤에 선다. 지금 보고 있는 화면의 요청이 먼저 나간다.
   */
  const fetchTripLists = async (tripId: string): Promise<FetchedTripLists> => {
    const 뒤로: RequestPace = { background: true };
    return {
      places: await listTripPlaces(tripId, 뒤로),
      schedule: await listScheduleItems(tripId, 뒤로),
      stays: await listStays(tripId, 뒤로),
      packing: await listChecklistItems(tripId, 뒤로),
      recipes: await listRecipes(tripId, 뒤로),
      expenses: await listExpenses(tripId, 뒤로),
      memos: await listMemos(tripId, 뒤로),
      diaries: await listDiaries(tripId, 뒤로),
      photos: await listPhotos(tripId, 뒤로),
    };
  };
  // 한 묶음을 다 받으면 올려서 다음 묶음을 부른다.
  const [prefetchRound, setPrefetchRound] = useState(0);
  useEffect(() => {
    if (view !== "찾기" || !user || !serverDataReady) return;
    const { trips: waiting, spaceId, openTripId } = prefetchInputs.current;
    const picked = pickTripsToPrefetch(waiting, {
      done: prefetchedTripIds.current,
      skipId: openTripId,
      limit: PREFETCH_BATCH,
    });
    if (!picked.length) return;
    picked.forEach((id) => prefetchedTripIds.current.add(id));
    setSearchPrefetching(true);
    // 여행 둘씩만 돌린다. 목록은 여행마다 하나씩 이어 받으므로 미리 받기가 줄에 세우는
    // 요청은 늘 둘이다. 나머지 자리는 화면이 쓴다.
    void runWithLimit(picked, 2, async (tripId) => {
      try {
        const fetched = await fetchTripLists(tripId);
        if (prefetchAlive.current) storePrefetched(spaceId, tripId, fetched);
      } catch {
        // 연결이 없거나 서버가 막았다. 다음에 찾기를 열 때 다시 받는다.
        prefetchedTripIds.current.delete(tripId);
      }
    }).finally(() => {
      if (!prefetchAlive.current) return;
      setSearchPrefetching(false);
      // 이 묶음이 꽉 찼으면 남은 여행이 더 있을 수 있다. 한 묶음씩 이어 간다.
      // 받은 여행은 `prefetchedTripIds` 에 남아 다시 고르지 않으므로 언젠가 멎는다.
      if (picked.length === PREFETCH_BATCH) setPrefetchRound((round) => round + 1);
    });
    // 탭을 열 때와 공간·여행 목록이 바뀔 때만 본다. 나머지 값은 ref 로 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeSpace.id, serverDataReady, tripItems.length, user?.id, prefetchRound]);
  /** 서버가 돌려준 여행으로 목록과 열린 여행을 바꾼다. 기기에만 있는 기록은 둔다. */
  const applyServerTrip = (saved: ServerTrip) => {
    const fromServer = tripFromServer(saved, activeRoster);
    const updated: Trip = {
      ...selectedTrip,
      ...fromServer,
      planning: fromServer.planning ? { ...selectedTrip.planning, ...fromServer.planning } : selectedTrip.planning,
    };
    setTripItems((current) => current.map((trip) => trip.id === saved.id ? updated : trip));
    setSelectedTrip(updated);
  };
  /**
   * 홈 카드 바탕 사진을 받아 둔다. 썸네일(480px)만 받는다.
   *
   * 여러 장을 표시본으로 받으면 카드를 넘길 때 걸린다. 못 받으면(연결 없음) 그대로
   * 둔다. 카드는 사진 없이 종이 그대로 그려지므로 깨진 그림이 남지 않는다.
   */
  const coverDownloads = useRef(new Set<string>());
  // 받아 둔 바탕 사진(사진 id → 자리). 껐다 켜거나 예전 사진으로 되돌려도 다시 받지 않는다.
  const coverPhotoUris = useRef(new Map<string, string>());
  /** 이 여행이 홈에 그릴 사진 가운데 아직 자리를 모르는 것. */
  const 모자란_사진 = (trip: Trip) =>
    (trip.coverPhotoIds ?? []).filter((id) => !isLivePhotoUri(trip.coverUris?.[id]));
  useEffect(() => {
    if (!tripItems.some((trip) => 모자란_사진(trip).length)) return;
    // 이미 받아 둔 사진이면 바로 얹는다. 받으러 가지 않는다.
    const 받아_둔 = (id: string) => {
      const uri = coverPhotoUris.current.get(id);
      return isLivePhotoUri(uri) ? uri : undefined;
    };
    if (tripItems.some((trip) => 모자란_사진(trip).some(받아_둔))) {
      setTripItems((current) => current.map((item) => {
        const 채울_것 = 모자란_사진(item).filter(받아_둔);
        if (!채울_것.length) return item;
        const coverUris = { ...item.coverUris };
        채울_것.forEach((id) => { coverUris[id] = 받아_둔(id) as string; });
        return { ...item, coverUris };
      }));
    }
    const missing = [...new Set(tripItems.flatMap((trip) =>
      모자란_사진(trip).filter((id) => !받아_둔(id) && !coverDownloads.current.has(id))))];
    if (!missing.length) return;
    missing.forEach((id) => coverDownloads.current.add(id));
    void (async () => {
      for (const photoId of missing) {
        try {
          const uri = await downloadPhoto(photoId, "thumbnail");
          if (!uri) continue;
          coverPhotoUris.current.set(photoId, uri);
          setTripItems((current) => current.map((item) =>
            (item.coverPhotoIds ?? []).includes(photoId)
              ? { ...item, coverUris: { ...item.coverUris, [photoId]: uri } }
              : item));
        } catch {
          coverDownloads.current.delete(photoId);
        }
      }
    })();
    // setTripItems 는 렌더마다 새로 만들어지는 함수라 의존성에 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripItems]);
  /**
   * 저장하다 버전이 어긋나면 최신 여행을 받아 반영하고 `TripConflictError` 로 알린다.
   * 상세 화면은 이 오류를 받으면 고치던 값을 버리고 최신 내용을 보여 준다.
   */
  const withLatestOnConflict = async (tripId: string, save: () => Promise<ServerTrip>) => {
    try {
      return await save();
    } catch (caught) {
      if (!(caught instanceof DaymoApiError) || caught.code !== "VERSION_CONFLICT") throw caught;
      const latest = await getTrip(tripId);
      applyServerTrip(latest);
      throw new TripConflictError(latestTripFrom(latest, activeRoster));
    }
  };
  /**
   * 상세를 닫으면 홈 카드 숫자를 다시 받는다.
   *
   * 방금 고친 것은 서버 요약보다 기록이 새롭다. 그래서 요약을 먼저 떼어 기록으로 보여
   * 주고, 상세가 닫히며 보낸 변경이 서버에 닿을 즈음 요약을 새로 받는다. 받지 못하면
   * (연결 없음) 기록을 그대로 보여 준다.
   */
  // 여행마다 따로 기다린다. 곧바로 다른 여행을 열고 닫아도 앞 여행의 요약을 받는다.
  const overviewTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = overviewTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);
  const refreshOverviewAfterDetail = (tripId: string | undefined) => {
    if (!tripId) return;
    const setOverview = (overview: ServerTripOverview | undefined) =>
      setTripsByGroup((current) => {
        const next = { ...current };
        for (const group of Object.keys(next) as GroupId[]) {
          next[group] = next[group].map((trip) => {
            if (trip.id !== tripId) return trip;
            const { overview: _old, ...rest } = trip;
            return overview ? { ...rest, overview } : rest;
          });
        }
        return next;
      });
    setOverview(undefined);
    const timers = overviewTimers.current;
    const waiting = timers.get(tripId);
    if (waiting) clearTimeout(waiting);
    timers.set(tripId, setTimeout(() => {
      timers.delete(tripId);
      getTrip(tripId)
        .then((saved) => setOverview(parseTripOverview(saved.overview)))
        .catch(() => undefined);
    }, OVERVIEW_REFRESH_MS));
  };
  const now = new Date();

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(tripStorageKey)
      .then((raw) => {
        if (!active) return;
        const saved = parseStoredTripData(raw);
        if (saved) {
          setTripsByGroup(saved.tripsByGroup);
          setDone(saved.done);
        }
      })
      .finally(() => {
        if (active) setTripStorageReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!tripStorageReady) return;
    AsyncStorage.setItem(tripStorageKey, JSON.stringify({ tripsByGroup: storableTrips(tripsByGroup), done }))
      .then(() => setTripStorageFailed(false))
      .catch(() => setTripStorageFailed(true));
  }, [done, tripStorageReady, tripsByGroup]);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  // 보관한 여행은 홈에 띄우지 않는다. 치워 둔 여행이 다음 여행으로 보이면 안 된다.
  const homeTrip = [...tripItems]
    .filter((trip) => trip.end >= todayKey && !trip.archived)
    .sort((left, right) => left.start.localeCompare(right.start))[0] ?? null;
  const theme = resolveTheme(
    themeId,
    appearance === "system" ? systemScheme === "dark" : appearance === "dark",
  );
  const openTrip = (
    destination: TripDetailDestination = "overview",
    trip: Trip = tripItems[0] ?? trips[0],
  ) => {
    setSelectedTrip(trip);
    setTripDestination(destination);
    setTripOpen(true);
  };
  if (!authReady) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: theme.muted }}>계정을 확인하고 있어요…</Text>
      </SafeAreaView>
    );
  }
  if (!user) {
    return <AuthScreen theme={theme} notice={authNotice} invited={Boolean(pendingInvite)} onAuth={(nextUser) => { setAuthNotice(""); setServerDataReady(false); setUser(nextUser); setAuthOffline(false); }} />;
  }
  if (user.deletionScheduledAt) {
    return (
      <DeletionPendingScreen
        theme={theme}
        user={user}
        scheduledAt={user.deletionScheduledAt}
        onCancelled={() => setUser((current) => (current ? { ...current, deletionScheduledAt: null } : current))}
        onLogout={() => { void logout(); setServerDataReady(false); setUser(null); }}
      />
    );
  }
  if (!serverDataReady && !authOffline) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: theme.muted }}>여행 공간을 불러오고 있어요…</Text>
      </SafeAreaView>
    );
  }
  if (serverDataReady && spaces.length === 0) {
    return (
      <FirstSpaceScreen
        theme={theme}
        onCreate={async (name, relationshipType) => {
          const created = await createSpace(name, relationshipType);
          const next = spaceFromServer(created);
          setSpaces([next]);
          setTripsByGroup({ [next.id]: [] } as Record<GroupId, Trip[]>);
          setActiveGroupId(next.id as GroupId);
          setServerDataError(false);
        }}
        onLogout={() => { void logout(); setServerDataReady(false); setUser(null); }}
      />
    );
  }
  if (isTripOpen)
    return (
      <WarmTripDetail
        key={tripDestination}
        done={done}
        initialDestination={tripDestination}
        tripId={selectedTrip.id}
        spaceId={activeSpace.myMembershipId ? activeSpace.id : undefined}
        canEditRecords={activeSpace.myRole === "관리자" || activeSpace.myRole === "편집 가능"}
        spaceRoster={activeRoster}
        tripName={selectedTrip.name}
        tripDate={selectedTrip.date}
        tripStart={selectedTrip.start}
        tripEnd={selectedTrip.end}
        tripRegion={selectedTrip.region}
        tripNote={selectedTrip.note}
        initialPlanning={selectedTrip.planning}
        spaceMembers={activeSpaceMembers}
        me={user?.name ?? activeSpaceMembers[0]}
        appTheme={theme}
        canEdit={!selectedTrip.id || activeSpace.myRole !== "보기만"}
        isOwner={activeSpace.myRole === "관리자"}
        myMembershipId={activeSpace.myMembershipId}
        onUpdateTrip={async (changes) => {
          if (!selectedTrip.id || selectedTrip.version === undefined) {
            const updated = { ...selectedTrip, ...changes, mark: changes.start.slice(5, 7) };
            setTripItems((current) => current.map((trip) => trip === selectedTrip ? updated : trip));
            setSelectedTrip(updated);
            return;
          }
          const tripId = selectedTrip.id;
          const saved = await withLatestOnConflict(tripId, async () => {
            let result = await updateTrip(tripId, {
              version: selectedTrip.version!,
              title: changes.name,
              startDate: changes.start,
              endDate: changes.end,
              regionName: changes.region,
              summary: changes.note,
            });
            if (changes.participants) {
              const { ids } = idsFromNames(changes.participants, activeRoster);
              if (ids.length && !sameIds(ids, result.participantMembershipIds ?? [])) {
                result = await setTripParticipants(tripId, { version: result.version, membershipIds: ids });
              }
            }
            return result;
          });
          applyServerTrip(saved);
        }}
        coverPhotoId={selectedTrip.coverPhotoId}
        coverCardId={selectedTrip.coverCardId}
        onUpdateHomeCover={selectedTrip.id && selectedTrip.version !== undefined ? async (고른_것, localUris) => {
          const tripId = selectedTrip.id as string;
          let saved: ServerTrip;
          try {
            saved = await updateHomeCover(tripId, selectedTrip.version!, 고른_것);
          } catch (caught) {
            if (!(caught instanceof DaymoApiError) || caught.code !== "VERSION_CONFLICT") throw caught;
            const latest = await getTrip(tripId);
            saved = await updateHomeCover(tripId, latest.version, 고른_것);
          }
          applyServerTrip(saved);
          // 홈이 바로 바뀌게, 고른 쪽이 기기에 들고 있는 사진을 그대로 얹는다. 없으면
          // 홈이 썸네일을 받아 채울 때까지(대개 한 박자) 종이 카드로 보인다.
          const 얹을_것 = Object.entries(localUris ?? {})
            .filter((줄): 줄 is [string, string] => isLivePhotoUri(줄[1]));
          if (얹을_것.length) {
            얹을_것.forEach(([id, uri]) => coverPhotoUris.current.set(id, uri));
            const 얹는다 = (trip: Trip) =>
              trip.id === tripId ? { ...trip, coverUris: { ...trip.coverUris, ...Object.fromEntries(얹을_것) } } : trip;
            setTripItems((current) => current.map(얹는다));
            setSelectedTrip(얹는다);
          }
        } : undefined}
        serverExpenseSettings={selectedTrip.serverExpenseSettings}
        onUpdateExpenseSettings={async (settings) => {
          if (!selectedTrip.id || selectedTrip.version === undefined) return;
          const tripId = selectedTrip.id;
          let saved: ServerTrip;
          try {
            saved = await updateExpenseSettings(tripId, selectedTrip.version, settings);
          } catch (caught) {
            // 통화나 예산은 마지막에 고친 값이 맞다. 다른 곳에서 여행을 먼저 고쳤으면
            // 최신 버전으로 한 번 더 보낸다(정산 묶기 잠금은 서버가 따로 막는다).
            if (!(caught instanceof DaymoApiError) || caught.code !== "VERSION_CONFLICT") throw caught;
            const latest = await getTrip(tripId);
            saved = await updateExpenseSettings(tripId, latest.version, settings);
          }
          applyServerTrip(saved);
        }}
        archived={Boolean(selectedTrip.archived)}
        onArchiveTrip={selectedTrip.id ? async (archived) => {
          applyServerTrip(await archiveTrip(selectedTrip.id as string, archived));
        } : undefined}
        onDeleteTrip={selectedTrip.id && activeSpace.myRole === "관리자" ? async () => {
          const tripId = selectedTrip.id as string;
          await deleteTrip(tripId);
          setTripItems((current) => current.filter((trip) => trip.id !== tripId));
          setTripOpen(false);
        } : undefined}
        onRefreshTrip={selectedTrip.id
          ? async () => applyServerTrip(await getTrip(selectedTrip.id as string))
          : undefined}
        onUpdateParticipants={async (names) => {
          if (!selectedTrip.id || selectedTrip.version === undefined) return names;
          const tripId = selectedTrip.id;
          const { ids } = idsFromNames(names, activeRoster);
          if (!ids.length) return names;
          const saved = await withLatestOnConflict(tripId, () =>
            setTripParticipants(tripId, { version: selectedTrip.version!, membershipIds: ids }));
          applyServerTrip(saved);
          const confirmed = namesFromIds(saved.participantMembershipIds ?? [], activeRoster);
          return confirmed.length ? confirmed : names;
        }}
        onSavePlanning={(planning) => {
          const updated = { ...selectedTrip, planning };
          setTripItems((current) => current.map((trip) => trip === selectedTrip ? updated : trip));
          setSelectedTrip(updated);
        }}
        onClose={() => {
          setTripOpen(false);
          refreshOverviewAfterDetail(selectedTrip.id);
        }}
      />
    );
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      {/* 저장이 막힌 동안만 뜬다. 경고창으로 막아 세우기보다, 적는 일을 계속하되
          남지 않는다는 사실은 계속 보이게 한다. */}
      {tripStorageFailed && (
        <View
          accessibilityLiveRegion="polite"
          style={[s.storageWarning, { backgroundColor: theme.accent }]}
        >
          <Text style={s.storageWarningText}>
            기기에 저장하지 못했어요. 앱을 다시 열면 최근에 적은 내용이 사라질 수 있어요.
          </Text>
        </View>
      )}
      {authOffline && (
        <View accessibilityLiveRegion="polite" style={[s.storageWarning, { backgroundColor: theme.accent }]}>
          <Text style={s.storageWarningText}>인터넷에 연결되지 않아 마지막으로 저장된 내용을 보여 줘요.</Text>
        </View>
      )}
      {serverDataError && !authOffline && (
        <View accessibilityLiveRegion="polite" style={[s.storageWarning, { backgroundColor: theme.accent }]}>
          <Text style={s.storageWarningText}>인터넷에 연결되지 않아 마지막으로 저장된 내용을 보여 줘요.</Text>
        </View>
      )}
      <View style={[s.body, { backgroundColor: "transparent" }]}>
        {view === "홈" && (
          <NotebookHome
            open={openTrip}
            goTrips={() => {
              setOpenTripCreator(true);
              setView("여행");
            }}
            theme={theme}
            trip={homeTrip}
            trips={tripItems}
            todayKey={todayKey}
            spaceName={activeSpace.name}
            relationship={activeSpace.relationship}
            since={activeSpace.since}
          />
        )}
        {view === "여행" && (
          <TripsExplorer
            open={(trip) => openTrip("overview", trip)}
            theme={theme}
            items={tripItems}
            setItems={setTripItems}
            spaceMembers={activeSpaceMembers}
            deletedTrips={activeSpace.myRole === "관리자" && activeSpace.myMembershipId
              ? {
                load: async (cursor) => {
                  const 쪽 = await listDeletedTripsPage(activeSpace.id, cursor);
                  return {
                    items: 쪽.items.map((trip) => tripFromServer(trip, activeRoster)),
                    nextCursor: 쪽.nextCursor,
                  };
                },
                restore: async (trip) => {
                  const restored = tripFromServer(await restoreTrip(trip.id as string), activeRoster);
                  setTripItems((current) => [restored, ...current.filter((item) => item.id !== restored.id)]);
                },
              }
              : undefined}
            refreshing={refreshing}
            onRefresh={() => void refreshAll()}
            hasMoreTrips={!!tripCursors[activeSpace.id]}
            loadingMoreTrips={loadingMoreTrips}
            loadMoreTrips={() => void loadMoreTrips()}
            openCreatorOnMount={openTripCreator}
            onCreatorOpened={() => setOpenTripCreator(false)}
            onPasteNotice={() => setOpenNoticeImport(true)}
            onCreateTrip={async ({ title, startDate, endDate, regionName, summary, participants }) => {
              const created = await createTrip(activeSpace.id, {
                title,
                startDate,
                endDate,
                regionName,
                summary,
                participantMembershipIds: idsFromNames(participants, activeRoster).ids,
              });
              return tripFromServer(created, activeRoster);
            }}
          />
        )}
        {view === "찾기" && <Search open={openTrip} theme={theme} trips={tripItems} loading={searchPrefetching} />}
        {view === "우리" && (
          <Together
            theme={theme}
            themeId={themeId}
            setThemeId={setThemeId}
            appearance={appearance}
            setAppearance={setAppearance}
            trips={tripItems}
            spaces={spaces}
            setSpaces={setSpaces}
            activeSpace={activeSpace}
            updateActiveSpace={updateActiveSpace}
            spaceSaveState={spaceSaveState}
            setActiveGroupId={setActiveGroupId}
            user={user}
            setUser={setUser}
            syncUser={syncMe}
            onEmailChangeRequested={() => setEmailWatch({ since: Date.now(), from: user.email })}
            openTrip={(trip) => openTrip("overview", trip)}
            onLogout={() => {
              void logout();
              setServerDataReady(false);
              setUser(null);
              setAuthOffline(false);
            }}
            onWipe={wipeDevice}
            onMembersChanged={() => setSpacesReload((value) => value + 1)}
            onCreateSpace={async (name, relationshipType) => {
              const created = await createSpace(name, relationshipType);
              activeGroupRef.current = created.id as GroupId;
              setActiveGroupId(created.id as GroupId);
              setSpacesReload((value) => value + 1);
            }}
            onJoinInvite={joinInvite}
            onAccountDeletionRequested={(scheduledAt) => {
              // 서버가 이미 모든 기기를 로그아웃시켰다. 여기서는 화면만 정리한다.
              setAuthNotice(deletionRequestedNotice(scheduledAt));
              setServerDataReady(false);
              setUser(null);
              setAuthOffline(false);
            }}
          />
        )}
      </View>
      {/* 아직 열지 않은 기능. 꺼져 있으면 여는 버튼도 없어서 이 시트는 뜨지 않는다. */}
      {NOTICE_IMPORT_ENABLED && (
        <NoticeImportSheet
          theme={theme}
          visible={openNoticeImport}
          trips={tripItems
            .filter((trip) => !trip.archived && typeof trip.id === "string")
            .map((trip) => ({ id: String(trip.id), name: trip.name, date: trip.date, start: trip.start, end: trip.end }))}
          roster={activeRoster}
          onClose={() => setOpenNoticeImport(false)}
          onFilled={async (tripId) => {
            setOpenNoticeImport(false);
            const filled = tripFromServer(await getTrip(tripId), activeRoster);
            setTripItems((current) => [filled, ...current.filter((item) => item.id !== filled.id)]);
            openTrip("overview", filled);
          }}
        />
      )}
      <BottomBar active={view} setActive={setView} theme={theme} />
    </SafeAreaView>
  );
}

function AuthScreen({
  theme,
  notice: initialNotice = "",
  invited = false,
  onAuth,
}: {
  theme: AppTheme;
  /** 로그인 화면에 처음부터 띄울 안내. 계정 삭제를 요청한 직후에 온다. */
  notice?: string;
  /** 초대 링크로 들어왔는지. 로그인이 끝나면 바로 그 공간에 참여한다. 공간 이름은 모른다. */
  invited?: boolean;
  onAuth: (user: DaymoUser) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  // 만 14세 미만은 가입할 수 없다(이용약관 제4조). 생년월일은 받지 않고 확인만 받는다.
  const [ageAgreed, setAgeAgreed] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  // 서버에 키가 들어간 제공자만 온다. 비어 있으면 소셜 로그인 자리를 통째로 숨긴다.
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  // 같은 이메일로 가입한 계정이 있어 비밀번호로 연결해야 하는 중.
  const [linking, setLinking] = useState<{ token: string; provider: SocialProvider } | null>(null);
  useEffect(() => {
    let alive = true;
    socialProviders().then((found) => {
      if (alive) setProviders(found);
    });
    return () => {
      alive = false;
    };
  }, []);
  const authFormValid =
    email.trim().includes("@") &&
    password.length >= 8 &&
    (mode === "login" || (Boolean(name.trim()) && password === confirm && termsAgreed && privacyAgreed && ageAgreed));
  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setError("이메일 주소를 확인해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("앱에서 사용할 이름을 입력해 주세요.");
      return;
    }
    if (mode === "signup" && password !== confirm) {
      setError("비밀번호가 서로 달라요.");
      return;
    }
    if (mode === "signup" && (!termsAgreed || !privacyAgreed || !ageAgreed)) {
      setError("필수 약관에 동의해 주세요.");
      return;
    }
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp(normalizedEmail, password, name.trim());
        setMode("login");
        setPassword("");
        setConfirm("");
        // 로그인은 확인 전에도 된다. 확인은 초대 참여처럼 이메일 소유가 필요한 곳에서 쓴다.
        setNotice("가입을 마쳤어요. 보내 드린 메일의 링크로 이메일을 확인한 뒤 로그인해 주세요.");
        return;
      }
      const result = await login(normalizedEmail, password);
      onAuth(result.user);
      if (result.endedDevices.length > 0) {
        showAlert("다른 기기에서 로그아웃됐어요", `한 계정은 기기 ${MAX_DEVICES}대까지 쓸 수 있어, 가장 오래 쓰지 않은 기기를 로그아웃했어요.`);
      }
    } catch (caught) {
      setError(caught instanceof DaymoApiError ? caught.message : "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };
  const switchMode = () => {
    setMode((current) => (current === "login" ? "signup" : "login"));
    setError("");
    setNotice("");
    setPassword("");
    setConfirm("");
  };
  const signedIn = (result: { user: DaymoUser; endedDevices: unknown[] }) => {
    onAuth(result.user);
    if (result.endedDevices.length > 0) {
      showAlert("다른 기기에서 로그아웃됐어요", `한 계정은 기기 ${MAX_DEVICES}대까지 쓸 수 있어, 가장 오래 쓰지 않은 기기를 로그아웃했어요.`);
    }
  };
  const startOAuth = async (provider: SocialProvider) => {
    setOauthLoading(provider);
    setError("");
    setNotice("");
    try {
      const result = await socialLogin(provider);
      if (result.kind === "signedIn") signedIn(result);
      if (result.kind === "linkRequired") {
        setPassword("");
        setLinking({ token: result.linkToken, provider });
      }
    } catch (caught) {
      setError(caught instanceof DaymoApiError ? caught.message : "소셜 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setOauthLoading(null);
    }
  };
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.authPage}
      >
        <View style={s.authBrand}>
          <View style={[s.authAppIconFrame, { borderColor: theme.border }]}>
            <Image
              source={require("../assets/daymo-icon-login.png")}
              resizeMode="contain"
              style={s.authAppIcon}
            />
          </View>
          <Text style={[s.authLogo, { color: theme.text }]}>Daymo</Text>
          <Text style={[s.authTagline, { color: theme.muted }]}>함께 떠나고, 오래 기억하는 여행</Text>
        </View>
        {linking ? (
          <LinkSocialCard
            theme={theme}
            linkToken={linking.token}
            provider={linking.provider}
            onDone={signedIn}
            onBack={() => {
              setLinking(null);
              setError("");
            }}
          />
        ) : forgotOpen ? (
          <ForgotPasswordCard
            theme={theme}
            initialEmail={email}
            onBack={() => {
              setForgotOpen(false);
              setError("");
            }}
          />
        ) : (
        <View style={[s.authCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[s.authTitle, { color: theme.text }]}>{mode === "login" ? "다시 만나서 반가워요" : "우리의 여행을 시작해요"}</Text>
          <Text style={[s.authDescription, { color: theme.muted }]}>{mode === "login" ? "로그인하면 지난 여행이 그대로 이어져요." : "계정을 만들고 함께 갈 사람을 초대해 보세요."}</Text>
          {/* 어느 공간인지는 링크를 연 사람에게도 알려 주지 않는다. 참여해야 보인다. */}
          {invited && (
            <Text accessibilityLiveRegion="polite" style={[s.authDescription, { color: theme.primary }]}>
              {mode === "login" ? "초대를 받아 오셨어요. 로그인하면 바로 참여해요." : "초대를 받아 오셨어요. 가입하고 메일을 확인하면 바로 참여해요."}
            </Text>
          )}
          {mode === "signup" && (
            <Field theme={theme} label="이름 또는 별명" value={name} onChangeText={setName} placeholder="예: 하늘" autoCapitalize="none" />
          )}
          <Field theme={theme} label="이메일" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field theme={theme} label="비밀번호" value={password} onChangeText={setPassword} placeholder="8자 이상 입력" secureTextEntry />
          {mode === "signup" && (
            <Field theme={theme} label="비밀번호 확인" value={confirm} onChangeText={setConfirm} placeholder="한 번 더 입력" secureTextEntry />
          )}
          {mode === "signup" && (
            <View style={[s.authConsentList, { borderColor: theme.border }]}>
              <Pressable
                onPress={() => {
                  const next = !(termsAgreed && privacyAgreed && ageAgreed);
                  setTermsAgreed(next);
                  setPrivacyAgreed(next);
                  setAgeAgreed(next);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAgreed && privacyAgreed && ageAgreed }}
                style={[s.authConsentRow, s.authConsentAll, { borderBottomColor: theme.border }]}
              >
                <View style={[s.authConsentCheck, { borderColor: termsAgreed && privacyAgreed && ageAgreed ? theme.primary : theme.border, backgroundColor: termsAgreed && privacyAgreed && ageAgreed ? theme.primary : theme.surface }]}>
                  {termsAgreed && privacyAgreed && ageAgreed && <Glyph name="check" size={12} color="#FFFFFF" weight={2.6} />}
                </View>
                <Text style={[s.authConsentAllText, { color: theme.text }]}>모두 동의</Text>
              </Pressable>
              {/* 광고·마케팅 알림은 보내지 않아서 선택 동의 칸을 두지 않는다(개인정보 처리방침 1항). */}
              {[
                { label: "[필수] 만 14세 이상이에요", checked: ageAgreed, toggle: setAgeAgreed },
                { label: "[필수] 이용약관 동의", checked: termsAgreed, toggle: setTermsAgreed, url: TERMS_URL },
                { label: "[필수] 개인정보 수집·이용 동의", checked: privacyAgreed, toggle: setPrivacyAgreed, url: PRIVACY_URL },
              ].map((consent) => (
                <View key={consent.label} style={[s.authConsentRow, { justifyContent: "space-between" }]}>
                  <Pressable
                    onPress={() => consent.toggle(!consent.checked)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: consent.checked }}
                    style={[s.authConsentRow, { flex: 1 }]}
                  >
                    <View style={[s.authConsentCheck, { borderColor: consent.checked ? theme.primary : theme.border, backgroundColor: consent.checked ? theme.primary : theme.surface }]}>
                      {consent.checked && <Glyph name="check" size={12} color="#FFFFFF" weight={2.6} />}
                    </View>
                    <Text style={[s.authConsentText, { color: theme.text }]}>{consent.label}</Text>
                  </Pressable>
                  {consent.url && (
                    <Pressable
                      onPress={() => void WebBrowser.openBrowserAsync(consent.url as string)}
                      accessibilityRole="link"
                      accessibilityLabel={`${consent.label.replace(/^\[필수\] /, "")} 보기`}
                      hitSlop={8}
                    >
                      <Text style={[s.authConsentText, { color: theme.muted, textDecorationLine: "underline" }]}>보기</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
          {/* 로그인이 왜 안 됐는지 알려 주는 유일한 문장이다. 낭독도 돼야 한다. */}
          {error ? (
            <Text
              accessibilityLiveRegion="assertive"
              style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}
            >
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={[s.authError, { color: theme.primary }]}>{notice}</Text>
          ) : null}
          <Pressable
            onPress={submit}
            disabled={!authFormValid || loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: !authFormValid || loading, busy: loading }}
            style={[s.authSubmit, { backgroundColor: theme.primary }, (!authFormValid || loading) && s.authSubmitDisabled]}
          >
            <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{loading ? "확인 중…" : mode === "login" ? "로그인" : "회원가입"}</Text>
          </Pressable>
          {mode === "login" && (
            <Pressable
              onPress={() => {
                setForgotOpen(true);
                setError("");
                setNotice("");
              }}
              accessibilityRole="button"
              style={s.authSwitch}
            >
              <Text style={[s.authSwitchText, { color: theme.muted }]}>비밀번호를 잊으셨나요?</Text>
            </Pressable>
          )}
          {providers.length > 0 && (
          <View style={s.authDivider}>
            <View style={[s.authDividerLine, { backgroundColor: theme.border }]} />
            <Text style={[s.authDividerText, { color: theme.muted }]}>또는 소셜 계정으로</Text>
            <View style={[s.authDividerLine, { backgroundColor: theme.border }]} />
          </View>
          )}
          {providers.length > 0 && (
          <Text style={[s.authPrivacy, { color: theme.muted, marginTop: 0, marginBottom: 8 }]}>
            소셜 계정으로 처음 시작하면 이용약관과 개인정보 처리방침에 동의하고 만 14세 이상임을 확인한 것으로 돼요.
          </Text>
          )}
          {providers.length > 0 && (
          <View style={s.oauthGrid}>
            {/*
              각 사 가이드대로 공식 심볼 + 문구 + 지정 색으로 그린다. 예전에는 심볼 없이
              색과 문구만 썼는데, 카카오는 심볼 없는 버튼을 금지하고 구글은 직접 만든
              로고를 금지해서 어느 쪽도 만족하지 못했다. 심볼은 각 사가 배포한 원본
              (PSD·AI·SVG·PNG)에서 옮겼고 출처는 mobile/assets/social/README.md 에 있다.
              모양과 치수의 근거는 SocialLoginButton.tsx,
              남은 확인 사항은 docs/development/08-privacy-and-release-compliance.md 12.1.

              한 줄에 하나씩 꽉 채운다. 둘씩 놓으면 애플 최소 폭 140pt 와
              "Google 계정으로 로그인" 문구가 좁은 폰에 들어가지 않는다.
            */}
            {socialProviderOrder
              .filter((provider) => providers.includes(provider))
              .map((provider) => (
                <SocialLoginButton
                  key={provider}
                  provider={provider}
                  dark={theme.dark}
                  loading={oauthLoading === provider}
                  disabled={oauthLoading !== null}
                  onPress={() => startOAuth(provider)}
                />
              ))}
          </View>
          )}
          <Pressable
            onPress={switchMode}
            accessibilityRole="button"
            accessibilityLabel={mode === "login" ? "회원가입으로 바꾸기" : "로그인으로 바꾸기"}
            style={s.authSwitch}
          >
            <Text style={[s.authSwitchText, { color: theme.muted }]}>{mode === "login" ? "처음이세요? " : "이미 계정이 있으세요? "}<Text style={{ color: theme.primary, fontFamily: typo.title.family }}>{mode === "login" ? "회원가입" : "로그인"}</Text></Text>
          </Pressable>
        </View>
        )}
        <LegalLinks theme={theme} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 비밀번호 찾기. 이메일을 받아 재설정 메일을 보낸다.
 *
 * 새 비밀번호는 메일 링크가 여는 브라우저 페이지에서 정한다(api.daymo.xyz/auth/…).
 * 계정이 있든 없든 같은 안내를 띄운다. 달리 말하면 이 화면으로 가입 여부를 알아낼 수 없다.
 */
/**
 * 소셜 계정의 이메일로 이미 가입한 계정이 있을 때.
 *
 * 서버는 이메일이 같다고 계정을 합치지 않는다. 남의 이메일로 소셜 계정을 만든
 * 사람이 남의 계정에 들어오는 길이 되기 때문이다. 원래 계정의 비밀번호를 받아야
 * 소셜 로그인을 붙인다. 다음부터는 소셜 로그인만으로 들어온다.
 */
function LinkSocialCard({
  theme,
  linkToken,
  provider,
  onDone,
  onBack,
}: {
  theme: AppTheme;
  linkToken: string;
  provider: SocialProvider;
  onDone: (result: { user: DaymoUser; endedDevices: unknown[] }) => void;
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const name = socialProviderName[provider];
  const ready = password.length > 0 && !loading;
  const submit = async () => {
    if (!ready) return;
    setLoading(true);
    setError("");
    try {
      onDone(await linkSocialAccount(linkToken, password));
    } catch (caught) {
      // 연결 토큰은 10분만 산다. 지나면 처음부터 다시 해야 한다.
      setError(caught instanceof DaymoApiError ? caught.message : "연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <View style={[s.authCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[s.authTitle, { color: theme.text }]}>이미 가입한 이메일이에요</Text>
      <Text style={[s.authDescription, { color: theme.muted }]}>
        이 이메일로 만든 Daymo 계정이 이미 있어요. 그 계정의 비밀번호를 입력하면 {name} 계정과 연결되고, 다음부터는 {name}로 바로 로그인할 수 있어요.
      </Text>
      <Field theme={theme} label="Daymo 비밀번호" value={password} onChangeText={setPassword} placeholder="가입할 때 정한 비밀번호" secureTextEntry />
      {error ? (
        <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}>{error}</Text>
      ) : null}
      <Pressable
        onPress={submit}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready, busy: loading }}
        style={[s.authSubmit, { backgroundColor: theme.primary }, !ready && s.authSubmitDisabled]}
      >
        <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{loading ? "확인 중…" : "연결하고 로그인"}</Text>
      </Pressable>
      <Text style={[s.authDescription, { color: theme.muted }]}>
        비밀번호 없이 다른 소셜 계정으로 가입했다면, 그 방식으로 로그인해 주세요.
      </Text>
      <Pressable onPress={onBack} accessibilityRole="button" style={s.authSwitch}>
        <Text style={[s.authSwitchText, { color: theme.muted }]}>로그인으로 돌아가기</Text>
      </Pressable>
    </View>
  );
}

function ForgotPasswordCard({
  theme,
  initialEmail,
  onBack,
}: {
  theme: AppTheme;
  initialEmail: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const ready = email.trim().includes("@") && !loading;
  const submit = async () => {
    if (!ready) return;
    setLoading(true);
    setError("");
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch (caught) {
      setError(caught instanceof DaymoApiError ? caught.message : "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <View style={[s.authCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[s.authTitle, { color: theme.text }]}>비밀번호 재설정</Text>
      <Text style={[s.authDescription, { color: theme.muted }]}>
        가입한 이메일로 재설정 링크를 보내 드려요. 링크는 30분 동안 쓸 수 있어요.
      </Text>
      <Field theme={theme} label="이메일" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" />
      {error ? (
        <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}>{error}</Text>
      ) : null}
      {sent ? (
        <Text accessibilityLiveRegion="polite" style={[s.authError, { color: theme.primary }]}>
          가입한 주소라면 곧 메일이 도착해요. 스팸함도 확인해 주세요.
        </Text>
      ) : null}
      <Pressable
        onPress={submit}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready, busy: loading }}
        style={[s.authSubmit, { backgroundColor: theme.primary }, !ready && s.authSubmitDisabled]}
      >
        <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{loading ? "보내는 중…" : sent ? "다시 보내기" : "재설정 메일 받기"}</Text>
      </Pressable>
      <Pressable onPress={onBack} accessibilityRole="button" style={s.authSwitch}>
        <Text style={[s.authSwitchText, { color: theme.muted }]}>로그인으로 돌아가기</Text>
      </Pressable>
    </View>
  );
}

function FirstSpaceScreen({
  theme,
  onCreate,
  onLogout,
}: {
  theme: AppTheme;
  onCreate: (name: string, relationshipType: ServerSpace["relationshipType"]) => Promise<void>;
  onLogout: () => void;
}) {
  const [name, setName] = useState("");
  const [relationshipType, setRelationshipType] = useState<ServerSpace["relationshipType"]>("couple");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!name.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      await onCreate(name.trim(), relationshipType);
    } catch (caught) {
      setError(caught instanceof DaymoApiError ? caught.message : "공간을 만들지 못했어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.authPage}>
        <View style={s.authBrand}>
          <Text style={[s.authLogo, { color: theme.text }]}>첫 여행 공간</Text>
          <Text style={[s.authTagline, { color: theme.muted }]}>함께 여행할 사람과 기록을 모아 둘 공간이에요.</Text>
        </View>
        <View style={[s.authCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Field theme={theme} label="공간 이름" value={name} onChangeText={setName} placeholder="예: 우리의 여행" />
          <Text style={[s.sheetCopy, { color: theme.muted }]}>누구와 여행하나요?</Text>
          {([
            ["couple", "연인"],
            ["friends", "친구"],
          ] as const).map(([value, label]) => (
            <Choice key={value} theme={theme} selected={relationshipType === value} label={label} onPress={() => setRelationshipType(value)} />
          ))}
          {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: statusColor.danger.light }]}>{error}</Text> : null}
          <Pressable
            onPress={submit}
            disabled={!name.trim() || loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: !name.trim() || loading, busy: loading }}
            style={[s.authSubmit, { backgroundColor: theme.primary }, (!name.trim() || loading) && s.authSubmitDisabled]}
          >
            <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{loading ? "만드는 중…" : "공간 만들기"}</Text>
          </Pressable>
          <Pressable onPress={onLogout} accessibilityRole="button" style={s.authSwitch}>
            <Text style={[s.authSwitchText, { color: theme.muted }]}>다른 계정으로 로그인</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 계정 삭제 요청. 설정 > 내 프로필 > 계정 삭제.
 *
 * 경고창(Alert) 대신 시트 안에서 확인받는다. 무엇이 사라지고 무엇이 남는지
 * 읽고 체크해야 버튼이 켜진다. 비밀번호는 매번 다시 받는다. 서버가 작업마다
 * 새 재인증 증표를 요구한다(docs/development/03-api-specification.md 2장).
 */
function AccountDeletionPanel({
  theme,
  user,
  onRequested,
}: {
  theme: AppTheme;
  user: DaymoUser;
  onRequested: (scheduledAt: string | null) => void;
}) {
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const socialOnly = user.hasPassword === false && (user.linkedProviders ?? []).length > 0;
  const ready = understood && password.length > 0 && !loading;
  const danger = theme.dark ? statusColor.danger.dark : statusColor.danger.light;
  const request = async (confirm: { password: string } | { provider: SocialProvider }) => {
    setLoading(true);
    setError("");
    try {
      const state = await requestAccountDeletion(confirm);
      onRequested(state.scheduledAt);
    } catch (caught) {
      // 다른 멤버가 있는 공간의 관리자면 서버가 공간 이름을 담아 알려 준다.
      if (!isReconfirmCancelled(caught)) {
        setError(caught instanceof DaymoApiError ? caught.message : "계정 삭제를 요청하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      setLoading(false);
    }
  };
  const submit = () => {
    if (ready) void request({ password });
  };
  return (
    <>
      {[
        "요청하면 모든 기기에서 바로 로그아웃돼요.",
        "7일 뒤에 계정이 삭제돼요. 그 전에 다시 로그인하면 삭제를 취소할 수 있어요.",
        "혼자 쓰는 공간과 그 안의 여행은 계정과 함께 삭제돼요.",
        "다른 사람과 함께 쓰는 공간에 남긴 기록은 남고, 이름은 ‘삭제된 계정’으로 바뀌어요.",
        "남기고 싶은 기록이 있으면 먼저 ‘여행 기록 저장하기’로 저장해 두세요.",
      ].map((line) => (
        <Text key={line} style={[s.sheetCopy, { color: theme.text }]}>· {line}</Text>
      ))}
      <Pressable
        onPress={() => setUnderstood((current) => !current)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: understood }}
        style={s.authConsentRow}
      >
        <View style={[s.authConsentCheck, { borderColor: understood ? danger : theme.border, backgroundColor: understood ? danger : theme.surface }]}>
          {understood && <Glyph name="check" size={12} color="#FFFFFF" weight={2.6} />}
        </View>
        <Text style={[s.authConsentText, { color: theme.text }]}>위 내용을 확인했어요</Text>
      </Pressable>
      <ReconfirmField
        theme={theme}
        user={user}
        password={password}
        setPassword={setPassword}
        disabled={!understood || loading}
        onProvider={(provider) => void request({ provider })}
      />
      {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: danger }]}>{error}</Text> : null}
      {!socialOnly && (
        <Pressable
          onPress={submit}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready, busy: loading }}
          style={[s.authSubmit, { backgroundColor: danger }, !ready && s.authSubmitDisabled]}
        >
          <Text style={[s.authSubmitText, { color: "#FFFFFF" }]}>{loading ? "요청하는 중…" : "7일 뒤 삭제하기"}</Text>
        </Pressable>
      )}
    </>
  );
}

/** 이용약관과 개인정보 처리방침을 브라우저로 연다. 로그인 화면과 내 프로필 아래에 둔다. */
function LegalLinks({ theme }: { theme: AppTheme }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 16 }}>
      <Pressable onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)} accessibilityRole="link" hitSlop={8}>
        <Text style={[s.authPrivacy, { color: theme.muted, marginTop: 0, textDecorationLine: "underline" }]}>이용약관</Text>
      </Pressable>
      <Pressable onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)} accessibilityRole="link" hitSlop={8}>
        <Text style={[s.authPrivacy, { color: theme.muted, marginTop: 0, textDecorationLine: "underline" }]}>개인정보 처리방침</Text>
      </Pressable>
    </View>
  );
}

/**
 * 민감한 작업 전의 확인 칸. 비밀번호가 없는 계정(소셜 로그인으로만 가입)은 비밀번호 칸 대신
 * 연결된 제공자로 다시 로그인하는 버튼을 보여 준다.
 */
function ReconfirmField({
  theme,
  user,
  password,
  setPassword,
  disabled,
  onProvider,
}: {
  theme: AppTheme;
  user: DaymoUser;
  password: string;
  setPassword: (value: string) => void;
  disabled: boolean;
  onProvider: (provider: SocialProvider) => void;
}) {
  const providers = user.linkedProviders ?? [];
  if (user.hasPassword !== false || providers.length === 0) {
    return <Field theme={theme} label="비밀번호 확인" value={password} onChangeText={setPassword} placeholder="지금 쓰는 비밀번호" secureTextEntry />;
  }
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.sheetCopy, { color: theme.muted }]}>이 계정은 비밀번호가 없어요. 비밀번호 대신 가입할 때 쓴 소셜 계정으로 본인을 확인해요.</Text>
      {providers.map((provider) => (
        <Pressable
          key={provider}
          disabled={disabled}
          onPress={() => onProvider(provider)}
          accessibilityRole="button"
          style={[s.accountLogout, { borderColor: theme.border }, disabled && s.authSubmitDisabled]}
        >
          <Text style={[s.accountLogoutText, { color: theme.text }]}>{socialProviderName[provider]}로 본인 확인</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 비밀번호 규칙이나 주소 오류는 서버가 칸별 문구(fields)로 준다. 그 문구가 전체 안내보다 구체적이다. */
const accountChangeError = (caught: unknown, fallback: string) =>
  caught instanceof DaymoApiError
    ? caught.fields?.password ?? caught.fields?.newEmail ?? caught.message
    : fallback;

/**
 * 내 프로필의 비밀번호·이메일 바꾸기. 누른 쪽 양식만 펼친다.
 *
 * 둘 다 지금 비밀번호(없으면 연결된 소셜 로그인)로 한 번 더 확인한다. 이메일은 새 주소로 간
 * 링크를 눌러야 바뀌므로 여기서는 보냈다는 안내만 한다.
 */
function AccountChangeSection({
  theme,
  user,
  onPasswordSet,
  onEmailChangeRequested,
}: {
  theme: AppTheme;
  user: DaymoUser;
  onPasswordSet: () => void;
  /** 확인 메일을 보냈다. 링크를 누르면 바뀌므로, 위에서 한동안 더 자주 확인한다. */
  onEmailChangeRequested: () => void;
}) {
  const [open, setOpen] = useState<"password" | "email" | null>(null);
  const [notice, setNotice] = useState("");
  const socialOnly = user.hasPassword === false && (user.linkedProviders ?? []).length > 0;
  const toggle = (next: "password" | "email") => {
    setNotice("");
    setOpen((current) => (current === next ? null : next));
  };
  const button = (key: "password" | "email", label: string) => (
    <Pressable
      onPress={() => toggle(key)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open === key }}
      style={[s.accountLogout, { borderColor: open === key ? theme.primary : theme.border }]}
    >
      <Text style={[s.accountLogoutText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
  return (
    <>
      {button("password", socialOnly ? "비밀번호 만들기" : "비밀번호 바꾸기")}
      {open === "password" && (
        <PasswordChangeForm
          theme={theme}
          user={user}
          onChanged={(message) => { setOpen(null); setNotice(message); onPasswordSet(); }}
        />
      )}
      {button("email", "이메일 바꾸기")}
      {open === "email" && (
        <EmailChangeForm
          theme={theme}
          user={user}
          onSent={(message) => { setOpen(null); setNotice(message); onEmailChangeRequested(); }}
        />
      )}
      {notice ? <Text accessibilityLiveRegion="polite" style={[s.authError, { color: theme.primary, marginTop: 8 }]}>{notice}</Text> : null}
    </>
  );
}

function PasswordChangeForm({
  theme,
  user,
  onChanged,
}: {
  theme: AppTheme;
  user: DaymoUser;
  onChanged: (message: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const socialOnly = user.hasPassword === false && (user.linkedProviders ?? []).length > 0;
  const nextValid = next.length >= 8 && next === again;
  const ready = nextValid && (socialOnly || current.length > 0) && !loading;
  const danger = theme.dark ? statusColor.danger.dark : statusColor.danger.light;
  const submit = async (confirm: Reconfirm) => {
    setLoading(true);
    setError("");
    try {
      await changePassword(confirm, next);
      onChanged(socialOnly ? "비밀번호를 만들었어요. 이제 이메일로도 로그인할 수 있어요." : "비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요.");
    } catch (caught) {
      if (!isReconfirmCancelled(caught)) setError(accountChangeError(caught, "비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요."));
      setLoading(false);
    }
  };
  return (
    <View style={{ marginTop: 12 }}>
      <Field theme={theme} label="새 비밀번호 · 8자 이상" value={next} onChangeText={setNext} placeholder="8자 이상 입력" secureTextEntry autoCapitalize="none" />
      <Field theme={theme} label="새 비밀번호 한 번 더" value={again} onChangeText={setAgain} placeholder="같은 비밀번호" secureTextEntry autoCapitalize="none" />
      {again.length > 0 && next !== again ? (
        <Text style={[s.authError, { color: danger }]}>두 비밀번호가 달라요.</Text>
      ) : null}
      <ReconfirmField
        theme={theme}
        user={user}
        password={current}
        setPassword={setCurrent}
        disabled={!nextValid || loading}
        onProvider={(provider) => void submit({ provider })}
      />
      {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: danger }]}>{error}</Text> : null}
      {!socialOnly && (
        <Pressable
          onPress={() => { if (ready) void submit({ password: current }); }}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready, busy: loading }}
          style={[s.authSubmit, { backgroundColor: theme.primary }, !ready && s.authSubmitDisabled]}
        >
          <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{loading ? "바꾸는 중…" : "비밀번호 바꾸기"}</Text>
        </Pressable>
      )}
    </View>
  );
}

function EmailChangeForm({
  theme,
  user,
  onSent,
}: {
  theme: AppTheme;
  user: DaymoUser;
  onSent: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const socialOnly = user.hasPassword === false && (user.linkedProviders ?? []).length > 0;
  const trimmed = email.trim();
  const same = trimmed.toLowerCase() === user.email.toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !same;
  const ready = emailValid && (socialOnly || password.length > 0) && !loading;
  const danger = theme.dark ? statusColor.danger.dark : statusColor.danger.light;
  const submit = async (confirm: Reconfirm) => {
    setLoading(true);
    setError("");
    try {
      await requestEmailChange(confirm, trimmed);
      onSent("새 주소로 보낸 메일의 링크를 누르면 바뀌어요. 링크는 30분 동안 쓸 수 있어요.");
    } catch (caught) {
      if (!isReconfirmCancelled(caught)) setError(accountChangeError(caught, "확인 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요."));
      setLoading(false);
    }
  };
  return (
    <View style={{ marginTop: 12 }}>
      <Field theme={theme} label="새 이메일" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" />
      {same ? <Text style={[s.authError, { color: danger }]}>지금 쓰는 이메일과 같아요.</Text> : null}
      <Text style={[s.sheetCopy, { color: theme.muted }]}>새 주소로 확인 메일을 보내요. 메일의 링크를 누르기 전까지는 지금 이메일 그대로예요.</Text>
      <ReconfirmField
        theme={theme}
        user={user}
        password={password}
        setPassword={setPassword}
        disabled={!emailValid || loading}
        onProvider={(provider) => void submit({ provider })}
      />
      {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: danger }]}>{error}</Text> : null}
      {!socialOnly && (
        <Pressable
          onPress={() => { if (ready) void submit({ password }); }}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready, busy: loading }}
          style={[s.authSubmit, { backgroundColor: theme.primary }, !ready && s.authSubmitDisabled]}
        >
          <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{loading ? "보내는 중…" : "확인 메일 보내기"}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * 삭제를 요청해 둔 계정으로 로그인했을 때. 다른 화면보다 먼저 뜬다.
 *
 * 로그인했다고 삭제가 저절로 취소되지 않는다. 기기를 잠깐 빌린 사람이 되돌리지
 * 못하게 비밀번호를 한 번 더 받는다.
 */
function DeletionPendingScreen({
  theme,
  user,
  scheduledAt,
  onCancelled,
  onLogout,
}: {
  theme: AppTheme;
  user: DaymoUser;
  scheduledAt: string;
  onCancelled: () => void;
  onLogout: () => void;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const label = deletionDateLabel(scheduledAt);
  const socialOnly = user.hasPassword === false && (user.linkedProviders ?? []).length > 0;
  const ready = password.length > 0 && !loading;
  const cancel = async (confirm: { password: string } | { provider: SocialProvider }) => {
    setLoading(true);
    setError("");
    try {
      await cancelAccountDeletion(confirm);
      onCancelled();
    } catch (caught) {
      if (!isReconfirmCancelled(caught)) {
        setError(caught instanceof DaymoApiError ? caught.message : "삭제를 취소하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      setLoading(false);
    }
  };
  const submit = () => {
    if (ready) void cancel({ password });
  };
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.authPage}>
        <View style={[s.authCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[s.authTitle, { color: theme.text }]}>계정 삭제가 예정돼 있어요</Text>
          <Text style={[s.authDescription, { color: theme.muted }]}>
            {label ? `${label}에 계정이 삭제돼요.` : "곧 계정이 삭제돼요."} 계속 쓰려면 {socialOnly ? "본인 확인을 하고" : "비밀번호를 입력하고"} 삭제를 취소해 주세요.
          </Text>
          <ReconfirmField
            theme={theme}
            user={user}
            password={password}
            setPassword={setPassword}
            disabled={loading}
            onProvider={(provider) => void cancel({ provider })}
          />
          {error ? (
            <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}>{error}</Text>
          ) : null}
          {!socialOnly && (
            <Pressable
              onPress={submit}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready, busy: loading }}
              style={[s.authSubmit, { backgroundColor: theme.primary }, !ready && s.authSubmitDisabled]}
            >
              <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{loading ? "취소하는 중…" : "삭제 취소하고 계속 쓰기"}</Text>
            </Pressable>
          )}
          <Pressable onPress={onLogout} accessibilityRole="button" style={s.authSwitch}>
            <Text style={[s.authSwitchText, { color: theme.muted }]}>로그아웃</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NotebookHome({
  open,
  goTrips,
  theme,
  trip,
  trips,
  todayKey,
  spaceName,
  relationship,
  since,
}: {
  open: (destination?: TripDetailDestination, trip?: Trip) => void;
  /** 옆으로 미는 동안 알린다. 그동안 홈 화면은 세로로 움직이지 않는다. */
  onDragging?: (미는_중: boolean) => void;
  goTrips: () => void;
  theme: AppTheme;
  trip: Trip | null;
  trips: Trip[];
  todayKey: string;
  /** 지금 보고 있는 공간의 이름. 홈만 보고도 어느 공간인지 알아야 한다. */
  spaceName: string;
  relationship: "연인" | "친구";
  since: string;
}) {
  const togetherDays = relationship === "연인" ? daysSince(since, todayKey) : null;
  const home = homeSummaryOf(trip ? tripForSummary(trip) : {});
  const homeLeft = Math.max(0, home.packingTotal - home.packingDone);
  // 카드를 옆으로 미는 동안만 참이다. 손가락이 움직이는 내내 바꾸는 값이 아니라
  // 잡을 때와 놓을 때 한 번씩이라, 미는 중에 렌더가 끼어들지 않는다.
  const [카드를_미는_중, 카드를_미는_중_바꾸기] = useState(false);
  return (
    <ScrollView
      style={{ backgroundColor: "transparent" }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.page}
      // 카드를 옆으로 미는 동안에는 세로로 움직이지 않는다. 손가락이 조금만
      // 비스듬해도 화면이 같이 오르내려 카드가 흔들려 보였다. 가로로 민다고
      // 판단한 뒤에만 잠그므로, 그냥 훑어 내리는 것은 그대로 된다.
      scrollEnabled={!카드를_미는_중}
    >
      <View style={s.notebookHead}>
        <View>
          <Text style={[s.logo, { color: theme.text }]}>Daymo</Text>
          <Text numberOfLines={1} style={[s.notebookHello, { color: theme.muted }]}>
            {spaceName}
          </Text>
        </View>
        <View
          style={[s.tinyDay, { backgroundColor: theme.primarySoft }]}
          accessibilityLabel={
            togetherDays === null ? "함께한 여행" : `함께한 지 ${togetherDays}일째`
          }
        >
          <Text style={[s.tinyDayText, { color: theme.primary }]}>
            {togetherDays === null ? "함께한 여행" : `+${togetherDays}`}
          </Text>
        </View>
      </View>
      {trips.length > 0 && <HomeTripCarousel trips={trips} initialTrip={trip} theme={theme} todayKey={todayKey} open={open} onDragging={카드를_미는_중_바꾸기} />}
      {trip && (
        <>
      <View style={s.scrapTitleRow}>
        <View>
          <Text style={[s.noteTitleSmall, { color: theme.primary }]}>바로 가기</Text>
          <Text style={[s.noteTitle, { color: theme.text }]}>이번 여행 한눈에</Text>
        </View>
        <Pressable
          onPress={() => open("overview", trip)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="여행 전체 보기"
        >
          <Text style={[s.homeArchiveMore, { color: theme.muted }]}>전체 보기</Text>
        </Pressable>
      </View>
      <View
        style={[
          s.memoPaper,
          {
            backgroundColor: theme.dark ? theme.surface : "rgba(255,255,255,.72)",
            borderColor: theme.border,
          },
        ]}
      >
        <View pointerEvents="none" style={[s.memoPaperSpine, { backgroundColor: `${theme.primary}42` }]} />
        <MemoRow theme={theme} color={theme.primary} text="대표 숙소" meta={home.stayName || "아직 없어요"} onPress={() => open("overview", trip)} />
        <MemoRow
          theme={theme}
          color={theme.accent}
          text="준비물"
          meta={
            home.packingTotal
              ? homeLeft
                ? `${homeLeft}개 남았어요`
                : "다 챙겼어요"
              : "아직 없어요"
          }
          onPress={() => open("preparation", trip)}
        />
        <MemoRow theme={theme} color={theme.secondary} text="저장한 장소" meta={home.placeCount ? `식당 ${home.restaurantCount} · 카페 ${home.cafeCount}` : "아직 없어요"} onPress={() => open("places", trip)} last />
      </View>
        </>
      )}
      {trips.some((item) => item.end < todayKey) && (
        <View style={s.homeArchiveSection}>
          <View style={s.homeArchiveHead}>
            <View>
              <Text style={[s.homeArchiveEyebrow, { color: theme.secondary }]}>지난 여행</Text>
              <Text style={[s.homeArchiveTitle, { color: theme.text }]}>다시 펼쳐보는 여행</Text>
            </View>
            <Pressable
              onPress={goTrips}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="지난 여행 전체 보기"
            >
              <Text style={[s.homeArchiveMore, { color: theme.muted }]}>전체 보기</Text>
            </Pressable>
          </View>
          <View style={s.homeArchiveRow}>
            {trips
              .filter((item) => item.end < todayKey)
              .slice(0, 2)
              .map((item, index) => (
                <Pressable
                  key={`${item.name}-${item.start}`}
                  onPress={() => open("memories", item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} 여행 기록 보기`}
                  style={({ pressed }) => [
                    s.homeArchiveCard,
                    {
                      backgroundColor: theme.dark ? theme.surface : "rgba(255,255,255,.78)",
                      borderColor: theme.border,
                      transform: [{ rotate: index === 0 ? "-0.6deg" : "0.5deg" }],
                    },
                    pressed && s.pressed,
                  ]}
                >
                  <View style={[s.homeArchiveTape, { backgroundColor: tripTone(item.tone, theme.dark).soft }]} />
                  <Text style={[s.homeArchiveDate, { color: tripTone(item.tone, theme.dark).ink }]}>{item.date}</Text>
                  <Text numberOfLines={1} style={[s.homeArchivePlace, { color: theme.text }]}>{item.name}</Text>
                  <Text numberOfLines={2} style={[s.homeArchiveNote, { color: theme.muted }]}>{item.note}</Text>
                  <View style={s.homeArchiveAction}>
                    <Text style={[s.homeArchiveActionText, { color: tripTone(item.tone, theme.dark).ink }]}>기록 보기</Text>
                    <Glyph name="chevronRight" size={14} color={tripTone(item.tone, theme.dark).ink} />
                  </View>
                </Pressable>
              ))}
          </View>
        </View>
      )}
      {!trip && (
        <View
          style={[
            s.homeEmptyTrip,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[
              s.homeEmptyTripMark,
              { backgroundColor: theme.primarySoft },
            ]}
          >
            <Glyph name="plus" size={20} color={theme.primary} weight={2.2} />
          </View>
          <Text style={[s.homeEmptyTripTitle, { color: theme.text }]}>다음 여행을 한 장 만들어볼까요?</Text>
          <Text style={[s.homeEmptyTripCopy, { color: theme.muted }]}>여행지와 날짜만 정해도 준비를 바로 시작할 수 있어요.</Text>
          <Pressable
            onPress={goTrips}
            accessibilityRole="button"
            accessibilityLabel="새 여행 만들기"
            style={[s.homeEmptyTripAction, { backgroundColor: theme.primary }]}
          >
            <Text style={[s.homeEmptyTripActionText, { color: onAccent(theme.dark) }]}>새 여행 만들기</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function HomeTripCarousel({ trips, initialTrip, theme, todayKey, open, onDragging }: {
  trips: Trip[];
  initialTrip: Trip | null;
  theme: AppTheme;
  todayKey: string;
  open: (destination?: TripDetailDestination, trip?: Trip) => void;
  /** 옆으로 미는 동안 알린다. 그동안 홈 화면은 세로로 움직이지 않는다. */
  onDragging?: (미는_중: boolean) => void;
}) {
  const ordered = useMemo(() => [...trips].sort((a, b) => a.start.localeCompare(b.start)), [trips]);
  const initialIndex = initialTrip ? Math.max(0, ordered.indexOf(initialTrip)) : ordered.length - 1;
  const [index, setIndex] = useState(initialIndex);
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(0);
  const [direction, setDirection] = useState(1);
  const [reduceMotion, setReduceMotion] = useState(false);
  // 장마다 자기 값을 하나씩 갖고, 화면에 있는 동안 다른 값으로 바꿔 매지 않는다.
  // 값을 바꿔 매면 RN 이 이전 값에 묶였던 속성을 기본값으로 되돌리는 마이크로
  // 태스크를 돌린다. 그 한 프레임에 방금 넘긴 장이 불투명도 1 로 돌아와, 기기에서
  // 이전 글자가 번쩍였다. 숨길 장은 값을 1 에 둔다. 1 에서는 종이가 다 넘어간
  // 뒤라 스스로 보이지 않는다.
  const [pages] = useState(() => new Map<number, Animated.Value>());
  // 그림자와 밑장의 그늘은 장과 상관없는 이 값 하나에 묶는다.
  const [turn] = useState(() => new Animated.Value(0));
  const dragFrame = useRef({ value: 0, time: 0 });
  const busy = useRef(false);
  const dragging = useRef(false);
  const dragDirection = useRef(1);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
      turn.stopAnimation();
      pages.forEach(value => value.stopAnimation());
    };
  }, [pages, turn]);
  const canMove = useCallback((step: number) => index + step >= 0 && index + step < ordered.length, [index, ordered.length]);
  const settle = useCallback((step: number, complete: boolean) => {
    busy.current = true;
    const page = pages.get(index);
    const timing = (value: Animated.Value) => Animated.timing(value, {
      toValue: complete ? 1 : 0,
      duration: complete ? PEEL_FINISH_MS : PEEL_CANCEL_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    Animated.parallel(page ? [timing(turn), timing(page)] : [timing(turn)]).start(({ finished }) => {
      if (!finished) return;
      // 끝까지 넘긴 다음에 바꾼다. 예전에는 68% 지점에서 미리 바꿨는데, 그때
      // 이 카드가 활성에서 빠지면서 진행값이 0으로 되돌아가 남은 곡선과
      // 마지막 8%의 사라짐이 아예 그려지지 않았다. 글자가 툭 바뀌어 보인 이유다.
      if (complete) {
        // 넘긴 장의 값은 1 에 그대로 둔다. 그래서 스스로 안 보이고, 위에 새 장이
        // 얹히는 순간 어떤 속성도 바뀌지 않는다. 그림자 값은 0 으로 돌려도 양
        // 끝이 다 안 보이는 값이라 언제 반영되든 상관없다.
        //
        // **가는 장은 0 으로 되돌린다.** 한 번 넘겼던 장으로 되돌아가면 그 장은
        // 아직 1(다 넘어간 상태)이라 스스로 보이지 않고, 그 아래 장이 비쳐 보인다.
        // 다음 → 다음 → 이전 으로 가면 두 장 전의 내용이 남아 보이던 까닭이다.
        pages.get(index + step)?.setValue(0);
        setIndex(current => current + step);
        turn.setValue(0);
      }
      busy.current = false;
      dragging.current = false;
    });
  }, [index, pages, turn]);
  const move = (step: number) => {
    // 지금 보고 있는 점을 다시 누르면 제자리 넘김이 돈다.
    if (step === 0 || busy.current || dragging.current || !canMove(step)) return;
    dragDirection.current = step;
    setDirection(step);
    if (reduceMotion) {
      pages.get(index + step)?.setValue(0);
      setIndex(current => current + step);
    } else settle(step, true);
  };
  const pan = useMemo(() => {
    const 가로로_미나 = (gesture: { dx: number; dy: number }) =>
      !busy.current && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2;
    const 놓았다 = () => onDragging?.(false);
    // PanResponder registers these callbacks; refs are read only during touch events.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
    // 가로가 세로보다 **확실히** 클 때만 잡는다. 0.75 배였을 때는 비스듬히
    // 훑어 내리기만 해도 카드가 딸려 와 화면이 흔들렸다.
    onMoveShouldSetPanResponder: (_, gesture) => 가로로_미나(gesture),
    onMoveShouldSetPanResponderCapture: (_, gesture) => 가로로_미나(gesture),
    onPanResponderGrant: (event) => {
      dragging.current = true;
      // 미는 동안 홈 화면이 세로로 움직이지 않게 한다.
      onDragging?.(true);
      dragFrame.current = { value: 0, time: event.nativeEvent.timestamp };
    },
    onPanResponderMove: (event, gesture) => {
      const step = gesture.dx < 0 ? 1 : -1;
      // Update React only when the drag crosses to the other side.
      if (dragDirection.current !== step) {
        dragDirection.current = step;
        dragFrame.current.value = 0;
        setDirection(step);
      }
      const time = event.nativeEvent.timestamp;
      const progress = peelDragProgress(peelDistance(gesture.dx, gesture.dy), width,
        dragFrame.current.value, time - dragFrame.current.time, canMove(step));
      dragFrame.current = { value: progress, time };
      turn.setValue(reduceMotion ? 0 : progress);
      pages.get(index)?.setValue(reduceMotion ? 0 : progress);
    },
    onPanResponderRelease: (_, gesture) => {
      놓았다();
      const step = dragDirection.current;
      const forwardVelocity = step === 1 ? -gesture.vx : gesture.vx;
      const complete = canMove(step) && shouldCompletePeel(gesture.dx, gesture.dy, forwardVelocity, width);
      if (reduceMotion) {
        if (complete) {
          pages.get(index + step)?.setValue(0);
          setIndex(current => current + step);
        }
        dragging.current = false;
      } else settle(step, complete);
    },
    onPanResponderTerminate: () => {
      놓았다();
      settle(dragDirection.current, false);
    },
    onPanResponderTerminationRequest: () => false,
    });
  }, [canMove, index, onDragging, pages, reduceMotion, settle, turn, width]);
  const visible = useMemo(() => {
    // 옆 장은 손가락을 어느 쪽으로 밀든 바로 받쳐야 해서 미리 올려 둔다.
    // 점을 눌러 두 장 이상 건너뛸 때는 그 목적지도 함께 올린다. 그러지 않으면
    // 넘어가는 동안 뒤가 비어 배경만 보인다.
    const slots = new Set<number>();
    for (const slot of [index - 1, index, index + 1, index + direction]) {
      if (slot >= 0 && slot < ordered.length) slots.add(slot);
    }
    return [...slots].sort((a, b) => a - b);
  }, [index, direction, ordered.length]);
  const pageValue = (position: number, hidden: boolean) => {
    let value = pages.get(position);
    if (!value) {
      value = new Animated.Value(hidden ? 1 : 0);
      pages.set(position, value);
    }
    return value;
  };
  useLayoutEffect(() => {
    // 위 장이 아닌 장은 밑장이면 0, 아니면 1 에 둔다. 이 값이 바뀌는 때는 미는
    // 방향이 바뀔 때뿐이고, 그때는 위 장이 평평하게 덮고 있어 아무것도 안 보인다.
    // 위 장의 값은 손가락이 쥐고 있으니 건드리지 않는다.
    for (const [position, value] of pages) {
      if (!visible.includes(position)) pages.delete(position);
      else if (position !== index) value.setValue(position === index + direction ? 0 : 1);
    }
  }, [pages, visible, index, direction]);
  const paper = paperCard(theme.dark);
  const motion = useMemo(() => ({
    shadowOpacity: turn.interpolate({ inputRange: [0, 0.2, 0.6, 1], outputRange: [0, 0.24, 0.12, 0] }),
    shadowY: turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [4, -height * 0.22, -height * 0.5] }),
    shadowScale: turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.6, 0.05] }),
    // 양 끝이 0 이라 값을 0 으로 되돌리는 순간에도 보이는 게 바뀌지 않는다.
    underShade: turn.interpolate({ inputRange: [0, 0.02, 0.5, 1], outputRange: [0, 0.14, 0.06, 0] }),
  }), [turn, height]);
  return (
    <View>
      <View
        {...pan.panHandlers}
        onLayout={event => {
          setWidth(Math.max(1, event.nativeEvent.layout.width));
          setHeight(event.nativeEvent.layout.height);
        }}
        style={{ marginTop: 8, ...(Platform.OS === "web" ? { userSelect: "none" as const } : {}) }}
      >
        <Animated.View pointerEvents="none" renderToHardwareTextureAndroid style={[StyleSheet.absoluteFill, {
          zIndex: 1, opacity: motion.shadowOpacity,
          transform: [{ translateY: motion.shadowY }, { scaleY: motion.shadowScale }],
        }]}>
          <Svg width="100%" height="100%">
            <Defs><RadialGradient id="liftShadow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#241A12" stopOpacity="1" />
              <Stop offset="0.65" stopColor="#241A12" stopOpacity="0.65" />
              <Stop offset="1" stopColor="#241A12" stopOpacity="0" />
            </RadialGradient></Defs>
            <Rect width="100%" height="100%" fill="url(#liftShadow)" />
          </Svg>
        </Animated.View>
        {visible.map(position => {
          const item = ordered[position];
          const active = position === index;
          const underneath = position === index + direction;
          return <View
            key={`${position}-${width}-${theme.dark}-${theme.primary}-${reduceMotion}`}
            pointerEvents={active ? "auto" : "none"}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? "auto" : "no-hide-descendants"}
            style={active ? { zIndex: 2 } : [StyleSheet.absoluteFill, { zIndex: 0, opacity: underneath ? 1 : 0 }]}
          >
            <PaperPeel progress={pageValue(position, !active && !underneath)} direction={Math.sign(direction) || 1} backColor={paper.backLeft} pageColor={theme.background} reduceMotion={reduceMotion}>
              <HomeTripCard trip={item} theme={theme} todayKey={todayKey} open={(destination, trip) => {
                if (active && !dragging.current && !busy.current) open(destination, trip);
              }} />
            </PaperPeel>
            {!active && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
              backgroundColor: "#30271C", borderRadius: 4, opacity: motion.underShade,
            }]} />}
          </View>;
        })}

      </View>
      {/* 글자 두 덩어리가 카드 폭만큼 벌어져 있어 눈이 한 번 더 멈췄다. 몇 장 중
          몇 번째인지만 점으로 남긴다. 점 자체를 누를 수 있게 해서, 손가락으로
          넘기지 못하는 경우에도 카드를 옮길 수 있는 길은 남겨 둔다. */}
      {ordered.length > 1 && <View
        accessibilityRole="tablist"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9 }}
      >
        {ordered.map((item, slot) => {
          const here = slot === index;
          return <Pressable
            key={`${item.name}-${slot}`}
            onPress={() => move(slot - index)}
            accessibilityRole="tab"
            accessibilityLabel={`${item.name}, ${ordered.length}개 중 ${slot + 1}번째`}
            accessibilityState={{ selected: here }}
            hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
            style={{
              width: here ? 16 : 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: here ? theme.primary : theme.border,
            }}
          />;
        })}
      </View>}
    </View>
  );
}

function HomeTripCard({ trip, theme, todayKey, open }: {
  trip: Trip;
  theme: AppTheme;
  todayKey: string;
  open: (destination?: TripDetailDestination, trip?: Trip) => void;
}) {
  const paper = paperCard(theme.dark);
  /**
   * 대표 사진을 깐 카드인지. 아직 못 받았으면 종이 그대로다.
   *
   * 사진이 있으면 위아래를 나눈다. 위는 사진만 두고 「지금 여행 중」 한 줄과 여행
   * 이름만 흰 글자로 얹는다. 아래는 지금의 종이 그대로라 날짜·숙소·숫자의 읽기가
   * 어떤 사진이 오든 흔들리지 않는다. 예전에는 사진을 카드 전체에 깔고 글자를
   * 모두 그 위에 얹었는데, 얼굴과 하늘 위에 겹친 글자가 묻혀 읽히지 않았다.
   *
   * 종이 결·테이프·비행기 점선은 사진 카드에서 뺀다. 사진이 그 자리를 대신한다.
   */
  // 기념 카드를 깔았으면 그 카드와 같은 배치로 여러 장을 놓는다. 한 장이라도 아직
  // 받지 못했으면 반쯤 빈 자리가 남으니 그때는 종이 카드 그대로 그린다.
  const coverIds = trip.coverPhotoIds ?? [];
  const coverRows = homeCoverRows(trip.coverCardStyle, coverIds.length);
  const coverSlots = coverRows.reduce((합, 칸) => 합 + 칸, 0);
  const coverUris = coverIds.slice(0, coverSlots).map((id) => trip.coverUris?.[id]);
  const covers = coverUris.length === coverSlots && coverUris.every(isLivePhotoUri) ? (coverUris as string[]) : [];
  const coverUri = covers.length ? covers[0] : undefined;
  // 사진 위 날짜 도장만은 밝은 종이 위에 얹는다. 어두운 모드의 강조색은 그 밝은
  // 바탕에서 흐려지니, 도장 안의 글자와 줄만 밝은 모드 값을 쓴다.
  const stampInk = resolveTheme(theme.id, false).primary;
  const stampTitleInk = paperCard(false).title;
  const stage = trip.start <= todayKey && trip.end >= todayKey
    ? "여행 중"
    : trip.end < todayKey ? "지난 여행" : "다가오는 여행";
  // 없으면 없다고 말한다. 그럴듯한 숫자를 채워 두면 눌러 보고 나서야 빈 줄
  // 알게 되고, 그때부터는 카드의 다른 숫자도 못 믿는다.
  // 서버 여행은 서버가 센 요약을, 없으면 기기의 기록을 쓴다(`tripOverview.ts`).
  const summary = homeSummaryOf(tripForSummary(trip));
  const scheduleCount = summary.scheduleCount;
  const placeCount = summary.placeCount;
  const packedCount = summary.packingDone;
  // 비용은 여행마다 있을 수도 없을 수도 있다. 적은 게 있을 때만 칸을 내준다.
  const spent = summary.spent;
  const spentCurrency = summary.currency;
  return (
      <View style={s.paperTripStack}>
        <View style={[s.paperTripBack, s.paperTripBackLeft, { backgroundColor: paper.backLeft }]} />
        <View style={[s.paperTripBack, s.paperTripBackRight, { backgroundColor: paper.backRight }]} />
        <View
          style={[
            s.paperTrip,
            coverUri ? s.paperTripPhoto : null,
            { backgroundColor: paper.surface, borderColor: paper.border },
          ]}
        >
        {/* 사진도 누르면 여행이 열린다. 카드에서 가장 큰 자리를 눌러도 아무 일이
            없으면 고장으로 읽힌다. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={coverUri ? `${stage} ${trip.name}, ${trip.date}, 여행 전체 보기` : undefined}
          onPress={() => open("overview", trip)}
          style={({ pressed }) => [
            s.paperTripMain,
            pressed && s.pressed,
          ]}
        >
        {coverUri && (
          // 종이에 사진을 테이프로 붙인 모양. 전면에 깔면 사진과 종이의 색이 따로 논다.
          <View style={s.paperTripSnap}>
            <View style={[s.paperTripSnapTape, { backgroundColor: paper.tape }]} />
            <View style={[s.paperTripSnapFrame, { backgroundColor: paper.snap, borderColor: paper.border }]}>
              <View style={s.paperTripSnapImage}>
                {keepsakeRowSlots(coverRows).map((줄, 줄번호) => (
                  <View key={줄번호} style={s.paperTripSnapRow}>
                    {Array.from({ length: 줄.count }, (_, 칸) => (
                      <Image
                        key={칸}
                        source={{ uri: covers[줄.start + 칸] }}
                        resizeMode="cover"
                        style={s.paperTripSnapCell}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
        {(
          <View pointerEvents="none" style={s.paperTripTexture}>
            {[63, 113, 163].map((top) => (
              <View key={top} style={[s.paperTripSoftLine, { top, backgroundColor: paper.softLine }]} />
            ))}
            <View
              style={[
                s.paperTripMargin,
                { backgroundColor: `${theme.primary}24` },
              ]}
            />
          </View>
        )}
        {/* 종이를 붙인 테이프. 사진이 있으면 그 사진을 붙인 테이프가 이 자리를 대신한다.
            둘 다 그리면 같은 자리에 두 장이 겹쳐 지저분하다. */}
        {!coverUri && <View style={[s.paperTape, { backgroundColor: paper.tape }]} />}
        {/* 비행기가 지나간 자국. 여행 이름이 길면 이름이 이 자리까지 밀고 들어와
            글자와 점선이 겹친다. 꾸밈이 글자를 이길 이유는 없으므로 이름이 길면
            자국을 접는다. 여덟 자는 카드에서 이름이 한 줄로 들어오는 길이다. */}
        {!coverUri && trip.name.length <= 8 && <View pointerEvents="none" style={s.paperTripRoute}>
          <Svg width="100%" height="100%" viewBox="0 0 112 42">
            <Path
              // 점선 끝을 종이비행기 꼬리 홈(90,20) 앞에 맞춘다.
              // 원래는 (84,17)에서 끝나 위쪽 모서리를 비스듬히 가로질렀다.
              d="M4 29C28 8 60 34 88 22"
              fill="none"
              stroke={theme.primary}
              strokeWidth={1.4}
              strokeDasharray="3 5"
              strokeLinecap="round"
            />
            <Path
              d="m82 17 18-7-7 18-3-8-8-3Z"
              fill="none"
              stroke={theme.primary}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </Svg>
        </View>}
        {/* 사진이 있으면 이 묶음이 종이의 안쪽 여백을 대신 갖는다. 사진은 카드
            모서리까지 닿아야 해서 종이에서 여백을 걷어냈기 때문이다. */}
        <View>
        <View style={s.paperTripHead}>
          <View style={s.paperTripCopy}>
            <Text style={[s.paperKicker, { color: theme.primary }]}>
              {stage}
            </Text>
            {/* 두 줄까지만. 아주 긴 이름이 카드를 세로로 늘려 아래 칸을 밀어내면
                카드마다 높이가 달라져 옆으로 넘길 때 덜컹거린다. */}
            <Text numberOfLines={2} style={[s.paperTitle, { color: paper.title }]}>
              {trip.name}
            </Text>
            <Text style={[s.paperDate, { color: paper.muted }]}>
              {trip.date}
            </Text>
          </View>
          <View
            style={[
              s.paperTripStamp,
              {
                backgroundColor: "transparent",
                borderColor: paper.stampBorder,
              },
            ]}
          >
            <Text style={[s.paperTripStampMonth, { color: theme.primary }]}>{Number(trip.start.slice(5, 7))}월</Text>
            <Text style={[s.paperTripStampDay, { color: paper.title }]}>{trip.start.slice(-2)}</Text>
            <View style={[s.paperTripStampRule, { backgroundColor: theme.primary }]} />
          </View>
        </View>
        <View style={[s.paperRule, { borderColor: paper.rule }]} />
        <View
          style={[
            s.paperStayBoard,
            {
              backgroundColor: "transparent",
              borderColor: "transparent",
            },
          ]}
        >
          <View style={s.paperStay}>
            <View
              style={[
                s.paperStayIcon,
                {
                  backgroundColor: "transparent",
                  borderColor: paper.iconBorder,
                },
              ]}
            >
              <Svg width={22} height={22} viewBox="0 0 22 22">
                <Path
                  d="M4 19V7.5L11 3l7 4.5V19M7.5 19v-5h7v5M8 9h1M13 9h1"
                  fill="none"
                  stroke={domain("stay", theme.dark).solid}
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.paperStayLabel, { color: domain("stay", theme.dark).solid }]}>숙소</Text>
              <Text numberOfLines={1} style={[s.paperStayName, { color: paper.title }]}>{summary.stayName || "미정"}</Text>
            </View>
            <View
              style={[
                s.paperStayTime,
                {
                  backgroundColor: "transparent",
                  borderColor: paper.iconBorder,
                },
              ]}
            >
              <Text style={[s.paperStayTimeLabel, { color: paper.muted }]}>체크인</Text>
              <Text style={[s.paperStayTimeValue, { color: theme.primary }]}>{summary.checkin || "미정"}</Text>
            </View>
          </View>
        </View>
        </View>
        </Pressable>
        <View style={coverUri ? s.paperTripActionsBox : null}>
        <View style={[s.paperTripActions, { borderTopColor: paper.divider }]}>
          {[
            { label: "일정", meta: scheduleCount ? `${scheduleCount}개` : "미정", color: theme.primary, destination: "overview" as TripDetailDestination },
            { label: "저장한 장소", meta: placeCount ? `${placeCount}곳` : "미정", color: domain("stay", theme.dark).solid, destination: "places" as TripDetailDestination },
            // 완료 개수는 여행마다 다르다. 앱 전체에 하나뿐인 done 을 쓰면 어느
            // 카드를 넘겨도 같은 숫자가 나와서 카드가 고장 난 것처럼 보인다.
            { label: "준비물", meta: packedCount ? `${packedCount}개 완료` : "미정", color: domain("packing", theme.dark).solid, destination: "preparation" as TripDetailDestination },
            ...(spent > 0
              ? [{ label: "총 지출", meta: money(spent, spentCurrency), color: domain("cooking", theme.dark).solid, destination: "expenses" as TripDetailDestination }]
              : []),
          ].map((item, index) => (
            <Pressable
              accessibilityRole="button"
              key={item.label}
              onPress={() => open(item.destination, trip)}
              style={({ pressed }) => [
                s.paperTripAction,
                index > 0 && [s.paperTripActionBorder, { borderLeftColor: paper.divider }],
                pressed && s.pressed,
              ]}
            >
              <Text style={[s.paperTripActionLabel, { color: item.color }]}>{item.label}</Text>
              <Text style={[s.paperTripActionMeta, { color: paper.muted }]}>{item.meta}</Text>
              <View style={[s.paperTripActionUnderline, { backgroundColor: `${item.color}38` }]} />
            </Pressable>
          ))}
        </View>
        </View>
        </View>
      </View>
  );
}

function MemoRow({
  theme,
  color,
  text,
  meta,
  onPress,
  last,
}: {
  theme: AppTheme;
  color: string;
  text: string;
  meta: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${text}, ${meta}`}
      style={[
        s.memoRow,
        { borderColor: theme.border },
        last && s.memoRowLast,
      ]}
    >
      <View
        style={[
          s.memoCheck,
          {
            borderColor: color,
            backgroundColor: `${color}${theme.dark ? "20" : "0D"}`,
          },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={[s.memoText, { color: theme.text }]}>{text}</Text>
        <Text style={[s.memoMeta, { color: theme.muted }]}>
          {meta}
        </Text>
      </View>
      <Glyph name="chevronRight" size={16} color={theme.muted} />
    </Pressable>
  );
}

type TripView = "목록" | "지도" | "캘린더";

function TripsExplorer({
  open,
  theme,
  items,
  setItems,
  spaceMembers,
  refreshing = false,
  onRefresh,
  hasMoreTrips = false,
  loadingMoreTrips = false,
  loadMoreTrips,
  openCreatorOnMount = false,
  onCreatorOpened,
  onPasteNotice,
  onCreateTrip,
  deletedTrips,
}: {
  /**
   * 공간 관리자에게만. 지운 여행을 한 쪽씩 불러오고 되돌린다.
   *
   * `load` 에 cursor 를 주면 그 다음 쪽을 준다. 비우면 첫 쪽이다.
   */
  deletedTrips?: {
    load: (cursor?: string | null) => Promise<{ items: Trip[]; nextCursor: string | null }>;
    restore: (trip: Trip) => Promise<void>;
  };
  open: (trip: Trip) => void;
  theme: AppTheme;
  items: Trip[];
  setItems: React.Dispatch<React.SetStateAction<Trip[]>>;
  /** 이 공간의 멤버 전원. 여행을 만들 때 이 중에서 참가자를 고른다. */
  spaceMembers: string[];
  /** 당겨서 새로고침. 옆 사람이 만든 새 여행은 이때 들어온다. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** 아직 받지 않은 여행이 서버에 더 있다. 아래로 내리면 이어 받는다. */
  hasMoreTrips?: boolean;
  loadingMoreTrips?: boolean;
  loadMoreTrips?: () => void;
  openCreatorOnMount?: boolean;
  onCreatorOpened?: () => void;
  /** 카카오톡 공지를 붙여넣어 지난 여행을 채우는 시트를 연다. */
  onPasteNotice: () => void;
  onCreateTrip: (input: { title: string; startDate: string; endDate: string; regionName: string; summary: string; participants: string[] }) => Promise<Trip>;
}) {
  const initialCalendarDate = new Date();
  const initialDateKey = `${initialCalendarDate.getFullYear()}-${String(initialCalendarDate.getMonth() + 1).padStart(2, "0")}-${String(initialCalendarDate.getDate()).padStart(2, "0")}`;
  const [display, setDisplay] = useState<TripView>("목록");
  const [filter, setFilter] = useState<"전체" | "다가오는" | "지난 여행" | "보관">("전체");
  const [trash, setTrash] = useState<Trip[]>([]);
  // 지운 여행의 다음 쪽. null 이면 다 받았다.
  const [trashCursor, setTrashCursor] = useState<string | null>(null);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashMessage, setTrashMessage] = useState("");
  useEffect(() => {
    if (filter !== "보관" || !deletedTrips) return;
    let alive = true;
    deletedTrips.load()
      .then((받은) => {
        if (!alive) return;
        setTrash(받은.items);
        setTrashCursor(받은.nextCursor);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // 보관을 열 때마다 새로 받는다. deletedTrips 는 렌더마다 새 객체라 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  /** 지운 여행도 100 개를 넘으면 한 쪽에 다 오지 않는다. 눌러서 이어 받는다. */
  const loadMoreTrash = () => {
    if (!deletedTrips || !trashCursor || trashLoading) return;
    setTrashLoading(true);
    deletedTrips.load(trashCursor)
      .then((받은) => {
        setTrash((current) => {
          const 이미 = new Set(current.map((trip) => trip.id));
          return [...current, ...받은.items.filter((trip) => !이미.has(trip.id))];
        });
        setTrashCursor(받은.nextCursor);
      })
      .catch(() => setTrashMessage("휴지통을 더 불러오지 못했어요. 잠시 후 다시 시도해 주세요."))
      .finally(() => setTrashLoading(false));
  };
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [month, setMonth] = useState({
    year: initialCalendarDate.getFullYear(),
    value: initialCalendarDate.getMonth() + 1,
  });
  const [creating, setCreating] = useState(false);
  const [place, setPlace] = useState("");
  const [tripStart, setTripStart] = useState("2026-09-12");
  const [tripEnd, setTripEnd] = useState("2026-09-14");
  const [note, setNote] = useState("");
  const [newRegion, setNewRegion] = useState("서울");
  // 여행마다 가는 사람이 다르다. 처음에는 공간 멤버 전원으로 두고, 일부만
  // 가는 여행이면 여기서 뺀다. 지출의 몫과 준비물 담당이 이 목록을 쓴다.
  const [newPeople, setNewPeople] = useState<string[]>(spaceMembers);
  const [showAllRegions, setShowAllRegions] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const openCreator = () => {
    // 공간을 바꾸면 멤버도 바뀐다. 열 때마다 그 공간의 전원으로 되돌린다.
    setNewPeople(spaceMembers);
    setCreating(true);
  };
  useEffect(() => {
    if (!openCreatorOnMount) return;
    // 홈의 빠른 추가 요청이 바뀔 때 이미 열린 여행 화면의 시트를 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNewPeople(spaceMembers);
    setCreating(true);
    onCreatorOpened?.();
  }, [openCreatorOnMount, onCreatorOpened, spaceMembers]);
  const showDisplay = (nextDisplay: TripView) => {
    setDisplay(nextDisplay);
    if (nextDisplay === "캘린더" && !selectedDate) {
      setMonth({
        year: initialCalendarDate.getFullYear(),
        value: initialCalendarDate.getMonth() + 1,
      });
      setSelectedDate(initialDateKey);
    }
  };
  // 보관한 여행은 ‘보관’에만 둔다. 지도와 캘린더에는 그대로 보인다(보관은 목록 정리일 뿐이다).
  const listed = items.filter((trip) => !trip.archived);
  const filtered =
    filter === "보관"
      ? items.filter((trip) => trip.archived)
      : filter === "다가오는"
        ? listed.filter((trip) => trip.end >= initialDateKey)
        : filter === "지난 여행"
          ? listed.filter((trip) => trip.end < initialDateKey)
          : listed;
  const mapTrips = selectedRegion
    ? items.filter((trip) => trip.region === selectedRegion)
    : items;
  const dateTrips = selectedDate
    ? items.filter(
        (trip) => selectedDate >= trip.start && selectedDate <= trip.end,
      )
    : [];
  const tripDateValid = tripStart <= tripEnd;
  const addTrip = async () => {
    if (!place.trim() || !tripDateValid || !newPeople.length || createLoading) return;
    setCreateLoading(true);
    setCreateError("");
    try {
      const serverTrip = await onCreateTrip({
        title: place.trim(),
        startDate: tripStart,
        endDate: tripEnd,
        regionName: newRegion,
        summary: note,
        participants: newPeople,
      });
      const nextTrip = { ...serverTrip, planning: { participants: newPeople } };
      setItems((current) => [nextTrip, ...current]);
      setPlace("");
      setNote("");
      setNewPeople(spaceMembers);
      setCreating(false);
      setShowAllRegions(false);
      setSelectedRegion(null);
      setDisplay("목록");
      open(nextTrip);
    } catch (caught) {
      setCreateError(caught instanceof DaymoApiError ? caught.message : "여행을 만들지 못했어요. 다시 시도해 주세요.");
    } finally {
      setCreateLoading(false);
    }
  };
  const createFromDate = () => {
    if (selectedDate) {
      setTripStart(selectedDate);
      setTripEnd(selectedDate);
    }
    openCreator();
  };
  const explorerHead = (
    <>
      <View style={s.screenHead}>
        <View>
          <Text style={[s.overline, { color: theme.primary }]}>함께 만든 여행</Text>
          <Text style={[s.screenTitle, { color: theme.text }]}>여행</Text>
        </View>
        <View style={s.tripHeadActions}>
          {/* 카카오톡 공지를 통째로 옮겨 지난 여행을 채우는 길. 아직 열지 않은 기능이다. */}
          {NOTICE_IMPORT_ENABLED && (
            <Pressable
              onPress={onPasteNotice}
              accessibilityRole="button"
              accessibilityLabel="카톡 공지로 지난 여행 채우기"
              style={({ pressed }) => [
                s.pasteNotice,
                { backgroundColor: theme.surface, borderColor: theme.border },
                pressed && s.pressed,
              ]}
            >
              <Text style={[s.newTripText, { color: theme.primary }]}>카톡 공지로 채우기</Text>
            </Pressable>
          )}
          <Pressable
            onPress={openCreator}
            accessibilityRole="button"
            accessibilityLabel="새 여행 만들기"
            style={({ pressed }) => [
              s.newTrip,
              { backgroundColor: theme.primary },
              pressed && s.pressed,
            ]}
          >
            <Text style={[s.newTripText, { color: onAccent(theme.dark) }]}>＋ 새 여행</Text>
          </Pressable>
        </View>
      </View>
      <View
        style={[
          s.viewSwitch,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {(["목록", "지도", "캘린더"] as TripView[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => showDisplay(item)}
            accessibilityRole="tab"
            accessibilityLabel={`${item} 보기`}
            accessibilityState={{ selected: display === item }}
            style={[
              s.viewChoice,
              display === item && s.viewChoiceActive,
              display === item && {
                backgroundColor: theme.primarySoft,
                borderColor: theme.primary,
              },
            ]}
          >
            <Text
              style={[
                s.viewChoiceText,
                { color: theme.muted },
                display === item && s.viewChoiceTextActive,
                display === item && { color: theme.primary },
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
  return (
    <>
      {display === "지도" ? (
        <View
          style={[
            s.tripExplorerMapPage,
            { backgroundColor: theme.background },
          ]}
        >
          <View style={s.tripExplorerMapHeader}>{explorerHead}</View>
          <KoreaTripMap
            theme={theme}
            trips={items}
            results={mapTrips}
            selected={selectedRegion}
            onSelect={(region) =>
              setSelectedRegion((current) => current === region ? null : region)
            }
            onClear={() => setSelectedRegion(null)}
            open={open}
          />
        </View>
      ) : (
        <ScrollView
          style={{ backgroundColor: "transparent" }}
          contentContainerStyle={s.tripExplorerPage}
          showsVerticalScrollIndicator={false}
          // 바닥에 닿기 한 화면 전에 다음 쪽을 부른다. 다 받았으면 아무 일도 하지 않는다.
          scrollEventThrottle={160}
          onScroll={({ nativeEvent }) => {
            const 자리 = {
              offsetY: nativeEvent.contentOffset.y,
              viewportHeight: nativeEvent.layoutMeasurement.height,
              contentHeight: nativeEvent.contentSize.height,
            };
            if (shouldLoadMore(자리, { hasMore: hasMoreTrips, loading: loadingMoreTrips })) {
              loadMoreTrips?.();
            }
          }}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {/* 웹의 RefreshControl 은 빈 칸이라 당겨도 불리지 않는다. 그래서 작은 버튼을 둔다. */}
          <SyncNotice theme={theme} refreshing={refreshing} onRefresh={onRefresh} />
          {explorerHead}
          {display === "목록" && (
            <>
              <View style={s.tripFilters}>
                {(["전체", "다가오는", "지난 여행", "보관"] as const).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setFilter(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item === "전체" ? "전체 여행 보기" : item === "지난 여행" ? "지난 여행만 보기" : `${item} 여행만 보기`}
                    accessibilityState={{ selected: filter === item }}
                    style={[
                      s.filter,
                      filter === item && { backgroundColor: theme.primarySoft },
                    ]}
                  >
                    <Text
                      style={[
                        s.filterText,
                        { color: filter === item ? theme.primary : theme.muted },
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TripRows
                items={filtered}
                open={open}
                theme={theme}
                emptyAction={filter === "전체" ? undefined : () => setFilter("전체")}
                emptyActionLabel="전체 여행 보기"
              />
              {loadingMoreTrips ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[s.memberRoleText, { color: theme.muted, marginTop: 12, textAlign: "center" }]}
                >
                  지난 여행을 더 불러오는 중이에요
                </Text>
              ) : null}
              {filter === "보관" && trash.length > 0 && (
                <View style={{ marginTop: 20, gap: 8 }}>
                  <Text style={[s.memberPermissionLabel, { color: theme.text }]}>휴지통</Text>
                  <Text style={[s.memberRoleText, { color: theme.muted, marginTop: 0 }]}>
                    삭제한 날부터 7일 안에는 되돌릴 수 있어요. 그 뒤에는 모든 기록이 사라져요.
                  </Text>
                  {trash.map((trip) => (
                    <View key={trip.id} style={[s.inviteRow, { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.memberManagerName, { color: theme.text }]} numberOfLines={1}>{trip.name}</Text>
                        <Text style={[s.memberRoleText, { color: theme.muted, marginTop: 0 }]}>
                          {trip.date}{trip.deletionScheduledAt ? ` · ${deletionDateLabel(trip.deletionScheduledAt)}까지` : ""}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${trip.name} 되돌리기`}
                        onPress={() => {
                          if (!deletedTrips) return;
                          deletedTrips.restore(trip)
                            .then(() => {
                              setTrash((current) => current.filter((item) => item.id !== trip.id));
                              setTrashMessage(`${trip.name} 여행을 되돌렸어요`);
                            })
                            .catch((caught) => setTrashMessage(caught instanceof DaymoApiError ? caught.message : "되돌리지 못했어요. 잠시 후 다시 시도해 주세요."));
                        }}
                        hitSlop={8}
                      >
                        <Text style={[s.accountLogoutText, { color: theme.primary }]}>되돌리기</Text>
                      </Pressable>
                    </View>
                  ))}
                  {trashCursor ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="휴지통 더 보기"
                      onPress={loadMoreTrash}
                      hitSlop={8}
                    >
                      <Text style={[s.accountLogoutText, { color: theme.primary }]}>
                        {trashLoading ? "불러오는 중이에요" : "더 보기"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
              {filter === "보관" && trashMessage ? (
                <Text accessibilityLiveRegion="polite" style={[s.memberRoleText, { color: theme.primary, marginTop: 8 }]}>{trashMessage}</Text>
              ) : null}
            </>
          )}
          {display === "캘린더" && (
            <TripCalendar
              trips={items}
              month={month}
              setMonth={setMonth}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              theme={theme}
            />
          )}
          {display === "캘린더" && selectedDate && (
            <View style={s.calendarResults}>
              <View style={s.calendarResultHead}>
                <Text
                  style={[s.calendarResultDate, { color: theme.text }]}
                >
                  {Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(-2))}일의 여행
                </Text>
                <Pressable
                  onPress={() => setSelectedDate(null)}
                  accessibilityRole="button"
                  accessibilityLabel="선택한 날짜 해제"
                >
                  <Text style={[s.calendarResultClear, { color: theme.muted }]}>선택 해제</Text>
                </Pressable>
              </View>
              {dateTrips.length ? (
                <TripRows items={dateTrips} open={open} compact theme={theme} />
              ) : (
                <View
                  style={[
                    s.emptyDate,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[s.emptyDateTitle, { color: theme.muted }]}
                  >
                    이날은 아직 여행이 없어요
                  </Text>
                  <Pressable
                    accessibilityRole="button" onPress={createFromDate}>
                    <Text
                      style={[
                        s.emptyDateAction,
                        { color: theme.secondary },
                      ]}
                    >
                      ＋ 이 날짜로 여행 만들기
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
      <SheetShell
        theme={theme}
        visible={creating}
        title="새 여행"
        subtitle="여행지와 기간만 정하면 돼요"
        submit="여행 만들기"
        disabledHint={
          !place.trim()
            ? "여행지를 입력해 주세요"
            : !tripDateValid
              ? "마지막 날을 다시 확인해 주세요"
              : !newPeople.length
                ? "함께 가는 사람을 한 명은 골라 주세요"
                : undefined
        }
        submitDisabled={!place.trim() || !tripDateValid || !newPeople.length || createLoading}
        onClose={() => {
          setCreating(false);
          setShowAllRegions(false);
        }}
        onSubmit={addTrip}
      >
        {createError ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}>{createError}</Text> : null}
        <Field
          theme={theme}
          label="여행지"
          value={place}
          onChangeText={setPlace}
          placeholder="예: 제주 애월"
        />
        <TripRegionPicker
          theme={theme}
          value={newRegion}
          onChange={setNewRegion}
          expanded={showAllRegions}
          setExpanded={setShowAllRegions}
        />
        <TripDateRangePicker
          theme={theme}
          start={tripStart}
          end={tripEnd}
          setStart={setTripStart}
          setEnd={setTripEnd}
        />
        <Field
          theme={theme}
          label="한 줄 메모 (선택)"
          value={note}
          onChangeText={setNote}
          placeholder="예: 골목을 천천히 걷는 여행"
        />
        {/* 공간에 나 말고 아무도 없으면 고를 것이 없다. */}
        {spaceMembers.length > 1 && (
          <ParticipantPicker
            theme={theme}
            members={spaceMembers}
            value={newPeople}
            onChange={setNewPeople}
          />
        )}
      </SheetShell>
    </>
  );
}

function TripRows({
  items,
  open,
  compact,
  theme,
  emptyAction,
  emptyActionLabel,
}: {
  items: Trip[];
  open: (trip: Trip) => void;
  compact?: boolean;
  theme: AppTheme;
  emptyAction?: () => void;
  emptyActionLabel?: string;
}) {
  if (!items.length)
    return (
      <View
        style={[
          s.noTrips,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Svg width={58} height={48} viewBox="0 0 58 48">
          <Path
            d="M16 16h26a4 4 0 0 1 4 4v20H12V20a4 4 0 0 1 4-4Zm7 0v-4a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v4M20 24v9M38 24v9M8 40h42"
            fill="none"
            stroke={theme.primary}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={[s.noTripsTitle, { color: theme.text }]}>아직 이곳에 여행이 없어요</Text>
        <Text style={[s.noTripsText, { color: theme.muted }]}>다른 분류를 보거나 새로운 여행을 만들어 보세요.</Text>
        {emptyAction && (
          <Pressable
            accessibilityRole="button"
            onPress={emptyAction}
            style={[s.emptyInlineAction, { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[s.emptyInlineActionText, { color: theme.primary }]}>
              {emptyActionLabel}
            </Text>
          </Pressable>
        )}
      </View>
    );
  return (
    <>
      {items.map((trip, index) => (
        <Pressable
          accessibilityRole="button"
          key={`${trip.name}-${index}`}
          onPress={() => open(trip)}
          style={({ pressed }) => [
            s.tripRow,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            compact && s.tripRowCompact,
            pressed && s.pressed,
          ]}
        >
          <View style={[s.tripRowAccent, { backgroundColor: tripTone(trip.tone, theme.dark).ink }]} />
          <View style={s.tripThumb}>
            <TripArt tone={tripTone(trip.tone, theme.dark)} date={trip.mark} small />
          </View>
          <View style={s.tripInfo}>
            <Text numberOfLines={1} style={[s.tripName, { color: theme.text }]}>{trip.name}</Text>
            <Text numberOfLines={1} style={[s.tripDate, { color: theme.muted }]}>
              {trip.date}
            </Text>
            <Text numberOfLines={1} style={[s.tripNote, { color: theme.muted }]}>
              {trip.note}
            </Text>
          </View>
          <View
            style={[
              s.tripRowArrow,
              { backgroundColor: theme.primarySoft },
            ]}
          >
            <Glyph name="chevronRight" size={16} color={theme.primary} />
          </View>
        </Pressable>
      ))}
    </>
  );
}

const MAP_MAX_ZOOM = 5;

function KoreaTripMap({
  theme,
  trips,
  results,
  selected,
  onSelect,
  onClear,
  open,
}: {
  theme: AppTheme;
  trips: Trip[];
  results: Trip[];
  selected: string | null;
  onSelect: (region: string) => void;
  onClear: () => void;
  open: (trip: Trip) => void;
}) {
  const [size, setSize] = useState({ width: 300, height: 420 });
  const [zoom, setZoom] = useState(1.5);
  const [center, setCenter] = useState({ x: 150, y: 210 });
  // 두 손가락이 닿아 있는 동안은 시군구 층을 내린다. 668개 경로를 매 프레임
  // 다시 그리면 확대가 끊긴다.
  const [pinching, setPinching] = useState(false);
  // 제스처 처리기는 한 번만 만들고 다시 만들지 않는다. 그래서 최신 값을 ref 로
  // 읽어야 하는데, 렌더 중에 ref 에 쓰면 리액트 규칙에 어긋난다. 값을 바꾸는
  // 자리에서 상태와 ref 를 함께 옮긴다.
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const sizeRef = useRef(size);
  // 손가락 하나가 움직이는 중인지, 두 개가 벌어지는 중인지, 그냥 톡 누른 건지.
  const gesture = useRef<
    | { kind: "none" }
    | { kind: "pan"; from: { x: number; y: number } }
    | { kind: "pinch"; span: number; zoom: number; at: { x: number; y: number }; on: { x: number; y: number } }
  >({ kind: "none" });
  const movedFar = useRef(false);
  // 한 번이라도 두 손가락이 닿았으면 그 동작 전체를 확대로 본다.
  const multiTouch = useRef(false);
  // 손가락이 이름표나 SVG 위에 닿으면 locationX 가 그 자식 기준이 되어
  // 좌표가 어긋난다. 화면 기준 좌표에서 지도 칸의 원점을 빼서 쓴다.
  const host = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const inMap = (page: { pageX: number; pageY: number }) => ({
    x: page.pageX - origin.current.x,
    y: page.pageY - origin.current.y,
  });
  const boxWidth = 300 / zoom;
  const boxHeight = 420 / zoom;
  const boxX = center.x - boxWidth / 2;
  const boxY = center.y - boxHeight / 2;
  const viewBox = `${boxX} ${boxY} ${boxWidth} ${boxHeight}`;
  const mapScale = Math.min(size.width / boxWidth, size.height / boxHeight);
  const mapOffsetX = (size.width - boxWidth * mapScale) / 2;
  const mapOffsetY = (size.height - boxHeight * mapScale) / 2;
  const clampCenter = (point: { x: number; y: number }, level: number) => {
    const halfWidth = 150 / level;
    const halfHeight = 210 / level;
    return {
      x: Math.max(halfWidth, Math.min(300 - halfWidth, point.x)),
      y: Math.max(halfHeight, Math.min(420 - halfHeight, point.y)),
    };
  };
  /** 지도를 옮긴다. 상태와 ref 가 항상 같은 값을 갖게 한다. */
  const applyView = (at: { x: number; y: number }, level = zoomRef.current) => {
    centerRef.current = at;
    zoomRef.current = level;
    setCenter(at);
    setZoom(level);
  };
  /** 배율 level 에서의 보이는 상자와 화면 배율. */
  const viewAt = (level: number, at: { x: number; y: number }) => {
    const width = 300 / level;
    const height = 420 / level;
    const scale = Math.min(sizeRef.current.width / width, sizeRef.current.height / height);
    return {
      x: at.x - width / 2,
      y: at.y - height / 2,
      width,
      height,
      scale,
      offsetX: (sizeRef.current.width - width * scale) / 2,
      offsetY: (sizeRef.current.height - height * scale) / 2,
    };
  };
  /** 화면 위의 점을 지도 좌표로 옮긴다. */
  const toMapPoint = (screen: { x: number; y: number }) => {
    const view = viewAt(zoomRef.current, centerRef.current);
    return {
      x: view.x + (screen.x - view.offsetX) / view.scale,
      y: view.y + (screen.y - view.offsetY) / view.scale,
    };
  };
  /**
   * 지도의 한 점을 화면의 한 점에 붙여둔 채 배율만 바꾼다.
   * 손가락 사이를 벌리면 잡은 자리가 손가락을 따라온다.
   */
  const zoomAround = (
    level: number,
    screen: { x: number; y: number },
    on: { x: number; y: number },
  ) => {
    const next = Math.max(1, Math.min(MAP_MAX_ZOOM, level));
    const view = viewAt(next, centerRef.current);
    const at = clampCenter(
      {
        x: on.x - (screen.x - view.offsetX) / view.scale + view.width / 2,
        y: on.y - (screen.y - view.offsetY) / view.scale + view.height / 2,
      },
      next,
    );
    applyView(at, next);
  };
  /** 확대·축소 버튼. 버튼은 눌린 만큼 딱 떨어지는 게 낫다. */
  const changeZoom = (
    amount: number,
    focus = { x: size.width / 2, y: size.height / 2 },
  ) => {
    const next = Math.max(
      1,
      Math.min(MAP_MAX_ZOOM, Math.round((zoomRef.current + amount) * 2) / 2),
    );
    if (next === zoomRef.current) return;
    zoomAround(next, focus, toMapPoint(focus));
  };
  const resetMap = () => {
    applyView({ x: 150, y: 210 }, 1.5);
  };
  /** 닿아 있는 두 손가락 사이의 거리와 중점. */
  const spanOf = (touches: readonly { pageX: number; pageY: number }[]) => {
    const first = inMap(touches[0]);
    const second = inMap(touches[1]);
    return {
      distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
      at: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    };
  };
  const beginPinch = (touches: readonly { pageX: number; pageY: number }[]) => {
    const { distance, at } = spanOf(touches);
    gesture.current = { kind: "pinch", span: distance, zoom: zoomRef.current, at, on: toMapPoint(at) };
    setPinching(true);
  };
  // 이 규칙은 useMemo 안에서 만든 닫힘이 ref 를 읽는 것을 렌더 중 접근으로 본다.
  // 여기서는 그 닫힘이 손가락이 닿을 때만 불리고 렌더 중에는 실행되지 않는다.
  // 제스처 처리기를 매 렌더 다시 만들면 진행 중이던 동작이 끊기므로 한 번만
  // 만들어야 하고, 그러려면 최신 값을 ref 로 읽는 수밖에 없다.
  const panResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        // 손가락이 둘이 되는 순간 자식에게서 응답권을 빼앗는다. 이름표 위에
        // 손가락이 얹혀 있어도 확대로 넘어가고, 이름표의 누름은 취소된다.
        onStartShouldSetPanResponderCapture: (event) =>
          event.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponderCapture: (event) =>
          event.nativeEvent.touches.length >= 2,
        // 이름표가 아닌 빈 곳을 톡 누르면 여기로 온다.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          movedFar.current = false;
          multiTouch.current = false;
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) multiTouch.current = true;
          if (touches.length >= 2) beginPinch(touches);
          else gesture.current = { kind: "pan", from: centerRef.current };
        },
        onPanResponderMove: (event, state) => {
          const touches = event.nativeEvent.touches;
          if (Math.abs(state.dx) + Math.abs(state.dy) > 6) movedFar.current = true;

          if (touches.length >= 2) {
            multiTouch.current = true;
            if (gesture.current.kind !== "pinch") beginPinch(touches);
            const active = gesture.current;
            if (active.kind !== "pinch") return;
            movedFar.current = true;
            const { distance, at } = spanOf(touches);
            // 벌린 비율이 그대로 배율이 된다. 단계 없이 이어진다.
            zoomAround(active.zoom * (distance / active.span), at, active.on);
            return;
          }

          if (gesture.current.kind === "pinch") {
            // 손가락 하나가 떨어졌다. 남은 손가락으로 끌기를 새로 시작한다.
            gesture.current = { kind: "pan", from: centerRef.current };
            setPinching(false);
            return;
          }

          if (gesture.current.kind !== "pan" || zoomRef.current <= 1) return;
          const view = viewAt(zoomRef.current, centerRef.current);
          const at = clampCenter(
            {
              x: gesture.current.from.x - state.dx / view.scale,
              y: gesture.current.from.y - state.dy / view.scale,
            },
            zoomRef.current,
          );
          applyView(at);
        },
        onPanResponderRelease: (event) => {
          gesture.current = { kind: "none" };
          setPinching(false);
          if (multiTouch.current || movedFar.current) return;
          // 움직이지 않았으면 톡 누른 것이다. 육지를 눌렀으면 그 자리를 품은
          // 시도를 고르고, 이름을 모르는 섬 조각이면 가장 가까운 시도를 고른다.
          const point = toMapPoint(inMap(event.nativeEvent));
          if (!isOnLand(point.x, point.y)) {
            onClear();
            return;
          }
          const region = regionAt(point.x, point.y);
          if (region) onSelect(region);
          else onClear();
        },
        onPanResponderTerminate: () => {
          gesture.current = { kind: "none" };
          setPinching(false);
        },
      }),
    // 제스처 도중 핸들러가 교체되면 현재 드래그가 끊기므로 마운트 동안 유지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const webWheel =
    Platform.OS === "web"
      ? {
          // 휠도 손가락처럼 이어지게 굴린다. 트랙패드로 벌리면 브라우저가
          // ctrl 을 얹은 휠로 보내므로 같은 길로 흘려보낸다.
          onWheel: (event: {
            preventDefault?: () => void;
            ctrlKey?: boolean;
            nativeEvent?: {
              deltaY?: number;
              ctrlKey?: boolean;
              pageX?: number;
              pageY?: number;
            };
            deltaY?: number;
          }) => {
            event.preventDefault?.();
            const native = event.nativeEvent;
            const delta = native?.deltaY ?? event.deltaY ?? 0;
            if (!delta) return;
            const pinch = native?.ctrlKey ?? event.ctrlKey ?? false;
            const focus =
              native?.pageX !== undefined && native?.pageY !== undefined
                ? inMap(native as { pageX: number; pageY: number })
                : { x: size.width / 2, y: size.height / 2 };
            // 배율은 곱으로 움직여야 어느 배율에서든 같은 속도로 느껴진다.
            const step = Math.exp(-delta * (pinch ? 0.01 : 0.0022));
            zoomAround(zoomRef.current * step, focus, toMapPoint(focus));
          },
        }
      : {};
  // 시군구 경로는 668개라 두 손가락으로 벌리는 동안에는 내려둔다.
  const detailed = zoom >= 2 && !pinching;
  const cityPath: string | null =
    // 확대 전에는 큰 시군구 경로를 번들 평가 대상에서 늦춘다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    detailed ? require("./koreaCityPath").koreaCityPath : null;
  return (
    <View style={s.mapOnly}>
      <View
        {...(webWheel as any)}
        {...panResponder.panHandlers}
        ref={host}
        style={s.mapGestureLayer}
        onLayout={(event) => {
          sizeRef.current = event.nativeEvent.layout;
          setSize(event.nativeEvent.layout);
          host.current?.measureInWindow((x, y) => {
            origin.current = { x, y };
          });
        }}
      >
      <Svg
        width="100%"
        height="100%"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <Path d={koreaLandPath} fill={theme.dark ? "#17302F" : "#DDF4EF"} stroke="none" />
        <Path
          d={koreaOutlinePath}
          fill="none"
          stroke={theme.dark ? theme.secondary : "#159D8D"}
          strokeWidth={2.2 / zoom}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Path
          d={koreaAdminPath}
          fill="none"
          stroke={theme.dark ? "#4D837E" : "#4DA99E"}
          strokeWidth={0.75 / zoom}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {detailed && (
          <Path
            d={cityPath!}
            fill="none"
            stroke={theme.dark ? "#315C58" : "#8CCFC7"}
            strokeWidth={0.38 / zoom}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </Svg>
      {tripRegions.map((pin) => {
        const count = trips.filter((trip) => trip.region === pin.name).length;
        const active = selected === pin.name;
        const left = mapOffsetX + (pin.x - boxX) * mapScale;
        const top = mapOffsetY + (pin.y - boxY) * mapScale;
        const visible =
          zoom >= pin.minZoom &&
          left > -24 &&
          left < size.width + 24 &&
          top > -16 &&
          top < size.height + 16;
        return visible ? (
          <Pressable
            key={pin.name}
            onPress={() => {
              if (zoom > 1)
                applyView(clampCenter({ x: pin.x, y: pin.y }, zoom));
              onSelect(pin.name);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${pin.name}, 여행 ${count}개`}
            accessibilityState={{ selected: active }}
            style={[
              s.mapPin,
              { left, top },
              theme.dark && { backgroundColor: theme.surface, borderColor: theme.secondary },
              count > 0 && s.mapPinVisited,
              active && s.mapPinActive,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                s.mapPinText,
                theme.dark && { color: theme.secondary },
                (count > 0 || active) && s.mapPinTextVisited,
              ]}
            >
              {pin.name}
            </Text>
            {count > 0 && (
              <View style={s.pinCount}>
                <Text style={s.pinCountText}>{count}</Text>
              </View>
            )}
          </Pressable>
        ) : null;
      })}
      </View>
      {selected && (
        <View
          style={[
            s.mapTray,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={[s.mapTrayHandle, { backgroundColor: theme.border }]} />
          <View style={s.mapTrayHead}>
            <View>
              <Text style={[s.mapTrayTitle, { color: theme.text }]}>{selected} 여행</Text>
              <Text style={[s.mapTrayCount, { color: theme.muted }]}>
                {results.length
                  ? `여행 ${results.length}개`
                  : "아직 여행이 없어요"}
              </Text>
            </View>
            <Pressable
              onPress={onClear}
              hitSlop={누름여유(28)}
              accessibilityRole="button"
              accessibilityLabel={`${selected} 여행 창 닫기`}
              style={[s.mapTrayClose, { backgroundColor: theme.surfaceAlt }]}
            >
              <Text style={[s.mapTrayCloseText, { color: theme.muted }]}>×</Text>
            </Pressable>
          </View>
          {results.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.mapTrayList}
            >
              {results.map((trip, index) => (
                <Pressable
                  accessibilityRole="button"
                  key={`${trip.name}-${index}`}
                  onPress={() => open(trip)}
                  style={[s.mapTrayCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                >
                  <View
                    style={[
                      s.mapTrayMark,
                      { backgroundColor: tripTone(trip.tone, theme.dark).ink },
                    ]}
                  >
                    <Text style={s.mapTrayMarkText}>{trip.mark}</Text>
                  </View>
                  <View style={s.mapTrayCopy}>
                    <Text numberOfLines={1} style={[s.mapTrayName, { color: theme.text }]}>
                      {trip.name}
                    </Text>
                    <Text numberOfLines={1} style={[s.mapTrayDate, { color: theme.muted }]}>
                      {trip.date}
                    </Text>
                  </View>
                  <Glyph name="chevronRight" size={18} color={theme.secondary} />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={[s.mapTrayEmpty, { color: theme.muted }]}>
              이 지역에는 아직 여행이 없어요. 다른 지역을 선택해 보세요.
            </Text>
          )}
        </View>
      )}
      <View
        style={[
          s.zoomControls,
          { backgroundColor: theme.surface, borderColor: theme.border },
          selected && s.zoomControlsRaised,
        ]}
      >
        <Pressable
          disabled={zoom <= 1}
          onPress={() => changeZoom(-0.5)}
          accessibilityRole="button"
          accessibilityLabel="지도 축소"
          accessibilityState={{ disabled: zoom <= 1 }}
          style={[
            s.zoomButton,
            zoom <= 1 && s.zoomButtonDisabled,
          ]}
        >
          <Glyph name="minus" size={18} color={theme.text} weight={2.4} />
        </Pressable>
        <View style={[s.zoomDivider, { backgroundColor: theme.border }]} />
        <Pressable
          onPress={resetMap}
          accessibilityRole="button"
          accessibilityLabel="지도 전체 위치로 돌아가기"
          style={s.zoomButton}
        >
          <Text style={[s.zoomResetText, { color: theme.muted }]}>전체</Text>
        </Pressable>
        <View style={[s.zoomDivider, { backgroundColor: theme.border }]} />
        <Pressable
          disabled={zoom >= MAP_MAX_ZOOM}
          onPress={() => changeZoom(0.5)}
          accessibilityRole="button"
          accessibilityLabel="지도 확대"
          accessibilityState={{ disabled: zoom >= MAP_MAX_ZOOM }}
          style={[
            s.zoomButton,
            zoom >= MAP_MAX_ZOOM && s.zoomButtonDisabled,
          ]}
        >
          <Glyph name="plus" size={16} color={theme.text} weight={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

function TripCalendar({
  trips,
  month,
  setMonth,
  selectedDate,
  setSelectedDate,
  theme,
}: {
  trips: Trip[];
  month: { year: number; value: number };
  setMonth: (value: { year: number; value: number }) => void;
  selectedDate: string | null;
  setSelectedDate: (value: string | null) => void;
  theme: AppTheme;
}) {
  const firstDay = new Date(month.year, month.value - 1, 1).getDay();
  const days = new Date(month.year, month.value, 0).getDate();
  const cellCount = Math.ceil((firstDay + days) / 7) * 7;
  const cells = Array.from(
    { length: cellCount },
    (_, index) => index - firstDay + 1,
  );
  const monthKey = `${month.year}-${String(month.value).padStart(2, "0")}`;
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(days).padStart(2, "0")}`;
  const monthTrips = trips.filter(
    (trip) => trip.start <= monthEnd && trip.end >= monthStart,
  );
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const move = (amount: number) => {
    const next = new Date(month.year, month.value - 1 + amount, 1);
    setMonth({ year: next.getFullYear(), value: next.getMonth() + 1 });
    setSelectedDate(null);
  };
  const moveToToday = () => {
    setMonth({ year: today.getFullYear(), value: today.getMonth() + 1 });
    setSelectedDate(todayKey);
  };
  const calendarPaper = theme.dark ? "#E8E7E2" : "#FFFEFC";
  const calendarInk = theme.dark ? "#343B49" : "#283046";
  const calendarMuted = theme.dark ? "#686D76" : "#7B7A76";
  const calendarLine = theme.dark ? "#C7C8C5" : "#DFE1E2";
  return (
    <View
      style={[
        s.calendarCard,
        {
          backgroundColor: calendarPaper,
          borderColor: theme.dark ? "#A8ADB5" : "#D9D9D5",
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          s.calendarPageBack,
          theme.dark && { backgroundColor: "#B9C1BF" },
        ]}
      />
      <View style={s.calendarHead}>
        <View style={s.calendarTitleBlock}>
          <Text style={[s.calendarMonth, { color: calendarInk }]}>
            {month.year}. {String(month.value).padStart(2, "0")}
          </Text>
          <Text style={[s.calendarSub, { color: calendarMuted }]}>
            {monthTrips.length
              ? `이달 여행 ${monthTrips.length}개`
              : "이달에는 여행이 없어요"}
          </Text>
        </View>
        <View style={s.calendarControls}>
          <Pressable
            accessibilityRole="button"
            onPress={moveToToday}
            style={[s.calendarTodayButton, { borderColor: theme.dark ? "#B5B5B0" : "#D8D4CA" }]}
          >
            <Text style={[s.calendarTodayText, { color: calendarMuted }]}>오늘</Text>
          </Pressable>
          <Pressable onPress={() => move(-1)} hitSlop={누름여유(28)} accessibilityRole="button" accessibilityLabel="이전 달" style={s.monthArrow}>
            <Glyph name="chevronLeft" size={20} color={calendarInk} />
          </Pressable>
          <Pressable onPress={() => move(1)} hitSlop={누름여유(28)} accessibilityRole="button" accessibilityLabel="다음 달" style={s.monthArrow}>
            <Glyph name="chevronRight" size={20} color={calendarInk} />
          </Pressable>
        </View>
      </View>
      {monthTrips.length > 0 && (
        <View style={s.calendarLegend}>
          {monthTrips.map((trip) => (
            <View key={`${trip.name}-${trip.start}`} style={s.calendarLegendItem}>
              <View
                style={[
                  s.calendarLegendLine,
                  { backgroundColor: tripTone(trip.tone, theme.dark).ink },
                ]}
              />
              <Text style={[s.calendarLegendText, { color: calendarMuted }]}>{trip.name}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={[s.weekRow, { borderBottomColor: calendarLine }]}>
        {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
          <Text
            key={day}
            style={[
              s.weekName,
              theme.dark && { color: "#71767E" },
              index === 0 && s.weekNameSunday,
              index === 6 && s.weekNameSaturday,
            ]}
          >
            {day}
          </Text>
        ))}
      </View>
      <View style={s.calendarGrid}>
        {cells.map((day, index) => {
          const valid = day > 0 && day <= days;
          const key = valid
            ? `${month.year}-${String(month.value).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            : "";
          const trip = trips.find(
            (item) => key >= item.start && key <= item.end,
          );
          const continuesFromPrevious = Boolean(
            trip && index % 7 !== 0 && key > trip.start,
          );
          const continuesToNext = Boolean(
            trip && index % 7 !== 6 && key < trip.end,
          );
          const selected = key === selectedDate;
          const isToday = key === todayKey;
          return (
            <Pressable
              key={`${index}-${day}`}
              disabled={!valid}
              onPress={() => setSelectedDate(selectedDate === key ? null : key)}
              accessibilityRole={valid ? "button" : undefined}
              accessibilityLabel={valid ? `${month.value}월 ${day}일${trip ? `, ${trip.name}` : ""}` : undefined}
              accessibilityState={valid ? { selected } : undefined}
              style={[
                s.dayCell,
                trip && {
                  backgroundColor: tripTone(trip.tone, theme.dark).soft,
                },
                trip && s.dayRangeCell,
                trip && !continuesFromPrevious && s.dayRangeStart,
                trip && !continuesToNext && s.dayRangeEnd,
                selected && [
                  s.dayCellSelected,
                  { borderColor: theme.text },
                ],
              ]}
            >
              <View
                style={[
                  s.dayNumberBadge,
                  isToday && s.dayNumberToday,
                ]}
              >
                <Text
                  style={[
                    s.dayNumber,
                    theme.dark && { color: "#4B5260" },
                    index % 7 === 0 && s.dayNumberSunday,
                    index % 7 === 6 && s.dayNumberSaturday,
                    trip && [s.dayNumberTrip, { color: tripTone(trip.tone, theme.dark).ink }],
                    isToday && s.dayNumberTodayText,
                    selected && s.dayNumberSelected,
                  ]}
                >
                  {valid ? day : ""}
                </Text>
              </View>
              {trip && (
                <View
                  style={[s.dayTripDot, { backgroundColor: tripTone(trip.tone, theme.dark).ink }]}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Search({
  open,
  theme,
  trips,
  loading,
}: {
  open: (destination?: TripDetailDestination, trip?: Trip) => void;
  theme: AppTheme;
  trips: Trip[];
  /** 아직 받아 본 적 없는 여행의 기록을 받아 오는 중인지. 받는 동안은 결과가 는다. */
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  // 처음에는 아무것도 검색해 보지 않은 상태다. 남이 찾은 말을 미리 넣어 두면
  // 내 기록이 아니고, 지워야 할 것부터 생긴다.
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [savedTitles, setSavedTitles] = useState(() => new Set<string>());
  /**
   * 이 공간의 기록을 한 줄씩 펼친다.
   *
   * 예전에는 고정된 예시 여섯 개만 찾을 수 있어서, 화면이 "이 공간의 모든 기록"
   * 이라고 말해 놓고 내가 적은 것은 어떤 말로도 안 나왔다. 한 번 안 나오면
   * 검색을 다시 안 쓰게 된다.
   */
  const allResults = useMemo(() => trips.flatMap((trip) => {
    const plan = trip.planning;
    const rows: { id: string; title: string; type: string; trip: string; detail: string; tags: string[] }[] = [];
    for (const place of plan?.places ?? []) {
      rows.push({
        id: `place-${trip.start}-${place.id}`,
        title: place.name,
        type: "장소",
        trip: trip.name,
        detail: [place.category, place.area].filter(Boolean).join(" · "),
        tags: place.tags ?? [],
      });
    }
    for (const item of plan?.schedule ?? []) {
      rows.push({
        id: `plan-${trip.start}-${item.date ?? ""}-${item.title}`,
        title: item.title,
        type: "일정",
        trip: trip.name,
        detail: [item.date, item.time].filter(Boolean).join(" · "),
        tags: [],
      });
    }
    for (const recipe of plan?.recipes ?? []) {
      rows.push({
        id: `cook-${trip.start}-${recipe.id}`,
        title: recipe.name,
        type: "요리",
        trip: trip.name,
        detail: `재료 ${recipe.ingredients.length}개${recipe.note ? ` · ${recipe.note}` : ""}`,
        // 재료는 모두 찾을 수 있어야 한다. 앞 3개만 넣던 때는 "돼지고기" 로는
        // 나오는데 "대파" 로는 안 나왔다.
        tags: recipe.ingredients.map((item) => item.name),
      });
    }
    for (const item of plan?.packingItems ?? []) {
      rows.push({
        id: `pack-${trip.start}-${item.id}`,
        title: item.name,
        type: "준비",
        trip: trip.name,
        detail: [item.quantity, item.owner].filter(Boolean).join(" · "),
        tags: item.tags ?? [],
      });
    }
    for (const item of plan?.expenses ?? []) {
      rows.push({
        id: `cost-${trip.start}-${item.id}`,
        title: item.title,
        type: "비용",
        trip: trip.name,
        detail: [item.day, money(item.amount, plan?.currency), item.category, item.payer && `${item.payer} 냄`]
          .filter(Boolean)
          .join(" · "),
        tags: item.memo ? [item.memo] : [],
      });
    }
    for (const note of plan?.tripNotes ?? []) {
      rows.push({
        id: `note-${trip.start}-${note.id}`,
        title: note.body,
        type: "기록",
        trip: trip.name,
        detail: note.author,
        tags: [],
      });
    }
    for (const diary of plan?.memories?.diaries ?? []) {
      rows.push({
        id: `diary-${trip.start}-${diary.id}`,
        title: diary.title,
        type: "기록",
        trip: trip.name,
        detail: diary.date,
        tags: [],
      });
    }
    return rows;
  }), [trips]);
  const searchableResults = allResults.filter((item) =>
    `${item.title} ${item.trip} ${item.detail} ${item.tags.join(" ")}`
      .toLocaleLowerCase("ko-KR")
      .includes(query.trim().toLocaleLowerCase("ko-KR")),
  );
  const matched = searchableResults.filter(
    (item) => category === "전체" || item.type === category,
  );
  // 공간에 여행이 쌓이면 기록은 수백 줄이 된다. 아무것도 안 친 상태에서 그걸
  // 다 쏟으면 훑을 수가 없어서, 먼저 조금만 보여 주고 눌러서 펼치게 한다.
  const [showAllResults, setShowAllResults] = useState(false);
  const results = showAllResults ? matched : matched.slice(0, 12);
  const searchFilters = ["전체", "장소", "일정", "요리", "준비", "비용", "기록"].map(
    (label) => ({
      label,
      count:
        label === "전체"
          ? searchableResults.length
          : searchableResults.filter((item) => item.type === label).length,
    }),
  );
  const runSearch = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setQuery(next);
    setRecentQueries((current) => [next, ...current.filter((word) => word !== next)].slice(0, 6));
  };
  return (
    <ScrollView
      style={{ backgroundColor: "transparent" }}
      contentContainerStyle={s.searchPage}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[s.overline, { color: theme.primary }]}>
        이 공간의 모든 기록
      </Text>
      <Text style={[s.screenTitle, { color: theme.text }]}>찾기</Text>
      <Text style={[s.searchIntro, { color: theme.muted }]}>
        다녀온 여행과 준비 중인 기록을 한곳에서 찾아 보세요
      </Text>
      {/* 아직 받아 본 적 없는 여행을 받아 오는 중이다. 받는 대로 결과가 는다. */}
      {loading && (
        <Text accessibilityLiveRegion="polite" style={[s.searchIntro, { color: theme.primary }]}>
          기록을 불러오는 중이에요
        </Text>
      )}
      <View
        style={[
          s.searchBoxNew,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Path d="m15.5 15.5 4 4M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" fill="none" stroke={theme.muted} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
        <TextInput
          accessibilityLabel="여행 기록 검색"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch(query)}
          returnKeyType="search"
          placeholder="장소, 음식, 준비물, 메모 검색"
          placeholderTextColor={theme.muted}
          style={[s.searchInputNew, { color: theme.text }]}
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery("")}
            accessibilityRole="button"
            accessibilityLabel="검색어 지우기"
            hitSlop={10}
            style={[
              s.searchClear,
              { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={[s.searchClearText, { color: theme.muted }]}>×</Text>
          </Pressable>
        )}
      </View>
      <View style={s.searchGuideHead}>
          <Text style={[s.searchGuideTitle, { color: theme.muted }]}>
            최근 검색
          </Text>
          {recentQueries.length > 0 && (
            <Pressable
              onPress={() => showAlert(
                "최근 검색을 모두 삭제할까요?",
                `${recentQueries.length}개를 삭제해요. 되돌릴 수 없어요.`,
                [
                  { text: "취소", style: "cancel" },
                  { text: "삭제", style: "destructive", onPress: () => setRecentQueries([]) },
                ],
              )}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="최근 검색 전체 삭제"
            >
              <Text style={[s.searchRecentClear, { color: theme.muted }]}>전체 삭제</Text>
            </Pressable>
          )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.searchSuggestions}>
            {recentQueries.map((word) => (
              <Pressable
                key={word}
                onPress={() => runSearch(word)}
                hitSlop={누름여유(높이.칩)}
                accessibilityRole="button"
                accessibilityLabel={`최근 검색어 ${word}`}
                style={[
                  s.searchSuggestion,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text
                  style={[
                    s.searchSuggestionText,
                    { color: theme.secondary },
                  ]}
                >
                  {word}
                </Text>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    setRecentQueries((current) => current.filter((item) => item !== word));
                  }}
                  hitSlop={7}
                  accessibilityRole="button"
                  accessibilityLabel={`${word} 최근 검색어 삭제`}
                >
                  <Text style={[s.searchSuggestionRemove, { color: theme.muted }]}>×</Text>
                </Pressable>
              </Pressable>
            ))}
            {recentQueries.length === 0 && (
              <Text style={[s.searchRecentEmpty, { color: theme.muted }]}>검색하면 최근 검색어가 여기에 남아요</Text>
            )}
      </ScrollView>
      <View style={[s.searchCategories, s.searchCategoriesContent]}>
        {searchFilters.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => setCategory(item.label)}
            accessibilityRole="button"
            accessibilityState={{ selected: category === item.label }}
            accessibilityLabel={`${item.label}, 결과 ${item.count}개`}
            style={[
              s.searchCategory,
              { backgroundColor: theme.surface, borderColor: theme.border },
              category === item.label && s.searchCategoryActive,
              category === item.label && {
                backgroundColor: theme.primarySoft,
                borderColor: `${theme.primary}70`,
              },
            ]}
          >
            <Text
              style={[
                s.searchCategoryText,
                { color: theme.muted },
                category === item.label && s.searchCategoryTextActive,
                category === item.label && { color: theme.primary },
              ]}
            >
              {item.label}
            </Text>
            <View
              style={[
                s.searchCategoryCount,
                {
                  backgroundColor:
                    category === item.label ? theme.primary : theme.surfaceAlt,
                },
              ]}
            >
              <Text
                style={[
                  s.searchCategoryCountText,
                  {
                    color:
                      category === item.label ? "#FFFFFF" : theme.muted,
                  },
                ]}
              >
                {item.count}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={s.searchResultHead}>
        {/* 개수는 바로 위 분류 칩이 항상 보여준다. 여기서 또 세면 같은 말이 두 번이다. */}
        <Text style={[s.searchResultTitle, { color: theme.text }]}>
          {query || category !== "전체" ? "검색 결과" : "여행 기록"}
        </Text>
      </View>
      {results.length > 0 && (
      <View style={s.searchResultsSheet}>
      {results.map((item, index) => {
        const tone = kindColor(item.type, theme.dark, theme.primary);
        return (
        <View
          key={item.id}
          style={[
            s.searchResultCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            index === results.length - 1 && matched.length <= results.length && s.searchResultCardLast,
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              s.searchResultColorTab,
              { backgroundColor: tone },
            ]}
          />
          <Pressable
            onPress={() => {
              const trip = trips.find((candidate) => candidate.name === item.trip);
              const destination: TripDetailDestination =
                item.type === "장소"
                  ? "places"
                  : item.type === "준비"
                    ? "preparation"
                    : item.type === "요리"
                      ? "cooking"
                      : item.type === "비용"
                        ? "expenses"
                        : item.type === "기록"
                          ? "memories"
                          : "overview";
              open(destination, trip);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.trip} 여행의 ${item.type} ${item.title} 열기`}
            style={s.searchResultMain}
          >
            <View style={s.searchResultCopy}>
              <View style={s.searchResultLine}>
                <Text numberOfLines={1} style={[s.searchResultName, { color: theme.text }]}>{item.title}</Text>
                <View
                  style={[
                    s.searchResultTypeBadge,
                    {
                      backgroundColor: `${tone}${theme.dark ? "28" : "14"}`,
                    },
                  ]}
                >
                  <Text style={[s.searchResultType, { color: tone }]}>{item.type}</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={[s.searchResultDetail, { color: theme.muted }]}>{item.detail}</Text>
              <View style={s.searchResultMetaRow}>
                <Text numberOfLines={1} style={[s.searchResultTrip, { color: theme.muted }]}>{item.trip}</Text>
                {item.tags.slice(0, 2).map((tag) => (
                  <Text key={tag} style={[s.searchResultTag, { color: tone }]}># {tag}</Text>
                ))}
              </View>
            </View>
            <Glyph name="chevronRight" size={18} color={theme.muted} />
          </Pressable>
          {item.type === "장소" && (
            <View
              style={[
                s.searchResultActions,
                { borderTopColor: theme.border },
              ]}
            >
              <Pressable
                onPress={() =>
                  setSavedTitles((current) => {
                    const next = new Set(current);
                    if (next.has(item.title)) next.delete(item.title);
                    else next.add(item.title);
                    return next;
                  })
                }
                accessibilityRole="button"
                accessibilityState={{ selected: savedTitles.has(item.title) }}
                accessibilityLabel={`${item.title} ${savedTitles.has(item.title) ? "저장 취소" : "저장"}`}
                style={s.searchResultAction}
              >
                <Text style={[s.searchResultActionText, { color: savedTitles.has(item.title) ? theme.secondary : theme.muted }]}>{savedTitles.has(item.title) ? "저장됨" : "저장"}</Text>
              </Pressable>
              <Pressable
                onPress={() => open("schedule-add", trips.find((trip) => trip.name === item.trip))}
                accessibilityRole="button"
                accessibilityLabel={`${item.trip} 여행의 일정 추가 화면 열기`}
                style={s.searchResultAction}
              >
                <Text style={[s.searchResultActionText, { color: theme.primary }]}>일정 추가</Text>
              </Pressable>
              <MapLink
                theme={theme}
                url={naverMapSearchUrl(item.title)}
                shape="inline"
                subject={item.title}
              />
            </View>
          )}
        </View>
        );
      })}
      {matched.length > results.length && (
        <Pressable
          onPress={() => setShowAllResults(true)}
          accessibilityRole="button"
          accessibilityLabel={`기록 ${matched.length - results.length}개 더 보기`}
          style={[s.searchMore, { borderTopColor: theme.border }]}
        >
          <Text style={[s.searchMoreText, { color: theme.primary }]}>
            {matched.length - results.length}개 더 보기
          </Text>
        </Pressable>
      )}
      </View>
      )}
      {!results.length && (
        <View
          style={[
            s.searchEmpty,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Svg width={48} height={48} viewBox="0 0 48 48">
            <Path d="m30 30 9 9M21 34a13 13 0 1 1 0-26 13 13 0 0 1 0 26Zm-5-14h10M21 15v10" fill="none" stroke={theme.primary} strokeWidth={1.6} strokeLinecap="round" />
          </Svg>
          <Text style={[s.searchEmptyTitle, { color: theme.text }]}>
            {loading ? "기록을 불러오는 중이에요" : "찾는 기록이 없어요"}
          </Text>
          <Text style={[s.searchEmptyCopy, { color: theme.muted }]}>
            {loading
              ? "여행 기록을 불러오는 중이에요."
              : "다른 단어나 카테고리로 검색해 보세요."}
          </Text>
          {(query || category !== "전체") && (
            <Pressable
              onPress={() => {
                setQuery("");
                setCategory("전체");
              }}
              accessibilityRole="button"
              style={[s.emptyInlineAction, { backgroundColor: theme.primarySoft }]}
            >
              <Text style={[s.emptyInlineActionText, { color: theme.primary }]}>검색 초기화</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * 앱에 담아 배포하는 제3자 저작물의 고지.
 *
 * 쿠키런 라이선스는 저작권 안내와 라이선스 전문을 함께 포함할 것을 임베딩 조건으로
 * 건다(docs/product-rules/01-daymo-development-rules.md 9장). 전문은 분량이 많아
 * 앱 안에 옮겨 적는 대신 공식 문서로 연결한다.
 *
 * 앞으로 고지할 저작물이 늘어나면 이 배열에 항목만 더한다.
 */
type OpenSourceNotice = {
  /** 링크 버튼에 적을 말. 가는 곳이 라이선스 전문이 아닐 수도 있다. */
  linkLabel: string;
  id: string;
  /** 저작물 이름. */
  name: string;
  /** 저작권자. 라이선스가 요구하는 저작권 안내 문구 그대로 쓴다. */
  holder: string;
  /** 앱이 이 저작물을 어떻게 쓰는지. */
  usage: string;
  /** 라이선스 전문 주소. */
  licenseUrl: string;
};

const openSourceNotices: OpenSourceNotice[] = [
  {
    id: "sgis",
    name: "대한민국 행정구역 경계",
    holder: "출처: 국가데이터처 통계지리정보서비스(SGIS)",
    usage:
      "여행 지도의 해안선과 시도·시군구 경계는 SGIS가 공개한 2018년 행정구역 경계를 앱 화면에 맞게 옮겨 그린 것이에요.",
    licenseUrl: "https://sgis.kostat.go.kr/view/pss/dataProvdIntrcn",
    linkLabel: "자료 제공 안내 보기",
  },
  {
    id: "cookierun",
    name: "쿠키런 서체",
    holder: "쿠키런 글꼴의 지식 재산권은 데브시스터즈(주)에 있습니다.",
    usage:
      "Daymo는 제목과 본문에 쿠키런 Regular와 Bold를 씁니다. 배포된 글꼴 파일을 그대로 담았고 수정하거나 개작하지 않았어요.",
    licenseUrl: "https://www.cookierunfont.com/static/download/License_ko_en.pdf",
    linkLabel: "라이선스 전문 보기",
  },
];

function Together({
  theme,
  themeId,
  setThemeId,
  appearance,
  setAppearance,
  trips,
  spaces,
  setSpaces,
  activeSpace,
  updateActiveSpace,
  spaceSaveState,
  setActiveGroupId,
  user,
  setUser,
  syncUser,
  onEmailChangeRequested,
  openTrip,
  onLogout,
  onWipe,
  onMembersChanged,
  onJoinInvite,
  onCreateSpace,
  onAccountDeletionRequested,
}: {
  theme: AppTheme;
  themeId: ThemeId;
  setThemeId: (value: ThemeId) => void;
  appearance: AppearanceMode;
  setAppearance: (value: AppearanceMode) => void;
  trips: Trip[];
  spaces: Space[];
  setSpaces: React.Dispatch<React.SetStateAction<Space[]>>;
  /** 지금 보고 있는 공간. 이름·멤버·관계·시작일이 전부 여기서 온다. */
  activeSpace: Space;
  updateActiveSpace: (change: Partial<Space>) => void;
  /** 공간 정보 저장이 어디까지 갔는지. 실패를 조용히 넘기지 않으려고 받는다. */
  spaceSaveState: "idle" | "saving" | "saved" | "failed";
  setActiveGroupId: (group: GroupId) => void;
  user: DaymoUser;
  setUser: React.Dispatch<React.SetStateAction<DaymoUser | null>>;
  /** 서버의 내 정보를 다시 받아 화면을 맞춘다. 계정 화면을 열 때 부른다. */
  syncUser: () => Promise<AuthUser | null>;
  /** 이메일 바꾸기 확인 메일을 보냈다. 한동안 바뀌었는지 조금 더 자주 본다. */
  onEmailChangeRequested: () => void;
  openTrip: (trip: Trip) => void;
  onLogout: () => void;
  /** 이 기기에 남은 것을 전부 지운다. 서버의 계정은 그대로다. */
  onWipe: () => void;
  /** 멤버·권한이 바뀌었다. 공간 목록을 서버에서 다시 받는다. */
  onMembersChanged: () => void;
  /** 공간을 하나 더 만들고 그 공간으로 옮겨 간다. */
  onCreateSpace: (name: string, relationshipType: ServerSpace["relationshipType"]) => Promise<void>;
  /** 초대 링크로 참여한다. 들어간 공간으로 옮겨 간다. */
  onJoinInvite: (token: string) => Promise<{ alreadyMember: boolean }>;
  /** 계정 삭제 요청이 받아들여졌다. 서버가 모든 기기를 로그아웃시킨 뒤다. */
  onAccountDeletionRequested: (scheduledAt: string | null) => void;
}) {
  const spaceName = activeSpace.name;
  const relationship = activeSpace.relationship;
  const since = activeSpace.since;
  const [selectedMember, setSelectedMember] = useState(0);
  const selectGroup = (space: Space) => {
    setActiveGroupId(space.id as GroupId);
    setSelectedMember(0);
  };
  /**
   * 화면에 보이는 사람 목록. 나는 늘 첫 번째다.
   *
   * 멤버와 권한은 서버에서 온다. 여기서 고치지 않는다. 멤버 이름·권한 변경,
   * 내보내기, 초대는 서버에 아직 API 가 없어서, 화면에서 고치면 기기에만
   * 바뀌었다가 다음에 서버에서 받을 때 말없이 되돌아간다. 고친 것처럼 보이는
   * 버튼을 두지 않고 읽기 전용으로 둔다.
   *
   * 내 권한을 아직 모르면(서버에서 못 받았으면) 관리자라고 적지 않는다.
   */
  // 이름을 고치면 잠깐 기다렸다가 서버에 저장한다. 글자마다 보내지 않는다.
  const [nameSave, setNameSave] = useState<"idle" | "saving" | "saved" | "failed" | "tooLong">("idle");
  const savedName = useRef(user.name);
  useEffect(() => {
    const name = user.name.split(/\s+/).filter(Boolean).join(" ");
    if (!name || name === savedName.current) return;
    const timer = setTimeout(() => {
      if (name.length > 20) {
        setNameSave("tooLong");
        return;
      }
      setNameSave("saving");
      updateDisplayName(name)
        .then((saved) => {
          savedName.current = saved;
          setNameSave("saved");
        })
        .catch(() => setNameSave("failed"));
    }, 900);
    return () => clearTimeout(timer);
  }, [user.name]);
  const people = [
    { key: "me", membershipId: activeSpace.myMembershipId, name: user.name, role: activeSpace.myRole ?? "불러오는 중", me: true },
    ...activeSpace.members.map((member, index) => ({
      key: member.id ?? `${member.name}-${index}`,
      membershipId: member.id,
      name: member.name,
      role: member.role as string,
      me: false,
    })),
  ];
  const selectedPerson = people[selectedMember] ?? people[0];
  const canEdit = canEditSpace(activeSpace.myRole);
  const roleExplain: Record<string, string> = {
    관리자: "공간 정보와 모든 여행을 관리할 수 있어요.",
    "편집 가능": "여행과 일정·준비물·비용을 함께 고칠 수 있어요.",
    보기만: "내용을 볼 수 있지만 고칠 수는 없어요.",
  };
  const totalTripDays = trips.reduce((total, trip) => {
    const start = new Date(`${trip.start}T00:00:00`).getTime();
    const end = new Date(`${trip.end}T00:00:00`).getTime();
    return total + Math.max(1, Math.round((end - start) / 86400000) + 1);
  }, 0);
  const visitedRegions = new Set(trips.map((trip) => trip.region)).size;
  const [panel, setPanel] = useState<
    | "profile"
    | "members"
    | "relationship"
    | "theme"
    | "appearance"
    | "help"
    | "licenses"
    | "account"
    | "deleteAccount"
    | "groups"
    | "deleteSpace"
    | "devices"
    | "settings"
    | null
  >(null);
  // 계정 화면을 열 때 서버에 내 정보를 다시 묻는다. 이메일은 새 주소로 간 링크를
  // 눌러야 바뀌어서, 이 화면이 옛 주소를 보여 주는 일이 없어야 한다.
  useEffect(() => {
    if (panel === "account") void syncUser();
  }, [panel, syncUser]);
  /**
   * 여행 기록을 글로 내보낸다.
   *
   * 예전에는 여행 이름과 한 줄 메모만 담아서, 정작 남기고 싶은 일정·준비물·
   * 쓴 돈이 빠져 있었다. 앱을 지우기 전에 이걸로 남겨 둘 수 있어야 한다.
   *
   * 내보내는 길은 지출 표(CSV)와 같다. 웹은 파일 내려받기, 휴대폰은 공유 시트,
   * 둘 다 안 되면 클립보드다. 예전에는 `Share.share` 만 불러서, 공유 창이 없는
   * 데스크톱 브라우저에서는 눌러도 아무 일이 없었다.
   */
  const exportData = async () => {
    const markdown = tripsToMarkdown(trips);
    try {
      if ((await shareTripArchive(`${activeSpace.name} 여행 기록`, markdown)) === "unavailable") {
        await Clipboard.setStringAsync(markdown);
        showAlert("여행 기록을 복사했어요", "메모 앱에 붙여넣으면 그대로 남아요.");
      }
    } catch {
      showAlert("여행 기록을 저장하지 못했어요", "잠시 후 다시 시도해 주세요.");
    }
  };
  /**
   * 설정 안에 있는 화면들. 닫으면 창을 통째로 닫지 않고 설정 목록으로 돌아간다.
   *
   * 창은 하나만 쓴다. iOS 는 떠 있는 창 위에 창을 또 얹지 못해서(사진 정보가 안 뜨던
   * 그 문제), 겹쳐 쌓는 대신 안에 그리는 것을 갈아 끼운다.
   */
  const 설정_안 = ["profile", "relationship", "account", "devices", "theme", "appearance", "help", "licenses", "deleteAccount", "deleteSpace"];
  const 패널_닫기 = () => setPanel(panel && 설정_안.includes(panel) ? "settings" : null);
  const panelTitle =
    panel === "settings"
      ? "설정"
      : panel === "groups"
      ? "여행 공간 바꾸기"
      : panel === "account"
      ? "내 프로필"
      : panel === "devices"
      ? "로그인한 기기"
      : panel === "deleteAccount"
      ? "계정 삭제"
      : panel === "deleteSpace"
      ? "공간 삭제"
      : panel === "members"
      ? "함께하는 멤버"
      : panel === "relationship"
        ? "관계 설정"
        : panel === "theme"
          ? "앱 색상"
          : panel === "appearance"
            ? "화면 모드"
            : panel === "help"
              ? "Daymo 도움말"
              : panel === "licenses"
                ? "오픈소스 라이선스"
                : "공간 프로필";
  // 설정 묶음이 화면 어디쯤인지. 머리의 버튼이 그리로 내려 보낸다.
  return (
    <>
      <ScrollView
        style={{ backgroundColor: "transparent" }}
        contentContainerStyle={s.page}
      >
        <View style={s.togetherHead}>
          <View>
            <Text style={[s.overline, { color: theme.primary }]}>
              함께 관리하는 여행
            </Text>
            <Text style={[s.screenTitle, { color: theme.text }]}>우리</Text>
          </View>
          <View style={s.togetherHeadActions}>
            {/* 설정은 제 화면으로 뺐다. 예전에는 이 버튼이 페이지를 그 자리로 굴려
                내렸는데, 눌러도 「어디로 갔다」는 느낌이 없고 닫을 방법도 없었다.
                이제 「우리」 탭은 공간·멤버·기록만 맡는다. */}
            <Pressable
              onPress={() => setPanel("settings")}
              accessibilityRole="button"
              accessibilityLabel="설정 열기"
              style={[s.togetherSettingsButton, { backgroundColor: theme.surfaceAlt }]}
            >
              <Glyph name="gear" size={17} color={theme.muted} weight={1.8} />
              <Text style={[s.togetherSettingsText, { color: theme.muted }]}>설정</Text>
            </Pressable>
            <Pressable
              onPress={() => setPanel("account")}
              accessibilityRole="button"
              accessibilityLabel="내 프로필 열기"
              style={[s.togetherAccountButton, { backgroundColor: theme.primarySoft }]}
            >
              <Text style={[s.togetherAccountInitial, { color: theme.primary }]}>{user.name.slice(0, 1)}</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={() => setPanel("groups")}
          accessibilityRole="button"
          accessibilityLabel={`현재 여행 공간 ${spaceName}, 공간 바꾸기`}
          style={[
            s.workspaceCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {/* 비행기는 아래 「여행」 탭과 같은 그림이라 탭 하나가 더 있는 것처럼
              읽혔다. 오른쪽 위 내 프로필 단추처럼 이름 첫 글자를 둔다. */}
          <View style={[s.workspaceMark, { backgroundColor: theme.primarySoft }]}>
            <Text style={[s.workspaceMarkInitial, { color: theme.primary }]}>{spaceName.trim().slice(0, 1) || "?"}</Text>
          </View>
          <View style={s.workspaceCopy}>
            <Text style={[s.workspaceLabel, { color: theme.muted }]}>현재 여행 공간</Text>
            <Text numberOfLines={1} style={[s.workspaceName, { color: theme.text }]}>{spaceName}</Text>
            <Text numberOfLines={1} style={[s.workspaceMeta, { color: theme.muted }]}>멤버 {people.length}명 · 여행 {trips.length}개</Text>
          </View>
          <View style={[s.workspaceSwitchBadge, { backgroundColor: theme.primarySoft }]}>
            <Text style={[s.workspaceSwitchBadgeText, { color: theme.primary }]}>바꾸기</Text>
          </View>
        </Pressable>
        <View style={s.memberSectionHead}>
          <View>
            <Text style={[s.historyEyebrow, { color: theme.primary }]}>멤버</Text>
            <Text style={[s.memberSectionTitle, { color: theme.text }]}>함께하는 멤버</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="멤버 관리"
            hitSlop={12}
            style={s.memberManageHit}
          >
            <Text style={[s.memberManageText, { color: theme.primary }]}>관리</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[s.memberStrip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          contentContainerStyle={s.memberStripContent}
        >
          {people.map((member, index) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${member.name} ${roleLabel(member.role)}, 멤버 관리 열기`}
              key={`${member.name}-${index}`}
              onPress={() => {
                setSelectedMember(index);
                setPanel("members");
              }}
              style={s.memberStripItem}
            >
              <View style={[s.memberStripAvatar, { backgroundColor: [theme.primary, theme.accent, theme.secondary][index % 3] }]}>
                <Text style={[s.memberStripInitial, { color: onAccent(theme.dark) }]}>{member.name.slice(0, 1)}</Text>
              </View>
              <Text numberOfLines={1} style={[s.memberStripName, { color: theme.text }]}>{member.me ? "나" : member.name}</Text>
              <Text numberOfLines={1} style={[s.memberStripRole, { color: theme.muted }]}>{roleLabel(member.role)}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="멤버 추가"
            onPress={() => setPanel("members")}
            style={s.memberStripItem}
          >
            <View style={[s.memberInviteAvatar, { borderColor: theme.border }]}><Glyph name="plus" size={16} color={theme.primary} weight={2.2} /></View>
            <Text style={[s.memberStripName, { color: theme.muted }]}>추가</Text>
            <Text style={[s.memberStripRole, { color: theme.muted }]}>멤버 관리</Text>
          </Pressable>
        </ScrollView>
        <Text style={[s.managementLabel, { color: theme.muted }]}>빠른 관리</Text>
        <View style={s.togetherQuickRow}>
          {[
            {
              icon: "plus" as const,
              label: "멤버 관리",
              onPress: () => setPanel("members"),
            },
            { icon: "share" as const, label: "여행 기록 저장하기", onPress: () => void exportData() },
            {
              icon: "swap" as const,
              label: "공간 바꾸기",
              onPress: () => setPanel("groups"),
            },
          ].map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={[
                s.togetherQuick,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View style={[s.togetherQuickIcon, { backgroundColor: theme.primarySoft }]}>
                <Glyph name={action.icon} size={16} color={theme.primary} weight={2.2} />
              </View>
              <Text numberOfLines={1} style={[s.togetherQuickLabel, { color: theme.text }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.historyHeading}>
          <View>
            <Text style={[s.historyEyebrow, { color: theme.primary }]}>지금까지의 기록</Text>
            <Text style={[s.historyTitle, { color: theme.text }]}>함께 쌓은 여행</Text>
          </View>
          <Text style={[s.historyPeriod, { color: theme.muted }]}>{since.slice(0, 4)} — {new Date().getFullYear()}</Text>
        </View>
        <View
          style={[
            s.historySummary,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {[
            { value: String(trips.length), unit: "번", label: "함께한 여행", color: theme.primary },
            { value: String(totalTripDays), unit: "일", label: "여행한 날", color: theme.secondary },
            { value: String(visitedRegions), unit: "곳", label: "방문한 지역", color: theme.accent },
          ].map((stat, index) => (
            <View
              key={stat.label}
              style={[s.historySummaryItem, index > 0 && { borderLeftColor: theme.border, borderLeftWidth: 1 }]}
            >
              <Text style={[s.historySummaryValue, { color: stat.color }]}>
                {stat.value}<Text style={[s.historyUnit, { color: theme.muted }]}>{stat.unit}</Text>
              </Text>
              <Text style={[s.historySummaryLabel, { color: theme.muted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
        {trips[0] && (
          <Pressable
            onPress={() => openTrip(trips[0])}
            accessibilityRole="button"
            accessibilityLabel={`최근 여행 ${trips[0].name} 열기`}
            style={[s.historyLatest, { borderColor: theme.border }]}
          >
            <View style={[s.historyLatestDot, { backgroundColor: tripTone(trips[0].tone, theme.dark).ink }]} />
            <Text style={[s.historyLatestLabel, { color: theme.muted }]}>최근 여행</Text>
            <Text numberOfLines={1} style={[s.historyLatestName, { color: theme.text }]}>{trips[0].name}</Text>
            <Text style={[s.historyLatestDate, { color: theme.muted }]}>{trips[0].date}</Text>
          </Pressable>
        )}
      </ScrollView>
      <InfoSheet
        theme={theme}
        visible={panel !== null}
        title={panelTitle}
        onClose={패널_닫기}
      >
        {panel === "settings" && (
          <>
        <Text style={[s.settingGroupLabel, { color: theme.muted }]}>공간 설정</Text>
            <View
              style={[
                s.settingGroup,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Setting
                theme={theme}
                label="공간 프로필"
                value={spaceName}
                onPress={() => setPanel("profile")}
              />
              <Setting
                theme={theme}
                label="관계 설정"
                value={relationship}
                onPress={() => setPanel("relationship")}
              />
            </View>
            <Text style={[s.settingGroupLabel, { color: theme.muted }]}>앱과 계정</Text>
            <View
              style={[
                s.settingGroup,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Setting
                theme={theme}
                label="내 프로필"
                value={user.name}
                onPress={() => setPanel("account")}
              />
              {/* 예전에는 내 프로필 맨 아래에 숨어 있었다. 한도(5대)에 걸려 다른 기기가
                  로그아웃되고 나서야 찾게 되는 자리라, 설정 줄로 꺼내 둔다. */}
              <Setting
                theme={theme}
                label="로그인한 기기"
                value={`최대 ${MAX_DEVICES}대`}
                onPress={() => setPanel("devices")}
              />
              <Setting
                theme={theme}
                label="앱 색상"
                value={theme.name}
                onPress={() => setPanel("theme")}
              />
              <Setting
                theme={theme}
                label="화면 모드"
                value={
                  appearance === "system"
                    ? "시스템 설정과 같게"
                    : appearance === "dark"
                      ? "다크 모드"
                      : "라이트 모드"
                }
                onPress={() => setPanel("appearance")}
              />
              <Setting
                theme={theme}
                label="도움말"
                onPress={() => setPanel("help")}
              />
              <Setting
                theme={theme}
                label="오픈소스 라이선스"
                onPress={() => setPanel("licenses")}
              />
            </View>
            {/* 문제를 알릴 때 무엇을 쓰고 있는지 말할 수 있어야 한다. */}
            <Text style={[s.appVersion, { color: theme.muted }]}>Daymo {appVersion}</Text>
          </>
        )}
        {panel === "groups" && (
          <>
            <Text style={[s.sheetCopy, { color: theme.muted }]}>함께 관리할 여행 공간을 골라 주세요.</Text>
            {spaces.map((space) => {
              const current = space.id === activeSpace.id;
              return (
              <Pressable
                key={space.id}
                onPress={() => {
                  selectGroup(space);
                  setPanel(null);
                }}
                accessibilityRole="radio"
                accessibilityLabel={`${space.name} 공간으로 바꾸기`}
                accessibilityState={{ checked: current }}
                style={[s.groupChoice, { backgroundColor: theme.surface, borderColor: current ? theme.primary : theme.border }]}
              >
                <View style={[s.groupChoiceAvatar, { backgroundColor: current ? theme.primary : theme.primarySoft }]}>
                  <Text style={[s.groupChoiceAvatarText, { color: current ? onAccent(theme.dark) : theme.primary }]}>{space.name.slice(0, 1)}</Text>
                </View>
                <View style={s.groupChoiceCopy}>
                  <Text numberOfLines={1} style={[s.groupChoiceName, { color: theme.text }]}>{space.name}</Text>
                  <Text numberOfLines={1} style={[s.groupChoiceMeta, { color: theme.muted }]}>
                    {[user.name, ...space.members.map((member) => member.name)].join(" · ")}
                  </Text>
                </View>
                <View style={s.groupChoiceCheck}>
                  {current && <Glyph name="check" size={14} color={theme.primary} weight={2.4} />}
                </View>
              </Pressable>
            );})}
            <SpaceExtras
              theme={theme}
              onCreate={async (name, relationshipType) => {
                await onCreateSpace(name, relationshipType);
                setPanel(null);
              }}
              onRestored={(spaceId) => {
                setActiveGroupId(spaceId as GroupId);
                onMembersChanged();
                setPanel(null);
              }}
            />
          </>
        )}
        {panel === "account" && (
          <>
            <View style={[s.accountPreview, { backgroundColor: theme.primarySoft }]}>
              <View style={[s.accountAvatar, { backgroundColor: theme.primary }]}>
                <Text style={[s.accountAvatarText, { color: onAccent(theme.dark) }]}>{user.name.trim().slice(0, 1) || "?"}</Text>
              </View>
              <View style={s.accountPreviewCopy}>
                <Text style={[s.accountPreviewName, { color: theme.text }]}>{user.name}</Text>
                <Text style={[s.accountPreviewEmail, { color: theme.muted }]}>{user.email}</Text>
              </View>
            </View>
            <Field
              theme={theme}
              label="이름 또는 별명"
              value={user.name}
              onChangeText={(name) => setUser((current) => (current ? { ...current, name } : current))}
              placeholder="앱에서 사용할 이름"
            />
            {/* 이메일은 새 주소로 간 링크를 눌러야 바뀐다. 이 칸에서 바로 고친 것처럼 보이게 두지 않고
                아래 ‘이메일 바꾸기’로 보낸다. */}
            <Field
              theme={theme}
              label="이메일"
              value={user.email}
              onChangeText={() => {}}
              editable={false}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={[s.sheetCopy, { color: theme.muted }]}>
              {nameSave === "saving"
                ? "이름을 저장하는 중이에요."
                : nameSave === "failed"
                  ? "이름을 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."
                  : nameSave === "tooLong"
                    ? "이름은 20자까지 쓸 수 있어요."
                    : "이름은 같은 공간 멤버에게 보여요. 이메일은 아래 ‘이메일 바꾸기’에서 바꿀 수 있어요."}
            </Text>
            <AccountChangeSection
              theme={theme}
              user={user}
              onPasswordSet={() => setUser((current) => (current ? { ...current, hasPassword: true } : current))}
              onEmailChangeRequested={onEmailChangeRequested}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                showAlert("로그아웃할까요?", "아직 올라가지 않은 내용은 사라질 수 있어요.", [
                  { text: "취소", style: "cancel" },
                  { text: "로그아웃", style: "destructive", onPress: () => { setPanel(null); onLogout(); } },
                ]);
              }}
              style={[s.accountLogout, { borderColor: theme.border }]}
            >
              <Text style={s.accountLogoutText}>로그아웃</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                showAlert(
                  "이 기기의 데이터를 모두 삭제할까요?",
                  "이 기기에만 저장된 일정·준비물·비용·기록과 앱 설정이 사라져요. 계정에 저장된 공간과 여행은 그대로예요. 되돌릴 수 없어요.",
                  [
                    { text: "취소", style: "cancel" },
                    { text: "모두 삭제", style: "destructive", onPress: () => { setPanel(null); onWipe(); } },
                  ],
                );
              }}
              accessibilityRole="button"
              style={s.accountDelete}
            >
              <Text style={s.accountDeleteText}>이 기기 데이터 모두 삭제</Text>
            </Pressable>
            <Pressable
              onPress={() => setPanel("deleteAccount")}
              accessibilityRole="button"
              style={s.accountDelete}
            >
              <Text style={s.accountDeleteText}>계정 삭제</Text>
            </Pressable>
            <LegalLinks theme={theme} />
          </>
        )}
        {panel === "deleteAccount" && (
          <AccountDeletionPanel
            theme={theme}
            user={user}
            onRequested={(scheduledAt) => {
              setPanel(null);
              onAccountDeletionRequested(scheduledAt);
            }}
          />
        )}
        {panel === "members" && (
          <>
            <View style={s.memberManagerHead}>
              <View>
                <Text style={[s.memberManagerTitle, { color: theme.text }]}>{people.length}명이 함께하고 있어요</Text>
                <Text style={[s.memberManagerCopy, { color: theme.muted }]}>관리할 멤버를 골라 주세요.</Text>
              </View>
            </View>
            <View style={s.memberManagerGrid}>
              {people.map((member, index) => (
                <Pressable
                  key={`${member.key}-manage`}
                  onPress={() => setSelectedMember(index)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${member.name} 고르기`}
                  accessibilityState={{ checked: selectedMember === index }}
                  style={[
                    s.memberManagerCard,
                    { backgroundColor: theme.surface, borderColor: selectedMember === index ? theme.primary : theme.border },
                    selectedMember === index && { borderWidth: 2 },
                  ]}
                >
                  <View style={[s.memberManagerAvatar, { backgroundColor: [theme.primary, theme.accent, theme.secondary][index % 3] }]}>
                    <Text style={[s.memberStripInitial, { color: onAccent(theme.dark) }]}>{member.name.slice(0, 1)}</Text>
                  </View>
                  <View style={s.memberManagerCardCopy}>
                    <Text numberOfLines={1} style={[s.memberManagerName, { color: theme.text }]}>{member.name}{member.me ? " (나)" : ""}</Text>
                    <Text numberOfLines={1} style={[s.memberManagerRole, { color: selectedMember === index ? theme.primary : theme.muted }]}>{roleLabel(member.role)}</Text>
                  </View>
                  <View style={selectedMember !== index && { opacity: 0 }}>
                    <Glyph name="check" size={16} color={theme.primary} weight={2.4} />
                  </View>
                </Pressable>
              ))}
            </View>
            <View style={[s.memberEditor, { backgroundColor: theme.primarySoft }]}>
              <Text style={[s.memberEditorEyebrow, { color: theme.primary }]}>선택한 멤버</Text>
              <Text style={[s.memberManagerTitle, { color: theme.text }]}>
                {selectedPerson.name}{selectedPerson.me ? " (나)" : ""}
              </Text>
              <Text style={[s.memberPermissionLabel, { color: theme.text }]}>{roleLabel(selectedPerson.role)}</Text>
              {/* 서버가 지키는 권한이다. 예전에는 이름표일 뿐이라고 적어 뒀는데, 이제
                  보기만인 사람이 고치면 서버가 막는다. */}
              <Text style={[s.memberRoleText, { color: theme.muted }]}>
                {roleExplain[selectedPerson.role] ?? "권한을 불러오지 못했어요. 인터넷에 연결되면 다시 확인해요."}
              </Text>
            </View>
            {/* 고른 사람이 남이면 여기서 권한과 내보내기를 다룬다. 나를 골랐을 때의
                「이 공간에서 나가기」는 아래로 내려 보낸다 — 되돌릴 수 없는 일이
                초대보다 위에서 눈에 먼저 띌 이유가 없다. */}
            {activeSpace.myMembershipId && !selectedPerson.me && (
              <MemberActions
                // 다른 멤버를 고르면 쓰던 신고와 오류를 새로 시작한다.
                key={selectedPerson.membershipId ?? selectedPerson.name}
                theme={theme}
                spaceId={activeSpace.id}
                myRole={activeSpace.myRole}
                person={selectedPerson}
                alone={people.length === 1}
                onChanged={() => {
                  setSelectedMember(0);
                  onMembersChanged();
                }}
              />
            )}
            {/* 이름만 적어 넣는 멤버 추가는 두지 않는다. 서버에 없는 사람이 담당과 정산에
                들어가면 다른 기기에서는 그 사람이 보이지 않는다. 사람은 초대 링크로만 들어온다. */}
            <InviteSection
              theme={theme}
              spaceId={activeSpace.myMembershipId ? activeSpace.id : undefined}
              canInvite={activeSpace.myRole === "관리자" || activeSpace.myRole === "편집 가능"}
              isOwner={activeSpace.myRole === "관리자"}
              myMembershipId={activeSpace.myMembershipId}
              onJoin={onJoinInvite}
            />
            {activeSpace.myMembershipId && selectedPerson.me && (
              <MemberActions
                key={`${selectedPerson.membershipId ?? selectedPerson.name}-me`}
                theme={theme}
                spaceId={activeSpace.id}
                myRole={activeSpace.myRole}
                person={selectedPerson}
                alone={people.length === 1}
                onChanged={() => {
                  setSelectedMember(0);
                  onMembersChanged();
                }}
              />
            )}
          </>
        )}
        {panel === "relationship" && (
          <>
            <Choice
              theme={theme}
              selected={relationship === "연인"}
              label="연인"
              disabled={!canEdit}
              onPress={() => updateActiveSpace({ relationship: "연인" })}
            />
            <Choice
              theme={theme}
              selected={relationship === "친구"}
              label="친구"
              disabled={!canEdit}
              onPress={() => updateActiveSpace({ relationship: "친구" })}
            />
            <SpaceSaveNote theme={theme} canEdit={canEdit} state={spaceSaveState} />
          </>
        )}
        {panel === "devices" && (
          <>
            <Text style={[s.sheetCopy, { color: theme.muted }]}>
              이 계정으로 로그인한 기기예요. 한 계정은 {MAX_DEVICES}대까지 쓸 수 있고, 넘기면 가장
              오래 쓰지 않은 기기가 로그아웃돼요. 안 쓰는 기기는 여기서 미리 로그아웃해 두세요.
            </Text>
            <DeviceSessionsSection
              theme={theme}
              onSignedOut={() => {
                setPanel(null);
                onLogout();
              }}
            />
          </>
        )}
        {panel === "theme" && (
          <View style={s.themeGrid}>
            {themeOptions.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => setThemeId(option.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: themeId === option.id }}
                style={[
                  s.themeOption,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  themeId === option.id && {
                    borderColor: option.primary,
                    borderWidth: 2,
                  },
                ]}
              >
                <View style={s.themeSwatches}>
                  <View
                    style={[
                      s.themeSwatch,
                      { backgroundColor: option.primary },
                    ]}
                  />
                  <View
                    style={[
                      s.themeSwatch,
                      { backgroundColor: option.secondary },
                    ]}
                  />
                  <View
                    style={[
                      s.themeSwatch,
                      { backgroundColor: option.accent },
                    ]}
                  />
                </View>
                <Text
                  style={[s.themeOptionName, { color: theme.text }]}
                >
                  {option.name}
                </Text>
                <View style={s.themeOptionCheck}>
                  {themeId === option.id && <Glyph name="check" size={12} color={theme.text} weight={2.4} />}
                </View>
              </Pressable>
            ))}
          </View>
        )}
        {panel === "appearance" && (
          <>
            <Choice
              theme={theme}
              selected={appearance === "system"}
              label="시스템 설정과 같게"
              onPress={() => setAppearance("system")}
            />
            <Choice
              theme={theme}
              selected={appearance === "light"}
              label="라이트 모드"
              onPress={() => setAppearance("light")}
            />
            <Choice
              theme={theme}
              selected={appearance === "dark"}
              label="다크 모드"
              onPress={() => setAppearance("dark")}
            />
          </>
        )}
        {panel === "help" && (
          <>
            {helpTopics.map((topic) => (
              <View key={topic.q} style={[s.helpItem, { borderColor: theme.border }]}>
                <Text style={[s.helpQuestion, { color: theme.text }]}>{topic.q}</Text>
                <Text style={[s.helpAnswer, { color: theme.muted }]}>{topic.a}</Text>
              </View>
            ))}
          </>
        )}
        {panel === "licenses" && (
          <>
            <Text style={[s.sheetCopy, { color: theme.muted }]}>
              Daymo를 만드는 데 쓴 오픈소스와 라이선스예요.
            </Text>
            {openSourceNotices.map((notice) => (
              <View
                key={notice.id}
                style={[s.noticeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <Text style={[s.noticeName, { color: theme.text }]}>{notice.name}</Text>
                <Text style={[s.noticeHolder, { color: theme.text }]}>{notice.holder}</Text>
                <Text style={[s.noticeBody, { color: theme.muted }]}>{notice.usage}</Text>
                <Pressable
                  onPress={() => {
                    Linking.openURL(notice.licenseUrl);
                  }}
                  accessibilityRole="link"
                  accessibilityLabel={`${notice.name} ${notice.linkLabel}`}
                  style={({ pressed }) => [
                    s.noticeLink,
                    { backgroundColor: theme.primarySoft },
                    pressed && s.pressed,
                  ]}
                >
                  <Text style={[s.noticeLinkText, { color: theme.primary }]}>
                    {notice.linkLabel}
                  </Text>
                  <Glyph name="arrowRight" size={16} color={theme.primary} />
                </Pressable>
              </View>
            ))}
          </>
        )}
        {panel === "profile" && (
          <>
            <View style={[s.profileSheetPreview, { backgroundColor: theme.primarySoft }]}>
              {people.slice(0, 2).map((member, index) => (
                <View
                  key={member.name}
                  style={[
                    s.profileSheetAvatar,
                    index > 0 && s.profileSheetAvatarSecond,
                    { backgroundColor: index > 0 ? theme.accent : theme.primary },
                  ]}
                >
                  <Text style={[s.togetherAvatarText, { color: onAccent(theme.dark) }]}>
                    {member.name.trim().slice(0, 1) || "?"}
                  </Text>
                </View>
              ))}
              <Text numberOfLines={1} style={[s.profileSheetName, { color: theme.text }]}>{spaceName}</Text>
            </View>
            <Field
              theme={theme}
              label="공간 이름"
              value={spaceName}
              onChangeText={(name) => updateActiveSpace({ name })}
              placeholder="예: 우리의 여행 기록"
              editable={canEdit}
            />
            {/* 연인 공간에서만 "함께한 지 N일째" 를 센다. 친구·가족 공간에는
                쓸 데가 없어서 자리만 차지한다. 날짜 고르기는 관리자에게만 연다. */}
            {relationship === "연인" && canEdit && (
              <TripDateRangePicker
                theme={theme}
                start={since}
                end={since}
                setStart={(value) => updateActiveSpace({ since: value })}
                setEnd={() => {}}
              />
            )}
            {relationship === "연인" && !canEdit && (
              <Text style={[s.sheetCopy, { color: theme.text }]}>
                {since ? `함께하기 시작한 날 · ${since}` : "함께하기 시작한 날을 아직 적지 않았어요."}
              </Text>
            )}
            <SpaceSaveNote theme={theme} canEdit={canEdit} state={spaceSaveState} />
            {canEdit && activeSpace.myMembershipId && (
              <Pressable onPress={() => setPanel("deleteSpace")} accessibilityRole="button" style={s.accountDelete}>
                <Text style={s.accountDeleteText}>이 공간 삭제</Text>
              </Pressable>
            )}
          </>
        )}
        {panel === "deleteSpace" && (
          <SpaceDeletionPanel
            theme={theme}
            spaceName={activeSpace.name}
            onDelete={async (confirmationName) => {
              await deleteSpace(activeSpace.id, confirmationName);
              setPanel(null);
              onMembersChanged();
            }}
          />
        )}
      </InfoSheet>
    </>
  );
}

function BottomNavIcon({ item, color }: { item: MainView; color: string }) {
  const paths: Record<MainView, string> = {
    홈: "M3 9.5 10 3l7 6.5v7a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z",
    여행: "M9 18v-5.5L3 14v-2l6-3.5V4a1 1 0 0 1 2 0v4.5l6 3.5v2l-6-1.5V18l2 1v1l-3-1-3 1v-1z",
    찾기: "M8.5 14a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zm4-1.5L17 17",
    우리: "M10 17S3 13 3 8.5A3.5 3.5 0 0 1 10 7a3.5 3.5 0 0 1 7 1.5C17 13 10 17 10 17z",
  };
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Path
        d={paths[item]}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function BottomBar({
  active,
  setActive,
  theme,
}: {
  active: MainView;
  setActive: (view: MainView) => void;
  theme: AppTheme;
}) {
  return (
    <View
      style={[
        s.bottom,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {(["홈", "여행", "찾기", "우리"] as MainView[]).map((item) => (
        <Pressable
          key={item}
          onPress={() => setActive(item)}
          accessibilityRole="tab"
          accessibilityLabel={`${item} 탭`}
          accessibilityState={{ selected: active === item }}
          style={s.navItem}
        >
          <View
            style={[
              s.navIconWrap,
              active === item && {
                backgroundColor: theme.primarySoft,
                transform: [{ rotate: item === "여행" ? "-3deg" : "2deg" }],
              },
            ]}
          >
            <BottomNavIcon
              item={item}
              color={active === item ? theme.primary : theme.muted}
            />
          </View>
          <Text
            style={[
              s.navText,
              { color: theme.muted },
              active === item && { color: theme.text },
            ]}
          >
            {item}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TripArt({
  tone,
  date,
  small,
}: {
  tone: { fill: string; ink: string };
  date: string;
  small?: boolean;
}) {
  return (
    <View
      style={[s.tripArt, small && s.tripArtSmall, { backgroundColor: tone.fill }]}
    >
      <View style={s.artMoon} />
      <View style={s.artDate}>
        <Text style={[s.artText, { color: tone.ink }]}>
          {Number(date)}<Text style={[s.artUnit, { color: tone.ink }]}>월</Text>
        </Text>
        <View style={[s.artLine, { backgroundColor: tone.ink }]} />
      </View>
    </View>
  );
}
function Setting({
  label,
  value,
  onPress,
  theme,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  theme?: AppTheme;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [
        s.setting,
        theme && { borderColor: theme.border },
        pressed && s.pressed,
      ]}
    >
      <Text style={[s.settingName, theme && { color: theme.text }]}>
        {label}
      </Text>
      <View style={s.settingRight}>
        {value && (
          <Text style={[s.settingValue, theme && { color: theme.primary }]}>
            {value}
          </Text>
        )}
        <Glyph name="chevronRight" size={18} color={theme?.muted ?? "#646C7A"} />
      </View>
    </Pressable>
  );
}

function Field({
  theme,
  label,
  ...props
}: {
  theme?: AppTheme;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: TextInputProps["secureTextEntry"];
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  editable?: TextInputProps["editable"];
}) {
  return (
    <View style={s.field}>
      <View style={s.fieldLabelRow}>
        <View style={[s.fieldLabelDot, theme && { backgroundColor: theme.primary }]} />
        <Text style={[s.fieldLabel, theme && { color: theme.text }]}>
          {label}
        </Text>
      </View>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={theme?.muted ?? "#9AA1AE"}
        style={[
          s.fieldInput,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          },
          // 고칠 수 없는 칸은 흐리게 둔다. 눌러도 반응이 없는데 똑같이 보이면 고장처럼 보인다.
          props.editable === false && theme && { backgroundColor: theme.surfaceAlt, color: theme.muted },
        ]}
      />
    </View>
  );
}
function InfoSheet({
  theme,
  visible,
  title,
  onClose,
  children,
}: {
  theme?: AppTheme;
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <SheetShell
      theme={theme}
      visible={visible}
      title={title}
      onClose={onClose}
      // 「우리 설정」은 둘러보고 고치는 자리라 저장 버튼이 없다. 닫기는 머리의
      // × 하나면 된다. 예전에는 여기만 머리를 따로 그려 「우리 설정 ──○」 와
      // 「완료」를 얹었는데, 장소·일정 같은 다른 창과 모양이 달라 같은 앱의 다른
      // 창처럼 보였다. 기본 머리를 그대로 쓴다.
      padBody={false}
      scrollContentStyle={s.infoSheetBody}
    >
      {children}
    </SheetShell>
  );
}
/**
 * 공간 정보를 저장했는지 알려 주는 한 줄.
 *
 * "바꾸면 바로 저장돼요" 로만 적어 두면 실패해도 사용자는 저장됐다고 믿는다.
 * 권한이 없는 사람에게는 왜 고칠 수 없는지를 대신 알려 준다.
 */
function SpaceSaveNote({
  theme,
  canEdit,
  state,
}: {
  theme: AppTheme;
  canEdit: boolean;
  state: "idle" | "saving" | "saved" | "failed";
}) {
  if (!canEdit) {
    return (
      <Text style={[s.sheetCopy, { color: theme.muted }]}>
        공간 정보는 관리자만 바꿀 수 있어요.
      </Text>
    );
  }
  const copy = {
    idle: "바꾸면 멤버 모두에게 바로 반영돼요.",
    saving: "저장하고 있어요…",
    saved: "저장했어요.",
    failed: "저장하지 못했어요. 인터넷 연결을 확인하고 다시 바꿔 주세요.",
  }[state];
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[s.sheetCopy, { color: state === "failed" ? (theme.dark ? statusColor.danger.dark : statusColor.danger.light) : theme.muted }]}
    >
      {copy}
    </Text>
  );
}

/**
 * 공간 삭제. 계정 삭제처럼 시트 안에서 확인받는다. 공간 이름을 똑같이 적어야 버튼이 켜진다
 * (docs/development/03-api-specification.md 3장).
 */
function SpaceDeletionPanel({
  theme,
  spaceName,
  onDelete,
}: {
  theme: AppTheme;
  spaceName: string;
  onDelete: (confirmationName: string) => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const danger = theme.dark ? statusColor.danger.dark : statusColor.danger.light;
  const ready = understood && typed.trim() === spaceName.trim() && !loading;
  const submit = async () => {
    if (!ready) return;
    setLoading(true);
    setError("");
    try {
      await onDelete(typed.trim());
    } catch (caught) {
      setError(caught instanceof DaymoApiError ? caught.message : "공간을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setLoading(false);
    }
  };
  return (
    <>
      {[
        "모든 멤버에게서 이 공간이 바로 사라져요.",
        "7일 뒤에 공간 안의 여행, 일정, 비용, 사진이 모두 삭제돼요.",
        "7일 안에는 여행 공간 바꾸기 화면에서 관리자가 되돌릴 수 있어요.",
      ].map((line) => (
        <Text key={line} style={[s.sheetCopy, { color: theme.text }]}>· {line}</Text>
      ))}
      <Field theme={theme} label={`공간 이름 “${spaceName}”을 똑같이 입력해 주세요`} value={typed} onChangeText={setTyped} placeholder={spaceName} />
      <Pressable
        onPress={() => setUnderstood((current) => !current)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: understood }}
        style={s.authConsentRow}
      >
        <View style={[s.authConsentCheck, { borderColor: understood ? danger : theme.border, backgroundColor: understood ? danger : theme.surface }]}>
          {understood && <Glyph name="check" size={12} color="#FFFFFF" weight={2.6} />}
        </View>
        <Text style={[s.authConsentText, { color: theme.text }]}>삭제되는 범위를 확인했어요</Text>
      </Pressable>
      {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: danger }]}>{error}</Text> : null}
      <Pressable
        onPress={() => void submit()}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready, busy: loading }}
        style={[s.authSubmit, { backgroundColor: danger }, !ready && s.authSubmitDisabled]}
      >
        <Text style={[s.authSubmitText, { color: "#FFFFFF" }]}>{loading ? "삭제하는 중…" : "7일 뒤 삭제하기"}</Text>
      </Pressable>
    </>
  );
}

/** 공간 바꾸기 화면 아래: 새 공간 만들기와, 관리자가 되돌릴 수 있는 지운 공간. */
function SpaceExtras({
  theme,
  onCreate,
  onRestored,
}: {
  theme: AppTheme;
  onCreate: (name: string, relationshipType: ServerSpace["relationshipType"]) => Promise<void>;
  onRestored: (spaceId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [relationshipType, setRelationshipType] = useState<ServerSpace["relationshipType"]>("friends");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState<{ id: string; name: string; deletionScheduledAt: string }[]>([]);
  useEffect(() => {
    let alive = true;
    listDeletedSpaces()
      .then((found) => {
        if (alive) setDeleted(found);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const fail = (caught: unknown) => setError(caught instanceof DaymoApiError ? caught.message : "잠시 후 다시 시도해 주세요.");
  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate(name.trim(), relationshipType);
    } catch (caught) {
      fail(caught);
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 8, marginTop: 12 }}>
      {creating ? (
        <View style={[s.memberEditor, { backgroundColor: theme.surfaceAlt, gap: 8 }]}>
          <Field theme={theme} label="새 공간 이름" value={name} onChangeText={setName} placeholder="예: 대학 동기 여행" />
          <Choice theme={theme} label="연인" selected={relationshipType === "couple"} onPress={() => setRelationshipType("couple")} />
          <Choice theme={theme} label="친구" selected={relationshipType === "friends"} onPress={() => setRelationshipType("friends")} />
          <Pressable
            accessibilityRole="button"
            disabled={!name.trim() || busy}
            onPress={() => void create()}
            style={[s.authSubmit, { backgroundColor: theme.primary }, (!name.trim() || busy) && s.authSubmitDisabled]}
          >
            <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{busy ? "만드는 중…" : "공간 만들기"}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={[s.accountLogout, { borderColor: theme.border }]}>
          <Text style={[s.accountLogoutText, { color: theme.text }]}>새 공간 만들기</Text>
        </Pressable>
      )}
      {deleted.length > 0 && (
        <View style={[s.memberEditor, { backgroundColor: theme.surfaceAlt, gap: 6 }]}>
          <Text style={[s.memberPermissionLabel, { color: theme.text }]}>삭제한 공간</Text>
          <Text style={[s.memberRoleText, { color: theme.muted, marginTop: 0 }]}>관리자만 보여요. 기한이 지나면 되돌릴 수 없어요.</Text>
          {deleted.map((space) => (
            <View key={space.id} style={s.inviteRow}>
              <Text style={[s.memberRoleText, { color: theme.text, marginTop: 0, flex: 1 }]} numberOfLines={1}>
                {space.name} · {deletionDateLabel(space.deletionScheduledAt)}까지
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${space.name} 되돌리기`}
                hitSlop={8}
                onPress={() => {
                  restoreSpace(space.id).then(() => onRestored(space.id)).catch(fail);
                }}
              >
                <Text style={[s.accountLogoutText, { color: theme.primary }]}>되돌리기</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * 고른 멤버에게 할 수 있는 일. 서버가 권한을 다시 확인한다.
 *
 * - 관리자: 다른 멤버의 권한 바꾸기, 관리자 넘기기, 내보내기
 * - 누구나: 나가기. 다른 멤버가 있는 관리자는 먼저 넘겨야 한다(서버가 409 로 알려 준다)
 * - 누구나: 다른 멤버 신고하기, 차단하기. 신고한 사람과 차단한 사실은 상대에게 알리지 않는다
 */
function MemberActions({
  theme,
  spaceId,
  myRole,
  person,
  alone,
  onChanged,
}: {
  theme: AppTheme;
  spaceId: string;
  myRole?: string;
  person: { membershipId?: string; name: string; role: string; me: boolean };
  alone: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  // 이 공간에서 내가 차단한 사람의 membership id. 서버가 이 공간 기준 id 로 준다.
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const membershipId = person.membershipId;
  useEffect(() => {
    let active = true;
    listBlocks(spaceId)
      .then((found) => {
        if (active) setBlockedIds(blockedMembershipIds(found));
      })
      // 못 받아 오면 차단하기로 보인다. 이미 차단한 사람을 다시 차단해도 서버는 그대로 둔다.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [spaceId]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      onChanged();
    } catch (caught) {
      setError(caught instanceof DaymoApiError ? caught.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  if (!membershipId) return null;
  const confirm = (title: string, message: string, action: string, work: () => Promise<unknown>) =>
    showAlert(title, message, [
      { text: "취소", style: "cancel" },
      { text: action, style: "destructive", onPress: () => void run(work) },
    ]);

  if (person.me) {
    if (alone) return null;
    return (
      <View style={[s.memberEditor, { backgroundColor: theme.surfaceAlt }]}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => confirm(
            "이 공간에서 나갈까요?",
            "내가 쓴 일정·지출·기록은 공간에 남아요. 다시 들어오려면 초대 링크를 받아야 해요.",
            "나가기",
            () => removeMember(spaceId, membershipId),
          )}
          style={s.accountDelete}
        >
          <Text style={s.accountDeleteText}>이 공간에서 나가기</Text>
        </Pressable>
        {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}>{error}</Text> : null}
      </View>
    );
  }

  const blocked = blockedIds.includes(membershipId);
  // 차단은 멤버 목록을 바꾸지 않는다. 선택을 그대로 두고 차단 여부만 다시 받는다.
  const changeBlock = async (work: () => Promise<unknown>, done?: () => void) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setBlockedIds(blockedMembershipIds(await listBlocks(spaceId)));
      done?.();
    } catch (caught) {
      setError(caught instanceof DaymoApiError ? caught.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[s.memberEditor, { backgroundColor: theme.surfaceAlt }]}>
      {myRole === "관리자" && (
        <>
          <Text style={[s.memberPermissionLabel, { color: theme.text }]}>{person.name} 님의 권한</Text>
          <Choice
            theme={theme}
            label="편집 가능"
            selected={person.role === "편집 가능"}
            disabled={busy}
            onPress={() => void run(() => changeMemberRole(spaceId, membershipId, roleToServer("편집 가능")))}
          />
          <Choice
            theme={theme}
            label="보기 전용"
            selected={person.role === "보기만"}
            disabled={busy}
            onPress={() => void run(() => changeMemberRole(spaceId, membershipId, roleToServer("보기만")))}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => confirm(
              `${person.name} 님에게 관리자를 넘길까요?`,
              "공간은 관리자 한 명이 관리해요. 넘기면 나는 편집 가능한 멤버가 돼요.",
              "넘기기",
              () => changeMemberRole(spaceId, membershipId, "owner"),
            )}
            style={[s.accountLogout, { borderColor: theme.border }]}
          >
            <Text style={[s.accountLogoutText, { color: theme.text }]}>관리자 넘기기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => confirm(
              `${person.name} 님을 내보낼까요?`,
              "그 사람이 쓴 일정·지출·기록은 공간에 남아요. 다시 들어오려면 초대 링크가 필요해요.",
              "내보내기",
              () => removeMember(spaceId, membershipId),
            )}
            style={s.accountDelete}
          >
            <Text style={s.accountDeleteText}>공간에서 내보내기</Text>
          </Pressable>
        </>
      )}
      {reporting ? (
        <MemberReportForm
          key={membershipId}
          theme={theme}
          spaceId={spaceId}
          membershipId={membershipId}
          name={person.name}
          onClose={() => setReporting(false)}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setReporting(true)}
          style={[s.accountLogout, { borderColor: theme.border }]}
        >
          <Text style={[s.accountLogoutText, { color: theme.text }]}>신고하기</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => blocked
          ? showAlert(`${person.name} 님의 차단을 풀까요?`, "다시 초대 링크로 같은 공간에 들어올 수 있어요.", [
            { text: "취소", style: "cancel" },
            { text: "차단 해제", onPress: () => void changeBlock(() => unblock(membershipId)) },
          ])
          : showAlert(`${person.name} 님을 차단할까요?`, "차단하면 앞으로 서로를 새 공간에 초대할 수 없어요. 상대에게는 알리지 않아요.", [
            { text: "취소", style: "cancel" },
            {
              text: "차단하기",
              style: "destructive",
              onPress: () => void changeBlock(() => blockMember(membershipId), () => showAlert(
                "차단했어요",
                "이미 함께 있는 공간은 그대로예요. 불편하면 공간에서 나가거나 관리자에게 내보내 달라고 해 주세요.",
              )),
            },
          ])}
        style={s.accountDelete}
      >
        <Text style={s.accountDeleteText}>{blocked ? "차단 해제" : "차단하기"}</Text>
      </Pressable>
      {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}>{error}</Text> : null}
    </View>
  );
}

const blockedMembershipIds = (blocks: ServerBlock[]) =>
  blocks.map((item) => item.membershipId).filter((id): id is string => Boolean(id));

const REPORT_REASONS: { label: string; value: ReportReason }[] = [
  { label: "스팸·광고", value: "spam" },
  { label: "괴롭힘·혐오", value: "harassment" },
  { label: "음란·성적", value: "sexual" },
  { label: "폭력·위협", value: "violence" },
  { label: "개인정보 노출", value: "privacy" },
  { label: "저작권 침해", value: "copyright" },
  { label: "기타", value: "other" },
];

/**
 * 멤버 신고. 멤버 관리 창 안에 펼친다.
 *
 * 창 위에 창을 하나 더 띄우지 않는다. iOS 에서는 Modal 이 겹치면 뒤에 연 것이 뜨지 않을 때가 있다.
 */
function MemberReportForm({
  theme,
  spaceId,
  membershipId,
  name,
  onClose,
}: {
  theme: AppTheme;
  spaceId: string;
  membershipId: string;
  name: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const danger = theme.dark ? statusColor.danger.dark : statusColor.danger.light;

  if (sent) {
    return (
      <View accessibilityLiveRegion="polite" style={{ marginTop: 16 }}>
        <Text style={[s.memberPermissionLabel, { color: theme.text }]}>신고를 받았어요. 24시간 안에 확인할게요.</Text>
        <Text style={[s.sheetCopy, { color: theme.muted }]}>신고한 사람은 {name} 님에게 알려지지 않아요.</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={[s.accountLogout, { borderColor: theme.border, marginTop: 0 }]}>
          <Text style={[s.accountLogoutText, { color: theme.text }]}>닫기</Text>
        </Pressable>
      </View>
    );
  }

  const send = async () => {
    if (!reason || sending) return;
    setSending(true);
    setError("");
    try {
      await createReport({
        spaceId,
        targetType: "member",
        targetId: membershipId,
        reason,
        ...(detail.trim() ? { detail: detail.trim().slice(0, 1000) } : {}),
      });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof DaymoApiError && caught.status !== 0 ? caught.message : "보내지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[s.memberPermissionLabel, { color: theme.text }]}>{name} 님을 신고하는 이유</Text>
      {REPORT_REASONS.map((item) => (
        <Choice
          key={item.value}
          theme={theme}
          label={item.label}
          selected={reason === item.value}
          disabled={sending}
          onPress={() => setReason(item.value)}
        />
      ))}
      <Field
        theme={theme}
        label="자세한 내용 (선택)"
        value={detail}
        onChangeText={setDetail}
        placeholder="확인에 도움이 되는 내용을 적어 주세요"
      />
      <Text style={[s.sheetCopy, { color: theme.muted }]}>운영자가 확인해요. 신고한 사람은 상대에게 알려지지 않아요.</Text>
      {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: danger }]}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={!reason || sending}
        accessibilityState={{ disabled: !reason || sending, busy: sending }}
        onPress={() => void send()}
        style={[s.authSubmit, { backgroundColor: theme.primary, marginTop: 0 }, (!reason || sending) && s.authSubmitDisabled]}
      >
        <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{sending ? "보내는 중…" : "신고 보내기"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onClose} style={s.accountDelete}>
        <Text style={[s.accountDeleteText, { color: theme.muted }]}>취소</Text>
      </Pressable>
    </View>
  );
}

const inviteDeadline = (iso: string) => {
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일까지`;
};

/**
 * 초대 링크 보내기와, 받은 링크로 참여하기.
 *
 * 링크 원문은 만든 순간에만 받을 수 있어서 바로 공유 창을 연다. 목록에는 남은 기간과
 * 들어온 사람 수만 보인다.
 */
function InviteSection({
  theme,
  spaceId,
  canInvite,
  isOwner,
  myMembershipId,
  onJoin,
}: {
  theme: AppTheme;
  /** 서버 공간일 때만. 예시 공간에서는 초대를 만들 수 없다. */
  spaceId?: string;
  canInvite: boolean;
  isOwner: boolean;
  myMembershipId?: string;
  onJoin: (token: string) => Promise<{ alreadyMember: boolean }>;
}) {
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  useEffect(() => {
    if (!spaceId || !canInvite) return;
    let active = true;
    listInvites(spaceId)
      .then((found) => {
        if (active) setInvites(found);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [canInvite, spaceId]);

  const fail = (caught: unknown) =>
    setError(caught instanceof DaymoApiError ? caught.message : "잠시 후 다시 시도해 주세요.");

  const sendInvite = async () => {
    if (!spaceId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const invite = await createInvite(spaceId);
      setInvites((current) => [invite, ...current]);
      setBusy(false);
      const url = invite.inviteUrl ?? "";
      // 공유 창이 닫힐 때까지 기다리지 않는다. 링크 원문은 지금만 받을 수 있어 먼저 복사해 둔다.
      await Clipboard.setStringAsync(url).catch(() => undefined);
      setMessage("초대 링크를 만들고 복사해 뒀어요. 7일 동안 10명까지 들어올 수 있어요.");
      Share.share({ message: `Daymo 여행 공간에 초대해요. 7일 안에 열어 주세요.
${url}` }).catch(() => undefined);
    } catch (caught) {
      fail(caught);
      setBusy(false);
    }
  };

  const revoke = async (invite: ServerInvite) => {
    if (!spaceId) return;
    setError("");
    try {
      await revokeInvite(spaceId, invite.id);
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      setMessage("초대 링크를 삭제했어요. 이제 그 링크로는 들어올 수 없어요.");
    } catch (caught) {
      fail(caught);
    }
  };

  const join = async () => {
    const token = inviteTokenOf(link);
    if (!token) {
      setError("받은 초대 링크를 그대로 붙여 넣어 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const joined = await onJoin(token);
      setLink("");
      setMessage(joined.alreadyMember ? "이미 함께하고 있는 공간이에요." : "공간에 참여했어요.");
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.memberEditor, { backgroundColor: theme.surfaceAlt, gap: 8 }]}>
      {spaceId && canInvite && (
        <>
          <Text style={[s.memberPermissionLabel, { color: theme.text }]}>멤버 초대</Text>
          <Text style={[s.memberRoleText, { color: theme.muted, marginTop: 0 }]}>
            링크를 받은 사람은 로그인해 이메일을 확인하면 편집 가능 멤버로 들어와요.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void sendInvite()}
            style={[s.authSubmit, { backgroundColor: theme.primary }, busy && s.authSubmitDisabled]}
          >
            <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>초대 링크 보내기</Text>
          </Pressable>
          {invites.map((invite) => (
            <View key={invite.id} style={s.inviteRow}>
              <Text style={[s.memberRoleText, { color: theme.muted, marginTop: 0, flex: 1 }]}>
                {inviteDeadline(invite.expiresAt)} · {invite.usedCount}/{invite.maxUses}명 참여
              </Text>
              {(isOwner || invite.createdByMembershipId === myMembershipId) && (
                <Pressable accessibilityRole="button" accessibilityLabel="초대 링크 삭제" onPress={() => void revoke(invite)}>
                  <Text style={s.accountDeleteText}>삭제</Text>
                </Pressable>
              )}
            </View>
          ))}
        </>
      )}
      <Field
        theme={theme}
        label="초대 링크로 참여"
        value={link}
        onChangeText={setLink}
        placeholder="받은 초대 링크를 붙여 넣어 주세요"
        autoCapitalize="none"
      />
      <Pressable
        accessibilityRole="button"
        disabled={busy || !link.trim()}
        onPress={() => void join()}
        style={[s.accountLogout, { borderColor: theme.border }, (busy || !link.trim()) && s.authSubmitDisabled]}
      >
        <Text style={[s.accountLogoutText, { color: theme.text }]}>참여하기</Text>
      </Pressable>
      {message ? <Text accessibilityLiveRegion="polite" style={[s.memberRoleText, { color: theme.primary, marginTop: 0 }]}>{message}</Text> : null}
      {error ? <Text accessibilityLiveRegion="assertive" style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * 로그인해 둔 기기와 해지.
 *
 * 서버는 기기가 한도를 넘으면 가장 오래 쓰지 않은 것을 **말없이** 끊는다. 웹(사파리)·
 * 웹(크롬)·폰을 오가면 금방 찬다. 지금까지는 끊긴 뒤에야 한 번 알려 줬다. 여기서는
 * 차기 전에 몇 대를 쓰고 있는지 보여 주고, 쓰지 않는 기기를 스스로 끊게 한다.
 *
 * 지금 이 기기를 해지하면 로그아웃과 같은 뜻이라 다르게 묻고, 끝나면 바로 로그아웃한다.
 */
function DeviceSessionsSection({ theme, onSignedOut }: { theme: AppTheme; onSignedOut: () => void }) {
  const [devices, setDevices] = useState<ServerDevice[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let active = true;
    listDevices()
      .then((found) => {
        if (!active) return;
        setDevices(found);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("failed");
      });
    return () => {
      active = false;
    };
  }, []);

  const revoke = async (device: ServerDevice) => {
    setBusyId(device.id);
    setMessage("");
    setError("");
    try {
      await endDeviceSession(device.id);
      if (device.current) {
        // 이 기기의 갱신 토큰이 이미 끊겼다. 남은 화면을 그대로 두면 다음 요청에서
        // 알 수 없는 오류로 보인다. 바로 로그인 화면으로 보낸다.
        onSignedOut();
        return;
      }
      setDevices((current) => current.filter((item) => item.id !== device.id));
      setMessage(`${deviceName(device)}에서 로그아웃했어요.`);
    } catch (caught) {
      setError(
        caught instanceof DaymoApiError
          ? caught.message
          : "로그아웃하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      setBusyId("");
    }
  };

  const ask = (device: ServerDevice) => {
    const 물음 = revokePrompt(device);
    showAlert(물음.title, 물음.message, [
      { text: "취소", style: "cancel" },
      { text: 물음.confirm, style: "destructive", onPress: () => void revoke(device) },
    ]);
  };

  const 한도_안내 = deviceLimitNotice(devices.length);

  return (
    <View style={[s.memberEditor, { backgroundColor: theme.surfaceAlt, gap: 8, marginTop: 8 }]}>
      <Text style={[s.memberPermissionLabel, { color: theme.text }]}>로그인한 기기</Text>
      {state === "loading" && (
        <Text style={[s.memberRoleText, { color: theme.muted, marginTop: 0 }]}>
          기기 목록을 불러오고 있어요…
        </Text>
      )}
      {state === "failed" && (
        <Text style={[s.memberRoleText, { color: theme.muted, marginTop: 0 }]}>
          기기 목록을 불러오지 못했어요. 인터넷 연결을 확인하고 이 화면을 다시 열어 주세요.
        </Text>
      )}
      {state === "ready" &&
        devices.map((device) => (
          <View key={device.id} style={s.inviteRow}>
            <Text
              style={[
                s.memberRoleText,
                { color: device.current ? theme.text : theme.muted, marginTop: 0, flex: 1 },
              ]}
            >
              {deviceLine(device)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${deviceName(device)}에서 로그아웃`}
              disabled={busyId === device.id}
              onPress={() => ask(device)}
            >
              <Text style={s.accountDeleteText}>로그아웃</Text>
            </Pressable>
          </View>
        ))}
      {state === "ready" && 한도_안내 ? (
        <Text style={[s.memberRoleText, { color: theme.muted, marginTop: 0 }]}>{한도_안내}</Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={[s.memberRoleText, { color: theme.primary, marginTop: 0 }]}>
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text
          accessibilityLiveRegion="assertive"
          style={[s.authError, { color: theme.dark ? statusColor.danger.dark : statusColor.danger.light }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Choice({
  theme,
  label,
  selected,
  onPress,
  disabled,
}: {
  theme?: AppTheme;
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: Boolean(selected), disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      style={[
        disabled && s.choiceDisabled,
        s.choice,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        selected && s.choiceSelected,
        selected &&
          theme && {
            backgroundColor: theme.primarySoft,
            borderColor: theme.primary,
          },
      ]}
    >
      <Text
        style={[
          s.choiceText,
          theme && { color: theme.text },
          selected && s.choiceTextSelected,
          selected && theme && { color: theme.primary },
        ]}
      >
        {label}
      </Text>
      <View style={s.choiceMark}>
        {selected && <Glyph name="check" size={16} color={theme?.primary ?? "#3F4C8F"} weight={2.4} />}
      </View>
    </Pressable>
  );
}

/**
 * 모서리는 다섯 단계만 쓴다.
 *
 *   4    배지와 아주 작은 칩
 *   8    버튼, 선택 칩, 작은 판
 *   12   입력칸, 목록 행, 보통 카드
 *   16   큰 카드와 시트 안의 묶음
 *   999  알약과 원
 *
 * 예외는 높이의 절반이 곧 모양인 것들뿐이다. 2~3px 짜리 점과 얇은 줄, 진행
 * 막대가 거기 해당한다. 열네 가지가 돌면 같은 급의 것들이 미묘하게 달라 보이고,
 * 새 화면을 만들 때 무엇을 따라야 할지 알 수 없다.
 */
const s = StyleSheet.create({
  body: { flex: 1 },
  storageWarning: { paddingHorizontal: 16, paddingVertical: 8 },
  storageWarningText: { color: "#FFFFFF", fontSize: 12, lineHeight: 17, fontFamily: typo.body.family },
  page: { padding: 20, paddingBottom: 112 },
  tripArt: {
    width: 121,
    height: 136,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  artMoon: {
    position: "absolute",
    width: 107,
    height: 107,
    borderRadius: 999,
    backgroundColor: "rgba(255,249,244,.45)",
    right: -38,
    top: -28,
  },
  artDate: { position: "absolute", left: 11, bottom: 11 },
  artText: { fontSize: 14, fontFamily: typo.label.family },
  artUnit: { fontSize: 11, fontFamily: typo.label.family },
  artLine: { width: 25, height: 2, backgroundColor: "#623C38", marginTop: 4 },
  newTripText: { fontSize: 12, fontFamily: typo.label.family },
  arrow: { color: "#A0665B", fontSize: 24, fontWeight: "300" },
  setting: {
    minHeight: 높이.저장,
    borderBottomWidth: 1,
    borderColor: "#F0E2DA",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  settingName: { fontSize: 14, fontFamily: typo.title.family },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  settingValue: { fontSize: 14, fontFamily: typo.data.family },
  notebookHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  notebookHello: { fontSize: 14, marginTop: 2, fontFamily: typo.body.family },
  tinyDay: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    transform: [{ rotate: "1.5deg" }],
  },
  tinyDayText: { fontSize: 14, fontFamily: typo.data.family },
  paperTripStack: {
    position: "relative",
    marginBottom: 2,
  },
  paperTripBack: {
    position: "absolute",
    left: 7,
    right: 7,
    top: 4,
    bottom: -7,
    borderRadius: 4,
    opacity: 0.95,
  },
  paperTripBackLeft: {
    transform: [{ rotate: "-1.8deg" }],
    left: 4,
    right: 11,
    bottom: -5,
  },
  paperTripBackRight: {
    transform: [{ rotate: "1.35deg" }],
    left: 11,
    right: 3,
    bottom: -8,
  },
  paperTrip: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 0,
    shadowColor: "#473E2D",
    shadowOpacity: 0.18,
    shadowRadius: 11,
    shadowOffset: { width: 2, height: 8 },
    elevation: 5,
    transform: [{ rotate: "-.35deg" }],
    overflow: "visible",
  },
  paperTripMain: { borderRadius: 2 },
  paperTripTexture: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden", borderRadius: 4 },
  // 대표 사진이 있는 카드. 사진이 위쪽 모서리까지 닿아야 해서 종이의 안쪽 여백을
  // 걷어내고, 사진이 모서리 밖으로 삐져나가지 않게 잘라 낸다. 테이프가 없으니
  // 카드 밖으로 나가야 할 것도 없다.
  paperTripPhoto: {},
  // 종이에 붙인 사진. 살짝 기울여 손으로 붙인 것처럼 둔다.
  paperTripSnap: { marginTop: 10, marginBottom: 12, alignItems: "center" },
  paperTripSnapFrame: {
    width: "100%",
    padding: 7,
    borderRadius: 5,
    borderWidth: 1,
    shadowColor: "#17233D",
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 1, height: 5 },
    elevation: 3,
    transform: [{ rotate: "-1.1deg" }],
  },
  // 사진 자리. 카드를 깔면 이 안을 카드와 같은 배치로 나눈다(`homeCoverRows`).
  // 틀 색·스티커·날짜 도장은 그리지 않는다. 이만한 자리에 꾸밈까지 넣으면 지저분해지고,
  // 무엇이 찍힌 사진인지가 먼저 보여야 한다.
  paperTripSnapImage: { width: "100%", aspectRatio: 1.62, borderRadius: 2, overflow: "hidden", gap: 2 },
  paperTripSnapRow: { flex: 1, flexDirection: "row", gap: 2 },
  paperTripSnapCell: { flex: 1, minWidth: 0, height: "100%" },
  paperTripSnapTape: {
    position: "absolute",
    zIndex: 2,
    width: 64,
    height: 17,
    top: -5,
    opacity: 0.85,
    transform: [{ rotate: "-4.5deg" }],
  },
  // 카드 높이의 55~60%. 폭을 따라가되 넓은 화면에서 혼자 커지지 않게 위를 막는다.
  // 바탕은 어둡게 둔다. 사진이 깨져 안 그려져도 위에 얹은 흰 글자가 읽힌다.
  paperTripShot: { width: "100%", aspectRatio: 1.5, maxHeight: 260, backgroundColor: "#2B2621" },
  paperTripShotShade: { position: "absolute", left: 0, right: 0, bottom: 22, height: "44%" },
  paperTripShotFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 22 },
  // 오른쪽은 날짜 도장 자리만큼 비워 둔다. 이름이 길어도 도장을 밀지 않는다.
  paperTripShotHead: { position: "absolute", left: 18, right: 82, bottom: 34 },
  paperTripShotKicker: {
    fontSize: 12,
    fontFamily: typo.label.family,
    marginBottom: 4,
    color: "#EFE9DC",
    textShadowColor: "rgba(12,10,8,.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  paperTripShotTitle: {
    fontSize: 26,
    fontFamily: typo.title.family,
    letterSpacing: -0.5,
    color: "#FFFDF8",
    textShadowColor: "rgba(12,10,8,.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  // 사진 위에서는 테두리가 사진에 먹힌다. 밝은 종이 한 장을 깔고 그 위에 얹는다.
  paperTripShotStamp: {
    position: "absolute",
    top: 14,
    right: 14,
    backgroundColor: "rgba(255,253,248,.93)",
    borderColor: "rgba(40,48,70,.22)",
  },
  paperTripBody: { paddingHorizontal: 20, paddingTop: 14 },
  // 네 칸은 자기 음수 여백으로 카드 끝까지 닿는다. 그 기준이 될 여백만 준다.
  paperTripActionsBox: { paddingHorizontal: 20 },
  // 이름이 사진 위로 올라가 날짜가 첫 줄이 됐다. 위로 띄울 것이 없다.
  paperTripBodyDate: { marginTop: 0 },
  paperTripSoftLine: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(104, 139, 160, .10)" },
  paperTripMargin: { position: "absolute", top: 0, bottom: 0, left: 13, width: 1, backgroundColor: "rgba(196, 91, 81, .14)" },
  paperTripRoute: {
    position: "absolute",
    width: 112,
    height: 42,
    top: 21,
    right: 62,
    opacity: 0.3,
  },
  paperTape: {
    position: "absolute",
    width: 78,
    height: 20,
    // 종이의 위쪽 여백(24) 안에서 자리를 잡아, 카드 가장자리에 걸치려면 그만큼
    // 더 올려야 한다. -11 이던 때는 테이프가 종이 안에 동동 떠 있었다.
    top: -35,
    left: "50%",
    marginLeft: -39,
    opacity: 0.82,
    backgroundColor: "rgba(218, 198, 157, .68)",
    transform: [{ rotate: "2.6deg" }],
  },
  paperTripHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  paperTripCopy: { flex: 1, paddingRight: 12 },
  paperKicker: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 6 },
  paperTitle: { fontSize: 28, fontFamily: typo.title.family, letterSpacing: -0.5 },
  paperDate: { fontSize: 11, marginTop: 6 },
  paperTripStamp: {
    width: 52,
    height: 58,
    borderRadius: 2,
    borderWidth: 1.2,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "2deg" }],
  },
  paperTripStampMonth: { fontSize: 14, fontFamily: typo.data.family, letterSpacing: 1 },
  paperTripStampDay: { fontSize: 20, lineHeight: 23, fontFamily: typo.data.family },
  paperTripStampRule: { width: 22, height: 2, borderRadius: 2, marginTop: 2 },
  paperRule: { borderTopWidth: 1, borderStyle: "dashed", marginTop: 16, marginBottom: 12 },
  paperStayBoard: {
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingTop: 2,
    paddingBottom: 0,
    position: "relative",
    transform: [{ rotate: "0.2deg" }],
  },
  paperStay: { flexDirection: "row", alignItems: "center" },
  paperStayIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    transform: [{ rotate: "-2deg" }],
  },
  paperStayLabel: { fontSize: 12, fontFamily: typo.label.family },
  paperStayName: { fontSize: 14, fontFamily: typo.title.family, marginTop: 2 },
  paperStayTime: {
    minWidth: 58,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  paperStayTimeLabel: { fontSize: 12, fontFamily: typo.label.family },
  paperStayTimeValue: { fontSize: 14, fontFamily: typo.data.family, marginTop: 2 },
  paperTripActions: {
    flexDirection: "row",
    marginTop: 12,
    overflow: "hidden",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    // paperTrip의 paddingHorizontal과 크기가 같아야 카드 끝까지 닿는다.
    marginHorizontal: -20,
    borderTopWidth: 1,
    borderTopColor: "rgba(118, 107, 83, .22)",
  },
  paperTripAction: {
    flex: 1,
    minHeight: 높이.저장,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  paperTripActionBorder: { borderLeftWidth: 1, borderLeftColor: "rgba(118, 107, 83, .18)" },
  paperTripActionLabel: { fontSize: 14, fontFamily: typo.label.family, letterSpacing: 0 },
  paperTripActionMeta: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  paperTripActionUnderline: { position: "absolute", width: 34, height: 8, bottom: 11, borderRadius: 2, transform: [{ rotate: "-1deg" }] },
  scrapTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 8,
  },
  noteTitleSmall: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 4 },
  noteTitle: { fontSize: 20, fontFamily: typo.title.family, letterSpacing: -0.5 },
  memoPaper: {
    marginTop: 0,
    borderWidth: 1,
    borderRadius: 8,
    paddingLeft: 16,
    paddingRight: 4,
    overflow: "hidden",
    shadowColor: "#17233D",
    shadowOpacity: 0.035,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  memoPaperSpine: { position: "absolute", left: 10, top: 0, bottom: 0, width: 1 },
  memoRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingLeft: 8,
    paddingRight: 8,
  },
  memoRowLast: { borderBottomWidth: 0 },
  memoCheck: {
    width: 4,
    height: 24,
    borderRadius: 2,
    borderWidth: 0,
    marginRight: 12,
    transform: [{ rotate: "-2deg" }],
  },
  memoText: { fontSize: 14, fontFamily: typo.body.family },
  memoMeta: { fontSize: 11, marginTop: 4 },
  homeArchiveSection: { marginTop: 24 },
  homeArchiveHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  homeArchiveEyebrow: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 4 },
  homeArchiveTitle: { fontSize: 18, fontFamily: typo.title.family, letterSpacing: -0.5 },
  homeArchiveMore: { fontSize: 14, fontFamily: typo.label.family },
  homeArchiveRow: { flexDirection: "row", gap: 8 },
  homeArchiveCard: {
    flex: 1,
    minHeight: 132,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
    shadowColor: "#17233D",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  homeArchiveTape: {
    position: "absolute",
    top: -5,
    left: "35%",
    width: 44,
    height: 11,
    transform: [{ rotate: "-2deg" }],
  },
  homeArchiveDate: { fontSize: 11, fontFamily: typo.caption.family },
  homeArchivePlace: { fontSize: 16, fontFamily: typo.label.family, marginTop: 4 },
  homeArchiveNote: { fontSize: 14, lineHeight: 19, marginTop: 4 },
  homeArchiveAction: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: "auto", paddingTop: 8 },
  homeArchiveActionText: { fontSize: 14, fontFamily: typo.label.family },
  homeEmptyTrip: {
    minHeight: 250,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#17233D",
    shadowOpacity: 0.045,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  homeEmptyTripMark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    transform: [{ rotate: "-2deg" }],
  },
  homeEmptyTripTitle: { fontSize: 18, fontFamily: typo.title.family, textAlign: "center" },
  homeEmptyTripCopy: {
    maxWidth: 270,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 6,
  },
  homeEmptyTripAction: {
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 여백.가로,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  homeEmptyTripActionText: { fontSize: 14, fontFamily: typo.label.family },
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
  logo: {
    fontSize: 34,
    letterSpacing: -0.5,
    fontFamily: typo.hero.family,
  },
  pressed: { opacity: 0.68, transform: [{ scale: 0.985 }] },
  infoSheetBody: { paddingBottom: 8 },
  field: { marginBottom: 12 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  fieldLabelDot: { width: 5, height: 5, borderRadius: 2, marginRight: 6 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: typo.label.family,
    marginBottom: 0,
  },
  sheetCopy: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  choiceSelected: { borderColor: "#8B7CF6", backgroundColor: "#E9E5FF" },
  choiceDisabled: { opacity: 0.55 },
  choiceText: { fontSize: 14, fontFamily: typo.label.family },
  choiceTextSelected: { color: "#5546C8" },
  choiceMark: { width: 16, alignItems: "center", justifyContent: "center" },
  tripExplorerPage: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  tripExplorerMapPage: { flex: 1 },
  tripExplorerMapHeader: { paddingHorizontal: 20, paddingTop: 8 },
  viewChoiceText: { fontSize: 14, fontFamily: typo.label.family },
  viewChoiceTextActive: { color: "#FFFFFF" },
  mapOnly: { flex: 1, width: "100%", position: "relative", overflow: "hidden" },
  mapGestureLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  mapTray: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 132,
    paddingTop: 6,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    shadowColor: "#17233D",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  mapTrayHandle: {
    alignSelf: "center",
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D8DEDC",
    marginBottom: 8,
  },
  mapTrayHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  mapTrayTitle: { fontSize: 18, fontFamily: typo.title.family },
  mapTrayCount: { fontSize: 14, marginTop: 2 },
  // 지도 위에 얹히는 닫기라 지도를 가리지 않게 작게 둔다. hitSlop 으로 44 를 채운다.
  mapTrayClose: {
    width: 28,
    height: 28,
    borderRadius: 모서리.원,
    backgroundColor: "#F0F3F2",
    alignItems: "center",
    justifyContent: "center",
  },
  mapTrayCloseText: { fontSize: 20, lineHeight: 21 },
  mapTrayList: { paddingHorizontal: 12, gap: 8 },
  mapTrayCard: {
    width: 244,
    height: 60,
    borderRadius: 모서리.구역,
    padding: 8,
    backgroundColor: "#F7F8F6",
    borderWidth: 1,
    borderColor: "#E7EBE8",
    flexDirection: "row",
    alignItems: "center",
  },
  mapTrayMark: {
    width: 43,
    height: 43,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  mapTrayMarkText: { color: "#FFFFFF", fontSize: 12, fontFamily: typo.label.family },
  mapTrayCopy: { flex: 1, paddingHorizontal: 8 },
  mapTrayName: { fontSize: 14, fontFamily: typo.title.family },
  mapTrayDate: { fontSize: 11, marginTop: 4 },
  mapTrayArrow: { color: "#159D8D", fontSize: 20 },
  mapTrayEmpty: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  mapPin: {
    position: "absolute",
    transform: [{ translateX: -20 }, { translateY: -12 }],
    width: 40,
    height: 25,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#A9D9D1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  mapPinVisited: { backgroundColor: "#19B6A3", borderColor: "#FFFFFF" },
  mapPinActive: {
    backgroundColor: "#FF6B5F",
    borderColor: "#FFFFFF",
    transform: [{ translateX: -20 }, { translateY: -12 }, { scale: 1.08 }],
  },
  mapPinText: {
    color: "#438178",
    fontSize: 12,
    lineHeight: 15,
    fontFamily: typo.label.family,
    maxWidth: 34,
    textAlign: "center",
  },
  mapPinTextVisited: { color: "#FFFFFF" },
  pinCount: {
    position: "absolute",
    right: -5,
    top: -6,
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pinCountText: { color: "#17233D", fontSize: 14, fontFamily: typo.data.family },
  zoomControls: {
    position: "absolute",
    right: 5,
    bottom: 14,
    width: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2DF",
    shadowColor: "#17233D",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  zoomControlsRaised: { bottom: 146 },
  zoomButton: { height: 높이.버튼, alignItems: "center", justifyContent: "center" },
  zoomButtonDisabled: { opacity: 0.28 },
  zoomResetText: { fontSize: 12, fontFamily: typo.label.family },
  zoomDivider: { height: 1, backgroundColor: "#E6E9E7", marginHorizontal: 6 },
  dayRangeCell: {
    borderRadius: 0,
  },
  dayRangeStart: {
    borderTopLeftRadius: 11,
    borderBottomLeftRadius: 11,
  },
  dayRangeEnd: {
    borderTopRightRadius: 11,
    borderBottomRightRadius: 11,
  },
  dayCellSelected: { borderWidth: 2, borderColor: "#17233D" },
  dayNumberTrip: { fontFamily: typo.label.family },
  dayNumberSelected: { fontSize: 12 },
  dayTripDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
    marginTop: 2,
  },
  calendarResults: { marginTop: 16 },
  calendarResultHead: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarResultDate: {
    fontSize: 16,
    fontFamily: typo.caption.family,
    marginBottom: 4,
  },
  calendarResultClear: { fontSize: 12, fontFamily: typo.label.family },
  emptyDateTitle: { fontSize: 14, fontFamily: typo.title.family },
  emptyDateAction: {
    fontSize: 14,
    fontFamily: typo.label.family,
    marginTop: 8,
  },
  regionChoiceActive: { borderColor: "#19A996", backgroundColor: "#DDF7F1" },
  regionChoiceText: { color: "#7E8388", fontSize: 12, fontFamily: typo.label.family },
  regionChoiceTextActive: { color: "#087D70" },
  homeMetric: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 4,
  },
  homeMetricValue: { fontSize: 18, fontFamily: typo.data.family },
  homeMetricLabel: { color: "#AAB4C7", fontSize: 12, fontFamily: typo.label.family },
  homeQuick: {
    flex: 1,
    height: 72,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ECEAE5",
  },
  homeQuickEmbedded: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
  },
  homeQuickLarge: {
    height: 124,
    flex: 1.08,
    borderRadius: 16,
    flexDirection: "column",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    transform: [{ rotate: "-0.7deg" }],
  },
  homeQuickSmall: {
    height: 58,
    borderRadius: 16,
    justifyContent: "flex-start",
    paddingHorizontal: 12,
  },
  homeQuickRail: {
    height: 54,
    borderWidth: 0,
    borderRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  homeQuickIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  homeQuickIconEmbedded: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 0,
    marginRight: 6,
  },
  homeQuickIconLarge: {
    width: 38,
    height: 38,
    borderRadius: 999,
    marginRight: 0,
    marginBottom: 12,
  },
  homeQuickIconRail: {
    width: 25,
    height: 25,
    borderRadius: 12,
    marginBottom: 0,
    marginRight: 6,
  },
  homeQuickIconText: { fontSize: 16, fontFamily: typo.label.family },
  homeQuickLabel: { color: "#414A59", fontSize: 14, fontFamily: typo.label.family },
  homeQuickLabelEmbedded: { fontSize: 12, fontFamily: typo.label.family },
  homeQuickLabelLarge: { fontSize: 16, fontFamily: typo.label.family },
  homeQuickLabelRail: { fontSize: 12, fontFamily: typo.label.family },
  searchPage: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100 },
  searchClear: {
    width: 25,
    height: 25,
    borderRadius: 12,
    backgroundColor: "#EEF0EE",
    alignItems: "center",
    justifyContent: "center",
  },
  searchClearText: { fontSize: 18, lineHeight: 20 },
  searchCategoryText: { fontSize: 12, fontFamily: typo.label.family },
  searchCategoryTextActive: { color: "#FFFFFF" },
  searchResultHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  searchResultTitle: { fontSize: 16, fontFamily: typo.title.family },
  searchResultLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  searchResultName: { fontSize: 14, fontFamily: typo.title.family },
  searchResultType: { fontSize: 12, fontFamily: typo.label.family },
  searchResultDetail: { fontSize: 12, marginTop: 4 },
  searchResultTrip: { fontSize: 12, marginTop: 2 },
  searchResultArrow: { color: "#9AA1A8", fontSize: 20 },
  searchEmptyTitle: { fontSize: 18, fontFamily: typo.title.family },
  searchEmptyCopy: { fontSize: 14, marginTop: 6 },
  togetherHeadActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  // 오른쪽 아바타와 같은 크기·모서리로 맞춘다. 예전에는 테두리 있는 둥근 알약이라
  // 네모난 아바타와 따로 놀았다. 그림과 글자를 함께 두어 무엇인지 바로 보이게 한다.
  togetherSettingsButton: { height: 높이.버튼, borderRadius: 모서리.버튼, paddingLeft: 11, paddingRight: 13, flexDirection: "row", alignItems: "center", gap: 6 },
  togetherSettingsText: { fontSize: 13, fontFamily: typo.label.family },
  togetherHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  togetherAvatarText: { color: "#FFFFFF", fontSize: 12, fontFamily: typo.label.family },
  settingGroupLabel: {
    fontSize: 12,
    fontFamily: typo.label.family,
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
  },
  regionChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 6,
    paddingBottom: 16,
  },
  regionChoice: {
    borderWidth: 1,
    borderColor: "#DEDCD5",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  regionMoreChoice: { borderStyle: "dashed" },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  themeSwatches: { flexDirection: "row", gap: 4 },
  themeSwatch: { width: 22, height: 22, borderRadius: 8 },
  themeOptionName: {
    fontSize: 14,
    fontFamily: typo.title.family,
    marginTop: 12,
  },
  themeOptionCheck: {
    position: "absolute",
    right: 11,
    bottom: 10,
  },
  screenHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 6,
    marginBottom: 20,
  },
  overline: {
    fontSize: 12,
    fontFamily: typo.label.family,
    letterSpacing: 0,
    marginBottom: 2,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: typo.title.family,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  tripHeadActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  pasteNotice: {
    borderRadius: 모서리.버튼,
    minHeight: 높이.버튼,
    justifyContent: "center",
    paddingHorizontal: 여백.가로좁게,
    borderWidth: 1,
    transform: [{ rotate: "-0.5deg" }],
  },
  newTrip: {
    borderRadius: 모서리.버튼,
    minHeight: 높이.버튼,
    justifyContent: "center",
    paddingHorizontal: 14,
    transform: [{ rotate: "0.5deg" }],
    shadowColor: "#17233D",
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  viewSwitch: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    padding: 2,
    marginBottom: 16,
  },
  viewChoice: {
    flex: 1,
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    alignItems: "center",
    justifyContent: "center",
  },
  viewChoiceActive: {
    borderRadius: 12,
    borderWidth: 1,
  },
  tripFilters: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 4,
    marginBottom: 8,
  },
  filter: { minHeight: 높이.버튼, paddingHorizontal: 14, borderRadius: 모서리.원, justifyContent: "center" },
  filterText: { fontSize: 12, fontFamily: typo.label.family },
  tripRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 16,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    marginBottom: 8,
    overflow: "hidden",
  },
  tripRowAccent: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  tripThumb: { width: 45, height: 52, marginRight: 2 },
  tripArtSmall: { width: "100%", height: 52, borderRadius: 8, marginBottom: 0 },
  tripInfo: { flex: 1, paddingLeft: 8 },
  tripName: { fontSize: 16, fontFamily: typo.title.family },
  tripDate: { fontSize: 12, marginTop: 2 },
  tripNote: { fontSize: 13, marginTop: 2 },
  tripRowCompact: { minHeight: 72 },
  tripRowArrow: {
    width: 25,
    height: 25,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tripRowArrowText: { fontSize: 18, lineHeight: 19, fontFamily: typo.label.family },
  noTrips: {
    minHeight: 190,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  noTripsTitle: { fontSize: 18, fontFamily: typo.title.family, marginTop: 8 },
  noTripsText: { fontSize: 12, textAlign: "center", marginTop: 4 },
  emptyInlineAction: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  emptyInlineActionText: { fontSize: 14, fontFamily: typo.label.family },
  calendarCard: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 8,
    borderWidth: 1,
    position: "relative",
    marginTop: 6,
    shadowColor: "#3F4654",
    shadowOpacity: 0.09,
    shadowRadius: 8,
    shadowOffset: { width: 1, height: 5 },
  },
  calendarPageBack: {
    position: "absolute",
    left: 5,
    right: 5,
    bottom: -6,
    height: 12,
    borderRadius: 4,
    backgroundColor: "#DDE5E3",
    opacity: 0.8,
    zIndex: -1,
    transform: [{ rotate: "0.35deg" }],
  },
  // 달 이름 양옆의 화살표. 달 이름 줄 높이에 맞춰 작게 두고 hitSlop 으로 44 를 채운다.
  monthArrow: {
    width: 27,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  calendarTitleBlock: { alignItems: "flex-start" },
  calendarControls: { flexDirection: "row", alignItems: "center", gap: 2 },
  calendarTodayButton: {
    height: 27,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8D4CA",
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  calendarTodayText: { fontSize: 12, fontFamily: typo.label.family },
  monthArrowText: { color: "#384052", fontSize: 24, fontWeight: "500", lineHeight: 26 },
  calendarMonth: { fontSize: 20, fontFamily: typo.data.family, textAlign: "left", letterSpacing: 0 },
  calendarSub: { fontSize: 11, textAlign: "left", marginTop: 2 },
  calendarLegend: {
    minHeight: 25,
    borderTopWidth: 0,
    marginTop: 0,
    paddingTop: 0,
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  calendarLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  calendarLegendLine: { width: 12, height: 3, borderRadius: 2 },
  calendarLegendText: { fontSize: 12, fontFamily: typo.label.family },
  weekRow: { flexDirection: "row", marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DFE1E2", paddingBottom: 4 },
  weekName: { width: "14.285%", textAlign: "center", color: "#85888D", fontSize: 14, fontFamily: typo.title.family },
  weekNameSunday: { color: "#C66D68" },
  weekNameSaturday: { color: "#617EA4" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 2 },
  // 달력 한 칸. 일곱 칸이 한 줄이라 너비가 가로의 1/7 로 정해져 있고, 높이를
  // 44 로 올리면 여섯 줄짜리 달은 화면을 넘긴다. hitSlop 대신 옆칸과 맞닿아 있다.
  dayCell: {
    width: "14.285%",
    height: 37,
    borderRadius: 모서리.버튼,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
  dayNumber: { color: "#424957", fontSize: 14, fontFamily: typo.data.family },
  dayNumberBadge: {
    width: 21,
    height: 21,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumberSunday: { color: "#B96863" },
  dayNumberSaturday: { color: "#5F789A" },
  dayNumberToday: {
    backgroundColor: "#FF6A63",
  },
  dayNumberTodayText: { color: "#FFFFFF" },
  emptyDate: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 16,
    alignItems: "center",
  },
  searchBoxNew: {
    height: 높이.저장,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 16,
    shadowColor: "#17233D",
    shadowOpacity: 0.055,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  searchIntro: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  searchCategory: {
    height: 높이.버튼,
    minWidth: 61,
    borderRadius: 모서리.원,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  searchCategories: {
    width: "100%",
    marginTop: 4,
    marginBottom: 12,
  },
  searchCategoriesContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  searchCategoryActive: {
    shadowColor: "#17233D",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  searchCategoryCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  searchCategoryCountText: { fontSize: 14, fontFamily: typo.data.family },
  searchGuideHead: {
    height: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  searchGuideTitle: {
    fontSize: 14,
    fontFamily: typo.title.family,
    marginRight: 12,
  },
  searchSuggestions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 16,
    paddingBottom: 4,
  },
  searchSuggestion: {
    minHeight: 높이.칩,
    borderRadius: 모서리.원,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  searchSuggestionText: { fontSize: 12, fontFamily: typo.label.family },
  searchSuggestionRemove: { fontSize: 16, lineHeight: 19, fontFamily: typo.label.family },
  searchRecentClear: { fontSize: 12, fontFamily: typo.label.family },
  searchRecentEmpty: { fontSize: 12, paddingVertical: 6 },
  searchResultsSheet: {
    gap: 8,
  },
  searchResultCard: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 8,
    padding: 0,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#17233D",
    shadowOpacity: 0.035,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
  searchMore: { minHeight: 높이.입력, borderTopWidth: 1, alignItems: "center", justifyContent: "center" },
  searchMoreText: { fontSize: 14, fontFamily: typo.label.family },
  searchResultCardLast: {},
  searchResultColorTab: {
    position: "absolute",
    left: 15,
    top: 0,
    width: 34,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    opacity: 0.9,
  },
  searchResultMain: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  searchResultTypeBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  searchResultMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  searchResultTag: { fontSize: 12, fontFamily: typo.label.family },
  searchResultActions: {
    height: 39,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  searchResultAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchResultActionText: { fontSize: 14, fontFamily: typo.label.family },
  searchEmpty: {
    minHeight: 190,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  searchInputNew: { flex: 1, fontSize: 14, marginLeft: 8 },
  searchResultCopy: { flex: 1, paddingLeft: 4, paddingRight: 8 },
  historyHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 8,
  },
  historyEyebrow: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.5 },
  historyTitle: { fontSize: 18, fontFamily: typo.title.family, marginTop: 4 },
  historyPeriod: { fontSize: 12, fontFamily: typo.label.family },
  historyUnit: { fontSize: 12, fontFamily: typo.label.family },
  togetherQuickRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  togetherQuick: {
    flex: 1,
    minWidth: 0,
    minHeight: 높이.저장,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  togetherQuickIcon: {
    width: 27,
    height: 27,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  togetherQuickIconText: { fontSize: 12, fontFamily: typo.label.family },
  togetherQuickLabel: { maxWidth: "100%", fontSize: 12, fontFamily: typo.label.family },
  memberRoleText: { fontSize: 12, fontFamily: typo.label.family, marginTop: -7 },
  memberPermissionLabel: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 8 },
  profileSheetPreview: {
    minHeight: 86,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  profileSheetAvatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  profileSheetAvatarSecond: { marginLeft: -10 },
  profileSheetName: { flex: 1, fontSize: 14, fontFamily: typo.title.family, marginLeft: 12 },
  settingGroup: {
    borderRadius: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  themeOption: {
    width: "48%",
    minHeight: 86,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
  },
  fieldInput: {
    height: 높이.입력,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 여백.가로,
    fontSize: 14,
    borderWidth: 1,
  },
  choice: {
    minHeight: 높이.저장,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    paddingHorizontal: 여백.가로,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  bottom: {
    height: 78,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 6,
  },
  navItem: { width: 64, alignItems: "center" },
  navIconWrap: {
    width: 40,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  navText: { fontSize: 12, fontFamily: typo.label.family },
  authPage: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 28,
  },
  authBrand: { alignItems: "center", marginBottom: 24 },
  authAppIconFrame: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: "#17233D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  authAppIcon: { width: "100%", height: "100%" },
  authLogo: { fontSize: 28, fontFamily: typo.hero.family, letterSpacing: -0.5 },
  authTagline: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 6 },
  authCard: { borderRadius: 16, borderWidth: 1, padding: 20 },
  authTitle: { fontSize: 20, fontFamily: typo.title.family, letterSpacing: -0.5 },
  authDescription: { fontSize: 14, lineHeight: 22, marginTop: 6, marginBottom: 20 },
  // 버튼 모양은 SocialLoginButton 이 제공자 가이드대로 정한다. 여기서는 세로로 쌓기만 한다.
  oauthGrid: { gap: 8 },
  authDivider: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  authDividerLine: { flex: 1, height: 1 },
  authDividerText: { fontSize: 12, fontFamily: typo.label.family, marginHorizontal: 8 },
  authError: { fontSize: 13, fontFamily: typo.label.family, marginTop: 2 },
  authSubmit: {
    height: 높이.저장,
    borderRadius: 모서리.버튼,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  authSubmitDisabled: { opacity: 0.38 },
  authSubmitText: { fontSize: 14, fontFamily: typo.label.family },
  authSwitch: { alignItems: "center", paddingTop: 16, paddingBottom: 2 },
  authSwitchText: { fontSize: 12, fontFamily: typo.label.family },
  authConsentList: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 6, marginBottom: 12 },
  authConsentRow: { minHeight: 높이.버튼, flexDirection: "row", alignItems: "center" },
  authConsentAll: { borderBottomWidth: 1, marginBottom: 4 },
  authConsentAllText: { flex: 1, fontSize: 12, fontFamily: typo.label.family },
  authConsentCheck: { width: 22, height: 22, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 8 },
  authConsentTick: { color: "#FFFFFF", fontSize: 12, fontFamily: typo.label.family },
  authConsentText: { flex: 1, fontSize: 12, fontFamily: typo.label.family },
  authPrivacy: { fontSize: 12, lineHeight: 15, textAlign: "center", marginTop: 16 },
  accountPreview: {
    minHeight: 82,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  accountAvatar: {
    width: 43,
    height: 43,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  accountAvatarText: { color: "#FFFFFF", fontSize: 18, fontFamily: typo.label.family },
  accountPreviewCopy: { flex: 1, marginLeft: 12 },
  accountPreviewName: { fontSize: 14, fontFamily: typo.title.family },
  accountPreviewEmail: { fontSize: 12, fontFamily: typo.label.family, marginTop: 4 },
  accountLogout: {
    height: 높이.버튼,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  accountLogoutText: { color: "#DF5148", fontSize: 12, fontFamily: typo.label.family },
  accountDelete: { minHeight: 높이.버튼, alignItems: "center", justifyContent: "center", marginTop: 4 },
  accountDeleteText: { color: "#A36E67", fontSize: 12, fontFamily: typo.label.family, textDecorationLine: "underline" },
  groupChoice: {
    minHeight: 66,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  groupChoiceAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  groupChoiceAvatarText: { fontSize: 14, fontFamily: typo.label.family },
  groupChoiceCopy: { flex: 1, marginLeft: 12 },
  groupChoiceName: { fontSize: 14, fontFamily: typo.title.family },
  groupChoiceMeta: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 4 },
  groupChoiceCheck: { width: 18, alignItems: "center", justifyContent: "center" },
  noticeCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8 },
  noticeName: { fontSize: typo.title.size, lineHeight: typo.title.line, fontFamily: typo.title.family },
  noticeHolder: { fontSize: typo.body.size, lineHeight: typo.body.line, fontFamily: typo.body.family, marginTop: 8 },
  noticeBody: { fontSize: typo.body.size, lineHeight: typo.body.line, fontFamily: typo.body.family, marginTop: 6 },
  noticeLink: {
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    marginTop: 12,
    paddingHorizontal: 여백.가로좁게,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noticeLinkText: { fontSize: typo.label.size, lineHeight: typo.label.line, fontFamily: typo.label.family },
  togetherAccountButton: { width: 높이.버튼, height: 높이.버튼, borderRadius: 모서리.버튼, alignItems: "center", justifyContent: "center" },
  togetherAccountInitial: { fontSize: 14, fontFamily: typo.label.family },
  workspaceCard: {
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  workspaceMark: { width: 43, height: 43, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  workspaceMarkInitial: { fontSize: 18, fontFamily: typo.title.family },
  workspaceCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  workspaceLabel: { fontSize: 12, fontFamily: typo.label.family },
  workspaceName: { fontSize: 14, fontFamily: typo.title.family, marginTop: 2 },
  workspaceMeta: { fontSize: 12, fontFamily: typo.caption.family, marginTop: 4 },
  workspaceSwitchBadge: { height: 29, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  workspaceSwitchBadgeText: { fontSize: 12, fontFamily: typo.label.family },
  groupTabs: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  groupTab: {
    minWidth: 58,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  groupTabText: { fontSize: 12, fontFamily: typo.label.family },
  groupTabMore: {
    width: 34,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  groupTabMoreDots: { flexDirection: "row", alignItems: "center", gap: 3 },
  groupTabMoreText: { fontSize: 14, fontFamily: typo.label.family, letterSpacing: 1 },
  memberSectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16, marginBottom: 8 },
  memberSectionTitle: { fontSize: 18, fontFamily: typo.title.family, marginTop: 2 },
  memberManageHit: { minHeight: 높이.버튼, justifyContent: "center", paddingLeft: 여백.세로좁게 },
  memberManageText: { fontSize: 12, fontFamily: typo.label.family, paddingVertical: 4 },
  memberStrip: { minHeight: 84, borderRadius: 12, borderWidth: 1 },
  memberStripContent: { minWidth: "100%", paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  memberStripItem: { width: 54, alignItems: "center" },
  memberStripAvatar: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  memberStripInitial: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.label.family },
  memberStripName: { width: "100%", textAlign: "center", fontSize: 14, fontFamily: typo.title.family, marginTop: 6 },
  memberStripRole: {
    width: "100%",
    textAlign: "center",
    fontSize: 12,
    fontFamily: typo.label.family,
    marginTop: 2,
  },
  memberInviteAvatar: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  managementLabel: { fontSize: 12, fontFamily: typo.label.family, marginTop: 16, marginBottom: -2 },
  historySummary: { minHeight: 73, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center" },
  historySummaryItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  historySummaryValue: { fontSize: 16, fontFamily: typo.data.family },
  historySummaryLabel: { fontSize: 12, fontFamily: typo.label.family, marginTop: 4 },
  historyLatest: {
    minHeight: 높이.버튼,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 6,
  },
  historyLatestDot: { width: 7, height: 7, borderRadius: 4 },
  historyLatestLabel: { fontSize: 12, fontFamily: typo.label.family },
  historyLatestName: { flex: 1, fontSize: 14, fontFamily: typo.title.family },
  historyLatestDate: { fontSize: 11, fontFamily: typo.caption.family },
  memberManagerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  memberManagerTitle: { fontSize: 18, fontFamily: typo.title.family },
  memberManagerCopy: { fontSize: 14, fontFamily: typo.body.family, marginTop: 4 },
  memberManagerInvite: { height: 34, borderRadius: 8, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  memberManagerInviteText: { fontSize: 12, fontFamily: typo.label.family },
  memberManagerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 여백.세로좁게, marginBottom: 여백.세로 },
  // 한 줄에 둘. `48.8%` 와 `gap: 8` 을 함께 쓰면 둘을 더한 값이 칸보다 넓어져
  // 좁은 화면에서 한 장씩 내려갔다. 여백을 뺀 폭으로 잡는다.
  memberManagerCard: { flexBasis: "47%", flexGrow: 1, maxWidth: "48%", minHeight: 61, borderRadius: 모서리.버튼, borderWidth: 1, paddingHorizontal: 여백.가로좁게, flexDirection: "row", alignItems: "center" },
  memberManagerAvatar: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  memberManagerCardCopy: { flex: 1, minWidth: 0, marginLeft: 8 },
  memberManagerName: { fontSize: 14, fontFamily: typo.title.family },
  memberManagerRole: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  appVersion: { fontSize: 12, textAlign: "center", marginTop: 18, marginBottom: 8, fontFamily: typo.caption.family },
  helpItem: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  helpQuestion: { fontSize: 14, fontFamily: typo.title.family },
  helpAnswer: { fontSize: 13, lineHeight: 20, marginTop: 4, fontFamily: typo.body.family },
  // 구역 하나. 아래 여백이 없어 「선택한 멤버」·「나가기」·「초대」가 서로 맞붙어
  // 어디까지가 한 덩이인지 읽히지 않았다(기기에서 확인).
  memberEditor: { borderRadius: 모서리.구역, padding: 여백.가로좁게, marginBottom: 여백.세로 },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 },
  memberEditorEyebrow: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 8 },
});
