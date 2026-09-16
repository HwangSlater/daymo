import assert from "node:assert/strict";
import { test } from "node:test";

import { cancelButton, confirmButton, webAlertText } from "./alertText.ts";

test("버튼이 없으면 제목과 내용만 보여 준다", () => {
  assert.equal(webAlertText("기기 로그인 정리", "오래 쓰지 않은 기기에서 로그아웃했어요."),
    "기기 로그인 정리\n\n오래 쓰지 않은 기기에서 로그아웃했어요.");
});

test("취소가 아닌 버튼이 확인이다", () => {
  const buttons = [
    { text: "취소", style: "cancel" as const },
    { text: "삭제", style: "destructive" as const },
  ];
  assert.equal(confirmButton(buttons)?.text, "삭제");
  assert.equal(cancelButton(buttons)?.text, "취소");
  assert.equal(webAlertText("메모를 삭제할까요?", "내일 체크아웃 11시", buttons),
    "메모를 삭제할까요?\n\n내일 체크아웃 11시\n\n확인: 삭제 · 취소: 취소");
});

test("취소 버튼 글자가 다르면 그대로 보여 준다", () => {
  const buttons = [
    { text: "나중에", style: "cancel" as const },
    { text: "오는 편 등록", onPress: () => {} },
  ];
  assert.equal(webAlertText("가는 편을 저장했어요", undefined, buttons),
    "가는 편을 저장했어요\n\n확인: 오는 편 등록 · 취소: 나중에");
});
