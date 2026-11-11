// 공통 시험 자료 파일 읽기·다시 쓰기(시험 전용, core-fixtures.ts 머리말).
// 파일은 import.meta.glob(?raw, eager)으로 읽어 모듈 그래프에 잡힌다: 자료나 Rust 자료 파일이 바뀌어도 `vitest --changed`가
// 이 시험을 돌린다.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

import { BUILDERS } from "./core-fixtures";

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

const ROOT = "../../../../../native/cube-core/";

const FILES = import.meta.glob<string>(
  [
    "../../../../../native/cube-core/fixtures/*.json",
    "../../../../../native/cube-core/src/data.rs",
  ],
  { query: "?raw", import: "default", eager: true },
);

const WRITE = process.env.CUBE_CORE_FIXTURES === "write";

/** 지금 사이트 코드로 만든 자료가 저장소의 파일과 같은지 본다. `CUBE_CORE_FIXTURES=write`면 파일을 다시 쓴다 */
export function checkFixture(name: keyof typeof BUILDERS): void {
  const want = BUILDERS[name]();
  if (WRITE) {
    writeFileSync(fileURLToPath(new URL(ROOT + name, import.meta.url)), want);
    return;
  }
  const have = FILES[ROOT + name];
  expect(
    have,
    `${name}이 없다: CUBE_CORE_FIXTURES=write pnpm vitest run apps/web/src/cube/native/`,
  ).toBeDefined();
  // 다르면 사이트 엔진 결과가 바뀐 것: 의도한 변경이면 다시 쓰고 Rust 코어도 고친다(cargo test)
  expect(have).toBe(want);
}
