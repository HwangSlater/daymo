/**
 * 카카오톡 공지 한 편을 여행 초안으로 읽는다.
 *
 * 서식은 `docs/02-raw-travel-data.md` 가 모아 둔 그대로다. 여행 머리글
 * (`# 제목: 9월 22일 ~ 9월 24일 전주 한옥마을`), 댓글 사이의 `,` 한 줄,
 * `——————` 로 감싼 구획 제목, `[대괄호]` 상태·분류, `[주소](주소)` 로 두 번
 * 적힌 링크, 단위 없는 수량, 번호 목록 조리 순서, 이모지 섞인 제목.
 *
 * 완벽하게 읽는 것이 목적이 아니다. 읽은 것을 사람이 고칠 수 있게 내놓고,
 * 못 읽은 줄은 버리지 않고 `leftovers` 에 그대로 모은다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

export type NoticePlace = {
  name: string;
  address: string;
  mapUrl: string;
  /** `[담에 가용]` 처럼 이름 앞에 붙은 상태. */
  note: string;
};

export type NoticeStay = {
  name: string;
  address: string;
  mapUrl: string;
  /** `15:00`. 못 읽었으면 빈 값. */
  checkIn: string;
  checkOut: string;
  /** 예약 링크. 서버 숙소에는 넣을 칸이 없어 메모로 간다. */
  bookingUrl: string;
};

export type NoticeTransportMethod = "KTX" | "SRT" | "버스" | "항공" | "기타";

export type NoticeTransport = {
  owner: string;
  direction: "가는 편" | "오는 편";
  method: NoticeTransportMethod;
  departure: string;
  departureTime: string;
  arrival: string;
  arrivalTime: string;
  booked: boolean;
};

export type NoticeIngredient = {
  name: string;
  quantity: string;
  /** `[기본]`·`[육수]` 같은 분류. */
  group: string;
  /** 현지에서 사 오는 것. 아니면 집에서 가져오거나 아직 미정이다. */
  buy: boolean;
};

export type NoticeRecipe = {
  name: string;
  /** 조리 순서와 곁글. */
  note: string;
  ingredients: NoticeIngredient[];
};

export type NoticePacking = {
  name: string;
  quantity: string;
  /** 공지에 적힌 이름 그대로. 공간 사람 표와 맞추는 것은 화면이 한다. */
  owner: string;
};

export type NoticeScheduleType = "place" | "meal" | "move" | "rest" | "other";

export type NoticeSchedule = {
  /** `YYYY-MM-DD`. 요일만 적혀 있고 기간에 그 요일이 없으면 빈 값. */
  date: string;
  /** `HH:MM`. 없으면 빈 값. */
  time: string;
  title: string;
  note: string;
  type: NoticeScheduleType;
};

export type NoticeDraft = {
  title: string;
  /** `YYYY-MM-DD`. 머리글에 기간이 없으면 빈 값. */
  startDate: string;
  endDate: string;
  /** 앱이 쓰는 17개 지역 중 하나. 못 알아보면 빈 값. */
  regionName: string;
  places: NoticePlace[];
  stays: NoticeStay[];
  transports: NoticeTransport[];
  recipes: NoticeRecipe[];
  packing: NoticePacking[];
  schedule: NoticeSchedule[];
  memos: string[];
  /** 어디에도 넣지 못한 줄. 버리지 않고 그대로 모은다. */
  leftovers: string[];
};

// ---------------------------------------------------------------------------
// 줄 단위 도구
// ---------------------------------------------------------------------------

/** `[주소](주소)` 로 두 번 적힌 링크. 괄호 안이 진짜 주소다. */
const LINK = /\[([^\]]*)\]\(([^)]*)\)/;
const BARE_URL = /^https?:\/\/\S+$/;
/** `——————` 만 있는 줄, `---`, `***`. 내용 없이 나누기만 하는 줄이다. */
const RULE_ONLY = /^[\s—–―─=\-*_·]+$/;
/** `—————— 먹고 싶은 것 리스트 ——————` */
const SECTION = /^[—–―─=]{3,}\s*(\S.*?)\s*[—–―─=]{3,}$/;
/** `[대괄호]` 로 시작하고 뒤에 글이 더 붙기도 한다. 링크 표기와 헷갈리지 않게 `(` 는 뺀다. */
const BRACKET = /^\[([^\]]+)\]\s*(?!\()(.*)$/;
const NUMBERED = /^(\d{1,2})[.)]\s*(\S.*)$/;
const BULLET = /^[-•*]\s+(\S.*)$/;

