import type { TripDetailDestination } from "./tripPlanning.ts";

/**
 * 앱이 지금 어디를 보고 있는지를 담는 한 객체와, 그것을 주소 글로 바꾸는 순수 함수.
 *
 * 예전에는 보고 있는 자리가 `WarmAppShell` 안에 흩어져 있었다. 아래 탭(`view`),
 * 여행 상세를 열었는가(`isTripOpen`), 상세의 어느 자리인가(`tripDestination`),
 * 어느 여행인가(`selectedTrip`) 가 따로 놀아서, 「지금 어디」를 한 줄로 적을 수가
 * 없었다. 적을 수 없으니 주소로도 못 옮겼고, 그래서 딥링크와 웹 공유가 초대 링크
 * 하나뿐이었다.
 *
 * 여기서는 그것을 한 객체(`앱위치`)로 모으고, `위치 ↔ 주소` 를 바꾸는 함수만 둔다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다
 * (`TripDetailDestination` 은 타입만 가져오므로 돌 때는 남지 않는다).
 *
 * **아직 주소창을 바꾸지는 않는다.** 웹 앱은 `www.daymo.xyz/app` 한 자리에만 있고
 * 그 아래 주소를 되돌려 주는 규칙이 없다(`site/build.mjs` 는 `/oauth` 만 돌려놓는다).
 * 주소를 바꿔 두면 새로 고침이 404 가 된다. 주소로 여는 일은 Expo Router 를 얹는
 * 다음 단계에서 한다.
 */

/** 아래 탭 넷. */
export type 탭이름 = "홈" | "여행" | "찾기" | "우리";

/**
 * 지금 보고 있는 자리.
 *
 * 여행 상세는 탭 위에 통째로 덮인다. 그래도 `탭` 은 그대로 들고 있는다 —
 * 상세를 닫으면 열기 전에 있던 탭으로 돌아와야 하기 때문이다.
 */
export type 앱위치 = {
  탭: 탭이름;
  /** 열어 둔 여행 상세. 안 열었으면 `null`. `id` 는 서버에 아직 없는 여행이면 빈 글. */
  여행: { id: string; 자리: TripDetailDestination } | null;
};

/** 앱을 처음 열었을 때. */
export const 첫_위치: 앱위치 = { 탭: "홈", 여행: null };

const 탭_주소: Record<탭이름, string> = {
  홈: "/",
  여행: "/trips",
  찾기: "/search",
  우리: "/us",
};

const 주소_탭: Record<string, 탭이름> = {
  trips: "여행",
  search: "찾기",
  us: "우리",
};

/**
 * 상세에서 갈 수 있는 자리.
 *
 * `Record<TripDetailDestination, true>` 라서 자리를 새로 늘리면 여기가 먼저 깨진다.
 * 주소로 부를 수 있는 자리를 적는 것을 잊지 않으려고 이렇게 적었다.
 */
const 상세_자리: Record<TripDetailDestination, true> = {
  overview: true,
  "schedule-add": true,
  places: true,
  preparation: true,
  cooking: true,
  expenses: true,
  memories: true,
};

const 여행_마디 = "trips";

/**
 * 위치를 주소 글로 적는다.
 *
 * 여행 상세를 열어 두었으면 아래 탭은 주소에 안 들어간다. 상세는 화면을 통째로
 * 덮으므로 보이는 것이 그것 하나뿐이고, 주소를 받은 사람도 상세부터 봐야 한다.
 *
 * 아직 서버에 없는 여행(`id` 가 빈 글)은 남에게 보낼 주소가 없다. 그럴 때는 탭
 * 주소로 내려간다.
 */
export function locationToPath(위치: 앱위치): string {
  const 여행 = 위치.여행;
  if (여행 && 여행.id) {
    const id = encodeURIComponent(여행.id);
    return 여행.자리 === "overview"
      ? `/${여행_마디}/${id}`
      : `/${여행_마디}/${id}/${여행.자리}`;
  }
  return 탭_주소[위치.탭];
}

/**
 * 주소 글을 위치로 읽는다. 모르는 주소는 `null` — 막지 말고 홈으로 보내라는 뜻이다.
 *
 * 물음표·우물정 뒤는 버린다. 여행 상세 주소에는 탭이 없으므로 「여행」 탭을 깔아 둔다.
 */
export function pathToLocation(주소: string): 앱위치 | null {
  const 길 = 주소.split(/[?#]/)[0];
  let 조각: string[];
  try {
    조각 = 길.split("/").filter((하나) => 하나.length > 0).map(decodeURIComponent);
  } catch {
    // `%` 하나만 있는 것 같은 망가진 주소. 읽을 수 없으니 모르는 주소로 본다.
    return null;
  }
  if (조각.length === 0) return { 탭: "홈", 여행: null };
  if (조각[0] === 여행_마디) {
    if (조각.length === 1) return { 탭: "여행", 여행: null };
    const id = 조각[1];
    if (!id) return null;
    if (조각.length === 2) return { 탭: "여행", 여행: { id, 자리: "overview" } };
    if (조각.length === 3 && Object.hasOwn(상세_자리, 조각[2])) {
      return { 탭: "여행", 여행: { id, 자리: 조각[2] as TripDetailDestination } };
    }
    return null;
  }
  if (조각.length === 1 && Object.hasOwn(주소_탭, 조각[0])) {
    return { 탭: 주소_탭[조각[0]], 여행: null };
  }
  return null;
}

/** 아래 탭을 옮긴다. 여행 상세는 열려 있으면 그대로 둔다(지금 화면과 같다). */
export function 탭_고르기(위치: 앱위치, 탭: 탭이름): 앱위치 {
  return 위치.탭 === 탭 ? 위치 : { ...위치, 탭 };
}

/** 여행 상세를 연다. 깔린 탭은 그대로 둔다 — 닫으면 그리로 돌아온다. */
export function 여행_열기(
  위치: 앱위치,
  id: string,
  자리: TripDetailDestination,
): 앱위치 {
  return { ...위치, 여행: { id, 자리 } };
}

/** 여행 상세를 닫는다. */
export function 여행_닫기(위치: 앱위치): 앱위치 {
  return 위치.여행 === null ? 위치 : { ...위치, 여행: null };
}
