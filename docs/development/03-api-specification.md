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
- 저장 시점: 요청 하나가 transaction 하나이고, 성공 응답(2xx)은 commit이 끝난 뒤에만 나간다. commit이 실패하면 `500 INTERNAL_ERROR`다(2026-09-15부터, `backend/app/api/deps.py`의 `SessionDepends`)
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

`details`는 앱이 다음 단계로 가는 데 값이 필요한 오류에만 붙는다. 지금은 `ACCOUNT_LINK_REQUIRED`의 `linkToken`·`provider`뿐이다.

주요 오류 코드는 `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`, `NOT_FOUND(404)`, `VERSION_CONFLICT(409)`, `TAG_IN_USE(409)`, `SETTLEMENT_IN_PROGRESS(409)`, `OWNER_TRANSFER_REQUIRED(409)`, `ACCOUNT_LINK_REQUIRED(409)`, `SPACE_MEMBER_LIMIT_REACHED(409)`, `EMAIL_NOT_VERIFIED(403)`, `SYNC_CURSOR_EXPIRED(410)`, `VALIDATION_ERROR(422)`, `PHOTO_TOO_LARGE(413)`, `STORAGE_QUOTA_EXCEEDED(413)`, `RATE_LIMITED(429)`다.

### 캐시 유효성 기본값

| API | 기기 캐시 | 백그라운드 재검증 |
| --- | --- | --- |
| `/me`, 공간/멤버 | SQLite 24시간 | 앱 시작 및 우리 탭 진입 |
| dashboard | SQLite 10분 | 홈 진입과 앱 활성화 |
| 여행 목록/지역/캘린더 | SQLite 1시간 | 여행 탭 진입 |
| 여행 상세 하위 데이터 | SQLite, 만료로 삭제하지 않음 | 상세 진입과 SSE 이벤트 |
| 검색 결과 | 메모리 5분 | 같은 검색어 재요청 시 |
| 사진 썸네일·표시본 | 파일 캐시, 앱 자체 용량·기간 상한 없음 | URL 만료·파일 없음·사용자 캐시 비우기 |
| 사진 원본 | 기본 미보관 | 사용자 열기/저장 시 요청 |

TTL은 데이터를 화면에서 지우는 시간이 아니라 재검증 주기다. 만료된 캐시도 화면에 먼저 표시할 수 있다. 명시적 로그아웃에서는 계정별 cache namespace를 잠가 유지하고 같은 계정 재인증 전에는 표시하지 않는다. 공간 권한 상실·계정 최종 삭제 때는 관련 cache와 pending mutation을 즉시 제거한다.

### 앱 호환성과 기능 설정

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `/app-config?platform=ios&appVersion=1.0.0&runtimeVersion=1` | 최소 지원 버전, 업데이트 안내와 공개 가능한 feature flag 조회 |

이 endpoint는 로그인 전에도 사용할 수 있고 5분 private cache와 ETag를 적용한다. 응답은 `minimumSupportedVersion`, `latestVersion`, `updateRequired`, `updateMessage`, `storeUrl`, `features`, `serviceNotice`, `statusPageUrl`을 포함한다. 강제 업데이트는 보안 또는 API 호환 불가 상황에서만 `updateRequired=true`로 설정한다. feature flag 조회 실패 시 앱은 마지막 정상 cache를 사용하고, cache도 없으면 위험 기능을 꺼 둔 안전한 기본값으로 시작한다. flag는 UI 노출과 점진적 공개에만 사용하며 서버 권한 검사를 대신하지 않는다.

위험 기능의 rollout은 가명 install ID를 안정적으로 bucket 처리해 내부 대상 → 10% → 50% → 100% 순서로 확대한다. 장애 중 `serviceNotice`는 로그인 전 화면에서도 간결한 영향 범위와 상태 페이지 이동을 제공하되 계정·여행 정보는 포함하지 않는다.

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
| GET | `/auth/oauth/providers` | 서버에 키가 들어가 켜진 provider 목록 |
| GET | `/auth/oauth/{provider}/start` | OAuth 시작 (`apple/google/kakao/naver`) |
| GET/POST | `/auth/oauth/{provider}/callback` | provider code 교환 후 앱으로 복귀 (Apple은 POST 폼) |
| POST | `/auth/oauth/exchange` | 일회용 앱 로그인 code를 session token으로 교환 |
| POST | `/auth/oauth/link` | 같은 이메일의 기존 계정 비밀번호로 확인하고 provider 연결 후 로그인 |
| GET | `/me/auth-methods` | 연결된 이메일·OAuth 로그인 방식 조회 |
| POST | `/me/auth-methods/{provider}/link` | 재인증 후 provider 연결 시작 |
| DELETE | `/me/auth-methods/{provider}` | provider 연결 해제, 마지막 수단은 차단 |
| GET | `/me` | 내 프로필·참여 공간 목록 |
| PATCH | `/me` | 이름/프로필 사진 수정 |
| POST | `/me/password` | 재인증 후 비밀번호 변경(소셜 전용 계정은 처음 설정)·다른 기기 세션 종료 |
| POST | `/me/email` | 재인증 후 새 주소로 30분·1회용 변경 확인 링크 발송 |
| GET/POST | `/auth/confirm-email-change` | 이메일 변경 링크 페이지(GET은 확인 버튼만, POST가 변경) |
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

공개 가입에서는 이메일 인증 전 계정의 여행 공간 생성과 초대 참여를 허용하지 않는다. 가입·인증 재전송·로그인·비밀번호 재설정에는 IP, 계정, installation 단위 rate limit을 적용하고 응답으로 계정 존재 여부를 노출하지 않는다. 정상 가입에는 CAPTCHA를 표시하지 않는다. 짧은 시간의 다계정 생성, 비정상 IP·installation 반복, 자동화된 요청 패턴처럼 위험 신호가 누적될 때만 서버가 bot challenge token을 요구한다. 특정 CAPTCHA 공급자는 실제 도입 직전에 개인정보 처리 국가·SDK 필요 여부와 비용을 다시 승인한다.

로그인 실패는 계정을 장시간 고정 잠금하지 않는다. 계정 hash와 IP를 함께 기준으로 15분 동안 5회 실패부터 점진적 지연을 적용하고 최대 15분의 일시 제한을 둔다. 성공하면 계정 기준 실패 상태를 초기화하되 공격 IP 제한은 별도로 유지한다. 오류 문구는 이메일 존재, 가입 방식, 잠금 기준을 드러내지 않고 `이메일 또는 비밀번호를 확인해 주세요`로 통일한다.

비밀번호는 8~128자이며 영문·숫자·특수문자 조합을 강제하지 않는다. Unicode와 내부 공백을 허용하고 NFC 정규화 후 길이를 검사한다. 흔한·유출된 비밀번호와 정규화한 이메일 전체와 동일한 값은 `PASSWORD_TOO_COMMON`으로 거부하되 세부 차단 목록은 응답에 노출하지 않는다. 클라이언트는 붙여넣기·OS Password AutoFill을 막지 않고 사용자에게는 기본 안내를 `8자 이상 입력해 주세요`로 표시한다.

가입 이메일에는 `https://api.daymo.xyz/auth/verify-email?token=...` 형식의 인증 링크를 보낸다. 2026-09-15부터 이 페이지는 API 서버가 HTML로 직접 보여 준다(`backend/app/api/auth_pages.py`). 웹 앱 배포와 CORS 없이 동작하게 하려는 것이고, 앱 바로 열기(Universal Link/App Link)는 나중에 `daymo.xyz`에서 따로 붙인다. 이메일 확인은 로그인 조건이 아니다. 확인 전에도 로그인할 수 있고, 초대 참여처럼 이메일 소유가 필요한 곳에서 확인 여부를 본다. token은 원문을 저장하지 않고 hash와 30분 만료 시각만 저장하며 성공 시 즉시 폐기한다. 링크의 최초 GET은 메일 보안 스캐너의 자동 방문에 대비해 인증 상태를 변경하지 않는다. Universal Link/App Link로 앱이 열리거나 웹 완료 화면이 로드된 뒤 클라이언트가 token을 `POST /auth/email-verifications/confirm`으로 보내 인증을 완료한다. 앱이 없거나 연결에 실패해도 웹에서 완료할 수 있고, 앱은 다음 활성화 때 인증 상태를 다시 조회한다.

재전송은 요청 사이 60초, 정규화한 계정과 IP 각각 하루 최대 5회로 제한한다. 허용된 재전송에서는 이전 미사용 token을 모두 폐기하고 새 링크만 유효하게 한다. 제한된 요청은 `429 RATE_LIMITED`와 재시도 가능 시각을 반환하되 계정 존재 여부는 노출하지 않는다. 만료·이미 사용·교체된 token은 같은 일반 오류 화면을 보여주고 재전송 동작을 제공한다. 인증 완료 여부와 관계없이 발송 API 응답은 같은 일반 안내를 사용한다.

