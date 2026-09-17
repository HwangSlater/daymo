/**
 * 여행 메모와 일기를 서버와 오가는 모양. 맞추는 계산은 `listSync.ts` 가 한다.
 *
 * 메모의 작성자 줄(`하늘 · 오늘 10:42`)은 서버가 정한다. 앱이 보내는 것은 본문뿐이다.
 * 일기의 날짜 줄도 서버의 `writtenOn`(그 일기가 다루는 날)이나 쓴 날에서 만든다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { dateKey, dateLabelOf, isServerId, type Codec } from "./listSync.ts";
import type { RosterEntry } from "./tripSync.ts";

/** 앱의 메모(WarmTripDetail 의 TripNote)와 같은 모양. */
export type MemoRow = { id: string; author: string; body: string };

export type ServerMemo = {
  id: string;
  body: string;
  authorMembershipId: string | null;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
  version: number;
};

export type MemoBody = { body: string };

/** 휴지통의 한 줄(`GET /trips/{id}/trash`). 지운 뒤 7일 안의 메모와 사진이다. */
export type ServerTrashItem = {
  id: string;
  type: "memo" | "photo";
  tripId: string;
  /** 메모면 본문 앞 40자, 사진이면 설명. */
  preview: string | null;
  deletedAt: string;
  deletedByMembershipId: string | null;
  deletedByName: string;
  restoreDeadline: string;
  canRestore: boolean;
};

/** `3일 뒤 완전히 삭제돼요`. 하루가 안 남았으면 `오늘 완전히 삭제돼요`. */
export function trashLeftLabel(restoreDeadline: string, now: Date = new Date()): string {
  const left = new Date(restoreDeadline).getTime() - now.getTime();
  if (Number.isNaN(left)) return "";
  const days = Math.floor(left / 86_400_000);
  return days < 1 ? "오늘 완전히 삭제돼요" : `${days}일 뒤 완전히 삭제돼요`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `오늘 10:42`, `어제 22:15`, 그보다 전이면 `9월 12일`. */
export function memoStamp(at: string, now: Date = new Date()): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  const today = dateKey(now);
  const yesterday = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
  const clock = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  if (dateKey(when) === today) return `오늘 ${clock}`;
  if (dateKey(when) === yesterday) return `어제 ${clock}`;
  return dateLabelOf(dateKey(when));
}

/** 작성자 이름. 공간 사람 표의 이름을 먼저 쓴다. 겹치는 이름에 번호가 붙은 표라 누군지 갈린다. */
const authorOf = (roster: readonly RosterEntry[], id: string | null, fallback: string) =>
  (id ? roster.find((entry) => entry.id === id)?.name : undefined) ?? fallback;

export function memoCodec(roster: readonly RosterEntry[], now: () => Date = () => new Date()): Codec<MemoRow, MemoBody, ServerMemo> {
  return {
    syncable: (memo) => isServerId(memo.id),
    idOf: (memo) => memo.id,
    toBody: (memo) => ({ body: memo.body.trim().slice(0, 2000) || "빈 메모" }),
    fromServer: (row) => ({
      id: row.id,
      body: row.body,
      author: [authorOf(roster, row.authorMembershipId, row.authorName), memoStamp(row.createdAt, now()), row.editedAt ? "수정됨" : ""]
        .filter(Boolean)
        .join(" · "),
    }),
  };
}

// ---------------------------------------------------------------------------

/** 앱의 일기(TravelDiary). `writtenOn` 은 서버와 맞춘 뒤에 생긴다. */
export type DiaryRow = { id: string; title: string; body: string; date: string; writtenOn?: string };

export type ServerDiary = {
  id: string;
  title: string | null;
  body: string;
  writtenOn: string | null;
  authorMembershipId: string | null;
  authorName: string;
  createdAt: string;
  version: number;
};

export type DiaryBody = { title: string | null; body: string; writtenOn: string | null };

export const diaryCodec: Codec<DiaryRow, DiaryBody, ServerDiary> = {
  syncable: (diary) => isServerId(diary.id),
  idOf: (diary) => diary.id,
  toBody: (diary) => ({
    title: diary.title.trim().slice(0, 60) || null,
    body: diary.body.trim().slice(0, 20000) || "빈 일기",
    writtenOn: diary.writtenOn ?? null,
  }),
  fromServer: (row) => ({
    id: row.id,
    title: row.title ?? "",
    body: row.body,
    date: dateLabelOf(row.writtenOn ?? dateKey(new Date(row.createdAt))),
    ...(row.writtenOn ? { writtenOn: row.writtenOn } : {}),
  }),
};
