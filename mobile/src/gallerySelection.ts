/**
 * 사진첩(`PhotoGallery.tsx`)의 셈.
 *
 * 기록 탭의 「더 보기」가 격자를 그 자리에서 늘리던 것을, 사진이 많아지면 화면을
 * 통째로 쓰는 사진첩으로 바꿨다. 삼성 갤러리·구글 포토처럼 날짜별로 묶고, 여러 장을
 * 골라 한꺼번에 삭제·저장하거나 카드로 만든다. 여기에는 그 셈만 둔다.
 *
 * - 날짜로 묶고 네 칸씩 줄을 세운다.
 * - 손가락이 놓인 자리가 몇 번째 사진인지 찾는다. 칸 크기가 모두 같아서 재지 않고
 *   셈으로 찾는다. 칸마다 `onLayout` 으로 재면 스크롤할 때마다 값이 흔들리고,
 *   아직 그리지 않은 칸은 잴 수도 없다.
 * - 끌어서 고르기: 처음 짚은 사진부터 지금 사진까지를 한꺼번에 고르거나 뺀다.
 * - 삭제할 수 있는 사진과 없는 사진을 가르고, 카드에 넣을 수 있는지 본다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 사진첩이 알아야 하는 사진의 몫. */
export type GalleryPhoto = { id: string; date: string };

/** 하루치 묶음. */
export type GallerySection<T extends GalleryPhoto> = { date: string; photos: T[] };

/**
 * 날짜로 묶는다.
 *
 * 묶음의 차례는 기록 탭 격자와 같게, 그 날짜의 사진이 처음 나온 차례를 따른다.
 * 여행 날짜 순으로 다시 세우면 탭에서 첫 칸에 보던 사진이 사진첩에서는 한참
 * 아래로 가서, 방금 본 사진을 다시 찾아야 한다. 날짜가 비어 있으면 `undated` 로 묶는다.
 */
export function groupByDate<T extends GalleryPhoto>(photos: readonly T[], undated: string): GallerySection<T>[] {
  const 묶음 = new Map<string, T[]>();
  for (const photo of photos) {
    const 날짜 = photo.date.trim() || undated;
    const 칸 = 묶음.get(날짜);
    if (칸) 칸.push(photo);
    else 묶음.set(날짜, [photo]);
  }
  return [...묶음].map(([date, 사진]) => ({ date, photos: 사진 }));
}

/** 목록에 놓이는 한 줄. 날짜 머리거나 사진 네 장까지의 줄이다. */
export type GalleryRow<T extends GalleryPhoto> =
  | { kind: "머리"; key: string; date: string; ids: string[] }
  | { kind: "줄"; key: string; photos: T[]; /** 이 줄 첫 사진이 전체 차례에서 몇 번째인지. */ first: number };

/** 묶음을 줄로 편다. 날짜마다 머리 한 줄, 그 아래로 `columns` 장씩 한 줄. */
export function galleryRows<T extends GalleryPhoto>(sections: readonly GallerySection<T>[], columns: number): GalleryRow<T>[] {
  const 줄: GalleryRow<T>[] = [];
  let 차례 = 0;
  for (const section of sections) {
    줄.push({ kind: "머리", key: `머리:${section.date}`, date: section.date, ids: section.photos.map((photo) => photo.id) });
    for (let 앞 = 0; 앞 < section.photos.length; 앞 += columns) {
      const 사진 = section.photos.slice(앞, 앞 + columns);
      줄.push({ kind: "줄", key: `줄:${사진[0].id}`, photos: 사진, first: 차례 + 앞 });
    }
    차례 += section.photos.length;
  }
  return 줄;
}

/** 줄 그대로의 사진 차례. 끌어서 고를 때 「사이」가 이 차례를 따른다. */
export function galleryOrder<T extends GalleryPhoto>(sections: readonly GallerySection<T>[]): string[] {
  return sections.flatMap((section) => section.photos.map((photo) => photo.id));
}

