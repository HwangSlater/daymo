import { useMemo, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
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
const trips: Trip[] = [
  {
    name: "서울 구로구",
    date: "8월 21일 — 23일",
    note: "느긋한 숙소와 밀푀유나베",
    color: "#FF6B5F",
    mark: "08",
    region: "서울",
    start: "2026-08-21",
    end: "2026-08-23",
  },
  {
    name: "안양 평촌",
    date: "8월 1일 — 2일",
    note: "생새우 파티와 치킨",
    color: "#8B7CF6",
    mark: "08",
    region: "경기",
    start: "2026-08-01",
    end: "2026-08-02",
  },
  {
    name: "부산",
    date: "7월 24일 — 26일",
    note: "바다와 드론쇼",
    color: "#19B6A3",
    mark: "07",
    region: "부산",
    start: "2026-07-24",
    end: "2026-07-26",
  },
];

export function WarmAppShell() {
  const systemScheme = useColorScheme();
  const [view, setView] = useState<MainView>("홈");
  const [isTripOpen, setTripOpen] = useState(false);
  const [tripDestination, setTripDestination] =
    useState<TripDetailDestination>("overview");
  const [done, setDone] = useState<string[]>(["깻잎", "양파"]);
  const [themeId, setThemeId] = useState<ThemeId>("daymo");
  const [appearance, setAppearance] = useState<AppearanceMode>("system");
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
  const openTrip = (destination: TripDetailDestination = "overview") => {
    setTripDestination(destination);
    setTripOpen(true);
  };
  if (isTripOpen)
    return (
      <WarmTripDetail
        key={tripDestination}
        done={done}
        toggle={toggle}
        initialDestination={tripDestination}
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
          />
        )}
        {view === "여행" && (
          <TripsExplorer open={() => openTrip()} theme={theme} />
        )}
        {view === "찾기" && <Search open={() => openTrip()} theme={theme} />}
        {view === "우리" && (
          <Together
            theme={theme}
            themeId={themeId}
            setThemeId={setThemeId}
            appearance={appearance}
            setAppearance={setAppearance}
          />
        )}
      </View>
      <BottomBar active={view} setActive={setView} theme={theme} />
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
            우리 1,026일
          </Text>
        </View>
      </View>
      <View
        style={[
          (s as any).paperTrip,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View
          style={[
            (s as any).paperTape,
            { backgroundColor: `${theme.primary}55` },
          ]}
        />
        <View style={(s as any).paperTripHead}>
          <View>
            <Text style={[(s as any).paperKicker, { color: theme.primary }]}>
              열두 밤 뒤에 떠나요
            </Text>
            <Text style={[(s as any).paperTitle, { color: theme.text }]}>
              서울 구로구
            </Text>
            <Text style={[(s as any).paperDate, { color: theme.muted }]}>
              8월 21일 금요일 — 23일 일요일
            </Text>
          </View>
          <Text style={[(s as any).paperDoodle, { color: theme.secondary }]}>
            ✿
          </Text>
        </View>
        <View style={[(s as any).paperRule, { borderColor: theme.border }]} />
        <Pressable onPress={() => open()} style={(s as any).paperStay}>
          <View
            style={[
              (s as any).paperPin,
              { backgroundColor: `${theme.secondary}22` },
            ]}
          >
            <Text style={{ color: theme.secondary }}>⌂</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[(s as any).paperStayLabel, { color: theme.muted }]}>
              우리 숙소
            </Text>
            <Text style={[(s as any).paperStayName, { color: theme.text }]}>
              JS호텔 · 오후 3시 체크인
            </Text>
          </View>
          <Text style={{ color: theme.muted }}>›</Text>
        </Pressable>
        <View style={(s as any).paperCounts}>
          <Text style={[(s as any).paperCount, { color: theme.text }]}>
            일정 <Text style={{ color: theme.primary }}>3</Text>
          </Text>
          <Text style={[(s as any).paperCount, { color: theme.text }]}>
            장소 <Text style={{ color: theme.secondary }}>8</Text>
          </Text>
          <Text style={[(s as any).paperCount, { color: theme.text }]}>
            준비 <Text style={{ color: theme.accent }}>2/6</Text>
          </Text>
        </View>
      </View>
      <View style={(s as any).pencilActions}>
        <HomeQuick
          theme={theme}
          icon="＋"
          label="일정 쓰기"
          tint={theme.primarySoft}
          color={theme.primary}
          onPress={() => open("schedule-add")}
        />
        <HomeQuick
          theme={theme}
          icon="⌖"
          label="장소 모음"
          tint={`${theme.secondary}20`}
          color={theme.secondary}
          onPress={() => open("places")}
        />
        <HomeQuick
          theme={theme}
          icon="✓"
          label="준비물"
          tint={`${theme.accent}20`}
          color={theme.accent}
          onPress={() => open("preparation")}
        />
      </View>
      <View style={(s as any).noteTitleRow}>
        <View>
          <Text style={[(s as any).noteTitleSmall, { color: theme.primary }]}>
            같이 확인해요
          </Text>
          <Text style={[(s as any).noteTitle, { color: theme.text }]}>
            떠나기 전 메모
          </Text>
        </View>
        <Pressable onPress={goTrips}>
          <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "700" }}>
            여행 모두 보기
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          (s as any).memoPaper,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <MemoRow
          theme={theme}
          color={theme.primary}
          text="숙소 예약 정보 확인"
          meta="오늘 · 함께"
          onPress={() => open()}
        />
        <MemoRow
          theme={theme}
          color={theme.accent}
          text="아직 안 챙긴 준비물 2개"
          meta="나 1 · 동행 1"
          onPress={() => open("preparation")}
        />
        <MemoRow
          theme={theme}
          color={theme.secondary}
          text="후보 장소에서 일정 고르기"
          meta="식당 5 · 카페 3"
          onPress={() => open("places")}
          last
        />
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
      style={[
        (s as any).memoRow,
        { borderColor: theme.border },
        last && { borderBottomWidth: 0 },
      ]}
    >
      <View style={[(s as any).memoCheck, { borderColor: color }]} />
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
            지금 함께 할 일
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
              나 1 · 동행 1
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
              후보 장소에서 일정 고르기
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
}: {
  icon: string;
  label: string;
  tint: string;
  color: string;
  onPress: () => void;
  theme: AppTheme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        (s as any).homeQuick,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[(s as any).homeQuickIcon, { backgroundColor: tint }]}>
        <Text style={[(s as any).homeQuickIconText, { color }]}>{icon}</Text>
      </View>
      <Text style={[(s as any).homeQuickLabel, { color: theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

type TripView = "목록" | "지도" | "캘린더";

function TripsExplorer({ open, theme }: { open: () => void; theme: AppTheme }) {
  const [display, setDisplay] = useState<TripView>("목록");
  const [filter, setFilter] = useState<"전체" | "예정" | "추억">("전체");
  const [items, setItems] = useState<Trip[]>(trips);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [month, setMonth] = useState({ year: 2026, value: 8 });
  const [creating, setCreating] = useState(false);
  const [place, setPlace] = useState("");
  const [tripStart, setTripStart] = useState("2026-09-12");
  const [tripEnd, setTripEnd] = useState("2026-09-14");
  const [note, setNote] = useState("함께 만들 새로운 여행");
  const [newRegion, setNewRegion] = useState("서울");
  const filtered =
    filter === "예정"
      ? items.filter((trip) => trip.start >= "2026-08-09")
      : filter === "추억"
        ? items.filter((trip) => trip.start < "2026-08-09")
        : items;
  const visibleTrips = selectedRegion
    ? filtered.filter((trip) => trip.region === selectedRegion)
    : filtered;
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
          <Text style={[s.overline, { color: theme.primary }]}>
            우리의 여행 지도
          </Text>
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
          <Text style={s.newTripText}>새 여행</Text>
        </Pressable>
      </View>
      <View
        style={[(s as any).viewSwitch, { backgroundColor: theme.surfaceAlt }]}
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
              {item === "목록"
                ? "☰  목록"
                : item === "지도"
                  ? "⌖  지도"
                  : "▦  캘린더"}
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
            trips={items}
            results={visibleTrips}
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
              <TripRows items={filtered} open={open} theme={theme} />
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
                    { backgroundColor: theme.surfaceAlt },
                  ]}
                >
                  <Text
                    style={[(s as any).emptyDateTitle, { color: theme.muted }]}
                  >
                    이날은 아직 비어 있어요.
                  </Text>
                  <Pressable onPress={createFromDate}>
                    <Text
                      style={[
                        (s as any).emptyDateAction,
                        { color: theme.secondary },
                      ]}
                    >
                      이 날짜로 여행 만들기 +
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
        submit="여행 만들기"
        onClose={() => setCreating(false)}
        onSubmit={addTrip}
      >
        <Field
          theme={theme}
          label="여행지"
          value={place}
          onChangeText={setPlace}
          placeholder="예: 제주 애월"
        />
        <Text style={[(s as any).fieldLabel, { color: theme.muted }]}>
          지역
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={(s as any).regionChoices}
        >
          {regionPins.map((pin) => (
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
        </ScrollView>
        <TripDateRangePicker
          theme={theme}
          start={tripStart}
          end={tripEnd}
          setStart={setTripStart}
          setEnd={setTripEnd}
        />
        <Field
          theme={theme}
          label="한 줄 메모"
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
}: {
  items: Trip[];
  open: () => void;
  compact?: boolean;
  theme: AppTheme;
}) {
  if (!items.length)
    return (
      <View style={(s as any).noTrips}>
        <Text style={[(s as any).noTripsText, { color: theme.muted }]}>
          이 조건에 맞는 여행이 없어요.
        </Text>
      </View>
    );
  return (
    <>
      {items.map((trip, index) => (
        <Pressable
          key={`${trip.name}-${index}`}
          onPress={open}
          style={({ pressed }) => [
            s.tripRow,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ rotate: index % 2 ? ".25deg" : "-.25deg" }],
            },
            compact && (s as any).tripRowCompact,
            pressed && (s as any).pressed,
          ]}
        >
          <View
            style={[
              (s as any).tripTape,
              { backgroundColor: `${trip.color}4D` },
            ]}
          />
          <View style={(s as any).tripThumb}>
            <TripArt color={trip.color} date={trip.mark} small />
          </View>
          <View style={s.tripInfo}>
            <Text style={[s.tripName, { color: theme.text }]}>{trip.name}</Text>
            <Text style={[s.tripDate, { color: theme.muted }]}>
              {trip.date}
            </Text>
            <Text style={[s.tripNote, { color: theme.muted }]}>
              {trip.note}
            </Text>
          </View>
          <Text style={[s.arrow, { color: theme.primary }]}>›</Text>
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
  trips,
  results,
  selected,
  onSelect,
  open,
}: {
  trips: Trip[];
  results: Trip[];
  selected: string | null;
  onSelect: (region: string) => void;
  open: () => void;
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
        <Path d={koreaLandPath} fill="#DDF4EF" stroke="none" />
        <Path
          d={koreaOutlinePath}
          fill="none"
          stroke="#159D8D"
          strokeWidth={2.2 / zoom}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Path
          d={koreaAdminPath}
          fill="none"
          stroke="#4DA99E"
          strokeWidth={0.75 / zoom}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {zoom >= 2 && (
          <Path
            d={cityPath!}
            fill="none"
            stroke="#8CCFC7"
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
              count > 0 && (s as any).mapPinVisited,
              active && (s as any).mapPinActive,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                (s as any).mapPinText,
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
        <View style={(s as any).mapTray}>
          <View style={(s as any).mapTrayHandle} />
          <View style={(s as any).mapTrayHead}>
            <View>
              <Text style={(s as any).mapTrayTitle}>{selected} 여행</Text>
              <Text style={(s as any).mapTrayCount}>
                {results.length
                  ? `${results.length}개의 여행`
                  : "아직 등록된 여행이 없어요"}
              </Text>
            </View>
            <Pressable
              onPress={() => onSelect(selected)}
              style={(s as any).mapTrayClose}
            >
              <Text style={(s as any).mapTrayCloseText}>×</Text>
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
                  onPress={open}
                  style={(s as any).mapTrayCard}
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
                    <Text numberOfLines={1} style={(s as any).mapTrayName}>
                      {trip.name}
                    </Text>
                    <Text numberOfLines={1} style={(s as any).mapTrayDate}>
                      {trip.date}
                    </Text>
                  </View>
                  <Text style={(s as any).mapTrayArrow}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={(s as any).mapTrayEmpty}>
              다른 지역을 눌러 여행을 찾아보세요.
            </Text>
          )}
        </View>
      )}
      <View
        style={[
          (s as any).zoomControls,
          selected && (s as any).zoomControlsRaised,
        ]}
      >
        <Pressable
          disabled={zoom <= 1}
          onPress={() => changeZoom(-0.5)}
          style={[
            (s as any).zoomButton,
            zoom <= 1 && (s as any).zoomButtonDisabled,
          ]}
        >
          <Text style={(s as any).zoomText}>−</Text>
        </Pressable>
        <View style={(s as any).zoomDivider} />
        <Pressable
          disabled={zoom >= MAP_MAX_ZOOM}
          onPress={() => changeZoom(0.5)}
          style={[
            (s as any).zoomButton,
            zoom >= MAP_MAX_ZOOM && (s as any).zoomButtonDisabled,
          ]}
        >
          <Text style={(s as any).zoomText}>＋</Text>
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
  const move = (amount: number) => {
    const next = new Date(month.year, month.value - 1 + amount, 1);
    setMonth({ year: next.getFullYear(), value: next.getMonth() + 1 });
    setSelectedDate(null);
  };
  return (
    <View
      style={[
        (s as any).calendarCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={(s as any).calendarHead}>
        <Pressable
          onPress={() => move(-1)}
          style={[(s as any).monthArrow, { backgroundColor: theme.surfaceAlt }]}
        >
          <Text style={[(s as any).monthArrowText, { color: theme.text }]}>
            ‹
          </Text>
        </Pressable>
        <View>
          <Text style={[(s as any).calendarMonth, { color: theme.text }]}>
            {month.year}. {String(month.value).padStart(2, "0")}
          </Text>
          <Text style={[(s as any).calendarSub, { color: theme.muted }]}>
            여행이 있는 날은 색으로 이어져요
          </Text>
        </View>
        <Pressable
          onPress={() => move(1)}
          style={[(s as any).monthArrow, { backgroundColor: theme.surfaceAlt }]}
        >
          <Text style={[(s as any).monthArrowText, { color: theme.text }]}>
            ›
          </Text>
        </Pressable>
      </View>
      <View style={(s as any).weekRow}>
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <Text key={day} style={[(s as any).weekName, { color: theme.muted }]}>
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
          const selected = key === selectedDate;
          return (
            <Pressable
              key={`${index}-${day}`}
              disabled={!valid}
              onPress={() => setSelectedDate(key)}
              style={[
                (s as any).dayCell,
                trip && { backgroundColor: trip.color },
                selected && (s as any).dayCellSelected,
              ]}
            >
              <Text
                style={[
                  (s as any).dayNumber,
                  { color: theme.text },
                  trip && (s as any).dayNumberTrip,
                  selected && (s as any).dayNumberSelected,
                ]}
              >
                {valid ? day : ""}
              </Text>
              {trip && <View style={(s as any).dayTripDot} />}
            </Pressable>
          );
        })}
      </View>
      <View style={(s as any).calendarLegend}>
        {trips
          .filter(
            (trip) =>
              trip.start.slice(0, 7) ===
              `${month.year}-${String(month.value).padStart(2, "0")}`,
          )
          .map((trip) => (
            <View key={trip.name} style={(s as any).calendarLegendItem}>
              <View
                style={[
                  (s as any).calendarLegendDot,
                  { backgroundColor: trip.color },
                ]}
              />
              <Text
                style={[(s as any).calendarLegendText, { color: theme.muted }]}
              >
                {trip.name}
              </Text>
            </View>
          ))}
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
                  <View style={[edge && (s as any).rangeDayCircle]}>
                    <Text
                      style={[
                        (s as any).rangeDayText,
                        inRange && (s as any).rangeDayTextActive,
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
  const [note, setNote] = useState("함께 만들 새로운 여행");
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

function Search({ open, theme }: { open: () => void; theme: AppTheme }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const allResults = [
    {
      title: "은행골블랙",
      type: "장소",
      trip: "서울 구로구",
      detail: "8.22 토요일 저녁 예약",
      color: "#19B6A3",
    },
    {
      title: "밀푀유나베",
      type: "요리",
      trip: "서울 구로구",
      detail: "재료 6개 · 동행 담당",
      color: "#F0A351",
    },
    {
      title: "우사기쇼쿠도",
      type: "장소",
      trip: "안양 평촌",
      detail: "돈테키덮밥 · 11시 영업",
      color: "#19B6A3",
    },
    {
      title: "충전기",
      type: "준비",
      trip: "진주",
      detail: "아침에 챙길 것",
      color: "#8B7CF6",
    },
    {
      title: "포켓몬 드론쇼",
      type: "일정",
      trip: "부산",
      detail: "7.25 토요일 · 광안리",
      color: "#FF6B5F",
    },
  ];
  const results = useMemo(
    () =>
      allResults.filter(
        (item) =>
          (category === "전체" || item.type === category) &&
          `${item.title} ${item.trip} ${item.detail}`.includes(query.trim()),
      ),
    [query, category],
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
      <View
        style={[
          (s as any).searchBoxNew,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Text style={[(s as any).searchSymbolNew, { color: theme.text }]}>
          ⌕
        </Text>
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={(s as any).searchCategories}
      >
        {["전체", "장소", "일정", "요리", "준비"].map((item) => (
          <Pressable
            key={item}
            onPress={() => setCategory(item)}
            style={[
              (s as any).searchCategory,
              { backgroundColor: theme.surfaceAlt },
              category === item && (s as any).searchCategoryActive,
              category === item && { backgroundColor: theme.primarySoft },
            ]}
          >
            <Text
              style={[
                (s as any).searchCategoryText,
                { color: theme.muted },
                category === item && (s as any).searchCategoryTextActive,
                category === item && { color: theme.primary },
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {!query && category === "전체" && (
        <View
          style={[
            (s as any).searchGuide,
            { backgroundColor: theme.surfaceAlt },
          ]}
        >
          <Text
            style={[(s as any).searchGuideTitle, { color: theme.secondary }]}
          >
            흩어진 기록도 한 번에
          </Text>
          <Text style={[(s as any).searchGuideCopy, { color: theme.muted }]}>
            여행 이름뿐 아니라 네이버 지도 장소, 요리 재료와 준비물까지 찾아요.
          </Text>
          <View style={(s as any).searchSuggestions}>
            {["은행골", "충전기", "부산", "밀푀유나베"].map((word) => (
              <Pressable
                key={word}
                onPress={() => setQuery(word)}
                style={[
                  (s as any).searchSuggestion,
                  { backgroundColor: theme.surface },
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
      )}
      <View style={(s as any).searchResultHead}>
        <Text style={[(s as any).searchResultTitle, { color: theme.text }]}>
          {query || category !== "전체" ? "검색 결과" : "최근 찾은 기록"}
        </Text>
        <Text style={[(s as any).searchResultCount, { color: theme.muted }]}>
          {results.length}개
        </Text>
      </View>
      {results.map((item, index) => (
        <Pressable
          key={item.title}
          onPress={open}
          style={[
            (s as any).searchResultCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ rotate: index % 2 ? ".18deg" : "-.18deg" }],
            },
          ]}
        >
          <View
            style={[
              (s as any).searchResultIcon,
              { backgroundColor: `${item.color}20` },
            ]}
          >
            <View
              style={[
                (s as any).searchResultDot,
                { backgroundColor: item.color },
              ]}
            />
          </View>
          <View style={(s as any).searchResultCopy}>
            <View style={(s as any).searchResultLine}>
              <Text
                style={[(s as any).searchResultName, { color: theme.text }]}
              >
                {item.title}
              </Text>
              <Text
                style={[(s as any).searchResultType, { color: item.color }]}
              >
                {item.type}
              </Text>
            </View>
            <Text
              style={[(s as any).searchResultDetail, { color: theme.muted }]}
            >
              {item.detail}
            </Text>
            <Text style={[(s as any).searchResultTrip, { color: theme.muted }]}>
              {item.trip}
            </Text>
          </View>
          <Text style={[(s as any).searchResultArrow, { color: theme.muted }]}>
            ›
          </Text>
        </Pressable>
      ))}
      {!results.length && (
        <View style={(s as any).searchEmpty}>
          <Text style={[(s as any).searchEmptyTitle, { color: theme.text }]}>
            찾는 기록이 없어요
          </Text>
          <Text style={[(s as any).searchEmptyCopy, { color: theme.muted }]}>
            다른 단어나 카테고리로 검색해 보세요.
          </Text>
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
}: {
  theme: AppTheme;
  themeId: ThemeId;
  setThemeId: (value: ThemeId) => void;
  appearance: AppearanceMode;
  setAppearance: (value: AppearanceMode) => void;
}) {
  const [notifications, setNotifications] = useState(true);
  const [relationship, setRelationship] = useState<"연인" | "친구">("연인");
  const [panel, setPanel] = useState<
    | "profile"
    | "members"
    | "relationship"
    | "theme"
    | "appearance"
    | "help"
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
    panel === "members"
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
              공동 여행 공간
            </Text>
            <Text style={[s.screenTitle, { color: theme.text }]}>우리</Text>
          </View>
          <Pressable
            onPress={() => setPanel("profile")}
            style={[
              (s as any).togetherEdit,
              { backgroundColor: theme.primarySoft },
            ]}
          >
            <Text
              style={[(s as any).togetherEditText, { color: theme.primary }]}
            >
              편집
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => setPanel("profile")}
          style={[
            (s as any).togetherProfile,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={(s as any).togetherAvatarStack}>
            <View
              style={[
                (s as any).togetherAvatar,
                {
                  backgroundColor: theme.primary,
                  borderColor: theme.surface,
                },
              ]}
            >
              <Text style={(s as any).togetherAvatarText}>찬</Text>
            </View>
            <View
              style={[
                (s as any).togetherAvatar,
                (s as any).togetherAvatarSecond,
                {
                  backgroundColor: theme.accent,
                  borderColor: theme.surface,
                },
              ]}
            >
              <Text style={(s as any).togetherAvatarText}>세</Text>
            </View>
          </View>
          <View style={(s as any).togetherProfileCopy}>
            <Text
              style={[(s as any).togetherProfileName, { color: theme.text }]}
            >
              우리의 여행 공간
            </Text>
            <Text
              style={[(s as any).togetherProfileMeta, { color: theme.muted }]}
            >
              {relationship} · 함께한 지 1,026일
            </Text>
          </View>
          <Text style={[(s as any).togetherChevron, { color: theme.muted }]}>
            ›
          </Text>
        </Pressable>
        <View
          style={[
            (s as any).togetherStats,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={(s as any).togetherStat}>
            <Text style={[(s as any).togetherStatValue, { color: theme.text }]}>
              12
            </Text>
            <Text
              style={[(s as any).togetherStatLabel, { color: theme.muted }]}
            >
              함께한 여행
            </Text>
          </View>
          <View
            style={[
              (s as any).togetherStatDivider,
              { backgroundColor: theme.border },
            ]}
          />
          <View style={(s as any).togetherStat}>
            <Text style={[(s as any).togetherStatValue, { color: theme.text }]}>
              38
            </Text>
            <Text
              style={[(s as any).togetherStatLabel, { color: theme.muted }]}
            >
              모은 장소
            </Text>
          </View>
          <View
            style={[
              (s as any).togetherStatDivider,
              { backgroundColor: theme.border },
            ]}
          />
          <View style={(s as any).togetherStat}>
            <Text style={[(s as any).togetherStatValue, { color: theme.text }]}>
              146
            </Text>
            <Text
              style={[(s as any).togetherStatLabel, { color: theme.muted }]}
            >
              남긴 사진
            </Text>
          </View>
        </View>
        <Text style={[(s as any).settingGroupLabel, { color: theme.muted }]}>
          함께 쓰는 공간
        </Text>
        <View
          style={[
            (s as any).settingGroup,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Setting
            theme={theme}
            label="멤버 관리"
            value="2명"
            onPress={() => setPanel("members")}
          />
          <Setting
            theme={theme}
            label="초대 링크 공유"
            value="초대"
            onPress={() =>
              Share.share({
                message:
                  "Daymo에서 우리 여행을 함께 기록해요.\nhttps://daymo.app/invite/OUR-TRIP",
              })
            }
          />
          <Setting
            theme={theme}
            label="관계 설정"
            value={relationship}
            onPress={() => setPanel("relationship")}
          />
        </View>
        <Text style={[(s as any).settingGroupLabel, { color: theme.muted }]}>
          화면 꾸미기
        </Text>
        <View
          style={[
            (s as any).settingGroup,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
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
        </View>
        <Text style={[(s as any).settingGroupLabel, { color: theme.muted }]}>
          앱 설정
        </Text>
        <View
          style={[
            (s as any).settingGroup,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Setting
            theme={theme}
            label="알림"
            value={notifications ? "켜짐" : "꺼짐"}
            onPress={() => setNotifications((value) => !value)}
          />
          <Setting
            theme={theme}
            label="여행 데이터 내보내기"
            onPress={exportData}
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
        {panel === "members" && (
          <>
            <Choice theme={theme} selected label="나 · 관리자" />
            <Choice theme={theme} selected label="동행 · 편집 가능" />
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
          <Text style={(s as any).sheetCopy}>
            두 사람이 함께 만든 여행 공간이에요.
          </Text>
        )}
      </InfoSheet>
    </>
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
  const icons: Record<MainView, string> = {
    홈: "⌂",
    여행: "✈",
    찾기: "⌕",
    우리: "♡",
  };
  return (
    <View
      style={[
        s.bottom,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {(["홈", "여행", "찾기", "우리"] as MainView[]).map((item) => (
        <Pressable key={item} onPress={() => setActive(item)} style={s.navItem}>
          <View
            style={[
              (s as any).navIconWrap,
              active === item && {
                backgroundColor: theme.primarySoft,
                transform: [{ rotate: item === "여행" ? "-3deg" : "2deg" }],
              },
            ]}
          >
            <Text
              style={[
                (s as any).navIcon,
                { color: theme.muted },
                active === item && { color: theme.primary },
              ]}
            >
              {icons[item]}
            </Text>
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
}) {
  return (
    <View style={(s as any).field}>
      <Text style={[(s as any).fieldLabel, theme && { color: theme.muted }]}>
        {label}
      </Text>
      <TextInput
        {...props}
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
  submit,
  onClose,
  onSubmit,
  children,
}: {
  theme?: AppTheme;
  visible: boolean;
  title: string;
  submit: string;
  onClose: () => void;
  onSubmit: () => void;
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
          <View style={(s as any).sheetHead}>
            <Text
              style={[(s as any).sheetTitle, theme && { color: theme.text }]}
            >
              {title}
            </Text>
            <Pressable onPress={onClose}>
              <Text
                style={[
                  (s as any).sheetClose,
                  theme && { color: theme.primary },
                ]}
              >
                닫기
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={(s as any).sheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          <Pressable
            onPress={onSubmit}
            style={[
              (s as any).sheetSubmit,
              theme && { backgroundColor: theme.primary },
            ]}
          >
            <Text style={(s as any).sheetSubmitText}>{submit}</Text>
          </Pressable>
        </View>
      </View>
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
          <View style={(s as any).sheetHead}>
            <Text
              style={[(s as any).sheetTitle, theme && { color: theme.text }]}
            >
              {title}
            </Text>
            <Pressable onPress={onClose}>
              <Text
                style={[
                  (s as any).sheetClose,
                  theme && { color: theme.primary },
                ]}
              >
                완료
              </Text>
            </Pressable>
          </View>
          {children}
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
  peopleText: { color: "#9A6156", fontSize: 10, fontWeight: "900" },
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
    fontSize: 10,
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
    fontSize: 10,
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
    fontSize: 10,
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
  taskWho: { color: "#AB8C82", fontSize: 10, fontWeight: "800" },
  archive: { flexDirection: "row" },
  archiveCard: { width: "47%", marginRight: "4%" },
  archiveName: { color: "#633D37", fontSize: 14, fontWeight: "800" },
  archiveDate: { color: "#A58C82", fontSize: 10, marginTop: 3 },
  screenHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
    marginBottom: 23,
  },
  overline: {
    color: "#B87869",
    fontSize: 10,
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
  tripNote: { color: "#B49C93", fontSize: 10, marginTop: 5 },
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
    fontSize: 10,
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
  resultMeta: { color: "#A78D83", fontSize: 10, marginTop: 4 },
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
  settingValue: { color: "#B46F60", fontSize: 10, fontWeight: "800" },
  settingsLabel: {
    color: "#B37B6C",
    fontSize: 10,
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
  navText: { color: "#AB8D82", fontSize: 10, fontWeight: "800" },
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
  tinyDayText: { fontSize: 10, fontWeight: "800" },
  paperTrip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 19,
    paddingTop: 24,
    paddingBottom: 17,
    shadowColor: "#17233D",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    transform: [{ rotate: "-.35deg" }],
  },
  paperTape: {
    position: "absolute",
    width: 66,
    height: 18,
    top: -9,
    left: "50%",
    marginLeft: -33,
    opacity: 0.75,
    transform: [{ rotate: "2deg" }],
  },
  paperTripHead: { flexDirection: "row", justifyContent: "space-between" },
  paperKicker: { fontSize: 10, fontWeight: "800", marginBottom: 7 },
  paperTitle: { fontSize: 27, fontWeight: "900", letterSpacing: -1.2 },
  paperDate: { fontSize: 11, marginTop: 6 },
  paperDoodle: { fontSize: 30, marginTop: 2, transform: [{ rotate: "12deg" }] },
  paperRule: { borderTopWidth: 1, borderStyle: "dashed", marginVertical: 17 },
  paperStay: { flexDirection: "row", alignItems: "center" },
  paperPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  paperStayLabel: { fontSize: 8, fontWeight: "700" },
  paperStayName: { fontSize: 12, fontWeight: "800", marginTop: 3 },
  paperCounts: {
    flexDirection: "row",
    gap: 18,
    marginTop: 17,
    paddingLeft: 44,
  },
  paperCount: { fontSize: 10, fontWeight: "700" },
  pencilActions: { flexDirection: "row", gap: 8, marginTop: 13 },
  noteTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 31,
    marginBottom: 12,
  },
  noteTitleSmall: { fontSize: 9, fontWeight: "800", marginBottom: 4 },
  noteTitle: { fontSize: 20, fontWeight: "900", letterSpacing: -0.6 },
  memoPaper: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 15 },
  memoRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  memoCheck: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    marginRight: 12,
    transform: [{ rotate: "-3deg" }],
  },
  memoText: { fontSize: 12, fontWeight: "800" },
  memoMeta: { fontSize: 9, marginTop: 4 },
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
    fontSize: 8,
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
  peopleText: { color: "#6556D8", fontSize: 10, fontWeight: "900" },
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
    fontSize: 10,
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
    fontSize: 7,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  sectionLabel: {
    color: "#FF6257",
    fontSize: 10,
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
    fontSize: 9,
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
  navText: { color: "#8994A8", fontSize: 10, fontWeight: "800" },
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
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
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
  sheetTitle: {
    color: "#17233D",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1,
  },
  sheetClose: { color: "#6556D8", fontSize: 13, fontWeight: "800" },
  field: { marginBottom: 17 },
  fieldLabel: {
    color: "#6F7888",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 7,
  },
  fieldInput: {
    height: 51,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 15,
    color: "#17233D",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#E5E3DD",
  },
  sheetSubmit: {
    height: 53,
    borderRadius: 17,
    backgroundColor: "#17233D",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  sheetSubmitText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
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
    fontSize: 9,
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
  viewChoiceText: { color: "#858783", fontSize: 10, fontWeight: "900" },
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
  mapTrayCount: { color: "#7D8987", fontSize: 9, marginTop: 2 },
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
  mapTrayDate: { color: "#8A918F", fontSize: 9, marginTop: 4 },
  mapTrayArrow: { color: "#159D8D", fontSize: 20 },
  mapTrayEmpty: {
    color: "#8A918F",
    fontSize: 10,
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
    fontSize: 8,
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
  mapScoreLabel: { color: "#9FABC1", fontSize: 8, marginTop: 1 },
  mapCanvas: { height: 354, marginTop: 4, position: "relative" },
  mapPin: {
    position: "absolute",
    transform: [{ translateX: -18 }, { translateY: -11 }],
    width: 36,
    height: 22,
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
    transform: [{ translateX: -18 }, { translateY: -11 }, { scale: 1.08 }],
  },
  mapPinText: {
    color: "#438178",
    fontSize: 7.5,
    lineHeight: 9,
    fontWeight: "900",
    maxWidth: 29,
    textAlign: "center",
  },
  mapPinTextVisited: { color: "#FFFFFF" },
  pinCount: {
    position: "absolute",
    right: -5,
    top: -6,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pinCountText: { color: "#17233D", fontSize: 7, fontWeight: "900" },
  mapHint: {
    color: "#8795AE",
    fontSize: 9,
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
  zoomButton: { height: 39, alignItems: "center", justifyContent: "center" },
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
  mapResultCount: { color: "#19A996", fontSize: 10, fontWeight: "900" },
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
    fontSize: 8,
    textAlign: "center",
    marginTop: 3,
  },
  weekRow: { flexDirection: "row", marginBottom: 7 },
  weekName: {
    width: "14.285%",
    textAlign: "center",
    color: "#9B9DA2",
    fontSize: 9,
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
  calendarLegendText: { color: "#737780", fontSize: 9, fontWeight: "700" },
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
    fontSize: 10,
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
  regionChoiceText: { color: "#7E8388", fontSize: 10, fontWeight: "800" },
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
    fontSize: 10,
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
  homeAllTripsText: { color: "#6556D8", fontSize: 9, fontWeight: "900" },
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
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  homeStayName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5,
  },
  homeStayMeta: { color: "#9EABBF", fontSize: 10, marginTop: 4 },
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
  homeMetricLabel: { color: "#AAB4C7", fontSize: 9, fontWeight: "800" },
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
  homeQuickIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  homeQuickIconText: { fontSize: 15, fontWeight: "900" },
  homeQuickLabel: { color: "#414A59", fontSize: 9, fontWeight: "900" },
  homeSectionHead: {
    marginTop: 29,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  homeSectionEyebrow: {
    color: "#8B7CF6",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  homeSectionTitle: {
    color: "#17233D",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  homeSectionAction: { color: "#6556D8", fontSize: 9, fontWeight: "900" },
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
  homeActionMeta: { color: "#9299A4", fontSize: 9, marginTop: 4 },
  homeActionDue: { color: "#0B9888", fontSize: 9, fontWeight: "900" },
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
  searchCategoryText: { color: "#747A80", fontSize: 10, fontWeight: "900" },
  searchCategoryTextActive: { color: "#FFFFFF" },
  searchGuide: {
    borderRadius: 20,
    backgroundColor: "#E4F6F2",
    padding: 17,
    marginBottom: 24,
  },
  searchGuideTitle: { color: "#126E64", fontSize: 14, fontWeight: "900" },
  searchGuideCopy: {
    color: "#63817D",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 5,
  },
  searchSuggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  searchSuggestion: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  searchSuggestionText: { color: "#087D70", fontSize: 9, fontWeight: "800" },
  searchResultHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  searchResultTitle: { color: "#17233D", fontSize: 16, fontWeight: "900" },
  searchResultCount: { color: "#8C939B", fontSize: 9, fontWeight: "800" },
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
  searchResultType: { fontSize: 8, fontWeight: "900" },
  searchResultDetail: { color: "#747D88", fontSize: 9, marginTop: 5 },
  searchResultTrip: { color: "#A0A5AB", fontSize: 8, marginTop: 3 },
  searchResultArrow: { color: "#9AA1A8", fontSize: 20 },
  searchEmpty: { paddingVertical: 55, alignItems: "center" },
  searchEmptyTitle: { color: "#394353", fontSize: 14, fontWeight: "900" },
  searchEmptyCopy: { color: "#959BA2", fontSize: 10, marginTop: 6 },
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
  togetherEditText: { color: "#6556D8", fontSize: 9, fontWeight: "900" },
  togetherProfile: {
    marginTop: 24,
    borderRadius: 23,
    padding: 17,
    backgroundColor: "#17233D",
    flexDirection: "row",
    alignItems: "center",
  },
  togetherAvatarStack: { width: 76, height: 52, position: "relative" },
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
  togetherProfileMeta: { color: "#AAB4C7", fontSize: 9, marginTop: 5 },
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
  togetherStatLabel: { color: "#8C939B", fontSize: 8, marginTop: 4 },
  togetherStatDivider: { width: 1, height: 28, backgroundColor: "#E8E8E4" },
  settingGroupLabel: {
    color: "#7A818C",
    fontSize: 9,
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
  navText: { color: "#8994A8", fontSize: 9, fontWeight: "800" },
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
  sheetScroll: { flexGrow: 0 },
  regionChoices: { gap: 7, paddingTop: 7, paddingBottom: 16 },
  regionChoice: {
    borderWidth: 1,
    borderColor: "#DEDCD5",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  rangeField: { marginBottom: 17 },
  rangeSummary: {
    minHeight: 62,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: "#17233D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rangeSummaryLabel: { color: "#5ED8C9", fontSize: 8, fontWeight: "900" },
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
  rangeNightsText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
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
    fontSize: 8,
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
    fontSize: 9,
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
    fontSize: 10,
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
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
    transform: [{ rotate: "1deg" }],
  },
  viewSwitch: {
    flexDirection: "row",
    borderRadius: 0,
    padding: 0,
    marginBottom: 18,
    borderBottomWidth: 1,
    borderColor: "#DEDCD5",
  },
  viewChoice: {
    flex: 1,
    minHeight: 39,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  viewChoiceActive: { borderRadius: 0, borderBottomWidth: 2 },
  tripFilters: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 0,
    borderRadius: 0,
    gap: 8,
    marginBottom: 9,
  },
  filter: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9 },
  tripRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 7,
  },
  tripThumb: { width: 50, height: 58, marginRight: 1 },
  tripTape: {
    position: "absolute",
    width: 34,
    height: 9,
    left: 18,
    top: -5,
    opacity: 0.8,
    transform: [{ rotate: "-4deg" }],
  },
  tripArtSmall: { width: "100%", height: 58, borderRadius: 7, marginBottom: 0 },
  tripInfo: { flex: 1, paddingLeft: 10 },
  tripName: { fontSize: 14, fontWeight: "900" },
  tripDate: { fontSize: 10, marginTop: 3 },
  tripNote: { fontSize: 9, marginTop: 3 },
  calendarCard: { borderRadius: 11, padding: 15, borderWidth: 1 },
  monthArrow: {
    width: 33,
    height: 33,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyDate: { borderRadius: 10, padding: 18, alignItems: "center" },
  searchBoxNew: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginTop: 19,
  },
  searchCategory: {
    height: 32,
    borderRadius: 9,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  searchGuide: {
    borderRadius: 10,
    padding: 16,
    marginBottom: 23,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#B8DCD5",
  },
  searchSuggestion: {
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  searchResultCard: {
    minHeight: 78,
    borderRadius: 9,
    borderWidth: 1,
    padding: 11,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  searchResultIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
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
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 9,
    paddingBottom: 18,
    maxHeight: "90%",
  },
  fieldInput: {
    height: 49,
    borderRadius: 9,
    paddingHorizontal: 14,
    fontSize: 14,
    borderWidth: 1,
  },
  choice: {
    minHeight: 54,
    borderRadius: 9,
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
  navText: { fontSize: 9, fontWeight: "800" },
});
