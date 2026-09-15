/**
 * 서버의 공간·멤버 값을 앱의 말로 옮긴다.
 *
 * 서버는 영문 값(`owner`, `couple`)을 쓰고 화면은 한국어 이름표(`관리자`,
 * `연인`)를 쓴다. 옮기는 곳이 화면 여기저기 흩어지면 한쪽만 고쳐져서 같은
 * 사람이 화면마다 다른 권한으로 보인다. 그래서 한 파일에 모았다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

export type ServerRole = "owner" | "editor" | "viewer";
export type ServerRelationship = "couple" | "friends" | "family" | "other";
export type AppRole = "관리자" | "편집 가능" | "보기만";
export type AppRelationship = "연인" | "친구";

export type ServerMemberInput = {
  id: string;
  displayName: string;
  role: ServerRole;
  isMe: boolean;
  /** 나간 멤버일 때만 있다. */
  leftAt?: string | null;
};

export type AppMember = { id: string; name: string; role: AppRole };

const roleNames: Record<ServerRole, AppRole> = {
  owner: "관리자",
  editor: "편집 가능",
  viewer: "보기만",
};

/** 화면의 권한 이름을 서버 값으로. */
export function roleToServer(role: AppRole): ServerRole {
  return role === "관리자" ? "owner" : role === "편집 가능" ? "editor" : "viewer";
}

/** 모르는 값은 가장 좁은 권한으로 읽는다. 넓게 읽으면 못 하는 일을 할 수 있는 것처럼 보인다. */
export function roleFromServer(role: string | null | undefined): AppRole {
  return roleNames[role as ServerRole] ?? "보기만";
}

/**
 * 앱에는 연인과 친구 둘뿐이다. 서버의 가족·기타는 친구로 보인다.
 * "함께한 지 N일째" 를 셀지만 가르는 값이라 둘로 충분하다.
 */
export function relationshipFromServer(type: string | null | undefined): AppRelationship {
  return type === "couple" ? "연인" : "친구";
}

/**
 * 화면에서 고른 관계를 서버 값으로 바꾼다.
 *
 * **보이는 값이 그대로면 서버 값을 건드리지 않는다.** 서버에 `family` 로
 * 저장된 공간은 앱에서 `친구` 로 보인다. 그 상태에서 `친구` 를 다시 눌렀다고
 * `friends` 로 덮어쓰면, 다른 기기에서 고른 가족이 말없이 사라진다.
 */
export function relationshipToServer(
  chosen: AppRelationship,
  current: string | null | undefined,
): ServerRelationship {
  if (current && relationshipFromServer(current) === chosen) {
    return current as ServerRelationship;
  }
  return chosen === "연인" ? "couple" : "friends";
}

/**
 * 멤버 목록에서 나를 뺀다.
 *
 * 앱의 `Space.members` 는 나를 뺀 사람들이다. 나는 계정에서 오고 목록
 * 맨 앞에 따로 붙는다. 서버 목록을 그대로 쓰면 내가 두 번 나온다.
 */
export function membersFromServer(members: ServerMemberInput[]): AppMember[] {
  return members
    .filter((member) => !member.isMe && !member.leftAt)
    .map((member) => ({ id: member.id, name: member.displayName, role: roleFromServer(member.role) }));
}

/** 공간을 나간 사람들. 화면의 멤버 목록에는 없고, 지난 기록의 이름을 찾을 때만 쓴다. */
export function formerMembersFromServer(members: ServerMemberInput[]): AppMember[] {
  return members
    .filter((member) => !member.isMe && Boolean(member.leftAt))
    .map((member) => ({ id: member.id, name: member.displayName, role: roleFromServer(member.role) }));
}

/** 공간 이름·관계·함께한 날을 바꿀 수 있는 사람. 서버가 owner 만 받는다. */
export function canEditSpace(myRole: AppRole | undefined): boolean {
  return myRole === "관리자";
}

export type SpaceChange = {
  name?: string;
  relationship?: AppRelationship;
  since?: string;
};

export type SpacePatch = {
  name?: string;
  relationshipType?: ServerRelationship;
  startedOn?: string | null;
};

/**
 * 화면의 변경을 서버에 보낼 본문으로 바꾼다. 보낼 것이 없으면 `null` 이다.
 *
 * 비어 있는 이름은 보내지 않는다. 글자를 모두 지우고 새로 치는 도중에도
 * 저장이 돌 수 있는데, 그때 빈 이름을 보내면 서버가 거부하고 사용자에게는
 * 저장 실패로 보인다. 아직 치고 있는 것일 뿐이다.
 *
 * 함께한 날은 `YYYY-MM-DD` 모양일 때만 보낸다. 빈 값은 "지웠다" 로 보고
 * `null` 을 보낸다.
 */
export function spacePatchFrom(change: SpaceChange, currentRelationship?: string | null): SpacePatch | null {
  const patch: SpacePatch = {};

  if (change.name !== undefined) {
    const name = change.name.trim();
    if (name) patch.name = name.slice(0, 40);
  }
  if (change.relationship !== undefined) {
    patch.relationshipType = relationshipToServer(change.relationship, currentRelationship);
  }
  if (change.since !== undefined) {
    if (change.since === "") patch.startedOn = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(change.since)) patch.startedOn = change.since;
  }

  return Object.keys(patch).length ? patch : null;
}
