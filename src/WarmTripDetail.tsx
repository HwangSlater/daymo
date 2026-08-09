import { useState } from "react";
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

type ViewMode = "여행" | "장소" | "준비" | "요리" | "기록";
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
};

type PackingItem = {
  id: string;
  name: string;
  quantity: string;
  owner: "함께" | "찬희" | "세인" | "미정";
  source: "집에서" | "미리 구매" | "현지 구매";
  timing: "미리" | "출발 아침" | "숙소에서";
};

const packing: PackingItem[] = [
  {
    id: "charger",
    name: "충전기",
    quantity: "2개",
    owner: "찬희",
    source: "집에서",
    timing: "출발 아침",
  },
  {
    id: "glasses",
    name: "안경",
    quantity: "1개",
    owner: "세인",
    source: "집에서",
    timing: "출발 아침",
  },
  {
    id: "clothes",
    name: "갈아입을 옷",
    quantity: "각 1벌",
    owner: "미정",
    source: "집에서",
    timing: "출발 아침",
  },
  {
    id: "wash",
    name: "세면도구",
    quantity: "1세트",
    owner: "함께",
    source: "집에서",
    timing: "미리",
  },
  {
    id: "umbrella",
    name: "우산",
    quantity: "1개",
    owner: "미정",
    source: "집에서",
    timing: "미리",
  },
];

export function WarmTripDetail({ done, toggle, onClose }: Props) {
  const [mode, setMode] = useState<ViewMode>("여행");
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>‹</Text>
        </Pressable>
        <Text style={styles.headerName}>Daymo</Text>
        <Pressable
          onPress={() => {
            setDraftTitle(title);
            setEditingTrip(true);
          }}
          hitSlop={12}
        >
          <Text style={styles.headerMore}>···</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.date}>2026. 08. 21 — 08. 23</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          사귄 지 1,038일째, 천천히 보내는 주말
        </Text>

        <View style={styles.modeSwitch}>
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
              style={[styles.mode, mode === item && styles.modeCurrent]}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === item && styles.modeTextCurrent,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === "여행" && (
          <TripOverview
            setMode={setMode}
            schedule={schedule}
            setSchedule={setSchedule}
            hasKitchen={hasKitchen}
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
  );
}

