import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BENCH_GAMES,
  benchMarkdown,
  runGalaxyBench,
  scaledGames,
} from "./bench";

/**
 * 밸런스 bench(docs/48 3-4). `pnpm --filter @game/galaxy-ai bench`. 이 맥에서 돌리지 않는다(CI 워크플로 galaxy-bench).
 * 판 수는 `BENCH_GAMES` 상수다. 워크플로 입력(판 수)만 `GALAXY_BENCH_GAMES`로 기본 판 수를 바꾼다(나머지는 같은 비율).
 * 기준을 넘는 항목은 표에 「넘음」으로 표시만 하고 시험은 실패시키지 않는다.
 */
describe("은하 한 바퀴 밸런스 bench", () => {
  it("docs/48 3-4 표의 항목을 모두 잰다", () => {
    const override = Number(process.env.GALAXY_BENCH_GAMES ?? "");
    const options =
      Number.isInteger(override) && override > 0
        ? scaledGames(override)
        : { ...BENCH_GAMES };
    const report = runGalaxyBench(options);
    console.table(
      report.rows.map((r) => ({
        잴것: r.item,
        값: r.value,
        기준: r.target,
        판정: r.pass === null ? "—" : r.pass ? "안" : "넘음",
      })),
    );
    const markdown = benchMarkdown(report);
    console.log(markdown);
    writeFileSync(new URL("../bench-result.md", import.meta.url), markdown);
    expect(report.rows.length).toBeGreaterThanOrEqual(9);
  });
});
