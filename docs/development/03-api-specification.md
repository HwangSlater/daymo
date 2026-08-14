# API 명세서

## 1. 공통 규칙

- Base URL: `/v1`
- 본문: `application/json; charset=utf-8`
- 인증: `Authorization: Bearer <access_token>`
- ID: UUID 문자열
- 시간: ISO 8601 UTC (`2026-08-21T06:00:00Z`), 날짜는 `YYYY-MM-DD`
- 표시 시간대: 공간의 `timezone`, 기본 `Asia/Seoul`
- 페이지: `?limit=20&cursor=<opaque>`
- 쓰기 재시도: 생성/일괄 API는 `Idempotency-Key` 헤더 지원
- 동시 수정: `version`을 요청에 포함하고 성공 시 증가된 값을 반환
- 삭제: `204 No Content`; 복구 가능한 데이터는 soft delete
- 캐시 가능한 GET은 `ETag`, `Cache-Control: private`, `Last-Modified`를 반환
- 클라이언트는 `If-None-Match`를 보내고 변경이 없으면 서버는 body 없는 `304` 반환
- JSON 응답은 Nginx에서 gzip 압축하며 HTTPS를 사용
- `X-Client-Mutation-Id`는 기기에서 생성한 UUID로, 동일 쓰기의 중복 처리를 막음

성공 응답:

```json
{ "data": {}, "meta": { "requestId": "uuid" } }
```

목록 응답:

```json
{
  "data": [],
  "meta": { "nextCursor": null, "hasMore": false, "requestId": "uuid" }
}
```

오류 응답:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력 내용을 확인해 주세요.",
    "fields": { "startDate": "종료일보다 늦을 수 없습니다." },
    "requestId": "uuid"
  }
}
```

주요 오류 코드는 `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`, `NOT_FOUND(404)`, `VERSION_CONFLICT(409)`, `TAG_IN_USE(409)`, `SYNC_CURSOR_EXPIRED(410)`, `VALIDATION_ERROR(422)`, `PHOTO_TOO_LARGE(413)`, `STORAGE_QUOTA_EXCEEDED(413)`, `RATE_LIMITED(429)`다.

### 캐시 유효성 기본값

| API | 기기 캐시 | 백그라운드 재검증 |
| --- | --- | --- |
| `/me`, 공간/멤버 | SQLite 24시간 | 앱 시작 및 우리 탭 진입 |
| dashboard | SQLite 10분 | 홈 진입과 앱 활성화 |
| 여행 목록/지역/캘린더 | SQLite 1시간 | 여행 탭 진입 |
| 여행 상세 하위 데이터 | SQLite, 만료로 삭제하지 않음 | 상세 진입과 SSE 이벤트 |
| 검색 결과 | 메모리 5분 | 같은 검색어 재요청 시 |
| 사진 썸네일 | 파일 캐시 30일/LRU | URL 만료 또는 파일 없음 |
| 사진 원본 | 기본 미보관 | 사용자 열기/저장 시 요청 |

TTL은 데이터를 화면에서 지우는 시간이 아니라 재검증 주기다. 만료된 캐시도 화면에 먼저 표시할 수 있고, 권한 상실·로그아웃 시 해당 공간 캐시를 즉시 제거한다.

## 2. 인증과 프로필

| Method | Path | 용도 |
| --- | --- | --- |
| POST | `/auth/signup` | 이메일 회원가입 |
| POST | `/auth/email-verifications` | 가입 이메일 인증 링크 발송/재전송 |
| POST | `/auth/email-verifications/confirm` | 링크의 일회용 token으로 이메일 확인 |
| POST | `/auth/login` | 이메일 로그인 |
| POST | `/auth/logout` | 현재 세션 종료 |
| POST | `/auth/refresh` | 세션 갱신 |
| POST | `/auth/password/forgot` | 30분·1회용 비밀번호 재설정 링크 요청 |
| POST | `/auth/password/reset` | 링크 token으로 비밀번호 변경·기존 세션 종료 |
| GET | `/auth/sessions` | 로그인된 기기/세션 목록 |
| DELETE | `/auth/sessions/{sessionId}` | 특정 기기 세션 폐기 |
| GET | `/auth/oauth/{provider}/start` | OAuth 시작 (`apple/google/kakao/naver`) |
| GET | `/auth/oauth/{provider}/callback` | code 교환 후 앱으로 복귀 |
| POST | `/auth/oauth/exchange` | 일회용 앱 로그인 code를 session token으로 교환 |
| GET | `/me/auth-methods` | 연결된 이메일·OAuth 로그인 방식 조회 |
| POST | `/me/auth-methods/{provider}/link` | 재인증 후 provider 연결 시작 |
| DELETE | `/me/auth-methods/{provider}` | provider 연결 해제, 마지막 수단은 차단 |
| GET | `/me` | 내 프로필·참여 공간 목록 |
| PATCH | `/me` | 이름/프로필 사진 수정 |
| DELETE | `/me` | 7일 유예 계정 삭제 요청 |
| POST | `/me/deletion/cancel` | 유예기간 안에 재인증 후 삭제 취소 |
| GET | `/me/deletion` | 삭제 상태와 최종 삭제 예정일 조회 |
| GET | `/legal/documents?context=signup` | 현재 약관/고지와 필수·선택 구분 |
| POST | `/legal/acceptances` | 문서 version별 동의/확인 기록 |
| GET | `/me/legal-acceptances` | 내 동의 내역 |
| DELETE | `/me/legal-acceptances/{type}` | 선택 동의 철회 |
| POST | `/me/privacy-requests` | 열람·정정·삭제·처리정지 요청 |
| GET | `/me/privacy-requests/{requestId}` | 요청 처리 상태 |
| POST | `/me/data-exports` | 내 데이터 비동기 export 요청 |
| GET | `/me/data-exports/{exportId}` | 생성 상태·만료 시각 조회 |
| GET | `/me/data-exports/{exportId}/download` | 24시간·1회용 token으로 다운로드 |
| POST | `/privacy/photo-requests` | 비회원 포함 사진 등장 당사자의 삭제·처리정지 요청 |
| POST | `/reports` | 사용자 또는 콘텐츠 신고 |
| GET | `/me/reports` | 내가 제출한 신고와 처리 상태 |
| POST | `/reports/{reportId}/appeals` | 결과 통지 후 14일 이내 이의 제기 |
| GET/POST | `/me/blocks` | 차단 사용자 목록/추가 |
| DELETE | `/me/blocks/{blockedUserId}` | 사용자 차단 해제 |

`POST /auth/signup`

```json
{ "email": "sky@example.com", "password": "minimum-8", "displayName": "하늘" }
```

공개 가입에서는 이메일 인증 전 계정의 여행 공간 생성과 초대 참여를 허용하지 않는다. 가입·인증 재전송·로그인·비밀번호 재설정에는 IP, 계정, installation 단위 rate limit을 적용하고 응답으로 계정 존재 여부를 노출하지 않는다. 자동 가입이 관찰되면 서버가 발급한 bot challenge token을 요구할 수 있게 하되 특정 CAPTCHA 공급자는 운영 단계에서 결정한다.

비밀번호는 8~128자이며 영문·숫자·특수문자 조합을 강제하지 않는다. Unicode와 내부 공백을 허용하고 NFC 정규화 후 길이를 검사한다. 흔한·유출된 비밀번호와 정규화한 이메일 전체와 동일한 값은 `PASSWORD_TOO_COMMON`으로 거부하되 세부 차단 목록은 응답에 노출하지 않는다. 클라이언트는 붙여넣기·OS Password AutoFill을 막지 않고 사용자에게는 기본 안내를 `8자 이상 입력해 주세요`로 표시한다.

가입 이메일에는 `https://daymo.xyz/auth/verify-email?token=...` 형식의 인증 링크를 보낸다. token은 원문을 저장하지 않고 hash와 30분 만료 시각만 저장하며 성공 시 즉시 폐기한다. 링크의 최초 GET은 메일 보안 스캐너의 자동 방문에 대비해 인증 상태를 변경하지 않는다. Universal Link/App Link로 앱이 열리거나 웹 완료 화면이 로드된 뒤 클라이언트가 token을 `POST /auth/email-verifications/confirm`으로 보내 인증을 완료한다. 앱이 없거나 연결에 실패해도 웹에서 완료할 수 있고, 앱은 다음 활성화 때 인증 상태를 다시 조회한다.

