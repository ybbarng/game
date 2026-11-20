import { describe, expect, it } from "vitest";

/**
 * 화면 시험은 샌드박스를 끄지 않는다(e2e/browser.ts, 2026-11-04 사내 보안 공지). spec 파일이 `test.use({ launchOptions: … })`로
 * 브라우저 실행 설정을 바꾸면 `BROWSER.launchOptions`(그 안의 `chromiumSandbox: true`)를 통째로 덮는다.
 * 그래서 `launchOptions`를 둘 때는 `...BROWSER.launchOptions`를 먼저 펼친다(2026-11-20 lab-reaction.spec.ts가 빠뜨림)
 */
const FILES = import.meta.glob<string>("../e2e/*.spec.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** `launchOptions: {` 바로 안에 `...BROWSER.launchOptions`가 없는 자리 수 */
function overridesLaunchOptions(source: string): number {
  const opens = [...source.matchAll(/launchOptions\s*:\s*\{/g)];
  return opens.filter(
    (m) =>
      !/^\s*\.\.\.BROWSER\.launchOptions\b/.test(
        source.slice((m.index ?? 0) + m[0].length),
      ),
  ).length;
}

describe("화면 시험의 브라우저 샌드박스", () => {
  it("spec 파일의 launchOptions는 BROWSER.launchOptions를 펼친 뒤 바꾼다", () => {
    const found = Object.entries(FILES)
      .filter(([, source]) => overridesLaunchOptions(source) > 0)
      .map(([path]) => path.replace("../e2e/", ""));
    expect(found).toEqual([]);
  });

  it("spec 파일을 실제로 읽는다(검사가 빈 목록을 보지 않는다)", () => {
    const names = Object.keys(FILES).map((p) => p.replace("../e2e/", ""));
    expect(names).toContain("lab-reaction.spec.ts");
    expect(names).toContain("cube-mini-scrollbar.spec.ts");
  });

  it("덮어쓰는 꼴을 알아본다", () => {
    expect(
      overridesLaunchOptions(
        'test.use({ launchOptions: { args: ["--disable-features=X"] } });',
      ),
    ).toBe(1);
    expect(
      overridesLaunchOptions(
        'test.use({\n  launchOptions: {\n    ...BROWSER.launchOptions,\n    args: [...baseArgs, "--x"],\n  },\n});',
      ),
    ).toBe(0);
  });
});