/** 칸 크기. 사진 칸은 정사각형이고 줄마다 아래에 `gap` 만큼 틈이 있다. */
export type GalleryMetrics = { columns: number; width: number; gap: number; header: number };

/** 정사각형 칸 한 변. 가장자리까지 꽉 채우고 칸 사이에만 틈을 둔다. */
export const tileSizeOf = ({ columns, width, gap }: GalleryMetrics) =>
  Math.max(0, (width - gap * (columns - 1)) / columns);

/** 줄의 높이. `FlatList` 의 `getItemLayout` 과 손가락 자리 찾기가 같은 값을 써야 한다. */
export const rowHeightOf = <T extends GalleryPhoto>(row: GalleryRow<T>, metrics: GalleryMetrics) =>
  row.kind === "머리" ? metrics.header : tileSizeOf(metrics) + metrics.gap;

/** 줄마다 위에서부터의 자리. 마지막에 전체 높이를 하나 더 붙인다. */
export function rowOffsets<T extends GalleryPhoto>(rows: readonly GalleryRow<T>[], metrics: GalleryMetrics): number[] {
  const 자리 = [0];
  for (const row of rows) 자리.push(자리[자리.length - 1] + rowHeightOf(row, metrics));
  return 자리;
}

/**
 * 목록 안의 한 점(`x`, 스크롤을 더한 `y`)에 놓인 사진의 차례. 없으면 -1.
 *
 * 날짜 머리 위면 -1 이다. 끌던 손가락이 머리를 지나가도 고른 것이 흔들리지 않게
 * 부르는 쪽이 앞의 값을 그대로 둔다. 줄 끝의 빈 칸이면 그 줄의 마지막 사진으로
 * 본다. 사진이 세 장뿐인 줄의 빈 넷째 칸을 지나갈 때 고르기가 끊기지 않게 한다.
 */
export function tileAt<T extends GalleryPhoto>(
  rows: readonly GalleryRow<T>[],
  offsets: readonly number[],
  metrics: GalleryMetrics,
  x: number,
  y: number,
): number {
  if (!rows.length || y < 0 || y >= offsets[rows.length]) return -1;
  // 줄은 수백 개가 될 수 있다. 끄는 동안 자주 부르므로 반씩 잘라 찾는다.
  let 아래 = 0;
  let 위 = rows.length - 1;
  while (아래 < 위) {
    const 가운데 = (아래 + 위 + 1) >> 1;
    if (offsets[가운데] <= y) 아래 = 가운데;
    else 위 = 가운데 - 1;
  }
  const row = rows[아래];
  if (row.kind === "머리") return -1;
  const 칸 = tileSizeOf(metrics) + metrics.gap;
  const 몇째 = Math.min(metrics.columns - 1, Math.max(0, Math.floor(x / 칸)));
  return row.first + Math.min(몇째, row.photos.length - 1);
}

/**
 * 끌어서 고른다.
 *
 * `base` 는 끌기 시작할 때 이미 골라 둔 것이다. 처음 짚은 사진(`from`)부터 지금
 * 손가락 아래 사진(`to`)까지를 더하거나 뺀다. 되돌아가면 지나쳤던 사진은 끌기 전
 * 상태로 돌아온다. 삼성 갤러리에서 끌다가 되돌아올 때와 같다.
 *
 * 고른 차례는 남긴다. 카드에 넣을 때 고른 차례대로 들어간다. 끌어서 더한 것은
 * 처음 짚은 쪽에서 가까운 것부터 붙는다.
 */
