import { describe, expect, it } from "vitest";

import { freshNonce, NONCE_SPARE_MS } from "./room-client";

describe("관측지 한 번 쓰는 값", () => {
  const held = { nonce: "n1", expiresAt: 1_800_000_120_000 };
  it("기한까지 넉넉하면 미리 받은 값을 쓴다", () => {
    expect(freshNonce(held, held.expiresAt - NONCE_SPARE_MS - 1)).toBe("n1");
  });
  it("기한이 가깝거나 지났으면 새로 받는다(다른 앱에 다녀와 새로 받기가 밀린 휴대폰)", () => {
    expect(freshNonce(held, held.expiresAt - NONCE_SPARE_MS)).toBeNull();
    expect(freshNonce(held, held.expiresAt + 60_000)).toBeNull();
  });
  it("받아 둔 값이 없으면 새로 받는다", () => {
    expect(freshNonce(null, 0)).toBeNull();
  });
});
