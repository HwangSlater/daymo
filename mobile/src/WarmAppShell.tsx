import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Alert,
  Modal,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInputProps,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSheetDrag } from "./sheetDrag";
import { type Expense, money } from "./tripExpenses";
import { PaperPeel } from "./PaperPeel";
import { TripRegionPicker } from "./TripRegionPicker";
import { tripRegions } from "./tripRegions";
import { PEEL_CANCEL_MS, PEEL_FINISH_MS, peelDistance, peelDragProgress, shouldCompletePeel } from "./tripPeelMotion";
import { ParticipantPicker } from "./ParticipantPicker";
import { formatTripRange, TripDateRangePicker } from "./TripDateRangePicker";
import { sampleTripPlanning, type TripDetailDestination, type TripPlanningData, WarmTripDetail } from "./WarmTripDetail";
import { koreaAdminPath } from "./koreaAdminPath";
import { koreaLandPath, koreaOutlinePath } from "./koreaOutlinePath";
import { isOnLand, nearestRegion } from "./koreaHitTest";
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
import { Dot, Glyph } from "./Glyph";
import { typo } from "./theme/typography";
import { domain, kindColor, naverInk, onAccent, paperCard, status as statusColor, tripTone } from "./theme/colors";

type MainView = "홈" | "여행" | "찾기" | "우리";
type DaymoUser = { name: string; email: string };

WebBrowser.maybeCompleteAuthSession();

type Trip = {
  name: string;
  date: string;
  note: string;
  /** tripTone 팔레트의 자리. 색값이 아니라 자리를 저장한다. */
  tone: number;
  mark: string;
  region: string;
  start: string;
  end: string;
  planning?: TripPlanningData;
  /**
   * 앱이 처음부터 들고 있는 예시 여행.
   *
   * 예시 여행만 일정·장소·준비물이 채워진 채로 열린다. 사용자가 만든 여행은
   * 빈 채로 시작한다. 내가 만들지 않은 내용이 들어 있으면 그건 내 여행이 아니다.
   */
  sample?: boolean;
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
    const restored = { ...initialTripsByGroup };
    (["ours", "friends", "family"] as GroupId[]).forEach((groupId) => {
      const groupTrips = saved.tripsByGroup?.[groupId];
      if (Array.isArray(groupTrips)) {
        restored[groupId] = groupTrips.filter(isStoredTrip).map((trip) =>
          trip.planning && !isStoredPlanning(trip.planning)
            ? { ...trip, planning: undefined }
            : trip,
        );
      }
    });
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

// 저장된 설정은 App이 실행 화면 뒤에서 미리 읽어 넘겨준다. 여기서 읽으면 기본값으로
// 한 번 그린 뒤 바뀌어 화면이 튄다.
// 여행 공간 목록. 마지막에 연 공간을 기기에서 읽어 처음 화면을 그릴 때도 필요해서
// 컴포넌트 밖에 둔다. 서버가 붙으면 이 자리를 받아온 목록이 대신한다.
const spaceGroups: { id: GroupId; name: string; members: string[]; relationship: "연인" | "친구" }[] = [
  { id: "ours", name: "우리의 여행 공간", members: ["다온"], relationship: "연인" },
  { id: "friends", name: "주말 여행 메이트", members: ["여울", "가람", "새봄"], relationship: "친구" },
  { id: "family", name: "가족 나들이", members: ["보름", "마루"], relationship: "친구" },
];

export function WarmAppShell({
  settings = defaultDeviceSettings,
}: {
  settings?: DeviceSettings;
}) {
  const systemScheme = useColorScheme();
  const [view, setView] = useState<MainView>("홈");
  const [isTripOpen, setTripOpen] = useState(false);
  const [openTripCreator, setOpenTripCreator] = useState(false);
  const [tripDestination, setTripDestination] =
    useState<TripDetailDestination>("overview");
  const [done, setDone] = useState<string[]>(["charger", "toiletries"]);
  const [activeGroupId, setActiveGroupId] = useState<GroupId>(
    settings.activeGroupId,
  );
  const [tripsByGroup, setTripsByGroup] = useState(initialTripsByGroup);
  const [tripStorageReady, setTripStorageReady] = useState(false);
  // 저장이 막히면 조용히 넘어가지 않는다. 사용자는 적은 게 남았다고 믿는데
  // 앱을 다시 열면 사라진다. 가장 흔한 원인은 용량 초과다.
  const [tripStorageFailed, setTripStorageFailed] = useState(false);
  const tripItems = tripsByGroup[activeGroupId];
  const setTripItems: React.Dispatch<React.SetStateAction<Trip[]>> = (update) =>
    setTripsByGroup((current) => ({
      ...current,
      [activeGroupId]:
        typeof update === "function" ? update(current[activeGroupId]) : update,
    }));
  const [selectedTrip, setSelectedTrip] = useState<Trip>(trips[0]);
  const [themeId, setThemeId] = useState<ThemeId>(settings.themeId);
  // 함께한 시작일. 우리 탭의 공간 프로필에서 고치고 홈 머리글이 같은 값을 읽는다.
  const [since, setSince] = useState(settings.since);
  const [appearance, setAppearance] = useState<AppearanceMode>(
    settings.appearance,
  );
  useSaveSettings({ themeId, appearance, activeGroupId, since });
  const [user, setUser] = useState<DaymoUser | null>({
    name: "하늘",
    email: "sky@daymo.app",
  });
  // 이 공간에 속한 사람들. 나를 앞에 두고 초대한 멤버가 뒤따른다. 여행 상세는
  // 이 목록에서 이번 여행 참가자를 고른다.
  // 렌더마다 새 배열을 만들면 이 목록을 의존성으로 쓰는 곳이 매번 다시 돈다.
  const activeSpaceMembers = useMemo(() => [
    user?.name ?? "나",
    ...(spaceGroups.find((group) => group.id === activeGroupId)?.members ?? []),
  ], [activeGroupId, user?.name]);
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
    AsyncStorage.setItem(tripStorageKey, JSON.stringify({ tripsByGroup, done }))
      .then(() => setTripStorageFailed(false))
      .catch(() => setTripStorageFailed(true));
  }, [done, tripStorageReady, tripsByGroup]);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const homeTrip = [...tripItems]
    .filter((trip) => trip.end >= todayKey)
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
  if (!user) {
    return <AuthScreen theme={theme} onAuth={setUser} />;
  }
  if (isTripOpen)
    return (
      <WarmTripDetail
        key={tripDestination}
        done={done}
        initialDestination={tripDestination}
        tripName={selectedTrip.name}
        tripDate={selectedTrip.date}
        tripStart={selectedTrip.start}
        tripEnd={selectedTrip.end}
        tripRegion={selectedTrip.region}
        tripNote={selectedTrip.note}
        initialPlanning={selectedTrip.planning}
        spaceMembers={activeSpaceMembers}
        appTheme={theme}
        onUpdateTrip={(changes) => {
          const updated = { ...selectedTrip, ...changes, mark: changes.start.slice(5, 7) };
          setTripItems((current) => current.map((trip) => trip === selectedTrip ? updated : trip));
          setSelectedTrip(updated);
        }}
        onSavePlanning={(planning) => {
          const updated = { ...selectedTrip, planning };
          setTripItems((current) => current.map((trip) => trip === selectedTrip ? updated : trip));
          setSelectedTrip(updated);
        }}
        onClose={() => setTripOpen(false)}
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
            spaceName={spaceGroups.find((group) => group.id === activeGroupId)?.name ?? "우리의 여행 수첩"}
            relationship={activeGroupId === "ours" ? "연인" : "친구"}
            since={since}
          />
        )}
        {view === "여행" && (
          <TripsExplorer
            open={(trip) => openTrip("overview", trip)}
            theme={theme}
            items={tripItems}
            setItems={setTripItems}
            spaceMembers={activeSpaceMembers}
            openCreatorOnMount={openTripCreator}
            onCreatorOpened={() => setOpenTripCreator(false)}
          />
        )}
        {view === "찾기" && <Search open={openTrip} theme={theme} trips={tripItems} />}
        {view === "우리" && (
          <Together
            theme={theme}
            themeId={themeId}
            setThemeId={setThemeId}
            appearance={appearance}
            setAppearance={setAppearance}
            trips={tripItems}
            activeGroupId={activeGroupId}
            since={since}
            setSince={setSince}
            setActiveGroupId={setActiveGroupId}
            user={user}
            setUser={setUser}
            openTrip={(trip) => openTrip("overview", trip)}
            onLogout={() => setUser(null)}
          />
        )}
      </View>
      <BottomBar active={view} setActive={setView} theme={theme} />
    </SafeAreaView>
  );
}

