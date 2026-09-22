import Svg, { G, Path, Text as SvgText } from "react-native-svg";

import { fonts } from "../theme/typography";
import { CUT, SHADOW, STICKER_ART, type StickerShape } from "./art";
import { fitStickerText } from "./textFit";

// 추억 카드 스티커 한 장을 그린다. 그림 자료는 art.ts, 이름과 비율은 catalog.ts.
//
// 긴 변이 size 가 되게 그린다. 테이프·글씨처럼 넓은 것은 높이가 줄어든다.
// 모르는 이름은 아무것도 그리지 않는다(더 새 앱이 붙인 스티커일 수 있다).
//
// 흰 테두리와 그림자는 같은 모양을 굵은 선으로 한 번 더 그려 만든다. 모양마다
// 테두리를 두르면 겹친 곳은 하나로 합쳐져, 전체 윤곽을 따라 오린 것처럼 보인다.

type Props = {
  name: string;
  /** 긴 변의 길이(px). */
  size: number;
  /** 옅은 그림자. 카드 쪽에서 따로 그림자를 줄 때 끈다. */
  shadow?: boolean;
  /**
   * 「글씨」 스티커의 말을 이것으로 바꿔 끼운다(글자 바탕). 모양은 그대로 두고, 길면 띠 모양은
   * 옆으로 늘리고 동그란 것은 글자를 줄인다(`textFit.ts`).
   */
  text?: string;
  /** 바꿔 끼운 말의 글꼴. 없으면 스티커 글꼴(쿠키런 Bold). */
  fontFamily?: string;
  /** 바꿔 끼운 말의 실제 폭(그림 단위). 화면이 재서 넘긴다. */
  measuredWidth?: number;
};

/** 테두리·그림자 층. 모양의 겉선만 굵게, 한 색으로 칠한다. 글자는 바탕 위에 있어 뺀다. */
function 윤곽(shapes: StickerShape[], color: string) {
  return shapes.map((모양, i) =>
    "text" in 모양 ? null : (
      <Path
        key={i}
        d={모양.d}
        fill={모양.f ? color : "none"}
        stroke={color}
        strokeWidth={(모양.w ?? 0) + CUT}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={모양.tf}
      />
    ),
  );
}

function 색모양(모양: StickerShape, i: number) {
  if ("text" in 모양) {
    return (
      <SvgText
        key={i}
        x={모양.x}
        y={모양.y}
        fontSize={모양.size}
        fontFamily={fonts.display}
        fill={모양.f}
        textAnchor="middle"
      >
        {모양.text}
      </SvgText>
    );
  }
  return (
    <Path
      key={i}
      d={모양.d}
      fill={모양.f ?? "none"}
      stroke={모양.s}
      strokeWidth={모양.s ? (모양.w ?? 1) : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={모양.da}
      opacity={모양.o}
      transform={모양.tf}
    />
  );
}

export function StickerArt({ name, size, shadow = true, text, fontFamily, measuredWidth }: Props) {
  const 그림 = Object.prototype.hasOwnProperty.call(STICKER_ART, name) ? STICKER_ART[name] : undefined;
  if (!그림) return null;
  const 맞춤 = text !== undefined ? fitStickerText(그림, text, measuredWidth) : undefined;
  const w = 맞춤?.w ?? 그림.w;
  const 비율 = w / 그림.h;
  const 너비 = 비율 >= 1 ? size : size * 비율;
  const 높이 = 비율 >= 1 ? size / 비율 : size;
  // 말을 바꿔 끼우면 모양만 옆으로 늘리고 글자는 늘리지 않는다(찌그러진 글자가 되지 않게).
  const 모양들 = 맞춤 ? 그림.shapes.filter((모양) => !("text" in 모양)) : 그림.shapes;
  const 늘림 = 맞춤 && 맞춤.stretchX !== 1 ? `scale(${맞춤.stretchX} 1)` : undefined;
  return (
    <Svg width={너비} height={높이} viewBox={`0 0 ${w} ${그림.h}`}>
      {그림.cut && shadow ? (
        <G opacity={SHADOW.opacity} transform={`translate(0 ${SHADOW.dy})${늘림 ? ` ${늘림}` : ""}`}>
          {윤곽(모양들, SHADOW.color)}
        </G>
      ) : null}
      {그림.cut ? <G transform={늘림}>{윤곽(모양들, "#FFFFFF")}</G> : null}
      <G transform={늘림}>{모양들.map(색모양)}</G>
      {맞춤 ? (
        <SvgText
          x={맞춤.x}
          y={맞춤.y}
          fontSize={맞춤.size}
          fontFamily={fontFamily ?? fonts.display}
          fill={맞춤.color}
          textAnchor="middle"
        >
          {text}
        </SvgText>
      ) : null}
    </Svg>
  );
}
