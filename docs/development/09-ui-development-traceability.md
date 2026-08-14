# UI-개발 추적표

이 문서는 현재 UI의 버튼과 상태가 실제 개발에서 어디에 저장되고 어떤 API·테스트로 완성되는지 연결한다. 구현 중 버튼이 더미 동작으로 남거나 서버 데이터가 화면에 연결되지 않는 일을 막는 기준이다.

## 상태 표기

- `L`: 기기 로컬 처리 또는 저장
- `S`: 서버가 원본이며 SQLite에 캐시
- `H`: 로컬 처리 후 서버 원본과 연결
- `결정`: 구현 전에 사용자 승인 필요

## 인증·앱 시작

| 사용자 흐름 | 책임 | 계약/저장 | 필수 검증 |
| --- | --- | --- | --- |
| 자동 로그인 | H | SecureStore token, `/auth/refresh`, `/me` | 만료·폐기·오프라인 재실행 |
| 이메일 가입/로그인 | S | `/auth/signup`, `/auth/login` | 중복 이메일, 잘못된 입력, rate limit |
| 비밀번호 재설정 | S | `/auth/password/forgot`, `/auth/password/reset` | 계정 존재 노출 방지, token 1회 사용 |
| Apple/Google/Kakao/Naver | S | OAuth start/callback/exchange, PKCE/state | 취소, 계정 병합, provider 오류 |
| 약관·선택 동의 | S | legal documents/acceptances | version 변경, 선택 거부·철회 |
| 로그아웃·계정 삭제 | H | session revoke, local namespace 삭제 | pending 작업 경고, 다른 기기 세션 |

## 홈

| UI | 책임 | 계약/저장 | 완료 조건 |
| --- | --- | --- | --- |
| 다음 여행 종이 카드 | S | dashboard `nextTrip`, `stay` | 캐시 우선, 여행 없음/진행 중 상태 |
| 일정·장소·준비 바로가기 | L+S | route에 `tripId`와 destination | 각 버튼이 정확한 탭/추가 화면으로 이동 |
| 출발 전 체크리스트 | S | dashboard action summary | 원본 변경 시 집계 갱신 |
| 다시 펼쳐보는 여행 | S | dashboard `recentCompletedTrips` | 카드가 해당 여행 기록 탭으로 이동 |
| 관계 표현 | H | active space relationship | 공간 전환 즉시 갱신 |

## 여행 목록·지도·캘린더

| UI | 책임 | 계약/저장 | 완료 조건 |
| --- | --- | --- | --- |
| 목록/지도/캘린더 보기 | H | trips cache, region aggregate | 세 보기의 여행 집합 일치 |
| 지도 확대·이동 | L | 앱 asset, viewport preference | 네트워크 없이 동작, 반복 확대 위치 안정 |
| 지역 선택과 여행 목록 | H | local filter, 필요 시 region query | 선택 직후 결과 표시 |
| 기간 캘린더 | L | trip start/end 계산 | 월 경계·윤년·연속 배경 |
| 새 여행 | S | `POST /spaces/{spaceId}/trips` | 중복 전송 방지, 생성 후 선택 여행으로 이동 |
| 여행 수정·삭제·보관 | S | trip version/soft delete/archive | 충돌·권한·삭제 확인 |

## 여행 탭·일정·교통·숙소

| UI | 책임 | 계약/저장 | 완료 조건 |
| --- | --- | --- | --- |
| 날짜별 일정 CRUD | S | schedule API, sort order | 긴 목록, 날짜 변경, 충돌 |
| 전체 보기·접기 | L | UI preference | 데이터 변경 후 개수 정확 |
| 장소를 일정에 담기 | S | tripPlace→schedule transaction | 중복 후보와 원본 연결 유지 |
| 가는 편·오는 편 | S | transport direction | 전환·저장·오는 편 후속 제안 |
| 체크인·체크아웃 | S | stay + tripPlace | 시간대, 여행 범위 밖 경고 |
| 예약 정보 | S | reservation CRUD | 외부 URL 검사, 상태 수정 |
| 상단 공동 메모 | S | memo CRUD/version/permissions | 작성자, 수정, 삭제와 상단 미리보기 동시 갱신 |
| 요리 탭 표시 | S | trip `hasKitchen` 또는 kitchen availability | 설정 변경 시 탭 안전 전환 |

`보완 필요`: 현재 `trips` 모델에 요리 탭 표시의 원본 필드가 없다. 구현 전 `has_kitchen boolean` 또는 `cooking_enabled boolean` 중 하나를 결정한다. 권장안은 실제 주방 사실과 UI 표시를 분리할 수 있는 `cooking_enabled`이며 숙소 등록 시 제안만 한다.

## 장소

