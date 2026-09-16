/**
 * 여행 기록을 읽을 만한 글(마크다운)로 만든다.
 *
 * 앱을 지우기 전이나 다른 곳에 남겨 두고 싶을 때 쓰는 글이다. 그래서 화면에
 * 보이던 말을 그대로 옮긴다. 날짜는 `1일(금)` 처럼 일정 탭이 쓰는 이름표이고,
 * 돈은 여행 통화로 적는다. 다시 읽어 들이는 형식이 아니라 사람이 읽는 글이다.
 *
 * 사진은 파일을 담지 않는다. 글 하나로 주고받는 것이라 설명과 날짜만 적는다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { money } from "./tripExpenses.ts";

/** 내보낼 때 읽는 기록의 칸. 화면의 `TripPlanningData` 중 쓰는 것만. */
export type ExportPlace = {
  name: string;
  category?: string;
  area?: string;
  address?: string;
  tags?: readonly string[];
};
export type ExportScheduleItem = { date?: string; time?: string; title: string; note?: string };
export type ExportStay = { name?: string; checkin?: string; checkout?: string; address?: string };
export type ExportPackingItem = { id: string; name: string; quantity?: string; owner?: string };
export type ExportIngredient = { name: string; quantity?: string; group?: string; owner?: string };
export type ExportRecipe = { name: string; note?: string; url?: string; ingredients?: readonly ExportIngredient[] };
export type ExportExpense = {
  day?: string;
  title: string;
  amount: number;
  category?: string;
  payer?: string;
  memo?: string;
};
export type ExportPayment = { from: string; to: string; amount: number };
export type ExportNote = { author?: string; body: string };
export type ExportDiary = { title?: string; date?: string; body?: string };
export type ExportPhoto = { date?: string; caption?: string };

export type ExportPlanning = {
  stay?: ExportStay;
  schedule?: readonly ExportScheduleItem[];
  places?: readonly ExportPlace[];
  packingItems?: readonly ExportPackingItem[];
  packingDone?: readonly string[];
  recipes?: readonly ExportRecipe[];
  expenses?: readonly ExportExpense[];
  payments?: readonly ExportPayment[];
  currency?: string;
  tripNotes?: readonly ExportNote[];
  memories?: { diaries?: readonly ExportDiary[]; photos?: readonly ExportPhoto[] };
};

export type ExportTrip = {
  name: string;
  /** 화면에 보이는 기간 줄. `10월 1일 — 10월 3일` */
  date: string;
  region?: string;
  note?: string;
  start?: string;
  planning?: ExportPlanning;
};

const clean = (value: string | undefined | null) => (value ?? "").trim();

/** 여러 줄 글을 목록 아래에 들여 쓴다. 마크다운에서 한 덩어리로 읽힌다. */
const indent = (value: string) =>
  clean(value)
    .split("\n")
    .map((line) => `  ${line.trim()}`)
    .join("\n");

const joinDot = (parts: (string | undefined)[]) => parts.map(clean).filter(Boolean).join(" · ");

/** 여행 하나에서 사람이 읽을 것이 하나라도 있는지. 없으면 그렇게 적는다. */
export function hasRecords(planning: ExportPlanning | undefined): boolean {
  if (!planning) return false;
  const counts = [
    planning.schedule?.length,
    planning.places?.length,
    planning.packingItems?.length,
    planning.recipes?.length,
    planning.expenses?.length,
    planning.payments?.length,
    planning.tripNotes?.length,
    planning.memories?.diaries?.length,
    planning.memories?.photos?.length,
  ];
  return counts.some((count) => (count ?? 0) > 0) || Boolean(clean(planning.stay?.name));
}

const staySection = (stay: ExportStay | undefined): string[] => {
  const name = clean(stay?.name);
  if (!name) return [];
  const when = [clean(stay?.checkin), clean(stay?.checkout)].filter(Boolean).join(" → ");
  const lines = ["### 숙소", `- ${when ? `${name} — ${when}` : name}`];
  const address = clean(stay?.address);
  if (address) lines.push(`  주소: ${address}`);
  return lines;
};

const scheduleSection = (items: readonly ExportScheduleItem[]): string[] => {
  if (!items.length) return [];
  const lines = [`### 일정 (${items.length}개)`];
  for (const item of items) {
    lines.push(`- ${joinDot([item.date, item.time, item.title]) || "이름 없는 일정"}`);
    const note = clean(item.note);
    if (note) lines.push(indent(note));
  }
  return lines;
};

