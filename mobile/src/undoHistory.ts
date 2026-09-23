/**
 * 되돌리기·다시 하기 기록. 추억 카드 꾸미기의 머리줄 ↶ ↷ 가 쓴다.
 *
 * 바뀌기 **전** 모습을 쌓는다. 잇달아 바뀌는 것(모서리를 끄는 동안의 크기, 글자를 한 자씩
 * 적는 것)은 한 단계로 묶는다. 묶지 않으면 ↶ 를 수십 번 눌러야 끌기 하나가 풀린다.
 * 그래서 앞 변경과 `묶는_사이`(ms) 안에 온 변경은 새로 쌓지 않는다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

export type UndoHistory<T> = {
  /** 되돌릴 모습들. 맨 뒤가 바로 앞 모습이다. */
  past: T[];
  /** 되돌린 뒤 다시 할 모습들. 맨 뒤가 바로 다음 모습이다. */
  future: T[];
  /** 마지막으로 쌓은(또는 묶은) 때. */
  lastAt: number;
};

/** 이만큼 안에 잇달아 온 변경은 한 단계다. */
export const UNDO_GROUP_MS = 600;
/** 너무 오래 쌓아 두지 않는다. 카드 한 장을 꾸미는 데 이보다 많이 되돌릴 일은 없다. */
export const UNDO_MAX = 60;

export const emptyHistory = <T>(): UndoHistory<T> => ({ past: [], future: [], lastAt: -Infinity });

/**
 * 바뀌기 직전 모습(`before`)을 적는다. 새로 무엇을 하면 다시 할 것은 사라진다.
 * `같은가` 가 참이면(아무것도 안 바뀐 변경) 적지 않는다.
 */
export function recordChange<T>(
  history: UndoHistory<T>,
  before: T,
  at: number,
  같은가: (a: T, b: T) => boolean = Object.is,
): UndoHistory<T> {
  const 앞 = history.past[history.past.length - 1];
  if (at - history.lastAt < UNDO_GROUP_MS && history.past.length > 0) {
    return { past: history.past, future: [], lastAt: at };
  }
  if (앞 !== undefined && 같은가(앞, before)) return { ...history, future: [], lastAt: at };
  return { past: [...history.past, before].slice(-UNDO_MAX), future: [], lastAt: at };
}

/** 한 단계 되돌린다. 되돌릴 것이 없으면 undefined. */
export function undoOnce<T>(history: UndoHistory<T>, current: T): { history: UndoHistory<T>; value: T } | undefined {
  if (history.past.length === 0) return undefined;
  const value = history.past[history.past.length - 1];
  return {
    value,
    // 되돌린 바로 뒤의 변경은 새 단계로 쌓아야 해서 묶는 시계를 끊는다.
    history: { past: history.past.slice(0, -1), future: [...history.future, current], lastAt: -Infinity },
  };
}

/** 되돌린 것을 한 단계 다시 한다. 다시 할 것이 없으면 undefined. */
export function redoOnce<T>(history: UndoHistory<T>, current: T): { history: UndoHistory<T>; value: T } | undefined {
  if (history.future.length === 0) return undefined;
  const value = history.future[history.future.length - 1];
  return {
    value,
    history: { past: [...history.past, current], future: history.future.slice(0, -1), lastAt: -Infinity },
  };
}
