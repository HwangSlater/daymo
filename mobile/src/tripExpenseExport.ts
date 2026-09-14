import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { safeFileName } from "./filenames";

/**
 * CSV 를 기기에 맞는 방법으로 내보낸다.
 *
 * 휴대폰은 파일로 만들어 공유 시트에 넘긴다. 웹은 공유 시트가 없어서 브라우저가
 * 그냥 내려받게 한다. 웹에도 navigator.share 가 있긴 하지만 로컬 파일 주소는
 * 받지 못해서, 쓰면 창이 뜨지 않고 그대로 멈춘다.
 *
 * 둘 다 안 되는 곳에서는 `unavailable` 을 돌려준다. 부르는 쪽에서 클립보드로
 * 대신 내보내라는 뜻이다.
 *
 * 셈하는 쪽과 떼어 둔다. 이 파일만 네이티브를 들여오므로 tripExpenses 의
 * 순수 함수들은 네이티브 없이 따로 돌려 볼 수 있다.
 */
export async function shareExpenseCsv(fileName: string, csv: string): Promise<"shared" | "unavailable"> {
  const name = `${safeFileName(fileName)}.csv`;
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return "unavailable";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return "shared";
  }
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
    dialogTitle: `${fileName} 비용 내보내기`,
  });
  return "shared";
}
