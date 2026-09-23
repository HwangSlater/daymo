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

/** 초안을 더하거나(같은 id 가 없으면) 바꾼다(있으면). 차례는 건드리지 않는다. */
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
