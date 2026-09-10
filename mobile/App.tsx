import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
  Platform,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import {
  initialWindowMetrics,
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { WarmAppShell } from "./src/WarmAppShell";
import { fontAssets } from "./src/theme/typography";

const isWeb = Platform.OS === "web";

// 서체를 다 불러올 때까지 실행 화면을 띄워 둔다. 그러지 않으면 OS 기본 폰트로
// 한 번 그렸다가 바뀌면서 글자가 튄다. 웹에는 실행 화면이 없어 조용히 넘어간다.
SplashScreen.preventAutoHideAsync().catch(() => {});

// 손가락으로 쓰는 화면인지 본다. 휴대폰 브라우저에서 열면 프레임을 씌우면 안 된다.
// 안 그러면 이미 작은 화면 안에 또 작은 화면이 생긴다.
const isTouchScreen =
  isWeb &&
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

// 웹 미리보기는 실제 기기처럼 보이도록 휴대폰 프레임 안에 넣는다.
// 웹의 SafeAreaProvider는 DOM을 측정해 initialMetrics를 덮어쓰므로,
// 기기와 같은 여백을 얻으려면 컨텍스트에 직접 값을 넣어야 한다.
const PHONE = { width: 390, height: 844 };
const phoneFrame = { x: 0, y: 0, ...PHONE };
const phoneInsets = { top: 44, left: 0, right: 0, bottom: 34 };
// 프레임과 그 둘레 여백까지 들어가고도 남는 너비. 이보다 좁으면 프레임이
// 화면만 잡아먹으므로 그냥 꽉 채워 그린다.
const FRAME_MIN_WIDTH = 700;

export default function App() {
  const [fontsReady] = useFonts(fontAssets);
  const { width } = useWindowDimensions();
  const dark = useColorScheme() === "dark";
  const showPhoneFrame = isWeb && !isTouchScreen && width >= FRAME_MIN_WIDTH;

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  // 기기에서는 위의 실행 화면이 아직 덮고 있다. 이 빈 화면은 실행 화면이 없는
  // 웹을 위한 것이고, 색은 무대가 아니라 앱 배경이어야 화면이 두 번 바뀌지 않는다.
  if (!fontsReady) {
    return <View style={[s.blank, { backgroundColor: dark ? "#0D111A" : "#F7F5F0" }]} />;
  }

  if (!showPhoneFrame) {
    // 실제 기기와 휴대폰 브라우저. 안전 영역은 OS나 env(safe-area-inset-*)에서 온다.
    return (
      <SafeAreaProvider initialMetrics={isWeb ? undefined : initialWindowMetrics}>
        <StatusBar style="auto" />
        <WarmAppShell />
      </SafeAreaProvider>
    );
  }
  return (
    <View style={s.stage}>
      <View style={s.phone}>
        <SafeAreaFrameContext.Provider value={phoneFrame}>
          <SafeAreaInsetsContext.Provider value={phoneInsets}>
            <StatusBar style="auto" />
            <WarmAppShell />
          </SafeAreaInsetsContext.Provider>
        </SafeAreaFrameContext.Provider>
        <View pointerEvents="none" style={s.island} />
        <View pointerEvents="none" style={s.homeBar} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  blank: { flex: 1 },
  stage: {
    flex: 1,
    backgroundColor: "#D8D5CE",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  phone: {
    width: PHONE.width,
    height: PHONE.height,
    maxHeight: "100%",
    maxWidth: "100%",
    borderRadius: 52,
    borderWidth: 11,
    borderColor: "#14161A",
    overflow: "hidden",
    backgroundColor: "#000",
    shadowColor: "#2A2620",
    shadowOpacity: 0.32,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 18 },
  },
  island: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    width: 112,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#14161A",
  },
  homeBar: {
    position: "absolute",
    bottom: 9,
    alignSelf: "center",
    width: 134,
    height: 5,
    borderRadius: 2,
    backgroundColor: "rgba(20,22,26,.32)",
  },
});
