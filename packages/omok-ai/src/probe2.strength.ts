// 임시 탐색용(커밋하지 않는다). 진 판의 백 수마다, 흑의 위협 몰아붙이기(엔진 vct.ts)를 막는 백 자리를 찾는다.
import {
  CELLS,
  type Cell,
  pointAt,
  pointName,
  type Variant,
  winsByThreats,
} from "@game/omok-engine";
import { it } from "vitest";

import { allowed } from "./common";

declare const process: {
  stderr: { write(text: string): void };
  env: Record<string, string | undefined>;
};
const log = (s: string) => process.stderr.write(`${s}\n`);
const env = process.env;
const MOVES = (env.PROBE_MOVES ?? "").split(" ").filter(Boolean);
const VARIANT = (env.PROBE_VARIANT ?? "standard") as Variant;
const DEPTH = Number(env.PROBE_DEPTH ?? 5);
const UPTO = Number(env.PROBE_UPTO ?? MOVES.length);

function near(b: Cell[]): number[] {
  const out: number[] = [];
  for (let at = 0; at < CELLS; at++) {
    if (b[at] !== 0) continue;
    const x = at % 15;
    const y = (at - x) / 15;
    let ok = false;
    for (let dy = -2; dy <= 2 && !ok; dy++)
      for (let dx = -2; dx <= 2 && !ok; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 14 || ny > 14) continue;
        if (b[ny * 15 + nx] !== 0) ok = true;
      }
    if (ok) out.push(at);
  }
  return out;
}

it("probe2", () => {
  const b: Cell[] = new Array(CELLS).fill(0);
  for (let i = 0; i < Math.min(UPTO, MOVES.length); i++) {
    const at = pointAt(MOVES[i] as string);
    if (i % 2 === 1) {
      // 백 차례: 흑이 위협만으로 DEPTH수 안에 이기지 못하게 하는 백 자리
      const safe: string[] = [];
      let unknown = 0;
      for (const w of near(b)) {
        if (!allowed(b, w, 2, VARIANT)) continue;
        b[w] = 2;
        try {
          if (!winsByThreats(b, 1, VARIANT, DEPTH)) safe.push(pointName(w));
        } catch {
          unknown++;
        } finally {
          b[w] = 0;
        }
      }
      log(
        `${i + 1}수째 백 ${MOVES[i]}: 막는 자리 ${safe.length}곳 ${safe.includes(MOVES[i] as string) ? "(둔 수 포함)" : "(둔 수 아님)"} 모름 ${unknown} — ${safe.join(" ")}`,
      );
    }
    b[at] = i % 2 === 0 ? 1 : 2;
  }
});
