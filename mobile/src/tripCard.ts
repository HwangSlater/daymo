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

export type KeepsakeStyle =
  | "필름" | "엽서" | "스크랩북"
  // 사진관에서 뽑는 네컷 틀. 사진이 칸을 채우고 아래 여백에 이름·날짜·Daymo 가 들어간다.
  | "네컷" | "네컷 격자" | "네컷 가로" | "세컷";
export type KeepsakeRatio = "세로" | "정사각" | "가로";
/** 카드에 넣을 줄. 끄면 그 줄이 안 나온다. */
export type KeepsakePart = "이름" | "기간" | "지역" | "사람" | "문구" | "통계";
/** 통계 줄에 넣을 숫자. */
export type KeepsakeStatKind = "장소" | "사진" | "날" | "지출";
/** 네컷 틀의 테두리 색. 앞의 셋은 사진관 색이고 뒤는 앱에서 쓰는 색이다. */
export type KeepsakeFrameColor = "검정" | "흰색" | "크림" | "노을" | "바다" | "숲";
/** 사진 모서리에 붙이는 작은 그림. 자리는 미리 정해져 있다. */
export type KeepsakeSticker = "하트" | "별" | "비행기" | "필름" | "말풍선" | "체크";
/** 스티커가 붙는 모서리. */
export type KeepsakeCorner = "좌상" | "우상" | "좌하" | "우하";

export const KEEPSAKE_STYLES: KeepsakeStyle[] = [
  "필름", "엽서", "스크랩북", "네컷", "네컷 격자", "네컷 가로", "세컷",
];
/** 네컷 틀. 나머지 셋과 달리 비율이 틀에 붙어 있고 꾸미기 항목이 더 나온다. */
export const KEEPSAKE_CUT_STYLES: KeepsakeStyle[] = ["네컷", "네컷 격자", "네컷 가로", "세컷"];
export const KEEPSAKE_RATIOS: KeepsakeRatio[] = ["세로", "정사각", "가로"];
export const KEEPSAKE_PARTS: KeepsakePart[] = ["이름", "기간", "지역", "사람", "문구", "통계"];
export const KEEPSAKE_STAT_KINDS: KeepsakeStatKind[] = ["장소", "사진", "날", "지출"];
export const KEEPSAKE_FRAME_COLORS: KeepsakeFrameColor[] = ["검정", "흰색", "크림", "노을", "바다", "숲"];
export const KEEPSAKE_STICKERS: KeepsakeSticker[] = ["하트", "별", "비행기", "필름", "말풍선", "체크"];

/** 네컷 틀인지. 틀이면 비율 대신 틀이 크기를 정한다. */
export const isCutStyle = (style: KeepsakeStyle): boolean => KEEPSAKE_CUT_STYLES.includes(style);

/** 한 카드에 붙일 수 있는 사진 수. */
export const KEEPSAKE_MAX_PHOTOS = 4;

/**
 * 한 여행에 모아 둘 수 있는 카드 수.
 *
 * 카드마다 사진 넷이라 스무 장이면 사진 여든 장이다. 그보다 쌓이면 목록을 넘기는
 * 것부터 느려진다. 서버도 같은 수로 막는다(`services/trip_cards`).
 */
export const KEEPSAKE_MAX_CARDS = 20;

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
  /** 아래는 네컷 틀에서만 쓴다. 다른 스타일에서는 저장만 되고 그려지지 않는다. */
  frameColor: KeepsakeFrameColor;
  stickers: KeepsakeSticker[];
  /** 필름 카메라가 찍어 주던 날짜 도장(`2026.09.15`). */
  dateStamp: boolean;
  /** 사진에 적어 둔 짧은 설명을 칸 아래에 넣을지. */
  photoCaptions: boolean;
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
  frameColor?: string | null;
  stickers?: unknown;
  dateStamp?: boolean | null;
  photoCaptions?: boolean | null;
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
    frameColor: pick(KEEPSAKE_FRAME_COLORS, saved?.frameColor, "검정"),
    stickers: pickMany(KEEPSAKE_STICKERS, saved?.stickers),
    dateStamp: saved?.dateStamp === true,
    photoCaptions: saved?.photoCaptions === true,
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
    frameColor: card.frameColor,
    stickers: card.stickers,
    dateStamp: card.dateStamp,
    photoCaptions: card.photoCaptions,
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