function AuthScreen({
  theme,
  onAuth,
}: {
  theme: AppTheme;
  onAuth: (user: DaymoUser) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [marketingAgreed, setMarketingAgreed] = useState(false);
  const oauthBaseUrl = process.env.EXPO_PUBLIC_DAYMO_AUTH_URL?.replace(/\/$/, "");
  const authFormValid =
    email.trim().includes("@") &&
    password.length >= 6 &&
    (mode === "login" || (Boolean(name.trim()) && password === confirm && termsAgreed && privacyAgreed));
  const submit = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setError("이메일 주소를 확인해 주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상 입력해 주세요.");
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
    if (mode === "signup" && (!termsAgreed || !privacyAgreed)) {
      setError("필수 약관에 동의해 주세요.");
      return;
    }
    setError("");
    onAuth({
      name: mode === "signup" ? name.trim() : normalizedEmail.split("@")[0],
      email: normalizedEmail,
    });
  };
  const switchMode = () => {
    setMode((current) => (current === "login" ? "signup" : "login"));
    setError("");
    setPassword("");
    setConfirm("");
  };
  const startOAuth = async (provider: "google" | "apple" | "kakao" | "naver") => {
    if (!oauthBaseUrl) {
      setError("OAuth 서버 주소가 필요해요. EXPO_PUBLIC_DAYMO_AUTH_URL을 설정해 주세요.");
      return;
    }
    setOauthLoading(provider);
    setError("");
    const redirectUri = AuthSession.makeRedirectUri({ scheme: "daymo", path: "oauth" });
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `${oauthBaseUrl}/oauth/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}`,
        redirectUri,
      );
      if (result.type !== "success") return;
      const callback = new URL(result.url);
      const email = callback.searchParams.get("email");
      const name = callback.searchParams.get("name");
      const authError = callback.searchParams.get("error");
      if (authError || !email) {
        setError(authError || "로그인 정보를 확인하지 못했어요.");
        return;
      }
      onAuth({ name: name || email.split("@")[0], email });
    } catch {
      setError("소셜 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
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
        <View style={[s.authCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[s.authTitle, { color: theme.text }]}>{mode === "login" ? "다시 만나서 반가워요" : "우리의 여행을 시작해요"}</Text>
          <Text style={[s.authDescription, { color: theme.muted }]}>{mode === "login" ? "Daymo에 로그인해 여행을 이어가세요." : "계정을 만들고 여행 공간에 멤버를 초대하세요."}</Text>
          {mode === "signup" && (
            <Field theme={theme} label="이름 또는 별명 · 필수" value={name} onChangeText={setName} placeholder="예: 하늘" autoCapitalize="none" />
          )}
          <Field theme={theme} label="이메일 · 필수" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field theme={theme} label="비밀번호 · 필수" value={password} onChangeText={setPassword} placeholder="6자 이상 입력" secureTextEntry />
          {mode === "signup" && (
            <Field theme={theme} label="비밀번호 확인 · 필수" value={confirm} onChangeText={setConfirm} placeholder="한 번 더 입력" secureTextEntry />
          )}
          {mode === "signup" && (
            <View style={[s.authConsentList, { borderColor: theme.border }]}>
              <Pressable
                onPress={() => {
                  const next = !(termsAgreed && privacyAgreed && marketingAgreed);
                  setTermsAgreed(next);
                  setPrivacyAgreed(next);
                  setMarketingAgreed(next);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAgreed && privacyAgreed && marketingAgreed }}
                style={[s.authConsentRow, s.authConsentAll, { borderBottomColor: theme.border }]}
              >
                <View style={[s.authConsentCheck, { borderColor: termsAgreed && privacyAgreed && marketingAgreed ? theme.primary : theme.border, backgroundColor: termsAgreed && privacyAgreed && marketingAgreed ? theme.primary : theme.surface }]}>
                  {termsAgreed && privacyAgreed && marketingAgreed && <Glyph name="check" size={12} color="#FFFFFF" weight={2.6} />}
                </View>
                <Text style={[s.authConsentAllText, { color: theme.text }]}>모두 동의</Text>
              </Pressable>
              {[
                { label: "이용약관 동의 · 필수", checked: termsAgreed, toggle: setTermsAgreed },
                { label: "개인정보 수집·이용 동의 · 필수", checked: privacyAgreed, toggle: setPrivacyAgreed },
                { label: "여행 소식과 혜택 알림 · 선택", checked: marketingAgreed, toggle: setMarketingAgreed },
              ].map((consent) => (
                <Pressable
                  key={consent.label}
                  onPress={() => consent.toggle(!consent.checked)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consent.checked }}
                  style={s.authConsentRow}
                >
                  <View style={[s.authConsentCheck, { borderColor: consent.checked ? theme.primary : theme.border, backgroundColor: consent.checked ? theme.primary : theme.surface }]}>
                    {consent.checked && <Glyph name="check" size={12} color="#FFFFFF" weight={2.6} />}
                  </View>
                  <Text style={[s.authConsentText, { color: theme.text }]}>{consent.label}</Text>
                </Pressable>
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
          <Pressable
            onPress={submit}
            disabled={!authFormValid}
            accessibilityRole="button"
            accessibilityState={{ disabled: !authFormValid }}
            style={[s.authSubmit, { backgroundColor: theme.primary }, !authFormValid && s.authSubmitDisabled]}
          >
            <Text style={[s.authSubmitText, { color: onAccent(theme.dark) }]}>{mode === "login" ? "로그인" : "회원가입"}</Text>
          </Pressable>
          <View style={s.authDivider}>
            <View style={[s.authDividerLine, { backgroundColor: theme.border }]} />
            <Text style={[s.authDividerText, { color: theme.muted }]}>또는 소셜 계정으로</Text>
            <View style={[s.authDividerLine, { backgroundColor: theme.border }]} />
          </View>
          <View style={s.oauthGrid}>
            {/*
              심볼 자리는 비워 두었다. 예전에는 동그라미 안에 K·N·G·A 한 글자를
              직접 그려 넣었는데, 그건 각 사의 상표를 흉내 낸 것이다. 특히
              구글은 "직접 아이콘을 만들거나 로고의 크기·색을 바꾸는 것"을
              명시적으로 금지한다. 카카오는 반대로 심볼 없는 버튼을 금지하므로,
              출시 전에 각 사 콘솔에서 공식 버튼 에셋을 받아 넣어야 한다.
              docs/development/08-privacy-and-release-compliance.md 12장 참고.

              색과 문구는 각 사가 문서로 정해 둔 값을 그대로 쓴다.
            */}
            {[
              { id: "kakao", label: "카카오 로그인", color: "#FEE500", text: "#191919", border: "#FEE500" },
              { id: "naver", label: "네이버 로그인", color: "#03C75A", text: "#FFFFFF", border: "#03C75A" },
              theme.dark
                ? { id: "google", label: "Google 계정으로 로그인", color: "#131314", text: "#E3E3E3", border: "#8E918F" }
                : { id: "google", label: "Google 계정으로 로그인", color: "#FFFFFF", text: "#1F1F1F", border: "#747775" },
              { id: "apple", label: "Apple로 로그인", color: theme.dark ? "#FFFFFF" : "#000000", text: theme.dark ? "#000000" : "#FFFFFF", border: theme.dark ? "#FFFFFF" : "#000000" },
            ].map((provider) => (
              <Pressable
                key={provider.id}
                disabled={oauthLoading !== null}
                onPress={() => startOAuth(provider.id as "google" | "apple" | "kakao" | "naver")}
                accessibilityRole="button"
                accessibilityLabel={provider.label}
                accessibilityState={{ disabled: oauthLoading !== null }}
                style={[s.oauthButton, { backgroundColor: provider.color, borderColor: provider.border }]}
              >
                <Text numberOfLines={1} style={[s.oauthLabel, { color: provider.text }]}>
                  {oauthLoading === provider.id ? "연결 중" : provider.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={switchMode}
            accessibilityRole="button"
            accessibilityLabel={mode === "login" ? "회원가입으로 바꾸기" : "로그인으로 바꾸기"}
            style={s.authSwitch}
          >
            <Text style={[s.authSwitchText, { color: theme.muted }]}>{mode === "login" ? "처음이신가요? " : "이미 계정이 있나요? "}<Text style={{ color: theme.primary, fontFamily: typo.title.family }}>{mode === "login" ? "회원가입" : "로그인"}</Text></Text>
          </Pressable>
        </View>
        <Text style={[s.authPrivacy, { color: theme.muted }]}>Daymo 이용약관 · 개인정보 처리방침</Text>
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
  const homeStay = trip?.planning?.stay;
  const homePacking = trip?.planning?.packingItems?.length ?? 0;
  const homeLeft = Math.max(0, homePacking - (trip?.planning?.packingDone?.length ?? 0));
  const homePlaces = trip?.planning?.places;
  // 장소를 아직 안 연 예시 여행은 셀 것이 없다. 그때는 숫자 대신 안내를 낸다.
  const placesKnown = Boolean(homePlaces);
  const restaurantCount = homePlaces?.filter((place) => place.category === "식당").length ?? 0;
  const cafeCount = homePlaces?.filter((place) => place.category === "카페").length ?? 0;
  return (
    <ScrollView
      style={{ backgroundColor: "transparent" }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.page}
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
      {trips.length > 0 && <HomeTripCarousel trips={trips} initialTrip={trip} theme={theme} todayKey={todayKey} open={open} />}
      {trip ? (
        <>
      <View style={s.scrapTitleRow}>
        <View>
          <Text style={[s.noteTitleSmall, { color: theme.primary }]}>바로 가기</Text>
          <Text style={[s.noteTitle, { color: theme.text }]}>출발 전 확인할 것</Text>
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
        <MemoRow theme={theme} color={theme.primary} text="대표 숙소" meta={homeStay?.name || "아직 등록하지 않았어요"} onPress={() => open("overview", trip)} />
        <MemoRow
          theme={theme}
          color={theme.accent}
          text="준비물"
          meta={
            homePacking
              ? homeLeft
                ? `${homeLeft}개 남았어요`
                : "다 챙겼어요"
              : "아직 없어요"
          }
          onPress={() => open("preparation", trip)}
        />
        <MemoRow theme={theme} color={theme.secondary} text="저장한 장소" meta={placesKnown ? `식당 ${restaurantCount} · 카페 ${cafeCount}` : "아직 없어요"} onPress={() => open("places", trip)} last />
      </View>
      {trips.some((item) => item.end < todayKey) && (
        <View style={s.homeArchiveSection}>
          <View style={s.homeArchiveHead}>
            <View>
              <Text style={[s.homeArchiveEyebrow, { color: theme.secondary }]}>지난 페이지</Text>
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
        </>
      ) : (
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

function HomeTripCarousel({ trips, initialTrip, theme, todayKey, open }: {
  trips: Trip[];
  initialTrip: Trip | null;
  theme: AppTheme;
  todayKey: string;
  open: (destination?: TripDetailDestination, trip?: Trip) => void;
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
    if (reduceMotion) setIndex(current => current + step);
    else settle(step, true);
  };
  const pan = useMemo(() => {
    // PanResponder registers these callbacks; refs are read only during touch events.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !busy.current && Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 0.75,
    onMoveShouldSetPanResponderCapture: (_, gesture) => !busy.current && Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 0.75,
    onPanResponderGrant: (event) => {
      dragging.current = true;
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
      const step = dragDirection.current;
      const forwardVelocity = step === 1 ? -gesture.vx : gesture.vx;
      const complete = canMove(step) && shouldCompletePeel(gesture.dx, gesture.dy, forwardVelocity, width);
      if (reduceMotion) {
        if (complete) setIndex(current => current + step);
        dragging.current = false;
      } else settle(step, complete);
    },
    onPanResponderTerminate: () => settle(dragDirection.current, false),
    onPanResponderTerminationRequest: () => false,
    });
  }, [canMove, index, pages, reduceMotion, settle, turn, width]);
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
  const stay = trip.planning?.stay;
  // 없으면 없다고 말한다. 그럴듯한 숫자를 채워 두면 눌러 보고 나서야 빈 줄
  // 알게 되고, 그때부터는 카드의 다른 숫자도 못 믿는다.
  const scheduleCount = trip.planning?.schedule?.length ?? 0;
  const placeCount = trip.planning?.places?.length ?? 0;
  const packedCount = trip.planning?.packingDone?.length ?? 0;
  // 비용은 여행마다 있을 수도 없을 수도 있다. 적은 게 있을 때만 칸을 내준다.
  const spent = (trip.planning?.expenses ?? []).reduce((sum, item) => sum + item.amount, 0);
  const spentCurrency = trip.planning?.currency;
  return (
      <View style={s.paperTripStack}>
        <View style={[s.paperTripBack, s.paperTripBackLeft, { backgroundColor: paper.backLeft }]} />
        <View style={[s.paperTripBack, s.paperTripBackRight, { backgroundColor: paper.backRight }]} />
        <View
          style={[
            s.paperTrip,
            { backgroundColor: paper.surface, borderColor: paper.border },
          ]}
        >
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
        <View style={[s.paperTape, { backgroundColor: paper.tape }]} />
        <View pointerEvents="none" style={s.paperTripRoute}>
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
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => open("overview", trip)}
          style={({ pressed }) => [
            s.paperTripMain,
            pressed && s.pressed,
          ]}
        >
        <View style={s.paperTripHead}>
          <View style={s.paperTripCopy}>
            <Text style={[s.paperKicker, { color: theme.primary }]}>
              {trip.start <= todayKey && trip.end >= todayKey
                ? "지금 여행 중"
                : trip.end < todayKey ? "지난 여행" : "다음 여행"}
            </Text>
            <Text style={[s.paperTitle, { color: paper.title }]}>
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
              <Text numberOfLines={1} style={[s.paperStayName, { color: paper.title }]}>{stay?.name || "숙소 미등록"}</Text>
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
              <Text style={[s.paperStayTimeValue, { color: theme.primary }]}>{stay?.checkin || "미정"}</Text>
            </View>
          </View>
        </View>
        </Pressable>
        <View style={[s.paperTripActions, { borderTopColor: paper.divider }]}>
          {[
            { label: "여행 일정", meta: scheduleCount ? `${scheduleCount}개` : "아직 없음", color: theme.primary, destination: "overview" as TripDetailDestination },
            { label: "저장 장소", meta: placeCount ? `${placeCount}곳` : "아직 없음", color: domain("stay", theme.dark).solid, destination: "places" as TripDetailDestination },
            // 완료 개수는 여행마다 다르다. 앱 전체에 하나뿐인 done 을 쓰면 어느
            // 카드를 넘겨도 같은 숫자가 나와서 카드가 고장 난 것처럼 보인다.
            { label: "준비물", meta: packedCount ? `${packedCount}개 완료` : "아직 없음", color: domain("packing", theme.dark).solid, destination: "preparation" as TripDetailDestination },
            ...(spent > 0
              ? [{ label: "쓴 돈", meta: money(spent, spentCurrency), color: domain("cooking", theme.dark).solid, destination: "expenses" as TripDetailDestination }]
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
  openCreatorOnMount = false,
  onCreatorOpened,
}: {
  open: (trip: Trip) => void;
  theme: AppTheme;
  items: Trip[];
  setItems: React.Dispatch<React.SetStateAction<Trip[]>>;
  /** 이 공간의 멤버 전원. 여행을 만들 때 이 중에서 참가자를 고른다. */
  spaceMembers: string[];
  openCreatorOnMount?: boolean;
  onCreatorOpened?: () => void;
}) {
  const initialCalendarDate = new Date();
  const initialDateKey = `${initialCalendarDate.getFullYear()}-${String(initialCalendarDate.getMonth() + 1).padStart(2, "0")}-${String(initialCalendarDate.getDate()).padStart(2, "0")}`;
  const [display, setDisplay] = useState<TripView>("목록");
  const [filter, setFilter] = useState<"전체" | "예정" | "추억">("전체");
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
  const [note, setNote] = useState("새 여행");
  const [newRegion, setNewRegion] = useState("서울");
  // 여행마다 가는 사람이 다르다. 처음에는 공간 멤버 전원으로 두고, 일부만
  // 가는 여행이면 여기서 뺀다. 지출의 몫과 준비물 담당이 이 목록을 쓴다.
  const [newPeople, setNewPeople] = useState<string[]>(spaceMembers);
  const [showAllRegions, setShowAllRegions] = useState(false);
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
  const filtered =
    filter === "예정"
      ? items.filter((trip) => trip.end >= initialDateKey)
      : filter === "추억"
        ? items.filter((trip) => trip.end < initialDateKey)
        : items;
  const mapTrips = selectedRegion
    ? items.filter((trip) => trip.region === selectedRegion)
    : items;
  const dateTrips = selectedDate
    ? items.filter(
        (trip) => selectedDate >= trip.start && selectedDate <= trip.end,
      )
    : [];
  const tripDateValid = tripStart <= tripEnd;
  const addTrip = () => {
    if (!place.trim() || !tripDateValid || !newPeople.length) return;
    const range = formatTripRange(tripStart, tripEnd);
    const nextTrip: Trip = {
      name: place.trim(),
      date: range,
      note,
      // 새 여행은 팔레트를 순서대로 돌아가며 받는다.
      tone: items.length % 6,
      mark: tripStart.slice(5, 7),
      region: newRegion,
      start: tripStart,
      end: tripEnd,
      // 참가자는 여행에 붙는 값이다. 공간 멤버가 아니라 이 목록을 기준으로
      // 지출의 몫과 준비물·교통편 담당이 갈린다.
      planning: { participants: newPeople },
    };
    setItems((current) => [nextTrip, ...current]);
    setPlace("");
    setNewPeople(spaceMembers);
    setCreating(false);
    setShowAllRegions(false);
    setSelectedRegion(null);
    setDisplay("목록");
    open(nextTrip);
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
        >
          {explorerHead}
          {display === "목록" && (
            <>
              <View style={s.tripFilters}>
                {(["전체", "예정", "추억"] as const).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setFilter(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item} 여행만 보기`}
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
      <FormSheet
        theme={theme}
        visible={creating}
        title="새 여행"
        subtitle="여행지와 기간을 정하고 첫 여행을 만들어 보세요"
        submit="여행 만들기"
        disabledHint={
          !place.trim()
            ? "여행지를 입력해 주세요"
            : !tripDateValid
              ? "종료일을 다시 확인해 주세요"
              : !newPeople.length
                ? "함께 가는 사람을 한 명은 골라 주세요"
                : undefined
        }
        submitDisabled={!place.trim() || !tripDateValid || !newPeople.length}
        onClose={() => {
          setCreating(false);
          setShowAllRegions(false);
        }}
        onSubmit={addTrip}
      >
        <Field
          theme={theme}
          label="여행지 · 필수"
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
          label="한 줄 메모 · 선택 사항"
          value={note}
          onChangeText={setNote}
        />
        {/* 공간에 나 말고 아무도 없으면 고를 것이 없다. */}
        {spaceMembers.length > 1 && (
          <ParticipantPicker
            theme={theme}
            members={spaceMembers}
            value={newPeople}
            onChange={setNewPeople}
            hint="공간 멤버 모두가 매번 같이 가지는 않아요. 이번에 가는 사람만 골라 두면 지출의 몫과 준비물 담당이 그 사람들 기준으로 맞춰져요."
          />
        )}
      </FormSheet>
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
          // 움직이지 않았으면 톡 누른 것이다. 육지를 눌렀으면 그 자리에서
          // 가장 가까운 시도를 고른다. 시도별 영역 데이터가 없어서 쓰는 어림이다.
          const point = toMapPoint(inMap(event.nativeEvent));
          if (!isOnLand(point.x, point.y)) {
            onClear();
            return;
          }
          const region = nearestRegion(point.x, point.y, tripRegions);
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
                  ? `${results.length}개의 여행`
                  : "아직 등록된 여행이 없어요"}
              </Text>
            </View>
            <Pressable
              onPress={onClear}
              hitSlop={10}
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
              ? `${monthTrips.length}개의 여행이 적혀 있어요`
              : "아직 적힌 여행이 없어요"}
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
          <Pressable onPress={() => move(-1)} hitSlop={9} accessibilityRole="button" accessibilityLabel="이전 달" style={s.monthArrow}>
            <Glyph name="chevronLeft" size={20} color={calendarInk} />
          </Pressable>
          <Pressable onPress={() => move(1)} hitSlop={9} accessibilityRole="button" accessibilityLabel="다음 달" style={s.monthArrow}>
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
}: {
  open: (destination?: TripDetailDestination, trip?: Trip) => void;
  theme: AppTheme;
  trips: Trip[];
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
        tags: recipe.ingredients.slice(0, 3).map((item) => item.name),
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
  const searchFilters = ["전체", "장소", "일정", "요리", "준비", "기록"].map(
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
        다녀온 여행과 준비 중인 기록을 한곳에서 찾아보세요
      </Text>
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
              onPress={() => Alert.alert(
                "최근 검색을 모두 지울까요?",
                `${recentQueries.length}개를 지워요. 되돌릴 수 없어요.`,
                [
                  { text: "취소", style: "cancel" },
                  { text: "지우기", style: "destructive", onPress: () => setRecentQueries([]) },
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
              <Pressable
                onPress={() => Linking.openURL(`https://map.naver.com/p/search/${encodeURIComponent(item.title)}`)}
                accessibilityRole="link"
                accessibilityLabel={`${item.title} 네이버 지도에서 보기`}
                style={s.searchResultAction}
              >
                <Text style={[s.searchResultActionText, { color: naverInk(theme.dark) }]}>네이버 지도</Text>
              </Pressable>
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
            찾는 기록이 없어요
          </Text>
          <Text style={[s.searchEmptyCopy, { color: theme.muted }]}>
            다른 단어나 카테고리로 검색해 보세요.
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
  activeGroupId,
  setActiveGroupId,
  since,
  setSince,
  user,
  setUser,
  openTrip,
  onLogout,
}: {
  theme: AppTheme;
  themeId: ThemeId;
  setThemeId: (value: ThemeId) => void;
  appearance: AppearanceMode;
  setAppearance: (value: AppearanceMode) => void;
  trips: Trip[];
  activeGroupId: GroupId;
  setActiveGroupId: (group: GroupId) => void;
  since: string;
  setSince: (value: string) => void;
  user: DaymoUser;
  setUser: React.Dispatch<React.SetStateAction<DaymoUser | null>>;
  openTrip: (trip: Trip) => void;
  onLogout: () => void;
}) {
  // 이름과 멤버는 마지막에 열어 둔 공간에서 시작한다. 공간만 기억하고 이름은 기본값으로
  // 두면 다시 열었을 때 머리글과 목록이 서로 다른 공간을 가리킨다.
  const activeGroup =
    spaceGroups.find((group) => group.id === activeGroupId) ?? spaceGroups[0];
  const [notifications, setNotifications] = useState(true);
  const [relationship, setRelationship] = useState<"연인" | "친구">(
    activeGroup.relationship,
  );
  const [spaceName, setSpaceName] = useState(activeGroup.name);
  const [memberA, setMemberA] = useState(user.name);
  const [memberB, setMemberB] = useState(activeGroup.members[0] ?? "");
  const [memberC, setMemberC] = useState(activeGroup.members[1] ?? "");
  const [memberD, setMemberD] = useState(activeGroup.members[2] ?? "");
  const [selectedMember, setSelectedMember] = useState(0);
  const [memberRoles, setMemberRoles] = useState<("관리자" | "편집 가능" | "보기만")[]>(["관리자", "편집 가능", "편집 가능", "보기만"]);
  const selectGroup = (group: (typeof spaceGroups)[number]) => {
    setActiveGroupId(group.id);
    setSpaceName(group.name);
    setMemberB(group.members[0] || "");
    setMemberC(group.members[1] || "");
    setMemberD(group.members[2] || "");
    setRelationship(group.relationship);
    setSelectedMember(0);
  };
  const memberSetters = [setMemberA, setMemberB, setMemberC, setMemberD];
  const memberEntries = [memberA, memberB, memberC, memberD]
    .map((name, slot) => ({ name, slot }))
    .filter((entry) => entry.name);
  const visibleMembers = memberEntries.map((entry) => entry.name);
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
    | "groups"
    | null
  >(null);
  const exportData = () =>
    Share.share({
      title: "Daymo 여행 기록",
      message: trips
        .map((trip) => `${trip.name} · ${trip.date}\n${trip.note}`)
        .join("\n\n"),
    });
  const panelTitle =
    panel === "groups"
      ? "여행 공간 바꾸기"
      : panel === "account"
      ? "내 프로필"
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
  const pageRef = useRef<ScrollView>(null);
  const [settingsTop, setSettingsTop] = useState(0);
  return (
    <>
      <ScrollView
        ref={pageRef}
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
            {/* 앱 색상과 화면 모드가 "우리" 라는 말 뒤에 묻혀 있었다. 탭 이름만
                보고는 설정이 여기 있는 줄 알 수가 없다. */}
            <Pressable
              onPress={() => pageRef.current?.scrollTo({ y: Math.max(0, settingsTop - 12), animated: true })}
              accessibilityRole="button"
              accessibilityLabel="앱 설정으로 이동"
              style={[s.togetherSettingsButton, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
            >
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
          <View style={[s.workspaceMark, { backgroundColor: theme.primarySoft }]}>
            <BottomNavIcon item="여행" color={theme.primary} />
          </View>
          <View style={s.workspaceCopy}>
            <Text style={[s.workspaceLabel, { color: theme.muted }]}>현재 여행 공간</Text>
            <Text style={[s.workspaceName, { color: theme.text }]}>{spaceName}</Text>
            <Text numberOfLines={1} style={[s.workspaceMeta, { color: theme.muted }]}>멤버 {visibleMembers.length}명 · 여행 {trips.length}개</Text>
          </View>
          <View style={[s.workspaceSwitchBadge, { backgroundColor: theme.primarySoft }]}>
            <Text style={[s.workspaceSwitchBadgeText, { color: theme.primary }]}>바꾸기</Text>
          </View>
        </Pressable>
        <View style={s.groupTabs}>
          {spaceGroups.map((group) => (
            <Pressable
              key={group.id}
              onPress={() => selectGroup(group)}
              accessibilityRole="button"
              accessibilityState={{ selected: activeGroupId === group.id }}
              style={[
                s.groupTab,
                { backgroundColor: theme.surface, borderColor: theme.border },
                activeGroupId === group.id && {
                  backgroundColor: theme.primarySoft,
                  borderColor: theme.primary,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  s.groupTabText,
                  { color: activeGroupId === group.id ? theme.primary : theme.muted },
                ]}
              >
                {group.name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setPanel("groups")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="공간 모두 보기"
            style={s.groupTabMore}
          >
            <View style={s.groupTabMoreDots}>
              {[0, 1, 2].map((i) => (
                <Dot key={i} size={3} color={theme.muted} />
              ))}
            </View>
          </Pressable>
        </View>
        <View style={s.memberSectionHead}>
          <View>
            <Text style={[s.historyEyebrow, { color: theme.primary }]}>멤버</Text>
            <Text style={[s.memberSectionTitle, { color: theme.text }]}>함께하는 사람</Text>
          </View>
          <Pressable
            accessibilityRole="button" onPress={() => setPanel("members")}><Text style={[s.memberManageText, { color: theme.primary }]}>관리</Text></Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[s.memberStrip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          contentContainerStyle={s.memberStripContent}
        >
          {visibleMembers.map((member, index) => (
            <Pressable
              accessibilityRole="button" key={`${member}-${index}`} onPress={() => setPanel("members")} style={s.memberStripItem}>
              <View style={[s.memberStripAvatar, { backgroundColor: [theme.primary, theme.accent, theme.secondary][index % 3] }]}>
                <Text style={s.memberStripInitial}>{member.slice(0, 1)}</Text>
              </View>
              <Text numberOfLines={1} style={[s.memberStripName, { color: theme.text }]}>{index === 0 ? "나" : member}</Text>
              <Text numberOfLines={1} style={[s.memberStripRole, { color: theme.muted }]}>{memberRoles[index] ?? "편집 가능"}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button" onPress={() => Share.share({ message: "Daymo에서 주말 여행 메이트를 함께 관리해요.\nhttps://daymo.app/invite/OUR-TRIP" })} style={s.memberStripItem}>
            <View style={[s.memberInviteAvatar, { borderColor: theme.border }]}><Glyph name="plus" size={16} color={theme.primary} weight={2.2} /></View>
            <Text style={[s.memberStripName, { color: theme.muted }]}>초대</Text>
            <Text style={[s.memberStripRole, { color: theme.muted }]}>링크 공유</Text>
          </Pressable>
        </ScrollView>
        <Text style={[s.managementLabel, { color: theme.muted }]}>빠른 관리</Text>
        <View style={s.togetherQuickRow}>
          {[
            {
              icon: "plus" as const,
              label: "멤버 초대",
              onPress: () => Share.share({ message: "Daymo에서 주말 여행 메이트를 함께 관리해요.\nhttps://daymo.app/invite/OUR-TRIP" }),
            },
            { icon: "share" as const, label: "여행 목록 공유", onPress: exportData },
            {
              icon: notifications ? ("bellOn" as const) : ("bellOff" as const),
              label: notifications ? "알림 켜짐" : "알림 꺼짐",
              onPress: () => setNotifications((value) => !value),
            },
          ].map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityRole={action.label.startsWith("알림") ? "switch" : "button"}
              accessibilityState={action.label.startsWith("알림") ? { checked: notifications } : undefined}
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
          <Text style={[s.historyPeriod, { color: theme.muted }]}>{since.slice(0, 4)} — 2026</Text>
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
        <Text
          onLayout={(event) => setSettingsTop(event.nativeEvent.layout.y)}
          style={[s.settingGroupLabel, { color: theme.muted }]}
        >
          앱과 계정
        </Text>
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
                ? "시스템 설정"
                : appearance === "dark"
                  ? "다크"
                  : "라이트"
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
      </ScrollView>
      <InfoSheet
        theme={theme}
        visible={panel !== null}
        title={panelTitle}
        onClose={() => setPanel(null)}
      >
        {panel === "groups" && (
          <>
            <Text style={[s.sheetCopy, { color: theme.muted }]}>함께 관리할 여행 공간을 선택하세요.</Text>
            {spaceGroups.map((group) => (
              <Pressable
                key={group.id}
                onPress={() => {
                  selectGroup(group);
                  setPanel(null);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: activeGroupId === group.id }}
                style={[s.groupChoice, { backgroundColor: theme.surface, borderColor: activeGroupId === group.id ? theme.primary : theme.border }]}
              >
                <View style={[s.groupChoiceAvatar, { backgroundColor: activeGroupId === group.id ? theme.primary : theme.primarySoft }]}>
                  <Text style={[s.groupChoiceAvatarText, { color: activeGroupId === group.id ? "#FFFFFF" : theme.primary }]}>{group.name.slice(0, 1)}</Text>
                </View>
                <View style={s.groupChoiceCopy}>
                  <Text style={[s.groupChoiceName, { color: theme.text }]}>{group.name}</Text>
                  <Text numberOfLines={1} style={[s.groupChoiceMeta, { color: theme.muted }]}>{[user.name, ...group.members].join(" · ")}</Text>
                </View>
                <View style={s.groupChoiceCheck}>
                  {activeGroupId === group.id && <Glyph name="check" size={14} color={theme.primary} weight={2.4} />}
                </View>
              </Pressable>
            ))}
          </>
        )}
        {panel === "account" && (
          <>
            <View style={[s.accountPreview, { backgroundColor: theme.primarySoft }]}>
              <View style={[s.accountAvatar, { backgroundColor: theme.primary }]}>
                <Text style={s.accountAvatarText}>{user.name.trim().slice(0, 1) || "?"}</Text>
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
              onChangeText={(name) => {
                setUser((current) => (current ? { ...current, name } : current));
                setMemberA(name);
              }}
              placeholder="앱에서 사용할 이름"
            />
            <Field
              theme={theme}
              label="이메일"
              value={user.email}
              onChangeText={(email) =>
                setUser((current) => (current ? { ...current, email } : current))
              }
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={[s.sheetCopy, { color: theme.muted }]}>프로필 변경 내용은 바로 저장돼요.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                Alert.alert("로그아웃할까요?", "기기에만 저장된 변경 내용이 있다면 동기화 후 로그아웃해 주세요.", [
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
                Alert.alert(
                  "Daymo 계정을 삭제할까요?",
                  "참여 중인 여행 공간과 서버에 저장된 내 데이터에 더 이상 접근할 수 없어요. 이 작업은 되돌릴 수 없습니다.",
                  [
                    { text: "취소", style: "cancel" },
                    { text: "계정 삭제", style: "destructive", onPress: () => { setPanel(null); onLogout(); } },
                  ],
                );
              }}
              accessibilityRole="button"
              style={s.accountDelete}
            >
              <Text style={s.accountDeleteText}>계정 삭제</Text>
            </Pressable>
          </>
        )}
        {panel === "members" && (
          <>
            <View style={s.memberManagerHead}>
              <View>
                <Text style={[s.memberManagerTitle, { color: theme.text }]}>{visibleMembers.length}명이 함께하고 있어요</Text>
                <Text style={[s.memberManagerCopy, { color: theme.muted }]}>관리할 멤버를 선택하세요.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => Share.share({ message: "Daymo에서 주말 여행 메이트를 함께 관리해요.\nhttps://daymo.app/invite/OUR-TRIP" })}
                style={[s.memberManagerInvite, { backgroundColor: theme.primarySoft }]}
              >
                <Text style={[s.memberManagerInviteText, { color: theme.primary }]}>＋ 초대</Text>
              </Pressable>
            </View>
            <View style={s.memberManagerGrid}>
              {memberEntries.map(({ name: member, slot }, index) => (
                <Pressable
                  key={`${member}-manage`}
                  onPress={() => setSelectedMember(slot)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedMember === slot }}
                  style={[
                    s.memberManagerCard,
                    { backgroundColor: theme.surface, borderColor: selectedMember === slot ? theme.primary : theme.border },
                    selectedMember === slot && { borderWidth: 2 },
                  ]}
                >
                  <View style={[s.memberManagerAvatar, { backgroundColor: [theme.primary, theme.accent, theme.secondary][index % 3] }]}>
                    <Text style={s.memberStripInitial}>{member.slice(0, 1)}</Text>
                  </View>
                  <View style={s.memberManagerCardCopy}>
                    <Text numberOfLines={1} style={[s.memberManagerName, { color: theme.text }]}>{member}{slot === 0 ? " (나)" : ""}</Text>
                    <Text numberOfLines={1} style={[s.memberManagerRole, { color: selectedMember === slot ? theme.primary : theme.muted }]}>{memberRoles[slot]}</Text>
                  </View>
                  <View style={selectedMember !== slot && { opacity: 0 }}>
                    <Glyph name="check" size={16} color={theme.primary} weight={2.4} />
                  </View>
                </Pressable>
              ))}
            </View>
            <View style={[s.memberEditor, { backgroundColor: theme.primarySoft }]}>
              <Text style={[s.memberEditorEyebrow, { color: theme.primary }]}>선택한 멤버</Text>
              <Field
                theme={theme}
                label={selectedMember === 0 ? "내 이름" : "멤버 이름"}
                value={[memberA, memberB, memberC, memberD][selectedMember] || ""}
                onChangeText={(value) => memberSetters[selectedMember]?.(value)}
                placeholder="이름 또는 별명"
              />
              {selectedMember === 0 ? (
                <Text style={[s.memberRoleText, { color: theme.muted }]}>관리자는 공간과 모든 여행을 관리할 수 있어요.</Text>
              ) : (
                <>
                  <Text style={[s.memberPermissionLabel, { color: theme.text }]}>이 공간에서 할 수 있는 일</Text>
                  <Choice
                    theme={theme}
                    selected={memberRoles[selectedMember] === "편집 가능"}
                    label="함께 관리 · 일정과 준비물을 수정"
                    onPress={() => setMemberRoles((roles) => roles.map((role, index) => index === selectedMember ? "편집 가능" : role))}
                  />
                  <Choice
                    theme={theme}
                    selected={memberRoles[selectedMember] === "보기만"}
                    label="보기만 · 내용을 확인"
                    onPress={() => setMemberRoles((roles) => roles.map((role, index) => index === selectedMember ? "보기만" : role))}
                  />
                  <Pressable
                    onPress={() => {
                      const memberName = [memberA, memberB, memberC, memberD][selectedMember];
                      Alert.alert(
                        `${memberName}님을 내보낼까요?`,
                        "이 멤버는 더 이상 이 공간의 여행을 보거나 수정할 수 없어요.",
                        [
                          { text: "취소", style: "cancel" },
                          {
                            text: "내보내기",
                            style: "destructive",
                            onPress: () => {
                              memberSetters[selectedMember]?.("");
                              setSelectedMember(0);
                            },
                          },
                        ],
                      );
                    }}
                    hitSlop={6}
                    accessibilityRole="button"
                    style={s.memberRemoveButton}
                  >
                    <Text style={s.memberRemoveText}>이 공간에서 내보내기</Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}
        {panel === "relationship" && (
          <>
            <Choice
              theme={theme}
              selected={relationship === "연인"}
              label="연인"
              onPress={() => setRelationship("연인")}
            />
            <Choice
              theme={theme}
              selected={relationship === "친구"}
              label="친구"
              onPress={() => setRelationship("친구")}
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
              label="시스템 설정에 맞추기"
              onPress={() => setAppearance("system")}
            />
            <Choice
              theme={theme}
              selected={appearance === "light"}
              label="항상 라이트"
              onPress={() => setAppearance("light")}
            />
            <Choice
              theme={theme}
              selected={appearance === "dark"}
              label="항상 다크"
              onPress={() => setAppearance("dark")}
            />
          </>
        )}
        {panel === "help" && (
          <Text style={[s.sheetCopy, { color: theme.muted }]}>
            여행을 만들고 일정, 준비물, 메모와 사진을 한곳에서 함께 관리하세요.
          </Text>
        )}
        {panel === "licenses" && (
          <>
            <Text style={[s.sheetCopy, { color: theme.muted }]}>
              Daymo에 담아 함께 배포하는 저작물과 라이선스예요.
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
              <View style={[s.profileSheetAvatar, { backgroundColor: theme.primary }]}>
                <Text style={s.togetherAvatarText}>{memberA.trim().slice(0, 1) || "?"}</Text>
              </View>
              <View style={[s.profileSheetAvatar, s.profileSheetAvatarSecond, { backgroundColor: theme.accent }]}>
                <Text style={s.togetherAvatarText}>{memberB.trim().slice(0, 1) || "?"}</Text>
              </View>
              <Text style={[s.profileSheetName, { color: theme.text }]}>{spaceName}</Text>
            </View>
            <Field
              theme={theme}
              label="공간 이름"
              value={spaceName}
              onChangeText={setSpaceName}
              placeholder="예: 우리의 여행 기록"
            />
            <Field
              theme={theme}
              label="함께한 시작일"
              value={since}
              onChangeText={setSince}
              placeholder="YYYY. MM. DD"
            />
            <Text style={[s.sheetCopy, { color: theme.muted }]}>변경 내용은 닫으면 자동으로 저장돼요.</Text>
          </>
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
        ]}
      />
    </View>
  );
}
function FormSheet({
  theme,
  visible,
  title,
  subtitle,
  submit,
  disabledHint,
  submitDisabled = false,
  onClose,
  onSubmit,
  children,
}: {
  theme?: AppTheme;
  visible: boolean;
  title: string;
  subtitle?: string;
  submit: string;
  disabledHint?: string;
  submitDisabled?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const drag = useSheetDrag(onClose, visible);
  const submitLocked = useRef(false);
  useEffect(() => {
    if (visible) submitLocked.current = false;
  }, [visible]);
  const sheetKind = title.includes("여행")
    ? "여행"
    : title.includes("공간")
      ? "우리"
      : "Daymo";
  const sheetAccent = theme?.primary ?? "#FF6B63";
  const sheetAction = title.includes("수정") ? "수정" : title.includes("추가") || title.includes("만들") ? "추가" : "확인";
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.modalBack}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={s.modalDismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel={`${title} 바깥 영역 닫기`} />
        <Animated.View
          onLayout={drag.onLayout}
          style={[
            s.sheet,
            theme && { backgroundColor: theme.background },
            drag.sheetStyle,
          ]}
        >
          <View {...drag.panHandlers} style={s.sheetDragHandleArea}>
            <View style={s.sheetHandle} />
          </View>
          <View
            style={[
              s.sheetHead,
              s.sheetHeadDecorated,
              { backgroundColor: `${sheetAccent}0B`, borderColor: `${sheetAccent}30` },
            ]}
          >
            <View {...drag.panHandlers} style={s.sheetHeadMain}>
              <View style={s.sheetHeadCopy}>
                <View style={s.sheetKindRow}>
                  <View style={[s.sheetKindDot, { backgroundColor: sheetAccent }]} />
                  <Text style={[s.sheetKindText, { color: sheetAccent }]}>{sheetKind} · {sheetAction}</Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[s.sheetTitle, theme && { color: theme.text }]}
                >
                  {title}
                </Text>
                {subtitle && (
                  <Text numberOfLines={2} style={[s.sheetSubtitle, theme && { color: theme.muted }]}>
                    {subtitle}
                  </Text>
                )}
              </View>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${title} 닫기`}
              style={[s.sheetCloseButton, theme && { backgroundColor: theme.surfaceAlt }]}
            >
              <Text
                style={[
                  s.sheetClose,
                  theme && { color: theme.primary },
                ]}
              >
                ×
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={s.sheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
            <View style={s.sheetFormBody}>
              {children}
            </View>
          </ScrollView>
          {submitDisabled && disabledHint && (
            <Text accessibilityLiveRegion="polite" style={[s.sheetDisabledHint, theme && { color: theme.muted }]}>{disabledHint}</Text>
          )}
          <Pressable
            onPress={() => {
              if (submitLocked.current) return;
              submitLocked.current = true;
              Keyboard.dismiss();
              onSubmit();
              setTimeout(() => {
                submitLocked.current = false;
              }, 800);
            }}
            disabled={submitDisabled}
            accessibilityRole="button"
            accessibilityLabel={submit}
            accessibilityState={{ disabled: submitDisabled }}
            style={({ pressed }) => [
              s.sheetSubmit,
              theme && { backgroundColor: theme.primary },
              submitDisabled && s.sheetSubmitDisabled,
              pressed && !submitDisabled && s.controlPressed,
            ]}
          >
            <Text style={[s.sheetSubmitText, { color: onAccent(Boolean(theme?.dark)) }]}>{submit}</Text>
            <View style={s.sheetSubmitArrow}><Glyph name="arrowRight" size={15} color={onAccent(Boolean(theme?.dark))} /></View>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
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
  const drag = useSheetDrag(onClose, visible);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.modalBack}>
        <Pressable style={s.modalDismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel={`${title} 바깥 영역 닫기`} />
        <Animated.View
          onLayout={drag.onLayout}
          style={[
            s.sheet,
            theme && { backgroundColor: theme.background },
            drag.sheetStyle,
          ]}
        >
          <View {...drag.panHandlers} style={s.sheetDragHandleArea}>
            <View style={s.sheetHandle} />
          </View>
          <View style={[s.sheetHead, s.infoSheetHead, theme && { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
            <View {...drag.panHandlers} style={s.sheetHeadCopy}>
              <View style={s.sheetKindRow}>
                <View style={[s.sheetKindDot, theme && { backgroundColor: theme.primary }]} />
                <Text style={[s.sheetKindText, theme && { color: theme.primary }]}>우리 설정</Text>
                <View style={[s.sheetRouteLine, theme && { backgroundColor: theme.border }]} />
                <View style={[s.sheetRouteDot, theme && { borderColor: theme.primary }]} />
              </View>
              <Text
                numberOfLines={1}
                style={[s.sheetTitle, theme && { color: theme.text }]}
              >
                {title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${title} 닫기`}
              style={[s.infoSheetDone, theme && { backgroundColor: theme.surface }]}
            >
              <Text
                style={[
                  s.infoSheetDoneText,
                  theme && { color: theme.primary },
                ]}
              >
                완료
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={s.sheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={s.infoSheetBody}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
function Choice({
  theme,
  label,
  selected,
  onPress,
}: {
  theme?: AppTheme;
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: Boolean(selected) }}
      accessibilityLabel={label}
      style={[
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
    minHeight: 55,
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
    top: -11,
    left: "50%",
    marginLeft: -39,
    opacity: 0.82,
    backgroundColor: "rgba(218, 198, 157, .68)",
    transform: [{ rotate: "1.5deg" }],
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
    minHeight: 55,
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
    minHeight: 42,
    borderRadius: 8,
    paddingHorizontal: 16,
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
  modalBack: {
    flex: 1,
    backgroundColor: "rgba(10,18,35,.42)",
    justifyContent: "flex-end",
  },
  modalDismiss: { flex: 1 },
  sheetHandle: {
    width: 54,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C7C7C3",
  },
  sheetDragHandleArea: {
    height: 40,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  sheetHeadDecorated: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 2,
    position: "relative",
  },
  sheetFormBody: {
    paddingHorizontal: 2,
  },
  sheetHeadMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  sheetHeadCopy: { flex: 1 },
  sheetKindRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  sheetKindDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  sheetKindText: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 1 },
  sheetRouteLine: { width: 27, height: 1, marginLeft: 8, marginRight: 4 },
  sheetRouteDot: { width: 6, height: 6, borderRadius: 999, borderWidth: 1.5 },
  sheetTitle: {
    fontSize: 24,
    fontFamily: typo.title.family,
    letterSpacing: -0.5,
  },
  sheetSubtitle: { fontSize: 11, marginTop: 4 },
  sheetDisabledHint: { fontSize: 11, lineHeight: 15, textAlign: "center", marginTop: 4 },
  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetClose: { fontSize: 24, lineHeight: 26, fontWeight: "500" },
  infoSheetHead: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  infoSheetDone: {
    minWidth: 52,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  infoSheetDoneText: { fontSize: 14, lineHeight: 18, fontFamily: typo.label.family },
  infoSheetBody: { paddingBottom: 8 },
  field: { marginBottom: 12 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  fieldLabelDot: { width: 5, height: 5, borderRadius: 2, marginRight: 6 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: typo.label.family,
    marginBottom: 0,
  },
  sheetSubmit: {
    height: 50,
    borderRadius: 16,
    backgroundColor: "#17233D",
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    paddingLeft: 16,
    paddingRight: 6,
    marginTop: 6,
  },
  sheetSubmitText: { fontSize: 14, fontFamily: typo.label.family },
  sheetSubmitDisabled: { opacity: 0.38 },
  sheetSubmitArrow: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCopy: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  choiceSelected: { borderColor: "#8B7CF6", backgroundColor: "#E9E5FF" },
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
  mapTrayClose: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#F0F3F2",
    alignItems: "center",
    justifyContent: "center",
  },
  mapTrayCloseText: { fontSize: 20, lineHeight: 21 },
  mapTrayList: { paddingHorizontal: 12, gap: 8 },
  mapTrayCard: {
    width: 244,
    height: 60,
    borderRadius: 16,
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
  zoomButton: { height: 44, alignItems: "center", justifyContent: "center" },
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
  togetherSettingsButton: { minHeight: 40, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
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
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
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
  newTrip: {
    borderRadius: 12,
    minHeight: 40,
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
    minHeight: 39,
    borderRadius: 12,
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
  filter: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center" },
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
  dayCell: {
    width: "14.285%",
    height: 37,
    borderRadius: 8,
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
    height: 54,
    borderRadius: 12,
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
    height: 40,
    minWidth: 61,
    borderRadius: 16,
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
    minHeight: 32,
    borderRadius: 999,
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
  searchMore: { minHeight: 48, borderTopWidth: 1, alignItems: "center", justifyContent: "center" },
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
    minHeight: 58,
    borderRadius: 12,
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
  sheet: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: "91%",
  },
  fieldInput: {
    height: 49,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    borderWidth: 1,
  },
  choice: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
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
  controlPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
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
  oauthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  oauthButton: {
    // 48.7%씩 둘에 간격 8을 더하면 100%를 넘어 한 줄에 하나씩 떨어졌다.
    // 남은 폭을 둘이 나눠 갖게 해서 간격을 세고도 두 개가 들어간다.
    flexGrow: 1,
    flexBasis: "40%",
    minWidth: 0,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  oauthLabel: { fontSize: 12, fontFamily: typo.label.family },
  authDivider: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  authDividerLine: { flex: 1, height: 1 },
  authDividerText: { fontSize: 12, fontFamily: typo.label.family, marginHorizontal: 8 },
  authError: { fontSize: 13, fontFamily: typo.label.family, marginTop: 2 },
  authSubmit: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  authSubmitDisabled: { opacity: 0.38 },
  authSubmitText: { fontSize: 14, fontFamily: typo.label.family },
  authSwitch: { alignItems: "center", paddingTop: 16, paddingBottom: 2 },
  authSwitchText: { fontSize: 12, fontFamily: typo.label.family },
  authConsentList: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 6, marginBottom: 12 },
  authConsentRow: { minHeight: 38, flexDirection: "row", alignItems: "center" },
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
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  accountLogoutText: { color: "#DF5148", fontSize: 12, fontFamily: typo.label.family },
  accountDelete: { minHeight: 40, alignItems: "center", justifyContent: "center", marginTop: 4 },
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
    minHeight: 40,
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noticeLinkText: { fontSize: typo.label.size, lineHeight: typo.label.line, fontFamily: typo.label.family },
  togetherAccountButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
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
    minHeight: 43,
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
  memberManagerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  memberManagerCard: { width: "48.8%", minHeight: 61, borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, flexDirection: "row", alignItems: "center" },
  memberManagerAvatar: { width: 33, height: 33, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  memberManagerCardCopy: { flex: 1, minWidth: 0, marginLeft: 8 },
  memberManagerName: { fontSize: 14, fontFamily: typo.title.family },
  memberManagerRole: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  memberEditor: { borderRadius: 12, padding: 12 },
  memberEditorEyebrow: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 8 },
  memberRemoveButton: { height: 38, alignItems: "center", justifyContent: "center", marginTop: 4 },
  memberRemoveText: { color: "#DF5148", fontSize: 12, fontFamily: typo.label.family },
});
