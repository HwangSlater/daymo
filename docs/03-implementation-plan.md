# Daymo 구현 계획 요약

> 이 문서는 최초 기획에서 현재 UI 기준 개발 계획으로 갱신되었다. 상세 기준은 [`development/`](./development/README.md)에 있다.

## 1. 현재 상태

- Expo SDK 54, React Native, TypeScript 기반 iOS/Android UI 프로토타입
- 홈, 여행 목록/지도/캘린더, 찾기, 우리 공간 관리 UI
- 여행 상세의 여행·장소·준비·요리·기록 탭과 추가/수정 폼
- 테마와 시스템 다크모드
- 데이터와 로그인은 대부분 컴포넌트 로컬 상태와 가명 시드
- Vercel은 모바일 UI 피드백용이며 실제 앱 배포는 EAS를 사용

## 2. 개발 목표

현재 UI를 실제 공동 여행 서비스로 전환한다. 가장 중요한 기준은 다음과 같다.

1. 앱 시작 시 캐시된 홈을 즉시 보여주고 네트워크 갱신은 뒤에서 수행한다.
2. 공간과 여행을 데이터/권한 경계로 사용한다.
3. 일정·장소·준비·요리·메모·사진을 긴 텍스트가 아닌 연결 가능한 데이터로 저장한다.
4. 두 명 이상이 동시에 체크·담당 변경·메모 작성해도 결과가 일치해야 한다.
5. UI 변경과 서버 연결을 한꺼번에 하지 않고 기능별로 검증한다.
6. 개인 UI 상태와 초안은 기기에만 저장하고, 공동 데이터는 서버 원본 + SQLite 증분 캐시로 운영한다.

## 3. 확정된 화면 구조

- 하단: `홈 · 여행 · 찾기 · 우리`
- 여행 탐색: `목록 · 지도 · 캘린더`
- 여행 상세: `여행 · 장소 · 준비 · 요리 · 기록`
- 여행 탭: 일정, 숙소, 예약, 교통
- 장소 탭: 후보 수집, 태그/상태, 지도 링크, 일정·숙소 등록
- 준비 탭: 공용/멤버 담당, 태그, 남음/완료, 복사/붙여넣기
- 요리 탭: 여러 요리, 재료, 담당·구매, 준비물 연결, 출처 링크
- 기록 탭: 사진, 일기, 회고/통계
- 상단 메모지: 공동 여행 메모 CRUD

## 4. 권장 기술 구조

- 클라이언트: Expo Router, TanStack Query, Zustand, React Hook Form, Zod
- 백엔드: Java 21 + Spring Boot 3.x 모놀리식 API
- 운영: ConoHa VPS 3Core/2GB/SSD 100GB, Nginx + Docker Compose
- 데이터: PostgreSQL + Flyway, 서비스 계층에서 공간별 권한 검증
- 인증: Spring Security, 이메일과 Apple/Google/Kakao/Naver OAuth, JWT/refresh token
- 서버 기능: 초대, 통합 검색, 일괄 가져오기, 사진 업로드 확정, SSE 동기화
- 검색: 초기 PostgreSQL FTS와 `pg_trgm`
- 앱 배포: EAS Build/Update, TestFlight, Android Internal Testing
- 사진: S3 호환 외부 스토리지 권장. VPS 로컬 저장은 제한된 알파에서만 사용
- 관측: Sentry, Spring Boot Actuator, 구조화 서버 로그
- 모바일 저장: SecureStore + AsyncStorage + SQLite + 파일 LRU 캐시
- 동기화: ETag/304, opaque sync cursor, tombstone, SSE, 제한된 pending mutation

Redis·Elasticsearch·Kafka·Kubernetes는 2GB VPS와 초기 규모에 불필요하므로 도입하지 않는다.

## 5. 개발 순서

1. 환경·제품 결정과 현재 UI 회귀 기준 고정
2. 라우팅, repository, query, CI 기반
3. 실제 인증과 프로필
4. 공간, 초대, 멤버, 권한, 공간 전환
5. 여행 CRUD, 홈, 목록/지도/캘린더
6. 일정, 숙소, 예약, 교통, 공동 메모
7. 장소, 태그, 지도 공유 붙여넣기
8. 준비물, 담당, 체크, 일괄 편집
9. 요리, 재료, 준비물 연결
10. 사진, 일기, 회고/통계
11. 통합 검색과 기존 공지 데이터 이관
12. 성능·접근성·보안·스토어 출시 안정화

각 단계는 실제 저장, 앱 재실행, 두 계정 동기화, 권한 테스트까지 통과해야 완료다. 상세 작업과 승인 지점은 [`04-implementation-roadmap.md`](./development/04-implementation-roadmap.md)를 따른다.

## 6. 상세 문서

- [개발 환경](./development/01-development-environment.md)
- [시스템·데이터 모델](./development/02-architecture-and-data-model.md)
- [API 명세](./development/03-api-specification.md)
- [단계별 로드맵](./development/04-implementation-roadmap.md)
- [품질·운영 기준](./development/05-quality-and-operations.md)
