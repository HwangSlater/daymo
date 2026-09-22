/**
 * 스타일의 크기 숫자에 한 배수를 곱한다.
 *
 * 추억 카드는 화면 단위(가로 300)로 배치한다. 폰에서 카드를 찍을 때 예전에는 이것을
 * transform 으로 키웠는데, iOS 는 모서리를 둥글게 자르는 층을 키우기 전 크기로 먼저 그려
 * 사진이 900px 수준으로 흐려졌다(2026-09-22 실기기에서 잼). 이제 찍을 때는 모든 크기
 * 숫자에 배수를 곱한 스타일로 카드를 처음부터 큰 크기로 배치한다(`KeepsakeCardView` 의 `unit`).
 *
 * 곱하는 것은 길이뿐이다. 퍼센트 글자, 비율(flex, opacity, aspectRatio), 색, 각도는 그대로 둔다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 길이를 나타내는 키. 여기 없는 숫자(flex, opacity, zIndex, elevation 등)는 그대로 둔다. */
const 길이_키 = new Set([
  "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
  "top", "right", "bottom", "left", "inset", "start", "end",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft", "marginHorizontal", "marginVertical",
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "paddingHorizontal", "paddingVertical",
  "gap", "rowGap", "columnGap",
  "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
  "fontSize", "lineHeight", "letterSpacing",
  "shadowRadius", "textShadowRadius",
]);

/** 그 안의 width·height 를 곱하는 묶음. */
const 짝_키 = new Set(["shadowOffset", "textShadowOffset"]);

/** transform 가운데 길이인 것. 회전과 배율은 그대로다. */
const 옮김_키 = new Set(["translateX", "translateY"]);

type 값 = unknown;

function 한_스타일(style: Record<string, 값>, k: number): Record<string, 값> {
  const 새것: Record<string, 값> = {};
  for (const [키, 원래] of Object.entries(style)) {
    if (typeof 원래 === "number" && 길이_키.has(키)) {
      새것[키] = 원래 * k;
    } else if (짝_키.has(키) && 원래 && typeof 원래 === "object") {
      const 짝 = 원래 as { width?: number; height?: number };
      새것[키] = { width: (짝.width ?? 0) * k, height: (짝.height ?? 0) * k };
    } else if (키 === "transform" && Array.isArray(원래)) {
      새것[키] = 원래.map((하나: Record<string, 값>) => {
        const [이름, 수] = Object.entries(하나)[0] ?? [];
        return 이름 && 옮김_키.has(이름) && typeof 수 === "number" ? { [이름]: 수 * k } : 하나;
      });
    } else {
      새것[키] = 원래;
    }
  }
  return 새것;
}

/** 스타일 시트 전체(이름 → 스타일)에 배수를 곱한 새 시트. 원래 시트는 건드리지 않는다. */
export function scaleStyles<T extends Record<string, object>>(sheet: T, k: number): T {
  if (k === 1) return sheet;
  const 새_시트: Record<string, object> = {};
  for (const [이름, 스타일] of Object.entries(sheet)) {
    새_시트[이름] = 한_스타일(스타일 as Record<string, 값>, k);
  }
  return 새_시트 as T;
}
