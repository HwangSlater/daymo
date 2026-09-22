import Svg, { G, Path, Text as SvgText } from "react-native-svg";

import { fonts } from "../theme/typography";
import { CUT, SHADOW, STICKER_ART, type StickerShape } from "./art";

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

export function StickerArt({ name, size, shadow = true }: Props) {
  const 그림 = Object.prototype.hasOwnProperty.call(STICKER_ART, name) ? STICKER_ART[name] : undefined;
  if (!그림) return null;
  const 비율 = 그림.w / 그림.h;
  const 너비 = 비율 >= 1 ? size : size * 비율;
  const 높이 = 비율 >= 1 ? size / 비율 : size;
  return (
    <Svg width={너비} height={높이} viewBox={`0 0 ${그림.w} ${그림.h}`}>
      {그림.cut && shadow ? (
        <G opacity={SHADOW.opacity} transform={`translate(0 ${SHADOW.dy})`}>
          {윤곽(그림.shapes, SHADOW.color)}
        </G>
      ) : null}
      {그림.cut ? <G>{윤곽(그림.shapes, "#FFFFFF")}</G> : null}
      {그림.shapes.map(색모양)}
    </Svg>
  );
}
