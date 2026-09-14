# VPS 운영 설계

## 1. 서버 기준

- 업체: iwinv
- CPU: 2 vCPU
- RAM: 2GB
- 디스크: 50GB NVMe
- Traffic: 일 20GB(월 600GB), 초과분은 구간 요금
- 요금: 월 13,100원(일 490원). 초기에는 별도 블록 스토리지를 구매하지 않는다
- CPU 제한: 공유 상품은 vCPU 사용률이 50%로 제한된다. 크레딧을 쌓았다가 쓰는 방식이 아니라 고정 상한이다
- Region/country: 한국 리전 서버를 2026-09-14 생성했으며 계약 화면에서 실제 데이터센터 국가를 출시 전 최종 확인
- OS: Ubuntu 24.04 LTS로 확정
- 구성: Nginx + FastAPI(uvicorn) + PostgreSQL을 Docker Compose로 같은 VPS에서 운영
- 빌드: GitHub Actions에서 수행. VPS는 완성된 image만 pull

이 사양은 초기 사용자 규모와 수백~수천 건의 여행 데이터에는 충분하다. 다만 공개 가입을 받으므로 증가 속도를 계속 본다. 전송량은 무제한이 아니라 일 20GB이고 넘으면 구간 요금이 붙으므로 사진을 반복해서 내려받는 구간을 함께 본다. 그래도 일반 CRUD보다 사진 저장 용량, 이미지 변환, 상한을 두지 않은 API 워커 메모리에서 먼저 문제가 발생할 가능성이 크다.

VPS의 물리 위치가 대한민국 밖이면 계정, 여행, 메모, 사진의 국외 보관이 될 수 있다. 계약한 리전, 이전 국가, 이전받는 자, 목적, 항목, 시점·방법, 보유기간과 보호조치를 확정해 개인정보 처리방침/고지에 반영하기 전에는 운영 데이터를 넣지 않는다. 한국 리전이면 계정·여행 DB와 사진의 국외 보관은 사라지지만 Google Drive 백업, Sentry처럼 국외에서 처리되는 구성요소는 그대로 남는다.

2026-09-14 iwinv VPS를 생성해 Ubuntu 24.04 LTS와 Docker Compose 구성을 배포했다. 구매 화면·계약 문서·관리 콘솔에서 실제 데이터센터 국가와 가능하면 세부 지역을 최종 확인한 뒤 운영 체크리스트와 개인정보 처리방침을 갱신한다.

### 구매 전 확인 목록

구매 화면에서 다음을 확인한 뒤 결제한다. 하나라도 확인되지 않으면 확정하지 않는다.

- 실제 데이터센터 국가
- Ubuntu 24.04 LTS 이미지 제공 여부
- 트래픽 초과 구간 요금 단가
- 스냅샷/백업 제공 여부와 비용
- 아웃바운드 587/465 개방 여부
- 공인 IPv4 포함 여부
- 방화벽(보안그룹) 제공 여부
- 구매하려는 상품이 공유인지 전용인지와 vCPU 사용률 상한

### 대안 검토 기록

AWS Lightsail 서울 리전을 같이 놓고 봤다. 같은 급인 `$12` 플랜이 2 vCPU / 2GB / SSD 60GB / 월 3TB 전송이고,
환율 1,345원 기준 약 16,140원이다. 월 3,000원 차이는 결정 근거가 되지 못했고, 실제로 갈린 것은 셋이다.

- 전송량 3TB는 우리에게 값이 없다. 월 600GB도 하루 20GB이고, 썸네일 300KB 기준 하루 6만 회가 넘는 조회량이다.
- 초기 저장량은 기본 50GB 디스크 안에서 감당하고, 용량이 커지면 미니PC와 NAS로 이전할 수 있다.
- CPU는 Lightsail `$12`가 baseline 20%에 버스트 크레딧 방식이고 iwinv 공유는 50% 고정이다. 이미지 변환을 동시 1개로 묶어 두므로 50% 고정이 더 다루기 쉽다.

Lightsail이 나은 점도 적어 둔다. 스냅샷 가격, 재위탁자 목록, 인증 현황이 모두 공개돼 있어 8장 문서를 채우는 품이 적게 든다.
따라서 위 구매 전 확인 목록에서 스냅샷이나 아웃바운드 SMTP가 막혀 있는 것으로 드러나면 Lightsail 서울로 다시 검토한다.

## 2. 네트워크 구성

