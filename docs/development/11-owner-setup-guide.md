# 개발자가 준비해야 할 환경·계정·시크릿

이 문서는 Daymo 개발을 시작하고 운영할 때 프로젝트 소유자가 알아야 하거나 직접 준비해야 하는 항목을 정리한다. 비밀값 자체는 이 문서나 Git 저장소에 기록하지 않는다.

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
- 이메일 로그인 우선
- 공간별 2~4명
- 여행·일정·장소·준비물 실제 연동
- 요리·기록·사진은 이후 단계
- 이메일 소유 확인과 가입·로그인 자동화 공격 방어 포함
- 결제, 광고와 공개 커뮤니티 제외

### 소셜 로그인 도입 순서

1. 이메일
2. Apple
3. Kakao
4. Google
5. Naver

한 번에 모두 구현하지 않고 제공자별 로그인·취소·탈퇴·계정 연결을 각각 검증한다.

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
디스크 70%: 경고
디스크 85%: 신규 업로드 제한
앱 업로드 전 표시본 압축
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
  ├─ 표시본 압축
  └─ 썸네일/표시본 업로드
        ↓
Spring Boot 권한 검사
        ↓
/srv/daymo/uploads 비공개 volume
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

이메일 발송은 ConoHa에서 메일 서버를 직접 운영하지 않고 외부 전문 발송 서비스의 SMTP를 사용하기로 결정했다.

```dotenv
MAIL_PROVIDER=smtp
MAIL_FROM=no-reply@daymo.xyz
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_STARTTLS=true
```

로컬 개발에서는 Mailpit 같은 로컬 메일 서버를 사용해 실제 발송 키 없이 검증할 수 있다.

SMTP 비밀번호는 앱에 넣지 않고 Spring Boot 운영 secret에만 둔다. `daymo.xyz` DNS에는 선택한 공급자가 안내하는 SPF·DKIM을 설정하고 DMARC 정책도 단계적으로 적용한다.

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
