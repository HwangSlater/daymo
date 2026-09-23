/**
 * 여행 탭 캘린더의 셈.
 *
 * 캘린더에는 여행과 함께 **같이 쓰는 사람들의 일정**(「여울 · 부산 출장」)과 **날짜에
 * 붙는 메모**(「전주 숙소 결제 마감」)가 오른다. 여행 날짜를 잡을 때 누가 바쁜지 보려는
 * 것이다. 여행이 이 앱의 주인공이라 여행은 이름이 적힌 막대로 날짜를 건너 잇고,
 * 일정·메모는 날짜 아래 색 점으로만 찍는다(점 색이 곧 사람이다). 자세한 것은 날짜를
 * 누르면 아래 목록에서 읽는다.
 *
 * 일정·메모는 여행이 아니라 공간에 붙는다(`/v1/spaces/{id}/calendar-notes`).
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { dayKeyOf } from "./dates.ts";

export type CalendarNoteKind = "schedule" | "memo";

/** 서버와 앱이 같은 모양으로 쓴다. 날짜는 `YYYY-MM-DD`, 시각은 `HH:MM`. */
export type CalendarNote = {
  id: string;
  kind: CalendarNoteKind;
  /** 일정이면 그 사람. 메모는 사람이 없다. */
  membershipId: string | null;
  title: string;
  startDate: string;
  endDate: string;
  time: string | null;
  createdByMembershipId: string | null;
  version: number;
};

/** 캘린더가 쓰는 여행의 몫. 앱의 여행 모양을 그대로 넘겨도 된다. */
export type CalendarTrip = { name: string; start: string; end: string };

/**
 * 사람마다의 색. 공간 멤버 표의 차례대로 준다(나는 늘 첫째라 늘 같은 색이다).
 *
 * 빨강·초록은 일요일·토요일 글자색과 겹치지 않게 조금 누른 색이다.
 */
export const PERSON_COLORS = ["#3F4C8F", "#B3413E", "#2E7D5B", "#A2661A", "#7A4E9C", "#2F7C95"] as const;

/** 사람 없는 메모의 점. 누구의 일도 아니라서 회색이다. */
export const MEMO_COLOR = "#9AA1AE";

/** 이 사람의 색. 표에 없는 사람(나간 멤버)은 메모와 같은 회색이다. */
export function personColor(membershipId: string | null, roster: readonly { id: string }[]): string {
  const 차례 = membershipId ? roster.findIndex((person) => person.id === membershipId) : -1;
  return 차례 < 0 ? MEMO_COLOR : PERSON_COLORS[차례 % PERSON_COLORS.length];
}

/**
 * 한 달을 그리는 칸. 앞뒤 달 날짜로 주를 채운다(아이폰 캘린더처럼 흐리게 보인다).
 *
 * `inMonth` 가 거짓인 칸은 흐리게 그리고 누르지 못하게 한다.
 */
export function monthCells(year: number, month: number): { key: string; day: number; inMonth: boolean }[] {
  const 첫날_요일 = new Date(year, month - 1, 1).getDay();
  const 날수 = new Date(year, month, 0).getDate();
  const 칸수 = Math.ceil((첫날_요일 + 날수) / 7) * 7;
  return Array.from({ length: 칸수 }, (_, 차례) => {
    const 날짜 = new Date(year, month - 1, 1 + 차례 - 첫날_요일);
    return {
      key: dayKeyOf(날짜.getFullYear(), 날짜.getMonth() + 1, 날짜.getDate()),
      day: 날짜.getDate(),
      inMonth: 날짜.getMonth() === month - 1,
    };
  });
}

/** 이 달 그림에 보이는 첫날·끝날. 일정·메모를 받아 올 범위다. */
export function visibleRange(year: number, month: number): { from: string; to: string } {
  const 칸 = monthCells(year, month);
  return { from: 칸[0].key, to: 칸[칸.length - 1].key };
}

/**
 * 한 주 줄에 놓이는 여행 막대 하나.
 *
 * `startCol`·`endCol` 은 그 주에서의 칸(0=일요일). 여행이 주를 넘기면 줄마다 한 토막씩
 * 나온다. 이름은 여행이 시작하는 토막과, 주가 바뀌어 새 줄에서 이어지는 토막에만 적는다
 * (아이폰 캘린더도 줄마다 이름을 다시 적는다). `lane` 은 같은 줄에 여행이 겹칠 때의 층이다.
 */
export type TripBar = {
  trip: CalendarTrip;
  week: number;
  startCol: number;
  endCol: number;
  lane: number;
  /** 여행의 첫날이 이 토막에 있는지. 왼쪽 끝을 둥글게 한다. */
  startsHere: boolean;
  /** 여행의 끝날이 이 토막에 있는지. 오른쪽 끝을 둥글게 한다. */
  endsHere: boolean;
};

/** 한 줄에 쌓는 여행 층의 끝. 넘치는 여행은 막대 대신 날짜를 누르면 목록에 나온다. */
export const MAX_TRIP_LANES = 2;

