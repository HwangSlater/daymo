/**
 * 여행 참가자를 서버와 맞춘다.
 *
 * 앱 안에서 참가자는 이름이다. 지출의 낸 사람, 준비물 담당, 몫이 전부 이름으로
 * 적혀 있다. 서버는 공간 membership id 로 받는다. 이름을 id 로 바꾸는 표가
 * 여기 있다. 표 안의 이름은 겹치지 않고, 이름이 바뀌면 기록이 따라간다
 * (`people.ts`).
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { uniqueNames } from "./people.ts";

/** 이름과 membership id 한 쌍. 나를 맨 앞에 둔다. */
export type RosterEntry = { id: string; name: string };

/**
 * 공간의 사람 표를 만든다.
 *
 * 내 이름은 서버 이름이 아니라 앱이 쓰는 이름(`user.name`)이다. 여행 기록에
 * 적힌 "나" 가 그 이름이라, 서버 이름을 쓰면 내 지출이 남의 것처럼 보인다.
 * id 를 모르는 사람은 뺀다. 서버에서 받지 않은 멤버다.
 *
 * 나간 멤버(`former`)도 넣는다. 지난 여행의 지출·준비물이 그 사람을 가리킨다.
 * 이름이 겹치면 뒤 사람에게 번호를 붙인다(`하늘 2`). 나 → 지금 멤버 → 나간 멤버 순이다.
 */
export function rosterOf(
  me: { name: string; membershipId?: string },
  members: { id?: string; name: string }[],
  former: { id?: string; name: string }[] = [],
): RosterEntry[] {
  const people: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined, name: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    people.push({ id, name });
  };
  add(me.membershipId, me.name);
  for (const member of members) add(member.id, member.name);
  for (const member of former) add(member.id, member.name);
  const names = uniqueNames(people.map((person) => person.name));
  return people.map((person, index) => ({ id: person.id, name: names[index] }));
}

/** 서버의 참가자 id 를 이름으로. 표에 없는 id(나간 멤버)는 뺀다. */
export function namesFromIds(ids: readonly string[], roster: readonly RosterEntry[]): string[] {
  const byId = new Map(roster.map((entry) => [entry.id, entry.name]));
  return ids.flatMap((id) => {
    const name = byId.get(id);
    return name === undefined ? [] : [name];
  });
}

/**
 * 고른 이름을 서버 id 로.
 *
 * 같은 이름이 둘이면 앞에서부터 하나씩 짝짓는다. 표에 없는 이름은 `unknown` 에
 * 담아 돌려준다. 서버로는 보내지 못하는 사람이다.
 */
export function idsFromNames(
  names: readonly string[],
  roster: readonly RosterEntry[],
): { ids: string[]; unknown: string[] } {
  const used = new Set<string>();
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const entry = roster.find((candidate) => candidate.name === name && !used.has(candidate.id));
    if (entry) {
      used.add(entry.id);
      ids.push(entry.id);
    } else {
      unknown.push(name);
    }
  }
  return { ids, unknown };
}

/** 순서까지 같은지. 서버는 고른 순서를 지켜 저장하므로 순서가 바뀌어도 새로 보낸다. */
export function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** 다른 기기가 먼저 고친 여행. 화면이 이 값으로 다시 그린다. */
export type LatestTrip = {
  name: string;
  start: string;
  end: string;
  region: string;
  note: string;
  /** 서버에 참가자가 정해져 있을 때만. 비어 있으면 화면의 목록을 그대로 둔다. */
  participants?: string[];
};

/**
 * 저장하려던 여행을 다른 곳에서 먼저 고쳤다.
 *
 * 앱이 최신 내용을 받아 `latest` 에 담아 던진다. 화면은 이것을 받으면 고치던
 * 값을 버리고 최신 내용을 보여 준다. 그냥 다시 저장하게 두면 남이 고친 것을
 * 모른 채 덮어쓴다.
 */
export class TripConflictError extends Error {
  // 생성자 매개변수로 필드를 만드는 문법은 node 의 타입 지우기가 받지 않는다.
  readonly latest: LatestTrip;

  constructor(latest: LatestTrip) {
    super("다른 곳에서 먼저 바뀌었어요. 최신 내용으로 다시 보여 줄게요.");
    this.latest = latest;
  }
}
