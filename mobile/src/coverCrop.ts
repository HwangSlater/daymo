/**
 * 홈 카드에 깔 사진에서 「보여 줄 부분」을 셈한다.
 *
 * 홈 카드의 사진 틀은 가로로 넓다(1.62:1). 세로 사진을 그냥 담으면 가운데 띠만 남고
 * 위아래가 잘린다. 어디를 남길지는 사람이 정하는 것이라, 사진을 끌어 옮기고 벌려
 * 키운 자리를 여행에 저장한다. 같이 쓰는 사람의 홈에도 똑같이 보여야 해서 기기가
 * 아니라 서버가 들고 있다(`coverFocusX`·`coverFocusY`·`coverZoom`).
 *
 * - `x`·`y` 는 **틀 한가운데에 놓을 점**의 자리(사진에서의 비율, 왼쪽 위가 0,0).
 * - `zoom` 은 틀을 꽉 채우는 가장 작은 크기를 1 로 본 배수다. 1 이면 사진의 짧은
 *   쪽이 틀에 딱 맞고, 키울수록 더 크게 들어가 더 좁은 데를 보여 준다.
 *
 * 그리는 쪽은 이 파일이 돌려주는 자리에 사진을 그대로 얹기만 한다. 끌기·벌리기는
 * 화면이 받고, 값이 틀을 벗어나지 않게 붙드는 것은 여기서 한다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 여행에 저장하는 값. 서버의 세 칸과 같다. */
export type CoverFocus = { x: number; y: number; zoom: number };

/** 아무것도 맞추지 않았을 때. 지금까지처럼 가운데를 자른 모습이다. */
export const COVER_FOCUS_DEFAULT: CoverFocus = { x: 0.5, y: 0.5, zoom: 1 };

/** 얼마나 키울 수 있는지. 서버도 같은 범위로 막는다. */
export const COVER_ZOOM_MAX = 4;

/** 네모 하나. 사진 크기에도 틀 크기에도 쓴다. */
export type Box = { width: number; height: number };

/** 그릴 자리. 틀 왼쪽 위를 0,0 으로 본 사진의 자리와 크기다. */
export type CoverLayout = { left: number; top: number; width: number; height: number };

const 사이 = (값: number, 작은: number, 큰: number) => Math.min(큰, Math.max(작은, 값));

const 쓸_수_있는가 = (box: Box | undefined): box is Box =>
  Boolean(box) && box!.width > 0 && box!.height > 0;

/** 서버·저장소에서 온 값을 쓸 수 있는 모양으로. 없거나 이상하면 가운데로 돌린다. */
export function tidyFocus(focus: Partial<CoverFocus> | null | undefined): CoverFocus {
  const 하나 = (값: unknown, 기본: number, 작은: number, 큰: number) =>
    typeof 값 === "number" && Number.isFinite(값) ? 사이(값, 작은, 큰) : 기본;
  return {
    x: 하나(focus?.x, 0.5, 0, 1),
    y: 하나(focus?.y, 0.5, 0, 1),
    zoom: 하나(focus?.zoom, 1, 1, COVER_ZOOM_MAX),
  };
}

/** 저장된 값과 같은지. 같으면 서버로 보내지 않는다. */
export const sameFocus = (a: CoverFocus, b: CoverFocus) =>
  Math.abs(a.x - b.x) < 0.0005 && Math.abs(a.y - b.y) < 0.0005 && Math.abs(a.zoom - b.zoom) < 0.0005;

/** 서버로 보낼 모양. 넷째 자리까지만 보낸다(서버도 거기서 자른다). */
export const focusBody = (focus: CoverFocus) => ({
  coverFocusX: Math.round(focus.x * 10000) / 10000,
  coverFocusY: Math.round(focus.y * 10000) / 10000,
  coverZoom: Math.round(focus.zoom * 10000) / 10000,
});

/**
 * 틀 안에 사진을 놓을 자리.
 *
 * 사진이 틀보다 작아지는 일은 없다. 어느 쪽으로 끌어도 틀에 빈 자리가 생기지 않게
 * 붙든다. 그래서 세로 사진은 위아래로만, 가로 사진은 좌우로만 움직인다.
 */
export function coverLayout(photo: Box | undefined, frame: Box, focus: CoverFocus): CoverLayout {
  if (!쓸_수_있는가(photo) || !쓸_수_있는가(frame)) {
    return { left: 0, top: 0, width: frame.width || 0, height: frame.height || 0 };
  }
  const 채우는_배수 = Math.max(frame.width / photo.width, frame.height / photo.height);
  const 배 = 채우는_배수 * 사이(focus.zoom, 1, COVER_ZOOM_MAX);
  const width = photo.width * 배;
  const height = photo.height * 배;
  return {
    width,
    height,
    left: 사이(frame.width / 2 - focus.x * width, frame.width - width, 0),
    top: 사이(frame.height / 2 - focus.y * height, frame.height - height, 0),
  };
}

/** 지금 그려진 자리에서 실제로 쓰이고 있는 값. 틀에 붙들린 뒤의 자리다. */
export function focusOfLayout(layout: CoverLayout, frame: Box, zoom: number): CoverFocus {
  if (!(layout.width > 0) || !(layout.height > 0)) return { ...COVER_FOCUS_DEFAULT, zoom };
  return {
    x: 사이((frame.width / 2 - layout.left) / layout.width, 0, 1),
    y: 사이((frame.height / 2 - layout.top) / layout.height, 0, 1),
    zoom: 사이(zoom, 1, COVER_ZOOM_MAX),
  };
}

/**
 * 손가락으로 사진을 끈 만큼 옮긴 값.
 *
 * @param dx 끈 거리(화면 점). 오른쪽으로 끌면 양수다. 사진이 따라 움직인다.
 */
export function dragFocus(
  focus: CoverFocus,
  photo: Box | undefined,
  frame: Box,
  dx: number,
  dy: number,
): CoverFocus {
  const 지금 = coverLayout(photo, frame, focus);
  if (!쓸_수_있는가(photo) || !쓸_수_있는가(frame)) return focus;
  const 옮긴_것: CoverLayout = {
    ...지금,
    left: 사이(지금.left + dx, frame.width - 지금.width, 0),
    top: 사이(지금.top + dy, frame.height - 지금.height, 0),
  };
  return focusOfLayout(옮긴_것, frame, focus.zoom);
}

/**
 * 두 손가락으로 벌린 만큼 키운 값.
 *
 * 키우는 동안 보고 있던 곳이 그대로 가운데 남아야 한다. 그래서 자리는 건드리지 않고
 * 배수만 바꾼 뒤, 틀을 벗어나면 다시 붙든다.
 */
export function zoomFocus(focus: CoverFocus, photo: Box | undefined, frame: Box, 배: number): CoverFocus {
  const zoom = 사이(focus.zoom * 배, 1, COVER_ZOOM_MAX);
  return focusOfLayout(coverLayout(photo, frame, { ...focus, zoom }), frame, zoom);
}
