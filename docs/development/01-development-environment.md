# 개발 환경

## 1. 현재 클라이언트 기준

| 항목 | 현재 버전/설정 |
| --- | --- |
| Node.js | 24 LTS, 루트 `.nvmrc`와 `mobile/package.json` engines 고정 |
| npm | Node 24에 포함된 버전, `package-lock.json` 고정 |
| Expo | SDK 57 |
| React Native | 0.86.3 |
| React | 19.2.3 |
| TypeScript | 6.0.x |
| iOS | Xcode 최신 안정 버전, CocoaPods, iOS Simulator |
| Android | Android Studio, SDK 35 이상, JDK 17 |
| Web | Expo Web. 2026-09-16부터 `www.daymo.xyz/app`에 올리는 실제 배포본이다(`site/README.md`) |

npm audit의 자동 제안은 Expo/React Native의 호환 조합을 깨뜨릴 수 있으므로 `audit fix --force`를 그대로 적용하지 않는다. 취약점 개수만으로 올리지 않고 실제 노출 여부와 공식 호환 버전을 보고 판단한다(`05` 문서 8장).

Node 기준은 저장소 루트 `.nvmrc`를 사용하고 모바일 의존성 설치·실행은 `mobile/`에서 수행한다.

```bash
cd mobile
npm ci
npm run ios
npm run android
npm run web
npm run typecheck
npm run lint
npm run export
```

### npm script 현황

| script | 명령 | 상태 |
| --- | --- | --- |
| `start` | `expo start` | 있음 |
| `android` | `expo run:android` | 있음 |
| `ios` | `expo run:ios` | 있음 |
| `web` | `expo start --web` | 있음 |
| `typecheck` | `tsc --noEmit` | 있음 |
| `lint` | `expo lint` | 있음 |
| `export` | `expo export -p web` | 있음. 배포용 웹 빌드는 `site/build.mjs`가 같은 명령을 `--output-dir site/dist/app`으로 부른다 |
| `test` | `node --test ... src/*.test.ts api/*.test.js` | 있음. 196개 |
| `test:e2e` | 미정 | 없음. E2E 도구가 아직 없다 |

테스트는 Jest가 아니라 Node에 들어 있는 `node --test`와 타입 지우기로 돌린다. 그래서 `tsconfig.json`에 `allowImportingTsExtensions`가 있고(테스트가 `./x.ts`로 부른다) `types/node-test.d.ts`가 `node:test` 타입을 직접 적어 둔다. 대상은 `react-native`·`expo`를 import하지 않는 순수 모듈이고 화면 두 파일은 덮지 않는다. `test:e2e`는 도구를 실제로 도입하기 전에는 script만 먼저 만들지 않는다.

### 정적 검사 도구

lint는 Expo가 제공하는 방식을 그대로 쓴다. `npx expo lint`가 없는 설정을 자동으로 만들어 주며, 그 결과가 `mobile/eslint.config.js`(flat config, `eslint-config-expo/flat`)와 devDependencies의 `eslint`, `eslint-config-expo`다. 별도 규칙 세트를 직접 정의하지 않는다.

```bash
cd mobile
npm run lint          # 검사
npx eslint . --fix    # 자동 수정 가능한 항목만 정리
```

한동안 `WarmAppShell.tsx`와 `WarmTripDetail.tsx`에 `react-hooks` error가 남아 CI에서 lint를 차단하지 않았다. 지금은 정리돼 `lint`도 실패하면 job이 실패한다.

네이티브 의존성을 추가할 때는 Expo 호환 버전을 위해 `npm install`보다 `npx expo install <package>`를 우선한다.

### 네이티브 폴더와 iOS·Android 빌드

`mobile/ios/`와 `mobile/android/` 네이티브 폴더는 저장소에 두지 않고 `.gitignore`로 제외한다. 네이티브 빌드가 필요한 시점에 app config와 플러그인에서 다시 만든다.

```bash
cd mobile
npx expo prebuild
```

iOS는 CocoaPods가 필요해서 macOS 또는 EAS Build에서만 완전히 만들 수 있다. 현재 개발 PC는 윈도우이므로 이 PC에서는 iOS 네이티브 빌드를 끝까지 만들 수 없다.