비밀번호 재설정도 `https://api.daymo.xyz/auth/reset-password?token=...` 형식의 30분·1회용 링크로 제공한다. 앱 로그인 화면의 `비밀번호를 잊었어요`가 `POST /auth/password/forgot`을 부르고, 브라우저의 `/auth/forgot-password` 페이지에서도 요청할 수 있다. 링크 페이지는 `no-referrer`·`no-store`·외부 자원 없는 CSP를 쓰고, nginx는 `/auth/` 접속 기록에서 주소의 `?` 뒤를 지운다. token 원문은 저장하지 않으며 새 링크 발급 시 기존 미사용 token을 모두 폐기한다. 링크의 GET은 상태를 변경하지 않고 앱 또는 웹의 새 비밀번호 화면이 `POST /auth/password/reset`을 호출한다. 새 비밀번호에는 가입과 같은 규칙을 적용하고, 성공 transaction에서 해당 사용자의 모든 refresh token과 로그인 세션을 폐기한 뒤 다시 로그인하도록 안내한다. 요청·응답과 오류 화면은 계정 존재 여부를 노출하지 않는다.

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

2026-09-16 구현(`backend/app/api/v1/reports.py`, `backend/app/services/moderation.py`):

- 신고는 `POST /reports`에 `{spaceId, targetType, targetId?, reason, detail?}`를 보낸다. `targetType`은 `memo|diary|photo|member|trip|other`, `reason`은 `spam|harassment|sexual|violence|privacy|copyright|other`, `detail`은 1000자까지다. `member`의 `targetId`는 사용자 id가 아니라 그 공간의 membership id다. `other`는 `targetId`를 비우고 나머지는 반드시 채운다.
- 신고자는 그 공간의 지금 멤버여야 하고 대상도 그 공간의 것이어야 한다. 아니면 둘 다 404다. 지운 메모·사진과 지운 여행 안의 것도 404, 나를 멤버로 신고하면 422다.
- 응답은 `201 {id, receivedAt, reviewDueAt(접수 후 24시간)}`이다. 같은 사람이 같은 대상을 다시 신고하면 열린 신고가 있는 동안 `200`과 처음 `id`를 준다. 새 신고는 한 사람당 1시간에 10건까지이고 넘으면 `RATE_LIMITED(429)`다.
- 새 신고마다 `support@daymo.xyz`로 접수 번호·대상 종류·사유·검토 기한만 담은 메일을 보낸다. 신고 설명, 대상 본문·사진, 신고자 이메일은 넣지 않는다. 메일이 실패해도 신고는 남는다. 긴급도 구분, 1시간 요약, `/me/reports`, 이의 제기, 임시 `restricted`, 관리자 웹은 아직 없어 운영자가 DB에서 직접 처리한다.
- 차단은 문서의 `/me/blocks/{blockedUserId}` 대신 `/blocks`를 쓴다. 앱은 다른 사람의 사용자 id를 모르므로 membership id로 가리킨다. `POST /blocks {userMembershipId}`는 지금 함께 있는 공간의 멤버만 받고(아니면 404, 나면 422) 이미 차단했으면 `200`이다. `GET /blocks?spaceId=`는 `{id, membershipId, displayName, blockedAt}` 목록이고, `spaceId`를 주면 그 공간에 있는 사람은 그 공간의 membership id로 준다. `DELETE /blocks/{membershipId}`는 어느 공간의 membership이든 같은 사람의 차단을 푼다. 차단한 공간이 지워져 `membershipId`가 비면 차단 줄 `id`로 푼다.
- 차단 효과는 지금 초대 수락에만 건다. 받는 사람과 공간의 지금 멤버 사이에 어느 쪽으로든 차단이 있으면 `FORBIDDEN(403)`이고, 문구에 차단 사실을 드러내지 않으며 초대 사용 횟수를 올리지 않는다. 초대 링크는 받는 사람을 정해 만들지 않아서 초대 생성은 막지 않는다. 알림은 아직 기능이 없다.
- 계정을 최종 정리하면 그 사람이 한 차단과 당한 차단을 지우고, 낸 신고는 남기되 신고자 연결을 끊는다.

메모·일기·장소 설명·요리·기타 사용자 입력과 외부 URL은 저장 전에 서버의 versioned moderation rule을 통과한다. 명백한 불법·위협 패턴, 허용하지 않는 URL scheme과 확인된 위험 domain은 `CONTENT_NOT_ALLOWED`로 거부하고 사용자가 수정할 수 있는 일반 안내만 반환한다. 애매한 단어 하나만으로 차단하지 않으며 운영자가 rule version과 오탐을 추적한다. 거부된 원문 전체는 애플리케이션 로그에 남기지 않는다.

사진은 초기 버전에서 외부 이미지 moderation API로 보내지 않는다. 업로드 전 이용규칙과 신고 가능성을 안내하고 초대 공간 안에서만 제공하며, 신고된 사진은 긴급도에 따라 즉시 `restricted` 처리한다. 공개 피드나 익명 탐색을 추가하거나 실제 악용·스토어 심사 요구가 생기면 외부 전송의 동의·처리 국가·보유기간과 기기/VPS 성능을 다시 승인한 뒤 자동 이미지 판별을 도입한다.

관리자 웹은 일반 `/v1` 사용자 세션을 받지 않고 별도 `/admin` 인증·권한 경계를 사용한다. 관리자 공개 가입과 일반 OAuth 자동 가입은 없으며 사전에 허용된 계정과 MFA가 모두 확인되어야 한다. 최소 API는 신고 queue/상세 조회, 콘텐츠 임시 제한·복원, 7일 삭제 전환, 사용자 제재와 처리 결과 기록이다. 원본 사진 열람은 신고 처리에 필요한 명시적 동작에서만 허용하고 모든 접근 사유를 `admin_audit_logs`에 남긴다. 관리자 응답은 검색 엔진 cache 금지와 짧은 session timeout을 적용한다.

관리자 MFA는 인증 앱의 RFC 6238 TOTP 6자리 코드를 사용한다. 비밀번호 확인 뒤 TOTP를 별도 검증하고 성공 전에는 moderation session을 발급하지 않는다. TOTP secret은 별도 server key로 암호화하고 key version을 저장하며 로그·응답·백업 점검 출력에 평문을 남기지 않는다. 등록 시 일회용 복구 코드 10개를 발급해 hash만 저장하고 사용 즉시 폐기한다. TOTP·복구 코드 실패에는 관리자 계정과 IP 기준 rate limit, 지연과 보안 로그를 적용한다.

관리자 session은 마지막 서버 측 조작 시각부터 1시간의 inactivity timeout을 적용한다. 만료 후 화면은 즉시 잠기며 처리 중인 서버 변경을 자동 제출하지 않고, 다시 비밀번호를 받지 않더라도 최소 TOTP 재확인을 거쳐 새 session을 발급한다. 일반 사용자 refresh token과 공유하지 않는다.

OAuth callback은 access/refresh token을 URL query에 넣지 않는다. 서버가 1분 이내 만료되고 한 번만 쓸 수 있는 `loginCode`를 앱 링크로 돌려주고 앱은 `/auth/oauth/exchange`로 session token을 교환한다. provider 시작 요청에는 앱이 만든 `state`와 PKCE challenge를 사용한다.

소셜 로그인 흐름:

1. 앱이 `state`(16~128자)와 PKCE `code_verifier`를 만들고 시스템 브라우저로 `GET /auth/oauth/{provider}/start?redirectUri=daymo://oauth&state=...&codeChallenge=...&codeChallengeMethod=S256`를 연다. `redirectUri`는 서버 설정 `OAUTH_APP_REDIRECT_URIS`에 있는 것만 받고, challenge는 `S256`만 받는다. 켜지지 않은 provider는 `NOT_FOUND`다.
2. 서버는 provider용 `state`와 OIDC `nonce`를 따로 만들어 10분짜리 `oauth_states`에 앱의 값과 함께 적고 provider 로그인 창으로 302 보낸다.
3. provider가 `{AUTH_LINK_BASE}/v1/auth/oauth/{provider}/callback`으로 돌려보내면 서버는 state를 한 번만 쓰고, code를 토큰으로 바꿔 사람을 확인한다(Google·Apple은 id_token의 서명·발급자·대상·nonce를 검증). 성공하면 `redirectUri?loginCode=...&state=<앱 state>`, 사용자가 취소하면 `?error=cancelled`, 그 밖에는 `?error=failed`로 303 보낸다. 모르는 state나 이미 쓴 state는 앱 주소로 보내지 않고 안내 페이지를 보여 준다.
4. 앱은 돌아온 `state`가 자기가 만든 것인지 확인하고 `POST /auth/oauth/exchange { loginCode, codeVerifier, device }`를 부른다. verifier가 틀리면 그 loginCode도 버린다. 성공 응답은 `/auth/login`과 같은 session 모양이다.
5. 이 provider 계정이 처음이면 provider 이메일로 계정을 만든다. provider가 확인한 이메일만 `email_verified_at`을 채운다(네이버는 확인 여부를 주지 않아 채우지 않는다). 이메일을 주지 않으면 `VALIDATION_ERROR(422)`로 가입하지 않는다.

