import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";

import { Text, TextInput } from "./AppText";
import { Glyph } from "./Glyph";
import { Chip, ChipRow } from "./ui/Chip";
import { SheetShell } from "./ui/SheetShell";
import { AppTheme } from "./theme";
import { status as statusColor } from "./theme/colors";
import { 높이, 모서리, 아이콘, 글자누름여유, 누름여유 } from "./theme/controls";
import { typo } from "./theme/typography";
import { DaymoApiError } from "./auth";
import { dateLabelOf, todayKey } from "./dates";
import { josa } from "./tripExpenses";
import {
  createChecklistItem,
  createMemo,
  createRecipe,
  createScheduleItem,
  createStay,
  createTransport,
  createTripPlace,
  listChecklistItems,
  listMemos,
  listRecipes,
  listScheduleItems,
  listTransports,
  listTripPlaces,
} from "./serverData";
import { parseNotice, splitNotices, tripDates, type NoticeDraft } from "./noticeImport";
import {
  duplicateKeys,
  noticeCounts,
  noticeImportReport,
  runNoticeImport,
  transportKeyOf,
  type ExistingTripContent,
  type NoticeImportResult,
} from "./noticeImportPlan";
import type { RosterEntry } from "./tripSync";

/** 채워 넣을 수 있는 여행 한 줄. 「여행」 탭이 들고 있는 것 그대로다. */
type NoticeImportTrip = {
  id: string;
  name: string;
  /** `9월 22일 — 9월 24일 · 2박 3일` */
  date: string;
  start: string;
  end: string;
};

/** 일정에 날짜를 정하지 않은 상태. 서버에는 빈 값으로 간다. */
const NO_DAY = "날짜 미정";

/** 읽지 못한 줄을 모아 두는 메모의 첫 줄. 두 번 넣지 않으려고 이 말로 찾는다. */
const LEFTOVER_MEMO_HEAD = "공지에서 읽지 못한 줄";

type Stage = "붙여넣기" | "고치기" | "결과";

const emptyDraft: NoticeDraft = {
  title: "", startDate: "", endDate: "", regionName: "",
  places: [], stays: [], transports: [], recipes: [], packing: [], schedule: [], memos: [], leftovers: [],
};

/**
 * 카카오톡 공지를 통째로 붙여넣어 **이미 있는 여행**을 채우는 자리.
 *
 * 세 걸음이다. 어느 여행에 넣을지 고르고 공지를 붙여넣고 → 무엇을 어떻게
 * 읽었는지 보고 고치고 → 넣는다. 읽기는 `noticeImport.ts`, 넣기는
 * `noticeImportPlan.ts` 가 하고 여기서는 보여 주고 고치게만 한다.
 *
 * 아직 열지 않은 기능이다. `features.ts` 의 `NOTICE_IMPORT_ENABLED` 가 켜져
 * 있을 때만 「여행」 탭에 들어가는 길이 생긴다.
 */
