# 품질·운영 기준

## 1. 성능 예산

사용자가 가장 중요하게 본 조건은 앱 실행과 지도 클릭의 지연이 짧은 것이다.

| 항목 | 목표 |
| --- | --- |
| warm start에서 기존 홈 표시 | 1초 이내 |
| cold start에서 사용 가능한 홈 | 중급 기기 기준 2초 이내 |
| 탭 전환 피드백 | 100ms 이내 |
| 캐시된 목록 표시 | 300ms 이내 |
| API p95 | 일반 조회 500ms, 쓰기 800ms 이내 |
| 앱 JS bundle | 단계별 측정, 기능 추가 전후 증가량 기록 |
| 사진 업로드 | 백그라운드 진행 표시, 화면 조작을 막지 않음 |
| 대형 목록 | 300개 항목에서 스크롤 프레임 저하가 체감되지 않음 |
| 변경 없는 홈 재검증 | `304`, 응답 body 0 |
| 일반 증분 동기화 | 압축 후 100KB 이하 목표 |

측정은 개발 모드가 아니라 release build에서 iPhone SE급과 중급 Android 실기기로 수행한다. 지도 path와 앱 아이콘은 로컬 asset으로 유지하고, 첫 화면에서 사진 원본·전체 여행 상세를 미리 받지 않는다.

## 2. 테스트 전략

### 단위 테스트

- 여행 기간/달력 연결 범위와 시간대
- 연애 시작일 N일 계산
- 네이버·카카오 공유 텍스트 파서
- URL provider 판별과 안전한 외부 열기
- 태그 정규화와 미사용 태그 정리
- 준비물 중복 후보, 진행률, 담당 표시
- 요리 재료→준비물 변환
- 권한과 `permissions.canEdit/canDelete`
- sync cursor 저장/재개, tombstone, idempotency, 충돌 병합
- 사진 캐시 LRU와 Wi-Fi/데이터 절약 정책
- 기본 전체 네트워크 업로드, Wi-Fi 전용 대기열의 앱 재실행 후 복원·자동 재개·수동 셀룰러 전송 테스트
- 로컬 필터·달력·진행률 계산이 네트워크를 호출하지 않는지 검증

### DB/API 권한 테스트

- 다른 공간의 모든 row 조회·수정 차단
- viewer 쓰기 차단, editor 공간 관리 차단
- 마지막 owner 탈퇴 차단
- 하위 ID를 바꿔 다른 여행에 연결하는 공격 차단
- soft-deleted 데이터 기본 조회 제외
- service-role 전용 함수의 클라이언트 호출 차단

### 통합/E2E

1. 회원가입→공간 생성→초대→두 번째 계정 참여
   - 동시 초대 참여에서도 owner 포함 10명 정원을 넘지 않고 실패 요청이 링크 사용 횟수를 소비하지 않는지 확인
   - 멤버 나가기 전 본인 사진 검토, 공동 콘텐츠 유지, 나간 뒤 API·사진·로컬 cache 접근 차단 확인
   - owner의 멤버 내보내기 후 콘텐츠 유지, API·SSE·사진·pending mutation 즉시 차단 확인
   - 사용자·콘텐츠 신고의 신고자 비공개, 차단 후 새 초대·합류·알림 차단과 기존 공간 무손실 확인
   - 신고 즉시 접수·24시간 review due 계산, 긴급 콘텐츠 임시 제한과 민감정보 없는 운영 알림 확인
   - 금지 문구·위험 scheme/domain 거부, 한글 오탐, rule version 회귀와 거부 원문 로그 미기록 확인
   - 일반 사용자 session의 `/admin` 차단, 관리자 allowlist·MFA·권한별 원본 접근과 감사 로그 확인
   - TOTP 시간 오차·재사용·rate limit, 복구 코드 1회 사용, secret 암호화와 key rotation 테스트
   - 관리자 1시간 inactivity timeout, 만료 후 TOTP 재확인과 미완료 처리 자동 제출 금지 테스트
   - 신고 결과 14일 이의 제기 경계값, 신고 1년·감사 로그 2년 purge와 legal hold 제외 테스트
   - 긴급 신고 즉시·일반 신고 1시간 요약 알림의 중복 방지와 민감정보 미포함 확인
2. 여행 생성→홈/지도/캘린더 확인
   - owner/editor의 여행 보관·해제와 보관 중 편집, owner만 가능한 삭제·복구, 일반 조회 제외, 7일 만료 후 purge 확인
   - 지난 여행 자동 보관 없음, 여행·장소·요리만 편집 확인, 여행/기기별 10분 유예와 준비·기록·사진 제외 확인
