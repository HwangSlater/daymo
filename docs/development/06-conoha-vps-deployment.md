# ConoHa VPS 운영 설계

## 1. 서버 기준

- CPU: 3 Core
- RAM: 2GB
- SSD: 100GB
- Traffic: 무제한
- Region/country: 계약한 VPS의 실제 데이터센터 국가를 출시 전 확인
- OS: Ubuntu 24.04 LTS로 확정
- 구성: Nginx + Spring Boot + PostgreSQL을 Docker Compose로 같은 VPS에서 운영
- 빌드: GitHub Actions에서 수행. VPS는 완성된 image만 pull

이 사양은 초기 소수 사용자와 수백~수천 건의 여행 데이터에는 충분하다. 트래픽이 무제한이므로 월 전송량은 우선 병목에서 제외한다. 일반 CRUD보다 사진 저장 용량, 이미지 변환, 메모리 제한 없는 JVM에서 먼저 문제가 발생할 가능성이 크다.

VPS의 물리 위치가 대한민국 밖이면 계정, 여행, 메모, 사진의 국외 보관이 될 수 있다. 계약한 리전, 이전 국가, 이전받는 자, 목적, 항목, 시점·방법, 보유기간과 보호조치를 확정해 개인정보 처리방침/고지에 반영하기 전에는 운영 데이터를 넣지 않는다.

현재 구매 계획은 ConoHa VPS 일본 리전이다. 아직 서버를 구매하지 않았으므로 확정 사실로 고지하지 않고, 구매 화면·계약 문서·관리 콘솔에서 실제 데이터센터 국가와 가능하면 세부 지역을 확인한 뒤 운영 체크리스트와 개인정보 처리방침을 갱신한다. 일본 리전이 아닌 상품을 구매했다면 배포 전에 문서를 다시 승인한다.

## 2. 네트워크 구성

```text
Internet
  └─ ConoHa firewall: 22(제한), 80, 443
       └─ Nginx :80/:443
            ├─ /v1/* → Spring Boot :8080
            ├─ /actuator/health → 내부 health check만
            └─ TLS termination / rate limit / upload limit

Docker private network
  ├─ api:8080
  └─ postgres:5432 (외부 미공개)
```

- SSH 22번은 가능하면 관리자 IP로 제한하고 key 인증만 허용한다. `PasswordAuthentication no`, `PermitRootLogin no`를 적용한다.
- PostgreSQL과 Actuator 상세 endpoint는 외부에 공개하지 않는다.
- Spring Boot `8080`도 외부에 직접 공개하지 않고 모든 앱 API 요청을 Nginx를 통해서만 전달한다.
- UFW와 ConoHa 보안 그룹을 동시에 확인한다.
- 도메인의 A/AAAA 레코드를 VPS에 연결하고 Let's Encrypt 인증서를 자동 갱신한다.

## 3. 컨테이너와 JVM

Spring Boot JVM 시작 옵션 권장값:

```text
-Xms256m
-Xmx768m
-XX:+UseG1GC
-XX:MaxMetaspaceSize=192m
-XX:+ExitOnOutOfMemoryError
-Dfile.encoding=UTF-8
-Duser.timezone=UTC
```

- Tomcat worker thread는 초기 40개 안팎으로 제한한다.
- HikariCP pool은 API replica 하나 기준 최대 10개에서 시작한다.
- 큰 JSON/파일을 JVM 메모리에 통째로 읽지 않고 stream 처리한다.
- 원본은 변경하지 않고 저장하며 서버의 표시본·썸네일 변환 작업은 동시 실행 수를 1로 제한한다.
- `restart: unless-stopped`, health check, log rotation을 설정한다.

## 4. PostgreSQL 초기값

2GB 단일 서버에서 보수적으로 시작한다.

PostgreSQL은 같은 Compose project의 private network와 VPS private volume을 사용한다. DB port는 host/public interface에 publish하지 않으며 container를 교체해도 data volume은 유지한다. 외부 managed DB는 초기 범위에 포함하지 않는다.

```text
shared_buffers = 128MB
effective_cache_size = 512MB
work_mem = 2MB
maintenance_work_mem = 64MB
max_connections = 30
```

