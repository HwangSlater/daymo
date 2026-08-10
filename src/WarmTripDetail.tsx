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
      ? "다온"
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
  const [hasKitchen, setHasKitchen] = useState(true);
  const [packingItems, setPackingItems] = useState(packing);
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
          <Text style={[styles.title, appTheme && { color: appTheme.text }]}>
            {title}
          </Text>
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
            />
          )}
          {mode === "요리" && <Cooking />}
          {mode === "기록" && <Memories />}
        </ScrollView>
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
  const addSchedule = () => {
    if (!newPlanTitle.trim() || !planMapUrl.includes("naver.")) return;
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
      <TabIntro
        number="01"
        title="여행 일정"
        caption="시간순으로 일정을 확인하고 바로 추가하세요"
        meta={`${schedule.length}개 일정`}
        action="일정 추가"
        onAction={() => setSheet("schedule")}
      />

      <SectionLabel label="일정" />
      <View
        style={[
          styles.timelineCard,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        {schedule.slice(0, 3).map((item, index) => (
          <Moment
            key={`${item.time}-${index}`}
            {...item}
            last={index === Math.min(schedule.length, 3) - 1}
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

      <SectionLabel label="예약과 숙소" />
      <Pressable
        onPress={() => setSheet("reservation")}
        style={[
          styles.placeCard,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.placeStamp}>
          <Text style={styles.stampText}>22</Text>
          <Text style={styles.stampSmall}>토요일</Text>
        </View>
        <View style={styles.placeInfo}>
          <Text style={styles.placeKicker}>저녁 예약</Text>
          <Text style={[styles.placeName, theme && { color: theme.text }]}>
            은행골블랙
          </Text>
          <Text style={[styles.placeNote, theme && { color: theme.muted }]}>
            토요일 디너 · 2명
          </Text>
        </View>
        <Text style={styles.cardArrow}>→</Text>
      </Pressable>
      <View style={styles.twoCards}>
        <Pressable
          onPress={() => setSheet("stay")}
          style={[
            styles.smallCard,
            styles.stayCard,
            theme && {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={styles.smallOverline}>숙소</Text>
          <Text style={[styles.smallTitle, theme && { color: theme.text }]}>
            JS호텔
          </Text>
          <Text style={[styles.smallText, theme && { color: theme.muted }]}>
            15:00 check-in
          </Text>
        </Pressable>
        {hasKitchen && (
          <Pressable
            onPress={() => setMode("요리")}
            style={[
              styles.smallCard,
              styles.menuCard,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                transform: [{ rotate: ".2deg" }],
              },
            ]}
          >
            <Text style={styles.smallOverline}>요리</Text>
            <Text style={[styles.smallTitle, theme && { color: theme.text }]}>
              밀푀유나베
            </Text>
            <Text style={[styles.smallText, theme && { color: theme.muted }]}>
              요리 탭에서 확인
            </Text>
          </Pressable>
        )}
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
        subtitle="시간과 장소를 입력해 일정에 추가하세요"
        submit={
          planMapUrl.includes("naver.")
            ? "일정에 추가"
            : "네이버 지도 링크를 입력해 주세요"
        }
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
        <View style={styles.inlineFields}>
          <View style={styles.timeField}>
            <DetailField
              label="시간 (선택)"
              value={planTime}
              onChangeText={setPlanTime}
              placeholder="미정 가능"
            />
          </View>
          <View style={styles.titleField}>
            <DetailField
              label="일정 이름"
              value={newPlanTitle}
              onChangeText={setNewPlanTitle}
              placeholder="예: 광안리 드론쇼"
            />
          </View>
        </View>
        <DetailField
          label="장소"
          value={planPlace}
          onChangeText={setPlanPlace}
          placeholder="예: 광안리 해수욕장"
        />
        <View style={styles.naverField}>
          <View style={styles.naverHead}>
            <View style={styles.naverLogo}>
              <Text style={styles.naverLogoText}>N</Text>
            </View>
            <View>
              <Text style={styles.naverTitle}>네이버 지도 링크</Text>
              <Text style={styles.naverHint}>
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
            placeholderTextColor="#91A19B"
            style={styles.naverInput}
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
    if (!name.trim() || !mapUrl.includes("naver.")) return;
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
      .filter((place) => place.name && place.mapUrl.includes("naver."));
    if (!parsed.length) return;
    setPlaces((current) =>
      importMode === "교체" ? parsed : [...current, ...parsed],
    );
    setImporting(false);
  };

  return (
    <View>
      <TabIntro
        number="02"
        title="가고 싶은 장소"
        caption="장소를 모아두고 정해진 곳은 일정에 추가하세요"
        meta={`${places.length}곳 · 저장 ${places.filter((place) => place.status === "후보").length}`}
        action="장소 추가"
        onAction={openCreate}
      />
      <View style={styles.placeToolbar}>
        <View style={styles.placeFilters}>
          {(["전체", "후보", "일정"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[
                styles.placeFilter,
                filter === item && styles.placeFilterActive,
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
            backgroundColor: theme.surface,
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
        <View style={styles.resultCount}>
          <Text style={styles.resultCountText}>{visible.length}</Text>
        </View>
      </View>
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
      <View style={styles.placeList}>
        {visible.map((place, index) => (
          <View
            key={place.name}
            style={[
              styles.candidateCard,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                transform: [{ rotate: index % 2 ? ".2deg" : "-.2deg" }],
              },
            ]}
          >
            <View style={styles.candidateTop}>
              <View style={styles.candidateNumber}>
                <Text style={styles.candidateNumberText}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
              </View>
              <View style={styles.candidateInfo}>
                <View style={styles.candidateTitleRow}>
                  <Text
                    style={[
                      styles.candidateName,
                      theme && { color: theme.text },
                    ]}
                  >
                    {place.name}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      place.status === "일정" && styles.statusBadgePlanned,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        place.status === "일정" && styles.statusTextPlanned,
                      ]}
                    >
                      {place.status}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.candidateMeta,
                    theme && { color: theme.muted },
                  ]}
                >
                  {place.area} · {place.category}
                </Text>
                <View style={styles.placeTags}>
                  {place.tags.map((tag) => (
                    <Pressable
                      key={tag}
                      onPress={() => setTagFilter(tag)}
                      style={styles.placeTag}
                    >
                      <Text style={styles.placeTagText}># {tag}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.candidateActions}>
              <Pressable
                onPress={() => openEdit(place)}
                style={styles.manageAction}
              >
                <Text style={styles.manageActionText}>수정</Text>
              </Pressable>
              <Pressable
                onPress={() => Linking.openURL(place.mapUrl)}
                style={styles.naverAction}
              >
                <View style={styles.naverMini}>
                  <Text style={styles.naverMiniText}>N</Text>
                </View>
                <Text style={styles.naverActionText}>지도 보기</Text>
              </Pressable>
              <Pressable
                disabled={place.status === "일정"}
                onPress={() => choose(index)}
                style={[
                  styles.planAction,
                  theme && { backgroundColor: theme.primary },
                  place.status === "일정" && styles.planActionDone,
                  place.status === "일정" &&
                    theme && { backgroundColor: theme.surfaceAlt },
                ]}
              >
                <Text
                  style={[
                    styles.planActionText,
                    place.status === "일정" && styles.planActionTextDone,
                  ]}
                >
                  {place.status === "일정" ? "일정에 담김 ✓" : "일정에 담기 →"}
                </Text>
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
        subtitle="장소 정보와 태그를 입력하세요"
        submit={
          mapUrl.includes("naver.")
            ? editingName
              ? "변경사항 저장"
              : "장소 저장"
            : "네이버 지도 링크를 입력해 주세요"
        }
        destructiveLabel={editingName ? "장소 삭제" : undefined}
        onDestructive={deletePlace}
        onClose={() => setAdding(false)}
        onSubmit={savePlace}
      >
        <View style={styles.placeFormIntro}>
          <Text style={styles.placeFormIcon}>#</Text>
          <Text style={styles.placeFormText}>
            맛, 분위기, 동선처럼 우리가 중요하게 보는 기준을{`\n`}자유롭게
            태그로 남길 수 있어요.
          </Text>
        </View>
        <DetailField
          label="장소 이름"
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
          <Text style={styles.detailFieldLabel}>태그</Text>
          <View style={styles.tagSuggestions}>
            {["숙소 근처", "웨이팅", "예약", "가성비", "비 오는 날"].map(
              (tag) => (
                <Pressable
                  key={tag}
                  onPress={() => addTag(tag)}
                  style={[
                    styles.tagSuggestion,
                    theme && {
                      backgroundColor: `${theme.primary}10`,
                      borderColor: `${theme.primary}45`,
                    },
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
                      theme && { color: theme.text },
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
            placeholderTextColor="#9AA1AE"
            style={styles.tagInput}
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
        <View style={styles.naverField}>
          <View style={styles.naverHead}>
            <View style={styles.naverLogo}>
              <Text style={styles.naverLogoText}>N</Text>
            </View>
            <View>
              <Text style={styles.naverTitle}>네이버 지도 링크</Text>
              <Text style={styles.naverHint}>
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
            style={styles.naverInput}
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
          importText.includes("naver.")
            ? `${importMode}하기`
            : "네이버 지도 링크가 포함된 목록을 입력해 주세요"
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
}: {
  done: string[];
  toggle: (item: string) => void;
  items: PackingItem[];
  setItems: React.Dispatch<React.SetStateAction<PackingItem[]>>;
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
  const availableTags = managementTags.slice(1);
  const quickTags = Array.from(
    new Set([
      ...(tagFilter !== "전체 태그" ? [tagFilter] : []),
      ...availableTags,
    ]),
  ).slice(0, 4);
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
      다온: "동행",
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

  return (
    <View>
      <TabIntro
        number="03"
        title="준비물"
        caption="담당을 정하고 챙긴 준비물을 체크하세요"
        meta={`${completedCount}/${items.length} 완료 · ${percentage}%`}
        action="준비물 추가"
        onAction={() => setAdding(true)}
      />
      <View style={styles.compactTrack}>
        <View style={[styles.progressFill, { width: `${percentage}%` }]} />
      </View>
      <View style={styles.packingManageHead}>
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
        {ownerSections.map((sectionOwner) => {
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
              동행: "다온의 준비물로 이동",
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
        subtitle="준비물과 담당, 태그를 입력하세요"
        submit={
          names.split(/[\n,]/).filter((name) => name.trim()).length
            ? `${names.split(/[\n,]/).filter((name) => name.trim()).length}개 추가`
            : "준비물을 입력해 주세요"
        }
        onClose={() => setAdding(false)}
        onSubmit={submit}
      >
        <DetailField
          label="준비물 이름 (여러 개 입력 가능)"
          value={names}
          onChangeText={setNames}
          placeholder={"충전기, 안경, 갈아입을 옷"}
          multiline
        />
        <View style={styles.detailField}>
          <Text
            style={[styles.detailFieldLabel, theme && { color: theme.muted }]}
          >
            담당
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
            style={[styles.detailFieldLabel, theme && { color: theme.text }]}
          >
            추천 태그
          </Text>
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
                    theme && {
                      backgroundColor: `${theme.primary}10`,
                      borderColor: `${theme.primary}45`,
                    },
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
                      theme && { color: theme.text },
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
        </View>
        <DetailField
          label="직접 입력 (쉼표로 구분)"
          value={tagText}
          onChangeText={setTagText}
          placeholder="예: 전자기기, 출발 전, 숙소"
        />
        {draftPackingTags.length > 0 && (
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
        )}
        <DetailField
          label="수량 (선택)"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="예: 각 2개, 250g"
        />
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
          담당: 하늘·다온·공용·미정 / 태그는 #으로 여러 개 적을 수 있어요
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
  ingredients: CookingItem[];
};

function Cooking() {
  const theme = useContext(DetailThemeContext);
  const [recipes, setRecipes] = useState<Recipe[]>([
    {
      id: "mille",
      name: "밀푀유나베",
      note: "첫날 저녁 · 숙소에서",
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
          owner: "다온",
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
          owner: "다온",
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
          owner: "다온",
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
          owner: "다온",
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
  ]);
  const [activeId, setActiveId] = useState("mille");
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"교체" | "추가">("교체");
  const [importText, setImportText] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [group, setGroup] = useState("기본");
  const [owner, setOwner] = useState("미정");
  const [recipeName, setRecipeName] = useState("");
  const [recipeNote, setRecipeNote] = useState("");
  const activeRecipe =
    recipes.find((recipe) => recipe.id === activeId) || recipes[0];
  const ingredients = activeRecipe?.ingredients || [];
  const groups = Array.from(new Set(ingredients.map((item) => item.group)));
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
      current.map((recipe) =>
        recipe.id === activeRecipe.id
          ? { ...recipe, ingredients: [...recipe.ingredients, next] }
          : recipe,
      ),
    );
    setName("");
    setQuantity("");
    setAddingIngredient(false);
  };
  const addRecipe = () => {
    if (!recipeName.trim()) return;
    const id = `recipe-${Date.now()}`;
    setRecipes((current) => [
      ...current,
      {
        id,
        name: recipeName.trim(),
        note: recipeNote.trim() || "언제 먹을지 정해보세요",
        ingredients: [],
      },
    ]);
    setActiveId(id);
    setRecipeName("");
    setRecipeNote("");
    setAddingRecipe(false);
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
      <TabIntro
        number="04"
        title="여행 요리"
        caption="만들 요리와 필요한 재료를 정리하세요"
        meta={`${recipes.length}개 메뉴`}
        action="요리 추가"
        onAction={() => setAddingRecipe(true)}
      />
      {recipes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recipeTabs}
        >
          {recipes.map((recipe) => (
            <Pressable
              key={recipe.id}
              onPress={() => setActiveId(recipe.id)}
              style={[
                styles.recipeTab,
                recipe.id === activeId && styles.recipeTabActive,
                recipe.id === activeId &&
                  theme && {
                    backgroundColor: theme.primarySoft,
                    borderColor: theme.primary,
                  },
              ]}
            >
              <Text
                style={[
                  styles.recipeTabText,
                  recipe.id === activeId && styles.recipeTabTextActive,
                  recipe.id === activeId && theme && { color: theme.primary },
                ]}
              >
                {recipe.name}
              </Text>
              <Text
                style={[
                  styles.recipeTabCount,
                  recipe.id === activeId && styles.recipeTabCountActive,
                ]}
              >
                {recipe.ingredients.length}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
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
              theme && { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <View>
              <Text style={styles.cookingEyebrow}>선택한 요리</Text>
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
            </View>
            <View style={styles.cookingCount}>
              <Text style={styles.cookingCountText}>{ingredients.length}</Text>
              <Text style={styles.cookingCountLabel}>재료</Text>
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
          {groups.map((section) => (
            <View
              key={section}
              style={[
                styles.cookingSection,
                theme && {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  transform: [
                    {
                      rotate: groups.indexOf(section) % 2 ? ".2deg" : "-.2deg",
                    },
                  ],
                },
              ]}
            >
              <Text
                style={[
                  styles.cookingSectionTitle,
                  theme && { color: theme.text },
                ]}
              >
                {section}
              </Text>
              {ingredients
                .filter((item) => item.group === section)
                .map((item) => (
                  <Pressable
                    key={item.id}
                    onLongPress={() => removeIngredient(item)}
                    style={styles.ingredientRow}
                  >
                    <View style={styles.ingredientDot} />
                    <View style={styles.ingredientBody}>
                      <Text
                        style={[
                          styles.ingredientName,
                          theme && { color: theme.text },
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
          ))}
          <Text style={styles.longPressHint}>
            재료를 길게 누르면 삭제할 수 있어요.
          </Text>
          <Pressable onPress={deleteRecipe} style={styles.deleteRecipe}>
            <Text style={styles.deleteRecipeText}>이 요리 삭제</Text>
          </Pressable>
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
        visible={addingIngredient}
        title="요리 재료 추가"
        subtitle="재료 정보와 준비할 사람을 입력하세요"
        submit={name.trim() ? "재료 추가" : "재료 이름을 입력해 주세요"}
        onClose={() => setAddingIngredient(false)}
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
            style={[styles.detailFieldLabel, theme && { color: theme.text }]}
          >
            추천 분류
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
                      theme && {
                        backgroundColor: `${theme.primary}10`,
                        borderColor: `${theme.primary}45`,
                      },
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
                        theme && { color: theme.text },
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
        </View>
        <DetailField
          label="직접 입력"
          value={group}
          onChangeText={setGroup}
          placeholder="예: 채소, 양념, 토핑"
        />
        <OptionField
          label="누가 준비하나요?"
          options={["미정", "하늘", "다온", "구매"]}
          value={owner}
          onChange={setOwner}
        />
      </DetailSheet>
      <DetailSheet
        visible={addingRecipe}
        title="요리 추가"
        subtitle="만들 요리의 이름과 메모를 입력하세요"
        submit={recipeName.trim() ? "요리 만들기" : "요리 이름을 입력해 주세요"}
        onClose={() => setAddingRecipe(false)}
        onSubmit={addRecipe}
      >
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
  const [notes, setNotes] = useState([
    {
      author: "다온 · 오늘 10:42",
      body: "육수 재료는 내가 미리 1.5배로 만들어갈게!",
    },
    {
      author: "하늘 · 어제 22:15",
      body: "은행골은 일요일 13:30으로 생각하고 있어요.",
    },
  ]);
  const [photos, setPhotos] = useState([
    "#E7B4A6",
    "#DFC98A",
    "#AFC9C3",
    "#D4BDD4",
    "#C7D493",
    "#9CBBC6",
  ]);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const addNote = () => {
    if (!draft.trim()) return;
    setNotes((current) => [
      { author: "하늘 · 방금", body: draft.trim() },
      ...current,
    ]);
    setDraft("");
    setWriting(false);
  };
  const addPhoto = () => setPhotos((current) => ["#19B6A3", ...current]);
  return (
    <View>
      <TabIntro
        number="05"
        title="여행 기록"
        caption="사진과 메모로 여행의 순간을 남겨보세요"
        meta={`사진 ${photos.length}장 · 메모 ${notes.length}개`}
        action="사진 추가"
        onAction={addPhoto}
      />
      <SectionLabel
        label="여행 메모"
        action="메모 추가"
        onPress={() => setWriting(true)}
      />
      {notes.map((note, index) => (
        <View
          key={`${note.author}-${index}`}
          style={[
            styles.noteCard,
            theme && {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ rotate: index % 2 ? ".25deg" : "-.25deg" }],
            },
          ]}
        >
          <Text style={[styles.noteAuthor, theme && { color: theme.primary }]}>
            {note.author}
          </Text>
          <Text style={[styles.noteBody, theme && { color: theme.text }]}>
            {note.body}
          </Text>
        </View>
      ))}
      <SectionLabel label="여행 사진" />
      <View style={styles.memoryGrid}>
        {photos.map((color, index) => (
          <View
            key={`${color}-${index}`}
            style={[styles.memoryTile, { backgroundColor: color }]}
          >
            <Text style={styles.tileNumber}>
              {String(index + 1).padStart(2, "0")}
            </Text>
          </View>
        ))}
      </View>
      <DetailSheet
        visible={writing}
        title="메모 추가"
        submit="메모 저장"
        onClose={() => setWriting(false)}
        onSubmit={addNote}
      >
        <DetailField
          label="메모"
          value={draft}
          onChangeText={setDraft}
          placeholder="이번 여행의 이야기를 적어보세요"
          multiline
        />
      </DetailSheet>
    </View>
  );
}

function TabIntro({
  number,
  title,
  caption,
  meta,
  action,
  onAction,
}: {
  number: string;
  title: string;
  caption: string;
  meta: string;
  action: string;
  onAction: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View
      style={[styles.tabIntro, theme && { borderBottomColor: theme.border }]}
    >
      <View
        style={[
          styles.tabIntroMark,
          theme && { backgroundColor: theme.primarySoft },
        ]}
      >
        <Text
          style={[styles.tabIntroMarkText, theme && { color: theme.primary }]}
        >
          {number}
        </Text>
      </View>
      <View style={styles.tabIntroCopy}>
        <Text style={[styles.tabIntroTitle, theme && { color: theme.text }]}>
          {title}
        </Text>
        <Text style={[styles.tabIntroCaption, theme && { color: theme.muted }]}>
          {caption}
        </Text>
        <Text style={[styles.tabIntroMeta, theme && { color: theme.primary }]}>
          {meta}
        </Text>
      </View>
      <Pressable
        onPress={onAction}
        style={[
          styles.tabIntroAction,
          theme && { backgroundColor: theme.primarySoft },
        ]}
      >
        <Text
          style={[styles.tabIntroActionText, theme && { color: theme.primary }]}
        >
          ＋ {action}
        </Text>
      </Pressable>
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

function Moment({
  time,
  title,
  note,
  mapUrl,
  last,
}: {
  time: string;
  title: string;
  note: string;
  mapUrl?: string;
  last?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View
      style={[
        styles.moment,
        theme && { borderColor: theme.border },
        last && styles.lastMoment,
      ]}
    >
      <View style={styles.momentTime}>
        <Text style={[styles.momentDay, theme && { color: theme.primary }]}>
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
      <View style={styles.momentContent}>
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
              theme && { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <View style={styles.mapLinkIcon}>
              <Text style={styles.mapLinkIconText}>N</Text>
            </View>
            <Text style={styles.mapLinkText}>네이버 지도</Text>
            <Text style={styles.mapLinkArrow}>↗</Text>
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
  onClose: () => void;
  onSubmit: () => void;
  onDestructive?: () => void;
  children: React.ReactNode;
}) {
  const theme = useContext(DetailThemeContext);
  const sheetMark = title.includes("일정")
    ? "01"
    : title.includes("장소")
      ? "02"
      : title.includes("준비") || title.includes("담당")
        ? "03"
        : title.includes("요리") || title.includes("재료")
          ? "04"
          : title.includes("기록") || title.includes("사진")
            ? "05"
            : "+";
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
            <View style={styles.sheetHeadMain}>
              <View
                style={[
                  styles.sheetMark,
                  theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text
                  style={[
                    styles.sheetMarkText,
                    theme && { color: theme.primary },
                  ]}
                >
                  {sheetMark}
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
            {children}
          </ScrollView>
          <Pressable
            onPress={onSubmit}
            style={[
              styles.sheetSubmit,
              theme && { backgroundColor: theme.primary },
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
  memoryGrid: { flexDirection: "row", flexWrap: "wrap" },
  memoryTile: {
    width: "31.9%",
    aspectRatio: 1,
    marginRight: "1.4%",
    marginBottom: 6,
    borderRadius: 15,
    padding: 10,
    justifyContent: "flex-end",
  },
  tileNumber: {
    color: "rgba(83, 54, 48, .65)",
    fontSize: 10,
    fontWeight: "900",
  },
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
  sheetHeadMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  sheetHeadCopy: { flex: 1 },
  sheetMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
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
    borderRadius: 17,
    backgroundColor: "#E9E5FF",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  placeFormIcon: { color: "#6556D8", fontSize: 24, marginRight: 11 },
  placeFormText: {
    color: "#61598C",
    fontSize: 10,
    lineHeight: 16,
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
    minHeight: 78,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 10,
    marginBottom: 8,
  },
  tabIntroMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    transform: [{ rotate: "-3deg" }],
  },
  tabIntroMarkText: { fontSize: 10, fontWeight: "900" },
  tabIntroCopy: { flex: 1, paddingRight: 8 },
  tabIntroTitle: { fontSize: 17, fontWeight: "900", letterSpacing: -0.5 },
  tabIntroCaption: {
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "700",
    marginTop: 3,
  },
  tabIntroMeta: { fontSize: 9, fontWeight: "900", marginTop: 6 },
  tabIntroAction: {
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 12,
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
  recipeTabs: { gap: 8, paddingBottom: 14 },
  recipeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  recipeTabActive: { backgroundColor: "#6A4C3B", borderColor: "#6A4C3B" },
  recipeTabText: { color: "#716B67", fontSize: 12, fontWeight: "800" },
  recipeTabTextActive: { color: "#FFFFFF" },
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
  cookingNote: { color: "#9B7555", fontSize: 10, marginTop: 5 },
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
  ingredientRow: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F2EEE9",
  },
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
  placeFilter: { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7 },
  placeAdd: { borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  batchButton: {
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  placeSearch: {
    height: 45,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 10,
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
});
