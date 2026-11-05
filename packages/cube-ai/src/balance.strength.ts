import { writeFileSync } from "node:fs";
import { randomCubeState } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { it } from "vitest";
import { type SolveMethod, solveHuman } from "./methods";
import { BASE_MEAN_MS, type BotPlanOptions, botPlan } from "./plan";
import { scrambledState } from "./scramble-test-util";
import {
  BOT_LEVEL_LABELS,
  BOT_LEVELS,
  BOT_TARGET_MS,
  type BotSkill,
  LEGACY_BOT_LEVELS,
} from "./skill";
import type { HumanSolve } from "./solve";

/**
 * 컴퓨터 단계 맞추기 bench(docs/47 10-1). 섞기 여러 개로 계획(`botPlan`)의 총 시간만 계산한다(기다리지 않는다).
 * 크기×단계마다 평균·10%·90%와 목표 대비, 배율 1 평균(`BASE_MEAN_MS`를 고칠 값), 옛 단계의 평균을 낸다.
 * 오래 걸려(5×5 축소법) 단위 시험에 넣지 않는다: `pnpm --filter @game/cube-ai bench`.
 * 섞기 수는 `CUBE_BENCH_N`(크기마다 "2:300,3:200,4:60,5:30" 꼴), 섞기 씨앗 시작은 `CUBE_BENCH_SEED`(기본 1000,
 * `BASE_MEAN_MS`를 잰 섞기)로 바꾼다. 결과는 `bench-result.md`
 */

const DEFAULT_N: Record<number, number> = { 2: 300, 3: 200, 4: 60, 5: 30 };

function counts(): Record<number, number> {
  const text = process.env.CUBE_BENCH_N;
  if (!text) return DEFAULT_N;
  const out = { ...DEFAULT_N };
  for (const part of text.split(",")) {
    const [k, v] = part.split(":").map(Number);
    if (k && v !== undefined && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function start(n: number, seed: number): PuzzleState {
  // 화면과 같다: 2×2·3×3은 무작위 상태, 4×4·5×5는 대회 규칙 무작위 수(docs/47 3절)
  if (n === 4) return scrambledState("444", seed);
  if (n === 5) return scrambledState("555", seed);
  return randomCubeState(n, seed);
}

function quantile(sorted: readonly number[], q: number): number {
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(q * (sorted.length - 1))),
  );
  return sorted[i] as number;
}

const sec = (ms: number) => (ms / 1000).toFixed(1);

it("컴퓨터 단계별 평균 시간", () => {
  const n0 = counts();
  const lines: string[] = [
    "| 크기 | 단계 | 목표 | 평균 | 10% | 90% | 가장 김 | 목표 대비 | 배율 1 평균(ms) | 지금 표 |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  const legacy: string[] = [
    "| 크기 | 옛 단계 | 평균 | 10% | 90% |",
    "|---|---|---|---|---|",
  ];
  for (const n of [2, 3, 4, 5]) {
    const k = n0[n] ?? 0;
    if (k <= 0) continue;
    const cache = new Map<string, HumanSolve>();
    const solve: NonNullable<BotPlanOptions["solve"]> = (
      method: SolveMethod,
      size,
      state,
    ) => {
      const key = `${method}:${state.perm.join(",")}:${state.twist.join(",")}`;
      let hit = cache.get(key);
      if (!hit) {
        hit = solveHuman(method, size, state);
        cache.set(key, hit);
      }
      return hit;
    };
    const from = Number(process.env.CUBE_BENCH_SEED ?? 1000);
    const starts = Array.from({ length: k }, (_, i) => start(n, from + i));
    for (const level of BOT_LEVELS) {
      const skill: BotSkill = { kind: "level", level };
      const times: number[] = [];
      const base: number[] = [];
      starts.forEach((s, i) => {
        times.push(botPlan(skill, n, s, 7 + i, { solve }).finishAt);
        base.push(botPlan(skill, n, s, 7 + i, { solve, scale: 1 }).finishAt);
      });
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const baseMean = base.reduce((a, b) => a + b, 0) / base.length;
      const target = BOT_TARGET_MS[n]?.[level] as number;
      lines.push(
        `| ${n}×${n} | ${BOT_LEVEL_LABELS[level]} | ${sec(target)} | ${sec(mean)} | ${sec(quantile(times, 0.1))} | ${sec(quantile(times, 0.9))} | ${sec(times.at(-1) as number)} | ${((mean / target - 1) * 100).toFixed(0)}% | ${Math.round(baseMean)} | ${BASE_MEAN_MS[n]?.[level]} |`,
      );
    }
    for (const level of LEGACY_BOT_LEVELS) {
      const times = starts
        .map(
          (s, i) =>
            botPlan({ kind: "legacy", level }, n, s, 7 + i, { solve }).finishAt,
        )
        .sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      legacy.push(
        `| ${n}×${n} | ${level} | ${sec(mean)} | ${sec(quantile(times, 0.1))} | ${sec(quantile(times, 0.9))} |`,
      );
    }
    console.log(`${n}×${n} 섞기 ${k}개 끝`);
  }
  const text = `# 큐브 컴퓨터 단계 bench\n\n섞기 수: ${JSON.stringify(n0)} · 섞기 씨앗 ${process.env.CUBE_BENCH_SEED ?? 1000}부터 · 시간은 초\n\n${lines.join("\n")}\n\n## 옛 단계(버전 없는 값)\n\n${legacy.join("\n")}\n`;
  console.log(text);
  writeFileSync(new URL("../bench-result.md", import.meta.url), text);
});
