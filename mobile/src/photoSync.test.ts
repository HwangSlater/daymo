import assert from "node:assert/strict";
import { test } from "node:test";

import { bodyKey, hasWork, planListSync, tripDateKeys, type Confirmed } from "./listSync.ts";
import {
  colorOfId,
  PHOTO_PALETTE,
  PHOTO_UNDATED,
  displayFileName,
  isOriginalQualityUri,
  isStaleDisplayCopy,
  originalSaveHint,
  photoCodec,
  photoTakenDate,
  photosLinkedTo,
  photosOfStay,
  tidyLinks,
  type PhotoRow,
} from "./photoSync.ts";

const A = "11111111-1111-4111-8111-111111111111";
const dates = tripDateKeys("2026-10-01", "2026-10-03");

test("파일이 있거나 서버에 이미 있는 사진만 맞춘다", () => {
  const codec = photoCodec(dates, new Set([A]));
  const fresh = photoCodec(dates, new Set());

  assert.equal(fresh.syncable({ id: A, color: "#fff", date: "", caption: "" }), false);
  assert.equal(fresh.syncable({ id: A, color: "#fff", date: "", caption: "", uri: "file:///p.jpg" }), true);
  assert.equal(codec.syncable({ id: A, color: "#fff", date: "", caption: "" }), true);
  assert.equal(codec.syncable({ id: "photo-1", color: "#fff", date: "", caption: "", uri: "file:///p.jpg" }), false);
});

test("날짜 줄은 여행 날짜로 오가고 파일 자리와 색은 기기 것을 지킨다", () => {
  const codec = photoCodec(dates, new Set([A]));
  const local: PhotoRow = { id: A, color: "#123456", date: "2일(금)", caption: " 느린 점심 ", uri: "file:///p.jpg" };

  assert.deepEqual(codec.toBody(local), { caption: "느린 점심", date: "2026-10-02", links: [] });
  const row = {
    id: A, status: "ready" as const, caption: "느린 점심", date: "2026-10-02", takenAt: null, width: 10, height: 10, bytes: 100,
    isReceipt: false, uploaderMembershipId: null, uploaderName: "하늘", createdAt: "2026-10-02T03:00:00Z", version: 1,
  };
  const back = codec.fromServer(row);
  assert.deepEqual(codec.keepLocal?.(back, local), {
    id: A, color: "#123456", date: "2일(금)", caption: "느린 점심", uri: "file:///p.jpg", links: [], uploaderMembershipId: null,
    uploaderName: "하늘",
  });
  assert.equal(codec.fromServer({ ...row, date: "2026-12-25" }).date, PHOTO_UNDATED);
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(codec.toBody(back)), version: 1 }]]);
  assert.equal(hasWork(planListSync([local], codec, confirmed)), false);
});

test("올린 사람은 서버에서 받아 두지만 서버로 보내지 않는다", () => {
  const codec = photoCodec(dates, new Set([A]));
  const B = "22222222-2222-4222-8222-222222222222";
  const row = {
    id: A, status: "ready" as const, caption: "바다", date: "2026-10-01", takenAt: null, width: 10, height: 10, bytes: 100,
    isReceipt: false, uploaderMembershipId: B, uploaderName: "여울", createdAt: "2026-10-01T03:00:00Z", version: 1,
  };
  const back = codec.fromServer(row);
  assert.equal(back.uploaderMembershipId, B);
  assert.equal(back.uploaderName, "여울");
  // 이름이 비면 칸 자체를 만들지 않는다. 크게 보는 화면이 빈 `올림` 줄을 내지 않게 한다.
  assert.equal("uploaderName" in codec.fromServer({ ...row, uploaderName: "" }), false);
  // 이 기기에서 막 올린 사진은 올린 사람이 비어 있다. 서버 줄과 합치면 서버 것을 따른다.
  const local: PhotoRow = { id: A, color: "#123456", date: "1일(목)", caption: "바다", uri: "file:///p.jpg" };
  assert.equal(codec.keepLocal?.(back, local).uploaderMembershipId, B);
  assert.deepEqual(codec.toBody(back), codec.toBody(local));
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(codec.toBody(back)), version: 1 }]]);
  assert.equal(hasWork(planListSync([local], codec, confirmed)), false);
});

