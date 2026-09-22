import appJson from "../app.json";

/**
 * 앱 버전. `app.json` 의 `expo.version` 을 그대로 읽는다.
 *
 * 예전에는 여러 파일에 `"0.1.0"` 을 따로 적어 두었다. 스토어 빌드에서 버전을 1.0.0 으로
 * 올렸는데 로그인 기기·오류 한 줄·의견·문의 메일에는 옛 값이 찍혔다. 버전은 이 한 곳에서만 읽는다.
 */
export const APP_VERSION: string = appJson.expo.version;
