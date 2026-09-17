# Daymo 작업 규칙

이 저장소에서 여는 모든 세션이 먼저 읽는다. 2026-09-17 까지의 작업 기록에서 뽑았다.

## 이 프로젝트

- Daymo: 둘이서 쓰는 여행 수첩. `mobile/`(Expo SDK 57, 같은 코드로 웹 빌드), `backend/`(FastAPI, iwinv VPS), `site/`(daymo.xyz), `release/`(스토어 자료), `docs/`(개발·디자인 문서).
- 운영 DB에 사용자의 **실제 계정**이 있다. 데모 계정과 구별한다. 실제 계정은 시킨 것만 바꾸고, 넣거나 지우기 전에 지금 상태를 보여 주고 확인받는다. 가상 데이터를 실제 계정에 섞지 않는다. 돈(지출·정산) 기록은 스스로 판단해 고치지 않는다.

## 말·문구

- 주석·커밋 메시지·문서·UI 문구는 전부 한국어. 「AI 느낌」 금지: 상투구, 영어 번역투, 과한 이모지, 뻔한 팔레트·폰트.
- UI 문구는 `docs/development/13-copy-glossary.md` 를 따른다. `npm test` 의 `copyGlossary` 검사가 금지어를 잡는다. 새 용어는 사전에 먼저 적는다.
- 기준은 시장에 있는 앱(카카오톡·토스·당근·인스타그램·삼성 갤러리·구글 포토·트리플)의 관행이다. 앱 안에서만 통하는 조어를 만들지 않는다.

## 디자인 결정 방식

- 시안은 **여러 개를 번호 붙여** 먼저 보여 주고, 고른 것에서 다시 변주한다. 고르기 전에 적용하지 않는다.
- 교체하는 아이콘·시안은 `docs/design/icon-archive/` 에 남긴다.
- 크기·간격·버튼은 `mobile/src/theme/controls.ts` 와 `mobile/src/ui/` 공용 부품을 쓴다(`docs/development/12-shared-ui-parts.md`). 같은 코드를 세 번째 쓰게 되면 부품으로 뽑고 문서에 적는다.

## 확인 방식

- 웹 미리보기(daymo-preview.vercel.app)와 Expo Go(터널) **둘 다** 본다. iOS 기기에서만 나는 문제가 있다(터치 응답, sticky 헤더, 한글 lineHeight). 기기 확인 전에 「됐다」고 하지 않는다.
- 사용자가 말한 증상을 그대로 믿고 그 지점부터 본다. 같은 시도를 세 번 넘게 반복하지 않는다 — 안 잡히면 접근을 바꾸거나 계측을 붙여 숫자로 묻는다.
- 스크린샷·샘플을 먼저, 설명은 짧게.

## 데이터·비밀

- 공개 저장소다. 실명·토큰·비밀값을 코드·문서·테스트·커밋에 쓰지 않는다. 비밀번호는 파일이나 stdin 으로만 넘기고 명령줄에 적지 않는다.
- 내 스크립트가 앱 계정으로 로그인할 때는 `installationId` 를 `"claude-tool"` 로 고정한다. 기기 한도(5대)를 잡아먹지 않기 위해서다.

## git·배포

- 커밋 메시지는 한국어. 끝나면 커밋 해시와 되돌리기 명령을 알린다. 「커밋 하나로」면 squash.
- 에이전트와 저장소를 나눠 쓸 때 `git add -A` 금지. 자기 파일만 add 한다. 에이전트는 워크트리에서 파일 단위로 나눠 맡긴다.
- push → VPS 백엔드 자동 배포(마이그레이션 포함).
- 웹 앱은 `node site/build.mjs` → `cd site/dist && npx vercel deploy --prod --yes`. `www.daymo.xyz/app` 하나뿐이다(2026-09-17에 별도 미리보기를 없앴다. 소셜 심사가 끝나 운영 주소를 막아 둘 이유가 사라졌다). 작업 중인 것은 Expo Go(터널)로 본다.
- **Vercel은 `--prod` 로 올려도 도메인 별칭이 자동으로 안 옮겨진다.** 올린 뒤 `npx vercel alias set <새 배포 주소> www.daymo.xyz` 와 `… daymo.xyz` 를 직접 하고, `curl -s https://www.daymo.xyz/app/ | grep -o 'AppEntry-[a-f0-9]*\.js'` 가 `site/dist` 의 번들 해시와 같은지 확인한다. `vercel deploy` 출력은 뒤쪽이 JSON 도움말이라 `tail` 로 자르면 배포된 것을 못 본다 — `head` 로 본다.
- 「브랜치 최신화」 = 다른 세션·기기에서 푸시한 것을 받아 합친다.
- EAS 빌드·버전 올림·스토어 제출은 앱이 완성될 때까지 하지 않는다. 유료 기능은 스토어 출시 뒤에 열고, 지금은 `features.ts` 에서 꺼 둔다.

