/**
 * 시트 맨 아래 버튼과 그 위 한 줄에 무엇을 적을지 고른다.
 *
 * `SheetShell` 에서 떼어 둔 까닭은 이 판단이 화면 없이도 틀릴 수 있어서다.
 * 잠긴 시트인데 「저장」이라고 적혀 있거나, 저장하는 중인데 안내 한 줄이
 * "추가할 것을 하나는 켜 주세요" 로 남아 있으면 사용자는 고장으로 본다.
 * react-native 를 가져오지 않으므로 `node --test` 로 바로 시험한다.
 */

export type SubmitLabelInput = {
  /** 고칠 수 없는 사람에게 연 시트. 저장 대신 닫기만 남는다. */
  locked: boolean;
  /** `onSubmit` 이 끝나기를 기다리는 중. */
  submitting: boolean;
  /** 평소 버튼 글. */
  submit: string;
  /** 기다리는 동안 대신 보일 글. 주지 않으면 글은 그대로 둔다. */
  busyLabel?: string;
};

/**
 * 버튼에 적을 글.
 *
 * 잠김이 가장 세다. 잠긴 시트에서는 저장이 아예 일어나지 않으니 기다리는 중일
 * 수도 없다.
 */
export function submitLabelOf({ locked, submitting, submit, busyLabel }: SubmitLabelInput): string {
  if (locked) return "닫기";
  if (submitting && busyLabel) return busyLabel;
  return submit;
}

export type HintInput = {
  locked: boolean;
  /** 잠긴 시트에서 왜 고칠 수 없는지. */
  lockedHint: string;
  /** 저장을 막았을 때 무엇이 모자란지. */
  disabledHint?: string;
  submitDisabled: boolean;
};

/**
 * 버튼 바로 위에 보일 한 줄. 보일 것이 없으면 `undefined`.
 *
 * 잠김 안내는 저장을 막았는지와 상관없이 늘 보인다. 왜 아무것도 못 하는지를
 * 먼저 알려 주는 쪽이 맞아서다.
 */
export function sheetHintOf({ locked, lockedHint, disabledHint, submitDisabled }: HintInput): string | undefined {
  if (locked) return lockedHint;
  if (submitDisabled && disabledHint) return disabledHint;
  return undefined;
}
