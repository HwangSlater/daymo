import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Chip, ChipRow } from "../ui/Chip";
import { MapLink } from "../MapLink";
import { SyncMark } from "../SyncMarks";
import {
  mergeStayDateTime,
  photosByTarget,
  placeAreaFromAddress,
  stayMomentOf,
  기본_체크아웃_시각,
  기본_체크인_시각,
  자리에_넣기,
  type MemoryPhoto,
  type PlaceItem,
  type ReservationInfo,
  type ScheduleItem,
  type StayInfo,
} from "../tripPlanning";
import { dayTextOf, weekdayOfKey } from "../dates";
import { safeUrl, UNKNOWN_AREA } from "../placeSync";
import { josa } from "../tripExpenses";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Text, TextInput, type 입력칸 } from "../AppText";
import { Glyph } from "../Glyph";
import { showAlert } from "../showAlert";
import { 높이, 모서리, 아이콘, 누름여유, 글자누름여유 } from "../theme/controls";
import { typo } from "../theme/typography";
import { kakaoInk, naverInk } from "../theme/colors";
import { parseNaverPlaceShare, resolveNaverPlaceShare } from "../naverPlaceResolver";
import { parseKakaoPlaceShare, resolveKakaoPlaceShare } from "../kakaoPlaceShare";
import { kakaoMapSearchUrl, mapProviderName, mapProviderOf, naverMapSearchUrl } from "../mapLinks";
import { useAnnounce } from "../announce";
import { 공용스타일 } from "./styles";
import {
  DetailEditableContext,
  DetailFeedbackContext,
  DetailField,
  DetailSheet,
  DetailThemeContext,
  EmptyState,
  ListMoreButton,
  NO_PHOTOS,
  OptionField,
  OptionalFormSection,
  PhotoStrip,
  StayRangePicker,
  TabActionHeader,
  TimeRow,
  newPlaceId,
  readClipboard,
  useDraftChanged,
  useOrderWarning,
  붙여넣기_한도,
} from "./parts";

/** 여행 상세의 「장소」 탭. 가 볼 곳을 모으고 일정에 담는다. */

