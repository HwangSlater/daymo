import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WarmTripDetail } from "./src/WarmTripDetail";
import { WarmAppShell } from "./src/WarmAppShell";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";

type MainTab = "Today" | "Trips" | "Search" | "Me";
type TripTab = "일정" | "장소" | "음식" | "준비" | "메모" | "사진" | "정보";

const trips = [
  {
    id: "guro",
    place: "서울 구로구",
    date: "08.21 — 08.23",
    note: "two nights, slow mornings",
    tone: "coral",
  },
  {
    id: "pyeongchon",
    place: "안양 평촌",
    date: "08.01 — 08.02",
    note: "shrimp, chicken, a late walk",
    tone: "lime",
  },
  {
    id: "busan",
    place: "부산",
    date: "07.24 — 07.26",
    note: "sea breeze and train windows",
    tone: "blue",
  },
];

const tripTabs: TripTab[] = [
  "일정",
  "장소",
  "음식",
  "준비",
  "메모",
  "사진",
  "정보",
];

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={s.webStage}>
        <StatusBar style="auto" />
        <WarmAppShell />
      </View>
    </SafeAreaProvider>
  );
}

function Today({
  openTrip,
}: {
  openTrip: (id: string, tab?: TripTab) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.brandRow}>
        <Text style={s.wordmark}>Daymo</Text>
        <View style={s.profileDot}>
          <Text style={s.profileInitial}>CS</Text>
        </View>
      </View>
      <View style={s.intro}>
        <Text style={s.kicker}>SATURDAY, AUGUST 9</Text>
        <Text style={s.display}>A small place{`\n`}for your big days.</Text>
        <Text style={s.introCopy}>둘이 함께 남기는 여행의 순간들</Text>
      </View>
      <View style={s.daysCard}>
        <View>
          <Text style={s.daysLabel}>TOGETHER, TODAY</Text>
          <Text style={s.daysNumber}>1,026</Text>
          <Text style={s.daysCaption}>days and counting</Text>
        </View>
        <View style={s.daysMark}>
          <View style={s.markLine} />
          <View style={[s.markLine, s.markLineShort]} />
          <Text style={s.markText}>C · S</Text>
        </View>
      </View>
      <Section
        label="NEXT UP"
        title="서울 구로구"
        action="여행 보기"
        onPress={() => openTrip("guro")}
      />
      <Pressable onPress={() => openTrip("guro")} style={s.featureTrip}>
        <Cover tone="coral" label="08 / 21" large />
        <View style={s.featureText}>
          <Text style={s.featureDate}>AUG 21 — 23 · 2 NIGHTS</Text>
          <Text style={s.featureTitle}>서울 구로구</Text>
          <Text style={s.featureSub}>느긋한 숙소와 밀푀유나베</Text>
          <View style={s.featureFooter}>
            <Text style={s.chip}>D — 12</Text>
            <Text style={s.arrow}>↗</Text>
          </View>
        </View>
      </Pressable>
      <Section
        label="SHARED LIST"
        title="오늘 함께 챙길 것"
        action="전체 보기"
        onPress={() => openTrip("guro", "준비")}
      />
      <View style={s.listPanel}>
        <MiniTask index="01" text="육수 재료 1.5배로 준비하기" owner="동행" />
        <MiniTask index="02" text="소고기와 배추 구매하기" owner="나" />
        <MiniTask index="03" text="숙소 예약 확인하기" owner="함께" last />
      </View>
      <Section label="FROM THE ARCHIVE" title="지난 여행" action="전체 보기" />
      <View style={s.archiveRow}>
        {trips.slice(1).map((trip) => (
          <Pressable
            key={trip.id}
            onPress={() => openTrip(trip.id)}
            style={s.archiveItem}
          >
            <Cover tone={trip.tone} label={trip.date.slice(0, 5)} />
            <Text style={s.archivePlace}>{trip.place}</Text>
            <Text style={s.archiveDate}>{trip.date}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function Trips({ openTrip }: { openTrip: (id: string) => void }) {
  return (
    <ScrollView
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.topLine}>
        <View>
          <Text style={s.kicker}>ALL THE PLACES</Text>
          <Text style={s.screenTitle}>Trips</Text>
        </View>
        <Pressable style={s.addButton}>
          <Text style={s.addSymbol}>＋</Text>
        </Pressable>
      </View>
      <View style={s.filterRow}>
        <Text style={[s.filter, s.filterCurrent]}>ALL</Text>
        <Text style={s.filter}>PLANNED</Text>
        <Text style={s.filter}>ARCHIVE</Text>
      </View>
      {trips.map((trip, index) => (
        <Pressable
          key={trip.id}
          onPress={() => openTrip(trip.id)}
          style={s.tripRow}
        >
          <Text style={s.tripIndex}>0{index + 1}</Text>
          <Cover tone={trip.tone} label={trip.date.slice(0, 5)} compact />
          <View style={s.tripInfo}>
            <Text style={s.tripPlace}>{trip.place}</Text>
            <Text style={s.tripDate}>{trip.date}</Text>
            <Text style={s.tripNote}>{trip.note}</Text>
          </View>
          <Text style={s.rowArrow}>→</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Search({ openTrip }: { openTrip: (id: string) => void }) {
  const [value, setValue] = useState("");
  const items = useMemo(
    () =>
      [
        { title: "은행골블랙", type: "장소", trip: "서울 구로구", id: "guro" },
        {
          title: "밀푀유나베",
          type: "레시피",
          trip: "서울 구로구",
          id: "guro",
        },
        {
          title: "우사기쇼쿠도",
          type: "장소",
          trip: "안양 평촌",
          id: "pyeongchon",
        },
        { title: "충전기", type: "준비물", trip: "진주", id: "guro" },
      ].filter((item) => item.title.includes(value)),
    [value],
  );
  return (
    <View style={s.searchPage}>
      <Text style={s.kicker}>FIND A MOMENT</Text>
      <Text style={s.screenTitle}>Search</Text>
      <View style={s.searchField}>
        <Text style={s.searchPrefix}>/</Text>
        <TextInput
          style={s.searchInput}
          value={value}
          onChangeText={setValue}
          placeholder="장소, 음식, 메모"
          placeholderTextColor="#9A9992"
          autoFocus
        />
      </View>
      <Text style={s.searchOverline}>{value ? "RESULTS" : "QUICK FINDS"}</Text>
      {items.map((item, index) => (
        <Pressable
          key={item.title}
          onPress={() => openTrip(item.id)}
          style={s.searchResult}
        >
          <Text style={s.resultNumber}>0{index + 1}</Text>
          <View style={s.resultBody}>
            <Text style={s.resultTitle}>{item.title}</Text>
            <Text style={s.resultMeta}>
              {item.type} · {item.trip}
            </Text>
          </View>
          <Text style={s.rowArrow}>→</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Me() {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.kicker}>YOUR SPACE</Text>
      <Text style={s.screenTitle}>Me</Text>
      <View style={s.spaceCard}>
        <Text style={s.spaceMonogram}>US</Text>
        <View>
          <Text style={s.spaceName}>우리의 여행 공간</Text>
          <Text style={s.spaceMeta}>couple space · since 2023.10.19</Text>
        </View>
      </View>
      <Setting label="멤버 관리" value="2" />
      <Setting label="초대 링크" value="ON" />
      <Setting label="관계 설정" />
      <View style={s.rule} />
      <Setting label="알림" value="ON" />
      <Setting label="데이터 내보내기" />
      <Setting label="도움말" />
    </ScrollView>
  );
}

function TripDetail({
  tab,
  setTab,
  done,
  toggle,
  onClose,
}: {
  tab: TripTab;
  setTab: (tab: TripTab) => void;
  done: string[];
  toggle: (item: string) => void;
  onClose: () => void;
}) {
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <View style={s.detailTop}>
        <Pressable onPress={onClose} style={s.closeButton}>
          <Text style={s.closeText}>×</Text>
        </Pressable>
        <Text style={s.detailBrand}>Daymo / 01</Text>
        <Text style={s.moreText}>•••</Text>
      </View>
      <ScrollView
        contentContainerStyle={s.detailPage}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.detailIntro}>
          <Text style={s.kicker}>AUG 21 — 23, 2026</Text>
          <Text style={s.detailTitle}>서울{`\n`}구로구</Text>
          <Text style={s.detailCaption}>day 1,038 — for the two of us</Text>
        </View>
        <View style={s.tripNav}>
          {tripTabs.map((item) => (
            <Pressable
              key={item}
              onPress={() => setTab(item)}
              style={[s.tripNavItem, tab === item && s.tripNavActive]}
            >
              <Text
                style={[s.tripNavText, tab === item && s.tripNavTextActive]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.detailRule} />
        {tab === "일정" && <Schedule />}
        {tab === "장소" && <Places />}
        {tab === "음식" && <Food />}
        {tab === "준비" && <Checklist done={done} toggle={toggle} />}
        {tab === "메모" && <Notes />}
        {tab === "사진" && <Photos />}
        {tab === "정보" && <Information />}
      </ScrollView>
    </SafeAreaView>
  );
}

function Schedule() {
  return (
    <View>
      <ContentHead no="01" title="8월 21일, 금요일" note="DAY ONE" />
      <ScheduleRow
        time="12:30"
        title="애슐리퀸즈"
        text="점심 · 가산 퍼블릭점"
      />
      <ScheduleRow
        time="15:00"
        title="JS호텔 체크인"
        text="서울 구로구 남부순환로105길 32"
      />
      <ScheduleRow
        time="19:30"
        title="숙소에서 해먹기"
        text="밀푀유나베 준비하기"
        last
      />
      <ContentHead no="02" title="8월 22일, 토요일" note="DAY TWO" />
      <ScheduleRow
        time="18:00"
        title="은행골블랙"
        text="디너 예약 · 2명"
        last
      />
    </View>
  );
}
function Places() {
  return (
    <View>
      <ContentHead no="01" title="예약한 곳" note="BOOKED" />
      <Place name="은행골블랙" meta="8월 22일 · 디너 예약" tag="RESERVED" />
      <ContentHead no="02" title="가보고 싶은 곳" note="SAVED" />
      <Place name="은행골 본점신관" meta="서울 구로구 · 스시" />
      <Place name="애슐리퀸즈 가산 퍼블릭점" meta="8월 21일 · 점심" />
      <Place name="스시이찌 가산점" meta="다음에 가요" />
    </View>
  );
}
function Food() {
  return (
    <View>
      <View style={s.recipeBlock}>
        <Text style={s.recipeNo}>RECIPE / 01</Text>
        <Text style={s.recipeName}>밀푀유나베</Text>
        <Text style={s.recipeCopy}>토요일 저녁, 우리 둘이 함께 해먹기</Text>
        <View style={s.recipeAccent} />
      </View>
      <ContentHead no="ING" title="재료" note="5 ITEMS" />
      {[
        "소고기 250g",
        "배추 1/2통",
        "깻잎 20장",
        "숙주 200g",
        "느타리버섯 한 줌",
      ].map((item, index) => (
        <View style={s.ingredientRow} key={item}>
          <Text style={s.ingredientNo}>
            {String(index + 1).padStart(2, "0")}
          </Text>
          <Text style={s.ingredientName}>{item}</Text>
        </View>
      ))}
      <View style={s.handNote}>
        <Text style={s.handNoteLabel}>우리의 메모</Text>
        <Text style={s.handNoteText}>
          육수는 1.5배로 넉넉하게. 고추냉이는 따로 챙기기.
        </Text>
      </View>
    </View>
  );
}
function Checklist({
  done,
  toggle,
}: {
  done: string[];
  toggle: (item: string) => void;
}) {
  const list = [
    { name: "깻잎", note: "20장 · 동행", who: "동행" },
    { name: "양파", note: "소스용 · 나", who: "나" },
    { name: "코인육수", note: "2개 · 동행", who: "동행" },
    { name: "소고기", note: "250g · 나", who: "나" },
    { name: "고추냉이", note: "따로 챙기기 · 함께", who: "함께" },
  ];
  const pct = Math.round((done.length / list.length) * 100);
  return (
    <View>
      <View style={s.checkHead}>
        <View>
          <Text style={s.checkOverline}>MILFEUILLE NABE</Text>
          <Text style={s.checkTitle}>준비 목록</Text>
        </View>
        <Text style={s.checkPercent}>{pct}%</Text>
      </View>
      <View style={s.progressBase}>
        <View style={[s.progressValue, { width: `${pct}%` }]} />
      </View>
      <Text style={s.checkSub}>
        {done.length} of {list.length} marked complete
      </Text>
      {list.map((item, index) => (
        <Pressable
          onPress={() => toggle(item.name)}
          key={item.name}
          style={s.checkRow}
        >
          <View style={[s.box, done.includes(item.name) && s.boxDone]}>
            <Text style={s.boxText}>
              {done.includes(item.name)
                ? "×"
                : String(index + 1).padStart(2, "0")}
            </Text>
          </View>
          <View style={s.checkTextBox}>
            <Text style={[s.checkName, done.includes(item.name) && s.struck]}>
              {item.name}
            </Text>
            <Text style={s.checkNote}>{item.note}</Text>
          </View>
          <Text style={s.person}>{item.who}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function Notes() {
  return (
    <View>
      <View style={s.noteInput}>
        <Text style={s.noteInputText}>함께 남길 메모를 적어보세요</Text>
        <Text style={s.noteSubmit}>ADD</Text>
      </View>
      <Note
        who="동행"
        when="TODAY, 10:42"
        text="육수 재료는 내가 미리 1.5배로 만들어갈게."
      />
      <Note
        who="나"
        when="YESTERDAY, 22:15"
        text="은행골은 일요일 13:30으로 생각하고 있어요."
      />
      <Note
        who="동행"
        when="YESTERDAY, 21:06"
        text="JS호텔 체크인 15시, 체크아웃 12시 확인했어."
      />
    </View>
  );
}
function Photos() {
  return (
    <View>
      <View style={s.photoEmpty}>
        <Text style={s.photoLabel}>THE NEXT MOMENT</Text>
        <Text style={s.photoTitle}>아직 비어 있어요.</Text>
        <Text style={s.photoCopy}>
          카메라를 열어 이번 여행의 첫 장면을 남겨보세요.
        </Text>
        <Pressable style={s.photoAdd}>
          <Text style={s.photoAddText}>PHOTO +</Text>
        </Pressable>
      </View>
      <ContentHead no="PAST" title="지난 여행에서" note="6 PHOTOS" />
      <View style={s.photoGrid}>
        {["#D8D2C6", "#BACBD0", "#E7B9A8", "#C7D491", "#B9B0C7", "#E2C9A4"].map(
          (color, index) => (
            <View
              style={[s.photoSquare, { backgroundColor: color }]}
              key={color}
            >
              <Text style={s.photoNumber}>0{index + 1}</Text>
              <View style={s.photoDash} />
            </View>
          ),
        )}
      </View>
    </View>
  );
}
function Information() {
  return (
    <View>
      <Info
        label="STAY"
        title="JS호텔"
        text="서울 구로구 남부순환로105길 32\ncheck-in 15:00 · check-out 12:00"
        action="예약 보기"
      />
      <Info
        label="GETTING THERE"
        title="각자 출발"
        text="여행 전 출발 시간을 메모해 주세요"
        action="교통 추가"
      />
      <Info
        label="TRIP NOTE"
        title="맛있는 것과 느긋한 주말"
        text="밀푀유나베, 마파두부, 치즈떡볶이"
      />
    </View>
  );
}

function Nav({
  active,
  setActive,
}: {
  active: MainTab;
  setActive: (tab: MainTab) => void;
}) {
  const items: { tab: MainTab; number: string }[] = [
    { tab: "Today", number: "01" },
    { tab: "Trips", number: "02" },
    { tab: "Search", number: "03" },
    { tab: "Me", number: "04" },
  ];
  return (
    <View style={s.nav}>
      {items.map((item) => (
        <Pressable
          key={item.tab}
          onPress={() => setActive(item.tab)}
          style={s.navItem}
        >
          <Text style={[s.navNumber, active === item.tab && s.navActive]}>
            {item.number}
          </Text>
          <Text style={[s.navText, active === item.tab && s.navActive]}>
            {item.tab}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function Cover({
  tone,
  label,
  large,
  compact,
}: {
  tone: string;
  label: string;
  large?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        s.cover,
        large && s.coverLarge,
        compact && s.coverCompact,
        tone === "coral"
          ? s.coverCoral
          : tone === "lime"
            ? s.coverLime
            : s.coverBlue,
      ]}
    >
      <View style={s.coverDisc} />
      <View style={s.coverCorner}>
        <Text style={s.coverLabel}>{label}</Text>
        <View style={s.coverRule} />
      </View>
    </View>
  );
}
function Section({
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
    <View style={s.sectionHead}>
      <View>
        <Text style={s.sectionLabel}>{label}</Text>
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {action && (
        <Pressable onPress={onPress}>
          <Text style={s.sectionAction}>{action} →</Text>
        </Pressable>
      )}
    </View>
  );
}
function MiniTask({
  index,
  text,
  owner,
  last,
}: {
  index: string;
  text: string;
  owner: string;
  last?: boolean;
}) {
  return (
    <View style={[s.miniTask, last && s.noBorder]}>
      <Text style={s.miniIndex}>{index}</Text>
      <Text style={s.miniText}>{text}</Text>
      <Text style={s.miniOwner}>{owner}</Text>
    </View>
  );
}
function ContentHead({
  no,
  title,
  note,
}: {
  no: string;
  title: string;
  note: string;
}) {
  return (
    <View style={s.contentHead}>
      <View style={s.contentHeadTop}>
        <Text style={s.contentNo}>{no}</Text>
        <Text style={s.contentNote}>{note}</Text>
      </View>
      <Text style={s.contentTitle}>{title}</Text>
    </View>
  );
}
function ScheduleRow({
  time,
  title,
  text,
  last,
}: {
  time: string;
  title: string;
  text: string;
  last?: boolean;
}) {
  return (
    <View style={[s.scheduleRow, last && s.scheduleLast]}>
      <Text style={s.scheduleTime}>{time}</Text>
      <View style={s.scheduleMiddle}>
        <View style={s.scheduleDot} />
        {!last && <View style={s.scheduleLine} />}
      </View>
      <View style={s.scheduleBody}>
        <Text style={s.scheduleTitle}>{title}</Text>
        <Text style={s.scheduleText}>{text}</Text>
      </View>
    </View>
  );
}
function Place({
  name,
  meta,
  tag,
}: {
  name: string;
  meta: string;
  tag?: string;
}) {
  return (
    <View style={s.placeRow}>
      <View style={s.placeMarker}>
        <View style={s.placeMarkerInner} />
      </View>
      <View style={s.placeBody}>
        <View style={s.placeTitleRow}>
          <Text style={s.placeName}>{name}</Text>
          {tag && <Text style={s.placeTag}>{tag}</Text>}
        </View>
        <Text style={s.placeMeta}>{meta}</Text>
        <Text style={s.placeLink}>NAVER MAP ↗</Text>
      </View>
    </View>
  );
}
function Note({
  who,
  when,
  text,
}: {
  who: string;
  when: string;
  text: string;
}) {
  return (
    <View style={s.noteRow}>
      <View style={s.noteMeta}>
        <Text style={s.noteWho}>{who}</Text>
        <Text style={s.noteWhen}>{when}</Text>
      </View>
      <Text style={s.noteText}>{text}</Text>
    </View>
  );
}
function Info({
  label,
  title,
  text,
  action,
}: {
  label: string;
  title: string;
  text: string;
  action?: string;
}) {
  return (
    <View style={s.infoBox}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoTitle}>{title}</Text>
      <Text style={s.infoText}>{text}</Text>
      {action && <Text style={s.infoAction}>{action} →</Text>}
    </View>
  );
}
function Setting({ label, value }: { label: string; value?: string }) {
  return (
    <View style={s.setting}>
      <Text style={s.settingLabel}>{label}</Text>
      <View style={s.settingRight}>
        {value && <Text style={s.settingValue}>{value}</Text>}
        <Text style={s.rowArrow}>→</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  webStage: { flex: 1, backgroundColor: "#E7E5DF" },
  safe: { flex: 1, backgroundColor: "#F5F2EC" },
  app: { flex: 1 },
  page: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 110 },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  wordmark: {
    color: "#172230",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -1.6,
  },
  profileDot: {
    width: 34,
    height: 34,
    backgroundColor: "#172230",
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  profileInitial: {
    color: "#F5F2EC",
    fontSize: 9,
    letterSpacing: 0.6,
    fontWeight: "800",
  },
  intro: { paddingTop: 42, paddingBottom: 32 },
  kicker: {
    color: "#68717B",
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: "800",
  },
  display: {
    color: "#172230",
    fontSize: 36,
    lineHeight: 39,
    letterSpacing: -2.1,
    fontWeight: "800",
    marginTop: 10,
  },
  introCopy: { color: "#72716C", fontSize: 13, marginTop: 13 },
  daysCard: {
    minHeight: 150,
    backgroundColor: "#172230",
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 42,
  },
  daysLabel: {
    color: "#C8D47A",
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "800",
  },
  daysNumber: {
    color: "#F5F2EC",
    fontSize: 43,
    lineHeight: 47,
    letterSpacing: -2.4,
    fontWeight: "800",
    marginTop: 8,
  },
  daysCaption: { color: "#B1B9BE", fontSize: 11 },
  daysMark: { alignItems: "flex-end", justifyContent: "center", width: 82 },
  markLine: {
    width: 71,
    height: 7,
    backgroundColor: "#F0604F",
    marginBottom: 7,
  },
  markLineShort: { width: 41, backgroundColor: "#C8D47A" },
  markText: { color: "#F5F2EC", fontSize: 10, letterSpacing: 2, marginTop: 8 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 13,
  },
  sectionLabel: {
    color: "#F0604F",
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "900",
    marginBottom: 5,
  },
  sectionTitle: {
    color: "#172230",
    fontSize: 21,
    letterSpacing: -0.9,
    fontWeight: "800",
  },
  sectionAction: {
    color: "#5D666D",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 2,
  },
  featureTrip: { flexDirection: "row", marginBottom: 44 },
  cover: { width: 122, height: 122, overflow: "hidden", position: "relative" },
  coverLarge: { width: 135, height: 157 },
  coverCompact: { width: 55, height: 55, marginRight: 14 },
  coverCoral: { backgroundColor: "#F0604F" },
  coverLime: { backgroundColor: "#C8D47A" },
  coverBlue: { backgroundColor: "#9FBFCC" },
  coverDisc: {
    width: 115,
    height: 115,
    borderRadius: 58,
    backgroundColor: "rgba(245,242,236,0.35)",
    position: "absolute",
    right: -34,
    top: -31,
  },
  coverCorner: { position: "absolute", left: 11, bottom: 11 },
  coverLabel: {
    color: "#172230",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  coverRule: { backgroundColor: "#172230", height: 2, width: 30, marginTop: 5 },
  featureText: { flex: 1, paddingLeft: 16, paddingTop: 3 },
  featureDate: {
    color: "#F0604F",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  featureTitle: {
    color: "#172230",
    fontSize: 23,
    letterSpacing: -1.2,
    fontWeight: "800",
    marginTop: 8,
  },
  featureSub: { color: "#76736C", fontSize: 12, marginTop: 5 },
  featureFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 18,
  },
  chip: {
    color: "#172230",
    borderWidth: 1,
    borderColor: "#172230",
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 10,
    letterSpacing: 0.6,
    fontWeight: "900",
  },
  arrow: { fontSize: 23, color: "#172230" },
  listPanel: { borderTopWidth: 2, borderColor: "#172230", marginBottom: 43 },
  miniTask: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 53,
    borderBottomWidth: 1,
    borderColor: "#CFCEC7",
  },
  noBorder: { borderBottomWidth: 0 },
  miniIndex: { color: "#F0604F", fontSize: 10, fontWeight: "900", width: 31 },
  miniText: { flex: 1, color: "#26313B", fontSize: 13, fontWeight: "600" },
  miniOwner: {
    color: "#6B737A",
    fontSize: 9,
    letterSpacing: 0.7,
    fontWeight: "900",
  },
  archiveRow: { flexDirection: "row", gap: 13 },
  archiveItem: { width: "47%" },
  archivePlace: {
    color: "#172230",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 9,
  },
  archiveDate: { color: "#7B7C77", fontSize: 10, marginTop: 3 },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 17,
    marginBottom: 24,
  },
  screenTitle: {
    color: "#172230",
    fontSize: 38,
    letterSpacing: -2,
    lineHeight: 42,
    fontWeight: "800",
    marginTop: 6,
  },
  addButton: {
    backgroundColor: "#F0604F",
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },
  addSymbol: { color: "#172230", fontSize: 25, fontWeight: "300" },
  filterRow: {
    flexDirection: "row",
    gap: 19,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: "#CFCEC7",
  },
  filter: {
    color: "#868681",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  filterCurrent: { color: "#172230", textDecorationLine: "underline" },
  tripRow: {
    minHeight: 94,
    borderBottomWidth: 1,
    borderColor: "#CFCEC7",
    flexDirection: "row",
    alignItems: "center",
  },
  tripIndex: { width: 27, color: "#F0604F", fontSize: 10, fontWeight: "900" },
  tripInfo: { flex: 1 },
  tripPlace: { color: "#172230", fontSize: 16, fontWeight: "800" },
  tripDate: { color: "#58636C", fontSize: 11, fontWeight: "800", marginTop: 3 },
  tripNote: { color: "#87857E", fontSize: 10, marginTop: 5 },
  rowArrow: { color: "#172230", fontSize: 18 },
  searchPage: { padding: 20, flex: 1 },
  searchField: {
    height: 61,
    borderBottomWidth: 2,
    borderColor: "#172230",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 38,
  },
  searchPrefix: {
    color: "#F0604F",
    fontSize: 28,
    fontWeight: "300",
    marginRight: 10,
  },
  searchInput: { flex: 1, color: "#172230", fontSize: 16 },
  searchOverline: {
    color: "#69727B",
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "900",
    marginTop: 31,
    marginBottom: 4,
  },
  searchResult: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#CFCEC7",
    minHeight: 68,
  },
  resultNumber: {
    color: "#F0604F",
    fontSize: 10,
    fontWeight: "900",
    width: 36,
  },
  resultBody: { flex: 1 },
  resultTitle: { color: "#172230", fontSize: 15, fontWeight: "800" },
  resultMeta: { color: "#7B7D78", fontSize: 11, marginTop: 4 },
  spaceCard: {
    backgroundColor: "#C8D47A",
    padding: 20,
    minHeight: 118,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 30,
    marginBottom: 26,
  },
  spaceMonogram: {
    color: "#172230",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -2,
    width: 74,
  },
  spaceName: { color: "#172230", fontSize: 18, fontWeight: "800" },
  spaceMeta: { color: "#526036", fontSize: 10, marginTop: 5 },
  setting: {
    minHeight: 57,
    borderTopWidth: 1,
    borderColor: "#CFCEC7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingLabel: { color: "#29333C", fontSize: 14, fontWeight: "700" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 11 },
  settingValue: {
    color: "#F0604F",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  rule: { height: 22 },
  nav: {
    height: 74,
    backgroundColor: "#172230",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 12,
  },
  navItem: { alignItems: "center", minWidth: 55 },
  navNumber: {
    color: "#6B747C",
    fontSize: 9,
    letterSpacing: 0.7,
    fontWeight: "800",
  },
  navText: { color: "#B1B8B9", fontSize: 10, marginTop: 5, fontWeight: "800" },
  navActive: { color: "#C8D47A" },
  detailTop: {
    height: 54,
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F5F2EC",
  },
  closeButton: {
    width: 31,
    height: 31,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  closeText: {
    color: "#172230",
    fontSize: 31,
    fontWeight: "300",
    lineHeight: 31,
  },
  detailBrand: {
    color: "#172230",
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "900",
  },
  moreText: { color: "#172230", letterSpacing: 2, fontSize: 13 },
  detailPage: { paddingBottom: 45 },
  detailIntro: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 22 },
  detailTitle: {
    color: "#172230",
    fontSize: 44,
    lineHeight: 43,
    letterSpacing: -2.8,
    fontWeight: "800",
    marginTop: 10,
  },
  detailCaption: { color: "#697078", fontSize: 12, marginTop: 13 },
  tripNav: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 7,
    paddingBottom: 20,
  },
  tripNavItem: {
    width: "23.8%",
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CFCEC7",
  },
  tripNavActive: { backgroundColor: "#172230", borderColor: "#172230" },
  tripNavText: { color: "#6A7074", fontSize: 11, fontWeight: "800" },
  tripNavTextActive: { color: "#F5F2EC" },
  detailRule: {
    height: 2,
    backgroundColor: "#172230",
    marginHorizontal: 20,
    marginBottom: 23,
  },
  contentHead: { marginTop: 1, marginBottom: 16 },
  contentHeadTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  contentNo: {
    color: "#F0604F",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  contentNote: {
    color: "#7D8589",
    fontSize: 9,
    letterSpacing: 0.9,
    fontWeight: "900",
  },
  contentTitle: {
    color: "#172230",
    fontSize: 20,
    letterSpacing: -1,
    fontWeight: "800",
  },
  scheduleRow: { flexDirection: "row", minHeight: 74 },
  scheduleLast: { minHeight: 51, marginBottom: 32 },
  scheduleTime: {
    color: "#5D656C",
    fontSize: 11,
    fontWeight: "900",
    width: 52,
    paddingTop: 4,
  },
  scheduleMiddle: { width: 23, alignItems: "center" },
  scheduleDot: {
    width: 9,
    height: 9,
    backgroundColor: "#F0604F",
    marginTop: 4,
  },
  scheduleLine: { flex: 1, width: 1, backgroundColor: "#BDC2C0", marginTop: 5 },
  scheduleBody: { flex: 1, paddingLeft: 9 },
  scheduleTitle: { color: "#172230", fontSize: 15, fontWeight: "800" },
  scheduleText: {
    color: "#777771",
    fontSize: 11,
    marginTop: 5,
    lineHeight: 16,
  },
  placeRow: {
    paddingVertical: 13,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#CFCEC7",
  },
  placeMarker: { width: 35, paddingTop: 3 },
  placeMarkerInner: {
    width: 11,
    height: 11,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#172230",
  },
  placeBody: { flex: 1 },
  placeTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  placeName: { color: "#172230", fontSize: 15, fontWeight: "800" },
  placeTag: {
    color: "#172230",
    backgroundColor: "#C8D47A",
    paddingHorizontal: 5,
    paddingVertical: 3,
    fontSize: 8,
    letterSpacing: 0.5,
    fontWeight: "900",
  },
  placeMeta: { color: "#72736E", fontSize: 11, marginTop: 4 },
  placeLink: {
    color: "#F0604F",
    fontSize: 9,
    letterSpacing: 0.6,
    fontWeight: "900",
    marginTop: 8,
  },
  recipeBlock: { backgroundColor: "#F0604F", padding: 20, marginBottom: 28 },
  recipeNo: {
    color: "#172230",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  recipeName: {
    color: "#172230",
    fontSize: 28,
    letterSpacing: -1.6,
    fontWeight: "800",
    marginTop: 27,
  },
  recipeCopy: { color: "#3D3A34", fontSize: 12, marginTop: 7 },
  recipeAccent: {
    width: 59,
    height: 7,
    backgroundColor: "#C8D47A",
    marginTop: 22,
  },
  ingredientRow: {
    borderBottomWidth: 1,
    borderColor: "#CFCEC7",
    flexDirection: "row",
    paddingVertical: 12,
  },
  ingredientNo: {
    color: "#F0604F",
    fontSize: 10,
    fontWeight: "900",
    width: 35,
  },
  ingredientName: { color: "#2F3941", fontSize: 14, fontWeight: "600" },
  handNote: {
    borderLeftWidth: 3,
    borderColor: "#C8D47A",
    paddingLeft: 13,
    marginTop: 24,
  },
  handNoteLabel: {
    color: "#6D7562",
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "900",
  },
  handNoteText: {
    color: "#4C514D",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  checkHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  checkOverline: {
    color: "#F0604F",
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "900",
  },
  checkTitle: {
    color: "#172230",
    fontSize: 24,
    letterSpacing: -1.2,
    fontWeight: "800",
    marginTop: 6,
  },
  checkPercent: {
    color: "#172230",
    fontSize: 30,
    letterSpacing: -1.5,
    fontWeight: "800",
  },
  progressBase: {
    height: 8,
    backgroundColor: "#D6D5CE",
    marginTop: 20,
    overflow: "hidden",
  },
  progressValue: { height: "100%", backgroundColor: "#F0604F" },
  checkSub: {
    color: "#7D7D77",
    fontSize: 10,
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 16,
  },
  checkRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#CFCEC7",
  },
  box: {
    width: 31,
    height: 31,
    borderWidth: 1.5,
    borderColor: "#172230",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  boxDone: { backgroundColor: "#172230" },
  boxText: { color: "#172230", fontSize: 10, fontWeight: "900" },
  checkTextBox: { flex: 1 },
  checkName: { color: "#172230", fontSize: 14, fontWeight: "800" },
  struck: { color: "#92938E", textDecorationLine: "line-through" },
  checkNote: { color: "#888781", fontSize: 10, marginTop: 3 },
  person: {
    color: "#F0604F",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  noteInput: {
    minHeight: 58,
    backgroundColor: "#E5E1D9",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 27,
  },
  noteInputText: { color: "#8B8B85", fontSize: 11 },
  noteSubmit: {
    color: "#F0604F",
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  noteRow: {
    paddingBottom: 19,
    marginBottom: 19,
    borderBottomWidth: 1,
    borderColor: "#CFCEC7",
  },
  noteMeta: { flexDirection: "row", gap: 9, marginBottom: 7 },
  noteWho: {
    color: "#172230",
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  noteWhen: { color: "#858680", fontSize: 10 },
  noteText: { color: "#3D464D", fontSize: 14, lineHeight: 20 },
  photoEmpty: {
    backgroundColor: "#9FBFCC",
    padding: 22,
    minHeight: 199,
    marginBottom: 28,
  },
  photoLabel: {
    color: "#344D59",
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "900",
  },
  photoTitle: {
    color: "#172230",
    fontSize: 25,
    letterSpacing: -1.2,
    fontWeight: "800",
    marginTop: 30,
  },
  photoCopy: {
    color: "#405964",
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 220,
  },
  photoAdd: {
    alignSelf: "flex-start",
    backgroundColor: "#172230",
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginTop: 18,
  },
  photoAddText: {
    color: "#F5F2EC",
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  photoSquare: {
    width: "31.8%",
    aspectRatio: 1,
    padding: 9,
    justifyContent: "space-between",
  },
  photoNumber: { color: "#172230", fontSize: 10, fontWeight: "900" },
  photoDash: { width: 18, height: 2, backgroundColor: "#172230" },
  infoBox: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: "#CFCEC7",
  },
  infoLabel: {
    color: "#F0604F",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  infoTitle: {
    color: "#172230",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 8,
  },
  infoText: { color: "#70726E", fontSize: 12, lineHeight: 18, marginTop: 6 },
  infoAction: {
    color: "#172230",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 13,
  },
});

Object.assign(s, { detailPage: { paddingHorizontal: 20, paddingBottom: 45 } });
