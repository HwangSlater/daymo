/**
 * 추억 카드의 완성 이미지를 서버에 올리고 받는다.
 *
 * 카드는 기기가 사진 원본으로 그린다. 그런데 사진 원본은 올린 지 30일 뒤 서버에서
 * 지워져서, 그 뒤에는 원본 화질로 다시 그릴 수 없다. 그래서 「완료」할 때 원본으로
 * 그린 그림을 서버에 한 장 올려 두고(`PUT /v1/trip-cards/{id}/image?version=N`), 나중에
 * 공유·저장할 때는 카드가 그 뒤로 바뀌지 않았으면(`imageVersion === version`) 그 그림을
 * 받아 쓴다. 서버는 JPEG 로 바꿔 둔다.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { apiUrlOf, DaymoApiError, withAccessToken } from "./auth";
import { sendQueued } from "./requestQueue";
import type { ServerTripCard } from "./serverData";

const CARD_DIRECTORY = "trip-cards";

/** 완성본(가로 2160)과 작은 사본(긴 변 1080). 작은 사본은 격자를 띄울 때 미리 받아 두는 것이다. */
export type CardImageSize = "full" | "small";

/** 웹에서 받아 둔 blob 주소. 폰은 캐시 폴더의 파일이 그 몫을 한다. */
const 웹_캐시 = new Map<string, string>();

const cacheKeyOf = (cardId: string, version: number, size: CardImageSize) =>
  `${cardId}-v${version}${size === "small" ? "-small" : ""}`;

const contentTypeOf = (uri: string) =>
  uri.startsWith("data:image/jpeg") || /\.jpe?g(\?|$)/i.test(uri) ? "image/jpeg" : "image/png";

/** 저장된 그림이 지금 카드와 같은지. 카드를 고치면 버전이 올라가 옛 그림이 된다. */
export const hasFreshCardImage = (row: Pick<ServerTripCard, "version" | "imageVersion"> | undefined) =>
  Boolean(row && row.imageVersion != null && row.imageVersion === row.version);

/**
 * 그린 카드를 올린다. `version` 은 그린 카드의 버전이다. 그사이 누가 카드를 고쳤으면
 * 서버가 409 로 막는다(옛 그림이 새 카드 자리에 들어가지 않게).
 */
export async function uploadCardImage(cardId: string, version: number, uri: string): Promise<ServerTripCard> {
  const url = apiUrlOf(`/v1/trip-cards/${encodeURIComponent(cardId)}/image?version=${version}`);
  return withAccessToken((accessToken) => sendQueued(async () => {
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": contentTypeOf(uri) };
    let status: number;
    let text: string;
    try {
      if (Platform.OS === "web" || uri.startsWith("data:")) {
        const response = await fetch(url, { method: "PUT", headers, body: await (await fetch(uri)).blob() });
        status = response.status;
        text = await response.text();
      } else {
        const response = await FileSystem.uploadAsync(url, uri, {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers,
        });
        status = response.status;
        text = response.body;
      }
    } catch {
      throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
    }
    if (status < 200 || status >= 300) throw new DaymoApiError("카드 이미지를 저장하지 못했어요.", status);
    return (JSON.parse(text) as { data: ServerTripCard }).data;
  }, { safe: true, background: true }));
}

/**
 * 저장된 카드 그림을 받는다. 폰은 캐시 폴더의 파일, 웹은 blob: 주소다.
 *
 * 한 번 받은 것은 두고 다시 받지 않는다(2026-09-23). 그림은 카드 버전마다 파일이 달라서
 * 같은 버전이면 같은 파일이다. 새 버전을 받으면 그 카드의 옛 버전 파일은 지운다. 카드가
 * 늘어도 받는 양은 열어 본 만큼이다 — 격자를 띄울 때는 작은 사본만 미리 받는다
 * (`prefetchCardImage`).
 */
