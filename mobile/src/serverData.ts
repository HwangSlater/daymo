import { authenticatedRequest } from "./auth";

export type ServerSpace = {
  id: string;
  name: string;
  relationshipType: "couple" | "friends" | "family" | "other";
  timezone: string;
  myRole: "owner" | "editor" | "viewer";
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

export const listTrips = (spaceId: string) =>
  authenticatedRequest<ServerTrip[]>(`/v1/spaces/${encodeURIComponent(spaceId)}/trips?limit=100`);

export const createTrip = (
  spaceId: string,
  input: { title: string; startDate: string; endDate: string; regionName: string; summary: string },
) => authenticatedRequest<ServerTrip>(`/v1/spaces/${encodeURIComponent(spaceId)}/trips`, {
  method: "POST",
  body: JSON.stringify({ ...input, participantMembershipIds: [] }),
});
