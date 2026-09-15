import { authenticatedRequest } from "./auth";
import type { PlaceBody, ServerPlace } from "./placeSync";
import type { ScheduleBody, ServerScheduleItem, ServerStay, StayBody } from "./scheduleSync";
import type { ReservationBody, ServerReservation, ServerTransport, TransportBody } from "./bookingSync";
import type { ExpenseBody, PaymentBody, ServerExpense, ServerPayment } from "./expenseSync";
import type { ChecklistItemBody, RecipeBody, ServerChecklistItem, ServerRecipe } from "./cookingSync";
import type { DiaryBody, MemoBody, ServerDiary, ServerMemo } from "./memorySync";
import type { PhotoBody, ServerPhoto } from "./photoSync";
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
  currencyCode?: string;
  /** 서버는 소수를 문자열이나 수로 준다. 쓸 때 Number 로 읽는다. */
  exchangeRate?: number | string | null;
  budget?: number | string | null;
  simplifySettlement?: boolean;
};

/** 여행의 통화·환율·예산·정산 묶기. */
export type ExpenseSettings = {
  currency: string;
  exchangeRate: number;
  budget: number;
  simplifySettlement: boolean;
};

export const listSpaces = () => authenticatedRequest<ServerSpace[]>("/v1/spaces");

export const createSpace = (name: string, relationshipType: ServerSpace["relationshipType"]) =>
  authenticatedRequest<ServerSpace>("/v1/spaces", {
    method: "POST",
    body: JSON.stringify({ name, relationshipType, timezone: "Asia/Seoul" }),
  });

/** 나간 멤버도 함께 받는다. 지난 여행의 기록이 그 사람을 가리킨다. */
export const listMembers = (spaceId: string) =>
  authenticatedRequest<ServerMemberInput[]>(`/v1/spaces/${encodeURIComponent(spaceId)}/members?includeLeft=true`);

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

export const listExpenses = (tripId: string) =>
  authenticatedRequest<ServerExpense[]>(`/v1/trips/${encodeURIComponent(tripId)}/expenses`);

export const createExpense = (tripId: string, id: string, body: ExpenseBody) =>
  authenticatedRequest<ServerExpense>(`/v1/trips/${encodeURIComponent(tripId)}/expenses`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateExpense = (id: string, version: number, body: ExpenseBody) =>
  authenticatedRequest<ServerExpense>(`/v1/expenses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteExpense = (id: string) =>
  authenticatedRequest<void>(`/v1/expenses/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listPayments = (tripId: string) =>
  authenticatedRequest<ServerPayment[]>(`/v1/trips/${encodeURIComponent(tripId)}/payments`);

export const createPayment = (tripId: string, id: string, body: PaymentBody) =>
  authenticatedRequest<ServerPayment>(`/v1/trips/${encodeURIComponent(tripId)}/payments`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

/** 기록을 되돌린다. 서버는 행을 남기고 목록에서만 뺀다. */
export const undoPayment = (id: string) =>
  authenticatedRequest<void>(`/v1/payments/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listChecklistItems = (tripId: string) =>
  authenticatedRequest<ServerChecklistItem[]>(`/v1/trips/${encodeURIComponent(tripId)}/checklist-items`);

export const createChecklistItem = (tripId: string, id: string, body: ChecklistItemBody) =>
  authenticatedRequest<ServerChecklistItem>(`/v1/trips/${encodeURIComponent(tripId)}/checklist-items`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateChecklistItem = (id: string, version: number, body: ChecklistItemBody) =>
  authenticatedRequest<ServerChecklistItem>(`/v1/checklist-items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteChecklistItem = (id: string) =>
  authenticatedRequest<void>(`/v1/checklist-items/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listRecipes = (tripId: string) =>
  authenticatedRequest<ServerRecipe[]>(`/v1/trips/${encodeURIComponent(tripId)}/recipes`);

export const createRecipe = (tripId: string, id: string, body: RecipeBody) =>
  authenticatedRequest<ServerRecipe>(`/v1/trips/${encodeURIComponent(tripId)}/recipes`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

/** 재료는 보낸 목록대로 맞춰진다. 빠진 재료는 서버에서도 지워진다. */
export const updateRecipe = (id: string, version: number, body: RecipeBody) =>
  authenticatedRequest<ServerRecipe>(`/v1/recipes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteRecipe = (id: string) =>
  authenticatedRequest<void>(`/v1/recipes/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listMemos = (tripId: string) =>
  authenticatedRequest<ServerMemo[]>(`/v1/trips/${encodeURIComponent(tripId)}/memos`);

export const createMemo = (tripId: string, id: string, body: MemoBody) =>
  authenticatedRequest<ServerMemo>(`/v1/trips/${encodeURIComponent(tripId)}/memos`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateMemo = (id: string, version: number, body: MemoBody) =>
  authenticatedRequest<ServerMemo>(`/v1/memos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

/** 서버는 행을 남기고 누가 지웠는지 적는다. */
export const deleteMemo = (id: string) =>
  authenticatedRequest<void>(`/v1/memos/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listDiaries = (tripId: string) =>
  authenticatedRequest<ServerDiary[]>(`/v1/trips/${encodeURIComponent(tripId)}/diaries`);

export const createDiary = (tripId: string, id: string, body: DiaryBody) =>
  authenticatedRequest<ServerDiary>(`/v1/trips/${encodeURIComponent(tripId)}/diaries`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateDiary = (id: string, version: number, body: DiaryBody) =>
  authenticatedRequest<ServerDiary>(`/v1/diaries/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteDiary = (id: string) =>
  authenticatedRequest<void>(`/v1/diaries/${encodeURIComponent(id)}`, { method: "DELETE" });

export const listPhotos = (tripId: string) =>
  authenticatedRequest<ServerPhoto[]>(`/v1/trips/${encodeURIComponent(tripId)}/photos`);

/** 사진 줄만 만든다. 파일은 `photoTransfer.ts` 가 따로 보낸다. */
export const createPhoto = (
  tripId: string,
  id: string,
  body: PhotoBody & { bytes: number; checksum: string; isReceipt?: boolean },
) =>
  authenticatedRequest<ServerPhoto>(`/v1/trips/${encodeURIComponent(tripId)}/photos`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updatePhoto = (id: string, version: number, body: PhotoBody) =>
  authenticatedRequest<ServerPhoto>(`/v1/photos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deletePhoto = (id: string) =>
  authenticatedRequest<void>(`/v1/photos/${encodeURIComponent(id)}`, { method: "DELETE" });

export const updateExpenseSettings = (tripId: string, version: number, settings: ExpenseSettings) =>
  authenticatedRequest<ServerTrip>(`/v1/trips/${encodeURIComponent(tripId)}/expense-settings`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...settings }),
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