| UI | 책임 | 계약/저장 | 완료 조건 |
| --- | --- | --- | --- |
| 장소 CRUD | S | trip place API/version | 200개 목록과 pagination |
| 검색·상태·태그 필터 | L | SQLite | 필터 변경에 API 재호출 없음 |
| 추천/직접 태그 | H | local 입력, tag/tagging API | 정규화·중복·마지막 사용 정리 |
| 네이버 공유 텍스트 자동 채우기 | L | parser | 이름·주소·URL 변형 fixture |
| 단축 URL 보강 | S | resolve endpoint | 실패해도 로컬 추출 값 저장 가능 |
| 숙소로 등록 | S | register-stay transaction | lodging으로 저장한 장소에만 노출 |
| 복사·붙여넣기 | H | local parse/preview, bulk API | 추가/교체 구분, 원자성, 오류 행 표시 |

## 준비

| UI | 책임 | 계약/저장 | 완료 조건 |
| --- | --- | --- | --- |
| 개인·공용·미정 담당 | S | membership assignment | 탈퇴 멤버 처리, viewer 차단 |
| 행 전체 체크 | H | optimistic complete API | 두 기기 동시 체크, 실패 rollback |
| 상태·담당·태그 필터 | L | SQLite | 300개에서도 즉시 반응 |
| 그룹 접기·진행률 | L | preference/derived value | 고유 item 기준 계산 |
| 항목 수정·삭제 | S | versioned CRUD | 중복 후보, 권한과 삭제 확인 |
| 목록 복사·붙여넣기 | H | local parse, bulk transaction | 추가/교체 preview와 idempotency |
| 요리 재료 불러오기 | S | ingredient→checklist link | 중복 정책과 출처 유지 |

## 요리

| UI | 책임 | 계약/저장 | 완료 조건 |
| --- | --- | --- | --- |
| 여러 요리 CRUD | S | recipe API/version | 30개 메뉴, 동일 이름 정책 |
| 재료·분류·준비 방법 | S | ingredient CRUD | 500개 재료, 직접 분류 |
| 통합 장보기·내 재료 | L | SQLite derived query | 요리별 수량 보존, 필터 정확 |
| 재료 체크 | S | ingredient completion | 준비물과의 관계 결정 필요 |
| 레시피/YouTube 링크 | H | external link validation | 허용 scheme, 열기 실패 |
| GPT 프롬프트·붙여넣기 | H | clipboard/local parser, confirmed bulk write | 자동 저장 금지, 오류 행별 표시 |

`결정 필요`: 요리 재료와 가져온 준비물의 완료 상태를 양방향 동기화할지 분리할지 확정한다. 권장안은 출처 연결은 유지하되 완료 상태는 분리하고, 한쪽 완료 시 다른 쪽에 반영 여부를 제안하는 방식이다.

## 기록

| UI | 책임 | 계약/저장 | 완료 조건 |
| --- | --- | --- | --- |
| 사진 선택·원본 업로드 | H | picker/filesystem/upload session | 권한 거부, 중단, 재시도, checksum |
| 사진 날짜·설명 수정 | S | photo patch | 촬영일→여행 일차 변환 |
| 일기 CRUD와 draft | H | local draft + diary API | 제목·본문, 충돌 비교, 삭제 |
| 여행 통계 | S | trip/space stats | 현재 여행과 전체 통계 구분 |
| 기념 카드 | L | photo IDs + local render/share | 사진 선택, 기기 저장, 공유 실패 |

## 찾기

| UI | 책임 | 계약/저장 | 완료 조건 |
| --- | --- | --- | --- |
| 최근 검색 | L | AsyncStorage/preference | 최대 6개, 개별/전체 삭제 |
| 현재 여행 내부 필터 | L | SQLite query | 네트워크 없이 결과 |
| 공간 전체 검색 | S | search API | 공간 격리, pagination, 삭제 제외 |
| 결과 빠른 동작 | H | destination + entity ID | 정확한 여행·탭·항목으로 이동 |

## 우리·설정·알림

| UI | 책임 | 계약/저장 | 완료 조건 |
| --- | --- | --- | --- |
| 공간 전환 | H | membership + local activeSpaceId | 권한 상실 캐시 제거 |
| 멤버 초대·권한·내보내기 | S | invites/membership API | 마지막 owner 보호, IDOR 차단 |
| 테마·화면 모드 | L | AsyncStorage | 앱 재실행·시스템 모드 |
| 서비스 알림 설정 | H | OS permission + notification preference | 권한 거부·설정 이동 |
| 마케팅 수신 | S | legal acceptance/preference history | 기본 해제, 철회 이력 |
| 여행 목록 공유 | L | Share API | 민감정보 포함 전 preview |

## 공통 개발 완료 정의

각 행은 다음 조건을 모두 만족해야 `완료`다.

1. 화면이 실제 ID 기반 route와 repository에 연결됨
2. 로딩·빈 상태·오류·권한 없음·오프라인 상태가 정의됨
3. 재실행 후 유지 여부가 책임 구분과 일치함
4. 다른 계정/기기에서 공유 결과가 일치함
5. 접근성 이름·상태와 큰 글자 검수가 유지됨
6. 단위 또는 API/E2E 테스트가 추적됨
7. 더미 상태와 도달 불가능한 버튼이 남지 않음
