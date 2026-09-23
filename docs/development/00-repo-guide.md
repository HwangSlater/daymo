# 00. 저장소 안내

README가 서비스 소개로 바뀌면서, 예전 README에 있던 개발자용 설명을 이 문서로 옮겼다.
저장소를 처음 열었을 때 어디에 무엇이 있는지, 어떻게 돌려 보는지를 다룬다.

## 저장소 구조

```text
mobile/     Expo 앱. 지금 동작하는 것의 전부다
  src/        화면과 도메인 로직
  api/        네이버 장소 조회용 Vercel 함수
  public/     소개·약관·처리방침 정적 페이지
backend/    동기화 API. 계정·공간·여행까지 열렸다
  app/models/    SQLAlchemy 모델
  app/services/  도메인 로직
  app/api/v1/    라우터
  alembic/       스키마 변경
  tests/         pytest
site/       www.daymo.xyz 정적 사이트 (소개·약관·처리방침·지원)
release/    스토어 제출 자료
docs/       설계 문서. 코드보다 여기가 먼저다
  development/    스택·모델·API·배포·개인정보
  product-rules/  제품 규칙
```

네이티브 폴더(`ios/`, `android/`)는 커밋하지 않는다. `npx expo prebuild`로 다시 만든다.

## 화면 구조

```text
홈        다음 여행 · 출발 전 확인할 것 · 지난 여행
여행      목록 │ 지도 │ 캘린더  →  여행 상세
찾기      통합 검색
우리      공간 · 멤버 · 통계 · 설정

여행 상세  여행 │ 장소 │ 준비 │ 요리* │ 비용 │ 기록
                             * 주방이 있는 여행에서만
```

## 기술 스택

| | |
| --- | --- |
| 런타임 | Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript 6.0 |
| 대상 | iOS · Android, 그리고 웹(`react-native-web`) |
| Node | 24 LTS (`.nvmrc`, `engines: >=24 <25`) |
| 화면 | `react-native-safe-area-context` · `react-native-svg`(지도·아이콘) |
| 인증 | `expo-auth-session` · `expo-web-browser` |
| 사진·파일 | `expo-image-picker` · `expo-file-system`(고른 사진을 문서 폴더로 옮겨 보관) · `expo-sharing` |
| 저장 | `@react-native-async-storage/async-storage` |
| 그 외 | `expo-font` · `expo-clipboard` · `expo-status-bar` |
| 아이콘 | `mobile/scripts/build-icons.py` (Pillow로 1024px 아이콘 3종 생성) |

라우팅 라이브러리나 상태 관리 라이브러리는 아직 쓰지 않는다. 화면 전환과 데이터가 전부 `WarmAppShell.tsx`와 `WarmTripDetail.tsx`의 `useState`다.

여행 상세는 2026-09-23 에 탭별로 나눴다. `WarmTripDetail.tsx` 는 상태·동기화·탭 고르기만 들고, 여섯 탭은 `mobile/src/trip/` 에 한 파일씩 있다(`TripOverview`·`TripPlaces`·`TripPreparation`·`TripCooking`·`TripMemories`·`TripMoney`). 두 곳 이상에서 쓰는 부품·문맥은 `trip/parts.tsx`, 두 곳 이상에서 쓰는 스타일은 `trip/styles.ts` 의 `공용스타일` 이다. 탭은 컨테이너를 가져오지 않는다 — 필요한 것은 props 로 받는다.

기기에 남기는 것은 아래가 전부다(2026-09-23 기준). 기기 설정은 이 기기만의 것이고 공간·멤버는 서버가 원본을 가지므로 파일을 일부러 나눠 뒀다.

| 열쇠 | 무엇 | 어디서 |
| --- | --- | --- |
| `daymo.auth.session.v1` | 로그인 토큰(폰은 SecureStore, 웹은 AsyncStorage) | `auth.ts` |
| `daymo.auth.installation.v1` | 이 기기를 가리키는 설치 id(기기 한도 5대) | `auth.ts` |
| `daymo.trip-data.v2` | 모든 여행의 계획·기록(날짜는 `YYYY-MM-DD` 키) | `WarmAppShell.tsx` · `tripStorage.ts` |
| `daymo.trip-data.v1` | 날짜를 `3일(금)` 이름표로 적던 옛 판. 읽으면서 v2 로 옮기고 지운다 | `tripStorage.ts` |
| `daymo.trip-data.v1.bak` | v2 로 옮기기 전의 v1 원본. 다음에 v2 가 제대로 읽히면 지운다 | `tripStorage.ts` |
| `daymo.spaces.v1` · `daymo.me.v1` | 공간·멤버·나 | `spaces.ts` |
| `daymo.device-settings.v1` | 테마·다크 모드 같은 이 기기 설정 | `deviceSettings.ts` |
| `daymo.card-drafts.v1.<여행id>` | 꾸미는 중인 추억 카드(여행마다 하나) | `cardDraftStorage.ts` |
| `daymo.invite.pending.v1` | 웹에서 잠깐 맡아 두는 초대(30분) | `inviteHandoff.ts` |
| `daymo.card-photo-tip.v3` · `daymo.feedback-card-hidden.v1` | 한 번만 보여 주는 안내를 봤는지 | `onceTip.ts` · `feedback.ts` |

