const allowedNaverHost = (hostname) =>
  hostname === "naver.me" || hostname.endsWith(".naver.me") || hostname === "naver.com" || hostname.endsWith(".naver.com");

const cleanText = (value = "") => value
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .trim();

const metaContent = (html, property) => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forward = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"));
  const reverse = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"));
  return cleanText(forward?.[1] || reverse?.[1] || "");
};

const fetchNaverPage = async (rawUrl) => {
  let current = new URL(rawUrl);
  for (let redirects = 0; redirects < 5; redirects += 1) {
    if (!allowedNaverHost(current.hostname)) throw new Error("unsupported_host");
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "DaymoPlaceResolver/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("invalid_redirect");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error("naver_page_failed");
    const html = (await response.text()).slice(0, 1_000_000);
    return { url: current.toString(), html };
  }
  throw new Error("too_many_redirects");
};

const searchNameFromUrl = (url) => {
  const match = new URL(url).pathname.match(/\/p\/search\/([^/]+)/);
  return match ? decodeURIComponent(match[1]).replace(/\+/g, " ").trim() : "";
};

const categoryFor = (value = "") => {
  if (/카페|커피|디저트/.test(value)) return "카페";
  if (/숙박|호텔|펜션|게스트|한옥/.test(value)) return "숙소";
  if (/음식|식당|한식|중식|일식|양식/.test(value)) return "식당";
  if (/쇼핑|마트|시장/.test(value)) return "쇼핑";
  return "구경";
};

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ error: "method_not_allowed" });
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const hintedName = typeof body?.hint === "string" ? body.hint.trim() : "";
    if (!rawUrl || !allowedNaverHost(new URL(rawUrl).hostname)) {
      return response.status(422).json({ error: "invalid_naver_url" });
    }
    const page = await fetchNaverPage(rawUrl);
    const pageTitle = metaContent(page.html, "og:title").replace(/\s*[:|–-]\s*네이버.*$/i, "");
    const description = metaContent(page.html, "og:description");
    const query = hintedName || searchNameFromUrl(page.url) || pageTitle;
    let result = { name: query, address: description, url: page.url };
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (query && clientId && clientSecret) {
      const search = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=1`, {
        headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
        signal: AbortSignal.timeout(5000),
      });
      if (search.ok) {
        const data = await search.json();
        const place = data.items?.[0];
        if (place) result = {
          ...result,
          name: cleanText(place.title) || result.name,
          address: place.roadAddress || place.address || result.address,
          category: categoryFor(place.category),
        };
      }
    }
    return response.status(200).json(result);
  } catch {
    return response.status(502).json({ error: "place_lookup_failed" });
  }
}
