# 소셜 로그인 버튼 에셋 출처

로그인 화면의 카카오·네이버·Google·Apple 버튼(`mobile/src/SocialLoginButton.tsx`)에 쓰는
심볼의 출처와 사용 조건이다. 모두 2026-09-15에 각 사 공식 배포처에서 받았다.
심볼은 다시 그리거나 색을 바꾸지 않았다. 벡터로 된 원본은 좌표를 그대로 옮겨
react-native-svg 로 그리고, 벡터를 쓸 수 없는 Google G 만 원본 PNG 를 싣는다.

| 파일 | 앱에서 쓰는가 | 비고 |
| --- | --- | --- |
| `g-logo.png` | 예 | Google G 로고 원본 그대로 (200x204, sha256 `d1ce9c2a…8638e6a`) |
| `Logo - SIWA - Left-aligned - Black - Medium.svg` | 경로만 코드에 옮김 | Apple 원본 파일 그대로 |
| `Logo - SIWA - Left-aligned - White - Medium.svg` | 경로만 코드에 옮김 | Apple 원본 파일 그대로 |
| `kakao_login_medium_wide.png` | 아니오 | 카카오 표준 버튼 이미지. 모양 대조용 |
| `NAVER_login_Light_KR_green_wide_H48.png` | 아니오 | 네이버 표준 버튼 이미지. 모양 대조용 |

## 카카오

- 가이드: https://developers.kakao.com/docs/ko/kakaologin/design-guide
- 리소스 페이지: https://developers.kakao.com/tool/resource/login (디자인 리소스 다운로드 > 카카오 로그인)
- 받은 파일
  - `https://developers.kakao.com/tool/resource/static/img/button/login/kakao_login_original.psd`
    (sha256 `9a0f9287…bff449ab4`, 용량이 커서 저장소에는 넣지 않았다)
  - `https://developers.kakao.com/tool/resource/static/img/button/login/full/ko/kakao_login_medium_wide.png`
