const allowedNaverHost = (hostname) =>
  hostname === "naver.me" || hostname.endsWith(".naver.me") || hostname === "naver.com" || hostname.endsWith(".naver.com");

const allowedKakaoHost = (hostname) =>
  hostname === "kko.to" || hostname.endsWith(".kko.to") || hostname === "kakao.com" || hostname.endsWith(".kakao.com");

// 이 endpoint 는 네이버 지도와 카카오맵 공유 링크를 대신 풀어 준다. 우리
// API 키로 대신 검색해 주기도 하므로, 주소가 알려지면 남이 우리 할당량을
// 쓴다. 그래서 한 주소당 부를 수 있는 횟수를 막는다.
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

// 같은 링크를 다시 물으면 지도 쪽에 또 묻지 않는다.
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

/** https 인 지도 주소이면 어느 지도인지 돌려준다. 리다이렉트를 따라갈 때마다 다시 본다. */
const providerOf = (url) => {
  if (url.protocol !== "https:") return null;
  if (allowedNaverHost(url.hostname)) return "naver";
  if (allowedKakaoHost(url.hostname)) return "kakao";
  return null;
};

/**
 * 링크를 따라가 마지막 쪽을 읽는다.
 *
 * 카카오 짧은 링크(kko.kakao.com·kko.to)는 여러 번 넘어간다. 넘어간 주소도
 * 매번 같은 지도의 https 주소여야 한다. 링크가 죽었으면 404 가 와서 502 가 된다.
 */
