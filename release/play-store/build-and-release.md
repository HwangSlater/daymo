# Android 빌드와 출시

## 목표 API

2026-08-31부터 Google Play에 새로 올리는 앱과 업데이트는 **Android 16(API 36) 이상**을 목표로 해야 한다.
앱은 Expo SDK 57 / React Native 0.86이고 `targetSdk = 36`, `compileSdk = 36`, `minSdk = 24`다
(`mobile/node_modules/react-native/gradle/libs.versions.toml`). 따로 설정할 것이 없다. SDK를 올릴 때 다시 확인한다.

## 한 번만 하는 준비

1. Google Play Console 개인 개발자 계정(등록비 25달러, 신원 확인).
2. 앱 만들기 — [play-console.md](play-console.md) 1항.
3. 서명: 첫 `eas build -p android --profile production` 때 EAS가 업로드 키를 만들어 보관한다. Play Console은 Play 앱 서명을 쓴다.
4. EAS Submit을 쓰려면 Google Cloud 서비스 계정 JSON 키가 필요하다(Play Console → 설정 → API 액세스).
   키 파일은 저장소에 넣지 않고 EAS 자격 증명(`eas credentials`)에 올린다.

## 빌드

```sh
cd mobile
# 첫 스토어 빌드 전에 app.json 의 version 을 1.0.0 으로 올린다. versionCode 는 EAS가 원격으로 올린다.
npx eas-cli build -p android --profile production   # production 프로필은 AAB(app bundle)를 만든다
```

지금까지의 `preview` 프로필 APK(versionCode 1)는 내부 시험용이다. 스토어에는 production AAB만 올린다.

## 출시 순서 (개인 개발자 계정)

2023-11-13 이후 만든 개인 개발자 계정은 프로덕션에 바로 낼 수 없다.

1. **첫 AAB는 Play Console에서 손으로 올린다.** 테스트 및 출시 → 테스트 → 비공개 테스트 → 트랙 만들기 → 새 버전 만들기.
   그 뒤부터 `npx eas-cli submit -p android --profile production --latest` 로 올릴 수 있다.
2. **비공개 테스트: 테스터 12명 이상이 14일 동안 계속 참여.** 테스터는 Google 계정 이메일 목록 또는 Google 그룹으로 넣고,
   옵트인 링크로 설치하게 한다. 중간에 나가면 14일이 다시 세어질 수 있으니 여유 있게 모은다.
3. 14일이 지나면 대시보드에서 **프로덕션 액세스 신청**. 테스트에서 무엇을 고쳤는지 묻는 질문에 답한다.
4. 승인되면 프로덕션 트랙에 출시. 첫 심사는 며칠 걸릴 수 있다.

## 실제 기기에서 확인할 것

가입·약관 동의, 소셜 로그인(Google·카카오·네이버), 초대 링크로 앱 열기(`daymo://invite`), 사진 올리기와 다른 기기 사진 받기,
영수증, 계정 삭제와 취소, 다크 모드, 뒤로 가기 버튼.
