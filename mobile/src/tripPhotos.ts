import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

/** 고른 사진을 옮겨 두는 폴더. 문서 폴더라 OS 가 지우지 않는다. */
const PHOTO_DIRECTORY = "trip-photos";

/**
 * 사진 고르기가 돌려준 자리를 앱이 계속 읽을 수 있는 자리로 옮긴다.
 *
 * 사진 고르기는 앱의 캐시 폴더에 사본을 만들어 그 자리를 돌려준다. 캐시는
 * 기기 저장 공간이 모자라면 OS 가 비우는 곳이라, 그 자리를 그대로 적어 두면
 * 나중에 기록 탭에 깨진 사진만 남는다. 문서 폴더로 복사해 두면 남는다.
 *
 * 웹은 자리 대신 data URI 를 쓰므로 그대로 돌려준다. 복사에 실패해도 원래
 * 자리를 돌려준다. 지금 화면에서는 보이고, 나중에 안 보일 뿐이다.
 */
export async function keepTripPhoto(uri: string): Promise<string> {
  if (Platform.OS === "web" || uri.startsWith("data:")) return uri;
  try {
    const folder = new Directory(Paths.document, PHOTO_DIRECTORY);
    if (!folder.exists) folder.create({ intermediates: true });
    const source = new File(uri);
    const target = new File(folder, `${Date.now()}-${photoFileName(uri)}`);
    await source.copy(target);
    return target.uri;
  } catch {
    return uri;
  }
}

/** 원래 이름을 살리되 폴더 구분자와 물음표 뒤는 버린다. 확장자가 없으면 jpg 로 본다. */
function photoFileName(uri: string): string {
  const last = uri.split("?")[0].split("/").pop() ?? "";
  const cleaned = last.replace(/[\\/:*?"<>|]/g, "").trim();
  if (!cleaned) return "photo.jpg";
  return /\.[a-z0-9]{2,5}$/i.test(cleaned) ? cleaned : `${cleaned}.jpg`;
}