여행 기록 열쇠 셋(`daymo.trip-data.*`)은 **로그아웃·계정 전환에서 함께 지운다**. `tripStorage.TRIP_DATA_KEYS` 하나를 `clearAccountCache` 에 넘기는 것이 전부라, 판을 올려도 지우는 자리를 또 고치지 않는다. 「이 기기 데이터 모두 삭제」(`clearDeviceStorage`)는 `daymo.` 로 시작하는 것을 모두 걷어 내므로 셋 다 사라진다.

## 실행

```bash
cd mobile
npm ci
npm run ios          # expo run:ios
npm run android      # expo run:android
npm run web          # expo start --web
npm start            # expo start
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint
npm test             # node --test
```

타입 검사·lint·테스트 세 가지는 main 푸시와 모든 pull request에서 GitHub Actions가 그대로 돌린다(`.github/workflows/ci.yml`). 테스트는 지출과 정산 셈, 시각 입력, 공간과 멤버, 파일 이름, 네이버 장소 조회와 카카오맵 공유 읽기를 덮는다.

`npm run web`은 그냥 미리보기가 아니라 **화면 폭에 따라 다르게 그린다.** PC 브라우저(폭 700px 이상, 마우스)에서는 390×844 휴대폰 프레임 안에 상단 노치와 홈 바까지 그려 실제 기기처럼 보여주고, 휴대폰 브라우저나 좁은 창에서는 프레임 없이 꽉 채운다. 작은 화면 안에 또 작은 화면을 만들지 않기 위해서다.

앱 아이콘을 다시 만들려면 Pillow가 필요하다.

```bash
cd mobile
python scripts/build-icons.py
```

## 디자인

여행 수첩·종이·테이프의 질감을 쓰되 정보 구조를 돕는 선에서만 쓴다. 의미 없는 아이콘과 장식용 일러스트는 넣지 않는다. 자세한 기준은 [`docs/product-rules/01-daymo-development-rules.md`](../product-rules/01-daymo-development-rules.md) 4~5장에 있다.

**서체.** 제목과 수치는 쿠키런 Bold, 본문과 라벨은 쿠키런 Regular다. 원래는 `fontFamily`를 한 번도 지정하지 않아 한글이 OS 기본 폰트로 떨어졌고 iOS·안드로이드·웹이 서로 다르게 보였다. 쿠키런 라이선스가 임의 수정과 개작을 금지하므로 서브셋을 만들지 않고 공식 배포 TTF를 바이트 그대로 싣는다. 저작권 안내와 전문 링크는 앱 안 `우리 > 오픈소스 라이선스`에 있다.

**테마 일곱 가지.** `Daymo`(만년필 잉크) · 로즈베리 · 소프트 퍼플 · 클리어 스카이 · 그린 가든 · 세이지 피크닉 · 빈티지 노트. 각각 라이트와 다크를 모두 갖고, 화면 모드는 시스템 설정을 따르거나 직접 고를 수 있다.

**색은 눈대중이 아니라 계산해서 맞췄다.** 기준색에서는 색상각만 가져오고 밝기와 채도는 다시 계산한다. 각 강조색은 자기 모드의 배경·표면·보조 표면·soft 칩 네 가지 배경 모두에서 WCAG AA 4.5:1을 넘긴다. 보조 문구 색도 세 배경 전부에서 AA를 넘겨야 해서 한 번 갈아엎었다(이전 값 `#747D8D`는 3.57:1이었다). 장소·숙소·준비·요리·기록의 도메인 색도 명도와 채도를 역할별로 통일했다 — 요리의 주황은 흰 배경에서 AA를 통과시키느라 갈색에 가까워졌고, 이건 의도한 절충이다. 여행마다 갖는 고유 색은 배경으로 쓰는 `fill`과 글자로 쓰는 `ink`를 나눠 저장한다. 중간 밝기 하나로는 양쪽 대비를 낼 수 없기 때문이다.

토큰은 [`mobile/src/theme/`](../../mobile/src/theme/)에 있다. 근거와 계산 과정은 파일 주석에 남겨 뒀다.

## 네이버 장소 정보 자동 입력

