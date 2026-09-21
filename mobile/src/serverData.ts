import { authenticatedPage, authenticatedRequest, type RequestPace } from "./auth";
import type { ServerDevice } from "./deviceSessions";
import type { PlaceBody, ServerPlace } from "./placeSync";
import type { ScheduleBody, ServerScheduleItem, ServerStay, StayBody } from "./scheduleSync";
import type { ReservationBody, ServerReservation, ServerTransport, TransportBody } from "./bookingSync";
import type { ExpenseBody, PaymentBody, ServerExpense, ServerPayment } from "./expenseSync";
import type { ChecklistItemBody, RecipeBody, ServerChecklistItem, ServerRecipe } from "./cookingSync";
import type { DiaryBody, MemoBody, ServerDiary, ServerMemo, ServerTrashItem } from "./memorySync";
import type { PhotoBody, ServerPhoto } from "./photoSync";
import type { ServerMemberInput, ServerRelationship, ServerRole, SpacePatch } from "./spaceMapping";
import type { ServerTripOverview } from "./tripOverview";
import type { SavedKeepsake } from "./tripCard";
import type { CalendarNote, CalendarNoteBody } from "./calendarNotes";

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
  /** 홈 화면의 여행 카드에 깐 사진 한 장. 고르지 않았으면 없다. */
  coverPhotoId?: string | null;
  /** 홈 화면의 여행 카드에 통째로 깐 기념 카드. 사진 한 장과 둘 중 하나만 있다. */
  coverCardId?: string | null;
  /** 홈에 그릴 사진들. 카드를 깔았으면 그 카드의 사진이 고른 차례대로 온다. */
  coverPhotoIds?: string[];
  /** 그 카드의 틀 이름. 사진을 어떻게 놓을지 앱이 이 값으로 정한다. */
  coverCardStyle?: string | null;
  /** 대표 사진에서 홈 카드 틀 한가운데에 놓을 점과 확대 배수(`coverCrop.ts`). */
  coverFocusX?: number | null;
  coverFocusY?: number | null;
  coverZoom?: number | null;
  archivedAt?: string | null;
  /** 지운 여행일 때만. 이 시각이 지나면 되돌릴 수 없다. */
  deletionScheduledAt?: string | null;
  /** 홈 카드가 보여 줄 숫자. 쓸 때 `parseTripOverview` 로 읽는다. */
  overview?: ServerTripOverview | null;
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
/** 공간을 지운다(7일 뒤 삭제). 관리자만. 공간 이름을 정확히 다시 적어야 한다. */
export const deleteSpace = (spaceId: string, confirmationName: string) =>
  authenticatedRequest<{ id: string; deletionScheduledAt: string }>(`/v1/spaces/${encodeURIComponent(spaceId)}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmationName, impactAcknowledged: true }),
  });

/** 내가 관리자인, 아직 되돌릴 수 있는 지운 공간. */
export const listDeletedSpaces = () =>
  authenticatedRequest<{ id: string; name: string; deletionScheduledAt: string }[]>("/v1/spaces/deleted");

export const restoreSpace = (spaceId: string) =>
  authenticatedRequest<ServerSpace>(`/v1/spaces/${encodeURIComponent(spaceId)}/restore`, { method: "POST" });

export const listMembers = (spaceId: string) =>
  authenticatedRequest<ServerMemberInput[]>(`/v1/spaces/${encodeURIComponent(spaceId)}/members?includeLeft=true`);

export type ServerInvite = {
  id: string;
  /** 만들 때만 온다. 서버에는 원문이 없다. */
  inviteUrl?: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  createdByMembershipId?: string;
};

export const createInvite = (spaceId: string) =>
  authenticatedRequest<ServerInvite>(`/v1/spaces/${encodeURIComponent(spaceId)}/invites`, { method: "POST" });

export const listInvites = (spaceId: string) =>
  authenticatedRequest<ServerInvite[]>(`/v1/spaces/${encodeURIComponent(spaceId)}/invites`);

export const revokeInvite = (spaceId: string, inviteId: string) =>
  authenticatedRequest<void>(`/v1/spaces/${encodeURIComponent(spaceId)}/invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
  });