```text
Internet
  └─ iwinv 방화벽: 22(제한), 80, 443
       └─ Nginx :80/:443
            ├─ /v1/health → 내부 health check만
            ├─ /v1/* → FastAPI(uvicorn) :8000
            └─ TLS termination / rate limit / upload limit

Docker private network
  ├─ api:8000
  └─ postgres:5432 (외부 미공개)
```

- SSH 22번은 가능하면 관리자 IP로 제한하고 key 인증만 허용한다. `PasswordAuthentication no`, `PermitRootLogin no`를 적용한다.
- PostgreSQL은 외부에 공개하지 않는다.
- FastAPI가 자동으로 만드는 문서 경로(`/docs`, `/redoc`, `/openapi.json`)는 운영에서 공개하지 않는다. 베타라도 마찬가지다. 전체 endpoint와 요청·응답 스키마를 그대로 보여 주는 것은 공격자에게 지도를 주는 일이고, 알파 사용자에게 필요한 정보도 아니다. 앱의 typed client는 CI에서 생성한 OpenAPI 산출물로 만들므로 운영 서버가 이 경로를 열어 둘 이유가 없다. local과 beta 환경에서만 켠다.
- FastAPI의 `8000`도 외부에 직접 공개하지 않고 모든 앱 API 요청을 Nginx를 통해서만 전달한다.
- UFW와 iwinv 방화벽을 동시에 확인한다.
- **DNS는 처음부터 Cloudflare를 쓴다.** 도메인은 가비아에서 사고 네임서버만 Cloudflare로 넘긴다. 미니PC 단계에서 쓸 Cloudflare Tunnel이 자기 zone의 DNS 레코드를 직접 만들어야 해서, 어차피 한 번은 옮겨야 한다. 레코드가 하나도 없는 지금이 옮기는 값이 가장 싸다. 서비스가 떠 있는 도메인을 나중에 옮기면 전파를 기다리는 동안 불안하다.
- **VPS 단계에서는 Cloudflare proxy를 끈다(회색 구름).** Cloudflare는 이름만 알려 주고 트래픽은 지나지 않는다. `api.daymo.xyz` A record를 VPS 공인 IPv4에 직접 건다. 미니PC로 옮긴 뒤에는 Cloudflare Tunnel을 쓴다(11장).
- 이전에는 Cloudflare를 아예 쓰지 않기로 했었으나, 가정 회선에서는 인바운드 개방과 고정 IP가 어려워 바꿨다. 다만 **DNS 질의 처리를 맡기는 것 자체가 위탁**이므로 VPS 단계부터 위탁 표에 올린다([08-privacy-and-release-compliance.md](./08-privacy-and-release-compliance.md) 4장).
- Nginx의 `api.daymo.xyz` 인증서는 Let's Encrypt로 무료 발급하고 자동 갱신 timer와 정기 dry-run을 확인한다.
- 메일은 처음부터 중계 서비스를 통해 보낸다. 가정용·클라우드 IP에서 직접 SMTP로 발송하면 차단되거나 스팸으로 분류된다. 미니PC로 옮겨도 이 구조는 그대로 쓴다. 업체는 Resend로 정해 뒀다([11-owner-setup-guide.md](./11-owner-setup-guide.md) 참고).

## 3. 컨테이너와 파이썬 런타임

uvicorn 실행 기준:

```text
uvicorn app.main:app
  --host 0.0.0.0
  --port 8000
  --workers 2
  --proxy-headers
```

- 워커는 vCPU 수에 맞춰 2개로 시작한다. 동시 요청은 워커 수가 아니라 각 워커의 async 이벤트 루프가 받으므로 요청이 늘어도 워커부터 늘리지 않는다. 먼저 볼 것은 DB·파일 접근을 블로킹으로 짜지 않았는지다. 블로킹 호출은 threadpool로 넘기고 그 크기도 함께 제한한다.
- API 컨테이너 메모리 상한은 400MB로 둔다.
- SQLAlchemy connection pool은 워커 하나 기준 `pool_size=5`, `max_overflow=5`로 시작한다. 워커가 2개이므로 API가 쓰는 커넥션은 최대 20개다. 4장의 `max_connections = 30`보다 확실히 작아 관리·백업 연결 몫이 남는다. 워커 수나 pool 값을 올릴 때는 이 계산을 다시 하고 `max_connections`도 함께 본다.
- 큰 JSON/파일을 파이썬 프로세스 메모리에 통째로 읽지 않고 stream 처리한다.
- 원본은 변경하지 않고 저장하며 서버의 표시본·썸네일 변환 작업은 동시 실행 수를 1로 제한한다.
- `restart: unless-stopped`, health check, log rotation을 설정한다.

## 4. PostgreSQL 초기값

2GB 단일 서버에서 보수적으로 시작한다.

