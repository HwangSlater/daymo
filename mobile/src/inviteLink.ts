/**
 * 초대 링크에서 token 을 꺼낸다.
 *
 * 받는 모양은 셋이다. 메신저로 받은 `https://api.daymo.xyz/auth/invite?token=...`,
 * 그 페이지가 여는 `daymo://invite?token=...`, 그리고 앞뒤 글과 섞여 붙여 넣은 링크.
 * token 은 서버가 만든 URL-safe 문자열이라 그 글자만 받는다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

export function inviteTokenOf(text: string | null | undefined): string | null {
  if (!text) return null;
  const found = text.match(/(?:daymo:\/\/invite|\/auth\/invite)\?(?:[^\s#]*&)?token=([A-Za-z0-9_-]+)/);
  if (found && TOKEN.test(found[1])) return found[1];
  const bare = text.trim();
  return TOKEN.test(bare) ? bare : null;
}
