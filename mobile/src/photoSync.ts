/**
 * 기록 탭의 사진을 서버와 오가는 모양. 맞추는 계산은 `listSync.ts` 가 한다.
 *
 * 사진 줄에서 오가는 칸은 설명·날짜와 붙은 곳이다. 파일은 처음 만들 때 한 번 올리고
 * (`photoTransfer.ts`), 다른 기기의 사진은 받아서 기기에 둔다. 사진을 바꾸면 같은 줄을
 * 고치지 않고 새 사진으로 올린다. 서버는 올라온 파일을 바꾸지 않는다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { blank } from "./placeSync.ts";
import { dayLabelOf, isServerId, type Codec } from "./listSync.ts";

/** 사진이 붙을 수 있는 곳. 날짜는 연결이 아니라 사진 자신의 `date` 다. */
export type PhotoLinkTarget = "place" | "schedule" | "stay";

/** 사진이 붙어 있는 곳 하나. `targetId` 는 서버에 올라간 장소·일정·숙소의 id 다. */
export type PhotoLink = { targetType: PhotoLinkTarget; targetId: string };

/** 서버와 견줄 때 순서가 달라 같은 값이 다르게 보이지 않도록 한 줄로 만든다. */
const linkKey = (link: PhotoLink) => `${link.targetType}:${link.targetId}`;

/** 같은 곳이 두 번 오지 않게 추리고 늘 같은 차례로 놓는다. */
export function tidyLinks(links: readonly PhotoLink[] | undefined): PhotoLink[] {
  const 한_번씩 = new Map((links ?? []).map((link) => [linkKey(link), link]));
  return [...한_번씩.values()].sort((a, b) => linkKey(a).localeCompare(linkKey(b)));
}

/** 그곳에 붙은 사진만. 장소 카드·일정 줄·숙소가 자기 사진을 고를 때 쓴다. */
export function photosLinkedTo<T extends { links?: PhotoLink[] }>(
  photos: readonly T[],
  targetType: PhotoLinkTarget,
  targetId: string | undefined,
): T[] {
  if (!targetId) return [];
  return photos.filter((photo) =>
    (photo.links ?? []).some((link) => link.targetType === targetType && link.targetId === targetId));
}

/**
 * 숙소에 붙은 사진과 묵는 동안 찍은 사진.
 *
 * "숙소 글을 누르면 그날 사진이 보인다"(docs/01-requirements.md)가 요구하는 것이라
 * 붙인 사진만으로는 모자란다. 숙소 사진을 먼저 놓고 그날 사진을 뒤에 잇는다.
 */
export function photosOfStay<T extends { id: string; date: string; links?: PhotoLink[] }>(
  photos: readonly T[],
  stayId: string | undefined,
  dayLabels: readonly string[],
): T[] {
  const 붙은_것 = photosLinkedTo(photos, "stay", stayId);
  const 이미 = new Set(붙은_것.map((photo) => photo.id));
  const 그날 = dayLabels.length
    ? photos.filter((photo) => !이미.has(photo.id) && dayLabels.includes(photo.date))
    : [];
  return [...붙은_것, ...그날];
}

/** 앱의 사진(WarmTripDetail 의 MemoryPhoto)과 같은 모양. */
export type PhotoRow = {
  id: string;
  color: string;
  date: string;
  caption: string;
  uri?: string;
  /** 붙어 있는 장소·일정·숙소. 아직 서버에 없는 곳은 올라간 뒤에 붙는다. */
  links?: PhotoLink[];
  /**
   * 올린 사람의 membership id. 서버에서 받은 사진에만 있다. 비어 있으면 이 기기에서
   * 막 올린 내 사진이다. 사진은 올린 사람과 관리자만 고칠 수 있어 화면이 이 값으로 가린다.
   */
  uploaderMembershipId?: string | null;
};

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
  links?: PhotoLink[];
};

export type PhotoBody = { caption: string | null; date: string | null; links: PhotoLink[] };

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
 * @param serverTargetIds 서버에 올라간 장소·일정·숙소의 id. 아직 없는 곳은 서버가
 *   거부하므로 보내지 않는다. 그곳이 올라가면 다시 맞추면서 붙는다(일정의 장소와 같다).
 */
export function photoCodec(
  tripDates: readonly string[],
  knownIds: ReadonlySet<string>,
  serverTargetIds: ReadonlySet<string> = new Set(),
): Codec<PhotoRow, PhotoBody, ServerPhoto> {
  const keyByDayLabel = new Map(tripDates.map((key) => [dayLabelOf(key), key]));
  return {
    syncable: (photo) => isServerId(photo.id) && (Boolean(photo.uri) || knownIds.has(photo.id)),
    // blockReason 은 두지 않는다. 웹은 올린 직후 파일을 비우는데, 서버 id 가 syncedIds
    // 에 적히기 전 한순간 "파일 없음" 으로 보여 배지가 깜빡인다.
    idOf: (photo) => photo.id,
    toBody: (photo) => ({
      caption: blank(photo.caption, 200),
      date: keyByDayLabel.get(photo.date) ?? null,
      links: tidyLinks(photo.links).filter((link) => serverTargetIds.has(link.targetId)),
    }),
    fromServer: (row) => ({
      id: row.id,
      color: colorOfId(row.id),
      date: row.date && tripDates.includes(row.date) ? dayLabelOf(row.date) : PHOTO_UNDATED,
      caption: row.caption ?? "",
      links: tidyLinks(row.links),
      // 올린 사람은 받아 두기만 한다. 서버로 보내는 칸(toBody)에는 없다.
      uploaderMembershipId: row.uploaderMembershipId,
    }),
    // 받아 둔 파일과 기기에서 고른 색은 서버에 없다. 올린 사람은 서버 것을 따른다.
    keepLocal: (fromServer, local) => ({ ...fromServer, color: local.color, ...(local.uri ? { uri: local.uri } : {}) }),
  };
}
