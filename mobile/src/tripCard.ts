/**
 * 여행 기념 카드를 어떻게 꾸몄는지와, 그것으로 무엇을 그릴지.
 *
 * 카드 그림은 기기가 그린다(docs/development/03-api-specification.md 10장). 서버는
 * 꾸민 값 한 덩어리(`trip_cards.settings`)를 들고 있을 뿐이고, 숫자와 배치는 여기서 만든다.
 *
 * 아무것도 고르지 않아도 카드 한 장이 나와야 한다. 그래서 모든 값에 기본이 있고,
 * 모르는 값이 저장돼 있어도(앱이 더 옛 판이거나 손으로 고쳤거나) 기본으로 그린다.
 *
 * 모르는 값을 버리지는 않는다. 더 새 앱이 저장한 스티커·칸·값일 수 있어서, 그리지
 * 못해도 들고 있다가 저장할 때 그대로 돌려보낸다(`KeepsakeKept`). 버리면 이 앱으로
 * 카드를 한 번 고치는 것만으로 상대가 붙인 것이 사라진다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import {
  DECOR_MAX,
  decorBodyOf,
  decorOf,
  legacyDecorOf,
  unknownDecorOf,
  KEEPSAKE_STICKERS,
  type CardDecor,
  type KeepsakeSticker,
} from "./cardDecor.ts";
import { COVER_FOCUS_DEFAULT, sameFocus, tidyFocus, type CoverFocus } from "./coverCrop.ts";
import { safeFileName } from "./filenames.ts";

export { KEEPSAKE_STICKERS };
export type { CardDecor, KeepsakeSticker };

export type KeepsakeStyle =
  // 종이를 끼우지 않고 사진만 쓴다. 스티커와 글자만 얹고 싶은 사람에게는 필름도
  // 엽서도 거추장스러운 테두리다. 그런 사람이 아무것도 안 고를 길이 있어야 한다.
  | "없음"
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

export const KEEPSAKE_STYLES: KeepsakeStyle[] = [
  "없음", "필름", "엽서", "스크랩북", "네컷", "네컷 격자", "네컷 가로", "세컷",
];

/** 종이를 끼우지 않는 프레임. 사진이 통째로 카드가 된다. */
export const isBareStyle = (style: KeepsakeStyle): boolean => style === "없음";
/** 네컷 틀. 나머지 셋과 달리 비율이 틀에 붙어 있고 꾸미기 항목이 더 나온다. */
export const KEEPSAKE_CUT_STYLES: KeepsakeStyle[] = ["네컷", "네컷 격자", "네컷 가로", "세컷"];
export const KEEPSAKE_RATIOS: KeepsakeRatio[] = ["세로", "정사각", "가로"];
export const KEEPSAKE_PARTS: KeepsakePart[] = ["이름", "기간", "지역", "사람", "문구", "통계"];
export const KEEPSAKE_STAT_KINDS: KeepsakeStatKind[] = ["장소", "사진", "날", "지출"];
export const KEEPSAKE_FRAME_COLORS: KeepsakeFrameColor[] = ["검정", "흰색", "크림", "노을", "바다", "숲"];

/**
 * 카드 종이(2026-09-22). 네컷 계열이 아닌 틀(기본·필름·엽서·스크랩북)의 바탕이다.
 * 네컷 계열은 지금처럼 틀 색(`frameColor`)이 바탕을 정하고, 무늬만 얹는다.
 * 무늬는 그림 파일 없이 그린다(`KeepsakeCardView`).
 */
export type KeepsakePaperColor = "기본" | "크림" | "민트" | "하늘" | "분홍" | "먹색";
export const KEEPSAKE_PAPER_COLORS: KeepsakePaperColor[] = ["기본", "크림", "민트", "하늘", "분홍", "먹색"];
export type KeepsakePaperPattern = "없음" | "모눈" | "줄" | "점" | "크라프트";
export const KEEPSAKE_PAPER_PATTERNS: KeepsakePaperPattern[] = ["없음", "모눈", "줄", "점", "크라프트"];

