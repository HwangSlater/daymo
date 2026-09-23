/**
 * 사진 썸네일(480px)을 받아 두는 한 자리.
 *
 * 예전에는 사진첩(`PhotoGallery`)과 추억 카드(`TripCards`)가 각자 받아 두어, 같은 사진을
 * 두 번 받고 웹에서는 blob 주소가 두 벌씩 쌓였다(2026-09-23 검토 #7). 여기 하나로 모은다.
 *
 * 지키는 것 셋.
 *   1. 한꺼번에 셋까지만 받는다. 요청 줄(`requestQueue`)이 다섯이라 그보다 적게 잡아
 *      보고 있는 화면의 목록·사진이 썸네일 뒤에서 기다리지 않게 한다.
 *   2. 화면에서 사라진 칸의 부탁은 받지 않고 흘린다. 수백 장을 빠르게 훑어 내리면
 *      지나친 것을 다 받느라 지금 보는 칸이 한참 뒤에 뜬다.
 *   3. 들고 있는 수에 상한을 둔다. 넘치면 **아무도 안 보고 있는** 것부터 버린다.
 *      웹은 그때 blob 주소를 풀어 준다(폰은 파일이라 그대로 둔다 — 홈 카드도 같은
 *      파일을 쓰고 있어 지우면 그쪽이 깨진다).
 *
 * 못 받은 사진은 기억해 두고 스스로 다시 받지 않는다. 칸에 「불러오지 못했어요」를 띄우고
 * 사람이 다시 시도를 누를 때만 다시 받는다(2026-09-23 검토 #52).
 */

import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { downloadPhoto, releaseDownloadedPhoto } from "./photoTransfer";

/** 한꺼번에 받는 수. */
const 일꾼_최대 = 3;
/**
 * 메모리에 들고 있을 썸네일 수의 상한.
 *
 * 480px 짜리라 한 장이 50KB 안팎이다. 240장이면 12MB 남짓으로, 여행을 몇 개 넘나들어도
 * 모바일 브라우저가 탭을 되살리지 않는 선이다.
 */
const 상한 = 240;

/** 받아 둔 것. `Map` 은 넣은 차례를 지켜서 가장 오래된 것부터 버릴 수 있다. */
const 받은_것 = new Map<string, string>();
/** 못 받은 것. 사람이 다시 시도할 때까지 다시 받지 않는다. */
const 못_받은_것 = new Set<string>();
/** 지금 화면에 이 썸네일을 쓰고 있는 칸 수. 0 인 것만 버린다. */
const 쓰는_수 = new Map<string, number>();
/** 받기를 기다리는 사진과, 끝나면 알려 줄 칸들. */
const 기다림 = new Map<string, Set<(uri: string | undefined) => void>>();
const 줄: string[] = [];
let 일꾼 = 0;

function 자리_비우기(방금_넣은: string) {
  if (받은_것.size <= 상한) return;
  for (const [id, uri] of 받은_것) {
    if (받은_것.size <= 상한) return;
    if (id === 방금_넣은 || (쓰는_수.get(id) ?? 0) > 0) continue;
    받은_것.delete(id);
    // 폰의 파일은 그대로 둔다. 같은 파일을 홈 카드(`WarmAppShell`)도 쓰고 있어,
    // 여기서 지우면 그 칸이 빈 자리가 된다. 웹의 blob 만 풀어 준다.
    if (Platform.OS === "web") releaseDownloadedPhoto(uri);
  }
}

function 일하기() {
  while (일꾼 < 일꾼_최대 && 줄.length) {
    const id = 줄.shift() as string;
    // 그새 칸이 화면 밖으로 나가 기다리는 이가 없으면 받지 않는다.
    if (!기다림.get(id)?.size) {
      기다림.delete(id);
      continue;
    }
    일꾼 += 1;
    downloadPhoto(id, "thumbnail")
      .catch(() => undefined)
      .then((uri) => {
        const 칸들 = 기다림.get(id);
        기다림.delete(id);
        if (uri) {
          받은_것.set(id, uri);
          못_받은_것.delete(id);
          자리_비우기(id);
        } else {
          못_받은_것.add(id);
        }
        칸들?.forEach((알림) => 알림(uri));
      })
      .finally(() => {
        일꾼 -= 1;
        일하기();
      });
  }
}

/** 썸네일을 부탁한다. 돌려주는 함수를 부르면 부탁을 거둔다. */
function 부탁(id: string, 받음: (uri: string | undefined) => void): () => void {
  let 칸들 = 기다림.get(id);
  if (!칸들) {
    칸들 = new Set();
    기다림.set(id, 칸들);
    줄.push(id);
  }
  칸들.add(받음);
  일하기();
  return () => {
    기다림.get(id)?.delete(받음);
  };
}