재전송하면 이전 미사용 token을 모두 폐기하고 새 링크만 유효하게 한다. 만료·이미 사용·교체된 token은 같은 일반 오류 화면을 보여주고 재전송 동작을 제공한다. 인증 완료 여부와 관계없이 발송 API 응답은 계정 존재를 노출하지 않는다.

비밀번호 재설정도 `https://daymo.xyz/auth/reset-password?token=...` 형식의 30분·1회용 링크로 제공한다. token 원문은 저장하지 않으며 새 링크 발급 시 기존 미사용 token을 모두 폐기한다. 링크의 GET은 상태를 변경하지 않고 앱 또는 웹의 새 비밀번호 화면이 `POST /auth/password/reset`을 호출한다. 새 비밀번호에는 가입과 같은 규칙을 적용하고, 성공 transaction에서 해당 사용자의 모든 refresh token과 로그인 세션을 폐기한 뒤 다시 로그인하도록 안내한다. 요청·응답과 오류 화면은 계정 존재 여부를 노출하지 않는다.

로그인과 refresh 응답의 access token은 15분 유효하다. refresh token은 마지막 사용 후 90일의 sliding expiration을 적용하고 매 refresh마다 회전한다. 서버에는 token hash만 저장하며 교체된 token 재사용을 감지하면 같은 token family의 세션을 모두 폐기한다. 앱은 401 응답을 받으면 동시 refresh 요청을 하나로 합치고, 성공 시 원래 요청을 한 번만 재시도한다. refresh 실패 시 로컬 공동 데이터는 즉시 삭제하지 않고 잠근 뒤 재로그인을 안내한다.

계정당 활성 기기 세션은 최대 5개다. 여섯 번째 기기 로그인 transaction에서 가장 오래 사용하지 않은 다른 기기의 refresh token family와 push token을 폐기한다. 로그인 응답의 `evictedSession`에는 민감정보 없이 기기 표시 이름과 마지막 사용 시각만 포함하고, 앱은 `오래 사용하지 않은 기기에서 로그아웃했어요` 안내를 보여준다. 사용자는 `/auth/sessions`에서 현재 기기를 구분해 다른 세션을 직접 종료할 수 있다.

계정 삭제, 이메일·비밀번호 변경, 인증 provider 연결·해제 API는 일반 access token 외에 작업별 1회용 `reauthProof`를 요구한다. 이메일 계정은 현재 비밀번호로, OAuth 계정은 provider 재로그인으로 proof를 발급한다. proof는 작업 종류·대상 user·nonce에 묶고 짧게 만료시키며 한 번 사용하면 폐기한다. 직전에 다른 민감 작업을 인증했더라도 새 작업에는 새 proof가 필요하다. 공간 삭제는 이 재인증 대상에서 제외하고 별도의 이중 확인 규칙을 적용한다.

실제 가입 요청은 클라이언트가 임의 문구를 보내지 않고 서버가 발급한 문서 version을 참조한다.

```json
{
  "email": "sky@example.com",
  "password": "minimum-8",
  "displayName": "하늘",
  "legalAcceptances": [
    { "documentId": "terms-v1-uuid", "accepted": true },
    { "documentId": "privacy-notice-v1-uuid", "accepted": true },
    { "documentId": "marketing-v1-uuid", "accepted": false }
  ],
  "ageEligibilityConfirmed": true
}
```

내 데이터 export는 계정·프로필, 약관/동의 이력, 공간 참여 이력, 사용자가 직접 작성한 메모·일기 등 구조화 JSON/CSV와 사용자가 직접 올린 사진 원본을 archive로 생성한다. 다른 멤버가 작성한 콘텐츠 본문과 사진 원본은 포함하지 않는다. 같은 사용자의 진행 중 job은 하나로 합치며 앱을 닫아도 서버에서 계속 처리한다.

완료 시 앱 내 상태와 이메일로 알리되 archive를 첨부하지 않는다. 다운로드는 인증 session과 별도 1회용 token을 함께 요구하고 token hash만 저장한다. 준비 후 24시간 또는 최초 정상 다운로드 즉시 archive와 token을 폐기한다. 파일 시스템 경로와 private 사진 URL은 export에 포함하지 않는다.