- 옮긴 방법: PSD 의 `국문 > Large and Narrow (600px X 90px) > Shape 2` 레이어 벡터 마스크(말풍선,
  채움 #000000)를 psd-tools 로 읽어 원점만 (0,0)으로 옮긴 SVG 경로로 적었다. 곡선 외곽은 36 x 33.7652.
- 규칙: 컨테이너 #FEE500, 심볼 #000000, 레이블 #000000 85%, radius 12px. 심볼의 형태·비율·색 변경 금지,
  심볼 없는 버튼 금지, 레이블은 "카카오 로그인"(축약 "로그인"), OS 기본 서체.
- 사용 조건: 카카오 로그인을 제공하는 서비스가 디자인 가이드에 따라 쓰는 용도로 배포된다.

## 네이버

- 가이드: https://developers.naver.com/docs/login/bi/bi.md (네이버 로그인 버튼 사용 가이드)
- 받은 파일
  - `https://developers.naver.com/inc/devcenter/downloads/bi/NAVER_login_KR.ai` (sha256 `6c443914…bea831`, 저장소에 넣지 않음)
  - `https://developers.naver.com/inc/devcenter/downloads/bi/NAVER_login_KR.zip` 중
    `NAVER_login_KR/NAVER_login_Light_KR_green_wide_H48.png` (zip sha256 `e589e3c1…4471c`)
- 옮긴 방법: .ai 는 PDF 호환 파일이다. PyMuPDF 로 1쪽의 20x20 흰색 N 로고 다각형 꼭짓점 10개를
  그대로 적었다.
- 규칙: 권장 배경 #03A94D, 로고·레이블 #FFFFFF(흰 배경일 때는 #FFFFFF / #03A94D / #000000).
  지정 컬러 변경 불가. N 로고 형태 변경·다른 요소와 조합 금지, 완성형 16px 이상.
  가운데 정렬 시 로고-레이블 간격 8px, 좌측 정렬 시 로고 여백 20px. 레이블은 목적에 맞으면 수정 가능.
  표준 에셋은 높이 48/56, 모서리 8.
- 참고: 예전 가이드와 코드에 있던 #03C75A 는 지금 배포 중인 가이드·에셋의 색(#03A94D)과 다르다.
- 사용 조건: 네이버 로그인 API 이용 서비스가 가이드에 따라 쓰는 용도. 가이드를 벗어난 변경은 지양.

## Google

- 가이드: https://developers.google.com/identity/branding-guidelines (Last updated 2026-07-07)
- 받은 파일
  - `https://developers.google.com/static/identity/images/g-logo.png` — 가이드 본문의 "Google G icon" 이미지.
  - `https://developers.google.com/static/identity/images/signin-assets.zip` (sha256 `ba884069…c1da1`, 저장소에 넣지 않음)
- PNG 를 쓰는 이유: zip 안의 SVG 는 G 를 `foreignObject` + CSS `conic-gradient` + 블러 필터로 그린다.
  react-native-svg 는 이걸 그리지 못한다. 가이드는 "직접 크기를 정해야 하면 내려받은 로고에서
  시작하라"고 하므로 원본 PNG 를 비율 그대로(20px 높이) 줄여 쓴다.
- 규칙: Light #FFFFFF 채움 / #747775 1px 안쪽 테두리 / #1F1F1F 글자, Dark #131314 / #8E918F / #E3E3E3.
  G 는 표준 컬러(그라데이션)만, 크기·색 변경 금지, 단색 G 금지, 직접 만든 아이콘 금지.
  글꼴 Google Sans Medium 14/20, 패딩 12(로고 앞)/10(로고 뒤)/12(문구 뒤, iOS 16/12/16).
  문구 현지화 권장. 다른 소셜 버튼과 같은 크기·비중.
- 사용 조건: 가이드를 따라야 앱 인증(OAuth 앱 검수)을 통과한다. 가이드가 다루지 않는 방식으로
  Google 브랜드를 쓰려면 사전 서면 동의가 필요하다(Guidelines for Third Party Use of Google Brand Features).

## Apple

- 가이드: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
- 받은 파일: `https://devimages-cdn.apple.com/design/resources/download/Logo-Sign-in-with-Apple.dmg`
  (Apple Design Resources > Sign in with Apple, sha256 `99fba5c8…699af6`). dmg 안
  `Sign in with Apple - Left Aligned/SVG/` 의 Medium 두 파일을 이름 그대로 복사했다.
- 옮긴 방법: SVG 의 `path` 를 그대로 코드에 적었다. 31x44 viewBox(여백 포함)를 유지하고 높이를 버튼
  높이에 맞춘다. SVG 안의 배경 `rect` 는 버튼 배경과 같은 색이라 그리지 않는다.
- 규칙: 밝은 배경에 검정, 어두운 배경에 흰색 버튼. 로고와 문구는 검정 또는 흰색 한 가지.
  문구는 Sign in with / Sign up with / Continue with Apple 의 현지화만 쓴다("Apple로 로그인").
  로고 파일 높이 = 버튼 높이, 자르기·세로 여백 추가 금지. 문구 크기는 버튼 높이의 43%.
  최소 140x30pt, 버튼 주변 여백 높이의 1/10, 문구 오른쪽 여백 폭의 8% 이상. App Review 가 직접 본다.
- 사용 조건: dmg 에 든 "Apple Design Resources License" 는 일반 조항으로 목업 용도만 허락하고
  소프트웨어에 포함하는 것을 막는다. 반면 HIG 는 이 로고 파일로 iOS·macOS·웹의 사용자 지정
  Sign in with Apple 버튼을 만들라고 안내한다. 둘이 어긋나므로 출시 전에 확인이 필요하다
  (docs/development/08-privacy-and-release-compliance.md 12.1).
