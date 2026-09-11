import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { Glyph } from "./Glyph";
import { AppTheme } from "./theme";
import { typo } from "./theme/typography";

export function formatTripRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const nights = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
  return `${startDate.getMonth() + 1}월 ${startDate.getDate()}일 — ${endDate.getMonth() + 1}월 ${endDate.getDate()}일 · ${nights ? `${nights}박 ${nights + 1}일` : "당일"}`;
}

export function TripDateRangePicker({ theme, start, end, setStart, setEnd }: {
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
  const firstDay = new Date(calendarMonth.year, calendarMonth.value - 1, 1).getDay();
  const days = new Date(calendarMonth.year, calendarMonth.value, 0).getDate();
  const cellCount = Math.ceil((firstDay + days) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => index - firstDay + 1);
  const move = (amount: number) => {
    const next = new Date(calendarMonth.year, calendarMonth.value - 1 + amount, 1);
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
  const nights = Math.max(0, Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000));
  return (
    <View style={styles.rangeField}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>기간</Text>
      <View style={styles.rangeSummary}>
        <View>
          <Text style={[styles.rangeSummaryLabel, { color: theme.primary }]}>
            {selectingEnd ? "마지막 날을 선택하세요" : "선택한 여행 기간"}
          </Text>
          <Text style={styles.rangeSummaryValue}>{formatTripRange(start, end)}</Text>
        </View>
        <View style={styles.rangeNights}>
          <Text style={styles.rangeNightsText}>{nights ? `${nights}박` : "당일"}</Text>
        </View>
      </View>
      <View style={[styles.rangeCalendar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.rangeMonthHead}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => move(-1)} style={[styles.rangeMonthButton, { backgroundColor: theme.surfaceAlt }]}>
            <Glyph name="chevronLeft" size={20} color={theme.text} />
          </Pressable>
          <Text style={[styles.rangeMonthTitle, { color: theme.text }]}>
            {calendarMonth.year}. {String(calendarMonth.value).padStart(2, "0")}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => move(1)} style={[styles.rangeMonthButton, { backgroundColor: theme.surfaceAlt }]}>
            <Glyph name="chevronRight" size={20} color={theme.text} />
          </Pressable>
        </View>
        <View style={styles.rangeWeek}>
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <Text key={day} style={[styles.rangeWeekday, { color: theme.muted }]}>{day}</Text>
          ))}
        </View>
        <View style={styles.rangeGrid}>
          {cells.map((day, index) => {
            const valid = day > 0 && day <= days;
            const key = valid ? `${calendarMonth.year}-${String(calendarMonth.value).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
            const edge = key === start || key === end;
            const inRange = valid && key >= start && key <= end;
            const startsRange = key === start;
            const endsRange = key === end;
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
                      inRange && styles.rangeDayTextActive,
                      inRange && { color: theme.dark ? theme.secondary : "#087D70" },
                      edge && styles.rangeDayTextEdge,
                    ]}>{day}</Text>
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

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 12, fontFamily: typo.label.family },
  rangeField: { marginBottom: 16 },
  rangeSummary: { minHeight: 62, borderRadius: 16, paddingHorizontal: 12, backgroundColor: "#17233D", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  rangeSummaryLabel: { color: "#5ED8C9", fontSize: 12, fontFamily: typo.label.family },
  rangeSummaryValue: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.data.family, marginTop: 4 },
  rangeNights: { minWidth: 42, height: 30, borderRadius: 12, paddingHorizontal: 8, backgroundColor: "#263657", alignItems: "center", justifyContent: "center" },
  rangeNightsText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.data.family },
  rangeCalendar: { marginTop: 8, borderRadius: 16, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, borderWidth: 1 },
  rangeMonthHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  rangeMonthButton: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rangeMonthTitle: { fontSize: 18, fontFamily: typo.title.family },
  rangeWeek: { flexDirection: "row", marginBottom: 2 },
  rangeWeekday: { width: "14.285%", fontSize: 12, fontFamily: typo.label.family, textAlign: "center" },
  rangeGrid: { flexDirection: "row", flexWrap: "wrap" },
  rangeDay: { width: "14.285%", height: 34, alignItems: "center", justifyContent: "center", position: "relative" },
  rangeDayBand: { position: "absolute", left: 0, right: 0, height: 26, top: 4 },
  rangeDayBandStart: { borderTopLeftRadius: 13, borderBottomLeftRadius: 13 },
  rangeDayBandEnd: { borderTopRightRadius: 13, borderBottomRightRadius: 13 },
  rangeDayBandFirst: { left: "50%" },
  rangeDayBandLast: { right: "50%" },
  rangeDayCircle: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  rangeDayText: { fontSize: 14, lineHeight: 17, fontFamily: typo.data.family, textAlign: "center" },
  rangeDayTextActive: { fontFamily: typo.label.family },
  rangeDayTextEdge: { color: "#FFFFFF" },
});
