/**
 * 기념 카드 위에 얹는 것 — 스티커와 글자.
 *
 * 인생네컷처럼 손으로 끌어 옮기고 키우고 돌린다. 그래서 자리와 크기를 픽셀이
 * 아니라 **카드 크기에 대한 비율(0~1)** 로 들고 있는다. 카드는 미리보기에서
 * 작게, 내보낼 때 1080px 로, 꾸미기 화면에서는 화면에 맞춰 줄여 그린다. 셋이
 * 같은 그림이어야 해서 비율 말고는 답이 없다.
 *
 * 픽셀로 바꾸는 셈은 `decorBoxOf` 하나뿐이다. 그리는 쪽이 저마다 계산하면
 * 줄인 배율과 실제 크기가 어긋난다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { isKnownSticker, LEGACY_STICKERS, stickerAspect } from "./stickers/catalog.ts";

/**
 * 붙일 수 있는 스티커의 이름. 값은 화면에 보이는 말 그대로다.
 *
 * 2026-09-22 에 오려 붙인 스티커 47개로 늘렸다(`stickers/catalog.ts`). 이름은 한 번 내보내면
 * 바꾸지 않는다. 이 판이 모르는 이름은 `unknownDecorOf` 가 들고 있다가 돌려보낸다.
 */
export type KeepsakeSticker = string;

/**
 * 첫 판의 스티커 아홉. 옛 판이 남긴 `stickers` 칸을 옮길 때(`legacyDecorOf`)만 쓴다.
 * 비행기는 「이상하게 보인다」는 말을 듣고 고르는 자리에서 뺐지만, 그려지기는 한다.
 */
export const KEEPSAKE_STICKERS: KeepsakeSticker[] = [...LEGACY_STICKERS];

/** 스티커가 붙던 모서리. 이제는 옛 값을 옮길 때만 쓴다. */
type KeepsakeCorner = "좌상" | "우상" | "좌하" | "우하";

/** 카드 위에 얹은 것 한 개. */
export type CardDecor = {
  /** 이 카드 안에서만 쓰는 이름. 고른 것을 가려내는 데 쓴다. */
  id: string;
  /** 스티커 이름, 글자면 `글자`. */
  kind: KeepsakeSticker | "글자";
  /** 글자일 때 적을 말. 스티커면 빈 글자다. */
  text: string;
  /** 카드 너비·높이에 대한 가운데 자리(0~1). */
  x: number;
  y: number;
  /** 카드의 짧은 변에 대한 크기(0~1). 비율이 달라도 같은 크기로 보인다. */
  size: number;
  /** 기운 각도(도). -180~180. */
  angle: number;
  /** 겹침 순서. 클수록 위에 있다. 읽을 때 0부터 다시 매긴다. */
  z: number;
  /** 글자의 글꼴·색·바탕. 기본이면 적지 않는다(저장 모양이 예전과 같다). 스티커에는 없다. */
  font?: DecorFont;
  color?: DecorColor;
  back?: DecorBack;
  /**
   * 이 판이 모르는 칸. 더 새 앱이 붙여 둔 것이라 읽기만 하고 저장할 때 그대로
   * 돌려보낸다. 버리면 이 앱으로 카드를 한 번 고치는 것만으로 새 앱의 값이 사라진다.
   */
  extra?: Record<string, unknown>;
};

/**
 * 글자 꾸미기(2026-09-22). 인스타그램 스토리처럼 적는 자리에서 고른다.
 *
 * 값은 보이는 말 그대로 저장한다. 모르는 값(더 새 앱이 더한 글꼴 등)은 버리지 않고
 * `extra` 에 그대로 들고 있다가 돌려보낸다. 그리는 쪽은 기본으로 그린다.
 */
export const DECOR_FONTS = ["기본", "손글씨", "굵게", "둥글게"] as const;
export type DecorFont = (typeof DECOR_FONTS)[number];
export const DECOR_COLORS = ["흰색", "검정", "크림", "주황", "빨강", "초록", "파랑", "보라"] as const;
type DecorColor = (typeof DECOR_COLORS)[number];
/** 글자 색. 흰색이 기본이다(사진 위에 얹는 일이 많아서). */
export const DECOR_COLOR_HEX: Record<DecorColor, string> = {
  흰색: "#FFFFFF", 검정: "#16151B", 크림: "#FFE7A8", 주황: "#F2A03D",
  빨강: "#E86A6A", 초록: "#5FA88E", 파랑: "#6F86DA", 보라: "#A77FD0",
};
/**
 * 글자 바탕. 뒤의 일곱은 「글씨」 스티커(`stickers/art.ts`)를 그대로 가져와 글자만 적은 말로
 * 바꿔 끼운다(2026-09-22, 사용자가 「스티커에 있는 걸 그대로」라고 했다). 색은 스티커 그대로다.
 */
