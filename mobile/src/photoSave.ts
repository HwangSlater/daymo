/**
 * 받아 둔 사진을 사용자의 기기에 저장한다.
 *
 * 폰은 OS 공유 시트에 넘긴다. 거기 「이미지 저장」이 있어서 사진첩 권한을 새로 묻지
 * 않아도 된다. 권한 문구를 하나 더 늘리지 않으려고 `expo-media-library` 를 들이지
 * 않았다(docs/development/08-privacy-and-release-compliance.md 5장과 같은 이유다).
 * 웹은 공유 시트가 없어서 브라우저가 내려받게 한다(기념 카드 내보내기와 같은 갈림이다).
 *
 * 그리는 쪽과 떼어 둔다. 이 파일만 네이티브를 들여온다.
 */

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { safeFileName } from "./filenames";

/**
 * 사진 한 장을 기기에 저장한다.
 *
 * @param uri 이미 받아 둔 자리(`photoTransfer.downloadPhoto`). 웹은 blob: 주소다.
 * @param name 저장할 이름. 확장자는 여기서 붙인다.
 */
export async function savePhotoFile(uri: string, name: string): Promise<"saved" | "unavailable"> {
  const fileName = `${safeFileName(name, "여행 사진")}.jpg`;
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return "unavailable";
    const link = document.createElement("a");
    link.href = uri;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return "saved";
  }
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  // 받아 둔 파일은 이름이 `server-<id>.jpg` 라 그대로 넘기면 공유 시트에 낯선 이름이 뜬다.
  // 보기 좋은 이름으로 한 벌 옮겨 놓고 넘긴다.
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  new File(uri).copy(file);
  await Sharing.shareAsync(file.uri, { mimeType: "image/jpeg", UTI: "public.jpeg", dialogTitle: name });
  return "saved";
}
