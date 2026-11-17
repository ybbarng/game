import { describe, expect, it } from "vitest";

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

/**
 * 화면 시험은 `Math.random`을 덮어 판을 고정하지 않는다. 효과음(`game/sound.ts`)이 소리 상자를 처음 만들 때 잔향·잡음
 * 버퍼를 같은 `Math.random`으로 채워, 새 판 전까지 부르는 횟수가 기기의 오디오 표본율(맥 48kHz, CI 44.1kHz)만큼
 * 달라진다. 그러면 고정했다고 믿은 판 씨앗이 기기마다 다르다(2026-11-18 장기 시험 CI 실패, #348).
 * 판은 주소 씨앗(`?seed=`)·시험용 씨앗 갈고리·이어하기 저장본으로 연다. docs/standing-rules.md 4절
 */
const FILES = import.meta.glob<string>(["../e2e/*.spec.ts", "../e2e/*.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/** `Math.random = …`, `Math.random=…`, `Object.defineProperty(Math, "random", …)`, `spyOn(Math, "random")` */
function overridesMathRandom(source: string): boolean {
  return (
    /Math\s*\.\s*random\s*=[^=]/.test(source) ||
    /\(\s*Math\s*,\s*["'`]random["'`]/.test(source)
  );
}

describe("화면 시험의 난수", () => {
  it("e2e 파일은 Math.random을 덮어쓰지 않는다", () => {
    const found = Object.entries(FILES)
      .filter(([, source]) => overridesMathRandom(source))
      .map(([path]) => path.replace("../e2e/", ""));
    expect(found).toEqual([]);
  });

  it("e2e 파일을 실제로 읽는다(검사가 빈 목록을 보지 않는다)", () => {
    const names = Object.keys(FILES).map((p) => p.replace("../e2e/", ""));
    expect(names).toContain("baseball.spec.ts");
    expect(names).toContain("test.ts");
  });

  it("덮어쓰는 꼴을 알아본다", () => {
    expect(overridesMathRandom("Math.random = () => 0.5;")).toBe(true);
    expect(overridesMathRandom("Math.random=()=>0.5")).toBe(true);
    expect(
      overridesMathRandom('Object.defineProperty(Math, "random", { value })'),
    ).toBe(true);
    expect(overridesMathRandom('vi.spyOn(Math, "random")')).toBe(true);
    expect(overridesMathRandom("const x = Math.random();")).toBe(false);
    expect(overridesMathRandom("if (Math.random === original) {}")).toBe(false);
  });
});
