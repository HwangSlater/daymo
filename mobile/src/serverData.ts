import { authenticatedRequest } from "./auth";
import type { ServerMemberInput, ServerRelationship, ServerRole, SpacePatch } from "./spaceMapping";

export type ServerSpace = {
  id: string;
  name: string;
  relationshipType: ServerRelationship;
  timezone: string;
  /** 함께하기 시작한 날. 적지 않았으면 비어 있다. */
  startedOn: string | null;
  myRole: ServerRole;
};

export type ServerTrip = {
  id: string;
  spaceId: string;
  title: string;
  regionCode: string | null;
  regionName: string | null;
  startDate: string;
  endDate: string;
  status: "planning" | "ongoing" | "completed" | "archived";
  summary: string | null;
  version: number;
  participantMembershipIds: string[];
};

export const listSpaces = () => authenticatedRequest<ServerSpace[]>("/v1/spaces");

export const createSpace = (name: string, relationshipType: ServerSpace["relationshipType"]) =>
  authenticatedRequest<ServerSpace>("/v1/spaces", {
    method: "POST",
    body: JSON.stringify({ name, relationshipType, timezone: "Asia/Seoul" }),
  });

export const listMembers = (spaceId: string) =>
  authenticatedRequest<ServerMemberInput[]>(`/v1/spaces/${encodeURIComponent(spaceId)}/members`);

/** 공간 이름·관계·함께한 날을 바꾼다. 서버는 관리자만 받는다. */
export const updateSpace = (spaceId: string, patch: SpacePatch) =>
  authenticatedRequest<ServerSpace>(`/v1/spaces/${encodeURIComponent(spaceId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const listTrips = (spaceId: string) =>
  authenticatedRequest<ServerTrip[]>(`/v1/spaces/${encodeURIComponent(spaceId)}/trips?limit=100`);

export const createTrip = (
  spaceId: string,
  input: {
    title: string;
    startDate: string;
    endDate: string;
    regionName: string;
    summary: string;
    /** 비우면 서버는 "공간 멤버 전원" 으로 읽는다. */
    participantMembershipIds: string[];
  },
) => authenticatedRequest<ServerTrip>(`/v1/spaces/${encodeURIComponent(spaceId)}/trips`, {
  method: "POST",
  body: JSON.stringify(input),
});

export const getTrip = (tripId: string) =>
  authenticatedRequest<ServerTrip>(`/v1/trips/${encodeURIComponent(tripId)}`);

/** 참가자를 통째로 바꾼다. 서버는 `version` 이 어긋나면 409 를 준다. */
export const setTripParticipants = (tripId: string, input: { version: number; membershipIds: string[] }) =>
  authenticatedRequest<ServerTrip>(`/v1/trips/${encodeURIComponent(tripId)}/participants`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const updateTrip = (
  tripId: string,
  input: {
    version: number;
    title: string;
    startDate: string;
    endDate: string;
    regionName: string;
    summary: string;
  },
) => authenticatedRequest<ServerTrip>(`/v1/trips/${encodeURIComponent(tripId)}`, {
  method: "PATCH",
  body: JSON.stringify(input),
});
