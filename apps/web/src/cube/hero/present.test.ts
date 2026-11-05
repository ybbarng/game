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

/** 앞 위 엣지(십자) · 앞-오른쪽 위 코너(첫 층) · 앞-오른쪽 칸(둘째 층) · 앞-오른쪽 짝(F2L) 스티커 자리 */
const FRONT_SLOTS = [
  [7, 19],
  [8, 20, 9],
  [23, 12],
  [29, 26, 15, 23, 12],
];

describe("조각 찾기와 강조 사건(3×3 초보자·프리드리히)", () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  /** 이미 맞은 조각이 있는 섞기를 더 본다(결정적) */
  const CHECK_SEEDS = [9, 10, 11, 12];
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
          // 조각 찾기만 본다(마지막 층의 모양 강조는 찾지 않는다)
          if (mark.kind !== "found" || mark.solo) continue;
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

    it(`${id}: 넣기 전(넣을 곳·찾은 조각)과 넣은 뒤(맞춘 조각)에만 조각 사건이 있고, 다 맞춘다`, async () => {
      for (const seed of SEEDS) {
        const { start, shown } = await run(id, seed);
        const states = statesAt(3, start, shown.moves);
        // 조각 넣기 사건(따로 빛내는 확인·마지막 층 사건은 아래 시험이 본다)
        const ll = shown.stages.find((s) =>
          ["eo", "oll"].includes(s.name),
        ) as PresentOutput["stages"][number];
        const before = shown.marks.filter(
          (m) => !m.mark.solo && m.at <= ll.start,
        );
        const kinds = before.map((m) => m.mark.kind);
        // 묶음마다 넣을 곳 → 찾은 조각 → 맞춘 조각(마지막 층 앞 단계의 끝 강조는 그 뒤)
        const tail = kinds.length % 3;
        expect(tail).toBeLessThanOrEqual(1);
        expect(kinds.length).toBeGreaterThan(0);
        for (let i = 0; i + 2 < kinds.length; i += 3) {
          expect(kinds.slice(i, i + 3)).toEqual(["slot", "found", "placed"]);
          const found = before[i + 1] as (typeof shown.marks)[number];
          const placed = before[i + 2] as (typeof shown.marks)[number];
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
        const end = states.at(-1) as PuzzleState;
        expect(placedOk(end, [...end.perm])).toBe(true);
      }
    });

    it(`${id}: 이미 맞은 조각은 그 칸을 앞(-오른쪽)으로 돌려 한 번씩 확인하고, 그 사이에 층 돌리기가 없다`, async () => {
      let checks = 0;
      for (const seed of [...SEEDS, ...CHECK_SEEDS]) {
        const { start, shown } = await run(id, seed);
        const states = statesAt(3, start, shown.moves);
        const ll = shown.stages.find((s) =>
          ["eo", "oll"].includes(s.name),
        ) as PresentOutput["stages"][number];
        // 묶음마다 맞춘 조각 강조가 꼭 한 번(넣었거나 확인했거나)
        const seen = new Map<string, number>();
        let prevAt = 0;
        for (const { at, mark } of shown.marks) {
          if (at > ll.start) continue;
          if (mark.kind === "placed" && !(mark.solo && !mark.check)) {
            const key = [...mark.stickers].sort((x, y) => x - y).join();
            seen.set(key, (seen.get(key) ?? 0) + 1);
          }
          if (mark.check) {
            checks++;
            const st = states[at] as PuzzleState;
            expect(placedOk(st, mark.stickers), `${seed}`).toBe(true);
            // 앞 위 엣지·앞-오른쪽 위 코너·앞-오른쪽 칸·앞-오른쪽 짝 가운데 한 칸에 있다
            const ids = new Set(mark.stickers);
            const inFront = FRONT_SLOTS.some(
              (slot) =>
                slot.length === ids.size &&
                slot.every((p) => ids.has(st.perm[p] as number)),
            );
            expect(inFront, `${seed} 확인 칸 @${at}`).toBe(true);
            // 앞 사건 뒤부터 이 확인까지 큐브 돌리기뿐
            for (let j = prevAt; j < at; j++)
              expect(shown.moves[j], `${seed} @${j}`).toMatch(/^[xyz]['2]?$/);
          }
          prevAt = at;
        }
        for (const [key, count] of seen)
          expect(count, `${seed} ${key}`).toBe(1);
        // 넣은 것과 확인한 것을 합치면 그 단계들의 조각 스티커를 모두 덮는다
        // (초보자: 십자 8 + 코너 12 + 둘째 층 8, 프리드리히: 십자 8 + 짝 넷 20)
        const covered = new Set([...seen.keys()].flatMap((k) => k.split(",")));
        expect(covered.size, `${seed}`).toBe(28);
        const end = states.at(-1) as PuzzleState;
        expect(placedOk(end, [...end.perm])).toBe(true);
      }
      expect(checks).toBeGreaterThan(0);
    });

    it(`${id}: 마지막 층 단계마다 시작에 맞출 칸, 공식 앞에 모양, 공식 뒤에만 맞은 칸, 끝에 전체를 빛낸다`, async () => {
      for (const seed of SEEDS.slice(0, 4)) {
        const { shown } = await run(id, seed);
        const names =
          id === "3-beginner"
            ? ["eo", "ll-edges", "ll-corner-place", "ll-corner-twist"]
            : ["oll", "pll"];
        for (const name of names) {
          const st = shown.stages.find((s) => s.name === name);
          if (!st || st.end <= st.start) continue;
          const cuts = new Set([
            st.start,
            ...segments(shown, name).map(([a]) => a),
            st.end,
          ]);
          const own = shown.marks.filter(
            (m) =>
              m.mark.solo &&
              !m.mark.check &&
              m.at >= st.start &&
              m.at <= st.end,
          );
          // 시작 강조(넣을 곳)는 단계 첫머리에 한 번
          const slots = own.filter(
            (m) => m.mark.kind === "slot" && m.at === st.start,
          );
          expect(slots.length, `${seed} ${name}`).toBe(1);
          // 모양 강조는 토막 첫머리에만, 토막마다 많아야 한 번
          const founds = own.filter(
            (m) => m.mark.kind === "found" && m.at < st.end,
          );
          // 윗면만 돌려 끝나는 단계(공식 없음)는 모양·새로 맞은 칸 강조가 없다
          const formula = shown.moves
            .slice(st.start, st.end)
            .some((m) => !/^(U['2]?|[xyz]['2]?)$/.test(m));
          expect(founds.length > 0, `${seed} ${name}`).toBe(formula);
          for (const f of founds) expect(cuts.has(f.at)).toBe(true);
          expect(new Set(founds.map((f) => f.at)).size).toBe(founds.length);
          // 수를 두는 동안(토막 안)에는 강조가 없다
          for (const m of shown.marks)
            if (m.at > st.start && m.at < st.end)
              expect(cuts.has(m.at), `${seed} ${name} @${m.at}`).toBe(true);
          // 새로 맞은 칸 강조는 공식 뒤(토막 끝)에 나온다(단계 첫머리의 것은 앞 단계 것)
          const fresh = shown.marks.filter(
            (m) =>
              !m.mark.solo &&
              m.mark.kind === "placed" &&
              m.at > st.start &&
              m.at <= st.end,
          );
          if (formula)
            expect(fresh.length, `${seed} ${name}`).toBeGreaterThan(0);
          // 단계 끝에 맞춘 칸 전체
          expect(
            own.some((m) => m.mark.kind === "placed" && m.at === st.end),
            `${seed} ${name} 끝`,
          ).toBe(true);
        }
      }
    });
  }

  it("3×3 초보자: 흰 십자는 화면에서도 F·D와 큐브 돌리기만(앞면으로 올린다), 둘째 층에 왼쪽 면이 없다", async () => {
    for (const seed of SEEDS) {
      const { shown } = await run("3-beginner", seed);
      const cross = shown.stages.find((s) => s.name === "cross");
      const middle = shown.stages.find((s) => s.name === "middle");
      if (!cross || !middle) throw new Error("단계 없음");
      for (const m of shown.moves.slice(cross.start, cross.end))
        expect(m, `${seed} 십자`).toMatch(/^([FD]|[xyz])['2]?$/);
      // 넣을 자리를 앞으로 가져오는 y가 있다
      expect(
        shown.moves
          .slice(cross.start, cross.end)
          .filter(
            (m, i) => /^y/.test(m) && !shown.searches.includes(cross.start + i),
          ).length,
      ).toBeGreaterThan(0);
      for (const m of shown.moves.slice(middle.start, middle.end))
        expect(m, `${seed} 둘째 층`).not.toMatch(/^[LBD]/);
    }
  });

  it("찾기를 켜지 않은 해법(루·ZZ·2×2·4×4)은 찾는 돌리기와 사건이 없다", async () => {
    for (const id of ["3-roux", "3-zz", "2-beginner", "4-cfop"]) {
      const seed = CASES.find((c) => c.id === id)?.seeds[0] ?? 1;
      const { shown } = await run(id, seed);
      expect(shown.searches).toEqual([]);
      expect(shown.marks).toEqual([]);
    }
  });
});

describe("조각마다 큐브 돌리기 → 반대 면 → 공식(2026-11-05 사용자 「먼저 큐브 전체를 돌려서 맞출 공간을 정면에 둔 후에 면을 돌려서 대상 조각을 앞으로 가져와서 넣어줘」)", () => {
  const isRot = (m: string) => /^[xyz]/.test(m);

  it("3×3 초보자 섞기 200개: 화면에서 큐브 돌리기는 조각 맨 앞(살피는 자리·강조 뒤)에만 오고, 반대 면 다음에는 오지 않는다", async () => {
    let gaps = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { shown } = await run("3-beginner", seed);
      const cuts = new Set([
        ...shown.looks,
        ...shown.marks.map((m) => m.at),
        ...shown.stages.map((s) => s.start),
      ]);
      for (const name of ["cross", "corners", "middle"]) {
        const st = shown.stages.find((s) => s.name === name);
        if (!st) continue;
        for (let i = st.start + 1; i < st.end; i++) {
          const prev = shown.moves[i - 1] as string;
          const cur = shown.moves[i] as string;
          if (cuts.has(i) || !isRot(cur) || isRot(prev)) continue;
          const at = `${seed} ${name}: ${shown.moves.slice(Math.max(st.start, i - 4), i + 2).join(" ")}`;
          // 십자만 빼기 토막 뒤 넣기 토막이 이어진다(공식이 F로 끝난 뒤)
          expect(name, at).toBe("cross");
          expect(prev, at).toMatch(/^F/);
        }
      }
      for (const g of shown.gaps) {
        // 쉬는 자리는 반대 면(D)으로 칸 밑에 둔 바로 뒤, 공식(F·R)의 첫 수 앞
        const st = shown.stages.find((s) => s.start <= g && g < s.end);
        expect(["cross", "corners"]).toContain(st?.name);
        expect(shown.moves[g - 1]).toMatch(/^D/);
        expect(shown.moves[g]).toMatch(/^[FR]/);
        gaps++;
      }
    }
    expect(gaps).toBeGreaterThan(200);
  });
});