export const DECOR_BACKS = ["없음", "띠", "형광펜", "말풍선", "리본", "태그", "도장", "이름표", "딱지", "하트", "풍선"] as const;
/** 스티커 모양 바탕과 그 스티커 이름. */
export const DECOR_SHAPE_STICKER = {
  리본: "최고의 하루", 태그: "여행 중", 도장: "맛집", 이름표: "또 오자", 딱지: "디데이", 하트: "우리", 풍선: "행복",
} as const;
export type DecorShapeBack = keyof typeof DECOR_SHAPE_STICKER;
export const DECOR_SHAPE_BACKS = Object.keys(DECOR_SHAPE_STICKER) as DecorShapeBack[];
/** 스티커 모양 바탕인지. 카드·글자 창·색 셈이 모두 이것으로 가른다. */
export const isShapeBack = (back: string | undefined): back is DecorShapeBack =>
  back !== undefined && (DECOR_SHAPE_BACKS as readonly string[]).includes(back);
/**
 * 스티커 모양 바탕에 넣을 수 있는 글자 수. 길면 모양이 일그러지거나 글자가 읽히지 않게 작아진다.
 * 띠 모양은 옆으로 늘려 담고(1.6 배까지), 동그란 것(도장·하트)은 늘리지 않는다.
 */
export const DECOR_SHAPE_TEXT_MAX = { 띠: 12, 동그란: 6 } as const;
export const decorShapeTextMax = (back: string): number =>
  back === "도장" || back === "하트" ? DECOR_SHAPE_TEXT_MAX.동그란 : DECOR_SHAPE_TEXT_MAX.띠;
/** 이 바탕에 적을 수 있는 글자 수. 스티커 모양이면 더 짧고, 아니면 `DECOR_TEXT_MAX` 다. */
export const decorTextMaxOf = (back: string | undefined): number =>
  isShapeBack(back) ? decorShapeTextMax(back) : DECOR_TEXT_MAX;
type DecorBack = (typeof DECOR_BACKS)[number];

/** 어두운 색인지. 그 위에 흰 글자를 쓸지 가른다. */
export const isDarkColor = (hex: string) => {
  const 수 = parseInt(hex.slice(1), 16);
  return ((수 >> 16) & 255) * 0.299 + ((수 >> 8) & 255) * 0.587 + (수 & 255) * 0.114 < 110;
};

/**
 * 글자에 칠할 색. 카드(`KeepsakeCardView`)와 글자 입력 창이 같은 셈을 쓴다.
 * 「띠」는 고른 색을 바탕으로 깔고 대비되는 글자를, 「형광펜」은 늘 어두운 글자를,
 * 「말풍선」은 흰 풍선 안에 고른 색(흰색이면 어두운 글자)을 쓴다.
 */
export function decorInkOf(decor: Pick<CardDecor, "color" | "back">): { ink: string; paint: string } {
  const paint = DECOR_COLOR_HEX[decor.color ?? "흰색"];
  const back = decor.back ?? "없음";
  const 대비 = isDarkColor(paint) ? "#FFFFFF" : "#16151B";
  const ink = back === "띠" || isShapeBack(back)
      ? 대비
      : back === "형광펜"
        ? "#16151B"
        : back === "말풍선" && paint === "#FFFFFF" ? "#16151B" : paint;
  return { ink, paint };
}

/** 이 판이 아는 칸. 나머지는 `extra` 로 들고 있다가 돌려보낸다. */
const DECOR_KEYS = new Set(["id", "kind", "text", "x", "y", "size", "angle", "z", "font", "color", "back"]);

