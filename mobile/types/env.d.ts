// Expo는 EXPO_PUBLIC_ 로 시작하는 환경변수를 번들에 넣어준다.
// 그 값을 읽으려면 process 선언이 필요한데, @types/node를 통째로 들이면
// React Native와 맞지 않는 전역 타입까지 따라온다. 쓰는 것만 선언한다.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_DAYMO_AUTH_URL?: string;
  }
}
declare const process: { env: NodeJS.ProcessEnv };