3. 네이버 지도 공유 텍스트로 장소 자동 채우기→숙소 등록→체크인 설정→일정 담기
4. 준비물 추가→담당 변경→다른 기기 체크
5. 요리 추가→재료를 준비물로 가져오기
6. 메모 추가→수정→삭제, 권한별 버튼 확인
7. 사진 촬영/선택→업로드 실패→재시도→삭제
   - 업로더의 본인 사진과 owner의 전체 사진 삭제·복구 허용, 다른 editor의 타인 사진 요청 차단
   - 사진 설명·날짜·장소·일정 연결도 업로더 본인 사진과 owner 전체 사진만 수정 가능한지 확인
   - 공간 사진 80% 경고·100% 신규 업로드 차단과 기존 사진 무변경, 역할별 저장 공간 관리 범위 확인
   - 사진 당사자 요청의 임시 숨김, 모든 variant 차단, 업로더/owner 최소 알림, 삭제 전환·복원과 audit log 확인
8. 통합 검색→정확한 여행 상세 탭 이동
9. 라이트/다크와 4개 테마, 큰 글자 크기 점검
10. 오프라인에서 체크→재실행→재연결→두 기기 동일 결과 확인
11. 오래된 cursor 만료→bootstrap 복구, 로그아웃→기기 공동 캐시 삭제
12. 선택 동의 거부 상태 가입, 철회, 처리방침 version 변경, 탈퇴 후 데이터 제거
13. 내 데이터 export 범위, 다른 멤버 콘텐츠 제외, 앱 종료 후 생성, 24시간·1회 다운로드와 만료 archive 삭제

### 계약·마이그레이션 테스트

- Spring OpenAPI 생성물이 변경되면 앱 typed client 생성 diff를 함께 검토
- 문서의 요청·응답 example을 OpenAPI validation test로 실행
- 모든 Flyway migration을 빈 DB와 직전 production snapshot 구조에 각각 적용
- migration 이후 앱의 최소 지원 schema/version이 bootstrap 가능한지 확인
- dashboard 집계와 원본 테이블의 일정·장소·준비·지난 여행 수가 일치하는지 검증
- bulk append/replace가 부분 성공 없이 원자적으로 처리되는지 검증

## 3. 접근성

- 누를 수 있는 영역은 가능하면 44×44pt 이상
- 색만으로 상태를 구분하지 않고 문구/형태를 함께 사용
- 라이트/다크 모두 WCAG AA 수준의 본문 대비 목표
- 화면 읽기 순서, 버튼 역할, 상태와 접근성 라벨 제공
- 시스템 글자 확대에서 잘림 대신 줄바꿈 또는 레이아웃 전환
- 모달 열림 시 포커스 이동, 닫힘 시 원래 버튼으로 복귀
- 완료 체크는 진동만으로 알리지 않음

## 4. 보안과 개인정보

- access token은 SecureStore, 일반 설정만 AsyncStorage
- 공동 데이터 SQLite는 OS sandbox에 두고 로그아웃/공간 권한 상실 시 제거
- 비밀번호와 OAuth secret은 앱 코드/로그에 저장하지 않음
- 비밀번호 8~128자, Unicode/NFC, 공백, 자동완성·붙여넣기, 흔한·유출 비밀번호 차단 경계값 테스트
- Argon2id 비용은 운영 VPS에서 부하 테스트하고 OWASP 최소 기준보다 낮추지 않으며 로그인 rate limit과 함께 검증
- 이메일 인증 링크의 30분 만료·1회 사용·재전송 시 이전 token 폐기와 앱/웹 fallback 테스트
- 메일 보안 스캐너의 GET 요청만으로 이메일 인증이 완료되지 않는지 테스트
- 비밀번호 재설정 링크의 30분 만료·1회 사용·계정 비노출·성공 후 전체 세션 폐기 테스트
- access token 15분 만료, refresh token 90일 sliding expiration·회전·재사용 탐지와 동시 refresh 단일화 테스트
- 계정 삭제·로그인 정보 변경의 작업별 1회용 재인증 proof, 교차 작업·재사용·만료 거부 테스트
- 공간 삭제의 공간 이름 입력·영향 재확인·owner 권한 검증과 우회 요청 거부 테스트
- 5개 활성 기기 한도, 여섯 번째 로그인 시 최장 미사용 세션·push token 폐기와 현재 기기 보호 테스트
- 모든 endpoint에서 공간 membership을 확인하고 repository query에도 공간 범위를 포함
- 초대 token은 원문 저장 없이 hash와 만료 시각 저장
- 외부 URL은 `https`와 허용 scheme을 검사한 뒤 열기
- 업로드 파일 MIME, signature, 크기를 서버에서 재검증
- 사진 EXIF GPS는 명시적 동의 없으면 제거
- 로그에 이메일, 메모 본문, 주소, 서명 URL을 기록하지 않음
- 계정 탈퇴와 공간 삭제 시 7일 유예기간, 최종 삭제 예정 시각, 복구 가능 여부를 사용자에게 표시
- 공간 삭제 요청 즉시 일반 조회·동기화·알림에서 제외되고, 유예기간 복구 및 만료 후 purge가 정상 동작하는지 테스트
- 초대 참여·담당 변경·여행 임박 알림의 수신 설정, 행위자 제외, 중복 발송 방지 테스트
- 여행 시작일·timezone 변경 시 D-7/D-1 알림 재예약, 지난 알림 미발송, 취소된 여행 알림 제거 테스트
- 운영 DB에는 주민등록번호를 수집하지 않고 생년월일도 연령 제한에 꼭 필요하지 않으면 수집하지 않음
- 개인정보 처리방침과 동의문은 실제 코드·SDK·로그·백업·스토리지 흐름과 일치해야 함

