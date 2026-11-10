import { describe, expect, it } from "vitest";

/**
 * 별 따기 기술 쪽 낱말과 검사 문구 말투(docs/41 3·5절, docs/36 11-74·11-75).
 *
 * 1. 화면 글·검사 문구에 「drand 회차」(→ drand 순번)와 「국장 열쇠」(→ 국장 패스키)가 없다.
 *    보는 곳: 별 따기 화면 코드, 규칙 패키지(core), 터미널 검사기. 주석과 식별자는 옛 말을 그대로 둔다.
 * 2. 장부 검사 문구(core `verify.ts`·`round-check.ts`의 `fail(…)`)는 합니다체 문장이고 마침표로 끝난다.
 *    검증 페이지와 터미널 검사기가 이 문구를 그대로 보인다.
 *
 * 파일은 `import.meta.glob`(?raw)으로 읽어 모듈 그래프에 잡히므로 `vitest --changed`도 이 시험을 돌린다.
 */

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

const SOURCES = import.meta.glob<string>(
  [
    "../**/*.{ts,tsx}",
    "../../app/stardraw/**/*.{ts,tsx}",
    "../../../../../packages/stardraw-core/src/*.ts",
    "../../../../../packages/stardraw-cli/src/*.ts",
    "!../**/*.test.{ts,tsx}",
    "!../../app/stardraw/**/*.test.{ts,tsx}",
    "!../../../../../packages/stardraw-core/src/*.test.ts",
    "!../../../../../packages/stardraw-cli/src/*.test.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

const CORE_CHECKS = import.meta.glob<string>(
  [
    "../../../../../packages/stardraw-core/src/verify.ts",
    "../../../../../packages/stardraw-core/src/round-check.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

/** 주석 줄을 뺀 줄(파일 경로·줄 번호와 함께). 줄 끝 주석은 ` // ` 뒤를 자른다 */
function codeLines(files: Record<string, string>) {
  return Object.entries(files).flatMap(([path, src]) =>
    src.split("\n").flatMap((line, i) => {
      if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) return [];
      return [
        { at: `${path}:${i + 1}`, text: line.replace(/\s\/\/\s.*$/, "") },
      ];
    }),
  );
}

describe("별 따기 기술 쪽 낱말", () => {
  it("읽어 들인 파일이 있다", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    expect(Object.keys(CORE_CHECKS)).toHaveLength(2);
  });

  it.each([
    ["drand 회차", /drand 회차|quicknet 회차/],
    ["국장 열쇠", /국장 열쇠/],
  ])("화면 글·검사 문구에 「%s」가 없다", (_, re) => {
    const found = codeLines(SOURCES)
      .filter((l) => re.test(l.text))
      .map((l) => l.at);
    expect(found).toEqual([]);
  });

  it("장부 검사 문구는 합니다체 문장이고 마침표로 끝난다", () => {
    const messages = Object.values(CORE_CHECKS).flatMap((src) =>
      [...src.matchAll(/fail\(\s*(["`])([\s\S]*?)\1/g)].map((m) => m[2] ?? ""),
    );
    expect(messages.length).toBeGreaterThan(40);
    // 「등록 …: ${problem}」처럼 다른 규칙의 문장을 이어 붙이는 것은 그 문장이 마침표를 갖는다
    const joined = /^[^:]+: \$\{[^}]+\}$/;
    expect(
      messages.filter((m) => !/(니다|\))\.$/.test(m) && !joined.test(m)),
    ).toEqual([]);
  });
});
