import { describe, it } from "vitest";
import { checkSafe } from "./taught-safe-check";

describe("맞춘 면은 돌리지 않는다(십자·첫 층 코너·둘째 층)", () => {
  it("섞기 101~200번: 맞춘 면을 돌리는 수가 없고, 넣은 조각은 그대로이며, 조각마다 안전한 층을 거쳐 들어간다", () => {
    checkSafe(101, 200);
  });
});
