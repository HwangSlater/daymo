import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Image,
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
import Svg, { Path } from "react-native-svg";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { TripDetailDestination, WarmTripDetail } from "./WarmTripDetail";
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
import { domain, kindColor, paperCard, tripTone } from "./theme/colors";

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

const upcomingSampleStart = sampleDate(12);
const upcomingSampleEnd = sampleDate(14);
const recentSampleStart = sampleDate(-23);
const recentSampleEnd = sampleDate(-22);
const archiveSampleStart = sampleDate(-45);
const archiveSampleEnd = sampleDate(-43);

const trips: Trip[] = [
  {
    name: "전주 한옥마을",
    date: sampleDateRange(upcomingSampleStart, upcomingSampleEnd),
    note: "숙소에서 수다와 버섯전골",
    tone: 0,
    mark: upcomingSampleStart.slice(5, 7),
    region: "전북",
    start: upcomingSampleStart,
    end: upcomingSampleEnd,
  },
  {
    name: "강릉 안목",
    date: sampleDateRange(recentSampleStart, recentSampleEnd),
    note: "보드게임과 야식 장보기",
    tone: 5,
    mark: recentSampleStart.slice(5, 7),
    region: "강원",
    start: recentSampleStart,
    end: recentSampleEnd,
  },
  {
    name: "여수",
    date: sampleDateRange(archiveSampleStart, archiveSampleEnd),
    note: "바다 산책과 단체 사진",
    tone: 3,
    mark: archiveSampleStart.slice(5, 7),
    region: "전남",
    start: archiveSampleStart,
    end: archiveSampleEnd,
  },
];
const initialTripsByGroup: Record<GroupId, Trip[]> = {
  ours: [trips[0]],
  friends: trips,
  family: [
    {
      name: "속초",
      date: "10월 3일 — 4일",
      note: "가족과 천천히 걷는 가을 여행",
      tone: 1,
      mark: "10",
      region: "강원",
      start: "2026-10-03",
      end: "2026-10-04",
    },
  ],
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
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const homeTrip = [...tripItems]
    .filter((trip) => trip.end >= todayKey)
    .sort((left, right) => left.start.localeCompare(right.start))[0] ?? null;
  const theme = resolveTheme(
    themeId,
    appearance === "system" ? systemScheme === "dark" : appearance === "dark",
  );
  const toggle = (item: string) =>
    setDone((items) =>
      items.includes(item)
        ? items.filter((value) => value !== item)
        : [...items, item],
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
        toggle={toggle}
        initialDestination={tripDestination}
        tripName={selectedTrip.name}
        tripDate={selectedTrip.date}
        tripStart={selectedTrip.start}
        tripEnd={selectedTrip.end}
        appTheme={theme}
        onClose={() => setTripOpen(false)}
      />
    );
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
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
          {error ? <Text style={s.authError}>{error}</Text> : null}
          <Pressable
            onPress={submit}
            disabled={!authFormValid}
            accessibilityRole="button"
            accessibilityState={{ disabled: !authFormValid }}
            style={[s.authSubmit, { backgroundColor: theme.primary }, !authFormValid && s.authSubmitDisabled]}
          >
            <Text style={s.authSubmitText}>{mode === "login" ? "로그인" : "회원가입"}</Text>
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
          <Pressable onPress={switchMode} style={s.authSwitch}>
            <Text style={[s.authSwitchText, { color: theme.muted }]}>{mode === "login" ? "처음이신가요? " : "이미 계정이 있나요? "}<Text style={{ color: theme.primary, fontWeight: "900" }}>{mode === "login" ? "회원가입" : "로그인"}</Text></Text>
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
  relationship,
  since,
}: {
  open: (destination?: TripDetailDestination, trip?: Trip) => void;
  goTrips: () => void;
  theme: AppTheme;
  trip: Trip | null;
  trips: Trip[];
  todayKey: string;
  relationship: "연인" | "친구";
  since: string;
}) {
  const paper = paperCard(theme.dark);
  const togetherDays = relationship === "연인" ? daysSince(since, todayKey) : null;
  return (
    <ScrollView
      style={{ backgroundColor: "transparent" }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.page}
    >
      <View style={s.notebookHead}>
        <View>
          <Text style={[s.logo, { color: theme.text }]}>Daymo</Text>
          <Text style={[s.notebookHello, { color: theme.muted }]}>
            우리의 여행 수첩
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
      {trip ? (
        <>
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
                : "다음 여행"}
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
              <Text numberOfLines={1} style={[s.paperStayName, { color: paper.title }]}>달빛한옥</Text>
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
              <Text style={[s.paperStayTimeValue, { color: theme.primary }]}>15:00</Text>
            </View>
          </View>
        </View>
        </Pressable>
        <View style={[s.paperTripActions, { borderTopColor: paper.divider }]}>
          {[
            { label: "여행 일정", meta: "3개", color: theme.primary, destination: "overview" as TripDetailDestination },
            { label: "저장 장소", meta: "8곳", color: domain("stay", theme.dark).solid, destination: "places" as TripDetailDestination },
            { label: "준비물", meta: "2 / 6", color: domain("packing", theme.dark).solid, destination: "preparation" as TripDetailDestination },
          ].map((item, index) => (
            <Pressable
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
      <View style={s.scrapTitleRow}>
        <View>
          <Text style={[s.noteTitleSmall, { color: theme.primary }]}>우리의 체크리스트</Text>
          <Text style={[s.noteTitle, { color: theme.text }]}>출발 전, 이것만</Text>
        </View>
        <Pressable onPress={() => open("overview", trip)}>
          <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "700" }}>전체 확인</Text>
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
        <MemoRow theme={theme} color={theme.primary} text="숙소 예약 정보 확인" meta="오늘 · 공용" onPress={() => open("overview", trip)} />
        <MemoRow theme={theme} color={theme.accent} text="아직 안 챙긴 준비물 2개" meta="하늘 1 · 여울 1" onPress={() => open("preparation", trip)} />
        <MemoRow theme={theme} color={theme.secondary} text="저장한 장소에서 일정 고르기" meta="식당 5 · 카페 3" onPress={() => open("places", trip)} last />
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
            style={[s.homeEmptyTripAction, { backgroundColor: theme.primary }]}
          >
            <Text style={s.homeEmptyTripActionText}>새 여행 만들기</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
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

function HomeMetric({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={s.homeMetric}>
      <Text style={[s.homeMetricValue, { color }]}>{value}</Text>
      <Text style={s.homeMetricLabel}>{label}</Text>
    </View>
  );
}
function HomeQuick({
  icon,
  label,
  tint,
  color,
  onPress,
  theme,
  embedded = false,
  layout,
}: {
  icon: string;
  label: string;
  tint: string;
  color: string;
  onPress: () => void;
  theme: AppTheme;
  embedded?: boolean;
  layout?: "large" | "small" | "rail";
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        s.homeQuick,
        embedded && s.homeQuickEmbedded,
        layout === "large" && s.homeQuickLarge,
        layout === "small" && s.homeQuickSmall,
        layout === "rail" && s.homeQuickRail,
        {
          backgroundColor: embedded ? tint : theme.surface,
          borderColor: embedded ? `${color}${theme.dark ? "65" : "3D"}` : theme.border,
        },
      ]}
    >
      <View
        style={[
          s.homeQuickIcon,
          { backgroundColor: tint, borderColor: embedded ? color : "transparent" },
          embedded && s.homeQuickIconEmbedded,
          layout === "large" && s.homeQuickIconLarge,
          layout === "rail" && s.homeQuickIconRail,
        ]}
      >
        {embedded ? (
          <Svg width={18} height={18} viewBox="0 0 22 22">
            <Path
              d={
                label === "여행 일정"
                  ? "M7 4v3M15 4v3M4.5 9.5h13M6 6.5h10A1.5 1.5 0 0 1 17.5 8v9a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 17V8A1.5 1.5 0 0 1 6 6.5Z"
                  : label === "저장 장소"
                    ? "M11 19s6-5.3 6-10A6 6 0 0 0 5 9c0 4.7 6 10 6 10Zm0-7.6a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z"
                    : "m5 11 3.7 3.7L17 6.5"
              }
              fill="none"
              stroke={color}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : (
          <Text style={[s.homeQuickIconText, { color }]}>{icon}</Text>
        )}
      </View>
      <Text
        style={[
          s.homeQuickLabel,
          embedded && s.homeQuickLabelEmbedded,
          layout === "large" && s.homeQuickLabelLarge,
          layout === "rail" && s.homeQuickLabelRail,
          { color: theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type TripView = "목록" | "지도" | "캘린더";

function TripsExplorer({
  open,
  theme,
  items,
  setItems,
  openCreatorOnMount = false,
  onCreatorOpened,
}: {
  open: (trip: Trip) => void;
  theme: AppTheme;
  items: Trip[];
  setItems: React.Dispatch<React.SetStateAction<Trip[]>>;
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
  const [showAllRegions, setShowAllRegions] = useState(false);
  useEffect(() => {
    if (!openCreatorOnMount) return;
    setCreating(true);
    onCreatorOpened?.();
  }, [openCreatorOnMount, onCreatorOpened]);
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
  const visibleTrips = selectedRegion
    ? filtered.filter((trip) => trip.region === selectedRegion)
    : filtered;
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
    if (!place.trim() || !tripDateValid) return;
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
    };
    setItems((current) => [nextTrip, ...current]);
    setPlace("");
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
    setCreating(true);
  };
  const explorerHead = (
    <>
      <View style={s.screenHead}>
        <View>
          <Text style={[s.overline, { color: theme.primary }]}>함께 만든 여행</Text>
          <Text style={[s.screenTitle, { color: theme.text }]}>여행</Text>
        </View>
        <Pressable
          onPress={() => setCreating(true)}
          style={({ pressed }) => [
            s.newTrip,
            { backgroundColor: theme.primary },
            pressed && s.pressed,
          ]}
        >
          <Text style={s.newTripText}>＋ 새 여행</Text>
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
              setSelectedRegion(selectedRegion === region ? null : region)
            }
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
                  <Pressable onPress={createFromDate}>
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
        submit={
          !place.trim()
            ? "여행지를 입력해 주세요"
            : !tripDateValid
              ? "종료일을 다시 확인해 주세요"
              : "여행 만들기"
        }
        submitDisabled={!place.trim() || !tripDateValid}
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
        <Text style={[s.fieldLabel, { color: theme.muted }]}>
          지역
        </Text>
        <View style={s.regionChoices}>
          {regionPins
            .filter(
              (pin) =>
                showAllRegions ||
                ["서울", "경기", "인천", "강원", "부산", "제주"].includes(
                  pin.name,
                ) ||
                pin.name === newRegion,
            )
            .map((pin) => (
              <Pressable
                key={pin.name}
                onPress={() => setNewRegion(pin.name)}
                style={[
                  s.regionChoice,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  newRegion === pin.name && s.regionChoiceActive,
                  newRegion === pin.name && {
                    backgroundColor: theme.primarySoft,
                    borderColor: theme.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    s.regionChoiceText,
                    { color: theme.muted },
                    newRegion === pin.name && s.regionChoiceTextActive,
                    newRegion === pin.name && { color: theme.primary },
                  ]}
                >
                  {pin.name}
                </Text>
              </Pressable>
            ))}
          <Pressable
            onPress={() => setShowAllRegions((current) => !current)}
            style={[
              s.regionChoice,
              s.regionMoreChoice,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[s.regionChoiceText, { color: theme.primary }]}>{showAllRegions ? "간단히 보기" : "전체 지역 +"}</Text>
          </Pressable>
        </View>
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

const regionPins = [
  { name: "서울", x: 99.9, y: 92.4, minZoom: 1 },
  { name: "인천", x: 88.3, y: 96.3, minZoom: 1.5 },
  { name: "경기", x: 112, y: 113, minZoom: 1 },
  { name: "강원", x: 148.4, y: 80.3, minZoom: 1 },
  { name: "충북", x: 131.1, y: 148.8, minZoom: 1 },
  { name: "충남", x: 94.9, y: 163.2, minZoom: 1 },
  { name: "대전", x: 114.9, y: 176.4, minZoom: 1.5 },
  { name: "세종", x: 109.8, y: 161.1, minZoom: 2 },
  { name: "전북", x: 105.6, y: 219.7, minZoom: 1 },
  { name: "전남", x: 98.6, y: 273.5, minZoom: 1 },
  { name: "광주", x: 94.1, y: 258.5, minZoom: 1.5 },
  { name: "경북", x: 164.8, y: 176.2, minZoom: 1 },
  { name: "대구", x: 158.3, y: 211.8, minZoom: 1.5 },
  { name: "경남", x: 146.8, y: 243.7, minZoom: 1 },
  { name: "울산", x: 183.3, y: 230.9, minZoom: 1.5 },
  { name: "부산", x: 177, y: 254.8, minZoom: 1 },
  { name: "제주", x: 83.7, y: 381.4, minZoom: 1 },
];

const MAP_MAX_ZOOM = 5;

function KoreaTripMap({
  theme,
  trips,
  results,
  selected,
  onSelect,
  open,
}: {
  theme: AppTheme;
  trips: Trip[];
  results: Trip[];
  selected: string | null;
  onSelect: (region: string) => void;
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
          if (!isOnLand(point.x, point.y)) return;
          const region = nearestRegion(point.x, point.y, regionPins);
          if (region) onSelect(region);
        },
        onPanResponderTerminate: () => {
          gesture.current = { kind: "none" };
          setPinching(false);
        },
      }),
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
    detailed ? require("./koreaCityPath").koreaCityPath : null;
  return (
    <View
      {...(webWheel as any)}
      {...panResponder.panHandlers}
      ref={host}
      style={s.mapOnly}
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
      {regionPins.map((pin) => {
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
              onPress={() => onSelect(selected)}
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
  return (
    <View
      style={[
        s.calendarCard,
        {
          backgroundColor: theme.dark ? "#FCFCFA" : "#FFFEFC",
          borderColor: theme.dark ? "#BBC0C8" : "#D9D9D5",
        },
      ]}
    >
      <View pointerEvents="none" style={s.calendarPageBack} />
      <View style={s.calendarHead}>
        <View style={s.calendarTitleBlock}>
          <Text style={[s.calendarMonth, { color: "#283046" }]}>
            {month.year}. {String(month.value).padStart(2, "0")}
          </Text>
          <Text style={s.calendarSub}>
            {monthTrips.length
              ? `${monthTrips.length}개의 여행이 적혀 있어요`
              : "아직 적힌 여행이 없어요"}
          </Text>
        </View>
        <View style={s.calendarControls}>
          <Pressable onPress={moveToToday} style={s.calendarTodayButton}>
            <Text style={s.calendarTodayText}>오늘</Text>
          </Pressable>
          <Pressable onPress={() => move(-1)} style={s.monthArrow}>
            <Glyph name="chevronLeft" size={20} color={theme.text} />
          </Pressable>
          <Pressable onPress={() => move(1)} style={s.monthArrow}>
            <Glyph name="chevronRight" size={20} color={theme.text} />
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
              <Text style={s.calendarLegendText}>{trip.name}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={s.weekRow}>
        {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
          <Text
            key={day}
            style={[
              s.weekName,
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

function formatTripRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const nights = Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / 86400000),
  );
  return `${startDate.getMonth() + 1}월 ${startDate.getDate()}일 — ${endDate.getMonth() + 1}월 ${endDate.getDate()}일 · ${nights ? `${nights}박 ${nights + 1}일` : "당일"}`;
}

function TripDateRangePicker({
  theme,
  start,
  end,
  setStart,
  setEnd,
}: {
  theme: AppTheme;
  start: string;
  end: string;
  setStart: (value: string) => void;
  setEnd: (value: string) => void;
}) {
  const initial = new Date(`${start}T00:00:00`);
  const [calendarMonth, setCalendarMonth] = useState({
    year: initial.getFullYear(),
    value: initial.getMonth() + 1,
  });
  const [selectingEnd, setSelectingEnd] = useState(false);
  const firstDay = new Date(
    calendarMonth.year,
    calendarMonth.value - 1,
    1,
  ).getDay();
  const days = new Date(calendarMonth.year, calendarMonth.value, 0).getDate();
  const cellCount = Math.ceil((firstDay + days) / 7) * 7;
  const cells = Array.from(
    { length: cellCount },
    (_, index) => index - firstDay + 1,
  );
  const move = (amount: number) => {
    const next = new Date(
      calendarMonth.year,
      calendarMonth.value - 1 + amount,
      1,
    );
    setCalendarMonth({ year: next.getFullYear(), value: next.getMonth() + 1 });
  };
  const choose = (key: string) => {
    if (!selectingEnd || key < start) {
      setStart(key);
      setEnd(key);
      setSelectingEnd(true);
    } else {
      setEnd(key);
      setSelectingEnd(false);
    }
  };
  const nights = Math.max(
    0,
    Math.round(
      (new Date(`${end}T00:00:00`).getTime() -
        new Date(`${start}T00:00:00`).getTime()) /
        86400000,
    ),
  );
  return (
    <View style={s.rangeField}>
      <Text style={[s.fieldLabel, { color: theme.muted }]}>기간</Text>
      <View style={s.rangeSummary}>
        <View>
          <Text style={[s.rangeSummaryLabel, { color: theme.primary }]}>
            {selectingEnd ? "마지막 날을 선택하세요" : "선택한 여행 기간"}
          </Text>
          <Text style={s.rangeSummaryValue}>
            {formatTripRange(start, end)}
          </Text>
        </View>
        <View style={s.rangeNights}>
          <Text style={s.rangeNightsText}>
            {nights ? `${nights}박` : "당일"}
          </Text>
        </View>
      </View>
      <View
        style={[
          s.rangeCalendar,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={s.rangeMonthHead}>
          <Pressable
            onPress={() => move(-1)}
            style={[
              s.rangeMonthButton,
              { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Glyph name="chevronLeft" size={20} color={theme.text} />
          </Pressable>
          <Text style={[s.rangeMonthTitle, { color: theme.text }]}>
            {calendarMonth.year}. {String(calendarMonth.value).padStart(2, "0")}
          </Text>
          <Pressable
            onPress={() => move(1)}
            style={[
              s.rangeMonthButton,
              { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Glyph name="chevronRight" size={20} color={theme.text} />
          </Pressable>
        </View>
        <View style={s.rangeWeek}>
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <Text
              key={day}
              style={[s.rangeWeekday, { color: theme.muted }]}
            >
              {day}
            </Text>
          ))}
        </View>
        <View style={s.rangeGrid}>
          {cells.map((day, index) => {
            const valid = day > 0 && day <= days;
            const key = valid
              ? `${calendarMonth.year}-${String(calendarMonth.value).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              : "";
            const edge = key === start || key === end;
            const inRange = valid && key >= start && key <= end;
            const startsRange = key === start;
            const endsRange = key === end;
            return (
              <Pressable
                key={`${index}-${day}`}
                disabled={!valid}
                onPress={() => choose(key)}
                style={s.rangeDay}
              >
                {inRange && (
                  <View
                    style={[
                      s.rangeDayBand,
                      { backgroundColor: theme.dark ? `${theme.secondary}28` : `${theme.secondary}1F` },
                      (index % 7 === 0 || startsRange) &&
                        s.rangeDayBandStart,
                      (index % 7 === 6 || endsRange) &&
                        s.rangeDayBandEnd,
                      startsRange && s.rangeDayBandFirst,
                      endsRange && s.rangeDayBandLast,
                    ]}
                  />
                )}
                {valid && (
                  <View style={[edge && s.rangeDayCircle, edge && { backgroundColor: theme.secondary }]}>
                    <Text
                      style={[
                        s.rangeDayText,
                        { color: theme.muted },
                        inRange && s.rangeDayTextActive,
                        inRange && { color: theme.dark ? theme.secondary : "#087D70" },
                        edge && s.rangeDayTextEdge,
                      ]}
                    >
                      {day}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
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
  const [recentQueries, setRecentQueries] = useState(["소나기식당", "충전기", "여수", "버섯전골"]);
  const [savedTitles, setSavedTitles] = useState(() => new Set(["소나기식당"]));
  const allResults = [
    {
      title: "소나기식당",
      type: "장소",
      trip: "전주 한옥마을",
      detail: "9월 23일 수요일 저녁 예약",
      tags: ["초밥", "디너", "예약"],
    },
    {
      title: "버섯전골",
      type: "요리",
      trip: "전주 한옥마을",
      detail: "재료 6개 · 여울 준비",
      tags: ["저녁", "주방"],
    },
    {
      title: "구름국수",
      type: "장소",
      trip: "강릉 안목",
      detail: "멸치국수 · 11시 영업",
      tags: ["식당", "점심"],
    },
    {
      title: "충전기",
      type: "준비",
      trip: "여수",
      detail: "아침에 챙길 것",
      tags: ["전자기기"],
    },
    {
      title: "여수 밤바다 불꽃",
      type: "일정",
      trip: "여수",
      detail: "7월 28일 화요일 · 돌산",
      tags: ["야경", "행사"],
    },
    {
      title: "육수 재료는 미리 준비하기",
      type: "기록",
      trip: "전주 한옥마을",
      detail: "함께 확인할 여행 메모",
      tags: ["요리", "메모"],
    },
  ];
  const searchableResults = useMemo(
    () =>
      allResults.filter(
        (item) =>
          trips.some((trip) => trip.name === item.trip) &&
          `${item.title} ${item.trip} ${item.detail} ${item.tags.join(" ")}`
            .toLocaleLowerCase("ko-KR")
            .includes(query.trim().toLocaleLowerCase("ko-KR")),
      ),
    [query, trips],
  );
  const results = searchableResults.filter(
    (item) => category === "전체" || item.type === category,
  );
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
            style={[
              s.searchClear,
              { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={s.searchClearText}>×</Text>
          </Pressable>
        )}
      </View>
      <View style={s.searchGuideHead}>
          <Text style={[s.searchGuideTitle, { color: theme.muted }]}>
            최근 검색
          </Text>
          {recentQueries.length > 0 && (
            <Pressable onPress={() => setRecentQueries([])} accessibilityRole="button">
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
          key={item.title}
          style={[
            s.searchResultCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            index === results.length - 1 && s.searchResultCardLast,
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
                    next.has(item.title) ? next.delete(item.title) : next.add(item.title);
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
                <Text style={[s.searchResultActionText, { color: "#03A94F" }]}>N 지도</Text>
              </Pressable>
            </View>
          )}
        </View>
        );
      })}
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
          <Pressable
            onPress={() => setPanel("account")}
            accessibilityRole="button"
            accessibilityLabel="내 프로필 열기"
            style={[s.togetherAccountButton, { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[s.togetherAccountInitial, { color: theme.primary }]}>{user.name.slice(0, 1)}</Text>
          </Pressable>
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
            <Text style={[s.workspaceMeta, { color: theme.muted }]}>{visibleMembers.length}명 · {relationship} · 여행 {trips.length}개</Text>
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
                {group.id === "ours" ? "우리" : group.id === "friends" ? "친구" : "가족"}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setPanel("groups")} style={s.groupTabMore}>
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
          <Pressable onPress={() => setPanel("members")}><Text style={[s.memberManageText, { color: theme.primary }]}>관리</Text></Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[s.memberStrip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          contentContainerStyle={s.memberStripContent}
        >
          {visibleMembers.map((member, index) => (
            <Pressable key={`${member}-${index}`} onPress={() => setPanel("members")} style={s.memberStripItem}>
              <View style={[s.memberStripAvatar, { backgroundColor: [theme.primary, theme.accent, theme.secondary][index % 3] }]}>
                <Text style={s.memberStripInitial}>{member.slice(0, 1)}</Text>
              </View>
              <Text numberOfLines={1} style={[s.memberStripName, { color: theme.text }]}>{index === 0 ? "나" : member}</Text>
              <Text numberOfLines={1} style={[s.memberStripRole, { color: theme.muted }]}>{memberRoles[index] ?? "편집 가능"}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => Share.share({ message: "Daymo에서 주말 여행 메이트를 함께 관리해요.\nhttps://daymo.app/invite/OUR-TRIP" })} style={s.memberStripItem}>
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
  submitDisabled?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const sheetKind = title.includes("여행")
    ? "여행"
    : title.includes("공간")
      ? "우리"
      : "Daymo";
  const sheetAccent = theme?.primary ?? "#FF6B63";
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
        <Pressable style={s.modalDismiss} onPress={onClose} />
        <View
          style={[
            s.sheet,
            theme && { backgroundColor: theme.background },
          ]}
        >
          <View style={s.sheetHandle} />
          <View
            style={[
              s.sheetHead,
              s.sheetHeadDecorated,
              { backgroundColor: `${sheetAccent}0B`, borderColor: `${sheetAccent}30` },
            ]}
          >
            <View style={s.sheetHeadMain}>
              <View style={s.sheetHeadCopy}>
                <View style={s.sheetKindRow}>
                  <View style={[s.sheetKindDot, { backgroundColor: sheetAccent }]} />
                  <Text style={[s.sheetKindText, { color: sheetAccent }]}>{sheetKind} 작성</Text>
                  <View style={[s.sheetRouteLine, { backgroundColor: `${sheetAccent}40` }]} />
                  <View style={[s.sheetRouteDot, { borderColor: sheetAccent }]} />
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
          <Pressable
            onPress={onSubmit}
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
            <Text style={s.sheetSubmitText}>{submit}</Text>
            <View style={s.sheetSubmitArrow}><Glyph name="arrowRight" size={15} color="#FFFFFF" /></View>
          </Pressable>
        </View>
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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.modalBack}>
        <Pressable style={s.modalDismiss} onPress={onClose} />
        <View
          style={[
            s.sheet,
            theme && { backgroundColor: theme.background },
          ]}
        >
          <View style={s.sheetHandle} />
          <View style={[s.sheetHead, s.infoSheetHead, theme && { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
            <View style={s.sheetHeadCopy}>
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
        </View>
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
        {selected && <Glyph name="check" size={16} color={theme?.primary ?? "#5D5FC7"} weight={2.4} />}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { flex: 1 },
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
    borderRadius: 54,
    backgroundColor: "rgba(255,249,244,.45)",
    right: -38,
    top: -28,
  },
  artDate: { position: "absolute", left: 11, bottom: 11 },
  artText: { color: "#623C38", fontSize: 14, fontFamily: typo.label.family },
  artUnit: { fontSize: 11, fontFamily: typo.label.family },
  artLine: { width: 25, height: 2, backgroundColor: "#623C38", marginTop: 4 },
  newTripText: { color: "#FFF9F4", fontSize: 12, fontFamily: typo.label.family },
  arrow: { color: "#A0665B", fontSize: 24, fontWeight: "300" },
  setting: {
    minHeight: 55,
    borderBottomWidth: 1,
    borderColor: "#F0E2DA",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  settingName: { color: "#6A4941", fontSize: 14, fontFamily: typo.title.family },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  settingValue: { color: "#B46F60", fontSize: 14, fontFamily: typo.data.family },
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
  paperTripActionMeta: { color: "#756F63", fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  paperTripActionUnderline: { position: "absolute", width: 34, height: 8, bottom: 11, borderRadius: 2, transform: [{ rotate: "-1deg" }] },
  scrapTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 24,
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
  homeEmptyTripActionText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.label.family },
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
    color: "#17233D",
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
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C7C7C3",
    alignSelf: "center",
    marginBottom: 20,
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
    color: "#17233D",
    fontSize: 24,
    fontFamily: typo.title.family,
    letterSpacing: -0.5,
  },
  sheetSubtitle: { fontSize: 11, marginTop: 4 },
  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetClose: { color: "#6556D8", fontSize: 24, lineHeight: 26, fontWeight: "500" },
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
    color: "#6F7888",
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
  sheetSubmitText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.label.family },
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
    color: "#556071",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  choiceSelected: { borderColor: "#8B7CF6", backgroundColor: "#E9E5FF" },
  choiceText: { color: "#576173", fontSize: 14, fontFamily: typo.label.family },
  choiceTextSelected: { color: "#5546C8" },
  choiceMark: { width: 16, alignItems: "center", justifyContent: "center" },
  tripExplorerPage: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  tripExplorerMapPage: { flex: 1 },
  tripExplorerMapHeader: { paddingHorizontal: 20, paddingTop: 8 },
  viewChoiceText: { color: "#858783", fontSize: 14, fontFamily: typo.label.family },
  viewChoiceTextActive: { color: "#FFFFFF" },
  mapOnly: { flex: 1, width: "100%", position: "relative", overflow: "hidden" },
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
  mapTrayTitle: { color: "#17233D", fontSize: 18, fontFamily: typo.title.family },
  mapTrayCount: { color: "#7D8987", fontSize: 14, marginTop: 2 },
  mapTrayClose: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#F0F3F2",
    alignItems: "center",
    justifyContent: "center",
  },
  mapTrayCloseText: { color: "#66716F", fontSize: 20, lineHeight: 21 },
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
  mapTrayName: { color: "#17233D", fontSize: 14, fontFamily: typo.title.family },
  mapTrayDate: { color: "#8A918F", fontSize: 11, marginTop: 4 },
  mapTrayArrow: { color: "#159D8D", fontSize: 20 },
  mapTrayEmpty: {
    color: "#8A918F",
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
  dayNumberTrip: { color: "#FFFFFF", fontFamily: typo.label.family },
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
    color: "#17233D",
    fontSize: 16,
    fontFamily: typo.caption.family,
    marginBottom: 4,
  },
  calendarResultClear: { fontSize: 12, fontFamily: typo.label.family },
  emptyDateTitle: { color: "#5E6D6B", fontSize: 14, fontFamily: typo.title.family },
  emptyDateAction: {
    color: "#0B9888",
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
    borderRadius: 20,
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
  searchClearText: { color: "#727A82", fontSize: 18, lineHeight: 20 },
  searchCategoryText: { color: "#747A80", fontSize: 12, fontFamily: typo.label.family },
  searchCategoryTextActive: { color: "#FFFFFF" },
  searchResultHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  searchResultTitle: { color: "#17233D", fontSize: 16, fontFamily: typo.title.family },
  searchResultLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  searchResultName: { color: "#273143", fontSize: 14, fontFamily: typo.title.family },
  searchResultType: { fontSize: 12, fontFamily: typo.label.family },
  searchResultDetail: { color: "#747D88", fontSize: 12, marginTop: 4 },
  searchResultTrip: { color: "#A0A5AB", fontSize: 12, marginTop: 2 },
  searchResultArrow: { color: "#9AA1A8", fontSize: 20 },
  searchEmptyTitle: { color: "#394353", fontSize: 18, fontFamily: typo.title.family },
  searchEmptyCopy: { color: "#959BA2", fontSize: 14, marginTop: 6 },
  togetherHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  togetherAvatarText: { color: "#FFFFFF", fontSize: 12, fontFamily: typo.label.family },
  settingGroupLabel: {
    color: "#7A818C",
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
  rangeField: { marginBottom: 16 },
  rangeSummary: {
    minHeight: 62,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: "#17233D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  rangeSummaryLabel: { color: "#5ED8C9", fontSize: 12, fontFamily: typo.label.family },
  rangeSummaryValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: typo.data.family,
    marginTop: 4,
  },
  rangeNights: {
    minWidth: 42,
    height: 30,
    borderRadius: 12,
    paddingHorizontal: 8,
    backgroundColor: "#263657",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeNightsText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.data.family },
  rangeCalendar: {
    marginTop: 8,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E5E1",
  },
  rangeMonthHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  rangeMonthButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#F0F1EE",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeMonthArrow: { color: "#17233D", fontSize: 20, lineHeight: 22 },
  rangeMonthTitle: { color: "#17233D", fontSize: 18, fontFamily: typo.title.family },
  rangeWeek: { flexDirection: "row", marginBottom: 2 },
  rangeWeekday: {
    width: "14.285%",
    color: "#969CA3",
    fontSize: 12,
    fontFamily: typo.label.family,
    textAlign: "center",
  },
  rangeGrid: { flexDirection: "row", flexWrap: "wrap" },
  rangeDay: {
    width: "14.285%",
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  rangeDayBand: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 26,
    top: 4,
    backgroundColor: "#E2F7F3",
  },
  rangeDayBandStart: { borderTopLeftRadius: 13, borderBottomLeftRadius: 13 },
  rangeDayBandEnd: { borderTopRightRadius: 13, borderBottomRightRadius: 13 },
  rangeDayBandFirst: { left: "50%" },
  rangeDayBandLast: { right: "50%" },
  rangeDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#19B6A3",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeDayText: {
    color: "#59616D",
    fontSize: 14,
    lineHeight: 17,
    fontFamily: typo.data.family,
    textAlign: "center",
  },
  rangeDayTextActive: { color: "#087D70", fontFamily: typo.label.family },
  rangeDayTextEdge: { color: "#FFFFFF" },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  themeSwatches: { flexDirection: "row", gap: 4 },
  themeSwatch: { width: 22, height: 22, borderRadius: 8 },
  themeOptionName: {
    color: "#17233D",
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
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  filter: { minHeight: 30, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, justifyContent: "center" },
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
  tripName: { fontSize: 14, fontFamily: typo.title.family },
  tripDate: { fontSize: 11, marginTop: 2 },
  tripNote: { fontSize: 14, marginTop: 2 },
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
  calendarTodayText: { color: "#596071", fontSize: 12, fontFamily: typo.label.family },
  monthArrowText: { color: "#384052", fontSize: 24, fontWeight: "500", lineHeight: 26 },
  calendarMonth: { color: "#283046", fontSize: 20, fontFamily: typo.data.family, textAlign: "left", letterSpacing: 0 },
  calendarSub: { color: "#7B7A76", fontSize: 11, textAlign: "left", marginTop: 2 },
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
  calendarLegendText: { color: "#6F716F", fontSize: 12, fontFamily: typo.label.family },
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
    height: 36,
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
  authError: { color: "#DF5148", fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  authSubmit: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  authSubmitDisabled: { opacity: 0.38 },
  authSubmitText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.label.family },
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
    borderRadius: 20,
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
    borderRadius: 10,
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
  workspaceMeta: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 4 },
  workspaceSwitchBadge: { height: 29, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  workspaceSwitchBadgeText: { fontSize: 12, fontFamily: typo.label.family },
  groupTabs: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  groupTab: {
    minWidth: 58,
    height: 32,
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
