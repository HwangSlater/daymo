const allowedNaverHost = (hostname) =>
  hostname === "naver.me" || hostname.endsWith(".naver.me") || hostname === "naver.com" || hostname.endsWith(".naver.com");

// 이 endpoint 는 우리 네이버 API 키로 대신 검색해 준다. 주소가 알려지면 남이
// 우리 할당량을 쓰므로 한 주소당 부를 수 있는 횟수를 막는다.
//
// 이 창고는 인스턴스 하나 안에서만 산다. 서버리스는 인스턴스가 여러 개 뜨고
// 식으면 사라지므로 완전한 방어가 아니다. 손쉬운 긁기를 막는 정도이고,
// 제대로 된 제한은 로그인이 붙는 백엔드 단계에서 한다.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const recentCalls = new Map();

const rateLimited = (key) => {
  const now = Date.now();
  const calls = (recentCalls.get(key) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
  calls.push(now);
  recentCalls.set(key, calls);
  // 오래된 주소는 흘려보낸다. 안 그러면 창고가 계속 커진다.
  if (recentCalls.size > 5000) {
    for (const [other, times] of recentCalls) {
      if (!times.some((at) => now - at < RATE_LIMIT_WINDOW_MS)) recentCalls.delete(other);
    }
  }
  return calls.length > RATE_LIMIT_MAX;
};

// 같은 링크를 다시 물으면 네이버에 또 묻지 않는다.
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const lookupCache = new Map();

const cacheGet = (key) => {
  const hit = lookupCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    lookupCache.delete(key);
    return null;
  }
  return hit.value;
};

const cacheSet = (key, value) => {
  if (lookupCache.size >= CACHE_MAX) lookupCache.delete(lookupCache.keys().next().value);
  lookupCache.set(key, { at: Date.now(), value });
};

/**
 * 브라우저에서 부를 수 있는 출처를 정한다.
 *
 * ALLOWED_ORIGINS 에 쉼표로 적어 둔 주소만 받는다. 비워 두면 브라우저에서는
 * 아무 데서도 못 부른다. 휴대폰 앱은 Origin 을 보내지 않으므로 그대로 된다.
 */
const corsOrigin = (request) => {
  const origin = request.headers?.origin;
  if (!origin) return null;
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
};

const callerKey = (request) => {
  const forwarded = request.headers?.["x-forwarded-for"];
  const first = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "";
  return first || request.socket?.remoteAddress || "unknown";
};

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

/** 네이버 주소이면서 https 인지. 리다이렉트를 따라갈 때마다 다시 본다. */
const isSafeNaverUrl = (url) => url.protocol === "https:" && allowedNaverHost(url.hostname);

const fetchNaverPage = async (rawUrl) => {
  let current = new URL(rawUrl);
  for (let redirects = 0; redirects < 5; redirects += 1) {
    if (!isSafeNaverUrl(current)) throw new Error("unsupported_host");
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

/** 받은 글자가 안전한 네이버 https 주소이면 돌려주고, 아니면 null. */
const safeUrlFrom = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return isSafeNaverUrl(url) ? url.toString() : null;
  } catch {
    return null;
  }
};

export default async function handler(request, response) {
  const origin = corsOrigin(request);
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ error: "method_not_allowed" });
  if (rateLimited(callerKey(request))) {
    return response.status(429).json({ error: "too_many_requests" });
  }
  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  } catch {
    return response.status(400).json({ error: "invalid_body" });
  }
  const rawUrl = safeUrlFrom(body?.url);
  const hintedName = typeof body?.hint === "string" ? body.hint.trim().slice(0, 100) : "";
  // 주소가 잘못된 것과 네이버가 답을 안 준 것은 다른 일이다. 전에는 둘 다
  // 502 라 앱에서 무엇이 잘못됐는지 구분할 수 없었다.
  if (!rawUrl) return response.status(422).json({ error: "invalid_naver_url" });
  const cached = cacheGet(`${rawUrl}|${hintedName}`);
  if (cached) return response.status(200).json(cached);
  try {
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
    cacheSet(`${rawUrl}|${hintedName}`, result);
    return response.status(200).json(result);
  } catch {
    return response.status(502).json({ error: "place_lookup_failed" });
  }
}
