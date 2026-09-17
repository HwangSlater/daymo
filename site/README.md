# daymo.xyz 소개 사이트

앱 소개, 개인정보 처리방침, 이용약관, 계정 삭제 안내를 담은 정적 페이지다. 카카오 비즈 앱 심사의 서비스 URL,
Google OAuth 동의 화면의 홈페이지·처리방침·약관 URL, App Store·Google Play의 처리방침·지원·계정 삭제 URL로 쓴다.

## 운영자 이름은 커밋하지 않는다

처리방침과 약관에는 운영자의 법적 이름이 들어가야 한다(docs/development/08-privacy-and-release-compliance.md).
공개 저장소에는 넣지 않기로 해서, 원본(`src/`)에는 `{{OPERATOR_NAME}}` 자리표시만 두고 빌드할 때 채운다.

```sh
# 한 번만. 이 파일은 .gitignore 에 있다.
echo '{ "operatorName": "실제 이름" }' > site/site.local.json

node site/build.mjs            # site/dist 에 만든다. site.local.json 이 없으면 멈춘다.
node site/build.mjs --preview  # 이름 없이 미리 보기용으로 만든다(배포하지 않는다)
```

## 배포

Vercel 프로젝트 `daymo-site`에 `site/dist`를 그대로 올린다. `www.daymo.xyz`가 이 프로젝트에 붙어 있고,
`daymo.xyz`는 `www`로 308 넘어간다. 저장소 push로는 배포되지 않는다. 예전 웹 앱 빌드가 있던 `daymo` 프로젝트는
2026-09-15에 도메인만 떼어 두었다.

```sh
npx vercel link --yes --project daymo-site --cwd site   # 한 번만. site/.vercel 은 커밋하지 않는다
node site/build.mjs
cd site/dist && npx vercel deploy --prod --yes
```

`--prod` 로 올려도 도메인 별칭은 자동으로 옮겨지지 않는다. 올린 뒤 직접 옮기고 번들 해시로 확인한다.

```sh
npx vercel alias set <새 배포 주소> www.daymo.xyz
npx vercel alias set <새 배포 주소> daymo.xyz
curl -s https://www.daymo.xyz/app/ | grep -o 'AppEntry-[a-f0-9]*\.js'   # site/dist 의 것과 같아야 한다
```

미리보기용 Vercel 프로젝트는 따로 두지 않는다. 소셜 심사가 끝난 2026-09-17에 `daymo-preview` 를 없애고
서버 허용 목록(`CORS_ORIGINS`, `OAUTH_APP_REDIRECT_URIS`)에서도 뺐다. 작업 중인 화면은 Expo Go(터널)로 본다.

`build.mjs`는 앱의 웹 버전도 `dist/app`에 함께 만든다(`www.daymo.xyz/app`). iPhone 앱이 나오기 전에 휴대폰 브라우저로
쓰는 곳이다. 이메일과 서버에서 활성화한 Google·카카오·네이버·Apple 소셜 로그인을 지원한다. 소셜 로그인은 팝업으로
열고 `/oauth`로 돌아와 state·PKCE 확인 후 일회용 코드를 세션으로 교환한다. API 서버의
`CORS_ORIGINS`(기본 `https://www.daymo.xyz,https://daymo.xyz`)에 이 주소가 있어야 브라우저가 API를 부를 수 있다.
사이트 글만 고쳐 볼 때는 `node site/build.mjs --preview --no-app` 으로 앱 빌드를 건너뛴다.

서버 `OAUTH_APP_REDIRECT_URIS`에는 `https://www.daymo.xyz/oauth`와 `https://daymo.xyz/oauth`를
등록한다. 로컬 웹 테스트에는 `http://localhost:8081/oauth`를 별도로 추가한다. 미리보기 도메인은 자동 허용하지 않는다.
팝업이 차단된 경우에는 팝업 허용 안내를 보여 준다. 로그인 취소 시 원래 화면을 유지한다.

`build.mjs`가 `site/.vercel`을 `dist`에 복사하고 `vercel.json`(`cleanUrls`)을 넣는다. 그래서 `/privacy`처럼 `.html` 없이 열린다.

## 고칠 때

처리방침은 실제 시스템과 달라지면 안 된다. 수집 항목, 위탁 업체, 보관 기간을 바꾸는 코드나 인프라 변경이 있으면
`src/privacy.html`을 함께 고치고 시행일과 변경 이력을 올린다. 공개 출시 전에 전문가 검토를 받는다.