## VPS (`ssh daymo-vps`)

- 배포·재시작은 `/srv/daymo/current/backend/infra/production/daymo-deploy` 가 한다. **컨테이너를 직접 만들거나 지우지 않는다.**
- 설정 파일(`/etc/daymo/secrets/runtime.env`)을 고쳤으면 다시 만들어야 반영되는데, compose 를 손으로 부를 때 **`--env-file /etc/daymo/secrets/runtime.env` 를 반드시 붙인다.** 빠뜨리면 compose 가 `${APP_ENV}` 를 빈 값으로 채워 API 가 뜨자마자 죽고 운영이 502 가 된다(2026-09-17에 겪었다).
  ```sh
  ssh daymo-vps "sudo sh -c 'cd /srv/daymo/current/backend/infra/production && docker compose --env-file /etc/daymo/secrets/runtime.env -f compose.yml up -d --force-recreate api'"
  ```
- 고치기 전에 `sudo cp … runtime.env runtime.env.bak-<까닭>` 로 사본을 남기고, 고친 뒤 그 줄만 `grep` 해서 확인한다. 파일 전체를 출력하지 않는다(비밀값이 들어 있다).
- 되돌린 뒤에는 `curl https://api.daymo.xyz/health` 가 200 인지, CORS 허용 목록이 뜻대로인지 확인한다.
- Git Bash 의 `ssh` 는 이 키를 못 읽는다(libcrypto). PowerShell 도구로 접속한다.

## 일하는 방식

- 갈래가 여럿이면 서브에이전트로 병렬. 에이전트가 「못 지킨 것」을 보고하면 그대로 전달하고 처리한다.
- **에이전트가 끝나면 그 자리에서 워크트리를 치운다.** 합친 뒤 `git worktree remove` → `git worktree prune` → 브랜치 삭제. 미루면 쌓인다(2026-09-17에 16개, 1.6GB 를 한꺼번에 치웠다).
  - 지우기 전에 `mobile/node_modules` 가 **본체를 가리키는 링크(junction)** 인지 본다. 재귀 삭제가 링크를 타면 본체가 날아간다. `cmd /c rmdir "<링크>"` 로 **링크만** 먼저 끊고 나서 폴더를 지운다.
  - `.pyd`·`.dll` 이 안 지워지면 그 파일을 **띄워 둔 프로세스가 남아 있는 것**이다(워크트리 `.venv` 는 본체 `.venv` 와 같은 파일을 가리킨다). 내가 띄운 미리보기 서버·스크립트를 먼저 끄고, Metro 같은 쓰는 중인 것은 건드리지 않는다.
  - 다 치운 뒤 본체 `mobile/node_modules` 항목 수와 `backend/.venv` 가 그대로인지, `npm test` 가 도는지 확인한다.
- 내가 띄운 서버·스크립트는 쓸 일이 끝나면 끈다. 오래 도는 에이전트 보고는 **철 지난 내용일 수 있으니** 그대로 옮기지 말고 지금 코드를 확인한 뒤 전한다.
- 「그만 건들자」는 즉시 중단.
- 남은 일 목록을 들고 있다가 「남은 거 뭐 있어?」에 바로 답한다.
- 검사 명령: `cd mobile && npx tsc --noEmit -p tsconfig.json && npm run lint && npm test`, `cd backend && python -m pytest -q`.
