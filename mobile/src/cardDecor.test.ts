import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDecor,
  clampDecorSpot,
  decorBodyOf,
  decorBoxOf,
  decorOf,
  fitScaleOf,
  legacyDecorOf,
  moveDecor,
  raiseDecor,
  removeDecor,
  resizeDecor,
  setDecorText,
  turnDecor,
  turnedAngle,
  DECOR_MAX,
  DECOR_MAX_SIZE,
  DECOR_MIN_SIZE,
  DECOR_NEW_SIZE,
  type CardDecor,
  setDecorSize,
} from "./cardDecor.ts";

const 하나 = (고칠: Partial<CardDecor> = {}): CardDecor => ({
  id: "d1", kind: "하트", text: "", x: 0.5, y: 0.5, size: 0.2, angle: 0, z: 0, ...고칠,
});

test("저장된 목록을 읽고 모양이 틀린 줄은 버린다", () => {
  const 읽은_것 = decorOf([
    { id: "d1", kind: "별", x: 0.2, y: 0.3, size: 0.25, angle: 400, z: 5 },
    // 모르는 스티커
    { kind: "유니콘", x: 0.5, y: 0.5 },
    // 글자를 다 지운 줄은 카드에 아무것도 안 그린다
    { kind: "글자", text: "  ", x: 0.5, y: 0.5 },
    { kind: "글자", text: " 좋았다 ", x: 3, y: -1, size: 9, z: 1 },
    "스티커",
    null,
  ]);

  assert.deepEqual(읽은_것.map((줄) => 줄.kind), ["글자", "별"]);
  // 겹침 순서로 줄을 세우고 0부터 다시 매긴다.
  assert.deepEqual(읽은_것.map((줄) => 줄.z), [0, 1]);
  const 글자 = 읽은_것[0];
  assert.equal(글자.text, "좋았다");
  // 범위를 벗어난 값은 잘린다.
  assert.equal(글자.x, 1);
  assert.equal(글자.y, 0);
  assert.equal(글자.size, DECOR_MAX_SIZE);
  // 각도는 -180~180 으로 접힌다.
  assert.equal(읽은_것[1].angle, 40);
  assert.deepEqual(decorOf(undefined), []);
  assert.deepEqual(decorOf({ kind: "하트" }), []);
});

test("각도는 한 바퀴를 넘겨도 같은 그림으로 접힌다", () => {
  assert.equal(turnedAngle(0), 0);
  assert.equal(turnedAngle(370), 10);
  assert.equal(turnedAngle(-190), 170);
  assert.equal(turnedAngle(180), -180);
});

test("서버로 보낼 때 소수는 셋째 자리까지만 적는다", () => {
  const body = decorBodyOf([하나({ x: 0.123456, y: 0.5, size: 0.2 }), 하나({ id: "d2", kind: "글자", text: "바다" })]);

  assert.equal(body[0].x, 0.123);
  assert.equal(body[0].text, null);
  assert.equal(body[1].text, "바다");
  // 비워 둔 텍스트는 저장하지 않는다.
  assert.equal(decorBodyOf([하나({ kind: "글자", text: "  " }), 하나({ id: "d2" })]).length, 1);
});

test("픽셀로 바꾸는 셈은 한 곳뿐이다", () => {
  // 스티커는 짧은 변에 맞춘 정사각이다. 세로 카드도 가로 카드도 같은 크기로 보인다.
  const 세로 = decorBoxOf(하나({ x: 0.5, y: 0.25, size: 0.2 }), 200, 600);
  assert.equal(세로.side, 40);
  assert.equal(세로.width, 40);
  assert.deepEqual([세로.cx, 세로.cy], [100, 150]);
  // 글자는 높이만 그 크기이고 너비는 재서 넘긴 만큼이다.
  const 글자 = decorBoxOf(하나({ kind: "글자", size: 0.1 }), 300, 375, 120);
  assert.equal(글자.width, 120);
  assert.equal(글자.side, 30);
  // 아직 못 쟀으면 카드 너비로 본다. 카드보다 넓게는 잡지 않는다.
  assert.equal(decorBoxOf(하나({ kind: "글자", size: 0.1 }), 300, 375).width, 300);
  assert.equal(decorBoxOf(하나({ kind: "글자", size: 0.1 }), 300, 375, 900).width, 300);
});

test("카드 밖으로 나가지 않게 가장자리에서 멈춘다", () => {
  const 스티커 = { kind: "하트" as const, size: 0.2 };
  // 200x600 카드에서 크기 0.2 는 40px, 가로로 절반인 20px 는 0.1 이다.
  assert.deepEqual(clampDecorSpot(스티커, -1, 0.5, 200, 600), { x: 0.1, y: 0.5 });
  assert.deepEqual(clampDecorSpot(스티커, 2, 2, 200, 600), { x: 0.9, y: 1 - 40 / 2 / 600 });
  // 안쪽 값은 그대로다.
  assert.deepEqual(clampDecorSpot(스티커, 0.4, 0.4, 200, 600), { x: 0.4, y: 0.4 });
  // 글자는 너비를 알 수 없어 좌우로는 조금만 남긴다.
  assert.deepEqual(clampDecorSpot({ kind: "글자", size: 0.1 }, 0, 0.5, 300, 300).x, 0.06);
});

