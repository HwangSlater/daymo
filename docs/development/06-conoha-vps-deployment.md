# ConoHa VPS 운영 설계

## 1. 서버 기준

- CPU: 3 Core
- RAM: 2GB
- SSD: 100GB
- Traffic: 무제한
- Region/country: 계약한 VPS의 실제 데이터센터 국가를 출시 전 확인
- 권장 OS: Ubuntu 24.04 LTS
- 구성: Nginx + Spring Boot + PostgreSQL을 Docker Compose로 운영
- 빌드: GitHub Actions에서 수행. VPS는 완성된 image만 pull

이 사양은 초기 소수 사용자와 수백~수천 건의 여행 데이터에는 충분하다. 트래픽이 무제한이므로 월 전송량은 우선 병목에서 제외한다. 일반 CRUD보다 사진 저장 용량, 이미지 변환, 메모리 제한 없는 JVM에서 먼저 문제가 발생할 가능성이 크다.

VPS의 물리 위치가 대한민국 밖이면 계정, 여행, 메모, 사진의 국외 보관이 될 수 있다. 계약한 리전, 이전 국가, 이전받는 자, 목적, 항목, 시점·방법, 보유기간과 보호조치를 확정해 개인정보 처리방침/고지에 반영하기 전에는 운영 데이터를 넣지 않는다.

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

- SSH 22번은 가능하면 관리자 IP로 제한하고 비밀번호 로그인을 끈다.
- PostgreSQL과 Actuator 상세 endpoint는 외부에 공개하지 않는다.
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
- 이미지 리사이즈는 가급적 앱에서 먼저 하고, 서버 변환 작업은 동시 실행 수를 1로 제한한다.
- `restart: unless-stopped`, health check, log rotation을 설정한다.

## 4. PostgreSQL 초기값

2GB 단일 서버에서 보수적으로 시작한다.

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

## 7. 배포 절차

1. GitHub Actions가 Gradle test와 image build 수행
2. commit SHA 태그로 GHCR push
3. VPS에서 새 image pull
4. PostgreSQL backup과 Flyway migration 사전 검증
5. API 교체 후 `/actuator/health/readiness` 확인
6. 실패 시 이전 SHA image로 복귀
7. 앱 smoke test: 로그인, 홈, 여행 조회, 쓰기, 사진 URL

단일 API 컨테이너에서는 수 초의 재시작이 있을 수 있다. 초기에는 이를 허용하고, 무중단이 필요해진 뒤에만 blue-green 두 컨테이너를 검토한다. 2GB에서 두 JVM을 상시 운영하지 않는다.

## 8. 백업

- PostgreSQL: 매일 `pg_dump` 암호화 후 VPS 밖으로 전송, 14~30일 보존
- 사진: 오브젝트 스토리지 versioning/lifecycle 또는 별도 bucket 복제
- env와 secret: 비밀번호 관리 도구에 별도 보관
- 월 1회 local/staging에 실제 복원 시험
- 배포 직전 schema 변경이 크면 추가 backup

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

권장 실행 흐름:

1. `pg_dump`를 임시 staging 경로에 생성하고 압축
2. DB dump와 사진 volume의 파일 일관성을 확인
3. restic snapshot을 `rclone:daymo-drive:daymo-backup`에 저장
4. snapshot integrity 확인 후 임시 DB dump 삭제
5. 성공·실패를 외부 모니터로 통지
6. 보존 정책 적용: 일간 14개, 주간 8개, 월간 6개부터 시작

Google Drive 동기화 폴더를 단순 `sync`하지 않는다. 서버에서 파일이 손상·삭제되었을 때 원격도 똑같이 삭제될 수 있기 때문이다. restic repository password와 rclone OAuth token은 서로 분리해 root 전용 파일 또는 secret store에 둔다. 두 값을 모두 분실하면 복구할 수 없으므로 비밀번호 관리 도구에 별도 보관한다.

Google Drive는 초기 알파 백업으로 사용하고 다음 조건에서는 별도 백업 서비스나 오브젝트 스토리지를 검토한다.

- 백업 크기·시간이 일일 작업 창을 지속적으로 초과
- Google 계정 정지나 OAuth 재인증이 운영 위험이 됨
- 복구 목표 시간이 길어짐
- 공개 사용자 증가로 30GB 사진 상한이 부족해짐

매월 자동 백업 성공만 확인하지 않고 별도 local/staging 서버에서 DB와 임의 사진을 실제 복원한다.

복원 문서에는 빈 서버에서 Docker 설치, secret 배치, DB 복원, image 실행, DNS 전환 순서를 포함한다.

## 9. 모니터링

- Spring Boot Actuator: health, JVM heap, GC, HTTP latency, DB pool
- 서버: CPU, RAM, swap, disk, load average
- PostgreSQL: connection, slow query, DB size, backup 성공
- 앱/API 오류: Sentry
- 초기에는 외부 uptime monitor로 `/actuator/health/readiness` 또는 별도 `/health` 확인

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
