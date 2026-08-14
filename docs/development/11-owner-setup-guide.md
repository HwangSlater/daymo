# 개발자가 준비해야 할 환경·계정·시크릿

이 문서는 Daymo 개발을 시작하고 운영할 때 프로젝트 소유자가 알아야 하거나 직접 준비해야 하는 항목을 정리한다. 비밀값 자체는 이 문서나 Git 저장소에 기록하지 않는다.

초기 공개 출시 주체는 개인 개발자다. Apple Developer와 Google Play는 개인 계정으로 준비하고, 스토어 판매자·법적 고지에는 검증된 법적 이름을 사용한다. 앱 UI, 스크린샷용 더미 데이터와 공개 Git 저장소에는 운영자 실명을 넣지 않는다.

사용자 공개 문의 주소는 `support@daymo.xyz`이며 Daymo 전용 Google 계정으로 전달한다. 자동 발신은 `no-reply@daymo.xyz`로 분리한다. 도메인 구매 후 수신 전달, SPF/DKIM/DMARC, 회신 주소와 스팸함까지 실제 송수신 테스트한다.

사진에 등장한 당사자의 삭제·처리정지 요청은 운영자가 접수해 사진을 임시 숨기고 검토한다. 업로더와 owner에게 요청자의 개인정보를 공유하지 않으며 결과에 따라 7일 삭제 절차 또는 복원을 수행한다. 확인 자료와 처리 기한은 출시 전 법률 검토로 고정한다.

첫 출시부터 앱 내 사용자·콘텐츠 신고와 사용자 차단을 운영한다. 차단은 새 초대·공간 합류·관련 알림을 막고 기존 공간 콘텐츠를 자동 삭제하지 않는다. 신고 queue를 확인할 운영 화면과 처리 기록이 공개 출시 전에 준비되어야 한다.

신고는 즉시 접수하고 24시간 이내 최초 검토한다. 사진 노출·위협·아동 안전 긴급 신고는 먼저 임시 제한하며 운영 알림에는 신고 본문이나 사진을 넣지 않는다. 24시간 기한을 지속해서 지킬 수 없는 상태에서는 공개 가입 규모를 늘리지 않는다.

텍스트·외부 URL은 versioned 금지 규칙으로 사전 검사한다. 초기 사진은 외부 자동 판별 서비스로 보내지 않고 초대 공간, 이용규칙, 신고·임시 제한과 24시간 검토로 대응한다.

신고 처리는 일반 앱과 분리된 관리자 웹에서 수행한다. 관리자 공개 가입은 없고 사전 허용 계정, MFA, 짧은 session과 모든 처리 감사 로그를 적용한다. 관리자 원본 사진 조회는 신고 처리에 필요한 경우만 허용한다.

관리자 MFA는 Google Authenticator 등 표준 인증 앱의 TOTP 6자리 코드를 사용한다. 등록 시 발급되는 일회용 복구 코드 10개는 온라인 비밀번호 관리 도구와 별도의 오프라인 장소에 나눠 보관한다. 서버에는 TOTP secret 암호문과 복구 코드 hash만 저장한다.

관리자 웹은 1시간 동안 조작이 없으면 잠기며 TOTP를 다시 확인해야 한다. 처리 중인 작업은 잠금 시 자동 제출하지 않는다.

신고 기록은 처리 완료 후 1년, 관리자 감사 로그는 생성 후 2년 보관하고 법적 보존 사유가 없으면 자동 파기한다. 처리 결과에는 14일 이의 제기 기한을 안내한다. 긴급 신고는 즉시, 일반 신고는 1시간 단위 요약으로 운영자에게 알리며 민감한 본문과 사진은 알림에 넣지 않는다.

사용자는 앱에서 내 데이터 export를 요청할 수 있다. 서버는 내 계정·동의·참여 이력·본인 작성 콘텐츠·본인 사진 원본만 비동기로 만들고 24시간 유효한 1회용 링크로 제공한다. 다운로드나 만료 후 archive를 삭제한다.

첫 출시에는 제3자 행동 분석 SDK를 넣지 않는다. Sentry 오류 추적만 PII scrubbing과 최소 기술 정보로 운영하며 화면 조회·버튼 클릭 분석에는 사용하지 않는다.

Sentry 보존기간은 30일이고 가명 설치 ID만 사용한다. 잠금화면 push는 상세 여행 정보를 숨긴 일반 문구로 보내며, 생체 앱 잠금은 기기별 선택 기능·기본 꺼짐으로 제공한다. 생체 원본은 앱이나 서버에서 수집하지 않는다.