실제 지표 없이 값을 키우지 않는다. 애플리케이션 pool과 관리/백업 연결을 합쳐 `max_connections`를 넘지 않게 한다. 인덱스는 `space_id`, `trip_id`, 날짜, soft-delete 조건과 검색 쿼리를 기준으로 만든다.

## 5. 디스크 배분

| 용도 | 목표 상한 |
| --- | --- |
| OS, Docker, 운영 여유 | 25GB |
| PostgreSQL | 20GB |
| Docker images/cache | 10GB |
| 로그/임시 파일 | 5GB |
| 로컬 사진(알파 한정) | 30GB |
| 비상 여유 | 10GB |

- 디스크 70%에서 경고, 85%에서 사진 업로드 제한을 검토한다.
- 배포 후 사용하지 않는 image를 안전하게 정리하되 실행 중 image와 volume은 건드리지 않는다.
- 애플리케이션 로그는 7~14일 또는 총 1GB 내에서 rotate한다.
- DB 백업을 같은 SSD에만 두는 것은 백업이 아니다.

## 6. 사진 저장

### 향후 확장 대안

사진 증가로 VPS 로컬 저장이 한계에 도달하면 S3 호환 오브젝트 스토리지를 검토한다. API는 인증/권한을 확인해 짧은 만료의 업로드·다운로드 서명 URL만 발급하고 DB에는 object key와 이미지 메타데이터만 저장하는 방식이다.

장점:

- 사진 증가가 VPS 디스크와 API 배포에 영향을 주지 않음
- VPS 장애 시 사진 원본을 별도로 보존
- 앱이 직접 업로드해 JVM 메모리와 대역폭 부담 감소

VPS 트래픽이 무제한이므로 외부 스토리지 이전을 검토할 이유는 전송 비용이 아니라 100GB 디스크 한도, 서버 장애 시 복구와 백업 분리다.

### 현재 선택: VPS 로컬 저장

초기에는 VPS의 `/srv/daymo/uploads` private volume을 사용한다. 외부 일일 백업, 30GB quota, 업로드 크기 제한, 경로 traversal 방지, Nginx `X-Accel-Redirect` 기반 권한 다운로드를 적용한다. 공개 가입 전에는 실제 저장 증가량과 복구 시간을 보고 외부 스토리지 이전 여부를 다시 결정한다.

초기 quota는 이미지 1개 20MB, 공간별 1GB, 전체 사진 volume 30GB다. 동영상은 지원하지 않는다. 서버는 DB 집계만 믿지 않고 정기적으로 실제 파일 사용량과 photo metadata를 대조한다.

공간 quota 80%부터 사용자에게 경고하고 100%에서는 신규 업로드만 차단한다. 서버 전체 상한에 도달해도 기존 사진을 압축·삭제하지 않으며 신규 업로드를 안전하게 제한한 뒤 volume 증설 또는 외부 storage 이관을 수행한다.

## 7. 배포 절차

pull request가 필수 CI를 통과해 `main`에 merge되는 것이 production 자동 배포 trigger다. 별도 수동 배포 승인 단계는 두지 않지만 필수 검증 실패 시 merge와 배포를 막는다.

1. GitHub Actions가 앱 typecheck/test와 Gradle test 수행
2. 직전 production schema snapshot으로 Flyway migration 검증
3. image build 후 commit SHA 태그로 GHCR push
4. schema 변경이 있으면 배포 직전 PostgreSQL snapshot 생성과 성공 여부 확인, 사진/DB 정합성 checkpoint 생성
5. VPS에서 새 image pull, expand-contract migration 후 API 교체
6. `/actuator/health/readiness`와 로그인·홈·여행 읽기 smoke test
7. 실패 시 이전 SHA image로 자동 복귀하고 운영자에게 경고; 별도 수동 rollback 명령도 유지

단일 API 컨테이너에서는 수 초의 재시작이 있을 수 있다. 초기에는 이를 허용하고, 무중단이 필요해진 뒤에만 blue-green 두 컨테이너를 검토한다. 2GB에서 두 JVM을 상시 운영하지 않는다.