/** token 은 주소가 아니라 본문으로 보낸다. 주소는 접속 기록에 남는다. */
export const acceptInvite = (token: string) =>
  authenticatedRequest<{ spaceId: string; membershipId: string; alreadyMember: boolean }>("/v1/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

export const changeMemberRole = (spaceId: string, membershipId: string, role: ServerRole) =>
  authenticatedRequest<{ id: string; role: ServerRole; myRole: ServerRole }>(
    `/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(membershipId)}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );

/** 내 membership 이면 나가기, 남의 것이면 내보내기. */
export const removeMember = (spaceId: string, membershipId: string) =>
  authenticatedRequest<void>(`/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(membershipId)}`, {
    method: "DELETE",
  });

/** 공간 이름·관계·함께한 날을 바꾼다. 서버는 관리자만 받는다. */
export const updateSpace = (spaceId: string, patch: SpacePatch) =>
  authenticatedRequest<ServerSpace>(`/v1/spaces/${encodeURIComponent(spaceId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

/**
 * 여행 목록을 한 번에 받는 수. 서버 상한과 같다.
 *
 * 더 있으면 `nextCursor` 가 온다. 예전에는 이 수가 곧 끝이어서, 여행이 100 개를
 * 넘는 공간에서는 오래된 여행이 목록에서 통째로 사라졌다.
 */
export const TRIP_PAGE_SIZE = 100;

const 여행_목록_주소 = (spaceId: string, trash: boolean, cursor?: string | null) =>
  `/v1/spaces/${encodeURIComponent(spaceId)}/trips?limit=${TRIP_PAGE_SIZE}`
  + (trash ? "&trash=true" : "")
  + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");

/** 여행 목록 한 쪽. `cursor` 를 주면 그 다음부터 이어 받는다. */
export const listTripsPage = (spaceId: string, cursor?: string | null) =>
  authenticatedPage<ServerTrip>(여행_목록_주소(spaceId, false, cursor));

/** 첫 쪽만 받는다. 목록 전체가 필요 없는 곳(지난 여행에서 가져오기)이 쓴다. */
export const listTrips = async (spaceId: string) => (await listTripsPage(spaceId)).items;

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

export const listTripPlaces = (tripId: string, pace?: RequestPace) =>
  authenticatedRequest<ServerPlace[]>(`/v1/trips/${encodeURIComponent(tripId)}/places`, {}, pace);

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

export const listScheduleItems = (tripId: string, pace?: RequestPace) =>
  authenticatedRequest<ServerScheduleItem[]>(`/v1/trips/${encodeURIComponent(tripId)}/schedule-items`, {}, pace);

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

export const listStays = (tripId: string, pace?: RequestPace) =>
  authenticatedRequest<ServerStay[]>(`/v1/trips/${encodeURIComponent(tripId)}/stays`, {}, pace);

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

export const listExpenses = (tripId: string, pace?: RequestPace) =>
  authenticatedRequest<ServerExpense[]>(`/v1/trips/${encodeURIComponent(tripId)}/expenses`, {}, pace);

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

export const listChecklistItems = (tripId: string, pace?: RequestPace) =>
  authenticatedRequest<ServerChecklistItem[]>(`/v1/trips/${encodeURIComponent(tripId)}/checklist-items`, {}, pace);

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

export const listRecipes = (tripId: string, pace?: RequestPace) =>
  authenticatedRequest<ServerRecipe[]>(`/v1/trips/${encodeURIComponent(tripId)}/recipes`, {}, pace);

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

export const listMemos = (tripId: string, pace?: RequestPace) =>
  authenticatedRequest<ServerMemo[]>(`/v1/trips/${encodeURIComponent(tripId)}/memos`, {}, pace);

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

export const listDiaries = (tripId: string, pace?: RequestPace) =>
  authenticatedRequest<ServerDiary[]>(`/v1/trips/${encodeURIComponent(tripId)}/diaries`, {}, pace);

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

/** 지운 뒤 7일 안의 메모와 사진. owner·editor 만 볼 수 있다(보기만 하면 403). */
export const listTrash = (tripId: string) =>
  authenticatedRequest<ServerTrashItem[]>(`/v1/trips/${encodeURIComponent(tripId)}/trash`);

/** 되살린 메모나 사진을 목록과 같은 모양으로 돌려준다. 7일이 지났으면 410 이다. */
export const restoreFromTrash = (type: ServerTrashItem["type"], id: string) =>
  authenticatedRequest<ServerMemo | ServerPhoto>(
    `/v1/trash/${type}/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );

export const listPhotos = (tripId: string, pace?: RequestPace) =>
  authenticatedRequest<ServerPhoto[]>(`/v1/trips/${encodeURIComponent(tripId)}/photos`, {}, pace);

/** 사진 줄만 만든다. 파일은 `photoTransfer.ts` 가 따로 보낸다. */
export const createPhoto = (
  tripId: string,
  id: string,
  body: PhotoBody & { bytes: number; checksum: string; isReceipt?: boolean },
  pace?: RequestPace,
) =>
  authenticatedRequest<ServerPhoto>(`/v1/trips/${encodeURIComponent(tripId)}/photos`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  }, pace);

export const updatePhoto = (id: string, version: number, body: PhotoBody) =>
  authenticatedRequest<ServerPhoto>(`/v1/photos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deletePhoto = (id: string) =>
  authenticatedRequest<void>(`/v1/photos/${encodeURIComponent(id)}`, { method: "DELETE" });

/** 여행에 모아 둔 기념 카드 한 장. 꾸민 값은 `settings` 한 덩어리다. */
export type ServerTripCard = {
  id: string;
  tripId: string;
  settings: SavedKeepsake;
  sortOrder: number;
  createdByMembershipId: string | null;
  /** 이 카드를 고치고 지울 수 있는지. 만든 사람과 owner 만 참이다. */
  canManage: boolean;
  createdAt: string;
  version: number;
};

export const listTripCards = (tripId: string) =>
  authenticatedRequest<ServerTripCard[]>(`/v1/trips/${encodeURIComponent(tripId)}/cards`);

/** 카드를 한 장 더 만든다. 앱이 만든 id 를 보내 두 번 닿아도 한 장이게 한다. */
export const createTripCard = (tripId: string, id: string, settings: SavedKeepsake) =>
  authenticatedRequest<ServerTripCard>(`/v1/trips/${encodeURIComponent(tripId)}/cards`, {
    method: "POST",
    body: JSON.stringify({ id, settings }),
  });

export const updateTripCard = (id: string, version: number, settings: SavedKeepsake) =>
  authenticatedRequest<ServerTripCard>(`/v1/trip-cards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, settings }),
  });

export const deleteTripCard = (id: string) =>
  authenticatedRequest<void>(`/v1/trip-cards/${encodeURIComponent(id)}`, { method: "DELETE" });

/**
 * 홈 화면의 여행 카드에 깔 것. 사진 한 장이거나 기념 카드 하나고, 둘 다 `null` 이면 해제다.
 *
 * 사진을 고를 때는 홈 카드 틀에 보여 줄 부분도 함께 보낸다. 보내지 않으면 서버가
 * 가운데(0.5/0.5/1)로 되돌린다 — 다른 사진을 골랐는데 앞 사진의 자리가 남아 있으면
 * 엉뚱한 데가 보이기 때문이다.
 */
export type HomeCoverChoice =
  | { coverPhotoId: string | null; coverFocusX?: number; coverFocusY?: number; coverZoom?: number }
  | { coverCardId: string | null };

/**
 * 홈 화면의 여행 카드에 깔 것. 사진 한 장이거나 기념 카드 하나고, 둘 다 `null` 이면 해제다.
 *
 * 한쪽을 고르면 서버가 다른 쪽을 푼다. 홈 카드는 여행마다 하나다.
 */
export const updateHomeCover = (
  tripId: string,
  version: number,
  고른_것: HomeCoverChoice,
) =>
  authenticatedRequest<ServerTrip>(`/v1/trips/${encodeURIComponent(tripId)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...고른_것 }),
  });

export const updateExpenseSettings = (tripId: string, version: number, settings: ExpenseSettings) =>
  authenticatedRequest<ServerTrip>(`/v1/trips/${encodeURIComponent(tripId)}/expense-settings`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...settings }),
  });

