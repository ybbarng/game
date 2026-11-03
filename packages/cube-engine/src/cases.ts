import { nextInt, type RngState } from "@game/mighty-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { applyMoves, type CubeMove, invertMoves } from "./move";
import { parseMoves } from "./notation";
import { createRngFromSeed, type Seed } from "./random";
import { solvedCube } from "./state";

export interface CaseOptions {
  /**
   * 먼저 큐브를 쥐는 방향(표기). 기본 "z2": 흰 면 아래·노란 면 위·초록 앞.
   * 공식 표기는 이렇게 쥔 큐브를 기준으로 읽는다.
   */
  hold?: string;
  /** 공식 앞뒤로 무작위 윗면 돌리기(AUF)를 붙인다. 기본 true */
  auf?: boolean;
}

export interface CaseSetup {
  /** 만들어진 상황 */
  readonly state: PuzzleState;
  /** 맞춘 큐브에서 이 상황을 만드는 수열(쥐기 포함) */
  readonly setup: readonly CubeMove[];
}

/**
 * 공식으로 상황 만들기(docs/47 2-3): 맞춘 큐브를 쥐고 → 무작위 U → 공식의 거꾸로 → 무작위 U.
 * 이 상황에서 (U 몇 번) + 공식 + (U 몇 번)을 두면 맞춰진다. 같은 씨앗이면 같은 상황이다.
 */
export function caseFromAlgorithm(
  n: number,
  algorithm: string | readonly CubeMove[],
  seed: Seed,
  opts: CaseOptions = {},
): CaseSetup {
  const rng: RngState = createRngFromSeed(seed);
  const alg =
    typeof algorithm === "string" ? parseMoves(n, algorithm) : algorithm;
  const setup: CubeMove[] = [...parseMoves(n, opts.hold ?? "z2")];
  const auf = () => {
    const turns = nextInt(rng, 4);
    if (turns > 0) {
      setup.push({ axis: "y", from: 1, to: 1, turns: turns as 1 | 2 | 3 });
    }
  };
  const withAuf = opts.auf ?? true;
  if (withAuf) auf();
  setup.push(...invertMoves(alg));
  if (withAuf) auf();
  return { state: applyMoves(n, solvedCube(n), setup), setup };
}
