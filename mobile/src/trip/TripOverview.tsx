import { useContext, useMemo, useState } from "react";
import { Chip } from "../ui/Chip";
import {
  PLAN_TYPES,
  mergeStayDateTime,
  orderedScheduleItems,
  photosByTarget,
  placeAreaFromAddress,
  reservationScheduleRow,
  stayMomentOf,
  transportScheduleRow,
  기본_체크아웃_시각,
  기본_체크인_시각,
  일정종류_읽기,
  일정종류인가,
  자리에_넣기,
  type MemoryPhoto,
  type PlaceItem,
  type Recipe,
  type ReservationInfo,
  type ScheduleItem,
  type StayInfo,
  type Transportation,
} from "../tripPlanning";
import { dayNumberOfKey, dayTextOf, weekdayOfKey, 시각을_분으로 } from "../dates";
import { planned, safeUrl, unplanned } from "../placeSync";
import {
  ALL_DAYS,
  defaultScheduleDay,
  groupScheduleByDay,
  highlightedGroupIndex,
  scheduleDayCounts,
  scheduleOfDay,
} from "../scheduleDays";
import { type TransportStop } from "../bookingSync";
import { maskClockTime, settleClockTime } from "../clock";
import { photosOfStay } from "../photoSync";

import {
  type Expense,
  expenseFromTransport,
  parseAmount,
  amountText,
  currencyOf,
  money,
  transportExpenseOf,
} from "../tripExpenses";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, TextInput } from "../AppText";
import { Glyph } from "../Glyph";
import { showAlert } from "../showAlert";
import { 높이, 모서리, 아이콘, 그림자, 여백, 누름여유, 글자누름여유 } from "../theme/controls";
import { typo } from "../theme/typography";
import { naverInk } from "../theme/colors";
import { mapProviderName, mapProviderOf } from "../mapLinks";
import { 공용스타일 } from "./styles";
import {
  DetailEditableContext,
  DetailFeedbackContext,
  DetailField,
  DetailSheet,
  DetailThemeContext,
  EmptyState,
  InfoLine,
  InfoPanel,
  Moment,
  NO_PHOTOS,
  OptionField,
  OptionalFormSection,
  PairedDetailField,
  PhotoStrip,
  SectionLabel,
  StayRangePicker,
  TabActionHeader,
  TimeRow,
  TransportCard,
  TravelInfoRow,
  TravelMiniCard,
  ViewMode,
  newPlaceId,
  useOrderWarning,
  금액_치기,
  금액_키보드,
} from "./parts";

/** 여행 상세의 「일정」 탭. 날짜별 일정과 교통편·숙소·예약을 한 곳에서 본다. */

