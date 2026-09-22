/**
 * 추억 카드 스티커 목록.
 *
 * 이름은 카드 자료에 그대로 저장된다. 한 번 내보낸 이름은 바꾸지도 지우지도 않는다.
 * 바꾸면 그 이름을 붙여 둔 카드에서 스티커가 사라진다(모르는 이름은 그리지 않는다).
 * 20자를 넘기지 않는다.
 *
 * react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 * 그림은 `art.ts`, 그리는 부품은 `StickerArt.tsx`.
 */

export type StickerCategory = {
  /** 고르는 자리의 갈래 이름. */
  name: string;
  /** 고르는 자리에 놓는 차례. */
  stickers: readonly string[];
};

export const STICKER_CATEGORIES: readonly StickerCategory[] = [
  {
    name: "여행",
    stickers: ["캐리어", "탑승권", "카메라", "필름", "지도핀", "기차", "버스", "여권", "텐트"],
  },
  {
    name: "음식",
    stickers: ["커피", "맥주", "아이스크림", "떡볶이", "치킨", "케이크", "소주", "수박"],
  },
  {
    name: "날씨",
    stickers: ["해", "구름", "비", "무지개", "눈송이", "달", "바람", "우산"],
  },
  {
    name: "기분",
    stickers: ["하트", "별", "반짝", "엄지척", "웃는 얼굴", "느낌표", "체크", "꽃", "말풍선"],
  },
  {
    name: "글씨",
    stickers: ["최고의 하루", "여행 중", "맛집", "또 오자", "디데이", "우리", "행복"],
  },
  {
    name: "테이프",
    stickers: ["줄무늬 테이프", "도트 테이프", "체크 테이프", "베이지 테이프", "민트 테이프", "분홍 테이프"],
  },
];

/**
 * 어느 갈래에도 없지만 그리는 것. 옛 카드에 붙어 있을 수 있다.
 * 비행기는 「이상하게 보인다」는 말을 듣고 고르는 자리에서 뺐다.
 */
export const HIDDEN_STICKERS: readonly string[] = ["비행기"];

/** 예전 판의 스티커 아홉 개. 이 이름들은 계속 그려야 한다. */
export const LEGACY_STICKERS: readonly string[] = [
  "하트", "별", "비행기", "필름", "말풍선", "체크", "꽃", "구름", "반짝",
];

/**
 * 너비/높이. 1 이 아닌 것만 적는다.
 * 카드가 상자 크기를 잡을 때 쓴다. `art.ts` 의 viewBox 와 같아야 한다(시험이 본다).
 */
const 넓은_것: Readonly<Record<string, number>> = {
  탑승권: 64 / 36,
  "최고의 하루": 104 / 30,
  "여행 중": 72 / 30,
  "또 오자": 72 / 34,
  디데이: 64 / 32,
  행복: 52 / 40,
  "줄무늬 테이프": 4,
  "도트 테이프": 4,
  "체크 테이프": 4,
  "베이지 테이프": 4,
  "민트 테이프": 4,
  "분홍 테이프": 4,
};

/** 그릴 줄 아는 이름 전부. 숨긴 것도 들어 있다. */
export const STICKER_NAMES: ReadonlySet<string> = new Set([
  ...STICKER_CATEGORIES.flatMap((갈래) => 갈래.stickers),
  ...HIDDEN_STICKERS,
]);

export function isKnownSticker(name: string): boolean {
  return STICKER_NAMES.has(name);
}

/** 스티커의 너비/높이. 모르는 이름은 1. */
export function stickerAspect(name: string): number {
  return 넓은_것[name] ?? 1;
}

/** 이 스티커가 든 갈래 이름. 숨긴 것과 모르는 것은 undefined. */
export function categoryOf(name: string): string | undefined {
  return STICKER_CATEGORIES.find((갈래) => 갈래.stickers.includes(name))?.name;
}