export function NoticeImportSheet({
  theme,
  visible,
  trips,
  roster,
  onClose,
  onFilled,
}: {
  theme: AppTheme;
  visible: boolean;
  /** 같은 공간의 여행. 이 중에서 채워 넣을 여행을 고른다. */
  trips: readonly NoticeImportTrip[];
  roster: readonly RosterEntry[];
  onClose: () => void;
  /** 다 넣고 나서 그 여행을 연다. */
  onFilled: (tripId: string) => Promise<void> | void;
}) {
  const [stage, setStage] = useState<Stage>("붙여넣기");
  const [tripId, setTripId] = useState("");
  const [text, setText] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const [picked, setPicked] = useState(0);
  const [draft, setDraft] = useState<NoticeDraft>(emptyDraft);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set());
  const [keepLeftovers, setKeepLeftovers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<NoticeImportResult | null>(null);

  useEffect(() => {
    if (!visible) return;
    // 열 때마다 처음부터. 지난번에 붙여넣은 글이 남아 있으면 헷갈린다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStage("붙여넣기");
    setTripId(trips[0]?.id ?? "");
    setText("");
    setNotices([]);
    setPicked(0);
    setDraft(emptyDraft);
    setOff(new Set());
    setDuplicates(new Set());
    setKeepLeftovers(true);
    setError("");
    setResult(null);
    setBusy(false);
  }, [visible, trips]);

  const trip = trips.find((item) => item.id === tripId);
  const dates = useMemo(() => (trip ? tripDates(trip.start, trip.end) : []), [trip]);
  const dayChoices = useMemo(() => [...dates.map(dateLabelOf), NO_DAY], [dates]);

  const isOn = (key: string) => !off.has(key);
  const toggle = (key: string) =>
    setOff((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const setAll = (keys: string[], on: boolean) =>
    setOff((current) => {
      const next = new Set(current);
      keys.forEach((key) => (on ? next.delete(key) : next.add(key)));
      return next;
    });

  /** 여행에 이미 들어 있는 것의 이름. 겹치는 줄을 미리 꺼 두는 데만 쓴다. */
  const loadExisting = async (id: string): Promise<ExistingTripContent> => {
    const [places, schedule, transports, recipes, packing, memos] = await Promise.all([
      listTripPlaces(id),
      listScheduleItems(id),
      listTransports(id),
      listRecipes(id),
      listChecklistItems(id),
      listMemos(id),
    ]);
    return {
      places: places.map((row) => row.name),
      schedule: schedule.map((row) => row.title),
      transports: transports.map((row) => transportKeyOf({
        direction: row.direction === "return" ? "오는 편" : "가는 편",
        departure: row.departureName ?? "",
        arrival: row.arrivalName ?? "",
      })),
      recipes: recipes.map((row) => row.name),
      packing: packing.map((row) => row.name),
      memos: memos.map((row) => row.body),
    };
  };

  const read = async () => {
    if (!trip || busy) return;
    const found = splitNotices(text);
    if (!found.length) {
      setError("읽을 글이 없어요. 공지를 통째로 붙여넣어 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    const parsed = parseNotice(found[0], { today: todayKey() });
    try {
      const existing = await loadExisting(trip.id);
      const already = duplicateKeys(parsed, existing);
      setDuplicates(new Set(already));
      setOff(new Set(already));
      // 읽지 못한 줄 메모가 이미 있으면 다시 넣지 않는다. 같은 공지를 두 번
      // 붙여넣었을 때 같은 메모가 쌓인다.
      setKeepLeftovers(!(existing.memos ?? []).some((memo) => memo.startsWith(LEFTOVER_MEMO_HEAD)));
    } catch {
      // 이미 있는 것을 못 불러와도 읽은 것은 보여 준다. 겹침만 못 가린다.
      setDuplicates(new Set());
      setOff(new Set());
      setError("이미 추가한 것을 불러오지 못했어요. 겹치는 줄은 직접 꺼 주세요.");
    } finally {
      setBusy(false);
    }
    setNotices(found);
    setPicked(0);
    setDraft(parsed);
    setStage("고치기");
  };

  const pick = async (index: number) => {
    if (!trip) return;
    const parsed = parseNotice(notices[index], { today: todayKey() });
    setPicked(index);
    setDraft(parsed);
    try {
      const existing = await loadExisting(trip.id);
      const already = duplicateKeys(parsed, existing);
      setDuplicates(new Set(already));
      setOff(new Set(already));
      setKeepLeftovers(!(existing.memos ?? []).some((memo) => memo.startsWith(LEFTOVER_MEMO_HEAD)));
    } catch {
      setDuplicates(new Set());
      setOff(new Set());
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const clipboard = await Clipboard.getStringAsync();
      if (clipboard.trim()) setText(clipboard);
      else setError("복사한 글이 없어요");
    } catch {
      setError("붙여넣지 못했어요. 글을 직접 붙여넣어 주세요.");
    }
  };

  /** 켠 것만 남긴 초안. 이대로 서버에 넣는다. */
  const chosen = useMemo((): NoticeDraft => ({
    ...draft,
    places: draft.places.filter((_, index) => !off.has(`장소:${index}`)),
    stays: draft.stays.filter((_, index) => !off.has(`숙소:${index}`)),
    transports: draft.transports.filter((_, index) => !off.has(`교통:${index}`)),
    schedule: draft.schedule.filter((_, index) => !off.has(`일정:${index}`)),
    recipes: draft.recipes.filter((_, index) => !off.has(`요리:${index}`)),
    packing: draft.packing.filter((_, index) => !off.has(`준비:${index}`)),
    memos: draft.memos.filter((_, index) => !off.has(`메모:${index}`)),
  }), [draft, off]);

  const counts = useMemo(() => noticeCounts(chosen), [chosen]);
  const skipped = useMemo(() => [...duplicates].filter((key) => off.has(key)).length, [duplicates, off]);

  const fill = async () => {
    if (!trip || busy) return;
    setBusy(true);
    setError("");
    try {
      const made = await runNoticeImport(
        chosen,
        { tripId: trip.id, tripDates: dates, roster, keepLeftovers, skipped },
        {
          newId: () => Crypto.randomUUID(),
          createPlace: createTripPlace,
          createStay,
          createTransport,
          createScheduleItem,
          createRecipe,
          createChecklistItem,
          createMemo,
        },
      );
      setResult(made);
      setStage("결과");
    } catch (caught) {
      setError(caught instanceof DaymoApiError ? caught.message : "여행을 채우지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = stage === "붙여넣기"
    ? (busy ? "읽는 중…" : "읽어 보기")
    : stage === "고치기"
      ? (busy ? "추가하는 중…" : "이 여행에 추가")
      : "여행 열기";
  const submitDisabled =
    busy
    || (stage === "붙여넣기" && (!text.trim() || !trip))
    || (stage === "고치기" && !counts.length && !(keepLeftovers && draft.leftovers.length));
  const disabledHint = stage === "붙여넣기"
    ? (!trip ? "채울 여행을 골라 주세요" : "공지 글을 붙여넣어 주세요")
    : stage === "고치기"
      ? "추가할 것을 하나는 켜 주세요"
      : undefined;

  const submit = () => {
    if (stage === "붙여넣기") void read();
    else if (stage === "고치기") void fill();
    else if (trip) void onFilled(trip.id);
  };

  const accent = theme.primary;
  const danger = theme.dark ? statusColor.danger.dark : statusColor.danger.light;

  // 읽거나 넣는 중에는 모자란 것을 알리지 않는다. 버튼에 이미 "읽는 중…" 이
  // 적혀 있는데 그 위에 "공지 글을 붙여넣어 주세요" 가 같이 뜨면 어긋나 보인다.
  const hint = busy ? undefined : disabledHint;

  return (
    <SheetShell
      theme={theme}
      visible={visible}
      title="카카오톡 공지로 채우기"
      subtitle={stage === "붙여넣기"
        ? "카카오톡 공지를 통째로 붙여넣어 지난 여행을 채워요"
        : stage === "고치기"
          ? `읽은 그대로예요. ${trip?.name ?? "여행"}에 추가할 것만 켜 주세요`
          : `${trip?.name ?? "여행"}${josa(trip?.name ?? "여행", "을", "를")} 채웠어요`}
      submit={submitLabel}
      onSubmit={submit}
      submitDisabled={submitDisabled}
      disabledHint={hint}
      onClose={onClose}
    >
      {error ? (
        <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: danger }]}>{error}</Text>
      ) : null}

      {stage === "붙여넣기" && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 8 }]}>어느 여행에 추가할까요</Text>
          {trips.length ? (
            <ChipRow>
              {trips.map((item) => (
                <Chip
                  key={item.id}
                  theme={theme}
                  label={item.name}
                  on={item.id === tripId}
                  onPress={() => setTripId(item.id)}
                />
              ))}
            </ChipRow>
          ) : (
            <Text style={[styles.hint, { color: theme.muted, marginTop: 0 }]}>
              먼저 여행을 만들어 주세요. 공지는 이미 있는 여행을 채우는 데 써요.
            </Text>
          )}
          {trip && (
            <Text style={[styles.hint, { color: theme.muted }]}>{trip.date}</Text>
          )}

          <View style={[styles.labelRow, { marginTop: 18 }]}>
            <View style={[styles.labelDot, { backgroundColor: accent }]} />
            <Text style={[styles.label, { color: theme.text }]}>공지 글</Text>
            <Pressable
              onPress={pasteFromClipboard}
              hitSlop={누름여유(높이.칩)}
              accessibilityRole="button"
              accessibilityLabel="복사한 글 붙여넣기"
              style={[styles.toolButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
            >
              <Text style={[styles.toolButtonText, { color: theme.primary }]}>붙여넣기</Text>
            </Pressable>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            accessibilityLabel="공지 글"
            placeholder={"# 제목: 9월 22일 ~ 9월 24일 전주 한옥마을\n\n—————— 먹고 싶은 것 리스트 ——————\n..."}
            placeholderTextColor={theme.muted}
            style={[
              styles.paste,
              { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
            ]}
          />
          <Text style={[styles.hint, { color: theme.muted }]}>
            구획 제목, 대괄호 상태, 지도 링크, 재료 수량, 조리 순서를 읽어요.
            이미 여행에 있는 것은 미리 꺼 두고, 못 읽은 줄은 따로 모아 보여 줘요.
          </Text>
        </>
      )}

      {stage === "고치기" && (
        <>
          {notices.length > 1 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                공지 {notices.length}편을 찾았어요
              </Text>
              <ChipRow>
                {notices.map((notice, index) => (
                  <Chip
                    key={index}
                    theme={theme}
                    label={parseNotice(notice, { today: todayKey() }).title || `${index + 1}번째`}
                    on={picked === index}
                    onPress={() => void pick(index)}
                  />
                ))}
              </ChipRow>
            </View>
          )}

          <View style={styles.summaryRow}>
            {counts.length ? counts.map((row) => (
              <View key={row.label} style={[styles.countChip, { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.countText, { color: theme.primary }]}>{row.label} {row.count}</Text>
              </View>
            )) : (
              <Text style={[styles.hint, { color: theme.muted, marginTop: 0 }]}>추가할 것이 없어요.</Text>
            )}
          </View>
          {skipped > 0 && (
            <Text style={[styles.hint, { color: theme.muted, marginTop: 0 }]}>
              이미 여행에 있는 {skipped}개는 꺼 뒀어요. 다른 것이면 다시 켜 주세요.
            </Text>
          )}

          <Rows
            theme={theme}
            title="장소"
            keys={draft.places.map((_, index) => `장소:${index}`)}
            isOn={isOn}
            toggle={toggle}
            setAll={setAll}
            duplicates={duplicates}
            rows={draft.places.map((place, index) => ({
              key: `장소:${index}`,
              name: place.name,
              under: [place.note, place.address, place.mapUrl ? "지도 링크" : ""].filter(Boolean).join(" · "),
              rename: (value: string) => setDraft((current) => ({
                ...current,
                places: current.places.map((item, at) => (at === index ? { ...item, name: value } : item)),
              })),
            }))}
          />

          <Rows
            theme={theme}
            title="숙소"
            keys={draft.stays.map((_, index) => `숙소:${index}`)}
            isOn={isOn}
            toggle={toggle}
            setAll={setAll}
            duplicates={duplicates}
            rows={draft.stays.map((stay, index) => ({
              key: `숙소:${index}`,
              name: stay.name,
              under: [
                stay.checkIn ? `체크인 ${stay.checkIn}` : "",
                stay.checkOut ? `체크아웃 ${stay.checkOut}` : "",
                stay.address,
              ].filter(Boolean).join(" · "),
              rename: (value: string) => setDraft((current) => ({
                ...current,
                stays: current.stays.map((item, at) => (at === index ? { ...item, name: value } : item)),
              })),
            }))}
          />

          <Rows
            theme={theme}
            title="교통편"
            keys={draft.transports.map((_, index) => `교통:${index}`)}
            isOn={isOn}
            toggle={toggle}
            setAll={setAll}
            duplicates={duplicates}
            rows={draft.transports.map((transport, index) => ({
              key: `교통:${index}`,
              name: `${transport.method} ${transport.departure} → ${transport.arrival}`,
              under: `${transport.direction} · ${transport.owner || "담당 미정"} · ${transport.departureTime}–${transport.arrivalTime} · ${transport.booked ? "예매 완료" : "예매 전"}`,
            }))}
          />

          <Rows
            theme={theme}
            title="일정"
            keys={draft.schedule.map((_, index) => `일정:${index}`)}
            isOn={isOn}
            toggle={toggle}
            setAll={setAll}
            duplicates={duplicates}
            rows={draft.schedule.map((item, index) => ({
              key: `일정:${index}`,
              name: item.title,
              under: [item.note, item.time].filter(Boolean).join(" · "),
              rename: (value: string) => setDraft((current) => ({
                ...current,
                schedule: current.schedule.map((row, at) => (at === index ? { ...row, title: value } : row)),
              })),
              // 공지의 날짜가 이 여행 기간 밖이면 비어 있다. 여기서 고른다.
              days: {
                choices: dayChoices,
                value: item.date && dates.includes(item.date) ? dateLabelOf(item.date) : NO_DAY,
                onChange: (label: string) => setDraft((current) => ({
                  ...current,
                  schedule: current.schedule.map((row, at) => at === index
                    ? { ...row, date: dates.find((key) => dateLabelOf(key) === label) ?? "" }
                    : row),
                })),
              },
            }))}
          />

          <Rows
            theme={theme}
            title="요리"
            keys={draft.recipes.map((_, index) => `요리:${index}`)}
            isOn={isOn}
            toggle={toggle}
            setAll={setAll}
            duplicates={duplicates}
            rows={draft.recipes.map((recipe, index) => ({
              key: `요리:${index}`,
              name: recipe.name,
              under: [
                recipe.ingredients.length ? `재료 ${recipe.ingredients.length}개` : "재료 없음",
                recipe.note ? "조리 순서 있음" : "",
              ].filter(Boolean).join(" · "),
              rename: (value: string) => setDraft((current) => ({
                ...current,
                recipes: current.recipes.map((item, at) => (at === index ? { ...item, name: value } : item)),
              })),
            }))}
          />

          <Rows
            theme={theme}
            title="준비물"
            keys={draft.packing.map((_, index) => `준비:${index}`)}
            isOn={isOn}
            toggle={toggle}
            setAll={setAll}
            duplicates={duplicates}
            rows={draft.packing.map((item, index) => ({
              key: `준비:${index}`,
              name: item.name,
              under: [item.quantity, item.owner].filter(Boolean).join(" · "),
              rename: (value: string) => setDraft((current) => ({
                ...current,
                packing: current.packing.map((row, at) => (at === index ? { ...row, name: value } : row)),
              })),
            }))}
          />

          <Rows
            theme={theme}
            title="메모"
            keys={draft.memos.map((_, index) => `메모:${index}`)}
            isOn={isOn}
            toggle={toggle}
            setAll={setAll}
            duplicates={duplicates}
            rows={draft.memos.map((memo, index) => ({
              key: `메모:${index}`,
              name: memo.split("\n")[0],
              under: memo.split("\n").length > 1 ? `${memo.split("\n").length}줄` : "",
            }))}
          />

          {draft.leftovers.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                읽지 못한 줄 {draft.leftovers.length}
              </Text>
              <View style={[styles.leftoverBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                {draft.leftovers.slice(0, 12).map((line, index) => (
                  <Text key={index} numberOfLines={1} style={[styles.leftoverLine, { color: theme.muted }]}>
                    {line}
                  </Text>
                ))}
                {draft.leftovers.length > 12 && (
                  <Text style={[styles.leftoverLine, { color: theme.muted }]}>
                    … 그리고 {draft.leftovers.length - 12}줄
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => setKeepLeftovers((current) => !current)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: keepLeftovers }}
                accessibilityLabel="읽지 못한 줄을 여행 메모로 남기기"
                style={[
                  styles.checkRow,
                  {
                    borderColor: keepLeftovers ? theme.primary : theme.border,
                    backgroundColor: keepLeftovers ? theme.primarySoft : theme.surface,
                  },
                ]}
              >
                <Text style={[styles.checkText, { color: keepLeftovers ? theme.primary : theme.muted }]}>
                  여행 메모로 남기기
                </Text>
                {keepLeftovers && <Glyph name="check" size={아이콘.보통} color={theme.primary} weight={2.6} />}
              </Pressable>
            </View>
          )}
        </>
      )}

      {stage === "결과" && result && (
        <View style={styles.section}>
          <Text style={[styles.reportText, { color: theme.text }]}>{noticeImportReport(result)}</Text>
          {result.failed.length > 0 && (
            <View style={[styles.leftoverBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              <Text style={[styles.leftoverLine, { color: theme.text }]}>추가하지 못한 것</Text>
              {result.failed.map((row, index) => (
                <Text key={index} numberOfLines={2} style={[styles.leftoverLine, { color: danger }]}>
                  {row.label} — {row.message}
                </Text>
              ))}
              <Text style={[styles.hint, { color: theme.muted }]}>
                나머지는 이미 들어갔어요. 추가하지 못한 것만 여행 안에서 손으로 채워 주세요.
              </Text>
            </View>
          )}
        </View>
      )}
    </SheetShell>
  );
}

// ---------------------------------------------------------------------------
// 안에서만 쓰는 조각
// ---------------------------------------------------------------------------

type Row = {
  key: string;
  name: string;
  under: string;
  rename?: (value: string) => void;
  /** 일정에만. 여행의 어느 날로 둘지 고른다. */
  days?: { choices: string[]; value: string; onChange: (label: string) => void };
};

/** 한 종류를 통째로 보여 주고 줄마다 켜고 끄고 이름을 고치게 한다. */
function Rows({ theme, title, keys, rows, isOn, toggle, setAll, duplicates }: {
  theme: AppTheme;
  title: string;
  keys: string[];
  rows: Row[];
  isOn: (key: string) => boolean;
  toggle: (key: string) => void;
  setAll: (keys: string[], on: boolean) => void;
  /** 이미 여행에 있는 줄. 꺼 둔 채로 "이미 있어요" 라고 적는다. */
  duplicates: ReadonlySet<string>;
}) {
  if (!rows.length) return null;
  const chosen = keys.filter(isOn).length;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {title} {chosen}/{rows.length}
        </Text>
        <Pressable
          onPress={() => setAll(keys, chosen < rows.length)}
          accessibilityRole="button"
          accessibilityLabel={`${title} ${chosen < rows.length ? "모두 켜기" : "모두 끄기"}`}
          hitSlop={글자누름여유}
        >
          <Text style={[styles.sectionAction, { color: theme.primary }]}>
            {chosen < rows.length ? "모두 켜기" : "모두 끄기"}
          </Text>
        </Pressable>
      </View>
      {rows.map((row) => {
        const on = isOn(row.key);
        const already = duplicates.has(row.key);
        return (
          <View
            key={row.key}
            style={[
              styles.row,
              {
                borderColor: on ? theme.primary : theme.border,
                backgroundColor: on ? theme.surface : theme.surfaceAlt,
              },
            ]}
          >
            <View style={styles.rowHead}>
              <Pressable
                onPress={() => toggle(row.key)}
                hitSlop={누름여유(22)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${row.name} 넣기`}
                style={[
                  styles.check,
                  { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primarySoft : "transparent" },
                ]}
              >
                {on && <Glyph name="check" size={아이콘.작게} color={theme.primary} weight={2.6} />}
              </Pressable>
              {row.rename ? (
                <TextInput
                  value={row.name}
                  onChangeText={row.rename}
                  editable={on}
                  accessibilityLabel={`${title} 이름`}
                  style={[styles.rowInput, { color: on ? theme.text : theme.muted }]}
                />
              ) : (
                <Text numberOfLines={1} style={[styles.rowInput, { color: on ? theme.text : theme.muted }]}>
                  {row.name}
                </Text>
              )}
              {already && (
                <Text style={[styles.rowBadge, { color: theme.muted, borderColor: theme.border }]}>이미 있어요</Text>
              )}
            </View>
            {Boolean(row.under) && (
              <Text numberOfLines={2} style={[styles.rowUnder, { color: theme.muted }]}>{row.under}</Text>
            )}
            {row.days && on && (
              <ChipRow scroll>
                {row.days.choices.map((choice) => (
                  <Chip
                    key={choice}
                    theme={theme}
                    label={choice}
                    on={row.days?.value === choice}
                    onPress={() => row.days?.onChange(choice)}
                  />
                ))}
              </ChipRow>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  labelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 6 },
  labelDot: { width: 5, height: 5, borderRadius: 모서리.표식 },
  label: { flex: 1, fontSize: 12, fontFamily: typo.label.family },
  // 공지 글 전체를 붙여넣는 칸이라 여러 줄이 들어간다. 높이 토큰의 한 줄짜리가 아니다.
  paste: {
    minHeight: 200,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    padding: 14,
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: "top",
  },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 10, fontFamily: typo.caption.family },
  toolButton: { minWidth: 62, height: 높이.칩, borderWidth: 1, borderRadius: 모서리.버튼, alignItems: "center", justifyContent: "center" },
  toolButtonText: { fontSize: 12, fontFamily: typo.label.family },
  section: { marginTop: 18 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontFamily: typo.title.family },
  sectionAction: { fontSize: 12, fontFamily: typo.label.family },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  countChip: { borderRadius: 모서리.원, paddingHorizontal: 10, paddingVertical: 5 },
  countText: { fontSize: 12, fontFamily: typo.data.family },
  row: { borderWidth: 1, borderRadius: 모서리.구역, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, gap: 6 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  // 체크 상자는 글자 옆에 붙는 표시라 22px 이다. 칩 높이로 키우면 줄 이름을
  // 밀어내고 체크 표시만 커 보인다. 대신 hitSlop 으로 44 를 채운다.
  check: { width: 22, height: 22, borderRadius: 모서리.상자, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rowInput: { flex: 1, fontSize: 14, fontFamily: typo.title.family, paddingVertical: 2 },
  rowBadge: {
    fontSize: 11,
    fontFamily: typo.caption.family,
    borderWidth: 1,
    borderRadius: 모서리.원,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rowUnder: { fontSize: 12, lineHeight: 16, marginLeft: 32, fontFamily: typo.caption.family },
  leftoverBox: { borderWidth: 1, borderRadius: 모서리.구역, padding: 12, gap: 4 },
  leftoverLine: { fontSize: 12, lineHeight: 17 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 높이.버튼,
    borderWidth: 1,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  checkText: { fontSize: 13, fontFamily: typo.label.family },
  reportText: { fontSize: 14, lineHeight: 21, marginBottom: 10 },
});
