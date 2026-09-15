// daymo.xyz 정적 사이트를 site/dist 에 만든다. 사용법은 site/README.md.

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(HERE, "src");
const DIST = join(HERE, "dist");
const preview = process.argv.includes("--preview");

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

writeFileSync(
  join(DIST, "vercel.json"),
  JSON.stringify(
    {
      cleanUrls: true,
      headers: [
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
