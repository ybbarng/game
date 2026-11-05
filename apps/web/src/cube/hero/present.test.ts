import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { orientForSolve, randomScramble } from "./loop";
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

/** 연출처럼 섞고(큐브 돌리기·가운데 층 포함) 풀기 전 방향을 맞춘 상태(`HeroLoop`이 해법에 넘기는 것) */
function scrambled(n: number, seed: number): PuzzleState {
  const len = n === 2 ? 11 : n === 3 ? 20 : 30;
  const s = play(n, solvedCube(n), randomScramble(seq(seed), len, n));
  const o = orientForSolve(n, s);
  return o.length ? play(n, s, o) : s;
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
        // 들어 올린 뒤(첫 돌리기 뒤)부터 내리기 전까지 흰 센터(2×2는 흰 코너 층)가 위
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
    // Kociemba 스티커 번호: DFR = D29 F26 R15, FR = F23 R12, 센터 = 면×9+4
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

  it("초보자 마지막 층(노란 십자~코너 방향)은 해법 수 그대로, 코너 방향에는 큐브 돌리기가 없다", async () => {
    const LL = ["eo", "ll-edges", "ll-corner-place", "ll-corner-twist"];
    for (const [id, seeds] of [
      ["3-beginner", [1, 2, 3, 4]],
      ["2-beginner", [1, 2, 3]],
    ] as const) {
      for (const seed of seeds) {
        const { raw, shown } = await run(id, seed);
        for (const name of LL) {
          const a = raw.stages.find((s) => s.name === name);
          const b = shown.stages.find((s) => s.name === name);
          if (id === "2-beginner" && (name === "eo" || name === "ll-edges"))
            continue;
          if (!a || !b) throw new Error(`${id} ${name}`);
          expect(shown.moves.slice(b.start, b.end)).toEqual(
            raw.moves.slice(a.start, a.end),
          );
          if (name === "ll-corner-twist")
            expect(
              shown.moves.slice(b.start, b.end).some((m) => /^[xyz]/.test(m)),
            ).toBe(false);
        }
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
          // 조각을 찾는 돌리기도 빼고 센다(아래 시험이 따로 본다)
          const rest = seg.filter(
            (m, k) => /^[xyz]/.test(m) && !shown.searches.includes(from + k),
          );
          expect(rest.every((m) => /^y/.test(m))).toBe(true);
          expect(rest.length).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

/** 스티커 정체 가운데 하나라도 위·앞·오른쪽(U·R·F) 면에 있나 */
const anyVisible = (s: PuzzleState, ids: readonly number[]) =>
  ids.some((id) => Math.floor(s.perm.indexOf(id) / 9) <= 2);

/** 스티커(정체)가 모두 센터 색과 같은 면에 있나 */
const placedOk = (s: PuzzleState, ids: readonly number[]) => {
  const colors = faceColors(3, s);
  return ids.every((id) => {
    const at = s.perm.indexOf(id);
    return colors[at] === colors[Math.floor(at / 9) * 9 + 4];
  });
};

describe("조각 찾기와 강조 사건(3×3 초보자·프리드리히)", () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const id of ["3-beginner", "3-cfop"]) {
    it(`${id}: 섞기가 같으면 찾는 돌리기가 늘 같다`, async () => {
      for (const seed of SEEDS.slice(0, 4)) {
        const a = await run(id, seed);
        const b = await run(id, seed);
        expect(b.shown.moves).toEqual(a.shown.moves);
        expect(b.shown.searches).toEqual(a.shown.searches);
        expect(b.shown.marks).toEqual(a.shown.marks);
      }
    });

    it(`${id}: 찾는 동안 조각이 보이기 전에는 멈추지 않고, 처음 보이는 걸음에서 멈춘다`, async () => {
      let searched = 0;
      for (const seed of SEEDS) {
        const { start, shown } = await run(id, seed);
        const states = statesAt(3, start, shown.moves);
        const searches = new Set(shown.searches);
        for (const s of shown.searches)
          expect(shown.moves[s]).toMatch(/^[xyz]['2]?$/);
        for (const { at, mark } of shown.marks) {
          if (mark.kind !== "found") continue;
          // 바로 앞에 이어진 찾는 돌리기들
          let from = at;
          while (searches.has(from - 1)) from--;
          for (let j = from; j < at; j++)
            expect(
              anyVisible(states[j] as PuzzleState, mark.stickers),
              `${id} ${seed} 찾는 ${j - from + 1}번째 앞`,
            ).toBe(false);
          expect(anyVisible(states[at] as PuzzleState, mark.stickers)).toBe(
            true,
          );
          if (at > from) {
            searched++;
            // 찾은 뒤에는 둘러보기 전 방향으로 되돌린 다음에 넣을 칸을 돌린다
            let back = at;
            while (searches.has(back)) back++;
            expect(back).toBeGreaterThan(at);
            expect(
              sameState(
                states[back] as PuzzleState,
                states[from] as PuzzleState,
              ),
              `${id} ${seed} 되돌리기`,
            ).toBe(true);
            // 둘러보기·되돌리기 사이에 넣는 수가 없다
            for (let j = from; j < back; j++)
              expect(shown.moves[j]).toMatch(/^[xyz]/);
          }
        }
      }
      expect(searched).toBeGreaterThan(0);
    });

    it(`${id}: 넣기 전(넣을 곳·찾은 조각)과 넣은 뒤(맞춘 조각)에만 사건이 있고, 다 맞춘다`, async () => {
      for (const seed of SEEDS) {
        const { start, shown } = await run(id, seed);
        const states = statesAt(3, start, shown.moves);
        const kinds = shown.marks.map((m) => m.mark.kind);
        // 묶음마다 넣을 곳 → 찾은 조각 → 맞춘 조각
        expect(kinds.length % 3).toBe(0);
        expect(kinds.length).toBeGreaterThan(0);
        for (let i = 0; i < kinds.length; i += 3) {
          expect(kinds.slice(i, i + 3)).toEqual(["slot", "found", "placed"]);
          const found = shown.marks[i + 1] as (typeof shown.marks)[number];
          const placed = shown.marks[i + 2] as (typeof shown.marks)[number];
          // 넣는 수가 하나 이상 있고, 그 사이에는 사건이 없다(차례가 slot·found·placed로 이어진다)
          expect(placed.at).toBeGreaterThan(found.at);
          expect(placed.mark.stickers).toEqual(found.mark.stickers);
          expect(
            placedOk(states[placed.at] as PuzzleState, placed.mark.stickers),
          ).toBe(true);
          expect(
            placedOk(states[found.at] as PuzzleState, found.mark.stickers),
          ).toBe(false);
        }
        // 사건은 마지막 층 앞에서 끝난다
        const ll = shown.stages.find((s) =>
          ["eo", "oll"].includes(s.name),
        ) as PresentOutput["stages"][number];
        for (const m of shown.marks) expect(m.at).toBeLessThanOrEqual(ll.start);
        const end = states.at(-1) as PuzzleState;
        expect(placedOk(end, [...end.perm])).toBe(true);
      }
    });
  }

  it("찾기를 켜지 않은 해법(루·ZZ·2×2·4×4)은 찾는 돌리기와 사건이 없다", async () => {
    for (const id of ["3-roux", "3-zz", "2-beginner", "4-cfop"]) {
      const seed = CASES.find((c) => c.id === id)?.seeds[0] ?? 1;
      const { shown } = await run(id, seed);
      expect(shown.searches).toEqual([]);
      expect(shown.marks).toEqual([]);
    }
  });
});
