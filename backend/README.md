# Daymo 백엔드

여행 기록을 기기 밖으로 옮기고 함께 보는 API. 아직 뼈대뿐이다.

설계는 코드가 아니라 문서에 있다. 고치기 전에 먼저 읽어라.

- [`docs/development/02-architecture-and-data-model.md`](../docs/development/02-architecture-and-data-model.md) — 도메인 모델과 테이블
- [`docs/development/03-api-specification.md`](../docs/development/03-api-specification.md) — 경로, 요청·응답, 오류 코드
- [`docs/development/01-development-environment.md`](../docs/development/01-development-environment.md) — 스택과 환경 변수
- [`docs/development/06-vps-deployment.md`](../docs/development/06-vps-deployment.md) — 서버 기준과 운영

## 실행

```bash
cd backend
uv sync --group dev
cp .env.example .env          # 로컬은 DB_PASSWORD=daymo
docker compose up -d postgres
uv run alembic upgrade head
uv run pytest
uv run python dev.py
```

`http://127.0.0.1:8000/docs` 에서 스키마를 볼 수 있다. `APP_ENV` 가 `production` 이면 열리지 않는다.

로컬에서 `uvicorn app.main:app` 을 직접 부르지 않고 `dev.py` 를 거치는 이유는 윈도우 때문이다.
uvicorn 이 이벤트 루프를 만든 뒤에 앱을 import 해서, 앱 안에서 루프 정책을 바꿔도 늦다. psycopg
비동기는 윈도우 기본 ProactorEventLoop 위에서 동작하지 않는다. 리눅스에서는 `dev.py` 가 아무 일도
하지 않으므로 운영 배포는 계속 uvicorn 을 직접 부른다.

## 구조

```text
app/
  main.py        앱 생성, 미들웨어, 오류 처리
  api/v1/        라우터. 새 기능은 여기에 모듈을 만들고 router.py 에 붙인다
  core/          설정, DB, 오류 코드, 응답 봉투
  models/        SQLAlchemy 모델 (아직 없음)
  schemas/       Pydantic 스키마 (아직 없음)
  services/      도메인 로직 (아직 없음)
alembic/         스키마 변경. 테이블은 여기를 거쳐서만 바뀐다
tests/           pytest
```

## 아직 없는 것

명세서에는 있고 코드에는 없다. 붙일 때 `app/api/v1/auth.py` 위의 목록을 함께 지운다.

- 로그인 실패 점진적 지연과 rate limit. 계정 hash + IP 기준 상태를 들고 있어야 하는데 그 저장소를 아직 정하지 않았다
- bot challenge
- 민감 작업의 1회용 `reauthProof`
- OAuth (사업자 키가 있어야 실제로 돌려 볼 수 있다)
- 메일 실제 발송. 지금은 `local`·`test` 에서만 보낼 내용을 모아 두고, 운영에서는 보내지 못했다고 로그에 크게 남긴다

## 지켜야 할 것

**응답은 봉투를 벗어나지 않는다.** 성공은 `{ "data": ..., "meta": { "requestId": ... } }`,
오류는 `{ "error": { "code": ..., "message": ..., "requestId": ... } }` 다.
`app/core/responses.py` 의 `ok`·`page`·`error_response` 를 쓰고 직접 만들지 않는다.
앱이 한 곳에서 응답을 푸는 것이 이 규칙에 달려 있다.

**오류 코드는 `ErrorCode` 에 있는 것만 쓴다.** 새 코드가 필요하면 API 명세서를 먼저 고친다.
앱이 코드 문자열로 분기하므로 임의로 바꾸면 앱이 조용히 깨진다.

**사용자에게 보이는 문구는 한국어로, 무엇을 하면 되는지 알 수 있게.**
예외 내용을 그대로 밖으로 내보내지 않는다. 원인은 `requestId` 로 로그에서 찾는다.

**스키마는 Alembic 으로만 바꾼다.** `Base.metadata.create_all` 을 부르지 않는다.

## 비밀 값

- `.env` 는 커밋하지 않는다. `.env.example` 만 커밋한다.
- `APP_ENV` 가 `beta` 나 `production` 이면 `JWT_SIGNING_KEY`·`REFRESH_TOKEN_PEPPER`·`DB_PASSWORD`
  가 비어 있을 때 서버가 뜨지 않는다. 빈 서명 키로 조용히 뜨는 것이 가장 위험해서다.
- 두 키는 32바이트 이상이어야 하고 서로 달라야 한다. HS256 서명 키가 해시 출력보다 짧으면
  그만큼 약해진다(RFC 7518 3.2).
- DB 접속 URL은 조각(`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USERNAME`/`DB_PASSWORD`)으로 받아
  코드에서 조립한다. 비밀번호가 든 완성 URL을 저장소나 로그에 남기지 않는다.
- 키는 이렇게 만든다.

  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(64))"
  ```
