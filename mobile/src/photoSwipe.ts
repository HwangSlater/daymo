/**
 * 사진을 크게 볼 때 손가락(마우스)이 무엇을 말하는지 읽는 계산.
 *
 * 좌우로 밀면 앞뒤 사진으로 넘어가고, 아래로 끌면 닫힌다. 한 화면에서 두 방향을
 * 받으므로 둘이 부딪히지 않는 것이 이 파일의 전부다. 방법은 하나다. **처음 크게
 * 움직인 쪽으로 축을 잠근다.** 사진첩을 넘길 때 손가락은 늘 비스듬히 지나가는데,
 * 매 순간 다시 판단하면 넘기던 도중에 창이 닫히거나 닫으려다 사진이 넘어간다.
 * 한 번 가로로 잡았으면 그 손가락이 떨어질 때까지 가로다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 잠긴 축. 아직 어느 쪽인지 모를 만큼만 움직였으면 `null` 이다. */
export type SwipeAxis = "가로" | "세로" | null;

/** 축을 정하는 데 필요한 최소 거리(px). 누르기만 한 손가락은 여기 못 미친다. */
export const SWIPE_WAKE = 12;

/**
 * 어느 쪽으로 더 많이 움직였는지.
 *
 * 1.2배를 요구한다. 딱 대각선으로 간 손가락에 아무 축이나 붙이면, 같은 동작이
 * 어떤 날은 넘기고 어떤 날은 닫는다. 애매하면 아직 정하지 않고 더 기다린다.
 */
export function swipeAxis(dx: number, dy: number): SwipeAxis {
  const 가로 = Math.abs(dx);
  const 세로 = Math.abs(dy);
  if (Math.max(가로, 세로) < SWIPE_WAKE) return null;
  if (가로 >= 세로 * 1.2) return "가로";
  if (세로 >= 가로 * 1.2) return "세로";
  return null;
}

/** 넘길 만큼 밀었다고 보는 거리. 좁은 화면에서는 화면 폭의 1/4 로 줄인다. */
export const swipeStepDistance = (width: number) => Math.min(96, Math.max(48, width / 4));

/** 짧게 튕겼을 때. ms 당 픽셀이라 0.35 면 손목만 까딱한 정도다. */
export const SWIPE_FLICK_SPEED = 0.35;
/** 튕기기로 넘길 때도 이만큼은 밀었어야 한다. 손 떨림은 넘기지 않는다. */
export const SWIPE_FLICK_MIN = 24;

/**
 * 손을 뗐을 때 몇 장을 옮길지. `-1` 은 앞 사진, `1` 은 뒤 사진, `0` 은 제자리다.
 *
 * 왼쪽으로 밀면(dx < 0) 사진이 왼쪽으로 빠지고 다음 사진이 온다. 종이를 넘기는
 * 방향과 같다.
 */
export function swipeStep(dx: number, vx: number, width: number): -1 | 0 | 1 {
  const 멀리 = Math.abs(dx) >= swipeStepDistance(width);
  const 튕김 = Math.abs(vx) >= SWIPE_FLICK_SPEED && Math.abs(dx) >= SWIPE_FLICK_MIN;
  if (!멀리 && !튕김) return 0;
  // 멀리 끌어 놓고 손을 떼며 살짝 되돌리는 일이 잦다. 끈 거리를 먼저 믿는다.
  const 방향 = 멀리 ? dx : vx;
  return 방향 < 0 ? 1 : -1;
}

/** 아래로 끌어 닫을 만큼 왔는지. 위로 끄는 것은 닫지 않는다. */
export const swipeCloses = (dy: number, vy: number) =>
  dy >= 110 || (vy >= 0.75 && dy >= 40);
