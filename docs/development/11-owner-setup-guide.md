# 개발자가 준비해야 할 환경·계정·시크릿

이 문서는 Daymo 개발을 시작하고 운영할 때 프로젝트 소유자가 알아야 하거나 직접 준비해야 하는 항목을 정리한다. 비밀값 자체는 이 문서나 Git 저장소에 기록하지 않는다.

초기 공개 출시 주체는 개인 개발자다. Apple Developer와 Google Play는 개인 계정으로 준비하고, 스토어 판매자·법적 고지에는 검증된 법적 이름을 사용한다. 앱 UI, 스크린샷용 더미 데이터와 공개 Git 저장소에는 운영자 실명을 넣지 않는다.

사용자 공개 문의 주소는 `support@daymo.xyz`이며 Daymo 전용 Google 계정으로 전달한다. 자동 발신은 `no-reply@daymo.xyz`로 분리한다. 도메인 구매 후 수신 전달, SPF/DKIM/DMARC, 회신 주소와 스팸함까지 실제 송수신 테스트한다.

사진에 등장한 당사자의 삭제·처리정지 요청은 운영자가 접수해 사진을 임시 숨기고 검토한다. 업로더와 owner에게 요청자의 개인정보를 공유하지 않으며 결과에 따라 7일 삭제 절차 또는 복원을 수행한다. 확인 자료와 처리 기한은 출시 전 법률 검토로 고정한다.

첫 출시부터 앱 내 사용자·콘텐츠 신고와 사용자 차단을 운영한다. 차단은 새 초대·공간 합류·관련 알림을 막고 기존 공간 콘텐츠를 자동 삭제하지 않는다. 신고 queue를 확인할 운영 화면과 처리 기록이 공개 출시 전에 준비되어야 한다.

신고는 즉시 접수하고 24시간 이내 최초 검토한다. 사진 노출·위협·아동 안전 긴급 신고는 먼저 임시 제한하며 운영 알림에는 신고 본문이나 사진을 넣지 않는다. 24시간 기한을 지속해서 지킬 수 없는 상태에서는 공개 가입 규모를 늘리지 않는다.

텍스트·외부 URL은 versioned 금지 규칙으로 사전 검사한다. 초기 사진은 외부 자동 판별 서비스로 보내지 않고 초대 공간, 이용규칙, 신고·임시 제한과 24시간 검토로 대응한다.

신고 처리는 일반 앱과 분리된 관리자 웹에서 수행한다. 관리자 공개 가입은 없고 사전 허용 계정, MFA, 짧은 session과 모든 처리 감사 로그를 적용한다. 관리자 원본 사진 조회는 신고 처리에 필요한 경우만 허용한다.

관리자 MFA는 Google Authenticator 등 표준 인증 앱의 TOTP 6자리 코드를 사용한다. 등록 시 발급되는 일회용 복구 코드 10개는 온라인 비밀번호 관리 도구와 별도의 오프라인 장소에 나눠 보관한다. 서버에는 TOTP secret 암호문과 복구 코드 hash만 저장한다.

관리자 웹은 1시간 동안 조작이 없으면 잠기며 TOTP를 다시 확인해야 한다. 처리 중인 작업은 잠금 시 자동 제출하지 않는다.

신고 기록은 처리 완료 후 1년, 관리자 감사 로그는 생성 후 2년 보관하고 법적 보존 사유가 없으면 자동 파기한다. 처리 결과에는 14일 이의 제기 기한을 안내한다. 긴급 신고는 즉시, 일반 신고는 1시간 단위 요약으로 운영자에게 알리며 민감한 본문과 사진은 알림에 넣지 않는다.

사용자는 앱에서 내 데이터 export를 요청할 수 있다. 서버는 내 계정·동의·참여 이력·본인 작성 콘텐츠·본인 사진 원본만 비동기로 만들고 24시간 유효한 1회용 링크로 제공한다. 다운로드나 만료 후 archive를 삭제한다.

첫 출시에는 제3자 행동 분석 SDK를 넣지 않는다. Sentry 오류 추적만 PII scrubbing과 최소 기술 정보로 운영하며 화면 조회·버튼 클릭 분석에는 사용하지 않는다. 앱에는 Sentry SDK를 넣지 않았고, 서버만 `SENTRY_DSN`이 들어갔을 때 켜진다(9장).

Sentry 보존기간은 30일이고 누가 겪었는지는 보내지 않는다. 잠금화면 push는 상세 여행 정보를 숨긴 일반 문구로 보내며, 생체 앱 잠금은 기기별 선택 기능·기본 꺼짐으로 제공한다. 생체 원본은 앱이나 서버에서 수집하지 않는다.

생체 앱 잠금을 켜면 백그라운드 1분 후 잠그고 실패 시 OS 기기 암호·PIN을 허용한다. 앱 전환 화면은 항상 privacy cover로 가리지만 사용자의 일반 스크린샷은 막지 않는다.

## 1. 먼저 결정할 제품·배포 항목

### 앱 식별자

앱 식별자는 `com.hwangslater.daymo`로 확정했다.

```text
iOS Bundle Identifier: com.hwangslater.daymo
Android Package Name: com.hwangslater.daymo
앱 URL Scheme: daymo
```

스토어 출시 후 식별자 변경은 어렵다. 소유 도메인이 있다면 역도메인 형식을 우선 사용한다.

### 초기 운영 범위

첫 알파 확정 범위:

- 누구나 계정을 만들 수 있는 공개 회원가입
- 여행 공간과 콘텐츠는 초대 링크로 참여한 멤버만 접근
- 하나의 초대 링크는 7일간 최대 10명이 사용하며 owner가 언제든 폐기 가능
- 초대 참여자의 기본 권한은 `editor`; 참여 후 owner가 멤버별 권한 변경 가능
- 로그인과 이메일 인증을 마친 사용자는 별도 owner 승인 없이 유효한 링크로 즉시 참여
- 공간 삭제 요청은 즉시 목록에서 숨기고 7일간 owner 복구를 허용한 뒤 최종 삭제
- 이메일 로그인 우선
- 공간별 owner 포함 최대 10명
- 멤버가 공간을 나가도 공동 콘텐츠와 작성자 이름은 유지하고, 나가기 전 본인 사진 검토·삭제 제공
- owner가 멤버를 내보내도 공동 콘텐츠와 작성자 이름은 유지하고 접근만 즉시 차단
- 여행·일정·장소·준비물 실제 연동
- 요리·기록·사진은 이후 단계
- 이메일 소유 확인과 가입·로그인 자동화 공격 방어 포함
- 만 14세 이상만 가입, 생년월일 원본은 수집하지 않음
- 이메일 비밀번호는 8~128자, 조합 규칙 없이 흔한·유출 비밀번호만 차단하고 Argon2id로 저장
- 가입 이메일 인증은 30분 유효·1회용 링크로 처리하고 앱 Universal/App Link와 웹 fallback을 모두 제공
- 비밀번호 재설정도 30분 유효·1회용 링크로 처리하며 성공 후 기존 로그인 세션을 모두 종료
- 자동 로그인은 access token 15분, 회전형 refresh token 마지막 사용 후 90일로 운영
- 계정 삭제, 이메일·비밀번호 변경, 로그인 방식 연결·해제는 작업마다 매번 재인증
- 공간 삭제는 재인증 대신 공간 이름 입력과 삭제 영향·7일 유예 최종 재확인을 모두 요구
- 활성 로그인 기기는 계정당 최대 5대이며 초과 시 가장 오래 사용하지 않은 다른 기기 세션을 종료
- 여행은 일반 화면에서 보관하고, 보관함 관리 메뉴에서 삭제한 뒤 7일간 복구 가능
- 여행 보관·해제는 owner/editor, 여행 전체 삭제·복구는 owner만 가능
- 보관된 여행도 일정·장소·준비·요리·기록·사진을 계속 편집 가능
- 지난 여행은 자동 보관하지 않고 여행·장소·요리 편집만 확인; 동의 후 같은 여행·기기에서 10분간 재확인 생략
- 결제, 광고와 공개 커뮤니티 제외

### 첫 출시 로그인 범위

1. 이메일
2. Apple
3. Google
4. Kakao
5. Naver

다섯 방식을 모두 첫 출시에서 지원한다. 구현 커밋은 제공자별로 분리하고 로그인·취소·탈퇴·계정 연결을 각각 검증한다.

## 2. 사진에서 말하는 `로컬 저장`

S3는 AWS의 Amazon S3에서 시작한 오브젝트 저장 방식이다. `S3 호환 스토리지`는 AWS뿐 아니라 같은 API 방식을 지원하는 다른 회사의 저장소도 포함한다. Daymo에서 반드시 Amazon S3를 사용해야 하는 것은 아니다.

`로컬 저장`은 다음 두 의미를 구분해야 한다.

### A. 사용자 휴대폰에만 저장

- 사진 원본과 표시본을 각 사용자 기기에 둔다.
- 서버 저장 공간과 업로드 데이터가 가장 적다.
- 앱 삭제, 기기 분실·교체 시 사진을 잃을 수 있다.
- 다른 멤버가 같은 사진을 자동으로 볼 수 없다.
- iCloud/Google Photos 등 OS 사진 보관함에 저장된 사진은 앱이 소유하거나 백업을 보장할 수 없다.

Daymo의 사진이 개인 기록이고 멤버 공유가 필요 없다면 가능한 방식이다. 공동 여행 기록으로 함께 보려면 기기 간 직접 전송 또는 서버 업로드 기능이 추가로 필요하다.

### B. iwinv VPS 디스크에 저장

- `/srv/daymo/uploads` 같은 VPS volume에 사진을 저장한다.
- 별도 Amazon S3 계정이나 비용이 필요 없다.
- 멤버끼리 사진을 공유할 수 있다.
- API·DB·사진이 같은 50GB NVMe를 사용한다.
- VPS 장애나 디스크 손실에 대비해 다른 장소로 백업해야 한다.
- 사진 증가량 제한과 저장 공간 경고가 필요하다.

초기 소수 사용자라면 현실적인 선택이다. 다음 조건을 적용한다.

```text
사진 저장 상한: 10GB(장당 2MB 기준 약 5,000장). 기본 50GB 디스크의 전용 경로에 둔다
사진 1장: 최대 20MB
공간 1개: 최대 1GB
동영상: 초기 미지원
디스크 70%: 경고
디스크 85%: 신규 업로드 제한
모든 선택 사진 원본 보관, 표시본·썸네일 별도 생성
업로드 기본값은 Wi-Fi와 모바일 데이터 모두 허용, 사용자가 기기별로 Wi-Fi 전용 설정 가능
사진 삭제·복구는 업로더의 본인 사진과 owner의 모든 사진에 허용, 다른 editor의 타인 사진은 금지
사진 설명·날짜·장소·일정 연결 수정도 업로더의 본인 사진과 owner의 모든 사진에만 허용
공간 사진 사용량 80%부터 경고, 100%에서는 기존 사진을 유지하고 신규 업로드만 차단
외부 일일 백업
로그와 Docker image 용량 제한
```

원본은 HEIC/HEIF를 포함해 선택한 형식 그대로 private volume에 보존한다. 서버는 촬영일만 별도 저장하고 GPS·기기 EXIF를 제거한 긴 변 2048px JPEG 표시본과 480px JPEG 썸네일을 만든다. 같은 여행에서 checksum이 같은 사진은 중복 후보로 안내하지만 사용자가 원하면 추가할 수 있다.

사진 파일은 Nginx 공개 폴더로 직접 노출하지 않는다. API가 멤버 권한을 검사한 뒤 짧게 유효한 다운로드 주소 또는 내부 전달 방식으로 제공한다.

### C. 외부 S3 호환 저장소 — 현재 미사용

- VPS와 사진 장애 영역을 분리한다.
- 사진이 늘어도 VPS 기본 디스크 용량에 묶이지 않는다.
- 별도 공급자, 접근 키, 비용과 개인정보 처리 국가 확인이 필요하다.

공개 사용자 규모가 커진 뒤 이전할 수 있다. 처음부터 저장소 interface를 분리하면 VPS 로컬에서 외부 저장소로 옮길 때 앱 API를 바꾸지 않아도 된다.

### 현재 확정 구조

