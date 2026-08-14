# 개발 환경

## 1. 현재 클라이언트 기준

| 항목 | 현재 버전/설정 |
| --- | --- |
| Node.js | 24 LTS, 루트 `.nvmrc`와 `mobile/package.json` engines 고정 |
| npm | Node 20에 포함된 버전, `package-lock.json` 고정 |
| Expo | SDK 54 |
| React Native | 0.81.4 |
| React | 19.1.0 |
| TypeScript | 5.9.x |
| iOS | Xcode 최신 안정 버전, CocoaPods, iOS Simulator |
| Android | Android Studio, SDK 35 이상, JDK 17 |
| Web | Expo Web. 피드백용 모바일 폭 프리뷰이며 정식 웹 제품은 후순위 |

### 2026-08-14 현재 개발 PC 감사

| 항목 | 확인 결과 | 조치 |
| --- | --- | --- |
| Node.js | 현재 shell `v26.7.0` | 기준은 Node 24 LTS로 확정, SDK 검증 전 실제 전환 필요 |
| npm | `11.19.0` | 선택한 Node LTS에 포함된 버전으로 lockfile 재검증 |
| Java | 설치되지 않음 | 백엔드 생성 전에 JDK 21 설치 필수 |
| iOS bundle ID | `com.hwangslater.daymo` | 확정·`mobile/app.json` 반영 완료 |
| Android package | `com.hwangslater.daymo` | 확정·`mobile/app.json` 반영 완료 |
| 테스트/lint | npm script 없음 | 기반 공사에서 typecheck·lint·unit test script 추가 |
| 의존성 감사 | high 11, moderate 9 | `audit fix --force` 금지, Expo SDK 업그레이드 검증 작업으로 분리 |

현재 Node 26에서 UI는 실행되지만 프로젝트 기준은 Node 24 LTS다. SDK 검증 전에 `nvm use`로 실제 shell을 전환하고 `npm ci`와 네이티브 빌드를 다시 확인한다. npm audit의 자동 제안은 Expo/React Native의 호환 조합을 깨뜨릴 수 있으므로 그대로 적용하지 않는다.

Node 기준은 저장소 루트 `.nvmrc`를 사용하고 모바일 의존성 설치·실행은 `mobile/`에서 수행한다.

```bash
cd mobile
npm ci
npm run ios
npm run android
npm run web
npx tsc --noEmit
```

첫 기반 커밋에서 루트 `.nvmrc`, `mobile/.env.example`, `mobile/package.json` engines와 `typecheck`, `lint`, `test`, `test:e2e`, `export` npm script를 추가한다.

네이티브 의존성을 추가할 때는 Expo 호환 버전을 위해 `npm install`보다 `npx expo install <package>`를 우선한다.

## 2. 도입할 개발 도구

### P0

- Expo Router: 화면별 파일과 딥링크 구조
- REST API client: Spring Boot API와 통신하는 fetch 기반 typed client
- TanStack Query: 서버 캐시, 재시도, 낙관적 업데이트
- Zustand: 작성 중인 폼과 화면 전용 상태
- React Hook Form + Zod: 폼 검증과 API 스키마 공유
- AsyncStorage: 비민감 preference와 작은 UI 상태
- SecureStore: 세션 토큰
- Expo SQLite: 공동 데이터 조회 캐시, 동기화 cursor와 pending mutation
- Expo FileSystem: 사진 썸네일, 임시 업로드 파일과 캐시 정리
- NetInfo: 오프라인·Wi-Fi 상태와 데이터 절약 정책
- Expo Image Picker/Camera/Image Manipulator: 사진 선택·촬영·압축
- Expo Linking: 네이버·카카오·웹 지도 링크
- Jest + React Native Testing Library: 단위·컴포넌트 테스트
- Maestro: 실제 기기 흐름 E2E

Expo SDK는 기능 코드를 넣기 전에 별도 되돌리기 가능한 커밋에서 최신 안정판 호환성을 검증하기로 확정했다. 회귀가 크면 검증 커밋만 되돌리고 SDK 54 기준 보안 패치 가능 범위를 기록한 뒤 진행한다.

패키지는 한 단계씩 추가하고 Expo SDK 54 호환성을 확인한다. 라우터 도입은 현재 단일 화면 파일을 기능별로 분리하는 작업과 함께 진행한다.

## 3. 백엔드 환경

백엔드는 사용자의 주 언어와 보유 인프라에 맞춰 **Java 21 + Spring Boot 3.x 모놀리식 API**로 구축한다. 운영 서버는 Ubuntu 24.04 LTS 기반 ConoHa VPS `3Core / RAM 2GB / SSD 100GB / 트래픽 무제한`이다. Nginx·API·PostgreSQL은 Docker Compose로 같은 VPS에서 운영하고 컨테이너별 메모리 상한을 둔다. PostgreSQL data는 container layer가 아닌 private named/bind volume에 보존한다.

