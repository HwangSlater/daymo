/**
 * 파일 이름 다듬기.
 *
 * 내보내기와 사진 저장이 같은 규칙을 쓴다. 기기 파일 이름에 못 쓰는 글자는
 * 운영체제마다 조금씩 다르지만, 셋 다 막는 글자만 지우면 어디서나 안전하다.
 * 순수 함수만 두어 네이티브 없이 따로 돌려 볼 수 있다.
 */

/** 파일 이름에 못 쓰는 글자를 지운다. 비면 준 기본 이름을 쓴다. */
export function safeFileName(name: string, fallback = "여행 비용"): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || fallback;
}

/**
 * 사진 자리에서 파일 이름을 뽑는다.
 *
 * 안드로이드의 `content://media/external/images/1000` 처럼 확장자가 없는
 * 자리도 오므로, 없으면 jpg 로 본다. 물음표 뒤 질의 문자열은 버린다.
 */
export function photoFileName(uri: string): string {
  const last = uri.split("?")[0].split("/").pop() ?? "";
  const cleaned = safeFileName(last, "");
  if (!cleaned) return "photo.jpg";
  return /\.[a-z0-9]{2,5}$/i.test(cleaned) ? cleaned : `${cleaned}.jpg`;
}
