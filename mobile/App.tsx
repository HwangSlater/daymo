import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, View } from "react-native";
import {
  initialWindowMetrics,
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { WarmAppShell } from "./src/WarmAppShell";
import { fontAssets } from "./src/theme/typography";

const isWeb = Platform.OS === "web";

// 웹 미리보기는 실제 기기처럼 보이도록 휴대폰 프레임 안에 넣는다.
// 웹의 SafeAreaProvider는 DOM을 측정해 initialMetrics를 덮어쓰므로,
// 기기와 같은 여백을 얻으려면 컨텍스트에 직접 값을 넣어야 한다.
const PHONE = { width: 390, height: 844 };
const phoneFrame = { x: 0, y: 0, ...PHONE };
const phoneInsets = { top: 44, left: 0, right: 0, bottom: 34 };

export default function App() {
  const [fontsReady] = useFonts(fontAssets);

  // 서체가 준비되기 전에 그리면 OS 기본 폰트로 한 번 그렸다가 바뀌어 글자가 튄다.
  if (!fontsReady) return <View style={s.blank} />;

  if (!isWeb) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
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
  blank: { flex: 1, backgroundColor: "#D8D5CE" },
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
