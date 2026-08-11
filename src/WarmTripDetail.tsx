import { createContext, useContext, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { AppTheme } from "./theme";

const DetailThemeContext = createContext<AppTheme | undefined>(undefined);

type ViewMode = "여행" | "장소" | "준비" | "요리" | "기록";
export type TripDetailDestination =
  "overview" | "schedule-add" | "places" | "preparation";
const destinationMode = (destination: TripDetailDestination): ViewMode =>
  destination === "places"
    ? "장소"
    : destination === "preparation"
      ? "준비"
      : "여행";
type ScheduleItem = {
  time: string;
  title: string;
  note: string;
  mapUrl: string;
};

type Props = {
  done: string[];
  toggle: (item: string) => void;
  onClose: () => void;
  initialDestination?: TripDetailDestination;
  appTheme?: AppTheme;
};

type PackingItem = {
  id: string;
  name: string;
  quantity: string;
  owner: "함께" | "나" | "동행" | "미정";
  tags: string[];
};

const packingOwnerName = (owner: PackingItem["owner"]) =>
  owner === "나"
    ? "하늘"
    : owner === "동행"
      ? "여울"
      : owner === "함께"
        ? "공용"
        : "미정";

const packingTags = (item: PackingItem) => {
  const legacy = item as PackingItem & {
    source?: string;
    timing?: string;
    tags?: string[];
  };
  return (
    legacy.tags ?? ([legacy.source, legacy.timing].filter(Boolean) as string[])
  );
};

const packing: PackingItem[] = [
  {
    id: "charger",
    name: "충전기",
    quantity: "1개",
    owner: "나",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "power-bank",
    name: "보조배터리",
    quantity: "1개",
    owner: "나",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "wallet",
    name: "지갑과 신분증",
    quantity: "",
    owner: "나",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "camera",
    name: "카메라",
    quantity: "1대",
    owner: "나",
    tags: ["집에서", "미리"],
  },
  {
    id: "camera-battery",
    name: "카메라 여분 배터리",
    quantity: "2개",
    owner: "나",
    tags: ["집에서", "미리"],
  },
  {
    id: "personal-clothes",
    name: "갈아입을 옷",
    quantity: "2벌",
    owner: "나",
    tags: ["집에서", "미리"],
  },
  {
    id: "personal-socks",
    name: "양말과 속옷",
    quantity: "3세트",
    owner: "나",
    tags: ["집에서", "미리"],
  },
  {
    id: "earphones",
    name: "이어폰",
    quantity: "1개",
    owner: "나",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "glasses",
    name: "안경",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "companion-charger",
    name: "휴대폰 충전기",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "companion-clothes",
    name: "갈아입을 옷",
    quantity: "2벌",
    owner: "동행",
    tags: ["집에서", "미리"],
  },
  {
    id: "companion-cosmetics",
    name: "화장품 파우치",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "미리"],
  },
  {
    id: "companion-lens",
    name: "렌즈와 렌즈액",
    quantity: "",
    owner: "동행",
    tags: ["집에서", "미리"],
  },
  {
    id: "companion-hair",
    name: "고데기",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "companion-card",
    name: "예약 카드",
    quantity: "1개",
    owner: "동행",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "toiletries",
    name: "세면도구",
    quantity: "1세트",
    owner: "함께",
    tags: ["집에서", "미리"],
  },
  {
    id: "umbrella",
    name: "우산",
    quantity: "2개",
    owner: "함께",
    tags: ["집에서", "미리"],
  },
  {
    id: "medicine",
    name: "상비약",
    quantity: "1봉",
    owner: "함께",
    tags: ["집에서", "미리"],
  },
  {
    id: "sunscreen",
    name: "선크림",
    quantity: "1개",
    owner: "함께",
    tags: ["집에서", "출발 아침"],
  },
  {
    id: "tissues",
    name: "물티슈와 휴지",
    quantity: "각 1개",
    owner: "함께",
    tags: ["미리 구매", "미리"],
  },
  {
    id: "water",
    name: "생수",
    quantity: "4병",
    owner: "함께",
    tags: ["미리 구매", "출발 아침"],
  },
  {
    id: "snacks",
    name: "차에서 먹을 간식",
    quantity: "",
    owner: "함께",
    tags: ["미리 구매", "출발 아침"],
  },
  {
    id: "plastic-bags",
    name: "비닐봉투",
    quantity: "3장",
    owner: "함께",
    tags: ["집에서", "미리"],
  },
  {
    id: "booking-check",
    name: "숙소 예약 내역 확인",
    quantity: "",
    owner: "미정",
    tags: ["집에서", "미리"],
  },
  {
    id: "train-tickets",
    name: "기차표 예매",
    quantity: "2매",
    owner: "미정",
    tags: ["미리 구매", "미리"],
  },
  {
    id: "breakfast",
    name: "숙소 아침거리",
    quantity: "2인분",
    owner: "미정",
    tags: ["현지 구매", "숙소에서"],
  },
  {
    id: "cooking-ingredients",
    name: "저녁 요리 재료",
    quantity: "2인분",
    owner: "미정",
    tags: ["현지 구매", "숙소에서"],
  },
  {
    id: "ice",
    name: "얼음과 음료",
    quantity: "",
    owner: "미정",
    tags: ["현지 구매", "숙소에서"],
  },
  {
    id: "beach-mat",
    name: "돗자리",
    quantity: "1개",
    owner: "미정",
    tags: ["집에서", "미리"],
  },
  {
    id: "slippers",
    name: "숙소용 슬리퍼",
    quantity: "2켤레",
    owner: "미정",
    tags: ["미리 구매", "미리"],
  },
];

export function WarmTripDetail({
  done,
  toggle,
  onClose,
  initialDestination = "overview",
  appTheme,
}: Props) {
  const [mode, setMode] = useState<ViewMode>(() =>
    destinationMode(initialDestination),
  );
  const [title, setTitle] = useState("서울 구로구");
  const [draftTitle, setDraftTitle] = useState(title);
  const [editingTrip, setEditingTrip] = useState(false);
  const [memoPanel, setMemoPanel] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [tripNotes, setTripNotes] = useState([
    { author: "여울 · 오늘 10:42", body: "육수 재료는 미리 1.5배로 준비하기" },
    { author: "하늘 · 어제 22:15", body: "은행골 일요일 13:30 예약 확인" },
  ]);
  const [hasKitchen, setHasKitchen] = useState(true);
  const [packingItems, setPackingItems] = useState(packing);
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([
    {
      time: "금 · 12:30",
      title: "애슐리퀸즈에서 점심",
      note: "가산 퍼블릭점",
      mapUrl: "https://naver.me/5Bvl09Pa",
    },
    {
      time: "금 · 15:00",
      title: "JS호텔 체크인",
      note: "체크아웃은 일요일 12시",
      mapUrl: "https://naver.me/5nhRr02Z",
    },
    {
      time: "금 · 19:30",
      title: "함께 저녁 만들기",
      note: "밀푀유나베와 주먹밥",
      mapUrl: "",
    },
  ]);

  useEffect(
    () => setMode(destinationMode(initialDestination)),
    [initialDestination],
  );

  return (
    <DetailThemeContext.Provider value={appTheme}>
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
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={[styles.close, appTheme && { color: appTheme.text }]}>
              ‹
            </Text>
          </Pressable>
          <Text
            style={[styles.headerName, appTheme && { color: appTheme.text }]}
          >
            Daymo
          </Text>
          <Pressable
            onPress={() => {
              setDraftTitle(title);
              setEditingTrip(true);
            }}
            hitSlop={12}
          >
            <Text
              style={[styles.headerMore, appTheme && { color: appTheme.text }]}
            >
              ···
            </Text>
          </Pressable>
        </View>
        <DetailPaperBackdrop theme={appTheme} />
        <ScrollView
          style={{ backgroundColor: "transparent" }}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.date, appTheme && { color: appTheme.primary }]}>
            2026. 08. 21 — 08. 23
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
              style={styles.tripMemoButton}
            >
              <View style={styles.tripMemoTape} />
              <Text style={styles.tripMemoLabel}>확인할 것</Text>
              <Text numberOfLines={1} style={styles.tripMemoPreview}>
                {tripNotes[0]?.body || "메모를 남겨보세요"}
              </Text>
              <View style={styles.tripMemoBottom}>
                <Text style={styles.tripMemoButtonText}>메모 {tripNotes.length}개</Text>
                <Text style={styles.tripMemoArrow}>›</Text>
              </View>
              <View style={styles.tripMemoFold} />
            </Pressable>
          </View>
          <Text
            style={[styles.subtitle, appTheme && { color: appTheme.muted }]}
          >
            함께 떠나는 2박 3일 여행
          </Text>

          <View
            style={[
              styles.modeSwitch,
              appTheme && { backgroundColor: appTheme.surfaceAlt },
            ]}
          >
            {(
              [
                "여행",
                "장소",
                "준비",
                ...(hasKitchen ? ["요리" as ViewMode] : []),
                "기록",
              ] as ViewMode[]
            ).map((item) => (
              <Pressable
                key={item}
                onPress={() => setMode(item)}
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
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "여행" && (
            <TripOverview
              key={initialDestination}
              setMode={setMode}
              schedule={schedule}
              setSchedule={setSchedule}
              hasKitchen={hasKitchen}
              openScheduleOnMount={initialDestination === "schedule-add"}
            />
          )}
          {mode === "장소" && (
            <Places
              addToSchedule={(item) =>
                setSchedule((current) => [...current, item])
              }
            />
          )}
          {mode === "준비" && (
            <Preparation
              done={done}
              toggle={toggle}
              items={packingItems}
              setItems={setPackingItems}
              recipes={recipes}
            />
          )}
          {mode === "요리" && (
            <Cooking recipes={recipes} setRecipes={setRecipes} />
          )}
          {mode === "기록" && <Memories />}
        </ScrollView>
        <DetailSheet
          visible={memoPanel}
          title="여행 메모"
          subtitle="함께 확인할 짧은 내용을 남겨두세요"
          submit={memoDraft.trim() ? "메모 추가" : "닫기"}
          onClose={() => setMemoPanel(false)}
          onSubmit={() => {
            if (memoDraft.trim()) {
              setTripNotes((current) => [
                { author: "하늘 · 방금", body: memoDraft.trim() },
                ...current,
              ]);
              setMemoDraft("");
            } else {
              setMemoPanel(false);
            }
          }}
        >
          <View style={styles.tripMemoList}>
            {tripNotes.map((note, index) => (
              <View
                key={`${note.author}-${index}`}
                style={[
                  styles.tripMemoRow,
                  appTheme && { borderBottomColor: appTheme.border },
                ]}
              >
                <Text style={[styles.tripMemoAuthor, appTheme && { color: appTheme.primary }]}>{note.author}</Text>
                <Text style={[styles.tripMemoBody, appTheme && { color: appTheme.text }]}>{note.body}</Text>
              </View>
            ))}
          </View>
          <DetailField
            label="새 메모"
            value={memoDraft}
            onChangeText={setMemoDraft}
            placeholder="예: 체크인 전에 장보기"
            multiline
          />
        </DetailSheet>
        <DetailSheet
          visible={editingTrip}
          title="여행 수정"
          submit="변경 저장"
          onClose={() => setEditingTrip(false)}
          onSubmit={() => {
            if (draftTitle.trim()) setTitle(draftTitle.trim());
            if (!hasKitchen && mode === "요리") setMode("여행");
            setEditingTrip(false);
          }}
        >
          <DetailField
            label="여행 제목"
            value={draftTitle}
            onChangeText={setDraftTitle}
          />
          <View style={styles.tripMetaBox}>
            <Text style={styles.tripMetaLabel}>기간</Text>
            <Text style={styles.tripMetaValue}>2026. 08. 21 — 08. 23</Text>
          </View>
          <OptionField
            label="숙소에 주방이 있나요?"
            options={["있어요", "없어요"]}
            value={hasKitchen ? "있어요" : "없어요"}
            onChange={(value) => setHasKitchen(value === "있어요")}
          />
          <Text style={styles.settingHint}>
            주방이 있을 때만 요리 탭을 표시해요. 언제든 다시 켜거나 숨길 수
            있어요.
          </Text>
        </DetailSheet>
      </SafeAreaView>
    </DetailThemeContext.Provider>
  );
}

function DetailPaperBackdrop({ theme }: { theme?: AppTheme }) {
  if (!theme) return null;
  return (
    <View pointerEvents="none" style={(styles as any).detailPaperBackdrop}>
      {[80, 166, 252, 338, 424, 510, 596, 682, 768].map((top) => (
        <View
          key={top}
          style={[
            (styles as any).detailPaperLine,
            { top, backgroundColor: theme.dark ? "#202A3B" : "#EDE9E1" },
          ]}
        />
      ))}
      <View
        style={[
          (styles as any).detailPaperMargin,
          { backgroundColor: `${theme.primary}16` },
        ]}
      />
    </View>
  );
}

