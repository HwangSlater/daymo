import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { Glyph } from "./Glyph";
import { AppTheme } from "./theme";
import { typo } from "./theme/typography";

/**
 * `YYYY-MM-DD` 를 Date 로 바꾼다. 비어 있거나 모양이 틀리면 undefined.
 *
 * 2026-09-23: 예전에는 받은 글자를 그대로 `new Date("T00:00:00")` 에 넣었다. 함께한 날을
 * 아직 적지 않은 새 공간은 이 값이 빈 글자라 Invalid Date 가 됐고, 달 제목이 「NaN. NaN」,
 * 날짜 칸이 0개, 요약이 「NaN월 NaN일」이 되어 이전·다음 달로도 돌아오지 못했다.
 */
const 날짜로 = (key: string): Date | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return undefined;
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const 키로 = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const 월일 = (date: Date) => `${date.getMonth() + 1}월 ${date.getDate()}일`;

/** 고른 기간을 한 줄로. 아직 고르지 않았으면 빈 글자를 돌려준다. */
export function formatTripRange(start: string, end: string) {
  const startDate = 날짜로(start);
  const endDate = 날짜로(end);
  if (!startDate) return "";
  if (!endDate) return 월일(startDate);
  const nights = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
  return `${월일(startDate)} — ${월일(endDate)} · ${nights ? `${nights}박 ${nights + 1}일` : "당일"}`;
}

