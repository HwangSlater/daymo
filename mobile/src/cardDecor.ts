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

/** 붙일 수 있는 스티커. 값은 화면에 보이는 말 그대로다. */
export type KeepsakeSticker =
  | "하트" | "별" | "비행기" | "필름" | "말풍선" | "체크" | "꽃" | "구름" | "반짝";

export const KEEPSAKE_STICKERS: KeepsakeSticker[] = [
  "하트", "별", "비행기", "필름", "말풍선", "체크", "꽃", "구름", "반짝",
];

/**
 * 지금 고를 수 있는 스티커.
 *
 * 비행기는 「이상하게 보인다」는 말을 듣고 뺐다. 위의 전체 목록에서는 지우지
 * 않는다. 지우면 이미 비행기를 얹어 둔 카드가 읽힐 때 그 줄이 통째로 버려진다
 * (`decorOf` 는 모르는 이름을 버린다). 그리기는 그대로 두고 새로 고르는 자리에서만
 * 뺀다. 남의 카드에 있던 비행기도 계속 보인다.
 */
export const KEEPSAKE_PALETTE: KeepsakeSticker[] = KEEPSAKE_STICKERS.filter(
  (하나) => 하나 !== "비행기",
);

/** 스티커가 붙던 모서리. 이제는 옛 값을 옮길 때만 쓴다. */
export type KeepsakeCorner = "좌상" | "우상" | "좌하" | "우하";

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
};

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
  KEEPSAKE_STICKERS.includes(값 as KeepsakeSticker);

/**
 * 저장된 목록을 읽는다. 모양이 틀린 줄은 버린다.
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
      return {
        id: typeof 값.id === "string" && 값.id ? 값.id : `d${차례 + 1}`,
        kind: 글자 ? "글자" : (값.kind as KeepsakeSticker),
        text,
        x: clamp(숫자(값.x, 0.5), 0, 1),
        y: clamp(숫자(값.y, 0.5), 0, 1),
        size: clamp(숫자(값.size, DECOR_NEW_SIZE), DECOR_MIN_SIZE, DECOR_MAX_SIZE),
        angle: turnedAngle(숫자(값.angle, 0)),
        z: 숫자(값.z, 차례),
      };
    })
    .filter((줄): 줄 is CardDecor => 줄 !== null)
    .slice(0, DECOR_MAX);
  return 다시_매긴다(읽은_것);
}

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
    id: 줄.id,
    kind: 줄.kind,
    text: 줄.kind === "글자" ? 줄.text.slice(0, DECOR_TEXT_MAX) : null,
    x: 반올림(줄.x),
    y: 반올림(줄.y),
    size: 반올림(줄.size),
    angle: 반올림(줄.angle),
    z: 줄.z,
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
): { cx: number; cy: number; width: number; height: number; side: number } {
  const side = decor.size * Math.min(width, height);
  return {
    cx: decor.x * width,
    cy: decor.y * height,
    width: decor.kind === "글자" ? Math.min(width, textWidth ?? width) : side,
    height: decor.kind === "글자" ? side * 1.4 : side,
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
): { x: number; y: number } {
  const 상자 = decorBoxOf({ ...decor, x: 0, y: 0 }, width, height);
  const 가로_여유 = decor.kind === "글자" ? 0.06 : 상자.width / 2 / width;
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
    size: kind === "글자" ? DECOR_NEW_TEXT_SIZE : DECOR_NEW_SIZE,
    angle: 0,
    z: list.length,
  };
  return [...list, 새것];
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
