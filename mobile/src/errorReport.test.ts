import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildErrorReport,
  emptyGate,
  reportingEnabled,
  scrubText,
  takeReportSlot,
  type ErrorReport,
} from "./errorReport.ts";

const 만든다 = (error: unknown, where = "우리/내 프로필"): ErrorReport =>
  buildErrorReport({ error, kind: "crash", platform: "web", appVersion: "0.1.0", where });

test("이메일을 지운다", () => {
  assert.equal(scrubText("sky.trip+2@example.test 로 로그인 실패"), "[이메일 지움] 로 로그인 실패");
});

test("토큰을 지운다", () => {
  assert.ok(!scrubText("Authorization: Bearer abc.def.ghi").includes("abc.def.ghi"));
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJza3kifQ.c2lnbmF0dXJl";
  assert.ok(!scrubText(`id_token=${jwt}`).includes(jwt));
  assert.ok(!scrubText("refreshToken: 비밀값").includes("비밀값"));
});

test("초대 링크의 물음표 뒤를 지운다", () => {
  const 지운_것 = scrubText("https://www.daymo.xyz/invite?token=ABCdef123 를 열었다");
  assert.ok(!지운_것.includes("ABCdef123"));
  assert.ok(지운_것.includes("https://www.daymo.xyz/invite"));
});

test("사진 파일 이름을 지운다", () => {
  assert.ok(!scrubText("IMG_0001.HEIC 를 올리지 못했다").includes("IMG_0001"));
  assert.ok(!scrubText("제주 첫날.jpg 가 너무 크다").includes("제주 첫날"));
});

test("긴 임의 문자열은 지우고 UUID 는 남긴다", () => {
  const 초대_토큰 = "Zx9pQw2rTy8uIo1aSd4fGh7jKl0zXcVbNmQwErTyUi";
  assert.ok(!scrubText(`초대 ${초대_토큰}`).includes(초대_토큰));

  const tripId = "550e8400-e29b-41d4-a716-446655440000";
  assert.ok(scrubText(`trip ${tripId} 없음`).includes(tripId));
});

test("오류 한 줄에 종류와 화면이 남는다", () => {
  const 보고 = 만든다(new TypeError("undefined 를 읽을 수 없다"));
  assert.equal(보고.name, "TypeError");
  assert.equal(보고.message, "undefined 를 읽을 수 없다");
  assert.equal(보고.where, "우리/내 프로필");
  assert.equal(보고.kind, "crash");
  assert.equal(보고.platform, "web");
});

test("오류 한 줄에도 개인정보가 남지 않는다", () => {
  const 보고 = 만든다(new Error("sky@example.test 의 초대 https://daymo.xyz/i?token=ABCdef123"));
  assert.ok(!보고.message.includes("example.test"));
  assert.ok(!보고.message.includes("ABCdef123"));
});

test("Error 가 아닌 것도 받는다", () => {
  assert.equal(만든다("문자열로 던졌다").message, "문자열로 던졌다");
  assert.equal(만든다({ 아무거나: 1 }).message, "알 수 없는 오류");
  assert.equal(만든다(undefined).name, "undefined");
});

test("서버 한도보다 길면 미리 끊는다", () => {
  const 보고 = 만든다(new Error("가".repeat(900)), "나".repeat(300));
  assert.ok(보고.message.length <= 500);
  assert.ok(보고.where.length <= 120);
  assert.ok(보고.message.endsWith("…"));
});

test("같은 오류는 5분 안에 다시 보내지 않는다", () => {
  const 보고 = 만든다(new TypeError("같은 것"));
  let gate = emptyGate();

  const 첫_번째 = takeReportSlot(gate, 보고, 1_000);
  assert.equal(첫_번째.allowed, true);
  gate = 첫_번째.gate;

  const 바로_다음 = takeReportSlot(gate, 보고, 2_000);
  assert.equal(바로_다음.allowed, false);
  gate = 바로_다음.gate;

  // 다른 오류는 막히지 않는다.
  const 다른_것 = takeReportSlot(gate, 만든다(new Error("다른 것")), 2_000);
  assert.equal(다른_것.allowed, true);
  gate = 다른_것.gate;

  const 다섯_분_뒤 = takeReportSlot(gate, 보고, 1_000 + 5 * 60_000);
  assert.equal(다섯_분_뒤.allowed, true);
});

test("한 시간에 10번까지만 보낸다", () => {
  let gate = emptyGate();
  let 보낸_수 = 0;
  for (let i = 0; i < 30; i += 1) {
    const 결과 = takeReportSlot(gate, 만든다(new Error(`오류 ${i}`)), 1_000 + i);
    gate = 결과.gate;
    if (결과.allowed) 보낸_수 += 1;
  }
  assert.equal(보낸_수, 10);

  // 한 시간이 지나면 다시 센다.
  const 다음_시간 = takeReportSlot(gate, 만든다(new Error("오류 99")), 1_000 + 60 * 60_000);
  assert.equal(다음_시간.allowed, true);
  assert.equal(다음_시간.gate.count, 1);
});

test("환경 변수로 끌 수 있고 기본은 켜짐이다", () => {
  assert.equal(reportingEnabled(undefined), true);
  assert.equal(reportingEnabled(""), true);
  assert.equal(reportingEnabled("on"), true);
  assert.equal(reportingEnabled("off"), false);
  assert.equal(reportingEnabled("OFF"), false);
  assert.equal(reportingEnabled("0"), false);
  assert.equal(reportingEnabled("false"), false);
});
