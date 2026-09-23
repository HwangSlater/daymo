/**
 * 꾸미는 중인 추억 카드(초안)의 목록 계산.
 *
 * 카드 만들기는 사진 몇 장을 꾸며 **새 사진 한 장을 만드는 일**이다(2026-09-23). 꾸미는
 * 동안의 카드는 기기에만 있고 서버에 보내지 않는다. 「완료」하면 그린 그림이 여행 기록의
 * 보통 사진이 되고 초안은 지운다. 그래서 여기 있는 것은 여행마다 초안 몇 장을 어떻게
 * 들고 있을지뿐이다.
 *
 * 저장 형식은 서버가 쓰던 것과 같은 `settings`(`SavedKeepsake`)다. 읽을 때 `keepsakeCardOf`
 * 를 거치므로 모르는 값·지운 사진이 있어도 카드 한 장은 나온다. 실제 읽고 쓰는 일은
 * `cardDraftStorage.ts` 가 한다(이 파일은 expo 나 react-native 를 가져오지 않는다.
 * `node --test` 로 바로 시험한다).
 */

import {
  keepsakeBodyOf,
  keepsakeCardOf,
  keepsakeStyleLabel,
  type KeepsakeCard,
  type SavedKeepsake,
} from "./tripCard.ts";

/** 기기에 적어 두는 초안 한 장. */
export type StoredCardDraft = {
  id: string;
  settings: SavedKeepsake;
  /** 만든 시각(ISO). 격자 차례와 「카드 N」 번호를 정한다. */
  createdAt: string;
  /**
   * 완료해 사진이 됐지만 아직 올라간 것을 확인하지 못한 사진 id(웹만).
   *
   * 웹은 고른 사진 파일이 브라우저 저장소에 남지 않아, 올라가기 전에 새로 고치면 그
   * 사진이 어디에도 없다. 완료하자마자 초안을 지우면 카드까지 함께 사라진다
   * (2026-09-23 검토 #8). 그래서 사진이 된 초안은 표시만 해 두고, 그 사진이 올라간 것을
   * 확인한 뒤에 지운다. 다시 꾸미면(`upsertDraft`) 표시는 떨어진다.
   */
  finishedPhotoId?: string;
};

/** 화면이 쓰는 초안 한 장. */
export type CardDraft = {
  id: string;
  card: KeepsakeCard;
  createdAt: string;
  /** 직접 적은 제목, 없으면 `카드 N`. 격자와 확인창에서 부르는 이름이다. */
  label: string;
  /** `네컷 · 사진 4장`. */
  meta: string;
};

/** 저장 형식의 판. 형식을 바꾸면 올린다. */
export const CARD_DRAFTS_VERSION = 1;

/** 여행마다 다른 저장 열쇠. */
export const cardDraftsKeyOf = (tripId: string) => `daymo.card-drafts.v${CARD_DRAFTS_VERSION}.${tripId}`;

/**
 * 「이 여행은 옛 앱이 두고 간 카드를 한 번 불러왔다」는 표시의 열쇠.
 *
 * 열쇠가 있으면 끝난 것이고 값은 보지 않는다(적어 둔 시각일 뿐이다). 그래서 다른 판이
 * 적어 둔 값을 읽어도 깨지지 않는다. 불러온 초안을 지운 사람에게 그 카드가 다시
 * 살아나면 안 되어 초안과 따로 둔다 — 초안을 다 지우면 초안 열쇠 자체가 없어진다.
 */
export const cardImportKeyOf = (tripId: string) => `daymo.card-drafts-imported.v${CARD_DRAFTS_VERSION}.${tripId}`;

/**
 * 이 열쇠가 카드 초안인지(불러오기 표시도 함께 본다).
 *
 * 계정이 바뀌거나 로그아웃할 때 초안을 한꺼번에 걷어 내는 데 쓴다. 남겨 두면 공유
 * 기기에서 앞사람이 꾸미던 카드가 뒷사람에게 보인다(2026-09-23). 판 번호는 보지
 * 않는다 — 형식이 올라가도 옛 판까지 함께 걷어 내야 남는 것이 없다.
 */
export const isCardDraftsKey = (key: string) => /^daymo\.card-drafts(-[a-z]+)?\.v\d+\./.test(key);