사용자가 뜻한 로컬은 **iwinv VPS 디스크**로 확인됐다. 다음 구조로 시작한다.

```text
모바일 기기
  ├─ 원본 선택
  └─ 원본 업로드
        ↓
FastAPI 권한 검사
        ↓
/srv/daymo/uploads 원본·표시본·썸네일 비공개 volume
        ↓
restic 암호화 snapshot
        ↓
rclone을 통해 Google Drive 자동 백업
```

코드에서는 `PhotoStorage` interface를 두고 첫 구현을 `LocalPhotoStorage`로 만든다. 나중에 필요할 때 `S3PhotoStorage`로 교체한다.

Google Drive에는 노출 가능한 폴더 원본을 그대로 올리지 않는다. restic이 암호화·중복 제거된 시점별 snapshot을 만들고 rclone이 Google Drive와 연결한다. 단순 mirror sync는 서버의 실수나 손상이 백업에도 복제될 수 있어 사용하지 않는다.

백업은 사용자가 이미 보유한 Daymo 전용 Google 계정을 사용한다. 2단계 인증과 복구 수단을 설정하고, VPS에는 Google 비밀번호가 아니라 rclone OAuth token만 둔다. 최초 연결은 관리자 PC에서 브라우저로 승인한 뒤 암호화된 rclone 설정을 VPS secret 경로로 전달한다.

백업 job은 매일 04:00 Asia/Seoul에 DB dump와 사진을 restic snapshot으로 저장하고 일간 14개·주간 8개·월간 6개를 보존한다. 한 단계라도 실패하면 Daymo 운영 이메일로 즉시 알린다. 매월 자동 표본 복원 결과를 확인하고, 분기마다 빈 local/staging 환경에서 전체 복원과 앱 smoke test를 직접 수행한다.

## 3. 로컬 개발 환경

### 현재 확인된 상태 (2026-09-16)

| 항목 | 현재 상태 |
| --- | --- |
| Node.js | 24 LTS. 루트 `.nvmrc`와 `mobile/package.json` engines로 고정 |
| Python | 3.13, 패키지와 가상환경은 uv |
| Expo | SDK 57 |
| React Native | 0.86.3, React 19.2.3, TypeScript 6.0.x |
| PostgreSQL | 16. 로컬은 `backend/compose.yml`, 운영은 같은 VPS의 private volume |
| FastAPI | `backend/` 에 있다. `uv run python dev.py` 로 띄운다 |
| 네이티브 폴더 | `mobile/ios`·`mobile/android` 를 두지 않는다. 빌드할 때 `npx expo prebuild` 로 만든다 |

### 필요한 도구

- Node.js LTS, npm
- Xcode, CocoaPods, iOS Simulator
- Android Studio, Android SDK
- Python 3.13
- uv (파이썬 패키지·가상환경 관리)
- Docker Desktop
- VS Code 또는 PyCharm 권장
- Git

Python과 uv는 운영체제마다 설치 방법이 다르므로 각 공식 설치 안내를 그대로 따른다. 이 문서에는 검증하지 않은 설치 명령을 적지 않는다. 로컬 Android 빌드에 필요한 JDK는 Android Studio가 함께 설치하는 것을 사용하고, 서버 개발용으로 따로 설치하지 않는다.

백엔드 기준:

```text
Python 3.13
FastAPI + uvicorn
uv (패키지·가상환경)
PostgreSQL 16
SQLAlchemy 2.0 + Alembic
psycopg 3
Pydantic v2
httpx (OAuth provider 호출)
PyJWT
Pillow (이미지 변환)
pytest
OpenAPI (FastAPI 자동 생성)
```

잃는 것도 적어 둔다. Spring Security OAuth2 Client가 대신 해 주던 authorization code 교환과 state 검증을 직접 짠다. Authlib 없이 httpx 로 provider 를 부른다(`backend/app/services/oauth/`). provider token 은 저장하지 않아 token 갱신은 필요 없다.

Redis, Kafka, Elasticsearch, Kubernetes는 초기 범위에서 제외한다.

## 4. 필요한 외부 계정

### 기반 개발

- GitHub
- 로컬 PostgreSQL
- 로컬 테스트 이메일 환경

### 인증 단계

- Apple Developer
- Kakao Developers
- Naver Developers
- Google Cloud Console
- staging/production 도메인

### 배포·운영 단계

- iwinv VPS
- 가비아(도메인)와 Cloudflare(권한 DNS·메일 수신 전달)
- Vercel(소개 사이트와 웹 빌드)
- Resend(메일 발송)
- Expo/EAS
- App Store Connect
- Google Play Console
- Sentry — 코드는 들어갔고 `SENTRY_DSN`이 비어 있어 꺼져 있다. 켜는 절차는 9장

외부 사진 저장소는 VPS 로컬 저장을 선택하면 초기에는 필요 없다.

## 5. 앱의 공개 환경 변수

앱 번들에서 읽을 수 있으므로 공개되어도 되는 설정만 넣는다.

실제로 앱 코드가 읽는 것은 셋뿐이다(`mobile/.env.example`).

```dotenv
# 비우면 운영 API인 https://api.daymo.xyz 를 쓴다
EXPO_PUBLIC_DAYMO_API_URL=https://api.daymo.xyz

# 네이버 지도 단축 링크의 장소명·주소를 받아 오는 주소. 비우면 앱이 기기에서 읽을 수 있는 만큼만 채운다
EXPO_PUBLIC_DAYMO_PLACE_RESOLVER_URL=

# 앱이 멈췄을 때 오류 한 줄을 Daymo 서버로 보낼지. 비우면 보내고, off(또는 0·false)면 보내지 않는다
EXPO_PUBLIC_DAYMO_ERROR_REPORT=
```

소셜 로그인도 위 API가 맡는다. 앱에 넣을 제공자 키는 없다. 웹 빌드는 `site/build.mjs`가 `EXPO_PUBLIC_DAYMO_API_URL=https://api.daymo.xyz`와 `DAYMO_WEB_BASE_URL=/app`을 넣어 내보낸다.

`EXPO_PUBLIC_*`에 비밀번호, OAuth secret, DB 접속 정보나 서명 키를 넣지 않는다. 실제 `.env`는 커밋하지 않고 `.env.example`만 커밋한다.

