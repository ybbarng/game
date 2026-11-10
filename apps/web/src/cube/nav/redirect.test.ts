import { describe, expect, it } from "vitest";

import { redirectTarget } from "./redirect";

describe("redirectTarget", () => {
  it("쿼리가 없으면 새 주소 그대로", () => {
    expect(redirectTarget("/cube/methods", "")).toBe("/cube/methods");
  });
  it("옛 쿼리를 붙인다", () => {
    expect(redirectTarget("/cube/patterns?tab=make", "?shape=checker")).toBe(
      "/cube/patterns?shape=checker&tab=make",
    );
  });
  it("같은 이름은 새 주소가 이긴다", () => {
    expect(redirectTarget("/cube/intro?part=keys", "?part=x&a=1")).toBe(
      "/cube/intro?part=keys&a=1",
    );
  });
});