/**
 * 칩과 카드 이름에 적는 말. 저장되는 값은 그대로 두고 보이는 이름만 바꾼다.
 * 「없음」이 카드 이름에 박히면 「없음 카드」가 되고, 「글」「사람」은 무엇인지
 * 뜻이 오지 않아서다(docs/development/13-copy-glossary.md).
 */
export const keepsakeStyleLabel = (style: KeepsakeStyle): string => (style === "없음" ? "기본" : style);
export const keepsakeRatioLabel = (ratio: KeepsakeRatio): string => (ratio === "정사각" ? "정사각형" : ratio);
export const keepsakeFrameColorLabel = (color: KeepsakeFrameColor): string => (color === "흰색" ? "하양" : color);
export const KEEPSAKE_PART_LABELS: Record<KeepsakePart, string> = {
  이름: "제목", 기간: "기간", 지역: "지역", 사람: "함께한 사람", 문구: "한 줄 설명", 통계: "통계",
};
/** 통계 칩의 이름. 카드에 찍히는 이름과 같아야 고른 것이 어디 나오는지 보인다. */
export const KEEPSAKE_STAT_LABELS: Record<KeepsakeStatKind, string> = {
  장소: "다녀온 곳", 사진: "사진", 날: "함께한 날", 지출: "총 지출",
};

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
  /** 네컷 틀에서만 쓴다. 다른 스타일에서는 저장만 되고 그려지지 않는다. */
  frameColor: KeepsakeFrameColor;
  /** 종이 색. 네컷 계열이 아닌 틀에서 쓴다. */
  paperColor: KeepsakePaperColor;
  /** 종이 무늬. 모든 틀에서 쓴다. 크라프트는 종이 색 대신 갈색 재생지다. */
  paperPattern: KeepsakePaperPattern;
  /** 카드 위에 손으로 얹은 스티커와 글자. 어느 스타일에서든 그려진다. */
  decor: CardDecor[];
  /** 필름 카메라가 찍어 주던 날짜 도장(`2026.09.15`). */
  dateStamp: boolean;
  /** 사진에 적어 둔 짧은 설명을 칸 아래에 넣을지. */
  photoCaptions: boolean;
  /**
   * 사진마다 칸에 보여 줄 부분(사진 id → 자리). 홈 대표 사진과 같은 셈이다(`coverCrop.ts`).
   * 가운데를 자른 기본 모습이면 적지 않는다. 사진 id 로 들고 있어 자리를 바꿔도 따라간다.
   */
  photoFocus: Record<string, CoverFocus>;
  /** 이 판이 모르는 값. 있을 때만 붙는다. */
  kept?: KeepsakeKept;
};

/**
 * 저장된 값 가운데 이 판이 모르는 것. 더 새 앱이 저장한 것이다.
 *
 * 그리지는 못해도 저장할 때 그대로 돌려보낸다(`keepsakeBodyOf`). 서버도 모르는
 * 값을 받아 그대로 둔다(docs/development/03-api-specification.md 10장).
 */
export type KeepsakeKept = {
  /** `settings` 바로 아래의 모르는 칸. */
  extra?: Record<string, unknown>;
  /**
   * 모르는 값이라 기본으로 그린 칸. `shown` 이 대신 그린 값이다. 사람이 그 칸을
   * 다른 값으로 바꾸지 않았으면 저장할 때 `raw` 를 돌려보낸다.
   */
  style?: { raw: string; shown: KeepsakeStyle };
  ratio?: { raw: string; shown: KeepsakeRatio };
  frameColor?: { raw: string; shown: KeepsakeFrameColor };
  paperColor?: { raw: string; shown: KeepsakePaperColor };
  paperPattern?: { raw: string; shown: KeepsakePaperPattern };
  /** 목록 칸에 섞여 있던 모르는 값. 켜고 끌 수 없으니 늘 그대로 붙여 보낸다. */
  parts?: string[];
  stats?: string[];
  stickers?: string[];
  /** 모르는 이름의 스티커 줄. 받은 모양 그대로다. */
  decor?: Record<string, unknown>[];
};

