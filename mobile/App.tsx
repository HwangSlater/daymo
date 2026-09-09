import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { WarmAppShell } from "./src/WarmAppShell";

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={s.webStage}>
        <StatusBar style="auto" />
        <WarmAppShell />
      </View>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  webStage: { flex: 1, backgroundColor: "#E7E5DF" },
});