/** 공지에 늘 붙는데 읽을 것이 없는 줄. 못 읽은 줄로 세지 않는다. */
const NOISE = /^(댓글|공지|사진|이모티콘|메뉴|--+)$/;

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu;

const tidy = (value: string) => value.replace(/\s+/g, " ").trim();
const stripEmoji = (value: string) => tidy(value.replace(EMOJI, " "));

/**
 * 링크 줄에서 주소만 꺼낸다. 링크가 아니면 빈 값.
 *
 * 네이버 검색 링크에는 `.../search/소나기식당 별관` 처럼 띄어쓰기가 그대로 들어
 * 있다. 서버도 앱도 공백이 든 주소는 받지 않으니 여기서 `%20` 으로 바꾼다.
 */
export function urlOf(line: string): string {
  const paired = line.match(LINK);
  const url = paired ? (paired[2] || paired[1]).trim() : line.trim();
  if (!paired && !BARE_URL.test(url)) return "";
  return url.replace(/\s/g, "%20");
}

/** 링크 말고는 아무것도 없는 줄인지. */
const isLinkLine = (line: string) => Boolean(urlOf(line)) && !tidy(line.replace(LINK, "").replace(BARE_URL, ""));

const isMapUrl = (url: string) => /(?:^|\/\/|\.)(?:map\.naver\.com|m\.map\.naver\.com|naver\.me|map\.kakao\.com|kko\.kakao\.com|kko\.to|maps\.google\.[a-z.]+|goo\.gl)\//i.test(url);

// ---------------------------------------------------------------------------
// 머리글: 기간·이름·지역
// ---------------------------------------------------------------------------

const REGION_NAMES = [
  "서울", "인천", "경기", "강원", "충북", "충남", "대전", "세종",
  "전북", "전남", "광주", "경북", "대구", "경남", "울산", "부산", "제주",
];

/** 공지에 적히는 도시 이름을 앱의 17개 지역으로 옮긴다. 모르면 빈 값이다. */
const REGION_BY_CITY: Record<string, string> = {
  서귀포: "제주", 성산: "제주", 애월: "제주", 한림: "제주",
  수원: "경기", 용인: "경기", 성남: "경기", 고양: "경기", 파주: "경기", 가평: "경기",
  양평: "경기", 포천: "경기", 안산: "경기", 이천: "경기", 김포: "경기", 남양주: "경기",
  춘천: "강원", 강릉: "강원", 속초: "강원", 양양: "강원", 평창: "강원", 원주: "강원",
  정선: "강원", 동해: "강원", 삼척: "강원", 홍천: "강원", 인제: "강원", 고성: "강원",
  청주: "충북", 충주: "충북", 제천: "충북", 단양: "충북", 보은: "충북", 영동: "충북",
  천안: "충남", 아산: "충남", 공주: "충남", 부여: "충남", 보령: "충남", 서산: "충남",
  태안: "충남", 홍성: "충남", 논산: "충남", 예산: "충남",
  전주: "전북", 군산: "전북", 익산: "전북", 남원: "전북", 정읍: "전북", 부안: "전북",
  고창: "전북", 무주: "전북", 임실: "전북",
  여수: "전남", 순천: "전남", 목포: "전남", 담양: "전남", 보성: "전남", 완도: "전남",
  해남: "전남", 구례: "전남", 광양: "전남", 나주: "전남", 곡성: "전남",
  경주: "경북", 안동: "경북", 포항: "경북", 영주: "경북", 문경: "경북", 울릉: "경북",
  상주: "경북", 청송: "경북", 영덕: "경북",
  통영: "경남", 거제: "경남", 남해: "경남", 진주: "경남", 하동: "경남", 창원: "경남",
  김해: "경남", 산청: "경남", 합천: "경남", 밀양: "경남", 양산: "경남",
};