/** 서버가 들고 있는 모양(카드 한 줄의 `settings`). 모양이 틀리면 기본값으로 읽는다. */
export type SavedKeepsake = {
  style?: string | null;
  ratio?: string | null;
  photoIds?: unknown;
  title?: string | null;
  caption?: string | null;
  parts?: unknown;
  stats?: unknown;
  frameColor?: string | null;
  /** 옛 판이 남긴 정해진 자리 스티커 목록. 읽기만 하고 새로 쓰지 않는다. */
  stickers?: unknown;
  decor?: unknown;
  dateStamp?: boolean | null;
  photoCaptions?: boolean | null;
  photoFocus?: unknown;
  paperColor?: string | null;
  paperPattern?: string | null;
};

const pick = <T extends string>(all: readonly T[], value: unknown, fallback: T): T =>
  all.includes(value as T) ? (value as T) : fallback;

const pickMany = <T extends string>(all: readonly T[], value: unknown): T[] =>
  Array.isArray(value) ? all.filter((item) => value.includes(item)) : [];

/** 이 판이 아는 `settings` 칸. 나머지는 `KeepsakeKept.extra` 로 들고 있는다. */
const KEEPSAKE_KEYS = new Set([
  "style", "ratio", "photoIds", "title", "caption", "parts", "stats", "frameColor",
  "stickers", "decor", "dateStamp", "photoCaptions", "photoFocus", "paperColor", "paperPattern",
]);

/** 저장된 칸별 자리를 읽는다. 모양이 틀린 줄과 가운데 그대로인 줄은 버린다. */
function photoFocusOf(value: unknown): Record<string, CoverFocus> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const 읽은_것: Record<string, CoverFocus> = {};
  for (const [id, 자리] of Object.entries(value as Record<string, unknown>)) {
    if (!자리 || typeof 자리 !== "object") continue;
    const 정리 = tidyFocus(자리 as Partial<CoverFocus>);
    if (!sameFocus(정리, COVER_FOCUS_DEFAULT)) 읽은_것[id] = 정리;
  }
  return 읽은_것;
}

/** 보낼 모양. 카드에 든 사진의 것만, 넷째 자리까지. */
function photoFocusBodyOf(card: KeepsakeCard): Record<string, CoverFocus> {
  const 보낼_것: Record<string, CoverFocus> = {};
  const 넷째 = (값: number) => Math.round(값 * 10000) / 10000;
  for (const id of card.photoIds) {
    const 자리 = card.photoFocus[id];
    if (자리 && !sameFocus(자리, COVER_FOCUS_DEFAULT)) {
      보낼_것[id] = { x: 넷째(자리.x), y: 넷째(자리.y), zoom: 넷째(자리.zoom) };
    }
  }
  return 보낼_것;
}
/** 서버가 받는 값 이름의 길이. 이보다 긴 것은 들고 있어 봐야 저장되지 않는다. */
const 값_이름_최대 = 20;
const 값_이름인가 = (값: unknown): 값 is string =>
  typeof 값 === "string" && 값 !== "" && 값.length <= 값_이름_최대;

/** 모르는 값이면 대신 그린 값과 함께 적어 둔다. */
const 모르는_하나 = <T extends string>(all: readonly T[], value: unknown, shown: T) =>
  값_이름인가(value) && !all.includes(value as T) ? { raw: value, shown } : undefined;

const 모르는_여럿 = (all: readonly string[], value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => 값_이름인가(item) && !all.includes(item)))]
    : [];

