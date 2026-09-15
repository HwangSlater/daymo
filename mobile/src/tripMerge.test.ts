import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeServerTrips, mergeServerTripsByGroup } from "./tripMerge.ts";

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

test("공간을 옮긴 여행도 기록을 잃지 않는다", () => {
  const local = { spaceA: [{ id: "t1", name: "여행", planning: { memo: "남아야 한다" } }] };
  const server = { spaceB: [{ id: "t1", name: "여행" }] };

  assert.equal(mergeServerTripsByGroup<Trip>(server, local).spaceB[0].planning?.memo, "남아야 한다");
});
