/**
 * 받아 둔 사진 파일을 세고 지운다(2026-09-23 검토 #6 나).
 *
 * 2026-09-23 전에는 받은 사진이 문서 폴더에 **상한 없이** 쌓였다. 지우는 정책도,
 * 지금 얼마나 쓰는지 보는 길도 없었다. 사진 1,000장이면 500MB 다.
 *
 * 폴더는 그대로 문서 폴더에 둔다. 캐시 폴더로 옮기면 OS 가 아무 때나 비우는데, 기기에
 * 적어 둔 사진 자리(`daymo.trip-data.v1`)는 그대로라 화면에 빈 칸만 남는다. 대신
 * **상한과 지우는 차례를 앱이 쥔다**(`photoCachePlan.ts`).
 *
 * 무엇을 지워도 되는지, 무엇을 지우면 안 되는지는 파일 이름으로 가른다. 기기에서 고른
 * 원본은 아직 못 올린 사진의 **하나뿐인 원본**일 수 있어 절대 지우지 않는다.
 *
 * 설정 화면에 붙이는 법:
 *   const 지금 = await photoCacheUsage();           // { bytes, files }
 *   `사진 캐시 ${cacheSizeText(지금.bytes)}`         // 「사진 캐시 128MB」
 *   await clearPhotoCache();                        // 「비우기」를 눌렀을 때
 */

import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import {
  cacheBytesOf,
  cacheKindOf,
  planPhotoSweep,
  PHOTO_CACHE_LIMIT,
  type CacheFile,
} from "./photoCachePlan";
import { DISPLAY_REVISION } from "./photoSync";

/**
 * 사진을 두는 폴더 이름. 받은 것과 고른 것이 한 폴더에 섞여 있고 이름으로 가른다
 * (`photoCachePlan.cacheKindOf`).
 */
export const PHOTO_DIRECTORY = "trip-photos";

/** 잰 결과. */
export type PhotoCacheUsage = {
  /** 바이트. 기기에서 고른 원본은 캐시가 아니라 세지 않는다. */
  bytes: number;
  files: number;
};

const 빈_것: PhotoCacheUsage = { bytes: 0, files: 0 };

/**
 * 파일이 아직 있는지 기억해 둔다.
 *
 * 화면은 사진 자리를 기기에 적어 두고 다시 열 때 그대로 쓴다(`isLivePhotoUri`). 캐시를
 * 비우면 그 자리의 파일이 없어지는데, 없어진 줄 모르면 빈 칸만 남고 다시 받지도 않는다.
 * 자리마다 한 번만 물어보고 답을 여기 둔다 — 그리는 중에 파일을 매번 뒤지지 않는다.
 */
const 있는_파일 = new Map<string, boolean>();

/** 이 자리의 파일이 아직 있는지. 폰의 `file://` 자리만 본다. */
export function photoFileExists(uri: string): boolean {
  if (Platform.OS === "web" || !uri.startsWith("file://")) return true;
  const 기억 = 있는_파일.get(uri);
  if (기억 !== undefined) return 기억;
  let 있나 = true;
  try {
    있나 = new File(uri).exists;
  } catch {
    // 우리가 만든 자리가 아니면 건드리지 않고 있는 것으로 본다.
    있나 = true;
  }
  있는_파일.set(uri, 있나);
  return 있나;
}

/** 파일을 새로 받았거나 지웠다고 알린다. */
export function notePhotoFile(uri: string, 있나: boolean): void {
  if (Platform.OS === "web") return;
  있는_파일.set(uri, 있나);
}