## 6. 백엔드 기본 시크릿

```dotenv
APP_ENV=local
# localhost 로 두지 않는다. 윈도우에서 ::1 로 풀려 연결이 멈춘다
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=daymo
DB_USERNAME=daymo
DB_PASSWORD=
JWT_SIGNING_KEY=
REFRESH_TOKEN_PEPPER=

# 메일·초대 링크와 OAuth callback 의 앞부분
AUTH_LINK_BASE=https://api.daymo.xyz
# 브라우저에서 API 를 부를 수 있는 출처. 웹 빌드 주소를 넣는다
CORS_ORIGINS=https://www.daymo.xyz,https://daymo.xyz
```

- SQLAlchemy 접속 URL은 위 값으로 `postgresql+psycopg://` 형식으로 조립한다. 비밀번호가 들어간 완성 URL을 저장소나 로그에 남기지 않는다.
- `JWT_SIGNING_KEY`와 `REFRESH_TOKEN_PEPPER`는 서로 다른 긴 난수로 생성한다. `APP_ENV`가 `beta`·`production`이면 둘 중 하나라도 비었거나 32바이트보다 짧거나 둘이 같으면 서버가 뜨지 않는다.
- 운영값은 VPS root 전용 env 또는 배포 secret에 저장한다.
- 로컬·staging·production 값을 재사용하지 않는다.

## 7. OAuth 시크릿

```dotenv
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# 로그인 뒤 돌아갈 수 있는 앱 주소. 쉼표로 여럿
OAUTH_APP_REDIRECT_URIS=daymo://oauth,https://www.daymo.xyz/oauth,https://daymo.xyz/oauth
```

- Apple은 `APPLE_CLIENT_SECRET`이 아니라 위 네 값으로 요청마다 5분짜리 client secret을 서버가 서명해 만든다. `APPLE_CLIENT_ID`는 번들 ID가 아니라 Services ID다.
- 켜지는 조건: google은 id와 secret 둘 다, kakao는 REST API 키만(secret은 콘솔에서 켰을 때만), naver는 id와 secret 둘 다, apple은 네 값 모두. 하나라도 비면 그 provider는 `/auth/oauth/providers` 목록에서 빠지고 버튼도 안 보인다.
- OAuth secret과 Apple private key는 서버에만 둔다. 앱 `.env`에는 넣을 값이 없다.
- Kakao 네이티브 앱 키와 REST API 키를 구분한다. 서버는 REST API 키를 쓴다.
- 개발·staging·운영 redirect URI를 각각 등록한다.
- 로그인 결과의 access/refresh token을 URL에 넣지 않는다.
- 값을 넣은 provider만 켜진다. 비어 있으면 앱에 그 버튼이 나오지 않는다. 운영에서는 `/etc/daymo/secrets/runtime.env`에 넣고 api 컨테이너를 다시 만든다.

### 7.1 provider 콘솔에 등록할 값

provider에 등록하는 redirect URI는 앱 주소가 아니라 API 주소다. 운영은 아래와 같고, 한 글자라도 다르면 provider가 거부한다.

| provider | redirect URI |
| --- | --- |
| Google | `https://api.daymo.xyz/v1/auth/oauth/google/callback` |
| Apple | `https://api.daymo.xyz/v1/auth/oauth/apple/callback` |
| Kakao | `https://api.daymo.xyz/v1/auth/oauth/kakao/callback` |
| Naver | `https://api.daymo.xyz/v1/auth/oauth/naver/callback` |

로그인이 끝나면 API가 앱을 `daymo://oauth`로 연다. 이 주소는 `OAUTH_APP_REDIRECT_URIS`(기본 `daymo://oauth`)에 있어야 한다. Expo Go로 시험하면 앱이 `exp://<PC IP>:8081/--/oauth`를 쓰므로 그 주소를 쉼표로 더한다.

**웹 버전은 같은 출처의 `/oauth`로 돌아온다.** `https://www.daymo.xyz/oauth`와 `https://daymo.xyz/oauth`를 같은 값에 더하고, 로컬 웹 시험에는 `http://localhost:8081/oauth`를 더한다. Vercel 미리보기 도메인은 자동으로 허용되지 않는다. provider 콘솔에 등록하는 redirect URI는 웹에서도 위 표의 API 주소 그대로다. 바뀌는 것은 서버가 마지막에 앱을 여는 주소뿐이다.

콘솔 메뉴 이름은 개편으로 바뀔 수 있다. 아래는 2026-09 기준이다.

