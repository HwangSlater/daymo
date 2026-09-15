import { authenticatedRequest } from "./auth";
import type { PlaceBody, ServerPlace } from "./placeSync";
import type { ScheduleBody, ServerScheduleItem, ServerStay, StayBody } from "./scheduleSync";
import type { ReservationBody, ServerReservation, ServerTransport, TransportBody } from "./bookingSync";
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

export const listTripPlaces = (tripId: string) =>
  authenticatedRequest<ServerPlace[]>(`/v1/trips/${encodeURIComponent(tripId)}/places`);

/** 앱이 만든 id 로 담는다. 같은 id 로 다시 보내도 하나만 생긴다. */
export const createTripPlace = (tripId: string, id: string, body: PlaceBody) =>
  authenticatedRequest<ServerPlace>(`/v1/trips/${encodeURIComponent(tripId)}/places`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateTripPlace = (id: string, version: number, body: PlaceBody) =>
  authenticatedRequest<ServerPlace>(`/v1/trip-places/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteTripPlace = (id: string) =>
  authenticatedRequest<void>(`/v1/trip-places/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listScheduleItems = (tripId: string) =>
  authenticatedRequest<ServerScheduleItem[]>(`/v1/trips/${encodeURIComponent(tripId)}/schedule-items`);

export const createScheduleItem = (tripId: string, id: string, body: ScheduleBody) =>
  authenticatedRequest<ServerScheduleItem>(`/v1/trips/${encodeURIComponent(tripId)}/schedule-items`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateScheduleItem = (id: string, version: number, body: ScheduleBody) =>
  authenticatedRequest<ServerScheduleItem>(`/v1/schedule-items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteScheduleItem = (id: string) =>
  authenticatedRequest<void>(`/v1/schedule-items/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listStays = (tripId: string) =>
  authenticatedRequest<ServerStay[]>(`/v1/trips/${encodeURIComponent(tripId)}/stays`);

export const createStay = (tripId: string, id: string, body: StayBody) =>
  authenticatedRequest<ServerStay>(`/v1/trips/${encodeURIComponent(tripId)}/stays`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateStay = (id: string, version: number, body: StayBody) =>
  authenticatedRequest<ServerStay>(`/v1/stays/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteStay = (id: string) =>
  authenticatedRequest<void>(`/v1/stays/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listTransports = (tripId: string) =>
  authenticatedRequest<ServerTransport[]>(`/v1/trips/${encodeURIComponent(tripId)}/transports`);

export const createTransport = (tripId: string, id: string, body: TransportBody) =>
  authenticatedRequest<ServerTransport>(`/v1/trips/${encodeURIComponent(tripId)}/transports`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateTransport = (id: string, version: number, body: TransportBody) =>
  authenticatedRequest<ServerTransport>(`/v1/transports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteTransport = (id: string) =>
  authenticatedRequest<void>(`/v1/transports/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listReservations = (tripId: string) =>
  authenticatedRequest<ServerReservation[]>(`/v1/trips/${encodeURIComponent(tripId)}/reservations`);

export const createReservation = (tripId: string, id: string, body: ReservationBody) =>
  authenticatedRequest<ServerReservation>(`/v1/trips/${encodeURIComponent(tripId)}/reservations`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateReservation = (id: string, version: number, body: ReservationBody) =>
  authenticatedRequest<ServerReservation>(`/v1/reservations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteReservation = (id: string) =>
  authenticatedRequest<void>(`/v1/reservations/${encodeURIComponent(id)}`, { method: "DELETE" });

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
