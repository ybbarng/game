import { randomCubeState } from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { solveBeginner2 } from "./methods";
import { checkSafe } from "./taught-safe-check";

// ---------- 맞춘 면은 돌리지 않는다(docs/47 0절 2026-11-05) ----------
// 섞기는 파일 셋(`taught-safe-*.test.ts`)으로 나눠 동시에 돈다(파일 하나는 혼자 2초 안쪽이 목표).

describe("맞춘 면은 돌리지 않는다(십자·첫 층 코너·둘째 층)", () => {
  it("섞기 1~100번: 맞춘 면을 돌리는 수가 없고, 넣은 조각은 그대로이며, 조각마다 안전한 층을 거쳐 들어간다", () => {
    checkSafe(1, 100);
  });

  it("2×2 첫 층도 흰 면을 돌리지 않는다", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const solve = solveBeginner2(randomCubeState(2, seed), { taught: true });
      const st = solve.stages.find((x) => x.name === "first-layer");
      const inner = solve.moves.slice((st?.start ?? 0) + 1, (st?.end ?? 0) - 1);
      expect(solve.moves[st?.start ?? 0]).toBe("z2");
      expect(solve.moves[(st?.end ?? 0) - 1]).toBe("z2");
      for (const m of inner) expect(m[0], `${seed} ${m}`).not.toBe("U");
    }
  });
});
