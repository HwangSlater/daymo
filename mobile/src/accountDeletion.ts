/**
 * 계정 삭제 화면에 쓰는 글자 만들기.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 서버가 준 삭제 예정 시각을 이 기기 시간으로 읽기 쉽게 적는다. 읽을 수 없으면 null. */
export function deletionDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${at.getFullYear()}년 ${at.getMonth() + 1}월 ${at.getDate()}일 ${hh}:${mm}`;
}

/** 삭제를 요청한 뒤 로그인 화면에 띄우는 안내. */
export function deletionRequestedNotice(scheduledAt: string | null | undefined): string {
  const label = deletionDateLabel(scheduledAt);
  const when = label ? `${label}에` : "7일 뒤에";
  return `계정 삭제를 요청했어요. ${when} 삭제돼요. 그 전에 다시 로그인하면 취소할 수 있어요.`;
}