export async function downloadCardImage(
  cardId: string,
  version: number,
  size: CardImageSize = "full",
): Promise<string | undefined> {
  const url = apiUrlOf(`/v1/trip-cards/${encodeURIComponent(cardId)}/image?size=${size}&v=${version}`);
  const key = cacheKeyOf(cardId, version, size);
  if (Platform.OS === "web") {
    const 있는_것 = 웹_캐시.get(key);
    if (있는_것) return 있는_것;
    return withAccessToken((accessToken) => sendQueued(async () => {
      let response: Response;
      try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      } catch {
        throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
      }
      if (!response.ok) throw new DaymoApiError("카드 이미지를 불러오지 못했어요.", response.status);
      const uri = URL.createObjectURL(await response.blob());
      웹_캐시.set(key, uri);
      return uri;
    }, { safe: true }));
  }
  if (!FileSystem.cacheDirectory) return undefined;
  const folder = `${FileSystem.cacheDirectory}${CARD_DIRECTORY}/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const target = `${folder}${key}.jpg`;
  if ((await FileSystem.getInfoAsync(target).catch(() => ({ exists: false }))).exists) return target;
  return withAccessToken((accessToken) => sendQueued(async () => {
    let status: number;
    try {
      status = (await FileSystem.downloadAsync(url, target, { headers: { Authorization: `Bearer ${accessToken}` } })).status;
    } catch {
      throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
    }
    if (status < 200 || status >= 300) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
      throw new DaymoApiError("카드 이미지를 불러오지 못했어요.", status);
    }
    void 옛_버전_지우기(folder, cardId, version);
    return target;
  }, { safe: true }));
}

/** 같은 카드의 다른 버전 파일을 지운다. 카드를 고칠 때마다 쌓이지 않게 한다. */
async function 옛_버전_지우기(folder: string, cardId: string, version: number): Promise<void> {
  const 이름들 = await FileSystem.readDirectoryAsync(folder).catch(() => [] as string[]);
  const 남길_앞 = `${cardId}-v${version}`;
  await Promise.all(
    이름들
      .filter((이름) => 이름.startsWith(`${cardId}-v`) && !이름.startsWith(`${남길_앞}.`) && !이름.startsWith(`${남길_앞}-`))
      .map((이름) => FileSystem.deleteAsync(`${folder}${이름}`, { idempotent: true }).catch(() => undefined)),
  );
}

/**
 * 작은 사본을 미리 받아 둔다. 격자에 보이는 카드와 크게 볼 때의 양옆 카드가 대상이다.
 * 못 받아도 그만이다 — 열 때 다시 받는다.
 */
export async function prefetchCardImage(cardId: string, version: number): Promise<string | undefined> {
  return downloadCardImage(cardId, version, "small").catch(() => undefined);
}

/**
 * 이 카드의 받아 둔 그림을 모두 버린다. 새 그림을 올린 뒤에 부른다 — 같은 버전 번호로 그림만
 * 바뀌는 때가 있어서(그 기능 전에 만든 카드에 그림을 만들어 올릴 때), 버전만 보면 옛 그림을 쓴다.
 */
export async function forgetCardImage(cardId: string): Promise<void> {
  for (const key of [...웹_캐시.keys()]) {
    if (key.startsWith(`${cardId}-v`)) 웹_캐시.delete(key);
  }
  if (Platform.OS === "web" || !FileSystem.cacheDirectory) return;
  const folder = `${FileSystem.cacheDirectory}${CARD_DIRECTORY}/`;
  const 이름들 = await FileSystem.readDirectoryAsync(folder).catch(() => [] as string[]);
  await Promise.all(
    이름들
      .filter((이름) => 이름.startsWith(`${cardId}-v`))
      .map((이름) => FileSystem.deleteAsync(`${folder}${이름}`, { idempotent: true }).catch(() => undefined)),
  );
}

/**
 * 다 쓴 그림. 이제는 받아 둔 것을 두고 쓰므로 지우지 않는다. 옛 버전은 새 버전을 받을 때
 * 지우고, 캐시 폴더는 기기가 알아서 비운다. 부르는 자리를 남겨 두는 것은 웹의 blob 주소도
 * 같은 이름으로 다루기 위해서다.
 */
export function releaseCardImage(_uri: string): void {}