/**
 * 초안을 더하거나(같은 id 가 없으면) 바꾼다(있으면). 차례는 건드리지 않는다.
 *
 * 줄을 새로 만들므로 「사진이 됐다」 표시(`finishedPhotoId`)는 떨어진다. 다시 꾸민
 * 카드는 아직 사진이 되지 않은 보통 초안이다.
 */
export function upsertDraft(
  list: readonly StoredCardDraft[],
  draft: { id: string; card: KeepsakeCard; createdAt: string },
  tripName: string,
): StoredCardDraft[] {
  const 줄: StoredCardDraft = { id: draft.id, settings: keepsakeBodyOf(draft.card, tripName), createdAt: draft.createdAt };
  return list.some((하나) => 하나.id === draft.id)
    ? list.map((하나) => (하나.id === draft.id ? 줄 : 하나))
    : [...list, 줄];
}

export function removeDraft(list: readonly StoredCardDraft[], id: string): StoredCardDraft[] {
  return list.filter((하나) => 하나.id !== id);
}

/** 서버에 남아 있는 카드 한 장. 옛 앱(1.0.0)이 만들어 둔 것이다. */
export type ServerCardLike = {
  id: string;
  settings: unknown;
  /** 서버가 적어 둔 만든 시각(ISO). */
  createdAt?: string;
};

/**
 * 옛 앱(1.0.0)이 서버에 두고 간 카드를 초안으로 들인다(2026-09-23 검토 #5).
 *
 * 1.0.0 은 카드를 서버에 두었고 지금 앱은 초안을 기기에만 둔다. 저장 형식(`settings`)이
 * 같아 옮겨 담기만 하면 된다. 서버 카드 id 를 초안 id 로 그대로 써서, 두 번 불러도 같은
 * 카드가 둘이 되지 않는다. 이미 그 id 의 초안이 있으면 건드리지 않는다 — 기기에서 꾸민
 * 것이 최신이다.
 *
 * 모양이 틀린 줄은 버린다(`parseStoredDrafts` 와 같은 조건). 카드 값 자체는 가리지
 * 않는다 — 모르는 값은 `keepsakeCardOf` 가 읽으면서 기본으로 그리고 버리지 않는다.
 *
 * @param 기본_시각 서버가 만든 시각을 주지 않았을 때 쓸 ISO 시각.
 */
export function importedDrafts(
  list: readonly StoredCardDraft[],
  cards: readonly ServerCardLike[],
  기본_시각: string,
): { list: StoredCardDraft[]; added: StoredCardDraft[] } {
  const 있는_id = new Set(list.map((줄) => 줄.id));
  const 더할_것: StoredCardDraft[] = [];
  for (const 카드 of cards) {
    if (!카드 || typeof 카드.id !== "string" || !카드.id || 있는_id.has(카드.id)) continue;
    const settings = 카드.settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) continue;
    있는_id.add(카드.id);
    더할_것.push({
      id: 카드.id,
      settings: settings as SavedKeepsake,
      createdAt: typeof 카드.createdAt === "string" && 카드.createdAt ? 카드.createdAt : 기본_시각,
    });
  }
  return { list: [...list, ...더할_것], added: 더할_것 };
}

/** 이 초안이 사진 한 장이 됐다고 표시한다(웹. `StoredCardDraft.finishedPhotoId` 주석). */
export function markFinishedDraft(
  list: readonly StoredCardDraft[],
  id: string,
  finishedPhotoId: string,
): StoredCardDraft[] {
  return list.map((줄) => (줄.id === id ? { ...줄, finishedPhotoId } : 줄));
}

/**
 * 사진이 된 것이 확인돼 이제 지워도 되는 초안 id.
 *
 * 두 가지를 가른다.
 * - 이번에 완료한 것(`이번에_완료한`)은 그 사진이 **올라간 것까지** 봐야 지운다. 웹에서
 *   올라가기 전에 새로 고치면 사진이 사라지기 때문이다.
 * - 앱을 다시 연 뒤에 남아 있는 표시는 사진 목록에 그 사진이 있으면 지운다. 웹은 올라가지
 *   못한 사진을 기기에 남기지 않으므로, 목록에 있다는 것은 올라갔다는 뜻이다. 목록에
 *   없으면 사진이 사라진 것이라 초안을 그대로 두어 다시 완료할 수 있게 한다.
 */
