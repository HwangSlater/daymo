/**
 * 꾸미는 중인 추억 카드(초안)를 기기에 적고 읽는다.
 *
 * 기기 설정(`deviceSettings.ts`)과 같은 저장소를 쓴다. 여행마다 열쇠 하나에 초안
 * 배열을 통째로 둔다. 카드 한 장은 16KB 를 넘지 않고(서버의 `settings` 한도와 같다)
 * 여행마다 스무 장까지라 한 덩어리로 써도 무겁지 않다.
 *
 * 계산은 `cardDrafts.ts` 에 있다. 이 파일은 저장소를 만지는 일만 한다.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  cardDraftsKeyOf,
  cardImportKeyOf,
  isCardDraftsKey,
  parseStoredDrafts,
  serializeDrafts,
  type StoredCardDraft,
} from "./cardDrafts";

/** 그 여행의 초안. 없거나 못 읽으면 빈 목록이다. */
export async function readCardDrafts(tripId: string): Promise<StoredCardDraft[]> {
  try {
    return parseStoredDrafts(await AsyncStorage.getItem(cardDraftsKeyOf(tripId)));
  } catch {
    return [];
  }
}

/** 그 여행의 초안을 통째로 바꾼다. 빈 목록이면 열쇠를 지운다. */
export async function writeCardDrafts(tripId: string, list: readonly StoredCardDraft[]): Promise<void> {
  if (!list.length) return removeCardDrafts(tripId);
  await AsyncStorage.setItem(cardDraftsKeyOf(tripId), serializeDrafts(list));
}

/**
 * 이 여행에서 옛 앱이 두고 간 카드를 이미 불러왔는지.
 *
 * 못 읽으면 「아직」으로 본다. 한 번 더 불러와도 같은 id 는 건너뛰므로 카드가 둘이 되지는
 * 않는다(`importedDrafts`).
 */
export async function didImportServerCards(tripId: string): Promise<boolean> {
  try {
    return Boolean(await AsyncStorage.getItem(cardImportKeyOf(tripId)));
  } catch {
    return false;
  }
}

/** 이 여행은 불러오기를 마쳤다고 적는다. 적어 두는 값은 그때의 시각뿐이다. */
export async function markImportedServerCards(tripId: string): Promise<void> {
  await AsyncStorage.setItem(cardImportKeyOf(tripId), new Date().toISOString());
}

/**
 * 그 여행의 초안을 모두 지운다.
 *
 * 불러오기 표시(`cardImportKeyOf`)는 남긴다. 함께 지우면 그 여행을 다시 열었을 때 옛 앱이
 * 두고 간 카드를 또 들여와, 지운 카드가 되살아난다.
 */
export async function removeCardDrafts(tripId: string): Promise<void> {
  await AsyncStorage.removeItem(cardDraftsKeyOf(tripId));
}

/**
 * 이 기기에 있는 모든 여행의 초안을 지운다.
 *
 * 로그아웃하거나 다른 계정으로 로그인할 때 부른다. 초안에는 상대 사진이 들어 있을 수
 * 있어 공유 기기에 남기면 안 된다(2026-09-23). 못 읽는 저장소에서는 조용히 넘어간다.
 */
export async function removeAllCardDrafts(): Promise<void> {
  try {
    const 열쇠들 = (await AsyncStorage.getAllKeys()).filter(isCardDraftsKey);
    if (열쇠들.length) await AsyncStorage.multiRemove(열쇠들);
  } catch {
    // 지우지 못해도 로그아웃 자체는 이어 간다.
  }
}
