import { writeFileSync } from "node:fs";
import { randomCubeState, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { it } from "vitest";
import { botPlan } from "./plan";
import { scrambledState } from "./scramble-test-util";
import { BOT_LEVEL_LABELS, BOT_LEVELS, BOT_TARGET_MS } from "./skill";

/**
 * 모양 만들기 컴퓨터 bench(docs/47 9-10). 맞춘 큐브에서는 모양 공식만, 섞인 큐브에서는 맞추기 + 공식이라
 * 「섞인 큐브 평균 ≈ 그 단계 맞추기 목표 + 맞춘 큐브 평균」인지 본다. 단위 시험에 넣지 않는다:
 * `pnpm --filter @game/cube-ai bench shape`. 결과는 `bench-shape.md`.
 * 공식은 화면 자료(`apps/web/src/cube/patterns/data.ts`)에서 크기마다 쉬운 것·어려운 것 하나씩 옮겨 왔다
 */

const ALGS: Record<number, { name: string; alg: string }[]> = {
  2: [
    { name: "옆면 두 줄(3수)", alg: "R2 F2 R2" },
    {
      name: "큐브 속 큐브(15수)",
      alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    },
  ],
  3: [
    { name: "체커보드(6수)", alg: "R2 L2 U2 D2 F2 B2" },
    { name: "십자(11수)", alg: "U F B' L2 U2 L2 F' B U2 L2 U" },
    {
      name: "큐브 속 큐브(15수)",
      alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    },
    {
      name: "슈퍼플립(20수)",
      alg: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
    },
  ],
  4: [
    { name: "액자(6수)", alg: "R2 L2 U2 D2 F2 B2" },
    {
      name: "큐브 속 큐브(15수)",
      alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    },
  ],
  5: [
    { name: "체커보드(9수)", alg: "R2 3R2 L2 U2 3U2 D2 F2 3F2 B2" },
    {
      name: "큐브 속 큐브(15수)",
      alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    },
  ],
};

/** 섞인 큐브에서 시작하는 판 수(4×4·5×5는 축소법이 느려 적게) */
const SCRAMBLED: Record<number, number> = { 2: 60, 3: 40, 4: 8, 5: 5 };
/** 맞춘 큐브에서 시작하는 판 수(계획은 씨앗만 다르다) */
const SOLVED = 200;

function start(n: number, seed: number): PuzzleState {
  if (n === 4) return scrambledState("444", seed);
  if (n === 5) return scrambledState("555", seed);
  return randomCubeState(n, seed);
}

const sec = (ms: number) => (ms / 1000).toFixed(1);
const mean = (xs: readonly number[]) =>
  xs.reduce((a, b) => a + b, 0) / xs.length;

it("모양 만들기 컴퓨터 평균 시간", () => {
  const solvedRows = [
    "| 크기 | 모양 | 입문 | 초보 | 중수 | 고수 | 초고수 |",
    "|---|---|---|---|---|---|---|",
  ];
  const mixedRows = [
    "| 크기 | 모양 | 단계 | 맞추기 목표 | 맞춘 큐브에서 | 섞인 큐브에서 | 기대(목표 + 맞춘 큐브) | 차이 |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const n of [2, 3, 4, 5]) {
    const scrambles = Array.from({ length: SCRAMBLED[n] ?? 0 }, (_, i) =>
      start(n, 5000 + i),
    );
    for (const { name, alg } of ALGS[n] ?? []) {
      const fromSolved: Record<string, number> = {};
      for (const level of BOT_LEVELS) {
        const times = Array.from(
          { length: SOLVED },
          (_, i) =>
            botPlan({ kind: "level", level }, n, solvedCube(n), i, {
              shape: alg,
            }).finishAt,
        );
        fromSolved[level] = mean(times);
      }
      solvedRows.push(
        `| ${n}×${n} | ${name} | ${BOT_LEVELS.map((l) => sec(fromSolved[l] as number)).join(" | ")} |`,
      );
      for (const level of BOT_LEVELS) {
        const times = scrambles.map(
          (s, i) =>
            botPlan({ kind: "level", level }, n, s, 7 + i, { shape: alg })
              .finishAt,
        );
        const target = BOT_TARGET_MS[n]?.[level] as number;
        const want = target + (fromSolved[level] as number);
        const got = mean(times);
        mixedRows.push(
          `| ${n}×${n} | ${name} | ${BOT_LEVEL_LABELS[level]} | ${sec(target)} | ${sec(fromSolved[level] as number)} | ${sec(got)} | ${sec(want)} | ${((got / want - 1) * 100).toFixed(0)}% |`,
        );
      }
    }
    console.log(`${n}×${n} 끝`);
  }
  const text = `# 모양 만들기 컴퓨터 bench\n\n맞춘 큐브에서: 판 ${SOLVED}개(씨앗만 다름) · 섞인 큐브에서: ${JSON.stringify(SCRAMBLED)}(섞기 씨앗 5000부터) · 시간은 초\n\n## 맞춘 큐브에서(평균)\n\n${solvedRows.join("\n")}\n\n## 섞인 큐브에서\n\n${mixedRows.join("\n")}\n`;
  console.log(text);
  writeFileSync(new URL("../bench-shape.md", import.meta.url), text);
});