사용자·콘텐츠의 더보기 메뉴에는 `신고`와 `차단`을 별도 문구로 제공한다. 신고는 사유와 선택 설명을 받아 운영 검토 queue에 넣고, 같은 대상의 반복 제출은 idempotent하게 합치되 신고자에게 접수 번호를 반환한다. 신고자의 신원은 신고 대상과 공간 멤버에게 공개하지 않는다.

접수 API는 즉시 `receivedAt`, `status=received`, `reviewDueAt`을 반환하며 최초 검토 목표는 접수 후 24시간 이내다. 사진 무단 노출, 구체적 위협, 아동 안전처럼 긴급 사유는 운영 검토 전에도 대상 콘텐츠를 `restricted`로 임시 제한할 수 있다. 운영자 알림에는 신고 ID·유형·긴급도·기한만 넣고 신고 설명 원문이나 사진을 이메일·푸시에 첨부하지 않는다. 처리 결과와 이의 제기 방법은 `/me/reports`에서 확인하고 필요한 경우 이메일로도 알린다.

처리 결과 통지에는 `appealDeadline`을 포함하고 14일 안에 한 번 이의를 제기할 수 있다. 원 처리자와 다른 관리자가 있으면 우선 배정하고, 초기 개인 운영에서는 동일 관리자가 재검토하더라도 이의 사유와 판단 근거를 별도 감사 로그로 남긴다. 이의 기간이 지났으면 `409 APPEAL_PERIOD_EXPIRED`를 반환한다.

신고 기록은 `resolvedAt`부터 1년, 관리자 감사 로그는 생성일부터 2년 보관한다. 법적 분쟁·수사 협조 등 별도 보존 근거가 기록된 항목을 제외하고 만료 작업에서 자동 파기하며 deletion ledger를 남긴다. 운영 알림은 긴급 신고를 즉시 전달하고 일반 신고는 1시간 단위 요약으로 보내되, 두 알림 모두 신고 본문·사진·요청자 개인정보를 포함하지 않는다.

차단하면 두 사용자 사이의 새 초대 생성·수락, 새 공간 동시 합류와 직접 관련 알림을 서버에서 차단한다. 이미 같은 공간의 membership과 공동 콘텐츠를 자동 삭제하거나 일부만 숨기지 않으며, 차단한 사용자에게 `공간 나가기` 또는 `owner에게 내보내기 요청`을 안내한다. 차단 해제 전에는 상대가 보낸 초대 token도 수락할 수 없다.

메모·일기·장소 설명·요리·기타 사용자 입력과 외부 URL은 저장 전에 서버의 versioned moderation rule을 통과한다. 명백한 불법·위협 패턴, 허용하지 않는 URL scheme과 확인된 위험 domain은 `CONTENT_NOT_ALLOWED`로 거부하고 사용자가 수정할 수 있는 일반 안내만 반환한다. 애매한 단어 하나만으로 차단하지 않으며 운영자가 rule version과 오탐을 추적한다. 거부된 원문 전체는 애플리케이션 로그에 남기지 않는다.

사진은 초기 버전에서 외부 이미지 moderation API로 보내지 않는다. 업로드 전 이용규칙과 신고 가능성을 안내하고 초대 공간 안에서만 제공하며, 신고된 사진은 긴급도에 따라 즉시 `restricted` 처리한다. 공개 피드나 익명 탐색을 추가하거나 실제 악용·스토어 심사 요구가 생기면 외부 전송의 동의·처리 국가·보유기간과 기기/VPS 성능을 다시 승인한 뒤 자동 이미지 판별을 도입한다.

관리자 웹은 일반 `/v1` 사용자 세션을 받지 않고 별도 `/admin` 인증·권한 경계를 사용한다. 관리자 공개 가입과 일반 OAuth 자동 가입은 없으며 사전에 허용된 계정과 MFA가 모두 확인되어야 한다. 최소 API는 신고 queue/상세 조회, 콘텐츠 임시 제한·복원, 7일 삭제 전환, 사용자 제재와 처리 결과 기록이다. 원본 사진 열람은 신고 처리에 필요한 명시적 동작에서만 허용하고 모든 접근 사유를 `admin_audit_logs`에 남긴다. 관리자 응답은 검색 엔진 cache 금지와 짧은 session timeout을 적용한다.

관리자 MFA는 인증 앱의 RFC 6238 TOTP 6자리 코드를 사용한다. 비밀번호 확인 뒤 TOTP를 별도 검증하고 성공 전에는 moderation session을 발급하지 않는다. TOTP secret은 별도 server key로 암호화하고 key version을 저장하며 로그·응답·백업 점검 출력에 평문을 남기지 않는다. 등록 시 일회용 복구 코드 10개를 발급해 hash만 저장하고 사용 즉시 폐기한다. TOTP·복구 코드 실패에는 관리자 계정과 IP 기준 rate limit, 지연과 보안 로그를 적용한다.

관리자 session은 마지막 서버 측 조작 시각부터 1시간의 inactivity timeout을 적용한다. 만료 후 화면은 즉시 잠기며 처리 중인 서버 변경을 자동 제출하지 않고, 다시 비밀번호를 받지 않더라도 최소 TOTP 재확인을 거쳐 새 session을 발급한다. 일반 사용자 refresh token과 공유하지 않는다.

OAuth callback은 access/refresh token을 URL query에 넣지 않는다. 서버가 1분 이내 만료되고 한 번만 쓸 수 있는 `loginCode`를 앱 링크로 돌려주고 앱은 `/auth/oauth/exchange`로 session token을 교환한다. provider 시작 요청에는 앱이 만든 `state`와 PKCE challenge를 사용한다.

provider가 반환한 이메일이 기존 계정과 같아도 자동 병합하지 않는다. 서버는 `ACCOUNT_LINK_REQUIRED`와 짧게 유효한 연결 context를 반환하고, 사용자가 기존 계정으로 재인증한 뒤에만 provider subject를 연결한다.