export function tripBars(trips: readonly CalendarTrip[], year: number, month: number): TripBar[] {
  const 칸 = monthCells(year, month);
  const 주수 = 칸.length / 7;
  const 막대: TripBar[] = [];
  // 긴 여행을 먼저 놓아야 짧은 여행이 그 옆 빈 층에 들어간다.
  const 차례 = [...trips].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  for (let 주 = 0; 주 < 주수; 주 += 1) {
    const 첫 = 칸[주 * 7].key;
    const 끝 = 칸[주 * 7 + 6].key;
    const 쓴_층: [number, number][][] = [];
    for (const trip of 차례) {
      if (trip.end < 첫 || trip.start > 끝) continue;
      const startCol = Math.max(0, 칸.slice(주 * 7, 주 * 7 + 7).findIndex((하나) => 하나.key >= trip.start));
      const 끝칸 = 칸.slice(주 * 7, 주 * 7 + 7).map((하나) => 하나.key <= trip.end).lastIndexOf(true);
      const endCol = 끝칸 < 0 ? 6 : 끝칸;
      let lane = 0;
      while (lane < MAX_TRIP_LANES && (쓴_층[lane] ?? []).some(([가, 나]) => !(endCol < 가 || startCol > 나))) lane += 1;
      if (lane >= MAX_TRIP_LANES) continue;
      (쓴_층[lane] ??= []).push([startCol, endCol]);
      막대.push({
        trip,
        week: 주,
        startCol,
        endCol,
        lane,
        startsHere: trip.start >= 첫,
        endsHere: trip.end <= 끝,
      });
    }
  }
  return 막대;
}

/** 그날에 걸친 일정·메모. 일정이 먼저, 그다음 시각 순, 시각 없는 것은 뒤. */
export function notesOnDay(notes: readonly CalendarNote[], key: string): CalendarNote[] {
  return notes
    .filter((note) => note.startDate <= key && note.endDate >= key)
    .sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "schedule" ? -1 : 1)
      || (a.time ?? "99:99").localeCompare(b.time ?? "99:99")
      || a.title.localeCompare(b.title));
}

/**
 * 날짜 아래 찍을 점의 색. 사람마다 한 점, 메모는 회색 한 점. 셋까지만 찍는다.
 *
 * 한 사람이 그날 일정이 둘이어도 점은 하나다. 점은 「누가 바쁜가」를 보여 주는 것이지
 * 몇 개인지를 세는 것이 아니다.
 */
export function dotColors(
  notes: readonly CalendarNote[],
  key: string,
  roster: readonly { id: string }[],
  max = 3,
): string[] {
  const 색: string[] = [];
  for (const note of notesOnDay(notes, key)) {
    const 하나 = note.kind === "memo" ? MEMO_COLOR : personColor(note.membershipId, roster);
    if (!색.includes(하나)) 색.push(하나);
  }
  return 색.slice(0, max);
}

/** 추가·고치기 창이 들고 있는 값. */
export type CalendarDraft = {
  kind: CalendarNoteKind;
  membershipId: string | null;
  title: string;
  startDate: string;
  endDate: string;
  time: string | null;
};

/** 서버와 같은 한도. 넘으면 서버가 422 로 막는다. */
export const NOTE_TITLE_MAX = 60;
export const NOTE_SPAN_DAYS_MAX = 60;

/**
 * 저장하지 못하는 까닭. 저장할 수 있으면 빈 글자.
 *
 * 저장 단추 아래 한 줄로 알린다. 서버가 막기 전에 여기서 먼저 막는다.
 */
export function draftProblem(draft: CalendarDraft): string {
  if (!draft.title.trim()) return draft.kind === "memo" ? "메모 내용을 입력해 주세요" : "일정 내용을 입력해 주세요";
  if (draft.title.trim().length > NOTE_TITLE_MAX) return `${NOTE_TITLE_MAX}자까지 적을 수 있어요`;
  if (draft.kind === "schedule" && !draft.membershipId) return "누구의 일정인지 골라 주세요";
  if (draft.endDate < draft.startDate) return "끝나는 날이 시작하는 날보다 빨라요";
  const 날수 = Math.round((Date.parse(`${draft.endDate}T00:00:00Z`) - Date.parse(`${draft.startDate}T00:00:00Z`)) / 86_400_000) + 1;
  if (날수 > NOTE_SPAN_DAYS_MAX) return `${NOTE_SPAN_DAYS_MAX}일까지 이어서 적을 수 있어요`;
  return "";
}

/** 서버로 보내는 몸. */
export type CalendarNoteBody = CalendarDraft;

/** 서버로 보낼 몸. 메모는 사람을 비워 보낸다. */
export function draftBody(draft: CalendarDraft): CalendarNoteBody {
  return {
    kind: draft.kind,
    membershipId: draft.kind === "memo" ? null : draft.membershipId,
    title: draft.title.trim(),
    startDate: draft.startDate,
    endDate: draft.endDate,
    time: draft.time,
  };
}

/** 목록 한 줄의 둘째 줄. 여러 날이면 기간, 시각이 있으면 시각, 메모면 「메모」. */
export function noteMeta(note: Pick<CalendarNote, "kind" | "startDate" | "endDate" | "time">): string {
  const 날 = (key: string) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;
  const 조각: string[] = [];
  if (note.startDate !== note.endDate) 조각.push(`${날(note.startDate)} — ${날(note.endDate)}`);
  if (note.time) 조각.push(note.time);
  if (!조각.length) 조각.push(note.kind === "memo" ? "메모" : "하루 종일");
  return 조각.join(" · ");
}
