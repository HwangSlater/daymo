import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { SocialProvider } from "./socialLogin";
import { 모서리 } from "./theme/controls";

// 로그인 화면의 소셜 로그인 버튼. 각 사 가이드가 정한 색·심볼·문구를 그대로 쓴다.
//
// 심볼은 모두 각 사가 배포한 원본에서 가져왔다. 손으로 다시 그리거나 색을 바꾼 것은 없다.
// 어디서 어떻게 받았는지는 mobile/assets/social/README.md 에 적었다.
//   카카오  디자인 리소스의 kakao_login_original.psd 에 든 말풍선 벡터 마스크 좌표
//   네이버  NAVER_login_KR.ai(PDF 호환) 에 든 N 로고 좌표
//   Google  브랜드 가이드라인 페이지의 g-logo.png (그라데이션 G). 내려받기 묶음의 SVG 는
//           foreignObject 로 그린 원뿔 그라데이션이라 react-native-svg 가 못 그려서 PNG 를 쓴다.
//   Apple   Apple Design Resources 의 Logo-Sign-in-with-Apple 중
//           "Left-aligned - Medium" SVG 의 경로와 여백(31x44)을 그대로 쓴다.
//
// 글자는 쿠키런이 아니라 OS 기본 서체다. 카카오는 "OS 기본 서체", 애플은 시스템 서체를
// 권하고, 구글이 정한 Google Sans 에는 한글이 없다. 그래서 AppText 를 거치지 않는다.
//
// 배치는 네 곳 모두 "심볼 + 문구"를 한 덩어리로 버튼 가운데에 둔다. 카카오(중앙 정렬)·
// 네이버(가운데 정렬, 로고와 레이블 간격 8px)·구글(logo_alignment=center, 로고 뒤 10px)·
// 애플(로고 파일 오른쪽 여백이 곧 문구와의 간격)의 기본 모양이다. 심볼을 왼쪽 끝에
// 고정하는 방식은 좁은 폰에서 "Google 계정으로 로그인"이 잘려서 쓰지 않았다.

/** 버튼 높이. 네이버 표준 버튼(H48)과 안드로이드 최소 터치 영역에 맞춘다. */
export const SOCIAL_BUTTON_HEIGHT = 48;

type Look = {
  label: string;
  background: string;
  /** 1px 안쪽 테두리. 구글만 쓴다. */
  border?: string;
  text: string;
  fontSize: number;
  fontWeight: "400" | "500" | "600";
  /** 심볼과 문구 사이. */
  gap: number;
};

function lookOf(provider: SocialProvider, dark: boolean): Look {
  switch (provider) {
    case "kakao":
      // 컨테이너 #FEE500, 심볼 #000000, 레이블 #000000 85%. 표준 이미지는 45px 버튼에
      // 15pt 레이블이다(레이블 세로 길이는 컨테이너의 1/3 이하).
      return { label: "카카오 로그인", background: "#FEE500", text: "rgba(0, 0, 0, 0.85)", fontSize: 16, fontWeight: "400", gap: 8 };
    case "naver":
      // 네이버 로그인 버튼 사용 가이드의 권장 녹색 배경 #03A94D, 로고·레이블 #FFFFFF.
      // 예전 가이드의 #03C75A 는 지금 배포하는 버튼 에셋과 다르다. 레이블은 로고 높이보다 작게.
      return { label: "네이버 로그인", background: "#03A94D", text: "#FFFFFF", fontSize: 16, fontWeight: "600", gap: 8 };
    case "google":
      // Sign in with Google 브랜드 가이드라인. 밝은 배경은 Light, 어두운 배경은 Dark 테마.
      // 글자는 14/20 이 기준인데, 다른 버튼보다 작게 보이면 안 된다는 규칙(동등한 비중)을
      // 따라 나머지와 같은 16 으로 둔다. G 로고 크기는 바꾸지 않는다.
      return dark
        ? { label: "Google 계정으로 로그인", background: "#131314", border: "#8E918F", text: "#E3E3E3", fontSize: 16, fontWeight: "500", gap: 10 }
        : { label: "Google 계정으로 로그인", background: "#FFFFFF", border: "#747775", text: "#1F1F1F", fontSize: 16, fontWeight: "500", gap: 10 };
    case "apple":
      // HIG: 밝은 배경에는 검정, 어두운 배경에는 흰색. 로고와 문구는 버튼과 반대색 한 가지.
      // 문구 크기는 시스템 버튼과 같은 비율(버튼 높이의 43%)이어야 한다.
      // 로고 파일이 문구와의 간격까지 품고 있어 따로 띄우지 않는다.
      return dark
        ? { label: "Apple로 로그인", background: "#FFFFFF", text: "#000000", fontSize: SOCIAL_BUTTON_HEIGHT * 0.43, fontWeight: "500", gap: 0 }
        : { label: "Apple로 로그인", background: "#000000", text: "#FFFFFF", fontSize: SOCIAL_BUTTON_HEIGHT * 0.43, fontWeight: "500", gap: 0 };
  }
}

/**
 * 카카오 말풍선 심볼. kakao_login_original.psd 의 "Large and Narrow (600px X 90px)" 그룹
 * "Shape 2" 레이어 벡터 마스크에서 원점만 옮겼다. 표준 이미지에서 45px 버튼에 18px 폭이다.
 */
const KAKAO_SYMBOL =
  "M17.9999 0C8.0585 0 0 6.2556 0 13.9729C0 18.7706 3.1168 23.0033 7.8629 25.5189C7.8629 25.5189 5.8659 32.8488 5.8659 32.8488C5.6894 33.4983 6.4268 34.0137 6.993 33.6383C6.993 33.6383 15.7467 27.8326 15.7467 27.8326C16.4854 27.9042 17.2361 27.9459 17.9999 27.9459C27.941 27.9459 36 21.6893 36 13.9729C36 6.2556 27.941 0 17.9999 0Z";
