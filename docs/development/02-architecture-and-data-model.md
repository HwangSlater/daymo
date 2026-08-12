# 시스템·데이터 설계

## 1. 화면과 도메인 매핑

| 현재 UI | 핵심 도메인 | 서버 연결 시 유지할 동작 |
| --- | --- | --- |
| 로그인/회원가입 | Auth, User | 이메일과 Apple/Google/Kakao/Naver 로그인 |
| 홈 | Dashboard | 다음 여행, 숙소, 일정·장소·준비 개수, 빠른 이동 |
| 여행 목록/지도/캘린더 | Trip | 같은 여행 데이터를 세 가지 표현으로 조회 |
| 여행 상세 `여행` | TripDay, Schedule, Stay, Transport, Reservation | 날짜별 전체 일정과 여행 정보 |
| `장소` | Place, TripPlace, Tag | 검색·태그·후보/일정 상태, 숙소 등록, 지도 열기 |
| `준비` | ChecklistItem, Assignment, Tag | 전체/남음/완료와 멤버별 담당, 일괄 붙여넣기 |
| `요리` | Recipe, Ingredient | 여러 메뉴, 재료 담당·구매, 준비물 가져오기, 출처 링크 |
| `기록` | Photo, Diary | 사진과 여행 일기, 회고·통계 |
| 상단 메모지 | Memo | 공동 메모 생성·수정·삭제 |
| 찾기 | Search | 여행 내부의 모든 구조화 정보 통합 검색 |
| 우리 | Space, Membership, Preference | 공간 전환, 멤버 관리, 관계, 테마/다크모드 |

## 2. 아키텍처

```text
React Native UI
  ├─ local UI state (Zustand / form)
  ├─ server cache (TanStack Query)
  └─ feature repositories
       └─ HTTPS REST/SSE
            └─ Spring Boot modular monolith
                 ├─ PostgreSQL: 도메인 데이터·검색
                 ├─ S3-compatible storage: 사진
                 └─ background jobs: 썸네일·정리
```

- 화면은 서버 테이블 구조를 직접 알지 않고 feature repository와 REST API를 거친다.
- 모든 데이터 조회는 활성 `space_id`와 `trip_id` 범위로 제한한다.
- 홈은 여러 테이블을 연속 호출하지 않고 집계 RPC/API 하나로 받는다.
- 앱 시작 시 세션과 마지막 공간/홈 캐시를 먼저 그린 뒤 백그라운드 갱신한다.
- 체크, 담당 변경, 태그 지정은 낙관적으로 반영하고 실패 시 되돌린다.

## 3. 핵심 데이터 모델

모든 주요 테이블은 `id uuid`, `created_at`, `updated_at`, `created_by`를 공통으로 가진다. 공동 편집 대상은 `version int`를 추가한다.

### 계정과 공간

- `users`: `id`, `email`, `password_hash nullable`, `display_name`, `avatar_path`, `timezone`, `status`
- `oauth_accounts`: `user_id`, `provider`, `provider_subject`, `provider_email`
- `refresh_tokens`: `user_id`, `token_hash`, `expires_at`, `revoked_at`, `device_name`
- `spaces`: `name`, `relationship_type(couple|friends|family|other)`, `owner_id`
- `memberships`: `space_id`, `user_id`, `role(owner|editor|viewer)`, `nickname`, `joined_at`
- `space_invites`: `space_id`, `token_hash`, `role`, `expires_at`, `accepted_at`
- `relationship_profiles`: `space_id`, `started_on nullable`
- `user_preferences`: `user_id`, `theme_id`, `appearance(system|light|dark)`, `last_space_id`

### 여행

- `trips`: `space_id`, `title`, `region_code`, `region_name`, `start_date`, `end_date`, `status(planning|ongoing|completed|archived)`, `summary`, `cover_photo_id`
- `trip_days`: `trip_id`, `date`, `day_index`
- `schedule_items`: `trip_id`, `trip_day_id`, `start_at`, `end_at`, `title`, `type`, `note`, `trip_place_id`, `sort_order`
- `transports`: `trip_id`, `direction(outbound|return)`, `method`, `departure_name`, `departure_at`, `arrival_name`, `arrival_at`, `booking_status`, `note`
- `stays`: `trip_id`, `trip_place_id`, `check_in_at`, `check_out_at`, `booking_url`, `note`
- `reservations`: `trip_id`, `target_type`, `target_id`, `reserved_at`, `status`, `booking_url`, `note`

### 장소와 태그

