import { koreaLandPath } from "./koreaOutlinePath.ts";
import { tripRegions } from "./tripRegions.ts";

/**
 * 지도에서 누른 자리가 육지인지, 어느 시도인지 본다.
 *
 * koreaLandPath 는 M/L/Z 로만 이뤄진 닫힌 다각형 114개이고, 한 다각형이 곧
 * 한 시도의 조각이다. 서울·인천처럼 따로 떨어진 시는 자기 다각형을 갖고,
 * 전남이 광주를 완전히 감싸는 자리는 전남 쪽에 반대로 도는 구멍이 따로 있다.
 * 경로에는 이름이 없어서, 이름표 자리(tripRegions)가 들어 있는 다각형에
 * 그 이름을 붙인다. 이름표가 없는 섬 조각은 이름을 모르므로 가장 가까운
 * 중심점으로 고른다.
 */

type Ring = {
  points: number[]; // [x0, y0, x1, y1, ...]
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** 부호 있는 넓이. 바깥 테두리와 구멍은 부호가 반대다. */
  area: number;
};

type Province = {
  name: string;
  /** 바깥 테두리 하나와 그 안의 구멍들. 홀짝 규칙으로 센다. */
  rings: Ring[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  size: number;
};

type HitMap = {
  rings: Ring[];
  provinces: Province[];
};

let built: HitMap | null = null;

function parse(path: string): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  // 좌표는 "M91.6 92.2 L92.6 90.4 ... Z" 형태다. 명령 문자와 숫자만 훑는다.
  const token = /([MLZ])|(-?\d+(?:\.\d+)?)/g;
  let numbers: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = token.exec(path))) {
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

function toRing(points: number[]): Ring {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let area = 0;
  const count = points.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    area += (points[j * 2] + x) * (points[j * 2 + 1] - y);
  }
  return { points, minX, minY, maxX, maxY, area: area / 2 };
}

/** 홀짝 규칙으로 점이 다각형 하나를 몇 번 가로지르는지의 홀짝. */
function crosses(ring: Ring, x: number, y: number): boolean {
  if (x < ring.minX || x > ring.maxX || y < ring.minY || y > ring.maxY) {
    return false;
  }
  const points = ring.points;
  const count = points.length / 2;
  let inside = false;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = points[i * 2];
    const yi = points[i * 2 + 1];
    const xj = points[j * 2];
    const yj = points[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function build(): HitMap {
  const rings = parse(koreaLandPath).map(toRing);
  // 대부분의 조각이 도는 방향이 바깥 테두리다. 반대로 도는 것은 구멍이다.
  const negative = rings.filter((ring) => ring.area < 0).length;
  const outerSign = negative * 2 >= rings.length ? -1 : 1;
  const outers = rings.filter((ring) => Math.sign(ring.area) === outerSign);
  const holes = rings.filter((ring) => Math.sign(ring.area) !== outerSign);
  const smallestOuterAround = (x: number, y: number, largerThan = 0) => {
    let best: Ring | null = null;
    for (const ring of outers) {
      if (Math.abs(ring.area) <= largerThan || !crosses(ring, x, y)) continue;
      if (!best || Math.abs(ring.area) < Math.abs(best.area)) best = ring;
    }
    return best;
  };

  const provinces: Province[] = [];
  for (const pin of tripRegions) {
    // 이름표를 품은 가장 작은 테두리가 그 시도다. 광주 이름표는 전남
    // 테두리 안에도 있지만 광주 테두리가 더 작다.
    const outer = smallestOuterAround(pin.x, pin.y);
    if (!outer || provinces.some((province) => province.rings[0] === outer)) {
      continue;
    }
    provinces.push({
      name: pin.name,
      rings: [outer],
      minX: outer.minX,
      minY: outer.minY,
      maxX: outer.maxX,
      maxY: outer.maxY,
      size: Math.abs(outer.area),
    });
  }
  // 구멍은 그것을 품은 가장 작은 테두리에 붙인다. 구멍 자리를 채운 시도의
  // 테두리는 구멍과 모양이 같아 꼭짓점이 겹치므로, 구멍보다 큰 테두리만 본다.
  for (const hole of holes) {
    const owner = smallestOuterAround(
      hole.points[0],
      hole.points[1],
      Math.abs(hole.area) + 0.01,
    );
    const province = provinces.find((item) => item.rings[0] === owner);
    if (province) {
      province.rings.push(hole);
      province.size -= Math.abs(hole.area);
    }
  }
  return { rings, provinces };
}

function map(): HitMap {
  // 8만 자짜리 경로를 앱 시작마다 풀지 않도록 처음 누를 때 한 번만 푼다.
  if (!built) built = build();
  return built;
}

/** 지도 좌표(300 x 420 격자)가 육지 위인지 본다. */
export function isOnLand(x: number, y: number): boolean {
  // 여러 다각형에 대해 홀짝 규칙으로 센다. 섬이 따로 떨어져 있어도,
  // 어떤 다각형이 다른 다각형의 구멍이어도 같은 규칙으로 맞는다.
  let inside = false;
  for (const ring of map().rings) {
    if (crosses(ring, x, y)) inside = !inside;
  }
  return inside;
}

/**
 * 누른 자리를 품은 시도의 이름. 없으면 null.
 *
 * 이웃한 시도는 경계 좌표를 함께 쓰므로 겹치는 자리는 경계선 위뿐이다.
 * 그런 자리에서도 늘 같은 답이 나오도록 더 작은 시도를 고른다.
 */
export function regionContaining(x: number, y: number): string | null {
  let best: Province | null = null;
  for (const province of map().provinces) {
    if (
      x < province.minX ||
      x > province.maxX ||
      y < province.minY ||
      y > province.maxY
    ) {
      continue;
    }
    let inside = false;
    for (const ring of province.rings) {
      if (crosses(ring, x, y)) inside = !inside;
    }
    if (inside && (!best || province.size < best.size)) best = province;
  }
  return best?.name ?? null;
}

/**
 * 누른 자리에서 가장 가까운 중심점의 이름.
 *
 * 영역으로 고를 수 없는 자리(이름을 모르는 섬 조각, 해안선에 아주 가까운
 * 자리)에서만 쓰는 어림이다. `limit` 보다 먼 곳만 있으면 아무것도 고르지 않는다.
 */
export function nearestRegion(
  x: number,
  y: number,
  pins: readonly { name: string; x: number; y: number }[],
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

/** 누른 자리의 시도. 영역으로 먼저 고르고, 안 되면 가장 가까운 중심점으로 고른다. */
export function regionAt(x: number, y: number): string | null {
  return regionContaining(x, y) ?? nearestRegion(x, y, tripRegions);
}
