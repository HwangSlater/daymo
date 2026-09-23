/**
 * 받아 둔 사진 파일을 얼마나 두고 무엇부터 지울지 정하는 셈(2026-09-23 검토 #6 나).
 *
 * 사진 폴더(`trip-photos/`)에는 성격이 다른 두 가지가 섞여 있다.
 *
 *   - **다시 받을 수 있는 것**: 서버에서 받아 둔 표시본·썸네일과, 저장하려고 잠깐 받은
 *     원본 사본이다. 이름이 모두 `server-` 로 시작한다(`photoTransfer.downloadPhoto`).
 *     지워도 다음에 볼 때 다시 받으면 되므로 이것만 캐시로 센다.
 *   - **여기밖에 없는 것**: 기기 사진첩에서 고른 원본을 앱 폴더로 옮겨 둔 것이다
 *     (`tripPhotos.keepTripPhoto`, `WarmTripDetail.copyPhotoIntoApp`). 아직 못 올린
 *     사진이면 이 파일이 세상에 하나뿐이다. **절대 지우지 않고 용량으로도 세지 않는다.**
 *
 * 파일 이름 규칙에 기대는 곳이 여기 말고도 `photoSync.isOriginalQualityUri`·
 * `isStaleDisplayCopy` 두 군데 더 있다. 이름을 바꾸려면 셋을 같이 봐야 한다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 1MB. 아래 셈이 모두 이 단위를 쓴다. */
const MB = 1024 * 1024;

/**
 * 받아 둔 사진 파일의 총 용량 상한.
 *
 * 문서 `07-local-first-and-sync.md` 는 500MB 를 권했지만 그보다 작게 잡았다. 까닭 셋.
 *
 *   1. 표시본 한 장이 긴 변 2048px 에 0.5MB 안팎이라 200MB 면 400장이다. 한 여행의
 *      사진이 400장을 넘는 일은 드물고, 지금 보고 있는 여행의 사진은 방금 받은 것이라
 *      가장 나중에 지워진다(아래 LRU). 넘겨 보던 사진이 눈앞에서 사라지지 않는다.
 *   2. 이 폴더는 문서 폴더라 iOS 에서 iCloud 백업에 들어간다. 사용자의 백업 용량을
 *      앱이 500MB 씩 먹는 것은 과하다.
 *   3. 지워도 다시 받으면 그만이다. 상한을 크게 잡아 얻는 것은 데이터 몇 MB 뿐이다.
 *
 * 실제 기기에서 재 본 뒤 조정한다(문서 §8 도 「파일럿 측정 후 조정」이라 적어 두었다).
 */
export const PHOTO_CACHE_LIMIT = 200 * MB;

/** 사진 폴더에 있는 파일 한 개. */
export type CacheFile = {
  /** 폴더 안의 파일 이름. */
  name: string;
  bytes: number;
  /**
   * 마지막으로 쓴 시각(ms). 이 파일은 받을 때 한 번 쓰이므로 「받은 때」와 같다.
   * 본 때가 아니라 받은 때라 딱 맞는 LRU 는 아니지만, 오래전에 받아 두고 다시 열지
   * 않은 것이 먼저 지워지는 차례는 같다.
   */
  modifiedAt: number;
};

/** 파일 이름으로 가른 갈래. */
export type CacheKind =
  /** 지금 판의 표시본(긴 변 2048px). 화면이 쓰고 있을 수 있다. */
  | "표시본"
  /** 옛 판의 표시본. `DISPLAY_REVISION` 이 오르면 남는다. 쓰는 곳이 없다. */
  | "옛표시본"
  /** 격자에 까는 썸네일(480px). */
  | "썸네일"
  /** 기기에 저장하려고 잠깐 받은 원본. 저장이 끝나면 지우는데, 중간에 끊기면 남는다. */
  | "원본사본"
  /** 기기에서 고른 원본. 캐시가 아니다. */
  | "내것";

const 표시본_이름 = /^server-.+-d(\d+)\.jpg$/;