/** 제목에서 지역을 찾는다. 시·도 이름이 먼저고, 없으면 도시 이름으로 찾는다. */
export function regionOfTitle(title: string): string {
  for (const region of REGION_NAMES) {
    if (title.includes(region)) return region;
  }
  for (const [city, region] of Object.entries(REGION_BY_CITY)) {
    if (title.includes(city)) return region;
  }
  return "";
}

const pad = (value: number) => String(value).padStart(2, "0");
const keyOf = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * 연도 없이 적힌 날을 언제로 볼지.
 *
 * 공지는 대개 다녀온 뒤에 옮긴다. 올해로 읽었을 때 석 달 넘게 앞이면 작년으로 본다.
 */
const yearFor = (month: number, day: number, today: string) => {
  const thisYear = Number(today.slice(0, 4));
  const candidate = keyOf(thisYear, month, day);
  return daysBetween(today, candidate) > 90 ? thisYear - 1 : thisYear;
};

const RANGE = new RegExp(
  "(?:(\\d{4})[년.\\-/]\\s*)?(\\d{1,2})\\s*[월.\\-/]\\s*(\\d{1,2})\\s*일?" +
  "\\s*(?:~|-|–|—|―|부터)\\s*" +
  "(?:(\\d{4})[년.\\-/]\\s*)?(?:(\\d{1,2})\\s*[월.\\-/]\\s*)?(\\d{1,2})\\s*일?",
);

