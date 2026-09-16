# iOS 빌드와 제출

## 빌드 도구: Xcode 26 / iOS 26 SDK

2026년 4월 이후 App Store Connect에 올리는 iOS 앱은 Xcode 26 이상, iOS 26 SDK 이상으로 빌드해야 한다.

- 앱은 Expo SDK 57이다(`mobile/package.json` `expo ~57.0`).
- EAS의 SDK 57 기본 이미지는 `macos-tahoe-26.5-xcode-26.6`(Xcode 26.6)이다(2026-09 Expo 문서 "Build server infrastructure").
- `mobile/eas.json` 의 `build.production.ios.image` 를 `sdk-57` 로 고정해 두었다. SDK를 올리면 이 값도 함께 올린다.
- 빌드 로그의 "Xcode version" 줄에서 26.x인지 확인한다.

## 한 번만 하는 준비

1. Apple Developer Program 가입(개인). 승인까지 하루~며칠.
2. Certificates, Identifiers & Profiles → Identifiers → App ID `com.hwangslater.daymo` 등록. Capabilities에서 **Sign in with Apple** 켜기.
3. Sign in with Apple용 Services ID·키 만들기 — `docs/development/11-owner-setup-guide.md` 7.1 Apple. 서버 `runtime.env` 에 `APPLE_*` 넣기.
4. App Store Connect에서 신규 앱 만들기 — [app-store-connect.md](app-store-connect.md) 1항.
5. 서명: 처음 `eas build -p ios` 를 돌리면 EAS가 Apple 계정으로 로그인해 배포 인증서와 프로비저닝 프로필을 만들어 보관한다.

## 빌드

```sh
cd mobile
# 첫 스토어 빌드 전에 app.json 의 version 을 1.0.0 으로 올린다. 빌드 번호는 EAS가 원격으로 올린다(appVersionSource remote).
npx eas-cli build -p ios --profile production
```

## TestFlight와 제출

```sh
npx eas-cli submit -p ios --profile production --latest
```

1. App Store Connect → TestFlight에서 처리 완료를 기다린다(10~30분).
2. 내부 테스터(운영자)로 실제 기기에서 확인: 가입·소셜 로그인(Apple 포함 4종)·초대 링크로 앱 열기·사진 올리기/받기·신고와 차단·계정 삭제와 취소. 실기기가 처음 보는 것은 초대 링크(`daymo://invite`)와 다른 기기 사진 받기다. 웹 빌드로는 확인할 수 없다.
3. 스크린샷을 찍는다 — [../shared/screenshots.md](../shared/screenshots.md).
4. 버전 페이지에서 빌드를 고르고 "심사에 추가" → 제출.

## 심사에서 자주 걸리는 곳 (Daymo에 해당하는 것만)

| 지침 | 확인 |
| --- | --- |
| 2.1 앱 완성도 | 데모 계정으로 모든 탭이 열리고, 서버가 살아 있다 |
| 4.8 로그인 서비스 | 제3자 소셜 로그인이 있으면 Sign in with Apple도 같은 화면에 있다 |
| 5.1.1(v) 계정 삭제 | 앱 안에서 계정 삭제를 시작할 수 있다 — 있음 |
| 1.2 사용자 생성 콘텐츠 | 신고, 차단, 운영자 연락 방법 — 2026-09-16 구현. 메모·일기·사진 창과 멤버 관리에서 신고, 멤버 관리에서 차단, 문의는 support@daymo.xyz |
| 5.1.1 개인정보 | 앱 안에서 처리방침을 열 수 있다 — 페이지는 있지만 **로그인 화면·내 프로필의 링크 연결이 남았다** |