const fetchPage = async (rawUrl, provider) => {
  let current = new URL(rawUrl);
  for (let redirects = 0; redirects < 5; redirects += 1) {
    if (providerOf(current) !== provider) throw new Error("unsupported_host");
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
    if (!response.ok) throw new Error("place_page_failed");
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

/** 카카오 장소 분류 코드. 코드가 없으면 분류 이름 글자로 본다. */
const kakaoCategories = {
  FD6: "식당",
  CE7: "카페",
  AD5: "숙소",
  MT1: "쇼핑",
  CS2: "쇼핑",
  AT4: "구경",
  CT1: "구경",
};

/**
 * 카카오 장소 번호. 짧은 링크를 따라간 뒤에야 보인다.
 *
 *   map.kakao.com/?itemId=27546229   place.map.kakao.com/27546229
 *   map.kakao.com/link/map/27546229
 */
const kakaoPlaceId = (url) => {
  const parsed = new URL(url);
  const item = parsed.searchParams.get("itemId") ?? "";
  if (/^\d+$/.test(item)) return item;
  if (parsed.hostname === "place.map.kakao.com") {
    return parsed.pathname.match(/^\/(\d+)(?:[/?#]|$)/)?.[1] ?? "";
  }
  return parsed.pathname.match(/\/link\/(?:map|to)\/(\d+)(?:[/?#]|$)/)?.[1] ?? "";
};

/** 카카오 링크에 이름이 들어 있으면 꺼낸다. 장소 번호만 있으면 이름이 없다. */
const kakaoNameFromUrl = (url) => {
  const parsed = new URL(url);
  const path = parsed.pathname.match(/\/link\/(?:map|to|search)\/([^?#/]+)/i)?.[1];
  if (path) {
    const name = decodeURIComponent(path.replace(/\+/g, " ")).split(",")[0].trim();
    return /^\d+$/.test(name) ? "" : name;
  }
  const query = parsed.searchParams.get("name") || parsed.searchParams.get("q") || "";
  return query.trim();
};

/**
 * 카카오 링크에서 wgs84 좌표를 꺼낸다.
 *
 * 장소 쪽의 og:image 에는 `m=경도,위도` 가 붙어 있고, /link/map/이름,위도,경도
 * 형태의 링크에는 좌표가 그대로 들어 있다. map.kakao.com 의 urlX·urlY 는
 * 카카오 자체 좌표계라 쓰지 않는다.
 */
const kakaoPoint = (html, url) => {
  const image = metaContent(html, "og:image");
  const shot = image.match(/[?&]m=(-?[\d.]+)(?:,|%2C)(-?[\d.]+)/i);
  if (shot) return { lon: shot[1], lat: shot[2] };
  const link = new URL(url).pathname.match(/\/link\/(?:map|to)\/[^/?#]*?,(-?[\d.]+),(-?[\d.]+)(?:[/?#]|$)/);
  return link ? { lat: link[1], lon: link[2] } : null;
};

const resolveNaver = async (page, hintedName) => {
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
  return result;
};

/**
 * 카카오 짧은 링크를 풀어 이름과 주소를 읽는다.
 *
 * 짧은 링크는 map.kakao.com/?itemId=... 로 넘어간다. 장소 번호가 보이면
 * place.map.kakao.com 쪽을 한 번 더 읽는다. 그쪽 주소에는 층수까지 들어 있다.
 * 번호가 없는 링크(검색어만 든 링크)의 og 태그는 카카오맵 소개 문구라 안 쓴다.
 *
 * 여기까지는 키가 없어도 된다. KAKAO_REST_API_KEY 가 있으면 장소 검색으로
 * 도로명 주소와 종류까지 채운다.
 */
const resolveKakao = async (page, hintedName) => {
  const placeId = kakaoPlaceId(page.url);
  // 장소 쪽이 없어졌으면 넘어온 쪽의 og 태그로 버틴다. 거기에도 이름과
  // 도로명 주소는 들어 있다.
  const place = placeId
    ? await fetchPage(`https://place.map.kakao.com/${placeId}`, "kakao").catch(() => page)
    : page;
  const title = placeId ? metaContent(place.html, "og:title").replace(/\s*[:|–-]\s*카카오맵\s*$/i, "") : "";
  const query = title || hintedName || kakaoNameFromUrl(page.url);
  let result = {
    name: query,
    address: placeId ? metaContent(place.html, "og:description") : "",
    url: place.url,
  };
  const key = process.env.KAKAO_REST_API_KEY;
  if (query && key) {
    const point = kakaoPoint(place.html, page.url);
    // 좌표를 알면 그 자리 가까운 것부터 본다. 같은 이름의 다른 가게를 피한다.
    const near = point ? `&x=${encodeURIComponent(point.lon)}&y=${encodeURIComponent(point.lat)}&radius=500&sort=distance` : "";
    const search = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1${near}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (search.ok) {
      const data = await search.json();
      const found = data.documents?.[0];
      if (found) result = {
        ...result,
        name: cleanText(found.place_name) || result.name,
        address: found.road_address_name || found.address_name || result.address,
        category: kakaoCategories[found.category_group_code] ?? categoryFor(found.category_name),
      };
    }
  }
  return result;
};

/** 받은 글자가 우리가 풀 수 있는 지도 https 주소이면 돌려주고, 아니면 null. */
const safeUrlFrom = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const provider = providerOf(url);
    return provider ? { url: url.toString(), provider } : null;
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
  const target = safeUrlFrom(body?.url);
  const hintedName = typeof body?.hint === "string" ? body.hint.trim().slice(0, 100) : "";
  // 주소가 잘못된 것과 지도가 답을 안 준 것은 다른 일이다. 전에는 둘 다
  // 502 라 앱에서 무엇이 잘못됐는지 구분할 수 없었다.
  if (!target) return response.status(422).json({ error: "invalid_place_url" });
  const cached = cacheGet(`${target.url}|${hintedName}`);
  if (cached) return response.status(200).json(cached);
  try {
    const page = await fetchPage(target.url, target.provider);
    const result = target.provider === "kakao"
      ? await resolveKakao(page, hintedName)
      : await resolveNaver(page, hintedName);
    cacheSet(`${target.url}|${hintedName}`, result);
    return response.status(200).json(result);
  } catch {
    // 무엇이 잘못됐는지는 남기지 않는다. 링크와 장소 이름이 로그에 남으면
    // 그것만으로 누가 어디에 가는지가 드러난다.
    return response.status(502).json({ error: "place_lookup_failed" });
  }
}
