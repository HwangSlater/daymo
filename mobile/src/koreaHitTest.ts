import { koreaLandPath } from "./koreaOutlinePath";

/**
 * 지도에서 누른 자리가 육지인지 본다.
 *
 * koreaLandPath 는 M/L/Z 로만 이뤄진 닫힌 다각형 114개다. 시도별 다각형은
 * 없기 때문에 "이 점이 강원도 안인가"는 물을 수 없고, 바다인지 아닌지까지만
 * 알 수 있다. 지역은 부르는 쪽에서 가장 가까운 중심점으로 고른다.
 */

type Ring = number[]; // [x0, y0, x1, y1, ...]

let rings: Ring[] | null = null;

function parse(): Ring[] {
  const out: Ring[] = [];
  let current: Ring = [];
  // 좌표는 "M91.6 92.2 L92.6 90.4 ... Z" 형태다. 명령 문자와 숫자만 훑는다.
  const token = /([MLZ])|(-?\d+(?:\.\d+)?)/g;
  let numbers: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = token.exec(koreaLandPath))) {
    if (match[2] !== undefined) {
      numbers.push(Number(match[2]));
      if (numbers.length === 2) {
        current.push(numbers[0], numbers[1]);
        numbers = [];
      }
      continue;
    }
    if (match[1] === "M" && current.length) {
      out.push(current);
      current = [];
    }
    if (match[1] === "Z" && current.length) {
      out.push(current);
      current = [];
    }
    numbers = [];
  }
  if (current.length) out.push(current);
  return out.filter((ring) => ring.length >= 6);
}

/** 지도 좌표(300 x 420 격자)가 육지 위인지 본다. */
export function isOnLand(x: number, y: number): boolean {
  if (!rings) rings = parse();
  // 여러 다각형에 대해 홀짝 규칙으로 센다. 섬이 따로 떨어져 있어도,
  // 어떤 다각형이 다른 다각형의 구멍이어도 같은 규칙으로 맞는다.
  let inside = false;
  for (const ring of rings) {
    const points = ring.length / 2;
    for (let i = 0, j = points - 1; i < points; j = i++) {
      const xi = ring[i * 2];
      const yi = ring[i * 2 + 1];
      const xj = ring[j * 2];
      const yj = ring[j * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * 누른 자리에서 가장 가까운 중심점의 이름.
 *
 * 시도별 영역 데이터가 없어서 쓰는 어림이다. 시도가 대체로 둥글게 생겨서
 * 대부분 맞지만, 경기도처럼 다른 시를 감싸는 모양에서는 어긋날 수 있다.
 * `limit` 보다 먼 곳만 있으면 아무것도 고르지 않는다.
 */
export function nearestRegion(
  x: number,
  y: number,
  pins: ReadonlyArray<{ name: string; x: number; y: number }>,
  limit = 90,
): string | null {
  let best: string | null = null;
  let bestDistance = limit * limit;
  for (const pin of pins) {
    const dx = pin.x - x;
    const dy = pin.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pin.name;
    }
  }
  return best;
}
