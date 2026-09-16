/**
 * 여행 기념 카드를 어떻게 꾸몄는지와, 그것으로 무엇을 그릴지.
 *
 * 카드 그림은 기기가 그린다(docs/development/03-api-specification.md 10장). 서버는
 * 꾸민 값 한 덩어리(`trips.card_settings`)를 들고 있을 뿐이고, 숫자와 배치는 여기서 만든다.
 *
 * 아무것도 고르지 않아도 카드 한 장이 나와야 한다. 그래서 모든 값에 기본이 있고,
 * 모르는 값이 저장돼 있어도(앱이 더 옛 판이거나 손으로 고쳤거나) 기본으로 돌아간다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { safeFileName } from "./filenames.ts";

export type KeepsakeStyle = "필름" | "엽서" | "스크랩북";
export type KeepsakeRatio = "세로" | "정사각" | "가로";
/** 카드에 넣을 줄. 끄면 그 줄이 안 나온다. */
export type KeepsakePart = "이름" | "기간" | "지역" | "사람" | "문구" | "통계";
/** 통계 줄에 넣을 숫자. */
export type KeepsakeStatKind = "장소" | "사진" | "날" | "지출";

export const KEEPSAKE_STYLES: KeepsakeStyle[] = ["필름", "엽서", "스크랩북"];
export const KEEPSAKE_RATIOS: KeepsakeRatio[] = ["세로", "정사각", "가로"];
export const KEEPSAKE_PARTS: KeepsakePart[] = ["이름", "기간", "지역", "사람", "문구", "통계"];
export const KEEPSAKE_STAT_KINDS: KeepsakeStatKind[] = ["장소", "사진", "날", "지출"];

/** 한 카드에 붙일 수 있는 사진 수. */
export const KEEPSAKE_MAX_PHOTOS = 4;

/**
 * 아무것도 고르지 않았을 때의 카드.
 *
 * 쓴 돈은 기본으로 끈다. 남에게 보여 주는 그림에 금액이 기본으로 실리면 안 된다.
 */
const DEFAULT_PARTS: KeepsakePart[] = ["이름", "기간", "지역", "문구"];

export type KeepsakeCard = {
  style: KeepsakeStyle;
  ratio: KeepsakeRatio;
  /** 고른 차례가 카드에 놓이는 차례다. */
  photoIds: string[];
  title: string;
  caption: string;
  parts: KeepsakePart[];
  stats: KeepsakeStatKind[];
};

/** 서버가 들고 있는 모양(`trips.cardSettings`). 모양이 틀리면 기본값으로 읽는다. */
export type SavedKeepsake = {
  style?: string | null;
  ratio?: string | null;
  photoIds?: unknown;
  title?: string | null;
  caption?: string | null;
  parts?: unknown;
  stats?: unknown;
};

const pick = <T extends string>(all: readonly T[], value: unknown, fallback: T): T =>
  all.includes(value as T) ? (value as T) : fallback;

const pickMany = <T extends string>(all: readonly T[], value: unknown): T[] =>
  Array.isArray(value) ? all.filter((item) => value.includes(item)) : [];

/**
 * 저장된 값을 카드로 읽는다. 없거나 모양이 틀리면 기본 카드다.
 *
 * @param photoIds 지금 이 여행에서 쓸 수 있는 사진. 고른 사진을 지웠으면 빠지고,
 *   하나도 남지 않으면 가장 최근 사진 한 장으로 돌아간다. 사진이 아예 없으면 빈 목록이다.
 */
export function keepsakeCardOf(
  saved: SavedKeepsake | undefined | null,
  tripName: string,
  photoIds: readonly string[] = [],
): KeepsakeCard {
  const 고른_사진 = Array.isArray(saved?.photoIds)
    ? (saved.photoIds as unknown[])
        .filter((id): id is string => typeof id === "string" && photoIds.includes(id))
        .slice(0, KEEPSAKE_MAX_PHOTOS)
    : [];
  const parts = saved?.parts === undefined || saved?.parts === null
    ? DEFAULT_PARTS
    : pickMany(KEEPSAKE_PARTS, saved.parts);
  return {
    style: pick(KEEPSAKE_STYLES, saved?.style, "필름"),
    ratio: pick(KEEPSAKE_RATIOS, saved?.ratio, "세로"),
    photoIds: 고른_사진.length ? [...new Set(고른_사진)] : photoIds.slice(0, 1),
    title: (saved?.title ?? "").trim() || tripName.trim(),
    caption: (saved?.caption ?? "").trim(),
    parts,
    stats: pickMany(KEEPSAKE_STAT_KINDS, saved?.stats),
  };
}