/** 아는 값이면 그 값, 기본이거나 없으면 undefined. 모르는 값은 `extra` 로 간다(아래). */
const 고른_것 = <T extends string>(all: readonly T[], 값: unknown, 기본: T): T | undefined =>
  all.includes(값 as T) && 값 !== 기본 ? (값 as T) : undefined;

/** 한 카드에 얹을 수 있는 수. 서버도 같은 수로 막는다. */
export const DECOR_MAX = 30;
/** 글자 한 줄의 길이. 길면 카드를 덮는다. */
export const DECOR_TEXT_MAX = 24;
export const DECOR_MIN_SIZE = 0.06;
export const DECOR_MAX_SIZE = 0.6;
/** 새로 붙이는 스티커의 크기와 글자 크기. */
export const DECOR_NEW_SIZE = 0.16;
export const DECOR_NEW_TEXT_SIZE = 0.1;
/** 크기 버튼 한 번에 바뀌는 배. 더하기가 아니라 곱이라 작을수록 잘게 움직인다. */
const SIZE_STEP = 1.2;
/** 회전 버튼 한 번에 도는 각. */
export const DECOR_ANGLE_STEP = 15;

const clamp = (값: number, 아래: number, 위: number) => Math.min(위, Math.max(아래, 값));
const 숫자 = (값: unknown, 기본: number) =>
  typeof 값 === "number" && Number.isFinite(값) ? 값 : 기본;
/** 저장할 때 소수 셋째 자리까지만 남긴다. 그보다 잘게 적어도 눈에 보이지 않는다. */
const 반올림 = (값: number) => Math.round(값 * 1000) / 1000;
/** -180~180 으로 접는다. 370도와 10도는 같은 그림이다. */
export const turnedAngle = (각: number) => (((각 + 180) % 360) + 360) % 360 - 180;

const isSticker = (값: unknown): 값 is KeepsakeSticker =>
  typeof 값 === "string" && isKnownSticker(값);

/** 모르는 칸만 골라 낸다. 하나도 없으면 undefined 라 저장 모양이 예전과 같다. */
const 모르는_칸 = (값: Record<string, unknown>): Record<string, unknown> | undefined => {
  const 남은_것 = Object.entries(값).filter(([key]) => !DECOR_KEYS.has(key));
  // 아는 칸이라도 이 판이 모르는 값(새 글꼴 이름 등)은 들고 있다가 돌려보낸다.
  const 모르는_값 = ([
    ["font", DECOR_FONTS],
    ["color", DECOR_COLORS],
    ["back", DECOR_BACKS],
  ] as const).filter(([key, all]) => typeof 값[key] === "string" && !(all as readonly string[]).includes(값[key] as string))
    .map(([key]) => [key, 값[key]] as const);
  const 모두 = [...남은_것, ...모르는_값];
  return 모두.length ? Object.fromEntries(모두) : undefined;
};

/**
 * 이 판이 모르는 이름의 줄. 더 새 앱이 붙인 스티커다.
 *
 * 그릴 줄 모르니 `decorOf` 는 빼지만 버리지는 않는다. 받은 모양 그대로 들고 있다가
 * 저장할 때 돌려보낸다(`keepsakeBodyOf`). 이름이 없거나 모양이 틀린 줄은 여기서도 버린다.
 */
export function unknownDecorOf(saved: unknown): Record<string, unknown>[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter((줄): 줄 is Record<string, unknown> => {
    if (!줄 || typeof 줄 !== "object" || Array.isArray(줄)) return false;
    const kind = (줄 as Record<string, unknown>).kind;
    return typeof kind === "string" && kind !== "" && kind !== "글자" && !isSticker(kind);
  });
}

/**
 * 저장된 목록을 읽는다. 모양이 틀린 줄은 버린다. 모르는 이름의 줄은 빼 두고
 * `unknownDecorOf` 가 따로 들고 있는다.
 *
 * 겹침 순서는 저장된 `z` 로 줄을 세운 뒤 0부터 다시 매긴다. 손으로 고친 값이나
 * 옛 판이 남긴 값에서 순서가 비거나 겹쳐 있어도 그리는 쪽은 신경 쓸 것이 없다.
 */