export function TripPlaces({
  schedule,
  setSchedule,
  places,
  setPlaces,
  reservations,
  setReservations,
  sheetRequest,
  onSheetRequestHandled,
  registeredStay,
  onRegisterStay,
  onRemoveRegisteredStay,
  photos,
  dayOptions,
  dateOptions,
  tripEnded,
  visitedAfterTrip,
}: {
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  places: PlaceItem[];
  setPlaces: React.Dispatch<React.SetStateAction<PlaceItem[]>>;
  /** 여행 전체의 예약. 장소 시트가 자기에게 붙은 것을 여기서 찾아 채운다. */
  reservations: ReservationInfo[];
  setReservations: React.Dispatch<React.SetStateAction<ReservationInfo[]>>;
  /** 여행 탭의 「예약 추가」가 열어 달라고 한 장소. `placeId` 가 없으면 새로 만든다. */
  sheetRequest: { placeId: string | null } | null;
  onSheetRequestHandled: () => void;
  /** 이 여행의 대표 숙소. 장소 시트가 체크인·체크아웃을 여기서 읽고 여기로 쓴다. */
  registeredStay: StayInfo;
  /** 장소를 대표 숙소로 설정한다. 시각을 주지 않으면 첫날 14:00·마지막날 11:00 이다. */
  onRegisterStay: (place: PlaceItem, times?: { checkin: string; checkout: string }) => void;
  onRemoveRegisteredStay: () => void;
  /** 기록 탭의 사진. 장소 카드가 자기에게 붙은 사진을 여기서 고른다. */
  photos: MemoryPhoto[];
  dayOptions: string[];
  /** 「8월 21일」 꼴의 여행 날짜. 체크인·체크아웃 날짜 칩에 쓴다. */
  dateOptions: string[];
  /** 마지막 날이 지난 여행. 일정에 담은 곳은 다녀온 곳으로 본다. */
  tripEnded: boolean;
  /** 위 규칙을 쓸지. 설정에서 끄면 저장된 상태만 본다. */
  visitedAfterTrip: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const canEdit = useContext(DetailEditableContext);
  const registeredStayName = registeredStay.name;
  /** 이 장소가 지금 대표 숙소인지. 서버에서 온 숙소는 장소 id 로, 예전 기록은 이름으로 잇는다. */
  const isStayPlace = (place: PlaceItem | undefined) =>
    Boolean(place && registeredStay.name) && (place?.id === registeredStay.placeId || place?.name === registeredStay.name);
  const firstDate = dateOptions[0];
  const lastDate = dateOptions[dateOptions.length - 1];
  const defaultStayTimes = () => ({ checkin: `${firstDate} ${기본_체크인_시각}`, checkout: `${lastDate} ${기본_체크아웃_시각}` });
  const [filter, setFilter] = useState<"전체" | "후보" | "일정" | "다녀옴" | "숙소">("전체");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [placeFiltersOpen, setPlaceFiltersOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [planningPlace, setPlanningPlace] = useState<PlaceItem | null>(null);
  const [planningDay, setPlanningDay] = useState(dayOptions[Math.min(1, dayOptions.length - 1)]);
  const [planningTime, setPlanningTime] = useState("11:00");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("식당");
  const [mapUrl, setMapUrl] = useState("");
  const [memo, setMemo] = useState("");
  const [resolvingNaver, setResolvingNaver] = useState(false);
  const [tagText, setTagText] = useState("");
  /**
   * 「다음」 키로 옮겨 갈 칸(2026-09-23 검토 #17). 접힌 칸과 여러 줄 칸에는 붙이지 않는다.
   */
  const placeTagRef = useRef<입력칸 | null>(null);
  const reservationLinkRef = useRef<입력칸 | null>(null);
  /**
   * 링크를 붙여넣으면 칸 아래에 갑자기 생기는 줄. `accessibilityLiveRegion` 은
   * 안드로이드만 듣기 때문에 iOS VoiceOver 를 위해 함께 읽어 준다.
   */
  const mapLinkNotice = mapUrl ? `${mapProviderName[mapProviderOf(mapUrl)]} 연결됨` : "";
  useAnnounce(mapLinkNotice);
  const [placeDetailsOpen, setPlaceDetailsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  // 교체는 저장해 둔 것을 통째로 지운다. 되돌릴 수 없으니 기본은 추가로 둔다.
  const [importMode, setImportMode] = useState<"교체" | "추가">("추가");
  const planningDraftChanged = useDraftChanged(planningPlace !== null, JSON.stringify([planningDay, planningTime]));
  const placeImportChanged = useDraftChanged(importing, JSON.stringify([importText, importMode]));
  const [showAllPlaces, setShowAllPlaces] = useState(false);
  const placeDraftKey = (
    draftName: string,
    draftAddress: string,
    draftCategory: string,
    draftMapUrl: string,
    draftTagText: string,
    draftMemo: string,
  ) => JSON.stringify([
    draftName,
    draftAddress,
    draftCategory,
    draftMapUrl,
    draftTagText,
    draftMemo,
  ]);
  const [placeDraftBaseline, setPlaceDraftBaseline] = useState(
    placeDraftKey("", "", "식당", "", "", ""),
  );
  // 이 장소에 붙은 예약. 장소마다 하나만 둔다. 한 가게를 두 번 예약하는 일은
  // 드물고, 여러 개를 허용하면 시트에서 어느 것을 고칠지부터 물어야 한다.
  const reservationOf = (placeId: string | undefined) =>
    placeId ? reservations.find((item) => item.placeId === placeId) : undefined;
  const blankPlaceReservation = (): ReservationInfo => ({
    // 저장할 때가 아니라 시트를 열 때 만든다. 켜고 끄기를 되풀이해도 id 가
    // 흔들리지 않아야 서버에 같은 예약이 두 번 만들어지지 않는다.
    id: newPlaceId(),
    name: "",
    date: dayOptions[Math.min(1, dayOptions.length - 1)] ?? "",
    time: "19:00",
    people: "2명",
    status: "예약 확정",
    place: "",
    bookingUrl: "",
    // 기본은 켬. 그날 일정 사이에 `19:00 저녁 예약` 으로 떠야 놓치지 않는다.
    showInSchedule: true,
  });
  const [reservationOn, setReservationOn] = useState(false);
  const [reservationDraft, setReservationDraft] = useState<ReservationInfo>(blankPlaceReservation);
  const reservationDraftKey = (on: boolean, draft: ReservationInfo) =>
    JSON.stringify([on, draft.date, draft.time, draft.people, draft.status, draft.place, draft.bookingUrl ?? "", draft.showInSchedule]);
  const [reservationBaseline, setReservationBaseline] = useState(() =>
    reservationDraftKey(false, blankPlaceReservation()),
  );
  // 분류가 「숙소」일 때 그 칩 바로 아래에서 적는 체크인·체크아웃. 「8월 21일 14:00」 꼴이다.
  // 체크인은 일정 탭 아래 「숙소」 구역에서만 적을 수 있었는데, 그 길을 찾지 못한다는
  // 말을 들었다. 숙소를 고른 자리에서 바로 묻는다.
  const [stayTimes, setStayTimes] = useState(defaultStayTimes);
  const [stayBaseline, setStayBaseline] = useState(() => JSON.stringify(defaultStayTimes()));
  const updateStayTime = (field: "checkin" | "checkout", part: "date" | "time", value: string) =>
    setStayTimes((current) => ({
      ...current,
      [field]: mergeStayDateTime(current[field], part, value, field === "checkin" ? firstDate : lastDate, field === "checkin" ? 기본_체크인_시각 : 기본_체크아웃_시각),
    }));
  const placeDraftChanged = placeDraftKey(
    name,
    address,
    category,
    mapUrl,
    tagText,
    memo,
  ) !== placeDraftBaseline
    || reservationDraftKey(reservationOn, reservationDraft) !== reservationBaseline
    || (category === "숙소" && JSON.stringify(stayTimes) !== stayBaseline);
  const allTags = useMemo(
    () => Array.from(new Set(places.flatMap((place) => place.tags))),
    [places],
  );
  // 장소 카드마다 사진 목록을 훑지 않으려고 한 번에 표로 만든다(2026-09-23 검토 #13).
  const photosByPlace = useMemo(() => photosByTarget(photos, "place"), [photos]);
  // 목록을 그릴 때마다 예약을 훑지 않으려고 한 번에 표로 만든다.
  const reservationByPlace = useMemo(() => {
    const 표 = new Map<string, ReservationInfo>();
    for (const item of reservations) if (item.placeId) 표.set(item.placeId, item);
    return 표;
  }, [reservations]);
  useEffect(() => {
    // 목록 교체로 사라진 태그가 필터에 남지 않게 한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tagFilter && !allTags.includes(tagFilter)) setTagFilter(null);
  }, [allTags, tagFilter]);
  /**
   * 다녀온 곳인가.
   *
   * 저장된 상태가 「다녀옴」이면 그렇고(예전에 손으로 표시해 둔 것), 그 밖에는
   * 마지막 날이 지난 여행에서 일정에 담은 곳을 다녀온 곳으로 본다. 설정에서
   * 끄면 저장된 상태만 본다. 후보로만 둔 곳은 갔는지 앱이 알 수 없어 건드리지
   * 않는다.
   */
  const 다녀온_곳인가 = useCallback(
    (place: PlaceItem) =>
      place.status === "다녀옴"
      || (visitedAfterTrip && tripEnded && place.status === "일정"),
    [tripEnded, visitedAfterTrip],
  );
  const statusPlaces = filter === "전체"
    ? places
    : filter === "다녀옴"
      ? places.filter(다녀온_곳인가)
    : filter === "숙소"
      // 대표로 고른 한 곳만 남기면 후보 숙소를 견줄 수가 없다. 숙소를 다 보여
      // 주고 대표인 곳은 카드에서 따로 표시한다.
      ? places.filter((place) => place.category === "숙소" || place.name === registeredStayName)
      : places.filter((place) => place.status === filter);
  const taggedPlaces = tagFilter
    ? statusPlaces.filter((place) => place.tags.includes(tagFilter))
    : statusPlaces;
  const visible = taggedPlaces.filter((place) =>
    `${place.name} ${place.area} ${place.address ?? ""} ${place.category} ${place.tags.join(" ")}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const displayedPlaces = showAllPlaces ? visible : visible.slice(0, 6);
  const draftTags = tagText
    .split(/[,#\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
  const duplicatePlace = places.some(
    (place) => place.id !== editingId && place.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  // 숙소면 체크아웃이 체크인보다 뒤여야 한다. 숙소 시트의 검사와 같다.
  const stayRangeValid = category !== "숙소"
    || stayMomentOf(stayTimes.checkout, dateOptions) > stayMomentOf(stayTimes.checkin, dateOptions);
  const placeFormValid = Boolean(name.trim()) && !duplicatePlace && stayRangeValid;
  useOrderWarning(adding && category === "숙소", stayRangeValid, "체크아웃이 체크인보다 빨라요", "체크아웃을 체크인 뒤로 옮겨 주세요.");
  const addTag = (tag: string) => {
    if (!draftTags.includes(tag))
      setTagText((value) => (value.trim() ? `${value}, ${tag}` : tag));
  };
  const pasteMapShare = async () => {
    const clipboard = await readClipboard();
    if (!clipboard.trim()) {
      notify("복사한 지도 정보가 없어요");
      return;
    }
    // 네이버를 먼저 본다. 둘 다 같은 서버 함수가 짧은 링크를 풀어 준다.
    const parsed = parseNaverPlaceShare(clipboard);
    const kakao = parsed ? null : parseKakaoPlaceShare(clipboard);
    const shared = parsed ?? kakao;
    if (!shared) {
      notify("네이버 지도나 카카오맵 공유 링크를 확인해 주세요");
      return;
    }
    if (shared.name) setName(shared.name);
    if (shared.address) setAddress(shared.address);
    setMapUrl(shared.url);
    setPlaceDetailsOpen(true);
    setResolvingNaver(true);
    const resolved = kakao
      ? await resolveKakaoPlaceShare(clipboard)
      : await resolveNaverPlaceShare(clipboard);
    setResolvingNaver(false);
    if (!resolved) return;
    if (resolved.name) setName(resolved.name);
    if (resolved.address) setAddress(resolved.address);
    if (resolved.category && ["식당", "카페", "구경", "쇼핑", "숙소"].includes(resolved.category)) {
      setCategory(resolved.category);
    }
    setMapUrl(resolved.url);
    notify(resolved.name || resolved.address
      ? "장소 정보를 자동으로 채웠어요"
      : kakao ? "카카오맵 링크를 연결했어요" : "네이버 지도 링크를 연결했어요");
  };
  const resetForm = () => {
    setName("");
    setAddress("");
    setCategory("식당");
    setMapUrl("");
    setTagText("");
    setMemo("");
    setPlaceDetailsOpen(false);
    setEditingId(null);
  };
  /** 시트를 열면서 예약 칸을 채운다. 이미 붙은 예약이 있으면 그 값으로 펼친다. */
  const loadReservationDraft = (place: PlaceItem | undefined, openReservation: boolean) => {
    const 붙은 = reservationOf(place?.id);
    const 초안 = 붙은 ?? blankPlaceReservation();
    const 켬 = Boolean(붙은) || openReservation;
    setReservationDraft(초안);
    setReservationOn(켬);
    setReservationBaseline(reservationDraftKey(켬, 초안));
  };
  /** 시트를 열면서 체크인·체크아웃 칸을 채운다. 대표 숙소면 저장된 값, 아니면 기본값이다. */
  const loadStayDraft = (place: PlaceItem | undefined) => {
    const 초안 = isStayPlace(place) && registeredStay.checkin && registeredStay.checkout
      ? { checkin: registeredStay.checkin, checkout: registeredStay.checkout }
      : defaultStayTimes();
    setStayTimes(초안);
    setStayBaseline(JSON.stringify(초안));
  };
  const openCreate = (withReservation = false) => {
    setPlaceDraftBaseline(placeDraftKey("", "", "식당", "", "", ""));
    resetForm();
    loadReservationDraft(undefined, withReservation);
    loadStayDraft(undefined);
    setAdding(true);
  };
  const openEdit = (place: PlaceItem, withReservation = false) => {
    setPlaceDraftBaseline(placeDraftKey(
      place.name,
      place.address ?? "",
      place.category,
      place.mapUrl,
      place.tags.join(", "),
      place.memo ?? "",
    ));
    setEditingId(place.id);
    setName(place.name);
    setAddress(place.address ?? "");
    setCategory(place.category);
    setMapUrl(place.mapUrl);
    setTagText(place.tags.join(", "));
    setMemo(place.memo ?? "");
    setPlaceDetailsOpen(Boolean(place.memo?.trim() || place.address || place.mapUrl || place.tags.length));
    loadReservationDraft(place, withReservation);
    loadStayDraft(place);
    setAdding(true);
  };
  useEffect(() => {
    // 여행 탭에서 장소를 고르고 온 길. 고른 장소의 시트를 예약 칸이 펼쳐진 채로 연다.
    if (!sheetRequest) return;
    const target = sheetRequest.placeId
      ? places.find((place) => place.id === sheetRequest.placeId)
      : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (target) openEdit(target, true);
    else openCreate(true);
    onSheetRequestHandled();
    // 부탁이 들어올 때만 연다. 장소 목록이 바뀔 때마다 다시 열면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetRequest]);
  const savePlace = () => {
    if (!name.trim()) return;
    const wasEditing = Boolean(editingId);
    const previousPlace = places.find((place) => place.id === editingId);
    const next = {
      // 사용자 저장 이벤트 안에서만 만든다. 서버도 이 id 를 그대로 쓴다.
      id: editingId ?? newPlaceId(),
      name: name.trim(),
      area: placeAreaFromAddress(address, previousPlace?.area),
      address: address.trim(),
      category,
      mapUrl: mapUrl.trim(),
      tags: draftTags,
      memo: memo.trim(),
      status: editingId
        ? places.find((place) => place.id === editingId)?.status || "후보"
        : "후보",
    } as PlaceItem;
    setPlaces((current) =>
      editingId
        ? current.map((place) => (place.id === editingId ? next : place))
        : [...current, next],
    );
    if (editingId) {
      setSchedule((current) => current.map((item) =>
        item.placeId === editingId
          ? {
              ...item,
              title: previousPlace && item.title === `${previousPlace.name} 체크인`
                ? `${next.name} 체크인`
                : next.name,
              note: previousPlace && item.title === `${previousPlace.name} 체크인`
                ? item.note
                : `${next.category} · ${next.area}`,
              mapUrl: next.mapUrl,
            }
          : item,
      ));
    }
    // 대표 숙소. 여행에 하나뿐이라 세 갈래로 나뉜다.
    //   이미 대표 숙소인 장소 → 적은 체크인·체크아웃으로 바로 고친다.
    //   숙소인데 대표가 아닌 장소 → 저장한 뒤 설정할지 묻는다(아래 askToRegisterStay).
    //   대표 숙소였는데 분류를 바꿈 → 설정을 해제한다. 저장 전에 한 번 물었다.
    const wasStay = isStayPlace(previousPlace);
    if (next.category === "숙소" && wasStay) onRegisterStay(next, stayTimes);
    else if (wasStay) onRemoveRegisteredStay();
    const askToRegisterStay = next.category === "숙소" && !wasStay;
    const 있던_예약 = reservationOf(next.id);
    if (reservationOn) {
      // 예약 이름은 장소 이름을 따른다. 같은 것을 두 번 적게 하지 않는다.
      const 예약: ReservationInfo = { ...reservationDraft, id: 있던_예약?.id ?? reservationDraft.id, name: next.name, placeId: next.id };
      setReservations((current) =>
        있던_예약
          ? current.map((item) => (item.id === 예약.id ? 예약 : item))
          : [...current, 예약],
      );
    } else if (있던_예약) {
      // 끌 때 이미 물어봤다. 여기서는 그대로 지운다. 일정 줄은 `showInSchedule`
      // 을 다시 훑는 자리에서 함께 걷힌다.
      setReservations((current) => current.filter((item) => item.id !== 있던_예약.id));
    }
    resetForm();
    setAdding(false);
    notify(
      reservationOn
        ? "장소와 예약을 저장했어요"
        : wasEditing ? "장소 정보를 수정했어요" : "장소를 저장했어요",
    );
    // 숙소를 저장했으면 대표 숙소로 둘지 그 자리에서 묻는다. 「나중에」면 후보로 남고
    // 카드의 「대표 숙소로 설정」으로 언제든 올릴 수 있다. 방금 적은 체크인·체크아웃을
    // 그대로 쓰므로 「설정」 한 번이면 끝난다.
    if (askToRegisterStay) {
      const 지금 = registeredStay.name;
      const times = stayTimes;
      showAlert(
        지금 ? "대표 숙소를 이 숙소로 바꿀까요?" : "이 숙소를 이번 여행의 대표 숙소로 설정할까요?",
        지금
          ? `지금 대표 숙소는 「${지금}」이에요. 바꾸면 체크인 일정도 이 숙소로 옮겨요.`
          : `${times.checkin} 체크인 일정이 함께 생겨요.`,
        [
          { text: "나중에", style: "cancel" },
          {
            text: 지금 ? "바꾸기" : "설정",
            onPress: () => {
              onRegisterStay(next, times);
              notify(`${next.name}${josa(next.name, "을", "를")} 대표 숙소로 설정했어요`);
            },
          },
        ],
      );
    }
  };
  /**
   * 저장 버튼. 대표 숙소였던 장소의 분류를 바꾸면 체크인 일정이 함께 사라지므로
   * 저장하기 전에 한 번 묻는다. 그 밖에는 바로 저장한다.
   */
  const submitPlace = () => {
    const previousPlace = places.find((place) => place.id === editingId);
    if (isStayPlace(previousPlace) && category !== "숙소") {
      showAlert("대표 숙소 설정을 해제할까요?", "분류를 바꾸면 체크인 일정도 함께 사라져요. 장소는 남아요.", [
        { text: "취소", style: "cancel" },
        { text: "설정 해제", style: "destructive", onPress: savePlace },
      ]);
      return;
    }
    savePlace();
  };
  /**
   * 예약 칸을 켜고 끈다. 끄면 붙어 있던 예약이 사라지므로 한 번 묻는다.
   *
   * 웹에서는 `Alert.alert` 이 아무 일도 하지 않아 `showAlert` 를 쓴다.
   */
  const toggleReservation = () => {
    if (!reservationOn) {
      setReservationOn(true);
      return;
    }
    const 있던_예약 = reservationOf(editingId ?? undefined);
    if (!있던_예약) {
      setReservationOn(false);
      return;
    }
    showAlert("이 장소의 예약을 삭제할까요?", `${dayTextOf(있던_예약.date)} ${있던_예약.time || "시간 미정"} 예약 기록이 사라져요.`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => setReservationOn(false) },
    ]);
  };
  const deletePlace = () => {
    if (!editingId) return;
    const 자리 = places.findIndex((place) => place.id === editingId);
    if (자리 < 0) return;
    const target = places[자리];
    const 딸린_일정 = schedule.flatMap((item, index) => (item.placeId === target.id ? [{ item, index }] : []));
    const linkedScheduleCount = 딸린_일정.length;
    // 대표 숙소였던 장소는 되돌리기를 붙이지 않는다. 숙소 정보까지 함께 지워서
    // 무엇을 어디까지 되살려야 하는지 분명하지 않다(2026-09-23).
    const 대표_숙소였나 = target.name === registeredStayName;
    const 연결_끊긴_예약 = reservations.filter((item) => item.placeId === target.id).map((item) => item.id);
    setPlaces((current) => current.filter((place) => place.id !== editingId));
    if (linkedScheduleCount) {
      setSchedule((current) => current.filter((item) => item.placeId !== target.id));
    }
    // 예약은 지우지 않고 연결만 끊는다. 예약 이름·시각은 사람이 적은 것이라
    // 장소를 뺐다고 사라지면 안 된다. 서버도 같게 정리한다(app/services/links.py).
    setReservations((current) =>
      current.map((item) =>
        item.placeId === target.id ? { ...item, placeId: undefined } : item,
      ),
    );
    if (대표_숙소였나) onRemoveRegisteredStay();
    setAdding(false);
    resetForm();
    notify("장소를 삭제했어요", 대표_숙소였나 ? undefined : {
      label: "되돌리기",
      onPress: () => {
        setPlaces((current) => 자리에_넣기(current, target, 자리));
        setSchedule((current) => 딸린_일정.reduce((목록, 하나) => 자리에_넣기(목록, 하나.item, 하나.index), current));
        if (연결_끊긴_예약.length) {
          setReservations((current) => current.map((item) =>
            연결_끊긴_예약.includes(item.id) ? { ...item, placeId: target.id } : item));
        }
        notify("장소를 되돌렸어요");
      },
    });
  };
  const choose = (index: number) => {
    const target = visible[index];
    if (target.status !== "후보") return;
    setPlanningPlace(target);
  };
  const confirmPlan = () => {
    if (!planningPlace) return;
    setSchedule((current) => [...current, {
      time: `${weekdayOfKey(planningDay)} · ${planningTime || "시간 미정"}`,
      date: planningDay,
      title: planningPlace.name,
      note: `${planningPlace.category} · ${planningPlace.area}`,
      mapUrl: planningPlace.mapUrl,
      placeId: planningPlace.id,
    }]);
    setPlaces((current) =>
      current.map((place) =>
        place.id === planningPlace.id
          ? { ...place, status: "일정" }
          : place,
      ),
    );
    setPlanningPlace(null);
    notify("여행 일정에 담았어요");
  };
  const copyPlaces = async () => {
    await Clipboard.setStringAsync(
      places
        .map(
          (place) =>
            `${place.name} | ${place.area} | ${place.address ?? ""} | ${place.category} | ${place.tags.map((tag) => `#${tag}`).join(" ")} | ${place.mapUrl} | ${place.memo ?? ""}`,
        )
        .join("\n"),
    );
    notify("장소 목록을 복사했어요");
  };
  const openImport = async () => {
    const copied = await readClipboard();
    setImportText(copied);
    setImporting(true);
    if (!copied) notify("복사한 내용을 읽지 못했어요. 칸에 직접 붙여넣어 주세요");
  };
  const importPlaces = () => {
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const fields = line.split("|").map((value) => value.trim());
        // 지역을 모르면 앱이 쓰는 말 그대로 둔다. 다른 말을 넣으면 서버에
        // 진짜 지역인 것처럼 올라가고, 다른 기기에서 "카페 · 지역 미정" 이 된다.
        const [rawName, rawArea = UNKNOWN_AREA] = fields;
        const isNewFormat = fields.length >= 6;
        const rawAddress = isNewFormat ? fields[2] : "";
        const rawCategory = fields[isNewFormat ? 3 : 2] || "장소";
        const rawTags = fields[isNewFormat ? 4 : 3] || "";
        const rawUrl = fields[isNewFormat ? 5 : 4] || "";
        // 메모는 나중에 붙은 칸이다. 없는 줄은 예전 그대로 읽는다.
        const rawMemo = fields[6] ?? "";
        return {
          id: newPlaceId(),
          name: rawName,
          area: rawArea,
          address: rawAddress,
          category: rawCategory,
          tags: rawTags.split(/[# ,]+/).filter(Boolean),
          mapUrl: rawUrl,
          memo: rawMemo,
          status: "후보" as const,
        };
      })
      .filter((place, index, items) =>
        Boolean(place.name) &&
        items.findIndex((item) => item.name.toLowerCase() === place.name.toLowerCase()) === index,
      );
    if (!parsed.length) return;
    const existingNames = new Set(places.map((place) => place.name.toLowerCase()));
    const additions = importMode === "교체"
      ? parsed
      : parsed.filter((place) => !existingNames.has(place.name.toLowerCase()));
    setPlaces((current) => importMode === "교체" ? additions : [...current, ...additions]);
    if (importMode === "교체" && registeredStayName && !additions.some((place) => place.name === registeredStayName)) {
      onRemoveRegisteredStay();
    }
    setImporting(false);
    notify(additions.length ? `장소 ${additions.length}개를 반영했어요` : "이미 저장한 장소뿐이에요");
  };

  return (
    <View>
      <TabActionHeader
        label="저장한 장소"
        count={`${places.length}개`}
        action="장소 추가"
        onPress={() => openCreate()}
      />
      <View style={[styles.placeControlPanel, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.placeToolbar}>
        {/* 기록·준비 탭의 필터 칩과 같은 부품이다. 세 탭이 한 벌로 보여야 한다. */}
        <ChipRow style={styles.placeFilters}>
          {(["전체", "후보", "일정", "다녀옴", "숙소"] as const).map((item) => (
            <Chip
              key={item}
              theme={theme}
              label={item}
              accessibilityLabel={item === "후보" ? "저장한 후보 장소" : item}
              on={filter === item}
              onPress={() => setFilter(item)}
            />
          ))}
        </ChipRow>
        {(places.length > 5 || allTags.length > 0) && (
          <Chip
            theme={theme ?? undefined}
            label="찾기"
            icon={placeFiltersOpen ? "chevronUp" : "search"}
            on={placeFiltersOpen}
            onPress={() => setPlaceFiltersOpen((value) => !value)}
            accessibilityLabel="장소 검색과 태그 필터"
          />
        )}
      </View>
      {/* 다섯 곳 이하면 목록이 한눈에 들어온다. 찾을 게 없는데 검색창이
          먼저 나오면 목록이 그만큼 밀린다. 찾는 중이면 남긴다. */}
      {(placeFiltersOpen || query.length > 0 || tagFilter !== null) && (
      <>
      <View
        style={[
          styles.placeSearch,
          theme && {
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
          },
        ]}
      >
        <Glyph name="search" size={아이콘.보통} color={theme?.muted ?? "#646C7A"} weight={1.8} />
        <TextInput
          accessibilityLabel="저장한 장소 검색"
          value={query}
          onChangeText={setQuery}
          placeholder="장소, 지역, 태그 검색"
          placeholderTextColor={theme?.muted ?? "#9AA1AE"}
          style={[styles.placeSearchInput, theme && { color: theme.text }]}
        />
        {/* 걸러진 상태에서만 센다. 전체일 때는 위 머리글의 개수와 같은 말이 된다. */}
        {visible.length !== places.length && (
          <View style={[styles.resultCount, theme && { backgroundColor: theme.primarySoft }]}>
            <Text style={[styles.resultCountText, theme && { color: theme.primary }]}>{visible.length}</Text>
          </View>
        )}
      </View>
      <View style={styles.tagFilterRow}>
        <Chip
          theme={theme ?? undefined}
          label="# 모든 태그"
          on={tagFilter === null}
          onPress={() => setTagFilter(null)}
        />
        {allTags.map((tag) => (
          <Chip
            key={tag}
            theme={theme ?? undefined}
            label={`# ${tag}`}
            on={tagFilter === tag}
            onPress={() => setTagFilter(tagFilter === tag ? null : tag)}
          />
        ))}
      </View>
      </>
      )}
      </View>
      <View style={styles.placeList}>
        {displayedPlaces.map((place, index) => {
          // 색은 순서가 아니라 상태를 뜻해야 한다. 예전에는 index % 3으로 돌려서
          // 아무 뜻 없이 카드마다 색이 달라졌다.
          const isStay = place.name === registeredStayName;
          const inPlan = place.status === "일정";
          const visited = 다녀온_곳인가(place);
          // 다녀온 것이 마지막에 일어난 일이라 배지에서 앞선다. 대표 숙소인지는
          // 아래 버튼이 그대로 말해 준다.
          const statusTone = (visited ? theme?.muted : isStay ? theme?.secondary : inPlan ? theme?.accent : theme?.primary) ?? "#3F4C8F";
          const statusLabel = visited ? "다녀옴" : isStay ? "대표 숙소" : inPlan ? "일정에 담김" : "후보";
          // 이미 그 상태면 오른쪽 위 배지가 말해준다. 같은 말을 하는 비활성
          // 버튼은 내지 않는다. 다녀온 곳은 이제 와 담을 일이 없다.
          const settled = visited || (place.category === "숙소" ? isStay : inPlan);
          // 예약을 해 둔 곳인지는 카드에서 바로 보여야 한다. 시각까지 붙여야
          // 그날 몇 시에 가야 하는지가 목록만 훑어도 잡힌다.
          const booked = reservationByPlace.get(place.id);
          return (
          // 준비물 카드처럼 카드를 누르면 열린다. 카드마다 '수정' 버튼을
          // 따로 두면 같은 일을 하는 단추가 장소 수만큼 늘어난다.
          <Pressable
            key={place.id}
            onPress={() => openEdit(place)}
            accessibilityRole="button"
            accessibilityLabel={`${place.name} 수정`}
            style={({ pressed }) => [
              styles.placeMiniCard,
              { backgroundColor: theme?.surface ?? "#FFFFFF", borderColor: theme?.border ?? "#E5E3DD" },
              pressed && 공용스타일.packingCardPressed,
            ]}
          >
            {/* 글은 왼쪽, 지금 할 수 있는 것은 오른쪽. 예전에는 단추 세 개가 카드
                아래에 한 줄을 더 써서 한 화면에 두 곳 반밖에 안 들어왔다. */}
            <View style={styles.placeMiniTop}>
              <View style={styles.placeMiniInfo}>
                <View style={styles.placeMiniTitleRow}>
                  <Text numberOfLines={1} style={[styles.placeMiniName, { color: theme?.text ?? "#17233D" }]}>{place.name}</Text>
                  {/* 오른쪽 위 한 자리. 할 일이 남았으면(아직 일정에 안 담김, 아직 대표
                      숙소가 아님) 그 일을 작은 알약으로 두고, 아니면 상태 배지를 둔다.
                      예전에는 「후보」 배지와 진한 「담기」 단추가 나란히 있어 둘이
                      같은 말을 두 번 하면서 자리를 다퉜다. */}
                  {!settled && canEdit ? (
                    place.category === "숙소" ? (
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          onRegisterStay(place);
                          notify(`${place.name}${josa(place.name, "을", "를")} 대표 숙소로 설정했어요`);
                        }}
                        hitSlop={누름여유(28)}
                        accessibilityRole="button"
                        accessibilityLabel={`${place.name}${josa(place.name, "을", "를")} 대표 숙소로 설정`}
                        style={({ pressed }) => [
                          styles.placeMiniAction,
                          { backgroundColor: `${theme?.secondary ?? "#2F7F76"}1E` },
                          pressed && 공용스타일.controlPressed,
                        ]}
                      >
                        <View style={공용스타일.더하기줄}>
                          <Glyph name="plus" size={아이콘.작게} color={theme?.secondary ?? "#2F7F76"} weight={2.4} />
                          <Text style={[styles.placeMiniActionText, { color: theme?.secondary ?? "#2F7F76" }]}>대표 숙소</Text>
                        </View>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={(event) => { event.stopPropagation(); choose(index); }}
                        hitSlop={누름여유(28)}
                        accessibilityRole="button"
                        accessibilityLabel={`${place.name} 일정에 담기`}
                        style={({ pressed }) => [
                          styles.placeMiniAction,
                          { backgroundColor: theme?.primarySoft ?? "#E6E9F5" },
                          pressed && 공용스타일.controlPressed,
                        ]}
                      >
                        <View style={공용스타일.더하기줄}>
                          <Glyph name="plus" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} weight={2.4} />
                          <Text style={[styles.placeMiniActionText, { color: theme?.primary ?? "#3F4C8F" }]}>일정에 담기</Text>
                        </View>
                      </Pressable>
                    )
                  ) : (
                    <View style={[styles.placeMiniStatus, { backgroundColor: `${statusTone}1E` }]}>
                      <Text style={[styles.placeMiniStatusText, { color: statusTone }]}>{statusLabel}</Text>
                    </View>
                  )}
                </View>
                {/* 지도는 링크라 글 줄에 붙인다. 오른쪽에 단추로 두면 「담기」와
                    나란히 쌓여 카드 높이가 곳마다 달라졌다. */}
                <View style={styles.placeMiniMetaRow}>
                  <Text numberOfLines={1} style={[styles.placeMiniMeta, { color: theme?.muted ?? "#727C8D" }]}>{place.category} · {place.area}</Text>
                  {place.mapUrl ? (
                    <MapLink theme={theme} url={place.mapUrl} small subject={place.name} />
                  ) : canEdit ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${place.name} 지도 링크 넣기`}
                      onPress={(event) => { event.stopPropagation(); openEdit(place); }}
                      hitSlop={누름여유(높이.칩)}
                      style={[styles.placeMiniMapButton, theme && { backgroundColor: theme.surfaceAlt }]}
                    >
                      <View style={공용스타일.더하기줄}>
                        <Glyph name="plus" size={아이콘.작게} color={theme?.muted ?? "#646C7A"} weight={2.4} />
                        <Text style={[styles.placeMiniMapText, theme && { color: theme.muted }]}>링크</Text>
                      </View>
                    </Pressable>
                  ) : null}
                </View>
                {booked && (
                  <View style={[styles.placeMiniBooking, { backgroundColor: `${theme?.primary ?? "#FF6B63"}1E` }]}>
                    <Text style={[styles.placeMiniBookingText, { color: theme?.primary ?? "#FF6B63" }]}>
                      {booked.time ? `${booked.time} 예약` : "예약"}
                    </Text>
                  </View>
                )}
                {Boolean(place.memo?.trim()) && (
                  <Text numberOfLines={1} style={[styles.placeMiniMemo, { color: theme?.text ?? "#17233D" }]}>{place.memo}</Text>
                )}
                <SyncMark id={place.id} />
                <PhotoStrip photos={photosByPlace.get(place.id) ?? NO_PHOTOS} label={place.name} />
              </View>
            </View>
          </Pressable>
          );
        })}
        {visible.length === 0 && (
          // 저장한 것이 하나도 없는데 "필터 초기화" 를 권하면 눌러도 그대로다.
          places.length === 0 ? (
            <EmptyState
              title="아직 저장한 장소가 없어요"
              description="가 보고 싶은 곳을 먼저 담아 두세요."
              action="장소 추가"
              onPress={canEdit ? () => openCreate() : undefined}
            />
          ) : (
            <EmptyState
              title="조건에 맞는 장소가 없어요"
              description="검색어나 선택한 상태·태그를 초기화해 보세요."
              action="필터 초기화"
              onPress={() => {
                setQuery("");
                setFilter("전체");
                setTagFilter(null);
              }}
            />
          )
        )}
      </View>
      {visible.length > 6 && (
        <ListMoreButton
          expanded={showAllPlaces}
          hiddenCount={visible.length - 6}
          onPress={() => setShowAllPlaces((value) => !value)}
        />
      )}
      {canEdit && (
      <View
        style={[
          공용스타일.packingListTools,
          theme && { borderTopColor: theme.border },
        ]}
      >
        <View style={공용스타일.packingListToolsCopy}>
          <Text
            style={[
              공용스타일.packingListToolsTitle,
              theme && { color: theme.text },
            ]}
          >
            목록 한꺼번에 수정
          </Text>
          <Text
            style={[
              공용스타일.packingListToolsHint,
              theme && { color: theme.muted },
            ]}
          >
            복사해 수정한 뒤 다시 붙여넣을 수 있어요
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={copyPlaces}
          hitSlop={누름여유(높이.칩)}
          style={[
            공용스타일.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              공용스타일.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            복사
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={openImport}
          hitSlop={누름여유(높이.칩)}
          style={[
            공용스타일.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              공용스타일.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            붙여넣기
          </Text>
        </Pressable>
      </View>
      )}
      <DetailSheet
        visible={planningPlace !== null}
        title="일정에 담기"
        subtitle={
          planningPlace ? `${planningPlace.name}${josa(planningPlace.name, "을", "를")} 언제 갈까요?` : undefined
        }
        submit="일정에 담기"
        hasUnsavedChanges={planningDraftChanged}
        onClose={() => setPlanningPlace(null)}
        onSubmit={confirmPlan}
      >
        <View style={[styles.planPlaceSummary, theme && { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.planPlaceName, theme && { color: theme.text }]}>{planningPlace?.name}</Text>
          <Text style={[styles.planPlaceMeta, theme && { color: theme.muted }]}>
            {planningPlace?.area} · {planningPlace?.category}
          </Text>
          <View style={styles.placeTags}>
            {planningPlace?.tags.map((tag) => (
              <View key={tag} style={[styles.placeTag, theme && { backgroundColor: theme.surface }]}>
                <Text style={[styles.placeTagText, theme && { color: theme.primary }]}># {tag}</Text>
              </View>
            ))}
          </View>
        </View>
        <OptionField
          label="날짜"
          options={dayOptions}
          labelOf={dayTextOf}
          value={planningDay}
          onChange={setPlanningDay}
        />
        <TimeRow
          label="시간 (선택)"
          value={planningTime}
          onChange={setPlanningTime}
          fallback="11:00"
          optional
        />
      </DetailSheet>
      <DetailSheet
        visible={adding}
        title={editingId ? "장소 수정" : "장소 추가"}
        subtitle="이름만 입력해도 저장할 수 있어요"
        submit={editingId ? "저장" : "장소 추가"}
        disabledHint={!placeFormValid
          ? duplicatePlace ? "이미 저장한 장소예요" : !name.trim() ? "장소 이름을 입력해 주세요" : "체크아웃 시간을 다시 확인해 주세요"
          : undefined}
        destructiveLabel={editingId ? "장소 삭제" : undefined}
        destructiveMessage={editingId ? "연결된 일정과 대표 숙소 설정도 함께 정리돼요. 예약 기록은 예약 목록에 남아요." : undefined}
        submitDisabled={!placeFormValid}
        hasUnsavedChanges={placeDraftChanged}
        onDestructive={deletePlace}
        onClose={() => setAdding(false)}
        onSubmit={submitPlace}
      >
        {!editingId && !mapUrl && (
          <Pressable
            onPress={pasteMapShare}
            disabled={resolvingNaver}
            accessibilityRole="button"
            accessibilityLabel="복사한 지도 장소 정보 붙여넣기"
            style={[
              styles.naverAutoFill,
              theme && { backgroundColor: theme.dark ? "#16352C" : "#EAF7F0", borderColor: theme.dark ? "#245544" : "#BFE8D1" },
            ]}
          >
            <View style={공용스타일.naverLogo}>
              <Text style={공용스타일.naverLogoText}>N</Text>
            </View>
            <View style={styles.naverAutoFillCopy}>
              <Text style={[styles.naverAutoFillTitle, theme && { color: theme.dark ? "#DDF7E9" : "#184D36" }]}>{resolvingNaver ? "장소 정보 가져오는 중…" : "지도 링크 붙여넣기"}</Text>
              <Text style={[styles.naverAutoFillText, theme && { color: theme.dark ? "#96B7A8" : "#648476" }]}>{resolvingNaver ? "이름과 주소를 확인하고 있어요" : "네이버·카카오 링크를 붙여넣어 주세요"}</Text>
            </View>
            <Glyph name="chevronRight" size={아이콘.보통} color={theme?.dark ? "#96B7A8" : "#16844E"} />
          </Pressable>
        )}
        <DetailField
          label="장소 이름"
          maxLength={100}
          required
          value={name}
          onChangeText={setName}
          placeholder="예: 소나기식당"
          textContentType="location"
          returnKeyType="done"
          onSubmitEditing={() => placeFormValid && savePlace()}
        />
        <OptionField
          label="종류"
          options={["식당", "카페", "구경", "쇼핑", "숙소"]}
          value={category}
          onChange={setCategory}
        />
        {/* 「숙소」를 고르면 그 칩 바로 아래에서 체크인·체크아웃을 적는다. 일정 탭의
            숙소 시트와 같은 부품이라 두 곳의 값이 같은 대표 숙소로 모인다. */}
        {category === "숙소" && (
          <>
            <StayRangePicker
              checkin={stayTimes.checkin}
              checkout={stayTimes.checkout}
              dates={dateOptions}
              onChange={updateStayTime}
            />
            <Text style={[styles.stayPickerHint, theme && { color: theme.muted }]}>
              {isStayPlace(places.find((place) => place.id === editingId))
                ? "이 여행의 대표 숙소예요. 저장하면 체크인 일정도 함께 바뀌어요."
                : registeredStayName
                  ? `지금 대표 숙소는 「${registeredStayName}」이에요. 저장할 때 이 숙소로 바꿀지 물어요.`
                  : "저장할 때 이 숙소를 대표 숙소로 설정할지 물어요."}
            </Text>
          </>
        )}
        <OptionalFormSection
          label="메모 · 주소 · 태그 · 지도"
          summary={
            [memo.trim() && "메모", address && "주소", draftTags.length && `태그 ${draftTags.length}개`, mapUrl && "지도"]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          open={placeDetailsOpen}
          onToggle={() => setPlaceDetailsOpen((current) => !current)}
        >
          <DetailField
            label="메모 (선택)"
            value={memo}
            onChangeText={setMemo}
            multiline
            maxLength={2000}
            placeholder="예: 웨이팅 30분, 담에 가 보기"
          />
          <View
            style={[
              styles.naverLinkGuide,
              theme && {
                backgroundColor: theme.dark ? "#16352C" : "#EAF7F0",
                borderColor: theme.dark ? "#245544" : "#BFE8D1",
              },
            ]}
          >
            <View style={공용스타일.naverHead}>
              <View style={공용스타일.naverLogo}>
                <Text style={공용스타일.naverLogoText}>N</Text>
              </View>
              <View style={styles.naverCopy}>
                <Text style={[공용스타일.naverTitle, theme?.dark && { color: "#DDF7E9" }]}>지도로 장소 연결</Text>
                <Text style={[공용스타일.naverHint, theme?.dark && { color: "#96B7A8" }]}>지도에서 공유 링크를 복사한 다음 붙여넣어 주세요</Text>
              </View>
            </View>
            <View style={styles.naverLinkActions}>
              <Pressable
                onPress={() => void Linking.openURL(naverMapSearchUrl(name))}
                accessibilityRole="link"
                accessibilityLabel={name.trim() ? `${name.trim()} 네이버 지도에서 찾기` : "네이버 지도 열기"}
                style={[styles.naverLinkButton, theme && { backgroundColor: theme.surface }]}
              >
                <Text style={[styles.naverLinkButtonText, theme?.dark && { color: "#7ED9A7" }]}>네이버 지도</Text>
              </Pressable>
              <Pressable
                onPress={() => void Linking.openURL(kakaoMapSearchUrl(name))}
                accessibilityRole="link"
                accessibilityLabel={name.trim() ? `${name.trim()} 카카오맵에서 찾기` : "카카오맵 열기"}
                style={[styles.naverLinkButton, theme && { backgroundColor: theme.surface }]}
              >
                <Text style={[styles.naverLinkButtonText, { color: kakaoInk(Boolean(theme?.dark)) }]}>카카오맵</Text>
              </Pressable>
              <Pressable
                onPress={pasteMapShare}
                disabled={resolvingNaver}
                accessibilityRole="button"
                accessibilityLabel="복사한 지도 링크 붙여넣기"
                style={[styles.naverLinkButton, styles.naverLinkButtonPrimary]}
              >
                <Text style={[styles.naverLinkButtonText, styles.naverLinkButtonPrimaryText]}>{resolvingNaver ? "가져오는 중…" : "링크 붙여넣기"}</Text>
              </Pressable>
            </View>
            {mapLinkNotice ? (
              <View accessibilityLiveRegion="polite" style={[styles.naverConnected, theme && { backgroundColor: theme.surface }]}>
                <View style={styles.naverConnectedCopy}>
                  <Glyph name="check" size={아이콘.작게} color="#16844E" />
                  <Text style={[styles.naverConnectedText, theme?.dark && { color: "#7ED9A7" }]}>{mapLinkNotice}</Text>
                </View>
                <Pressable onPress={() => setMapUrl("")} hitSlop={글자누름여유} accessibilityRole="button" accessibilityLabel="지도 연결 해제">
                  <Text style={[styles.naverDisconnectText, theme && { color: theme.muted }]}>연결 해제</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <DetailField
            label="주소 직접 입력 (선택)"
            value={address}
            onChangeText={setAddress}
            placeholder="예: 전주시 완산구 한옥길 12"
            maxLength={300}
            autoComplete="street-address"
            textContentType="fullStreetAddress"
            returnKeyType="next"
            onSubmitEditing={() => placeTagRef.current?.focus()}
          />
          <View style={공용스타일.tagEditor}>
            <Text style={[공용스타일.detailFieldLabel, 공용스타일.selectorLabel]}>태그</Text>
            <Text style={[공용스타일.placeRecommendLabel, theme && { color: theme.muted }]}>추천 태그</Text>
            <View style={공용스타일.tagSuggestions}>
              {["숙소 근처", "웨이팅", "예약", "가성비", "비 오는 날"].map(
                (tag) => (
                  <Chip
                    key={tag}
                    theme={theme ?? undefined}
                    label={`# ${tag}`}
                    on={draftTags.includes(tag)}
                    onPress={() => addTag(tag)}
                  />
                ),
              )}
            </View>
            <TextInput
              ref={placeTagRef}
              accessibilityLabel="태그"
              value={tagText}
              onChangeText={setTagText}
              returnKeyType="done"
              onSubmitEditing={() => placeFormValid && savePlace()}
              placeholder="쉼표로 구분 · 예: 초밥, 디너, 조용한 곳"
              placeholderTextColor={theme?.muted ?? "#9AA1AE"}
              style={[공용스타일.tagInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            />
            <View style={공용스타일.draftTags}>
              {draftTags.map((tag) => (
                <Chip
                  key={tag}
                  theme={theme ?? undefined}
                  label={`# ${tag}`}
                  on
                  trailing="close"
                  onPress={() =>
                    setTagText(
                      draftTags.filter((item) => item !== tag).join(", "),
                    )
                  }
                />
              ))}
            </View>
          </View>
        </OptionalFormSection>
        {/* 예약은 결국 "어디를 몇 시에 가느냐" 라 장소와 한 몸이다. 따로 적게
            두면 같은 가게를 장소로 한 번, 예약으로 또 한 번 쓰게 된다. */}
        <OptionalFormSection
          label="예약"
          summary={
            reservationOn
              ? [dayTextOf(reservationDraft.date), reservationDraft.time || "시간 미정", reservationDraft.people]
                  .filter(Boolean)
                  .join(" · ")
              : "예약해 둔 곳이면 여기에 함께 적어 두세요"
          }
          open={reservationOn}
          onToggle={toggleReservation}
          switchLabel={(open) => (open ? "예약 있어요" : "예약 없어요")}
        >
          <OptionField
            label="예약 날짜"
            options={dayOptions}
            labelOf={dayTextOf}
            value={reservationDraft.date}
            onChange={(date) => setReservationDraft((current) => ({ ...current, date }))}
          />
          <TimeRow
            label="예약 시간 (선택)"
            value={reservationDraft.time}
            onChange={(time) => setReservationDraft((current) => ({ ...current, time }))}
            fallback="19:00"
            optional
          />
          <DetailField
            label="인원 (선택)"
            maxLength={20}
            value={reservationDraft.people}
            onChangeText={(people) => setReservationDraft((current) => ({ ...current, people }))}
            placeholder="예: 2명"
            returnKeyType="next"
            onSubmitEditing={() => reservationLinkRef.current?.focus()}
          />
          <OptionField
            label="예약 상태"
            options={["예약 확정", "확인 필요", "취소"]}
            value={reservationDraft.status}
            onChange={(status) => setReservationDraft((current) => ({ ...current, status: status as ReservationInfo["status"] }))}
          />
          <DetailField
            label="예약 링크 (선택)"
            value={reservationDraft.bookingUrl ?? ""}
            onChangeText={(bookingUrl) => setReservationDraft((current) => ({ ...current, bookingUrl }))}
            placeholder="https://"
            keyboardType="url"
            autoCapitalize="none"
            autoComplete="url"
            textContentType="URL"
            maxLength={2048}
            inputRef={reservationLinkRef}
            returnKeyType="done"
            onSubmitEditing={() => placeFormValid && savePlace()}
          />
          {Boolean(reservationDraft.bookingUrl?.trim()) && !safeUrl(reservationDraft.bookingUrl) && (
            <Text style={[공용스타일.linkState, { color: naverInk(Boolean(theme?.dark)) }]}>https:// 로 시작하는 링크만 저장돼요</Text>
          )}
          <DetailField
            label="예약 메모 (선택)"
            value={reservationDraft.place}
            onChangeText={(place) => setReservationDraft((current) => ({ ...current, place }))}
            multiline
            maxLength={2000}
            placeholder="예: 창가 자리로 부탁드림"
          />
          <OptionField
            label="여행 일정 표시"
            options={["일정에도 표시", "예약 정보만 저장"]}
            value={reservationDraft.showInSchedule ? "일정에도 표시" : "예약 정보만 저장"}
            onChange={(value) => setReservationDraft((current) => ({ ...current, showInSchedule: value === "일정에도 표시" }))}
          />
        </OptionalFormSection>
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="장소 목록 붙여넣기"
        subtitle="메모에서 고친 목록을 한 번에 반영해요"
        submit={importMode === "교체" ? "목록 교체" : "목록에 추가"}
        confirmSubmit={
          importMode === "교체" && places.length
            ? `저장한 장소 ${places.length}곳을 삭제하고 붙여넣은 목록으로 바꿔요. 되돌릴 수 없어요.`
            : undefined
        }
        disabledHint={!importText.trim() ? "장소 목록을 입력해 주세요" : undefined}
        submitDisabled={!importText.trim()}
        hasUnsavedChanges={placeImportChanged}
        onClose={() => setImporting(false)}
        onSubmit={importPlaces}
      >
        <DetailField
          label="붙여넣을 장소 목록"
          required
          value={importText}
          onChangeText={setImportText}
          multiline
          maxLength={붙여넣기_한도}
          placeholder="한 줄에 장소 하나씩"
        />
        <OptionField
          label="목록 반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
        <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
          ‘교체’는 현재 목록을 삭제하고 새 목록으로 바꿔요. 붙여넣은 장소는
          ‘저장한 장소’에 추가돼요.
        </Text>
      </DetailSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  // 체크아웃 칸 아래 한 줄. 저장하면 대표 숙소가 어떻게 되는지 미리 말해 준다.
  stayPickerHint: { fontSize: 12, fontFamily: typo.body.family, lineHeight: 18, marginTop: -4, marginBottom: 16 },
  naverCopy: { flex: 1, minWidth: 0 },
  // 한 줄 설명이 들어가는 큰 버튼. 모서리는 안에 N 로고와 두 줄이 들어가는
  // 구역이라 버튼보다 크게 둔다.
  naverAutoFill: {
    minHeight: 높이.저장,
    borderRadius: 모서리.구역,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  naverAutoFillCopy: { flex: 1, minWidth: 0 },
  naverAutoFillTitle: { fontSize: 14, fontFamily: typo.title.family },
  naverAutoFillText: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  naverLinkGuide: {
    borderWidth: 1,
    borderRadius: 모서리.구역,
    backgroundColor: "#EAF7F0",
    padding: 12,
    marginBottom: 14,
  },
  naverLinkActions: { flexDirection: "row", gap: 8 },
  naverLinkButton: {
    flex: 1,
    height: 높이.버튼,
    borderRadius: 모서리.버튼,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  naverLinkButtonPrimary: { backgroundColor: "#03C75A" },
  naverLinkButtonText: { color: "#16844E", fontSize: 13, fontFamily: typo.label.family },
  naverLinkButtonPrimaryText: { color: "#FFFFFF" },
  naverConnected: {
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  naverConnectedCopy: { flexDirection: "row", alignItems: "center", gap: 6 },
  naverConnectedText: { color: "#16844E", fontSize: 12, fontFamily: typo.label.family },
  naverDisconnectText: { fontSize: 11, fontFamily: typo.caption.family },
  placeList: { gap: 8 },
  placeSearchInput: { flex: 1, fontSize: 12 },
  resultCount: {
    minWidth: 25,
    height: 25,
    borderRadius: 모서리.상자,
    backgroundColor: "#F0EDFF",
    alignItems: "center",
    justifyContent: "center",
  },
  resultCountText: { fontSize: 14, fontFamily: typo.data.family },
  placeTags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 },
  placeTagText: { fontSize: 12, fontFamily: typo.label.family },
  planPlaceSummary: {
    borderRadius: 모서리.구역,
    backgroundColor: "#E9E5FF",
    padding: 16,
    marginBottom: 20,
  },
  planPlaceName: { fontSize: 18, lineHeight: 25, fontFamily: typo.title.family },
  planPlaceMeta: {
    fontSize: 11,
    fontFamily: typo.caption.family,
    marginTop: 4,
  },
  placeControlPanel: {
    borderWidth: 1,
    borderRadius: 모서리.행,
    padding: 8,
    marginBottom: 12,
  },
  // 옆의 가로 스크롤이 자리를 다 가져가지 않도록 줄어들지 않게 둔다.
  placeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 6,
  },
  // 칩이 다섯이라 좁은 화면에서는 한 줄에 다 들어가지 않는다. 밀려 잘리느니 접는다.
  placeFilters: { flex: 1 },
  placeSearch: {
    height: 높이.버튼,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  tagFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  placeTag: { borderRadius: 모서리.표식, paddingHorizontal: 6, paddingVertical: 4 },
  placeMiniCard: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    position: "relative",
  },
  placeMiniTop: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  placeMiniInfo: { flex: 1, minWidth: 0 },
  placeMiniTitleRow: { flexDirection: "row", alignItems: "center" },
  placeMiniName: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: typo.title.family },
  placeMiniStatus: { height: 21, borderRadius: 모서리.상자, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", marginLeft: 6 },
  /** 제목 줄 오른쪽의 할 일. 배지와 같은 자리에 놓여 배지보다 조금 크다. 손가락 자리는 hitSlop 으로 채운다. */
  placeMiniAction: { height: 28, borderRadius: 모서리.원, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  placeMiniActionText: { fontSize: 12, fontFamily: typo.label.family },
  placeMiniStatusText: { fontSize: 12, fontFamily: typo.label.family },
  placeMiniMeta: { flexShrink: 1, fontSize: 11, fontFamily: typo.caption.family },
  placeMiniMemo: { fontSize: 12, fontFamily: typo.body.family, marginTop: 4 },
  // 예약 배지는 줄 하나를 통째로 쓰지 않는다. 글자만큼만 차지하게 왼쪽에 붙인다.
  placeMiniBooking: { alignSelf: "flex-start", height: 21, borderRadius: 모서리.상자, paddingHorizontal: 6, justifyContent: "center", marginTop: 4 },
  placeMiniBookingText: { fontSize: 12, fontFamily: typo.label.family },
  placeMiniMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  placeMiniMapButton: { height: 28, borderRadius: 모서리.상자, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  placeMiniMapText: { fontSize: 12, fontFamily: typo.label.family },
});