/** 사진 폴더. 없으면 `undefined`. */
function 사진_폴더(): Directory | undefined {
  if (Platform.OS === "web") return undefined;
  try {
    const 폴더 = new Directory(Paths.document, PHOTO_DIRECTORY);
    return 폴더.exists ? 폴더 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 폴더 안의 파일을 훑는다.
 *
 * 파일 하나하나의 크기를 묻는 것은 기다리지 않는 호출이라, 사진이 많으면 그동안 화면이
 * 멎는다. 화면에서 기다리는 자리(설정을 열 때)와 다 받고 난 뒤(`maybeSweepPhotoCache`)
 * 에만 부른다.
 */
function 훑기(): { 폴더: Directory; 목록: CacheFile[] } | undefined {
  const 폴더 = 사진_폴더();
  if (!폴더) return undefined;
  try {
    const 목록: CacheFile[] = [];
    for (const 하나 of 폴더.list()) {
      if (!(하나 instanceof File)) continue;
      목록.push({ name: 하나.name, bytes: 하나.size ?? 0, modifiedAt: 하나.modificationTime ?? 0 });
    }
    return { 폴더, 목록 };
  } catch {
    return undefined;
  }
}

function 지우기(폴더: Directory, names: readonly string[]): void {
  for (const name of names) {
    try {
      const 파일 = new File(폴더, name);
      if (파일.exists) 파일.delete();
      notePhotoFile(파일.uri, false);
    } catch {
      // 다음 차례에 다시 만난다. 한 파일 때문에 나머지를 못 지우게 두지 않는다.
    }
  }
}

/** 지금 받아 둔 사진이 얼마나 되는지. 설정 화면의 「사진 캐시 N」이 이것을 쓴다. */
export async function photoCacheUsage(): Promise<PhotoCacheUsage> {
  const 훑은_것 = 훑기();
  if (!훑은_것) return 빈_것;
  return cacheBytesOf(훑은_것.목록, DISPLAY_REVISION);
}

/**
 * 받아 둔 사진을 모두 지운다. 비운 만큼을 돌려준다.
 *
 * 기기에서 고른 원본은 남는다 — 아직 못 올린 사진이면 이 파일이 하나뿐이다. 지운 것은
 * 다음에 그 사진을 볼 때 다시 받는다.
 */
export async function clearPhotoCache(): Promise<PhotoCacheUsage> {
  const 훑은_것 = 훑기();
  if (!훑은_것) return 빈_것;
  const 지울_것 = 훑은_것.목록.filter((하나) => cacheKindOf(하나.name, DISPLAY_REVISION) !== "내것");
  지우기(훑은_것.폴더, 지울_것.map((하나) => 하나.name));
  return { bytes: 지울_것.reduce((합, 하나) => 합 + 하나.bytes, 0), files: 지울_것.length };
}

/**
 * 상한을 넘으면 오래된 것부터 지운다. 지운 만큼을 돌려준다.
 *
 * 쓰는 곳이 없는 것(옛 판 표시본, 저장이 끊겨 남은 원본 사본)은 상한과 상관없이 지운다.
 */
export async function sweepPhotoCache(limitBytes = PHOTO_CACHE_LIMIT): Promise<PhotoCacheUsage> {
  const 훑은_것 = 훑기();
  if (!훑은_것) return 빈_것;
  const 셈 = planPhotoSweep(훑은_것.목록, limitBytes, DISPLAY_REVISION);
  if (!셈.remove.length) return 빈_것;
  지우기(훑은_것.폴더, 셈.remove);
  return { bytes: 셈.freed, files: 셈.remove.length };
}

/** 마지막으로 쓸어낸 시각. 사진을 받을 때마다 폴더를 다 훑으면 그것이 더 비싸다. */
let 쓸어낸_때 = 0;
let 쓰는_중: Promise<PhotoCacheUsage> | null = null;
/** 다시 훑기까지 두는 시간(ms). 사진 200장을 몰아 받아도 한 번이면 된다. */
const 쓸어내는_간격 = 3 * 60 * 1000;

/**
 * 사진을 받은 뒤 부른다. 뜸하게 한 번씩만 실제로 훑는다.
 *
 * 받을 때마다 정리하면 폴더를 훑는 값이 받는 값보다 커진다. 상한을 조금 넘긴 채로 몇 분
 * 두는 것은 괜찮다.
 */
export function maybeSweepPhotoCache(): void {
  if (Platform.OS === "web" || 쓰는_중) return;
  const 지금 = Date.now();
  if (지금 - 쓸어낸_때 < 쓸어내는_간격) return;
  쓸어낸_때 = 지금;
  쓰는_중 = sweepPhotoCache()
    .catch(() => 빈_것)
    .finally(() => {
      쓰는_중 = null;
    });
}