provider가 반환한 이메일이 기존 계정과 같아도 자동 병합하지 않는다. 서버는 `ACCOUNT_LINK_REQUIRED`와 짧게 유효한 연결 context를 반환하고, 사용자가 기존 계정으로 재인증한 뒤에만 provider subject를 연결한다.

```json
{ "error": { "code": "ACCOUNT_LINK_REQUIRED", "message": "...", "details": { "linkToken": "...", "provider": "kakao" }, "requestId": "uuid" } }
```

앱은 기존 계정 비밀번호를 받아 `POST /auth/oauth/link { linkToken, password, device }`로 보낸다. 연결 토큰은 10분·1회용이고, 비밀번호 확인은 로그인과 같은 시도 제한을 받는다. 틀린 비밀번호와 비밀번호가 없는 계정(다른 provider로만 가입)은 같은 `FORBIDDEN(403)` 문구로 거절해 가입 방식을 드러내지 않는다. 연결에 성공하면 provider가 확인한 이메일로 기존 계정의 이메일 확인도 끝낸다.

아직 없는 것: OAuth로만 가입한 계정의 재인증(provider 재로그인으로 `reauthProof` 발급), `/me/auth-methods` 연결·해제, 탈퇴 시 Apple token revoke와 카카오 unlink, iOS 네이티브 Apple 로그인.

- 서비스 이용약관 동의와 개인정보 처리 관련 고지/동의는 문서 종류와 법적 근거를 구분한다.
- 계약 이행에 필요한 개인정보까지 관행적으로 모두 ‘필수 동의’로 만들지 않는다.
- 마케팅, 선택 분석, 선택 프로필 등은 각각 선택 가능하고 거부해도 핵심 기능을 사용할 수 있어야 한다.
- 필수 문서의 중요한 변경은 재동의 또는 재확인을 요구하고 단순 문구 수정은 변경 공지로 처리한다.
- 시스템 사진/카메라 권한은 이 API 동의와 별개이며 실제 기능을 누른 시점에 OS prompt를 요청한다.

가입(`POST /auth/signup`)과 소셜 로그인으로 계정이 새로 생기는 `POST /auth/oauth/exchange`는 2026-09-15부터 `agreedTermsVersion`(게시한 약관의 시행일, 지금 `2026-09-15`)과 `ageConfirmed: true`를 받는다. 다르거나 없으면 422이고, 받으면 `users.terms_version`·`terms_agreed_at`에 남긴다. 이미 있는 계정으로 로그인할 때는 보지 않는다.

`PATCH /me`는 2026-09-16부터 `{displayName}`(공백을 한 칸으로 줄여 1~20자)만 받고 `GET /me`와 같은 응답을 준다. 프로필 사진은 아직 없다. 공간별 별명(`nickname`)은 바뀌지 않는다.

`GET /me` 핵심 응답:

```json
{
  "data": {
    "id": "uuid",
    "email": "sky@example.com",
    "displayName": "하늘",
    "avatarUrl": null,
    "spaces": [{ "id": "uuid", "name": "주말 여행", "relationshipType": "friends", "role": "owner" }],
    "deletionScheduledAt": null
  }
}
```

`deletionScheduledAt`이 있으면 삭제를 요청해 둔 계정이다. 앱은 다른 화면보다 먼저 삭제 예정일과 취소 버튼을 보여준다.

### 비밀번호·이메일 바꾸기

2026-09-15부터 로그인한 사용자가 앱의 내 프로필에서 바꾼다(`backend/app/services/account_changes.py`).

비밀번호:

1. 앱이 `POST /auth/reauth`에 `{"action": "change_password", "password": "지금 비밀번호"}`로 증표를 받는다. 비밀번호가 없는(소셜 로그인으로만 가입한) 계정은 `POST /auth/oauth/reauth`에 같은 action으로 받고, 여기서 처음 비밀번호를 정할 수 있다. 정한 뒤에는 이메일과 비밀번호로도 로그인된다.
2. `POST /me/password`에 `{"reauthProof": "...", "newPassword": "..."}`를 보낸다. 성공은 `200 {"status": "changed"}`다. 새 비밀번호에는 가입과 같은 규칙을 적용하고(`VALIDATION_ERROR`·`PASSWORD_TOO_COMMON`, `fields.password`), 규칙 검사를 증표보다 먼저 해 규칙에 걸려도 증표는 쓰이지 않는다.
3. 요청한 기기의 세션은 남긴다. 다른 기기의 기기 세션과 refresh token은 같은 transaction에서 끊고(`revoke_reason=password_change`) 이미 받은 access token도 다음 요청부터 막힌다. 쓰지 않은 비밀번호 재설정 링크도 폐기한다.
4. 계정 주소로 `비밀번호가 바뀌었어요` 알림을 보낸다. 링크는 넣지 않는다.

이메일:

1. 앱이 `change_email` 증표를 받아 `POST /me/email`에 `{"reauthProof": "...", "newEmail": "..."}`를 보낸다. 새 주소에 이미 계정이 있든 없든 `202 {"status": "accepted"}`로 같다. 지금 주소와 같으면(대소문자 무시) `422`다.
2. 계정이 없는 주소면 새 주소로 `https://api.daymo.xyz/auth/confirm-email-change?token=...` 링크를 보낸다. 30분·1회용이고 hash만 `email_change_tokens`에 바꿀 주소와 함께 저장하며, 새로 요청하면 쓰지 않은 예전 변경 링크를 폐기한다. 이미 계정이 있는 주소면 링크 대신 `누군가 이 주소로 계정 이메일을 바꾸려고 했어요` 알림만 그 주소로 간다.
3. 어느 경우든 지금 주소에는 앞 글자만 보이게 가린 새 주소와 함께 요청이 있었다는 알림(링크 없음)을 보낸다.
4. **링크를 누르기 전에는 아무것도 바뀌지 않는다.** 페이지의 GET은 버튼만 보여 주고 POST가 바꾼다. 다른 링크 페이지와 같은 `no-referrer`·`no-store`·CSP를 쓴다. 그새 그 주소로 다른 계정이 생겼거나 계정이 삭제 유예 중이면 만료와 같은 일반 오류 화면이다. 성공하면 `users.email`을 바꾸고 `email_verified_at`을 지금으로 채우며, 남은 변경·이메일 확인·비밀번호 재설정 링크를 폐기하고 예전 주소에 `이메일이 바뀌었어요` 알림을 보낸다. 세션은 끊지 않는다.
5. 요청은 `email_change` 한도로 계정·받는 주소 각각 요청 사이 60초, 하루 5회, IP 하루 50회까지다. 넘으면 `429 RATE_LIMITED`와 `fields.retryAfterSeconds`다.

### 계정 삭제

1. 앱이 `POST /auth/reauth`에 `{"action": "delete_account", "password": "..."}`로 증표를 받는다. 비밀번호가 틀리면 `FORBIDDEN(403)`이다. `401`로 답하면 앱이 토큰 만료로 읽고 로그아웃시키기 때문이다. 틀린 시도는 로그인과 같은 한도(15분 5회부터 지연, 최대 15분)로 따로 센다. 비밀번호가 없는(소셜 로그인으로만 가입한) 계정은 2026-09-15부터 연결된 제공자로 다시 로그인한 결과를 `POST /auth/oauth/reauth`에 `{action, loginCode, codeVerifier}`로 보내 같은 증표를 받는다. 제공자 계정이 지금 로그인한 계정에 연결된 것이 아니면 403이고, 새 세션은 만들지 않는다. `GET /me`의 `hasPassword`·`linkedProviders`로 앱이 확인 방식을 고른다.
2. `DELETE /me`에 `{"reauthProof": "..."}`를 보낸다. `202`와 `{requestedAt, scheduledAt}`을 돌려준다. 기한은 요청 후 7일이다.
3. 요청하는 순간 모든 기기의 refresh token과 기기 세션을 끊는다. 이미 받은 access token도 다음 요청부터 막힌다. 안내 메일에는 삭제 예정일만 쓰고 링크를 넣지 않는다.
4. 다른 활성 멤버가 있는 공간의 owner면 `OWNER_TRANSFER_REQUIRED(409)`로 막고 증표를 쓰지 않는다. 혼자 쓰는 공간은 막지 않고 최종 삭제 때 함께 지운다.
5. 유예 중에 다시 로그인하면 `GET /me`의 `deletionScheduledAt`이 채워져 있다. `cancel_deletion` 증표로 `POST /me/deletion/cancel`을 부르면 취소된다. 기한이 지났으면 `GONE(410)`이다.
6. 하루 한 번 정리 작업(`python -m app.jobs.cleanup`)이 기한이 지난 계정을 비식별화한다. `users` 줄은 공동 기록이 가리키므로 남기고 이메일·비밀번호·이름·기기·토큰·OAuth 연결을 지운다. 이름은 `탈퇴한 멤버`가 되고, 다른 사람 공간의 멤버십은 나간 것으로 바뀐다. 같은 이메일로 다시 가입할 수 있다.

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

