# 개발 착수 준비와 결정 기록

## 1. 감사 결론

현재 문서는 제품 도메인, REST API, 로컬 우선 동기화, VPS 운영과 출시 준수까지 큰 방향이 일관된다. 그러나 바로 기능 구현을 시작하면 식별자·도구 버전·인증·실시간 연결·사진 저장 결정을 중간에 다시 바꿀 가능성이 있다. 따라서 **0단계 기반 결정과 환경 고정 후 첫 수직 슬라이스를 시작**한다.

## 2. 현재 확인된 사실

| 항목 | 현재 상태 | 판정 |
| --- | --- | --- |
| UI | 10단계 검토 완료, 홈 지난 여행 추가 | 기준선 태그 필요 |
| 앱 구조 | `WarmAppShell.tsx`, `WarmTripDetail.tsx` 대형 로컬 상태 | 점진 분리 필요 |
| API/서버 | 문서만 존재 | Spring Boot 프로젝트 없음 |
| Node | v26.7.0 | 표준 LTS와 불일치 |
| Java | 없음 | JDK 21 설치 필요 |
| iOS ID | `com.anonymous.daymo` | 출시 ID 확정 필요 |
| Android ID | 없음 | 출시 ID 확정 필요 |
| 자동 검사 | `tsc`만 수동 실행 | lint/test/CI 필요 |
| npm audit | high 11, moderate 9 | 강제 수정 금지, SDK 호환 업그레이드 검증 |
| 개인정보/인프라 | 제공자와 운영자 정보 미확정 | 운영 데이터 사용 금지 |

## 3. 사용자 결정이 필요한 항목

결정은 한 번에 모두 요구하지 않고 해당 단계 직전에 2~3개 선택지와 영향을 제시한다.

### 개발 시작 전 P0

| ID | 결정 | 권장안 | 이유 |
| --- | --- | --- | --- |
| D-001 | 출시 앱 식별자 | **결정 완료: `com.hwangslater.daymo`** | iOS·Android에서 동일하게 사용 |
| D-002 | Node 기준 | **결정 완료: Node.js 24 LTS (`>=24 <25`)** | `.nvmrc`와 engines로 고정 |
| D-003 | Expo SDK | **결정 완료: 기능 개발 전 최신 안정판 업그레이드 검증** | 회귀가 크면 검증 커밋만 되돌리고 SDK 54 유지 |
| D-004 | 초기 가입 범위 | **결정 완료: 처음부터 공개 회원가입** | 여행 공간과 콘텐츠는 계속 초대 멤버에게만 비공개 |

### 인증·공간 전

| ID | 결정 | 권장안 |
| --- | --- | --- |
| D-005 | 첫 OAuth 범위 | Apple + Kakao 우선, Google/Naver 순차 추가 |
| D-006 | 타인 메모 삭제 | **결정 완료: owner와 editor 모두 가능**, viewer 불가·삭제 감사 로그 유지 |
| D-007 | 가입 연령 | **결정 완료: 만 14세 이상만 가입**, 생년월일 원본 미수집 |
| D-008 | 마지막 owner 탈퇴 | **결정 완료: 다른 멤버에게 owner 이전 후에만 허용**, 혼자면 공간 삭제 별도 진행 |
| D-008A | 운영 도메인 | **결정 완료: `daymo.xyz` 신규 구매 예정**, 등록·DNS 연결 대기 |
| D-008B | 인증 이메일 전송 | **결정 완료: Resend SMTP**, `no-reply@daymo.xyz`, STARTTLS 587 |

### 여행·콘텐츠 전

| ID | 결정 | 권장안 |
| --- | --- | --- |
| D-009 | 요리 탭 원본 | **결정 완료: `cookingEnabled`를 여행 설정으로 저장하고 숙소 주방 정보로 변경을 제안**, 자동 삭제·강제 숨김 없음 |
| D-010 | 재료↔준비물 완료 | **결정 완료: 상태 분리, 출처 연결 유지, 완료 시 반영 여부만 제안** |
| D-011 | 장소 일괄 교체 | 미리보기 후 서버 transaction, 온라인 전용 |
| D-012 | 실시간 방식 | sync API를 P0 기준, 검증된 경우에만 SSE 추가 |

### 사진·출시 전

| ID | 결정 | 권장안 |
| --- | --- | --- |
| D-013 | 사진 저장 | **결정 완료: ConoHa VPS private disk** |
| D-013B | 사진 외부 백업 | **결정 완료: Daymo 전용 Google 계정에 restic 암호화 snapshot 자동 백업** |
| D-014 | 원본 보관 | 표시본 기본, 사용자가 원본 보관을 선택 |
| D-015 | 무료 한도 | 파일럿 측정 후 확정, 서버에서 quota 강제 |
| D-016 | 운영 주체/처리 국가 | 실제 계약 정보 확인 후 정책 문서 반영 |

## 4. 문서에서 보완한 계약

- 홈 `recentCompletedTrips` 집계
- 비밀번호 재설정과 기기 session 관리
- OAuth 일회용 login code 교환, PKCE/state
- 알림 설정·push token과 마케팅 동의 분리
- 명시적 태그 생성·수정·삭제
- 일기 제목, 사진 표시본/checksum/status
- 기념 카드의 기기 렌더링 원칙
- 사진·일기를 포함한 통합 검색 유형
- 모바일 SSE용 일회용 ticket 및 polling fallback

## 5. 아직 코드로 만들지 않을 것