export function TripDateRangePicker({ theme, start, end, setStart, setEnd, summaryLabel = "선택한 여행 기간", mode = "range" }: {
  theme: AppTheme;
  start: string;
  end: string;
  setStart: (value: string) => void;
  setEnd: (value: string) => void;
  /** 요약 판 윗줄. 여행이 아닌 기간(캘린더의 출장·휴가)을 고를 때 바꾼다. */
  summaryLabel?: string;
  /**
   * 하루만 고르는 자리(공간의 「함께하기 시작한 날」)는 `single`.
   *
   * 기간이 없는 자리에 「마지막 날을 선택해 주세요」와 「0박」이 뜨면 무엇을 더 골라야
   * 하는지 알 수 없다(2026-09-23).
   */
  mode?: "range" | "single";
}) {
  const single = mode === "single";
  const 오늘 = new Date();
  const 기준 = 날짜로(start) ?? 오늘;
  const [calendarMonth, setCalendarMonth] = useState({
    year: 기준.getFullYear(),
    value: 기준.getMonth() + 1,
  });
  // 연·월을 한 번에 옮기는 판. 달 제목을 누르면 열린다. 화살표만 있으면 2년 전
  // 날짜를 고르는 데 24번을 눌러야 했다.
  const [monthPicker, setMonthPicker] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const firstDay = new Date(calendarMonth.year, calendarMonth.value - 1, 1).getDay();
  const days = new Date(calendarMonth.year, calendarMonth.value, 0).getDate();
  const cellCount = Math.ceil((firstDay + days) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => index - firstDay + 1);
  const move = (amount: number) => {
    const next = new Date(calendarMonth.year, calendarMonth.value - 1 + amount, 1);
    setCalendarMonth({ year: next.getFullYear(), value: next.getMonth() + 1 });
  };
  const choose = (key: string) => {
    if (single) {
      setStart(key);
      setEnd(key);
      return;
    }
    if (!selectingEnd || key < start) {
      setStart(key);
      setEnd(key);
      setSelectingEnd(true);
    } else {
      setEnd(key);
      setSelectingEnd(false);
    }
  };
  const startDate = 날짜로(start);
  const endDate = 날짜로(end);
  const nights = startDate && endDate
    ? Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
    : 0;
  const 요약 = formatTripRange(start, single ? start : end);
  // 요약 판은 짙은 바탕에 밝은 글자다. 짙은 색을 하나로 박아 두면 테마를 바꿔도
  // 안 따라오고, 라이트 테마의 primary 를 그 위에 얹으면 짙은 색 위의 짙은 색이
  // 되어 "마지막 날을 선택해 주세요" 가 2:1 로 묻힌다. 모드별로 나눠 잡는다.
  const plate = theme.dark ? theme.surfaceAlt : theme.primary;
  const plateText = theme.dark ? theme.text : "#FFFFFF";
  const plateLabel = theme.dark ? theme.primary : theme.primarySoft;
  const 오늘_키 = 키로(오늘);
  return (
    <View style={styles.rangeField}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>{single ? "날짜" : "기간"}</Text>
      <View style={[styles.rangeSummary, { backgroundColor: plate }]}>
        <View style={styles.rangeSummaryCopy}>
          <Text style={[styles.rangeSummaryLabel, { color: plateLabel }]}>
            {!single && selectingEnd ? "마지막 날을 선택해 주세요" : summaryLabel}
          </Text>
          <Text numberOfLines={1} style={[styles.rangeSummaryValue, { color: plateText }]}>
            {요약 || "아래에서 날짜를 골라 주세요"}
          </Text>
        </View>
        {!single && (
          <View style={[styles.rangeNights, { backgroundColor: theme.dark ? theme.background : "rgba(255,255,255,0.18)" }]}>
            <Text style={[styles.rangeNightsText, { color: plateText }]}>{nights ? `${nights}박` : "당일"}</Text>
          </View>
        )}
      </View>
      <View style={[styles.rangeCalendar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.rangeMonthHead}>
          <Pressable hitSlop={7} accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => move(-1)} style={[styles.rangeMonthButton, { backgroundColor: theme.surfaceAlt }]}>
            <Glyph name="chevronLeft" size={20} color={theme.text} />
          </Pressable>
          <Pressable
            hitSlop={7}
            accessibilityRole="button"
            accessibilityLabel={`${calendarMonth.year}년 ${calendarMonth.value}월, 연도와 달 고르기`}
            accessibilityState={{ expanded: monthPicker }}
            onPress={() => setMonthPicker((열림) => !열림)}
            style={styles.rangeMonthTitleHit}
          >
            <Text style={[styles.rangeMonthTitle, { color: theme.text }]}>
              {calendarMonth.year}. {String(calendarMonth.value).padStart(2, "0")}
            </Text>
            {/* 접기·펴기 표시는 시트의 선택 칸(`ui/OptionalFormSection`)과 같은 ＋·－ 로 맞춘다. */}
            <Glyph name={monthPicker ? "minus" : "chevronDown"} size={14} color={theme.muted} />
          </Pressable>
          <Pressable hitSlop={7} accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => move(1)} style={[styles.rangeMonthButton, { backgroundColor: theme.surfaceAlt }]}>
            <Glyph name="chevronRight" size={20} color={theme.text} />
          </Pressable>
        </View>
        {monthPicker ? (
          <View style={styles.monthPicker}>
            <View style={styles.rangeMonthHead}>
              <Pressable
                hitSlop={7}
                accessibilityRole="button"
                accessibilityLabel="이전 해"
                onPress={() => setCalendarMonth((지금) => ({ ...지금, year: 지금.year - 1 }))}
                style={[styles.rangeMonthButton, { backgroundColor: theme.surfaceAlt }]}
              >
                <Glyph name="chevronLeft" size={20} color={theme.text} />
              </Pressable>
              <Text style={[styles.rangeMonthTitle, { color: theme.text }]}>{calendarMonth.year}년</Text>
              <Pressable
                hitSlop={7}
                accessibilityRole="button"
                accessibilityLabel="다음 해"
                onPress={() => setCalendarMonth((지금) => ({ ...지금, year: 지금.year + 1 }))}
                style={[styles.rangeMonthButton, { backgroundColor: theme.surfaceAlt }]}
              >
                <Glyph name="chevronRight" size={20} color={theme.text} />
              </Pressable>
            </View>
            <View style={styles.monthGrid}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((달) => {
                const 고름 = 달 === calendarMonth.value;
                return (
                  <Pressable
                    key={달}
                    accessibilityRole="button"
                    accessibilityLabel={`${calendarMonth.year}년 ${달}월`}
                    accessibilityState={{ selected: 고름 }}
                    onPress={() => {
                      setCalendarMonth((지금) => ({ ...지금, value: 달 }));
                      setMonthPicker(false);
                    }}
                    style={[
                      styles.monthCell,
                      { backgroundColor: 고름 ? theme.secondary : theme.surfaceAlt },
                    ]}
                  >
                    <Text style={[styles.monthCellText, { color: 고름 ? (theme.dark ? theme.background : "#FFFFFF") : theme.text }]}>
                      {달}월
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.rangeWeek}>
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                <Text key={day} style={[styles.rangeWeekday, { color: theme.muted }]}>{day}</Text>
              ))}
            </View>
            <View style={styles.rangeGrid}>
              {cells.map((day, index) => {
                const valid = day > 0 && day <= days;
                const key = valid ? `${calendarMonth.year}-${String(calendarMonth.value).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
                // 아직 아무 날도 고르지 않았으면 빈 글자와 견주게 되어 모든 칸이
                // 고른 것처럼 칠해진다. 고른 날이 있을 때만 띠를 그린다.
                const edge = Boolean(key) && (key === start || key === end);
                const inRange = valid && Boolean(start) && key >= start && key <= (single ? start : end || start);
                const startsRange = Boolean(key) && key === start;
                const endsRange = Boolean(key) && key === (single ? start : end);
                return (
                  <Pressable
                    key={`${index}-${day}`}
                    disabled={!valid}
                    accessibilityRole={valid ? "button" : undefined}
                    accessibilityLabel={valid ? `${calendarMonth.value}월 ${day}일` : undefined}
                    accessibilityState={valid ? { selected: inRange } : undefined}
                    onPress={() => choose(key)}
                    style={styles.rangeDay}
                  >
                    {inRange && (
                      <View style={[
                        styles.rangeDayBand,
                        { backgroundColor: theme.dark ? `${theme.secondary}28` : `${theme.secondary}1F` },
                        (index % 7 === 0 || startsRange) && styles.rangeDayBandStart,
                        (index % 7 === 6 || endsRange) && styles.rangeDayBandEnd,
                        startsRange && styles.rangeDayBandFirst,
                        endsRange && styles.rangeDayBandLast,
                      ]} />
                    )}
                    {valid && (
                      <View style={[edge && styles.rangeDayCircle, edge && { backgroundColor: theme.secondary }]}>
                        <Text style={[
                          styles.rangeDayText,
                          { color: theme.muted },
                          // 오늘은 고르지 않았어도 어디쯤인지 보이게 진하게 둔다.
                          key === 오늘_키 && !inRange && { color: theme.text },
                          inRange && styles.rangeDayTextActive,
                          inRange && { color: theme.dark ? theme.secondary : theme.primary },
                          // 동그라미 안은 secondary 바탕이다. 다크 모드의 secondary 는
                          // 밝은 색이라 흰 글자를 얹으면 2.6:1 로 사라진다.
                          edge && { color: theme.dark ? theme.background : "#FFFFFF" },
                        ]}>{day}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 12, fontFamily: typo.label.family },
  rangeField: { marginBottom: 16 },
  rangeSummary: { minHeight: 62, borderRadius: 16, paddingHorizontal: 12, gap: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  rangeSummaryCopy: { flex: 1 },
  rangeSummaryLabel: { fontSize: 12, fontFamily: typo.label.family },
  rangeSummaryValue: { fontSize: 14, fontFamily: typo.data.family, marginTop: 4 },
  rangeNights: { minWidth: 42, height: 30, borderRadius: 12, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  rangeNightsText: { fontSize: 14, fontFamily: typo.data.family },
  rangeCalendar: { marginTop: 8, borderRadius: 16, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, borderWidth: 1 },
  rangeMonthHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  rangeMonthButton: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rangeMonthTitleHit: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 30, paddingHorizontal: 8 },
  rangeMonthTitle: { fontSize: 18, lineHeight: 26, fontFamily: typo.title.family },
  monthPicker: { paddingBottom: 4 },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // 한 줄에 넷씩. 셋씩 놓으면 칸이 커져 달력보다 판이 길어지고, 여섯씩이면 손가락에 모자란다.
  monthCell: { width: "23.5%", height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  monthCellText: { fontSize: 14, fontFamily: typo.label.family },
  rangeWeek: { flexDirection: "row", marginBottom: 2 },
  rangeWeekday: { width: "14.285%", fontSize: 12, fontFamily: typo.label.family, textAlign: "center" },
  rangeGrid: { flexDirection: "row", flexWrap: "wrap" },
  rangeDay: { width: "14.285%", height: 42, alignItems: "center", justifyContent: "center", position: "relative" },
  rangeDayBand: { position: "absolute", left: 0, right: 0, height: 30, top: 6 },
  rangeDayBandStart: { borderTopLeftRadius: 15, borderBottomLeftRadius: 15 },
  rangeDayBandEnd: { borderTopRightRadius: 15, borderBottomRightRadius: 15 },
  rangeDayBandFirst: { left: "50%" },
  rangeDayBandLast: { right: "50%" },
  rangeDayCircle: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  rangeDayText: { fontSize: 14, lineHeight: 17, fontFamily: typo.data.family, textAlign: "center" },
  rangeDayTextActive: { fontFamily: typo.label.family },
});