2026-09-15 구현: `GET /spaces/{spaceId}/members?includeLeft=true`는 나간 멤버도 `leftAt`과 함께 지금 멤버 뒤에 붙인다. 지난 여행의 지출·준비물·교통편이 가리키는 사람의 당시 표시 이름을 앱이 알아야 하기 때문이다. 쿼리 없이 부르면 예전처럼 지금 멤버만 주고 `leftAt` 칸도 없다. 참가자 교체(`PUT /trips/{tripId}/participants`)는 이미 참가자인 사람이면 공간을 나갔어도 남길 수 있고, 나간 사람을 새로 넣지는 못한다.

owner가 멤버를 내보내면 같은 콘텐츠 유지 규칙을 적용하고 해당 membership, 공간 SSE ticket, pending notification과 사진 URL을 즉시 폐기한다. 요청 body에는 콘텐츠 일괄 삭제 옵션을 받지 않는다. 내보낸 사용자의 아직 전송되지 않은 mutation은 membership 재검증에서 거부하고, 앱이 다음 활성화·sync 때 해당 공간 snapshot과 사진 cache를 제거하도록 `MEMBERSHIP_REVOKED`를 반환한다.

공간 삭제 화면의 1단계에서는 owner가 현재 공간 이름을 정확히 입력해야 한다. 2단계에서는 삭제되는 범위, 모든 멤버에게 미치는 영향, 7일 복구 기한을 보여주고 `7일 후 삭제` 최종 버튼을 다시 눌러야 한다. API 요청은 `confirmationName`과 `impactAcknowledged: true`를 받고 서버가 owner 권한과 최신 공간 이름을 검증한다. 별도 계정 재인증은 요구하지 않는다. 요청 성공 즉시 모든 멤버의 일반 공간 목록, sync 응답, 알림 대상에서 숨기고 7일 뒤 최종 삭제를 예약한다. 유예기간에는 owner의 삭제 예정 공간 화면에서만 확인·복구할 수 있다. 복구하면 기존 membership과 콘텐츠를 그대로 되살리고, 7일이 지나면 복구 API는 `410 GONE`을 반환한다.

2026-09-16 구현: `DELETE /spaces/{spaceId}`는 본문 `{confirmationName, impactAcknowledged}`를 받아 202와 `deletionScheduledAt`을 준다. 곧바로 `deleted_at`을 채워 모든 멤버의 공간 목록·여행·초대에서 빠지고, 정리 작업(`spaces`)이 7일 뒤 `purge_space`로 여행·사진 파일까지 지운다. 되돌릴 수 있는 공간은 `GET /spaces/deleted`(내가 owner인 것만), 복구는 `POST /spaces/{spaceId}/restore`(owner, 기한 뒤 410, owner가 아니면 404)다. 앱은 공간 프로필의 "이 공간 삭제"와 공간 바꾸기 화면의 "지운 공간"·"새 여행 공간 만들기"로 쓴다.

공간 정원은 owner를 포함해 최대 10명이다. 초대 링크는 생성 시점부터 7일간, 최대 10명까지 사용할 수 있다. 로그인과 이메일 인증을 마친 사용자는 별도 owner 승인 없이 즉시 참여하며 기본 권한은 `editor`다. 미로그인 사용자는 인증 완료 후 원래 초대 흐름으로 복귀한다. owner는 만료 전에도 링크를 폐기하거나 참여 후 멤버별 권한을 변경할 수 있다. 링크 원문은 생성 응답에서만 반환하고 서버에는 hash만 저장한다. 참여 API는 만료·폐기·사용 횟수와 공간 정원을 transaction 안에서 재검증하며 이미 참여한 사용자의 재요청은 중복 membership을 만들지 않는다. 정원이 찬 경우 `409 SPACE_MEMBER_LIMIT_REACHED`를 반환하되 초대 사용 횟수는 올리지 않는다.

```json
{}
```

초기 버전의 초대 생성 요청에서는 `role`을 받지 않고 서버가 `editor`로 고정한다. 이후 읽기 전용 공유가 필요해질 때 별도 정책과 UI를 검토한다.

2026-09-16 구현(`backend/app/api/v1/members.py`):

- 초대 링크는 `https://api.daymo.xyz/auth/invite?token=...`이다. 이메일 링크와 같은 이유로 API 서버가 페이지를 직접 보여 주고, 페이지는 공간 이름 없이 두 길을 준다. 앱이 있으면 `daymo://invite?token=...`, 없으면 `{WEB_APP_BASE}?invite=...`(기본값 `https://www.daymo.xyz/app`)로 웹 앱을 연다. 웹 앱은 token을 읽자마자 `history.replaceState`로 주소에서 지우고, 로그인 전이면 sessionStorage에 30분만 두었다가 로그인·가입이 끝난 직후에 참여한다(`mobile/src/inviteHandoff.ts`). token은 주소의 query에 있어 접속 기록에 남지 않는다.
- 참여는 `POST /invites/accept`에 `{token}`을 본문으로 보낸다(문서의 `/invites/{token}/accept`와 같은 일). 응답은 `{spaceId, membershipId, alreadyMember}`. 모르는 token은 404, 폐기·만료·횟수 소진은 410, 이메일 미확인은 `EMAIL_NOT_VERIFIED(403)`, 정원 초과는 `SPACE_MEMBER_LIMIT_REACHED(409)`다. 초대 줄과 공간 줄을 잠그고 센다.
- 초대 만들기·목록은 owner·editor, 폐기는 owner 또는 만든 사람이다. 목록에는 링크 원문이 없다.
- `PATCH /spaces/{spaceId}/members/{membershipId}`는 `{role: owner|editor|viewer}`를 받고 owner만 한다. `owner`로 바꾸면 관리자를 넘기고 나는 `editor`가 된다. 별명 변경은 아직 없다.
- `DELETE /spaces/{spaceId}/members/{membershipId}`는 내 membership이면 나가기, 남의 것이면 내보내기(owner만)다. 다른 멤버가 있는 owner는 `OWNER_TRANSFER_REQUIRED`, 혼자 남은 owner는 422다. SSE ticket·알림·사진 URL 폐기와 `MEMBERSHIP_REVOKED`는 그 기능이 생길 때 붙인다. 지금은 membership 검사에서 404가 된다.

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

일반 여행 상세에는 삭제 동작을 노출하지 않고 `보관`만 제공한다. owner와 editor는 보관·보관 해제를 할 수 있다. 보관은 목록 정리 상태이므로 보관된 여행의 일정·장소·준비물·요리·비용·기록·사진 CRUD API를 차단하지 않는다. 실제 삭제와 복구는 owner만 보관함의 관리 메뉴에서 수행할 수 있으며, 삭제 전에 영향 범위와 7일 복구 기한을 확인한다. 삭제된 여행은 일반 목록·검색·지도·캘린더·알림에서 즉시 제외하고 `status=trash` 관리 조회에서만 보여준다. 7일 안에 복구하면 기존 상태와 종속 콘텐츠를 되살리고, 권한이 없으면 `403 FORBIDDEN`, 기한이 지났으면 `410 GONE`을 반환한다.

여행 종료일이 공간 timezone의 오늘보다 이전이어도 서버가 자동 보관하지 않는다. 클라이언트는 지난 여행의 `여행` 탭 하위 일정·숙소·예약·교통·메모, `장소`, `요리` 쓰기 동작 전에 `지난 여행을 편집할까요?`를 확인한다. 동의 시 해당 여행·기기에 로컬 승인 시각을 저장해 10분간 재확인을 생략한다. `준비`, `기록`과 사진 추가·수정은 확인 대상이 아니다. API는 이 로컬 확인값을 신뢰하거나 요구하지 않고 기존 membership·version 규칙만 검증한다.

여행 생성 요청:

```json
{
  "title": "전주 한옥마을",
  "regionCode": "11",
  "regionName": "서울",
  "startDate": "2026-08-21",
  "endDate": "2026-08-23",
  "summary": "숙소에서 수다와 버섯전골",
  "cookingEnabled": true,
  "participantMembershipIds": ["uuid", "uuid"]
}
```

서버는 여행과 기간 내 `trip_days`를 한 트랜잭션으로 생성한다. 종료일은 시작일보다 빠를 수 없으며 초기 최대 기간은 60일로 제한한다.

`participantMembershipIds`는 이번 여행에 가는 사람이다. 공간 멤버 전원이 매번 같이 가지는 않으므로 여행을 만들 때 고르고, 이후에는 `PUT /trips/{tripId}/participants`에 `{version, membershipIds}`로 바꾼다. 참가자를 바꾸면 여행 `version`이 오르고, 낡은 `version`이면 `VERSION_CONFLICT(409)`다. 참가자에는 지출 몫과 준비물 담당이 걸려 있어 조용히 덮어쓰면 정산이 틀어진다. 생략하면 빈 목록으로 만들고 클라이언트가 공간 멤버 전원으로 해석한다.