- 서비스 이용약관 동의와 개인정보 처리 관련 고지/동의는 문서 종류와 법적 근거를 구분한다.
- 계약 이행에 필요한 개인정보까지 관행적으로 모두 ‘필수 동의’로 만들지 않는다.
- 마케팅, 선택 분석, 선택 프로필 등은 각각 선택 가능하고 거부해도 핵심 기능을 사용할 수 있어야 한다.
- 필수 문서의 중요한 변경은 재동의 또는 재확인을 요구하고 단순 문구 수정은 변경 공지로 처리한다.
- 시스템 사진/카메라 권한은 이 API 동의와 별개이며 실제 기능을 누른 시점에 OS prompt를 요청한다.

`GET /me` 핵심 응답:

```json
{
  "data": {
    "id": "uuid",
    "displayName": "하늘",
    "avatarUrl": null,
    "spaces": [{ "id": "uuid", "name": "주말 여행", "relationshipType": "friends", "role": "owner" }]
  }
}
```

## 3. 공간과 멤버

| Method | Path | 용도 |
| --- | --- | --- |
| POST | `/spaces` | 공간 생성 |
| GET | `/spaces/{spaceId}` | 공간/관계 정보 |
| PATCH | `/spaces/{spaceId}` | 이름·관계 정보 수정 |
| DELETE | `/spaces/{spaceId}` | 공간 삭제 요청 |
| POST | `/spaces/{spaceId}/restore` | 7일 유예 중 공간 복구 |
| GET | `/spaces/{spaceId}/members` | 멤버 목록 |
| PATCH | `/spaces/{spaceId}/members/{membershipId}` | 별명·권한 변경 |
| DELETE | `/spaces/{spaceId}/members/{membershipId}` | 내보내기/나가기 |
| POST | `/spaces/{spaceId}/invites` | 초대 링크 생성 |
| GET | `/spaces/{spaceId}/invites` | 활성 초대 링크 목록·사용 현황 |
| DELETE | `/spaces/{spaceId}/invites/{inviteId}` | 초대 링크 즉시 폐기 |
| POST | `/invites/{token}/accept` | 초대 참여 |

공간 생성 요청:

```json
{ "name": "주말 여행", "relationshipType": "friends", "startedOn": null, "timezone": "Asia/Seoul" }
```

멤버 삭제는 대상 이름과 영향을 확인하는 UI를 거친다. 마지막 owner는 다른 멤버에게 owner를 이전한 뒤에만 나갈 수 있다. 혼자 있는 공간은 단순 나가기를 제공하지 않고 별도의 공간 삭제 이중 확인을 거친다.

멤버가 스스로 나가면 membership만 비활성화하고 작성한 공동 일정·장소·준비·요리·기록·사진은 유지한다. 작성자 계정과 당시 표시 이름도 유지하되 나간 사용자는 이후 해당 공간 API와 사진 URL에 접근할 수 없다. 나가기 확인 화면에는 본인이 올린 사진 수와 `내 사진 검토` 진입점을 제공하며 삭제는 사용자의 선택이다. 나가기 성공 시 해당 사용자의 그 공간 SSE ticket, pending notification과 유효한 사진 URL을 폐기하고 앱은 로컬 공간 데이터를 제거한다.

owner가 멤버를 내보내면 같은 콘텐츠 유지 규칙을 적용하고 해당 membership, 공간 SSE ticket, pending notification과 사진 URL을 즉시 폐기한다. 요청 body에는 콘텐츠 일괄 삭제 옵션을 받지 않는다. 내보낸 사용자의 아직 전송되지 않은 mutation은 membership 재검증에서 거부하고, 앱이 다음 활성화·sync 때 해당 공간 snapshot과 사진 cache를 제거하도록 `MEMBERSHIP_REVOKED`를 반환한다.

공간 삭제 화면의 1단계에서는 owner가 현재 공간 이름을 정확히 입력해야 한다. 2단계에서는 삭제되는 범위, 모든 멤버에게 미치는 영향, 7일 복구 기한을 보여주고 `7일 후 삭제` 최종 버튼을 다시 눌러야 한다. API 요청은 `confirmationName`과 `impactAcknowledged: true`를 받고 서버가 owner 권한과 최신 공간 이름을 검증한다. 별도 계정 재인증은 요구하지 않는다. 요청 성공 즉시 모든 멤버의 일반 공간 목록, sync 응답, 알림 대상에서 숨기고 7일 뒤 최종 삭제를 예약한다. 유예기간에는 owner의 삭제 예정 공간 화면에서만 확인·복구할 수 있다. 복구하면 기존 membership과 콘텐츠를 그대로 되살리고, 7일이 지나면 복구 API는 `410 GONE`을 반환한다.

공간 정원은 owner를 포함해 최대 10명이다. 초대 링크는 생성 시점부터 7일간, 최대 10명까지 사용할 수 있다. 로그인과 이메일 인증을 마친 사용자는 별도 owner 승인 없이 즉시 참여하며 기본 권한은 `editor`다. 미로그인 사용자는 인증 완료 후 원래 초대 흐름으로 복귀한다. owner는 만료 전에도 링크를 폐기하거나 참여 후 멤버별 권한을 변경할 수 있다. 링크 원문은 생성 응답에서만 반환하고 서버에는 hash만 저장한다. 참여 API는 만료·폐기·사용 횟수와 공간 정원을 transaction 안에서 재검증하며 이미 참여한 사용자의 재요청은 중복 membership을 만들지 않는다. 정원이 찬 경우 `409 SPACE_MEMBER_LIMIT_REACHED`를 반환하되 초대 사용 횟수는 올리지 않는다.

```json
{}
```

초기 버전의 초대 생성 요청에서는 `role`을 받지 않고 서버가 `editor`로 고정한다. 이후 읽기 전용 공유가 필요해질 때 별도 정책과 UI를 검토한다.

참여 성공 전에는 공간 이름과 멤버 개인정보를 노출하지 않는다. 이미 해당 공간의 멤버라면 성공 응답과 함께 공간으로 이동하되 초대 사용 횟수는 올리지 않는다.

```json
{
  "id": "invite_01",
  "inviteUrl": "https://daymo.xyz/invites/one-time-token",
  "expiresAt": "2026-08-21T12:00:00Z",
  "maxUses": 10,
  "usedCount": 0
}
```

