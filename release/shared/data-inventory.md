# Daymo가 처리하는 데이터

App Store의 App Privacy와 Google Play의 데이터 보안(Data safety) 답은 이 표에서만 옮긴다.
두 스토어 모두 **앱이 서버로 보내는 것**과 **앱에 들어 있는 SDK가 가져가는 것**을 함께 신고하라고 한다.
2026-09-15 코드 기준이다. 수집 항목을 바꾸면 이 표, 두 스토어 답, 개인정보 처리방침(`site/src/privacy.html`)을 함께 고친다.

## 1. 앱이 Daymo 서버로 보내 저장하는 것

| 데이터 | 언제 | 목적 | 계정과 연결 | 근거 |
| --- | --- | --- | --- | --- |
| 이메일 주소 | 가입·로그인, 소셜 로그인 제공자가 준 이메일 | 계정, 로그인, 안내 메일 | 예 | `backend/app/models/user.py` `email`, `models/auth.py` `OAuthAccount.provider_email` |
| 이름(표시 이름) | 가입, 프로필 수정, 소셜 제공자가 준 이름·닉네임 | 같은 공간 멤버에게 보여 줌 | 예 | `User.display_name`, `Membership.nickname` |
| 비밀번호 | 이메일 가입 | 로그인 | 예 | Argon2id 해시만 저장 `User.password_hash` |
| 사용자 ID | 계정 생성 시 서버가 만듦, 소셜 제공자의 회원 식별값 | 계정 식별 | 예 | `User.id`, `OAuthAccount.provider_subject` |
| 기기 ID | 로그인 | 로그인 기기 관리, 세션 폐기 | 예 | 앱이 만든 설치 UUID `Device.installation_id`, 플랫폼, 앱 버전, 기기 이름 |
| 사진 | 기록 탭 사진, 지출 영수증 | 여행 기록을 멤버와 공유 | 예 | `backend/app/services/photo_files.py`. 원본(메타데이터 제거) + 표시본·썸네일 |
| 사진 촬영 시각 | 사진 원본 EXIF | 사진을 날짜에 놓기 | 예 | `Photo.taken_at` |
| 그 밖의 사용자 콘텐츠 | 앱에 입력 | 여행을 멤버와 함께 관리 | 예 | 공간·여행·일정·장소·숙소·교통·예약·준비물·요리·지출·정산 기록·메모·일기 |
| 약관 동의 기록 | 가입 | 법적 증빙 | 예 | `User.terms_version`, `terms_agreed_at` |

| 앱 오류 한 줄 | 앱이 멈추거나 처리되지 않은 오류가 났을 때 | 오류를 찾아 고침 | **아니요** | `POST /v1/client-errors`. 오류 종류·한 줄 설명·어느 화면인지·플랫폼·앱 버전뿐이다. 계정·토큰을 함께 보내지 않아 누가 보냈는지 서버도 모른다. 보내기 전에 앱이 이메일·토큰·초대 링크·사진 파일 이름을 지운다(`mobile/src/errorReport.ts`), 서버가 한 번 더 지운다(`backend/app/core/observability.py`). `EXPO_PUBLIC_DAYMO_ERROR_REPORT=off` 로 끌 수 있다 |

**보내지 않는 것:** 연락처, 위치(GPS 권한을 요청하지 않고, 사진 속 GPS는 서버가 저장 전에 원본에서도 지운다 — `backend/app/services/photo_metadata.py`), 결제 정보, 건강 정보, 광고 ID, 검색 기록, 앱 사용 분석.

**서버가 스스로 남기는 기록:** 접속 IP·요청 경로(보안·장애 대응, 87일 안에 삭제 — `backend/infra/production/journald-daymo.conf`),
로그인 시도 횟수(IP·이메일을 해시로만). 개인정보 처리방침에는 적혀 있다. 스토어에 신고할지는 각 스토어 문서의 판단을 따른다
(app-store/app-store-connect.md, play-store/play-console.md). 제출 전에 콘솔 도움말을 한 번 더 확인한다.

## 2. 앱에 들어 있는 SDK

`mobile/package.json` 의 런타임 의존성 전부. **광고·분석·오류 수집 SDK는 없다.** 오류는 SDK 없이 위 1장의 한 줄로 Daymo 서버에만 보낸다. 서버가 그것을 Sentry로 올릴지는 서버 설정(`SENTRY_DSN`)이 정하고, 지금은 비어 있어 꺼져 있다. 켜면 오류 한 줄만 Sentry(국외)로 나가므로 이 문서와 두 스토어 답, 처리방침을 함께 고친다.

| 패키지 | 하는 일 | 외부로 보내는 데이터 |
| --- | --- | --- |
| expo, react-native, react-native-web | 앱 실행 | 없음 |
| expo-auth-session, expo-web-browser | 소셜 로그인 창을 시스템 브라우저로 연다 | 앱은 Daymo 서버 주소만 연다. 로그인은 제공자(Google·카카오·네이버·Apple) 화면에서 사용자가 직접 하며, 제공자 SDK를 앱에 넣지 않았다 |
| expo-image-picker | 사진 고르기 | 없음(고른 사진만 앱이 받아 Daymo 서버로 보냄) |
| expo-file-system, expo-secure-store, @react-native-async-storage/async-storage | 기기에 저장 | 없음 |
| expo-crypto | 난수·SHA-256 | 없음 |
| expo-clipboard, expo-sharing, react-native-view-shot | 복사, 공유 창, 화면 캡처(기록 카드) | 없음. 공유는 사용자가 고른 앱으로 |
| expo-font, expo-splash-screen, expo-status-bar, react-native-svg, react-native-safe-area-context, @react-native-community/datetimepicker | 화면 | 없음 |

## 3. 암호화와 삭제

- 전송: 앱과 서버 사이 모든 통신 HTTPS.
- 저장: 비밀번호 Argon2id, 토큰은 해시만. 서버 백업은 restic으로 암호화.
- 삭제 요청: 앱 안(우리 → 내 프로필 → 계정 삭제), 웹 안내 https://www.daymo.xyz/account-deletion. 7일 유예 뒤 삭제,
  함께 쓰는 공간의 기록은 작성자를 "탈퇴한 멤버"로 바꿔 남김. 백업에는 최대 6개월.
- 추적(Tracking): 하지 않는다. 다른 회사의 앱·웹 데이터와 연결하거나 광고에 쓰지 않는다.
