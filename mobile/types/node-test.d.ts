// 테스트는 Node 내장 러너로 돌린다. @types/node 를 통째로 들이면 React Native와
// 맞지 않는 전역 타입까지 따라오므로, types/env.d.ts 와 같은 방식으로 쓰는 것만
// 선언한다.

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    throws(fn: () => unknown, message?: string): void;
    rejects(fn: () => Promise<unknown>, message?: string): Promise<void>;
  }
  const assert: Assert;
  export default assert;
}