## 5. 관측과 장애 처리

- Sentry: crash, unhandled rejection, 최소 화면/API breadcrumb. 개인정보는 scrub하고 행동 분석에는 사용하지 않음
- 첫 출시에는 화면 조회·버튼 클릭을 수집하는 제3자 행동 분석 SDK를 넣지 않음
- Sentry event는 가명 설치 ID만 사용하고 30일 후 만료; 계정 ID·이메일·본문·사진 경로 미수집
- 잠금화면 push에 여행·멤버·장소·준비물 상세가 없고 앱 진입 후 membership 재검증
- 생체 앱 잠금 opt-in/off 기본값, 실패·미등록·기기 변경 fallback과 서버 재인증 분리 테스트
- 백그라운드 59초/60초 경계, 앱 재시작, OS 암호 fallback, app switcher cover와 스크린샷 허용 테스트
- 서버: request ID, actor ID hash, endpoint, status, latency만 구조화 로그
- 지표: 로그인 성공률, API p95, 앱 시작 시간, 사진 실패율, 동기화 충돌률
- 데이터 지표: endpoint별 압축 응답 byte, 304 비율, sync 변경 개수, 사진 품질별 전송량
- 알림: 인증 장애, 5xx 급증, DB/Storage 용량, 백업 실패
- 치명적 장애는 Daymo 운영 이메일로 즉시 알리고, 비치명적 경고와 회복 내역은 일일 요약으로 제공
- 운영 moderation queue의 24시간 검토 기한 접근·초과, 긴급 신고 미처리 알림
- 사용자 오류는 ‘무엇이 실패했는지’와 ‘다시 시도/임시 저장’ 행동을 함께 제공
- 로그인 불가나 장기 장애에는 앱 로그인 전 공지와 공개 상태 페이지를 함께 갱신
- UptimeRobot 외부 monitor가 `/health`를 5분마다 확인하며, 공개 상태 페이지에는 현재 장애만 표시하고 과거 장애 이력은 공개하지 않음

## 6. 백업과 복구

- production PostgreSQL dump와 사진을 매일 04:00 Asia/Seoul에 외부 restic snapshot으로 백업
- Storage 파일과 DB 메타데이터의 불일치를 주기적으로 검사
- soft delete 보존 기간 동안 관리자 복구 가능
- 일간 14개·주간 8개·월간 6개 snapshot 보존
- 백업 job이 한 번이라도 실패하거나 무결성 확인이 실패하면 즉시 운영 이메일 알림
- 매월 격리된 임시 container에서 DB와 임의 사진을 자동 표본 복원하고, 분기마다 빈 local/staging 환경에서 전체 수동 복원 훈련
- schema를 변경하는 모든 배포 직전에 DB snapshot 생성과 성공 여부 확인
- migration은 expand-contract로 나누고, 컬럼·테이블 삭제 같은 contract 단계는 이전 앱·서버가 더는 사용하지 않는 것이 확인된 후 별도 release에서 수행
- readiness/smoke test 실패 시 이전 commit SHA image로 자동 롤백하며, 운영자가 실행할 수 있는 수동 롤백 명령도 유지

## 7. 출시 체크리스트