## 4. 홈과 여행 탐색

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `/spaces/{spaceId}/dashboard` | 홈 한 번에 조회 |
| GET | `/spaces/{spaceId}/trips` | 목록/캘린더용 여행 조회 |
| GET | `/spaces/{spaceId}/trip-regions` | 지도 지역별 여행 수 |
| POST | `/spaces/{spaceId}/trips` | 여행 생성 |
| GET | `/trips/{tripId}` | 여행 기본 정보 |
| PATCH | `/trips/{tripId}` | 여행 수정 |
| DELETE | `/trips/{tripId}` | 보관함 관리 메뉴에서 여행 삭제 요청 |
| POST | `/trips/{tripId}/archive` | 여행 보관 |
| POST | `/trips/{tripId}/unarchive` | 보관 해제 |
| POST | `/trips/{tripId}/restore` | 삭제 후 7일 이내 여행 복구 |

여행 목록 query: `status`, `from`, `to`, `regionCode`, `q`, `limit`, `cursor`, `sort`.

일반 여행 상세에는 삭제 동작을 노출하지 않고 `보관`만 제공한다. owner와 editor는 보관·보관 해제를 할 수 있다. 보관은 목록 정리 상태이므로 보관된 여행의 일정·장소·준비물·요리·기록·사진 CRUD API를 차단하지 않는다. 실제 삭제와 복구는 owner만 보관함의 관리 메뉴에서 수행할 수 있으며, 삭제 전에 영향 범위와 7일 복구 기한을 확인한다. 삭제된 여행은 일반 목록·검색·지도·캘린더·알림에서 즉시 제외하고 `status=trash` 관리 조회에서만 보여준다. 7일 안에 복구하면 기존 상태와 종속 콘텐츠를 되살리고, 권한이 없으면 `403 FORBIDDEN`, 기한이 지났으면 `410 GONE`을 반환한다.

여행 종료일이 공간 timezone의 오늘보다 이전이어도 서버가 자동 보관하지 않는다. 클라이언트는 지난 여행의 `여행` 탭 하위 일정·숙소·예약·교통·메모, `장소`, `요리` 쓰기 동작 전에 `지난 여행을 편집할까요?`를 확인한다. 동의 시 해당 여행·기기에 로컬 승인 시각을 저장해 10분간 재확인을 생략한다. `준비`, `기록`과 사진 추가·수정은 확인 대상이 아니다. API는 이 로컬 확인값을 신뢰하거나 요구하지 않고 기존 membership·version 규칙만 검증한다.

여행 생성 요청:

```json
{
  "title": "서울 구로구",
  "regionCode": "11",
  "regionName": "서울",
  "startDate": "2026-08-21",
  "endDate": "2026-08-23",
  "summary": "숙소에서 수다와 밀푀유나베",
  "cookingEnabled": true
}
```

서버는 여행과 기간 내 `trip_days`를 한 트랜잭션으로 생성한다. 종료일은 시작일보다 빠를 수 없으며 초기 최대 기간은 60일로 제한한다.

`cookingEnabled`는 요리 탭 표시의 서버 원본이다. 숙소의 `hasKitchen`이 `true`이고 탭이 꺼져 있으면 켜기를, `false`이고 탭이 켜져 있으면 끄기를 제안한다. 제안은 자동 적용하지 않으며 탭을 꺼도 기존 요리·재료를 삭제하지 않는다.

대시보드 응답:

```json
{
  "data": {
    "nextTrip": { "id": "uuid", "title": "서울 구로구", "startDate": "2026-08-21", "endDate": "2026-08-23" },
    "stay": { "name": "JS호텔", "checkInAt": "2026-08-21T06:00:00Z" },
    "counts": { "schedule": 3, "places": 8, "packingDone": 2, "packingTotal": 6 },
    "relationshipDay": null,
    "recentCompletedTrips": [
      { "id": "uuid", "title": "부산", "startDate": "2026-07-24", "endDate": "2026-07-26", "summary": "바다 산책과 단체 사진", "accentColor": "#19B6A3" }
    ]
  }
}
```

## 5. 일정·교통·숙소·예약

| Method | Path | 용도 |
| --- | --- | --- |
| GET/POST | `/trips/{tripId}/schedule-items` | 일정 목록/추가 |
| PATCH/DELETE | `/schedule-items/{itemId}` | 일정 수정/삭제 |
| POST | `/schedule-items/reorder` | 같은 날짜 안 정렬 |
| GET/POST | `/trips/{tripId}/transports` | 교통 목록/추가 |
| PATCH/DELETE | `/transports/{transportId}` | 교통 수정/삭제 |
| GET/POST | `/trips/{tripId}/stays` | 숙소 목록/등록 |
| PATCH/DELETE | `/stays/{stayId}` | 체크인·체크아웃/숙소 수정·삭제 |
| GET/POST | `/trips/{tripId}/reservations` | 예약 목록/추가 |
| PATCH/DELETE | `/reservations/{reservationId}` | 예약 수정/삭제 |

일정 추가 요청:

```json
{
  "tripDayId": "uuid",
  "startAt": "2026-08-21T03:30:00Z",
  "endAt": null,
  "title": "은행골에서 점심",
  "type": "meal",
  "note": "예약 확인",
  "tripPlaceId": "uuid",
  "version": 1
}
```

교통 요청은 `direction(outbound|return)`, `method`, 출발/도착 장소와 시각, `bookingStatus`를 가진다. 가는 편 생성 응답에는 오는 편 입력을 묻기 위한 `suggestReturn: true`를 포함할 수 있으나, 실제 알림창 표시는 클라이언트가 결정한다.

숙소 등록은 `tripPlace.category=lodging`인 장소만 허용한다. 체크아웃은 체크인 이후이며 여행 기간 바깥 값은 경고하되 사용자가 확정할 수 있다.

## 6. 장소와 태그

