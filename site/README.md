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
npx vercel deploy --prod --cwd site/dist
```

`build.mjs`는 앱의 웹 버전도 `dist/app`에 함께 만든다(`www.daymo.xyz/app`). iPhone 앱이 나오기 전에 휴대폰 브라우저로
쓰는 곳이다. 이메일 로그인만 되고 소셜 로그인 버튼은 나오지 않는다(앱으로 돌아오는 주소가 `daymo://` 라서). API 서버의
`CORS_ORIGINS`(기본 `https://www.daymo.xyz,https://daymo.xyz`)에 이 주소가 있어야 브라우저가 API를 부를 수 있다.
사이트 글만 고쳐 볼 때는 `node site/build.mjs --preview --no-app` 으로 앱 빌드를 건너뛴다.

`build.mjs`가 `site/.vercel`을 `dist`에 복사하고 `vercel.json`(`cleanUrls`)을 넣는다. 그래서 `/privacy`처럼 `.html` 없이 열린다.

## 고칠 때

처리방침은 실제 시스템과 달라지면 안 된다. 수집 항목, 위탁 업체, 보관 기간을 바꾸는 코드나 인프라 변경이 있으면
`src/privacy.html`을 함께 고치고 시행일과 변경 이력을 올린다. 공개 출시 전에 전문가 검토를 받는다.