- `places`: `name`, `address`, `latitude`, `longitude`, `provider`, `provider_place_id`
- `trip_places`: `trip_id`, `place_id`, `category`, `status(saved|scheduled|visited)`, `area`, `memo`
- `tags`: `space_id`, `scope(place|packing|ingredient)`, `name`, `color`
- `taggings`: `tag_id`, `target_type`, `target_id`
- `external_links`: `target_type`, `target_id`, `provider(naver_map|kakao_map|youtube|booking|other)`, `url`, `label`

태그는 별도 삭제 버튼을 우선 제공하지 않는다. 마지막 연결이 사라진 사용자 태그는 서버 정리 작업에서 제거한다. 이름은 공백 정리 후 공간·scope 안에서 중복되지 않게 한다.

### 준비와 요리

- `checklists`: `trip_id`, `title`, `kind(packing|shopping)`
- `checklist_items`: `checklist_id`, `name`, `quantity`, `owner_membership_id nullable`, `is_shared`, `completed_at`, `completed_by`, `source_ingredient_id`, `sort_order`
- `recipes`: `trip_id`, `name`, `memo`, `source_url`, `servings`, `sort_order`
- `ingredients`: `recipe_id`, `name`, `quantity`, `category`, `procurement(bring|buy|undecided)`, `owner_membership_id`, `completed_at`, `sort_order`

재료를 준비물로 가져오면 `source_ingredient_id`로 출처만 연결한 새 준비물을 만든다. 이후 준비물 수정이 레시피 원문을 자동 변경하지 않게 하여 예상치 못한 동기화를 막는다.

### 메모와 기록

- `memos`: `trip_id`, `body`, `author_id`, `edited_at`, `deleted_at`, `deleted_by`
- `diaries`: `trip_id`, `author_id`, `body`, `written_on`
- `photos`: `trip_id`, `uploader_id`, `storage_path`, `thumbnail_path`, `taken_at`, `caption`, `width`, `height`
- `photo_links`: `photo_id`, `target_type(trip|day|place|schedule|stay)`, `target_id`
- `audit_logs`: `space_id`, `actor_id`, `action`, `target_type`, `target_id`, `metadata`

## 4. 권한

| 기능 | owner | editor | viewer |
| --- | --- | --- | --- |
| 공간 수정/삭제, 멤버 내보내기 | 가능 | 불가 | 불가 |
| 여행과 하위 데이터 작성 | 가능 | 가능 | 불가 |
| 준비물 체크·담당 변경 | 가능 | 가능 | 불가 |
| 본인/타인 메모 수정 | 가능 | 본인만 수정 | 불가 |
| 본인/타인 메모 삭제 | 가능 | 공간 정책에 따름 | 불가 |
| 조회 | 가능 | 가능 | 가능 |

`결정 필요`: 현재 요구사항에는 상대 메모 삭제가 포함된다. 그룹 확장을 고려해 `editor가 타인 메모 삭제 가능`을 공간 설정으로 둘지, owner만 허용할지 인증 단계 전에 확정한다.

서버 권한 검증 원칙:

- 모든 API application service가 인증 사용자 membership을 확인한다.
- repository 조회 자체에 `space_id` 또는 권한 조건을 포함해 IDOR를 차단한다.
- 하위 엔티티의 `trip_id`가 속한 공간을 서버에서 역참조한다.
- 클라이언트가 전달한 작성자와 완료자는 신뢰하지 않고 SecurityContext 사용자 ID를 사용한다.
- 삭제는 기본적으로 soft delete하고 audit log를 남긴다.

## 5. 동시 편집과 오프라인

- 중요한 공동 변경은 SSE로 이벤트를 받고 해당 Query key만 무효화한다. 연결 실패 시 앱 활성화/짧은 주기 재조회로 보완한다.
- 수정 API에 `version`을 전달하고 불일치 시 `409 VERSION_CONFLICT`를 반환한다.
- 체크박스와 담당 변경은 마지막 서버 결과를 기준으로 재조정한다.
- 작성 중인 긴 메모/일기는 로컬 draft를 보존한다.
- P0는 완전 오프라인 쓰기를 보장하지 않는다. 오프라인 변경 큐는 P2이며, P0에서는 연결 오류와 재시도 버튼을 명확히 제공한다.

## 6. 성능 설계

- 앱 시작에 지도 SVG 전체 계산이나 사진 원본 다운로드를 넣지 않는다.
- 지도 행정구역 path는 앱 asset으로 유지하고 여행 개수만 API로 받는다.
- 여행 상세은 탭별 지연 조회하되 상단 여행 정보와 첫 탭은 한 번에 받는다.
- 목록 응답은 cursor pagination, 기본 20개다.
- 사진은 썸네일을 먼저 표시하고 화면 크기에 맞는 표시본을 요청한다.
- 홈 캐시는 stale-while-revalidate로 즉시 표시한다.