| Method | Path | 용도 |
| --- | --- | --- |
| GET/POST | `/trips/{tripId}/places` | 저장한 장소 목록/추가 |
| GET | `/trip-places/{tripPlaceId}` | 장소 상세 |
| PATCH/DELETE | `/trip-places/{tripPlaceId}` | 수정/삭제 |
| POST | `/trip-places/{tripPlaceId}/schedule` | 장소를 일정에 담기 |
| POST | `/trip-places/{tripPlaceId}/register-stay` | 숙소로 등록 |
| POST | `/places/resolve-external-link` | 선택적으로 단축 URL 확인/장소 정보 보강 |
| GET | `/spaces/{spaceId}/tags?scope={scope}` | 범위별 사용 중인 태그 (`place|packing|ingredient`) |
| POST | `/spaces/{spaceId}/tags` | 명시적으로 사용자 태그 생성 |
| PATCH | `/tags/{tagId}` | 태그 이름·색 수정 |
| DELETE | `/tags/{tagId}` | 사용 중이 아닌 태그 삭제 |

장소 추가 요청:

```json
{
  "name": "JS호텔",
  "area": "서울 구로구",
  "address": "서울 구로구 남부순환로105길 32",
  "category": "lodging",
  "tags": ["숙소 근처", "예약"],
  "externalLinks": [{ "provider": "naver_map", "url": "https://naver.me/FJOPOMvx" }]
}
```

공유 텍스트의 이름·주소·URL 파싱은 기기에서 먼저 수행하며 API를 호출하지 않는다. 단축 URL redirect나 외부 장소 정보 보강이 필요할 때만 다음 요청을 사용한다.

장소·준비물·재료 쓰기 요청의 `tags` 문자열은 서버가 공간과 scope 안에서 정규화해 기존 태그를 연결하거나 새 태그를 upsert한다. 명시적 태그 API는 이름·색 관리용이며 일반 추가 화면에서 태그 생성을 위해 별도 선행 호출하지 않는다.

```json
{ "provider": "naver_map", "url": "https://naver.me/FJOPOMvx" }
```

```json
{
  "data": {
    "provider": "naver_map",
    "resolvedUrl": "https://map.naver.com/...",
    "name": "JS호텔",
    "address": "서울 구로구 남부순환로105길 32 JS호텔",
    "suggestedCategory": "lodging",
    "confidence": 0.96
  }
}
```

외부 URL 확인이 실패해도 사용자가 기기에서 추출한 내용으로 저장할 수 있다. 자동 분류는 입력 폼의 제안일 뿐이며, 사용자가 `숙소`로 저장한 장소에만 숙소 등록 동작을 노출한다.

## 7. 준비물

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `/trips/{tripId}/checklist-items` | 준비물 조회/필터 |
| POST | `/trips/{tripId}/checklist-items` | 준비물 추가 |
| PATCH/DELETE | `/checklist-items/{itemId}` | 내용/담당/완료 수정, 삭제 |
| POST | `/checklist-items/bulk` | 일괄 추가·교체 |
| POST | `/checklist-items/{itemId}/complete` | 체크 |
| DELETE | `/checklist-items/{itemId}/complete` | 체크 해제 |
| POST | `/checklist-items/{itemId}/assign` | 멤버/공용/미정 담당 변경 |

```json
{
  "name": "충전기",
  "quantity": "2개",
  "ownerMembershipId": "uuid",
  "isShared": false,
  "tags": ["전자기기", "출발 전"]
}
```

완료 API 응답에는 `completedAt`, `completedBy`, 최신 `version`이 포함된다. 동일 여행에서 정규화한 이름과 담당이 같은 미완료 항목은 `duplicateCandidate`로 경고하되 저장을 막지 않는다.

일괄 API는 `mode=append|replace`를 명시한다. `replace`는 온라인 전용이며 현재 version, 삭제/추가 preview token과 확인용 idempotency key를 요구하고 전체를 한 transaction으로 처리한다. 행별 validation 오류가 하나라도 있으면 원본 목록을 변경하지 않는다.

## 8. 요리와 재료

| Method | Path | 용도 |
| --- | --- | --- |
| GET/POST | `/trips/{tripId}/recipes` | 요리 목록/추가 |
| GET/PATCH/DELETE | `/recipes/{recipeId}` | 요리 상세/수정/삭제 |
| POST | `/recipes/{recipeId}/ingredients` | 재료 추가 |
| PATCH/DELETE | `/ingredients/{ingredientId}` | 재료 수정/삭제 |
| POST | `/ingredients/to-checklist` | 선택 재료를 준비물로 추가 |

요리 요청:

```json
{
  "name": "밀푀유나베",
  "memo": "육수는 집에서 준비",
  "sourceUrl": "https://www.youtube.com/watch?v=...",
  "servings": 2,
  "ingredients": [
    { "name": "알배추", "quantity": "1통", "category": "채소", "procurement": "buy", "ownerMembershipId": null }
  ]
}
```

고정 텍스트 형식의 문법 분석과 미리보기는 기기에서 처리하고, 확인된 요리 목록만 일반/일괄 저장 API로 전송한다. 향후 AI 분석 API를 도입하더라도 원문과 분석 결과를 구분하며 자동 저장하지 않는다.

재료를 준비물로 가져오면 응답에 생성된 `checklistItemId`와 `sourceIngredientIds`를 반환한다. 재료와 준비물 완료 API는 서로를 자동 호출하지 않으며, 앱은 연결 정보를 이용해 다른 쪽 반영 여부를 확인한 뒤 사용자가 승인한 경우에만 별도 mutation을 보낸다.

## 9. 메모·사진·일기

| Method | Path | 용도 |
| --- | --- | --- |
| GET/POST | `/trips/{tripId}/memos` | 메모 목록/추가 |
| PATCH/DELETE | `/memos/{memoId}` | 메모 수정/삭제 |
| GET/POST | `/trips/{tripId}/diaries` | 일기 조회/작성 |
| PATCH/DELETE | `/diaries/{diaryId}` | 일기 수정/삭제 |
| POST | `/trips/{tripId}/photo-uploads` | 업로드 session 생성 |
| PUT | `/photo-uploads/{uploadId}/content` | 압축한 사진을 VPS로 stream 업로드 |
| POST | `/photo-uploads/{uploadId}/complete` | checksum 검증 후 사진 확정 |
| GET | `/trips/{tripId}/photos` | 사진 목록 |
| GET | `/spaces/{spaceId}/photo-storage` | 공간 사진 사용량·한도·정리용 집계 |
| PATCH/DELETE | `/photos/{photoId}` | 캡션/연결 수정, 삭제 |
| GET | `/trips/{tripId}/trash` | 7일 안의 삭제된 메모·사진 조회 |
| POST | `/trash/{targetType}/{targetId}/restore` | 항목 종류와 작성자에 따른 권한으로 복원 |
| GET | `/photos/{photoId}/content?variant=thumbnail|display|original` | 권한 검사 후 사진 응답 |
| GET | `/spaces/{spaceId}/stats` | 여행·지역·기록 통계 |

