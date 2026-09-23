import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { photoFileName } from "./filenames";
import { notePhotoFile, PHOTO_DIRECTORY } from "./photoCache";

/**
 * 사진 고르기가 돌려준 자리를 앱이 계속 읽을 수 있는 자리로 옮긴다.
 *
 * 사진 고르기는 앱의 캐시 폴더에 사본을 만들어 그 자리를 돌려준다. 캐시는
 * 기기 저장 공간이 모자라면 OS 가 비우는 곳이라, 그 자리를 그대로 적어 두면
 * 나중에 기록 탭에 깨진 사진만 남는다. 문서 폴더로 복사해 두면 남는다.
 *
 * 웹은 자리 대신 data URI 를 쓰므로 그대로 돌려준다. 복사에 실패해도 원래
 * 자리를 돌려준다. 지금 화면에서는 보이고, 나중에 안 보일 뿐이다.
 *
 * 여기서 만든 파일은 **캐시가 아니다.** 아직 못 올린 사진이면 세상에 이 파일 하나뿐이라,
 * 용량 정리(`photoCache`)가 건드리지 않는다. 이름이 `server-` 로 시작하지 않는 것으로
 * 가른다(`photoCachePlan.cacheKindOf`).
 */
export async function keepTripPhoto(uri: string): Promise<string> {
  if (Platform.OS === "web" || uri.startsWith("data:")) return uri;
  try {
    const folder = new Directory(Paths.document, PHOTO_DIRECTORY);
    if (!folder.exists) folder.create({ intermediates: true });
    const source = new File(uri);
    const target = new File(folder, `${Date.now()}-${photoFileName(uri)}`);
    await source.copy(target);
    notePhotoFile(target.uri, true);
    return target.uri;
  } catch {
    return uri;
  }
}