PostgreSQL은 같은 Compose project의 private network와 VPS private volume을 사용한다. DB port는 host/public interface에 publish하지 않으며 container를 교체해도 data volume은 유지한다. 외부 managed DB는 초기 범위에 포함하지 않는다.

```text
shared_buffers = 192MB
effective_cache_size = 512MB
work_mem = 2MB
maintenance_work_mem = 64MB
max_connections = 30
```

실제 지표 없이 값을 키우지 않는다. 애플리케이션 pool과 관리/백업 연결을 합쳐 `max_connections`를 넘지 않게 한다. 인덱스는 `space_id`, `trip_id`, 날짜, soft-delete 조건과 검색 쿼리를 기준으로 만든다.

## 5. 디스크 배분

기본 NVMe 50GB 하나에 운영 데이터와 사진을 함께 둔다. 사진은 `/srv/daymo/uploads`로 경로를 분리하고 quota로 디스크 여유를 지킨다.

| 용도 | 목표 상한 |
| --- | --- |
| OS, Docker, 운영 여유 | 15GB |
| PostgreSQL | 8GB |
| 사진 원본·표시본·썸네일 | 10GB |
| Docker images/cache | 5GB |
| 로그/임시 파일 | 3GB |
| 비상 여유 | 9GB |
| 합계 | 50GB |

### 기본 디스크의 사진 영역

사진은 기본 디스크의 `/srv/daymo/uploads`에 저장한다. 초기 전체 사진 상한은 10GB이며 장당 2MB 기준 약 5,000장이다. 별도 블록 스토리지는 구매하지 않는다.

사진 경로를 분리해 두면 나중에 같은 경로에 NAS를 마운트해 API와 사진 URL을 유지할 수 있다. 10GB 상한에 가까워지거나 전체 디스크가 70%에 도달하면 미니PC·NAS 이전을 준비한다.

PostgreSQL data도 기본 NVMe에 두되 Docker volume으로 사진 경로와 분리한다. 미니PC 단계에서도 DB는 NAS 네트워크 마운트가 아니라 미니PC의 로컬 SSD에 둔다.

- 전체 디스크와 사진 경로 사용량을 함께 본다. 디스크 70%에서 경고하고 85%에서는 신규 사진 업로드를 제한한다.
- 배포 후 사용하지 않는 image를 안전하게 정리하되 실행 중 image와 volume은 건드리지 않는다.
- 애플리케이션 로그는 7~14일 또는 총 1GB 내에서 rotate한다.
- DB 백업을 같은 디스크에만 두는 것은 백업이 아니다.

## 6. 사진 저장

### 향후 확장 대안

사진 증가로 VPS 로컬 저장이 한계에 도달하면 미니PC/NAS로 이사한다. `/srv/daymo/uploads` 자리에 NAS 마운트를 걸면 되므로 사진 URL과 애플리케이션 코드는 바뀌지 않는다. 절차는 11장에 적었다.

장점:

- 사진 용량을 요금제가 아니라 디스크 교체로 늘림
- API 서버와 다른 장치에 사진 원본을 둠
- 저장 경로와 다운로드 방식이 같아 앱과 API 코드가 그대로임

S3 호환 오브젝트 스토리지도 검토했으나 쓰지 않기로 했다. 종착지가 집의 미니PC/NAS 자가 호스팅이어서 지금 서명 URL과 object key 구조를 넣으면 이사할 때 다시 걷어내야 한다. 같은 논의를 반복하지 않도록 이유를 여기 남긴다.

이전을 검토할 이유는 전송 비용이 아니라 50GB 디스크 한도, 서버 장애 시 복구와 백업 분리다. 전송량은 별도로 일 20GB 한도를 본다.

### 현재 선택: VPS 로컬 저장

초기에는 기본 디스크의 `/srv/daymo/uploads` private 경로를 사용한다. 외부 일일 백업, 10GB quota, 업로드 크기 제한, 경로 traversal 방지, Nginx `X-Accel-Redirect` 기반 권한 다운로드를 적용한다. 호스트가 바뀌어도 사진 URL이 그대로인 것이 이 방식을 고른 이유이므로 미니PC/NAS로 옮길 때도 경로와 다운로드 방식을 유지한다. 실제 저장 증가량과 복구 시간을 보고 이전 시점을 결정한다.

초기 quota는 이미지 1개 20MB, 공간별 1GB, 전체 사진 10GB다. 동영상은 지원하지 않는다. 서버는 DB 집계만 믿지 않고 정기적으로 실제 파일 사용량과 photo metadata를 대조한다.

