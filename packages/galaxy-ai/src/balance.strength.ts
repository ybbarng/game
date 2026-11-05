import { writeFileSync } from "node:fs";
import { NUMBERS } from "@game/galaxy-engine";
import { describe, expect, it } from "vitest";

import { balanceMarkdown, runBalanceBench } from "./bench";

/**
 * 규칙 저울질 bench(docs/48 16절). `pnpm --filter @game/galaxy-ai bench src/balance.strength.ts`.
 * 판 수는 `GALAXY_BALANCE_GAMES`(기본 400). 다 사기 대 골라 사기, 돌림마다 평균 별빛, 돈의 흐름,
 * 3-4 기준(운항 중단·자리 순서·완성·막판 바뀜), 세기를 한 번에 잰다
 */
/**
 * 숫자 표를 잠깐 바꿔 견주기(`GALAXY_NUMBERS='{"salary":100,"rent":{"grand":1800}}'`). 이 bench 안에서만 바뀐다.
 * 고를 값을 정한 뒤에는 rules.ts의 표를 고친다
 */
function override(target: Record<string, unknown>, patch: unknown): void {
  if (!patch || typeof patch !== "object") return;
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key];
    if (
      value &&
      typeof value === "object" &&
      current &&
      typeof current === "object"
    )
      override(current as Record<string, unknown>, value);
    else target[key] = value;
  }
}

describe("은하 한 바퀴 규칙 저울질", () => {
  it("전략·돈 곡선·기준을 잰다", () => {
    if (process.env.GALAXY_NUMBERS)
      override(
        NUMBERS as unknown as Record<string, unknown>,
        JSON.parse(process.env.GALAXY_NUMBERS),
      );
    const n = Number(process.env.GALAXY_BALANCE_GAMES ?? "") || 400;
    const report = runBalanceBench(n);
    const markdown = balanceMarkdown(report);
    console.log(markdown);
    writeFileSync(new URL("../balance-result.md", import.meta.url), markdown);
    expect(report.cash.length).toBeGreaterThan(0);
  });
});