production deploy workflow는 concurrency group을 하나로 고정한다. 실행 중인 배포는 끝까지 검사하고 강제 취소하지 않으며, 대기 중인 이전 workflow는 폐기하고 가장 최신 commit의 배포만 다음으로 실행한다. 롤백할 때는 이전 commit SHA의 server image만 복구한다. DB에는 down migration을 실행하지 않고 expand-contract로 유지한 호환 schema를 사용하며, 필요한 데이터 수정은 새 forward migration으로 처리한다.

VPS는 먼저 beta/staging 설정으로 공개 가입을 받고 데이터와 사진을 유지한 채 production으로 전환한다. 전환 직전 전체 snapshot을 만들고 별도 환경에서 복원을 확인한다. beta 데이터는 삭제하지 않으므로 beta 시작 전부터 production 수준의 약관·보안·백업·신고 운영을 적용한다.

### GitHub 브랜치 보호

- `main` 직접 push 금지
- pull request 필수
- 앱 typecheck/test, backend test, migration 검증, image build를 required status check로 지정
- required check가 오래된 commit에서 통과했으면 최신 commit 기준으로 다시 검사
- 1인 개발 단계에서는 별도 사람 승인을 0명으로 두고 required status check를 승인 조건으로 사용
- squash merge만 허용하고 merge commit과 rebase merge는 비활성화
- merge 후에만 production 자동 배포
- 비상시 관리자 우회는 허용하되 사유와 후속 검증을 운영 기록에 남김

### 서버 계정과 시크릿

- 배포는 제한된 `daymo-deploy` 계정의 전용 SSH key로만 접속하고 root 직접 SSH·배포를 금지
- `daymo-deploy`를 `docker` group에 넣지 않고, 소유자가 root인 allowlist 배포 script만 passwordless sudo 허용
- GitHub Environment Secrets에는 배포 SSH key·host·검증에 필요한 CI credential만 저장
- DB·JWT·OAuth·SMTP·사진 서명·restic/rclone secret은 `/etc/daymo/secrets/`의 root 소유 `0600` 파일에 저장
- secret 원문을 repository, image, compose file, workflow log와 shell history에 기록하지 않음

### OS 보안 업데이트

OS security patch는 자동 설치한다. 자동 재부팅은 끄고 `/var/run/reboot-required`가 생기면 운영 이메일로 알려 사용자가 상태·백업을 확인한 뒤 직접 재부팅한다. 일반 package와 major version upgrade는 자동 설치하지 않고 release note와 호환성을 확인한다.

## 8. 백업

- PostgreSQL·사진: 매일 04:00 Asia/Seoul에 `pg_dump`와 사진을 하나의 외부 restic snapshot으로 생성
- 사진: Daymo 전용 Google Drive의 restic 암호화 snapshot
- env와 secret: 비밀번호 관리 도구에 별도 보관
- 보존: 일간 14개·주간 8개·월간 6개
- 검증: 매월 자동 표본 복원, 분기마다 빈 local/staging에서 전체 수동 복원
- 실패: 백업·upload·snapshot integrity 중 하나라도 실패하면 즉시 운영 이메일
- schema 변경이 있는 모든 배포 직전에 추가 DB snapshot

schema 변경의 크기와 관계없이 migration이 포함된 모든 배포는 직전 DB snapshot 성공을 배포 조건으로 둔다. migration은 `add → dual read/write 또는 backfill → 전환 → 후속 release에서 제거` 순서의 expand-contract만 허용한다. 같은 배포에서 기존 컬럼·테이블을 즉시 삭제하지 않는다.

### Google Drive 자동 백업

초기 외부 백업 위치는 소유한 Google 계정의 Drive로 정한다. `rclone`으로 Google Drive에 연결하고, `restic`이 rclone backend를 통해 암호화된 snapshot을 저장한다.

```text
백업 대상
  /srv/daymo/uploads
  /srv/daymo/backup-staging/daymo.sql.gz

백업 제외
  application log
  Docker image/cache
  thumbnail 재생성 가능 임시 파일
  secret 원문
```

매일 04:00 Asia/Seoul 실행 흐름:

1. `pg_dump`를 임시 staging 경로에 생성하고 압축
2. DB dump와 사진 volume의 파일 일관성을 확인
3. restic snapshot을 `rclone:daymo-drive:daymo-backup`에 저장
4. snapshot integrity 확인 후 임시 DB dump 삭제
5. 실패 단계가 하나라도 있으면 즉시 운영 이메일을 보내고 성공 시각을 기록
6. `restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune`에 해당하는 보존 정책 적용

매월 자동 검증은 최신 snapshot에서 DB를 격리된 임시 PostgreSQL container에 복원해 migration metadata와 주요 table count를 검사하고, 무작위 사진 표본의 checksum과 decode 가능 여부를 확인한 뒤 임시 data를 삭제한다. 분기마다 별도의 빈 local/staging 환경에서 DB와 전체 사진 경로를 수동 복원해 로그인·여행 조회·사진 열기 smoke test까지 수행한다.

Google Drive 동기화 폴더를 단순 `sync`하지 않는다. 서버에서 파일이 손상·삭제되었을 때 원격도 똑같이 삭제될 수 있기 때문이다. restic repository password와 rclone OAuth token은 서로 분리해 root 전용 파일 또는 secret store에 둔다. 두 값을 모두 분실하면 복구할 수 없으므로 비밀번호 관리 도구에 별도 보관한다.

Google Drive는 초기 알파 백업으로 사용하고 다음 조건에서는 별도 백업 서비스나 오브젝트 스토리지를 검토한다.

- 백업 크기·시간이 일일 작업 창을 지속적으로 초과
- Google 계정 정지나 OAuth 재인증이 운영 위험이 됨
- 복구 목표 시간이 길어짐
- 공개 사용자 증가로 30GB 사진 상한이 부족해짐

백업 성공 로그만 신뢰하지 않고 매월 자동 표본 복원과 분기 전체 수동 복원을 모두 통과해야 복구 가능한 백업으로 본다.

복원 문서에는 빈 서버에서 Docker 설치, secret 배치, DB 복원, image 실행, DNS 전환 순서를 포함한다.

## 9. 모니터링

- Spring Boot Actuator: health, JVM heap, GC, HTTP latency, DB pool
- 서버: CPU, RAM, swap, disk, load average
- PostgreSQL: connection, slow query, DB size, backup 성공
- 앱/API 오류: Sentry
- UptimeRobot 무료 외부 monitor가 공개용 `/health`를 5분마다 확인

인증 전체 실패, readiness 실패, 지속적인 5xx 급증, DB/사진 volume 임계치와 복원 불가 수준의 백업 실패는 Daymo 운영 이메일로 즉시 알린다. 경고·회복 이력은 하루 한 번 요약한다. 알림 본문에는 token, 이메일, 사용자 입력, 사진 경로 같은 개인정보·secret을 넣지 않는다.

UptimeRobot 무료 plan과 제공 URL의 basic status page만 사용해 VPS 장애와 분리한다. 유료 plan, custom domain과 `status.daymo.xyz`는 운영 계획에서 제외한다. API·로그인·사진 업로드처럼 사용자가 이해할 수 있는 구성요소와 현재 상태만 공개하고 과거 incident history는 공개하지 않는다. 내부 host, IP, stack trace와 방어 구조는 노출하지 않는다. 로그인 불가 또는 장기 장애가 확인되면 현재 상태와 `/app-config`의 `serviceNotice`를 함께 갱신한다.

경고 기준 초기값:

- 메모리 85% 이상 10분
- swap 지속 사용
- 디스크 70% 경고/85% 긴급
- API 5xx 5분간 2% 이상
- p95 1초 초과
- backup 1회 실패

## 10. 확장 시점

다음 중 하나가 반복되면 인프라를 분리한다.

- 메모리 부족/OOM 또는 swap으로 API 지연
- DB와 API가 자원을 경쟁
- 사진 처리로 CPU가 장시간 포화
- SSD 70% 이상 증가 추세
- 배포 재시작을 허용할 수 없는 사용자 규모

확장 순서는 `외부 사진 저장 확정 → DB managed/별도 VPS → API RAM 증설 → 필요할 때만 Redis`다. 마이크로서비스는 사용자 규모가 아니라 명확한 운영 병목이 생겼을 때 검토한다.
