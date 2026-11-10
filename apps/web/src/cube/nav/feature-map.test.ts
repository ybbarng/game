import { describe, expect, it } from "vitest";

import { FEATURE_MAP } from "./feature-map";

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

// 큐브 page 파일 목록. import.meta.glob(?raw, 글로만 읽는다)으로 얻어 page 파일이 모듈 그래프에 잡힌다. 그래서 page를
// 고치거나 더하면 `vitest --changed`가 이 시험을 돌린다(예전 forceRerunTriggers는 큐브 page 하나만 바뀌어도 단위 시험
// 전부를 돌렸다, 2026-11-10). 불러오지 않는 glob(eager 없이)이나 `Object.keys(import.meta.glob(…))`처럼 바로 키만
// 쓰는 꼴은 vite가 import를 빼 버려 그래프에 잡히지 않는다. 그래서 결과를 상수에 담은 뒤 키를 읽는다.
// 키는 "../../app/cube/solo/page.tsx" 꼴
const PAGE_SOURCES = import.meta.glob<string>("../../app/cube/**/page.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});
const PAGES = new Set(
  Object.keys(PAGE_SOURCES).map((k) =>
    k.replace(/^\.\.\/\.\.\/app/, "").replace(/\/page\.tsx$/, ""),
  ),
);

describe("기능 지도", () => {
  const items = FEATURE_MAP.flatMap((s) => s.items);

  it("주소마다 page가 있다", () => {
    for (const { href } of items) {
      const path = href.split("?")[0] as string;
      expect(PAGES.has(path), href).toBe(true);
    }
  });

  it("같은 주소를 두 번 적지 않는다", () => {
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("미니 모드·개발용 화면은 넣지 않는다", () => {
    for (const { href } of items)
      expect(href).not.toMatch(/^\/cube\/(mini|lab|tiers\/emblems)/);
  });
});