커스텀 네이티브 코드를 직접 넣게 되면 그때는 네이티브 폴더를 저장소에 커밋하는 방식으로 바꿔야 한다.

## 2. 도입할 개발 도구

### P0

- Expo Router: 화면별 파일과 딥링크 구조
- REST API client: fetch 기반 typed client. FastAPI가 OpenAPI 스키마를 자동으로 내보내므로 요청·응답 타입과 client 코드는 그 스키마에서 생성하고 손으로 유지하지 않는다. 서버 스키마가 바뀌면 생성물을 다시 만들어 앱 쪽 타입 오류로 드러낸다
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

Expo SDK는 기능 코드를 넣기 전에 별도 되돌리기 가능한 커밋에서 최신 안정판 호환성을 검증하기로 확정했다. 그 검증 커밋에서 SDK 54를 57로 올렸고 되돌리지 않았으므로 이후 작업은 SDK 57을 기준으로 진행한다.

패키지는 한 단계씩 추가하고 Expo SDK 57 호환성을 확인한다. 라우터 도입은 현재 단일 화면 파일을 기능별로 분리하는 작업과 함께 진행한다.

## 3. 백엔드 환경

백엔드는 **Python 3.13 + FastAPI 모놀리식 API**로 구축한다. 근거는 두 가지다. 첫째, 운영 환경이 `2 vCPU / 2GB RAM`이다. 기존 계획은 JVM 컨테이너에 900MB 상한을 두었고 그러면 PostgreSQL·Nginx·OS가 남은 1.1GB를 나눠 써야 해서 여유가 거의 없었다. FastAPI + uvicorn은 워커를 몇 개 띄워도 150~250MB 수준이라 같은 서버에서 훨씬 편하고, 최종 목적지인 집 미니PC에서도 가벼운 런타임이 그대로 이득이다. 둘째, 백엔드 코드를 아직 한 줄도 쓰지 않았으므로 바꾸는 비용이 지금 가장 싸다.

운영 서버는 Ubuntu 24.04 LTS 기반 iwinv 한국 리전 VPS `2 vCPU / RAM 2GB / NVMe 50GB / 일 20GB(월 600GB), 초과분 구간 요금`이다. 실제 데이터센터 국가는 구매 화면에서 확인한 뒤 확정한다. Nginx·API·PostgreSQL은 Docker Compose로 같은 VPS에서 운영하고 컨테이너별 메모리 상한을 둔다. PostgreSQL data는 container layer가 아닌 private named/bind volume에 보존한다. 서버 사양과 운영 설계의 기준 문서는 `06-vps-deployment.md`다.

| 환경 | 용도 | 데이터 |
| --- | --- | --- |
| local | 개발자 PC, API·DB 통합 테스트 | 가명 시드 데이터만 |
| beta/staging | 구매한 iwinv VPS의 최초 운영 모드 | 공개 가입·실사용 데이터, production 수준 보호 |
| production | 같은 iwinv VPS를 출시 점검 후 전환 | beta 데이터와 계정 유지 |

2GB VPS에서 staging과 production API·DB를 동시에 상시 운영하지 않는다. VPS는 먼저 beta/staging 모드로 공개 가입을 받고, 출시 체크리스트 통과 후 데이터 초기화 없이 production 설정과 `api.daymo.xyz`로 전환한다. 초기에는 별도 블록 스토리지 없이 기본 50GB 디스크를 쓰며 사진 전체 상한은 10GB다(`06-vps-deployment.md` 5장). 베타부터 실사용 개인정보가 들어오므로 약관·처리방침·백업·신고 대응과 보안 기준은 production과 동일하게 적용한다.

백엔드 권장 스택:

- Python 3.13, FastAPI + uvicorn. 패키지와 가상환경은 uv로 관리
- Pydantic v2로 요청·응답 검증과 설정 스키마
- SQLAlchemy 2.0 + Alembic, DB 드라이버는 psycopg 3. 복잡한 검색/집계는 명시적 SQL을 직접 쓴다
- PostgreSQL 16
- httpx로 OAuth provider 호출, PyJWT로 JWT access token + 회전형 refresh token
- Pillow로 사진 표시본·썸네일 변환
- OpenAPI 문서는 FastAPI가 기본으로 만들어 주므로 별도 문서 생성 도구를 두지 않는다
- pytest. DB 테스트는 로컬 PostgreSQL 컨테이너를 쓴다. `testcontainers-python`도 있으나 2GB CI에서 굳이 필요한지는 미정
- Nginx, Docker Compose, Let's Encrypt