export function decorOf(saved: unknown): CardDecor[] {
  if (!Array.isArray(saved)) return [];
  const 읽은_것 = saved
    .map((줄, 차례): CardDecor | null => {
      if (!줄 || typeof 줄 !== "object") return null;
      const 값 = 줄 as Record<string, unknown>;
      const 글자 = 값.kind === "글자";
      if (!글자 && !isSticker(값.kind)) return null;
      const text = 글자 ? String(값.text ?? "").trim().slice(0, DECOR_TEXT_MAX) : "";
      // 글자를 다 지운 줄은 카드에 아무것도 안 그린다. 자리만 차지한다.
      if (글자 && !text) return null;
      const extra = 모르는_칸(값);
      return {
        id: typeof 값.id === "string" && 값.id ? 값.id : `d${차례 + 1}`,
        kind: 글자 ? "글자" : (값.kind as KeepsakeSticker),
        text,
        x: clamp(숫자(값.x, 0.5), 0, 1),
        y: clamp(숫자(값.y, 0.5), 0, 1),
        size: clamp(숫자(값.size, DECOR_NEW_SIZE), DECOR_MIN_SIZE, DECOR_MAX_SIZE),
        angle: turnedAngle(숫자(값.angle, 0)),
        z: 숫자(값.z, 차례),
        ...(글자 ? 글자_꾸밈(값) : {}),
        ...(extra ? { extra } : {}),
      };
    })
    .filter((줄): 줄 is CardDecor => 줄 !== null)
    .slice(0, DECOR_MAX);
  return 다시_매긴다(읽은_것);
}

/** 글자의 글꼴·색·바탕 가운데 기본이 아닌 것만. */
const 글자_꾸밈 = (값: Record<string, unknown>): Pick<CardDecor, "font" | "color" | "back"> => {
  const font = 고른_것(DECOR_FONTS, 값.font, "기본");
  const color = 고른_것(DECOR_COLORS, 값.color, "흰색");
  const back = 고른_것(DECOR_BACKS, 값.back, "없음");
  return { ...(font ? { font } : {}), ...(color ? { color } : {}), ...(back ? { back } : {}) };
};

/** 겹침 순서로 줄을 세우고 0부터 다시 매긴다. 같은 순서면 먼저 온 것이 아래다. */
const 다시_매긴다 = (list: readonly CardDecor[]): CardDecor[] =>
  list
    .map((줄, 차례) => ({ 줄, 차례 }))
    .sort((a, b) => a.줄.z - b.줄.z || a.차례 - b.차례)
    .map(({ 줄 }, z) => (줄.z === z ? 줄 : { ...줄, z }));

/**
 * 서버로 보낼 모양. 소수는 셋째 자리까지만 적는다.
 *
 * 비워 둔 텍스트는 보내지 않는다. 「텍스트 입력」을 얹고 글을 다 지운 채 저장하면
 * 보이지 않는 줄만 남는데, 읽을 때(`decorOf`)도 어차피 버리는 줄이다.
 */
export function decorBodyOf(list: readonly CardDecor[]): Record<string, unknown>[] {
  return list.filter((줄) => 줄.kind !== "글자" || 줄.text.trim()).slice(0, DECOR_MAX).map((줄) => ({
    // 모르는 칸을 먼저 깔고 아는 칸으로 덮는다. 이 판이 고친 값이 늘 이긴다.
    ...줄.extra,
    id: 줄.id,
    kind: 줄.kind,
    text: 줄.kind === "글자" ? 줄.text.slice(0, DECOR_TEXT_MAX) : null,
    x: 반올림(줄.x),
    y: 반올림(줄.y),
    size: 반올림(줄.size),
    angle: 반올림(줄.angle),
    z: 줄.z,
    // 기본은 적지 않는다. 적으면 글자를 꾸미지 않은 카드도 저장 모양이 달라진다.
    ...(줄.kind === "글자" && 줄.font && 줄.font !== "기본" ? { font: 줄.font } : {}),
    ...(줄.kind === "글자" && 줄.color && 줄.color !== "흰색" ? { color: 줄.color } : {}),
    ...(줄.kind === "글자" && 줄.back && 줄.back !== "없음" ? { back: 줄.back } : {}),
  }));
}

/**
 * 카드 픽셀 크기에서 이것이 놓일 상자.
 *
 * 스티커는 짧은 변에 맞춘 정사각이다. 글자는 높이만 그 크기이고 너비는 글이
 * 차지하는 만큼이다. 그리는 쪽이 재서 `textWidth` 로 넘긴다. 아직 못 쟀으면
 * 카드 너비로 본다.
 */
