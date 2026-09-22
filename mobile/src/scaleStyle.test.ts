import assert from "node:assert/strict";
import { test } from "node:test";

import { scaleStyles } from "./scaleStyle.ts";

test("길이만 곱하고 퍼센트·비율·색·각도는 그대로 둔다", () => {
  const 시트 = {
    card: { borderRadius: 14, padding: 12, overflow: "hidden", flex: 1, opacity: 0.7 },
    fill: { width: "100%", height: "100%" },
    title: { fontSize: 17, lineHeight: 24, letterSpacing: 0.4, color: "#FFFFFF", zIndex: 3 },
    shadow: { shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    tilt: { transform: [{ rotate: "-4deg" }, { translateX: 5 }], borderWidth: 5 },
  };
  const 큰 = scaleStyles(시트, 2);
  assert.deepEqual(큰.card, { borderRadius: 28, padding: 24, overflow: "hidden", flex: 1, opacity: 0.7 });
  assert.deepEqual(큰.fill, { width: "100%", height: "100%" });
  assert.deepEqual(큰.title, { fontSize: 34, lineHeight: 48, letterSpacing: 0.8, color: "#FFFFFF", zIndex: 3 });
  assert.deepEqual(큰.shadow, { shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 });
  assert.deepEqual(큰.tilt, { transform: [{ rotate: "-4deg" }, { translateX: 10 }], borderWidth: 10 });
  // 원래 시트는 그대로다.
  assert.equal(시트.card.padding, 12);
  assert.equal(scaleStyles(시트, 1), 시트);
});