**Google** — Google Cloud Console의 Google Auth Platform
1. 브랜딩(동의 화면)에 앱 이름·지원 이메일(`support@daymo.xyz`)·개인정보처리방침 URL을 넣는다.
2. 클라이언트 만들기 → 유형 **웹 애플리케이션** → 승인된 리디렉션 URI에 위 주소.
3. 클라이언트 ID·보안 비밀을 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`에 넣는다.
4. 게시 상태가 테스트면 등록한 테스트 사용자만 로그인된다. 출시 전에 프로덕션으로 게시한다. 요청 범위는 `openid email profile`뿐이라 민감 범위 심사 대상이 아니다.
5. **앱 로고는 올리지 않는다(2026-09-15).** 로고를 올리면 브랜드 인증을 거쳐야 하는데, 앱 아이콘 그림(비행기 + Daymo)이 "브랜드를 고유하게 식별하는 로고가 아니다"로 두 번 반려됐다. 로고 없이도 기본 범위만 쓰는 앱은 프로덕션으로 게시할 수 있고 동의 화면에는 앱 이름과 도메인이 보인다. 로고를 다시 올리려면 Search Console 도메인 확인(완료)을 유지한 채 글자 위주 로고를 따로 만들어 홈페이지에도 같은 모양을 보인다.

**Apple** — Apple Developer의 Certificates, Identifiers & Profiles
1. App ID(`com.hwangslater.daymo`)에 Sign in with Apple을 켠다.
2. Services ID를 새로 만든다(예: `com.hwangslater.daymo.signin`). Sign in with Apple을 켜고 Configure에서 Primary App ID는 위 App ID, Domains는 `api.daymo.xyz`, Return URLs는 위 주소.
3. Keys에서 Sign in with Apple 키를 만들고 `.p8`을 받는다. **한 번만 받을 수 있다.** 비밀번호 관리 도구에 보관한다.
4. `APPLE_CLIENT_ID`=Services ID, `APPLE_TEAM_ID`=멤버십의 Team ID, `APPLE_KEY_ID`=키 ID, `APPLE_PRIVATE_KEY`=`.p8` 내용을 줄바꿈 대신 `\n`으로 이은 한 줄.
5. 이메일 가리기를 고른 사용자는 `@privaterelay.appleid.com` 주소로 온다. 그 주소로 메일이 닿으려면 Sign in with Apple for Email Communication에 발신 도메인 `daymo.xyz`와 `no-reply@daymo.xyz`를 등록한다(SPF 필요).

**Kakao** — Kakao Developers
1. 앱을 만들고 카카오 로그인 사용 설정을 ON으로 둔다.
2. 앱 → 플랫폼 키 → REST API 키에 Redirect URI를 등록한다. 같은 곳의 클라이언트 시크릿이 켜져 있으면 값을 `KAKAO_CLIENT_SECRET`에 넣는다(새 키는 기본으로 켜져 있다).
3. REST API 키를 `KAKAO_REST_API_KEY`에 넣는다. 장소 조회용 Vercel 함수도 같은 이름을 쓰는데 다른 환경이다. 그쪽에도 넣으려면 앱 → 카카오맵(로컬) 사용 설정을 켠다. 안 넣어도 카카오맵 짧은 링크의 이름과 주소는 채워진다.
4. 동의항목에서 닉네임을 켠다. **이메일(`account_email`)은 비즈 앱 전환과 추가 기능 신청(심사)을 거쳐야 설정할 수 있다.** 사업자 없는 개인 개발자도 본인인증 후 비즈 앱으로 전환해 신청할 수 있다. 이메일을 받지 못하면 Daymo는 카카오로 새 계정을 만들지 않는다.

**Naver** — NAVER Developers
1. Application 등록 → 사용 API **네이버 로그인** → 제공 정보에서 이메일 주소(필수)와 별명 또는 이름을 고른다.
2. 로그인 오픈 API 서비스 환경에 PC 웹을 더하고 서비스 URL `https://daymo.xyz`, Callback URL에 위 주소.
3. Client ID·Client Secret을 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`에 넣는다. 장소 검색용 Vercel 함수의 같은 이름 변수와 다른 환경이다.
4. 검수 전에는 멤버 관리에 등록한 네이버 아이디만 로그인된다. 출시 전에 검수를 요청한다.

## 8. VPS 로컬 사진 저장 설정

외부 S3를 사용하지 않는 경우 필요한 서버 설정 예시:

API 컨테이너가 읽는 값(괄호는 기본값):

```dotenv
UPLOAD_ROOT=/srv/daymo/uploads          # (uploads) 사진 루트
PHOTO_MAX_BYTES=20971520                # (20MB) 원본 한 장
PHOTO_SPACE_QUOTA_BYTES=1073741824      # (1GB) 공간 하나
PHOTO_TOTAL_QUOTA_BYTES=10737418240     # (10GB) 서버 전체
PHOTO_ACCEL_PREFIX=                     # 비우면 API가 파일을 직접 보낸다
```

백업 쪽은 API가 아니라 systemd unit이 읽는다.

```dotenv
RESTIC_REPOSITORY=rclone:daymo-drive:daymo-backup
RESTIC_PASSWORD_FILE=/etc/daymo/secrets/restic-password
RCLONE_CONFIG=/etc/daymo/secrets/rclone.conf
```

`PHOTO_ACCEL_PREFIX`에 `/_protected_uploads/`를 넣으면 API가 권한만 보고 Nginx에 파일 전달을 넘긴다. 켜는 순서와 파일 권한은 [06-vps-deployment.md](./06-vps-deployment.md) 6장. 파일 접근용 서명 URL은 쓰지 않는다. 앱은 `GET /v1/photos/{id}/content`를 부르고 서버가 매번 권한을 본다. 실제 파일 경로를 API 응답이나 로그에 노출하지 않는다.

Google 계정 연결 과정에서 생성되는 rclone OAuth token과 restic repository password도 시크릿이다. 채팅이나 Git에 올리지 않고 VPS root만 읽을 수 있게 보관한다. Google 계정 비밀번호 자체를 VPS에 저장하지 않는다.

## 9. 이메일과 오류 수집

이메일 발송은 iwinv VPS에서 메일 서버를 직접 운영하지 않고 Resend SMTP를 사용하기로 결정했다. 가정용·클라우드 IP에서 직접 SMTP로 보내면 차단되거나 스팸으로 분류되기 때문이다. 미니PC로 옮긴 뒤에도 중계 서비스를 그대로 사용한다.

```dotenv
MAIL_FROM=Daymo <no-reply@daymo.xyz>
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USERNAME=resend
SMTP_PASSWORD=
SMTP_STARTTLS=true
```

`SMTP_PASSWORD` 말고는 모두 코드의 기본값과 같다. 로컬 개발에서는 Mailpit 같은 로컬 메일 서버를 사용해 실제 발송 키 없이 검증할 수 있다.

2026-09-15에 `daymo.xyz` 발신 인증(SPF·DKIM, 도쿄 리전)을 마쳤다. `support@daymo.xyz` 수신은 Cloudflare Email Routing이다. DMARC 레코드(`_dmarc`)는 아직 없다.

`SMTP_PASSWORD`에는 Resend API Key를 넣는다. 앱에 포함하지 않고 API 서버 운영 secret(`/etc/daymo/secrets/`)에만 둔다. `daymo.xyz` DNS에는 Resend가 안내하는 도메인 인증·DKIM 레코드를 설정하고 DMARC 정책도 단계적으로 적용한다.

도메인 구매 후 진행 순서:

1. Resend 계정에서 `daymo.xyz` 추가
2. Resend가 표시한 DNS 레코드를 도메인 등록기관에 입력
3. 도메인 검증 완료 확인
4. 발송 전용 API Key 생성
5. VPS secret에 SMTP 설정 등록
6. 가입 인증·재전송·비밀번호 재설정·초대 메일 테스트

인증 메일 재전송은 60초 간격과 계정/IP별 하루 5회로 제한한다. 로그인은 15분 내 5회 실패부터 점진적으로 지연하고 최대 15분만 일시 제한한다. 정상 가입에는 CAPTCHA를 넣지 않고 실제 자동화 위험 신호가 있을 때만 challenge를 요구한다. 모든 인증 응답은 계정 존재 여부를 드러내지 않는다.

### 오류 수집(Sentry) 켜기

코드는 이미 들어가 있다. **`SENTRY_DSN`이 비어 있으면 아무 일도 하지 않는다.** 서버가 `sentry_sdk`를 import조차 하지 않는다. 지금은 꺼진 상태이고, 아래를 하면 켜진다.

앱에는 Sentry SDK를 넣지 않았다. 앱은 오류 한 줄을 `POST /v1/client-errors`로 Daymo 서버에만 보내고, 그것이 바깥으로 나갈지는 서버의 이 값 하나가 정한다. 그래서 앱을 새로 빌드하지 않아도 켜고 끌 수 있다.

**켜기 전에 반드시 할 일.** DSN을 넣는 순간 오류 정보의 국외 이전이 시작된다. 아래 넷을 먼저 고친다.

1. [08-privacy-and-release-compliance.md](./08-privacy-and-release-compliance.md) 4장 위탁 표의 Sentry 줄을 "쓰는 중"으로
2. 처리방침 `site/src/privacy.html`의 6장 위탁 표와 7장 국외 이전 표. **줄은 이미 써 뒀고 주석으로 막혀 있다.** 주석을 풀고 조직 리전에 맞춰 국가를 적은 뒤 개정일을 고친다
3. `release/shared/data-inventory.md`
4. App Store의 "진단", Play의 "비정상 종료 로그·진단" 답변(`release/app-store/app-store-connect.md` 6장, `release/play-store/play-console.md` 5장)

**받는 곳과 순서.**

1. <https://sentry.io> 에서 계정을 만든다. 무료 plan으로 시작한다
2. 조직을 만들 때 **데이터 저장 리전을 고른다.** 한 번 정하면 못 바꾼다. 유럽(EU)과 미국(US) 중 하나이고, 어느 쪽이든 국외 이전이라 처리방침에 그 나라를 적는다
3. 새 프로젝트를 만든다. 플랫폼은 **Python → FastAPI**. 이름은 `daymo-backend`
4. 만들고 나면 나오는 **Client Keys(DSN)** 값을 복사한다. `Settings → Projects → daymo-backend → Client Keys (DSA)` 에서 다시 볼 수 있다. `https://<키>@o<번호>.ingest.sentry.io/<번호>` 모양이다
5. `Settings → Projects → daymo-backend → General → Event Retention`을 **30일**로 맞춘다
6. `Settings → Security & Privacy`에서 `Data Scrubber`와 `Use Default Scrubbers`를 켜 둔다. 서버가 이미 지우고 보내지만 두 번 막는 편이 낫다
7. VPS의 `/etc/daymo/secrets/runtime.env`에 아래 한 줄을 더하고 API 컨테이너를 다시 띄운다.
   `compose.yml` 의 api `environment` 에 `SENTRY_DSN: ${SENTRY_DSN:-}` 이 있어야 컨테이너까지
   간다(2026-09-17에 넣었다). compose 는 거기 적힌 것만 넘기므로 `runtime.env` 에만 두면 켜지지 않는다

