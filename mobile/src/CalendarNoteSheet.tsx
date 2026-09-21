import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Text, TextInput } from "./AppText";
import {
  NOTE_TITLE_MAX,
  draftProblem,
  personColor,
  type CalendarDraft,
  type CalendarNote,
  type CalendarNoteKind,
} from "./calendarNotes";
import { TripDateRangePicker } from "./TripDateRangePicker";
import type { AppTheme } from "./theme";
import { 높이, 모서리 } from "./theme/controls";
import { typo } from "./theme/typography";
import { Chip, ChipRow } from "./ui/Chip";
import { Segment } from "./ui/Segment";
import { SheetShell } from "./ui/SheetShell";
import { TimeWheel } from "./ui/TimeWheel";

/**
 * 캘린더에 일정·메모를 적는 창. 날짜를 눌러 열거나, 적어 둔 줄을 눌러 고친다.
 *
 * - 「일정」은 누가(나 또는 같이 쓰는 사람) 무엇을 하는지다. 여러 날(출장·휴가)이면
 *   끝 날을 고른다. 시각은 적고 싶을 때만.
 * - 「메모」는 사람 없이 그날에 붙는 한 줄이다(「숙소 결제 마감」).
 *
 * 공간 멤버 모두에게 보인다. 고치기·지우기는 만든 사람과 관리자만 한다.
 */
export function CalendarNoteSheet({
  theme,
  day,
  editing,
  members,
  myMembershipId,
  locked,
  onSave,
  onDelete,
  onClose,
}: {
  theme: AppTheme;
  /** 새로 적을 때 고른 날(`YYYY-MM-DD`). 고칠 때는 적어 둔 날을 쓴다. */
  day: string;
  /** 고치는 줄. 없으면 새로 적는다. */
  editing: CalendarNote | null;
  /** 지금 공간의 멤버(나 먼저). 색도 이 차례로 준다. */
  members: readonly { id: string; name: string }[];
  myMembershipId?: string;
  /** 고칠 수 없는 사람에게 연 창. 보기만 한다. */
  locked?: boolean;
  onSave: (draft: CalendarDraft) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  // 창은 열 때마다 새로 붙는다. 처음 값은 붙을 때 한 번만 읽는다.
  const [draft, setDraft] = useState<CalendarDraft>(() => editing
    ? {
        kind: editing.kind,
        membershipId: editing.membershipId,
        title: editing.title,
        startDate: editing.startDate,
        endDate: editing.endDate,
        time: editing.time,
      }
    : {
        kind: "schedule",
        membershipId: myMembershipId ?? members[0]?.id ?? null,
        title: "",
        startDate: day,
        endDate: day,
        time: null,
      });
  const [여러날, set여러날] = useState(() => Boolean(editing && editing.startDate !== editing.endDate));
  const [시각_적기, set시각_적기] = useState(() => Boolean(editing?.time));
  const 고칠것 = <K extends keyof CalendarDraft>(key: K, value: CalendarDraft[K]) =>
    setDraft((지금) => ({ ...지금, [key]: value }));
  const 문제 = draftProblem(draft);
  const 날짜_말 = `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;
  const 종류_말 = draft.kind === "memo" ? "메모" : "일정";

  return (
    <SheetShell
      theme={theme}
      visible
      title={editing ? `${종류_말} 수정` : `${날짜_말}에 추가`}
      submit={editing ? "저장" : `${종류_말} 추가`}
      onSubmit={() => onSave(draft)}
      submitDisabled={Boolean(문제)}
      disabledHint={문제 || undefined}
      destructiveLabel={editing && onDelete ? `${종류_말} 삭제` : undefined}
      destructiveMessage={`이 ${draft.kind === "memo" ? "메모를" : "일정을"} 삭제할까요? 같이 쓰는 사람들 캘린더에서도 사라져요.`}
      onDestructive={onDelete}
      locked={locked}
      lockedHint="만든 사람과 관리자만 수정할 수 있어요"
      hasUnsavedChanges={!editing && Boolean(draft.title.trim())}
      onClose={onClose}
    >
      <Text style={[styles.label, { color: theme.text }]}>종류</Text>
      <Segment
        theme={theme}
        label="종류"
        options={[{ value: "schedule", label: "일정" }, { value: "memo", label: "메모" }]}
        value={draft.kind}
        onChange={(value) => 고칠것("kind", value as CalendarNoteKind)}
      />

      {draft.kind === "schedule" && (
        <>
          <Text style={[styles.label, { color: theme.text }]}>누구</Text>
          <ChipRow scroll>
            {members.map((person) => (
              <Chip
                key={person.id}
                theme={theme}
                label={person.id === myMembershipId ? `${person.name}(나)` : person.name}
                on={draft.membershipId === person.id}
                onPress={() => 고칠것("membershipId", person.id)}
                // 고른 사람은 캘린더 점과 같은 색으로 칠한다. 어느 색이 누구인지 여기서 익힌다.
                colors={draft.membershipId === person.id
                  ? { background: `${personColor(person.id, members)}1F`, border: personColor(person.id, members), text: personColor(person.id, members) }
                  : undefined}
              />
            ))}
          </ChipRow>
        </>
      )}

      <Text style={[styles.label, { color: theme.text }]}>내용</Text>
      <TextInput
        accessibilityLabel={`${종류_말} 내용`}
        value={draft.title}
        onChangeText={(text) => 고칠것("title", text.slice(0, NOTE_TITLE_MAX))}
        placeholder={draft.kind === "memo" ? "예: 전주 숙소 결제 마감" : "예: 부산 출장"}
        placeholderTextColor={theme.muted}
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
      />

      <Text style={[styles.label, { color: theme.text }]}>날짜</Text>
      <Segment
        theme={theme}
        label="날짜"
        options={[{ value: "하루", label: "하루" }, { value: "여러 날", label: "여러 날" }]}
        value={여러날 ? "여러 날" : "하루"}
        onChange={(value) => {
          const 여럿 = value === "여러 날";
          set여러날(여럿);
          // 하루로 돌리면 끝 날을 첫날에 맞춘다. 남겨 두면 보이지 않는 기간이 저장된다.
          if (!여럿) 고칠것("endDate", draft.startDate);
        }}
      />
      {여러날 && (
        <View style={styles.range}>
          <TripDateRangePicker
            theme={theme}
            start={draft.startDate}
            end={draft.endDate}
            setStart={(value) => 고칠것("startDate", value)}
            setEnd={(value) => 고칠것("endDate", value)}
            summaryLabel="고른 기간"
          />
        </View>
      )}

      <Text style={[styles.label, { color: theme.text }]}>시각 (선택)</Text>
      <Segment
        theme={theme}
        label="시각"
        options={[{ value: "없음", label: "하루 종일" }, { value: "적기", label: "시각 적기" }]}
        value={시각_적기 ? "적기" : "없음"}
        onChange={(value) => {
          const 적기 = value === "적기";
          set시각_적기(적기);
          고칠것("time", 적기 ? draft.time ?? "19:00" : null);
        }}
      />
      {시각_적기 && (
        <View style={styles.time}>
          <TimeWheel
            theme={theme}
            label="시각"
            value={draft.time ?? ""}
            fallback="19:00"
            onChange={(value) => 고칠것("time", value)}
          />
        </View>
      )}
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12.5, fontFamily: typo.label.family, marginTop: 14, marginBottom: 7 },
  input: {
    minHeight: 높이.입력,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: typo.body.family,
  },
  range: { marginTop: 10 },
  time: { marginTop: 10 },
});