/** 머리글 한 줄에서 기간과 이름을 꺼낸다. 기간이 없으면 전부 이름이다. */
export function parseHeadline(line: string, today: string): { title: string; startDate: string; endDate: string } {
  const text = stripEmoji(line.replace(/^#+\s*/, "").replace(/^제목\s*[:：]\s*/, ""));
  const found = text.match(RANGE);
  if (!found) return { title: text.slice(0, 60), startDate: "", endDate: "" };
  const [matched, startYear, startMonth, startDay, endYear, endMonth, endDay] = found;
  const month = Number(startMonth);
  const day = Number(startDay);
  const year = startYear ? Number(startYear) : yearFor(month, day, today);
  const startDate = keyOf(year, month, day);
  const lastMonth = endMonth ? Number(endMonth) : month;
  const lastDay = Number(endDay);
  const lastYear = endYear ? Number(endYear) : lastMonth < month ? year + 1 : year;
  const endDate = keyOf(lastYear, lastMonth, lastDay);
  return {
    title: tidy(text.replace(matched, " ")).slice(0, 60),
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
  };
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 기간 안의 날짜를 차례대로. 기간이 비었으면 빈 배열. */
export function tripDates(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate) return [];
  const span = daysBetween(startDate, endDate);
  if (span < 0 || span > 60) return [startDate];
  const start = Date.parse(`${startDate}T00:00:00Z`);
  return Array.from({ length: span + 1 }, (_, index) => new Date(start + index * 86400000).toISOString().slice(0, 10));
}

const weekdayOf = (key: string) => WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()];

// ---------------------------------------------------------------------------
// 수량
// ---------------------------------------------------------------------------

/** 숫자 없이 수량이 되는 말. `느타리버섯 한줌`, `후추 솔솔`. */
const LOOSE_QUANTITY = /^(한줌|두줌|약간|조금|조금씩|적당량|적당히|넉넉히|솔솔|살짝|반개|듬뿍)$/;

/**
 * `소고기 250` 처럼 단위 없이 붙은 수량을 가른다.
 *
 * 숫자로 시작하는 첫 토막부터 끝까지가 수량이다. `배추1/2 250(20-24장)` 은
 * 이름 안에 숫자가 있어도 띄어쓰기 뒤의 `250(20-24장)` 만 수량으로 본다.
 */
export function splitQuantity(line: string): { name: string; quantity: string } {
  const text = tidy(line);
  const numbered = text.match(/^(.*?\S)\s+((?:\d|[½¼⅓⅔¾]).*)$/);
  if (numbered) return { name: numbered[1], quantity: numbered[2] };
  const loose = text.match(/^(.*?\S)\s+(\S+)$/);
  if (loose && LOOSE_QUANTITY.test(loose[2])) return { name: loose[1], quantity: loose[2] };
  return { name: text, quantity: "" };
}

/**
 * 수량 없이 길게 늘어진 줄은 재료가 아니라 곁글로 본다.
 *
 * `새우 넣을거면 식초 챙기기` 같은 줄이다. 한국어 서술형 끝맺음으로 가른다.
 */
const looksLikeNote = (name: string, quantity: string) =>
  !quantity && name.length >= 8 && /[기다요자셈함봐줘]$/.test(name);

// ---------------------------------------------------------------------------
// 덩이 나누기
// ---------------------------------------------------------------------------

type SectionKind = "places" | "dishes" | "packing" | "stay" | "booking" | "transport" | "memo" | "unknown";

const sectionKindOf = (title: string): SectionKind => {
  if (/맛집|먹고\s*싶|가고\s*싶|가볼|갈\s*곳|장소|카페|코스/.test(title)) return "places";
  if (/해먹|해\s*먹|요리|메뉴|먹을\s*거/.test(title)) return "dishes";
  if (/챙길|준비물|짐\s*싸|가져올|가져갈/.test(title)) return "packing";
  if (/숙소|호텔|펜션|게스트하우스|민박|한옥/.test(title)) return "stay";
  if (/예약|체크인|체크아웃/.test(title)) return "booking";
  if (/교통|이동|기차|버스\s*편|비행/.test(title)) return "transport";
  if (/기록|후기|메모|일기|한마디|남긴/.test(title)) return "memo";
  return "unknown";
};

type Block = { kind: SectionKind; lines: string[] };

/** 구획 제목과 `,` 한 줄로 공지를 덩이로 나눈다. */
function blocksOf(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let current: Block = { kind: "unknown", lines: [] };
  const flush = () => {
    if (current.lines.some((line) => line.trim())) blocks.push(current);
  };
  for (const line of lines) {
    const header = line.trim().match(SECTION);
    if (header) {
      flush();
      current = { kind: sectionKindOf(header[1]), lines: [] };
      continue;
    }
    if (/^\s*,\s*$/.test(line) || (line.trim().length > 0 && RULE_ONLY.test(line.trim()))) {
      flush();
      current = { kind: "unknown", lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  flush();
  return blocks;
}

/** `❤️ 버섯전골 준비물`, `마파두부 레시피 (1인분)`. 뒤따르는 줄이 그 요리의 재료다. */
const RECIPE_HEAD = /^(.+?)\s*(?:준비물|재료|레시피)\s*(\([^)]*\))?$/;
const DAY_HEAD = /^\[\s*([^\]]*?(?:요일|[월화수목금토일])\s*)\]$/;

const recipeHeadOf = (line: string) => {
  const text = stripEmoji(line);
  if (!text || BULLET.test(text) || BRACKET.test(text) || NUMBERED.test(text) || urlOf(text)) return "";
  const found = text.match(RECIPE_HEAD);
  return found && found[1].length <= 40 ? tidy(found[1]) : "";
};

type Segment = { kind: "recipe" | "dayplan" | "plain"; head: string; lines: string[] };

/** 구획 제목 없이 이어 붙은 댓글을 요리·요일별 계획으로 다시 나눈다. */
function segmentsOf(lines: readonly string[]): Segment[] {
  const segments: Segment[] = [];
  let current: Segment = { kind: "plain", head: "", lines: [] };
  const flush = () => {
    if (current.lines.some((line) => line.trim()) || current.head) segments.push(current);
  };
  for (const line of lines) {
    const day = line.trim().match(DAY_HEAD);
    if (day) {
      flush();
      current = { kind: "dayplan", head: tidy(day[1]), lines: [] };
      continue;
    }
    const recipe = recipeHeadOf(line.trim());
    if (recipe) {
      flush();
      current = { kind: "recipe", head: recipe, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  flush();
  return segments;
}

// ---------------------------------------------------------------------------
// 덩이별 읽기
// ---------------------------------------------------------------------------

type Sink = {
  places: NoticePlace[];
  stays: NoticeStay[];
  transports: NoticeTransport[];
  recipes: NoticeRecipe[];
  packing: NoticePacking[];
  schedule: NoticeSchedule[];
  memos: string[];
  dishes: string[];
  leftovers: string[];
};

/** 빈 줄로 갈라진 묶음. 장소 한 곳이 이름·링크·주소 여러 줄로 적힌다. */
const entriesOf = (lines: readonly string[]) => {
  const entries: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) entries.push(current);
      current = [];
      continue;
    }
    current.push(line.trim());
  }
  if (current.length) entries.push(current);
  return entries;
};

type Entry = { name: string; note: string; mapUrl: string; otherUrl: string; address: string; rest: string[] };

const readEntry = (lines: readonly string[]): Entry => {
  const entry: Entry = { name: "", note: "", mapUrl: "", otherUrl: "", address: "", rest: [] };
  for (const line of lines) {
    if (isLinkLine(line)) {
      const url = urlOf(line);
      if (isMapUrl(url)) entry.mapUrl ||= url;
      else entry.otherUrl ||= url;
      continue;
    }
    const bracket = line.match(BRACKET);
    if (bracket && !bracket[2]) {
      entry.note = entry.note ? `${entry.note} ${bracket[1]}` : bracket[1];
      continue;
    }
    const text = stripEmoji(line.replace(/^[-•*]\s+/, ""));
    if (!text || NOISE.test(text)) continue;
    if (!entry.name) entry.name = text;
    else if (!entry.address) entry.address = text;
    else entry.rest.push(text);
  }
  return entry;
};

function readPlaces(lines: readonly string[], sink: Sink) {
  for (const group of entriesOf(lines)) {
    const entry = readEntry(group);
    if (!entry.name) {
      if (entry.mapUrl || entry.otherUrl) sink.leftovers.push(entry.mapUrl || entry.otherUrl);
      continue;
    }
    sink.places.push({
      name: entry.name.slice(0, 100),
      address: entry.address.slice(0, 300),
      mapUrl: entry.mapUrl,
      note: entry.note,
    });
    sink.leftovers.push(...entry.rest);
    if (entry.otherUrl) sink.leftovers.push(entry.otherUrl);
  }
}

function readStay(lines: readonly string[], sink: Sink) {
  let bookingUrl = "";
  for (const group of entriesOf(lines)) {
    const entry = readEntry(group);
    if (!entry.name) {
      bookingUrl ||= entry.otherUrl || entry.mapUrl;
      continue;
    }
    sink.stays.push({
      name: entry.name.slice(0, 100),
      address: entry.address.slice(0, 300),
      mapUrl: entry.mapUrl,
      checkIn: "",
      checkOut: "",
      bookingUrl: entry.otherUrl,
    });
    sink.leftovers.push(...entry.rest);
  }
  const first = sink.stays[sink.stays.length - 1];
  if (first && !first.bookingUrl) first.bookingUrl = bookingUrl;
  else if (!first && bookingUrl) sink.leftovers.push(bookingUrl);
}

/** 예약 구획. 체크인·체크아웃 시각과 예약 링크가 온다. 숙소에 붙인다. */
function readBooking(lines: readonly string[], sink: Sink) {
  const stay = sink.stays[0];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isLinkLine(line)) {
      const url = urlOf(line);
      if (stay && !stay.bookingUrl) stay.bookingUrl = url;
      else sink.leftovers.push(url);
      continue;
    }
    const time = line.match(/^(체크\s*인|체크\s*아웃|입실|퇴실)\s*[:：]?\s*(\d{1,2}):(\d{2})$/);
    if (time && stay) {
      const clock = `${pad(Number(time[2]))}:${time[3]}`;
      if (/인|입실/.test(time[1])) stay.checkIn = clock;
      else stay.checkOut = clock;
      continue;
    }
    if (!NOISE.test(line)) sink.leftovers.push(line);
  }
}