```dotenv
# 비어 있으면 오류 수집이 꺼진다. 값을 넣으면 켜진다.
SENTRY_DSN=
```

8. 앱에서 일부러 오류를 내 보거나 서버 로그에 `error tracking enabled` 한 줄이 찍혔는지 본다

DSN은 비밀값은 아니지만(이벤트를 보낼 수만 있다) 저장소에 넣지 않는다. 다른 secret과 같은 자리에 둔다.

**무엇이 올라가는지.** 예외 종류와 난 자리, 라우트 틀(`/v1/trips/{trip_id}`), 상태 코드, 요청 ID, UUID, 그리고 앱에서 온 것이면 플랫폼·앱 버전·어느 화면인지. 이메일·이름·여행 내용·장소명·사진·토큰·초대 링크·비밀번호·IP·요청 본문·쿠키는 `backend/app/core/observability.py`의 `scrub_event`가 보내기 전에 지운다. 무엇을 지우는지는 `backend/tests/test_observability.py`가 고정하고 있어서, 거르는 규칙을 건드리면 시험이 먼저 깨진다.

**끄기.** `SENTRY_DSN`을 비우고 다시 띄우면 된다. 앱 쪽까지 멈추려면 `EXPO_PUBLIC_DAYMO_ERROR_REPORT=off`로 웹 빌드를 다시 내보낸다.

소스맵 업로드(`SENTRY_AUTH_TOKEN`·`SENTRY_ORG`·`SENTRY_PROJECT`)는 쓰지 않는다. 앱 스택을 보내지 않아서 풀 것이 없다.

## 10. 푸시 알림 자격 증명

iOS:

- Apple Push Notification Key
- Apple Team ID
- Key ID

Android:

- Firebase 프로젝트
- FCM 자격 증명
- `google-services.json`

알림 기능 단계 전에는 필요하지 않다.

첫 출시 푸시는 초대 참여, 담당 지정·변경, 여행 임박으로 제한한다. 여행 임박 알림은 공간 timezone 기준 출발 7일 전과 1일 전 오전 9시에 보낸다. 일반적인 공동 콘텐츠 수정은 앱 내 동기화로만 보여주며 마케팅 알림은 별도 동의를 받는다.

## 11. GitHub Actions 배포 시크릿

```text
GHCR_USERNAME
GHCR_TOKEN
VPS_HOST
VPS_PORT
VPS_USER
VPS_SSH_PRIVATE_KEY
VPS_KNOWN_HOSTS
SENTRY_AUTH_TOKEN
EXPO_TOKEN
```

VPS root 비밀번호 대신 제한된 배포용 SSH 키를 사용한다.

VPS에는 `daymo-deploy` 계정을 만들고 SSH public key를 등록한다. SSH 설정은 key 인증만 허용하고 비밀번호와 root 원격 로그인을 차단한다. `daymo-deploy`에는 임의 root shell이나 Docker socket 접근을 주지 않고, root 소유 allowlist 배포 script 실행만 sudoers에 허용한다.