const placeSection = (places: readonly ExportPlace[]): string[] => {
  if (!places.length) return [];
  const lines = [`### 장소 (${places.length}곳)`];
  for (const place of places) {
    const where = joinDot([place.category, place.area]);
    lines.push(`- ${where ? `${clean(place.name)} — ${where}` : clean(place.name)}`);
    if (clean(place.address)) lines.push(`  주소: ${clean(place.address)}`);
    const tags = (place.tags ?? []).map(clean).filter(Boolean);
    if (tags.length) lines.push(`  ${tags.map((tag) => `#${tag}`).join(" ")}`);
  }
  return lines;
};

const packingSection = (
  items: readonly ExportPackingItem[],
  done: readonly string[],
): string[] => {
  if (!items.length) return [];
  const checked = new Set(done);
  const lines = [`### 준비물 (${items.filter((item) => checked.has(item.id)).length}/${items.length})`];
  for (const item of items) {
    const tail = joinDot([item.quantity, item.owner]);
    lines.push(`- [${checked.has(item.id) ? "x" : " "}] ${joinDot([item.name, tail || undefined])}`);
  }
  return lines;
};

const recipeSection = (recipes: readonly ExportRecipe[]): string[] => {
  if (!recipes.length) return [];
  const lines = [`### 요리 (${recipes.length}개)`];
  for (const recipe of recipes) {
    const note = clean(recipe.note);
    lines.push(`- ${note ? `${clean(recipe.name)} — ${note}` : clean(recipe.name)}`);
    if (clean(recipe.url)) lines.push(`  ${clean(recipe.url)}`);
    for (const item of recipe.ingredients ?? []) {
      lines.push(`  - ${joinDot([item.name, item.quantity, item.owner])}`);
    }
  }
  return lines;
};

const expenseSection = (
  expenses: readonly ExportExpense[],
  payments: readonly ExportPayment[],
  currency: string | undefined,
): string[] => {
  if (!expenses.length && !payments.length) return [];
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  const lines = [`### 비용 — 합계 ${money(total, currency)}`];
  for (const item of expenses) {
    const payer = clean(item.payer);
    const head = joinDot([item.day, item.title]) || "이름 없는 지출";
    const tail = joinDot([item.category, payer ? `${payer} 냄` : undefined]);
    lines.push(`- ${head} ${money(item.amount, currency)}${tail ? ` · ${tail}` : ""}`);
    const memo = clean(item.memo);
    if (memo) lines.push(indent(memo));
  }
  for (const payment of payments) {
    lines.push(`- 주고받음: ${clean(payment.from)} → ${clean(payment.to)} ${money(payment.amount, currency)}`);
  }
  return lines;
};

const noteSection = (notes: readonly ExportNote[]): string[] => {
  if (!notes.length) return [];
  const lines = [`### 메모 (${notes.length}개)`];
  for (const note of notes) {
    lines.push(`- ${clean(note.author) || "메모"}`);
    lines.push(indent(note.body));
  }
  return lines;
};

const diarySection = (diaries: readonly ExportDiary[]): string[] => {
  if (!diaries.length) return [];
  const lines = [`### 일기 (${diaries.length}개)`];
  for (const diary of diaries) {
    lines.push(`- ${joinDot([diary.date, diary.title]) || "제목 없는 일기"}`);
    const body = clean(diary.body);
    if (body) lines.push(indent(body));
  }
  return lines;
};

const photoSection = (photos: readonly ExportPhoto[]): string[] => {
  if (!photos.length) return [];
  // 사진 파일은 담지 않는다. 무엇을 찍었는지만 남긴다.
  const lines = [`### 사진 (${photos.length}장)`];
  for (const photo of photos) {
    lines.push(`- ${joinDot([photo.date, photo.caption]) || "설명 없는 사진"}`);
  }
  return lines;
};

/** 여행 하나를 `## 여행 이름` 아래의 글로. */
export function tripToMarkdown(trip: ExportTrip): string {
  const plan = trip.planning;
  const lines = [`## ${clean(trip.name) || "이름 없는 여행"}`];
  const head = joinDot([trip.date, trip.region]);
  if (head) lines.push(head);
  if (clean(trip.note)) lines.push(clean(trip.note));
  if (!hasRecords(plan)) {
    lines.push("", "적어 둔 기록이 없어요.");
    return lines.join("\n");
  }
  const sections = [
    staySection(plan?.stay),
    scheduleSection(plan?.schedule ?? []),
    placeSection(plan?.places ?? []),
    packingSection(plan?.packingItems ?? [], plan?.packingDone ?? []),
    recipeSection(plan?.recipes ?? []),
    expenseSection(plan?.expenses ?? [], plan?.payments ?? [], plan?.currency),
    noteSection(plan?.tripNotes ?? []),
    diarySection(plan?.memories?.diaries ?? []),
    photoSection(plan?.memories?.photos ?? []),
  ].filter((section) => section.length);
  for (const section of sections) lines.push("", ...section);
  return lines.join("\n");
}

/** `2026년 9월 16일` */
const exportedOn = (now: Date) => `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

/**
 * 공간의 여행을 하나의 글로 묶는다. 시작일이 이른 여행부터 적는다.
 *
 * 기기에 기록이 없는 여행도 이름과 기간은 남긴다. 목록에서 사라지면 무엇을
 * 빠뜨렸는지 알 수 없다.
 */
export function tripsToMarkdown(trips: readonly ExportTrip[], now: Date = new Date()): string {
  const sorted = [...trips].sort((left, right) => (left.start ?? "").localeCompare(right.start ?? ""));
  const head = [
    "# Daymo 여행 기록",
    "",
    `내보낸 날: ${exportedOn(now)} · 여행 ${sorted.length}개`,
  ];
  if (!sorted.length) {
    head.push("", "아직 적어 둔 여행이 없어요.");
    return `${head.join("\n")}\n`;
  }
  return `${[head.join("\n"), ...sorted.map(tripToMarkdown)].join("\n\n")}\n`;
}