export function dragSelect(
  base: readonly string[],
  order: readonly string[],
  from: number,
  to: number,
  adding: boolean,
): string[] {
  if (from < 0 || to < 0 || from >= order.length || to >= order.length) return [...base];
  const 걸음 = to >= from ? 1 : -1;
  const 사이: string[] = [];
  for (let 차례 = from; ; 차례 += 걸음) {
    사이.push(order[차례]);
    if (차례 === to) break;
  }
  if (!adding) {
    const 뺄_것 = new Set(사이);
    return base.filter((id) => !뺄_것.has(id));
  }
  const 있는_것 = new Set(base);
  return [...base, ...사이.filter((id) => !있는_것.has(id))];
}

/** 한 장을 넣거나 뺀다. 넣으면 맨 뒤에 붙어 고른 차례가 남는다. */
export function toggleOne(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((하나) => 하나 !== id) : [...selected, id];
}

/** 그날 사진이 모두 골라져 있는지. 날짜 머리의 「전체 선택」「선택 해제」가 이것을 본다. */
export function allChosen(selected: readonly string[], ids: readonly string[]): boolean {
  if (!ids.length) return false;
  const 고른_것 = new Set(selected);
  return ids.every((id) => 고른_것.has(id));
}

/** 날짜 머리를 눌렀을 때. 그날 것이 다 골라져 있으면 모두 빼고, 아니면 빠진 것을 더한다. */
export function toggleDay(selected: readonly string[], ids: readonly string[]): string[] {
  if (allChosen(selected, ids)) {
    const 뺄_것 = new Set(ids);
    return selected.filter((id) => !뺄_것.has(id));
  }
  const 있는_것 = new Set(selected);
  return [...selected, ...ids.filter((id) => !있는_것.has(id))];
}

/** 지워진 사진처럼 이제 없는 것을 고른 목록에서 뺀다. */
export function keepExisting(selected: readonly string[], ids: readonly string[]): string[] {
  const 있는_것 = new Set(ids);
  const 남은_것 = selected.filter((id) => 있는_것.has(id));
  return 남은_것.length === selected.length ? (selected as string[]) : 남은_것;
}

/**
 * 삭제할 수 있는 사진과 없는 사진을 가른다.
 *
 * 서버는 올린 사람과 관리자만 받는다(`photos.can_manage`). 남의 사진이 섞여 있다고
 * 통째로 막으면 내 사진도 한 장씩 골라 다시 지워야 한다. 되는 것만 지우고 몇 장을
 * 두었는지 말한다.
 */
export function splitManageable(ids: readonly string[], canManage: (id: string) => boolean) {
  const allowed = ids.filter((id) => canManage(id));
  return { allowed, skipped: ids.length - allowed.length };
}

/** 여러 장을 지우기 전에 묻는 말. 한 장 지울 때(`confirmPhotoDelete`)와 같은 꼴이다. */
export function deleteConfirmText(allowed: number, skipped: number): { title: string; body: string } {
  const 남 = skipped > 0 ? ` 다른 사람이 올린 사진 ${skipped}장은 삭제되지 않아요.` : "";
  return {
    title: allowed > 1 ? `사진 ${allowed}장을 삭제할까요?` : "이 사진을 삭제할까요?",
    body: `삭제한 사진은 휴지통에서 7일 안에 되돌릴 수 있어요.${남}`,
  };
}

/** 지운 뒤의 한 줄. */
export function deletedText(deleted: number, skipped: number): string {
  const 앞 = deleted > 1 ? `사진 ${deleted}장을 삭제했어요` : "사진을 삭제했어요";
  return skipped > 0 ? `${앞}. 다른 사람 사진 ${skipped}장은 그대로 뒀어요` : 앞;
}

/** 저장한 뒤의 한 줄. 업로드 중이라 뺀 것과 실패한 것을 나눠 말한다. */
export function savedText({ saved, failed, skipped }: { saved: number; failed: number; skipped: number }): string {
  const 앞 = saved > 0 ? `사진 ${saved}장을 저장했어요` : "사진을 저장하지 못했어요";
  const 뒤 = [
    saved > 0 && failed > 0 ? `${failed}장은 저장하지 못했어요` : "",
    skipped > 0 ? `업로드 중인 ${skipped}장은 뺐어요` : "",
  ].filter(Boolean);
  return 뒤.length ? `${앞}. ${뒤.join(", ")}` : 앞;
}

