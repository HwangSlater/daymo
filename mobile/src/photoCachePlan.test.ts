import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cacheBytesOf,
  cacheKindOf,
  cacheSizeText,
  planPhotoSweep,
  PHOTO_CACHE_LIMIT,
  type CacheFile,
} from "./photoCachePlan.ts";

const 판 = 2;
const MB = 1024 * 1024;

/** 시험용 파일 한 개. 시각은 작을수록 오래된 것이다. */
const 파일 = (name: string, mb: number, modifiedAt: number): CacheFile => ({ name, bytes: mb * MB, modifiedAt });

test("파일 이름으로 갈래를 가른다", () => {
  assert.equal(cacheKindOf("server-a1-d2.jpg", 판), "표시본");
  assert.equal(cacheKindOf("server-a1-d1.jpg", 판), "옛표시본");
  // 판을 이름에 넣기 전에 받아 둔 것.
  assert.equal(cacheKindOf("server-a1.jpg", 판), "옛표시본");
  assert.equal(cacheKindOf("server-a1-thumbnail.jpg", 판), "썸네일");
  assert.equal(cacheKindOf("server-a1-original.jpg", 판), "원본사본");
});

test("기기에서 고른 원본은 캐시가 아니다", () => {
  // `WarmTripDetail.copyPhotoIntoApp` 과 `tripPhotos.keepTripPhoto` 가 짓는 두 이름.
  assert.equal(cacheKindOf("photo-1758100000000.jpg", 판), "내것");
  assert.equal(cacheKindOf("1758100000000-IMG_0042.jpg", 판), "내것");
});

test("쓰는 곳이 없는 것은 상한과 상관없이 지운다", () => {
  const 것 = planPhotoSweep(
    [
      파일("server-a1-d2.jpg", 1, 100),
      파일("server-a1-d1.jpg", 1, 90),
      파일("server-b2-original.jpg", 3, 80),
      파일("photo-1758100000000.jpg", 5, 70),
    ],
    PHOTO_CACHE_LIMIT,
    판,
  );
  assert.deepEqual(것.remove.sort(), ["server-a1-d1.jpg", "server-b2-original.jpg"]);
  assert.equal(것.freed, 4 * MB);
  // 남는 것은 표시본 1MB 뿐이다. 고른 원본 5MB 는 세지 않는다.
  assert.equal(것.bytes, 1 * MB);
});

test("상한을 넘으면 오래전에 받은 것부터 지운다", () => {
  const 것 = planPhotoSweep(
    [
      파일("server-new-d2.jpg", 4, 300),
      파일("server-old-d2.jpg", 4, 100),
      파일("server-mid-thumbnail.jpg", 4, 200),
    ],
    9 * MB,
    판,
  );
  assert.deepEqual(것.remove, ["server-old-d2.jpg"]);
  assert.equal(것.bytes, 8 * MB);
});

test("아직 못 올린 원본은 상한을 넘겨도 지우지 않는다", () => {
  const 것 = planPhotoSweep(
    [파일("photo-1.jpg", 50, 100), 파일("photo-2.jpg", 50, 200), 파일("server-a1-d2.jpg", 1, 300)],
    2 * MB,
    판,
  );
  assert.deepEqual(것.remove, []);
  assert.equal(것.bytes, 1 * MB);
});

test("상한 안이면 아무것도 지우지 않는다", () => {
  const 것 = planPhotoSweep([파일("server-a1-d2.jpg", 1, 100)], PHOTO_CACHE_LIMIT, 판);
  assert.deepEqual(것.remove, []);
  assert.equal(것.freed, 0);
});

test("용량은 캐시만 센다", () => {
  const 것 = cacheBytesOf([파일("server-a1-d2.jpg", 2, 100), 파일("photo-1.jpg", 8, 100)], 판);
  assert.deepEqual(것, { bytes: 2 * MB, files: 1 });
});

test("용량 글자", () => {
  assert.equal(cacheSizeText(0), "0KB");
  assert.equal(cacheSizeText(820 * 1024), "820KB");
  assert.equal(cacheSizeText(1.5 * MB), "1.5MB");
  assert.equal(cacheSizeText(128 * MB), "128MB");
  assert.equal(cacheSizeText(1.25 * 1024 * MB), "1.3GB");
});