`cookingEnabled`는 요리 탭 표시의 서버 원본이다. 숙소의 `hasKitchen`이 `true`이고 탭이 꺼져 있으면 켜기를, `false`이고 탭이 켜져 있으면 끄기를 제안한다. 제안은 자동 적용하지 않으며 탭을 꺼도 기존 요리·재료를 삭제하지 않는다.

대시보드 응답:

```json
{
  "data": {
    "nextTrip": { "id": "uuid", "title": "전주 한옥마을", "startDate": "2026-08-21", "endDate": "2026-08-23" },
    "stay": { "name": "달빛한옥", "checkInAt": "2026-08-21T06:00:00Z" },
    "counts": { "schedule": 3, "places": 8, "packingDone": 2, "packingTotal": 6 },
    "relationshipDay": null,
    "recentCompletedTrips": [
      { "id": "uuid", "title": "부산", "startDate": "2026-07-24", "endDate": "2026-07-26", "summary": "바다 산책과 단체 사진", "accentColor": "#19B6A3" }
    ]
  }
}
```

2026-09-15 구현(`backend/app/api/v1/trips.py`, `backend/app/services/trip_overview.py`): 대시보드 API는 아직 없다. 대신 여행 응답(`GET /spaces/{spaceId}/trips`, `GET /trips/{tripId}`와 여행을 돌려주는 다른 응답)에 홈 여행 카드와 "출발 전 확인할 것"이 보여 주는 요약 `overview`를 붙였다. 앱은 이 숫자를 기기에 저장된 기록에서만 셌는데, 기록은 여행 상세를 그 기기에서 열어야 채워져 새로 로그인했거나 다른 멤버가 채운 여행이 홈에서 비어 보였다.

```json
"overview": {
  "stay": { "name": "달빛한옥", "checkInAt": "2026-08-21T15:00" },
  "scheduleCount": 5,
  "placeCount": 8,
  "restaurantCount": 3,
  "cafeCount": 2,
  "packingTotal": 6,
  "packingDone": 2,
  "spentTotal": 60000.5
}
```

- `stay`는 대표 숙소, 즉 숙소 목록(`GET /trips/{tripId}/stays`)의 첫 줄이다. 숙소가 없으면 `null`이다. `name`은 연결한 여행 장소의 이름이고 없으면 `null`, `checkInAt`은 숙소 API와 같은 공간 시간대의 `YYYY-MM-DDTHH:MM`이다.
- `scheduleCount`는 일정 탭의 줄 수다. 일정 줄에 더해 `showInSchedule`을 켠 교통편·예약과 대표 숙소 줄을 센다.
- `restaurantCount`·`cafeCount`는 장소 분류가 `식당`·`카페`인 것이다. `packingTotal`·`packingDone`은 여행 준비물 목록의 전체와 체크한 수이고 요리 재료는 세지 않는다. `spentTotal`은 여행 통화 기준 지출 합이다.
- 목록은 여행마다 따로 묻지 않고 표마다 한 번씩 묶어서 센다.

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
  "title": "소나기식당에서 점심",
  "type": "meal",
  "note": "예약 확인",
  "tripPlaceId": "uuid",
  "version": 1
}
```

2026-09-15 구현(`backend/app/api/v1/schedule.py`, `bookings.py`): 일정·숙소·교통·예약을 열었다. 정렬 API는 없다(앱이 날짜·시각 순으로 보여 준다).

- 위 예시의 `tripDayId`·`startAt` 대신 **공간 시간대의 `date`(YYYY-MM-DD)와 `time`(HH:MM)** 을 주고받는다. 서버가 공간 시간대로 timestamptz를 만들고 날짜로 `trip_day`를 찾는다. 앱마다 시간대 계산을 하면 기기 시간대가 다른 멤버끼리 일정이 어긋나기 때문이다. 시각이 없으면 날짜만 남고, 날짜가 없으면 시각도 저장하지 않는다.
- 요청 필드는 `id`(앱 UUID), `date`, `time`, `title`(60자), `type(place|meal|move|rest|other)`, `note`, `tripPlaceId`(같은 여행 장소만), `mapUrl`이다. 목록은 날짜·시각 순이다.
- 숙소는 `id`, `tripPlaceId`, `checkInAt`·`checkOutAt`(공간 시간대 `YYYY-MM-DDTHH:MM`), `note`, `showInSchedule`. 이름·주소는 연결한 장소의 것이다. 숙소 분류(`lodging`) 검사는 아직 하지 않는다.
- 둘 다 `version`이 있고 `PATCH`에 필수다. 같은 `id`로 다시 만들면 `200`으로 기존 줄을 돌려준다.
- 교통은 `id`, `direction`, `method(ktx|srt|bus|flight|other)`, `date`, `departureName`·`departureTime`, `arrivalName`·`arrivalTime`, `ownerMembershipId`(같은 공간 멤버만), `bookingStatus(booked|not_booked)`, `note`, `showInSchedule`. 도착 시각이 출발보다 이르면 다음 날 도착으로 저장한다. 날짜만 있고 시각이 없어도 날짜(`travel_on`)는 남는다.
- 예약은 `id`, `title`, `date`, `time`, `partySize`, `partyLabel`(사람이 적은 인원 글자 그대로), `status(confirmed|needs_check|cancelled)`, `note`, `bookingUrl`(http/https), `showInSchedule`. 날짜는 `reserved_on`에 따로 남는다.
- 여행 기간을 `PATCH /trips/{id}`로 바꾸면 `trip_days`도 새 기간에 맞춘다. 빠진 날을 가리키던 일정은 날짜가 비고, 앱이 새 날짜로 옮겨 다시 보낸다.

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
  "name": "달빛한옥",
  "area": "전주 완산구",
  "address": "전주 완산구 은행로 12",
  "category": "lodging",
  "tags": ["숙소 근처", "예약"],
  "externalLinks": [{ "provider": "naver_map", "url": "https://map.naver.com/p/search/달빛한옥" }]
}
```

2026-09-15 구현(`backend/app/api/v1/places.py`):

- `GET/POST /trips/{tripId}/places`, `PATCH/DELETE /trip-places/{tripPlaceId}`가 열려 있다. 일정 담기·숙소 등록·외부 링크 보강·명시적 태그 API는 아직 없다.
- 요청 필드는 `id`(앱이 만든 UUID, 선택), `name`, `area`, `address`, `category`, `status(saved|scheduled|visited)`, `memo`, `tags`, `mapUrl`이다. 위 예시의 `externalLinks` 배열 대신 지도 링크 하나(`mapUrl`)만 받는다. 앱이 장소마다 링크를 하나만 쓰기 때문이다.
- 같은 `id`로 다시 담으면 새로 만들지 않고 `200`으로 기존 장소를 돌려준다. 그 `id`가 다른 여행의 장소면 `422`다.
- 응답에 `version`이 있고 `PATCH`는 `version`이 필수다. 어긋나면 `VERSION_CONFLICT(409)`.
- `tags`는 가나다순으로 돌려준다. 태그 연결에 순서 칸이 없어서다. 클라이언트는 태그를 순서 없는 묶음으로 비교한다.
- `mapUrl`은 http/https만 받는다. 호스트로 `naver_map`·`kakao_map`·`youtube`·`other`를 정한다.
- `DELETE`는 되돌리기 기간 없이 바로 뺀다. 일정의 장소 연결은 비워지고 일정은 남는다. 태그 연결·링크·사진 연결을 떼고, 아무 여행도 쓰지 않는 손 장소 실체를 지운다.

공유 텍스트의 이름·주소·URL 파싱은 기기에서 먼저 수행하며 API를 호출하지 않는다. 단축 URL redirect나 외부 장소 정보 보강이 필요할 때만 다음 요청을 사용한다.

장소·준비물·재료 쓰기 요청의 `tags` 문자열은 서버가 공간과 scope 안에서 정규화해 기존 태그를 연결하거나 새 태그를 upsert한다. 명시적 태그 API는 이름·색 관리용이며 일반 추가 화면에서 태그 생성을 위해 별도 선행 호출하지 않는다.

```json
{ "provider": "naver_map", "url": "https://map.naver.com/p/search/달빛한옥" }
```

