/**
 * 공지에서 읽은 초안을 **이미 있는 여행**에 채워 넣는다.
 *
 * 여행을 새로 만들지 않는다. 예전에 카카오톡 공지로 관리하던 글을 나중에 옮기는
 * 자리라, 여행은 이미 앱에 있고 속이 비어 있다.
 *
 * 서버로 가는 길은 기존 것을 그대로 쓴다(`serverData.ts`). 여기서는 무엇을 어떤
 * 차례로 만들지만 정하고 부르는 쪽이 함수를 넣어 준다. 그래서 이 파일도 expo 나
 * react-native 를 가져오지 않고 `node --test` 로 시험한다.
 *
 * 하나가 실패해도 멈추지 않는다. 끝까지 간 뒤 무엇을 넣었고 무엇이 겹쳐서
 * 건너뛰었고 무엇이 실패했는지 함께 돌려준다.
 */

import type { ChecklistItemBody, RecipeBody } from "./cookingSync.ts";
import type { MemoBody } from "./memorySync.ts";
import type { TransportBody } from "./bookingSync.ts";
import type { ScheduleBody, StayBody } from "./scheduleSync.ts";
import type { PlaceBody } from "./placeSync.ts";
import type { RosterEntry } from "./tripSync.ts";
import { blank, safeUrl } from "./placeSync.ts";
import { tidyTags } from "./cookingSync.ts";
import type { NoticeDraft, NoticeTransport } from "./noticeImport.ts";

export type NoticeImportApi = {
  /** 앱이 만든 id 로 담는다. 같은 id 로 다시 보내도 하나만 생긴다. */
  newId: () => string;
  createPlace: (tripId: string, id: string, body: PlaceBody) => Promise<unknown>;
  createStay: (tripId: string, id: string, body: StayBody) => Promise<unknown>;
  createTransport: (tripId: string, id: string, body: TransportBody) => Promise<unknown>;
  createScheduleItem: (tripId: string, id: string, body: ScheduleBody) => Promise<unknown>;
  createRecipe: (tripId: string, id: string, body: RecipeBody) => Promise<unknown>;
  createChecklistItem: (tripId: string, id: string, body: ChecklistItemBody) => Promise<unknown>;
  createMemo: (tripId: string, id: string, body: MemoBody) => Promise<unknown>;
};

export type NoticeImportOptions = {
  tripId: string;
  /**
   * 여행 기간의 날짜. 서버는 기간 밖 날짜를 받지 않으므로 여기 없는 날은
   * 날짜 없이 넣는다.
   */
  tripDates: readonly string[];
  /** 공간 사람 표. 준비물·교통편 담당 이름을 membership id 로 옮기는 데 쓴다. */
  roster: readonly RosterEntry[];
  /** 읽지 못한 줄을 여행 메모로 남길지. */
  keepLeftovers: boolean;
  /** 겹쳐서 건너뛴 개수. 화면이 미리 꺼 둔 것을 그대로 전한다. */
  skipped?: number;
};

export type NoticeImportResult = {
  /** 넣은 것을 종류별로 몇 개씩. */
  made: { label: string; count: number }[];
  /** 이미 있어서 건너뛴 개수. */
  skipped: number;
  /** 넣다가 실패한 것. 어디까지 들어갔는지 사용자에게 그대로 보여 준다. */
  failed: { label: string; message: string }[];
};

/** 미리 보기에 쓰는 개수. `장소 4 · 요리 6 · 준비물 8` */
export function noticeCounts(draft: NoticeDraft): { label: string; count: number }[] {
  return [
    { label: "장소", count: draft.places.length },
    { label: "숙소", count: draft.stays.length },
    { label: "교통편", count: draft.transports.length },
    { label: "일정", count: draft.schedule.length },
    { label: "요리", count: draft.recipes.length },
    { label: "재료", count: draft.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0) },
    { label: "준비물", count: draft.packing.length },
    { label: "메모", count: draft.memos.length },
    { label: "읽지 못한 줄", count: draft.leftovers.length },
  ].filter((row) => row.count > 0);
}

// ---------------------------------------------------------------------------
// 이미 있는 것 가려내기
// ---------------------------------------------------------------------------

/** 여행에 이미 들어 있는 것의 이름. 겹치는 줄을 가리는 데만 쓴다. */
export type ExistingTripContent = {
  places?: readonly string[];
  stays?: readonly string[];
  transports?: readonly string[];
  schedule?: readonly string[];
  recipes?: readonly string[];
  packing?: readonly string[];
  memos?: readonly string[];
};

/** 이름을 견줄 때 쓰는 모양. 띄어쓰기와 대소문자는 무시한다. */
const same = (value: string) => value.replace(/\s+/g, "").toLowerCase();

/** 교통편은 이름이 없다. 방향과 구간으로 견준다. */
export const transportKeyOf = (transport: Pick<NoticeTransport, "direction" | "departure" | "arrival">) =>
  same(`${transport.direction}${transport.departure}${transport.arrival}`);