/** 네이버 N 로고. NAVER_login_KR.ai 1쪽의 20x20 로고 꼭짓점 그대로. */
const NAVER_SYMBOL = "M13.561 10.706L6.146 0H0V20H6.439V9.298L13.854 20H20V0H13.561Z";
/** Apple 로고. "Logo - SIWA - Left-aligned - White/Black - Medium.svg"(31x44) 의 path 그대로. */
const APPLE_LOGO =
  "M15.7099491,14.8846154 C16.5675461,14.8846154 17.642562,14.3048315 18.28274,13.5317864 C18.8625238,12.8312142 19.2852829,11.852829 19.2852829,10.8744437 C19.2852829,10.7415766 19.2732041,10.6087095 19.2490464,10.5 C18.2948188,10.5362365 17.1473299,11.140178 16.4588366,11.9494596 C15.9152893,12.56548 15.4200572,13.5317864 15.4200572,14.5222505 C15.4200572,14.6671964 15.4442149,14.8121424 15.4562937,14.8604577 C15.5166879,14.8725366 15.6133185,14.8846154 15.7099491,14.8846154 Z M12.6902416,29.5 C13.8618881,29.5 14.3812778,28.714876 15.8428163,28.714876 C17.3285124,28.714876 17.6546408,29.4758423 18.9591545,29.4758423 C20.2395105,29.4758423 21.0971074,28.292117 21.9063891,27.1325493 C22.8123013,25.8038779 23.1867451,24.4993643 23.2109027,24.4389701 C23.1263509,24.4148125 20.6743484,23.4122695 20.6743484,20.5979021 C20.6743484,18.1579784 22.6069612,17.0588048 22.7156707,16.974253 C21.4353147,15.1382708 19.490623,15.0899555 18.9591545,15.0899555 C17.5217737,15.0899555 16.3501271,15.9596313 15.6133185,15.9596313 C14.8161157,15.9596313 13.7652575,15.1382708 12.521138,15.1382708 C10.1536872,15.1382708 7.75,17.0950413 7.75,20.7911634 C7.75,23.0861411 8.64383344,25.513986 9.74300699,27.0842339 C10.6851558,28.4129053 11.5065162,29.5 12.6902416,29.5 Z";

const googleLogo = require("../assets/social/g-logo.png");

function ProviderSymbol({ provider, color }: { provider: SocialProvider; color: string }) {
  const h = SOCIAL_BUTTON_HEIGHT;
  switch (provider) {
    case "kakao": {
      // 표준 이미지 비율(45px 버튼에 18px 폭)대로 키운다. 모양·비율·색은 바꾸지 않는다.
      const width = (18 * h) / 45;
      return (
        <Svg width={width} height={(width * 33.7652) / 36} viewBox="0 0 36 33.7652">
          <Path d={KAKAO_SYMBOL} fill="#000000" />
        </Svg>
      );
    }
    case "naver":
      // 완성형 버튼의 N 로고는 16px 이상. H48 표준 버튼에 쓰인 크기다.
      return (
        <Svg width={16} height={16} viewBox="0 0 20 20">
          <Path d={NAVER_SYMBOL} fill="#FFFFFF" />
        </Svg>
      );
    case "google":
      // 크기를 바꿀 수 없는 G. 기준 버튼의 20px 그대로 쓴다. 원본 PNG 는 200x204.
      return <Image source={googleLogo} style={{ width: (20 * 200) / 204, height: 20 }} resizeMode="contain" />;
    case "apple":
      // 로고 파일은 여백을 품고 있다. 높이를 버튼 높이에 맞추고, 자르거나 여백을 더하지 않는다.
      return (
        <Svg width={(31 * h) / 44} height={h} viewBox="0 0 31 44">
          <Path d={APPLE_LOGO} fill={color} />
        </Svg>
      );
  }
}

export function SocialLoginButton({
  provider,
  dark,
  loading,
  disabled,
  onPress,
}: {
  provider: SocialProvider;
  /** 화면이 어두운 테마인지. 구글과 애플은 테마에 따라 버튼 모양이 다르다. */
  dark: boolean;
  /** 이 제공자로 로그인 창을 여는 중. 문구만 "연결 중"으로 바꾸고 심볼은 그대로 둔다. */
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const look = lookOf(provider, dark);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={look.label}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: look.background, borderWidth: look.border ? 1 : 0, borderColor: look.border },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={{ marginRight: look.gap }}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <ProviderSymbol provider={provider} color={look.text} />
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={[styles.label, { color: look.text, fontSize: look.fontSize, fontWeight: look.fontWeight }]}
      >
        {loading ? "로그인 중…" : look.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: SOCIAL_BUTTON_HEIGHT,
    // 애플 최소 폭 140pt. 로그인 카드 안에서는 한 줄에 하나씩 꽉 채운다.
    minWidth: 140,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // 좁아지면 이 여백은 남기고 문구를 말줄임한다. 애플은 문구와 오른쪽 끝 사이를
    // 버튼 폭의 8% 이상 띄워야 하는데, "Apple로 로그인"은 짧아서 가운데 정렬만으로
    // 폭 140pt 에서도 그보다 넉넉히 남는다.
    paddingHorizontal: 16,
    // 카카오 가이드의 컨테이너 radius 12px. 네 버튼을 같은 모서리로 맞춘다.
    borderRadius: 모서리.행,
    overflow: "hidden",
  },
  pressed: { opacity: 0.85 },
  label: { flexShrink: 1, includeFontPadding: false },
});
