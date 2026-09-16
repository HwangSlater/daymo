/**
 * 묻고 답을 받는 창. `Alert.alert` 을 쓰던 자리에 그대로 쓴다.
 *
 * 웹에서는 react-native 의 `Alert` 이 아무 일도 하지 않는 빈 함수다(react-native-web 의
 * exports/Alert). 그대로 두면 브라우저에서 「삭제」를 눌러도 확인창이 없고 아무 일도
 * 일어나지 않는다. 그래서 웹에서는 브라우저 창으로 같은 것을 묻는다.
 *
 * 버튼은 앱과 같은 모양으로 받는다. 취소가 아닌 버튼 하나를 「확인」으로 본다.
 * 버튼이 없으면 알리기만 한다.
 */

import { Alert, Platform } from "react-native";

import { cancelButton, confirmButton, webAlertText, type AlertButton } from "./alertText";

export type { AlertButton };

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }
  const 확인 = confirmButton(buttons);
  const 글 = webAlertText(title, message, buttons);
  if (!확인) {
    window.alert(글);
    buttons?.[0]?.onPress?.();
    return;
  }
  if (window.confirm(글)) 확인.onPress?.();
  else cancelButton(buttons)?.onPress?.();
}