Redis, Elasticsearch, Kafka, Kubernetes는 초기 환경에 넣지 않는다. 캐시는 앱과 API 프로세스 안의 메모리 캐시로 해결하고 검색은 PostgreSQL에서 시작한다. 스키마는 Alembic migration으로만 변경한다.

로컬 실행 예시:

```bash
cd backend
uv sync
docker compose up -d postgres
uv run alembic upgrade head
uv run pytest
uv run python dev.py
```

로컬에서 `uvicorn app.main:app` 을 직접 부르지 않고 `backend/dev.py` 를 거친다. 윈도우에서 uvicorn은 이벤트 루프를 만든 뒤에 앱을 import하므로 앱 안에서 루프 정책을 바꿔도 늦고, psycopg 비동기는 윈도우 기본 ProactorEventLoop 위에서 동작하지 않는다. 리눅스에서는 `dev.py`가 아무 일도 하지 않으므로 운영 배포는 uvicorn을 직접 부른다. `DB_HOST`는 `localhost`가 아니라 `127.0.0.1`로 둔다. 윈도우는 `localhost`를 `::1`로 먼저 풀고 개발용 컨테이너는 IPv4에만 바인딩돼 있어 연결이 실패하지 않고 멈춘다.

## 4. 환경 변수

저장소에는 `.env.example`만 커밋하고 실제 값은 커밋하지 않는다. 원본은 `mobile/.env.example`과 `backend/.env.example`이고, 서버 설정의 이름·기본값은 `backend/app/core/config.py`가 결정한다. 설명은 [11-owner-setup-guide.md](./11-owner-setup-guide.md) 5~9장에 있다.

앱(번들에서 읽을 수 있으므로 비밀값을 넣지 않는다):

```dotenv
EXPO_PUBLIC_DAYMO_API_URL=https://api.daymo.xyz
EXPO_PUBLIC_DAYMO_PLACE_RESOLVER_URL=
# 비우면 앱이 멈췄을 때 오류 한 줄을 서버로 보낸다. off 면 보내지 않는다
EXPO_PUBLIC_DAYMO_ERROR_REPORT=
```

서버:

```dotenv
APP_ENV=local
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=daymo
DB_USERNAME=daymo
DB_PASSWORD=
JWT_SIGNING_KEY=
REFRESH_TOKEN_PEPPER=
AUTH_LINK_BASE=https://api.daymo.xyz
CORS_ORIGINS=https://www.daymo.xyz,https://daymo.xyz
OAUTH_APP_REDIRECT_URIS=daymo://oauth,https://www.daymo.xyz/oauth,https://daymo.xyz/oauth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
MAIL_FROM=Daymo <no-reply@daymo.xyz>
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USERNAME=resend
SMTP_PASSWORD=
SMTP_STARTTLS=true
UPLOAD_ROOT=/srv/daymo/uploads
PHOTO_MAX_BYTES=20971520
PHOTO_SPACE_QUOTA_BYTES=1073741824
PHOTO_TOTAL_QUOTA_BYTES=10737418240
PHOTO_ACCEL_PREFIX=
```

백업용 `RESTIC_REPOSITORY`·`RESTIC_PASSWORD_FILE`·`RCLONE_CONFIG`는 API가 아니라 VPS의 systemd unit이 읽는다.

SQLAlchemy 접속 URL은 위 조각으로 코드에서 조립한다. 비밀번호가 든 완성 URL을 저장소, 로그, 오류 메시지에 남기지 않기 위해서다. `APP_ENV`가 `beta`나 `production`이면 `JWT_SIGNING_KEY`, `REFRESH_TOKEN_PEPPER`, `DB_PASSWORD`가 비어 있을 때 서버가 뜨지 않는다. 빈 서명 키로 조용히 뜨면 누구나 토큰을 위조할 수 있다.

