// 공통 시험 자료 파일 읽기·다시 쓰기(시험 전용, core-fixtures.ts 머리말).
// 파일은 import.meta.glob(?raw, eager)으로 읽어 모듈 그래프에 잡힌다: 자료나 Rust 자료 파일이 바뀌어도 `vitest --changed`가
// 이 시험을 돌린다.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

import { BUILDERS, fixtureJson } from "./core-fixtures";

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
    "../../../../../native/cube-core/src/keymap_data.rs",
    "../../../../../native/cube-core/src/human_data.rs",
    "../../../../../native/cube-core/src/practice_data.rs",
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
  // 다르면 사이트 엔진 결과가 바뀐 것: 의도한 변경이면 다시 쓰고 Rust 코어도 고친다(cargo test)
  expect(storedFixture(name)).toBe(want);
}

function storedFixture(name: keyof typeof BUILDERS): string {
  const have = FILES[ROOT + name];
  expect(
    have,
    `${name}이 없다: CUBE_CORE_FIXTURES=write pnpm vitest run apps/web/src/cube/native/`,
  ).toBeDefined();
  return have as string;
}

/** 저장소 자료 파일의 판 줄(`fixtureJson`이 판 하나를 한 줄에 쓴다. JSON 글 안의 줄바꿈은 \n으로 적혀 줄을 가르지 않는다) */
function storedCaseLines(name: keyof typeof BUILDERS): string[] {
  const text = storedFixture(name);
  const open = '"cases":[\n';
  const from = text.indexOf(open);
  const to = text.lastIndexOf("\n]}\n");
  expect([from >= 0, to > from], `${name}의 꼴`).toEqual([true, true]);
  return text.slice(from + open.length, to).split(",\n");
}

/**
 * 판이 무거운 자료를 판마다 나눠 보는 쪽(`checkFixtureCase`)의 나머지: 저장소 파일이 머리 `meta`와 판 줄로
 * `fixtureJson` 꼴 그대로이고, 판 차례(열쇠 `keyOf`)가 `keys`와 같은지. 이것과 판마다의 확인을 합치면
 * `checkFixture`(파일 전체가 같은지)와 같다. `CUBE_CORE_FIXTURES=write`면 파일 전체를 다시 쓴다(판마다 쪽은 쓰지 않는다)
 */
export function checkFixtureLayout(
  name: keyof typeof BUILDERS,
  meta: Record<string, unknown>,
  keys: readonly unknown[],
  keyOf: (made: Record<string, unknown>) => unknown,
): void {
  if (WRITE) {
    checkFixture(name);
    return;
  }
  const cases = storedCaseLines(name).map(
    (l) => JSON.parse(l) as Record<string, unknown>,
  );
  expect(storedFixture(name)).toBe(fixtureJson(meta, cases));
  expect(cases.map(keyOf)).toEqual(keys);
}

/** 저장소 자료의 `index`번째 판이 지금 사이트 코드로 만든 판(`made`)과 같은지. 다시 쓰기는 `checkFixtureLayout`이 한다 */
export function checkFixtureCase(
  name: keyof typeof BUILDERS,
  index: number,
  made: unknown,
): void {
  if (WRITE) return;
  // 다르면 사이트 엔진 결과가 바뀐 것: 의도한 변경이면 다시 쓰고 Rust 코어도 고친다(cargo test)
  expect(storedCaseLines(name)[index]).toBe(JSON.stringify(made));
}
