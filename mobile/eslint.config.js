// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const reactNative = require("eslint-plugin-react-native");

module.exports = defineConfig([
  expoConfig,
  {
    plugins: { "react-native": reactNative },
    rules: {
      // 쓰지 않는 스타일이 쌓이면 화면을 읽을 때마다 살아 있는 것과 구별해야 한다.
      // 2026-09-23 에 두 큰 파일에서 185 개를 걷어 내고 이 규칙을 켰다.
      "react-native/no-unused-styles": "error",
    },
  },
  {
    // 추억 카드 그림은 `sheetOf(unit)`(`scaleStyles`)으로 스타일을 배수만큼 키워
    // `s.X` 로 쓴다. 정적 분석에 안 잡힐 뿐이고 지우면 카드가 통째로 깨진다.
    files: ["src/KeepsakeCardView.tsx", "src/CardOrderStrip.tsx"],
    rules: { "react-native/no-unused-styles": "off" },
  },
  {
    ignores: ["dist/*"],
  }
]);