장소 추가에서 네이버 지도 공유 링크를 붙여넣으면 앱이 장소명과 주소를 자동으로 채운다. 카카오맵 공유 문구도 같은 버튼으로 받지만 기기에서 읽을 수 있는 만큼만 채운다(`mobile/src/kakaoPlaceShare.ts`). 공유 문구에 정보가 들어 있으면 기기에서 바로 읽고, 짧은 링크만 있으면 `EXPO_PUBLIC_DAYMO_PLACE_RESOLVER_URL`의 서버 함수가 링크를 확인한다. Vercel로 `mobile`을 배포하면 함수 주소는 `https://<도메인>/api/naver-place`다.

정확한 도로명 주소와 장소 종류까지 받으려면 Vercel 프로젝트의 서버 환경변수에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`을 설정하고 네이버 개발자 센터에서 검색 API 권한을 켠다. 이 값은 `EXPO_PUBLIC_` 접두사를 붙이거나 앱 `.env`에 넣지 않는다.

## 아직 안 된 것

- **알림이 없다.** 앱에 알림 코드가 없어서, state만 뒤집던 가짜 알림 토글은 지웠다. 다른 사람이 고친 내용은 여행을 다시 열 때 서버에서 받아 온다.
- **Apple 로그인이 없다.** Apple Developer 가입 뒤에 켠다. 버튼 로고는 Apple 배포 파일에서 가져왔는데, 그 파일의 사용 조건과 디자인 가이드가 서로 달라 출시 전에 확인하거나 iOS 시스템 버튼으로 바꿔야 한다(`mobile/assets/social/README.md`). 카카오는 비즈 앱 심사가 끝나야 이메일 동의를 받을 수 있다.
- **audit log는 쌓기만 한다.** 메모·사진 삭제와 복원, 멤버 변경, 초대 폐기 같은 행동은 `audit_logs`에 남지만 조회 화면과 보유기간 파기가 없다. 지운 메모도 휴지통 기한(7일)이 지나면 목록에서만 빠지고 행은 남는다.
- **이메일을 바꿔도 열려 있는 앱에는 바로 보이지 않는다.** 새 주소의 링크를 누르면 서버에서는 바뀌지만, 앱은 다음에 세션을 되살릴 때 새 주소를 받는다.
- **지도에서 섬을 누르면 지역이 어림으로 골라진다.** 본토와 이름표가 든 조각은 누른 자리를 품은 시도 다각형으로 정확히 고른다(서울·인천을 둘러싼 경기, 광주를 감싼 전남도 맞다). 하지만 지도 경로에 시도 이름이 없어 이름표가 들어 있지 않은 섬 조각은 어느 시도인지 모르고, 그런 자리는 **가장 가까운 중심점**의 시도를 고른다. 그래서 거제도처럼 다른 시의 중심점이 더 가까운 섬은 틀리게 골라지고, 울릉도처럼 모든 중심점에서 먼 섬은 눌러도 반응이 없다(`mobile/src/koreaHitTest.ts`).
- **카카오맵은 공유 문구에 있는 만큼만 채운다.** 네이버 지도와 카카오맵 링크를 모두 붙이고 열 수 있지만, 짧은 링크만 붙여넣었을 때 서버에서 장소 이름과 주소를 찾아 주는 조회는 네이버에만 있다. 카카오맵 짧은 링크(`kko.kakao.com`)만 있으면 이름과 주소는 직접 적어야 한다.
- **정산은 앱 밖에서 끝난다.** 「보냈어요」는 보냈다고 적어 두는 기록일 뿐이고, 앱은 계좌이체를 알지도 일으키지도 못한다.
- **스토어에 아직 올리지 않았다.** 제출 자료는 `release/`에 있고, 스크린샷은 실제 기기 빌드로 찍어야 한다.

## 관련 문서

| | |
| --- | --- |
| [`docs/01-requirements.md`](../01-requirements.md) | 요구사항 원문. 왜 만드는지, 무엇이 불편했는지 |
| [`docs/02-raw-travel-data.md`](../02-raw-travel-data.md) | 실제 사용 예시. 데이터 구조를 검증하는 기준 |
| [`docs/03-implementation-plan.md`](../03-implementation-plan.md) | 구현 계획 요약. 현재 상태, 목표, 개발 순서 |
| [`docs/development/`](./) | 개발 기준 문서. 환경, 데이터 모델, API 명세, 로드맵, 품질, VPS 운영, 로컬 우선 동기화, 개인정보·출시, UI 추적표, 착수 준비, 소유자 안내 |
| [`docs/product-rules/`](../product-rules/README.md) | 제품 규칙. 탭별 규칙과 재사용 가능한 앱 개발 규칙 |