/**
 * 고른 사진으로 카드를 만들 수 있는지.
 *
 * 카드 한 장에는 사진이 `max` 장까지 들어간다(`KEEPSAKE_MAX_PHOTOS`). 넘치면 앞의
 * 몇 장만 넣지 않는다. 어느 것이 빠졌는지 알 수 없어서, 줄여 달라고 말한다.
 */
export function cardFromSelection(
  ids: readonly string[],
  max: number,
): { ok: true; ids: string[] } | { ok: false; reason: string } {
  if (!ids.length) return { ok: false, reason: "카드에 넣을 사진을 골라 주세요" };
  if (ids.length > max) return { ok: false, reason: `카드에는 사진을 ${max}장까지 넣을 수 있어요` };
  return { ok: true, ids: [...ids] };
}

/**
 * 지운 것을 원래 자리에 되돌려 넣는다. 「되돌리기」가 아직 올리지 않은 사진에 쓴다.
 *
 * `removed` 의 `index` 는 지우기 전 목록의 자리다. 앞자리부터 넣어야 뒤의 자리가 맞다.
 * 그 사이에 같은 id 가 다시 생겼으면 두 번 넣지 않는다.
 */
export function reinsertAt<T extends { id: string }>(list: readonly T[], removed: readonly { item: T; index: number }[]): T[] {
  const 결과 = [...list];
  const 있는_것 = new Set(list.map((하나) => 하나.id));
  for (const { item, index } of [...removed].sort((가, 나) => 가.index - 나.index)) {
    if (있는_것.has(item.id)) continue;
    결과.splice(Math.min(index, 결과.length), 0, item);
    있는_것.add(item.id);
  }
  return 결과;
}

/**
 * 사진 위에 얹는 업로드 한 줄. 기록 탭 격자와 사진첩이 같은 말을 쓴다.
 *
 * 진행률을 아직 모르면(보내기 전) 숫자 없이 적는다. 0% 로 적으면 멈춘 것처럼 보인다.
 */
export const uploadStateText = (막혔나: boolean, 진행: number | undefined) =>
  (막혔나 ? "업로드 실패" : 진행 === undefined ? "업로드 중" : `업로드 중 ${Math.round(진행 * 100)}%`);

/**
 * 기록 탭 격자에 무엇을 몇 개 놓을지.
 *
 * 사진은 여섯 장까지만 놓고, 넘치면 「모두 보기」로 사진첩을 연다. 사진첩은 사진만
 * 다루므로 카드는 탭에 남는다. 카드도 여섯 장이 넘으면 예전처럼 그 자리에서 편다.
 *
 * 카드를 사진 뒤 「더 보기」 너머에 두었더니 방금 만든 카드가 어디 있는지 찾지 못했다.
 * 이제 사진이 여섯 장에서 끊기므로 카드가 늘 그 바로 뒤에 보인다.
 */
export function memoryPreview(
  filter: "전체" | "사진" | "카드",
  photoCount: number,
  cardCount: number,
  cardsExpanded: boolean,
  limit = 6,
) {
  const photos = filter === "카드" ? 0 : Math.min(photoCount, limit);
  const cardsAll = filter === "사진" ? 0 : cardCount;
  const cards = cardsExpanded ? cardsAll : Math.min(cardsAll, limit);
  return {
    photos,
    cards,
    /** 사진첩을 여는 줄을 둘지. */
    gallery: filter !== "카드" && photoCount > limit,
    /** 카드를 그 자리에서 펴는 줄에 적을 숨은 수. 0 이면 줄이 없다. */
    moreCards: cardsAll > limit ? cardsAll - limit : 0,
  };
}
