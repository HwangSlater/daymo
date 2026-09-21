/**
 * 사진 파일을 서버로 올리고 서버에서 받는다.
 *
 * 올리기: 파일을 읽어 크기와 SHA-256 을 세고, 사진 줄을 만든 뒤(`POST`), 파일을 그대로
 * 보낸다(`PUT .../content`). 폰에서는 파일을 JS 로 옮기지 않고 네이티브가 보낸다.
 * 받기: 표시본(긴 변 1440px)을 문서 폴더에 받아 둔다. 다시 열 때 서버에 묻지 않는다.
 *
 * 웹(개발용 빌드)은 파일 대신 data URI 를 쓴다. 받은 사진은 기기에 두지 않는다.
 *
 * 사진은 한 화면에도 수십 장이라 앞단 제한에 가장 먼저 걸린다. 그래서 파일 길도 목록과
 * 같은 줄(`requestQueue`)을 탄다. 줄 밖으로 새는 요청이 하나라도 있으면 묶는 뜻이 없다.
 */

import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { apiUrlOf, DaymoApiError, withAccessToken } from "./auth";
import { sendQueued } from "./requestQueue";
import { createPhoto } from "./serverData";
import type { PhotoBody, ServerPhoto } from "./photoSync";

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
  // 같은 파일을 같은 주소에 다시 놓는 PUT 이라 다시 보내도 결과가 같다.
  //
  // 줄 맨 뒤에 선다(`background`). 여행이 끝나면 사진을 수십 장씩 한꺼번에 올리는데,
  // 그동안 보고 있는 화면의 목록과 썸네일이 사진 파일 뒤에서 기다리면 앱이 멈춘 것처럼
  // 보인다. 올리기는 아무도 화면에서 기다리지 않는 일이다.
  return withAccessToken((accessToken) => sendQueued(async () => {
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
  }, { safe: true, background: true }));
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
  fields: Partial<PhotoBody> & { caption: string | null; date: string | null; isReceipt?: boolean },
): Promise<ServerPhoto> {
  let buffer: ArrayBuffer;
  try {
    buffer = await bytesOf(uri);
  } catch {
    throw new DaymoApiError("사진을 불러오지 못했어요. 다시 골라 주세요.", 422, "VALIDATION_ERROR");
  }
  const checksum = hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buffer));
  const reserved = await createPhoto(tripId, photoId, {
    ...fields, links: fields.links ?? [], bytes: buffer.byteLength, checksum,
  }, { background: true });
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
 * 서버 사진을 받아 둔다. 받은 자리를 돌려준다.
 *
 * 폰은 문서 폴더에 파일로 둔다. 웹은 메모리에만 두고 blob: 주소를 준다. 브라우저 저장소는
 * 몇 MB 뿐이라 사진을 넣으면 여행 기록 저장이 먼저 막힌다.
 *
 * `variant` 는 기본이 표시본(긴 변 1440px)이다. 홈의 여행 카드처럼 작게 깔리고 여러 장을
 * 한꺼번에 받는 자리는 썸네일(480px)을 받는다. 표시본을 여럿 받으면 카드를 넘길 때 걸린다.
 */
export async function downloadPhoto(
  photoId: string,
  variant: "display" | "thumbnail" | "original" = "display",
): Promise<string | undefined> {
  const url = apiUrlOf(`/v1/photos/${encodeURIComponent(photoId)}/content?variant=${variant}`);
  if (Platform.OS === "web") {
    return withAccessToken((accessToken) => sendQueued(async () => {
      let response: Response;
      try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      } catch {
        throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
      }
      if (!response.ok) throw new DaymoApiError("사진을 불러오지 못했어요.", response.status);
      const uri = URL.createObjectURL(await response.blob());
      liveBlobUris.add(uri);
      return uri;
    }, { safe: true }));
  }
  if (!FileSystem.documentDirectory) return undefined;
  const folder = `${FileSystem.documentDirectory}${PHOTO_DIRECTORY}/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const target = `${folder}server-${photoId}${variant === "display" ? "" : `-${variant}`}.jpg`;
  return withAccessToken((accessToken) => sendQueued(async () => {
    let status: number;
    try {
      status = (await FileSystem.downloadAsync(url, target, { headers: { Authorization: `Bearer ${accessToken}` } })).status;
    } catch {
      throw new DaymoApiError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
    }
    if (status < 200 || status >= 300) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
      throw new DaymoApiError("사진을 불러오지 못했어요.", status);
    }
    return target;
  }, { safe: true }));
}

/**
 * 잠깐 쓰려고 받은 사진을 버린다. 원본은 몇 MB 라서 들고 있을 까닭이 없다.
 *
 * 화면이 쓰고 있는 주소는 넘기지 않는다. 지우면 그 자리에 빈 칸이 남는다
 * (`downloadPhotoToSave` 가 원본이 없어 표시본을 돌려준 경우가 그렇다).
 */
export function releaseDownloadedPhoto(uri: string): void {
  if (Platform.OS === "web") {
    liveBlobUris.delete(uri);
    if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
    return;
  }
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

/**
 * 기기에 저장하려고 받는다. 원본이 아직 있으면 원본을, 없으면 표시본(긴 변 1440px)을 준다.
 *
 * 원본은 올린 지 30일까지만 서버에 남는다. 기한이 지나면 서버가 410 으로 답하는데,
 * 그때 오류를 내지 않고 표시본으로 저장한다. 받을 수 있는 가장 큰 그림을 주는 것이 맞다.
 */
export async function downloadPhotoToSave(
  photoId: string,
  hasOriginal: boolean,
): Promise<{ uri: string; original: boolean } | undefined> {
  if (hasOriginal) {
    try {
      const uri = await downloadPhoto(photoId, "original");
      if (uri) return { uri, original: true };
    } catch (caught) {
      if (!(caught instanceof DaymoApiError) || caught.status !== 410) throw caught;
    }
  }
  const uri = await downloadPhoto(photoId, "display");
  return uri ? { uri, original: false } : undefined;
}
