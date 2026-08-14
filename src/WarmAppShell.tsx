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
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useColorScheme,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { TripDetailDestination, WarmTripDetail } from "./WarmTripDetail";
import { koreaAdminPath } from "./koreaAdminPath";
import { koreaLandPath, koreaOutlinePath } from "./koreaOutlinePath";
import {
  AppTheme,
  AppearanceMode,
  resolveTheme,
  ThemeId,
  themeOptions,
} from "./theme";

type MainView = "홈" | "여행" | "찾기" | "우리";
type DaymoUser = { name: string; email: string };

WebBrowser.maybeCompleteAuthSession();

type Trip = {
  name: string;
  date: string;
  note: string;
  color: string;
  mark: string;
  region: string;
  start: string;
  end: string;
};
type GroupId = "ours" | "friends" | "family";
const trips: Trip[] = [
  {
    name: "서울 구로구",
    date: "8월 21일 — 23일",
    note: "숙소에서 수다와 밀푀유나베",
    color: "#FF6B5F",
    mark: "08",
    region: "서울",
    start: "2026-08-21",
    end: "2026-08-23",
  },
  {
    name: "안양 평촌",
    date: "8월 1일 — 2일",
    note: "보드게임과 야식 장보기",
    color: "#8B7CF6",
    mark: "08",
    region: "경기",
    start: "2026-08-01",
    end: "2026-08-02",
  },
  {
    name: "부산",
    date: "7월 24일 — 26일",
    note: "바다 산책과 단체 사진",
    color: "#19B6A3",
    mark: "07",
    region: "부산",
    start: "2026-07-24",
    end: "2026-07-26",
  },
];
const initialTripsByGroup: Record<GroupId, Trip[]> = {
  ours: [trips[0]],
  friends: trips,
  family: [
    {
      name: "경주",
      date: "10월 3일 — 4일",
      note: "가족과 천천히 걷는 가을 여행",
      color: "#F0A351",
      mark: "10",
      region: "경북",
      start: "2026-10-03",
      end: "2026-10-04",
    },
  ],
};

