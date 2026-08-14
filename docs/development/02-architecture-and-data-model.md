# 시스템·데이터 설계

## 1. 화면과 도메인 매핑

| 현재 UI | 핵심 도메인 | 서버 연결 시 유지할 동작 |
| --- | --- | --- |
| 로그인/회원가입 | Auth, User | 이메일과 Apple/Google/Kakao/Naver 로그인 |
| 홈 | Dashboard | 다음 여행, 숙소, 일정·장소·준비 개수, 빠른 이동, 지난 여행 기록 |
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
                 ├─ private VPS volume: 사진
                 └─ background jobs: 썸네일·정리
```

- 화면은 서버 테이블 구조를 직접 알지 않고 feature repository와 REST API를 거친다.
- 모든 데이터 조회는 활성 `space_id`와 `trip_id` 범위로 제한한다.
- 홈은 여러 테이블을 연속 호출하지 않고 집계 RPC/API 하나로 받는다.
- 앱 시작 시 세션과 마지막 공간/홈 캐시를 먼저 그린 뒤 백그라운드 갱신한다.
- 체크, 담당 변경, 태그 지정은 낙관적으로 반영하고 실패 시 되돌린다.

### 기기와 서버의 책임

| 데이터/행동 | 저장 위치 | 이유 |
| --- | --- | --- |
| 테마, 화면 모드, 필터, 접힘 상태 | 기기 | 사용자 한 명에게만 보이는 환경 |
| 작성 중인 메모·일기·폼 | 기기 | 입력 손실 방지, 공유 전에는 개인 데이터 |
| 최근 검색어·최근 본 여행 | 기기 | 다른 멤버에게 공유할 필요 없음 |
| 지난 여행 편집 확인 시각 | 기기 | 같은 여행·기기에서 10분간만 사용하는 UI 안전장치 |
| 사진 업로드 네트워크 설정 | 기기 | 요금제와 연결 환경이 기기마다 다르므로 기기별 적용 |
| 지도 path, 앱 그림·아이콘 | 앱 bundle | 네트워크 없이 즉시 표시 |
| 홈/여행/일정/장소/준비/요리 조회본 | SQLite 캐시 | 즉시 표시하고 변경분만 수신 |
| 여행·일정·담당·체크·태그·공동 메모 원본 | 서버 | 멤버 간 동일한 결과와 백업 필요 |
| 프로필과 공간 멤버/권한 | 서버 | 인증·권한 판단의 기준 |
| 사진 표시본/선택 원본 | VPS private volume | 다른 멤버 공유와 기기 분실 대비 |
| 사진 썸네일·최근 표시본 | 기기 파일 캐시 | 반복 다운로드 방지 |

서버 호출 없이 기기에서 처리하는 행동:

- 네이버·카카오 공유 텍스트에서 이름·주소·URL 형식 추출
- 준비물/요리 목록의 복사 텍스트 생성과 붙여넣기 문법 검사
- 이미 받은 목록의 태그·담당·상태 필터와 정렬
- 여행 날짜의 달력 범위, 진행률, 개수와 연애 일수 계산
- 공간 timezone 기준 지난 여행 판정과 여행별 편집 확인 10분 TTL 계산
- 대한민국 지도 확대/이동과 지역 선택
- 사진 리사이즈·방향 보정·checksum 계산

서버가 필요한 행동:

- 공유된 원본을 만들거나 변경하는 모든 CRUD와 담당/체크
- 멤버 초대·권한·공간 전환에 필요한 최신 membership 확인
- 모든 여행을 대상으로 하는 통합 검색과 통계
- 다른 멤버의 최신 변경 수신과 충돌 판정
- 지도 단축 URL redirect 확인/장소 보강처럼 외부 네트워크가 필요한 작업
- 사진 공유 원본 업로드, 권한 있는 다운로드 URL 발급

서버가 원본인 데이터도 매 화면 진입마다 전체 다운로드하지 않는다. SQLite snapshot을 먼저 표시하고 sync cursor 이후 변경분만 받는다. 자세한 규칙은 [`07-local-first-and-sync.md`](./07-local-first-and-sync.md)를 따른다.

## 3. 핵심 데이터 모델

모든 주요 테이블은 `id uuid`, `created_at`, `updated_at`, `created_by`를 공통으로 가진다. 공동 편집 대상은 `version int`를 추가한다.

### 계정과 공간

- `users`: `id`, `email`, `email_verified_at nullable`, `password_hash nullable`, `display_name`, `avatar_path`, `timezone`, `status`
- `oauth_accounts`: `user_id`, `provider`, `provider_subject`, `provider_email`
- `refresh_tokens`: `user_id`, `device_id`, `token_family_id`, `token_hash`, `last_used_at`, `expires_at`, `replaced_by`, `revoked_at`, `revoke_reason`
- `email_verification_tokens`: `user_id`, `token_hash`, `expires_at`, `used_at`, `revoked_at`
- `password_reset_tokens`: `user_id`, `token_hash`, `expires_at`, `used_at`, `revoked_at`
- `devices`: `user_id`, `installation_id`, `platform`, `app_version`, `last_seen_at`, `revoked_at`
- `notification_preferences`: `user_id`, `space_id nullable`, `invite_joined`, `assignment_changes`, `trip_reminders`, `marketing`, `updated_at`
- `push_tokens`: `device_id`, `provider`, `token_ciphertext`, `last_validated_at`, `revoked_at`
- `legal_documents`: `type`, `version`, `locale`, `content_url`, `effective_at`, `required`
- `legal_acceptances`: `user_id`, `document_id`, `accepted`, `accepted_at`, `withdrawn_at`, `evidence_hash`
- `privacy_requests`: `user_id`, `type(access|correction|deletion|restriction|withdrawal)`, `status`, `requested_at`, `completed_at`
- `spaces`: `name`, `relationship_type(couple|friends|family|other)`, `owner_id`, `timezone`, `deletion_requested_at`, `deletion_scheduled_at`, `deleted_at`
- `memberships`: `space_id`, `user_id`, `role(owner|editor|viewer)`, `nickname`, `joined_at`, `left_at`, `removed_by`
- `space_invites`: `space_id`, `token_hash`, `role`, `max_uses(10)`, `used_count`, `expires_at`, `revoked_at`, `created_by`
- `space_invite_acceptances`: `invite_id`, `membership_id`, `accepted_by`, `accepted_at`
- `relationship_profiles`: `space_id`, `started_on nullable`

OAuth provider의 이메일이 기존 계정과 같아도 자동 병합하지 않는다. 기존 비밀번호 또는 이미 연결된 provider로 재인증한 뒤 `oauth_accounts`를 연결한다. 사용자는 연결된 로그인 방식을 확인·해제할 수 있지만 사용 가능한 마지막 로그인 수단은 해제할 수 없다.

이메일 계정 비밀번호는 8~128자로 받고 문자 종류 조합은 강제하지 않는다. Unicode, 공백, 붙여넣기와 비밀번호 관리자를 허용하되 흔하거나 유출된 비밀번호 및 이메일과 동일한 값은 거부한다. NFC 정규화 후 전체 값을 Argon2id로 단방향 hash하며 원문·복호화 가능한 값을 저장하지 않는다. 주기적 변경은 강제하지 않고 유출 정황이나 계정 침해가 확인될 때만 재설정한다.

access token은 15분 동안 유효하고 refresh token은 마지막 정상 사용 시점부터 90일 동안 유효하다. refresh 성공 때마다 새 token으로 교체하고 이전 token을 즉시 폐기한다. 이미 교체된 token이 다시 사용되면 재사용 공격으로 보고 해당 token family를 전부 폐기한다. 앱은 refresh token만 OS SecureStore/Keychain에 저장하고 access token은 가능하면 메모리에만 둔다.

사용자당 활성 기기 세션은 최대 5개다. 새 기기 로그인으로 한도를 넘으면 `devices.last_seen_at`이 가장 오래된 세션의 refresh token family와 push token을 폐기한다. 현재 로그인 중인 기기와 새 기기는 자동 종료 후보에서 제외하고, 로그인 응답에 종료된 기기의 표시 이름과 마지막 사용 시각을 포함한다.

계정 삭제, 이메일·비밀번호 변경, 로그인 방식 연결·해제는 실행할 때마다 별도의 재인증을 요구한다. 이메일 계정은 현재 비밀번호, OAuth 계정은 연결된 provider의 새 인증 결과로 확인한다. 재인증 결과는 해당 작업과 nonce에만 묶인 1회용 proof로 발급하며 다른 민감 작업이나 후속 요청에 재사용하지 않는다. 공간 삭제는 재인증 대신 공간 이름 입력과 최종 경고 확인을 연속으로 요구한다.

하나의 공간에는 owner를 포함해 최대 10명까지 참여할 수 있다. 공간 초대 링크는 생성 시점부터 7일 동안 유효하며 최대 10회 참여에 사용할 수 있다. 로그인과 이메일 인증을 마친 사용자는 유효한 링크를 통해 별도 owner 승인 없이 바로 참여하고, 기본 권한은 함께 여행을 편집할 수 있는 `editor`다. 소유자가 링크를 폐기하면 남은 기간과 횟수에 관계없이 즉시 사용할 수 없게 한다. 여러 명이 동시에 참여해도 공간 정원을 넘지 않도록 사용 횟수 증가와 membership 생성을 하나의 transaction에서 처리한다.

### 여행

- `trips`: `space_id`, `title`, `region_code`, `region_name`, `start_date`, `end_date`, `status(planning|ongoing|completed|archived)`, `summary`, `cooking_enabled`, `cover_photo_id`, `archived_at`, `deleted_at`, `deletion_scheduled_at`
- `trip_days`: `trip_id`, `date`, `day_index`
- `schedule_items`: `trip_id`, `trip_day_id`, `start_at`, `end_at`, `title`, `type`, `note`, `trip_place_id`, `sort_order`
- `transports`: `trip_id`, `direction(outbound|return)`, `method`, `departure_name`, `departure_at`, `arrival_name`, `arrival_at`, `booking_status`, `note`
- `stays`: `trip_id`, `trip_place_id`, `check_in_at`, `check_out_at`, `has_kitchen nullable`, `booking_url`, `note`
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

재료와 준비물의 완료 상태도 별도로 유지한다. 연결된 한쪽을 완료·해제하면 다른 쪽에 반영할지 사용자에게 제안할 수 있지만 자동으로 양방향 변경하지 않는다. 여러 요리에서 같은 재료를 하나의 준비물로 합친 경우에도 각 재료의 상태를 임의로 일괄 변경하지 않는다.

### 메모와 기록

- `memos`: `trip_id`, `body`, `author_id`, `edited_at`, `deleted_at`, `deleted_by`
- `diaries`: `trip_id`, `author_id`, `title nullable`, `body`, `written_on`
- `photos`: `trip_id`, `uploader_id`, `original_path`, `display_path`, `thumbnail_path`, `taken_at`, `caption`, `width`, `height`, `original_bytes`, `checksum`, `status`
- `photo_links`: `photo_id`, `target_type(trip|day|place|schedule|stay)`, `target_id`
- `audit_logs`: `space_id`, `actor_id`, `action`, `target_type`, `target_id`, `metadata`

기념 카드는 별도 공동 원본을 만들지 않는다. 선택한 사진 ID, 제목과 스타일은 기기 draft로 유지하고 렌더링 결과를 사용자가 저장·공유한다. 향후 멤버 간 카드 구성을 공유해야 할 때만 `keepsakes` 도메인을 추가한다.

`trips.cooking_enabled`가 요리 탭 표시의 최종 원본이다. 숙소의 `has_kitchen`은 사실 정보이며 숙소 등록·수정 시 탭을 켜거나 끌지 제안하는 데만 사용한다. 탭을 꺼도 기존 요리·재료는 보존하고 다시 켜면 그대로 표시한다.

## 4. 권한

| 기능 | owner | editor | viewer |
| --- | --- | --- | --- |
| 공간 수정/삭제, 멤버 내보내기 | 가능 | 불가 | 불가 |
| 여행과 하위 데이터 작성 | 가능 | 가능 | 불가 |
| 여행 보관/보관 해제 | 가능 | 가능 | 불가 |
| 여행 삭제/복구 | 가능 | 불가 | 불가 |
| 준비물 체크·담당 변경 | 가능 | 가능 | 불가 |
| 본인/타인 메모 수정 | 가능 | 본인만 수정 | 불가 |
| 본인/타인 메모 삭제 | 가능 | 가능 | 불가 |
| 본인/타인 사진 설명·연결 수정 | 가능 | 본인 사진만 가능 | 불가 |
| 본인/타인 사진 삭제·복구 | 가능 | 본인 사진만 가능 | 불가 |
| 조회 | 가능 | 가능 | 가능 |

Daymo는 같은 공간의 editor가 타인의 메모도 삭제할 수 있게 한다. viewer는 삭제할 수 없다. 모든 메모 삭제는 soft delete하고 삭제자·시각과 대상 ID를 감사 로그에 남긴다.

서버 권한 검증 원칙:

- 모든 API application service가 인증 사용자 membership을 확인한다.
- repository 조회 자체에 `space_id` 또는 권한 조건을 포함해 IDOR를 차단한다.
- 하위 엔티티의 `trip_id`가 속한 공간을 서버에서 역참조한다.
- 클라이언트가 전달한 작성자와 완료자는 신뢰하지 않고 SecurityContext 사용자 ID를 사용한다.
- 삭제는 기본적으로 soft delete하고 audit log를 남긴다.
- 메모·사진 등 사용자 공동 콘텐츠는 삭제 후 일반 조회에서 즉시 제외하고 7일간 휴지통에 보관한다. 메모는 owner와 editor가 복원할 수 있다. 사진은 업로더가 본인 사진을, owner가 모든 사진을 삭제·복구할 수 있고 다른 editor의 사진에는 접근할 수 없다. 7일 뒤 원본 파일과 row를 최종 삭제한다.
- 여행의 기본 정리 동작은 되돌릴 수 있는 보관이다. 보관은 일반 목록에서 숨기는 정리 상태일 뿐 편집 잠금이 아니므로 owner와 editor는 보관 중에도 일정·장소·준비물·요리·기록·사진을 계속 추가·수정할 수 있다. 여행 삭제는 보관함의 별도 관리 메뉴에서만 시작하고 즉시 조회에서 숨긴 뒤 7일간 여행 휴지통에서 복구할 수 있다. 유예기간이 지나면 종속 데이터 purge를 시작한다.
- 여행 종료일이 공간 timezone의 오늘보다 이전이어도 자동 보관하지 않는다. 지난 여행의 `여행·장소·요리` 탭에서 쓰기 동작을 시작할 때 기기 UI가 한 번 확인하고, 동의 시 `(tripId, deviceId)` 기준 10분간 다시 묻지 않는다. `준비·기록·사진`은 여행 후 정리를 고려해 확인 대상에서 제외한다. 이는 로컬 실수 방지 장치이며 서버 권한이나 version 검증을 대체하지 않는다.
- 마지막 owner는 다른 멤버에게 owner를 이전하기 전에는 공간을 나갈 수 없다. 멤버가 본인뿐이면 명시적인 공간 삭제 절차만 제공한다.
- 멤버가 스스로 공간을 나가도 그동안 만든 공동 일정·장소·준비·요리·기록·사진은 유지하고 작성자 계정 연결과 당시 표시 이름도 유지한다. 나가기 확인 전에 본인이 업로드한 사진을 모아 검토·삭제할 진입점을 제공한다. 완료 후 membership을 비활성화하고 해당 공간의 로컬 snapshot·서명 URL·사진 cache를 제거한다.
- owner가 멤버를 내보낼 때도 공동 콘텐츠와 작성자 이름은 유지하고 membership 접근만 즉시 차단한다. 내보내기 동작에 해당 멤버 콘텐츠 일괄 삭제 옵션을 제공하지 않으며, 필요한 정리는 콘텐츠별 기존 권한과 7일 휴지통 절차를 따른다.
- 공간 삭제는 owner가 공간 이름을 정확히 입력한 뒤 삭제 영향과 7일 유예 안내를 다시 확인해야 요청할 수 있다. 요청 즉시 일반 목록과 동기화 대상에서 숨기고, 7일 동안 owner가 복구할 수 있으며 유예기간이 지나면 공간과 종속 콘텐츠의 최종 삭제 작업을 시작한다.
- 법적 문서 동의 이력은 문서 version별로 남기되 동의 철회 후 불필요한 증빙 데이터는 정해진 보유기간에 파기한다.
- 계정 최종 삭제 시 공동 일정·장소·준비·요리·메모·사진은 공간 기록으로 유지하되 작성자 연결을 비식별 주체로 치환한다. 이메일·OAuth·프로필과 개인 설정은 삭제하고 공동 화면에는 `탈퇴한 멤버`로 표시한다.

## 5. 동시 편집과 오프라인

- 증분 sync API가 공동 데이터 정합성의 기준이다. foreground에서는 SSE로 변경 신호를 받고 해당 Query key 또는 sync를 갱신한다. 연결 실패·이벤트 유실은 앱 활성화와 짧은 주기 재조회로 복구한다.
- 수정 API에 `version`을 전달하고 불일치 시 `409 VERSION_CONFLICT`를 반환한다.
- 체크박스와 담당 변경은 마지막 서버 결과를 기준으로 재조정한다.
- 작성 중인 긴 메모/일기는 로컬 draft를 보존한다.
- P0는 오프라인 읽기와 draft 보존을 보장한다. P1에서 idempotency가 보장되는 준비물 체크·담당 변경·새 항목 추가를 pending mutation으로 지원한다.
- 삭제·준비물 일괄 교체·권한 변경은 온라인에서만 수행한다. 모든 동작을 무리하게 오프라인화하지 않는다.

## 6. 성능 설계

- 앱 시작에 지도 SVG 전체 계산이나 사진 원본 다운로드를 넣지 않는다.
- 지도 행정구역 path는 앱 asset으로 유지하고 여행 개수만 API로 받는다.
- 여행 상세은 탭별 지연 조회하되 상단 여행 정보와 첫 탭은 한 번에 받는다.
- 목록 응답은 cursor pagination, 기본 20개다.
- 사진은 썸네일을 먼저 표시하고 화면 크기에 맞는 표시본을 요청한다.
- 홈 캐시는 stale-while-revalidate로 즉시 표시한다.
