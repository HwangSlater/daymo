/**
 * 홈 화면의 여행 카드에 깔 사진을 정하는 자리의 말과 상태.
 *
 * 사진을 고르는 곳이 둘(기록 탭의 사진 시트, 기념 카드 시트)이라 말이 갈라지기
 * 쉽다. 켜짐/꺼짐을 가르는 것과 그때 보여 줄 글을 여기 한곳에 둔다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 이 줄이 놓인 자리. 꺼져 있을 때의 말만 다르다. */
export type CoverSpot = "photo" | "card";

/** 켜져 있을 때의 글. 두 자리가 같은 말을 쓴다. */
export const COVER_ON_LABEL = "홈 화면에 쓰는 중 · 누르면 해제";

/** 사진 목록과 카드 목록에 다는 작은 표시. */
export const COVER_BADGE = "홈";

/** 서버에 닿지 못했을 때. */
export const COVER_FAIL = "홈 화면 사진을 바꾸지 못했어요. 잠시 뒤에 다시 시도해 주세요";

const OFF_LABEL: Record<CoverSpot, string> = {
  photo: "홈 화면에 이 사진 쓰기",
  card: "이 카드의 사진을 홈 화면에 쓰기",
};

export type CoverToggle = {
  /** 이 사진이 지금 홈 화면에 깔려 있는지. */
  on: boolean;
  /** 누르면 서버로 보낼 값. `null` 이면 해제다. */
  next: string | null;
  /** 버튼에 쓸 글. */
  label: string;
  /** 누른 뒤에 알릴 글. */
  done: string;
};

/**
 * 누르면 무엇이 되는지.
 *
 * @param photoId 이 자리의 사진. 비어 있으면 누를 것이 없어 꺼진 것으로 본다.
 * @param coverPhotoId 지금 홈 화면에 깔린 사진.
 */
export function coverToggleOf(
  photoId: string | undefined,
  coverPhotoId: string | undefined,
  spot: CoverSpot,
): CoverToggle {
  const on = Boolean(photoId) && photoId === coverPhotoId;
  return {
    on,
    next: on ? null : photoId ?? null,
    label: on ? COVER_ON_LABEL : OFF_LABEL[spot],
    done: on ? "홈 화면에서 이 사진을 내렸어요" : "홈 화면에 이 사진을 깔았어요",
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
