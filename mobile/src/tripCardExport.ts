/**
 * 다 그린 기념 카드를 그림 파일로 내보낸다.
 *
 * `react-native-view-shot` 이 찍은 결과를 받는다. 폰은 임시 파일 자리를, 웹은
 * data URI 를 준다(`PaperPeel.tsx` 가 쓰는 방식과 같다). 내보내는 방법도 갈린다.
 * 폰은 공유 시트에 넘기고, 웹은 공유 시트가 없어서 브라우저가 내려받게 한다
 * (비용 내보내기 `tripExpenseExport.ts` 와 같은 갈림이다).
 *
 * 둘 다 안 되는 곳에서는 `unavailable` 을 돌려준다. 그리기 자체는 되었으니
 * 부르는 쪽은 미리보기만 남기면 된다.
 *
 * 그리는 쪽과 떼어 둔다. 이 파일만 네이티브를 들여온다.
 */

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { safeFileName } from "./filenames";

/** data URI 의 base64 부분만. 앞의 `data:image/png;base64,` 는 버린다. */
const base64Of = (uri: string) => uri.slice(uri.indexOf(",") + 1);

export async function shareTripCard(fileName: string, shot: string): Promise<"shared" | "unavailable"> {
  const name = `${safeFileName(fileName, "추억 카드")}.png`;
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return "unavailable";
    const link = document.createElement("a");
    link.href = shot;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return "shared";
  }
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  // 찍힌 임시 파일은 이름이 제각각이라 그대로 넘기면 공유 시트에 낯선 이름이 뜬다.
  // 카드 이름으로 한 벌 옮겨 놓고 넘긴다.
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  if (shot.startsWith("data:")) {
    file.create();
    file.write(Uint8Array.from(atob(base64Of(shot)), (char) => char.charCodeAt(0)));
  } else {
    new File(shot).copy(file);
  }
  await Sharing.shareAsync(file.uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: fileName });
  return "shared";
}