/** 모르는 것만 모은다. 하나도 없으면 undefined 라 카드 모양이 예전과 같다. */
function keptOf(
  saved: SavedKeepsake | undefined | null,
  style: KeepsakeStyle,
  ratio: KeepsakeRatio,
  frameColor: KeepsakeFrameColor,
  paperColor: KeepsakePaperColor,
  paperPattern: KeepsakePaperPattern,
): KeepsakeKept | undefined {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return undefined;
  const 칸들 = Object.entries(saved).filter(([key]) => !KEEPSAKE_KEYS.has(key));
  const kept: KeepsakeKept = {
    extra: 칸들.length ? Object.fromEntries(칸들) : undefined,
    style: 모르는_하나(KEEPSAKE_STYLES, saved.style, style),
    ratio: 모르는_하나(KEEPSAKE_RATIOS, saved.ratio, ratio),
    frameColor: 모르는_하나(KEEPSAKE_FRAME_COLORS, saved.frameColor, frameColor),
    paperColor: 모르는_하나(KEEPSAKE_PAPER_COLORS, saved.paperColor, paperColor),
    paperPattern: 모르는_하나(KEEPSAKE_PAPER_PATTERNS, saved.paperPattern, paperPattern),
    parts: 모르는_여럿(KEEPSAKE_PARTS, saved.parts),
    stats: 모르는_여럿(KEEPSAKE_STAT_KINDS, saved.stats),
    stickers: 모르는_여럿(KEEPSAKE_STICKERS, saved.stickers),
    decor: unknownDecorOf(saved.decor),
  };
  const 남긴_것 = Object.entries(kept).filter(([, 값]) =>
    값 !== undefined && !(Array.isArray(값) && 값.length === 0));
  return 남긴_것.length ? (Object.fromEntries(남긴_것) as KeepsakeKept) : undefined;
}

/** 모르는 값을 대신 그렸고 사람이 그 칸을 바꾸지 않았으면 원래 값을 돌려보낸다. */
const 되돌린_값 = <T extends string>(kept: { raw: string; shown: T } | undefined, 지금: T): string =>
  kept && kept.shown === 지금 ? kept.raw : 지금;

/**
 * 스티커 줄을 보낼 모양으로. 모르는 줄은 받은 그대로 뒤에 붙인다.
 *
 * 모르는 줄과 이름(`id`)이 겹치는 줄은 이 앱에서 새로 붙인 것이라 이름을 새로 준다.
 * 이 앱의 `addDecor` 는 모르는 줄을 보지 못해 같은 이름을 고를 수 있다. 둘을 합쳐
 * 한 카드의 한도(`DECOR_MAX`)를 넘으면 이 앱에서 붙인 것부터 덜어 낸다.
 */