function TripOverview({
  setMode,
  schedule,
  setSchedule,
  hasKitchen,
  openScheduleOnMount,
}: {
  setMode: (mode: ViewMode) => void;
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  hasKitchen: boolean;
  openScheduleOnMount?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  const [sheet, setSheet] = useState<
    "schedule" | "reservation" | "stay" | null
  >(openScheduleOnMount ? "schedule" : null);
  const [fullSchedule, setFullSchedule] = useState(false);
  const [planDay, setPlanDay] = useState("토 · 22");
  const [planType, setPlanType] = useState("장소");
  const [planTime, setPlanTime] = useState("11:00");
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [planPlace, setPlanPlace] = useState("");
  const [planMapUrl, setPlanMapUrl] = useState("");
  const scheduleFormValid = Boolean(newPlanTitle.trim());
  const addSchedule = () => {
    if (!newPlanTitle.trim()) return;
    setSchedule((current) => [
      ...current,
      {
        time: `${planDay.slice(0, 1)} · ${planTime || "시간 미정"}`,
        title: newPlanTitle.trim(),
        note: [planType, planPlace.trim()].filter(Boolean).join(" · "),
        mapUrl: planMapUrl.trim(),
      },
    ]);
    setNewPlanTitle("");
    setPlanPlace("");
    setPlanMapUrl("");
    setSheet(null);
  };
  return (
    <View>
      <TabActionHeader
        label="여행 일정"
        count={`${schedule.length}개`}
        action="일정 추가"
        onPress={() => setSheet("schedule")}
      />
      <View
        style={[
          styles.timelineCard,
          styles.travelTimelineCard,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={[styles.travelTimelineTape, theme && { backgroundColor: theme.primary }]} />
        {schedule.slice(0, 3).map((item, index) => (
          <Moment
            key={`${item.time}-${index}`}
            {...item}
            last={index === Math.min(schedule.length, 3) - 1}
            compact
          />
        ))}
        <Pressable
          onPress={() => setFullSchedule(true)}
          style={[
            styles.fullScheduleButton,
            theme && { backgroundColor: theme.surfaceAlt },
          ]}
        >
          <Text
            style={[styles.fullScheduleText, theme && { color: theme.text }]}
          >
            전체 일정 보기 · {schedule.length}개
          </Text>
          <Text style={styles.fullScheduleArrow}>→</Text>
        </Pressable>
      </View>

      <SectionLabel label={`여행 정보 · ${hasKitchen ? 3 : 2}개`} />
      <View style={styles.travelInfoList}>
        <TravelInfoRow
          label="예약"
          mark="22"
          title="은행골블랙"
          meta="토요일 디너 · 2명"
          color={theme?.primary ?? "#FF6B63"}
          onPress={() => setSheet("reservation")}
        />
        <View style={styles.travelInfoPair}>
          <TravelMiniCard
            label="숙소"
            mark="15"
            title="JS호텔"
            meta="15:00 체크인"
            color={theme?.secondary ?? "#55BFB4"}
            onPress={() => setSheet("stay")}
            large
          />
          {hasKitchen && (
            <TravelMiniCard
              label="요리"
              mark="한 끼"
              title="밀푀유나베"
              meta="재료 확인"
              color={theme?.accent ?? "#8B7CF6"}
              onPress={() => setMode("요리")}
            />
          )}
        </View>
      </View>

      <Pressable
        onPress={() => setMode("준비")}
        style={[
          styles.readyNudge,
          theme && {
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
          },
        ]}
      >
        <View>
          <Text style={styles.readyEyebrow}>출발 전 확인</Text>
          <Text style={[styles.readyText, theme && { color: theme.text }]}>
            준비물 3개가 남아 있어요.
          </Text>
        </View>
        <Text style={styles.cardArrow}>→</Text>
      </Pressable>
      <DetailSheet
        visible={sheet === "schedule"}
        title="일정 추가"
        subtitle="일정 이름만 입력해도 추가할 수 있어요"
        submit={scheduleFormValid ? "일정에 추가" : "일정 이름을 입력해 주세요"}
        submitDisabled={!scheduleFormValid}
        onClose={() => setSheet(null)}
        onSubmit={addSchedule}
      >
        <View style={styles.planPreview}>
          <View style={styles.previewDate}>
            <Text style={styles.previewDay}>{planDay.slice(0, 1)}</Text>
            <Text style={styles.previewDateNo}>{planDay.slice(-2)}</Text>
          </View>
          <View style={styles.previewBody}>
            <Text style={styles.previewType}>
              {planType.toUpperCase()} · {planTime || "시간 미정"}
            </Text>
            <Text numberOfLines={1} style={styles.previewTitle}>
              {newPlanTitle || "어떤 일정인가요?"}
            </Text>
            <Text numberOfLines={1} style={styles.previewPlace}>
              {planPlace || "장소를 입력하세요"}
            </Text>
          </View>
        </View>
        <DetailField
          label="일정 이름 · 필수"
          value={newPlanTitle}
          onChangeText={setNewPlanTitle}
          placeholder="예: 광안리 드론쇼"
        />
        <OptionField
          label="날짜"
          options={["금 · 21", "토 · 22", "일 · 23"]}
          value={planDay}
          onChange={setPlanDay}
        />
        <OptionField
          label="종류"
          options={["장소", "식사", "이동", "예약", "행사"]}
          value={planType}
          onChange={setPlanType}
        />
        <DetailField
          label="시간 · 선택"
          value={planTime}
          onChangeText={setPlanTime}
          placeholder="시간 미정도 가능해요"
        />
        <DetailField
          label="장소 · 선택"
          value={planPlace}
          onChangeText={setPlanPlace}
          placeholder="예: 광안리 해수욕장"
        />
        <View style={[styles.naverField, theme?.dark && { backgroundColor: "#16352C", borderColor: "#245544" }]}>
          <View style={styles.naverHead}>
            <View style={styles.naverLogo}>
              <Text style={styles.naverLogoText}>N</Text>
            </View>
            <View>
              <Text style={[styles.naverTitle, theme?.dark && { color: "#DDF7E9" }]}>네이버 지도 링크 · 선택</Text>
              <Text style={[styles.naverHint, theme?.dark && { color: "#96B7A8" }]}>
                네이버 지도에서 공유한 링크를 붙여넣으세요
              </Text>
            </View>
          </View>
          <TextInput
            value={planMapUrl}
            onChangeText={setPlanMapUrl}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://naver.me/..."
            placeholderTextColor={theme?.dark ? theme.muted : "#91A19B"}
            style={[styles.naverInput, theme?.dark && { backgroundColor: theme.surface, color: theme.text }]}
          />
          {planMapUrl.length > 0 && (
            <Text style={styles.linkState}>
              {planMapUrl.includes("naver.")
                ? "✓ 네이버 지도 링크가 연결돼요"
                : "네이버 지도 공유 링크인지 확인해 주세요"}
            </Text>
          )}
        </View>
      </DetailSheet>
      <InfoPanel
        visible={sheet === "reservation"}
        title="은행골블랙"
        onClose={() => setSheet(null)}
      >
        <InfoLine label="예약" value="토요일 디너 · 2명" />
        <InfoLine label="상태" value="예약 확정" />
        <InfoLine label="장소" value="서울 구로구" />
      </InfoPanel>
      <InfoPanel
        visible={sheet === "stay"}
        title="JS호텔"
        onClose={() => setSheet(null)}
      >
        <InfoLine label="체크인" value="8월 21일 15:00" />
        <InfoLine label="체크아웃" value="8월 23일 12:00" />
        <InfoLine label="주소" value="서울 구로구 남부순환로105길 32" />
      </InfoPanel>
      <InfoPanel
        visible={fullSchedule}
        title={`전체 일정 · ${schedule.length}`}
        onClose={() => setFullSchedule(false)}
      >
        <ScrollView
          style={styles.fullScheduleList}
          showsVerticalScrollIndicator={false}
        >
          {schedule.map((item, index) => (
            <Moment
              key={`full-${item.time}-${index}`}
              {...item}
              last={index === schedule.length - 1}
            />
          ))}
        </ScrollView>
      </InfoPanel>
    </View>
  );
}

type PlaceItem = {
  name: string;
  area: string;
  category: string;
  mapUrl: string;
  tags: string[];
  status: "후보" | "일정";
};

function Places({
  addToSchedule,
}: {
  addToSchedule: (item: ScheduleItem) => void;
}) {
  const theme = useContext(DetailThemeContext);
  const [places, setPlaces] = useState<PlaceItem[]>([
    {
      name: "은행골블랙",
      area: "구로",
      category: "식당",
      mapUrl: "https://naver.me/5nhpnOmy",
      tags: ["초밥", "디너", "예약"],
      status: "일정",
    },
    {
      name: "우사기쇼쿠도",
      area: "가산",
      category: "식당",
      mapUrl: "https://naver.me/FynqMUiq",
      tags: ["늦은 점심", "웨이팅"],
      status: "후보",
    },
    {
      name: "고척스카이돔",
      area: "구로",
      category: "구경",
      mapUrl: "https://naver.me/GMW9Z3f9",
      tags: ["숙소 근처", "비 오는 날"],
      status: "후보",
    },
  ]);
  const [filter, setFilter] = useState<"전체" | "후보" | "일정">("전체");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [planningPlace, setPlanningPlace] = useState<PlaceItem | null>(null);
  const [planningDay, setPlanningDay] = useState("토 · 22");
  const [planningTime, setPlanningTime] = useState("11:00");
  const [name, setName] = useState("");
  const [area, setArea] = useState("구로");
  const [category, setCategory] = useState("식당");
  const [mapUrl, setMapUrl] = useState("");
  const [tagText, setTagText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"교체" | "추가">("교체");
  const allTags = Array.from(new Set(places.flatMap((place) => place.tags)));
  const statusPlaces =
    filter === "전체"
      ? places
      : places.filter((place) => place.status === filter);
  const taggedPlaces = tagFilter
    ? statusPlaces.filter((place) => place.tags.includes(tagFilter))
    : statusPlaces;
  const visible = taggedPlaces.filter((place) =>
    `${place.name} ${place.area} ${place.category} ${place.tags.join(" ")}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const draftTags = tagText
    .split(/[,#\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const placeFormValid = Boolean(name.trim());
  const addTag = (tag: string) => {
    if (!draftTags.includes(tag))
      setTagText((value) => (value.trim() ? `${value}, ${tag}` : tag));
  };
  const resetForm = () => {
    setName("");
    setArea("구로");
    setCategory("식당");
    setMapUrl("");
    setTagText("");
    setEditingName(null);
  };
  const openCreate = () => {
    resetForm();
    setAdding(true);
  };
  const openEdit = (place: PlaceItem) => {
    setEditingName(place.name);
    setName(place.name);
    setArea(place.area);
    setCategory(place.category);
    setMapUrl(place.mapUrl);
    setTagText(place.tags.join(", "));
    setAdding(true);
  };
  const savePlace = () => {
    if (!name.trim()) return;
    const next = {
      name: name.trim(),
      area: area.trim() || "지역 미정",
      category,
      mapUrl: mapUrl.trim(),
      tags: draftTags,
      status: editingName
        ? places.find((place) => place.name === editingName)?.status || "후보"
        : "후보",
    } as PlaceItem;
    setPlaces((current) =>
      editingName
        ? current.map((place) => (place.name === editingName ? next : place))
        : [...current, next],
    );
    resetForm();
    setAdding(false);
  };
  const deletePlace = () => {
    if (!editingName) return;
    Alert.alert(
      "장소를 삭제할까요?",
      `${editingName}을(를) 저장한 장소에서 삭제합니다.`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => {
            setPlaces((current) =>
              current.filter((place) => place.name !== editingName),
            );
            setAdding(false);
            resetForm();
          },
        },
      ],
    );
  };
  const choose = (index: number) => {
    const target = visible[index];
    if (target.status === "일정") return;
    setPlanningPlace(target);
  };
  const confirmPlan = () => {
    if (!planningPlace) return;
    addToSchedule({
      time: `${planningDay.slice(0, 1)} · ${planningTime || "시간 미정"}`,
      title: planningPlace.name,
      note: `${planningPlace.category} · ${planningPlace.area}`,
      mapUrl: planningPlace.mapUrl,
    });
    setPlaces((current) =>
      current.map((place) =>
        place.name === planningPlace.name
          ? { ...place, status: "일정" }
          : place,
      ),
    );
    setPlanningPlace(null);
  };
  const copyPlaces = async () => {
    await Clipboard.setStringAsync(
      places
        .map(
          (place) =>
            `${place.name} | ${place.area} | ${place.category} | ${place.tags.map((tag) => `#${tag}`).join(" ")} | ${place.mapUrl}`,
        )
        .join("\n"),
    );
    Alert.alert(
      "장소 목록을 복사했어요",
      "메모에서 고친 뒤 다시 붙여넣을 수 있어요.",
    );
  };
  const openImport = async () => {
    setImportText(await Clipboard.getStringAsync());
    setImporting(true);
  };
  const importPlaces = () => {
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [
          rawName,
          rawArea = "지역 미정",
          rawCategory = "장소",
          rawTags = "",
          rawUrl = "",
        ] = line.split("|").map((value) => value.trim());
        return {
          name: rawName,
          area: rawArea,
          category: rawCategory,
          tags: rawTags.split(/[# ,]+/).filter(Boolean),
          mapUrl: rawUrl,
          status: "후보" as const,
        };
      })
      .filter((place) => place.name);
    if (!parsed.length) return;
    setPlaces((current) =>
      importMode === "교체" ? parsed : [...current, ...parsed],
    );
    setImporting(false);
  };

  return (
    <View>
      <TabActionHeader
        label="저장한 장소"
        count={`${places.length}개`}
        action="장소 추가"
        onPress={openCreate}
      />
      <View style={[styles.placeControlPanel, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.placeToolbar}>
        <Text style={[styles.placeControlLabel, theme && { color: theme.muted }]}>상태</Text>
        <View style={styles.placeFilters}>
          {(["전체", "후보", "일정"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[
                styles.placeFilter,
                theme && { borderColor: theme.border },
                filter === item &&
                  theme && { backgroundColor: theme.primarySoft },
              ]}
            >
              <Text
                style={[
                  styles.placeFilterText,
                  filter === item && styles.placeFilterTextActive,
                  filter === item && theme && { color: theme.primary },
                ]}
              >
                {item === "후보" ? "저장" : item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View
        style={[
          styles.placeSearch,
          theme && {
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
          },
        ]}
      >
        <Text style={[styles.placeSearchIcon, theme && { color: theme.text }]}>
          ⌕
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="장소, 지역, 태그 검색"
          placeholderTextColor={theme?.muted ?? "#9AA1AE"}
          style={[styles.placeSearchInput, theme && { color: theme.text }]}
        />
        <View style={[styles.resultCount, theme && { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.resultCountText, theme && { color: theme.primary }]}>{visible.length}</Text>
        </View>
      </View>
      <View style={styles.placeTagControlRow}>
        <Text style={[styles.placeControlLabel, theme && { color: theme.muted }]}>태그</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tagFilterRow}
        >
        <Pressable
          onPress={() => setTagFilter(null)}
          style={[
            styles.tagFilterChip,
            tagFilter === null && styles.tagFilterChipActive,
            tagFilter === null &&
              theme && { backgroundColor: theme.primarySoft },
          ]}
        >
          <Text
            style={[
              styles.tagFilterLabel,
              tagFilter === null && styles.tagFilterLabelActive,
              tagFilter === null && theme && { color: theme.primary },
            ]}
          >
            # 모든 태그
          </Text>
        </Pressable>
        {allTags.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => setTagFilter(tagFilter === tag ? null : tag)}
            style={[
              styles.tagFilterChip,
              tagFilter === tag && styles.tagFilterChipActive,
              tagFilter === tag &&
                theme && { backgroundColor: theme.primarySoft },
            ]}
          >
            <Text
              style={[
                styles.tagFilterLabel,
                tagFilter === tag && styles.tagFilterLabelActive,
                tagFilter === tag && theme && { color: theme.primary },
              ]}
            >
              # {tag}
            </Text>
          </Pressable>
        ))}
        </ScrollView>
      </View>
      </View>
      <View style={styles.placeList}>
        {visible.map((place, index) => (
          <View
            key={place.name}
            style={[
              (styles as any).placeMiniCard,
              { backgroundColor: theme?.surface ?? "#FFFFFF", borderColor: theme?.border ?? "#E5E3DD" },
            ]}
          >
            <View style={[(styles as any).placeMiniTape, { backgroundColor: `${[theme?.primary, theme?.secondary, theme?.accent][index % 3] ?? "#8B7CF6"}38` }]} />
            <View style={(styles as any).placeMiniTop}>
              <View style={[(styles as any).placeMiniStamp, { backgroundColor: [theme?.primarySoft, `${theme?.secondary}1C`, `${theme?.accent}1C`][index % 3] }]}>
                <Text style={[(styles as any).placeMiniNumber, { color: [theme?.primary, theme?.secondary, theme?.accent][index % 3] }]}>{String(index + 1).padStart(2, "0")}</Text>
              </View>
              <View style={(styles as any).placeMiniInfo}>
                <View style={(styles as any).placeMiniTitleRow}>
                  <Text numberOfLines={1} style={[(styles as any).placeMiniName, { color: theme?.text ?? "#17233D" }]}>{place.name}</Text>
                  <View style={[(styles as any).placeMiniStatus, { backgroundColor: place.status === "일정" ? `${theme?.accent}1E` : `${theme?.primary}16` }]}>
                    <Text style={[(styles as any).placeMiniStatusText, { color: place.status === "일정" ? theme?.accent : theme?.primary }]}>{place.status === "일정" ? "일정에 담김" : "저장"}</Text>
                  </View>
                </View>
                <Text style={[(styles as any).placeMiniMeta, { color: theme?.muted ?? "#727C8D" }]}>{place.area} · {place.category}</Text>
              </View>
            </View>
            <View style={(styles as any).placeMiniTags}>
              {place.tags.slice(0, 3).map((tag) => (
                <Pressable key={tag} onPress={() => setTagFilter(tag)} style={[(styles as any).placeMiniTag, { backgroundColor: theme?.primarySoft ?? "#F0EDFF" }]}>
                  <Text style={[(styles as any).placeMiniTagText, { color: theme?.primary ?? "#6556D8" }]}># {tag}</Text>
                </Pressable>
              ))}
              {place.tags.length > 3 && <Text style={[(styles as any).placeMiniMore, { color: theme?.muted }]}>+{place.tags.length - 3}</Text>}
            </View>
            <View style={[(styles as any).placeMiniActions, { borderTopColor: theme?.border ?? "#E5E3DD" }]}>
              <Pressable onPress={() => openEdit(place)} style={[(styles as any).placeMiniIconButton, { backgroundColor: theme?.surfaceAlt ?? "#F4F1EB" }]}>
                <Text style={[(styles as any).placeMiniEditText, { color: theme?.muted ?? "#727C8D" }]}>수정</Text>
              </Pressable>
              <Pressable onPress={() => place.mapUrl ? Linking.openURL(place.mapUrl) : openEdit(place)} style={[(styles as any).placeMiniMapButton, { backgroundColor: place.mapUrl ? "#E6F5ED" : theme?.surfaceAlt }]}>
                <Text style={[(styles as any).placeMiniMapText, { color: place.mapUrl ? "#16844E" : theme?.muted }]}>{place.mapUrl ? "N 지도" : "＋ 링크"}</Text>
              </Pressable>
              <Pressable
                disabled={place.status === "일정"}
                onPress={() => choose(index)}
                style={[
                  (styles as any).placeMiniPlanButton,
                  { backgroundColor: place.status === "일정" ? theme?.surfaceAlt : theme?.primary },
                ]}
              >
                <Text style={[(styles as any).placeMiniPlanText, place.status === "일정" && { color: theme?.muted }]}>{place.status === "일정" ? "완료 ✓" : "일정에 담기"}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
      <View
        style={[
          styles.packingListTools,
          theme && { borderTopColor: theme.border },
        ]}
      >
        <View style={styles.packingListToolsCopy}>
          <Text
            style={[
              styles.packingListToolsTitle,
              theme && { color: theme.text },
            ]}
          >
            목록 한꺼번에 수정
          </Text>
          <Text
            style={[
              styles.packingListToolsHint,
              theme && { color: theme.muted },
            ]}
          >
            복사해 수정한 뒤 다시 붙여넣을 수 있어요
          </Text>
        </View>
        <Pressable
          onPress={copyPlaces}
          style={[
            styles.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            복사
          </Text>
        </Pressable>
        <Pressable
          onPress={openImport}
          style={[
            styles.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            붙여넣기
          </Text>
        </Pressable>
      </View>
      <DetailSheet
        visible={planningPlace !== null}
        title="일정에 담기"
        subtitle={
          planningPlace ? `${planningPlace.name}을(를) 언제 갈까요?` : undefined
        }
        submit="이 일정으로 확정"
        onClose={() => setPlanningPlace(null)}
        onSubmit={confirmPlan}
      >
        <View style={styles.planPlaceSummary}>
          <Text style={styles.planPlaceName}>{planningPlace?.name}</Text>
          <Text style={styles.planPlaceMeta}>
            {planningPlace?.area} · {planningPlace?.category}
          </Text>
          <View style={styles.placeTags}>
            {planningPlace?.tags.map((tag) => (
              <View key={tag} style={styles.placeTag}>
                <Text style={styles.placeTagText}># {tag}</Text>
              </View>
            ))}
          </View>
        </View>
        <OptionField
          label="날짜"
          options={["금 · 21", "토 · 22", "일 · 23"]}
          value={planningDay}
          onChange={setPlanningDay}
        />
        <DetailField
          label="시간 (선택)"
          value={planningTime}
          onChangeText={setPlanningTime}
          placeholder="시간 미정 가능"
        />
      </DetailSheet>
      <DetailSheet
        visible={adding}
        title={editingName ? "장소 수정" : "장소 추가"}
        subtitle="이름만 입력해도 저장할 수 있어요"
        submit={
          name.trim()
            ? editingName
              ? "변경사항 저장"
              : "장소 저장"
            : "장소 이름을 입력해 주세요"
        }
        destructiveLabel={editingName ? "장소 삭제" : undefined}
        submitDisabled={!placeFormValid}
        onDestructive={deletePlace}
        onClose={() => setAdding(false)}
        onSubmit={savePlace}
      >
        <View style={styles.placeFormIntro}>
          <View style={[styles.placeRequiredBadge, theme && { backgroundColor: theme.primarySoft }]}>
            <Text style={[styles.placeRequiredBadgeText, theme && { color: theme.primary }]}>필수 1개</Text>
          </View>
          <Text style={[styles.placeFormText, theme && { color: theme.muted }]}>장소 이름만 있으면 저장할 수 있어요</Text>
        </View>
        <DetailField
          label="장소 이름 · 필수"
          value={name}
          onChangeText={setName}
          placeholder="예: 은행골블랙"
        />
        <View style={styles.inlineFields}>
          <View style={styles.titleField}>
            <DetailField
              label="지역"
              value={area}
              onChangeText={setArea}
              placeholder="구로"
            />
          </View>
        </View>
        <OptionField
          label="종류"
          options={["식당", "카페", "구경", "쇼핑", "숙소"]}
          value={category}
          onChange={setCategory}
        />
        <View style={styles.tagEditor}>
          <Text style={[styles.detailFieldLabel, styles.selectorLabel]}>태그</Text>
          <Text style={[styles.placeRecommendLabel, theme && { color: theme.muted }]}>추천 태그</Text>
          <View style={styles.tagSuggestions}>
            {["숙소 근처", "웨이팅", "예약", "가성비", "비 오는 날"].map(
              (tag) => (
                <Pressable
                  key={tag}
                  onPress={() => addTag(tag)}
                  style={[
                    styles.tagSuggestion,
                    draftTags.includes(tag) && styles.tagSuggestionActive,
                    draftTags.includes(tag) &&
                      theme && {
                        backgroundColor: theme.primarySoft,
                        borderColor: theme.primary,
                      },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagSuggestionText,
                      draftTags.includes(tag) && styles.tagSuggestionTextActive,
                      draftTags.includes(tag) &&
                        theme && { color: theme.primary },
                    ]}
                  >
                    # {tag}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
          <TextInput
            value={tagText}
            onChangeText={setTagText}
            placeholder="쉼표로 구분 · 예: 초밥, 디너, 조용한 곳"
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[styles.tagInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
          <View style={styles.draftTags}>
            {draftTags.map((tag) => (
              <Pressable
                key={tag}
                onPress={() =>
                  setTagText(
                    draftTags.filter((item) => item !== tag).join(", "),
                  )
                }
                style={styles.draftTag}
              >
                <Text style={styles.draftTagText}># {tag} ×</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={[styles.naverField, theme?.dark && { backgroundColor: "#16352C", borderColor: "#245544" }]}>
          <View style={styles.naverHead}>
            <View style={styles.naverLogo}>
              <Text style={styles.naverLogoText}>N</Text>
            </View>
            <View>
              <Text style={[styles.naverTitle, theme?.dark && { color: "#DDF7E9" }]}>네이버 지도 링크 · 선택</Text>
              <Text style={[styles.naverHint, theme?.dark && { color: "#96B7A8" }]}>
                장소 공유 링크를 붙여넣으세요
              </Text>
            </View>
          </View>
          <TextInput
            value={mapUrl}
            onChangeText={setMapUrl}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://naver.me/..."
            placeholderTextColor="#91A19B"
            style={[styles.naverInput, theme?.dark && { backgroundColor: theme.surface, color: theme.text }]}
          />
          {mapUrl.length > 0 && (
            <Text style={styles.linkState}>
              {mapUrl.includes("naver.")
                ? "✓ 장소 링크가 연결돼요"
                : "네이버 지도 링크인지 확인해 주세요"}
            </Text>
          )}
        </View>
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="장소 목록 붙여넣기"
        subtitle="복사한 내용을 메모에서 고친 뒤 한 번에 반영하세요"
        submit={
          importText.trim()
            ? `${importMode}하기`
            : "장소 목록을 입력해 주세요"
        }
        onClose={() => setImporting(false)}
        onSubmit={importPlaces}
      >
        <OptionField
          label="반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
        <DetailField
          label="장소 | 지역 | 종류 | #태그 | 네이버 지도 링크"
          value={importText}
          onChangeText={setImportText}
          multiline
          placeholder="장소마다 한 줄씩 붙여넣으세요"
        />
        <Text style={styles.settingHint}>
          ‘교체’는 현재 목록을 지우고 새 목록으로 바꿔요. 붙여넣은 장소는 저장한
          장소로 추가됩니다.
        </Text>
      </DetailSheet>
    </View>
  );
}

function Preparation({
  done,
  toggle,
  items,
  setItems,
  recipes,
}: {
  done: string[];
  toggle: (item: string) => void;
  items: PackingItem[];
  setItems: React.Dispatch<React.SetStateAction<PackingItem[]>>;
  recipes: Recipe[];
}) {
  const theme = useContext(DetailThemeContext);
  const [adding, setAdding] = useState(false);
  const [names, setNames] = useState("");
  const [quantity, setQuantity] = useState("");
  const [owner, setOwner] = useState<PackingItem["owner"]>("미정");
  const [tagText, setTagText] = useState("");
  const [filter, setFilter] = useState<"전체" | "남은 준비" | "완료">("전체");
  const [ownerFilter, setOwnerFilter] = useState<"전체" | PackingItem["owner"]>(
    "전체",
  );
  const [tagFilter, setTagFilter] = useState("전체 태그");
  const [tagPicker, setTagPicker] = useState(false);
  const [collapsedOwners, setCollapsedOwners] = useState<
    PackingItem["owner"][]
  >(["동행", "함께", "미정"]);
  const [assigningItem, setAssigningItem] = useState<PackingItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"교체" | "추가">("교체");
  const [cookingPicker, setCookingPicker] = useState(false);
  const [selectedCookingItems, setSelectedCookingItems] = useState<string[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [collapsedPackingTags, setCollapsedPackingTags] = useState<string[]>([]);
  const completedCount = done.filter((name) =>
    items.some((item) => item.name === name),
  ).length;
  const percentage = items.length
    ? Math.round((completedCount / items.length) * 100)
    : 0;
  const visibleItems = items.filter((item) => {
    const matchesFilter =
      filter === "전체" ||
      (filter === "남은 준비" && !done.includes(item.name)) ||
      (filter === "완료" && done.includes(item.name));
    const matchesOwner = ownerFilter === "전체" || item.owner === ownerFilter;
    const matchesTag =
      tagFilter === "전체 태그" || packingTags(item).includes(tagFilter);
    return matchesFilter && matchesOwner && matchesTag;
  });
  const ownerSections: PackingItem["owner"][] = ["나", "동행", "함께", "미정"];
  const managementTags = [
    "전체 태그",
    ...Array.from(new Set(items.flatMap((item) => packingTags(item)))),
  ];
  const draftPackingTags = tagText
    .split(/[,#\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const newPackingCount = names
    .split(/[\n,]/)
    .filter((name) => name.trim()).length;
  const availableTags = managementTags.slice(1);
  const quickTags = Array.from(
    new Set([
      ...(tagFilter !== "전체 태그" ? [tagFilter] : []),
      ...availableTags,
    ]),
  ).slice(0, 4);
  const groupByPrimaryTag = (source: PackingItem[]) =>
    Array.from(
      source.reduce((groups, item) => {
        const tag = packingTags(item)[0] || "태그 없음";
        groups.set(tag, [...(groups.get(tag) ?? []), item]);
        return groups;
      }, new Map<string, PackingItem[]>()),
    );
  const remainingGroups = groupByPrimaryTag(
    visibleItems.filter((item) => !done.includes(item.name)),
  );
  const completedGroups = groupByPrimaryTag(
    visibleItems.filter((item) => done.includes(item.name)),
  );
  const selectOwnerFilter = (nextOwner: "전체" | PackingItem["owner"]) => {
    setOwnerFilter(nextOwner);
    if (nextOwner !== "전체") {
      setCollapsedOwners((current) =>
        current.filter((ownerName) => ownerName !== nextOwner),
      );
    }
  };
  const submit = () => {
    const parsed = names
      .split(/[\n,]/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (!parsed.length) return;
    const stamp = Date.now();
    setItems((current) => [
      ...current,
      ...parsed.map((name, index) => ({
        id: `${stamp}-${index}`,
        name,
        quantity: quantity.trim(),
        owner,
        tags: draftPackingTags,
      })),
    ]);
    setNames("");
    setQuantity("");
    setTagText("");
    setAdding(false);
  };
  const assignOwner = (item: PackingItem, nextOwner: PackingItem["owner"]) => {
    setItems((current) =>
      current.map((value) =>
        value.id === item.id ? { ...value, owner: nextOwner } : value,
      ),
    );
    setAssigningItem(null);
  };
  const complete = (item: PackingItem) => {
    toggle(item.name);
  };
  const copyPacking = async () => {
    await Clipboard.setStringAsync(
      items
        .map(
          (item) =>
            `${item.name} | ${item.quantity} | ${packingOwnerName(item.owner)} | ${packingTags(
              item,
            )
              .map((tag) => `#${tag}`)
              .join(" ")}`,
        )
        .join("\n"),
    );
    Alert.alert(
      "준비 목록을 복사했어요",
      "메모에서 고친 뒤 다시 붙여넣을 수 있어요.",
    );
  };
  const openImport = async () => {
    setImportText(await Clipboard.getStringAsync());
    setImporting(true);
  };
  const importPacking = () => {
    const ownerAliases: Record<string, PackingItem["owner"]> = {
      하늘: "나",
      여울: "동행",
      공용: "함께",
      미정: "미정",
      나: "나",
      동행: "동행",
      함께: "함께",
    };
    const stamp = Date.now();
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [name, quantity = "", rawOwner = "미정", rawTags = ""] = line
          .split("|")
          .map((value) => value.trim());
        return {
          id: `${stamp}-${index}`,
          name,
          quantity,
          owner: ownerAliases[rawOwner] ?? "미정",
          tags: rawTags.split(/[# ,]+/).filter(Boolean),
        };
      })
      .filter((item) => item.name);
    if (!parsed.length) return;
    setItems((current) =>
      importMode === "교체" ? parsed : [...current, ...parsed],
    );
    setImporting(false);
  };
  const toggleCookingItem = (id: string) =>
    setSelectedCookingItems((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id],
    );
  const importCookingItems = () => {
    const existingNames = new Set(items.map((item) => item.name));
    const selected = recipes.flatMap((recipe) =>
      recipe.ingredients
        .filter(
          (ingredient) =>
            selectedCookingItems.includes(ingredient.id) &&
            !existingNames.has(ingredient.name),
        )
        .map((ingredient) => ({ recipe, ingredient })),
    );
    if (!selected.length) {
      setCookingPicker(false);
      return;
    }
    const stamp = Date.now();
    setItems((current) => [
      ...current,
      ...selected.map(({ recipe, ingredient }, index) => ({
        id: `cooking-${stamp}-${index}`,
        name: ingredient.name,
        quantity: ingredient.quantity,
        owner:
          ingredient.owner === "하늘"
            ? ("나" as const)
            : ingredient.owner === "여울"
              ? ("동행" as const)
              : ("미정" as const),
        tags: ["요리 재료", recipe.name, ingredient.group],
      })),
    ]);
    setSelectedCookingItems([]);
    setCookingPicker(false);
  };
  const renderPackingRow = (item: PackingItem, index: number) => {
    const completed = done.includes(item.name);
    return (
      <Pressable
        key={item.id}
        onPress={() => complete(item)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`${item.name} 준비 완료`}
        style={({ pressed }) => [
          styles.packingV2Row,
          index > 0 && styles.packingV2RowBorder,
          index > 0 && theme && { borderTopColor: theme.border },
          pressed && styles.packingCardPressed,
        ]}
      >
        <View
          style={[
            styles.packingV2Check,
            theme && {
              borderColor: completed ? theme.primary : theme.border,
              backgroundColor: completed ? theme.primary : theme.surface,
            },
          ]}
        >
          {completed ? (
            <Text style={styles.completionTick}>✓</Text>
          ) : (
            <View style={[styles.completionDash, theme && { backgroundColor: theme.border }]} />
          )}
        </View>
        <View style={styles.packingV2Body}>
          <View style={styles.packingV2TitleRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.checkName,
                styles.packingV2Name,
                theme && { color: completed ? theme.muted : theme.text },
                completed && styles.checkNameDone,
              ]}
            >
              {item.name}
            </Text>
            {item.quantity ? (
              <Text style={[styles.packingV2Quantity, theme && { color: theme.muted }]}>{item.quantity}</Text>
            ) : null}
          </View>
          {packingTags(item).slice(1).length > 0 && (
            <Text numberOfLines={1} style={[styles.packingV2SubTags, theme && { color: theme.muted }]}>
              {packingTags(item).slice(1).map((tag) => `#${tag}`).join("  ")}
            </Text>
          )}
        </View>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            setAssigningItem(item);
          }}
          hitSlop={8}
          style={[styles.packingV2Assignee, theme && { backgroundColor: theme.primarySoft }]}
        >
          <Text style={[styles.packingOwnerChangeText, theme && { color: theme.primary }]}>
            {packingOwnerName(item.owner)}
          </Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View>
      <View
        style={[
          styles.packingJourney,
          theme && { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={[styles.packingJourneyStamp, theme && { backgroundColor: theme.primarySoft }]}>
          <View style={[styles.packingSuitcaseHandle, theme && { borderColor: theme.primary }]} />
          <View style={[styles.packingSuitcaseBody, theme && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
            <View style={styles.packingSuitcaseStrap} />
            <View style={styles.packingSuitcaseSticker}>
              <Text style={[styles.packingSuitcaseStickerText, theme && { color: theme.primary }]}>D</Text>
            </View>
          </View>
          <View style={styles.packingSuitcaseFeet}>
            <View style={[styles.packingSuitcaseFoot, theme && { backgroundColor: theme.primary }]} />
            <View style={[styles.packingSuitcaseFoot, theme && { backgroundColor: theme.primary }]} />
          </View>
        </View>
        <View style={styles.packingJourneyBody}>
          <View style={styles.packingJourneyCopy}>
            <View>
              <Text style={[styles.packingJourneyEyebrow, theme && { color: theme.primary }]}>준비물 · {items.length}개</Text>
              <Text style={[styles.packingJourneyTitle, theme && { color: theme.text }]}>
                {percentage === 100
                  ? "짐 꾸리기 완료!"
                  : percentage >= 60
                    ? "거의 다 챙겼어요"
                    : percentage > 0
                      ? "하나씩 챙기는 중"
                      : "이제 짐을 꾸려볼까요?"}
              </Text>
            </View>
            <View style={styles.packingJourneyActions}>
              <Pressable
                onPress={() => setAdding(true)}
                accessibilityRole="button"
                accessibilityLabel="준비물 추가"
                style={({ pressed }) => [
                  styles.packingJourneyAdd,
                  theme && { backgroundColor: theme.primary },
                  pressed && styles.packingCardPressed,
                ]}
              >
                <Text style={styles.packingJourneyAddText}>＋ 준비물 추가</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.packingJourneyProgressRow}>
            <View style={[styles.packingJourneyTrack, theme && { backgroundColor: theme.primarySoft }]}>
              <View style={[styles.packingJourneyFill, { width: `${percentage}%` }, theme && { backgroundColor: theme.primary }]} />
              {[0, 50, 100].map((point) => (
                <View
                  key={point}
                  style={[
                    styles.packingJourneyPoint,
                    { left: `${point}%` },
                    theme && {
                      backgroundColor: percentage >= point ? theme.primary : theme.surface,
                      borderColor: percentage >= point ? theme.primary : theme.border,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.packingJourneyPercent, theme && { color: theme.primary }]}>{percentage}%</Text>
          </View>
        </View>
      </View>
      <View
        style={[
          styles.packingV2Controls,
          theme && { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.packingV2StatusRow}>
          <View style={styles.packingV2StatusTabs}>
            {(["전체", "남은 준비", "완료"] as const).map((item) => {
              const active = filter === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[
                    styles.packingV2StatusChip,
                    active && theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <Text style={[styles.packingFilterChipText, theme && { color: active ? theme.primary : theme.muted }]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => setTagPicker(true)} style={[styles.packingV2TagButton, theme && { borderColor: theme.border }]}>
            <Text style={[styles.packingV2TagButtonText, theme && { color: theme.primary }]}>
              {tagFilter === "전체 태그" ? `태그 ${availableTags.length}` : `#${tagFilter}`}
            </Text>
            <Text style={[styles.packingV2TagChevron, theme && { color: theme.muted }]}>⌄</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packingV2Owners}>
          {(["전체", ...ownerSections] as const).map((ownerName) => {
            const active = ownerFilter === ownerName;
            const remaining = ownerName === "전체"
              ? items.length - completedCount
              : items.filter((item) => item.owner === ownerName && !done.includes(item.name)).length;
            return (
              <Pressable
                key={ownerName}
                onPress={() => selectOwnerFilter(ownerName)}
                style={[
                  styles.packingV2OwnerChip,
                  theme && { borderColor: active ? theme.primary : theme.border },
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text style={[styles.packingV2OwnerName, theme && { color: active ? theme.primary : theme.text }]}>
                  {ownerName === "전체" ? "전체" : packingOwnerName(ownerName)}
                </Text>
                <Text style={[styles.packingV2OwnerCount, theme && { color: active ? theme.primary : theme.muted }]}>{remaining}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <View style={[styles.packingManageHead, styles.packingV2Hidden]}>
        <View>
          <Text
            style={[styles.packingManageTitle, theme && { color: theme.text }]}
          >
            담당별 준비물
          </Text>
          <Text
            style={[styles.packingManageHint, theme && { color: theme.muted }]}
          >
            이름을 누르면 해당 준비물만 보여요
          </Text>
        </View>
        <Pressable
          onPress={() => selectOwnerFilter("전체")}
          style={[
            styles.packingShowAll,
            theme && {
              backgroundColor:
                ownerFilter === "전체" ? theme.primarySoft : theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text
            style={[
              styles.packingShowAllText,
              theme && {
                color: ownerFilter === "전체" ? theme.primary : theme.muted,
              },
            ]}
          >
            전체 {items.length}
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.ownerStats,
          styles.packingV2Hidden,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        {ownerSections.map((ownerName, index) => {
          const remaining = items.filter(
            (item) => item.owner === ownerName && !done.includes(item.name),
          ).length;
          const active = ownerFilter === ownerName;
          return (
            <View key={ownerName} style={styles.ownerStatSlot}>
              {index > 0 && (
                <View
                  style={[
                    styles.ownerDivider,
                    theme && { backgroundColor: theme.border },
                  ]}
                />
              )}
              <Pressable
                onPress={() => selectOwnerFilter(active ? "전체" : ownerName)}
                style={[
                  styles.ownerStat,
                  active && styles.ownerStatActive,
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text
                  style={[
                    styles.ownerStatName,
                    theme && { color: active ? theme.primary : theme.text },
                  ]}
                >
                  {packingOwnerName(ownerName)}
                </Text>
                <Text
                  style={[
                    styles.ownerStatCount,
                    ownerName === "미정" && styles.unassignedText,
                    theme && ownerName !== "미정" && { color: theme.muted },
                  ]}
                >
                  {remaining}개 남음
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      <View
        style={[
          styles.packingFilterBoard,
          styles.packingV2Hidden,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.packingFilterLine}>
          <Text
            style={[styles.packingFilterLabel, theme && { color: theme.muted }]}
          >
            태그
          </Text>
          <ScrollView
            style={styles.packingFilterScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.packingFilters}
          >
            {["전체 태그", ...quickTags.slice(0, 2)].map((tag) => {
              const active = tagFilter === tag;
              return (
                <Pressable
                  key={tag}
                  onPress={() => setTagFilter(tag)}
                  style={[
                    styles.packingFilterChip,
                    active && theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.packingFilterChipText,
                      theme && { color: active ? theme.primary : theme.muted },
                    ]}
                  >
                    {tag === "전체 태그" ? "모든 태그" : `#${tag}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {availableTags.length > 2 && (
            <Pressable
              onPress={() => setTagPicker(true)}
              style={[
                styles.packingFilterMore,
                theme && { borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  styles.packingFilterMoreText,
                  theme && { color: theme.text },
                ]}
              >
                전체 {availableTags.length}
              </Text>
            </Pressable>
          )}
        </View>
        <View
          style={[
            styles.packingFilterRule,
            theme && { backgroundColor: theme.border },
          ]}
        />
        <View style={styles.packingFilterLine}>
          <Text
            style={[styles.packingFilterLabel, theme && { color: theme.muted }]}
          >
            상태
          </Text>
          <View style={styles.packingFilters}>
            {(["전체", "남은 준비", "완료"] as const).map((item) => {
              const active = filter === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[
                    styles.packingFilterChip,
                    active && theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.packingFilterChipText,
                      theme && { color: active ? theme.primary : theme.muted },
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.packingList}>
        {remainingGroups.map(([sourceTag, taggedItems], groupIndex) => {
          const collapsed = collapsedPackingTags.includes(sourceTag);
          const groupAccent = theme
            ? [theme.primary, theme.secondary, theme.accent][groupIndex % 3]
            : ["#FF6B63", "#55BFB4", "#8B7CF6"][groupIndex % 3];
          const allInGroup = items.filter(
            (item) => (packingTags(item)[0] || "태그 없음") === sourceTag,
          );
          const doneInGroup = allInGroup.filter((item) =>
            done.includes(item.name),
          ).length;
          return (
            <View
              key={sourceTag}
              style={[
                styles.packingV2Group,
                theme && {
                  backgroundColor: theme.surface,
                  borderColor: `${groupAccent}55`,
                },
              ]}
            >
              <Pressable
                onPress={() =>
                  setCollapsedPackingTags((current) =>
                    current.includes(sourceTag)
                      ? current.filter((tag) => tag !== sourceTag)
                      : [...current, sourceTag],
                  )
                }
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                accessibilityLabel={`${sourceTag} 준비물 ${collapsed ? "펼치기" : "접기"}`}
                style={({ pressed }) => [
                  styles.packingV2GroupHead,
                  { backgroundColor: `${groupAccent}0D` },
                  pressed && styles.packingV2GroupHeadPressed,
                ]}
              >
                <View>
                  <View style={styles.packingV2GroupTitleRow}>
                    <View style={[styles.packingV2GroupSticker, { backgroundColor: `${groupAccent}20` }]}>
                      <Text style={[styles.packingV2GroupStickerText, { color: groupAccent }]}>PACK {String(groupIndex + 1).padStart(2, "0")}</Text>
                    </View>
                    <Text style={[styles.packingV2GroupTitle, theme && { color: theme.text }]}>{sourceTag}</Text>
                  </View>
                  <Text style={[styles.packingV2GroupProgress, theme && { color: theme.muted }]}>
                    {doneInGroup}/{allInGroup.length} 완료
                  </Text>
                </View>
                <View style={styles.packingV2GroupActions}>
                  <View style={[styles.packingV2GroupCount, { backgroundColor: `${groupAccent}18` }]}>
                    <Text style={[styles.packingV2GroupCountText, { color: groupAccent }]}>
                      {taggedItems.length}개 남음
                    </Text>
                  </View>
                  <Text style={[styles.packingV2GroupToggle, theme && { color: theme.muted }]}>
                    {collapsed ? "＋" : "−"}
                  </Text>
                </View>
              </Pressable>
              {!collapsed && taggedItems.map(renderPackingRow)}
            </View>
          );
        })}
        {completedGroups.length > 0 && (
          <View
            style={[
              styles.packingV2Completed,
              theme && {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
              },
            ]}
          >
            <Pressable
              onPress={() => setShowCompleted((value) => !value)}
              style={styles.packingV2CompletedHead}
            >
              <Text style={[styles.packingV2CompletedTitle, theme && { color: theme.text }]}>
                완료한 준비물 {completedGroups.reduce((sum, [, groupItems]) => sum + groupItems.length, 0)}개
              </Text>
              <Text style={[styles.packingV2CompletedToggle, theme && { color: theme.primary }]}>
                {filter === "완료" || showCompleted ? "접기" : "보기"}
              </Text>
            </Pressable>
            {(filter === "완료" || showCompleted) &&
              completedGroups.flatMap(([, groupItems]) => groupItems).map(renderPackingRow)}
          </View>
        )}
        {false && ownerSections.map((sectionOwner) => {
          const ownerItems = visibleItems.filter(
            (item) => item.owner === sectionOwner,
          );
          if (!ownerItems.length) return null;
          const ownerDone = ownerItems.filter((item) =>
            done.includes(item.name),
          ).length;
          const collapsed = collapsedOwners.includes(sectionOwner);
          const ownerColor = theme
            ? sectionOwner === "나"
              ? theme.primary
              : sectionOwner === "동행"
                ? theme.secondary
                : sectionOwner === "함께"
                  ? theme.accent
                  : theme.muted
            : "#8B7CF6";
          const sectionTags = Array.from(
            new Set(
              ownerItems.map((item) => packingTags(item)[0] || "태그 없음"),
            ),
          );
          return (
            <View
              key={sectionOwner}
              style={[
                styles.packingOwnerSection,
                {
                  borderLeftColor: ownerColor,
                  backgroundColor: `${ownerColor}0D`,
                },
              ]}
            >
              <Pressable
                onPress={() =>
                  setCollapsedOwners((current) =>
                    current.includes(sectionOwner)
                      ? current.filter(
                          (ownerName) => ownerName !== sectionOwner,
                        )
                      : [...current, sectionOwner],
                  )
                }
                style={styles.packingOwnerHead}
              >
                <View
                  style={[
                    styles.packingOwnerAvatar,
                    { backgroundColor: `${ownerColor}1C` },
                  ]}
                >
                  <Text
                    style={[
                      styles.packingOwnerAvatarText,
                      { color: ownerColor },
                    ]}
                  >
                    {sectionOwner === "미정"
                      ? "?"
                      : packingOwnerName(sectionOwner).slice(0, 1)}
                  </Text>
                </View>
                <View style={styles.packingOwnerCopy}>
                  <Text
                    style={[
                      styles.packingOwnerName,
                      theme && { color: theme.text },
                    ]}
                  >
                    {sectionOwner === "함께"
                      ? "공용 준비물"
                      : sectionOwner === "미정"
                        ? "담당을 정해요"
                        : `${packingOwnerName(sectionOwner)}의 준비물`}
                  </Text>
                  <Text
                    style={[
                      styles.packingOwnerProgress,
                      theme && { color: theme.muted },
                    ]}
                  >
                    {ownerDone} / {ownerItems.length} 완료
                  </Text>
                </View>
                <Text
                  style={[styles.packingCollapseIcon, { color: ownerColor }]}
                >
                  {collapsed ? "＋" : "−"}
                </Text>
              </Pressable>
              {!collapsed &&
                sectionTags.map((sourceTag) => {
                  const taggedItems = ownerItems.filter(
                    (item) =>
                      (packingTags(item)[0] || "태그 없음") === sourceTag,
                  );
                  if (!taggedItems.length) return null;
                  return (
                    <View key={sourceTag} style={styles.packingTagGroup}>
                      <View style={styles.packingTagHead}>
                        <Text
                          style={[
                            styles.packingTagHeadText,
                            theme && { color: theme.muted },
                          ]}
                        >
                          # {sourceTag}
                        </Text>
                        <View
                          style={[
                            styles.packingTagLine,
                            theme && { backgroundColor: theme.border },
                          ]}
                        />
                        <Text
                          style={[
                            styles.packingTagCount,
                            theme && { color: theme.muted },
                          ]}
                        >
                          {taggedItems.length}
                        </Text>
                      </View>
                      {taggedItems.map((item) => {
                        const completed = done.includes(item.name);
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => complete(item)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: completed }}
                            accessibilityLabel={`${item.name} 준비 완료`}
                            style={({ pressed }) => [
                              styles.packingCard,
                              theme && {
                                backgroundColor: completed
                                  ? theme.surfaceAlt
                                  : theme.surface,
                                borderColor: theme.border,
                              },
                              completed && styles.packingCardDone,
                              pressed && styles.packingCardPressed,
                            ]}
                          >
                            <View
                              style={[
                                styles.completionMark,
                                theme && {
                                  borderColor: completed
                                    ? theme.primary
                                    : theme.border,
                                  backgroundColor: completed
                                    ? theme.primary
                                    : theme.background,
                                },
                              ]}
                            >
                              {completed ? (
                                <Text style={styles.completionTick}>✓</Text>
                              ) : (
                                <View
                                  style={[
                                    styles.completionDash,
                                    theme && { backgroundColor: theme.border },
                                  ]}
                                />
                              )}
                            </View>
                            <View style={styles.packingBody}>
                              <View style={styles.packingTitleRow}>
                                <Text
                                  style={[
                                    styles.checkName,
                                    theme && { color: theme.text },
                                    completed && styles.checkNameDone,
                                  ]}
                                >
                                  {item.name}
                                </Text>
                                {item.quantity ? (
                                  <Text
                                    style={[
                                      styles.packingQuantity,
                                      theme && { color: theme.muted },
                                    ]}
                                  >
                                    {item.quantity}
                                  </Text>
                                ) : null}
                              </View>
                              <View style={styles.packingMetaRow}>
                                <Text
                                  style={[
                                    styles.packingTiming,
                                    theme && { color: theme.muted },
                                  ]}
                                >
                                  {packingTags(item)
                                    .slice(1)
                                    .map((tag) => `#${tag}`)
                                    .join("  ") || "태그 없음"}
                                </Text>
                                <Pressable
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    setAssigningItem(item);
                                  }}
                                  hitSlop={8}
                                  style={[
                                    styles.packingOwnerChange,
                                    theme && {
                                      backgroundColor: theme.primarySoft,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.packingOwnerChangeText,
                                      theme && { color: theme.primary },
                                    ]}
                                  >
                                    {sectionOwner === "미정"
                                      ? "담당 지정"
                                      : "담당 변경"}
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
            </View>
          );
        })}
      </View>
      {visibleItems.length === 0 && (
        <View style={styles.emptyPacking}>
          <Text style={styles.emptyPackingText}>
            선택한 조건의 준비물이 없어요.
          </Text>
        </View>
      )}
      <View
        style={[
          styles.packingListTools,
          theme && { borderTopColor: theme.border },
        ]}
      >
        <View style={styles.packingListToolsCopy}>
          <Text
            style={[
              styles.packingListToolsTitle,
              theme && { color: theme.text },
            ]}
          >
            목록 한꺼번에 수정
          </Text>
          <Text
            style={[
              styles.packingListToolsHint,
              theme && { color: theme.muted },
            ]}
          >
            복사해 수정한 뒤 다시 붙여넣을 수 있어요
          </Text>
        </View>
        <Pressable
          onPress={copyPacking}
          style={[
            styles.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            복사
          </Text>
        </Pressable>
        <Pressable
          onPress={openImport}
          style={[
            styles.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            붙여넣기
          </Text>
        </Pressable>
      </View>
      <DetailSheet
        visible={tagPicker}
        title="태그 선택"
        subtitle="보고 싶은 준비물의 태그를 선택하세요"
        submit="닫기"
        onClose={() => setTagPicker(false)}
        onSubmit={() => setTagPicker(false)}
      >
        <View style={styles.tagPickerGrid}>
          {["전체 태그", ...availableTags].map((tag) => {
            const active = tagFilter === tag;
            const count =
              tag === "전체 태그"
                ? items.length
                : items.filter((item) => packingTags(item).includes(tag))
                    .length;
            return (
              <Pressable
                key={tag}
                onPress={() => {
                  setTagFilter(tag);
                  setTagPicker(false);
                }}
                style={[
                  styles.tagPickerItem,
                  theme && {
                    backgroundColor: active ? theme.primarySoft : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tagPickerName,
                    theme && { color: active ? theme.primary : theme.text },
                  ]}
                >
                  {tag === "전체 태그" ? tag : `# ${tag}`}
                </Text>
                <Text
                  style={[
                    styles.tagPickerCount,
                    theme && { color: theme.muted },
                  ]}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </DetailSheet>
      <DetailSheet
        visible={Boolean(assigningItem)}
        title="담당 지정"
        subtitle={
          assigningItem
            ? `‘${assigningItem.name}’을(를) 누가 챙길지 선택하세요`
            : undefined
        }
        submit="취소"
        onClose={() => setAssigningItem(null)}
        onSubmit={() => setAssigningItem(null)}
      >
        <View style={styles.assignmentOptions}>
          {ownerSections.map((ownerName) => {
            const selected = assigningItem?.owner === ownerName;
            const descriptions: Record<PackingItem["owner"], string> = {
              나: "하늘의 준비물로 이동",
              동행: "여울의 준비물로 이동",
              함께: "공용 준비물로 이동",
              미정: "나중에 담당 정하기",
            };
            return (
              <Pressable
                key={ownerName}
                onPress={() =>
                  assigningItem && assignOwner(assigningItem, ownerName)
                }
                style={[
                  styles.assignmentOption,
                  theme && {
                    backgroundColor: selected
                      ? theme.primarySoft
                      : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.assignmentAvatar,
                    theme && {
                      backgroundColor: selected
                        ? theme.primary
                        : theme.surfaceAlt,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.assignmentAvatarText,
                      theme && {
                        color: selected ? "#FFFFFF" : theme.text,
                      },
                    ]}
                  >
                    {ownerName === "미정"
                      ? "?"
                      : packingOwnerName(ownerName).slice(0, 1)}
                  </Text>
                </View>
                <View style={styles.assignmentCopy}>
                  <Text
                    style={[
                      styles.assignmentName,
                      theme && { color: theme.text },
                    ]}
                  >
                    {packingOwnerName(ownerName)}
                  </Text>
                  <Text
                    style={[
                      styles.assignmentDescription,
                      theme && { color: theme.muted },
                    ]}
                  >
                    {descriptions[ownerName]}
                  </Text>
                </View>
                <View
                  style={[
                    styles.assignmentRadio,
                    theme && {
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  {selected && (
                    <View
                      style={[
                        styles.assignmentRadioDot,
                        theme && { backgroundColor: theme.primary },
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </DetailSheet>
      <DetailSheet
        visible={adding}
        title="준비물 추가"
        subtitle="여러 준비물을 쉼표나 줄바꿈으로 한 번에 추가하세요"
        submit={
          newPackingCount
            ? `${newPackingCount}개 추가`
            : "준비물을 입력해 주세요"
        }
        submitDisabled={!newPackingCount}
        onClose={() => setAdding(false)}
        onSubmit={submit}
      >
        <DetailField
          label="준비물 이름 · 필수"
          value={names}
          onChangeText={setNames}
          placeholder={"충전기, 안경, 갈아입을 옷"}
          multiline
        />
        <DetailField
          label="수량 · 선택"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="예: 각 2개, 250g"
        />
        <View style={styles.detailField}>
          <Text
            style={[
              styles.detailFieldLabel,
              styles.selectorLabel,
              theme && { color: theme.muted },
            ]}
          >
            담당 · 선택
          </Text>
          <View style={styles.packingAssigneeOptions}>
            {ownerSections.map((ownerName) => (
              <Pressable
                key={ownerName}
                onPress={() => setOwner(ownerName)}
                style={[
                  styles.packingAssigneeOption,
                  theme && {
                    backgroundColor:
                      owner === ownerName
                        ? theme.primarySoft
                        : `${theme.primary}10`,
                    borderColor:
                      owner === ownerName
                        ? theme.primary
                        : `${theme.primary}45`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.packingAssigneeOptionText,
                    theme && {
                      color: owner === ownerName ? theme.primary : theme.text,
                    },
                  ]}
                >
                  {packingOwnerName(ownerName)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.tagEditor}>
          <Text
            style={[
              styles.detailFieldLabel,
              styles.selectorLabel,
              theme && { color: theme.muted },
            ]}
          >
            태그
          </Text>
          <Text style={[styles.placeRecommendLabel, theme && { color: theme.muted }]}>추천 태그</Text>
          <View style={styles.tagSuggestions}>
            {["전자기기", "세면", "의류", "숙소", "출발 전"].map((tag) => {
              const selected = draftPackingTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() =>
                    setTagText(
                      selected
                        ? draftPackingTags
                            .filter((item) => item !== tag)
                            .join(", ")
                        : [...draftPackingTags, tag].join(", "),
                    )
                  }
                  style={[
                    styles.tagSuggestion,
                    selected && styles.tagSuggestionActive,
                    selected &&
                      theme && {
                        backgroundColor: theme.primarySoft,
                        borderColor: theme.primary,
                      },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagSuggestionText,
                      selected && styles.tagSuggestionTextActive,
                      selected && theme && { color: theme.primary },
                    ]}
                  >
                    # {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={tagText}
            onChangeText={setTagText}
            placeholder="쉼표로 구분 · 예: 전자기기, 출발 전, 숙소"
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[
              styles.tagInput,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />
          <View style={styles.draftTags}>
            {draftPackingTags.map((tag) => (
              <Pressable
                key={tag}
                onPress={() =>
                  setTagText(
                    draftPackingTags
                      .filter((currentTag) => currentTag !== tag)
                      .join(", "),
                  )
                }
                style={[
                  styles.draftTag,
                  theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text
                  style={[
                    styles.draftTagText,
                    theme && { color: theme.primary },
                  ]}
                >
                  # {tag} ×
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {recipes.some((recipe) => recipe.ingredients.length > 0) && (
          <View style={[styles.cookingImportCallout, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <View style={styles.cookingImportCopy}>
              <Text style={[styles.cookingImportTitle, theme && { color: theme.text }]}>요리 재료에서 가져오기</Text>
              <Text style={[styles.cookingImportText, theme && { color: theme.muted }]}>직접 입력하지 않고 등록된 재료를 선택할 수 있어요.</Text>
            </View>
            <Pressable
              onPress={() => {
                setAdding(false);
                setCookingPicker(true);
              }}
              style={[styles.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
            >
              <Text style={[styles.aiRecipeButtonText, theme && { color: theme.primary }]}>재료 선택</Text>
            </Pressable>
          </View>
        )}
      </DetailSheet>
      <DetailSheet
        visible={cookingPicker}
        title="요리 재료 불러오기"
        subtitle="준비물에 추가할 재료를 선택하세요"
        submit={
          selectedCookingItems.length
            ? `${selectedCookingItems.length}개 준비물에 추가`
            : "재료를 선택해 주세요"
        }
        onClose={() => {
          setCookingPicker(false);
          setSelectedCookingItems([]);
        }}
        onSubmit={importCookingItems}
      >
        {recipes.map((recipe) => (
          <View
            key={recipe.id}
            style={[
              styles.cookingImportGroup,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.cookingImportGroupHead}>
              <Text
                style={[
                  styles.cookingImportGroupTitle,
                  theme && { color: theme.text },
                ]}
              >
                {recipe.name}
              </Text>
              <Text
                style={[
                  styles.cookingImportGroupCount,
                  theme && { color: theme.muted },
                ]}
              >
                {recipe.ingredients.length}개
              </Text>
            </View>
            {recipe.ingredients.map((ingredient) => {
              const selected = selectedCookingItems.includes(ingredient.id);
              const alreadyAdded = items.some(
                (item) => item.name === ingredient.name,
              );
              return (
                <Pressable
                  key={ingredient.id}
                  disabled={alreadyAdded}
                  onPress={() => toggleCookingItem(ingredient.id)}
                  style={[
                    styles.cookingImportRow,
                    theme && { borderTopColor: theme.border },
                    selected &&
                      theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <View
                    style={[
                      styles.cookingImportCheck,
                      theme && {
                        borderColor: selected ? theme.primary : theme.border,
                      },
                      selected &&
                        theme && { backgroundColor: theme.primary },
                    ]}
                  >
                    {selected && (
                      <Text style={styles.cookingImportCheckText}>✓</Text>
                    )}
                  </View>
                  <View style={styles.cookingImportItemCopy}>
                    <Text
                      style={[
                        styles.cookingImportItemName,
                        theme && {
                          color: alreadyAdded ? theme.muted : theme.text,
                        },
                      ]}
                    >
                      {ingredient.name}
                    </Text>
                    <Text
                      style={[
                        styles.cookingImportItemMeta,
                        theme && { color: theme.muted },
                      ]}
                    >
                      {ingredient.quantity} · {ingredient.owner}
                      {alreadyAdded ? " · 이미 추가됨" : ""}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="준비 목록 붙여넣기"
        subtitle="메모에서 여러 줄을 고쳐 한 번에 반영하세요"
        submit={
          importText.trim() ? `${importMode}하기` : "목록을 입력해 주세요"
        }
        onClose={() => setImporting(false)}
        onSubmit={importPacking}
      >
        <OptionField
          label="반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
        <DetailField
          label="준비물 | 수량 | 담당 | #태그"
          value={importText}
          onChangeText={setImportText}
          multiline
          placeholder="준비물마다 한 줄씩 붙여넣으세요"
        />
        <Text style={styles.settingHint}>
          담당: 하늘·여울·공용·미정 / 태그는 #으로 여러 개 적을 수 있어요
        </Text>
      </DetailSheet>
    </View>
  );
}

type CookingItem = {
  id: string;
  name: string;
  quantity: string;
  group: string;
  owner: string;
};
type Recipe = {
  id: string;
  name: string;
  note: string;
  url?: string;
  ingredients: CookingItem[];
};

const initialRecipes: Recipe[] = [
    {
      id: "mille",
      name: "밀푀유나베",
      note: "첫날 저녁 · 숙소에서",
      url: "https://www.youtube.com/results?search_query=밀푀유나베+레시피",
      ingredients: [
        {
          id: "c1",
          name: "배추",
          quantity: "1/4통",
          group: "기본",
          owner: "구매",
        },
        {
          id: "c2",
          name: "깻잎",
          quantity: "20장",
          group: "기본",
          owner: "여울",
        },
        {
          id: "c3",
          name: "소고기",
          quantity: "250g",
          group: "기본",
          owner: "구매",
        },
        {
          id: "c4",
          name: "코인육수",
          quantity: "2개",
          group: "육수",
          owner: "여울",
        },
        {
          id: "c5",
          name: "양파",
          quantity: "1/2개",
          group: "소스",
          owner: "하늘",
        },
        {
          id: "c6",
          name: "고추냉이",
          quantity: "조금",
          group: "소스",
          owner: "미정",
        },
      ],
    },
    {
      id: "clam",
      name: "바지락 술찜",
      note: "둘째 날 저녁 · 간단한 안주",
      url: "https://www.youtube.com/results?search_query=바지락+술찜+레시피",
      ingredients: [
        {
          id: "clam-1",
          name: "바지락",
          quantity: "500g",
          group: "기본",
          owner: "구매",
        },
        {
          id: "clam-2",
          name: "마늘",
          quantity: "6알",
          group: "기본",
          owner: "하늘",
        },
        {
          id: "clam-3",
          name: "버터",
          quantity: "20g",
          group: "소스",
          owner: "여울",
        },
        {
          id: "clam-4",
          name: "화이트와인",
          quantity: "100ml",
          group: "소스",
          owner: "구매",
        },
        {
          id: "clam-5",
          name: "페페론치노",
          quantity: "3개",
          group: "양념",
          owner: "하늘",
        },
      ],
    },
    {
      id: "toast",
      name: "프렌치토스트",
      note: "마지막 날 아침 · 체크아웃 전에",
      url: "https://www.youtube.com/results?search_query=프렌치토스트+레시피",
      ingredients: [
        {
          id: "toast-1",
          name: "식빵",
          quantity: "4장",
          group: "기본",
          owner: "구매",
        },
        {
          id: "toast-2",
          name: "달걀",
          quantity: "2개",
          group: "반죽",
          owner: "구매",
        },
        {
          id: "toast-3",
          name: "우유",
          quantity: "150ml",
          group: "반죽",
          owner: "여울",
        },
        {
          id: "toast-4",
          name: "메이플 시럽",
          quantity: "1병",
          group: "토핑",
          owner: "하늘",
        },
        {
          id: "toast-5",
          name: "딸기",
          quantity: "1팩",
          group: "토핑",
          owner: "구매",
        },
      ],
    },
];

function Cooking({
  recipes,
  setRecipes,
}: {
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
}) {
  const theme = useContext(DetailThemeContext);
  const [activeId, setActiveId] = useState("mille");
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<CookingItem | null>(null);
  const [editingRecipe, setEditingRecipe] = useState(false);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [showMyIngredients, setShowMyIngredients] = useState(false);
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"교체" | "추가">("교체");
  const [importText, setImportText] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [group, setGroup] = useState("기본");
  const [owner, setOwner] = useState("미정");
  const [recipeName, setRecipeName] = useState("");
  const [recipeNote, setRecipeNote] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [readyIngredientIds, setReadyIngredientIds] = useState<string[]>([]);
  const [collapsedCookingGroups, setCollapsedCookingGroups] = useState<string[]>([]);
  const activeRecipe =
    recipes.find((recipe) => recipe.id === activeId) || recipes[0];
  const ingredients = activeRecipe?.ingredients || [];
  const readyIngredientCount = ingredients.filter((item) =>
    readyIngredientIds.includes(item.id),
  ).length;
  const ingredientProgress = ingredients.length
    ? Math.round((readyIngredientCount / ingredients.length) * 100)
    : 0;
  const groups = Array.from(new Set(ingredients.map((item) => item.group)));
  const myCookingIngredients = recipes.flatMap((recipe) =>
    recipe.ingredients
      .filter((item) => item.owner === "하늘")
      .map((item) => ({ ...item, recipeId: recipe.id, recipe: recipe.name })),
  );
  const cookingPrompt = `아래 메모를 Daymo 요리 목록 형식으로 변환하라.
규칙:
1. 설명, 인사, 번호, 마크다운을 절대 쓰지 않는다.
2. 각 요리의 첫 줄은 반드시: 요리 | 이름 | 메모 | 참고 링크
3. 이어지는 재료는 반드시: 재료 | 이름 | 수량 | 분류 | 준비
4. 준비 값은 하늘, 여울, 구매, 미정 중 하나만 쓴다.
5. 참고 링크는 메모에 URL이 있을 때만 쓰고, 없으면 비워둔다.
6. 모르는 값은 미정으로 쓰고, 구분자는 반드시 | 만 사용한다.
7. 결과만 출력한다.

[내 메모]
여기에 만들 요리와 재료 메모를 붙여넣으세요.`;
  const addIngredient = () => {
    if (!name.trim() || !activeRecipe) return;
    const next = {
      id: `${Date.now()}`,
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
    setOwner("미정");
    setEditingIngredient(null);
    setAddingIngredient(false);
  };
  const openIngredientEdit = (item: CookingItem) => {
    setEditingIngredient(item);
    setName(item.name);
    setQuantity(item.quantity);
    setGroup(item.group);
    setOwner(item.owner);
    setAddingIngredient(true);
  };
  const closeIngredientSheet = () => {
    setAddingIngredient(false);
    setEditingIngredient(null);
    setName("");
    setQuantity("");
    setGroup("기본");
    setOwner("미정");
  };
  const addRecipe = () => {
    if (!recipeName.trim()) return;
    if (editingRecipe && activeRecipe) {
      setRecipes((current) =>
        current.map((recipe) =>
          recipe.id === activeRecipe.id
            ? {
                ...recipe,
                name: recipeName.trim(),
                note: recipeNote.trim() || "메모 없음",
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
      return;
    }
    const id = `recipe-${Date.now()}`;
    setRecipes((current) => [
      ...current,
      {
        id,
        name: recipeName.trim(),
        note: recipeNote.trim() || "언제 먹을지 정해보세요",
        url: recipeUrl.trim(),
        ingredients: [],
      },
    ]);
    setActiveId(id);
    setRecipeName("");
    setRecipeNote("");
    setRecipeUrl("");
    setAddingRecipe(false);
  };
  const openRecipeEdit = () => {
    if (!activeRecipe) return;
    setRecipeName(activeRecipe.name);
    setRecipeNote(activeRecipe.note);
    setRecipeUrl(activeRecipe.url || "");
    setEditingRecipe(true);
    setAddingRecipe(true);
  };
  const closeRecipeSheet = () => {
    setAddingRecipe(false);
    setEditingRecipe(false);
    setRecipeName("");
    setRecipeNote("");
    setRecipeUrl("");
  };
  const copyCookingPrompt = async () => {
    await Clipboard.setStringAsync(cookingPrompt);
    Alert.alert(
      "GPT용 프롬프트를 복사했어요",
      "GPT에 붙여넣고 메모를 추가한 뒤, 결과를 Daymo에 붙여넣으세요.",
    );
  };
  const pasteAiResult = async () => {
    setAiResult(await Clipboard.getStringAsync());
  };
  const importAiRecipes = () => {
    const stamp = Date.now();
    const parsed: Recipe[] = [];
    let currentRecipe: Recipe | null = null;
    aiResult
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line, index) => {
        const [type, ...values] = line
          .split("|")
          .map((value) => value.trim());
        if (type === "요리" && values[0]) {
          currentRecipe = {
            id: `ai-recipe-${stamp}-${index}`,
            name: values[0],
            note: values[1] || "메모 없음",
            url: values[2] || "",
            ingredients: [],
          };
          parsed.push(currentRecipe);
          return;
        }
        if (type === "재료" && values[0] && currentRecipe) {
          currentRecipe.ingredients.push({
            id: `ai-ingredient-${stamp}-${index}`,
            name: values[0],
            quantity: values[1] || "미정",
            group: values[2] || "기본",
            owner: ["하늘", "여울", "구매", "미정"].includes(values[3])
              ? values[3]
              : "미정",
          });
        }
      });
    if (!parsed.length) return;
    setRecipes((current) => [...current, ...parsed]);
    setActiveId(parsed[0].id);
    setAiResult("");
    setAiImporting(false);
  };
  const deleteRecipe = () => {
    if (!activeRecipe) return;
    Alert.alert(
      "요리를 삭제할까요?",
      `${activeRecipe.name}과 재료 목록이 함께 삭제돼요.`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => {
            const remaining = recipes.filter(
              (recipe) => recipe.id !== activeRecipe.id,
            );
            setRecipes(remaining);
            setActiveId(remaining[0]?.id || "");
          },
        },
      ],
    );
  };
  const openRecipeActions = () => {
    if (!activeRecipe) return;
    Alert.alert(activeRecipe.name, "요리 정보를 관리하세요.", [
      { text: "요리 수정", onPress: openRecipeEdit },
      { text: "요리 삭제", style: "destructive", onPress: deleteRecipe },
      { text: "취소", style: "cancel" },
    ]);
  };
  const openRecipeLink = () => {
    if (!activeRecipe?.url) return;
    const target = /^https?:\/\//i.test(activeRecipe.url)
      ? activeRecipe.url
      : `https://${activeRecipe.url}`;
    Linking.openURL(encodeURI(target));
  };
  const removeIngredient = (item: CookingItem) =>
    Alert.alert("재료를 삭제할까요?", item.name, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () =>
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
          ),
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
    Alert.alert(
      "요리 목록을 복사했어요",
      "메모에서 자유롭게 수정할 수 있어요.",
    );
  };
  const openImport = async () => {
    setImportText(await Clipboard.getStringAsync());
    setImporting(true);
  };
  const importCooking = () => {
    const stamp = Date.now();
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [
          itemName,
          itemQuantity = "",
          itemGroup = "기본",
          itemOwner = "미정",
        ] = line.split("|").map((value) => value.trim());
        return {
          id: `${stamp}-${index}`,
          name: itemName,
          quantity: itemQuantity,
          group: itemGroup,
          owner: itemOwner,
        };
      })
      .filter((item) => item.name);
    if (!parsed.length) return;
    setRecipes((current) =>
      current.map((recipe) =>
        recipe.id === activeId
          ? {
              ...recipe,
              ingredients:
                importMode === "교체"
                  ? parsed
                  : [...recipe.ingredients, ...parsed],
            }
          : recipe,
      ),
    );
    setImporting(false);
  };
  return (
    <View>
      <TabActionHeader
        label="요리 메뉴"
        count={`${recipes.length}개`}
        action="요리 추가"
        onPress={() => setAddingRecipe(true)}
      />
      {recipes.length > 0 && (
        <View style={styles.recipeSelector}>
          <View style={styles.recipeSelectorHead}>
            <Text style={[styles.recipeSelectorTitle, theme && { color: theme.muted }]}>메뉴를 선택하세요</Text>
            <View style={styles.recipeSelectorActions}>
              {recipes.length > 4 ? (
                <Pressable onPress={() => setShowAllRecipes(true)}>
                  <Text style={[styles.recipeSelectorMore, theme && { color: theme.primary }]}>전체 {recipes.length}개 ›</Text>
                </Pressable>
              ) : (
                <Text style={[styles.recipeSelectorCount, theme && { color: theme.muted }]}>{recipes.length}개</Text>
              )}
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cookV2MenuList}
          >
            {recipes.map((recipe, index) => {
              const selected = recipe.id === activeId;
              return (
                <Pressable
                  key={recipe.id}
                  onPress={() => setActiveId(recipe.id)}
                  style={[
                    styles.cookV2MenuCard,
                    theme && {
                      backgroundColor: selected ? theme.primarySoft : theme.surface,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <View style={styles.cookV2MenuTop}>
                    <Text style={[styles.cookV2MenuNumber, theme && { color: selected ? theme.primary : theme.muted }]}>MENU {String(index + 1).padStart(2, "0")}</Text>
                    <Text style={[styles.cookV2MenuCount, theme && { color: selected ? theme.primary : theme.muted }]}>{recipe.ingredients.length}개</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.cookV2MenuName, theme && { color: theme.text }]}>{recipe.name}</Text>
                  <Text numberOfLines={1} style={[styles.cookV2MenuNote, theme && { color: theme.muted }]}>{recipe.note}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
      {myCookingIngredients.length > 0 && (
        <View
          style={[
            styles.myCookingBox,
            theme && {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Pressable onPress={() => setShowMyIngredients(true)} style={styles.myCookingCompact}>
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
              <Text style={[styles.cookV2MyEyebrow, theme && { color: theme.primary }]}>나의 장보기</Text>
              <Text style={[styles.myCookingTitle, theme && { color: theme.text }]}>준비할 재료 {myCookingIngredients.length}개</Text>
              <Text numberOfLines={1} style={[styles.myCookingSummary, theme && { color: theme.muted }]}>{myCookingIngredients.slice(0, 3).map((item) => item.name).join(" · ")}{myCookingIngredients.length > 3 ? ` 외 ${myCookingIngredients.length - 3}개` : ""}</Text>
            </View>
            <Text style={[styles.recipeListArrow, theme && { color: theme.primary }]}>›</Text>
          </Pressable>
        </View>
      )}
      {!activeRecipe ? (
        <View
          style={[
            styles.emptyCooking,
            theme && {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text
            style={[styles.emptyCookingTitle, theme && { color: theme.text }]}
          >
            만들 요리를 추가해 보세요.
          </Text>
          <Text
            style={[styles.emptyCookingText, theme && { color: theme.muted }]}
          >
            요리별로 재료와 담당을 나눌 수 있어요.
          </Text>
        </View>
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
              <Text style={[styles.cookingEyebrow, theme && { color: theme.primary }]}>이번 여행의 한 끼</Text>
              <Text
                style={[styles.cookingTitle, theme && { color: theme.text }]}
              >
                {activeRecipe.name}
              </Text>
              <Text
                style={[styles.cookingNote, theme && { color: theme.muted }]}
              >
                {activeRecipe.note}
              </Text>
              {activeRecipe.url ? (
                <Pressable
                  onPress={openRecipeLink}
                  style={styles.recipeLink}
                >
                  <Text style={[styles.recipeLinkIcon, theme && { color: theme.primary }]}>▶</Text>
                  <Text style={[styles.recipeLinkText, theme && { color: theme.primary }]}>레시피 영상 보기</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.cookingHeroActions}>
              <Pressable
                onPress={openRecipeActions}
                accessibilityLabel="요리 관리"
                style={[
                  styles.cookingMoreButton,
                  theme && { backgroundColor: theme.surface },
                ]}
              >
                <Text style={[styles.cookingMoreText, theme && { color: theme.muted }]}>···</Text>
              </Pressable>
              <View style={[styles.cookV2ProgressBadge, theme && { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.cookV2ProgressBadgeValue, theme && { color: theme.primary }]}>{ingredientProgress}%</Text>
                <Text style={[styles.cookV2ProgressBadgeLabel, theme && { color: theme.muted }]}>재료 준비</Text>
              </View>
            </View>
          </View>
          <View style={styles.cookingToolbar}>
            <Text style={[styles.cookingTip, theme && { color: theme.muted }]}>
              이 요리에 필요한 재료예요.
            </Text>
            <Pressable
              onPress={() => setAddingIngredient(true)}
              style={styles.placeAdd}
            >
              <Text style={styles.placeAddText}>+ 재료</Text>
            </Pressable>
          </View>
          {groups.map((section, groupIndex) => {
            const sectionItems = ingredients.filter((item) => item.group === section);
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
                    <Text style={[styles.cookV2SectionLabelText, { color: groupAccent }]}>COOK {String(groupIndex + 1).padStart(2, "0")}</Text>
                  </View>
                  <Text style={[styles.cookingSectionTitle, styles.cookV2SectionTitle, theme && { color: theme.text }]}>{section}</Text>
                </View>
                <View style={styles.cookV2SectionActions}>
                  <Text style={[styles.cookV2SectionCount, theme && { color: theme.muted }]}>{sectionItems.length}개</Text>
                  <Text style={[styles.cookV2SectionToggle, theme && { color: theme.muted }]}>{collapsed ? "＋" : "−"}</Text>
                </View>
              </Pressable>
              {!collapsed && sectionItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openIngredientEdit(item)}
                    onLongPress={() => removeIngredient(item)}
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
                      style={[
                        styles.cookV2IngredientCheck,
                        theme && {
                          borderColor: readyIngredientIds.includes(item.id) ? theme.primary : theme.border,
                          backgroundColor: readyIngredientIds.includes(item.id) ? theme.primary : theme.surface,
                        },
                      ]}
                    >
                      {readyIngredientIds.includes(item.id) && (
                        <Text style={styles.cookV2IngredientTick}>✓</Text>
                      )}
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
                    <Text style={styles.ingredientQuantity}>
                      {item.quantity}
                    </Text>
                  </Pressable>
                ))}
            </View>
            );
          })}
          <Text style={styles.longPressHint}>
            왼쪽 원은 준비 체크 · 재료를 누르면 수정할 수 있어요.
          </Text>
          <View
            style={[
              styles.packingListTools,
              theme && { borderTopColor: theme.border },
            ]}
          >
            <View style={styles.packingListToolsCopy}>
              <Text
                style={[
                  styles.packingListToolsTitle,
                  theme && { color: theme.text },
                ]}
              >
                목록 한꺼번에 수정
              </Text>
              <Text
                style={[
                  styles.packingListToolsHint,
                  theme && { color: theme.muted },
                ]}
              >
                복사해 수정한 뒤 다시 붙여넣을 수 있어요
              </Text>
            </View>
            <Pressable
              onPress={copyCooking}
              style={[
                styles.packingToolButton,
                theme && { borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  styles.packingToolButtonText,
                  theme && { color: theme.text },
                ]}
              >
                복사
              </Text>
            </Pressable>
            <Pressable
              onPress={openImport}
              style={[
                styles.packingToolButton,
                theme && { borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  styles.packingToolButtonText,
                  theme && { color: theme.text },
                ]}
              >
                붙여넣기
              </Text>
            </Pressable>
          </View>
        </>
      )}
      <DetailSheet
        visible={showAllRecipes}
        title="전체 요리 메뉴"
        subtitle={`${recipes.length}개 요리 중 확인할 메뉴를 선택하세요`}
        submit="닫기"
        onClose={() => setShowAllRecipes(false)}
        onSubmit={() => setShowAllRecipes(false)}
      >
        <View style={[styles.recipeList, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {recipes.map((recipe, index) => (
            <Pressable
              key={recipe.id}
              onPress={() => {
                setActiveId(recipe.id);
                setShowAllRecipes(false);
              }}
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
                <Text numberOfLines={1} style={[styles.recipeListNote, theme && { color: theme.muted }]}>{recipe.note}</Text>
              </View>
              <Text style={[styles.recipeListCount, theme && { color: theme.muted }]}>{recipe.ingredients.length}개</Text>
            </Pressable>
          ))}
        </View>
      </DetailSheet>
      <DetailSheet
        visible={showMyIngredients}
        title="내가 준비할 재료"
        subtitle={`전체 요리에서 하늘이 준비할 재료 ${myCookingIngredients.length}개`}
        submit="닫기"
        onClose={() => setShowMyIngredients(false)}
        onSubmit={() => setShowMyIngredients(false)}
      >
        {recipes.map((recipe) => {
          const mine = recipe.ingredients.filter((item) => item.owner === "하늘");
          if (!mine.length) return null;
          return (
            <View key={recipe.id} style={[styles.myIngredientGroup, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Pressable
                onPress={() => {
                  setActiveId(recipe.id);
                  setShowMyIngredients(false);
                }}
                style={styles.myIngredientGroupHead}
              >
                <Text style={[styles.myIngredientGroupTitle, theme && { color: theme.text }]}>{recipe.name}</Text>
                <Text style={[styles.myIngredientGroupCount, theme && { color: theme.primary }]}>{mine.length}개 ›</Text>
              </Pressable>
              {mine.map((item) => (
                <View key={item.id} style={[styles.myIngredientRow, theme && { borderTopColor: theme.border }]}>
                  <Text style={[styles.myIngredientName, theme && { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.myIngredientQuantity, theme && { color: theme.muted }]}>{item.quantity}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </DetailSheet>
      <DetailSheet
        visible={addingIngredient}
        title={editingIngredient ? "요리 재료 수정" : "요리 재료 추가"}
        subtitle="재료 정보와 준비할 사람을 입력하세요"
        submit={name.trim() ? (editingIngredient ? "수정 저장" : "재료 추가") : "재료 이름을 입력해 주세요"}
        onClose={closeIngredientSheet}
        onSubmit={addIngredient}
      >
        <DetailField
          label="재료"
          value={name}
          onChangeText={setName}
          placeholder="예: 팽이버섯"
        />
        <DetailField
          label="수량"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="예: 1봉"
        />
        <View style={styles.tagEditor}>
          <Text
            style={[
              styles.detailFieldLabel,
              styles.selectorLabel,
              theme && { color: theme.muted },
            ]}
          >
            분류
          </Text>
          <View style={styles.tagSuggestions}>
            {["채소", "고기", "해산물", "양념", "소스", "토핑"].map(
              (category) => {
                const selected = group === category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => setGroup(category)}
                    style={[
                      styles.tagSuggestion,
                      selected && styles.tagSuggestionActive,
                      selected &&
                        theme && {
                          backgroundColor: theme.primarySoft,
                          borderColor: theme.primary,
                        },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagSuggestionText,
                        selected && styles.tagSuggestionTextActive,
                        selected && theme && { color: theme.primary },
                      ]}
                    >
                      {category}
                    </Text>
                  </Pressable>
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
              styles.tagInput,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />
        </View>
        <OptionField
          label="누가 준비하나요?"
          options={["미정", "하늘", "여울", "구매"]}
          value={owner}
          onChange={setOwner}
        />
      </DetailSheet>
      <DetailSheet
        visible={addingRecipe}
        title={editingRecipe ? "요리 수정" : "요리 추가"}
        subtitle="만들 요리의 이름과 메모를 입력하세요"
        submit={recipeName.trim() ? (editingRecipe ? "수정 저장" : "요리 만들기") : "요리 이름을 입력해 주세요"}
        onClose={closeRecipeSheet}
        onSubmit={addRecipe}
      >
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
            <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>GPT가 정리한 요리와 재료를 붙여넣을 수 있어요.</Text>
          </View>
          <Pressable
            onPress={() => {
              setAddingRecipe(false);
              setAiImporting(true);
            }}
            style={[styles.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[styles.aiRecipeButtonText, theme && { color: theme.primary }]}>한꺼번에 추가</Text>
          </Pressable>
        </View>}
        <DetailField
          label="요리 이름"
          value={recipeName}
          onChangeText={setRecipeName}
          placeholder="예: 김치볶음밥"
        />
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
          placeholder="유튜브 또는 레시피 링크를 붙여넣으세요"
        />
      </DetailSheet>
      <DetailSheet
        visible={aiImporting}
        title="GPT로 여러 요리 추가"
        subtitle="프롬프트를 복사해 GPT에 요청하고 결과를 붙여넣으세요"
        submit={aiResult.trim() ? "요리 목록 추가" : "GPT 결과를 붙여넣어 주세요"}
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
              <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>1. 형식 프롬프트 복사</Text>
              <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>요리 이름과 재료 메모를 프롬프트 아래에 적으세요.</Text>
            </View>
            <Pressable onPress={copyCookingPrompt} style={styles.aiPromptCopyButton}>
              <Text style={styles.aiPromptCopyText}>복사</Text>
            </Pressable>
          </View>
          <Text numberOfLines={4} style={[styles.aiPromptPreview, theme && { color: theme.muted }]}>{cookingPrompt}</Text>
        </View>
        <View style={styles.aiPasteRow}>
          <View>
            <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>2. GPT 결과 가져오기</Text>
            <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>복사한 결과를 입력란에 바로 넣어요.</Text>
          </View>
          <Pressable
            onPress={pasteAiResult}
            style={[styles.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[styles.aiRecipeButtonText, theme && { color: theme.primary }]}>붙여넣기</Text>
          </Pressable>
        </View>
        <DetailField
          label="붙여넣은 결과"
          value={aiResult}
          onChangeText={setAiResult}
          multiline
          placeholder={"요리 | 김치볶음밥 | 둘째 날 아침 | https://youtu.be/...\n재료 | 김치 | 1컵 | 기본 | 구매"}
        />
        <Text style={[styles.settingHint, theme && { color: theme.muted }]}>여러 요리와 각 재료가 한 번에 추가됩니다.</Text>
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="요리 목록 붙여넣기"
        subtitle="메모에서 수정한 재료를 한 번에 반영하세요"
        submit={
          importText.trim() ? `${importMode}하기` : "목록을 입력해 주세요"
        }
        onClose={() => setImporting(false)}
        onSubmit={importCooking}
      >
        <OptionField
          label="반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
        <DetailField
          label="재료 | 수량 | 분류 | 담당·구매"
          value={importText}
          onChangeText={setImportText}
          multiline
          placeholder="재료마다 한 줄씩 붙여넣으세요"
        />
      </DetailSheet>
    </View>
  );
}

function Memories() {
  const theme = useContext(DetailThemeContext);
  const [photos, setPhotos] = useState([
    "#E7B4A6",
    "#DFC98A",
    "#AFC9C3",
    "#D4BDD4",
    "#C7D493",
    "#9CBBC6",
  ]);
  const [diaryWriting, setDiaryWriting] = useState(false);
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryBody, setDiaryBody] = useState("");
  const [diaries, setDiaries] = useState([
    {
      title: "느리게 걸어서 더 좋았던 날",
      body: "계획대로 되지 않은 순간도 있었지만, 그래서 더 오래 기억할 여행이 된 것 같다.",
      date: "2026. 08. 23",
    },
  ]);
  const [makingCard, setMakingCard] = useState(false);
  const [cardStyle, setCardStyle] = useState("필름");
  const [cardTitle, setCardTitle] = useState("우리의 구로 여행");
  const [cardCaption, setCardCaption] = useState("천천히 걸어서 더 좋았던 2박 3일");
  const addPhoto = () => setPhotos((current) => ["#19B6A3", ...current]);
  const addDiary = () => {
    if (!diaryBody.trim()) return;
    setDiaries((current) => [
      {
        title: diaryTitle.trim() || "이번 여행 이야기",
        body: diaryBody.trim(),
        date: "방금",
      },
      ...current,
    ]);
    setDiaryTitle("");
    setDiaryBody("");
    setDiaryWriting(false);
  };
  return (
    <View>
      <TabActionHeader
        label="여행 기록"
        count={`사진 ${photos.length} · 일기 ${diaries.length}`}
        action="사진 추가"
        onPress={addPhoto}
      />
      <SectionLabel
        label="여행 기념 카드"
        action="꾸미기"
        onPress={() => setMakingCard(true)}
      />
      <Pressable
        onPress={() => setMakingCard(true)}
        style={[
          styles.keepsakeCard,
          theme && { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={[styles.keepsakeTape, theme && { backgroundColor: theme.secondary }]} />
        <View style={styles.keepsakePhotos}>
          {photos.slice(0, 3).map((color, index) => (
            <View
              key={`${color}-${index}`}
              style={[
                styles.keepsakePhoto,
                { backgroundColor: color },
                index === 0 && styles.keepsakePhotoMain,
                index === 1 && styles.keepsakePhotoTop,
                index === 2 && styles.keepsakePhotoBottom,
              ]}
            />
          ))}
        </View>
        <View style={styles.keepsakeCopy}>
          <Text style={[styles.keepsakeStyle, theme && { color: theme.primary }]}>{cardStyle} · 2026. 08</Text>
          <Text style={[styles.keepsakeTitle, theme && { color: theme.text }]}>{cardTitle}</Text>
          <Text numberOfLines={2} style={[styles.keepsakeCaption, theme && { color: theme.muted }]}>{cardCaption}</Text>
        </View>
        <Text style={[styles.keepsakeArrow, theme && { color: theme.primary }]}>›</Text>
      </Pressable>
      <SectionLabel
        label="여행 일기"
        action="일기 쓰기"
        onPress={() => setDiaryWriting(true)}
      />
      {diaries.map((diary, index) => (
        <View
          key={`${diary.date}-${index}`}
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
          <Text style={[styles.diaryTitle, theme && { color: theme.text }]}>{diary.title}</Text>
          <Text numberOfLines={3} style={[styles.diaryBody, theme && { color: theme.muted }]}>{diary.body}</Text>
        </View>
      ))}
      <SectionLabel label={`여행 사진 · ${photos.length}장`} />
      <View style={styles.memoryGrid}>
        {photos.map((color, index) => (
          <View
            key={`${color}-${index}`}
            style={[
              styles.memoryTile,
              theme && { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={[styles.memoryTilePhoto, { backgroundColor: color }]}>
              <View style={styles.memoryTileGlow} />
            </View>
            <View style={styles.memoryTileCaption}>
              <Text style={[styles.tileNumber, theme && { color: theme.text }]}>NO. {String(index + 1).padStart(2, "0")}</Text>
              <Text style={[styles.memoryTileDate, theme && { color: theme.muted }]}>08. {21 + (index % 3)}</Text>
            </View>
          </View>
        ))}
      </View>
      <DetailSheet
        visible={makingCard}
        title="여행 기념 카드 꾸미기"
        subtitle="사진과 문구를 골라 여행을 한 장으로 간직하세요"
        submit="카드 저장"
        onClose={() => setMakingCard(false)}
        onSubmit={() => setMakingCard(false)}
      >
        <OptionField
          label="카드 스타일"
          options={["필름", "엽서", "스크랩북"]}
          value={cardStyle}
          onChange={setCardStyle}
        />
        <View style={styles.cardMiniPreview}>
          {photos.slice(0, 3).map((color, index) => (
            <View key={`${color}-preview-${index}`} style={[styles.cardMiniPhoto, { backgroundColor: color }]} />
          ))}
        </View>
        <DetailField label="카드 제목" value={cardTitle} onChangeText={setCardTitle} />
        <DetailField label="짧은 문구" value={cardCaption} onChangeText={setCardCaption} multiline />
        <Text style={[styles.settingHint, theme && { color: theme.muted }]}>현재 여행 기록에 저장되며 언제든 다시 꾸밀 수 있어요.</Text>
      </DetailSheet>
      <DetailSheet
        visible={diaryWriting}
        title="여행 일기 쓰기"
        subtitle="그날의 기분과 오래 기억하고 싶은 이야기를 남겨보세요"
        submit={diaryBody.trim() ? "일기 저장" : "내용을 입력해 주세요"}
        onClose={() => setDiaryWriting(false)}
        onSubmit={addDiary}
      >
        <DetailField label="일기 제목 (선택)" value={diaryTitle} onChangeText={setDiaryTitle} placeholder="예: 비가 와서 더 좋았던 날" />
        <DetailField label="여행 이야기" value={diaryBody} onChangeText={setDiaryBody} placeholder="오늘 가장 기억에 남는 순간은..." multiline />
      </DetailSheet>
    </View>
  );
}

function SectionLabel({
  label,
  action,
  onPress,
}: {
  label: string;
  action?: string;
  onPress?: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.sectionLabel}>
      <Text style={[styles.sectionTitle, theme && { color: theme.text }]}>
        {label}
      </Text>
      {action && (
        <Pressable onPress={onPress} hitSlop={8}>
          <Text
            style={[styles.sectionAction, theme && { color: theme.primary }]}
          >
            {action} →
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function TabActionHeader({
  label,
  count,
  action,
  onPress,
}: {
  label: string;
  count: string;
  action: string;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.tabActionHeader}>
      <View style={styles.tabActionTitleRow}>
        <Text style={[styles.tabActionTitle, theme && { color: theme.text }]}>{label}</Text>
        <Text style={[styles.tabActionCount, theme && { color: theme.muted }]}>{count}</Text>
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action}
        style={({ pressed }) => [
          styles.tabActionButton,
          theme && { backgroundColor: theme.primary },
          pressed && styles.packingCardPressed,
        ]}
      >
        <Text style={styles.tabActionButtonText}>＋ {action}</Text>
      </Pressable>
    </View>
  );
}

function TravelInfoRow({
  label,
  mark,
  title,
  meta,
  color,
  onPress,
}: {
  label: string;
  mark: string;
  title: string;
  meta: string;
  color: string;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.travelInfoRow,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.packingCardPressed,
      ]}
    >
      <View style={[styles.travelInfoAccent, { backgroundColor: color }]} />
      <View style={[styles.travelInfoTape, { backgroundColor: `${color}55` }]} />
      <View style={[styles.travelInfoLabel, { backgroundColor: `${color}18` }]}>
        <Text style={[styles.travelInfoMark, { color }]}>{mark}</Text>
        <Text style={[styles.travelInfoLabelText, { color }]}>{label}</Text>
      </View>
      <View style={styles.travelInfoCopy}>
        <Text style={[styles.travelInfoTitle, theme && { color: theme.text }]}>{title}</Text>
        <Text style={[styles.travelInfoMeta, theme && { color: theme.muted }]}>{meta}</Text>
      </View>
      <View style={[styles.travelInfoArrowBox, { backgroundColor: `${color}18` }]}>
        <Text style={[styles.travelInfoArrow, { color }]}>›</Text>
      </View>
    </Pressable>
  );
}

function TravelMiniCard({
  label,
  mark,
  title,
  meta,
  color,
  onPress,
  large,
}: {
  label: string;
  mark: string;
  title: string;
  meta: string;
  color: string;
  onPress: () => void;
  large?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.travelMiniCard,
        large ? styles.travelMiniCardLarge : styles.travelMiniCardSmall,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        { transform: [{ rotate: large ? "-.35deg" : ".45deg" }] },
        pressed && styles.packingCardPressed,
      ]}
    >
      <View style={[styles.travelMiniTape, { backgroundColor: `${color}55` }]} />
      <View style={styles.travelMiniTop}>
        <View style={[styles.travelMiniMark, { backgroundColor: `${color}18` }]}>
          <Text style={[styles.travelMiniMarkText, { color }]}>{mark}</Text>
        </View>
        <Text style={[styles.travelMiniLabel, { color }]}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.travelMiniTitle, theme && { color: theme.text }]}>{title}</Text>
      <View style={styles.travelMiniBottom}>
        <Text numberOfLines={1} style={[styles.travelMiniMeta, theme && { color: theme.muted }]}>{meta}</Text>
        <Text style={[styles.travelMiniArrow, { color }]}>›</Text>
      </View>
    </Pressable>
  );
}

function Moment({
  time,
  title,
  note,
  mapUrl,
  last,
  compact,
}: {
  time: string;
  title: string;
  note: string;
  mapUrl?: string;
  last?: boolean;
  compact?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View
      style={[
        styles.moment,
        compact && styles.travelMomentCompact,
        theme && { borderColor: theme.border },
        last && styles.lastMoment,
      ]}
    >
      <View style={[styles.momentTime, compact && styles.travelMomentTimeCompact]}>
        <Text style={[styles.momentDay, compact && styles.travelMomentDayCompact, theme && { color: theme.primary }]}>
          {time}
        </Text>
        <View style={styles.dotLine}>
          <View
            style={[styles.dot, theme && { backgroundColor: theme.primary }]}
          />
          {!last && (
            <View
              style={[styles.line, theme && { backgroundColor: theme.border }]}
            />
          )}
        </View>
      </View>
      <View style={[styles.momentContent, compact && styles.travelMomentContentCompact]}>
        <Text style={[styles.momentTitle, theme && { color: theme.text }]}>
          {title}
        </Text>
        <Text style={[styles.momentNote, theme && { color: theme.muted }]}>
          {note}
        </Text>
        {mapUrl ? (
          <Pressable
            onPress={() => Linking.openURL(mapUrl)}
            style={[
              styles.mapLink,
              compact && styles.travelMapLinkCompact,
              theme && { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <View style={styles.mapLinkIcon}>
              <Text style={styles.mapLinkIconText}>N</Text>
            </View>
            <Text style={styles.mapLinkText}>{compact ? "N 지도" : "네이버 지도"}</Text>
            {!compact && <Text style={styles.mapLinkArrow}>↗</Text>}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function DetailField({
  label,
  multiline,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.detailField}>
      <View style={styles.fieldLabelRow}>
        <View
          style={[
            styles.fieldLabelDot,
            theme && { backgroundColor: theme.primary },
          ]}
        />
        <Text style={[styles.detailFieldLabel, theme && { color: theme.text }]}>
          {label}
        </Text>
      </View>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={theme?.muted ?? "#9AA1AE"}
        style={[
          styles.detailFieldInput,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          },
          multiline && styles.detailFieldMultiline,
        ]}
      />
    </View>
  );
}
function DetailSheet({
  visible,
  title,
  subtitle,
  submit,
  destructiveLabel,
  submitDisabled = false,
  onClose,
  onSubmit,
  onDestructive,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  submit: string;
  destructiveLabel?: string;
  submitDisabled?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onDestructive?: () => void;
  children: React.ReactNode;
}) {
  const theme = useContext(DetailThemeContext);
  const sheetKind = title.includes("일정")
    ? "일정"
    : title.includes("장소")
      ? "장소"
      : title.includes("준비") || title.includes("담당")
        ? "준비"
        : title.includes("요리") || title.includes("재료")
          ? "요리"
          : title.includes("기록") || title.includes("사진") || title.includes("일기") || title.includes("카드")
            ? "기록"
            : "Daymo";
  const sheetAccent = theme
    ? sheetKind === "장소"
      ? theme.secondary
      : sheetKind === "준비" || sheetKind === "요리"
        ? theme.accent
        : sheetKind === "기록"
          ? theme.secondary
          : theme.primary
    : "#FF6B63";
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBack}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View
          style={[styles.sheet, theme && { backgroundColor: theme.background }]}
        >
          <View style={styles.sheetHandle} />
          <View
            style={[
              styles.sheetHead,
              styles.sheetHeadDecorated,
              { backgroundColor: `${sheetAccent}0D`, borderColor: `${sheetAccent}45` },
            ]}
          >
            <View style={[styles.sheetHeadTape, { backgroundColor: `${sheetAccent}66` }]} />
            <View style={styles.sheetHeadMain}>
              <View
                style={[
                  styles.sheetMark,
                  { backgroundColor: `${sheetAccent}18` },
                ]}
              >
                <Text
                  style={[
                    styles.sheetMarkText,
                    { color: sheetAccent },
                  ]}
                >
                  {sheetKind}
                </Text>
              </View>
              <View style={styles.sheetHeadCopy}>
                <Text
                  style={[styles.sheetTitle, theme && { color: theme.text }]}
                >
                  {title}
                </Text>
                {subtitle && (
                  <Text
                    style={[
                      styles.sheetSubtitle,
                      theme && { color: theme.muted },
                    ]}
                  >
                    {subtitle}
                  </Text>
                )}
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={[
                styles.sheetCloseButton,
                theme && { backgroundColor: theme.surfaceAlt },
              ]}
            >
              <Text
                style={[styles.sheetClose, theme && { color: theme.primary }]}
              >
                ×
              </Text>
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.sheetFormBody, { borderLeftColor: `${sheetAccent}55` }]}>
              {children}
            </View>
          </ScrollView>
          <Pressable
            onPress={onSubmit}
            disabled={submitDisabled}
            style={[
              styles.sheetSubmit,
              theme && { backgroundColor: theme.primary },
              submitDisabled && styles.sheetSubmitDisabled,
            ]}
          >
            <Text style={styles.sheetSubmitText}>{submit}</Text>
            <View style={styles.sheetSubmitArrow}>
              <Text style={styles.sheetSubmitArrowText}>→</Text>
            </View>
          </Pressable>
          {destructiveLabel && (
            <Pressable onPress={onDestructive} style={styles.deletePlace}>
              <Text style={styles.deletePlaceText}>{destructiveLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
function InfoPanel({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBack}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View
          style={[styles.sheet, theme && { backgroundColor: theme.background }]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, theme && { color: theme.text }]}>
              {title}
            </Text>
            <Pressable onPress={onClose}>
              <Text
                style={[styles.sheetClose, theme && { color: theme.primary }]}
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
function InfoLine({ label, value }: { label: string; value: string }) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={[styles.infoLine, theme && { borderColor: theme.border }]}>
      <Text style={[styles.infoLineLabel, theme && { color: theme.muted }]}>
        {label}
      </Text>
      <Text style={[styles.infoLineValue, theme && { color: theme.text }]}>
        {value}
      </Text>
    </View>
  );
}
function OptionField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.optionField}>
      <View style={styles.fieldLabelRow}>
        <View
          style={[
            styles.fieldLabelDot,
            theme && { backgroundColor: theme.primary },
          ]}
        />
        <Text style={[styles.detailFieldLabel, theme && { color: theme.text }]}>
          {label}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionRow}
      >
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[
              styles.optionChip,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              value === option && styles.optionChipActive,
              value === option &&
                theme && {
                  backgroundColor: theme.primarySoft,
                  borderColor: theme.primary,
                },
            ]}
          >
            <Text
              style={[
                styles.optionText,
                theme && { color: theme.muted },
                value === option && styles.optionTextActive,
                value === option && theme && { color: theme.primary },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF9F4" },
  header: {
    height: 55,
    paddingHorizontal: 21,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  close: { color: "#5D3531", fontSize: 35, lineHeight: 35, fontWeight: "300" },
  headerName: {
    color: "#5D3531",
    fontSize: 15,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  headerMore: { color: "#5D3531", fontSize: 16, letterSpacing: 2 },
  page: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 48 },
  date: { color: "#B76A59", fontSize: 11, letterSpacing: 1, fontWeight: "900" },
  detailTitleRow: {
    position: "relative",
  },
  detailTripTitle: { maxWidth: "68%" },
  tripMemoButton: {
    width: 102,
    height: 72,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#E6D38C",
    backgroundColor: "#FFF3B8",
    paddingHorizontal: 10,
    paddingTop: 13,
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
    color: "#A17F32",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  tripMemoPreview: {
    color: "#5F4B23",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 2,
  },
  tripMemoBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(154, 121, 48, .2)",
    paddingTop: 5,
  },
  tripMemoButtonText: {
    color: "#806727",
    fontSize: 7,
    fontWeight: "800",
  },
  tripMemoArrow: {
    color: "#9A7930",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 14,
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
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
    marginBottom: 18,
  },
  tripMemoRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EEEAE5" },
  tripMemoAuthor: { color: "#B76A59", fontSize: 8, fontWeight: "900" },
  tripMemoBody: { color: "#35333A", fontSize: 11, lineHeight: 16, marginTop: 5 },
  title: {
    color: "#522F2D",
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: -2,
    fontWeight: "800",
    marginTop: 8,
  },
  subtitle: { color: "#987C72", fontSize: 13, marginTop: 7 },
  modeSwitch: {
    backgroundColor: "#F5E9DF",
    borderRadius: 18,
    padding: 4,
    flexDirection: "row",
    marginTop: 27,
    marginBottom: 24,
  },
  mode: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  modeCurrent: {
    backgroundColor: "#FFF9F4",
    shadowColor: "#A97865",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  modeText: { color: "#A2867A", fontSize: 13, fontWeight: "800" },
  modeTextCurrent: { color: "#603632" },
  welcomeCard: {
    backgroundColor: "#EBA18E",
    minHeight: 190,
    borderRadius: 27,
    padding: 22,
    overflow: "hidden",
    marginBottom: 31,
  },
  welcomeMark: {
    position: "absolute",
    right: -3,
    top: 0,
    width: 142,
    height: 142,
  },
  markCircle: {
    width: 122,
    height: 122,
    borderRadius: 61,
    borderWidth: 20,
    borderColor: "#F8D7C9",
    position: "absolute",
    right: -22,
    top: -30,
  },
  markLeaf: {
    backgroundColor: "#92574E",
    width: 72,
    height: 18,
    borderRadius: 20,
    transform: [{ rotate: "-42deg" }],
    position: "absolute",
    right: 9,
    top: 83,
  },
  welcomeEyebrow: {
    color: "#754139",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  welcomeTitle: {
    color: "#4F2C2A",
    fontSize: 29,
    lineHeight: 34,
    letterSpacing: -1.4,
    fontWeight: "800",
    marginTop: 25,
  },
  welcomeCopy: {
    color: "#75463E",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 11,
    maxWidth: 245,
  },
  sectionLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 2,
  },
  sectionTitle: {
    color: "#633B36",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  sectionAction: { color: "#B76A59", fontSize: 11, fontWeight: "800" },
  timelineCard: {
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 17,
    marginBottom: 30,
    shadowColor: "#A97865",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  travelTimelineCard: { padding: 12, marginBottom: 15, position: "relative" },
  travelTimelineTape: {
    position: "absolute",
    top: -5,
    left: 28,
    width: 42,
    height: 10,
    borderRadius: 2,
    opacity: 0.22,
    transform: [{ rotate: "-2deg" }],
  },
  travelMomentCompact: { minHeight: 57 },
  travelMomentTimeCompact: { width: 72 },
  travelMomentDayCompact: { width: 49, fontSize: 9 },
  travelMomentContentCompact: { paddingLeft: 4 },
  travelMapLinkCompact: { height: 23, marginTop: 5, paddingHorizontal: 6 },
  travelInfoList: {
    gap: 8,
    marginBottom: 10,
  },
  travelInfoPair: { flexDirection: "row", alignItems: "stretch", gap: 9 },
  travelMiniCard: {
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    position: "relative",
    overflow: "hidden",
  },
  travelMiniCardLarge: { flex: 1.18 },
  travelMiniCardSmall: { flex: 0.82 },
  travelMiniTape: {
    position: "absolute",
    top: -2,
    left: "38%",
    width: 27,
    height: 8,
    borderRadius: 2,
    transform: [{ rotate: "-4deg" }],
  },
  travelMiniTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  travelMiniMark: {
    minWidth: 27,
    height: 24,
    borderRadius: 7,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  travelMiniMarkText: { fontSize: 8, fontWeight: "900" },
  travelMiniLabel: { fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  travelMiniTitle: { fontSize: 13, fontWeight: "900", marginTop: 10 },
  travelMiniBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  travelMiniMeta: { flex: 1, fontSize: 8, fontWeight: "700" },
  travelMiniArrow: { fontSize: 16, lineHeight: 17, fontWeight: "800", marginLeft: 4 },
  travelInfoRow: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  travelInfoAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  travelInfoTape: {
    position: "absolute",
    top: -2,
    left: 22,
    width: 24,
    height: 7,
    borderRadius: 2,
    transform: [{ rotate: "-4deg" }],
  },
  travelInfoLabel: {
    width: 48,
    height: 45,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    transform: [{ rotate: "-2deg" }],
  },
  travelInfoMark: { fontSize: 12, lineHeight: 15, fontWeight: "900" },
  travelInfoLabelText: { fontSize: 7, fontWeight: "900", marginTop: 1 },
  travelInfoCopy: { flex: 1, minWidth: 0 },
  travelInfoTitle: { fontSize: 12, fontWeight: "900" },
  travelInfoMeta: { fontSize: 8, fontWeight: "700", marginTop: 3 },
  travelInfoArrowBox: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  travelInfoArrow: { fontSize: 17, lineHeight: 18, fontWeight: "800" },
  moment: { flexDirection: "row", minHeight: 67 },
  lastMoment: { minHeight: 46 },
  momentTime: { width: 82, flexDirection: "row" },
  momentDay: {
    color: "#B1776B",
    fontSize: 10,
    fontWeight: "900",
    width: 57,
    paddingTop: 2,
  },
  dotLine: { alignItems: "center", width: 15 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E79783",
    marginTop: 3,
  },
  line: { flex: 1, width: 1, backgroundColor: "#F0DCD2", marginTop: 5 },
  momentContent: { flex: 1, paddingLeft: 7 },
  momentTitle: { color: "#5A3531", fontSize: 14, fontWeight: "800" },
  momentNote: { color: "#A18980", fontSize: 11, marginTop: 5 },
  placeCard: {
    minHeight: 91,
    borderRadius: 21,
    backgroundColor: "#F6D6C8",
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 11,
  },
  placeStamp: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#FFF9F4",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  stampText: {
    color: "#AD6152",
    fontSize: 22,
    lineHeight: 21,
    letterSpacing: -1,
    fontWeight: "900",
  },
  stampSmall: {
    color: "#B9877A",
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: "900",
    marginTop: 3,
  },
  placeInfo: { flex: 1 },
  placeKicker: {
    color: "#AC695D",
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  placeName: {
    color: "#5B3834",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 4,
  },
  placeNote: { color: "#9E776C", fontSize: 11, marginTop: 3 },
  cardArrow: { color: "#8B5147", fontSize: 21 },
  twoCards: { flexDirection: "row", marginBottom: 22 },
  smallCard: { flex: 1, minHeight: 108, borderRadius: 20, padding: 16 },
  stayCard: { backgroundColor: "#E8E1B1", marginRight: 10 },
  menuCard: { backgroundColor: "#D8C1D1" },
  smallOverline: {
    color: "#806E55",
    fontSize: 9,
    letterSpacing: 0.9,
    fontWeight: "900",
  },
  smallTitle: {
    color: "#5A423B",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 19,
  },
  smallText: { color: "#85746A", fontSize: 10, marginTop: 4 },
  readyNudge: {
    backgroundColor: "#6C403B",
    borderRadius: 21,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  readyEyebrow: {
    color: "#F2BAA5",
    fontSize: 9,
    letterSpacing: 0.9,
    fontWeight: "900",
  },
  readyText: {
    color: "#FFF8F3",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 5,
  },
  prepareIntro: {
    backgroundColor: "#F3D7C8",
    borderRadius: 26,
    padding: 21,
    marginBottom: 28,
  },
  prepareEyebrow: {
    color: "#A76255",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  prepareTitle: {
    color: "#5E3934",
    fontSize: 27,
    lineHeight: 32,
    letterSpacing: -1.3,
    fontWeight: "800",
    marginTop: 17,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 24,
  },
  progressText: { color: "#956F65", fontSize: 11, fontWeight: "700" },
  progressNumber: {
    color: "#A45B4E",
    fontSize: 25,
    letterSpacing: -1,
    fontWeight: "800",
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#E7B9AA",
    borderRadius: 5,
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: { height: "100%", backgroundColor: "#A95D4F", borderRadius: 5 },
  checklist: {
    backgroundColor: "#FFF",
    borderRadius: 21,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  checkRow: {
    minHeight: 64,
    borderBottomWidth: 1,
    borderColor: "#F1E5DE",
    flexDirection: "row",
    alignItems: "center",
  },
  lastCheck: { borderBottomWidth: 0 },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#D7B5AA",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },
  checkboxDone: { backgroundColor: "#E48D78", borderColor: "#E48D78" },
  checkboxDot: { width: 5, height: 5, borderRadius: 3, opacity: 0.72 },
  checkIcon: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  checkInfo: { flex: 1 },
  checkName: { color: "#593934", fontSize: 14, fontWeight: "800" },
  checkNameDone: { color: "#B29B92", textDecorationLine: "line-through" },
  checkNote: { color: "#A69087", fontSize: 10, marginTop: 3 },
  personCircle: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: "#F7EAE3",
    alignItems: "center",
    justifyContent: "center",
  },
  personText: { color: "#9B6257", fontSize: 10, fontWeight: "900" },
  tinyNote: { backgroundColor: "#FFF3E8", borderRadius: 16, padding: 15 },
  tinyLabel: { color: "#AE6C5F", fontSize: 10, fontWeight: "900" },
  tinyText: { color: "#7B5B52", fontSize: 12, lineHeight: 18, marginTop: 5 },
  memoryWelcome: {
    borderRadius: 26,
    backgroundColor: "#C4D6C5",
    padding: 21,
    minHeight: 211,
    marginBottom: 30,
  },
  memoryEyebrow: {
    color: "#5D7E6C",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  memoryTitle: {
    color: "#3F5D4E",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -1.3,
    fontWeight: "800",
    marginTop: 22,
  },
  memoryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#4D705E",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 13,
    marginTop: 19,
  },
  memoryButtonText: { color: "#F7F3E9", fontSize: 11, fontWeight: "800" },
  noteCard: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 17,
    marginBottom: 10,
  },
  noteAuthor: { color: "#B06C5E", fontSize: 10, fontWeight: "900" },
  noteBody: { color: "#67443D", fontSize: 14, lineHeight: 20, marginTop: 8 },
  keepsakeCard: {
    minHeight: 142,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8E2DA",
    backgroundColor: "#FFFFFF",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    position: "relative",
  },
  keepsakeTape: {
    position: "absolute",
    top: -4,
    left: 48,
    width: 38,
    height: 10,
    borderRadius: 2,
    opacity: 0.38,
    zIndex: 4,
    transform: [{ rotate: "-3deg" }],
  },
  keepsakePhotos: { width: 112, height: 112, position: "relative", marginRight: 13 },
  keepsakePhoto: {
    position: "absolute",
    width: 53,
    height: 53,
    right: 0,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  keepsakePhotoMain: { width: 78, height: 108, left: 0, top: 2, zIndex: 2 },
  keepsakePhotoTop: { top: 4, transform: [{ rotate: "4deg" }] },
  keepsakePhotoBottom: { bottom: 4, transform: [{ rotate: "-3deg" }] },
  keepsakeCopy: { flex: 1, minWidth: 0 },
  keepsakeStyle: { color: "#B06C5E", fontSize: 8, fontWeight: "900" },
  keepsakeTitle: { color: "#35333A", fontSize: 14, fontWeight: "900", marginTop: 8 },
  keepsakeCaption: { color: "#8C8580", fontSize: 9, lineHeight: 14, marginTop: 6 },
  keepsakeArrow: { color: "#B06C5E", fontSize: 20, marginLeft: 7 },
  diaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E2DA",
    backgroundColor: "#FFFFFF",
    padding: 15,
    paddingLeft: 19,
    marginBottom: 9,
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
  diaryDate: { color: "#B06C5E", fontSize: 8, fontWeight: "900" },
  diaryTitle: { color: "#35333A", fontSize: 13, fontWeight: "900", marginTop: 7 },
  diaryBody: { color: "#8C8580", fontSize: 10, lineHeight: 16, marginTop: 6 },
  cardMiniPreview: {
    height: 105,
    borderRadius: 14,
    backgroundColor: "#F4EFE8",
    padding: 10,
    flexDirection: "row",
    gap: 7,
    marginBottom: 18,
  },
  cardMiniPhoto: { flex: 1, borderRadius: 9 },
  memoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  memoryTile: {
    width: "32%",
    aspectRatio: 0.82,
    borderRadius: 8,
    borderWidth: 1,
    padding: 6,
    shadowColor: "#17233D",
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  memoryTilePhoto: { flex: 1, borderRadius: 5, overflow: "hidden" },
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
    paddingTop: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileNumber: {
    color: "rgba(83, 54, 48, .65)",
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  memoryTileDate: { fontSize: 6, fontWeight: "800" },
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
    paddingBottom: 28,
    maxHeight: "91%",
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
    marginBottom: 20,
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
    borderLeftWidth: 2,
    paddingLeft: 12,
    paddingRight: 1,
  },
  sheetHeadMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  sheetHeadCopy: { flex: 1 },
  sheetMark: {
    minWidth: 42,
    height: 42,
    borderRadius: 14,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    transform: [{ rotate: "-3deg" }],
  },
  sheetMarkText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  sheetTitle: {
    color: "#17233D",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1,
  },
  sheetSubtitle: {
    color: "#818A99",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sheetClose: {
    color: "#6556D8",
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "500",
  },
  detailField: { marginBottom: 17 },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  fieldLabelDot: { width: 5, height: 5, borderRadius: 3, marginRight: 7 },
  detailFieldLabel: {
    color: "#6F7888",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 0,
  },
  detailFieldInput: {
    height: 51,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 15,
    color: "#17233D",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#E5E3DD",
  },
  detailFieldMultiline: {
    height: 104,
    paddingTop: 15,
    textAlignVertical: "top",
  },
  sheetSubmit: {
    height: 53,
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
  infoLine: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E0DA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoLineLabel: { color: "#858D9A", fontSize: 11, fontWeight: "800" },
  infoLineValue: {
    color: "#17233D",
    fontSize: 13,
    fontWeight: "800",
    maxWidth: "70%",
    textAlign: "right",
  },
  tripMetaBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: 15,
    marginBottom: 17,
  },
  tripMetaLabel: { color: "#6F7888", fontSize: 10, fontWeight: "900" },
  tripMetaValue: {
    color: "#17233D",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 7,
  },
  optionField: { marginBottom: 18 },
  optionRow: { gap: 8, paddingRight: 6 },
  optionChip: {
    height: 38,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E0DA",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  optionChipActive: { backgroundColor: "#17233D", borderColor: "#17233D" },
  optionText: { color: "#747D8D", fontSize: 11, fontWeight: "800" },
  optionTextActive: { color: "#FFFFFF" },
  inlineFields: { flexDirection: "row", gap: 10 },
  timeField: { width: 105 },
  titleField: { flex: 1 },
  quickAdd: {
    backgroundColor: "#E9E5FF",
    borderRadius: 17,
    padding: 14,
    marginBottom: 17,
  },
  quickAddLabel: {
    color: "#6556D8",
    fontSize: 9,
    letterSpacing: 0.7,
    fontWeight: "900",
    marginBottom: 10,
  },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  quickChip: {
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickChipText: { color: "#5546C8", fontSize: 10, fontWeight: "800" },
  planPreview: {
    minHeight: 92,
    borderRadius: 20,
    backgroundColor: "#17233D",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 21,
    overflow: "hidden",
  },
  previewDate: {
    width: 58,
    height: 62,
    borderRadius: 16,
    backgroundColor: "#19B6A3",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  previewDay: { color: "#DFFFFA", fontSize: 9, fontWeight: "900" },
  previewDateNo: {
    color: "#FFFFFF",
    fontSize: 23,
    lineHeight: 26,
    fontWeight: "900",
  },
  previewBody: { flex: 1 },
  previewType: {
    color: "#65D8CA",
    fontSize: 8,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  previewTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 6,
  },
  previewPlace: { color: "#9EABC0", fontSize: 10, marginTop: 5 },
  naverField: {
    backgroundColor: "#E6F5ED",
    borderRadius: 19,
    padding: 15,
    marginBottom: 19,
    borderWidth: 1,
    borderColor: "#CDEADB",
  },
  naverHead: { flexDirection: "row", alignItems: "center", marginBottom: 13 },
  naverLogo: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#03C75A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  naverLogoText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  naverTitle: { color: "#184D36", fontSize: 12, fontWeight: "900" },
  naverHint: { color: "#648172", fontSize: 9, marginTop: 3 },
  naverInput: {
    height: 45,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
    color: "#184D36",
    fontSize: 12,
  },
  linkState: { color: "#278153", fontSize: 9, fontWeight: "800", marginTop: 8 },
  mapLink: {
    alignSelf: "flex-start",
    height: 25,
    borderRadius: 9,
    backgroundColor: "#E6F5ED",
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 7,
  },
  mapLinkIcon: {
    width: 15,
    height: 15,
    borderRadius: 4,
    backgroundColor: "#03C75A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 5,
  },
  mapLinkIconText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  mapLinkText: { color: "#23714B", fontSize: 9, fontWeight: "900" },
  mapLinkArrow: { color: "#23714B", fontSize: 10, marginLeft: 4 },
  placeHero: {
    minHeight: 177,
    borderRadius: 27,
    backgroundColor: "#8B7CF6",
    padding: 21,
    flexDirection: "row",
    justifyContent: "space-between",
    overflow: "hidden",
    marginBottom: 22,
  },
  placeHeroEyebrow: {
    color: "#DED9FF",
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "900",
  },
  placeHeroTitle: {
    color: "#FFFFFF",
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -1.2,
    fontWeight: "900",
    marginTop: 17,
  },
  placeHeroCopy: { color: "#E2DEFF", fontSize: 10, marginTop: 8 },
  placeCount: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  placeCountNo: {
    color: "#6556D8",
    fontSize: 25,
    lineHeight: 27,
    fontWeight: "900",
  },
  placeCountLabel: {
    color: "#958BE8",
    fontSize: 7,
    letterSpacing: 0.7,
    fontWeight: "900",
    marginTop: 2,
  },
  placeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  placeFilters: { flexDirection: "row", gap: 5 },
  placeFilter: {
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECE9E3",
  },
  placeFilterActive: { backgroundColor: "#17233D" },
  placeFilterText: { color: "#7C8390", fontSize: 10, fontWeight: "800" },
  placeFilterTextActive: { color: "#FFFFFF" },
  placeAdd: {
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9E5FF",
  },
  placeAddText: { color: "#6556D8", fontSize: 10, fontWeight: "900" },
  placeList: { gap: 11 },
  candidateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    shadowColor: "#17233D",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  candidateTop: { flexDirection: "row" },
  candidateNumber: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: "#F0EDFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  candidateNumberText: { color: "#7466DD", fontSize: 9, fontWeight: "900" },
  candidateInfo: { flex: 1 },
  candidateTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  candidateName: { color: "#17233D", fontSize: 16, fontWeight: "900" },
  candidateMeta: {
    color: "#727C8D",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
  },
  candidateNote: { color: "#9A8F88", fontSize: 11, marginTop: 7 },
  statusBadge: {
    borderRadius: 9,
    backgroundColor: "#FFF0ED",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgePlanned: { backgroundColor: "#DDF7F1" },
  statusText: { color: "#D25A50", fontSize: 8, fontWeight: "900" },
  statusTextPlanned: { color: "#087D70" },
  candidateActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EFEEE9",
  },
  naverAction: {
    height: 36,
    borderRadius: 12,
    paddingHorizontal: 11,
    backgroundColor: "#E6F5ED",
    flexDirection: "row",
    alignItems: "center",
  },
  naverMini: {
    width: 17,
    height: 17,
    borderRadius: 5,
    backgroundColor: "#03C75A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  naverMiniText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  naverActionText: { color: "#23714B", fontSize: 10, fontWeight: "900" },
  planAction: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#17233D",
    alignItems: "center",
    justifyContent: "center",
  },
  planActionDone: { backgroundColor: "#ECEAE5" },
  planActionText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  planActionTextDone: { color: "#858B93" },
  placeFormIntro: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  placeRequiredBadge: { height: 25, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", marginRight: 8 },
  placeRequiredBadgeText: { fontSize: 8, fontWeight: "900" },
  placeFormText: {
    color: "#61598C",
    fontSize: 9,
    fontWeight: "700",
  },
  placeSearch: {
    height: 46,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E3DD",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginBottom: 11,
  },
  placeSearchIcon: { color: "#8B7CF6", fontSize: 20, marginRight: 7 },
  placeSearchInput: { flex: 1, color: "#17233D", fontSize: 12 },
  resultCount: {
    minWidth: 25,
    height: 25,
    borderRadius: 9,
    backgroundColor: "#F0EDFF",
    alignItems: "center",
    justifyContent: "center",
  },
  resultCountText: { color: "#6556D8", fontSize: 9, fontWeight: "900" },
  tagFilterRow: { gap: 7, paddingRight: 12, paddingBottom: 14 },
  tagFilterChip: {
    height: 30,
    borderRadius: 11,
    backgroundColor: "#ECEAE5",
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tagFilterChipActive: { backgroundColor: "#8B7CF6" },
  tagFilterLabel: { color: "#777F8C", fontSize: 9, fontWeight: "800" },
  tagFilterLabelActive: { color: "#FFFFFF" },
  placeTags: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 9 },
  placeTag: {
    borderRadius: 8,
    backgroundColor: "#F0EDFF",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  placeTagText: { color: "#6556D8", fontSize: 8, fontWeight: "800" },
  manageAction: {
    height: 36,
    borderRadius: 12,
    paddingHorizontal: 11,
    backgroundColor: "#F0EDFF",
    alignItems: "center",
    justifyContent: "center",
  },
  manageActionText: { color: "#6556D8", fontSize: 10, fontWeight: "900" },
  tagEditor: { marginBottom: 18 },
  selectorLabel: { marginBottom: 9 },
  placeRecommendLabel: { fontSize: 8, fontWeight: "800", marginBottom: 7 },
  tagSuggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  tagSuggestion: {
    borderRadius: 10,
    backgroundColor: "#ECEAE5",
    borderWidth: 1,
    borderColor: "#DAD6CD",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  tagSuggestionActive: { backgroundColor: "#8B7CF6" },
  tagSuggestionText: { color: "#747C88", fontSize: 9, fontWeight: "800" },
  tagSuggestionTextActive: { color: "#FFFFFF" },
  tagInput: {
    minHeight: 47,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E0DA",
    color: "#17233D",
    fontSize: 11,
    paddingHorizontal: 13,
  },
  draftTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 },
  draftTag: {
    borderRadius: 9,
    backgroundColor: "#E9E5FF",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  draftTagText: { color: "#6556D8", fontSize: 9, fontWeight: "900" },
  deletePlace: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  deletePlaceText: { color: "#D6534A", fontSize: 11, fontWeight: "900" },
  fullScheduleButton: {
    height: 43,
    borderRadius: 13,
    backgroundColor: "#F0EDFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    marginTop: 5,
  },
  fullScheduleText: { color: "#6556D8", fontSize: 11, fontWeight: "900" },
  fullScheduleArrow: { color: "#6556D8", fontSize: 16 },
  fullScheduleList: { maxHeight: 520 },
  planPlaceSummary: {
    borderRadius: 19,
    backgroundColor: "#E9E5FF",
    padding: 16,
    marginBottom: 19,
  },
  planPlaceName: { color: "#17233D", fontSize: 18, fontWeight: "900" },
  planPlaceMeta: {
    color: "#7167A7",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 5,
  },
  prepareTools: { marginBottom: 18 },
  prepareSearch: {
    height: 45,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E3DD",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 9,
  },
  prepareFilters: { flexDirection: "row", gap: 6 },
  packingTags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 5 },
  packingTag: {
    borderRadius: 7,
    backgroundColor: "#F0EDFF",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  packingTagText: { color: "#6556D8", fontSize: 7, fontWeight: "800" },
  tripSummary: {
    height: 42,
    borderRadius: 14,
    backgroundColor: "#E2F5F1",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  summaryDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#19B6A3",
    marginRight: 8,
  },
  summaryLabel: {
    color: "#168579",
    fontSize: 9,
    fontWeight: "900",
    marginRight: 9,
  },
  summaryText: { flex: 1, color: "#324C50", fontSize: 11, fontWeight: "800" },
  placeSummary: {
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F0EDFF",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  placeSummaryText: {
    flex: 1,
    color: "#6556D8",
    fontSize: 10,
    fontWeight: "900",
  },
  placeSummaryTotal: { color: "#8C83C5", fontSize: 9, fontWeight: "800" },
  compactProgress: {
    borderRadius: 15,
    backgroundColor: "#F0EDFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 15,
  },
  compactProgressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  compactProgressTitle: { color: "#5546C8", fontSize: 11, fontWeight: "900" },
  compactProgressValue: { color: "#7168A5", fontSize: 10, fontWeight: "900" },
  compactTrack: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#D9D4F6",
    marginTop: 3,
  },
  memorySummary: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: "#FFE9E5",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  memorySummaryTitle: { color: "#6A3D39", fontSize: 12, fontWeight: "900" },
  memorySummaryMeta: { color: "#A36E67", fontSize: 9, marginTop: 4 },
  packingOverview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  packingOverviewLabel: { color: "#7168A5", fontSize: 10, fontWeight: "900" },
  packingOverviewValue: {
    color: "#17233D",
    fontSize: 27,
    fontWeight: "900",
    marginTop: 4,
  },
  packingOverviewTotal: { color: "#858C98", fontSize: 11, fontWeight: "800" },
  packingPercent: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#8B7CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  packingPercentText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  packingManageHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 7,
    paddingHorizontal: 2,
  },
  packingManageTitle: { fontSize: 14, fontWeight: "900" },
  packingManageHint: { fontSize: 8, fontWeight: "700", marginTop: 3 },
  packingShowAll: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  packingShowAllText: { fontSize: 8, fontWeight: "900" },
  ownerStats: {
    minHeight: 61,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  ownerStatSlot: { flex: 1, flexDirection: "row", alignItems: "center" },
  ownerStat: { flex: 1, alignItems: "center" },
  ownerStatActive: { borderRadius: 9, paddingVertical: 9 },
  ownerStatName: { color: "#17233D", fontSize: 10, fontWeight: "900" },
  ownerStatCount: {
    color: "#89909C",
    fontSize: 8,
    fontWeight: "800",
    marginTop: 4,
  },
  unassignedText: { color: "#D25A50" },
  ownerDivider: { width: 1, height: 26, backgroundColor: "#ECEAE5" },
  inlineAdd: {
    height: 31,
    borderRadius: 10,
    backgroundColor: "#17233D",
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineAddText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  packingActionRow: { flexDirection: "row", gap: 7, marginBottom: 12 },
  packingPrimaryAction: {
    flex: 1,
    minHeight: 43,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  packingPrimaryActionText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  packingFilterBoard: {
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 20,
  },
  packingFilterLine: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
  },
  packingFilterLabel: { width: 38, fontSize: 9, fontWeight: "900" },
  packingFilterScroll: { flex: 1 },
  packingFilterRule: { height: StyleSheet.hairlineWidth },
  packingFilterChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  packingFilterChipText: { fontSize: 9, fontWeight: "800" },
  packingFilterMore: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  packingFilterMoreText: { fontSize: 9, fontWeight: "900" },
  packingFilters: { flexDirection: "row", gap: 6 },
  packingList: { gap: 12 },
  packingOwnerSection: {
    gap: 6,
    marginBottom: 3,
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  packingOwnerHead: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34,
  },
  packingOwnerAvatar: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  packingOwnerAvatarText: { fontSize: 10, fontWeight: "900" },
  packingOwnerCopy: { flex: 1 },
  packingOwnerName: { fontSize: 15, fontWeight: "900" },
  packingOwnerProgress: { fontSize: 9, fontWeight: "700", marginTop: 2 },
  packingCollapseIcon: {
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 5,
  },
  packingTagGroup: { gap: 5, marginTop: 2 },
  packingTagHead: { flexDirection: "row", alignItems: "center", minHeight: 18 },
  packingTagHeadText: { fontSize: 9, fontWeight: "900" },
  packingTagLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
  },
  packingTagCount: { fontSize: 9, fontWeight: "800" },
  packingCard: {
    minHeight: 83,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ECEAE5",
  },
  packingCardDone: { backgroundColor: "#F1F0EC", opacity: 0.76 },
  packingCardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  completionMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    marginRight: 11,
  },
  completionTick: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  completionDash: { width: 7, height: 1.5, borderRadius: 1 },
  packingBody: { flex: 1 },
  packingTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  packingMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
  },
  packingTiming: { fontSize: 9, fontWeight: "700" },
  packingOwnerChange: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  packingOwnerChangeText: { fontSize: 8, fontWeight: "900" },
  packingV2Hidden: { display: "none" },
  packingJourney: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 17,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  packingJourneyStamp: {
    width: 49,
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    transform: [{ rotate: "-3deg" }],
  },
  packingSuitcaseHandle: {
    width: 18,
    height: 7,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    marginBottom: -1,
  },
  packingSuitcaseBody: {
    width: 31,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
    flexDirection: "row",
    justifyContent: "center",
  },
  packingSuitcaseStrap: {
    width: 4,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  packingSuitcaseSticker: {
    position: "absolute",
    right: 4,
    top: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  packingSuitcaseStickerText: { fontSize: 5, fontWeight: "900" },
  packingSuitcaseFeet: {
    width: 24,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  packingSuitcaseFoot: { width: 4, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  packingJourneyBody: { flex: 1 },
  packingJourneyCopy: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  packingJourneyEyebrow: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  packingJourneyTitle: { fontSize: 12, lineHeight: 17, fontWeight: "900", marginTop: 1 },
  packingJourneyPercent: { width: 34, fontSize: 12, lineHeight: 16, fontWeight: "900", textAlign: "right" },
  packingJourneyActions: { alignItems: "flex-end", marginLeft: 8 },
  packingJourneyAdd: {
    minWidth: 82,
    minHeight: 34,
    borderRadius: 11,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  packingJourneyAddText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  packingJourneyTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    position: "relative",
    marginHorizontal: 6,
  },
  packingJourneyProgressRow: { flexDirection: "row", alignItems: "center" },
  packingJourneyFill: { height: 6, borderRadius: 999 },
  packingJourneyPoint: {
    position: "absolute",
    top: -3,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    borderWidth: 2,
  },
  packingV2Controls: {
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 12,
    marginBottom: 12,
    padding: 9,
    gap: 8,
  },
  packingV2StatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  packingV2StatusTabs: { flexDirection: "row", alignItems: "center", gap: 3 },
  packingV2StatusChip: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: "center",
  },
  packingV2TagButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  packingV2TagButtonText: { fontSize: 9, fontWeight: "900" },
  packingV2TagChevron: { fontSize: 10, fontWeight: "900", marginTop: -2 },
  packingV2Owners: { flexDirection: "row", gap: 6 },
  packingV2OwnerChip: {
    minWidth: 57,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  packingV2OwnerName: { fontSize: 9, fontWeight: "900" },
  packingV2OwnerCount: { fontSize: 8, fontWeight: "900" },
  packingV2Group: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  packingV2GroupHead: {
    minHeight: 49,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packingV2GroupHeadPressed: { opacity: 0.72 },
  packingV2GroupTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  packingV2GroupSticker: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    transform: [{ rotate: "-2deg" }],
  },
  packingV2GroupStickerText: {
    fontSize: 6,
    lineHeight: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  packingV2GroupActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  packingV2GroupToggle: {
    width: 17,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
  },
  packingV2GroupTitle: { fontSize: 13, fontWeight: "900" },
  packingV2GroupProgress: { fontSize: 8, fontWeight: "700", marginTop: 2 },
  packingV2GroupCount: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  packingV2GroupCountText: { fontSize: 8, fontWeight: "900" },
  packingV2Row: {
    minHeight: 53,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  packingV2RowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  packingV2Check: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  packingV2Body: { flex: 1, minWidth: 0 },
  packingV2TitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  packingV2Name: { flexShrink: 1, fontSize: 12 },
  packingV2Quantity: { fontSize: 8, fontWeight: "800" },
  packingV2SubTags: { fontSize: 8, fontWeight: "700", marginTop: 3 },
  packingV2Assignee: {
    minWidth: 38,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
    marginLeft: 8,
  },
  packingV2Completed: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  packingV2CompletedHead: {
    minHeight: 48,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packingV2CompletedTitle: { fontSize: 11, fontWeight: "900" },
  packingV2CompletedToggle: { fontSize: 9, fontWeight: "900" },
  packingListTools: {
    borderTopWidth: 1,
    marginTop: 22,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  packingListToolsCopy: { flex: 1 },
  packingListToolsTitle: { fontSize: 11, fontWeight: "900" },
  packingListToolsHint: { fontSize: 8, fontWeight: "700", marginTop: 3 },
  packingToolButton: {
    minWidth: 48,
    height: 34,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  packingToolButtonText: { fontSize: 9, fontWeight: "900" },
  tagPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  tagPickerItem: {
    width: "48.7%",
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagPickerName: { fontSize: 11, fontWeight: "900", flex: 1 },
  tagPickerCount: { fontSize: 9, fontWeight: "800" },
  assignmentOptions: { gap: 8, paddingBottom: 8 },
  assignmentOption: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  assignmentAvatar: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  assignmentAvatarText: { fontSize: 10, fontWeight: "900" },
  assignmentCopy: { flex: 1 },
  assignmentName: { fontSize: 13, fontWeight: "900" },
  assignmentDescription: { fontSize: 9, fontWeight: "700", marginTop: 3 },
  assignmentRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  assignmentRadioDot: { width: 10, height: 10, borderRadius: 5 },
  packingAssigneeOptions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  packingAssigneeOption: {
    minWidth: "22%",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  packingAssigneeOptionText: { fontSize: 10, fontWeight: "900" },
  cookingImportCallout: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E3DD",
    backgroundColor: "#F6F2ED",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  cookingImportCopy: { flex: 1, paddingRight: 10 },
  cookingImportTitle: { color: "#35333A", fontSize: 11, fontWeight: "900" },
  cookingImportText: { color: "#8C8580", fontSize: 8, fontWeight: "700", marginTop: 3 },
  cookingImportGroup: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E3DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  cookingImportGroupHead: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cookingImportGroupTitle: { color: "#35333A", fontSize: 11, fontWeight: "900" },
  cookingImportGroupCount: { color: "#8C8580", fontSize: 9, fontWeight: "800" },
  cookingImportRow: {
    minHeight: 45,
    borderTopWidth: 1,
    borderTopColor: "#EEEAE5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  cookingImportCheck: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#D7D4CE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cookingImportCheckText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  cookingImportItemCopy: { flex: 1 },
  cookingImportItemName: { color: "#35333A", fontSize: 10, fontWeight: "900" },
  cookingImportItemMeta: { color: "#8C8580", fontSize: 8, fontWeight: "700", marginTop: 3 },
  packingQuantity: { color: "#858D99", fontSize: 9, fontWeight: "800" },
  claimButton: {
    alignSelf: "flex-start",
    height: 25,
    borderRadius: 9,
    backgroundColor: "#FFF0ED",
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 7,
  },
  claimButtonText: { color: "#D25A50", fontSize: 8, fontWeight: "900" },
  ownerBadge: {
    minWidth: 49,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#E9E5FF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  ownerBadgeEmpty: { backgroundColor: "#FFF0ED" },
  ownerBadgeText: { color: "#6556D8", fontSize: 10, fontWeight: "900" },
  ownerBadgeTextEmpty: { color: "#D25A50" },
  ownerChange: {
    color: "#9A94B8",
    fontSize: 6,
    fontWeight: "800",
    marginTop: 3,
  },
  emptyPacking: { height: 90, alignItems: "center", justifyContent: "center" },
  emptyPackingText: { color: "#9299A4", fontSize: 11 },
  activityBox: {
    borderRadius: 19,
    backgroundColor: "#17233D",
    padding: 15,
    marginTop: 18,
  },
  activityHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  activityTitle: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  activityLive: {
    color: "#65D8CA",
    fontSize: 7,
    letterSpacing: 0.6,
    fontWeight: "900",
  },
  activityRow: { minHeight: 32, flexDirection: "row", alignItems: "center" },
  activityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#8B7CF6",
    marginRight: 8,
  },
  activityText: { flex: 1, color: "#B6C0D0", fontSize: 9 },
  activityTime: { color: "#65D8CA", fontSize: 7, fontWeight: "800" },
  settingHint: {
    color: "#7A7F89",
    fontSize: 11,
    lineHeight: 17,
    marginTop: -6,
    marginBottom: 16,
  },
  tabIntro: {
    minHeight: 62,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 9,
    marginBottom: 7,
  },
  tabIntroCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  tabIntroTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  tabIntroTitle: { flexShrink: 1, fontSize: 17, fontWeight: "900", letterSpacing: -0.5 },
  tabIntroMetaBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  tabIntroCaption: {
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  tabIntroMeta: { fontSize: 8, fontWeight: "900" },
  tabIntroAction: {
    height: 32,
    borderRadius: 11,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIntroActionPlus: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 17,
    fontWeight: "700",
  },
  tabIntroActionText: { fontSize: 10, fontWeight: "900" },
  batchActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  batchButton: {
    borderWidth: 1,
    borderColor: "#DDD9D2",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  batchButtonText: { color: "#66616A", fontSize: 11, fontWeight: "700" },
  cookingHero: {
    borderRadius: 18,
    backgroundColor: "#FFF0D8",
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  cookV2Hero: { borderWidth: 1, overflow: "hidden" },
  cookV2ProgressBadge: {
    width: 64,
    minHeight: 58,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
  },
  cookV2ProgressBadgeValue: { fontSize: 18, lineHeight: 22, fontWeight: "900" },
  cookV2ProgressBadgeLabel: { fontSize: 7, fontWeight: "800", marginTop: 2 },
  recipeHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  recipeHeadTitle: { color: "#35333A", fontSize: 17, fontWeight: "900" },
  recipeHeadCopy: { color: "#92909A", fontSize: 10, marginTop: 3 },
  recipeAdd: {
    backgroundColor: "#EAA260",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  recipeAddText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  recipeSelector: { marginBottom: 12 },
  recipeSelectorHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  recipeSelectorTitle: { color: "#777F8C", fontSize: 10, fontWeight: "900" },
  recipeSelectorActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  recipeSelectorAdd: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  recipeSelectorAddText: { fontSize: 9, fontWeight: "900" },
  recipeSelectorCount: { color: "#92909A", fontSize: 8, fontWeight: "700" },
  recipeSelectorMore: { color: "#D9685F", fontSize: 9, fontWeight: "900" },
  cookV2MenuList: { gap: 8, paddingRight: 12 },
  cookV2MenuCard: {
    width: 142,
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cookV2MenuTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  cookV2MenuNumber: { fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  cookV2MenuCount: { fontSize: 8, fontWeight: "900" },
  cookV2MenuName: { fontSize: 12, fontWeight: "900" },
  cookV2MenuNote: { fontSize: 8, fontWeight: "700", marginTop: 4 },
  recipeList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  recipeListRow: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
  },
  recipeListRowBorder: { borderTopWidth: 1, borderTopColor: "#EEEAE5" },
  recipeListNumber: {
    width: 27,
    height: 27,
    borderRadius: 9,
    backgroundColor: "#F6F2ED",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  recipeListNumberText: { color: "#8C8580", fontSize: 9, fontWeight: "900" },
  recipeListCopy: { flex: 1, minWidth: 0 },
  recipeListName: { color: "#35333A", fontSize: 11, fontWeight: "900" },
  recipeListNote: { color: "#8C8580", fontSize: 8, fontWeight: "700", marginTop: 3 },
  recipeListCount: { color: "#8C8580", fontSize: 9, fontWeight: "800", marginLeft: 8 },
  recipeListArrow: { color: "#8C8580", fontSize: 18, fontWeight: "700", marginLeft: 6 },
  recipeTabs: { gap: 8, paddingRight: 18 },
  recipeTab: {
    width: 142,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  recipeTabActive: { backgroundColor: "#6A4C3B", borderColor: "#6A4C3B" },
  recipeTabTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  recipeTabNumber: { color: "#92909A", fontSize: 8, fontWeight: "900" },
  recipeTabText: { color: "#716B67", fontSize: 12, fontWeight: "900" },
  recipeTabTextActive: { color: "#FFFFFF" },
  recipeTabNote: { color: "#92909A", fontSize: 8, fontWeight: "700", marginTop: 4 },
  recipeTabCount: {
    color: "#B08B70",
    fontSize: 9,
    fontWeight: "900",
    backgroundColor: "#F5E9DD",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  recipeTabCountActive: { color: "#6A4C3B", backgroundColor: "#FBE0C4" },
  myCookingBox: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    padding: 12,
    marginBottom: 12,
  },
  myCookingHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  myCookingTitle: { color: "#35333A", fontSize: 11, fontWeight: "900" },
  myCookingSummary: { color: "#8C8580", fontSize: 8, fontWeight: "700", marginTop: 3 },
  myCookingCompact: { flexDirection: "row", alignItems: "center" },
  myCookingIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#F0EDFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  myCookingIconText: { color: "#6556D8", fontSize: 13, fontWeight: "900" },
  cookV2MemoLine: {
    height: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  cookV2MemoDot: { width: 3, height: 3, borderRadius: 2 },
  cookV2MemoRule: { width: 15, height: 1.5, borderRadius: 1, opacity: 0.5 },
  cookV2MemoRuleShort: { width: 10 },
  cookV2MyEyebrow: { fontSize: 7, fontWeight: "900", letterSpacing: 0.5, marginBottom: 2 },
  myCookingCopy: { flex: 1, minWidth: 0 },
  myCookingCount: { color: "#D9685F", fontSize: 10, fontWeight: "900" },
  myCookingMore: { paddingVertical: 6, paddingLeft: 10 },
  myCookingList: { gap: 6 },
  myCookingChip: {
    width: "100%",
    borderRadius: 10,
    backgroundColor: "#F6F2ED",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  myCookingName: { color: "#35333A", fontSize: 10, fontWeight: "900" },
  myCookingMeta: { color: "#8C8580", fontSize: 8, fontWeight: "700", marginTop: 3 },
  myIngredientGroup: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  myIngredientGroupHead: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myIngredientGroupTitle: { color: "#35333A", fontSize: 11, fontWeight: "900" },
  myIngredientGroupCount: { color: "#D9685F", fontSize: 9, fontWeight: "900" },
  myIngredientRow: {
    minHeight: 38,
    borderTopWidth: 1,
    borderTopColor: "#EEEAE5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myIngredientName: { color: "#35333A", fontSize: 10, fontWeight: "800" },
  myIngredientQuantity: { color: "#8C8580", fontSize: 9, fontWeight: "700" },
  aiRecipeCallout: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#F6F2ED",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  aiRecipeCopy: { flex: 1, paddingRight: 10 },
  aiRecipeTitle: { color: "#35333A", fontSize: 11, fontWeight: "900" },
  aiRecipeText: { color: "#8C8580", fontSize: 8, fontWeight: "700", lineHeight: 13, marginTop: 3 },
  aiRecipeButton: {
    borderRadius: 10,
    backgroundColor: "#F0EDFF",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  aiRecipeButtonText: { color: "#6556D8", fontSize: 9, fontWeight: "900" },
  aiPromptBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#F6F2ED",
    padding: 12,
    marginBottom: 18,
  },
  aiPromptHead: { flexDirection: "row", alignItems: "center" },
  aiPromptCopyButton: {
    borderRadius: 9,
    backgroundColor: "#17233D",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiPromptCopyText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  aiPromptPreview: {
    color: "#777F8C",
    fontSize: 8,
    fontWeight: "700",
    lineHeight: 13,
    marginTop: 10,
  },
  aiPasteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cookingNote: { color: "#9B7555", fontSize: 10, marginTop: 5 },
  recipeLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 9,
    paddingVertical: 4,
  },
  recipeLinkIcon: { color: "#D9685F", fontSize: 8, fontWeight: "900" },
  recipeLinkText: { color: "#D9685F", fontSize: 9, fontWeight: "900" },
  deleteRecipe: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 18,
  },
  deleteRecipeText: { color: "#C36A63", fontSize: 10, fontWeight: "800" },
  emptyCooking: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 42,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ECE7E1",
  },
  emptyCookingTitle: { color: "#4B4745", fontSize: 15, fontWeight: "900" },
  emptyCookingText: { color: "#99928D", fontSize: 10, marginTop: 6 },
  cookingEyebrow: {
    color: "#A16E35",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 5,
  },
  cookingHeroCopy: { flex: 1, paddingRight: 12 },
  cookingHeroActions: { alignItems: "center", gap: 7 },
  cookingMoreButton: {
    width: 30,
    height: 24,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cookingMoreText: { color: "#8C8580", fontSize: 14, fontWeight: "900", lineHeight: 16 },
  cookingTitle: {
    color: "#5C4030",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -1,
  },
  cookingCount: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cookingCountText: { color: "#C37835", fontSize: 18, fontWeight: "900" },
  cookingCountLabel: { color: "#A58A73", fontSize: 9, fontWeight: "700" },
  cookingToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cookingTip: { color: "#77706A", fontSize: 11 },
  cookingSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EEE9E2",
  },
  cookingSectionTitle: {
    color: "#A16E35",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 7,
  },
  cookV2SectionHead: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cookV2SectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  cookV2SectionTitle: { marginBottom: 0 },
  cookV2SectionLabel: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 },
  cookV2SectionLabelText: { fontSize: 7, fontWeight: "900" },
  cookV2SectionActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  cookV2SectionCount: { fontSize: 8, fontWeight: "800" },
  cookV2SectionToggle: { width: 16, fontSize: 14, fontWeight: "800", textAlign: "center" },
  ingredientRow: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F2EEE9",
  },
  cookV2IngredientDone: { opacity: 0.68 },
  cookV2IngredientCheck: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cookV2IngredientTick: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  cookV2IngredientNameDone: { textDecorationLine: "line-through" },
  ingredientDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E5A968",
    marginRight: 10,
  },
  ingredientBody: { flex: 1 },
  ingredientName: { color: "#383534", fontSize: 13, fontWeight: "800" },
  ingredientOwner: { color: "#96908A", fontSize: 9, marginTop: 2 },
  ingredientQuantity: { color: "#765D49", fontSize: 11, fontWeight: "700" },
  tabActionHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 5, marginBottom: 9 },
  tabActionTitleRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  tabActionTitle: { fontSize: 18, lineHeight: 23, fontWeight: "900", letterSpacing: -0.5 },
  tabActionCount: { fontSize: 9, fontWeight: "800" },
  tabActionButton: { minHeight: 34, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  tabActionButtonText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  placeControlPanel: { borderWidth: 1, borderRadius: 14, padding: 9, marginBottom: 11 },
  placeControlLabel: { width: 30, fontSize: 8, fontWeight: "900" },
  placeTagControlRow: { flexDirection: "row", alignItems: "center" },
  longPressHint: {
    color: "#AAA39C",
    fontSize: 10,
    textAlign: "center",
    marginTop: 2,
    marginBottom: 20,
  },
});

Object.assign(styles, {
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
    paddingHorizontal: 21,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E7E4DD",
  },
  close: { color: "#17233D", fontSize: 35, lineHeight: 35, fontWeight: "300" },
  headerName: {
    color: "#17233D",
    fontSize: 15,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  headerMore: { color: "#17233D", fontSize: 16, letterSpacing: 2 },
  date: { color: "#0B9989", fontSize: 11, letterSpacing: 1, fontWeight: "900" },
  title: {
    color: "#17233D",
    fontSize: 38,
    lineHeight: 43,
    letterSpacing: -2.1,
    fontWeight: "800",
    marginTop: 8,
  },
  subtitle: { color: "#737D8E", fontSize: 13, marginTop: 7 },
  modeSwitch: {
    backgroundColor: "#E9E6DF",
    borderRadius: 18,
    padding: 4,
    flexDirection: "row",
    marginTop: 27,
    marginBottom: 24,
  },
  modeCurrent: { backgroundColor: "#17233D", borderRadius: 14 },
  modeText: { color: "#7C8492", fontSize: 13, fontWeight: "800" },
  modeTextCurrent: { color: "#FFFFFF" },
  welcomeCard: {
    backgroundColor: "#19B6A3",
    minHeight: 194,
    borderRadius: 28,
    padding: 22,
    overflow: "hidden",
    marginBottom: 31,
  },
  markCircle: {
    width: 122,
    height: 122,
    borderRadius: 61,
    borderWidth: 20,
    borderColor: "#7FE0D3",
    position: "absolute",
    right: -22,
    top: -30,
  },
  markLeaf: {
    backgroundColor: "#0B746A",
    width: 72,
    height: 18,
    borderRadius: 20,
    transform: [{ rotate: "-42deg" }],
    position: "absolute",
    right: 9,
    top: 83,
  },
  welcomeEyebrow: {
    color: "#084F49",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  welcomeTitle: {
    color: "#102F37",
    fontSize: 29,
    lineHeight: 34,
    letterSpacing: -1.4,
    fontWeight: "800",
    marginTop: 25,
  },
  welcomeCopy: {
    color: "#155A57",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 11,
    maxWidth: 245,
  },
  sectionTitle: {
    color: "#17233D",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  sectionAction: { color: "#6556D8", fontSize: 11, fontWeight: "800" },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#19B6A3",
    marginTop: 3,
  },
  placeCard: {
    minHeight: 91,
    borderRadius: 21,
    backgroundColor: "#FFE2DD",
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 11,
  },
  stayCard: { backgroundColor: "#DDF7F1", marginRight: 10 },
  menuCard: { backgroundColor: "#E9E5FF" },
  readyNudge: {
    backgroundColor: "#17233D",
    borderRadius: 21,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  readyEyebrow: {
    color: "#6AD6C8",
    fontSize: 9,
    letterSpacing: 0.9,
    fontWeight: "900",
  },
  prepareIntro: {
    backgroundColor: "#E9E5FF",
    borderRadius: 26,
    padding: 21,
    marginBottom: 28,
  },
  prepareEyebrow: {
    color: "#6556D8",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  progressFill: { height: "100%", backgroundColor: "#8B7CF6", borderRadius: 5 },
  checkboxDone: { backgroundColor: "#8B7CF6", borderColor: "#8B7CF6" },
  memoryWelcome: {
    borderRadius: 26,
    backgroundColor: "#FFE0DA",
    padding: 21,
    minHeight: 211,
    marginBottom: 30,
  },
  memoryEyebrow: {
    color: "#C24840",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "900",
  },
  memoryTitle: {
    color: "#5A302F",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -1.3,
    fontWeight: "800",
    marginTop: 22,
  },
  memoryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#FF6B5F",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 13,
    marginTop: 19,
  },
});

// Travel notebook visual language shared by every detail tab.
Object.assign(styles, {
  detailPaperBackdrop: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  detailPaperLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    opacity: 0.55,
  },
  detailPaperMargin: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 13,
    width: 1,
  },
  page: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 88 },
  date: { fontSize: 10, fontWeight: "800", letterSpacing: 0, marginBottom: 6 },
  title: { fontSize: 29, fontWeight: "900", letterSpacing: -1.2 },
  subtitle: { fontSize: 11, marginTop: 6 },
  modeSwitch: {
    flexDirection: "row",
    marginTop: 16,
    marginBottom: 10,
    padding: 0,
    borderRadius: 0,
    borderBottomWidth: 1,
    borderColor: "#DEDCD5",
  },
  mode: {
    flex: 1,
    minHeight: 39,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  modeCurrent: {
    borderRadius: 0,
    borderBottomWidth: 2,
    shadowOpacity: 0,
    elevation: 0,
  },
  tripSummary: {
    minHeight: 42,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 23,
    transform: [{ rotate: "-.3deg" }],
  },
  sectionLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  tabActionHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 5,
    marginBottom: 9,
  },
  tabActionTitleRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  tabActionTitle: { fontSize: 18, lineHeight: 23, fontWeight: "900", letterSpacing: -0.5 },
  tabActionCount: { fontSize: 9, fontWeight: "800" },
  tabActionButton: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActionButtonText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  sectionTitle: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  timelineCard: { borderRadius: 10, padding: 16, borderWidth: 1 },
  fullScheduleButton: {
    height: 43,
    borderRadius: 8,
    marginTop: 7,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  placeCard: {
    minHeight: 94,
    borderRadius: 10,
    padding: 13,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  placeStamp: {
    width: 55,
    height: 61,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-2deg" }],
  },
  smallCard: {
    flex: 1,
    minHeight: 98,
    borderRadius: 9,
    padding: 14,
    borderWidth: 1,
  },
  readyNudge: {
    minHeight: 67,
    borderRadius: 9,
    marginTop: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  placeSummary: {
    minHeight: 43,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  placeControlPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 9,
    marginBottom: 11,
  },
  placeControlLabel: { width: 30, fontSize: 8, fontWeight: "900" },
  placeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginBottom: 7,
  },
  placeFilters: { flexDirection: "row", gap: 4 },
  placeFilter: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  placeAdd: { borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  batchButton: {
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  placeSearch: {
    height: 39,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 7,
  },
  placeTagControlRow: { flexDirection: "row", alignItems: "center" },
  tagFilterRow: { gap: 5, paddingRight: 8, paddingBottom: 0 },
  tagFilterChip: {
    height: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tagFilter: { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7 },
  candidateCard: { borderRadius: 10, padding: 15, borderWidth: 1 },
  candidateNumber: {
    width: 31,
    height: 31,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    transform: [{ rotate: "-2deg" }],
  },
  placeTag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 },
  packingOverview: {
    minHeight: 83,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ownerStats: {
    minHeight: 61,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
  },
  prepareSearch: {
    height: 45,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  packingFilter: { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7 },
  packingCard: {
    minHeight: 58,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    marginRight: 11,
    transform: [{ rotate: "-5deg" }],
  },
  checkboxDone: {
    transform: [{ rotate: "2deg" }, { scale: 1.04 }],
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  checkboxDot: { width: 5, height: 5, borderRadius: 3, opacity: 0.72 },
  checkIcon: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
    transform: [{ rotate: "-2deg" }],
  },
  ownerBadge: {
    minWidth: 43,
    minHeight: 36,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  recipeHead: {
    borderRadius: 9,
    padding: 15,
    marginBottom: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recipeTab: {
    minWidth: 92,
    minHeight: 51,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  cookingHero: {
    borderRadius: 9,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cookingSection: {
    borderRadius: 9,
    padding: 14,
    borderWidth: 1,
    marginBottom: 9,
  },
  memorySummary: {
    minHeight: 79,
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  memoryButton: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 11 },
  noteCard: { borderRadius: 9, padding: 16, borderWidth: 1, marginBottom: 9 },
  memoryTile: {
    width: "31.4%",
    aspectRatio: 1,
    borderRadius: 8,
    padding: 9,
    justifyContent: "flex-end",
    transform: [{ rotate: "-.5deg" }],
  },
  detailFieldInput: {
    height: 54,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  optionChip: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
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
});

Object.assign(styles, {
  welcomeCard: {
    backgroundColor: "#19B6A3",
    minHeight: 132,
    borderRadius: 22,
    padding: 18,
    overflow: "hidden",
    marginBottom: 24,
  },
  welcomeTitle: {
    color: "#102F37",
    fontSize: 23,
    lineHeight: 27,
    letterSpacing: -1.1,
    fontWeight: "800",
    marginTop: 14,
  },
  welcomeCopy: {
    color: "#155A57",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 7,
    maxWidth: 245,
  },
  placeHero: {
    minHeight: 116,
    borderRadius: 22,
    backgroundColor: "#8B7CF6",
    padding: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    overflow: "hidden",
    marginBottom: 18,
  },
  placeHeroTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: -1,
    fontWeight: "900",
    marginTop: 10,
  },
  placeHeroCopy: { color: "#E2DEFF", fontSize: 9, marginTop: 5 },
  placeCount: {
    width: 57,
    height: 57,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  prepareIntro: {
    backgroundColor: "#E9E5FF",
    borderRadius: 22,
    padding: 18,
    marginBottom: 22,
  },
  prepareTitle: {
    color: "#5E3934",
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -1,
    fontWeight: "800",
    marginTop: 11,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 16,
  },
  memoryWelcome: {
    borderRadius: 22,
    backgroundColor: "#FFE0DA",
    padding: 18,
    minHeight: 145,
    marginBottom: 23,
  },
  memoryTitle: {
    color: "#5A302F",
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -1.1,
    fontWeight: "800",
    marginTop: 13,
  },
  memoryButton: {
    alignSelf: "center",
    backgroundColor: "#FF6B5F",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 11,
    marginTop: 0,
  },
  placeMiniCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 13,
    paddingBottom: 10,
    overflow: "hidden",
    position: "relative",
  },
  placeMiniTape: { position: "absolute", width: 38, height: 8, top: -4, left: 18, borderRadius: 2, transform: [{ rotate: "-3deg" }] },
  placeMiniTop: { flexDirection: "row", alignItems: "center" },
  placeMiniStamp: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-2deg" }] },
  placeMiniNumber: { fontSize: 9, fontWeight: "900" },
  placeMiniInfo: { flex: 1, minWidth: 0, marginLeft: 10 },
  placeMiniTitleRow: { flexDirection: "row", alignItems: "center" },
  placeMiniName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "900" },
  placeMiniStatus: { height: 21, borderRadius: 7, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", marginLeft: 7 },
  placeMiniStatusText: { fontSize: 7, fontWeight: "900" },
  placeMiniMeta: { fontSize: 8, fontWeight: "700", marginTop: 3 },
  placeMiniTags: { minHeight: 25, flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  placeMiniTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 },
  placeMiniTagText: { fontSize: 7, fontWeight: "900" },
  placeMiniMore: { fontSize: 7, fontWeight: "800", marginLeft: 2 },
  placeMiniActions: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 5 },
  placeMiniIconButton: { minWidth: 43, height: 31, borderRadius: 8, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  placeMiniEditText: { fontSize: 8, fontWeight: "900" },
  placeMiniMapButton: { minWidth: 58, height: 31, borderRadius: 8, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  placeMiniMapText: { fontSize: 8, fontWeight: "900" },
  placeMiniPlanButton: { flex: 1, height: 31, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  placeMiniPlanText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
});
