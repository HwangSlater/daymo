# Daymo 출시 자료

App Store와 Google Play에 내기 위해 콘솔에 입력하고 올리는 것을 모은 폴더다. 앱 코드에는 들어가지 않는다.
값은 실제 앱·서버 동작에서 가져왔고, 근거가 되는 코드 위치를 함께 적었다. 앱이나 서버가 바뀌면 여기도 고친다.

| 파일 | 내용 |
| --- | --- |
| [shared/listing-ko.md](shared/listing-ko.md) | 앱 이름, 부제·짧은 설명, 긴 설명, 키워드, URL — 두 스토어 공통 |
| [shared/data-inventory.md](shared/data-inventory.md) | Daymo가 실제로 수집·저장하는 데이터와 들어 있는 SDK. App Privacy와 데이터 보안 답의 원본 |
| [shared/screenshots.md](shared/screenshots.md) | 찍을 화면, 캡션, 스토어별 크기, 휴대폰 모형·그래픽 이미지 만드는 법 |
| [shared/demo-account.md](shared/demo-account.md) | 심사용 데모 계정을 서버에서 만들고 되돌리는 법, 심사자가 보는 내용 |
| [app-store/app-store-connect.md](app-store/app-store-connect.md) | App Store Connect 필드별 입력값, App Privacy, 연령 등급, 심사 정보 |
| [app-store/build-and-submit.md](app-store/build-and-submit.md) | iOS 빌드(Xcode 26), TestFlight, 제출 순서 |
| [play-store/play-console.md](play-store/play-console.md) | Play Console 필드별 입력값, 데이터 보안, 콘텐츠 등급, 앱 콘텐츠 선언 |
| [play-store/build-and-release.md](play-store/build-and-release.md) | Android 빌드(AAB), 비공개 테스트, 프로덕션 출시 순서 |
| [assets/](assets/) | Play 아이콘 512px(`scripts/build-store-assets.py`), 그래픽 이미지 1024×500(`scripts/store_feature_graphic.py`) |
| [scripts/](scripts/) | 찍은 화면 다듬기(`store_prepare.py`), 말풍선판 스크린샷(`store_chat.py`), 그래픽 이미지(`store_feature_graphic.py`) |

## 공통 주소

| 용도 | 주소 |
| --- | --- |
| 홈페이지·마케팅 URL | https://www.daymo.xyz |
| 개인정보 처리방침 | https://www.daymo.xyz/privacy |
| 이용약관 | https://www.daymo.xyz/terms |
| 지원(문의) | https://www.daymo.xyz/support |
| 계정 삭제 안내(Google Play 필수) | https://www.daymo.xyz/account-deletion |
| 문의 이메일 | support@daymo.xyz |

## 출시를 막는 것

위에서부터 끝내야 제출할 수 있다. 끝나면 줄을 긋는다.

| # | 할 일 | 누가 | 왜 |
| --- | --- | --- | --- |
| 1 | Apple Developer Program 가입 | 운영자 | iOS 빌드·TestFlight·제출 모두 필요 |
| 2 | Sign in with Apple 붙이기 | 운영자(키) + 개발 | Google·카카오·네이버 로그인을 두면 App Store 심사 지침 4.8에 따라 Apple 로그인도 있어야 한다. 서버 코드는 준비돼 있고 키만 넣으면 켜진다 |
| 3 | ~~앱 안 신고·차단~~ (2026-09-15 완료) | 개발 | 다른 사람이 쓴 사진·메모가 보이는 앱이라 App Store 지침 1.2(사용자 생성 콘텐츠)가 신고·차단을 요구한다 |
| 4 | ~~소셜 로그인 버튼을 공식 에셋으로~~ (2026-09-15 완료) | 개발 | 남은 것: Apple 로고 파일의 사용 조건 확인, 또는 iOS 에서 시스템 Apple 버튼 사용(`mobile/assets/social/README.md`) |
| 5 | 심사용 데모 계정 | 운영자(이메일·실행) | 두 스토어 모두 로그인이 필요한 앱은 심사 계정을 요구한다. 만드는 작업은 준비됐다(아래 "데모 계정"). 이메일을 정하고 제출 직전에 서버에서 돌린다 |
| 6 | Google Play 개발자 계정과 비공개 테스트 | 운영자 | 개인 개발자 계정은 테스터 12명 이상이 14일 동안 비공개 테스트를 해야 프로덕션을 신청할 수 있다 |
| 7 | ~~실제 기기 스크린샷~~ (2026-09-21 완료) | 운영자 + 개발 | 두 스토어 모두 실제 앱 화면이어야 한다. App Store 10장·Play 8장과 그래픽 이미지를 만들었다(완성본은 저장소 밖) |
| 8 | 앱 버전 1.0.0 | 개발 | 지금 `mobile/app.json` 은 0.1.0. 첫 스토어 빌드를 만들 때 올린다(빌드 번호는 EAS가 올린다) |
| 9 | 카카오 비즈 앱 심사(이메일 동의항목) | 카카오 | 2026-09-15 신청, 3~5일 |
| 10 | 앱 안에서 처리방침·약관 열기 | 개발 | 페이지는 `www.daymo.xyz/privacy`·`/terms` 로 있는데 로그인 화면 아래 문구가 아직 링크가 아니다. App Store 지침 5.1.1 과 Play 정책이 요구한다 |
| 11 | 실기기 확인 | 운영자 | 초대 링크로 앱 열기(`daymo://invite`)와 다른 기기 사진 받기는 웹 빌드로 확인할 수 없다. 첫 TestFlight·내부 테스트 빌드에서 본다 |

## 데모 계정

심사자가 로그인할 계정은 서버 작업 `python -m app.jobs.seed_demo` 가 만든다. 이름 "하늘"의 확인된 계정, 예시 멤버 여울·가람과 함께 쓰는
공간 "주말 여행 메이트", 실행한 날 기준의 여행 3개(2주 뒤·여행 중·지난 여행)에 일정·장소·예약·준비물·요리·지출·메모·일기·사진을 채운다.
다시 돌리면 처음 상태로 되돌리고, 데모 계정이 아닌 계정의 이메일이면 아무것도 바꾸지 않고 멈춘다.
비밀번호는 환경 변수로만 넘긴다. 실행 명령과 자세한 내용은 [shared/demo-account.md](shared/demo-account.md).

## 웹 버전

iPhone 앱이 나오기 전까지 같은 앱을 `www.daymo.xyz/app` 에서 쓴다. 스토어 자료와는 별개지만 두 가지가 겹친다.

- 스토어 스크린샷은 웹 화면으로 찍지 않는다. 실기기로 찍는다([shared/screenshots.md](shared/screenshots.md)).
- 웹에서 Apple 로그인 버튼은 서버에 키가 들어가야 보인다. 지금은 Google·카카오·네이버만 보인다.

## 정할 것

- ~~사진 원본의 위치 정보~~ — 지우기로 했다(2026-09-15). 서버가 저장 전에 원본에서도 GPS·기기 정보를 뺀다.
- **데모 계정 이메일.** `review@daymo.xyz` 를 권한다. Cloudflare Email Routing 에 support@ 와 같은 곳으로 받는 규칙을 더한다.
- **배포 국가.** 한국어만 있고 개인정보 처리방침도 한국 법 기준이라 **대한민국만** 권한다.
