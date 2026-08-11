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

## 2. 인증과 프로필

| Method | Path | 용도 |
| --- | --- | --- |
| POST | `/auth/signup` | 이메일 회원가입 |
| POST | `/auth/login` | 이메일 로그인 |
| POST | `/auth/logout` | 현재 세션 종료 |
| POST | `/auth/refresh` | 세션 갱신 |
| GET | `/auth/oauth/{provider}/start` | OAuth 시작 (`apple/google/kakao/naver`) |
| GET | `/auth/oauth/{provider}/callback` | code 교환 후 앱으로 복귀 |
| GET | `/me` | 내 프로필·환경설정·공간 목록 |
| PATCH | `/me` | 이름/프로필 사진 수정 |
| PATCH | `/me/preferences` | 테마, 다크모드, 마지막 공간 저장 |
| DELETE | `/me` | 계정 탈퇴 요청 |

`POST /auth/signup`

```json
{ "email": "sky@example.com", "password": "minimum-8", "displayName": "하늘" }
```

`GET /me` 핵심 응답:

```json
{
  "data": {
    "id": "uuid",
    "displayName": "하늘",
    "avatarUrl": null,
    "preferences": { "themeId": "daymo", "appearance": "system", "lastSpaceId": "uuid" },
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
| POST | `/places/parse-share-text` | 네이버/카카오 공유 텍스트 분석 |
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

공유 텍스트 분석 요청/응답:

```json
{ "text": "[네이버지도]\nJS호텔\n서울 구로구 남부순환로105길 32 JS호텔\nhttps://naver.me/FJOPOMvx" }
```

```json
{
  "data": {
    "provider": "naver_map",
    "name": "JS호텔",
    "address": "서울 구로구 남부순환로105길 32 JS호텔",
    "url": "https://naver.me/FJOPOMvx",
    "suggestedCategory": "lodging",
    "confidence": 0.96
  }
}
```

자동 분류는 입력 폼의 제안일 뿐이다. 사용자가 `숙소`로 저장한 장소에만 숙소 등록 동작을 노출한다.

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
| GET | `/trips/{tripId}/checklist-export` | 복사용 텍스트 생성 |

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
| POST | `/recipes/import` | 고정 텍스트 형식 여러 요리 분석 |
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

일괄 가져오기는 미리보기 결과를 먼저 반환하고 사용자가 확인한 뒤 저장한다. AI 호출을 도입하더라도 원문과 분석 결과를 구분하며 자동 저장하지 않는다.

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
3. Storage에 직접 업로드
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

Realtime topic은 `space:{spaceId}`로 구독하고 payload에는 `entity`, `entityId`, `tripId`, `operation`, `updatedAt`만 보낸다. 상세 데이터는 권한이 적용된 API로 다시 조회한다.
