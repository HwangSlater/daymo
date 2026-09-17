/**
 * 문구 사전 검사.
 *
 * `docs/development/13-copy-glossary.md` 의 「쓰지 않는 말」이 사용자에게 보이는
 * 문자열에 다시 들어오면 여기서 걸린다. 주석과 변수 이름은 보지 않고, 따옴표 안의
 * 글자와 JSX 태그 사이의 글자만 본다. 새 금지어는 사전에 먼저 적고 아래 표에 더한다.
 *
 * 예외가 꼭 필요하면 그 줄에 `문구-사전-예외: 까닭` 주석을 적는다.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** 금지 패턴과, 대신 쓸 말. 한글은 `\b` 가 안 먹어서 앞뒤 글자를 직접 본다. */
const 금지: [RegExp, string][] = [
  [/기념\s?카드/, "추억 카드"],
  [/· ?필수/, "필수 표시 없음"],
  [/· ?선택 사항|· ?선택(?![가-힣])/, "(선택)"],
  [/을\(를\)|이\(가\)|\(으\)로|은\(는\)/, "josa() 또는 조사 없는 문장"],
  [/변경 저장/, "저장"],
  [/보여 ?드리고/, "보여 줘요"],
  [/[가-힣]되었/, "됐"],
  [/단추/, "버튼"],
  [/(^|[^가-힣])해지(?![가-힣])/, "로그아웃"],
  [/동기화/, "구현 용어는 사용자 문구에 쓰지 않는다"],
  [/서버에|서버가|서버 요청/, "인터넷 연결 / 요청"],
  [/지울까요|지웠어요|지우는 중|지워요(?![가-힣])/, "삭제"],
  [/홈 화면에|홈에 쓰/, "대표 사진"],
  [/이용자/, "타는 사람 / 멤버"],
  [/보기만 할/, "보기 전용 (「보기만」 권한 값 자체는 저장값이라 둔다)"],
  [/말없이/, "자동으로"],
  [/프로토타입/, "버전만"],
  [/\d+개의 /, "「여행 N개」처럼 수를 뒤에"],
  [/(적어|남겨|만들어|골라|넣어|묶어|해)보세요/, "보조용언은 띄어 쓴다 (적어 보세요)"],
];

const 여기 = dirname(fileURLToPath(import.meta.url));

function* 파일들(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules") continue;
      yield* 파일들(path);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      yield path;
    }
  }
}

/** 주석을 지운다. 줄 수는 그대로 두어야 줄 번호가 맞는다. 문자열 안의 `//`(주소)는 남긴다. */
function 주석_빼기(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (_, 앞) => 앞);
}

/** 사용자에게 보일 수 있는 글자: 따옴표 안, 백틱 안, JSX 태그 사이. 자리(index)도 같이 준다. */
function 보이는_글자(src: string): { 글: string; 자리: number }[] {
  const 조각: { 글: string; 자리: number }[] = [];
  const 따옴표 = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  for (const m of src.matchAll(따옴표)) 조각.push({ 글: m[0], 자리: m.index });
  const 태그사이 = />([^<>{}]*[가-힣][^<>{}]*)</g;
  for (const m of src.matchAll(태그사이)) {
    // `a => b<T>` 같은 코드 조각이 태그 사이처럼 잡힌다. 문장에는 없는 글자로 거른다.
    if (/[=;(){}]/.test(m[1])) continue;
    조각.push({ 글: m[1], 자리: m.index + 1 });
  }
  return 조각.filter(({ 글 }) => /[가-힣]/.test(글));
}

test("사용자 문구에 사전의 「쓰지 않는 말」이 없다", () => {
  const 걸림: string[] = [];
  for (const path of 파일들(여기)) {
    const 원문 = readFileSync(path, "utf8");
    const 본문 = 주석_빼기(원문);
    const 예외줄 = new Set<number>();
    원문.split("\n").forEach((줄: string, i: number) => {
      if (줄.includes("문구-사전-예외")) 예외줄.add(i + 1);
    });
    for (const { 글, 자리 } of 보이는_글자(본문)) {
      const 줄 = 본문.slice(0, 자리).split("\n").length;
      if (예외줄.has(줄)) continue;
      for (const [패턴, 대신] of 금지) {
        if (패턴.test(글)) {
          걸림.push(`${relative(여기, path)}:${줄} ${글.replace(/\s+/g, " ").trim().slice(0, 70)}  → ${대신}`);
        }
      }
    }
  }
  assert.deepEqual(걸림, [], `문구 사전(docs/development/13-copy-glossary.md)에 어긋나는 문구:\n${걸림.join("\n")}`);
});
