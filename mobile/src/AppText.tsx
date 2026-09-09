import {
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
} from "react-native";
import { typo } from "./theme/typography";

// 스타일에서 서체를 지정하지 않은 글자까지 모두 Pretendard로 그리기 위한 감싸개.
// 이게 없으면 굵기 토큰을 쓰지 않는 스타일만 OS 기본 폰트로 남아 서체가 섞인다.
const base = { fontFamily: typo.body.family };

export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[base, style]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput {...props} style={[base, style]} />;
}
