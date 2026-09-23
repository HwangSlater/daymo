import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPhotoUploads,
  NO_PHOTO_UPLOADS,
  photoRetryMs,
  photoUploadHeadline,
  photoUploadRetries,
  PHOTO_UPLOAD_GAVE_UP,
  type PhotoUploadJob,
} from "./photoUploads.ts";

/** 손으로 풀어 주는 약속. 몇 장이 동시에 나가 있는지 붙잡아 두고 볼 수 있다. */
function 손잡이<T = void>() {
  let 풀기!: (value: T) => void;
  let 깨기!: (error: unknown) => void;
  const 약속 = new Promise<T>((resolve, reject) => {
    풀기 = resolve;
    깨기 = reject;
  });
  return { 약속, 풀기, 깨기 };
}

const 다음_틱 = () => new Promise<void>((resolve) => setImmediate(resolve));

const 사진 = (photoId: string, tripId = "trip-1"): PhotoUploadJob => ({
  tripId,
  photoId,
  uri: `file:///${photoId}.jpg`,
  body: { caption: null, date: null, links: [] },
});

const 오류 = (status: number, message = "안 돼요") => Object.assign(new Error(message), { status });

test("진행 줄은 몇 장 중 몇 장인지 보여 준다", () => {
  assert.equal(photoUploadHeadline(NO_PHOTO_UPLOADS), "");
  assert.equal(
    photoUploadHeadline({ total: 40, done: 12, blocked: [], running: true, progress: {} }),
    "사진 40장 중 12장 업로드 중",
  );
  assert.equal(
    photoUploadHeadline({ total: 40, done: 12, blocked: ["a", "b"], running: true, progress: {} }),
    "사진 40장 중 12장 업로드 중 · 2장 실패",
  );
  // 보낼 것이 더 없고 실패만 남았으면 진행이 아니라 결과를 적는다.
  assert.equal(
    photoUploadHeadline({ total: 40, done: 38, blocked: ["a", "b"], running: false, progress: {} }),
    "사진 2장 업로드에 실패했어요",
  );
});

test("연결이 끊긴 것은 스스로 다시, 거부당한 것은 멈춘다", () => {
  assert.equal(photoUploadRetries(0), true);
  assert.equal(photoUploadRetries(429), true);
  assert.equal(photoUploadRetries(503), true);
  // 413 은 사진이 너무 크거나 저장 공간이 찬 것이다. 같은 사진을 그대로 보내면 또 거부된다.
  assert.equal(photoUploadRetries(413), false);
  assert.equal(photoUploadRetries(422), false);
  assert.equal(photoUploadRetries(403), false);
  assert.equal(photoUploadRetries(404), false);
});

test("쉬는 시간은 길어지다가 스무 초에서 멈춘다", () => {
  assert.equal(photoRetryMs(0), 2_000);
  assert.equal(photoRetryMs(1), 4_000);
  assert.equal(photoRetryMs(3), 16_000);
  assert.equal(photoRetryMs(9), 20_000);
});

test("한 번에 집어 드는 수를 넘기지 않고, 끝난 수를 센다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 2 });
  const 손잡이들 = new Map([...Array(5).keys()].map((번호) => [`p${번호}`, 손잡이<string>()]));
  let 지금 = 0;
  let 가장_많았을_때 = 0;

  uploads.add([...손잡이들.keys()].map((id) => 사진(id)), async (job) => {
    지금 += 1;
    가장_많았을_때 = Math.max(가장_많았을_때, 지금);
    try {
      return await 손잡이들.get(job.photoId)!.약속;
    } finally {
      지금 -= 1;
    }
  });

  await 다음_틱();
  assert.equal(가장_많았을_때, 2);
  assert.deepEqual(uploads.stateOf("trip-1"), { total: 5, done: 0, blocked: [], running: true, progress: {} });

  손잡이들.get("p0")!.풀기("row-0");
  await 다음_틱();
  assert.equal(uploads.stateOf("trip-1").done, 1);
  assert.equal(uploads.stateOf("trip-1").total, 5);

  for (const 하나 of 손잡이들.values()) 하나.풀기("row");
  await 다음_틱();
  await 다음_틱();
  // 다 끝나면 세던 수를 비워 진행 줄이 걷힌다.
  assert.deepEqual(uploads.stateOf("trip-1"), NO_PHOTO_UPLOADS);
  assert.equal(uploads.uploadedIds("trip-1").length, 5);
});

