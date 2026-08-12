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

주요 오류 코드는 `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`, `NOT_FOUND(404)`, `VERSION_CONFLICT(409)`, `VALIDATION_ERROR(422)`, `RATE_LIMITED(429)`다.

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
| POST | `/auth/login` | 이메일 로그인 |
| POST | `/auth/logout` | 현재 세션 종료 |
| POST | `/auth/refresh` | 세션 갱신 |
| GET | `/auth/oauth/{provider}/start` | OAuth 시작 (`apple/google/kakao/naver`) |
| GET | `/auth/oauth/{provider}/callback` | code 교환 후 앱으로 복귀 |
| GET | `/me` | 내 프로필·참여 공간 목록 |
| PATCH | `/me` | 이름/프로필 사진 수정 |
| DELETE | `/me` | 계정 탈퇴 요청 |
| GET | `/legal/documents?context=signup` | 현재 약관/고지와 필수·선택 구분 |
| POST | `/legal/acceptances` | 문서 version별 동의/확인 기록 |
| GET | `/me/legal-acceptances` | 내 동의 내역 |
| DELETE | `/me/legal-acceptances/{type}` | 선택 동의 철회 |
| POST | `/me/privacy-requests` | 열람·정정·삭제·처리정지 요청 |
| GET | `/me/privacy-requests/{requestId}` | 요청 처리 상태 |

`POST /auth/signup`

```json
{ "email": "sky@example.com", "password": "minimum-8", "displayName": "하늘" }
```

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
| GET | `/spaces/{spaceId}/members` | 멤버 목록 |
| PATCH | `/spaces/{spaceId}/members/{membershipId}` | 별명·권한 변경 |
| DELETE | `/spaces/{spaceId}/members/{membershipId}` | 내보내기/나가기 |
| POST | `/spaces/{spaceId}/invites` | 초대 링크 생성 |
| POST | `/invites/{token}/accept` | 초대 참여 |

공간 생성 요청:

```json
{ "name": "주말 여행", "relationshipType": "friends", "startedOn": null, "timezone": "Asia/Seoul" }
```

멤버 삭제는 대상 이름과 영향을 확인하는 UI를 거친다. 마지막 owner는 나갈 수 없다.

## 4. 홈과 여행 탐색

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `/spaces/{spaceId}/dashboard` | 홈 한 번에 조회 |
| GET | `/spaces/{spaceId}/trips` | 목록/캘린더용 여행 조회 |
| GET | `/spaces/{spaceId}/trip-regions` | 지도 지역별 여행 수 |
| POST | `/spaces/{spaceId}/trips` | 여행 생성 |
| GET | `/trips/{tripId}` | 여행 기본 정보 |
| PATCH | `/trips/{tripId}` | 여행 수정 |
| DELETE | `/trips/{tripId}` | 여행 삭제 |
| POST | `/trips/{tripId}/archive` | 여행 보관 |

여행 목록 query: `status`, `from`, `to`, `regionCode`, `q`, `limit`, `cursor`, `sort`.

여행 생성 요청:

```json
{
  "title": "서울 구로구",
  "regionCode": "11",
  "regionName": "서울",
  "startDate": "2026-08-21",
  "endDate": "2026-08-23",
  "summary": "숙소에서 수다와 밀푀유나베"
}
```

서버는 여행과 기간 내 `trip_days`를 한 트랜잭션으로 생성한다. 종료일은 시작일보다 빠를 수 없으며 초기 최대 기간은 60일로 제한한다.

대시보드 응답:

```json
{
  "data": {
    "nextTrip": { "id": "uuid", "title": "서울 구로구", "startDate": "2026-08-21", "endDate": "2026-08-23" },
    "stay": { "name": "JS호텔", "checkInAt": "2026-08-21T06:00:00Z" },
    "counts": { "schedule": 3, "places": 8, "packingDone": 2, "packingTotal": 6 },
    "relationshipDay": null
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
| POST | `/trips/{tripId}/places/import` | 여러 장소 붙여넣기 |
| GET | `/spaces/{spaceId}/tags?scope=place` | 사용 중인 태그 |

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

## 9. 메모·사진·일기

| Method | Path | 용도 |
| --- | --- | --- |
| GET/POST | `/trips/{tripId}/memos` | 메모 목록/추가 |
| PATCH/DELETE | `/memos/{memoId}` | 메모 수정/삭제 |
| GET/POST | `/trips/{tripId}/diaries` | 일기 조회/작성 |
| PATCH/DELETE | `/diaries/{diaryId}` | 일기 수정/삭제 |
| POST | `/trips/{tripId}/photos/upload-url` | 서명 업로드 URL 발급 |
| POST | `/trips/{tripId}/photos/complete` | 업로드 확정 |
| GET | `/trips/{tripId}/photos` | 사진 목록 |
| PATCH/DELETE | `/photos/{photoId}` | 캡션/연결 수정, 삭제 |
| GET | `/spaces/{spaceId}/stats` | 여행·지역·기록 통계 |

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

사진 업로드 순서:

1. 앱에서 권한 확인, 선택/촬영, 방향 보정과 리사이즈
2. `upload-url` 요청
3. 서명 URL을 사용해 S3 호환 Storage에 직접 업로드
4. `complete`에 크기, MIME, 촬영일, 연결 대상을 전달
5. 서버 검증 후 Photo 생성, 썸네일 작업 큐 등록

## 10. 통합 검색과 실시간 이벤트

`GET /spaces/{spaceId}/search?q=은행골&types=trip,place,schedule,recipe,packing,memo&limit=20`

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

## 11. 증분 동기화 API

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

## 12. 사진 전송 최적화

사진 응답은 `thumbnailUrl`, `displayUrl`, `originalUrl nullable`, 각 byte 크기와 checksum을 분리한다.

- 목록: 320~480px 썸네일만 요청
- 전체 화면: 기기 화면에 맞는 1280~1920px 표시본 요청
- 원본: 사용자가 확대하거나 기기에 저장할 때만 서명 URL 요청
- 업로드: 앱에서 방향 보정 후 표시본을 만들고 Wi-Fi 전용 원본 업로드 옵션 지원
- HTTP range, immutable object key, 긴 CDN/브라우저 캐시를 사용
- 데이터 절약 모드에서는 자동 동영상/원본 다운로드를 하지 않고 낮은 품질 썸네일을 우선