여행 기념 카드의 조합과 이미지 렌더링은 P1에서 기기 기능으로 처리하므로 별도 API를 두지 않는다. 카드에 사용한 사진은 기존 권한 있는 사진 조회 API로 받는다.

메모 생성:

```json
{ "body": "체크인 전에 장보기" }
```

메모 응답:

```json
{
  "data": {
    "id": "uuid",
    "body": "체크인 전에 장보기",
    "author": { "id": "uuid", "displayName": "하늘" },
    "createdAt": "2026-08-11T12:30:00Z",
    "editedAt": null,
    "version": 1,
    "permissions": { "canEdit": true, "canDelete": true }
  }
}
```

클라이언트는 `permissions`에 따라 수정·삭제를 표시한다. 삭제 응답 이후 목록과 상단 메모 개수/미리보기를 함께 갱신한다.

메모 삭제는 공간 owner와 editor에게 허용하며 viewer는 차단한다. 타인의 메모 삭제도 동일하게 허용하지만 서버는 `deletedBy`, `deletedAt`과 audit log를 남기고 기본 조회에서 제외한다.

메모와 사진은 삭제 후 7일간 휴지통에서 복원할 수 있다. 사진 업로더는 본인 사진의 설명과 날짜·장소·일정 연결을 수정하고 삭제·복구할 수 있다. owner는 공간의 모든 사진에 같은 권한을 가진다. 다른 editor는 타인이 올린 사진의 설명·연결을 수정하거나 삭제·복구할 수 없다. 사진 응답의 `permissions.canEdit`, `canDelete`, `canRestore`도 이 규칙을 반영하고 서버가 uploader/owner 권한을 매 요청마다 확인한다. 7일이 지나면 DB row와 사진 variant를 최종 삭제하고 삭제 ledger를 남겨 오래된 백업을 복원할 때 다시 노출되지 않게 한다.

사진에 등장한 당사자의 삭제·처리정지 요청이 접수되면 운영자가 대상과 요청자 확인에 필요한 최소 자료를 검토하고 사진을 `restricted`로 전환한다. 제한된 사진은 일반 목록·검색·통계·기념 카드와 모든 variant 다운로드에서 숨긴다. 업로더와 owner에게는 대상 사진, 임시 제한 사실, 이의 제기·처리 절차만 알리고 요청자의 연락처나 증빙을 공유하지 않는다. 확인 결과 삭제가 타당하면 기존 7일 삭제와 deletion ledger 절차로 전환하고, 확인되지 않거나 철회되면 audit log를 남긴 뒤 복원한다. 앱 API만으로 운영자 검토를 우회해 제한 상태를 해제할 수 없다.

사진 업로드 순서:

1. 앱에서 권한 확인, 선택/촬영, 원본 checksum·크기·MIME 확인
2. `photo-uploads`에서 최대 크기·MIME·checksum과 임시 upload ID 확정
3. `content` 요청 body를 JVM 메모리에 적재하지 않고 임시 파일로 stream 저장
4. `complete`에 크기, MIME, 촬영일과 연결 대상을 전달
5. 서버가 실제 signature·checksum을 검증한 뒤 private volume으로 원자 이동하고 Photo 생성
6. thumbnail/display variant 생성 작업은 동시 실행 수를 1로 제한

초기 업로드 제한:

- 이미지 원본 1개 최대 20MB
- 공간별 원본·표시본·썸네일 합계 최대 1GB
- VPS 사진 volume 전체 30GB
- 동영상과 움직이는 사진 원본은 미지원

앱은 선택 직후 예상 크기를 안내하지만 서버가 실제 byte와 quota를 최종 검증한다. 공간 사용량이 80%에 도달하면 사진 화면과 업로드 완료 화면에서 한 번 사전 경고하고, 100%에 도달하면 기존 사진의 조회·다운로드·삭제·복구는 유지한 채 새 업로드만 차단한다. 서버와 앱은 원본·표시본·썸네일을 자동 압축하거나 자동 삭제하지 않는다.

저장 공간 관리 화면은 전체 사용량, 남은 용량, 여행별 사용량과 큰 사진 순서를 보여준다. 일반 멤버는 본인이 올린 사진만 정리할 수 있고 owner는 공간 전체 사진을 관리할 수 있다. 서버 전체 30GB 한도 접근은 운영 경고 대상이며 사용자의 기존 사진을 임의로 지우지 않고 신규 업로드 제한과 용량 증설·이관으로 대응한다.

다운로드는 파일 시스템 경로를 공개하지 않는다. Spring Security가 사용자의 공간 membership을 확인한 뒤 Nginx `X-Accel-Redirect` 또는 제한된 내부 경로로 파일을 전달한다. Range 요청과 적절한 private cache header를 지원한다.

## 10. 통합 검색과 실시간 이벤트

`GET /spaces/{spaceId}/search?q=은행골&types=trip,place,schedule,recipe,packing,diary,photo,memo&limit=20`

결과 공통 형태:

```json
{
  "type": "place",
  "id": "uuid",
  "tripId": "uuid",
  "title": "은행골",
  "subtitle": "서울 구로구 · 식당",
  "matchedText": "은행골 일요일 예약",
  "destination": "places"
}
```

`GET /spaces/{spaceId}/events`는 인증된 SSE 연결이다. 이벤트에는 `entity`, `entityId`, `tripId`, `operation`, `updatedAt`만 담고 상세 데이터는 권한이 적용된 API로 다시 조회한다. 모바일 백그라운드에서는 연결 유지를 보장하지 않고 앱 활성화 시 갱신한다.

