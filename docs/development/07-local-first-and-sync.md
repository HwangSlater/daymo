# 기기 저장·동기화 설계

## 1. 목표

- 앱을 열면 네트워크 응답을 기다리지 않고 마지막 상태를 즉시 보여준다.
- 변경되지 않은 공동 데이터를 반복 다운로드하지 않는다.
- 개인에게만 의미 있는 설정과 임시 입력은 서버로 보내지 않는다.
- 멤버가 함께 알아야 하는 결과는 반드시 서버를 최종 원본으로 삼는다.
- 오프라인 행동이 가능하더라도 사용자에게 동기화 상태를 숨기지 않는다.

## 2. 저장 위치 결정 기준

### 기기에만 저장

- 테마 선택과 다크모드. 여러 기기 동기화를 원하는 경우에만 서버 preference로 확장
- 마지막으로 연 탭, 여행, 필터, 정렬, 접힘/펼침 상태
- 최근 검색어와 검색 입력
- 작성 중이며 아직 저장하지 않은 메모·일기·폼 draft
- 달력에서 보고 있는 월, 지도 확대/이동 위치
- 데이터 절약 모드, Wi-Fi에서만 원본 업로드 설정
- dismissed 안내와 일시적인 UI 상태
- 준비물/장소 export 텍스트와 고정 형식 요리의 파싱 결과

이 데이터는 AsyncStorage 또는 작은 preference table에 저장한다. 삭제돼도 공동 데이터에는 영향이 없다.

### 서버에 저장하고 기기에 캐시

- 프로필, 공간, 멤버, 권한
- 여행, 날짜, 일정, 교통, 숙소, 예약
- 장소, 태그, 장소 상태와 일정/숙소 연결
- 준비물, 담당, 체크 상태와 완료자
- 요리, 재료, 구매 방법과 준비물 연결
- 공동 메모, 사진 메타데이터, 일기, 통계

다른 멤버가 보거나 다른 기기에서도 유지돼야 하므로 서버가 최종 원본이다. 기기의 SQLite는 읽기 snapshot이자 오프라인 작업 공간이다.

### 파일

- 앱 bundle: 대한민국 지도 path, 아이콘, 기본 일러스트
- 기기 파일 캐시: 사진 썸네일, 최근 표시본, 업로드 대기 파일
- VPS private volume: 공유 사진 원본과 표시본
- 사용자가 ‘기기에 저장’을 선택한 사진: 앱 캐시가 아닌 사진 보관함. 앱 cache eviction 대상에서 제외

## 3. 로컬 저장 기술

| 저장소 | 대상 |
| --- | --- |
| SecureStore | access/refresh token, installation secret |
| AsyncStorage | 단순 preference와 작은 UI 상태 |
| SQLite | 엔티티 snapshot, sync cursor, pending mutation, draft index |
| FileSystem cache | thumbnail/display image, 임시 업로드 |

SQLite에는 서버 응답 JSON 전체를 한 blob으로만 쌓지 않는다. 조회가 잦은 `trips`, `schedule_items`, `trip_places`, `checklist_items`, `recipes`, `memos`는 최소 필드 table로 두고 서버 ID/version/update 시각을 함께 저장한다.

로컬 migration은 앱 버전과 독립된 schema version을 가진다. migration 실패 시 DB 파일을 즉시 지우지 않고 진단 정보를 남긴 뒤, 서버가 원본인 snapshot만 재-bootstrap할 수 있는 복구 경로를 제공한다. 전송되지 않은 outbox와 draft는 복구 전에 별도 보존한다.

## 4. 읽기 흐름

```text
화면 진입
  → SQLite snapshot 즉시 렌더링
  → 캐시 정책 확인
  → If-None-Match 또는 sync cursor로 재검증
      ├─ 304: 아무것도 쓰지 않음
      └─ changes: transaction으로 SQLite 반영
  → 영향받은 화면만 갱신
```

- 빈 화면에 spinner를 오래 보여주지 않는다.
- 최초 설치처럼 캐시가 없을 때만 skeleton과 네트워크 조회를 사용한다.
- 캐시가 오래됐으면 ‘마지막 업데이트’ 또는 오프라인 상태를 조용히 표시한다.
- SSE는 즉시 갱신 신호이며 데이터 원본이 아니다. 이벤트 유실은 sync API가 복구한다.

## 5. 쓰기 흐름

온라인:

1. 기기에 낙관적으로 반영하고 `pending` 표시
2. mutation UUID, base version과 함께 서버 요청
3. 성공 결과/version으로 SQLite 확정
4. 실패하면 이전 상태 복구 또는 재시도 선택 제공

오프라인:

1. 허용된 행동만 SQLite와 outbox에 저장
2. 항목에 ‘동기화 대기’ 상태 표시
3. 연결 복구 시 생성 순서와 의존관계대로 batch 전송
4. applied/duplicate는 확정, conflict는 사용자 선택 또는 안전 규칙 적용

‘토글’ 자체를 저장하지 않고 `completed=true`처럼 최종 의도를 저장한다. 재시도될 때 반대로 뒤집히는 오류를 막기 위해서다.

## 6. 충돌 규칙