GitHub Environment Secrets에는 배포 SSH key·host 등 CI에 실제 필요한 값만 넣는다. 애플리케이션 운영 secret은 `/etc/daymo/secrets/` 아래 root 소유 `0600` 파일로 두고 workflow 출력이나 image layer에 복사하지 않는다.

OS security patch는 자동 설치하되 자동 재부팅은 사용하지 않는다. 재부팅 필요 알림을 Daymo 운영 이메일로 받은 뒤 백업과 서비스 상태를 확인하고 직접 재부팅한다. 일반 package·major upgrade는 수동 검토한다.

## 12. iwinv VPS 준비

2026-09-14 iwinv VPS를 생성하고 Ubuntu 24.04 LTS에 초기 운영 구성을 배포했다. 영수증·계약 화면과 관리 콘솔에서 실제 데이터센터 국가와 세부 지역을 최종 확인해 운영 기록과 개인정보 처리방침 초안에 반영한다.

VPS는 먼저 beta/staging 모드로 공개 가입을 받고, 계정·여행·사진을 지우지 않은 채 production으로 전환한다. 같은 2GB VPS에서 staging과 production을 동시에 상시 실행하지 않는다. 베타 시작 전부터 production 수준 약관·처리방침·백업·신고 운영을 갖추고, 전환 직전 전체 snapshot의 실제 복원을 확인한다.

GitHub의 `main`은 직접 push하지 못하게 보호하고 pull request의 필수 CI가 통과한 뒤에만 merge한다. VPS는 성공한 최신 `main` CI commit만 주기적으로 가져와 자동 배포한다. schema 변경 배포는 직전 DB snapshot이 성공해야 하며, health/smoke test가 실패하면 이전 image로 자동 복귀한다. DB 변경은 기존 버전과 함께 동작하는 expand-contract 방식으로 나눈다.

모든 PR에서 앱 typecheck·lint·unit test와 서버 pytest·PostgreSQL 컨테이너 DB test를 실행한다. EAS iOS/Android build는 일반 PR에서 제외하고 release candidate에서만 병행한다. Dependabot은 매주 생태계별 묶음 PR을 만들지만 자동 merge하지 않으며 CI와 호환성 확인 후 직접 병합한다.

초기 1인 개발에서는 다른 사람의 PR 승인을 요구하지 않고 필수 CI를 통과한 PR만 squash merge한다. production 배포는 한 번에 하나만 실행하며 최신 대기 배포만 보존한다. 장애 rollback은 server image만 되돌리고 DB down migration은 사용하지 않는다.

앱 beta는 TestFlight와 Android 비공개 테스트를 병행한다. EAS OTA는 같은 native runtime의 JavaScript·이미지 변경만 내부 확인 후 단계적으로 확대하고, native 변경은 store 심사를 거친다. 강제 업데이트는 보안·API 비호환 상황에만 사용한다. 위험 기능은 server feature flag로 소수 대상부터 활성화하고 문제가 생기면 앱 재배포 없이 끈다.

베타 최소 기간은 정하지 않는다. 데이터 손실·권한 노출·로그인 불가·반복 crash가 0건이고 최근 7일 crash-free session 99.5% 이상, API p95 1초 이하를 충족한 뒤 사용자가 실기기와 백업 복원 결과를 확인해야 store release할 수 있다. 성능 때문에 기능·화질·오프라인·보존 정책이나 사용 흐름을 낮춰야 한다면 구현 전에 측정값과 대안을 사용자에게 보여주고 승인받는다.

기능과 OTA는 내부 → 10% → 50% → 100% 순서로 확대하고 문제가 발견되면 중단 후 이전 정상 OTA로 복귀한다. 치명적 서버 장애는 Daymo 전용 운영 이메일로 즉시 받고 나머지는 일일 요약으로 확인한다. 로그인 불가·장기 장애에는 앱 공지와 외부 상태 페이지를 함께 사용한다.

서버와 도메인이 준비되면 UptimeRobot 계정을 만들고 무료 plan에서 `https://api.daymo.xyz/health`를 5분 간격으로 등록한다. 장애·복구 수신 주소는 Daymo 운영 이메일로 지정하고 basic status page는 UptimeRobot 제공 URL을 사용한다. 유료 plan, custom domain과 `status.daymo.xyz`는 설정하지 않는다. 공개 페이지는 현재 상태만 표시하고 과거 장애 이력은 공개하지 않는다. 무료 plan 조건이 달라지면 유료 결제 대신 무료 대안을 다시 검토한다.

현재 예정 사양:

```text
업체     iwinv
리전     한국(구매 화면에서 실제 데이터센터 국가 확인 후 확정)
CPU      2 vCPU
RAM      2GB
디스크   NVMe 50GB
트래픽   일 20GB(월 600GB), 초과분은 구간 요금
요금     월 13,100원(일 490원)
OS       Ubuntu 24.04 LTS
```

결제 전에 [06-vps-deployment.md](./06-vps-deployment.md) 1장의 `구매 전 확인 목록`을 하나씩 확인한다. 하나라도 확인되지 않으면 결제하지 않는다.

초기에는 별도 블록 스토리지를 구매하지 않고 기본 50GB 디스크만 사용한다. 사진 10GB 상한이나 전체 디스크 70%에 가까워지면 미니PC와 NAS 이전을 준비한다.

준비할 항목:

- Ubuntu LTS
- Docker와 Docker Compose
- Nginx와 HTTPS 인증서
- SSH key 로그인과 방화벽
- PostgreSQL private volume
- 사진 private volume
- VPS 외부 백업
- 로그 rotation과 2GB 비상 swap
- 상태 확인 endpoint와 용량 경고

외부에는 80/443만 기본 공개하고 PostgreSQL 5432, API 8000과 FastAPI 자동 생성 문서 경로(`/docs`, `/redoc`, `/openapi.json`)는 공개하지 않는다. SSH 22는 관리자 IP 제한을 권장한다.

