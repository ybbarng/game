import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { FEATURE_MAP } from "./feature-map";

const APP = fileURLToPath(new URL("../../app", import.meta.url));

describe("기능 지도", () => {
  const items = FEATURE_MAP.flatMap((s) => s.items);

  it("주소마다 page가 있다", () => {
    for (const { href } of items) {
      const path = href.split("?")[0] as string;
      expect(existsSync(`${APP}${path}/page.tsx`), href).toBe(true);
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
