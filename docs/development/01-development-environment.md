# 개발 환경

## 1. 현재 클라이언트 기준

| 항목 | 현재 버전/설정 |
| --- | --- |
| Node.js | 20 LTS 권장 |
| npm | Node 20에 포함된 버전, `package-lock.json` 고정 |
| Expo | SDK 54 |
| React Native | 0.81.4 |
| React | 19.1.0 |
| TypeScript | 5.9.x |
| iOS | Xcode 최신 안정 버전, CocoaPods, iOS Simulator |
| Android | Android Studio, SDK 35 이상, JDK 17 |
| Web | Expo Web. 피드백용 모바일 폭 프리뷰이며 정식 웹 제품은 후순위 |

의존성 설치는 반드시 저장소 루트에서 실행한다.

```bash
npm ci
npm run ios
npm run android
npm run web
npx tsc --noEmit
```

네이티브 의존성을 추가할 때는 Expo 호환 버전을 위해 `npm install`보다 `npx expo install <package>`를 우선한다.

## 2. 도입할 개발 도구

### P0

- Expo Router: 화면별 파일과 딥링크 구조
- Supabase JS: Auth, PostgreSQL, Storage, Realtime
- TanStack Query: 서버 캐시, 재시도, 낙관적 업데이트
- Zustand: 작성 중인 폼과 화면 전용 상태
- React Hook Form + Zod: 폼 검증과 API 스키마 공유
- AsyncStorage: 비민감 설정과 마지막 조회 캐시
- SecureStore: 세션 토큰
- Expo Image Picker/Camera/Image Manipulator: 사진 선택·촬영·압축
- Expo Linking: 네이버·카카오·웹 지도 링크
- Jest + React Native Testing Library: 단위·컴포넌트 테스트
- Maestro: 실제 기기 흐름 E2E

패키지는 한 단계씩 추가하고 Expo SDK 54 호환성을 확인한다. 라우터 도입은 현재 단일 화면 파일을 기능별로 분리하는 작업과 함께 진행한다.

## 3. 백엔드 환경

초기 권장안은 Supabase다. 소규모 공동 앱에 필요한 인증, PostgreSQL, 행 단위 권한, 실시간 이벤트, 파일 저장을 한 환경에서 제공한다.

| 환경 | 용도 | 데이터 |
| --- | --- | --- |
| local | 개발자 PC, 마이그레이션/테스트 | 가명 시드 데이터만 |
| staging | TestFlight·내부 테스트 | 테스트 계정과 가명 데이터 |
| production | 실제 사용자 | 운영 데이터 |

필수 도구:

```bash
npx supabase init
npx supabase start
npx supabase db reset
npx supabase gen types typescript --local
```

Supabase CLI는 Docker Desktop을 사용한다. 스키마 변경은 대시보드에서 직접 수정하지 않고 `supabase/migrations/`에 SQL로 남긴다.

## 4. 환경 변수

저장소에는 `.env.example`만 커밋하고 실제 값은 커밋하지 않는다.

```dotenv
EXPO_PUBLIC_APP_ENV=local
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:54321/functions/v1/api
EXPO_PUBLIC_SENTRY_DSN=

# OAuth는 서버/배포 환경의 secret으로만 관리
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
```

`EXPO_PUBLIC_*` 값은 앱 번들에서 읽을 수 있으므로 비밀키를 넣지 않는다. OAuth secret, service-role key, 서명 키는 Supabase secret 또는 CI secret으로만 보관한다.

## 5. OAuth 리디렉션

- 앱 스킴: `daymo://oauth`
- 개발: Expo development build의 리디렉션 URI 등록
- 운영: iOS Universal Link와 Android App Link를 추가하고 스킴은 보조 수단으로 유지
- 제공자: Apple, Google, Kakao, Naver
- 로그인 완료 후 URL query에 이메일을 직접 전달하는 현재 데모 방식은 폐기한다. 서버가 authorization code를 교환하고 Supabase 세션을 발급해야 한다.

## 6. 권장 프로젝트 구조

```text
app/                         # Expo Router routes
src/
  components/                # 공통 UI
  features/
    auth/ spaces/ trips/ places/ schedule/
    packing/ cooking/ memos/ memories/ search/
  lib/                       # supabase, query client, logger, links
  store/                     # UI/작성 중 상태
  theme/                     # 색상 토큰
  types/                     # 생성된 DB 타입과 API 타입
supabase/
  migrations/
  seed.sql
  functions/api/
docs/development/
```

현재 `WarmAppShell.tsx`, `WarmTripDetail.tsx`는 UI 기준본으로 유지하면서, 각 개발 단계에서 화면 단위로 `features/`에 옮긴다. 한 번에 전면 재작성하지 않는다.

## 7. Git과 배포

- `main`: 항상 실행 가능
- 기능 브랜치: `feat/<domain>-<short-name>`
- 커밋: 스키마, API, UI 연결, 테스트를 의미 단위로 분리
- DB 마이그레이션은 되돌리기 SQL 또는 전진 수정 계획을 PR에 기록
- UI 피드백용 Vercel Preview와 앱용 EAS Update를 분리
- staging 검증 후 EAS Build로 TestFlight/Android Internal Testing 배포

CI 최소 작업:

1. `npm ci`
2. `npx tsc --noEmit`
3. lint/format 검사
4. 단위 테스트
5. Supabase migration/RLS 테스트
6. Expo export 검증
