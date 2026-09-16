/**
 * 확인창에 보여 줄 글. `showAlert.ts` 가 쓴다.
 *
 * 브라우저 창은 「확인」과 「취소」 두 글자만 보여 주므로, 어느 쪽이 무엇인지 문장으로
 * 덧붙인다. expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

export type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

export const confirmButton = (buttons?: readonly AlertButton[]) =>
  buttons?.find((button) => button.style !== "cancel");

export const cancelButton = (buttons?: readonly AlertButton[]) =>
  buttons?.find((button) => button.style === "cancel");

export function webAlertText(title: string, message?: string, buttons?: readonly AlertButton[]): string {
  const 본문 = [title, message].filter(Boolean).join("\n\n");
  const 확인 = confirmButton(buttons);
  if (!확인) return 본문;
  return `${본문}\n\n확인: ${확인.text} · 취소: ${cancelButton(buttons)?.text ?? "취소"}`;
}