const METHODS: [RegExp, NoticeTransportMethod][] = [
  [/^KTX/i, "KTX"],
  [/^SRT/i, "SRT"],
  [/버스/, "버스"],
  [/항공|비행/, "항공"],
];

const TRANSPORT_LINE = new RegExp(
  "^(?:[-•*]\\s*)?([^:：]{1,20}?)\\s*[:：]\\s*(\\S+)\\s+(.+?)\\s+(\\d{1,2}:\\d{2})" +
  "\\s*(?:→|->|~|–|—|―)\\s*(.+?)\\s+(\\d{1,2}:\\d{2})\\s*(?:\\(([^)]*)\\))?$",
);

function readTransport(lines: readonly string[], sink: Sink) {
  let direction: NoticeTransport["direction"] = "가는 편";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^가는\s*편|^출발|^갈\s*때/.test(line)) {
      direction = "가는 편";
      continue;
    }
    if (/^오는\s*편|^돌아|^올\s*때/.test(line)) {
      direction = "오는 편";
      continue;
    }
    const found = line.match(TRANSPORT_LINE);
    if (!found) {
      if (!NOISE.test(line)) sink.leftovers.push(line);
      continue;
    }
    const [, owner, rawMethod, departure, departureTime, arrival, arrivalTime, tail] = found;
    sink.transports.push({
      owner: tidy(owner).slice(0, 20),
      direction,
      method: METHODS.find(([pattern]) => pattern.test(rawMethod))?.[1] ?? "기타",
      departure: tidy(departure).slice(0, 40),
      departureTime,
      arrival: tidy(arrival).slice(0, 40),
      arrivalTime,
      booked: /완료|예매함|했음/.test(tail ?? ""),
    });
  }
}

