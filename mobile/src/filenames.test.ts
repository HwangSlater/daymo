import assert from "node:assert/strict";
import { test } from "node:test";

import { photoFileName, safeFileName } from "./filenames.ts";

test("파일 이름에 못 쓰는 글자를 지운다", () => {
  assert.equal(safeFileName("전주 한옥마을 비용"), "전주 한옥마을 비용");
  assert.equal(safeFileName('여행/기록:2026?"<>|'), "여행기록2026");
  assert.equal(safeFileName("   "), "여행 비용");
  assert.equal(safeFileName("", "기본"), "기본");
});

test("사진 자리에서 이름을 뽑고 확장자가 없으면 jpg 로 본다", () => {
  assert.equal(photoFileName("file:///cache/ImagePicker/abc-123.jpeg"), "abc-123.jpeg");
  // 안드로이드는 확장자 없는 content 주소를 준다.
  assert.equal(photoFileName("content://media/external/images/1000000034"), "1000000034.jpg");
  assert.equal(photoFileName("ph://ABC?width=100"), "ABC.jpg");
  assert.equal(photoFileName("file:///x/y/"), "photo.jpg");
  assert.equal(photoFileName(""), "photo.jpg");
});