export function WarmAppShell() {
  const systemScheme = useColorScheme();
  const [view, setView] = useState<MainView>("홈");
  const [isTripOpen, setTripOpen] = useState(false);
  const [tripDestination, setTripDestination] =
    useState<TripDetailDestination>("overview");
  const [done, setDone] = useState<string[]>(["깻잎", "양파"]);
  const [activeGroupId, setActiveGroupId] = useState<GroupId>("friends");
  const [tripsByGroup, setTripsByGroup] = useState(initialTripsByGroup);
  const tripItems = tripsByGroup[activeGroupId];
  const setTripItems: React.Dispatch<React.SetStateAction<Trip[]>> = (update) =>
    setTripsByGroup((current) => ({
      ...current,
      [activeGroupId]:
        typeof update === "function" ? update(current[activeGroupId]) : update,
    }));
  const [selectedTrip, setSelectedTrip] = useState<Trip>(trips[0]);
  const [themeId, setThemeId] = useState<ThemeId>("daymo");
  const [appearance, setAppearance] = useState<AppearanceMode>("system");
  const [user, setUser] = useState<DaymoUser | null>({
    name: "하늘",
    email: "sky@daymo.app",
  });
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
        appTheme={theme}
        onClose={() => setTripOpen(false)}
      />
    );
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <PaperBackdrop theme={theme} />
      <View style={[s.body, { backgroundColor: "transparent" }]}>
        {view === "홈" && (
          <NotebookHome
            open={openTrip}
            goTrips={() => setView("여행")}
            theme={theme}
            trip={tripItems[0] ?? trips[0]}
            relationship={activeGroupId === "ours" ? "연인" : "친구"}
          />
        )}
        {view === "여행" && (
          <TripsExplorer
            open={(trip) => openTrip("overview", trip)}
            theme={theme}
            items={tripItems}
            setItems={setTripItems}
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
            setActiveGroupId={setActiveGroupId}
            user={user}
            setUser={setUser}
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
  const oauthBaseUrl = process.env.EXPO_PUBLIC_DAYMO_AUTH_URL?.replace(/\/$/, "");
  const authFormValid =
    email.trim().includes("@") &&
    password.length >= 6 &&
    (mode === "login" || (Boolean(name.trim()) && password === confirm));
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
      <PaperBackdrop theme={theme} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={(s as any).authPage}
      >
        <View style={(s as any).authBrand}>
          <View style={[(s as any).authAppIconFrame, { borderColor: theme.border }]}>
            <Image
              source={require("../assets/daymo-icon-login.png")}
              resizeMode="contain"
              style={(s as any).authAppIcon}
            />
          </View>
          <Text style={[(s as any).authLogo, { color: theme.text }]}>Daymo</Text>
          <Text style={[(s as any).authTagline, { color: theme.muted }]}>함께 떠나고, 오래 기억하는 여행</Text>
        </View>
        <View style={[(s as any).authCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[(s as any).authTitle, { color: theme.text }]}>{mode === "login" ? "다시 만나서 반가워요" : "우리의 여행을 시작해요"}</Text>
          <Text style={[(s as any).authDescription, { color: theme.muted }]}>{mode === "login" ? "Daymo에 로그인해 여행을 이어가세요." : "계정을 만들고 여행 공간에 멤버를 초대하세요."}</Text>
          {mode === "signup" && (
            <Field theme={theme} label="이름 또는 별명 · 필수" value={name} onChangeText={setName} placeholder="예: 하늘" autoCapitalize="none" />
          )}
          <Field theme={theme} label="이메일 · 필수" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field theme={theme} label="비밀번호 · 필수" value={password} onChangeText={setPassword} placeholder="6자 이상 입력" secureTextEntry />
          {mode === "signup" && (
            <Field theme={theme} label="비밀번호 확인 · 필수" value={confirm} onChangeText={setConfirm} placeholder="한 번 더 입력" secureTextEntry />
          )}
          {error ? <Text style={(s as any).authError}>{error}</Text> : null}
          <Pressable
            onPress={submit}
            disabled={!authFormValid}
            accessibilityRole="button"
            accessibilityState={{ disabled: !authFormValid }}
            style={[(s as any).authSubmit, { backgroundColor: theme.primary }, !authFormValid && (s as any).authSubmitDisabled]}
          >
            <Text style={(s as any).authSubmitText}>{mode === "login" ? "로그인" : "회원가입"}</Text>
          </Pressable>
          <View style={(s as any).authDivider}>
            <View style={[(s as any).authDividerLine, { backgroundColor: theme.border }]} />
            <Text style={[(s as any).authDividerText, { color: theme.muted }]}>또는 소셜 계정으로</Text>
            <View style={[(s as any).authDividerLine, { backgroundColor: theme.border }]} />
          </View>
          <View style={(s as any).oauthGrid}>
            {[
              { id: "kakao", label: "카카오", mark: "K", color: "#FEE500", text: "#241F10" },
              { id: "naver", label: "네이버", mark: "N", color: "#03C75A", text: "#FFFFFF" },
              { id: "google", label: "Google", mark: "G", color: "#FFFFFF", text: "#4285F4" },
              { id: "apple", label: "Apple", mark: "●", color: theme.dark ? "#FFFFFF" : "#111111", text: theme.dark ? "#111111" : "#FFFFFF" },
            ].map((provider) => (
              <Pressable
                key={provider.id}
                disabled={oauthLoading !== null}
                onPress={() => startOAuth(provider.id as "google" | "apple" | "kakao" | "naver")}
                accessibilityRole="button"
                accessibilityLabel={`${provider.label} 계정으로 로그인`}
                accessibilityState={{ disabled: oauthLoading !== null }}
                style={[(s as any).oauthButton, { backgroundColor: provider.color, borderColor: provider.id === "google" ? theme.border : provider.color }]}
              >
                <Text style={[(s as any).oauthMark, { color: provider.text }]}>{provider.mark}</Text>
                <Text style={[(s as any).oauthLabel, { color: provider.text }]}>{oauthLoading === provider.id ? "연결 중" : provider.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={switchMode} style={(s as any).authSwitch}>
            <Text style={[(s as any).authSwitchText, { color: theme.muted }]}>{mode === "login" ? "처음이신가요? " : "이미 계정이 있나요? "}<Text style={{ color: theme.primary, fontWeight: "900" }}>{mode === "login" ? "회원가입" : "로그인"}</Text></Text>
          </Pressable>
        </View>
        <Text style={[(s as any).authPrivacy, { color: theme.muted }]}>계속하면 Daymo 이용약관과 개인정보 처리방침에 동의하게 됩니다.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PaperBackdrop({ theme }: { theme: AppTheme }) {
  return (
    <View pointerEvents="none" style={(s as any).paperBackdrop}>
      {[92, 178, 264, 350, 436, 522, 608, 694, 780].map((top) => (
        <View
          key={top}
          style={[
            (s as any).paperLine,
            { top, backgroundColor: theme.dark ? "#202A3B" : "#EDE9E1" },
          ]}
        />
      ))}
      <View
        style={[
          (s as any).paperMargin,
          { backgroundColor: `${theme.primary}18` },
        ]}
      />
      <View
        style={[
          (s as any).paperSpeck,
          { top: 115, right: 24, backgroundColor: `${theme.secondary}35` },
        ]}
      />
      <View
        style={[
          (s as any).paperSpeck,
          { top: 545, left: 18, backgroundColor: `${theme.accent}30` },
        ]}
      />
    </View>
  );
}

function NotebookHome({
  open,
  goTrips,
  theme,
  trip,
  relationship,
}: {
  open: (destination?: TripDetailDestination, trip?: Trip) => void;
  goTrips: () => void;
  theme: AppTheme;
  trip: Trip;
  relationship: "연인" | "친구";
}) {
  return (
    <ScrollView
      style={{ backgroundColor: "transparent" }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.page}
    >
      <View style={(s as any).notebookHead}>
        <View>
          <Text style={[s.logo, { color: theme.text }]}>Daymo</Text>
          <Text style={[(s as any).notebookHello, { color: theme.muted }]}>
            우리의 여행 수첩
          </Text>
        </View>
        <View
          style={[(s as any).tinyDay, { backgroundColor: theme.primarySoft }]}
        >
          <Text style={[(s as any).tinyDayText, { color: theme.primary }]}>
            {relationship === "연인" ? "우리 1,026일" : "함께한 여행"}
          </Text>
        </View>
      </View>
      <View style={(s as any).paperTripStack}>
        <View style={[(s as any).paperTripBack, (s as any).paperTripBackLeft, { backgroundColor: theme.dark ? "#746D5B" : "#E7DECA" }]} />
        <View style={[(s as any).paperTripBack, (s as any).paperTripBackRight, { backgroundColor: theme.dark ? "#575B60" : "#DDE5E3" }]} />
        <View
          style={[
            (s as any).paperTrip,
            { backgroundColor: "#FFFEFC", borderColor: theme.dark ? "#BFC4CB" : "#D9D9D5" },
          ]}
        >
        <View pointerEvents="none" style={(s as any).paperTripTexture}>
          {[63, 113, 163, 213].map((top) => (
            <View key={top} style={[(s as any).paperTripSoftLine, { top }]} />
          ))}
          <View
            style={[
              (s as any).paperTripMargin,
              { backgroundColor: `${theme.primary}24` },
            ]}
          />
        </View>
        <View
          style={(s as any).paperTape}
        />
        <View pointerEvents="none" style={(s as any).paperTripRoute}>
          <Svg width="100%" height="100%" viewBox="0 0 112 42">
            <Path
              d="M4 29C28 7 54 39 84 17"
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
            (s as any).paperTripMain,
            pressed && (s as any).pressed,
          ]}
        >
        <View style={(s as any).paperTripHead}>
          <View style={(s as any).paperTripCopy}>
            <Text style={[(s as any).paperKicker, { color: theme.primary }]}>
              다음 여행
            </Text>
            <Text style={[(s as any).paperTitle, { color: "#283046" }]}>
              {trip.name}
            </Text>
            <Text style={[(s as any).paperDate, { color: "#756F63" }]}>
              {trip.date}
            </Text>
          </View>
          <View
            style={[
              (s as any).paperTripStamp,
              {
                backgroundColor: "transparent",
                borderColor: "#B8AD93",
              },
            ]}
          >
            <Text style={[(s as any).paperTripStampMonth, { color: theme.primary }]}>{Number(trip.start.slice(5, 7))}월</Text>
            <Text style={[(s as any).paperTripStampDay, { color: "#283046" }]}>{trip.start.slice(-2)}</Text>
            <View style={[(s as any).paperTripStampRule, { backgroundColor: theme.primary }]} />
          </View>
        </View>
        <View style={[(s as any).paperRule, { borderColor: "#BEB49D" }]} />
        <View
          style={[
            (s as any).paperStayBoard,
            {
              backgroundColor: "transparent",
              borderColor: "transparent",
            },
          ]}
        >
          <View style={(s as any).paperStay}>
            <View
              style={[
                (s as any).paperStayIcon,
                {
                  backgroundColor: "transparent",
                  borderColor: "#C7BDA5",
                },
              ]}
            >
              <Svg width={22} height={22} viewBox="0 0 22 22">
                <Path
                  d="M4 19V7.5L11 3l7 4.5V19M7.5 19v-5h7v5M8 9h1M13 9h1"
                  fill="none"
                  stroke="#358D82"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[(s as any).paperStayLabel, { color: "#358D82" }]}>숙소</Text>
              <Text numberOfLines={1} style={[(s as any).paperStayName, { color: "#283046" }]}>JS호텔</Text>
            </View>
            <View
              style={[
                (s as any).paperStayTime,
                {
                  backgroundColor: "transparent",
                  borderColor: "#C7BDA5",
                },
              ]}
            >
              <Text style={[(s as any).paperStayTimeLabel, { color: "#756F63" }]}>체크인</Text>
              <Text style={[(s as any).paperStayTimeValue, { color: theme.primary }]}>15:00</Text>
            </View>
          </View>
        </View>
        </Pressable>
        <View style={(s as any).paperTripActions}>
          {[
            { label: "일정 추가", meta: "3개", color: theme.primary, destination: "schedule-add" as TripDetailDestination },
            { label: "저장 장소", meta: "8곳", color: "#358D82", destination: "places" as TripDetailDestination },
            { label: "준비물", meta: "2 / 6", color: "#7564B5", destination: "preparation" as TripDetailDestination },
          ].map((item, index) => (
            <Pressable
              key={item.label}
              onPress={() => open(item.destination, trip)}
              style={({ pressed }) => [
                (s as any).paperTripAction,
                index > 0 && (s as any).paperTripActionBorder,
                pressed && (s as any).pressed,
              ]}
            >
              <Text style={[(s as any).paperTripActionLabel, { color: item.color }]}>{item.label}</Text>
              <Text style={(s as any).paperTripActionMeta}>{item.meta}</Text>
              <View style={[(s as any).paperTripActionUnderline, { backgroundColor: `${item.color}38` }]} />
            </Pressable>
          ))}
        </View>
        <View pointerEvents="none" style={(s as any).paperTripCornerShadow} />
        <View pointerEvents="none" style={(s as any).paperTripCorner} />
        </View>
      </View>
      <View style={(s as any).scrapTitleRow}>
        <View>
          <Text style={[(s as any).noteTitleSmall, { color: theme.primary }]}>우리의 체크리스트</Text>
          <Text style={[(s as any).noteTitle, { color: theme.text }]}>출발 전, 이것만</Text>
        </View>
        <Pressable onPress={() => open("overview", trip)}>
          <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "700" }}>전체 보기</Text>
        </Pressable>
      </View>
      <View
        style={[
          (s as any).memoPaper,
          {
            backgroundColor: theme.dark ? theme.surface : "rgba(255,255,255,.72)",
            borderColor: theme.border,
          },
        ]}
      >
        <View pointerEvents="none" style={[(s as any).memoPaperSpine, { backgroundColor: `${theme.primary}42` }]} />
        <MemoRow theme={theme} color={theme.primary} text="숙소 예약 정보 확인" meta="오늘 · 공용" onPress={() => open("overview", trip)} />
        <MemoRow theme={theme} color={theme.accent} text="아직 안 챙긴 준비물 2개" meta="하늘 1 · 여울 1" onPress={() => open("preparation", trip)} />
        <MemoRow theme={theme} color={theme.secondary} text="저장한 장소에서 일정 고르기" meta="식당 5 · 카페 3" onPress={() => open("places", trip)} last />
      </View>
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
        (s as any).memoRow,
        { borderColor: theme.border },
        last && (s as any).memoRowLast,
      ]}
    >
      <View
        style={[
          (s as any).memoCheck,
          {
            borderColor: color,
            backgroundColor: `${color}${theme.dark ? "20" : "0D"}`,
          },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={[(s as any).memoText, { color: theme.text }]}>{text}</Text>
        <Text style={[(s as any).memoMeta, { color: theme.muted }]}>
          {meta}
        </Text>
      </View>
      <Text style={{ color: theme.muted }}>›</Text>
    </Pressable>
  );
}

function Home({
  open,
  goTrips,
  theme,
}: {
  open: (destination?: TripDetailDestination) => void;
  goTrips: () => void;
  theme: AppTheme;
}) {
  return (
    <ScrollView
      style={{ backgroundColor: "transparent" }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.page}
    >
      <View style={s.homeTop}>
        <View>
          <Text style={[s.logo, { color: theme.text }]}>Daymo</Text>
          <Text style={[(s as any).logoSub, { color: theme.muted }]}>
            TOGETHER, ANYWHERE
          </Text>
        </View>
        <View style={(s as any).profileGroup}>
          <View
            style={[
              (s as any).dayBadge,
              {
                backgroundColor: theme.primarySoft,
                borderColor: theme.primary,
              },
            ]}
          >
            <View
              style={[
                (s as any).dayBadgeDot,
                { backgroundColor: theme.primary },
              ]}
            />
            <Text style={[(s as any).dayBadgeText, { color: theme.primary }]}>
              D+1,026
            </Text>
          </View>
          <View
            style={[
              s.people,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[s.peopleText, { color: theme.accent }]}>우리</Text>
          </View>
        </View>
      </View>
      <View style={(s as any).homeLead}>
        <View>
          <Text style={[(s as any).homeLeadLabel, { color: theme.primary }]}>
            다음 여행 · D−12
          </Text>
          <Text style={[(s as any).homeLeadTitle, { color: theme.text }]}>
            서울 구로구
          </Text>
          <Text style={[(s as any).homeLeadDate, { color: theme.muted }]}>
            8.21 금 — 8.23 일 · 2박 3일
          </Text>
        </View>
        <Pressable
          onPress={goTrips}
          style={[
            (s as any).homeAllTrips,
            { backgroundColor: theme.primarySoft },
          ]}
        >
          <Text style={[(s as any).homeAllTripsText, { color: theme.primary }]}>
            전체 여행
          </Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() => open()}
        style={[(s as any).homeTripCard, { backgroundColor: theme.navigation }]}
      >
        <View style={(s as any).homeTripTop}>
          <View>
            <Text
              style={[(s as any).homeStayLabel, { color: theme.secondary }]}
            >
              숙소
            </Text>
            <Text style={(s as any).homeStayName}>JS호텔</Text>
            <Text style={(s as any).homeStayMeta}>체크인 15:00 · 구로구</Text>
          </View>
          <View style={(s as any).homeTripArrow}>
            <Text style={(s as any).homeTripArrowText}>›</Text>
          </View>
        </View>
        <View style={(s as any).homeProgressRow}>
          <HomeMetric value="3" label="일정" color={theme.primary} />
          <HomeMetric value="8" label="장소" color={theme.secondary} />
          <HomeMetric value="2/6" label="준비" color={theme.accent} />
        </View>
      </Pressable>
      <View style={(s as any).homeQuickRow}>
        <HomeQuick
          theme={theme}
          icon="＋"
          label="일정 추가"
          tint={theme.primarySoft}
          color={theme.primary}
          onPress={() => open("schedule-add")}
        />
        <HomeQuick
          theme={theme}
          icon="⌖"
          label="장소 보기"
          tint={`${theme.secondary}20`}
          color={theme.secondary}
          onPress={() => open("places")}
        />
        <HomeQuick
          theme={theme}
          icon="✓"
          label="준비 체크"
          tint={`${theme.accent}20`}
          color={theme.accent}
          onPress={() => open("preparation")}
        />
      </View>
      <View style={(s as any).homeSectionHead}>
        <View>
          <Text
            style={[(s as any).homeSectionEyebrow, { color: theme.accent }]}
          >
            이번 여행 할 일
          </Text>
          <Text style={[(s as any).homeSectionTitle, { color: theme.text }]}>
            출발 전에 확인해요
          </Text>
        </View>
        <Pressable onPress={() => open()}>
          <Text
            style={[(s as any).homeSectionAction, { color: theme.primary }]}
          >
            모두 보기 ›
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          (s as any).homeActionCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Pressable
          onPress={() => open()}
          style={[(s as any).homeActionRow, { borderColor: theme.border }]}
        >
          <View
            style={[
              (s as any).homeActionIcon,
              { backgroundColor: theme.primarySoft },
            ]}
          >
            <Text style={{ color: theme.primary, fontWeight: "900" }}>!</Text>
          </View>
          <View style={(s as any).homeActionCopy}>
            <Text style={[(s as any).homeActionTitle, { color: theme.text }]}>
              숙소 예약 정보 확인
            </Text>
            <Text style={[(s as any).homeActionMeta, { color: theme.muted }]}>
              함께 · 예약
            </Text>
          </View>
          <Text style={[(s as any).homeActionDue, { color: theme.secondary }]}>
            오늘
          </Text>
        </Pressable>
        <Pressable
          onPress={() => open("preparation")}
          style={[(s as any).homeActionRow, { borderColor: theme.border }]}
        >
          <View
            style={[
              (s as any).homeActionIcon,
              { backgroundColor: `${theme.accent}20` },
            ]}
          >
            <Text style={{ color: theme.accent, fontWeight: "900" }}>2</Text>
          </View>
          <View style={(s as any).homeActionCopy}>
            <Text style={[(s as any).homeActionTitle, { color: theme.text }]}>
              아직 안 챙긴 준비물
            </Text>
            <Text style={[(s as any).homeActionMeta, { color: theme.muted }]}>
              하늘 1 · 여울 1
            </Text>
          </View>
          <Text style={[(s as any).homeActionDue, { color: theme.secondary }]}>
            확인
          </Text>
        </Pressable>
        <Pressable
          onPress={() => open("places")}
          style={[(s as any).homeActionRow, (s as any).homeActionRowLast]}
        >
          <View
            style={[
              (s as any).homeActionIcon,
              { backgroundColor: `${theme.secondary}20` },
            ]}
          >
            <Text style={{ color: theme.secondary, fontWeight: "900" }}>8</Text>
          </View>
          <View style={(s as any).homeActionCopy}>
            <Text style={[(s as any).homeActionTitle, { color: theme.text }]}>
              저장한 장소에서 일정 고르기
            </Text>
            <Text style={[(s as any).homeActionMeta, { color: theme.muted }]}>
              식당 5 · 카페 3
            </Text>
          </View>
          <Text style={[(s as any).homeActionDue, { color: theme.secondary }]}>
            보기
          </Text>
        </Pressable>
      </View>
    </ScrollView>
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
    <View style={(s as any).homeMetric}>
      <Text style={[(s as any).homeMetricValue, { color }]}>{value}</Text>
      <Text style={(s as any).homeMetricLabel}>{label}</Text>
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
        (s as any).homeQuick,
        embedded && (s as any).homeQuickEmbedded,
        layout === "large" && (s as any).homeQuickLarge,
        layout === "small" && (s as any).homeQuickSmall,
        layout === "rail" && (s as any).homeQuickRail,
        {
          backgroundColor: embedded ? tint : theme.surface,
          borderColor: embedded ? `${color}${theme.dark ? "65" : "3D"}` : theme.border,
        },
      ]}
    >
      <View
        style={[
          (s as any).homeQuickIcon,
          { backgroundColor: tint, borderColor: embedded ? color : "transparent" },
          embedded && (s as any).homeQuickIconEmbedded,
          layout === "large" && (s as any).homeQuickIconLarge,
          layout === "rail" && (s as any).homeQuickIconRail,
        ]}
      >
        {embedded ? (
          <Svg width={18} height={18} viewBox="0 0 22 22">
            <Path
              d={
                label === "일정 추가"
                  ? "M11 4v14M4 11h14"
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
          <Text style={[(s as any).homeQuickIconText, { color }]}>{icon}</Text>
        )}
      </View>
      <Text
        style={[
          (s as any).homeQuickLabel,
          embedded && (s as any).homeQuickLabelEmbedded,
          layout === "large" && (s as any).homeQuickLabelLarge,
          layout === "rail" && (s as any).homeQuickLabelRail,
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
}: {
  open: (trip: Trip) => void;
  theme: AppTheme;
  items: Trip[];
  setItems: React.Dispatch<React.SetStateAction<Trip[]>>;
}) {
  const [display, setDisplay] = useState<TripView>("목록");
  const [filter, setFilter] = useState<"전체" | "예정" | "추억">("전체");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [month, setMonth] = useState({ year: 2026, value: 8 });
  const [creating, setCreating] = useState(false);
  const [place, setPlace] = useState("");
  const [tripStart, setTripStart] = useState("2026-09-12");
  const [tripEnd, setTripEnd] = useState("2026-09-14");
  const [note, setNote] = useState("새 여행");
  const [newRegion, setNewRegion] = useState("서울");
  const [showAllRegions, setShowAllRegions] = useState(false);
  const filtered =
    filter === "예정"
      ? items.filter((trip) => trip.start >= new Date().toISOString().slice(0, 10))
      : filter === "추억"
        ? items.filter((trip) => trip.start < new Date().toISOString().slice(0, 10))
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
  const addTrip = () => {
    if (!place.trim()) return;
    const range = formatTripRange(tripStart, tripEnd);
    setItems((current) => [
      {
        name: place.trim(),
        date: range,
        note,
        color: "#19B6A3",
        mark: tripStart.slice(5, 7),
        region: newRegion,
        start: tripStart,
        end: tripEnd,
      },
      ...current,
    ]);
    setPlace("");
    setCreating(false);
    setShowAllRegions(false);
    setSelectedRegion(null);
    setDisplay("목록");
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
            pressed && (s as any).pressed,
          ]}
        >
          <Text style={s.newTripText}>＋ 새 여행</Text>
        </Pressable>
      </View>
      <View
        style={[
          (s as any).viewSwitch,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {(["목록", "지도", "캘린더"] as TripView[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => setDisplay(item)}
            style={[
              (s as any).viewChoice,
              display === item && (s as any).viewChoiceActive,
              display === item && {
                backgroundColor: theme.primarySoft,
                borderColor: theme.primary,
              },
            ]}
          >
            <Text
              style={[
                (s as any).viewChoiceText,
                { color: theme.muted },
                display === item && (s as any).viewChoiceTextActive,
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
            (s as any).tripExplorerMapPage,
            { backgroundColor: theme.background },
          ]}
        >
          <View style={(s as any).tripExplorerMapHeader}>{explorerHead}</View>
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
          contentContainerStyle={(s as any).tripExplorerPage}
          showsVerticalScrollIndicator={false}
        >
          {explorerHead}
          {display === "목록" && (
            <>
              <View
                style={[s.tripFilters, { backgroundColor: theme.surfaceAlt }]}
              >
                {(["전체", "예정", "추억"] as const).map((item) => (
                  <Pressable key={item} onPress={() => setFilter(item)}>
                    <Text
                      style={[
                        s.filter,
                        { color: theme.muted },
                        filter === item && s.filterActive,
                        filter === item && {
                          backgroundColor: theme.surface,
                          color: theme.text,
                        },
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
            <View style={(s as any).calendarResults}>
              <Text
                style={[(s as any).calendarResultDate, { color: theme.text }]}
              >
                {Number(selectedDate.slice(-2))}일의 여행
              </Text>
              {dateTrips.length ? (
                <TripRows items={dateTrips} open={open} compact theme={theme} />
              ) : (
                <View
                  style={[
                    (s as any).emptyDate,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[(s as any).emptyDateTitle, { color: theme.muted }]}
                  >
                    이날은 아직 여행이 없어요
                  </Text>
                  <Pressable onPress={createFromDate}>
                    <Text
                      style={[
                        (s as any).emptyDateAction,
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
        submit={place.trim() ? "여행 만들기" : "여행지를 입력해 주세요"}
        submitDisabled={!place.trim()}
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
        <Text style={[(s as any).fieldLabel, { color: theme.muted }]}>
          지역
        </Text>
        <View style={(s as any).regionChoices}>
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
                  (s as any).regionChoice,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  newRegion === pin.name && (s as any).regionChoiceActive,
                  newRegion === pin.name && {
                    backgroundColor: theme.primarySoft,
                    borderColor: theme.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    (s as any).regionChoiceText,
                    { color: theme.muted },
                    newRegion === pin.name && (s as any).regionChoiceTextActive,
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
              (s as any).regionChoice,
              (s as any).regionMoreChoice,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[(s as any).regionChoiceText, { color: theme.primary }]}>{showAllRegions ? "간단히 보기" : "전체 지역 +"}</Text>
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
          (s as any).noTrips,
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
        <Text style={[(s as any).noTripsTitle, { color: theme.text }]}>아직 이곳에 여행이 없어요</Text>
        <Text style={[(s as any).noTripsText, { color: theme.muted }]}>다른 분류를 보거나 새로운 여행을 만들어 보세요.</Text>
        {emptyAction && (
          <Pressable
            onPress={emptyAction}
            style={[(s as any).emptyInlineAction, { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[(s as any).emptyInlineActionText, { color: theme.primary }]}>
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
            compact && (s as any).tripRowCompact,
            pressed && (s as any).pressed,
          ]}
        >
          <View style={[(s as any).tripRowAccent, { backgroundColor: trip.color }]} />
          <View style={(s as any).tripThumb}>
            <TripArt color={trip.color} date={trip.mark} small />
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
              (s as any).tripRowArrow,
              { backgroundColor: theme.primarySoft },
            ]}
          >
            <Text style={[(s as any).tripRowArrowText, { color: theme.primary }]}>›</Text>
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
  const centerRef = useRef(center);
  centerRef.current = center;
  const dragStart = useRef(center);
  const lastWheel = useRef(0);
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
  const changeZoom = (
    amount: number,
    focus = { x: size.width / 2, y: size.height / 2 },
  ) => {
    const nextZoom = Math.max(
      1,
      Math.min(MAP_MAX_ZOOM, Math.round((zoom + amount) * 2) / 2),
    );
    if (nextZoom === zoom) return;
    const mapX = boxX + (focus.x - mapOffsetX) / mapScale;
    const mapY = boxY + (focus.y - mapOffsetY) / mapScale;
    const nextWidth = 300 / nextZoom;
    const nextHeight = 420 / nextZoom;
    const nextScale = Math.min(
      size.width / nextWidth,
      size.height / nextHeight,
    );
    const nextOffsetX = (size.width - nextWidth * nextScale) / 2;
    const nextOffsetY = (size.height - nextHeight * nextScale) / 2;
    setCenter(
      clampCenter(
        {
          x: mapX - (focus.x - nextOffsetX) / nextScale + nextWidth / 2,
          y: mapY - (focus.y - nextOffsetY) / nextScale + nextHeight / 2,
        },
        nextZoom,
      ),
    );
    setZoom(nextZoom);
  };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          zoom > 1 && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          dragStart.current = centerRef.current;
        },
        onPanResponderMove: (_, gesture) =>
          setCenter(
            clampCenter(
              {
                x: dragStart.current.x - gesture.dx / mapScale,
                y: dragStart.current.y - gesture.dy / mapScale,
              },
              zoom,
            ),
          ),
      }),
    [mapScale, zoom],
  );
  const webWheel =
    Platform.OS === "web"
      ? {
          onWheel: (event: {
            preventDefault?: () => void;
            nativeEvent?: {
              deltaY?: number;
              locationX?: number;
              locationY?: number;
            };
            deltaY?: number;
          }) => {
            event.preventDefault?.();
            const now = Date.now();
            if (now - lastWheel.current < 120) return;
            lastWheel.current = now;
            const native = event.nativeEvent;
            changeZoom((native?.deltaY ?? event.deltaY ?? 0) < 0 ? 0.5 : -0.5, {
              x: native?.locationX ?? size.width / 2,
              y: native?.locationY ?? size.height / 2,
            });
          },
        }
      : {};
  const cityPath: string | null =
    zoom >= 2 ? require("./koreaCityPath").koreaCityPath : null;
  return (
    <View
      {...(webWheel as any)}
      style={(s as any).mapOnly}
      onLayout={(event) => setSize(event.nativeEvent.layout)}
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
        {zoom >= 2 && (
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
      <View {...panResponder.panHandlers} style={(s as any).mapDragLayer} />
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
                setCenter(clampCenter({ x: pin.x, y: pin.y }, zoom));
              onSelect(pin.name);
            }}
            style={[
              (s as any).mapPin,
              { left, top },
              theme.dark && { backgroundColor: theme.surface, borderColor: theme.secondary },
              count > 0 && (s as any).mapPinVisited,
              active && (s as any).mapPinActive,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                (s as any).mapPinText,
                theme.dark && { color: theme.secondary },
                (count > 0 || active) && (s as any).mapPinTextVisited,
              ]}
            >
              {pin.name}
            </Text>
            {count > 0 && (
              <View style={(s as any).pinCount}>
                <Text style={(s as any).pinCountText}>{count}</Text>
              </View>
            )}
          </Pressable>
        ) : null;
      })}
      {selected && (
        <View
          style={[
            (s as any).mapTray,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={[(s as any).mapTrayHandle, { backgroundColor: theme.border }]} />
          <View style={(s as any).mapTrayHead}>
            <View>
              <Text style={[(s as any).mapTrayTitle, { color: theme.text }]}>{selected} 여행</Text>
              <Text style={[(s as any).mapTrayCount, { color: theme.muted }]}>
                {results.length
                  ? `${results.length}개의 여행`
                  : "아직 등록된 여행이 없어요"}
              </Text>
            </View>
            <Pressable
              onPress={() => onSelect(selected)}
              style={[(s as any).mapTrayClose, { backgroundColor: theme.surfaceAlt }]}
            >
              <Text style={[(s as any).mapTrayCloseText, { color: theme.muted }]}>×</Text>
            </Pressable>
          </View>
          {results.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={(s as any).mapTrayList}
            >
              {results.map((trip, index) => (
                <Pressable
                  key={`${trip.name}-${index}`}
                  onPress={() => open(trip)}
                  style={[(s as any).mapTrayCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                >
                  <View
                    style={[
                      (s as any).mapTrayMark,
                      { backgroundColor: trip.color },
                    ]}
                  >
                    <Text style={(s as any).mapTrayMarkText}>{trip.mark}</Text>
                  </View>
                  <View style={(s as any).mapTrayCopy}>
                    <Text numberOfLines={1} style={[(s as any).mapTrayName, { color: theme.text }]}>
                      {trip.name}
                    </Text>
                    <Text numberOfLines={1} style={[(s as any).mapTrayDate, { color: theme.muted }]}>
                      {trip.date}
                    </Text>
                  </View>
                  <Text style={[(s as any).mapTrayArrow, { color: theme.secondary }]}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={[(s as any).mapTrayEmpty, { color: theme.muted }]}>
              이 지역에는 아직 여행이 없어요. 다른 지역을 선택해 보세요.
            </Text>
          )}
        </View>
      )}
      <View
        style={[
          (s as any).zoomControls,
          { backgroundColor: theme.surface, borderColor: theme.border },
          selected && (s as any).zoomControlsRaised,
        ]}
      >
        <Pressable
          disabled={zoom <= 1}
          onPress={() => changeZoom(-0.5)}
          accessibilityRole="button"
          accessibilityLabel="지도 축소"
          accessibilityState={{ disabled: zoom <= 1 }}
          style={[
            (s as any).zoomButton,
            zoom <= 1 && (s as any).zoomButtonDisabled,
          ]}
        >
          <Text style={[(s as any).zoomText, { color: theme.text }]}>−</Text>
        </Pressable>
        <View style={[(s as any).zoomDivider, { backgroundColor: theme.border }]} />
        <Pressable
          disabled={zoom >= MAP_MAX_ZOOM}
          onPress={() => changeZoom(0.5)}
          accessibilityRole="button"
          accessibilityLabel="지도 확대"
          accessibilityState={{ disabled: zoom >= MAP_MAX_ZOOM }}
          style={[
            (s as any).zoomButton,
            zoom >= MAP_MAX_ZOOM && (s as any).zoomButtonDisabled,
          ]}
        >
          <Text style={[(s as any).zoomText, { color: theme.text }]}>＋</Text>
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
  const monthTrips = trips.filter(
    (trip) => trip.start.slice(0, 7) === monthKey,
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
        (s as any).calendarCard,
        {
          backgroundColor: theme.dark ? "#FCFCFA" : "#FFFEFC",
          borderColor: theme.dark ? "#BBC0C8" : "#D9D9D5",
        },
      ]}
    >
      <View pointerEvents="none" style={(s as any).calendarPageBack} />
      <View style={(s as any).calendarHead}>
        <View style={(s as any).calendarTitleBlock}>
          <Text style={[(s as any).calendarMonth, { color: "#283046" }]}>
            {month.year}. {String(month.value).padStart(2, "0")}
          </Text>
          <Text style={(s as any).calendarSub}>
            {monthTrips.length
              ? `${monthTrips.length}개의 여행이 적혀 있어요`
              : "아직 적힌 여행이 없어요"}
          </Text>
        </View>
        <View style={(s as any).calendarControls}>
          <Pressable onPress={moveToToday} style={(s as any).calendarTodayButton}>
            <Text style={(s as any).calendarTodayText}>오늘</Text>
          </Pressable>
          <Pressable onPress={() => move(-1)} style={(s as any).monthArrow}>
            <Text style={(s as any).monthArrowText}>‹</Text>
          </Pressable>
          <Pressable onPress={() => move(1)} style={(s as any).monthArrow}>
            <Text style={(s as any).monthArrowText}>›</Text>
          </Pressable>
        </View>
      </View>
      {monthTrips.length > 0 && (
        <View style={(s as any).calendarLegend}>
          {monthTrips.map((trip) => (
            <View key={trip.name} style={(s as any).calendarLegendItem}>
              <View
                style={[
                  (s as any).calendarLegendLine,
                  { backgroundColor: trip.color },
                ]}
              />
              <Text style={(s as any).calendarLegendText}>{trip.name}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={(s as any).weekRow}>
        {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
          <Text
            key={day}
            style={[
              (s as any).weekName,
              index === 0 && (s as any).weekNameSunday,
              index === 6 && (s as any).weekNameSaturday,
            ]}
          >
            {day}
          </Text>
        ))}
      </View>
      <View style={(s as any).calendarGrid}>
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
              onPress={() => setSelectedDate(key)}
              style={[
                (s as any).dayCell,
                trip && {
                  backgroundColor: `${trip.color}${theme.dark ? "38" : "1C"}`,
                },
                trip && (s as any).dayRangeCell,
                trip && !continuesFromPrevious && (s as any).dayRangeStart,
                trip && !continuesToNext && (s as any).dayRangeEnd,
                selected && [
                  (s as any).dayCellSelected,
                  { borderColor: theme.text },
                ],
              ]}
            >
              <View
                style={[
                  (s as any).dayNumberBadge,
                  isToday && (s as any).dayNumberToday,
                ]}
              >
                <Text
                  style={[
                    (s as any).dayNumber,
                    index % 7 === 0 && (s as any).dayNumberSunday,
                    index % 7 === 6 && (s as any).dayNumberSaturday,
                    trip && [(s as any).dayNumberTrip, { color: trip.color }],
                    isToday && (s as any).dayNumberTodayText,
                    selected && (s as any).dayNumberSelected,
                  ]}
                >
                  {valid ? day : ""}
                </Text>
              </View>
              {trip && (
                <View
                  style={[(s as any).dayTripDot, { backgroundColor: trip.color }]}
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
    <View style={(s as any).rangeField}>
      <Text style={[(s as any).fieldLabel, { color: theme.muted }]}>기간</Text>
      <View style={(s as any).rangeSummary}>
        <View>
          <Text style={(s as any).rangeSummaryLabel}>
            {selectingEnd ? "마지막 날을 선택하세요" : "선택한 여행 기간"}
          </Text>
          <Text style={(s as any).rangeSummaryValue}>
            {formatTripRange(start, end)}
          </Text>
        </View>
        <View style={(s as any).rangeNights}>
          <Text style={(s as any).rangeNightsText}>
            {nights ? `${nights}박` : "당일"}
          </Text>
        </View>
      </View>
      <View
        style={[
          (s as any).rangeCalendar,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={(s as any).rangeMonthHead}>
          <Pressable
            onPress={() => move(-1)}
            style={[
              (s as any).rangeMonthButton,
              { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={[(s as any).rangeMonthArrow, { color: theme.text }]}>
              ‹
            </Text>
          </Pressable>
          <Text style={[(s as any).rangeMonthTitle, { color: theme.text }]}>
            {calendarMonth.year}. {String(calendarMonth.value).padStart(2, "0")}
          </Text>
          <Pressable
            onPress={() => move(1)}
            style={[
              (s as any).rangeMonthButton,
              { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={[(s as any).rangeMonthArrow, { color: theme.text }]}>
              ›
            </Text>
          </Pressable>
        </View>
        <View style={(s as any).rangeWeek}>
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <Text
              key={day}
              style={[(s as any).rangeWeekday, { color: theme.muted }]}
            >
              {day}
            </Text>
          ))}
        </View>
        <View style={(s as any).rangeGrid}>
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
                style={(s as any).rangeDay}
              >
                {inRange && (
                  <View
                    style={[
                      (s as any).rangeDayBand,
                      { backgroundColor: theme.dark ? `${theme.secondary}28` : `${theme.secondary}1F` },
                      (index % 7 === 0 || startsRange) &&
                        (s as any).rangeDayBandStart,
                      (index % 7 === 6 || endsRange) &&
                        (s as any).rangeDayBandEnd,
                      startsRange && (s as any).rangeDayBandFirst,
                      endsRange && (s as any).rangeDayBandLast,
                    ]}
                  />
                )}
                {valid && (
                  <View style={[edge && (s as any).rangeDayCircle, edge && { backgroundColor: theme.secondary }]}>
                    <Text
                      style={[
                        (s as any).rangeDayText,
                        { color: theme.muted },
                        inRange && (s as any).rangeDayTextActive,
                        inRange && { color: theme.dark ? theme.secondary : "#087D70" },
                        edge && (s as any).rangeDayTextEdge,
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

function Trips({ open }: { open: () => void }) {
  const [filter, setFilter] = useState<"전체" | "예정" | "추억">("전체");
  const [items, setItems] = useState(trips);
  const [creating, setCreating] = useState(false);
  const [place, setPlace] = useState("");
  const [date, setDate] = useState("9월 12일 — 14일");
  const [note, setNote] = useState("새 여행");
  const visibleTrips =
    filter === "예정"
      ? items.slice(0, Math.max(1, items.length - 2))
      : filter === "추억"
        ? items.slice(-2)
        : items;
  const addTrip = () => {
    if (!place.trim()) return;
    setItems((current) => [
      {
        name: place.trim(),
        date,
        note,
        color: "#19B6A3",
        mark: date.slice(0, 2).replace(/\D/g, "") || "NEW",
        region: "서울",
        start: "2026-09-12",
        end: "2026-09-14",
      },
      ...current,
    ]);
    setPlace("");
    setCreating(false);
    setFilter("전체");
  };
  return (
    <>
      <ScrollView
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.screenHead}>
          <View>
            <Text style={s.overline}>우리의 여행 지도</Text>
            <Text style={s.screenTitle}>여행</Text>
          </View>
          <Pressable
            onPress={() => setCreating(true)}
            style={({ pressed }) => [s.newTrip, pressed && (s as any).pressed]}
          >
            <Text style={s.newTripText}>새 여행</Text>
          </Pressable>
        </View>
        <View style={s.tripFilters}>
          {(["전체", "예정", "추억"] as const).map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)}>
              <Text style={[s.filter, filter === item && s.filterActive]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        {visibleTrips.map((trip, index) => (
          <Pressable
            key={`${trip.name}-${index}`}
            onPress={open}
            style={({ pressed }) => [s.tripRow, pressed && (s as any).pressed]}
          >
            <View style={(s as any).tripThumb}>
              <TripArt color={trip.color} date={trip.mark} small />
            </View>
            <View style={s.tripInfo}>
              <Text style={s.tripName}>{trip.name}</Text>
              <Text style={s.tripDate}>{trip.date}</Text>
              <Text style={s.tripNote}>{trip.note}</Text>
            </View>
            <Text style={s.arrow}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FormSheet
        visible={creating}
        title="새 여행"
        submit="여행 만들기"
        onClose={() => setCreating(false)}
        onSubmit={addTrip}
      >
        <Field
          label="여행지"
          value={place}
          onChangeText={setPlace}
          placeholder="예: 제주 애월"
        />
        <Field label="기간" value={date} onChangeText={setDate} />
        <Field label="한 줄 메모" value={note} onChangeText={setNote} />
      </FormSheet>
    </>
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
  const [savedTitles, setSavedTitles] = useState(() => new Set(["은행골블랙"]));
  const allResults = [
    {
      title: "은행골블랙",
      type: "장소",
      trip: "서울 구로구",
      detail: "8.22 토요일 저녁 예약",
      color: "#19B6A3",
      tags: ["스시", "저녁", "예약"],
    },
    {
      title: "밀푀유나베",
      type: "요리",
      trip: "서울 구로구",
      detail: "재료 6개 · 여울 준비",
      color: "#F0A351",
      tags: ["저녁", "주방"],
    },
    {
      title: "우사기쇼쿠도",
      type: "장소",
      trip: "안양 평촌",
      detail: "돈테키덮밥 · 11시 영업",
      color: "#19B6A3",
      tags: ["식당", "점심"],
    },
    {
      title: "충전기",
      type: "준비",
      trip: "진주",
      detail: "아침에 챙길 것",
      color: "#8B7CF6",
      tags: ["전자기기"],
    },
    {
      title: "포켓몬 드론쇼",
      type: "일정",
      trip: "부산",
      detail: "7.25 토요일 · 광안리",
      color: "#FF6B5F",
      tags: ["야경", "행사"],
    },
    {
      title: "육수 재료는 미리 준비하기",
      type: "기록",
      trip: "서울 구로구",
      detail: "함께 확인할 여행 메모",
      color: "#D49A47",
      tags: ["요리", "메모"],
    },
  ];
  const searchableResults = useMemo(
    () =>
      allResults.filter(
        (item) =>
          trips.some((trip) => trip.name === item.trip) &&
          `${item.title} ${item.trip} ${item.detail} ${item.tags.join(" ")}`.includes(query.trim()),
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
  return (
    <ScrollView
      style={{ backgroundColor: "transparent" }}
      contentContainerStyle={(s as any).searchPage}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[s.overline, { color: theme.primary }]}>
        모든 여행의 기록
      </Text>
      <Text style={[s.screenTitle, { color: theme.text }]}>찾기</Text>
      <Text style={[(s as any).searchIntro, { color: theme.muted }]}>
        다녀온 여행과 준비 중인 기록을 한곳에서 찾아보세요
      </Text>
      <View
        style={[
          (s as any).searchBoxNew,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Path d="m15.5 15.5 4 4M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" fill="none" stroke={theme.muted} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="장소, 음식, 준비물, 메모 검색"
          placeholderTextColor={theme.muted}
          style={[(s as any).searchInputNew, { color: theme.text }]}
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery("")}
            style={[
              (s as any).searchClear,
              { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={(s as any).searchClearText}>×</Text>
          </Pressable>
        )}
      </View>
      <View style={(s as any).searchGuide}>
          <Text style={[(s as any).searchGuideTitle, { color: theme.muted }]}>
            최근
          </Text>
          <View style={(s as any).searchSuggestions}>
            {["은행골", "충전기", "부산", "밀푀유나베"].map((word) => (
              <Pressable
                key={word}
                onPress={() => setQuery(word)}
                style={[
                  (s as any).searchSuggestion,
                  { borderBottomColor: `${theme.secondary}55` },
                ]}
              >
                <Text
                  style={[
                    (s as any).searchSuggestionText,
                    { color: theme.secondary },
                  ]}
                >
                  {word}
                </Text>
              </Pressable>
            ))}
          </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[
          (s as any).searchCategories,
        ]}
        contentContainerStyle={(s as any).searchCategoriesContent}
      >
        {searchFilters.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => setCategory(item.label)}
            style={[
              (s as any).searchCategory,
              { backgroundColor: theme.surface, borderColor: theme.border },
              category === item.label && (s as any).searchCategoryActive,
              category === item.label && {
                backgroundColor: theme.primarySoft,
                borderColor: `${theme.primary}70`,
              },
            ]}
          >
            <Text
              style={[
                (s as any).searchCategoryText,
                { color: theme.muted },
                category === item.label && (s as any).searchCategoryTextActive,
                category === item.label && { color: theme.primary },
              ]}
            >
              {item.label}
            </Text>
            <View
              style={[
                (s as any).searchCategoryCount,
                {
                  backgroundColor:
                    category === item.label ? theme.primary : theme.surfaceAlt,
                },
              ]}
            >
              <Text
                style={[
                  (s as any).searchCategoryCountText,
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
      </ScrollView>
      <View style={(s as any).searchResultHead}>
        <Text style={[(s as any).searchResultTitle, { color: theme.text }]}>
          {query || category !== "전체" ? "검색 결과" : "여행 기록"}
        </Text>
        <Text style={[(s as any).searchResultCount, { color: theme.muted }]}>
          {results.length}개
        </Text>
      </View>
      {results.length > 0 && (
      <View style={(s as any).searchResultsSheet}>
      {results.map((item, index) => (
        <View
          key={item.title}
          style={[
            (s as any).searchResultCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            index === results.length - 1 && (s as any).searchResultCardLast,
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              (s as any).searchResultColorTab,
              { backgroundColor: item.color },
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
            style={(s as any).searchResultMain}
          >
            <View style={(s as any).searchResultCopy}>
              <View style={(s as any).searchResultLine}>
                <Text numberOfLines={1} style={[(s as any).searchResultName, { color: theme.text }]}>{item.title}</Text>
                <View
                  style={[
                    (s as any).searchResultTypeBadge,
                    {
                      backgroundColor: `${item.color}${theme.dark ? "28" : "14"}`,
                    },
                  ]}
                >
                  <Text style={[(s as any).searchResultType, { color: item.color }]}>{item.type}</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={[(s as any).searchResultDetail, { color: theme.muted }]}>{item.detail}</Text>
              <View style={(s as any).searchResultMetaRow}>
                <Text numberOfLines={1} style={[(s as any).searchResultTrip, { color: theme.muted }]}>{item.trip}</Text>
                {item.tags.slice(0, 2).map((tag) => (
                  <Text key={tag} style={[(s as any).searchResultTag, { color: item.color }]}>#{tag}</Text>
                ))}
              </View>
            </View>
            <Text style={[(s as any).searchResultArrow, { color: theme.muted }]}>›</Text>
          </Pressable>
          {item.type === "장소" && (
            <View
              style={[
                (s as any).searchResultActions,
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
                style={(s as any).searchResultAction}
              >
                <Text style={[(s as any).searchResultActionText, { color: savedTitles.has(item.title) ? theme.secondary : theme.muted }]}>{savedTitles.has(item.title) ? "저장됨" : "저장"}</Text>
              </Pressable>
              <Pressable onPress={() => open("schedule-add", trips.find((trip) => trip.name === item.trip))} style={(s as any).searchResultAction}>
                <Text style={[(s as any).searchResultActionText, { color: theme.primary }]}>일정에 담기</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL(`https://map.naver.com/p/search/${encodeURIComponent(item.title)}`)} style={(s as any).searchResultAction}>
                <Text style={[(s as any).searchResultActionText, { color: "#03A94F" }]}>N 지도</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
      </View>
      )}
      {!results.length && (
        <View
          style={[
            (s as any).searchEmpty,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Svg width={48} height={48} viewBox="0 0 48 48">
            <Path d="m30 30 9 9M21 34a13 13 0 1 1 0-26 13 13 0 0 1 0 26Zm-5-14h10M21 15v10" fill="none" stroke={theme.primary} strokeWidth={1.6} strokeLinecap="round" />
          </Svg>
          <Text style={[(s as any).searchEmptyTitle, { color: theme.text }]}>
            찾는 기록이 없어요
          </Text>
          <Text style={[(s as any).searchEmptyCopy, { color: theme.muted }]}>
            다른 단어나 카테고리로 검색해 보세요.
          </Text>
          {(query || category !== "전체") && (
            <Pressable
              onPress={() => {
                setQuery("");
                setCategory("전체");
              }}
              style={[(s as any).emptyInlineAction, { backgroundColor: theme.primarySoft }]}
            >
              <Text style={[(s as any).emptyInlineActionText, { color: theme.primary }]}>검색 초기화</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function Together({
  theme,
  themeId,
  setThemeId,
  appearance,
  setAppearance,
  trips,
  activeGroupId,
  setActiveGroupId,
  user,
  setUser,
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
  user: DaymoUser;
  setUser: React.Dispatch<React.SetStateAction<DaymoUser | null>>;
  onLogout: () => void;
}) {
  const [notifications, setNotifications] = useState(true);
  const [relationship, setRelationship] = useState<"연인" | "친구">("친구");
  const [spaceName, setSpaceName] = useState("주말 여행 메이트");
  const [memberA, setMemberA] = useState(user.name);
  const [memberB, setMemberB] = useState("여울");
  const [memberC, setMemberC] = useState("가람");
  const [memberD, setMemberD] = useState("새봄");
  const [selectedMember, setSelectedMember] = useState(0);
  const [memberRoles, setMemberRoles] = useState<Array<"관리자" | "편집 가능" | "보기만">>(["관리자", "편집 가능", "편집 가능", "보기만"]);
  const [since, setSince] = useState("2023. 10. 20");
  const groups: Array<{ id: GroupId; name: string; members: string[]; relationship: "연인" | "친구" }> = [
    { id: "ours", name: "우리의 여행 공간", members: ["다온"], relationship: "연인" as const },
    { id: "friends", name: "주말 여행 메이트", members: ["여울", "가람", "새봄"], relationship: "친구" as const },
    { id: "family", name: "가족 나들이", members: ["보름", "마루"], relationship: "친구" as const },
  ];
  const selectGroup = (group: (typeof groups)[number]) => {
    setActiveGroupId(group.id);
    setSpaceName(group.name);
    setMemberB(group.members[0] || "");
    setMemberC(group.members[1] || "");
    setMemberD(group.members[2] || "");
    setRelationship(group.relationship);
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
              : "공간 프로필";
  return (
    <>
      <ScrollView
        style={{ backgroundColor: "transparent" }}
        contentContainerStyle={s.page}
      >
        <View style={(s as any).togetherHead}>
          <View>
            <Text style={[s.overline, { color: theme.primary }]}>
              함께 관리하는 여행
            </Text>
            <Text style={[s.screenTitle, { color: theme.text }]}>우리</Text>
          </View>
          <Pressable onPress={() => setPanel("account")} style={[(s as any).togetherAccountButton, { backgroundColor: theme.primarySoft }]}>
            <Text style={[(s as any).togetherAccountInitial, { color: theme.primary }]}>{user.name.slice(0, 1)}</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => setPanel("groups")}
          style={[
            (s as any).workspaceCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={[(s as any).workspaceMark, { backgroundColor: theme.primarySoft }]}>
            <BottomNavIcon item="여행" color={theme.primary} />
          </View>
          <View style={(s as any).workspaceCopy}>
            <Text style={[(s as any).workspaceLabel, { color: theme.muted }]}>현재 여행 공간</Text>
            <Text style={[(s as any).workspaceName, { color: theme.text }]}>{spaceName}</Text>
            <Text style={[(s as any).workspaceMeta, { color: theme.muted }]}>{visibleMembers.length}명 · {relationship} · 여행 {trips.length}개</Text>
          </View>
          <View style={[(s as any).workspaceSwitchBadge, { backgroundColor: theme.primarySoft }]}>
            <Text style={[(s as any).workspaceSwitchBadgeText, { color: theme.primary }]}>바꾸기</Text>
          </View>
        </Pressable>
        <View style={(s as any).groupTabs}>
          {groups.map((group) => (
            <Pressable
              key={group.id}
              onPress={() => selectGroup(group)}
              style={[
                (s as any).groupTab,
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
                  (s as any).groupTabText,
                  { color: activeGroupId === group.id ? theme.primary : theme.muted },
                ]}
              >
                {group.id === "ours" ? "우리" : group.id === "friends" ? "친구" : "가족"}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setPanel("groups")} style={(s as any).groupTabMore}>
            <Text style={[(s as any).groupTabMoreText, { color: theme.muted }]}>•••</Text>
          </Pressable>
        </View>
        <View style={(s as any).memberSectionHead}>
          <View>
            <Text style={[(s as any).historyEyebrow, { color: theme.primary }]}>멤버</Text>
            <Text style={[(s as any).memberSectionTitle, { color: theme.text }]}>함께하는 사람</Text>
          </View>
          <Pressable onPress={() => setPanel("members")}><Text style={[(s as any).memberManageText, { color: theme.primary }]}>관리</Text></Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[(s as any).memberStrip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          contentContainerStyle={(s as any).memberStripContent}
        >
          {visibleMembers.map((member, index) => (
            <Pressable key={`${member}-${index}`} onPress={() => setPanel("members")} style={(s as any).memberStripItem}>
              <View style={[(s as any).memberStripAvatar, { backgroundColor: [theme.primary, theme.accent, theme.secondary, "#8B7CF6"][index] }]}>
                <Text style={(s as any).memberStripInitial}>{member.slice(0, 1)}</Text>
              </View>
              <Text numberOfLines={1} style={[(s as any).memberStripName, { color: theme.text }]}>{index === 0 ? "나" : member}</Text>
              <Text numberOfLines={1} style={[(s as any).memberStripRole, { color: theme.muted }]}>{memberRoles[index] ?? "편집 가능"}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => Share.share({ message: "Daymo에서 주말 여행 메이트를 함께 관리해요.\nhttps://daymo.app/invite/OUR-TRIP" })} style={(s as any).memberStripItem}>
            <View style={[(s as any).memberInviteAvatar, { borderColor: theme.border }]}><Text style={[(s as any).memberInvitePlus, { color: theme.primary }]}>＋</Text></View>
            <Text style={[(s as any).memberStripName, { color: theme.muted }]}>초대</Text>
            <Text style={[(s as any).memberStripRole, { color: theme.muted }]}>링크 공유</Text>
          </Pressable>
        </ScrollView>
        <Text style={[(s as any).managementLabel, { color: theme.muted }]}>빠른 관리</Text>
        <View style={(s as any).togetherQuickRow}>
          {[
            {
              icon: "＋",
              label: "멤버 초대",
              onPress: () => Share.share({ message: "Daymo에서 주말 여행 메이트를 함께 관리해요.\nhttps://daymo.app/invite/OUR-TRIP" }),
            },
            { icon: "⇧", label: "기록 내보내기", onPress: exportData },
            {
              icon: notifications ? "●" : "○",
              label: notifications ? "알림 켜짐" : "알림 꺼짐",
              onPress: () => setNotifications((value) => !value),
            },
          ].map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={[
                (s as any).togetherQuick,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View style={[(s as any).togetherQuickIcon, { backgroundColor: theme.primarySoft }]}>
                <Text style={[(s as any).togetherQuickIconText, { color: theme.primary }]}>{action.icon}</Text>
              </View>
              <Text numberOfLines={1} style={[(s as any).togetherQuickLabel, { color: theme.text }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={(s as any).historyHeading}>
          <View>
            <Text style={[(s as any).historyEyebrow, { color: theme.primary }]}>지금까지의 기록</Text>
            <Text style={[(s as any).historyTitle, { color: theme.text }]}>함께 쌓은 여행</Text>
          </View>
          <Text style={[(s as any).historyPeriod, { color: theme.muted }]}>{since.slice(0, 4)} — 2026</Text>
        </View>
        <View
          style={[
            (s as any).historySummary,
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
              style={[(s as any).historySummaryItem, index > 0 && { borderLeftColor: theme.border, borderLeftWidth: 1 }]}
            >
              <Text style={[(s as any).historySummaryValue, { color: stat.color }]}>
                {stat.value}<Text style={[(s as any).historyUnit, { color: theme.muted }]}> {stat.unit}</Text>
              </Text>
              <Text style={[(s as any).historySummaryLabel, { color: theme.muted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
        {trips[0] && (
          <Pressable
            style={[(s as any).historyLatest, { borderColor: theme.border }]}
          >
            <View style={[(s as any).historyLatestDot, { backgroundColor: trips[0].color }]} />
            <Text style={[(s as any).historyLatestLabel, { color: theme.muted }]}>최근 여행</Text>
            <Text numberOfLines={1} style={[(s as any).historyLatestName, { color: theme.text }]}>{trips[0].name}</Text>
            <Text style={[(s as any).historyLatestDate, { color: theme.muted }]}>{trips[0].date}</Text>
          </Pressable>
        )}
        <Text style={[(s as any).settingGroupLabel, { color: theme.muted }]}>공간 설정</Text>
        <View
          style={[
            (s as any).settingGroup,
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
        <Text style={[(s as any).settingGroupLabel, { color: theme.muted }]}>앱과 계정</Text>
        <View
          style={[
            (s as any).settingGroup,
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
            <Text style={[(s as any).sheetCopy, { color: theme.muted }]}>함께 관리할 여행 공간을 선택하세요.</Text>
            {groups.map((group) => (
              <Pressable
                key={group.id}
                onPress={() => {
                  selectGroup(group);
                  setPanel(null);
                }}
                style={[(s as any).groupChoice, { backgroundColor: theme.surface, borderColor: activeGroupId === group.id ? theme.primary : theme.border }]}
              >
                <View style={[(s as any).groupChoiceAvatar, { backgroundColor: activeGroupId === group.id ? theme.primary : theme.primarySoft }]}>
                  <Text style={[(s as any).groupChoiceAvatarText, { color: activeGroupId === group.id ? "#FFFFFF" : theme.primary }]}>{group.name.slice(0, 1)}</Text>
                </View>
                <View style={(s as any).groupChoiceCopy}>
                  <Text style={[(s as any).groupChoiceName, { color: theme.text }]}>{group.name}</Text>
                  <Text numberOfLines={1} style={[(s as any).groupChoiceMeta, { color: theme.muted }]}>{[user.name, ...group.members].join(" · ")}</Text>
                </View>
                <Text style={[(s as any).groupChoiceCheck, { color: theme.primary }]}>{activeGroupId === group.id ? "✓" : ""}</Text>
              </Pressable>
            ))}
          </>
        )}
        {panel === "account" && (
          <>
            <View style={[(s as any).accountPreview, { backgroundColor: theme.primarySoft }]}>
              <View style={[(s as any).accountAvatar, { backgroundColor: theme.primary }]}>
                <Text style={(s as any).accountAvatarText}>{user.name.trim().slice(0, 1) || "?"}</Text>
              </View>
              <View style={(s as any).accountPreviewCopy}>
                <Text style={[(s as any).accountPreviewName, { color: theme.text }]}>{user.name}</Text>
                <Text style={[(s as any).accountPreviewEmail, { color: theme.muted }]}>{user.email}</Text>
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
            <Text style={[(s as any).sheetCopy, { color: theme.muted }]}>프로필 변경 내용은 바로 저장돼요.</Text>
            <Pressable
              onPress={() => {
                setPanel(null);
                onLogout();
              }}
              style={[(s as any).accountLogout, { borderColor: theme.border }]}
            >
              <Text style={(s as any).accountLogoutText}>로그아웃</Text>
            </Pressable>
          </>
        )}
        {panel === "members" && (
          <>
            <View style={(s as any).memberManagerHead}>
              <View>
                <Text style={[(s as any).memberManagerTitle, { color: theme.text }]}>{visibleMembers.length}명이 함께하고 있어요</Text>
                <Text style={[(s as any).memberManagerCopy, { color: theme.muted }]}>관리할 멤버를 선택하세요.</Text>
              </View>
              <Pressable
                onPress={() => Share.share({ message: "Daymo에서 주말 여행 메이트를 함께 관리해요.\nhttps://daymo.app/invite/OUR-TRIP" })}
                style={[(s as any).memberManagerInvite, { backgroundColor: theme.primarySoft }]}
              >
                <Text style={[(s as any).memberManagerInviteText, { color: theme.primary }]}>＋ 초대</Text>
              </Pressable>
            </View>
            <View style={(s as any).memberManagerGrid}>
              {memberEntries.map(({ name: member, slot }, index) => (
                <Pressable
                  key={`${member}-manage`}
                  onPress={() => setSelectedMember(slot)}
                  style={[
                    (s as any).memberManagerCard,
                    { backgroundColor: theme.surface, borderColor: selectedMember === slot ? theme.primary : theme.border },
                    selectedMember === slot && { borderWidth: 2 },
                  ]}
                >
                  <View style={[(s as any).memberManagerAvatar, { backgroundColor: [theme.primary, theme.accent, theme.secondary, "#8B7CF6"][index] }]}>
                    <Text style={(s as any).memberStripInitial}>{member.slice(0, 1)}</Text>
                  </View>
                  <View style={(s as any).memberManagerCardCopy}>
                    <Text numberOfLines={1} style={[(s as any).memberManagerName, { color: theme.text }]}>{member}{slot === 0 ? " (나)" : ""}</Text>
                    <Text numberOfLines={1} style={[(s as any).memberManagerRole, { color: selectedMember === slot ? theme.primary : theme.muted }]}>{memberRoles[slot]}</Text>
                  </View>
                  <Text style={[{ color: theme.primary, fontWeight: "900" }, selectedMember !== slot && { opacity: 0 }]}>{"✓"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={[(s as any).memberEditor, { backgroundColor: theme.primarySoft }]}>
              <Text style={[(s as any).memberEditorEyebrow, { color: theme.primary }]}>선택한 멤버</Text>
              <Field
                theme={theme}
                label={selectedMember === 0 ? "내 이름" : "멤버 이름"}
                value={[memberA, memberB, memberC, memberD][selectedMember] || ""}
                onChangeText={(value) => memberSetters[selectedMember]?.(value)}
                placeholder="이름 또는 별명"
              />
              {selectedMember === 0 ? (
                <Text style={[(s as any).memberRoleText, { color: theme.muted }]}>관리자는 공간과 모든 여행을 관리할 수 있어요.</Text>
              ) : (
                <>
                  <Text style={[(s as any).memberPermissionLabel, { color: theme.text }]}>이 공간에서 할 수 있는 일</Text>
                  <Choice
                    theme={theme}
                    selected={memberRoles[selectedMember] === "편집 가능"}
                    label="함께 관리 · 일정과 준비물을 수정"
                    onPress={() => setMemberRoles((roles) => roles.map((role, index) => index === selectedMember ? "편집 가능" : role))}
                  />
                  <Choice
                    theme={theme}
                    selected={memberRoles[selectedMember] === "보기만"}
                    label="보기만 · 내용을 확인하고 체크"
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
                    style={(s as any).memberRemoveButton}
                  >
                    <Text style={(s as any).memberRemoveText}>이 공간에서 내보내기</Text>
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
          <View style={(s as any).themeGrid}>
            {themeOptions.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => setThemeId(option.id)}
                style={[
                  (s as any).themeOption,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  themeId === option.id && {
                    borderColor: option.primary,
                    borderWidth: 2,
                  },
                ]}
              >
                <View style={(s as any).themeSwatches}>
                  <View
                    style={[
                      (s as any).themeSwatch,
                      { backgroundColor: option.primary },
                    ]}
                  />
                  <View
                    style={[
                      (s as any).themeSwatch,
                      { backgroundColor: option.secondary },
                    ]}
                  />
                  <View
                    style={[
                      (s as any).themeSwatch,
                      { backgroundColor: option.accent },
                    ]}
                  />
                </View>
                <Text
                  style={[(s as any).themeOptionName, { color: theme.text }]}
                >
                  {option.name}
                </Text>
                <Text
                  style={[(s as any).themeOptionCheck, { color: theme.text }]}
                >
                  {themeId === option.id ? "✓" : ""}
                </Text>
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
          <Text style={[(s as any).sheetCopy, { color: theme.muted }]}>
            여행을 만들고 일정, 준비물, 메모와 사진을 한곳에서 함께 관리하세요.
          </Text>
        )}
        {panel === "profile" && (
          <>
            <View style={[(s as any).profileSheetPreview, { backgroundColor: theme.primarySoft }]}>
              <View style={[(s as any).profileSheetAvatar, { backgroundColor: theme.primary }]}>
                <Text style={(s as any).togetherAvatarText}>{memberA.trim().slice(0, 1) || "?"}</Text>
              </View>
              <View style={[(s as any).profileSheetAvatar, (s as any).profileSheetAvatarSecond, { backgroundColor: theme.accent }]}>
                <Text style={(s as any).togetherAvatarText}>{memberB.trim().slice(0, 1) || "?"}</Text>
              </View>
              <Text style={[(s as any).profileSheetName, { color: theme.text }]}>{spaceName}</Text>
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
            <Text style={[(s as any).sheetCopy, { color: theme.muted }]}>변경 내용은 닫으면 자동으로 저장돼요.</Text>
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
              (s as any).navIconWrap,
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

function Title({
  label,
  title,
  action,
  onPress,
}: {
  label: string;
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={s.titleRow}>
      <View>
        <Text style={s.sectionLabel}>{label}</Text>
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {action && (
        <Pressable onPress={onPress}>
          <Text style={s.sectionAction}>{action} ›</Text>
        </Pressable>
      )}
    </View>
  );
}
function HomeTask({
  text,
  who,
  color,
  last,
}: {
  text: string;
  who: string;
  color: string;
  last?: boolean;
}) {
  return (
    <View style={[s.task, last && s.taskLast]}>
      <View style={[s.taskDot, { backgroundColor: color }]} />
      <Text style={s.taskText}>{text}</Text>
      <Text style={s.taskWho}>{who}</Text>
    </View>
  );
}
function TripArt({
  color,
  date,
  small,
}: {
  color: string;
  date: string;
  small?: boolean;
}) {
  return (
    <View
      style={[s.tripArt, small && s.tripArtSmall, { backgroundColor: color }]}
    >
      <View style={s.artMoon} />
      <View style={s.artDate}>
        <Text style={s.artText}>{date}</Text>
        <View style={s.artLine} />
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
        pressed && (s as any).pressed,
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
        <Text style={[s.arrow, theme && { color: theme.muted }]}>›</Text>
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
    <View style={(s as any).field}>
      <View style={(s as any).fieldLabelRow}>
        <View style={[(s as any).fieldLabelDot, theme && { backgroundColor: theme.primary }]} />
        <Text style={[(s as any).fieldLabel, theme && { color: theme.text }]}>
          {label}
        </Text>
      </View>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={theme?.muted ?? "#9AA1AE"}
        style={[
          (s as any).fieldInput,
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
        style={(s as any).modalBack}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={(s as any).modalDismiss} onPress={onClose} />
        <View
          style={[
            (s as any).sheet,
            theme && { backgroundColor: theme.background },
          ]}
        >
          <View style={(s as any).sheetHandle} />
          <View
            style={[
              (s as any).sheetHead,
              (s as any).sheetHeadDecorated,
              { backgroundColor: `${sheetAccent}0B`, borderColor: `${sheetAccent}30` },
            ]}
          >
            <View style={(s as any).sheetHeadMain}>
              <View style={(s as any).sheetHeadCopy}>
                <View style={(s as any).sheetKindRow}>
                  <View style={[(s as any).sheetKindDot, { backgroundColor: sheetAccent }]} />
                  <Text style={[(s as any).sheetKindText, { color: sheetAccent }]}>{sheetKind} 작성</Text>
                  <View style={[(s as any).sheetRouteLine, { backgroundColor: `${sheetAccent}40` }]} />
                  <View style={[(s as any).sheetRouteDot, { borderColor: sheetAccent }]} />
                </View>
                <Text
                  numberOfLines={1}
                  style={[(s as any).sheetTitle, theme && { color: theme.text }]}
                >
                  {title}
                </Text>
                {subtitle && (
                  <Text numberOfLines={2} style={[(s as any).sheetSubtitle, theme && { color: theme.muted }]}>
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
              style={[(s as any).sheetCloseButton, theme && { backgroundColor: theme.surfaceAlt }]}
            >
              <Text
                style={[
                  (s as any).sheetClose,
                  theme && { color: theme.primary },
                ]}
              >
                ×
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={(s as any).sheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
            <View style={(s as any).sheetFormBody}>
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
              (s as any).sheetSubmit,
              theme && { backgroundColor: theme.primary },
              submitDisabled && (s as any).sheetSubmitDisabled,
              pressed && !submitDisabled && (s as any).controlPressed,
            ]}
          >
            <Text style={(s as any).sheetSubmitText}>{submit}</Text>
            <View style={(s as any).sheetSubmitArrow}><Text style={(s as any).sheetSubmitArrowText}>→</Text></View>
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
      <View style={(s as any).modalBack}>
        <Pressable style={(s as any).modalDismiss} onPress={onClose} />
        <View
          style={[
            (s as any).sheet,
            theme && { backgroundColor: theme.background },
          ]}
        >
          <View style={(s as any).sheetHandle} />
          <View style={[(s as any).sheetHead, (s as any).infoSheetHead, theme && { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
            <View style={(s as any).sheetHeadCopy}>
              <View style={(s as any).sheetKindRow}>
                <View style={[(s as any).sheetKindDot, theme && { backgroundColor: theme.primary }]} />
                <Text style={[(s as any).sheetKindText, theme && { color: theme.primary }]}>우리 설정</Text>
                <View style={[(s as any).sheetRouteLine, theme && { backgroundColor: theme.border }]} />
                <View style={[(s as any).sheetRouteDot, theme && { borderColor: theme.primary }]} />
              </View>
              <Text
                numberOfLines={1}
                style={[(s as any).sheetTitle, theme && { color: theme.text }]}
              >
                {title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${title} 닫기`}
              style={[(s as any).infoSheetDone, theme && { backgroundColor: theme.surface }]}
            >
              <Text
                style={[
                  (s as any).infoSheetDoneText,
                  theme && { color: theme.primary },
                ]}
              >
                완료
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={(s as any).sheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={(s as any).infoSheetBody}
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
        (s as any).choice,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        selected && (s as any).choiceSelected,
        selected &&
          theme && {
            backgroundColor: theme.primarySoft,
            borderColor: theme.primary,
          },
      ]}
    >
      <Text
        style={[
          (s as any).choiceText,
          theme && { color: theme.text },
          selected && (s as any).choiceTextSelected,
          selected && theme && { color: theme.primary },
        ]}
      >
        {label}
      </Text>
      <Text style={(s as any).choiceMark}>{selected ? "✓" : ""}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF9F4" },
  body: { flex: 1 },
  page: { padding: 21, paddingBottom: 112 },
  homeTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    color: "#663C37",
    fontSize: 29,
    letterSpacing: -1.4,
    fontWeight: "900",
  },
  people: {
    paddingHorizontal: 11,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F4DED3",
    alignItems: "center",
    justifyContent: "center",
  },
  peopleText: { color: "#9A6156", fontSize: 11, fontWeight: "900" },
  greeting: {
    color: "#593532",
    fontSize: 31,
    lineHeight: 39,
    letterSpacing: -1.6,
    fontWeight: "800",
    marginTop: 38,
  },
  greetingSub: { color: "#987C73", fontSize: 13, marginTop: 12 },
  togetherCard: {
    backgroundColor: "#F4D2C3",
    borderRadius: 25,
    padding: 20,
    minHeight: 144,
    marginTop: 27,
    flexDirection: "row",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  togetherLabel: {
    color: "#AD6B5E",
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  togetherDays: {
    color: "#623933",
    fontSize: 29,
    letterSpacing: -1.2,
    fontWeight: "800",
    marginTop: 10,
  },
  togetherSub: { color: "#9A7167", fontSize: 11, marginTop: 4 },
  heartShape: {
    width: 87,
    height: 87,
    marginTop: 17,
    marginRight: 3,
    transform: [{ rotate: "-45deg" }],
  },
  heartLeft: {
    position: "absolute",
    width: 53,
    height: 53,
    borderRadius: 27,
    backgroundColor: "#D98977",
    left: 0,
    top: 22,
  },
  heartRight: {
    position: "absolute",
    width: 53,
    height: 53,
    borderRadius: 27,
    backgroundColor: "#D98977",
    left: 22,
    top: 0,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 34,
    marginBottom: 13,
  },
  sectionLabel: {
    color: "#C17765",
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "900",
    marginBottom: 5,
  },
  sectionTitle: {
    color: "#633B36",
    fontSize: 20,
    letterSpacing: -0.8,
    fontWeight: "800",
  },
  sectionAction: { color: "#B2776A", fontSize: 11, fontWeight: "800" },
  nextCard: {
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 13,
    flexDirection: "row",
    shadowColor: "#B98B7E",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tripArt: {
    width: 121,
    height: 136,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  tripArtSmall: {
    width: "100%",
    height: 91,
    borderRadius: 14,
    marginBottom: 9,
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
  artText: { color: "#623C38", fontSize: 13, fontWeight: "900" },
  artLine: { width: 25, height: 2, backgroundColor: "#623C38", marginTop: 5 },
  nextText: { flex: 1, paddingLeft: 15, paddingTop: 4 },
  nextTag: {
    alignSelf: "flex-start",
    color: "#B56454",
    backgroundColor: "#F9E5DC",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 9,
    fontSize: 11,
    fontWeight: "900",
  },
  nextTitle: {
    color: "#603A35",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 11,
  },
  nextDate: { color: "#A0857B", fontSize: 11, marginTop: 4 },
  nextNote: { color: "#B1978E", fontSize: 11, marginTop: 13 },
  taskCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    shadowColor: "#B98B7E",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  task: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#F3E8E2",
  },
  taskLast: { borderBottomWidth: 0 },
  taskDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  taskText: { flex: 1, color: "#694942", fontSize: 12, fontWeight: "600" },
  taskWho: { color: "#AB8C82", fontSize: 11, fontWeight: "800" },
  archive: { flexDirection: "row" },
  archiveCard: { width: "47%", marginRight: "4%" },
  archiveName: { color: "#633D37", fontSize: 14, fontWeight: "800" },
  archiveDate: { color: "#A58C82", fontSize: 11, marginTop: 3 },
  screenHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
    marginBottom: 23,
  },
  overline: {
    color: "#B87869",
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "900",
  },
  screenTitle: {
    color: "#603934",
    fontSize: 34,
    letterSpacing: -1.7,
    fontWeight: "800",
    marginTop: 5,
  },
  newTrip: {
    backgroundColor: "#E59681",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  newTripText: { color: "#FFF9F4", fontSize: 11, fontWeight: "800" },
  tripFilters: {
    flexDirection: "row",
    backgroundColor: "#F5EAE3",
    padding: 4,
    borderRadius: 15,
    marginBottom: 15,
  },
  filter: {
    color: "#A58B80",
    fontSize: 11,
    fontWeight: "800",
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 11,
  },
  filterActive: { backgroundColor: "#FFF9F4", color: "#694038" },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#F0E2DB",
  },
  tripInfo: { flex: 1, paddingLeft: 13 },
  tripName: { color: "#633B35", fontSize: 16, fontWeight: "800" },
  tripDate: { color: "#9E8177", fontSize: 11, marginTop: 4 },
  tripNote: { color: "#B49C93", fontSize: 11, marginTop: 5 },
  arrow: { color: "#A0665B", fontSize: 23, fontWeight: "300" },
  searchPage: { padding: 21, flex: 1 },
  searchBox: {
    backgroundColor: "#F7EDE6",
    borderRadius: 17,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginTop: 26,
  },
  searchSymbol: { color: "#C27C6C", fontSize: 25, marginRight: 7 },
  searchInput: { flex: 1, color: "#633B35", fontSize: 13 },
  resultOverline: {
    color: "#B37A6C",
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "900",
    marginTop: 27,
    marginBottom: 5,
  },
  result: {
    minHeight: 64,
    borderBottomWidth: 1,
    borderColor: "#F0E3DC",
    flexDirection: "row",
    alignItems: "center",
  },
  resultDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#E6A18D",
    marginRight: 12,
  },
  resultText: { flex: 1 },
  resultTitle: { color: "#654039", fontSize: 14, fontWeight: "800" },
  resultMeta: { color: "#A78D83", fontSize: 11, marginTop: 4 },
  spaceCard: {
    backgroundColor: "#E8D4C9",
    borderRadius: 24,
    padding: 19,
    minHeight: 105,
    marginTop: 26,
    marginBottom: 26,
    flexDirection: "row",
    alignItems: "center",
  },
  spaceMonogram: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "#B86F61",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  monogramText: { color: "#FFF7F1", fontSize: 11, fontWeight: "900" },
  spaceName: { color: "#643B36", fontSize: 17, fontWeight: "800" },
  spaceCopy: { color: "#9A756B", fontSize: 11, marginTop: 5 },
  setting: {
    minHeight: 55,
    borderBottomWidth: 1,
    borderColor: "#F0E2DA",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  settingName: { color: "#6A4941", fontSize: 14, fontWeight: "700" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  settingValue: { color: "#B46F60", fontSize: 11, fontWeight: "800" },
  settingsLabel: {
    color: "#B37B6C",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 29,
    marginBottom: 5,
  },
  bottom: {
    height: 76,
    backgroundColor: "#FFF5EF",
    borderTopWidth: 1,
    borderColor: "#F0DED5",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 13,
  },
  navItem: { width: 52, alignItems: "center" },
  navDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D7B6AB",
    marginBottom: 5,
  },
  navDotActive: { width: 9, backgroundColor: "#C87867" },
  navText: { color: "#AB8D82", fontSize: 12, fontWeight: "800" },
  navTextActive: { color: "#7D4B42" },
});

Object.assign(s, {
  paperBackdrop: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  paperLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    opacity: 0.55,
  },
  paperMargin: { position: "absolute", top: 0, bottom: 0, left: 13, width: 1 },
  paperSpeck: { position: "absolute", width: 5, height: 5, borderRadius: 3 },
  notebookHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  notebookHello: { fontSize: 11, marginTop: 3, fontWeight: "600" },
  tinyDay: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    transform: [{ rotate: "1.5deg" }],
  },
  tinyDayText: { fontSize: 11, fontWeight: "800" },
  paperTripStack: {
    position: "relative",
    marginBottom: 3,
  },
  paperTripBack: {
    position: "absolute",
    left: 7,
    right: 7,
    top: 4,
    bottom: -7,
    borderRadius: 5,
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
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 19,
    paddingTop: 25,
    paddingBottom: 0,
    shadowColor: "#473E2D",
    shadowOpacity: 0.18,
    shadowRadius: 11,
    shadowOffset: { width: 2, height: 8 },
    elevation: 5,
    transform: [{ rotate: "-.35deg" }],
    overflow: "visible",
  },
  paperTripMain: { borderRadius: 3 },
  paperTripTexture: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: 4 },
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
  paperKicker: { fontSize: 11, fontWeight: "800", marginBottom: 7 },
  paperTitle: { fontSize: 28, fontWeight: "900", letterSpacing: -1.3 },
  paperDate: { fontSize: 11, marginTop: 6 },
  paperTripStamp: {
    width: 52,
    height: 58,
    borderRadius: 3,
    borderWidth: 1.2,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "2deg" }],
  },
  paperTripStampMonth: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  paperTripStampDay: { fontSize: 20, lineHeight: 23, fontWeight: "900" },
  paperTripStampRule: { width: 22, height: 2, borderRadius: 1, marginTop: 2 },
  paperRule: { borderTopWidth: 1, borderStyle: "dashed", marginTop: 16, marginBottom: 13 },
  paperStayBoard: {
    borderRadius: 14,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingTop: 1,
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
    marginRight: 11,
    transform: [{ rotate: "-2deg" }],
  },
  paperStayLabel: { fontSize: 11, fontWeight: "900" },
  paperStayName: { fontSize: 13, fontWeight: "900", marginTop: 3 },
  paperStayTime: {
    minWidth: 58,
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  paperStayTimeLabel: { fontSize: 11, fontWeight: "700" },
  paperStayTimeValue: { fontSize: 12, fontWeight: "900", marginTop: 1 },
  paperTripActions: {
    flexDirection: "row",
    marginTop: 14,
    marginHorizontal: -19,
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
  paperTripActionLabel: { fontSize: 11, fontWeight: "900", letterSpacing: -0.2 },
  paperTripActionMeta: { color: "#756F63", fontSize: 10, fontWeight: "700", marginTop: 3 },
  paperTripActionUnderline: { position: "absolute", width: 42, height: 5, bottom: 8, borderRadius: 3, transform: [{ rotate: "-1deg" }] },
  paperTripCornerShadow: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 17,
    height: 17,
    backgroundColor: "rgba(91, 78, 52, .11)",
    borderTopLeftRadius: 15,
  },
  paperTripCorner: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    backgroundColor: "#E7E7E2",
    borderTopLeftRadius: 11,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(115, 100, 69, .22)",
  },
  paperCounts: {
    flexDirection: "row",
    gap: 18,
    marginTop: 13,
  },
  paperCountChip: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  paperCountLabel: { fontSize: 11, fontWeight: "800" },
  paperCountValue: { fontSize: 12, fontWeight: "900" },
  pencilActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
  },
  scrapQuickGrid: {
    height: 124,
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
  },
  scrapQuickStack: { flex: 0.92, gap: 8 },
  quickRail: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 6,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#17233D",
    shadowOpacity: 0.04,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  quickRailDivider: { width: StyleSheet.hairlineWidth, height: 25 },
  scrapTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 25,
    marginBottom: 10,
  },
  prepBoard: {
    marginTop: 24,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 4,
    shadowColor: "#17233D",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    transform: [{ rotate: "0.12deg" }],
  },
  prepTape: {
    position: "absolute",
    width: 48,
    height: 14,
    top: -7,
    right: 26,
    opacity: 0.75,
    transform: [{ rotate: "3deg" }],
  },
  prepSketch: {
    position: "absolute",
    top: 10,
    right: 74,
    opacity: 0.28,
    transform: [{ rotate: "-4deg" }],
  },
  noteTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  noteTitleSmall: { fontSize: 11, fontWeight: "800", marginBottom: 4 },
  noteTitle: { fontSize: 20, fontWeight: "900", letterSpacing: -0.6 },
  memoPaper: {
    marginTop: 0,
    borderWidth: 1,
    borderRadius: 8,
    paddingLeft: 15,
    paddingRight: 5,
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
    paddingLeft: 9,
    paddingRight: 10,
  },
  memoRowLast: { borderBottomWidth: 0 },
  memoCheck: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.4,
    marginRight: 12,
    transform: [{ rotate: "-2deg" }],
  },
  memoText: { fontSize: 12, fontWeight: "800" },
  memoMeta: { fontSize: 11, marginTop: 4 },
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
    fontSize: 31,
    letterSpacing: -1.8,
    fontWeight: "900",
  },
  logoSub: {
    color: "#7D8697",
    fontSize: 11,
    letterSpacing: 1.45,
    fontWeight: "900",
    marginTop: 1,
  },
  people: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E9E5FF",
    borderWidth: 1,
    borderColor: "#D9D2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  peopleText: { color: "#6556D8", fontSize: 11, fontWeight: "900" },
  greeting: {
    color: "#17233D",
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -1.8,
    fontWeight: "800",
    marginTop: 38,
  },
  greetingSub: { color: "#747D8D", fontSize: 13, marginTop: 12 },
  togetherCard: {
    backgroundColor: "#17233D",
    borderRadius: 28,
    padding: 21,
    minHeight: 190,
    marginTop: 27,
    flexDirection: "row",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  cardGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#263657",
    right: -52,
    top: -70,
  },
  togetherLabel: {
    color: "#FF8B80",
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "900",
  },
  togetherDays: {
    color: "#FFFFFF",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -1.2,
    fontWeight: "800",
    marginTop: 11,
  },
  togetherSub: { color: "#AAB4C7", fontSize: 11, marginTop: 7 },
  heartShape: {
    width: 76,
    height: 76,
    marginTop: 28,
    marginRight: 2,
    transform: [{ rotate: "-45deg" }],
  },
  heartLeft: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: 24,
    backgroundColor: "#FF6B5F",
    left: 0,
    top: 19,
  },
  heartRight: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: 24,
    backgroundColor: "#FF6B5F",
    left: 19,
    top: 0,
  },
  colorLegend: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 17,
    flexDirection: "row",
    gap: 6,
  },
  legendPill: {
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 9,
    justifyContent: "center",
  },
  legendLove: { backgroundColor: "#FF6B5F" },
  legendFriends: { backgroundColor: "#8B7CF6" },
  legendTrip: { backgroundColor: "#19B6A3" },
  legendText: {
    color: "#FFFFFF",
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  sectionLabel: {
    color: "#FF6257",
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "900",
    marginBottom: 5,
  },
  sectionTitle: {
    color: "#17233D",
    fontSize: 20,
    letterSpacing: -0.8,
    fontWeight: "800",
  },
  sectionAction: { color: "#6556D8", fontSize: 11, fontWeight: "800" },
  nextCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 13,
    flexDirection: "row",
    shadowColor: "#17233D",
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  nextTag: {
    alignSelf: "flex-start",
    color: "#087D70",
    backgroundColor: "#DDF7F1",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    fontSize: 11,
    letterSpacing: 0.4,
    fontWeight: "900",
  },
  nextTitle: {
    color: "#17233D",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 11,
  },
  bottom: {
    height: 78,
    backgroundColor: "#17233D",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 14,
  },
  navDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#56627A",
    marginBottom: 6,
  },
  navDotActive: { width: 18, backgroundColor: "#19B6A3" },
  navText: { color: "#8994A8", fontSize: 12, fontWeight: "800" },
  navTextActive: { color: "#FFFFFF" },
  pressed: { opacity: 0.68, transform: [{ scale: 0.985 }] },
});

Object.assign(s, {
  tripThumb: { width: 94 },
  modalBack: {
    flex: 1,
    backgroundColor: "rgba(10,18,35,.42)",
    justifyContent: "flex-end",
  },
  modalDismiss: { flex: 1 },
  sheet: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    backgroundColor: "#F7F5F0",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 36,
  },
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
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginTop: 2,
    position: "relative",
  },
  sheetHeadTape: {
    position: "absolute",
    top: -5,
    left: 32,
    width: 38,
    height: 10,
    borderRadius: 2,
    opacity: 0.48,
    transform: [{ rotate: "-3deg" }],
  },
  sheetFormBody: {
    paddingHorizontal: 1,
  },
  sheetHeadMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  sheetHeadCopy: { flex: 1 },
  sheetKindRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  sheetKindDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  sheetKindText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  sheetRouteLine: { width: 27, height: 1, marginLeft: 8, marginRight: 5 },
  sheetRouteDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5 },
  sheetTitle: {
    color: "#17233D",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1,
  },
  sheetSubtitle: { fontSize: 11, marginTop: 4 },
  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetClose: { color: "#6556D8", fontSize: 22, lineHeight: 24, fontWeight: "500" },
  infoSheetHead: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  infoSheetDone: {
    minWidth: 52,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  infoSheetDoneText: { fontSize: 13, lineHeight: 17, fontWeight: "900" },
  infoSheetBody: { paddingBottom: 8 },
  field: { marginBottom: 14 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  fieldLabelDot: { width: 5, height: 5, borderRadius: 3, marginRight: 7 },
  fieldLabel: {
    color: "#6F7888",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 0,
  },
  fieldInput: {
    height: 49,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 15,
    color: "#17233D",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#E5E3DD",
  },
  sheetSubmit: {
    height: 50,
    borderRadius: 17,
    backgroundColor: "#17233D",
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    paddingLeft: 18,
    paddingRight: 7,
    marginTop: 6,
  },
  sheetSubmitText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  sheetSubmitDisabled: { opacity: 0.38 },
  sheetSubmitArrow: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSubmitArrowText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  sheetCopy: {
    color: "#556071",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  choice: {
    minHeight: 56,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DEDCD5",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
    backgroundColor: "#FFFFFF",
  },
  choiceSelected: { borderColor: "#8B7CF6", backgroundColor: "#E9E5FF" },
  choiceText: { color: "#576173", fontSize: 14, fontWeight: "800" },
  choiceTextSelected: { color: "#5546C8" },
  choiceMark: { color: "#6556D8", fontSize: 16, fontWeight: "900" },
});

Object.assign(s, {
  profileGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  dayBadge: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    backgroundColor: "#FFF0ED",
    borderWidth: 1,
    borderColor: "#FFD6D0",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dayBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF6B5F",
  },
  dayBadgeText: {
    color: "#C94D45",
    fontSize: 11,
    letterSpacing: 0.45,
    fontWeight: "900",
  },
  greeting: {
    color: "#17233D",
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -1.8,
    fontWeight: "800",
    marginTop: 48,
  },
});

Object.assign(s, {
  tripExplorerPage: {
    paddingHorizontal: 21,
    paddingTop: 8,
    paddingBottom: 120,
  },
  tripExplorerMapPage: { flex: 1 },
  tripExplorerMapHeader: { paddingHorizontal: 21, paddingTop: 8 },
  viewSwitch: {
    flexDirection: "row",
    backgroundColor: "#EDEAE5",
    borderRadius: 16,
    padding: 4,
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
    backgroundColor: "#17233D",
    shadowColor: "#17233D",
    shadowOpacity: 0.15,
    shadowRadius: 7,
    elevation: 2,
  },
  viewChoiceText: { color: "#858783", fontSize: 13, fontWeight: "900" },
  viewChoiceTextActive: { color: "#FFFFFF" },
  tripRowCompact: { minHeight: 86 },
  noTrips: { paddingVertical: 40, alignItems: "center" },
  noTripsText: { color: "#969A9E", fontSize: 11 },
  mapCard: {
    backgroundColor: "#17233D",
    borderRadius: 24,
    padding: 17,
    overflow: "hidden",
  },
  mapOnly: { flex: 1, width: "100%", position: "relative", overflow: "hidden" },
  mapDragLayer: { ...StyleSheet.absoluteFillObject },
  mapTray: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 132,
    paddingTop: 7,
    paddingBottom: 13,
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
    marginBottom: 9,
  },
  mapTrayTitle: { color: "#17233D", fontSize: 15, fontWeight: "900" },
  mapTrayCount: { color: "#7D8987", fontSize: 11, marginTop: 2 },
  mapTrayClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
  mapTrayMarkText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  mapTrayCopy: { flex: 1, paddingHorizontal: 10 },
  mapTrayName: { color: "#17233D", fontSize: 12, fontWeight: "900" },
  mapTrayDate: { color: "#8A918F", fontSize: 11, marginTop: 4 },
  mapTrayArrow: { color: "#159D8D", fontSize: 20 },
  mapTrayEmpty: {
    color: "#8A918F",
    fontSize: 11,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  mapIntro: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mapKicker: {
    color: "#5ED8C9",
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: "900",
  },
  mapTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 5,
  },
  mapScore: {
    width: 49,
    height: 49,
    borderRadius: 16,
    backgroundColor: "#263657",
    alignItems: "center",
    justifyContent: "center",
  },
  mapScoreValue: { color: "#5ED8C9", fontSize: 17, fontWeight: "900" },
  mapScoreLabel: { color: "#9FABC1", fontSize: 11, marginTop: 1 },
  mapCanvas: { height: 354, marginTop: 4, position: "relative" },
  mapPin: {
    position: "absolute",
    transform: [{ translateX: -20 }, { translateY: -12 }],
    width: 40,
    height: 25,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#A9D9D1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  mapPinVisited: { backgroundColor: "#19B6A3", borderColor: "#FFFFFF" },
  mapPinActive: {
    backgroundColor: "#FF6B5F",
    borderColor: "#FFFFFF",
    transform: [{ translateX: -20 }, { translateY: -12 }, { scale: 1.08 }],
  },
  mapPinText: {
    color: "#438178",
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "900",
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
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pinCountText: { color: "#17233D", fontSize: 11, fontWeight: "900" },
  mapHint: {
    color: "#8795AE",
    fontSize: 11,
    textAlign: "center",
    marginTop: -3,
  },
  zoomControls: {
    position: "absolute",
    right: 5,
    bottom: 14,
    width: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
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
  zoomText: { color: "#17233D", fontSize: 19, fontWeight: "700" },
  zoomDivider: { height: 1, backgroundColor: "#E6E9E7", marginHorizontal: 7 },
  mapResults: { marginTop: 18 },
  mapResultHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 5,
  },
  mapResultTitle: { color: "#17233D", fontSize: 16, fontWeight: "900" },
  mapResultCount: { color: "#19A996", fontSize: 11, fontWeight: "900" },
  calendarCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ECE9E3",
  },
  calendarHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  monthArrow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F1EFEA",
    alignItems: "center",
    justifyContent: "center",
  },
  monthArrowText: { color: "#17233D", fontSize: 23, lineHeight: 25 },
  calendarMonth: {
    color: "#17233D",
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },
  calendarSub: {
    color: "#93969D",
    fontSize: 11,
    textAlign: "center",
    marginTop: 3,
  },
  weekRow: { flexDirection: "row", marginBottom: 7 },
  weekName: {
    width: "14.285%",
    textAlign: "center",
    color: "#9B9DA2",
    fontSize: 11,
    fontWeight: "800",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.285%",
    aspectRatio: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
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
  dayNumber: { color: "#525762", fontSize: 11, fontWeight: "700" },
  dayNumberTrip: { color: "#FFFFFF", fontWeight: "900" },
  dayNumberSelected: { fontSize: 12 },
  dayTripDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
    marginTop: 2,
  },
  calendarLegend: {
    borderTopWidth: 1,
    borderTopColor: "#EFEEE9",
    marginTop: 12,
    paddingTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 11,
  },
  calendarLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  calendarLegendDot: { width: 7, height: 7, borderRadius: 4 },
  calendarLegendText: { color: "#737780", fontSize: 11, fontWeight: "700" },
  calendarResults: { marginTop: 17 },
  calendarResultDate: {
    color: "#17233D",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  emptyDate: {
    backgroundColor: "#EEF8F5",
    borderRadius: 17,
    padding: 20,
    alignItems: "center",
  },
  emptyDateTitle: { color: "#5E6D6B", fontSize: 11, fontWeight: "800" },
  emptyDateAction: {
    color: "#0B9888",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
  },
  regionChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 7,
    marginBottom: 16,
  },
  regionChoice: {
    borderWidth: 1,
    borderColor: "#DEDCD5",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  regionChoiceActive: { borderColor: "#19A996", backgroundColor: "#DDF7F1" },
  regionChoiceText: { color: "#7E8388", fontSize: 12, fontWeight: "800" },
  regionChoiceTextActive: { color: "#087D70" },
});

Object.assign(s, {
  homeLead: {
    marginTop: 30,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  homeLeadLabel: {
    color: "#FF6257",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  homeLeadTitle: {
    color: "#17233D",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1.3,
    marginTop: 6,
  },
  homeLeadDate: { color: "#747D8D", fontSize: 11, marginTop: 5 },
  homeAllTrips: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#EFECFF",
  },
  homeAllTripsText: { color: "#6556D8", fontSize: 13, fontWeight: "900" },
  homeTripCard: {
    marginTop: 16,
    borderRadius: 24,
    padding: 17,
    backgroundColor: "#17233D",
    shadowColor: "#17233D",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  homeTripTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  homeStayLabel: {
    color: "#5ED8C9",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  homeStayName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5,
  },
  homeStayMeta: { color: "#9EABBF", fontSize: 11, marginTop: 4 },
  homeTripArrow: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#263657",
    alignItems: "center",
    justifyContent: "center",
  },
  homeTripArrowText: { color: "#FFFFFF", fontSize: 24, lineHeight: 25 },
  homeProgressRow: {
    marginTop: 17,
    paddingTop: 15,
    borderTopWidth: 1,
    borderColor: "#2C3B59",
    flexDirection: "row",
  },
  homeMetric: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 5,
  },
  homeMetricValue: { fontSize: 18, fontWeight: "900" },
  homeMetricLabel: { color: "#AAB4C7", fontSize: 11, fontWeight: "800" },
  homeQuickRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  homeQuick: {
    flex: 1,
    height: 72,
    borderRadius: 18,
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
    paddingHorizontal: 18,
    transform: [{ rotate: "-0.7deg" }],
  },
  homeQuickSmall: {
    height: 58,
    borderRadius: 15,
    justifyContent: "flex-start",
    paddingHorizontal: 12,
  },
  homeQuickRail: {
    height: 54,
    borderWidth: 0,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  homeQuickIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  homeQuickIconEmbedded: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 0,
    marginRight: 6,
  },
  homeQuickIconLarge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 0,
    marginBottom: 13,
  },
  homeQuickIconRail: {
    width: 25,
    height: 25,
    borderRadius: 13,
    marginBottom: 0,
    marginRight: 6,
  },
  homeQuickIconText: { fontSize: 15, fontWeight: "900" },
  homeQuickLabel: { color: "#414A59", fontSize: 13, fontWeight: "900" },
  homeQuickLabelEmbedded: { fontSize: 11, fontWeight: "800" },
  homeQuickLabelLarge: { fontSize: 16, fontWeight: "900" },
  homeQuickLabelRail: { fontSize: 11, fontWeight: "800" },
  homeSectionHead: {
    marginTop: 29,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  homeSectionEyebrow: {
    color: "#8B7CF6",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  homeSectionTitle: {
    color: "#17233D",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  homeSectionAction: { color: "#6556D8", fontSize: 11, fontWeight: "900" },
  homeActionCard: {
    borderRadius: 21,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECEAE5",
  },
  homeActionRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#EFEEE9",
  },
  homeActionRowLast: { borderBottomWidth: 0 },
  homeActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  homeActionCopy: { flex: 1, paddingHorizontal: 11 },
  homeActionTitle: { color: "#273143", fontSize: 11, fontWeight: "900" },
  homeActionMeta: { color: "#9299A4", fontSize: 11, marginTop: 4 },
  homeActionDue: { color: "#0B9888", fontSize: 11, fontWeight: "900" },
  searchPage: { paddingHorizontal: 21, paddingTop: 8, paddingBottom: 100 },
  searchBoxNew: {
    height: 54,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3E4E1",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginTop: 23,
  },
  searchSymbolNew: { color: "#17233D", fontSize: 22, marginRight: 8 },
  searchInputNew: { flex: 1, color: "#17233D", fontSize: 13 },
  searchClear: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#EEF0EE",
    alignItems: "center",
    justifyContent: "center",
  },
  searchClearText: { color: "#727A82", fontSize: 17, lineHeight: 18 },
  searchCategories: { gap: 7, paddingVertical: 14 },
  searchCategory: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    backgroundColor: "#EBEAE6",
    alignItems: "center",
    justifyContent: "center",
  },
  searchCategoryActive: { backgroundColor: "#17233D" },
  searchCategoryText: { color: "#747A80", fontSize: 11, fontWeight: "900" },
  searchCategoryTextActive: { color: "#FFFFFF" },
  searchGuide: {
    borderRadius: 14,
    backgroundColor: "#E4F6F2",
    padding: 14,
    marginBottom: 18,
  },
  searchGuideTitle: { color: "#126E64", fontSize: 14, fontWeight: "900" },
  searchGuideCopy: {
    color: "#63817D",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  searchSuggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  searchSuggestion: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  searchSuggestionText: { color: "#087D70", fontSize: 11, fontWeight: "800" },
  searchResultHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  searchResultTitle: { color: "#17233D", fontSize: 16, fontWeight: "900" },
  searchResultCount: { color: "#8C939B", fontSize: 11, fontWeight: "800" },
  searchResultCard: {
    minHeight: 82,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECEAE5",
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  searchResultIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  searchResultDot: { width: 9, height: 9, borderRadius: 5 },
  searchResultCopy: { flex: 1, paddingHorizontal: 11 },
  searchResultLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  searchResultName: { color: "#273143", fontSize: 13, fontWeight: "900" },
  searchResultType: { fontSize: 11, fontWeight: "900" },
  searchResultDetail: { color: "#747D88", fontSize: 11, marginTop: 5 },
  searchResultTrip: { color: "#A0A5AB", fontSize: 11, marginTop: 3 },
  searchResultArrow: { color: "#9AA1A8", fontSize: 20 },
  searchEmpty: { paddingVertical: 55, alignItems: "center" },
  searchEmptyTitle: { color: "#394353", fontSize: 14, fontWeight: "900" },
  searchEmptyCopy: { color: "#959BA2", fontSize: 11, marginTop: 6 },
  emptyInlineAction: {
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  emptyInlineActionText: { fontSize: 11, fontWeight: "900" },
  togetherHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  togetherEdit: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#EFECFF",
  },
  togetherEditText: { color: "#6556D8", fontSize: 11, fontWeight: "900" },
  togetherProfile: {
    marginTop: 24,
    borderRadius: 23,
    padding: 17,
    backgroundColor: "#17233D",
    flexDirection: "row",
    alignItems: "center",
  },
  togetherAvatarStack: { width: 114, height: 52, position: "relative" },
  togetherAvatar: {
    position: "absolute",
    left: 0,
    width: 50,
    height: 50,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: "#17233D",
    alignItems: "center",
    justifyContent: "center",
  },
  togetherAvatarSecond: { left: 28 },
  togetherAvatarText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  togetherProfileCopy: { flex: 1, paddingLeft: 2 },
  togetherProfileName: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  togetherProfileMeta: { color: "#AAB4C7", fontSize: 11, marginTop: 5 },
  togetherChevron: { color: "#FFFFFF", fontSize: 22 },
  togetherStats: {
    marginTop: 10,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECEAE5",
    height: 78,
    flexDirection: "row",
    alignItems: "center",
  },
  togetherStat: { flex: 1, alignItems: "center" },
  togetherStatValue: { color: "#17233D", fontSize: 17, fontWeight: "900" },
  togetherStatLabel: { color: "#8C939B", fontSize: 11, marginTop: 4 },
  togetherStatDivider: { width: 1, height: 28, backgroundColor: "#E8E8E4" },
  settingGroupLabel: {
    color: "#7A818C",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 25,
    marginBottom: 8,
  },
  settingGroup: {
    borderRadius: 20,
    paddingHorizontal: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECEAE5",
    overflow: "hidden",
  },
  bottom: {
    height: 76,
    backgroundColor: "#17233D",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 7,
  },
  navItem: { width: 64, alignItems: "center" },
  navIconWrap: {
    width: 38,
    height: 32,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  navIconWrapActive: { backgroundColor: "#263657" },
  navIcon: { color: "#78849A", fontSize: 18, fontWeight: "800" },
  navIconActive: { color: "#5ED8C9" },
  navText: { color: "#8994A8", fontSize: 12, fontWeight: "800" },
  navTextActive: { color: "#FFFFFF" },
});

Object.assign(s, {
  sheet: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "92%",
    alignSelf: "center",
    backgroundColor: "#F7F5F0",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 24,
  },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  regionChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingTop: 7,
    paddingBottom: 16,
  },
  regionChoice: {
    borderWidth: 1,
    borderColor: "#DEDCD5",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  regionMoreChoice: { borderStyle: "dashed" },
  rangeField: { marginBottom: 17 },
  rangeSummary: {
    minHeight: 62,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: "#17233D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  rangeSummaryLabel: { color: "#5ED8C9", fontSize: 11, fontWeight: "900" },
  rangeSummaryValue: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 5,
  },
  rangeNights: {
    minWidth: 42,
    height: 30,
    borderRadius: 11,
    paddingHorizontal: 8,
    backgroundColor: "#263657",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeNightsText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  rangeCalendar: {
    marginTop: 8,
    borderRadius: 18,
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
    marginBottom: 9,
  },
  rangeMonthButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#F0F1EE",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeMonthArrow: { color: "#17233D", fontSize: 19, lineHeight: 20 },
  rangeMonthTitle: { color: "#17233D", fontSize: 13, fontWeight: "900" },
  rangeWeek: { flexDirection: "row", marginBottom: 3 },
  rangeWeekday: {
    width: "14.285%",
    color: "#969CA3",
    fontSize: 11,
    fontWeight: "800",
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
    borderRadius: 14,
    backgroundColor: "#19B6A3",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeDayText: {
    color: "#59616D",
    fontSize: 11,
    lineHeight: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  rangeDayTextActive: { color: "#087D70", fontWeight: "900" },
  rangeDayTextEdge: { color: "#FFFFFF" },
});

Object.assign(s, {
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  themeOption: {
    width: "48%",
    minHeight: 86,
    borderRadius: 17,
    padding: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DEDCD5",
  },
  themeSwatches: { flexDirection: "row", gap: 5 },
  themeSwatch: { width: 22, height: 22, borderRadius: 8 },
  themeOptionName: {
    color: "#17233D",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 11,
  },
  themeOptionCheck: {
    position: "absolute",
    right: 11,
    bottom: 10,
    color: "#17233D",
    fontSize: 12,
    fontWeight: "900",
  },
});

// Shared notebook language: flatter paper, tighter corners, and fewer dashboard pills.
Object.assign(s, {
  screenHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 7,
    marginBottom: 19,
  },
  overline: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 2,
  },
  screenTitle: {
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -1.2,
    marginTop: 3,
  },
  newTrip: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    transform: [{ rotate: "0.5deg" }],
    shadowColor: "#17233D",
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  viewSwitch: {
    flexDirection: "row",
    borderRadius: 15,
    borderWidth: 1,
    padding: 3,
    marginBottom: 16,
  },
  viewChoice: {
    flex: 1,
    minHeight: 39,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  viewChoiceActive: {
    borderRadius: 11,
    borderWidth: 1,
  },
  tripFilters: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 3,
    borderRadius: 13,
    gap: 2,
    marginBottom: 10,
  },
  filter: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9 },
  tripRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 15,
    paddingLeft: 13,
    paddingRight: 10,
    paddingVertical: 7,
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
  tripThumb: { width: 45, height: 52, marginRight: 1 },
  tripTape: {
    position: "absolute",
    width: 34,
    height: 9,
    left: 18,
    top: -5,
    opacity: 0.8,
    transform: [{ rotate: "-4deg" }],
  },
  tripArtSmall: { width: "100%", height: 52, borderRadius: 9, marginBottom: 0 },
  tripInfo: { flex: 1, paddingLeft: 10 },
  tripName: { fontSize: 14, fontWeight: "900" },
  tripDate: { fontSize: 11, marginTop: 3 },
  tripNote: { fontSize: 11, marginTop: 3 },
  tripRowCompact: { minHeight: 72 },
  tripRowArrow: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  tripRowArrowText: { fontSize: 18, lineHeight: 19, fontWeight: "800" },
  noTrips: {
    minHeight: 190,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  noTripsTitle: { fontSize: 14, fontWeight: "900", marginTop: 10 },
  noTripsText: { fontSize: 11, textAlign: "center", marginTop: 5 },
  emptyInlineAction: {
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginTop: 12,
  },
  emptyInlineActionText: { fontSize: 11, fontWeight: "900" },
  calendarCard: {
    borderRadius: 7,
    paddingHorizontal: 13,
    paddingTop: 21,
    paddingBottom: 9,
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
    borderRadius: 5,
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
  calendarControls: { flexDirection: "row", alignItems: "center", gap: 1 },
  calendarTodayButton: {
    height: 27,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8D4CA",
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 3,
  },
  calendarTodayText: { color: "#596071", fontSize: 10, fontWeight: "800" },
  monthArrowText: { color: "#384052", fontSize: 25, fontWeight: "500", lineHeight: 27 },
  calendarMonth: { color: "#283046", fontSize: 19, fontWeight: "900", textAlign: "left", letterSpacing: 0.2 },
  calendarSub: { color: "#7B7A76", fontSize: 10, textAlign: "left", marginTop: 2 },
  calendarLegend: {
    minHeight: 25,
    borderTopWidth: 0,
    marginTop: 0,
    paddingTop: 0,
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 9,
  },
  calendarLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  calendarLegendLine: { width: 12, height: 3, borderRadius: 2 },
  calendarLegendText: { color: "#6F716F", fontSize: 10, fontWeight: "700" },
  weekRow: { flexDirection: "row", marginBottom: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DFE1E2", paddingBottom: 5 },
  weekName: { width: "14.285%", textAlign: "center", color: "#85888D", fontSize: 10, fontWeight: "800" },
  weekNameSunday: { color: "#C66D68" },
  weekNameSaturday: { color: "#617EA4" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 2 },
  dayCell: {
    width: "14.285%",
    height: 37,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 1,
  },
  dayNumber: { color: "#424957", fontSize: 11, fontWeight: "700" },
  dayNumberBadge: {
    width: 21,
    height: 21,
    borderRadius: 11,
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
    padding: 18,
    alignItems: "center",
  },
  searchBoxNew: {
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginTop: 15,
    shadowColor: "#17233D",
    shadowOpacity: 0.055,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  searchIntro: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  searchCategory: {
    height: 36,
    minWidth: 61,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  searchCategories: {
    width: "100%",
    marginTop: 4,
    marginBottom: 14,
  },
  searchCategoriesContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: 1,
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
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  searchCategoryCountText: { fontSize: 9, fontWeight: "900" },
  searchGuide: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginTop: 4,
    marginBottom: 0,
  },
  searchGuideTitle: {
    fontSize: 10,
    fontWeight: "800",
    marginRight: 12,
  },
  searchSuggestions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchSuggestion: {
    paddingHorizontal: 1,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchSuggestionText: { fontSize: 11, fontWeight: "800" },
  searchResultsSheet: {
    gap: 9,
  },
  searchResultCard: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 10,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchResultTypeBadge: {
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  searchResultMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 4,
  },
  searchResultTag: { fontSize: 11, fontWeight: "800" },
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
  searchResultActionText: { fontSize: 11, fontWeight: "900" },
  searchEmpty: {
    minHeight: 190,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  searchResultIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInputNew: { flex: 1, fontSize: 13, marginLeft: 9 },
  searchResultCopy: { flex: 1, paddingLeft: 4, paddingRight: 9 },
  togetherProfile: {
    marginTop: 21,
    borderRadius: 11,
    padding: 17,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    transform: [{ rotate: "-.3deg" }],
  },
  togetherAvatar: {
    position: "absolute",
    left: 0,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  togetherAvatarSecond: { left: 27 },
  togetherStats: {
    marginTop: 11,
    borderRadius: 10,
    borderWidth: 1,
    height: 75,
    flexDirection: "row",
    alignItems: "center",
  },
  historyHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 9,
  },
  historyEyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  historyTitle: { fontSize: 15, fontWeight: "900", marginTop: 4 },
  historyPeriod: { fontSize: 11, fontWeight: "700" },
  historyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  historyCard: {
    width: "48.8%",
    minHeight: 86,
    borderRadius: 11,
    borderWidth: 1,
    padding: 12,
  },
  historyDot: { width: 7, height: 7, borderRadius: 4, marginBottom: 9 },
  historyValue: { fontSize: 18, fontWeight: "900" },
  historyUnit: { fontSize: 11, fontWeight: "800" },
  historyLabel: { fontSize: 11, fontWeight: "700", marginTop: 5 },
  togetherQuickRow: { flexDirection: "row", gap: 7, marginTop: 9 },
  togetherQuick: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  togetherQuickIcon: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  togetherQuickIconText: { fontSize: 11, fontWeight: "900" },
  togetherQuickLabel: { maxWidth: "100%", fontSize: 11, fontWeight: "800" },
  memberEditCard: { marginBottom: 18 },
  memberRoleText: { fontSize: 11, fontWeight: "700", marginTop: -7 },
  memberPermissionLabel: { fontSize: 11, fontWeight: "900", marginBottom: 8 },
  profileSheetPreview: {
    minHeight: 86,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  profileSheetAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  profileSheetAvatarSecond: { marginLeft: -10 },
  profileSheetName: { flex: 1, fontSize: 13, fontWeight: "900", marginLeft: 12 },
  settingGroup: {
    borderRadius: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    overflow: "hidden",
  },
  togetherEdit: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  themeOption: {
    width: "48%",
    minHeight: 86,
    borderRadius: 10,
    padding: 13,
    borderWidth: 1,
  },
  sheet: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: "91%",
  },
  fieldInput: {
    height: 49,
    borderRadius: 14,
    paddingHorizontal: 15,
    fontSize: 14,
    borderWidth: 1,
  },
  choice: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 15,
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
    paddingTop: 7,
  },
  navItem: { width: 64, alignItems: "center" },
  navIconWrap: {
    width: 40,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  navIcon: { fontSize: 18, fontWeight: "900" },
  navText: { fontSize: 12, fontWeight: "800" },
  controlPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});

Object.assign(s, {
  authPage: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 42,
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
  authMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-4deg" }],
    marginBottom: 12,
  },
  authMarkText: { color: "#FFFFFF", fontSize: 25, fontWeight: "900" },
  authLogo: { fontSize: 30, fontWeight: "900", letterSpacing: -1 },
  authTagline: { fontSize: 11, fontWeight: "700", marginTop: 6 },
  authCard: { borderRadius: 18, borderWidth: 1, padding: 20 },
  authTitle: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  authDescription: { fontSize: 11, lineHeight: 17, marginTop: 7, marginBottom: 19 },
  oauthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  oauthButton: {
    width: "48.7%",
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  oauthMark: { fontSize: 12, fontWeight: "900", marginRight: 7 },
  oauthLabel: { fontSize: 11, fontWeight: "900" },
  authDivider: { flexDirection: "row", alignItems: "center", marginVertical: 18 },
  authDividerLine: { flex: 1, height: 1 },
  authDividerText: { fontSize: 11, fontWeight: "800", marginHorizontal: 10 },
  authError: { color: "#DF5148", fontSize: 11, fontWeight: "800", marginTop: 2 },
  authSubmit: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  authSubmitDisabled: { opacity: 0.38 },
  authSubmitText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  authSwitch: { alignItems: "center", paddingTop: 17, paddingBottom: 2 },
  authSwitchText: { fontSize: 11, fontWeight: "700" },
  authPrivacy: { fontSize: 11, lineHeight: 13, textAlign: "center", marginTop: 15 },
  accountPreview: {
    minHeight: 82,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 18,
  },
  accountAvatar: {
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  accountAvatarText: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  accountPreviewCopy: { flex: 1, marginLeft: 12 },
  accountPreviewName: { fontSize: 14, fontWeight: "900" },
  accountPreviewEmail: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  accountLogout: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  accountLogoutText: { color: "#DF5148", fontSize: 11, fontWeight: "900" },
  togetherHeadActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  togetherSwitch: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  togetherSwitchText: { fontSize: 11, fontWeight: "900" },
  groupChoice: {
    minHeight: 66,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginBottom: 8,
  },
  groupChoiceAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  groupChoiceAvatarText: { fontSize: 13, fontWeight: "900" },
  groupChoiceCopy: { flex: 1, marginLeft: 11 },
  groupChoiceName: { fontSize: 12, fontWeight: "900" },
  groupChoiceMeta: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  groupChoiceCheck: { width: 18, fontSize: 13, fontWeight: "900", textAlign: "center" },
  togetherAccountButton: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  togetherAccountInitial: { fontSize: 13, fontWeight: "900" },
  workspaceCard: {
    minHeight: 86,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 17,
  },
  workspaceMark: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  workspaceMarkText: { fontSize: 17, fontWeight: "900" },
  workspaceCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  workspaceLabel: { fontSize: 11, fontWeight: "800" },
  workspaceName: { fontSize: 14, fontWeight: "900", marginTop: 3 },
  workspaceMeta: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  workspaceSwitchBadge: { height: 29, borderRadius: 9, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  workspaceSwitchBadgeText: { fontSize: 11, fontWeight: "900" },
  groupTabs: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  groupTab: {
    minWidth: 58,
    height: 32,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  groupTabText: { fontSize: 11, fontWeight: "900" },
  groupTabMore: {
    width: 34,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  groupTabMoreText: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  memberSectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 18, marginBottom: 8 },
  memberSectionTitle: { fontSize: 14, fontWeight: "900", marginTop: 3 },
  memberManageText: { fontSize: 11, fontWeight: "900", paddingVertical: 5 },
  memberStrip: { minHeight: 84, borderRadius: 12, borderWidth: 1 },
  memberStripContent: { minWidth: "100%", paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  memberStripItem: { width: 58, alignItems: "center" },
  memberStripAvatar: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  memberStripInitial: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  memberStripName: { width: "100%", textAlign: "center", fontSize: 11, fontWeight: "800", marginTop: 6 },
  memberStripRole: {
    width: "100%",
    textAlign: "center",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
  },
  memberInviteAvatar: { width: 38, height: 38, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  memberInvitePlus: { fontSize: 17, fontWeight: "700" },
  managementLabel: { fontSize: 11, fontWeight: "900", marginTop: 15, marginBottom: -2 },
  historySummary: { minHeight: 73, borderRadius: 11, borderWidth: 1, flexDirection: "row", alignItems: "center" },
  historySummaryItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  historySummaryValue: { fontSize: 16, fontWeight: "900" },
  historySummaryLabel: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  historyLatest: {
    minHeight: 43,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 7,
  },
  historyLatestDot: { width: 7, height: 7, borderRadius: 4 },
  historyLatestLabel: { fontSize: 11, fontWeight: "800" },
  historyLatestName: { flex: 1, fontSize: 11, fontWeight: "900" },
  historyLatestDate: { fontSize: 10, fontWeight: "700" },
  memberManagerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  memberManagerTitle: { fontSize: 14, fontWeight: "900" },
  memberManagerCopy: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  memberManagerInvite: { height: 34, borderRadius: 10, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  memberManagerInviteText: { fontSize: 11, fontWeight: "900" },
  memberManagerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 15 },
  memberManagerCard: { width: "48.8%", minHeight: 61, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center" },
  memberManagerAvatar: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  memberManagerCardCopy: { flex: 1, minWidth: 0, marginLeft: 8 },
  memberManagerName: { fontSize: 11, fontWeight: "900" },
  memberManagerRole: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  memberEditor: { borderRadius: 13, padding: 14 },
  memberEditorEyebrow: { fontSize: 11, fontWeight: "900", marginBottom: 9 },
  memberRemoveButton: { height: 38, alignItems: "center", justifyContent: "center", marginTop: 5 },
  memberRemoveText: { color: "#DF5148", fontSize: 11, fontWeight: "900" },
});
