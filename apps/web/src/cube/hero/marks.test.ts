import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import {
  type PieceUnit,
  unitSolved,
  unitStickers,
  unitsForStage,
} from "../piece-marks";
import { orientForSolve, randomScramble } from "./loop";
import { findHeroMethod } from "./methods";
import { presentSolve } from "./present";

/**
 * 강조한 조각과 실제로 넣는 조각이 같다(2026-11-05 사용자 「'강조한' 것들을 맞추려는 의도를 가지고 진행되기를
 * 바래. 표시랑 다르게 동작하지 말고」). 섞기 수백 개에서 조각 단계(십자·첫 층 코너·둘째 층·F2L 짝)를 본다.
 *
 * - 찾은 조각(넣기 전) 뒤 처음 오는 맞춘 조각(넣은 뒤)은 같은 조각이고, 그때 맞아 있다.
 * - 그 사이에 새로 맞은 조각은 강조한 조각뿐이다(초보자). 프리드리히는 짝을 넣다가 다른 짝이 함께 맞을 수 있어,
 *   그런 짝은 다음 조각을 찾기 전에 「함께 맞은 조각」으로 확인한다.
 * - 단계가 맞추는 조각마다 맞춘 조각 강조가 있다(넣었거나 확인했거나). 강조 없이 맞은 조각이 없다.
 *
 * 예전(고치기 전) 초보자 흰 십자는 섞기 300개 가운데 160여 판에서 어긋났다: 앞 엣지의 끝 수(F2)와 다음 엣지의
 * 첫 수(F')가 하나(F)로 합쳐져 앞 엣지를 넣는 수가 다음 엣지 차례 안으로 들어갔고, 엣지 하나를 넣는 수가 다른
 * 흰 엣지를 제자리로 올리기도 했다(`@game/cube-ai` `Solve.lookBarrier`, `cross-front.ts`).
 */

function seq(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const play = (s: PuzzleState, moves: readonly string[]) =>
  applyMoves(3, s, parseMoves(3, moves.join(" ")));

function scrambled(seed: number): PuzzleState {
  const s = play(solvedCube(3), randomScramble(seq(seed), 20, 3));
  const o = orientForSolve(3, s);
  return o.length ? play(s, o) : s;
}

const keyOfIds = (ids: readonly number[]) =>
  [...ids].sort((a, b) => a - b).join();

async function check(id: string, seed: number, strict: boolean) {
  const def = findHeroMethod(id);
  if (!def) throw new Error(id);
  const start = scrambled(seed);
  const raw = await def.solve(start);
  const shown = presentSolve(3, start, raw, def.view);
  const states = [start];
  for (const m of shown.moves)
    states.push(play(states.at(-1) as PuzzleState, [m]));
  const stateAt = (i: number) => states[i] as PuzzleState;
  const where = `${id} ${seed}`;

  // 단계마다 조각과 단계 시작 상태
  const stageOf = new Map<string, { units: PieceUnit[]; start: number }>();
  for (const st of shown.stages) {
    const units = unitsForStage(3, st.name);
    if (!units) continue;
    for (const u of units)
      stageOf.set(keyOfIds(unitStickers(u)), { units, start: st.start });
  }
  const unitByKey = new Map<string, PieceUnit>();
  for (const { units } of stageOf.values())
    for (const u of units) unitByKey.set(keyOfIds(unitStickers(u)), u);

  /** 사건 스티커를 조각들로(조각 스티커를 통째로 덮는 것만, 하나도 없으면 빈 목록) */
  const unitsIn = (ids: readonly number[]): PieceUnit[] => {
    const set = new Set(ids);
    const out = [...unitByKey.values()].filter((u) =>
      unitStickers(u).every((x) => set.has(x)),
    );
    const covered = out.reduce((n, u) => n + unitStickers(u).length, 0);
    return covered === set.size ? out : [];
  };
  const keyOf = (u: PieceUnit) => keyOfIds(unitStickers(u));
  // 마지막 층 앞까지(마지막 층 사건은 다른 시험이 본다)
  const ll = shown.stages.find((s) => ["eo", "oll"].includes(s.name));
  const llStart = ll?.start ?? shown.moves.length;

  /** 강조한 조각과 그 조각의 단계 조각들 */
  let target: { keys: string[]; at: number; units: PieceUnit[] } | null = null;
  /** 넣다가 함께 맞아 확인해야 할 조각 */
  let owed = new Set<string>();
  const marked = new Set<string>();
  for (const { at, mark } of shown.marks) {
    if (at > llStart || (mark.solo && !mark.check)) continue;
    const units = unitsIn(mark.stickers);
    const keys = units.map(keyOf).sort();
    if (mark.kind === "found") {
      expect(
        [...owed],
        `${where} 함께 맞은 조각을 확인하기 전에 다음 조각`,
      ).toEqual([]);
      expect(
        units.length,
        `${where} 찾은 조각이 단계 조각이다 @${at}`,
      ).toBeGreaterThan(0);
      target = {
        keys,
        at,
        units: stageOf.get(keys[0] as string)?.units ?? [],
      };
      continue;
    }
    if (mark.kind !== "placed") continue;
    expect(
      units.length,
      `${where} 맞춘 조각이 단계 조각이다 @${at}`,
    ).toBeGreaterThan(0);
    for (const u of units) {
      expect(
        unitSolved(stateAt(at), u),
        `${where} 맞춘 조각이 맞아 있다 @${at}`,
      ).toBe(true);
      marked.add(keyOf(u));
    }
    if (mark.check) {
      for (const u of units) {
        const stage = stageOf.get(keyOf(u));
        const already = stage ? unitSolved(stateAt(stage.start), u) : false;
        // 초보자는 단계 시작에 이미 맞아 있던 조각만 확인한다(넣다가 함께 맞는 일이 없다)
        if (strict)
          expect(already, `${where} 함께 맞은 조각 확인 @${at}`).toBe(true);
        owed.delete(keyOf(u));
      }
      continue;
    }
    // 넣은 뒤: 찾은 조각과 같은 조각
    expect(keys, `${where} 강조한 조각과 넣은 조각 @${at}`).toEqual(
      target?.keys,
    );
    if (!target) continue;
    const from = target.at;
    const extra = target.units
      .filter(
        (u) => !unitSolved(stateAt(from), u) && unitSolved(stateAt(at), u),
      )
      .map(keyOf)
      .filter((k) => !keys.includes(k));
    if (strict)
      expect(
        extra,
        `${where} 강조하지 않은 조각이 맞았다 @${from}~${at}`,
      ).toEqual([]);
    owed = new Set(extra);
    target = null;
  }
  expect([...owed], `${where} 끝까지 확인하지 않은 조각`).toEqual([]);
  // 단계가 맞추는 조각마다 맞춘 조각 강조가 있다
  for (const key of unitByKey.keys())
    expect(marked.has(key), `${where} 강조 없이 맞은 조각`).toBe(true);
}

describe("강조한 조각 = 실제로 넣는 조각", () => {
  it("3×3 초보자 섞기 200개: 찾은 조각을 넣고, 그동안 다른 조각을 넣지 않고, 강조 없이 맞은 조각이 없다", async () => {
    for (let seed = 1; seed <= 200; seed++)
      await check("3-beginner", seed, true);
  });

  it("3×3 프리드리히 섞기 30개: 찾은 짝을 넣고, 함께 맞은 짝은 다음 짝 앞에 확인한다", async () => {
    for (let seed = 1; seed <= 30; seed++) await check("3-cfop", seed, false);
  });
});