`EXPO_PUBLIC_*` 값은 앱 번들에서 읽을 수 있으므로 비밀키를 넣지 않는다. DB 비밀번호, OAuth secret, JWT 키, 사진 URL 서명 키, restic 비밀번호와 rclone OAuth token은 VPS의 root 전용 env/config 파일 또는 CI secret으로 관리한다.

외부 공개 문의 주소는 `support@daymo.xyz`, Resend 자동 발신 주소는 `no-reply@daymo.xyz`로 분리한다. `support@daymo.xyz`의 수신 메일은 Daymo 전용 Google 계정으로 전달하며 개인 이메일 주소를 앱·스토어·정책 문서에 직접 노출하지 않는다.

## 5. OAuth 리디렉션

- 앱 스킴: `daymo://oauth`
- 개발: Expo development build의 리디렉션 URI 등록
- 운영: `daymo.xyz` 기반 iOS Universal Link와 Android App Link를 추가하고 스킴은 보조 수단으로 유지
- 제공자: Apple, Google, Kakao, Naver
- 서버가 authorization code를 교환하고 일회용 앱 로그인 코드를 발급한다. 앱은 코드를 PKCE verifier와 함께 API에 교환해 access/refresh token을 받는다(`backend/app/services/oauth/`).
- Authlib은 들이지 않았다. 네 provider가 주고받는 것이 주소 셋과 폼 몇 칸이라 httpx로 직접 부르고, id_token 검증과 Apple client secret 서명은 `pyjwt[crypto]`로 한다. provider token은 사람을 확인한 뒤 저장하지 않으므로 token 갱신은 필요 없다.

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
  ios/                       # prebuild 산출물, 커밋하지 않음
  android/                   # prebuild 산출물, 커밋하지 않음
  package.json
backend/
  pyproject.toml             # uv로 관리
  alembic.ini
  alembic/versions/
  app/
    main.py                  # FastAPI 앱
    api/v1/                  # 라우터
    core/                    # 설정, 보안, 의존성
    models/                  # SQLAlchemy 모델
    schemas/                 # Pydantic 스키마
    services/                # 도메인 로직
  tests/                     # pytest
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
- 사이트(`www.daymo.xyz`)와 그 아래 웹 빌드(`/app`)는 `node site/build.mjs` 뒤 `npx vercel deploy --prod --cwd site/dist`로 사람이 올린다. Git 연결 자동 배포는 쓰지 않는다
- 앱용 EAS Update는 이것과 분리한다
- staging 검증 후 EAS Build로 iOS TestFlight와 Android 비공개 테스트를 같은 release 단위로 병행
- EAS Update는 동일 native runtime의 JavaScript·스타일·이미지 수정에만 사용하고 내부 검증 후 단계적으로 확대
- native module, permission, app config, SDK/runtime 변경은 새 store binary로 배포

도메인은 가비아에서 사고 **권한 DNS는 Cloudflare가 맡는다.** 미니PC 단계에서 쓸 Cloudflare Tunnel이 자기 zone을 요구하므로 어차피 한 번은 옮겨야 하고, 레코드가 없는 지금이 가장 싸다. apex/`www`는 Vercel의 소개·약관·개인정보처리방침·계정 삭제 안내로 연결한다. `api`는 두 단계로 나뉜다. VPS 단계에서는 `api.daymo.xyz` A record를 VPS 공인 IPv4에 걸고 **proxy를 끈다(회색 구름).** 이름만 해석하고 트래픽은 Cloudflare를 지나지 않는다. 집 미니PC로 옮긴 뒤에는 Cloudflare Tunnel을 쓴다. 가정 회선은 인바운드 80/443이 막혀 있고 공인 IP도 고정이 아니라 A record를 걸 수 없기 때문이다(`06-vps-deployment.md` 11장). API HTTPS는 Nginx와 Let's Encrypt로 자동 발급·갱신한다. Vercel Hobby는 비상업 beta에만 사용하며 수익화 전에 당시 이용 조건을 다시 확인하고 부적합하면 정적 문서를 다른 host로 이전한다.
- 서버는 GitHub Actions에서 테스트·이미지 빌드 후 GHCR에 올리고, VPS가 고정 태그 이미지를 pull해 무중단에 가깝게 교체한다.