| 환경 | 용도 | 데이터 |
| --- | --- | --- |
| local | 개발자 PC, API·DB 통합 테스트 | 가명 시드 데이터만 |
| beta/staging | 구매한 ConoHa VPS의 최초 운영 모드 | 공개 가입·실사용 데이터, production 수준 보호 |
| production | 같은 ConoHa VPS를 출시 점검 후 전환 | beta 데이터와 계정 유지 |

2GB VPS에서 staging과 production JVM·DB를 동시에 상시 운영하지 않는다. VPS는 먼저 beta/staging 모드로 공개 가입을 받고, 출시 체크리스트 통과 후 데이터 초기화 없이 production 설정과 `api.daymo.xyz`로 전환한다. beta부터 실사용 개인정보가 들어오므로 약관·처리방침·백업·신고 대응과 보안 기준은 production과 동일하게 적용한다.

백엔드 권장 스택:

- Java 21 LTS, Spring Boot 3.x, Gradle Kotlin DSL
- Spring Web MVC, Validation, Security, OAuth2 Client, Actuator
- Spring Data JPA + QueryDSL. 복잡한 검색/집계는 명시적 SQL 또는 jOOQ 도입 검토
- PostgreSQL 16, Flyway, Testcontainers
- JWT access token + 회전형 refresh token
- springdoc-openapi로 OpenAPI 문서 생성
- JUnit 5, AssertJ, MockMvc, RestAssured
- Nginx, Docker Compose, Let's Encrypt

Redis, Elasticsearch, Kafka, Kubernetes는 초기 환경에 넣지 않는다. 캐시는 앱과 Caffeine으로 해결하고 검색은 PostgreSQL에서 시작한다. 스키마는 Flyway migration으로만 변경한다.

로컬 실행 예시:

```bash
cd server
./gradlew test
docker compose up -d postgres
./gradlew bootRun --args='--spring.profiles.active=local'
```

## 4. 환경 변수

저장소에는 `.env.example`만 커밋하고 실제 값은 커밋하지 않는다.

```dotenv
EXPO_PUBLIC_APP_ENV=local
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/v1
EXPO_PUBLIC_SENTRY_DSN=

# 아래 값은 서버 환경 변수이며 앱 .env에 넣지 않음
SPRING_PROFILES_ACTIVE=local
DB_URL=jdbc:postgresql://localhost:5432/daymo
DB_USERNAME=daymo
DB_PASSWORD=
JWT_SIGNING_KEY=
REFRESH_TOKEN_PEPPER=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
MAIL_PROVIDER=resend
MAIL_FROM=no-reply@daymo.xyz
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USERNAME=resend
SMTP_PASSWORD=
SMTP_STARTTLS=true
PHOTO_STORAGE_TYPE=local
PHOTO_LOCAL_ROOT=/srv/daymo/uploads
PHOTO_DOWNLOAD_SIGNING_KEY=
RESTIC_REPOSITORY=rclone:daymo-drive:daymo-backup
RESTIC_PASSWORD_FILE=/etc/daymo/secrets/restic-password
RCLONE_CONFIG=/etc/daymo/secrets/rclone.conf
```

`EXPO_PUBLIC_*` 값은 앱 번들에서 읽을 수 있으므로 비밀키를 넣지 않는다. DB 비밀번호, OAuth secret, JWT 키, 사진 URL 서명 키, restic 비밀번호와 rclone OAuth token은 VPS의 root 전용 env/config 파일 또는 CI secret으로 관리한다.

외부 공개 문의 주소는 `support@daymo.xyz`, Resend 자동 발신 주소는 `no-reply@daymo.xyz`로 분리한다. `support@daymo.xyz`의 수신 메일은 Daymo 전용 Google 계정으로 전달하며 개인 이메일 주소를 앱·스토어·정책 문서에 직접 노출하지 않는다.

## 5. OAuth 리디렉션

- 앱 스킴: `daymo://oauth`
- 개발: Expo development build의 리디렉션 URI 등록
- 운영: `daymo.xyz` 기반 iOS Universal Link와 Android App Link를 추가하고 스킴은 보조 수단으로 유지
- 제공자: Apple, Google, Kakao, Naver
- 로그인 완료 후 URL query에 이메일을 직접 전달하는 현재 데모 방식은 폐기한다. Spring Security OAuth2 Client가 authorization code를 교환하고 일회용 앱 로그인 코드를 발급한다. 앱은 코드를 API에 교환해 access/refresh token을 받는다.

## 6. 권장 프로젝트 구조

