type ResolvedNaverPlace = {
  name: string;
  address: string;
  category?: string;
  url: string;
};

const naverUrlPattern = /https?:\/\/(?:m\.)?(?:naver\.me|map\.naver\.com)\/[^\s]+/i;

const nameFromSearchUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/p\/search\/([^/]+)/);
    return match ? decodeURIComponent(match[1]).replace(/\+/g, " ").trim() : "";
  } catch {
    return "";
  }
};

export const parseNaverPlaceShare = (text: string): ResolvedNaverPlace | null => {
  const url = text.match(naverUrlPattern)?.[0];
  if (!url) return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[?네이버\s*지도\]?$/i.test(line))
    .filter((line) => !line.includes(url));
  return {
    name: lines[0] ?? nameFromSearchUrl(url),
    address: lines[1] ?? "",
    url,
  };
};

export const resolveNaverPlaceShare = async (text: string): Promise<ResolvedNaverPlace | null> => {
  const parsed = parseNaverPlaceShare(text);
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
    const result = await response.json() as Partial<ResolvedNaverPlace>;
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