공간 quota 80%부터 사용자에게 경고하고 100%에서는 신규 업로드만 차단한다. 서버 전체 상한에 도달해도 기존 사진을 압축·삭제하지 않으며 신규 업로드를 안전하게 제한한 뒤 volume 증설 또는 미니PC/NAS 이관을 수행한다.

## 7. 배포 절차

pull request가 필수 CI를 통과해 `main`에 merge되는 것이 production 자동 배포 trigger다. 별도 수동 배포 승인 단계는 두지 않지만 필수 검증 실패 시 merge와 배포를 막는다.

1. GitHub Actions가 앱 typecheck·lint·unit test와 서버 pytest·PostgreSQL 컨테이너 DB test 수행
2. 직전 production schema snapshot으로 Alembic migration 검증
3. image build 후 commit SHA 태그로 GHCR push
4. schema 변경이 있으면 배포 직전 PostgreSQL snapshot 생성과 성공 여부 확인, 사진/DB 정합성 checkpoint 생성
5. VPS에서 새 image pull, expand-contract migration 후 API 교체
6. `GET /v1/health`와 로그인·홈·여행 읽기 smoke test
7. 실패 시 이전 SHA image로 자동 복귀하고 운영자에게 경고; 별도 수동 rollback 명령도 유지

단일 API 컨테이너에서는 수 초의 재시작이 있을 수 있다. 초기에는 이를 허용하고, 무중단이 필요해진 뒤에만 blue-green 두 컨테이너를 검토한다. 2GB에서 API 컨테이너 두 벌을 상시 운영하지 않는다.

production deploy workflow는 concurrency group을 하나로 고정한다. 실행 중인 배포는 끝까지 검사하고 강제 취소하지 않으며, 대기 중인 이전 workflow는 폐기하고 가장 최신 commit의 배포만 다음으로 실행한다. 롤백할 때는 이전 commit SHA의 server image만 복구한다. DB에는 down migration을 실행하지 않고 expand-contract로 유지한 호환 schema를 사용하며, 필요한 데이터 수정은 새 forward migration으로 처리한다.

VPS는 먼저 beta/staging 설정으로 공개 가입을 받고 데이터와 사진을 유지한 채 production으로 전환한다. 전환 직전 전체 snapshot을 만들고 별도 환경에서 복원을 확인한다. 베타 데이터는 삭제하지 않으므로 베타 시작 전부터 production 수준의 약관·보안·백업·신고 운영을 적용한다.

### GitHub 브랜치 보호

- `main` 직접 push 금지
- pull request 필수
- 앱 typecheck/test, backend test, migration 검증, image build를 required status check로 지정
- required check가 오래된 commit에서 통과했으면 최신 commit 기준으로 다시 검사
- 1인 개발 단계에서는 별도 사람 승인을 0명으로 두고 required status check를 승인 조건으로 사용
- squash merge만 허용하고 merge commit과 rebase merge는 비활성화
- merge 후에만 production 자동 배포
- 비상시 관리자 우회는 허용하되 사유와 후속 검증을 운영 기록에 남김

EAS iOS/Android build는 server 자동 배포 workflow와 분리한다. 일반 PR에서는 실행하지 않고 beta/production release candidate에서만 두 플랫폼을 함께 생성한다. Dependabot은 매주 ecosystem별 묶음 PR만 만들고 자동 merge 권한은 주지 않는다.

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
- 사진이 10GB 상한에 근접하거나 전체 디스크가 70%를 넘음(미니PC·NAS 이전 준비)

백업 성공 로그만 신뢰하지 않고 매월 자동 표본 복원과 분기 전체 수동 복원을 모두 통과해야 복구 가능한 백업으로 본다.

복원 문서에는 빈 서버에서 Docker 설치, secret 배치, DB 복원, image 실행, DNS 전환 순서를 포함한다.

## 9. 모니터링

- API: `GET /v1/health`가 프로세스와 DB 연결 상태를 확인한다. 이 endpoint는 직접 만든다
- 서버: CPU, RAM, swap, disk, load average
- 요청 기록: API가 요청 하나에 JSON 한 줄을 stdout으로 남긴다. 남기는 항목은 `requestId`, `method`, `endpoint`, `status`, `durationMs`, `actor` 여섯 개다. `endpoint`는 실제 경로가 아니라 라우트 틀(`/v1/trips/{trip_id}/expenses`)이라 같은 API의 요청이 한 줄로 모이고 여행 ID가 로그에 흩어지지 않는다. `actor`는 계정 ID가 아니라 pepper를 섞은 해시 앞 16자다. 요청 본문, 질의 문자열, 헤더는 남기지 않는다. 여행 제목·메모·검색어가 거기 들어 있다
- 로그를 모아 검색하는 도구(Loki, ELK)는 VPS 단계에서 올리지 않는다. 2GB에 들어가지 않는다. 찾는 수단은 `docker compose logs`와 `jq`다
- **API 프로세스 메모리, HTTP latency 분포, DB pool 사용량 같은 내부 지표는 미니PC 단계로 미룬다(11장).** 수집기와 저장소가 VPS 예산에 들어가지 않는다
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
- 디스크 70% 이상 증가 추세
- 월 전송량이 600GB에 가까워져 초과 구간 요금이 반복됨
- 배포 재시작을 허용할 수 없는 사용자 규모

