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
  /** 올린 사람의 이름. 크게 보는 화면의 `하늘이 올림` 줄에 쓴다. 서버 사진에만 있다. */
  uploaderName?: string;
  /**
   * 원본을 언제까지 받을 수 있는지(ISO).
   *
   * 원본은 올린 지 30일까지만 서버에 남고, 그 뒤에는 표시본(긴 변 1440px)과 썸네일만
   * 영원히 남는다. 기한이 지났으면 `null`, 서버가 알려 주지 않으면 `undefined` 다.
   */
  originalUntil?: string | null;
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
  /** 원본을 받을 수 있는 기한(ISO). 이미 지났으면 null 이다. */
  originalUntil?: string | null;
};

export type PhotoBody = { caption: string | null; date: string | null; links: PhotoLink[] };

/** 날짜를 고르지 않은 사진의 날짜 줄. 화면(WarmTripDetail 의 UNDATED)과 같다. */
export const PHOTO_UNDATED = "날짜 미정";

/** 사진이 오기 전에 칸을 채우는 색. 기록 탭의 색과 같다. */
export const PHOTO_PALETTE = ["#E7B4A6", "#DFC98A", "#AFC9C3", "#D4BDD4", "#C7D493", "#9CBBC6"];

/**
 * 사진에 찍힌 시각에서 날짜(`YYYY-MM-DD`)만 꺼낸다. 없거나 모양이 틀리면 빈 글자다.
 *
 * 여행이 끝나고 수십 장을 한꺼번에 올릴 때 날짜를 한 장씩 고르게 하면 고통스럽다.
 * 사진에 적혀 있으면 그 날로 넣는다. EXIF 는 `2026:09:12 14:33:01` 처럼 적혀 있고,
 * 기기마다 칸 이름이 조금씩 다르다(iOS 는 `{Exif}` 안에 둔다).
 */
export function photoTakenDate(exif: unknown): string {
  const 상자 = (exif ?? {}) as Record<string, unknown>;
  const 안쪽 = (상자["{Exif}"] ?? {}) as Record<string, unknown>;
  const 값 = [상자.DateTimeOriginal, 안쪽.DateTimeOriginal, 상자.DateTimeDigitized, 상자.DateTime]
    .find((하나) => typeof 하나 === "string");
  const 찾은_것 = (값 as string | undefined)?.trim() ?? "";
  const 맞는가 = 찾은_것.match(/^(\d{4})[:-](\d{2})[:-](\d{2})/);
  return 맞는가 ? `${맞는가[1]}-${맞는가[2]}-${맞는가[3]}` : "";
}

/**
 * 저장할 때 원본을 받을 수 있는지와, 크게 보는 창에 조용히 붙일 한 줄.
 *
 * 원본은 올린 지 30일까지만 서버에 남는다. 그 뒤로는 표시본만 남아서, 원본을 갖고
 * 싶으면 그 안에 받아 가야 한다. 알림으로 재촉하지 않고 저장 버튼 옆에 한 줄로 적는다.
 *
 * @param originalUntil 서버가 준 기한. `null` 이면 이미 지났고, 없으면 서버가 말해 주지
 *   않은 것이다(옛 서버). 모를 때는 원본을 달라고 해 보고 서버 답을 따른다.
 * @param todayKey 오늘(`YYYY-MM-DD`). 며칠 남았는지 셀 때만 쓴다.
 */
export function originalSaveHint(
  originalUntil: string | null | undefined,
  todayKey: string,
): { hasOriginal: boolean; text: string; soon: boolean } {
  if (originalUntil === undefined) return { hasOriginal: true, text: "", soon: false };
  if (originalUntil === null) return { hasOriginal: false, text: "원본 보관 기간이 지나 화면 크기로 저장돼요", soon: false };
  const 날 = originalUntil.slice(0, 10);
  const 맞는가 = 날.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!맞는가) return { hasOriginal: true, text: "", soon: false };
  const 남은_날 = Math.round((Date.parse(`${날}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000);
  return {
    hasOriginal: true,
    text: `원본은 ${Number(맞는가[2])}월 ${Number(맞는가[3])}일까지 받을 수 있어요`,
    soon: Number.isFinite(남은_날) && 남은_날 <= 7,
  };
}

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
      // 올린 사람과 원본 기한은 받아 두기만 한다. 서버로 보내는 칸(toBody)에는 없다.
      uploaderMembershipId: row.uploaderMembershipId,
      // 이름이 빈 줄인 서버 사진이 있다(탈퇴한 멤버). 그때는 칸을 만들지 않아
      // 크게 보는 화면이 `누가 올림` 줄을 아예 내지 않게 한다.
      ...(row.uploaderName ? { uploaderName: row.uploaderName } : {}),
      // 서버가 말해 주지 않으면 칸을 만들지 않는다. 있는데 비어 있는 것과 다르다.
      ...(row.originalUntil === undefined ? {} : { originalUntil: row.originalUntil }),
    }),
    // 받아 둔 파일과 기기에서 고른 색은 서버에 없다. 올린 사람은 서버 것을 따른다.
    keepLocal: (fromServer, local) => ({ ...fromServer, color: local.color, ...(local.uri ? { uri: local.uri } : {}) }),
  };
}
