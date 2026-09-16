import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { safeFileName } from "./filenames";

/**
 * 글 하나를 기기에 맞는 방법으로 내보낸다.
 *
 * 휴대폰은 파일로 만들어 공유 시트에 넘긴다. 웹은 공유 시트가 없어서 브라우저가
 * 그냥 내려받게 한다. 웹에도 navigator.share 가 있긴 하지만 데스크톱 브라우저에는
 * 대개 없고, 있어도 로컬 파일 주소는 받지 못해서 창이 뜨지 않고 그대로 멈춘다.
 * react-native 의 `Share` 를 그냥 부르면 데스크톱에서 눌러도 아무 일이 없다.
 *
 * 둘 다 안 되는 곳에서는 `unavailable` 을 돌려준다. 부르는 쪽에서 클립보드로
 * 대신 내보내라는 뜻이다.
 */
export async function shareTextFile(options: {
  /** 확장자 없는 파일 이름. 기기에서 못 쓰는 글자는 여기서 지운다. */
  fileName: string;
  extension: string;
  mimeType: string;
  /** 애플의 파일 종류. 공유 시트가 받을 앱을 고를 때 쓴다. */
  uti: string;
  dialogTitle: string;
  text: string;
}): Promise<"shared" | "unavailable"> {
  const name = `${safeFileName(options.fileName)}.${options.extension}`;
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return "unavailable";
    const url = URL.createObjectURL(new Blob([options.text], { type: `${options.mimeType};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 바로 지우면 사파리가 내려받기를 시작하기 전에 주소가 사라진다. 잠시 두었다 지운다.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "shared";
  }
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(options.text);
  await Sharing.shareAsync(file.uri, {
    mimeType: options.mimeType,
    UTI: options.uti,
    dialogTitle: options.dialogTitle,
  });
  return "shared";
}