/**
 * 파일 이름이 어느 갈래인지.
 *
 * @param revision 지금 표시본 판(`photoSync.DISPLAY_REVISION`).
 */
export function cacheKindOf(name: string, revision: number): CacheKind {
  if (!name.startsWith("server-")) return "내것";
  const 판 = name.match(표시본_이름);
  if (판) return Number(판[1]) === revision ? "표시본" : "옛표시본";
  if (name.endsWith("-thumbnail.jpg")) return "썸네일";
  if (name.endsWith("-original.jpg")) return "원본사본";
  // `server-<id>.jpg` — 판을 이름에 넣기 전(2026-09-21 이전)에 받아 둔 표시본이다.
  return "옛표시본";
}

/** 쓸어낸 결과. 용량은 바이트다. */
export type SweepPlan = {
  /** 지울 파일 이름. */
  remove: string[];
  /** 지우면 비는 용량. */
  freed: number;
  /** 지우고 난 뒤 남는 캐시 용량. */
  bytes: number;
};

/**
 * 무엇을 지울지 정한다.
 *
 * 차례는 둘이다.
 *
 *   1. **쓰는 곳이 없는 것부터.** 옛 판 표시본과, 저장이 끊겨 남은 원본 사본은 용량과
 *      상관없이 늘 지운다. 남겨 둬야 할 까닭이 없다.
 *   2. 그래도 상한을 넘으면 **오래전에 받은 것부터** 지운다. 방금 받은 것은 지금 보고
 *      있는 사진이다.
 *
 * 기기에서 고른 원본(`내것`)은 지우지도, 용량으로 세지도 않는다.
 */
export function planPhotoSweep(
  files: readonly CacheFile[],
  limitBytes: number,
  revision: number,
): SweepPlan {
  const remove: string[] = [];
  let freed = 0;
  let bytes = 0;
  const 남길_수_있는_것: CacheFile[] = [];
  for (const file of files) {
    const 갈래 = cacheKindOf(file.name, revision);
    if (갈래 === "내것") continue;
    if (갈래 === "옛표시본" || 갈래 === "원본사본") {
      remove.push(file.name);
      freed += file.bytes;
      continue;
    }
    남길_수_있는_것.push(file);
    bytes += file.bytes;
  }
  if (bytes <= limitBytes) return { remove, freed, bytes };
  // 오래된 것이 앞에 오게 세운다. 같은 시각이면 이름으로 갈라 어느 기기에서나 같은 차례다.
  남길_수_있는_것.sort((가, 나) => 가.modifiedAt - 나.modifiedAt || 가.name.localeCompare(나.name));
  for (const file of 남길_수_있는_것) {
    if (bytes <= limitBytes) break;
    remove.push(file.name);
    freed += file.bytes;
    bytes -= file.bytes;
  }
  return { remove, freed, bytes };
}

/** 캐시 용량으로 세는 파일만 고른다. 「지금 얼마나 쓰고 있나」를 잴 때 쓴다. */
export function cacheBytesOf(files: readonly CacheFile[], revision: number): { bytes: number; files: number } {
  let bytes = 0;
  let 수 = 0;
  for (const file of files) {
    if (cacheKindOf(file.name, revision) === "내것") continue;
    bytes += file.bytes;
    수 += 1;
  }
  return { bytes, files: 수 };
}

/**
 * 용량을 사람이 읽는 글자로. 설정 화면의 「사진 캐시 N」 자리에 그대로 넣는다.
 *
 * 100MB 가 넘으면 소수점을 떼고, 1MB 가 안 되면 KB 로 적는다. 삼성 갤러리·구글 포토의
 * 저장 공간 표시와 같은 모양이다.
 */
export function cacheSizeText(bytes: number): string {
  const 값 = Math.max(0, bytes);
  if (값 >= 1024 * MB) return `${(값 / (1024 * MB)).toFixed(1)}GB`;
  if (값 >= 100 * MB) return `${Math.round(값 / MB)}MB`;
  if (값 >= MB) return `${(값 / MB).toFixed(1)}MB`;
  return `${Math.round(값 / 1024)}KB`;
}