export const archiveTrip = (tripId: string, archived: boolean) =>
  authenticatedRequest<ServerTrip>(`/v1/trips/${encodeURIComponent(tripId)}/${archived ? "archive" : "unarchive"}`, {
    method: "POST",
  });

/** 7일 뒤에 지워진다. 그 전에는 owner 가 되돌릴 수 있다. */
export const deleteTrip = (tripId: string) =>
  authenticatedRequest<void>(`/v1/trips/${encodeURIComponent(tripId)}`, { method: "DELETE" });

export const restoreTrip = (tripId: string) =>
  authenticatedRequest<ServerTrip>(`/v1/trips/${encodeURIComponent(tripId)}/restore`, { method: "POST" });

/** 아직 되돌릴 수 있는 지운 여행 한 쪽. owner 만 받는다. */
export const listDeletedTripsPage = (spaceId: string, cursor?: string | null) =>
  authenticatedPage<ServerTrip>(여행_목록_주소(spaceId, true, cursor));

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

export type ReportTargetType = "memo" | "diary" | "photo" | "member" | "trip" | "other";
export type ReportReason = "spam" | "harassment" | "sexual" | "violence" | "privacy" | "copyright" | "other";

/**
 * 공간 안의 것을 신고한다. `member` 면 `targetId` 는 그 공간의 membership id 다.
 *
 * 같은 대상을 다시 보내도 서버는 처음 접수 번호를 준다. 신고한 사람은 상대에게 알려지지 않는다.
 */
