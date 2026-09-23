import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

/**
 * 여행 공간과 멤버.
 *
 * 기기 설정(deviceSettings)과 달리 이 값들은 원래 **함께 보는 것**이다. 공간 이름을
 * 바꾸면 같은 공간의 다른 사람 화면에서도 바뀌어야 하고, 멤버와 권한은 서버가
 * 원본을 갖는다. 서버가 붙으면 여기 저장된 것은 받아온 목록의 캐시가 된다.
 * 그래서 기기 설정과 같은 파일에 섞지 않고 따로 둔다.
 *
 * 예전에는 이 값들이 "우리" 탭 컴포넌트 안의 useState 였다. 그 탭은 조건부로
 * 그려져서 홈에 한 번 갔다 오기만 해도 언마운트됐고, 공간 이름을 바꿔도 되돌아가
 * 있었다. 게다가 나머지 화면은 이 state 가 아니라 모듈 상수를 읽고 있어서, 멤버
 * 이름을 고쳐도 여행의 참가자 목록에는 옛 이름이 그대로 남았다.
 */

export type MemberRole = "관리자" | "편집 가능" | "보기만";

const memberRoles: readonly MemberRole[] = ["관리자", "편집 가능", "보기만"];

export type Member = {
  /** 서버의 membership id. 서버에서 받은 멤버에만 있다. */
  id?: string;
  name: string;
  role: MemberRole;
};

export type Relationship = "연인" | "친구";

export type Space = {
  id: string;
  name: string;
  /** 나를 뺀 사람들. 나는 내 프로필에서 오고 늘 첫 번째다. */
  members: Member[];
  /** 공간을 나간 사람들. 지난 여행의 지출·준비물이 가리키는 이름을 찾을 때만 쓴다. */
  formerMembers?: Member[];
  relationship: Relationship;
  /** 함께하기 시작한 날. 연인 공간에서만 "함께한 지 N일째" 로 쓴다. 적지 않았으면 비어 있다. */
  since: string;
  /**
   * 이 공간에서 내 권한. 서버에서 받았을 때만 있다.
   *
   * 없으면 무엇을 바꿀 수 있는지 모른다는 뜻이라 바꾸지 못하게 둔다.
   */
  myRole?: MemberRole;
  /**
   * 서버에 저장된 관계 값 그대로. 앱은 연인·친구만 보여 주지만 서버에는
   * 가족·기타도 있어서, 이것을 들고 있어야 바꾸지 않은 관계를 덮어쓰지 않는다.
   */
  relationshipType?: string;
  /** 이 공간에서 내 membership id. 여행 참가자에 나를 넣을 때 쓴다. */
  myMembershipId?: string;
};

/**
 * 저장된 것이 없을 때 쓰는 빈 공간 한 칸.
 *
 * 2026-09-23 까지는 여기에 「우리의 여행 공간」·「주말 여행 메이트」 같은 예시 공간
 * 셋이 들어 있었다. 서버 조회가 한 번 실패한 새 기기에서 모르는 멤버(다온·여울·가람)와
 * 남의 여행이 진짜처럼 떴고, 거기서 여행을 만들면 없는 공간에 보내 실패했다.
 * 가상 데이터는 실제 계정 화면에 섞지 않는다.
 */
const 빈_공간 = (id: string): Space => ({
  id,
  name: "여행 공간",
  members: [],
  relationship: "친구",
  since: "",
});

const storageKey = "daymo.spaces.v1";
// 이름은 글자를 칠 때마다 바뀐다. 잠깐 모았다가 한 번만 쓴다.
const writeDelay = 400;

/** 화면을 망가뜨리지 않을 길이의 글자인지만 본다. 이름은 자유 문구라 목록으로 못 거른다. */
const shortText = (value: unknown, fallback: string, max = 40) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max
    ? value
    : fallback;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

function parseMember(value: unknown): Member | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = shortText(record.name, "", 20);
  if (!name) return null;
  const member: Member = { name, role: oneOf(record.role, memberRoles, "편집 가능") };
  const id = shortText(record.id, "", 64);
  if (id) member.id = id;
  return member;
}

function parseSpace(value: unknown, fallback: Space): Space {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const id = shortText(record.id, fallback.id);
  const members = Array.isArray(record.members)
    ? record.members.map(parseMember).filter((member): member is Member => member !== null)
    : fallback.members;
  const space: Space = {
    id,
    name: shortText(record.name, fallback.name),
    members,
    relationship: oneOf(record.relationship, ["연인", "친구"] as const, fallback.relationship),
    // 서버에서 함께한 날을 적지 않은 공간은 빈 값으로 저장된다. 기본값으로
    // 되돌리면 적지도 않은 날짜가 "함께한 지 N일째" 로 보인다.
    since: typeof record.since === "string" && record.since.length <= 40 ? record.since : fallback.since,
  };
  // 오프라인으로 열었을 때도 내 권한을 알아야 바꿀 수 있는 것을 가를 수 있다.
  if (typeof record.myRole === "string" && (memberRoles as readonly string[]).includes(record.myRole)) {
    space.myRole = record.myRole as MemberRole;
  }
  const relationshipType = shortText(record.relationshipType, "", 20);
  if (relationshipType) space.relationshipType = relationshipType;
  const myMembershipId = shortText(record.myMembershipId, "", 64);
  if (myMembershipId) space.myMembershipId = myMembershipId;
  return space;
}