function decorWithKept(decor: readonly CardDecor[], 모르는_줄: readonly Record<string, unknown>[]) {
  const 쓴_이름 = new Set(모르는_줄.map((줄) => 줄.id).filter((id): id is string => typeof id === "string"));
  const 아는_줄 = decorBodyOf(decor).slice(0, Math.max(0, DECOR_MAX - 모르는_줄.length));
  for (const 줄 of 아는_줄) 쓴_이름.add(줄.id as string);
  const 새_이름 = () => {
    let 수 = 1;
    while (쓴_이름.has(`d${수}`)) 수 += 1;
    쓴_이름.add(`d${수}`);
    return `d${수}`;
  };
  const 겹친_이름 = new Set(모르는_줄.map((줄) => 줄.id));
  return [
    ...아는_줄.map((줄) => (겹친_이름.has(줄.id) ? { ...줄, id: 새_이름() } : 줄)),
    ...모르는_줄,
  ];
}

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
  // 새 카드는 틀 없이 사진만으로 시작한다(2026-09-23 요청). 검은 필름으로 시작하면 종이 색을
  // 밝게 골라도 겉테두리가 검어서, 처음 연 사람이 「왜 검지?」 하고 묻게 된다. 저장된 카드에
  // 틀이 적혀 있지 않으면 그때 쓰던 필름 그대로 둔다 — 남이 만들어 둔 카드의 모양은 바뀌면 안 된다.
  const style = pick(KEEPSAKE_STYLES, saved?.style, saved ? "필름" : "없음");
  const ratio = pick(KEEPSAKE_RATIOS, saved?.ratio, "세로");
  const frameColor = pick(KEEPSAKE_FRAME_COLORS, saved?.frameColor, "검정");
  const paperColor = pick(KEEPSAKE_PAPER_COLORS, saved?.paperColor, "기본");
  const paperPattern = pick(KEEPSAKE_PAPER_PATTERNS, saved?.paperPattern, "없음");
  const 쓸_사진 = 고른_사진.length ? [...new Set(고른_사진)] : photoIds.slice(0, 1);
  const kept = keptOf(saved, style, ratio, frameColor, paperColor, paperPattern);
  return {
    style,
    ratio,
    photoIds: 쓸_사진,
    title: (saved?.title ?? "").trim() || tripName.trim(),
    caption: (saved?.caption ?? "").trim(),
    parts,
    stats: pickMany(KEEPSAKE_STAT_KINDS, saved?.stats),
    frameColor,
    paperColor,
    paperPattern,
    // 새 형식이 있으면 그것을 읽고, 없으면 옛 판이 남긴 스티커를 옮겨 온다.
    decor: Array.isArray(saved?.decor)
      ? decorOf(saved.decor)
      : legacyDecorOf(
          pickMany(KEEPSAKE_STICKERS, saved?.stickers),
          keepsakeFrameOf(style, 쓸_사진.length).rows,
        ),
    dateStamp: saved?.dateStamp === true,
    photoCaptions: saved?.photoCaptions === true,
    photoFocus: photoFocusOf(saved?.photoFocus),
    ...(kept ? { kept } : {}),
  };
}

/**
 * 서버로 보낼 모양. 제목이 여행 이름 그대로면 비워 보내 여행 이름을 따라가게 한다.
 *
 * 이 판이 모르는 값(`card.kept`)은 받은 그대로 되돌려 보낸다. 모르는 칸을 먼저 깔고
 * 아는 칸으로 덮어서, 이 앱이 고친 값이 늘 이긴다.
 */
export function keepsakeBodyOf(
  card: KeepsakeCard,
  tripName: string,
): Required<SavedKeepsake> & Record<string, unknown> {
  const title = card.title.trim();
  const kept = card.kept;
  return {
    ...kept?.extra,
    style: 되돌린_값(kept?.style, card.style),
    ratio: 되돌린_값(kept?.ratio, card.ratio),
    photoIds: card.photoIds.slice(0, KEEPSAKE_MAX_PHOTOS),
    title: title && title !== tripName.trim() ? title.slice(0, 60) : null,
    caption: card.caption.trim().slice(0, 200) || null,
    parts: [...card.parts, ...(kept?.parts ?? [])],
    stats: [...card.stats, ...(kept?.stats ?? [])],
    frameColor: 되돌린_값(kept?.frameColor, card.frameColor),
    // 옛 칸은 비워 보낸다. 옮긴 값이 `decor` 에 들어 있어서, 둘 다 보내면 새 앱이
    // 같은 스티커를 두 번 그린다. 옛 앱에서는 스티커가 안 보인다. 이 판이 모르는
    // 이름만은 옮기지 못했으니 그대로 둔다.
    stickers: [...(kept?.stickers ?? [])],
    decor: decorWithKept(card.decor, kept?.decor ?? []),
    dateStamp: card.dateStamp,
    photoCaptions: card.photoCaptions,
    photoFocus: photoFocusBodyOf(card),
    paperColor: 되돌린_값(kept?.paperColor, card.paperColor),
    paperPattern: 되돌린_값(kept?.paperPattern, card.paperPattern),
  };
}

