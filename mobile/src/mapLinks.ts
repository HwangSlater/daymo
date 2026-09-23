type MapProvider = "naver" | "kakao" | "other";

/** 링크 주소의 호스트. React Native의 URL은 hostname을 못 읽는 판이 있어 직접 자른다. */
const hostOf = (url: string) => url.trim().match(/^https?:\/\/([^/?#:\s]+)/i)?.[1]?.toLowerCase() ?? "";

const endsWithHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** 서버의 링크 분류(backend/app/services/places.py)와 같은 호스트를 본다. */
export const mapProviderOf = (url: string): MapProvider => {
  const host = hostOf(url);
  if (!host) return "other";
  if (["map.naver.com", "naver.me"].some((domain) => endsWithHost(host, domain))) return "naver";
  if (["map.kakao.com", "kko.kakao.com", "kko.to"].some((domain) => endsWithHost(host, domain))) return "kakao";
  return "other";
};

export const mapProviderName: Record<MapProvider, string> = {
  naver: "네이버 지도",
  kakao: "카카오맵",
  other: "지도",
};

export const naverMapSearchUrl = (query: string) =>
  query.trim() ? `https://map.naver.com/p/search/${encodeURIComponent(query.trim())}` : "https://map.naver.com/";

export const kakaoMapSearchUrl = (query: string) =>
  query.trim() ? `https://map.kakao.com/?q=${encodeURIComponent(query.trim())}` : "https://map.kakao.com/";
