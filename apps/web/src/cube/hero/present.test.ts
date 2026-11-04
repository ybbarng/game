import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { randomScramble } from "./loop";
import { findHeroMethod } from "./methods";
import {
  insertKind,
  type PresentOutput,
  presentSolve,
  slotTurn,
} from "./present";

/**
 * 보여 주기 변환: 해법이 낸 수와 끝 상태가 같고(방향까지), 첫 층을 위에서 보이다 끝나면 아래로 보내고,
 * 넣는 차례마다 채운 칸이 앞-오른쪽이다. 섞기는 정해진 rng로 결정적이다.
 */

function seq(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const play = (n: number, s: PuzzleState, moves: readonly string[]) =>
  applyMoves(n, s, parseMoves(n, moves.join(" ")));

const sameState = (a: PuzzleState, b: PuzzleState) =>
  a.perm.every((v, i) => v === b.perm[i]);

function scrambled(n: number, seed: number): PuzzleState {
  const len = n === 2 ? 11 : n === 3 ? 20 : 30;
  return play(n, solvedCube(n), randomScramble(seq(seed), len, n));
}

interface Case {
  id: string;
  seeds: number[];
}

const CASES: Case[] = [
  { id: "2-beginner", seeds: [1, 2, 3, 4] },
  { id: "2-algs", seeds: [1, 2, 3] },
  { id: "3-beginner", seeds: [1, 2, 3, 4, 5, 6] },
  { id: "3-cfop", seeds: [1, 2, 3, 4, 5, 6] },
  { id: "3-roux", seeds: [1, 2] },
  { id: "3-zz", seeds: [1, 2] },
  { id: "4-beginner", seeds: [7] },
  { id: "4-cfop", seeds: [7] },
];

async function run(id: string, seed: number) {
  const def = findHeroMethod(id);
  if (!def) throw new Error(id);
  const n = def.size;
  const start = scrambled(n, seed);
  const raw = await def.solve(start);
  const shown = presentSolve(n, start, raw, def.view);
  return { n, start, raw, shown, view: def.view };
}

/** 단계마다 [수 번호 → 그 수 앞 상태]를 차례로 */
function statesAt(n: number, start: PuzzleState, moves: readonly string[]) {
  const out = [start];
  let s = start;
  for (const m of moves) {
    s = play(n, s, [m]);
    out.push(s);
  }
  return out;
}

const centerColor = (n: number, s: PuzzleState, face: number) => {
  const c = Math.floor(n / 2);
  return faceColors(n, s)[face * n * n + c * n + c];
};
/** 면 위 흰 스티커 수 */
const whites = (n: number, s: PuzzleState, face: number) =>
  Array.from(faceColors(n, s).slice(face * n * n, (face + 1) * n * n)).filter(
    (c) => c === 0,
  ).length;

/** 넣는 차례 경계: 단계 시작과 단계 안 살피기 자리 */
function segments(shown: PresentOutput, name: string): [number, number][] {
  const st = shown.stages.find((s) => s.name === name);
  if (!st || st.end <= st.start) return [];
  const cuts = [
    st.start,
    ...shown.looks.filter((l) => l > st.start && l < st.end),
    st.end,
  ];
  return cuts.slice(0, -1).map((c, i) => [c, cuts[i + 1] as number]);
}

describe("보여 주기 변환", () => {
  for (const c of CASES) {
    it(`${c.id}: 끝 상태가 해법과 같고(방향까지) 단계 차례가 그대로다`, async () => {
      for (const seed of c.seeds) {
        const { n, start, raw, shown } = await run(c.id, seed);
        expect(
          sameState(play(n, start, shown.moves), play(n, start, raw.moves)),
        ).toBe(true);
        expect(shown.stages.map((s) => s.name)).toEqual(
          raw.stages.map((s) => s.name),
        );
        let at = 0;
        for (const st of shown.stages) {
          expect(st.start).toBe(at);
          at = st.end;
        }
        expect(at).toBe(shown.moves.length);
      }
    });
  }

  for (const id of [
    "3-beginner",
    "3-cfop",
    "2-beginner",
    "4-beginner",
    "4-cfop",
  ]) {
    it(`${id}: 위 단계 동안 첫 층 면이 위에 있고, 끝나면 z2로 아래로 간다`, async () => {
      const seeds = CASES.find((c) => c.id === id)?.seeds ?? [];
      for (const seed of seeds) {
        const { n, start, shown, view } = await run(id, seed);
        const up = shown.stages.filter((s) => view.up?.includes(s.name));
        const first = up[0];
        const last = up.at(-1);
        if (!first || !last) throw new Error("위 단계가 없다");
        const states = statesAt(n, start, shown.moves);
        // 들어 올린 뒤(첫 돌리기 뒤)부터 내리기 전까지 흰 가운데(2×2는 흰 꼭짓점 층)가 위
        let i = first.start;
        while (/^[xyz]/.test(shown.moves[i] ?? "")) i++;
        expect(shown.moves[last.end - 1]).toBe("z2");
        for (let k = i; k < last.end; k++) {
          const s = states[k] as PuzzleState;
          if (n >= 3) expect(centerColor(n, s, 0)).toBe(0);
        }
        const beforeFlip = states[last.end - 1] as PuzzleState;
        const afterFlip = states[last.end] as PuzzleState;
        expect(whites(n, beforeFlip, 0)).toBeGreaterThanOrEqual(
          n === 2 ? 4 : n * n - 4,
        );
        expect(whites(n, afterFlip, 3)).toBe(whites(n, beforeFlip, 0));
      }
    });
  }

  for (const c of CASES.filter((c) => !/roux|zz/.test(c.id))) {
    it(`${c.id}: 넣는 차례마다 채운 칸이 앞-오른쪽이다`, async () => {
      for (const seed of c.seeds) {
        const { n, start, shown, view } = await run(c.id, seed);
        const states = statesAt(n, start, shown.moves);
        let checked = 0;
        for (const st of shown.stages) {
          const kind = insertKind(st.name);
          if (!kind) continue;
          const slot =
            kind === "corner" && view.up?.includes(st.name)
              ? "top-corner"
              : kind;
          for (const [from, to] of segments(shown, st.name)) {
            // 차례 앞의 돌려 쥐기는 빼고 본다(돌려 쥔 뒤 칸이 앞-오른쪽이어야 한다)
            let a = from;
            while (a < to && /^[xyz]/.test(shown.moves[a] ?? "")) a++;
            const k = slotTurn(
              n,
              states[a] as PuzzleState,
              states[to] as PuzzleState,
              slot,
            );
            expect(
              k,
              `${c.id} ${seed} ${st.name} ${shown.moves.slice(from, to).join(" ")}`,
            ).toBe(0);
            checked++;
          }
        }
        expect(checked).toBeGreaterThan(0);
      }
    });
  }

  it("3×3 프리드리히: F2L 짝마다 끝에 앞-오른쪽 칸(DFR·FR)이 맞고, 마지막 층은 해법 수 그대로다", async () => {
    // Kociemba 스티커 번호: DFR = D29 F26 R15, FR = F23 R12, 가운데 = 면×9+4
    const pair = [29, 26, 15, 23, 12];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { start, raw, shown } = await run("3-cfop", seed);
      const states = statesAt(3, start, shown.moves);
      for (const name of ["f2l-1", "f2l-2", "f2l-3", "f2l-4"]) {
        const st = shown.stages.find((s) => s.name === name);
        if (!st || st.end === st.start) continue;
        // 마지막 짝은 끝에 원래 방향으로 돌아오므로 그 돌리기 앞에서 본다
        let end = st.end;
        while (/^[xyz]/.test(shown.moves[end - 1] ?? "")) end--;
        const colors = faceColors(3, states[end] as PuzzleState);
        for (const i of pair)
          expect(colors[i]).toBe(colors[Math.floor(i / 9) * 9 + 4]);
      }
      for (const name of ["oll", "pll"]) {
        const a = raw.stages.find((s) => s.name === name);
        const b = shown.stages.find((s) => s.name === name);
        if (!a || !b) throw new Error(name);
        expect(shown.moves.slice(b.start, b.end)).toEqual(
          raw.moves.slice(a.start, a.end),
        );
      }
    }
  });

  it("넣는 차례 안에는 연출이 둔 y 말고 큐브 돌리기가 없다(해법의 y는 켤레로 녹인다)", async () => {
    for (const seed of [1, 2, 3]) {
      const { shown } = await run("3-cfop", seed);
      for (const name of ["f2l-1", "f2l-2", "f2l-3", "f2l-4"]) {
        for (const [from, to] of segments(shown, name)) {
          const seg = shown.moves.slice(from, to);
          // 마지막 짝 끝의 되돌리기(원래 방향으로)는 빼고 센다
          while (/^[xyz]/.test(seg.at(-1) ?? "")) seg.pop();
          const rest = seg.filter((m) => /^[xyz]/.test(m));
          expect(rest.every((m) => /^y/.test(m))).toBe(true);
          expect(rest.length).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
