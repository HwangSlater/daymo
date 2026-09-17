// daymo.xyz 정적 사이트를 site/dist 에 만든다. 사용법은 site/README.md.

import { execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(HERE, "src");
const DIST = join(HERE, "dist");
const preview = process.argv.includes("--preview");
const withoutApp = process.argv.includes("--no-app");

const localPath = join(HERE, "site.local.json");
let operatorName = "";
if (existsSync(localPath)) {
  operatorName = String(JSON.parse(readFileSync(localPath, "utf8")).operatorName ?? "").trim();
}
if (!operatorName) {
  if (!preview) {
    console.error("site/site.local.json 에 operatorName 이 없다. 배포용은 운영자 이름이 필요하다(site/README.md).");
    process.exit(1);
  }
  operatorName = "(배포할 때 채워지는 운영자 이름)";
}

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "images"), { recursive: true });

for (const name of readdirSync(SRC)) {
  if (name.endsWith(".html")) {
    const html = readFileSync(join(SRC, name), "utf8").replaceAll("{{OPERATOR_NAME}}", escapeHtml(operatorName));
    if (html.includes("{{")) throw new Error(`${name}: 채우지 않은 자리표시가 있다`);
    writeFileSync(join(DIST, name), html);
  } else {
    cpSync(join(SRC, name), join(DIST, name), { recursive: true });
  }
}

// 앱과 같은 그림을 쓴다. 따로 두면 아이콘을 바꿀 때 사이트만 옛 모습으로 남는다.
copyFileSync(join(ROOT, "mobile/assets/daymo-icon.png"), join(DIST, "images/daymo-icon.png"));
copyFileSync(join(ROOT, "mobile/assets/daymo-favicon.png"), join(DIST, "favicon.png"));
for (const shot of ["trip-overview", "trip-packing", "trip-expenses", "trip-memories"]) {
  copyFileSync(join(ROOT, `docs/screenshots/${shot}.png`), join(DIST, `images/${shot}.png`));
}

// 웹 버전 앱을 /app 아래에 넣는다. 사이트를 올리면 배포가 통째로 바뀌므로 매번 같이 만든다.
//
// 예전에는 늘 `--clear` 로 캐시를 통째로 비웠다. 로컬 API 주소로 만든 번들이 캐시에서
// 그대로 나올 수 있어서인데, 그 한 줄 때문에 고친 데가 한 줄이어도 3분을 기다렸다.
// 이제는 캐시를 두고 만든 뒤 **결과물에 로컬 주소가 섞였는지 본다**. 섞였으면 그때만
// 비우고 다시 만든다. 대개는 캐시가 맞아 30초 안에 끝난다.
function 웹앱을_만든다(캐시를_비움) {
  execSync(`npx expo export -p web ${캐시를_비움 ? "--clear " : ""}--output-dir "${join(DIST, "app")}"`, {
    cwd: join(ROOT, "mobile"),
    stdio: "inherit",
    env: { ...process.env, DAYMO_WEB_BASE_URL: "/app", EXPO_PUBLIC_DAYMO_API_URL: "https://api.daymo.xyz" },
  });
}

/** 번들에 로컬 API 주소가 들어갔는지. 들어갔으면 캐시가 옛것이다. */
function 로컬_주소가_섞였나() {
  const 자리 = join(DIST, "app", "_expo", "static", "js", "web");
  for (const 이름 of readdirSync(자리)) {
    if (!이름.endsWith(".js")) continue;
    const 글 = readFileSync(join(자리, 이름), "utf8");
    if (/127\.0\.0\.1:\d+|http:\/\/localhost:\d+/.test(글)) return true;
  }
  return false;
}

if (!withoutApp) {
  웹앱을_만든다(false);
  if (로컬_주소가_섞였나()) {
    console.log("캐시에 로컬 API 주소가 남아 있다. 비우고 다시 만든다.");
    웹앱을_만든다(true);
  }
}

writeFileSync(
  join(DIST, "vercel.json"),
  JSON.stringify(
    {
      cleanUrls: true,
      // 로그인 팝업도 앱 번들을 열되 주소는 /oauth 로 둔다. cleanUrls 가 /app/index.html 을
      // /app 으로 되돌리므로 목적지는 /app 이어야 한다.
      rewrites: [{ source: "/oauth", destination: "/app" }],
      headers: [
        {
          // 새로 배포하면 바로 새 번들을 받게 한다. 번들 파일은 이름에 해시가 붙어 오래 둬도 된다.
          source: "/app",
          headers: [{ key: "Cache-Control", value: "no-cache" }],
        },
        {
          source: "/app/_expo/(.*)",
          headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
        },
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "X-Frame-Options", value: "DENY" },
          ],
        },
      ],
    },
    null,
    2,
  ),
);
if (existsSync(join(HERE, ".vercel"))) cpSync(join(HERE, ".vercel"), join(DIST, ".vercel"), { recursive: true });

console.log(preview ? "미리 보기용으로 만들었다(배포하지 않는다): site/dist" : "만들었다: site/dist");