/** 네컷 틀이 바라는 사진 수와 칸을 늘어놓는 방향. */
const CUT_FRAME: Record<string, { want: number; 방향: "세로" | "가로" | "격자" }> = {
  "네컷": { want: 4, 방향: "세로" },
  "네컷 격자": { want: 4, 방향: "격자" },
  "네컷 가로": { want: 4, 방향: "가로" },
  "세컷": { want: 3, 방향: "세로" },
};

/**
 * 칸을 어떻게 놓을지.
 *
 * 고른 사진이 틀보다 적으면 남는 칸을 비우지 않는다. 빈 칸이 찍힌 그림은 고장 난
 * 카드처럼 보인다. 대신 틀을 고른 수만큼 줄이고, 몇 장을 더 고르면 꽉 차는지 알린다.
 */
export function keepsakeFrameOf(style: KeepsakeStyle, photoCount: number): {
  /** 각 줄에 놓을 칸 수. */
  rows: number[];
  /** 실제로 그리는 칸 수. */
  slots: number;
  /** 이 틀이 바라는 사진 수. 네컷 틀이 아니면 고른 수 그대로다. */
  want: number;
  /** 사진이 모자랄 때 알릴 말. 넉넉하면 빈 글자다. */
  notice: string;
} {
  const 있는_것 = Math.max(1, Math.min(photoCount, KEEPSAKE_MAX_PHOTOS));
  const 틀 = CUT_FRAME[style];
  if (!틀) return { rows: keepsakeLayoutOf(있는_것), slots: 있는_것, want: 있는_것, notice: "" };
  const slots = Math.min(있는_것, 틀.want);
  const rows = 틀.방향 === "격자"
    ? keepsakeLayoutOf(slots)
    : 틀.방향 === "가로"
      ? [slots]
      : Array.from({ length: slots }, () => 1);
  return {
    rows,
    slots,
    want: 틀.want,
    notice: slots < 틀.want ? `사진 ${틀.want - slots}장을 더 고르면 ${틀.want}컷으로 꽉 차요` : "",
  };
}

/**
 * 미리보기에 그릴 크기와 내보낼 크기. 내보내기는 화면의 다섯 배 넘게 잡는다.
 *
 * 네컷 틀은 비율 대신 틀이 크기를 정한다. 사진관 스트립은 길쭉해야 스트립처럼 보인다.
 */
export function keepsakeSizeOf(ratio: KeepsakeRatio, style: KeepsakeStyle = "필름"): {
  width: number;
  height: number;
  exportWidth: number;
  exportHeight: number;
} {
  if (style === "네컷") return { width: 200, height: 600, exportWidth: 1080, exportHeight: 3240 };
  if (style === "세컷") return { width: 200, height: 470, exportWidth: 1080, exportHeight: 2538 };
  if (style === "네컷 격자") return { width: 300, height: 375, exportWidth: 1080, exportHeight: 1350 };
  if (style === "네컷 가로") return { width: 300, height: 150, exportWidth: 1920, exportHeight: 960 };
  if (ratio === "정사각") return { width: 300, height: 300, exportWidth: 1080, exportHeight: 1080 };
  if (ratio === "가로") return { width: 300, height: 169, exportWidth: 1920, exportHeight: 1080 };
  return { width: 300, height: 375, exportWidth: 1080, exportHeight: 1350 };
}

/**
 * 각 줄이 몇 번째 사진부터 몇 칸인지.
 *
 * 그리면서 세면 같은 사진이 두 칸에 들어간다. 줄을 그리기 전에 미리 나눠 둔다.
 */
export function keepsakeRowSlots(rows: readonly number[]): { start: number; count: number }[] {
  return rows.map((count, index) => ({
    count,
    start: rows.slice(0, index).reduce((합, 앞줄) => 합 + 앞줄, 0),
  }));
}

/** 스티커를 놓을 모서리. 앞에서부터 차례로 쓴다. */
const STICKER_CORNERS: KeepsakeCorner[] = ["우상", "좌하", "좌상", "우하"];

/**
 * 켠 스티커를 어느 칸의 어느 모서리에 붙일지.
 *
 * 자리는 미리 정해 둔다. 손으로 끌어 옮기게 하면 웹과 앱에서 자리가 흔들리고,
 * 같은 카드를 둘이 열었을 때 다른 그림이 된다.
 *
 * 켠 차례가 아니라 `KEEPSAKE_STICKERS` 차례로 놓는다. 껐다 켜도 자리가 안 바뀐다.
 * 칸마다 모서리는 넷뿐이라 그보다 많이 켜면 뒤쪽은 붙지 않는다.
 */