- Redis, Kafka, Elasticsearch, Kubernetes, 마이크로서비스
- 운영 규모가 확인되기 전의 복잡한 추천 알고리즘
- 사용자 확인 없는 GPT 자동 저장
- 현재 위치 권한과 상시 위치 수집
- 공개 커뮤니티, 결제와 광고
- 모든 동작의 무리한 오프라인 지원

## 6. 개발 0단계 실행 순서

### 0-A. 기준선 고정

1. 현재 `main`을 `ui-baseline-2026-08` 태그 후보로 검수
2. 홈·여행·상세·장소·준비·요리·기록·찾기·우리 화면 캡처
3. 모든 Pressable/버튼과 현재 더미 동작 목록 생성
4. UI 회귀 시나리오를 Maestro 초안으로 저장

### 0-B. 식별자와 환경

1. D-001~D-003 승인
2. Node LTS, npm, JDK 21, Android SDK 설치 확인
3. `.nvmrc`, `engines`, `.env.example` 작성
4. iOS bundle ID, Android package, 앱 링크 scheme 분리
5. dev/staging/prod API URL과 secret 주입 경계 설정

### 0-C. 저장소 구조

1. Expo Router를 별도 커밋으로 도입
2. UI를 변경하지 않고 route와 feature shell만 분리
3. `server/` Spring Boot modular monolith 생성
4. local PostgreSQL, Flyway V1, Testcontainers smoke test
5. OpenAPI 생성 결과를 앱 typed client로 만드는 방법 고정

### 0-D. 품질 게이트

1. npm `typecheck`, `lint`, `test`, `export` script
2. Gradle `test`, architecture test, migration test
3. GitHub Actions client/server job 분리
4. secret scan, dependency audit 결과 기록
5. iOS/Android development build smoke test

### 0-E. 로컬 우선 기술 검증

기능 전체를 만들기 전에 작은 spike로 다음만 증명한다.

1. SQLite 홈 snapshot을 앱 재실행 즉시 표시
2. mock API 변경분을 transaction으로 반영
3. SecureStore session 저장·삭제
4. 오프라인 outbox 한 건을 idempotency key로 한 번만 반영
5. 로그아웃 시 사용자/공간 namespace 삭제
6. foreground 복귀 시 sync 수행

## 7. 첫 수직 슬라이스

기반 공사 뒤 첫 기능은 `이메일 로그인 → 공간 하나 → 여행 생성 → 홈 표시 → 재실행 캐시`로 제한한다.

포함:

- 실제 user/space/trip PostgreSQL 저장
- access/refresh token과 자동 복원
- 여행 생성과 dashboard API
- SQLite snapshot과 ETag 또는 최소 sync cursor
- 홈 바로가기의 ID 기반 route
- 두 계정/여러 기능은 다음 슬라이스를 위한 구조만 보장

제외:

- OAuth, 초대, 실시간, 사진
- 지도 상세 경계 변경
- 준비·요리·기록 실제 저장

완료 조건:

1. 새 계정이 공간과 여행을 만들 수 있음
2. 앱을 종료하고 오프라인으로 다시 열어 마지막 홈이 즉시 보임
3. 서버 데이터 변경 후 foreground에서 갱신됨
4. 다른 공간 ID 직접 요청이 403/404로 차단됨
5. 로그인·여행 생성·홈 복원 E2E가 자동화됨
6. release build 기준 cold/warm start 측정값을 기록함

## 8. 구현 시 고정할 API 세부 규칙

- OpenAPI가 서버 계약의 기계 판독 기준이며 앱 타입을 수동 복제하지 않는다.
- 생성에는 `Idempotency-Key`, 모든 쓰기에는 `X-Client-Mutation-Id`를 사용한다.
- 공동 수정은 `version` 또는 HTTP conditional request 중 도메인별 하나로 통일한다.
- 날짜는 `LocalDate`, 순간은 UTC `Instant`, 표시 시간대는 공간 설정을 사용한다.
- 목록 cursor는 opaque하고 정렬 키와 필터를 서명된 값에 포함한다.
- 오류 `code`는 앱 분기용 안정 계약이고 `message`는 사용자 표시용으로 서버가 현지화 책임을 독점하지 않는다.
- 삭제 tombstone과 audit log의 보존 기간은 개인정보 정책과 함께 확정한다.
- 로그에는 본문, 이메일, 주소, 사진 URL과 token을 남기지 않는다.

## 9. 착수 게이트

다음 항목이 모두 충족되면 1단계 기능 개발을 시작한다.

- [x] D-001~D-004 승인 완료
- [ ] 기준선 commit/tag와 회귀 캡처 확보
- [ ] Node LTS와 JDK 21 설치 확인
- [ ] `npm ci`, iOS, Android, local server 실행 문서 검증
- [ ] 앱/서버 식별자와 dev 환경 변수 확정
- [ ] client/server CI 통과
- [ ] Flyway V1과 Testcontainers 통과
- [ ] SQLite·SecureStore·outbox spike 통과
- [ ] 운영 secret이나 실데이터가 저장소에 없음을 확인

## 10. 다음 사용자 승인 지점

첫 승인 요청에서는 아래 네 가지만 결정한다.

1. Node 24 LTS와 Expo 최신 안정 SDK 조합 검증 실행
2. 공개 가입에 사용할 이메일 발송 방식 결정
3. Google Drive 백업은 기존 Daymo 전용 계정 사용으로 확정

이 결정 전에는 서버나 라우터 코드를 생성하지 않고 문서와 환경 진단까지만 수행한다.