function TripOverview({
  setMode,
  schedule,
  setSchedule,
  hasKitchen,
}: {
  setMode: (mode: ViewMode) => void;
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  hasKitchen: boolean;
}) {
  const [sheet, setSheet] = useState<
    "schedule" | "reservation" | "stay" | null
  >(null);
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
      <View style={styles.tripSummary}>
        <View style={styles.summaryDot} />
        <Text style={styles.summaryLabel}>TIP</Text>
        <Text numberOfLines={1} style={styles.summaryText}>
          가고 싶은 장소를 담아 여행 일정을 짜보세요.
        </Text>
      </View>

      <SectionLabel
        label="오늘의 흐름"
        action="일정 추가"
        onPress={() => setSheet("schedule")}
      />
      <View style={styles.timelineCard}>
        {schedule.slice(0, 3).map((item, index) => (
          <Moment
            key={`${item.time}-${index}`}
            {...item}
            last={index === Math.min(schedule.length, 3) - 1}
          />
        ))}
        <Pressable
          onPress={() => setFullSchedule(true)}
          style={styles.fullScheduleButton}
        >
          <Text style={styles.fullScheduleText}>
            전체 일정 {schedule.length}개 보기
          </Text>
          <Text style={styles.fullScheduleArrow}>→</Text>
        </Pressable>
      </View>

      <SectionLabel label="우리가 정한 것" />
      <Pressable
        onPress={() => setSheet("reservation")}
        style={styles.placeCard}
      >
        <View style={styles.placeStamp}>
          <Text style={styles.stampText}>22</Text>
          <Text style={styles.stampSmall}>SAT</Text>
        </View>
        <View style={styles.placeInfo}>
          <Text style={styles.placeKicker}>DINNER RESERVED</Text>
          <Text style={styles.placeName}>은행골블랙</Text>
          <Text style={styles.placeNote}>토요일 디너 · 2명</Text>
        </View>
        <Text style={styles.cardArrow}>→</Text>
      </Pressable>
      <View style={styles.twoCards}>
        <Pressable
          onPress={() => setSheet("stay")}
          style={[styles.smallCard, styles.stayCard]}
        >
          <Text style={styles.smallOverline}>STAY</Text>
          <Text style={styles.smallTitle}>JS호텔</Text>
          <Text style={styles.smallText}>15:00 check-in</Text>
        </Pressable>
        {hasKitchen && (
          <Pressable
            onPress={() => setMode("요리")}
            style={[styles.smallCard, styles.menuCard]}
          >
            <Text style={styles.smallOverline}>COOK</Text>
            <Text style={styles.smallTitle}>밀푀유나베</Text>
            <Text style={styles.smallText}>요리 탭에서 관리</Text>
          </Pressable>
        )}
      </View>

      <Pressable onPress={() => setMode("준비")} style={styles.readyNudge}>
        <View>
          <Text style={styles.readyEyebrow}>TOGETHER, BEFORE WE GO</Text>
          <Text style={styles.readyText}>준비물 3개가 남아 있어요.</Text>
        </View>
        <Text style={styles.cardArrow}>→</Text>
      </Pressable>
      <DetailSheet
        visible={sheet === "schedule"}
        title="일정 추가"
        subtitle="장소와 지도까지 한 번에 남겨요"
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
              {planPlace || "장소를 함께 남겨보세요"}
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
              label="시간 · 선택"
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
      `${editingName}을(를) 후보 목록에서 삭제합니다.`,
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
      <View style={styles.placeSummary}>
        <View style={styles.summaryDot} />
        <Text style={styles.placeSummaryText}>
          후보 {places.filter((place) => place.status === "후보").length} · 일정{" "}
          {places.filter((place) => place.status === "일정").length}
        </Text>
        <Text style={styles.placeSummaryTotal}>총 {places.length}곳</Text>
      </View>
      <View style={styles.placeToolbar}>
        <View style={styles.placeFilters}>
          {(["전체", "후보", "일정"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[
                styles.placeFilter,
                filter === item && styles.placeFilterActive,
              ]}
            >
              <Text
                style={[
                  styles.placeFilterText,
                  filter === item && styles.placeFilterTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={openCreate} style={styles.placeAdd}>
          <Text style={styles.placeAddText}>+ 장소</Text>
        </Pressable>
      </View>
      <View style={styles.batchActions}>
        <Pressable onPress={copyPlaces} style={styles.batchButton}>
          <Text style={styles.batchButtonText}>목록 복사</Text>
        </Pressable>
        <Pressable onPress={openImport} style={styles.batchButton}>
          <Text style={styles.batchButtonText}>붙여넣기</Text>
        </Pressable>
      </View>
      <View style={styles.placeSearch}>
        <Text style={styles.placeSearchIcon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="장소, 지역, 태그 검색"
          placeholderTextColor="#9AA1AE"
          style={styles.placeSearchInput}
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
          ]}
        >
          <Text
            style={[
              styles.tagFilterLabel,
              tagFilter === null && styles.tagFilterLabelActive,
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
            ]}
          >
            <Text
              style={[
                styles.tagFilterLabel,
                tagFilter === tag && styles.tagFilterLabelActive,
              ]}
            >
              # {tag}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.placeList}>
        {visible.map((place, index) => (
          <View key={place.name} style={styles.candidateCard}>
            <View style={styles.candidateTop}>
              <View style={styles.candidateNumber}>
                <Text style={styles.candidateNumberText}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
              </View>
              <View style={styles.candidateInfo}>
                <View style={styles.candidateTitleRow}>
                  <Text style={styles.candidateName}>{place.name}</Text>
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
                <Text style={styles.candidateMeta}>
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
                <Text style={styles.manageActionText}>관리</Text>
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
                  place.status === "일정" && styles.planActionDone,
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
          label="시간 · 선택"
          value={planningTime}
          onChangeText={setPlanningTime}
          placeholder="시간 미정 가능"
        />
      </DetailSheet>
      <DetailSheet
        visible={adding}
        title={editingName ? "장소 관리" : "가볼 장소 추가"}
        subtitle="내가 정한 태그로 후보를 모아두세요"
        submit={
          mapUrl.includes("naver.")
            ? editingName
              ? "변경사항 저장"
              : "후보 장소에 저장"
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
          <Text style={styles.detailFieldLabel}>태그 · 선택</Text>
          <View style={styles.tagSuggestions}>
            {["숙소 근처", "웨이팅", "예약", "가성비", "비 오는 날"].map(
              (tag) => (
                <Pressable
                  key={tag}
                  onPress={() => addTag(tag)}
                  style={[
                    styles.tagSuggestion,
                    draftTags.includes(tag) && styles.tagSuggestionActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tagSuggestionText,
                      draftTags.includes(tag) && styles.tagSuggestionTextActive,
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
          ‘교체’는 현재 목록을 지우고 새 목록으로 바꿔요. 일정 상태는 안전을
          위해 후보로 들어갑니다.
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
  const [adding, setAdding] = useState(false);
  const [names, setNames] = useState("");
  const [quantity, setQuantity] = useState("");
  const [owner, setOwner] = useState<PackingItem["owner"]>("미정");
  const [source, setSource] = useState<PackingItem["source"]>("집에서");
  const [timing, setTiming] = useState<PackingItem["timing"]>("미리");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"전체" | "내 담당" | "미정" | "완료">(
    "전체",
  );
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
    const matchesQuery =
      `${item.name} ${item.quantity} ${item.owner} ${item.source} ${item.timing}`.includes(
        query.trim(),
      );
    const matchesFilter =
      filter === "전체" ||
      (filter === "내 담당" && item.owner === "찬희") ||
      (filter === "미정" && item.owner === "미정") ||
      (filter === "완료" && done.includes(item.name));
    return matchesQuery && matchesFilter;
  });
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
        source,
        timing,
      })),
    ]);
    setNames("");
    setQuantity("");
    setAdding(false);
  };
  const claim = (item: PackingItem) => {
    setItems((current) =>
      current.map((value) =>
        value.id === item.id ? { ...value, owner: "찬희" } : value,
      ),
    );
  };
  const complete = (item: PackingItem) => {
    toggle(item.name);
  };
  const cycleOwner = (item: PackingItem) => {
    const order: PackingItem["owner"][] = ["미정", "찬희", "세인", "함께"];
    const next = order[(order.indexOf(item.owner) + 1) % order.length];
    setItems((current) =>
      current.map((value) =>
        value.id === item.id ? { ...value, owner: next } : value,
      ),
    );
  };
  const copyPacking = async () => {
    await Clipboard.setStringAsync(
      items
        .map(
          (item) =>
            `${item.name} | ${item.quantity} | ${item.owner} | ${item.source} | ${item.timing}`,
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
    const owners: PackingItem["owner"][] = ["함께", "찬희", "세인", "미정"];
    const sources: PackingItem["source"][] = [
      "집에서",
      "미리 구매",
      "현지 구매",
    ];
    const timings: PackingItem["timing"][] = ["미리", "출발 아침", "숙소에서"];
    const stamp = Date.now();
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [
          name,
          quantity = "",
          rawOwner = "미정",
          rawSource = "집에서",
          rawTiming = "미리",
        ] = line.split("|").map((value) => value.trim());
        return {
          id: `${stamp}-${index}`,
          name,
          quantity,
          owner: owners.includes(rawOwner as PackingItem["owner"])
            ? (rawOwner as PackingItem["owner"])
            : "미정",
          source: sources.includes(rawSource as PackingItem["source"])
            ? (rawSource as PackingItem["source"])
            : "집에서",
          timing: timings.includes(rawTiming as PackingItem["timing"])
            ? (rawTiming as PackingItem["timing"])
            : "미리",
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
      <View style={styles.packingOverview}>
        <View>
          <Text style={styles.packingOverviewLabel}>함께 준비하는 중</Text>
          <Text style={styles.packingOverviewValue}>
            {completedCount}
            <Text style={styles.packingOverviewTotal}>
              {" "}
              / {items.length} 완료
            </Text>
          </Text>
        </View>
        <View style={styles.packingPercent}>
          <Text style={styles.packingPercentText}>{percentage}%</Text>
        </View>
      </View>
      <View style={styles.compactTrack}>
        <View style={[styles.progressFill, { width: `${percentage}%` }]} />
      </View>
      <View style={styles.ownerStats}>
        <View style={styles.ownerStat}>
          <Text style={styles.ownerStatName}>찬희</Text>
          <Text style={styles.ownerStatCount}>
            {
              items.filter(
                (item) => item.owner === "찬희" && !done.includes(item.name),
              ).length
            }
            개 남음
          </Text>
        </View>
        <View style={styles.ownerDivider} />
        <View style={styles.ownerStat}>
          <Text style={styles.ownerStatName}>세인</Text>
          <Text style={styles.ownerStatCount}>
            {
              items.filter(
                (item) => item.owner === "세인" && !done.includes(item.name),
              ).length
            }
            개 남음
          </Text>
        </View>
        <View style={styles.ownerDivider} />
        <View style={styles.ownerStat}>
          <Text style={styles.ownerStatName}>미정</Text>
          <Text style={[styles.ownerStatCount, styles.unassignedText]}>
            {items.filter((item) => item.owner === "미정").length}개
          </Text>
        </View>
      </View>
      <View style={styles.prepareSearch}>
        <Text style={styles.placeSearchIcon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="이름, 담당, 준비 방식 검색"
          placeholderTextColor="#9AA1AE"
          style={styles.placeSearchInput}
        />
        <Pressable onPress={() => setAdding(true)} style={styles.inlineAdd}>
          <Text style={styles.inlineAddText}>+ 추가</Text>
        </Pressable>
      </View>
      <View style={styles.batchActions}>
        <Pressable onPress={copyPacking} style={styles.batchButton}>
          <Text style={styles.batchButtonText}>목록 복사</Text>
        </Pressable>
        <Pressable onPress={openImport} style={styles.batchButton}>
          <Text style={styles.batchButtonText}>붙여넣기</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.packingFilters}
      >
        {(["전체", "내 담당", "미정", "완료"] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={[
              styles.placeFilter,
              filter === item && styles.placeFilterActive,
            ]}
          >
            <Text
              style={[
                styles.placeFilterText,
                filter === item && styles.placeFilterTextActive,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.packingList}>
        {visibleItems.map((item) => {
          const completed = done.includes(item.name);
          return (
            <View
              key={item.id}
              style={[styles.packingCard, completed && styles.packingCardDone]}
            >
              <Pressable
                onPress={() => complete(item)}
                style={[styles.checkbox, completed && styles.checkboxDone]}
              >
                <Text style={styles.checkIcon}>{completed ? "✓" : ""}</Text>
              </Pressable>
              <View style={styles.packingBody}>
                <View style={styles.packingTitleRow}>
                  <Text
                    style={[
                      styles.checkName,
                      completed && styles.checkNameDone,
                    ]}
                  >
                    {item.name}
                  </Text>
                  {item.quantity ? (
                    <Text style={styles.packingQuantity}>{item.quantity}</Text>
                  ) : null}
                </View>
                <View style={styles.packingTags}>
                  <View style={styles.packingTag}>
                    <Text style={styles.packingTagText}># {item.source}</Text>
                  </View>
                  <View style={styles.packingTag}>
                    <Text style={styles.packingTagText}># {item.timing}</Text>
                  </View>
                </View>
                {item.owner === "미정" && !completed ? (
                  <Pressable
                    onPress={() => claim(item)}
                    style={styles.claimButton}
                  >
                    <Text style={styles.claimButtonText}>내가 챙길게</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                onPress={() => cycleOwner(item)}
                style={[
                  styles.ownerBadge,
                  item.owner === "미정" && styles.ownerBadgeEmpty,
                ]}
              >
                <Text
                  style={[
                    styles.ownerBadgeText,
                    item.owner === "미정" && styles.ownerBadgeTextEmpty,
                  ]}
                >
                  {item.owner}
                </Text>
                <Text style={styles.ownerChange}>변경</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      {visibleItems.length === 0 && (
        <View style={styles.emptyPacking}>
          <Text style={styles.emptyPackingText}>
            조건에 맞는 준비물이 없어요.
          </Text>
        </View>
      )}
      <DetailSheet
        visible={adding}
        title="준비물 함께 추가"
        subtitle="여러 개를 한 번에 적고 담당과 준비 방식을 정하세요"
        submit={
          names.split(/[\n,]/).filter((name) => name.trim()).length
            ? `${names.split(/[\n,]/).filter((name) => name.trim()).length}개 추가`
            : "준비물을 입력해 주세요"
        }
        onClose={() => setAdding(false)}
        onSubmit={submit}
      >
        <View style={styles.quickAdd}>
          <Text style={styles.quickAddLabel}>자주 챙기는 것</Text>
          <View style={styles.quickRow}>
            {["충전기", "세면도구", "갈아입을 옷", "우산"].map((item) => (
              <Pressable
                key={item}
                onPress={() =>
                  setNames((value) => (value ? `${value}, ${item}` : item))
                }
                style={styles.quickChip}
              >
                <Text style={styles.quickChipText}>+ {item}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <DetailField
          label="준비물 · 여러 개 가능"
          value={names}
          onChangeText={setNames}
          placeholder={"충전기, 안경, 갈아입을 옷"}
          multiline
        />
        <OptionField
          label="누가 챙길까요?"
          options={["미정", "찬희", "세인", "함께"]}
          value={owner}
          onChange={(value) => setOwner(value as PackingItem["owner"])}
        />
        <OptionField
          label="어디서 준비할까요?"
          options={["집에서", "미리 구매", "현지 구매"]}
          value={source}
          onChange={(value) => setSource(value as PackingItem["source"])}
        />
        <OptionField
          label="언제 확인할까요?"
          options={["미리", "출발 아침", "숙소에서"]}
          value={timing}
          onChange={(value) => setTiming(value as PackingItem["timing"])}
        />
        <DetailField
          label="수량 · 선택"
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
          label="준비물 | 수량 | 담당 | 준비 방식 | 확인 시점"
          value={importText}
          onChangeText={setImportText}
          multiline
          placeholder="준비물마다 한 줄씩 붙여넣으세요"
        />
        <Text style={styles.settingHint}>
          담당: 함께·찬희·세인·미정 / 준비 방식: 집에서·미리 구매·현지 구매
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

function Cooking() {
  const [ingredients, setIngredients] = useState<CookingItem[]>([
    {
      id: "c1",
      name: "배추",
      quantity: "1/4통",
      group: "기본",
      owner: "현지 구매",
    },
    { id: "c2", name: "깻잎", quantity: "20장", group: "기본", owner: "세인" },
    {
      id: "c3",
      name: "소고기",
      quantity: "250g",
      group: "기본",
      owner: "현지 구매",
    },
    {
      id: "c4",
      name: "코인육수",
      quantity: "2개",
      group: "육수",
      owner: "세인",
    },
    { id: "c5", name: "양파", quantity: "1/2개", group: "소스", owner: "찬희" },
    {
      id: "c6",
      name: "고추냉이",
      quantity: "조금",
      group: "소스",
      owner: "미정",
    },
  ]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"교체" | "추가">("교체");
  const [importText, setImportText] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [group, setGroup] = useState("기본");
  const [owner, setOwner] = useState("미정");
  const groups = Array.from(new Set(ingredients.map((item) => item.group)));
  const addIngredient = () => {
    if (!name.trim()) return;
    setIngredients((current) => [
      ...current,
      {
        id: `${Date.now()}`,
        name: name.trim(),
        quantity: quantity.trim(),
        group,
        owner,
      },
    ]);
    setName("");
    setQuantity("");
    setAdding(false);
  };
  const removeIngredient = (item: CookingItem) =>
    Alert.alert("재료를 삭제할까요?", item.name, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () =>
          setIngredients((current) =>
            current.filter((value) => value.id !== item.id),
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
    setIngredients((current) =>
      importMode === "교체" ? parsed : [...current, ...parsed],
    );
    setImporting(false);
  };
  return (
    <View>
      <View style={styles.cookingHero}>
        <View>
          <Text style={styles.cookingEyebrow}>이번 여행의 요리</Text>
          <Text style={styles.cookingTitle}>밀푀유나베</Text>
        </View>
        <View style={styles.cookingCount}>
          <Text style={styles.cookingCountText}>{ingredients.length}</Text>
          <Text style={styles.cookingCountLabel}>재료</Text>
        </View>
      </View>
      <View style={styles.cookingToolbar}>
        <Text style={styles.cookingTip}>주방에서 쓸 재료만 따로 관리해요.</Text>
        <Pressable onPress={() => setAdding(true)} style={styles.placeAdd}>
          <Text style={styles.placeAddText}>+ 재료</Text>
        </Pressable>
      </View>
      <View style={styles.batchActions}>
        <Pressable onPress={copyCooking} style={styles.batchButton}>
          <Text style={styles.batchButtonText}>목록 복사</Text>
        </Pressable>
        <Pressable onPress={openImport} style={styles.batchButton}>
          <Text style={styles.batchButtonText}>붙여넣기</Text>
        </Pressable>
      </View>
      {groups.map((section) => (
        <View key={section} style={styles.cookingSection}>
          <Text style={styles.cookingSectionTitle}>{section}</Text>
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
                  <Text style={styles.ingredientName}>{item.name}</Text>
                  <Text style={styles.ingredientOwner}>{item.owner}</Text>
                </View>
                <Text style={styles.ingredientQuantity}>{item.quantity}</Text>
              </Pressable>
            ))}
        </View>
      ))}
      <Text style={styles.longPressHint}>
        재료를 길게 누르면 삭제할 수 있어요.
      </Text>
      <DetailSheet
        visible={adding}
        title="요리 재료 추가"
        subtitle="준비물과 섞이지 않고 이 요리에만 추가돼요"
        submit={name.trim() ? "재료 추가" : "재료 이름을 입력해 주세요"}
        onClose={() => setAdding(false)}
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
        <OptionField
          label="분류"
          options={["기본", "추가", "육수", "소스"]}
          value={group}
          onChange={setGroup}
        />
        <OptionField
          label="담당·구매"
          options={["미정", "찬희", "세인", "현지 구매"]}
          value={owner}
          onChange={setOwner}
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
  const [notes, setNotes] = useState([
    {
      author: "세인 · 오늘 10:42",
      body: "육수 재료는 내가 미리 1.5배로 만들어갈게!",
    },
    {
      author: "찬희 · 어제 22:15",
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
      { author: "찬희 · 방금", body: draft.trim() },
      ...current,
    ]);
    setDraft("");
    setWriting(false);
  };
  const addPhoto = () => setPhotos((current) => ["#19B6A3", ...current]);
  return (
    <View>
      <View style={styles.memorySummary}>
        <View>
          <Text style={styles.memorySummaryTitle}>이번 여행의 기록</Text>
          <Text style={styles.memorySummaryMeta}>
            사진 {photos.length}장 · 메모 {notes.length}개
          </Text>
        </View>
        <Pressable onPress={addPhoto} style={styles.memoryButton}>
          <Text style={styles.memoryButtonText}>+ 사진</Text>
        </Pressable>
      </View>
      <SectionLabel
        label="함께 남긴 말"
        action="메모 쓰기"
        onPress={() => setWriting(true)}
      />
      {notes.map((note, index) => (
        <View key={`${note.author}-${index}`} style={styles.noteCard}>
          <Text style={styles.noteAuthor}>{note.author}</Text>
          <Text style={styles.noteBody}>{note.body}</Text>
        </View>
      ))}
      <SectionLabel label="지난 여행의 색" />
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
        title="함께 남길 메모"
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

function SectionLabel({
  label,
  action,
  onPress,
}: {
  label: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionTitle}>{label}</Text>
      {action && (
        <Pressable onPress={onPress} hitSlop={8}>
          <Text style={styles.sectionAction}>{action} →</Text>
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
  return (
    <View style={[styles.moment, last && styles.lastMoment]}>
      <View style={styles.momentTime}>
        <Text style={styles.momentDay}>{time}</Text>
        <View style={styles.dotLine}>
          <View style={styles.dot} />
          {!last && <View style={styles.line} />}
        </View>
      </View>
      <View style={styles.momentContent}>
        <Text style={styles.momentTitle}>{title}</Text>
        <Text style={styles.momentNote}>{note}</Text>
        {mapUrl ? (
          <Pressable
            onPress={() => Linking.openURL(mapUrl)}
            style={styles.mapLink}
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
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailFieldLabel}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#9AA1AE"
        style={[
          styles.detailFieldInput,
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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBack}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View>
              <Text style={styles.sheetTitle}>{title}</Text>
              {subtitle && <Text style={styles.sheetSubtitle}>{subtitle}</Text>}
            </View>
            <Pressable onPress={onClose}>
              <Text style={styles.sheetClose}>닫기</Text>
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          <Pressable onPress={onSubmit} style={styles.sheetSubmit}>
            <Text style={styles.sheetSubmitText}>{submit}</Text>
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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBack}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.sheetClose}>완료</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLineLabel}>{label}</Text>
      <Text style={styles.infoLineValue}>{value}</Text>
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
  return (
    <View style={styles.optionField}>
      <Text style={styles.detailFieldLabel}>{label}</Text>
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
              value === option && styles.optionChipActive,
            ]}
          >
            <Text
              style={[
                styles.optionText,
                value === option && styles.optionTextActive,
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
    alignItems: "flex-start",
    marginBottom: 22,
  },
  sheetTitle: {
    color: "#17233D",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1,
  },
  sheetSubtitle: { color: "#818A99", fontSize: 11, marginTop: 6 },
  sheetClose: {
    color: "#6556D8",
    fontSize: 13,
    fontWeight: "800",
    paddingTop: 5,
  },
  detailField: { marginBottom: 17 },
  detailFieldLabel: {
    color: "#6F7888",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 7,
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
    justifyContent: "center",
    marginTop: 6,
  },
  sheetSubmitText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
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
    marginTop: 9,
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
  ownerStat: { flex: 1, alignItems: "center" },
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
  packingFilters: { gap: 6, paddingBottom: 13 },
  packingList: { gap: 9 },
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
  packingBody: { flex: 1 },
  packingTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
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