export function settledFinishedDrafts(
  list: readonly StoredCardDraft[],
  photoIds: readonly string[],
  uploadedPhotoIds: readonly string[],
  이번에_완료한: readonly string[],
): string[] {
  return list
    .filter((줄) => {
      const 사진 = 줄.finishedPhotoId;
      if (!사진 || !photoIds.includes(사진)) return false;
      return 이번에_완료한.includes(줄.id) ? uploadedPhotoIds.includes(사진) : true;
    })
    .map((줄) => 줄.id);
}

/**
 * 만든 차례(오래된 것이 먼저). 「카드 N」의 N 은 이 차례다.
 *
 * 만든 시각이 같으면 id 로 가른다. 기기마다 다른 차례로 보이면 안 되어서다.
 */
export function draftCreationOrder(list: readonly StoredCardDraft[]): StoredCardDraft[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * 격자에 놓을 초안. **최신이 먼저**다.
 *
 * 방금 만든 것이 「더 보기」 뒤 맨 끝에 붙으면 어디 생겼는지 찾기 어렵다. 사진 앱
 * (갤러리·구글 포토)도 새것이 앞이다.
 *
 * @param photoIds 지금 이 여행에서 쓸 수 있는 사진. 지운 사진은 카드에서 빠진다.
 */
export function draftListOf(
  list: readonly StoredCardDraft[],
  tripName: string,
  photoIds: readonly string[] = [],
): CardDraft[] {
  return draftCreationOrder(list)
    .map((줄, 차례): CardDraft => {
      const card = keepsakeCardOf(줄.settings, tripName, photoIds);
      return {
        id: 줄.id,
        card,
        createdAt: 줄.createdAt,
        // 여행 이름을 따라가는 제목(`keepsakeCardOf`)이 아니라 적어 둔 제목만 본다.
        label: (줄.settings.title ?? "").trim() || `카드 ${차례 + 1}`,
        meta: `${keepsakeStyleLabel(card.style)} · 사진 ${card.photoIds.length}장`,
      };
    })
    .reverse();
}

/**
 * 같은 사진으로 꾸미던 초안. 있으면 그 id, 없으면 undefined.
 *
 * 「카드 만들기」를 누를 때마다 초안이 하나씩 늘면 「꾸미는 중」이 같은 사진으로 여럿 선다
 * (2026-09-23). 시작하는 사진이 모두 들어 있는 초안이 있으면 그것을 이어서 꾸민다.
 * 여럿이면 가장 최근 것(`list` 는 최신이 먼저다).
 */
export function sameSourceDraft(list: readonly CardDraft[], photoIds: readonly string[]): string | undefined {
  if (!photoIds.length) return undefined;
  return list.find((줄) => photoIds.every((id) => 줄.card.photoIds.includes(id)))?.id;
}

/**
 * 완료한 카드가 사진이 될 때 붙을 설명.
 *
 * 제목을 직접 적었으면 그것, 여행 이름 그대로면 빈 글자다. 사진에는 아무 표시도
 * 두지 않는다 — 카드였다는 흔적은 남기지 않는다.
 */
export function finishedCaptionOf(card: KeepsakeCard, tripName: string): string {
  return keepsakeBodyOf(card, tripName).title ?? "";
}

/**
 * 저장된 글을 초안 목록으로. 모양이 틀린 줄은 버리고, 아예 못 읽으면 빈 목록이다.
 *
 * 카드 값 자체는 여기서 가리지 않는다. `keepsakeCardOf` 가 읽으면서 모르는 값을
 * 기본으로 그리고 버리지 않는다.
 */
export function parseStoredDrafts(raw: string | null | undefined): StoredCardDraft[] {
  if (!raw) return [];
  let 읽은_것: unknown;
  try {
    읽은_것 = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(읽은_것)) return [];
  return 읽은_것.filter((줄): 줄 is StoredCardDraft =>
    Boolean(줄)
    && typeof 줄 === "object"
    && typeof (줄 as StoredCardDraft).id === "string"
    && (줄 as StoredCardDraft).id.length > 0
    && typeof (줄 as StoredCardDraft).createdAt === "string"
    && Boolean((줄 as StoredCardDraft).settings)
    && typeof (줄 as StoredCardDraft).settings === "object"
    && !Array.isArray((줄 as StoredCardDraft).settings));
}

export function serializeDrafts(list: readonly StoredCardDraft[]): string {
  return JSON.stringify(list);
}