```text
mobile/
  app/                       # Expo Router routes
  src/
    components/              # 공통 UI
    features/
      auth/ spaces/ trips/ places/ schedule/
      packing/ cooking/ memos/ memories/ search/
    lib/                     # API client, query client, logger, links
    store/                   # UI/작성 중 상태
    theme/                   # 색상 토큰
    types/                   # 생성된 API 타입
  assets/
  ios/
  android/
  package.json
server/
  src/main/java/...          # Spring Boot domain/application/infra/api
  src/main/resources/db/migration/
  src/test/java/...
  build.gradle.kts
infra/
  compose.production.yml
  nginx/
  scripts/
docs/development/
```

현재 `WarmAppShell.tsx`, `WarmTripDetail.tsx`는 UI 기준본으로 유지하면서, 각 개발 단계에서 화면 단위로 `features/`에 옮긴다. 한 번에 전면 재작성하지 않는다.

## 7. Git과 배포

- `main`: 항상 실행 가능
- 기능 브랜치: `feat/<domain>-<short-name>`
- 커밋: 스키마, API, UI 연결, 테스트를 의미 단위로 분리
- DB 마이그레이션은 되돌리기 SQL 또는 전진 수정 계획을 PR에 기록
- UI 피드백용 Vercel Preview와 `daymo.xyz` 공개 문서 deployment, 앱용 EAS Update를 분리
- Vercel Git project의 Root Directory는 `mobile`로 설정하고 `mobile/vercel.json`을 사용
- staging 검증 후 EAS Build로 iOS TestFlight와 Android 비공개 테스트를 같은 release 단위로 병행
- EAS Update는 동일 native runtime의 JavaScript·스타일·이미지 수정에만 사용하고 내부 검증 후 단계적으로 확대
- native module, permission, app config, SDK/runtime 변경은 새 store binary로 배포

가비아에서 `daymo.xyz` DNS를 관리한다. apex/`www`는 Vercel의 소개·약관·개인정보처리방침·계정 삭제 안내로 연결하고 `api` A record는 ConoHa VPS 공인 IP에 직접 연결한다. Cloudflare와 별도 proxy는 사용하지 않는다. API HTTPS는 Nginx와 Let's Encrypt로 자동 발급·갱신한다. Vercel Hobby는 비상업 beta에만 사용하며 수익화 전에 당시 이용 조건을 다시 확인하고 부적합하면 정적 문서를 다른 host로 이전한다.
- 서버는 GitHub Actions에서 테스트·이미지 빌드 후 GHCR에 올리고, VPS가 고정 태그 이미지를 pull해 무중단에 가깝게 교체한다.

PR CI는 client `typecheck`·`lint`·unit test와 server Gradle test·Testcontainers PostgreSQL test를 매번 실행한다. EAS iOS/Android native build는 일반 PR에서 실행하지 않고 beta 또는 production release candidate에서만 두 플랫폼을 같은 release 단위로 생성한다. Dependabot은 매주 client/server 의존성을 생태계별 묶음 PR로 만들며 자동 merge하지 않는다.

CI 최소 작업에서 client job의 working directory는 `mobile`, server job은 `server`로 고정한다.

1. `cd mobile && npm ci`
2. `cd mobile && npx tsc --noEmit`
3. lint/format 검사
4. 단위 테스트
5. Gradle 테스트와 Flyway migration 검증
6. Docker image build
7. Expo export 검증

## 8. VPS 자원 예산

| 프로세스 | 메모리 목표/상한 |
| --- | --- |
| Spring Boot JVM | `-Xms256m -Xmx768m`, 컨테이너 900MB |
| PostgreSQL | 컨테이너 550MB, `shared_buffers` 약 128MB |
| Nginx | 64MB 이하 |
| OS·Docker·여유 | 약 500MB |

- swap 2GB를 비상용으로 두되 지속적인 swap 사용은 장애 신호로 본다.
- JVM은 `UseContainerSupport`를 사용하고 Actuator로 heap/GC를 감시한다.
- API와 DB 외에 상주형 서비스는 추가하지 않는다.
- 빌드는 VPS에서 하지 않고 CI에서 수행해 배포 중 메모리 부족을 막는다.

## 9. 사진 저장 결정

트래픽은 무제한이므로 사진 조회량에 따른 전송량 비용은 주요 제약이 아니다. 하지만 100GB에는 OS, Docker image, DB, 로그, 백업도 함께 들어간다. 사진 원본을 VPS 디스크에 장기 보관하면 저장 용량과 장애 복구가 여전히 위험하다.

- 결정: 초기 운영 원본은 ConoHa VPS의 `/srv/daymo/uploads` private volume에 저장한다.
- 사진용 상한은 우선 30GB로 두고 DB와 사진을 Google Drive에 자동 외부 백업한다.
- 백업은 폴더 mirror가 아니라 암호화·중복 제거·시점 복구가 가능한 restic snapshot을 rclone Google Drive backend로 전송한다.
- 업로드 전 앱에서 표시본을 압축하고 썸네일을 생성한다.
- 저장량과 복구 시간을 측정해 공개 규모가 커질 때만 S3 호환 외부 저장소 이전을 재검토한다.