생체 앱 잠금을 켜면 백그라운드 1분 후 잠그고 실패 시 OS 기기 암호·PIN을 허용한다. 앱 전환 화면은 항상 privacy cover로 가리지만 사용자의 일반 스크린샷은 막지 않는다.

## 1. 먼저 결정할 제품·배포 항목

### 앱 식별자

앱 식별자는 `com.hwangslater.daymo`로 확정했다.

```text
iOS Bundle Identifier: com.hwangslater.daymo
Android Package Name: com.hwangslater.daymo
앱 URL Scheme: daymo
```

스토어 출시 후 식별자 변경은 어렵다. 소유 도메인이 있다면 역도메인 형식을 우선 사용한다.

### 초기 운영 범위

첫 알파 확정 범위:

- 누구나 계정을 만들 수 있는 공개 회원가입
- 여행 공간과 콘텐츠는 초대 링크로 참여한 멤버만 접근
- 하나의 초대 링크는 7일간 최대 10명이 사용하며 owner가 언제든 폐기 가능
- 초대 참여자의 기본 권한은 `editor`; 참여 후 owner가 멤버별 권한 변경 가능
- 로그인과 이메일 인증을 마친 사용자는 별도 owner 승인 없이 유효한 링크로 즉시 참여
- 공간 삭제 요청은 즉시 목록에서 숨기고 7일간 owner 복구를 허용한 뒤 최종 삭제
- 이메일 로그인 우선
- 공간별 owner 포함 최대 10명
- 멤버가 공간을 나가도 공동 콘텐츠와 작성자 이름은 유지하고, 나가기 전 본인 사진 검토·삭제 제공
- owner가 멤버를 내보내도 공동 콘텐츠와 작성자 이름은 유지하고 접근만 즉시 차단
- 여행·일정·장소·준비물 실제 연동
- 요리·기록·사진은 이후 단계
- 이메일 소유 확인과 가입·로그인 자동화 공격 방어 포함
- 만 14세 이상만 가입, 생년월일 원본은 수집하지 않음
- 이메일 비밀번호는 8~128자, 조합 규칙 없이 흔한·유출 비밀번호만 차단하고 Argon2id로 저장
- 가입 이메일 인증은 30분 유효·1회용 링크로 처리하고 앱 Universal/App Link와 웹 fallback을 모두 제공
- 비밀번호 재설정도 30분 유효·1회용 링크로 처리하며 성공 후 기존 로그인 세션을 모두 종료
- 자동 로그인은 access token 15분, 회전형 refresh token 마지막 사용 후 90일로 운영
- 계정 삭제, 이메일·비밀번호 변경, 로그인 방식 연결·해제는 작업마다 매번 재인증
- 공간 삭제는 재인증 대신 공간 이름 입력과 삭제 영향·7일 유예 최종 재확인을 모두 요구
- 활성 로그인 기기는 계정당 최대 5대이며 초과 시 가장 오래 사용하지 않은 다른 기기 세션을 종료
- 여행은 일반 화면에서 보관하고, 보관함 관리 메뉴에서 삭제한 뒤 7일간 복구 가능
- 여행 보관·해제는 owner/editor, 여행 전체 삭제·복구는 owner만 가능
- 보관된 여행도 일정·장소·준비·요리·기록·사진을 계속 편집 가능
- 지난 여행은 자동 보관하지 않고 여행·장소·요리 편집만 확인; 동의 후 같은 여행·기기에서 10분간 재확인 생략
- 결제, 광고와 공개 커뮤니티 제외

### 첫 출시 로그인 범위

1. 이메일
2. Apple
3. Google
4. Kakao
5. Naver

다섯 방식을 모두 첫 출시에서 지원한다. 구현 커밋은 제공자별로 분리하고 로그인·취소·탈퇴·계정 연결을 각각 검증한다.

## 2. 사진에서 말하는 `로컬 저장`

S3는 AWS의 Amazon S3에서 시작한 오브젝트 저장 방식이다. `S3 호환 스토리지`는 AWS뿐 아니라 같은 API 방식을 지원하는 다른 회사의 저장소도 포함한다. Daymo에서 반드시 Amazon S3를 사용해야 하는 것은 아니다.

`로컬 저장`은 다음 두 의미를 구분해야 한다.

### A. 사용자 휴대폰에만 저장