PR CI는 client `typecheck`·`lint`·unit test와 backend `pytest`·PostgreSQL 컨테이너 통합 test를 매번 실행한다. EAS iOS/Android native build는 일반 PR에서 실행하지 않고 beta 또는 production release candidate에서만 두 플랫폼을 같은 release 단위로 생성한다. Dependabot은 매주 client/server 의존성을 생태계별 묶음 PR로 만들며 자동 merge하지 않는다.

CI 최소 작업에서 client job의 working directory는 `mobile`, backend job은 `backend`로 고정한다.

1. `cd mobile && npm ci`
2. `cd mobile && npm run typecheck`
3. lint/format 검사
4. 단위 테스트
5. pytest와 Alembic migration 검증
6. Docker image build
7. Expo export 검증

현재 구현된 워크플로는 `.github/workflows/ci.yml` 하나이고 job이 둘이다. `main` push와 모든 pull request에서 돈다.

- `client`: `mobile`에서 `npm ci` → `typecheck` → `lint` → `test`. Node 버전은 루트 `.nvmrc`를 `actions/setup-node`의 `node-version-file`로 읽고 `mobile/package-lock.json` 기준으로 npm 캐시를 쓴다. 넷 다 실패하면 job이 실패한다
- `server`: `backend`에서 `uv sync --group dev --frozen` → `alembic upgrade head` → `pytest`. DB는 job의 `postgres:16` service 컨테이너이고 `DAYMO_REQUIRE_DB=1`이라 DB가 없으면 건너뛰지 않고 실패한다

위 목록의 6(Docker image build)과 7(Expo export 검증)은 아직 없다.

## 8. VPS 자원 예산

| 프로세스 | 메모리 목표/상한 |
| --- | --- |
| API (uvicorn 워커 2개) | 컨테이너 400MB |
| PostgreSQL | 컨테이너 800MB, `shared_buffers` 약 192MB |
| Nginx | 64MB 이하 |
| OS·Docker·여유 | 약 700MB |

JVM이 빠지면서 생긴 여유는 PostgreSQL(550 → 800MB, `shared_buffers` 128 → 192MB)과 OS 여유(500 → 700MB)에 나눠 줬다. 이것이 스택을 바꿔 실제로 얻는 몫이다.

- swap 2GB를 비상용으로 두되 지속적인 swap 사용은 장애 신호로 본다.
- uvicorn 워커는 vCPU 수에 맞춰 2개로 시작하고 API 포트는 `8000`이다.
- Actuator가 맡던 health check 자리는 FastAPI가 직접 제공하는 `GET /v1/health`가 대신한다. 대신 Actuator가 공짜로 주던 heap/GC/DB pool 지표는 없어진다. 지표가 필요해지면 그때 도구를 붙이며 지금은 미정으로 둔다.
- API와 DB 외에 상주형 서비스는 추가하지 않는다.
- 빌드는 VPS에서 하지 않고 CI에서 수행해 배포 중 메모리 부족을 막는다.

## 9. 사진 저장 결정

전송량은 무제한이 아니라 일 20GB(월 600GB)이고 초과분에는 구간 요금이 붙으므로 사진을 반복해서 내려받는 구간이 그대로 비용이 된다. 디스크 50GB에는 OS, Docker image, DB, 로그, 백업도 함께 들어간다. 사진 원본을 VPS 디스크에 장기 보관하면 저장 용량과 장애 복구가 여전히 위험하다.

- 결정: 초기 운영 원본은 iwinv VPS의 `/srv/daymo/uploads` private volume에 저장한다.
- 사진용 상한은 10GB로 두고 DB와 사진을 Google Drive에 자동 외부 백업한다. 장당 2MB 기준 약 5,000장이다. 사진은 기본 디스크의 `/srv/daymo/uploads`에 둔다.
- 백업은 폴더 mirror가 아니라 암호화·중복 제거·시점 복구가 가능한 restic snapshot을 rclone Google Drive backend로 전송한다.
- 업로드 전 앱에서 표시본을 압축하고 썸네일을 생성한다.
- 저장량과 복구 시간을 측정해 공개 규모가 커질 때만 S3 호환 외부 저장소 이전을 재검토한다.
