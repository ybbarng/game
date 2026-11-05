// 「완성까지 k수」가 정말 가장 짧은 수인지 따로 구한 정답과 견준다(game-85 리뷰).
// `distanceToSolved`(3×3)는 「2단계 해법 상한을 0부터 올려 처음 찾은 길이」라 2단계 해법이 상한 안의 해를
// 빠짐없이 찾는다는 가정에 기댄다. 정답은 해법기를 쓰지 않고 엔진의 스티커 수만으로 가운데서 만나기로
// 구한다: 맞춘 쪽에서 4수 안쪽을 모두 적어 두고, 섞은 쪽에서 2수 안쪽을 훑는다. 6수 안쪽의 길은 섞은
// 쪽에서 2수 지난 상태(또는 그 앞)를 반드시 지나므로 이것으로 정확하다.
import {
  applyMove,
  type CubeMove,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { createRng, nextInt } from "@game/mighty-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { distanceToSolved } from "./distance";

/** 맞춘 쪽·섞은 쪽에서 훑는 깊이(합이 다룰 수 있는 가장 먼 거리) */
const TARGET_DEPTH = 4;
const SCRAMBLE_DEPTH = 2;
const MAX_EXACT = TARGET_DEPTH + SCRAMBLE_DEPTH;

/** 상태 열쇠: 스티커 순열(조각마다 스티커가 달라 같은 순열이면 같은 상태) */
const keyOf = (s: PuzzleState): string =>
  String.fromCharCode.apply(null, Array.from(s.perm));

const movesOf = (n: number, faces: string): CubeMove[] =>
  [...faces].flatMap((f) => parseMoves(n, `${f} ${f}2 ${f}'`));

/** 시작 상태들에서 `depth`수 안쪽으로 닿는 상태(열쇠) → 가장 짧은 수(너비 우선) */
function ball(
  n: number,
  starts: readonly PuzzleState[],
  moves: readonly CubeMove[],
  depth: number,
): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier: PuzzleState[] = [];
  for (const s of starts) {
    const k = keyOf(s);
    if (!dist.has(k)) {
      dist.set(k, 0);
      frontier.push(s);
    }
  }
  for (let d = 1; d <= depth; d++) {
    const next: PuzzleState[] = [];
    for (const s of frontier) {
      for (const m of moves) {
        const t = applyMove(n, s, m);
        const k = keyOf(t);
        if (dist.has(k)) continue;
        dist.set(k, d);
        next.push(t);
      }
    }
    frontier = next;
  }
  return dist;
}

/** 가운데서 만나기로 구한 가장 짧은 수(`MAX_EXACT`수보다 멀면 null) */
function exactDistance(
  n: number,
  target: Map<string, number>,
  moves: readonly CubeMove[],
  state: PuzzleState,
): number | null {
  let best: number | null = null;
  for (const [k, d] of ball(n, [state], moves, SCRAMBLE_DEPTH)) {
    const rest = target.get(k);
    if (rest === undefined) continue;
    if (best === null || d + rest < best) best = d + rest;
  }
  return best;
}

interface Scramble {
  alg: string;
  length: number;
  state: PuzzleState;
}

/**
 * 섞기마다 정답과 `distanceToSolved`를 견준다. 정답이 섞기 길이보다 길면 정답 쪽이 틀린 것이다.
 * 상쇄로 섞기보다 짧아진 경우가 실제로 들었는지도 센다(그런 경우를 훑지 않는 시험이 되지 않게).
 */
function compare(
  n: number,
  target: Map<string, number>,
  moves: readonly CubeMove[],
  list: readonly Scramble[],
): { wrong: string[]; shorter: number } {
  const wrong: string[] = [];
  let shorter = 0;
  for (const { alg, length, state } of list) {
    const want = exactDistance(n, target, moves, state);
    if (want === null || want > length) {
      wrong.push(`${alg}: 정답 ${want}이 섞기보다 길다`);
      continue;
    }
    if (want < length) shorter++;
    const got = distanceToSolved(n, state, 8);
    if (got !== want) wrong.push(`${alg}: ${got} ≠ ${want}`);
  }
  return { wrong, shorter };
}

/** 씨앗을 고정한 무작위 섞기: 1~6수마다 `perLength`개(18수에서 고름, 같은 면 이어 두기·상쇄도 그대로 둔다) */
function scrambles(n: number, seed: number, perLength: number): Scramble[] {
  const all = movesOf(n, "URFDLB");
  const names = ["U", "R", "F", "D", "L", "B"].flatMap((f) => [
    f,
    `${f}2`,
    `${f}'`,
  ]);
  const rng = createRng(seed);
  const out: Scramble[] = [];
  for (let len = 1; len <= MAX_EXACT; len++) {
    for (let i = 0; i < perLength; i++) {
      let state = solvedCube(n);
      const alg: string[] = [];
      for (let j = 0; j < len; j++) {
        const k = nextInt(rng, all.length);
        state = applyMove(n, state, all[k] as CubeMove);
        alg.push(names[k] as string);
      }
      out.push({ alg: alg.join(" "), length: len, state });
    }
  }
  return out;
}

describe("완성까지 거리 = 따로 구한 가장 짧은 수", () => {
  it("3×3: 1~6수 섞기 300개", () => {
    const moves = movesOf(3, "URFDLB");
    const target = ball(3, [solvedCube(3)], moves, TARGET_DEPTH);
    const { wrong, shorter } = compare(
      3,
      target,
      moves,
      scrambles(3, 85_333, 50),
    );
    expect(wrong).toEqual([]);
    expect(shorter).toBeGreaterThan(10);
  });

  it("2×2: 1~6수 섞기 300개(어느 방향으로 맞아도 맞춘 것)", () => {
    // 2×2는 L = R x′처럼 반대 면 수가 큐브 통째 돌리기만큼만 다르다. 그래서 U·R·F 9수만으로 길을 찾고,
    // 맞춘 상태 24방향 모두를 목표로 둔다.
    const moves = movesOf(2, "URF");
    const turns = parseMoves(2, "x y z");
    const solved: PuzzleState[] = [];
    const seen = new Set<string>();
    let frontier = [solvedCube(2)];
    while (frontier.length > 0) {
      const next: PuzzleState[] = [];
      for (const s of frontier) {
        const k = keyOf(s);
        if (seen.has(k)) continue;
        seen.add(k);
        solved.push(s);
        for (const t of turns) next.push(applyMove(2, s, t));
      }
      frontier = next;
    }
    expect(solved).toHaveLength(24);
    const target = ball(2, solved, moves, TARGET_DEPTH);
    const { wrong, shorter } = compare(
      2,
      target,
      moves,
      scrambles(2, 85_222, 50),
    );
    expect(wrong).toEqual([]);
    expect(shorter).toBeGreaterThan(10);
  });
});