- 사진 원본과 표시본을 각 사용자 기기에 둔다.
- 서버 저장 공간과 업로드 데이터가 가장 적다.
- 앱 삭제, 기기 분실·교체 시 사진을 잃을 수 있다.
- 다른 멤버가 같은 사진을 자동으로 볼 수 없다.
- iCloud/Google Photos 등 OS 사진 보관함에 저장된 사진은 앱이 소유하거나 백업을 보장할 수 없다.

Daymo의 사진이 개인 기록이고 멤버 공유가 필요 없다면 가능한 방식이다. 공동 여행 기록으로 함께 보려면 기기 간 직접 전송 또는 서버 업로드 기능이 추가로 필요하다.

### B. ConoHa VPS 디스크에 저장

- `/srv/daymo/uploads` 같은 VPS volume에 사진을 저장한다.
- 별도 Amazon S3 계정이나 비용이 필요 없다.
- 멤버끼리 사진을 공유할 수 있다.
- API·DB·사진이 같은 100GB SSD를 사용한다.
- VPS 장애나 디스크 손실에 대비해 다른 장소로 백업해야 한다.
- 사진 증가량 제한과 저장 공간 경고가 필요하다.

초기 소수 사용자라면 현실적인 선택이다. 다음 조건을 적용한다.

```text
사진 저장 상한: 초기 30GB
사진 1장: 최대 20MB
공간 1개: 최대 1GB
동영상: 초기 미지원
디스크 70%: 경고
디스크 85%: 신규 업로드 제한
모든 선택 사진 원본 보관, 표시본·썸네일 별도 생성
업로드 기본값은 Wi-Fi와 모바일 데이터 모두 허용, 사용자가 기기별로 Wi-Fi 전용 설정 가능
사진 삭제·복구는 업로더의 본인 사진과 owner의 모든 사진에 허용, 다른 editor의 타인 사진은 금지
사진 설명·날짜·장소·일정 연결 수정도 업로더의 본인 사진과 owner의 모든 사진에만 허용
공간 사진 사용량 80%부터 경고, 100%에서는 기존 사진을 유지하고 신규 업로드만 차단
썸네일 별도 생성
외부 일일 백업
로그와 Docker image 용량 제한
```

사진 파일은 Nginx 공개 폴더로 직접 노출하지 않는다. API가 멤버 권한을 검사한 뒤 짧게 유효한 다운로드 주소 또는 내부 전달 방식으로 제공한다.

### C. 외부 S3 호환 저장소 — 현재 미사용

- VPS와 사진 장애 영역을 분리한다.
- 사진이 늘어도 100GB VPS 디스크를 사용하지 않는다.
- 별도 공급자, 접근 키, 비용과 개인정보 처리 국가 확인이 필요하다.

공개 사용자 규모가 커진 뒤 이전할 수 있다. 처음부터 저장소 interface를 분리하면 VPS 로컬에서 외부 저장소로 옮길 때 앱 API를 바꾸지 않아도 된다.

### 현재 확정 구조

사용자가 뜻한 로컬은 **ConoHa VPS 디스크**로 확인됐다. 다음 구조로 시작한다.

```text
모바일 기기
  ├─ 원본 선택
  └─ 원본 업로드
        ↓
Spring Boot 권한 검사
        ↓
/srv/daymo/uploads 원본·표시본·썸네일 비공개 volume
        ↓
restic 암호화 snapshot
        ↓
rclone을 통해 Google Drive 자동 백업
```

코드에서는 `PhotoStorage` interface를 두고 첫 구현을 `LocalPhotoStorage`로 만든다. 나중에 필요할 때 `S3PhotoStorage`로 교체한다.

Google Drive에는 노출 가능한 폴더 원본을 그대로 올리지 않는다. restic이 암호화·중복 제거된 시점별 snapshot을 만들고 rclone이 Google Drive와 연결한다. 단순 mirror sync는 서버의 실수나 손상이 백업에도 복제될 수 있어 사용하지 않는다.

백업은 사용자가 이미 보유한 Daymo 전용 Google 계정을 사용한다. 2단계 인증과 복구 수단을 설정하고, VPS에는 Google 비밀번호가 아니라 rclone OAuth token만 둔다. 최초 연결은 관리자 PC에서 브라우저로 승인한 뒤 암호화된 rclone 설정을 VPS secret 경로로 전달한다.

## 3. 로컬 개발 환경

### 현재 확인된 상태