/**
 * 두 카드가 같은 그림인지.
 *
 * 꾸미다 「나가기」를 누를 때 한 번 물을지 그냥 접을지 가른다. 아무것도 손대지
 * 않았는데 묻는 창이 뜨면 나가는 길이 두 번이 된다.
 *
 * 저장할 모양(`keepsakeBodyOf`)으로 재서 본다. 화면에서만 쓰는 값이나 소수점
 * 끝자리 차이로 「고쳤다」고 보지 않으려면 서버에 실제로 보낼 것끼리 대야 한다.
 */
export function sameKeepsakeCard(a: KeepsakeCard, b: KeepsakeCard): boolean {
  return JSON.stringify(keepsakeBodyOf(a, "")) === JSON.stringify(keepsakeBodyOf(b, ""));
}

/**
 * 고른 사진을 넣었다 뺐다 한다.
 *
 * 꽉 찼으면 그대로 둔다. 예전에는 가장 먼저 고른 것을 말없이 밀어냈는데, 다섯
 * 번째를 누른 사람은 방금 무엇이 빠졌는지 알 수 없었다. 조용히 사라지는 것보다
 * 안 되는 것이 낫다. 부르는 쪽이 꽉 찼다고 한 줄로 알린다.
 */
export function toggleKeepsakePhoto(photoIds: readonly string[], id: string): string[] {
  if (photoIds.includes(id)) {
    const 남는_것 = photoIds.filter((item) => item !== id);
    // 한 장은 남아야 카드가 빈 칸이 되지 않는다.
    return 남는_것.length ? 남는_것 : [...photoIds];
  }
  if (photoIds.length >= KEEPSAKE_MAX_PHOTOS) return [...photoIds];
  return [...photoIds, id];
}

/** 더 고를 수 있는지. 못 고르면 그 까닭을 돌려준다. */
export function keepsakePhotoFullReason(photoIds: readonly string[]): string {
  return photoIds.length >= KEEPSAKE_MAX_PHOTOS
    ? `사진은 ${KEEPSAKE_MAX_PHOTOS}장까지 넣을 수 있어요 · 고른 사진을 다시 누르면 빠져요`
    : "";
}

/**
 * 고른 사진의 차례를 한 칸 옮긴다. 끝에서 더 가면 그대로 둔다.
 *
 * 고른 차례가 곧 카드에 놓이는 차례다. 예전에는 차례를 바꾸려면 전부 뺐다가 다시
 * 골라야 했다. 스티커의 「앞으로·뒤로」와 같은 결로 한 칸씩 옮긴다.
 */
/** 두 자리의 사진을 맞바꾼다. 카드에서 사진을 꾹 눌러 다른 사진 위에 놓을 때 쓴다. */
export function swapKeepsakePhotos(photoIds: readonly string[], a: number, b: number): string[] {
  if (a === b || a < 0 || b < 0 || a >= photoIds.length || b >= photoIds.length) return [...photoIds];
  const 바꾼_것 = [...photoIds];
  [바꾼_것[a], 바꾼_것[b]] = [바꾼_것[b], 바꾼_것[a]];
  return 바꾼_것;
}

/**
 * 사진 하나를 `from` 자리에서 빼 `to` 자리에 끼운다. 차례 줄에서 끌어 옮길 때 쓴다.
 * 자리가 벗어나면 그대로 돌려준다.
 */
export function placeKeepsakePhoto(photoIds: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= photoIds.length || to >= photoIds.length) return [...photoIds];
  const 바꾼_것 = [...photoIds];
  const [옮길_것] = 바꾼_것.splice(from, 1);
  바꾼_것.splice(to, 0, 옮길_것);
  return 바꾼_것;
}