- [ ] iOS/Android 앱 ID와 서명 인증서 확정
- [ ] local과 VPS beta→production 설정·secret 분리, 동일 VPS에서 두 JVM/DB 동시 상시 운영 금지
- [ ] SSH key 전용·root 원격 로그인 차단·제한된 deploy 계정과 sudo allowlist 확인
- [ ] GitHub Environment Secrets와 VPS root 전용 secret 파일의 권한·노출 여부 확인
- [ ] OS security update 자동 설치와 재부팅 필요 알림 확인
- [ ] OAuth 제공자별 운영 redirect 검증
- [ ] 개인정보 처리방침·이용약관·계정 삭제 URL 공개
- [ ] 개인정보 항목/목적/근거/보유기간/위탁/국외 이전/파기/권리행사 표 검토
- [ ] 선택 동의가 기본 해제이며 거부해도 가입 가능한지 확인
- [ ] ConoHa와 모든 외부 서비스의 처리 국가/재위탁자 확인
- [ ] 앱 내 개인정보 처리방침과 스토어 URL이 같은 최신 version인지 확인
- [ ] 카메라·사진 권한 목적 문구 검토
- [ ] API 권한/IDOR와 사진 접근 정책 자동 테스트 통과
- [ ] 실제 두 계정 공동 편집 1주 파일럿
- [ ] 저속/오프라인/서버 오류 점검
- [ ] 앱 시작과 목록/사진 성능 예산 통과
- [ ] 백업·복구와 장애 연락 경로 확인
- [ ] TestFlight/Android 내부 테스트 승인
- [ ] iOS·Android 동일 release 기능과 API 호환성 확인
- [ ] OTA runtime 일치, 내부 검증, 단계적 확대와 중단 절차 확인
- [ ] 최소 지원 버전·feature flag가 서버 장애 시 안전한 기본값을 사용하는지 확인

## 8. 단계별 품질 게이트

| 게이트 | 필수 조건 |
| --- | --- |
| 로컬 커밋 | typecheck, lint, 관련 단위 테스트, diff check |
| 기능 단계 완료 | iOS/Android smoke, API/DB 테스트, UI 회귀, 오프라인/오류 상태 |
| staging | migration rehearsal, 두 계정 E2E, 성능 예산, 로그 PII 점검 |
| production 후보 | 보안·백업 복원·스토어/법률 체크리스트와 release build 실기기 검수 |

베타는 공개 가입과 실사용 데이터 유지를 선택했으므로 staging 표기가 있어도 production 개인정보·보안 기준을 적용한다. production 전환 전에 DB·사진 전체 snapshot과 실제 복원 검증을 완료하며 데이터 초기화는 하지 않는다.

pull request가 필수 CI를 통과해 `main`에 merge되면 자동 production 배포한다. typecheck·test·backend test·migration 검증·image build 중 하나라도 실패하면 merge와 배포를 막는다. 배포 후 readiness와 smoke test가 실패하면 이전 commit SHA image로 자동 복귀하고 경고를 보낸다. schema 변경은 이전/신규 image가 함께 읽을 수 있는 expand-contract 방식만 허용한다.

`main`은 보호 브랜치로 설정한다. 직접 push를 막고 pull request에서 필수 CI를 통과해야 merge할 수 있게 한다. 관리자 우회도 비상 장애 대응 외에는 사용하지 않으며, 우회한 경우 사유를 운영 기록에 남긴다.

1인 개발 단계에서는 사람의 별도 승인을 요구하지 않고 required status check만 요구한다. 병합 방식은 squash merge로 고정해 PR 하나를 `main`의 커밋 하나로 남긴다. production 배포는 동시에 하나만 실행하며, 실행 중인 배포는 중단하지 않고 최신 대기 배포만 남긴다. 롤백은 이전 server image로만 수행하고 DB down migration은 실행하지 않는다.

앱 beta는 iOS TestFlight와 Android 비공개 테스트를 병행한다. OTA는 native runtime이 같은 JavaScript·asset 변경만 내부 대상에서 먼저 확인한 뒤 단계적으로 확대하며, native 변경은 store binary로 출시한다. 강제 업데이트는 보안 사고나 API 호환 단절처럼 구버전 사용이 안전하지 않을 때만 사용한다. 위험 기능은 서버 feature flag로 일부 대상부터 공개하고 장애 시 원격으로 끌 수 있게 한다.

단계적 공개는 내부 대상 → 10% → 50% → 100% 순서로 진행하고 각 단계에서 crash·로그인·핵심 API·동기화 지표를 확인한다. OTA 이상이 발견되면 즉시 확대를 멈추고 이전 정상 OTA로 복귀한다. 치명적 서버 장애는 운영자에게 즉시 이메일로 전달하며, 사용자 영향이 지속되면 앱 공지와 상태 페이지로 알린다.

상태 감시는 UptimeRobot 무료 plan만 사용한다. 외부에서 5분마다 확인하고 장애·복구 이메일을 받으며, 상태 페이지는 UptimeRobot 제공 URL을 사용해 VPS 전체 장애 중에도 열리게 한다. 유료 plan과 custom domain은 운영 계획에 포함하지 않고 `status.daymo.xyz`도 만들지 않는다. 사용자는 현재 장애와 복구 여부만 확인하며 최근 90일 같은 공개 incident history는 제공하지 않는다. 내부 운영 기록은 별도 보존 정책에 따라 유지한다.

의존성 감사의 취약점 개수만으로 강제 업그레이드하지 않는다. 실제 앱 번들/개발 도구 노출 여부, 공식 호환 버전, exploit 가능성과 업데이트 위험을 기록하고 높은 위험은 출시 전에 해결하거나 명시적으로 수용한다.
