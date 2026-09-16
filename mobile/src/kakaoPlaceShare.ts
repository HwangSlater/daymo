export type KakaoPlaceShare = {
  name: string;
  address: string;
  category?: string;
  url: string;
};

/**
 * 카카오맵 링크.
 *
 * 앱 공유는 kko.kakao.com·kko.to 짧은 링크로 오고, 웹에서 복사하면
 * place.map.kakao.com/12345 나 map.kakao.com/link/... 로 온다.
 * 호스트 뒤에 글자가 더 붙은 가짜 주소(map.kakao.com.example.com)는 받지 않는다.
 */
const kakaoUrlPattern = /https?:\/\/(?:[a-z0-9-]+\.)*(?:map\.kakao\.com|kko\.kakao\.com|kko\.to)(?![a-z0-9.-])[^\s]*/i;

/** "[카카오맵]" 머리말. 뒤에 장소 이름이 같은 줄에 붙어 오기도 한다. */
const headerPattern = /^\[?\s*카카오\s*(?:맵|지도)\s*\]?\s*/;

const decode = (value: string) => {
  try {
    return decodeURIComponent(value.replace(/\+/g, " ")).trim();
  } catch {
    return value.trim();
  }
};

/**
 * 링크에 이름이 들어 있으면 꺼낸다.
 *
 *   map.kakao.com/link/map/이름,위도,경도   map.kakao.com/link/search/검색어
 *   map.kakao.com/link/to/이름,위도,경도    map.kakao.com/?q=검색어
 *
 * /link/map/12345 처럼 장소 번호만 있으면 이름이 없다.
 */
const nameFromKakaoUrl = (url: string) => {
  const path = url.match(/\/link\/(?:map|to|search)\/([^?#/]+)/i)?.[1];
  if (path) {
    const name = decode(path).split(",")[0].trim();
    return /^\d+$/.test(name) ? "" : name;
  }
  const query = url.match(/[?&]q=([^&#]+)/i)?.[1];
  return query ? decode(query) : "";
};

export const parseKakaoPlaceShare = (text: string): KakaoPlaceShare | null => {
  const url = text.match(kakaoUrlPattern)?.[0];
  if (!url) return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(url, "").replace(headerPattern, "").trim())
    .filter(Boolean);
  return {
    name: lines[0] ?? nameFromKakaoUrl(url),
    address: lines[1] ?? "",
    url,
  };
};

/**
 * 짧은 링크만 있으면 서버에 풀어 달라고 한다.
 *
 * 공유 문구에 이름과 주소가 다 있으면 그대로 쓴다. 서버 주소가 없거나
 * 서버가 못 풀면 읽은 만큼만 돌려준다.
 */
export const resolveKakaoPlaceShare = async (text: string): Promise<KakaoPlaceShare | null> => {
  const parsed = parseKakaoPlaceShare(text);
  if (!parsed) return null;
  const endpoint = process.env.EXPO_PUBLIC_DAYMO_PLACE_RESOLVER_URL?.trim();
  if (!endpoint || (parsed.name && parsed.address)) return parsed;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: parsed.url, hint: parsed.name }),
    });
    if (!response.ok) return parsed;
    const result = await response.json() as Partial<KakaoPlaceShare>;
    return {
      name: result.name?.trim() || parsed.name,
      address: result.address?.trim() || parsed.address,
      category: result.category?.trim() || undefined,
      url: result.url?.trim() || parsed.url,
    };
  } catch {
    return parsed;
  }
};