export function decorBoxOf(
  decor: Pick<CardDecor, "kind" | "x" | "y" | "size">,
  width: number,
  height: number,
  textWidth?: number,
  /** 글자를 잰 높이. 바탕 모양(스티커 모양 등)에 따라 달라서 그리는 쪽이 재서 넘긴다. */
  textHeight?: number,
): { cx: number; cy: number; width: number; height: number; side: number } {
  const side = decor.size * Math.min(width, height);
  // 스티커는 긴 변이 `side` 다. 탑승권·테이프처럼 가로로 긴 것은 그 비율만큼 납작하다.
  const 비율 = decor.kind === "글자" ? 1 : stickerAspect(decor.kind);
  return {
    cx: decor.x * width,
    cy: decor.y * height,
    width: decor.kind === "글자" ? Math.min(width, textWidth ?? width) : 비율 >= 1 ? side : side * 비율,
    height: decor.kind === "글자" ? textHeight ?? side * 1.4 : 비율 >= 1 ? side / 비율 : side,
    side,
  };
}

/**
 * 카드 밖으로 나가지 않게 가장자리에서 멈춘다.
 *
 * 절반이 나가면 잘린 그림이 저장된다. 스티커는 상자가 다 들어오게 막고, 글자는
 * 너비를 알 수 없어서 좌우로는 조금만 남기고 위아래만 막는다.
 */
export function clampDecorSpot(
  decor: Pick<CardDecor, "kind" | "size">,
  x: number,
  y: number,
  width: number,
  height: number,
  /** 글자를 잰 크기. 있으면 글자 상자가 통째로 카드 안에 머물게 막는다. */
  textSize?: { width: number; height: number },
): { x: number; y: number } {
  const 상자 = decorBoxOf({ ...decor, x: 0, y: 0 }, width, height, textSize?.width, textSize?.height);
  const 가로_여유 = decor.kind === "글자"
    ? Math.min(0.5, textSize?.width ? 상자.width / 2 / width : 0.06)
    : 상자.width / 2 / width;
  const 세로_여유 = 상자.height / 2 / height;
  return {
    x: clamp(x, 가로_여유, 1 - 가로_여유),
    y: clamp(y, 세로_여유, 1 - 세로_여유),
  };
}

/** 다음에 쓸 이름. `d1`, `d2`… 있는 것과 겹치지 않는 수를 고른다. */
const 다음_이름 = (list: readonly CardDecor[]): string => {
  const 쓴_수 = list.map((줄) => Number(/^d(\d+)$/.exec(줄.id)?.[1] ?? 0));
  return `d${Math.max(0, ...쓴_수) + 1}`;
};

/**
 * 하나 더 붙인다. 넘치면 그대로 둔다.
 *
 * 늘 가운데에 놓으면 여러 개를 고를 때 정확히 포개져서 하나만 있는 줄 안다.
 * 붙인 수만큼 오른쪽 아래로 조금씩 비껴 놓는다.
 */
export function addDecor(
  list: readonly CardDecor[],
  kind: KeepsakeSticker | "글자",
  text = "",
): CardDecor[] {
  if (list.length >= DECOR_MAX) return [...list];
  const 비낌 = (list.length % 5) * 0.06 - 0.12;
  const 새것: CardDecor = {
    id: 다음_이름(list),
    kind,
    text: kind === "글자" ? text.trim().slice(0, DECOR_TEXT_MAX) : "",
    x: 0.5 + 비낌,
    y: 0.5 + 비낌,
    // 가로로 긴 스티커(글씨 띠·테이프)는 같은 크기로 붙이면 너무 가늘어서 두 배로 붙인다.
    size: kind === "글자" ? DECOR_NEW_TEXT_SIZE : stickerAspect(kind) > 1.5 ? Math.min(DECOR_MAX_SIZE, DECOR_NEW_SIZE * 2) : DECOR_NEW_SIZE,
    angle: 0,
    z: list.length,
  };
  return [...list, 새것];
}

