import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INVITE_KEEP_MS,
  inviteFromPageUrl,
  packKeptInvite,
  unpackKeptInvite,
} from "./inviteHandoff.ts";

const token = "Ab3_-cdEFghIJklMNopQRstUVwxYZ0123456789ab";
const 지금 = 1_700_000_000_000;

test("웹 앱 주소에서 초대 token 을 꺼내고 주소에서 지운다", () => {
  const 꺼냄 = inviteFromPageUrl(`https://www.daymo.xyz/app?invite=${token}`);

  assert.equal(꺼냄?.token, token);
  assert.equal(꺼냄?.cleaned, "/app");
});

test("주소에 다른 값이 함께 있어도 초대만 지운다", () => {
  const 꺼냄 = inviteFromPageUrl(`https://www.daymo.xyz/app?theme=dark&invite=${token}#trips`);

  assert.equal(꺼냄?.token, token);
  assert.equal(꺼냄?.cleaned, "/app?theme=dark#trips");
});

test("초대가 없거나 모양이 아니면 주소를 건드리지 않는다", () => {
  assert.equal(inviteFromPageUrl("https://www.daymo.xyz/app"), null);
  assert.equal(inviteFromPageUrl("https://www.daymo.xyz/app?invite=짧음"), null);
  assert.equal(inviteFromPageUrl("주소가 아니다"), null);
});

test("보관한 초대는 기한 안에서만 살아 있다", () => {
  const 보관 = packKeptInvite(token, 지금);

  assert.equal(unpackKeptInvite(보관, 지금), token);
  assert.equal(unpackKeptInvite(보관, 지금 + INVITE_KEEP_MS - 1), token);
  assert.equal(unpackKeptInvite(보관, 지금 + INVITE_KEEP_MS + 1), null);
  // 시계를 뒤로 돌려도 되살아나지 않는다.
  assert.equal(unpackKeptInvite(보관, 지금 - 1), null);
});

test("보관한 값이 깨졌으면 없는 것으로 본다", () => {
  assert.equal(unpackKeptInvite(null, 지금), null);
  assert.equal(unpackKeptInvite("", 지금), null);
  assert.equal(unpackKeptInvite("{", 지금), null);
  assert.equal(unpackKeptInvite(JSON.stringify({ token }), 지금), null);
  assert.equal(unpackKeptInvite(JSON.stringify({ token: "짧음", keptAt: 지금 }), 지금), null);
});