/**
 * 이미 여행에 있는 줄의 열쇠(`장소:0`)를 돌려준다.
 *
 * 화면은 이 줄들을 미리 꺼 두고 "이미 있어요" 라고 적는다. 지우지는 않는다.
 * 같은 이름이어도 다른 것일 수 있어서 사람이 다시 켤 수 있어야 한다.
 */
export function duplicateKeys(draft: NoticeDraft, existing: ExistingTripContent): string[] {
  const has = (values: readonly string[] | undefined, value: string) =>
    (values ?? []).some((candidate) => same(candidate) === same(value));
  const keys: string[] = [];
  draft.places.forEach((place, index) => {
    if (has(existing.places, place.name)) keys.push(`장소:${index}`);
  });
  draft.stays.forEach((stay, index) => {
    // 숙소는 장소로도 들어간다. 둘 중 하나에 있으면 겹친 것이다.
    if (has(existing.stays, stay.name) || has(existing.places, stay.name)) keys.push(`숙소:${index}`);
  });
  draft.transports.forEach((transport, index) => {
    if ((existing.transports ?? []).some((key) => same(key) === transportKeyOf(transport))) {
      keys.push(`교통:${index}`);
    }
  });
  draft.schedule.forEach((item, index) => {
    if (has(existing.schedule, item.title)) keys.push(`일정:${index}`);
  });
  draft.recipes.forEach((recipe, index) => {
    if (has(existing.recipes, recipe.name)) keys.push(`요리:${index}`);
  });
  draft.packing.forEach((item, index) => {
    if (has(existing.packing, item.name)) keys.push(`준비:${index}`);
  });
  draft.memos.forEach((memo, index) => {
    if (has(existing.memos, memo)) keys.push(`메모:${index}`);
  });
  return keys;
}

// ---------------------------------------------------------------------------
// 넣기
// ---------------------------------------------------------------------------

const PACKING_SHARED = "공용";

/** 이보다 길면 태그가 아니라 메모로 본다. 태그는 서버에서 20자까지다. */
const MAX_TAG_TEXT = 20;

const messageOf = (caught: unknown) =>
  caught instanceof Error && caught.message ? caught.message : "알 수 없는 문제가 생겼어요";

const placeBodyOf = (name: string, address: string, mapUrl: string, note: string): PlaceBody => ({
  name: name.trim().slice(0, 100) || "이름 없는 장소",
  area: null,
  address: blank(address, 300),
  category: "장소",
  status: "saved",
  // 공지의 `[담에 가용]` 같은 짧은 표시는 태그로, 그 밖의 말은 장소 메모로 둔다.
  tags: note && note.length <= MAX_TAG_TEXT ? tidyTags([note]) : [],
  memo: note && note.length > MAX_TAG_TEXT ? blank(note, 2000) : null,
  mapUrl: safeUrl(mapUrl),
});

/** `15:00` 을 그 날의 서버 시각으로. 날짜나 시각이 없으면 비운다. */
const localTime = (date: string | undefined, clock: string) => (date && clock ? `${date}T${clock}` : null);

/**
 * 공지 초안대로 이미 있는 여행을 채운다.
 *
 * 켜고 끄는 것은 화면이 미리 끝낸다. 여기 들어오는 초안은 넣을 것만 남은 것이다.
 */
