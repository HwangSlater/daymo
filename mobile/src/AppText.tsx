import {
  Platform,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
  type TextStyle,
} from "react-native";
import { typo } from "./theme/typography";

// 스타일에서 서체를 지정하지 않은 글자까지 모두 Pretendard로 그리기 위한 감싸개.
// 이게 없으면 굵기 토큰을 쓰지 않는 스타일만 OS 기본 폰트로 남아 서체가 섞인다.
const base: TextStyle = { fontFamily: typo.body.family };

export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[base, style]} />;
}

/**
 * 웹에서 입력칸 글자가 내려가지 않는 바닥(px).
 *
 * 아이폰 사파리는 글자가 16px 보다 작은 입력칸에 포커스하면 그 칸이 읽을 만해질
 * 때까지 화면을 통째로 확대한다. 확대된 채로 남아서 헤더와 버튼이 화면 밖으로
 * 밀려난다. viewport 메타의 `maximum-scale=1` 은 접근성 때문에 무시되므로
 * 막을 방법이 글자를 키우는 것뿐이다.
 *
 * 그래서 웹에서만 입력칸 글자를 16px 아래로 내리지 않는다. 앱의 입력칸은 12~15px
 * 라 1~4px 커지는데, 칸의 높이(44~50px)와 안쪽 여백이 그만큼을 이미 품고 있어
 * 줄이 넘치거나 칸이 커지지 않는다. 글자 크기를 그대로 두고 화면을 축소하는
 * 방법(transform: scale)도 있지만, 커서 위치와 누르는 자리가 어긋나서 쓰지 않았다.
 *
 * 읽기만 하는 글자(Text)는 확대를 부르지 않으므로 손대지 않는다. 화면 모양이
 * 바뀌는 곳은 입력칸뿐이다.
 */
const WEB_MIN_INPUT_FONT_SIZE = 16;

const isWeb = Platform.OS === "web";

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput {...props} style={isWeb ? webInputStyle(style) : [base, style]} />;
}

function webInputStyle(style: TextInputProps["style"]) {
  const flat = StyleSheet.flatten([base, style]) ?? {};
  const size = typeof flat.fontSize === "number" ? flat.fontSize : typo.body.size;
  if (size >= WEB_MIN_INPUT_FONT_SIZE) return flat;
  // 줄 높이를 정해 둔 칸은 같은 비율로 같이 올린다. 글자만 키우면 윗줄과 아랫줄이 붙는다.
  const lineHeight =
    typeof flat.lineHeight === "number"
      ? Math.round((flat.lineHeight * WEB_MIN_INPUT_FONT_SIZE) / size)
      : undefined;
  return [flat, { fontSize: WEB_MIN_INPUT_FONT_SIZE, lineHeight }];
}
