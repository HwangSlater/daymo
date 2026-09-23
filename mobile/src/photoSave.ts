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
import { isSavedOriginalCopy, releaseDownloadedPhoto } from "./photoTransfer";

/**
 * 웹에서 내려받기를 걸어 놓고 blob 주소를 풀기까지 기다리는 시간(ms).
 *
 * 누르자마자 풀면 브라우저가 내려받기를 시작하기 전에 주소가 죽어 파일이 0바이트가 된다.
 * 넉넉히 기다렸다 푼다.
 */
const WEB_RELEASE_DELAY = 15_000;

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
    // 저장하려고 받아 온 주소는 이 한 번을 위해 만든 것이다. 내려받기가 걸린 뒤에 푼다.
    // 풀지 않으면 저장할 때마다 사진 한 장이 탭 메모리에 그대로 남는다(2026-09-23 검토 #7).
    setTimeout(() => releaseDownloadedPhoto(uri), WEB_RELEASE_DELAY);
    return "saved";
  }
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  // 받아 둔 파일은 이름이 `server-<id>.jpg` 라 그대로 넘기면 공유 시트에 낯선 이름이 뜬다.
  // 보기 좋은 이름으로 한 벌 옮겨 놓고 넘긴다. 캐시 폴더라 저장 공간이 모자라면 OS 가 비운다.
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  new File(uri).copy(file);
  try {
    await Sharing.shareAsync(file.uri, { mimeType: "image/jpeg", UTI: "public.jpeg", dialogTitle: name });
  } finally {
    /*
     * 저장하려고 받아 온 원본을 버린다(2026-09-23 검토 #6).
     *
     * 원본은 한 장에 몇 MB 인데 문서 폴더에 영원히 남아 있었다. 사진첩에서 스무 장을
     * 골라 저장하면 그만큼이 그대로 쌓인다. 넘긴 것은 위의 캐시 사본이라 여기서 원본을
     * 지워도 공유받은 앱이 읽는 데는 지장이 없다. 표시본·썸네일은 화면이 쓰고 있어
     * 건드리지 않는다(`isSavedOriginalCopy`).
     */
    if (isSavedOriginalCopy(uri)) releaseDownloadedPhoto(uri);
  }
  return "saved";
}