function readPacking(lines: readonly string[], sink: Sink) {
  let owner = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;
    const bracket = line.match(BRACKET);
    if (bracket && !bracket[2]) {
      owner = tidy(bracket[1]).slice(0, 20);
      continue;
    }
    if (isLinkLine(line)) {
      sink.leftovers.push(line.trim());
      continue;
    }
    const text = stripEmoji(line.replace(/^[-•*]\s+/, ""));
    // `카메라 1대, 여분 배터리 2개` 는 두 가지다. 쉼표로 나눈다.
    for (const piece of text.split(",")) {
      const { name, quantity } = splitQuantity(piece);
      if (!name) continue;
      sink.packing.push({ name: name.slice(0, 60), quantity: quantity.slice(0, 60), owner });
    }
  }
}

function readDishes(lines: readonly string[], sink: Sink) {
  for (const raw of lines) {
    const line = stripEmoji(raw.trim().replace(/^[-•*]\s+/, ""));
    if (!line || NOISE.test(line) || BRACKET.test(line) || isLinkLine(line)) continue;
    for (const piece of line.split(",")) {
      const name = tidy(piece);
      if (name) sink.dishes.push(name.slice(0, 60));
    }
  }
}

/** `[재료]`·`[조리 순서]` 같은 흐름 표시. 분류가 아니다. */
const isRecipePart = (label: string) => /^(재료|조리\s*순서|만드는\s*법|순서|레시피)$/.test(tidy(label));