모바일 SSE 구현이 표준 `EventSource`에서 Bearer header를 안정적으로 전달하지 못하는 경우를 대비해 `POST /spaces/{spaceId}/events/ticket`에서 60초 이내 만료되는 1회용 연결 ticket을 발급한다. 장기 access token을 URL에 넣지 않는다. SSE는 변경 신호일 뿐 데이터 원본이 아니며 수신 뒤 증분 sync 또는 대상 GET으로 최신 상태를 확인한다. 연결이 불안정하면 foreground polling으로 자동 전환한다.

## 11. 알림 설정과 기기

| Method | Path | 용도 |
| --- | --- | --- |
| GET/PATCH | `/me/notification-preferences` | 초대 참여·담당 변경·여행 임박·마케팅 알림 설정 |
| POST | `/me/devices/push-token` | 현재 설치의 push token 등록/갱신 |
| DELETE | `/me/devices/{deviceId}/push-token` | 로그아웃 또는 권한 해제 시 token 폐기 |

OS 알림 권한 요청 전 설명, 권한 상태 확인과 설정 앱 이동은 기기에서 처리한다. 마케팅 수신 동의와 서비스 동작 알림 설정은 법적 의미가 다르므로 한 필드로 합치지 않는다.

첫 출시의 서비스 푸시는 다음 세 종류로 제한하며 각 항목을 개별로 끌 수 있다.

- 내가 소유한 공간에 새 멤버가 초대로 참여했을 때
- 준비물 또는 요리 재료의 담당자가 나로 지정되거나 다른 사람으로 변경되었을 때
- 참여 중인 여행이 임박했을 때

일정·장소·준비물·요리·메모의 일반적인 추가와 수정은 푸시하지 않고 증분 sync 및 앱 내 최신 상태로 보여준다. 행위자 본인에게는 자신의 변경으로 발생한 푸시를 보내지 않으며, 하나의 변경에서 같은 사용자·기기로 중복 발송하지 않는다.

여행 임박 알림은 공간의 timezone을 기준으로 출발 7일 전과 1일 전, 사용자 현지 시각 오전 9시에 각각 한 번 보낸다. 여행 생성 또는 날짜 변경 시 이미 지난 알림은 소급 발송하지 않고 아직 남은 알림만 예약한다. 여행이 취소·삭제되거나 시작일이 바뀌면 기존 작업은 무효화하며, `(tripId, userId, reminderType, startDate)`를 idempotency key로 사용해 중복 발송을 막는다.

## 12. 증분 동기화 API

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `/spaces/{spaceId}/sync?cursor=` | cursor 이후 공동 데이터 변경/삭제 수신 |
| POST | `/spaces/{spaceId}/sync/mutations` | 안전한 pending mutation 일괄 전송 |
| GET | `/spaces/{spaceId}/sync/bootstrap` | 최초 또는 cursor 만료 시 압축 snapshot |

증분 조회 응답:

```json
{
  "data": {
    "changes": [
      { "entity": "checklistItem", "operation": "upsert", "id": "uuid", "version": 4, "payload": { "name": "충전기", "completedAt": null } },
      { "entity": "memo", "operation": "delete", "id": "uuid", "deletedAt": "2026-08-12T03:10:00Z" }
    ],
    "nextCursor": "opaque-signed-cursor",
    "hasMore": false,
    "serverTime": "2026-08-12T03:11:00Z"
  }
}
```

- cursor는 시각 문자열이 아니라 서버가 발급한 opaque 값이다.
- 변경이 많으면 `hasMore=true`로 여러 번 받고 마지막 응답의 cursor만 확정 저장한다.
- 삭제 tombstone은 모든 활성 기기가 받을 기간 동안 보관한다. cursor가 보존 기간보다 오래되면 `410 SYNC_CURSOR_EXPIRED`를 반환하고 bootstrap을 다시 받는다.
- 응답 payload는 화면에 필요한 동기화 필드만 담으며 사진 binary와 지도 path를 포함하지 않는다.

pending mutation 요청:

```json
{
  "deviceId": "installation-uuid",
  "mutations": [
    {
      "mutationId": "uuid",
      "entity": "checklistItem",
      "operation": "complete",
      "entityId": "uuid",
      "baseVersion": 3,
      "payload": { "completed": true },
      "clientOccurredAt": "2026-08-12T03:09:00Z"
    }
  ]
}
```

각 결과는 `applied`, `duplicate`, `conflict`, `rejected` 중 하나다. 체크처럼 의도를 재적용할 수 있는 동작은 최신 version에 반영할 수 있고, 메모 본문 수정처럼 덮어쓰기가 위험한 동작은 `conflict`와 서버 최신본을 반환한다.

오프라인 큐 허용:

- 허용: 새 준비물/장소/메모 추가, 체크 상태 지정, 담당 지정, 개인이 작성한 내용 수정
- 온라인 권장: 일정 순서 변경, 많은 항목 일괄 추가
- 온라인 필수: 삭제, 목록 교체, 멤버 내보내기, 권한/공간 변경, 계정 탈퇴

## 13. 사진 전송 최적화

사진 응답은 권한이 필요한 `thumbnailUrl`, `displayUrl`, `originalUrl`, 각 byte 크기와 checksum을 분리한다. Daymo에 추가가 완료된 사진은 원본을 반드시 보유한다.

- 목록: 320~480px 썸네일만 요청
- 전체 화면: 기기 화면에 맞는 1280~1920px 표시본 요청
- 원본: 사용자가 확대하거나 기기에 저장할 때만 다운로드 요청
- 업로드: 선택한 원본을 VPS에 저장하고 서버 작업이 표시본·썸네일을 생성. 완료 전에는 `uploading` 상태 표시
- HTTP range, immutable file key와 기기 파일 캐시를 사용
- 사진 업로드 네트워크 기본값은 `Wi-Fi 및 모바일 데이터`이며 사진 추가 후 원본까지 즉시 전송한다. 설정에서 `Wi-Fi에서만 업로드`를 고르면 모바일 데이터에서는 원본을 기기 내 영속 대기열에 보관하고 Wi-Fi 연결 및 OS 실행 기회가 생길 때 자동 재개한다. 사진마다 선택을 다시 묻지 않으며 대기 개수·용량, 실패 상태와 `모바일 데이터로 지금 업로드` 동작만 제공한다. 원본 자동 다운로드는 하지 않고 낮은 품질 썸네일을 우선한다.