서버 OS는 Ubuntu 24.04 LTS로 고정한다. Nginx·FastAPI·PostgreSQL은 하나의 Docker Compose project로 실행하되 private network로 분리한다. 외부 요청은 Nginx 80/443만 받고 API 8000과 DB 5432는 host에 publish하지 않는다. PostgreSQL data는 container 삭제와 무관한 VPS private volume에 보존하며 초기에는 외부 DB 서비스를 구매하지 않는다.

## 13. 도메인과 공개 페이지

Daymo 전용 `daymo.xyz`를 가비아에서 구매했고 권한 DNS를 Cloudflare로 이전했다.

**권한 DNS는 처음부터 Cloudflare를 쓴다.** 미니PC 단계에서 쓸 Cloudflare Tunnel이 자기 zone의 DNS 레코드를 직접 만들어야 해서 어차피 한 번은 옮겨야 하고, 레코드가 하나도 없는 지금이 가장 싸다. 순서는 이렇다.

1. 가비아에서 `daymo.xyz` 구매. **구매 화면에서는 네임서버를 건드리지 않는다.** 기본값 그대로 둔다
2. Cloudflare 무료 계정을 만들고 `daymo.xyz`를 zone으로 추가
3. Cloudflare가 알려 주는 네임서버 두 개를 가비아 도메인 관리 화면의 네임서버 설정에 입력
4. Cloudflare에서 zone이 `Active`로 바뀔 때까지 기다린다(보통 몇 분~몇 시간)
5. **그다음에** VPS를 사고 `api.daymo.xyz` A record를 추가한다

레코드를 추가할 때 **proxy는 끈다(회색 구름).** VPS 단계에서 Cloudflare는 이름만 알려 주고 트래픽은 지나지 않는다. 미니PC로 옮긴 뒤에는 가정 회선의 인바운드 차단과 유동 IP 때문에 A record를 걸 수 없어 Cloudflare Tunnel을 사용한다([06-vps-deployment.md](./06-vps-deployment.md) 11장).

네임서버를 옮기면 DNS 질의 처리를 Cloudflare에 맡기는 것이므로 VPS 단계부터 위탁 표에 올린다([08-privacy-and-release-compliance.md](./08-privacy-and-release-compliance.md) 4장).

예시:

```text
www.daymo.xyz          Vercel 프로젝트 daymo-site. 소개·약관·처리방침·계정 삭제 안내와 /app 웹 빌드
daymo.xyz              www.daymo.xyz 로 308 redirect
api.daymo.xyz          Cloudflare A record → iwinv VPS 운영 API
```

Vercel project에는 정적 파일만 올리고 API·사진 요청은 보내지 않는다. Vercel Hobby는 비상업 beta·문서 제공 단계에서만 사용한다. 앱을 수익화하기 전 당시 Vercel 이용 조건을 다시 확인하고 Hobby가 허용되지 않으면 결제 여부를 자동 가정하지 말고 정적 문서를 다른 host로 이전한다.

**Git 연결로 배포하지 않는다.** `node site/build.mjs`로 `site/dist`를 만들고 `npx vercel deploy --prod --cwd site/dist`로 올린다. 저장소 push는 사이트를 바꾸지 않는다. 자세한 것은 `site/README.md`. 예전에 앱 웹 빌드를 올리던 `daymo` 프로젝트는 2026-09-15에 도메인만 떼어 두었다.

`api.daymo.xyz`는 Cloudflare A record로 VPS 공인 IPv4에 직접 연결한다. Nginx에서 Let's Encrypt 인증서를 발급하고 자동 갱신 timer, 갱신 dry-run과 만료 알림을 설정한다.

필요한 공개 페이지:

- 개인정보 처리방침
- 이용약관
- 계정 삭제 요청
- 고객 문의
- 오픈소스 라이선스

## 14. 개발 범위

### P0 기반과 데이터 안전

- 환경과 앱 식별자 고정
- 라우팅과 기능 파일 분리
- FastAPI, PostgreSQL과 Alembic
- 인증·세션·공간 권한
- 여행 생성과 홈
- SQLite 캐시·오프라인 읽기·동기화
- CI, 오류 처리와 백업

일정·장소·준비·요리·기록의 일반 생성·수정은 오프라인 pending mutation으로 저장하고 일괄 교체·멤버 관리·사진 전송은 온라인에서만 수행한다. 사진 썸네일·표시본 cache에는 앱 자체 용량 상한을 두지 않되 설정에서 사용량 확인과 직접 비우기를 제공한다. 명시적 로그아웃 후 계정별 local data는 잠가 유지하고 같은 계정 재인증 전에는 표시하지 않는다. sync는 실행·foreground·네트워크 재연결·사용자 새로고침과 OS background 기회에 수행한다.

### P1 현재 UI 실제 기능화

- 여행 목록·지도·캘린더
- 일정·교통·숙소·공동 메모
- 장소·태그·준비물·담당
- 요리·재료
- 사진·일기·기념 카드
- 검색·멤버 관리·알림 설정

### P2 출시 후

- 고급 통계와 추천
- AI 구조화 고도화
- 템플릿과 정교한 검색
- 사용자 규모에 따른 인프라 확장

## 15. 지금 채팅이나 Git에 제공하면 안 되는 값

- GitHub Personal Access Token
- Apple private key 원문
- Google service account JSON
- VPS root 비밀번호와 SSH private key
- 운영 DB 비밀번호
- JWT signing key와 refresh pepper
- OAuth client secret
- 사진 다운로드 서명 key
- Sentry auth token

시크릿은 사용자가 로컬 env, GitHub Actions Secrets 또는 VPS secret 파일에 직접 등록한다. 개발 작업에서는 변수 이름과 연결 성공 여부만 확인한다.

## 16. 개발 시작 전 사용자 결정

1. 앱 식별자 `com.hwangslater.daymo` 확정 완료
2. Node 24 LTS 확정, 기능 개발 전 Expo 최신 안정 SDK 업그레이드 검증 완료(SDK 57)
3. 첫 알파 공개 회원가입 확정, 공간은 초대 멤버 전용
4. 사진 저장은 iwinv VPS 기본 50GB 디스크, 사진 상한은 10GB로 확정
5. 외부 백업은 Google Drive로 시작
6. Google Drive 백업은 기존 Daymo 전용 계정 사용으로 확정
