import assert from "node:assert/strict";
import { test } from "node:test";

import { inviteTokenOf } from "./inviteLink.ts";

const token = "Ab3_-cdEFghIJklMNopQRstUVwxYZ0123456789ab";

test("메신저로 받은 링크와 앱 링크와 글에 섞인 링크에서 token 을 꺼낸다", () => {
  assert.equal(inviteTokenOf(`https://api.daymo.xyz/auth/invite?token=${token}`), token);
  assert.equal(inviteTokenOf(`daymo://invite?token=${token}`), token);
  assert.equal(inviteTokenOf(`Daymo 여행 공간에 초대해요.\nhttps://api.daymo.xyz/auth/invite?token=${token} 7일 안에 열어 주세요`), token);
  assert.equal(inviteTokenOf(`  ${token}  `), token);
});

test("초대 링크가 아니면 없다", () => {
  assert.equal(inviteTokenOf("https://example.com/?token=" + token), null);
  assert.equal(inviteTokenOf("daymo://invite?token=짧음"), null);
  assert.equal(inviteTokenOf(""), null);
  assert.equal(inviteTokenOf("우리 공간 링크 보내 줘"), null);
});