test("붙이고 지우고 겹침 순서를 바꾼다", () => {
  const 하트 = addDecor([], "하트");
  assert.equal(하트.length, 1);
  assert.equal(하트[0].size, DECOR_NEW_SIZE);
  // 늘 가운데에 놓으면 정확히 포개져 하나만 있는 줄 안다. 조금씩 비껴 놓는다.
  const 둘 = addDecor(하트, "별");
  assert.notEqual(둘[0].x, 둘[1].x);
  assert.deepEqual(둘.map((줄) => 줄.id), ["d1", "d2"]);

  const 셋 = addDecor(둘, "글자", " 좋았다 ");
  assert.equal(셋[2].kind, "글자");
  assert.equal(셋[2].text, "좋았다");

  // 맨 위 것을 맨 아래로 내린다.
  const 내린_것 = raiseDecor(셋, "d3", false);
  assert.deepEqual(내린_것.map((줄) => 줄.id), ["d1", "d3", "d2"]);
  assert.deepEqual(내린_것.map((줄) => 줄.z), [0, 1, 2]);
  // 맨 아래에서 더 내리면 그대로다.
  assert.deepEqual(raiseDecor(내린_것, "d1", false).map((줄) => 줄.id), ["d1", "d3", "d2"]);
  // 맨 위에서 더 올려도 그대로다.
  assert.deepEqual(raiseDecor(내린_것, "d2", true).map((줄) => 줄.id), ["d1", "d3", "d2"]);

  const 지운_것 = removeDecor(셋, "d2");
  assert.deepEqual(지운_것.map((줄) => 줄.id), ["d1", "d3"]);
  assert.deepEqual(지운_것.map((줄) => 줄.z), [0, 1]);
  // 지운 이름은 다시 쓰지 않는다. 옮기던 스티커가 남의 자리로 가면 안 된다.
  assert.equal(addDecor(지운_것, "별")[2].id, "d4");
});

test("가득 차면 더 붙지 않는다", () => {
  let 목록: CardDecor[] = [];
  for (let 번 = 0; 번 < DECOR_MAX + 3; 번 += 1) 목록 = addDecor(목록, "별");
  assert.equal(목록.length, DECOR_MAX);
  assert.equal(decorBodyOf(목록).length, DECOR_MAX);
});

test("크기와 각도는 한계에서 멈춘다", () => {
  let 목록 = [하나({ size: 0.2 })];
  for (let 번 = 0; 번 < 40; 번 += 1) 목록 = resizeDecor(목록, "d1", true);
  assert.equal(목록[0].size, DECOR_MAX_SIZE);
  for (let 번 = 0; 번 < 60; 번 += 1) 목록 = resizeDecor(목록, "d1", false);
  assert.equal(목록[0].size, DECOR_MIN_SIZE);

  assert.equal(turnDecor([하나()], "d1", true)[0].angle, 15);
  assert.equal(turnDecor([하나()], "d1", false)[0].angle, -15);
  // 열두 번 돌리면 한 바퀴다.
  let 돈_것 = [하나()];
  for (let 번 = 0; 번 < 24; 번 += 1) 돈_것 = turnDecor(돈_것, "d1", true);
  assert.equal(돈_것[0].angle, 0);
});

test("옮기기와 글자 고치기는 그 줄만 바꾼다", () => {
  const 목록 = [하나(), 하나({ id: "d2", kind: "글자", text: "바다" })];
  const 옮긴_것 = moveDecor(목록, "d1", 0.8, 0.2);
  assert.deepEqual([옮긴_것[0].x, 옮긴_것[0].y], [0.8, 0.2]);
  assert.equal(옮긴_것[1], 목록[1]);

  assert.equal(setDecorText(목록, "d2", "산")[1].text, "산");
  // 스티커에는 글자를 넣지 않는다.
  assert.equal(setDecorText(목록, "d1", "산")[0].text, "");
});