export const createReport = (input: {
  spaceId: string;
  targetType: ReportTargetType;
  targetId?: string;
  reason: ReportReason;
  detail?: string;
}) =>
  authenticatedRequest<{ id: string; receivedAt: string; reviewDueAt: string }>("/v1/reports", {
    method: "POST",
    body: JSON.stringify(input),
  });

export type ServerBlock = {
  id: string;
  /** 차단한 공간이 지워졌으면 비어 있다. 그때는 `id` 로 푼다. */
  membershipId: string | null;
  displayName: string;
  blockedAt: string;
};

/** 함께 있는 공간의 멤버를 차단한다. 이미 함께 있는 공간은 그대로다. */
export const blockMember = (membershipId: string) =>
  authenticatedRequest<ServerBlock>("/v1/blocks", {
    method: "POST",
    body: JSON.stringify({ userMembershipId: membershipId }),
  });

/** 어느 공간의 membership id 든 같은 사람이면 풀린다. */
export const unblock = (membershipId: string) =>
  authenticatedRequest<void>(`/v1/blocks/${encodeURIComponent(membershipId)}`, { method: "DELETE" });

/** `spaceId` 를 주면 그 공간에 있는 사람은 그 공간의 membership id 로 온다. */
export const listBlocks = (spaceId?: string) =>
  authenticatedRequest<ServerBlock[]>(spaceId ? `/v1/blocks?spaceId=${encodeURIComponent(spaceId)}` : "/v1/blocks");

/** 로그인해 둔 기기. 마지막 사용이 최근인 것부터 온다. 지금 이 기기에는 `current` 가 붙는다. */
export const listDevices = () => authenticatedRequest<ServerDevice[]>("/v1/auth/sessions");

/**
 * 기기 하나를 해지한다. 그 기기의 갱신 토큰까지 끊겨 다시 로그인해야 한다.
 *
 * 지금 이 기기도 해지할 수 있다. 그때는 로그아웃과 같으니 부르는 쪽에서 먼저 물어본다.
 */
export const endDeviceSession = (deviceId: string) =>
  authenticatedRequest<void>(`/v1/auth/sessions/${encodeURIComponent(deviceId)}`, { method: "DELETE" });

/**
 * 여행 탭 캘린더의 일정·메모. 여행이 아니라 공간에 붙는다(`calendarNotes.ts`).
 *
 * 받을 때는 달 그림에 보이는 범위(앞뒤 달 날짜 포함)를 준다. 그 범위에 걸친 것이
 * 모두 온다.
 */
export const listCalendarNotes = (spaceId: string, from: string, to: string) =>
  authenticatedRequest<CalendarNote[]>(
    `/v1/spaces/${encodeURIComponent(spaceId)}/calendar-notes?from=${from}&to=${to}`,
  );

export const createCalendarNote = (spaceId: string, id: string, body: CalendarNoteBody) =>
  authenticatedRequest<CalendarNote>(`/v1/spaces/${encodeURIComponent(spaceId)}/calendar-notes`, {
    method: "POST",
    body: JSON.stringify({ id, ...body }),
  });

export const updateCalendarNote = (id: string, version: number, body: CalendarNoteBody) =>
  authenticatedRequest<CalendarNote>(`/v1/calendar-notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ version, ...body }),
  });

export const deleteCalendarNote = (id: string) =>
  authenticatedRequest<void>(`/v1/calendar-notes/${encodeURIComponent(id)}`, { method: "DELETE" });
