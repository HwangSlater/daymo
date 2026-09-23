/**
 * 준비물 이름을 견주는 규칙.
 *
 * 둘이 따로 적다 보면 같은 것을 두 번 챙긴다(요구사항 4번). 그래서 이름만 보고
 * 비슷한 것을 찾아 알려 준다. 막지는 않는다 — "충전기"가 둘 다 필요할 때도 있다.
 *
 * 비슷함의 기준은 세 가지만 둔다. 넓게 잡으면 안내가 자주 떠 무뎌진다.
 * 1. 띄어쓰기와 문장부호를 지운다("보조 배터리" = "보조배터리" = "보조·배터리")
 * 2. 대소문자와 전각을 맞춘다(NFKC, 소문자)
 * 3. 수량과 단위 토막을 뺀다("생수 2L" = "생수", "물티슈 3개" = "물티슈")
 * 그 밖의 말은 그대로 남긴다. "충전기 C타입"과 "충전기"는 다른 것으로 본다.
 *
 * 담당은 보지 않는다. 담당이 다른데 같은 것을 챙기는 게 바로 막고 싶은 일이다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 수량 뒤에 붙는 단위. 앞의 숫자와 붙어 있을 때만 뺀다. */
const UNIT = "개|장|통|팩|병|캔|줄|봉|봉지|박스|상자|세트|쌍|켤레|벌|매|마리|인분|컵|스푼|큰술|작은술|g|kg|mg|ml|l|cc|oz|lb|m|cm|mm";
const QUANTITY = new RegExp(`^(?:x)?\\d+(?:[.]\\d+)?(?:${UNIT})?$`);

/** 낱말을 가르는 자리. 한글·영문·숫자가 아니면 모두 사이 띄움으로 본다. */
const SEPARATOR = /[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/;

/** 견줄 때 쓰는 열쇠. 같으면 같은 준비물로 본다. */
export function packingKey(raw: string): string {
  const parts = raw.normalize("NFKC").toLowerCase().split(SEPARATOR).filter(Boolean);
  const words = parts.filter((part) => !QUANTITY.test(part));
  // 수량만 적었으면(예: "2개") 뺄 것이 없으니 적은 그대로 견준다.
  return (words.length ? words : parts).join("");
}

/**
 * 이름 여럿의 견줌 열쇠를 한 묶음으로 만든다.
 *
 * 빈 열쇠는 담지 않는다. 담으면 이름이 빈 줄끼리 서로 「비슷하다」로 걸린다.
 */
export function packingKeySet(names: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const name of names) {
    const key = packingKey(name);
    if (key) keys.add(key);
  }
  return keys;
}

/** 열쇠 묶음 안에 비슷한 이름이 있는지. */
export function hasSimilarPacking(name: string, keys: ReadonlySet<string>): boolean {
  const key = packingKey(name);
  return Boolean(key) && keys.has(key);
}

/**
 * 재료마다 「이미 비슷한 준비물이 있는지」를 한 번에 센다(2026-09-23 검토 #60).
 *
 * 재료 불러오기 시트는 줄을 그릴 때마다 준비물 전체를 훑었다. 재료 500개 × 준비물
 * 300개면 체크 하나 누를 때마다 15만 번이다. 재료와 준비물이 그대로인 동안은 이 지도를
 * 다시 만들지 않고, 줄은 자기 id 로 답만 꺼내 본다.
 *
 * 답은 줄마다 세던 것과 같다 — 견줌 열쇠가 같은 준비물이 하나라도 있으면 참이다.
 */
export function markPackedIngredients(
  recipes: readonly { ingredients: readonly { id: string; name: string }[] }[],
  packedKeys: ReadonlySet<string>,
): Map<string, boolean> {
  const marks = new Map<string, boolean>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      marks.set(ingredient.id, hasSimilarPacking(ingredient.name, packedKeys));
    }
  }
  return marks;
}

/** 한 번에 여러 줄을 적었을 때 같은 것을 하나로 줄인다. */
export function dedupePackingNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const name of names) {
    const key = packingKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(name);
  }
  return kept;
}

type PackingLike = { id: string; name: string; owner: string };

/** 적으려는 이름 하나와, 목록에서 그와 비슷한 줄들. */
type SimilarPacking<T extends PackingLike> = { name: string; matches: T[] };

/**
 * 적으려는 이름마다 이미 있는 비슷한 준비물을 찾는다.
 *
 * `exceptId` 는 고치는 중인 줄이다. 자기 자신과 겹친다고 알리면 안 된다.
 */
export function findSimilarPacking<T extends PackingLike>(
  names: readonly string[],
  items: readonly T[],
  exceptId?: string,
): SimilarPacking<T>[] {
  const hits: SimilarPacking<T>[] = [];
  for (const name of names) {
    const key = packingKey(name);
    if (!key) continue;
    const matches = items.filter((item) => item.id !== exceptId && packingKey(item.name) === key);
    if (matches.length) hits.push({ name, matches });
  }
  return hits;
}

/** 안내창 제목. 막는 말이 아니라 묻는 말로 둔다. */
export const DUPLICATE_TITLE = "이미 있어요. 그래도 추가할까요?";

/**
 * 안내창 본문. 이미 있는 줄을 담당과 함께 보여 준다.
 *
 * 적은 이름과 있는 이름이 다르면(띄어쓰기·수량 차이) 둘 다 보여 준다. 그래야
 * 왜 같은 것으로 봤는지 알 수 있다.
 */
export function duplicateLines<T extends PackingLike>(hits: readonly SimilarPacking<T>[]): string[] {
  return hits.flatMap((hit) =>
    hit.matches.map((match) =>
      match.name.trim() === hit.name.trim()
        ? `${match.name} · ${match.owner}`
        : `${hit.name} → ${match.name} · ${match.owner}`,
    ),
  );
}

/**
 * 요리 재료에서 가져온 준비물 줄에 옅게 붙일 말.
 *
 * 이름이 그대로면 요리 이름만 보여 준다. 재료 이름을 바꾸거나 준비물 이름을
 * 고쳐 서로 달라졌으면 재료 이름도 함께 보여 준다.
 */
export function ingredientOriginLabel(recipeName: string, ingredientName: string, packingName: string): string {
  const same = packingKey(ingredientName) === packingKey(packingName);
  return same ? `${recipeName} 재료` : `${recipeName} · ${ingredientName}`;
}