/** 서버로 보낼 모양. 제목이 여행 이름 그대로면 비워 보내 여행 이름을 따라가게 한다. */
export function keepsakeBodyOf(card: KeepsakeCard, tripName: string): Required<SavedKeepsake> {
  const title = card.title.trim();
  return {
    style: card.style,
    ratio: card.ratio,
    photoIds: card.photoIds.slice(0, KEEPSAKE_MAX_PHOTOS),
    title: title && title !== tripName.trim() ? title.slice(0, 60) : null,
    caption: card.caption.trim().slice(0, 200) || null,
    parts: card.parts,
    stats: card.stats,
  };
}

/** 고른 사진을 넣었다 뺐다 한다. 넘치면 가장 먼저 고른 것을 밀어낸다. */
export function toggleKeepsakePhoto(photoIds: readonly string[], id: string): string[] {
  if (photoIds.includes(id)) {
    const 남는_것 = photoIds.filter((item) => item !== id);
    // 한 장은 남아야 카드가 빈 칸이 되지 않는다.
    return 남는_것.length ? 남는_것 : [...photoIds];
  }
  return [...photoIds, id].slice(-KEEPSAKE_MAX_PHOTOS);
}

/** 한 줄에 몇 장씩 놓을지. 2장은 나란히, 3장은 위 한 장 아래 두 장, 4장은 격자다. */
export function keepsakeLayoutOf(count: number): number[] {
  if (count <= 1) return [1];
  if (count === 2) return [2];
  if (count === 3) return [1, 2];
  return [2, 2];
}

/** 미리보기에 그릴 크기와 내보낼 크기. 내보내기는 화면의 두 배보다 크게 잡는다. */
export function keepsakeSizeOf(ratio: KeepsakeRatio): {
  width: number;
  height: number;
  exportWidth: number;
  exportHeight: number;
} {
  if (ratio === "정사각") return { width: 300, height: 300, exportWidth: 1080, exportHeight: 1080 };
  if (ratio === "가로") return { width: 300, height: 169, exportWidth: 1920, exportHeight: 1080 };
  return { width: 300, height: 375, exportWidth: 1080, exportHeight: 1350 };
}

export type KeepsakeCount = {
  places: number;
  photos: number;
  days: number;
  /** 이미 통화까지 붙인 지출 합(`tripExpenses.money`). 돈 표기는 한 곳에서만 만든다. */
  spent: string;
};

/** 카드에 실릴 통계 한 줄. 켠 것만, 켠 차례가 아니라 정해진 차례로 놓는다. */
export function keepsakeStatLines(
  card: KeepsakeCard,
  count: KeepsakeCount,
): { label: string; value: string }[] {
  if (!card.parts.includes("통계")) return [];
  const 값: Record<KeepsakeStatKind, string> = {
    장소: `${count.places}곳`,
    사진: `${count.photos}장`,
    날: `${count.days}일`,
    지출: count.spent,
  };
  const 이름: Record<KeepsakeStatKind, string> = {
    장소: "다녀온 곳", 사진: "사진", 날: "함께한 날", 지출: "쓴 돈",
  };
  return KEEPSAKE_STAT_KINDS.filter((kind) => card.stats.includes(kind))
    .map((kind) => ({ label: 이름[kind], value: 값[kind] }));
}

/** 카드에 올릴 글. 끈 줄과 빈 줄은 빠진다. */
export function keepsakeTextOf(
  card: KeepsakeCard,
  trip: { name: string; period: string; region: string; people: readonly string[] },
): { title: string; meta: string; caption: string; people: string } {
  const meta = [
    card.parts.includes("기간") ? trip.period : "",
    card.parts.includes("지역") ? trip.region : "",
  ].filter(Boolean).join(" · ");
  return {
    title: card.parts.includes("이름") ? card.title.trim() || trip.name.trim() : "",
    meta,
    caption: card.parts.includes("문구") ? card.caption.trim() : "",
    // 사람이 많으면 이름이 카드를 덮는다. 셋까지만 적고 나머지는 수로 줄인다.
    people: card.parts.includes("사람") ? peopleLineOf(trip.people) : "",
  };
}

/** `하늘 · 여울` , 넷 이상이면 `하늘 · 여울 · 새봄 외 2명`. */
export function peopleLineOf(people: readonly string[]): string {
  const 이름 = people.map((name) => name.trim()).filter(Boolean);
  if (!이름.length) return "";
  if (이름.length <= 3) return 이름.join(" · ");
  return `${이름.slice(0, 3).join(" · ")} 외 ${이름.length - 3}명`;
}

/** `우리의 서울 주말 기념카드`. 기기 파일 이름에 못 쓰는 글자는 뺀다. */
export function keepsakeFileName(title: string): string {
  return `${safeFileName(title, "여행 기념 카드")} 기념카드`;
}