export async function runNoticeImport(
  draft: NoticeDraft,
  options: NoticeImportOptions,
  api: NoticeImportApi,
): Promise<NoticeImportResult> {
  const { tripId, tripDates } = options;
  const firstDay = tripDates[0];
  const lastDay = tripDates[tripDates.length - 1];
  const made: { label: string; count: number }[] = [];
  const failed: { label: string; message: string }[] = [];
  /** `kind` 는 몇 개 넣었는지 세는 이름, `label` 은 실패했을 때 보여 줄 이름이다. */
  const attempt = async (kind: string, label: string, run: () => Promise<unknown>) => {
    try {
      await run();
      const row = made.find((item) => item.label === kind);
      if (row) row.count += 1;
      else made.push({ label: kind, count: 1 });
      return true;
    } catch (caught) {
      failed.push({ label, message: messageOf(caught) });
      return false;
    }
  };

  for (const place of draft.places) {
    await attempt("장소", `장소 ${place.name}`, () =>
      api.createPlace(tripId, api.newId(), placeBodyOf(place.name, place.address, place.mapUrl, place.note)));
  }

  // 서버 숙소에는 이름·주소 칸이 없다. 장소를 먼저 만들고 거기에 붙인다.
  for (const stay of draft.stays) {
    const placeId = api.newId();
    const madePlace = await attempt("숙소", `숙소 ${stay.name}`, () =>
      api.createPlace(tripId, placeId, placeBodyOf(stay.name, stay.address, stay.mapUrl, "숙소")));
    if (!madePlace) continue;
    await attempt("숙소 정보", `숙소 ${stay.name} 체크인`, () =>
      api.createStay(tripId, api.newId(), {
        tripPlaceId: placeId,
        checkInAt: localTime(firstDay, stay.checkIn),
        checkOutAt: localTime(lastDay, stay.checkOut),
        showInSchedule: true,
      }));
  }

  for (const transport of draft.transports) {
    const date = (transport.direction === "오는 편" ? lastDay : firstDay) ?? "";
    await attempt("교통편", `교통편 ${transport.departure} → ${transport.arrival}`, () =>
      api.createTransport(tripId, api.newId(), {
        direction: transport.direction === "오는 편" ? "return" : "outbound",
        method: transport.method === "KTX" ? "ktx"
          : transport.method === "SRT" ? "srt"
            : transport.method === "버스" ? "bus"
              : transport.method === "항공" ? "flight" : "other",
        date: date || null,
        departureName: blank(transport.departure, 40),
        departureTime: date ? transport.departureTime : null,
        arrivalName: blank(transport.arrival, 40),
        arrivalTime: date ? transport.arrivalTime : null,
        ownerMembershipId: options.roster.find((entry) => entry.name === transport.owner)?.id ?? null,
        bookingStatus: transport.booked ? "booked" : "not_booked",
        note: null,
        showInSchedule: true,
      }));
  }

  for (const item of draft.schedule) {
    // 여행 기간 밖의 날짜는 서버가 받지 않는다. 지어내지 않고 날짜 없이 넣는다.
    const date = item.date && tripDates.includes(item.date) ? item.date : null;
    await attempt("일정", `일정 ${item.title}`, () =>
      api.createScheduleItem(tripId, api.newId(), {
        date,
        time: date && item.time ? item.time : null,
        title: item.title.trim().slice(0, 60) || "이름 없는 일정",
        type: item.type,
        note: blank(item.note, 2000),
        tripPlaceId: null,
        mapUrl: null,
      }));
  }

  for (const recipe of draft.recipes) {
    await attempt("요리", `요리 ${recipe.name}`, () =>
      api.createRecipe(tripId, api.newId(), {
        name: recipe.name.trim().slice(0, 60) || "이름 없는 요리",
        memo: blank(recipe.note, 2000),
        sourceUrl: null,
        // 재료도 앱이 id 를 붙여 보낸다. 없이 보내면 서버가 새 id 를 붙여
        // 돌아온 모습과 기기 모습이 늘 다르다(`cookingSync.ts`).
        ingredients: recipe.ingredients.slice(0, 100).map((item) => ({
          id: api.newId(),
          name: item.name.trim().slice(0, 60) || "이름 없는 재료",
          quantity: blank(item.quantity, 60),
          category: blank(item.group, 30),
          procurement: item.buy ? "buy" : "undecided",
          ownerMembershipId: null,
          ready: false,
        })),
      }));
  }

  for (const item of draft.packing) {
    const owner = options.roster.find((entry) => entry.name === item.owner);
    await attempt("준비물", `준비물 ${item.name}`, () =>
      api.createChecklistItem(tripId, api.newId(), {
        name: item.name.trim().slice(0, 60) || "이름 없는 준비물",
        quantity: blank(item.quantity, 60),
        ownerMembershipId: owner?.id ?? null,
        isShared: item.owner === PACKING_SHARED,
        completed: false,
        // 공간 사람 표에 없는 이름은 담당으로 쓸 수 없다. 태그로 남겨 둔다.
        tags: !owner && item.owner && item.owner !== PACKING_SHARED ? tidyTags([item.owner]) : [],
        sourceIngredientId: null,
      }));
  }

  const memos = [...draft.memos];
  const extras = draft.stays
    .filter((stay) => stay.bookingUrl)
    .map((stay) => `${stay.name} 예약: ${stay.bookingUrl}`);
  if (extras.length) memos.push(extras.join("\n"));
  if (options.keepLeftovers && draft.leftovers.length) {
    memos.push(["공지에서 읽지 못한 줄", ...draft.leftovers.map((line) => `- ${line}`)].join("\n"));
  }
  for (const body of memos) {
    await attempt("메모", "메모", () => api.createMemo(tripId, api.newId(), { body: body.slice(0, 2000) || "빈 메모" }));
  }

  return { made, skipped: options.skipped ?? 0, failed };
}

/**
 * 넣고 나서 사용자에게 보여 줄 한 줄.
 *
 * 실패가 있으면 어디까지 넣었는지 먼저 적는다. 여행은 그대로 있으니 처음부터
 * 다시 하는 것이 아니라 못 넣은 것만 손으로 채우면 된다.
 */
export function noticeImportReport(result: NoticeImportResult): string {
  const head = result.made.map((row) => `${row.label} ${row.count}개`).join(" · ");
  const skipped = result.skipped ? ` 이미 있던 ${result.skipped}개는 건너뛰었어요.` : "";
  if (!result.failed.length) {
    return (head ? `${head}를 추가했어요.` : "추가한 것이 없어요.") + skipped;
  }
  const first = result.failed[0];
  return `${head ? `${head}까지 추가했어요.` : "아무것도 추가하지 못했어요."}${skipped} ${result.failed.length}개는 추가하지 못했어요 (${first.label}: ${first.message})`;
}
