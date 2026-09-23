/**
 * 홈 화면의 여행 카드에 깔 것을 정하는 자리의 말과 상태.
 *
 * 고르는 곳이 둘(사진 크게 보기, 기념 카드 꾸미기)이라 말이 갈라지기 쉽다.
 * 켜짐/꺼짐을 가르는 것과 그때 보여 줄 글을 여기 한곳에 둔다.
 *
 * 여행 하나에 홈 카드는 하나다. 새로 깔면 전에 깔아 둔 것이 **내려간다.** 예전에는
 * 「홈 화면에 이 사진을 깔았어요」만 알려서, 공들여 꾸민 기념 카드가 소리 없이
 * 내려가도 알 길이 없었다. 무엇이 내려갔는지 이름을 대고, 부르는 쪽이 되돌릴 수
 * 있게 전에 있던 것을 그대로 돌려준다. 묻지는 않는다. 되돌리는 데 두 번 누르면
 * 되는 일이라 물을 때마다 걸리적거린다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 이 줄이 놓인 자리. 고르는 것이 사진인지 카드인지이기도 하다. */
type CoverSpot = "photo" | "card";

/** 지금 홈 화면에 깔려 있는 것. 아무것도 없으면 `undefined` 다. */
type CoverNow = {
  kind: CoverSpot;
  id: string;
  /** 사진 설명이나 카드 이름. 없으면 종류로만 부른다. */
  name?: string;
};

/** 켜져 있을 때의 글. 두 자리가 같은 말을 쓴다. */
export const COVER_ON_LABEL = "대표 사진으로 쓰는 중 · 누르면 해제";

/** 사진 목록과 카드 목록에 다는 작은 표시. */
export const COVER_BADGE = "대표";

/** 서버에 닿지 못했을 때. */
export const COVER_FAIL = "대표 사진을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요";

/** 알림 옆 되돌리기 버튼에 적을 말. */
export const COVER_UNDO = "되돌리기";

const OFF_LABEL: Record<CoverSpot, string> = {
  photo: "대표 사진으로 설정",
  card: "이 카드를 대표 사진으로 설정",
};

/** 부르는 말. 뒤에 붙는 조사까지 함께 둔다(사진「을」, 카드「를」). */
const 이것: Record<CoverSpot, string> = { photo: "이 사진을", card: "이 카드를" };
/** 내려가는 것을 부르는 말. 이름을 모를 때 쓴다. */
const 그것: Record<CoverSpot, string> = { photo: "전에 설정한 사진", card: "전에 설정한 카드" };

type CoverToggle = {
  /** 이것이 지금 홈 화면에 깔려 있는지. */
  on: boolean;
  /** 누르면 서버로 보낼 값. `null` 이면 해제다. */
  next: string | null;
  /** 버튼에 쓸 글. */
  label: string;
  /** 누른 뒤에 알릴 글. 무엇이 내려갔는지까지 적는다. */
  done: string;
  /**
   * 되돌리려면 도로 깔아야 할 것. 전에 아무것도 없었으면 `null`(해제)이다.
   *
   * 지금 깔린 것을 내리는 중이면 되돌릴 것이 바로 그것이다.
   */
  undo: CoverNow | null;
};

/**
 * 내려가는 것을 뭐라고 부를지. 이름이 있으면 이름을, 없으면 종류로 부른다.
 *
 * 「○○ 대신」 꼴로 쓰이므로 조사는 붙이지 않는다. 사용자가 적은 이름이라 받침을
 * 미리 알 수 없는데, 「대신」은 받침과 상관없이 붙는다.
 */
const 내려가는_것 = (now: CoverNow): string => {
  const 이름 = now.name?.trim();
  return !이름 ? 그것[now.kind] : now.kind === "card" ? `「${이름}」 카드` : `「${이름}」`;
};

/**
 * 누르면 무엇이 되는지.
 *
 * @param targetId 이 자리의 사진 또는 카드. 비어 있으면 누를 것이 없어 꺼진 것으로 본다.
 * @param now 지금 홈 화면에 깔려 있는 것. 종류와 이름까지 받는다.
 * @param spot 이 자리가 고르는 것이 사진인지 카드인지.
 */
export function coverToggleOf(
  targetId: string | undefined,
  now: CoverNow | undefined,
  spot: CoverSpot,
): CoverToggle {
  const on = Boolean(targetId) && now?.kind === spot && now.id === targetId;
  if (on) {
    return {
      on: true,
      next: null,
      label: COVER_ON_LABEL,
      done: "대표 사진을 해제했어요",
      undo: now ?? null,
    };
  }
  return {
    on: false,
    next: targetId ?? null,
    label: OFF_LABEL[spot],
    done: now
      ? `${내려가는_것(now)} 대신 ${이것[spot]} 대표 사진으로 설정했어요`
      : `${이것[spot]} 대표 사진으로 설정했어요`,
    undo: now ?? null,
  };
}

/**
 * 이 사진을 홈 화면에 깔 수 있는지.
 *
 * 서버가 그 여행의 다 올라온 사진만 받는다. 아직 올라가는 중인 사진에는 줄을
 * 내지 않는다. 눌러 봐야 거절만 돌아온다.
 */
export const coverPickable = (
  photoId: string | undefined | null,
  uploadedIds: ReadonlySet<string>,
): photoId is string => Boolean(photoId && uploadedIds.has(photoId));

/**
 * 지금 홈에 깔린 것을 하나로 모은다. 사진과 카드 중 하나만 깔린다.
 *
 * 카드를 먼저 본다. 서버가 둘 다 들고 있는 일은 없지만, 옛 값이 남아 있을 때
 * 눈에 보이는 것(카드)을 따라가는 편이 말과 화면이 어긋나지 않는다.
 */
export function coverNowOf(
  coverPhotoId: string | undefined,
  coverCardId: string | undefined,
  nameOf: (kind: CoverSpot, id: string) => string | undefined,
): CoverNow | undefined {
  if (coverCardId) return { kind: "card", id: coverCardId, name: nameOf("card", coverCardId) };
  if (coverPhotoId) return { kind: "photo", id: coverPhotoId, name: nameOf("photo", coverPhotoId) };
  return undefined;
}

/** 되돌릴 때 서버로 보낼 몸통. 전에 아무것도 없었으면 사진 자리를 비운다. */
export function coverUndoBody(
  undo: CoverNow | null,
): { coverPhotoId: string | null } | { coverCardId: string | null } {
  if (!undo) return { coverPhotoId: null };
  return undo.kind === "card" ? { coverCardId: undo.id } : { coverPhotoId: undo.id };
}