| 항목 | 현재 상태 | 필요한 조치 |
| --- | --- | --- |
| Node.js | 현재 shell `v26.7.0` | Node 24 LTS로 전환 확정 |
| npm | `11.19.0` | 선택한 Node 버전과 함께 고정 |
| Java | 설치되지 않음 | JDK 21 설치 |
| Expo | SDK 54 | 기능 개발 전에 최신 안정 SDK 업그레이드 검증 확정 |
| React Native | 0.81.4 | Expo 호환 조합 유지 |
| PostgreSQL | 미구성 | Docker 기반 PostgreSQL 16 준비 |
| Spring Boot | 프로젝트 없음 | 기반 단계에서 생성 |

### 필요한 도구

- Node.js LTS, npm
- Xcode, CocoaPods, iOS Simulator
- Android Studio, Android SDK
- JDK 21
- Docker Desktop
- IntelliJ IDEA 권장
- Git

백엔드 기준:

```text
Java 21
Spring Boot 3.x
Gradle Kotlin DSL
PostgreSQL 16
Flyway
Spring Security
Spring Data JPA
Testcontainers
OpenAPI
```

Redis, Kafka, Elasticsearch, Kubernetes는 초기 범위에서 제외한다.

## 4. 필요한 외부 계정

### 기반 개발

- GitHub
- 로컬 PostgreSQL
- 로컬 테스트 이메일 환경

### 인증 단계

- Apple Developer
- Kakao Developers
- Naver Developers
- Google Cloud Console
- staging/production 도메인

### 배포·운영 단계

- ConoHa VPS
- 도메인과 DNS 관리 계정
- Expo/EAS
- App Store Connect
- Google Play Console
- Sentry 또는 결정한 오류 수집 서비스
- 운영 이메일 발송 서비스

외부 사진 저장소는 VPS 로컬 저장을 선택하면 초기에는 필요 없다.

## 5. 앱의 공개 환경 변수

앱 번들에서 읽을 수 있으므로 공개되어도 되는 설정만 넣는다.

```dotenv
EXPO_PUBLIC_APP_ENV=local
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/v1
EXPO_PUBLIC_SENTRY_DSN=
```

`EXPO_PUBLIC_*`에 비밀번호, OAuth secret, DB 접속 정보나 서명 키를 넣지 않는다. 실제 `.env`는 커밋하지 않고 `.env.example`만 커밋한다.

## 6. 백엔드 기본 시크릿

```dotenv
SPRING_PROFILES_ACTIVE=local
DB_URL=jdbc:postgresql://localhost:5432/daymo
DB_USERNAME=daymo
DB_PASSWORD=
JWT_SIGNING_KEY=
REFRESH_TOKEN_PEPPER=
```

- `JWT_SIGNING_KEY`와 `REFRESH_TOKEN_PEPPER`는 서로 다른 긴 난수로 생성한다.
- 운영값은 VPS root 전용 env 또는 배포 secret에 저장한다.
- 로컬·staging·production 값을 재사용하지 않는다.

## 7. OAuth 시크릿

```dotenv
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
```

- OAuth secret과 Apple private key는 서버에만 둔다.
- Kakao 네이티브 앱 키와 REST API 키를 구분한다.
- 개발·staging·운영 redirect URI를 각각 등록한다.
- 로그인 결과의 access/refresh token을 URL에 넣지 않는다.

## 8. VPS 로컬 사진 저장 설정

외부 S3를 사용하지 않는 경우 필요한 서버 설정 예시:

```dotenv
PHOTO_STORAGE_TYPE=local
PHOTO_LOCAL_ROOT=/srv/daymo/uploads
PHOTO_MAX_TOTAL_BYTES=32212254720
PHOTO_MAX_UPLOAD_BYTES=
PHOTO_BACKUP_TARGET=rclone:daymo-drive:daymo-backup
PHOTO_DOWNLOAD_SIGNING_KEY=
RESTIC_REPOSITORY=rclone:daymo-drive:daymo-backup
RESTIC_PASSWORD_FILE=/etc/daymo/secrets/restic-password
RCLONE_CONFIG=/etc/daymo/secrets/rclone.conf
```

`PHOTO_DOWNLOAD_SIGNING_KEY`는 파일 접근용 짧은 URL을 서명할 때 사용한다. 실제 경로를 API 응답이나 로그에 노출하지 않는다.

