import { writeFileSync } from "node:fs";
import { boardOfSky } from "@game/galaxy-engine";
import { describe, expect, it } from "vitest";

import { layoutMarkdown, runLayoutBench } from "./bench";
import { LAYOUT_NAMES, type LayoutKind, layoutBoard } from "./layouts";

/**
 * 판 배치 견주기 bench(docs/48 15-3). `pnpm --filter @game/galaxy-ai bench src/layouts.strength.ts`.
 * 판 수는 `GALAXY_LAYOUT_GAMES`(기본 판, 짧은 판은 같은 수)로 바꾼다. 기본 400판
 */
describe("은하 한 바퀴 판 배치 견주기", () => {
  it("지금 배치·완전히 섞기·반쯤 섞기를 같은 시드로 둔다", () => {
    const n = Number(process.env.GALAXY_LAYOUT_GAMES ?? "") || 400;
    const board = boardOfSky("seasons");
    const kinds: LayoutKind[] = ["grouped", "spread", "split"];
    const started = performance.now();
    const rows = runLayoutBench(
      kinds.map((k) => ({
        name: LAYOUT_NAMES[k],
        board: layoutBoard(board, k),
      })),
      { standard: n, short: n },
    );
    const markdown = `# 판 배치 견주기(사계절 하늘, 4인 중수 ×4, 판 수 ${n}, ${((performance.now() - started) / 1000).toFixed(0)}초)\n\n${layoutMarkdown(rows)}`;
    console.log(markdown);
    writeFileSync(new URL("../layout-result.md", import.meta.url), markdown);
    expect(rows).toHaveLength(6);
  });
});