function readRecipe(head: string, lines: readonly string[], sink: Sink) {
  const body = lines.filter((line) => line.trim() && !NOISE.test(line.trim()));
  // 한 덩이 안에서 `-` 가 재료 앞에 붙는 표시인지, 곁글의 시작인지 가른다.
  const bulleted = body.filter((line) => BULLET.test(line.trim())).length * 2 >= body.length;
  const ingredients: NoticeIngredient[] = [];
  const notes: string[] = [];
  const steps: string[] = [];
  let group = "";
  let inSteps = false;
  for (const raw of body) {
    const line = raw.trim();
    const bracket = line.match(BRACKET);
    if (bracket) {
      const label = tidy(bracket[1]);
      inSteps = /조리|순서|만드는/.test(label);
      group = inSteps || isRecipePart(label) ? "" : label.slice(0, 30);
      const tail = tidy(bracket[2].replace(/^[-–—:：]\s*/, ""));
      if (tail) notes.push(group ? `${group}: ${tail}` : tail);
      continue;
    }
    const numbered = line.match(NUMBERED);
    if (numbered) {
      steps.push(`${numbered[1]}. ${numbered[2]}`);
      continue;
    }
    if (inSteps) {
      notes.push(line);
      continue;
    }
    if (isLinkLine(line)) {
      notes.push(urlOf(line));
      continue;
    }
    const bullet = line.match(BULLET);
    if (bullet && !bulleted) {
      notes.push(bullet[1]);
      continue;
    }
    const { name, quantity } = splitQuantity(stripEmoji(bullet ? bullet[1] : line));
    if (!name) continue;
    if (looksLikeNote(name, quantity)) {
      notes.push(name);
      continue;
    }
    ingredients.push({
      name: name.slice(0, 60),
      quantity: quantity.slice(0, 60),
      group,
      buy: /현지|사기|사서|사 오|구매/.test(group),
    });
  }
  const note = [...steps, ...notes].join("\n").slice(0, 2000);
  const name = tidy(head).slice(0, 60);
  const already = sink.recipes.find((recipe) => recipe.name === name);
  if (already) {
    already.ingredients.push(...ingredients);
    already.note = [already.note, note].filter(Boolean).join("\n").slice(0, 2000);
    return;
  }
  sink.recipes.push({ name, note, ingredients });
}

const MEAL = /아침|점심|저녁|브런치|디너|런치|간식|야식|식사/;

/** `[금요일]` 아래의 `- 점심 : 온기식탁` 같은 줄. `메뉴` 뒤의 줄은 요리다. */
function readDayPlan(head: string, lines: readonly string[], dates: readonly string[], sink: Sink) {
  const weekday = head.match(/([월화수목금토일])요일|^([월화수목금토일])$/);
  const day = weekday ? weekday[1] ?? weekday[2] : "";
  const date = day ? dates.find((key) => weekdayOf(key) === day) ?? "" : "";
  let menu = false;
  for (const raw of lines) {
    const line = stripEmoji(raw.trim());
    if (!line) continue;
    if (/^메뉴$/.test(line)) {
      menu = true;
      continue;
    }
    const bullet = line.match(BULLET);
    const text = bullet ? bullet[1] : line;
    const parts = text.match(/^(?:(\d{1,2}:\d{2})\s+)?([^:：]+?)\s*[:：]\s*(\S.*)$/);
    if (!parts) {
      if (menu) {
        for (const piece of text.split(",")) {
          const name = tidy(piece);
          if (name) sink.dishes.push(name.slice(0, 60));
        }
      } else if (!NOISE.test(text)) {
        sink.leftovers.push(raw.trim());
      }
      continue;
    }
    const [, time, label, title] = parts;
    sink.schedule.push({
      date,
      time: time ? `${pad(Number(time.split(":")[0]))}:${time.split(":")[1]}` : "",
      title: tidy(title).slice(0, 60),
      note: tidy(label).slice(0, 2000),
      type: MEAL.test(label) ? "meal" : "other",
    });
  }
}

function readMemo(lines: readonly string[], sink: Sink) {
  const body = lines
    .map((line) => stripEmoji(line))
    .filter((line, index, all) => line || (index > 0 && all[index - 1]))
    .join("\n")
    .trim();
  if (body) sink.memos.push(body.slice(0, 2000));
}

