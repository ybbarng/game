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
 * 화면 시험이 `page.route`로 같은 출처 요청을 막거나 바꾸면 서비스 워커를 막아야 한다. sw.js는 설치되면 열린 페이지를
 * 곧바로 맡고(clients.claim), 그 뒤의 요청은 page.route를 거치지 않아 막은 것이 그대로 받아진다. 언제 맡는지는 기기
 * 속도에 달려 시험이 가끔만 실패한다(2026-11-17 엠블럼 로딩 표시 시험, 그 전 stardraw-admin·cube-home)
 */
const SPECS = import.meta.glob<string>("../e2e/*.spec.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** `.route(` 첫 인자들. 다른 출처 주소(https://…)는 서비스 워커가 맡지 않는다(sw.js는 같은 출처만 다룬다) */
function sameOriginRoutes(source: string): string[] {
  return [...source.matchAll(/\.route\(\s*([^,]+),/g)]
    .map((m) => (m[1] ?? "").trim())
    .filter((arg) => !/^["'`]https?:\/\//.test(arg));
}

describe("화면 시험의 요청 가로채기", () => {
  it("같은 출처 요청을 page.route로 가로채는 spec은 서비스 워커를 막는다", () => {
    const missing = Object.entries(SPECS)
      .filter(([, source]) => sameOriginRoutes(source).length > 0)
      .filter(([, source]) => !source.includes('serviceWorkers: "block"'))
      .map(([path]) => path);
    expect(missing).toEqual([]);
  });

  it("가로채는 spec을 찾는다(검사가 빈 목록을 보지 않는다)", () => {
    const routed = Object.entries(SPECS)
      .filter(([, source]) => sameOriginRoutes(source).length > 0)
      .map(([path]) => path.replace("../e2e/", ""));
    expect(routed).toContain("cube-emblem3d.spec.ts");
    expect(routed).not.toContain("cubie-download.spec.ts");
  });
});