/**
 * 저장된 공간 목록을 읽는다.
 *
 * 저장된 것이 없거나 읽을 수 없으면 **빈 목록**이다. 예시 공간으로 채우지 않는다.
 * 빈 목록은 「아직 받지 못했다」는 뜻이고, 화면은 서버에서 받아 보고 그래도 없으면
 * 첫 공간을 만들자고 하거나 불러오지 못했다고 알린다(WarmAppShell).
 */
export function parseSpaces(raw: string | null): Space[] {
  if (!raw) return [];
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(saved)) return [];
  return saved.map((value, index) => parseSpace(value, 빈_공간(`space-${index + 1}`)));
}

export function useStoredSpaces(): Space[] | null {
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  useEffect(() => {
    let alive = true;
    const done = (value: Space[]) => {
      if (alive) setSpaces(value);
    };
    AsyncStorage.getItem(storageKey)
      .then((raw) => done(parseSpaces(raw)))
      .catch(() => done([]));
    return () => {
      alive = false;
    };
  }, []);
  return spaces;
}

/** 값이 바뀔 때만 저장한다. 실패해도 알리지 않고 다음 변경에서 다시 쓴다. */
export function useSaveSpaces(spaces: Space[]) {
  const written = useRef(false);
  useEffect(() => {
    // 첫 실행은 방금 읽어온 값을 그대로 되쓰는 것뿐이라 건너뛴다.
    if (!written.current) {
      written.current = true;
      return;
    }
    const timer = setTimeout(() => {
      AsyncStorage.setItem(storageKey, JSON.stringify(spaces)).catch(() => {});
    }, writeDelay);
    return () => clearTimeout(timer);
  }, [spaces]);
}


// ---------------------------------------------------------------------------
// 나
//
// 공간·멤버와 같은 성격이다. 서버가 붙으면 계정이 원본을 갖고 여기 남는 것은
// 캐시가 된다. 기기 설정과 섞지 않는 이유도 같다.
// ---------------------------------------------------------------------------

export type Me = { name: string; email: string };

/** 저장된 값이 망가졌을 때의 자리. 화면에 보이지 않는다(세션의 사용자가 원본이다). */
export const defaultMe: Me = { name: "", email: "" };

const meKey = "daymo.me.v1";

function parseMe(raw: string | null): Me | null {
  if (!raw) return defaultMe;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return defaultMe;
  }
  // 로그아웃하면 빈 값을 적어 둔다. 다시 열었을 때 로그인 화면이어야 한다.
  if (saved === null) return null;
  if (!saved || typeof saved !== "object") return defaultMe;
  const record = saved as Record<string, unknown>;
  return {
    name: shortText(record.name, defaultMe.name, 20),
    email: shortText(record.email, defaultMe.email, 120),
  };
}

export function useStoredMe(): { value: Me | null } | null {
  const [me, setMe] = useState<{ value: Me | null } | null>(null);
  useEffect(() => {
    let alive = true;
    const done = (value: Me | null) => {
      if (alive) setMe({ value });
    };
    AsyncStorage.getItem(meKey)
      .then((raw) => done(parseMe(raw)))
      .catch(() => done(defaultMe));
    return () => {
      alive = false;
    };
  }, []);
  return me;
}

export function useSaveMe(me: Me | null) {
  const written = useRef(false);
  useEffect(() => {
    if (!written.current) {
      written.current = true;
      return;
    }
    const timer = setTimeout(() => {
      AsyncStorage.setItem(meKey, JSON.stringify(me)).catch(() => {});
    }, writeDelay);
    return () => clearTimeout(timer);
  }, [me]);
}

/**
 * 계정이 바뀔 때 지우는 것. 그 계정의 공간·나, 그리고 부르는 쪽이 더 주는 열쇠다.
 *
 * 테마·다크 모드 같은 기기 취향은 남긴다. 계정을 바꿨다고 앱 모양까지 초기화되면
 * 무엇이 지워졌는지 알기 어렵다.
 */
export async function clearAccountCache(extraKeys: string[] = []) {
  await AsyncStorage.multiRemove([storageKey, meKey, ...extraKeys]).catch(() => {});
}

/**
 * 이 기기에 남은 Daymo 값을 전부 지운다(「이 기기 데이터 모두 삭제」).
 *
 * 열쇠를 하나씩 세어 두면 새로 생긴 것을 빠뜨린다. `daymo.` 로 시작하는 것을 모두
 * 걷어 내고, 남겨야 하는 것만 `keep` 으로 받는다(설치 번호 — 지우면 다시 로그인할 때
 * 기기 한도 한 자리를 더 먹는다).
 */
export async function clearDeviceStorage(keep: readonly string[] = []) {
  try {
    const 남길_것 = new Set(keep);
    const 열쇠들 = (await AsyncStorage.getAllKeys())
      .filter((key) => key.startsWith("daymo.") && !남길_것.has(key));
    if (열쇠들.length) await AsyncStorage.multiRemove(열쇠들);
  } catch {
    // 지우지 못해도 화면 상태는 아래에서 비운다.
  }
}