export function keepsakeStickerSpots(
  stickers: readonly KeepsakeSticker[],
  slotCount: number,
): { sticker: KeepsakeSticker; slot: number; corner: KeepsakeCorner }[] {
  const 칸 = Math.max(1, slotCount);
  return KEEPSAKE_STICKERS.filter((sticker) => stickers.includes(sticker))
    .slice(0, 칸 * STICKER_CORNERS.length)
    .map((sticker, index) => {
      const slot = index % 칸;
      const 바퀴 = Math.floor(index / 칸);
      return { sticker, slot, corner: STICKER_CORNERS[(slot + 바퀴) % STICKER_CORNERS.length] };
    });
}

/** 날짜 도장에 찍을 글. `2026-09-15` → `2026.09.15`. 날짜를 모르면 빈 글자다. */
export function keepsakeDateStamp(dateKey: string | undefined | null): string {
  const 값 = (dateKey ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(값) ? 값.replace(/-/g, ".") : "";
}

/** 칸 아래에 작게 넣을 사진 설명. 끄면 빈 글자고, 길면 한 줄로 자른다. */
export function keepsakeSlotCaption(caption: string | undefined, on: boolean): string {
  if (!on) return "";
  const 값 = (caption ?? "").trim();
  return 값.length > 18 ? `${값.slice(0, 18).trimEnd()}…` : 값;
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

/** 서버가 돌려주는 카드 한 줄(`GET /trips/{id}/cards`). */
export type KeepsakeCardRow = {
  id: string;
  settings?: SavedKeepsake | null;
  /** 만든 시각. 목록 차례를 정할 때 `sortOrder` 다음으로 본다. */
  createdAt?: string | null;
  sortOrder?: number | null;
};

/** 목록에 그릴 카드 한 줄. */
export type KeepsakeListItem = {
  id: string;
  card: KeepsakeCard;
  /** `네컷 · 사진 4장`. 목록에서 카드를 가려내는 한 줄이다. */
  label: string;
  /** 목록에서 받아 올 대표 사진. 카드를 열기 전에는 이 한 장만 받는다. */
  coverPhotoId: string;
};

/**
 * 서버가 준 줄들을 목록으로 읽는다.
 *
 * 차례는 서버가 준 `sortOrder`, 같으면 만든 시각, 그래도 같으면 id 다. 목록이
 * 기기마다 다른 차례로 보이면 "세 번째 카드" 라는 말이 통하지 않는다.
 */
export function keepsakeListOf(
  rows: readonly KeepsakeCardRow[],
  tripName: string,
  photoIds: readonly string[] = [],
): KeepsakeListItem[] {
  return [...rows]
    .sort((a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      || (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
      || a.id.localeCompare(b.id))
    .map((row) => {
      const card = keepsakeCardOf(row.settings, tripName, photoIds);
      return {
        id: row.id,
        card,
        label: `${card.style} · 사진 ${card.photoIds.length}장`,
        coverPhotoId: card.photoIds[0] ?? "",
      };
    });
}

/**
 * 고른 사진 수에 어울리는 틀.
 *
 * 틀을 고르면 필요한 사진 수가 정해지지만, 반대로 사진을 더 고른 사람에게는
 * 그 수에 맞는 틀을 권한다. 지금 틀이 이미 그 수를 담으면 권하지 않는다.
 */
export function suggestedStyleOf(style: KeepsakeStyle, photoCount: number): KeepsakeStyle | "" {
  if (photoCount <= 1) return isCutStyle(style) ? "필름" : "";
  const 어울리는_것: KeepsakeStyle = photoCount === 2 ? "네컷 격자" : photoCount === 3 ? "세컷" : "네컷";
  if (style === 어울리는_것) return "";
  // 이미 네컷 틀이고 고른 사진이 그 틀에 다 들어가면 그대로 둔다.
  if (isCutStyle(style) && keepsakeFrameOf(style, photoCount).slots >= photoCount) return "";
  return 어울리는_것;
}

/** 새 카드를 더 만들 수 있는지. 못 만들면 그 까닭을 돌려준다. */
export function keepsakeAddBlockedReason(cardCount: number, photoCount: number): string {
  if (photoCount <= 0) return "사진을 한 장 추가하면 기념 카드를 만들 수 있어요";
  if (cardCount >= KEEPSAKE_MAX_CARDS) return `카드는 여행마다 ${KEEPSAKE_MAX_CARDS}장까지 모아 둘 수 있어요`;
  return "";
}
