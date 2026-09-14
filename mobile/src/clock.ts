/**
 * 시각 입력.
 *
 * 안드로이드는 스피너를 띄우지만 그 밖의 플랫폼에서는 그냥 입력칸이다. 마스크도
 * 검사도 없으면 "9" 나 "2599" 가 그대로 저장되고, 그런 값은 나중에 ":" 로 쪼개는
 * 곳에서 말없이 정오로 뭉개진다. 사용자는 시각이 틀어진 줄도 모른다.
 *
 * 치는 중과 다 치고 난 뒤를 갈라 둔다. 치는 중에 자리를 멋대로 해석하면 글자가
 * 손가락 아래에서 튀어서 지우기가 어려워지고, 다 친 값은 사람이 읽는 대로
 * 읽어 줘야 "9" 가 9시가 된다.
 */

/**
 * 치는 동안의 값. 네 자리가 차기 전에는 숫자만 남기고 그대로 둔다.
 *
 * 네 자리가 차면 콜론을 넣고 시와 분을 각각 23 과 59 로 눌러 담는다.
 * 다섯 자리째부터는 버린다.
 */
export function maskClockTime(text: string): string {
  const digits = text.replace(/[^\d]/g, "").slice(0, 4);
  if (digits.length < 4) return digits;
  const hours = Math.min(23, Number(digits.slice(0, 2)));
  const minutes = Math.min(59, Number(digits.slice(2)));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * 입력칸에서 손을 뗐을 때의 값. 덜 친 자리를 사람이 읽는 대로 채운다.
 *
 * 한두 자리는 시로 보고 분을 0 으로, 세 자리는 앞 하나가 시다. "9" 는 9시,
 * "930" 은 9시 30분이다. 비어 있으면 비운 채로 둔다. 시간을 안 적는 일정도 있다.
 */
export function settleClockTime(value: string): string {
  const digits = value.replace(/[^\d]/g, "").slice(0, 4);
  if (!digits) return "";
  const padded = digits.length <= 2
    ? `${digits.padStart(2, "0")}00`
    : digits.length === 3
      ? `0${digits}`
      : digits;
  return maskClockTime(padded);
}