Google 계정 연결 과정에서 생성되는 rclone OAuth token과 restic repository password도 시크릿이다. 채팅이나 Git에 올리지 않고 VPS root만 읽을 수 있게 보관한다. Google 계정 비밀번호 자체를 VPS에 저장하지 않는다.

## 9. 이메일과 오류 수집

이메일 발송은 ConoHa에서 메일 서버를 직접 운영하지 않고 Resend SMTP를 사용하기로 결정했다.

```dotenv
MAIL_PROVIDER=resend
MAIL_FROM=no-reply@daymo.xyz
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USERNAME=resend
SMTP_PASSWORD=
SMTP_STARTTLS=true
```

로컬 개발에서는 Mailpit 같은 로컬 메일 서버를 사용해 실제 발송 키 없이 검증할 수 있다.

`SMTP_PASSWORD`에는 Resend API Key를 넣는다. 앱에 포함하지 않고 Spring Boot 운영 secret에만 둔다. `daymo.xyz` DNS에는 Resend가 안내하는 도메인 인증·DKIM 레코드를 설정하고 DMARC 정책도 단계적으로 적용한다.

도메인 구매 후 진행 순서:

1. Resend 계정에서 `daymo.xyz` 추가
2. Resend가 표시한 DNS 레코드를 도메인 등록기관에 입력
3. 도메인 검증 완료 확인
4. 발송 전용 API Key 생성
5. VPS secret에 SMTP 설정 등록
6. 가입 인증·재전송·비밀번호 재설정·초대 메일 테스트

Sentry를 사용할 경우:

```dotenv
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
```

앱에는 공개 DSN만 넣고 build token은 CI에만 둔다. 이메일, 주소, 메모 본문, 인증 token과 사진 경로를 오류 로그에서 제거한다.

## 10. 푸시 알림 자격 증명

iOS:

- Apple Push Notification Key
- Apple Team ID
- Key ID

Android:

- Firebase 프로젝트
- FCM 자격 증명
- `google-services.json`

알림 기능 단계 전에는 필요하지 않다.

첫 출시 푸시는 초대 참여, 담당 지정·변경, 여행 임박으로 제한한다. 여행 임박 알림은 공간 timezone 기준 출발 7일 전과 1일 전 오전 9시에 보낸다. 일반적인 공동 콘텐츠 수정은 앱 내 동기화로만 보여주며 마케팅 알림은 별도 동의를 받는다.

## 11. GitHub Actions 배포 시크릿

```text
GHCR_USERNAME
GHCR_TOKEN
VPS_HOST
VPS_PORT
VPS_USER
VPS_SSH_PRIVATE_KEY
VPS_KNOWN_HOSTS
SENTRY_AUTH_TOKEN
EXPO_TOKEN
```

VPS root 비밀번호 대신 제한된 배포용 SSH 키를 사용한다.

## 12. ConoHa VPS 준비

구매 계획은 ConoHa VPS 일본 리전이다. 구매 직후 영수증·계약 화면과 관리 콘솔에서 실제 데이터센터 국가와 세부 지역을 확인해 운영 기록과 개인정보 처리방침 초안에 반영한다.

VPS는 먼저 beta/staging 모드로 공개 가입을 받고, 계정·여행·사진을 지우지 않은 채 production으로 전환한다. 같은 2GB VPS에서 staging과 production을 동시에 상시 실행하지 않는다. 베타 시작 전부터 production 수준 약관·처리방침·백업·신고 운영을 갖추고, 전환 직전 전체 snapshot의 실제 복원을 확인한다.

GitHub의 `main`은 직접 push하지 못하게 보호하고 pull request의 필수 CI가 통과한 뒤에만 merge한다. merge되면 자동 배포하되 schema 변경 배포는 직전 DB snapshot이 성공해야 하며, health/smoke test가 실패하면 이전 image로 자동 복귀한다. DB 변경은 기존 버전과 함께 동작하는 expand-contract 방식으로 나눈다.

초기 1인 개발에서는 다른 사람의 PR 승인을 요구하지 않고 필수 CI를 통과한 PR만 squash merge한다. production 배포는 한 번에 하나만 실행하며 최신 대기 배포만 보존한다. 장애 rollback은 server image만 되돌리고 DB down migration은 사용하지 않는다.

앱 beta는 TestFlight와 Android 비공개 테스트를 병행한다. EAS OTA는 같은 native runtime의 JavaScript·이미지 변경만 내부 확인 후 단계적으로 확대하고, native 변경은 store 심사를 거친다. 강제 업데이트는 보안·API 비호환 상황에만 사용한다. 위험 기능은 server feature flag로 소수 대상부터 활성화하고 문제가 생기면 앱 재배포 없이 끈다.