test("옛 스티커 목록을 새 형식으로 옮긴다", () => {
  // 옛 판은 켠 차례가 아니라 정해진 차례로 모서리에 붙였다. 그대로 옮긴다.
  const 옮긴_것 = legacyDecorOf(["비행기", "하트", "별"], [1, 1, 1, 1]);
  assert.deepEqual(옮긴_것.map((줄) => 줄.kind), ["하트", "별", "비행기"]);
  assert.deepEqual(옮긴_것.map((줄) => 줄.z), [0, 1, 2]);
  // 첫 스티커는 첫 칸 우상, 두 번째는 두 번째 칸 좌하다. 넷이 다 다른 자리다.
  assert.equal(new Set(옮긴_것.map((줄) => `${줄.x},${줄.y}`)).size, 3);
  assert.ok(옮긴_것[0].x > 0.5 && 옮긴_것[0].y < 0.25);
  assert.ok(옮긴_것[1].x < 0.5);
  // 옮긴 것도 카드 안에 있다.
  옮긴_것.forEach((줄) => {
    assert.deepEqual(clampDecorSpot(줄, 줄.x, 줄.y, 200, 600), { x: 줄.x, y: 줄.y });
  });
  assert.deepEqual(legacyDecorOf([], [1, 1, 1, 1]), []);
  assert.deepEqual(legacyDecorOf(["유니콘"], [1]), []);
  // 칸마다 모서리는 넷뿐이라 그보다 많이 켰으면 뒤쪽은 빠진다.
  assert.equal(legacyDecorOf(["하트", "별", "비행기", "필름", "말풍선", "체크"], [1]).length, 4);
});

test("카드를 화면에 맞춰 줄일 배율", () => {
  // 세로로 긴 네컷 스트립(200x600)은 줄인다. 높이가 먼저 걸린다.
  assert.equal(fitScaleOf(200, 600, 360, 480), 0.8);
  // 작고 납작한 가로 카드는 키운다. 너무 키우면 사진이 뭉개져서 2.4배에서 멈춘다.
  assert.equal(fitScaleOf(300, 150, 360, 480), 1.2);
  assert.equal(fitScaleOf(100, 50, 900, 900), 2.4);
  // 잴 곳이 아직 없으면 1 이다.
  assert.equal(fitScaleOf(200, 600, 0, 0), 1);
});

test("모서리를 끌면 크기와 각도가 함께 놓인다", () => {
  const 하나 = addDecor([], "하트");

  const 키운_것 = setDecorSize(하나, 하나[0].id, 0.3, 200);
  assert.equal(키운_것[0].size, 0.3);
  // 각도는 -180~180 으로 접는다. 200도와 -160도는 같은 그림이다.
  assert.equal(키운_것[0].angle, -160);
  // 한계에 닿으면 멈춘다. 카드를 덮는 스티커는 지울 길이 없다.
  assert.equal(setDecorSize(하나, 하나[0].id, 9, 0)[0].size, DECOR_MAX_SIZE);
  assert.equal(setDecorSize(하나, 하나[0].id, 0, 0)[0].size, DECOR_MIN_SIZE);
  // 다른 줄은 건드리지 않는다.
  assert.deepEqual(setDecorSize(하나, "없는것", 0.3, 45), 하나);
});

test("글자의 글꼴·색·바탕은 기본이 아닐 때만 저장하고, 모르는 값은 그대로 돌려보낸다", async () => {
  const { decorOf, decorBodyOf, setDecorStyle } = await import("./cardDecor.ts");
  const 읽은_것 = decorOf([
    { id: "d1", kind: "글자", text: "최고의 하루", x: 0.5, y: 0.5, size: 0.1, angle: 0, z: 0, font: "손글씨", color: "크림", back: "띠" },
    { id: "d2", kind: "글자", text: "기본", x: 0.5, y: 0.5, size: 0.1, angle: 0, z: 1, font: "기본", color: "흰색", back: "없음" },
    { id: "d3", kind: "글자", text: "새 글꼴", x: 0.5, y: 0.5, size: 0.1, angle: 0, z: 2, font: "붓글씨" },
  ]);
  assert.deepEqual([읽은_것[0].font, 읽은_것[0].color, 읽은_것[0].back], ["손글씨", "크림", "띠"]);
  const 보낼_것 = decorBodyOf(읽은_것);
  assert.equal(보낼_것[0].font, "손글씨");
  // 기본만 고른 글자는 예전 모양 그대로다.
  assert.deepEqual(Object.keys(보낼_것[1]).sort(), ["angle", "id", "kind", "size", "text", "x", "y", "z"]);
  // 이 판이 모르는 글꼴은 버리지 않는다. 사람이 다른 글꼴을 고르면 그때 바뀐다.
  assert.equal(보낼_것[2].font, "붓글씨");
  assert.equal(decorBodyOf(setDecorStyle(읽은_것, "d3", { font: "굵게" }))[2].font, "굵게");
});

test("복제하면 조금 비껴 맨 위에 새 이름으로 붙고, 한도가 차면 그대로다", async () => {
  const { addDecor, duplicateDecor, DECOR_MAX } = await import("./cardDecor.ts");
  const 하나 = addDecor([], "하트");
  const 둘 = duplicateDecor(하나, 하나[0].id);
  assert.equal(둘.length, 2);
  assert.notEqual(둘[1].id, 둘[0].id);
  assert.equal(둘[1].z, 1);
  assert.ok(둘[1].x > 둘[0].x && 둘[1].y > 둘[0].y);
  let 가득 = 하나;
  while (가득.length < DECOR_MAX) 가득 = addDecor(가득, "별");
  assert.equal(duplicateDecor(가득, 가득[0].id).length, DECOR_MAX);
});
