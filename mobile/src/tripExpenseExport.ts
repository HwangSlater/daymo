import { shareTextFile } from "./shareTextFile";

/**
 * 비용 표(CSV)와 여행 기록(마크다운)을 내보낸다.
 *
 * 기기마다 다른 내보내는 길은 `shareTextFile` 이 하나로 맡는다. 여기에는 무엇을
 * 어떤 이름으로 내보내는지만 둔다.
 *
 * 둘 다 안 되는 곳에서는 `unavailable` 을 돌려준다. 부르는 쪽에서 클립보드로
 * 대신 내보내라는 뜻이다.
 *
 * 셈하는 쪽과 떼어 둔다. 이 파일만 네이티브를 들여오므로 tripExpenses 와
 * tripExportText 의 순수 함수들은 네이티브 없이 따로 돌려 볼 수 있다.
 */
export function shareExpenseCsv(fileName: string, csv: string): Promise<"shared" | "unavailable"> {
  return shareTextFile({
    fileName,
    extension: "csv",
    mimeType: "text/csv",
    uti: "public.comma-separated-values-text",
    dialogTitle: `${fileName} 비용 표 저장하기`,
    text: csv,
  });
}

/** 여행 기록을 글로. 마크다운이라 메모 앱에 붙여 넣어도 제목과 목록이 살아 있다. */
export function shareTripArchive(fileName: string, markdown: string): Promise<"shared" | "unavailable"> {
  return shareTextFile({
    fileName,
    extension: "md",
    mimeType: "text/markdown",
    uti: "net.daringfireball.markdown",
    dialogTitle: "Daymo 여행 기록 저장하기",
    text: markdown,
  });
}
