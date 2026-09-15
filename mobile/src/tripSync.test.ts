import assert from "node:assert/strict";
import { test } from "node:test";

import { idsFromNames, namesFromIds, rosterOf, sameIds, TripConflictError } from "./tripSync.ts";

const roster = rosterOf(
  { name: "하늘", membershipId: "m-me" },
  [
    { id: "m-yeoul", name: "여울" },
    { id: "m-garam", name: "가람" },
    { name: "id 없는 사람" },
  ],
);

test("표는 나를 맨 앞에 두고 id 없는 사람을 뺀다", () => {
  assert.deepEqual(roster, [
    { id: "m-me", name: "하늘" },
    { id: "m-yeoul", name: "여울" },
    { id: "m-garam", name: "가람" },
  ]);
});

test("내 membership id 를 모르면 나는 표에 없다", () => {
  assert.deepEqual(rosterOf({ name: "하늘" }, [{ id: "m-yeoul", name: "여울" }]), [{ id: "m-yeoul", name: "여울" }]);
});

test("서버 id 를 순서대로 이름으로 바꾸고 나간 멤버는 뺀다", () => {
  assert.deepEqual(namesFromIds(["m-garam", "m-left", "m-me"], roster), ["가람", "하늘"]);
});

test("이름을 id 로 바꾸고 모르는 이름은 따로 돌려준다", () => {
  assert.deepEqual(idsFromNames(["여울", "동행", "하늘"], roster), {
    ids: ["m-yeoul", "m-me"],
    unknown: ["동행"],
  });
});

test("같은 이름이면 뒤 사람에게 번호를 붙이고, 나간 멤버는 지금 멤버 뒤에 선다", () => {
  const twins = rosterOf(
    { name: "하늘", membershipId: "a" },
    [{ id: "b", name: "하늘" }, { id: "c", name: "미정" }],
    [{ id: "d", name: "하늘" }, { id: "b", name: "하늘" }],
  );

  assert.deepEqual(twins, [
    { id: "a", name: "하늘" },
    { id: "b", name: "하늘 2" },
    { id: "c", name: "미정 2" },
    { id: "d", name: "하늘 3" },
  ]);
  assert.deepEqual(idsFromNames(["하늘 2", "하늘", "하늘"], twins), { ids: ["b", "a"], unknown: ["하늘"] });
});

test("id 목록은 순서까지 같아야 같다", () => {
  assert.equal(sameIds(["a", "b"], ["a", "b"]), true);
  assert.equal(sameIds(["a", "b"], ["b", "a"]), false);
  assert.equal(sameIds(["a"], ["a", "b"]), false);
});

test("충돌 오류는 최신 내용을 들고 온다", () => {
  const error = new TripConflictError({ name: "먼저 고친 제목", start: "2026-10-01", end: "2026-10-02", region: "제주", note: "" });

  assert.ok(error instanceof Error);
  assert.equal(error.latest.name, "먼저 고친 제목");
});
