/**
 * 서버가 준 공간·여행을 앱이 쓰는 모양으로 옮긴다.
 *
 * 옮기는 규칙만 있고 부르는 일은 없다. 이름·날짜·지역은 서버가 원본이고, 기기에만
 * 있는 기록(`planning`)은 여기서 건드리지 않는다(`tripMerge.ts` 가 붙인다).
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { tidyFocus } from "./coverCrop.ts";
import { dateRangeLabel } from "./dates.ts";
import type { ExpenseSettings, ServerSpace, ServerTrip } from "./serverData.ts";
import {
  formerMembersFromServer,
  membersFromServer,
  relationshipFromServer,
  roleFromServer,
  type ServerMemberInput,
} from "./spaceMapping.ts";
import type { Space } from "./spaces.ts";
import { toneOfTripId } from "./tripColor.ts";
import { parseTripOverview } from "./tripOverview.ts";
import type { Trip } from "./tripPlanning.ts";
import { namesFromIds, rosterOf, type LatestTrip, type RosterEntry } from "./tripSync.ts";

// 서버 공간을 앱의 공간으로 옮긴다. 멤버는 따로 받아 넘긴다.
//
// 함께한 날을 적지 않았으면 비워 둔다. 예전에는 오늘 날짜로 채웠는데, 그러면
// 적지도 않은 날이 "함께한 지 1일째" 로 보였다.
export const spaceFromServer = (space: ServerSpace, members: ServerMemberInput[] = []): Space => ({
  id: space.id,
  name: space.name,
  members: membersFromServer(members),
  formerMembers: formerMembersFromServer(members),
  relationship: relationshipFromServer(space.relationshipType),
  relationshipType: space.relationshipType,
  since: space.startedOn ?? "",
  myRole: roleFromServer(space.myRole),
  myMembershipId: members.find((member) => member.isMe)?.id,
});

/** 이 공간에서 이름과 membership id 를 오가는 표. 나는 앱이 쓰는 이름으로 들어간다. */
export const rosterOfSpace = (space: Space, myName: string): RosterEntry[] =>
  rosterOf({ name: myName, membershipId: space.myMembershipId }, space.members, space.formerMembers);

// 서버에 참가자가 정해져 있으면 이름으로 바꿔 기록(planning)의 참가자 칸에 둔다.
// 비어 있으면 서버 약속대로 "공간 멤버 전원" 이라 칸을 비워 둔다. 상세 화면이
// 비어 있는 칸을 멤버 전원으로 읽는다.
export const tripFromServer = (trip: ServerTrip, roster: RosterEntry[] = []): Trip => {
  const participants = namesFromIds(trip.participantMembershipIds ?? [], roster);
  const overview = parseTripOverview(trip.overview);
  return {
    id: trip.id,
    version: trip.version,
    name: trip.title,
    date: dateRangeLabel(trip.startDate, trip.endDate),
    note: trip.summary ?? "",
    // 색은 목록의 몇 번째인지가 아니라 여행 id 로 정한다. 목록 차례로 정하면
    // 기기마다, 목록을 다시 받을 때마다 같은 여행의 색이 달라진다.
    tone: toneOfTripId(trip.id),
    mark: trip.startDate.slice(5, 7),
    region: trip.regionName ?? "지역 미정",
    start: trip.startDate,
    end: trip.endDate,
    ...(participants.length ? { planning: { participants } } : {}),
    ...(overview ? { overview } : {}),
    serverExpenseSettings: expenseSettingsFrom(trip),
    // 해제한 것도 반영돼야 해서 없을 때도 싣는다(`...` 로 감추면 옛 값이 남는다).
    coverPhotoId: trip.coverPhotoId ?? undefined,
    coverCardId: trip.coverCardId ?? undefined,
    coverPhotoIds: trip.coverPhotoIds ?? [],
    coverCardStyle: trip.coverCardStyle ?? undefined,
    coverFocus: tidyFocus({ x: trip.coverFocusX ?? undefined, y: trip.coverFocusY ?? undefined, zoom: trip.coverZoom ?? undefined }),
    archived: trip.status === "archived",
    ...(trip.deletionScheduledAt ? { deletionScheduledAt: trip.deletionScheduledAt } : {}),
  };
};

/** 홈 카드 숫자를 셀 때 넘기는 칸. */
export const tripForSummary = (trip: Trip) => ({
  overview: trip.overview,
  planning: trip.planning,
  serverCurrency: trip.serverExpenseSettings?.currency,
});

export const expenseSettingsFrom = (trip: ServerTrip): ExpenseSettings => ({
  currency: trip.currencyCode ?? "KRW",
  exchangeRate: trip.exchangeRate == null ? 1 : Number(trip.exchangeRate),
  budget: trip.budget == null ? 0 : Number(trip.budget),
  simplifySettlement: trip.simplifySettlement ?? true,
});

export const latestTripFrom = (trip: ServerTrip, roster: RosterEntry[]): LatestTrip => {
  const participants = namesFromIds(trip.participantMembershipIds ?? [], roster);
  return {
    name: trip.title,
    start: trip.startDate,
    end: trip.endDate,
    region: trip.regionName ?? "지역 미정",
    note: trip.summary ?? "",
    ...(participants.length ? { participants } : {}),
  };
};