```json
{
  "data": {
    "provider": "naver_map",
    "resolvedUrl": "https://map.naver.com/...",
    "name": "달빛한옥",
    "address": "전주 완산구 은행로 12 달빛한옥",
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

2026-09-15 구현(`backend/app/api/v1/cooking.py`):

- 목록 조회·추가와 `PATCH/DELETE /checklist-items/{itemId}`만 있다. 체크와 담당 변경은 따로 두지 않고 `PATCH`에 `completed`(참/거짓)·`ownerMembershipId`·`isShared`로 보낸다. `id`(앱 UUID)와 `version`을 더했고 낡은 `version`은 `VERSION_CONFLICT(409)`다.
- 여행마다 준비물 목록(`checklists`, kind `packing`)을 처음 쓸 때 하나 만든다. 응답의 `completed`는 참/거짓이고 `completedAt`·`completedBy`는 서버에만 남긴다. `quantity`는 60자까지다.
- 담당자를 정하면 공용이 풀리고, 공용으로 바꾸면 담당자가 빈다. 둘을 함께 보내면 422다. 담당은 같은 공간의 membership이면 나간 멤버도 받는다.
- `duplicateCandidate`와 일괄 API는 아직 없다. 준비물을 지우거나 여행이 정리되면 태그 연결도 뗀다.

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
  "name": "버섯전골",
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

2026-09-15 구현(`backend/app/api/v1/cooking.py`):

- `GET/POST /trips/{tripId}/recipes`와 `PATCH/DELETE /recipes/{recipeId}`만 있다. 재료는 요리와 함께 `ingredients` 배열로 오가고, 재료 단독 API와 준비물로 가져오기는 아직 없다. `servings`는 받지 않는다.
- 요리를 고칠 때 `ingredients`를 보내면 보낸 목록대로 맞춘다. 같은 `id`의 재료는 고치고, 없는 `id`는 만들고, 빠진 재료는 지운다. 통째로 지우고 다시 만들지 않는 이유는 준비물의 `sourceIngredientId` 연결을 지키기 위해서다. 재료를 고쳐도 요리 `version`이 오른다.
- 재료의 `ready`(참/거짓)는 앱의 `준비 완료` 체크다. `procurement`가 `bring`일 때만 `ownerMembershipId`를 받는다. `sourceUrl`은 http/https만 받는다.
- 재료를 준비물로 가져오기는 별도 API 없이 기기에서 준비물을 만들고, 준비물 만들기/고치기(`POST /trips/{tripId}/checklist-items`, `PATCH /checklist-items/{itemId}`)에 `sourceIngredientId`를 함께 보낸다. 응답에도 같은 칸이 온다. 같은 여행 요리의 재료만 받고, 다른 여행이거나 없는 재료면 `422`(`fields.sourceIngredientId`)다. 고칠 때 `null`을 보내면 연결을 끊고, 보내지 않으면 그대로 둔다.
- 요리나 재료를 지워도 가져온 준비물은 남고 `sourceIngredientId`만 `null`이 된다.
- 준비물 `completed`와 재료 `ready`는 서로 바꾸지 않는다. 앱은 재료에서 가져온 준비물을 체크할 때 그 재료가 아직 준비 완료가 아니면 "요리 재료에서도 준비 완료로 표시할까요?"라고 묻고, `표시하기`를 고른 경우에만 요리 고치기로 `ready`를 보낸다. 반대 방향(재료 체크 → 준비물)은 아직 묻지 않는다.
- 앱은 서버에 올라간 재료만 연결해 보낸다. 재료가 아직 안 올라갔으면 연결을 비워 보내고 기기에는 연결을 남겨 두었다가, 요리가 올라간 뒤 다시 보낸다. 그래서 여행을 열 때 요리 목록을 받은 다음에 준비물을 맞춘다.

## 9. 비용과 정산

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `/trips/{tripId}/participants` | 이번 여행 참가자 목록 |
| PUT | `/trips/{tripId}/participants` | 참가자 목록 교체 |
| GET/POST | `/trips/{tripId}/expenses` | 지출 목록/추가 |
| PATCH/DELETE | `/expenses/{expenseId}` | 지출 수정/삭제 |
| GET/POST | `/trips/{tripId}/payments` | 정산 송금 기록 목록/추가 |
| DELETE | `/payments/{paymentId}` | 송금 기록 되돌리기 |
| PATCH | `/trips/{tripId}/expense-settings` | 여행 통화·환율·예산과 정산 묶기 설정 |

참가자 교체 요청:

```json
{
  "membershipIds": ["uuid", "uuid"],
  "version": 3
}
```

참가자는 공간 멤버 가운데 이번 여행에 가는 사람이며 여행 생성 시트, 여행 수정 시트, 비용 탭에서 같은 목록을 고친다. 목록 전체 교체이므로 온라인에서만 수행하고 `version`으로 동시 수정을 검증한다. 빠지는 참가자에게 걸린 준비물·재료 담당, 교통편 이용자, 지출의 몫 개수를 응답 `affected`로 돌려주되 서버가 교체를 막거나 해당 항목을 자동으로 지우지는 않는다. 앱은 확인 화면에서 같은 내용을 기기 데이터로 먼저 보여준다.

빈 목록도 허용하며 이 경우 클라이언트는 공간의 활성 멤버 전원을 참가자로 본다. 멤버가 공간을 나가거나 내보내져도 그 여행의 지출과 몫은 그대로 유지한다.

지출 추가 요청:

```json
{
  "tripDayId": "uuid",
  "title": "소나기식당 점심",
  "amount": 48000,
  "category": "meal",
  "payerMembershipId": "uuid",
  "splitMode": "subset",
  "shares": [
    { "membershipId": "uuid", "weight": 1 },
    { "membershipId": "uuid", "weight": 1 }
  ],
  "memo": "",
  "receiptPhotoId": null
}
```

`shares`를 생략하면 그 지출은 참가자 전원이 똑같이 나눈 것으로 본다. `weight`는 비율이 아니라 비중이므로 합이 얼마든 상관없고 서버는 정규화하지 않는다. `splitMode`는 화면 표기와 재편집에만 쓰는 값이라 서버가 `shares`와 일치하는지 검증하지 않는다. `amount`는 여행 통화 기준이며 원 환산은 저장하지 않는다. `payerMembershipId`가 현재 참가자가 아니어도 거부하지 않는다. 참가자에서 뺀 사람이 낸 지출을 잃어버리면 합계와 잔액이 어긋나기 때문이다.

송금 기록 추가 요청:

```json
{
  "fromMembershipId": "uuid",
  "toMembershipId": "uuid",
  "amount": 22500,
  "paidAt": "2026-08-24T09:00:00Z"
}
```

`정산하기`는 돈을 보내는 동작이 아니라 **보냈다고 적어 두는 기록**이다. 서버도 앱도 계좌이체를 확인할 수 없으므로 외부 결제 연동을 전제하지 않는다. 같은 여행을 여러 사람이 보기 때문에 이 기록만은 반드시 서버가 알아야 한다. 한 사람이 적어 둔 것을 서버가 모르면 다른 사람 화면에는 여전히 보낼 돈으로 남고, 같은 돈을 두 번 보내게 된다.

주고받을 전액이 아니라 일부만 적는 부분 정산을 허용한다. 서버는 금액이 0보다 큰지, 두 사람이 같은 공간의 멤버인지, 서로 다른 사람인지만 확인하고 잔액 초과 여부로 거부하지 않는다. 되돌리기는 해당 기록의 soft delete이며 온라인에서만 수행하고 `deletedBy`와 audit log를 남긴다.

여행 비용 설정 요청:

```json
{ "currency": "JPY", "exchangeRate": 9.3, "budget": 800000, "simplifySettlement": true, "version": 7 }
```

`simplifySettlement`는 주고받을 목록을 묶어서 보여줄지이며 기본값은 `true`다. 삭제되지 않은 송금 기록이 하나라도 있으면 서버가 `409 SETTLEMENT_IN_PROGRESS`로 거부한다. 묶은 목록대로 보낸 뒤 방식을 바꾸면 이미 보낸 돈이 엉뚱한 곳으로 간 것이 되기 때문이며, 기록을 모두 되돌리면 다시 바꿀 수 있다. 클라이언트도 같은 조건으로 토글을 잠그지만 최종 판정은 서버가 한다.

2026-09-15 구현(`backend/app/api/v1/expenses.py`):

- 지출은 위 요청의 `tripDayId` 대신 `date`(YYYY-MM-DD)를 받고 `id`(앱 UUID)·`version`을 더했다. `amount`는 소수 둘째 자리까지이고 응답에서는 문자열이 아니라 수로 준다. `shares`를 보내면 통째로 바뀐다.
- 낸 사람·몫·보낸 사람·받은 사람은 같은 공간의 membership이면 나간 멤버도 받는다. 나간 사람이 낸 지출을 고칠 때 막히면 정산이 틀어진다.
- 송금 기록 되돌리기는 `deleted_at`과 `deleted_by`(되돌린 사용자)를 채우고 목록에서 뺀다. 같은 `id`로 다시 적으면 하나만 생긴다. `paidAt`을 비우면 서버 시각이다.
- `PATCH /trips/{tripId}/expense-settings`는 `currency`(대문자 세 글자)·`exchangeRate`·`budget`·`simplifySettlement`를 받고 여행 응답을 돌려준다. 여행 `version`이 오른다. audit log는 아직 남기지 않는다.

잔액과 주고받을 목록에는 API를 두지 않는다. `낸 돈 − 내야 할 돈 + 보낸 돈 − 받은 돈`은 지출·참가자·송금 기록만 있으면 기기에서 계산할 수 있고, 세 가지 모두 이미 증분 동기화로 받는다. 단톡방에 붙이는 정산 텍스트와 비용 표(CSV) 생성도 같은 이유로 기기에서 처리한다.

## 10. 메모·사진·일기

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

2026-09-15 구현(`backend/app/api/v1/memories.py`):

- 메모와 일기의 목록·추가·`PATCH`·`DELETE`만 있다. `id`(앱 UUID)와 `version`을 더했고 낡은 `version`은 `VERSION_CONFLICT(409)`다. `permissions`는 아직 주지 않는다. owner·editor면 누가 쓴 메모든 고치고 지울 수 있다.
- 작성자는 `author` 객체 대신 `authorMembershipId`와 `authorName`(지금 표시 이름, 계정을 지운 사람은 `탈퇴한 멤버`)으로 준다.
- 메모를 지우면 `deletedAt`·`deletedBy`를 채우고 목록에서 뺀다. 지운 메모를 같은 `id`로 다시 만들거나 고치면 404다. 7일 안에는 휴지통에서 되살린다(아래 휴지통 구현).
- 일기는 `title`(비우면 null)·`body`·`writtenOn`(그 일기가 다루는 날, 비워도 됨)을 받고, 다루는 날 순서로 주며 날이 없는 일기는 뒤에 둔다. 일기는 지우면 행을 지운다.

메모와 사진은 삭제 후 7일간 휴지통에서 복원할 수 있다. 사진 업로더는 본인 사진의 설명과 날짜·장소·일정 연결을 수정하고 삭제·복구할 수 있다. owner는 공간의 모든 사진에 같은 권한을 가진다. 다른 editor는 타인이 올린 사진의 설명·연결을 수정하거나 삭제·복구할 수 없다. 사진 응답의 `permissions.canEdit`, `canDelete`, `canRestore`도 이 규칙을 반영하고 서버가 uploader/owner 권한을 매 요청마다 확인한다. 7일이 지나면 DB row와 사진 variant를 최종 삭제하고 삭제 ledger를 남겨 오래된 백업을 복원할 때 다시 노출되지 않게 한다.

사진에 등장한 당사자의 삭제·처리정지 요청이 접수되면 운영자가 대상과 요청자 확인에 필요한 최소 자료를 검토하고 사진을 `restricted`로 전환한다. 제한된 사진은 일반 목록·검색·통계·기념 카드와 모든 variant 다운로드에서 숨긴다. 업로더와 owner에게는 대상 사진, 임시 제한 사실, 이의 제기·처리 절차만 알리고 요청자의 연락처나 증빙을 공유하지 않는다. 확인 결과 삭제가 타당하면 기존 7일 삭제와 deletion ledger 절차로 전환하고, 확인되지 않거나 철회되면 audit log를 남긴 뒤 복원한다. 앱 API만으로 운영자 검토를 우회해 제한 상태를 해제할 수 없다.

2026-09-16 구현(`backend/app/api/v1/photos.py`):

- 업로드 session 표를 따로 두지 않고 사진 줄이 그 역할을 한다. `POST /trips/{tripId}/photos`에 `{id, bytes, checksum(SHA-256), caption, date, isReceipt}`를 보내면 `status=uploading` 줄이 생기고 한 장·공간·서버 한도를 먼저 본다. 이어서 `PUT /photos/{photoId}/content`에 파일 byte를 그대로(multipart 아님) 보내면 서버가 받으면서 크기를 세고, SHA-256을 맞춘 뒤 표시본(긴 변 1440px)·썸네일(480px) JPEG을 만들고 `ready`로 바꾼다. `complete` 단계는 없다. 끊기면 `PUT`만 다시 보낸다.
- 받는 형식은 JPEG·PNG·WebP다. HEIC는 앱이 JPEG로 바꿔 보낸다. 원본은 그림 데이터를 다시 인코딩하지 않고 메타데이터 조각만 뺀다(JPEG는 방향·찍은 시각만 남긴 EXIF를 새로 넣고, PNG·WebP는 EXIF·XMP·글 조각을 뺀다, 2026-09-15). 표시본·썸네일은 방향을 바로잡고 EXIF를 모두 뺀다. SHA-256은 앱이 보낸 원래 파일로 맞춘다. `takenAt`은 EXIF 촬영 시각이며 시간대가 없으면 공간 시간대로 읽는다. `date`는 앱에서 고른 날로 `trip_days`를 가리키지 않는다.
- `GET /photos/{photoId}/content?variant=`는 공간 멤버에게만 파일을 주고 `Cache-Control: private, max-age=31536000, immutable`이다. 운영에서 `PHOTO_ACCEL_PREFIX`를 넣으면 같은 권한 검사 뒤 본문 없이 `X-Accel-Redirect`로 Nginx에 넘기고 Nginx가 파일(Range 포함)을 보낸다. 앱이 받는 응답은 같다(06-vps-deployment.md 6장). 목록(`GET /trips/{tripId}/photos`)은 다 올라온 여행 사진만 주고 영수증은 뺀다.
- 설명·날짜 수정(`PATCH`, `version` 필요)과 삭제는 올린 사람과 owner만 한다. 지우면 `deletedAt`·`deletedBy`를 채우고 7일 뒤 정리 작업이 파일과 줄을 지운다. 휴지통 조회·복원은 아래 휴지통 구현을 본다. 중복 후보 안내, 사용량 API, 삭제 ledger는 아직 없다.
- 지출의 `receiptPhotoId`로 같은 여행의 사진을 영수증으로 붙인다.

2026-09-15 휴지통과 audit log 구현(`backend/app/api/v1/trash.py`, `backend/app/services/trash.py`, `backend/app/services/audit.py`):

- `GET /trips/{tripId}/trash`는 지운 지 7일이 안 된 메모와 다 올라온 여행 사진(영수증 제외)을 최근에 지운 것부터 준다. owner·editor만 보고 viewer는 `403`이다. 한 줄은 `{id, type(memo|photo), tripId, preview, deletedAt, deletedByMembershipId, deletedByName, restoreDeadline, canRestore}`이며 `preview`는 메모면 공백을 한 칸으로 줄인 본문 앞 40자, 사진이면 설명이다. 지운 사진의 파일은 되살리기 전에는 내려 주지 않는다.
- `POST /trash/{memo|photo}/{targetId}/restore`는 지울 때와 같은 권한이다. 메모는 owner·editor, 사진은 올린 사람과 owner(둘 다 viewer는 `403`). `deletedAt`·`deletedBy`를 비우고 `version`을 올린 뒤 메모·사진 응답과 같은 모양으로 돌려준다. 기한(`deletedAt` + 7일)이 지났으면 정리 작업 전이라도 `410 GONE`이고, 지우지 않은 것이면 바꾸지 않고 그대로 답한다. 제한된 사진은 `404`다.
- `audit_logs`에 남기는 행동: `memo.delete`·`memo.restore`·`photo.delete`·`photo.restore`·`payment.undo`·`member.remove`·`member.leave`·`member.role_change`(`metadata.role`)·`invite.revoke`·`trip.delete`·`trip.restore`. 이미 되돌린 기록·폐기한 초대·지우지 않은 여행처럼 바뀐 것이 없는 요청은 적지 않는다. 메모·일기 본문, 사진 설명과 파일, 이메일·이름은 `metadata`에 넣지 않고 여행 id·역할처럼 무엇이 바뀌었는지만 둔다. audit log 조회 API와 보유기간 파기는 아직 없다.
- 지운 메모는 기한이 지나도 행이 남는다(휴지통과 목록에서만 빠진다). 메모 최종 삭제 작업은 아직 없다.
- 앱은 메모 시트 아래 `휴지통`에서 목록을 받고 `되돌리기` 뒤 메모·사진 목록을 서버에서 다시 받는다(`mobile/src/TripTrash.tsx`, `useListSync`의 `reloadKey`).

사진 업로드 순서:

1. 앱에서 권한 확인, 선택/촬영, 원본 checksum·크기·MIME 확인
2. `photo-uploads`에서 최대 크기·MIME·checksum과 임시 upload ID 확정; 같은 여행의 동일 checksum은 `duplicateCandidate`로 알리되 업로드를 막지 않음
3. `content` 요청 body를 서버 메모리에 적재하지 않고 임시 파일로 stream 저장
4. `complete`에 크기, MIME, 촬영일과 연결 대상을 전달
5. 서버가 실제 signature·checksum을 검증한 뒤 private volume으로 원자 이동하고 Photo 생성
6. EXIF 촬영일을 `takenAt`으로 추출하고 방향을 보정한 뒤 긴 변 1440px JPEG 표시본과 480px JPEG 썸네일 생성; 파생본의 GPS·기기 EXIF 제거, 작업 동시 실행 수 1로 제한

초기 업로드 제한:

- 이미지 원본 1개 최대 20MB
- 공간별 원본·표시본·썸네일 합계 최대 1GB
- VPS 사진 경로 전체 10GB
- 동영상과 움직이는 사진 원본은 미지원

앱은 선택 직후 예상 크기를 안내하지만 서버가 실제 byte와 quota를 최종 검증한다. 공간 사용량이 80%에 도달하면 사진 화면과 업로드 완료 화면에서 한 번 사전 경고하고, 100%에 도달하면 기존 사진의 조회·다운로드·삭제·복구는 유지한 채 새 업로드만 차단한다. 서버와 앱은 원본·표시본·썸네일을 자동 압축하거나 자동 삭제하지 않는다.

HEIC·HEIF 등 지원하는 기기 원본은 원래 byte와 MIME으로 private storage에 보관한다. 앱 목록과 상세는 호환 가능한 JPEG 파생본을 사용한다. 중복 후보 안내에서는 기존 사진의 촬영일·작은 썸네일만 보여주고 사용자가 `그래도 추가`를 선택할 수 있게 한다.

저장 공간 관리 화면은 전체 사용량, 남은 용량, 여행별 사용량과 큰 사진 순서를 보여준다. 일반 멤버는 본인이 올린 사진만 정리할 수 있고 owner는 공간 전체 사진을 관리할 수 있다. 서버 전체 10GB 한도 접근은 운영 경고 대상이며 사용자의 기존 사진을 임의로 지우지 않고 신규 업로드를 제한한 뒤 미니PC·NAS로 이관한다.

다운로드는 파일 시스템 경로를 공개하지 않는다. API가 사용자의 공간 membership을 확인한 뒤 Nginx `X-Accel-Redirect` 또는 제한된 내부 경로로 파일을 전달한다. Range 요청과 적절한 private cache header를 지원한다.

## 11. 통합 검색과 실시간 이벤트

`GET /spaces/{spaceId}/search?q=소나기식당&types=trip,place,schedule,recipe,packing,diary,photo,memo&limit=20`

결과 공통 형태:

```json
{
  "type": "place",
  "id": "uuid",
  "tripId": "uuid",
  "title": "소나기식당",
  "subtitle": "전주 완산구 · 식당",
  "matchedText": "소나기식당 일요일 예약",
  "destination": "places"
}
```

`GET /spaces/{spaceId}/events`는 인증된 SSE 연결이다. 이벤트에는 `entity`, `entityId`, `tripId`, `operation`, `updatedAt`만 담고 상세 데이터는 권한이 적용된 API로 다시 조회한다. 모바일 백그라운드에서는 연결 유지를 보장하지 않고 앱 활성화 시 갱신한다.

모바일 SSE 구현이 표준 `EventSource`에서 Bearer header를 안정적으로 전달하지 못하는 경우를 대비해 `POST /spaces/{spaceId}/events/ticket`에서 60초 이내 만료되는 1회용 연결 ticket을 발급한다. 장기 access token을 URL에 넣지 않는다. SSE는 변경 신호일 뿐 데이터 원본이 아니며 수신 뒤 증분 sync 또는 대상 GET으로 최신 상태를 확인한다. 연결이 불안정하면 foreground polling으로 자동 전환한다.

## 12. 알림 설정과 기기

| Method | Path | 용도 |
| --- | --- | --- |
| GET/PATCH | `/me/notification-preferences` | 초대 참여·담당 변경·여행 임박·마케팅 알림 설정 |
| POST | `/me/devices/push-token` | 현재 설치의 push token 등록/갱신 |
| DELETE | `/me/devices/{deviceId}/push-token` | 로그아웃 또는 권한 해제 시 token 폐기 |

OS 알림 권한 요청 전 설명, 권한 상태 확인과 설정 앱 이동은 기기에서 처리한다. 마케팅 수신 동의와 서비스 동작 알림 설정은 법적 의미가 다르므로 한 필드로 합치지 않는다.

생체 앱 잠금은 서버 API가 아니라 기기 설정이다. 기본값은 꺼짐이며 사용자가 켠 상태에서 앱이 백그라운드에 1분 이상 머문 뒤 foreground로 돌아오면 OS Local Authentication으로 잠근다. 1분은 wall-clock이 아니라 안전한 기기 시각과 AppState 전환 기록으로 계산하고 앱 재시작 후에도 설정을 유지한다. 생체정보 원본은 앱·서버가 수집하지 않고 OS 성공 여부만 사용한다. 실패·미등록·기기 변경 시 OS가 허용한 기기 암호·PIN을 대체 인증으로 제공하되 계정 삭제·로그인 방식 변경 등에는 기존 `reauthProof`를 별도로 요구한다.

앱이 background/inactive로 전환되는 즉시 native privacy cover를 올려 iOS app switcher와 Android 최근 앱 화면에서 마지막 콘텐츠를 가린다. foreground 복귀 후 잠금 필요 여부를 판정한 다음 cover를 제거한다. 앱 내부의 일반 스크린샷은 차단하지 않으며 Android `FLAG_SECURE`를 전역 적용하지 않는다.

첫 출시의 서비스 푸시는 다음 세 종류로 제한하며 각 항목을 개별로 끌 수 있다.

- 내가 소유한 공간에 새 멤버가 초대로 참여했을 때
- 준비물 또는 요리 재료의 담당자가 나로 지정되거나 다른 사람으로 변경되었을 때
- 참여 중인 여행이 임박했을 때

OS에 전달하는 title/body는 `Daymo에 새 알림이 있어요`처럼 일반 문구만 사용하고 여행명, 장소, 준비물, 멤버 이름과 사진을 넣지 않는다. payload에는 추측하기 어려운 opaque notification ID만 담고 앱을 열어 membership을 다시 확인한 뒤 상세 내용과 이동 경로를 조회한다.

일정·장소·준비물·요리·메모의 일반적인 추가와 수정은 푸시하지 않고 증분 sync 및 앱 내 최신 상태로 보여준다. 행위자 본인에게는 자신의 변경으로 발생한 푸시를 보내지 않으며, 하나의 변경에서 같은 사용자·기기로 중복 발송하지 않는다.

여행 임박 알림은 공간의 timezone을 기준으로 출발 7일 전과 1일 전, 사용자 현지 시각 오전 9시에 각각 한 번 보낸다. 여행 생성 또는 날짜 변경 시 이미 지난 알림은 소급 발송하지 않고 아직 남은 알림만 예약한다. 여행이 취소·삭제되거나 시작일이 바뀌면 기존 작업은 무효화하며, `(tripId, userId, reminderType, startDate)`를 idempotency key로 사용해 중복 발송을 막는다.

## 13. 증분 동기화 API

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

- 일정·장소·준비·요리·비용·기록의 일반 생성·수정
- 준비물 완료·담당 변경처럼 idempotent intent로 표현 가능한 동작
- 송금 기록 추가처럼 client UUID로 중복을 막을 수 있는 생성

오프라인 큐 제외:

- 삭제와 목록 전체 교체(송금 기록 되돌리기, 참가자 목록 교체 포함)
- 초대·멤버·권한 변경
- 사진 byte 전송과 quota 확정

앱은 실행, foreground 복귀, 네트워크 재연결과 사용자 새로고침에서 sync를 시작한다. background sync는 OS가 허용한 실행 기회에만 수행한다. SSE가 정상이면 주기 polling을 함께 돌리지 않고, SSE 실패 시에만 지수 backoff polling으로 전환한다.

## 14. 사진 전송 최적화

사진 응답은 권한이 필요한 `thumbnailUrl`, `displayUrl`, `originalUrl`, 각 byte 크기와 checksum을 분리한다. Daymo에 추가가 완료된 사진은 원본을 반드시 보유한다.

- 목록: 긴 변 최대 480px JPEG 썸네일만 요청
- 상세: 긴 변 최대 1440px JPEG 표시본 요청, 사용자가 원본 보기를 선택할 때만 원본 요청
- 전체 화면: 긴 변 최대 1440px 표시본 요청
- 원본: 사용자가 확대하거나 기기에 저장할 때만 다운로드 요청
- 업로드: 선택한 원본을 VPS에 저장하고 서버 작업이 표시본·썸네일을 생성. 완료 전에는 `uploading` 상태 표시
- HTTP range, immutable file key와 기기 파일 캐시를 사용
- 사진 업로드 네트워크 기본값은 `Wi-Fi 및 모바일 데이터`이며 사진 추가 후 원본까지 즉시 전송한다. 설정에서 `Wi-Fi에서만 업로드`를 고르면 모바일 데이터에서는 원본을 기기 내 영속 대기열에 보관하고 Wi-Fi 연결 및 OS 실행 기회가 생길 때 자동 재개한다. 사진마다 선택을 다시 묻지 않으며 대기 개수·용량, 실패 상태와 `모바일 데이터로 지금 업로드` 동작만 제공한다. 원본 자동 다운로드는 하지 않고 낮은 품질 썸네일을 우선한다.
