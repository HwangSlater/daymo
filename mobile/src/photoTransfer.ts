/**
 * 사진 파일을 서버로 올리고 서버에서 받는다.
 *
 * 올리기: 파일을 읽어 크기와 SHA-256 을 세고, 사진 줄을 만든 뒤(`POST`), 파일을 그대로
 * 보낸다(`PUT .../content`). 폰에서는 파일을 JS 로 옮기지 않고 네이티브가 보낸다.
 * 받기: 표시본(긴 변 1440px)을 문서 폴더에 받아 둔다. 다시 열 때 서버에 묻지 않는다.
 *
 * 웹(개발용 빌드)은 파일 대신 data URI 를 쓴다. 받은 사진은 기기에 두지 않는다.
 */

import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { apiUrlOf, DaymoApiError, withAccessToken } from "./auth";
import { createPhoto } from "./serverData";
import type { ServerPhoto } from "./photoSync";

const PHOTO_DIRECTORY = "trip-photos";

async function bytesOf(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web" || uri.startsWith("data:")) {
    return (await fetch(uri)).arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

const contentTypeOf = (uri: string) => {
  const found = uri.match(/^data:([^;,]+)/)?.[1] ?? uri.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (found === "png" || found === "image/png") return "image/png";
  if (found === "webp" || found === "image/webp") return "image/webp";
  return "image/jpeg";
};

/** 서버 오류 응답을 앱의 오류로. `fetch` 가 아닌 길로 받은 본문도 같은 모양이다. */
function errorOf(status: number, text: string): DaymoApiError {
  try {
    const body = JSON.parse(text) as { error?: { message?: string; code?: string; fields?: Record<string, string> } };
    return new DaymoApiError(body.error?.message || "사진을 올리지 못했어요.", status, body.error?.code, body.error?.fields);
  } catch {
    return new DaymoApiError("사진을 올리지 못했어요.", status);
  }
}

async function sendContent(photoId: string, uri: string): Promise<ServerPhoto> {
  const url = apiUrlOf(`/v1/photos/${encodeURIComponent(photoId)}/content`);
  const contentType = contentTypeOf(uri);
  return withAccessToken(async (accessToken) => {
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType };
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
    if (status < 200 || status >= 300) throw errorOf(status, text);
    return (JSON.parse(text) as { data: ServerPhoto }).data;
  });
}

/**
 * 사진 한 장을 올린다. 이미 올라간 id 면 파일을 다시 보내지 않는다.
 *
 * 줄은 만들었는데 파일이 끊겼으면 다음에 같은 id 로 부를 때 파일만 다시 간다.
 */
export async function uploadPhoto(
  tripId: string,
  photoId: string,
  uri: string,
  fields: { caption: string | null; date: string | null; isReceipt?: boolean },
): Promise<ServerPhoto> {
  let buffer: ArrayBuffer;
  try {
    buffer = await bytesOf(uri);
  } catch {
    throw new DaymoApiError("사진 파일을 찾지 못했어요. 사진을 다시 골라 주세요.", 422, "VALIDATION_ERROR");
  }
  const checksum = hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buffer));
  const reserved = await createPhoto(tripId, photoId, { ...fields, bytes: buffer.byteLength, checksum });
  if (reserved.status === "ready") return reserved;
  return sendContent(photoId, uri);
}

// 웹에서 이번 탭이 만든 사진 주소. blob: 주소는 탭을 새로 열면 죽는다.
const liveBlobUris = new Set<string>();

/**
 * 지금 화면에 띄울 수 있는 사진 주소인지. 웹은 사진을 브라우저 저장소에 넣지 않고
 * blob: 주소로만 들고 있어서, 새로 연 탭에 남은 옛 blob: 주소는 다시 받아야 한다.
 */
export const isLivePhotoUri = (uri: string | undefined): uri is string =>
  Boolean(uri) && (!uri!.startsWith("blob:") || liveBlobUris.has(uri!));

/**
 * 서버 사진의 표시본을 받아 둔다. 받은 자리를 돌려준다.
 *
 * 폰은 문서 폴더에 파일로 둔다. 웹은 메모리에만 두고 blob: 주소를 준다. 브라우저 저장소는
 * 몇 MB 뿐이라 사진을 넣으면 여행 기록 저장이 먼저 막힌다.
 */
export async function downloadPhoto(photoId: string): Promise<string | undefined> {
  const url = apiUrlOf(`/v1/photos/${encodeURIComponent(photoId)}/content?variant=display`);
  if (Platform.OS === "web") {
    return withAccessToken(async (accessToken) => {
      let response: Response;
      try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      } catch {
        throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
      }
      if (!response.ok) throw new DaymoApiError("사진을 받지 못했어요.", response.status);
      const uri = URL.createObjectURL(await response.blob());
      liveBlobUris.add(uri);
      return uri;
    });
  }
  if (!FileSystem.documentDirectory) return undefined;
  const folder = `${FileSystem.documentDirectory}${PHOTO_DIRECTORY}/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const target = `${folder}server-${photoId}.jpg`;
  return withAccessToken(async (accessToken) => {
    let status: number;
    try {
      status = (await FileSystem.downloadAsync(url, target, { headers: { Authorization: `Bearer ${accessToken}` } })).status;
    } catch {
      throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
    }
    if (status < 200 || status >= 300) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
      throw new DaymoApiError("사진을 받지 못했어요.", status);
    }
    return target;
  });
}