/** 글자의 글꼴·색·바탕을 바꾼다. 바꾼 칸의 모르는 옛 값은 버린다(사람이 새로 골랐다). */
export function setDecorStyle(
  list: readonly CardDecor[],
  id: string,
  change: Partial<Pick<CardDecor, "font" | "color" | "back">>,
): CardDecor[] {
  return list.map((줄) => {
    if (줄.id !== id || 줄.kind !== "글자") return 줄;
    const extra = 줄.extra ? { ...줄.extra } : undefined;
    for (const key of Object.keys(change)) delete extra?.[key];
    const 다음 = { ...줄, ...change, extra: extra && Object.keys(extra).length ? extra : undefined };
    if (!다음.extra) delete 다음.extra;
    return 다음;
  });
}

/**
 * 같은 것을 하나 더 붙인다(스티커 손잡이의 ⧉). 조금 비껴 놓고 맨 위에 둔다.
 * 넘치면 그대로 둔다.
 */
export function duplicateDecor(list: readonly CardDecor[], id: string): CardDecor[] {
  const 원본 = list.find((줄) => 줄.id === id);
  if (!원본 || list.length >= DECOR_MAX) return [...list];
  const 복사 = {
    ...원본,
    id: 다음_이름(list),
    x: clamp(원본.x + 0.05, 0, 1),
    y: clamp(원본.y + 0.05, 0, 1),
    z: list.length,
  };
  return 다시_매긴다([...list, 복사]);
}

export function removeDecor(list: readonly CardDecor[], id: string): CardDecor[] {
  return 다시_매긴다(list.filter((줄) => 줄.id !== id));
}