test("색은 id 로 정해져 기기마다 같다", () => {
  assert.equal(colorOfId(A), colorOfId(A));
  assert.ok(PHOTO_PALETTE.includes(colorOfId("22222222-2222-4222-8222-222222222222")));
});

// ---------------------------------------------------------------------------
// 사진을 장소·일정·숙소에 붙이기
// ---------------------------------------------------------------------------

const PLACE = "33333333-3333-4333-8333-333333333333";
const STAY = "44444444-4444-4444-8444-444444444444";

test("붙은 곳은 늘 같은 차례로 오가고 아직 못 올린 곳은 보내지 않는다", () => {
  const codec = photoCodec(dates, new Set([A]), new Set([PLACE]));
  const local: PhotoRow = {
    id: A, color: "#fff", date: "2일(금)", caption: "", uri: "file:///p.jpg",
    links: [{ targetType: "stay", targetId: STAY }, { targetType: "place", targetId: PLACE }],
  };

  // 서버에 없는 숙소는 빠진다. 그 숙소가 올라가면 다시 맞추면서 붙는다.
  assert.deepEqual(codec.toBody(local).links, [{ targetType: "place", targetId: PLACE }]);
  // 같은 곳이 두 번 와도 한 번만, 차례는 늘 같다.
  assert.deepEqual(
    tidyLinks([
      { targetType: "stay", targetId: STAY },
      { targetType: "place", targetId: PLACE },
      { targetType: "stay", targetId: STAY },
    ]),
    [{ targetType: "place", targetId: PLACE }, { targetType: "stay", targetId: STAY }],
  );
});

test("서버가 준 차례가 달라도 다시 보내지 않는다", () => {
  const codec = photoCodec(dates, new Set([A]), new Set([PLACE, STAY]));
  const local: PhotoRow = {
    id: A, color: "#fff", date: "2일(금)", caption: "", uri: "file:///p.jpg",
    links: [{ targetType: "stay", targetId: STAY }, { targetType: "place", targetId: PLACE }],
  };
  const row = {
    id: A, status: "ready" as const, caption: "", date: "2026-10-02", takenAt: null, width: 10, height: 10, bytes: 100,
    isReceipt: false, uploaderMembershipId: null, uploaderName: "하늘", createdAt: "2026-10-02T03:00:00Z", version: 1,
    links: [{ targetType: "place" as const, targetId: PLACE }, { targetType: "stay" as const, targetId: STAY }],
  };
  const confirmed = new Map<string, Confirmed>([[A, { key: bodyKey(codec.toBody(codec.fromServer(row))), version: 1 }]]);

  assert.equal(hasWork(planListSync([local], codec, confirmed)), false);
});

test("장소·일정은 붙은 사진만, 숙소는 묵는 동안의 사진까지 본다", () => {
  const 사진 = [
    { id: "1", date: "1일(목)", links: [{ targetType: "place" as const, targetId: PLACE }] },
    { id: "2", date: "2일(금)", links: [{ targetType: "stay" as const, targetId: STAY }] },
    { id: "3", date: "2일(금)" },
    { id: "4", date: "3일(토)" },
  ];

  assert.deepEqual(photosLinkedTo(사진, "place", PLACE).map((photo) => photo.id), ["1"]);
  assert.deepEqual(photosLinkedTo(사진, "place", undefined), []);
  // 붙인 사진이 먼저 오고 그날 사진이 뒤에 온다. 같은 사진이 두 번 오지 않는다.
  assert.deepEqual(photosOfStay(사진, STAY, ["2일(금)"]).map((photo) => photo.id), ["2", "3"]);
  assert.deepEqual(photosOfStay(사진, undefined, ["3일(토)"]).map((photo) => photo.id), ["4"]);
});

