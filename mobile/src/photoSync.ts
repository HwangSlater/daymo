/**
 * 기록 탭의 사진을 서버와 오가는 모양. 맞추는 계산은 `listSync.ts` 가 한다.
 *
 * 사진 줄에서 오가는 칸은 설명과 날짜뿐이다. 파일은 처음 만들 때 한 번 올리고
 * (`photoTransfer.ts`), 다른 기기의 사진은 받아서 기기에 둔다. 사진을 바꾸면 같은 줄을
 * 고치지 않고 새 사진으로 올린다. 서버는 올라온 파일을 바꾸지 않는다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { blank } from "./placeSync.ts";
import { dayLabelOf, isServerId, type Codec } from "./listSync.ts";

/** 앱의 사진(WarmTripDetail 의 MemoryPhoto)과 같은 모양. */
export type PhotoRow = { id: string; color: string; date: string; caption: string; uri?: string };

export type ServerPhoto = {
  id: string;
  status: "uploading" | "ready";
  caption: string | null;
  date: string | null;
  takenAt: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  isReceipt: boolean;
  uploaderMembershipId: string | null;
  uploaderName: string;
  createdAt: string;
  version: number;
};

export type PhotoBody = { caption: string | null; date: string | null };

/** 날짜를 고르지 않은 사진의 날짜 줄. 화면(WarmTripDetail 의 UNDATED)과 같다. */
export const PHOTO_UNDATED = "날짜 미정";

/** 사진이 오기 전에 칸을 채우는 색. 기록 탭의 색과 같다. */
export const PHOTO_PALETTE = ["#E7B4A6", "#DFC98A", "#AFC9C3", "#D4BDD4", "#C7D493", "#9CBBC6"];

/** 같은 사진은 어느 기기에서나 같은 색이 되게 id 로 고른다. */
export function colorOfId(id: string): string {
  let sum = 0;
  for (const char of id) sum = (sum + char.charCodeAt(0)) % 9973;
  return PHOTO_PALETTE[sum % PHOTO_PALETTE.length];
}

/**
 * @param knownIds 서버에 이미 있는 사진. 파일이 아직 기기에 없어도 설명·날짜는 맞춘다.
 *   서버에 없고 파일도 없는 사진(예시 사진)은 올릴 것이 없어 맞추지 않는다.
 */
export function photoCodec(tripDates: readonly string[], knownIds: ReadonlySet<string>): Codec<PhotoRow, PhotoBody, ServerPhoto> {
  const keyByDayLabel = new Map(tripDates.map((key) => [dayLabelOf(key), key]));
  return {
    syncable: (photo) => isServerId(photo.id) && (Boolean(photo.uri) || knownIds.has(photo.id)),
    idOf: (photo) => photo.id,
    toBody: (photo) => ({
      caption: blank(photo.caption, 200),
      date: keyByDayLabel.get(photo.date) ?? null,
    }),
    fromServer: (row) => ({
      id: row.id,
      color: colorOfId(row.id),
      date: row.date && tripDates.includes(row.date) ? dayLabelOf(row.date) : PHOTO_UNDATED,
      caption: row.caption ?? "",
    }),
    // 받아 둔 파일과 기기에서 고른 색은 서버에 없다.
    keepLocal: (fromServer, local) => ({ ...fromServer, color: local.color, ...(local.uri ? { uri: local.uri } : {}) }),
  };
}