/** 끄는 손이 `dx` 만큼 갔을 때 놓일 자리. 한 칸 폭(`step`)의 절반을 넘으면 다음 칸이다. */
export function slideTargetOf(from: number, dx: number, step: number, count: number): number {
  if (count <= 0 || step <= 0) return from;
  return Math.max(0, Math.min(count - 1, from + Math.round(dx / step)));
}

export function moveKeepsakePhoto(
  photoIds: readonly string[],
  id: string,
  앞으로: boolean,
): string[] {
  const 자리 = photoIds.indexOf(id);
  const 이웃 = 자리 + (앞으로 ? -1 : 1);
  if (자리 < 0 || 이웃 < 0 || 이웃 >= photoIds.length) return [...photoIds];
  const 바꾼_것 = [...photoIds];
  [바꾼_것[자리], 바꾼_것[이웃]] = [바꾼_것[이웃], 바꾼_것[자리]];
  return 바꾼_것;
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
export function keepsakeFrameOf(
  style: KeepsakeStyle,
  photoCount: number,
  /**
   * 빈 칸까지 다 보여 줄지. 꾸미는 중에만 참이다.
   *
   * 빈 칸이 찍힌 그림은 고장 난 카드처럼 보인다. 그래서 내보낼 때와 미리보기는
   * 고른 수만큼 틀을 줄인다. 그런데 꾸미는 중에도 줄이면, 「네컷」을 골랐는데
   * 사진 한 장이 세로로 긴 카드를 꽉 채워 늘어난 것처럼 보인다. 무엇을 하면
   * 네컷이 되는지도 알 수 없다. 꾸미는 동안에는 칸을 다 펴 두고 빈 칸을 그린다.
   */
  빈칸까지 = false,
): {
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
  const slots = 빈칸까지 ? 틀.want : Math.min(있는_것, 틀.want);
  const rows = 틀.방향 === "격자"
    ? keepsakeLayoutOf(slots)
    : 틀.방향 === "가로"
      ? [slots]
      : Array.from({ length: slots }, () => 1);
  const 채운_칸 = Math.min(있는_것, 틀.want);
  return {
    rows,
    slots,
    want: 틀.want,
    notice: 채운_칸 < 틀.want ? `사진 ${틀.want - 채운_칸}장을 더 고르면 ${틀.want}컷으로 꽉 차요` : "",
  };
}

/**
 * 홈 화면의 여행 카드에 이 카드를 그대로 담을 수 있는지. 담기지 않으면 그 까닭을 돌려준다.
 *
 * 홈의 사진 자리는 가로로 넓다. 사진관 스트립처럼 사진을 세로로 쌓은 배치는 그 자리에
 * 넣으면 손톱만 해진다. 눕히거나 격자로 바꿔 담지는 않는다. 만든 사람이 고른 모양과
 * 달라지기 때문이다. 담기지 않는 카드는 홈에 쓰지 못하게 막고 무엇을 하면 되는지 알린다.
 *
 * 보는 것은 카드의 겉 비율이 아니라 사진을 놓은 모양이다. 홈은 사진만 그리고 틀 색·
 * 스티커·글자는 그리지 않아서, 세로로 긴 4:5 카드라도 사진이 2×2 면 잘 담긴다.
 */
export function homeCardBlockedReason(style: KeepsakeStyle, photoCount: number): string {
  const rows = keepsakeFrameOf(style, photoCount).rows;
  if (rows.length <= Math.max(...rows, 1)) return "";
  return "가로나 정사각형 카드로 만들거나, 사진 한 장을 골라 주세요";
}

/**
 * 홈 화면의 여행 카드에 사진을 어떻게 놓을지. 줄마다 몇 칸인지로 돌려준다.
 *
 * 카드를 골랐으면 그 카드와 같은 배치고, 사진 한 장만 골랐으면 한 칸이다. 모르는 틀
 * 이름이 오면(앱이 더 옛 판이다) 사진 수에 맞는 기본 배치로 그린다.
 */
export function homeCoverRows(style: string | undefined | null, photoCount: number): number[] {
  if (photoCount <= 0) return [];
  const 아는_틀 = KEEPSAKE_STYLES.find((이름) => 이름 === style);
  return 아는_틀 ? keepsakeFrameOf(아는_틀, photoCount).rows : keepsakeLayoutOf(Math.min(photoCount, KEEPSAKE_MAX_PHOTOS));
}

/**
 * 폰에서 찍는 카드는 `exportWidth` 의 몇 배 픽셀인지. 세로 카드면 가로 2160px 이다.
 *
 * 웹은 `exportWidth` 그대로 찍는다. 2026-09-22 에 1080·1620·2160 을 견주어 2160 을 골랐다.
 * 이보다 크면 네컷(2160x6480)이 서버의 픽셀 한도(1600만)를 넘는다.
 */
export const KEEPSAKE_NATIVE_SHOT_FACTOR = 2;

/**
 * 폰에서 찍는 동안 카드를 몇 배로 키워 배치할지.
 *
 * 예전에는 카드를 화면 크기(가로 300)로 둔 채 찍으면서 크기만 `captureRef` 에 넘겼다.
 * iOS 는 그 값을 포인트로 읽어 기기 배율만큼 더 키웠고(가로 카드 5760px, 네컷은 못 찍음),
 * 안드로이드는 작게 찍어 늘렸다. 이제 카드 바깥 상자가 실제로 목표 픽셀이 되게 키우고 그대로 찍는다.
 *
 * 처음에는 카드를 화면 단위로 둔 채 transform 으로 키웠는데, iOS 는 모서리를 둥글게 자르는
 * 층을 키우기 전 크기로 먼저 그려 사진이 약 900px 수준으로 흐려졌다. 그래서 이 배수는
 * transform 이 아니라 `KeepsakeCardView` 의 `unit` 으로 넘겨, 크기 숫자를 곱한 스타일로
 * 처음부터 크게 배치한다(`scaleStyle.ts`). 2026-09-22 아이폰에서 표시본에 가까운 선명도를 확인했다.
 */
export function keepsakeShotScale(
  size: { width: number; exportWidth: number },
  pixelRatio: number,
): number {
  return (size.exportWidth * KEEPSAKE_NATIVE_SHOT_FACTOR) / (size.width * pixelRatio);
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
  return KEEPSAKE_STAT_KINDS.filter((kind) => card.stats.includes(kind))
    .map((kind) => ({ label: KEEPSAKE_STAT_LABELS[kind], value: 값[kind] }));
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

/** `우리의 서울 주말 추억 카드`. 기기 파일 이름에 못 쓰는 글자는 뺀다. */
export function keepsakeFileName(title: string): string {
  return `${safeFileName(title, "여행")} 추억 카드`;
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
  /** 적어 둔 제목, 없으면 `카드 1`. 목록과 확인창에서 카드를 부르는 이름이다. */
  label: string;
  /** `네컷 · 사진 4장`. 어떤 프레임에 사진 몇 장인지. */
  meta: string;
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
    .map((row, 차례) => {
      const card = keepsakeCardOf(row.settings, tripName, photoIds);
      return {
        id: row.id,
        card,
        // 여행 이름을 따라가는 제목(`keepsakeCardOf`)이 아니라 적어 둔 제목만 본다.
        // 그것을 쓰면 제목 없는 카드가 전부 여행 이름이 돼 서로 가려지지 않는다.
        label: (row.settings?.title ?? "").trim() || `카드 ${차례 + 1}`,
        meta: `${keepsakeStyleLabel(card.style)} · 사진 ${card.photoIds.length}장`,
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
  if (photoCount <= 0) return "사진을 한 장 추가하면 추억 카드를 만들 수 있어요";
  if (cardCount >= KEEPSAKE_MAX_CARDS) return `카드는 여행마다 ${KEEPSAKE_MAX_CARDS}장까지 모아 둘 수 있어요`;
  return "";
}