test("사진에 찍힌 날짜를 EXIF 에서 읽는다", () => {
  assert.equal(photoTakenDate({ DateTimeOriginal: "2026:09:12 14:33:01" }), "2026-09-12");
  // iOS 는 한 칸 안에 넣어 준다.
  assert.equal(photoTakenDate({ "{Exif}": { DateTimeOriginal: "2026-09-12 08:00:00" } }), "2026-09-12");
  assert.equal(photoTakenDate({ DateTime: "2026:01:02 00:00:00" }), "2026-01-02");
  // 없거나 모양이 틀리면 빈 글자다. 엉뚱한 날짜를 지어내지 않는다.
  assert.equal(photoTakenDate(undefined), "");
  assert.equal(photoTakenDate({ DateTimeOriginal: "어제" }), "");
});

test("원본은 기한까지만 받을 수 있고, 지났으면 화면 크기로 저장한다", () => {
  const 남음 = originalSaveHint("2026-10-16T02:00:00Z", "2026-09-16");
  assert.deepEqual(남음, { hasOriginal: true, text: "원본은 10월 16일까지 저장할 수 있어요", soon: false });
  // 일주일 안쪽이면 조금 더 눈에 띄게 둔다.
  assert.equal(originalSaveHint("2026-09-20T02:00:00Z", "2026-09-16").soon, true);
  assert.equal(originalSaveHint("2026-09-24T02:00:00Z", "2026-09-16").soon, false);
  // 기한이 지났으면 서버가 null 을 준다.
  assert.deepEqual(originalSaveHint(null, "2026-09-16"), {
    hasOriginal: false,
    text: "원본 보관 기간(30일)이 지나 줄인 화질로 저장돼요",
    soon: false,
  });
  // 서버가 말해 주지 않으면 아무 말도 하지 않고 원본을 달라고 해 본다.
  assert.deepEqual(originalSaveHint(undefined, "2026-09-16"), { hasOriginal: true, text: "", soon: false });
});

test("기기에서 고른 사진은 원본, 받아 둔 표시본은 아니다", () => {
  const 받아_둔_것 = `file:///data/app/trip-photos/server-${A}.jpg`;
  const 고른_것 = "file:///data/app/trip-photos/photo-1758100000000.jpg";

  assert.equal(isOriginalQualityUri(고른_것, A), true);
  assert.equal(isOriginalQualityUri(받아_둔_것, A), false);
  // 웹은 방금 고른 사진만 data: 로 들고 있다. 서버에서 받은 것은 blob: 다.
  assert.equal(isOriginalQualityUri("data:image/jpeg;base64,AAAA", A), true);
  assert.equal(isOriginalQualityUri("blob:https://www.daymo.xyz/9f2", A), false);
  // 파일이 아예 없으면 받아 올 것도 없다.
  assert.equal(isOriginalQualityUri(undefined, A), false);
});

test("옛 판 표시본만 다시 받는다", () => {
  const 폴더 = "file:///data/app/trip-photos/";
  // 판을 올리기 전 이름. 서버가 다시 만든 것을 못 봤으니 새로 받는다.
  assert.equal(isStaleDisplayCopy(`${폴더}server-${A}.jpg`, A), true);
  // 지금 판 이름이면 그대로 쓴다.
  assert.equal(isStaleDisplayCopy(`${폴더}${displayFileName(A)}`, A), false);
  // 썸네일·원본은 표시본이 아니다.
  assert.equal(isStaleDisplayCopy(`${폴더}server-${A}-thumbnail.jpg`, A), false);
  assert.equal(isStaleDisplayCopy(`${폴더}server-${A}-original.jpg`, A), false);
  // 기기에서 고른 사진과 웹의 blob 은 받아 둔 것이 아니다.
  assert.equal(isStaleDisplayCopy(`${폴더}photo-1758100000000.jpg`, A), false);
  assert.equal(isStaleDisplayCopy("blob:https://www.daymo.xyz/9f2", A), false);
  assert.equal(isStaleDisplayCopy(undefined, A), false);
});