/** 손을 뗄 때 한 번 부른다. 끄는 동안에는 그리기만 하고 여기 오지 않는다. */
export function moveDecor(
  list: readonly CardDecor[],
  id: string,
  x: number,
  y: number,
): CardDecor[] {
  return list.map((줄) => (줄.id === id ? { ...줄, x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : 줄));
}

/**
 * 모서리를 끄는 동안 크기와 각도를 함께 놓는다.
 *
 * 손잡이 하나로 둘이 같이 바뀐다. 스티커를 집어 돌려 키우는 손놀림이 그렇다.
 * 크기는 한계에서 멈추고, 각도는 -180~180 으로 접는다. 버튼으로 15도씩 누르던
 * `turnDecor` 와 배로 키우던 `resizeDecor` 를 이것이 대신한다(둘은 아직 남겨
 * 둔다. 손잡이를 못 쓰는 자리가 생기면 다시 쓸 수 있고, 시험도 그대로다).
 */
export function setDecorSize(
  list: readonly CardDecor[],
  id: string,
  size: number,
  angle: number,
): CardDecor[] {
  return list.map((줄) =>
    줄.id === id
      ? { ...줄, size: clamp(size, DECOR_MIN_SIZE, DECOR_MAX_SIZE), angle: turnedAngle(angle) }
      : 줄);
}

/** 크기 버튼. 한계에 닿으면 더 가지 않는다. */
export function resizeDecor(list: readonly CardDecor[], id: string, 크게: boolean): CardDecor[] {
  return list.map((줄) =>
    줄.id === id
      ? { ...줄, size: clamp(줄.size * (크게 ? SIZE_STEP : 1 / SIZE_STEP), DECOR_MIN_SIZE, DECOR_MAX_SIZE) }
      : 줄);
}

/** 회전 버튼. */
export function turnDecor(list: readonly CardDecor[], id: string, 오른쪽: boolean): CardDecor[] {
  return list.map((줄) =>
    줄.id === id ? { ...줄, angle: turnedAngle(줄.angle + (오른쪽 ? 1 : -1) * DECOR_ANGLE_STEP) } : 줄);
}

/**
 * 겹침 순서. 바로 위(아래) 것과 자리를 바꾼다.
 *
 * 맨 위에서 더 올리거나 맨 아래에서 더 내리면 그대로 둔다.
 */
export function raiseDecor(list: readonly CardDecor[], id: string, 위로: boolean): CardDecor[] {
  const 줄지어 = 다시_매긴다(list);
  const 자리 = 줄지어.findIndex((줄) => 줄.id === id);
  const 이웃 = 자리 + (위로 ? 1 : -1);
  if (자리 < 0 || 이웃 < 0 || 이웃 >= 줄지어.length) return 줄지어;
  const 바꾼_것 = [...줄지어];
  [바꾼_것[자리], 바꾼_것[이웃]] = [바꾼_것[이웃], 바꾼_것[자리]];
  return 바꾼_것.map((줄, z) => ({ ...줄, z }));
}

/** 글자를 고친다. 다 지워도 줄은 남는다. 저장할 때 빈 줄이 빠진다. */
export function setDecorText(list: readonly CardDecor[], id: string, text: string): CardDecor[] {
  return list.map((줄) =>
    줄.id === id && 줄.kind === "글자" ? { ...줄, text: text.slice(0, DECOR_TEXT_MAX) } : 줄);
}

/** 스티커가 붙던 모서리. 앞에서부터 차례로 썼다. */
const 옛_모서리: KeepsakeCorner[] = ["우상", "좌하", "좌상", "우하"];
/** 옛 스티커가 붙던 사진 영역. 네컷 틀의 여백에서 어림한 값이다. */
const 옛_영역 = { left: 0.05, top: 0.035, right: 0.95, bottom: 0.8 };
const 옛_크기 = 0.11;

/**
 * 옛 값(정해진 자리 스티커 목록)을 새 형식으로 옮긴다.
 *
 * 옛 판은 켠 스티커를 사진 칸 모서리에 하나씩 붙였다. 그 자리를 비율로 바꿔
 * 놓는다. 여백은 틀마다 조금씩 달라서 칸 그대로는 아니고 어림이다. 옮긴 뒤에는
 * 손으로 옮길 수 있으니 여기서 더 정밀할 까닭이 없다.
 *
 * 켠 차례가 아니라 `KEEPSAKE_STICKERS` 차례로 놓는다. 옛 판과 같은 그림이 된다.
 */
export function legacyDecorOf(
  stickers: readonly string[],
  rows: readonly number[],
): CardDecor[] {
  const 줄수 = rows.length ? rows : [1];
  const 칸 = Math.max(1, 줄수.reduce((합, 한_줄) => 합 + 한_줄, 0));
  const 칸_시작 = 줄수.map((_, 차례) => 줄수.slice(0, 차례).reduce((합, 앞) => 합 + 앞, 0));
  const 넓이 = 옛_영역.right - 옛_영역.left;
  const 높이 = 옛_영역.bottom - 옛_영역.top;
  return KEEPSAKE_STICKERS.filter((sticker) => stickers.includes(sticker))
    .slice(0, 칸 * 옛_모서리.length)
    .map((kind, 차례) => {
      const slot = 차례 % 칸;
      const 바퀴 = Math.floor(차례 / 칸);
      const corner = 옛_모서리[(slot + 바퀴) % 옛_모서리.length];
      const r = Math.max(0, 칸_시작.findIndex((시작, i) => slot >= 시작 && slot < 시작 + 줄수[i]));
      const c = slot - 칸_시작[r];
      const 칸_왼쪽 = 옛_영역.left + (넓이 / 줄수[r]) * c;
      const 칸_위 = 옛_영역.top + (높이 / 줄수.length) * r;
      const 칸_넓이 = 넓이 / 줄수[r];
      const 칸_높이 = 높이 / 줄수.length;
      const 안쪽 = 옛_크기 * 0.6;
      return {
        id: `d${차례 + 1}`,
        kind,
        text: "",
        x: corner === "좌상" || corner === "좌하"
          ? 칸_왼쪽 + 안쪽
          : 칸_왼쪽 + 칸_넓이 - 안쪽,
        y: corner === "좌상" || corner === "우상"
          ? 칸_위 + 안쪽
          : 칸_위 + 칸_높이 - 안쪽,
        size: 옛_크기,
        angle: 0,
        z: 차례,
      };
    });
}

/**
 * 카드를 화면에 맞춰 줄일 배율.
 *
 * 꾸미는 동안 카드가 통째로 보여야 한다. 세로로 긴 네컷 스트립은 줄이고, 작고
 * 납작한 가로 카드는 키운다. 너무 키우면 사진이 뭉개져서 2.4배에서 멈춘다.
 * 잴 곳이 아직 없으면(첫 그리기) 1 이다.
 */
export function fitScaleOf(
  cardWidth: number,
  cardHeight: number,
  boxWidth: number,
  boxHeight: number,
): number {
  if (cardWidth <= 0 || cardHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) return 1;
  return Math.min(2.4, boxWidth / cardWidth, boxHeight / cardHeight);
}
