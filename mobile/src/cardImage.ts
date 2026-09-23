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
 * 다 쓰면 `releaseCardImage` 로 버린다.
 */
export async function downloadCardImage(cardId: string, version: number): Promise<string | undefined> {
  const url = apiUrlOf(`/v1/trip-cards/${encodeURIComponent(cardId)}/image?v=${version}`);
  if (Platform.OS === "web") {
    return withAccessToken((accessToken) => sendQueued(async () => {
      let response: Response;
      try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      } catch {
        throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
      }
      if (!response.ok) throw new DaymoApiError("카드 이미지를 불러오지 못했어요.", response.status);
      return URL.createObjectURL(await response.blob());
    }, { safe: true }));
  }
  if (!FileSystem.cacheDirectory) return undefined;
  const folder = `${FileSystem.cacheDirectory}${CARD_DIRECTORY}/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const target = `${folder}${cardId}-v${version}.jpg`;
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
    return target;
  }, { safe: true }));
}

export function releaseCardImage(uri: string): void {
  if (uri.startsWith("blob:")) {
    // 웹은 내려받기 링크를 누른 직후라 바로 지우면 받기가 끊길 수 있다. 조금 뒤에 지운다.
    setTimeout(() => URL.revokeObjectURL(uri), 30_000);
    return;
  }
  if (Platform.OS !== "web") FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