export function TripOverview({
  setMode,
  schedule,
  setSchedule,
  places,
  setPlaces,
  hasKitchen,
  registeredStay,
  setRegisteredStay,
  reservations,
  setReservations,
  transportations,
  setTransportations,
  expenses,
  setExpenses,
  currency,
  participants,
  recipes,
  packingRemaining,
  photos,
  dayOptions,
  dateOptions,
  todayDay,
  openScheduleOnMount,
  onOpenPlaceForReservation,
}: {
  setMode: (mode: ViewMode) => void;
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  places: PlaceItem[];
  setPlaces: React.Dispatch<React.SetStateAction<PlaceItem[]>>;
  hasKitchen: boolean;
  registeredStay: StayInfo;
  setRegisteredStay: React.Dispatch<React.SetStateAction<StayInfo>>;
  reservations: ReservationInfo[];
  setReservations: React.Dispatch<React.SetStateAction<ReservationInfo[]>>;
  transportations: Transportation[];
  setTransportations: React.Dispatch<React.SetStateAction<Transportation[]>>;
  /** 비용 탭의 지출. 교통편에 적은 금액을 지출로 넣고, 이미 넣었는지도 여기서 본다. */
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  /** 여행 통화. 교통편 금액 칸의 자릿수와 표기에 쓴다. */
  currency: string;
  /** 이번 여행에 가는 사람. 교통편 이용자를 여기서 고른다. */
  participants: string[];
  /** 요리 카드가 무엇을 가리킬지는 실제 메뉴에서 가져온다. */
  recipes: Recipe[];
  /** 아직 안 챙긴 준비물 수. 0 이면 재촉할 것이 없다. */
  packingRemaining: number;
  /** 기록 탭의 사진. 일정 줄과 숙소가 자기 사진을 여기서 고른다. */
  photos: MemoryPhoto[];
  dayOptions: string[];
  dateOptions: string[];
  /** 오늘이 여행 기간 안이면 그 날. 아니면 빈 문자열이다. */
  todayDay: string;
  openScheduleOnMount?: boolean;
  /**
   * 장소 탭의 장소 시트를 예약 칸이 펼쳐진 채로 열어 달라고 부탁한다.
   *
   * 예약은 장소 안에서 적으니 「예약 추가」는 장소를 먼저 고르는 일이 된다.
   * `null` 을 주면 새 장소부터 만든다.
   */
  onOpenPlaceForReservation: (placeId: string | null) => void;
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const canEdit = useContext(DetailEditableContext);
  const [sheet, setSheet] = useState<
    "schedule" | "reservation" | "reservationPlace" | "stay" | "transport" | null
  >(openScheduleOnMount ? "schedule" : null);
  const [fullSchedule, setFullSchedule] = useState(false);
  // 전체 일정에서 보고 있는 날. 여행 중이면 오늘로 열린다.
  const [scheduleDay, setScheduleDay] = useState(() => defaultScheduleDay(dayOptions, todayDay));
  const [editingScheduleIndex, setEditingScheduleIndex] = useState<number | null>(null);
  const defaultPlanDay = dayOptions[Math.min(1, dayOptions.length - 1)];
  const firstDay = dayOptions[0];
  const lastDay = dayOptions[dayOptions.length - 1];
  const firstDate = dateOptions[0];
  const lastDate = dateOptions[dateOptions.length - 1];
  const [planDay, setPlanDay] = useState(defaultPlanDay);
  const [planType, setPlanType] = useState(PLAN_TYPES[0]);
  const [planTime, setPlanTime] = useState("11:00");
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [planPlace, setPlanPlace] = useState("");
  const [planMapUrl, setPlanMapUrl] = useState("");
  const [selectedPlanPlaceId, setSelectedPlanPlaceId] = useState<string | null>(null);
  const [scheduleDetailsOpen, setScheduleDetailsOpen] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState<Transportation | null>(null);
  const [transportOwner, setTransportOwner] = useState(participants[0] ?? "");
  const [transportDirection, setTransportDirection] = useState<Transportation["direction"]>("가는 편");
  const [transportMethod, setTransportMethod] = useState<Transportation["method"]>("KTX");
  const [transportDate, setTransportDate] = useState(firstDay);
  const [transportDeparture, setTransportDeparture] = useState("");
  const [transportDepartureTime, setTransportDepartureTime] = useState("");
  const [transportArrival, setTransportArrival] = useState("");
  const [transportArrivalTime, setTransportArrivalTime] = useState("");
  const [transportStatus, setTransportStatus] = useState<Transportation["status"]>("예매 완료");
  const [transportShowInSchedule, setTransportShowInSchedule] = useState(true);
  const [transportNote, setTransportNote] = useState("");
  /** 갈아타는 곳. 「＋ 갈아타는 곳」으로 늘리고 ×로 지운다. */
  const [transportStops, setTransportStops] = useState<TransportStop[]>([]);
  // 표값. 교통편에는 저장하지 않고 비용 탭의 지출로만 남는다. 고칠 때는 그 지출의 금액이 여기 온다.
  const [transportAmount, setTransportAmount] = useState("");
  const [transportDetailsOpen, setTransportDetailsOpen] = useState(false);
  const [editingTransportId, setEditingTransportId] = useState<string | null>(null);
  const transportUnit = currencyOf(currency);
  const transportAmountNumber = parseAmount(transportAmount, transportUnit.fraction);
  /** 고치는 중인 교통편에서 만든 지출. 있으면 저장할 때 다시 묻지 않고 금액만 맞춘다. */
  const linkedTransportExpense = editingTransportId ? transportExpenseOf(expenses, editingTransportId) : undefined;
  const transportDraft = {
    owner: transportOwner,
    direction: transportDirection,
    method: transportMethod,
    date: transportDate,
    departure: transportDeparture,
    departureTime: transportDepartureTime,
    arrival: transportArrival,
    arrivalTime: transportArrivalTime,
    status: transportStatus,
    showInSchedule: transportShowInSchedule,
    note: transportNote,
    stops: transportStops,
    amount: transportAmount,
  };
  const [transportDraftBaseline, setTransportDraftBaseline] = useState(() =>
    JSON.stringify(transportDraft),
  );
  const blankReservation = (id = newPlaceId()): ReservationInfo => ({
    id,
    name: "",
    date: defaultPlanDay,
    time: "19:00",
    people: "2명",
    status: "예약 확정",
    place: "",
    bookingUrl: "",
    showInSchedule: true,
  });
  const [reservationDraft, setReservationDraft] = useState<ReservationInfo>(() =>
    reservations[0] ?? blankReservation("reservation-draft"),
  );
  const [reservationDraftBaseline, setReservationDraftBaseline] = useState(() =>
    JSON.stringify(reservations[0] ?? blankReservation("reservation-draft")),
  );
  const [editingReservationId, setEditingReservationId] = useState<string | null>(null);
  const editingReservation = editingReservationId !== null;
  // 예약·숙소 시트의 「더 적기」가 펼쳐져 있는지. 열 때 값이 있으면 켜서 연다.
  const [reservationExtrasOpen, setReservationExtrasOpen] = useState(false);
  const [stayAddressOpen, setStayAddressOpen] = useState(false);
  const [stayDraft, setStayDraft] = useState(registeredStay);
  const hasStay = Boolean(registeredStay.name);
  // 묵는 동안의 날짜 키. 숙소는 아직 `10월 1일 14:00` 로 날을 들고 있어 날짜 칸에서 자리를 찾는다.
  const stayDayKeys = useMemo(() => {
    const first = dateOptions.findIndex((date) => registeredStay.checkin.startsWith(date));
    if (first < 0) return [];
    const last = dateOptions.findIndex((date) => registeredStay.checkout.startsWith(date));
    return dayOptions.slice(first, last < 0 ? dayOptions.length : last + 1);
  }, [dateOptions, dayOptions, registeredStay.checkin, registeredStay.checkout]);
  // 숙소에 붙인 사진과 그동안 찍은 사진. "숙소 글을 누르면 그날 사진이 보인다"(요구사항 7).
  const stayPhotos = useMemo(
    () => photosOfStay(photos, registeredStay.id, stayDayKeys),
    [photos, registeredStay.id, stayDayKeys],
  );
  // 일정 줄마다 사진 목록을 훑지 않으려고 한 번에 표로 만든다(2026-09-23 검토 #13).
  const photosBySchedule = useMemo(() => photosByTarget(photos, "schedule"), [photos]);
  const scheduleDraftKey = (
    day: string,
    type: string,
    time: string,
    title: string,
    place: string,
    mapUrl: string,
    placeId: string | null,
  ) => JSON.stringify([day, type, time, title, place, mapUrl, placeId]);
  const [scheduleDraftBaseline, setScheduleDraftBaseline] = useState(
    scheduleDraftKey(defaultPlanDay, "장소", "11:00", "", "", "", null),
  );
  const [stayDraftBaseline, setStayDraftBaseline] = useState(JSON.stringify(registeredStay));
  const scheduleDraftChanged = scheduleDraftKey(
    planDay,
    planType,
    planTime,
    newPlanTitle,
    planPlace,
    planMapUrl,
    selectedPlanPlaceId,
  ) !== scheduleDraftBaseline;
  const stayDraftChanged = JSON.stringify(stayDraft) !== stayDraftBaseline;
  const reservationDraftChanged = JSON.stringify(reservationDraft) !== reservationDraftBaseline;
  const transportDraftChanged = JSON.stringify(transportDraft) !== transportDraftBaseline;
  const orderedSchedule = useMemo(
    () => orderedScheduleItems(schedule, dayOptions),
    [dayOptions, schedule],
  );
  const scheduleGroups = useMemo(() => groupScheduleByDay(orderedSchedule), [orderedSchedule]);
  // 여행 중이면 요약 카드도 오늘부터 보여 준다. 여행 중이 아니면 가장 빠른 날이다.
  const leadSchedule = scheduleGroups[highlightedGroupIndex(scheduleGroups, dayOptions, todayDay)];
  // 타임라인 카드가 실제로 그리는 개수. 앞 묶음의 앞 세 개다.
  const shownScheduleCount = Math.min(3, leadSchedule?.items.length ?? 0);
  // 앞에 보여 주는 묶음이 반드시 1일차는 아니다. 몇째 날인지 세어 적는다.
  const firstScheduleDayLabel = (() => {
    const index = leadSchedule ? dayOptions.indexOf(leadSchedule.date) : -1;
    if (leadSchedule && leadSchedule.date === todayDay) return "오늘";
    return index < 0 ? "가장 빠른 일정" : `${["첫", "둘", "셋", "넷", "다섯"][index] ?? `${index + 1}`}째 날`;
  })();
  const scheduleDayChips = useMemo(
    () => scheduleDayCounts(orderedSchedule, dayOptions),
    [dayOptions, orderedSchedule],
  );
  const visibleSchedule = useMemo(
    () => scheduleOfDay(orderedSchedule, scheduleDay),
    [orderedSchedule, scheduleDay],
  );
  const visibleScheduleGroups = useMemo(() => groupScheduleByDay(visibleSchedule), [visibleSchedule]);
  const scheduleFormValid = Boolean(newPlanTitle.trim());
  const transportRouteValid = Boolean(
    transportDeparture.trim() &&
    transportArrival.trim() &&
    transportDeparture.trim() !== transportArrival.trim(),
  );
  const transportTimesValid = Boolean(transportDepartureTime.trim()) === Boolean(transportArrivalTime.trim());
  /**
   * 도착이 출발보다 빠른지. **막지는 않는다** — 밤 버스(23:30 → 05:40)처럼 날을
   * 넘겨 가는 편이 있고, 교통편은 날짜를 하나만 들고 있어 앱이 둘을 가릴 수 없다.
   * 알리기만 하고 판단은 사람에게 맡긴다.
   */
  const transportTimeOrderOk = (() => {
    const 출발 = 시각을_분으로(transportDepartureTime);
    const 도착 = 시각을_분으로(transportArrivalTime);
    return 출발 === null || 도착 === null || 도착 > 출발;
  })();
  useOrderWarning(
    sheet === "transport",
    transportTimeOrderOk,
    "도착이 출발보다 빨라요",
    "밤을 넘겨 가는 편이면 그대로 두셔도 돼요.",
  );
  const transportFormValid = transportRouteValid && transportTimesValid;
  const transportSubmitLabel = editingTransportId ? "저장" : "교통편 추가";
  const transportDisabledHint = transportFormValid
    ? undefined
    : !transportDeparture.trim() || !transportArrival.trim()
      ? "출발지와 도착지를 입력해 주세요"
      : transportDeparture.trim() === transportArrival.trim()
        ? "출발지와 도착지를 다르게 입력해 주세요"
        : "출발·도착 시간을 모두 입력해 주세요";
  const stayRangeValid = stayMomentOf(stayDraft.checkout, dateOptions) > stayMomentOf(stayDraft.checkin, dateOptions);
  const stayFormValid = Boolean(stayDraft.name.trim()) && stayRangeValid;
  useOrderWarning(sheet === "stay", stayRangeValid, "체크아웃이 체크인보다 빨라요", "체크아웃을 체크인 뒤로 옮겨 주세요.");
  const transportDirectionColor = transportDirection === "가는 편"
    ? theme?.primary ?? "#FF6B63"
    : theme?.secondary ?? "#55BFB4";
  const transportDirectionSoft = transportDirection === "가는 편"
    ? theme?.primarySoft ?? "#FFF0ED"
    : `${transportDirectionColor}18`;
  const switchTransportDirection = () => {
    const nextDirection = transportDirection === "가는 편" ? "오는 편" : "가는 편";
    setTransportDirection(nextDirection);
    setTransportDate(nextDirection === "가는 편" ? firstDay : lastDay);
    setTransportDeparture(transportArrival);
    setTransportArrival(transportDeparture);
    setTransportDepartureTime(transportArrivalTime);
    setTransportArrivalTime(transportDepartureTime);
  };
  const addSchedule = () => {
    if (!newPlanTitle.trim()) return;
    const wasEditing = editingScheduleIndex !== null;
    // 예약·교통편·숙소에서 만들어진 일정은 그 연결을 그대로 들고 가야 한다.
    // 하나라도 떨어뜨리면 동기화가 이 줄을 남남으로 보고 원래대로 되돌린다.
    const edited = editingScheduleIndex === null ? undefined : schedule[editingScheduleIndex];
    const next: ScheduleItem = {
        // 고칠 때는 원래 id 를 지킨다. 숙소·예약·교통편에서 만든 줄은 서버에 따로 두지 않아 id 가 없다.
        id: edited ? edited.id : newPlaceId(),
        time: `${weekdayOfKey(planDay)} · ${planTime || "시간 미정"}`,
        date: planDay,
        title: newPlanTitle.trim(),
        note: [planType, planPlace.trim()].filter(Boolean).join(" · "),
        mapUrl: planMapUrl.trim(),
        placeId: selectedPlanPlaceId ?? undefined,
        reservationId: edited?.reservationId,
        transportationId: edited?.transportationId,
        stayId: edited?.stayId,
      };
    const nextSchedule = editingScheduleIndex === null
      ? [...schedule, next]
      : schedule.map((item, index) => index === editingScheduleIndex ? next : item);
    setSchedule(nextSchedule);
    setPlaces((current) => current.map((place) => ({
      ...place,
      status: nextSchedule.some((item) => item.placeId === place.id) ? planned(place.status) : place.status,
    })));
    setNewPlanTitle("");
    setPlanPlace("");
    setPlanMapUrl("");
    setSelectedPlanPlaceId(null);
    setEditingScheduleIndex(null);
    setSheet(null);
    if (!wasEditing) setFullSchedule(true);
    notify(wasEditing ? "일정을 수정했어요" : "일정을 추가했어요");
  };
  const openScheduleCreate = () => {
    setScheduleDraftBaseline(scheduleDraftKey(
      defaultPlanDay,
      PLAN_TYPES[0],
      "11:00",
      "",
      "",
      "",
      null,
    ));
    setEditingScheduleIndex(null);
    setNewPlanTitle("");
    setPlanPlace("");
    setPlanMapUrl("");
    setSelectedPlanPlaceId(null);
    setPlanDay(defaultPlanDay);
    setPlanType(PLAN_TYPES[0]);
    setPlanTime("11:00");
    setScheduleDetailsOpen(false);
    setSheet("schedule");
  };
  const openScheduleEdit = (item: ScheduleItem, index: number) => {
    if (item.transportationId) {
      const linkedTransportation = transportations.find(
        (transportation) => transportation.id === item.transportationId,
      );
      if (linkedTransportation) {
        openTransportEdit(linkedTransportation);
        return;
      }
    }
    if (item.reservationId) {
      const linkedReservation = reservations.find((reservation) => reservation.id === item.reservationId);
      if (linkedReservation) {
        openReservation(linkedReservation);
        return;
      }
    }
    // 숙소 체크인 줄은 숙소에서 만들어진다. 일정으로 고치면 저장하자마자
    // 숙소 쪽 값으로 되돌아가니, 고칠 수 있는 자리로 보낸다.
    if (item.stayId) {
      openStay();
      return;
    }
    const [day = "토", time = "11:00"] = item.time.split("·").map((value) => value.trim());
    const [savedType = "장소", ...savedPlace] = item.note.split("·").map((value) => value.trim());
    const nextDay = item.date ?? dayOptions.find((value) => weekdayOfKey(value) === day) ?? defaultPlanDay;
    const nextType = 일정종류인가(savedType) ? 일정종류_읽기(savedType) : PLAN_TYPES[0];
    const nextPlace = savedPlace.length ? savedPlace.join(" · ") : (일정종류인가(savedType) ? "" : item.note);
    setScheduleDraftBaseline(scheduleDraftKey(
      nextDay,
      nextType,
      time,
      item.title,
      nextPlace,
      item.mapUrl,
      item.placeId ?? null,
    ));
    setEditingScheduleIndex(index);
    setPlanDay(nextDay);
    setPlanTime(time);
    setPlanType(nextType);
    setNewPlanTitle(item.title);
    setPlanPlace(nextPlace);
    setPlanMapUrl(item.mapUrl);
    setSelectedPlanPlaceId(item.placeId ?? null);
    setScheduleDetailsOpen(Boolean(nextPlace || item.mapUrl));
    setSheet("schedule");
  };
  const chooseSavedPlace = (place: PlaceItem) => {
    setSelectedPlanPlaceId(place.id);
    setNewPlanTitle(place.name);
    setPlanPlace(place.address || place.area);
    setPlanMapUrl(place.mapUrl);
    setPlanType(place.category === "식당" || place.category === "카페" ? "식사" : PLAN_TYPES[0]);
    setScheduleDetailsOpen(Boolean(place.address || place.area || place.mapUrl));
  };
  const deleteSchedule = () => {
    if (editingScheduleIndex === null) return;
    const target = schedule[editingScheduleIndex];
    const linkedReservationId = target?.reservationId;
    const linkedTransportationId = target?.transportationId;
    const linkedStayId = target?.stayId;
    // 되돌릴 때 함께 바꾼 것까지 그대로 돌리려고, 바꾸기 전 모습을 들고 있는다.
    const 지운_자리 = editingScheduleIndex;
    const 전_장소 = target?.placeId ? places.find((place) => place.id === target.placeId)?.status : undefined;
    const 전_숙소_보임 = registeredStay.showInSchedule;
    setSchedule((current) => current.filter((_, index) => index !== editingScheduleIndex));
    // 같은 장소를 가리키는 줄이 또 있으면 그 장소는 아직 일정에 있다. 다녀온
    // 곳은 일정에서 빠져도 다녀온 채로 둔다.
    const stillPlanned = schedule.some(
      (item, index) => index !== editingScheduleIndex && item.placeId === target?.placeId,
    );
    if (target?.placeId && !stillPlanned) {
      setPlaces((current) => current.map((place) =>
        place.id === target.placeId ? { ...place, status: unplanned(place.status) } : place,
      ));
    }
    if (linkedReservationId) {
      setReservations((current) => current.map((reservation) =>
        reservation.id === linkedReservationId
          ? { ...reservation, showInSchedule: false }
          : reservation,
      ));
    }
    if (linkedTransportationId) {
      setTransportations((current) => current.map((item) =>
        item.id === linkedTransportationId
          ? { ...item, showInSchedule: false }
          : item,
      ));
    }
    if (linkedStayId) {
      setRegisteredStay((current) => ({ ...current, showInSchedule: false }));
    }
    setEditingScheduleIndex(null);
    setSheet(null);
    // 삭제 되돌리기. 서버로 나간 삭제는 되돌릴 때 같은 id 로 다시 만들어져 되살아난다
    // (서버가 만들 id 를 앱이 정한다). 사진 연결처럼 서버가 함께 끊는 것은 돌아오지
    // 않는다 — 5초 안에 되돌리는 일이라 실제로 부딪힐 일은 드물다(2026-09-23).
    notify("일정을 삭제했어요", !target ? undefined : {
      label: "되돌리기",
      onPress: () => {
        setSchedule((current) => 자리에_넣기(current, target, 지운_자리));
        if (target.placeId && 전_장소) {
          setPlaces((current) => current.map((place) =>
            place.id === target.placeId ? { ...place, status: 전_장소 } : place));
        }
        if (linkedReservationId) {
          setReservations((current) => current.map((reservation) =>
            reservation.id === linkedReservationId ? { ...reservation, showInSchedule: true } : reservation));
        }
        if (linkedTransportationId) {
          setTransportations((current) => current.map((item) =>
            item.id === linkedTransportationId ? { ...item, showInSchedule: true } : item));
        }
        if (linkedStayId) setRegisteredStay((current) => ({ ...current, showInSchedule: 전_숙소_보임 }));
        notify("일정을 되돌렸어요");
      },
    });
  };
  const syncTransportationSchedule = (transportation: Transportation) => {
    setSchedule((current) => {
      const linkedIndex = current.findIndex(
        (item) => item.transportationId === transportation.id,
      );
      if (!transportation.showInSchedule) {
        return linkedIndex < 0
          ? current
          : current.filter((item) => item.transportationId !== transportation.id);
      }
      const linked = transportScheduleRow(transportation);
      if (linkedIndex < 0) return [...current, linked];
      return current.map((item, index) => index === linkedIndex ? linked : item);
    });
  };
  const addTransportation = () => {
    if (!transportFormValid) return;
    const next: Transportation = {
      id: editingTransportId ?? newPlaceId(),
      owner: transportOwner,
      direction: transportDirection,
      method: transportMethod,
      date: transportDate,
      departure: transportDeparture.trim(),
      departureTime: transportDepartureTime.trim() || "시간 미정",
      arrival: transportArrival.trim(),
      arrivalTime: transportArrivalTime.trim() || "시간 미정",
      status: transportStatus,
      showInSchedule: transportShowInSchedule,
      note: transportNote.trim(),
      // 이름을 안 적은 줄은 버린다. 「＋ 갈아타는 곳」을 눌러만 두고 만 자리다.
      stops: transportStops
        .map((stop) => ({ name: stop.name.trim(), time: stop.time?.trim() || undefined }))
        .filter((stop) => stop.name.length > 0),
    };
    setTransportDraftBaseline(JSON.stringify(transportDraft));
    /** 교통편을 실제로 저장한다. 지출을 어떻게 했는지에 따라 알림 말만 다르다. */
    const saveTransport = (expenseNote: "없음" | "추가" | "금액 수정") => {
      if (editingTransportId) {
        setTransportations((current) => current.map((item) => item.id === editingTransportId ? next : item));
        syncTransportationSchedule(next);
        setEditingTransportId(null);
        setTransportDeparture("");
        setTransportDepartureTime("");
        setTransportArrival("");
        setTransportArrivalTime("");
        setTransportNote("");
        setTransportAmount("");
        setSheet(null);
        notify(
          expenseNote === "추가"
            ? "교통편을 수정하고 지출을 추가했어요"
            : expenseNote === "금액 수정"
              ? "교통편과 지출 금액을 수정했어요"
              : "교통편을 수정했어요",
        );
        return;
      }
      setTransportations((current) => [...current, next]);
      syncTransportationSchedule(next);
      if (transportDirection === "가는 편") {
        showAlert(
          "가는 편을 추가했어요",
          "오는 편도 추가할까요?",
          [
            {
              text: "나중에",
              style: "cancel",
              onPress: () => {
                setTransportDeparture("");
                setTransportDepartureTime("");
                setTransportArrival("");
                setTransportArrivalTime("");
                setTransportNote("");
                setTransportAmount("");
                setSheet(null);
              },
            },
            {
              text: "오는 편 추가",
              onPress: () => {
                setTransportDraftBaseline(JSON.stringify({
                  owner: next.owner,
                  direction: "오는 편",
                  method: next.method,
                  date: lastDay,
                  departure: next.arrival,
                  departureTime: "",
                  arrival: next.departure,
                  arrivalTime: "",
                  status: next.status,
                  showInSchedule: next.showInSchedule,
                  note: "",
                  amount: "",
                }));
                setTransportDirection("오는 편");
                setTransportNote("");
                setTransportAmount("");
                setTransportDate(lastDay);
                setTransportDeparture(next.arrival);
                setTransportArrival(next.departure);
                setTransportDepartureTime("");
                setTransportArrivalTime("");
                setSheet("transport");
              },
            },
          ],
        );
      } else {
        setTransportDeparture("");
        setTransportDepartureTime("");
        setTransportArrival("");
        setTransportArrivalTime("");
        setTransportNote("");
        setTransportAmount("");
        setSheet(null);
        notify(expenseNote === "추가" ? "오는 편과 지출을 추가했어요" : "오는 편을 추가했어요");
      }
    };
    // 금액을 적었으면 비용 탭에도 넣는다. 이 교통편에서 만든 지출이 이미 있으면 그 금액만
    // 맞춘다. 다시 저장할 때마다 지출을 또 만들면 정산이 두 배가 된다.
    const linked = transportExpenseOf(expenses, next.id);
    if (transportAmountNumber <= 0) {
      saveTransport("없음");
      return;
    }
    if (linked) {
      if (linked.amount === transportAmountNumber) {
        saveTransport("없음");
        return;
      }
      setExpenses((current) => current.map((item) => (
        item.id === linked.id ? { ...item, amount: transportAmountNumber } : item
      )));
      saveTransport("금액 수정");
      return;
    }
    // 낸 사람은 타는 사람, 몫은 본인 부담이다. 번호는 값을 바꾸는 안에서 새로 딴다.
    const draft = expenseFromTransport(next, transportAmountNumber, participants, "");
    showAlert(
      "비용에도 지출로 추가할까요?",
      `${draft.title} ${money(draft.amount, currency)} · ${draft.payer} 본인 부담으로 들어가요. 몫은 비용 탭에서 바꿀 수 있어요.`,
      [
        { text: "교통편만 저장", style: "cancel", onPress: () => saveTransport("없음") },
        {
          text: "지출 추가",
          onPress: () => {
            setExpenses((current) => [...current, { ...draft, id: newPlaceId() }]);
            saveTransport("추가");
          },
        },
      ],
    );
  };
  // 교통편 카드는 사람마다 한 장이다. 참가자에서 빠진 사람이 예매해 둔 편도
  // 사라지면 안 되니, 실제로 적힌 이용자를 뒤에 붙인다.
  const transportOwners = useMemo(() => {
    const extra = transportations
      .map((item) => item.owner)
      .filter((owner) => owner && !participants.includes(owner));
    return [...participants, ...new Set(extra)];
  }, [participants, transportations]);
  /** 카드 차례. 참가자 차례대로 묶고, 한 사람 안에서는 가는 편이 먼저다. */
  const transportLegs = useMemo(() => {
    const 차례 = (leg: Transportation) => (leg.direction === "가는 편" ? 0 : 1);
    const 사람들 = [...transportOwners, ""];
    return 사람들.flatMap((owner, ownerIndex) =>
      transportations
        .filter((leg) => (leg.owner || "") === owner)
        .sort((a, b) => 차례(a) - 차례(b))
        .map((leg) => ({ leg, ownerIndex })),
    );
  }, [transportOwners, transportations]);
  const transportColors = [
    theme?.secondary ?? "#55BFB4",
    theme?.accent ?? "#8B7CF6",
    theme?.primary ?? "#3F4C8F",
  ];
  const openTransportCreate = () => {
    const nextDraft = {
      owner: participants[0] ?? "",
      direction: "가는 편" as const,
      method: "KTX" as const,
      date: firstDay,
      departure: "",
      departureTime: "",
      arrival: "",
      arrivalTime: "",
      status: "예매 완료" as const,
      showInSchedule: true,
      note: "",
      stops: [] as TransportStop[],
      amount: "",
    };
    setTransportDraftBaseline(JSON.stringify(nextDraft));
    setEditingTransportId(null);
    setTransportStops([]);
    setTransportOwner(nextDraft.owner);
    setTransportDirection("가는 편");
    setTransportMethod(nextDraft.method);
    setTransportDate(firstDay);
    setTransportDeparture("");
    setTransportDepartureTime("");
    setTransportArrival("");
    setTransportArrivalTime("");
    setTransportStatus("예매 완료");
    setTransportShowInSchedule(true);
    setTransportNote("");
    setTransportAmount("");
    setTransportDetailsOpen(false);
    setSheet("transport");
  };
  const openTransportEdit = (item: Transportation) => {
    // 금액은 교통편이 아니라 거기서 만든 지출에 있다. 그 지출의 금액을 칸에 되살린다.
    const linkedAmount = (() => {
      const linked = transportExpenseOf(expenses, item.id);
      return linked ? amountText(linked.amount, transportUnit.fraction) : "";
    })();
    const nextDraft = {
      owner: item.owner,
      direction: item.direction,
      method: item.method,
      date: item.date,
      departure: item.departure,
      departureTime: item.departureTime === "시간 미정" ? "" : item.departureTime,
      arrival: item.arrival,
      arrivalTime: item.arrivalTime === "시간 미정" ? "" : item.arrivalTime,
      status: item.status,
      showInSchedule: item.showInSchedule,
      note: item.note ?? "",
      stops: item.stops ?? [],
      amount: linkedAmount,
    };
    setTransportDraftBaseline(JSON.stringify(nextDraft));
    setEditingTransportId(item.id);
    setTransportOwner(item.owner);
    setTransportDirection(item.direction);
    setTransportMethod(item.method);
    setTransportDate(item.date);
    setTransportDeparture(item.departure);
    setTransportDepartureTime(item.departureTime === "시간 미정" ? "" : item.departureTime);
    setTransportArrival(item.arrival);
    setTransportArrivalTime(item.arrivalTime === "시간 미정" ? "" : item.arrivalTime);
    setTransportStatus(item.status);
    setTransportShowInSchedule(item.showInSchedule);
    setTransportNote(item.note ?? "");
    setTransportStops(item.stops ?? []);
    setTransportAmount(linkedAmount);
    setTransportDetailsOpen(
      Boolean(item.note) || Boolean(linkedAmount) || item.owner !== participants[0] || item.status !== "예매 완료" || !item.showInSchedule,
    );
    // 상세 창(InfoPanel)과 수정 시트는 형제 Modal 이다. 같은 프레임에 하나를 닫고 하나를
    // 열면 iOS 가 뒤엣것을 세우지 못해 창이 그냥 닫혀 버렸다. 상세 창이 열려 있으면
    // 먼저 닫고, 내려가는 시간을 준 뒤에 수정 시트를 연다.
    if (selectedTransport) {
      setSelectedTransport(null);
      setTimeout(() => setSheet("transport"), Platform.OS === "ios" ? 380 : 0);
    } else {
      setSheet("transport");
    }
  };
  const deleteTransportation = () => {
    const 자리 = transportations.findIndex((item) => item.id === editingTransportId);
    if (자리 < 0) return;
    const target = transportations[자리];
    // 교통편을 지우면 그 교통편이 만든 일정 줄도 함께 사라진다. 되돌릴 때 둘 다 돌린다.
    const 딸린_일정 = schedule.flatMap((item, index) =>
      item.transportationId === target.id ? [{ item, index }] : []);
    setTransportations((current) => current.filter((item) => item.id !== target.id));
    setSchedule((current) => current.filter((item) => item.transportationId !== target.id));
    setEditingTransportId(null);
    setSheet(null);
    notify("교통편을 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        setTransportations((current) => 자리에_넣기(current, target, 자리));
        setSchedule((current) => 딸린_일정.reduce((목록, 하나) => 자리에_넣기(목록, 하나.item, 하나.index), current));
        notify("교통편을 되돌렸어요");
      },
    });
  };
  const openReservation = (reservation?: ReservationInfo) => {
    const nextDraft = reservation ?? blankReservation();
    setEditingReservationId(reservation?.id ?? null);
    setReservationDraft(nextDraft);
    setReservationDraftBaseline(JSON.stringify(nextDraft));
    // 적어 둔 것이 있는 칸은 펼친 채로 연다. 접혀 있으면 값이 있는 줄도 모른다.
    setReservationExtrasOpen(Boolean(
      nextDraft.people || nextDraft.place || nextDraft.bookingUrl?.trim() || !nextDraft.showInSchedule,
    ));
    setSheet("reservation");
  };
  /**
   * 목록에서 예약 한 줄을 연다.
   *
   * 장소에 붙은 예약은 그 장소 시트에서 고친다. 같은 예약을 두 곳에서 고칠 수
   * 있게 두면 어느 쪽이 참인지 헷갈린다. 장소에 붙지 않은 옛 예약만 예약
   * 시트로 연다. 그 기록도 잃지 않고 고칠 수 있어야 한다.
   */
  const openLinkedReservation = (reservation: ReservationInfo) => {
    if (reservation.placeId && places.some((place) => place.id === reservation.placeId)) {
      onOpenPlaceForReservation(reservation.placeId);
      return;
    }
    openReservation(reservation);
  };
  const saveReservation = () => {
    if (!reservationDraft.name.trim()) return;
    const next = { ...reservationDraft, name: reservationDraft.name.trim() };
    setReservations((current) => editingReservationId
      ? current.map((reservation) => reservation.id === editingReservationId ? next : reservation)
      : [...current, next]);
    setSchedule((current) => {
      const withoutLinked = current.filter((item) => item.reservationId !== next.id);
      if (!next.showInSchedule) return withoutLinked;
      const linked = reservationScheduleRow(next);
      const previousIndex = current.findIndex((item) => item.reservationId === next.id);
      if (previousIndex < 0) return [...current, linked];
      return current.map((item, index) => index === previousIndex ? linked : item);
    });
    setEditingReservationId(null);
    setSheet(null);
    notify(next.showInSchedule ? "예약을 저장하고 일정에 반영했어요" : "예약 정보를 저장했어요");
  };
  const deleteReservation = () => {
    if (!editingReservationId) return;
    const 자리 = reservations.findIndex((reservation) => reservation.id === editingReservationId);
    const target = 자리 < 0 ? undefined : reservations[자리];
    // 예약이 만든 일정 줄도 함께 사라진다. 되돌릴 때 둘 다 돌린다.
    const 딸린_일정 = schedule.flatMap((item, index) =>
      item.reservationId === editingReservationId ? [{ item, index }] : []);
    setSchedule((current) => current.filter((item) => item.reservationId !== editingReservationId));
    setReservations((current) => current.filter((reservation) => reservation.id !== editingReservationId));
    setEditingReservationId(null);
    setSheet(null);
    notify("예약 정보를 삭제했어요", !target ? undefined : {
      label: "되돌리기",
      onPress: () => {
        setReservations((current) => 자리에_넣기(current, target, 자리));
        setSchedule((current) => 딸린_일정.reduce((목록, 하나) => 자리에_넣기(목록, 하나.item, 하나.index), current));
        notify("예약 정보를 되돌렸어요");
      },
    });
  };
  const openStay = (create = false) => {
    const nextDraft = create
      ? { name: "", checkin: `${firstDate} ${기본_체크인_시각}`, checkout: `${lastDate} ${기본_체크아웃_시각}`, address: "", showInSchedule: true }
      : registeredStay;
    setStayDraftBaseline(JSON.stringify(nextDraft));
    setStayDraft(nextDraft);
    setStayAddressOpen(Boolean(nextDraft.address.trim()));
    setSheet("stay");
  };
  const updateStayDateTime = (
    field: "checkin" | "checkout",
    part: "date" | "time",
    value: string,
  ) => {
    setStayDraft((current) => ({
      ...current,
      [field]: mergeStayDateTime(current[field], part, value, field === "checkin" ? firstDate : lastDate, field === "checkin" ? 기본_체크인_시각 : 기본_체크아웃_시각),
    }));
  };
  const saveStay = () => {
    const previousName = registeredStay.name;
    const linkedPlace = places.find(
      (place) =>
        place.category === "숙소" &&
        (place.id === registeredStay.placeId || place.name === previousName || place.name === stayDraft.name),
    );
    const stayPlaceId = registeredStay.placeId ?? linkedPlace?.id ?? newPlaceId();
    setRegisteredStay({
      ...stayDraft,
      id: registeredStay.id ?? newPlaceId(),
      placeId: stayPlaceId,
      showInSchedule: stayDraft.showInSchedule ?? true,
    });
    setPlaces((current) => {
      const match = current.find(
        (place) =>
          place.category === "숙소" &&
          (place.id === stayPlaceId || place.name === previousName || place.name === stayDraft.name),
      );
      if (match) {
        return current.map((place) =>
          place.id === match.id
            ? {
                ...place,
                name: stayDraft.name,
                address: stayDraft.address,
                area: placeAreaFromAddress(stayDraft.address, place.area),
              }
            : place,
        );
      }
      return [
        ...current,
        {
          id: stayPlaceId,
          name: stayDraft.name,
          area: placeAreaFromAddress(stayDraft.address),
          address: stayDraft.address,
          category: "숙소",
          mapUrl: "",
          tags: ["숙소"],
          status: "후보",
        },
      ];
    });
    setSheet(null);
    notify("숙소 정보를 저장했어요");
  };
  const deleteStay = () => {
    setRegisteredStay({ name: "", checkin: "", checkout: "", address: "", showInSchedule: false });
    setSheet(null);
    notify("대표 숙소 설정을 해제했어요");
  };
  return (
    <View>
      <TabActionHeader
        label="여행 일정"
        count={`${schedule.length}개`}
        action="일정 추가"
        onPress={openScheduleCreate}
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
        {leadSchedule && (
          <View style={[styles.travelTimelineHead, theme && { backgroundColor: theme.primarySoft }]}>
            <View>
              <Text style={[styles.travelTimelineEyebrow, theme && { color: theme.primary }]}>{firstScheduleDayLabel}</Text>
              <Text style={[styles.travelTimelineDate, theme && { color: theme.text }]}>{dayTextOf(leadSchedule.date)}</Text>
            </View>
            <Text style={[styles.travelTimelineCount, theme && { color: theme.primary }]}>{leadSchedule.items.length}개 일정</Text>
          </View>
        )}
        <View style={styles.travelTimelineItems}>
        {leadSchedule?.items.slice(0, 3).map((item, index) => (
          <Moment
            key={`${item.time}-${index}`}
            {...item}
            time={item.time.split("·").at(-1)?.trim() || item.time}
            last={index === Math.min(leadSchedule.items.length, 3) - 1}
            compact
            photos={item.id ? photosBySchedule.get(item.id) ?? NO_PHOTOS : NO_PHOTOS}
            onPress={() => openScheduleEdit(item, schedule.indexOf(item))}
          />
        ))}
        </View>
        {schedule.length === 0 && (
          <EmptyState
            title="아직 일정이 없어요"
            description="첫 일정을 추가해 여행의 흐름을 만들어 보세요."
            action="일정 추가"
            onPress={canEdit ? openScheduleCreate : undefined}
          />
        )}
        {/* 카드가 앞의 세 개를 이미 보여준다. 그 이하면 '전체'가 지금 보는
            것과 같은 말이라, 눌러야 하나 하고 한 번 멈추게 된다. 일정 수가 아니라
            실제로 그린 수와 견줘야, 첫날이 비고 이튿날에만 세 개가 있을 때
            나머지 날을 여는 길이 사라지지 않는다. */}
        {schedule.length > shownScheduleCount && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              // 열 때마다 다시 고른다. 여행 중이면 오늘, 아니면 전체다.
              setScheduleDay(defaultScheduleDay(dayOptions, todayDay));
              setFullSchedule(true);
            }}
            style={[
              styles.fullScheduleButton,
              theme && { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={[styles.fullScheduleText, theme && { color: theme.text }]}>일정 {schedule.length}개 모두 보기</Text>
            <Glyph name="arrowRight" size={아이콘.보통} color={theme?.primary ?? "#3F4C8F"} />
          </Pressable>
        )}
      </View>

      <SectionLabel
        label="교통편"
        count={`${transportations.length}편`}
        action={canEdit ? "교통편 추가" : undefined}
        onPress={openTransportCreate}
      />
      {/* 편마다 한 장이다. 예전에는 사람마다 한 장에 「가는 편」만 그리고 「오는 편」은
          작은 글 한 줄로 붙여서, 위에 「2편」이라 적혀 있는데 카드는 하나만 보였다.
          이용자가 비어 있는 편은 아예 안 그려져 「없음」으로 보이기도 했다. */}
      <View style={styles.transportGrid}>
        {transportLegs.map(({ leg, ownerIndex }) => (
          <TransportCard
            key={leg.id}
            owner={leg.owner || "타는 사람 미정"}
            leg={leg}
            color={transportColors[ownerIndex % transportColors.length]}
            onPress={() => setSelectedTransport(leg)}
          />
        ))}
      </View>
      {transportations.length === 0 && (
        <EmptyState
          title="아직 교통편이 없어요"
          description="기차·버스·항공편을 적어 두면 일정에도 함께 보여요."
          action="교통편 추가"
          onPress={canEdit ? openTransportCreate : undefined}
        />
      )}

      {/* 예전에는 예약·숙소·요리를 "여행 정보" 한 덩이로 묶어, 개수는 셋을 섞어
          세면서 버튼은 "예약 추가" 하나뿐이었다. 숙소를 어디서 더하는지 알 수
          없고, 둘 다 없으면 같은 모양의 빈 상태가 두 장 쌓였다. 제목과 개수와
          버튼이 같은 것을 가리키도록 나눈다. */}
      <SectionLabel
        label={hasKitchen ? "숙소와 요리" : "숙소"}
        // 둘을 나란히 보일 때는 개수를 적지 않는다. 「1곳」이 요리까지 세는 말로
        // 읽힌다. 카드를 누르면 각자 제 자리로 가므로 버튼도 그때는 두지 않는다.
        count={hasKitchen ? undefined : hasStay ? "1곳" : "없음"}
        action={!hasKitchen && canEdit ? (hasStay ? "숙소 수정" : "숙소 추가") : undefined}
        onPress={() => openStay(!hasStay)}
      />
      <View style={styles.travelInfoList}>
        {/* 숙소와 요리는 나란히 둔다. 한 장씩 위아래로 쌓으면 그 여행에서 묵는 곳과
            해 먹을 것이 한눈에 안 들어오고 카드도 덜 예쁘다. 대신 카드마다 「대표
            숙소」·「요리」라고 적혀 있어 무엇이 무엇인지 헷갈리지 않는다. */}
        {(hasStay || hasKitchen) && (
          <View style={styles.travelInfoPair}>
            {hasStay && (
              <TravelMiniCard
                label="대표 숙소"
                mark={registeredStay.checkin.match(/(\d+)일/)?.[1] ?? "숙소"}
                title={registeredStay.name}
                meta={`${registeredStay.checkin} 체크인`}
                color={theme?.secondary ?? "#55BFB4"}
                onPress={() => openStay()}
                large={!hasKitchen}
              />
            )}
            {hasKitchen && (
              <TravelMiniCard
                label="요리"
                mark="한 끼"
                title={recipes[0]?.name ?? "요리 정하기"}
                meta={
                  recipes.length
                    ? `${recipes.length}개 · 재료 ${recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)}개`
                    : "무엇을 해 먹을까요"
                }
                color={theme?.accent ?? "#8B7CF6"}
                onPress={() => setMode("요리")}
                large={!hasStay}
              />
            )}
          </View>
        )}
        {hasStay && <PhotoStrip photos={stayPhotos} label={registeredStay.name} />}
        {!hasStay && (
          <EmptyState title="아직 숙소가 없어요" description="체크인·체크아웃 시간을 적어 두면 일정에도 보여요." action="숙소 추가" onPress={canEdit ? () => openStay(true) : undefined} />
        )}
      </View>

      {/* 목록은 그대로 둔다. 예약을 장소 안에서 적더라도, 놓치면 안 되는 것들을
          한자리에 모아 보여 주는 일은 여전히 이 구역이 한다. */}
      <SectionLabel
        label="예약"
        count={`${reservations.length}건`}
        action={canEdit ? "예약 추가" : undefined}
        onPress={() => setSheet("reservationPlace")}
      />
      <View style={styles.travelInfoList}>
        {reservations.map((reservation) => {
          // 장소에 붙은 예약은 그 장소의 **지금** 이름으로 보여 준다. 예약에 적힌
          // 이름은 붙일 때 베껴 둔 것이라, 옆 사람이 장소 이름을 고치면 여기만
          // 옛 이름으로 남는다. 고쳐 쓰는 대신 볼 때 장소를 따라가게 한다.
          const 붙은_장소 = reservation.placeId
            ? places.find((place) => place.id === reservation.placeId)
            : undefined;
          const 이름 = 붙은_장소?.name ?? reservation.name;
          return (
          <TravelInfoRow
            key={reservation.id}
            label="예약"
            mark={dayNumberOfKey(reservation.date)}
            title={이름}
            meta={`${dayTextOf(reservation.date)} ${reservation.time || "시간 미정"} · ${reservation.people}`}
            badge={reservation.status}
            color={theme?.primary ?? "#FF6B63"}
            link={safeUrl(reservation.bookingUrl) ?? undefined}
            linkSubject={`${이름} 예약 링크`}
            onPress={() => openLinkedReservation(reservation)}
          />
          );
        })}
        {reservations.length === 0 && (
          <EmptyState title="예약한 곳이 없어요" description="식당이나 행사 예약을 기록해 두세요." action="예약 추가" onPress={canEdit ? () => setSheet("reservationPlace") : undefined} />
        )}
      </View>

      {/* 남은 게 없으면 재촉할 것도 없다. 숫자는 실제 목록에서 센다. */}
      {packingRemaining > 0 && (
      <Pressable
        accessibilityRole="button"
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
          <Text style={[styles.readyEyebrow, theme && { color: theme.primary }]}>남은 준비물</Text>
          <Text style={[styles.readyText, theme && { color: theme.text }]}>
            준비물 {packingRemaining}개가 남아 있어요.
          </Text>
        </View>
        <Glyph name="arrowRight" size={아이콘.보통} color={theme?.primary ?? "#3F4C8F"} />
      </Pressable>
      )}
      <DetailSheet
        visible={sheet === "schedule"}
        title={editingScheduleIndex === null ? "일정 추가" : "일정 수정"}
        subtitle="일정 이름만 입력해도 추가할 수 있어요"
        submit={editingScheduleIndex === null ? "일정 추가" : "저장"}
        disabledHint={!scheduleFormValid ? "일정 이름을 입력해 주세요" : undefined}
        destructiveLabel={editingScheduleIndex === null ? undefined : "일정 삭제"}
        destructiveMessage={newPlanTitle ? `${newPlanTitle} 일정을 삭제해요.` : undefined}
        submitDisabled={!scheduleFormValid}
        hasUnsavedChanges={scheduleDraftChanged}
        onClose={() => setSheet(null)}
        onSubmit={addSchedule}
        onDestructive={deleteSchedule}
      >
        {/* 이름이 첫째다. 예전에는 미리보기 카드와 저장한 장소 줄이 위를 차지해 정작
            이름 칸이 넷째였고, 키보드가 올라오면 보이지도 않았다. 저장한 장소 고르기는
            아래 「더 적기」로 내렸다. */}
        <DetailField
          label="일정 이름"
          required
          value={newPlanTitle}
          onChangeText={setNewPlanTitle}
          placeholder="예: 한옥마을 야행"
        />
        <OptionField
          label="날짜"
          options={dayOptions}
          labelOf={dayTextOf}
          value={planDay}
          onChange={setPlanDay}
        />
        <OptionField
          label="종류"
          options={PLAN_TYPES}
          value={planType}
          onChange={setPlanType}
        />
        <TimeRow
          label="시간 (선택)"
          value={planTime}
          onChange={setPlanTime}
          fallback="11:00"
          optional
        />
        <OptionalFormSection
          label="장소 · 지도 링크"
          summary={[planPlace && "장소", planMapUrl && "지도"].filter(Boolean).join(" · ") || undefined}
          open={scheduleDetailsOpen}
          onToggle={() => setScheduleDetailsOpen((current) => !current)}
        >
          {places.length > 0 && (
            <View style={styles.savedPlacePicker}>
              <View style={styles.savedPlacePickerHead}>
                <View>
                  <Text style={[공용스타일.detailFieldLabel, theme && { color: theme.muted }]}>저장한 장소에서 선택</Text>
                  <Text style={[styles.savedPlacePickerHint, theme && { color: theme.muted }]}>고르면 이름과 위치를 바로 채워요</Text>
                </View>
                {selectedPlanPlaceId && (
                  <Pressable
                    onPress={() => setSelectedPlanPlaceId(null)}
                    hitSlop={글자누름여유}
                    accessibilityRole="button"
                    accessibilityLabel="저장한 장소 선택 해제"
                  >
                    <Text style={[styles.savedPlaceClear, theme && { color: theme.primary }]}>선택 해제</Text>
                  </Pressable>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedPlacePickerRow}>
                {places.map((place) => {
                  const selected = selectedPlanPlaceId === place.id;
                  return (
                    <Pressable
                      key={place.id}
                      onPress={() => chooseSavedPlace(place)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${place.name}, ${place.category}`}
                      style={[
                        styles.savedPlaceChoice,
                        theme && { backgroundColor: theme.surface, borderColor: theme.border },
                        selected && theme && { backgroundColor: theme.primarySoft, borderColor: theme.primary },
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.savedPlaceChoiceName, theme && { color: theme.text }, selected && theme && { color: theme.primary }]}>{place.name}</Text>
                      <Text numberOfLines={1} style={[styles.savedPlaceChoiceMeta, theme && { color: theme.muted }]}>{place.category} · {place.area}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <DetailField
            label="장소 (선택)"
            value={planPlace}
            onChangeText={setPlanPlace}
            placeholder="예: 한옥마을 정문"
            maxLength={2000}
          />
          <View style={[styles.naverField, theme?.dark && { backgroundColor: "#16352C", borderColor: "#245544" }]}>
            <View style={공용스타일.naverHead}>
              <View style={공용스타일.naverLogo}>
                <Text style={공용스타일.naverLogoText}>N</Text>
              </View>
              <View>
                <Text style={[공용스타일.naverTitle, theme?.dark && { color: "#DDF7E9" }]}>지도 링크 (선택)</Text>
                <Text style={[공용스타일.naverHint, theme?.dark && { color: "#96B7A8" }]}>
                  네이버 지도나 카카오맵에서 공유한 링크를 붙여넣어 주세요
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
              <Text style={[공용스타일.linkState, { color: naverInk(Boolean(theme?.dark)) }]}>
                {mapProviderOf(planMapUrl) !== "other"
                  ? `${mapProviderName[mapProviderOf(planMapUrl)]} 링크가 연결돼요`
                  : "네이버 지도나 카카오맵 공유 링크인지 확인해 주세요"}
              </Text>
            )}
          </View>
        </OptionalFormSection>
      </DetailSheet>
      <DetailSheet
        visible={sheet === "transport"}
        title={editingTransportId ? "교통편 수정" : "교통편 추가"}
        subtitle="가는 편과 오는 편을 나눠 적고 한곳에서 확인해요"
        submit={transportSubmitLabel}
        disabledHint={transportDisabledHint}
        destructiveLabel={editingTransportId ? "교통편 삭제" : undefined}
        destructiveMessage="연결된 일정에서도 함께 삭제돼요."
        submitDisabled={!transportFormValid}
        hasUnsavedChanges={transportDraftChanged}
        onClose={() => setSheet(null)}
        onSubmit={addTransportation}
        onDestructive={deleteTransportation}
      >
        {/* 출발→도착이 첫째다. 미리보기 상자는 뺐다. 적은 것을 다시 보여 줄 뿐인데
            시트 위 한 뼘을 먹어 키보드가 올라오면 입력 칸이 밀려났다. */}
        <PairedDetailField
          label="이동 경로"
          required
          leftValue={transportDeparture}
          rightValue={transportArrival}
          onChangeLeft={setTransportDeparture}
          onChangeRight={setTransportArrival}
          leftPlaceholder="출발지"
          rightPlaceholder="도착지"
          onSwap={switchTransportDirection}
          accentColor={transportDirectionColor}
          accentSoft={transportDirectionSoft}
        />
        {/* 갈아타는 곳. 곧장 가면 줄이 없어 지금과 똑같다. 가는 편·오는 편 모두
            가질 수 있다. */}
        {transportStops.map((stop, index) => (
          <View key={index} style={styles.transportStopRow}>
            <Text style={[styles.transportStopMark, theme && { color: theme.muted }]}>갈아탐</Text>
            <TextInput
              accessibilityLabel={`갈아타는 곳 ${index + 1}`}
              value={stop.name}
              onChangeText={(name) => setTransportStops((current) =>
                current.map((item, i) => (i === index ? { ...item, name } : item)))}
              placeholder="예: 동대구"
              placeholderTextColor={theme?.muted ?? "#9AA1AE"}
              maxLength={40}
              style={[styles.transportStopName, theme && { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            />
            <TextInput
              accessibilityLabel={`갈아타는 곳 ${index + 1} 시각`}
              value={stop.time ?? ""}
              onChangeText={(text) => setTransportStops((current) =>
                current.map((item, i) => (i === index ? { ...item, time: maskClockTime(text) } : item)))}
              onBlur={() => setTransportStops((current) =>
                current.map((item, i) => (i === index ? { ...item, time: settleClockTime(item.time ?? "") } : item)))}
              placeholder="시간"
              placeholderTextColor={theme?.muted ?? "#9AA1AE"}
              keyboardType="numeric"
              maxLength={5}
              style={[styles.transportStopTime, theme && { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            />
            <Pressable
              onPress={() => setTransportStops((current) => current.filter((_, i) => i !== index))}
              accessibilityRole="button"
              accessibilityLabel={`갈아타는 곳 ${index + 1} 삭제`}
              hitSlop={누름여유(높이.칩)}
              style={({ pressed }) => [styles.transportStopDelete, pressed && 공용스타일.controlPressed]}
            >
              <Glyph name="close" size={아이콘.작게} color={theme?.muted ?? "#646C7A"} weight={2.4} />
            </Pressable>
          </View>
        ))}
        {/* 다섯 곳까지. 서버도 그만큼만 받는다. */}
        {transportStops.length < 5 && (
          <Pressable
            onPress={() => setTransportStops((current) => [...current, { name: "" }])}
            accessibilityRole="button"
            accessibilityLabel="갈아타는 곳 추가"
            hitSlop={누름여유(높이.칩)}
            style={({ pressed }) => [styles.transportStopAdd, pressed && 공용스타일.controlPressed]}
          >
            <View style={공용스타일.더하기줄}>
              <Glyph name="plus" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} weight={2.4} />
              <Text style={[styles.transportStopAddText, { color: theme?.primary ?? "#3F4C8F" }]}>갈아타는 곳</Text>
            </View>
          </Pressable>
        )}
        <OptionField
          label="방향"
          options={["가는 편", "오는 편"]}
          value={transportDirection}
          onChange={(value) => {
            if (value !== transportDirection) switchTransportDirection();
          }}
        />
        <OptionField label="교통수단" options={["KTX", "SRT", "무궁화호", "고속버스", "시외버스", "버스", "항공", "기타"]} value={transportMethod} onChange={(value) => setTransportMethod(value as Transportation["method"])} />
        <OptionField label="날짜" options={dayOptions} labelOf={dayTextOf} value={transportDate} onChange={setTransportDate} />
        <TimeRow label="출발 시간 (선택)" value={transportDepartureTime} onChange={setTransportDepartureTime} fallback="09:00" optional />
        <TimeRow label="도착 시간 (선택)" value={transportArrivalTime} onChange={setTransportArrivalTime} fallback="10:00" optional />
        <OptionalFormSection
          label="타는 사람 · 예매 · 메모 · 금액"
          summary={[transportNote.trim() && "메모", transportAmountNumber > 0 && "금액"].filter(Boolean).join(" · ") || undefined}
          open={transportDetailsOpen}
          onToggle={() => setTransportDetailsOpen((current) => !current)}
        >
          <OptionField label="타는 사람" options={transportOwners} value={transportOwner} onChange={setTransportOwner} />
          <OptionField label="예매 상태" options={["예매 완료", "예매 전"]} value={transportStatus} onChange={(value) => setTransportStatus(value as Transportation["status"])} />
          <OptionField
            label="여행 일정 표시"
            options={["일정에도 표시", "교통 정보만 저장"]}
            value={transportShowInSchedule ? "일정에도 표시" : "교통 정보만 저장"}
            onChange={(value) => setTransportShowInSchedule(value === "일정에도 표시")}
          />
          <DetailField
            label="메모 (선택)"
            value={transportNote}
            onChangeText={setTransportNote}
            multiline
            maxLength={2000}
            placeholder="예: 예매번호, 좌석, 타는 곳"
          />
          {/* 표값은 여기 적고 비용 탭에는 지출로 들어간다. 교통편에 따로 저장하지 않아
              두 자리의 금액이 어긋날 일이 없다. */}
          <DetailField
            label="금액 (선택)"
            value={transportAmount}
            onChangeText={(text) => setTransportAmount(금액_치기(text, transportUnit.fraction))}
            placeholder="예: 32,000"
            keyboardType={금액_키보드(transportUnit.fraction)}
          />
          {(transportAmountNumber > 0 || linkedTransportExpense) && (
            <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
              {linkedTransportExpense
                ? "비용 탭의 지출과 연결돼 있어요. 금액을 바꾸면 그 지출도 같이 바뀌어요"
                : "저장할 때 비용에도 지출로 추가할지 물어봐요"}
            </Text>
          )}
        </OptionalFormSection>
      </DetailSheet>
      <InfoPanel
        visible={selectedTransport !== null}
        title={`${selectedTransport?.owner || "타는 사람 미정"} · 교통편`}
        onClose={() => setSelectedTransport(null)}
      >
        {transportations
          .filter((item) => (item.owner || "") === (selectedTransport?.owner || ""))
          .map((item) => {
            const linked = transportExpenseOf(expenses, item.id);
            return (
            <View key={item.id} style={[styles.transportDetailBlock, theme && { borderColor: theme.border }]}>
              <Text style={[styles.transportDetailDirection, theme && { color: theme.primary }]}>{item.direction} · {item.status}</Text>
              <InfoLine label="교통수단" value={item.method} />
              <InfoLine label="출발" value={`${dayTextOf(item.date)} · ${item.departure} ${item.departureTime}`} />
              {(item.stops ?? []).filter((stop) => stop.name.trim()).map((stop, index, 곳) => (
                <InfoLine
                  key={index}
                  label={곳.length === 1 ? "갈아탐" : `갈아탐 ${index + 1}`}
                  value={stop.time ? `${stop.name} ${stop.time}` : stop.name}
                />
              ))}
              <InfoLine label="도착" value={`${item.arrival} ${item.arrivalTime}`} />
              <InfoLine label="여행 일정" value={item.showInSchedule ? "일정에 표시 중" : "교통 정보만 저장"} />
              {linked && <InfoLine label="비용" value={`${money(linked.amount, currency)}${linked.excluded ? " · 정산 제외" : ""}`} />}
              {Boolean(item.note?.trim()) && <InfoLine label="메모" value={item.note ?? ""} />}
              {canEdit && (
              <Pressable
                accessibilityRole="button" hitSlop={누름여유(높이.칩)} onPress={() => openTransportEdit(item)} style={[공용스타일.infoManageButton, theme && { backgroundColor: theme.primarySoft }]}>
                <Text style={[공용스타일.infoManageButtonText, theme && { color: theme.primary }]}>이 교통편 수정</Text>
              </Pressable>
              )}
            </View>
            );
          })}
      </InfoPanel>
      {/* 예약을 적기 전에 어디를 예약했는지부터 고른다. 담아 둔 장소에 붙여야
          그날 일정과 장소 카드에서 같은 예약이 함께 보인다. */}
      <DetailSheet
        visible={sheet === "reservationPlace"}
        title="어디를 예약했나요?"
        subtitle="저장한 장소를 고르거나 새 장소를 추가해 예약을 적어요"
        submit="새 장소 추가"
        onClose={() => setSheet(null)}
        onSubmit={() => {
          setSheet(null);
          onOpenPlaceForReservation(null);
        }}
      >
        {places.length > 0 ? (
          <View style={styles.savedPlacePicker}>
            <View style={styles.savedPlacePickerHead}>
              <View>
                <Text style={[공용스타일.detailFieldLabel, theme && { color: theme.muted }]}>저장한 장소에서 선택</Text>
                <Text style={[styles.savedPlacePickerHint, theme && { color: theme.muted }]}>고르면 그 장소의 예약 칸이 열려요</Text>
              </View>
            </View>
            <View style={styles.savedPlaceChoiceList}>
              {places.map((place) => {
                const booked = reservations.find((item) => item.placeId === place.id);
                return (
                  <Pressable
                    key={place.id}
                    onPress={() => {
                      setSheet(null);
                      onOpenPlaceForReservation(place.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${place.name} 예약 추가`}
                    style={({ pressed }) => [
                      styles.savedPlaceChoice,
                      styles.savedPlaceChoiceWide,
                      theme && { backgroundColor: theme.surface, borderColor: theme.border },
                      pressed && 공용스타일.controlPressed,
                    ]}
                  >
                    <Text numberOfLines={1} style={[styles.savedPlaceChoiceName, theme && { color: theme.text }]}>{place.name}</Text>
                    <Text numberOfLines={1} style={[styles.savedPlaceChoiceMeta, theme && { color: theme.muted }]}>
                      {booked ? `${booked.time || "시간 미정"} 예약 있음` : `${place.category} · ${place.area}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <Text style={[styles.savedPlacePickerHint, theme && { color: theme.muted }]}>
            아직 저장한 장소가 없어요. 새 장소를 추가하면서 예약도 함께 적을 수 있어요.
          </Text>
        )}
      </DetailSheet>
      <DetailSheet
        visible={sheet === "reservation"}
        title={editingReservation ? "예약 정보 수정" : "예약 정보 추가"}
        subtitle="예약 이름만 입력해도 저장할 수 있어요"
        submit={editingReservation ? "저장" : "예약 추가"}
        disabledHint={!reservationDraft.name.trim() ? "예약 이름을 입력해 주세요" : undefined}
        submitDisabled={!reservationDraft.name.trim()}
        destructiveLabel={editingReservation ? "예약 정보 삭제" : undefined}
        destructiveMessage="연결된 일정에서도 함께 삭제돼요."
        hasUnsavedChanges={reservationDraftChanged}
        onClose={() => setSheet(null)}
        onSubmit={saveReservation}
        onDestructive={deleteReservation}
      >
        <DetailField label="예약 이름" required value={reservationDraft.name} onChangeText={(name) => setReservationDraft((current) => ({ ...current, name }))} placeholder="예: 소나기식당" />
        <OptionField label="예약 날짜" options={dayOptions} labelOf={dayTextOf} value={reservationDraft.date} onChange={(date) => setReservationDraft((current) => ({ ...current, date }))} />
        <OptionField label="예약 상태" options={["예약 확정", "확인 필요", "취소"]} value={reservationDraft.status} onChange={(status) => setReservationDraft((current) => ({ ...current, status: status as ReservationInfo["status"] }))} />
        <TimeRow label="예약 시간 (선택)" value={reservationDraft.time} onChange={(time) => setReservationDraft((current) => ({ ...current, time }))} fallback="19:00" optional />
        <OptionalFormSection
          label="인원 · 장소 · 예약 링크 · 일정 표시"
          summary={[reservationDraft.people, reservationDraft.place, reservationDraft.bookingUrl?.trim() && "링크"].filter(Boolean).join(" · ") || undefined}
          open={reservationExtrasOpen}
          onToggle={() => setReservationExtrasOpen((current) => !current)}
        >
          <DetailField label="인원 (선택)" value={reservationDraft.people} onChangeText={(people) => setReservationDraft((current) => ({ ...current, people }))} placeholder="예: 2명" maxLength={20} />
          <DetailField label="장소 (선택)" value={reservationDraft.place} onChangeText={(place) => setReservationDraft((current) => ({ ...current, place }))} placeholder="예: 전주 한옥마을" maxLength={2000} />
          <DetailField
            label="예약 링크 (선택)"
            value={reservationDraft.bookingUrl ?? ""}
            onChangeText={(bookingUrl) => setReservationDraft((current) => ({ ...current, bookingUrl }))}
            placeholder="https://"
            keyboardType="url"
            autoCapitalize="none"
            maxLength={2048}
          />
          {Boolean(reservationDraft.bookingUrl?.trim()) && !safeUrl(reservationDraft.bookingUrl) && (
            <Text style={[공용스타일.linkState, { color: naverInk(Boolean(theme?.dark)) }]}>https:// 로 시작하는 링크만 저장돼요</Text>
          )}
          <OptionField
            label="여행 일정 표시"
            options={["일정에도 표시", "예약 정보만 저장"]}
            value={reservationDraft.showInSchedule ? "일정에도 표시" : "예약 정보만 저장"}
            onChange={(value) => setReservationDraft((current) => ({ ...current, showInSchedule: value === "일정에도 표시" }))}
          />
        </OptionalFormSection>
      </DetailSheet>
      <DetailSheet
        visible={sheet === "stay"}
        title={hasStay ? "숙소 수정" : "숙소 추가"}
        subtitle="이번 여행에서 머무를 숙소와 체크인·체크아웃 시간을 적어요"
        submit={hasStay ? "저장" : "숙소 추가"}
        disabledHint={!stayDraft.name.trim() ? "숙소 이름을 입력해 주세요" : !stayFormValid ? "체크아웃 시간을 다시 확인해 주세요" : undefined}
        submitDisabled={!stayFormValid}
        destructiveLabel={hasStay ? "대표 숙소 설정 해제" : undefined}
        destructiveMessage="저장한 장소는 남고 체크인 일정만 함께 사라져요."
        hasUnsavedChanges={stayDraftChanged}
        onClose={() => setSheet(null)}
        onSubmit={saveStay}
        onDestructive={deleteStay}
      >
        <DetailField label="숙소 이름" required value={stayDraft.name} onChangeText={(name) => setStayDraft((current) => ({ ...current, name }))} placeholder="예: 달빛한옥" />
        <StayRangePicker
          checkin={stayDraft.checkin}
          checkout={stayDraft.checkout}
          dates={dateOptions}
          onChange={updateStayDateTime}
        />
        <OptionField
          label="여행 일정 표시"
          options={["체크인 일정 표시", "숙소 정보만 저장"]}
          value={stayDraft.showInSchedule === false ? "숙소 정보만 저장" : "체크인 일정 표시"}
          onChange={(value) => setStayDraft((current) => ({ ...current, showInSchedule: value === "체크인 일정 표시" }))}
        />
        <OptionalFormSection
          label="주소"
          summary={stayDraft.address.trim() || undefined}
          open={stayAddressOpen}
          onToggle={() => setStayAddressOpen((current) => !current)}
        >
          <DetailField label="주소 (선택)" value={stayDraft.address} onChangeText={(address) => setStayDraft((current) => ({ ...current, address }))} placeholder="예: 전주시 완산구 한옥길 12" maxLength={300} />
        </OptionalFormSection>
        {stayPhotos.length > 0 && (
          <>
            <Text style={[공용스타일.detailFieldLabel, theme && { color: theme.text }]}>이 숙소의 사진</Text>
            <PhotoStrip photos={stayPhotos} label={registeredStay.name} />
          </>
        )}
      </DetailSheet>
      <InfoPanel
        visible={fullSchedule}
        title={scheduleDay === ALL_DAYS ? `전체 일정 · ${schedule.length}` : `${dayTextOf(scheduleDay)} 일정 · ${visibleSchedule.length}`}
        onClose={() => setFullSchedule(false)}
      >
        {/* 날짜가 여럿이면 하루씩 골라 본다. 여행 중에는 오늘이 골라져 있다. */}
        {dayOptions.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scheduleDayRow}>
            {[{ day: ALL_DAYS, count: schedule.length }, ...scheduleDayChips].map(({ day, count }) => {
              const active = scheduleDay === day;
              const 날_글 = dayTextOf(day);
              return (
                <Chip
                  key={day}
                  theme={theme ?? undefined}
                  label={날_글}
                  count={count}
                  on={active}
                  onPress={() => setScheduleDay(day)}
                  accessibilityLabel={day === ALL_DAYS ? `전체 일정 ${count}개` : `${날_글} 일정 ${count}개`}
                />
              );
            })}
          </ScrollView>
        )}
        {visibleScheduleGroups.length === 0 && (
          <EmptyState
            title="아직 일정이 없어요"
            description="첫 일정을 추가해 여행의 흐름을 만들어 보세요."
            action="일정 추가"
            onPress={
              canEdit
                ? () => {
                    setFullSchedule(false);
                    openScheduleCreate();
                  }
                : undefined
            }
          />
        )}
        <View style={styles.fullScheduleList}>
          {visibleScheduleGroups.map((group) => (
            <View
              key={group.date}
              style={[
                styles.scheduleDayGroup,
                theme && { backgroundColor: theme.surface, shadowColor: theme.dark ? "#000000" : theme.text },
              ]}
            >
              <View style={[styles.scheduleDayHead, theme && { backgroundColor: theme.primarySoft }]}>
                <View style={styles.scheduleDayHeadCopy}>
                  <Text style={[styles.scheduleDayLabel, theme && { color: theme.primary }]}>여행 날짜</Text>
                  <Text style={[styles.scheduleDayTitle, theme && { color: theme.text }]}>{dayTextOf(group.date)}</Text>
                </View>
                <View style={[styles.scheduleDayCountBadge, theme && { backgroundColor: theme.surface }]}>
                  <Text style={[styles.scheduleDayCount, theme && { color: theme.primary }]}>{group.items.length}개 일정</Text>
                </View>
              </View>
              {group.items.map((item, index) => (
                <View
                  key={`full-${item.time}-${schedule.indexOf(item)}`}
                  style={[
                    styles.scheduleDayItem,
                    index > 0 && styles.scheduleDayItemGap,
                  ]}
                >
                  <Moment
                    {...item}
                    time={item.time.split("·").at(-1)?.trim() || item.time}
                    last={index === group.items.length - 1}
                    photos={item.id ? photosBySchedule.get(item.id) ?? NO_PHOTOS : NO_PHOTOS}
                    onPress={() => {
                      setFullSchedule(false);
                      openScheduleEdit(item, schedule.indexOf(item));
                    }}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      </InfoPanel>
    </View>
  );
}


const styles = StyleSheet.create({
  travelTimelineCard: { padding: 0, marginBottom: 22, overflow: "hidden" },
  travelTimelineHead: {
    minHeight: 55,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  travelTimelineEyebrow: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.4 },
  travelTimelineDate: { fontSize: 15, fontFamily: typo.title.family, marginTop: 1 },
  travelTimelineCount: { fontSize: 11, fontFamily: typo.label.family },
  travelTimelineItems: { paddingHorizontal: 12, paddingTop: 8 },
  travelInfoList: {
    gap: 8,
    marginBottom: 18,
  },
  transportGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  transportStopRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  transportStopMark: { width: 33, fontSize: 11, fontFamily: typo.caption.family, textAlign: "center" },
  transportStopName: { flex: 1, minWidth: 0, height: 높이.입력, borderWidth: 1, borderRadius: 모서리.버튼, paddingHorizontal: 여백.가로좁게, fontSize: 14 },
  transportStopTime: { width: 74, height: 높이.입력, borderWidth: 1, borderRadius: 모서리.버튼, paddingHorizontal: 6, fontSize: 14, textAlign: "center" },
  transportStopDelete: { width: 24, alignItems: "center", justifyContent: "center" },
  transportStopAdd: { alignSelf: "flex-start", minHeight: 높이.칩, justifyContent: "center", marginTop: 6, marginBottom: 6 },
  transportStopAddText: { fontSize: 13, fontFamily: typo.label.family },
  transportDetailBlock: { borderBottomWidth: 1, paddingBottom: 8, marginBottom: 8 },
  transportDetailDirection: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 2 },
  travelInfoPair: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  readyText: {
    fontSize: 14,
    fontFamily: typo.label.family,
    marginTop: 4,
  },
  savedPlacePicker: { marginBottom: 18 },
  savedPlacePickerHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  savedPlacePickerHint: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  savedPlaceClear: { fontSize: 12, fontFamily: typo.label.family },
  savedPlacePickerRow: { gap: 8, paddingRight: 10 },
  savedPlaceChoice: {
    width: 152,
    minHeight: 높이.저장,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },
  savedPlaceChoiceName: { fontSize: 13, fontFamily: typo.label.family },
  savedPlaceChoiceMeta: { fontSize: 12, marginTop: 4 },
  // 예약할 곳 고르기는 옆으로 미는 줄이 아니라 위아래 목록이다. 몇 곳뿐이어도
  // 옆으로 밀게 하면 뒤쪽에 둔 장소를 못 보고 지나친다.
  savedPlaceChoiceList: { gap: 8 },
  savedPlaceChoiceWide: { width: "100%" },
  naverField: {
    backgroundColor: "#E6F5ED",
    borderRadius: 모서리.구역,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#CDEADB",
  },
  naverInput: {
    height: 높이.입력,
    borderRadius: 모서리.버튼,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    color: "#184D36",
    fontSize: 12,
  },
  fullScheduleText: { fontSize: 12, fontFamily: typo.label.family },
  fullScheduleList: { maxHeight: 520 },
  scheduleDayRow: { gap: 6, paddingVertical: 2, paddingRight: 4, marginBottom: 10 },
  scheduleDayGroup: {
    marginBottom: 18,
    borderRadius: 모서리.구역,
    overflow: "hidden",
    ...그림자.카드,
  },
  scheduleDayHead: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  scheduleDayHeadCopy: { gap: 2 },
  scheduleDayLabel: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.5 },
  scheduleDayTitle: { fontSize: 16, fontFamily: typo.title.family },
  scheduleDayCountBadge: { borderRadius: 모서리.원, paddingHorizontal: 9, paddingVertical: 5 },
  scheduleDayCount: { fontSize: 11, fontFamily: typo.label.family },
  scheduleDayItem: { marginHorizontal: 12, paddingTop: 14, paddingBottom: 6 },
  scheduleDayItemGap: { marginTop: 8 },
  readyEyebrow: {
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: typo.label.family,
  },
  timelineCard: { borderRadius: 모서리.행, padding: 12, borderWidth: 1 },
  fullScheduleButton: {
    height: 높이.버튼,
    borderRadius: 모서리.버튼,
    marginTop: 6,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  readyNudge: {
    minHeight: 67,
    borderRadius: 모서리.상자,
    marginTop: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