/** 구획 제목이 없는 덩이. 요리·요일별 계획·예약·글 중 어느 것인지 살펴본다. */
function readUnknown(lines: readonly string[], dates: readonly string[], sink: Sink) {
  for (const segment of segmentsOf(lines)) {
    if (segment.kind === "recipe") {
      readRecipe(segment.head, segment.lines, sink);
      continue;
    }
    if (segment.kind === "dayplan") {
      readDayPlan(segment.head, segment.lines, dates, sink);
      continue;
    }
    const body = segment.lines.filter((line) => line.trim() && !NOISE.test(line.trim()));
    if (!body.length) continue;
    if (body.some((line) => /체크\s*(인|아웃)|입실|퇴실/.test(line))) {
      readBooking(body, sink);
      continue;
    }
    // 마침표나 긴 문장이 섞여 있으면 글로 본다. 아니면 읽지 못한 줄로 남긴다.
    const prose = body.filter((line) => line.trim().length >= 20).length;
    if (prose * 2 >= body.length) readMemo(segment.lines, sink);
    else sink.leftovers.push(...body.map((line) => line.trim()));
  }
}

// ---------------------------------------------------------------------------
// 공지 한 편
// ---------------------------------------------------------------------------

const HEADLINE = /^#{0,3}\s*제목\s*[:：]/;

/**
 * 공지 여러 편이 붙어 있으면 `# 제목:` 머리글마다 가른다.
 *
 * 머리글이 없으면 통째로 한 편이다. 머리글 앞의 글(문서 머리말 같은 것)은 버린다.
 */
export function splitNotices(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const heads = lines.map((line, index) => (HEADLINE.test(line.trim()) ? index : -1)).filter((index) => index >= 0);
  if (!heads.length) return [text.trim() ? text : ""].filter(Boolean);
  return heads.map((start, order) => lines.slice(start, heads[order + 1] ?? lines.length).join("\n"));
}

const todayKey = () => {
  const now = new Date();
  return keyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

/**
 * 공지 한 편을 여행 초안으로.
 *
 * `today` 는 연도 없이 적힌 날을 올해로 볼지 작년으로 볼지 가르는 데만 쓴다.
 */
export function parseNotice(text: string, options: { today?: string } = {}): NoticeDraft {
  const today = options.today ?? todayKey();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const headIndex = lines.findIndex((line) => HEADLINE.test(line.trim()));
  const headline = headIndex >= 0 ? parseHeadline(lines[headIndex], today) : { title: "", startDate: "", endDate: "" };
  const dates = tripDates(headline.startDate, headline.endDate);
  const sink: Sink = {
    places: [], stays: [], transports: [], recipes: [], packing: [], schedule: [], memos: [], dishes: [], leftovers: [],
  };
  const body = headIndex >= 0 ? lines.slice(headIndex + 1) : lines;
  for (const block of blocksOf(body)) {
    switch (block.kind) {
      case "places": readPlaces(block.lines, sink); break;
      case "stay": readStay(block.lines, sink); break;
      case "booking": readBooking(block.lines, sink); break;
      case "transport": readTransport(block.lines, sink); break;
      case "packing": readPacking(block.lines, sink); break;
      case "dishes": readDishes(block.lines, sink); break;
      case "memo": readMemo(block.lines, sink); break;
      default: readUnknown(block.lines, dates, sink);
    }
  }
  // 이름만 적힌 요리와 재료까지 적힌 요리를 하나로 묶는다. 적힌 차례를 지킨다.
  const recipes: NoticeRecipe[] = [];
  for (const name of sink.dishes) {
    if (recipes.some((recipe) => recipe.name === name)) continue;
    recipes.push(sink.recipes.find((recipe) => recipe.name === name) ?? { name, note: "", ingredients: [] });
  }
  for (const recipe of sink.recipes) {
    if (!recipes.some((already) => already.name === recipe.name)) recipes.push(recipe);
  }
  return {
    title: headline.title,
    startDate: headline.startDate,
    endDate: headline.endDate,
    regionName: regionOfTitle(headline.title),
    places: sink.places,
    stays: sink.stays,
    transports: sink.transports,
    recipes,
    packing: sink.packing,
    schedule: sink.schedule,
    memos: sink.memos,
    leftovers: sink.leftovers.filter((line) => line.trim()),
  };
}