test("거부당한 사진은 멈춘 채로 남고 「다시 시도」로만 다시 간다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 3 });
  let 보낸_수 = 0;
  const send = async (job: PhotoUploadJob) => {
    보낸_수 += 1;
    if (job.photoId === "p1" && 보낸_수 <= 2) throw 오류(413, "사진 한 장이 10MB를 넘어요.");
    return "row";
  };

  uploads.add([사진("p0"), 사진("p1")], send);
  await 다음_틱();
  await 다음_틱();

  const 멈춘_뒤 = uploads.stateOf("trip-1");
  assert.deepEqual(멈춘_뒤.blocked, ["p1"]);
  assert.equal(멈춘_뒤.running, false);
  assert.equal(멈춘_뒤.done, 1);
  assert.equal(uploads.reasonOf("trip-1", "p1"), "사진 한 장이 10MB를 넘어요.");

  // 다시 넣어도 조용히 다시 보내지 않는다.
  uploads.add([사진("p1")], send);
  await 다음_틱();
  assert.deepEqual(uploads.stateOf("trip-1").blocked, ["p1"]);

  uploads.retry("trip-1");
  await 다음_틱();
  await 다음_틱();
  assert.deepEqual(uploads.stateOf("trip-1"), NO_PHOTO_UPLOADS);
});

test("연결이 끊기면 기다리던 쪽만 풀어 주고 줄은 계속 들고 있는다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 1, retryMs: () => 0 });
  let 보낸_수 = 0;
  const send = async () => {
    보낸_수 += 1;
    if (보낸_수 === 1) throw 오류(0, "인터넷 연결을 확인해 주세요.");
    return "row";
  };

  const 기다림 = uploads.join(사진("p0"), send).catch((error: unknown) => error);
  assert.equal((await 기다림 as Error).message, "인터넷 연결을 확인해 주세요.");
  // 화면 쪽은 풀어 줬어도 줄에서 사라지지는 않는다. 쉬었다 스스로 다시 보낸다.
  assert.equal(uploads.stateOf("trip-1").running, true);
  assert.deepEqual(uploads.stateOf("trip-1").blocked, []);

  await new Promise((resolve) => setTimeout(resolve, 5));
  await 다음_틱();
  assert.deepEqual(uploads.stateOf("trip-1"), NO_PHOTO_UPLOADS);
  assert.deepEqual(uploads.uploadedIds("trip-1"), ["p0"]);
});

test("이미 올린 사진을 또 부르면 서버에 다시 보내지 않는다", async () => {
  const uploads = createPhotoUploads<string>();
  let 보낸_수 = 0;
  const send = async () => {
    보낸_수 += 1;
    return "row-0";
  };

  assert.equal(await uploads.join(사진("p0"), send), "row-0");
  assert.equal(await uploads.join(사진("p0"), send), "row-0");
  assert.equal(보낸_수, 1);
});

test("같은 사진을 넣고 기다려도 한 번만 나간다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 1 });
  const 손 = 손잡이<string>();
  let 보낸_수 = 0;
  const send = async () => {
    보낸_수 += 1;
    return 손.약속;
  };

  uploads.add([사진("p0")], send);
  const 기다림 = uploads.join(사진("p0"), send);
  await 다음_틱();
  손.풀기("row-0");
  assert.equal(await 기다림, "row-0");
  assert.equal(보낸_수, 1);
});

test("여행마다 따로 센다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 4 });
  const 손 = 손잡이<string>();
  uploads.add([사진("p0", "trip-1"), 사진("p1", "trip-2")], async () => 손.약속);
  await 다음_틱();
  assert.equal(uploads.stateOf("trip-1").total, 1);
  assert.equal(uploads.stateOf("trip-2").total, 1);
  assert.deepEqual(uploads.stateOf(undefined), NO_PHOTO_UPLOADS);
  assert.deepEqual(uploads.stateOf("trip-3"), NO_PHOTO_UPLOADS);
  손.풀기("row");
});

test("구독한 쪽은 진행이 바뀔 때만 듣는다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 1 });
  const 손 = 손잡이<string>();
  let 들은_수 = 0;
  const 그만 = uploads.subscribe(() => {
    들은_수 += 1;
  });

  uploads.add([사진("p0")], async () => 손.약속);
  assert.equal(들은_수, 1);
  // 이미 줄에 있는 사진을 또 넣어도 화면은 그대로다.
  uploads.add([사진("p0")], async () => 손.약속);
  assert.equal(들은_수, 1);
  손.풀기("row");
  await 다음_틱();
  assert.equal(들은_수, 2);
  그만();
  uploads.add([사진("p1")], async () => 손.약속);
  assert.equal(들은_수, 2);
});

