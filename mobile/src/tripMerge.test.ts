import assert from "node:assert/strict";
import { test } from "node:test";

import { appendServerTrips, mergeServerTrips, mergeServerTripsByGroup } from "./tripMerge.ts";

type Trip = { id?: string; name: string; planning?: { memo: string } };

test("서버 목록으로 바꿔도 기기에 적어 둔 기록은 남는다", () => {
  // 예전에는 여기서 기록이 사라졌고, 사라진 채로 저장됐다.
  const local: Trip[] = [{ id: "t1", name: "옛 이름", planning: { memo: "주차는 뒤쪽" } }];
  const server: Trip[] = [{ id: "t1", name: "서버 이름" }];

  assert.deepEqual(mergeServerTrips(server, local), [
    { id: "t1", name: "서버 이름", planning: { memo: "주차는 뒤쪽" } },
  ]);
});

test("이름과 날짜 같은 여행 정보는 서버 값이 이긴다", () => {
  const local: Trip[] = [{ id: "t1", name: "기기에서 본 이름", planning: { memo: "a" } }];
  const server: Trip[] = [{ id: "t1", name: "다른 기기에서 고친 이름" }];

  assert.equal(mergeServerTrips(server, local)[0].name, "다른 기기에서 고친 이름");
});

test("다른 기기에서 만든 여행은 기록 없이 들어온다", () => {
  const server: Trip[] = [{ id: "new", name: "새 여행" }];

  assert.deepEqual(mergeServerTrips(server, []), [{ id: "new", name: "새 여행" }]);
});

test("서버에 없는 여행은 버린다", () => {
  // 다른 기기에서 지운 여행이 되살아나면 안 된다.
  const local: Trip[] = [{ id: "gone", name: "지운 여행", planning: { memo: "a" } }];

  assert.deepEqual(mergeServerTrips([], local), []);
});

test("서버가 기록을 들고 오면 서버 쪽이 이긴다", () => {
  const local: Trip[] = [{ id: "t1", name: "여행", planning: { memo: "기기" } }];
  const server: Trip[] = [{ id: "t1", name: "여행", planning: { memo: "서버" } }];

  assert.equal(mergeServerTrips(server, local)[0].planning?.memo, "서버");
});

test("서버가 참가자만 들고 오면 참가자만 바뀌고 나머지 기록은 남는다", () => {
  type Planned = { id: string; name: string; planning?: { memo?: string; participants?: string[] } };
  const local: Planned[] = [{ id: "t1", name: "여행", planning: { memo: "주차는 뒤쪽", participants: ["하늘"] } }];
  const server: Planned[] = [{ id: "t1", name: "여행", planning: { participants: ["하늘", "여울"] } }];

  assert.deepEqual(mergeServerTrips(server, local)[0].planning, { memo: "주차는 뒤쪽", participants: ["하늘", "여울"] });
});

test("공간을 옮긴 여행도 기록을 잃지 않는다", () => {
  const local = { spaceA: [{ id: "t1", name: "여행", planning: { memo: "남아야 한다" } }] };
  const server = { spaceB: [{ id: "t1", name: "여행" }] };

  assert.equal(mergeServerTripsByGroup<Trip>(server, local).spaceB[0].planning?.memo, "남아야 한다");
});

test("첫 쪽만 받았으면 아직 안 온 뒤쪽 여행을 버리지 않는다", () => {
  // 아래로 내려 받아 둔 여행이 당겨서 새로고침 한 번에 사라지던 자리다.
  type Dated = { id?: string; name: string; start?: string; planning?: { memo: string } };
  const local = {
    space: [
      { id: "t1", name: "제주", start: "2026-10-01" },
      { id: "t9", name: "옛 여행", start: "2020-03-01", planning: { memo: "지켜야 한다" } },
    ],
  };
  const server = { space: [{ id: "t1", name: "제주", start: "2026-10-01" }] };

  const 이어받는_중 = mergeServerTripsByGroup<Dated>(server, local, { space: true });
  const 다_받았다 = mergeServerTripsByGroup<Dated>(server, local, { space: false });

  assert.deepEqual(이어받는_중.space.map((trip) => trip.id), ["t1", "t9"]);
  assert.equal(이어받는_중.space[1].planning?.memo, "지켜야 한다");
  // 더 받을 것이 없으면 예전 그대로다. 다른 기기에서 지운 여행이 되살아나면 안 된다.
  assert.deepEqual(다_받았다.space.map((trip) => trip.id), ["t1"]);
});

test("첫 쪽 안에서 사라진 여행은 이어 받는 중에도 버린다", () => {
  type Dated = { id?: string; name: string; start?: string };
  const local = {
    space: [
      { id: "t1", name: "제주", start: "2026-10-01" },
      { id: "t2", name: "지워진 여행", start: "2026-09-01" },
      { id: "t3", name: "부산", start: "2026-08-01" },
    ],
  };
  // 서버는 t2 를 주지 않는다. 경계(t3 의 2026-08-01)보다 앞이라 지워진 것이다.
  const server = {
    space: [{ id: "t1", name: "제주", start: "2026-10-01" }, { id: "t3", name: "부산", start: "2026-08-01" }],
  };

  const 이어받는_중 = mergeServerTripsByGroup<Dated>(server, local, { space: true });

  assert.deepEqual(이어받는_중.space.map((trip) => trip.id), ["t1", "t3"]);
});

test("다음 쪽을 이어 붙여도 먼저 받은 여행이 사라지지 않는다", () => {
  // 예전에 목록을 통째로 바꾸던 자리다. 두 번째 쪽만 넣으면 첫 쪽이 통째로 날아갔다.
  const 첫_쪽: Trip[] = [{ id: "t1", name: "제주", planning: { memo: "주차는 뒤쪽" } }];
  const 다음_쪽: Trip[] = [{ id: "t2", name: "부산" }];

  assert.deepEqual(appendServerTrips(첫_쪽, 다음_쪽, 첫_쪽), [
    { id: "t1", name: "제주", planning: { memo: "주차는 뒤쪽" } },
    { id: "t2", name: "부산" },
  ]);
});

test("이어 붙인 여행에도 기기에 적어 둔 기록이 따라온다", () => {
  const local: Trip[] = [{ id: "t2", name: "옛 이름", planning: { memo: "여기 국밥" } }];

  const 이어붙임 = appendServerTrips<Trip>([], [{ id: "t2", name: "부산" }], local);

  assert.deepEqual(이어붙임, [{ id: "t2", name: "부산", planning: { memo: "여기 국밥" } }]);
});

test("같은 여행이 두 쪽에 걸쳐 와도 목록에는 한 번만 남는다", () => {
  const 첫_쪽: Trip[] = [{ id: "t1", name: "옛 이름" }, { id: "t2", name: "부산" }];
  const 다음_쪽: Trip[] = [{ id: "t2", name: "부산(고침)" }, { id: "t3", name: "강릉" }];

  assert.deepEqual(appendServerTrips(첫_쪽, 다음_쪽, 첫_쪽), [
    { id: "t1", name: "옛 이름" },
    { id: "t2", name: "부산(고침)" },
    { id: "t3", name: "강릉" },
  ]);
});
