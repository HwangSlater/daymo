import assert from "node:assert/strict";
import { test } from "node:test";

import { sheetHintOf, submitLabelOf } from "./sheetText.ts";

test("잠긴 시트의 버튼은 언제나 닫기다", () => {
  assert.equal(
    submitLabelOf({ locked: true, submitting: true, submit: "저장", busyLabel: "저장 중…" }),
    "닫기",
  );
});

test("기다리는 동안에만 기다림 글로 바꾼다", () => {
  const 기본 = { locked: false, submit: "저장", busyLabel: "저장 중…" };
  assert.equal(submitLabelOf({ ...기본, submitting: true }), "저장 중…");
  assert.equal(submitLabelOf({ ...기본, submitting: false }), "저장");
});

test("기다림 글을 주지 않으면 글을 건드리지 않는다", () => {
  assert.equal(submitLabelOf({ locked: false, submitting: true, submit: "읽는 중…" }), "읽는 중…");
});

test("잠김 안내는 저장을 막았는지와 상관없이 보인다", () => {
  assert.equal(
    sheetHintOf({ locked: true, lockedHint: "보기만 할 수 있는 공간이에요", submitDisabled: false }),
    "보기만 할 수 있는 공간이에요",
  );
});

test("막았을 때만 모자란 것을 알린다", () => {
  const 기본 = { locked: false, lockedHint: "보기만 할 수 있어요", disabledHint: "이름을 적어 주세요" };
  assert.equal(sheetHintOf({ ...기본, submitDisabled: true }), "이름을 적어 주세요");
  assert.equal(sheetHintOf({ ...기본, submitDisabled: false }), undefined);
});

test("알릴 말이 없으면 아무 줄도 내지 않는다", () => {
  assert.equal(sheetHintOf({ locked: false, lockedHint: "", submitDisabled: true }), undefined);
});