test("보내는 중에는 진행이 실리고, 취소하면 줄에서 빠진다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 1 });
  const 하나 = 손잡이<string>();
  let 끊겼다 = false;
  let 알림: { 진행: (비율: number) => void } | undefined;

  uploads.add([사진("p1")], async (_job, 받은_알림) => {
    알림 = 받은_알림;
    받은_알림?.끊기(() => {
      끊겼다 = true;
      하나.깨기(new Error("끊음"));
    });
    return 하나.약속;
  });
  await 다음_틱();

  알림!.진행(0.42);
  assert.deepEqual(uploads.stateOf("trip-1").progress, { p1: 0.42 });

  uploads.drop("trip-1", "p1");
  assert.equal(끊겼다, true);
  await 다음_틱();
  assert.deepEqual(uploads.stateOf("trip-1"), NO_PHOTO_UPLOADS);
});

test("멈춘 사진은 한 장만 골라 다시 보낸다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 2 });
  const 손잡이들 = new Map([["p1", 손잡이<string>()], ["p2", 손잡이<string>()]]);
  let 보낸_수 = 0;

  uploads.add([사진("p1"), 사진("p2")], async (job) => {
    보낸_수 += 1;
    return 손잡이들.get(job.photoId)!.약속;
  });
  await 다음_틱();
  손잡이들.get("p1")!.깨기(오류(422));
  손잡이들.get("p2")!.깨기(오류(422));
  await 다음_틱();
  assert.deepEqual(uploads.stateOf("trip-1").blocked, ["p1", "p2"]);

  손잡이들.set("p1", 손잡이<string>());
  uploads.retryOne("trip-1", "p1");
  await 다음_틱();

  // 고른 한 장만 다시 갔다. 다른 한 장은 멈춘 채다.
  assert.equal(보낸_수, 3);
  assert.deepEqual(uploads.stateOf("trip-1").blocked, ["p2"]);
});

test("연결이 오래 끊기면 세 번 만에 멈춰 「업로드 중」이 끝난다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 1, retryMs: () => 0, maxAttempts: 3 });
  let 보낸_수 = 0;
  const send = async () => {
    보낸_수 += 1;
    throw 오류(0, "인터넷 연결을 확인하고 다시 시도해 주세요.");
  };

  uploads.add([사진("p0")], send);
  // 쉬는 시간이 0 이라 곧바로 이어 보낸다. 상한에 닿으면 스스로 멈춘다.
  for (let 번 = 0; 번 < 12; 번 += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    await 다음_틱();
  }

  const 멈춘_뒤 = uploads.stateOf("trip-1");
  assert.equal(멈춘_뒤.running, false);
  assert.deepEqual(멈춘_뒤.blocked, ["p0"]);
  assert.equal(uploads.reasonOf("trip-1", "p0"), PHOTO_UPLOAD_GAVE_UP);
  // 처음 한 번 + 다시 세 번.
  assert.equal(보낸_수, 4);
  assert.equal(photoUploadHeadline(멈춘_뒤), "사진 1장 업로드에 실패했어요");
});

test("멈춘 뒤에도 「다시 시도」는 횟수를 0 부터 다시 센다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 1, retryMs: () => 0, maxAttempts: 1 });
  let 보낸_수 = 0;
  const send = async () => {
    보낸_수 += 1;
    if (보낸_수 <= 2) throw 오류(0, "인터넷 연결을 확인하고 다시 시도해 주세요.");
    return "row";
  };

  uploads.add([사진("p0")], send);
  for (let 번 = 0; 번 < 6; 번 += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    await 다음_틱();
  }
  assert.deepEqual(uploads.stateOf("trip-1").blocked, ["p0"]);

  uploads.retry("trip-1");
  await 다음_틱();
  await 다음_틱();
  assert.deepEqual(uploads.stateOf("trip-1"), NO_PHOTO_UPLOADS);
  assert.deepEqual(uploads.uploadedIds("trip-1"), ["p0"]);
});

test("취소하면 멈춘 사진도 줄에서 빠진다", async () => {
  const uploads = createPhotoUploads<string>({ atOnce: 1, retryMs: () => 0, maxAttempts: 1 });
  uploads.add([사진("p0")], async () => {
    throw 오류(0, "인터넷 연결을 확인하고 다시 시도해 주세요.");
  });
  for (let 번 = 0; 번 < 6; 번 += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    await 다음_틱();
  }
  assert.deepEqual(uploads.stateOf("trip-1").blocked, ["p0"]);

  uploads.drop("trip-1", "p0");
  assert.deepEqual(uploads.stateOf("trip-1"), NO_PHOTO_UPLOADS);
});
