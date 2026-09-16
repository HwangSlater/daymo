import { koreaLandPath } from "./koreaOutlinePath.ts";
import { tripRegions } from "./tripRegions.ts";

/**
 * 지도에서 누른 자리가 육지인지, 어느 시도인지 본다.
 *
 * koreaLandPath 는 M/L/Z 로만 이뤄진 닫힌 다각형 114개이고, 한 다각형이 곧
 * 한 시도의 조각이다. 서울·인천처럼 따로 떨어진 시는 자기 다각형을 갖고,
 * 전남이 광주를 완전히 감싸는 자리는 전남 쪽에 반대로 도는 구멍이 따로 있다.
 * 경로에는 이름이 없어서, 이름표 자리(tripRegions)가 들어 있는 다각형에
 * 그 이름을 붙인다. 그 다각형이 그 시도의 본토다.
 *
 * 섬 조각에는 이름표가 없다. 다만 경로는 시도 코드 차례(서울·부산·대구·
 * 인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주)로
 * 이어 붙어 있어서 한 시도의 조각이 모두 붙어 나온다. 그래서 이름표 없는
 * 조각은 경로에서 앞뒤로 가장 가까운 두 본토 중 테두리가 더 가까운 쪽에
 * 붙인다. 두 곳만 견주므로 바다 건너 엉뚱한 시가 끼어들지 않는다.
 *
 * 울릉도는 강원 앞바다에 있지만 경북 다음에 나오므로 경북과 경남 중에서
 * 고르게 되어 경북이 된다. 강화도는 김포(경기)에 붙어 있지만 인천과 광주
 * 사이에 있어 인천이 된다. 거제도는 부산이 아니라 경남이 된다.
 */

type Ring = {
  points: number[]; // [x0, y0, x1, y1, ...]
  /** 경로에 나온 차례. 시도가 이 차례로 이어져 있어 섬을 가를 때 쓴다. */
  index: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** 부호 있는 넓이. 바깥 테두리와 구멍은 부호가 반대다. */
  area: number;
};

type Province = {
  name: string;
  /** 본토와 섬의 테두리, 그리고 그 안의 구멍들. 홀짝 규칙으로 센다. */
  rings: Ring[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  size: number;
};

/** 한 시도의 본토 테두리. 이름표가 들어 있던 그 다각형이다. */
type Mainland = { ring: Ring; province: Province };

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

function toRing(points: number[], index: number): Ring {
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
  return { points, index, minX, minY, maxX, maxY, area: area / 2 };
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

/** 점에서 선분까지의 거리 제곱. */
function segmentGapSq(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  let t = length === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / length;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const ex = x1 + t * dx - x;
  const ey = y1 + t * dy - y;
  return ex * ex + ey * ey;
}

/** 테두리 하나에서 다른 테두리까지 가장 짧은 거리의 제곱. */
function ringGapSq(from: Ring, to: Ring): number {
  let best = Infinity;
  const fromCount = from.points.length / 2;
  const toCount = to.points.length / 2;
  for (let i = 0; i < fromCount; i += 1) {
    const x = from.points[i * 2];
    const y = from.points[i * 2 + 1];
    for (let j = 0, k = toCount - 1; j < toCount; k = j++) {
      const gap = segmentGapSq(
        x,
        y,
        to.points[k * 2],
        to.points[k * 2 + 1],
        to.points[j * 2],
        to.points[j * 2 + 1],
      );
      if (gap < best) best = gap;
    }
  }
  return best;
}

function addOuter(province: Province, ring: Ring): void {
  province.rings.push(ring);
  if (ring.minX < province.minX) province.minX = ring.minX;
  if (ring.minY < province.minY) province.minY = ring.minY;
  if (ring.maxX > province.maxX) province.maxX = ring.maxX;
  if (ring.maxY > province.maxY) province.maxY = ring.maxY;
  province.size += Math.abs(ring.area);
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
  const ownerOf = new Map<Ring, Province>();
  const mainlands: Mainland[] = [];
  for (const pin of tripRegions) {
    // 이름표를 품은 가장 작은 테두리가 그 시도다. 광주 이름표는 전남
    // 테두리 안에도 있지만 광주 테두리가 더 작다.
    const outer = smallestOuterAround(pin.x, pin.y);
    if (!outer || ownerOf.has(outer)) continue;
    const province: Province = {
      name: pin.name,
      rings: [outer],
      minX: outer.minX,
      minY: outer.minY,
      maxX: outer.maxX,
      maxY: outer.maxY,
      size: Math.abs(outer.area),
    };
    provinces.push(province);
    ownerOf.set(outer, province);
    mainlands.push({ ring: outer, province });
  }
  // tripRegions 는 사람이 읽기 좋은 차례라 경로 차례와 다르다. 앞뒤를 보려면
  // 경로 차례로 세워 둬야 한다.
  mainlands.sort((a, b) => a.ring.index - b.ring.index);

  for (const island of outers) {
    if (ownerOf.has(island)) continue;
    let before: Mainland | null = null;
    let after: Mainland | null = null;
    for (const mainland of mainlands) {
      if (mainland.ring.index < island.index) before = mainland;
      else {
        after = mainland;
        break;
      }
    }
    const pick = !after
      ? before
      : !before
        ? after
        : ringGapSq(island, before.ring) <= ringGapSq(island, after.ring)
          ? before
          : after;
    if (!pick) continue;
    addOuter(pick.province, island);
    ownerOf.set(island, pick.province);
  }

  // 구멍은 그것을 품은 가장 작은 테두리에 붙인다. 구멍 자리를 채운 시도의
  // 테두리는 구멍과 모양이 같아 꼭짓점이 겹치므로, 구멍보다 큰 테두리만 본다.
  for (const hole of holes) {
    const around = smallestOuterAround(
      hole.points[0],
      hole.points[1],
      Math.abs(hole.area) + 0.01,
    );
    const province = around ? ownerOf.get(around) : undefined;
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
 * 영역으로 고를 수 없는 자리(해안선에 아주 가까운 자리, 경로가 점 하나로
 * 줄여 놓은 아주 작은 섬)에서만 쓰는 어림이다. `limit` 보다 먼 곳만 있으면
 * 아무것도 고르지 않는다.
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