확장 순서는 `API RAM 증설 → 미니PC/NAS 이전 → 필요할 때만 Redis`다. 사진을 외부 오브젝트 스토리지로 옮기는 선택지는 6장에서 제외했다. 마이크로서비스는 사용자 규모가 아니라 명확한 운영 병목이 생겼을 때 검토한다.

## 11. 미니PC + NAS 이전

VPS는 종착지가 아니다. 디스크나 전송량이 한계에 닿으면 집의 미니PC와 NAS로 옮긴다. 이전 시점과 구체적인 하드웨어는 미정이다.

### 역할 분담

- 미니PC: API와 PostgreSQL을 맡는다. DB data directory는 반드시 미니PC의 로컬 NVMe에 둔다. 네트워크 마운트 위에서 PostgreSQL을 운영하면 연결이 끊기는 순간 데이터가 깨진다.
- NAS: 사진과 백업을 맡는다. `/srv/daymo/uploads` 자리에 NAS 마운트를 걸면 저장 경로가 그대로라 애플리케이션 코드를 고치지 않는다.

### 네트워크

가정 회선은 인바운드 80/443이 막혀 있는 경우가 많고 공인 IP도 고정되지 않는다. VPS 때처럼 A record를 IP에 직접 걸 수 없으므로 Cloudflare Tunnel을 쓴다. 미니PC 안의 tunnel client가 바깥으로 연결을 열고 Cloudflare가 `api.daymo.xyz` 요청을 그 연결로 넘기는 방식이라 인바운드 포트 개방과 고정 IP가 필요 없다. 대신 Cloudflare가 트래픽 경유지가 되므로 위탁·국외 이전 검토 대상에 넣는다([08-privacy-and-release-compliance.md](./08-privacy-and-release-compliance.md) 4장).

가정 회선의 업로드 속도, 정전·인터넷 장애 시 복구 방법은 이전 전에 확인한다.

### 운영 지표

VPS 단계에서 미뤄 둔 내부 지표를 여기서 붙인다. 미루는 이유는 하나뿐이고 그것은 메모리다. 2GB에서는 API 400MB, PostgreSQL 800MB, Nginx 64MB에 OS 여유 700MB로 이미 꽉 차 있어서 수집기와 저장소가 들어갈 자리가 없다. 미니PC는 그 제약이 없다.

붙일 대상은 VPS 단계에서 답이 없던 것들이다.

- API 프로세스 메모리와 워커별 사용량. JVM을 버리면서 Actuator가 주던 heap/GC 지표가 없어진 자리다
- HTTP latency 분포(p50/p95/p99). 지금은 요청 로그의 `durationMs`를 `jq`로 세는 것이 전부다
- DB connection pool 사용량과 대기 시간. `pool_size=5`, `max_overflow=5`가 맞는 값인지 여기서 처음 확인할 수 있다
- PostgreSQL slow query와 인덱스 적중률
- 사진 변환 작업의 처리 시간과 대기 길이

도구는 정하지 않는다. 미니PC의 실제 사양이 정해진 뒤에 고른다. 다만 **경로가 두 갈래**라는 것만 적어 둔다. 지표만 필요하면 Prometheus와 Grafana, 로그까지 모아 검색하려면 Loki를 더한다. 둘 다 합치면 대략 350MB 이상을 쓴다.

지표 수집기는 바깥에 공개하지 않는다. Cloudflare Tunnel에 올리는 것은 `api.daymo.xyz` 하나뿐이고, Grafana 같은 화면은 집 안 네트워크에서만 연다.

### 백업

NAS는 집 안에 있으므로 off-site 백업이 아니다. 미니PC와 NAS는 같은 화재·도난·정전·수해를 함께 겪는다. 8장의 원격 암호화 사본(restic + rclone) 한 벌은 이전한 뒤에도 그대로 유지한다. 백업 대상 경로만 새 위치로 바꾼다.