기능과 OTA는 내부 → 10% → 50% → 100% 순서로 확대하고 문제가 발견되면 중단 후 이전 정상 OTA로 복귀한다. 치명적 서버 장애는 Daymo 전용 운영 이메일로 즉시 받고 나머지는 일일 요약으로 확인한다. 로그인 불가·장기 장애에는 앱 공지와 외부 상태 페이지를 함께 사용한다.

서버와 도메인이 준비되면 UptimeRobot 계정을 만들고 무료 plan에서 `https://api.daymo.xyz/health`를 5분 간격으로 등록한다. 장애·복구 수신 주소는 Daymo 운영 이메일로 지정하고 basic status page는 UptimeRobot 제공 URL을 사용한다. 유료 plan, custom domain과 `status.daymo.xyz`는 설정하지 않는다. 공개 페이지는 현재 상태만 표시하고 과거 장애 이력은 공개하지 않는다. 무료 plan 조건이 달라지면 유료 결제 대신 무료 대안을 다시 검토한다.

현재 예정 사양:

```text
CPU 3 Core
RAM 2GB
SSD 100GB
트래픽 무제한
```

준비할 항목:

- Ubuntu LTS
- Docker와 Docker Compose
- Nginx와 HTTPS 인증서
- SSH key 로그인과 방화벽
- PostgreSQL private volume
- 사진 private volume
- VPS 외부 백업
- 로그 rotation과 2GB 비상 swap
- 상태 확인 endpoint와 용량 경고

외부에는 80/443만 기본 공개하고 PostgreSQL 5432, Spring Boot 8080과 Actuator 상세 endpoint는 공개하지 않는다. SSH 22는 관리자 IP 제한을 권장한다.

## 13. 도메인과 공개 페이지

기존 개인 도메인을 재사용하지 않고 Daymo 전용 `daymo.xyz`를 구매하기로 결정했다. 현재 상태는 등록·DNS 연결 대기이며 등록기관은 구매 후 기록한다.

예시:

```text
api.daymo.xyz          운영 API
staging-api.daymo.xyz  staging API
www.daymo.xyz          약관·처리방침·삭제 요청
```

필요한 공개 페이지:

- 개인정보 처리방침
- 이용약관
- 계정 삭제 요청
- 고객 문의
- 오픈소스 라이선스

## 14. 개발 범위

### P0 기반과 데이터 안전

- 환경과 앱 식별자 고정
- 라우팅과 기능 파일 분리
- Spring Boot, PostgreSQL과 Flyway
- 인증·세션·공간 권한
- 여행 생성과 홈
- SQLite 캐시·오프라인 읽기·동기화
- CI, 오류 처리와 백업

### P1 현재 UI 실제 기능화

- 여행 목록·지도·캘린더
- 일정·교통·숙소·공동 메모
- 장소·태그·준비물·담당
- 요리·재료
- 사진·일기·기념 카드
- 검색·멤버 관리·알림 설정

### P2 출시 후

- 고급 통계와 추천
- AI 구조화 고도화
- 템플릿과 정교한 검색
- 사용자 규모에 따른 인프라 확장

## 15. 지금 채팅이나 Git에 제공하면 안 되는 값

- GitHub Personal Access Token
- Apple private key 원문
- Google service account JSON
- VPS root 비밀번호와 SSH private key
- 운영 DB 비밀번호
- JWT signing key와 refresh pepper
- OAuth client secret
- 사진 다운로드 서명 key
- Sentry auth token

시크릿은 사용자가 로컬 env, GitHub Actions Secrets 또는 VPS secret 파일에 직접 등록한다. 개발 작업에서는 변수 이름과 연결 성공 여부만 확인한다.

## 16. 개발 시작 전 사용자 결정

1. 앱 식별자 `com.hwangslater.daymo` 확정 완료
2. Node 24 LTS와 기능 개발 전 Expo 최신 안정 SDK 업그레이드 검증 확정
3. 첫 알파 공개 회원가입 확정, 공간은 초대 멤버 전용
4. 사진 저장은 ConoHa VPS 디스크, 초기 상한은 30GB로 확정
5. 외부 백업은 Google Drive로 시작
6. Google Drive 백업은 기존 Daymo 전용 계정 사용으로 확정