/** 이 사진을 지금 화면이 쓰고 있다고 알린다. 쓰는 동안에는 버리지 않는다. */
function 잡기(id: string) {
  쓰는_수.set(id, (쓰는_수.get(id) ?? 0) + 1);
}

function 놓기(id: string) {
  const 남은 = (쓰는_수.get(id) ?? 1) - 1;
  if (남은 > 0) 쓰는_수.set(id, 남은);
  else 쓰는_수.delete(id);
}

/** 못 받은 기억을 지우고 다시 받는다. 화면의 「다시 시도」가 부른다. */
export function retryThumbnails(ids: readonly string[]): void {
  ids.forEach((id) => 못_받은_것.delete(id));
}

/**
 * 칸 하나에 깔 썸네일.
 *
 * @param uploaded 서버에 다 올라가 받을 수 있는 사진인지. 아직 이 기기에만 있는 사진은
 *   받을 곳이 없어 가진 파일(`localUri`)을 그대로 쓴다.
 */
export function usePhotoThumb(
  id: string,
  uploaded: boolean,
  localUri: string | undefined,
): { uri: string | undefined; failed: boolean; retry: () => void } {
  /**
   * 받았다는(또는 못 받았다는) 소식.
   *
   * 값 자체는 위의 `받은_것` 에서 그릴 때 바로 읽는다. 상태로 한 벌 더 들고 있으면 칸이
   * 다른 사진으로 바뀔 때 앞 사진이 한 프레임 비친다. 그래서 어느 사진의 소식인지 함께 든다.
   */
  const [소식, 소식_두기] = useState<{ id: string; 실패: boolean } | null>(null);
  /** 「다시 시도」를 누른 횟수. 올리면 아래 effect 가 다시 부탁한다. */
  const [다시, 다시_두기] = useState(0);
  useEffect(() => {
    if (!uploaded) return;
    잡기(id);
    // 이미 받았거나 이미 실패해 멈춘 것은 부탁하지 않는다.
    const 거두기 = 받은_것.has(id) || 못_받은_것.has(id)
      ? undefined
      : 부탁(id, (uri) => 소식_두기({ id, 실패: !uri }));
    return () => {
      거두기?.();
      놓기(id);
    };
  }, [id, uploaded, 다시]);
  const 받은 = uploaded ? 받은_것.get(id) : undefined;
  const 이번_소식 = 소식?.id === id ? 소식 : null;
  return {
    uri: uploaded ? 받은 : localUri,
    failed: uploaded && !받은 && (이번_소식?.실패 ?? 못_받은_것.has(id)),
    retry: () => {
      retryThumbnails([id]);
      소식_두기(null);
      다시_두기((번) => 번 + 1);
    },
  };
}

/**
 * 여러 장을 한꺼번에. 추억 카드처럼 한 화면에 카드 여러 장을 그릴 때 쓴다.
 *
 * 받은 것만 담아 돌려준다. 아직 못 받은 사진은 부르는 쪽이 제 사진 주소를 쓴다.
 *
 * @param 다시 「다시 시도」를 누른 횟수. 올리면 못 받은 기억을 지운 뒤 다시 부탁한다.
 */
export function usePhotoThumbs(ids: readonly string[], 다시 = 0): Record<string, string> {
  const 열쇠 = ids.join("|");
  const [받은, 받은_두기] = useState<Record<string, string>>({});
  useEffect(() => {
    const 목록 = 열쇠.split("|").filter(Boolean);
    if (!목록.length) return;
    // 목록에 든 동안에는 버리지 않는다. 카드가 화면에 있는 내내 쓰는 그림이다.
    목록.forEach(잡기);
    const 거두기 = 목록
      .filter((id) => !받은_것.has(id) && !못_받은_것.has(id))
      .map((id) => 부탁(id, (uri) => {
        if (uri) 받은_두기((지금) => ({ ...지금, [id]: uri }));
      }));
    return () => {
      거두기.forEach((하나) => 하나());
      목록.forEach(놓기);
    };
  }, [열쇠, 다시]);
  return useMemo(() => {
    const 것: Record<string, string> = {};
    for (const id of 열쇠.split("|")) {
      // 받아 둔 자리가 먼저다. 다른 화면이 이미 받아 뒀으면 기다릴 것 없이 그린다.
      const uri = id ? 받은_것.get(id) ?? 받은[id] : undefined;
      if (uri) 것[id] = uri;
    }
    return 것;
  }, [열쇠, 받은]);
}