| 동작 | 기본 규칙 |
| --- | --- |
| 준비물 완료/해제 | 최신 사용자 의도를 적용하고 완료자/시각 기록 |
| 담당 변경 | 서버 최신 version과 다르면 최신 담당을 보여주고 다시 선택 |
| 메모·일기 본문 | 자동 덮어쓰기 금지, 내 작성본과 서버 최신본 비교 |
| 일정 시간/순서 | 충돌 알림 후 서버 최신본 기준 재편집 |
| 새 항목 생성 | client UUID/idempotency key로 중복 생성 방지 |
| 삭제 | 온라인 필수, 삭제 tombstone이 모든 기기에서 제거 |
| 목록 전체 교체 | 온라인 필수, 확인창과 transaction 사용 |

## 7. 동기화 상태 모델

로컬 row는 `sync_state(synced|pending|conflict|failed)`, `server_version`, `local_updated_at`을 가진다. 화면에는 정상 상태를 과도하게 표시하지 않고 대기/실패/충돌만 보여준다.

공간별로 다음을 저장한다.

- `last_sync_cursor`
- `last_successful_sync_at`
- `bootstrap_schema_version`
- `pending_mutation_count`

outbox mutation에는 `mutation_id`, `space_id`, `entity`, `operation`, `entity_id`, `base_version`, `payload`, `dependency_ids`, `attempt_count`, `next_attempt_at`, `last_error_code`를 저장한다. 서로 의존하는 생성 작업은 client UUID로 연결하고 성공 전까지 후속 작업을 먼저 보내지 않는다.

앱 시작, foreground 복귀, 수동 새로고침, SSE 이벤트 수신 시 동기화를 요청한다. 짧은 시간의 중복 요청은 하나로 합친다.

## 8. 데이터 절약 정책

- GET은 ETag/304, sync cursor, gzip을 기본 사용
- 홈은 집계 한 번으로 받고 각 카드별 API를 연달아 호출하지 않음
- 탭 데이터는 처음 열 때만 받고 이후 변경분만 동기화
- 검색은 2자 이상·debounce 후 요청하고 같은 query는 짧게 캐시
- 현재 열어둔 여행 안의 필터/검색은 SQLite에서 처리하고, 전체 공간 통합 검색만 서버에 요청
- 지도 도형은 bundle에 포함하고 서버에서는 지역별 여행 개수만 받음
- 목록은 cursor pagination, prefetch는 Wi-Fi 또는 다음 페이지 근처에서만
- 사진 목록은 썸네일, 전체 화면은 표시본, 원본은 명시적 행동 때만 요청
- 파일 캐시는 LRU와 용량 상한을 사용하며 OS low-storage 상황에서 정리 가능

초기 권장 파일 캐시 상한은 500MB다. 데이터 절약 모드에서는 150MB, 썸네일 낮은 품질, 원본 자동 업로드 금지를 적용한다. 수치는 실제 파일럿 측정 후 조정한다.

## 9. 보안과 계정 경계

- 토큰은 SQLite/AsyncStorage에 저장하지 않는다.
- SQLite와 파일 캐시 경로를 사용자/공간별 namespace로 구분한다.
- 로그아웃 시 토큰, 공동 SQLite snapshot, pending mutation, 서명 URL과 사진 cache를 제거한다. 개인 draft 삭제 여부는 로그아웃 확인창에서 안내한다.
- 공간에서 내보내지거나 권한이 사라지면 다음 인증/동기화 시 해당 공간 데이터를 즉시 제거한다.
- 민감 사진을 OS 백업에 포함할지 플랫폼별 보호 옵션을 검토한다.

## 10. 서버 부담 절감 효과

- 304 응답은 DB 조회도 피할 수 있도록 ETag를 집계 version/cache와 연결한다.
- sync API 한 번으로 여러 엔티티의 변경을 전달해 탭마다 요청하지 않는다.
- pending mutation batch는 여러 작은 모바일 요청을 합친다.
- 사진 stream 업로드와 Nginx 내부 전송은 Spring Boot가 파일 전체를 RAM에 올리지 않게 한다.
- 공유 텍스트 파싱·목록 export·진행률 계산은 기기에서 수행해 API 호출 자체를 없앤다.
- 기기 캐시가 있어 일시적 서버 장애에도 읽기 기능을 유지한다.

무조건 로컬에 오래 저장하는 것이 최적화는 아니다. 권한이 바뀐 데이터, 오래된 사진, 검색 결과는 정책에 따라 지우며 서버와 기기 모두에서 저장량을 측정한다.

## 11. 구현 완료 기준

- 비행기 모드에서 마지막 홈과 저장된 여행 상세를 열 수 있음
- 변경 없는 재접속에서 주요 GET이 304 또는 빈 sync 결과
- 오프라인 준비물 체크 후 재연결하면 다른 기기에 한 번만 반영
- 삭제된 메모/장소가 장기간 오프라인이었던 기기에서도 제거
- 충돌 시 사용자 입력을 몰래 덮어쓰지 않음
- 로그아웃/멤버 내보내기 후 이전 공간 데이터에 접근 불가
- 데이터 절약 모드에서 사진 원본이 자동 다운로드/업로드되지 않음
