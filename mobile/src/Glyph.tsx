import Svg, { Path } from "react-native-svg";

// 쿠키런에 없는 기호를 그린다. 라이선스가 폰트 수정을 금지해서 글리프를 보탤 수
// 없고, 글자로 두면 시스템 폰트로 떨어져 플랫폼마다 모양이 달라진다.
//
// 24x24 좌표계에 선으로 그린다. 굵기는 크기에 비례해 두께가 일정해 보이게 한다.

const paths = {
  /** 목록 행 오른쪽 화살표. 원래 › */
  chevronRight: "M9 5l7 7-7 7",
  /** 뒤로가기. 원래 ‹ */
  chevronLeft: "M15 5l-7 7 7 7",
  /** 접기. 원래 ⌄ */
  chevronDown: "M5 9l7 7 7-7",
  /** 완료 표시. 원래 ✓ */
  check: "M4 12.5l5.5 5.5L20 6.5",
  /** 빼기. 원래 − */
  minus: "M5 12h14",
  /** 더하기 */
  plus: "M12 5v14M5 12h14",
  /** 공유. 원래 ⇧ */
  share: "M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15",
  /** 방향 바꾸기. 원래 ⇄ */
  swap: "M4 9h14m0 0l-3.5-3.5M18 9l-3.5 3.5M20 15H6m0 0l3.5-3.5M6 15l3.5 3.5",
  /** 알림 켜짐. 원래 ● */
  bellOn: "M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 0 0 4 0",
  /** 알림 꺼짐. 원래 ○ */
  bellOff: "M6 9a6 6 0 0 1 9.5-4.9M18 11v-2M6 9c0 5-2 6-2 6h13M10 19a2 2 0 0 0 4 0M4 4l16 16",
  /** 더 보기. 원래 ··· 둥근 끝을 가진 길이 0 선분이라 점으로 찍힌다. */
  more: "M6 12h.01M12 12h.01M18 12h.01",
  /** 찾기. 원래 ⌕ */
  search: "M15.5 15.5 20 20M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z",
  /** 이어지는 곳으로. 원래 → */
  arrowRight: "M4 12h15m0 0l-5.5-5.5M19 12l-5.5 5.5",
} as const;

/** 선이 아니라 면으로 그리는 기호. */
const filledPaths = {
  /** 재생. 원래 ▶ */
  play: "M8.5 5.2 19 12 8.5 18.8z",
} as const;

export type GlyphName = keyof typeof paths | keyof typeof filledPaths;

export function Glyph({
  name,
  size = 16,
  color,
  weight = 2,
}: {
  name: GlyphName;
  size?: number;
  color: string;
  weight?: number;
}) {
  if (name in filledPaths) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={filledPaths[name as keyof typeof filledPaths]} fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={paths[name as keyof typeof paths]}
        fill="none"
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 불릿. 원래 • 선이 아니라 점이라 따로 둔다. */
export function Dot({ size = 4, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 4 4">
      <Path d="M2 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" fill={color} />
    </Svg>
  );
}
